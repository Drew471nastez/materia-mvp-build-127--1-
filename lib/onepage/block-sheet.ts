/**
 * ===========================================================================
 *  WHAT A TAP ON AN EMBEDDING BLOCK DOES, AND HOW THE SHEET MOVES (round AL)
 * ===========================================================================
 * The rules behind components/onepage/block-sheet.tsx, kept free of React so
 * the tests and the Chromium check read the same numbers the sheet uses.
 *
 * THE INTERACTION. A block that shows another service (a Calendly page, a
 * video, a Spotify player, a post, a map, a contact form) can be:
 *
 *   inline   drawn on the page itself, as every one of them was before this
 *            round. A block saved before the choice existed stays this way,
 *            so no page changes under its creator.
 *   sheet    a button on the page; a tap raises the block in the sheet.
 *   direct   a button on the page; a tap goes to the service's own page.
 *
 * Stored as `open_mode` on the block's data. A new block starts on "sheet"
 * (lib/onepage/types createDefaultBlock), as Linktree's do.
 *
 * Calendly had its own choice before this one (`embed_mode`, `embed_type`):
 * it is read when `open_mode` is not set, so a saved Calendly block behaves
 * as it did, except that its pop-up is now the sheet. A PDF and a menu
 * (round AN) had two switches, `enable_preview` and `open_directly`, read
 * the same way: their pop-up is the sheet, "Open directly" is the link.
 */

export type BlockInteraction = "inline" | "sheet" | "direct"

/** The blocks that offer the choice, and which of the three each can be. */
export const SHEET_BLOCKS: Record<string, readonly BlockInteraction[]> = {
  calendly: ["sheet", "direct", "inline"],
  video: ["sheet", "direct", "inline"],
  music: ["sheet", "direct", "inline"],
  embed: ["sheet", "direct", "inline"],
  map: ["sheet", "direct", "inline"],
  /* A form has no address of its own to go to. */
  contact_form: ["sheet", "inline"],
  /* Round AN: a PDF, and a menu, which is a PDF. */
  pdf_document: ["sheet", "direct", "inline"],
  food_menu: ["sheet", "direct", "inline"],
}

/* The blocks that had their own two switches before the choice (`enable_preview`, `open_directly`). */
const PDF_BLOCKS = new Set(["pdf_document", "food_menu"])

export function offersInteraction(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(SHEET_BLOCKS, type)
}

type Data = Record<string, unknown> | null | undefined

/** What a tap on this block does. Pure: the page, the editor and the tests all ask this. */
export function blockInteraction(block: { type: string; data?: unknown }): BlockInteraction {
  const allowed = SHEET_BLOCKS[block.type]
  if (!allowed) return "direct"
  const data = (block.data ?? null) as Data
  const mode = data?.open_mode
  if ((mode === "sheet" || mode === "direct" || mode === "inline") && allowed.includes(mode)) return mode
  if (block.type === "calendly") {
    if (data?.embed_mode === "direct_link") return "direct"
    if (data?.embed_mode === "embedded" && data?.embed_type === "inline") return "inline"
    /* The pop-up, and a block with no choice saved (it opened a new tab): the sheet. */
    return "sheet"
  }
  if (PDF_BLOCKS.has(block.type)) {
    /*
      Round AN: a PDF opened its own pop-up unless "Open directly" was on. That
      pop-up is the sheet now, and "Open directly" is the link. With both
      switches off a tap did nothing at all; it goes to the file now.
    */
    if (data?.open_directly === true || data?.enable_preview === false) return "direct"
    return "sheet"
  }
  return "inline"
}

/** The data to save for a choice. Calendly keeps its older fields in step, so anything that still reads them agrees. */
export function interactionPatch(type: string, mode: BlockInteraction): Record<string, unknown> {
  if (PDF_BLOCKS.has(type)) return { open_mode: mode, open_directly: mode === "direct", enable_preview: mode !== "direct" }
  if (type !== "calendly") return { open_mode: mode }
  if (mode === "direct") return { open_mode: mode, embed_mode: "direct_link" }
  if (mode === "inline") return { open_mode: mode, embed_mode: "embedded", embed_type: "inline" }
  return { open_mode: mode, embed_mode: "embedded", embed_type: "modal" }
}

/*
 * THE MOTION, from the owner's recording (Linktree, 20 frames a second):
 * the sheet rises from a smaller card set a little lower, fading in, over
 * about 300ms while the page behind dims; Close runs it back down, a little
 * smaller and fading, over about 250ms.
 */
export const SHEET_MOTION = {
  openMs: 300,
  closeMs: 250,
  /* The fade finishes before the rise does: by the second frame the card is already mostly there. */
  openFadeMs: 200,
  openEase: "cubic-bezier(0.32, 0.72, 0, 1)",
  closeEase: "cubic-bezier(0.4, 0, 0.7, 0.2)",
  /** Where the card starts and where it ends up when it leaves: down by a share of its own height, smaller, clear. */
  from: { translateY: "12%", scale: 0.92 },
  to: { translateY: "10%", scale: 0.94 },
  backdrop: 0.55,
  /** prefers-reduced-motion: a short fade and nothing that moves. */
  reducedMs: 150,
} as const

/*
 * SWIPE DOWN TO CLOSE (round AN), on a touch screen. The sheet follows the
 * finger once it has moved SWIPE.slopPx straight down; on letting go it
 * closes when it has been drawn down past `closeAt` of its height (at most
 * `closeAtMaxPx`), or flicked down faster than `flick` px/ms over the last
 * tenth of a second after at least `flickMinPx`; otherwise it springs back.
 */
export const SWIPE = {
  slopPx: 8,
  closeAt: 0.25,
  closeAtMaxPx: 140,
  flick: 0.5,
  flickMinPx: 16,
  /** Leaving: from under the finger to off the foot of the screen. */
  outMs: 220,
  outEase: "cubic-bezier(0.32, 0.72, 0, 1)",
  /** Springing back up into place, settling without overshoot (a gap would show under it on a phone). */
  backMs: 280,
  backEase: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const

/** What letting go does: `dy` how far it was drawn down, `height` the sheet's, `speed` px/ms (down is positive). Pure. */
export function swipeDecision(dy: number, height: number, speed: number): "close" | "back" {
  if (dy <= 0) return "back"
  if (dy >= Math.min(height * SWIPE.closeAt, SWIPE.closeAtMaxPx)) return "close"
  if (speed >= SWIPE.flick && dy >= SWIPE.flickMinPx) return "close"
  return "back"
}

/** The history entry a sheet stands on, so the browser's Back closes it rather than leaving the page. */
export const BLOCK_SHEET_HISTORY_KEY = "onepageBlockSheet"

export function blockSheetEntryOf(historyState: unknown): string | null {
  if (!historyState || typeof historyState !== "object") return null
  const v = (historyState as Record<string, unknown>)[BLOCK_SHEET_HISTORY_KEY]
  return typeof v === "string" ? v : null
}
