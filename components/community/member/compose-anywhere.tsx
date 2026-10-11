"use client"

/**
 * ===========================================================================
 *  CREATE POST OVER THE PLACE YOU ARE ON (round 21)
 * ===========================================================================
 * The tab bar's Create post inside a community, on a phone, pressed on Learn,
 * the Calendar, Members or a profile, used to take the member to the feed and
 * open the feed's composer there: the place jumped away first. The composer
 * is a sheet over the screen on a phone, so it needs no feed under it. This is
 * the shell's own composer, asked only when no composer on screen took the
 * request (compose-intent.ts setComposeFallback): it opens the same sheet over
 * the place as it is, from the feed's data already in hand (read ahead with
 * every place), and once posted the post waits for the feed
 * (feed-cache.ts notePostedAway), which shows it at the top of its list when
 * the member goes there. A toast says "Posted".
 *
 * It says no (and the tab bar goes to the feed, as before) on a computer,
 * where the composer opens in place in the feed, and when the feed's data is
 * not in hand or this member may not post anywhere.
 */
import { useEffect, useState } from "react"
import { setComposeFallback } from "@/lib/communities/client/compose-intent"
import { readPlace } from "@/lib/communities/client/place-cache"
import type { PlaceData } from "@/lib/communities/client/place-data"
import { Composer } from "./composer"
import { composerSpacesOf } from "./feed"
import { notePostedAway } from "./feed-cache"

type FeedData = Extract<PlaceData, { kind: "feed" }>

/** What the composer needs from the feed's data, or null when it cannot open here. */
export function composeFrom(data: unknown): { compose: NonNullable<FeedData["compose"]>; spaces: ReturnType<typeof composerSpacesOf> } | null {
  const d = data as Partial<FeedData> | null
  if (!d || d.kind !== "feed" || d.readOnly || !d.compose || !d.spaces) return null
  const spaces = composerSpacesOf(d.spaces)
  return spaces.length ? { compose: d.compose, spaces } : null
}

export function ComposeAnywhere({ communityId }: { communityId: string }) {
  const [asked, setAsked] = useState<{ n: number; open: NonNullable<ReturnType<typeof composeFrom>> } | null>(null)
  useEffect(
    () =>
      setComposeFallback((req) => {
        /* A request for one space is the feed's to answer (its composer knows the space's rules). */
        if (req.spaceSlug || !window.matchMedia?.("(max-width: 639px)").matches) return false
        const open = composeFrom(readPlace(communityId, { kind: "feed" })?.data ?? null)
        if (!open) return false
        setAsked((a) => a ?? { n: Date.now(), open })
        return true
      }),
    [communityId],
  )
  if (!asked) return null
  const { compose, spaces } = asked.open
  return (
    <Composer
      key={asked.n}
      communityId={communityId}
      userId={compose.userId}
      me={compose.me}
      fileProductId={compose.fileProductId}
      eventHref={compose.eventHref}
      spaces={spaces}
      onPosted={(post) => notePostedAway(communityId, post)}
      away={{ onClosed: () => setAsked(null) }}
    />
  )
}
