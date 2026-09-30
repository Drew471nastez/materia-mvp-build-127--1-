"use client"

/**
 * STORELIB PAYMENTS SETUP. A centred panel on a computer and a full screen
 * subpage on a phone, with three steps:
 *
 *   Account  country, individual or business, legal name (Storelib's form)
 *   Verify   Stripe's embedded onboarding, drawn inside this panel; it asks
 *            only what Stripe needs today, including owners and ID photos
 *   Bank     the payout bank, in Stripe's embedded form; the numbers go from
 *            this browser to Stripe and never to Storelib
 *
 * Which step shows comes from the server's status, read from Stripe, so a
 * step Stripe already has is skipped. Not a Radix dialog: Stripe's form opens
 * its own layer over the page, and a modal focus trap would leave it unclickable.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Check, ChevronLeft, Clock, ExternalLink, Info, Landmark, Lock, X } from "lucide-react"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CountryPicker, CountryFlag } from "@/components/app/settings/country-picker"
import { StripeConnectEmbedded } from "@/components/app/settings/stripe-connect-embedded"
import { countryLabel, countryOf } from "@/lib/account/country"
import { personalIssues } from "@/lib/payments/stripe/onboarding-steps"
import { setupStepOf, type StorelibPaymentsStatus } from "@/lib/payments/stripe/status"
import { isNativeApp, openExternal } from "@/lib/native-bridge"
import type { Overview } from "@/components/app/settings/payments-hub-shared"
import { cn } from "@/lib/utils"

export type SetupMode = "setup" | "bank" | "details"
type Step = 0 | 1 | 2

/* The app's calm field: a light hairline and a soft halo when focused, 16px on a phone so iOS does not zoom. */
export const FIELD =
  "h-11 w-full rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] hover:border-[#d5d8dd] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
const FIELD_BAD = "border-[#c4290c] hover:border-[#c4290c] focus:border-[#c4290c] focus:shadow-[0_0_0_3px_rgba(196,41,12,0.1)]"
const PRIMARY = cn(primaryDepth, "h-11 gap-2 rounded-xl px-5 text-[14px] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:rounded-lg")
const SECONDARY = cn(secondaryDepth, "h-11 rounded-xl px-5 text-[14px] sm:h-10 sm:rounded-lg")

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

const EXIT_MS = 220

function Panel({
  open,
  phone,
  tall,
  onClose,
  label,
  children,
}: {
  open: boolean
  phone: boolean
  /** Fixed height while Stripe's form is inside, so it never jumps as it loads. */
  tall?: boolean
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
          "fixed inset-x-0 top-0 z-[1000] flex h-[100dvh] flex-col bg-white ease-sheet [backface-visibility:hidden] [contain:layout_paint] [will-change:transform]",
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
          "max-w-[min(760px,calc(100vw-40px))]",
          tall ? "h-[min(760px,calc(100dvh-48px))]" : "max-h-[min(760px,calc(100dvh-48px))]",
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

function Stepper({ step, done: all }: { step: Step; done?: boolean }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Setup steps">
      {STEP_LABELS.map((label, i) => {
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

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-setup-footer=""
      className={cn(
        "sticky bottom-0 flex shrink-0 items-center justify-between gap-3 border-t border-[#f1f2f4] bg-white px-5 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 [&>*:last-child]:max-sm:flex-1",
        "mt-6 py-4",
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
  const [step, setStep] = React.useState<Step>(() => setupStepOf(status))
  const [back, setBack] = React.useState(false)
  const [openCount, setOpenCount] = React.useState(0)
  const [ending, setEnding] = React.useState<Outcome | null>(null)
  const native = React.useMemo(() => (typeof window === "undefined" ? false : isNativeApp()), [])

  React.useEffect(() => {
    if (!open) return
    setBack(false)
    setEnding(null)
    setStep(mode === "bank" ? 2 : setupStepOf(status))
    setOpenCount((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode])

  const go = (next: Step) => {
    setBack(next < step)
    setStep(next)
  }

  /** Stripe's form closed: ask Stripe (through the server) what is left. */
  const settle = async (from: "verify" | "bank") => {
    let next = data
    try {
      next = await post<Overview>("refresh", {})
      onData(next)
    } catch {
      /* Keep what we had; the outcome screen still offers a way on. */
    }
    const outcome = outcomeOf(statusOf(next))
    if (outcome === "bank" && from === "verify") {
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

  const title = mode === "bank" ? (data.payoutDestination ? "Payout account" : "Add bank account") : mode === "details" ? "Account details" : "Set up payments"
  const onBack = mode === "setup" && step > 0 && !ending ? () => go((step - 1) as Step) : onClose
  const slide = back ? "slide-in-from-left-4" : "slide-in-from-right-4"
  const embedded = mode !== "setup" || step > 0
  const shownStep: Step = ending === "done" || ending === "checking" ? 2 : step

  let body: React.ReactNode
  if (native && embedded) {
    body = <OpenInBrowser onBack={onClose} />
  } else if (ending) {
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
  } else if (mode === "details") {
    body = <ManageStep key={`details-${openCount}`} onDone={finish} />
  } else if (step === 0) {
    body = (
      <AccountStep
        data={data}
        onBack={onClose}
        onDone={(next) => {
          onData(next)
          const s = statusOf(next)
          go(setupStepOf(s) === 2 ? 2 : 1)
        }}
      />
    )
  } else if (step === 1) {
    body = <VerifyStep key={`verify-${openCount}`} data={data} onExit={() => settle("verify")} />
  } else {
    body = <BankStep key={`bank-${openCount}`} data={data} onExit={() => settle("bank")} onDone={finish} />
  }

  return (
    <Panel open={open} phone={phone} tall={embedded} onClose={onClose} label={title}>
      {phone ? (
        <div className="shrink-0 border-b border-[#f1f2f4] bg-white pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-1 px-2">
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
          </div>
          {mode === "setup" ? (
            <div className="px-5 pb-3.5">
              <Stepper step={shownStep} done={ending === "done"} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex shrink-0 flex-col gap-4 px-6 pb-5 pt-6">
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
          {mode === "setup" ? <Stepper step={shownStep} done={ending === "done"} /> : null}
        </div>
      )}

      <div data-setup-scroll="" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", phone && "pt-5")}>
        <div key={`${mode}-${step}-${ending ?? ""}-${openCount}`} className={cn("flex min-h-full flex-col animate-in fade-in-0 duration-300 ease-sheet", slide)}>
          {body}
        </div>
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

function StepIntro({ title, line }: { title: string; line: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{title}</h3>
      <p className="mt-1 text-[14px] leading-5 text-[#6b7280]">{line}</p>
    </div>
  )
}

/**
 * Stripe's embedded onboarding for what is due now. A creator who comes back
 * later (Stripe asks for more, or a document was declined) lands here too and
 * sees only what is still missing.
 */
function VerifyStep({ data, onExit }: { data: Overview; onExit: () => void }) {
  const s = data.paymentsStatus
  const later = s && s.status !== "NOT_STARTED" && s.status !== "INCOMPLETE" && s.action === "onboarding"
  return (
    <div className="flex-1 px-5 pb-6 sm:px-6">
      {later ? <StepIntro title={s.title} line={s.line} /> : <StepIntro title="Verify your identity" line="We need a few details to activate payments." />}
      <StripeConnectEmbedded purpose="stripe_onboarding" onExit={onExit} />
    </div>
  )
}

/* ── step 3: bank ──────────────────────────────────────────────────────── */

/**
 * With a bank on file: its last four digits and a way to change it, in
 * Stripe's embedded account management. Without one: Stripe's onboarding,
 * narrowed to the bank account alone. Any country's bank format works;
 * Stripe draws the right fields.
 */
function BankStep({ data, onExit, onDone }: { data: Overview; onExit: () => void; onDone: () => void }) {
  const bank = data.payoutDestination
  const failed = data.paymentsStatus?.status === "PAYOUT_FAILED"
  const [changing, setChanging] = React.useState(false)

  if (!bank?.last4) {
    return (
      <div className="flex-1 px-5 pb-6 sm:px-6">
        <StepIntro title="Add your bank account" line="Add the account where you'd like to receive payouts." />
        <StripeConnectEmbedded
          purpose="stripe_onboarding"
          failedTitle="Couldn't load your bank details"
          collection={{ fields: "currently_due", futureRequirements: "omit", requirements: { only: ["external_account"] } }}
          onExit={onExit}
        />
      </div>
    )
  }

  if (changing || failed) {
    return (
      <>
        <div className="flex-1 px-5 pb-2 sm:px-6">
          <StepIntro
            title={failed ? "Your payout account needs attention" : "Change bank account"}
            line={failed ? "A payout didn't go through. Update your bank account to get paid." : "Your new account is used for the next payout."}
          />
          <StripeConnectEmbedded purpose="stripe_management" failedTitle="Couldn't load your bank details" />
        </div>
        <Footer>
          <button type="button" className={SECONDARY} onClick={() => (failed ? onDone() : setChanging(false))}>
            {failed ? "Close" : "Back"}
          </button>
          <button type="button" className={PRIMARY} onClick={onDone}>Done</button>
        </Footer>
      </>
    )
  }

  return (
    <>
      <div className="flex-1 px-5 sm:px-6">
        <div className="flex items-center gap-3 rounded-xl border border-[#eceef1] px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#eceef1] bg-[#f7f7f8] text-[#6b7280]">
            <Landmark className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">
              {bank.bankName || "Bank account"} •••• {bank.last4}
            </span>
            <span className="block text-[12px] text-[#6b7280]">{bank.currency ? `Payouts in ${bank.currency.toUpperCase()}` : "Payout account"}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[12px] font-medium text-[#067647]">
            <Check className="h-3 w-3" strokeWidth={3} /> Connected
          </span>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-[18px] text-[#6b7280]">
          <Lock className="mt-[2px] h-3 w-3 shrink-0" /> <span>Bank numbers go straight to our payment partner. Storelib only sees the last four digits.</span>
        </p>
      </div>
      <Footer>
        <button type="button" className={SECONDARY} onClick={() => setChanging(true)}>Change bank account</button>
        <button type="button" className={PRIMARY} onClick={onDone}>Done</button>
      </Footer>
    </>
  )
}

/* ── after setup: account details ──────────────────────────────────────── */

function ManageStep({ onDone }: { onDone: () => void }) {
  return (
    <>
      <div className="flex-1 px-5 pb-2 sm:px-6">
        <StepIntro title="Account details" line="Review or update the details on your payments account." />
        <StripeConnectEmbedded purpose="stripe_management" failedTitle="Couldn't load your account details" />
      </div>
      <Footer>
        <span />
        <button type="button" className={PRIMARY} onClick={onDone}>Done</button>
      </Footer>
    </>
  )
}

/* ── when Stripe's form closes ─────────────────────────────────────────── */

function Outcome({ outcome, onContinue, onDone }: { outcome: Outcome; onContinue: () => void; onDone: () => void }) {
  const copy =
    outcome === "done"
      ? { icon: <Check className="h-5 w-5" strokeWidth={3} />, tone: "bg-[#ecfdf3] text-[#067647]", title: "Payments active", line: "You're ready to accept payments.", action: "Done", primary: onDone }
      : outcome === "checking"
        ? { icon: <Clock className="h-5 w-5" />, tone: "bg-[#eff4ff] text-[#3538cd]", title: "We're checking your information", line: "No action is needed right now. We'll email you if anything else is needed.", action: "Done", primary: onDone }
        : { icon: <Clock className="h-5 w-5" />, tone: "bg-[#fffaeb] text-[#b54708]", title: "More information is needed to activate payments.", line: "Pick up where you left off.", action: "Continue", primary: onContinue }
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <span className={cn("flex h-12 w-12 items-center justify-center rounded-full", copy.tone)}>{copy.icon}</span>
        <h3 className="mt-4 text-[17px] font-semibold text-[#1a1a2e]">{copy.title}</h3>
        <p className="mx-auto mt-1.5 max-w-[380px] text-[14px] leading-5 text-[#6b7280]">{copy.line}</p>
      </div>
      <Footer>
        {outcome === "more" ? <button type="button" className={SECONDARY} onClick={onDone}>Later</button> : <span />}
        <button type="button" className={PRIMARY} onClick={copy.primary}>{copy.action}</button>
      </Footer>
    </>
  )
}

/** Stripe's embedded forms do not run inside the phone app's web view, so the app hands off to the browser. */
function OpenInBrowser({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f3ff] text-[#635bff]">
          <ExternalLink className="h-5 w-5" />
        </span>
        <h3 className="mt-4 text-[17px] font-semibold text-[#1a1a2e]">Continue in your browser</h3>
        <p className="mx-auto mt-1.5 max-w-[380px] text-[14px] leading-5 text-[#6b7280]">
          This step opens Storelib in your browser. Sign in there and finish setting up payments.
        </p>
      </div>
      <Footer>
        <button type="button" className={SECONDARY} onClick={onBack}>Cancel</button>
        <button type="button" className={PRIMARY} onClick={() => openExternal(`${window.location.origin}/app/payouts?setup=1`)}>
          Open browser
        </button>
      </Footer>
    </>
  )
}
