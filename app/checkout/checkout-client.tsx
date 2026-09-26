"use client"

/**
 * ===========================================================================
 *  CHECKOUT
 * ===========================================================================
 * Paying on the left, the order on the right, the way Shopify and Stripe lay
 * a checkout out: the buyer works down one column and reads the other. On a
 * phone the order folds into a bar at the top with the total on it, and the
 * code, the tip and the arithmetic come back just above Pay, where the
 * total they change is decided.
 *
 * THREE WAYS TO PAY, ONE ORDER:
 *   web       Stripe's own elements (parts/stripe-pay.tsx): Apple Pay,
 *             Google Pay, Link and PayPal as express buttons, Link's saved
 *             cards from the email box, and a card form the browser's saved
 *             cards fill;
 *   the app   plain fields sent to Stripe directly (parts/native-card.tsx),
 *             because Stripe.js navigates the app's WebView away;
 *   free      no payment at all: /api/checkout/process.
 *
 * Every price here is the page's: the server prices the order again from
 * the database when it is paid for (lib/checkout/pricing.ts), and the order
 * itself is made from the payment by lib/checkout/fulfil-payment.ts.
 */

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { isNativeApp } from "@/lib/platform-utils"
import { getProductUrl } from "@/lib/url-helpers"
import { ReturnLink } from "@/components/navigation/return-link"
import { canReturnInApp } from "@/lib/navigation/in-app-history"
import { trackFunnelStep } from "@/lib/analytics-utils"
import { checkoutOrigin } from "@/lib/orders/checkout-origin-browser"
import { paidReturnUrl, returnHostLabel } from "@/lib/checkout/return-url"
import { EMPTY_BUSINESS, checkBusiness, type BusinessDetails } from "@/lib/checkout/business"
import { CheckRow, ErrorBanner, Field, PayButton, PoweredByStripe, SectionTitle, Spinner, TextInput, money } from "./parts/ui"
import { DiscountForm, LineItem, TipPicker, Totals, type SummaryVariant } from "./parts/order-summary"
import { BusinessFields } from "./parts/business-fields"
import { EMPTY_CARD, NativeCardFields, nativeCardComplete, type NativeCard } from "./parts/native-card"
import { PaidOverlay } from "./parts/success"
import { StripePay, type IntentResult } from "./parts/stripe-pay"
import { HtmlClass } from "@/components/platform/html-class"

interface CheckoutPageClientProps {
  product: {
    id: string
    title: string
    slug: string
    description: string | null
    price_cents: number
    thumbnail_url: string | null
    type: string
  }
  creator: {
    id: string
    name: string
    avatar_url: string | null
    username: string
  }
  userEmail: string | null
  isLoggedIn: boolean
  /**
   * The creator's own website page to land on after paying, checked on the
   * server against their sites (lib/checkout/return-url.ts). Null: the
   * Storelib receipt, as before.
   */
  returnTo?: string | null
  /** Where Back goes, checked the same way. Null: the product. */
  backTo?: string | null
  selectedVariant?: SummaryVariant | null
  isPwyw?: boolean
  customPriceCents?: number | null
  allVariants?: SummaryVariant[]
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIP_MAX_CENTS = 100_000
const MIN_CHARGE_CENTS = 50

/** Names and email survive a reload and a trip to the product page, for this tab only. */
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

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; field?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  let data = {} as T & { error?: string; field?: string }
  try {
    data = await res.json()
  } catch {
    /* an empty or HTML answer is an error with no words of its own */
  }
  return { ok: res.ok, status: res.status, data }
}

export default function CheckoutPageClient({
  product,
  creator,
  userEmail,
  returnTo = null,
  backTo = null,
  selectedVariant: initialVariant,
  isPwyw,
  customPriceCents,
  allVariants = [],
}: CheckoutPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  /* ── Who ─────────────────────────────────────────────────────────── */
  const [email, setEmail] = React.useState(() => searchParams.get("email") || userEmail || "")
  /* One "Full name" box, as Stripe asks for it; the order still keeps a first and a last name, split at the first space. */
  const [fullName, setFullName] = React.useState(() => [searchParams.get("firstName"), searchParams.get("lastName")].filter(Boolean).join(" "))
  const firstName = fullName.trim().split(/\s+/)[0] || ""
  const lastName = fullName.trim().split(/\s+/).slice(1).join(" ")
  const [emailOptIn, setEmailOptIn] = React.useState(false)
  const [agreed, setAgreed] = React.useState(false)
  React.useEffect(() => {
    setFullName((v) => v || remembered("fullName") || [remembered("firstName"), remembered("lastName")].filter(Boolean).join(" "))
    setEmail((v) => v || remembered("email"))
  }, [])
  React.useEffect(() => remember("fullName", fullName), [fullName])
  React.useEffect(() => remember("email", email), [email])

  /* ── What, and for how much ──────────────────────────────────────── */
  const [variant, setVariant] = React.useState<SummaryVariant | null>(initialVariant ?? null)
  /* A pay-what-you-want amount belongs to the option it was chosen for. */
  const customPrice = (variant?.id ?? null) === (initialVariant?.id ?? null) && isPwyw ? customPriceCents ?? null : null
  /* "Your price" belongs to that option too, not to one picked after it. */
  const pwywNow = customPrice !== null
  const subtotal = variant ? variant.priceCents : product.price_cents

  const [tipPreset, setTipPreset] = React.useState(0)
  const [tipCustom, setTipCustom] = React.useState("")
  const tipCents = tipCustom ? Math.min(TIP_MAX_CENTS, Math.max(0, Math.round(Number.parseFloat(tipCustom) * 100) || 0)) : tipPreset

  const [code, setCode] = React.useState(() => searchParams.get("discountCode") || "")
  const [applied, setApplied] = React.useState<{ code: string; label: string; discountCents: number } | null>(null)
  const [codeBusy, setCodeBusy] = React.useState(false)
  const [codeError, setCodeError] = React.useState<string | null>(null)
  /** The reason a code from the link did not apply: said quietly, the buyer did nothing wrong. */
  const [codeFromLink, setCodeFromLink] = React.useState(false)
  const discountCents = applied ? Math.min(applied.discountCents, subtotal) : 0
  const total = Math.max(0, subtotal - discountCents + tipCents)
  const isFree = total === 0

  /* ── Buying for a business ───────────────────────────────────────── */
  const [businessOn, setBusinessOn] = React.useState(false)
  const [business, setBusiness] = React.useState<BusinessDetails>(EMPTY_BUSINESS)
  const [businessErrors, setBusinessErrors] = React.useState<Partial<Record<keyof BusinessDetails, string>>>({})

  /* ── The page's own state ────────────────────────────────────────── */
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [paid, setPaid] = React.useState<{ total: number; free: boolean } | null>(null)
  /** Paid (or processing) and no longer payable, whatever happens next. */
  const [settled, setSettled] = React.useState(false)
  /* The order is open on a phone as the page arrives, as asked; it folds with Hide details. */
  const [summaryOpen, setSummaryOpen] = React.useState(true)
  /** A computer's width: the order is always shown there, beside the form. */
  const [wide, setWide] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const read = () => setWide(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])
  /** null until the first effect knows: in the app, Stripe.js must never load, even for one render. */
  const [nativeApp, setNativeApp] = React.useState<boolean | null>(null)
  const [card, setCard] = React.useState<NativeCard>(EMPTY_CARD)
  const secretRef = React.useRef<string | null>(null)

  React.useEffect(() => setNativeApp(isNativeApp()), [])
  React.useEffect(() => {
    void trackFunnelStep("checkout_start", creator.id, product.id)
  }, [creator.id, product.id])

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE CHECKOUT OPENS AT ITS TOP
    ═══════════════════════════════════════════════════════════════════════
    It used to open part way down. Measured (scripts/check-checkout-arrival):
    a Buy press from a scrolled product page already arrived at 0, because
    Next scrolls a new page to the top; a reload, or coming back to the
    checkout with Back or Forward, arrived at the offset the browser had
    saved for it (295px on a 390px phone), because the browser restores a
    history entry's scroll, and a phone's checkout is long enough to keep it.

    So this entry's scroll is not restored: `scrollRestoration` belongs to
    the history entry that is current when it is set, so "manual" here
    leaves every other page's Back exactly as it was, and the product page
    behind still comes back where the buyer left it. A page brought back
    whole from the browser's cache starts at the top too. Before paint, so
    the page is never seen part way down first.
  */
  React.useLayoutEffect(() => {
    const history = window.history
    try {
      history.scrollRestoration = "manual"
    } catch {
      /* not settable here: the scroll below still puts the page at its top */
    }
    if (window.scrollY !== 0) window.scrollTo(0, 0)
    const fromCache = (e: PageTransitionEvent) => {
      if (e.persisted) window.scrollTo(0, 0)
    }
    window.addEventListener("pageshow", fromCache)
    return () => {
      window.removeEventListener("pageshow", fromCache)
      /* Leaving: whichever entry is current now (the receipt pushed after
         this one, or the page Back returned to) keeps the browser's own
         restoring. */
      try {
        history.scrollRestoration = "auto"
      } catch {
        /* as above */
      }
    }
  }, [])

  /* Back goes where the buyer came from: the creator's website page when the
     server checked one (backTo), else a product page's ?from=, else the product. */
  const from = searchParams.get("from") || ""
  const productUrl = backTo ?? (from.startsWith("/") && !from.startsWith("//") ? from : getProductUrl(creator.username, product.slug))
  const siteHost = returnHostLabel(backTo ?? returnTo)

  /*
    ═══════════════════════════════════════════════════════════════════════
     LEAVING THE CHECKOUT: AT ONCE, AND NEVER INTO A LOOP
    ═══════════════════════════════════════════════════════════════════════
    Back used to return only when the page behind was exactly the product's
    own address, and to PUSH the product page otherwise. Reached from a /p/
    link, the address differed, so the product page was fetched fresh (up to
    five seconds on a phone, with nothing on screen to say so) and put on
    top of the checkout. The product page's own back arrow then landed on
    the checkout again: the loop that was reported.

    Now: any page of ours behind this one, or the page the buyer came from
    when it is the same site, is returned to with history.back(), which is
    instant. With nothing behind (a shared checkout link), the product page
    REPLACES the checkout rather than stacking on it. And the press is
    answered on the same frame: the control shows a spinner and the page
    dims, whatever the network does.
  */
  const [leaving, setLeaving] = React.useState(false)
  React.useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => setLeaving(false), 8000)
    return () => window.clearTimeout(t)
  }, [leaving])
  /* A page brought back from the browser's cache is not still leaving. */
  React.useEffect(() => {
    const reset = () => setLeaving(false)
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])
  /** The product page as a path on this site, or null when it is on another (a creator's website). */
  const ownPath = (href: string): string | null => {
    try {
      const url = new URL(href, window.location.href)
      return url.origin === window.location.origin ? url.pathname + url.search : null
    } catch {
      return null
    }
  }
  /* The product page warmed while the buyer is here, so a Back that must fetch it is quick. */
  React.useEffect(() => {
    const path = ownPath(productUrl)
    if (path) router.prefetch(path)
  }, [productUrl, router])

  const goBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    /* A new tab, a new window, a context menu: the browser's. */
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    if (leaving) return
    setLeaving(true)
    const cameFrom = (() => {
      try {
        return document.referrer ? new URL(document.referrer).origin : null
      } catch {
        return null
      }
    })()
    const target = (() => {
      try {
        return new URL(productUrl, window.location.href).origin
      } catch {
        return null
      }
    })()
    if (canReturnInApp() || (cameFrom !== null && cameFrom === target && window.history.length > 1)) {
      window.history.back()
      return
    }
    const path = ownPath(productUrl)
    if (!path) {
      window.location.replace(productUrl)
      return
    }
    router.replace(path)
  }
  /**
   * AFTER PAYING: the creator's website when the link asked for it and the
   * server agreed, else the receipt. The receipt is emailed either way, and
   * its address never travels to the website: it is a credential.
   */
  const afterPaid = React.useCallback(
    (receiptToken: string) => {
      if (returnTo) {
        window.location.replace(paidReturnUrl(returnTo))
        return
      }
      router.replace(`/receipt/${encodeURIComponent(receiptToken)}`)
    },
    [returnTo, router],
  )

  /* ── After paying: the order, then the receipt ───────────────────── */
  /**
   * The payment is written into the address before the order is asked for,
   * the same way a bank's 3-D Secure page returns it. If making the order
   * fails (a timeout, a moment's outage) a refresh finishes it from there,
   * rather than showing an empty checkout that would take a second payment.
   * The webhook makes the same order anyway; this only fetches its receipt.
   */
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
        const res = await postJson<{ receiptToken?: string; amountCents?: number }>("/api/checkout/confirm-payment", { paymentIntentId, clientSecret }).catch(
          () => null,
        )
        if (res?.ok && res.data.receiptToken) {
          const token = res.data.receiptToken
          setPaid({ total: res.data.amountCents ?? 0, free: false })
          window.setTimeout(() => afterPaid(token), 1100)
          return
        }
        /* A refusal is an answer; only a failure to answer is retried. */
        if (res && res.status >= 400 && res.status < 500) {
          last = res.data.error || last
          break
        }
      }
      setSettled(true)
      throw new Error(last)
    },
    [afterPaid],
  )

  /* Arriving with a payment in the address: back from a bank's page, or a
     refresh after the order could not be finished. */
  React.useEffect(() => {
    const piId = searchParams.get("payment_intent")
    const secret = searchParams.get("payment_intent_client_secret")
    if (!piId || !secret) return
    const status = searchParams.get("redirect_status")
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
    setBusy(true)
    finish(piId, secret)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
    // Once, on arrival.
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
    document.getElementById(`business-${r.field === "postalCode" ? "postal" : r.field === "taxId" ? "tax" : r.field}`)?.focus()
    return r.error
  }

  const check = (mode: "card" | "express" | "free"): string | null => {
    if (paid || settled) return "This order is already paid."
    /* Stripe's smallest charge: said before a wallet sheet opens, not after. */
    if (mode !== "free" && total > 0 && total < MIN_CHARGE_CENTS) return "The smallest card payment is $0.50. Add to the tip or remove the code."
    if (mode !== "express") {
      if (!EMAIL.test(email.trim())) return "Enter a valid email address."
      /* A last name is not required: some people have one name. */
      if (!firstName.trim()) return "Enter your name."
    }
    if (mode !== "free") {
      const b = checkBusinessNow()
      if (b) return b
    }
    if (!agreed) {
      document.getElementById("checkout-terms")?.scrollIntoView({ block: "center", behavior: "smooth" })
      return "Tick the box to agree to the Terms and Conditions."
    }
    return null
  }

  const orderBody = (contact?: { email?: string; name?: string }) => {
    const payerEmail = (contact?.email || email).trim()
    /* The form's name when it was typed, whole; otherwise the wallet's, split
       the way a form would have it; otherwise the email's name, because the
       order needs one and a wallet does not always send it. */
    const walletName = (contact?.name || "").trim().split(/\s+/).filter(Boolean)
    const typed = firstName.trim() !== ""
    return {
      productId: product.id,
      variantId: variant?.id ?? null,
      customPriceCents: customPrice,
      tipCents,
      couponCode: applied?.code ?? "",
      firstName: typed ? firstName.trim() : walletName[0] || payerEmail.split("@")[0] || "",
      lastName: typed ? lastName.trim() : walletName.slice(1).join(" "),
      email: payerEmail,
      emailOptIn,
      agreedToTerms: agreed,
      business: businessOn ? business : null,
      /* Which page sent the buyer here and where their visit came from, for
         the order's Source (lib/orders/checkout-origin). Read when Pay is
         pressed, when the page before this one is surely known. */
      origin: checkoutOrigin(),
    }
  }

  const createIntent = async (contact?: { email?: string; name?: string }, methods?: string[]): Promise<IntentResult> => {
    /* The ways to pay the form loaded with: the PaymentIntent is made for exactly those (lib/checkout/payment-methods). */
    const res = await postJson<IntentResult>("/api/checkout/stripe-session", { ...orderBody(contact), paymentMethods: methods })
    if (!res.ok || !res.data.clientSecret) {
      const field = res.data.field as keyof BusinessDetails | undefined
      if (field) setBusinessErrors({ [field]: res.data.error || "Check this field." })
      throw new Error(res.data.error || "The payment could not be started. Nothing was charged.")
    }
    secretRef.current = res.data.clientSecret
    return { clientSecret: res.data.clientSecret, paymentIntentId: res.data.paymentIntentId }
  }

  const onPaid = async (paymentIntentId: string, status: string) => {
    if (status === "processing") {
      /* Paid, not yet cleared: nothing more to press. The webhook makes the
         order when it clears, and the receipt is emailed then. */
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

  /* ── The app: card fields straight to Stripe ─────────────────────── */
  const payNative = async () => {
    if (busy) return
    setError(null)
    const problem = check("card")
    if (problem) return setError(problem)
    if (!nativeCardComplete(card)) return setError("Check the card number, expiration date and security code.")
    setBusy(true)
    try {
      const [mm, yy] = card.expiry.split("/")
      const params = new URLSearchParams({
        type: "card",
        "card[number]": card.number.replace(/\D/g, ""),
        "card[exp_month]": mm,
        "card[exp_year]": `20${yy}`,
        "card[cvc]": card.cvc,
        "billing_details[name]": (card.name || `${firstName} ${lastName}`).trim(),
        "billing_details[email]": email.trim(),
      })
      const pmRes = await fetch("https://api.stripe.com/v1/payment_methods", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      })
      const pm = await pmRes.json()
      if (!pmRes.ok) throw new Error(pm?.error?.message || "Check the card details and try again.")
      const intent = await createIntent()
      const confirmed = await postJson<{ status?: string; actionUrl?: string }>("/api/checkout/confirm-with-pm", {
        paymentIntentId: intent.paymentIntentId,
        clientSecret: intent.clientSecret,
        paymentMethodId: pm.id,
        returnUrl: window.location.href,
      })
      if (!confirmed.ok) throw new Error(confirmed.data.error || "The payment did not go through. Nothing was charged.")
      if (confirmed.data.status === "requires_action" && confirmed.data.actionUrl) {
        window.location.href = confirmed.data.actionUrl
        return
      }
      await onPaid(intent.paymentIntentId, confirmed.data.status || "unknown")
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payment did not go through. Nothing was charged.")
    } finally {
      setBusy(false)
    }
  }

  /* ── Free ────────────────────────────────────────────────────────── */
  const takeFree = async () => {
    if (busy) return
    setError(null)
    const problem = check("free")
    if (problem) return setError(problem)
    setBusy(true)
    try {
      /* No tip and no invoice: a tip would have made it a payment, and there is nothing to invoice. */
      const body: Partial<ReturnType<typeof orderBody>> = orderBody()
      delete body.tipCents
      delete body.business
      const res = await postJson<{ receiptToken?: string }>("/api/checkout/process", body)
      if (!res.ok || !res.data.receiptToken) throw new Error(res.data.error || "The order could not be finished. Try again.")
      const token = res.data.receiptToken
      setPaid({ total: 0, free: true })
      window.setTimeout(() => afterPaid(token), 1100)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The order could not be finished. Try again.")
    } finally {
      setBusy(false)
    }
  }

  /* ── Discount code ───────────────────────────────────────────────── */
  const applyCode = async (fromLink?: string) => {
    const typed = (fromLink ?? code).trim()
    if (!typed) return
    setCodeBusy(true)
    setCodeError(null)
    setCodeFromLink(!!fromLink)
    try {
      const res = await postJson<{ ok?: boolean; code?: string; label?: string; discountCents?: number }>("/api/coupons/validate", {
        code: typed,
        productId: product.id,
        variantId: variant?.id ?? null,
        customPriceCents: customPrice,
      })
      if (!res.data.ok) {
        setCodeError(res.data.error || "That code is not valid.")
        return
      }
      setApplied({ code: res.data.code || typed, label: res.data.label || "", discountCents: res.data.discountCents || 0 })
      setCode(res.data.code || typed)
    } catch {
      setCodeError("The code could not be checked. Try again.")
    } finally {
      setCodeBusy(false)
    }
  }
  const removeCode = () => {
    setApplied(null)
    setCode("")
    setCodeError(null)
  }
  /* A link with ?discountCode= applies it as the page opens: the buyer sees
     it taken off, or why it was not, without pressing Apply. Once. */
  const linkCode = React.useRef(searchParams.get("discountCode")?.trim() || "")
  React.useEffect(() => {
    const fromLink = linkCode.current
    linkCode.current = ""
    if (fromLink) void applyCode(fromLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* Another option is another price: the code is checked again against it. */
  const chooseVariant = (v: SummaryVariant) => {
    setVariant(v.id === initialVariant?.id ? initialVariant : v)
    if (applied) {
      setApplied(null)
      setCodeError("Apply the code again for this option.")
    }
  }

  /* ── Pieces ──────────────────────────────────────────────────────── */
  const namesAndNews = (
    <div className="space-y-3">
      <Field id="checkout-name" label="Full name">
        <TextInput id="checkout-name" autoComplete="name" placeholder="Jane Smith" value={fullName} onChange={(e) => setFullName(e.target.value.slice(0, 121))} />
      </Field>
      <CheckRow id="checkout-news" checked={emailOptIn} onChange={setEmailOptIn}>
        Email me news and offers from {creator.name}
      </CheckRow>
    </div>
  )

  const emailField = (
    <Field id="checkout-email" label="Email">
      <TextInput
        id="checkout-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value.slice(0, 254))}
      />
    </Field>
  )

  const discount = (suffix: string) => (
    <DiscountForm
      code={code}
      onCode={(v) => {
        setCode(v)
        setCodeError(null)
        setCodeFromLink(false)
      }}
      applied={!!applied}
      label={applied?.label || ""}
      busy={codeBusy}
      error={codeError}
      quiet={codeFromLink}
      onApply={() => void applyCode()}
      onRemove={removeCode}
      idSuffix={suffix}
    />
  )

  const tip = (suffix: string) => (
    <TipPicker
      creatorName={creator.name}
      tipCents={tipCents}
      custom={tipCustom}
      onPreset={(c) => {
        setTipPreset(c)
        setTipCustom("")
      }}
      onCustom={setTipCustom}
      idSuffix={suffix}
    />
  )

  /* The order, as Stripe lays it out: the line, the subtotal with the promotion code under it, the tip, the total due. */
  const details = (suffix: string) => (
    <div className="space-y-6">
      <LineItem product={product} variant={variant} variants={allVariants} onVariant={chooseVariant} priceCents={subtotal} isPwyw={pwywNow} />
      <div className="border-t border-black/[0.07] pt-5">
        <Totals
          part="top"
          subtotal={subtotal}
          discountCents={discountCents}
          discountLabel={applied?.code}
          tipCents={tipCents}
          total={total}
          isPwyw={pwywNow}
          promo={discount(suffix)}
        />
      </div>
      {tip(suffix)}
      <Totals part="bottom" subtotal={subtotal} discountCents={discountCents} tipCents={tipCents} total={total} />
    </div>
  )

  const consent = (
    <div id="checkout-terms">
      <CheckRow id="checkout-agree" checked={agreed} onChange={(v) => { setAgreed(v); if (v) setError(null) }} invalid={!agreed && !!error?.includes("Terms")}>
        I agree to the{" "}
        <Link href="/terms" target="_blank" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
          Terms and Conditions
        </Link>{" "}
        and the{" "}
        <Link href="/refund-policy" target="_blank" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
          Refund policy
        </Link>
      </CheckRow>
    </div>
  )

  const beforePay = (
    <>
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
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
    </>
  )

  const payLabel = `Pay ${money(total)}`

  let payment: React.ReactNode
  if (isFree) {
    payment = (
      <div>
        <section aria-labelledby="checkout-contact-free">
          <SectionTitle>
            <span id="checkout-contact-free">Contact information</span>
          </SectionTitle>
          <div className="space-y-3">
            {emailField}
            {namesAndNews}
          </div>
        </section>
        <div className="mt-7 space-y-4">{beforePay}</div>
        <div className="mt-5">
          <PayButton onClick={() => void takeFree()} busy={busy} disabled={!!paid || settled}>
            {busy ? "Processing" : "Get it free"}
          </PayButton>
        </div>
      </div>
    )
  } else if (nativeApp === null) {
    /* The form's place, held for the one frame before the platform is known. */
    payment = <div aria-hidden className="min-h-[520px]" />
  } else if (nativeApp) {
    payment = (
      <div>
        <section aria-labelledby="checkout-contact-app">
          <SectionTitle>
            <span id="checkout-contact-app">Contact information</span>
          </SectionTitle>
          <div className="space-y-3">
            {emailField}
            {namesAndNews}
          </div>
        </section>
        <section aria-labelledby="checkout-payment-app" className="mt-8">
          <h2 id="checkout-payment-app" className="mb-3 text-[16px] font-semibold text-[#1a1a2e]">
            Payment method
          </h2>
          <NativeCardFields value={card} onChange={setCard} />
        </section>
        <div className="mt-7 space-y-4">{beforePay}</div>
        <div className="mt-5">
          <PayButton onClick={() => void payNative()} busy={busy} disabled={!!paid || settled}>
            {busy ? "Processing" : payLabel}
          </PayButton>
        </div>
      </div>
    )
  } else {
    payment = (
      <StripePay
        amountCents={total}
        creatorName={creator.name}
        email={email}
        onEmail={setEmail}
        check={(mode) => check(mode)}
        createIntent={createIntent}
        payerName={() => `${firstName} ${lastName}`.trim()}
        onPaid={onPaid}
        onError={setError}
        /* Still pressed after it worked: nothing is payable twice. */
        busy={busy || !!paid || settled}
        setBusy={setBusy}
        payLabel={payLabel}
        contactExtra={namesAndNews}
        beforePay={beforePay}
      />
    )
  }

  /* The creator, as the summary's heading and Back's label. */
  const initials = creator.name.trim().charAt(0).toUpperCase() || "S"

  return (
    <div
      data-page="checkout"
      data-leaving={leaving ? "" : undefined}
      /* Under the paid check, nothing behind it can be reached. */
      inert={!!paid}
      className={cn(
        "relative min-h-screen bg-white transition-opacity duration-200 lg:bg-[#f6f7f8]",
        leaving && "pointer-events-none opacity-60",
      )}
    >
      <HtmlClass name="with-page-checkout" />
      {/*
        THE SPLIT, WITH DEPTH. The grey half is the order, the white half is
        the form, and the white half sits over the grey on a long soft shadow,
        the way Stripe Checkout's two halves read as a sheet on a desk.
      */}
      <div aria-hidden className="pointer-events-none fixed inset-y-0 right-0 hidden w-1/2 bg-white shadow-[-12px_0_32px_-16px_rgba(17,24,39,0.16)] lg:block" />

      <div className="relative mx-auto grid max-w-[1120px] lg:grid-cols-2">
        {/* ── The order ─────────────────────────────────────────────── */}
        <section
          aria-label="Order summary"
          data-summary=""
          className="checkout-enter border-b border-black/[0.06] bg-[#f6f7f8] px-5 pb-6 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:border-b-0 lg:bg-transparent lg:px-16 lg:pb-16 lg:pt-14"
        >
          <div className="mx-auto w-full max-w-[440px] lg:ml-auto lg:mr-0 lg:sticky lg:top-14">
            <ReturnLink
              href={productUrl}
              onClick={goBack}
              aria-label={backTo && siteHost ? `Back to ${siteHost}` : "Back to product"}
              data-back=""
              className="group -ml-2 inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-[8px] px-2 text-[14px] font-medium text-[#1a1a2e] transition-colors hover:bg-black/[0.04]"
            >
              {leaving ? (
                <Spinner className="h-4 w-4 shrink-0 text-[#6b7280]" />
              ) : (
                <ArrowLeft aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280] transition-[translate] duration-150 group-hover:-translate-x-0.5" />
              )}
              <span className="relative grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e5e7eb] text-[11px] font-semibold text-[#4b5563]">
                {creator.avatar_url ? <Image src={creator.avatar_url} alt="" fill sizes="24px" className="object-cover" /> : initials}
              </span>
              <span className="truncate">{backTo && siteHost ? siteHost : creator.name}</span>
            </ReturnLink>

            <div className="mt-5 lg:mt-8">
              <p className="text-[15px] font-medium text-[#6b7280]">Pay {creator.name}</p>
              <p data-total="" className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-[#1a1a2e] sm:text-[36px]">
                {money(total)}
              </p>
            </div>

            {/* A phone shows the order open, with a way to fold it; a computer always shows it. */}
            <button
              type="button"
              onClick={() => setSummaryOpen((o) => !o)}
              aria-expanded={summaryOpen}
              aria-controls="checkout-details"
              className="mt-3 inline-flex h-8 cursor-pointer items-center gap-1 rounded-[6px] bg-[#e9ebee] px-2.5 text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#e1e3e7] lg:hidden [-webkit-tap-highlight-color:transparent]"
            >
              {summaryOpen ? "Hide details" : "Details"}
              <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 text-[#6b7280] transition-[rotate] duration-200", summaryOpen && "rotate-180")} />
            </button>
            <div
              id="checkout-details"
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:grid-rows-[1fr] lg:opacity-100",
                summaryOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="min-h-0 overflow-hidden" inert={!summaryOpen && !wide}>
                <div className="pt-6 lg:pt-10">{details("")}</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── The form ──────────────────────────────────────────────── */}
        <main className="checkout-enter px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-8 lg:px-16 lg:pb-16 lg:pt-14 [animation-delay:60ms]">
          <div className="mx-auto w-full max-w-[440px] lg:ml-0 lg:mr-auto">
            {payment}
            {isFree ? (
              <nav aria-label="Policies" className="mt-6 flex items-center justify-center gap-4 text-[12.5px] text-[#6b7280]">
                <Link href="/terms" target="_blank" className="hover:text-[#1a1a2e]">Terms</Link>
                <Link href="/privacy" target="_blank" className="hover:text-[#1a1a2e]">Privacy</Link>
                <Link href="/refund-policy" target="_blank" className="hover:text-[#1a1a2e]">Refunds</Link>
              </nav>
            ) : (
              <PoweredByStripe />
            )}
          </div>
        </main>
      </div>

      <PaidOverlay show={!!paid} total={paid?.total ?? 0} free={!!paid?.free} returningTo={returnTo ? returnHostLabel(returnTo) : null} />
    </div>
  )
}
