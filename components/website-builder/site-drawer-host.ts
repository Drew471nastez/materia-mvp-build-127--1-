"use client"

/**
 * ===========================================================================
 *  ONE CART DRAWER PER CART, WHOEVER DRAWS THE HEADER
 * ===========================================================================
 * The cart drawer reads the site's cart and opens when it is told to. The
 * built-in header draws it; so does a header the creator wrote as a .storelib
 * file, when its markup has a bag marked `data-storelib-cart`
 * (sections/site-chrome-hooks.tsx). Two of them for one cart would both open
 * on the same tap, two panels and two backdrops over each other.
 *
 * So each one that could draw it asks here, and only the first to ask does.
 * The rest stand by and take over if it goes.
 *
 * PER CART, NOT PER PAGE. The question is "who draws THIS cart's drawer",
 * so the claims are kept against the cart they are for: its `setOpen`, which
 * is the same function for the life of a cart provider. Two providers on one
 * page (a probe, a preview beside a live frame) are two carts with a drawer
 * each.
 */
import { useEffect, useSyncExternalStore } from "react"

const hosts = new WeakMap<object, string[]>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The ids asking to draw this cart's drawer, in the order they asked. For the tests. */
export function drawerHosts(cart: object): readonly string[] {
  return hosts.get(cart) ?? []
}

export function claimDrawer(cart: object, id: string): () => void {
  const list = hosts.get(cart) ?? []
  if (!list.includes(id)) {
    hosts.set(cart, [...list, id])
    emit()
  }
  return () => {
    hosts.set(cart, (hosts.get(cart) ?? []).filter((h) => h !== id))
    emit()
  }
}

/** True when this one draws the cart's drawer: it wants to, and asked first. */
export function useDrawerHost(cart: object, id: string, want: boolean): boolean {
  useEffect(() => (want ? claimDrawer(cart, id) : undefined), [cart, id, want])
  const first = useSyncExternalStore(subscribe, () => hosts.get(cart)?.[0] ?? null, () => null)
  return want && first === id
}
