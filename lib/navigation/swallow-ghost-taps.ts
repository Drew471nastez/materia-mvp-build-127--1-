import { CLICK_ECHO_MS } from "@/lib/navigation/first-tap"

/**
 * After a full-screen layer closes, iOS often delivers a click to whatever
 * sat under the finger (the header's hamburger, a tab). A document-level guard
 * eats that echo without blocking scroll on the page underneath.
 *
 * ONLY WHERE THE FINGER WAS (round 15, the owner: "when I try to click the Edit
 * profile button or the Settings pill in the account page, sometimes it does
 * not recognise my touch, so I have to double click on it"). The guard used to
 * eat every click and every pointer lift anywhere in the document for well
 * over a second after Settings closed (its slide, then CLICK_ECHO_MS more),
 * and took the header and the tab bar out of reach with it. Back from
 * Settings, then Edit profile or the Settings pill again inside that second:
 * the tap was eaten, and the second tap was the one that worked.
 *
 * An echo lands where the finger lifted, so the guard now remembers where the
 * last press was and eats only what lands near it (GHOST_RADIUS_PX). A press
 * anywhere else on the page is a new press and goes through, the header and
 * the tab bar with it. Called with no press to remember (no pointer went down
 * in the last moment), it guards the whole document as before.
 */
const ATTR = "data-ghost-tap-guard"

/** An echo is the same finger at the same place: a fingertip's width either way covers it. */
export const GHOST_RADIUS_PX = 56
/** A press older than this is not the one whose echo is coming. */
const PRESS_RECENT_MS = 1500

let guardUntil = 0
let timer = 0
let armed = false
/** Where the press that closed the layer was, or null to guard everywhere. */
let near: { x: number; y: number } | null = null
let lastDown: { x: number; y: number; t: number } | null = null

/** Whether an event at (x, y) is the echo the guard is for. */
export function isGhostTap(x: number | undefined, y: number | undefined, at: { x: number; y: number } | null = near): boolean {
  if (!at) return true
  if (typeof x !== "number" || typeof y !== "number") return false
  const dx = x - at.x
  const dy = y - at.y
  return dx * dx + dy * dy <= GHOST_RADIUS_PX * GHOST_RADIUS_PX
}

function eat(e: Event) {
  if (performance.now() > guardUntil) return
  const p = e as MouseEvent
  /* A keyboard's click has no place (detail 0): it is never an echo. */
  if (near && ((e.type === "click" && p.detail === 0) || !isGhostTap(p.clientX, p.clientY))) return
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
  near = null
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

/** The press the guard is for: the last pointer down, if it was a moment ago. Read it when the layer is asked to close. */
export function recentPress(): { x: number; y: number } | null {
  if (!lastDown || performance.now() - lastDown.t > PRESS_RECENT_MS) return null
  return { x: lastDown.x, y: lastDown.y }
}

/**
 * Block ghost taps until `ms` from now (extends an existing guard if longer),
 * near `at`: by default where the last press was, and with no recent press
 * (or `null`) the whole document.
 */
export function swallowGhostTaps(ms: number = GHOST_TAP_AFTER_SHEET_MS, at: { x: number; y: number } | null = recentPress()) {
  if (typeof document === "undefined") return
  const until = performance.now() + ms
  if (until > guardUntil) guardUntil = until
  /* A guard already over the whole document stays that way; one for a press keeps that press's place. */
  if (!armed) near = at
  else if (near && !at) near = null
  armListeners()
  /* The header and the tab bar out of reach only while the whole document is guarded: a guarded place eats its own echo. */
  syncAttr(near === null)
  scheduleRemoval()
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (e) => {
      lastDown = { x: e.clientX, y: e.clientY, t: performance.now() }
    },
    { capture: true, passive: true },
  )
}
