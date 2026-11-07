/**
 * ===========================================================================
 *  ONE WINDOW AT A TIME: PRODUCT SHEET, THEN CHECKOUT (round AK)
 * ===========================================================================
 * "Clicking Get It Free or Purchase opens checkout UNDER the product modal."
 * The sheet and the checkout were two pieces of state set side by side, and
 * the checkout was opened on a guess of when the sheet had gone (a 180ms timer
 * on a computer, under the dialog's 200ms fade). For a few frames the
 * checkout was drawn under the sheet's dimming layer, with focus left behind
 * on the page and no history entry, so Back left the OnePage.
 *
 * Now one state says which window is up, and it moves only through these
 * steps (components/onepage/product-block.tsx keeps it):
 *
 *   closed    ── open ─────────> sheet
 *   sheet     ── buy ──────────> handoff    the sheet leaves; nothing else is drawn
 *   handoff   ── sheet gone ───> checkout   the sheet told us it is out of the document
 *   handoff   ── too long ─────> checkout   a sheet that never says so (a background tab)
 *   (closed)  ── buy ──────────> checkout   the block's own button, with no sheet
 *   checkout  ── back ─────────> sheet      the checkout's Back: the sheet again
 *   any       ── close ────────> closed     Escape, the X, the backdrop, the browser's Back
 *
 * A step that does not apply leaves the state as it is, so a late "sheet gone"
 * from an earlier close can never open a checkout nobody asked for.
 */

export type PurchaseLayer =
  | { kind: "closed" }
  | { kind: "sheet" }
  | { kind: "handoff"; variantId: string | null }
  | { kind: "checkout"; variantId: string | null; fromSheet: boolean }

export type PurchaseStep =
  | { type: "open" }
  | { type: "buy"; variantId: string | null }
  | { type: "sheet-gone" }
  | { type: "too-long" }
  | { type: "back" }
  | { type: "close" }

export const PURCHASE_CLOSED: PurchaseLayer = { kind: "closed" }

/** The longest a sheet is waited for before the checkout opens anyway. */
export const HANDOFF_MAX_MS = 700

export function purchaseStep(state: PurchaseLayer, step: PurchaseStep): PurchaseLayer {
  switch (step.type) {
    case "open":
      return state.kind === "sheet" ? state : { kind: "sheet" }
    case "buy":
      if (state.kind === "sheet") return { kind: "handoff", variantId: step.variantId }
      if (state.kind === "closed") return { kind: "checkout", variantId: step.variantId, fromSheet: false }
      return state
    case "sheet-gone":
    case "too-long":
      return state.kind === "handoff" ? { kind: "checkout", variantId: state.variantId, fromSheet: true } : state
    case "back":
      return state.kind === "checkout" && state.fromSheet ? { kind: "sheet" } : state.kind === "checkout" ? PURCHASE_CLOSED : state
    case "close":
      return state.kind === "closed" ? state : PURCHASE_CLOSED
  }
}

/** The sheet is up (or rising) only in its own state: during the handoff it is already leaving. */
export function sheetShown(state: PurchaseLayer): boolean {
  return state.kind === "sheet"
}

/** The history entry a checkout opened on this page stands on, so the browser's Back closes it rather than the page. */
export const CHECKOUT_HISTORY_KEY = "onepageCheckout"

export function checkoutEntryOf(historyState: unknown): string | null {
  if (!historyState || typeof historyState !== "object") return null
  const v = (historyState as Record<string, unknown>)[CHECKOUT_HISTORY_KEY]
  return typeof v === "string" ? v : null
}
