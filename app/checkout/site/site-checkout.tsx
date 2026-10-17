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

import { codCountryAllowed } from "@/lib/physical/cash-on-delivery"
import * as React from "react"
import { ChevronDown, Globe2, MapPin, Minus, Package, Plus, ShoppingBag, Truck } from "lucide-react"
import { languageName } from "@/lib/markets/locales"
import { cn } from "@/lib/utils"
import { DEFAULT_CHECKOUT, type CheckoutConfig } from "@/lib/store/checkout-config"
import { applyAdjusted, fieldPlan, missingField, sameLine, setLineQuantity, setLineVariant, siteSignInHref, visibleAttributes } from "@/lib/checkout/site-checkout"
import { COUNTRIES } from "@/lib/checkout/countries"
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
import { CheckRow, ErrorBanner, Field, PayButton, PayDock, PoweredByStripe, Reveal, SectionTitle, TextInput, inputClass, useCheckoutCurrency, useMoney, FIELD_SHADOW } from "../parts/ui"
import { minimumChargeMinor } from "@/lib/store/selling-currency"
import { DiscountForm, Totals } from "../parts/order-summary"
import { BusinessFields } from "../parts/business-fields"
import { PaidOverlay } from "../parts/success"
import { StripePay, type IntentResult } from "../parts/stripe-pay"
import { VariantEdit } from "../parts/variant-edit"
import { CheckoutSuggestions, type Suggestion } from "@/components/offers/checkout-suggestions"
import { CheckoutPhone } from "../parts/phone-input"
import { ShopBar, type ShopBrand } from "../parts/shop-bar"
import { HtmlClass } from "@/components/platform/html-class"
import { OwnedNote, SiteOwned } from "./owned"
import { AccessLink } from "../parts/access-link"
import { FAIL_COPY, WAIT_MS, requestJson } from "@/lib/net/request"
import { checkoutMsg, lowerLabel } from "@/lib/markets/checkout-words"
import { estimateText, useCheckoutLang, useCountryName, useCt } from "../parts/words"
import { optimisticQuote } from "@/lib/checkout/optimistic-quote"
import { rememberCheckoutCountry } from "@/lib/checkout/checkout-country"

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
  /** The visitor browsed in a market's currency the checkout cannot charge: what the card is charged in, said under the total. */
  currencyNote?: string | null
  /** The delivery country before the first frame: the buyer's last pick here, else the website's selector's, else where they are (./page.tsx). */
  initialCountry?: string | null
  /** No page to go back to was named: the last line removed goes back where the browser came from, when that is this website. */
  backIsDefault?: boolean
  /** The language the page is drawn in (../parts/words.tsx): the route translates the order's titles into it. */
  lang?: string
  /** The website's languages, when it has more than one: the checkout's own selector under the payment. */
  languages?: string[]
}

const PAID_SCREEN_MS = 1100
const TERMS_ASK = checkoutMsg("Tick the box to agree to the Terms and Conditions.")

const LINK = "font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]"
/** "I agree to the [Terms and Conditions] and the [Refund policy]", in any language: the bracketed words are the two links, in that order. */
function agreeLine(sentence: string): React.ReactNode {
  const parts = sentence.split(/\[([^\]]+)\]/)
  const hrefs = ["/terms", "/refund-policy"]
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <a key={i} href={hrefs[(i - 1) / 2] ?? "/terms"} target="_blank" className={LINK}>
        {p}
      </a>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    ),
  )
}
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
  initialCountry = null,
  backIsDefault = false,
  lang: pageLang,
  languages,
}: SiteCheckoutProps) {
  /* The store's own currency (<CheckoutCurrency> in ./page.tsx): every amount here is in it, and the card is charged in it. */
  const money = useMoney()
  const chargeCurrency = useCheckoutCurrency()
  /* The page's words in the visitor's language (../parts/words.tsx), and the countries in it too. */
  const ct = useCt()
  const lang = useCheckoutLang()
  const countryName = useCountryName()
  /* ── The cart ────────────────────────────────────────────────────── */
  const [items, setItems] = React.useState<LinkItem[] | null>(linkItems.length ? linkItems : null)
  const [wholeCart, setWholeCart] = React.useState(linkWhole)
  const [quote, setQuote] = React.useState<SiteQuote | null>(initialQuote)
  const [quoteError, setQuoteError] = React.useState<string | null>(initialError)
  const [quoting, setQuoting] = React.useState(false)
  /* Cash on delivery chosen in the payment form: the quote is asked with it, so its fee is in the total (Settings › Checkout). */
  const [byCash, setByCash] = React.useState(false)
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
    /* The new amounts at once (lib/checkout/optimistic-quote): no fade, no wait. The server's quote replaces them when it answers. */
    if (!swap) setQuote((q) => (q ? (optimisticQuote(q, next) ?? q) : q))
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
    setLimitNote(initialQuote.adjusted.map((a) => ct("{title}: up to {limit} per order.", { title: a.title, limit: a.limit })).join(" "))
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
  /* The country the server already priced the first frame with (./page.tsx): no guess, no jump. The browser's language only when nothing was known. */
  const [address, setAddress] = React.useState<Address>(() => ({ ...EMPTY_ADDRESS, country: initialCountry ?? "" }))
  const [mode, setMode] = React.useState<"ship" | "pickup">("ship")
  /* The delivery the first quote chose, so it is not asked for again. */
  const [optionId, setOptionId] = React.useState<string | null>(initialQuote?.requiresShipping ? (initialQuote.delivery.selectedId ?? null) : null)
  const [note, setNote] = React.useState(initialNote ?? "")
  React.useEffect(() => setAddress((a) => (a.country ? a : { ...a, country: guessCountry() })), [])
  /* A country the buyer picks is the one their next checkout opens on (lib/checkout/checkout-country). */
  const firstCountry = React.useRef(address.country)
  React.useEffect(() => {
    if (address.country && address.country !== firstCountry.current) rememberCheckoutCountry(address.country)
  }, [address.country])
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
  /* What the first frame's quote was priced with: the country, and nothing typed yet. */
  const pricedWith = React.useRef(initialQuote?.requiresShipping ? `${initialCountry ?? ""}||` : "")
  React.useEffect(() => {
    if (!items || items.length === 0) return
    /* The server already priced this cart for the first frame, for this country: asked again only once something changes. */
    if (firstAsk.current && shipsKey === pricedWith.current) {
      firstAsk.current = false
      return
    }
    /* Nothing priced yet (a cart only this browser has): asked at once, not after the pause that gathers presses. */
    const wait = quote ? 150 : 0
    firstAsk.current = false
    const n = ++asked.current
    setQuoting(true)
    const t = window.setTimeout(async () => {
      try {
        /* Paying on delivery is asked with it: the total then has the shop's fee in it, as the order will. */
        const res = await call<SiteQuote>({ action: "quote", items, couponCode: appliedCode, country: address.country, region: address.region, postalCode: postalForQuote, deliveryOptionId: optionId, email, lang: pageLang ?? null, ...(byCash && config.cashOnDelivery ? { cashOnDelivery: true } : {}) })
        if (n !== asked.current) return
        if (!res.ok) {
          setQuoteError(ct(res.data.error || "Could not load your order."))
          return
        }
        const got = res.data as SiteQuote
        setQuoteError(null)
        setQuote(got)
        /* Over a product's per order limit: the server lowered it; the cart here (and the site's) takes the same number. */
        if (got.adjusted?.length) {
          setLimitNote(got.adjusted.map((a) => ct("{title}: up to {limit} per order.", { title: a.title, limit: a.limit })).join(" "))
          commitItems(applyAdjusted(items, got.adjusted))
        }
        if (got.couponError) {
          setCodeError(ct(got.couponError))
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
        if (n === asked.current) setQuoteError(ct("Check your connection and try again."))
      } finally {
        if (n === asked.current) setQuoting(false)
      }
    }, wait)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, appliedCode, shipsKey, optionId, byCash])

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
    return { ok: res.ok, message: ct(res.data.message || res.data.error || (res.ok ? "Check your inbox." : "That didn't go through. Try again in a moment.")) }
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
  const [paid, setPaid] = React.useState<{ total: number; free: boolean; cash?: boolean } | null>(null)
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
      /* The thank you page in the language this page was in. */
      const next = pageLang ? `${thanks}${thanks.includes("?") ? "&" : "?"}lang=${encodeURIComponent(pageLang)}` : thanks
      window.setTimeout(() => window.location.replace(next), PAID_SCREEN_MS)
    },
    [wholeCart, shopId, pageLang],
  )

  const finish = React.useCallback(
    async (paymentIntentId: string, clientSecret: string) => {
      const url = new URL(window.location.href)
      url.searchParams.set("payment_intent", paymentIntentId)
      url.searchParams.set("payment_intent_client_secret", clientSecret)
      url.searchParams.set("redirect_status", "succeeded")
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
      let last = ct("Your payment went through. The order is still being saved: refresh this page in a moment. You will not be charged again.")
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
          last = res.data.error ? ct(res.data.error) : last
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
      setError(ct("The bank did not approve the payment. Nothing was charged. Try again or use another card."))
      return
    }
    if (status === "processing" || status === "pending") {
      clear()
      setSettled(true)
      setError(ct("Your bank is still processing the payment. The receipt will be emailed to you as soon as it clears."))
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
    /* Said in the visitor's language: a sentence with blanks where the English names the country and its own example. */
    const said = r.say ? ct(r.say.template, { ...r.say.vars, label: ct(r.say.vars.label ?? ""), country: countryName(r.say.vars.country ?? "") }) : ct(r.error)
    setBusinessErrors({ [r.field]: said })
    const field = document.getElementById(`business-${r.field === "postalCode" ? "postal" : r.field === "taxId" ? "tax" : r.field}`)
    if (field) bringIntoView(field, true)
    return said
  }

  const check = (kind: "card" | "express" | "free"): string | null => {
    if (paid || settled) return ct("This order is already paid.")
    setFieldError(null)
    if (needsSignIn) {
      const box = document.querySelector<HTMLElement>("[data-checkout-account]")
      if (box) bringIntoView(box)
      return ct("Sign in to check out.")
    }
    if (!quote || (quote.lines.length === 0 && !(quote.short ?? []).length && !(quote.needsOption ?? []).length)) return quoteError || ct("Your cart is empty.")
    if (quoting) return ct("Your order is being updated. Try again in a moment.")
    if ((quote.needsOption ?? []).length) {
      const row = document.querySelector<HTMLElement>("[data-line-needs-option]")
      if (row) bringIntoView(row)
      return ct("Choose an option for {title}.", { title: quote.needsOption![0].title })
    }
    if (quote.stockIssues.length) return ct("Some items don't have enough stock. Lower the quantity or remove them to continue.")
    if (kind !== "free" && total > 0 && total < minimumChargeMinor(chargeCurrency)) return ct("The smallest card payment is {amount}.", { amount: money(minimumChargeMinor(chargeCurrency)) })
    if (kind !== "express" || ships) {
      const m = missingField(plan, { email, first: firstName, last: lastName, company: address.company, phone: address.phone, line2: address.line2 })
      if (m === "email") return missing("email", ct("Enter a valid email address."))
      if (m === "name") return missing(splitName ? "first" : "name", ct("Enter your name."))
      if (m === "last") return missing(splitName ? "last" : "name", ct("Enter your first and last name."))
      if (m === "company") return missing("company", ct("Enter the company name."))
      if (m === "phone") return missing("phone", address.phone.trim() ? ct("Check the phone number.") : ct("Enter a phone number."))
      if (m === "line2") return missing("line2", ct("Enter the apartment, suite or unit."))
    }
    if (ships && mode === "ship") {
      if (!address.country) return missing("country", ct("Choose a country."))
      if (!address.line1.trim()) return missing("line1", ct("Enter the street address."))
      if (!address.city.trim()) return missing("city", ct("Enter the city."))
      if (postalCodeRequired(address.country) && !address.postalCode.trim()) return missing("postal", ct(`Enter the ${lowerLabel(addressFormat(address.country).postal.label)}.`))
      if ((quote.delivery.needsRegion || addressFormat(address.country).region?.required) && !address.region.trim()) return missing("region", addressFormat(address.country).region ? ct(`Choose your ${lowerLabel(addressFormat(address.country).region!.label)}.`) : ct("Choose your state or province."))
      if (!optionId) return quote.delivery.needsCountry ? ct("Choose your country to see delivery options.") : ct("Shipping isn't available to this address.")
    }
    if (ships && mode === "pickup" && !optionId) return ct("Choose a pickup point.")
    if (kind !== "free") {
      const b = checkBusinessNow()
      if (b) return b
    }
    if (!agreed) {
      const terms = document.getElementById("checkout-terms")
      if (terms) bringIntoView(terms)
      return ct(TERMS_ASK)
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
      /* With the language this page is in, so the buyer's emails are written in it (lib/emails/words.ts). */
      origin: pageLang ? { ...(checkoutOrigin(shopId) ?? {}), lang: pageLang } : checkoutOrigin(shopId),
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
    const res = await call<{ clientSecret?: string; paymentIntentId?: string; thanks?: string; free?: boolean }>({ action: "intent", ...body, paymentMethods: methods, clientKey: key, replaces: before && before.key !== key ? before.key : null })
    /* A code took it to 0 since the page was priced: the server placed it as a free order. Its thank you page; the card form never opens. */
    if (res.ok && res.data.free && typeof res.data.thanks === "string") {
      setPaid({ total: 0, free: true })
      go(res.data.thanks)
      return new Promise<IntentResult>(() => {})
    }
    if (!res.ok || !res.data.clientSecret || !res.data.paymentIntentId) {
      const field = res.data.field as keyof BusinessDetails | undefined
      if (field && field in EMPTY_BUSINESS) setBusinessErrors({ [field]: ct(res.data.error || "Check this field.") })
      /* A failed start is a new checkout next time, which lets this one's stock go first (if it held any). */
      intentKey.current = { key, sig: "", at: 0 }
      throw new Error(ct(res.data.error || "The payment could not be started. Nothing was charged."))
    }
    secretRef.current = res.data.clientSecret
    return { clientSecret: res.data.clientSecret, paymentIntentId: res.data.paymentIntentId }
  }

  const onPaid = async (paymentIntentId: string, status: string) => {
    if (status === "processing") {
      setSettled(true)
      setError(ct("Your bank is still processing the payment. The receipt will be emailed to you as soon as it clears."))
      return
    }
    if (status !== "succeeded") {
      setError(ct("The payment was not completed. Nothing was charged. Try again."))
      return
    }
    await finish(paymentIntentId, secretRef.current || "")
  }

  /*
    CASH ON DELIVERY (lib/physical/cash-on-delivery.ts): the order is placed
    now and paid when it arrives. Under the same key as the card payment for
    the same order, so a card checkout already started for it lets its stock
    go on the server, and a second press finds the order already placed.
  */
  const placeCash = async () => {
    if (busy) return
    setBusy(true)
    try {
      const body = orderBody()
      const sig = JSON.stringify([body.items, body.couponCode, body.address, body.deliveryOptionId, body.email, body.firstName, body.lastName, body.phone, body.buyerNote, body.cartAttributes, body.emailOptIn])
      const before = intentKey.current
      const key = before && before.sig === sig ? before.key : newKey()
      intentKey.current = { key, sig, at: key === before?.key ? before.at : Date.now() }
      const res = await call<{ thanks?: string }>({ action: "cod", ...body, clientKey: key, replaces: before && before.key !== key ? before.key : null })
      if (!res.ok || !res.data.thanks) {
        const field = res.data.field as keyof BusinessDetails | undefined
        if (field && field in EMPTY_BUSINESS) setBusinessErrors({ [field]: ct(res.data.error || "Check this field.") })
        /* The server said no: the next press is a new order. A request that never got an answer keeps its key, so pressing again finds the order if it was placed. */
        intentKey.current = { key, sig: "", at: 0 }
        throw new Error(ct(res.data.error || "The order could not be placed. Nothing was charged. Try again."))
      }
      setPaid({ total, free: false, cash: true })
      go(res.data.thanks)
    } catch (e) {
      setError(e instanceof Error ? ct(e.message) : ct("The order could not be placed. Nothing was charged. Try again."))
    } finally {
      setBusy(false)
    }
  }
  /* Offered when the shop takes cash and everything in the order is delivered or picked up (codRefusal says the same on the server). */
  /* Something to pay, as the shipped checkout asks: a cart a code takes to 0 is placed as free. */
  const cashOffered =
    config.cashOnDelivery &&
    ships &&
    !!quote &&
    quote.lines.length > 0 &&
    quote.lines.every((l) => l.type === "physical") &&
    (quote.totals.totalCents ?? 0) > 0 &&
    /* Only to the countries the shop takes cash in; a pickup is paid where it is picked up. */
    (mode === "pickup" || codCountryAllowed(config.codCountries, address.country))

  const takeFree = async () => {
    if (busy) return
    setError(null)
    const problem = check("free")
    if (problem) return setError(problem)
    setBusy(true)
    try {
      const body = orderBody()
      const res = await call<{ thanks?: string }>({ action: "free", ...body, business: null, clientKey: newKey() })
      if (!res.ok || !res.data.thanks) throw new Error(ct(res.data.error || "The order could not be finished. Try again."))
      setPaid({ total: 0, free: true })
      go(res.data.thanks)
    } catch (e) {
      setError(e instanceof Error ? ct(e.message) : ct("The order could not be finished. Try again."))
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
      <Field id="checkout-first" label={ct("First name")} error={errorOf("first")}>
        <TextInput id="checkout-first" autoComplete="given-name" placeholder="Jane" value={firstOnly} invalid={!!errorOf("first")} onChange={(e) => { setFirstOnly(e.target.value.slice(0, 60)); clearError("first") }} />
      </Field>
      <Field id="checkout-last" label={ct("Last name")} error={errorOf("last")}>
        <TextInput id="checkout-last" autoComplete="family-name" placeholder="Smith" value={lastOnly} invalid={!!errorOf("last")} onChange={(e) => { setLastOnly(e.target.value.slice(0, 60)); clearError("last") }} />
      </Field>
    </div>
  ) : (
    <Field id="checkout-name" label={ct("Full name")} error={errorOf("name")}>
      <TextInput id="checkout-name" autoComplete="name" placeholder="Jane Smith" value={fullName} invalid={!!errorOf("name")} onChange={(e) => { setFullName(e.target.value.slice(0, 121)); clearError("name") }} />
    </Field>
  )

  const newsBox = plan.newsBox ? (
    <CheckRow id="checkout-news" checked={emailOptIn} onChange={setEmailOptIn}>
      {ct("Email me with news and offers")}
    </CheckRow>
  ) : null

  const account = needsSignIn ? (
    <div className="rounded-xl border border-[#d9dce1] bg-[#f8f9fa] px-4 py-3.5" data-checkout-account="sign-in">
      <p className="text-[14.5px] font-semibold text-[#1a1a2e]">{ct("Sign in to check out")}</p>
      <p className="mt-0.5 text-[13px] leading-[19px] text-[#4b5563]">{ct("{shop} asks you to sign in before you order. We'll email you a code.", { shop: brand.name })}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <a href={siteSignInHref(here)} className="inline-flex h-9 items-center rounded-[10px] bg-[#1a1a2e] px-3.5 text-[13.5px] font-medium text-white">
          {ct("Sign in")}
        </a>
      </div>
    </div>
  ) : lockedEmail ? (
    <p className="text-[13px] text-[#6b7280]" data-checkout-account="signed-in">
      {ct("Signed in as {email}.", { email: lockedEmail })}{" "}
      <a href="/account/logout" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2">
        {ct("Sign out")}
      </a>
    </p>
  ) : null

  const addressField = (key: keyof Address, label: string, props: React.InputHTMLAttributes<HTMLInputElement> & { id: string }) => (
    <Field id={props.id} label={label} error={errorOf(props.id.replace("checkout-", "")) ?? (key === "region" && regionAsked ? ct("Enter it to see delivery options.") : null)}>
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
    <Field id="checkout-phone" label={plan.phone === "required" ? ct("Phone") : ct("Phone (optional)")} error={errorOf("phone")}>
      <CheckoutPhone
        id="checkout-phone"
        value={address.phone}
        country={address.country}
        placeholder={ct("Phone")}
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
    <Field id={id} label={label} error={errorOf(id.replace("checkout-", "")) ?? (id === "checkout-region" && regionAsked && fmt.region ? ct(`Choose your ${lowerLabel(fmt.region.label)} to see delivery options.`) : null)}>
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
    /* Named and sorted in the visitor's language. */
    const all = COUNTRIES.map((c) => ({ code: c.code, name: countryName(c.code) })).sort((a, b) => a.name.localeCompare(b.name, lang))
    if (!shipsTo || shipsTo.length === 0) return all
    return all.filter((c) => shipsTo.includes(c.code) || c.code === address.country)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipsToKey, address.country, lang])

  const delivery = ships && quote ? (
    <div className="space-y-8">
      <section aria-labelledby="checkout-delivery">
        <SectionTitle>
          <span id="checkout-delivery">{ct("Delivery")}</span>
        </SectionTitle>
        {(quote.pickups?.length ?? 0) > 0 ? (
          <div role="radiogroup" aria-label={ct("Delivery or pickup")} className="mb-4 grid grid-cols-2 gap-2">
            {(
              [
                { id: "ship", label: ct("Ship"), icon: Truck },
                { id: "pickup", label: ct("Pick up"), icon: MapPin },
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
                  <span className="text-[14px] font-medium text-[#1a1a2e]">{ct("Free")}</span>
                </label>
              ))}
            </div>
            {nameFields}
            {plan.phone !== "off" ? phoneField : null}
          </div>
        ) : (
          <div className="space-y-3">
            {select("checkout-country", ct("Country/region"), address.country, countryChoices, (v) => setAddress((a) => ({ ...a, country: v, region: "" })), "country")}
            {nameFields}
            {plan.company !== "off" ? addressField("company", plan.company === "required" ? ct("Company") : ct("Company (optional)"), { id: "checkout-company", autoComplete: "organization", placeholder: ct("Company") }) : null}
            {addressField("line1", ct("Address"), { id: "checkout-line1", autoComplete: "address-line1", placeholder: ct("Address") })}
            {plan.address2 !== "off" ? addressField("line2", plan.address2 === "required" ? ct("Apartment, suite or unit") : ct("Apartment, suite, etc. (optional)"), { id: "checkout-line2", autoComplete: "address-line2", placeholder: ct("Apartment") }) : null}
            <div className={cn("grid gap-3", fmt.region ? "grid-cols-2 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1" : "grid-cols-2")}>
              {addressField("city", ct("City"), { id: "checkout-city", autoComplete: "address-level2", placeholder: ct("City") })}
              {!fmt.region
                ? null
                : regions.length
                  ? select("checkout-region", ct(fmt.region.label), address.region, regions.map((r) => ({ code: r.code, name: r.name })), (v) => setAddress((a) => ({ ...a, region: v })), "address-level1")
                  : addressField("region", fmt.region.required ? ct(fmt.region.label) : ct("{field} (optional)", { field: ct(fmt.region.label) }), { id: "checkout-region", autoComplete: "address-level1", placeholder: oneWord(ct(fmt.region.label)) })}
              {addressField("postalCode", postalCodeRequired(address.country || "US") ? ct(fmt.postal.label) : ct("{field} (optional)", { field: ct(fmt.postal.label) }), { id: "checkout-postal", autoComplete: "postal-code", placeholder: oneWord(ct(fmt.postal.label)) })}
            </div>
            {plan.phone !== "off" ? phoneField : null}
          </div>
        )}
      </section>

      {mode === "ship" ? (
        <section aria-labelledby="checkout-method" data-shipping-method="">
          <SectionTitle>
            <span id="checkout-method">{ct("Shipping method")}</span>
          </SectionTitle>
          {quote.delivery.needsCountry || (quote.delivery.needsRegion && !address.region.trim()) ? (
            <p className="rounded-[8px] bg-[#f7f7f8] px-3.5 py-3 text-[14px] text-[#6b7280]" data-needs-region={quote.delivery.needsRegion ? "" : undefined}>
              {quote.delivery.needsCountry ? ct("Choose your country to see delivery options.") : fmt.region ? ct(`Choose your ${lowerLabel(fmt.region.label)} to see delivery options.`) : ct("Choose your state or province to see delivery options.")}
            </p>
          ) : !quote.delivery.ok || quote.delivery.options.length === 0 ? (
            <div className="rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 text-[14px] text-[#991b1b]" data-no-shipping="">
              <p className="font-medium">{notServed ? ct("We don't ship to {country}.", { country: countryName(address.country) }) : address.country ? ct("Shipping isn't available to {country}.", { country: countryName(address.country) }) : ct("Shipping isn't available to this address.")}</p>
              {/* The server names what can't come and why (lib/physical/rates unshippableMessage). */}
              <p className="mt-0.5 text-[13.5px]">{notServed ? ((quote.pickups?.length ?? 0) > 0 ? ct("Choose a country we ship to, or pick it up instead.") : ct("Choose a country we ship to.")) : !quote.delivery.ok && quote.delivery.error ? ct(quote.delivery.error) : (quote.pickups?.length ?? 0) > 0 ? ct("You can choose Pick up instead.") : ct("Try another address, or contact the shop.")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[8px] border border-[#e1e3e7]" style={{ boxShadow: FIELD_SHADOW }}>
              {quote.delivery.options.map((o) => (
                <label key={o.id} className={cn(choiceRow(optionId === o.id), "items-center")}>
                  <input type="radio" name="delivery" checked={optionId === o.id} onChange={() => setOptionId(o.id)} className="h-4 w-4 accent-[#1a1a2e]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-[#1a1a2e]">{o.name}</span>
                    {o.estimate ? <span className="block text-[13px] text-[#6b7280]">{estimateText(ct, o.estimate)}</span> : null}
                  </span>
                  {/* A free shipping code: every method is free, and what it would have cost is shown struck through. */}
                  {quote.coupon?.freeShipping && o.priceCents > 0 ? (
                    <span className="text-right text-[14px] font-medium tabular-nums text-[#1a1a2e]">
                      <s className="mr-1.5 font-normal text-[#6b7280]">{money(o.priceCents)}</s>{ct("Free")}
                    </span>
                  ) : (
                    <span className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{o.priceCents === 0 ? ct("Free") : money(o.priceCents)}</span>
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
      <CheckRow id="checkout-agree" checked={agreed} onChange={(v) => { setAgreed(v); if (v) setError(null) }} invalid={!agreed && error === ct(TERMS_ASK)}>
        {/* One sentence with its two links, in the visitor's language: the words around them are the translation's. */}
        {agreeLine(ct("I agree to the [Terms and Conditions] and the [Refund policy]"))}
      </CheckRow>
    </div>
  )

  const beforePay = (
    <>
      {ships ? (
        <details className="group" open={initialNote ? true : undefined} data-shop-note="">
          <summary className="cursor-pointer list-none text-[14px] font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-4">{ct("Add a note for the shop")}</summary>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={3} className={cn(inputClass, "mt-2 h-auto py-2.5")} placeholder={ct("Gift wrap, delivery instructions...")} />
          <p className="mt-1.5 text-[12.5px] text-[#6b7280]">{ct("{name} sees it with your order.", { name: brand.name })}</p>
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
        <section aria-label={ct("Invoice")}>
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
      {error && error !== fieldError?.message ? <ErrorBanner>{ct(error)}</ErrorBanner> : null}
    </>
  )

  const payLabel = ct("Pay {amount}", { amount: money(total) })

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
    commitItems(setLineVariant(items, line, variantId), { productId: line.productId, from: line.variantId ?? null, to: { variantId, variantName: to.name || null, priceCents: to.storeCents ?? to.priceCents } })
  }
  /* A checkout offer taken: into the order, and this browser's cart too when the whole cart is what is paid for. */
  const addSuggestion = (sg: Suggestion, v: { id: string; name: string; priceCents: number } | null) => {
    if (!items || !editable) return
    const variantId = sg.product.type === "physical" ? (v?.id ?? null) : null
    setLimitNote(null)
    setError(null)
    if (wholeCart) {
      try {
        const key = cartStorageKey(shopId)
        const line: CartLine = { productId: sg.product.id, variantId, title: sg.product.title, variantName: v && sg.product.variants.length > 1 ? v.name : null, priceCents: v?.priceCents ?? sg.product.priceCents, thumbnailUrl: sg.product.imageUrl, slug: sg.product.slug, digital: sg.product.type !== "physical", physical: sg.product.type === "physical", quantity: 1 }
        window.localStorage.setItem(key, serializeCart([...parseCart(window.localStorage.getItem(key)), line]))
      } catch {
        /* storage refused: the order still has it */
      }
    }
    commitItems([...items.filter((x) => !(x.productId === sg.product.id && (x.variantId ?? null) === variantId)), { productId: sg.product.id, variantId, quantity: 1 }])
  }
  /* The code's part: each bundle and upsell is its own line below (quote.offers), so it isn't counted in the discount line as well. */
  const offersSaved = (quote?.offers ?? []).reduce((n, o) => n + o.savedCents, 0)
  const discountCents = Math.max(0, (t?.discountCents ?? 0) - offersSaved)
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
                <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{ct("Qty {quantity}", { quantity: l.quantity })}</p>
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
              <p className="mt-0.5 text-[13px] text-[#b91c1c]">{l.available > 0 ? ct("Only {count} left", { count: l.available }) : ct("Sold out")}</p>
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
      {/* The store's checkout offers this order qualifies for (lib/offers): one press puts it in the order, and the quote prices it again on the server. */}
      <CheckoutSuggestions suggestions={editable ? (quote.suggestions ?? []) : []} onAdd={addSuggestion} busy={quoting} />
      <div className="border-t border-black/[0.07] pt-5">
        <Totals
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
                <dt className="text-[#6b7280]">{mode === "pickup" ? ct("Pickup") : ct("Shipping")}</dt>
                <dd className="tabular-nums text-[#6b7280]">{mode === "pickup" ? ct("Free") : !optionId ? (quote.delivery.needsRegion && !address.region.trim() ? (fmt.region ? ct(`Choose your ${lowerLabel(fmt.region.label)}.`) : ct("Choose your state or province.")) : address.country ? ct("Not available") : ct("Enter your address")) : shippingPaid === 0 ? ct("Free") : money(shippingPaid)}</dd>
              </div>
            ) : null}
            {t && (t.codFeeCents ?? 0) > 0 ? (
              <div className="flex justify-between gap-4" data-cod-fee="">
                <dt className="text-[#6b7280]">{ct("Cash on delivery fee")}</dt>
                <dd className="tabular-nums text-[#6b7280]">{money(t.codFeeCents ?? 0)}</dd>
              </div>
            ) : null}
            {t && t.taxCents > 0 && !t.taxIncluded ? (
              <div className="flex justify-between gap-4" data-tax-line="">
                <dt className="text-[#6b7280]">{t.taxLabel ? ct(t.taxLabel) : ct("Tax")}</dt>
                <dd className="tabular-nums text-[#6b7280]">{money(t.taxCents)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <div className="mt-5">
          <Totals part="bottom" subtotal={t?.itemsSubtotalCents ?? 0} discountCents={discountCents} total={total} />
          {currencyNote ? <p className="mt-2 text-[13px] leading-5 text-[#6b7280]" data-currency-note="">{currencyNote}</p> : null}
          {t && t.taxCents > 0 && t.taxIncluded ? <p className="mt-2 text-[13px] text-[#6b7280]">{t.taxLabel && t.taxLabel !== "Tax" ? ct("Includes {amount} {tax}", { amount: money(t.taxCents), tax: ct(t.taxLabel) }) : ct("Includes {amount} tax", { amount: money(t.taxCents) })}</p> : null}
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
    return <BackToShop to={backTo} orReferrer={backIsDefault} />
  }
  if (!quote && quoteError && !quoting) {
    return <SiteProblem brand={brand} backTo={backTo} shopUrl={shopUrl} title={ct("This cart can't be paid for yet")} message={quoteError} />
  }
  if (onlyOwned) return <SiteOwned brand={brand} backTo={backTo} shopUrl={shopUrl} owned={owned} accountUrl={accountUrl} />

  let payment: React.ReactNode
  if (isFree) {
    payment = (
      <div>
        <section aria-labelledby="checkout-contact-free">
          <SectionTitle>
            <span id="checkout-contact-free">{ct("Contact information")}</span>
          </SectionTitle>
          <div className="space-y-3">
            <Field id="checkout-email" label={ct("Email")} error={errorOf("email")}>
              <TextInput id="checkout-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} readOnly={!!lockedEmail} invalid={!!errorOf("email")} onChange={(e) => { setEmail(e.target.value.slice(0, 254)); clearError("email") }} />
            </Field>
            {contactExtra}
          </div>
        </section>
        {delivery ? <div className="mt-8">{delivery}</div> : null}
        <div className="mt-7 space-y-4">{beforePay}</div>
        <PayDock>
          <PayButton onClick={() => void takeFree()} busy={busy} disabled={!!paid || settled || quoting}>
            {busy ? ct("Processing") : ships ? ct("Place order") : ct("Get it free")}
          </PayButton>
        </PayDock>
      </div>
    )
  } else if (!quote) {
    payment = <div aria-hidden className="min-h-[520px]" />
  } else {
    payment = (
      <StripePay
        amountCents={Math.max(total, 50)}
        creatorName={brand.name}
        email={email}
        onEmail={(v) => {
          if (!lockedEmail) setEmail(v)
          clearError("email")
        }}
        emailLocked={!!lockedEmail}
        emailError={errorOf("email")}
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
        cash={
          cashOffered
            ? {
                note: mode === "pickup" ? ct("Pay {amount} in cash when you pick it up.", { amount: money(total) }) : ct("Pay {amount} in cash when it's delivered.", { amount: money(total) }),
                place: placeCash,
                instructions: config.codInstructions || null,
                aside: config.codFeeCents > 0 ? ct("Cash on delivery adds a fee of {amount}.", { amount: money(config.codFeeCents) }) : null,
                onChoose: setByCash,
              }
            : null
        }
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
            aria-label={ct("Order summary")}
            data-summary=""
            className="checkout-enter border-b border-black/[0.06] bg-[#f8f9fa] px-5 pb-6 pt-6 sm:px-8 lg:border-b-0 lg:bg-transparent lg:px-16 lg:pb-16 lg:pt-12"
          >
            <div className="mx-auto w-full max-w-[440px] lg:ml-auto lg:mr-0 lg:sticky lg:top-12">
              <div>
                <p className="text-[15px] font-medium text-[#6b7280]">{ct("Pay {shop}", { shop: brand.name })}</p>
                <p data-total="" className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-[#1a1a2e] sm:text-[36px]">
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
                    {ct("Hide details")}
                  </span>
                  <span aria-hidden={summaryOpen} className={cn("[grid-area:1/1] transition-opacity duration-200", summaryOpen ? "opacity-0" : "opacity-100")}>
                    {ct("Details")}
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
                  {dropped.length === 1 ? ct("Left out of this order: {items}. It isn't on sale right now.", { items: dropped[0] }) : ct("Left out of this order: {items}. They aren't on sale right now.", { items: dropped.slice(0, 4).join(", ") })}
                </p>
              ) : null}
              {limitNote ? (
                <p role="status" data-limit-note="" className="mb-5 rounded-[8px] border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-[13.5px] text-[#92400e]">
                  {limitNote} {ct("We lowered the quantity.")}
                </p>
              ) : null}
              {quote?.stockIssues.length ? (
                <div className="mb-5 rounded-[8px] border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2.5 text-[13.5px] text-[#991b1b]">
                  {quote.stockIssues.map((s) => (
                    <p key={`${s.productId}:${s.variantId}`}>{s.available > 0 ? ct("{title}: only {count} left. Lower the quantity to continue.", { title: s.title, count: s.available }) : ct("{title} is sold out. Remove it to continue.", { title: s.title })}</p>
                  ))}
                </div>
              ) : null}
              {quoteError && quote ? <div className="mb-5"><ErrorBanner>{ct(quoteError)}</ErrorBanner></div> : null}
              {payment}
              <PoweredByStripe />
              {languages && pageLang ? <CheckoutLanguageSelect current={pageLang} languages={languages} /> : null}
            </div>
          </main>
        </div>
      </div>
      <PaidOverlay state={paid ? "paid" : arriving ? "finishing" : null} total={paid?.total ?? 0} free={!!paid?.free} cash={!!paid?.cash} returningTo={siteHost} />
    </>
  )
}

/**
 * Nothing to pay for here: an empty cart, a shop that cannot take payments
 * now, a product gone from sale. Said on the shop's own page, with the way
 * back, never a blank page.
 */
/** Sends the buyer back to the website at once, with the page's own grey while it goes. */
function BackToShop({ to, orReferrer = false }: { to: string; orReferrer?: boolean }) {
  React.useEffect(() => {
    /* No page was named: the page of this website the buyer came from, when the browser says it (never another site, never a checkout). */
    let back = to
    if (orReferrer) {
      try {
        const from = new URL(document.referrer)
        if (from.host === window.location.host && !from.pathname.startsWith("/checkout")) back = from.href
      } catch {
        /* the website's own page, as named */
      }
    }
    window.location.replace(back)
  }, [to, orReferrer])
  return <div aria-busy className="min-h-[60vh]" data-checkout-leaving="" />
}

export function SiteProblem({ brand, backTo, shopUrl, title, message }: { brand: ShopBrand; backTo: string | null; shopUrl: string | null; title: string; message: string | null }) {
  const ct = useCt()
  return (
    <div data-page="checkout" data-site-checkout="" className="min-h-dvh bg-[#f8f9fa]">
      <ShopBar brand={brand} backTo={backTo} shopUrl={shopUrl} />
      <main data-checkout-problem="" className="mx-auto flex min-h-[60vh] max-w-[420px] flex-col items-center justify-center px-6 py-12 text-center">
        <ShoppingBag className="h-8 w-8 text-[#c4c8cf]" strokeWidth={1.5} aria-hidden />
        <h1 className="mt-3 text-[20px] font-semibold text-[#1a1a2e]">{ct(title)}</h1>
        {message ? <p className="mt-1.5 text-[14px] leading-6 text-[#6b7280]">{ct(message)}</p> : null}
        {backTo || shopUrl ? (
          <a href={shopUrl ?? backTo ?? "/"} className="mt-6 inline-flex h-10 items-center rounded-[9px] bg-[#1a1a2e] px-4 text-[14px] font-medium text-white hover:bg-[#2a2a40]">
            {ct("Continue shopping")}
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
function LineControls({ title, quantity, max, stepper, onChange, fix }: { title: string; quantity: number; max: number; stepper: boolean; busy?: boolean; onChange: (quantity: number) => void; fix?: () => void }) {
  const ct = useCt()
  const atMax = quantity >= max
  const btn = "grid h-8 w-8 place-items-center text-[#4b5563] transition-colors hover:text-[#1a1a2e] disabled:cursor-not-allowed disabled:text-[#c4c7cd] [-webkit-tap-highlight-color:transparent]"
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" data-line-controls="">
      {stepper ? (
        <div className="inline-flex h-8 items-center rounded-[8px] border border-[#e1e3e7] bg-white" style={{ boxShadow: FIELD_SHADOW }}>
          <button type="button" aria-label={ct("One fewer {title}", { title })} data-qty-minus="" disabled={quantity <= 1} onClick={() => onChange(quantity - 1)} className={btn}>
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span aria-live="polite" aria-label={ct("Quantity {quantity}", { quantity })} data-qty="" className="min-w-7 text-center text-[13.5px] font-medium tabular-nums text-[#1a1a2e]">
            {quantity}
          </span>
          <button type="button" aria-label={ct("One more {title}", { title })} data-qty-plus="" disabled={atMax} onClick={() => onChange(quantity + 1)} className={btn}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : quantity > 1 ? (
        <span className="text-[12.5px] text-[#6b7280]">{ct("Qty {quantity}", { quantity })}</span>
      ) : null}
      {fix && quantity > max ? (
        <button type="button" onClick={fix} className="text-[13px] font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
          {ct("Change to {count}", { count: max })}
        </button>
      ) : null}
      <button type="button" data-line-remove="" aria-label={ct("Remove {title}", { title })} onClick={() => onChange(0)} className="text-[13px] text-[#6b7280] underline decoration-[#d9dce1] underline-offset-2 hover:text-[#1a1a2e] hover:decoration-[#1a1a2e]">
        {ct("Remove")}
      </button>
      {stepper && atMax && max > 1 && quantity === max ? <span className="text-[12.5px] text-[#9ca3af]">{ct("Max {count}", { count: max })}</span> : null}
    </div>
  )
}

/**
 * The checkout's own language selector, under the payment: each of the
 * website's languages in its own words. A choice is kept as the website's
 * (sl_lang) and the checkout is drawn again in it (?lang=, which wins over
 * the page the visitor came from: lib/markets/checkout-language.ts). What
 * was typed is kept by the browser's own form restore, the cart by its link.
 */
function CheckoutLanguageSelect({ current, languages }: { current: string; languages: string[] }) {
  const ct = useCt()
  return (
    <div className="mt-4 flex justify-center" data-checkout-language="">
      <label className="relative inline-flex items-center gap-1.5 text-[13px] text-[#6b7280]">
        <span className="sr-only">{ct("Language")}</span>
        <Globe2 aria-hidden className="h-3.5 w-3.5" />
        <select
          value={current}
          onChange={(e) => {
            const code = e.target.value
            document.cookie = `sl_lang=${encodeURIComponent(code)}; path=/; max-age=31536000; samesite=lax`
            const url = new URL(window.location.href)
            url.searchParams.set("lang", code)
            window.location.replace(url.toString())
          }}
          className="cursor-pointer appearance-none bg-transparent pr-1 text-[13px] text-[#4b5563] underline-offset-2 outline-none hover:underline focus-visible:underline"
        >
          {languages.map((c) => (
            <option key={c} value={c}>
              {languageName(c)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
