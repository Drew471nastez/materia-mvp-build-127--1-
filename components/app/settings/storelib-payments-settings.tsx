"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertCircle } from "lucide-react"
import type { StorelibPaymentsBadge } from "@/lib/payments/stripe/creator-badge"
import type { OnboardingBeat } from "@/lib/payments/stripe/onboarding-steps"
import { personalIssues } from "@/lib/payments/stripe/onboarding-steps"
import { StripeConnectEmbedded } from "@/components/app/settings/stripe-connect-embedded"
import { SetupSteps, StorelibPaymentsCard, StorelibPaymentsCardSkeleton } from "@/components/app/settings/storelib-payments-card"
import { CountryPicker } from "@/components/app/settings/country-picker"
import { countryLabel, countryOf } from "@/lib/account/country"
import { money, type Overview } from "@/components/app/settings/payments-hub-shared"
import { cn } from "@/lib/utils"

const FIELD = "h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 text-[14px] text-[#111827] outline-none transition-colors focus:border-[#111827]"
const LABEL = "mb-1 block text-[12px] font-medium text-[#374151]"

function safeError(message: string): string {
  if (/invalid_request|acct_|accs_|capability|requirement|sk_|whsec/i.test(message)) {
    return "Something went wrong. Try again in a moment."
  }
  return message
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/payments/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(safeError(data.error || "Something went wrong. Try again in a moment."))
  return data
}

export function StorelibPaymentsSettings({
  statementDescriptorSlot,
  compact,
  manageRequest = 0,
}: {
  statementDescriptorSlot?: React.ReactNode
  compact?: boolean
  /** Raised by the page (Payouts' Update bank) to open the account form from outside. */
  manageRequest?: number
}) {
  const router = useRouter()
  const cardRef = React.useRef<HTMLDivElement>(null)
  const wasOpen = React.useRef<boolean | null>(null)
  /* Setup and its checks run on Stripe's onboarding form; changing the bank once active on its account form. */
  const [embedPurpose, setEmbedPurpose] = React.useState<"stripe_onboarding" | "stripe_management">("stripe_onboarding")
  const [data, setData] = React.useState<Overview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const [phase, setPhase] = React.useState<"idle" | "personal" | "embed">("idle")
  const [embedStep, setEmbedStep] = React.useState<"verification" | "bank" | null>(null)
  const [embedKey, setEmbedKey] = React.useState(0)
  const [kind, setKind] = React.useState<"individual" | "business">("individual")
  const [countryName, setCountryName] = React.useState("")
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [businessName, setBusinessName] = React.useState("")
  const [showIssues, setShowIssues] = React.useState(false)
  const [touched, setTouched] = React.useState<Record<string, boolean>>({})
  const seeded = React.useRef(false)
  const wasSettingUp = React.useRef(false)

  const load = React.useCallback(async (how: "overview" | "refresh" = "overview") => {
    try {
      if (how === "refresh") setRefreshing(true)
      const next = how === "refresh" ? await call<Overview>("refresh", {}) : await call<Overview>("overview")
      setData(next)
      setError(null)
    } catch (e) {
      setError(safeError(e instanceof Error ? e.message : "Could not load payments."))
    } finally {
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!compact || !data) return
    if (data.beat !== "done") {
      wasSettingUp.current = true
      return
    }
    if (wasSettingUp.current) router.refresh()
  }, [compact, data, router])

  React.useEffect(() => {
    if (!data?.prefill || seeded.current) return
    seeded.current = true
    if (data.prefill.firstName) setFirstName(data.prefill.firstName)
    if (data.prefill.lastName) setLastName(data.prefill.lastName)
    if (data.prefill.country) setCountryName(countryLabel(data.prefill.country))
    if (data.kind === "business" || data.kind === "individual") setKind(data.kind)
  }, [data])

  /* Checkout just opened for this creator: the page around the card (Payouts) redraws as the dashboard. */
  React.useEffect(() => {
    if (!data) return
    if (wasOpen.current === false && data.checkoutOpen) router.refresh()
    wasOpen.current = data.checkoutOpen
  }, [data, router])

  /* Payouts asked for the bank: open the account form in the card and bring it into view. */
  React.useEffect(() => {
    if (manageRequest > 0 && data?.beat === "done") {
      setError(null)
      setEmbedPurpose("stripe_management")
      setEmbedKey((k) => k + 1)
      setPhase("embed")
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [manageRequest, data?.beat])

  const badge = (data?.badge ?? "setup") as StorelibPaymentsBadge
  const beat: OnboardingBeat = data?.beat ?? "personal"
  const status = data?.statusLabel ?? (beat === "done" ? "Payments active" : "Action required")
  const hasAccount = beat !== "personal"
  const step: 1 | 2 | 3 =
    phase === "personal" || (!hasAccount && phase !== "embed")
      ? 1
      : embedStep === "bank" || beat === "bank"
        ? 3
        : 2

  const country = countryOf(countryName) ?? ""
  const issues = personalIssues({ kind, country, firstName, lastName, businessName })
  const issue = (key: "country" | "firstName" | "lastName" | "businessName") => ((touched[key] || showIssues) && issues[key]) || ""
  const mark = (key: string) => setTouched((current) => ({ ...current, [key]: true }))

  const begin = async () => {
    setShowIssues(true)
    if (Object.keys(issues).length > 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await call<Overview>("begin", {
        agree: true,
        kind,
        country,
        firstName,
        lastName,
        businessName: kind === "business" ? businessName : "",
      })
      setData(next)
      setEmbedStep(next.beat === "bank" ? "bank" : "verification")
      setPhase("embed")
    } catch (e) {
      setError(safeError(e instanceof Error ? e.message : "We could not start setup just now."))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      setData(await call<Overview>("disconnect", {}))
      setPhase("idle")
      setEmbedStep(null)
    } catch (e) {
      setError(safeError(e instanceof Error ? e.message : "Could not disconnect."))
    } finally {
      setBusy(false)
    }
  }

  if (!data && !error) return <StorelibPaymentsCardSkeleton />

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4">
        <p className="text-[14px] text-[#111827]">{error}</p>
        <button type="button" className="mt-3 inline-flex h-9 items-center rounded-lg border border-[#e5e7eb] px-3 text-[13px] font-medium" onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  }

  if (!data.configured) {
    return (
      <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4">
        <h3 className="text-[15px] font-semibold text-[#111827]">Storelib Payments</h3>
        <p className="mt-1 text-[13px] text-[#6b7280]">Payments are not switched on yet.</p>
      </div>
    )
  }

  const primaryBal = data.balances[0]
  const hint = phase === "embed" || beat === "verification" || beat === "bank" ? data.payoutHint : null
  const showDisconnect = hasAccount && !data.chargesEnabled && phase === "idle"
  const openEmbed = () => {
    setError(null)
    setEmbedPurpose("stripe_onboarding")
    setEmbedStep(beat === "bank" ? "bank" : "verification")
    setEmbedKey((k) => k + 1)
    setPhase("embed")
  }

  return (
    <div ref={cardRef} data-payments-hub="" data-badge={badge} className="mx-auto w-full max-w-[560px] scroll-mt-24 space-y-3">
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          {phase === "embed" ? (
            <button type="button" className="shrink-0 font-medium underline" onClick={openEmbed}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      <StorelibPaymentsCard
        status={status}
        quiet={phase !== "idle"}
        onRefresh={() => void load("refresh")}
        refreshing={refreshing}
        footer={
          showDisconnect ? (
            <div className="mx-4 mb-4 flex justify-end sm:mx-5">
              <button type="button" disabled={busy} onClick={() => void disconnect()} className="text-[12px] font-medium text-[#6b7280] hover:text-[#111827] disabled:opacity-60">
                Disconnect
              </button>
            </div>
          ) : null
        }
      >
        <div className="border-t border-[#f3f4f6] px-4 py-4 sm:px-5">
          {beat !== "done" ? <SetupSteps step={step} /> : null}

          {phase === "personal" ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                void begin()
              }}
            >
              <div>
                <span className={LABEL}>Country</span>
                <div onBlur={() => mark("country")}>
                  <CountryPicker value={countryName} onChange={(name) => { setCountryName(name); mark("country") }} />
                </div>
                {issue("country") ? <p className="mt-1 text-[12px] text-red-700">{issue("country")}</p> : null}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f3f4f6] p-1">
                {(["individual", "business"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    className={cn("h-9 rounded-lg text-[13px] font-medium", kind === option ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}
                  >
                    {option === "individual" ? "Individual" : "Business"}
                  </button>
                ))}
              </div>
              {kind === "business" ? (
                <label className="block">
                  <span className={LABEL}>Business name</span>
                  <input className={FIELD} value={businessName} autoComplete="organization" onBlur={() => mark("businessName")} onChange={(e) => setBusinessName(e.target.value)} />
                  {issue("businessName") ? <span className="mt-1 block text-[12px] text-red-700">{issue("businessName")}</span> : null}
                </label>
              ) : null}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>First name</span>
                  <input className={FIELD} value={firstName} autoComplete="given-name" onBlur={() => mark("firstName")} onChange={(e) => setFirstName(e.target.value)} />
                  {issue("firstName") ? <span className="mt-1 block text-[12px] text-red-700">{issue("firstName")}</span> : null}
                </label>
                <label className="block">
                  <span className={LABEL}>Last name</span>
                  <input className={FIELD} value={lastName} autoComplete="family-name" onBlur={() => mark("lastName")} onChange={(e) => setLastName(e.target.value)} />
                  {issue("lastName") ? <span className="mt-1 block text-[12px] text-red-700">{issue("lastName")}</span> : null}
                </label>
              </div>
              <button type="submit" disabled={busy} className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#111827] text-[14px] font-semibold text-white hover:bg-[#1f2937] disabled:opacity-60">
                {busy ? "Saving" : "Continue"}
              </button>
            </form>
          ) : phase === "embed" ? (
            <div>
              <PayoutNote name={hint?.accountName ?? ""} currency={hint?.currency ?? null} />
              <StripeConnectEmbedded
                key={embedKey}
                purpose={embedPurpose}
                onStep={setEmbedStep}
                onError={setError}
                onExit={async () => {
                  setPhase("idle")
                  await load("refresh")
                }}
              />
            </div>
          ) : beat === "done" ? (
            <p className="pb-1 text-center text-[13px] text-[#6b7280]">
              {data.payoutDestination?.last4 ? `Bank ···· ${data.payoutDestination.last4}` : "Payouts are on."}{" "}
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setEmbedPurpose("stripe_management")
                  setEmbedKey((k) => k + 1)
                  setPhase("embed")
                }}
                className="cursor-pointer font-medium text-[#111827] underline underline-offset-2"
              >
                Change bank
              </button>
            </p>
          ) : beat === "review" ? (
            <p className="pb-1 text-center text-[13px] text-[#6b7280]">Under review.</p>
          ) : (
            <div className="pb-1 text-center">
              <PayoutNote name={data.payoutHint?.accountName ?? ""} currency={data.payoutHint?.currency ?? null} />
              <button type="button" onClick={() => (hasAccount ? openEmbed() : setPhase("personal"))} className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#111827] text-[14px] font-semibold text-white hover:bg-[#1f2937]">
                {hasAccount ? "Continue" : "Set up payments"}
              </button>
            </div>
          )}
        </div>
      </StorelibPaymentsCard>

      {badge === "active" && primaryBal && !compact ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4 shadow-sm">
          <p className="text-[22px] font-semibold tabular-nums text-[#111827]">{money(primaryBal.availableMinor, primaryBal.currency)}</p>
          <p className="text-[12px] text-[#6b7280]">Available · {money(primaryBal.pendingMinor, primaryBal.currency)} pending</p>
        </section>
      ) : null}

      {!compact ? statementDescriptorSlot : null}
    </div>
  )
}

function PayoutNote({ name, currency }: { name: string; currency: string | null }) {
  if (!name && !currency) return null
  return (
    <div className="mb-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-[13px] leading-5 text-[#78350f]">
      <p className="font-medium text-[#92400e]">Payouts will fail unless this matches.</p>
      {currency ? <p>Account must be in {currency}.</p> : null}
      {name ? <p>Account must be in the name {name}.</p> : null}
    </div>
  )
}
