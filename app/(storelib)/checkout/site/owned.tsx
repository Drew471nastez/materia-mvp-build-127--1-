"use client"

/**
 * ===========================================================================
 *  ALREADY YOURS, ON A WEBSITE'S CHECKOUT
 * ===========================================================================
 * What the website's checkout (./site-checkout.tsx) says about downloads the
 * buyer already has, the way Gumroad and Payhip say it:
 *
 *   SiteOwned    the whole cart is already theirs: no form, no total, the
 *                way to the files ("Go to your downloads", the website's own
 *                /account) and back to the shop
 *   OwnedNote    some of it is: those lines are left out of the payment and
 *                named, with the same way to them, and the rest is paid for
 *
 * A guest who bought before gets "Email me my link" (../parts/access-link),
 * whose answer is the same whatever the email (lib/checkout/access-link).
 *
 * Only a customer signed in to the website is ever told "already yours"
 * (their email is proven by a sign in code). Physical products are never
 * "owned": buying another is normal.
 */

import { Check, ShoppingBag } from "lucide-react"
import type { SiteOwnedLine } from "@/lib/checkout/site-quote-server"
import { ShopBar, type ShopBrand } from "../parts/shop-bar"
import { useCt } from "../parts/words"

function Thumb({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-12 w-12 shrink-0 rounded-[8px] border border-black/[0.06] bg-[#f3f4f6] object-cover" />
  ) : (
    <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-[8px] border border-black/[0.06] bg-[#f3f4f6]">
      <ShoppingBag className="h-5 w-5 text-[#b8bcc4]" strokeWidth={1.5} />
    </span>
  )
}

export function SiteOwned({ brand, backTo, shopUrl, owned, accountUrl }: { brand: ShopBrand; backTo: string; shopUrl: string; owned: SiteOwnedLine[]; accountUrl: string }) {
  const ct = useCt()
  const one = owned.length === 1
  return (
    <div data-page="checkout" data-site-checkout="" className="min-h-dvh bg-[#f8f9fa]">
      <ShopBar brand={brand} backTo={backTo} shopUrl={shopUrl} />
      <main data-checkout-owned="" className="mx-auto flex min-h-[60vh] max-w-[440px] flex-col justify-center px-5 py-12">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">{one ? ct("You already own this") : ct("You already own these")}</h1>
        <p className="mt-1.5 text-[14.5px] leading-6 text-[#6b7280]">
          {one ? ct("It's in your downloads, so there's nothing to pay.") : ct("They're in your downloads, so there's nothing to pay.")}
        </p>
        <ul className="mt-6 divide-y divide-black/[0.06] rounded-[12px] border border-black/[0.06] bg-white">
          {owned.map((o) => (
            <li key={`${o.productId}:${o.variantId ?? ""}`} className="flex items-center gap-3 px-3.5 py-3">
              <Thumb src={o.imageUrl} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[#1a1a2e]">{o.title}</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] text-[#15803d]">
                <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
                {ct("Yours")}
              </span>
            </li>
          ))}
        </ul>
        <a href={accountUrl} data-owned-primary="" className="mt-6 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#1a1a2e] px-4 text-[15px] font-medium text-white transition-colors hover:bg-[#2a2a40]">
          {ct("Go to your downloads")}
        </a>
        <a href={shopUrl} className="mt-3 inline-flex h-10 items-center justify-center text-[14px] font-medium text-[#4b5563] underline decoration-[#c9ccd2] underline-offset-4 hover:text-[#1a1a2e]">
          {ct("Continue shopping")}
        </a>
      </main>
    </div>
  )
}

export function OwnedNote({ owned, accountUrl }: { owned: SiteOwnedLine[]; accountUrl: string }) {
  const ct = useCt()
  if (owned.length === 0) return null
  const names = owned.slice(0, 3).map((o) => o.title)
  const more = owned.length - names.length
  return (
    <p role="status" data-checkout-owned-note="" className="mb-5 rounded-[8px] border border-[#d1fae5] bg-[#f0fdf4] px-3.5 py-2.5 text-[13.5px] leading-[20px] text-[#166534]">
      {owned.length === 1 ? ct("You already own {items}, so it's not in this order.", { items: names[0] }) : more > 0 ? ct("You already own {items} and {count} more, so they're not in this order.", { items: names.join(", "), count: more }) : ct("You already own {items}, so they're not in this order.", { items: names.join(", ") })}{" "}
      <a href={accountUrl} className="font-medium underline underline-offset-2">
        {ct("Go to your downloads")}
      </a>
    </p>
  )
}
