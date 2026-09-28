"use client"

/**
 * ===========================================================================
 *  THE SEARCH SCREEN, OVER THE PAGE YOU ARE ON
 * ===========================================================================
 * Mounted by the phone's tab bar (components/nav/buyer-tab-bar.tsx), whose
 * Search opens it. The screen itself is components/search/search-screen;
 * this is only how it comes and goes.
 *
 * THE KEYBOARD COMES UP WITH THE PRESS. A phone raises its keyboard only for
 * a focus given while a touch is being handled, so the screen is in the
 * document from the start, hidden and inert, and the press that opens it
 * does two things before it returns: it commits the open screen
 * synchronously (flushSync), which makes the field focusable, and it gives
 * the field the focus. Nothing waits for a frame or a route, so the
 * keyboard and the screen arrive together.
 *
 * IN AND OUT ON THE COMPOSITOR. Opacity and the `translate` property only,
 * 280ms in on the tab bar's own curve and 200ms out, on a layer that covers
 * the header, the page and the tab bar. `visibility` flips at the start of
 * the way in and the end of the way out, so a closed screen is out of the
 * hit test and the tab order and never paints. Under reduced motion it
 * fades, briefly, and does not move.
 *
 * BACK CLOSES IT. Opening adds one history entry at the same address (the
 * router's own state copied into it, with a mark of ours, so the router
 * lets it through and does nothing: see the note in components/onepage/
 * onepage-editor.tsx on why the state matters). Android's back, the
 * browser's back and a swipe back all pop that entry, which closes the
 * screen. The X and Escape pop it themselves. A result REPLACES it with
 * the page it leads to, so Back from that page is the page Search was
 * opened on, not an empty step.
 *
 * AND THE PAGE UNDER IT HOLDS STILL: the document's overflow is held while
 * it is open (a declared modal, `aria-modal`, which components/platform/
 * stuck-layer-guard respects), and the screen's own list scrolls inside it.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"

import { SearchScreen, type SearchScreenHandle } from "@/components/search/search-screen"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { extractUsernameFromHost, getCanonicalSiteUrl, isCustomDomain } from "@/lib/url-helpers"

/** The mark on the history entry the open screen owns. */
export const SEARCH_ENTRY = "storelibSearch"
/** In and out: the tab bar's curve in, a plain ease out, both on the compositor. */
export const OPEN_MS = 280
export const CLOSE_MS = 200
const EASE_IN = "cubic-bezier(0.32, 0.72, 0, 1)"
const EASE_OUT = "cubic-bezier(0.4, 0, 1, 1)"
/** How far it rises as it arrives. Small, so the field is on screen at the moment it takes the focus. */
const RISE = "0 14px"

type Opener = (q?: string) => boolean
let opener: Opener | null = null

/**
 * Opens the screen, from inside the press that asked for it. Returns false
 * when there is no screen to open (a wide window, or not mounted), and the
 * caller goes to /explore/search instead.
 */
export function openSearchOverlay(q?: string): boolean {
  return opener ? opener(q) : false
}

/** Whether the field has the focus, so the touch's end can give it again if the press did not count. */
export function refocusSearchOverlay() {
  const el = document.querySelector<HTMLInputElement>("[data-search-overlay='open'] [data-search-screen-field]")
  if (el && document.activeElement !== el) el.focus({ preventScroll: true })
}

/** The address as the router has it, which Next hands out only under a Suspense. */
function AddressWatch({ onChange }: { onChange: (address: string) => void }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const address = `${pathname}?${params?.toString() ?? ""}`
  useEffect(() => onChange(address), [address, onChange])
  return null
}

export function SearchOverlay() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  /** Mounted on the client only: the portal needs a body, and the server draws no closed screen. */
  const [ready, setReady] = useState(false)
  /** A result was chosen: the screen stays until the page it leads to is up, then goes. */
  const [leavingFor, setLeavingFor] = useState<string | null>(null)
  const screen = useRef<SearchScreenHandle>(null)
  const address = useRef<string>("")
  const leaveTimer = useRef<number | null>(null)

  useEffect(() => setReady(true), [])

  const lockDocument = (on: boolean) => {
    const els = [document.documentElement, document.body]
    for (const el of els) {
      if (on) el.style.setProperty("overflow", "hidden")
      else el.style.removeProperty("overflow")
    }
  }

  const ownsEntry = () => {
    try {
      return !!(window.history.state && window.history.state[SEARCH_ENTRY])
    } catch {
      return false
    }
  }

  /* ── OPEN ── synchronous, so it can be called from inside the press. */
  const openNow = useCallback<Opener>((q = "") => {
    if (!window.matchMedia?.("(max-width: 767px)").matches) return false
    if (!screen.current) return false
    screen.current.reset(q)
    flushSync(() => {
      setLeavingFor(null)
      setOpen(true)
    })
    screen.current.field?.focus({ preventScroll: true })
    lockDocument(true)
    if (!ownsEntry()) {
      try {
        window.history.pushState({ ...(window.history.state || {}), [SEARCH_ENTRY]: 1 }, "")
      } catch {
        /* no history (a sandboxed frame): Back simply leaves the page */
      }
    }
    return true
  }, [])

  useEffect(() => {
    opener = openNow
    return () => {
      if (opener === openNow) opener = null
    }
  }, [openNow])

  /* ── CLOSE ── the screen's own way out goes through Back, so the entry goes with it. */
  const shut = useCallback(() => {
    screen.current?.field?.blur()
    setOpen(false)
    setLeavingFor(null)
    lockDocument(false)
  }, [])

  const close = useCallback(() => {
    if (ownsEntry()) window.history.back()
    else shut()
  }, [shut])

  /* Back, from anywhere: the entry is gone, so is the screen. */
  useEffect(() => {
    const onPop = () => {
      if (!ownsEntry()) shut()
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [shut])

  /* ── A RESULT ── */
  const navigate = useCallback(
    (href: string) => {
      const host = window.location.host
      /* A creator's subdomain or domain has no Explore: the answer is on storelib.com. */
      if (extractUsernameFromHost(host) || isCustomDomain(host)) {
        window.location.assign(new URL(href, getCanonicalSiteUrl()).toString())
        return
      }
      const here = window.location.pathname + window.location.search
      if (href === here) {
        close()
        return
      }
      startNavigationLoading(href)
      setLeavingFor(address.current)
      /* The screen's own entry becomes the page, so Back from it is where Search was opened. */
      if (ownsEntry()) router.replace(href)
      else router.push(href)
      /* Whatever happens to the navigation, the screen does not outstay it. */
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
      leaveTimer.current = window.setTimeout(shut, 4000)
    },
    [close, router, shut],
  )

  /* The page it led to is up: now it goes, revealing that page rather than the old one. */
  const onAddress = useCallback(
    (next: string) => {
      const was = address.current
      address.current = next
      if (leavingFor !== null && next !== leavingFor && was !== next) {
        if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
        shut()
      }
    },
    [leavingFor, shut],
  )

  useEffect(() => () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    lockDocument(false)
  }, [])

  /* Escape anywhere on the open screen, and Tab kept inside it. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    /* The field's own Escape clears the words first; only an Escape nobody took closes. */
    if (e.defaultPrevented) return
    if (e.key === "Escape") {
      e.preventDefault()
      close()
      return
    }
    if (e.key !== "Tab") return
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>("input, button, [href], [tabindex]:not([tabindex='-1'])")].filter(
      (el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0 && el.tabIndex >= 0,
    )
    if (all.length === 0) return
    const first = all[0]
    const last = all[all.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const ms = open ? OPEN_MS : CLOSE_MS
  const ease = open ? EASE_IN : EASE_OUT

  if (!ready) return null
  return createPortal(
    <>
      <Suspense fallback={null}>
        <AddressWatch onChange={onAddress} />
      </Suspense>
      <div
        data-search-overlay={open ? "open" : "closed"}
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-label="Search"
        aria-hidden={open ? undefined : true}
        inert={open ? undefined : true}
        onKeyDown={onKeyDown}
        className="fixed inset-0 z-[70] bg-white md:hidden"
        style={{
          opacity: open ? 1 : 0,
          translate: open || reduce ? "0 0" : RISE,
          visibility: open ? "visible" : "hidden",
          pointerEvents: open ? "auto" : "none",
          /* visibility: at once on the way in, at the end on the way out. */
          transition: reduce
            ? `opacity ${open ? 140 : 120}ms linear, visibility 0s linear ${open ? 0 : 120}ms`
            : `opacity ${ms}ms ${ease}, translate ${ms}ms ${ease}, visibility 0s linear ${open ? 0 : ms}ms`,
          willChange: open ? "opacity, translate" : undefined,
          /* The shell's pull to refresh and the page's bounce stay under it. */
          overscrollBehavior: "contain",
        }}
      >
        <SearchScreen ref={screen} onClose={close} onNavigate={navigate} />
      </div>
    </>,
    document.body,
  )
}
