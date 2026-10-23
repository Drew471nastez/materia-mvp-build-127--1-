/**
 * ===========================================================================
 *  THE CART'S CODE AND NOTE, KEPT BESIDE ITS LINES
 * ===========================================================================
 * A Storelib theme's cart page takes a discount code and a note for the
 * shop. Both lived in the page's memory, so a reload, or going on to the
 * checkout from the drawer instead, lost them. They are kept in this browser
 * beside the cart's lines (lib/website-builder/cart cartStorageKey), read
 * back by the cart page and carried on by the drawer's Check out, and gone
 * with the lines once the cart is an order.
 *
 * Every read and write is guarded: a private window or blocked site data is
 * a cart without them, never a broken shop.
 */
import { CART_NOTE_MAX } from "@/lib/checkout/site-checkout"
import { cartStorageKey } from "./cart"

export interface CartExtras {
  code: string
  note: string
}

export function cartExtrasKey(shopId: string): string {
  return `${cartStorageKey(shopId)}:extras`
}

/** What was kept, each part held to what the checkout takes. */
export function parseCartExtras(raw: string | null | undefined): CartExtras {
  try {
    const v = raw ? (JSON.parse(raw) as { code?: unknown; note?: unknown }) : null
    const code = typeof v?.code === "string" ? v.code.trim().slice(0, 64) : ""
    const note = typeof v?.note === "string" ? v.note.slice(0, CART_NOTE_MAX) : ""
    return { code, note }
  } catch {
    return { code: "", note: "" }
  }
}

export function readCartExtras(shopId: string | null | undefined): CartExtras {
  if (!shopId) return { code: "", note: "" }
  try {
    return parseCartExtras(window.localStorage.getItem(cartExtrasKey(shopId)))
  } catch {
    return { code: "", note: "" }
  }
}

export function writeCartExtras(shopId: string | null | undefined, extras: CartExtras): void {
  if (!shopId) return
  try {
    const kept = parseCartExtras(JSON.stringify(extras))
    if (!kept.code && !kept.note.trim()) window.localStorage.removeItem(cartExtrasKey(shopId))
    else window.localStorage.setItem(cartExtrasKey(shopId), JSON.stringify(kept))
  } catch {
    /* Not kept: the page still has them until it is left. */
  }
}
