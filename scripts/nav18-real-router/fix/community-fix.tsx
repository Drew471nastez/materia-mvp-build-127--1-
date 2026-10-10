"use client"
import type React from "react"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { PlaceSeed } from "@/components/community/member/place-host"
import { community, viewer, topBar, wall, spaces, feedData, CID } from "./data"
export function CommunityFix({ children }: { children: React.ReactNode }) {
  return (
    <ShellFrame community={community} viewer={viewer} topBar={topBar()} unreadMessages={2} wall={wall} chatSpaces={spaces.filter((s) => s.kind === "chat").map((s) => s.slug)}>
      {children}
    </ShellFrame>
  )
}
export function FeedSeedFix() {
  return <PlaceSeed communityId={CID} slug={community.slug} place={{ kind: "feed" }} data={feedData} />
}
