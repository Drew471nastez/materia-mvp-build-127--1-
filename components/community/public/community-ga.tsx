"use client"

/**
 * A JOIN THAT FINISHED ON THE SERVER (back from signing up with ?join=1, the
 * page joins and opens on ?welcome=1) is told to the store's Google
 * Analytics here, once; a join pressed on the page tells it itself
 * (components/community/public/join-controls.tsx enterCommunity). The
 * address is read while rendering, before the member's frame tidies
 * ?welcome away. lib/communities/client/ga-events.ts says what is sent.
 */
import { useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { gaCommunityJoin } from "@/lib/communities/client/ga-events"

export function CommunityGaEvents({ slug }: { slug: string }) {
  const params = useSearchParams()
  const welcomed = useRef(params.get("welcome") === "1")
  useEffect(() => {
    if (welcomed.current) gaCommunityJoin(window, slug)
  }, [slug])
  return null
}
