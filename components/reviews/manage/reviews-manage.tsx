"use client"

/**
 * ===========================================================================
 *  STORELIB REVIEWS, MANAGED IN ONE PLACE (round K5)
 * ===========================================================================
 * "Reviews lives inside Integrations but Manage jumps to /app/reviews, which
 * feels disconnected." Everything about the app is on its integration page
 * now, under the header with its mark and status:
 *
 *   Overview    the average, how many, what waits, requests and how many
 *               became reviews, the latest reviews
 *   Reviews     every review: status tabs, search, filters, pages from the
 *               server, select several, reply, photos, import
 *   Requests    every review request, ask an order by hand, when they go,
 *               and the email itself
 *   Widgets     where the reviews show on the website (components/reviews/
 *               manage/widgets-slot.tsx, the widgets gallery's place)
 *   Analytics   reviews and ratings over time, the request funnel, against
 *               the period before
 *   Settings    on or off, how new reviews are handled, who may write, how
 *               they look. The request schedule lives under Requests, so
 *               every setting is in one place only.
 *
 * The view is in the address (?view=reviews), written in place, so a link
 * opens it and a refresh keeps it. /app/reviews (the sidebar, the bell, the
 * review emails) sends here: ?review=<id> opens Reviews with that review,
 * ?status=pending opens its Pending tab.
 *
 * Mounted by the integration page through components/app/settings/
 * built-in-app-pages.tsx, the one hook a built in app has into the generic
 * detail page.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { REVIEW_TABS, type ReviewTab } from "@/lib/reviews/manage"
import { OverviewView } from "./overview-view"
import { ReviewsView } from "./reviews-view"
import { RequestsView } from "./requests-view"
import { AnalyticsView } from "./analytics-view"
import { SettingsView } from "./settings-view"
import { ReviewsWidgetsTab } from "./widgets-slot"

export const MANAGE_VIEWS = ["overview", "reviews", "requests", "widgets", "analytics", "settings"] as const
export type ManageView = (typeof MANAGE_VIEWS)[number]

const VIEW_LABEL: Record<ManageView, () => string> = {
  overview: () => tt("Overview"),
  reviews: () => tt("Reviews"),
  requests: () => tt("Requests"),
  widgets: () => tt("Widgets"),
  analytics: () => tt("Analytics"),
  settings: () => tt("Settings"),
}

const VIEW_PARAM = "view"

function readAddress(): { view: ManageView | null; review: string | null; status: ReviewTab | null } {
  try {
    const p = new URLSearchParams(window.location.search)
    const v = p.get(VIEW_PARAM)
    const s = p.get("status")
    return {
      view: (MANAGE_VIEWS as readonly string[]).includes(v ?? "") ? (v as ManageView) : null,
      review: p.get("review"),
      status: (REVIEW_TABS as readonly string[]).includes(s ?? "") ? (s as ReviewTab) : null,
    }
  } catch {
    return { view: null, review: null, status: null }
  }
}

function writeView(view: ManageView) {
  try {
    const url = new URL(window.location.href)
    if (view === "overview") url.searchParams.delete(VIEW_PARAM)
    else url.searchParams.set(VIEW_PARAM, view)
    /* A review or a status the bell asked for is for the first view only. */
    url.searchParams.delete("review")
    url.searchParams.delete("status")
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.toString())
  } catch {
    /* An address that cannot be written: the view still changes. */
  }
}

export interface ReviewsManageProps {
  /** Turned on or off from Settings: the integration page's status and badge follow. */
  onAppChanged?: (on: boolean) => void
}

export function ReviewsManage({ onAppChanged }: ReviewsManageProps) {
  const [view, setView] = React.useState<ManageView>("overview")
  const [focus, setFocus] = React.useState<{ review: string | null; status: ReviewTab | null }>({ review: null, status: null })
  /* The address is read once the page is in the browser, so the server and the first frame agree. */
  React.useEffect(() => {
    const a = readAddress()
    setFocus({ review: a.review, status: a.status })
    if (a.view) setView(a.view)
    else if (a.review || a.status) setView("reviews")
  }, [])
  const go = React.useCallback((next: ManageView, opts?: { status?: ReviewTab }) => {
    setView(next)
    setFocus({ review: null, status: opts?.status ?? null })
    writeView(next)
  }, [])

  return (
    <div className="space-y-4 sm:space-y-5" data-reviews-manage="" data-reviews-view={view}>
      <nav aria-label={tt("Storelib Reviews")} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div role="tablist" className="flex min-w-max gap-1 border-b border-[#e5e7eb] sm:min-w-0">
          {MANAGE_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              id={`reviews-tab-${v}`}
              aria-selected={view === v}
              aria-controls="reviews-view"
              onClick={() => go(v)}
              data-reviews-nav={v}
              className={cn(
                "relative -mb-px inline-flex h-11 shrink-0 cursor-pointer items-center whitespace-nowrap px-3 text-[14px] font-medium outline-none transition-colors duration-100 focus-visible:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]",
                view === v ? "text-[#1a1a2e] after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
              )}
            >
              {VIEW_LABEL[v]()}
            </button>
          ))}
        </div>
      </nav>

      <div id="reviews-view" role="tabpanel" aria-labelledby={`reviews-tab-${view}`}>
        {view === "overview" ? <OverviewView onGo={go} /> : null}
        {view === "reviews" ? <ReviewsView initialTab={focus.status ?? "all"} highlight={focus.review} /> : null}
        {view === "requests" ? <RequestsView /> : null}
        {view === "widgets" ? <ReviewsWidgetsTab /> : null}
        {view === "analytics" ? <AnalyticsView /> : null}
        {view === "settings" ? <SettingsView onAppChanged={onAppChanged} /> : null}
      </div>
    </div>
  )
}
