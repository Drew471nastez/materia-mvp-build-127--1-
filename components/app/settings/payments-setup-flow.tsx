"use client"

/**
 * STORELIB PAYMENTS SETUP. One calm page over the app, on every screen size,
 * with three steps:
 *
 *   Account  country and legal name as on the ID (Storelib's form); no business question
 *   Verify   a photo of the ID, taken here. A phone opens the camera. A
 *            computer shows a code to scan with the phone. The photo goes
 *            to Stripe and the page is never left.
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
 * The same three steps run on a phone and in the iOS and Android apps. The
 * ID photo is the camera on this page, never a page on Stripe's site.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Camera, Check, ChevronDown, ChevronLeft, Clock, Info, Landmark, Lock, RotateCcw, Smartphone, X } from "lucide-react"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { Shimmer, ShimmerBlock } from "@/components/ui/shimmer"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CountryPicker, CountryFlag } from "@/components/app/settings/country-picker"
import { PhoneField } from "@/components/app/settings/phone-field"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { countryLabel, countryOf } from "@/lib/account/country"
import { personalIssues } from "@/lib/payments/stripe/onboarding-steps"
import { setupStepOf, type StorelibPaymentsStatus } from "@/lib/payments/stripe/status"
import type { Overview } from "@/components/app/settings/payments-hub-shared"
import { isNativeApp, openInApp } from "@/lib/native-bridge"
import { armCameraSounds, IdCamera, sendIdPhoto, shrinkPhoto, type IdSide } from "@/components/app/settings/id-camera"
import { StripeConnectEmbedded } from "@/components/app/settings/stripe-connect-embedded"
import { readsLikeStripe, verifyLine } from "@/lib/payments/verify-id"
import { playAskSound } from "@/lib/website-builder/ask-sounds"
import { cn } from "@/lib/utils"

export type SetupMode = "setup" | "bank" | "details"
type Step = 0 | 1 | 2 | 3

/* Where setup opens: the account step, the bank when the bank is all that is left, otherwise the details (which hand on by themselves when empty). */
function firstStep(status: StorelibPaymentsStatus): Step {
  const s = setupStepOf(status)
  return s === 0 ? 0 : s === 2 ? 3 : 1
}

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

/*
 * NOTHING OF STRIPE'S OWN WIRE REACHES A CREATOR. One rule for the whole
 * flow, kept beside the step's own words (lib/payments/verify-id.ts
 * readsLikeStripe), because the sentence a creator was reading on step two
 * came from a server that had passed Stripe's text straight through.
 */
function safe(message: string): string {
  if (!message.trim() || readsLikeStripe(message)) return "Something went wrong. Try again in a moment."
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
 * WHERE THE ID PHOTO IS TAKEN. A phone, the iOS app and the Android app open
 * the camera here. A computer shows a code the phone scans, because a laptop
 * camera is the wrong tool and the creator should not be sent out to Stripe.
 * Width alone is not enough: a phone turned sideways is wider than 640px.
 */
function idOnThisDevice(): "phone" | "desk" {
  if (typeof window === "undefined") return "desk"
  if (isNativeApp()) return "phone"
  const ua = navigator.userAgent || ""
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return "phone"
  const touch = navigator.maxTouchPoints ?? 0
  if (/Macintosh/i.test(ua) && touch > 1) return "phone"
  if (window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 1024px)").matches) return "phone"
  return "desk"
}

/** The code a computer shows so the creator can finish the ID photo on their phone. */
function IdHandoffQr({ url }: { url: string }) {
  const [src, setSrc] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!url) return
    let gone = false
    void import("qrcode").then((lib) =>
      lib
        .toDataURL(url, { width: 360, margin: 1, color: { dark: "#1a1a2e", light: "#ffffff" }, errorCorrectionLevel: "M" })
        .then((data) => {
          if (!gone) setSrc(data)
        })
        .catch(() => undefined),
    )
    return () => {
      gone = true
    }
  }, [url])
  return (
    <div className="flex h-[180px] w-[180px] items-center justify-center rounded-2xl border border-[#eceef1] bg-white p-2" data-id-phone-qr="">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Scan with your phone to verify your ID" className="h-full w-full" />
      ) : (
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/50" />
      )}
    </div>
  )
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
/*
 * LIKE SKOOL: PERSONAL INFO, VERIFY ID, BANK ACCOUNT. The owner, October
 * 2026: "personal info, verification, KYC ID only, back and forth with the
 * camera, and bank account, select payout method, local currency, EUR or
 * USD, then the bank account number, and that's all". Personal info is two
 * screens underneath (the country and name make the account, then the few
 * details Stripe wants), shown as one step.
 */
const STEP_LABELS = ["Personal info", "Verify ID", "Bank account"] as const
/*
 * THE ID CHECK IS ONLY A STEP WHEN STRIPE WANTS IT. A seller Stripe does not
 * need an ID from right now never sees it in the steps at all: the stepper is
 * Account, Details until the ID step has loaded and found Stripe is asking.
 */
const STEP_LABELS_NO_ID = ["Personal info", "Bank account"] as const

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
  const [step, setStep] = React.useState<Step>(() => firstStep(status))
  const [back, setBack] = React.useState(false)
  const [openCount, setOpenCount] = React.useState(0)
  const [ending, setEnding] = React.useState<Outcome | null>(null)
  /*
   * A STEP WITH NOTHING TO ASK IS NOT A STEP TO WALK BACK INTO. It sends
   * itself on the moment it loads, so Back from the step after it landed
   * there and was sent forward again: the way back was a wall, and pressing
   * it looked like Continue. Once it has said it is empty, Back goes past it.
   */
  /* Stripe wants an ID: the overview says so from the start, and the ID step confirms it when it loads. */
  const [idNeeded, setIdNeeded] = React.useState(!!data.idAhead)
  /* Which screen the "checking" outcome is about: the ID that just went in, or the details. */
  const [checkingWhat, setCheckingWhat] = React.useState<"id" | "details">("details")
  /* An ID went to Stripe in this setup: the bank is the last step now, so the end screen comes after it and has to remember. */
  const idSent = React.useRef(false)
  /* The details step was walked past with nothing to ask, so Back skips it too. */
  const [detailsEmpty, setDetailsEmpty] = React.useState(false)
  /* The same for the ID step: Stripe needed no ID, so Back from the bank goes past it. */
  const [idEmpty, setIdEmpty] = React.useState(false)

  /*
   * The draft goes when setup closes, not only when it opens. Clearing on
   * open alone left a date of birth, an address and a whole IBAN sitting in
   * memory for the life of the tab, and relied on this component never
   * unmounting to stop a later open reading them back before the clear ran.
   */
  React.useEffect(() => {
    if (open) return
    clearDetailsDraft()
  }, [open])

  React.useEffect(() => {
    if (!open) return
    setBack(false)
    setEnding(null)
    setIdNeeded(!!data.idAhead)
    setDetailsEmpty(false)
    setIdEmpty(false)
    idSent.current = false
    /* A fresh open starts from Stripe's answer, not from what was typed last time. */
    clearDetailsDraft()
    /* The phone scanned the code on the ID step: open that step, not the one before it. */
    const params = new URLSearchParams(window.location.search)
    const toId = params.get("id") === "1"
    if (toId) {
      params.delete("id")
      const next = params.toString()
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`)
    }
    setStep(toId && mode === "setup" ? 2 : firstStep(status))
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
   * IT ALSO DECIDES WHERE SOMEBODY GOES NEXT, and that is the part that has
   * to be exactly right, because every way of getting it wrong is a wall:
   *
   *   IT SENDS THEM TO THE STEP THAT CAN ASK. It used to send a seller who
   *   still owed a bank to step 2, which was the bank before the reorder and
   *   is the ID check now. In setup there is no bank step at all any more
   *   (the bank lives on the details page), so that was Continue on the last
   *   step doing nothing at all, for good. Where something is still owed,
   *   the step that draws it is worked out from what is left.
   *
   *   IT NEVER SENDS THEM SOMEWHERE THEY ALREADY ARE. A step that has
   *   nothing to draw hands itself straight on, so "stay on the form" by
   *   remounting it was a loop: empty, settle, remount, empty, for as long
   *   as the tab was open, firing a request every round. If the step that
   *   should ask is the one that just said it had nothing, the form and
   *   Stripe disagree and there is nothing to draw: that is the outcome
   *   screen's job, not another lap.
   *
   * The "Checking your ID" screen comes from here too, and only when there
   * is genuinely nothing left to do. Stripe parks things in
   * pending_verification for a few seconds after almost any write, so a
   * status read in that window said so while the person still had fields in
   * front of them.
   */
  const settle = async (sent: Overview, left: DetailsForm | null) => {
    onData(sent)
    if (left?.needs.given?.includes("document") && step === 2) idSent.current = true
    const outcome = outcomeOf(statusOf(sent))

    /* The step that can ask for what is left, or null when this form cannot ask for it. */
    const stepFor = (form: DetailsForm | null): Step | null => {
      if (!form) return null
      const needs = form.needs
      const detailsLeft = needs.fields.some((f) => f !== "document" && f !== "proofOfAddress") || needs.tos
      if (detailsLeft) return 1
      const idLeft = (needs.fields.includes("document") && !needs.given?.includes("document")) || (needs.fields.includes("proofOfAddress") && !needs.given?.includes("proofOfAddress"))
      if (idLeft) return 2
      if (needs.bank) return 3
      return null
    }

    if (mode === "setup") {
      const target = stepFor(left)
      /* Somewhere else to be: go there. Already there: the step said it was empty, so asking again is a loop. */
      if (target !== null && target !== step) {
        go(target)
        return
      }
      if (target === null && outcome === "bank" && step !== 3) {
        /* Stripe wants a bank and the form did not know yet: the bank step asks. */
        go(3)
        return
      }
    }

    if (outcome === "done" || outcome === "checking") onFinished()
    /* "Checking your ID" only when an ID really went in. The ID step running past itself (Stripe already held one) is not one. */
    setCheckingWhat(idSent.current ? "id" : "details")
    setEnding(outcome)
  }

  const finish = () => {
    onFinished()
    onClose()
  }

  const title = mode === "bank" ? (data.payoutDestination ? "Payout account" : "Add bank account") : mode === "details" ? "Account details" : "Set up payouts"
  /* Back walks past a step that had nothing to ask, so it never lands somewhere that sends it forward again. */
  const stepBefore = (from: Step): Step => (from === 3 ? (idEmpty ? (detailsEmpty ? 0 : 1) : 2) : from === 2 ? (detailsEmpty ? 0 : 1) : 0)
  const onBack = mode === "setup" || !!ending || step === 0 ? onClose : () => go(stepBefore(step))
  const slide = back ? "slide-in-from-left-4" : "slide-in-from-right-4"
  /* The ID step is only a step once Stripe has asked for a document. */
  const labels = idNeeded ? STEP_LABELS : STEP_LABELS_NO_ID
  const last = labels.length - 1
  /* Stripe draws its own steps inside the form. Ours only marks the result. */
  const shownStep = ending ? last : 0

  let body: React.ReactNode
  if (ending) {
    body = (
      <Outcome
        outcome={ending}
        what={checkingWhat}
        onContinue={() => {
          const was = ending
          setEnding(null)
          if (mode === "setup" && was === "bank") go(3)
          setOpenCount((k) => k + 1)
        }}
        onDone={finish}
        onChecked={(next) => {
          /* Stripe answered while the screen was open: it becomes whatever is true now. */
          onData(next)
          const now = outcomeOf(statusOf(next))
          if (now === "done") onFinished()
          if (now === "checking") return
          /*
           * Stripe wants something after all. In setup that is the next
           * step's to ask, not a "Verification isn't finished" screen with a
           * button that only led back to the same form. The details step
           * draws what is left, or hands straight on to the ID check.
           */
          if (mode === "setup" && now === "more") {
            setEnding(null)
            go(1)
            setOpenCount((k) => k + 1)
            return
          }
          setEnding(now)
        }}
      />
    )
  } else if (mode === "bank") {
    const failed = data.paymentsStatus?.status === "PAYOUT_FAILED"
    body = <BankForm key={`bank-step-${openCount}`} failed={failed} onBack={onClose} backLabel="Cancel" onDone={(sent) => void settle(sent, null)} onData={onData} />
  } else if (mode === "details") {
    body = <DetailsStep key={`details-step-${openCount}`} withBank onBack={onClose} onNext={(left, sent) => void settle(sent ?? data, left)} onData={onData} />
  } else {
    body = (
      <SetupEmbed
        key={`id-${openCount}`}
        data={data}
        onData={onData}
        onExit={async (fromStripe) => {
          const next = await post<Overview>("refresh")
          const form = await post<DetailsForm>("details-form", {}).catch(() => null)
          onData(next)
          if (form?.needs.given?.includes("document")) idSent.current = true
          setCheckingWhat(idSent.current ? "id" : "details")
          const outcome = outcomeOf(statusOf(next))
          if (outcome === "done" || outcome === "checking") onFinished()
          if (outcome === "more") {
            if (fromStripe) setOpenCount((k) => k + 1)
            return
          }
          setEnding(outcome)
        }}
      />
    )
  }

  const subtitle =
    mode === "setup"
      ? idNeeded
        ? "Your personal info, a quick ID check with Stripe, then your bank. About five minutes."
        : "Your personal info, then your bank. About five minutes."
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
                aria-label={mode === "setup" || !!ending || step === 0 ? "Close" : "Back"}
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
            mode === "setup" && ending ? (
              <div className="px-5 pt-4">
                <Stepper step={shownStep} labels={labels} done={ending === "done" || ending === "checking"} />
              </div>
            ) : null
          ) : (
            <div className="mb-6 px-1">
              <h2 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-[#1a1a2e]">{title}</h2>
              <p className="mt-1 text-[14px] leading-5 text-[#6b7280]">{subtitle}</p>
              {mode === "setup" && ending ? (
                <div className="mt-5">
                  <Stepper step={shownStep} labels={labels} done={ending === "done" || ending === "checking"} />
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
/*
 * THE WHOLE SETUP, INSIDE THIS PAGE. Stripe's own steps, in Storelib's
 * frame. We do not collect the fields and send them on. Two of Stripe's
 * steps are left out: what kind of seller you are (a person, a business, or
 * a non-profit) and the live selfie. An extra address document is left out
 * too. The account is opened as a person before the form is drawn, which is
 * what skips that first question.
 */
const SETUP_COLLECTION = {
  fields: "eventually_due" as const,
  futureRequirements: "omit" as const,
  requirements: {
    exclude: [
      "business_type",
      "individual.verification.proof_of_liveness",
      "individual.verification.additional_document",
      "documents.bank_account_ownership_verification",
    ],
  },
}

function SetupEmbed({ data, onData, onExit }: { data: Overview; onData: (next: Overview) => void; onExit: (fromStripe: boolean) => void | Promise<void> }) {
  const existed = React.useRef((data.beat ?? "personal") !== "personal")
  const [ready, setReady] = React.useState(existed.current)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    if (existed.current) return
    let gone = false
    void (async () => {
      try {
        const next = await post<Overview>("start", {
          agree: true,
          kind: "individual",
          country: data.prefill?.country || data.payoutHint?.country || "",
        })
        if (gone) return
        onData(next)
        setReady(true)
      } catch (err) {
        if (!gone) setError(safe(err instanceof Error ? err.message : "We could not start setup just now."))
      }
    })()
    return () => {
      gone = true
    }
    // The account is opened once, from the profile already on file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-[14px] text-[#6b7280]">{error}</p>
        <button type="button" className={cn(SECONDARY, "mt-4")} onClick={() => { setError(null); setAttempt((n) => n + 1) }}>Try again</button>
      </div>
    )
  }
  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <span aria-label="Loading" className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/60" />
      </div>
    )
  }
  return (
    <div className="flex min-h-full flex-1 flex-col" data-id-embed="">
      <div className="flex-1 px-5 sm:px-7">
        <StripeConnectEmbedded
          purpose={existed.current ? "stripe_management" : "stripe_onboarding"}
          collection={SETUP_COLLECTION}
          onExit={() => void onExit(true)}
        />
      </div>
      <Footer>
        <button type="button" className={PRIMARY} onClick={() => void onExit(false)}>
          Continue
        </button>
      </Footer>
    </div>
  )
}

/* ── step 1: account ───────────────────────────────────────────────────── */

function AccountStep({ data, onBack, onDone }: { data: Overview; onBack: () => void; onDone: (next: Overview) => void }) {
  const hasAccount = (data.beat ?? "personal") !== "personal"
  /*
   * NO "HOW ARE YOU SELLING?". Like Gumroad and Skool, everybody sets up as
   * themselves: personal info, their ID, their bank. A company account needs
   * company papers, a tax number, directors and owners, none of which this
   * form asks (the owner, October 2026: "the steps should be simple ...
   * personal info, KYC with ID only, bank details, and that's all"), and
   * offering it only led to a choice that could not be made and a "contact
   * support" line. An account made as a business before keeps its type:
   * Stripe cannot change it.
   */
  const kind: "individual" | "business" = hasAccount && data.kind === "business" ? "business" : "individual"
  const [countryName, setCountryName] = React.useState(data.payoutHint?.country ? countryLabel(data.payoutHint.country) : data.prefill?.country ? countryLabel(data.prefill.country) : "")
  const [firstName, setFirstName] = React.useState(data.prefill?.firstName ?? "")
  const [lastName, setLastName] = React.useState(data.prefill?.lastName ?? "")
  const businessName = ""
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

/** Fields Stripe will take the ID document for instead: the ID step answers them, so no page asks. */
function coveredByEither(form: DetailsForm): DetailField[] {
  const out: DetailField[] = []
  for (const e of form.needs.either) if (e.alternative.includes("document")) out.push(...e.original)
  return out
}

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
  ssnLast4: string
  pep: boolean
  address: { line1: string; line2: string; city: string; postalCode: string; state: string }
  phone: string
  nationality: string
  idNumber: string
  agree: boolean
  holder: string | null
  iban: string
  accountNumber: string
  routing: string
}

const EMPTY_DRAFT: DetailsDraft = {
  dob: { day: "", month: "", year: "" },
  ssnLast4: "",
  pep: false,
  address: { line1: "", line2: "", city: "", postalCode: "", state: "" },
  phone: "",
  nationality: "",
  idNumber: "",
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
  needs: { fields: DetailField[]; tos: boolean; bank: boolean; name: boolean; other: string[]; checking: boolean; registeredAddress: boolean; problems: string[]; either: Array<{ original: DetailField[]; alternative: DetailField[] }>; offered: DetailField[]; given?: DetailField[]; handover?: DetailField[] }
  country: string
  agreementUrl: string
  dueBy: string | null
  active: boolean
  idNumber: { label: string; hint: string }
  /** Which sides of the ID Stripe already holds (a phone may have added them). */
  idSides?: { front: boolean; back: boolean }
  bank: { kind: "iban" | "routing"; routingLabel?: string; routingPattern?: string; accountLabel?: string; currency: string | null; holderName: string; last4: string | null; currencies?: string[] }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


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
  const proofPicker = React.useRef<HTMLInputElement>(null)
  /* Stripe asked for the ID again after this page was sent. */
  const [idAgain, setIdAgain] = React.useState(false)
  /* The bank, on this page during setup. */
  const [holder, setHolder] = useDraft("holder")
  const [iban, setIban] = useDraft("iban")
  const [accountNumber, setAccountNumber] = useDraft("accountNumber")
  const [routing, setRouting] = useDraft("routing")
  /* Stripe has the photo, or is looking at it. The camera and the phone code never leave this page. */
  const [idState, setIdState] = React.useState<"idle" | "checking" | "done">("idle")
  const [idProblem, setIdProblem] = React.useState<string | null>(null)
  const [typeIdInstead, setTypeIdInstead] = React.useState(false)
  /* How far the photo on its way to Stripe has got, so "Sending" always moves. */
  const [sentPct, setSentPct] = React.useState(0)
  /* Phone: the camera. Computer: a code for the phone. Null until the first paint in the browser. */
  const [idDevice, setIdDevice] = React.useState<"phone" | "desk" | null>(null)
  const [cameraSide, setCameraSide] = React.useState<IdSide | null>(null)
  const [cameraJob, setCameraJob] = React.useState<"document" | "proofOfAddress">("document")
  /* need, then the back after the front, then sent once Stripe has the photo. */
  const [idPhase, setIdPhase] = React.useState<"need" | "back" | "sent">("need")
  const [handoffUrl, setHandoffUrl] = React.useState("")
  const cameraArmed = React.useRef(false)
  const startCamera = React.useRef<(() => void) | null>(null)

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
        setIdProblem(safe(r.problem))
        setIdState("idle")
        return true
      }
    } catch {
      /* Ask again on the next turn. */
    }
    return false
  }, [setForm])

  React.useEffect(() => {
    setIdDevice(idOnThisDevice())
    setHandoffUrl(`${window.location.origin}/app/payouts?setup=1&id=1`)
  }, [])

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
    only === "id" ? f === "document" || f === "proofOfAddress" : only === "details" ? (f !== "document" || idAgain) && f !== "proofOfAddress" : true
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

  /*
   * A computer waits on the phone. The photo is uploaded there, Stripe marks
   * the document, and this page moves on by itself. It keeps asking while the
   * code is up, and again the moment the tab is focused.
   */
  React.useEffect(() => {
    if (idDevice !== "desk" || only !== "id" || !form) return
    if (!form.needs.fields.includes("document") || docGivenAtOpen) return
    if (idState === "done" || idState === "checking") return
    let timer = 0
    let n = 0
    const tick = () => {
      n += 1
      if (n > 160) return
      void askStripe()
      timer = window.setTimeout(tick, 3000)
    }
    timer = window.setTimeout(tick, 1200)
    const onBack = () => document.visibilityState === "visible" && void askStripe()
    document.addEventListener("visibilitychange", onBack)
    window.addEventListener("focus", onBack)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onBack)
      window.removeEventListener("focus", onBack)
    }
  }, [idDevice, only, form, docGivenAtOpen, idState, askStripe])

  /* A phone opens the camera as soon as this step is the one on screen. Once: closing it must not pop it straight back. */
  React.useEffect(() => {
    if (idDevice !== "phone" || only !== "id" || !form) return
    if (!form.needs.fields.includes("document") || docGivenAtOpen) return
    if (idState === "done" || idState === "checking" || idPhase !== "need") return
    if (cameraArmed.current) return
    cameraArmed.current = true
    armCameraSounds()
    setCameraSide("front")
    startCamera.current?.()
  }, [idDevice, only, form, docGivenAtOpen, idState, idPhase])

  const sectionFields = form ? form.needs.fields.filter(inSection) : []
  const bankHere = withBank && !!form && form.needs.bank
  const proofAsked = !!form && form.needs.fields.includes("proofOfAddress") && !form.needs.given?.includes("proofOfAddress")
  const idAsked = (!!form && form.needs.fields.includes("document") && !docGivenAtOpen) || proofAsked

  /* Nothing left to ask here: straight on. */
  const empty = !form
    ? false
    : only === "id"
      ? !idAsked
      : sectionFields.length === 0 && !form.needs.tos && !bankHere
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

  /* Only the rare extra document Stripe asks for by hand; the ID itself is Stripe's own check. */
  const upload = async (which: "proofOfAddress", side: "front" | "back", file: File) => {
    const key = `${which}-${side}`
    setUploading(key)
    setError(null)
    try {
      const blob = await shrinkPhoto(file)
      const data = new FormData()
      data.set("which", which)
      data.set("side", side)
      data.set("file", blob, blob.type === "application/pdf" ? "document.pdf" : "document.jpg")
      setSentPct(0)
      const res = await sendIdPhoto<{ form: DetailsForm }>("/api/payments/document", data, setSentPct, 30_000)
      setUploaded((u) => ({ ...u, [key]: true }))
      playAskSound("done")
      setForm((f) => (f ? { ...res.form, needs: { ...res.form.needs, fields: f.needs.fields } } : res.form))
    } catch (err) {
      playAskSound("error")
      setError(safe(err instanceof Error && err.message !== "too large" && err.message !== "unreadable" ? err.message : "That photo could not be used. Take it again in good light."))
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
  /*
   * Ready once this visit has sent the photo (front, then back or a passport),
   * or Stripe already held it when the step opened. A front that just went up
   * is not enough: the back is still to take, and Stripe's copy of the form
   * already lists that front as given.
   */
  const idVerified = idPhase === "sent" || ((idState === "done" || idState === "checking") && idPhase !== "back")
  const front = idVerified || docGivenAtOpen
  /* No CNP or ID number is ever typed here: the ID photo is the way (lib/payments/stripe/own-form-rules.ts needsOf). */
  const idEither = false
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
  const missingProof = has("proofOfAddress") && !uploaded["proofOfAddress-front"]
  const missingDoc = typeIdInstead || !has("document") ? false : (docDue && !front) || (idEither && !front && !idNumber.trim())
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
        } finally {
          /* Whether the parent moves on or keeps this step, the button stops spinning. */
          setBusy(false)
        }
        return
      }
      if (uploading) return
      if (form.needs.fields.includes("document") && !docGivenAtOpen && !front) {
        setIdProblem(idDevice === "desk" ? "Scan the code with your phone and photograph your ID." : idPhase === "back" ? "Take the back of your ID, or say it's a passport." : "Take a photo of your ID to carry on.")
        return
      }
      if (missingProof) return setError("Add a photo of your ID that shows your address.")
      /*
       * Stripe has the ID, even if the copy of the form here has not caught
       * up: say so, so the next step is the bank and never this step again.
       */
      const given = new Set(form.needs.given ?? [])
      if (front) given.add("document")
      onNext({ ...form, needs: { ...form.needs, given: [...given] } }, null)
      return
    }
    if ((has("dob") && dobBad) || (has("address") && (!address.line1.trim() || !address.city.trim() || !address.postalCode.trim())) || (has("state") && !address.state.trim()) || (has("phone") && phone.replace(/\D/g, "").length < 7) || (has("nationality") && !countryOf(nationality)) || idBad || (has("ssnLast4") && !/^\d{4}$/.test(ssnLast4)) || (form.needs.tos && !agree) || bankBad) {
      setError("Check the fields marked in red.")
      return
    }
    if (missingProof) return setError("Add a document that shows your address.")
    if (missingDoc) return setError(idEither ? (only === "details" ? `Enter your ${form.idNumber.label.split(" (")[0]}.` : `Take a photo of your ID, or enter your ${form.idNumber.label.split(" (")[0]} instead.`) : "Add a photo of the front of your ID.")
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
      /*
       * What Stripe still wants that THIS page can ask for. Measured against
       * the whole account it redrew the page over fields it does not draw
       * (the ID, which is the next step; a number Stripe takes the ID for),
       * leaving a heading, a Continue, and no way to satisfy either: press
       * it and the same empty page came back, for good.
       */
      const settled = new Set(coveredByEither(res.form))
      const left = res.form.needs.fields.filter(
        (f) => !settled.has(f) && (f !== "document" || !front) && (f !== "proofOfAddress" || !uploaded["proofOfAddress-front"]) && inSection(f),
      )
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

  /*
   * THE ID STAYS IN STORELIB. A phone opens the camera and the photo is sent
   * to Stripe (POST /api/payments/document). A computer shows a code for that
   * same step on the phone. Nothing here leaves for Stripe's own site.
   */
  const markIdSent = () => {
    setCameraSide(null)
    setIdPhase("sent")
    setIdState("checking")
    window.setTimeout(() => void askStripe(), 400)
  }

  const openIdCamera = (side: IdSide, job: "document" | "proofOfAddress" = "document") => {
    armCameraSounds()
    setIdProblem(null)
    setCameraJob(job)
    setCameraSide(side)
    startCamera.current?.()
  }

  const sendDocumentSide = async (side: IdSide, blob: Blob) => {
    setUploading(`document-${side}`)
    setError(null)
    setIdProblem(null)
    setCameraSide(null)
    try {
      const file = new File([blob], "id.jpg", { type: blob.type || "image/jpeg" })
      const data = new FormData()
      data.set("which", "document")
      data.set("side", side)
      data.set("file", file)
      setSentPct(0)
      const res = await sendIdPhoto<{ form: DetailsForm }>("/api/payments/document", data, setSentPct, 30_000)
      setUploaded((u) => ({ ...u, [`document-${side}`]: true }))
      playAskSound("done")
      setForm((f) => (f ? { ...res.form, needs: { ...res.form.needs, fields: f.needs.fields } } : res.form))
      if (side === "front") {
        setIdPhase("back")
        setCameraSide("back")
      } else {
        markIdSent()
      }
    } catch (err) {
      playAskSound("error")
      const message = err instanceof Error ? err.message : ""
      const offline = /No connection|took too long|did not go through|did not answer/i.test(message)
      if (offline) setIdProblem(verifyLine("offline"))
      else setIdProblem(safe(message || "That photo could not be used. Take it again."))
      setIdState("idle")
    } finally {
      setUploading(null)
    }
  }

  const sendingId = uploading === "document-front" || uploading === "document-back"
  const idPhoto = has("document")
    ? (
          <div className="space-y-2" data-id-photo="storelib">
            {only === "id" ? null : <span className="block text-[13px] font-medium text-[#1a1a2e]">Verify who you are</span>}
            {idVerified ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[#abefc6] bg-[#f6fef9] px-4 py-3.5" data-identity="done">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dcfae6] text-[#067647]">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-[#1a1a2e]">{idState === "done" ? "Verified" : "ID sent"}</span>
                  <span className="block text-[12.5px] text-[#6b7280]">{idState === "done" ? "Stripe has your ID." : "Stripe is checking it. This usually takes under a minute."}</span>
                </span>
              </div>
            ) : idDevice === null ? (
              <div className="flex h-[88px] items-center justify-center rounded-2xl border border-[#e3e5e8] bg-white">
                <span aria-label="Loading" className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/60" />
              </div>
            ) : idDevice === "desk" ? (
              <div className="flex flex-col items-center rounded-2xl border border-[#e3e5e8] bg-white px-5 py-6 text-center" data-id-phone-scan="">
                <IdHandoffQr url={handoffUrl} />
                <span className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#1a1a2e]">
                  <Smartphone className="h-4 w-4" />
                  Scan with your phone
                </span>
                <span className="mt-1.5 max-w-[300px] text-[13px] leading-[18px] text-[#6b7280]">
                  Point your camera at the code. Photograph your ID on your phone and it goes straight to Stripe. Storelib never sees the document.
                </span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-[#6b7280]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#067647]" />
                  This page updates when the photo is in
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openIdCamera(idPhase === "back" ? "back" : "front")}
                disabled={sendingId}
                data-id-camera-open=""
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-4 text-left outline-none transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:cursor-default",
                  tried && missingDoc ? "border-[#f3b8ab] bg-[#fff8f6]" : "border-[#e3e5e8] bg-white hover:border-[#c9ccd3] hover:bg-[#fafafb]",
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a1a2e] text-white">
                  {sendingId ? <Spinner /> : <Camera className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-[#1a1a2e]">
                    {sendingId ? (sentPct >= 99 ? "Waiting for Stripe" : `Sending ${sentPct}%`) : idPhase === "back" ? "Take the back" : "Take a photo of your ID"}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-[17px] text-[#6b7280]">
                    {sendingId
                      ? "Stripe is saving the photo. If it doesn't answer, take it again."
                      : idPhase === "back"
                        ? "The other side of the card. A passport has no back."
                        : "Your camera opens. Front, then the back. Storelib never sees the document."}
                  </span>
                </span>
              </button>
            )}
            {idProblem ? (
              <p role="status" className="rounded-xl border border-[#fedf89] bg-[#fffcf5] px-3.5 py-2.5 text-[13px] leading-[19px] text-[#93370d]" data-identity-problem="">
                {idProblem}
              </p>
            ) : null}
            {idDevice === "phone" && idPhase === "back" && !idVerified && !sendingId ? (
              <button type="button" onClick={markIdSent} className="text-left text-[13px] font-medium text-[#4b5563] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline" data-id-passport="">
                It's a passport
              </button>
            ) : null}
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
        {only === "id" ? null : form.needs.problems.length ? (
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
            <PhoneField country={form.country} value={phone} onChange={setPhone} />
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

        {!idEither ? idPhoto : null}

        {only === "id" && idEither && !front && !typeIdInstead ? (
          <button type="button" onClick={() => setTypeIdInstead(true)} className="-mt-1 text-left text-[13px] font-medium text-[#4b5563] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline" data-id-number-instead="">
            Use my {form.idNumber.label.split(" (")[0]} instead
          </button>
        ) : null}

        {has("ssnLast4") ? (
          <Field label="Last 4 digits of your SSN" hint="Stripe asks for these four digits to confirm who you are." error={issue("ssnLast4", !/^\d{4}$/.test(ssnLast4), "Enter the last four digits of your SSN.")}>
            <input className={FIELD} inputMode="numeric" maxLength={4} autoComplete="off" value={ssnLast4} onChange={(e) => setSsnLast4(e.target.value.replace(/\D/g, ""))} />
          </Field>
        ) : null}

        {has("proofOfAddress") && !(has("document") && !idVerified && !docGivenAtOpen) ? (
          <div className="space-y-2">
            <span className="block text-[13px] font-medium text-[#1a1a2e]">One more photo</span>
            <span className="block text-[12px] leading-[18px] text-[#6b7280]">An ID that shows your address. The same camera, then you're done.</span>
            <button
              type="button"
              onClick={() => (idDevice === "phone" ? openIdCamera("front", "proofOfAddress") : proofPicker.current?.click())}
              disabled={!!uploading}
              data-proof-add=""
              className={cn(
                "flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-4 text-left outline-none transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15",
                uploaded["proofOfAddress-front"] ? "border-[#abefc6] bg-[#f6fef9]" : tried && missingProof ? "border-[#f3b8ab] bg-[#fff8f6]" : "border-[#e3e5e8] bg-white hover:border-[#c9ccd3] hover:bg-[#fafafb]",
              )}
            >
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", uploaded["proofOfAddress-front"] ? "bg-[#dcfae6] text-[#067647]" : "bg-[#1a1a2e] text-white")}>
                {uploading === "proofOfAddress-front" ? <Spinner dark={!!uploaded["proofOfAddress-front"]} /> : uploaded["proofOfAddress-front"] ? <Check className="h-5 w-5" strokeWidth={3} /> : <Camera className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-[#1a1a2e]">
                  {uploading === "proofOfAddress-front" ? "Sending to Stripe" : uploaded["proofOfAddress-front"] ? "Added" : "Add a photo of your ID"}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-[17px] text-[#6b7280]">
                  {uploaded["proofOfAddress-front"] ? "Tap to replace it." : "A clear colour photo. It goes straight to Stripe."}
                </span>
              </span>
            </button>
            <input
              ref={proofPicker}
              type="file"
              accept="image/jpeg,image/png,image/heic"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                if (f) void upload("proofOfAddress", "front", f)
              }}
            />
          </div>
        ) : null}

        {has("politicalExposure") ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#eceef1] px-3.5 py-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#1a1a2e]" checked={pep} onChange={(e) => setPep(e.target.checked)} />
            <span className="text-[13px] leading-[19px] text-[#4b5563]">I hold, or have held in the last year, a prominent public role. Leave it unticked if not.</span>
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


      </div>

      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>Back</button>
        <button type="submit" className={PRIMARY} disabled={busy || !!uploading}>
          {busy || uploading ? <Spinner /> : null}
          {busy ? "Saving" : uploading && only !== "id" ? (sentPct >= 99 ? "Waiting for Stripe" : `Sending ${sentPct}%`) : "Continue"}
        </button>
      </Footer>
      <IdCamera
        open={cameraSide !== null}
        side={cameraSide ?? "front"}
        zIndex={PANEL_Z + 30}
        bindStart={(start) => {
          startCamera.current = start
        }}
        onPhoto={(blob) => {
          const side = cameraSide ?? "front"
          if (cameraJob === "proofOfAddress") {
            setCameraSide(null)
            void upload("proofOfAddress", "front", new File([blob], "id.jpg", { type: blob.type || "image/jpeg" }))
            return
          }
          void sendDocumentSide(side, blob)
        }}
        onClose={() => setCameraSide(null)}
        onDenied={() => {
          setCameraSide(null)
          setIdProblem("Allow the camera for Storelib, then take the photo here.")
        }}
        onNoBack={
          cameraSide === "back"
            ? () => {
                setCameraSide(null)
                markIdSent()
              }
            : undefined
        }
      />
    </form>
  )
}

/* ── step 3: bank ──────────────────────────────────────────────────────── */

/**
 * THE BANK, IN THE COUNTRY'S OWN FORMAT: an IBAN where the country uses one
 * (checked with its own mod 97 before it leaves the page), account and
 * routing number where it does not. It becomes the payout account for the
 * account's currency; the old one, if any, stops being used.
 */
/*
 * The bank on its own (Update bank on Payouts). It hands the overview Stripe
 * answered with to the caller: settling from the prop instead read the state
 * as it was BEFORE the bank was added, so a first bank still looked missing,
 * the panel quietly went nowhere, and a creator who had just saved one was
 * left looking at the form wondering whether it took.
 */
function BankForm({ failed = false, onBack, backLabel = "Back", onDone, onData }: { failed?: boolean; onBack: () => void; backLabel?: string; onDone: (sent: Overview) => void; onData: (next: Overview) => void }) {
  const { form, error: loadError, load } = useDetailsForm()
  const [holder, setHolder] = React.useState<string | null>(null)
  const [iban, setIban] = React.useState("")
  const [accountNumber, setAccountNumber] = React.useState("")
  const [routing, setRouting] = React.useState("")
  const [picked, setPicked] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tried, setTried] = React.useState(false)

  if (!form) return <FormWaiting error={loadError} onRetry={load} />
  const bank = form.bank
  /* The payout currencies Stripe pays out to in this country: local first, then euro and US dollar where supported. */
  const currencies = bank.currencies?.length ? bank.currencies : bank.currency ? [bank.currency] : []
  const currency = picked ?? (bank.currency && currencies.includes(bank.currency) ? bank.currency : currencies[0] ?? null)
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
      const res = await post<{ form: DetailsForm; overview: Overview }>("bank", bank.kind === "iban" ? { holderName: name, iban, currency } : { holderName: name, accountNumber, routingNumber: routing, currency })
      onData(res.overview)
      onDone(res.overview)
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : "That bank account was not saved. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} onInput={() => error && setError(null)} noValidate data-bank-step="" className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 space-y-5 px-5 sm:px-7">
        <StepIntro title={title} line={line} />
        <ErrorLine message={error} />
        {bank.last4 ? (
          <div className="flex items-center gap-3 rounded-xl border border-[#eceef1] px-3.5 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#4b5563]"><Landmark className="h-4 w-4" /></span>
            <span className="text-[13.5px] text-[#4b5563]">Current account ending in <span className="font-medium tabular-nums text-[#1a1a2e]">{bank.last4}</span></span>
          </div>
        ) : null}
        {currencies.length > 1 ? (
          <div className="space-y-2">
            <span className="block text-[13px] font-medium text-[#1a1a2e]">Payout currency</span>
            <div role="radiogroup" aria-label="Payout currency" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${currencies.length}, minmax(0, 1fr))` }}>
              {currencies.map((cur) => {
                const on = cur === currency
                return (
                  <button
                    key={cur}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    data-payout-currency={cur}
                    onClick={() => setPicked(cur)}
                    className={cn(
                      "flex min-h-[56px] cursor-pointer flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left outline-none transition-[border-color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15",
                      on ? "border-[#1a1a2e] bg-white shadow-[0_0_0_1px_#1a1a2e]" : "border-[#e3e5e8] bg-white hover:border-[#c9ccd3]",
                    )}
                  >
                    <span className="text-[14px] font-semibold text-[#1a1a2e]">{cur}</span>
                    <span className="truncate text-[12px] text-[#6b7280]">{cur === currencies[0] ? "Local" : currencyName(cur)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        <Field label="Account holder name" hint="Your name, as your bank has it." error={tried && name.trim().length < 2 ? "Enter the name on the account." : undefined}>
          <input className={FIELD} autoComplete="name" value={name} onChange={(e) => setHolder(e.target.value)} />
        </Field>
        {bank.kind === "iban" ? (
          <Field label="IBAN" hint={currency ? `Your ${currency} account. Payouts arrive in ${currency}.` : undefined} error={tried && !ibanOk ? "That IBAN does not look right. Check it in your bank app." : undefined}>
            <input className={cn(FIELD, "font-mono tracking-[0.02em]")} autoComplete="off" spellCheck={false} autoCapitalize="characters" placeholder={`${form.country}00 0000 0000 0000 0000`} value={iban} onChange={(e) => setIban(formatIban(e.target.value))} />
          </Field>
        ) : (
          <>
            <Field label={bank.routingLabel ?? "Bank code"} error={tried && !routingOk ? `Check your ${(bank.routingLabel ?? "bank code").toLowerCase()}.` : undefined}>
              <input className={FIELD} autoComplete="off" spellCheck={false} inputMode={form.country === "IN" ? undefined : "numeric"} value={routing} onChange={(e) => setRouting(e.target.value)} />
            </Field>
            <Field label={bank.accountLabel ?? "Account number"} hint={currency ? `Payouts arrive in ${currency}.` : undefined} error={tried && accountNumber.replace(/[\s-]/g, "").length < 4 ? "Enter your account number." : undefined}>
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

/** "Euro", "US dollar": the currency's name in English, or the code when the browser does not know it. */
function currencyName(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code)
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code
  } catch {
    return code
  }
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

/*
 * "WE'RE VERIFYING YOUR DETAILS" WAS A DEAD END THAT PROMISED DAYS.
 *
 * A document handed to Stripe is usually cleared in seconds, sometimes in a
 * minute. The screen at the end of setup read the account once, caught that
 * short window, said it might take up to two business days and stopped
 * there: the creator had done everything asked of them and was told to go
 * away and wait. Most of them were already verified moments later and had
 * no way of knowing.
 *
 * So it waits with them. While it is on screen it asks the server every few
 * seconds for about a minute, and the moment Stripe is satisfied it becomes
 * "Payments active" by itself. Only somebody Stripe really is taking longer
 * over ever sees a wait, and even then it is not given a number: the email
 * when it clears is the promise, not a guess at how many days.
 */
function Outcome({ outcome, what, onContinue, onDone, onChecked }: { outcome: Outcome; what: "id" | "details"; onContinue: () => void; onDone: () => void; onChecked?: (next: Overview) => void }) {
  const [waited, setWaited] = React.useState(0)
  const checked = React.useRef(onChecked)
  checked.current = onChecked
  React.useEffect(() => {
    if (outcome !== "checking") return
    let gone = false
    let tries = 0
    const ask = async () => {
      tries += 1
      setWaited(tries)
      try {
        const next = await post<Overview>("refresh", {})
        if (!gone) checked.current?.(next)
      } catch {
        /* A blip: the next tick asks again, and the email arrives either way. */
      }
    }
    const t = window.setInterval(() => {
      if (tries >= 15) {
        window.clearInterval(t)
        return
      }
      void ask()
    }, 4000)
    return () => {
      gone = true
      window.clearInterval(t)
    }
  }, [outcome])

  const copy =
    outcome === "done"
      ? { icon: <Check className="h-5 w-5" strokeWidth={3} />, tone: "bg-[#ecfdf3] text-[#067647]", title: "Payments active", line: "You're ready to accept payments. Your sales are paid into your balance and you cash out to your bank.", action: "Done", primary: onDone }
      : outcome === "bank"
        ? {
            icon: <Landmark className="h-5 w-5" />,
            tone: "bg-[#fffaeb] text-[#b54708]",
            title: "Add your bank account",
            line: "Everything else is done. Add the account your payouts go to and payments switch on.",
            action: "Add bank account",
            primary: onContinue,
          }
        : outcome === "checking"
          ? {
            icon: <Clock className="h-5 w-5" />,
            tone: "bg-[#f4f3ff] text-[#5b4bd5]",
            /* "Checking your ID" when no ID had gone in read as the form having lost something. It is checking the details then. */
            title: what === "id" ? "Checking your ID" : "Checking your details",
            line:
              waited >= 15
                ? "Stripe is taking a closer look at this one. Nothing more is needed from you, and we'll email you the moment payments are on."
                : "This usually takes a few seconds. You can close this: we'll email you the moment payments are on.",
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

