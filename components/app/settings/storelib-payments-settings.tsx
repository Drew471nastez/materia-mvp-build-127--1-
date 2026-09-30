"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"
import type { StorelibPaymentsBadge } from "@/lib/payments/stripe/creator-badge"
import { StripeConnectEmbedded } from "@/components/app/settings/stripe-connect-embedded"
import { StorelibPaymentsCard, StorelibPaymentsCardSkeleton } from "@/components/app/settings/storelib-payments-card"
import { StorelibPayoutSetupForm } from "@/components/app/settings/storelib-payout-setup-form"
import { money, type Overview } from "@/components/app/settings/payments-hub-shared"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-sm border border-[#e5e7eb]"

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
  const [editing, setEditing] = React.useState(false)
  const [verify, setVerify] = React.useState(false)

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
  }, [load])

  const badge = (data?.badge ?? "setup") as StorelibPaymentsBadge
  const status =
    badge === "active"
      ? { label: "Active", tone: "green" as const }
      : badge === "review"
        ? { label: "Under review", tone: "amber" as const }
        : { label: "Action needed", tone: "amber" as const }

  const save = async (body: Record<string, string | boolean>) => {
    if (busy) return
    setBusy("save")
    setError(null)
    try {
      const result = await call<{ overview: Overview; needsVerification: boolean }>("profile", body)
      setData(result.overview)
      setEditing(false)
      setVerify(result.needsVerification)
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not save that.")
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (busy) return
    setBusy("disconnect")
    setError(null)
    try {
      setData(await call<Overview>("disconnect", {}))
      setEditing(false)
      setVerify(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect.")
    } finally {
      setBusy(null)
    }
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
  const hasAccount = data.stage !== "set_up"
  const showDisconnect = hasAccount && !data.chargesEnabled

  return (
    <div data-payments-hub="" data-badge={badge} className="space-y-[10px] sm:space-y-[14px]">
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      <StorelibPaymentsCard
        status={status}
        onRefresh={() => void load("refresh")}
        refreshing={refreshing}
        footer={
          showDisconnect && !editing ? (
            <div className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-xl bg-[#f7f7f8] px-3.5 py-3 sm:mx-5">
              <div>
                <p className="text-[13px] font-medium text-[#111827]">Setup is not finished</p>
                <p className="text-[12px] text-[#6b7280]">Finish the form above, or disconnect and start again.</p>
              </div>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void disconnect()}
                className="inline-flex h-8 shrink-0 items-center rounded-full border border-[#e5e7eb] bg-white px-3 text-[12px] font-medium text-[#374151] hover:bg-[#f9fafb] disabled:opacity-60"
              >
                Disconnect
              </button>
            </div>
          ) : null
        }
      >
        {verify ? (
          <div className="border-t border-[#f3f4f6] px-4 py-4 sm:px-5">
            <StripeConnectEmbedded
              purpose="stripe_onboarding"
              onClose={() => setVerify(false)}
              onDone={async () => {
                setVerify(false)
                await load("refresh")
              }}
              onError={setError}
            />
          </div>
        ) : editing ? (
          <StorelibPayoutSetupForm busy={busy === "save"} onSubmit={save} />
        ) : data.stage === "set_up" ? (
          <AddInformation onStart={() => setEditing(true)} bankLine={data.payoutDestination?.last4} />
        ) : (
          <div className="border-t border-[#f3f4f6] px-4 py-5 text-center sm:px-5">
            <p className="text-[15px] font-semibold text-[#111827]">
              {badge === "active" ? "Payments and payouts are on" : "We still need a few details"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-[#6b7280]">
              {data.payoutDestination?.last4
                ? `Bank account ending ${data.payoutDestination.last4}.`
                : "Your bank account is not on file yet."}
            </p>
            {badge !== "active" ? (
              <button
                type="button"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-[#111827] px-5 text-[14px] font-semibold text-white"
                onClick={() => (badge === "action" ? setVerify(true) : setEditing(true))}
              >
                {badge === "action" ? "Add information" : "Continue setup"}
              </button>
            ) : null}
          </div>
        )}
      </StorelibPaymentsCard>

      {!compact ? (
        <section className={CARD}>
          <div className="flex items-center justify-between">
            <h4 className="text-[14px] font-semibold text-[#111827]">Other payment providers</h4>
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

function AddInformation({ onStart, bankLine }: { onStart: () => void; bankLine?: string | null }) {
  return (
    <div className="border-t border-[#f3f4f6] px-4 py-8 text-center sm:px-5">
      <p className="text-[15px] font-semibold text-[#111827]">Add information to start accepting money</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-[#6b7280]">
        Storelib uses Stripe to pay you and to keep your bank details off Storelib. {bankLine ? `Account ending ${bankLine}.` : "You will add the account payouts are sent to."}
      </p>
      <button type="button" onClick={onStart} className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-[#111827] px-5 text-[14px] font-semibold text-white hover:bg-[#1f2937]">
        Add information
      </button>
    </div>
  )
}
