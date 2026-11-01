"use client"

/**
 * ===========================================================================
 *  A SECTION JUST ADDED IS DRAWN BEFORE THE EDITOR HEARS OF IT
 * ===========================================================================
 * Picking a section in Add a section was one render of the whole editor (the
 * sidebar's list, the new section's settings panel, both bars, every tooltip)
 * and then a second one for the canvas, which draws a deferred copy of the
 * page. The section's first pixel waited for both: about 170ms at full speed
 * and 950ms at a quarter (scripts/check-section-insert-smooth.mjs).
 *
 * Now the canvas is told first. The section, drawn as the canvas draws every
 * section, and the two sections it goes between are put here; the canvas
 * reads this store (`WithAddedSection`), so saying it renders the canvas and
 * nothing else, and the section is on screen in the next frame. The editor's
 * own state (the page, the history, the selection, its settings panel) is
 * committed once the section's arrival has played. Once the canvas is drawing a page
 * that has the section in it, the section leaves this store.
 */
import { createElement, Fragment, useLayoutEffect, useMemo, useSyncExternalStore, type ReactElement, type ReactNode } from "react"

export type AddedSection<S> = {
  /** The section as the canvas draws it (placeholders filled, the language and market previewed). */
  section: S & { id: string }
  /** The page it was added to: a canvas on another page does not draw it. */
  page: string
  /** The drawn section it goes after, else the one it goes before (null: the start or the end of the page). */
  afterId: string | null
  beforeId: string | null
}

export type AddedSectionStore<S> = {
  get(): readonly AddedSection<S>[]
  /** One more, after any still waiting (two picked in a row). */
  add(next: AddedSection<S>): void
  /** The ones a canvas now draws from its own page. */
  drop(ids: ReadonlySet<string>): void
  subscribe(listener: () => void): () => void
}

const NONE: readonly never[] = []

export function createAddedSectionStore<S>(): AddedSectionStore<S> {
  let value: readonly AddedSection<S>[] = NONE
  const listeners = new Set<() => void>()
  const set = (next: readonly AddedSection<S>[]) => {
    if (next === value) return
    value = next
    for (const l of [...listeners]) l()
  }
  return {
    get: () => value,
    add: (next) => set([...value.filter((a) => a.section.id !== next.section.id), next]),
    drop(ids) {
      if (!value.some((a) => ids.has(a.section.id))) return
      const left = value.filter((a) => !ids.has(a.section.id))
      set(left.length ? left : NONE)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * The page with the added sections in it, where they go: `sections` itself
 * when it already holds them or they were added to another page. One whose
 * neighbours are both gone from the page is left out; it is drawn when the
 * editor's own page has it, a frame or two later, rather than in a guessed
 * place.
 */
export function withAdded<S extends { id: string }>(sections: S[], added: readonly AddedSection<S>[], page: string): S[] {
  let out = sections
  for (const a of added) {
    if (a.page !== page) continue
    const id = a.section.id
    if (out.some((s) => s.id === id)) continue
    let at = -1
    if (a.afterId !== null) {
      const i = out.findIndex((s) => s.id === a.afterId)
      if (i >= 0) at = i + 1
    }
    if (at < 0 && a.beforeId !== null) {
      const i = out.findIndex((s) => s.id === a.beforeId)
      if (i >= 0) at = i
    }
    if (at < 0) {
      if (a.afterId === null) at = 0
      else if (a.beforeId === null) at = out.length
      else continue
    }
    out = [...out.slice(0, at), a.section as S, ...out.slice(at)]
  }
  return out
}

/** The neighbours a section is drawn between, read from the page drawn with it. */
export function neighboursOf<S extends { id: string }>(drawn: S[], id: string): { afterId: string | null; beforeId: string | null } | null {
  const i = drawn.findIndex((s) => s.id === id)
  if (i < 0) return null
  return { afterId: i > 0 ? drawn[i - 1].id : null, beforeId: i + 1 < drawn.length ? drawn[i + 1].id : null }
}

/**
 * The canvas's sections with the ones just added, handed to `children`. An
 * add renders this and the canvas under it, not the editor around it.
 */
export function WithAddedSection<S extends { id: string }>({ store, page, sections, children }: { store: AddedSectionStore<S>; page: string; sections: S[]; children: (sections: S[], added: { count: number; last: string | null }) => ReactNode }): ReactElement {
  const added = useSyncExternalStore(store.subscribe, store.get, store.get)
  const shown = useMemo(() => withAdded(sections, added, page), [sections, added, page])
  /* The ones the canvas's own page has now leave the store. */
  const arrived = useMemo(() => {
    const ids = new Set<string>()
    for (const a of added) if (sections.some((s) => s.id === a.section.id)) ids.add(a.section.id)
    return ids
  }, [added, sections])
  useLayoutEffect(() => {
    if (arrived.size) store.drop(arrived)
  }, [arrived, store])
  /*
    And the last one drawn here is the one the canvas rings: the editor's
    selection moves to it when the editor takes the add in, so the ring is
    drawn with the section rather than a frame or more after it, without
    the sidebar's list and the toolbar being drawn for it now.
  */
  const count = shown.length - sections.length
  let last: string | null = null
  if (count > 0) for (const a of added) if (a.page === page && shown.includes(a.section as S) && !sections.some((s) => s.id === a.section.id)) last = a.section.id
  return createElement(Fragment, null, children(shown, { count, last }))
}
