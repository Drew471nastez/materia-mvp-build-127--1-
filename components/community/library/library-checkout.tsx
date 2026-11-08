"use client"

/**
 * ===========================================================================
 *  BUYING A LIBRARY ITEM, WITHOUT LEAVING THE COMMUNITY
 * ===========================================================================
 * The button carries the price; pressing it opens a sheet on a phone and a
 * dialog on a computer (components/ui/sheet-dialog), and Stripe's Embedded
 * Checkout loads inside it for a session the server made for this member and
 * this item (app/api/community/<id>/library/<itemId>/checkout): the price,
 * the product, the creator's account, the fee and the tax are the server's.
 * The payment is a Storelib order, with its receipt by email and the item in
 * the buyer's own Storelib library (lib/communities/server/library-checkout.ts).
 *
 * WHEN STRIPE SAYS IT IS PAID (onComplete; the session never redirects), the
 * sheet asks the server to confirm it (the same order Stripe's webhook makes,
 * whichever comes first), says it is theirs, and the place under it is read
 * again, so closing the sheet shows the files.
 *
 * The same careful Stripe.js loader as the product checkout and Learn's sheet.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { getStripePromise } from "@/components/checkout/parts/stripe-loader"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community/member/ui"
import { useCommunityNavigator } from "@/lib/communities/client/navigator-context"
import { tt } from "@/lib/i18n/text"

type Phase = { kind: "form" } | { kind: "confirming" } | { kind: "done" } | { kind: "error"; message: string }

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return phone
}

export interface BuyItemProps {
  communityId: string
  communityName: string
  itemId: string
  title: string
  priceLabel: string
  className?: string
  /** False while the creator's account cannot take payments: the button says so and does nothing. */
  canBuy?: boolean
  /** Opened already (the probe, which has no button to press). */
  initiallyOpen?: boolean
  /** The button's own words; "Buy for $12" when left out. */
  buttonLabel?: string
}

export function BuyItem({ className, canBuy = true, buttonLabel, ...props }: BuyItemProps) {
  const [open, setOpen] = React.useState(!!props.initiallyOpen)
  return (
    <>
      <button type="button" className={className} disabled={!canBuy} onClick={() => setOpen(true)} data-buy-item={props.itemId} title={canBuy ? undefined : tt("Payments are not set up here yet.")}>
        {buttonLabel ?? tt("Buy for {price}", { price: props.priceLabel })}
      </button>
      {canBuy ? <ItemCheckoutSheet {...props} open={open} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

export function ItemCheckoutSheet({ communityId, communityName, itemId, title, priceLabel, open, onClose }: BuyItemProps & { open: boolean; onClose: () => void }) {
  const phone = usePhone()
  const router = useRouter()
  const nav = useCommunityNavigator()
  const [phase, setPhase] = React.useState<Phase>({ kind: "form" })
  /* A new session each time the sheet opens: Stripe's form is made for one. */
  const [attempt, setAttempt] = React.useState(0)
  const session = React.useRef<string | null>(null)
  const base = `/api/community/${communityId}/library/${itemId}/checkout`

  React.useEffect(() => {
    if (open) {
      setPhase({ kind: "form" })
      setAttempt((n) => n + 1)
    }
  }, [open])

  const fetchClientSecret = React.useCallback(async () => {
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: "{}" }).catch(() => null)
    const body = (await res?.json().catch(() => null)) as { clientSecret?: string; sessionId?: string; error?: string } | null
    if (!res?.ok || !body?.clientSecret) {
      const message = body?.error || tt("The payment form did not load. Try again.")
      setPhase({ kind: "error", message })
      throw new Error(message)
    }
    session.current = body.sessionId ?? null
    return body.clientSecret
  }, [base])

  const settled = React.useCallback(() => {
    router.refresh()
    void nav.refresh().catch(() => undefined)
  }, [nav, router])

  const onComplete = React.useCallback(async () => {
    setPhase({ kind: "confirming" })
    /* The webhook may already have made the order; asking again is harmless and means this page does not wait for it. */
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${base}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ sessionId: session.current }) }).catch(() => null)
      if (res?.ok) {
        setPhase({ kind: "done" })
        settled()
        return
      }
      if (res && res.status !== 409) break
      await new Promise((r) => setTimeout(r, 1200))
    }
    setPhase({ kind: "error", message: tt("Your payment went through. It opens here in a moment: refresh the page if it does not.") })
    settled()
  }, [base, settled])

  const options = React.useMemo(() => ({ fetchClientSecret, onComplete }), [fetchClientSecret, onComplete])
  const busy = phase.kind === "confirming"

  return (
    <SheetDialog
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      phone={phone}
      label={tt("Buy {title}", { title })}
      onOpenAutoFocus={(e) => e.preventDefault()}
      className="flex max-h-[min(860px,calc(100dvh-48px))] w-full max-w-[520px] flex-col gap-0 overflow-hidden rounded-2xl p-0"
      sheet={{ height: "calc(var(--vv-h, 100dvh) * 0.92)", maxHeight: "calc(var(--vv-h, 100dvh) * 0.92)", dismissible: !busy, aboveKeyboard: false }}
    >
      <div className="flex h-full min-h-0 flex-col" data-library-checkout={phase.kind}>
        <div className="shrink-0 border-b border-[#eef0f2] px-5 pb-3.5 pt-1 sm:px-6 sm:pt-5">
          <SheetDialogTitle className="truncate pr-8 text-[17px] font-semibold leading-6 text-[#1a1a2e]">{title}</SheetDialogTitle>
          <p className="mt-0.5 truncate text-[13.5px] text-[#6b7280]">
            <span className="font-semibold tabular-nums text-[#1a1a2e]">{priceLabel}</span> · {tt("one payment, from the library of {communityName}", { communityName })}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white">
          {phase.kind === "done" ? (
            <div className="px-6 py-12 text-center" data-library-bought="">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a2e] text-white">
                <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
              </span>
              <p className="mt-4 text-[17px] font-semibold text-[#1a1a2e]">{tt("It is yours")}</p>
              <p className="mx-auto mt-1 max-w-[320px] text-[14px] leading-6 text-[#6b7280]">{tt("The receipt is on its way by email, and {title} is in your Storelib library too.", { title })}</p>
              <button type="button" className={`${BTN_PRIMARY} mt-6 h-11 w-full max-w-[280px] sm:h-10`} onClick={onClose}>
                {tt("Open it")}
              </button>
            </div>
          ) : phase.kind === "error" ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("That did not work")}</p>
              <p className="mx-auto mt-1 max-w-[320px] text-[14px] leading-6 text-[#6b7280]" role="alert">
                {phase.message}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={onClose}>
                  {tt("Close")}
                </button>
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={() => {
                    setPhase({ kind: "form" })
                    setAttempt((n) => n + 1)
                  }}
                >
                  {tt("Try again")}
                </button>
              </div>
            </div>
          ) : (
            <div className="relative min-h-[420px] py-2 sm:py-3">
              {open ? (
                <EmbeddedCheckoutProvider key={attempt} stripe={getStripePromise()} options={options}>
                  <EmbeddedCheckout className="program-embedded-checkout" />
                </EmbeddedCheckoutProvider>
              ) : null}
              {busy ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/85" aria-live="polite">
                  <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Making your receipt")}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </SheetDialog>
  )
}
