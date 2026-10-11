"use client"

/**
 * ===========================================================================
 *  THE PHYSICAL CHECKOUT: CONTACT, DELIVERY, PAY
 * ===========================================================================
 * One page, like the big platforms: contact and address on the left, the
 * order on the right (on a phone, a summary that opens at the top). Every
 * number shown comes from /api/physical/checkout/quote, asked again when the
 * cart, the country, the region, the code or the delivery option changes.
 * When the shop offers local pickup for everything in the cart, the buyer
 * picks Ship or Pick up first; picking up needs no address. Where nothing
 * ships to the address, the page says so and Pay stays off.
 * Pay sends ids, the address and the chosen option; the server prices it
 * all again, holds the stock and makes the payment. A failed attempt makes a
 * new key, so the next one is a new checkout.
 *
 * THE PAYMENT STAYS ON THIS PAGE. Pay used to open Stripe's hosted page,
 * with none of the shop on it. Now the page turns to its payment step: the
 * shop's bar stays (./parts/shop-bar), a line says where it is going and
 * how, with Change, and Stripe's form opens under it (Embedded Checkout)
 * with the order, the delivery and the tax as the server priced them.
 * Change lets go of that checkout's stock at once (abandonCheckout) and
 * brings the form back. In the app's shell, where Stripe.js cannot run,
 * Pay opens Stripe's own page as before.
 */

import * as React from "react"
import { DEFAULT_CHECKOUT, type CheckoutConfig } from "@/lib/store/checkout-config"
import { ChevronDown, Lock, MapPin, Minus, Plus, ShoppingBag, Tag, Trash2, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/checkout/countries"
import { cartStorageKey, parseCart, serializeCart, type CartLine } from "@/lib/website-builder/cart"
import { decodeItems, type LinkItem } from "@/lib/physical/cart-link"
import { postalCodeRequired } from "@/lib/physical/address"
import { postalKey } from "@/lib/physical/local-delivery"
import { regionsOf } from "@/lib/physical/regions"
import { addressFormat } from "@/lib/address/format"
import { countryName } from "@/lib/checkout/countries"
import { actionKey } from "@/components/physical/ui"
import { CheckoutSuggestions, type Suggestion } from "@/components/offers/checkout-suggestions"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { getStripePromise, isCapacitorShell } from "../parts/stripe-loader"
import { backThen } from "@/lib/navigation/go-back"
import { ShopBar, type ShopBrand } from "../parts/shop-bar"
import { CHECKOUT_CURRENCY, money as sharedMoney } from "../parts/ui"

interface QuoteLine {
  productId: string
  variantId: string | null
  title: string
  variantName: string | null
  imageUrl: string | null
  type: string
  quantity: number
  unitCents: number
  discountCents: number
  requiresShipping: boolean
}
interface Quote {
  creatorId: string
  lines: QuoteLine[]
  dropped: string[]
  stockIssues: { productId: string; variantId: string | null; title: string; available: number }[]
  requiresShipping: boolean
  coupon: { code: string; label: string | null; freeShipping: boolean } | null
  couponError: string | null
  delivery: { ok: boolean; error?: string; options: { id: string; name: string; priceCents: number; estimate: string }[]; selectedId: string | null; needsCountry: boolean }
  pickups?: { id: string; name: string; address: string[]; instructions: string | null; ready: string | null }[]
  totals: { itemsSubtotalCents: number; discountCents: number; shippingCents: number; shippingDiscountCents: number; taxCents: number; taxIncluded: boolean; totalCents: number }
  /* The store's upsells and bundles (lib/offers): what this cart got, and what it could add. */
  offers?: { title: string; savedCents: number }[]
  suggestions?: Suggestion[]
}

const INPUT =
  "h-12 w-full rounded-[10px] border border-[#d9dce1] bg-white px-3.5 text-[15px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:ring-[3px] focus:ring-[rgba(26,26,46,0.08)] aria-[invalid=true]:border-[#dc2626]"

/*
  THE NAME STAYS IN THE FIELD. A placeholder disappears with the first letter,
  and a filled form became a column of values nobody could tell apart (is that
  the city or the region?). The label sits in the field and moves up, small,
  once something is in it or it has focus, as a store's checkout does on
  Shopify. Pure CSS (the input's own placeholder, kept invisible, tells it).
*/
const FLOAT_INPUT = `${INPUT} peer h-[52px] pt-[17px] placeholder:text-transparent`
const FLOAT_LABEL =
  "pointer-events-none absolute left-3.5 right-3.5 top-1/2 -translate-y-1/2 truncate text-[15px] text-[#9ca3af] transition-[top,font-size,transform,color] duration-150 ease-out peer-focus:top-[8px] peer-focus:translate-y-0 peer-focus:text-[11.5px] peer-focus:text-[#6b7280] peer-[:not(:placeholder-shown)]:top-[8px] peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11.5px] peer-[:not(:placeholder-shown)]:text-[#6b7280]"
const FLOAT_SELECT = `${INPUT} h-[52px] appearance-none pr-10 pt-[17px] data-[empty=true]:pt-0 data-[empty=true]:text-transparent`
const FLOAT_SELECT_LABEL =
  "pointer-events-none absolute left-3.5 right-10 top-[8px] truncate text-[11.5px] text-[#6b7280] transition-[top,font-size,transform] duration-150 ease-out data-[empty=true]:top-1/2 data-[empty=true]:-translate-y-1/2 data-[empty=true]:text-[15px] data-[empty=true]:text-[#9ca3af]"

/* The charged currency, as every checkout shows it (../parts/ui money, PLATFORM_CURRENCY). */
const money = sharedMoney

function guessCountry(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    return region && COUNTRIES.some((c) => c.code === region) ? region : ""
  } catch {
    return ""
  }
}

export function PhysicalCheckout({
  shopId,
  shopName,
  brand,
  shopUrl = null,
  config = DEFAULT_CHECKOUT,
  buyer = { signedIn: true, confirmed: true },
  backTo = null,
}: {
  shopId: string | null
  shopName: string
  /** The shop across the top: its website's logo, or its photo beside its name (lib/checkout/brand-server). */
  brand?: ShopBrand
  /** The shop's website home, for its name and Continue shopping. */
  shopUrl?: string | null
  /** Where Back goes: the page the buyer came from, when it is one of this store's own sites (checked on the server). */
  backTo?: string | null
  /** The store's Settings › Checkout (lib/store/checkout-config): which fields are asked for, and whether an account comes first. */
  config?: CheckoutConfig
  buyer?: { signedIn: boolean; confirmed: boolean }
}) {
  const needsSignIn = config.requireAccount && !buyer.signedIn
  const needsConfirm = config.requireConfirmedEmail && buyer.signedIn && !buyer.confirmed
  const [first, setFirst] = React.useState("")
  const [last, setLast] = React.useState("")
  const [emailOptIn, setEmailOptIn] = React.useState(false)
  /* This page's own address, to come back to after signing in: read once mounted, so the server's HTML matches. */
  const [here, setHere] = React.useState("/checkout/physical")
  React.useEffect(() => setHere(window.location.pathname + window.location.search), [])
  const [items, setItems] = React.useState<LinkItem[] | null>(null)
  const [fromCart, setFromCart] = React.useState(false)
  const [backUrl, setBackUrl] = React.useState<string | null>(null)
  const [quote, setQuote] = React.useState<Quote | null>(null)
  const [quoteError, setQuoteError] = React.useState<string | null>(null)
  const [quoting, setQuoting] = React.useState(false)

  const [email, setEmail] = React.useState("")
  const [address, setAddress] = React.useState({ name: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "", phone: "", company: "" })
  /* First and last typed apart, sent as one name, the way every order reads a name. */
  React.useEffect(() => {
    if (config.nameFields !== "first_and_last") return
    setAddress((a) => ({ ...a, name: `${first.trim()} ${last.trim()}`.trim() }))
  }, [first, last, config.nameFields])
  const [optionId, setOptionId] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<"ship" | "pickup">("ship")
  const [codeOpen, setCodeOpen] = React.useState(false)
  const [code, setCode] = React.useState("")
  const [appliedCode, setAppliedCode] = React.useState<string | null>(null)
  const [note, setNote] = React.useState("")
  const [summaryOpen, setSummaryOpen] = React.useState(false)
  const [paying, setPaying] = React.useState(false)
  const [payError, setPayError] = React.useState<{ message: string; field: string | null } | null>(null)
  const clientKey = React.useRef(actionKey())
  /* The payment step: Stripe's form for the checkout Pay made, inside this page. */
  const [payment, setPayment] = React.useState<{ clientSecret: string } | null>(null)
  const [changing, setChanging] = React.useState(false)
  const bar = brand ?? { name: shopName, imageUrl: null, kind: null }

  /* The cart: from the address, else this browser's cart for the shop. */
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromLink = decodeItems(params.get("items"))
    if (backTo) setBackUrl(backTo)
    if (fromLink.length) {
      setItems(fromLink)
    } else if (shopId) {
      try {
        const lines = parseCart(window.localStorage.getItem(cartStorageKey(shopId)))
        setItems(lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, ...(typeof l.customPriceCents === "number" ? { customPriceCents: l.customPriceCents } : {}) })))
        setFromCart(true)
      } catch {
        setItems([])
      }
    } else setItems([])
    setAddress((a) => (a.country ? a : { ...a, country: guessCountry() }))
    const saved = window.sessionStorage?.getItem("storelib.physical.contact")
    if (saved) {
      try {
        const c = JSON.parse(saved)
        if (typeof c.email === "string") setEmail(c.email)
      } catch {
        /* Nothing saved. */
      }
    }
  }, [shopId, backTo])

  /* The server's prices, asked again when anything that changes them changes. The postal code counts once it names an area: it only decides local delivery. */
  const postalForQuote = postalKey(address.postalCode).length >= 3 ? postalKey(address.postalCode) : ""
  const ask = React.useRef(0)
  React.useEffect(() => {
    if (!items || !shopId) return
    if (items.length === 0) {
      setQuote(null)
      return
    }
    const n = ++ask.current
    setQuoting(true)
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/physical/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId, items, couponCode: appliedCode, country: address.country, region: address.region, postalCode: postalForQuote, deliveryOptionId: optionId, email }),
        })
        const data = await res.json().catch(() => ({}))
        if (n !== ask.current) return
        if (!res.ok) {
          setQuoteError(typeof data.error === "string" ? data.error : "Could not load your order.")
          setQuote(null)
        } else {
          setQuoteError(null)
          setQuote(data as Quote)
          if ((data as Quote).couponError) setAppliedCode(null)
          const got = data as Quote
          /* Picking up, and that point can no longer hand everything over: back to shipping. */
          if (mode === "pickup" && !(got.pickups ?? []).some((p) => p.id === optionId)) {
            const first = got.pickups?.[0]?.id ?? null
            if (first) setOptionId(first)
            else {
              setMode("ship")
              setOptionId(null)
            }
          } else if (mode === "ship" && got.delivery.selectedId !== optionId) setOptionId(got.delivery.selectedId)
        }
      } catch {
        if (n === ask.current) setQuoteError("Check your connection and try again.")
      } finally {
        if (n === ask.current) setQuoting(false)
      }
    }, 250)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, shopId, appliedCode, address.country, address.region, postalForQuote, optionId])

  /* A checkout offer taken: into the order, and the cart's too when the cart is where it came from. The server prices it again. */
  const addSuggestion = (sg: Suggestion, v: { id: string; name: string; priceCents: number } | null) => {
    const variantId = sg.product.type === "physical" ? (v?.id ?? null) : null
    setItems((prev) => (prev ? [...prev.filter((x) => !(x.productId === sg.product.id && (x.variantId ?? null) === variantId)), { productId: sg.product.id, variantId, quantity: 1 }] : prev))
    if (fromCart && shopId) {
      try {
        const key = cartStorageKey(shopId)
        const lines = parseCart(window.localStorage.getItem(key))
        const line: CartLine = { productId: sg.product.id, variantId, title: sg.product.title, variantName: v && sg.product.variants.length > 1 ? v.name : null, priceCents: v?.priceCents ?? sg.product.priceCents, thumbnailUrl: sg.product.imageUrl, slug: sg.product.slug, digital: sg.product.type !== "physical", physical: sg.product.type === "physical", quantity: 1 }
        window.localStorage.setItem(key, serializeCart([...lines, line]))
      } catch {
        /* The page still has it. */
      }
    }
  }

  /* A change here is the cart's too, when the cart is where it came from. */
  const changeQty = (i: number, q: number) => {
    setItems((prev) => {
      if (!prev) return prev
      const next = q <= 0 ? prev.filter((_, j) => j !== i) : prev.map((it, j) => (j === i ? { ...it, quantity: Math.min(999, q) } : it))
      if (fromCart && shopId) {
        try {
          const key = cartStorageKey(shopId)
          const lines = parseCart(window.localStorage.getItem(key))
          const kept: CartLine[] = []
          for (const l of lines) {
            const match = next.find((x) => x.productId === l.productId && (x.variantId ?? null) === (l.variantId ?? null))
            if (match) kept.push({ ...l, quantity: match.quantity })
          }
          window.localStorage.setItem(key, serializeCart(kept))
        } catch {
          /* The page still has it. */
        }
      }
      return next
    })
  }

  const pay = async () => {
    if (!quote || !shopId || !items) return
    setPaying(true)
    setPayError(null)
    try {
      window.sessionStorage?.setItem("storelib.physical.contact", JSON.stringify({ email }))
    } catch {
      /* Not kept. */
    }
    try {
      const res = await fetch("/api/physical/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          items,
          couponCode: appliedCode,
          email,
          name: address.name,
          phone: address.phone,
          address: quote.requiresShipping && mode === "ship" ? address : null,
          deliveryOptionId: optionId,
          buyerNote: note,
          emailOptIn: config.marketingOptIn ? emailOptIn : false,
          clientKey: clientKey.current,
          returnUrl: backUrl ?? window.location.href,
          /* Stripe's form inside this page; Stripe's own page in the app's shell, where Stripe.js cannot run. */
          ...(isCapacitorShell() ? {} : { ui: "embedded" }),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && typeof data.clientSecret === "string" && data.free !== true) {
        setPayment({ clientSecret: data.clientSecret })
        setPaying(false)
        /* The browser's Back from the payment step comes back to the form, as Change does. */
        try {
          window.history.pushState({ ...(window.history.state ?? {}), physicalStep: "payment" }, "")
        } catch {
          /* Back leaves the page, as before. */
        }
        window.scrollTo({ top: 0 })
        return
      }
      if (!res.ok || typeof data.url !== "string" || !data.url) {
        clientKey.current = actionKey()
        setPayError({ message: typeof data.error === "string" ? data.error : "Could not start the payment.", field: typeof data.field === "string" ? data.field : null })
        setPaying(false)
        if (res.status === 409) setItems((x) => (x ? [...x] : x))
        return
      }
      if (data.free === true && fromCart) {
        try {
          window.localStorage.removeItem(cartStorageKey(shopId))
        } catch {
          /* Left as it was. */
        }
      }
      window.location.href = data.url
    } catch {
      clientKey.current = actionKey()
      setPayError({ message: "Could not reach the checkout. Check your connection and try again.", field: null })
      setPaying(false)
    }
  }

  /* Back from the payment step: this checkout lets go of its stock, and the next Pay is a new one. */
  const change = async () => {
    setChanging(true)
    const key = clientKey.current
    clientKey.current = actionKey()
    await fetch("/api/physical/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "abandon", shopId, clientKey: key }) }).catch(() => null)
    setPayment(null)
    setChanging(false)
  }

  React.useEffect(() => {
    if (!payment) return
    const back = () => void change()
    window.addEventListener("popstate", back)
    return () => window.removeEventListener("popstate", back)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment])

  const missing = (() => {
    if (needsSignIn || needsConfirm) return "account"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "email"
    if (!quote?.requiresShipping) return null
    const nameOk = config.nameFields === "first_and_last" ? !!first.trim() && !!last.trim() : !!address.name.trim()
    if (mode === "pickup") return !nameOk ? "name" : config.phone === "required" && !address.phone.trim() ? "phone" : !optionId ? "delivery" : null
    if (!address.country) return "country"
    if (!nameOk) return "name"
    if (config.company === "required" && !address.company.trim()) return "company"
    if (!address.line1.trim()) return "line1"
    if (config.address2 === "required" && !address.line2.trim()) return "line2"
    if (!address.city.trim()) return "city"
    if (config.phone === "required" && !address.phone.trim()) return "phone"
    if (postalCodeRequired(address.country) && !address.postalCode.trim()) return "postalCode"
    if (!optionId) return "delivery"
    return null
  })()
  const canPay = !!quote && quote.lines.length > 0 && quote.stockIssues.length === 0 && !missing && !paying && !quoting

  const t = quote?.totals
  const summary = quote ? (
    <div className="space-y-4">
      <ul className="space-y-3">
        {quote.lines.map((l, i) => {
          const idx = items?.findIndex((x) => x.productId === l.productId && (x.variantId ?? null) === (l.variantId ?? null)) ?? i
          return (
            <li key={`${l.productId}:${l.variantId}`} className="flex items-start gap-3">
              <div className="relative shrink-0">
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt="" className="h-16 w-16 rounded-xl border border-[#e5e7eb] object-cover" />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-xl border border-[#e5e7eb] bg-[#f3f4f6]">
                    <ShoppingBag className="h-5 w-5 text-[#9ca3af]" />
                  </div>
                )}
                <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-[#6b7280] px-1 text-[11px] font-semibold text-white">{l.quantity}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{l.title}</p>
                {l.variantName ? <p className="text-[13px] text-[#6b7280]">{l.variantName}</p> : null}
                {l.type === "physical" && idx >= 0 ? (
                  <div className="mt-1.5 inline-flex h-8 items-center rounded-lg border border-[#e5e7eb]">
                    <button type="button" aria-label="Fewer" onClick={() => changeQty(idx, l.quantity - 1)} className="grid h-8 w-8 place-items-center text-[#4b5563]">
                      {l.quantity <= 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="w-6 text-center text-[13px] tabular-nums">{l.quantity}</span>
                    <button type="button" aria-label="More" onClick={() => changeQty(idx, l.quantity + 1)} className="grid h-8 w-8 place-items-center text-[#4b5563]">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{money(l.unitCents * l.quantity - l.discountCents)}</p>
                {l.discountCents > 0 ? <p className="text-[12px] tabular-nums text-[#9ca3af] line-through">{money(l.unitCents * l.quantity)}</p> : null}
              </div>
            </li>
          )
        })}
      </ul>

      <CheckoutSuggestions suggestions={quote.suggestions ?? []} onAdd={addSuggestion} busy={quoting} />

      <div className="border-t border-[#e5e7eb] pt-4">
        {appliedCode && quote.coupon ? (
          <div className="flex items-center justify-between rounded-lg bg-[#f3f4f6] px-3 py-2 text-[13.5px]">
            <span className="flex items-center gap-2 font-medium text-[#1a1a2e]">
              <Tag className="h-4 w-4" />
              {quote.coupon.code}
              <span className="font-normal text-[#6b7280]">{quote.coupon.label}</span>
            </span>
            <button type="button" className="text-[13px] font-medium text-[#6b7280] underline underline-offset-2" onClick={() => setAppliedCode(null)}>
              Remove
            </button>
          </div>
        ) : codeOpen ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) setAppliedCode(code.trim())
            }}
          >
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Discount code" className={cn(INPUT, "h-11")} autoCapitalize="characters" />
            <button type="submit" className="h-11 shrink-0 rounded-[10px] border border-[#d9dce1] px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]">
              Apply
            </button>
          </form>
        ) : (
          <button type="button" className="text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4" onClick={() => setCodeOpen(true)}>
            Add a discount code
          </button>
        )}
        {quote.couponError ? <p className="mt-2 text-[13px] text-[#b42318]">{quote.couponError}</p> : null}
      </div>

      {t ? (
        <dl className="space-y-2 border-t border-[#e5e7eb] pt-4 text-[14px]">
          <div className="flex justify-between">
            <dt className="text-[#4b5563]">Subtotal</dt>
            <dd className="tabular-nums text-[#1a1a2e]">{money(t.itemsSubtotalCents)}</dd>
          </div>
          {t.discountCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-[#4b5563]">Discount</dt>
              <dd className="tabular-nums text-[#166534]">-{money(t.discountCents)}</dd>
            </div>
          ) : null}
          {(quote.offers ?? []).map((o) => (
            <div key={o.title} className="flex justify-between pl-3 text-[13px]" data-offer-saving="">
              <dt className="truncate text-[#6b7280]">{o.title}</dt>
              <dd className="shrink-0 tabular-nums text-[#6b7280]">-{money(o.savedCents)}</dd>
            </div>
          ))}
          {quote.requiresShipping ? (
            <div className="flex justify-between">
              <dt className="text-[#4b5563]">{mode === "pickup" ? "Pickup" : "Shipping"}</dt>
              <dd className="tabular-nums text-[#1a1a2e]">{mode === "pickup" ? "Free" : !optionId ? (address.country ? "Not available" : "Enter your address") : t.shippingCents - t.shippingDiscountCents === 0 ? "Free" : money(t.shippingCents - t.shippingDiscountCents)}</dd>
            </div>
          ) : null}
          {t.taxCents > 0 ? (
            <div className="flex justify-between">
              <dt className="text-[#4b5563]">{t.taxIncluded ? "Including tax" : "Tax"}</dt>
              <dd className="tabular-nums text-[#1a1a2e]">{money(t.taxCents)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-[#e5e7eb] pt-3">
            <dt className="text-[16px] font-semibold text-[#1a1a2e]">Total</dt>
            <dd className="text-[20px] font-bold tabular-nums text-[#1a1a2e]">
              <span className="mr-1.5 text-[12px] font-medium text-[#6b7280]">{CHECKOUT_CURRENCY.toUpperCase()}</span>
              {money(t.totalCents)}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  ) : null

  const field = (key: keyof typeof address, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="relative block">
      <input
        {...props}
        value={address[key]}
        placeholder={label}
        aria-label={label}
        aria-invalid={payError?.field === key || undefined}
        onChange={(e) => setAddress((a) => ({ ...a, [key]: e.target.value }))}
        className={FLOAT_INPUT}
      />
      <span aria-hidden className={FLOAT_LABEL}>{label}</span>
    </label>
  )

  /* One full name, or first and last apart, as Settings › Checkout asks. */
  const nameFields = (purpose?: string) =>
    config.nameFields === "first_and_last" ? (
      <div className="grid grid-cols-2 gap-3">
        <label className="relative block">
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" aria-label="First name" autoComplete="given-name" aria-invalid={payError?.field === "name" || undefined} className={FLOAT_INPUT} />
          <span aria-hidden className={FLOAT_LABEL}>First name</span>
        </label>
        <label className="relative block">
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" aria-label="Last name" autoComplete="family-name" aria-invalid={payError?.field === "name" || undefined} className={FLOAT_INPUT} />
          <span aria-hidden className={FLOAT_LABEL}>Last name</span>
        </label>
      </div>
    ) : (
      field("name", purpose ? `Full name, ${purpose}` : "Full name", { autoComplete: "name" })
    )

  if (items !== null && (items.length === 0 || !shopId)) {
    return (
      <div className="min-h-dvh bg-[#f8f9fa]">
        <ShopBar brand={bar} backTo={backUrl} shopUrl={shopUrl} />
        <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
          <ShoppingBag className="h-8 w-8 text-[#c4c8cf]" strokeWidth={1.5} />
          <h1 className="mt-3 text-[22px] font-semibold text-[#1a1a2e]">Your cart is empty</h1>
          {backUrl || shopUrl ? (
            <a href={shopUrl ?? backUrl ?? "/"} className="mt-3 text-[15px] font-medium text-[#1a1a2e] underline underline-offset-4">
              Continue shopping
            </a>
          ) : null}
        </main>
      </div>
    )
  }

  /* The payment step: where it is going and how, Change, and Stripe's form with the order as the server priced it. */
  if (payment) {
    const shipTo = quote?.requiresShipping
      ? mode === "pickup"
        ? (quote.pickups ?? []).find((p) => p.id === optionId)?.name ?? "Pickup"
        : [address.line1, address.city, address.country ? countryName(address.country) : ""].filter(Boolean).join(", ")
      : null
    const method = quote?.requiresShipping && mode === "ship" ? quote.delivery.options.find((o) => o.id === optionId)?.name ?? null : null
    return (
      <div className="min-h-dvh bg-white" data-physical-step="payment">
        <ShopBar brand={bar} backTo={backUrl} shopUrl={shopUrl} />
        <div className="mx-auto max-w-[1120px] px-4 pt-5 sm:px-7 lg:px-[60px]">
          <div className="flex items-start gap-3 rounded-xl border border-[#e5e7eb] px-4 py-3 text-[13.5px] leading-[20px]" data-payment-recap="">
            <dl className="min-w-0 flex-1 space-y-1">
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-[#6b7280]">Contact</dt>
                <dd className="min-w-0 truncate text-[#1a1a2e]">{email}</dd>
              </div>
              {shipTo ? (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-[#6b7280]">{mode === "pickup" ? "Pickup" : "Ship to"}</dt>
                  <dd className="min-w-0 truncate text-[#1a1a2e]">{shipTo}</dd>
                </div>
              ) : null}
              {method ? (
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-[#6b7280]">Method</dt>
                  <dd className="min-w-0 truncate text-[#1a1a2e]">{method}</dd>
                </div>
              ) : null}
            </dl>
            <button type="button" onClick={() => (window.history.state?.physicalStep === "payment" ? backThen(() => void change()) : void change())} disabled={changing} className="shrink-0 text-[13.5px] font-medium text-[#1a1a2e] underline underline-offset-4 disabled:opacity-50">
              Change
            </button>
          </div>
        </div>
        <div className="checkout-enter mx-auto min-h-[560px] max-w-[1120px] pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 sm:pt-4">
          <EmbeddedCheckoutProvider key={payment.clientSecret} stripe={getStripePromise()} options={{ clientSecret: payment.clientSecret }}>
            <EmbeddedCheckout className="physical-embedded-checkout" />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-dvh bg-white lg:bg-[linear-gradient(90deg,#ffffff_55%,#f8f9fa_55%)]">
      <ShopBar brand={bar} backTo={backUrl} shopUrl={shopUrl} />

      {/* A phone: the order folds at the top. */}
      <div className="border-b border-[#eef0f2] bg-[#f8f9fa] lg:hidden">
        <button type="button" onClick={() => setSummaryOpen((v) => !v)} aria-expanded={summaryOpen} className="mx-auto flex h-14 w-full max-w-[640px] items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a2e]">
            <ShoppingBag className="h-4 w-4" />
            {summaryOpen ? "Hide order summary" : "Show order summary"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", summaryOpen && "rotate-180")} />
          </span>
          <span className="text-[17px] font-semibold tabular-nums text-[#1a1a2e]">{t ? money(t.totalCents) : ""}</span>
        </button>
        {summaryOpen ? <div className="mx-auto max-w-[640px] px-4 pb-5 sm:px-6">{summary}</div> : null}
      </div>

      <div className="mx-auto grid max-w-[1080px] lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <section className="px-4 py-6 sm:px-6 lg:py-10 lg:pr-12">
          <div className="mx-auto max-w-[560px] space-y-7 lg:mx-0 lg:ml-auto">
            {needsSignIn ? (
              <div className="rounded-xl border border-[#d9dce1] bg-[#f8f9fa] px-4 py-4" data-checkout-account="sign-in">
                <p className="text-[15px] font-semibold text-[#1a1a2e]">Sign in to check out</p>
                <p className="mt-1 text-[13.5px] leading-[20px] text-[#4b5563]">{shopName} asks for an account before an order, so you can follow it and find it again.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`/login?next=${encodeURIComponent(here)}`} className="inline-flex h-10 items-center rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-medium text-white">
                    Sign in
                  </a>
                  <a href={`/signup?next=${encodeURIComponent(here)}`} className="inline-flex h-10 items-center rounded-[10px] border border-[#d9dce1] bg-white px-4 text-[14px] font-medium text-[#1a1a2e]">
                    Create an account
                  </a>
                </div>
              </div>
            ) : needsConfirm ? (
              <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3.5 text-[14px] text-[#92400e]" data-checkout-account="confirm">
                Confirm your email address to place an order. Open the link we sent when you signed up, then come back to this page.
              </div>
            ) : null}
            {quoteError ? <p className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[14px] text-[#991b1b]">{quoteError}</p> : null}
            {quote?.dropped.length ? <p className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[14px] text-[#92400e]">Not included: {quote.dropped.join(", ")}.</p> : null}
            {quote?.stockIssues.length ? (
              <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[14px] text-[#991b1b]">
                {quote.stockIssues.map((s) => (
                  <p key={`${s.productId}:${s.variantId}`}>{s.available > 0 ? `${s.title}: only ${s.available} left. Lower the quantity to continue.` : `${s.title} is sold out. Remove it to continue.`}</p>
                ))}
              </div>
            ) : null}

            <div className="space-y-3">
              <h2 className="text-[19px] font-semibold text-[#1a1a2e]">Contact</h2>
              <label className="relative block">
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="Email" aria-label="Email" aria-invalid={payError?.field === "email" || undefined} className={FLOAT_INPUT} />
                <span aria-hidden className={FLOAT_LABEL}>Email</span>
              </label>
              <p className="text-[12.5px] text-[#6b7280]">Your receipt and shipping updates go here.</p>
              {config.marketingOptIn ? (
                <label className="flex cursor-pointer items-center gap-2.5 pt-0.5 text-[14px] text-[#374151]" data-checkout-news="">
                  <input type="checkbox" checked={emailOptIn} onChange={(e) => setEmailOptIn(e.target.checked)} className="h-4 w-4 rounded accent-[#1a1a2e]" />
                  Email me with news and offers
                </label>
              ) : null}
            </div>

            {quote?.requiresShipping && (quote.pickups?.length ?? 0) > 0 ? (
              <div className="space-y-3">
                <h2 className="text-[19px] font-semibold text-[#1a1a2e]">How do you want it?</h2>
                <div role="radiogroup" aria-label="Delivery or pickup" className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "ship", label: "Ship", icon: Truck },
                      { id: "pickup", label: "Pick up", icon: MapPin },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={mode === o.id}
                      onClick={() => {
                        setMode(o.id)
                        setOptionId(o.id === "pickup" ? (quote.pickups?.[0]?.id ?? null) : null)
                      }}
                      className={cn("flex h-12 items-center justify-center gap-2 rounded-[10px] border text-[15px] font-medium transition-colors", mode === o.id ? "border-[#1a1a2e] bg-[#f8f9fa] text-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#d9dce1] text-[#4b5563] hover:bg-[#f8f9fa]")}
                    >
                      <o.icon className="h-4 w-4" />
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {quote?.requiresShipping && mode === "pickup" ? (
              <div className="space-y-3" data-pickup="">
                <h2 className="text-[19px] font-semibold text-[#1a1a2e]">Pickup point</h2>
                <div className="overflow-hidden rounded-xl border border-[#d9dce1]">
                  {(quote.pickups ?? []).map((p) => (
                    <label key={p.id} className={cn("flex cursor-pointer items-start gap-3 border-b border-[#e5e7eb] px-3.5 py-3.5 last:border-b-0", optionId === p.id && "bg-[#f8f9fa]")}>
                      <input type="radio" name="pickup" checked={optionId === p.id} onChange={() => setOptionId(p.id)} className="mt-1 h-4 w-4 accent-[#1a1a2e]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium text-[#1a1a2e]">{p.name}</span>
                        <span className="block text-[13px] leading-[19px] text-[#6b7280]">{p.address.join(", ")}</span>
                        {p.ready ? <span className="mt-0.5 block text-[13px] text-[#166534]">{p.ready}</span> : null}
                        {optionId === p.id && p.instructions ? <span className="mt-1.5 block whitespace-pre-line rounded-lg bg-white px-2.5 py-2 text-[13px] leading-[19px] text-[#4b5563]">{p.instructions}</span> : null}
                      </span>
                      <span className="text-[14px] font-medium text-[#1a1a2e]">Free</span>
                    </label>
                  ))}
                </div>
                {nameFields("for the pickup")}
                {config.phone !== "off" ? field("phone", config.phone === "required" ? "Phone" : "Phone (optional)", { autoComplete: "tel", inputMode: "tel" }) : null}
                <p className="text-[12.5px] text-[#6b7280]">We'll email you when your order is ready to pick up.</p>
              </div>
            ) : null}

            {quote?.requiresShipping !== false && mode === "ship" ? (
              <div className="space-y-3">
                <h2 className="text-[19px] font-semibold text-[#1a1a2e]">Delivery</h2>
                <label className="block">
                  <div className="relative">
                    <select value={address.country} data-empty={!address.country} aria-label="Country/region" onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value, region: "" }))} autoComplete="country" aria-invalid={payError?.field === "country" || undefined} className={FLOAT_SELECT}>
                      <option value="">Country/region</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span aria-hidden data-empty={!address.country} className={FLOAT_SELECT_LABEL}>Country/region</span>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
                  </div>
                </label>
                {nameFields()}
                {config.company !== "off" ? field("company", config.company === "required" ? "Company" : "Company (optional)", { autoComplete: "organization" }) : null}
                {field("line1", "Address", { autoComplete: "address-line1" })}
                {config.address2 !== "off" ? field("line2", config.address2 === "required" ? "Apartment, suite or unit" : "Apartment, suite (optional)", { autoComplete: "address-line2" }) : null}
                {/* The country's own words and fields (lib/address/format): no state where nobody writes one, a ZIP code in the US, a Postcode in the UK. */}
                <div className={cn("grid gap-3", addressFormat(address.country).region ? "grid-cols-2 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1" : "grid-cols-2")}>
                  {field("city", "City", { autoComplete: "address-level2" })}
                  {!addressFormat(address.country).region ? null : regionsOf(address.country).length ? (
                    <label className="block">
                      <div className="relative">
                        <select value={address.region} data-empty={!address.region} aria-label={addressFormat(address.country).region?.label} onChange={(e) => setAddress((a) => ({ ...a, region: e.target.value }))} autoComplete="address-level1" aria-invalid={payError?.field === "region" || undefined} className={FLOAT_SELECT}>
                          <option value="">{addressFormat(address.country).region?.label}</option>
                          {regionsOf(address.country).map((r) => (
                            <option key={r.code} value={r.code}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <span aria-hidden data-empty={!address.region} className={FLOAT_SELECT_LABEL}>{addressFormat(address.country).region?.label}</span>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
                      </div>
                    </label>
                  ) : (
                    field("region", addressFormat(address.country).region?.required ? addressFormat(address.country).region!.label : `${addressFormat(address.country).region?.label ?? "Region"} (optional)`, { autoComplete: "address-level1" })
                  )}
                  {field("postalCode", postalCodeRequired(address.country || "US") ? addressFormat(address.country || "US").postal.label : `${addressFormat(address.country).postal.label} (optional)`, { autoComplete: "postal-code" })}
                </div>
                {config.phone !== "off" ? field("phone", config.phone === "required" ? "Phone, for the courier" : "Phone (optional, for the courier)", { autoComplete: "tel", inputMode: "tel" }) : null}
              </div>
            ) : null}

            {quote?.requiresShipping && mode === "ship" ? (
              <div className="space-y-3">
                <h2 className="text-[19px] font-semibold text-[#1a1a2e]">Shipping method</h2>
                {quote.delivery.needsCountry ? (
                  <p className="rounded-xl bg-[#f3f4f6] px-3.5 py-3 text-[14px] text-[#6b7280]">Choose your country to see delivery options.</p>
                ) : !quote.delivery.ok || quote.delivery.options.length === 0 ? (
                  <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 text-[14px] text-[#991b1b]" data-no-shipping="">
                    <p className="font-medium">Shipping isn't available to {address.country ? countryName(address.country) : "this address"}.</p>
                    {/* The server names what can't come and what to do (lib/physical/rates unshippableMessage); its own words stand alone. */}
                    <p className="mt-0.5 text-[13.5px]">{!quote.delivery.ok && quote.delivery.error ? quote.delivery.error : `This shop doesn't ship there yet. ${(quote.pickups?.length ?? 0) > 0 ? "You can choose Pick up above instead." : "Try another address, or contact the shop."}`}</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[#d9dce1]">
                    {quote.delivery.options.map((o) => (
                      <label key={o.id} className={cn("flex cursor-pointer items-center gap-3 border-b border-[#e5e7eb] px-3.5 py-3.5 last:border-b-0", optionId === o.id && "bg-[#f8f9fa]")}>
                        <input type="radio" name="delivery" checked={optionId === o.id} onChange={() => setOptionId(o.id)} className="h-4 w-4 accent-[#1a1a2e]" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium text-[#1a1a2e]">{o.name}</span>
                          {o.estimate ? <span className="block text-[13px] text-[#6b7280]">{o.estimate}</span> : null}
                        </span>
                        <span className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{o.priceCents === 0 ? "Free" : money(o.priceCents)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <details className="group">
              <summary className="cursor-pointer list-none text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4">Add a note for the shop</summary>
              <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={3} className="mt-2 w-full rounded-[10px] border border-[#d9dce1] px-3.5 py-2.5 text-[15px] outline-none focus:border-[#1a1a2e]" placeholder="Gift wrap, delivery instructions..." />
            </details>

            {payError ? <p role="alert" className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[14px] text-[#991b1b]">{payError.message}</p> : null}

            <button type="button" onClick={pay} disabled={!canPay} className="flex h-14 w-full items-center justify-center gap-2 rounded-[12px] bg-[#1a1a2e] text-[16px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.16)] transition-colors hover:bg-[#2a2a44] disabled:cursor-not-allowed disabled:opacity-50">
              <Lock className="h-4 w-4" />
              {paying ? "Opening payment" : t && t.totalCents === 0 ? "Place order" : "Continue to payment"}
            </button>
            <p className="text-center text-[12.5px] leading-[18px] text-[#6b7280]">
              {missing === "delivery" && quote?.requiresShipping ? (mode === "pickup" ? "Choose a pickup point to continue. " : "Choose a shipping method to continue. ") : ""}
              Payment is taken securely by Stripe. Stock is held for you while you pay.
            </p>
          </div>
        </section>

        <aside className="hidden px-6 py-10 lg:block lg:pl-12">
          <div className="sticky top-8 max-w-[420px]">{quote ? summary : <div className="h-[260px] animate-pulse rounded-2xl bg-white/70" />}</div>
        </aside>
      </div>
    </main>
  )
}
