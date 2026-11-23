"use client"

/**
 * ===========================================================================
 *  STORELIB REVIEWS IN ITS INTEGRATION PAGE (round K5, on K4's plug-in API)
 * ===========================================================================
 * The view components/app/settings/integration-apps.tsx registers for
 * "storelib-reviews": six tabs under the integration's header, the open one
 * in ?view=, and the body is the managed page (./reviews-manage.tsx
 * ReviewsManageBody), loaded on demand so the integrations directory's own
 * bundle stays the size it was.
 *
 * The Settings tab is the app's settings (on or off, new reviews, who may
 * write, the website) with the shell's own Status, Turn off, What it does
 * and Your data under it and At a glance beside it, so nothing the old page
 * had is lost. When review emails go is set under Requests only.
 */
import * as React from "react"
import dynamic from "next/dynamic"
import { tt } from "@/lib/i18n/text"
import type { IntegrationAppBodyProps, IntegrationAppView } from "@/components/app/settings/integration-apps"
import { MANAGE_VIEWS, type ManageView } from "./views"

function Loading() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label={tt("Loading")}>
      <div className="h-[188px] animate-pulse rounded-2xl bg-[#f3f4f6]" />
      <div className="h-[260px] animate-pulse rounded-2xl bg-[#f3f4f6]" />
    </div>
  )
}

const ReviewsManageBody = dynamic(() => import("./reviews-manage").then((m) => m.ReviewsManageBody), { ssr: false, loading: Loading })

const LABEL: Record<ManageView, () => string> = {
  overview: () => tt("Overview"),
  reviews: () => tt("Reviews"),
  requests: () => tt("Requests"),
  widgets: () => tt("Widgets"),
  analytics: () => tt("Analytics"),
  settings: () => tt("Settings"),
}

const isView = (v: string): v is ManageView => (MANAGE_VIEWS as readonly string[]).includes(v)

function ReviewsIntegrationBody({ tab, warm, setTab, sections, Layout, onChanged }: IntegrationAppBodyProps) {
  const view: ManageView = isView(tab) ? tab : "overview"
  const body = (
    <ReviewsManageBody
      view={view}
      warm={warm && isView(warm) ? warm : null}
      onGo={setTab}
      onAppChanged={onChanged}
      settingsExtra={
        <>
          {sections.status}
          {sections.danger}
          {sections.overview}
          {sections.data}
        </>
      }
    />
  )
  /*
    At a glance beside the settings, as the page has it for every integration; the other views use the full width.
    One tree for every tab (round 27): the body was drawn bare on five tabs and inside the layout on Settings, so going
    to Settings or leaving it built the whole page again, every tab's reads and grey boxes with it.
  */
  /* Round 58: the installed page template's column beside Settings, What is synced over At a glance. */
  return (
    <Layout
      main={body}
      aside={
        view === "settings" ? (
          <div className="min-w-0 space-y-4 sm:space-y-5" data-installed-side="">
            {sections.synced}
            {sections.glance}
          </div>
        ) : undefined
      }
    />
  )
}

export const reviewsIntegrationView: IntegrationAppView = {
  tabs: () => MANAGE_VIEWS.map((id) => ({ id, label: LABEL[id]() })),
  defaultTab: "overview",
  Body: ReviewsIntegrationBody,
}
