"use client"

/**
 * ===========================================================================
 *  A NAVIGATION BETWEEN /app PAGES, AND WHAT THE SHELL SHOWS WHILE IT RUNS
 * ===========================================================================
 * "Once I click on something it loads like native. If it takes really long,
 * show a smooth clean iOS style rotating spinner, light gray. There should be
 * NO skeleton loading structure on mobile devices when switching pages."
 *
 * So the page you are on stays on screen until the next one is ready (the
 * router holds it: there is no route level loading boundary under /app), the
 * control you pressed shows its new state on the press itself (the pill, the
 * menu and the rail all read `useShownPath` below), and what the shell adds
 * depends only on how long the page takes. On a phone, and anywhere in the
 * native apps:
 *
 *      under 500ms   nothing at all
 *      500ms         the content area goes plain, with the spinner a little
 *                    above its middle (40% of the way down), fading in over
 *                    150ms, and out over 120ms once the page is there
 *
 * Why 500. The four pages in the pill are fetched whole ahead of time, so a
 * tap on one of them lands on the next frame; a page that was not, over a
 * phone connection, typically takes 300 to 700ms. Anything shown before half
 * a second would be on screen for a few frames on most taps and then go, a
 * flicker that says "loading" about something that did not need saying. Past
 * it, a screen that has not moved starts to read as a tap that missed, which
 * is what the spinner is there to answer.
 *
 * On a computer, where a pointer has hover and the rows already answer it:
 *
 *      under 300ms   nothing at all
 *      300ms         a thin bar along the top of the header
 *      1000ms        the same plain surface and spinner over the content
 *
 * No page draws an outline of itself any more, at any width: the per page
 * skeletons were "too complicated", and a grey drawing of a page that then
 * turns into the page is a second thing to look at on every slow click.
 *
 * Never for the product editor or the plans page (`waitsWithSpinner`): the
 * plans page is drawn over the whole shell, the editor is on a phone (from md
 * it is a page in the shell, and the bar still shows there), and the page you
 * were on stays until they are ready.
 *
 * When the new page commits there is one short entrance: opacity from 0 and a
 * 5px rise, 180ms, one curve (components/app/app-stage.tsx). If the spinner's
 * surface was up, its fade out (NAV_SPINNER_OUT_MS) is the page's fade in,
 * and the page only rises.
 *
 * This file is the one record of "a navigation is underway, to where, since
 * when" that the bar, the stage and the nav controls all read, so they cannot
 * disagree about it. It is module state, which is right here: it describes
 * this tab's router and nothing else, and nothing on a server ever reads it.
 */

import { useSyncExternalStore } from "react"
import { usePathname, useSearchParams } from "next/navigation"

/** On a computer, below this a navigation shows nothing: most are over before it. */
export const NAV_BAR_AFTER_MS = 300
/** On a computer, past this the content area waits with the spinner. */
export const NAV_SPINNER_AFTER_MS = 1000
/** On a phone, or in the native apps, the spinner comes this soon (see above for why 500)... */
export const NAV_PHONE_SPINNER_AFTER_MS = 500
/** ...and at either width it arrives on an opacity fade this long. */
export const NAV_SPINNER_FADE_MS = 150
/**
 * AND IT LEAVES QUICKER THAN IT CAME. "Make sure the in-page transition with
 * the loading doesn't stay so long." The page is already there, whole, under
 * the surface on the frame it commits, so the surface going IS the page
 * appearing: 120ms, from the commit, on the landing's curve, while the page
 * rises under it over NAV_ENTER_MS. It was the landing's own 180ms.
 */
export const NAV_SPINNER_OUT_MS = 120
/**
 * The landing: opacity and a rise, on one curve. The rise is 2px: "it comes
 * with a bump, sliding up when I land on the page... extremely subtle,
 * normal." At 5px the page read as arriving from below; at 2px it only
 * settles, and the fade does the work.
 */
export const NAV_ENTER_MS = 180
export const NAV_ENTER_RISE_PX = 2
export const NAV_ENTER_EASE = "cubic-bezier(0.2, 0, 0, 1)"
/**
 * How long the router keeps a page it fetched: next.config.mjs
 * `experimental.staleTimes.dynamic`, in ms (tests/app-shell-motion.test.ts
 * holds the two equal). Past it a warmed page is cold again, so the pill warms
 * its four again when the app comes back after longer than this.
 */
export const APP_PAGE_KEPT_MS = 300_000
/** A navigation that never reports back (it failed, or went nowhere) is dropped after this. */
const GIVE_UP_MS = 10000
/**
 * THE SPINNER NEVER HOLDS THE SCREEN LONGER THAN THIS. "Make sure it never
 * blocks, fully." A page that has not arrived 8 seconds after the press is
 * a page with a problem (a server that hung, a navigation the router
 * dropped without saying), and a plain surface with a spinner on it is then
 * the worst thing to be looking at: the surface fades away and the page you
 * were on is back, working. The navigation itself is not cancelled; if the
 * page does come, it lands as any other. Logged, so it can be found.
 */
export const NAV_SPINNER_CAP_MS = 8000

function pathOf(href: string): string {
  return (href.split(/[?#]/)[0] || "").replace(/\/+$/, "") || "/"
}

/**
 * A PRESS ON ONEPAGE ENDS IN THE EDITOR. "It shows the loading thing but it
 * never takes me there." For most pages the cap above hands back the page
 * you were on. The OnePage editor is a place somebody set out to go, and
 * handing back Home after eight seconds of spinner read as the press being
 * refused, with the editor then landing much later over whatever they had
 * gone on to do. So for the editor, a navigation still underway at the cap
 * is finished the way the router finishes one it cannot: the address is
 * loaded as a document (components/app/app-stage.tsx SlowPage). Its server
 * page answers within a few seconds whatever Supabase does
 * (lib/onepage/bounded-read.ts), so this is the rare case of a request the
 * router lost.
 */
export function loadsAsDocumentWhenStalled(href: string | null): boolean {
  if (!href) return false
  return pathOf(href) === "/app/onepage"
}

/**
 * Whether a slow navigation to this address waits with the spinner. Not the
 * product editor or the coupon editor, new or saved: the page you were on
 * stays until the editor is ready. Not the plans page either: it is drawn over the whole shell
 * (components/app/page-layer.tsx), so a surface under the header would be
 * the wrong shape in the wrong place.
 */
export function waitsWithSpinner(href: string | null): boolean {
  if (!href) return false
  const path = pathOf(href)
  if (path !== "/app" && !path.startsWith("/app/")) return false
  /* Products › Collections is a list like any other, under the products' address but not their editor. */
  if (path === "/app/products/collections") return true
  if (/^\/app\/products\/[^/]+(\/|$)/.test(path)) return false
  /* The coupon editor, new or saved: the same frame as the product editor's (app/app/coupons/coupon-editor.tsx). */
  if (/^\/app\/coupons\/[^/]+(\/|$)/.test(path)) return false
  if (path === "/app/settings/billing/upgrade") return false
  return true
}

/**
 * A phone, by width (the nav pill's breakpoint), or the native apps at any
 * width. The class is the one the native shell puts on <html> before the
 * first paint; nothing here reads a user agent.
 */
export function isPhoneShell(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  if (document.documentElement.classList.contains("capacitor")) return true
  return !!window.matchMedia?.("(max-width: 767px)").matches
}

/** How long a navigation to `href` runs before the spinner shows, or null for never. */
export function spinnerDelay(href: string | null, phone: boolean = isPhoneShell()): number | null {
  if (!waitsWithSpinner(href)) return null
  return phone ? NAV_PHONE_SPINNER_AFTER_MS : NAV_SPINNER_AFTER_MS
}

/**
 * Is `href` the address already showing? Pressing the page you are on starts
 * no navigation: the router has nothing to commit, so a record started for it
 * was never ended by a landing, and the bar and the outline sat over the page
 * for the full ten seconds of GIVE_UP_MS. That was one of the "it bugs
 * sometimes": tap the pill's lit icon, or the rail's lit row, and wait.
 *
 * And a press on it while another page is on its way ENDS that record: the
 * router drops a pending navigation when a new one starts (Next's action
 * queue marks it discarded), so the page on its way never commits and the
 * one showing stays. Tapping Orders and then Home again before Orders came
 * left the spinner over Home, and Orders lit in the pill, for ten seconds.
 */
export function isCurrentAddress(href: string | null): boolean {
  if (!href || typeof window === "undefined" || !window.location) return false
  try {
    const url = new URL(href, window.location.href)
    return url.origin === window.location.origin
      && pathOf(url.pathname) === pathOf(window.location.pathname)
      && url.search === window.location.search
  } catch {
    return false
  }
}

/**
 * The address the stage last committed, as `pathname?search`. A back or
 * forward to it commits nothing: the email editor pushes a guard entry at
 * its own address so Back can ask about unsaved work (the OnePage editor did
 * too, and its tabs pushed `#tab`). Popping one of those used to start a
 * record that no commit ever ended, so the spinner came up at 500ms over the
 * editor and its "unsaved changes" dialog, and stayed for GIVE_UP_MS.
 */
let committed: string | null = null

function addressKey(pathname: string, search: string): string {
  const q = new URLSearchParams(search).toString()
  return q ? `${pathOf(pathname)}?${q}` : pathOf(pathname)
}

/*
  THE PAGE SETTINGS IS UP OVER. Opened from a page of /app, Settings is a
  sheet drawn over that page (app/app/@sheet/(.)settings), which stays
  mounted and in sight above it. The address says /app/settings, so the rail
  put out the row of the page you were on (the owner: "when I open the sheet,
  that gray thing gets unhovered") and lit it again when the sheet closed.
  The page under the sheet is still the page you are on: its row stays lit.
*/
const SETTINGS_SHEET_PATH = "/app/settings"
/** The path the stage last committed, and the page Settings was opened over (null when it is not up over one). */
let committedPath: string | null = null
let underSheet: string | null = null
const isShellPage = (path: string) => (path === "/app" || path.startsWith("/app/")) && path !== SETTINGS_SHEET_PATH

/** The stage has committed this page (AppStage, before it is painted). */
export function markCommitted(pathname: string, search: string) {
  const path = pathOf(pathname)
  if (path !== SETTINGS_SHEET_PATH) underSheet = null
  else if (underSheet === null && committedPath && isShellPage(committedPath)) underSheet = committedPath
  committedPath = path
  committed = addressKey(pathname, search)
}

/** The shell is gone (a page outside /app): whatever it last showed is not under anything opened next. */
export function forgetCommitted() {
  committedPath = null
  underSheet = null
}

/**
 * The page Settings is drawn over, while `shown` is Settings: the one it was
 * opened on (recorded when it committed), or, on the press and the render
 * before the stage commits it, the page still showing. Null when Settings
 * stands on its own (a reload, a link from outside the shell).
 */
export function pageUnderSettingsSheet(shown: string): string | null {
  if (pathOf(shown) !== SETTINGS_SHEET_PATH) return null
  if (underSheet) return underSheet
  return committedPath && isShellPage(committedPath) ? committedPath : null
}

/** From 1024px Settings is a sheet over the page; below it, a page of its own (components/app/settings-sheet.tsx). */
function settingsIsSheet(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1024px)").matches
}

/** Is the address the window now shows the page already committed? */
export function isCommittedAddress(pathname: string, search: string): boolean {
  return committed != null && committed === addressKey(pathname, search)
}

export type AppNavigation = { href: string | null; startedAt: number }

let current: AppNavigation | null = null
let giveUp: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
const emit = () => { for (const f of [...listeners]) f() }

/** A navigation has started, to `href` when the caller knows it. */
export function beginAppNavigation(href: string | null = null) {
  if (typeof window === "undefined") return
  if (giveUp) clearTimeout(giveUp)
  giveUp = setTimeout(endAppNavigation, GIVE_UP_MS)
  /* One press is often reported twice (the link's own click, and the row's
     handler saying where it goes). The second is the same navigation: keep
     when it started, and do not wake every reader for nothing. */
  if (current && href && current.href === href) return
  current = { href, startedAt: performance.now() }
  emit()
}

/** The new page has committed (or nothing is going to). */
export function endAppNavigation() {
  if (giveUp) { clearTimeout(giveUp); giveUp = null }
  if (!current) return
  current = null
  emit()
}

export function getAppNavigation() {
  return current
}

/**
 * A COMMIT THAT CHANGED NOTHING THE STAGE CAN SEE. The stage ends the record
 * when the address it shows changes (components/app/app-stage.tsx). A
 * navigation can also land on the address already showing: a redirect back
 * to it, a page that sends you where you are. Nothing the stage reads moves,
 * so the record stayed, and with it the spinner, until GIVE_UP_MS.
 *
 * The router writes every commit into the history with its own marker
 * (`__NA` in the state, Next's HistoryUpdater), in the same commit and
 * before the layout effects. So: when it does, look again once the commit is
 * over, and if the record is still the same one and the window is on the
 * address the stage committed, the navigation has landed where it started.
 * Installed once, for the life of the tab.
 */
let watchingCommits = false
export function watchRouterCommits() {
  if (watchingCommits || typeof window === "undefined" || !window.history) return
  watchingCommits = true
  const h = window.history
  for (const name of ["pushState", "replaceState"] as const) {
    const original = h[name]
    h[name] = function (this: History, data: unknown, unused: string, url?: string | URL | null) {
      const result = original.call(this, data, unused, url)
      const nav = current
      if (nav && data && typeof data === "object" && (data as { __NA?: unknown }).__NA) {
        window.setTimeout(() => {
          if (current === nav && isCommittedAddress(window.location.pathname, window.location.search)) endAppNavigation()
        }, 0)
      }
      return result
    }
  }
}

/**
 * ===========================================================================
 *  THE ROUTER'S ANSWER IS IN, AND THE PAGE DID NOT LAND
 * ===========================================================================
 * "It starts the loading bar at the top of the screen but never takes me to
 * what I clicked." Measured with the real router, built and served
 * (scripts/check-onepage-leave.mjs): a deploy lands while a tab is open, a
 * row is pressed, the bar runs, the spinner comes up, and the page never
 * arrives, however long you wait. The rail keeps the row you pressed lit.
 *
 * Why. A Link in view fetches its page's outline ahead, on its own. A press
 * starts from that outline and asks the server for the rest. When the answer
 * is one the router cannot use in place (a page from another build after a
 * deploy, an error page, anything but a page payload), the router means to
 * load the address as a document instead, and on this one path it drops the
 * answer: `listenForDynamicRequest` in Next 16.0's
 * client/components/router-reducer/ppr-navigations.js returns on it without
 * settling the new page's data. The page waits on data that never comes, the
 * router never commits it, and the page you were on stays for good.
 *
 * The OnePage editor is where it was met, and why there: a long session, so
 * deploys land during it; entered as a document; and on it the rail's pages
 * are fetched only in outline, because the pill that fetches four of them
 * whole is not drawn over the editor.
 *
 * So the shell watches for the router's own request for the address it is
 * waiting on: a fetch of that address with the router's `_rsc` marker, sent
 * at or after the press (one sent before it is the prefetch under the
 * pointer or the finger, not the answer). Once that has come back whole, a
 * page that is going to land lands as soon as it is rendered. If the same
 * navigation is still the one underway NAV_STUCK_AFTER_ANSWER_MS after the
 * answer (and after any script or stylesheet the page is still loading), the
 * shell does what the router meant to do: it loads the address as a
 * document. Resource timing only, so no request is touched and no response
 * is read.
 */
/*
  Six seconds, not two (round 23). Two seconds after its answer and its code, a heavy page can still be rendering on a
  slow phone: the website builder's editor, entered by a link at 4x CPU, took up to 2.7s from its answer to its commit in
  scripts/nav23-real-router, and the check loaded it again as a document just as it was arriving. The page the router
  really lost is still loaded for real, a few seconds later.
*/
export const NAV_STUCK_AFTER_ANSWER_MS = 6000
/** The router's request goes out inside the press, a moment either side of the record starting. */
const ANSWER_SLACK_MS = 20

/** Is this finished request the router's own request for the address `nav` is going to? */
export function isAnswerFor(
  nav: AppNavigation,
  entry: { name: string; startTime: number; initiatorType?: string },
  origin: string,
): boolean {
  if (!nav.href || (entry.initiatorType && entry.initiatorType !== "fetch")) return false
  if (entry.startTime < nav.startedAt - ANSWER_SLACK_MS) return false
  try {
    const url = new URL(entry.name)
    const want = new URL(nav.href, origin)
    if (url.origin !== origin || !url.searchParams.has("_rsc")) return false
    url.searchParams.delete("_rsc")
    return addressKey(url.pathname, url.search) === addressKey(want.pathname, want.search)
  } catch {
    return false
  }
}

let watchingAnswers = false
let armed: { nav: AppNavigation; due: number; timer: number } | null = null

function armStuckCheck(nav: AppNavigation, from: number) {
  const due = from + NAV_STUCK_AFTER_ANSWER_MS
  if (armed?.nav === nav && armed.due >= due) return
  if (armed) window.clearTimeout(armed.timer)
  const timer = window.setTimeout(() => {
    if (armed?.timer === timer) armed = null
    if (current !== nav) return
    /* A tab in the background renders late: ask again once it is back. */
    if (document.visibilityState === "hidden") {
      const back = () => {
        if (document.visibilityState !== "visible") return
        document.removeEventListener("visibilitychange", back)
        armStuckCheck(nav, performance.now())
      }
      document.addEventListener("visibilitychange", back)
      return
    }
    /*
      THE PAGE IS ALREADY THERE (round 23). A page outside the shell (the website builder's editor, a creator's page, Help)
      lands with the shell gone, so nothing was left to end the record, and two seconds after its answer the page that had
      just come was loaded again as a document: entering the editor by a link reloaded it once it was up. The address
      showing the page (its query may have moved on since, as the editor's does) is the landing; only a page that never
      came is loaded for real.
    */
    const navPath = pathOf(new URL(nav.href as string, window.location.href).pathname)
    if (pathOf(window.location.pathname) === navPath && committedPath !== navPath) {
      endAppNavigation()
      return
    }
    console.warn(`[app-navigation] ${nav.href}: the router's answer came back and the page did not land; loading it as a document`)
    window.location.assign(nav.href as string)
  }, Math.max(0, due - performance.now()))
  armed = { nav, due, timer }
}

/** Installed once, for the life of the tab (AppStage). */
export function watchRouterAnswers() {
  if (watchingAnswers || typeof window === "undefined" || typeof PerformanceObserver !== "function") return
  watchingAnswers = true
  try {
    new PerformanceObserver((list) => {
      const nav = current
      if (!nav) return
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if (isAnswerFor(nav, entry, window.location.origin)) armStuckCheck(nav, entry.responseEnd)
        /* The new page's own code still arriving after its answer: the wait runs from the last of it. */
        else if (armed?.nav === nav && (entry.initiatorType === "script" || entry.initiatorType === "link")) armStuckCheck(nav, entry.responseEnd)
      }
    }).observe({ type: "resource" })
  } catch {
    /* No resource timing: the cap and the give up still end the wait. */
  }
}

/**
 * A PRESS THE ROUTER WILL FOLLOW IN THIS TAB: the main button, no key held
 * that sends it to a new tab or window, and nothing has stopped it already.
 * A row that started the shell's record on any press ran the bar here for
 * GIVE_UP_MS while a Cmd-click opened the page in a new tab.
 */
export function isPlainClick(e: { button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; defaultPrevented?: boolean }) {
  return (e.button ?? 0) === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented
}

/* Whether the router started anything on a press: lib/ui/router-starts.ts,
   on its own so instrumentation-client.ts can count without this module. */
export { noteRouterStart, routerStartCount, watchRouterStarts } from "./router-starts"

function subscribe(f: () => void) {
  listeners.add(f)
  return () => { listeners.delete(f) }
}

export function useAppNavigation(): AppNavigation | null {
  return useSyncExternalStore(subscribe, getAppNavigation, () => null)
}

/** Where the navigation underway is going, as a path inside /app, or null. */
export function pendingPath(nav: AppNavigation | null): string | null {
  if (!nav?.href) return null
  const path = pathOf(nav.href)
  return path === "/app" || path.startsWith("/app/") ? path : null
}

/**
 * THE PAGE THE NAV LIGHTS UP: the one being opened while it is on its way,
 * the one showing otherwise. A native tab bar changes its selection on the
 * tap and then waits for the screen; lighting the row only when the router
 * committed made every press feel as slow as the server. The rail and the
 * menu read this; the pill reads the same record for its circle.
 */
export function useShownPath(): string {
  const pathname = usePathname()
  const nav = useAppNavigation()
  const shown = pendingPath(nav) ?? pathname
  /* Settings up as a sheet over a page: that page's row stays lit, on the press, while it is up and as it closes. */
  return (settingsIsSheet() && pageUnderSettingsSheet(shown)) || shown
}

/**
 * The query beside useShownPath: the one being opened while a navigation is
 * underway, the one showing otherwise. For the rows whose address is a query
 * (Settings › Integrations, each integration under it). useSearchParams needs
 * no Suspense boundary here: the rows are drawn by /app's layout, which reads
 * headers() and so is never prerendered.
 */
export function useShownSearch(): string {
  const search = useSearchParams()
  const nav = useAppNavigation()
  if (pendingPath(nav) !== null && nav?.href) return nav.href.split("#")[0].split("?")[1] ?? ""
  return search?.toString() ?? ""
}

/**
 * FETCH THE WHOLE PAGE AHEAD, NOT JUST ITS FRAME. With no loading boundary
 * under /app an ordinary prefetch of a dynamic page brings back almost
 * nothing, so the click still waits for the server. A full prefetch brings
 * the page itself, and the router keeps it for staleTimes (five minutes,
 * next.config.mjs), so the click that follows lands on the next frame. Used
 * for the sidebar and pill rows, on hover, focus and the pill's mount.
 */
export function prefetchAppPage(router: { prefetch: (href: string, options?: never) => void }, href: string) {
  try {
    router.prefetch(href, { kind: "full" } as never)
  } catch {
    /* a prefetch that fails is a click that waits, nothing worse */
  }
  /* Analytics' page is quick; its numbers are what take the time. They are
     fetched ahead too, and kept for the page (lib/analytics/report-cache). */
  if (href === "/app/analytics" || href.startsWith("/app/analytics?")) {
    import("@/lib/analytics/report-cache").then((m) => m.warmAnalytics()).catch(() => {})
  }
  /* The Website page's data comes with the full prefetch above; its covers
     are pictures, fetched and decoded ahead from the last ones this tab
     showed (lib/website-builder/cover-memory), so the page lands with them. */
  if (href === "/app/website-builder") {
    import("@/lib/website-builder/cover-memory").then((m) => m.warmCovers()).catch(() => {})
  }
  if (href === "/app/payouts") {
    import("@/lib/payments/overview-cache").then((m) => m.warmOverview()).catch(() => {})
  }
}

/* ── Where the reader was, per address ─────────────────────────────────── */

/**
 * BACK PUTS YOU WHERE YOU WERE. /app scrolls in `.app-content-scroll`, and on
 * most pages in a container of the page's own inside it, so the browser's own
 * scroll restoration never sees either. The stage records both as they move
 * and puts them back on a back or forward navigation. A new visit starts at
 * the top.
 */
const scrolls = new Map<string, { outer: number; inner: number }>()
let traversing = false
let landed = 0

export function rememberScroll(key: string, outer: number, inner: number) {
  scrolls.set(key, { outer, inner })
  /* A long session does not keep every address it ever saw. */
  if (scrolls.size > 60) scrolls.delete(scrolls.keys().next().value as string)
}
export function recalledScroll(key: string) {
  return scrolls.get(key) ?? null
}

/** Called from `popstate`: the next commit is a back or forward, not a new visit. */
export function markTraversal() {
  traversing = true
}
/**
 * Is the commit on its way a back or forward? Read without taking it, by a
 * page deciding its first state while it renders, before the stage takes it
 * at the commit (the Products list: products-client, list-return).
 */
export function isTraversing() {
  return traversing
}
/** Read once per commit: was it a back or forward? */
export function takeTraversal() {
  const t = traversing
  traversing = false
  return t
}

/**
 * ===========================================================================
 *  A PAGE THAT COMES BACK AS IT WAS, WITH NO LANDING
 * ===========================================================================
 * "When I click on an email to go to its sub page and then I go back, there
 * is an animation bump throughout the whole page, coming up and down."
 * Going back from an automation or a draft to the Emails list was a new
 * page to the stage, so it played its landing (components/app/app-stage.tsx
 * playEntrance): every box of the list faded in from nothing and rose 2px,
 * the whole page, on every Back. The way in keeps its landing; the way back
 * is the list you left, so it should simply be there.
 *
 * A page that knows it is being returned to (it read isTraversing, or its
 * own note of a return, while it rendered its first state) calls this from
 * its first layout effect, which runs in the commit that draws it, before
 * the frame the stage would start the landing on. The stage reads it on that
 * frame and lands nothing. It lets go two frames later on its own, so a hold
 * the stage never read (a page that arrived in a later commit than the
 * address) cannot swallow the next page's landing.
 *
 * Per page, not for every Back in /app: a page opts in when what it draws on
 * a return is exactly what was there (the Emails list keeps its tab, its
 * rows and its scroll). Other pages keep their landing until they do.
 */
let landingHeld = false
let holds = 0

export function holdLanding() {
  if (typeof window === "undefined") return
  landingHeld = true
  const mine = ++holds
  const release = () => { if (holds === mine) landingHeld = false }
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(release))
  /* A tab in the background runs no frames: let go anyway. */
  window.setTimeout(release, 500)
}

/** Read by the stage on the frame it would start a landing: is the page coming back as it was? */
export function isLandingHeld() {
  return landingHeld
}

/** One more page landed on in this tab without a reload. */
export function markLanded() {
  landed++
}
/**
 * Whether there is an /app page behind this one to go back to. A page opened
 * from a bookmark, an email or a Stripe return has none, and its Back has to
 * be a link instead of `router.back()`, which would leave the app.
 */
export function hasInAppHistory() {
  return landed > 0
}
