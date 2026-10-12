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
import { useSearchParams } from "next/navigation"
import { ChevronLeft, ExternalLink, Search, Check, ArrowRight } from "lucide-react"
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
import { GaConnect } from "@/components/app/settings/ga-connect"
import { MARKETING_PATH, MarketingSyncPanel, type MarketingState } from "@/components/app/settings/marketing-sync-panel"

type Filter = "all" | "installed" | IntegrationCategory

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
  const [filter, setFilter] = React.useState<Filter>("all")
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
  const shownAll = React.useMemo(() => applyCatalogOverrides(all, overrides, physical), [all, overrides, physical])
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
  const gridRef = React.useRef<HTMLUListElement>(null)
  const filterChanged = React.useRef(false)
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
            window.dispatchEvent(new Event("storelib:integrations-changed"))
          }}
          onBack={() => open(null)}
        />
      </div>
    )
  }

  const counts = new Map<Filter, number>([["all", shownAll.length], ["installed", shownAll.filter((i) => installed(i) || i.builtIn).length]])
  for (const c of CATEGORY_ORDER) counts.set(c, shownAll.filter((i) => i.category === c).length)
  const pills: Filter[] = ["all", "installed", ...CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0)]
  const shown = searchIntegrations(shownAll, query).filter((i) => (filter === "all" ? true : filter === "installed" ? installed(i) || i.builtIn : i.category === filter))

  /* Installed by the store (not the built in ones every store has), for the page's own list at the top. */
  const mine = page ? shownAll.filter((i) => installed(i)) : []

  return (
    <div ref={root} data-integrations="" data-integrations-view="list" className="scroll-mt-4 space-y-4">
      {page ? (
        <section aria-labelledby="installed-integrations" className="space-y-2.5" data-installed-integrations="">
          <h2 id="installed-integrations" className="text-[15px] font-semibold text-[#1a1a2e]">
            Your integrations
          </h2>
          {mine.length === 0 ? (
            <div className={cn(CARD, "flex items-center gap-3 px-4 py-4")}>
              <p className="text-[13.5px] leading-[19px] text-[#6b7280]">Nothing connected yet. Pick one below, like Google Analytics or a pixel for your ads, and it shows up here to manage.</p>
            </div>
          ) : (
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
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h2 className="pt-3 text-[15px] font-semibold text-[#1a1a2e]">Add an integration</h2>
        </section>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search integrations</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations"
            className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] sm:text-[14px]"
            data-integrations-search=""
          />
        </label>
        <button type="button" className={cn(BTN_SECONDARY, "shrink-0")} onClick={() => setRequesting(true)} data-request-integration="">
          Request integration
        </button>
      </div>

      <div ref={pillsRef} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Categories" data-integration-pills="">
        {pills.map((f) => {
          const on = filter === f
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => chooseFilter(f)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color] duration-200 ease-out motion-reduce:transition-none",
                on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db] hover:bg-[#f8f9fa]",
              )}
            >
              {f === "all" ? "All" : f === "installed" ? "Installed" : CATEGORY_NAMES[f]}
              <span className={cn("tabular-nums", on ? "text-white/70" : "text-[#9ca3af]")}>{counts.get(f) ?? 0}</span>
            </button>
          )
        })}
      </div>

      {error ? <Notice>{error}</Notice> : null}
      {shown.length === 0 ? (
        <div className={cn(CARD, "px-5 py-10 text-center")}>
          <p className="text-[14px] font-medium text-[#1a1a2e]">{filter === "installed" && !query ? "Nothing installed yet" : "No integrations match"}</p>
          <p className="mt-1 text-[13px] text-[#6b7280]">Can&apos;t find the one you use? Ask for it.</p>
          <button type="button" className={cn(BTN_SECONDARY, "mt-3")} onClick={() => setRequesting(true)}>
            Request integration
          </button>
        </div>
      ) : (
        /* One list for every pill: a switch only adds and removes cards, each keeping its place, so nothing flashes or zooms. */
        <ul ref={gridRef} className="grid gap-3 sm:grid-cols-2" data-integration-grid="">
          {shown.map((i) => {
            const status = statusOf(i)
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => open(i.id)}
                  data-integration-card={i.id}
                  className={cn(CARD, "group flex h-full w-full flex-col gap-3 p-4 text-left transition-[box-shadow,border-color,background-color] duration-200 ease-out hover:border-[#dfe2e6] hover:shadow-[0_2px_10px_-4px_rgba(17,24,39,0.10)] motion-reduce:transition-none")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Mark item={i} />
                    {i.kind === "app" && status === "available" ? <Badge>Storelib</Badge> : <StatusBadge status={status} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-[#1a1a2e]">{i.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-[#6b7280]">{i.summary}</p>
                  </div>
                  <p className="mt-auto text-[12px] font-medium text-[#9ca3af]">{CATEGORY_NAMES[i.category]}</p>
                </button>
              </li>
            )
          })}
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

/** Where it stands, in words a person reads at a glance: a dot and a line, with what it means under the name. */
const STANDING: Record<IntegrationStatus, { tone: Tone; label: string; line: string }> = {
  built_in: { tone: "gray", label: "Built into Storelib", line: "Ready to use. Nothing to connect." },
  installed: { tone: "green", label: "Connected", line: "Working on your store." },
  needs_attention: { tone: "amber", label: "Needs attention", line: "Connected, but the last try didn't go through." },
  error: { tone: "red", label: "Not working", line: "Check its settings below." },
  coming_soon: { tone: "gray", label: "Coming soon", line: "Not available to connect yet." },
  available: { tone: "gray", label: "Not connected", line: "Set it up below in a minute." },
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
  const action = item.builtIn && item.kind !== "commerce" ? null : notifyOnly ? "Tell me when it's ready" : installed ? "Manage" : "Set up"
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
        Back to integrations
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
              <h3 id="integration-install" className="text-[15px] font-semibold text-[#1a1a2e]">{notifyOnly ? "Get notified" : installed ? "Settings" : "Set up"}</h3>
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
              ) : item.kind === "tracker" && item.trackerId === "ga4" ? (
                /* Google Analytics: pasted, checked with a live hit, then "Receiving data" with the last event's time. */
                <GaConnect value={tracking?.ga4 ?? null} ready={trackingReady} onSaved={onTracking} />
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
                <h3 id="integration-sync" className="text-[15px] font-semibold text-[#1a1a2e]">Subscribers and orders</h3>
              </div>
              <div className="px-4 py-4 sm:px-6 sm:py-5">
                <MarketingSyncPanel provider={item.trackerId} onChanged={onMarketing} />
              </div>
            </section>
          ) : null}

          <section className={cn(DEPTH, "px-4 py-4 sm:px-6 sm:py-5")} aria-labelledby="integration-about">
            <h3 id="integration-about" className="text-[15px] font-semibold text-[#1a1a2e]">About</h3>
            <div className="mt-2 space-y-2 text-[14px] leading-[21px] text-[#4b5563]">
              {item.about.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            {item.paused ? (
              <Notice tone="gray" className="mt-3">{item.name} is paused on Storelib for now. Anything already set up keeps its settings.</Notice>
            ) : null}
          </section>

          <section className={cn(DEPTH, "px-4 py-4 sm:px-6 sm:py-5")} aria-labelledby="integration-data">
            <h3 id="integration-data" className="text-[15px] font-semibold text-[#1a1a2e]">Data ownership</h3>
            <ul className="mt-2 space-y-2 text-[14px] leading-[21px] text-[#4b5563]">
              {item.data.map((d) => (
                <li key={d} className="flex gap-2.5">
                  <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />
                  {d}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className={cn(DEPTH, "h-fit px-4 py-4 sm:px-5 lg:sticky lg:top-4")} aria-labelledby="integration-glance" data-integration-glance="">
          <h3 id="integration-glance" className="text-[15px] font-semibold text-[#1a1a2e]">At a glance</h3>
          <dl className="mt-3 divide-y divide-[#f1f2f4]">
            <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
              <dt className="text-[13px] text-[#6b7280]">Category</dt>
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
              {item.name} help
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

  if (!ready) return <Notice tone="amber">Analytics and pixels need their database update (SQL part 112). Until it runs, nothing here is kept.</Notice>
  return (
    <div className="space-y-3" data-tracker-install={item.trackerId}>
      <Field label={t.label} htmlFor={`tracker-${item.trackerId}`} hint={`Where to find it: ${t.where}`}>
        <TextInput id={`tracker-${item.trackerId}`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t.example} autoComplete="off" spellCheck={false} inputMode="text" />
      </Field>
      {error ? <Notice>{error}</Notice> : null}
      {saved && !error ? <p className="text-[13px] text-[#067647]" data-tracker-saved="">{value ? `Saved. ${t.name} loads on your website from its next page view.` : "Removed from your website."}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {value ? (
          <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save(null)}>
            Remove
          </button>
        ) : null}
        <button type="button" className={BTN_PRIMARY} disabled={busy || !typed.trim() || typed.trim() === value} onClick={() => void save(typed)}>
          {busy ? "Saving" : value ? "Save" : "Install"}
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
      <p className="text-[14px] leading-[21px] text-[#4b5563]">Not available yet. Ask for it and you&apos;ll be counted: the most asked for are built first.</p>
      {error ? <Notice>{error}</Notice> : null}
      {state === "sent" ? (
        <p className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#067647]" data-integration-notified="">
          <Check className="h-4 w-4" aria-hidden />
          You&apos;re on the list for {item.name}.
        </p>
      ) : (
        <div className="flex justify-end">
          <button type="button" className={BTN_PRIMARY} disabled={state === "sending"} onClick={() => void ask()}>
            {state === "sending" ? "Sending" : "Tell me when it's ready"}
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
      title="Request integration"
      footer={
        sent ? (
          <button type="button" className={BTN_PRIMARY} onClick={onClose}>
            Done
          </button>
        ) : (
          <div className="flex w-full justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy || !name.trim()} onClick={() => void send()}>
              {busy ? "Sending" : "Send request"}
            </button>
          </div>
        )
      }
    >
      {sent ? (
        <p className="text-[14px] leading-[21px] text-[#4b5563]" data-request-sent="">Thanks. We read every request, and the most asked for are built first.</p>
      ) : (
        <div className="space-y-3">
          <Field label="Which service?" htmlFor="request-name">
            <TextInput id="request-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Klaviyo" />
          </Field>
          <Field label="What would you use it for?" htmlFor="request-note" hint="Optional">
            <textarea id="request-note" value={note} maxLength={600} rows={3} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[16px] outline-none focus:border-[#9ca3af] sm:text-[14px]" />
          </Field>
          {error ? <Notice>{error}</Notice> : null}
        </div>
      )}
    </Modal>
  )
}
