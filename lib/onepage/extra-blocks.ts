// OnePage: the rules behind the newer blocks (components/onepage/extra-blocks.tsx)
// Location: lib/onepage/extra-blocks.ts
//
// Plain functions with no React in them, so the public page's server code
// can use them too: it drops a block that is outside its schedule before the
// page is sent, so a link set to start next week is not in the page at all.

import type {
  CountdownBlockData,
  FaqBlockData,
  HeadingBlockData,
  MapBlockData,
  OnePageBlock,
  OnePageBlockSchedule,
  VideoBlockData,
} from "./types"
import { hasRealUrl } from "./editor-state"
import { dayLabel, viewerZone, wallAt } from "./schedule"
import { CREATOR_BLOCK_TYPES, creatorBlockHasContent } from "./creator-blocks"
import { STORELIB_BLOCK_TYPES, isStorelibBlock, storelibBlockHasContent } from "./storelib-blocks"

/* The course, music, testimonials and contact blocks (./creator-blocks) are among them: the same lists keep them out of a group and off an empty page. So are the shelf, lead magnet, posts, followers and code blocks (./storelib-blocks). */
export const EXTRA_BLOCK_TYPES = ["heading", "faq", "countdown", "map", "video", ...CREATOR_BLOCK_TYPES, ...STORELIB_BLOCK_TYPES] as const
export type ExtraBlockType = (typeof EXTRA_BLOCK_TYPES)[number]

export function isExtraBlock(block: { type: string }): boolean {
  return (EXTRA_BLOCK_TYPES as readonly string[]).includes(block.type)
}

/**
 * Is a block on the page at `now`? A block with no schedule always is. A
 * start or end that cannot be read counts as not set, so a bad value never
 * hides a link for good.
 */
export function isScheduledNow(block: { schedule?: OnePageBlockSchedule | null } | null | undefined, now: number = Date.now()): boolean {
  const s = block?.schedule
  if (!s) return true
  const start = s.start_at ? Date.parse(s.start_at) : NaN
  const end = s.end_at ? Date.parse(s.end_at) : NaN
  if (!Number.isNaN(start) && now < start) return false
  if (!Number.isNaN(end) && now >= end) return false
  return true
}

/** What the editor's row says about a block's schedule, or null when it has none. */
export function scheduleLabel(block: { schedule?: OnePageBlockSchedule | null }, now: number = Date.now(), timeZone: string = viewerZone()): { text: string; live: boolean } | null {
  const s = block.schedule
  if (!s || (!s.start_at && !s.end_at)) return null
  const start = s.start_at ? Date.parse(s.start_at) : NaN
  const end = s.end_at ? Date.parse(s.end_at) : NaN
  /* The day in the zone the picker wrote it in (./schedule), not the device's: a creator whose Settings say New York reads the day they chose. */
  const day = (t: number) => dayLabel(wallAt(t, timeZone).ymd, wallAt(now, timeZone).ymd)
  if (!Number.isNaN(end) && now >= end) return { text: `Ended ${day(end)}`, live: false }
  if (!Number.isNaN(start) && now < start) return { text: `Starts ${day(start)}`, live: false }
  if (!Number.isNaN(end)) return { text: `Until ${day(end)}`, live: true }
  return { text: "Scheduled", live: true }
}

export type VideoSource = { kind: "youtube" | "vimeo" | "tiktok"; id: string }

/** The video a pasted address points at, or null for one that cannot play on the page. */
export function videoSource(raw: string | null | undefined): VideoSource | null {
  const url = (raw || "").trim()
  if (!url) return null
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  if (yt) return { kind: "youtube", id: yt[1] }
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d{5,})/)
  if (vimeo) return { kind: "vimeo", id: vimeo[1] }
  const tiktok = url.match(/tiktok\.com\/@[^/]+\/video\/(\d{8,})/)
  if (tiktok) return { kind: "tiktok", id: tiktok[1] }
  return null
}

/** Is there anything to draw? An empty one of these blocks is left out, so it leaves no gap. */
export function extraBlockHasContent(block: Pick<OnePageBlock, "type" | "data">): boolean {
  switch (block.type) {
    case "heading":
      return !!(block.data as HeadingBlockData)?.text?.trim()
    case "faq":
      return ((block.data as FaqBlockData)?.items || []).some((i) => i?.question?.trim())
    case "countdown":
      return !Number.isNaN(Date.parse((block.data as CountdownBlockData)?.target_at || ""))
    case "map":
      return !!(block.data as MapBlockData)?.address?.trim()
    case "video":
      return videoSource((block.data as VideoBlockData)?.url) !== null
    default:
      return isStorelibBlock(block) ? storelibBlockHasContent(block) : creatorBlockHasContent(block)
  }
}

/**
 * A LINK STILL WAITING FOR ITS ADDRESS: on, in its schedule, and nothing to
 * open ("https://" or empty). The live page leaves it out (isBlockShown); the
 * editor's preview draws it as a muted placeholder, and the blocks list and
 * the link's own settings say what it needs, so a new link is never just
 * missing.
 */
export function isIncompleteLink(block: any, now: number = Date.now()): boolean {
  return !!block?.enabled && block.type === "link_button" && isScheduledNow(block, now) && !hasRealUrl(block.data?.url)
}

/**
 * IS A BLOCK ON THE PAGE? One rule, used by the live page and by the editor's
 * preview, so the preview never shows a block a visitor would not see: off,
 * outside its schedule, a text of less than two real characters, an image
 * with no picture, a link with no address (a bare "https://" included), or
 * one of the newer blocks left empty.
 */
export function isBlockShown(block: any, now: number = Date.now()): boolean {
  if (!block?.enabled) return false
  if (!isScheduledNow(block, now)) return false
  if (block.type === "text") {
    const content = block.data?.content || ""
    const stripped = content.replace(/[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF!?.,;:'"()@#$%&+=\/\\<>{}[\]~`^*]/g, "")
    return stripped.length >= 2
  }
  if (block.type === "image") {
    const images = block.data?.images || (block.data?.image_url ? [{ image_url: block.data.image_url }] : [])
    return images.length > 0 && !!images[0]?.image_url
  }
  if(block.type === "form_quiz")return !!block.data?.form_id
  if (block.type === "link_button") return hasRealUrl(block.data?.url)
  return extraBlockHasContent(block)
}
