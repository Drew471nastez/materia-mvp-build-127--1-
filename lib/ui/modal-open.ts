/**
 * ===========================================================================
 *  "A MODAL IS OPEN", SAID ON <html> INSTEAD OF ASKED WITH :has()
 * ===========================================================================
 * Round 49. Opening any dialog in /app was one long task: 130 to 160ms on a
 * computer, measured by the analytics engineer, with whole-document style
 * recalculations in its trace. Part of it was here: the shell asked whether
 * a modal was open with `html:has([role="dialog"][aria-modal="true"]:not(...))`
 * (the pill's layer and its taps, app/globals.css) and the cookie banner
 * with the same question. A :has() whose subject is <html> is re-asked
 * whenever an element carrying an attribute it names goes in or out of the
 * document or has that attribute changed, and Chromium then restyles the
 * whole document, whatever the rule after it names. `role` is on every
 * dialog, menu and tab list, and `aria-hidden` is what Radix puts all over
 * the page the moment a dialog opens (scripts/check-dialogs-r49.mjs,
 * EXPERIMENT=1: 17 to 23ms per change on a 1,400 element page, before).
 * The rest of that task is in lib/ui/dialog-focus.ts and app/globals.css
 * (round 49 notes).
 *
 * Now the answer is kept here, as a count, and written on <html>:
 *
 *   data-modal-open="<n>"  n dialogs a person can see are open:
 *                          [role=dialog][aria-modal=true], not the phone
 *                          menu (it is kept mounted and is the pill's own),
 *                          not aria-hidden, not the shared sheet (which says
 *                          so itself, data-app-sheet-up). The pill's rules.
 *   data-modal-any         any [role=dialog][aria-modal=true] but the shared
 *                          sheet is in the document. The cookie banner's
 *                          rule, which never left the other two out.
 *
 * Each is exactly what the :has() it replaces matched, so what is drawn is
 * the same. A change to an attribute on <html> restyles only the elements
 * the rules after it name (the pill's parts, the banner), not the document.
 *
 * A COUNT OF WHAT IS IN THE DOCUMENT, NOT OF OPENS AND CLOSES. Fifty-odd
 * dialogs in the app are hand-made (a div with role and aria-modal), and a
 * counter each of them had to raise and lower would be fifty places to get
 * a nested close, an unmount mid-animation or a route change wrong. The
 * count is the number of matching elements, read again after any change that
 * could alter it, so a dialog over a dialog is two, closing the top one
 * leaves one, and a page that unmounts with a dialog open (a route change,
 * an error boundary) takes its dialog out of the count with it.
 *
 * CHEAP TO WATCH. One MutationObserver on <body>, batched by the browser to
 * one call per task. A batch is looked at only when it could change the
 * answer: an attribute this names changed, an element that is or holds an
 * `aria-modal` went in, or anything left while a dialog was counted. Then
 * one querySelectorAll of the document, a fraction of a millisecond. It runs
 * as a microtask after React's commit, so <html> says so before the frame
 * the dialog is first drawn in.
 *
 * STARTED BY WHAT ASKS. The pill (components/app/sidebar-mobile-nav.tsx) and
 * the cookie banner (components/cookie-consent-banner.tsx) are the only
 * things these attributes style; each holds the watch while it is mounted
 * (useModalOpenWatch), and the last one to leave stops it and takes both
 * attributes off. A storefront with no banner showing runs none of this.
 */

import { useEffect } from "react"

export const MODAL_OPEN_ATTR = "data-modal-open"
export const MODAL_ANY_ATTR = "data-modal-any"

/** What the cookie banner's old `:has()` matched. */
export const MODAL_ANY_SELECTOR = '[role="dialog"][aria-modal="true"]:not([data-sheet-root])'
/** What the pill's old `:has()` matched: the same, less the phone menu and a dialog kept hidden. */
export const MODAL_OPEN_SELECTOR = '[role="dialog"][aria-modal="true"]:not([data-mobile-menu], [aria-hidden="true"], [data-sheet-root])'

/** The attributes either selector reads. A change to any other cannot change the answer. */
export const WATCHED_ATTRIBUTES = ["role", "aria-modal", "aria-hidden", "data-sheet-root", "data-mobile-menu"] as const

export interface ModalCounts {
  open: number
  any: number
}

interface QueryRoot {
  querySelectorAll(selector: string): ArrayLike<{ matches(selector: string): boolean }>
}
interface AttrTarget {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** How many of each are in the document now. */
export function countModals(root: QueryRoot): ModalCounts {
  const all = root.querySelectorAll(MODAL_ANY_SELECTOR)
  let open = 0
  for (let i = 0; i < all.length; i++) if (all[i].matches(MODAL_OPEN_SELECTOR)) open++
  return { open, any: all.length }
}

/**
 * Writes the counts on <html>, touching an attribute only when its value
 * changes: an unchanged write is still a mutation, and a restyle of what it
 * names.
 */
export function writeModalCounts(html: AttrTarget, counts: ModalCounts): void {
  const open = counts.open > 0 ? String(counts.open) : null
  if (html.getAttribute(MODAL_OPEN_ATTR) !== open) {
    if (open === null) html.removeAttribute(MODAL_OPEN_ATTR)
    else html.setAttribute(MODAL_OPEN_ATTR, open)
  }
  const any = counts.any > 0 ? "" : null
  if (html.getAttribute(MODAL_ANY_ATTR) !== any) {
    if (any === null) html.removeAttribute(MODAL_ANY_ATTR)
    else html.setAttribute(MODAL_ANY_ATTR, any)
  }
}

interface NodeLike {
  nodeType: number
  matches?(selector: string): boolean
  querySelector?(selector: string): unknown
}
interface RecordLike {
  type: string
  addedNodes: ArrayLike<NodeLike>
  removedNodes: ArrayLike<NodeLike>
}

const MAY_BE_MODAL = "[aria-modal]"

/** Could this batch of mutations change the counts? `counted` is how many dialogs were counted before it. */
export function batchMatters(records: ArrayLike<RecordLike>, counted: number): boolean {
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    /* Only the attributes in WATCHED_ATTRIBUTES are observed. */
    if (r.type === "attributes") return true
    if (r.type !== "childList") continue
    if (counted > 0 && r.removedNodes.length > 0) return true
    for (let j = 0; j < r.addedNodes.length; j++) {
      const n = r.addedNodes[j]
      if (n.nodeType !== 1) continue
      if (n.matches?.(MAY_BE_MODAL) || n.querySelector?.(MAY_BE_MODAL)) return true
    }
  }
  return false
}

let holders = 0
let stopWatch: (() => void) | null = null
let lastAny = 0

/** Counts now and writes the answer. Exported for the probe and the tests. */
export function syncModalOpen(doc: Document = document): ModalCounts {
  const counts = countModals(doc)
  lastAny = counts.any
  writeModalCounts(doc.documentElement, counts)
  return counts
}

function start(doc: Document): () => void {
  syncModalOpen(doc)
  const mo = new MutationObserver((records) => {
    if (batchMatters(records, lastAny)) syncModalOpen(doc)
  })
  mo.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: [...WATCHED_ATTRIBUTES] })
  /* A page restored from the back/forward cache comes back with whatever <html> said when it left. */
  const onShow = () => syncModalOpen(doc)
  doc.defaultView?.addEventListener("pageshow", onShow)
  return () => {
    mo.disconnect()
    doc.defaultView?.removeEventListener("pageshow", onShow)
    lastAny = 0
    writeModalCounts(doc.documentElement, { open: 0, any: 0 })
  }
}

/**
 * Holds the watch while the caller is mounted. Returns the release, which is
 * safe to call more than once. The last release stops the observer and
 * clears both attributes.
 */
export function holdModalWatch(doc: Document = document): () => void {
  if (typeof MutationObserver === "undefined" || !doc.body) return () => {}
  holders++
  if (!stopWatch) stopWatch = start(doc)
  let held = true
  return () => {
    if (!held) return
    held = false
    holders--
    if (holders === 0 && stopWatch) {
      const stop = stopWatch
      stopWatch = null
      stop()
    }
  }
}

/** The hook form of holdModalWatch, for the components whose styles read the attributes. */
export function useModalOpenWatch(active = true): void {
  useEffect(() => (active ? holdModalWatch() : undefined), [active])
}
