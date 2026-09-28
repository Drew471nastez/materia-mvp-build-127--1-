/**
 * The library's own surfaces and buttons, in one place so every library
 * screen draws them the same. They are the receipt's (app/receipt/[token]/
 * receipt-view.tsx): a white card on a hairline, a near-black primary and a
 * light grey secondary that sink a pixel when pressed. The buyer moves
 * between the receipt and the library all the time, and they read as one
 * product.
 *
 * BUTTON RADIUS: 10px, the receipt's and the review card's. The header's
 * Log in button is being given one shared radius (see the coordinator's
 * CONTRACT.md); when it lands, RADIUS below points at it.
 */

export const RADIUS = "rounded-[10px]"

export const CARD =
  "rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"

const PRESS =
  "transition-[background-color,box-shadow,translate] duration-150 active:translate-y-px disabled:cursor-default disabled:opacity-60 disabled:active:translate-y-0"

export const PRIMARY = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 ${RADIUS} border border-[#0f0f1c] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] hover:bg-[#262640] active:bg-[#12121f] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2 ${PRESS}`

export const SECONDARY = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 ${RADIUS} border border-[#d5d9e0] bg-[#f3f4f6] px-4 text-[14px] font-semibold text-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(16,24,40,0.08)] hover:bg-[#eceef1] active:bg-[#e7e9ed] active:shadow-[inset_0_1px_2px_rgba(16,24,40,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-2 ${PRESS}`

/** Storelib's purple, for the one call to action a screen has (Explore's Start selling). */
export const VIOLET = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 ${RADIUS} bg-[#7c3aed] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(76,29,149,0.3)] hover:bg-[#6d28d9] active:bg-[#5b21b6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/30 focus-visible:ring-offset-2 ${PRESS}`

/** A size down, for a row's own action. */
export const SMALL = "h-9 px-3 text-[13px]"

/** A square icon button the size of SMALL, for a row's More. */
export const ICON_BUTTON = `inline-flex h-9 w-9 shrink-0 items-center justify-center ${RADIUS} text-[#4b5563] transition-colors duration-100 hover:bg-[#f3f4f6] hover:text-[#1a1a2e] active:bg-[#eceef1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20`

export const TEXT_LINK =
  "font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-2 transition-[text-decoration-color] hover:decoration-[#1a1a2e]"

export const MUTED = "text-[13px] text-[#6b7280]"

/** "Mar 3, 2026", the same on the server and in every browser. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}
