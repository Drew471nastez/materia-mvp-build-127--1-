import "server-only"

import { lookup } from "node:dns/promises"
import net from "node:net"
import { fetchPublic } from "@/lib/api/public-fetch"
import { preparePublicImage } from "@/lib/storage/public-image"
import { normalizeBlocks } from "./editor-model"
import { COPY_IMAGE_MAX_BYTES, COPY_IMAGE_MAX_REDIRECTS, COPY_IMAGE_TIMEOUT_MS, addressesProblem, copyImageUrlProblem, imageContentProblem } from "./copy-image-guard"
import { externalImagesOf, replaceImageUrls, type PostImageFields } from "./external-images"
import { storeBlogPicture } from "./image-store"
import { readAdminPost, type Supa } from "./admin-store"

/**
 * ===========================================================================
 *  COPY TO STORELIB: A PICTURE FROM ANOTHER SITE, STORED AS STORELIB'S OWN
 * ===========================================================================
 * Downloads one picture under every rule in ./copy-image-guard.ts, runs it
 * through the same check every public picture takes (lib/storage/public-image:
 * a raster picture by its bytes, at most 50 megapixels, location and camera
 * details removed) and stores it where the editor's uploads go
 * (./image-store.ts). Answers the new address, storelib.com/media/....
 *
 * `copyPostImages` does it for every picture of one post (its cover, share
 * image and picture blocks, live and draft alike), one at a time, and swaps
 * the addresses in place: the bulk action on /admin/blog.
 */

export type CopyResult = { ok: true; url: string } | { ok: false; error: string }

/** How a download is made; the tests hand in their own. */
export interface CopyDeps {
  resolve: (host: string) => Promise<string[]>
  fetch: typeof fetchPublic
  store: typeof storeBlogPicture
}

const DEFAULT_DEPS: CopyDeps = {
  resolve: async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address),
  fetch: fetchPublic,
  store: storeBlogPicture,
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out")), ms)
    work.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    )
  })
}

/** The picture at `raw`, checked, or why not. Stores nothing. */
export async function downloadExternalImage(raw: string, deps: Pick<CopyDeps, "resolve" | "fetch"> = DEFAULT_DEPS): Promise<{ ok: true; bytes: Uint8Array; mime: string; ext: string } | { ok: false; error: string }> {
  const problem = copyImageUrlProblem(raw)
  if (problem) return { ok: false, error: problem }
  const url = new URL(raw.trim())
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1")
  if (!net.isIP(host)) {
    let addresses: string[] = []
    try {
      addresses = await withDeadline(deps.resolve(host), COPY_IMAGE_TIMEOUT_MS)
    } catch {
      return { ok: false, error: "That site's name does not resolve." }
    }
    const refused = addressesProblem(addresses)
    if (refused) return { ok: false, error: refused }
  }
  let res: Response
  try {
    /* The socket checks each address again as it connects, and each of at most three redirects is checked from the start (https too). */
    res = await withDeadline(deps.fetch(url.toString(), { maxBytes: COPY_IMAGE_MAX_BYTES, timeoutMs: COPY_IMAGE_TIMEOUT_MS, maxRedirects: COPY_IMAGE_MAX_REDIRECTS, httpsOnly: true }), COPY_IMAGE_TIMEOUT_MS)
  } catch (e) {
    const m = String((e as Error)?.message ?? "")
    if (/larger than allowed/.test(m)) return { ok: false, error: "That picture is over 10 MB." }
    if (/timed out/.test(m)) return { ok: false, error: "That site took more than 10 seconds to answer." }
    if (/Too many redirects/.test(m)) return { ok: false, error: "That address redirects too many times." }
    if (/not https/.test(m)) return { ok: false, error: "That address redirects to one that is not https." }
    if (/Refused|EPRIVATE|public address/.test(m)) return { ok: false, error: "That address leads somewhere that is not on the public internet." }
    return { ok: false, error: "That site could not be reached." }
  }
  if (res.status !== 200) return { ok: false, error: `That site answered ${res.status}.` }
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length > COPY_IMAGE_MAX_BYTES) return { ok: false, error: "That picture is over 10 MB." }
  const content = imageContentProblem(res.headers.get("content-type"), bytes.subarray(0, 4096))
  if ("problem" in content) return { ok: false, error: content.problem }
  const picture = preparePublicImage(bytes, COPY_IMAGE_MAX_BYTES)
  if ("error" in picture) return { ok: false, error: picture.error }
  return { ok: true, bytes: picture.bytes, mime: picture.mime, ext: picture.ext }
}

/** Download, check and store one picture: its new address on Storelib, or why not. */
export async function copyExternalImage(raw: string, deps: CopyDeps = DEFAULT_DEPS): Promise<CopyResult> {
  const got = await downloadExternalImage(raw, deps)
  if ("error" in got) return { ok: false, error: got.error }
  const stored = await deps.store(got, { media: true })
  if ("error" in stored) {
    console.error("[admin] blog copy image: storage:", String(stored.error?.message ?? "").slice(0, 200))
    return { ok: false, error: "The picture could not be stored. Nothing was changed." }
  }
  return { ok: true, url: stored.url }
}

export interface PostCopyReport {
  id: string
  title: string
  copied: number
  failed: { url: string; error: string }[]
  /** No picture on another site. */
  none?: boolean
  error?: string
}

type Row = Record<string, unknown>

/**
 * Every picture of one post that is on another site, copied, and the post's
 * live and draft columns pointed at the copies. Only the image addresses
 * change, in one update that finds no row when the post was saved in the
 * meantime (then nothing is written and the report says so).
 */
export async function copyPostImages(supabase: Supa, id: string, deps: CopyDeps = DEFAULT_DEPS): Promise<PostCopyReport> {
  const row = await readAdminPost(supabase, id)
  if (!row) return { id, title: "", copied: 0, failed: [], error: "Not found" }
  const title = String(row.title ?? "")
  const liveBlocks = normalizeBlocks(row.content)
  const draftMeta = (row.draft_meta && typeof row.draft_meta === "object" ? row.draft_meta : null) as (PostImageFields & Row) | null
  const draftBlocks = Array.isArray(row.draft_content) ? normalizeBlocks(row.draft_content) : null
  const urls = new Map<string, true>()
  for (const img of [...externalImagesOf(row as PostImageFields, liveBlocks), ...(draftMeta || draftBlocks ? externalImagesOf(draftMeta ?? {}, draftBlocks ?? []) : [])]) urls.set(img.url, true)
  if (!urls.size) return { id, title, copied: 0, failed: [], none: true }

  const moved = new Map<string, string>()
  const failed: PostCopyReport["failed"] = []
  /* One at a time: a post has a handful of pictures, and a site asked for ten at once may refuse them all. */
  for (const url of urls.keys()) {
    const r = await copyExternalImage(url, deps)
    if ("url" in r) moved.set(url, r.url)
    else failed.push({ url, error: r.error })
  }
  if (!moved.size) return { id, title, copied: 0, failed }

  const update: Row = {}
  const live = replaceImageUrls({ cover_image_url: (row.cover_image_url as string | null) ?? null, og_image_url: (row.og_image_url as string | null) ?? null }, liveBlocks, moved)
  if (live.changed) {
    if (live.meta.cover_image_url !== row.cover_image_url) update.cover_image_url = live.meta.cover_image_url
    if ("og_image_url" in row && live.meta.og_image_url !== row.og_image_url) update.og_image_url = live.meta.og_image_url
    if (live.blocks.some((b, i) => b !== liveBlocks[i])) update.content = live.blocks
  }
  if (draftMeta || draftBlocks) {
    const draft = replaceImageUrls(draftMeta ?? {}, draftBlocks ?? [], moved)
    if (draft.changed) {
      if (draftMeta) update.draft_meta = draft.meta
      if (draftBlocks) update.draft_content = draft.blocks
    }
  }
  if (!Object.keys(update).length) return { id, title, copied: 0, failed }
  let q = supabase.from("blog_posts").update(update).eq("id", id).eq("updated_at", row.updated_at as string)
  if ("draft_saved_at" in row) q = row.draft_saved_at ? q.eq("draft_saved_at", row.draft_saved_at as string) : q.is("draft_saved_at", null)
  const { data, error } = await q.select("id").maybeSingle()
  if (error || !data) {
    if (error) console.error("[admin] blog copy image: save:", error.message?.slice(0, 200))
    return { id, title, copied: 0, failed, error: error ? "Couldn't save the new addresses. The copies are stored; try again." : "The post was saved somewhere else meanwhile. Try again." }
  }
  return { id, title, copied: moved.size, failed }
}
