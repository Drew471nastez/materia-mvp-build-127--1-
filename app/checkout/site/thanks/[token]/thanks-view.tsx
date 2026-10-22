/**
 * The thank you page's own markup (./page.tsx reads the order and the shop):
 * the order, its number and day, what was bought and paid, where it goes and
 * how, and the way to the order page and back to the shop. Reads nothing
 * itself, so a probe draws the same markup with an order of its own
 * (scripts/render-buyer27.tsx).
 */
import { Check } from "lucide-react"
import { ProductImg } from "@/components/media/missing-image"
import { addressLines } from "@/lib/physical/address"
import { deliveryEstimate } from "@/lib/physical/rates"
import { PLATFORM_CURRENCY } from "@/lib/checkout/currency"
import { currencyCode, formatMinor } from "@/lib/markets/money"
import { checkoutT } from "@/lib/markets/checkout-words"
import { optionKey, valueFor, type TranslationMap } from "@/lib/markets/translate"
import { estimateText } from "@/lib/checkout/estimate-text"
import type { GaItem } from "@/lib/store/ga"

export interface Line {
  /** For its title in the page's language (`product:<id>:title`). */
  productId?: string
  title: string
  variantName: string | null
  imageUrl: string | null
  quantity: number
  cents: number
  /** Each, before the line's discount: "2 × 45.00", and the price struck through when a discount took some off. */
  unitCents?: number
}

export interface Summary {
  email: string | null
  firstName: string | null
  lines: Line[]
  totalCents: number
  shippingCents: number | null
  taxCents: number
  shipTo: string | null
  /** Picked up: where, said in the page's language. */
  pickupAt?: string | null
  receipt: string
  /** To be paid in cash when it arrives (lib/physical/cash-on-delivery.ts): "delivered" or "picked up", or null when it was paid. */
  cashWhen?: "delivered" | "picked up" | null
  /** For the store's Google Analytics purchase: the order's own id (never the token, which is a credential) and what was bought. */
  ga: { id: string; items: GaItem[]; currency: string | null }
  /** An order that ships: its number and day, its sums before the total, where it goes and how, and how it is paid. */
  shipped?: {
    number: string
    placedAt: string | null
    subtotalCents: number
    discountCents: number
    coupon: string | null
    address: Record<string, unknown> | null
    method: { name: string; minDays: number | null; maxDays: number | null; local: boolean; note: string | null } | null
  }
}

export function ThanksView({ order, shopUrl, lang, words, map }: { order: Summary; shopUrl: string; lang: string; words: Record<string, string>; map: TranslationMap | null }) {
  const ships = order.shippingCents !== null
  /* In the currency the order was charged in (the checkout's own), as the receipt and the order page write it. */
  const orderCurrency = currencyCode(order.ga.currency)
  const ct = checkoutT(lang, words)
  /* Written the page language's way ("62,05 lei" in Romanian), as the checkout and the order page write it. */
  const locale = lang === "en" ? "en-US" : lang
  /* An order row that kept no currency is in the platform's; never a client module's helper here, which a server page cannot call. */
  const shown = (cents: number) => formatMinor(cents, orderCurrency ?? PLATFORM_CURRENCY.toUpperCase(), locale)
  const placed = order.shipped?.placedAt ? new Date(order.shipped.placedAt).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" }) : null
  const method = order.shipped?.method ?? null
  const estimate = method && !method.local ? deliveryEstimate(method) : ""
  /* A line's title and its option's name in the page's language, as the checkout showed them (lib/markets/checkout-quote.ts). */
  const titleOf = (l: Line) => (l.productId && map ? (valueFor(map, `product:${l.productId}:title`, { approvedOnly: true, fresh: true }, l.title) ?? ct(l.title)) : ct(l.title))
  const nameOf = (n: string) => (map ? n.split(" / ").map((p) => valueFor(map, optionKey(p.trim()), { approvedOnly: true, fresh: true }, p.trim()) ?? p).join(" / ") : n)
  return (
    <main className="mx-auto w-full max-w-[560px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      <div className="checkout-enter">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[#1a1a2e] text-white shadow-[0_1px_2px_rgba(17,17,19,0.2)]">
          <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </span>
        {order.shipped ? (
          <p className="mt-4 text-[13px] font-medium text-[#6b7280]" data-order-number="">
            {ct("Order {number}", { number: order.shipped.number })}
            {placed ? ` · ${placed}` : ""}
          </p>
        ) : null}
        <h1 className={`${order.shipped ? "mt-1" : "mt-4"} text-[24px] font-semibold tracking-[-0.01em] text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[28px]`}>{order.firstName ? ct("Thank you, {name}", { name: order.firstName }) : ct("Thank you for your order")}</h1>
        <p className="mt-1.5 text-[14.5px] leading-6 text-[#6b7280]">
          {order.email ? ct("Your receipt is on its way to {email}.", { email: order.email }) : ct("Your receipt is on its way to your email.")}
          {ships ? ` ${ct("We'll email you when it ships.")}` : ""}
        </p>

        <section aria-label={ct("Your order")} className="mt-7 rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <ul className="space-y-4">
            {order.lines.map((l, i) => (
              <li key={i} className="flex items-start gap-3.5">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-black/[0.06] bg-white">
                  <ProductImg src={l.imageUrl} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">{titleOf(l)}</p>
                  <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{[l.variantName ? nameOf(l.variantName) : null, ct("Qty {quantity}", { quantity: l.quantity })].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="shrink-0 text-right">
                  {/* Before the line's discount, struck through; each one's price when there are several. */}
                  {l.unitCents !== undefined && l.unitCents * l.quantity > l.cents ? <p className="text-[12.5px] tabular-nums text-[#9ca3af] line-through">{shown(l.unitCents * l.quantity)}</p> : null}
                  <p className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{l.cents === 0 ? ct("Free") : shown(l.cents)}</p>
                  {l.unitCents !== undefined && l.quantity > 1 && l.unitCents * l.quantity === l.cents ? <p className="text-[12.5px] tabular-nums text-[#6b7280]">{l.quantity} × {shown(l.unitCents)}</p> : null}
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-5 space-y-2 border-t border-black/[0.07] pt-4 text-[14px]">
            {order.shipped ? (
              <div className="flex justify-between gap-4">
                <dt className="text-[#6b7280]">{ct("Subtotal")}</dt>
                <dd className="tabular-nums text-[#6b7280]">{shown(order.shipped.subtotalCents)}</dd>
              </div>
            ) : null}
            {order.shipped && order.shipped.discountCents > 0 ? (
              <div className="flex justify-between gap-4" data-discount="">
                <dt className="text-[#6b7280]">{order.shipped.coupon ? ct("Discount ({code})", { code: order.shipped.coupon }) : ct("Discount")}</dt>
                <dd className="tabular-nums text-[#6b7280]">-{shown(order.shipped.discountCents)}</dd>
              </div>
            ) : null}
            {ships ? (
              <div className="flex justify-between gap-4">
                <dt className="text-[#6b7280]">{ct("Shipping")}</dt>
                <dd className="tabular-nums text-[#6b7280]">{order.shippingCents === 0 ? ct("Free") : shown(order.shippingCents ?? 0)}</dd>
              </div>
            ) : null}
            {order.taxCents > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-[#6b7280]">{ct("Tax")}</dt>
                <dd className="tabular-nums text-[#6b7280]">{shown(order.taxCents)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-4 pt-1">
              <dt className="text-[15px] font-semibold text-[#1a1a2e]">{ct("Total")}</dt>
              <dd className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{shown(order.totalCents)}</dd>
            </div>
          </dl>
          {/* Where it goes and how, each on its own line: the address, the method, then its estimate. */}
          {order.shipped?.address || method ? (
            <div className="mt-5 grid gap-4 border-t border-black/[0.07] pt-4 text-[14px] leading-[21px] sm:grid-cols-2" data-thanks-delivery="">
              {order.shipped?.address ? (
                <div className="min-w-0">
                  <p className="font-medium text-[#1a1a2e]">{ct("Shipping address")}</p>
                  <p className="mt-1 text-[#4b5563] [overflow-wrap:anywhere]">
                    {addressLines(order.shipped.address as never).map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </p>
                </div>
              ) : null}
              {method ? (
                <div className="min-w-0">
                  <p className="font-medium text-[#1a1a2e]">{method.local ? ct("Delivery") : ct("Shipping method")}</p>
                  <p className="mt-1 text-[#4b5563]">{ct(method.name)}</p>
                  {estimate ? <p className="text-[13px] text-[#6b7280]">{ct("Usually arrives {estimate} after it ships.", { estimate: estimateText(ct, estimate) })}</p> : null}
                  {method.local && method.note ? <p className="text-[13px] text-[#6b7280]">{method.note}</p> : null}
                </div>
              ) : null}
            </div>
          ) : order.shipTo ? <p className="mt-4 text-[13.5px] text-[#4b5563]">{order.shipTo}</p> : null}
          {order.pickupAt !== null && order.pickupAt !== undefined ? <p className="mt-4 text-[13.5px] text-[#4b5563]">{order.pickupAt ? ct("Pick up at {place}", { place: order.pickupAt }) : ct("Pick up at the shop")}</p> : null}
          {order.cashWhen ? (
            <p data-cash-payment="" className="mt-3 rounded-[8px] bg-[#f8f9fa] px-3.5 py-2.5 text-[14px] leading-5 text-[#4b5563]">
              {order.cashWhen === "picked up" ? ct("Pay {amount} in cash when you pick it up.", { amount: shown(order.totalCents) }) : ct("Pay {amount} in cash when it's delivered.", { amount: shown(order.totalCents) })}
            </p>
          ) : null}
        </section>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <a href={order.receipt} data-receipt-link="" className="inline-flex h-11 w-full items-center sm:w-auto sm:flex-1 justify-center rounded-[8px] bg-[#1a1a2e] px-4 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_1px_rgba(0,0,0,0.12)] hover:bg-[#262640]">
            {ships ? ct("View your order") : ct("View receipt and downloads")}
          </a>
          <a href={shopUrl} data-continue="" className="inline-flex h-11 w-full items-center sm:w-auto sm:flex-1 justify-center rounded-[8px] border border-[#e1e3e7] bg-white px-4 text-[15px] font-medium text-[#1a1a2e] hover:bg-[#fafafb]">
            {ct("Continue shopping")}
          </a>
        </div>
      </div>
    </main>
  )
}
