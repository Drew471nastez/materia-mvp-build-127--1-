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

/**
 * THE LIBRARY PAGE'S TITLE, as Settings writes its own (components/account/
 * account-settings.tsx): the /app heading's size and weight. The library is
 * a page of its own now, not a pill under the profile, so it says what it
 * is. Here, in a module with no "use client", because both the live head
 * (library-tabs.tsx) and the still copy a move back from a purchase draws
 * (library-skeletons.tsx TabsHeaderStill, rendered on the server too) read
 * it, and they must land on the same line.
 */
export const LIBRARY_TITLE = "min-w-0 truncate text-[24px] font-bold leading-[1.25] tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]"
/** And the room between the title and the pills, the same in both. */
export const LIBRARY_TITLE_GAP = "mb-4"

export const CARD =
  "rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"

const PRESS =
  "transition-[background-color,box-shadow,translate] duration-150 active:translate-y-px disabled:cursor-default disabled:opacity-60 disabled:active:translate-y-0"

export const PRIMARY = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 ${RADIUS} border border-[#0f0f1c] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] hover:bg-[#262640] active:bg-[#12121f] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2 ${PRESS}`

export const SECONDARY = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 ${RADIUS} border border-[#d5d9e0] bg-[#f3f4f6] px-4 text-[14px] font-semibold text-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(16,24,40,0.08)] hover:bg-[#eceef1] active:bg-[#e7e9ed] active:shadow-[inset_0_1px_2px_rgba(16,24,40,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-2 ${PRESS}`

/** Storelib's purple, for the one call to action a screen has (Explore's Start selling). */
export const VIOLET = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 ${RADIUS} bg-[#7c3aed] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_1px_2px_rgba(76,29,149,0.3)] hover:bg-[#6d28d9] active:bg-[#5b21b6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/30 focus-visible:ring-offset-2 ${PRESS}`

/**
 * A size down, for a row's own action: 36px, not 40.
 *
 * ALWAYS THROUGH cn(): cn(PRIMARY, SMALL, ...). Written as
 * `${PRIMARY} ${SMALL}` both h-10 and h-9 land on the element, and the
 * stylesheet, not the class string, decides which wins: Tailwind puts h-10
 * after h-9 (and px-4 after px-3, text-[14px] after text-[13px]), so every
 * "small" button drew at 40px. cn merges the two, so the later one really
 * is the only one left.
 */
export const SMALL = "h-9 px-3 text-[13px]"

/**
 * A ROW'S OWN ACTION (round 31): Download, the "7 files" switch, Open and
 * Receipt on a purchase row, and Download on each of its files. The owner:
 * the row's Download "looks too light, washed grey, especially in dark".
 * SECONDARY's grey well on a white card read as a disabled button, and in
 * the dark look it became a step of charcoal on the card's own charcoal.
 *
 * This is a calm secondary: the card's surface lifted by a real hairline
 * and a one pixel shadow, ink words, a grey step under a pointer and a
 * deeper one, pressed in by a pixel, under a finger. Its colours are
 * variables (--sl-btn2-*), so the dark look gives it a raised graphite
 * surface with a clear edge (scripts/gen-theme-dark.mjs) instead of the
 * card's colour. While a download runs the button is disabled but never
 * dimmed: the spinner and the percent are the state, not a faded button.
 * 36px, so no cn() merge with SMALL is needed.
 *
 * CALM is its colours alone, for a calm secondary of another size (the
 * community composer's Keep writing).
 */
export const CALM =
  "border border-[color:var(--sl-btn2-line,#cfd4dc)] bg-[var(--sl-btn2,#ffffff)] text-[color:var(--sl-btn2-ink,#1a1a2e)] shadow-[var(--sl-btn2-depth,0_1px_2px_rgba(16,24,40,0.07))] hover:border-[color:var(--sl-btn2-line-hover,#bcc3cd)] hover:bg-[var(--sl-btn2-hover,#f5f6f8)] active:bg-[var(--sl-btn2-press,#eceef2)] active:shadow-[var(--sl-btn2-press-depth,inset_0_1px_2px_rgba(16,24,40,0.12))]"
export const ROW_ACTION = `inline-flex h-9 shrink-0 select-none items-center justify-center gap-1.5 ${RADIUS} ${CALM} px-3 text-[13px] font-semibold transition-[background-color,border-color,box-shadow,translate] duration-150 active:translate-y-px active:duration-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:cursor-default disabled:active:translate-y-0 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]`

/** The row's More beside it: the same button, square, so the two read as one pair in both looks. */
export const ROW_ICON_ACTION = `${ROW_ACTION} w-9 px-0`

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
  /* One formatter for the page: toLocaleDateString builds a new one on every call, which a list of purchases paid per row (round 25: 27ms of the library's arrival at 4x CPU). */
  SHORT_DATE ??= new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  return SHORT_DATE.format(d)
}
let SHORT_DATE: Intl.DateTimeFormat | null = null
