"use client"

/**
 * ===========================================================================
 *  THE SHOP'S DELIVERY AND RETURNS FACTS, ON ITS WEBSITE
 * ===========================================================================
 * The free shipping banner, the cart's returns line and the refund policy's
 * returns paragraph say what the store's own settings say (Settings ›
 * Shipping and delivery, Settings › Returns and refunds), read once a page
 * from /api/physical/storefront/shop. Nothing is fetched unless one of them
 * is switched on in Website settings › Commerce, and nothing is drawn when
 * the store has no physical selling: the answer is then a 404.
 */
import { useEffect, useState } from "react"
import { useStorefront } from "./storefront-context"
import { returnFactsHtml, returnsLine } from "@/lib/website-builder/site-commerce"

export interface ShopCommerceFacts {
  returns: { enabled: boolean; windowDays: number } | null
  freeShippingFromCents: number | null
}

const cache = new Map<string, Promise<ShopCommerceFacts | null>>()

function load(key: string, url: string): Promise<ShopCommerceFacts | null> {
  let p = cache.get(key)
  if (!p) {
    p = fetch(url, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<ShopCommerceFacts>) : null))
      .catch(() => null)
    cache.set(key, p)
  }
  return p
}

/** The facts for the site being drawn: the visitor's shop, or the owner's own in the builder. Null until read, or when there are none. */
export function useShopCommerce(wanted: boolean): ShopCommerceFacts | null {
  const { creatorId, inEditor } = useStorefront()
  const [facts, setFacts] = useState<ShopCommerceFacts | null>(null)
  useEffect(() => {
    if (!wanted) return
    const key = inEditor ? "mine" : creatorId
    if (!key) return
    let live = true
    void load(key, inEditor ? "/api/physical/storefront/shop?mine=1" : `/api/physical/storefront/shop?shopId=${encodeURIComponent(key)}`).then((f) => live && setFacts(f))
    return () => {
      live = false
    }
  }, [wanted, creatorId, inEditor])
  return facts
}

/** "Returns accepted within 30 days of delivery. Return policy": beside Check out, when Website settings › Commerce asks for it. */
export function CartReturnsNote({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const on = useStorefront().commerce?.cartReturnsNote === true
  const facts = useShopCommerce(on)
  const line = on ? returnsLine(facts?.returns) : null
  if (!line) return null
  return (
    <p className={className} style={style} data-cart-returns="">
      {line}{" "}
      <a href="/refund-policy" className="underline underline-offset-2">
        Return policy
      </a>
    </p>
  )
}

/** The refund policy page's returns paragraph, from the store's settings today, under what the seller wrote. */
export function ReturnFacts() {
  const { pageKey } = useStorefront()
  const facts = useShopCommerce(pageKey === "refund-policy")
  const html = returnFactsHtml(facts?.returns)
  if (!html) return null
  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-14 text-[15px] leading-relaxed" style={{ color: "var(--theme-text)" }} data-return-facts="" dangerouslySetInnerHTML={{ __html: html }} />
  )
}
