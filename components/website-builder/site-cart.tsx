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
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { CLEAR_CART_PARAM } from "@/lib/checkout/basket-link"
import { cartExtrasKey } from "@/lib/website-builder/cart-extras"
import { trackFunnelStep } from "@/lib/analytics-utils"
import { noteLive } from "@/lib/live/live-client"
import {
  addAllLines,
  addLine,
  cartCount,
  cartNeedsReprice,
  cartStorageKey,
  cartSubtotalCents,
  lineKey,
  parseCart,
  repricedLines,
  removeLine,
  serializeCart,
  setQuantity,
  type CartLine,
  type LinePrice,
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
  /** Several lines at once, all or none (addAllLines): false when the basket could not take every one, and nothing changed. */
  addAll: (lines: CartLine[]) => boolean
  setQty: (key: string, quantity: number) => void
  remove: (key: string) => void
  clear: () => void
  /** Whether this cart can reach a checkout. False inside the editor. */
  live: boolean
  /** The shop this cart belongs to, for the physical checkout's address. */
  shopId: string | null
  /** The line just added, while Theme settings › Cart type is Notification and the notice is up. */
  notice: CartLine | null
  dismissNotice: () => void
}

/**
 * THEME SETTINGS › CART › CART TYPE, Shopify's three answers to "what
 * happens when somebody presses Add to cart":
 *
 *   drawer        the cart opens over the page (what it always did)
 *   page          the visitor is taken to /cart, once the line is saved
 *   notification  a short notice says what was added, with View cart, and
 *                 the visitor stays where they were
 *
 * In the builder there is no /cart to go to, so Page opens the drawer there.
 */
export type CartType = "drawer" | "page" | "notification"

const EMPTY: SiteCartValue = {
  lines: [],
  ready: false,
  count: 0,
  subtotalCents: 0,
  open: false,
  setOpen: () => {},
  add: () => {},
  addAll: () => false,
  setQty: () => {},
  remove: () => {},
  clear: () => {},
  live: false,
  shopId: null,
  notice: null,
  dismissNotice: () => {},
}

const SiteCartContext = createContext<SiteCartValue>(EMPTY)

export function useSiteCart(): SiteCartValue {
  return useContext(SiteCartContext)
}

export function SiteCartProvider({ shopId, cartType = "drawer", currency, children }: { shopId?: string; cartType?: CartType; /** The store's currency (Settings › Languages & Currency): every line's price is in it. */ currency?: string; children: ReactNode }) {
  const storeCurrency = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null
  const [lines, setLines] = useState<CartLine[]>([])
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<CartLine | null>(null)
  /* Set by Add to cart under the Page type: go to /cart once the line is written, never before. */
  const goToCart = useRef(false)
  const key = shopId ? cartStorageKey(shopId) : null

  /* Writes are skipped until the read has happened, or the empty first
     render would overwrite a cart that was already there. */
  const loaded = useRef(false)

  /* Marked non-urgent (startTransition): an urgent update at hydration reaches
     lazy sections whose code has not arrived yet, and React then throws their
     server HTML away and draws it again, which shifts the page (CLS). */
  useEffect(() => {
    if (!key) { startTransition(() => setReady(true)); return }
    try {
      /* Back from paying for this whole cart (lib/checkout/basket-link): it is an order now, so the bag is empty. */
      const url = new URL(window.location.href)
      if (url.searchParams.get(CLEAR_CART_PARAM) === "clear") {
        url.searchParams.delete(CLEAR_CART_PARAM)
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
        window.localStorage.removeItem(key)
        if (shopId) window.localStorage.removeItem(cartExtrasKey(shopId))
      }
      const kept = parseCart(window.localStorage.getItem(key))
      if (kept.length > 0) startTransition(() => setLines(kept))
      /*
        PRICED IN ANOTHER CURRENCY. The store converted its currency since
        these lines were added (or they were saved before lines said which):
        their numbers are the old currency's. Priced again once from the
        server rather than shown with the new currency's mark; the lines
        then say the currency, so it is not asked again.
      */
      if (shopId && storeCurrency && cartNeedsReprice(kept, storeCurrency)) {
        void fetch("/api/cart/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId, items: kept.map((l) => ({ productId: l.productId, variantId: l.variantId })) }),
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ currency?: string; lines?: LinePrice[] }>) : null))
          .then((d) => {
            if (d && typeof d.currency === "string" && Array.isArray(d.lines)) {
              const priced = d.lines
              const at = d.currency
              setLines((now) => repricedLines(now, priced, at))
            }
          })
          .catch(() => {
            /* Shown as kept; checkout prices the order again whatever the cart said. */
          })
      }
    } catch {
      /* Private mode, blocked site data, a quota error on read: an empty
         cart is the right answer and a broken shop is not. */
    }
    loaded.current = true
    startTransition(() => setReady(true))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!key || !loaded.current) return
    try {
      window.localStorage.setItem(key, serializeCart(lines))
      /* An empty cart keeps no code or note for the next one (lib/website-builder/cart-extras). */
      if (lines.length === 0 && shopId) window.localStorage.removeItem(cartExtrasKey(shopId))
    } catch {
      /* Out of quota or storage refused. The cart still works for this
         page; it just will not survive a reload. */
    }
    if (goToCart.current) {
      goToCart.current = false
      window.location.assign("/cart")
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
    /* Said in the store's currency it was priced in, so a change of currency later prices it again (cartNeedsReprice). */
    setLines((current) => addLine(current, storeCurrency ? { ...line, currency: storeCurrency } : line))
    /*
      ADDED TO CART, FOR ANALYTICS: every way into the bag (a product
      section, a quick add, a theme's own button) comes through here, so the
      step is recorded once here (buy_click, once per visit and product on the
      server). Not in the editor, where there is no shop id.
    */
    if (shopId && line.productId) void trackFunnelStep("buy_click", shopId, line.productId)
    /* And for /admin's Live view (round 62): that something went into a bag, nothing about what. Not in the editor. */
    if (shopId) noteLive("cart.add")
    if (cartType === "page" && shopId) goToCart.current = true
    else if (cartType === "notification") setNotice(line)
    else setOpen(true)
  }, [cartType, shopId, storeCurrency])

  /* The basket as it is now, for an add that has to know at once whether every line went in. */
  const linesNow = useRef(lines)
  linesNow.current = lines
  const addAll = useCallback((incoming: CartLine[]) => {
    if (incoming.length === 0) return true
    const priced = storeCurrency ? incoming.map((l) => ({ ...l, currency: storeCurrency })) : incoming
    const next = addAllLines(linesNow.current, priced)
    if (!next) return false
    linesNow.current = next
    setLines(next)
    if (shopId) for (const id of new Set(incoming.map((l) => l.productId))) if (id) void trackFunnelStep("buy_click", shopId, id)
    if (cartType === "page" && shopId) goToCart.current = true
    else if (cartType === "notification") setNotice(incoming[0])
    else setOpen(true)
    return true
  }, [cartType, shopId, storeCurrency])

  const dismissNotice = useCallback(() => setNotice(null), [])

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
    addAll,
    setQty,
    remove,
    clear,
    live: !!shopId,
    shopId: shopId ?? null,
    notice,
    dismissNotice,
  }), [lines, ready, open, add, addAll, setQty, remove, clear, shopId, notice, dismissNotice])

  return <SiteCartContext.Provider value={value}>{children}</SiteCartContext.Provider>
}

export { lineKey }
export type { CartLine }
