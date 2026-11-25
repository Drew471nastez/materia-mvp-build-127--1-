import "server-only"
import { after } from "next/server"

/**
 * ===========================================================================
 *  TAKING A WEBSITE'S COVER, FROM ANYWHERE THAT MAKES ONE
 * ===========================================================================
 * The cover route photographed a website when the editor saved it or when
 * the website page noticed the picture was old. Nothing photographed a
 * website when it was CREATED, so a theme just added, imported or copied
 * sat under a drawing of the theme's sample shop ("Northwind", "Presets that
 * hit different") until somebody opened it and saved. That drawing had
 * nothing to do with the website.
 *
 * So the photographing lives here, and every route that creates a website
 * calls it once the website exists: add, import and duplicate, through
 * coverForNewWebsite below. A copy starts from its source's picture
 * (copyCover) and an import from the picture its package carried, stored
 * inside the request and handed back in its answer, so the new row shows
 * the site from its first frame. Without one, the photograph itself is
 * waited for, up to QUICK_COVER_MS; past that the answer says it is still
 * coming and the page asks for it until it is there.
 *
 * THE BROWSER HAS TO BE IN THE FUNCTION. @sparticuz/chromium reads its
 * binary from its own bin/ folder by path, which the build's tracing cannot
 * see, so next.config.mjs names every route that launches it. For a while
 * it named only the cover route, and every photograph taken here failed in
 * production with "the input directory does not exist": an import showed a
 * drawing until the Website page asked the cover route itself, a cold
 * browser launch and two page loads later. That was the 10 to 15 seconds.
 *
 * SCOPE. Callers have already proved the signed-in creator owns the install
 * and pass their own user and creator ids. The browser is only ever sent to
 * this deployment's own render page with a two-minute pass for the one
 * install (./cover-pass.ts); nothing a caller sends names a URL.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { mintCoverPass } from "./cover-pass"
import { isCompatInstall } from "./compat-site"
import { takeCoverShots } from "./cover-shot"
import { CoverUnavailable, browserKnownMissing, isBrowserMissing, noteBrowserMissing, templateCoverFallback } from "./template-cover"
import { MAX_BYTES as SNAPSHOT_MAX_BYTES } from "./snapshot"
import {
  SNAPSHOT_BUCKET,
  mobilePartner,
  snapshotFolder,
  snapshotName,
  snapshotTakenAt,
  snapshotsNewestFirst,
  staleSnapshots,
} from "./snapshot"

/** Not photographed again within this long of the last picture. */
export const MIN_GAP_MS = 20_000

export interface CoverResult {
  url: string
  mobile_url: string | null
  updated_at: string | null
  fresh: boolean
  ms?: number
}

export interface CoverOwner {
  installId: string
  userId: string
  creatorId: string
}

/**
 * Where the render page is. The deployment's own origin when that is one of
 * ours (production, a local server) and the main domain otherwise. Never a
 * host taken on trust: this is where a browser holding a pass is about to go.
 */
export function renderOrigin(requestUrl: string): string {
  const main = getMainDomain()
  const u = new URL(requestUrl)
  const host = u.hostname
  if (host === "localhost" || host === "127.0.0.1") return u.origin
  if (host === main || host === `www.${main}`) return `https://${host}`
  return `https://${main}`
}

function bucketOf() {
  return createAdminClient().storage.from(SNAPSHOT_BUCKET)
}

async function record(owner: CoverOwner, url: string, at: string) {
  const { error } = await createAdminClient()
    .from("store_theme_installs")
    .update({ snapshot_url: url, snapshot_updated_at: at })
    .eq("id", owner.installId)
    .eq("creator_id", owner.creatorId)
  if (error && !/snapshot_url|snapshot_updated_at/.test(error.message)) console.warn("[cover] could not record the cover:", error.message)
}

async function prune(folder: string) {
  try {
    const bucket = bucketOf()
    const { data } = await bucket.list(folder, { limit: 100 })
    const stale = staleSnapshots((data ?? []).map((f) => f.name)).map((name) => `${folder}/${name}`)
    if (stale.length) await bucket.remove(stale)
  } catch {
    /* the next cover prunes */
  }
}

/** Store a desktop and phone picture pair as the install's newest cover. */
export async function storeCover(owner: CoverOwner, desktop: Buffer, mobile: Buffer | null): Promise<CoverResult> {
  const bucket = bucketOf()
  const folder = snapshotFolder(owner.userId, owner.installId)
  const stamp = Date.now().toString(36)
  const desktopName = snapshotName(stamp, "webp")
  const mobileName = snapshotName(stamp, "webp", true)
  const upload = (name: string, bytes: Buffer) =>
    bucket.upload(`${folder}/${name}`, bytes, { contentType: "image/webp", upsert: false, cacheControl: "31536000" })
  const [d, m] = await Promise.all([upload(desktopName, desktop), mobile ? upload(mobileName, mobile) : Promise.resolve({ error: new Error("none") })])
  if (d.error) throw new Error(`upload failed: ${d.error.message}`)
  const url = bucket.getPublicUrl(`${folder}/${desktopName}`).data.publicUrl
  const mobileUrl = m.error ? null : bucket.getPublicUrl(`${folder}/${mobileName}`).data.publicUrl
  const at = new Date().toISOString()
  await record(owner, url, at)
  await prune(folder)
  return { url, mobile_url: mobileUrl, updated_at: at, fresh: true }
}

/**
 * Photograph the website's saved home page and keep the pictures. Within
 * MIN_GAP_MS of the last cover the last one is returned instead, unless
 * `force`: a website that was created a moment ago from a copied or
 * packaged picture is photographed for real regardless.
 */
export async function takeCover(owner: CoverOwner, origin: string, opts: { force?: boolean } = {}): Promise<CoverResult> {
  const bucket = bucketOf()
  const folder = snapshotFolder(owner.userId, owner.installId)
  if (!opts.force) {
    const { data: existing } = await bucket.list(folder, { limit: 100 })
    const names = (existing ?? []).map((f) => f.name)
    const newest = snapshotsNewestFirst(names)[0]
    const newestAt = newest ? Date.parse(snapshotTakenAt(newest) ?? "") : 0
    if (newest && Date.now() - newestAt < MIN_GAP_MS) {
      const phone = mobilePartner(newest, names)
      return {
        url: bucket.getPublicUrl(`${folder}/${newest}`).data.publicUrl,
        mobile_url: phone ? bucket.getPublicUrl(`${folder}/${phone}`).data.publicUrl : null,
        updated_at: snapshotTakenAt(newest),
        fresh: false,
      }
    }
  }
  const pass = mintCoverPass(owner.installId)
  /* An imported Shopify theme is drawn by its own engine (lib/website-builder/compat-site.ts). */
  const compat = await isCompatInstall(owner.installId)
  const page = compat ? `${origin}/api/site-theme/cover/${encodeURIComponent(pass)}` : `${origin}/cover-render/${encodeURIComponent(pass)}`
  /* Round 27: a server that found no browser does not try to start one again for a while (./template-cover.ts). */
  if (browserKnownMissing()) throw new CoverUnavailable()
  let shots: Awaited<ReturnType<typeof takeCoverShots>>
  try {
    shots = await takeCoverShots(page)
  } catch (e) {
    if (isBrowserMissing(e)) noteBrowserMissing()
    throw e
  }
  const result = await storeCover(owner, shots.desktop, shots.mobile)
  return { ...result, ms: shots.ms }
}

/**
 * A copy starts with its source's picture, so its card is right the moment
 * it appears. Both installs belong to the same user, so both folders are
 * under that user's own prefix.
 */
export async function copyCover(userId: string, fromInstallId: string, to: CoverOwner): Promise<CoverResult | null> {
  try {
    const bucket = bucketOf()
    const from = snapshotFolder(userId, fromInstallId)
    const { data } = await bucket.list(from, { limit: 100 })
    const names = (data ?? []).map((f) => f.name)
    const newest = snapshotsNewestFirst(names)[0]
    if (!newest) return null
    const phone = mobilePartner(newest, names)
    const read = async (name: string) => {
      const { data: blob } = await bucket.download(`${from}/${name}`)
      return blob ? Buffer.from(await blob.arrayBuffer()) : null
    }
    const desktop = await read(newest)
    if (!desktop) return null
    return await storeCover(to, desktop, phone ? await read(phone) : null)
  } catch {
    return null
  }
}

/** The install's newest cover as it is in its folder, without taking one. Null when it has none yet. */
export async function newestCover(owner: Pick<CoverOwner, "userId" | "installId">): Promise<CoverResult | null> {
  const bucket = bucketOf()
  const folder = snapshotFolder(owner.userId, owner.installId)
  const { data } = await bucket.list(folder, { limit: 100 })
  const names = (data ?? []).map((f) => f.name)
  const newest = snapshotsNewestFirst(names)[0]
  if (!newest) return null
  const phone = mobilePartner(newest, names)
  return {
    url: bucket.getPublicUrl(`${folder}/${newest}`).data.publicUrl,
    mobile_url: phone ? bucket.getPublicUrl(`${folder}/${phone}`).data.publicUrl : null,
    updated_at: snapshotTakenAt(newest),
    fresh: false,
  }
}

/**
 * How long a request that makes a website waits for its first photograph.
 * Long enough for a warm browser and two page loads; a cold one that takes
 * longer finishes after the answer, and the page asks until it is there.
 */
export const QUICK_COVER_MS = 8_000

/** What an answer that made a website says about its picture. */
export interface NewWebsiteCover {
  /** The picture to show from the row's first frame, when there is one. */
  cover: { url: string; mobile_url: string | null; updated_at: string } | null
  /** No picture yet, and one is being taken: the page asks for it until it arrives. */
  cover_pending: boolean
}

/**
 * Photograph the new website, waiting up to `ms` for it. When it is slower
 * than that, the rest of it runs after the answer (`after`), and the answer
 * says the picture is on its way. A photograph that fails is logged, never
 * thrown: the website was made either way.
 */
export async function coverWithin(owner: CoverOwner, origin: string, label: string, ms = QUICK_COVER_MS): Promise<NewWebsiteCover> {
  const fail = (e: unknown) => {
    console.error(`[cover] ${label}: could not take the cover:`, e instanceof Error ? e.message : e)
    return null
  }
  const shot = takeCover(owner, origin, { force: true }).then((c) => c, fail)
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), ms)
  })
  const first = await Promise.race([shot, late])
  clearTimeout(timer)
  if (first === "late") {
    after(() => shot.then(() => undefined))
    return { cover: null, cover_pending: true }
  }
  return { cover: answerOf(first), cover_pending: false }
}

function answerOf(c: CoverResult | null): NewWebsiteCover["cover"] {
  return c?.url ? { url: c.url, mobile_url: c.mobile_url, updated_at: c.updated_at ?? new Date().toISOString() } : null
}

/**
 * ===========================================================================
 *  A NEW WEBSITE'S FIRST PICTURE, IN THE ANSWER THAT MADE IT
 * ===========================================================================
 * In order of what looks most like the site from its first frame:
 *
 *   1. the picture it came with (a package's cover, a copy's source), stored
 *      in the request by the caller and passed in as `start`; a photograph of
 *      the new website itself follows after the answer;
 *   2. otherwise a photograph taken now, when it takes under QUICK_COVER_MS;
 *   3. otherwise nothing yet, said as `cover_pending`, and the page shows the
 *      site's name on a plain surface until the photograph arrives.
 *
 * Never a drawing of a page with a headline and colours the site does not
 * have.
 */
export async function coverForNewWebsite(owner: CoverOwner, origin: string, label: string, start: CoverResult | null): Promise<NewWebsiteCover> {
  if (start?.url) {
    after(() => coverAfterCreate(owner, origin, label))
    return { cover: answerOf(start), cover_pending: false }
  }
  return coverWithin(owner, origin, label)
}

/**
 * Run after a route has answered: never throws, and says in the log when a
 * picture could not be taken, so a cover that silently never arrives is not
 * how anyone finds out.
 */
export async function coverAfterCreate(owner: CoverOwner, origin: string, label: string): Promise<void> {
  try {
    await takeCover(owner, origin, { force: true })
  } catch (e) {
    console.error(`[cover] ${label}: could not take the cover:`, e instanceof Error ? e.message : e)
    /* Round 27: no photograph, and a website from one of Storelib's templates with no picture yet: the template's own. */
    if (isBrowserMissing(e)) await templateCoverOf(owner, origin)
  }
}

/** The template's picture as the website's cover when it was added from one and has none yet (./template-cover.ts). Null otherwise. */
export async function templateCoverOf(owner: CoverOwner, origin: string): Promise<CoverResult | null> {
  return templateCoverFallback<CoverResult>({
    settings: async () => {
      const { data } = await createAdminClient().from("store_theme_settings").select("settings").eq("install_id", owner.installId).maybeSingle()
      return (data as { settings?: unknown } | null)?.settings ?? null
    },
    newest: () => newestCover(owner),
    store: (desktop, phone) => storeCover(owner, desktop, phone),
    origin,
    maxBytes: SNAPSHOT_MAX_BYTES,
  })
}

/** A picture from a package: WebP by its magic bytes and no larger than a cover can be. */
export function isPackagedCover(bytes: Uint8Array, maxBytes: number): boolean {
  if (bytes.byteLength < 16 || bytes.byteLength > maxBytes) return false
  const tag = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  return tag(0, 4) === "RIFF" && tag(8, 12) === "WEBP"
}
