import { CLICK_ECHO_MS } from "@/lib/navigation/first-tap"

/**
 * After a full-screen layer closes, iOS often delivers a click to whatever
 * sat under the finger (the header's hamburger, a tab). A guard eats that
 * echo without blocking the next intentional tap.
 *
 * Duration must cover the close animation plus CLICK_ECHO_MS (the browser may
 * synthesize a click on a *different* element long after pointerup).
 */
const SHIELD_Z = 2_147_483_000
const ATTR = "data-ghost-tap-guard"

let shield: HTMLElement | null = null
let guardUntil = 0
let timer = 0

function eat(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  if (typeof (e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
    ;(e as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation()
  }
}

function syncAttr(on: boolean) {
  document.documentElement.toggleAttribute(ATTR, on)
}

function removeShield() {
  window.clearTimeout(timer)
  timer = 0
  if (performance.now() < guardUntil) {
    scheduleRemoval()
    return
  }
  shield?.remove()
  shield = null
  syncAttr(false)
}

function ensureShield() {
  if (shield) return
  const block = document.createElement("div")
  block.setAttribute("data-ghost-tap-shield", "")
  block.setAttribute("aria-hidden", "true")
  block.style.cssText = `position:fixed;inset:0;z-index:${SHIELD_Z};touch-action:none;cursor:default`
  for (const type of ["touchstart", "touchend", "touchcancel", "pointerdown", "pointerup", "mousedown", "mouseup", "click"] as const) {
    block.addEventListener(type, eat, true)
  }
  document.body.appendChild(block)
  shield = block
  syncAttr(true)
}

function scheduleRemoval() {
  window.clearTimeout(timer)
  const left = Math.max(0, guardUntil - performance.now())
  timer = window.setTimeout(() => {
    if (performance.now() < guardUntil) {
      scheduleRemoval()
      return
    }
    removeShield()
  }, left + 16)
}

/** Default: long enough for a sliding sheet to finish and iOS to echo the tap. */
export const GHOST_TAP_AFTER_SHEET_MS = CLICK_ECHO_MS + 420

export function ghostTapGuardActive(): boolean {
  return performance.now() < guardUntil || shield != null
}

/**
 * Block ghost taps until `ms` from now (extends an existing guard if longer).
 */
export function swallowGhostTaps(ms: number = GHOST_TAP_AFTER_SHEET_MS) {
  if (typeof document === "undefined") return
  const until = performance.now() + ms
  if (until > guardUntil) guardUntil = until
  ensureShield()
  scheduleRemoval()
}
