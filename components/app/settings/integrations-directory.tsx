"use client"

/**
 * ===========================================================================
 *  THE INTEGRATIONS MARKETPLACE (/app/integrations and Settings › Integrations)
 * ===========================================================================
 * Every service a store can connect (lib/integrations/catalog.ts) and
 * Storelib's own apps, as a marketplace (round K4): a search, Request
 * integration, the pills (All, Installed, Storelib apps and the categories,
 * each with how many it holds for what is typed and filtered), a Filter menu
 * (Status, Made by), and a grid of cards: three across on a computer, two on
 * a tablet, a list on a phone. Each card has its mark, its name, its category,
 * two lines of what it does and a badge (Installed, Built in, Available,
 * Coming soon, Needs attention). Search, pill and filters work together, at
 * once (lib/integrations/directory-filter.ts).
 *
 * A card opens the integration's own page (./integration-detail.tsx), kept
 * in the address (?integration=meta-pixel) so a link to it opens it, and Back
 * (its button, the browser's or a phone's swipe) goes back to the list
 * exactly where it was: the same pill, search, filters (?category=&q=&status=
 * &by=) and scroll.
 *
 * Installed means: a pixel with its ID saved, a provider with a key or an
 * address saved. Built in means it works with nothing to connect.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Lightbulb, Search, Check, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { backThen } from "@/lib/navigation/go-back"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice, TextInput, api, peekGet, prefetchGet } from "@/components/physical/ui"
import type { IntegrationState } from "@/components/physical/integrations-marketplace"
import { Mark, tileColor } from "@/components/app/settings/integration-mark"
import { IntegrationDetail, bannerColor } from "@/components/app/settings/integration-detail"
import { CATEGORY_NAMES, CATEGORY_ORDER, visibleIntegrations, type Integration, type IntegrationCategory, type IntegrationStatus } from "@/lib/integrations/catalog"
import { applyCatalogOverrides, type CatalogOverride } from "@/lib/integrations/overrides"
import { providerInfo } from "@/lib/physical/providers"
import type { Tracking } from "@/lib/store/tracking"
import { MARKETING_PATH, type MarketingState } from "@/components/app/settings/marketing-sync-panel"
import { hasBuiltInArt } from "@/components/app/settings/integration-mark"
import { activeFilterCount, inPill, passesFilters, pillCounts, readDirectoryState, visibleIn, writeDirectoryState, matchesQuery, type CardFacets, type DirectoryState, type MakerFilter, type StatusFilter } from "@/lib/integrations/directory-filter"
import { storelibApps, type AppState, type StorelibApp } from "@/lib/integrations/storelib-apps"
import { tt } from "@/lib/i18n/text"
import { pillOrder, weave, type DirectoryPill, type Lane } from "@/lib/integrations/directory-order"
import { holdLanding, isTraversing, prefetchAppPage } from "@/lib/ui/app-navigation"

/* All, then the pills the owner placed, then every other category (lib/integrations/directory-order). */
type Filter = DirectoryPill

/** A card in the directory: an integration with a page of its own, or one of Storelib's apps that opens where it is set up. */
type Entry = { kind: "integration"; id: string; item: Integration } | { kind: "app"; id: string; app: StorelibApp }

const APPS_PATH = "/api/store/integrations/apps"
const TRACKING_APP_PATH = "/api/store/tracking-app"
const REVIEWS_APP_PATH = "/api/store/reviews-app"

/*
  WHAT THE DIRECTORY AND ITS PAGES READ, KEPT (round 30). Read through the
  shared cache (components/physical/ui prefetchGet), so a page opened from a
  card draws its settings at once (peekGet) instead of a grey box that fills
  a beat later, and coming back to /app/integrations from one of Storelib's
  apps draws every badge and the Connected list on its first frame, the
  page as tall as it was, so its scroll can be put back.
*/
const keptReads = (physical: boolean) => [
  "/api/store/integrations",
  "/api/store/integrations/catalog",
  APPS_PATH,
  MARKETING_PATH,
  REVIEWS_APP_PATH,
  ...(physical ? ["/api/physical/integrations", TRACKING_APP_PATH] : []),
]

/*
  THE LIST IS IN THE ADDRESS (round 30, round K4): ?category=analytics&q=pixel
  &status=available&by=storelib (an old ?c= still opens its pill). Written in
  place (replaceState, no new history entry), so Back from an integration's
  page or from one of Storelib's apps comes back to the same list, and the
  stage's scroll memory (components/app/app-stage.tsx), keyed by the
  address, puts it back where it was. All with nothing typed is the plain
  address, and a visit from the sidebar has none of it, so it opens on All.
*/
function writeListState(s: DirectoryState) {
  try {
    const next = writeDirectoryState(window.location.href, s)
    if (next === window.location.href) return
    window.history.replaceState(window.history.state, "", next)
  } catch {
    /* An address that can't be written: the list still changes. */
  }
}

/*
  WHERE STORELIB'S OWN APPS SIT AMONG THE CATEGORIES (round 29). The ones
  with a page in the catalog carry a category already (Storelib Reviews in
  Reviews, Courier tracking in Shipping); Email marketing did not, so the
  Email marketing pill showed Klaviyo and Mailchimp and not Storelib's own.
  The others (bundles, languages, GitHub) fit no category: Storelib apps and
  All hold them.
*/
const APP_CATEGORY: Partial<Record<string, IntegrationCategory>> = {
  "storelib-email-marketing": "email",
}

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
/* A card with a little depth: the hairline, a contact shadow and a soft one under it, as the rail's open row sits over its column. */
const DEPTH = "rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-14px_rgba(16,24,40,0.14)]"

/*
  ENTERING AND LEAVING AN INTEGRATION'S PAGE (round 23). "No slide delay, no flash, back returns to where you
  were." The new view is there on the very next frame. No sideways travel.

  A CUT, NOT A FADE (round 30, the owner: "no white flash"). The new view used to come up from 0.55: its
  first frame was the whole page washed out over the grey, a pale flash on every open and every Back, the
  same dip round 29 took out of the pills. Now it is whole on its first frame, its scroll placed in that same
  frame, as a tab changes page in the app (app/globals.css data-tab-swap, "a cut, not a dissolve").
*/

/* A category switch (round 29): the cards crossfade in this long, and a shorter list eases to its height in this long. */
const CROSSFADE_MS = 180
const HEIGHT_MS = 220

/**
 * A still copy of the cards on screen, laid over the new ones for the
 * crossfade. Inert and hidden from assistive tech, and without the hooks a
 * card is found by (focus on Back, the probes), so nothing mistakes it for
 * the list.
 */
function stillOf(grid: HTMLElement): HTMLElement {
  const still = document.createElement("div")
  still.setAttribute("aria-hidden", "true")
  still.inert = true
  still.setAttribute("data-integration-still", "")
  Object.assign(still.style, { position: "absolute", top: "0", left: "0", right: "0", pointerEvents: "none", mixBlendMode: "plus-lighter" })
  for (const child of grid.children) {
    if (!(child instanceof HTMLElement) || child.hidden || child.hasAttribute("data-integration-still")) continue
    const copy = child.cloneNode(true) as HTMLElement
    for (const el of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
      for (const name of ["id", "data-integration-card", "data-storelib-app", "data-integration-grid", "data-integration-empty"]) el.removeAttribute(name)
    }
    still.appendChild(copy)
  }
  return still
}

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
    else {
      url.searchParams.delete("integration")
      /* An app's tab on its page (./integration-apps.tsx) goes with it. */
      url.searchParams.delete("view")
    }
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
 * three cards across from 1024px. Installed is a pill, not a list of its own
 * above the cards (round K4).
 *
 * `only`: one integration's page and nothing else, as a place of its own
 * (round 27: Products › Reviews is /app/reviews, Storelib Reviews' page, not
 * Integrations): no list behind it and no Back to integrations.
 */
/**
 * What the page read on the server, for the first frame (app/app/integrations/page.tsx, round 41): the
 * order (scores, /admin's overrides) and what is connected (tracking, Klaviyo and Omnisend), so no card
 * moves and no pill comes or goes once the browser's own reads arrive. Any of it null: read as before.
 */
export interface DirectoryInitial {
  scores: Record<string, number> | null
  overrides: CatalogOverride[] | null
  tracking: Tracking | null
  trackingReady: boolean | null
  marketing: MarketingState[] | null
}

export function IntegrationsDirectory({ page = false, only = null, initial: served = null }: { page?: boolean; only?: string | null; initial?: DirectoryInitial | null } = {}) {
  const physical = usePhysicalCommerceEnabled()
  const router = useRouter()
  /* First, so every read below finds its answer kept (or on its way) and shares it. */
  React.useEffect(() => prefetchGet(keptReads(physical)), [physical])
  const all = React.useMemo(() => visibleIntegrations(physical), [physical])
  const [tracking, setTracking] = React.useState<Tracking | null>(() => served?.tracking ?? peekGet<{ tracking: Tracking }>("/api/store/integrations")?.tracking ?? null)
  const [trackingReady, setTrackingReady] = React.useState(() => served?.trackingReady ?? peekGet<{ ready: boolean }>("/api/store/integrations")?.ready ?? true)
  const [states, setStates] = React.useState<IntegrationState[] | null>(() => (physical ? (peekGet<{ integrations: IntegrationState[] }>("/api/physical/integrations")?.integrations ?? null) : []))
  /* Klaviyo and Omnisend connected with a key: subscribers and orders go there (lib/integrations/marketing). */
  const [marketing, setMarketing] = React.useState<MarketingState[] | null>(() => served?.marketing ?? peekGet<{ marketing: MarketingState[] }>(MARKETING_PATH)?.marketing ?? null)
  React.useEffect(() => {
    void api<{ marketing: MarketingState[] }>(MARKETING_PATH).then((r) => {
      if (r.ok) setMarketing(r.data.marketing)
    })
  }, [])
  /*
    THE STORE'S OWN TRACKING ACCOUNT (round 29). AfterShip is the store's own
    AfterShip account in place of Storelib's tracking, and it was never read
    here: its card said Not connected and Installed left it out even when its
    key was saved. Read the way its page reads it (/api/store/tracking-app).
  */
  type TrackingRead = { tracking?: { own?: { provider?: string } | null } }
  const [ownTracking, setOwnTracking] = React.useState<string | null>(() => peekGet<TrackingRead>(TRACKING_APP_PATH)?.tracking?.own?.provider ?? null)
  const readOwnTracking = React.useCallback(() => {
    if (!physical) return
    void api<TrackingRead>(TRACKING_APP_PATH).then((r) => {
      if (r.ok) setOwnTracking(r.data.tracking?.own?.provider ?? null)
    })
  }, [physical])
  React.useEffect(() => readOwnTracking(), [readOwnTracking])
  const params = useSearchParams()
  /* The list the address names (?category=&q=&status=&by=), read on the first render: Back to the list lands where it left. */
  const [initial] = React.useState(() => readDirectoryState(params))
  const [query, setQuery] = React.useState(initial.q)
  const [filter, setFilter] = React.useState<Filter>(initial.category)
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(initial.status)
  const [maker, setMaker] = React.useState<MakerFilter>(initial.by)
  /*
    BACK TO THE LIST IS THE LIST, AS IT WAS (round 30). Back from one of
    Storelib's apps is a return: the pill comes from the address, the cards
    and badges from the kept reads, and the stage puts the scroll back. So
    the page asks the stage for no landing (lib/ui/app-navigation
    holdLanding), as the Emails and Orders lists do: no fade from nothing,
    no 2px rise. Only on the page; a visit from the sidebar lands as usual.
  */
  const [returning] = React.useState(() => page && isTraversing())
  React.useLayoutEffect(() => {
    if (returning) holdLanding()
  }, [returning])
  /* The open page follows ?integration=, on arriving and whenever it changes after: a sidebar row for
     another integration, Back and Forward (show() below, so Back by the browser lands where you were too).
     Read before the first paint, so a link to a page never shows the list for a frame first. */
  const wanted = only ?? params?.get("integration") ?? null
  const [openId, setOpenId] = React.useState<string | null>(wanted)
  const [requesting, setRequesting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /*
    HOW MUCH EACH IS USED ACROSS STORELIB (round 22, lib/integrations/popularity-server.ts).
    Read with the tab's data (settings-form-new tabData), so the order is there
    from the first frame; a directory opened without it keeps the order below
    until it comes, and only then takes it, once.
  */
  const [scores, setScores] = React.useState<Record<string, number> | null>(() => served?.scores ?? peekGet<{ scores: Record<string, number> }>("/api/integrations/popularity")?.scores ?? null)
  React.useEffect(() => {
    if (scores) return
    void api<{ scores: Record<string, number> }>("/api/integrations/popularity").then((r) => {
      if (r.ok && r.data?.scores) setScores(r.data.scores)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [overrides, setOverrides] = React.useState<CatalogOverride[]>(() => served?.overrides ?? peekGet<{ overrides: CatalogOverride[] }>("/api/store/integrations/catalog")?.overrides ?? [])
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
  /*
    EVERY LOGO, FETCHED ONCE. A category shows cards that were not on screen,
    and each logo used to start loading only then, so the cards came in and
    their logos a moment after. The files are small (about 160 KB together):
    asked for once when the directory opens, they are in the cache before any
    pill is pressed, and a card paints with its logo.
  */
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const urls = [...new Set(shownAll.map((i) => i.logo).filter((l): l is string => !!l))]
    const warm = () => {
      for (const u of urls) {
        const img = new Image()
        img.decoding = "async"
        img.src = u
      }
    }
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (idle) idle(warm)
    else setTimeout(warm, 200)
  }, [shownAll])
  const appState = (id: string): AppState | null => appStates?.states[id] ?? null
  React.useEffect(() => {
    void api<{ overrides: CatalogOverride[] }>("/api/store/integrations/catalog").then((r) => {
      /* The same answer is the same array: nothing is drawn again, nothing moves. */
      if (r.ok) setOverrides((had) => (JSON.stringify(had) === JSON.stringify(r.data.overrides ?? []) ? had : (r.data.overrides ?? [])))
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
      /* AfterShip only with the store's own AfterShip account, never its 17TRACK one. */
      if (i.id === "aftership") return ownTracking === "aftership"
      if (i.kind === "app") return !!(i.appId && appsOn[i.appId])
      if (i.kind === "tracker") return !!(i.trackerId && (tracking?.[i.trackerId] || marketing?.some((m) => m.provider === i.trackerId && m.connected)))
      if (i.kind !== "commerce" || i.comingSoon) return false
      const s = states?.find((x) => x.provider === i.providerId)
      return !!s && s.status !== "disconnected"
    },
    [tracking, states, appsOn, marketing, ownTracking],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey])

  /*
    A CATEGORY LANDS IN PLACE (round R1). A press used to swap the cards in
    one frame and, with the list scrolled, a shorter category pulled the
    scroll up by however much it lost: the cards flashed and the page jumped.
    Now the pills stay where they are on screen (the scroll is set so the row
    keeps its place if the list under it got shorter). The pressed pill turns
    dark in the same frame, and the cards are simply there: a dark thumb that
    slid between pills crossed the rows diagonally where they wrap, and the
    words went white before it arrived; the cards faded up from half on every
    press. Both read as a glitch, so both are gone.
  */
  /*
    A CATEGORY CROSSFADES (round 29, the owner: "no flash, no glitch, no
    abrupt appearing"). The fade from 0.55 above was itself the flash: on the
    press the whole list dropped to half in one frame, then came back. Now:

      no remount   every card is drawn once and a pill only shows or hides
                   it (`hidden`), so a logo is never loaded or decoded again
      a crossfade  a still copy of the cards as they were sits over the new
                   ones and fades out while they fade in, 180ms, added light
                   (plus-lighter in an isolated box), so a card that is in
                   both stays solid instead of dimming halfway through
      the height   held where it was on the press, then eased down only as
                   far as the page can go without moving: a short category
                   under pills scrolled to the top used to clamp the scroll
                   and throw the pills down the screen. The room left under
                   the cards goes as the page is scrolled back up, below the
                   screen's edge, where nothing is seen to move.
  */
  const pillsRef = React.useRef<HTMLDivElement>(null)
  const filterChanged = React.useRef(false)
  const gridRef = React.useRef<HTMLUListElement>(null)
  const gridBox = React.useRef<HTMLDivElement>(null)
  const pillsAt = React.useRef<number | null>(null)
  const heldAt = React.useRef<number | null>(null)
  const crossfade = React.useRef<HTMLElement | null>(null)
  const settle = React.useRef<(() => void) | null>(null)
  const roomOff = React.useRef<(() => void) | null>(null)
  React.useEffect(
    () => () => {
      settle.current?.()
      roomOff.current?.()
    },
    [],
  )
  const chooseFilter = (f: Filter) => {
    if (f === filter) return
    const box = scroller()
    const row = pillsRef.current
    pillsAt.current = box && row ? row.getBoundingClientRect().top - box.getBoundingClientRect().top : null
    /* A switch still fading lands first, so the copy is of what is on screen now. */
    settle.current?.()
    roomOff.current?.()
    const grid = gridBox.current
    heldAt.current = grid ? grid.getBoundingClientRect().height : null
    crossfade.current = grid && !reduced() && typeof grid.animate === "function" ? stillOf(grid) : null
    filterChanged.current = true
    setFilter(f)
    writeListState({ category: f, q: query, status: statusFilter, by: maker })
  }
  const typeQuery = (q: string) => {
    setQuery(q)
    writeListState({ category: filter, q, status: statusFilter, by: maker })
  }
  const chooseFilters = (next: { status?: StatusFilter; by?: MakerFilter }) => {
    const status = next.status ?? statusFilter
    const by = next.by ?? maker
    setStatusFilter(status)
    setMaker(by)
    writeListState({ category: filter, q: query, status, by })
  }
  React.useLayoutEffect(() => {
    if (!filterChanged.current) return
    filterChanged.current = false
    const still = crossfade.current
    crossfade.current = null
    const was = heldAt.current
    heldAt.current = null
    const grid = gridBox.current
    /* Held at the old height before anything reads the layout, so the scroll cannot clamp in between. */
    if (grid && was !== null) grid.style.minHeight = `${was}px`
    const box = scroller()
    const row = pillsRef.current
    if (box && row && pillsAt.current !== null) {
      /* Where they were on screen; or, scrolled out of sight above, just under the top, so the new category starts in view. */
      const want = pillsAt.current < 0 ? 12 : pillsAt.current
      const now = row.getBoundingClientRect().top - box.getBoundingClientRect().top
      if (Math.abs(now - want) > 0.5) box.scrollTop += now - want
    }
    /* On a phone the row scrolls: the pill pressed comes into view, never under the edge. */
    const pill = row?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (row && pill && row.scrollWidth > row.clientWidth) {
      const left = pill.offsetLeft - 16
      const right = pill.offsetLeft + pill.offsetWidth + 16 - row.clientWidth
      const to = row.scrollLeft > left ? left : row.scrollLeft < right ? right : row.scrollLeft
      if (to !== row.scrollLeft) row.scrollTo({ left: to, behavior: reduced() ? "auto" : "smooth" })
    }
    if (!grid || was === null) return
    const live = [...grid.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.hidden && !c.hasAttribute("data-integration-still"))
    const naturalNow = () => live.reduce((h, c) => h + c.getBoundingClientRect().height, 0)
    /* How tall the list has to stay for the page to stay where it is: the cards, and any room the screen still shows under them while it is scrolled. */
    const keepFor = (height: number, natural: number) => (box && box.scrollTop > 0 ? Math.max(natural, Math.min(height, box.scrollTop + box.clientHeight - (box.scrollHeight - height))) : natural)
    const natural = naturalNow()
    const keep = keepFor(was, natural)
    /* The room under the cards, given back as the page is scrolled up and it goes under the screen's edge. */
    const hold = () => {
      if (keep <= natural + 0.5 || !box) {
        grid.style.minHeight = ""
        return
      }
      grid.style.minHeight = `${keep}px`
      const onScroll = () => {
        const now = keepFor(grid.getBoundingClientRect().height, naturalNow())
        if (now > naturalNow() + 0.5) grid.style.minHeight = `${now}px`
        else roomOff.current?.()
      }
      box.addEventListener("scroll", onScroll, { passive: true })
      roomOff.current = () => {
        box.removeEventListener("scroll", onScroll)
        grid.style.minHeight = ""
        roomOff.current = null
      }
    }
    if (!still) {
      hold()
      return
    }
    /* The list as one, never card by card: the old still out, the new cards in, on one curve, so the two always add up to one. */
    grid.appendChild(still)
    const timing = { duration: CROSSFADE_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }
    const runs: Animation[] = [still.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: "forwards" })]
    for (const c of live) {
      c.style.mixBlendMode = "plus-lighter"
      runs.push(c.animate([{ opacity: 0 }, { opacity: 1 }], timing))
    }
    /* Shorter: eased down from where it was, as far as the page allows. Taller: it simply is, the new cards fading in where the old ones were. */
    if (keep < was - 0.5) runs.push(grid.animate([{ minHeight: `${was}px` }, { minHeight: `${keep}px` }], { duration: HEIGHT_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" }))
    let done = false
    const finish = () => {
      if (done) return
      done = true
      settle.current = null
      for (const r of runs) r.cancel()
      still.remove()
      for (const c of live) c.style.mixBlendMode = ""
      hold()
    }
    settle.current = finish
    void Promise.all(runs.map((r) => r.finished)).then(finish, finish)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  /* The app pages already asked for (warmApp, below): a hook, so above the page's early return. */
  const warmed = React.useRef(new Set<string>())
  const current = shownAll.find((i) => i.id === openId) ?? null
  if (only && !current) return null
  if (current) {
    return (
      /* No page title above it (round 27): the page starts with Back, under a little room of its own. */
      <div ref={root} data-integrations="" data-integrations-view="page" className={cn("scroll-mt-4", page && "pt-3 sm:pt-5")}>
        <IntegrationDetail
          item={current}
          status={statusOf(current)}
          installed={installed(current)}
          tracking={tracking}
          trackingReady={trackingReady}
          states={states}
          marketing={marketing}
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
            /* Which account it is now (AfterShip's card follows only an AfterShip one). */
            if (appId === "courier_tracking") readOwnTracking()
            window.dispatchEvent(new Event("storelib:integrations-changed"))
          }}
          onBack={only ? undefined : () => open(null)}
          pin={page}
        />
      </div>
    )
  }

  /*
    THE CARDS, IN ONE ORDER FOR EVERY PILL (round 29). Storelib's own first
    (the ones with a page, then the ones that open their settings), then the
    services that work today, then the ones coming soon, each run in the
    categories' order. It used to be the catalog's order, which put Clarity
    after the ad pixels and Hotjar between Prodigi and the Snapchat Pixel, so
    All read as shuffled and a category opened on Coming soon cards ahead of
    working ones. A pill only picks from this one list, so a card keeps its
    place among the others whichever pill is on. A search looks through all
    of them whatever pill is on, so typing never finds nothing because of a pill.
  */
  /*
    ALL IS MIXED (round 30, the owner: Storelib's own apps all came first in
    a block). Still one order for every pill, so a press never moves a card
    (round 29): each lane (a category, or Storelib apps for one of
    Storelib's own with none) in its own order, Storelib's own first, then
    the services in the catalog's order, and the lanes woven together
    (lib/integrations/directory-order weave): the first of each lane in the
    pills' order, the rest spread evenly. Working ones are woven first and
    Coming soon after them, so Coming soon stays last in All, and a
    category's cards, read off this list, are that category in its own order.
  */
  const later = (e: Entry) => e.kind === "integration" && !!(e.item.comingSoon || e.item.paused)
  /* Storelib's core settings (payments, shipping, taxes...) are not integrations: only the Essentials checklist names them. */
  const appEntry = (a: StorelibApp): Entry => ({ kind: "app", id: a.id, app: a })
  const ownRank = (e: Entry) => (e.kind === "integration" ? (hasBuiltInArt(e.id) ? 0 : 2) : 1)
  const listed: Entry[] = [...shownAll.map((i): Entry => ({ kind: "integration", id: i.id, item: i })), ...apps.filter((a) => !a.core).map(appEntry)]
    .map((e, at) => ({ e, at }))
    .sort((a, b) => ownRank(a.e) - ownRank(b.e) || a.at - b.at)
    .map(({ e }) => e)
  const categoryOf = (e: Entry): IntegrationCategory | null => (e.kind === "integration" ? e.item.category : (APP_CATEGORY[e.id] ?? null))
  const laneOf = (e: Entry): Lane => categoryOf(e) ?? "storelib"
  const woven: Entry[] = [...weave(listed.filter((e) => !later(e)), laneOf), ...weave(listed.filter(later), laneOf)]
  /*
    MOST USED FIRST (round 22, the owner: "the order based on what users use
    the most, top to bottom, in All and in every category"). The ones that
    work today by how many stores use them, then Coming soon, as before; a tie
    keeps the woven order above. Still one order for every pill: a category is
    this list filtered, so it is its own most used first too.
  */
  const scoreOf = (e: Entry) => scores?.[e.id] ?? (e.kind === "app" ? scores?.[`app:${e.id}`] : undefined) ?? 0
  const entries: Entry[] = scores
    ? woven
        .map((e, at) => ({ e, at }))
        .sort((a, b) => Number(later(a.e)) - Number(later(b.e)) || scoreOf(b.e) - scoreOf(a.e) || a.at - b.at)
        .map(({ e }) => e)
    : woven
  /* Storelib's own: its apps and the parts of Storelib shown as integrations (Reviews, Courier tracking, the webhook). All holds them as well as every service. */
  const isStorelib = (e: Entry) => e.kind === "app" || hasBuiltInArt(e.id)
  /*
    INSTALLED IS WHAT WORKS IN THIS STORE NOW (round 29): a service with its
    key or ID saved, Storelib's own app switched on, and Courier tracking,
    which is on for every store that ships. Not the webhook until its address
    is saved: "built in" there only meant there is nothing to install, and it
    counted as installed in every store, sending nothing anywhere.
  */
  const isInstalled = (e: Entry) => (e.kind === "integration" ? installed(e.item) || (e.item.builtIn && e.item.kind === "app") : appState(e.id) === "on")
  /* What each card is, for the search, the pill and the filters alike (lib/integrations/directory-filter). */
  const facetsOf = (e: Entry): CardFacets => {
    const category = categoryOf(e)
    if (e.kind === "app") return { id: e.id, name: e.app.name, summary: e.app.summary, category, categoryName: category ? CATEGORY_NAMES[category] : null, storelib: true, installed: isInstalled(e), standing: "built_in" }
    const st = statusOf(e.item)
    return { id: e.id, name: e.item.name, summary: e.item.summary, category, categoryName: CATEGORY_NAMES[e.item.category], storelib: isStorelib(e), installed: isInstalled(e), standing: st === "needs_attention" || st === "error" ? "attention" : st }
  }
  const facets = entries.map(facetsOf)
  /* Which pills there are does not move as you type: a category with no card in this store has none (round 30). */
  const held = new Map<Filter, number>([
    ["all", facets.length],
    ["installed", facets.filter((f) => f.installed).length],
    ["storelib", facets.filter((f) => f.storelib).length],
  ])
  for (const c of CATEGORY_ORDER) held.set(c, facets.filter((f) => f.category === c).length)
  /*
    THE PILLS' ORDER (round 30, the owner; round K4): All, Installed, then
    Reviews, Analytics, Storelib apps, Advertising, Email marketing,
    Automation and every other category as the catalog lists them
    (lib/integrations/directory-order pillOrder). Installed is a pill now,
    not a list above the cards. No Essentials pill (the owner: "get rid of
    the Essential pill"): payments, shipping and taxes are under Settings.
  */
  const pills: Filter[] = pillOrder((c) => held.get(c) ?? 0)
  /* An address naming a category with nothing in it in this store is All. */
  const active: Filter = pills.includes(filter) ? filter : "all"
  const listState: DirectoryState = { category: active, q: query, status: statusFilter, by: maker }
  /* One test per pill, for its count and for the cards it shows alike, so the number on a pill is always the cards under it with what is typed and filtered. */
  const counts = pillCounts(facets, listState, pills)
  const shown = entries.filter((_, i) => visibleIn(facets[i], listState))
  const showing = new Set(shown.map((e) => e.id))
  const firstShown = shown[0]?.id ?? null
  const q = query.trim()
  const filtersOn = activeFilterCount(listState) > 0
  /* The Filter menu's numbers: what each choice would show in this pill with this search. */
  const inThis = facets.filter((f) => inPill(f, active) && matchesQuery(f, q))
  const countWith = (s: { status: StatusFilter; by: MakerFilter }) => inThis.filter((f) => passesFilters(f, s)).length
  const filterCounts = {
    status: { any: countWith({ status: "any", by: maker }), available: countWith({ status: "available", by: maker }), coming_soon: countWith({ status: "coming_soon", by: maker }), attention: countWith({ status: "attention", by: maker }) },
    by: { any: countWith({ status: statusFilter, by: "any" }), storelib: countWith({ status: statusFilter, by: "storelib" }), partner: countWith({ status: statusFilter, by: "partner" }) },
  }
  const hrefOf = (a: StorelibApp) => appStates?.hrefs[a.id] ?? a.href
  /*
    THE NEXT PAGE IS ALREADY HERE (round 30). One of Storelib's apps is a page
    of its own: fetched in full on a hover, a focus or a touch (lib/ui/
    app-navigation prefetchAppPage, as the rail does), on top of what the
    link fetches by itself once it is on screen. An integration's page is
    drawn here, from the reads kept above: a hover only reads again one
    that has gone stale.
  */
  const warmApp = (href: string) => {
    if (warmed.current.has(href)) return
    warmed.current.add(href)
    prefetchAppPage(router, href)
  }
  const warmPages = () => prefetchGet(keptReads(physical))

  return (
    <div ref={root} data-integrations="" data-integrations-view="list" className="@container scroll-mt-4 space-y-3.5">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{tt("Search integrations")}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => typeQuery(e.target.value)}
            placeholder={tt("Search by name, category or description")}
            className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white pl-10 pr-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] sm:text-[14px]"
            data-integrations-search=""
          />
        </label>
        <button
          type="button"
          aria-label={tt("Request integration")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] text-[14px] font-semibold text-white outline-none transition-colors hover:bg-[#2b2b42] focus-visible:ring-[3px] focus-visible:ring-[#1a1a2e]/20 active:bg-[#111122] sm:w-auto sm:px-5 [-webkit-tap-highlight-color:transparent]"
          onClick={() => setRequesting(true)}
          data-request-integration=""
        >
          <Lightbulb className="h-[18px] w-[18px] sm:h-4 sm:w-4" aria-hidden />
          {/* On a phone the bulb alone, so the search keeps its words. */}
          <span className="hidden sm:inline">{tt("Request integration")}</span>
        </button>
      </div>

      <div className="flex items-start gap-2">
        <div ref={pillsRef} className="relative -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={tt("Categories")} data-integration-pills="">
          {pills.map((f) => {
            const on = active === f
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => chooseFilter(f)}
                data-integration-pill={f}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium [-webkit-tap-highlight-color:transparent]",
                  on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db] active:bg-[#f3f4f6]",
                )}
              >
                {f === "all" ? tt("All") : f === "installed" ? tt("Installed") : f === "storelib" ? tt("Storelib apps") : CATEGORY_NAMES[f]}
                <span className={cn("tabular-nums", on ? "text-white/70" : "text-[#9ca3af]")}>{counts.get(f) ?? 0}</span>
              </button>
            )
          })}
        </div>
        <FilterMenu status={statusFilter} by={maker} onChange={chooseFilters} counts={filterCounts} />
      </div>

      {error ? <Notice>{error}</Notice> : null}
      {/* Isolated, so the crossfade's two layers add up inside it and nowhere else. */}
      <div ref={gridBox} className="relative isolate" data-integration-grid-box="">
        <div hidden={shown.length > 0} className={cn(CARD, "px-5 py-10 text-center")} data-integration-empty="">
          <p className="text-[14px] font-medium text-[#1a1a2e]">{active === "installed" && !q && !filtersOn ? tt("Nothing installed yet") : tt("Nothing matches")}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {active !== "all" && (counts.get("all") ?? 0) > 0 ? (
              <button type="button" className={BTN_SECONDARY} onClick={() => chooseFilter("all")} data-integration-empty-all="">
                {tt("Search all integrations")}
              </button>
            ) : null}
            {filtersOn ? (
              <button type="button" className={BTN_SECONDARY} onClick={() => chooseFilters({ status: "any", by: "any" })}>
                {tt("Clear filters")}
              </button>
            ) : null}
            <button type="button" className={BTN_SECONDARY} onClick={() => setRequesting(true)}>
              {tt("Request integration")}
            </button>
          </div>
        </div>
        {/* One list for every pill, every card in it from the start: a switch only shows and hides cards, each keeping its place,
            so nothing is mounted again, and no logo loads or flashes again. On a phone it is one card of rows, a hairline between
            the rows shown; from 640px a grid of cards, two across, three once the list is 880px wide (a computer's /app page). */}
        <ul ref={gridRef} hidden={shown.length === 0} className={cn(CARD, "overflow-hidden sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none @min-[880px]:grid-cols-3")} data-integration-grid="">
          {entries.map((e) => (
            <li key={e.id} hidden={!showing.has(e.id)} className={e.id === firstShown ? undefined : "border-t border-[#f1f2f4] sm:border-t-0"}>
              {e.kind === "app" ? (
                <Link
                  href={hrefOf(e.app)}
                  data-integration-card={e.id}
                  data-storelib-app={e.id}
                  className={ENTRY}
                  onPointerEnter={() => warmApp(hrefOf(e.app))}
                  onFocus={() => warmApp(hrefOf(e.app))}
                  onTouchStart={() => warmApp(hrefOf(e.app))}
                >
                  <EntryBody color={tileColor(e.id) ?? "#64748b"} mark={<Mark item={{ id: e.id, name: e.app.name, logo: null }} />} name={e.app.name} category={categoryOf(e) ? CATEGORY_NAMES[categoryOf(e)!] : tt("Storelib app")} summary={e.app.summary} badge={<AppBadge state={appState(e.id)} />} />
                </Link>
              ) : (
                <button type="button" onClick={() => open(e.id)} onPointerEnter={warmPages} onFocus={warmPages} data-integration-card={e.id} className={ENTRY}>
                  <EntryBody color={bannerColor(e.item)} mark={<Mark item={e.item} />} name={e.item.name} category={CATEGORY_NAMES[e.item.category]} summary={e.item.summary} badge={<StatusBadge status={statusOf(e.item)} />} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <RequestForm open={requesting} onClose={() => setRequesting(false)} />
    </div>
  )
}

type Tone = "gray" | "green" | "amber" | "red" | "slate" | "line"
const TONE: Record<Tone, string> = {
  gray: "bg-[#f3f4f6] text-[#4b5563]",
  green: "bg-[#ecfdf3] text-[#067647]",
  amber: "bg-[#fffaeb] text-[#b54708]",
  red: "bg-[#fef3f2] text-[#b42318]",
  slate: "bg-[#eef2f6] text-[#364152]",
  line: "border border-[#e5e7eb] bg-white text-[#4b5563]",
}
function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold", TONE[tone])} data-integration-badge="">
      {tone === "green" ? <Check className="h-3 w-3" aria-hidden /> : null}
      {children}
    </span>
  )
}

/** Where a card stands, in one word: Installed, Built in, Available, Coming soon, or one that needs a look. */
function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "installed") return <Badge tone="green">{tt("Installed")}</Badge>
  if (status === "built_in") return <Badge tone="slate">{tt("Built in")}</Badge>
  if (status === "needs_attention") return <Badge tone="amber">{tt("Needs attention")}</Badge>
  if (status === "error") return <Badge tone="red">{tt("Not working")}</Badge>
  if (status === "coming_soon") return <Badge tone="gray">{tt("Coming soon")}</Badge>
  return <Badge tone="line">{tt("Available")}</Badge>
}

/*
  A CARD, TWO SHAPES (round K4). On a phone a row in one list: the mark, the
  name with its one line, the badge. From 640px a card in the grid, all the
  same height: a quiet band at the top behind the mark, the badge in that
  band, the name, the category, and two lines of what it does.

  A HOVER DOES NOT MOVE IT (round 27, the owner: "it bumps"). It used to rise
  a pixel: the edge under the pointer moved with it, so a pointer resting on
  the bottom edge left the card, it dropped back, came under the pointer
  again, and the card shook. Now only its depth changes, the hairline a shade
  darker and the soft shadow under it, eased in and out on the same curve;
  the box stays exactly where it is (scripts/check-integrations27.mjs
  measures 0px).
*/
const ENTRY = cn(
  "group relative flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-[background-color,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[#f8f9fa] active:bg-[#f3f4f6] focus-visible:bg-[#f8f9fa] motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]",
  "sm:h-full sm:flex-col sm:items-stretch sm:gap-3 sm:overflow-hidden sm:p-5 sm:hover:bg-white sm:active:bg-white",
  "sm:rounded-2xl sm:border sm:border-[#e5e7eb]/70 sm:bg-white sm:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_-12px_rgba(16,24,40,0)] sm:hover:border-[#dfe2e6] sm:hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_-12px_rgba(16,24,40,0.18)] sm:focus-visible:ring-2 sm:focus-visible:ring-[#1a1a2e]/15",
)

/*
  THE COVER FILLS ON A HOVER (round Y2, the owner: "smooth, clean,
  satisfying, for each colour, but subtle"). The band at the top of a card
  holds a quiet wash of the integration's own colour (the same colour as its
  page's banner, bannerColor), and under a pointer a second, fuller wash
  grows out from the logo and fades in, then eases back out when the pointer
  leaves. Only opacity and a scale of one layer, so the compositor draws it
  and nothing is painted again; 380ms in, 300ms out, on a curve that starts
  and ends soft, so it fills rather than pops. Only where there is a pointer (Tailwind's hover is
  @media (hover: hover)); with reduced motion it simply is there, no motion
  (scripts/check-integrations-y2.mjs measures it).
*/
const washAt = "42px 44px"
function coverWash(color: string, strength: "rest" | "full"): React.CSSProperties {
  const [a, b] = strength === "rest" ? [9, 3] : [16, 6]
  return {
    backgroundImage: `radial-gradient(150px 80px at ${washAt}, color-mix(in srgb, ${color} ${a}%, transparent) 0%, transparent 100%), radial-gradient(130% 160% at 0% 0%, color-mix(in srgb, ${color} ${b}%, transparent) 0%, transparent 70%)`,
  }
}

function EntryBody({ color, mark, name, category, summary, badge }: { color: string; mark: React.ReactNode; name: string; category: string; summary: string; badge: React.ReactNode }) {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 hidden h-[46px] overflow-hidden border-b border-[#f3f4f6] bg-[#f9fafb] sm:block" data-integration-cover="">
        <span className="absolute inset-0" style={coverWash(color, "rest")} />
        <span
          className="absolute inset-0 origin-[42px_44px] scale-[0.82] opacity-0 transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[opacity,scale] group-hover:scale-100 group-hover:opacity-100 group-hover:duration-[380ms] group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          style={coverWash(color, "full")}
          data-integration-cover-fill=""
        />
        <span className="int-mesh" style={meshStyle(color)} data-integration-mesh="" />
        <span className="int-grain" data-integration-grain="" />
      </span>
      <span className="relative flex shrink-0 items-start justify-between gap-3">
        <span className="rounded-[12px] sm:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_4px_10px_-4px_rgba(16,24,40,0.12)]">{mark}</span>
        {/* In the band, not on its edge (round 27: it sat on the line under the band): centred in its 45px, 10.5px clear above and below. */}
        <span className="hidden sm:-mt-[9.5px] sm:inline-flex" data-integration-card-badge="">
          {badge}
        </span>
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-[#1a1a2e] sm:text-[15px]">{name}</span>
        <span className="mt-0.5 hidden truncate text-[12.5px] text-[#6b7280] sm:block" data-integration-category="">{category}</span>
        <span className="mt-0.5 block truncate text-[13px] leading-[19px] text-[#6b7280] sm:mt-2 sm:line-clamp-2 sm:min-h-[38px] sm:whitespace-normal sm:text-[#4b5563]">{summary}</span>
      </span>
      <span className="relative shrink-0 sm:hidden">{badge}</span>
    </>
  )
}

/*
  A DISPERSED, GRAINY GRADIENT ON A HOVER (the owner, after the specks of
  round Z7 read as bubbles and the first mesh as too colourful: "more noisy,
  grainy, kind of like texture"). The colour is the integration's own, mixed
  well toward grey and kept faint; over it a film grain (.int-grain, an SVG
  noise tile) fades in, so it reads as texture rather than colour. One layer, made of four
  wide, low soft ellipses of the integration's colour and three close
  neighbours (lighter, cooler, warmer), overlapping so far that no edge or
  dot can be seen: a mesh, not shapes. Under the pointer it fades in and
  slides a few pixels into place, then drifts very slowly while it stays.
  Only its opacity and position change; nothing with reduced motion or
  without hover (app/globals.css .int-mesh).
*/
function meshStyle(color: string): React.CSSProperties {
  const mix = (other: string | null, pct: number, alpha: number) => {
    const tone = other ? `color-mix(in srgb, ${color} ${pct}%, ${other})` : color
    return `color-mix(in srgb, ${tone} ${alpha}%, transparent)`
  }
  return {
    backgroundImage: [
      `radial-gradient(60% 140% at 18% 30%, ${mix("#9ca3af", 40, 16)} 0%, transparent 70%)`,
      `radial-gradient(55% 150% at 42% 70%, ${mix("#9ca3af", 55, 14)} 0%, transparent 72%)`,
      `radial-gradient(60% 140% at 66% 20%, ${mix("#d1d5db", 45, 12)} 0%, transparent 72%)`,
      `radial-gradient(55% 150% at 90% 65%, ${mix("#9ca3af", 50, 10)} 0%, transparent 72%)`,
    ].join(", "),
  }
}

/** One of Storelib's own that opens where it is set up: On when it is in use, Built in otherwise (Off and Set up are its own page's words). */
function AppBadge({ state }: { state: AppState | null }) {
  return state === "on" ? <Badge tone="green">{tt("On")}</Badge> : <Badge tone="slate">{tt("Built in")}</Badge>
}

/** The Filter menu: Status and Made by, applied at once, kept in the address. */
function FilterMenu({ status, by, onChange, counts }: { status: StatusFilter; by: MakerFilter; onChange: (next: { status?: StatusFilter; by?: MakerFilter }) => void; counts: { status: Record<StatusFilter, number>; by: Record<MakerFilter, number> } }) {
  const [open, setOpen] = React.useState(false)
  const box = React.useRef<HTMLDivElement>(null)
  const set = activeFilterCount({ status, by })
  React.useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", away)
    document.addEventListener("keydown", key)
    return () => {
      document.removeEventListener("pointerdown", away)
      document.removeEventListener("keydown", key)
    }
  }, [open])
  const option = <T extends string>(group: "status" | "by", value: T, label: string, on: boolean, count: number) => (
    <button
      key={value}
      type="button"
      role="menuitemradio"
      aria-checked={on}
      onClick={() => onChange(group === "status" ? { status: value as StatusFilter } : { by: value as MakerFilter })}
      className={cn("flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors [-webkit-tap-highlight-color:transparent]", on ? "bg-[#f3f4f6] font-medium text-[#1a1a2e]" : "text-[#374151] hover:bg-[#f8f9fa]")}
      data-integration-filter={`${group}:${value}`}
    >
      <span aria-hidden className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#d1d5db] bg-white")}>
        {on ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular-nums text-[#9ca3af]">{count}</span>
    </button>
  )
  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium [-webkit-tap-highlight-color:transparent]", set > 0 ? "border-[#1a1a2e] bg-white text-[#1a1a2e]" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db]")}
        data-integration-filter-button=""
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        {tt("Filter")}
        {set > 0 ? <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#1a1a2e] px-1 text-[11px] tabular-nums text-white">{set}</span> : null}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 w-[264px] max-w-[calc(100vw-32px)] rounded-2xl border border-[#e5e7eb] bg-white p-2 shadow-[0_12px_32px_-12px_rgba(16,24,40,0.28)]" data-integration-filter-menu="">
          <p className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Status")}</p>
          {option("status", "any", tt("Any status"), status === "any", counts.status.any)}
          {option("status", "available", tt("Ready to connect"), status === "available", counts.status.available)}
          {option("status", "coming_soon", tt("Coming soon"), status === "coming_soon", counts.status.coming_soon)}
          {counts.status.attention > 0 || status === "attention" ? option("status", "attention", tt("Needs attention"), status === "attention", counts.status.attention) : null}
          <p className="mt-1.5 border-t border-[#f1f2f4] px-2.5 pb-1 pt-2.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Made by")}</p>
          {option("by", "any", tt("Anyone"), by === "any", counts.by.any)}
          {option("by", "storelib", tt("Storelib"), by === "storelib", counts.by.storelib)}
          {option("by", "partner", tt("Other services"), by === "partner", counts.by.partner)}
          {set > 0 ? (
            <button type="button" onClick={() => onChange({ status: "any", by: "any" })} className="mt-1.5 flex h-9 w-full items-center justify-center rounded-lg border-t border-[#f1f2f4] text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa]" data-integration-filter-clear="">
              {tt("Clear filters")}
            </button>
          ) : null}
        </div>
      ) : null}
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
