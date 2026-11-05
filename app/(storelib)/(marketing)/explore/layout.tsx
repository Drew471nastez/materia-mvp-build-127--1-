import type React from "react"
import { redirect } from "next/navigation"
import { exploreMarketplaceAnswer } from "@/lib/platform/explore-marketplace"
import { EXPLORE_OFF_PATH } from "@/lib/explore/off-target"
import { ExploreMark } from "@/components/analytics/explore-mark"

/*
  EXPLORE STAYS RENDERED PER REQUEST. It was, only because the marketing
  layout read the request; that layout reads nothing now (the owner:
  marketing pages served from the CDN), and /explore/search would have
  turned static: its screen reads useSearchParams under a Suspense, so the
  built HTML would be that Suspense's empty fallback instead of the search
  screen, and the flag check below would be decided at build time. The
  other Explore pages read the visitor (their catalogue cookie, who is
  signed in) and are dynamic on their own.
*/
export const dynamic = "force-dynamic"

export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  /*
    ONLY A REAL "OFF" SENDS ANYBODY AWAY (round 51). A read the database did not answer used to be "off",
    and every visitor was sent to the landing page: the account menu's Explore "goes to storelib.com".
    Unknown now draws Explore (lib/platform/setting-read.ts). When it is off, /api/explore/off decides
    per person, since this render asks nobody who is looking (tests/cdnpages-r49): the app's start gate
    in the iOS and Android apps, the library for somebody signed in, the home page for a stranger.
  */
  const enabled = await exploreMarketplaceAnswer()
  if (enabled === false) redirect(EXPLORE_OFF_PATH)
  /* A creator's page opened from here counts Storelib Explore as its source (components/analytics/explore-mark). */
  return (
    <>
      {children}
      <ExploreMark />
    </>
  )
}
