/**
 * ===========================================================================
 *  CLICK A BLOCK IN THE PHONE, EDIT IT IN THE LIST (round AR)
 * ===========================================================================
 * The owner: "in the phone preview, on desktop and larger screens, a smooth
 * accurate selector so I can click on the phone preview on a specific block
 * and it selects that, and in the links it takes me to that and opens it".
 *
 * Two more messages on the editor and preview channel (lib/onepage/preview-
 * channel):
 *
 *   "select-mode"  editor to frame: whether the phone beside the editor
 *                  picks blocks (it does from 768px; the full screen
 *                  preview on a phone does not), and which block is open
 *   "select"       frame to editor: the block that was clicked
 *
 * In the frame each drawn block carries data-op-block (components/onepage/
 * public-onepage). With select mode on, nothing is drawn over the page: no
 * ring, no outline (the owner: "remove the visible selector, it looks
 * bad"). The pointer turns into a hand over a block, and that is the only
 * cue. A click anywhere on a block that is not the open one, a picture or
 * an embedded player included, is taken: the page's own link or sheet does
 * not happen, and the editor opens that block's settings and glides its
 * list to it. A click in the gap between two blocks takes the nearer one.
 * A click on the block that is already open goes through to the page, so
 * the open block can still be tried right there, and the list glides back
 * to its card all the same.
 *
 * Pure parts here, for the tests and both sides.
 */

/** The block a pointer is over: the nearest data-op-block round it, or null. */
export function blockIdAt(target: EventTarget | null): string | null {
  const el = target as { closest?: (s: string) => Element | null } | null
  const block = el && typeof el.closest === "function" ? el.closest("[data-op-block]") : null
  const id = block?.getAttribute("data-op-block")
  return id ? id : null
}

export type PickAction = "select" | "reveal" | "pass"

/**
 * What a click does: "select" is taken from the page and opens the block;
 * "reveal" goes through to the page (the block is open already) and the
 * list glides back to its card; "pass" is the page's alone.
 */
export function pickAction(input: { mode: boolean; selected: string | null; hit: string | null; button?: number; modified?: boolean }): PickAction {
  if (!input.mode || !input.hit) return "pass"
  if ((input.button ?? 0) !== 0 || input.modified) return "pass"
  return input.hit === input.selected ? "reveal" : "select"
}

export type PickRect = { id: string; left: number; top: number; right: number; bottom: number }

/** How far from a block a click in a gap still counts as that block's, in CSS pixels of the frame. */
export const PICK_GAP_PX = 16

/**
 * The block a click in the open page lands on when the click is between
 * blocks rather than on one: the block whose box holds the point, else the
 * nearest one above or below it within `slack`, across the same column.
 * Null on the page's margins and far from any block.
 */
export function nearestBlock(rects: PickRect[], x: number, y: number, slack = PICK_GAP_PX): string | null {
  let best: { id: string; d: number } | null = null
  for (const r of rects) {
    if (r.right - r.left <= 0 || r.bottom - r.top <= 0) continue
    if (x < r.left - slack || x > r.right + slack) continue
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
    const d = Math.max(dx, dy)
    if (d > slack) continue
    if (!best || d < best.d) best = { id: r.id, d }
  }
  return best ? best.id : null
}

/** A block id as the editor keeps them: short, no spaces or markup. Anything else from the frame is ignored. */
export function validBlockId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 80 && /^[\w-]+$/.test(v)
}

/**
 * The frame's style while select mode is on: a hand over every block, and
 * every embedded frame (a player, a map) gives its clicks to the block
 * round it, except in the open block, which is the creator's to try. By id,
 * so it follows the open block through every redraw without touching the
 * page's own markup or how anything looks.
 */
export function pickStyle(selected: string | null): string {
  const open = validBlockId(selected) ? `[data-op-block="${selected}"]` : null
  return [
    "[data-op-block]{cursor:pointer}",
    "[data-op-block] iframe{pointer-events:none}",
    open ? `${open}{cursor:auto}${open} iframe{pointer-events:auto}` : "",
  ].join("")
}

/**
 * The editor's side of a pick, across its tabs: the editor shows the Links
 * tab and the list scrolls to the block once its card is there. The pick is
 * kept here for the list to take on its next render.
 */
export const PREVIEW_PICK_EVENT = "onepage:preview-pick"

let pending: { id: string; at: number } | null = null

/** Kept for the list (components/onepage/tabs/links-tab) to scroll to. */
export function notePreviewPick(id: string, now = Date.now()): void {
  pending = { id, at: now }
}

/** The pick to scroll to, once: only for the block that is open, and only for a couple of seconds. */
export function takePreviewPick(selected: string | null, now = Date.now()): string | null {
  if (!pending || !selected || pending.id !== selected || now - pending.at > 2500) return null
  pending = null
  return selected
}
