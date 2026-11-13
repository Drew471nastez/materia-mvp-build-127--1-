"use client"

/**
 * ===========================================================================
 *  ROUND AU: OFFLINE, THE APP STAYS THE APP
 * ===========================================================================
 * The phone app is one web view with no address bar and no back button of
 * its own. When a tap needs the server and the phone is offline, the Next
 * router cannot fetch the page and falls back to loading it as a document;
 * that load fails, and Android's web view draws its own "Webpage not
 * available" page in place of the app. Nothing on it leads back: the person
 * has to kill the app (scripts/check-app-network-au1.mjs, "offline tap" and
 * "offline at the hand over": chrome-error, before this).
 *
 * In the app, while the phone says it is offline, a document load is not
 * started (the Navigation API's navigate event, in Android's web view and
 * iOS 26's). The page that was on screen stays, and says why the tap did
 * nothing. A same document move (the router's own pushState), a hash, a
 * download, and every load while the phone is online are left alone.
 *
 * Where the Navigation API is not there (iOS before 26) nothing changes, and
 * nothing needs to: WKWebView keeps the page on screen when a load fails.
 */

import { tt } from "@/lib/i18n/text"

/** Said on window when a load was held back; a screen that shows its own offline state takes it (preventDefault) and no note is drawn. */
export const OFFLINE_BLOCKED_EVENT = "storelib:offline-blocked"

export function deviceOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

type NavigateEventLike = {
  cancelable?: boolean
  hashChange?: boolean
  downloadRequest?: string | null
  destination?: { sameDocument?: boolean; url?: string }
  preventDefault: () => void
}

/** Whether a navigate event is a document load that would fail now. */
export function holdsBackLoad(e: NavigateEventLike, offline: boolean): boolean {
  if (!offline || !e.cancelable) return false
  if (e.hashChange || e.downloadRequest) return false
  if (e.destination?.sameDocument) return false
  return true
}

const NOTE_ID = "storelib-offline-note"
const NOTE_MS = 3000

function showNote(): void {
  try {
    let el = document.getElementById(NOTE_ID)
    if (!el) {
      el = document.createElement("div")
      el.id = NOTE_ID
      el.setAttribute("role", "status")
      Object.assign(el.style, {
        position: "fixed",
        left: "50%",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        transform: "translateX(-50%)",
        zIndex: "2147483000",
        maxWidth: "calc(100vw - 32px)",
        padding: "10px 16px",
        borderRadius: "12px",
        background: "#1a1a2e",
        color: "#ffffff",
        font: "500 14px/1.35 Inter, system-ui, sans-serif",
        textAlign: "center",
        pointerEvents: "none",
      })
      document.body.appendChild(el)
    }
    el.textContent = tt("No internet connection")
    const shown = el
    window.clearTimeout(Number(shown.dataset.timer || 0))
    shown.dataset.timer = String(window.setTimeout(() => shown.remove(), NOTE_MS))
  } catch {
    /* no body to draw on: the page simply stays */
  }
}

let guarding = false

/** In the app only, once per document. Returns the stop. */
export function armOfflineNavigationGuard(): () => void {
  if (typeof window === "undefined" || guarding) return () => {}
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (!cap?.isNativePlatform?.()) return () => {}
  const nav = (window as unknown as { navigation?: EventTarget }).navigation
  if (!nav?.addEventListener) return () => {}
  guarding = true
  const onNavigate = (event: Event) => {
    const e = event as unknown as NavigateEventLike
    if (!holdsBackLoad(e, deviceOffline())) return
    e.preventDefault()
    const told = new CustomEvent(OFFLINE_BLOCKED_EVENT, { cancelable: true })
    if (window.dispatchEvent(told)) showNote()
  }
  nav.addEventListener("navigate", onNavigate)
  return () => {
    guarding = false
    nav.removeEventListener("navigate", onNavigate)
  }
}
