"use client"

/**
 * STORELIB PAYMENTS SETUP, ONE PANEL. A centred panel on a computer and the
 * shared sheet on a phone: Account (country, type, legal name), Verify (the
 * embedded Stripe form, in the page) and Bank (Storelib's own form; the
 * numbers go from this browser to Stripe as a token and never to Storelib).
 *
 * Not a Radix dialog: Stripe's embedded form opens its own layer over the
 * page, and a modal focus trap or pointer lock would leave it unclickable.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { Check, Landmark, Lock, X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
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
import type { Overview } from "@/components/app/settings/payments-hub-shared"
import { cn } from "@/lib/utils"

export type SetupMode = "setup" | "bank" | "details"
type Step = 0 | 1 | 2

export const FIELD =
  "h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14px]"
const FIELD_BAD = "border-[#e11d48] focus:border-[#e11d48] focus:shadow-[0_0_0_3px_rgba(225,29,72,0.10)]"
const PRIMARY = cn(primaryDepth, "h-11 gap-2 rounded-xl px-5 text-[14px] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10")
const SECONDARY = cn(secondaryDepth, "h-11 rounded-xl px-5 text-[14px] sm:h-10")

function safe(message: string): string {
  if (/invalid_request|acct_|accs_|btok_|capability|requirement|sk_|whsec/i.test(message)) return "Something went wrong. Try again in a moment."
  return message
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/payments/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(safe(data.error || "Something went wrong. Try again in a moment."))
  return data
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

function Panel({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const phone = usePhone()
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
    }, 160)
    return () => window.clearTimeout(t)
  }, [open, shown])

  React.useEffect(() => {
    if (!open || phone) return
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
  }, [open, phone, onClose])

  if (phone) {
    return (
      <BottomSheet isOpen={open} onClose={onClose} label={label} hideFrom={null} fill aboveKeyboard maxHeight="calc(var(--vv-h, 100dvh) * 0.92)">
        {children}
      </BottomSheet>
    )
  }
  if (!shown || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6" data-payments-setup-panel="">
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
          "relative flex max-h-[min(780px,calc(100dvh-48px))] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_-12px_rgba(15,17,21,0.35),0_2px_8px_rgba(15,17,21,0.08)] duration-200 ease-sheet [will-change:transform,opacity]",
          leaving ? "animate-out fade-out-0 zoom-out-95" : "animate-in fade-in-0 zoom-in-95",
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* ── the steps along the top ───────────────────────────────────────────── */

const STEP_LABELS = ["Account", "Verify", "Bank"] as const

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Setup steps">
      {STEP_LABELS.map((label, i) => {
        const done = i < step
        const on = i === step
        return (
          <React.Fragment key={label}>
            {i > 0 ? <li aria-hidden className={cn("h-px flex-1 transition-colors duration-300", i <= step ? "bg-[#1a1a2e]" : "bg-[#e5e7eb]")} /> : null}
            <li className="flex shrink-0 items-center gap-2" aria-current={on ? "step" : undefined}>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold transition-colors duration-300",
                  done || on ? "bg-[#1a1a2e] text-white" : "bg-[#f1f2f4] text-[#6b7280]",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("text-[13px]", on ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{label}</span>
            </li>
          </React.Fragment>
        )
      })}
    </ol>
  )
}

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-[12px] text-[#be123c]">{error}</span> : hint ? <span className="mt-1.5 block text-[12px] text-[#6b7280]">{hint}</span> : null}
    </label>
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
  const beat: OnboardingBeat = data.beat ?? "personal"
  const [step, setStep] = React.useState<Step>(() => stepOfBeat(beat))
  const [error, setError] = React.useState<string | null>(null)
  const [embedKey, setEmbedKey] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setStep(mode === "bank" ? 2 : stepOfBeat(beat))
    setEmbedKey((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode])

  const afterVerify = async () => {
    try {
      const next = await post<Overview>("refresh", {})
      onData(next)
      const nextBeat = next.beat ?? "verification"
      if (nextBeat === "verification") {
        setEmbedKey((k) => k + 1)
        return
      }
      if (nextBeat === "bank" || (nextBeat === "review" && !next.payoutDestination && next.payoutHint?.inStorelib)) {
        setStep(2)
        return
      }
      onFinished()
      onClose()
    } catch (e) {
      setError(safe(e instanceof Error ? e.message : "Could not check your details."))
    }
  }

  const title = mode === "bank" ? (data.payoutDestination ? "Update bank account" : "Add bank account") : mode === "details" ? "Account details" : "Set up payments"

  return (
    <Panel open={open} onClose={onClose} label={title}>
      <div className="flex shrink-0 flex-col gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-[18px] font-semibold leading-6 text-[#1a1a2e]">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f4f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 max-sm:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {mode === "setup" ? <Stepper step={step} /> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {mode === "details" ? (
          <div className="space-y-3 px-5 pb-6 sm:px-6">
            <ErrorLine message={error} />
            <StripeConnectEmbedded key={embedKey} purpose="stripe_management" onError={setError} onExit={async () => { onClose() }} />
          </div>
        ) : step === 0 ? (
          <AccountStep
            key="account"
            data={data}
            onBack={onClose}
            onDone={(next) => {
              onData(next)
              setStep(stepOfBeat(next.beat ?? "verification") === 2 ? 2 : 1)
            }}
          />
        ) : step === 1 ? (
          <div key="verify" className="space-y-3 px-5 pb-6 animate-in fade-in-0 slide-in-from-right-2 duration-200 ease-sheet sm:px-6">
            <p className="text-[13px] text-[#6b7280]">Confirm your identity. It takes about two minutes.</p>
            <ErrorLine message={error} />
            <StripeConnectEmbedded key={embedKey} purpose="stripe_onboarding" onError={setError} onExit={afterVerify} />
          </div>
        ) : (
          <BankStep
            key="bank"
            data={data}
            showBack={mode === "setup"}
            onBack={() => (mode === "setup" ? setStep(1) : onClose())}
            onDone={(next) => {
              onData(next)
              onFinished()
              onClose()
            }}
          />
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
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col animate-in fade-in-0 duration-200 ease-sheet">
      <div className="flex-1 space-y-4 px-5 sm:px-6">
        <ErrorLine message={error} />
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">Country</span>
          {hasAccount && data.payoutHint?.country ? (
            <div className="flex h-11 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 text-[14px] text-[#1a1a2e]">
              <CountryFlag code={data.payoutHint.country} />
              <span className="flex-1 truncate">{countryLabel(data.payoutHint.country)}</span>
              <Lock className="h-3.5 w-3.5 text-[#9ca3af]" aria-label="Locked" />
            </div>
          ) : (
            <div onBlur={() => mark("country")}>
              <CountryPicker value={countryName} onChange={(name) => { setCountryName(name); mark("country") }} />
            </div>
          )}
          {issue("country") ? <span className="mt-1.5 block text-[12px] text-[#be123c]">{issue("country")}</span> : null}
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">Account type</span>
          <div role="radiogroup" className="relative grid h-11 grid-cols-2 rounded-xl bg-[#f1f2f4] p-1">
            <span
              aria-hidden
              className={cn(
                "absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-[9px] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.10),0_0_0_0.5px_rgba(16,24,40,0.06)] transition-transform duration-200 ease-sheet",
                kind === "business" ? "translate-x-[calc(100%+0px)]" : "translate-x-0",
              )}
              style={{ left: 4 }}
            />
            {(["individual", "business"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={kind === option}
                onClick={() => setKind(option)}
                className={cn("relative z-[1] cursor-pointer rounded-[9px] text-[14px] font-medium transition-colors", kind === option ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
              >
                {option === "individual" ? "Individual" : "Business"}
              </button>
            ))}
          </div>
        </div>

        {kind === "business" ? (
          <Field label="Legal business name" error={issue("businessName")}>
            <input className={cn(FIELD, issue("businessName") && FIELD_BAD)} value={businessName} autoComplete="organization" onBlur={() => mark("businessName")} onChange={(e) => setBusinessName(e.target.value)} />
          </Field>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" error={issue("firstName")}>
            <input className={cn(FIELD, issue("firstName") && FIELD_BAD)} value={firstName} autoComplete="given-name" onBlur={() => mark("firstName")} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name" error={issue("lastName")}>
            <input className={cn(FIELD, issue("lastName") && FIELD_BAD)} value={lastName} autoComplete="family-name" onBlur={() => mark("lastName")} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <p className="text-[12px] text-[#6b7280]">Use your name exactly as it is on your ID.</p>
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

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col animate-in fade-in-0 slide-in-from-right-2 duration-200 ease-sheet">
      <div className="flex-1 space-y-4 px-5 sm:px-6">
        <ErrorLine message={error} />
        {format === "iban" ? (
          <>
            <Field label="IBAN" error={issue("iban")}>{input("iban", { placeholder: `${country}00 0000 0000 0000 0000`, inputMode: "text", autoCapitalize: "characters" })}</Field>
            <Field label="Confirm IBAN" error={issue("ibanConfirm")}>{input("ibanConfirm", { autoCapitalize: "characters", onPaste: (e) => e.preventDefault() })}</Field>
          </>
        ) : (
          <>
            {format === "ca" ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Transit number" error={issue("transit")}>{input("transit", { inputMode: "numeric", maxLength: 5 })}</Field>
                <Field label="Institution number" error={issue("institution")}>{input("institution", { inputMode: "numeric", maxLength: 3 })}</Field>
              </div>
            ) : format === "us" || format === "gb" || format === "au" || format === "other" ? (
              <Field
                label={format === "us" ? "Routing number" : format === "gb" ? "Sort code" : format === "au" ? "BSB" : "Bank code"}
                error={issue("routing")}
                hint={format === "other" ? "If your bank uses one." : undefined}
              >
                {input("routing", { inputMode: format === "other" ? "text" : "numeric", maxLength: format === "us" ? 9 : format === "other" ? 20 : 8 })}
              </Field>
            ) : null}
            <Field label="Account number" error={issue("account")}>{input("account", { inputMode: format === "other" ? "text" : "numeric", maxLength: 34 })}</Field>
            <Field label="Confirm account number" error={issue("accountConfirm")}>{input("accountConfirm", { inputMode: format === "other" ? "text" : "numeric", maxLength: 34, onPaste: (e) => e.preventDefault() })}</Field>
          </>
        )}

        <Field label="Account holder name" error={issue("holder")} hint={holderHint}>
          <input
            className={cn(FIELD, issue("holder") && FIELD_BAD)}
            value={form.holder}
            onChange={(e) => setForm((f) => ({ ...f, holder: e.target.value }))}
            onBlur={blur("holder")}
            autoComplete="name"
          />
        </Field>

        {currency ? (
          <div className="flex items-center gap-3 rounded-xl border border-[#eceef1] bg-[#f9fafb] px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#6b7280] shadow-[0_0_0_1px_#eceef1]">
              <Landmark className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[#1a1a2e]">Payout currency</p>
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
        {issue("owns") ? <span className="-mt-3 block text-[12px] text-[#be123c]">{issue("owns")}</span> : null}

        <p className="flex items-center gap-1.5 text-[12px] text-[#6b7280]">
          <Lock className="h-3 w-3" /> Sent securely to Stripe. Storelib never stores your bank number.
        </p>
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

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t border-[#f1f2f4] bg-white px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 [&>*:last-child]:max-sm:flex-1">
      {children}
    </div>
  )
}

function Spinner() {
  return <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
}
