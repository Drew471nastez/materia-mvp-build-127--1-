/**
 * ===========================================================================
 *  THE PAGE'S HALF OF THE PIPELINE
 * ===========================================================================
 * What components/analytics/track-view.tsx does in the browser, apart from
 * React, so tests can drive it with a fake window and the probe
 * (scripts/check-analytics-collection.mjs) can watch it in Chromium.
 *
 * WHEN A VIEW IS SENT. Once per real page: on a full load, and again on every
 * route change inside the page (a Next <Link>, router.push, back and
 * forward), because the tracker is keyed by the address, not by being
 * mounted. It waits for the page to finish loading and then for the browser
 * to be idle (two seconds at most), so it never competes with the page's own
 * pictures and scripts; a page shown by prerender waits until it is actually
 * shown; a page left before then sends its view as it goes, by beacon, since
 * it was seen.
 *
 * WHEN IT IS NOT. A browser driven by a script (navigator.webdriver), a page
 * inside a frame (the builder's canvas and the creator page workspace frame
 * the real pages), a preview address, and a path this tab already sent in
 * the last 30 minutes: a refresh, or back to a page just seen. The server
 * checks all of it again (lib/analytics/collect); this only saves the
 * request.
 *
 * NOTHING HERE CAN BREAK A PAGE. Every call is wrapped, every request has a
 * five second limit, and every failure is dropped.
 */
import { OWN_HASH_PARAM, PAGE_VIEW_REPEAT_MS, normalizePath } from "./events"

/** How long the idle callback may wait before it runs anyway. */
export const IDLE_DEADLINE_MS = 2000
/** No tracking request waits longer than this. */
export const SEND_TIMEOUT_MS = 5000
/** A page whose load never finishes (a picture that hangs) is counted after this long anyway. */
export const LOAD_WAIT_MS = 10_000

const SENT_PREFIX = "sl_pv:"

type Win = Window & typeof globalThis

/** The key a sent view is remembered under: this creator, this host, this path. */
export function pageKeyOf(creatorId: string, href: string): string | null {
  try {
    const url = new URL(href)
    return `${creatorId}|${url.host.toLowerCase()}${normalizePath(url.pathname) ?? "/"}`
  } catch {
    return null
  }
}

/** Views sent from this tab, when sessionStorage is not there to hold them. */
const sentHere = new Map<string, number>()

function storage(win: Win | undefined): Storage | null {
  try {
    return win?.sessionStorage ?? null
  } catch {
    return null
  }
}

/** Was this page's view sent from this tab less than 30 minutes ago? */
export function recentlySent(key: string, now: number, win?: Win): boolean {
  let at = sentHere.get(key) ?? 0
  try {
    const stored = Number(storage(win)?.getItem(SENT_PREFIX + key))
    if (stored > at) at = stored
  } catch {
    /* no storage: memory only */
  }
  return at > 0 && now - at < PAGE_VIEW_REPEAT_MS
}

export function markSent(key: string, now: number, win?: Win): void {
  sentHere.set(key, now)
  try {
    storage(win)?.setItem(SENT_PREFIX + key, String(now))
  } catch {
    /* no storage: memory only */
  }
}

/** For tests: forget what this module sent. */
export function forgetSent(): void {
  sentHere.clear()
}

const OWN_KEY = "sl_own_t"
const OWN_IN_HASH = new RegExp(`(^#|&)${OWN_HASH_PARAM}=([^&]*)`)
/** The hand-off when there is no sessionStorage to keep it in. */
let ownHere: string | null = null

/**
 * THE APP'S HAND-OFF, TAKEN OFF THE ADDRESS. The app opens the creator's own
 * site with #sl_own=<token> (lib/analytics/own-site ownOpen). It is taken out
 * of the address at once, so the creator never copies or shares it, and kept
 * for this tab until a view has carried it to the server, which marks this
 * browser as theirs on this host (lib/analytics/collect). The token, or null.
 */
export function takeOwnHandoff(win: Win): string | null {
  try {
    const hash = win.location.hash || ""
    const m = OWN_IN_HASH.exec(hash)
    if (m) {
      const token = decodeURIComponent(m[2] || "")
      if (token && token.length <= 4096) {
        ownHere = token
        try {
          storage(win)?.setItem(OWN_KEY, token)
        } catch {
          /* memory only */
        }
      }
      const rest = hash.replace(OWN_IN_HASH, (_all, lead: string) => (lead === "#" ? "#" : "")).replace(/^#&/, "#")
      const url = `${win.location.pathname}${win.location.search}${rest === "#" ? "" : rest}`
      win.history.replaceState(win.history.state, "", url)
    }
  } catch {
    /* the hand-off is a convenience */
  }
  try {
    return storage(win)?.getItem(OWN_KEY) || ownHere
  } catch {
    return ownHere
  }
}

/** Why this page is not a visit, or null when it is one. */
export function skipReason(win: Win): "automated" | "framed" | "preview" | null {
  try {
    if ((win.navigator as Navigator & { webdriver?: boolean }).webdriver === true) return "automated"
    if (win.self !== win.top) return "framed"
    const url = new URL(win.location.href)
    for (const key of ["preview", "embedded", "draft", "_preview", "sl_preview"]) if (url.searchParams.has(key)) return "preview"
    if (/^\/(w\/[^/]+\/)?preview(\/|$)/.test(url.pathname)) return "preview"
    return null
  } catch {
    return "framed"
  }
}

/**
 * Run when the browser is idle, with a deadline, or after a short timer
 * where there is no idle callback (Safari). Returns a cancel.
 */
export function whenIdle(win: Win, run: () => void): () => void {
  const w = win as Win & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(run, { timeout: IDLE_DEADLINE_MS })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = win.setTimeout(run, 400)
  return () => win.clearTimeout(id)
}

/**
 * Run once the page is actually in front of somebody: after a prerendered
 * page is activated, and after a tab opened in the background is first
 * looked at. Returns a cancel.
 */
export function whenShown(win: Win, run: () => void): () => void {
  const doc = win.document as Document & { prerendering?: boolean }
  const ready = () => !doc.prerendering && doc.visibilityState !== "hidden"
  if (ready()) {
    run()
    return () => {}
  }
  let done = false
  const check = () => {
    if (done || !ready()) return
    done = true
    stop()
    run()
  }
  const stop = () => {
    doc.removeEventListener("prerenderingchange", check)
    doc.removeEventListener("visibilitychange", check)
  }
  doc.addEventListener("prerenderingchange", check)
  doc.addEventListener("visibilitychange", check)
  return () => {
    done = true
    stop()
  }
}

/**
 * Run once the page has finished loading (every picture, script and font of
 * the first load), or after LOAD_WAIT_MS if it never does. A route change
 * inside the page finds it loaded already and runs at once. Returns a cancel.
 *
 * WHY. The idle callback alone is about the main thread, not the network: in
 * Chromium it ran two milliseconds after the document was parsed, while the
 * page's hero picture was still downloading (scripts/check-analytics-collection).
 * Waiting for load as well keeps the view out of the pictures' way.
 */
export function whenLoaded(win: Win, run: () => void): () => void {
  if (win.document.readyState === "complete") {
    run()
    return () => {}
  }
  let done = false
  const go = () => {
    if (done) return
    done = true
    win.removeEventListener("load", go)
    win.clearTimeout(timer)
    run()
  }
  const timer = win.setTimeout(go, LOAD_WAIT_MS)
  win.addEventListener("load", go)
  return () => {
    done = true
    win.removeEventListener("load", go)
    win.clearTimeout(timer)
  }
}

/**
 * POST a small JSON body to the page's own origin, and never throw. A beacon
 * when asked (the page may be going away) and the browser has one, else a
 * keepalive fetch with a time limit. True when it was answered 2xx, or
 * handed to the browser's beacon queue.
 */
export async function send(win: Win, path: string, body: unknown, opts: { beacon?: boolean } = {}): Promise<boolean> {
  let text: string
  try {
    text = JSON.stringify(body)
  } catch {
    return false
  }
  try {
    if (opts.beacon && typeof win.navigator.sendBeacon === "function") {
      /* text/plain: a beacon needs no preflight, and the server reads the text as JSON either way. */
      if (win.navigator.sendBeacon(path, new Blob([text], { type: "text/plain;charset=UTF-8" }))) return true
    }
  } catch {
    /* fall through to fetch */
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null
  const timer = controller ? win.setTimeout(() => controller.abort(), SEND_TIMEOUT_MS) : 0
  try {
    const res = await win.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text,
      keepalive: true,
      credentials: "same-origin",
      signal: controller?.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    if (timer) win.clearTimeout(timer)
  }
}

/**
 * ONE PAGE'S VIEW, SCHEDULED. Waits until the page is shown, has loaded and
 * the browser is idle, then sends `payload()` for the address the page is at
 * then. Returns a cancel for when the page changes or goes away: a view of a
 * page that was shown and is still waiting then is sent at once, by beacon,
 * because the page was seen.
 */
export function schedulePageView(win: Win, input: { creatorId: string; payload: () => Record<string, unknown> }): () => void {
  const href = win.location.href
  const key = pageKeyOf(input.creatorId, href)
  if (!key || skipReason(win) || recentlySent(key, Date.now(), win)) return () => {}

  /* waiting: not shown yet. shown: in front of somebody, waiting for load and idle. */
  let state: "waiting" | "shown" | "sent" | "cancelled" = "waiting"
  let cancelLoaded = () => {}
  let cancelIdle = () => {}
  const fire = (beacon: boolean) => {
    if (state === "sent" || state === "cancelled") return
    state = "sent"
    if (recentlySent(key, Date.now(), win)) return
    markSent(key, Date.now(), win)
    let body: Record<string, unknown>
    try {
      body = { ...input.payload(), href }
    } catch {
      return
    }
    void send(win, "/api/track-view", body, { beacon })
  }
  const cancelShown = whenShown(win, () => {
    state = "shown"
    cancelLoaded = whenLoaded(win, () => {
      cancelIdle = whenIdle(win, () => fire(false))
    })
  })
  /* Leaving, or hidden, while shown and waiting: the view goes now, by beacon. */
  const onPageHide = () => {
    if (state === "shown") fire(true)
  }
  const onVisibility = () => {
    if (win.document.visibilityState === "hidden" && state === "shown") fire(true)
  }
  win.addEventListener("pagehide", onPageHide)
  win.document.addEventListener("visibilitychange", onVisibility)
  return () => {
    win.removeEventListener("pagehide", onPageHide)
    win.document.removeEventListener("visibilitychange", onVisibility)
    cancelShown()
    cancelLoaded()
    cancelIdle()
    /* Shown and waiting when the route changed: it was a real view. */
    if (state === "shown") fire(true)
    if (state === "waiting") state = "cancelled"
  }
}

/**
 * LINKS OUT. A click on a link to another site (the creator's Instagram, a
 * YouTube video) is a link_click. Links inside Storelib and to the same
 * host are navigation, which the next page's view already records; mailto:
 * and tel: are recorded without the address or the number. Once per link
 * per page load here; the server keeps one per visit.
 */
export function watchOutboundLinks(win: Win, input: { creatorId: string; mainDomain: string; ids: () => { sessionId?: string; visitorId?: string } }): () => void {
  if (skipReason(win)) return () => {}
  const clicked = new Set<string>()
  const main = input.mainDomain.toLowerCase().replace(/^www\./, "")
  const onClick = (event: MouseEvent) => {
    try {
      if (event.button > 1) return
      const anchor = event.composedPath().find((n): n is HTMLAnchorElement => typeof (n as HTMLAnchorElement).href === "string" && (n as Element).tagName === "A")
      const raw = anchor?.getAttribute("href")
      if (!anchor || !raw) return
      let target: URL
      try {
        target = new URL(anchor.href, win.location.href)
      } catch {
        return
      }
      const scheme = target.protocol.replace(":", "")
      const outbound =
        scheme === "mailto" || scheme === "tel" ||
        ((scheme === "http" || scheme === "https") &&
          target.host !== win.location.host &&
          !(target.hostname === main || target.hostname.endsWith(`.${main}`)))
      if (!outbound) return
      const linkUrl = scheme === "http" || scheme === "https" ? `${target.protocol}//${target.host}${target.pathname}` : `${scheme}:`
      if (clicked.has(linkUrl)) return
      clicked.add(linkUrl)
      void send(win, "/api/track-event", { eventType: "link_click", creatorId: input.creatorId, href: win.location.href, linkUrl, ...input.ids() }, { beacon: true })
    } catch {
      /* never in the way of the click */
    }
  }
  win.document.addEventListener("click", onClick, true)
  win.document.addEventListener("auxclick", onClick, true)
  return () => {
    win.document.removeEventListener("click", onClick, true)
    win.document.removeEventListener("auxclick", onClick, true)
  }
}

/** The most a button's words are read from the page before the server trims them (lib/analytics/events normalizeLinkLabel). */
const LABEL_READ_MAX = 200

/**
 * A LINK'S WORDS, as a visitor reads them: its aria-label, else its text,
 * else the alt of the picture inside it, else its title. Whitespace made one
 * space. The server decides what of it is kept.
 */
export function linkWords(anchor: Element): string | null {
  const pick = (v: string | null | undefined) => (v || "").replace(/\s+/g, " ").trim()
  const words =
    pick(anchor.getAttribute("aria-label")) ||
    pick((anchor as HTMLElement).innerText ?? anchor.textContent) ||
    pick(anchor.querySelector?.("img[alt]")?.getAttribute("alt")) ||
    pick(anchor.getAttribute("title"))
  return words ? words.slice(0, LABEL_READ_MAX) : null
}

/**
 * Where an internal link leads, or null when it is not one: an http(s)
 * address on this very host, another path than the page's own (a link to
 * #reviews on the same page is not a move), and not a download or one of the
 * site's own endpoints (/api/, the cart's add). Query and hash are left off.
 */
export function internalTargetOf(win: Win, anchor: HTMLAnchorElement): string | null {
  const raw = anchor.getAttribute("href")
  if (!raw || anchor.hasAttribute("download")) return null
  let target: URL
  let here: URL
  try {
    here = new URL(win.location.href)
    target = new URL(anchor.href || raw, here)
  } catch {
    return null
  }
  if ((target.protocol !== "http:" && target.protocol !== "https:") || target.host !== here.host) return null
  const to = normalizePath(target.pathname) ?? "/"
  if (to === (normalizePath(here.pathname) ?? "/")) return null
  if (/^\/api(\/|$)/.test(to) || /\/cart\/add(\/|$)/.test(to)) return null
  return `${target.protocol}//${target.host}${target.pathname}`
}

/**
 * CLICKS BETWEEN PAGES OF THE SAME SITE (nav_click). A link or a button that
 * leads to another page of this site (Shop now, a product card, the menu's
 * About) is recorded with the page it leads to and its words, so Analytics
 * can say which buttons move people and from where to where. Once per page,
 * target and words here; the server keeps one per visit, checks that both
 * pages are the same property's, leaves robots and the creator out, and
 * keeps the visit's ids only with consent, as for every other event.
 */
export function watchInternalLinks(win: Win, input: { creatorId: string; ids: () => { sessionId?: string; visitorId?: string } }): () => void {
  if (skipReason(win)) return () => {}
  const clicked = new Set<string>()
  const onClick = (event: MouseEvent) => {
    try {
      if (event.button > 1) return
      const anchor = event.composedPath().find((n): n is HTMLAnchorElement => typeof (n as HTMLAnchorElement).href === "string" && (n as Element).tagName === "A")
      if (!anchor) return
      const targetHref = internalTargetOf(win, anchor)
      if (!targetHref) return
      const label = linkWords(anchor)
      const key = `${normalizePath(new URL(win.location.href).pathname)}|${targetHref}|${label ?? ""}`
      if (clicked.has(key)) return
      clicked.add(key)
      void send(win, "/api/track-event", { eventType: "nav_click", creatorId: input.creatorId, href: win.location.href, targetHref, label: label ?? undefined, ...input.ids() }, { beacon: true })
    } catch {
      /* never in the way of the click */
    }
  }
  win.document.addEventListener("click", onClick, true)
  win.document.addEventListener("auxclick", onClick, true)
  return () => {
    win.document.removeEventListener("click", onClick, true)
    win.document.removeEventListener("auxclick", onClick, true)
  }
}
