"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { CardCvcElement, CardExpiryElement, CardNumberElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { CreditCard, Loader2, Lock } from "lucide-react"

/**
 * ===========================================================================
 *  CARD DETAILS, AS A SUBPAGE
 * ===========================================================================
 *
 * The card is entered here, once, and the main checkout shows a summary of it
 * — "Visa •••• 4242" — the same way it shows a summary of the address. That is
 * what makes the checkout a page of decisions rather than a form: every section
 * is one line saying what has been decided, and tapping it opens the place
 * where it is decided.
 *
 * ---------------------------------------------------------------------------
 * WHAT ACTUALLY CROSSES THE WIRE
 * ---------------------------------------------------------------------------
 * The number never touches this application. The three fields are Stripe
 * iframes; `createPaymentMethod` posts from inside them straight to Stripe, and
 * what comes back is an identifier plus a brand and last four digits. That
 * identifier is what the parent holds, and what the payment is later confirmed
 * with. Nothing here is stored, logged or sent to our server.
 *
 * Creating the PaymentMethod on save rather than at pay time is deliberate: a
 * declined *card shape* — a mistyped number, an expired date — should be caught
 * on the screen where the number is, not thrown up two taps later underneath a
 * pay button. An unused PaymentMethod costs nothing and expires on its own.
 */

export interface SavedCard {
  paymentMethodId: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

/** Brand names as the networks write them, not as Stripe's snake_case ids. */
const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
}

export function cardLabel(card: SavedCard): string {
  const brand = BRAND_LABELS[card.brand] ?? (card.brand ? card.brand.toUpperCase() : "Card")
  return `${brand} •••• ${card.last4}`
}

/** 16px, or iOS zooms the page the instant the field takes focus — and a
 *  zoomed page with a card field in it is very hard to get back out of. */
const ELEMENT_STYLE = {
  style: {
    base: {
      fontSize: "16px",
      color: "#171717",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      "::placeholder": { color: "#a3a3a3" },
      iconColor: "#737373",
    },
    invalid: { color: "#dc2626", iconColor: "#dc2626" },
  },
}

/** One labelled line inside the bordered group. `last` drops the rule so the
 *  group's own border is the only thing closing it off. */
function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`px-4 py-3 ${last ? "" : "border-b border-neutral-200"}`}>
      <span className="block text-[13px] text-neutral-500">{label}</span>
      <div className="mt-2">{children}</div>
    </div>
  )
}

export function CardSheet({
  open,
  onClose,
  onSave,
  billingName,
  billingEmail,
}: {
  open: boolean
  onClose: () => void
  onSave: (card: SavedCard) => void
  /** Printed on the payment method, so the bank sees a name it recognises. */
  billingName: string
  billingEmail: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [name, setName] = useState(billingName)
  const [complete, setComplete] = useState({ number: false, expiry: false, cvc: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setName((n) => n || billingName)
    }
  }, [open, billingName])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  const ready = complete.number && complete.expiry && complete.cvc && name.trim().length >= 3

  const save = async () => {
    if (!stripe || !elements) return
    const numberElement = elements.getElement(CardNumberElement)
    if (!numberElement) return

    setBusy(true)
    setError(null)
    try {
      const { error: err, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: numberElement,
        billing_details: { name: name.trim(), email: billingEmail || undefined },
      })
      if (err || !paymentMethod?.card) {
        setError(err?.message || "Verifică datele cardului.")
        return
      }
      onSave({
        paymentMethodId: paymentMethod.id,
        brand: paymentMethod.card.brand || "",
        last4: paymentMethod.card.last4 || "",
        expMonth: paymentMethod.card.exp_month || 0,
        expYear: paymentMethod.card.exp_year || 0,
      })
      onClose()
    } catch {
      setError("Nu am putut verifica cardul. Încearcă din nou.")
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalii card"
      className="fixed inset-0 z-[96] flex flex-col bg-white"
      style={{ height: "100dvh" }}
    >
      <header
        className="relative shrink-0 border-b border-neutral-200 px-4 pb-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="text-[15px] font-medium text-neutral-700 active:opacity-60"
        >
          închidere
        </button>
        <h1 className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[16px] font-bold text-neutral-900">
          Detalii card
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        <h2 className="mt-5 text-[26px] font-bold leading-tight text-neutral-900">Detalii card</h2>
        <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-neutral-500">
          Cardul este criptat în mod securizat
          <Lock className="h-3.5 w-3.5" />
        </p>

        {/* The fields sit in ONE bordered group rather than as full-width rules,
            because a card is a single object with four parts, not four
            unrelated questions. The brand mark appears inside the number field
            as soon as the network is recognisable — Stripe draws it, which is
            also why no trademarked logo files are shipped here. */}
        <div className="mt-5 rounded-2xl border border-neutral-200">
          <Row label="Nume titular">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="cc-name"
              className="w-full bg-transparent text-[16px] text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </Row>
          <Row label="Număr card">
            <CardNumberElement
              options={{ ...ELEMENT_STYLE, showIcon: true, placeholder: "de ex.: 1234 1234 1234 1234" }}
              onChange={(e) => setComplete((c) => ({ ...c, number: e.complete }))}
            />
          </Row>
          <div className="grid grid-cols-2">
            <div className="border-r border-neutral-200">
              <Row label="Data de expirare" last>
                <CardExpiryElement
                  options={{ ...ELEMENT_STYLE, placeholder: "LL / AA" }}
                  onChange={(e) => setComplete((c) => ({ ...c, expiry: e.complete }))}
                />
              </Row>
            </div>
            <Row label="Cod de securitate" last>
              <CardCvcElement
                options={{ ...ELEMENT_STYLE, placeholder: "de ex.: 123" }}
                onChange={(e) => setComplete((c) => ({ ...c, cvc: e.complete }))}
              />
            </Row>
          </div>
        </div>

        {/* No "save this card for next time" box. The reference has one; we do
            not have anywhere to save a card to, and a checkbox that quietly
            does nothing is worse than an absent one — somebody would tick it,
            come back, and be asked for their number again. */}
        <p className="mt-4 text-[12.5px] leading-snug text-neutral-500">
          Datele cardului sunt trimise criptat direct către procesatorul de plăți. Storelib nu le vede și nu le
          stochează.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-red-600">
            {error}
          </p>
        )}

        <div className="h-6" />
      </div>

      <div
        className="shrink-0 border-t border-neutral-200 px-4 pt-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          disabled={!ready || busy || !stripe}
          onClick={save}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-6 text-[16px] font-semibold text-white transition-transform active:scale-[0.985] disabled:opacity-40 disabled:active:scale-100"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Se verifică…" : "Utilizează acest card"}
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** The one-line summary the main checkout shows in place of the form. */
export function PaymentCard({ card, onEdit }: { card: SavedCard | null; onEdit: () => void }) {
  return (
    <section aria-label="Plată">
      <h2 className="text-[16px] font-bold text-neutral-900">Plată</h2>
      <button
        type="button"
        onClick={onEdit}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors active:bg-neutral-50"
      >
        <CreditCard className="h-5 w-5 shrink-0 text-neutral-400" />
        <span className="min-w-0 flex-1">
          {card ? (
            <>
              <span className="block text-[15px] font-semibold text-neutral-900">{cardLabel(card)}</span>
              <span className="mt-0.5 block text-[14px] text-neutral-500">
                Expiră {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
              </span>
            </>
          ) : (
            <span className="block text-[15px] text-neutral-500">Adaugă un card</span>
          )}
        </span>
        <span className="shrink-0 text-[14px] font-medium text-[#7c3aed]">{card ? "Schimbă" : "Adaugă"}</span>
      </button>
    </section>
  )
}
