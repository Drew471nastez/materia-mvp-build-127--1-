"use client"

/**
 * ===========================================================================
 *  ONE COUNT FOR A VISIT FROM AN AI ASSISTANT, FROM THE PAGE IT LANDED ON
 * ===========================================================================
 * lib/attribution/ai-visits.ts says what is counted and why. This is the
 * page's half: called by components/attribution/capture-platform-touch.tsx
 * with the touch notePlatformVisit just recorded on storelib.com.
 *
 *   ONLY WITH A YES TO ANALYTICS. The same consent the touch is kept with
 *   (lib/consent/client hasConsent). Without it nothing is sent; a yes given
 *   later on the same page sends it then, as keepOnConsent keeps the touch
 *   then.
 *   ONCE PER TAB SESSION for each assistant and landing path: the keys sent
 *   are kept in sessionStorage (`materia_attr_aiv`, written only with
 *   consent) and in this document's memory, so a reload or a client
 *   navigation back to the page is not another visit.
 *   NOTHING ABOUT THE VISITOR. The body is { source, path } and nothing else;
 *   fetch with credentials "omit", so no cookie goes with it.
 */
import { hasConsent, onConsentChange } from "@/lib/consent/client"
import { getMainDomain } from "@/lib/url-helpers"
import type { AiSourceKey } from "./ai-sources"
import { AI_VISIT_ROUTE, aiVisitKey, aiVisitPath, countedHost } from "./ai-visits"

export const AI_VISIT_SESSION_KEY = "materia_attr_aiv"

/** Keys this document has sent, whatever sessionStorage allows. */
const sentHere = new Set<string>()

function sessionSent(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(AI_VISIT_SESSION_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string").slice(-50) : [])
  } catch {
    return new Set()
  }
}

function markSent(key: string) {
  sentHere.add(key)
  try {
    const kept = sessionSent()
    kept.add(key)
    window.sessionStorage.setItem(AI_VISIT_SESSION_KEY, JSON.stringify([...kept].slice(-50)))
  } catch {
    /* storage blocked: this document still remembers */
  }
}

/** Whether a beacon may leave this page at all: not in a frame, a preview or /admin, only on storelib.com. */
export function aiVisitAllowedHere(): boolean {
  try {
    if (window.self !== window.top) return false
    const path = window.location.pathname
    if (path.startsWith("/preview/") || path === "/admin" || path.startsWith("/admin/")) return false
    if (new URLSearchParams(window.location.search).has("preview")) return false
    return countedHost(window.location.hostname, getMainDomain(), process.env.NODE_ENV === "production")
  } catch {
    return false
  }
}

function send(source: AiSourceKey, path: string): boolean {
  const key = aiVisitKey(source, path)
  if (sentHere.has(key) || sessionSent().has(key)) return false
  if (!hasConsent("analytics")) return false
  markSent(key)
  try {
    void fetch(AI_VISIT_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ source, path }),
      credentials: "omit",
      keepalive: true,
      cache: "no-store",
    }).catch(() => {})
  } catch {
    /* counting never breaks a page */
  }
  return true
}

/**
 * The arrival's assistant and landing path, counted once. Returns a cleanup
 * for the consent listener when the count waits for a yes.
 */
export function noteAiVisit(source: AiSourceKey | null | undefined, landingPath: string | null | undefined): () => void {
  if (typeof window === "undefined" || !source) return () => {}
  const path = aiVisitPath(landingPath ?? "", { strict: true })
  if (!path || !aiVisitAllowedHere()) return () => {}
  if (hasConsent("analytics")) {
    send(source, path)
    return () => {}
  }
  let stop: (() => void) | null = null
  stop = onConsentChange((c) => {
    if (!c?.analytics) return
    send(source, path)
    stop?.()
    stop = null
  })
  return () => {
    stop?.()
    stop = null
  }
}

/** For tests and probes. */
export function resetAiVisitMemory() {
  sentHere.clear()
}
