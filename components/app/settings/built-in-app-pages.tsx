"use client"

/**
 * ===========================================================================
 *  A BUILT IN APP'S OWN PAGE INSIDE ITS INTEGRATION
 * ===========================================================================
 * The integration page (./integrations-directory.tsx IntegrationPage) is the
 * same for every integration: Back, the header with the mark, the name and
 * where it stands, then Set up, What it does and At a glance. A built in app
 * that is managed in full there, rather than set up and left, hands the
 * page its own body instead of those cards: the header stays, and under it
 * the app draws its own tabs and views.
 *
 *   BUILT_IN_APP_PAGES[<catalog id>]  the app's body, given `onAppChanged`
 *                                     so the header's status and the
 *                                     directory's badge follow its switch
 *
 * Loaded on demand, so the directory's own bundle stays the size it was.
 * Storelib Reviews is the first (components/reviews/manage).
 */
import * as React from "react"
import dynamic from "next/dynamic"
import { tt } from "@/lib/i18n/text"

export interface BuiltInAppPageProps {
  /** The app was turned on or off from its own page. */
  onAppChanged: (on: boolean) => void
}

function Loading() {
  return (
    <div className="space-y-4" aria-label={tt("Loading")}>
      <div className="h-11 animate-pulse rounded-xl bg-[#f3f4f6]" />
      <div className="h-[188px] animate-pulse rounded-2xl bg-[#f3f4f6]" />
    </div>
  )
}

const ReviewsManage = dynamic(() => import("@/components/reviews/manage/reviews-manage").then((m) => m.ReviewsManage), { ssr: false, loading: Loading })

export const BUILT_IN_APP_PAGES: Partial<Record<string, React.ComponentType<BuiltInAppPageProps>>> = {
  "storelib-reviews": ({ onAppChanged }) => <ReviewsManage onAppChanged={onAppChanged} />,
}
