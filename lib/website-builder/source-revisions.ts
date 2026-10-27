"use client"

/**
 * Which section files changed, so a push redraws those sections and leaves
 * the rest of the page as it is. The render function stays the same object:
 * a new one redrew every section on the page (measured at a few hundred
 * milliseconds) each time an agent or GitHub wrote one file.
 */
import { useSyncExternalStore } from "react"

const listeners = new Set<() => void>()
let sectionRev = new Map<string, number>()
let sharedRev = 0

/** A snippet, a block, a layout or a config file: any section may read it. */
const SECTION_FILE = /^sections\/([a-z0-9_-]+)\.storelib$/

function emit() {
  for (const l of listeners) l()
}

export function sameFiles(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  for (const k of ak) if (a[k] !== b[k]) return false
  return true
}

export function changedFilePaths(before: Record<string, string>, after: Record<string, string>): string[] {
  const out: string[] = []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) if (before[k] !== after[k]) out.push(k)
  return out
}

/** One notice for the whole batch, then the sections that read those files redraw. */
export function noteSourceChanges(paths: string[]): void {
  let shared = false
  let any = false
  for (const path of paths) {
    const type = SECTION_FILE.exec(path)?.[1]
    if (type) {
      sectionRev.set(type, (sectionRev.get(type) ?? 0) + 1)
      any = true
    } else {
      shared = true
    }
  }
  if (shared) {
    sharedRev += 1
    any = true
  }
  if (any) emit()
}

/** The number a section of this type redraws on. For tests. */
export function sourceRevision(type: string): number {
  return (sectionRev.get(type) ?? 0) + sharedRev * 1_000_003
}

export function resetSourceRevisions(): void {
  sectionRev = new Map()
  sharedRev = 0
  emit()
}

export function useSectionSourceRev(type: string): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => sourceRevision(type),
    () => 0,
  )
}
