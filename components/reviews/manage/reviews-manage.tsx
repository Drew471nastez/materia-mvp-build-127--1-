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
 * The view is in the address (?view=reviews), so a link opens it and a
 * refresh keeps it. /app/reviews (the sidebar, the bell, the
 * review emails) sends here: ?review=<id> opens Reviews with that review,
 * ?status=pending opens its Pending tab.
 *
 * Mounted by the integration page (components/app/settings/integration-
 * detail.tsx) through the built in apps' plug-in API (components/app/
 * settings/integration-apps.tsx, ./integration-view.tsx): the page draws the
 * header and these tabs, and the body below is ReviewsManageBody.
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
import { MANAGE_VIEWS, type ManageView } from "./views"
import { ViewShown } from "./parts"

export { MANAGE_VIEWS, type ManageView }

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
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.toString())
  } catch {
    /* An address that cannot be written: the view still changes. */
  }
}

export interface ReviewsManageBodyProps {
  view: ManageView
  /** The view about to be opened (its tab is under the pointer or the finger), drawn hidden ahead of the press. */
  warm?: ManageView | null
  onGo: (view: ManageView) => void
  /** Turned on or off from Settings: the integration page's status and badge follow. */
  onAppChanged?: (on: boolean) => void
  /** What the Settings view draws under the app's own settings (the integration page's About, Your data, Turn off). */
  settingsExtra?: React.ReactNode
}

/**
 * The open view's body, with no tabs of its own: the integration page
 * (components/app/settings/integration-detail.tsx, through ./integration-view.tsx)
 * draws the tabs under its header and keeps the open one in ?view=.
 * ?review=<id> and ?status= (a link from the bell or an email) are read once,
 * for the Reviews view.
 */
export function ReviewsManageBody({ view, warm = null, onGo, onAppChanged, settingsExtra }: ReviewsManageBodyProps) {
  const [focus, setFocus] = React.useState<{ review: string | null; status: ReviewTab | null }>({ review: null, status: null })
  const [seen, setSeen] = React.useState(false)
  React.useEffect(() => {
    const a = readAddress()
    setFocus({ review: a.review, status: a.status })
    setSeen(true)
    if ((a.review || a.status) && !a.view) onGo("reviews")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* A review or a status the bell asked for is for the first view it opens only. */
  const go = React.useCallback(
    (next: ManageView, opts?: { status?: ReviewTab }) => {
      setFocus({ review: null, status: opts?.status ?? null })
      clearFocusParams()
      onGo(next)
    },
    [onGo],
  )
  /*
    EVERY VIEW OPENED STAYS (round 27, the owner: moving between the tabs
    must feel smooth). A view used to be thrown away when another tab was
    pressed and built again on the way back: its reads again, grey boxes,
    its search and filters gone. Now a view, once opened (or readied while
    its tab is under the pointer, `warm`), stays mounted and is only hidden,
    so going back to it is the same frame, as it was left. Each opening is
    counted (ViewShown, ./parts.tsx), and its reads run again behind what it
    shows, without dimming, so what it shows is current.
  */
  const [opened, setOpened] = React.useState<{ at: ManageView; times: Partial<Record<ManageView, number>> }>(() => ({ at: view, times: { [view]: 1 } }))
  if (opened.at !== view) setOpened((o) => ({ at: view, times: { ...o.times, [view]: (o.times[view] ?? 0) + 1 } }))
  const [readied, setReadied] = React.useState<ReadonlySet<ManageView>>(() => new Set())
  if (warm && warm !== view && !readied.has(warm) && !opened.times[warm]) setReadied((r) => new Set(r).add(warm))
  const pane = (v: ManageView, node: React.ReactNode) =>
    opened.times[v] || readied.has(v) ? (
      <ViewShown.Provider key={v} value={opened.times[v] ?? 0}>
        <div hidden={v !== view} data-reviews-pane={v}>
          {node}
        </div>
      </ViewShown.Provider>
    ) : null
  return (
    <div data-reviews-manage="" data-reviews-view={view}>
      {pane("overview", <OverviewView onGo={go} />)}
      {pane("reviews", seen ? <ReviewsView key={`${focus.status}-${focus.review}`} initialTab={focus.status ?? "all"} highlight={focus.review} /> : null)}
      {pane("requests", <RequestsView />)}
      {pane("widgets", <ReviewsWidgetsTab />)}
      {pane("analytics", <AnalyticsView />)}
      {pane("settings", <SettingsView onAppChanged={onAppChanged} extra={settingsExtra} />)}
    </div>
  )
}

function clearFocusParams() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete("review")
    url.searchParams.delete("status")
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.toString())
  } catch {
    /* nothing to clear */
  }
}

export function manageViewLabel(v: ManageView): string {
  return VIEW_LABEL[v]()
}

export interface ReviewsManageProps {
  /** Turned on or off from Settings: the integration page's status and badge follow. */
  onAppChanged?: (on: boolean) => void
}

/** The same page on its own, with its own tabs (the probes draw it this way; the app draws it inside the integration page). */
export function ReviewsManage({ onAppChanged }: ReviewsManageProps) {
  const [view, setView] = React.useState<ManageView>("overview")
  React.useEffect(() => {
    const a = readAddress()
    if (a.view) setView(a.view)
  }, [])
  const go = React.useCallback((next: ManageView) => {
    setView(next)
    writeView(next)
  }, [])

  return (
    <div className="space-y-4 sm:space-y-5">
      <nav aria-label={tt("Storelib Reviews")} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div role="tablist" className="flex min-w-max gap-1 border-b border-[#e5e7eb] sm:min-w-0">
          {MANAGE_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
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
      <ReviewsManageBody view={view} onGo={go} onAppChanged={onAppChanged} />
    </div>
  )
}
