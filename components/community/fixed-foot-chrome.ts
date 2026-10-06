"use client"

/**
 * Fixed foot chrome on community pages (join bar, visitor join, etc.).
 * Measured height is written to --community-fixed-foot-h so floating UI
 * (open-in-app pill, toasts) never covers primary actions.
 */
export const COMMUNITY_FIXED_FOOT_ATTR = "data-community-fixed-foot"
export const COMMUNITY_FIXED_FOOT_VAR = "--community-fixed-foot-h"

/** CSS bottom offset for a pill/toast above join bars and buyer tabs. */
export const COMMUNITY_FLOAT_BOTTOM = `max(calc(16px + env(safe-area-inset-bottom, 0px)), calc(var(${COMMUNITY_FIXED_FOOT_VAR}, 0px) + 12px), calc(var(--buyer-tabs-h, 0px) + 12px))`

/**
 * Fixed comment composer on a phone. Its layout box sits on the tab bar, or
 * on the keyboard when that is taller. Bottom (not a translate) so the field
 * is already in the visible area and the browser does not pan the post up
 * under the keys, which left a blank band and cut the picture.
 */
export const COMMENT_COMPOSER_DOCK_BOTTOM = `max(var(--buyer-tabs-h, 0px), var(--kb-inset, 0px))`

/** Room under the comments so the last line clears the dock. Not the keyboard: that box is fixed and must not stretch the page. */
export const COMMENT_COMPOSER_DOCK_SCROLL_PAD = `calc(100px + var(--buyer-tabs-h, 0px) + var(${COMMUNITY_FIXED_FOOT_VAR}, 0px))`

let observers = 0
let ro: ResizeObserver | null = null
let mo: MutationObserver | null = null

function footElements(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[${COMMUNITY_FIXED_FOOT_ATTR}]`)]
}

function measureFoot(): number {
  let max = 0
  for (const el of footElements()) {
    const st = getComputedStyle(el)
    if (st.display === "none" || st.visibility === "hidden") continue
    const h = el.getBoundingClientRect().height
    if (h > 0) max = Math.max(max, h)
  }
  return max
}

function syncFootVar() {
  document.documentElement.style.setProperty(COMMUNITY_FIXED_FOOT_VAR, `${measureFoot()}px`)
}

function watchFoot() {
  ro?.disconnect()
  ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncFootVar)
  for (const el of footElements()) ro?.observe(el)
  syncFootVar()
}

/** Start measuring fixed foot chrome (idempotent). */
export function startCommunityFixedFootWatch() {
  if (typeof document === "undefined") return () => {}
  observers += 1
  if (observers > 1) return () => stopCommunityFixedFootWatch()
  watchFoot()
  mo = new MutationObserver(watchFoot)
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] })
  window.addEventListener("resize", syncFootVar)
  return stopCommunityFixedFootWatch
}

function stopCommunityFixedFootWatch() {
  observers = Math.max(0, observers - 1)
  if (observers > 0) return
  mo?.disconnect()
  mo = null
  ro?.disconnect()
  ro = null
  window.removeEventListener("resize", syncFootVar)
  document.documentElement.style.removeProperty(COMMUNITY_FIXED_FOOT_VAR)
}
