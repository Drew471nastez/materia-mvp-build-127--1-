"use client"

/**
 * ===========================================================================
 *  BUYING A PROGRAM, WITHOUT LEAVING THE COMMUNITY
 * ===========================================================================
 * Round 13: "paid programs open an embedded Stripe checkout in a sheet or
 * dialog, never redirecting to the main Storelib checkout; on success the
 * program opens". The button carries the price; pressing it opens a sheet on
 * a phone and a dialog on a computer (components/ui/sheet-dialog), and
 * Stripe's own Embedded Checkout loads inside it, for a session the server
 * made for this member and this program (app/api/community/<id>/learn/
 * <programId>/checkout): the price, the creator's payouts account and the
 * platform's fee are all the server's.
 *
 * WHEN STRIPE SAYS IT IS PAID (onComplete; the session never redirects),
 * the sheet asks the server to confirm it (the same grant Stripe's webhook
 * makes, whichever arrives first), says it is theirs, and the page under it
 * is refreshed, so closing the sheet shows the program's first lesson.
 *
 * Stripe.js is loaded only when the sheet first opens (app/checkout/parts/
 * stripe-loader, the same careful loader the product checkout uses).
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Lock } from "lucide-react"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { getStripePromise } from "@/app/checkout/parts/stripe-loader"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community/member/ui"
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

export interface BuyProgramProps {
  communityId: string
  communityName: string
  programId: string
  title: string
  priceLabel: string
  coverUrl: string | null
  className?: string
  /** Opened already (the probe, which has no button to press). */
  initiallyOpen?: boolean
  /** Round AG: one module of the program, bought on its own (lib/communities/server/module-sales.ts). */
  moduleId?: string | null
  /** The button's own words, for a module ("Buy module"). */
  buttonLabel?: string
}

export function BuyProgram({ className, ...props }: BuyProgramProps) {
  const [open, setOpen] = React.useState(!!props.initiallyOpen)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} data-buy-program={props.programId} data-buy-module={props.moduleId ?? undefined}>
        <Lock className="h-4 w-4" aria-hidden />
        {props.buttonLabel ?? tt("Buy for {priceLabel}", { priceLabel: props.priceLabel })}
      </button>
      <ProgramCheckoutSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function ProgramCheckoutSheet({ communityId, communityName, programId, title, priceLabel, open, onClose, moduleId = null }: BuyProgramProps & { open: boolean; onClose: () => void }) {
  const phone = usePhone()
  const router = useRouter()
  const [phase, setPhase] = React.useState<Phase>({ kind: "form" })
  /* A new session each time the sheet opens: Stripe's form is made for one. */
  const [attempt, setAttempt] = React.useState(0)
  const session = React.useRef<string | null>(null)
  const base = `/api/community/${communityId}/learn/${programId}/checkout`

  React.useEffect(() => {
    if (open) {
      setPhase({ kind: "form" })
      setAttempt((n) => n + 1)
    }
  }, [open])

  const fetchClientSecret = React.useCallback(async () => {
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...(moduleId ? { body: JSON.stringify({ moduleId }) } : {}) }).catch(() => null)
    const body = (await res?.json().catch(() => null)) as { clientSecret?: string; sessionId?: string; error?: string } | null
    if (!res?.ok || !body?.clientSecret) {
      const message = body?.error || tt("The payment form did not load. Try again.")
      setPhase({ kind: "error", message })
      throw new Error(message)
    }
    session.current = body.sessionId ?? null
    return body.clientSecret
  }, [base, moduleId])

  const onComplete = React.useCallback(async () => {
    setPhase({ kind: "confirming" })
    /* The webhook may already have done it; asking again is harmless and makes this page not wait for it. */
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${base}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ sessionId: session.current, ...(moduleId ? { kind: "module" } : {}) }) }).catch(() => null)
      if (res?.ok) {
        setPhase({ kind: "done" })
        router.refresh()
        return
      }
      if (res && res.status !== 409) break
      await new Promise((r) => setTimeout(r, 1200))
    }
    setPhase({ kind: "error", message: tt("Your payment went through. The program opens in a moment: refresh the page if it does not.") })
    router.refresh()
  }, [base, router, moduleId])

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
      <div className="flex h-full min-h-0 flex-col" data-program-checkout={phase.kind}>
        <div className="shrink-0 border-b border-[#eef0f2] px-5 pb-3.5 pt-1 sm:px-6 sm:pt-5">
          <SheetDialogTitle className="truncate pr-8 text-[17px] font-semibold leading-6 text-[#1a1a2e]">{title}</SheetDialogTitle>
          <p className="mt-0.5 truncate text-[13.5px] text-[#6b7280]">
            <span className="font-semibold tabular-nums text-[#1a1a2e]">{priceLabel}</span> · {tt("one payment · in {communityName}", { communityName })}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white" data-program-checkout-body>
          {phase.kind === "done" ? (
            <Done title={title} onClose={onClose} />
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
                  <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Opening your program")}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </SheetDialog>
  )
}

function Done({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="px-6 py-12 text-center" data-program-bought>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a2e] text-white">
        <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
      </span>
      <p className="mt-4 text-[17px] font-semibold text-[#1a1a2e]">{tt("It is yours")}</p>
      <p className="mx-auto mt-1 max-w-[320px] text-[14px] leading-6 text-[#6b7280]">{tt("{title} is in your Learn now, ready when you are.", { title })}</p>
      <button type="button" className={`${BTN_PRIMARY} mt-6 h-11 w-full max-w-[280px] sm:h-10`} onClick={onClose}>
        {tt("Start the first lesson")}
      </button>
    </div>
  )
}
