"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, AlertTriangle, ChevronRight, Clock, CreditCard, Landmark, UserRound, X } from "lucide-react"
import type { OnboardingBeat } from "@/lib/payments/stripe/onboarding-steps"
import { STATUS_PILL, type StatusAction } from "@/lib/payments/stripe/status"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { PAYMENTS_SURFACE } from "@/components/app/settings/payments-layout"
import { ShimmerSwap } from "@/components/ui/shimmer"
import { cachedOverview, fetchOverview, rememberOverview } from "@/lib/payments/overview-cache"
import { StorelibPaymentsCard, StorelibPaymentsCardLoading } from "@/components/app/settings/storelib-payments-card"
import { PaymentsPanelWaiting, PaymentsSetupFlow, type SetupMode } from "@/components/app/settings/payments-setup-flow"
import { money, type Overview } from "@/components/app/settings/payments-hub-shared"
import { readsLikeStripe } from "@/lib/payments/verify-id"
import { prefetchAccountSession, warmStripeConnect } from "@/components/app/settings/stripe-connect-warm"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

/*
 * One rule for the whole of payments (lib/payments/verify-id.ts
 * readsLikeStripe), plus the two shapes only this card can be handed: a
 * stack trace and a body that came back as JSON rather than a sentence.
 */
function safeError(message: string): string {
  if (!message.trim() || readsLikeStripe(message) || /\n\s+at\s|\{\s*"/.test(message)) {
    return tt("Something went wrong. Try again in a moment.")
  }
  return message
}

/* The note to a creator who was on Airwallex is said once: closing it is remembered in this browser. */
const AIRWALLEX_NOTE_KEY = "storelib:payments:airwallex-note"

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/payments/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(safeError(data.error || tt("Something went wrong. Try again in a moment.")))
  return data
}

export function StorelibPaymentsSettings({
  statementDescriptorSlot,
  compact,
  manageRequest = 0,
  openAs = null,
  panelOnly,
  onPanelShown,
  initial = null,
}: {
  /** What the server already knows (no Stripe call): drawn at once, then replaced by the browser's fresh read. */
  initial?: Overview | null
  statementDescriptorSlot?: React.ReactNode
  compact?: boolean
  /** Raised by the page (Payouts' Update bank, its notices) to open the setup panel from outside. */
  manageRequest?: number
  /** A notice that Stripe still wants something: open the embedded setup, not the finished-account bank form. */
  openAs?: "setup" | null
  /** Only the panel, for a page that draws its own dashboard around it. */
  panelOnly?: boolean
  /** The panel is on screen: the button that asked for it can stop waiting. */
  onPanelShown?: () => void
}) {
  const router = useRouter()
  const wasOpen = React.useRef<boolean | null>(null)
  const [data, setShown] = React.useState<Overview | null>(() => cachedOverview() ?? initial)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false)
  const [panel, setPanel] = React.useState<{ open: boolean; mode: SetupMode }>({ open: false, mode: "setup" })
  const [airwallexNoteClosed, setAirwallexNoteClosed] = React.useState(false)
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(AIRWALLEX_NOTE_KEY)) setAirwallexNoteClosed(true)
    } catch {
      /* storage blocked: the note shows until Stripe is connected */
    }
  }, [])
  const closeAirwallexNote = () => {
    setAirwallexNoteClosed(true)
    try {
      window.localStorage.setItem(AIRWALLEX_NOTE_KEY, "1")
    } catch {
      /* closed for this visit only */
    }
  }

  const setData = React.useCallback((next: Overview) => {
    rememberOverview(next)
    setShown(next)
  }, [])

  const load = React.useCallback(async (how: "overview" | "refresh" = "overview") => {
    try {
      if (how === "refresh") setRefreshing(true)
      const next = how === "refresh" ? await call<Overview>("refresh", {}) : await fetchOverview()
      setData(next)
      setError(null)
    } catch (e) {
      setError(safeError(e instanceof Error ? e.message : tt("Could not load payments.")))
    } finally {
      setRefreshing(false)
    }
  }, [setData])

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
  const view = data?.paymentsStatus ?? null
  /*
   * Stripe asking for more after setup (a document, a new detail) is the
   * details form with only what it asked for, the way Gumroad comes back for
   * more: it used to fall through to the bank form, because setup was done.
   */
  /* Until payouts are on, every open is Stripe's embedded setup. Our own fields are only for a finished account: the bank, or a later review. */
  const modeFor = (action: StatusAction | undefined): SetupMode => {
    if (beat !== "done") return "setup"
    if (action === "bank" || action === "change_bank") return "bank"
    return "details"
  }

  /*
    THE PRESS OPENS IT, NOT THE ANSWER. This used to wait for the overview
    before opening, so Update bank did nothing visible for as long as that
    request took, which on a phone is most of a second. The panel opens on
    the press now; while the answer is still coming it is
    PaymentsPanelWaiting, in the same shell, and the real flow takes its
    place without the panel closing or moving.
  */
  React.useEffect(() => {
    if (manageRequest > 0) setPanel({ open: true, mode: openAs === "setup" ? "setup" : data ? modeFor(view?.action) : "bank" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageRequest])

  /* The answer landed while it was open: the mode it really wanted. A notice that more is due stays in Stripe's setup. */
  React.useEffect(() => {
    if (!data || manageRequest === 0) return
    setPanel((p) => (p.open ? { ...p, mode: openAs === "setup" ? "setup" : modeFor(view?.action) } : p))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data, manageRequest, openAs])

  React.useEffect(() => {
    if (panel.open) onPanelShown?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.open])

  /* ?setup=1: the phone app sent the creator here to finish in the browser. Opened once. */
  const handedOff = React.useRef(false)
  React.useEffect(() => {
    if (!data || handedOff.current || panelOnly) return
    const url = new URL(window.location.href)
    if (url.searchParams.get("setup") !== "1") return
    handedOff.current = true
    url.searchParams.delete("setup")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    if (view?.status !== "ACTIVE") setPanel({ open: true, mode: modeFor(view?.action) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data])

  React.useEffect(() => {
    if (!confirmDisconnect) return
    const t = window.setTimeout(() => setConfirmDisconnect(false), 4000)
    return () => window.clearTimeout(t)
  }, [confirmDisconnect])

  const openPanel = (mode: SetupMode) => setPanel({ open: true, mode })
  /*
   * THE FORM STARTS LOADING ON INTENT (components/app/settings/stripe-connect-warm).
   * A pointer over Set up payouts, a focus or the press itself: Stripe's
   * script is fetched, and when the press goes straight to Stripe's form (an
   * account already started, its country settled) the form's session is
   * made too, so it is ready by the time the panel has slid in.
   */
  const intent = () => {
    warmStripeConnect()
    if (!data || beat === "personal" || beat === "done" || data.setupCountry?.changeable) return
    prefetchAccountSession("stripe_onboarding")
  }
  const intentProps = { onPointerEnter: intent, onFocus: intent, onPointerDown: intent }
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

  /* Only the panel: the waiting one until the overview arrives, so the press is answered at once. */
  if (panelOnly) return flow ?? <PaymentsPanelWaiting open={panel.open} onClose={closePanel} label={panel.mode === "bank" ? tt("Payout account") : tt("Payments")} />

  const loading = !data && !error

  if (!data && error) {
    return (
      <div className={cn(PAYMENTS_SURFACE, "flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4 sm:px-6")}>
        <AlertCircle className="h-4 w-4 shrink-0 text-[#be123c]" />
        <p className="flex-1 text-[14px] text-[#1a1a2e]">{error}</p>
        <button type="button" className={cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]")} onClick={() => void load()}>
          {tt("Try again")}
        </button>
      </div>
    )
  }

  const checkoutLive = !!data?.checkoutOpen
  const status =
    checkoutLive
      ? STATUS_PILL.ACTIVE.label
      : view
        ? STATUS_PILL[view.status].label
        : data?.statusLabel ?? (beat === "done" ? tt("Payments active") : tt("Action required"))
  const live = checkoutLive || (view ? view.canCharge : beat === "done")
  const needsSomething = !checkoutLive && !!view && view.status !== "ACTIVE" && !!view.action
  const hasAccount = beat !== "personal"
  const canDisconnect = hasAccount && !data?.chargesEnabled

  const disconnect = async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      /* The button has already asked twice (Disconnect, then Confirm): that is the creator's yes. */
      setData(await call<Overview>("disconnect", { confirm: true }))
      setConfirmDisconnect(false)
    } catch (e) {
      setError(safeError(e instanceof Error ? e.message : tt("Could not disconnect.")))
    } finally {
      setBusy(false)
    }
  }

  const primaryBal = data?.balances[0]

  const hub = data && data.configured ? (
    <div data-payments-hub="" data-badge={data.badge} className="space-y-3">
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-3 py-2.5 text-[13px] text-[#9f1239]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      {/* Paid through Airwallex before Storelib moved to Stripe, and Stripe is not set up yet (lib/payments/service overview). */}
      {data.airwallexBefore && !airwallexNoteClosed ? (
        <div role="status" data-airwallex-note="" className="flex items-start gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#d97706]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("Connect Stripe to keep selling")}</p>
            <p className="text-[12px] leading-[17px] text-[#6b7280]">{tt("Storelib takes payments through Stripe now, not Airwallex. Your past orders stay as they are.")}</p>
          </div>
          <button type="button" onClick={closeAirwallexNote} aria-label={tt("Close")} className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca3af] hover:bg-[#f4f4f6] hover:text-[#6b7280]">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <StorelibPaymentsCard
        status={status}
        quiet={beat === "done" || beat === "review"}
        onRefresh={() => void load("refresh")}
        refreshing={refreshing}
        footer={
          canDisconnect && beat !== "review" ? (
            <div className="mx-4 mb-4 flex flex-col gap-3 rounded-xl border border-[#eceef1] bg-[#f9fafb] px-3.5 py-3 sm:mx-5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-start gap-3 sm:flex-1">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#d97706]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[#1a1a2e]">{tt("Setup not finished")}</p>
                  <p className="text-[12px] leading-[17px] text-[#6b7280]">{tt("Finish above, or disconnect to start over.")}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void disconnect()}
                className={cn(secondaryDepth, "h-10 w-full rounded-lg px-3 text-[13px] sm:h-8 sm:w-auto sm:shrink-0", confirmDisconnect && "border-[#fecdd3] text-[#be123c]")}
              >
                {busy ? tt("Disconnecting") : confirmDisconnect ? tt("Confirm") : tt("Disconnect")}
              </button>
            </div>
          ) : null
        }
      >
        {live ? (
          <div className="border-t border-[#f1f2f4]">
            {needsSomething && view ? (
              <Notice
                title={view.title}
                line={view.line}
                deadline={view.deadline}
                action={view.actionLabel}
                href={view.action === "support" ? "mailto:support@storelib.com" : undefined}
                onClick={() => openPanel(modeFor(view.action))}
                intentProps={intentProps}
              />
            ) : null}
            <Row
              icon={<Landmark className="h-4 w-4" />}
              title={tt("Payout account")}
              line={data.payoutDestination?.last4 ? maskedBank(data.payoutDestination) : tt("Add a bank account")}
              action={data.payoutDestination?.last4 ? "Change" : "Add"}
              onClick={() => openPanel(beat === "done" ? "bank" : "setup")}
            />
            <Row icon={<UserRound className="h-4 w-4" />} title={tt("Account details")} line={tt("Name, address and identity")} action="Review" onClick={() => openPanel(beat === "done" ? "details" : "setup")} />
          </div>
        ) : view?.status === "VERIFYING" || (!view && beat === "review") ? (
          <Empty icon={<Clock className="h-5 w-5" />} title={tt("Verification in progress")} line={tt("We're checking your information. No action is needed right now.")} />
        ) : view?.action === "support" && !checkoutLive ? (
          <Empty icon={<AlertCircle className="h-5 w-5" />} title={view.title} line={view.line} action={view.actionLabel ?? "Contact support"} href="mailto:support@storelib.com" />
        ) : (
          <Empty
            title={view && view.status !== "NOT_STARTED" ? view.title : tt("Get paid with Storelib")}
            line={view && view.status !== "NOT_STARTED" ? view.line : tt("Receive earnings directly to your bank account.")}
            action={view?.actionLabel ?? (hasAccount ? "Continue setup" : "Set up payouts")}
            onClick={() => openPanel(modeFor(view?.action))}
            intentProps={intentProps}
          />
        )}
      </StorelibPaymentsCard>

      {data.badge === "active" && primaryBal && !compact ? (
        <section className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4">
          <p className="text-[12px] font-medium text-[#6b7280]">{tt("Available")}</p>
          <p className="mt-0.5 text-[22px] font-semibold tabular-nums text-[#1a1a2e]">{money(primaryBal.availableMinor, primaryBal.currency)}</p>
          <p className="text-[12px] text-[#6b7280]">{tt("{amount} on the way", { amount: money(primaryBal.pendingMinor, primaryBal.currency) })}</p>
        </section>
      ) : null}

      {!compact ? statementDescriptorSlot : null}
      {flow}
    </div>
  ) : data ? (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-5 sm:px-6">
      <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Storelib Payments")}</h3>
      <p className="mt-1 text-[13px] text-[#6b7280]">{tt("Payments are not switched on yet.")}</p>
    </div>
  ) : null

  return (
    <div className={PAYMENTS_SURFACE} data-storelib-payments-loading={loading ? "" : undefined}>
      <ShimmerSwap loading={loading} skeleton={<StorelibPaymentsCardLoading />}>{hub}</ShimmerSwap>
    </div>
  )
}

/** "RO•• •••• •••• 4821 · RON": the country and the last four, never more. */
function maskedBank(b: { country?: string | null; last4?: string | null; currency?: string | null; bankName?: string | null }): string {
  const lead = b.country ? `${b.country.toUpperCase()}•• •••• •••• ` : `${b.bankName || tt("Bank")} •••• `
  return `${lead}${b.last4}${b.currency ? ` · ${b.currency.toUpperCase()}` : ""}`
}

type IntentProps = { onPointerEnter?: () => void; onFocus?: () => void; onPointerDown?: () => void }

function Empty({ icon, title, line, action, onClick, href, intentProps }: { icon?: React.ReactNode; title: string; line: string; action?: string; onClick?: () => void; href?: string; intentProps?: IntentProps }) {
  return (
    <div className="border-t border-[#f1f2f4] px-4 py-8 text-center sm:px-10 sm:py-12">
      {icon ? <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f3ff] text-[#635bff]">{icon}</span> : null}
      <h4 className={cn("text-[16px] font-semibold text-[#1a1a2e] sm:text-[17px]", icon ? "mt-3" : "")}>{title}</h4>
      <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-5 text-[#6b7280] sm:text-[14px]">{line}</p>
      {action && href ? (
        <a href={href} className={cn(primaryDepth, "mt-6 inline-flex h-11 items-center justify-center rounded-xl px-6 text-[14px] sm:min-w-[200px] max-sm:w-full")}>
          {action}
        </a>
      ) : action ? (
        <button type="button" onClick={onClick} {...intentProps} className={cn(primaryDepth, "mt-6 h-11 rounded-xl px-6 text-[14px] sm:min-w-[200px] max-sm:w-full")}>
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

/** Payments are on, and Stripe wants something: one line, one action, and the date if there is one. */
function Notice({ title, line, deadline, action, href, onClick, intentProps }: { title: string; line: string; deadline: string | null; action: string | null; href?: string; onClick: () => void; intentProps?: IntentProps }) {
  const by = deadline ? new Date(deadline).toLocaleDateString(appLocale(), zoned({ day: "numeric", month: "short", year: "numeric" })) : null
  const cls = cn(primaryDepth, "inline-flex h-10 w-full items-center justify-center rounded-lg px-3 text-[13px] sm:h-8 sm:w-auto sm:shrink-0")
  return (
    <div role="status" data-payments-notice="" className="mx-4 my-3 flex flex-col gap-3 rounded-xl border border-[#fedf89] bg-[#fffcf5] px-3.5 py-3 sm:mx-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-start gap-3 sm:flex-1">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#d97706]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[#1a1a2e]">{title}</p>
          <p className="text-[12px] leading-[17px] text-[#6b7280]">
            {line}
            {by ? tt(" Needed by {by}.", { by }) : ""}
          </p>
        </div>
      </div>
      {action && href ? (
        <a href={href} className={cls}>{action}</a>
      ) : action ? (
        <button type="button" onClick={onClick} {...intentProps} className={cls}>{action}</button>
      ) : null}
    </div>
  )
}
