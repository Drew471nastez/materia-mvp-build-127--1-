import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isThemeId } from "@/lib/website-builder/theme-registry"
import { getMainDomain } from "@/lib/url-helpers"
import { mintCoverPass } from "@/lib/website-builder/cover-pass"
import { takeCoverShots } from "@/lib/website-builder/cover-shot"
import {
  SNAPSHOT_BUCKET as BUCKET,
  snapshotFolder,
  snapshotName,
  snapshotsNewestFirst,
  snapshotTakenAt,
  mobilePartner,
  staleSnapshots,
} from "@/lib/website-builder/snapshot"

/**
 * ===========================================================================
 *  POST /api/website-builder/themes/[installId]/cover
 * ===========================================================================
 * Take the website's cover: open its saved home page in a real browser on
 * the server, photograph it at a laptop's width and a phone's, and keep the
 * pictures in the install's snapshot folder, where the website page finds
 * them. The editor asks for this a little while after a save has settled,
 * and the website page asks when the cover it has is older than the site.
 *
 * Scope: the signed-in user's creator must own the install, as on every
 * install route. The browser is sent to THIS deployment's own render page
 * with a two-minute pass for this one install; nothing in the request names
 * a URL, so there is nothing here to point it anywhere else.
 *
 * Cost: a browser launch and two page loads, a few seconds on a function.
 * Not repeated within MIN_GAP_MS of the last cover — two tabs, a double
 * save, a page refreshed twice all get the picture that already exists.
 *
 * Failure keeps the last cover. A cover is a convenience; nothing about the
 * website depends on it, and nothing here can change the website.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** A cold browser launch plus two page loads, with room to spare. */
export const maxDuration = 60

const MIN_GAP_MS = 20_000

type Params = { params: Promise<{ installId: string }> }

/**
 * Where the render page is. The deployment's own origin when that is one of
 * ours — production, a local server — and the main domain otherwise. Never
 * a host taken on trust: the Host header is the caller's to write, and this
 * address is where a browser holding a pass is about to go.
 */
function renderOrigin(req: Request): string {
  const main = getMainDomain()
  const u = new URL(req.url)
  const host = u.hostname
  if (host === "localhost" || host === "127.0.0.1") return u.origin
  if (host === main || host === `www.${main}`) return `https://${host}`
  return `https://${main}`
}

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  if (!isThemeId(installId)) return NextResponse.json({ error: "Invalid install id" }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
    .maybeSingle()
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  const admin = createAdminClient()
  const bucket = admin.storage.from(BUCKET)
  const folder = snapshotFolder(user.id, installId)
  const publicUrl = (name: string) => bucket.getPublicUrl(`${folder}/${name}`).data.publicUrl

  /* The one just taken, if there is one: answer with it rather than launch a
     browser to take the same picture again. */
  const { data: existing } = await bucket.list(folder, { limit: 100 })
  const names = (existing ?? []).map((f) => f.name)
  const newest = snapshotsNewestFirst(names)[0]
  const newestAt = newest ? Date.parse(snapshotTakenAt(newest) ?? "") : 0
  if (newest && Date.now() - newestAt < MIN_GAP_MS) {
    const phone = mobilePartner(newest, names)
    return NextResponse.json({
      url: publicUrl(newest),
      mobile_url: phone ? publicUrl(phone) : null,
      updated_at: snapshotTakenAt(newest),
      fresh: false,
    })
  }

  let shots
  try {
    const pass = mintCoverPass(installId)
    shots = await takeCoverShots(`${renderOrigin(req)}/cover-render/${encodeURIComponent(pass)}`)
  } catch (e) {
    /* Said out loud: a cover that silently never arrives is how this went
       unnoticed for a week the last time. */
    console.error("[cover] could not take the screenshots:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "The cover could not be taken" }, { status: 502 })
  }

  const stamp = Date.now().toString(36)
  const desktopName = snapshotName(stamp, "webp")
  const mobileName = snapshotName(stamp, "webp", true)
  const upload = (name: string, bytes: Buffer) =>
    bucket.upload(`${folder}/${name}`, bytes, { contentType: "image/webp", upsert: false, cacheControl: "31536000" })
  const [d, m] = await Promise.all([upload(desktopName, shots.desktop), upload(mobileName, shots.mobile)])
  if (d.error) {
    console.error("[cover] upload failed:", d.error.message)
    return NextResponse.json({ error: d.error.message }, { status: 500 })
  }

  const url = publicUrl(desktopName)
  const mobileUrl = m.error ? null : publicUrl(mobileName)
  const updatedAt = new Date().toISOString()

  /* Recorded when the columns exist; the folder is the record either way. */
  const { error: rowErr } = await admin
    .from("store_theme_installs")
    .update({ snapshot_url: url, snapshot_updated_at: updatedAt })
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
  if (rowErr && !/snapshot_url|snapshot_updated_at/.test(rowErr.message)) {
    console.warn("[cover] could not record the cover:", rowErr.message)
  }

  after(async () => {
    try {
      const { data: files } = await bucket.list(folder, { limit: 100 })
      const stale = staleSnapshots((files ?? []).map((f) => f.name)).map((name) => `${folder}/${name}`)
      if (stale.length) await bucket.remove(stale)
    } catch {}
  })

  return NextResponse.json({ url, mobile_url: mobileUrl, updated_at: updatedAt, fresh: true, ms: shots.ms })
}
