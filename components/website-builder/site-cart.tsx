"use client"

/**
 * ===========================================================================
 *  THE CART A BUILT SITE ACTUALLY HAS
 * ===========================================================================
 * The state behind the header's bag. The arithmetic and the defensive
 * parsing are in lib/website-builder/cart.ts, which is plain functions and
 * is unit tested; this is the part that has to live in a browser.
 *
 * WHERE IT IS KEPT. Local storage, under the shop's own id, so two creators'
 * sites open in two tabs are two carts and neither can see the other. It is
 * not on the server: a cart is not a purchase, a guest has no row to hang it
 * on, and the only thing the server needs at the end is a list of ids, which
 * the checkout sends. Nothing here is trusted when the payment is made.
 *
 * IT STARTS EMPTY ON PURPOSE. The server has no local storage, so rendering
 * a count on the server and a different one in the browser is a hydration
 * mismatch. The first render is the empty cart, `ready` is false, and the
 * badge shows nothing until the real cart has been read. That is one frame,
 * and it is the difference between a correct page and React discarding the
 * server's markup.
 *
 * IN THE EDITOR IT IS MEMORY ONLY. A creator pressing Add to cart inside
 * their own canvas is trying the button, not shopping, and it should not
 * leave anything behind in the browser they will later visit the real site
 * with. No shop id means no storage.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  addLine,
  cartCount,
  cartStorageKey,
  cartSubtotalCents,
  lineKey,
  parseCart,
  removeLine,
  serializeCart,
  setQuantity,
  type CartLine,
} from "@/lib/website-builder/cart"

interface SiteCartValue {
  lines: CartLine[]
  /** False until local storage has been read. The badge waits for it. */
  ready: boolean
  count: number
  subtotalCents: number
  open: boolean
  setOpen: (open: boolean) => void
  add: (line: CartLine) => void
  setQty: (key: string, quantity: number) => void
  remove: (key: string) => void
  clear: () => void
  /** Whether this cart can reach a checkout. False inside the editor. */
  live: boolean
  /** The shop this cart belongs to, for the physical checkout's address. */
  shopId: string | null
}

const EMPTY: SiteCartValue = {
  lines: [],
  ready: false,
  count: 0,
  subtotalCents: 0,
  open: false,
  setOpen: () => {},
  add: () => {},
  setQty: () => {},
  remove: () => {},
  clear: () => {},
  live: false,
  shopId: null,
}

const SiteCartContext = createContext<SiteCartValue>(EMPTY)

export function useSiteCart(): SiteCartValue {
  return useContext(SiteCartContext)
}

export function SiteCartProvider({ shopId, children }: { shopId?: string; children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const key = shopId ? cartStorageKey(shopId) : null

  /* Writes are skipped until the read has happened, or the empty first
     render would overwrite a cart that was already there. */
  const loaded = useRef(false)

  useEffect(() => {
    if (!key) { setReady(true); return }
    try {
      setLines(parseCart(window.localStorage.getItem(key)))
    } catch {
      /* Private mode, blocked site data, a quota error on read: an empty
         cart is the right answer and a broken shop is not. */
    }
    loaded.current = true
    setReady(true)
  }, [key])

  useEffect(() => {
    if (!key || !loaded.current) return
    try {
      window.localStorage.setItem(key, serializeCart(lines))
    } catch {
      /* Out of quota or storage refused. The cart still works for this
         page; it just will not survive a reload. */
    }
  }, [key, lines])

  /* The same shop open in a second tab. Without this, adding something
     there and coming back here shows a stale bag, and whichever tab writes
     last wins the whole cart. */
  useEffect(() => {
    if (!key) return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return
      setLines(parseCart(e.newValue))
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [key])

  const add = useCallback((line: CartLine) => {
    setLines((current) => addLine(current, line))
    setOpen(true)
  }, [])

  const setQty = useCallback((k: string, quantity: number) => {
    setLines((current) => setQuantity(current, k, quantity))
  }, [])

  const remove = useCallback((k: string) => {
    setLines((current) => removeLine(current, k))
  }, [])

  const clear = useCallback(() => setLines([]), [])

  const value = useMemo<SiteCartValue>(() => ({
    lines,
    ready,
    count: cartCount(lines),
    subtotalCents: cartSubtotalCents(lines),
    open,
    setOpen,
    add,
    setQty,
    remove,
    clear,
    live: !!shopId,
    shopId: shopId ?? null,
  }), [lines, ready, open, add, setQty, remove, clear, shopId])

  return <SiteCartContext.Provider value={value}>{children}</SiteCartContext.Provider>
}

export { lineKey }
export type { CartLine }
