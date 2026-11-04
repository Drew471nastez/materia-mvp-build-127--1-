/**
 * ===========================================================================
 *  A BLOG POST'S PICTURES THAT LIVE ON SOMEBODY ELSE'S SITE
 * ===========================================================================
 * Many posts were written with covers and pictures linked straight from
 * other sites (stan.store, thrivecart.com, easydigitaldownloads.com and
 * more). Such a picture can change, vanish or be blocked at any moment, and
 * the post shows a hole. The editor names them and offers Copy to Storelib
 * (app/api/admin/blog/copy-image, lib/blog/copy-image.ts), which stores the
 * same picture in Storelib's own storage and puts its address in place.
 *
 * The pictures of a post: its cover (cover_image_url), its share image
 * (og_image_url) and every picture block's url. A picture is Storelib's own
 * when it is a path on storelib.com, on storelib.com or a subdomain of it,
 * or in Storelib's storage (a *.supabase.co public object, which
 * lib/storage/media-url turns into storelib.com/media/...).
 *
 * Pure and safe in the browser: the editor and the server both use it.
 */
import type { Block } from "./blocks"

export interface PostImageFields {
  cover_image_url?: string | null
  og_image_url?: string | null
}

/** Is this host Storelib's own? `storageHost` is the storage's host (NEXT_PUBLIC_SUPABASE_URL), when known. */
export function isStorelibImageHost(hostname: string, storageHost?: string | null): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "")
  if (h === "storelib.com" || h.endsWith(".storelib.com")) return true
  if (/^[a-z0-9-]+\.supabase\.(co|in)$/.test(h)) return true
  return !!storageHost && h === storageHost.toLowerCase()
}

function storageHostFromEnv(): string | null {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null
  } catch {
    return null
  }
}

/** The host of an absolute http(s) address, or null for a path, a data: URL or anything that is not an address. */
export function imageHost(url: string | null | undefined): string | null {
  if (!url || !/^https?:\/\//i.test(url.trim())) return null
  try {
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** A picture on another site: an absolute address whose host is not Storelib's. */
export function isExternalImage(url: string | null | undefined, storageHost: string | null = storageHostFromEnv()): boolean {
  const host = imageHost(url)
  return !!host && !isStorelibImageHost(host, storageHost)
}

export interface ExternalImage {
  url: string
  host: string
  /** Where the post uses it: "cover", "share" or the picture block's id. */
  where: string[]
}

/** Every picture of a post that is on another site, each address once, in the order the post uses them. */
export function externalImagesOf(meta: PostImageFields, blocks: readonly Block[], storageHost: string | null = storageHostFromEnv()): ExternalImage[] {
  const out = new Map<string, ExternalImage>()
  const add = (url: string | null | undefined, where: string) => {
    const u = (url ?? "").trim()
    if (!u || !isExternalImage(u, storageHost)) return
    const seen = out.get(u)
    if (seen) seen.where.push(where)
    else out.set(u, { url: u, host: imageHost(u)!, where: [where] })
  }
  add(meta.cover_image_url, "cover")
  add(meta.og_image_url, "share")
  for (const b of blocks) if (b.type === "img") add(b.url, b.id)
  return [...out.values()]
}

/** The post with each address in `moved` (old to new) replaced, and whether anything changed. Nothing else is touched. */
export function replaceImageUrls<M extends PostImageFields>(meta: M, blocks: readonly Block[], moved: ReadonlyMap<string, string>): { meta: M; blocks: Block[]; changed: boolean } {
  let changed = false
  const swap = (url: string | null | undefined) => {
    const to = url ? moved.get(url.trim()) : undefined
    if (to && to !== url) {
      changed = true
      return to
    }
    return url
  }
  const nextMeta = { ...meta }
  if (meta.cover_image_url) nextMeta.cover_image_url = swap(meta.cover_image_url)
  if (meta.og_image_url) nextMeta.og_image_url = swap(meta.og_image_url)
  const nextBlocks = blocks.map((b) => (b.type === "img" && b.url && moved.has(b.url.trim()) ? { ...b, url: swap(b.url) ?? b.url } : b))
  return { meta: nextMeta, blocks: nextBlocks, changed }
}

/** "stan.store, thrivecart.com and 2 more": the hosts a notice names. */
export function hostList(images: readonly ExternalImage[], max = 3): string {
  const hosts = [...new Set(images.map((i) => i.host.replace(/^www\./, "")))]
  if (hosts.length <= max) return hosts.length > 1 ? `${hosts.slice(0, -1).join(", ")} and ${hosts.at(-1)}` : hosts.join("")
  return `${hosts.slice(0, max).join(", ")} and ${hosts.length - max} more`
}
