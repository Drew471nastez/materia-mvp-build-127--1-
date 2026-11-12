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
 * the product editor's bar, its questions, the Website page's title buttons
 * and its row menus share one depth at their own sizes. The product editor
 * started this (app/app/products/new/editor-buttons.tsx), which re-exports
 * these.
 *
 * The keyboard outline names its style (`focus-visible:outline-solid`):
 * Tailwind 4's `outline-none` sets the style variable `outline-2` reads to
 * none, so without it the outline had a width and a colour and never drew.
 */
import { cn } from "@/lib/utils"

/** The shade of a button at rest: a line inside its foot and a hairline under it. */
export const REST_SHADOW = "inset 0 -1px 0 rgba(0,0,0,0.08), 0 1px 0 rgba(0,0,0,0.05)"

/** White, hairline border, a soft 1px foot. Flat and a step darker when pressed. */
export const secondaryDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border border-[#d9dbe0] bg-white font-medium text-[#1a1a2e] outline-none",
  "shadow-[inset_0_-1px_0_rgba(0,0,0,0.08),0_1px_0_rgba(0,0,0,0.05)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#f7f7f8] active:bg-[#f1f2f4] active:shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "[-webkit-tap-highlight-color:transparent]",
)

/**
 * THE SQUARE BESIDE A PRIMARY: the secondary with a little more depth. A
 * button that is only an icon has no words to hold it up, so it stands a
 * touch higher than a labelled one: the same white and hairline, a 2px shade
 * inside its foot instead of 1px, and a soft shadow under it. Pressed, it
 * goes flat with the shade inside, like the rest. The Website page's
 * Settings and three dots wear it, so the buttons beside Edit website match.
 */
export const iconDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border border-[#d9dbe0] bg-white font-medium text-[#1a1a2e] outline-none",
  "shadow-[inset_0_-2px_0_rgba(0,0,0,0.07),0_1px_2px_rgba(15,23,42,0.08)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#f7f7f8] active:bg-[#f1f2f4] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "[-webkit-tap-highlight-color:transparent]",
)

/**
 * The solid primary with a line of light on top and a darker line under it,
 * flat and a step darker when pressed. Near black, not the old violet: the
 * owner asked for no purple on the app's actions. Save wears it. Colour and
 * depth only: each caller sets its own size. The Products page's New
 * product is the one exception, and wears accentDepth below.
 */
export const primaryDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap font-semibold text-white outline-none",
  "bg-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.35),0_1px_2px_rgba(16,24,40,0.25)]",
  "transition-[background-color,box-shadow,color] duration-100",
  "hover:bg-[#2a2a40] active:bg-[#0f0f1c] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]/40",
  "[-webkit-tap-highlight-color:transparent]",
)

/**
 * THE VIOLET PRIMARY, FOR THE PRODUCTS PAGE'S NEW PRODUCT. "The New product
 * button needs to be purple there, both on mobile and desktop." The app's
 * primaries went near black (primaryDepth above), and New product went with
 * them; the owner asked for it back in violet, on its own. This is the
 * violet primaryDepth had before that change, to the letter: #8b5cf6 with a
 * line of light on top and a darker line under it, a step darker on hover
 * (#7c3aed) and again when pressed (#6d28d9), flat with the shade inside
 * while it is down, and a violet keyboard outline. No hover shadow: on a
 * touch screen globals.css strips a hover:shadow on the tap, so the press
 * is only a colour and an inset, which a finger does get. Colour and depth
 * only, like the rest: the caller sets its own size.
 */
export const accentDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap font-semibold text-white outline-none",
  "bg-[#8b5cf6] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.18),0_1px_1px_rgba(76,29,149,0.25)]",
  "transition-[background-color,box-shadow,color] duration-100",
  "hover:bg-[#7c3aed] active:bg-[#6d28d9] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.28)]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]",
  "[-webkit-tap-highlight-color:transparent]",
)

/**
 * accentDepth with no pressed state: :active keeps the resting colour and
 * light. For a button a scroll can start on (+ Add in the OnePage editor),
 * where the browser sets :active as the finger lands and the tint reads as
 * a fade; that button draws its own press from data-pressed instead.
 */
export const accentNoActive = "active:bg-[#8b5cf6] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(0,0,0,0.18),0_1px_1px_rgba(76,29,149,0.25)]"

/** Red, for the one action that throws work away. The same light and shade as the primary. */
export const criticalDepth = cn(
  "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap bg-[#c4290c] font-semibold text-white outline-none",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(0,0,0,0.2),0_1px_1px_rgba(0,0,0,0.12)] transition-[background-color,box-shadow] duration-100",
  "hover:bg-[#ab230a] active:bg-[#921e09] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]",
  "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#c4290c]",
  "[-webkit-tap-highlight-color:transparent]",
)
