"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { isNativeApp, openExternal } from "@/lib/native-bridge"
import {
  Settings, Shield, ToggleLeft, Wallet, CreditCard,
  Check, Loader2, Download, FileText, Clock, CheckCircle, XCircle, AlertCircle,
  Lock, Pencil, ExternalLink, X, ChevronDown, Globe,
} from "lucide-react"
import Link from "next/link"
import { useLanguage } from "@/lib/i18n"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { createPortal } from "react-dom"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { CancelPlanDialog } from "@/components/app/billing/cancel-plan-dialog"
import type { CancelReason } from "@/lib/billing/cancel-reasons"
import { formatPlanPrice, offeredPlan, withPlanLabel, type OfferedPlanId, type PlanId } from "@/lib/billing/plans"
import { StatusBadge, card as CARD } from "@/app/app/orders/order-parts"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"
import { appLocale, zoned } from "@/lib/i18n/format"

const TABS = [
  { id: "general", get label() { return tt("General") }, icon: Settings },
  { id: "security", get label() { return tt("Security") }, icon: Shield },
  { id: "payments", get label() { return tt("Payments") }, icon: Wallet },
  { id: "billing", get label() { return tt("Billing") }, icon: CreditCard },
  { id: "domains", get label() { return tt("Domains") }, icon: Globe },
  { id: "privacy", get label() { return tt("Privacy") }, icon: ToggleLeft },
] as const

type TabId = typeof TABS[number]["id"]

interface BillingPageClientProps {
  initialData: {
    plans: any[]
    subscription: any | null
    currentPlan: any
    invoices: any[]
    paymentMethod: any | null
  }
  /**
   * Drawn INSIDE the settings tabs rather than as its own page.
   *
   * Billing used to be a route, and it carried its own copy of the settings
   * heading and tab bar so it looked like the rest of settings when you
   * arrived there. Inside the tabs that copy is a second heading and a
   * second row of pills under the real ones — which is the tell that you
   * have gone somewhere else, and the thing to remove.
   */
  embedded?: boolean
}

/**
 * ONE COLUMN FOR THE WHOLE TAB. The plan cards are a 720px pair
 * (components/billing/plan-cards); the overview and the history used to run
 * the settings column's full width under them, so the tab had two right
 * edges and the cards looked like they floated. Now all three sit in the
 * cards' column, from the same left edge as every other settings panel.
 */
const PLAN_COLUMN = "w-full max-w-[720px]"

export function BillingPageClient({ initialData, embedded = false }: BillingPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string; visible: boolean } | null>(null)
  const notifTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const closeInvoice = useCallback(() => setSelectedInvoice(null), [])
  const [showUpgradeModal, setShowUpgradeModal] = useState<{ planId: string; planName: string; priceCents: number } | null>(null)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [resumeBusy, setResumeBusy] = useState(false)
  const [upgradePreview, setUpgradePreview] = useState<{ amountDueTodayCents: number; nextBillingDate: string; nextAmountCents: number; type: "upgrade" | "downgrade" } | null>(null)

  // Refs for auto-scrolling tab navigation on mobile
  const tabNavRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)

  // Auto-scroll tab nav to active tab on mount (mobile)
  useEffect(() => {
    if (activeTabRef.current && tabNavRef.current) {
      const container = tabNavRef.current
      const activeEl = activeTabRef.current
      const scrollLeft = activeEl.offsetLeft - container.offsetWidth / 2 + activeEl.offsetWidth / 2
      container.scrollTo({ left: scrollLeft, behavior: "smooth" })
    }
  }, [])

  // Local state for billing data - allows client-side mutations to update UI immediately
  const [livePaymentMethod, setLivePaymentMethod] = useState<any | null>(initialData.paymentMethod)
  const [liveSubscription, setLiveSubscription] = useState<any | null>(initialData.subscription)
  const [liveCurrentPlan, setLiveCurrentPlan] = useState<any>(initialData.currentPlan)
  const [liveInvoices, setLiveInvoices] = useState<any[]>(initialData.invoices)
  const [refreshing, setRefreshing] = useState(false)

  // Sync from initialData when server data changes (e.g. router.refresh())
  useEffect(() => {
    setLivePaymentMethod(initialData.paymentMethod)
    setLiveSubscription(initialData.subscription)
    setLiveCurrentPlan(initialData.currentPlan)
    setLiveInvoices(initialData.invoices)
  }, [initialData.paymentMethod, initialData.subscription, initialData.currentPlan, initialData.invoices])

  // Client-side refresh of billing data from API (fallback when server data is stale)
  const refreshBillingData = useCallback(async () => {
    setRefreshing(true)
    try {
      // Fetch subscription status (which triggers Stripe sync on server)
      const subRes = await fetch("/api/billing/subscription")
      if (subRes.ok) {
        const subData = await subRes.json()
        // Always update from API (source of truth from Stripe)
        setLiveSubscription(subData.subscription || null)
        setLiveCurrentPlan(subData.currentPlan || initialData.currentPlan)
      }
    } catch (err) {
      console.error("[Billing] Client refresh error:", err)
    }
    try {
      // Fetch invoices
      const invRes = await fetch("/api/billing/invoices")
      if (invRes.ok) {
        const invData = await invRes.json()
        if (invData.invoices?.length) {
          setLiveInvoices(invData.invoices)
        }
      }
    } catch (err) {
      console.error("[Billing] Client invoice refresh error:", err)
    }
    setRefreshing(false)
  }, [initialData.currentPlan])

  // Refresh billing data from Stripe on mount so status is always current
  // (handles the case where user canceled via Stripe portal then navigated back)
  useEffect(() => {
    refreshBillingData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const success = searchParams.get("success")
    const setupSuccess = searchParams.get("setup_success")
    const canceled = searchParams.get("canceled")

    if (success === "1" || success === "true") {
      showNotification("success", tt("You are on Pro now"))
      window.history.replaceState({}, "", "/app/settings/billing")
      router.refresh()
    } else if (setupSuccess === "1" || setupSuccess === "true") {
      showNotification("success", tt("Card updated"))
      window.history.replaceState({}, "", "/app/settings/billing")
      router.refresh()
    } else if (canceled === "1" || canceled === "true") {
      showNotification("error", tt("Checkout canceled. Nothing changed."))
      window.history.replaceState({}, "", "/app/settings/billing")
    }
  }, [searchParams])

  const showNotification = (type: "success" | "error", message: string) => {
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current)
    setNotification({ type, message, visible: true })
    notifTimeoutRef.current = setTimeout(() => {
      setNotification(prev => prev ? { ...prev, visible: false } : null)
      setTimeout(() => setNotification(null), 400)
    }, 5000)
  }

  const dismissNotification = () => {
    setNotification(prev => prev ? { ...prev, visible: false } : null)
    setTimeout(() => setNotification(null), 400)
  }

  const handleTabChange = (tabId: TabId) => {
    if (tabId === "billing") return
    router.push(`/app/settings?tab=${tabId}`)
  }

  const openCustomerPortal = async () => {
    setPortalLoading(true)
    try {
      const response = await fetch("/api/billing/customer-portal", { method: "POST" })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || tt("Failed to open portal"))
      }
      const { url } = await response.json()
      window.location.href = url
    } catch (error: any) {
      showNotification("error", error.message || tt("Could not open billing. Try again."))
    } finally {
      setPortalLoading(false)
    }
  }

  const handleAddPaymentMethod = async () => {
    setPortalLoading(true)
    try {
      const response = await fetch("/api/billing/checkout/setup", { method: "POST" })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || tt("Failed to open payment setup"))
      }
      const { url } = await response.json()
      window.location.href = url
    } catch (error: any) {
      showNotification("error", error.message || tt("Could not open card setup. Try again."))
    } finally {
      setPortalLoading(false)
    }
  }

  /*
    CANCEL PLAN: at the end of the period paid for, through Stripe
    (app/api/billing/subscription/cancel), with the reason from the dialog.
    The overview turns to "Pro until <date>" with Resume plan at once; the
    refresh after it reads Stripe again.
  */
  const confirmCancel = async (feedback: { reason: CancelReason | null; note: string }) => {
    setCancelBusy(true)
    setCancelError(null)
    try {
      const response = await fetch("/api/billing/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: feedback.reason, note: feedback.note }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || tt("Could not cancel. Nothing changed."))
      const endsAt = liveSubscription?.current_period_end || result.cancelAt || null
      setLiveSubscription((prev: any) => (prev ? { ...prev, cancel_at_period_end: true, pending_plan_id: null, current_period_end: endsAt ?? prev.current_period_end } : prev))
      setCancelOpen(false)
      showNotification("success", endsAt ? tt("{name} until {date}", { name: currentPlan.name, date: formatDate(endsAt) }) : tt("Plan cancelled"))
      setTimeout(() => refreshBillingData(), 1000)
    } catch (error: any) {
      setCancelError(error.message || tt("Could not cancel. Nothing changed."))
    } finally {
      setCancelBusy(false)
    }
  }

  /* RESUME PLAN: undoes the cancel, same subscription, nothing charged now (app/api/billing/subscription/resume). */
  const resumePlan = async () => {
    setResumeBusy(true)
    try {
      const response = await fetch("/api/billing/subscription/resume", { method: "POST" })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || tt("Could not resume. Try again."))
      setLiveSubscription((prev: any) => (prev ? { ...prev, cancel_at_period_end: false } : prev))
      const renews = result.renewsAt || liveSubscription?.current_period_end
      showNotification("success", renews ? tt("{name} renews on {date}", { name: currentPlan.name, date: formatDate(renews) }) : tt("{name} is back on", { name: currentPlan.name }))
      setTimeout(() => refreshBillingData(), 1000)
    } catch (error: any) {
      showNotification("error", error.message || tt("Could not resume. Try again."))
    } finally {
      setResumeBusy(false)
    }
  }

  const openUpgradeModal = async (planId: string, planName: string, priceCents: number) => {
    setShowUpgradeModal({ planId, planName, priceCents })
    setUpgradePreview(null)

    if (!isSubscribed) return

    try {
      const response = await fetch("/api/billing/subscription/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPlanId: planId, previewOnly: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || tt("Failed to preview plan change"))
      setUpgradePreview({
        amountDueTodayCents: result.amountDueTodayCents || 0,
        nextBillingDate: result.nextBillingDate,
        nextAmountCents: result.nextAmountCents || 0,
        type: result.type,
      })
    } catch (error: any) {
      showNotification("error", error.message || tt("Failed to preview plan change"))
    }
  }

  const getTabLabel = (tabId: string) => {
    switch (tabId) {
      case "general": return t("settings.general")
      case "security": return t("settings.security")
      case "privacy": return t("settings.privacy")
      case "billing": return t("settings.billing")
      case "payments": return t("settings.payments")
      case "domains": return tt("Domains")
      default: return tabId
    }
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: "numeric" }))
  const formatDateLong = (dateString: string) => new Date(dateString).toLocaleDateString(appLocale(), zoned({ month: "long", day: "numeric", year: "numeric" }))
  const formatAmount = (cents: number) => `$${(cents / 100).toFixed(2)}`

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <StatusBadge tone="success">{tt("Paid")}</StatusBadge>
      case "open":
        return <StatusBadge tone="attention">{tt("Pending")}</StatusBadge>
      case "void": case "uncollectible":
        return <StatusBadge tone="critical">{tt("Failed")}</StatusBadge>
      default:
        return <StatusBadge tone="neutral">{status.charAt(0).toUpperCase() + status.slice(1)}</StatusBadge>
    }
  }

  // Use live state (updated by client-side actions). Named for people, not by
  // id: internal "growth" is sold as Pro, and the earlier "pro" is also Pro.
  const currentPlan = withPlanLabel(liveCurrentPlan)
  const subscription = liveSubscription
  const isSubscribed = subscription && (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due")
  const planPrice = formatPlanPrice(currentPlan.price_cents || 0)
  /* "3% + $0.25": the rate as the plan cards write it, with no trailing zero. */
  const feeDisplay = `${Number((currentPlan.fee_percent * 100).toFixed(2))}% + $${(currentPlan.fee_fixed_cents / 100).toFixed(2)}`

  // Detect pending downgrade (scheduled plan change)
  const pendingPlanId = subscription?.pending_plan_id || null
  const plans = initialData.plans.map(withPlanLabel)
  const pendingPlan = pendingPlanId && pendingPlanId !== currentPlan.id ? plans.find((p: any) => p.id === pendingPlanId) : null
  /* Cancel plan is for a paid plan that is running and not already set to end. Free has nothing to cancel. */
  const canCancel = Boolean(isSubscribed && !subscription.cancel_at_period_end && currentPlan.price_cents > 0)
  const isEnding = Boolean(isSubscribed && subscription.cancel_at_period_end)

  /* What a plan includes is on the plan cards (components/billing/plan-cards), not repeated here. */

  return (
    /* Inside the settings tabs the page is Settings, which the shell's
       scroller scrolls. A scroller of its own here was as tall as what is in
       it, so it had nowhere to go, and `overflow-y: scroll` painted an empty
       track down the right of the billing tab, beside the page's real one. */
    <div className={embedded ? "bg-[#fafafa]" : "h-full overflow-y-scroll overflow-x-hidden page-scroll bg-[#fafafa]"} style={embedded ? undefined : { scrollbarGutter: "stable" }}>
      {/*
        Inside Settings the page's own column (the same max width, gutters
        and padding) is already around this, so the tab adds none of its
        own: it used to, and the Billing tab sat 16px further in on every
        side than General beside it. Nor does it clip: Settings' column
        already cuts anything sideways at the edge of its gutters, and a clip
        here, on the content edge, cut the plan cards' shadows off flat.
      */}
      <div className={embedded ? "" : "max-w-4xl mx-auto app-gutter py-6 sm:py-8 pb-16 sm:pb-32 overflow-x-hidden"}>
        {/* Header — the page owns this when billing is a tab. */}
        {!embedded && (
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] sm:text-[28px] font-bold text-[#1a1a2e]">{t("settings.title")}</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">{t("settings.subtitle")}</p>
          </div>
        </div>
        )}

        {/* Tab Navigation — likewise. */}
        {!embedded && (
        <div ref={tabNavRef} className="mb-6 sm:mb-8 overflow-x-auto app-gutter-bleed sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex gap-1 p-1 w-fit h-[44px] sm:h-[48px] items-center">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = tab.id === "billing"
              return (
                <button key={tab.id} ref={isActive ? activeTabRef : undefined} onClick={() => handleTabChange(tab.id)} className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium transition-colors whitespace-nowrap cursor-pointer border ${isActive ? "bg-[#f3f4f6] text-[#1a1a2e] border-[#e5e7eb]" : "text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border-transparent"}`}>
                  <Icon className="h-4 w-4" />
                  <span>{getTabLabel(tab.id)}</span>
                </button>
              )
            })}
          </div>
        </div>
        )}

        {/* Notification is now a fixed toast at top of screen - rendered at end of component */}

        {/* Three sections, the same distance apart, in one column (PLAN_COLUMN). 40px on a phone, 48 from 640: room for the plan cards' shadow before the next heading. */}
        <div data-billing-column="" className={cn(PLAN_COLUMN, "space-y-10 sm:space-y-12")}>

          {/* ---- FIRST: the plans, the same cards the plans page shows. What you could be on comes before what you are on (the owner's order: plans, then the overview, the card and the history). ---- */}
          <PricingTiers
            plans={plans}
            currentPlan={currentPlan}
            subscription={subscription}
            loading={loading}
            setLoading={setLoading}
            showNotification={showNotification}
            router={router}
            onUpgradeClick={(planId, planName, priceCents) => openUpgradeModal(planId, planName, priceCents)}
            pendingPlanId={pendingPlanId}
            onCancelClick={canCancel ? () => { setCancelError(null); setCancelOpen(true) } : undefined}
          />

          {/*
            ---- SECTION 1: Subscription Overview ----
            Two cards in Storelib's own surface (the white card, a hairline
            and a 1px shade), side by side from 1024px and stacked under it:
            the plan and what it costs, then the card it is paid with. The
            buttons are the app's depth buttons, near black for the one step
            forward and white for the rest. No uppercase labels, no badge
            for a plan that is simply on.
          */}
          <div data-billing-overview="">
            <h2 className="text-[17px] font-bold text-[#1a1a2e] mb-4">{tt("Subscription Overview")}</h2>
            {/* Side by side from 768px, where the plan cards pair up too, with the same 20px between them. */}
            <div data-billing-overview-grid="" className="grid grid-cols-1 gap-5 md:grid-cols-2">

              {/* Left: Current Plan */}
              <div data-billing-plan="" className={cn(CARD, "flex flex-col app-card-x py-5")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#6b7280]">{tt("Current plan")}</p>
                    <p className="mt-1 text-[22px] font-bold leading-7 text-[#1a1a2e]">{currentPlan.name}</p>
                  </div>
                  {subscription?.status === "canceled" ? (
                    <StatusBadge tone="critical">{tt("Canceled")}</StatusBadge>
                  ) : subscription?.cancel_at_period_end ? (
                    <StatusBadge tone="attention">{tt("Canceling")}</StatusBadge>
                  ) : isSubscribed ? (
                    <StatusBadge tone="success">{tt("Active")}</StatusBadge>
                  ) : null}
                </div>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-[34px] font-bold leading-none tracking-[-0.02em] text-[#1a1a2e] tabular-nums">{planPrice}</span>
                  {currentPlan.price_cents > 0 && <span className="text-[14px] text-[#6b7280]">{tt("/month")}</span>}
                </div>

                <dl className="mt-4 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3] text-[14px]">
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-[#6b7280]">{tt("Fee per sale")}</dt>
                    <dd className="font-medium text-[#1a1a2e] tabular-nums">{feeDisplay}</dd>
                  </div>
                  {subscription?.current_period_end && subscription.status !== "canceled" ? (
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-[#6b7280]">{subscription.cancel_at_period_end ? tt("Ends") : tt("Renews")}</dt>
                      <dd className={cn("font-medium tabular-nums", subscription.cancel_at_period_end ? "text-[#8a5a00]" : "text-[#1a1a2e]")}>{formatDate(subscription.current_period_end)}</dd>
                    </div>
                  ) : null}
                  {pendingPlan && subscription?.current_period_end ? (
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-[#6b7280]">{tt("Then")}</dt>
                      <dd className="font-medium text-[#1a1a2e]">{tt("{name}, {amount}/month", { name: pendingPlan.name, amount: formatPlanPrice(pendingPlan.price_cents) })}</dd>
                    </div>
                  ) : null}
                </dl>

                {/* Cancelled at the period's end: the plan is on until its last day, then Free. Resume plan below undoes it. */}
                {isEnding && (
                  <p data-billing-ends="" className="mt-4 rounded-xl bg-[#fff8e6] px-3.5 py-3 text-[13px] leading-5 text-[#7a5200]">
                    <span className="font-semibold">{tt("{name} until {date}", { name: currentPlan.name, date: formatDate(subscription.current_period_end) })}</span>{tt(", then Free. Nothing more is charged.")}
                  </p>
                )}
                {/* Fully canceled subscription notice */}
                {subscription?.status === "canceled" && (
                  <p className="mt-4 rounded-xl bg-[#fef3f2] px-3.5 py-3 text-[13px] leading-5 text-[#8a1c0f]">
                    {subscription.canceled_at
                      ? tt("Your {value} plan was canceled on {date}.", { value: plans.find((p: any) => p.id === subscription.plan_id)?.name || "paid", date: formatDate(subscription.canceled_at) })
                      : tt("Your paid plan was canceled.")}{" "}
                    {tt("You are on Free now.")}
                  </p>
                )}

                {/* On a phone the buttons are one full width column; from 640 a row that shares the width, each on its own line when two do not fit. */}
                <div className="mt-auto flex flex-col gap-2.5 pt-5 sm:flex-row sm:flex-wrap">
                  {(currentPlan.id === "free" || subscription?.status === "canceled") && !isSubscribed && (
                    <Link href="/app/settings/billing/upgrade" className={cn(primaryDepth, "h-10 rounded-xl px-4 text-[14px] no-underline sm:flex-1")}>
                      {subscription?.status === "canceled" ? tt("Start Pro again") : tt("Upgrade to Pro")}
                    </Link>
                  )}
                  {isEnding && (
                    <button type="button" onClick={resumePlan} disabled={resumeBusy} aria-busy={resumeBusy} data-billing-resume="" className={cn(primaryDepth, "h-10 rounded-xl px-4 text-[14px] sm:flex-1")}>
                      {resumeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      {tt("Resume plan")}
                    </button>
                  )}
                  {/* Pro (id "growth") is the top plan on sale, so there is nothing to upgrade to from it. */}
                  {isSubscribed && (
                    <button type="button" onClick={openCustomerPortal} disabled={portalLoading} className={cn(secondaryDepth, "h-10 rounded-xl px-4 text-[14px] whitespace-nowrap sm:flex-1")}>
                      {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {tt("Manage subscription")}
                    </button>
                  )}
                  {canCancel ? (
                    <button type="button" onClick={() => { setCancelError(null); setCancelOpen(true) }} data-billing-cancel="" className={cn(secondaryDepth, "h-10 rounded-xl px-4 text-[14px] text-[#b42318] whitespace-nowrap sm:flex-1")}>
                      {tt("Cancel plan")}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Right: Payment Details */}
              <div data-billing-card="" className={cn(CARD, "flex flex-col app-card-x py-5")}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-medium text-[#6b7280]">{tt("Payment method")}</p>
                  <span className="inline-flex items-center gap-1 text-[12px] text-[#9ca3af]">
                    <Lock className="h-3 w-3" aria-hidden />
                    {tt("Kept by Stripe")}
                  </span>
                </div>

                {livePaymentMethod ? (
                  /* The card on file, drawn as a card: its brand, its last four and when it ends, on the app's ink. */
                  <div className="relative mt-4 overflow-hidden rounded-[14px] bg-[#1a1a2e] px-4 pb-4 pt-3.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_-14px_rgba(17,17,40,0.6),0_2px_6px_rgba(17,17,40,0.18)]">
                    <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-white/[0.06]" />
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-semibold capitalize">{livePaymentMethod.card_brand || tt("Card")}</span>
                      <CreditCard className="h-4 w-4 text-white/60" aria-hidden />
                    </div>
                    <p className="mt-6 font-mono text-[16px] tracking-[0.18em] tabular-nums">&bull;&bull;&bull;&bull; {livePaymentMethod.card_last4}</p>
                    <p className="mt-1.5 text-[12px] text-white/65">{tt("Expires")} {String(livePaymentMethod.card_exp_month).padStart(2, "0")}/{String(livePaymentMethod.card_exp_year).slice(-2)}</p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[14px] border border-dashed border-[#d9dbe0] bg-[#fafafb] px-4 py-6 text-center">
                    <CreditCard className="mx-auto h-6 w-6 text-[#9ca3af]" aria-hidden />
                    <p className="mt-2 text-[14px] font-medium text-[#1a1a2e]">{tt("No card on file")}</p>
                    <p className="mt-0.5 text-[13px] text-[#6b7280]">{tt("Add one to pay for Pro.")}</p>
                  </div>
                )}

                <div className="mt-4">
                  <TrustBadges />
                </div>

                <div className="mt-auto flex pt-5">
                  <button type="button" onClick={handleAddPaymentMethod} disabled={portalLoading} className={cn(secondaryDepth, "h-10 rounded-xl px-4 text-[14px] max-sm:flex-1")}>
                    {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {livePaymentMethod ? tt("Update card") : tt("Add card")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/*
            ---- SECTION 2: Billing History ----
            Above the plans: what has been paid first, then what can be
            bought. One list on every width: the date and what it was for,
            the amount, its status, and a download at the end on a computer.
            A row opens the invoice.
          */}
          <div data-billing-history="" className={cn(CARD, "overflow-hidden")}>
            <div className="flex items-center justify-between gap-3 app-card-x pb-2 pt-5">
              <h2 className="text-[17px] font-bold text-[#1a1a2e]">{tt("Billing History")}</h2>
              {liveInvoices.length > 0 && (
                <button type="button" onClick={openCustomerPortal} disabled={portalLoading} className={cn(secondaryDepth, "h-8 rounded-lg px-3 text-[13px]")}>
                  {tt("View all")}
                </button>
              )}
            </div>

            <div className="app-card-x pb-3">
              {subscription?.current_period_end && isSubscribed && !subscription.cancel_at_period_end ? (
                <p className="text-[13px] text-[#6b7280]">
                  {tt("Next charge on")} <span className="font-medium text-[#374151]">{formatDateLong(subscription.current_period_end)}</span>
                  {pendingPlan ? <>{tt(", then {name} at {amount}/month", { name: pendingPlan.name, amount: formatPlanPrice(pendingPlan.price_cents) })}</> : null}.
                </p>
              ) : subscription?.current_period_end && subscription.cancel_at_period_end ? (
                <p className="text-[13px] text-[#7a5200]">{tt("No more charges. Pro ends on {date}.", { date: formatDateLong(subscription.current_period_end) })}</p>
              ) : subscription?.status === "canceled" ? (
                <p className="text-[13px] text-[#6b7280]">
                  {tt("Your subscription was canceled.")}{" "}
                  <Link href="/app/settings/billing/upgrade" className="font-medium text-[#1a1a2e] underline underline-offset-2">{tt("Start Pro again")}</Link>
                </p>
              ) : (
                <p className="text-[13px] text-[#6b7280]">{tt("No subscription. Free has no monthly charge.")}</p>
              )}
            </div>

            {liveInvoices.length === 0 ? (
              <div className="border-t border-[#f0f1f3] app-card-x py-8 text-center">
                <FileText className="mx-auto h-6 w-6 text-[#c4c7cc]" aria-hidden />
                <p className="mt-2 text-[14px] font-medium text-[#1a1a2e]">{tt("No invoices yet")}</p>
                <p className="mt-0.5 text-[13px] text-[#6b7280]">{tt("Each charge lands here with its invoice.")}</p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-[#f0f1f3] border-t border-[#f0f1f3]">
                  {(showAllInvoices ? liveInvoices : liveInvoices.slice(0, 4)).map((invoice: any) => (
                    <li key={invoice.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedInvoice(invoice)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedInvoice(invoice) } }}
                        className="flex min-h-[60px] cursor-pointer items-center gap-3 app-card-x py-3 transition-colors duration-100 hover:bg-[#fafafb] active:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-[#1a1a2e]">
                            {invoice.description || (invoice.period_start && invoice.period_end ? tt("{date} to {date2}", { date: formatDate(invoice.period_start), date2: formatDate(invoice.period_end) }) : tt("Subscription"))}
                          </p>
                          <p className="mt-0.5 text-[13px] text-[#6b7280] tabular-nums">{formatDate(invoice.created_at)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-[14px] font-medium text-[#1a1a2e] tabular-nums">{formatAmount(invoice.amount_cents)}</span>
                          <span className="max-sm:hidden">{getStatusBadge(invoice.status)}</span>
                          {invoice.invoice_pdf_url ? (
                            <a
                              href={invoice.invoice_pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              aria-label={tt("Download invoice")}
                              className="hidden h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] sm:inline-flex"
                            >
                              <Download className="h-4 w-4" aria-hidden />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                {liveInvoices.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setShowAllInvoices(!showAllInvoices)}
                    className="flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 border-t border-[#f0f1f3] text-[13px] font-medium text-[#4b5563] transition-colors hover:bg-[#fafafb]"
                  >
                    {showAllInvoices ? tt("Show fewer") : tt("Show all {length}", { length: liveInvoices.length })}
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showAllInvoices ? "rotate-180" : ""}`} />
                  </button>
                )}
              </>
            )}
          </div>

        </div>
      </div>

      {/* Invoice Detail Modal (Desktop). On the body: inside Settings' page (640 to 1023px, a layer under the app's header) it was drawn under the header. */}
      {selectedInvoice && typeof document !== "undefined" &&
        createPortal(
          <div className="hidden sm:block">
            <InvoiceModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} formatDate={formatDate} formatAmount={formatAmount} getStatusBadge={getStatusBadge} currentPlan={currentPlan} />
          </div>,
          document.body,
        )}

      {/* Invoice Detail Bottom Sheet (Mobile). Always mounted, so it can
          slide out after the invoice is cleared: the sheet keeps what it was
          showing until it is gone. */}
      <BottomSheet
        isOpen={!!selectedInvoice}
        onClose={closeInvoice}
        label={tt("Invoice Details")}
        header={
          <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 pb-3 pt-2">
            <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Invoice Details")}</h3>
            <button onClick={closeInvoice} aria-label={tt("Close")} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#6b7280] active:bg-[#e5e7eb]"><X className="h-4 w-4" /></button>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="p-5">
            <InvoiceContent invoice={selectedInvoice} formatDate={formatDate} formatAmount={formatAmount} getStatusBadge={getStatusBadge} currentPlan={currentPlan} />
          </div>
        )}
      </BottomSheet>

      <CancelPlanDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        planName={currentPlan.name}
        endsAt={subscription?.current_period_end ?? null}
        busy={cancelBusy}
        error={cancelError}
        onConfirm={confirmCancel}
      />

      {/* Upgrade Confirmation Modal */}
      {/* Fixed notification toast */}
      {notification && (
        <div className="fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-3 left-0 right-0 z-[200] flex justify-center pointer-events-none">
          <div className={`pointer-events-auto bg-[#18181b] text-white rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-2.5 max-w-[calc(100vw-2rem)] whitespace-nowrap transition-all duration-300 ease-out ${notification.visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`}>
            {notification.type === "success" ? <Check className="h-3.5 w-3.5 shrink-0 text-white" strokeWidth={2.5} /> : <X className="h-3.5 w-3.5 shrink-0 text-red-400" strokeWidth={2.5} />}
            <p className="min-w-0 truncate text-[13px] font-medium">{notification.message}</p>
            <button onClick={dismissNotification} className="shrink-0 text-white/40 hover:text-white transition-colors cursor-pointer ml-1"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <UpgradeConfirmModal
          planId={showUpgradeModal.planId}
          planName={showUpgradeModal.planName}
          priceCents={showUpgradeModal.priceCents}
          currentPlan={currentPlan}
          subscription={subscription}
          isSubscribed={!!isSubscribed}
          cancelAtPeriodEnd={!!subscription?.cancel_at_period_end}
          loading={upgradeLoading}
          preview={upgradePreview}
          onConfirm={async () => {
            setUpgradeLoading(true)
            try {
              if (isSubscribed) {
                const response = await fetch("/api/billing/subscription/change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPlanId: showUpgradeModal.planId }) })
                const result = await response.json()
                if (!response.ok) { throw new Error(result.error || tt("Failed to change plan")) }
                showNotification("success", result.message || tt("Now on {planName}", { planName: showUpgradeModal.planName }))
                // Optimistically update state
                if (result.type === "downgrade") {
                  setLiveSubscription((prev: any) => prev ? { ...prev, pending_plan_id: showUpgradeModal.planId } : prev)
                } else if (result.type === "upgrade") {
                  // Clear pending/cancel state on upgrade
                  setLiveSubscription((prev: any) => prev ? { ...prev, pending_plan_id: null, cancel_at_period_end: false } : prev)
                  // Update current plan optimistically
                  const newPlan = initialData.plans.find((p: any) => p.id === showUpgradeModal.planId)
                  if (newPlan) setLiveCurrentPlan(newPlan)
                }
                setShowUpgradeModal(null)
                router.refresh()
                // Also refresh client-side billing data
                setTimeout(() => refreshBillingData(), 1000)
              } else {
                const response = await fetch("/api/billing/subscription/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: showUpgradeModal.planId }) })
                if (!response.ok) { const error = await response.json(); throw new Error(error.error || tt("Failed to create checkout session")) }
                const { checkoutUrl } = await response.json()
                if (checkoutUrl) {
                  if (isNativeApp()) {
                    openExternal(checkoutUrl)
                  } else {
                    window.open(checkoutUrl, "_blank", "noopener,noreferrer")
                  }
                }
              }
            } catch (error: any) {
              setShowUpgradeModal(null)
              showNotification("error", error.message || tt("An error occurred"))
            } finally {
              setUpgradeLoading(false)
            }
          }}
          onClose={() => { setShowUpgradeModal(null); setUpgradePreview(null) }}
        />
      )}
    </div>
  )
}

/* ============================================================
   Trust Badges
   ============================================================ */
function TrustBadges() {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Visa */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#E5E7EB" />
        <path d="M25.7516 27.4332H21.8901L24.3054 13.4325H28.1667L25.7516 27.4332Z" fill="#15195A" />
        <path d="M39.7499 13.7748C38.9882 13.4915 37.7802 13.1787 36.2865 13.1787C32.4731 13.1787 29.7878 15.0851 29.7713 17.8106C29.7396 19.8215 31.6939 20.9384 33.1556 21.6089C34.6495 22.2941 35.1574 22.7413 35.1574 23.352C35.1422 24.29 33.9502 24.7223 32.8384 24.7223C31.2967 24.7223 30.4707 24.4994 29.2153 23.9776L28.7069 23.7539L28.1665 26.8967C29.0722 27.2835 30.7408 27.6268 32.4731 27.6419C36.5249 27.6419 39.1627 25.765 39.1939 22.8605C39.2093 21.2667 38.1774 20.0454 35.9526 19.0475C34.602 18.4069 33.7749 17.9749 33.7749 17.3195C33.7908 16.7236 34.4745 16.1133 35.9991 16.1133C37.2544 16.0834 38.1768 16.3663 38.8755 16.6494L39.2247 16.7981L39.7499 13.7748Z" fill="#15195A" />
        <path fillRule="evenodd" clipRule="evenodd" d="M46.6618 13.4325H49.6486L52.7639 27.433H49.1885C49.1885 27.433 48.8386 25.8244 48.7278 25.3328H43.7699C43.6266 25.705 42.9595 27.433 42.9595 27.433H38.9078L44.6435 14.5941C45.0409 13.6855 45.7407 13.4325 46.6618 13.4325ZM46.4238 18.556C46.4238 18.556 45.2001 21.6689 44.8821 22.4732H48.0918C47.933 21.7733 47.2017 18.4219 47.2017 18.4219L46.9319 17.2156C46.8182 17.5262 46.6539 17.9533 46.543 18.2414C46.4679 18.4366 46.4173 18.568 46.4238 18.556Z" fill="#15195A" />
        <path fillRule="evenodd" clipRule="evenodd" d="M5.1589 13.4325H11.3716C12.2138 13.462 12.8971 13.7152 13.1194 14.6094L14.4696 21.0422C14.4697 21.0426 14.4699 21.043 14.47 21.0434L14.8832 22.9796L18.6649 13.4325H22.7481L16.6785 27.4184H12.5951L9.15337 15.253C7.96587 14.6021 6.6106 14.0786 5.09534 13.7154L5.1589 13.4325Z" fill="#15195A" />
      </svg>
      {/* Mastercard */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#E5E7EB" />
        <path d="M34.3102 28.9765H23.9591V10.5122H34.3102V28.9765Z" fill="#FF5F00" />
        <path d="M24.6223 19.7429C24.6223 15.9973 26.3891 12.6608 29.1406 10.5107C27.1285 8.93843 24.5892 7.99998 21.8294 7.99998C15.2961 7.99998 10 13.2574 10 19.7429C10 26.2283 15.2961 31.4857 21.8294 31.4857C24.5892 31.4857 27.1285 30.5473 29.1406 28.975C26.3891 26.8249 24.6223 23.4884 24.6223 19.7429" fill="#EB001B" />
        <path d="M48.2706 19.7429C48.2706 26.2283 42.9745 31.4857 36.4412 31.4857C33.6814 31.4857 31.1421 30.5473 29.1293 28.975C31.8815 26.8249 33.6483 23.4884 33.6483 19.7429C33.6483 15.9973 31.8815 12.6608 29.1293 10.5107C31.1421 8.93843 33.6814 7.99998 36.4412 7.99998C42.9745 7.99998 48.2706 13.2574 48.2706 19.7429" fill="#F79E1B" />
      </svg>
      {/* Apple Pay */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#E5E7EB" />
        <path fillRule="evenodd" clipRule="evenodd" d="M17.5771 14.9265C17.1553 15.4313 16.4803 15.8294 15.8053 15.7725C15.7209 15.09 16.0513 14.3649 16.4381 13.9171C16.8599 13.3981 17.5982 13.0284 18.1959 13C18.2662 13.7109 17.992 14.4076 17.5771 14.9265ZM18.1888 15.9076C17.5942 15.873 17.0516 16.0884 16.6133 16.2624C16.3313 16.3744 16.0924 16.4692 15.9107 16.4692C15.7068 16.4692 15.4581 16.3693 15.1789 16.2571C14.813 16.1102 14.3947 15.9422 13.956 15.9502C12.9506 15.9645 12.0154 16.5403 11.5021 17.4573C10.4474 19.2915 11.2279 22.0071 12.2474 23.5C12.7467 24.2393 13.3443 25.0498 14.1318 25.0213C14.4783 25.0081 14.7275 24.9012 14.9854 24.7905C15.2823 24.6631 15.5908 24.5308 16.0724 24.5308C16.5374 24.5308 16.8324 24.6597 17.1155 24.7834C17.3847 24.9011 17.6433 25.014 18.0271 25.0071C18.8428 24.9929 19.356 24.2678 19.8553 23.5284C20.394 22.7349 20.6307 21.9605 20.6667 21.843L20.6709 21.8294C20.67 21.8285 20.6634 21.8254 20.6516 21.82C20.4715 21.7366 19.095 21.0995 19.0818 19.391C19.0686 17.957 20.1736 17.2304 20.3476 17.116C20.3582 17.109 20.3653 17.1043 20.3685 17.1019C19.6654 16.0498 18.5685 15.936 18.1888 15.9076ZM23.8349 24.9289V13.846H27.9482C30.0717 13.846 31.5553 15.3246 31.5553 17.4858C31.5553 19.6469 30.0435 21.1398 27.892 21.1398H25.5365V24.9289H23.8349ZM25.5365 15.2962H27.4982C28.9748 15.2962 29.8185 16.0924 29.8185 17.4929C29.8185 18.8934 28.9748 19.6967 27.4912 19.6967H25.5365V15.2962ZM37.1732 23.5995C36.7232 24.4668 35.7318 25.0142 34.6631 25.0142C33.081 25.0142 31.9771 24.0616 31.9771 22.6256C31.9771 21.2038 33.0459 20.3863 35.0217 20.2654L37.1451 20.1374V19.5261C37.1451 18.6232 36.5615 18.1327 35.5209 18.1327C34.6631 18.1327 34.0373 18.5806 33.9107 19.263H32.3779C32.4271 17.827 33.7631 16.782 35.5701 16.782C37.5177 16.782 38.7834 17.8128 38.7834 19.4123V24.9289H37.2084V23.5995H37.1732ZM35.1201 23.6991C34.2131 23.6991 33.6365 23.2583 33.6365 22.5829C33.6365 21.8863 34.192 21.481 35.2537 21.4171L37.1451 21.2962V21.9218C37.1451 22.9597 36.2732 23.6991 35.1201 23.6991ZM44.0076 25.3626C43.3256 27.3033 42.5451 27.9431 40.8857 27.9431C40.7592 27.9431 40.3373 27.9289 40.2388 27.9005V26.5711C40.3443 26.5853 40.6045 26.5995 40.7381 26.5995C41.4904 26.5995 41.9123 26.2796 42.1724 25.4479L42.3271 24.9573L39.4443 16.8886H41.2232L43.2271 23.436H43.2623L45.2662 16.8886H46.9959L44.0076 25.3626Z" fill="#000000" />
      </svg>
      {/* Google Pay */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#E5E7EB" />
        <path fillRule="evenodd" clipRule="evenodd" d="M27.9174 24.1182V19.6071V19.6062H30.3578C31.3639 19.6068 32.2095 19.2907 32.8945 18.6578C33.5868 18.0571 33.9738 17.1935 33.9541 16.2934C33.9678 15.3982 33.5815 14.541 32.8945 13.9422C32.2155 13.3059 31.3023 12.9587 30.3578 12.9778H26.4404V24.1182H27.9174ZM27.9174 18.2382V14.3494V14.3485H30.3945C30.9466 14.3334 31.4788 14.5487 31.856 14.9396C32.2355 15.2971 32.4496 15.7881 32.4496 16.3009C32.4496 16.8137 32.2355 17.3048 31.856 17.6622C31.4741 18.0449 30.9436 18.254 30.3945 18.2382H27.9174Z" fill="#5F6368" />
        <path fillRule="evenodd" clipRule="evenodd" d="M39.9431 17.0951C39.3113 16.5297 38.4496 16.2471 37.3578 16.2471C35.9554 16.2471 34.8963 16.7448 34.1807 17.7404L35.4817 18.5342C35.9624 17.8598 36.6153 17.5226 37.4404 17.5226C37.9664 17.5167 38.4755 17.703 38.8661 18.0444C39.2555 18.3564 39.4795 18.8215 39.4762 19.3111V19.6382C38.9086 19.3271 38.1863 19.1715 37.3092 19.1715C36.2817 19.1727 35.4603 19.4062 34.845 19.872C34.2297 20.3377 33.922 20.965 33.922 21.7537C33.9086 22.4719 34.2302 23.1577 34.7973 23.6204C35.3807 24.1182 36.1058 24.3671 36.9725 24.3671C37.9878 24.3671 38.8012 23.9315 39.4129 23.0604H39.4771V24.1182H40.8899V19.4204C40.8905 18.4355 40.5749 17.6604 39.9431 17.0951ZM35.9367 22.7182C35.6273 22.5021 35.4448 22.1544 35.4468 21.7848C35.4468 21.3697 35.6477 21.024 36.0523 20.7395C36.4529 20.4592 36.9532 20.3191 37.5532 20.3191C38.3771 20.3191 39.0193 20.4968 39.4798 20.8524C39.4798 21.4533 39.2352 21.9768 38.7459 22.4231C38.3052 22.8501 37.7077 23.0905 37.0844 23.0915C36.6689 23.099 36.2634 22.9672 35.9367 22.7182Z" fill="#5F6368" />
        <path fillRule="evenodd" clipRule="evenodd" d="M49 16.496L44.0679 27.4782H42.5431L44.3734 23.6355L41.1303 16.496H42.7358L45.0798 21.9715H45.1119L47.3917 16.496H49Z" fill="#5F6368" />
        <path fillRule="evenodd" clipRule="evenodd" d="M21.9486 18.6347C21.9492 18.1986 21.9111 17.7632 21.8349 17.3334H15.6055V19.7983H19.1734C19.0259 20.5938 18.5493 21.2964 17.8541 21.7432V23.3432H19.9835C21.2303 22.2294 21.9486 20.5823 21.9486 18.6347Z" fill="#4285F4" />
        <path fillRule="evenodd" clipRule="evenodd" d="M15.6055 24.8889C17.3881 24.8889 18.889 24.3217 19.9835 23.344L17.8541 21.744C17.2615 22.1333 16.4982 22.3555 15.6055 22.3555C13.8826 22.3555 12.4202 21.2302 11.8973 19.7137H9.70367V21.3626C10.8249 23.5244 13.1085 24.8887 15.6055 24.8889Z" fill="#34A853" />
        <path fillRule="evenodd" clipRule="evenodd" d="M11.8973 19.7138C11.6208 18.9192 11.6208 18.0586 11.8973 17.264V15.6151H9.70367C8.76585 17.4232 8.76585 19.5546 9.70367 21.3627L11.8973 19.7138Z" fill="#FBBC04" />
        <path fillRule="evenodd" clipRule="evenodd" d="M15.6055 14.6223C16.5475 14.6073 17.4577 14.9522 18.1395 15.5823L20.0248 13.7556C18.8293 12.6677 17.2455 12.0704 15.6055 12.0889C13.1085 12.089 10.8249 13.4534 9.70367 15.6151L11.8973 17.264C12.4202 15.7476 13.8826 14.6223 15.6055 14.6223Z" fill="#EA4335" />
      </svg>
      {/* Maestro */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#E5E7EB" />
        <path d="M34.3102 28.9765H23.9591V10.5122H34.3102V28.9765Z" fill="#6C6BBD" />
        <path d="M24.6223 19.7429C24.6223 15.9973 26.3891 12.6608 29.1406 10.5107C27.1285 8.93843 24.5892 7.99998 21.8294 7.99998C15.2961 7.99998 10 13.2574 10 19.7429C10 26.2283 15.2961 31.4857 21.8294 31.4857C24.5892 31.4857 27.1285 30.5473 29.1406 28.975C26.3891 26.8249 24.6223 23.4884 24.6223 19.7429" fill="#EB001B" />
        <path d="M48.2706 19.7429C48.2706 26.2283 42.9745 31.4857 36.4412 31.4857C33.6814 31.4857 31.1421 30.5473 29.1293 28.975C31.8815 26.8249 33.6483 23.4884 33.6483 19.7429C33.6483 15.9973 31.8815 12.6608 29.1293 10.5107C31.1421 8.93843 33.6814 7.99998 36.4412 7.99998C42.9745 7.99998 48.2706 13.2574 48.2706 19.7429" fill="#0099DF" />
      </svg>
      {/* SSL */}
      <div className="flex items-center gap-1 text-[10px] font-medium text-[#9ca3af]">
        <Lock className="h-3 w-3" />
        SSL
      </div>
    </div>
  )
}

/* ============================================================
   Invoice Detail Modal (Desktop)
   ============================================================ */
function InvoiceModal({ invoice, onClose, formatDate, formatAmount, getStatusBadge, currentPlan }: any) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 200)
  }

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-200 ${isVisible ? "bg-black/40 backdrop-blur-[2px]" : "bg-black/0"}`} onClick={handleClose}>
      <div className={`bg-white rounded-2xl w-full max-w-lg shadow-xl transition-all duration-200 ${isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#e5e7eb]">
          <h2 className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Invoice Details")}</h2>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <InvoiceContent invoice={invoice} formatDate={formatDate} formatAmount={formatAmount} getStatusBadge={getStatusBadge} currentPlan={currentPlan} />
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Invoice Content (shared between modal and bottom sheet)
   ============================================================ */
function InvoiceContent({ invoice, formatDate, formatAmount, getStatusBadge, currentPlan }: any) {
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[24px] font-bold text-[#1a1a2e]">{formatAmount(invoice.amount_cents)}</div>
          <div className="text-[13px] text-[#6b7280] mt-1">{formatDate(invoice.created_at)}</div>
        </div>
        {getStatusBadge(invoice.status)}
      </div>

      {/* Details */}
      <div className="bg-[#f9fafb] rounded-xl p-4 space-y-3">
        <div className="flex justify-between text-[13px]">
          <span className="text-[#6b7280]">{tt("Invoice ID")}</span>
          <span className="text-[#1a1a2e] font-mono text-[12px]">{invoice.stripe_invoice_id || invoice.id}</span>
        </div>
        <div className="flex justify-between text-[13px]">
          <span className="text-[#6b7280]">{tt("Description")}</span>
          <span className="text-[#1a1a2e]">{invoice.description || tt("Subscription")}</span>
        </div>
        {invoice.period_start && invoice.period_end && (
          <div className="flex justify-between text-[13px]">
            <span className="text-[#6b7280]">{tt("Billing Period")}</span>
            <span className="text-[#1a1a2e]">{formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}</span>
          </div>
        )}
        <div className="flex justify-between text-[13px]">
          <span className="text-[#6b7280]">{tt("Plan")}</span>
          <span className="text-[#1a1a2e]">{currentPlan?.name || tt("Subscription")}</span>
        </div>
        <div className="border-t border-[#e5e7eb] pt-3 flex justify-between text-[13px] font-semibold">
          <span className="text-[#1a1a2e]">{tt("Total")}</span>
          <span className="text-[#1a1a2e]">{formatAmount(invoice.amount_cents)}</span>
        </div>
      </div>

      {/* Legal footer */}
      <div className="text-[11px] text-[#9ca3af] leading-relaxed">
        <p>{tt("Billed by Storelib (storelib.com). Charges appear as \"STORELIB\" on your statement.")}</p>
        <p className="mt-1">{tt("For billing questions, contact support@storelib.com.")}</p>
      </div>

      {/* Actions — "View on Stripe" opens Stripe portal, hidden on iOS */}
      <div className="flex gap-3">
        {invoice.invoice_pdf_url && (
          <a href={invoice.invoice_pdf_url} target="_blank" rel="noopener noreferrer" className="flex-1 h-10 text-[13px] font-medium text-[#7c3aed] border border-[#7c3aed] rounded-xl hover:bg-[#f5f3ff] transition-colors flex items-center justify-center gap-2 cursor-pointer">
            <Download className="h-3.5 w-3.5" />
            {tt("Download PDF")}
          </a>
        )}
        {invoice.hosted_invoice_url && (
          <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="flex-1 h-10 text-[13px] font-medium text-[#6b7280] border border-[#e5e7eb] rounded-xl hover:bg-[#f9fafb] transition-colors flex items-center justify-center gap-2 cursor-pointer">
            <ExternalLink className="h-3.5 w-3.5" />
            {tt("View on Stripe")}
          </a>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   Upgrade Confirmation Modal
   ============================================================ */
function UpgradeConfirmModal({ planId, planName, priceCents, currentPlan, subscription, isSubscribed, loading, preview, onConfirm, onClose, cancelAtPeriodEnd = false }: {
  planId: string; planName: string; priceCents: number; currentPlan: any; subscription: any; isSubscribed: boolean; loading: boolean;
  preview: { amountDueTodayCents: number; nextBillingDate: string; nextAmountCents: number; type: "upgrade" | "downgrade" } | null;
  onConfirm: () => void; onClose: () => void; cancelAtPeriodEnd?: boolean
}) {
  // When cancel_at_period_end is true and user clicks a paid plan, treat as re-upgrade
  const isReUpgrade = cancelAtPeriodEnd && priceCents > 0
  const isUpgrade = isReUpgrade || priceCents > currentPlan.price_cents
  const isDowngrade = !isReUpgrade && priceCents < currentPlan.price_cents

  const nextChargeText = preview?.nextBillingDate
    ? tt("Your next charge will be ${value} on {date}.", { value: ((preview?.nextAmountCents || priceCents) / 100).toFixed(2), date: new Date(preview.nextBillingDate).toLocaleDateString(appLocale(), zoned({ month: "long", day: "numeric" })) })
    : ""

  return (
    <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-[18px] font-bold text-[#1a1a2e] mb-2">
            {isReUpgrade ? tt("Upgrade Again to {planName}", { planName }) : isUpgrade ? tt("Upgrade to {planName}", { planName }) : isDowngrade ? tt("Downgrade to {planName}", { planName }) : tt("Switch to {planName}", { planName })}
          </h2>

          {isReUpgrade && isSubscribed && (
            <div className="bg-[#f5f3ff] border border-[#ede9fe] rounded-xl p-4 mb-4 space-y-2">
              <p className="text-[13px] text-[#374151]">
                <Rich text={tt("Your cancellation will be reversed and you'll continue on the {plan} plan at {price}.")} parts={{ plan: <span className="font-semibold text-[#7c3aed]">{planName}</span>, price: <span className="font-semibold text-[#7c3aed]">{tt("{amount}/month", { amount: formatPlanPrice(priceCents) })}</span> }} />
              </p>
            </div>
          )}

          {isUpgrade && !isReUpgrade && isSubscribed && (
            <div className="bg-[#f5f3ff] border border-[#ede9fe] rounded-xl p-4 mb-4 space-y-2">
              <p className="text-[13px] text-[#374151]">
                <Rich text={tt("You'll be charged {amount} today for the remaining time in your current billing cycle.")} parts={{ amount: <span className="font-semibold text-[#7c3aed]">${((preview?.amountDueTodayCents || 0) / 100).toFixed(2)}</span> }} />
              </p>
              {nextChargeText && <p className="text-[13px] text-[#6b7280]">{nextChargeText}</p>}
            </div>
          )}

          {isDowngrade && isSubscribed && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-[13px] text-[#374151]">{tt("Your plan will downgrade at the end of your current billing cycle. You'll keep all current features until then.")}</p>
            </div>
          )}

          {!isSubscribed && (
            <div className="bg-[#f5f3ff] border border-[#ede9fe] rounded-xl p-4 mb-4">
              <p className="text-[13px] text-[#374151]">{tt("You'll be redirected to Stripe to complete your subscription of")} <span className="font-semibold text-[#7c3aed]">{tt("{amount}/month", { amount: formatPlanPrice(priceCents) })}</span>.</p>
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <button onClick={onClose} disabled={loading} className="flex-1 h-10 text-[13px] font-medium text-[#374151] bg-white border border-[#e5e7eb] rounded-xl hover:bg-[#f9fafb] transition-colors cursor-pointer">
              {tt("Cancel")}
            </button>
            <button onClick={onConfirm} disabled={loading} className="flex-1 h-10 text-[13px] font-semibold text-white bg-[#7c3aed] rounded-xl hover:bg-[#6d28d9] transition-colors flex items-center justify-center gap-2 cursor-pointer">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />{tt("Processing...")}</> : isReUpgrade ? tt("Confirm Upgrade") : isUpgrade ? tt("Confirm Upgrade") : isDowngrade ? tt("Confirm Downgrade") : tt("Confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Pricing Tiers
   ============================================================ */
function PricingTiers({ plans, currentPlan, subscription, loading, setLoading, showNotification, router, onUpgradeClick, pendingPlanId, onCancelClick }: {
  plans: any[]; currentPlan: any; subscription: any; loading: string | null; setLoading: (v: string | null) => void
  showNotification: (type: "success" | "error", message: string) => void; router: any
  onUpgradeClick: (planId: string, planName: string, priceCents: number) => void
  pendingPlanId?: string | null
  /** On a running paid plan, Downgrade to Free opens the Cancel plan dialog rather than the upgrade page. */
  onCancelClick?: () => void
}) {
  const handlePlanAction = () => {
    // Every plan change happens on the upgrade page, which knows how to
    // check out, switch or cancel.
    router.push("/app/settings/billing/upgrade")
  }

  const isCanceling = subscription?.cancel_at_period_end === true
  const isLegacyPro = currentPlan.id === "pro"

  const actionFor = (id: OfferedPlanId): PlanCardAction => {
    const offered = offeredPlan(id)
    const priceCents = plans.find((p: any) => p.id === id)?.price_cents ?? offered.priceCents
    const isCurrentPlan = id === currentPlan.id
    const isPendingPlan = id === pendingPlanId
    const isFree = id === "free"
    const isDowngrade = priceCents < currentPlan.price_cents
    const isUpgrade = priceCents > currentPlan.price_cents

    let label = tt("Upgrade to {name}", { name: offered.name })
    if (isCurrentPlan) label = "Current plan"
    else if (isPendingPlan) label = isFree ? "Downgrade scheduled" : "Switch scheduled"
    else if (isCanceling && isFree) label = "Cancellation scheduled"
    else if (isLegacyPro && !isFree) label = `Switch to ${offered.name} at ${offered.price}`
    else if (isFree) label = "Downgrade to Free"
    else if (isDowngrade) label = `Downgrade to ${offered.name}`

    return {
      label,
      onClick: isFree && !isCurrentPlan && onCancelClick ? onCancelClick : handlePlanAction,
      settled: isCurrentPlan || (isCanceling && isFree) || (isPendingPlan && !isUpgrade),
      current: isCurrentPlan,
      disabled: loading !== null,
      loading: loading === id,
    }
  }

  return (
    <div data-billing-plans="">
      {/*
        A CENTRED HEADER OVER THE PLANS (round R1). "The left aligned Plans
        heading goes." It now reads like the plans page (upgrade-page-client
        "Choose a plan"), a step smaller inside Settings: centred over the
        Monthly and Yearly pill and the two cards, with one line under it.
      */}
      <PlanCards
        heading={
          <div className="mx-auto max-w-[560px] pt-1 text-center sm:pt-2" data-plans-header="">
            <h2 className="text-[26px] font-bold leading-[1.1] tracking-[-0.02em] text-[#1a1a2e] sm:text-[32px]">{tt("Plans and pricing")}</h2>
            <p className="mt-2 text-balance text-[14.5px] leading-[1.5] text-[#6b7280] sm:text-[15px]">{tt("Start free. Upgrade when you're ready, and change or cancel anytime.")}</p>
          </div>
        }
        actions={{ free: actionFor("free"), growth: actionFor("growth") }}
        lead={currentPlan.id === "free" ? "growth" : undefined}
      />
    </div>
  )
}
