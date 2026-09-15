"use client"

/**
 * ===========================================================================
 *  ONE BAR AT A TIME
 * ===========================================================================
 * A product page has two bars that come and go on their own schedules. The
 * creator bar is stuck to the top and reveals on a scroll up. The buy bar is
 * stuck to the bottom and appears once the reader is past the description.
 * Scroll up in the middle of a long page and both are on screen at once, top
 * and bottom, around a page the reader is trying to read.
 *
 * They are made exclusive here, and the top one wins. That is not a coin
 * toss: the top bar only appears because somebody scrolled UP, which is the
 * gesture of going back rather than of buying, and the buy bar comes back on
 * the next downward scroll. Neither is ever more than one gesture away.
 *
 * WHY A MODULE AND NOT A MEASUREMENT. The obvious version asks the DOM
 * whether a top bar is on screen, and it is wrong twice: the bar animates, so
 * its rectangle during the last scroll event of a gesture is halfway through
 * a 300ms transform, and the scroll events have stopped by the time it lands.
 * This is the state itself, published by the two components that own it.
 *
 * WHY TWO FLAGS. `revealed` is the scroll-up hook, and it is true near the
 * top of every page whether or not a bar exists. `rendered` is whether there
 * is a bar at all — a creator can switch it off, and on those pages the buy
 * bar must go on behaving exactly as it did before this file existed.
 */

import { useSyncExternalStore } from "react"

let rendered = false
let revealed = true

const listeners = new Set<() => void>()

function publish() {
  for (const listener of listeners) listener()
}

/** Whether a creator bar is on the page at all. */
export function setProductTopBarRendered(next: boolean) {
  if (rendered === next) return
  rendered = next
  publish()
}

/** Whether the bar that is on the page is currently revealed. */
export function setProductTopBarRevealed(next: boolean) {
  if (revealed === next) return
  revealed = next
  publish()
}

export function isProductTopBarShown(): boolean {
  return rendered && revealed
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/* The server renders no bar and no scroll position, so it renders no
   conflict; the buy bar is client-only anyway and returns null until it has
   mounted. */
function serverSnapshot() {
  return false
}

export function useProductTopBarShown(): boolean {
  return useSyncExternalStore(subscribe, isProductTopBarShown, serverSnapshot)
}
