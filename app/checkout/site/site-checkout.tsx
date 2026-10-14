"use client"

/**
 * ===========================================================================
 *  THE WEBSITE'S CHECKOUT: THE EXPLORE CHECKOUT, FOR A CART, ON THE SITE
 * ===========================================================================
 * Served at https://<site host>/checkout (app/checkout/site/page.tsx), so the
 * address bar, the cookies and the site's customer account are the
 * creator's. It is drawn exactly as the Explore checkout is
 * (app/checkout/checkout-client.tsx): the order on the left, paying on the
 * right, the same fields, the same summary, the same Pay, and the card in
 * Storelib's own form (Stripe's Payment Element, ./parts/stripe-pay), never
 * Stripe's page. Only the bar differs: the website's logo and Back to the
 * site (./parts/shop-bar).
 *
 * WHAT IT ASKS FOR FOLLOWS THE CART AND SETTINGS › CHECKOUT
 * (lib/checkout/site-checkout fieldPlan): an email always, the news box under
 * it when the store shows it, the name as one field or two; and, only when
 * something ships, the delivery address (company, apartment and phone as the
 * store asks), the delivery method or local pickup. "Require customers to
 * sign in" asks for the website's own account first (siteGate); the order
 * then goes to that account's address.
 *
 * EVERY NUMBER IS THE SERVER'S. The summary is the route's quote
 * (app/api/checkout/site, action "quote"), asked again when the cart, the
 * code, the country or the delivery changes, and Pay makes the PaymentIntent
 * for the server's total. Paid, the order is written (action "confirm") and
 * the buyer lands on the thank you page, on the site.
 *
 * ALREADY YOURS (./owned.tsx). A customer signed in to the website is never
 * charged for a download they already own: the quote leaves it out and
 * names it (`owned`), a cart of nothing else is "You already own this" with
 * the website's own downloads, and a guest gets "Bought this before? Email
 * me my link" under the email, which never says whether that email bought
 * anything.
 */

import * as React from "react"
import { ChevronDown, MapPin, Minus, Package, Plus, ShoppingBag, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import { DEFAULT_CHECKOUT, type CheckoutConfig } from "@/lib/store/checkout-config"
import { applyAdjusted, fieldPlan, missingField, sameLine, setLineQuantity, setLineVariant, siteSignInHref, visibleAttributes } from "@/lib/checkout/site-checkout"
import { COUNTRIES, countryName } from "@/lib/checkout/countries"
import { postalCodeRequired } from "@/lib/physical/address"
import { postalKey } from "@/lib/physical/local-delivery"
import { regionsOf } from "@/lib/physical/regions"
import { addressFormat } from "@/lib/address/format"
import { cartStorageKey, parseCart, serializeCart, type CartLine } from "@/lib/website-builder/cart"
import { encodeItems, type LinkItem } from "@/lib/physical/cart-link"
import { checkoutOrigin } from "@/lib/orders/checkout-origin-browser"
import { adoptCarriedTouches } from "@/lib/attribution/browser"
import { EMPTY_BUSINESS, checkBusiness, type BusinessDetails } from "@/lib/checkout/business"
import type { SiteQuote } from "@/lib/checkout/site-quote-server"
import { CheckRow, ErrorBanner, Field, PayButton, PayDock, PoweredByStripe, Reveal, SectionTitle, TextInput, inputClass, money as sharedMoney, FIELD_SHADOW } from "../parts/ui"
import { DiscountForm, Totals } from "../parts/order-summary"
import { BusinessFields } from "../parts/business-fields"
import { PaidOverlay } from "../parts/success"
import { StripePay, type IntentResult } from "../parts/stripe-pay"
import { VariantEdit } from "../parts/variant-edit"
import { CheckoutPhone } from "../parts/phone-input"
import { ShopBar, type ShopBrand } from "../parts/shop-bar"
import { HtmlClass } from "@/components/platform/html-class"
import { OwnedNote, SiteOwned } from "./owned"
import { AccessLink } from "../parts/access-link"
import { FAIL_COPY, WAIT_MS, requestJson } from "@/lib/net/request"

export interface SiteCheckoutProps {
  shopId: string
  brand: ShopBrand
  /** The site's home page, https://<host>/. */
  shopUrl: string
  /** Where Back goes: the cart, or the page a Buy button was on. Always this same site. */
  backTo: string
  /** The cart from the link (or an imported theme's cart cookie). Empty: this browser's cart for the shop (a built site keeps it here). */
  items: LinkItem[]
  wholeCart: boolean
  couponCode: string | null
  /** The cart's note (an imported theme's cart note, lib/checkout/site-checkout cartNote): the note for the shop starts with it. */
  initialNote?: string | null
  /** The cart's attributes from an imported theme (lib/checkout/site-checkout cartAttributes): shown under the note and kept on the order. */
  cartAttributes?: Record<string, string> | null
  /** The server's price of `items` for the first frame, or null when the cart is read in the browser. */
  initialQuote: SiteQuote | null
  initialError: string | null
  config?: CheckoutConfig
  /** Signed in to this website's own customer account. */
  buyer: { email: string; name: string | null } | null
  /** The email cannot be changed: the store asks for an account, and this is its address. */
  lockedEmail: string | null
  needsSignIn: boolean
  /** The website's own account page, where a signed in customer's downloads are (never storelib.com). */
  accountUrl?: string
  /** The visitor browsed in a market's currency (Markets and languages): what the card is charged in, said under the total. */
  currencyNote?: string | null
  /** What the card is charged in: the store's own currency (lib/payments/fees/currency-rules storeChargeCurrency). */
  currency?: string
}

const PAID_SCREEN_MS = 1100
/** How long a cart that ships keeps paying into the same held checkout; the server holds its stock for 35 minutes. */
const INTENT_REUSE_MS = 25 * 60_000

type Address = { line1: string; line2: string; city: string; region: string; postalCode: string; country: string; phone: string; company: string }
/* What goes in each field, said in the field until something is typed (a field given its own placeholder keeps it). */
const ADDRESS_PLACEHOLDER: Record<keyof Address, string> = {
  line1: "Street and house number",
  line2: "Apartment, floor, building",
  city: "City",
  region: "State or county",
  postalCode: "Postal code",
  country: "Country",
  phone: "Phone number",
  company: "Company name",
}
const EMPTY_ADDRESS: Address = { line1: "", line2: "", city: "", region: "", postalCode: "", country: "", phone: "", company: "" }

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** A field's placeholder: one plain word from its label ("ZIP code" → "ZIP", "Postal code" → "Postcode", "State" → "State"). */
function oneWord(label: string): string {
  const head = label.replace(/\s*\(.*\)$/, "").replace(/ code$/i, "").trim()
  if (/^postal$/i.test(head)) return "Postcode"
  return head.split(/\s+/)[0] || label
}

function guessCountry(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    return region && COUNTRIES.some((c) => c.code === region) ? region : ""
  } catch {
    return ""
  }
}

function remembered(key: string): string {
  try {
    return sessionStorage.getItem(`checkout_${key}`) || ""
  } catch {
    return ""
  }
}
function remember(key: string, value: string) {
  try {
    sessionStorage.setItem(`checkout_${key}`, value)
  } catch {
    /* private mode: nothing to keep */
  }
}

/** Bounded (lib/net/request.ts WAIT_MS.pay). A failure to answer throws, as a dropped connection always did, so the callers' own error paths apply. */
async function call<T>(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T & { error?: string; field?: string; code?: string; free?: boolean } }> {
  const r = await requestJson<T & { error?: string; field?: string; code?: string; free?: boolean }>("/api/checkout/site", { method: "POST", json: body, credentials: "same-origin", timeoutMs: WAIT_MS.pay })
  if (r.status === 0) throw Object.assign(new Error(FAIL_COPY[r.kind ?? "network"]), { kind: r.kind })
  return { ok: r.ok, status: r.status, data: r.data }
}

function bringIntoView(el: HTMLElement, focus = false) {
  const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (focus) {
    try {
      el.focus({ preventScroll: true })
    } catch {
      el.focus()
    }
  }
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
}

export function SiteCheckout({
  shopId,
  brand,
  shopUrl,
  backTo,
  items: linkItems,
  wholeCart: linkWhole,
  couponCode,
  initialNote = null,
  cartAttributes = null,
  initialQuote,
  initialError,
  config = DEFAULT_CHECKOUT,
  buyer,
  lockedEmail,
  needsSignIn,
  accountUrl = "/account",
  currencyNote = null,
  currency,
}: SiteCheckoutProps) {
  /* Every price on this page is in the store's currency, the one the card is charged in. */
  const money = (cents: number) => sharedMoney(cents, currency)
  /* ── The cart ────────────────────────────────────────────────────── */
  const [items, setItems] = React.useState<LinkItem[] | null>(linkItems.length ? linkItems : null)
  const [wholeCart, setWholeCart] = React.useState(linkWhole)
  const [quote, setQuote] = React.useState<SiteQuote | null>(initialQuote)
  const [quoteError, setQuoteError] = React.useState<string | null>(initialError)
  const [quoting, setQuoting] = React.useState(false)
  React.useEffect(() => {
    adoptCarriedTouches()
    if (linkItems.length) return
    /* No cart in the link: a built site keeps its cart in this browser, under this shop. */
    try {
      const lines = parseCart(window.localStorage.getItem(cartStorageKey(shopId)))
      setItems(lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, ...(typeof l.customPriceCents === "number" ? { customPriceCents: l.customPriceCents } : {}) })))
      setWholeCart(true)
    } catch {
      setItems([])
    }
  }, [linkItems, shopId])

  /*
    CHANGING THE ORDER HERE (- / +, Remove). The page only changes ids and
    quantities; the quote below prices them again (stock, the per order
    limit, shipping, tax, the code). The address bar, this browser's cart (a
    built site) and an imported theme's cart cookie follow, so Back to the
    site shows the same cart. A Buy it now is not the cart and leaves it be.
  */
  const [limitNote, setLimitNote] = React.useState<string | null>(null)
  /* `swap`: a line changed to another option here, so this browser's cart line follows it rather than being dropped. */
  const commitItems = (next: LinkItem[], swap?: { productId: string; from: string | null; to: { variantId: string; variantName: string | null; priceCents: number } }) => {
    setItems(next)
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.has("items")) {
        if (next.length) url.searchParams.set("items", encodeItems(next))
        else url.searchParams.delete("items")
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
      }
    } catch {
      /* the address keeps the old cart; the page has the new one */
    }
    if (!wholeCart) return
    try {
      const key = cartStorageKey(shopId)
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const kept: CartLine[] = []
        for (const was of parseCart(raw)) {
          const l = swap && was.productId === swap.productId && (was.variantId ?? null) === swap.from ? { ...was, variantId: swap.to.variantId, variantName: swap.to.variantName, priceCents: swap.to.priceCents } : was
          const match = next.find((i) => sameLine(i, l) || sameLine({ productId: l.productId, variantId: l.variantId }, i))
          if (match && !kept.some((k) => k.productId === l.productId && (k.variantId ?? null) === (l.variantId ?? null))) kept.push({ ...l, quantity: match.quantity })
        }
        window.localStorage.setItem(key, serializeCart(kept))
      }
    } catch {
      /* storage refused: the site's cart keeps what it had */
    }
    void call({ action: "cart", items: next }).catch(() => undefined)
  }
  /* The first frame's quote (priced on the server) may have lowered a line to its limit too. */
  React.useEffect(() => {
    if (!initialQuote?.adjusted?.length || !linkItems.length) return
    setLimitNote(initialQuote.adjusted.map((a) => `${a.title}: up to ${a.limit} per order.`).join(" "))
    commitItems(applyAdjusted(linkItems, initialQuote.adjusted))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Who ─────────────────────────────────────────────────────────── */
  const [email, setEmail] = React.useState(lockedEmail ?? buyer?.email ?? "")
  const splitName = config.nameFields === "first_and_last"
  const [fullName, setFullName] = React.useState(buyer?.name ?? "")
  const [firstOnly, setFirstOnly] = React.useState(() => (buyer?.name ?? "").trim().split(/\s+/)[0] || "")
  const [lastOnly, setLastOnly] = React.useState(() => (buyer?.name ?? "").trim().split(/\s+/).slice(1).join(" "))
  const firstName = splitName ? firstOnly.trim() : fullName.trim().split(/\s+/)[0] || ""
  const lastName = splitName ? lastOnly.trim() : fullName.trim().split(/\s+/).slice(1).join(" ")
  const [emailOptIn, setEmailOptIn] = React.useState(false)
  const [agreed, setAgreed] = React.useState(false)
  const [here, setHere] = React.useState("/checkout")
  React.useEffect(() => {
    setHere(window.location.pathname + window.location.search)
    if (!lockedEmail) setEmail((v) => v || remembered("email"))
    if (!buyer?.name) {
      setFullName((v) => v || remembered("fullName"))
      setFirstOnly((v) => v || remembered("fullName").split(/\s+/)[0] || "")
      setLastOnly((v) => v || remembered("fullName").split(/\s+/).slice(1).join(" "))
    }
  }, [lockedEmail, buyer?.name])
  React.useEffect(() => remember("fullName", `${firstName} ${lastName}`.trim()), [firstName, lastName])
  React.useEffect(() => {
    if (!lockedEmail) remember("email", email)
  }, [email, lockedEmail])

  /* ── Delivery ────────────────────────────────────────────────────── */
  const [address, setAddress] = React.useState<Address>(EMPTY_ADDRESS)
  const [mode, setMode] = React.useState<"ship" | "pickup">("ship")
  const [optionId, setOptionId] = React.useState<string | null>(null)
  const [note, setNote] = React.useState(initialNote ?? "")
  React.useEffect(() => setAddress((a) => (a.country ? a : { ...a, country: guessCountry() })), [])
  /* Settings › Shipping: the countries this cart can go to. A shop that ships to one country starts there. */
  const shipsTo = quote?.shipsTo ?? null
  const shipsToKey = shipsTo ? shipsTo.join(",") : ""
  React.useEffect(() => {
    if (!shipsTo || shipsTo.length !== 1) return
    setAddress((a) => (a.country === shipsTo[0] ? a : { ...a, country: shipsTo[0], region: "" }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipsToKey])
  const ships = !!quote?.requiresShipping
  /* A physical product handed over in person ships nothing, and is still a physical order: the phone is asked as Settings › Checkout says. */
  const physical = !!quote?.physical || ships
  const plan = fieldPlan(config, { ships, pickup: mode === "pickup", physical })
  const notServed = ships && !!address.country && !!shipsTo && shipsTo.length > 0 && !shipsTo.includes(address.country)
  /* The shop ships by state here (lib/physical/rates needsRegion): the state field says so until one is chosen. */
  const regionAsked = ships && !!quote?.delivery.needsRegion && !address.region.trim()

  /* ── The code ────────────────────────────────────────────────────── */
  const [code, setCode] = React.useState(couponCode ?? "")
  const [appliedCode, setAppliedCode] = React.useState<string | null>(couponCode)
  const [codeError, setCodeError] = React.useState<string | null>(null)

  /* ── The server's prices, asked again when anything that changes them changes ── */
  /* Where it goes only changes the price of an order that ships. */
  /* The postal code counts once it is long enough to name an area: it only decides local delivery (lib/physical/local-delivery.ts). */
  const postalForQuote = postalKey(address.postalCode).length >= 3 ? postalKey(address.postalCode) : ""
  const shipsKey = ships ? `${address.country}|${address.region}|${postalForQuote}` : ""

  const asked = React.useRef(0)
  const firstAsk = React.useRef(!!initialQuote)
  React.useEffect(() => {
    if (!items || items.length === 0) return
    /* The server already priced this cart for the first frame: asked again only once something changes. */
    if (firstAsk.current && !ships) {
      firstAsk.current = false
      return
    }
    firstAsk.current = false
    const n = ++asked.current
    setQuoting(true)
    const t = window.setTimeout(async () => {
      try {
        const res = await call<SiteQuote>({ action: "quote", items, couponCode: appliedCode, country: address.country, region: address.region, postalCode: postalForQuote, deliveryOptionId: optionId, email })
        if (n !== asked.current) return
        if (!res.ok) {
          setQuoteError(res.data.error || "Could not load your order.")
          return
        }
        const got = res.data as SiteQuote
        setQuoteError(null)
        setQuote(got)
        /* Over a product's per order limit: the server lowered it; the cart here (and the site's) takes the same number. */
        if (got.adjusted?.length) {
          setLimitNote(got.adjusted.map((a) => `${a.title}: up to ${a.limit} per order.`).join(" "))
          commitItems(applyAdjusted(items, got.adjusted))
        }
        if (got.couponError) {
          setCodeError(got.couponError)
          setAppliedCode(null)
        }
        if (mode === "pickup" && !(got.pickups ?? []).some((p) => p.id === optionId)) {
          const first = got.pickups?.[0]?.id ?? null
          if (first) setOptionId(first)
          else {
            setMode("ship")
            setOptionId(null)
          }
        } else if (mode === "ship" && got.requiresShipping && got.delivery.selectedId !== optionId) setOptionId(got.delivery.selectedId)
      } catch {
        if (n === asked.current) setQuoteError("Check your connection and try again.")
      } finally {
        if (n === asked.current) setQuoting(false)
      }
    }, 200)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, appliedCode, shipsKey, optionId])

  /* ── Already yours ───────────────────────────────────────────────── */
  const owned = React.useMemo(() => quote?.owned ?? [], [quote])
  const onlyOwned = !!quote && quote.lines.length === 0 && owned.length > 0
  /* The whole cart was already theirs: it leaves the cart, here and in an imported theme's cookie (decided again on the server). */
  const forgotten = React.useRef(false)
  React.useEffect(() => {
    if (!onlyOwned || !wholeCart || forgotten.current) return
    forgotten.current = true
    try {
      const key = cartStorageKey(shopId)
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const mine = new Set(owned.map((o) => `${o.productId}::${o.variantId ?? ""}`))
        const kept = parseCart(raw).filter((l) => !mine.has(`${l.productId}::${l.variantId ?? ""}`))
        window.localStorage.setItem(key, serializeCart(kept))
      }
    } catch {
      /* storage refused: the cart keeps them, and checkout leaves them out again */
    }
    void call({ action: "forget" }).catch(() => undefined)
  }, [onlyOwned, wholeCart, owned, shopId])
  const hasDownloads = !!quote && quote.lines.some((l) => l.type !== "physical")
  const sendAccess = async (to: string) => {
    const res = await call<{ message?: string }>({ action: "access", email: to, items: (items ?? []).map((i) => ({ productId: i.productId })) })
    return { ok: res.ok, message: res.data.message || res.data.error || (res.ok ? "Check your inbox." : "That didn't go through. Try again in a moment.") }
  }

  const t = quote?.totals
  const total = t?.totalCents ?? 0
  const isFree = !!quote && quote.lines.length > 0 && total === 0

  /* ── Buying for a business ───────────────────────────────────────── */
  const [businessOn, setBusinessOn] = React.useState(false)
  const [business, setBusiness] = React.useState<BusinessDetails>(EMPTY_BUSINESS)
  const [businessErrors, setBusinessErrors] = React.useState<Partial<Record<keyof BusinessDetails, string>>>({})

  /* ── The page's own state ────────────────────────────────────────── */
  const [error, setError] = React.useState<string | null>(null)
  const [fieldError, setFieldError] = React.useState<{ field: string; message: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [paid, setPaid] = React.useState<{ total: number; free: boolean } | null>(null)
  const [settled, setSettled] = React.useState(false)
  const [summaryOpen, setSummaryOpen] = React.useState(true)
  const [wide, setWide] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const read = () => setWide(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])
  const secretRef = React.useRef<string | null>(null)
  /* A held checkout's key (a cart that ships): the same while the order is the same, a new one once it changes. */
  const intentKey = React.useRef<{ key: string; sig: string; at: number } | null>(null)

  const [arriving, setArriving] = React.useState(false)
  const siteHost = (() => {
    try {
      return new URL(shopUrl).hostname.replace(/^www\./, "")
    } catch {
      return null
    }
  })()

  const missing = (field: string, message: string) => {
    setFieldError({ field, message })
    const el = document.getElementById(`checkout-${field}`) ?? (field === "email" ? document.querySelector<HTMLElement>("[data-checkout-email]") : null)
    if (el) bringIntoView(el, true)
    return message
  }

  /* ── After paying: the order, then the thank you page on the site ── */
  const go = React.useCallback(
    (thanks: string) => {
      /* The whole cart is an order now: a built site's cart leaves this browser (an imported theme's cookie went with the answer). */
      if (wholeCart) {
        try {
          window.localStorage.removeItem(cartStorageKey(shopId))
        } catch {
          /* nothing kept to clear */
        }
      }
      window.setTimeout(() => window.location.replace(thanks), PAID_SCREEN_MS)
    },
    [wholeCart, shopId],
  )

  const finish = React.useCallback(
    async (paymentIntentId: string, clientSecret: string) => {
      const url = new URL(window.location.href)
      url.searchParams.set("payment_intent", paymentIntentId)
      url.searchParams.set("payment_intent_client_secret", clientSecret)
      url.searchParams.set("redirect_status", "succeeded")
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
      let last = "Your payment went through. The order is still being saved: refresh this page in a moment. You will not be charged again."
      for (const wait of [0, 1500, 4000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait))
        const res = await call<{ receiptToken?: string; thanks?: string }>({ action: "confirm", paymentIntentId, clientSecret, wholeCart }).catch(() => null)
        if (res?.ok && res.data.thanks) {
          setPaid({ total, free: false })
          setArriving(false)
          go(res.data.thanks)
          return
        }
        if (res && res.status >= 400 && res.status < 500 && res.status !== 409) {
          last = res.data.error || last
          break
        }
      }
      setSettled(true)
      throw new Error(last)
    },
    [go, total, wholeCart],
  )

  /* Back from a bank's page, or a refresh after the order could not be finished. */
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const piId = q.get("payment_intent")
    const secret = q.get("payment_intent_client_secret")
    if (!piId || !secret) return
    const status = q.get("redirect_status")
    const clear = () => {
      const url = new URL(window.location.href)
      for (const k of ["payment_intent", "payment_intent_client_secret", "redirect_status"]) url.searchParams.delete(k)
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    }
    if (status === "failed") {
      clear()
      setError("The bank did not approve the payment. Nothing was charged. Try again or use another card.")
      return
    }
    if (status === "processing" || status === "pending") {
      clear()
      setSettled(true)
      setError("Your bank is still processing the payment. The receipt will be emailed to you as soon as it clears.")
      return
    }
    setArriving(true)
    setBusy(true)
    finish(piId, secret)
      .catch((e: Error) => {
        setArriving(false)
        setError(e.message)
      })
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Checks, before anything is sent ─────────────────────────────── */
  const checkBusinessNow = (): string | null => {
    if (!businessOn) return null
    const r = checkBusiness(business)
    if (r.ok) {
      setBusinessErrors({})
      return null
    }
    setBusinessErrors({ [r.field]: r.error })
    const field = document.getElementById(`business-${r.field === "postalCode" ? "postal" : r.field === "taxId" ? "tax" : r.field}`)
    if (field) bringIntoView(field, true)
    return r.error
  }

  const check = (kind: "card" | "express" | "free"): string | null => {
    if (paid || settled) return "This order is already paid."
    setFieldError(null)
    if (needsSignIn) {
      const box = document.querySelector<HTMLElement>("[data-checkout-account]")
      if (box) bringIntoView(box)
      return "Sign in to check out."
    }
    if (!quote || (quote.lines.length === 0 && !(quote.short ?? []).length && !(quote.needsOption ?? []).length)) return quoteError || "Your cart is empty."
    if (quoting) return "Your order is being updated. Try again in a moment."
    if ((quote.needsOption ?? []).length) {
      const row = document.querySelector<HTMLElement>("[data-line-needs-option]")
      if (row) bringIntoView(row)
      return `Choose an option for ${quote.needsOption![0].title}.`
    }
    if (quote.stockIssues.length) return "Some items don't have enough stock. Lower the quantity or remove them to continue."
    if (kind !== "free" && total > 0 && total < 50) return "The smallest card payment is $0.50."
    if (kind !== "express" || ships) {
      const m = missingField(plan, { email, first: firstName, last: lastName, company: address.company, phone: address.phone, line2: address.line2 })
      if (m === "email") return missing("email", "Enter a valid email address.")
      if (m === "name") return missing(splitName ? "first" : "name", "Enter your name.")
      if (m === "last") return missing(splitName ? "last" : "name", "Enter your first and last name.")
      if (m === "company") return missing("company", "Enter the company name.")
      if (m === "phone") return missing("phone", address.phone.trim() ? "Check the phone number." : "Enter a phone number.")
      if (m === "line2") return missing("line2", "Enter the apartment, suite or unit.")
    }
    if (ships && mode === "ship") {
      if (!address.country) return missing("country", "Choose a country.")
      if (!address.line1.trim()) return missing("line1", "Enter the street address.")
      if (!address.city.trim()) return missing("city", "Enter the city.")
      if (postalCodeRequired(address.country) && !address.postalCode.trim()) return missing("postal", `Enter the ${addressFormat(address.country).postal.label.toLowerCase()}.`)
      if ((quote.delivery.needsRegion || addressFormat(address.country).region?.required) && !address.region.trim()) return missing("region", `Choose your ${(addressFormat(address.country).region?.label ?? "state or province").toLowerCase()}.`)
      if (!optionId) return quote.delivery.needsCountry ? "Choose your country to see delivery options." : "Shipping isn't available to this address."
    }
    if (ships && mode === "pickup" && !optionId) return "Choose a pickup point."
    if (kind !== "free") {
      const b = checkBusinessNow()
      if (b) return b
    }
    if (!agreed) {
      const terms = document.getElementById("checkout-terms")
      if (terms) bringIntoView(terms)
      return "Tick the box to agree to the Terms and Conditions."
    }
    return null
  }

  const orderBody = (contact?: { email?: string; name?: string }) => {
    const payerEmail = lockedEmail ?? (contact?.email || email).trim()
    const walletName = (contact?.name || "").trim().split(/\s+/).filter(Boolean)
    const typed = firstName !== ""
    return {
      items,
      couponCode: appliedCode,
      email: payerEmail,
      firstName: typed ? firstName : walletName[0] || payerEmail.split("@")[0] || "",
      lastName: typed ? lastName : walletName.slice(1).join(" "),
      emailOptIn: plan.newsBox ? emailOptIn : false,
      agreedToTerms: agreed,
      business: businessOn ? business : null,
      address: ships && mode === "ship" ? { ...address, name: `${firstName} ${lastName}`.trim() } : null,
      phone: address.phone,
      deliveryOptionId: ships ? optionId : null,
      buyerNote: note,
      cartAttributes,
      wholeCart,
      origin: checkoutOrigin(shopId),
    }
  }

  const createIntent = async (contact?: { email?: string; name?: string }, methods?: string[]): Promise<IntentResult> => {
    const body = orderBody(contact)
    /* A cart that ships holds its stock under a key: the same key for the same order, a new one (letting the last go) once it changed. */
    /* Everything the held checkout keeps about the buyer is in the key's signature, so a retry with a changed detail is a new checkout, never a stale one. */
    const sig = JSON.stringify([body.items, body.couponCode, body.address, body.deliveryOptionId, body.email, body.firstName, body.lastName, body.phone, body.buyerNote, body.cartAttributes, body.emailOptIn])
    const before = intentKey.current
    /* A payment older than its stock hold (35 minutes on the server) is never reused: a new one, letting the old one go. */
    const fresh = !!before && Date.now() - before.at < INTENT_REUSE_MS
    const key = before && fresh && before.sig === sig ? before.key : newKey()
    intentKey.current = { key, sig, at: key === before?.key ? before.at : Date.now() }
    const res = await call<{ clientSecret?: string; paymentIntentId?: string }>({ action: "intent", ...body, paymentMethods: methods, clientKey: key, replaces: before && before.key !== key ? before.key : null })
    if (!res.ok || !res.data.clientSecret || !res.data.paymentIntentId) {
      const field = res.data.field as keyof BusinessDetails | undefined
      if (field && field in EMPTY_BUSINESS) setBusinessErrors({ [field]: res.data.error || "Check this field." })
      /* A failed start is a new checkout next time, which lets this one's stock go first (if it held any). */
      intentKey.current = { key, sig: "", at: 0 }
      throw new Error(res.data.error || "The payment could not be started. Nothing was charged.")
    }
    secretRef.current = res.data.clientSecret
    return { clientSecret: res.data.clientSecret, paymentIntentId: res.data.paymentIntentId }
  }

  const onPaid = async (paymentIntentId: string, status: string) => {
    if (status === "processing") {
      setSettled(true)
      setError("Your bank is still processing the payment. The receipt will be emailed to you as soon as it clears.")
      return
    }
    if (status !== "succeeded") {
      setError("The payment was not completed. Nothing was charged. Try again.")
      return
    }
    await finish(paymentIntentId, secretRef.current || "")
  }

  const takeFree = async () => {
    if (busy) return
    setError(null)
    const problem = check("free")
    if (problem) return setError(problem)
    setBusy(true)
    try {
      const body = orderBody()
      const res = await call<{ thanks?: string }>({ action: "free", ...body, business: null, clientKey: newKey() })
      if (!res.ok || !res.data.thanks) throw new Error(res.data.error || "The order could not be finished. Try again.")
      setPaid({ total: 0, free: true })
      go(res.data.thanks)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The order could not be finished. Try again.")
    } finally {
      setBusy(false)
    }
  }

  /* ── Pieces ──────────────────────────────────────────────────────── */
  const errorOf = (field: string) => (fieldError?.field === field ? fieldError.message : null)
  const clearError = (field: string) => {
    if (fieldError?.field === field) setFieldError(null)
  }

  const nameFields = splitName ? (
    <div className="grid grid-cols-2 gap-3">
      <Field id="checkout-first" label="First name" error={errorOf("first")}>
        <TextInput id="checkout-first" autoComplete="given-name" placeholder="Jane" value={firstOnly} invalid={!!errorOf("first")} onChange={(e) => { setFirstOnly(e.target.value.slice(0, 60)); clearError("first") }} />
      </Field>
      <Field id="checkout-last" label="Last name" error={errorOf("last")}>
        <TextInput id="checkout-last" autoComplete="family-name" placeholder="Smith" value={lastOnly} invalid={!!errorOf("last")} onChange={(e) => { setLastOnly(e.target.value.slice(0, 60)); clearError("last") }} />
      </Field>
    </div>
  ) : (
    <Field id="checkout-name" label="Full name" error={errorOf("name")}>
      <TextInput id="checkout-name" autoComplete="name" placeholder="Jane Smith" value={fullName} invalid={!!errorOf("name")} onChange={(e) => { setFullName(e.target.value.slice(0, 121)); clearError("name") }} />
    </Field>
  )

  const newsBox = plan.newsBox ? (
    <CheckRow id="checkout-news" checked={emailOptIn} onChange={setEmailOptIn}>
      Email me with news and offers
    </CheckRow>
  ) : null

  const account = needsSignIn ? (
    <div className="rounded-xl border border-[#d9dce1] bg-[#f8f9fa] px-4 py-3.5" data-checkout-account="sign-in">
      <p className="text-[14.5px] font-semibold text-[#1a1a2e]">Sign in to check out</p>
      <p className="mt-0.5 text-[13px] leading-[19px] text-[#4b5563]">{brand.name} asks you to sign in before you order. We&apos;ll email you a code.</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <a href={siteSignInHref(here)} className="inline-flex h-9 items-center rounded-[10px] bg-[#1a1a2e] px-3.5 text-[13.5px] font-medium text-white">
          Sign in
        </a>
      </div>
    </div>
  ) : lockedEmail ? (
    <p className="text-[13px] text-[#6b7280]" data-checkout-account="signed-in">
      Signed in as {lockedEmail}.{" "}
      <a href="/account/logout" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2">
        Sign out
      </a>
    </p>
  ) : null

  const addressField = (key: keyof Address, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { id: string }) => (
    <Field id={props.id} label={label} error={errorOf(props.id.replace("checkout-", "")) ?? (key === "region" && regionAsked ? "Enter it to see delivery options." : null)}>
      <TextInput
        placeholder={ADDRESS_PLACEHOLDER[key]}
        {...props}
        value={address[key]}
        invalid={!!errorOf(props.id.replace("checkout-", "")) || (key === "region" && regionAsked)}
        onChange={(e) => {
          setAddress((a) => ({ ...a, [key]: e.target.value.slice(0, key === "postalCode" ? 20 : 200) }))
          clearError(props.id.replace("checkout-", ""))
        }}
      />
    </Field>
  )

  /* The phone with its country's code in front (../parts/phone-input), following the address's country until the buyer picks one. */
  const phoneField = (
    <Field id="checkout-phone" label={plan.phone === "required" ? "Phone" : "Phone (optional)"} error={errorOf("phone")}>
      <CheckoutPhone
        id="checkout-phone"
        value={address.phone}
        country={address.country}
        invalid={!!errorOf("phone")}
        onChange={(v) => {
          setAddress((a) => ({ ...a, phone: v.slice(0, 40) }))
          clearError("phone")
        }}
      />
    </Field>
  )

  /* Under the email: the news box, the account, then the name (an order that ships asks the name with its address). */
  const contactExtra = (
    <div className="space-y-3">
      {newsBox}
      {account}
      {/* A guest who bought a download before gets the link by email, never a yes or no on screen (./owned.tsx). */}
      {!buyer && !lockedEmail && !needsSignIn && hasDownloads ? <AccessLink email={email} send={sendAccess} /> : null}
      {ships ? null : nameFields}
      {/* A physical product handed over in person: no address, and still the phone Settings › Checkout asks for. */}
      {!ships && physical && plan.phone !== "off" ? phoneField : null}
    </div>
  )

  const select = (id: string, label: string, value: string, options: { code: string; name: string }[], onChange: (v: string) => void, autoComplete: string) => (
    <Field id={id} label={label} error={errorOf(id.replace("checkout-", "")) ?? (id === "checkout-region" && regionAsked ? `Choose your ${label.toLowerCase()} to see delivery options.` : null)}>
      <div className="relative">
        <select id={id} value={value} autoComplete={autoComplete} onChange={(e) => { onChange(e.target.value); clearError(id.replace("checkout-", "")) }} aria-invalid={!!errorOf(id.replace("checkout-", "")) || (id === "checkout-region" && regionAsked) || undefined} className={cn(inputClass, "appearance-none pr-9")}>
          <option value="">{label}</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
      </div>
    </Field>
  )

  const choiceRow = (selected: boolean) => cn("flex cursor-pointer items-start gap-3 border-b border-[#e1e3e7] px-3.5 py-3 last:border-b-0 transition-colors", selected ? "bg-[#f7f7f8]" : "bg-white hover:bg-[#fafafb]")
  const fmt = addressFormat(address.country)
  const regions = regionsOf(address.country)
  /* Only the countries the shop ships this cart to (Settings › Shipping), and the one chosen, so "We don't ship there" is said rather than hidden. */
  const countryChoices = React.useMemo(() => {
    const all = COUNTRIES.map((c) => ({ code: c.code, name: c.name }))
    if (!shipsTo || shipsTo.length === 0) return all
    return all.filter((c) => shipsTo.includes(c.code) || c.code === address.country)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipsToKey, address.country])

  const delivery = ships && quote ? (
    <div className="space-y-8">
      <section aria-labelledby="checkout-delivery">
        <SectionTitle>
          <span id="checkout-delivery">Delivery</span>
        </SectionTitle>
        {(quote.pickups?.length ?? 0) > 0 ? (
          <div role="radiogroup" aria-label="Delivery or pickup" className="mb-4 grid grid-cols-2 gap-2">
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
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-[8px] border text-[14.5px] font-medium transition-colors",
                  mode === o.id ? "border-[#1a1a2e] bg-white text-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e1e3e7] bg-white text-[#4b5563] hover:border-[#d2d5da]",
                )}
              >
                <o.icon className="h-4 w-4" aria-hidden />
                {o.label}
              </button>
            ))}
          </div>
        ) : null}

        {mode === "pickup" ? (
          <div className="space-y-3" data-pickup="">
            <div className="overflow-hidden rounded-[8px] border border-[#e1e3e7]" style={{ boxShadow: FIELD_SHADOW }}>
              {(quote.pickups ?? []).map((p) => (
                <label key={p.id} className={choiceRow(optionId === p.id)}>
                  <input type="radio" name="pickup" checked={optionId === p.id} onChange={() => setOptionId(p.id)} className="mt-1 h-4 w-4 accent-[#1a1a2e]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-[#1a1a2e]">{p.name}</span>
                    <span className="block text-[13px] leading-[19px] text-[#6b7280]">{p.address.join(", ")}</span>
                    {p.ready ? <span className="mt-0.5 block text-[13px] text-[#166534]">{p.ready}</span> : null}
                    {p.hours ? <span className="mt-0.5 block whitespace-pre-line text-[13px] leading-[19px] text-[#6b7280]" data-pickup-hours="">{p.hours}</span> : null}
                    {optionId === p.id && p.instructions ? <span className="mt-1.5 block whitespace-pre-line text-[13px] leading-[19px] text-[#4b5563]">{p.instructions}</span> : null}
                  </span>
                  <span className="text-[14px] font-medium text-[#1a1a2e]">Free</span>
                </label>
              ))}
            </div>
            {nameFields}
            {plan.phone !== "off" ? phoneField : null}
          </div>
        ) : (
          <div className="space-y-3">
            {select("checkout-country", "Country/region", address.country, countryChoices, (v) => setAddress((a) => ({ ...a, country: v, region: "" })), "country")}
            {nameFields}
            {plan.company !== "off" ? addressField("company", plan.company === "required" ? "Company" : "Company (optional)", { id: "checkout-company", autoComplete: "organization", placeholder: "Company" }) : null}
            {addressField("line1", "Address", { id: "checkout-line1", autoComplete: "address-line1", placeholder: "Address" })}
            {plan.address2 !== "off" ? addressField("line2", plan.address2 === "required" ? "Apartment, suite or unit" : "Apartment, suite, etc. (optional)", { id: "checkout-line2", autoComplete: "address-line2", placeholder: "Apartment" }) : null}
            <div className={cn("grid gap-3", fmt.region ? "grid-cols-2 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1" : "grid-cols-2")}>
              {addressField("city", "City", { id: "checkout-city", autoComplete: "address-level2", placeholder: "City" })}
              {!fmt.region
                ? null
                : regions.length
                  ? select("checkout-region", fmt.region.label, address.region, regions.map((r) => ({ code: r.code, name: r.name })), (v) => setAddress((a) => ({ ...a, region: v })), "address-level1")
                  : addressField("region", fmt.region.required ? fmt.region.label : `${fmt.region.label} (optional)`, { id: "checkout-region", autoComplete: "address-level1", placeholder: oneWord(fmt.region.label) })}
              {addressField("postalCode", postalCodeRequired(address.country || "US") ? fmt.postal.label : `${fmt.postal.label} (optional)`, { id: "checkout-postal", autoComplete: "postal-code", placeholder: oneWord(fmt.postal.label) })}
            </div>
            {plan.phone !== "off" ? phoneField : null}
          </div>
        )}
      </section>

      {mode === "ship" ? (
        <section aria-labelledby="checkout-method" data-shipping-method="">
          <SectionTitle>
            <span id="checkout-method">Shipping method</span>
          </SectionTitle>
          {quote.delivery.needsCountry || (quote.delivery.needsRegion && !address.region.trim()) ? (
            <p className="rounded-[8px] bg-[#f7f7f8] px-3.5 py-3 text-[14px] text-[#6b7280]" data-needs-region={quote.delivery.needsRegion ? "" : undefined}>
              {quote.delivery.needsCountry ? "Choose your country to see delivery options." : `Choose your ${(fmt.region?.label ?? "state or province").toLowerCase()} to see delivery options.`}
            </p>
          ) : !quote.delivery.ok || quote.delivery.options.length === 0 ? (
            <div className="rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 text-[14px] text-[#991b1b]" data-no-shipping="">
              <p className="font-medium">{notServed ? `We don't ship to ${countryName(address.country)}.` : `Shipping isn't available to ${address.country ? countryName(address.country) : "this address"}.`}</p>
              {/* The server names what can't come and why (lib/physical/rates unshippableMessage). */}
              <p className="mt-0.5 text-[13.5px]">{notServed ? ((quote.pickups?.length ?? 0) > 0 ? "Choose a country we ship to, or pick it up instead." : "Choose a country we ship to.") : !quote.delivery.ok && quote.delivery.error ? quote.delivery.error : (quote.pickups?.length ?? 0) > 0 ? "You can choose Pick up instead." : "Try another address, or contact the shop."}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[8px] border border-[#e1e3e7]" style={{ boxShadow: FIELD_SHADOW }}>
              {quote.delivery.options.map((o) => (
                <label key={o.id} className={cn(choiceRow(optionId === o.id), "items-center")}>
                  <input type="radio" name="delivery" checked={optionId === o.id} onChange={() => setOptionId(o.id)} className="h-4 w-4 accent-[#1a1a2e]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-[#1a1a2e]">{o.name}</span>
                    {o.estimate ? <span className="block text-[13px] text-[#6b7280]">{o.estimate}</span> : null}
                  </span>
                  {/* A free shipping code: every method is free, and what it would have cost is shown struck through. */}
                  {quote.coupon?.freeShipping && o.priceCents > 0 ? (
                    <span className="text-right text-[14px] font-medium tabular-nums text-[#1a1a2e]">
                      <s className="mr-1.5 font-normal text-[#6b7280]">{money(o.priceCents)}</s>Free
                    </span>
                  ) : (
                    <span className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{o.priceCents === 0 ? "Free" : money(o.priceCents)}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  ) : null

  const consent = (
    <div id="checkout-terms">
      <CheckRow id="checkout-agree" checked={agreed} onChange={(v) => { setAgreed(v); if (v) setError(null) }} invalid={!agreed && !!error?.includes("Terms")}>
        I agree to the{" "}
        <a href="/terms" target="_blank" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
          Terms and Conditions
        </a>{" "}
        and the{" "}
        <a href="/refund-policy" target="_blank" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
          Refund policy
        </a>
      </CheckRow>
    </div>
  )

  const beforePay = (
    <>
      {ships ? (
        <details className="group" open={initialNote ? true : undefined} data-shop-note="">
          <summary className="cursor-pointer list-none text-[14px] font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-4">Add a note for the shop</summary>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={3} className={cn(inputClass, "mt-2 h-auto py-2.5")} placeholder="Gift wrap, delivery instructions..." />
          <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{brand.name} sees it with your order.</p>
        </details>
      ) : null}
      {/* What the shop's cart asked (an imported theme's gift message, a delivery date): it goes on the order with the note. */}
      {ships && visibleAttributes(cartAttributes).length ? (
        <dl className="space-y-1 rounded-[10px] bg-[#f8f9fa] px-3.5 py-2.5 text-[13.5px]" data-cart-attributes="">
          {visibleAttributes(cartAttributes).map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-x-1.5">
              <dt className="text-[#6b7280]">{k}:</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-[#1a1a2e]">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {!isFree ? (
        <section aria-label="Invoice">
          <BusinessFields
            on={businessOn}
            onToggle={(on) => {
              setBusinessOn(on)
              setBusinessErrors({})
            }}
            value={business}
            onChange={(next) => {
              setBusiness(next)
              if (Object.keys(businessErrors).length) setBusinessErrors({})
            }}
            errors={businessErrors}
          />
        </section>
      ) : null}
      {consent}
      {error && error !== fieldError?.message ? <ErrorBanner>{error}</ErrorBanner> : null}
    </>
  )

  const payLabel = `Pay ${money(total)}`

  /* ── The order ───────────────────────────────────────────────────── */
  /* Once paying has started (or is done), the order stays as it is. */
  const editable = !busy && !paid && !settled && !arriving
  const changeLine = (line: { productId: string; variantId: string | null }, quantity: number) => {
    if (!items || !editable) return
    setLimitNote(null)
    setError(null)
    commitItems(setLineQuantity(items, line, quantity))
  }
  /* Another option of the same product (a size, an edition): the line changes, the quote prices it all again. */
  const changeVariant = (line: { productId: string; variantId: string | null }, variantId: string) => {
    if (!items || !editable) return
    const to = quote?.choices?.[line.productId]?.variants.find((v) => v.id === variantId)
    if (!to) return
    setLimitNote(null)
    setError(null)
    commitItems(setLineVariant(items, line, variantId), { productId: line.productId, from: line.variantId ?? null, to: { variantId, variantName: to.name || null, priceCents: to.priceCents } })
  }
  const discountCents = t?.discountCents ?? 0
  const shippingPaid = t ? t.shippingCents - t.shippingDiscountCents : 0
  const details = quote ? (
    <div className="space-y-6">
      <ul className="space-y-4" data-lines="">
        {quote.lines.map((l) => (
          <li key={`${l.productId}:${l.variantId ?? ""}`} data-line-item="" className="flex items-start gap-3.5">
            <LineImage url={l.imageUrl} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">{l.title}</p>
              <VariantEdit
                choices={quote.choices?.[l.productId]}
                currentId={l.variantId}
                currentName={l.variantName}
                title={l.title}
                busy={quoting}
                editable={editable}
                onChange={(v) => changeVariant(l, v)}
              />
              {editable ? (
                <LineControls
                  title={l.variantName ? `${l.title}, ${l.variantName}` : l.title}
                  quantity={l.quantity}
                  max={l.maxQuantity ?? l.quantity}
                  stepper={l.type === "physical"}
                  busy={quoting}
                  onChange={(q) => changeLine(l, q)}
                />
              ) : (
                <p className="mt-0.5 text-[12.5px] text-[#6b7280]">Qty {l.quantity}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{money(l.unitCents * l.quantity - l.discountCents)}</p>
              {l.discountCents > 0 ? <p className="text-[12px] tabular-nums text-[#9ca3af] line-through">{money(l.unitCents * l.quantity)}</p> : null}
            </div>
          </li>
        ))}
        {/* No option chosen yet (a size, a colour): chosen right here, never dropped from the order. */}
        {(quote.needsOption ?? []).map((l) => (
          <li key={`choose:${l.productId}`} data-line-item="" data-line-needs-option="" className="flex items-start gap-3.5">
            <LineImage url={l.imageUrl} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">{l.title}</p>
              <VariantEdit choices={quote.choices?.[l.productId]} currentId={null} currentName={null} title={l.title} busy={quoting} editable={editable} startOpen onChange={(v) => changeVariant({ productId: l.productId, variantId: null }, v)} />
              {editable ? (
                <LineControls title={l.title} quantity={l.quantity} max={l.quantity} stepper={false} busy={quoting} onChange={(q) => changeLine({ productId: l.productId, variantId: null }, q)} />
              ) : null}
            </div>
          </li>
        ))}
        {/* Short of stock: kept in the order with what is left, to lower or remove here rather than back on the site. */}
        {(quote.short ?? []).map((l) => (
          <li key={`short:${l.productId}:${l.variantId ?? ""}`} data-line-item="" data-line-short="" className="flex items-start gap-3.5">
            <LineImage url={l.imageUrl} muted />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">{l.title}</p>
              <p className="mt-0.5 text-[13px] text-[#b91c1c]">{l.available > 0 ? `Only ${l.available} left` : "Sold out"}</p>
              {/* A size that sold out is changed to one in stock right here. */}
              {editable && l.variantId && quote.choices?.[l.productId] ? (
                <VariantEdit choices={quote.choices[l.productId]} currentId={l.variantId} currentName={null} title={l.title} busy={quoting} onChange={(v) => changeVariant(l, v)} />
              ) : null}
              {editable ? (
                <LineControls
                  title={l.title}
                  quantity={l.quantity}
                  max={l.available}
                  stepper={l.available > 0}
                  busy={quoting}
                  onChange={(q) => changeLine(l, Math.min(q, l.available))}
                  fix={l.available > 0 ? () => changeLine(l, l.available) : undefined}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-black/[0.07] pt-5">
        <Totals
          currency={currency}
          part="top"
          subtotal={t?.itemsSubtotalCents ?? 0}
          discountCents={discountCents}
          discountLabel={quote.coupon?.code}
          total={total}
          promo={
            <DiscountForm
              code={code}
              onCode={(v) => {
                setCode(v)
                setCodeError(null)
              }}
              applied={!!appliedCode && !!quote.coupon}
              label={quote.coupon?.label || ""}
              busy={quoting && code.trim() !== "" && appliedCode === code.trim()}
              error={codeError}
              onApply={() => {
                if (!code.trim()) return
                setCodeError(null)
                setAppliedCode(code.trim())
              }}
              onRemove={() => {
                setAppliedCode(null)
                setCode("")
                setCodeError(null)
              }}
              idSuffix=""
            />
          }
        />
        {(quote.offers ?? []).length > 0 || ships || (t && t.taxCents > 0 && !t.taxIncluded) ? (
          <dl className="mt-3 space-y-3 text-[14px]">
            {(quote.offers ?? []).map((o) => (
              <div key={o.title} className="flex justify-between gap-4" data-offer-saving="">
                <dt className="truncate text-[#6b7280]">{o.title}</dt>
                <dd className="shrink-0 tabular-nums text-[#6b7280]">−{money(o.savedCents)}</dd>
              </div>
            ))}
            {ships ? (
              <div className="flex justify-between gap-4" data-shipping-line="">
                <dt className="text-[#6b7280]">{mode === "pickup" ? "Pickup" : "Shipping"}</dt>
                <dd className="tabular-nums text-[#6b7280]">{mode === "pickup" ? "Free" : !optionId ? (quote.delivery.needsRegion && !address.region.trim() ? `Choose your ${(addressFormat(address.country).region?.label ?? "state").toLowerCase()}` : address.country ? "Not available" : "Enter your address") : shippingPaid === 0 ? "Free" : money(shippingPaid)}</dd>
              </div>
            ) : null}
            {t && t.taxCents > 0 && !t.taxIncluded ? (
              <div className="flex justify-between gap-4" data-tax-line="">
                <dt className="text-[#6b7280]">{t.taxLabel || "Tax"}</dt>
                <dd className="tabular-nums text-[#6b7280]">{money(t.taxCents)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <div className="mt-5">
          <Totals currency={currency} part="bottom" subtotal={t?.itemsSubtotalCents ?? 0} discountCents={discountCents} total={total} />
          {currencyNote ? <p className="mt-2 text-[13px] leading-5 text-[#6b7280]" data-currency-note="">{currencyNote}</p> : null}
          {t && t.taxCents > 0 && t.taxIncluded ? <p className="mt-2 text-[13px] text-[#6b7280]">Includes {money(t.taxCents)} {(t.taxLabel || "tax").replace(/^Tax\b/, "tax")}</p> : null}
        </div>
      </div>
    </div>
  ) : (
    <div aria-busy className="skeleton-deferred checkout-shimmer-soft space-y-4">
      <div className="h-12 rounded-[8px] bg-[#eceef1]" />
      <div className="h-4 w-40 rounded-[6px] bg-[#eceef1]" />
    </div>
  )

  /* ── Nothing to pay for ──────────────────────────────────────────── */
  /* The last line removed (or an empty cart): straight back to the website, where the buyer came from, never a "Your cart is empty" page on its own. */
  if (items !== null && items.length === 0) {
    return <BackToShop to={backTo} />
  }
  if (!quote && quoteError && !quoting) {
    return <SiteProblem brand={brand} backTo={backTo} shopUrl={shopUrl} title="This cart can't be paid for yet" message={quoteError} />
  }
  if (onlyOwned) return <SiteOwned brand={brand} backTo={backTo} shopUrl={shopUrl} owned={owned} accountUrl={accountUrl} />

  let payment: React.ReactNode
  if (isFree) {
    payment = (
      <div>
        <section aria-labelledby="checkout-contact-free">
          <SectionTitle>
            <span id="checkout-contact-free">Contact information</span>
          </SectionTitle>
          <div className="space-y-3">
            <Field id="checkout-email" label="Email" error={errorOf("email")}>
              <TextInput id="checkout-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} readOnly={!!lockedEmail} invalid={!!errorOf("email")} onChange={(e) => { setEmail(e.target.value.slice(0, 254)); clearError("email") }} />
            </Field>
            {contactExtra}
          </div>
        </section>
        {delivery ? <div className="mt-8">{delivery}</div> : null}
        <div className="mt-7 space-y-4">{beforePay}</div>
        <PayDock>
          <PayButton onClick={() => void takeFree()} busy={busy} disabled={!!paid || settled || quoting}>
            {busy ? "Processing" : ships ? "Place order" : "Get it free"}
          </PayButton>
        </PayDock>
      </div>
    )
  } else if (!quote) {
    payment = <div aria-hidden className="min-h-[520px]" />
  } else {
    payment = (
      <StripePay
        currency={currency}
        amountCents={Math.max(total, 50)}
        creatorName={brand.name}
        email={email}
        onEmail={(v) => {
          if (!lockedEmail) setEmail(v)
          clearError("email")
        }}
        emailLocked={!!lockedEmail}
        check={(kind) => check(kind)}
        createIntent={createIntent}
        payerName={() => `${firstName} ${lastName}`.trim()}
        onPaid={onPaid}
        onError={setError}
        busy={busy || !!paid || settled}
        setBusy={setBusy}
        payLabel={payLabel}
        contactExtra={contactExtra}
        afterContact={delivery}
        beforePay={beforePay}
      />
    )
  }

  const dropped = quote?.dropped ?? []

  return (
    <>
      <div
        data-page="checkout"
        data-site-checkout=""
        inert={!!paid}
        className="group/page relative min-h-screen bg-white transition-opacity duration-100 lg:bg-[#f8f9fa]"
      >
        <HtmlClass name="with-page-checkout" />
        <div aria-hidden className="pointer-events-none fixed inset-y-0 right-0 hidden w-1/2 bg-white shadow-[-8px_0_24px_-14px_rgba(17,24,39,0.11)] lg:block" />

        <ShopBar brand={brand} backTo={backTo} shopUrl={shopUrl} />

        <div className="relative mx-auto grid max-w-[1120px] lg:grid-cols-2">
          <section
            aria-label="Order summary"
            data-summary=""
            className="checkout-enter border-b border-black/[0.06] bg-[#f8f9fa] px-5 pb-6 pt-6 sm:px-8 lg:border-b-0 lg:bg-transparent lg:px-16 lg:pb-16 lg:pt-12"
          >
            <div className="mx-auto w-full max-w-[440px] lg:ml-auto lg:mr-0 lg:sticky lg:top-12">
              <div>
                <p className="text-[15px] font-medium text-[#6b7280]">Pay {brand.name}</p>
                <p data-total="" className={cn("mt-1 text-[32px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-[#1a1a2e] transition-opacity duration-150 sm:text-[36px]", quoting && "opacity-60")}>
                  {quote ? money(total) : " "}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSummaryOpen((o) => !o)}
                aria-expanded={summaryOpen}
                aria-controls="checkout-details"
                className="mt-3 inline-flex h-8 cursor-pointer items-center gap-1 rounded-[6px] bg-[#e9ebee] px-2.5 text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#e1e3e7] active:bg-[#d9dce1] lg:hidden [-webkit-tap-highlight-color:transparent]"
              >
                <span className="grid justify-items-center">
                  <span aria-hidden={!summaryOpen} className={cn("[grid-area:1/1] transition-opacity duration-200", summaryOpen ? "opacity-100" : "opacity-0")}>
                    Hide details
                  </span>
                  <span aria-hidden={summaryOpen} className={cn("[grid-area:1/1] transition-opacity duration-200", summaryOpen ? "opacity-0" : "opacity-100")}>
                    Details
                  </span>
                </span>
                <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 text-[#6b7280] transition-[rotate] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", summaryOpen && "rotate-180")} />
              </button>
              <Reveal id="checkout-details" open={summaryOpen || wide} tall>
                <div className="pt-6 lg:pt-10">{details}</div>
              </Reveal>
            </div>
          </section>

          <main className="checkout-enter px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-8 lg:px-16 lg:pb-16 lg:pt-12 [animation-delay:60ms]">
            <div className="mx-auto w-full max-w-[440px] lg:ml-0 lg:mr-auto">
              <OwnedNote owned={owned} accountUrl={accountUrl} />
              {dropped.length > 0 ? (
                <p role="status" className="mb-5 rounded-[8px] border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[13.5px] text-[#92400e]">
                  Left out of this order: {dropped.slice(0, 4).join(", ")}. {dropped.length === 1 ? "It isn't" : "They aren't"} on sale right now.
                </p>
              ) : null}
              {limitNote ? (
                <p role="status" data-limit-note="" className="mb-5 rounded-[8px] border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[13.5px] text-[#92400e]">
                  {limitNote} We lowered the quantity.
                </p>
              ) : null}
              {quote?.stockIssues.length ? (
                <div className="mb-5 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[13.5px] text-[#991b1b]">
                  {quote.stockIssues.map((s) => (
                    <p key={`${s.productId}:${s.variantId}`}>{s.available > 0 ? `${s.title}: only ${s.available} left. Lower the quantity to continue.` : `${s.title} is sold out. Remove it to continue.`}</p>
                  ))}
                </div>
              ) : null}
              {quoteError && quote ? <div className="mb-5"><ErrorBanner>{quoteError}</ErrorBanner></div> : null}
              {payment}
              <PoweredByStripe />
            </div>
          </main>
        </div>
      </div>
      <PaidOverlay state={paid ? "paid" : arriving ? "finishing" : null} total={paid?.total ?? 0} free={!!paid?.free} returningTo={siteHost} />
    </>
  )
}

/**
 * Nothing to pay for here: an empty cart, a shop that cannot take payments
 * now, a product gone from sale. Said on the shop's own page, with the way
 * back, never a blank page.
 */
/** Sends the buyer back to the website at once, with the page's own grey while it goes. */
function BackToShop({ to }: { to: string }) {
  React.useEffect(() => {
    window.location.replace(to)
  }, [to])
  return <div aria-busy className="min-h-[60vh]" data-checkout-leaving="" />
}

export function SiteProblem({ brand, backTo, shopUrl, title, message }: { brand: ShopBrand; backTo: string | null; shopUrl: string | null; title: string; message: string | null }) {
  return (
    <div data-page="checkout" data-site-checkout="" className="min-h-dvh bg-[#f8f9fa]">
      <ShopBar brand={brand} backTo={backTo} shopUrl={shopUrl} />
      <main data-checkout-problem="" className="mx-auto flex min-h-[60vh] max-w-[420px] flex-col items-center justify-center px-6 py-12 text-center">
        <ShoppingBag className="h-8 w-8 text-[#c4c8cf]" strokeWidth={1.5} aria-hidden />
        <h1 className="mt-3 text-[20px] font-semibold text-[#1a1a2e]">{title}</h1>
        {message ? <p className="mt-1.5 text-[14px] leading-6 text-[#6b7280]">{message}</p> : null}
        {backTo || shopUrl ? (
          <a href={shopUrl ?? backTo ?? "/"} className="mt-6 inline-flex h-10 items-center rounded-[9px] bg-[#1a1a2e] px-4 text-[14px] font-medium text-white hover:bg-[#2a2a40]">
            Continue shopping
          </a>
        ) : null}
      </main>
    </div>
  )
}

function LineImage({ url, muted = false }: { url: string | null; muted?: boolean }) {
  return (
    <div className={cn("relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]", muted && "opacity-60")}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center">
          <Package className="h-5 w-5 text-[#c4c7cd]" strokeWidth={1.5} />
        </span>
      )}
    </div>
  )
}

/**
 * - / + and Remove under a line, the way a shop's own checkout has them. +
 * stops at what the server says the line may hold (stock, the per order
 * limit); a download is one, so it only has Remove. Every change is priced
 * again by the server.
 */
function LineControls({ title, quantity, max, stepper, busy, onChange, fix }: { title: string; quantity: number; max: number; stepper: boolean; busy: boolean; onChange: (quantity: number) => void; fix?: () => void }) {
  const atMax = quantity >= max
  const btn = "grid h-8 w-8 place-items-center text-[#4b5563] transition-colors hover:text-[#1a1a2e] disabled:cursor-not-allowed disabled:text-[#c4c7cd] [-webkit-tap-highlight-color:transparent]"
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" data-line-controls="">
      {stepper ? (
        <div className="inline-flex h-8 items-center rounded-[8px] border border-[#e1e3e7] bg-white" style={{ boxShadow: FIELD_SHADOW }}>
          <button type="button" aria-label={`One fewer ${title}`} data-qty-minus="" disabled={quantity <= 1} onClick={() => onChange(quantity - 1)} className={btn}>
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span aria-live="polite" aria-label={`Quantity ${quantity}`} data-qty="" className={cn("min-w-7 text-center text-[13.5px] font-medium tabular-nums text-[#1a1a2e]", busy && "opacity-60")}>
            {quantity}
          </span>
          <button type="button" aria-label={`One more ${title}`} data-qty-plus="" disabled={atMax} onClick={() => onChange(quantity + 1)} className={btn}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : quantity > 1 ? (
        <span className="text-[12.5px] text-[#6b7280]">Qty {quantity}</span>
      ) : null}
      {fix && quantity > max ? (
        <button type="button" onClick={fix} className="text-[13px] font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
          Change to {max}
        </button>
      ) : null}
      <button type="button" data-line-remove="" aria-label={`Remove ${title}`} onClick={() => onChange(0)} className="text-[13px] text-[#6b7280] underline decoration-[#d9dce1] underline-offset-2 hover:text-[#1a1a2e] hover:decoration-[#1a1a2e]">
        Remove
      </button>
      {stepper && atMax && max > 1 && quantity === max ? <span className="text-[12.5px] text-[#9ca3af]">Max {max}</span> : null}
    </div>
  )
}
