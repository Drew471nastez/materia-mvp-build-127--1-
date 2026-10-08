import "server-only"

/**
 * ===========================================================================
 *  THE COMMUNITY'S OWN BAR, ON YOUR PROFILE AND SETTINGS
 * ===========================================================================
 * Asked for: from inside a community, Profile and Settings keep "the same
 * header, the exact one that is on the community's home", on a phone and on
 * a computer. It was a fetch after the page woke up, drawn without search,
 * Messages, Saved or Membership, and only on two of the pages, so the page
 * opened with Storelib's header, lost it, and grew a bar a moment later.
 *
 * Now the server knows the community (the session cookie the tab's context
 * writes, lib/nav/community-cookie.ts), reads the same top bar the
 * community's frame reads (shell.tsx), and draws it in the first paint, with
 * the places under it on a phone. Dashboard, Settings, Membership and Log out
 * are in its "..." menu, as they are in the community.
 *
 * Null when there is no community, or the person is not a member of it:
 * the page keeps Storelib's header.
 */
import { cookies } from "next/headers"
import { memberPage, shellData } from "@/components/community/member/data"
import { navEntries } from "@/components/community/member/nav"
import { topBarData } from "@/lib/communities/server/public"
import { COMMUNITY_CONTEXT_COOKIE, communityFromCookie } from "@/lib/nav/community-cookie"
import { AccountCommunityBarClient, type AccountCommunityBarData } from "./account-community-bar-client"

export async function accountCommunityBar(): Promise<AccountCommunityBarData | null> {
  try {
    const slug = communityFromCookie((await cookies()).get(COMMUNITY_CONTEXT_COOKIE)?.value)
    if (!slug) return null
    const page = await memberPage(slug)
    if (page.state !== "member" || !page.community || !page.viewer) return null
    const [topBar, shell] = await Promise.all([topBarData(page.community, page.viewer), shellData(page.community.id, page.viewer, page.community)])
    return {
      topBar,
      entries: navEntries(shell.community, !!page.viewer.can.manage_members),
      unreadMessages: shell.unreadMessages,
      communityId: page.community.id,
      slug: page.community.slug,
    }
  } catch {
    /* Anything wrong reading it: Storelib's header, as before. */
    return null
  }
}

export function AccountCommunityBar({ data }: { data: AccountCommunityBarData }) {
  return <AccountCommunityBarClient data={data} />
}
