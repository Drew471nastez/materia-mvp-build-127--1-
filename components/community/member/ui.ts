/**
 * THE MEMBER AREA'S FEW SURFACES, named once. White on the page's #f8f9fa,
 * hairlines rather than shadows, near black for the one primary action, and
 * no violet fill anywhere a member looks (ARCH 5).
 */
export const CARD = "rounded-2xl border border-[#e5e7eb]/80 bg-white"
export const HAIRLINE = "border-[#eceef1]"
export const INK = "#1a1a2e"
export const MUTED = "#6b7280"

/**
 * "EXTREMELY LITTLE" DEPTH (round 7, Polaris by way of Storelib): a control
 * that can be pressed carries a hairline and a one pixel soft shadow under
 * it, never more. DEPTH is the white surface (a chip, a secondary button),
 * DEPTH_INK the filled near black one (the chosen chip, the primary button),
 * whose shadow is a touch darker so it still reads on the page's #f8f9fa.
 * Both press in by a hair (the shadow goes) rather than scaling.
 */
export const DEPTH = "border border-[#e3e5e9] bg-white shadow-[0_1px_1px_rgba(16,24,40,0.05)]"
export const DEPTH_INK = "border border-[#1a1a2e] bg-[#1a1a2e] shadow-[0_1px_1.5px_rgba(16,24,40,0.18)]"
export const DEPTH_PRESS = "active:shadow-none"

/**
 * An icon control in the community's bar with that same depth: the
 * hamburger. 40px, squared at 10px (not a pill), the faintest grey ground,
 * a hairline and a one pixel shadow.
 */
export const DEPTH_ICON_BTN =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer select-none items-center justify-center rounded-[10px] border border-[#e6e8eb] bg-[#f8f9fa] text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.04)] outline-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-[#dcdfe3] hover:bg-[#f1f2f4] active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

/**
 * A FLAT ICON CONTROL in the community's bar (round 9, the account "..."):
 * no ground, no hairline and no shadow at rest; a soft grey tint under a
 * pointer and while its menu is open. 40px, squared at 10px, so the tint is
 * never a pill.
 */
export const FLAT_ICON_BTN =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer select-none items-center justify-center rounded-[10px] bg-transparent text-[#4b5563] outline-none transition-[background-color,color] duration-150 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] data-[state=open]:bg-[#f1f2f4] data-[state=open]:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

/* Pressed, a button dims on the first frame and comes back when it lifts: no scale, so nothing bumps (round 11). */
export const BTN =
  "inline-flex shrink-0 touch-manipulation select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[14px] font-medium outline-none transition-[background-color,color,opacity,box-shadow] duration-150 active:opacity-80 active:duration-0 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
export const BTN_PRIMARY = `${BTN} h-10 ${DEPTH_INK} px-4 text-white hover:bg-[#2b2b42] sm:h-9`
export const BTN_SECONDARY = `${BTN} h-10 ${DEPTH} ${DEPTH_PRESS} px-4 text-[#1a1a2e] hover:bg-[#f6f7f8] sm:h-9`
export const BTN_GHOST = `${BTN} h-10 px-3 text-[#4b5563] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] sm:h-9`
/** A round 40px tap target around an 18px icon. */
export const ICON_BTN = `${BTN} h-10 w-10 text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]`

/** Library's pill (components/library/library-tabs.tsx PILL), white on a hairline, the chosen one pressed in. */
export const PILL =
  "relative inline-flex h-10 shrink-0 cursor-pointer touch-manipulation select-none items-center justify-center gap-1 whitespace-nowrap rounded-full border px-4 text-[14px] font-medium outline-none transition-[color,background-color,box-shadow] duration-150 lg:h-9 lg:text-[13px] active:bg-[#f0f1f3] active:duration-0 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
export const PILL_ON = "border-[#d7dadf] bg-[#e2e4e8] text-[#1a1a2e] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
export const PILL_OFF = "border-[#e4e7ec] bg-white text-[#6b7280] shadow-[0_1px_1px_rgba(16,24,40,0.05)] hover:text-[#1a1a2e]"

/**
 * A section tab in the row under the community's bar: plain words, no box.
 * The chosen one is ink with a 2px underline on the row's bottom edge; the
 * rest are muted and darken on hover; a press dims it at once (round 10:
 * feedback on the first frame). 40px tall, so a thumb finds it. The
 * row is a phone's and a tablet's (and About's, which has no left column):
 * from 1024px the places are the list in the left column (wall.tsx).
 */
export const TAB =
  "group/tab relative inline-flex h-10 shrink-0 cursor-pointer touch-manipulation select-none items-center whitespace-nowrap px-0.5 text-[14.5px] font-medium outline-none transition-colors duration-150 active:opacity-55 data-[pressed]:opacity-55 focus-visible:text-[#1a1a2e] focus-visible:underline focus-visible:decoration-[#1a1a2e]/30 focus-visible:underline-offset-4 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] sm:text-[14px]"
export const TAB_ON = "text-[#1a1a2e]"
export const TAB_OFF = "text-[#6b7280] hover:text-[#1a1a2e]"

/**
 * An icon in the community's bar: the glyph alone, no disc or pill behind
 * it in any state. It darkens on hover and dims for a moment on press; the
 * box is still a 40px target, squared at 10px so even a keyboard focus ring
 * is not a pill.
 */
export const PLAIN_ICON_BTN =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer select-none items-center justify-center rounded-[10px] bg-transparent text-[#6b7280] outline-none transition-[color,opacity] duration-150 hover:bg-transparent hover:text-[#1a1a2e] active:opacity-60 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"

/** A field that is 16px on a phone so iOS does not zoom into it. */
export const FIELD =
  "w-full rounded-xl border border-[#e3e4e8] bg-white px-3.5 py-2.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:ring-2 focus:ring-[#1a1a2e]/[0.06] sm:text-[14px]"

/**
 * PRESSED ON THE FIRST FRAME (round 10). A browser on a phone holds :active
 * back for a moment while it decides whether a touch is a tap or the start
 * of a scroll, so a press drawn by :active alone can come late. These mark
 * the element itself the moment the pointer lands (data-pressed, written
 * on the node, no render), and take it off when the pointer lifts, leaves,
 * or the browser takes the touch for a scroll (pointercancel). Style it with
 * data-[pressed]:. For client components only (they are functions).
 */
function unpress(e: { currentTarget: Element }) {
  e.currentTarget.removeAttribute("data-pressed")
}
export function press(e: { currentTarget: Element; button: number }) {
  if (e.button === 0) e.currentTarget.setAttribute("data-pressed", "")
}
export const PRESS_PROPS = { onPointerDown: press, onPointerUp: unpress, onPointerCancel: unpress, onPointerLeave: unpress }
