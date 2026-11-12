"use client"

import { useSyncExternalStore } from "react"

/**
 * THE CARDS' CREATORS, FETCHED WITH THE THEME PAGE (round AS). The words and
 * drawings each theme card shows (./preview-content) are their own small
 * chunk, asked for when the Design tab or the onboarding's template step
 * opens (preloadThemeThumbs), so the editor's first load does not carry
 * them. Every card reads the one module through usePreviewContent: null
 * until it is in, then the same object for good, so a card is drawn again
 * once at most.
 */
type Content = typeof import("./preview-content")

let ready: Content | null = null
let asked: Promise<Content> | null = null
const listeners = new Set<() => void>()

export function loadPreviewContent(): Promise<Content> {
  asked ??= import("./preview-content").then((m) => {
    ready = m
    for (const l of listeners) l()
    return m
  })
  return asked
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function usePreviewContent(): Content | null {
  const got = useSyncExternalStore(subscribe, () => ready, () => null)
  if (!got && !asked && typeof window !== "undefined") void loadPreviewContent()
  return got
}
