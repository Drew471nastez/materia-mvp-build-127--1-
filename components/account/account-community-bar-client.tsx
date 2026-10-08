"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { SectionTabs } from "@/components/community/member/shell-frame"
import { CommunityTopBar } from "@/components/community/member/top-bar"
import type { NavEntry, TabKey } from "@/components/community/member/nav"
import type { TopBarData } from "@/components/community/member/view-types"
import { enterCommunityContext } from "@/lib/nav/community-context"

export interface AccountCommunityBarData {
  topBar: TopBarData
  entries: NavEntry[]
  unreadMessages: number | null
  communityId: string
  slug: string
}

/** No place in the community is "here" on a profile page. */
const NOWHERE = "" as TabKey

/**
 * The community frame's own bar and places (shell-frame.tsx), with the same
 * search, Messages and "..." menu. Messages opens the community's panel on
 * its home (`?chat=1`, read by the frame), since the panel is the frame's.
 */
export function AccountCommunityBarClient({ data }: { data: AccountCommunityBarData }) {
  const router = useRouter()
  const { slug, communityId } = data
  /* The tab's storage agrees with the cookie the server read. */
  useEffect(() => enterCommunityContext(slug), [slug])
  const search = useMemo(() => ({ communityId }), [communityId])
  const menu = useMemo(() => ({ onInvite: null, savedHref: `/community/${slug}/saved`, membershipHref: `/community/${slug}/membership` }), [slug])
  const onMessages = useCallback(() => router.push(`/community/${slug}?chat=1`), [router, slug])
  return (
    /* In the flow, as inside a community (shell-frame.tsx): the bar is sticky itself, and no native spacer, which would leave a band above the cover. */
    <div className="w-full" data-account-community-chrome="">
      <CommunityTopBar data={data.topBar} messages={data.unreadMessages} onMessages={onMessages} search={search} menu={menu}>
        <SectionTabs entries={data.entries} current={NOWHERE} />
      </CommunityTopBar>
    </div>
  )
}
