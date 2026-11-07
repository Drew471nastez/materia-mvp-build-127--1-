"use client"

/**
 * ===========================================================================
 *  THE STORY AS IT IS BEING EDITED, AND AS IT WAS JUST SAVED (round 50)
 * ===========================================================================
 * The profile already works this way (./profile-draft): the sheet hands what
 * is in its fields to the block behind it, in memory, so a change shows
 * while it is typed, Cancel puts the saved page back with nothing to fetch,
 * and a save keeps the saved values on screen until the page's own props
 * say the same thing.
 *
 * That last part is what makes a save show at once whatever the network
 * does. The page is one HTML for everybody, held by the CDN (round 49); the
 * save purges it and the sheet refreshes it, but until that answer lands the
 * owner would otherwise look at the old story under a "Saved" toast. The
 * values held after a save are the server's own (the route answers with
 * the story as stored, cleaned), so what is drawn is what was kept.
 *
 * One page has one About block, so one draft at a time. The block reads it
 * only where it carries the owner's controls.
 */

import * as React from "react"
import type { StoryValues } from "./story"

let current: StoryValues | null = null
const listeners = new Set<() => void>()

export function setStoryDraft(next: StoryValues | null) {
  if (next === current) return
  current = next
  for (const fn of listeners) fn()
}

export function getStoryDraft(): StoryValues | null {
  return current
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const none = () => null

export function useStoryDraft(enabled = true): StoryValues | null {
  const draft = React.useSyncExternalStore(subscribe, getStoryDraft, none)
  return enabled ? draft : null
}
