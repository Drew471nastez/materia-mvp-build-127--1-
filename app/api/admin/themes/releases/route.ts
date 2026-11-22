import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { checkThemeZipSize } from "@/lib/themes/zip-rules"
import { PACKAGE_BUCKET, checkThemeZipSafety, isMissingRelation, listingRowBySlug, revalidateMarketplace } from "@/lib/themes/marketplace-server"
import { readTemplateLayer } from "@/lib/themes/template-packages"
import { manifestOf } from "@/lib/themes/release-merge"
import { BASE_TARGET, RELEASE_NOTES_MAX, isCodeTemplateSlug, isReleaseTarget, parseReleaseInput, releaseFamily, versionProblem, type ReleaseInput } from "@/lib/themes/releases-shared"
import {
  DEFAULT_CODE_PACKAGE,
  RELEASES_TABLE,
  RELEASE_PUBLIC_COLUMNS,
  RELEASE_SQL_MISSING,
  codePackageOf,
  convertFiles,
  layerOf,
  readReleaseRows,
  releaseUploadPath,
  rowToRelease,
  unzipLayer,
  wholeThemeFor,
  zipOf,
  type ReleaseRow,
} from "@/lib/themes/releases-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* A theme is composed, converted and hashed once here. */
export const maxDuration = 60

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * ===========================================================================
 *  A THEME'S RELEASES, FROM /admin/themes
 * ===========================================================================
 *  GET                         every release, unpublished ones too
 *  PUT    { target, size }     a signed upload address for a release's zip,
 *                              in the private bucket, at a path chosen here
 *  POST   { target, version, notes, source: "zip" | "code", path?, publish? }
 *                              a new release. From a zip the browser put at
 *                              `path`, or from the files the code has now
 *                              (Storelib's base and templates). Checked the
 *                              way a marketplace zip is (names, links, kinds,
 *                              the central archive check), made into a whole
 *                              theme and converted exactly as an import
 *                              converts it, and hashed: the manifest an
 *                              update tells a creator's edits by. A zip that
 *                              fails is deleted.
 *  PATCH  { id, published?, notes? }
 *                              publish, unpublish, or fix the notes
 *  DELETE ?id=…                remove a release that is not published
 *
 * target is "base" (the shared theme every template is made from) or a
 * listing's address. Publishing never touches a creator's website: each
 * creator sees Update available in their library and makes the updated copy
 * themselves. The admin cookie is checked first in every handler.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const { rows, missing, failed } = await readReleaseRows({ includeUnpublished: true, withFiles: true })
  if (failed) return NextResponse.json({ error: "The releases could not be read." }, { status: 500, headers: NO_STORE })
  const releases = rows.map((r) => ({ ...rowToRelease(r), layer: r.layer ?? "theme", files: r.files ?? 0 }))
  return NextResponse.json({ releases, missing, notice: missing ? RELEASE_SQL_MISSING : null }, { headers: NO_STORE })
}

async function targetExists(target: string): Promise<boolean> {
  if (target === BASE_TARGET || isCodeTemplateSlug(target)) return true
  const row = await listingRowBySlug(target, { includeHidden: true })
  return !!row && !row.builtin_theme_id
}

export async function PUT(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = (await req.json().catch(() => null)) as { target?: unknown; size?: unknown } | null
  if (!isReleaseTarget(body?.target) || !(await targetExists(body!.target as string))) return NextResponse.json({ error: "Choose the theme this release updates." }, { status: 400, headers: NO_STORE })
  const problem = checkThemeZipSize(Number(body?.size))
  if (problem) return NextResponse.json({ error: problem }, { status: 413, headers: NO_STORE })
  const path = releaseUploadPath(body!.target as string)
  const { data, error } = await createAdminClient().storage.from(PACKAGE_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.signedUrl) return adminFailure("theme release upload url", error ?? "no url", "Could not start the upload. Try again.")
  return NextResponse.json({ url: data.signedUrl, path }, { headers: NO_STORE })
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = parseReleaseInput(body)
  const admin = createAdminClient()
  const bucket = admin.storage.from(PACKAGE_BUCKET)
  const uploaded = typeof body?.path === "string" && body.path.startsWith("theme-releases/") ? body.path : null
  const drop = () => (uploaded ? bucket.remove([uploaded]).then(() => undefined, () => undefined) : Promise.resolve())
  const refuse = async (error: string, status: number) => {
    await drop()
    return NextResponse.json({ error }, { status, headers: NO_STORE })
  }
  if (parsed.ok === false) return refuse((parsed as { error: string }).error, 400)
  const input = (parsed as { value: ReleaseInput }).value
  if (!(await targetExists(input.target))) return refuse("No theme has this address.", 404)

  const { rows, missing, failed } = await readReleaseRows({ includeUnpublished: true, withFiles: true })
  if (missing) return refuse(RELEASE_SQL_MISSING, 503)
  if (failed) return refuse("The releases could not be read. Try again.", 500)
  const problem = versionProblem(input.target, input.version, rows.map(rowToRelease))
  if (problem) return refuse(problem, 409)

  /* The release's own files: the zip, or the code's layer for this target. */
  let files: Map<string, Buffer>
  if (input.source === "code") {
    files = readTemplateLayer(input.target === BASE_TARGET ? DEFAULT_CODE_PACKAGE : codePackageOf(input.target)!, input.target === BASE_TARGET ? "base" : "overlay")
  } else {
    const { data: blob, error: downloadErr } = await bucket.download(input.path!)
    if (downloadErr || !blob) return refuse("The upload did not arrive. Try again.", 400)
    const buf = Buffer.from(await blob.arrayBuffer())
    const safe = await checkThemeZipSafety(buf)
    if (safe.ok === false) return refuse((safe as { error: string }).error, 422)
    files = await unzipLayer(buf)
  }
  const layer = layerOf(files)
  if (layer === "overlay" && (input.target === BASE_TARGET || !isCodeTemplateSlug(input.target))) {
    return refuse("This zip has no layout/theme.liquid. Upload the whole theme.", 422)
  }

  /* The whole theme it makes, converted as an import converts it: a release that would not import is refused here, not on a creator's Update. */
  let converted: Awaited<ReturnType<typeof convertFiles>>
  try {
    converted = await convertFiles(await wholeThemeFor(input.target, files, rows))
  } catch (e) {
    return refuse(`The theme could not be read: ${e instanceof Error ? e.message.slice(0, 160) : "unknown"}`, 422)
  }
  if (converted.ok === false) return refuse((converted as { error: string }).error, 422)
  const manifest = manifestOf((converted as Extract<typeof converted, { ok: true }>).theme.files)

  /* From the code: the files as they are now, kept, so the release ships them whatever the code does next. */
  let packagePath = input.path
  if (input.source === "code") {
    packagePath = releaseUploadPath(input.target)
    const { error: upErr } = await bucket.upload(packagePath, await zipOf(files), { contentType: "application/zip", upsert: false })
    if (upErr) return adminFailure("theme release store", upErr, "The release's files were not stored. Try again.")
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from(RELEASES_TABLE)
    .insert({
      target: input.target,
      family: releaseFamily(input.target),
      version: input.version,
      notes: input.notes,
      source: input.source,
      layer,
      package_path: packagePath,
      manifest,
      files: files.size,
      published: input.publish,
      published_at: input.publish ? now : null,
      updated_at: now,
    })
    .select(`${RELEASE_PUBLIC_COLUMNS}, layer, files`)
    .maybeSingle()
  if (error || !data) {
    if (packagePath) await bucket.remove([packagePath]).catch(() => undefined)
    if (error?.code === "23505") return NextResponse.json({ error: `Version ${input.version} is already released.` }, { status: 409, headers: NO_STORE })
    if (isMissingRelation(error)) return NextResponse.json({ error: RELEASE_SQL_MISSING }, { status: 503, headers: NO_STORE })
    return adminFailure("theme release save", error ?? "no row", "The release was not saved. Try again.")
  }
  const saved = data as unknown as ReleaseRow
  await recordAdminAction(admin, { action: "theme_release_created", targetType: "platform", targetId: saved.id, targetLabel: `${input.target} ${input.version}`, detail: { source: input.source, layer, files: files.size, published: input.publish } })
  revalidateMarketplace()
  return NextResponse.json({ ok: true, release: { ...rowToRelease(saved), layer, files: files.size } }, { headers: NO_STORE })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = (await req.json().catch(() => null)) as { id?: unknown; published?: unknown; notes?: unknown } | null
  const id = typeof body?.id === "string" && UUID_RE.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: "No release has this id." }, { status: 400, headers: NO_STORE })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body?.published === "boolean") {
    patch.published = body.published
    patch.published_at = body.published ? new Date().toISOString() : null
  }
  if (typeof body?.notes === "string") {
    const notes = body.notes.replace(/\r\n?/g, "\n").trim().slice(0, RELEASE_NOTES_MAX)
    if (!notes) return NextResponse.json({ error: "Release notes cannot be empty." }, { status: 400, headers: NO_STORE })
    patch.notes = notes
  }
  const admin = createAdminClient()
  const { data, error } = await admin.from(RELEASES_TABLE).update(patch).eq("id", id).select(`${RELEASE_PUBLIC_COLUMNS}, layer, files`).maybeSingle()
  if (error) return adminFailure("theme release update", error, "The release was not changed.")
  if (!data) return NextResponse.json({ error: "No release has this id." }, { status: 404, headers: NO_STORE })
  const saved = data as unknown as ReleaseRow
  await recordAdminAction(admin, { action: typeof body?.published === "boolean" ? (body.published ? "theme_release_published" : "theme_release_unpublished") : "theme_release_notes", targetType: "platform", targetId: id, targetLabel: `${saved.target} ${saved.version}` })
  revalidateMarketplace()
  return NextResponse.json({ ok: true, release: { ...rowToRelease(saved), layer: saved.layer ?? "theme", files: saved.files ?? 0 } }, { headers: NO_STORE })
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "No release has this id." }, { status: 400, headers: NO_STORE })
  const admin = createAdminClient()
  /* A published release may be what a creator's website says it has: unpublish it first, and it stays on record. */
  const { data, error } = await admin.from(RELEASES_TABLE).delete().eq("id", id).eq("published", false).select("id, target, version, package_path").maybeSingle()
  if (error) return adminFailure("theme release delete", error, "The release was not removed.")
  if (!data) return NextResponse.json({ error: "Only a release that is not published can be removed." }, { status: 409, headers: NO_STORE })
  const gone = data as { id: string; target: string; version: string; package_path: string | null }
  if (gone.package_path) await admin.storage.from(PACKAGE_BUCKET).remove([gone.package_path]).catch(() => undefined)
  await recordAdminAction(admin, { action: "theme_release_removed", targetType: "platform", targetId: gone.id, targetLabel: `${gone.target} ${gone.version}` })
  revalidateMarketplace()
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
