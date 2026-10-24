/**
 * POST  GitHub's webhook for the Storelib app.
 *
 *   push                          a linked branch changed: sync its section files
 *   installation (deleted)        the app was removed: unlink every site it served
 *   installation (suspend)        the app was suspended: every site it serves says so
 *   installation_repositories     a repository was taken away: unlink sites on it
 *   ping                          GitHub checking the address works
 *
 * The signature is checked against the exact bytes GitHub sent, before the
 * body is parsed, and a missing secret refuses everything. GitHub waits ten
 * seconds for an answer, so the answer goes first and the work is done after
 * it, in the same function (`after`), which a push of a few files finishes
 * well inside. The outcome is reported on the commit itself as a status.
 */
import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { githubConfig } from "@/lib/github-sync/github"
import { verifySignature, type PushPayload } from "@/lib/github-sync/core"
import { applyPush } from "@/lib/github-sync/sync"
import { seenDelivery, validDeliveryId } from "@/lib/github-sync/deliveries"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** A push's JSON, generously. GitHub caps its own payloads at 25 MB; a push with no diff is small. */
const MAX_BODY = 5_000_000
/** A push's work after the answer: under maxDuration, so the function always ends on its own. */
const PUSH_LIMIT_MS = 56_000

export async function POST(req: Request) {
  const cfg = githubConfig()
  if (!cfg) return NextResponse.json({ error: "Not configured" }, { status: 503 })

  /* Refused on its declared size before a byte is read, then measured again. */
  if (Number(req.headers.get("content-length")) > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 })
  const raw = await req.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 })
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), cfg.webhookSecret)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 })
  }

  const event = req.headers.get("x-github-event") ?? ""
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 })
  }

  if (event === "ping") return NextResponse.json({ ok: true })

  const db = createAdminClient()

  /* Each delivery once: a redelivered or replayed one (validly signed, but old) changes nothing (lib/github-sync/deliveries.ts). */
  const delivery = req.headers.get("x-github-delivery")
  if (validDeliveryId(delivery) && (await seenDelivery(db, delivery))) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  if (event === "installation" && body.action === "deleted") {
    const id = Number((body.installation as { id?: number } | undefined)?.id)
    if (Number.isSafeInteger(id)) await db.from("theme_github_links").delete().eq("installation_id", id)
    return NextResponse.json({ ok: true })
  }

  /* Suspended on GitHub: nothing syncs until it is unsuspended, and the card says so and how. */
  if (event === "installation" && (body.action === "suspend" || body.action === "unsuspend")) {
    const id = Number((body.installation as { id?: number } | undefined)?.id)
    if (Number.isSafeInteger(id)) {
      await db
        .from("theme_github_links")
        .update({
          last_error: body.action === "suspend" ? "The Storelib app is suspended on your GitHub account, so nothing syncs. Unsuspend it on GitHub under Settings, Applications, Storelib." : null,
          updated_at: new Date().toISOString(),
        })
        .eq("installation_id", id)
    }
    return NextResponse.json({ ok: true })
  }

  if (event === "installation_repositories" && body.action === "removed") {
    const gone = ((body.repositories_removed as { id?: number }[] | undefined) ?? []).map((r) => Number(r.id)).filter(Number.isSafeInteger).slice(0, 1000)
    const installation = Number((body.installation as { id?: number } | undefined)?.id)
    if (gone.length && Number.isSafeInteger(installation)) {
      /* Only the links that reached it through THIS installation. */
      await db
        .from("theme_github_links")
        .update({ repo_id: null, repo_full_name: null, branch: null, last_error: "Storelib can no longer reach this repository. Give the Storelib app access to it again on GitHub, or pick another one.", updated_at: new Date().toISOString() })
        .eq("installation_id", installation)
        .in("repo_id", gone)
    }
    return NextResponse.json({ ok: true })
  }

  if (event === "push") {
    const payload = body as PushPayload
    after(async () => {
      try {
        /* Ends before Vercel's limit (maxDuration) with a line that says so, instead of a platform timeout with none. */
        let stop: ReturnType<typeof setTimeout> | undefined
        const outcomes = await Promise.race([
          applyPush(db, cfg, payload),
          new Promise<never>((_, reject) => {
            stop = setTimeout(() => reject(new Error(`still running after ${PUSH_LIMIT_MS / 1000}s, stopped before the platform limit`)), PUSH_LIMIT_MS)
          }),
        ]).finally(() => clearTimeout(stop))
        const saved = outcomes.reduce((n, o) => n + o.saved.length, 0)
        const failed = outcomes.reduce((n, o) => n + o.failed.length, 0)
        /* Counts only: no file text, no token, no address. */
        if (outcomes.length) console.log(`[github/webhook] push to ${payload.repository?.full_name}: ${saved} saved, ${failed} refused`)
      } catch (e) {
        console.error("[github/webhook] push failed:", e instanceof Error ? e.message : "unknown")
      }
    })
    return NextResponse.json({ ok: true }, { status: 202 })
  }

  return NextResponse.json({ ok: true, ignored: event })
}
