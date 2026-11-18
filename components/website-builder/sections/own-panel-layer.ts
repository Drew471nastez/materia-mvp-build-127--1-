/**
 * ===========================================================================
 *  A PANEL OF THE SITE'S OWN IS EITHER ON THE SCREEN OR NOT DRAWN AT ALL
 * ===========================================================================
 * A site's code draws its own cart, search window and menu drawer and the
 * page opens and shuts them (site-chrome-hooks.tsx). How a shut one looked,
 * and where an open one landed, was left to the CSS that came with it, and
 * that went wrong in ways no single section could see:
 *
 * SHUT, IT STILL SHOWED. "Your bag is empty." and a menu link lay over the
 * hero. A panel hidden by sliding it off the edge, or by a rule that waits
 * for data-open="false", is on the page until the page's script has run, and
 * for good wherever it never runs. So a panel is not drawn (display: none,
 * theme-css.ts chromePlatformCss) unless the page has marked it
 * data-storelib-shown, which it does only from the moment one opens until its
 * closing motion has ended. Not drawn, it takes no room, scrolls nothing and
 * can be neither seen nor pressed.
 *
 * OPEN, IT WAS PINNED TO THE WRONG BOX. `position: fixed` is fixed to the
 * window only until some ancestor says otherwise, and plenty do: the page's
 * own "hide on the way down" header (`translate` on its box), a blurred
 * header bar (`backdrop-filter`), an entrance reveal (`transform`), and on
 * WebKit before 2025 every size container, which is the page root and each
 * section's box. The drawer was then as tall as the whole page, or as tall
 * as the header: a sheet with a screen of nothing under it that scrolled on
 * and on. So an open fixed panel is shown in the browser's TOP LAYER (a
 * manual popover), whose containing block is the window whatever its
 * ancestors do. Where there is no top layer to use (the builder's canvas,
 * where the top layer is the editor; a browser without popover) the
 * ancestors that would hold it are stilled for as long as it is open.
 *
 * A panel that is not fixed (a card hanging under the bag, a search field
 * dropping out of the header) is placed by its section and stays there.
 *
 * Pure DOM, no React. Measured by tests/own-panel-layer.test.ts.
 */

import { PANEL_SHOWN, PANEL_UNTRAP } from "@/lib/website-builder/own-panel-css"

/** The longest a closing motion is waited for before the panel is taken off the page anyway. */
const SETTLE_MS = 700

const settling = new WeakMap<HTMLElement, number>()
const lifted = new WeakMap<HTMLElement, "top" | HTMLElement[]>()

type PopoverElement = HTMLElement & { showPopover?: () => void; hidePopover?: () => void }

function traps(el: HTMLElement): boolean {
  const cs = getComputedStyle(el)
  const set = (v: string | undefined) => !!v && v !== "none" && v !== "normal" && v !== "auto"
  if (set(cs.transform) || set(cs.translate) || set(cs.rotate) || set(cs.scale) || set(cs.perspective) || set(cs.filter)) return true
  if (set(cs.backdropFilter) || set((cs as unknown as Record<string, string>).webkitBackdropFilter)) return true
  if (/\b(layout|paint|strict|content)\b/.test(cs.contain)) return true
  if (/\b(transform|translate|rotate|scale|perspective|filter|backdrop-filter)\b/.test(cs.willChange)) return true
  return cs.contentVisibility === "auto"
}

/*
  Which open panels each stilled ancestor is stilled for. Counted, so two panels under one header let go of it only
  when both have shut, and a panel whose markup was drawn again while it was open (the builder redraws a section
  under an edit) cannot leave its header stilled for good: a panel no longer in the page counts for nothing.
*/
const stilledFor = new WeakMap<HTMLElement, Set<HTMLElement>>()

/** Stills every ancestor between the panel and the page that would be its containing block. */
function untrap(panel: HTMLElement): HTMLElement[] {
  const stop = panel.closest<HTMLElement>(".wb-canvas-frame") ?? document.documentElement
  const held: HTMLElement[] = []
  for (let a = panel.parentElement; a && a !== stop && a !== document.body; a = a.parentElement) {
    const holders = stilledFor.get(a)
    if (holders) for (const p of holders) if (!p.isConnected) holders.delete(p)
    const already = !!holders && holders.size > 0
    if (!already && a.hasAttribute(PANEL_UNTRAP)) a.removeAttribute(PANEL_UNTRAP)
    if (!already && !traps(a)) continue
    const set = holders ?? new Set<HTMLElement>()
    set.add(panel)
    stilledFor.set(a, set)
    a.setAttribute(PANEL_UNTRAP, "")
    held.push(a)
  }
  return held
}

function release(panel: HTMLElement, held: HTMLElement[]) {
  for (const a of held) {
    const holders = stilledFor.get(a)
    holders?.delete(panel)
    if (holders) for (const p of holders) if (!p.isConnected) holders.delete(p)
    if (!holders || holders.size === 0) {
      stilledFor.delete(a)
      a.removeAttribute(PANEL_UNTRAP)
    }
  }
}

function lift(panel: PopoverElement, inCanvas: boolean) {
  if (lifted.has(panel)) return
  if (getComputedStyle(panel).position !== "fixed") return
  if (!inCanvas && typeof panel.showPopover === "function") {
    try {
      panel.setAttribute("popover", "manual")
      panel.showPopover()
      lifted.set(panel, "top")
      return
    } catch {
      panel.removeAttribute("popover")
    }
  }
  lifted.set(panel, untrap(panel))
}

/*
  A SHEET THAT STOPS SHORT (round BA). The owner's screenshot: a full screen menu drawer the AI wrote ending a
  hand's width above the bottom of the phone, the page showing under it (or one running past it, its last links out
  of reach). A panel opened at the very top of the screen and taller than half of it is a sheet meant to fill it,
  whatever its height says: its bottom is pinned to the screen's. A card hanging under its button (not at the top) or a short drop down is left as written.
*/
const stretched = new WeakMap<HTMLElement, { top: string; bottom: string; height: string; maxHeight: string }>()

function reachBottom(panel: HTMLElement) {
  if (stretched.has(panel) || panel.getAttribute("data-open") !== "true") return
  if (getComputedStyle(panel).position !== "fixed") return
  const frame = panel.closest<HTMLElement>(".wb-canvas-frame")?.getBoundingClientRect()
  const screen = frame ? { top: frame.top, bottom: frame.bottom, height: frame.height } : { top: 0, bottom: window.innerHeight, height: window.innerHeight }
  const r = panel.getBoundingClientRect()
  if (r.top > screen.top + 4 || r.height < screen.height * 0.5 || Math.abs(screen.bottom - r.bottom) <= 12) return
  stretched.set(panel, { top: panel.style.top, bottom: panel.style.bottom, height: panel.style.height, maxHeight: panel.style.maxHeight })
  panel.style.top = "0px"
  panel.style.bottom = "0px"
  panel.style.height = "auto"
  panel.style.maxHeight = "none"
}

function unstretch(panel: HTMLElement) {
  const was = stretched.get(panel)
  if (!was) return
  stretched.delete(panel)
  panel.style.top = was.top
  panel.style.bottom = was.bottom
  panel.style.height = was.height
  panel.style.maxHeight = was.maxHeight
}

function drop(panel: PopoverElement) {
  unstretch(panel)
  const how = lifted.get(panel)
  if (!how) return
  lifted.delete(panel)
  if (how === "top") {
    try { panel.hidePopover?.() } catch { /* already shut */ }
    panel.removeAttribute("popover")
    return
  }
  release(panel, how)
}

function settle(panel: HTMLElement) {
  window.clearTimeout(settling.get(panel))
  settling.delete(panel)
  if (panel.getAttribute("data-open") === "true") return
  drop(panel)
  panel.removeAttribute(PANEL_SHOWN)
}

/**
 * Opens or shuts one panel of the site's own: data-open, aria-hidden and
 * inert as before, and whether it is drawn and where. Safe to call again
 * with the same answer (the page's effects do, on every cart change).
 */
export function setOwnPanel(panel: HTMLElement, open: boolean, inCanvas: boolean) {
  panel.setAttribute("aria-hidden", String(!open))
  if (open) panel.removeAttribute("inert")
  else panel.setAttribute("inert", "")

  if (open) {
    window.clearTimeout(settling.get(panel))
    settling.delete(panel)
    if (!panel.hasAttribute(PANEL_SHOWN)) {
      /* Drawn first in its shut look, so the opening motion has somewhere to start from. */
      if (panel.getAttribute("data-open") !== "false") panel.setAttribute("data-open", "false")
      panel.setAttribute(PANEL_SHOWN, "")
      lift(panel, inCanvas)
      void panel.offsetWidth
      /* Measured once it is laid out where it opens (its own opening motion moves it sideways, never its top or bottom). */
      requestAnimationFrame(() => reachBottom(panel))
    }
    if (panel.getAttribute("data-open") !== "true") panel.setAttribute("data-open", "true")
    return
  }

  if (panel.getAttribute("data-open") !== "false") panel.setAttribute("data-open", "false")
  if (!panel.hasAttribute(PANEL_SHOWN) || settling.has(panel)) return
  /* Off the page when its closing motion ends, or after SETTLE_MS when it has none that says so. */
  const timer = window.setTimeout(() => settle(panel), SETTLE_MS)
  settling.set(panel, timer)
  requestAnimationFrame(() => {
    if (settling.get(panel) !== timer) return
    const moving = typeof panel.getAnimations === "function" ? panel.getAnimations({ subtree: true }).filter((a) => a.playState === "running" || a.pending) : []
    if (moving.length === 0) { settle(panel); return }
    void Promise.allSettled(moving.map((a) => a.finished)).then(() => { if (settling.get(panel) === timer) settle(panel) })
  })
}

/** A section going away takes what its open panels asked of the page with them. */
export function releaseOwnPanels(root: HTMLElement, selector: string) {
  root.querySelectorAll<HTMLElement>(selector).forEach((panel) => {
    window.clearTimeout(settling.get(panel))
    settling.delete(panel)
    drop(panel)
  })
}
