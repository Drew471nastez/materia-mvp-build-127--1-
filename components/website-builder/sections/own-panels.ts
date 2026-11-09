"use client"

/**
 * ===========================================================================
 *  A PANEL OF THE SITE'S OWN, WHICHEVER SECTION IT IS IN (round N)
 * ===========================================================================
 * A site's code may put its cart panel or search window in one section (a
 * header, an overlay) and the buttons that open it in others (a product
 * grid's add buttons, a search icon in a hero). Each section's hooks only see
 * their own markup, so the page keeps one small record per cart, the same
 * key site-drawer-host.ts uses (the cart's `setOpen`, one per page):
 *
 *   own.cart / own.search   the sections that have a panel of their own, in
 *                           the order they asked; the first is the one a
 *                           button elsewhere opens
 *   cart / search           which section's panel is open now, or null
 *   opener                  the element that opened the search window, so
 *                           focus goes back to it when it shuts
 *
 * While any section has a panel of its own, no built-in drawer or window is
 * drawn for that kind (sections/site-chrome-hooks.tsx). Pure state and a
 * subscription; nothing here touches the DOM.
 */
import { useEffect, useSyncExternalStore } from "react"

export type OwnPanelKind = "cart" | "search"

export interface PageHooksState {
  own: Record<OwnPanelKind, readonly string[]>
  cart: string | null
  search: string | null
  opener: HTMLElement | null
}

const EMPTY: PageHooksState = { own: { cart: [], search: [] }, cart: null, search: null, opener: null }
const pages = new WeakMap<object, PageHooksState>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function pageHooks(page: object): PageHooksState {
  return pages.get(page) ?? EMPTY
}

function update(page: object, patch: (s: PageHooksState) => PageHooksState) {
  const before = pageHooks(page)
  const after = patch(before)
  if (after === before) return
  pages.set(page, after)
  emit()
}

/** Says this section has a panel of `kind`. Returns the release, for its effect's cleanup. */
export function claimOwnPanel(page: object, kind: OwnPanelKind, id: string): () => void {
  update(page, (s) => (s.own[kind].includes(id) ? s : { ...s, own: { ...s.own, [kind]: [...s.own[kind], id] } }))
  return () =>
    update(page, (s) => ({
      ...s,
      own: { ...s.own, [kind]: s.own[kind].filter((x) => x !== id) },
      [kind]: s[kind] === id ? null : s[kind],
      opener: kind === "search" && s.search === id ? null : s.opener,
    }))
}

/** Opens `kind`'s panel in section `id`, or the page's first when `id` has none. False when the page has no panel of that kind. */
export function openOwnPanel(page: object, kind: OwnPanelKind, id: string | null, opener: HTMLElement | null = null): boolean {
  const s = pageHooks(page)
  const owner = id && s.own[kind].includes(id) ? id : (s.own[kind][0] ?? null)
  if (!owner) return false
  update(page, (st) => ({ ...st, [kind]: owner, ...(kind === "search" ? { opener } : {}) }))
  return true
}

export function closeOwnPanel(page: object, kind: OwnPanelKind): void {
  update(page, (s) => (s[kind] === null ? s : { ...s, [kind]: null }))
}

/** The page's record, and this section's claim while `want` holds. */
export function usePageHooks(page: object, id: string, want: { cart: boolean; search: boolean }): PageHooksState {
  useEffect(() => (want.cart ? claimOwnPanel(page, "cart", id) : undefined), [page, id, want.cart])
  useEffect(() => (want.search ? claimOwnPanel(page, "search", id) : undefined), [page, id, want.search])
  return useSyncExternalStore(subscribe, () => pageHooks(page), () => EMPTY)
}
