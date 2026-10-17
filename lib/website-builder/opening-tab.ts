"use client"

/**
 * ===========================================================================
 *  A TAB OPENED FOR THE WEBSITE NEVER SITS ON about:blank
 * ===========================================================================
 * Some addresses are only known after the server answers: the preview link
 * of a site that is not published yet is made on the press. A tab opened
 * after that await is a pop up, and browsers block it, so the tab is opened
 * inside the press and pointed at the address once it arrives.
 *
 * It used to be opened empty (`window.open("", "_blank")`). While the server
 * was slow the visitor looked at a tab called "Untitled" reading
 * about:blank, and when the request failed or never came back that tab
 * stayed like that for good (reported with a screenshot).
 *
 * Now the tab says what it is from the first frame ("Opening your website"),
 * cuts its way back to the builder (`opener = null`), and ends one of three
 * ways:
 *
 *   go(url)      replaced by the website, so the holding page is not left
 *                in its history
 *   fail(text)   the reason, in plain words, in that tab, and the tab offers
 *                to close itself
 *   a timeout    after OPENING_TAB_TIMEOUT_MS with no answer, the same as
 *                fail, so nothing waits forever
 *
 * When the address is already known, nothing here is needed: open it
 * directly (`window.open(url, "_blank", "noopener")`).
 */

/** How long a tab may wait for its address before it says it could not open. */
export const OPENING_TAB_TIMEOUT_MS = 20_000

/** The holding tab's title and line. */
export const OPENING_TITLE = "Opening your website"

/** Marks the tab's body while it is still the holding page. */
const HOLDING = "data-storelib-opening"

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c)

/** The page drawn in the tab while it waits: Storelib's own page colours, no spinner art. */
export function holdingPage(title: string, line: string, failed = false): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>` +
    `<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f9fa;color:#1a1a2e;font:15px/1.5 Inter,system-ui,-apple-system,sans-serif}` +
    `main{max-width:360px;padding:0 16px;text-align:center}h1{margin:0 0 6px;font-size:18px;font-weight:600}p{margin:0;color:#6b7280;font-size:14px}` +
    `button{margin-top:16px;height:36px;padding:0 14px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#1a1a2e;font:inherit;font-size:14px;cursor:pointer}` +
    `.dot{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#8b5cf6;animation:b 1s infinite ease-in-out}.dot:nth-child(2){animation-delay:.15s}.dot:nth-child(3){animation-delay:.3s}` +
    `@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}@media (prefers-reduced-motion:reduce){.dot{animation:none;opacity:.6}}</style></head>` +
    `<body ${HOLDING}=""><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(line)}</p>` +
    (failed ? `<button type="button" onclick="window.close()">Close this tab</button>` : `<div style="margin-top:14px" aria-hidden="true"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`) +
    `</main></body></html>`
  )
}

export interface OpeningTab {
  /** Point the tab at the address. False when the tab is gone, so the caller can open one the ordinary way. */
  go: (url: string) => boolean
  /** Say why it did not open, in that tab. */
  fail: (reason: string) => void
}

function write(tab: Window, html: string): void {
  try {
    tab.document.open()
    tab.document.write(html)
    tab.document.close()
  } catch {
    /* A browser that refuses the write still has the tab; go() still works. */
  }
}

/**
 * A tab of this press's own, already saying what it is waiting for. Null
 * when the browser refused to open one.
 */
export function openOpeningTab(line = "One moment."): OpeningTab | null {
  let tab: Window | null = null
  try {
    tab = window.open("", "_blank")
  } catch {
    return null
  }
  if (!tab) return null
  try {
    /* The website it ends on cannot reach back into the builder. */
    tab.opener = null
  } catch {
    /* Some browsers cut it themselves and refuse the write. */
  }
  write(tab, holdingPage(OPENING_TITLE, line))
  /* Pointed, or told it failed: either way it is finished. A timeout only says so in the tab; an answer that arrives after it still lands. */
  let settled = false
  const say = (reason: string) => {
    try {
      if (tab && !tab.closed) write(tab, holdingPage("Could not open your website", reason, true))
    } catch {
      /* Gone already. */
    }
  }
  const timer = window.setTimeout(() => {
    if (!settled) say("It is taking longer than it should. Close this tab and try again from the builder.")
  }, OPENING_TAB_TIMEOUT_MS)
  return {
    go: (url: string) => {
      if (settled) return false
      settled = true
      window.clearTimeout(timer)
      try {
        if (!tab || tab.closed) return false
        tab.location.replace(url)
        return true
      } catch {
        return false
      }
    },
    fail: (reason: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      say(reason)
    },
  }
}

/** Whether a tab still shows the holding page (for the tests and the check script). */
export function isHolding(doc: Document | null | undefined): boolean {
  return !!doc?.body?.hasAttribute(HOLDING)
}
