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
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { BANK_COLLECTION, SETUP_COLLECTION } from "@/lib/payments/stripe/setup-collection"
import { Shimmer, ShimmerBlock } from "@/components/ui/shimmer"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CountryPicker, CountryFlag } from "@/components/app/settings/country-picker"
import { PhoneField } from "@/components/app/settings/phone-field"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { countryLabel, countryOf } from "@/lib/account/country"
import { personalIssues } from "@/lib/payments/stripe/onboarding-steps"
import { cannotPayOutLine, payoutPlan, payoutPlanLine, type PayoutPlan } from "@/lib/payments/stripe/payout-regions"
import { setupStepOf, type StorelibPaymentsStatus } from "@/lib/payments/stripe/status"
import type { Overview } from "@/components/app/settings/payments-hub-shared"
import { isNativeApp, openInApp } from "@/lib/native-bridge"
import "@/lib/stripe-nav-guard"
import { armCameraSounds, IdCamera, sendIdPhoto, shrinkPhoto, type IdSide } from "@/components/app/settings/id-camera"
import { mediaOffSheet, showAccessSheet } from "@/lib/native-permissions"
import { StripeConnectEmbedded, StripeFormSkeleton } from "@/components/app/settings/stripe-connect-embedded"
import { dropAccountSession, prefetchAccountSession, primeAccountSession, warmStripeConnect } from "@/components/app/settings/stripe-connect-warm"
import { readsLikeStripe, verifyLine } from "@/lib/payments/verify-id"
import { playAskSound } from "@/lib/website-builder/ask-sounds"
import { cn } from "@/lib/utils"
import { tt, msg } from "@/lib/i18n/text"
import { noteActivity } from "@/lib/activity/creator-activity-client"
import { appLocale, zoned } from "@/lib/i18n/format"

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
  if (!message.trim() || readsLikeStripe(message)) return tt("Something went wrong. Try again in a moment.")
  return message
}

/**
 * A failed call, with the server's sentence and what kind of problem it is
 * (lib/payments/stripe/setup-errors SetupProblemCode), so a screen offers the
 * step that can work: another country, Try again, or support.
 */
class SetupError extends Error {
  readonly code: string | null
  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
}

function codeOf(err: unknown): string | null {
  return err instanceof SetupError ? err.code : null
}

async function read<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string | null }
  if (!res.ok) {
    const code = typeof data.code === "string" ? data.code : res.status === 429 ? "retry" : null
    throw new SetupError(safe(data.error || tt("Something went wrong. Try again in a moment.")), code)
  }
  return data
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/payments/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    })
  } catch {
    /* No answer at all: the connection, not Storelib or Stripe. */
    throw new SetupError(tt("Your connection dropped. Check you are online, then try again."), "retry")
  }
  const data = await read<T>(res)
  /* Noted for /admin's creator activity once Storelib said yes: the step's name only, nothing that was typed (lib/activity/creator-activity-client). */
  if (path === "start" || path === "begin") noteActivity("stripe.start")
  else if (path === "app-sheet" || path === "details-form") noteActivity("stripe.continue")
  return data
}


/* ── the panel ─────────────────────────────────────────────────────────── */

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px), (max-height: 520px) and (pointer: coarse)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    window.addEventListener("orientationchange", on)
    return () => {
      mq.removeEventListener("change", on)
      window.removeEventListener("orientationchange", on)
    }
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
        <img src={src} alt={tt("Scan with your phone to verify your ID")} className="h-full w-full" />
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
        "fixed inset-0 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-white pb-[max(12px,env(safe-area-inset-bottom))] ease-sheet [backface-visibility:hidden] sm:bg-[#f6f7f9] sm:pb-4",
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
export function PaymentsPanelWaiting({ open, onClose, label = tt("Payments") }: { open: boolean; onClose: () => void; label?: string }) {
  const phone = usePhone()
  return (
    <Panel open={open} phone={phone} onClose={onClose} label={label}>
      <div className="shrink-0 border-b border-[#f1f2f4] bg-white pt-[env(safe-area-inset-top)] sm:border-[#eceef1]">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-1 px-2 sm:h-16 sm:gap-3 sm:px-6">
          {phone ? (
            <>
              <button
                type="button"
                aria-label={tt("Close")}
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
                <span className="truncate text-[14px] text-[#6b7280]">{tt("Payments")}</span>
              </span>
              <button
                type="button"
                aria-label={tt("Close")}
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
          <Shimmer className="hidden sm:mb-6 sm:block sm:px-1" label={tt("Opening {value}", { value: label.toLowerCase() })}>
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
const STEP_LABELS = [msg("Personal info"), msg("Verify ID"), msg("Bank account")] as const
/*
 * THE ID CHECK IS ONLY A STEP WHEN STRIPE WANTS IT. A seller Stripe does not
 * need an ID from right now never sees it in the steps at all: the stepper is
 * Account, Details until the ID step has loaded and found Stripe is asking.
 */
const STEP_LABELS_NO_ID = [msg("Personal info"), msg("Bank account")] as const

function Stepper({ step, done: all, labels = STEP_LABELS }: { step: number; done?: boolean; labels?: readonly string[] }) {
  return (
    <ol className="flex items-center gap-2" aria-label={tt("Setup steps")}>
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
              <span className={cn("text-[13px] transition-colors duration-200", on ? "font-medium text-[#1a1a2e]" : "text-[#6b7280] max-[360px]:hidden")}>{tt(label)}</span>
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
          aria-label={tt("About {label}", { label })}
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
          {optional ? <span className="font-normal text-[#9ca3af]"> {tt("(optional)")}</span> : null}
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

  const title = mode === "bank" ? (data.payoutDestination ? tt("Payout account") : tt("Add bank account")) : mode === "details" ? tt("Account details") : tt("Set up payouts")
  /*
   * THE PHONE APP RUNS STORELIB'S OWN STEPS (round 19, the owner: "bring
   * back the iOS style steps with icons, Stripe embedded only on the web").
   * In the iOS and Android apps setup is this page's own: personal details,
   * the ID photo from the phone's camera, the bank, each written to Stripe by
   * Storelib's server, ending on the outcome screen that says it is done and
   * takes the creator back. Neither Stripe's embedded form nor Stripe's page
   * is opened there, so nothing can leave the app. A browser keeps Stripe's
   * embedded form (SetupEmbed).
   *
   * ROUND 20, the owner: "on iOS and Android the payouts setup opens as a
   * mobile bottom sheet, with Stripe's embed there, no step asking for a
   * website, a profession or what type of person you are; when it is all
   * finished it closes and takes you back to Storelib. Browsers and big
   * screens stay as they are." So the apps draw the same SetupEmbed as the
   * web, inside the app's own BottomSheet (`sheet`), and Storelib's own steps
   * no longer run there (OWN_STEPS_IN_APP). The account is a person with its
   * website, category and description already filled before Stripe's form is
   * drawn (lib/payments/stripe/connect.ts), and SETUP_COLLECTION leaves those
   * questions out, so Stripe's first screen is the person's own details.
   */
  const sheet = isNativeApp()
  const inApp = OWN_STEPS_IN_APP && sheet
  /* In the apps, payouts on is the end of it: the done screen for a moment, then the sheet closes back to Storelib. */
  const finishRef = React.useRef(finish)
  finishRef.current = finish
  React.useEffect(() => {
    if (!sheet || !open || ending !== "done") return
    const t = window.setTimeout(() => finishRef.current(), 1800)
    return () => window.clearTimeout(t)
  }, [sheet, open, ending])
  /* Back walks past a step that had nothing to ask, so it never lands somewhere that sends it forward again. */
  const stepBefore = (from: Step): Step => (from === 3 ? (idEmpty ? (detailsEmpty ? 0 : 1) : 2) : from === 2 ? (detailsEmpty ? 0 : 1) : 0)
  const backCloses = !(inApp && mode === "setup" && !ending && step !== 0) && (mode === "setup" || !!ending || step === 0)
  const onBack = backCloses ? onClose : () => go(stepBefore(step))
  const slide = back ? "slide-in-from-left-4" : "slide-in-from-right-4"
  /* The ID step is only a step once Stripe has asked for a document. */
  const labels = idNeeded ? STEP_LABELS : STEP_LABELS_NO_ID
  const last = labels.length - 1
  /* On the web Stripe draws its own steps. In the app these are ours, on this page. */
  const shownStep = inApp && mode === "setup" && !ending ? (step === 3 ? last : step === 2 && idNeeded ? 1 : 0) : ending ? last : 0

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
  } else if (inApp) {
    body = (
      <InAppSetup
        mode={mode}
        step={step}
        data={data}
        openCount={openCount}
        onClose={onClose}
        onData={onData}
        go={go}
        settle={(sent, left) => void settle(sent, left)}
        skipDetails={() => {
          setDetailsEmpty(true)
          go(2)
        }}
        skipId={() => {
          setIdEmpty(true)
          go(3)
        }}
        askId={() => setIdNeeded(true)}
      />
    )
  } else {
    body = (
      <SetupEmbed
        key={`id-${openCount}`}
        data={data}
        bankOnly={mode === "bank"}
        onData={onData}
        onCancel={onClose}
        onExit={async () => {
          /* Stripe's own back and Continue stay in charge until payouts are actually on. */
          const next = await post<Overview>("refresh")
          onData(next)
          if (outcomeOf(statusOf(next)) !== "done") return
          onFinished()
          setEnding("done")
        }}
      />
    )
  }

  const subtitle =
    mode === "setup"
      ? idNeeded
        ? tt("Your personal info, a quick ID check with Stripe, then your bank. About five minutes.")
        : tt("Your personal info, then your bank. About five minutes.")
      : mode === "bank"
        ? tt("Where your cash outs are sent.")
        : tt("The details on your payments account.")

  const bar = (
    <>
      {/* The bar: the way back on a phone; Storelib's mark and the way out on a computer. */}
      <div className="shrink-0 border-b border-[#f1f2f4] bg-white pt-[env(safe-area-inset-top)] sm:border-[#eceef1]">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-1 px-2 sm:h-16 sm:gap-3 sm:px-6">
          {phone ? (
            <>
              <button
                type="button"
                aria-label={backCloses ? tt("Close") : tt("Back")}
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
                <span className="truncate text-[14px] text-[#6b7280]">{tt("Payments")}</span>
              </span>
              <button
                type="button"
                aria-label={tt("Close")}
                onClick={onClose}
                className="-mr-1.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#eef0f2] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

    </>
  )

  const content = (
      <div data-setup-scroll="" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        {/* One narrow column: 560px of card on a computer, the whole width on a phone,
            where it fills the screen so Cancel and Continue sit at the bottom. */}
        <div className="mx-auto w-full max-w-[560px] px-0 pb-[max(4.5rem,env(safe-area-inset-bottom))] max-sm:flex max-sm:min-h-full max-sm:flex-col sm:px-6 sm:pb-24 sm:pt-10 [@media(max-height:540px)]:px-3 [@media(max-height:540px)]:pb-8 [@media(max-height:540px)]:pt-3">
          {phone ? (
            mode === "setup" && (ending || inApp) ? (
              <div className="px-5 pt-4">
                <Stepper step={shownStep} labels={labels} done={ending === "done" || ending === "checking"} />
              </div>
            ) : null
          ) : (
            <div className="mb-6 px-1 [@media(max-height:540px)]:mb-3">
              <h2 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-[#1a1a2e]">{title}</h2>
              <p className="mt-1 text-[14px] leading-5 text-[#6b7280]">{subtitle}</p>
              {mode === "setup" && (ending || inApp) ? (
                <div className="mt-5">
                  <Stepper step={shownStep} labels={labels} done={ending === "done" || ending === "checking"} />
                </div>
              ) : null}
            </div>
          )}

          <div data-setup-card="" className="overflow-visible bg-white max-sm:flex max-sm:flex-col sm:rounded-2xl sm:border sm:border-[#e5e7eb]/80 sm:shadow-[0_1px_3px_rgba(16,24,40,0.05),0_12px_32px_-16px_rgba(16,24,40,0.10)]">
            <div key={`${mode}-${step}-${ending ?? ""}-${openCount}`} className={cn("flex flex-col overflow-visible pt-4 animate-in fade-in-0 duration-300 ease-sheet sm:pt-7 [@media(max-height:540px)]:pt-3", slide)}>
              {body}
            </div>
          </div>

        </div>
      </div>
  )

  if (sheet && !inApp) {
    return <AppBrowserSetup open={open} mode={mode} data={data} onData={onData} onClose={onClose} onFinished={onFinished} />
  }

  if (sheet) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        label={title}
        hideFrom={null}
        fill
        height="calc(100dvh - max(env(safe-area-inset-top), 12px) - 10px)"
        maxHeight="none"
        zIndex={PANEL_Z}
        header={<SheetBar title={title} onClose={onClose} />}
      >
        {/* Stripe's form scrolls in here; a pull from the handle or the title closes the sheet, never one inside the form. */}
        <div data-payments-setup-panel="sheet" data-sheet-no-drag="" className="flex min-h-0 flex-1 flex-col bg-white">
          {content}
        </div>
      </BottomSheet>
    )
  }

  return (
    <Panel open={open} phone={phone} onClose={onClose} label={title}>
      {bar}
      {content}
    </Panel>
  )
}

/*
 * SETUP IN THE APPS' BROWSER SHEET (the owner: "on iOS and Android it should
 * not take me outside Storelib: a browser bottom sheet with the Stripe embed
 * there"). Stripe's form inside the app's own web view opened its windows in
 * Safari, which left the app. So the apps open the system's browser sheet
 * over the app (SFSafariViewController on iOS, a Chrome Custom Tab on
 * Android) on /payouts-sheet: Storelib's page with Stripe's embedded form,
 * signed in by a link for this creator (lib/payments/stripe/app-sheet-link.ts).
 * A real browser keeps Stripe's own windows inside it.
 *
 * While the sheet is up this page asks Stripe every few seconds; once payouts
 * are on it closes the sheet itself and the creator is back where they were.
 * Done in the sheet comes back the same way, and the page redraws from what
 * Stripe says then.
 */
function AppBrowserSetup({
  open,
  mode,
  data,
  onData,
  onClose,
  onFinished,
}: {
  open: boolean
  mode: SetupMode
  data: Overview
  onData: (next: Overview) => void
  onClose: () => void
  onFinished: () => void
}) {
  const [error, setError] = React.useState<{ message: string; code: string | null } | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  /* The small "opening" mark shows only until the sheet is up. */
  const [launched, setLaunched] = React.useState(false)
  /* No account yet, or one nothing was sent on: the country is asked here first, in the app, like on the web (CountryStep). */
  const needsCountry = mode !== "bank" && ((data.beat ?? "personal") === "personal" || data.setupCountry?.changeable === true)
  const [country, setCountry] = React.useState<string | null>(null)
  /* The last country Continue was pressed on: the field comes back on it, not on a guess, when the server refuses it. */
  const [lastChoice, setLastChoice] = React.useState<string | null>(null)
  const [countryProblem, setCountryProblem] = React.useState<CountryProblem | null>(null)
  const latest = React.useRef({ data, onData, onClose, onFinished })
  latest.current = { data, onData, onClose, onFinished }
  React.useEffect(() => {
    if (open) return
    setCountry(null)
    setLastChoice(null)
    setCountryProblem(null)
  }, [open])
  const asking = open && needsCountry && !country

  React.useEffect(() => {
    setLaunched(false)
    if (!open || asking) return
    let gone = false
    let shown = false
    let poll = 0
    let listener: { remove: () => void } | null = null
    const form = mode === "bank" ? "bank" : "setup"
    /* A bank change starts with payouts already on: only Done ends that one. */
    const closesWhenOn = form === "setup"

    const settle = async (closeSheet: boolean) => {
      if (gone) return
      gone = true
      window.clearInterval(poll)
      listener?.remove()
      if (closeSheet) await import("@capacitor/browser").then(({ Browser }) => Browser.close()).catch(() => {})
      try {
        const next = await post<Overview>("refresh")
        latest.current.onData(next)
        const outcome = outcomeOf(statusOf(next))
        if (outcome === "done" || outcome === "checking") latest.current.onFinished()
      } catch {
        /* The page keeps what it had; opening Payouts again asks Stripe. */
      }
      latest.current.onClose()
    }

    void (async () => {
      try {
        const current = latest.current.data
        /* The country just chosen opens the account there, replaces one in another country, or marks it as the seller's. */
        if (form === "setup" && country) {
          latest.current.onData(await post<Overview>("start", { agree: true, kind: current.kind === "business" ? "business" : "individual", country }))
        }
        const { url } = await post<{ url: string }>("app-sheet", { form })
        if (gone) return
        const { Browser } = await import("@capacitor/browser")
        listener = await Browser.addListener("browserFinished", () => void settle(false))
        if (gone) {
          listener.remove()
          return
        }
        await Browser.open({ url, presentationStyle: "popover", toolbarColor: "#ffffff" })
        shown = true
        setLaunched(true)
        if (closesWhenOn) {
          poll = window.setInterval(async () => {
            try {
              const next = await post<Overview>("refresh")
              if (gone) return
              latest.current.onData(next)
              if (outcomeOf(statusOf(next)) === "done") void settle(true)
            } catch {
              /* Asked again in a moment. */
            }
          }, 4000)
        }
      } catch (err) {
        if (gone) return
        const message = safe(err instanceof Error ? err.message : tt("We could not start setup just now."))
        const code = codeOf(err)
        if (code === "country_unsupported" || code === "country_required") {
          setCountryProblem({ message, code })
          setCountry(null)
          return
        }
        setError({ message, code })
      }
    })()

    return () => {
      gone = true
      window.clearInterval(poll)
      listener?.remove()
      if (shown) void import("@capacitor/browser").then(({ Browser }) => Browser.close()).catch(() => {})
    }
  }, [open, mode, attempt, asking, country])

  return (
    <>
      <BottomSheet isOpen={asking} onClose={onClose} label={tt("Set up payouts")} hideFrom={null} zIndex={PANEL_Z} header={<SheetBar title={tt("Set up payouts")} onClose={onClose} />}>
        <div className="flex flex-col pt-2">
          <CountryStep data={data} initial={lastChoice} problem={countryProblem} onCancel={onClose} onChoose={(code) => { setCountryProblem(null); setLastChoice(code); setCountry(code) }} />
        </div>
      </BottomSheet>
      {open && !asking && !error && !launched ? (
        <div aria-live="polite" className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_8px_30px_rgba(16,24,40,0.12)]">
            <span aria-label={tt("Opening")} className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/60" />
          </span>
        </div>
      ) : null}
      <BottomSheet isOpen={open && !!error} onClose={() => { setError(null); onClose() }} label={tt("Set up payouts")} hideFrom={null} zIndex={PANEL_Z}>
        <div className="flex flex-col items-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 text-center">
          <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Couldn't open setup")}</p>
          <p className="mt-1 text-[14px] text-[#6b7280]">{error?.message}</p>
          {error && (error.code === "retry" || error.code === null) ? (
            <button type="button" className={cn(SECONDARY, "mt-4")} onClick={() => { setError(null); setAttempt((n) => n + 1) }}>{tt("Try again")}</button>
          ) : (
            <a href="mailto:support@storelib.com?subject=Payouts%20setup" className={cn(SECONDARY, "mt-4 inline-flex items-center justify-center")}>{tt("Email support")}</a>
          )}
        </div>
      </BottomSheet>
    </>
  )
}

/** The sheet's title row in the apps: the name of the step in the middle, the way out on the right. */
function SheetBar({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex h-12 items-center px-2">
      <span aria-hidden className="w-11" />
      <h2 className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-[#1a1a2e]">{title}</h2>
      <button
        type="button"
        aria-label={tt("Close")}
        onClick={onClose}
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#6b7280] outline-none transition-colors active:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
      >
        <X className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </button>
    </div>
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
/** Storelib's own steps in the phone apps (round 19). Off since round 20: the apps run Stripe's embed in a sheet. */
const OWN_STEPS_IN_APP = false


/*
 * THE COUNTRY, ASKED ONCE, BEFORE ANYTHING IS OPENED (Nov 23 2026). Setup
 * used to open the Stripe account straight away in the country on the
 * seller's profile, or in Romania (the platform's own) when the profile had
 * none. Stripe never changes an account's country, so a seller in Germany,
 * the US or the UK was asked for a Romanian address and bank, and a seller
 * whose country Stripe cannot pay out to got an error with only Try again
 * under it, which could never work. Now the first screen is the one question
 * that decides everything after it, prefilled from the profile or the
 * browser, and a country Stripe cannot pay out to is said before Continue.
 */
function browserCountry(): string | null {
  try {
    const region = new Intl.Locale(navigator.language || "").maximize().region
    return region && countryOf(region) ? region : null
  } catch {
    /* an old browser: no guess */
    return null
  }
}

/*
 * WHICH COUNTRY THE FIELD STARTS ON. An account the seller chose the country
 * of starts on that country. An account nobody chose (most of them opened in
 * Romania before this step existed, lib/payments/stripe/account-country) never
 * does. Otherwise, in this order (round 25, the owner's): where the seller is
 * browsing from (Vercel's x-vercel-ip-country, on the overview as
 * detectedCountry), the country on their profile, then the browser's
 * language region. A seller in Germany is not one Continue away from
 * Stripe's Romanian form again, and a seller who never filled in a profile
 * still starts on their own country.
 */
function guessCountry(data: Overview): string {
  const sc = data.setupCountry
  if (sc?.country && sc.chosen === true) return countryLabel(sc.country)
  const known = data.detectedCountry || data.prefill?.country || browserCountry() || (sc?.chosen === false ? null : sc?.country || data.payoutHint?.country)
  return known ? countryLabel(known) : ""
}

/** What the server said about the country Continue was pressed on. */
type CountryProblem = { message: string; code: string | null }

/** "Euro" for EUR in the dashboard's language; the code alone when the browser has no name for it. */
function payoutLine(plan: PayoutPlan, name: string): string | null {
  const line = payoutPlanLine(plan, name)
  if (!line || !plan.currency) return line
  const named = currencyName(plan.currency)
  return named && named !== plan.currency ? line.replace(`in ${plan.currency} at`, `in ${named} (${plan.currency}) at`) : line
}

function CountryStep({ data, initial = null, problem, onChoose, onCancel }: { data: Overview; initial?: string | null; problem: CountryProblem | null; onChoose: (code: string) => void; onCancel: () => void }) {
  const [countryName, setCountryName] = React.useState(() => (initial ? countryLabel(initial) : guessCountry(data)))
  const [tried, setTried] = React.useState(false)
  const code = countryOf(countryName)
  const platform = data.platformCountry ?? null
  /*
   * What this country gets, decided in the browser from the same function
   * the server uses (lib/payments/stripe/payout-regions payoutPlan): the
   * account path, the currency, or why it is not open and what to do. When
   * the platform's country is not known yet the server decides on Continue.
   */
  const plan = code && platform ? payoutPlan(platform, code, data.settlementCountries ?? []) : null
  const blocked = !!plan && plan.route === "unsupported"
  /* The server refused this very country (a country the owner listed before Stripe turned it on): the same way out as one known in advance. */
  const refused = !blocked && problem?.code === "country_unsupported" && !!code && code === initial
  /* The account already there, while nothing has been sent on it: choosing another country replaces it. */
  const startedIn = data.setupCountry?.changeable ? data.setupCountry.country : null
  const restarts = !!startedIn && !!code && code !== startedIn
  const [asked, setAsked] = React.useState<{ code: string; state: "sending" | "sent" | "failed" } | null>(null)
  const askedHere = asked && asked.code === code ? asked.state : null
  /* Stripe's script starts downloading while the seller reads the question. */
  React.useEffect(() => warmStripeConnect(), [])
  const notify = async () => {
    if (!code) return
    setAsked({ code, state: "sending" })
    try {
      await post("notify-country", { country: code })
      setAsked({ code, state: "sent" })
    } catch {
      setAsked({ code, state: "failed" })
    }
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!code) return
    if (blocked || refused) {
      if (askedHere !== "sent" && askedHere !== "sending") void notify()
      return
    }
    onChoose(code)
  }
  const shut = blocked || refused
  return (
    <form onSubmit={submit} noValidate data-setup-country="" data-started-in={startedIn ?? undefined} data-payout-route={plan?.route} className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 space-y-4 px-5 sm:px-7">
        <div>
          <label htmlFor="payout-country" className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{tt("Where is your bank account?")}</label>
          <CountryPicker
            id="payout-country"
            value={countryName}
            onChange={(name) => {
              setCountryName(name)
              setAsked(null)
            }}
            sheetZIndex={SHEET_Z}
            fieldClassName="rounded-[10px] border-[#e3e5e8] text-[16px] shadow-none sm:h-10 sm:rounded-lg sm:text-[14px]"
          />
          {tried && !code ? (
            <span className="mt-1.5 block text-[12px] text-[#c4290c]">{tt("Choose a country.")}</span>
          ) : restarts && startedIn && code && !shut ? (
            <span data-setup-restarts="" className="mt-1.5 block text-[12px] leading-[17px] text-[#6b7280]">
              {tt("Your setup was started for {from}. Continuing with {to} starts it again there.", { from: countryLabel(startedIn), to: countryLabel(code) })}
            </span>
          ) : shut ? null : (
            <span data-payout-plan="" className="mt-1.5 block text-[12px] leading-[17px] text-[#6b7280]">
              {plan && code ? payoutLine(plan, countryLabel(code)) : tt("Your payouts go to a bank in this country, in its currency. It can't be changed once setup is sent.")}
            </span>
          )}
        </div>
        {blocked && code && plan ? (
          /* Not something the seller did wrong: a plain note, not the red of a refused field. */
          <p data-payout-closed={plan.blocker ?? undefined} className="rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] px-3 py-2.5 text-[13px] leading-5 text-[#1a1a2e]">
            {cannotPayOutLine(countryLabel(code), plan.blocker ?? "no_stripe")}
          </p>
        ) : problem ? (
          <ErrorLine message={problem.message} />
        ) : null}
        {shut && askedHere === "sent" ? (
          <p data-country-asked="" className="text-[13px] leading-5 text-[#1a1a2e]">{tt("Noted. We'll email you when payouts open in {country}.", { country: countryLabel(code) })}</p>
        ) : shut && askedHere === "failed" ? (
          <p className="text-[13px] leading-5 text-[#c4290c]">{tt("That could not be saved just now. Try again, or write to support@storelib.com.")}</p>
        ) : null}
      </div>
      <Footer>
        <button type="button" className={SECONDARY} onClick={onCancel}>{shut && askedHere === "sent" ? tt("Close") : tt("Cancel")}</button>
        {shut ? (
          <button type="submit" data-notify-country="" className={PRIMARY} disabled={askedHere === "sending" || askedHere === "sent"}>
            {askedHere === "sent" ? tt("We'll let you know") : tt("Tell me when it opens")}
          </button>
        ) : (
          <button type="submit" className={PRIMARY}>{tt("Continue")}</button>
        )}
      </Footer>
    </form>
  )
}

/* What a failed start offers: the one next step that can work. */
function SetupProblemView({ message, code, onRetry, onClose }: { message: string; code: string | null; onRetry: () => void; onClose: () => void }) {
  const retry = code === "retry" || code === null
  return (
    <div role="alert" data-setup-problem={code ?? "unknown"} className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Payouts are not set up yet")}</p>
      <p className="mx-auto mt-1.5 max-w-[420px] text-[14px] leading-5 text-[#6b7280]">{message}</p>
      <div className="mt-5 flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
        {retry ? (
          <>
            <button type="button" className={SECONDARY} onClick={onClose}>{tt("Close")}</button>
            <button type="button" className={PRIMARY} onClick={onRetry}>{tt("Try again")}</button>
          </>
        ) : (
          <>
            <button type="button" className={SECONDARY} onClick={onClose}>{tt("Close")}</button>
            <a href="mailto:support@storelib.com?subject=Payouts%20setup" className={cn(PRIMARY, "inline-flex items-center justify-center")}>{tt("Email support")}</a>
          </>
        )}
      </div>
    </div>
  )
}

/*
 * THE COUNTRY, EVERY TIME IT CAN STILL CHANGE. An account with something
 * sent on it resumes on Stripe's form where it was left. An account nothing
 * was sent on asks the country first, prefilled, because that is the account
 * a seller from before the country step has (in Romania, lib/payments/stripe/account-country)
 * and the only time a wrong country can still be put right. While the
 * question is on screen Stripe's script downloads, and for an account whose
 * country the seller already chose, its form's session is made too: Continue
 * on the same country opens the form with nothing left to wait for.
 */
function SetupEmbed({ data, onData, onExit, onCancel, bankOnly = false }: { data: Overview; onData: (next: Overview) => void; onExit: () => void | Promise<void>; onCancel: () => void; bankOnly?: boolean }) {
  const hasAccount = (data.beat ?? "personal") !== "personal"
  const sc = data.setupCountry
  /* Decided once per open: the overview that comes back from start must not take the question away mid-step. */
  const asks = React.useRef(!bankOnly && (!hasAccount || sc?.changeable === true))
  /* The server said the account's country was never chosen: Continue must go through start, even on the same country. */
  const mustStart = React.useRef(false)
  /* An account made as a business keeps that type: Stripe cannot change it once anything is sent. */
  const kind = data.kind === "business" ? "business" : "individual"
  const [ready, setReady] = React.useState(!asks.current)
  const [country, setCountry] = React.useState<string | null>(null)
  const [lastChoice, setLastChoice] = React.useState<string | null>(null)
  const [countryProblem, setCountryProblem] = React.useState<CountryProblem | null>(null)
  const [error, setError] = React.useState<{ message: string; code: string | null } | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    if (!asks.current || !hasAccount || sc?.chosen !== true) return
    prefetchAccountSession("stripe_onboarding")
    // Once per open, while the country is asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  React.useEffect(() => {
    if (!asks.current || !country) return
    /* The seller's own country, already on the account: nothing to change. */
    if (hasAccount && sc?.chosen === true && sc.country === country && !mustStart.current) {
      setReady(true)
      return
    }
    /* Another country replaces the account: a session made for the old one is no use. */
    if (sc?.country && sc.country !== country) dropAccountSession()
    let gone = false
    void (async () => {
      try {
        const next = await post<Overview>("start", { agree: true, kind, country, session: true })
        if (gone) return
        const { session, ...view } = next
        if (session) primeAccountSession("stripe_onboarding", session)
        mustStart.current = false
        onData(view)
        setReady(true)
      } catch (err) {
        if (gone) return
        const message = safe(err instanceof Error ? err.message : tt("We could not start setup just now."))
        const code = codeOf(err)
        /* The country is the problem: back to the question, with the answer under it. */
        if (code === "country_unsupported" || code === "country_required") {
          setCountryProblem({ message, code })
          setCountry(null)
          return
        }
        setError({ message, code })
      }
    })()
    return () => {
      gone = true
    }
    // The account is opened once per Continue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, country])
  useWhenPayoutsOn(ready, onData, onExit)
  if (error) {
    return <SetupProblemView message={error.message} code={error.code} onClose={onCancel} onRetry={() => { setError(null); setAttempt((n) => n + 1) }} />
  }
  if (asks.current && !country) {
    return <CountryStep data={data} initial={lastChoice} problem={countryProblem} onCancel={onCancel} onChoose={(code) => { setCountryProblem(null); setLastChoice(code); setCountry(code) }} />
  }
  if (!ready) {
    return (
      <div className="flex w-full flex-1 flex-col px-5 sm:px-7" aria-live="polite">
        <StripeFormSkeleton label={tt("Opening your payments account")} />
      </div>
    )
  }
  return (
    <div className="flex min-h-full w-full flex-1 flex-col" data-id-embed="">
      <StripeConnectEmbedded
        className="w-full px-3 sm:px-5"
        purpose={bankOnly ? "stripe_management" : "stripe_onboarding"}
        collection={bankOnly ? BANK_COLLECTION : SETUP_COLLECTION}
        publishableKey={data.stripe?.publishableKey ?? null}
        onSessionProblem={(code) => {
          if (code !== "country_required" || bankOnly) return false
          /* An account whose country nobody chose: the question, not Stripe's form. */
          asks.current = true
          mustStart.current = true
          setReady(false)
          setCountry(null)
          return true
        }}
        onExit={() => void onExit()}
      />
    </div>
  )
}

/** How often setup asks whether payouts are on, while the tab is visible. */
const PAYOUTS_POLL_MS = 4000
/** How long setup keeps asking before it stops: 15 minutes. */
const PAYOUTS_POLL_LIMIT_MS = 15 * 60_000

function useWhenPayoutsOn(ready: boolean, onData: (next: Overview) => void, onExit: () => void | Promise<void>) {
  const tell = React.useRef(onData)
  const leave = React.useRef(onExit)
  tell.current = onData
  leave.current = onExit
  React.useEffect(() => {
    if (!ready) return
    /*
      Asks every PAYOUTS_POLL_MS while the tab is on screen, and only then: a
      hidden tab (another tab, the phone locked) asks nothing, and coming back
      asks at once. After PAYOUTS_POLL_LIMIT_MS of asking it stops; Stripe's
      own exit and a reopened panel still read the state.
    */
    let gone = false
    let busy = false
    let timer: number | null = null
    const stopAt = Date.now() + PAYOUTS_POLL_LIMIT_MS
    const stop = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
    }
    const schedule = () => {
      stop()
      if (gone || document.hidden || Date.now() >= stopAt) return
      timer = window.setTimeout(() => void look(), PAYOUTS_POLL_MS)
    }
    const look = async () => {
      if (gone || busy || document.hidden || Date.now() >= stopAt) return
      busy = true
      try {
        const next = await post<Overview>("refresh")
        if (gone) return
        tell.current(next)
        if (outcomeOf(statusOf(next)) === "done") {
          gone = true
          void leave.current()
          return
        }
      } catch {
        /* The form stays up. The next check asks again. */
      } finally {
        busy = false
      }
      schedule()
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else void look()
    }
    document.addEventListener("visibilitychange", onVisibility)
    schedule()
    return () => {
      gone = true
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [ready])
}

/**
 * SETUP IN THE PHONE APP. Storelib's own steps on this page. Stripe's
 * embedded form opens connect.stripe.com in the system browser, so it is
 * not mounted here.
 */
function InAppSetup({
  mode,
  step,
  data,
  openCount,
  onClose,
  onData,
  go,
  settle,
  skipDetails,
  skipId,
  askId,
}: {
  mode: SetupMode
  step: Step
  data: Overview
  openCount: number
  onClose: () => void
  onData: (next: Overview) => void
  go: (next: Step) => void
  settle: (sent: Overview, left: DetailsForm | null) => void
  skipDetails: () => void
  skipId: () => void
  askId: () => void
}) {
  if (mode === "bank") {
    return <BankForm onBack={onClose} onData={onData} onDone={(sent) => settle(sent, null)} />
  }
  const fieldsOnly = mode !== "setup"
  if (fieldsOnly) {
    return (
      <DetailsStep
        key={`native-fields-${openCount}`}
        only="details"
        onBack={onClose}
        onData={onData}
        onNext={(left, sent) => {
          if (sent) settle(sent, left)
        }}
      />
    )
  }
  if (step === 0) {
    return (
      <AccountStep
        key={`native-account-${openCount}`}
        data={data}
        onBack={onClose}
        onDone={(next) => {
          onData(next)
          go(1)
        }}
      />
    )
  }
  if (step === 2) {
    return (
      <DetailsStep
        key={`native-id-${openCount}`}
        only="id"
        onBack={() => go(1)}
        onData={onData}
        onAsking={askId}
        onEmpty={skipId}
        onNext={(left, sent) => {
          if (sent) settle(sent, left)
          else go(3)
        }}
      />
    )
  }
  if (step === 3) {
    return <BankForm key={`native-bank-${openCount}`} onBack={() => go(2)} onData={onData} onDone={(sent) => settle(sent, null)} />
  }
  return (
    <DetailsStep
      key={`native-about-${openCount}`}
      only="details"
      onBack={() => go(0)}
      onData={onData}
      onEmpty={skipDetails}
      onNext={(left, sent) => {
        if (sent) settle(sent, left)
      }}
    />
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
      setError(safe(err instanceof Error ? err.message : tt("We could not start setup just now.")))
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
            <span className="text-[13px] font-medium text-[#1a1a2e]">{tt("Where are you based?")}</span>
            <InfoTip label={tt("Country")}>
              {hasAccount
                ? tt("Locked once your payments account is created. It sets your payout currency and tax rules. Disconnect below and start over if you chose the wrong country.")
                : tt("Where you live. It sets your payout currency and which ID Stripe asks for, and cannot be changed after you continue.")}
            </InfoTip>
          </div>
          {hasAccount && data.payoutHint?.country ? (
            <div className="flex h-11 items-center gap-2 rounded-[10px] border border-[#e3e5e8] bg-[#f9fafb] px-3.5 text-[14px] text-[#1a1a2e] sm:h-10 sm:rounded-lg">
              <CountryFlag code={data.payoutHint.country} />
              <span className="flex-1 truncate">{countryLabel(data.payoutHint.country)}</span>
              <Lock className="h-3.5 w-3.5 text-[#9ca3af]" aria-label={tt("Locked")} />
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
          <Field label={tt("First name")} error={issue("firstName")} tip={kind === "business" ? tt("The first name of the person running the business, as on their ID.") : tt("Exactly as on your passport or ID card, with any middle names.")}>
            <input className={cn(FIELD, issue("firstName") && FIELD_BAD)} value={firstName} placeholder={tt("First name")} autoComplete="given-name" onBlur={() => mark("firstName")} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label={tt("Last name")} error={issue("lastName")} tip={tt("Your last name exactly as on your ID, including any second last name.")}>
            <input className={cn(FIELD, issue("lastName") && FIELD_BAD)} value={lastName} placeholder={tt("Last name")} autoComplete="family-name" onBlur={() => mark("lastName")} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
      </div>

      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>{tt("Cancel")}</button>
        <button type="submit" className={PRIMARY} disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? tt("Saving") : tt("Continue")}
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

const MONTHS = [msg("January"), msg("February"), msg("March"), msg("April"), msg("May"), msg("June"), msg("July"), msg("August"), msg("September"), msg("October"), msg("November"), msg("December")]


function useDetailsForm() {
  const [form, setForm] = React.useState<DetailsForm | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    setError(null)
    try {
      setForm(await post<DetailsForm>("details-form", {}))
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : tt("We could not load this step.")))
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
        <button type="button" className={cn(SECONDARY, "mt-4")} onClick={onRetry}>{tt("Try again")}</button>
      </div>
    )
  }
  return (
    <Shimmer className="flex flex-1 flex-col gap-4 px-5 sm:px-7" label={tt("Loading")}>
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
        <span aria-label={tt("Loading")} className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/60" />
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
      setError(safe(err instanceof Error && err.message !== "too large" && err.message !== "unreadable" ? err.message : tt("That photo could not be used. Take it again in good light.")))
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
          setError(tt("Enter your {value}, or verify with your ID instead.", { value: form.idNumber.label.split(" (")[0] }))
          return
        }
        setBusy(true)
        setError(null)
        try {
          const res = await post<{ form: DetailsForm; overview: Overview }>("details", { idNumber })
          onData(res.overview)
          onNext(res.form, res.overview)
        } catch (err) {
          setError(safe(err instanceof Error ? err.message : tt("That could not be saved. Try again.")))
        } finally {
          /* Whether the parent moves on or keeps this step, the button stops spinning. */
          setBusy(false)
        }
        return
      }
      if (uploading) return
      if (form.needs.fields.includes("document") && !docGivenAtOpen && !front) {
        setIdProblem(idDevice === "desk" ? tt("Scan the code with your phone and photograph your ID.") : idPhase === "back" ? tt("Take the back of your ID, or say it's a passport.") : tt("Take a photo of your ID to carry on."))
        return
      }
      if (missingProof) return setError(tt("Add a photo of your ID that shows your address."))
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
      setError(tt("Check the fields marked in red."))
      return
    }
    if (missingProof) return setError(tt("Add a document that shows your address."))
    if (missingDoc) return setError(idEither ? (only === "details" ? tt("Enter your {value}.", { value: form.idNumber.label.split(" (")[0] }) : tt("Take a photo of your ID, or enter your {value} instead.", { value: form.idNumber.label.split(" (")[0] })) : tt("Add a photo of the front of your ID."))
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
      setError(safe(err instanceof Error ? err.message : tt("Those details were not saved. Try again.")))
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
      else setIdProblem(safe(message || tt("That photo could not be used. Take it again.")))
      setIdState("idle")
    } finally {
      setUploading(null)
    }
  }

  const sendingId = uploading === "document-front" || uploading === "document-back"
  const idPhoto = has("document")
    ? (
          <div className="space-y-2" data-id-photo="storelib">
            {only === "id" ? null : <span className="block text-[13px] font-medium text-[#1a1a2e]">{tt("Verify who you are")}</span>}
            {idVerified ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[#abefc6] bg-[#f6fef9] px-4 py-3.5" data-identity="done">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dcfae6] text-[#067647]">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-[#1a1a2e]">{idState === "done" ? tt("Verified") : tt("ID sent")}</span>
                  <span className="block text-[12.5px] text-[#6b7280]">{idState === "done" ? tt("Stripe has your ID.") : tt("Stripe is checking it. This usually takes under a minute.")}</span>
                </span>
              </div>
            ) : idDevice === null ? (
              <div className="flex h-[88px] items-center justify-center rounded-2xl border border-[#e3e5e8] bg-white">
                <span aria-label={tt("Loading")} className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/60" />
              </div>
            ) : idDevice === "desk" ? (
              <div className="flex flex-col items-center rounded-2xl border border-[#e3e5e8] bg-white px-5 py-6 text-center" data-id-phone-scan="">
                <IdHandoffQr url={handoffUrl} />
                <span className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#1a1a2e]">
                  <Smartphone className="h-4 w-4" />
                  {tt("Scan with your phone")}
                </span>
                <span className="mt-1.5 max-w-[300px] text-[13px] leading-[18px] text-[#6b7280]">
                  {tt("Point your camera at the code. Photograph your ID on your phone and it goes straight to Stripe. Storelib never sees the document.")}
                </span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-[#6b7280]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#067647]" />
                  {tt("This page updates when the photo is in")}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openIdCamera(idPhase === "back" ? "back" : "front")}
                disabled={sendingId}
                data-id-camera-open=""
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-4 text-left outline-none transition-[border-color,background-color,scale] duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:cursor-default",
                  tried && missingDoc ? "border-[#f3b8ab] bg-[#fff8f6]" : "border-[#e3e5e8] bg-white hover:border-[#c9ccd3] hover:bg-[#fafafb]",
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a1a2e] text-white">
                  {sendingId ? <Spinner /> : <Camera className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-[#1a1a2e]">
                    {sendingId ? (sentPct >= 99 ? tt("Waiting for Stripe") : tt("Sending {sentPct}%", { sentPct })) : idPhase === "back" ? tt("Take the back") : tt("Take a photo of your ID")}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-[17px] text-[#6b7280]">
                    {sendingId
                      ? tt("Stripe is saving the photo. If it doesn't answer, take it again.")
                      : idPhase === "back"
                        ? tt("The other side of the card. A passport has no back.")
                        : tt("Your camera opens. Front, then the back. Storelib never sees the document.")}
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
                {tt("It's a passport")}
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
            title={tt("Stripe needs a little more")}
            line={tt("To keep your payouts going, Stripe asks for this now{value}. It takes a minute.", { value: form.dueBy ? tt(", by {date}", { date: new Date(form.dueBy).toLocaleDateString(appLocale(), zoned({ day: "numeric", month: "long" })) }) : "" })}
          />
        ) : only === "id" ? (
          <StepIntro title={tt("Verify your ID")} line={tt("Stripe checks your ID to confirm you are who you say you are. It goes straight to Stripe, and Storelib never sees or keeps the document.")} />
        ) : (
          <StepIntro title={tt("Your details")} line={tt("Only what Stripe needs to verify you in your country. It goes straight to Stripe and Storelib never keeps it.")} />
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
            <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{tt("Date of birth")}</span>
            <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
              <input className={cn(FIELD, tried && !dob.day && FIELD_BAD)} inputMode="numeric" placeholder={tt("Day")} maxLength={2} autoComplete="bday-day" aria-label={tt("Day")} value={dob.day} onChange={(e) => setDob({ ...dob, day: e.target.value.replace(/\D/g, "") })} />
              <span className="relative block">
                <select className={cn(FIELD, "cursor-pointer appearance-none pr-8", !dob.month && "text-[#9ca3af]", tried && !dob.month && FIELD_BAD)} aria-label={tt("Month")} autoComplete="bday-month" value={dob.month} onChange={(e) => setDob({ ...dob, month: e.target.value })}>
                  <option value="">{tt("Month")}</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1)}>{tt(m)}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              </span>
              <input className={cn(FIELD, tried && !/^\d{4}$/.test(dob.year) && FIELD_BAD)} inputMode="numeric" placeholder={tt("Year")} maxLength={4} autoComplete="bday-year" aria-label={tt("Year")} value={dob.year} onChange={(e) => setDob({ ...dob, year: e.target.value.replace(/\D/g, "") })} />
            </div>
            <span className="mt-1.5 block text-[12px] text-[#6b7280]">{tt("You need to be 18 or older to be paid out.")}</span>
          </div>
        ) : null}

        {has("address") ? (
          <div className="space-y-3">
            <span className="block text-[13px] font-medium text-[#1a1a2e]">{tt("Home address")}</span>
            <input className={cn(FIELD, tried && !address.line1.trim() && FIELD_BAD)} placeholder={tt("Street and number")} autoComplete="address-line1" aria-label={tt("Street and number")} value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />
            <input className={FIELD} placeholder={tt("Apartment, floor (optional)")} autoComplete="address-line2" aria-label={tt("Apartment or floor")} value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} />
            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <input className={cn(FIELD, tried && !address.city.trim() && FIELD_BAD)} placeholder={tt("City")} autoComplete="address-level2" aria-label={tt("City")} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
              <input className={cn(FIELD, tried && !address.postalCode.trim() && FIELD_BAD)} placeholder={tt("Postal code")} autoComplete="postal-code" aria-label={tt("Postal code")} value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} />
            </div>
            {has("state") ? (
              <input className={cn(FIELD, tried && !address.state.trim() && FIELD_BAD)} placeholder={tt("State, county or region")} autoComplete="address-level1" aria-label={tt("State, county or region")} value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} />
            ) : null}
            <span className="block text-[12px] text-[#6b7280]">{tt("Where you live. A PO box or military address cannot be verified.")}</span>
          </div>
        ) : null}

        {has("phone") ? (
          <Field label={tt("Phone number")} error={issue("phone", phone.replace(/\D/g, "").length < 7, tt("Enter your phone number, with the country code."))}>
            <PhoneField country={form.country} value={phone} onChange={setPhone} />
          </Field>
        ) : null}

        {has("nationality") ? (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{tt("Nationality")}</span>
            <CountryPicker value={nationality} onChange={setNationality} sheetZIndex={SHEET_Z} fieldClassName="rounded-[10px] border-[#e3e5e8] text-[16px] shadow-none sm:h-10 sm:rounded-lg sm:text-[14px]" />
            {tried && !countryOf(nationality) ? <span className="mt-1.5 block text-[12px] text-[#c4290c]">{tt("Choose your nationality.")}</span> : null}
          </div>
        ) : null}

        {idEither ? idPhoto : null}

        {idShown ? (
          <Field
            label={form.idNumber.label}
            hint={
              idEither
                ? tt("Not needed if you add a photo of your ID. {hint}", { hint: form.idNumber.hint })
                : front
                  ? tt("Your ID photo is in, but Stripe still asks for this number in {value}. {hint}", { value: countryLabel(form.country) ?? tt("your country"), hint: form.idNumber.hint })
                  : form.idNumber.hint
            }
            error={issue("idNumber", idBad, tt("Enter your ID number exactly as on your document."))}
          >
            <input className={FIELD} inputMode={form.country === "US" || form.country === "RO" ? "numeric" : undefined} autoComplete="off" spellCheck={false} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          </Field>
        ) : has("idNumber") && idEither && !front ? (
          <button type="button" onClick={() => setTypeIdInstead(true)} className="-mt-2 text-left text-[13px] font-medium text-[#4b5563] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline">
            {tt("Rather type your")} {form.idNumber.label.split(" (")[0]} {tt("instead?")}
          </button>
        ) : null}

        {!idEither ? idPhoto : null}

        {only === "id" && idEither && !front && !typeIdInstead ? (
          <button type="button" onClick={() => setTypeIdInstead(true)} className="-mt-1 text-left text-[13px] font-medium text-[#4b5563] underline-offset-2 outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline" data-id-number-instead="">
            {tt("Use my")} {form.idNumber.label.split(" (")[0]} {tt("instead")}
          </button>
        ) : null}

        {has("ssnLast4") ? (
          <Field label={tt("Last 4 digits of your SSN")} hint={tt("Stripe asks for these four digits to confirm who you are.")} error={issue("ssnLast4", !/^\d{4}$/.test(ssnLast4), tt("Enter the last four digits of your SSN."))}>
            <input className={FIELD} inputMode="numeric" maxLength={4} autoComplete="off" value={ssnLast4} onChange={(e) => setSsnLast4(e.target.value.replace(/\D/g, ""))} />
          </Field>
        ) : null}

        {has("proofOfAddress") && !(has("document") && !idVerified && !docGivenAtOpen) ? (
          <div className="space-y-2">
            <span className="block text-[13px] font-medium text-[#1a1a2e]">{tt("One more photo")}</span>
            <span className="block text-[12px] leading-[18px] text-[#6b7280]">{tt("An ID that shows your address. The same camera, then you're done.")}</span>
            <button
              type="button"
              onClick={() => (idDevice === "phone" ? openIdCamera("front", "proofOfAddress") : proofPicker.current?.click())}
              disabled={!!uploading}
              data-proof-add=""
              className={cn(
                "flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border px-4 py-4 text-left outline-none transition-[border-color,background-color,scale] duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15",
                uploaded["proofOfAddress-front"] ? "border-[#abefc6] bg-[#f6fef9]" : tried && missingProof ? "border-[#f3b8ab] bg-[#fff8f6]" : "border-[#e3e5e8] bg-white hover:border-[#c9ccd3] hover:bg-[#fafafb]",
              )}
            >
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", uploaded["proofOfAddress-front"] ? "bg-[#dcfae6] text-[#067647]" : "bg-[#1a1a2e] text-white")}>
                {uploading === "proofOfAddress-front" ? <Spinner dark={!!uploaded["proofOfAddress-front"]} /> : uploaded["proofOfAddress-front"] ? <Check className="h-5 w-5" strokeWidth={3} /> : <Camera className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-[#1a1a2e]">
                  {uploading === "proofOfAddress-front" ? tt("Sending to Stripe") : uploaded["proofOfAddress-front"] ? tt("Added") : tt("Add a photo of your ID")}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-[17px] text-[#6b7280]">
                  {uploaded["proofOfAddress-front"] ? tt("Tap to replace it.") : tt("A clear colour photo. It goes straight to Stripe.")}
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
            <span className="text-[13px] leading-[19px] text-[#4b5563]">{tt("I hold, or have held in the last year, a prominent public role. Leave it unticked if not.")}</span>
          </label>
        ) : null}

        {bankHere ? (
          <div className="space-y-4 border-t border-[#f1f2f4] pt-5" data-details-bank="">
            <div>
              <span className="block text-[15px] font-semibold text-[#1a1a2e]">{tt("Where should we send your money?")}</span>
              <span className="mt-0.5 block text-[12.5px] text-[#6b7280]">{bank.currency ? tt("Payouts arrive in {currency}.", { currency: bank.currency }) : tt("The account your payouts go to.")}</span>
            </div>
            <Field label={tt("Account holder name")} error={tried && holderName.trim().length < 2 ? tt("Enter the name on the account.") : undefined}>
              <input className={FIELD} autoComplete="name" value={holderName} onChange={(e) => setHolder(e.target.value)} />
            </Field>
            {bank.kind === "iban" ? (
              <Field label="IBAN" error={tried && !ibanLooksValid(iban, form.country) ? tt("That IBAN does not look right. Check it in your bank app.") : undefined}>
                <input className={cn(FIELD, "font-mono tracking-[0.02em]")} autoComplete="off" spellCheck={false} autoCapitalize="characters" placeholder={`${form.country}00 0000 0000 0000 0000`} value={iban} onChange={(e) => setIban(formatIban(e.target.value))} />
              </Field>
            ) : (
              <>
                <Field label={bank.routingLabel ?? tt("Bank code")} error={tried && !!bank.routingPattern && !new RegExp(bank.routingPattern).test(routing.replace(/\s/g, "").toUpperCase()) ? tt("Check your {value}.", { value: (bank.routingLabel ?? "bank code").toLowerCase() }) : undefined}>
                  <input className={FIELD} autoComplete="off" spellCheck={false} inputMode={form.country === "IN" ? undefined : "numeric"} value={routing} onChange={(e) => setRouting(e.target.value)} />
                </Field>
                <Field label={bank.accountLabel ?? tt("Account number")} error={tried && accountNumber.replace(/[\s-]/g, "").length < 4 ? tt("Enter your account number.") : undefined}>
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
              {tt("I agree to Storelib's")}{" "}
              <a href="/terms" onClick={(e) => (e.preventDefault(), openInApp(`${window.location.origin}/terms`))} className="font-medium text-[#1a1a2e] underline underline-offset-2">{tt("Terms")}</a>{" "}
              {tt("and the")}{" "}
              <a href={form.agreementUrl} onClick={(e) => (e.preventDefault(), openInApp(form.agreementUrl))} className="font-medium text-[#1a1a2e] underline underline-offset-2">{tt("Stripe Connected Account Agreement")}</a>{tt(", and confirm these details are true.")}
            </span>
          </label>
        ) : null}


      </div>

      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>{tt("Back")}</button>
        <button type="submit" className={PRIMARY} disabled={busy || !!uploading}>
          {busy || uploading ? <Spinner /> : null}
          {busy ? tt("Saving") : uploading && only !== "id" ? (sentPct >= 99 ? tt("Waiting for Stripe") : tt("Sending {sentPct}%", { sentPct })) : tt("Continue")}
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
        onDenied={(why) => {
          setCameraSide(null)
          setIdProblem(tt("Allow the camera for Storelib, then take the photo here."))
          /* In the app, the phone's Settings in one tap (lib/native-permissions). A browser keeps the line above. */
          if (why === "denied") showAccessSheet(mediaOffSheet("camera"))
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
function BankForm({ failed = false, onBack, backLabel = tt("Back"), onDone, onData }: { failed?: boolean; onBack: () => void; backLabel?: string; onDone: (sent: Overview) => void; onData: (next: Overview) => void }) {
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
  const title = failed ? tt("Your payout account needs attention") : bank.last4 ? tt("Change bank account") : tt("Add your bank account")
  const line = failed ? tt("A payout didn't go through. Add the account you want paid into.") : bank.last4 ? tt("The new account is used for your next payout.") : tt("Where your payouts are sent.")
  const name = holder ?? bank.holderName
  const ibanOk = ibanLooksValid(iban, form.country)
  const routingOk = !bank.routingPattern || new RegExp(bank.routingPattern).test(routing.replace(/\s/g, "").toUpperCase())

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (busy) return
    if (name.trim().length < 2 || (bank.kind === "iban" ? !ibanOk : accountNumber.replace(/[\s-]/g, "").length < 4 || !routingOk)) {
      setError(tt("Check the fields marked in red."))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await post<{ form: DetailsForm; overview: Overview }>("bank", bank.kind === "iban" ? { holderName: name, iban, currency } : { holderName: name, accountNumber, routingNumber: routing, currency })
      onData(res.overview)
      onDone(res.overview)
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : tt("That bank account was not saved. Try again.")))
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
            <span className="text-[13.5px] text-[#4b5563]">{tt("Current account ending in")} <span className="font-medium tabular-nums text-[#1a1a2e]">{bank.last4}</span></span>
          </div>
        ) : null}
        {currencies.length > 1 ? (
          <div className="space-y-2">
            <span className="block text-[13px] font-medium text-[#1a1a2e]">{tt("Payout currency")}</span>
            <div role="radiogroup" aria-label={tt("Payout currency")} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${currencies.length}, minmax(0, 1fr))` }}>
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
                    <span className="truncate text-[12px] text-[#6b7280]">{cur === currencies[0] ? tt("Local") : currencyName(cur)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        <Field label={tt("Account holder name")} hint={tt("Your name, as your bank has it.")} error={tried && name.trim().length < 2 ? tt("Enter the name on the account.") : undefined}>
          <input className={FIELD} autoComplete="name" value={name} onChange={(e) => setHolder(e.target.value)} />
        </Field>
        {bank.kind === "iban" ? (
          <Field label="IBAN" hint={currency ? tt("Your {currency} account. Payouts arrive in {currency2}.", { currency, currency2: currency }) : undefined} error={tried && !ibanOk ? tt("That IBAN does not look right. Check it in your bank app.") : undefined}>
            <input className={cn(FIELD, "font-mono tracking-[0.02em]")} autoComplete="off" spellCheck={false} autoCapitalize="characters" placeholder={`${form.country}00 0000 0000 0000 0000`} value={iban} onChange={(e) => setIban(formatIban(e.target.value))} />
          </Field>
        ) : (
          <>
            <Field label={bank.routingLabel ?? tt("Bank code")} error={tried && !routingOk ? tt("Check your {value}.", { value: (bank.routingLabel ?? "bank code").toLowerCase() }) : undefined}>
              <input className={FIELD} autoComplete="off" spellCheck={false} inputMode={form.country === "IN" ? undefined : "numeric"} value={routing} onChange={(e) => setRouting(e.target.value)} />
            </Field>
            <Field label={bank.accountLabel ?? tt("Account number")} hint={currency ? tt("Payouts arrive in {currency}.", { currency }) : undefined} error={tried && accountNumber.replace(/[\s-]/g, "").length < 4 ? tt("Enter your account number.") : undefined}>
              <input className={FIELD} autoComplete="off" spellCheck={false} inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>{backLabel}</button>
        <button type="submit" className={PRIMARY} disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? tt("Saving") : bank.last4 ? tt("Save account") : tt("Add account")}
        </button>
      </Footer>
    </form>
  )
}

/** "Euro", "US dollar": the currency's name in the dashboard's language, or the code when the browser does not know it. */
function currencyName(code: string): string {
  try {
    const name = new Intl.DisplayNames([appLocale()], { type: "currency" }).of(code)
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
      ? { icon: <Check className="h-5 w-5" strokeWidth={3} />, tone: "bg-[#ecfdf3] text-[#067647]", title: tt("Payments active"), line: tt("You're ready to accept payments. Your sales are paid into your balance and you cash out to your bank."), action: tt("Done"), primary: onDone }
      : outcome === "bank"
        ? {
            icon: <Landmark className="h-5 w-5" />,
            tone: "bg-[#fffaeb] text-[#b54708]",
            title: tt("Add your bank account"),
            line: tt("Everything else is done. Add the account your payouts go to and payments switch on."),
            action: tt("Add bank account"),
            primary: onContinue,
          }
        : outcome === "checking"
          ? {
            icon: <Clock className="h-5 w-5" />,
            tone: "bg-[#f4f3ff] text-[#5b4bd5]",
            /* "Checking your ID" when no ID had gone in read as the form having lost something. It is checking the details then. */
            title: what === "id" ? tt("Checking your ID") : tt("Checking your details"),
            line:
              waited >= 15
                ? tt("Stripe is taking a closer look at this one. Nothing more is needed from you, and we'll email you the moment payments are on.")
                : tt("This usually takes a few seconds. You can close this: we'll email you the moment payments are on."),
            action: tt("Done"),
            primary: onDone,
          }
        : {
            icon: <Clock className="h-5 w-5" />,
            tone: "bg-[#fffaeb] text-[#b54708]",
            title: tt("Verification isn't finished"),
            line: tt("Payments turn on once Stripe has verified your identity. It saved what you entered, so you pick up where you left off."),
            action: tt("Continue verification"),
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

