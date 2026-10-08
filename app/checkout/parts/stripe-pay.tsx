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
import { getStripePromise, resetStripePromise } from "./stripe-loader"
import { METHOD_SETS, type CheckoutMethod } from "@/lib/checkout/payment-methods"
import { FIELD_SHADOW, OrDivider, PayButton, SectionTitle, TextInput, PayDock } from "./ui"

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
export function paymentErrorText(error: Pick<StripeError, "type" | "message"> | null | undefined): string {
  if (!error) return "The payment did not go through. Nothing was charged."
  if (error.type === "card_error" || error.type === "validation_error") return error.message || "Check the card details and try again."
  return "The payment did not go through. Nothing was charged. Try again."
}

/** A request that never reached the server reads as the connection, not as a refusal. */
function networkText(e: unknown, fallback: string): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You are offline. Nothing was charged. Reconnect and press Pay again."
  if (e instanceof TypeError) return "The connection dropped before the payment started. Nothing was charged. Try again."
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
  /** Under the email: the name and the news tick box. */
  contactExtra: React.ReactNode
  /** Between the payment and Pay: business details, consent, a message. */
  beforePay: React.ReactNode
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
  /* Which of the method lists this form is on (lib/checkout/payment-methods): the first, until Stripe refuses it. */
  const [setIndex, setSetIndex] = React.useState(0)
  /* A fresh Stripe.js and a fresh form, after Try again. */
  const [attempt, setAttempt] = React.useState(0)
  const [fontSize, setFontSize] = React.useState<string | null>(null)
  React.useEffect(() => setFontSize(touchScreen() ? "16px" : "15px"), [])
  const methods = METHOD_SETS[setIndex] as CheckoutMethod[]
  const appearance = React.useMemo(() => stripeAppearance(fontSize ?? "15px"), [fontSize])
  const options = React.useMemo<StripeElementsOptions>(
    () => ({
      mode: props.mode ?? "payment",
      amount: props.amountCents,
      currency: "usd",
      paymentMethodTypes: methods,
      appearance,
      fonts: FONTS,
      loader: "auto",
    }),
    [props.mode, props.amountCents, methods, appearance],
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
  beforePay,
}: StripePayProps & {
  methods: CheckoutMethod[]
  stripePromise: ReturnType<typeof getStripePromise>
  onRefused?: () => void
  onRetry: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
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
  /* Coming back online with a form that never drew: try once more, unasked. */
  const wasOnline = React.useRef(online)
  React.useEffect(() => {
    if (online && !wasOnline.current && failed && !paymentReady) onRetry()
    wasOnline.current = online
  }, [online, failed, paymentReady, onRetry])

  const pay = async () => {
    onError(null)
    if (!online) return onError("You are offline. Nothing was charged. Reconnect and press Pay again.")
    const problem = check("card")
    if (problem) return onError(problem)
    if (!stripe || !elements || !paymentReady) return onError("The payment form is still loading. Try again in a moment.")
    setBusy(true)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        onError(paymentErrorText(submitError))
        return
      }
      const intent = await createIntent(undefined, methods)
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
        if (error) {
          onError(paymentErrorText(error))
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
      if (error) {
        onError(paymentErrorText(error))
        return
      }
      await onPaid(paymentIntent?.id ?? intent.paymentIntentId, paymentIntent?.status ?? "unknown")
    } catch (e) {
      onError(networkText(e, "The payment did not go through. Nothing was charged."))
    } finally {
      setBusy(false)
    }
  }

  const hideExpress = express === false || failed

  return (
    <div>
      {/* ── Express ─────────────────────────────────────────────────── */}
      <section
        aria-label="Express checkout"
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
                  onError("You are offline. Nothing was charged. Reconnect and try again.")
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
                    onError(paymentErrorText(submitError))
                    return
                  }
                  const walletEmail = e.billingDetails?.email || email
                  const walletName = e.billingDetails?.name || payerName()
                  if (walletEmail && walletEmail !== email) onEmail(walletEmail)
                  const intent = await createIntent({ email: walletEmail, name: walletName }, methods)
                  const confirmed =
                    intent.type === "setup"
                      ? await stripe.confirmSetup({ elements, clientSecret: intent.clientSecret, confirmParams: { return_url: returnUrl() }, redirect: "if_required" })
                      : await stripe.confirmPayment({ elements, clientSecret: intent.clientSecret, confirmParams: { return_url: returnUrl() }, redirect: "if_required" })
                  if (confirmed.error) {
                    e.paymentFailed({ reason: "fail" })
                    onError(paymentErrorText(confirmed.error))
                    return
                  }
                  const done = "setupIntent" in confirmed ? confirmed.setupIntent : confirmed.paymentIntent
                  await onPaid(done?.id ?? intent.paymentIntentId, done?.status ?? "unknown")
                } catch (err) {
                  e.paymentFailed({ reason: "fail" })
                  onError(networkText(err, "The payment did not go through. Nothing was charged."))
                } finally {
                  setBusy(false)
                }
              }}
            />
          </div>
          <OrDivider />
        </div>
      </section>

      {failed ? (
        <div data-pay-failed="" role="alert" className="checkout-rise mb-6 rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-4 py-4 text-center">
          <p className="text-[14px] font-medium text-[#1a1a2e]">{online ? "The payment form did not load" : "You are offline"}</p>
          <p className="mt-1 text-[13px] leading-snug text-[#6b7280]">
            {online ? "Nothing was charged. Check your connection and load it again." : "Nothing was charged. It loads again by itself when you reconnect."}
          </p>
          {online ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] border border-[#e1e3e7] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(0,0,0,0.04)] transition-colors hover:bg-[#f7f7f8]"
            >
              <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Contact ─────────────────────────────────────────────────── */}
      <section aria-labelledby="checkout-contact">
        <SectionTitle>
          <span id="checkout-contact">Contact information</span>
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
            aria-label="Email"
            data-checkout-email=""
          />
        </div>
        <div className="mt-3.5">{contactExtra}</div>
      </section>

      {/* ── Payment ─────────────────────────────────────────────────── */}
      <section aria-labelledby="checkout-payment" className="mt-8">
        <SectionTitle>
          <span id="checkout-payment">Payment method</span>
        </SectionTitle>
        <div className="min-h-[200px]">
          <PaymentElement
            onReady={() => {
              setPaymentReady(true)
              setFailed(false)
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
          You are offline. Pay waits for the connection.
        </p>
      ) : null}

      <PayDock>
        <PayButton onClick={() => void pay()} busy={busy} disabled={!stripe || !elements || !online}>
          {busy ? "Processing" : payLabel}
        </PayButton>
      </PayDock>
    </div>
  )
}
