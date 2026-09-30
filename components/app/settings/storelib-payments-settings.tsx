"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, AlertTriangle, ChevronRight, Clock, CreditCard, Landmark, UserRound } from "lucide-react"
import type { OnboardingBeat } from "@/lib/payments/stripe/onboarding-steps"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { StorelibPaymentsCard, StorelibPaymentsCardSkeleton } from "@/components/app/settings/storelib-payments-card"
import { PaymentsSetupFlow, type SetupMode } from "@/components/app/settings/payments-setup-flow"
import { money, type Overview } from "@/components/app/settings/payments-hub-shared"
import { cn } from "@/lib/utils"

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
  panelOnly,
}: {
  statementDescriptorSlot?: React.ReactNode
  compact?: boolean
  /** Raised by the page (Payouts' Update bank, its notices) to open the setup panel from outside. */
  manageRequest?: number
  /** Only the panel, for a page that draws its own dashboard around it. */
  panelOnly?: boolean
}) {
  const router = useRouter()
  const wasOpen = React.useRef<boolean | null>(null)
  const [data, setData] = React.useState<Overview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false)
  const [panel, setPanel] = React.useState<{ open: boolean; mode: SetupMode }>({ open: false, mode: "setup" })

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

  /* Checkout just opened for this creator: the page around the card (Payouts) redraws as the dashboard. */
  React.useEffect(() => {
    if (!data) return
    if (wasOpen.current === false && data.checkoutOpen) router.refresh()
    wasOpen.current = data.checkoutOpen
  }, [data, router])

  const beat: OnboardingBeat = data?.beat ?? "personal"

  React.useEffect(() => {
    if (manageRequest > 0 && data) setPanel({ open: true, mode: beat === "done" ? "bank" : "setup" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageRequest, !!data])

  React.useEffect(() => {
    if (!confirmDisconnect) return
    const t = window.setTimeout(() => setConfirmDisconnect(false), 4000)
    return () => window.clearTimeout(t)
  }, [confirmDisconnect])

  const openPanel = (mode: SetupMode) => setPanel({ open: true, mode })
  const closePanel = React.useCallback(() => setPanel((p) => ({ ...p, open: false })), [])

  const flow = data?.configured ? (
    <PaymentsSetupFlow
      open={panel.open}
      mode={panel.mode}
      data={data}
      onClose={closePanel}
      onData={setData}
      onFinished={() => {
        void load("refresh")
        router.refresh()
      }}
    />
  ) : null

  if (panelOnly) return flow

  if (!data && !error) return <StorelibPaymentsCardSkeleton />

  if (!data) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4">
        <AlertCircle className="h-4 w-4 shrink-0 text-[#be123c]" />
        <p className="flex-1 text-[14px] text-[#1a1a2e]">{error}</p>
        <button type="button" className={cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]")} onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  }

  if (!data.configured) {
    return (
      <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-[#e5e7eb] bg-white px-5 py-5">
        <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Storelib Payments</h3>
        <p className="mt-1 text-[13px] text-[#6b7280]">Payments are not switched on yet.</p>
      </div>
    )
  }

  const status = data.statusLabel ?? (beat === "done" ? "Payments active" : "Action required")
  const hasAccount = beat !== "personal"
  const canDisconnect = hasAccount && !data.chargesEnabled

  const disconnect = async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      setData(await call<Overview>("disconnect", {}))
      setConfirmDisconnect(false)
    } catch (e) {
      setError(safeError(e instanceof Error ? e.message : "Could not disconnect."))
    } finally {
      setBusy(false)
    }
  }

  const primaryBal = data.balances[0]

  return (
    <div data-payments-hub="" data-badge={data.badge} className="mx-auto w-full max-w-[560px] space-y-3">
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-3 py-2.5 text-[13px] text-[#9f1239]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      <StorelibPaymentsCard
        status={status}
        quiet={beat === "done" || beat === "review"}
        onRefresh={() => void load("refresh")}
        refreshing={refreshing}
        footer={
          canDisconnect && beat !== "review" ? (
            <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl border border-[#eceef1] bg-[#f9fafb] px-3.5 py-3 sm:mx-5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#d97706]" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#1a1a2e]">Setup not finished</p>
                <p className="text-[12px] text-[#6b7280]">Finish above, or disconnect to start over.</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void disconnect()}
                className={cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]", confirmDisconnect && "border-[#fecdd3] text-[#be123c]")}
              >
                {busy ? "Disconnecting" : confirmDisconnect ? "Confirm" : "Disconnect"}
              </button>
            </div>
          ) : null
        }
      >
        {beat === "done" ? (
          <div className="border-t border-[#f1f2f4]">
            <Row
              icon={<Landmark className="h-4 w-4" />}
              title="Payout account"
              line={data.payoutDestination?.last4 ? `${data.payoutDestination.bankName || "Bank"} ···· ${data.payoutDestination.last4}${data.payoutDestination.currency ? ` · ${data.payoutDestination.currency.toUpperCase()}` : ""}` : "Bank account on file"}
              action="Update"
              onClick={() => openPanel("bank")}
            />
            <Row icon={<UserRound className="h-4 w-4" />} title="Account details" line="Name, address and identity" action="Edit" onClick={() => openPanel("details")} />
          </div>
        ) : beat === "review" ? (
          <Empty
            icon={<Clock className="h-5 w-5" />}
            title="Your details are being reviewed"
            line="This usually takes a few minutes. We will email you if anything else is needed."
          />
        ) : (
          <Empty
            icon={<CreditCard className="h-5 w-5" />}
            title="Add information to start accepting payments"
            line={hasAccount ? "Pick up where you left off." : "Takes about five minutes. Everything stays in Storelib."}
            action={hasAccount ? "Continue setup" : "Add information"}
            onClick={() => openPanel("setup")}
          />
        )}
      </StorelibPaymentsCard>

      {data.badge === "active" && primaryBal && !compact ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4">
          <p className="text-[12px] font-medium text-[#6b7280]">Available</p>
          <p className="mt-0.5 text-[22px] font-semibold tabular-nums text-[#1a1a2e]">{money(primaryBal.availableMinor, primaryBal.currency)}</p>
          <p className="text-[12px] text-[#6b7280]">{money(primaryBal.pendingMinor, primaryBal.currency)} on the way</p>
        </section>
      ) : null}

      {!compact ? statementDescriptorSlot : null}
      {flow}
    </div>
  )
}

function Empty({ icon, title, line, action, onClick }: { icon: React.ReactNode; title: string; line: string; action?: string; onClick?: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f3ff] text-[#635bff]">{icon}</span>
      <h4 className="mt-3 text-[15px] font-semibold text-[#1a1a2e]">{title}</h4>
      <p className="mt-1 max-w-[340px] text-[13px] leading-5 text-[#6b7280]">{line}</p>
      {action ? (
        <button type="button" onClick={onClick} className={cn(primaryDepth, "mt-4 h-10 rounded-xl px-5 text-[14px] max-sm:h-11 max-sm:w-full")}>
          {action}
        </button>
      ) : null}
    </div>
  )
}

function Row({ icon, title, line, action, onClick }: { icon: React.ReactNode; title: string; line: string; action: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#fafafb] active:bg-[#f4f4f6] sm:px-5 [&+&]:border-t [&+&]:border-[#f1f2f4]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#eceef1] bg-[#f7f7f8] text-[#6b7280]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[#1a1a2e]">{title}</span>
        <span className="block truncate text-[12px] text-[#6b7280]">{line}</span>
      </span>
      <span className="flex items-center gap-0.5 text-[13px] font-medium text-[#1a1a2e]">
        {action}
        <ChevronRight className="h-4 w-4 text-[#9ca3af] transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}
