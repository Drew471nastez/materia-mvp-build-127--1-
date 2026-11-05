"use client"

import * as React from "react"
import { cartStorageKey } from "@/lib/website-builder/cart"

/** The whole cart became this order: a built site's cart leaves this browser, and the address loses the flag. */
export function ClearCart({ shopId }: { shopId: string }) {
  React.useEffect(() => {
    try {
      window.localStorage.removeItem(cartStorageKey(shopId))
    } catch {
      /* nothing kept to clear */
    }
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete("cart")
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    } catch {
      /* the address keeps it; harmless */
    }
  }, [shopId])
  return null
}
