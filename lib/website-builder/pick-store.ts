"use client"

/**
 * ===========================================================================
 *  THE PICK, OUTSIDE THE EDITOR'S STATE
 * ===========================================================================
 * A section pressed on the canvas is drawn as selected at once (the ring, the
 * row, the toolbar), and its settings panel follows in a transition
 * (pickSection in the editor, round 36). The pick was state of the editor
 * page itself, so saying it at once was a render of the whole editor, every
 * button and tooltip of its bars included, and the transition after it was a
 * second one: three editor renders a pick with the tree's own update
 * (scripts/check-editor-perf.mjs PART=smooth HOOKS=1, round 44).
 *
 * Now the pick lives here. The three places that draw it read it through
 * `ShownSection`, so a pick renders those three and nothing else, and the
 * editor renders once, for the panel.
 */
import { useSyncExternalStore, type ReactNode } from "react"

export type Pick<P> = { id: string; from: P } | null

export type PickStore<P> = {
  get(): Pick<P>
  set(next: Pick<P>): void
  subscribe(listener: () => void): () => void
}

export function createPickStore<P>(): PickStore<P> {
  let value: Pick<P> = null
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      if (next === value) return
      value = next
      for (const l of [...listeners]) l()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** What is drawn as selected: the pick while its panel is on the way, the panel's section otherwise. */
export function shownSection<P>(pick: Pick<P>, panel: P, selected: string | null): string | null {
  return pick && pick.from === panel ? pick.id : selected
}

export function useShownSection<P>(store: PickStore<P>, panel: P, selected: string | null): string | null {
  const pick = useSyncExternalStore(store.subscribe, store.get, store.get)
  return shownSection(pick, panel, selected)
}

/** The section drawn as selected, handed to `children`: a pick renders this and what it draws, not the editor around it. */
export function ShownSection<P>({ store, panel, selected, children }: { store: PickStore<P>; panel: P; selected: string | null; children: (shown: string | null) => ReactNode }): ReactNode {
  return children(useShownSection(store, panel, selected))
}
