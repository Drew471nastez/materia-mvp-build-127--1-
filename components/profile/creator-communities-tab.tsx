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
import { CommunityContributions } from "./community-contributions"

export function creatorCommunitiesPanel(cards: CommunityCard[] | null): ReactNode | null {
  if (cards === null) return null
  if (!cards.length) return <EmptyTabPanel icon="communities" title="No communities yet" detail="This creator hasn't opened any yet." />
  /*
    THEIR CONTRIBUTIONS UNDER THE CARDS (round 13, ask 30): in the communities on the tab that the viewer is in too (or, for the
    creator, their own), what they gave each one and their posts there. The page is the same for everyone, so the viewer's part
    is asked for in the browser and draws nothing until there is some.
  */
  const creator = cards.find((c) => c.creator?.id)?.creator ?? null
  const first = (creator?.name || "").trim().split(/\s+/)[0] || "They"
  return (
    <StorefrontCommunities cards={cards}>
      {creator?.id ? <CommunityContributions userId={creator.id} firstName={first} only={cards.map((c) => c.id)} tone="storefront" /> : null}
    </StorefrontCommunities>
  )
}
