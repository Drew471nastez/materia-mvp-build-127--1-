/**
 * ===========================================================================
 *  BUTTONS WITH A LITTLE DEPTH, FOR ANY LIGHT SURFACE IN /app
 * ===========================================================================
 * Shaped like Polaris buttons: a white secondary with a hairline border and a
 * soft shade along its foot, and a red one for the action that throws work
 * away, with a line of light on top and a darker line under it. Pressed, both
 * go flat: the shade under the button becomes a shade inside it, which is how
 * a real key reads when it is down. No gradients, no glow.
 *
 * Only the look and the press. Size, radius and padding are the caller's, so
 * the product editor's bar, its questions and the Website page's row menus
 * share one depth at their own sizes. The product editor started this
 * (app/app/products/new/editor-buttons.tsx), which re-exports these.
 */
import { cn } from "@/lib/utils"

/** The shade of a button at rest: a line inside its foot and a hairline under it. */
export const REST_SHADOW = "inset 0 -1px 0 rgba(0,0,0,0.08), 0 1px 0 rgba(0,0,0,0.05)"

/** White, hairline border, a soft 1px foot. Flat and a step darker when pressed. */
export const secondaryDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border border-[#d9dbe0] bg-white font-medium text-[#1a1a2e] outline-none",
  "shadow-[inset_0_-1px_0_rgba(0,0,0,0.08),0_1px_0_rgba(0,0,0,0.05)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#f7f7f8] active:bg-[#f1f2f4] active:shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "[-webkit-tap-highlight-color:transparent]",
)

/** Red, for the one action that throws work away. The same light and shade as the primary. */
export const criticalDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap bg-[#c4290c] font-semibold text-white outline-none",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(0,0,0,0.2),0_1px_1px_rgba(0,0,0,0.12)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#ab230a] active:bg-[#921e09] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4290c]",
  "[-webkit-tap-highlight-color:transparent]",
)
