/**
 * ===========================================================================
 *  THE SEARCH FIELD'S LOOK, SHARED BY EXPLORE'S HERO AND THE HEADER
 * ===========================================================================
 * The owner asked for the header's search (the one that arrives once Explore's
 * own field has scrolled away) to stop being a pill and to look like the
 * hero's field: the same 10px corner, the same hairline, the same depth, and
 * the same focus. Both draw from these strings, so the two cannot drift.
 *
 * WHY THESE NUMBERS. 10px, per the owner: a pill reads as a chip, this is a
 * field. The shadow is ten per cent shallower than the hero's first one
 * (offsets, blurs and both alphas scaled by 0.9), level with the discover
 * chip above the hero, which sits at 0.05 and 0.30 against 0.045 and 0.315.
 * Focus darkens the hairline (neutral-200/80 to neutral-300) and deepens the
 * shadow a touch, with no violet halo: on a phone focus is the first thing
 * that happens, and a purple glow was the loudest thing on the screen.
 *
 * Only the height differs: 52 / 62px under the hero heading, 44px in the
 * header bar, whose buttons are 42px and which would grow to hold a 62px
 * field.
 */

/** Ground, corner, hairline and resting depth. */
export const SEARCH_FIELD_SURFACE =
  "appearance-none rounded-[10px] bg-white border border-neutral-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.045),0_9px_27px_-16px_rgba(15,23,42,0.315)]"

/** Focus: a darker hairline and a slightly deeper shadow, eased. */
export const SEARCH_FIELD_FOCUS =
  "outline-none transition-[box-shadow,border-color] focus:border-neutral-300 focus:shadow-[0_1px_3px_rgba(15,23,42,0.054),0_11px_27px_-16px_rgba(15,23,42,0.36)]"
