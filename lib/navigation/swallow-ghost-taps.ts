import { CLICK_ECHO_MS } from "@/lib/navigation/first-tap"

/**
 * After a full-screen layer closes, iOS often delivers a click to whatever
 * sat under the finger (the header's hamburger, a tab). A document-level guard
 * eats that echo without blocking scroll on the page underneath.
 */
const ATTR = "data-ghost-tap-guard"

let guardUntil = 0
let timer = 0
let armed = false

function eat(e: Event) {
  if (performance.now() > guardUntil) return
  e.preventDefault()
  e.stopPropagation()
  if (typeof (e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation === "function") {
    ;(e as Event & { stopImmediatePropagation: () => void }).stopImmediatePropagation()
  }
}

function syncAttr(on: boolean) {
  document.documentElement.toggleAttribute(ATTR, on)
}

function disarm() {
  if (!armed) return
  armed = false
  document.removeEventListener("click", eat, true)
  document.removeEventListener("pointerup", eat, true)
}

function removeGuard() {
  window.clearTimeout(timer)
  timer = 0
  if (performance.now() < guardUntil) {
    scheduleRemoval()
    return
  }
  disarm()
  syncAttr(false)
}

function armListeners() {
  if (armed) return
  armed = true
  document.addEventListener("click", eat, true)
  document.addEventListener("pointerup", eat, true)
}

function scheduleRemoval() {
  window.clearTimeout(timer)
  const left = Math.max(0, guardUntil - performance.now())
  timer = window.setTimeout(removeGuard, left + 16)
}

/** Default: long enough for a sliding sheet to finish and iOS to echo the tap. */
export const GHOST_TAP_AFTER_SHEET_MS = CLICK_ECHO_MS + 420

export function ghostTapGuardActive(): boolean {
  return performance.now() < guardUntil
}

/**
 * Block ghost taps until `ms` from now (extends an existing guard if longer).
 */
export function swallowGhostTaps(ms: number = GHOST_TAP_AFTER_SHEET_MS) {
  if (typeof document === "undefined") return
  const until = performance.now() + ms
  if (until > guardUntil) guardUntil = until
  armListeners()
  syncAttr(true)
  scheduleRemoval()
}
