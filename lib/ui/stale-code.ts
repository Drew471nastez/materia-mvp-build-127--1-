/**
 * ===========================================================================
 *  A TAB FROM BEFORE A DEPLOY, OUTSIDE ANY ERROR BOUNDARY
 * ===========================================================================
 * An error boundary that catches a stale chunk reloads the page once
 * (components/platform/error-screen, lib/client-errors). A chunk can also
 * fail where no boundary sees it: a lazy import in a press or an effect,
 * which ends as an unhandled rejection while the page is still on screen and
 * still working. That page may hold something the person typed, so it is
 * not reloaded from under them without a look:
 *
 *   /checkout, a page holding unsaved work (lib/ui/leave-guard), or any
 *   text field or editor with something in it: a calm bar, "Storelib was
 *   updated. Reload to continue.", and the reload is theirs to press. A
 *   buyer's card number, company and tip are not kept across a reload.
 *
 *   anything else: loaded again, once, at the same address (the same
 *   one-shot as the boundaries, so it cannot loop), and if that already
 *   happened a moment ago, the bar.
 *
 * Installed once by instrumentation-client.ts. `staleAction` is the whole
 * decision and takes everything it reads as arguments, so
 * tests/client-errors.test.ts drives it.
 */
import { buildReport, isStaleCodeError, shouldReloadForStaleCode, type ReloadStore } from "@/lib/client-errors"
import { leaveGuard } from "@/lib/ui/leave-guard"

export type StaleAction = "reload" | "bar" | "none"

export function staleAction(input: {
  error: unknown
  path: string
  /** Something typed on the page that a reload would lose. */
  holdsWork: boolean
  store: ReloadStore | null
  now?: number
}): StaleAction {
  if (!isStaleCodeError(input.error, input.path)) return "none"
  if (input.holdsWork || /^\/checkout(\/|$)/.test(input.path)) return "bar"
  return shouldReloadForStaleCode(input.error, input.store, input.path, input.now) ? "reload" : "bar"
}

/** Unsaved work the page declared, or a field or editor with words in it. */
function pageHoldsWork(): boolean {
  if (leaveGuard()) return true
  for (const el of Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))) {
    if (el instanceof HTMLInputElement && !/^(|text|email|tel|url|number|password|search)$/.test(el.type)) continue
    if (el.value.trim()) return true
  }
  return Array.from(document.querySelectorAll<HTMLElement>("[contenteditable='true'], [contenteditable='']")).some((el) => !!el.textContent?.trim())
}

function sessionStore(): ReloadStore | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const BAR_ID = "storelib-updated-bar"

/** The bar: one line and a button, over everything, out of React's tree. */
function showBar() {
  if (document.getElementById(BAR_ID)) return
  const bar = document.createElement("div")
  bar.id = BAR_ID
  bar.setAttribute("role", "status")
  bar.style.cssText =
    "position:fixed;left:0;right:0;margin:0 auto;width:max-content;top:calc(env(safe-area-inset-top) + 12px);z-index:2147483000;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:8px 8px 8px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(17,24,39,0.12);font:500 14px/20px Inter,system-ui,sans-serif;color:#1a1a2e"
  const words = document.createElement("span")
  words.textContent = "Storelib was updated. Reload to continue."
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = "Reload"
  button.style.cssText =
    "flex:none;height:32px;padding:0 12px;border:0;border-radius:8px;background:#1a1a2e;color:#fff;font:inherit;cursor:pointer"
  button.addEventListener("click", () => window.location.reload())
  bar.append(words, button)
  document.body.append(bar)
}

function heal(error: unknown) {
  const path = window.location.pathname
  const action = staleAction({ error, path, holdsWork: pageHoldsWork(), store: sessionStore() })
  if (action === "none") return
  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildReport(error, window.location.href)),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* a report is never worth breaking the page over */
  }
  if (action === "reload") window.location.reload()
  else showBar()
}

/**
 * What an error boundary that swallows a region (components/storefront/
 * safe-region) does with a stale chunk: the same decision, so a creator's
 * page that lost a section to a deploy comes back whole.
 */
export function recoverFromStaleCode(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleCodeError(error, window.location.pathname)) return false
  heal(error)
  return true
}

const WATCHING = "__storelibStaleCodeWatched"

export function watchStaleCode() {
  if (typeof window === "undefined") return
  const w = window as Window & { [WATCHING]?: boolean }
  if (w[WATCHING]) return
  w[WATCHING] = true
  window.addEventListener("unhandledrejection", (e) => heal(e.reason))
  window.addEventListener("error", (e) => heal(e.error ?? { message: e.message }))
}
