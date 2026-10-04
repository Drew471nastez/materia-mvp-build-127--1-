/**
 * ===========================================================================
 *  A CREATOR PAGE'S COMMUNITIES TAB
 * ===========================================================================
 * "Creator pages (creators with a store): NO Activity tab; the Communities
 * tab lists ONLY communities they created (not ones they joined); none ->
 * the 'No communities yet' panel as before."
 *
 *   switched off   no tab at all (`null`): nothing about communities shows
 *   none made      the tab, opening onto "No communities yet", the panel
 *                  every creator page had before communities existed
 *   some made      the tab, with their published public communities as
 *                  cards in the page's own scheme
 *
 * The communities they only joined are a plain profile's business (/@handle,
 * components/profile/member-profile-page.tsx), never a creator page's. One
 * function for both of the page's branches (app/(marketing)/u/[username],
 * which names the tab itself), and the one scripts/render-profile.tsx
 * draws, so the probe measures the panel the page really builds.
 *
 * No "use client": the page builds it on the server.
 */
import type { ReactNode } from "react"
import { EmptyTabPanel } from "@/components/storefront/storefront-tabs"
import { StorefrontCommunities } from "@/components/community/public/storefront-communities"
import type { CommunityCard } from "@/lib/communities/types"

export function creatorCommunitiesPanel(cards: CommunityCard[] | null): ReactNode | null {
  if (cards === null) return null
  return cards.length ? <StorefrontCommunities cards={cards} /> : <EmptyTabPanel icon="communities" title="No communities yet" detail="This creator hasn't opened any yet." />
}
