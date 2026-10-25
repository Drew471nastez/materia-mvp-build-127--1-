"use client"

import { buyerProperties } from "@/lib/physical/cart-link"
import { readUploadValue } from "@/lib/cart-uploads/rules"

/**
 * What the buyer wrote or sent for a cart line on the product page's
 * Personalization block, under the line in the cart drawer and on the cart
 * page: "Name: Ana", and a picture by its file name with a small copy of it
 * (its value opens only in this browser, lib/cart-uploads/http.ts).
 */
export function CartLineProperties({ properties, className }: { properties?: Record<string, string>; className?: string }) {
  const raw = Object.entries(properties ?? {}).filter(([k]) => !k.startsWith("_"))
  if (!raw.length) return null
  const shown = buyerProperties(properties)
  return (
    <dl className={className ?? "mt-0.5 space-y-0.5 text-[12px] opacity-70"} data-cart-line-properties="">
      {raw.slice(0, 10).map(([k, v], i) => (
        <div key={k} className="flex min-w-0 items-center gap-1">
          <dt className="shrink-0">{k}:</dt>
          <dd className="flex min-w-0 items-center gap-1.5">
            {readUploadValue(v) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v} alt="" width={20} height={20} className="h-5 w-5 shrink-0 rounded-[4px] object-cover" referrerPolicy="no-referrer" />
            ) : null}
            <span className="min-w-0 truncate">{shown[i]?.[1] ?? v}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
