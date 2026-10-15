/**
 * ===========================================================================
 *  A MEMBER'S COVER INSIDE A COMMUNITY: WHICH FILE, AT WHICH SIZE
 * ===========================================================================
 * Round J1, the owner: "make sure the cover doesn't cause lag and doesn't load
 * with delay". Three things made it slow, and each has its answer here:
 *
 *   WAITED FOR SCRIPT   the band was drawn empty by the server and the picture
 *                       only asked for once the page's script had run
 *                       (components/profile/decoded-cover.tsx draws nothing on
 *                       the server). Now the <img> is in the server's HTML with
 *                       fetchpriority high and a preload in the head, so the
 *                       browser asks for it with the first bytes.
 *   THE WHOLE ORIGINAL  Storelib's own address for a picture
 *                       (https://storelib.com/media/...) is not on the
 *                       optimizer list lib/images/optimized-url.ts keeps, so a
 *                       cover saved that way was fetched at its full upload
 *                       size. next.config.mjs does let the optimizer read
 *                       /media/**, so here it is resized like any other.
 *   ONE SIZE FOR ALL    one file picked in script for the window it was opened
 *                       in. Now a srcset of real file widths and a `sizes` that
 *                       says how wide the band is at each breakpoint (times the
 *                       crop's zoom), so the browser picks the file itself,
 *                       before any script, and a phone never gets a desktop's.
 *
 * `warmMemberCover` decodes the same file ahead (a member's link hovered or
 * pressed: lib/communities/client/place-cache.ts reads their profile then), so
 * the profile opens with its cover already whole.
 *
 * Pure apart from `warmMemberCover`, which only runs in a browser.
 */
import { isOptimizableImage, PORTRAIT_QUALITY } from "@/lib/images/optimized-url"
import { isOwnMedia } from "@/lib/storage/media-url"

/**
 * The profile's column at its widest: from 1280px shell-frame.tsx gives the profile the middle and the right columns, a
 * 1360px frame less its 32px gutters, the 280px left column and one 24px gap.
 */
export const PROFILE_COLUMN_PX = 992

/**
 * From 1280px (a computer) the profile takes this share of those two columns, centred, and at most
 * PROFILE_COLUMN_WIDE_PX: the owner found it a bit too wide, so about 5% narrower (992px became 944px at 1440px). Below
 * 1280px (a phone, a tablet) the column is as it was.
 */
export const PROFILE_COLUMN_SHARE = 0.952
export const PROFILE_COLUMN_WIDE_PX = 944

/** File widths offered, every one in next.config's image sizes (the optimizer refuses any other). */
export const MEMBER_COVER_WIDTHS = [640, 750, 828, 1080, 1200, 1920, 2048] as const

/** The file used where srcset is not read, and the one a list warms when it cannot know the screen. */
const FALLBACK_WIDTH = 1200

/** Whether the optimizer can resize this picture: its own hosts, and Storelib's own /media/ address. */
export function coverOptimizable(url: string): boolean {
  return isOptimizableImage(url) || (/^https:\/\//.test(url) && isOwnMedia(url))
}

const file = (url: string, w: number) => `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${PORTRAIT_QUALITY}`

/**
 * How wide the band is drawn, at each width of the window, for `sizes`:
 *   from 1280px  PROFILE_COLUMN_SHARE of the middle and right columns (1360 frame, 32px gutters, 280 left, 24 gap), at
 *                most PROFILE_COLUMN_WIDE_PX
 *   1024-1279    the middle column (32px gutters, 260 left, 24 gap)
 *   640-1023     one column, 24px gutters
 *   below        one column, 16px gutters
 * times the crop's zoom, since a zoomed picture is drawn that much wider than the band.
 */
export function memberCoverSizes(zoom = 1): string {
  const z = Math.round(Math.min(4, Math.max(1, Number.isFinite(zoom) ? zoom : 1)) * 1000) / 1000
  const wide = (gutters: number) => (z === 1 ? `calc(100vw - ${gutters}px)` : `calc((100vw - ${gutters}px) * ${z})`)
  const share = Math.round(PROFILE_COLUMN_SHARE * z * 1000) / 1000
  return [
    `(min-width: 1280px) min(${Math.round(PROFILE_COLUMN_WIDE_PX * z)}px, calc((100vw - 368px) * ${share}))`,
    `(min-width: 1024px) ${wide(348)}`,
    `(min-width: 640px) ${wide(48)}`,
    wide(32),
  ].join(", ")
}

export interface MemberCoverSource {
  src: string
  srcSet?: string
  sizes?: string
}

/** The <img> attributes for a member's cover: the optimizer's files at real widths, or the picture as it is when it cannot be resized. */
export function memberCoverSource(url: string, zoom = 1): MemberCoverSource {
  if (!coverOptimizable(url)) return { src: url }
  return {
    src: file(url, FALLBACK_WIDTH),
    srcSet: MEMBER_COVER_WIDTHS.map((w) => `${file(url, w)} ${w}w`).join(", "),
    sizes: memberCoverSizes(zoom),
  }
}

/** Covers whose file has been decoded in this tab: drawn on the first frame next time, with no fade. */
const decoded = new Set<string>()
const asked = new Map<string, HTMLImageElement>()

/** Whether this cover is decoded already (keyed by its address, whichever file of it the screen took). */
export function memberCoverReady(url: string | null | undefined): boolean {
  return !!url && decoded.has(url)
}

export function markMemberCoverReady(url: string | null | undefined) {
  if (url) decoded.add(url)
}

/**
 * Fetch and decode a member's cover before their profile is opened, with the same srcset and sizes the profile's
 * <img> has, so the browser takes the same file from its cache. Once per cover per tab; never throws.
 */
export function warmMemberCover(url: string | null | undefined, zoom = 1): void {
  if (!url || typeof window === "undefined" || typeof Image === "undefined" || decoded.has(url) || asked.has(url)) return
  const s = memberCoverSource(url, zoom)
  const img = new Image()
  img.decoding = "async"
  if (s.srcSet && s.sizes) {
    img.sizes = s.sizes
    img.srcset = s.srcSet
  }
  img.src = s.src
  asked.set(url, img)
  /* A few at most: a hovered list should not hold every bitmap it ever passed. */
  while (asked.size > 6) asked.delete(asked.keys().next().value as string)
  const done = () => {
    if (img.naturalWidth > 0) decoded.add(url)
  }
  if (typeof img.decode === "function") img.decode().then(done, () => asked.delete(url))
  else img.onload = done
}
