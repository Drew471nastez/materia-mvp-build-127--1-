"use client"

/**
 * ===========================================================================
 *  SETTINGS › INTEGRATIONS
 * ===========================================================================
 * Every service a store can connect (lib/integrations/catalog.ts), as a
 * directory: a search, Request integration, the categories as pills with
 * how many each holds, Installed, and a card for each with its own mark and
 * a badge for where it stands (Storelib for a built in one, Installed,
 * Needs attention, Error, Coming soon). A card opens the integration's own page:
 * About, At a glance, Data ownership and Install, with Back to integrations.
 *
 * The page is kept in the address (?tab=integrations&integration=meta-pixel)
 * so a link to it opens it, and Back (its button, the browser's or a phone's
 * swipe) goes back to the list exactly where it was.
 *
 * Installed means: a pixel with its ID saved, a provider with a key or an
 * address saved. Built in means it works with nothing to connect.
 */
import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Search, Check, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { backThen } from "@/lib/navigation/go-back"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice, TextInput, api, peekGet } from "@/components/physical/ui"
import { IntegrationCard, type IntegrationState } from "@/components/physical/integrations-marketplace"
import { Mark } from "@/components/app/settings/integration-mark"
import { CATEGORY_NAMES, CATEGORY_ORDER, STATUS_LABEL, searchIntegrations, visibleIntegrations, type Integration, type IntegrationCategory, type IntegrationStatus } from "@/lib/integrations/catalog"
import { applyCatalogOverrides, type CatalogOverride } from "@/lib/integrations/overrides"
import { providerInfo } from "@/lib/physical/providers"
import { TRACKERS, type Tracking } from "@/lib/store/tracking"
import { ReviewsAppPanel } from "@/components/app/settings/reviews-app-panel"
import { TrackingAppPanel } from "@/components/app/settings/tracking-app-panel"
import { MARKETING_PATH, MarketingSyncPanel, type MarketingState } from "@/components/app/settings/marketing-sync-panel"
import { hasBuiltInArt } from "@/components/app/settings/integration-mark"
import { APP_STATE_LABEL, essentialIds, essentialsProgress, storelibApps, type AppState, type StorelibApp } from "@/lib/integrations/storelib-apps"
import { tt } from "@/lib/i18n/text"

/* Essentials first, then everything, what is installed, Storelib's own apps, and each category. */
type Filter = "essentials" | "all" | "installed" | "storelib" | IntegrationCategory

/** A card in the directory: an integration with a page of its own, or one of Storelib's apps that opens where it is set up. */
type Entry = { kind: "integration"; id: string; item: Integration } | { kind: "app"; id: string; app: StorelibApp }

const APPS_PATH = "/api/store/integrations/apps"

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
/* A card with a little depth: the hairline, a contact shadow and a soft one under it, as the rail's open row sits over its column. */
const DEPTH = "rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-14px_rgba(16,24,40,0.14)]"

/*
  ENTERING AND LEAVING AN INTEGRATION'S PAGE (round 23). "No slide delay, no flash, back returns to where you
  were." The new view is there on the very next frame; the only motion is a short fade from 0.55, on the
  compositor, so the swap reads as one surface changing and never as a blank frame. No sideways travel.
*/
const SWAP_MS = 120
const SWAP_FROM = 0.55

function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/**
 * The address follows the page. Opening one is a new history entry (so the phone's Back, a swipe or the
 * browser's Back comes back to the list, where you were); going back from it by its own button goes back
 * through history when the entry is ours, so entries never pile up. Next's router hears both (pushState and
 * replaceState are synced with useSearchParams).
 */
function writeIntegrationParam(id: string | null, how: "push" | "replace") {
  try {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("integration", id)
    else url.searchParams.delete("integration")
    if (url.href === window.location.href) return
    if (how === "push") window.history.pushState(null, "", url.toString())
    else window.history.replaceState(window.history.state, "", url.toString())
  } catch {
    /* An address that can't be written: the page still opens. */
  }
}

/* Each integration's mark, in its own file so the provider cards and /admin draw the same one (./integration-mark). */
export { Mark } from "@/components/app/settings/integration-mark"

/** Printful and Printify: a key and a shop, and orders go there (lib/physical/providers availability "connect"). */
function takesOrders(i: Integration): boolean {
  return !!i.providerId && providerInfo(i.providerId)?.availability === "connect"
}

/**
 * `page`: drawn on its own page (/app/integrations) rather than in Settings:
 * the store's installed integrations first, each a row to manage it, like
 * Shopify's Apps page, then everything there is to add.
 */
export function IntegrationsDirectory({ page = false }: { page?: boolean } = {}) {
  const physical = usePhysicalCommerceEnabled()
  const all = React.useMemo(() => visibleIntegrations(physical), [physical])
  const [tracking, setTracking] = React.useState<Tracking | null>(() => peekGet<{ tracking: Tracking }>("/api/store/integrations")?.tracking ?? null)
  const [trackingReady, setTrackingReady] = React.useState(() => peekGet<{ ready: boolean }>("/api/store/integrations")?.ready ?? true)
  const [states, setStates] = React.useState<IntegrationState[] | null>(() => (physical ? (peekGet<{ integrations: IntegrationState[] }>("/api/physical/integrations")?.integrations ?? null) : []))
  /* Klaviyo and Omnisend connected with a key: subscribers and orders go there (lib/integrations/marketing). */
  const [marketing, setMarketing] = React.useState<MarketingState[] | null>(() => peekGet<{ marketing: MarketingState[] }>(MARKETING_PATH)?.marketing ?? null)
  React.useEffect(() => {
    void api<{ marketing: MarketingState[] }>(MARKETING_PATH).then((r) => {
      if (r.ok) setMarketing(r.data.marketing)
    })
  }, [])
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>("essentials")
  /* The open page follows ?integration=, on arriving and whenever it changes after: a sidebar row for
     another integration, Back and Forward (show() below, so Back by the browser lands where you were too).
     Read before the first paint, so a link to a page never shows the list for a frame first. */
  const wanted = useSearchParams()?.get("integration") ?? null
  const [openId, setOpenId] = React.useState<string | null>(wanted)
  const [requesting, setRequesting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [overrides, setOverrides] = React.useState<CatalogOverride[]>(() => peekGet<{ overrides: CatalogOverride[] }>("/api/store/integrations/catalog")?.overrides ?? [])
  /* Storelib's own apps: on or off (Storelib Reviews, lib/reviews/app-settings.ts). */
  const [appsOn, setAppsOn] = React.useState<Record<string, boolean>>(() => ({ storelib_reviews: peekGet<{ settings: { enabled: boolean } }>("/api/store/reviews-app")?.settings?.enabled === true }))
  React.useEffect(() => {
    void api<{ settings: { enabled: boolean } }>("/api/store/reviews-app").then((r) => {
      if (r.ok) setAppsOn((a) => ({ ...a, storelib_reviews: r.data.settings?.enabled === true }))
    })
  }, [])
  /* Storelib's own apps and the Essentials: On, Off or Set up, read off the store (lib/integrations/storelib-apps). */
  type AppsRead = { states: Record<string, AppState | null>; hrefs: Record<string, string> }
  /* Only a well formed answer is kept: anything else is the same as not knowing yet. */
  const appsRead = (d: Partial<AppsRead> | null | undefined): AppsRead | null => (d && d.states && typeof d.states === "object" ? { states: d.states, hrefs: d.hrefs && typeof d.hrefs === "object" ? d.hrefs : {} } : null)
  const [appStates, setAppStates] = React.useState<AppsRead | null>(() => appsRead(peekGet<AppsRead>(APPS_PATH)))
  React.useEffect(() => {
    void api<AppsRead>(APPS_PATH).then((r) => {
      if (r.ok) setAppStates(appsRead(r.data))
    })
  }, [])
  const shownAll = React.useMemo(() => applyCatalogOverrides(all, overrides, physical), [all, overrides, physical])
  const apps = React.useMemo(() => storelibApps(physical), [physical])
  const appState = (id: string): AppState | null => appStates?.states[id] ?? null
  React.useEffect(() => {
    void api<{ overrides: CatalogOverride[] }>("/api/store/integrations/catalog").then((r) => {
      if (r.ok) setOverrides(r.data.overrides ?? [])
    })
  }, [])
  React.useEffect(() => {
    void api<{ tracking: Tracking; ready: boolean }>("/api/store/integrations").then((r) => {
      if (r.ok) {
        setTracking(r.data.tracking)
        setTrackingReady(r.data.ready)
      } else setError(r.error)
    })
  }, [])
  React.useEffect(() => {
    if (!physical) return
    void api<{ integrations: IntegrationState[] }>("/api/physical/integrations").then((r) => setStates(r.ok ? r.data.integrations : []))
  }, [physical])

  const installed = React.useCallback(
    (i: Integration): boolean => {
      if (i.kind === "app") return !!(i.appId && appsOn[i.appId])
      if (i.kind === "tracker") return !!(i.trackerId && (tracking?.[i.trackerId] || marketing?.some((m) => m.provider === i.trackerId && m.connected)))
      if (i.kind !== "commerce" || i.comingSoon) return false
      const s = states?.find((x) => x.provider === i.providerId)
      return !!s && s.status !== "disconnected"
    },
    [tracking, states, appsOn, marketing],
  )

  /* One word for where each stands, read off what is really saved: never an installed state that isn't. */
  const statusOf = React.useCallback(
    (i: Integration): IntegrationStatus => {
      if (i.builtIn) return "built_in"
      if (i.kind === "commerce" && !i.comingSoon) {
        const s = states?.find((x) => x.provider === i.providerId)
        if (s?.status === "error") return "error"
        /* Printful or Printify saved before they took orders: there, but it needs connecting again. */
        if (s?.status === "needs_setup" && takesOrders(i)) return "needs_attention"
        if (s && s.status !== "disconnected") return s.lastError ? "needs_attention" : "installed"
      } else if (i.kind === "tracker" && marketing?.some((m) => m.provider === i.trackerId && m.connected && m.lastError)) return "needs_attention"
      else if (installed(i)) return "installed"
      return i.comingSoon ? "coming_soon" : "available"
    },
    [states, installed, marketing],
  )

  const root = React.useRef<HTMLDivElement>(null)
  const scroller = () => root.current?.closest("[data-settings-sheet-scroll], [data-integrations-scroll], .app-content-scroll") as HTMLElement | null
  /** Where the directory's top is in its scroller: the search row, a little under the scroll's top edge. */
  const topOf = (box: HTMLElement) => {
    const el = root.current
    if (!el) return 0
    return Math.max(0, el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 16)
  }
  /*
    PUSH AND POP, IN PLACE (round 23).

      opening   the list's scroll and the card pressed are remembered, and the page starts at its top,
                placed there in the same frame it appears
      back      the list comes back exactly where it was: same category, same search, same scroll, the
                card you opened under your thumb and focused. Set before the frame is painted, so it never
                shows at the top first and then jumps.

    The button and the browser's Back do the same: a history entry made by opening is gone back through;
    a page opened from a link (no entry of ours) is replaced by the list.
  */
  const motion = React.useRef<null | "push" | "pop">(null)
  const listAt = React.useRef<{ scroll: number; card: string | null } | null>(null)
  const pushed = React.useRef(false)
  const show = React.useCallback(
    (id: string | null) => {
      setOpenId((was) => {
        if (was === id) return was
        motion.current = id ? "push" : "pop"
        if (id && !was) {
          const box = scroller()
          listAt.current = { scroll: box?.scrollTop ?? 0, card: id }
        }
        return id
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  React.useEffect(() => {
    if (!wanted) pushed.current = false
    show(wanted)
  }, [wanted, show])
  const open = (id: string | null) => {
    if (id) {
      show(id)
      writeIntegrationParam(id, "push")
      pushed.current = true
      return
    }
    if (pushed.current) {
      /* Our own entry: Back through it, so the browser's history is as it was before the page was opened. */
      pushed.current = false
      show(null)
      /* Through the app's back watch (lib/navigation/go-back): a Back that does nothing still leaves the address on the list. */
      backThen(() => writeIntegrationParam(null, "replace"))
      return
    }
    show(null)
    writeIntegrationParam(null, "replace")
  }
  const viewKey = openId && shownAll.some((i) => i.id === openId) ? openId : "list"
  React.useLayoutEffect(() => {
    const el = root.current
    const box = scroller()
    const how = motion.current
    motion.current = null
    if (!el || !how) return
    if (how === "push" && box) {
      const to = topOf(box)
      if (box.scrollTop > to) box.scrollTop = to
    }
    if (how === "pop") {
      const at = listAt.current
      listAt.current = null
      if (box && at) box.scrollTop = at.scroll
      if (at?.card) el.querySelector<HTMLElement>(`[data-integration-card="${CSS.escape(at.card)}"]`)?.focus({ preventScroll: true })
    }
    if (reduced() || typeof el.animate !== "function") return
    el.animate([{ opacity: SWAP_FROM }, { opacity: 1 }], { duration: SWAP_MS, easing: "ease-out" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey])

  /*
    A CATEGORY LANDS IN PLACE (round R1). A press used to swap the cards in
    one frame and, with the list scrolled, a shorter category pulled the
    scroll up by however much it lost: the cards flashed and the page jumped.
    Now the pills stay where they are on screen (the scroll is set so the row
    keeps its place if the list under it got shorter), and the cards settle
    in: a short fade from half and a 6px rise, staggered by a frame or two.
  */
  const pillsRef = React.useRef<HTMLDivElement>(null)
  const thumbRef = React.useRef<HTMLSpanElement>(null)
  /*
    THE THUMB (round I4). The dark fill is one element that slides from the
    pill that was on to the one pressed (transform and width, on the
    compositor), and the row scrolls the pressed pill into view on a phone.
    Placed without motion on the first paint and when the row reflows.
  */
  const placeThumb = React.useCallback((animate: boolean) => {
    const row = pillsRef.current
    const thumb = thumbRef.current
    const pill = row?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (!row || !thumb || !pill) return
    thumb.style.transition = animate && !reduced() ? "transform 260ms cubic-bezier(0.32, 0.72, 0, 1), width 260ms cubic-bezier(0.32, 0.72, 0, 1)" : "none"
    thumb.style.width = `${pill.offsetWidth}px`
    thumb.style.transform = `translate3d(${pill.offsetLeft}px, ${pill.offsetTop}px, 0)`
    thumb.style.opacity = "1"
  }, [])
  const filterChanged = React.useRef(false)
  React.useLayoutEffect(() => {
    /* A press is placed by the filter's own effect below, with motion. */
    if (!filterChanged.current) placeThumb(false)
  })
  React.useEffect(() => {
    const row = pillsRef.current
    if (!row || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => placeThumb(false))
    ro.observe(row)
    return () => ro.disconnect()
  }, [placeThumb])
  const gridRef = React.useRef<HTMLUListElement>(null)
  const pillsAt = React.useRef<number | null>(null)
  const chooseFilter = (f: Filter) => {
    if (f === filter) return
    const box = scroller()
    const row = pillsRef.current
    pillsAt.current = box && row ? row.getBoundingClientRect().top - box.getBoundingClientRect().top : null
    filterChanged.current = true
    setFilter(f)
  }
  React.useLayoutEffect(() => {
    if (!filterChanged.current) return
    filterChanged.current = false
    const box = scroller()
    const row = pillsRef.current
    if (box && row && pillsAt.current !== null) {
      /* Where they were on screen; or, scrolled out of sight above, just under the top, so the new category starts in view. */
      const want = pillsAt.current < 0 ? 12 : pillsAt.current
      const now = row.getBoundingClientRect().top - box.getBoundingClientRect().top
      if (Math.abs(now - want) > 0.5) box.scrollTop += now - want
    }
    placeThumb(true)
    /* On a phone the row scrolls: the pill pressed comes into view, never under the edge. */
    const pill = row?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (row && pill && row.scrollWidth > row.clientWidth) {
      const left = pill.offsetLeft - 16
      const right = pill.offsetLeft + pill.offsetWidth + 16 - row.clientWidth
      const to = row.scrollLeft > left ? left : row.scrollLeft < right ? right : row.scrollLeft
      if (to !== row.scrollLeft) row.scrollTo({ left: to, behavior: reduced() ? "auto" : "smooth" })
    }
    const grid = gridRef.current
    if (!grid || reduced()) return
    Array.from(grid.children).forEach((li, i) => {
      if (typeof (li as HTMLElement).animate !== "function") return
      ;(li as HTMLElement).animate([{ opacity: 0.4, transform: "translate3d(0, 6px, 0)" }, { opacity: 1, transform: "translate3d(0, 0, 0)" }], { duration: 220, delay: Math.min(i, 8) * 14, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "backwards" })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const current = shownAll.find((i) => i.id === openId) ?? null
  if (current) {
    return (
      <div ref={root} data-integrations="" data-integrations-view="page" className="scroll-mt-4">
        <IntegrationPage
          item={current}
          status={statusOf(current)}
          installed={installed(current)}
          tracking={tracking}
          trackingReady={trackingReady}
          states={states}
          onTracking={(t) => {
            setTracking(t)
            /* The sidebar's Integrations group reads again (components/app/sidebar.tsx). */
            window.dispatchEvent(new Event("storelib:integrations-changed"))
          }}
          onStates={(st) => {
            setStates(st)
            window.dispatchEvent(new Event("storelib:integrations-changed"))
          }}
          onMarketing={(m) => {
            setMarketing(m)
            window.dispatchEvent(new Event("storelib:integrations-changed"))
          }}
          onApp={(appId, on) => {
            setAppsOn((a) => ({ ...a, [appId]: on }))
            /* Reviews' card and its Essentials row follow its switch at once. */
            if (appId === "storelib_reviews") setAppStates((x) => (x ? { ...x, states: { ...x.states, "storelib-reviews": on ? "on" : "off" } } : x))
            window.dispatchEvent(new Event("storelib:integrations-changed"))
          }}
          onBack={() => open(null)}
        />
      </div>
    )
  }

  /*
    THE CARDS. Storelib's own apps first (the ones with a page, then the ones
    that open their settings), then every service. A search looks through all
    of them whatever pill is on, so typing never finds nothing because of a pill.
  */
  const storelibIntegrations = shownAll.filter((i) => hasBuiltInArt(i.id))
  const entries: Entry[] = [
    ...storelibIntegrations.map((i): Entry => ({ kind: "integration", id: i.id, item: i })),
    ...apps.map((a): Entry => ({ kind: "app", id: a.id, app: a })),
    ...shownAll.filter((i) => !hasBuiltInArt(i.id)).map((i): Entry => ({ kind: "integration", id: i.id, item: i })),
  ]
  const isInstalled = (e: Entry) => (e.kind === "integration" ? installed(e.item) || e.item.builtIn : appState(e.id) === "on")
  const essentials = essentialIds(physical)
  const progress = essentialsProgress(physical, appStates?.states ?? {})
  const counts = new Map<Filter, number>([
    ["all", entries.length],
    ["installed", entries.filter(isInstalled).length],
    ["storelib", entries.filter((e) => e.kind === "app" || hasBuiltInArt(e.id)).length],
  ])
  for (const c of CATEGORY_ORDER) counts.set(c, shownAll.filter((i) => i.category === c).length)
  const pills: Filter[] = ["essentials", "all", "installed", "storelib", ...CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0)]
  const q = query.trim()
  const matches = (e: Entry) => (e.kind === "integration" ? searchIntegrations([e.item], q).length > 0 : `${e.app.name} ${e.app.summary} storelib`.toLowerCase().includes(q.toLowerCase()))
  const shown = q
    ? entries.filter(matches)
    : entries.filter((e) => (filter === "all" ? true : filter === "installed" ? isInstalled(e) : filter === "storelib" ? e.kind === "app" || hasBuiltInArt(e.id) : e.kind === "integration" && e.item.category === filter))
  const essentialEntries = essentials.map((id) => entries.find((e) => e.id === id)).filter((e): e is Entry => !!e)
  const hrefOf = (a: StorelibApp) => appStates?.hrefs[a.id] ?? a.href

  /* Installed by the store (not the built in ones every store has), for the page's own list at the top. */
  const mine = page ? shownAll.filter((i) => installed(i)) : []

  return (
    <div ref={root} data-integrations="" data-integrations-view="list" className="scroll-mt-4 space-y-4">
      {page && mine.length > 0 ? (
        <section aria-labelledby="installed-integrations" className="space-y-2.5" data-installed-integrations="">
          <h2 id="installed-integrations" className="text-[15px] font-semibold text-[#1a1a2e]">
            {tt("Connected")}
          </h2>
          <ul className={cn(CARD, "divide-y divide-[#f1f2f4] overflow-hidden")}>
            {mine.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => open(i.id)}
                  data-integration-card={i.id}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-[#f8f9fa] active:bg-[#f3f4f6] [-webkit-tap-highlight-color:transparent]"
                >
                  <Mark item={i} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{i.name}</span>
                    <span className="block truncate text-[12.5px] text-[#6b7280]">{CATEGORY_NAMES[i.category]}</span>
                  </span>
                  <StatusBadge status={statusOf(i)} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{tt("Search integrations")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tt("Search apps and integrations")}
            className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] sm:text-[14px]"
            data-integrations-search=""
          />
        </label>
        <button type="button" className={cn(BTN_SECONDARY, "h-10 shrink-0 rounded-xl px-3.5")} onClick={() => setRequesting(true)} data-request-integration="">
          {tt("Request")}
        </button>
      </div>

      <div ref={pillsRef} hidden={!!q} className="relative -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={tt("Categories")} data-integration-pills="">
        {/* One dark thumb that slides to the pill pressed, under the words, so a switch reads as one motion and never a blink. */}
        <span ref={thumbRef} aria-hidden className="pointer-events-none absolute left-0 top-0 h-8 rounded-full bg-[#1a1a2e] opacity-0" data-integration-pill-thumb="" />
        {pills.map((f) => {
          const on = filter === f
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => chooseFilter(f)}
              data-integration-pill={f}
              className={cn(
                "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-[border-color,color] duration-200 ease-out motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]",
                on ? "border-transparent text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db]",
              )}
            >
              {f === "essentials" ? tt("Essentials") : f === "all" ? tt("All") : f === "installed" ? tt("Installed") : f === "storelib" ? tt("Storelib apps") : CATEGORY_NAMES[f]}
              <span className={cn("tabular-nums transition-colors duration-200", on ? "text-white/70" : "text-[#9ca3af]")}>{f === "essentials" ? (appStates ? `${progress.done}/${progress.total}` : progress.total) : (counts.get(f) ?? 0)}</span>
            </button>
          )
        })}
      </div>

      {error ? <Notice>{error}</Notice> : null}
      {!q && filter === "essentials" ? (
        <EssentialsPanel
          entries={essentialEntries}
          progress={appStates ? progress : null}
          stateOf={appState}
          hrefOf={hrefOf}
          onOpen={(id) => open(id)}
          listRef={gridRef}
        />
      ) : shown.length === 0 ? (
        <div className={cn(CARD, "px-5 py-10 text-center")}>
          <p className="text-[14px] font-medium text-[#1a1a2e]">{filter === "installed" && !q ? tt("Nothing installed yet") : tt("Nothing matches")}</p>
          <button type="button" className={cn(BTN_SECONDARY, "mt-3")} onClick={() => setRequesting(true)}>
            {tt("Request integration")}
          </button>
        </div>
      ) : (
        /* One list for every pill: a switch only adds and removes cards, each keeping its place, so nothing flashes or zooms.
           On a phone it is one card of rows; from 640px a grid of cards. */
        <ul ref={gridRef} className={cn(CARD, "divide-y divide-[#f1f2f4] overflow-hidden sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none", page && "lg:grid-cols-3")} data-integration-grid="">
          {shown.map((e) => (
            <li key={e.id}>
              {e.kind === "app" ? (
                <Link href={hrefOf(e.app)} data-integration-card={e.id} data-storelib-app={e.id} className={ENTRY}>
                  <EntryBody mark={<Mark item={{ id: e.id, name: e.app.name, logo: null }} />} name={e.app.name} summary={e.app.summary} badge={<AppBadge state={appState(e.id)} />} />
                </Link>
              ) : (
                <button type="button" onClick={() => open(e.id)} data-integration-card={e.id} className={ENTRY}>
                  <EntryBody
                    mark={<Mark item={e.item} />}
                    name={e.item.name}
                    summary={e.item.summary}
                    badge={hasBuiltInArt(e.id) && appState(e.id) ? <AppBadge state={appState(e.id)} /> : <StatusBadge status={statusOf(e.item)} />}
                  />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <RequestForm open={requesting} onClose={() => setRequesting(false)} />
    </div>
  )
}

type Tone = "gray" | "green" | "amber" | "red"
const TONE: Record<Tone, string> = {
  gray: "bg-[#f3f4f6] text-[#4b5563]",
  green: "bg-[#ecfdf3] text-[#067647]",
  amber: "bg-[#fffaeb] text-[#b54708]",
  red: "bg-[#fef3f2] text-[#b42318]",
}
function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium", TONE[tone])} data-integration-badge="">
      {tone === "green" ? <Check className="h-3 w-3" aria-hidden /> : null}
      {children}
    </span>
  )
}

/** Available has no badge: a card with nothing on it is one you can install. */
function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "available") return null
  const tone: Tone = status === "built_in" ? "gray" : status === "installed" ? "green" : status === "needs_attention" ? "amber" : status === "error" ? "red" : "gray"
  return <Badge tone={tone}>{status === "built_in" ? "Storelib" : STATUS_LABEL[status]}</Badge>
}

/*
  A CARD, TWO SHAPES (round I4). On a phone a row in one list: the mark, the
  name with its one line, the badge. From 640px a card in the grid: the mark
  and the badge on top, the name and its line under.
*/
const ENTRY = cn(
  "group flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-[background-color,box-shadow,border-color] duration-200 ease-out hover:bg-[#f8f9fa] active:bg-[#f3f4f6] focus-visible:bg-[#f8f9fa] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]",
  "sm:h-full sm:flex-col sm:items-stretch sm:gap-3 sm:p-4 sm:hover:bg-white sm:active:bg-white",
  "sm:rounded-2xl sm:border sm:border-[#e5e7eb]/60 sm:bg-white sm:shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:hover:border-[#dfe2e6] sm:hover:shadow-[0_2px_10px_-4px_rgba(17,24,39,0.10)] sm:focus-visible:ring-2 sm:focus-visible:ring-[#1a1a2e]/15",
)

function EntryBody({ mark, name, summary, badge }: { mark: React.ReactNode; name: string; summary: string; badge: React.ReactNode }) {
  return (
    <>
      <span className="flex shrink-0 items-start justify-between gap-3">
        {mark}
        <span className="hidden sm:inline-flex">{badge}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-[#1a1a2e]">{name}</span>
        <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-[#6b7280] sm:line-clamp-2 sm:whitespace-normal">{summary}</span>
      </span>
      <span className="shrink-0 sm:hidden">{badge}</span>
    </>
  )
}

/** One of Storelib's own: On, Off or Set up, read off the store. Nothing while it is unknown. */
function AppBadge({ state }: { state: AppState | null }) {
  if (!state) return null
  return (
    <Badge tone={state === "on" ? "green" : "gray"}>
      {APP_STATE_LABEL[state]}
    </Badge>
  )
}

/*
  ESSENTIALS (round I4). "Build a category with the most important
  integrations... with these you get your online store 0 to 100 done." The
  short list a store needs to sell, in the order it is done, with how many
  are set up and a bar. Each row goes where it is set up; a row that is done
  says On. The count waits for the store's read, so it never shows 0 first.
*/
function EssentialsPanel({
  entries,
  progress,
  stateOf,
  hrefOf,
  onOpen,
  listRef,
}: {
  entries: Entry[]
  progress: { done: number; total: number } | null
  stateOf: (id: string) => AppState | null
  hrefOf: (a: StorelibApp) => string
  onOpen: (id: string) => void
  listRef: React.Ref<HTMLUListElement>
}) {
  const total = progress?.total ?? entries.length
  const done = progress?.done ?? 0
  const all = !!progress && done === total
  return (
    <section className={cn(CARD, "overflow-hidden")} aria-labelledby="integration-essentials" data-integration-essentials="">
      <div className="flex items-center gap-4 border-b border-[#f1f2f4] px-4 py-3.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 id="integration-essentials" className="text-[15px] font-semibold text-[#1a1a2e]">
            {all ? tt("Your store has the essentials") : tt("The essentials")}
          </h2>
          <p className="text-[13px] text-[#6b7280]" data-essentials-count="">
            {progress ? tt("{done} of {total} set up", { done, total }) : tt("{total} things every store needs", { total })}
          </p>
        </div>
        <div aria-hidden className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[#eef0f3] sm:w-40">
          <div className="h-full rounded-full bg-[#12b76a] transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
        </div>
      </div>
      <ul ref={listRef} className="divide-y divide-[#f1f2f4]">
        {entries.map((e) => {
          const state = stateOf(e.id)
          const name = e.kind === "app" ? e.app.name : e.item.name
          const line = e.kind === "app" ? e.app.summary : e.item.summary
          const inner = (
            <>
              <Mark item={e.kind === "app" ? { id: e.id, name, logo: null } : e.item} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{name}</span>
                <span className="block truncate text-[12.5px] text-[#6b7280]">{line}</span>
              </span>
              {state === "on" ? (
                <Badge tone="green">{tt("On")}</Badge>
              ) : state ? (
                <span className="shrink-0 text-[13px] font-medium text-[#1a1a2e]">{tt("Set up")}</span>
              ) : null}
              <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
            </>
          )
          const row = "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-[#f8f9fa] active:bg-[#f3f4f6] sm:px-5 [-webkit-tap-highlight-color:transparent]"
          return (
            <li key={e.id} data-essential={e.id} data-essential-state={state ?? "unknown"}>
              {e.kind === "app" ? (
                <Link href={hrefOf(e.app)} className={row} data-integration-card={e.id}>
                  {inner}
                </Link>
              ) : (
                <button type="button" onClick={() => onOpen(e.id)} className={row} data-integration-card={e.id}>
                  {inner}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Where it stands, in words a person reads at a glance: a dot and a line, with what it means under the name. */
const STANDING: Record<IntegrationStatus, { tone: Tone; label: string; line: string }> = {
  built_in: { tone: "gray", get label() { return tt("Built into Storelib") }, get line() { return tt("Ready to use. Nothing to connect.") } },
  installed: { tone: "green", get label() { return tt("Connected") }, get line() { return tt("Working on your store.") } },
  needs_attention: { tone: "amber", get label() { return tt("Needs attention") }, get line() { return tt("Connected, but the last try didn't go through.") } },
  error: { tone: "red", get label() { return tt("Not working") }, get line() { return tt("Check its settings below.") } },
  coming_soon: { tone: "gray", get label() { return tt("Coming soon") }, get line() { return tt("Not available to connect yet.") } },
  available: { tone: "gray", get label() { return tt("Not connected") }, get line() { return tt("Set it up below in a minute.") } },
}
const DOT: Record<Tone, string> = { gray: "bg-[#9ca3af]", green: "bg-[#12b76a]", amber: "bg-[#f79009]", red: "bg-[#f04438]" }

/**
 * ===========================================================================
 *  AN INTEGRATION'S OWN PAGE (round R1)
 * ===========================================================================
 * "Must look much better, Storelib styled with a little depth: cards, a
 * header with the logo, clear status, connect and disconnect actions."
 *
 *   THE HEADER      its mark on a soft tile, the name, what it does, and where
 *                   it stands as a dot and two words (Connected, Not
 *                   connected, Needs attention...) with what that means. The
 *                   one action that matters sits at the header's right on a
 *                   computer (on a phone the setup card is right under it):
 *                   Set up, Manage, Tell me when it's ready. It takes you to
 *                   the setup card and puts the cursor in its field.
 *   SET UP          first, because it is why the page was opened: the
 *                   field and Install / Save / Remove for a pixel, the
 *                   provider's own Connect, Manage and Disconnect, or Tell me
 *                   when it's ready
 *   ABOUT, DATA     what it does and what it sees, under it
 *   AT A GLANCE     beside them from 1024px, under them on a phone
 *
 * Every card has the same hairline and a soft shadow under it; nothing is a
 * card inside a card.
 */
function IntegrationPage({
  item,
  status,
  installed,
  tracking,
  trackingReady,
  states,
  onTracking,
  onStates,
  onApp,
  onMarketing,
  onBack,
}: {
  item: Integration
  status: IntegrationStatus
  installed: boolean
  tracking: Tracking | null
  trackingReady: boolean
  states: IntegrationState[] | null
  onTracking: (t: Tracking) => void
  onStates: (s: IntegrationState[]) => void
  onApp: (appId: string, on: boolean) => void
  onMarketing: (m: MarketingState[]) => void
  onBack: () => void
}) {
  const setupRef = React.useRef<HTMLElement>(null)
  const standing = STANDING[status]
  /* Nothing to connect yet: a listed service, a provider marked Coming soon, or one paused from /admin. */
  const notifyOnly = item.kind === "listed" || (item.kind === "commerce" && !!item.comingSoon) || (!!item.paused && !installed)
  const providerState = item.providerId ? (states?.find((s) => s.provider === item.providerId) ?? null) : null
  const action = item.builtIn && item.kind !== "commerce" ? null : notifyOnly ? tt("Tell me when it's ready") : installed ? tt("Manage") : tt("Set up")
  const toSetup = () => {
    const el = setupRef.current
    if (!el) return
    el.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" })
    window.setTimeout(() => el.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true }), reduced() ? 0 : 420)
  }
  const tracked = item.kind === "tracker" && item.trackerId ? tracking?.[item.trackerId] ?? null : null

  return (
    <div className="space-y-4 sm:space-y-5" data-integration-page={item.id}>
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex h-9 items-center gap-1 rounded-full pl-1.5 pr-3 text-[13.5px] font-medium text-[#4b5563] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"
        data-integration-back=""
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {tt("Back to integrations")}
      </button>

      <header className={cn(DEPTH, "p-4 sm:p-6")} data-integration-header="">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <Mark item={item} size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[20px] font-bold leading-tight tracking-[-0.01em] text-[#1a1a2e] sm:text-[22px]">{item.name}</h2>
              <p className="mt-1 text-[14px] leading-[20px] text-[#6b7280]">{item.summary}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" data-integration-standing={status}>
                <span className="inline-flex items-center gap-1.5 font-medium text-[#1a1a2e]">
                  <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[standing.tone])} />
                  {standing.label}
                </span>
                <span className="text-[#6b7280]">{tracked ? `${TRACKERS[item.trackerId!].label}: ${tracked}` : standing.line}</span>
              </div>
            </div>
          </div>
          {action ? (
            /* On a phone the setup card is the very next thing on the screen, so the header keeps to the name and the status there. */
            <button type="button" onClick={toSetup} className={cn(installed ? BTN_SECONDARY : BTN_PRIMARY, "hidden h-10 shrink-0 rounded-xl px-5 sm:inline-flex")} data-integration-action="">
              {action}
              {!installed && !notifyOnly ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4 sm:space-y-5">
          <section ref={setupRef} className={cn(DEPTH, "scroll-mt-4 overflow-hidden")} aria-labelledby="integration-install" data-integration-install="">
            <div className="border-b border-[#f1f2f4] px-4 py-3.5 sm:px-6">
              <h3 id="integration-install" className="text-[15px] font-semibold text-[#1a1a2e]">{notifyOnly ? tt("Get notified") : installed ? tt("Settings") : tt("Set up")}</h3>
            </div>
            <div className="px-4 py-4 sm:px-6 sm:py-5">
              {notifyOnly ? (
                <div className="space-y-4">
                  <NotifyMe item={item} />
                  {/* A key saved before this was marked Coming soon: shown, so it can be removed. */}
                  {item.kind === "commerce" && item.providerId && providerInfo(item.providerId) && providerState && providerState.status !== "disconnected" ? (
                    <ul className="border-t border-[#f1f2f4] pt-4 [&>li]:border-0 [&>li]:bg-transparent [&>li]:p-0 [&>li]:shadow-none">
                      <IntegrationCard provider={providerInfo(item.providerId)!} state={providerState} loading={false} onSaved={onStates} />
                    </ul>
                  ) : null}
                </div>
              ) : item.kind === "app" && item.appId === "storelib_reviews" ? (
                <ReviewsAppPanel onChanged={(st) => onApp("storelib_reviews", st.enabled)} />
              ) : item.kind === "app" && item.appId === "courier_tracking" ? (
                <TrackingAppPanel onChanged={(own) => onApp("courier_tracking", own)} />
              ) : item.kind === "tracker" && item.trackerId ? (
                <TrackerInstall item={item} value={tracking?.[item.trackerId] ?? null} ready={trackingReady} onSaved={onTracking} />
              ) : item.providerId && providerInfo(item.providerId) ? (
                <ul className="[&>li]:border-0 [&>li]:bg-transparent [&>li]:p-0 [&>li]:shadow-none">
                  <IntegrationCard provider={providerInfo(item.providerId)!} state={states?.find((s) => s.provider === item.providerId) ?? null} loading={states === null} onSaved={onStates} startOpen={!item.builtIn && !installed} />
                </ul>
              ) : null}
            </div>
          </section>

          {item.kind === "tracker" && (item.trackerId === "klaviyo" || item.trackerId === "omnisend") && !notifyOnly ? (
            /* The key that sends subscribers and orders, apart from the onsite ID above (lib/integrations/marketing). */
            <section className={cn(DEPTH, "overflow-hidden")} aria-labelledby="integration-sync" data-integration-sync="">
              <div className="border-b border-[#f1f2f4] px-4 py-3.5 sm:px-6">
                <h3 id="integration-sync" className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Subscribers and orders")}</h3>
              </div>
              <div className="px-4 py-4 sm:px-6 sm:py-5">
                <MarketingSyncPanel provider={item.trackerId} onChanged={onMarketing} />
              </div>
            </section>
          ) : null}

          {/*
            LESS TO READ (round I4). "Integration pages: don't have that much text." What it does is one paragraph;
            the rest of how it works and what data goes where is a tap away, closed by default.
          */}
          <section className={cn(DEPTH, "overflow-hidden")} aria-labelledby="integration-about" data-integration-about="">
            <div className="px-4 py-4 sm:px-6 sm:py-5">
              <h3 id="integration-about" className="text-[15px] font-semibold text-[#1a1a2e]">{tt("What it does")}</h3>
              <p className="mt-2 text-[14px] leading-[21px] text-[#4b5563]">{item.lead ?? item.about[0]}</p>
              {item.paused ? (
                <Notice tone="gray" className="mt-3">{tt("{name} is paused on Storelib for now. Anything already set up keeps its settings.", { name: item.name })}</Notice>
              ) : null}
            </div>
            <details className="group border-t border-[#f1f2f4]" data-integration-details="">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa] sm:px-6 [&::-webkit-details-marker]:hidden">
                {tt("How it works and your data")}
                <ChevronDown className="h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-200 group-open:rotate-180" aria-hidden />
              </summary>
              <div className="space-y-4 px-4 pb-5 sm:px-6">
                {(item.lead ? item.about : item.about.slice(1)).length > 0 ? (
                  <div className="space-y-2 text-[14px] leading-[21px] text-[#4b5563]">
                    {(item.lead ? item.about : item.about.slice(1)).map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                ) : null}
                <div>
                  <h4 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Data ownership")}</h4>
                  <ul className="mt-1.5 space-y-2 text-[14px] leading-[21px] text-[#4b5563]">
                    {item.data.map((d) => (
                      <li key={d} className="flex gap-2.5">
                        <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </section>
        </div>

        <aside className={cn(DEPTH, "h-fit px-4 py-4 sm:px-5 lg:sticky lg:top-4")} aria-labelledby="integration-glance" data-integration-glance="">
          <h3 id="integration-glance" className="text-[15px] font-semibold text-[#1a1a2e]">{tt("At a glance")}</h3>
          <dl className="mt-3 divide-y divide-[#f1f2f4]">
            <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
              <dt className="text-[13px] text-[#6b7280]">{tt("Category")}</dt>
              <dd className="text-right text-[13.5px] font-medium text-[#1a1a2e]">{CATEGORY_NAMES[item.category]}</dd>
            </div>
            {item.glance.map((g) => (
              <div key={g.label} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="shrink-0 text-[13px] text-[#6b7280]">{g.label}</dt>
                <dd className="text-right text-[13.5px] font-medium text-[#1a1a2e]">{g.value}</dd>
              </div>
            ))}
          </dl>
          {item.docsUrl ? (
            <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className={cn(BTN_SECONDARY, "mt-3 h-10 w-full rounded-xl")}>
              {tt("{name} help", { name: item.name })}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function TrackerInstall({ item, value, ready, onSaved }: { item: Integration; value: string | null; ready: boolean; onSaved: (t: Tracking) => void }) {
  const t = TRACKERS[item.trackerId!]
  const [typed, setTyped] = React.useState(value ?? "")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  React.useEffect(() => setTyped(value ?? ""), [value])

  const save = async (next: string | null) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    const r = await api<{ tracking: Tracking }>("/api/store/integrations", { method: "PUT", body: { id: item.trackerId, value: next } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(r.data.tracking)
    setSaved(true)
  }

  if (!ready) return <Notice tone="amber">{tt("Analytics and pixels need their database update (SQL part 112). Until it runs, nothing here is kept.")}</Notice>
  return (
    <div className="space-y-3" data-tracker-install={item.trackerId}>
      <Field label={t.label} htmlFor={`tracker-${item.trackerId}`} hint={tt("Where to find it: {where}", { where: t.where })}>
        <TextInput id={`tracker-${item.trackerId}`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t.example} autoComplete="off" spellCheck={false} inputMode="text" />
      </Field>
      {error ? <Notice>{error}</Notice> : null}
      {saved && !error ? <p className="text-[13px] text-[#067647]" data-tracker-saved="">{value ? tt("Saved. {name} loads on your website from its next page view.", { name: t.name }) : tt("Removed from your website.")}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {value ? (
          <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save(null)}>
            {tt("Remove")}
          </button>
        ) : null}
        <button type="button" className={BTN_PRIMARY} disabled={busy || !typed.trim() || typed.trim() === value} onClick={() => void save(typed)}>
          {busy ? tt("Saving") : value ? tt("Save") : tt("Install")}
        </button>
      </div>
    </div>
  )
}

/**
 * TELL ME WHEN IT'S READY. A Coming soon integration has nothing to install,
 * so its Install section is one press that counts the store as asking for it
 * (a request in /admin, once per store). "You're on the list" only once the
 * request is really kept.
 */
function NotifyMe({ item }: { item: Integration }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const ask = async () => {
    setState("sending")
    setError(null)
    const r = await api("/api/store/integrations/request", { method: "POST", body: { name: item.name, integrationId: item.id } })
    if (!r.ok) {
      setState("idle")
      return setError(r.error)
    }
    setState("sent")
  }
  return (
    <div className="space-y-3" data-integration-notify={item.id}>
      <p className="text-[14px] leading-[21px] text-[#4b5563]">{tt("Not available yet. Ask for it and you'll be counted: the most asked for are built first.")}</p>
      {error ? <Notice>{error}</Notice> : null}
      {state === "sent" ? (
        <p className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#067647]" data-integration-notified="">
          <Check className="h-4 w-4" aria-hidden />
          {tt("You're on the list for {name}.", { name: item.name })}
        </p>
      ) : (
        <div className="flex justify-end">
          <button type="button" className={BTN_PRIMARY} disabled={state === "sending"} onClick={() => void ask()}>
            {state === "sending" ? tt("Sending") : tt("Tell me when it's ready")}
          </button>
        </div>
      )}
    </div>
  )
}

function RequestForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = React.useState("")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setName("")
    setNote("")
    setError(null)
    setSent(false)
  }, [open])
  const send = async () => {
    setBusy(true)
    setError(null)
    const r = await api("/api/store/integrations/request", { method: "POST", body: { name, note } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setSent(true)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tt("Request integration")}
      footer={
        sent ? (
          <button type="button" className={BTN_PRIMARY} onClick={onClose}>
            {tt("Done")}
          </button>
        ) : (
          <div className="flex w-full justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
              {tt("Cancel")}
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy || !name.trim()} onClick={() => void send()}>
              {busy ? tt("Sending") : tt("Send request")}
            </button>
          </div>
        )
      }
    >
      {sent ? (
        <p className="text-[14px] leading-[21px] text-[#4b5563]" data-request-sent="">{tt("Thanks. We read every request, and the most asked for are built first.")}</p>
      ) : (
        <div className="space-y-3">
          <Field label={tt("Which service?")} htmlFor="request-name">
            <TextInput id="request-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Klaviyo" />
          </Field>
          <Field label={tt("What would you use it for?")} htmlFor="request-note" hint={tt("Optional")}>
            <textarea id="request-note" value={note} maxLength={600} rows={3} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[16px] outline-none focus:border-[#9ca3af] sm:text-[14px]" />
          </Field>
          {error ? <Notice>{error}</Notice> : null}
        </div>
      )}
    </Modal>
  )
}
