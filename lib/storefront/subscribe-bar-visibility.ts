/**
 * ===========================================================================
 *  WHO ASKED FOR THE BAR ABOVE THE COVER
 * ===========================================================================
 * A creator page used to open on a newsletter bar: an email box and a
 * Subscribe button pinned over the cover. The owner asked for it gone, "and
 * especially not when somebody arrives from a community and taps a person's
 * profile".
 *
 * WHOSE BAR IT WAS. It was ours. `defaultSubscribeBarSettings.visible` is
 * `true` for every account (lib/store-builder/defaults.ts), the builder has no
 * "Show Subscribe Bar" switch at all (it was deleted), and the storefront went
 * further and forced `visible: true` over any stored `false`, with a comment
 * saying the bar "is not optional". So no creator ever chose it and no creator
 * could ever turn it off.
 *
 * SO IT IS NOT DRAWN. The way back and the creator's name, which the bar
 * carried for a visitor arriving from a community or from Explore, are the
 * slim top bar's job instead (components/profile/profile-top-bar.tsx), which
 * the page already draws whenever the bar is absent.
 *
 * The rule is written out in full rather than as a constant `false`, because
 * the half that is switched off is the half somebody will want back: if a
 * creator is ever given the switch, their own storefront may show the bar, and
 * the path from a community to a person's page still may not.
 */

export interface SubscribeBarChoice {
  /**
   * Set only when a creator has asked for the bar on their own storefront.
   * Nothing sets it today: there is no switch for it anywhere in the builder,
   * and the stored `visible` flag is a value the builder wrote out on every
   * save rather than an answer anybody gave.
   */
  chosenByCreator?: boolean
  /** The page was opened from a community: a post, a comment, a member list. */
  fromCommunity?: boolean
}

/** Whether the bar above the cover is drawn on a creator page or a profile. */
export function showsSubscribeBar(choice: SubscribeBarChoice = {}): boolean {
  if (!choice.chosenByCreator) return false
  return !choice.fromCommunity
}
