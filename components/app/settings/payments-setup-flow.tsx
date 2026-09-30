"use client"

/**
 * STORELIB PAYMENTS SETUP. A centred panel on a computer and a full screen
 * subpage on a phone: Account (country, type, legal name), Verify (Storelib's
 * own identity fields and ID upload, sent straight to Stripe) and Bank
 * (Storelib's own form; the numbers go from this browser to Stripe as a
 * token and never to Storelib).
 *
 * Stripe's in-page form is drawn only when Stripe asks for something these
 * steps do not know, on an account Storelib runs, where it has no sign-in
 * window. Not a Radix dialog: that form opens its own layer over the page,
 * and a modal focus trap or pointer lock would leave it unclickable.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Check, ChevronLeft, FileText, Info, Landmark, Lock, Upload, X } from "lucide-react"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BirthDateField } from "@/components/app/settings/birth-date-field"
import { CountryPicker, CountryFlag } from "@/components/app/settings/country-picker"
import { StripeConnectEmbedded } from "@/components/app/settings/stripe-connect-embedded"
import { countryLabel, countryOf } from "@/lib/account/country"
import {
  bankFormat,
  bankIssues,
  bankTokenFields,
  personalIssues,
  type BankInput,
  type OnboardingBeat,
} from "@/lib/payments/stripe/onboarding-steps"
import {
  AGREEMENT_URL,
  detailsIssues,
  idNumberCopy,
  type DetailField,
  type DetailsInput,
  type StripeVerificationView,
} from "@/lib/payments/stripe/details-fields"
import type { Overview } from "@/components/app/settings/payments-hub-shared"
import { cn } from "@/lib/utils"

export type SetupMode = "setup" | "bank" | "details"
type Step = 0 | 1 | 2

/* The app's calm field: a light hairline and a soft halo when focused, 16px on a phone so iOS does not zoom. */
export const FIELD =
  "h-11 w-full rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] hover:border-[#d5d8dd] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
const FIELD_COMPACT =
  "h-10 w-full rounded-[10px] border border-[#e3e5e8] bg-white px-3 text-[14px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] hover:border-[#d5d8dd] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-9 sm:rounded-lg sm:text-[13px]"
const FIELD_BAD = "border-[#c4290c] hover:border-[#c4290c] focus:border-[#c4290c] focus:shadow-[0_0_0_3px_rgba(196,41,12,0.1)]"
const PRIMARY = cn(primaryDepth, "h-11 gap-2 rounded-xl px-5 text-[14px] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:rounded-lg")
const SECONDARY = cn(secondaryDepth, "h-11 rounded-xl px-5 text-[14px] sm:h-10 sm:rounded-lg")
const LINK = "font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 transition-colors hover:decoration-[#1a1a2e]"

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

export function stepOfBeat(beat: OnboardingBeat): Step {
  if (beat === "personal") return 0
  if (beat === "bank") return 2
  return 1
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

const EXIT_MS = 220

function Panel({
  open,
  phone,
  compact,
  onClose,
  label,
  children,
}: {
  open: boolean
  phone: boolean
  /** Shorter desktop panel for the Verify step. */
  compact?: boolean
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

  if (!shown || typeof document === "undefined") return null

  if (phone) {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-payments-setup-panel="subpage"
        className={cn(
          "fixed inset-0 z-[1000] flex h-[var(--vv-h,100dvh)] flex-col bg-white ease-sheet [will-change:transform]",
          leaving ? "animate-out slide-out-to-right duration-200" : "animate-in slide-in-from-right duration-300",
        )}
      >
        {children}
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6" data-payments-setup-panel="">
      <div
        aria-hidden
        onClick={onClose}
        className={cn("absolute inset-0 bg-[#0f1115]/45 duration-200 ease-sheet", leaving ? "animate-out fade-out-0" : "animate-in fade-in-0")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_-12px_rgba(15,17,21,0.35),0_2px_8px_rgba(15,17,21,0.08)] duration-200 ease-sheet [will-change:transform,opacity]",
          compact ? "max-h-[min(580px,calc(100dvh-40px))] max-w-[min(520px,calc(100vw-32px))]" : "max-h-[min(760px,calc(100dvh-48px))] max-w-[min(520px,calc(100vw-40px))]",
          leaving ? "animate-out fade-out-0 zoom-out-95" : "animate-in fade-in-0 zoom-in-95",
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* ── small pieces ──────────────────────────────────────────────────────── */

const STEP_LABELS = ["Account", "Verify", "Bank"] as const

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Setup steps">
      {STEP_LABELS.map((label, i) => {
        const done = i < step
        const on = i === step
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

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  const index = options.findIndex((o) => o.value === value)
  return (
    <div role="radiogroup" aria-label={label} className="relative grid h-10 rounded-xl bg-[#f1f2f4] p-1 sm:h-9" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className={cn(
          "absolute bottom-1 left-1 top-1 rounded-[9px] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.10),0_0_0_0.5px_rgba(16,24,40,0.06)] transition-[transform,opacity] duration-300 ease-sheet [will-change:transform]",
          index < 0 && "opacity-0",
        )}
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${Math.max(0, index) * 100}%)` }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "relative z-[1] cursor-pointer select-none rounded-[9px] text-[14px] font-medium outline-none transition-[color,transform] duration-200 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:text-[13px]",
            value === option.value ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Opens and closes its height smoothly, for a field that comes and goes. */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("-mx-[3px] grid transition-[grid-template-rows,opacity] duration-300 ease-sheet", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} aria-hidden={!open}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

function Footer({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 flex shrink-0 items-center justify-between gap-3 border-t border-[#f1f2f4] bg-white px-5 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 [&>*:last-child]:max-sm:flex-1",
        compact ? "mt-3 py-3" : "mt-6 py-4",
      )}
    >
      {children}
    </div>
  )
}

function Spinner({ dark }: { dark?: boolean }) {
  return <span aria-hidden className={cn("h-4 w-4 animate-spin rounded-full border-2", dark ? "border-[#1a1a2e]/15 border-t-[#1a1a2e]" : "border-white/30 border-t-white")} />
}

function SecureLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-[18px] text-[#6b7280]">
      <Lock className="mt-[2px] h-3 w-3 shrink-0" /> <span>{children}</span>
    </p>
  )
}

/* ── the flow ──────────────────────────────────────────────────────────── */

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
  const beat: OnboardingBeat = data.beat ?? "personal"
  const [step, setStep] = React.useState<Step>(() => stepOfBeat(beat))
  const [back, setBack] = React.useState(false)
  const [openCount, setOpenCount] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setBack(false)
    setStep(mode === "bank" ? 2 : stepOfBeat(beat))
    setOpenCount((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode])

  const go = (next: Step) => {
    setBack(next < step)
    setStep(next)
  }

  /** After Verify: the bank if it is still missing, otherwise setup is done. */
  const afterVerify = (next: Overview) => {
    onData(next)
    const nextBeat = next.beat ?? "verification"
    if (nextBeat === "bank" || (!next.payoutDestination && next.payoutHint?.inStorelib && nextBeat !== "verification")) {
      go(2)
      return
    }
    onFinished()
    onClose()
  }

  const title = mode === "bank" ? (data.payoutDestination ? "Update bank account" : "Add bank account") : mode === "details" ? "Account details" : "Set up payments"
  const onBack = mode === "setup" && step > 0 ? () => go((step - 1) as Step) : onClose
  const slide = back ? "slide-in-from-left-4" : "slide-in-from-right-4"
  const panelCompact = !phone && mode === "setup" && step === 1

  React.useEffect(() => {
    if (!open || step !== 1 || mode !== "setup") return
    if (data.verification && data.payoutHint?.inStorelib) return
    void post<Overview>("prepare", {}).then(onData).catch(() => undefined)
  }, [open, step, mode, data.verification, data.payoutHint?.inStorelib, onData])

  return (
    <Panel open={open} phone={phone} compact={panelCompact} onClose={onClose} label={title}>
      {phone ? (
        <div className="shrink-0 border-b border-[#f1f2f4] bg-white pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-1 px-2">
            <button
              type="button"
              aria-label={mode === "setup" && step > 0 ? "Back" : "Close"}
              onClick={onBack}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#1a1a2e] outline-none transition-colors active:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
            >
              <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.25} />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold text-[#1a1a2e]">{title}</h2>
            <span aria-hidden className="w-11" />
          </div>
          {mode === "setup" ? (
            <div className="px-5 pb-3.5">
              <Stepper step={step} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className={cn("flex shrink-0 flex-col px-5 pt-5 sm:px-6 sm:pt-6", panelCompact ? "gap-3 pb-3" : "gap-4 pb-5")}>
          <div className="flex items-center gap-3">
            <h2 className="min-w-0 flex-1 text-[18px] font-semibold leading-6 text-[#1a1a2e]">{title}</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="-mr-1.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f4f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {mode === "setup" ? <Stepper step={step} /> : null}
        </div>
      )}

      <div className={cn("min-h-0 flex-1 overscroll-contain", phone && "pt-5", panelCompact ? "overflow-y-auto sm:overflow-hidden" : "overflow-y-auto")}>
        {mode === "details" ? (
          <DetailsStep key={`details-${openCount}`} data={data} onBack={onClose} onDone={(next) => { onData(next); onFinished(); onClose() }} />
        ) : step === 0 ? (
          <div key={`account-${openCount}`} className={cn("flex min-h-full flex-col animate-in fade-in-0 duration-300 ease-sheet", slide)}>
            <AccountStep
              data={data}
              onBack={onClose}
            onDone={(next) => {
              onData(next)
              go(stepOfBeat(next.beat ?? "verification") === 2 ? 2 : 1)
              void post<Overview>("prepare", {}).then(onData).catch(() => undefined)
            }}
            />
          </div>
        ) : step === 1 ? (
          <div key={`verify-${openCount}`} className={cn("flex min-h-full flex-col animate-in fade-in-0 duration-300 ease-sheet", slide)}>
            <VerifyStep data={data} onData={onData} onBack={() => go(0)} onDone={afterVerify} />
          </div>
        ) : (
          <div key={`bank-${openCount}`} className={cn("flex min-h-full flex-col animate-in fade-in-0 duration-300 ease-sheet", slide)}>
            <BankStep
              data={data}
              showBack={mode === "setup"}
              onBack={() => (mode === "setup" ? go(1) : onClose())}
              onDone={(next) => {
                onData(next)
                onFinished()
                onClose()
              }}
            />
          </div>
        )}
      </div>
    </Panel>
  )
}

/* ── step 1: account ───────────────────────────────────────────────────── */

function AccountStep({ data, onBack, onDone }: { data: Overview; onBack: () => void; onDone: (next: Overview) => void }) {
  const hasAccount = (data.beat ?? "personal") !== "personal"
  const [kind, setKind] = React.useState<"individual" | "business">(data.kind === "business" ? "business" : "individual")
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
    <form onSubmit={submit} noValidate className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 space-y-5 px-5 sm:px-6">
        <ErrorLine message={error} />
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-[#1a1a2e]">Country</span>
            <InfoTip label="Country">
              {hasAccount
                ? "Locked once your payments account is created. It sets your payout currency and tax rules. Disconnect below and start over if you chose the wrong country."
                : "Where you live or your business is registered. It sets your payout currency and cannot be changed after you continue."}
            </InfoTip>
          </div>
          {hasAccount && data.payoutHint?.country ? (
            <div className="flex h-11 items-center gap-2 rounded-[10px] border border-[#e3e5e8] bg-[#f9fafb] px-3.5 text-[14px] text-[#1a1a2e] sm:h-10 sm:rounded-lg">
              <CountryFlag code={data.payoutHint.country} />
              <span className="flex-1 truncate">{countryLabel(data.payoutHint.country)}</span>
              <Lock className="h-3.5 w-3.5 text-[#9ca3af]" aria-label="Locked" />
            </div>
          ) : (
            <div onBlur={() => mark("country")}>
              <CountryPicker value={countryName} onChange={(name) => { setCountryName(name); mark("country") }} />
            </div>
          )}
          {issue("country") ? <span className="mt-1.5 block text-[12px] text-[#c4290c]">{issue("country")}</span> : null}
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-[#1a1a2e]">Selling as</span>
            <InfoTip label="Selling as">Choose Individual if you sell under your own name. Choose Business if you have a registered company.</InfoTip>
          </div>
          <Segmented
            label="Selling as"
            value={kind}
            onChange={setKind}
            options={[
              { value: "individual", label: "Individual" },
              { value: "business", label: "Business" },
            ]}
          />
          <Reveal open={kind === "business"}>
            <div className="px-[3px] pb-[3px] pt-5">
              <Field label="Legal business name" error={issue("businessName")} tip="The registered name of your company, exactly as on its official papers.">
                <input className={cn(FIELD, issue("businessName") && FIELD_BAD)} value={businessName} placeholder="Legal business name" tabIndex={kind === "business" ? undefined : -1} autoComplete="organization" onBlur={() => mark("businessName")} onChange={(e) => setBusinessName(e.target.value)} />
              </Field>
            </div>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <Field label="First name" error={issue("firstName")} tip={kind === "business" ? "The first name of the person running the business, as on their ID." : "Your first name exactly as on your passport or ID card."}>
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

type VerifyStage = "loading" | "details" | "document" | "other" | "failed"

function stageOf(view: StripeVerificationView | null | undefined): Exclude<VerifyStage, "loading" | "failed"> | "next" {
  if (!view) return "next"
  if (view.fields.length > 0) return "details"
  if (view.document) return "document"
  if (view.other) return "other"
  return "next"
}

function verifyBoot(data: Overview): { stage: VerifyStage; view: StripeVerificationView | null } {
  const view = data.verification ?? null
  if (view && data.payoutHint?.inStorelib) {
    const s = stageOf(view)
    if (s === "next") return { stage: "loading", view }
    return { stage: s, view }
  }
  return { stage: "loading", view }
}

function VerifyStep({ data, onData, onBack, onDone }: { data: Overview; onData: (next: Overview) => void; onBack: () => void; onDone: (next: Overview) => void }) {
  const boot = React.useMemo(() => verifyBoot(data), [data])
  const [stage, setStage] = React.useState<VerifyStage>(boot.stage)
  const [view, setView] = React.useState<StripeVerificationView | null>(boot.view)
  const [error, setError] = React.useState<string | null>(null)
  const [embedKey, setEmbedKey] = React.useState(0)

  const take = React.useCallback(
    (next: Overview) => {
      onData(next)
      setView(next.verification ?? null)
      const s = stageOf(next.verification)
      if (s === "next") onDone(next)
      else setStage(s)
    },
    [onData, onDone],
  )

  const prepare = React.useCallback(async () => {
    setError(null)
    if (data.verification && data.payoutHint?.inStorelib) {
      const s = stageOf(data.verification)
      if (s === "next") onDone(data)
      else setStage(s)
      return
    }
    setStage("loading")
    try {
      take(await post<Overview>("prepare", {}))
    } catch (e) {
      setError(safe(e instanceof Error ? e.message : "Verification can't open right now."))
      setStage("failed")
    }
  }, [data, onDone, take])

  React.useEffect(() => {
    if (boot.stage !== "loading") return
    void prepare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (stage === "loading") {
    return (
      <div className="flex-1 space-y-4 px-5 pb-6 sm:px-6" aria-busy="true" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <span className="block h-3 w-28 animate-pulse rounded-full bg-[#f1f2f4]" />
            <span className="block h-11 animate-pulse rounded-[10px] bg-[#f7f7f8] sm:h-10" />
          </div>
        ))}
      </div>
    )
  }

  if (stage === "failed") {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <div className="flex-1 space-y-4 px-5 sm:px-6">
          <ErrorLine message={error} />
        </div>
        <Footer>
          <button type="button" className={SECONDARY} onClick={onBack}>Back</button>
          <button type="button" className={PRIMARY} onClick={() => void prepare()}>Try again</button>
        </Footer>
      </div>
    )
  }

  if (stage === "details" && view) {
    return <DetailsForm view={view} mode="setup" onBack={onBack} onDone={take} />
  }

  if (stage === "document" && view) {
    return <DocumentForm view={view} onBack={onBack} onDone={take} />
  }

  return (
    <div className="flex-1 space-y-3 px-5 pb-6 sm:px-6">
      <p className="text-[13px] text-[#6b7280]">A few more details are needed to finish verifying you.</p>
      <ErrorLine message={error} />
      <StripeConnectEmbedded
        key={embedKey}
        purpose="stripe_onboarding"
        onError={setError}
        onExit={async () => {
          try {
            const next = await post<Overview>("refresh", {})
            if (stageOf(next.verification) === "other") {
              onData(next)
              setEmbedKey((k) => k + 1)
              return
            }
            take(next)
          } catch (e) {
            setError(safe(e instanceof Error ? e.message : "Could not check your details."))
          }
        }}
      />
    </div>
  )
}

const PHONE_EXAMPLE: Record<string, string> = {
  US: "+1 555 000 0000",
  CA: "+1 555 000 0000",
  GB: "+44 7700 900000",
  RO: "+40 712 345 678",
  DE: "+49 151 23456789",
  FR: "+33 6 12 34 56 78",
  AU: "+61 412 345 678",
}

function DetailsForm({ view, mode, onBack, onDone, intro }: { view: StripeVerificationView; mode: "setup" | "update"; onBack: () => void; onDone: (next: Overview) => void; intro?: React.ReactNode }) {
  const fields: DetailField[] = mode === "update" ? ["address", "phone"] : view.fields
  const compact = mode === "setup"
  const has = (f: DetailField) => fields.includes(f)
  const country = view.country
  const [form, setForm] = React.useState<DetailsInput>({ pep: "" })
  const [showLine2, setShowLine2] = React.useState(false)
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const issues = detailsIssues(form, fields, country)
  const issue = (key: keyof typeof issues) => ((touched[key] || tried) && issues[key]) || undefined
  const bind = (key: keyof DetailsInput) => ({
    value: (form[key] as string | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [key]: true })),
    className: cn(compact ? FIELD_COMPACT : FIELD, issue(key as keyof typeof issues) && FIELD_BAD),
  })
  const idCopy = idNumberCopy(country)
  const today = new Date().toISOString().slice(0, 10)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    const pending = { ...issues }
    delete pending.tos
    if (Object.keys(pending).length > 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      onDone(await post<Overview>("details", { ...form, tos: has("tos"), mode }))
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : "Those details were not accepted."))
    } finally {
      setBusy(false)
    }
  }

  const agreementShort =
    view.agreement === "recipient" ? "Stripe Recipient Agreement" : "Stripe Connected Account Agreement"

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col" data-verify-form="">
      <div className={cn("flex-1 px-5 sm:px-6", compact ? "space-y-2.5 sm:space-y-2" : "space-y-4")}>
        {intro ?? (compact ? null : <p className="text-[13px] leading-5 text-[#6b7280]">Confirm a few details. This usually takes about a minute.</p>)}
        <ErrorLine message={error} />

        <div className={cn(compact && (has("dob") || has("phone")) ? "grid gap-2.5" : compact ? "contents" : (has("dob") || has("phone")) ? "grid gap-2.5 sm:grid-cols-2 sm:gap-x-4" : "contents")}>
          {has("dob") ? (
            <Field dense={compact} label="Date of birth" error={issue("dob")} tip="Must match your ID. You must be 18 or older.">
              <BirthDateField compact={compact} value={form.dob ?? ""} max={today} invalid={!!issue("dob")} onChange={(v) => { setForm((f) => ({ ...f, dob: v })); setTouched((t) => ({ ...t, dob: true })) }} />
            </Field>
          ) : null}
          {has("phone") ? (
            <Field dense={compact} label="Phone" error={issue("phone")} tip="Include your country code. Used only if we need to confirm it's you.">
              <input type="tel" inputMode="tel" autoComplete="tel" placeholder={PHONE_EXAMPLE[country] ?? "+ country code"} {...bind("phone")} />
            </Field>
          ) : null}
        </div>

        {has("address") ? (
          <div className={cn(compact ? "space-y-2.5" : "space-y-4")}>
            <Field dense={compact} label="Address" error={issue("line1")} tip="Your home address as on your ID. No PO boxes.">
              <input autoComplete="address-line1" placeholder="Street and number" {...bind("line1")} />
            </Field>
            {compact && !showLine2 && !(form.line2 ?? "").trim() ? (
              <button type="button" onClick={() => setShowLine2(true)} className="text-[12px] font-medium text-[#6b7280] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
                Add apartment or suite
              </button>
            ) : (
              <Field dense={compact} label="Apartment or suite" optional>
                <input autoComplete="address-line2" placeholder="Optional" {...bind("line2")} />
              </Field>
            )}
            <div
              className={cn(
                "grid gap-2.5",
                has("state") ? "sm:grid-cols-[minmax(0,1fr)_108px_minmax(0,0.9fr)]" : "grid-cols-[minmax(0,1fr)_108px] sm:grid-cols-[minmax(0,1fr)_120px]",
              )}
            >
              <Field dense={compact} label="City" error={issue("city")}>
                <input autoComplete="address-level2" placeholder="City" {...bind("city")} />
              </Field>
              <Field dense={compact} label="Postal" error={issue("postalCode")}>
                <input autoComplete="postal-code" autoCapitalize="characters" placeholder="Code" {...bind("postalCode")} />
              </Field>
              {has("state") ? (
                <Field dense={compact} label={country === "US" ? "State" : "Region"} error={issue("state")}>
                  <input autoComplete="address-level1" placeholder={country === "US" ? "State" : "Region"} {...bind("state")} />
                </Field>
              ) : null}
            </div>
          </div>
        ) : null}

        {has("idNumber") ? (
          <Field dense={compact} label={idCopy.label} error={issue("idNumber")} tip={idCopy.tip}>
            <input inputMode={country === "US" || country === "RO" ? "numeric" : "text"} autoComplete="off" spellCheck={false} placeholder={idCopy.label} className={cn(bind("idNumber").className, "tabular-nums")} value={form.idNumber ?? ""} onChange={bind("idNumber").onChange} onBlur={bind("idNumber").onBlur} />
          </Field>
        ) : null}

        {has("ssnLast4") ? (
          <Field dense={compact} label="SSN last 4" error={issue("ssnLast4")} tip="Last four digits only. Sent to Stripe, not stored by Storelib.">
            <input inputMode="numeric" maxLength={4} autoComplete="off" placeholder="1234" className={cn(bind("ssnLast4").className, "tabular-nums")} value={form.ssnLast4 ?? ""} onChange={bind("ssnLast4").onChange} onBlur={bind("ssnLast4").onBlur} />
          </Field>
        ) : null}

        {has("pep") ? (
          <div className={cn(compact ? "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4" : "")}>
            <div className="flex items-center gap-1.5">
              <span className={cn("font-medium text-[#1a1a2e]", compact ? "text-[12px]" : "text-[13px]")}>Senior public role?</span>
              <InfoTip label="Senior public role">Minister, judge, senior military, or head of a state company, now or in the past year. Most people choose No.</InfoTip>
            </div>
            <div className={cn(compact ? "w-full sm:max-w-[200px]" : "")}>
              <Segmented
                label="Senior public role"
                value={(form.pep || "unset") as "none" | "existing" | "unset"}
                onChange={(v) => setForm((f) => ({ ...f, pep: v === "unset" ? "" : v }))}
                options={[
                  { value: "none", label: "No" },
                  { value: "existing", label: "Yes" },
                ]}
              />
            </div>
            {issue("pep") ? <span className="text-[11px] text-[#c4290c] sm:col-span-2">{issue("pep")}</span> : null}
          </div>
        ) : null}

        {has("tos") ? (
          <p className="text-[11px] leading-[16px] text-[#6b7280] sm:text-[12px] sm:leading-[17px]">
            By continuing you agree to the{" "}
            <a href={AGREEMENT_URL[view.agreement]} target="_blank" rel="noopener noreferrer" className={LINK}>{agreementShort}</a> and{" "}
            <a href="/terms" target="_blank" rel="noopener" className={LINK}>Storelib Terms</a>. Details go to Stripe only.
          </p>
        ) : (
          !compact ? <SecureLine>Sent securely to Stripe. Storelib doesn&apos;t store your ID details.</SecureLine> : null
        )}
      </div>

      <Footer compact={compact}>
        <button type="button" className={SECONDARY} onClick={onBack}>{mode === "update" ? "Cancel" : "Back"}</button>
        <button type="submit" className={PRIMARY} disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving" : mode === "update" ? "Save" : has("tos") ? "Agree and continue" : "Continue"}
        </button>
      </Footer>
    </form>
  )
}

const DOC_TYPES = "image/jpeg,image/png,application/pdf"

function DocumentForm({ view, onBack, onDone }: { view: StripeVerificationView; onBack: () => void; onDone: (next: Overview) => void }) {
  const proof = view.document === "address_proof"
  const [front, setFront] = React.useState<File | null>(null)
  const [backFile, setBackFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tried, setTried] = React.useState(false)

  const upload = async (file: File, side: "front" | "back") => {
    const body = new FormData()
    body.set("file", file)
    body.set("side", side)
    return read<Overview>(await fetch("/api/payments/document", { method: "POST", body, cache: "no-store" }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!front || busy) return
    setBusy(true)
    setError(null)
    try {
      let next = await upload(front, "front")
      if (backFile && !proof) next = await upload(backFile, "back")
      onDone(next)
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : "That photo could not be uploaded."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 space-y-5 px-5 sm:px-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{proof ? "Proof of address" : "Photo of your ID"}</h3>
            <InfoTip label={proof ? "Proof of address" : "Photo of your ID"}>
              {proof
                ? "A bank statement, utility bill or tax letter from the last 3 months, showing your name and home address."
                : "A passport, national ID card or driving licence. Show all four corners, with no glare or blur."}
            </InfoTip>
          </div>
          <p className="mt-1 text-[13px] text-[#6b7280]">{proof ? "A recent document with your name and address." : "Passport, ID card or driving licence."}</p>
        </div>
        {view.problem ? (
          <p className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-[13px] text-[#92400e] animate-in fade-in-0 duration-150">{view.problem}</p>
        ) : null}
        <ErrorLine message={error} />

        <div className={cn("grid gap-3", !proof && "min-[420px]:grid-cols-2")}>
          <FileTile label={proof ? "Document" : "Front"} file={front} onFile={setFront} invalid={tried && !front} />
          {proof ? null : <FileTile label="Back" optional file={backFile} onFile={setBackFile} />}
        </div>
        {tried && !front ? <span className="-mt-2 block text-[12px] text-[#c4290c]">Add a photo to continue.</span> : null}

        <SecureLine>Sent straight to Stripe for verification. Storelib never keeps a copy.</SecureLine>
      </div>

      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>Back</button>
        <button type="submit" className={PRIMARY} disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Uploading" : "Continue"}
        </button>
      </Footer>
    </form>
  )
}

function FileTile({ label, optional, file, onFile, invalid }: { label: string; optional?: boolean; file: File | null; onFile: (f: File | null) => void; invalid?: boolean }) {
  const id = React.useId()
  return (
    <label
      htmlFor={id}
      className={cn(
        "group flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-center transition-[border-color,background-color] duration-150",
        file ? "border-solid border-[#e3e5e8] bg-[#f9fafb]" : invalid ? "border-[#c4290c] bg-white" : "border-[#d5d8dd] bg-white hover:border-[#9ca3af] hover:bg-[#fafafa]",
      )}
    >
      <input id={id} type="file" accept={DOC_TYPES} className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {file ? (
        <>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dcfce7] text-[#166534] animate-in zoom-in-75 duration-200">
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="max-w-full truncate text-[13px] font-medium text-[#1a1a2e]">{file.name}</span>
          <span className="text-[12px] text-[#6b7280] underline-offset-2 group-hover:underline">Replace</span>
        </>
      ) : (
        <>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f2f4] text-[#6b7280] transition-colors group-hover:text-[#1a1a2e]">
            {label === "Document" ? <FileText className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          </span>
          <span className="text-[13px] font-medium text-[#1a1a2e]">
            {label}
            {optional ? <span className="font-normal text-[#9ca3af]"> (if it has one)</span> : null}
          </span>
          <span className="text-[12px] text-[#6b7280]">JPG, PNG or PDF, up to 10 MB</span>
        </>
      )}
    </label>
  )
}

/* ── after setup: account details ──────────────────────────────────────── */

function DetailsStep({ data, onBack, onDone }: { data: Overview; onBack: () => void; onDone: (next: Overview) => void }) {
  const [fetched, setFetched] = React.useState<StripeVerificationView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(!data.verification)
  const view = data.verification ?? fetched

  React.useEffect(() => {
    if (data.verification) {
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    post<Overview>("prepare", {})
      .then((next) => live && setFetched(next.verification ?? null))
      .catch((e) => live && setError(safe(e instanceof Error ? e.message : "Account details can't open right now.")))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [data.verification])

  const hint = data.payoutHint
  const rows = [
    { label: "Name", value: hint?.accountName || "—" },
    { label: "Type", value: hint?.holderType === "company" ? "Business" : "Individual" },
    { label: "Country", value: hint?.country ? countryLabel(hint.country) : "—", flag: hint?.country ?? null },
  ]

  const summary = (
    <div className="space-y-3">
      <dl className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 px-3.5 py-3">
            <dt className="w-20 shrink-0 text-[13px] text-[#6b7280]">{row.label}</dt>
            <dd className="flex min-w-0 flex-1 items-center justify-end gap-2 text-[13px] font-medium text-[#1a1a2e]">
              {row.flag ? <CountryFlag code={row.flag} /> : null}
              <span className="truncate">{row.value}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="flex items-center gap-1.5 text-[12px] text-[#6b7280]">
        <Lock className="h-3 w-3" /> Name, type and country are locked once verified.
      </p>
    </div>
  )

  if (loading) {
    return (
      <div className="flex-1 space-y-3 px-5 pb-6 sm:px-6" aria-busy="true">
        <span className="block h-[132px] animate-pulse rounded-xl bg-[#f7f7f8]" />
        <span className="block h-11 animate-pulse rounded-[10px] bg-[#f7f7f8]" />
      </div>
    )
  }

  if (!view) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <div className="flex-1 space-y-4 px-5 sm:px-6">
          {summary}
          <ErrorLine message={error} />
        </div>
        <Footer>
          <span />
          <button type="button" className={SECONDARY} onClick={onBack}>Close</button>
        </Footer>
      </div>
    )
  }

  return <DetailsForm view={view} mode="update" onBack={onBack} onDone={onDone} intro={<>{summary}<h3 className="pt-1 text-[14px] font-semibold text-[#1a1a2e]">Update address and phone</h3></>} />
}

/* ── step 3: bank ──────────────────────────────────────────────────────── */

type BankKey = "holder" | "iban" | "ibanConfirm" | "account" | "accountConfirm" | "routing" | "institution" | "transit" | "owns"

function BankStep({ data, showBack, onBack, onDone }: { data: Overview; showBack: boolean; onBack: () => void; onDone: (next: Overview) => void }) {
  const country = data.payoutHint?.country ?? data.prefill?.country ?? ""
  const currency = data.payoutHint?.currency ?? null
  const format = bankFormat(country)
  const [form, setForm] = React.useState<BankInput>({ format, holder: data.payoutHint?.accountName ?? "", owns: false })
  const [touched, setTouched] = React.useState<Partial<Record<BankKey, boolean>>>({})
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const issues = bankIssues(form, country)
  const issue = (key: BankKey) => ((touched[key] || tried) && issues[key]) || undefined
  const set = (key: keyof BankInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const blur = (key: BankKey) => () => setTouched((t) => ({ ...t, [key]: true }))
  const input = (key: BankKey, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      className={cn(FIELD, "tabular-nums", issue(key) && FIELD_BAD)}
      value={(form[key as keyof BankInput] as string | undefined) ?? ""}
      onChange={set(key as keyof BankInput)}
      onBlur={blur(key)}
      autoComplete="off"
      spellCheck={false}
      {...props}
    />
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.keys(issues).length > 0 || busy) return
    const pk = data.stripe?.publishableKey
    if (!pk || !currency || !country) {
      setError("Finish verification first, then add your bank.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { loadStripe } = await import("@stripe/stripe-js")
      const stripe = await loadStripe(pk)
      if (!stripe) throw new Error("The secure bank form could not load. Try again.")
      const { token, error: tokenError } = await stripe.createToken("bank_account", {
        country,
        currency: currency.toLowerCase(),
        account_holder_name: form.holder.trim(),
        account_holder_type: data.payoutHint?.holderType === "company" ? "company" : "individual",
        ...bankTokenFields(form),
      })
      if (tokenError || !token) throw new Error(tokenError?.message && !/api|key/i.test(tokenError.message) ? tokenError.message : "Those bank details were not accepted. Check them and try again.")
      onDone(await post<Overview>("bank", { token: token.id }))
    } catch (err) {
      setError(safe(err instanceof Error ? err.message : "Those bank details were not accepted."))
    } finally {
      setBusy(false)
    }
  }

  const holderHint = data.payoutHint?.accountName ? `Must match ${data.payoutHint.accountName}.` : undefined
  const routingLabel = format === "us" ? "Routing number" : format === "gb" ? "Sort code" : format === "au" ? "BSB" : "Bank code"
  const routingTip =
    format === "us"
      ? "The 9 digit number at the bottom left of a cheque, or in your banking app."
      : format === "gb"
        ? "The 6 digit number for your branch, like 12-34-56. It's in your banking app."
        : format === "au"
          ? "Your 6 digit branch number, shown next to your account number."
          : "A code some banks use to route payments. Leave it empty if yours doesn't."

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-1 flex-col">
      <div className="flex-1 space-y-5 px-5 sm:px-6">
        <ErrorLine message={error} />
        {format === "iban" ? (
          <>
            <Field label="IBAN" error={issue("iban")} tip="Your international bank account number. It starts with your country code and is in your banking app.">
              {input("iban", { placeholder: `${country}00 0000 0000 0000 0000`, inputMode: "text", autoCapitalize: "characters" })}
            </Field>
            <Field label="Confirm IBAN" error={issue("ibanConfirm")}>{input("ibanConfirm", { autoCapitalize: "characters", onPaste: (e) => e.preventDefault() })}</Field>
          </>
        ) : (
          <>
            {format === "ca" ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Transit number" error={issue("transit")} tip="The 5 digit branch number on a cheque.">{input("transit", { inputMode: "numeric", maxLength: 5 })}</Field>
                <Field label="Institution number" error={issue("institution")} tip="The 3 digit number for your bank.">{input("institution", { inputMode: "numeric", maxLength: 3 })}</Field>
              </div>
            ) : format === "us" || format === "gb" || format === "au" || format === "other" ? (
              <Field label={routingLabel} error={issue("routing")} optional={format === "other"} tip={routingTip}>
                {input("routing", { inputMode: format === "other" ? "text" : "numeric", maxLength: format === "us" ? 9 : format === "other" ? 20 : 8 })}
              </Field>
            ) : null}
            <Field label="Account number" error={issue("account")} tip="The number of the account you want paid into. It's in your banking app.">
              {input("account", { inputMode: format === "other" ? "text" : "numeric", maxLength: 34 })}
            </Field>
            <Field label="Confirm account number" error={issue("accountConfirm")}>{input("accountConfirm", { inputMode: format === "other" ? "text" : "numeric", maxLength: 34, onPaste: (e) => e.preventDefault() })}</Field>
          </>
        )}

        <Field label="Account holder name" error={issue("holder")} hint={holderHint} tip="The name the bank has on the account. It must match your verified name, or payouts are returned.">
          <input className={cn(FIELD, issue("holder") && FIELD_BAD)} value={form.holder} onChange={(e) => setForm((f) => ({ ...f, holder: e.target.value }))} onBlur={blur("holder")} autoComplete="name" />
        </Field>

        {currency ? (
          <div className="flex items-center gap-3 rounded-xl border border-[#eceef1] bg-[#f9fafb] px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#6b7280] shadow-[0_0_0_1px_#eceef1]">
              <Landmark className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#1a1a2e]">
                Payout currency
                <InfoTip label="Payout currency">Your sales are paid out in this currency. Your bank account needs to accept it.</InfoTip>
              </p>
              <p className="text-[12px] text-[#6b7280]">The account must hold {currency}.</p>
            </div>
            <span className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1 text-[12px] font-semibold tabular-nums text-[#1a1a2e]">{currency}</span>
          </div>
        ) : null}

        <label className="flex cursor-pointer items-start gap-3 py-1">
          <input
            type="checkbox"
            checked={form.owns}
            onChange={(e) => {
              setForm((f) => ({ ...f, owns: e.target.checked }))
              setTouched((t) => ({ ...t, owns: true }))
            }}
            className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[5px] accent-[#1a1a2e]"
          />
          <span className="text-[13px] leading-5 text-[#374151]">This account is mine and I can use it.</span>
        </label>
        {issue("owns") ? <span className="-mt-3 block text-[12px] text-[#c4290c]">{issue("owns")}</span> : null}

        <SecureLine>Sent securely to Stripe. Storelib never stores your bank number.</SecureLine>
      </div>

      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>{showBack ? "Back" : "Cancel"}</button>
        <button type="submit" className={PRIMARY} disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Saving" : showBack ? "Finish setup" : "Save bank"}
        </button>
      </Footer>
    </form>
  )
}
