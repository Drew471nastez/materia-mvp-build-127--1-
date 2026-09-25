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
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { isNativeApp } from "@/lib/platform-utils"
import { getProductUrl } from "@/lib/url-helpers"
import { ReturnLink } from "@/components/navigation/return-link"
import { trackFunnelStep } from "@/lib/analytics-utils"
import { checkoutOrigin } from "@/lib/orders/checkout-origin-browser"
import { paidReturnUrl, returnHostLabel } from "@/lib/checkout/return-url"
import { EMPTY_BUSINESS, checkBusiness, type BusinessDetails } from "@/lib/checkout/business"
import { CheckRow, ErrorBanner, Field, PayButton, SectionTitle, TextInput, money } from "./parts/ui"
import { DiscountForm, LineItem, TipPicker, Totals, type SummaryVariant } from "./parts/order-summary"
import { BusinessFields } from "./parts/business-fields"
import { EMPTY_CARD, NativeCardFields, nativeCardComplete, type NativeCard } from "./parts/native-card"
import { PaidOverlay } from "./parts/success"
import { StripePay, type IntentResult } from "./parts/stripe-pay"

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
  const [firstName, setFirstName] = React.useState(() => searchParams.get("firstName") || "")
  const [lastName, setLastName] = React.useState(() => searchParams.get("lastName") || "")
  const [emailOptIn, setEmailOptIn] = React.useState(false)
  const [agreed, setAgreed] = React.useState(false)
  React.useEffect(() => {
    setFirstName((v) => v || remembered("firstName"))
    setLastName((v) => v || remembered("lastName"))
    setEmail((v) => v || remembered("email"))
  }, [])
  React.useEffect(() => remember("firstName", firstName), [firstName])
  React.useEffect(() => remember("lastName", lastName), [lastName])
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
  const [summaryOpen, setSummaryOpen] = React.useState(false)
  /** null until the first effect knows: in the app, Stripe.js must never load, even for one render. */
  const [nativeApp, setNativeApp] = React.useState<boolean | null>(null)
  const [card, setCard] = React.useState<NativeCard>(EMPTY_CARD)
  const secretRef = React.useRef<string | null>(null)

  React.useEffect(() => setNativeApp(isNativeApp()), [])
  React.useEffect(() => {
    void trackFunnelStep("checkout_start", creator.id, product.id)
  }, [creator.id, product.id])

  /* Back goes where the buyer came from: the creator's website page when the
     server checked one (backTo), else a product page's ?from=, else the product. */
  const from = searchParams.get("from") || ""
  const productUrl = backTo ?? (from.startsWith("/") && !from.startsWith("//") ? from : getProductUrl(creator.username, product.slug))
  const siteHost = returnHostLabel(backTo ?? returnTo)
  /* A buyer who came from a creator's website keeps shopping there, not in Explore. */
  const shopUrl = (() => {
    const site = backTo ?? returnTo
    if (!site) return "/explore"
    try {
      return `${new URL(site).origin}/`
    } catch {
      return "/explore"
    }
  })()

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
      if (!firstName.trim()) return "Enter your first name."
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
      <div className="grid grid-cols-2 gap-3">
        <Field id="checkout-first-name" label="First name">
          <TextInput id="checkout-first-name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value.slice(0, 60))} />
        </Field>
        <Field id="checkout-last-name" label="Last name">
          <TextInput id="checkout-last-name" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value.slice(0, 60))} />
        </Field>
      </div>
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
        value={email}
        onChange={(e) => setEmail(e.target.value.slice(0, 254))}
      />
    </Field>
  )

  const discount = (suffix: string) => (
    <div>
      <p className="mb-2 text-[14px] font-medium text-[#1a1a2e]">Discount code</p>
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
    </div>
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

  const totals = (
    <Totals subtotal={subtotal} discountCents={discountCents} discountLabel={applied?.code} tipCents={tipCents} total={total} isPwyw={pwywNow} />
  )

  const line = (
    <LineItem product={product} variant={variant} variants={allVariants} onVariant={chooseVariant} priceCents={subtotal} isPwyw={pwywNow} />
  )

  const consent = (
    <div id="checkout-terms">
      <CheckRow id="checkout-agree" checked={agreed} onChange={(v) => { setAgreed(v); if (v) setError(null) }} invalid={!agreed && !!error?.includes("Terms")}>
        I agree to the{" "}
        <Link href="/terms" target="_blank" className="font-medium text-[#1a1a2e] underline underline-offset-2">
          Terms and Conditions
        </Link>
      </CheckRow>
    </div>
  )

  /* On a phone the order's choices come back just above Pay. */
  const phoneOrder = (
    <section aria-label="Order summary" className="space-y-5 border-t border-[#e5e7eb] pt-6 lg:hidden">
      {discount("-phone")}
      {tip("-phone")}
      <div className="border-t border-[#e5e7eb] pt-4">{totals}</div>
    </section>
  )

  const beforePay = (
    <>
      {!isFree ? (
        <section aria-label="Invoice" className="border-t border-[#e5e7eb] pt-6">
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
      {phoneOrder}
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
            <span id="checkout-contact-free">Contact</span>
          </SectionTitle>
          <div className="space-y-3">
            {emailField}
            {namesAndNews}
          </div>
        </section>
        <div className="mt-8 space-y-5">{beforePay}</div>
        <div className="mt-5">
          <PayButton onClick={() => void takeFree()} busy={busy} disabled={!!paid || settled}>
            {busy ? "Processing" : "Get it free"}
          </PayButton>
        </div>
      </div>
    )
  } else if (nativeApp === null) {
    /* The form's place, held for the one frame before the platform is known. */
    payment = <div aria-hidden className="checkout-shimmer h-[520px] rounded-[12px]" />
  } else if (nativeApp) {
    payment = (
      <div>
        <section aria-labelledby="checkout-contact-app">
          <SectionTitle>
            <span id="checkout-contact-app">Contact</span>
          </SectionTitle>
          <div className="space-y-3">
            {emailField}
            {namesAndNews}
          </div>
        </section>
        <section aria-labelledby="checkout-payment-app" className="mt-8">
          <h2 id="checkout-payment-app" className="mb-3.5 text-[18px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
            Payment
          </h2>
          <NativeCardFields value={card} onChange={setCard} />
        </section>
        <div className="mt-8 space-y-5">{beforePay}</div>
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

  return (
    <div
      data-page="checkout"
      /* Under the paid check, nothing behind it can be reached. */
      inert={!!paid}
      className="min-h-screen bg-white lg:bg-[linear-gradient(to_right,#ffffff_calc(50%-0.5px),#e5e7eb_calc(50%-0.5px),#e5e7eb_calc(50%+0.5px),#f8f9fa_calc(50%+0.5px))]"
    >
      <header className="border-b border-[#e5e7eb] bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <ReturnLink href={productUrl} className="flex min-h-[44px] min-w-0 items-center gap-2 text-[14px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]">
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{backTo && siteHost ? `Back to ${siteHost}` : "Back to product"}</span>
          </ReturnLink>
          <Link
            href={shopUrl}
            className="inline-flex h-9 shrink-0 items-center rounded-[10px] border border-[#d4d6db] px-3.5 text-[14px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]"
          >
            Continue Shopping
          </Link>
        </div>
      </header>

      {/* Phone: the order as a bar, the total always in view. */}
      <div className="border-b border-[#e5e7eb] bg-[#f8f9fa] lg:hidden">
        <button
          type="button"
          onClick={() => setSummaryOpen((o) => !o)}
          aria-expanded={summaryOpen}
          aria-controls="checkout-summary-phone"
          className="mx-auto flex h-14 w-full max-w-[600px] items-center justify-between gap-3 px-4 sm:px-6"
        >
          <span className="flex items-center gap-1.5 text-[14px] font-medium text-[#1a1a2e]">
            Order summary
            <ChevronDown aria-hidden className={cn("h-4 w-4 text-[#6b7280] transition-transform duration-200", summaryOpen && "rotate-180")} />
          </span>
          <span className="text-[16px] font-semibold tabular-nums text-[#1a1a2e]">{money(total)}</span>
        </button>
        <div
          id="checkout-summary-phone"
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            summaryOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
          inert={!summaryOpen}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mx-auto max-w-[600px] space-y-5 px-4 pb-5 pt-1 sm:px-6">
              {line}
              <div className="border-t border-[#e5e7eb] pt-4">{totals}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1100px] lg:grid-cols-2">
        <main className="px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-6 lg:px-8 lg:pb-16 lg:pr-12 lg:pt-10">
          <div className="mx-auto max-w-[600px] lg:mr-0">
            {payment}
            <nav aria-label="Policies" className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#e5e7eb] pt-5 text-[13px] text-[#6b7280]">
              <Link href="/refund-policy" target="_blank" className="underline-offset-2 hover:text-[#1a1a2e] hover:underline">
                Refund policy
              </Link>
              <Link href="/privacy" target="_blank" className="underline-offset-2 hover:text-[#1a1a2e] hover:underline">
                Privacy policy
              </Link>
              <Link href="/terms" target="_blank" className="underline-offset-2 hover:text-[#1a1a2e] hover:underline">
                Terms of service
              </Link>
            </nav>
          </div>
        </main>

        <aside aria-label="Order summary" className="hidden lg:block">
          <div className="sticky top-0 max-w-[440px] space-y-6 py-10 pl-12 pr-8">
            {line}
            <div className="border-t border-[#e5e7eb] pt-6">{discount("-desk")}</div>
            <div className="border-t border-[#e5e7eb] pt-6">{tip("-desk")}</div>
            <div className="border-t border-[#e5e7eb] pt-5">{totals}</div>
          </div>
        </aside>
      </div>

      <PaidOverlay show={!!paid} total={paid?.total ?? 0} free={!!paid?.free} returningTo={returnTo ? returnHostLabel(returnTo) : null} />
    </div>
  )
}
