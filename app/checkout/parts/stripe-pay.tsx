"use client"

/**
 * ===========================================================================
 *  PAYING ON THE WEB: WALLETS, LINK AND THE CARD FORM, FROM STRIPE
 * ===========================================================================
 * Three of Stripe's own elements, drawn in Storelib's colours:
 *
 *   Express Checkout  Apple Pay, Google Pay, Link and PayPal, whichever this
 *                     browser and the Stripe account can offer. Only those
 *                     that can actually pay are shown; none at all, and the
 *                     row and its "or" are not drawn.
 *   Link              the email box. A buyer with a Link account gets a code
 *                     and their saved cards, filled in for them.
 *   Payment           the card, in Stripe's fields, which the browser's own
 *                     saved cards (Chrome, Safari) fill; and any other method
 *                     switched on in the Stripe dashboard, as an accordion.
 *
 * The card number never touches this page: every field is Stripe's iframe.
 *
 * DEFERRED: the form draws at once, with the amount, and the PaymentIntent is
 * made only when Pay is pressed, by the server, from the database's prices
 * (lib/checkout/pricing.ts). A buyer who changes the tip changes the amount
 * the form shows; the server works it out again and charges its own figure.
 */

import * as React from "react"
import { Elements, ExpressCheckoutElement, LinkAuthenticationElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import type { Appearance, StripeElementsOptions, StripeError } from "@stripe/stripe-js"
import { cn } from "@/lib/utils"
import { getStripePromise } from "./stripe-loader"
import { OrDivider, PayButton } from "./ui"

export const stripeAppearance: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#1a1a2e",
    colorBackground: "#ffffff",
    colorText: "#1a1a2e",
    colorTextSecondary: "#6b7280",
    colorTextPlaceholder: "#9ca3af",
    colorDanger: "#dc2626",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    /* 16px, not 15: iOS zooms the page into any smaller field, iframes too. */
    fontSizeBase: "16px",
    fontWeightMedium: "500",
    borderRadius: "10px",
    spacingUnit: "4px",
    gridRowSpacing: "12px",
    focusBoxShadow: "0 0 0 3px rgba(26,26,46,0.10)",
    focusOutline: "none",
  },
  rules: {
    ".Input": { border: "1px solid #d4d6db", boxShadow: "none", padding: "12px 14px" },
    ".Input:hover": { border: "1px solid #b9bcc3" },
    ".Input:focus": { border: "1px solid #1a1a2e", boxShadow: "0 0 0 3px rgba(26,26,46,0.10)" },
    ".Input--invalid": { border: "1px solid #dc2626", boxShadow: "0 0 0 3px rgba(220,38,38,0.10)" },
    ".Label": { fontSize: "13px", fontWeight: "500", color: "#374151" },
    ".AccordionItem": { border: "1px solid #e5e7eb", boxShadow: "none" },
    ".AccordionItem--selected": { border: "1px solid #1a1a2e" },
    ".Error": { fontSize: "13px" },
  },
}

const FONTS: StripeElementsOptions["fonts"] = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" }]

/** Stripe's own words for a declined card are good; its plumbing's are not. */
export function paymentErrorText(error: Pick<StripeError, "type" | "message"> | null | undefined): string {
  if (!error) return "The payment did not go through. Nothing was charged."
  if (error.type === "card_error" || error.type === "validation_error") return error.message || "Check the card details and try again."
  return "The payment did not go through. Nothing was charged. Try again."
}

export interface IntentResult {
  clientSecret: string
  paymentIntentId: string
}

export interface StripePayProps {
  amountCents: number
  creatorName: string
  email: string
  onEmail: (email: string) => void
  /** What stops a payment, before anything is sent. Wallets bring their own name and email. */
  check: (mode: "card" | "express") => string | null
  createIntent: (contact?: { email?: string; name?: string }) => Promise<IntentResult>
  payerName: () => string
  onPaid: (paymentIntentId: string, status: string) => Promise<void>
  onError: (message: string | null) => void
  busy: boolean
  setBusy: (busy: boolean) => void
  payLabel: string
  /** Under the email: the name fields and the news tick box. */
  contactExtra: React.ReactNode
  /** Between the payment and Pay: business details, consent, a message. */
  beforePay: React.ReactNode
}

export function StripePay(props: StripePayProps) {
  const options = React.useMemo<StripeElementsOptions>(
    () => ({
      mode: "payment",
      amount: props.amountCents,
      currency: "usd",
      appearance: stripeAppearance,
      fonts: FONTS,
    }),
    [props.amountCents],
  )
  return (
    <Elements stripe={getStripePromise()} options={options}>
      <StripePayInner {...props} />
    </Elements>
  )
}

function returnUrl(): string {
  const url = new URL(window.location.href)
  /* A return from a redirect comes back to this page, which finishes it. */
  for (const key of ["payment_intent", "payment_intent_client_secret", "redirect_status"]) url.searchParams.delete(key)
  return url.toString()
}

function StripePayInner({
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
}: StripePayProps) {
  const stripe = useStripe()
  const elements = useElements()
  /** null while the wallets are being asked; then whether any can pay. */
  const [express, setExpress] = React.useState<boolean | null>(null)
  const [paymentReady, setPaymentReady] = React.useState(false)
  /* Set once. The email is the element's own after that: passing it back on
     every keystroke asked Stripe to update an option that cannot change. */
  const [linkOptions] = React.useState(() => ({ defaultValues: { email } }))

  const pay = async () => {
    onError(null)
    const problem = check("card")
    if (problem) return onError(problem)
    if (!stripe || !elements) return onError("The payment form is still loading. Try again in a moment.")
    setBusy(true)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        onError(paymentErrorText(submitError))
        return
      }
      const intent = await createIntent()
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
      onError(e instanceof Error ? e.message : "The payment did not go through. Nothing was charged.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* ── Express ─────────────────────────────────────────────────── */}
      <section
        aria-label="Express checkout"
        /* No wallet here: gone for a screen reader and the keyboard too. */
        inert={express === false}
        aria-hidden={express === false || undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          express === false ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="mb-3 text-center text-[13px] font-medium text-[#6b7280]">Express checkout</p>
          <div className={cn("min-h-[48px] rounded-[10px]", express === null && "checkout-shimmer")}>
            <ExpressCheckoutElement
              options={{
                buttonHeight: 48,
                buttonType: { applePay: "buy", googlePay: "buy", paypal: "buynow" },
                buttonTheme: { applePay: "black", googlePay: "black", paypal: "gold" },
                layout: { maxColumns: 3, maxRows: 2, overflow: "auto" },
                emailRequired: true,
                business: { name: creatorName },
                paymentMethods: { applePay: "auto", googlePay: "auto", link: "auto", paypal: "auto", amazonPay: "never", klarna: "never" },
              }}
              onReady={(e) => {
                const available = e.availablePaymentMethods
                setExpress(!!available && Object.values(available).some(Boolean))
              }}
              onLoadError={() => setExpress(false)}
              onClick={(e) => {
                onError(null)
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
                  const intent = await createIntent({ email: walletEmail, name: walletName })
                  const { error, paymentIntent } = await stripe.confirmPayment({
                    elements,
                    clientSecret: intent.clientSecret,
                    confirmParams: { return_url: returnUrl() },
                    redirect: "if_required",
                  })
                  if (error) {
                    e.paymentFailed({ reason: "fail" })
                    onError(paymentErrorText(error))
                    return
                  }
                  await onPaid(paymentIntent?.id ?? intent.paymentIntentId, paymentIntent?.status ?? "unknown")
                } catch (err) {
                  e.paymentFailed({ reason: "fail" })
                  onError(err instanceof Error ? err.message : "The payment did not go through. Nothing was charged.")
                } finally {
                  setBusy(false)
                }
              }}
            />
          </div>
          <OrDivider />
        </div>
      </section>

      {/* ── Contact ─────────────────────────────────────────────────── */}
      <section aria-labelledby="checkout-contact">
        <h2 id="checkout-contact" className="mb-3.5 text-[18px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
          Contact
        </h2>
        <LinkAuthenticationElement
          options={linkOptions}
          onChange={(e) => onEmail(e.value.email)}
        />
        <div className="mt-3">{contactExtra}</div>
      </section>

      {/* ── Payment ─────────────────────────────────────────────────── */}
      <section aria-labelledby="checkout-payment" className="mt-8">
        <h2 id="checkout-payment" className="mb-3.5 text-[18px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
          Payment
        </h2>
        <div className={cn("min-h-[180px] rounded-[10px] transition-opacity duration-200", !paymentReady && "checkout-shimmer")}>
          <PaymentElement
            onReady={() => setPaymentReady(true)}
            options={{
              layout: { type: "accordion", defaultCollapsed: false, radios: false, spacedAccordionItems: true },
              fields: { billingDetails: { name: "never", email: "never" } },
              /* The wallets are the express buttons above; twice is noise. */
              wallets: { applePay: "never", googlePay: "never" },
              business: { name: creatorName },
            }}
          />
        </div>
      </section>

      <div className="mt-8 space-y-5">{beforePay}</div>

      <div className="mt-5">
        <PayButton onClick={() => void pay()} busy={busy} disabled={!stripe || !elements}>
          {busy ? "Processing" : payLabel}
        </PayButton>
      </div>
    </div>
  )
}
