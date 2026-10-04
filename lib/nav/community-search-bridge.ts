/**
 * ===========================================================================
 *  THE TAB BAR'S SEARCH, INSIDE A COMMUNITY, OPENS THE COMMUNITY'S SEARCH
 * ===========================================================================
 * The community's search screen belongs to its top bar
 * (components/community/member/search.tsx, CommunitySearchButton), which is
 * drawn for members only. The phone's tab bar (components/nav/buyer-tab-bar)
 * is drawn by the marketing layout above it and knows the community only by
 * its address. This is the meeting point, small on purpose so the tab bar
 * does not carry the search screen's code on every other page:
 *
 *   the search button registers its opener for its community's slug while
 *   it is mounted, and the tab bar asks for the opener of the slug in the
 *   address. Nothing registered (somebody who is not a member, on the
 *   community's sales page) and the tab bar opens the site's own search.
 *
 * The opener runs inside the tap, so the field it focuses brings the
 * keyboard up on iOS, as the site search does.
 */

type Opener = { open: () => void; refocus: () => void }

const openers = new Map<string, Opener>()

/** Called by the community's search button while it is mounted; returns the unregister. */
export function registerCommunitySearch(slug: string, opener: Opener): () => void {
  openers.set(slug, opener)
  return () => {
    if (openers.get(slug) === opener) openers.delete(slug)
  }
}

/** Open the search of this community, if one is on the page. True when it opened. */
export function openCommunitySearch(slug: string | null | undefined): boolean {
  const o = slug ? openers.get(slug) : undefined
  if (!o) return false
  o.open()
  return true
}

/** Give the open community search its field again (a touch's end, for older WebKit). */
export function refocusCommunitySearch(slug: string | null | undefined): void {
  const o = slug ? openers.get(slug) : undefined
  o?.refocus()
}
