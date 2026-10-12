/**
 * ===========================================================================
 *  WHICH TOP BAR A CREATOR PAGE OPENS ON
 * ===========================================================================
 * A creator page always has a top bar. Which one depends on how the visitor
 * got there:
 *
 *   OPENED ON ITS OWN   a shared link, a search result, a typed address, a
 *                       reload, Explore: the creator's newsletter bar, their
 *                       photo, their sentence, an email box and Subscribe,
 *                       with the back chevron first when there is a page of
 *                       ours behind. The owner sees the same bar with the
 *                       pencil that edits it (LiveSubscribeBar); a visitor
 *                       gets the plain one (SubscribeBar). It is also the
 *                       bar the creator page editor shows, framed or drawn.
 *   FROM A COMMUNITY    the slim bar instead: the back chevron, the photo and
 *                       the name (components/profile/profile-top-bar.tsx).
 *                       The owner, round 14: the subscribe bar should not be
 *                       there "especially when I arrive from a community",
 *                       and round 15: "it should just be the back icon that's
 *                       in the top bar of the creator page".
 *
 * HOW IT WENT MISSING. Round 14 read the first of those as "never", took the
 * newsletter bar off every creator page and left the slim bar to stand in
 * for it. But the slim bar only draws when there is a way back, so a creator
 * page opened cold (the owner's screenshot 92: storelib.com/<name> in a
 * signed out window) opened straight onto the cover with no top bar at all,
 * and the creator page editor lost its bar and its pencil with it (round 25:
 * "the top bars of the creator pages are missing", "in the creator page
 * editor as well, it should be there").
 *
 * A PERSON'S PROFILE (no store) never has the newsletter bar: there is no
 * list to join. Its top bar is the slim one, always drawn
 * (components/profile/member-profile-page.tsx).
 */

export interface SubscribeBarChoice {
  /** The page is a creator's page (they have a store), not a person's profile. */
  creatorPage?: boolean
  /** The page was opened from a community: a post, a comment, a member list. */
  fromCommunity?: boolean
}

/** Whether the newsletter bar is the top bar of this page. */
export function showsSubscribeBar(choice: SubscribeBarChoice = {}): boolean {
  if (!choice.creatorPage) return false
  return !choice.fromCommunity
}

/**
 * Whether this request came from a community, from what the server can see:
 * the link said so (`?from=community`, or a `?back=` community place that
 * lib/profile/back communityBackTarget has already checked), or the page
 * before it was one (the same origin Referer's path, lib/profile/back
 * refererPath). Pure, so the rule and its test are one thing.
 */
export function cameFromCommunity({
  from,
  backTarget,
  referer,
}: {
  from?: string | null
  backTarget?: string | null
  referer?: string | null
}): boolean {
  if (from === "community" || !!backTarget) return true
  return !!referer && /^\/community(\/|$|\?)/.test(referer)
}
