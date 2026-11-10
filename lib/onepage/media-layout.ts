/**
 * ===========================================================================
 *  HOW A MUSIC OR A VIDEO BLOCK SITS ON THE PAGE (round AR3)
 * ===========================================================================
 * The owner: "ensure that Spotify blocks and music blocks, and all the
 * blocks, have layout styles that apply very well ... because they don't",
 * and "layouts work for YouTube video blocks and Vimeo". A music or a video
 * block had only its Interaction (lib/onepage/block-sheet): the player on
 * the page, or the page's button that opens it. Its Layout tab had nothing
 * of its own. Now it has three layouts, drawn as pictures there:
 *
 *   player   the service's own player (or Storelib's for an uploaded video)
 *            right on the page. What a new block starts on.
 *   card     a card: the cover or the video's frame, the title, the
 *            description and a play button. A tap plays it in the sheet or
 *            goes to the service (the Interaction).
 *   button   the page's own button with the service's mark, as before.
 *
 * Saved blocks keep what they drew: no `layout` saved reads from open_mode,
 * inline as the player and anything else as the button. Picking a layout
 * writes the pair that layout means, so blockInteraction and the page agree.
 *
 * Pure: no React, so the server, the editor and the tests share it.
 */

export const MUSIC_LAYOUTS = ["player", "card", "button"] as const
export const VIDEO_LAYOUTS = ["player", "card", "button"] as const
export type MediaLayout = (typeof MUSIC_LAYOUTS)[number]

type MediaData = { layout?: unknown; open_mode?: unknown } | null | undefined

/** The layout a music or video block is drawn in. */
export function mediaLayoutOf(data: MediaData): MediaLayout {
  const l = data?.layout
  if (l === "player" || l === "card" || l === "button") return l
  /* Saved before round AR3: the player when it was on the page, the button otherwise. */
  return data?.open_mode === "sheet" || data?.open_mode === "direct" ? "button" : "player"
}

/** What a picked layout writes: the layout, and an Interaction that agrees with it. */
export function mediaLayoutPatch(layout: MediaLayout, data: MediaData): { layout: MediaLayout; open_mode: "inline" | "sheet" | "direct" } {
  if (layout === "player") return { layout, open_mode: "inline" }
  const mode = data?.open_mode === "direct" ? "direct" : "sheet"
  return { layout, open_mode: mode }
}

/* ─── An uploaded video ──────────────────────────────────────────────── */

/** Formats a browser plays in a <video>; the upload's extension or its content type. */
export const VIDEO_FILE_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "ogv"] as const

/**
 * A video file Storelib holds (an upload, or one of the creator's files): a
 * same-site path or an https address ending in a playable extension. Never a
 * javascript:, data: or blob: address.
 */
export function videoFileUrl(raw: string | null | undefined): string | null {
  const text = (raw || "").trim()
  if (!text || text.length > 2048 || /\s/.test(text)) return null
  if (text.startsWith("/") && !text.startsWith("//")) return /\.(mp4|m4v|mov|webm|ogv)$/i.test(text.split("?")[0]) ? text : null
  try {
    const url = new URL(text)
    if (url.protocol !== "https:") return null
    return /\.(mp4|m4v|mov|webm|ogv)$/i.test(url.pathname) ? url.toString() : null
  } catch {
    return null
  }
}
