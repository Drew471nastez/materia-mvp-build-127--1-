"use client"

/**
 * ===========================================================================
 *  JOINING A MEMBERSHIP
 * ===========================================================================
 * The checkout for a product of type "membership", in the same frame and
 * the same parts as the one time checkout (./checkout-client.tsx and
 * ./parts): the order on the left (on a phone, above), paying on the right.
 * What is different is what is being bought, so the left half says it the
 * way Patreon and Gumroad do:
 *
 *   monthly or yearly   a two way choice when the creator offers both, with
 *                       what the year saves; the page opens on the one the
 *                       product page's link asked for (?interval=year)
 *   the free trial      when there is one: "$0.00 today", then the price
 *                       from the date the trial ends
 *   what members get    the creator's list, so the buyer is reminded at the
 *                       moment of paying
 *
 * and the consent says plainly that it renews until cancelled.
 *
 * THE PAYMENT. Join makes the subscription on the server
 * (/api/memberships/checkout), which answers with what to confirm: the
 * first invoice's payment, or, for a trial, the card to save. Stripe.js
 * confirms it here (parts/stripe-pay.tsx in "subscription" mode); in the
 * app, where Stripe.js cannot run, the card goes to Stripe from plain
 * fields (parts/native-card.tsx) and /api/memberships/confirm confirms it.
 * Either way /api/memberships/confirm then brings the membership up to
 * date, and a signed in buyer lands on the membership itself; a guest is
 * shown how to get to it with the email they paid with.
 *
 * A bank's 3-D Secure page returns here with the payment in the address
 * and the subscription beside it (?sub=), and the page finishes from there.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { isNativeApp } from "@/lib/platform-utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { HtmlClass } from "@/components/platform/html-class"
import { money as moneyOf, yearlySaving, type BillingInterval } from "@/lib/memberships/state"
import { CheckRow, ErrorBanner, Field, PayButton, PoweredByStripe, SectionTitle, TextInput, PayDock } from "@/components/checkout/parts/ui"
import { EMPTY_CARD, NativeCardFields, nativeCardComplete, type NativeCard } from "./parts/native-card"
import { StripePay, type IntentResult } from "./parts/stripe-pay"
import { CommunityRefundPolicy, waiverSentence, type CommunityCheckoutTerms } from "@/components/community/membership/checkout-policy"
import { formatMoney } from "@/lib/communities/membership-policy"
import { WAIT_MS, requestJson } from "@/lib/net/request"
import { confirmOutcomeUnknown } from "@/lib/checkout/pay-retry"
import { CHECKING_MESSAGE } from "@/lib/checkout/confirm-outcome"

export interface MembershipCheckoutProps {
  product: { id: string; title: string; slug: string; thumbnail_url: string | null }
  creator: { id: string; name: string; avatar_url: string | null; username: string }
  plan: { monthlyPriceCents: number | null; yearlyPriceCents: number | null; trialDays: number; benefits: string[]; currency?: string }
  userEmail: string | null
  isLoggedIn: boolean
  initialInterval?: BillingInterval
  /** The plans could not be read: part 75 has not run. */
  unavailable?: boolean
  /** Where a signed in member lands once paid, instead of the membership: its community (app/checkout/page.tsx). */
  returnTo?: string | null
  /** A community's membership: its refund policy, the EU withdrawal waiver where it applies, and the buyer's locale for money (round 13). */
  communityTerms?: CommunityCheckoutTerms | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> {
  /* Bounded (lib/net/request.ts): an answer that never came left Join on "Processing" until a reload. */
  const r = await requestJson<T & { error?: string; code?: string }>(url, { method: "POST", json: body, timeoutMs: WAIT_MS.pay })
  if (r.status !== 0) return { ok: r.ok, status: r.status, data: r.data }
  return { ok: false, status: 0, data: { error: "The connection dropped before the payment started. Nothing was charged. Try again." } as T & { error?: string } }
}

function trialEndsOn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function MembershipCheckout({ product, creator, plan, userEmail, isLoggedIn, initialInterval, unavailable = false, returnTo = null, communityTerms = null }: MembershipCheckoutProps) {
  const router = useRouter()
  /* In the plan's own currency; a community's in the buyer's way of writing money (round 13, ask 43). */
  const currency = plan.currency || "usd"
  const moneyExact = (cents: number) => (communityTerms ? formatMoney(cents, currency, communityTerms.locale) : moneyOf(cents, currency))
  const pricePer = (cents: number, per: BillingInterval) => `${moneyExact(cents)}/${per === "year" ? "year" : "month"}`
  const waiver = waiverSentence(communityTerms)
  const searchParams = useSearchParams()
  const offers: BillingInterval[] = [plan.monthlyPriceCents ? "month" : null, plan.yearlyPriceCents ? "year" : null].filter(Boolean) as BillingInterval[]
  const [interval, setInterval] = React.useState<BillingInterval>(initialInterval && offers.includes(initialInterval) ? initialInterval : offers[0] ?? "month")
  const priceCents = (interval === "year" ? plan.yearlyPriceCents : plan.monthlyPriceCents) ?? 0
  const saving = yearlySaving(plan.monthlyPriceCents, plan.yearlyPriceCents)
  const trial = plan.trialDays > 0
  /* Round AG: the tax this buyer pays on this interval, worked out as the subscription will charge it (lib/tax/membership.ts). */
  const [tax, setTax] = React.useState<{ taxCents: number; included: boolean; label: string } | null>(null)
  React.useEffect(() => {
    let live = true
    setTax(null)
    fetch(`/api/memberships/tax-quote?productId=${encodeURIComponent(product.id)}&interval=${interval}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tax: null }))
      .then((d: { tax?: { taxCents: number; included: boolean; label: string } | null }) => live && setTax(d.tax ?? null))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [product.id, interval])
  const chargedCents = tax && !tax.included ? priceCents + tax.taxCents : priceCents

  const [email, setEmail] = React.useState(userEmail || searchParams.get("email") || "")
  const [fullName, setFullName] = React.useState("")
  const firstName = fullName.trim().split(/\s+/)[0] || ""
  const lastName = fullName.trim().split(/\s+/).slice(1).join(" ")
  const [emailOptIn, setEmailOptIn] = React.useState(false)
  const [agreed, setAgreed] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<{ membershipId: string | null; trial: boolean } | null>(null)
  const [nativeApp, setNativeApp] = React.useState<boolean | null>(null)
  const [card, setCard] = React.useState<NativeCard>(EMPTY_CARD)
  /** The subscription the last Join made, for the confirmation after Stripe.js. */
  const started = React.useRef<{ subscriptionId: string; clientSecret: string; membershipId: string; trialDays: number } | null>(null)
  /**
   * In the app: the subscription whose confirm ended without a sure answer (a 5xx, "unknown", no answer). The next
   * Join confirms that same one again instead of starting a second subscription (lib/checkout/pay-retry), so a
   * payment that did go through is never paid twice.
   */
  const heldJoin = React.useRef<{ subscriptionId: string; clientSecret: string; key: string } | null>(null)

  React.useEffect(() => setNativeApp(isNativeApp()), [])

  const productHref = creator.username ? `/${creator.username}/${product.slug}` : `/p/${product.slug}`

  const finishOn = React.useCallback(
    (membershipId: string | null, wasTrial: boolean) => {
      setDone({ membershipId, trial: wasTrial })
      if (isLoggedIn && returnTo) {
        window.setTimeout(() => router.replace(returnTo), 900)
      } else if (isLoggedIn && membershipId) {
        window.setTimeout(() => router.replace(`/account/library/memberships/${membershipId}?welcome=1`), 900)
      }
    },
    [isLoggedIn, returnTo, router],
  )

  /** After Stripe confirmed (or to confirm in the app): the membership brought up to date, then where to go. */
  const confirm = React.useCallback(
    async (subscriptionId: string, clientSecret: string, extra: { paymentMethodId?: string } = {}) => {
      let last = "Your payment went through. The membership is still being set up: it will be in your library in a moment. You will not be charged again."
      let unknown = false
      for (const wait of [0, 1500, 4000]) {
        if (wait) await new Promise((r) => setTimeout(r, wait))
        const res = await postJson<{ membershipId?: string; status?: string; access?: boolean; actionUrl?: string | null }>("/api/memberships/confirm", {
          subscriptionId,
          clientSecret,
          paymentMethodId: extra.paymentMethodId,
          returnUrl: window.location.href,
        })
        if (res.ok && res.data.status === "requires_action" && res.data.actionUrl) {
          window.location.href = res.data.actionUrl
          return
        }
        if (res.ok && res.data.access && res.data.membershipId) {
          finishOn(res.data.membershipId, res.data.status === "trialing")
          return
        }
        if (res.status >= 400 && res.status < 500) {
          last = res.data.error || last
          if (extra.paymentMethodId) throw new Error(last)
          break
        }
        /* The card's confirm ended without a sure answer: never "you will not be charged again" on a guess (lib/checkout/confirm-outcome). */
        if (extra.paymentMethodId && confirmOutcomeUnknown(res)) {
          unknown = true
          last = res.data.status === "unknown" && res.data.error ? res.data.error : CHECKING_MESSAGE
        }
        /* Paid and not yet active on our side: the webhook is on its way. The same three tries as the one time checkout. */
        extra = {}
      }
      throw Object.assign(new Error(last), { unknown })
    },
    [finishOn],
  )

  /* Back from a bank's page (3-D Secure) with the subscription in the address. */
  React.useEffect(() => {
    const sub = searchParams.get("sub")
    const secret = searchParams.get("payment_intent_client_secret") || searchParams.get("setup_intent_client_secret")
    const status = searchParams.get("redirect_status")
    if (!sub || !secret) return
    const url = new URL(window.location.href)
    for (const k of ["payment_intent", "payment_intent_client_secret", "setup_intent", "setup_intent_client_secret", "redirect_status"]) url.searchParams.delete(k)
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
    if (status === "failed") {
      setError("The bank did not approve the payment. Nothing was charged. Try again or use another card.")
      return
    }
    setBusy(true)
    confirm(sub, secret)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const check = (mode: "card" | "express"): string | null => {
    if (done) return "You are already a member."
    if (mode !== "express") {
      if (!EMAIL.test(email.trim())) return "Enter a valid email address."
      if (!firstName) return "Enter your name."
    }
    if (!agreed) {
      document.getElementById("membership-terms")?.scrollIntoView({ block: "center", behavior: "smooth" })
      return "Tick the box to agree to the terms."
    }
    return null
  }

  const startSubscription = async (contact?: { email?: string; name?: string }, methods?: string[], paymentMethodId?: string): Promise<IntentResult> => {
    const payer = (contact?.email || email).trim().toLowerCase()
    const wallet = (contact?.name || "").trim().split(/\s+/).filter(Boolean)
    const res = await postJson<{ membershipId?: string; subscriptionId?: string; clientSecret?: string; type?: "payment" | "setup"; trialDays?: number }>("/api/memberships/checkout", {
      productId: product.id,
      interval,
      firstName: firstName || wallet[0] || payer.split("@")[0],
      lastName: firstName ? lastName : wallet.slice(1).join(" "),
      email: payer,
      emailOptIn,
      agreedToTerms: agreed,
      paymentMethods: methods,
      paymentMethodId,
      /* The EU withdrawal waiver was in the consent they ticked (round 13): kept on the subscription, and said again in the welcome email. */
      withdrawalWaiver: !!waiver,
      /* This page's own last try (a declined card): a guest's is continued only when named (app/api/memberships/checkout). */
      previousMembershipId: started.current?.membershipId || undefined,
    })
    if (!res.ok || !res.data.clientSecret || !res.data.subscriptionId) {
      if (res.data.code === "already_member") {
        throw Object.assign(new Error(res.data.error || "You are already a member."), { alreadyMember: true })
      }
      throw new Error(res.data.error || "The payment could not be started. Nothing was charged.")
    }
    started.current = { subscriptionId: res.data.subscriptionId, clientSecret: res.data.clientSecret, membershipId: res.data.membershipId || "", trialDays: res.data.trialDays ?? 0 }
    /* The subscription in the address, so a bank's page that sends the buyer back lands on a page that can finish. */
    const url = new URL(window.location.href)
    url.searchParams.set("sub", res.data.subscriptionId)
    window.history.replaceState(window.history.state, "", url.pathname + url.search)
    return { clientSecret: res.data.clientSecret, paymentIntentId: res.data.subscriptionId, type: res.data.type ?? "payment" }
  }

  const onError = (message: string | null) => setError(message)
  const createIntent = (contact?: { email?: string; name?: string }, methods?: string[]) => startSubscription(contact, methods)

  const onPaid = async (_id: string, status: string) => {
    const s = started.current
    if (!s) return
    if (status === "processing") {
      setError("Your bank is still processing the payment. The membership starts as soon as it clears, and we will email you.")
      return
    }
    if (status !== "succeeded") {
      setError("The payment was not completed. Nothing was charged. Try again.")
      return
    }
    try {
      await confirm(s.subscriptionId, s.clientSecret)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The membership could not be confirmed. Refresh in a moment.")
    }
  }

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
        "billing_details[name]": (card.name || fullName).trim(),
        "billing_details[email]": email.trim(),
      })
      const pmRes = await fetch("https://api.stripe.com/v1/payment_methods", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      })
      const pm = await pmRes.json()
      if (!pmRes.ok) throw new Error(pm?.error?.message || "Check the card details and try again.")
      const key = `${product.id}:${interval}:${email.trim().toLowerCase()}`
      const held = heldJoin.current
      /* The same Join again while the last one is not known: that subscription, confirmed again. Otherwise a new one. */
      let sub: { subscriptionId: string; clientSecret: string }
      if (held && held.key === key) sub = held
      else {
        const intent = await startSubscription(undefined, ["card"], pm.id)
        sub = { subscriptionId: started.current!.subscriptionId, clientSecret: intent.clientSecret }
      }
      heldJoin.current = { subscriptionId: sub.subscriptionId, clientSecret: sub.clientSecret, key }
      try {
        await confirm(sub.subscriptionId, sub.clientSecret, { paymentMethodId: pm.id })
        heldJoin.current = null
      } catch (e) {
        /* A sure "no" (a declined card) lets it go; anything else keeps it for the next press. */
        if (!(e as { unknown?: boolean }).unknown) heldJoin.current = null
        throw e
      }
    } catch (e) {
      if ((e as { alreadyMember?: boolean }).alreadyMember) setError("You are already a member. It is in your library under Memberships.")
      else setError(e instanceof Error ? e.message : "The payment did not go through. Nothing was charged.")
    } finally {
      setBusy(false)
    }
  }

  const perLabel = interval === "year" ? "a year" : "a month"
  const payLabel = trial ? `Start ${plan.trialDays}-day free trial` : `Join ${moneyExact(priceCents)}/${interval === "year" ? "year" : "month"}`
  const renewalText = trial
    ? `Nothing is charged today. From ${trialEndsOn(plan.trialDays)} you pay ${moneyExact(chargedCents)} ${perLabel} until you cancel. Cancel before then and you pay nothing.`
    : `You pay ${moneyExact(chargedCents)} today and then ${perLabel === "a year" ? "every year" : "every month"} until you cancel. Cancel any time from your library.`

  const contactExtra = (
    <div className="space-y-3">
      <Field id="membership-name" label="Full name">
        <TextInput id="membership-name" autoComplete="name" placeholder="Jane Smith" value={fullName} onChange={(e) => setFullName(e.target.value.slice(0, 121))} />
      </Field>
      <CheckRow id="membership-news" checked={emailOptIn} onChange={setEmailOptIn}>
        Email me news and offers from {creator.name}
      </CheckRow>
    </div>
  )
  const emailField = (
    <Field id="membership-email" label="Email">
      <TextInput id="membership-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 254))} />
    </Field>
  )
  const beforePay = (
    <>
      <p data-renewal-terms="" className="rounded-[8px] bg-[#f7f7f9] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#4b5563]">
        {renewalText}
      </p>
      <div id="membership-terms">
        <CheckRow id="membership-agree" checked={agreed} onChange={(v) => { setAgreed(v); if (v) setError(null) }} invalid={!agreed && !!error?.includes("terms")}>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
            Terms and Conditions
          </Link>{" "}
          and to be charged {trial ? "after the trial " : ""}until I cancel{waiver ? `. ${waiver}` : ""}
        </CheckRow>
      </div>
      <CommunityRefundPolicy terms={communityTerms} />
      {error ? (
        <ErrorBanner>
          {error}
          {error.startsWith("You are already a member") ? (
            <>
              {" "}
              <Link href="/account/library/memberships" className="font-semibold underline">
                Open your memberships
              </Link>
            </>
          ) : null}
        </ErrorBanner>
      ) : null}
    </>
  )

  let payment: React.ReactNode
  if (unavailable || offers.length === 0) {
    payment = <ErrorBanner>This membership cannot be joined right now. Try again later.</ErrorBanner>
  } else if (nativeApp === null) {
    payment = <div aria-hidden className="min-h-[520px]" />
  } else if (nativeApp) {
    payment = (
      <div>
        <section aria-labelledby="membership-contact-app">
          <SectionTitle>
            <span id="membership-contact-app">Contact information</span>
          </SectionTitle>
          <div className="space-y-3">
            {emailField}
            {contactExtra}
          </div>
        </section>
        <section aria-labelledby="membership-payment-app" className="mt-8">
          <h2 id="membership-payment-app" className="mb-3 text-[16px] font-semibold text-[#1a1a2e]">
            Payment method
          </h2>
          <NativeCardFields value={card} onChange={setCard} />
        </section>
        <div className="mt-7 space-y-4">{beforePay}</div>
        <PayDock>
          <PayButton onClick={() => void payNative()} busy={busy} disabled={!!done}>
            {busy ? "Processing" : payLabel}
          </PayButton>
        </PayDock>
      </div>
    )
  } else {
    payment = (
      <StripePay
        key={interval}
        mode="subscription"
        amountCents={trial ? priceCents : chargedCents}
        creatorName={creator.name}
        email={email}
        onEmail={setEmail}
        check={check}
        createIntent={createIntent}
        intentKey={`${product.id}:${interval}:${email.trim().toLowerCase()}`}
        payerName={() => fullName.trim()}
        onPaid={onPaid}
        onError={onError}
        busy={busy || !!done}
        setBusy={setBusy}
        payLabel={payLabel}
        contactExtra={contactExtra}
        beforePay={beforePay}
      />
    )
  }

  const summary = (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        {product.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.thumbnail_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover shadow-[0_0_0_1px_rgba(17,17,19,0.06)]" />
        ) : (
          <AppAvatar src={creator.avatar_url} name={creator.name} alt="" size={56} markWhileLoading />
        )}
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-[#1a1a2e]">{product.title}</p>
          <p className="truncate text-[13.5px] text-[#6b7280]">Membership by {creator.name}</p>
        </div>
      </div>

      {offers.length > 1 ? (
        <div role="radiogroup" aria-label="Billing" className="grid grid-cols-2 gap-2">
          {offers.map((o) => {
            const cents = (o === "year" ? plan.yearlyPriceCents : plan.monthlyPriceCents) ?? 0
            const on = interval === o
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={on}
                data-interval={o}
                onClick={() => {
                  setInterval(o)
                  setError(null)
                }}
                className={cn(
                  "rounded-[10px] border bg-white px-3.5 py-3 text-left outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30",
                  on ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e1e3e7] hover:border-[#c9ccd2]",
                )}
              >
                <span className="block text-[13px] font-medium text-[#6b7280]">{o === "year" ? "Yearly" : "Monthly"}</span>
                <span className="mt-0.5 block text-[16px] font-semibold text-[#1a1a2e]">{pricePer(cents, o)}</span>
                {o === "year" && saving > 0 ? <span className="mt-0.5 block text-[12.5px] font-medium text-[#15803d]">Save {saving}%</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {plan.benefits.length > 0 ? (
        <div>
          <p className="mb-2 text-[13px] font-medium text-[#6b7280]">What members get</p>
          <ul className="space-y-1.5">
            {plan.benefits.slice(0, 6).map((b, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-[#374151]">
                <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a2e]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="space-y-2 border-t border-black/[0.07] pt-5 text-[14px]">
        <div className="flex justify-between">
          {/* The price with what it is per, "$9.00/month", as every other place a membership's price is written. */}
          <dt className="text-[#4b5563]">{interval === "year" ? "Yearly" : "Monthly"}</dt>
          <dd data-summary-price="" className="tabular-nums text-[#1a1a2e]">{`${moneyExact(priceCents)}/${interval === "year" ? "year" : "month"}`}</dd>
        </div>
        {tax && tax.taxCents > 0 ? (
          <div className="flex justify-between" data-summary-tax="">
            <dt className="text-[#4b5563]">{tax.included ? `${tax.label} (included)` : tax.label}</dt>
            <dd className="tabular-nums text-[#1a1a2e]">{moneyExact(tax.taxCents)}</dd>
          </div>
        ) : null}
        {trial ? (
          <div className="flex justify-between">
            <dt className="text-[#4b5563]">Free trial</dt>
            <dd className="text-[#1a1a2e]">{plan.trialDays} days</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-black/[0.07] pt-3 text-[15px] font-semibold">
          <dt className="text-[#1a1a2e]">Due today</dt>
          <dd data-due-today="" className="tabular-nums text-[#1a1a2e]">{moneyExact(trial ? 0 : chargedCents)}</dd>
        </div>
        {trial ? <p className="text-[13px] text-[#6b7280]">Then {pricePer(chargedCents, interval)} from {trialEndsOn(plan.trialDays)}</p> : null}
      </dl>
    </div>
  )

  return (
    <div data-page="checkout" data-membership-checkout="" className="relative min-h-screen bg-white lg:bg-[#f8f9fa]">
      <HtmlClass name="with-page-checkout" />
      <div aria-hidden className="pointer-events-none fixed inset-y-0 right-0 hidden w-1/2 bg-white shadow-[-8px_0_24px_-14px_rgba(17,24,39,0.11)] lg:block" />
      <header className="relative z-10 bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(17,17,19,0.055),0_4px_12px_-10px_rgba(17,17,19,0.09)]">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-1.5 px-4 sm:px-7 lg:h-16 lg:px-[60px]">
          <Link href={productHref} aria-label="Back" className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-black/[0.06] bg-white text-[#1a1a2e] shadow-[0_1px_1px_rgba(17,17,19,0.04),0_1px_3px_-1px_rgba(17,17,19,0.06)] transition-colors hover:bg-[#f7f7f8]">
              <ArrowLeft aria-hidden className="h-[18px] w-[18px]" />
            </span>
          </Link>
          <Link href={creator.username ? `/${creator.username}` : productHref} className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-[14px] font-medium text-[#1a1a2e] hover:bg-black/[0.035]">
            <AppAvatar src={creator.avatar_url} name={creator.name} alt="" size={28} />
            <span className="truncate">{creator.name}</span>
          </Link>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-[1120px] lg:grid-cols-2">
        <section aria-label="Membership" className="border-b border-black/[0.06] bg-[#f8f9fa] px-5 pb-6 pt-6 sm:px-8 lg:border-b-0 lg:bg-transparent lg:px-16 lg:pb-16 lg:pt-12">
          <div className="mx-auto w-full max-w-[440px] lg:sticky lg:top-12 lg:ml-auto lg:mr-0">
            <p className="text-[15px] font-medium text-[#6b7280]">{trial ? `${plan.trialDays} days free, then` : `Join ${creator.name}`}</p>
            <p data-total="" className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-[#1a1a2e] sm:text-[36px]">
              {moneyExact(priceCents)}
              <span className="ml-1 text-[17px] font-medium text-[#6b7280]">/{interval === "year" ? "year" : "month"}</span>
            </p>
            <div className="pt-6 lg:pt-10">{summary}</div>
          </div>
        </section>

        <main className="px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-8 lg:px-16 lg:pb-16 lg:pt-12">
          <div className="mx-auto w-full max-w-[440px] lg:ml-0 lg:mr-auto">
            {done ? (
              <div data-membership-done="" role="status" className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-6">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#ecfdf3] text-[#15803d]">
                  <Check aria-hidden className="h-5 w-5" />
                </span>
                <p className="mt-3 text-[18px] font-semibold text-[#1a1a2e]">{done.trial ? "Your free trial has started" : "You are a member"}</p>
                {isLoggedIn ? (
                  <p className="mt-1 text-[14px] text-[#6b7280]">Opening your membership.</p>
                ) : (
                  <>
                    <p className="mt-1 text-[14px] leading-relaxed text-[#4b5563]">
                      Posts from {creator.name}, and everything the membership includes, are in your Storelib library. Sign in or create an account with {email.trim() || "the email you paid with"} to open it.
                    </p>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Link
                        href={`/signup?email=${encodeURIComponent(email.trim())}&next=${encodeURIComponent(done.membershipId ? `/account/library/memberships/${done.membershipId}?welcome=1` : "/account/library/memberships")}`}
                        className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-[#8b5cf6] px-4 text-[14.5px] font-semibold text-white hover:bg-[#7c3aed]"
                      >
                        Create your account
                      </Link>
                      <Link
                        href={`/login?next=${encodeURIComponent(done.membershipId ? `/account/library/memberships/${done.membershipId}?welcome=1` : "/account/library/memberships")}`}
                        className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-[#e1e3e7] bg-white px-4 text-[14.5px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]"
                      >
                        Log in
                      </Link>
                    </div>
                    <p className="mt-3 text-[12.5px] text-[#6b7280]">We also emailed you the details.</p>
                  </>
                )}
              </div>
            ) : (
              payment
            )}
            <PoweredByStripe />
          </div>
        </main>
      </div>
    </div>
  )
}

