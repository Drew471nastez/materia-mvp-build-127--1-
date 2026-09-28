import { NextResponse, type NextRequest } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { logSecurityEvent, recentSecurityEvents, securityCounts } from "@/lib/security/uploads/audit"
import { inspectUpload, type UploadVerdict } from "@/lib/security/uploads/inspect"
import { nodeInflateRaw } from "@/lib/security/uploads/zip-inflate"
import { ARCHIVE_LIMITS, formatLimit, MAX_UPLOAD_BYTES, UPLOAD_CONTEXTS, type UploadContext } from "@/lib/security/uploads/policy"
import { activeProviders, providerStatus, type ProviderVerdict } from "@/lib/security/uploads/providers"
import { SAMPLES } from "@/lib/security/uploads/samples"
import { inspectStoredObject } from "@/lib/security/uploads/stored"
import { SIGNED_DOWNLOAD_SECONDS } from "@/lib/storage/download"
import { storedObjectSize } from "@/lib/storage/upload-guard"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  /api/admin/security: FILE SECURITY, FOR THE OWNER
 * ===========================================================================
 * Read by /admin/security. Admin session only, checked first in every handler.
 *
 *   GET                  which checks are on (the built-in ones always; a
 *                        malware engine only when SECURITY_MALWARE_PROVIDER
 *                        names one, which is not the normal state), counts
 *                        for the last day and week, files by state, download
 *                        links handed out, and the log, filtered by
 *                        ?event= ?outcome= ?code= and paged by ?before=.
 *   POST ?mode=sample    { id }: runs the central check on one of the built-in
 *                        samples (lib/security/uploads/samples.ts): EICAR, a
 *                        program renamed .pdf, a zip bomb, a zip slip...
 *   POST ?mode=upload    the request body as a file (header x-file-name,
 *                        x-context). Nothing is stored. Vercel caps a request
 *                        at about 4.5 MB.
 *   POST ?mode=object    { bucket, path, context }: a file already in storage,
 *                        read by Range as an upload would be. Changes nothing.
 *
 * Every test is written to the log as "admin_test", never over a product
 * file's own status. This is the only place the checks' internals are shown.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const NO_STORE = { "Cache-Control": "no-store" }
const UPLOAD_TEST_MAX_BYTES = 4 * 1024 * 1024
const BUCKET = /^[a-z0-9][a-z0-9._-]{0,62}$/

function contextOf(value: unknown): UploadContext {
  return (UPLOAD_CONTEXTS as readonly string[]).includes(String(value)) ? (value as UploadContext) : "product_file"
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const admin = createAdminClient()
    const q = request.nextUrl.searchParams
    const assets = (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) =>
      Promise.resolve(build(base())).then(({ count, error }) => (error ? null : (count ?? 0)))
    function base() {
      return admin.from("digital_assets").select("id", { count: "exact", head: true })
    }
    const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
    const downloads = (days: number) =>
      Promise.resolve(admin.from("download_events").select("id", { count: "exact", head: true }).gte("created_at", since(days))).then(({ count, error }) => (error ? null : (count ?? 0)))

    const [log, counts, blocked, unchecked, checked, dlDay, dlWeek] = await Promise.all([
      recentSecurityEvents(admin, { event: q.get("event"), outcome: q.get("outcome"), code: q.get("code"), before: q.get("before"), limit: 50 }),
      securityCounts(admin),
      assets((b) => b.in("scan_status", ["blocked", "infected", "quarantined"])),
      assets((b) => b.or("scan_status.is.null,scan_status.in.(pending_scan,scanning)").or("upload_status.is.null,upload_status.eq.completed")),
      assets((b) => b.eq("scan_result->>engine", "builtin")),
      downloads(1),
      downloads(7),
    ])

    return NextResponse.json(
      {
        checks: {
          builtin: [
            "File signature against name and declared type",
            "Programs and launchers refused, disguised ones too",
            "Scripts and web pages behind a document's name",
            "EICAR test file",
            "ZIP contents: bombs, ../ paths, launchers inside",
            "Name cleaned for storage and download",
            "Size limit per kind of upload",
          ],
          provider: providerStatus(),
          limits: Object.fromEntries(Object.entries(MAX_UPLOAD_BYTES).map(([k, v]) => [k, formatLimit(v)])),
          archive: { entries: ARCHIVE_LIMITS.product.maxEntries, unpacked: formatLimit(ARCHIVE_LIMITS.product.maxTotalUncompressed), ratio: ARCHIVE_LIMITS.product.maxEntryRatio },
          signedUrlSeconds: SIGNED_DOWNLOAD_SECONDS,
        },
        counts,
        files: { blocked, unchecked, checked },
        downloads: { day: dlDay, week: dlWeek },
        samples: SAMPLES.map((s) => ({ id: s.id, label: s.label, fileName: s.fileName, expect: s.expect })),
        log: log.rows,
        logUnavailable: log.unavailable ?? counts.unavailable ?? null,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    return adminFailure("security", error, "The security page could not be read.")
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const mode = request.nextUrl.searchParams.get("mode")
  try {
    const admin = createAdminClient()
    const t0 = Date.now()
    let verdict: UploadVerdict
    let label: string
    let bytes: Uint8Array | null = null
    let context: UploadContext = "product_file"
    let where: { bucket: string; path: string } | null = null

    if (mode === "sample") {
      const input = (await request.json().catch(() => null)) as { id?: unknown; context?: unknown } | null
      const sample = SAMPLES.find((s) => s.id === input?.id)
      if (!sample) return NextResponse.json({ error: "Unknown sample." }, { status: 400, headers: NO_STORE })
      context = contextOf(input?.context)
      bytes = sample.bytes()
      label = sample.fileName
    } else if (mode === "upload") {
      const size = Number(request.headers.get("content-length"))
      if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Choose a file." }, { status: 400, headers: NO_STORE })
      if (size > UPLOAD_TEST_MAX_BYTES) {
        return NextResponse.json({ error: "Files over 4 MB cannot pass through Vercel here. Upload it to storage and check it by bucket and path." }, { status: 413, headers: NO_STORE })
      }
      context = contextOf(request.headers.get("x-context"))
      bytes = new Uint8Array(await request.arrayBuffer())
      label = decodeURIComponent(request.headers.get("x-file-name") ?? "upload").slice(0, 200)
    } else if (mode === "object") {
      const input = (await request.json().catch(() => null)) as { bucket?: unknown; path?: unknown; context?: unknown } | null
      const bucket = typeof input?.bucket === "string" ? input.bucket.trim() : ""
      const path = typeof input?.path === "string" ? input.path.trim().replace(/^\/+/, "") : ""
      if (!BUCKET.test(bucket) || !path || path.length > 512 || path.split("/").some((p) => p === ".." || p === "")) {
        return NextResponse.json({ error: "Give a bucket name and the file's path inside it." }, { status: 400, headers: NO_STORE })
      }
      context = contextOf(input?.context)
      const size = await storedObjectSize(admin, bucket, path)
      if (size === null) return NextResponse.json({ error: "There is no file at that path." }, { status: 404, headers: NO_STORE })
      where = { bucket, path }
      label = path.split("/").pop() || path
      verdict = await inspectStoredObject(admin, where, { fileName: path, size, context })
    } else {
      return NextResponse.json({ error: "Unknown test." }, { status: 400, headers: NO_STORE })
    }

    if (bytes) {
      const b = bytes
      verdict = await inspectUpload({
        fileName: label,
        size: b.byteLength,
        head: b.subarray(0, 8192),
        tail: { bytes: b.subarray(Math.max(0, b.byteLength - 70_000)), start: Math.max(0, b.byteLength - 70_000) },
        readRange: async (s, e) => b.subarray(s, e + 1),
        /* An archive's declared sizes tested, not believed (lib/security/uploads/zip.ts). */
        inflate: nodeInflateRaw,
        context,
      })
    }

    /* A switched-on engine is asked too, so the owner can see it answer. */
    const engines: ProviderVerdict[] = []
    for (const p of activeProviders()) {
      engines.push(await p.scan({ fileName: label, context, size: bytes?.byteLength ?? null, ...(bytes ? { bytes } : where ? { stored: { admin, ...where } } : {}), ref: "admin:test", deadlineMs: 40_000 }))
    }

    const result = { verdict: verdict!, engines, durationMs: Date.now() - t0 }
    await logSecurityEvent(admin, {
      event: "admin_test",
      outcome: "info",
      context,
      code: verdict!.ok ? "accepted" : verdict!.code,
      bucket: where?.bucket ?? null,
      path: where?.path ?? null,
      fileName: verdict!.safeName,
      bytes: bytes?.byteLength ?? null,
      detectedType: verdict!.detectedType,
      detail: { found: verdict!.detail || null, notes: verdict!.notes, engines },
    })
    return NextResponse.json({ result, label }, { headers: NO_STORE })
  } catch (error) {
    return adminFailure("security test", error, "The test could not run.")
  }
}
