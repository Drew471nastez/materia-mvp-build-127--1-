/**
 * ===========================================================================
 *  THE PAGE EDITOR'S GEOMETRY, PURE (round 27)
 * ===========================================================================
 * The numbers the editor (./page-editor.tsx), its preview (./preview-frame.tsx) and its drawer (./drawer.tsx) work
 * from, apart from React and the DOM, so the suite (tests/editor27.test.ts) and the probe
 * (scripts/check-page-editor27.mjs) read the same arithmetic the editor runs.
 */

/* ── The preview: how wide the page is laid out, and its scale ── */

export type Device = "desktop" | "phone"
/** The narrowest the page is laid out on a computer: where it has its side card. */
export const DESKTOP_MIN = 1280
export const PHONE_WIDTH = 390
export const PHONE_HEIGHT = 844
/** A pane this narrow is a phone already: the page fills it at its own width, between these two. */
export const BARE_PHONE_MIN = 320
export const BARE_PHONE_MAX = 430
/** How long the pane has to stay still before the page is laid out at its new width. */
export const SETTLE_MS = 160
const PHONE_GUTTER = 24

/**
 * Where the page is laid out and drawn in a pane of this size: the page's own width and height (w, h, in the frame's
 * pixels), its scale, and the box it is shown in (in the pane's pixels, whole). Pure: the editor, the probe and the
 * suite read it.
 */
export interface FrameGeometry {
  w: number
  h: number
  scale: number
  boxW: number
  boxH: number
  left: number
  top: number
  /** A phone drawn as a card with room around it (false: the page fills the pane). */
  card: boolean
}

export function frameGeometry(device: Device, paneW: number, paneH: number): FrameGeometry {
  const pw = Math.max(1, Math.floor(paneW))
  const ph = Math.max(1, Math.floor(paneH))
  if (device === "desktop") {
    const w = Math.max(DESKTOP_MIN, pw)
    const scale = Math.min(1, pw / w)
    return { w, h: Math.max(320, Math.ceil(ph / scale)), scale, boxW: pw, boxH: ph, left: 0, top: 0, card: false }
  }
  if (pw < PHONE_WIDTH + 72) {
    const w = Math.min(BARE_PHONE_MAX, Math.max(BARE_PHONE_MIN, pw))
    const boxW = Math.min(pw, w)
    const scale = boxW / w
    return { w, h: Math.max(320, Math.ceil(ph / scale)), scale, boxW, boxH: ph, left: Math.round((pw - boxW) / 2), top: 0, card: false }
  }
  const boxW = Math.min(PHONE_WIDTH, Math.round(pw - PHONE_GUTTER))
  const scale = boxW / PHONE_WIDTH
  const h = Math.min(PHONE_HEIGHT, Math.max(320, Math.floor((ph - PHONE_GUTTER) / scale)))
  return { w: PHONE_WIDTH, h, scale, boxW, boxH: Math.round(h * scale), left: Math.round((pw - boxW) / 2), top: 12, card: true }
}

/**
 * The same pane while it is still changing size: the page keeps the width it was laid out at (no layout), only the
 * scale and the box follow. Its height only grows, by a margin, so a narrowing pane does not lay it out every frame.
 */
export function liveGeometry(device: Device, paneW: number, paneH: number, laid: { w: number; h: number }): FrameGeometry {
  const natural = frameGeometry(device, paneW, paneH)
  const pw = Math.max(1, Math.floor(paneW))
  const ph = Math.max(1, Math.floor(paneH))
  if (natural.card) {
    const scale = natural.boxW / laid.w
    return { ...natural, w: laid.w, h: laid.h, scale, boxH: Math.round(laid.h * scale) }
  }
  const scale = Math.min(1, pw / laid.w)
  const boxW = Math.min(pw, Math.round(laid.w * scale))
  const need = Math.ceil(ph / scale)
  return { w: laid.w, h: need > laid.h ? Math.ceil(need * 1.5) : laid.h, scale, boxW, boxH: ph, left: Math.round((pw - boxW) / 2), top: 0, card: false }
}

/* ── Side or drawer, and the panel's width ── */

/*
  ROUND 27: SIDE OR DRAWER, BY THE EDITOR'S OWN WIDTH (./page-editor.tsx). The panel goes beside the page from SIDE_MIN
  of editor and back to the drawer under it, with a few pixels between the two so a scrollbar coming and going at the
  line never flips it back and forth.
*/
export const SIDE_MIN = 640
export const SIDE_SLACK = 8
export const PANEL_MIN = 300
export const PANEL_MAX = 560
export const PANEL_DEFAULT = 360
/** The least the page keeps beside the panel, and the handle between them. */
export const STAGE_MIN = 340
export const HANDLE_W = 16
export const PANEL_KEY = "sl:page-editor:panel-width"

export type EditorMode = "side" | "drawer"

/** The panel's width for an editor this wide: the one asked for, kept between the least and what leaves the page its room. */
export function panelWidthFor(editorWidth: number, wanted: number): number {
  const most = Math.max(PANEL_MIN, Math.min(PANEL_MAX, editorWidth - STAGE_MIN - HANDLE_W))
  return Math.round(Math.max(PANEL_MIN, Math.min(most, wanted)))
}

/** Side or drawer for this width, given what it is now (the slack keeps it where it is near the line). */
export function modeFor(editorWidth: number, now: EditorMode | null): EditorMode {
  if (editorWidth >= SIDE_MIN + SIDE_SLACK) return "side"
  if (editorWidth < SIDE_MIN - SIDE_SLACK) return "drawer"
  return now ?? (editorWidth >= SIDE_MIN ? "side" : "drawer")
}

/* ── The drawer's three resting places ── */

export const DETENTS = ["full", "half", "peek"] as const
export type Detent = (typeof DETENTS)[number]

/** Half the room above the foot, the share the page keeps above it at half. */
export const HALF_SHARE = 0.5
/** What is kept clear above the drawer at its tallest, under the app's own bar. */
export const TOP_GAP = 8

/**
 * The drawer's three offsets (from its tallest, downward) for a drawer `height` tall with a head `head` tall. Pure, for
 * the editor and the suite.
 */
export function drawerOffsets(height: number, head: number): Record<Detent, number> {
  const h = Math.max(head, Math.round(height))
  const half = Math.max(head + 120, Math.round(h * HALF_SHARE))
  return { full: 0, half: Math.max(0, h - half), peek: Math.max(0, h - head) }
}

