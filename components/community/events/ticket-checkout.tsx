"use client"

/**
 * ===========================================================================
 *  BUYING A TICKET, WITHOUT LEAVING THE COMMUNITY
 * ===========================================================================
 * Round 14: an event can carry a price, and a ticket is what opens its
 * details. The button carries the price ("Get a ticket · $25"); pressing it
 * opens a sheet on a phone and a dialog on a computer
 * (components/ui/sheet-dialog), with Stripe's own Embedded Checkout inside
 * it, for a session the server made for this member and this event
 * (app/api/community/<id>/events/<eventId>/checkout): the price, the seat
 * hold, the creator's payouts account and the platform's fee are all the
 * server's, never this page's.
 *
 * WHEN STRIPE SAYS IT IS PAID (onComplete; the session never redirects),
 * the sheet asks the server to confirm it (the same ticket Stripe's webhook
 * writes, whichever arrives first), says the seat is theirs, and refreshes
 * the page under it, so closing the sheet shows the event with its details
 * open.
 *
 * Built the same way as components/community/learn/program-checkout.tsx, so
 * the two paid flows inside a community behave alike. Stripe.js is loaded
 * only when the sheet first opens.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Ticket } from "lucide-react"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { getStripePromise } from "@/app/checkout/parts/stripe-loader"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community/member/ui"

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

export interface BuyTicketProps {
  communityId: string
  communityName: string
  eventId: string
  title: string
  /** "$25", already the server's figure. */
  priceLabel: string
  /** "Thursday, October 8, 6:00 PM", for the top of the sheet. */
  whenLabel: string
  className?: string
  /** Opened already (the probe, which has no button to press). */
  initiallyOpen?: boolean
}

export function BuyTicket({ className, ...props }: BuyTicketProps) {
  const [open, setOpen] = React.useState(!!props.initiallyOpen)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} data-buy-ticket={props.eventId}>
        <Ticket className="h-4 w-4" aria-hidden />
        Get a ticket · {props.priceLabel}
      </button>
      <TicketCheckoutSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function TicketCheckoutSheet({ communityId, communityName, eventId, title, priceLabel, whenLabel, open, onClose }: BuyTicketProps & { open: boolean; onClose: () => void }) {
  const phone = usePhone()
  const router = useRouter()
  const [phase, setPhase] = React.useState<Phase>({ kind: "form" })
  /* A new session each time the sheet opens: Stripe's form is made for one. */
  const [attempt, setAttempt] = React.useState(0)
  const session = React.useRef<string | null>(null)
  const base = `/api/community/${communityId}/events/${eventId}/checkout`

  /*
    THE KEY MOVES ON WHEN THE SHEET CLOSES, not when it opens. Bumping it on
    the way in made React mount Stripe's provider, then remount it with the
    new key, so the server was asked for two sessions and the first seat
    hold was wasted.
  */
  React.useEffect(() => {
    if (open) setPhase({ kind: "form" })
    else setAttempt((n) => n + 1)
  }, [open])

  const fetchClientSecret = React.useCallback(async () => {
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin" }).catch(() => null)
    const body = (await res?.json().catch(() => null)) as { clientSecret?: string; sessionId?: string; error?: string } | null
    if (!res?.ok || !body?.clientSecret) {
      const message = body?.error === "full" ? "The last seat went while you were reading. Nothing was charged." : body?.error || "The payment form did not load. Try again."
      setPhase({ kind: "error", message })
      throw new Error(message)
    }
    session.current = body.sessionId ?? null
    return body.clientSecret
  }, [base])

  const onComplete = React.useCallback(async () => {
    setPhase({ kind: "confirming" })
    /* The webhook may already have written the ticket; asking again is harmless and makes this page not wait for it. */
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${base}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ sessionId: session.current }) }).catch(() => null)
      if (res?.ok) {
        setPhase({ kind: "done" })
        router.refresh()
        return
      }
      if (res && res.status !== 409) break
      await new Promise((r) => setTimeout(r, 1200))
    }
    setPhase({ kind: "error", message: "Your payment went through. The event details open in a moment: refresh the page if they do not." })
    router.refresh()
  }, [base, router])

  const options = React.useMemo(() => ({ fetchClientSecret, onComplete }), [fetchClientSecret, onComplete])
  const busy = phase.kind === "confirming"

  return (
    <SheetDialog
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      phone={phone}
      label={`Get a ticket for ${title}`}
      onOpenAutoFocus={(e) => e.preventDefault()}
      className="flex max-h-[min(860px,calc(100dvh-48px))] w-full max-w-[520px] flex-col gap-0 overflow-hidden rounded-2xl p-0"
      sheet={{ height: "calc(var(--vv-h, 100dvh) * 0.92)", maxHeight: "calc(var(--vv-h, 100dvh) * 0.92)", dismissible: !busy, aboveKeyboard: false }}
    >
      <div className="flex h-full min-h-0 flex-col" data-ticket-checkout={phase.kind}>
        <div className="shrink-0 border-b border-[#eef0f2] px-5 pb-3.5 pt-1 sm:px-6 sm:pt-5">
          <SheetDialogTitle className="truncate pr-8 text-[17px] font-semibold leading-6 text-[#1a1a2e]">{title}</SheetDialogTitle>
          <p className="mt-0.5 truncate text-[13.5px] text-[#6b7280]">
            <span className="font-semibold tabular-nums text-[#1a1a2e]">{priceLabel}</span> · {whenLabel} · in {communityName}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white" data-ticket-checkout-body>
          {phase.kind === "done" ? (
            <Done title={title} whenLabel={whenLabel} onClose={onClose} />
          ) : phase.kind === "error" ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">That did not work</p>
              <p className="mx-auto mt-1 max-w-[320px] text-[14px] leading-6 text-[#6b7280]" role="alert">
                {phase.message}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={onClose}>
                  Close
                </button>
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={() => {
                    setPhase({ kind: "form" })
                    setAttempt((n) => n + 1)
                  }}
                >
                  Try again
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
                  <p className="text-[14px] font-medium text-[#1a1a2e]">Saving your seat</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </SheetDialog>
  )
}

function Done({ title, whenLabel, onClose }: { title: string; whenLabel: string; onClose: () => void }) {
  return (
    <div className="px-6 py-12 text-center" data-ticket-bought>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a2e] text-white">
        <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
      </span>
      <p className="mt-4 text-[17px] font-semibold text-[#1a1a2e]">You are going</p>
      <p className="mx-auto mt-1 max-w-[320px] text-[14px] leading-6 text-[#6b7280]">
        {title} is on {whenLabel}. The receipt is in your email, and the joining details are on the event page.
      </p>
      <button type="button" className={`${BTN_PRIMARY} mt-6 h-11 w-full max-w-[280px] sm:h-10`} onClick={onClose}>
        See the details
      </button>
    </div>
  )
}
