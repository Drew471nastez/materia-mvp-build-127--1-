"use client"

/**
 * ===========================================================================
 *  PAYING ON THE WEB: WALLETS, LINK AND THE CARD FORM, FROM STRIPE
 * ===========================================================================
 * Three of Stripe's own elements, drawn the way Stripe Checkout draws them:
 *
 *   Express Checkout  Apple Pay and Google Pay as buttons across the top,
 *                     whichever this browser and the account can offer.
 *                     None at all, and the row and its "OR" are not drawn.
 *   Contact email     a Storelib field, styled like the card form.
 *   Payment           the ways to pay as a list of radio rows, the card
 *                     open first, in Stripe's fields, which the browser's own
 *                     saved cards (Chrome, Safari) fill.
 *
 * The card number never touches this page: every field is Stripe's iframe.
 *
 * DEFERRED: the form draws at once, with the amount, and the PaymentIntent is
 * made only when Pay is pressed, by the server, from the database's prices
 * (lib/checkout/pricing.ts), for exactly the ways to pay this form loaded
 * with (lib/checkout/payment-methods.ts).
 *
 * WHEN SOMETHING GOES WRONG IT SAYS SO. Stripe.js not arriving, Stripe
 * refusing the form, a connection that drops: each used to leave the page on
 * its loading skeletons with nothing to press. Now a form that has not drawn
 * in 15 seconds, or cannot load at all, says why with a Try again; an
 * offline browser says it is offline and Pay waits for the connection.
 */

import * as React from "react"
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import type { Appearance, StripeElementsOptions, StripeError } from "@stripe/stripe-js"
import { RefreshCw, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { getStripePromise, notePaymentReady, resetStripePromise } from "./stripe-loader"
import { METHOD_SETS, type CheckoutMethod } from "@/lib/checkout/payment-methods"
import { FIELD_SHADOW, useCheckoutCurrency, OrDivider, PayButton, SectionTitle, TextInput, PayDock } from "./ui"
import { perfFail, perfStep, sinceScreenStart, timedStep } from "@/lib/perf/mark"
import { checkoutMsg } from "@/lib/markets/checkout-words"
import { useCheckoutLang, useCt } from "./words"
import { intentKey as keyOf, nextPress, paidIntentInError, stripeJsOutcomeUnknown, type Held } from "@/lib/checkout/pay-retry"
import { CHECKING_MESSAGE } from "@/lib/checkout/confirm-outcome"

/** The languages Stripe draws its card form in; any other is left to the browser (lib/markets/checkout-words). */
const STRIPE_LOCALES = new Set(["ar", "bg", "cs", "da", "de", "el", "en", "en-GB", "es", "es-419", "et", "fi", "fil", "fr", "fr-CA", "he", "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "ms", "mt", "nb", "nl", "pl", "pt", "pt-BR", "ro", "ru", "sk", "sl", "sv", "th", "tr", "vi", "zh", "zh-HK", "zh-TW"])

/** A phone's own keyboard zooms into any field set under 16px. */
function touchScreen(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches
  } catch {
    return false
  }
}

export function stripeAppearance(fontSize = "15px"): Appearance {
  return {
    theme: "stripe",
    variables: {
      colorPrimary: "#1a1a2e",
      colorBackground: "#ffffff",
      colorText: "#1a1a2e",
      colorTextSecondary: "#4b5563",
      colorTextPlaceholder: "#a2a7b0",
      colorDanger: "#dc2626",
      colorIcon: "#6b7280",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      fontSizeBase: fontSize,
      fontWeightMedium: "500",
      borderRadius: "8px",
      spacingUnit: "4px",
      gridRowSpacing: "14px",
      gridColumnSpacing: "12px",
      focusBoxShadow: "0 0 0 3px rgba(26,26,46,0.08)",
      focusOutline: "none",
    },
    rules: {
      ".Input": { border: "1px solid #e1e3e7", boxShadow: FIELD_SHADOW, padding: "11px 14px" },
      ".Input:hover": { border: "1px solid #d2d5da" },
      ".Input:focus": { border: "1px solid rgba(26,26,46,0.55)", boxShadow: "0 0 0 3px rgba(26,26,46,0.08), 0 1px 1px rgba(0,0,0,0.03)" },
      ".Input--invalid": { border: "1px solid #dc2626", boxShadow: "0 0 0 3px rgba(220,38,38,0.10)" },
      ".Label": { fontSize: "13px", fontWeight: "500", color: "#4b5563", marginBottom: "6px" },
      ".AccordionItem": { border: "1px solid #e1e3e7", boxShadow: FIELD_SHADOW, padding: "14px 16px" },
      ".AccordionItem--selected": { color: "#1a1a2e" },
      ".RadioIconOuter": { stroke: "#c9ccd2" },
      ".RadioIconOuter--checked": { stroke: "#1a1a2e" },
      ".RadioIconInner--checked": { fill: "#1a1a2e" },
      ".Error": { fontSize: "13px" },
    },
  }
}

const FONTS: StripeElementsOptions["fonts"] = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" }]

/** Long enough for a slow phone connection; short enough that nobody waits on a form that will never come. */
const LOAD_PATIENCE_MS = 15_000

/** Stripe's own words for a declined card are good; its plumbing's are not. */
export function paymentErrorText(error: Pick<StripeError, "type" | "message" | "code"> | null | undefined): string {
  if (!error) return checkoutMsg("The payment did not go through. Nothing was charged.")
  if (error.type === "card_error" || error.type === "validation_error") return error.message || checkoutMsg("Check the card details and try again.")
  /* The connection or Stripe itself failed mid confirm: the payment may have gone through, so never "nothing was charged" (lib/checkout/pay-retry). */
  if (stripeJsOutcomeUnknown(error)) return checkoutMsg(CHECKING_MESSAGE)
  return checkoutMsg("The payment did not go through. Nothing was charged. Try again.")
}

/**
 * A confirm Stripe answered with an error that is not the buyer's card or
 * their typing: a reliability failure for /admin/performance (lib/perf/mark).
 * A declined card is the bank's answer, not a fault, and is not counted.
 */
function noteConfirm(t0: number, error: Pick<StripeError, "type"> | null | undefined) {
  if (!error) perfStep("/step/checkout/confirm", performance.now() - t0)
  else if (error.type !== "card_error" && error.type !== "validation_error") perfFail("/step/checkout/confirm", error.type)
}

/** A request that never reached the server reads as the connection, not as a refusal. */
function networkText(e: unknown, fallback: string): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return checkoutMsg("You are offline. Nothing was charged. Reconnect and press Pay again.")
  if (e instanceof TypeError) return checkoutMsg("The connection dropped before the payment started. Nothing was charged. Try again.")
  return e instanceof Error ? e.message : fallback
}

export interface IntentResult {
  clientSecret: string
  paymentIntentId: string
  /**
   * What the secret confirms. A one time payment and a membership's first
   * payment are "payment"; a membership with a free trial saves the card
   * and charges nothing yet, which is "setup" (stripe.confirmSetup).
   */
  type?: "payment" | "setup"
}

export interface StripePayProps {
  amountCents: number
  /** The PaymentIntent's currency when it is not the platform's (a store's own checkout charges in the store's). */
  currency?: string
  /** "subscription" for a membership: the form is drawn for a recurring payment, and a trial's card is saved rather than charged. */
  mode?: "payment" | "subscription"
  creatorName: string
  email: string
  onEmail: (email: string) => void
  /** What stops a payment, before anything is sent. Wallets bring their own name and email. */
  check: (mode: "card" | "express") => string | null
  createIntent: (contact?: { email?: string; name?: string }, methods?: CheckoutMethod[]) => Promise<IntentResult>
  payerName: () => string
  onPaid: (paymentIntentId: string, status: string) => Promise<void>
  onError: (message: string | null) => void
  busy: boolean
  setBusy: (busy: boolean) => void
  payLabel: string
  /**
   * What the PaymentIntent pays for (the product, option, amount and choices). Given, a confirm that ended without a
   * sure answer keeps its intent, and the next press for the same key confirms that same intent again instead of
   * making a second one (lib/checkout/pay-retry). Absent, every press asks createIntent, as before.
   */
  intentKey?: string
  /** Under the email: the name and the news tick box. */
  contactExtra: React.ReactNode
  /** Between the contact and the payment: a delivery address and its method, for an order that ships (app/checkout/site). */
  afterContact?: React.ReactNode
  /** The email is the signed in account's and cannot be changed here (Settings › Checkout, an account first). */
  emailLocked?: boolean
  /** What is wrong with the email, said under it: a page that checks it and moves the focus here, as for any other field. */
  emailError?: string | null
  /** Between the payment and Pay: business details, consent, a message. */
  beforePay: React.ReactNode
  /**
   * Cash on delivery, offered beside the card when the shop takes it and
   * everything in the order ships (lib/physical/cash-on-delivery.ts). Chosen,
   * the card form steps aside and Pay becomes Place order, which places the
   * order with no card at all. Absent, nothing about the form changes.
   */
  cash?: {
    note: string
    place: () => Promise<void>
    /** The shop's own words for paying on delivery (Settings › Checkout), under the note. */
    instructions?: string | null
    /** Said under the choice while the card is chosen: what choosing cash adds ("a fee of 10 lei"). */
    aside?: string | null
    /** Told which is chosen, so the order is priced again with cash's fee in it. */
    onChoose?: (cash: boolean) => void
  } | null
}

/** Whether this browser is online now, kept current. */
function useOnline(): boolean {
  const [online, setOnline] = React.useState(true)
  React.useEffect(() => {
    const read = () => setOnline(navigator.onLine !== false)
    read()
    window.addEventListener("online", read)
    window.addEventListener("offline", read)
    return () => {
      window.removeEventListener("online", read)
      window.removeEventListener("offline", read)
    }
  }, [])
  return online
}

export function StripePay(props: StripePayProps) {
  /* What the card is charged in: <CheckoutCurrency> around a store's checkout, the platform's anywhere else (./ui). */
  const chargeCurrency = useCheckoutCurrency().toLowerCase()
  /* Which of the method lists this form is on (lib/checkout/payment-methods): the first, until Stripe refuses it. */
  const [setIndex, setSetIndex] = React.useState(0)
  /* A fresh Stripe.js and a fresh form, after Try again. */
  const [attempt, setAttempt] = React.useState(0)
  const [fontSize, setFontSize] = React.useState<string | null>(null)
  React.useEffect(() => setFontSize(touchScreen() ? "16px" : "15px"), [])
  const methods = METHOD_SETS[setIndex] as CheckoutMethod[]
  const appearance = React.useMemo(() => stripeAppearance(fontSize ?? "15px"), [fontSize])
  /* The card form in the checkout's language, where Stripe has it (a declined card's message comes back in it too). */
  const lang = useCheckoutLang()
  const locale = (STRIPE_LOCALES.has(lang) ? lang : STRIPE_LOCALES.has(lang.split("-")[0]) ? lang.split("-")[0] : "auto") as StripeElementsOptions["locale"]
  const options = React.useMemo<StripeElementsOptions>(
    () => ({
      mode: props.mode ?? "payment",
      amount: props.amountCents,
      /* The PaymentIntent's own currency (the store's on a website, the platform's on /checkout): Stripe refuses a confirm whose form was drawn for another. */
      currency: chargeCurrency,
      paymentMethodTypes: methods,
      appearance,
      fonts: FONTS,
      loader: "auto",
      locale,
    }),
    [props.mode, props.amountCents, chargeCurrency, methods, appearance, locale],
  )
  const fallBack = React.useCallback(() => {
    setSetIndex((i) => (i < METHOD_SETS.length - 1 ? i + 1 : i))
  }, [])
  const retry = React.useCallback(() => {
    resetStripePromise()
    setSetIndex(0)
    setAttempt((a) => a + 1)
  }, [])
  /* Created once per attempt: Elements takes its Stripe once and keeps it. */
  const stripePromise = React.useMemo(() => getStripePromise(), [attempt]) // eslint-disable-line react-hooks/exhaustive-deps
  /* Kept here, above the form, so a fresh form after Try again still knows the payment that is being checked. */
  const held = React.useRef<Held<IntentResult> | null>(null)
  /* The type size is known after the first effect; the form waits one frame for it rather than drawing twice. */
  if (fontSize === null) return <div aria-hidden className="min-h-[420px]" />
  return (
    <Elements key={`${attempt}:${setIndex}`} stripe={stripePromise} options={options}>
      <StripePayInner
        {...props}
        methods={methods}
        stripePromise={stripePromise}
        onRefused={setIndex < METHOD_SETS.length - 1 ? fallBack : undefined}
        onRetry={retry}
        held={held}
      />
    </Elements>
  )
}

function returnUrl(): string {
  const url = new URL(window.location.href)
  /* A return from a redirect comes back to this page, which finishes it. */
  for (const key of ["payment_intent", "payment_intent_client_secret", "setup_intent", "setup_intent_client_secret", "redirect_status"]) url.searchParams.delete(key)
  return url.toString()
}

function StripePayInner({
  methods,
  stripePromise,
  onRefused,
  onRetry,
  creatorName,
  email,
  onEmail,
  check,
  createIntent,
  payerName,
  onPaid,
  onError,
  busy,
  setBusy,
  payLabel,
  contactExtra,
  afterContact,
  emailLocked = false,
  emailError = null,
  beforePay,
  cash = null,
  intentKey,
  amountCents,
  held,
}: StripePayProps & {
  methods: CheckoutMethod[]
  stripePromise: ReturnType<typeof getStripePromise>
  onRefused?: () => void
  onRetry: () => void
  held: React.MutableRefObject<Held<IntentResult> | null>
}) {
  const stripe = useStripe()
  const elements = useElements()
  const ct = useCt()
  /**
   * The intent for this press. A held one (its confirm ended without a sure answer) is confirmed again for the same
   * order; for a different order it is asked about first, and only a sure "not paid" lets a new one be made. null:
   * this press is answered already (paid after all, or still unknown).
   */
  const intentFor = async (contact: { email?: string; name?: string } | undefined): Promise<IntentResult | null> => {
    const key = intentKey ? keyOf({ intentKey, amountCents, methods: methods.join(",") }) : null
    const h = held.current
    const press = key ? nextPress(h, key) : "create"
    if (press === "reuse" && h) return h.intent
    if (press === "check" && h && stripe) {
      const r = await (h.intent.type === "setup" ? stripe.retrieveSetupIntent(h.intent.clientSecret) : stripe.retrievePaymentIntent(h.intent.clientSecret)).catch(() => null)
      const intent = r ? ("setupIntent" in r ? r.setupIntent : (r as { paymentIntent?: { id: string; status: string } }).paymentIntent) : null
      if (!intent) {
        onError(ct(CHECKING_MESSAGE))
        return null
      }
      if (intent.status === "succeeded" || intent.status === "processing") {
        held.current = null
        await onPaid(intent.id, intent.status)
        return null
      }
      held.current = null
    }
    return timedStep("/step/checkout/intent", () => createIntent(contact, methods))
  }
  /** After a confirm: hold the intent when the answer is not sure, let it go when it is. true: the error is answered here. */
  const settle = async (intent: IntentResult, error: (Pick<StripeError, "type" | "code"> & { payment_intent?: { id?: string; status?: string } | null; setup_intent?: { id?: string; status?: string } | null }) | null | undefined): Promise<boolean> => {
    if (!error) {
      held.current = null
      return false
    }
    const paid = paidIntentInError(error)
    if (paid) {
      /* An earlier confirm of this same intent went through: paid, never twice. */
      held.current = null
      await onPaid(paid.id, paid.status)
      return true
    }
    if (stripeJsOutcomeUnknown(error) && intentKey) held.current = { intent, key: keyOf({ intentKey, amountCents, methods: methods.join(",") }) }
    else if (!stripeJsOutcomeUnknown(error)) held.current = null
    return false
  }
  const online = useOnline()
  /** null while the wallets are being asked; then whether any can pay. */
  const [express, setExpress] = React.useState<boolean | null>(null)
  const [paymentReady, setPaymentReady] = React.useState(false)
  /** The form could not be drawn: Stripe.js did not arrive, refused every list, or took too long. */
  const [failed, setFailed] = React.useState(false)
  /* Stripe.js itself failing to load (blocked, offline) rejects this. */
  React.useEffect(() => {
    let live = true
    stripePromise.then(
      (s) => {
        if (live && !s) setFailed(true)
      },
      () => {
        if (live) setFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [stripePromise])
  /* And a form that is still not drawn after a fair wait is treated as not coming. */
  React.useEffect(() => {
    if (paymentReady) return
    const t = window.setTimeout(() => setFailed(true), LOAD_PATIENCE_MS)
    return () => window.clearTimeout(t)
  }, [paymentReady])
  /* How long the payment form took to be ready from the screen opening, or that it never was (lib/perf/mark). Once per form. */
  const noted = React.useRef(false)
  React.useEffect(() => {
    if (noted.current || (!paymentReady && !failed)) return
    noted.current = true
    if (paymentReady) perfStep("/step/checkout/ready", sinceScreenStart())
    else perfFail("/step/checkout/ready", online ? "load" : "offline")
  }, [paymentReady, failed, online])
  /* Coming back online with a form that never drew: try once more, unasked. */
  const wasOnline = React.useRef(online)
  React.useEffect(() => {
    if (online && !wasOnline.current && failed && !paymentReady) onRetry()
    wasOnline.current = online
  }, [online, failed, paymentReady, onRetry])

  const pay = async () => {
    onError(null)
    if (!online) return onError(ct("You are offline. Nothing was charged. Reconnect and press Pay again."))
    const problem = check("card")
    if (problem) return onError(problem)
    if (!stripe || !elements || !paymentReady) return onError(ct("The payment form is still loading. Try again in a moment."))
    setBusy(true)
    let pending: IntentResult | null = null
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        onError(ct(paymentErrorText(submitError)))
        return
      }
      const intent = await intentFor(undefined)
      if (!intent) return
      pending = intent
      const t0 = performance.now()
      if (intent.type === "setup") {
        /* A free trial: the card is saved, nothing is charged today. */
        const { error, setupIntent } = await stripe.confirmSetup({
          elements,
          clientSecret: intent.clientSecret,
          confirmParams: {
            return_url: returnUrl(),
            payment_method_data: { billing_details: { name: payerName(), email } },
          },
          redirect: "if_required",
        })
        noteConfirm(t0, error)
        if (await settle(intent, error)) return
        if (error) {
          onError(ct(paymentErrorText(error)))
          return
        }
        await onPaid(setupIntent?.id ?? intent.paymentIntentId, setupIntent?.status ?? "unknown")
        return
      }
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        confirmParams: {
          return_url: returnUrl(),
          payment_method_data: { billing_details: { name: payerName(), email } },
        },
        redirect: "if_required",
      })
      noteConfirm(t0, error)
      if (await settle(intent, error)) return
      if (error) {
        onError(ct(paymentErrorText(error)))
        return
      }
      await onPaid(paymentIntent?.id ?? intent.paymentIntentId, paymentIntent?.status ?? "unknown")
    } catch (e) {
      /* Thrown after the intent was made: the confirm's outcome is not known, so the intent is kept and nothing is promised. */
      if (pending && intentKey) {
        held.current = { intent: pending, key: keyOf({ intentKey, amountCents, methods: methods.join(",") }) }
        onError(ct(CHECKING_MESSAGE))
        return
      }
      onError(ct(networkText(e, ct("The payment did not go through. Nothing was charged."))))
    } finally {
      setBusy(false)
    }
  }

  /* Card or cash, when the shop offers cash: the card first, as it always was. */
  const [byCash, setByCash] = React.useState(false)
  const cashOn = !!cash && byCash
  const placeCash = async () => {
    onError(null)
    if (!cash) return
    if (!online) return onError(ct("You are offline. Nothing was ordered. Reconnect and press Place order again."))
    const problem = check("card")
    if (problem) return onError(problem)
    await cash.place()
  }

  const hideExpress = express === false || failed

  return (
    <div>
      {/* ── Express ─────────────────────────────────────────────────── */}
      <section
        aria-label={ct("Express checkout")}
        data-express={express === null ? "loading" : express ? "on" : "off"}
        /* No wallet here: gone for a screen reader and the keyboard too. */
        inert={hideExpress}
        aria-hidden={hideExpress || undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          hideExpress ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={cn("min-h-[44px] rounded-[8px]", express === null && "checkout-shimmer")}>
            <ExpressCheckoutElement
              options={{
                buttonHeight: 44,
                buttonType: { applePay: "plain", googlePay: "plain" },
                buttonTheme: { applePay: "black", googlePay: "black" },
                layout: { maxColumns: 2, maxRows: 1, overflow: "auto" },
                emailRequired: true,
                business: { name: creatorName },
                paymentMethods: { applePay: "auto", googlePay: "auto", link: "never", paypal: "never", amazonPay: "never", klarna: "never" },
              }}
              onReady={(e) => {
                const available = e.availablePaymentMethods
                setExpress(!!available && Object.values(available).some(Boolean))
              }}
              onLoadError={() => setExpress(false)}
              onClick={(e) => {
                onError(null)
                if (!online) {
                  onError(ct("You are offline. Nothing was charged. Reconnect and try again."))
                  e.reject()
                  return
                }
                const problem = check("express")
                if (problem) {
                  onError(problem)
                  e.reject()
                  return
                }
                e.resolve()
              }}
              onConfirm={async (e) => {
                if (!stripe || !elements) return e.paymentFailed({ reason: "fail" })
                setBusy(true)
                try {
                  const { error: submitError } = await elements.submit()
                  if (submitError) {
                    e.paymentFailed({ reason: "fail" })
                    onError(ct(paymentErrorText(submitError)))
                    return
                  }
                  const walletEmail = e.billingDetails?.email || email
                  const walletName = e.billingDetails?.name || payerName()
                  if (walletEmail && walletEmail !== email) onEmail(walletEmail)
                  const intent = await intentFor({ email: walletEmail, name: walletName })
                  if (!intent) {
                    e.paymentFailed({ reason: "fail" })
                    return
                  }
                  const t0 = performance.now()
                  const confirmed =
                    intent.type === "setup"
                      ? await stripe.confirmSetup({ elements, clientSecret: intent.clientSecret, confirmParams: { return_url: returnUrl() }, redirect: "if_required" })
                      : await stripe.confirmPayment({ elements, clientSecret: intent.clientSecret, confirmParams: { return_url: returnUrl() }, redirect: "if_required" })
                  noteConfirm(t0, confirmed.error)
                  if (confirmed.error && (await settle(intent, confirmed.error))) return
                  if (!confirmed.error) held.current = null
                  if (confirmed.error) {
                    e.paymentFailed({ reason: "fail" })
                    onError(ct(paymentErrorText(confirmed.error)))
                    return
                  }
                  const done = "setupIntent" in confirmed ? confirmed.setupIntent : (confirmed as { paymentIntent?: { id: string; status: string } }).paymentIntent
                  await onPaid(done?.id ?? intent.paymentIntentId, done?.status ?? "unknown")
                } catch (err) {
                  e.paymentFailed({ reason: "fail" })
                  onError(ct(networkText(err, ct("The payment did not go through. Nothing was charged."))))
                } finally {
                  setBusy(false)
                }
              }}
            />
          </div>
          <OrDivider />
        </div>
      </section>

      {/* Paying in cash needs no card form: its failing to load is not the buyer's problem then. */}
      {failed && !cashOn ? (
        <div data-pay-failed="" role="alert" className="checkout-rise mb-6 rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-4 py-4 text-center">
          <p className="text-[14px] font-medium text-[#1a1a2e]">{online ? ct("The payment form did not load") : ct("You are offline")}</p>
          <p className="mt-1 text-[13px] leading-snug text-[#6b7280]">
            {online ? ct("Nothing was charged. Check your connection and load it again.") : ct("Nothing was charged. It loads again by itself when you reconnect.")}
          </p>
          {online ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] border border-[#e1e3e7] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#f7f7f8]"
            >
              <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              {ct("Try again")}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Contact ─────────────────────────────────────────────────── */}
      <section aria-labelledby="checkout-contact">
        <SectionTitle>
          <span id="checkout-contact">{ct("Contact information")}</span>
        </SectionTitle>
        <div className="min-h-[70px]">
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => onEmail(e.target.value.slice(0, 254))}
            readOnly={emailLocked}
            aria-readonly={emailLocked || undefined}
            className={emailLocked ? "bg-[#f7f7f8] text-[#4b5563]" : undefined}
            aria-label={ct("Email")}
            data-checkout-email=""
            invalid={!!emailError}
            aria-describedby={emailError ? "checkout-email-error" : undefined}
          />
          {emailError ? (
            <p id="checkout-email-error" role="alert" className="mt-1.5 text-[13px] text-[#dc2626]">
              {emailError}
            </p>
          ) : null}
        </div>
        <div className="mt-3.5">{contactExtra}</div>
      </section>

      {afterContact ? <div className="mt-8">{afterContact}</div> : null}

      {/* ── Payment ─────────────────────────────────────────────────── */}
      <section aria-labelledby="checkout-payment" className="mt-8">
        <SectionTitle>
          <span id="checkout-payment">{ct("Payment method")}</span>
        </SectionTitle>
        {cash ? (
          <div role="radiogroup" aria-label={ct("How to pay")} data-pay-choice="" className="mb-3 grid grid-cols-2 gap-2">
            {([
              [false, ct("Card")],
              [true, ct("Cash on delivery")],
            ] as const).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={byCash === value}
                data-pay-cash={value ? "" : undefined}
                disabled={busy}
                onClick={() => {
                  setByCash(value)
                  cash?.onChoose?.(value)
                  onError(null)
                }}
                className={cn(
                  /* At least 44px; a longer name in another language wraps rather than being cut off. */
                  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[8px] border bg-white px-3.5 py-2 text-left text-[14px] font-medium leading-[18px] text-[#1a1a2e] transition-colors [-webkit-tap-highlight-color:transparent] disabled:cursor-not-allowed",
                  byCash === value ? "border-[#1a1a2e]" : "border-[#e1e3e7] hover:border-[#d2d5da]",
                )}
                style={{ boxShadow: FIELD_SHADOW }}
              >
                <span aria-hidden className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border", byCash === value ? "border-[#1a1a2e]" : "border-[#c9ccd2]")}>
                  {byCash === value ? <span className="h-2 w-2 rounded-full bg-[#1a1a2e]" /> : null}
                </span>
                <span className="min-w-0 break-words">{label}</span>
              </button>
            ))}
          </div>
        ) : null}
        {cashOn ? (
          <div data-cash-note="" className="space-y-1 rounded-[8px] bg-[#f8f9fa] px-3.5 py-3 text-[14px] leading-5 text-[#4b5563]">
            <p>{cash?.note}</p>
            {cash?.instructions ? <p data-cash-instructions="">{cash.instructions}</p> : null}
          </div>
        ) : cash?.aside ? (
          <p className="text-[13px] leading-5 text-[#6b7280]">{cash.aside}</p>
        ) : null}
        {/* Kept drawn while cash is chosen, so going back to the card is instant and keeps what was typed. */}
        {/* data-payment-ready: Stripe said the form can take a card (scripts/check-checkout-speed.mjs times it). */}
        <div className={cn("min-h-[200px]", cashOn && "hidden")} data-payment-ready={paymentReady ? "" : undefined}>
          <PaymentElement
            onReady={() => {
              setPaymentReady(true)
              setFailed(false)
              /* What waits for the form (the checkout's ways out, read ahead) may go now. */
              notePaymentReady()
            }}
            /* Stripe refused this list of methods: the next one, which it takes. With none left, say so. */
            onLoadError={() => (onRefused ? onRefused() : setFailed(true))}
            options={{
              layout: { type: "accordion", defaultCollapsed: false, radios: true, spacedAccordionItems: false },
              fields: { billingDetails: { name: "never", email: "never" } },
              /* The wallets are the express buttons above; twice is noise. */
              wallets: { applePay: "never", googlePay: "never" },
              business: { name: creatorName },
            }}
          />
        </div>
      </section>

      <div className="mt-7 space-y-4">{beforePay}</div>

      {!online ? (
        <p role="status" className="checkout-rise mt-4 flex items-center justify-center gap-2 text-[13px] text-[#6b7280]">
          <WifiOff aria-hidden className="h-3.5 w-3.5" />
          {ct("You are offline. Pay waits for the connection.")}
        </p>
      ) : null}

      <PayDock>
        {cashOn ? (
          <PayButton onClick={() => void placeCash()} busy={busy} disabled={!online}>
            {busy ? ct("Processing") : ct("Place order")}
          </PayButton>
        ) : (
          <PayButton onClick={() => void pay()} busy={busy} disabled={!stripe || !elements || !online}>
            {busy ? ct("Processing") : payLabel}
          </PayButton>
        )}
      </PayDock>
    </div>
  )
}
