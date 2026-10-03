"use client"

/**
 * STORELIB PAYMENTS SETUP. One calm page over the app, on every screen size,
 * with three steps:
 *
 *   Account  country and legal name as on the ID (Storelib's form); no business question
 *   Verify   Stripe's embedded onboarding, drawn inside this page: identity
 *            and an ID document are collected now, not left for later, so
 *            payments do not pause the first time Stripe asks
 *   Bank     the payout bank, in Stripe's embedded form; the numbers go from
 *            this browser to Stripe and never to Storelib
 *
 * ONE LAYER. It used to be a dialog on a darkened page, and Stripe's own
 * windows (the ID consent, an edit form) open with their own dark backdrop
 * on top of it, so three faded layers stacked up. Now the setup is a full
 * page of its own, light grey with one white card in a narrow column, and
 * nothing behind it is darkened: when Stripe opens a window, its backdrop is
 * the only one.
 *
 * Which step shows comes from the server's status, read from Stripe, so a
 * step Stripe already has is skipped. Not a Radix dialog: Stripe's form opens
 * its own layer over the page, and a modal focus trap would leave it unclickable.
 *
 * The same three steps run in the phone app. Stripe's forms draw in frames at
 * connect-js.stripe.com, which the app's web view used to refuse (proxy.ts
 * narrows frame-src for the app so Stripe.js cannot navigate the web view
 * away, and that host was missing from the list), so the app sent creators to
 * a browser instead. The host is allowed now and the forms run in the app. A
 * browser is offered only if a form still will not load.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Camera, Check, ChevronDown, ChevronLeft, Clock, Info, Landmark, Lock, RotateCcw, ScanFace, Upload, X } from "lucide-react"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { Shimmer, ShimmerBlock } from "@/components/ui/shimmer"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CountryPicker, CountryFlag } from "@/components/app/settings/country-picker"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { countryLabel, countryOf } from "@/lib/account/country"
import { personalIssues } from "@/lib/payments/stripe/onboarding-steps"
import { setupStepOf, type StorelibPaymentsStatus } from "@/lib/payments/stripe/status"
import type { Overview } from "@/components/app/settings/payments-hub-shared"
import { openInApp } from "@/lib/native-bridge"
import { IdCamera, armCameraSounds, type IdSide } from "@/components/app/settings/id-camera"
import { StripeConnectEmbedded } from "@/components/app/settings/stripe-connect-embedded"
import { openIdentity } from "@/lib/payments/identity-client"
import { playAskSound } from "@/lib/website-builder/ask-sounds"
import { cn } from "@/lib/utils"

export type SetupMode = "setup" | "bank" | "details"
type Step = 0 | 1 | 2

/* The app's calm field: a light hairline and a soft halo when focused, 16px on a phone so iOS does not zoom. */
export const FIELD =
  "h-11 w-full rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] hover:border-[#d5d8dd] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
const FIELD_BAD = "border-[#c4290c] hover:border-[#c4290c] focus:border-[#c4290c] focus:shadow-[0_0_0_3px_rgba(196,41,12,0.1)]"
const PRIMARY = cn(primaryDepth, "h-11 gap-2 rounded-xl px-5 text-[14px] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:rounded-lg")
const SECONDARY = cn(secondaryDepth, "h-11 rounded-xl px-5 text-[14px] sm:h-10 sm:rounded-lg")

/**
 * The panel's layer, and the one a sheet opened from inside it needs. A phone
 * sheet sits at 200, which is above the page and below this panel: the country
 * list opened behind the white subpage, so the field looked dead. It is told
 * where to draw instead.
 */
const PANEL_Z = 1000
const SHEET_Z = PANEL_Z + 10

function safe(message: string): string {
  if (/invalid_request|acct_|accs_|btok_|file_|capability|requirement|sk_|whsec/i.test(message)) return "Something went wrong. Try again in a moment."
  return message
}

async function read<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(safe(data.error || "Something went wrong. Try again in a moment."))
  return data
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return read<T>(
    await fetch(`/api/payments/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    }),
  )
}


/* ── the panel ─────────────────────────────────────────────────────────── */

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

/*
  HOW IT COMES AND GOES. A phone slides it in from the side like any
  subpage. A computer fades the page and lifts the card the last few pixels
  into place, and reverses exactly that on the way out, so closing reads as
  the card settling back rather than the screen blinking. The timer that
  takes it off the page is the same length as the leaving animation, so it
  is never cut short and never lingers after it is invisible.
*/
const ENTER_MS = 260
const EXIT_MS = 200

function Panel({
  open,
  phone,
  onClose,
  label,
  children,
}: {
  open: boolean
  phone: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}) {
  const [shown, setShown] = React.useState(open)
  const [leaving, setLeaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setShown(true)
      setLeaving(false)
      return
    }
    if (!shown) return
    setLeaving(true)
    const t = window.setTimeout(() => {
      setShown(false)
      setLeaving(false)
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open, shown])

  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  /* White to the very top on a phone: no black browser bar or status bar zone above it. */
  useLightChrome(shown && phone)

  if (!shown || typeof document === "undefined") return null

  /*
    A page of its own on every screen: white on a phone (where it slides in
    from the side like any subpage), light grey with one card on a computer
    (where it fades in). No darkened page behind it, so Stripe's own window,
    when it opens, is the only backdrop there is.
  */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-payments-setup-panel={phone ? "subpage" : "page"}
      data-leaving={leaving ? "" : undefined}
      style={{ zIndex: PANEL_Z }}
      className={cn(
        "fixed inset-0 flex h-[100dvh] flex-col bg-white ease-sheet [backface-visibility:hidden] sm:bg-[#f6f7f9]",
        phone
          ? leaving
            ? "animate-out slide-out-to-right duration-200 [will-change:transform]"
            : "animate-in slide-in-from-right duration-[260ms] [will-change:transform]"
          : leaving
            ? "animate-out fade-out-0 duration-200"
            : "animate-in fade-in-0 duration-200",
        /* The card inside rises the last few pixels in, and sinks back out. */
        !phone &&
          (leaving
            ? "[&_[data-setup-card]]:animate-out [&_[data-setup-card]]:fade-out-0 [&_[data-setup-card]]:zoom-out-[0.99] [&_[data-setup-card]]:slide-out-to-bottom-2 [&_[data-setup-card]]:duration-200 [&_[data-setup-card]]:ease-sheet"
            : "[&_[data-setup-card]]:animate-in [&_[data-setup-card]]:fade-in-0 [&_[data-setup-card]]:zoom-in-[0.99] [&_[data-setup-card]]:slide-in-from-bottom-2 [&_[data-setup-card]]:duration-[260ms] [&_[data-setup-card]]:ease-sheet"),
      )}
    >
      {children}
    </div>,
    document.body,
  )
}

/**
 * THE PANEL THE MOMENT IT IS ASKED FOR. Opening used to wait on the
 * payments overview: the press did nothing visible, then a quarter of a
 * second later (longer on a phone) the whole panel appeared at once. The
 * press opens this instead, in the same shell, with the card's own shapes
 * where its content will be, and the real flow replaces it when the answer
 * lands. Nothing jumps: the shapes are the sizes of the things they stand
 * in for.
 */
export function PaymentsPanelWaiting({ open, onClose, label = "Payments" }: { open: boolean; onClose: () => void; label?: string }) {
  const phone = usePhone()
  return (
    <Panel open={open} phone={phone} onClose={onClose} label={label}>
      <div className="shrink-0 border-b border-[#f1f2f4] bg-white pt-[env(safe-area-inset-top)] sm:border-[#eceef1]">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-1 px-2 sm:h-16 sm:gap-3 sm:px-6">
          {phone ? (
            <>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#1a1a2e] outline-none transition-colors active:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
              >
                <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.25} />
              </button>
              <span className="min-w-0 flex-1 text-center text-[16px] font-semibold text-[#1a1a2e]">{label}</span>
              <span aria-hidden className="w-11" />
            </>
          ) : (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <StorelibLogo size={28} />
                <span className="text-[15px] font-semibold text-[#1a1a2e]">Storelib</span>
                <span aria-hidden className="h-4 w-px bg-[#e5e7eb]" />
                <span className="truncate text-[14px] text-[#6b7280]">Payments</span>
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="-mr-1.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#eef0f2] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[560px] sm:px-6 sm:pb-16 sm:pt-10">
          <Shimmer className="hidden sm:mb-6 sm:block sm:px-1" label={`Opening ${label.toLowerCase()}`}>
            <ShimmerBlock className="h-6 w-48 rounded-lg" />
            <ShimmerBlock className="mt-2 h-3.5 w-72 rounded-full" />
          </Shimmer>
          <div data-setup-card="" className="bg-white sm:rounded-2xl sm:border sm:border-[#e5e7eb]/80 sm:shadow-[0_1px_3px_rgba(16,24,40,0.05),0_12px_32px_-16px_rgba(16,24,40,0.10)]">
            <Shimmer className="flex min-h-[360px] flex-col gap-4 px-5 pt-5 sm:px-7 sm:pt-7">
              <ShimmerBlock className="h-4 w-40 rounded-full" />
              <ShimmerBlock className="h-11 w-full rounded-[10px] sm:h-10" />
              <ShimmerBlock className="h-4 w-32 rounded-full" />
              <ShimmerBlock className="h-11 w-full rounded-[10px] sm:h-10" />
            </Shimmer>
          </div>
        </div>
      </div>
    </Panel>
  )
}

/* ── small pieces ──────────────────────────────────────────────────────── */

/*
 * ACCOUNT, DETAILS, VERIFY ID.
 *
 * The ID check is its own step and it comes LAST. It was second for a while,
 * so that handing Stripe the document would clear the national ID number
 * before the details page drew it (requirements.alternatives: "the CNP, or a
 * photo of your ID"). That worked, and cost more than it was worth: the ID
 * is the step most likely to be left and come back to, and with the details
 * behind it every return meant typing a date of birth and an address again.
 *
 * So the details are entered once, early, and the number the document stands
 * in for is simply not asked for there: if Stripe offers the document as an
 * alternative, the ID step ahead settles it, and that step offers the number
 * instead for anybody who would rather type it. Nothing is asked twice.
 *
 * The details page carries the bank, so there is one Continue rather than a
 * page of its own. The bank is only its own screen when the bank is all that
 * is being changed (Update bank on Payouts).
 */
const STEP_LABELS = ["Account", "Details", "Verify ID"] as const
/*
 * THE ID CHECK IS ONLY A STEP WHEN STRIPE WANTS IT. A seller Stripe does not
 * need an ID from right now never sees it in the steps at all: the stepper is
 * Account, Details until the ID step has loaded and found Stripe is asking.
 */
const STEP_LABELS_NO_ID = ["Account", "Details"] as const

function Stepper({ step, done: all, labels = STEP_LABELS }: { step: number; done?: boolean; labels?: readonly string[] }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Setup steps">
      {labels.map((label, i) => {
        const done = all || i < step
        const on = !all && i === step
        return (
          <React.Fragment key={label}>
            {i > 0 ? (
              <li aria-hidden className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-[#eceef1]">
                <span className={cn("absolute inset-0 origin-left bg-[#1a1a2e] transition-transform duration-500 ease-sheet", i <= step ? "scale-x-100" : "scale-x-0")} />
              </li>
            ) : null}
            <li className="flex shrink-0 items-center gap-2" aria-current={on ? "step" : undefined}>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold transition-[background-color,color,box-shadow] duration-300",
                  done ? "bg-[#1a1a2e] text-white" : on ? "bg-[#1a1a2e] text-white shadow-[0_0_0_4px_rgba(26,26,46,0.08)]" : "bg-[#f1f2f4] text-[#6b7280]",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5 animate-in zoom-in-50 duration-200" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("text-[13px] transition-colors duration-200", on ? "font-medium text-[#1a1a2e]" : "text-[#6b7280] max-[360px]:hidden")}>{label}</span>
            </li>
          </React.Fragment>
        )
      })}
    </ol>
  )
}

/** A short explanation: hover on a computer, tap on a phone. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const pointer = React.useRef<string>("")
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          data-info-tip=""
          onPointerDown={(e) => (pointer.current = e.pointerType)}
          onPointerEnter={(e) => {
            pointer.current = e.pointerType
            if (e.pointerType === "mouse") setOpen(true)
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setOpen(false)
          }}
          onClick={(e) => {
            if (pointer.current === "mouse") {
              e.preventDefault()
              setOpen(true)
            }
          }}
          className="relative inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-[#9ca3af] outline-none transition-colors after:absolute after:-inset-3 after:content-[''] hover:text-[#1a1a2e] focus-visible:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 data-[state=open]:text-[#1a1a2e]"
        >
          <Info className="h-[15px] w-[15px]" strokeWidth={2} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={() => pointer.current === "mouse" && setOpen(true)}
        onPointerLeave={() => pointer.current === "mouse" && setOpen(false)}
        className="w-auto max-w-[min(280px,calc(100vw-24px))] rounded-[10px] border-0 bg-[#1a1a2e] px-3 py-2 text-[12.5px] leading-[18px] text-white shadow-[0_12px_32px_-8px_rgba(15,17,21,0.45)]"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

function Field({
  label,
  error,
  hint,
  tip,
  optional,
  dense,
  children,
}: {
  label: string
  error?: string
  hint?: string
  tip?: React.ReactNode
  optional?: boolean
  dense?: boolean
  children: React.ReactElement<{ id?: string; "aria-invalid"?: boolean; className?: string }>
}) {
  const id = React.useId()
  return (
    <div className="min-w-0">
      <div className={cn("flex items-center gap-1.5", dense ? "mb-1" : "mb-1.5")}>
        <label htmlFor={id} className={cn("font-medium text-[#1a1a2e]", dense ? "text-[12px]" : "text-[13px]")}>
          {label}
          {optional ? <span className="font-normal text-[#9ca3af]"> (optional)</span> : null}
        </label>
        {tip ? <InfoTip label={label}>{tip}</InfoTip> : null}
      </div>
      {React.cloneElement(children, { id, "aria-invalid": error ? true : undefined })}
      {error ? (
        <span className={cn("block text-[#c4290c] animate-in fade-in-0 slide-in-from-top-1 duration-150", dense ? "mt-1 text-[11px]" : "mt-1.5 text-[12px]")}>{error}</span>
      ) : hint ? (
        <span className={cn("block text-[#6b7280]", dense ? "mt-1 text-[11px]" : "mt-1.5 text-[12px]")}>{hint}</span>
      ) : null}
    </div>
  )
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-3 py-2.5 text-[13px] text-[#9f1239] animate-in fade-in-0 duration-150">
      {message}
    </p>
  )
}


function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-setup-footer=""
      className={cn(
        "sticky bottom-0 z-[1] mt-6 flex sm:static shrink-0 items-center justify-between gap-3 border-t border-[#f1f2f4] bg-white px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:px-7 sm:pb-4 [&>*:last-child]:max-sm:flex-1",
      )}
    >
      {children}
    </div>
  )
}

function Spinner({ dark }: { dark?: boolean }) {
  return <span aria-hidden className={cn("h-4 w-4 animate-spin rounded-full border-2", dark ? "border-[#1a1a2e]/15 border-t-[#1a1a2e]" : "border-white/30 border-t-white")} />
}



/* ── the flow ──────────────────────────────────────────────────────────── */

function statusOf(data: Overview): StorelibPaymentsStatus {
  return data.paymentsStatus?.status ?? (data.beat === "done" ? "ACTIVE" : data.beat === "personal" || !data.beat ? "NOT_STARTED" : "INCOMPLETE")
}

/** Where to go after Stripe's form closes, from the status Stripe now reports. */
type Outcome = "bank" | "done" | "checking" | "more"
function outcomeOf(status: StorelibPaymentsStatus): Outcome {
  if (status === "BANK_REQUIRED") return "bank"
  if (status === "ACTIVE") return "done"
  if (status === "VERIFYING") return "checking"
  return "more"
}

export function PaymentsSetupFlow({
  open,
  mode,
  data,
  onClose,
  onData,
  onFinished,
}: {
  open: boolean
  mode: SetupMode
  data: Overview
  onClose: () => void
  onData: (next: Overview) => void
  /** Setup or a bank change went through: the page can redraw. */
  onFinished: () => void
}) {
  const phone = usePhone()
  const status = statusOf(data)
  const [step, setStep] = React.useState<Step>(() => (setupStepOf(status) === 0 ? 0 : 1))
  const [back, setBack] = React.useState(false)
  const [openCount, setOpenCount] = React.useState(0)
  const [ending, setEnding] = React.useState<Outcome | null>(null)
  /*
   * A STEP WITH NOTHING TO ASK IS NOT A STEP TO WALK BACK INTO. It sends
   * itself on the moment it loads, so Back from the step after it landed
   * there and was sent forward again: the way back was a wall, and pressing
   * it looked like Continue. Once it has said it is empty, Back goes past it.
   */
  /* Stripe wants an ID today: known once the ID step has loaded. */
  const [idNeeded, setIdNeeded] = React.useState(false)
  /* The details step was walked past with nothing to ask, so Back skips it too. */
  const [detailsEmpty, setDetailsEmpty] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setBack(false)
    setEnding(null)
    setIdNeeded(false)
    setDetailsEmpty(false)
    /* A fresh open starts from Stripe's answer, not from what was typed last time. */
    clearDetailsDraft()
    setStep(setupStepOf(status) === 0 ? 0 : 1)
    setOpenCount((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode])

  const go = (next: Step) => {
    setBack(next < step)
    setStep(next)
  }

  /*
   * THE FORM WAS SENT. The write already answered with the overview Stripe
   * gave back, so this reads that rather than asking Stripe all over again:
   * the extra "refresh" was a second full sync between the last Continue and
   * the screen that follows, and it was most of the wait.
   *
   * It is also the only place the "We're verifying your details" screen can
   * come from, and it is only shown when there is genuinely nothing left to
   * do. Stripe parks things in pending_verification for a few seconds after
   * almost any write, so a status read in that window said VERIFYING while
   * the person still had fields and a bank in front of them: the screen
   * appeared out of nowhere and the setup looked finished when it was not.
   * Anything still being asked for sends them back to the form instead.
   */
  const settle = async (sent: Overview, left: DetailsForm | null) => {
    onData(sent)
    const stillAsking = !!left && (left.needs.fields.length > 0 || left.needs.tos || left.needs.bank || left.needs.other.length > 0)
    const outcome = outcomeOf(statusOf(sent))
    if (stillAsking && (outcome === "checking" || outcome === "done")) {
      /* Stripe has not caught up with what it is still asking for: stay on the form. */
      setOpenCount((k) => k + 1)
      return
    }
    if (outcome === "bank") {
      go(2)
      return
    }
    if (outcome === "done" || outcome === "checking") onFinished()
    setEnding(outcome)
  }

  const finish = () => {
    onFinished()
    onClose()
  }

  const title = mode === "bank" ? (data.payoutDestination ? "Payout account" : "Add bank account") : mode === "details" ? "Account details" : "Set up payouts"
  const onBack = mode === "setup" && step > 0 && !ending ? () => go((step - 1) as Step) : onClose
  const slide = back ? "slide-in-from-left-4" : "slide-in-from-right-4"
  /* A business is Account, then Stripe's embedded form for its details; an individual has the ID step only when Stripe asks. */
  const business = data.kind === "business"
  const labels = !business && idNeeded ? STEP_LABELS : STEP_LABELS_NO_ID
  const last = labels.length - 1
  const shownStep = ending === "done" || ending === "checking" ? last : labels === STEP_LABELS ? step : Math.min(step, 1)

  let body: React.ReactNode
  if (ending) {
    body = (
      <Outcome
        outcome={ending}
        onContinue={() => {
          setEnding(null)
          setOpenCount((k) => k + 1)
        }}
        onDone={finish}
      />
    )
  } else if (mode === "bank") {
    const failed = data.paymentsStatus?.status === "PAYOUT_FAILED"
    body = <BankForm key={`bank-${openCount}`} failed={failed} onBack={onClose} backLabel="Cancel" onDone={() => void settle(data, null)} onData={onData} />
  } else if (mode === "details" && data.kind === "business") {
    body = <BusinessDetailsStep key={`business-more-${openCount}`} onBack={onClose} onDone={(sent) => void settle(sent, null)} />
  } else if (mode === "details") {
    body = <DetailsStep key={`details-${openCount}`} withBank onBack={onClose} onNext={(left, sent) => void settle(sent ?? data, left)} onData={onData} />
  } else if (step === 0) {
    body = (
      <AccountStep
        data={data}
        onBack={onClose}
        onDone={(next) => {
          onData(next)
          go(1)
        }}
      />
    )
  } else if (business) {
    body = <BusinessDetailsStep key={`business-${openCount}`} onBack={() => go(0)} onDone={(sent) => void settle(sent, null)} />
  } else if (step === 1) {
    body = (
      <DetailsStep
        key={`details-step-${openCount}`}
        only="details"
        withBank
        onBack={() => go(0)}
        onEmpty={() => setDetailsEmpty(true)}
        onNext={() => go(2)}
        onData={onData}
      />
    )
  } else {
    body = (
      <DetailsStep
        key={`id-${openCount}`}
        only="id"
        onBack={() => go(detailsEmpty ? 0 : 1)}
        onAsking={() => setIdNeeded(true)}
        onNext={(left, sent) => void settle(sent ?? data, left)}
        onData={onData}
      />
    )
  }

  const subtitle =
    mode === "setup"
      ? "Your country, your name as on your ID, a few details Stripe needs and your bank. About five minutes."
      : mode === "bank"
        ? "Where your cash outs are sent."
        : "The details on your payments account."

  return (
    <Panel open={open} phone={phone} onClose={onClose} label={title}>
      {/* The bar: the way back on a phone; Storelib's mark and the way out on a computer. */}
      <div className="shrink-0 border-b border-[#f1f2f4] bg-white pt-[env(safe-area-inset-top)] sm:border-[#eceef1]">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-1 px-2 sm:h-16 sm:gap-3 sm:px-6">
          {phone ? (
            <>
              <button
                type="button"
                aria-label={mode === "setup" && step > 0 && !ending ? "Back" : "Close"}
                onClick={onBack}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#1a1a2e] outline-none transition-colors active:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
              >
                <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.25} />
              </button>
              <h2 className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-[#1a1a2e]">{title}</h2>
              <span aria-hidden className="w-11" />
            </>
          ) : (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <StorelibLogo size={28} />
                <span className="text-[15px] font-semibold text-[#1a1a2e]">Storelib</span>
                <span aria-hidden className="h-4 w-px bg-[#e5e7eb]" />
                <span className="truncate text-[14px] text-[#6b7280]">Payments</span>
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="-mr-1.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#eef0f2] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div data-setup-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* One narrow column: 560px of card on a computer, the whole width on a phone,
            where it fills the screen so Cancel and Continue sit at the bottom. */}
        <div className="mx-auto w-full max-w-[560px] max-sm:flex max-sm:min-h-full max-sm:flex-col sm:px-6 sm:pb-16 sm:pt-10">
          {phone ? (
            mode === "setup" ? (
              <div className="px-5 pt-4">
                <Stepper step={shownStep} labels={labels} done={ending === "done"} />
              </div>
            ) : null
          ) : (
            <div className="mb-6 px-1">
              <h2 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-[#1a1a2e]">{title}</h2>
              <p className="mt-1 text-[14px] leading-5 text-[#6b7280]">{subtitle}</p>
              {mode === "setup" ? (
                <div className="mt-5">
                  <Stepper step={shownStep} labels={labels} done={ending === "done"} />
                </div>
              ) : null}
            </div>
          )}

          <div data-setup-card="" className="bg-white max-sm:flex max-sm:flex-1 max-sm:flex-col sm:rounded-2xl sm:border sm:border-[#e5e7eb]/80 sm:shadow-[0_1px_3px_rgba(16,24,40,0.05),0_12px_32px_-16px_rgba(16,24,40,0.10)]">
            <div key={`${mode}-${step}-${ending ?? ""}-${openCount}`} className={cn("flex min-h-[360px] flex-col max-sm:flex-1 pt-5 animate-in fade-in-0 duration-300 ease-sheet sm:pt-7", slide)}>
              {body}
            </div>
          </div>

        </div>
      </div>
    </Panel>
  )
}
/* ── step 1: account ───────────────────────────────────────────────────── */

function AccountStep({ data, onBack, onDone }: { data: Overview; onBack: () => void; onDone: (next: Overview) => void }) {
  const hasAccount = (data.beat ?? "personal") !== "personal"
  /*
   * HOW ARE YOU SELLING? Two choices, Individual first and already picked,
   * because somebody selling under their own name is nearly everybody here.
   * An individual is never shown a company field. A business gives its legal
   * name now and only what Stripe needs today after that. Fixed once the
   * account exists: Stripe cannot change an account's type.
   */
  const [kindChoice, setKindChoice] = React.useState<"individual" | "business">(data.kind === "business" ? "business" : "individual")
  const kind: "individual" | "business" = hasAccount ? (data.kind === "business" ? "business" : "individual") : kindChoice
  const [countryName, setCountryName] = React.useState(data.payoutHint?.country ? countryLabel(data.payoutHint.country) : data.prefill?.country ? countryLabel(data.prefill.country) : "")
  const [firstName, setFirstName] = React.useState(data.prefill?.firstName ?? "")
  const [lastName, setLastName] = React.useState(data.prefill?.lastName ?? "")
  const [businessName, setBusinessName] = React.useState("")
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const country = countryOf(countryName) ?? ""
  const issues = personalIssues({ kind, country, firstName, lastName, businessName })
  const issue = (key: keyof typeof issues) => ((touched[key] || tried) && issues[key]) || undefined
  const mark = (key: string) => setTouched((t) => ({ ...t, [key]: true }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.keys(issues).length > 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      onDone(await post<Overview>("begin", { agree: true, kind, country, firstName, lastName, businessName: kind === "business" ? businessName : "" }))
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : "We could not start setup just now."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} onInput={() => error && setError(null)} noValidate className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 space-y-5 px-5 sm:px-7">
        <ErrorLine message={error} />
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-[#1a1a2e]">Where are you based?</span>
            <InfoTip label="Country">
              {hasAccount
                ? "Locked once your payments account is created. It sets your payout currency and tax rules. Disconnect below and start over if you chose the wrong country."
                : "Where you live. It sets your payout currency and which ID Stripe asks for, and cannot be changed after you continue."}
            </InfoTip>
          </div>
          {hasAccount && data.payoutHint?.country ? (
            <div className="flex h-11 items-center gap-2 rounded-[10px] border border-[#e3e5e8] bg-[#f9fafb] px-3.5 text-[14px] text-[#1a1a2e] sm:h-10 sm:rounded-lg">
              <CountryFlag code={data.payoutHint.country} />
              <span className="flex-1 truncate">{countryLabel(data.payoutHint.country)}</span>
              <Lock className="h-3.5 w-3.5 text-[#9ca3af]" aria-label="Locked" />
            </div>
          ) : (
            /* Marked when a country is picked, not when the field loses focus:
               opening the list blurs it, and "Choose your country." under a
               field somebody has just opened reads as a telling off. If they
               close it without picking, Continue says so. */
            <CountryPicker value={countryName} onChange={(name) => { setCountryName(name); mark("country") }} sheetZIndex={SHEET_Z} fieldClassName="rounded-[10px] border-[#e3e5e8] text-[16px] shadow-none sm:h-10 sm:rounded-lg sm:text-[14px]" />
          )}
          {issue("country") ? <span className="mt-1.5 block text-[12px] text-[#c4290c]">{issue("country")}</span> : null}
        </div>

        <fieldset data-account-kind="">
          <legend className="mb-1.5 text-[13px] font-medium text-[#1a1a2e]">How are you selling?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["individual", "business"] as const).map((k) => {
              const on = kind === k
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={hasAccount && !on}
                  onClick={() => !hasAccount && setKindChoice(k)}
                  className={cn(
                    "h-11 rounded-[10px] border text-[14px] font-medium outline-none transition-[border-color,background-color,box-shadow] duration-150 focus-visible:shadow-[0_0_0_3px_rgba(17,17,19,0.08)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:rounded-lg",
                    on ? "border-[#1a1a2e] bg-[#1a1a2e]/[0.03] text-[#1a1a2e]" : "border-[#e3e5e8] bg-white text-[#4b5563] hover:border-[#c9ccd3]",
                  )}
                >
                  {k === "individual" ? "Individual" : "Business"}
                </button>
              )
            })}
          </div>
        </fieldset>

        {kind === "business" ? (
          <Field label="Legal business name" error={issue("businessName")} tip="The registered name of your company, exactly as on its official papers.">
            <input className={cn(FIELD, issue("businessName") && FIELD_BAD)} value={businessName} placeholder="Legal business name" autoComplete="organization" onBlur={() => mark("businessName")} onChange={(e) => setBusinessName(e.target.value)} />
          </Field>
        ) : null}

        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <Field label="First name" error={issue("firstName")} tip={kind === "business" ? "The first name of the person running the business, as on their ID." : "Exactly as on your passport or ID card, with any middle names."}>
            <input className={cn(FIELD, issue("firstName") && FIELD_BAD)} value={firstName} placeholder="First name" autoComplete="given-name" onBlur={() => mark("firstName")} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name" error={issue("lastName")} tip="Your last name exactly as on your ID, including any second last name.">
            <input className={cn(FIELD, issue("lastName") && FIELD_BAD)} value={lastName} placeholder="Last name" autoComplete="family-name" onBlur={() => mark("lastName")} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
      </div>

      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>Cancel</button>
        <button type="submit" className={PRIMARY} disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving" : "Continue"}
        </button>
      </Footer>
    </form>
  )
}

/* ── step 2: verify ────────────────────────────────────────────────────── */

function StepIntro({ title, line }: { title: string; line: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{title}</h3>
      <p className="mt-1 text-[14px] leading-5 text-[#6b7280]">{line}</p>
    </div>
  )
}

/* ── step 2: your details (Storelib's own form) ────────────────────────── */

/*
 * WHAT WAS TYPED, KEPT WHILE SETUP IS OPEN.
 *
 * Each step is its own mount, so walking to the ID check and back used to
 * draw an empty form and ask for a date of birth and an address that had
 * just been entered. This holds them between steps: written on every change,
 * read when the step mounts, and cleared when setup is opened afresh (so a
 * later visit starts from Stripe's answer rather than from an old draft).
 *
 * It lives in memory for this tab only, never in storage: it is the
 * creator's own identity details, and nothing here outlives the page.
 */
interface DetailsDraft {
  dob: { day: string; month: string; year: string }
  address: { line1: string; line2: string; city: string; postalCode: string; state: string }
  phone: string
  nationality: string
  idNumber: string
  ssnLast4: string
  pep: boolean
  agree: boolean
  holder: string | null
  iban: string
  accountNumber: string
  routing: string
}

const EMPTY_DRAFT: DetailsDraft = {
  dob: { day: "", month: "", year: "" },
  address: { line1: "", line2: "", city: "", postalCode: "", state: "" },
  phone: "",
  nationality: "",
  idNumber: "",
  ssnLast4: "",
  pep: false,
  agree: false,
  holder: null,
  iban: "",
  accountNumber: "",
  routing: "",
}

let detailsDraft: DetailsDraft = { ...EMPTY_DRAFT }

export function clearDetailsDraft() {
  detailsDraft = { ...EMPTY_DRAFT }
}

/** One field of the draft, kept across steps. */
function useDraft<K extends keyof DetailsDraft>(key: K): [DetailsDraft[K], (next: DetailsDraft[K]) => void] {
  const [value, set] = React.useState<DetailsDraft[K]>(detailsDraft[key])
  const put = React.useCallback(
    (next: DetailsDraft[K]) => {
      detailsDraft[key] = next
      set(next)
    },
    [key],
  )
  return [value, put]
}

type DetailField = "dob" | "address" | "state" | "phone" | "nationality" | "idNumber" | "ssnLast4" | "document" | "proofOfAddress" | "politicalExposure"
interface DetailsForm {
  needs: { fields: DetailField[]; tos: boolean; bank: boolean; name: boolean; other: string[]; checking: boolean; registeredAddress: boolean; problems: string[]; either: Array<{ original: DetailField[]; alternative: DetailField[] }>; offered: DetailField[]; given?: DetailField[] }
  country: string
  agreementUrl: string
  dueBy: string | null
  active: boolean
  idNumber: { label: string; hint: string }
  bank: { kind: "iban" | "routing"; routingLabel?: string; routingPattern?: string; accountLabel?: string; currency: string | null; holderName: string; last4: string | null }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/*
 * A phone photo is often 4 to 8 MB and larger than Stripe's 8,000 by 8,000
 * limit. Drawn again at most 2000px on its long side as a colour JPEG, it is
 * a sharp, readable ID well inside every rule Stripe sets. A PDF is passed
 * through untouched: it is only ever a proof of address, where Stripe takes
 * one (an identity document may not be a PDF, and is refused before here).
 */
async function shrinkPhoto(file: File): Promise<Blob> {
  if (file.type === "application/pdf") return file
  if (file.size < 2_500_000 && (file.type === "image/jpeg" || file.type === "image/png")) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("unreadable"))
      i.src = url
    })
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.88, 0.78, 0.68]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q))
      if (blob && blob.size < 3_800_000) return blob
    }
    throw new Error("too large")
  } finally {
    URL.revokeObjectURL(url)
  }
}

function UploadTile({ label, hint, done, busy, onPick }: { label: string; hint?: string; done: boolean; busy: boolean; onPick: (file: File) => void }) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      disabled={busy}
      data-upload-tile=""
      className={cn(
        "flex min-h-[64px] w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 text-left outline-none transition-[border-color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15",
        done ? "border-[#abefc6] bg-[#f6fef9]" : "border-[#d5d8dd] bg-white hover:border-[#b9bdc5] hover:bg-[#fafafb]",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", done ? "bg-[#dcfae6] text-[#067647]" : "bg-[#f3f4f6] text-[#4b5563]")}>
        {busy ? <Spinner dark /> : done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Upload className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-[#1a1a2e]">{label}</span>
        <span className="block text-[12.5px] text-[#6b7280]">{busy ? "Uploading securely to Stripe" : done ? "Uploaded. Tap to replace it." : hint ?? "A clear photo or PDF"}</span>
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/*,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) onPick(f)
        }}
      />
    </button>
  )
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  return read<T>(await fetch(`/api/payments/${path}`, { method: "POST", body: form, cache: "no-store" }))
}

function useDetailsForm() {
  const [form, setForm] = React.useState<DetailsForm | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    setError(null)
    try {
      setForm(await post<DetailsForm>("details-form", {}))
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : "We could not load this step."))
    }
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])
  return { form, setForm, error, load }
}

function FormWaiting({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-[14px] text-[#6b7280]">{error}</p>
        <button type="button" className={cn(SECONDARY, "mt-4")} onClick={onRetry}>Try again</button>
      </div>
    )
  }
  return (
    <Shimmer className="flex flex-1 flex-col gap-4 px-5 sm:px-7" label="Loading">
      <ShimmerBlock className="h-4 w-40 rounded-full" />
      <ShimmerBlock className="h-11 w-full rounded-[10px] sm:h-10" />
      <ShimmerBlock className="h-4 w-32 rounded-full" />
      <ShimmerBlock className="h-11 w-full rounded-[10px] sm:h-10" />
    </Shimmer>
  )
}

/**
 * YOUR DETAILS. Storelib's own fields, only the ones Stripe lists for this
 * account in this country (lib/payments/stripe/own-form-rules needsOf), and
 * the ID photo uploaded straight to Stripe. Nothing here is kept by Storelib:
 * it goes to Stripe from the server and is never read back.
 */
function DetailsStep({
  onBack,
  onNext,
  onData,
  onEmpty,
  withBank = false,
  only,
  onAsking,
}: {
  onBack: () => void
  /** What Stripe is still asking for after this was sent, and the overview it answered with. */
  onNext: (left: DetailsForm, sent: Overview | null) => void
  onData: (next: Overview) => void
  onEmpty?: () => void
  withBank?: boolean
  /** "id" draws only the ID check, "details" everything but it. Undefined draws both. */
  only?: "id" | "details"
  /** Loaded, and Stripe is asking for something on this step today. */
  onAsking?: () => void
}) {
  const { form, setForm, error: loadError, load } = useDetailsForm()
  const [dob, setDob] = useDraft("dob")
  const [address, setAddress] = useDraft("address")
  const [phone, setPhone] = useDraft("phone")
  const [nationality, setNationality] = useDraft("nationality")
  const [idNumber, setIdNumber] = useDraft("idNumber")
  const [ssnLast4, setSsnLast4] = useDraft("ssnLast4")
  const [pep, setPep] = useDraft("pep")
  const [agree, setAgree] = useDraft("agree")
  const [uploaded, setUploaded] = React.useState<Record<string, boolean>>({})
  const [uploading, setUploading] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tried, setTried] = React.useState(false)
  const [camera, setCamera] = React.useState<{ side: IdSide } | null>(null)
  /* Stripe asked for the ID again after this page was sent. */
  const [idAgain, setIdAgain] = React.useState(false)
  /* The bank, on this page during setup. */
  const [holder, setHolder] = useDraft("holder")
  const [iban, setIban] = useDraft("iban")
  const [accountNumber, setAccountNumber] = useDraft("accountNumber")
  const [routing, setRouting] = useDraft("routing")
  /* Stripe's own live check: the way in, until Stripe says there is none for this account. */
  const [idWay, setIdWay] = React.useState<"stripe" | "camera">("stripe")
  const [idState, setIdState] = React.useState<"idle" | "opening" | "waiting" | "checking" | "done">("idle")
  const [idProblem, setIdProblem] = React.useState<string | null>(null)
  const [noBack, setNoBack] = React.useState(false)
  const [typeIdInstead, setTypeIdInstead] = React.useState(false)
  const pickFor = React.useRef<IdSide>("front")
  const picker = React.useRef<HTMLInputElement>(null)

  /* Stripe's answer, asked for until it has one. */
  const askStripe = React.useCallback(async () => {
    try {
      const r = await post<{ status: string; problem: string | null; form: DetailsForm }>("identity-status", {})
      if (r.status === "verified" || r.status === "processing") {
        setIdState(r.status === "verified" ? "done" : "checking")
        setIdProblem(null)
        setForm((f) => (f ? { ...r.form, needs: { ...r.form.needs, fields: f.needs.fields } } : r.form))
        playAskSound("done")
        return true
      }
      if (r.problem) {
        setIdProblem(r.problem)
        setIdState("idle")
        return true
      }
    } catch {
      /* Ask again on the next turn. */
    }
    return false
  }, [setForm])

  /* While Stripe's own screen is open, or its sheet is: ask again when the page comes back, and now and then. */
  React.useEffect(() => {
    if (idState !== "waiting") return
    const tick = () => void askStripe()
    /* Stripe is often done before the person is back: ask once, soon, then keep asking. */
    const first = window.setTimeout(tick, 800)
    const t = window.setInterval(tick, 2500)
    const onBack = () => document.visibilityState === "visible" && tick()
    document.addEventListener("visibilitychange", onBack)
    window.addEventListener("focus", onBack)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(t)
      document.removeEventListener("visibilitychange", onBack)
      window.removeEventListener("focus", onBack)
    }
  }, [idState, askStripe])

  /*
   * WHAT THIS STEP IS FOR. "id" draws the ID check alone, "details"
   * everything but it. Each one asks Stripe what is left when it opens, so
   * the details page sees the requirements as they are after the document
   * went in, which is how the national ID number stops being asked for.
   */
  /*
   * Stripe can turn an ID down and ask for another one after the details are
   * sent (a blurry photo, a name that does not match). That comes back on
   * this page, so the check is drawn here too rather than sending the person
   * back a step for it.
   */
  const inSection = (f: DetailField) =>
    only === "id" ? f === "document" || (f === "idNumber" && typeIdInstead) : only === "details" ? f !== "document" || idAgain : true
  /*
   * ALREADY ON FILE WHEN THIS OPENED. A document uploaded a moment ago also
   * comes back as given, and reading that live made the step hand itself on
   * the instant the front went in, before the camera could ask for the back.
   * The step decides whether to ask from what Stripe held when it opened;
   * whether the person has now satisfied it is `front`, below, which is live.
   */
  const givenAtOpen = React.useRef<boolean | null>(null)
  const docGiven = !!form?.needs.given?.includes("document")
  React.useEffect(() => {
    if (form && givenAtOpen.current === null) givenAtOpen.current = docGiven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])
  const docGivenAtOpen = givenAtOpen.current ?? docGiven
  const sectionFields = form ? form.needs.fields.filter(inSection) : []
  const bankHere = withBank && !!form && form.needs.bank
  const idAsked = !!form && form.needs.fields.includes("document") && !docGivenAtOpen

  /* Nothing left to ask here: straight on. */
  const empty = !form
    ? false
    : only === "id"
      ? !idAsked
      : sectionFields.length === 0 && !form.needs.tos && form.needs.other.length === 0 && !bankHere
  React.useEffect(() => {
    if (!form) return
    if (!empty) {
      onAsking?.()
      return
    }
    onEmpty?.()
    onNext(form, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, empty])

  if (!form) return <FormWaiting error={loadError} onRetry={load} />
  /* Nothing to ask: this step is on its way out, so it waits quietly rather than drawing fields it will never show. */
  if (empty) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <span aria-label="Loading" className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/60" />
      </div>
    )
  }

  const has = (f: DetailField) => form.needs.fields.includes(f) && inSection(f)
  const issue = (key: string, bad: boolean, text: string) => (tried && bad ? text : undefined)
  const dobBad = !dob.day || !dob.month || !/^\d{4}$/.test(dob.year)

  const upload = async (which: "document" | "proofOfAddress", side: "front" | "back", file: File) => {
    const key = `${which}-${side}`
    setUploading(key)
    setError(null)
    try {
      const blob = await shrinkPhoto(file)
      const data = new FormData()
      data.set("which", which)
      data.set("side", side)
      data.set("file", blob, blob.type === "application/pdf" ? "document.pdf" : "document.jpg")
      const res = await postForm<{ form: DetailsForm }>("document", data)
      setUploaded((u) => ({ ...u, [key]: true }))
      if (which === "document") playAskSound("done")
      setForm((f) => (f ? { ...res.form, needs: { ...res.form.needs, fields: f.needs.fields } } : res.form))
    } catch (err) {
      playAskSound("error")
      setError(safe(err instanceof Error && err.message !== "too large" && err.message !== "unreadable" ? err.message : "That photo could not be used. Try a clear colour JPG or PNG."))
    } finally {
      setUploading(null)
    }
  }

  /*
   * THE CNP, OR A PHOTO OF THE ID. Where Stripe lists the photo as an
   * alternative to the ID number (requirements.alternatives), the photo is
   * the way in and the number is an option behind a link: either one is
   * enough, and Stripe decides which it accepts.
   */
  const idVerified = idState === "done" || idState === "checking"
  const front = !!uploaded["document-front"] || idVerified || docGiven
  const idEither = form.needs.either.some((e) => e.original.includes("idNumber") && e.alternative.includes("document"))
  const docDue = has("document") && !form.needs.offered.includes("document")
  /* On the details page after the ID step was passed over for the number, the number is simply asked for. */
  /*
   * The number is asked for only where it is the answer. Where Stripe offers
   * the document instead (idEither), the ID step ahead settles it, and that
   * step is where somebody who would rather type it says so: asking on both
   * pages was asking twice for one thing.
   */
  const idShown = has("idNumber") && (!idEither || typeIdInstead || idNumber.trim().length > 0)
  const idBad = has("idNumber") && (idEither ? idNumber.trim().length > 0 && idNumber.trim().length < 4 : idNumber.trim().length < 4)
  /*
   * Only the step that draws the ID can be missing it. On the details page
   * the document is not asked for at all (the step after it settles that),
   * so demanding it there stopped Continue on a page with no way to answer.
   */
  const missingDoc = typeIdInstead || !has("document") ? false : (docDue && !front) || (idEither && !front && !idNumber.trim())
  const openCamera = (side: IdSide) => {
    armCameraSounds()
    setCamera({ side })
  }
  const asFile = (blob: Blob) => new File([blob], "id.jpg", { type: blob.type || "image/jpeg" })
  const missingProof = has("proofOfAddress") && !uploaded["proofOfAddress-front"]

  const bank = form.bank
  const holderName = holder ?? bank.holderName
  const bankBad = bankHere
    ? holderName.trim().length < 2 ||
      (bank.kind === "iban"
        ? !ibanLooksValid(iban, form.country)
        : accountNumber.replace(/[\s-]/g, "").length < 4 || (!!bank.routingPattern && !new RegExp(bank.routingPattern).test(routing.replace(/\s/g, "").toUpperCase())))
    : false
  const bankBody = () => (bank.kind === "iban" ? { holderName, iban } : { holderName, accountNumber, routingNumber: routing })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (busy) return
    /* The ID step writes nothing of its own: the document went to Stripe when it was taken. */
    if (only === "id") {
      /* Typing the number instead of showing the document: the number is this step's answer, so it is sent here. */
      if (typeIdInstead) {
        if (idNumber.trim().length < 4) {
          setError(`Enter your ${form.idNumber.label.split(" (")[0]}, or verify with your ID instead.`)
          return
        }
        setBusy(true)
        setError(null)
        try {
          const res = await post<{ form: DetailsForm; overview: Overview }>("details", { idNumber })
          onData(res.overview)
          onNext(res.form, res.overview)
        } catch (err) {
          setError(safe(err instanceof Error ? err.message : "That could not be saved. Try again."))
          setBusy(false)
        }
        return
      }
      if (idAsked && !front) {
        setError("Verify your ID to carry on.")
        return
      }
      onNext(form, null)
      return
    }
    if ((has("dob") && dobBad) || (has("address") && (!address.line1.trim() || !address.city.trim() || !address.postalCode.trim())) || (has("state") && !address.state.trim()) || (has("phone") && phone.replace(/\D/g, "").length < 7) || (has("nationality") && !countryOf(nationality)) || idBad || (has("ssnLast4") && !/^\d{4}$/.test(ssnLast4)) || (form.needs.tos && !agree) || bankBad) {
      setError("Check the fields marked in red.")
      return
    }
    if (idState === "waiting") return setError("Finish the check with Stripe first, or add a photo of your ID instead.")
    if (missingDoc) return setError(idEither ? (only === "details" ? `Enter your ${form.idNumber.label.split(" (")[0]}.` : `Take a photo of your ID, or enter your ${form.idNumber.label.split(" (")[0]} instead.`) : "Add a photo of the front of your ID.")
    if (missingProof) return setError("Add a document that shows your address.")
    setBusy(true)
    setError(null)
    try {
      /* Only the details Stripe asked for: a page that is only the bank sends only the bank. */
      const sendDetails = sectionFields.some((f) => f !== "document" && f !== "proofOfAddress") || form.needs.tos
      let latest = form
      if (!sendDetails && bankHere) {
        const paid = await post<{ form: DetailsForm; overview: Overview }>("bank", bankBody())
        onNext(paid.form, paid.overview)
        return
      }
      const res = await post<{ form: DetailsForm; overview: Overview }>("details", {
        dob: has("dob") ? { day: Number(dob.day), month: Number(dob.month), year: Number(dob.year) } : undefined,
        address: has("address") ? address : undefined,
        phone: has("phone") ? phone : undefined,
        nationality: has("nationality") ? countryOf(nationality) ?? undefined : undefined,
        idNumber: has("idNumber") && idNumber.trim() ? idNumber : undefined,
        ssnLast4: has("ssnLast4") ? ssnLast4 : undefined,
        politicalExposure: has("politicalExposure") ? (pep ? "existing" : "none") : undefined,
        acceptTos: form.needs.tos ? agree : undefined,
      })
      onData(res.overview)
      /* Stripe can ask for one more thing once it has checked these (an ID photo after an ID number it could not match). */
      const left = res.form.needs.fields.filter((f) => !((f === "document" && front) || (f === "proofOfAddress" && uploaded["proofOfAddress-front"])))
      if (left.length || res.form.needs.tos) {
        setTried(false)
        if (left.includes("document")) setIdAgain(true)
        setForm({ ...res.form, needs: { ...res.form.needs, fields: left } })
        return
      }
      latest = res.form
      let sent = res.overview
      /* Then the bank, in the same press. */
      if (bankHere) {
        const paid = await post<{ form: DetailsForm; overview: Overview }>("bank", bankBody())
        latest = paid.form
        sent = paid.overview
      }
      onNext(latest, sent)
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : "Those details were not saved. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const runIdentity = async () => {
    setIdProblem(null)
    setIdState("opening")
    try {
      const r = await post<{ ok?: boolean; reason?: string; clientSecret?: string | null; url?: string | null; publishableKey?: string }>("identity", {})
      if (!r.ok) {
        /* No Stripe check here (not switched on, an unsupported country): the camera is the way, quietly. */
        setIdWay("camera")
        setIdState("idle")
        openCamera("front")
        return
      }
      const how = await openIdentity({ clientSecret: r.clientSecret ?? null, url: r.url ?? null, publishableKey: r.publishableKey ?? "" })
      if (how === "no_way") {
        setIdWay("camera")
        setIdState("idle")
        openCamera("front")
        return
      }
      setIdState("waiting")
      /* The modal closed: Stripe usually knows at once. */
      if (how === "closed") {
        window.setTimeout(() => void askStripe(), 400)
      }
    } catch {
      setIdWay("camera")
      setIdState("idle")
      openCamera("front")
    }
  }

  /* The ID photo: the live camera first, a photo from the library as the other way. */
  const cameraPhoto = has("document") ? (
    <div className="space-y-2" data-id-photo="">
      {only === "id" ? null : <span className="block text-[13px] font-medium text-[#1a1a2e]">{idEither ? "Verify with your ID" : "Photo of your ID"}</span>}
      {!front ? (
        <>
          <button
            type="button"
            onClick={() => openCamera("front")}
            disabled={!!uploading}
            data-id-camera-open=""
            className={cn(
              "flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-4 text-left outline-none transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15",
              tried && missingDoc ? "border-[#f3b8ab] bg-[#fff8f6]" : "border-[#e3e5e8] bg-white hover:border-[#c9ccd3] hover:bg-[#fafafb]",
            )}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a1a2e] text-white">
              {uploading === "document-front" ? <Spinner /> : <Camera className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-[#1a1a2e]">{uploading === "document-front" ? "Sending to Stripe" : "Take a photo of your ID"}</span>
              <span className="mt-0.5 block text-[12.5px] leading-[17px] text-[#6b7280]">Passport, ID card or driving licence. Hold it in the frame and it takes the photo for you.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              pickFor.current = "front"
              picker.current?.click()
            }}
            className="text-[13px] font-medium text-[#4b5563] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline"
          >
            Upload a photo or scan instead
          </button>
        </>
      ) : (
        <div className="divide-y divide-[#f1f2f4] overflow-hidden rounded-2xl border border-[#e3e5e8] bg-white">
          {(["front", "back"] as const).map((side) => {
            const done = !!uploaded[`document-${side}`]
            const busy = uploading === `document-${side}`
            const skipped = side === "back" && noBack && !done
            return (
              <div key={side} className="flex items-center gap-3 px-3.5 py-3">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", done ? "bg-[#dcfae6] text-[#067647]" : "bg-[#f3f4f6] text-[#6b7280]")}>
                  {busy ? <Spinner dark /> : done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Camera className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-[#1a1a2e]">{side === "front" ? "Front" : "Back"}</span>
                  <span className="block text-[12.5px] text-[#6b7280]">{busy ? "Sending to Stripe" : done ? "Added" : skipped ? "Not needed, it's a passport" : "Needed for an ID card or licence"}</span>
                </span>
                {/*
                  One control per side, and it reads as a button: bare "Add"
                  text floating at the end of a row looked like a label, and
                  on a phone there was nothing to aim at. A bordered pill,
                  with the camera it opens.
                */}
                <button
                  type="button"
                  onClick={() => openCamera(side)}
                  disabled={busy}
                  aria-label={`${done ? "Retake the" : "Take a photo of the"} ${side} of your ID`}
                  className={cn(
                    "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium outline-none transition-[border-color,background-color,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:cursor-default disabled:opacity-50",
                    done ? "border-[#e3e5e8] bg-white text-[#4b5563] hover:border-[#c9ccd3] hover:bg-[#fafafb]" : "border-transparent bg-[#1a1a2e] text-white hover:bg-[#262640]",
                  )}
                >
                  {done ? <RotateCcw className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
                  {done ? "Retake" : "Add"}
                </button>
              </div>
            )
          })}
        </div>
      )}
      {/* Stripe takes an identity document as a colour JPG or PNG only: offering a PDF here would be offering a file it refuses. */}
      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/heic"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void upload("document", pickFor.current, f)
        }}
      />
      <IdCamera
        open={!!camera}
        side={camera?.side ?? "front"}
        zIndex={SHEET_Z + 10}
        onClose={() => setCamera(null)}
        onPickFile={() => {
          pickFor.current = camera?.side ?? "front"
          setCamera(null)
          picker.current?.click()
        }}
        onNoBack={() => {
          setNoBack(true)
          setCamera(null)
        }}
        onPhoto={(blob) => {
          const side = camera?.side ?? "front"
          void upload("document", side, asFile(blob))
          /* The front goes to Stripe while the camera turns to the back. */
          if (side === "front" && !uploaded["document-back"] && !noBack) setCamera({ side: "back" })
          else setCamera(null)
        }}
      />
    </div>
  ) : null

  /*
   * STRIPE'S OWN LIVE CHECK, the way in. Stripe's screen scans the document
   * live and matches a selfie to it, and Stripe clears the account's own
   * requirement when it is satisfied: Storelib never sees the document, the
   * selfie or the comparison. Where Stripe has no check for this account
   * (not switched on, a country it does not cover) the press falls through
   * to Storelib's camera without saying anything clever about it.
   */
  const idPhoto = has("document")
    ? idWay === "camera"
      ? cameraPhoto
      : (
          <div className="space-y-2" data-id-photo="stripe">
            {only === "id" ? null : <span className="block text-[13px] font-medium text-[#1a1a2e]">{idEither ? "Verify with your ID" : "Verify who you are"}</span>}
            {idVerified ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[#abefc6] bg-[#f6fef9] px-4 py-3.5" data-identity="done">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dcfae6] text-[#067647]">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-[#1a1a2e]">{idState === "done" ? "Verified by Stripe" : "Stripe is checking it"}</span>
                  <span className="block text-[12.5px] text-[#6b7280]">{idState === "done" ? "Your ID and selfie matched." : "This usually takes under a minute."}</span>
                </span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void runIdentity()}
                  disabled={idState === "opening" || idState === "waiting"}
                  data-identity-open=""
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-4 text-left outline-none transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:cursor-default",
                    tried && missingDoc ? "border-[#f3b8ab] bg-[#fff8f6]" : "border-[#e3e5e8] bg-white hover:border-[#c9ccd3] hover:bg-[#fafafb]",
                  )}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a1a2e] text-white">
                    {idState === "opening" || idState === "waiting" ? <Spinner /> : <ScanFace className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-[#1a1a2e]">
                      {idState === "waiting" ? "Waiting for Stripe" : idState === "opening" ? "Opening Stripe" : "Verify with Stripe"}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-[17px] text-[#6b7280]">
                      {idState === "waiting"
                        ? "Finish the check with Stripe, then come back here."
                        : form.needs.offered.includes("document")
                          ? "Stripe scans your ID and matches a selfie to it. A minute now, and your payouts never pause for it later."
                          : "Stripe scans your ID and matches a selfie to it. About a minute, and Storelib never sees either."}
                    </span>
                  </span>
                </button>
                {idProblem ? (
                  <p role="status" className="rounded-xl border border-[#fedf89] bg-[#fffcf5] px-3.5 py-2.5 text-[13px] leading-[19px] text-[#93370d]" data-identity-problem="">
                    {idProblem}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setIdWay("camera")
                    openCamera("front")
                  }}
                  className="text-[13px] font-medium text-[#4b5563] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline"
                >
                  Add a photo of your ID instead
                </button>
              </>
            )}
          </div>
        )
    : null

  return (
    <form onSubmit={submit} onInput={() => error && setError(null)} noValidate className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 space-y-5 px-5 sm:px-7">
        {form.active ? (
          <StepIntro
            title="Stripe needs a little more"
            line={`To keep your payouts going, Stripe asks for this now${form.dueBy ? `, by ${new Date(form.dueBy).toLocaleDateString(undefined, { day: "numeric", month: "long" })}` : ""}. It takes a minute.`}
          />
        ) : only === "id" ? (
          <StepIntro title="Verify your ID" line="Stripe checks your ID to confirm you are who you say you are. It goes straight to Stripe, and Storelib never sees or keeps the document." />
        ) : (
          <StepIntro title="Your details" line="Only what Stripe needs to verify you in your country. It goes straight to Stripe and Storelib never keeps it." />
        )}
        {form.needs.problems.length ? (
          <div role="status" className="space-y-1 rounded-xl border border-[#fedf89] bg-[#fffcf5] px-3.5 py-3 text-[13px] leading-[19px] text-[#93370d]" data-setup-problems="">
            {form.needs.problems.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        ) : null}
        <ErrorLine message={error} />

        {has("dob") ? (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">Date of birth</span>
            <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
              <input className={cn(FIELD, tried && !dob.day && FIELD_BAD)} inputMode="numeric" placeholder="Day" maxLength={2} autoComplete="bday-day" aria-label="Day" value={dob.day} onChange={(e) => setDob({ ...dob, day: e.target.value.replace(/\D/g, "") })} />
              <span className="relative block">
                <select className={cn(FIELD, "cursor-pointer appearance-none pr-8", !dob.month && "text-[#9ca3af]", tried && !dob.month && FIELD_BAD)} aria-label="Month" autoComplete="bday-month" value={dob.month} onChange={(e) => setDob({ ...dob, month: e.target.value })}>
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1)}>{m}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              </span>
              <input className={cn(FIELD, tried && !/^\d{4}$/.test(dob.year) && FIELD_BAD)} inputMode="numeric" placeholder="Year" maxLength={4} autoComplete="bday-year" aria-label="Year" value={dob.year} onChange={(e) => setDob({ ...dob, year: e.target.value.replace(/\D/g, "") })} />
            </div>
            <span className="mt-1.5 block text-[12px] text-[#6b7280]">You need to be 18 or older to be paid out.</span>
          </div>
        ) : null}

        {has("address") ? (
          <div className="space-y-3">
            <span className="block text-[13px] font-medium text-[#1a1a2e]">Home address</span>
            <input className={cn(FIELD, tried && !address.line1.trim() && FIELD_BAD)} placeholder="Street and number" autoComplete="address-line1" aria-label="Street and number" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />
            <input className={FIELD} placeholder="Apartment, floor (optional)" autoComplete="address-line2" aria-label="Apartment or floor" value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} />
            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <input className={cn(FIELD, tried && !address.city.trim() && FIELD_BAD)} placeholder="City" autoComplete="address-level2" aria-label="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
              <input className={cn(FIELD, tried && !address.postalCode.trim() && FIELD_BAD)} placeholder="Postal code" autoComplete="postal-code" aria-label="Postal code" value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} />
            </div>
            {has("state") ? (
              <input className={cn(FIELD, tried && !address.state.trim() && FIELD_BAD)} placeholder="State, county or region" autoComplete="address-level1" aria-label="State, county or region" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} />
            ) : null}
            <span className="block text-[12px] text-[#6b7280]">Where you live. A PO box or military address cannot be verified.</span>
          </div>
        ) : null}

        {has("phone") ? (
          <Field label="Phone number" error={issue("phone", phone.replace(/\D/g, "").length < 7, "Enter your phone number, with the country code.")}>
            <input className={FIELD} type="tel" inputMode="tel" placeholder="+40 712 345 678" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        ) : null}

        {has("nationality") ? (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">Nationality</span>
            <CountryPicker value={nationality} onChange={setNationality} sheetZIndex={SHEET_Z} fieldClassName="rounded-[10px] border-[#e3e5e8] text-[16px] shadow-none sm:h-10 sm:rounded-lg sm:text-[14px]" />
            {tried && !countryOf(nationality) ? <span className="mt-1.5 block text-[12px] text-[#c4290c]">Choose your nationality.</span> : null}
          </div>
        ) : null}

        {idEither ? idPhoto : null}

        {idShown ? (
          <Field
            label={form.idNumber.label}
            hint={
              idEither
                ? `Not needed if you add a photo of your ID. ${form.idNumber.hint}`
                : front
                  ? `Your ID photo is in, but Stripe still asks for this number in ${countryLabel(form.country) ?? "your country"}. ${form.idNumber.hint}`
                  : form.idNumber.hint
            }
            error={issue("idNumber", idBad, "Enter your ID number exactly as on your document.")}
          >
            <input className={FIELD} inputMode={form.country === "US" || form.country === "RO" ? "numeric" : undefined} autoComplete="off" spellCheck={false} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          </Field>
        ) : has("idNumber") && idEither && !front ? (
          <button type="button" onClick={() => setTypeIdInstead(true)} className="-mt-2 text-left text-[13px] font-medium text-[#4b5563] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline">
            Rather type your {form.idNumber.label.split(" (")[0]} instead?
          </button>
        ) : null}

        {has("ssnLast4") ? (
          <Field label="Last 4 digits of your SSN" error={issue("ssnLast4", !/^\d{4}$/.test(ssnLast4), "Enter the last four digits of your SSN.")}>
            <input className={FIELD} inputMode="numeric" maxLength={4} autoComplete="off" value={ssnLast4} onChange={(e) => setSsnLast4(e.target.value.replace(/\D/g, ""))} />
          </Field>
        ) : null}

        {!idEither ? idPhoto : null}

        {only === "id" && idEither && !front && !typeIdInstead ? (
          <button type="button" onClick={() => setTypeIdInstead(true)} className="-mt-1 text-left text-[13px] font-medium text-[#4b5563] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline" data-id-number-instead="">
            Use my {form.idNumber.label.split(" (")[0]} instead
          </button>
        ) : null}

        {has("proofOfAddress") ? (
          <div className="space-y-2">
            <span className="block text-[13px] font-medium text-[#1a1a2e]">Proof of address</span>
            <span className="block text-[12px] leading-[18px] text-[#6b7280]">
              Stripe asks for this only when it cannot confirm your address from your ID, and it never asks for it to set payments up. A utility bill, bank statement or rental agreement from the last three months, with your name and this address.
            </span>
            <UploadTile label="Document" done={!!uploaded["proofOfAddress-front"]} busy={uploading === "proofOfAddress-front"} onPick={(f) => void upload("proofOfAddress", "front", f)} />
          </div>
        ) : null}

        {has("politicalExposure") ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#eceef1] px-3.5 py-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#1a1a2e]" checked={pep} onChange={(e) => setPep(e.target.checked)} />
            <span className="text-[13px] leading-[19px] text-[#4b5563]">I hold, or have held in the last year, a prominent public role (a politically exposed person). Leave it unticked if not.</span>
          </label>
        ) : null}

        {bankHere ? (
          <div className="space-y-4 border-t border-[#f1f2f4] pt-5" data-details-bank="">
            <div>
              <span className="block text-[15px] font-semibold text-[#1a1a2e]">Where should we send your money?</span>
              <span className="mt-0.5 block text-[12.5px] text-[#6b7280]">{bank.currency ? `Payouts arrive in ${bank.currency}.` : "The account your payouts go to."}</span>
            </div>
            <Field label="Account holder name" error={tried && holderName.trim().length < 2 ? "Enter the name on the account." : undefined}>
              <input className={FIELD} autoComplete="name" value={holderName} onChange={(e) => setHolder(e.target.value)} />
            </Field>
            {bank.kind === "iban" ? (
              <Field label="IBAN" error={tried && !ibanLooksValid(iban, form.country) ? "That IBAN does not look right. Check it in your bank app." : undefined}>
                <input className={cn(FIELD, "font-mono tracking-[0.02em]")} autoComplete="off" spellCheck={false} autoCapitalize="characters" placeholder={`${form.country}00 0000 0000 0000 0000`} value={iban} onChange={(e) => setIban(formatIban(e.target.value))} />
              </Field>
            ) : (
              <>
                <Field label={bank.routingLabel ?? "Bank code"} error={tried && !!bank.routingPattern && !new RegExp(bank.routingPattern).test(routing.replace(/\s/g, "").toUpperCase()) ? `Check your ${(bank.routingLabel ?? "bank code").toLowerCase()}.` : undefined}>
                  <input className={FIELD} autoComplete="off" spellCheck={false} inputMode={form.country === "IN" ? undefined : "numeric"} value={routing} onChange={(e) => setRouting(e.target.value)} />
                </Field>
                <Field label={bank.accountLabel ?? "Account number"} error={tried && accountNumber.replace(/[\s-]/g, "").length < 4 ? "Enter your account number." : undefined}>
                  <input className={FIELD} autoComplete="off" spellCheck={false} inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
                </Field>
              </>
            )}
          </div>
        ) : null}

        {form.needs.tos && only !== "id" ? (
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3", tried && !agree ? "border-[#f3b8ab] bg-[#fff8f6]" : "border-[#eceef1]")}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#1a1a2e]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="text-[13px] leading-[19px] text-[#4b5563]">
              I agree to Storelib's{" "}
              <a href="/terms" onClick={(e) => (e.preventDefault(), openInApp(`${window.location.origin}/terms`))} className="font-medium text-[#1a1a2e] underline underline-offset-2">Terms</a>{" "}
              and the{" "}
              <a href={form.agreementUrl} onClick={(e) => (e.preventDefault(), openInApp(form.agreementUrl))} className="font-medium text-[#1a1a2e] underline underline-offset-2">Stripe Connected Account Agreement</a>, and confirm these details are true.
            </span>
          </label>
        ) : null}

        {form.needs.other.length ? (
          <p className="rounded-xl border border-[#eceef1] bg-[#f9fafb] px-3.5 py-3 text-[13px] leading-[19px] text-[#4b5563]">
            Stripe also needs something this form does not cover yet. Email{" "}
            <a href="mailto:support@storelib.com" className="font-medium text-[#1a1a2e] underline underline-offset-2">support@storelib.com</a> and we will sort it out with you.
          </p>
        ) : null}

      </div>

      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>Back</button>
        <button type="submit" className={PRIMARY} disabled={busy || !!uploading}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving" : "Continue"}
        </button>
      </Footer>
    </form>
  )
}

/* ── a business: Stripe's own embedded form, inside Storelib ──────────── */

/**
 * A BUSINESS IS ASKED FOR WHAT STRIPE NEEDS TODAY, IN STRIPE'S EMBEDDED FORM.
 * A company has things an individual never does (its registration number,
 * the people who own and run it, a representative), and they differ by
 * country. Storelib's own form is written for an individual; rather than ask
 * a business to email support, its details are collected by Stripe's embedded
 * onboarding drawn inside this page (an Account Session made on the server for
 * the signed in seller only), set to what is due now and nothing Stripe may
 * want later (StripeConnectEmbedded's default: currently_due, future omitted).
 * The bank is collected in the same form. No Stripe login, no new tab.
 */
function BusinessDetailsStep({ onBack, onDone }: { onBack: () => void; onDone: (sent: Overview) => void }) {
  const [busy, setBusy] = React.useState(false)
  const finish = async () => {
    if (busy) return
    setBusy(true)
    try {
      onDone(await post<Overview>("refresh", {}))
    } catch {
      setBusy(false)
    }
  }
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 px-5 sm:px-7">
        <StepIntro title="Business details" line="Only what's needed to verify your business today." />
        <StripeConnectEmbedded purpose="stripe_onboarding" onExit={finish} className="min-h-[320px]" />
      </div>
      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>Back</button>
        <button type="button" className={PRIMARY} onClick={() => void finish()} disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Checking" : "Done"}
        </button>
      </Footer>
    </div>
  )
}

/* ── step 3: bank ──────────────────────────────────────────────────────── */

/**
 * THE BANK, IN THE COUNTRY'S OWN FORMAT: an IBAN where the country uses one
 * (checked with its own mod 97 before it leaves the page), account and
 * routing number where it does not. It becomes the payout account for the
 * account's currency; the old one, if any, stops being used.
 */
function BankForm({ failed = false, onBack, backLabel = "Back", onDone, onData }: { failed?: boolean; onBack: () => void; backLabel?: string; onDone: () => void; onData: (next: Overview) => void }) {
  const { form, error: loadError, load } = useDetailsForm()
  const [holder, setHolder] = React.useState<string | null>(null)
  const [iban, setIban] = React.useState("")
  const [accountNumber, setAccountNumber] = React.useState("")
  const [routing, setRouting] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tried, setTried] = React.useState(false)

  if (!form) return <FormWaiting error={loadError} onRetry={load} />
  const bank = form.bank
  /* What Stripe has right now, not what the page was opened with: during setup that said "Change bank account" to somebody adding their first. */
  const title = failed ? "Your payout account needs attention" : bank.last4 ? "Change bank account" : "Add your bank account"
  const line = failed ? "A payout didn't go through. Add the account you want paid into." : bank.last4 ? "The new account is used for your next payout." : "Where your payouts are sent."
  const name = holder ?? bank.holderName
  const ibanOk = ibanLooksValid(iban, form.country)
  const routingOk = !bank.routingPattern || new RegExp(bank.routingPattern).test(routing.replace(/\s/g, "").toUpperCase())

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (busy) return
    if (name.trim().length < 2 || (bank.kind === "iban" ? !ibanOk : accountNumber.replace(/[\s-]/g, "").length < 4 || !routingOk)) {
      setError("Check the fields marked in red.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await post<{ form: DetailsForm; overview: Overview }>("bank", bank.kind === "iban" ? { holderName: name, iban } : { holderName: name, accountNumber, routingNumber: routing })
      onData(res.overview)
      onDone()
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : "That bank account was not saved. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} onInput={() => error && setError(null)} noValidate className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 space-y-5 px-5 sm:px-7">
        <StepIntro title={title} line={line} />
        <ErrorLine message={error} />
        {bank.last4 ? (
          <div className="flex items-center gap-3 rounded-xl border border-[#eceef1] px-3.5 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#4b5563]"><Landmark className="h-4 w-4" /></span>
            <span className="text-[13.5px] text-[#4b5563]">Current account ending in <span className="font-medium tabular-nums text-[#1a1a2e]">{bank.last4}</span></span>
          </div>
        ) : null}
        <Field label="Account holder name" hint="Your name, as your bank has it." error={tried && name.trim().length < 2 ? "Enter the name on the account." : undefined}>
          <input className={FIELD} autoComplete="name" value={name} onChange={(e) => setHolder(e.target.value)} />
        </Field>
        {bank.kind === "iban" ? (
          <Field label="IBAN" hint={bank.currency ? `Payouts arrive in ${bank.currency}.` : undefined} error={tried && !ibanOk ? "That IBAN does not look right. Check it in your bank app." : undefined}>
            <input className={cn(FIELD, "font-mono tracking-[0.02em]")} autoComplete="off" spellCheck={false} autoCapitalize="characters" placeholder={`${form.country}00 0000 0000 0000 0000`} value={iban} onChange={(e) => setIban(formatIban(e.target.value))} />
          </Field>
        ) : (
          <>
            <Field label={bank.routingLabel ?? "Bank code"} error={tried && !routingOk ? `Check your ${(bank.routingLabel ?? "bank code").toLowerCase()}.` : undefined}>
              <input className={FIELD} autoComplete="off" spellCheck={false} inputMode={form.country === "IN" ? undefined : "numeric"} value={routing} onChange={(e) => setRouting(e.target.value)} />
            </Field>
            <Field label={bank.accountLabel ?? "Account number"} hint={bank.currency ? `Payouts arrive in ${bank.currency}.` : undefined} error={tried && accountNumber.replace(/[\s-]/g, "").length < 4 ? "Enter your account number." : undefined}>
              <input className={FIELD} autoComplete="off" spellCheck={false} inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>{backLabel}</button>
        <button type="submit" className={PRIMARY} disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving" : bank.last4 ? "Save account" : "Add account"}
        </button>
      </Footer>
    </form>
  )
}

/** Groups of four, as a bank prints it. */
function formatIban(v: string): string {
  return v.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 34).replace(/(.{4})/g, "$1 ").trim()
}

/** The IBAN's own check (mod 97), so a typo is caught on the page. */
function ibanLooksValid(input: string, country: string): boolean {
  const iban = input.replace(/\s/g, "").toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) || (country && iban.slice(0, 2) !== country)) return false
  let rest = 0
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of v) rest = (rest * 10 + Number(d)) % 97
  }
  return rest === 1
}

/* ── when the form is sent ─────────────────────────────────────────────── */

function Outcome({ outcome, onContinue, onDone }: { outcome: Outcome; onContinue: () => void; onDone: () => void }) {
  const copy =
    outcome === "done"
      ? { icon: <Check className="h-5 w-5" strokeWidth={3} />, tone: "bg-[#ecfdf3] text-[#067647]", title: "Payments active", line: "You're ready to accept payments. Your sales are paid into your balance and you cash out to your bank.", action: "Done", primary: onDone }
      : outcome === "checking"
        ? {
            icon: <Clock className="h-5 w-5" />,
            tone: "bg-[#f4f3ff] text-[#5b4bd5]",
            title: "We're verifying your details",
            line: "This usually takes a few minutes and sometimes up to two business days. We'll email you the moment payments are on.",
            action: "Done",
            primary: onDone,
          }
        : {
            icon: <Clock className="h-5 w-5" />,
            tone: "bg-[#fffaeb] text-[#b54708]",
            title: "Verification isn't finished",
            line: "Payments turn on once Stripe has verified your identity. It saved what you entered, so you pick up where you left off.",
            action: "Continue verification",
            primary: onContinue,
          }
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <span className={cn("flex h-12 w-12 items-center justify-center rounded-full animate-in zoom-in-75 fade-in-0 duration-300", copy.tone)}>{copy.icon}</span>
        <h3 className="mt-4 text-[17px] font-semibold text-[#1a1a2e]">{copy.title}</h3>
        <p className="mx-auto mt-1.5 max-w-[380px] text-[14px] leading-5 text-[#6b7280]">{copy.line}</p>
      </div>
      <Footer>
        <span />
        <button type="button" className={PRIMARY} onClick={copy.primary}>{copy.action}</button>
      </Footer>
    </>
  )
}

