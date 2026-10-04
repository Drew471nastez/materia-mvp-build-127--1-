"use client"

/**
 * ===========================================================================
 *  ONE CATEGORIES MENU FOR BOTH SEARCH FIELDS
 * ===========================================================================
 * Explore's hero field has a categories icon at its right end. Once that
 * field scrolls away the header shows its own search field, and the owner
 * asked for the same icon there, opening the same menu and doing the same
 * thing when a category is picked.
 *
 * The header and the page are different trees (the header is in the layout),
 * so the page publishes what its menu needs here while its hero is on the
 * page, and the header reads it. Nothing is published on a page without that
 * hero, so the header field there stays search alone.
 *
 * A NEW OBJECT EACH RENDER IS NOT A CHANGE. The page builds its categories
 * object inline, so it is a new one on every render. Only what the menu draws
 * (the list, the picked row, the "All" row) makes the header draw again; the
 * pick itself is read from a ref when it happens, so it is always the page's
 * latest.
 */

import { useEffect, useRef, useSyncExternalStore } from "react"
import type { BrowseGroup } from "@/components/explore/category-browser"

export interface SearchCategories {
  groups: readonly BrowseGroup[]
  selectedGroup: string | null
  selectedItem: string | null
  allRow?: { id: string; label: string }
  onPick: (groupId: string, itemId: string | null) => void
}

let current: SearchCategories | null = null
const listeners = new Set<() => void>()

function publish(next: SearchCategories | null) {
  current = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The page's side: what its hero menu offers, for as long as the hero is mounted. */
export function usePublishSearchCategories(categories: SearchCategories | undefined) {
  const pick = useRef<SearchCategories["onPick"] | undefined>(undefined)
  useEffect(() => {
    pick.current = categories?.onPick
  })
  const on = !!categories
  const groups = categories?.groups
  const selectedGroup = categories?.selectedGroup ?? null
  const selectedItem = categories?.selectedItem ?? null
  const allId = categories?.allRow?.id
  const allLabel = categories?.allRow?.label
  useEffect(() => {
    if (!on || !groups) return
    const value: SearchCategories = {
      groups,
      selectedGroup,
      selectedItem,
      allRow: allId !== undefined && allLabel !== undefined ? { id: allId, label: allLabel } : undefined,
      onPick: (groupId, itemId) => pick.current?.(groupId, itemId),
    }
    publish(value)
    return () => {
      if (current === value) publish(null)
    }
  }, [on, groups, selectedGroup, selectedItem, allId, allLabel])
}

/** The header's side: the page's menu, or null where the page has none. */
export function useSearchCategories(): SearchCategories | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
