"use client"

import * as React from "react"
import { AlertCircle, Check } from "lucide-react"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { CountryPicker } from "@/components/app/settings/country-picker"
import { countryOf } from "@/lib/account/country"
import type { HubOverview } from "@/lib/payments/hub-types"
import { BADGE_COPY, type StorelibPaymentsBadge } from "@/lib/payments/stripe/creator-badge"
import { StripeConnectEmbedded } from "@/components/app/settings/stripe-connect-embedded"
import { cn } from "@/lib/utils"
import { money, type Overview } from "@/components/app/settings/payments-hub-shared"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-sm border border-[#e5e7eb]"
const PRIMARY =
  "inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-xl bg-[#1a1a2e] px-4 sm:px-5 text-[13px] sm:text-[14px] font-semibold text-white transition-colors hover:bg-[#26262b] disabled:opacity-60 cursor-pointer disabled:cursor-default"
const SECONDARY =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] disabled:opacity-60 cursor-pointer disabled:cursor-default"

const BADGE_CLASS: Record<StorelibPaymentsBadge, string> = {
  setup: "bg-[#f3f4f6] text-[#4b5563]",
  review: "bg-[#fef3c7] text-[#92400e]",
  action: "bg-[#ffedd5] text-[#c2410c]",
  active: "bg-[#d1fae5] text-[#047857]",
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/payments/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again in a moment.")
  return data
}

export function StorelibPaymentsSettings({ statementDescriptorSlot }: { statementDescriptorSlot?: React.ReactNode }) {
  const [data, setData] = React.useState<Overview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<null | "stripe_onboarding" | "stripe_management">(null)

  const load = React.useCallback(async (how: "overview" | "refresh" = "overview") => {
    try {
      const next = how === "refresh" ? await call<Overview>("refresh", {}) : await call<Overview>("overview")
      setData(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments.")
    }
  }, [])

  React.useEffect(() => {
    void load()
    const onVisible = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [load])

  const openSetup = () => setForm("stripe_onboarding")
  const openManage = () => setForm(data?.badge === "active" ? "stripe_management" : "stripe_onboarding")

  if (!data) {
    return error ? (
      <div className={CARD}>
        <p className="text-[14px] text-[#1a1a2e]">{error}</p>
        <button type="button" className={cn(SECONDARY, "mt-3")} onClick={() => void load()}>Try again</button>
      </div>
    ) : (
      <WaitingArea className="h-32" size={18} label="Loading payments" />
    )
  }

  if (!data.configured) {
    return (
      <div className={CARD}>
        <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Payments are not switched on yet</h3>
        <p className="mt-1 text-[13px] text-[#6b7280]">Storelib is still setting this up.</p>
      </div>
    )
  }

  const badge = data.badge ?? "setup"
  const badgeCopy = BADGE_COPY[badge]
  const primaryBal = data.balances[0]

  return (
    <div data-payments-hub="" data-badge={badge} className="space-y-[10px] sm:space-y-[14px]">
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      <section className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] sm:text-[16px] font-semibold text-[#1a1a2e]">Storelib Payments</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", BADGE_CLASS[badge])}>{badgeCopy.label}</span>
            </div>
            <p className="mt-1 text-[13px] text-[#6b7280]">{badgeCopy.line}</p>
            <p className="mt-1 text-[12px] text-[#9ca3af]">{data.checkoutOpen ? "Checkout is on for your products." : "Checkout stays off until setup is finished."}</p>
          </div>
          {badgeCopy.cta && data.stage !== "set_up" ? (
            <button type="button" className={PRIMARY} disabled={!!busy} onClick={() => openManage()}>
              {badgeCopy.cta}
            </button>
          ) : null}
        </div>

        {data.stage === "set_up" ? (
          <SetUp
            onDone={(next) => {
              setData(next)
              setForm("stripe_onboarding")
            }}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        ) : null}

        {form ? (
          <StripeConnectEmbedded
            purpose={form}
            onClose={() => setForm(null)}
            onDone={async () => {
              setForm(null)
              await load("refresh")
            }}
            onError={setError}
          />
        ) : null}
      </section>

      <section className={CARD}>
        <h4 className="text-[13px] font-semibold text-[#1a1a2e]">Payment methods</h4>
        <ul className="mt-2 space-y-1.5 text-[13px] text-[#374151]">
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#047857]" /> Cards</li>
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#047857]" /> Apple Pay</li>
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#047857]" /> Google Pay</li>
          <li className="text-[#9ca3af]">PayPal · Coming soon</li>
        </ul>
      </section>

      {badge === "active" && primaryBal ? (
        <section className={CARD}>
          <h4 className="text-[13px] font-semibold text-[#1a1a2e]">Balance</h4>
          <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#1a1a2e]">{money(primaryBal.availableMinor, primaryBal.currency)}</p>
          <p className="text-[12px] text-[#6b7280]">Available · {money(primaryBal.pendingMinor, primaryBal.currency)} pending</p>
          {data.payoutDestination?.last4 ? (
            <p className="mt-2 text-[13px] text-[#374151]">
              Bank account ·••• {data.payoutDestination.last4}
            </p>
          ) : null}
        </section>
      ) : null}

      {statementDescriptorSlot}

      {data.stage !== "set_up" && !form && badge !== "active" && badgeCopy.cta ? (
        <div className="flex justify-end">
          <button type="button" className={PRIMARY} onClick={() => openManage()}>{badgeCopy.cta}</button>
        </div>
      ) : null}
    </div>
  )
}

function SetUp({
  onDone,
  busy,
  setBusy,
  setError,
}: {
  onDone: (o: HubOverview) => void
  busy: string | null
  setBusy: (b: string | null) => void
  setError: (e: string | null) => void
}) {
  const [kind, setKind] = React.useState<"individual" | "business">("individual")
  const [countryName, setCountryName] = React.useState("")
  const [agree, setAgree] = React.useState(false)

  const start = async () => {
    if (busy) return
    const country = countryOf(countryName)
    if (!country) return setError("Choose your country.")
    if (!agree) return setError("Agree to continue.")
    setBusy("start")
    setError(null)
    try {
      onDone(await call<Overview>("start", { kind, country, agree: true }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not start setup. Try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 space-y-3.5 border-t border-[#f0f1f3] pt-4">
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-[#374151]">You are selling as</legend>
        <div role="radiogroup" className="inline-flex rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-0.5">
          {(["individual", "business"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-8 rounded-[10px] px-3.5 text-[13px] font-medium transition-colors cursor-pointer",
                kind === k ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#374151]",
              )}
            >
              {k === "individual" ? "Individual" : "Business"}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="payments-country" className="mb-1.5 block text-[13px] font-medium text-[#374151]">
          {kind === "business" ? "Where the business is registered" : "Where you live"}
        </label>
        <CountryPicker id="payments-country" value={countryName} onChange={setCountryName} />
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-5 text-[#4b5563]">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#8b5cf6]" />
        <span>I agree to Storelib Payments and to our payment partner collecting the verification details needed to pay me.</span>
      </label>
      <button type="button" className={PRIMARY} disabled={busy !== null} onClick={() => void start()}>
        {busy === "start" ? "Starting" : "Set up payments"}
      </button>
    </div>
  )
}
