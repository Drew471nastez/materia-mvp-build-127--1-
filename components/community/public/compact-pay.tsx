"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY CHECKOUT'S PAYMENT, IN ONE ROW (round AG)
 * ===========================================================================
 * What a join needs and nothing more, the way Skool asks it:
 *
 *   wallet   Apple Pay or Google Pay, only when this browser and device can
 *            pay that way (Stripe's paymentRequest().canMakePayment() says
 *            which). Without one, no toggle: the card alone.
 *   card     Stripe's own one line card field (number, expiry, CVC), drawn
 *            by Stripe in its own frame, so card details never reach
 *            Storelib's servers (PCI: Stripe's hosted fields).
 *
 * Either way the browser hands back a payment method id; the caller makes
 * the subscription with it and confirms it here, Stripe opening the bank's
 * check (3-D Secure) in its own window when the card asks for one. Access is
 * granted by the server afterwards (/api/memberships/confirm), never here.
 */
import * as React from "react"
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js"
import type { PaymentRequest, Stripe, StripeCardElementChangeEvent } from "@stripe/stripe-js"
import { cn } from "@/lib/utils"
import { getStripePromise } from "@/components/checkout/parts/stripe-loader"

export type WalletKind = "apple" | "google" | "link" | "browser"

export interface StartedPayment {
  clientSecret: string
  /** A trial collects the card for later (a SetupIntent); anything else is paid now (a PaymentIntent). */
  type: "payment" | "setup"
}

export interface CompactPayProps {
  /** What is charged today, in the smallest unit: 0 during a free trial. */
  dueTodayCents: number
  currency: string
  /** The line a wallet's sheet shows: "SalajanyWood Club, Standard". */
  label: string
  payLabel: string
  disabled?: boolean
  dark?: boolean
  email: string
  name: string
  /** Makes the subscription with this payment method; the answer says what to confirm. */
  start: (paymentMethodId: string) => Promise<StartedPayment>
  /** Stripe confirmed (or nothing needed confirming): the caller asks the server for access. */
  onConfirmed: () => Promise<void>
  onError: (message: string | null) => void
  busy: boolean
  setBusy: (b: boolean) => void
  /** Drawn between the card field and the button: the order summary, as Skool places it. */
  children?: React.ReactNode
  /**
   * Link, Stripe's saved card wallet, inside the card field (round 11, the OnePage's instant checkout). Off unless asked:
   * the community's join keeps its card field exactly as it was.
   */
  allowLink?: boolean
}

export function CompactPay(props: CompactPayProps) {
  const stripePromise = React.useMemo(() => getStripePromise(), [])
  return (
    <Elements stripe={stripePromise} options={{ locale: "auto" }}>
      <CompactPayInner {...props} />
    </Elements>
  )
}

/** The account's country, which Stripe's wallet sheet needs; Storelib's platform account is set in the environment. */
const ACCOUNT_COUNTRY = (process.env.NEXT_PUBLIC_STRIPE_ACCOUNT_COUNTRY || "US").toUpperCase()

function cardStyle(dark: boolean) {
  return {
    base: {
      fontSize: "16px",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
      color: dark ? "#ececee" : "#1a1a2e",
      iconColor: dark ? "#a1a1aa" : "#6b7280",
      "::placeholder": { color: dark ? "#71717a" : "#9ca3af" },
    },
    invalid: { color: dark ? "#fca5a5" : "#b42318", iconColor: dark ? "#fca5a5" : "#b42318" },
  }
}

function errorText(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message
  return m && m.length < 240 ? m : fallback
}

function CompactPayInner({ dueTodayCents, currency, label, payLabel, disabled, dark = false, email, name, start, onConfirmed, onError, busy, setBusy, children, allowLink = false }: CompactPayProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [wallet, setWallet] = React.useState<{ request: PaymentRequest; kind: WalletKind } | null>(null)
  const [method, setMethod] = React.useState<"wallet" | "card">("card")
  const [card, setCard] = React.useState<{ complete: boolean; error: string | null; ready: boolean }>({ complete: false, error: null, ready: false })
  const startRef = React.useRef(start)
  startRef.current = start
  const confirmedRef = React.useRef(onConfirmed)
  confirmedRef.current = onConfirmed

  /* Which wallet this device has, asked once Stripe is here. A wallet the browser offers is the first choice shown. */
  React.useEffect(() => {
    if (!stripe) return
    let live = true
    const request = stripe.paymentRequest({
      country: ACCOUNT_COUNTRY,
      currency: currency.toLowerCase(),
      total: { label, amount: Math.max(0, dueTodayCents) },
      requestPayerEmail: false,
      requestPayerName: false,
    })
    request
      .canMakePayment()
      .then((can) => {
        if (!live || !can) return
        const kind: WalletKind = can.applePay ? "apple" : can.googlePay ? "google" : can.link ? "link" : "browser"
        /* Link is Stripe's own saved-card wallet: the card field already offers it, so no second button for it. */
        if (kind === "link") return
        setWallet({ request, kind })
        setMethod("wallet")
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
    // The sheet's amount is kept in step below; the request itself is made once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe])

  React.useEffect(() => {
    wallet?.request.update({ currency: currency.toLowerCase(), total: { label, amount: Math.max(0, dueTodayCents) } })
  }, [wallet, currency, label, dueTodayCents])

  /** The payment method is made; the subscription is made with it; Stripe confirms it, opening the bank's check if asked. */
  const confirmWith = React.useCallback(
    async (stripeJs: Stripe, paymentMethodId: string, viaWallet: boolean): Promise<boolean> => {
      const started = await startRef.current(paymentMethodId)
      const confirm = started.type === "setup"
        ? (handleActions: boolean) => stripeJs.confirmCardSetup(started.clientSecret, { payment_method: paymentMethodId }, { handleActions })
        : (handleActions: boolean) => stripeJs.confirmCardPayment(started.clientSecret, { payment_method: paymentMethodId }, { handleActions })
      /* A wallet's sheet is closed first, then any bank check is opened over the page, as Stripe asks. */
      const first = await confirm(!viaWallet)
      if (first.error) throw new Error(first.error.message || "The payment did not go through. Nothing was charged.")
      const status = "paymentIntent" in first && first.paymentIntent ? first.paymentIntent.status : "setupIntent" in first && first.setupIntent ? first.setupIntent.status : "succeeded"
      if (viaWallet && status === "requires_action") {
        const again = await confirm(true)
        if (again.error) throw new Error(again.error.message || "Your bank did not approve the payment. Nothing was charged.")
      }
      if (status === "processing") throw new Error("Your bank is still processing the payment. You're let in as soon as it clears, and we'll email you.")
      return true
    },
    [],
  )

  /* The wallet's own answer: a payment method from the sheet. */
  React.useEffect(() => {
    if (!wallet || !stripe) return
    const onMethod = async (ev: { paymentMethod: { id: string }; complete: (s: "success" | "fail") => void }) => {
      setBusy(true)
      onError(null)
      try {
        await confirmWith(stripe, ev.paymentMethod.id, true).catch((e) => {
          ev.complete("fail")
          throw e
        })
        ev.complete("success")
        await confirmedRef.current()
      } catch (e) {
        onError(errorText(e, "The payment did not go through. Nothing was charged."))
      } finally {
        setBusy(false)
      }
    }
    wallet.request.on("paymentmethod", onMethod as never)
    return () => {
      wallet.request.off("paymentmethod", onMethod as never)
    }
  }, [wallet, stripe, confirmWith, onError, setBusy])

  const payByCard = async () => {
    if (!stripe || !elements || busy) return
    const element = elements.getElement(CardElement)
    if (!element) return
    if (!card.complete) {
      onError(card.error || "Enter your card number, expiry date and security code.")
      element.focus()
      return
    }
    setBusy(true)
    onError(null)
    try {
      const made = await stripe.createPaymentMethod({ type: "card", card: element, billing_details: { email, name: name || undefined } })
      if (made.error || !made.paymentMethod) throw new Error(made.error?.message || "Check the card details and try again.")
      await confirmWith(stripe, made.paymentMethod.id, false)
      await confirmedRef.current()
    } catch (e) {
      onError(errorText(e, "The payment did not go through. Nothing was charged."))
    } finally {
      setBusy(false)
    }
  }

  const payByWallet = () => {
    if (!wallet || busy) return
    onError(null)
    /* Must be called straight from the press: the browser opens its sheet only for a user's own tap. */
    wallet.request.show()
  }

  /* The field's own frame says when it is drawn; should that word never come (a blocked frame), the shimmer goes after a few seconds rather than covering it for good. */
  React.useEffect(() => {
    const t = window.setTimeout(() => setCard((c) => (c.ready ? c : { ...c, ready: true })), 6000)
    return () => window.clearTimeout(t)
  }, [])
  const loading = !stripe || !card.ready
  return (
    <div data-compact-pay="">
      {wallet ? (
        <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2.5" data-pay-methods="">
          {(["wallet", "card"] as const).map((m) => {
            const on = method === m
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => {
                  setMethod(m)
                  onError(null)
                }}
                className={cn(
                  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-white text-[15px] font-medium text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25",
                  on ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e] [[data-community-theme=dark]_&]:border-[#e4e4e7]! [html[data-sl-dark]_&]:border-[#e4e4e7]! [[data-community-theme=dark]_&]:shadow-[0_0_0_1px_#e4e4e7]! [html[data-sl-dark]_&]:shadow-[0_0_0_1px_#e4e4e7]!" : "border-[#e1e3e7] hover:border-[#c9ccd2]",
                )}
                data-pay-method={m}
              >
                {m === "wallet" ? <WalletMark kind={wallet.kind} /> : <CardGlyph />}
                {m === "wallet" ? (wallet.kind === "apple" ? "Pay" : wallet.kind === "google" ? "Pay" : "Wallet") : "Card"}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className={cn("mt-3", method === "wallet" && wallet && "hidden")}>
        <div
          className={cn(
            "relative flex h-12 items-center rounded-xl border bg-white px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[#1a1a2e] focus-within:shadow-[0_0_0_1px_#1a1a2e] [[data-community-theme=dark]_&]:focus-within:border-[#e4e4e7]! [html[data-sl-dark]_&]:focus-within:border-[#e4e4e7]! [[data-community-theme=dark]_&]:focus-within:shadow-[0_0_0_1px_#e4e4e7]! [html[data-sl-dark]_&]:focus-within:shadow-[0_0_0_1px_#e4e4e7]!",
            card.error ? "border-[#f0a8a2]" : "border-[#e1e3e7]",
          )}
          data-card-field=""
        >
          <div className="w-full">
            <CardElement
              options={{ style: cardStyle(dark), hidePostalCode: true, disableLink: !allowLink, disabled: busy || disabled }}
              onReady={() => setCard((c) => ({ ...c, ready: true }))}
              onChange={(e: StripeCardElementChangeEvent) => {
                setCard((c) => ({ ...c, complete: e.complete, error: e.error?.message ?? null }))
                if (!e.error) onError(null)
              }}
            />
          </div>
          {!card.ready ? <span aria-hidden className="absolute inset-x-3.5 top-1/2 h-3 -translate-y-1/2 rounded bg-[#f1f2f4] animate-pulse motion-reduce:animate-none" /> : null}
        </div>
      </div>

      {children ? <div className="mt-4">{children}</div> : null}

      <button
        type="button"
        onClick={method === "wallet" && wallet ? payByWallet : payByCard}
        disabled={busy || disabled || (method === "card" && loading)}
        className="mt-4 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-5 text-[16px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.2)] outline-none transition-[background-color,opacity] duration-150 hover:bg-[#2a2a40] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60"
        data-pay-submit=""
      >
        {busy ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" /> : null}
        {busy ? "Processing" : method === "wallet" && wallet ? `${payLabel} with ${wallet.kind === "apple" ? "Apple Pay" : wallet.kind === "google" ? "Google Pay" : "your wallet"}` : payLabel}
      </button>
    </div>
  )
}

function CardGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2.25" />
      <path d="M2.75 9.5h18.5M6.5 15h3" strokeLinecap="round" />
    </svg>
  )
}

/** The wallet's own mark: Apple's or Google's "G", as each asks their pay buttons to show. */
function WalletMark({ kind }: { kind: WalletKind }) {
  if (kind === "apple") {
    return (
      <svg aria-label="Apple" role="img" viewBox="0 0 17 20" className="h-[18px] w-auto" fill="currentColor">
        <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.8 1.3 10.3.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.2zM11.6 3c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" />
      </svg>
    )
  }
  if (kind === "google") {
    return (
      <svg aria-label="Google" role="img" viewBox="0 0 24 24" className="h-[18px] w-[18px]">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z" />
        <path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z" />
      </svg>
    )
  }
  return <CardGlyph />
}
