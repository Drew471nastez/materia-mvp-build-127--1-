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
 * IT IS BACK, ASKED FOR BY NAME: the bar on the creator page, edited in the
 * store builder and with the owner's pencil on the live page. The creator page
 * passes `chosenByCreator` and the bar is drawn as they set it. The half of
 * the earlier request that stands is the community one: a visit that arrives
 * from a community gets the slim top bar (components/profile/profile-top-bar.tsx)
 * with the way back, never the newsletter bar.
 */

export interface SubscribeBarChoice {
  /** The creator page draws the bar as its creator set it in the builder. */
  chosenByCreator?: boolean
  /** The page was opened from a community: a post, a comment, a member list. */
  fromCommunity?: boolean
}

/** Whether the bar above the cover is drawn on a creator page or a profile. */
export function showsSubscribeBar(choice: SubscribeBarChoice = {}): boolean {
  if (!choice.chosenByCreator) return false
  return !choice.fromCommunity
}
