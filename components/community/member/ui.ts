/**
 * THE MEMBER AREA'S FEW SURFACES, named once. White on the page's #f8f9fa,
 * hairlines rather than shadows, near black for the one primary action, and
 * no violet fill anywhere a member looks (ARCH 5).
 */
export const CARD = "rounded-2xl border border-[#e5e7eb]/80 bg-white"
export const HAIRLINE = "border-[#eceef1]"
export const INK = "#1a1a2e"
export const MUTED = "#6b7280"

export const BTN =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[14px] font-medium outline-none transition-[background-color,color,scale] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
export const BTN_PRIMARY = `${BTN} h-10 bg-[#1a1a2e] px-4 text-white hover:bg-[#2b2b42] sm:h-9`
export const BTN_SECONDARY = `${BTN} h-10 border border-[#e3e4e8] bg-white px-4 text-[#1a1a2e] hover:bg-[#f6f7f8] sm:h-9`
export const BTN_GHOST = `${BTN} h-10 px-3 text-[#4b5563] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] sm:h-9`
/** A round 40px tap target around an 18px icon. */
export const ICON_BTN = `${BTN} h-10 w-10 text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]`

/** Library's pill (components/library/library-tabs.tsx PILL), white on a hairline, the chosen one pressed in. */
export const PILL =
  "relative inline-flex h-10 shrink-0 cursor-pointer select-none items-center justify-center gap-1 whitespace-nowrap rounded-full border px-4 text-[14px] font-medium outline-none transition-[color,scale] lg:h-9 lg:text-[13px] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]"
export const PILL_ON = "border-[#d7dadf] bg-[#e2e4e8] text-[#1a1a2e] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
export const PILL_OFF = "border-[#e4e7ec] bg-white text-[#6b7280] hover:text-[#1a1a2e]"

/**
 * A section tab under the community's bar: plain words, no box. The chosen
 * one is ink with a 2px underline on the bar's bottom edge; the rest are
 * muted and darken on hover. 44px tall so a thumb finds it.
 */
export const TAB =
  "group/tab relative inline-flex h-11 shrink-0 cursor-pointer select-none items-center whitespace-nowrap rounded-md px-0.5 text-[14.5px] font-medium outline-none transition-colors duration-150 focus-visible:bg-[#f1f2f4] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] sm:text-[14px]"
export const TAB_ON = "text-[#1a1a2e]"
export const TAB_OFF = "text-[#6b7280] hover:text-[#1a1a2e]"

/** A field that is 16px on a phone so iOS does not zoom into it. */
export const FIELD =
  "w-full rounded-xl border border-[#e3e4e8] bg-white px-3.5 py-2.5 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:ring-2 focus:ring-[#1a1a2e]/[0.06] sm:text-[14px]"
