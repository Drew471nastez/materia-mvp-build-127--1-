"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"
import { CountryPicker } from "@/components/app/settings/country-picker"
import { countryOf } from "@/lib/account/country"
import type { HubOverview } from "@/lib/payments/hub-types"
import { BADGE_COPY, type StorelibPaymentsBadge } from "@/lib/payments/stripe/creator-badge"
import { StripeConnectEmbedded } from "@/components/app/settings/stripe-connect-embedded"
import { StorelibPaymentsCard, StorelibPaymentsCardSkeleton } from "@/components/app/settings/storelib-payments-card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { money, type Overview } from "@/components/app/settings/payments-hub-shared"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-sm border border-[#e5e7eb]"
const PRIMARY =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#111827] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#1f2937] disabled:opacity-60 cursor-pointer disabled:cursor-default"

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

export function StorelibPaymentsSettings({
  statementDescriptorSlot,
  compact,
}: {
  statementDescriptorSlot?: React.ReactNode
  compact?: boolean
}) {
  const [data, setData] = React.useState<Overview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<null | "stripe_onboarding" | "stripe_management">(null)

  const load = React.useCallback(async (how: "overview" | "refresh" = "overview") => {
    try {
      if (how === "refresh") setRefreshing(true)
      const next = how === "refresh" ? await call<Overview>("refresh", {}) : await call<Overview>("overview")
      setData(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments.")
    } finally {
      setRefreshing(false)
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

  const badge = (data?.badge ?? "setup") as StorelibPaymentsBadge
  const badgeCopy = BADGE_COPY[badge]
  const accepting = data?.chargesEnabled === true
  const payingOut = data?.payoutsEnabled === true
  const bankLine = data?.payoutDestination?.last4
    ? `${data.payoutDestination.bankName ? `${data.payoutDestination.bankName} ` : ""}···· ${data.payoutDestination.last4}`
    : "Add a bank account"

  const openFlow = () => {
    setError(null)
    if (!data || data.stage === "set_up" || !data.kind) {
      setForm(null)
    } else {
      setForm(badge === "active" ? "stripe_management" : "stripe_onboarding")
    }
    setOpen(true)
  }

  const closeFlow = () => {
    setOpen(false)
    setForm(null)
    void load("refresh")
  }

  if (!data && !error) return <StorelibPaymentsCardSkeleton />

  if (!data) {
    return (
      <div className={CARD}>
        <p className="text-[14px] text-[#111827]">{error}</p>
        <button type="button" className="mt-3 inline-flex h-9 items-center rounded-lg border border-[#e5e7eb] px-3 text-[13px] font-medium" onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  }

  if (!data.configured) {
    return (
      <div className={CARD}>
        <h3 className="text-[15px] font-semibold text-[#111827]">Storelib Payments</h3>
        <p className="mt-1 text-[13px] text-[#6b7280]">Payments are not switched on yet.</p>
      </div>
    )
  }

  const primaryBal = data.balances[0]
  const manageLabel = badge === "setup" ? "Set up" : badge === "action" ? "Resolve" : badge === "review" ? "View" : "Manage"

  return (
    <div data-payments-hub="" data-badge={badge} className="space-y-[10px] sm:space-y-[14px]">
      {error && !open ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      <StorelibPaymentsCard
        accepting={accepting}
        payingOut={payingOut}
        bankLine={bankLine}
        manageLabel={manageLabel}
        onManage={openFlow}
        manageDisabled={!!busy}
        onRefresh={() => void load("refresh")}
        refreshing={refreshing}
      />

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeFlow())}>
        <DialogContent className="max-h-[min(860px,92vh)] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Storelib Payments</DialogTitle>
          </DialogHeader>
          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
            </div>
          ) : null}
          {!form ? (
            <SetUp
              onDone={(next) => {
                setData(next)
                setForm("stripe_onboarding")
              }}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
            />
          ) : (
            <StripeConnectEmbedded
              purpose={form}
              onClose={closeFlow}
              onDone={async () => {
                setForm(null)
                setOpen(false)
                await load("refresh")
              }}
              onError={setError}
            />
          )}
          <p className="text-[12px] leading-5 text-[#6b7280]">{badgeCopy.line}</p>
        </DialogContent>
      </Dialog>

      {!compact ? (
        <section className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-[14px] font-semibold text-[#111827]">Additional payment providers</h4>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">Offer methods processed outside Storelib checkout.</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-[#e5e7eb] px-3.5 py-3">
            <span className="text-[13px] text-[#111827]">PayPal</span>
            <span className="text-[12px] text-[#9ca3af]">Coming soon</span>
          </div>
        </section>
      ) : null}

      {badge === "active" && primaryBal ? (
        <section className={CARD}>
          <h4 className="text-[13px] font-semibold text-[#111827]">Balance</h4>
          <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#111827]">{money(primaryBal.availableMinor, primaryBal.currency)}</p>
          <p className="text-[12px] text-[#6b7280]">Available · {money(primaryBal.pendingMinor, primaryBal.currency)} pending</p>
        </section>
      ) : null}

      {!compact ? statementDescriptorSlot : null}
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
    <div className="space-y-3.5">
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
                kind === k ? "bg-white text-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#374151]",
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
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#111827]" />
        <span>I agree to Storelib Payments and to identity checks required to pay me. Storelib does not store your full bank number.</span>
      </label>
      <button type="button" className={PRIMARY} disabled={busy !== null} onClick={() => void start()}>
        {busy === "start" ? "Starting" : "Continue"}
      </button>
    </div>
  )
}
