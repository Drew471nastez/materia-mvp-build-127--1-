"use client"

import { useEffect } from "react"
import { readCartExtras, writeCartExtras } from "@/lib/website-builder/cart-extras"

/** Keeps the link's code with this browser's cart (the note kept as it was), then goes on to the page the link names, in place of this one in the history. */
export function DiscountLinkKeep({ shopId, code, to }: { shopId: string; code: string | null; to: string }) {
  useEffect(() => {
    if (code) writeCartExtras(shopId, { code, note: readCartExtras(shopId).note })
    window.location.replace(to)
  }, [shopId, code, to])
  return <div className="min-h-[40vh]" aria-busy="true" />
}
