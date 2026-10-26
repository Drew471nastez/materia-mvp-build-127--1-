/**
 * ===========================================================================
 *  ASK STORELIB'S SHEET IS WHERE ITS SHEET IS, AND SAYS SO WHEN IT IS NOT
 * ===========================================================================
 * The owner's iPhone, twice (round 20 and 21): the sheet itself in its place,
 * its grab bar centred, and everything inside it, the header, the thread and
 * the box, about 43pt to the right and 56pt down, cut off at the right and the
 * foot. Nothing in the editor's code moves the conversation sideways, the
 * same screen drawn in Chromium at the phone's size, pixel ratio and safe
 * area is right, and so it is something iOS did to the page (a pan, a zoom,
 * a scroll of a box that is not meant to scroll) and left behind.
 *
 * So at the moments it could have happened (the sheet coming up, a keyboard
 * going, the screen turning, the page coming back) the conversation is
 * measured against the sheet: its left edge is the sheet's, its top is the
 * sheet's top and the grab bar's height under it, less the pan the sheet
 * itself asks for while keys are up.
 * When it is not, whatever was scrolled on the way up (the sheet, the body,
 * the page, the visible area) is put back, and what was found is sent once
 * to /api/client-errors, so the cause can be named from the phone it
 * happened on.
 */

export interface AskSheetFinding {
  dx: number
  dy: number
  /** Every box from the conversation up that was scrolled or moved, and the visible area's own pan and zoom. */
  found: string[]
}

const near = (a: number, b: number) => Math.abs(a - b) <= 2

/** Where the conversation is against where its sheet says it should be. Null when it is right, or there is no sheet to hold it against. */
export function measureAskSheet(column: HTMLElement): AskSheetFinding | null {
  const sheet = column.closest<HTMLElement>("[data-mobile-bottom-sheet]")
  const bar = sheet?.firstElementChild as HTMLElement | null
  if (!sheet || !bar || bar === column) return null
  const s = sheet.getBoundingClientRect()
  if (s.height < 40 || s.top >= (window.innerHeight || 0)) return null
  const c = column.getBoundingClientRect()
  const pan = parseFloat(getComputedStyle(sheet).getPropertyValue("--sheet-pan")) || 0
  /* Against the sheet's own box and the grab bar's height, not the bar's place: a sheet scrolled inside itself takes the bar with it. */
  const dx = Math.round(c.left - s.left)
  const dy = Math.round(c.top - (s.top + bar.offsetHeight) - pan)
  if (near(dx, 0) && near(dy, 0)) return null
  const found: string[] = []
  for (let n: HTMLElement | null = column; n; n = n.parentElement) {
    const name = n === document.documentElement ? "html" : n === document.body ? "body" : n.hasAttribute("data-mobile-bottom-sheet") ? "sheet" : n === column ? "column" : n.tagName.toLowerCase()
    if (n.scrollLeft || n.scrollTop) found.push(`${name} scrolled ${Math.round(n.scrollLeft)},${Math.round(n.scrollTop)}`)
    const t = getComputedStyle(n).transform
    /* A transform that moves nothing is not a finding (the column's own `translate3d(0, 0px, 0)` at rest). */
    if (t && t !== "none" && name !== "sheet" && !/^matrix\(1, 0, 0, 1, 0, 0\)$|^matrix3d\(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1\)$/.test(t)) found.push(`${name} ${t.slice(0, 60)}`)
  }
  const vv = window.visualViewport
  if (vv) found.push(`view ${Math.round(vv.width)}x${Math.round(vv.height)} at ${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)} x${vv.scale.toFixed(2)}`)
  if (window.scrollX || window.scrollY) found.push(`window scrolled ${Math.round(window.scrollX)},${Math.round(window.scrollY)}`)
  found.push(`screen ${window.innerWidth}x${window.innerHeight}`)
  return { dx, dy, found }
}

/** Puts back what a browser scrolled on the way from the conversation to the page. */
export function settleAskSheet(column: HTMLElement): void {
  for (let n: HTMLElement | null = column; n; n = n.parentElement) {
    if (n.scrollLeft) n.scrollLeft = 0
    if (n.scrollTop && n !== column) n.scrollTop = 0
  }
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
}

let told = false

/** Measured, put back if it is off, and told once a visit. Returns what was found, for a probe. */
export function guardAskSheet(column: HTMLElement): AskSheetFinding | null {
  const off = measureAskSheet(column)
  if (!off) return null
  settleAskSheet(column)
  const after = measureAskSheet(column)
  if (!told) {
    told = true
    const message = `Ask sheet off by ${off.dx},${off.dy}${after ? ` (still ${after.dx},${after.dy} after settling)` : " (settled)"}: ${off.found.join("; ")}`.slice(0, 300)
    try {
      void fetch("/api/client-errors", { method: "POST", body: JSON.stringify({ message, path: location.pathname }), keepalive: true, credentials: "same-origin" }).catch(() => {})
    } catch {
      /* the repair above is what matters */
    }
  }
  return off
}
