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
 * public-onepage). With select mode on, hovering one draws a quiet ring
 * round it; a click on a block that is not the open one is taken: the
 * page's own link or sheet does not happen, and the editor opens that
 * block's settings and scrolls its list to it. A click on the block that is
 * already open goes through to the page as before, so the open block can
 * still be tried (its sheet, its form) right there.
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

export type PickAction = "select" | "pass"

/** What a click does: taken to select a block, or passed to the page. */
export function pickAction(input: { mode: boolean; selected: string | null; hit: string | null; button?: number; modified?: boolean }): PickAction {
  if (!input.mode || !input.hit) return "pass"
  if ((input.button ?? 0) !== 0 || input.modified) return "pass"
  return input.hit === input.selected ? "pass" : "select"
}

/** A block id as the editor keeps them: short, no spaces or markup. Anything else from the frame is ignored. */
export function validBlockId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 80 && /^[\w-]+$/.test(v)
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
