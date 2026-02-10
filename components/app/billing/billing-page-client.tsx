"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Settings, Shield, ToggleLeft, Wallet, Store, CreditCard,
  Check, Loader2, Download, FileText, Clock, CheckCircle, XCircle, AlertCircle,
  Rocket, Lock, Pencil, ExternalLink, X, ArrowUpRight,
} from "lucide-react"
import { useLanguage } from "@/lib/i18n"

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "security", label: "Security", icon: Shield },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "privacy", label: "Privacy", icon: ToggleLeft },
  { id: "stores", label: "Stores", icon: Store },
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
}

export function BillingPageClient({ initialData }: BillingPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string; visible: boolean } | null>(null)
  const notifTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState<{ planId: string; planName: string; priceCents: number } | null>(null)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
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
        if (subData.subscription) {
          setLiveSubscription(subData.subscription)
          setLiveCurrentPlan(subData.currentPlan || initialData.currentPlan)
        }
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

  useEffect(() => {
    const success = searchParams.get("success")
    const setupSuccess = searchParams.get("setup_success")
    const canceled = searchParams.get("canceled")

    if (success === "1" || success === "true") {
      showNotification("success", "Subscription activated successfully! Your plan has been updated.")
      window.history.replaceState({}, "", "/app/settings/billing")
      router.refresh()
    } else if (setupSuccess === "1" || setupSuccess === "true") {
      showNotification("success", "Payment method updated successfully!")
      window.history.replaceState({}, "", "/app/settings/billing")
      router.refresh()
    } else if (canceled === "1" || canceled === "true") {
      showNotification("error", "Checkout was canceled. No changes were made.")
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
    router.push("/app/settings")
  }

  const openCustomerPortal = async () => {
    setPortalLoading(true)
    try {
      const response = await fetch("/api/billing/customer-portal", { method: "POST" })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Failed to open portal")
      }
      const { url } = await response.json()
      window.location.href = url
    } catch (error: any) {
      showNotification("error", error.message || "Failed to open billing portal")
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
        throw new Error(err.error || "Failed to open payment setup")
      }
      const { url } = await response.json()
      window.location.href = url
    } catch (error: any) {
      showNotification("error", error.message || "Failed to open payment setup")
    } finally {
      setPortalLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    setPortalLoading(true)
    try {
      const response = await fetch("/api/billing/customer-portal", { method: "POST" })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Failed to open portal")
      }
      const { url } = await response.json()
      window.location.href = url
    } catch (error: any) {
      showNotification("error", error.message || "Failed to open billing portal")
    } finally {
      setPortalLoading(false)
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
      if (!response.ok) throw new Error(result.error || "Failed to preview plan change")
      setUpgradePreview({
        amountDueTodayCents: result.amountDueTodayCents || 0,
        nextBillingDate: result.nextBillingDate,
        nextAmountCents: result.nextAmountCents || 0,
        type: result.type,
      })
    } catch (error: any) {
      showNotification("error", error.message || "Failed to preview plan change")
    }
  }

  const getTabLabel = (tabId: string) => {
    switch (tabId) {
      case "general": return t("settings.general")
      case "security": return t("settings.security")
      case "privacy": return t("settings.privacy")
      case "billing": return t("settings.billing")
      case "payments": return t("settings.payments")
      case "stores": return t("settings.stores")
      default: return tabId
    }
  }

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  const formatDateLong = (dateString: string) => new Date(dateString).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  const formatAmount = (cents: number) => `$${(cents / 100).toFixed(2)}`

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full"><CheckCircle className="h-3 w-3" />Paid</span>
      case "open":
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full"><Clock className="h-3 w-3" />Pending</span>
      case "void": case "uncollectible":
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full"><XCircle className="h-3 w-3" />Failed</span>
      default:
        return <span className="text-[11px] font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
    }
  }

  // Use live state (updated by client-side actions)
  const currentPlan = liveCurrentPlan
  const subscription = liveSubscription
  const isSubscribed = subscription && (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due")
  const planPrice = currentPlan.price_cents > 0 ? `$${(currentPlan.price_cents / 100).toFixed(currentPlan.price_cents % 100 === 0 ? 0 : 2)}` : "$0"
  const feeDisplay = `${(currentPlan.fee_percent * 100).toFixed(currentPlan.fee_percent >= 0.01 ? 1 : 2)}% + $${(currentPlan.fee_fixed_cents / 100).toFixed(2)} per transaction`

  // Detect pending downgrade (scheduled plan change)
  const pendingPlanId = subscription?.pending_plan_id || null
  const plans = initialData.plans
  const pendingPlan = pendingPlanId && pendingPlanId !== currentPlan.id ? plans.find((p: any) => p.id === pendingPlanId) : null

  // Plan benefits for Current Plan card (simplified - no emails, no unlimited products, no priority support)
  const planBenefits: Record<string, string[]> = {
    free: ["6% + $0.25 per transaction", "Basic OnePage features"],
    growth: ["3% + $0.25 per transaction", "Premium OnePage features", "Custom domain", "Verified badge"],
    pro: ["1.5% + $0.25 per transaction", "Premium OnePage features", "Custom domain", "Verified badge"],
  }

  // Determine the next upgrade target
  const nextUpgradePlan = currentPlan.id === "growth"
    ? plans.find((p: any) => p.id === "pro")
    : currentPlan.id === "free"
      ? null // Free shows generic "Upgrade" link
      : null // Pro has no upgrade

  return (
    <div className="h-full overflow-y-scroll overflow-x-hidden page-scroll bg-[#fafafa]" style={{ scrollbarGutter: "stable" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-16 sm:pb-32 overflow-x-hidden">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] sm:text-[28px] font-bold text-[#1a1a2e]">{t("settings.title")}</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">{t("settings.subtitle")}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div ref={tabNavRef} className="mb-6 sm:mb-8 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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

        {/* Notification is now a fixed toast at top of screen - rendered at end of component */}

        <div className="space-y-6">

          {/* ---- SECTION 1: Subscription Overview ---- */}
          <div>
            <h2 className="text-[17px] font-bold text-[#1a1a2e] mb-4">Subscription Overview</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Left: Current Plan */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Current Plan</h3>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${isSubscribed ? "text-emerald-700 bg-emerald-50" : "text-gray-600 bg-gray-100"}`}>
                    <CheckCircle className="h-3 w-3" />
                    {currentPlan.name}
                  </span>
                </div>

                {/* Pending downgrade info */}
                {pendingPlan && subscription?.current_period_end && (
                  <p className="text-[12px] text-[#6b7280] mb-3">
                    Switching to {pendingPlan.name} on {formatDate(subscription.current_period_end)} &middot; ${(pendingPlan.price_cents / 100).toFixed(2)}/mo
                  </p>
                )}

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[36px] font-bold text-[#1a1a2e] leading-none">{planPrice}</span>
                    {currentPlan.price_cents > 0 && <span className="text-[14px] text-[#6b7280]">/month</span>}
                  </div>
                </div>

                <ul className="space-y-2 mb-5">
                  {(planBenefits[currentPlan.id] || planBenefits.free).map((benefit: string, idx: number) => (
                    <li key={idx} className="flex items-center gap-2.5 text-[13px] text-[#374151]">
                      <div className="w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <Check className="h-2.5 w-2.5 text-emerald-600" strokeWidth={3} />
                      </div>
                      {benefit}
                    </li>
                  ))}
                  {subscription?.current_period_end && (
                    <li className="flex items-center gap-2.5 text-[13px] text-[#6b7280]">
                      <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <Clock className="h-2.5 w-2.5 text-gray-500" />
                      </div>
                      {subscription.cancel_at_period_end ? "Expires" : "Renews"}: {formatDate(subscription.current_period_end)}
                    </li>
                  )}
                </ul>

                {/* Buttons */}
                <div className="flex flex-wrap gap-3">
                  {/* Free plan -> Upgrade link */}
                  {currentPlan.id === "free" && (
                    <a href="/app/settings/billing/upgrade" className="h-10 px-5 text-[13px] font-semibold text-white bg-[#7c3aed] rounded-xl hover:bg-[#6d28d9] active:bg-[#5b21b6] transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2 no-underline cursor-pointer">
                      <Rocket className="h-4 w-4" />
                      Upgrade
                    </a>
                  )}
                  {/* Growth plan -> Upgrade to Pro */}
                  {currentPlan.id === "growth" && nextUpgradePlan && (
                    <button
                      onClick={() => openUpgradeModal(nextUpgradePlan.id, nextUpgradePlan.name, nextUpgradePlan.price_cents)}
                      className="h-10 px-5 text-[13px] font-semibold text-white bg-[#7c3aed] rounded-xl hover:bg-[#6d28d9] active:bg-[#5b21b6] transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2 cursor-pointer"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      Upgrade to {nextUpgradePlan.name}
                    </button>
                  )}
                  {/* If cancel_at_period_end, show upgrade option to reactivate */}
                  {isSubscribed && subscription.cancel_at_period_end && (
                    <a href="/app/settings/billing/upgrade" className="h-10 px-5 text-[13px] font-semibold text-white bg-[#7c3aed] rounded-xl hover:bg-[#6d28d9] active:bg-[#5b21b6] transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2 no-underline cursor-pointer">
                      <Rocket className="h-4 w-4" />
                      Upgrade
                    </a>
                  )}
                  {/* Always show Manage Subscription for any active paid plan */}
                  {isSubscribed && (
                    <button onClick={openCustomerPortal} disabled={portalLoading} className="h-10 px-5 text-[13px] font-medium text-[#7c3aed] border border-[#7c3aed] rounded-xl hover:bg-[#f5f3ff] transition-colors flex items-center gap-2 cursor-pointer">
                      {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      Manage Subscription
                    </button>
                  )}
                </div>
                {/* Subtle cancel notice */}
                {isSubscribed && subscription.cancel_at_period_end && (
                  <p className="text-[12px] text-[#9ca3af] mt-3">
                    Your plan will be canceled on {formatDate(subscription.current_period_end)}
                  </p>
                )}
              </div>

              {/* Right: Payment Details */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Payment Details</h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                    <Lock className="h-3 w-3" />
                    Secured
                  </div>
                </div>

                {livePaymentMethod ? (
                  <div className="space-y-4">
                    <div className="bg-[#f9fafb] rounded-xl p-4">
                      <span className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider block mb-3">Card Number</span>
                      <div className="text-[16px] font-mono font-medium text-[#1a1a2e] tracking-widest mb-4">
                        &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; &bull;&bull;&bull;&bull; {livePaymentMethod.card_last4}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wider block mb-1">Brand</span>
                          <span className="text-[13px] font-medium text-[#1a1a2e] capitalize">{livePaymentMethod.card_brand || "Card"}</span>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wider block mb-1">Expires</span>
                          <span className="text-[13px] font-medium text-[#1a1a2e]">{String(livePaymentMethod.card_exp_month).padStart(2, "0")}/{livePaymentMethod.card_exp_year}</span>
                        </div>
                      </div>
                    </div>
                    <TrustBadges />
                    <div className="flex gap-3">
                      <button onClick={handleAddPaymentMethod} disabled={portalLoading} className="h-10 px-5 text-[13px] font-medium text-[#7c3aed] border border-[#7c3aed] rounded-xl hover:bg-[#f5f3ff] transition-colors flex items-center gap-2 cursor-pointer">
                        {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                        Edit Payment
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-[#f9fafb] rounded-xl p-6 text-center">
                      <CreditCard className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
                      <p className="text-[13px] text-[#6b7280] mb-1">No payment method on file</p>
                      <p className="text-[12px] text-[#9ca3af]">Add a payment method to subscribe to paid plans</p>
                    </div>
                    <TrustBadges />
                    <button onClick={handleAddPaymentMethod} disabled={portalLoading} className="h-10 px-5 text-[13px] font-medium text-[#7c3aed] border border-[#7c3aed] rounded-xl hover:bg-[#f5f3ff] transition-colors flex items-center gap-2 cursor-pointer">
                      {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      Add Payment Method
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---- SECTION 2: Billing History ---- */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5e7eb]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-bold text-[#1a1a2e]">Billing History</h2>
              {liveInvoices.length > 0 && (
                <button onClick={openCustomerPortal} disabled={portalLoading} className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors cursor-pointer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  View All
                </button>
              )}
            </div>

            {/* Next billing date */}
            {subscription?.current_period_end && isSubscribed && !subscription.cancel_at_period_end && (
              <div className="mb-4 space-y-1">
                <p className="text-[13px] text-[#6b7280]">
                  Your next billing date is <span className="font-medium text-[#374151]">{formatDateLong(subscription.current_period_end)}</span>.
                </p>
                {pendingPlan && (
                  <p className="text-[13px] text-[#6b7280]">
                    Your plan will change to <span className="font-medium text-[#374151]">{pendingPlan.name}</span> (${(pendingPlan.price_cents / 100).toFixed(2)}/month).
                  </p>
                )}
              </div>
            )}
            {subscription?.current_period_end && subscription.cancel_at_period_end && (
              <p className="text-[13px] text-[#9ca3af] mb-4">Your subscription ends on <span className="font-medium text-[#6b7280]">{formatDateLong(subscription.current_period_end)}</span>.</p>
            )}
            {!isSubscribed && !subscription?.cancel_at_period_end && (
              <p className="text-[13px] text-[#6b7280] mb-4">No active subscription.</p>
            )}

            {liveInvoices.length === 0 ? (
              <div className="bg-[#f9fafb] rounded-xl p-8 text-center">
                <FileText className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
                <p className="text-[13px] text-[#6b7280] mb-1">No invoices yet</p>
                <p className="text-[12px] text-[#9ca3af]">Your billing history will appear here</p>
              </div>
            ) : (
              <>
                {/* Mobile view - cards, clickable */}
                <div className="block sm:hidden space-y-3">
                  {liveInvoices.map((invoice: any) => (
                    <button key={invoice.id} onClick={() => setSelectedInvoice(invoice)} className="w-full text-left bg-[#f9fafb] rounded-xl p-4 border border-[#e5e7eb] hover:border-[#d1d5db] hover:shadow-sm transition-all cursor-pointer">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-[14px] font-semibold text-[#1a1a2e]">{formatAmount(invoice.amount_cents)}</div>
                          <div className="text-[12px] text-[#6b7280] mt-0.5">{formatDate(invoice.created_at)}</div>
                        </div>
                        {getStatusBadge(invoice.status)}
                      </div>
                      <p className="text-[12px] text-[#6b7280]">{invoice.description || "Subscription"}</p>
                    </button>
                  ))}
                </div>

                {/* Desktop table view - rows clickable */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#e5e7eb]">
                        <th className="text-left text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider pb-3">Date</th>
                        <th className="text-left text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider pb-3">Description</th>
                        <th className="text-left text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider pb-3">Amount</th>
                        <th className="text-left text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider pb-3">Status</th>
                        <th className="text-right text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider pb-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveInvoices.map((invoice: any) => (
                        <tr key={invoice.id} onClick={() => setSelectedInvoice(invoice)} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f5f3ff]/30 transition-colors cursor-pointer">
                          <td className="py-4 text-[13px] text-[#374151]">{formatDate(invoice.created_at)}</td>
                          <td className="py-4 text-[13px] text-[#374151]">{invoice.description || (invoice.period_start && invoice.period_end ? `${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}` : "Subscription")}</td>
                          <td className="py-4 text-[13px] font-medium text-[#1a1a2e]">{formatAmount(invoice.amount_cents)}</td>
                          <td className="py-4">{getStatusBadge(invoice.status)}</td>
                          <td className="py-4 text-right">
                            {invoice.invoice_pdf_url && (
                              <a href={invoice.invoice_pdf_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#7c3aed] hover:text-[#6d28d9] transition-colors cursor-pointer">
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* ---- SECTION 3: Pricing Tiers ---- */}
          <PricingTiers
            plans={initialData.plans}
            currentPlan={currentPlan}
            subscription={subscription}
            loading={loading}
            setLoading={setLoading}
            showNotification={showNotification}
            router={router}
            onUpgradeClick={(planId, planName, priceCents) => openUpgradeModal(planId, planName, priceCents)}
            pendingPlanId={pendingPlanId}
          />
        </div>
      </div>

      {/* Invoice Detail Modal (Desktop) */}
      {selectedInvoice && (
        <div className="hidden sm:block">
          <InvoiceModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} formatDate={formatDate} formatAmount={formatAmount} getStatusBadge={getStatusBadge} currentPlan={currentPlan} />
        </div>
      )}

      {/* Invoice Detail Bottom Sheet (Mobile) */}
      {selectedInvoice && (
        <div className="sm:hidden">
          <MobileBottomSheet isOpen={!!selectedInvoice} onClose={() => setSelectedInvoice(null)} title="Invoice Details">
            <InvoiceContent invoice={selectedInvoice} formatDate={formatDate} formatAmount={formatAmount} getStatusBadge={getStatusBadge} currentPlan={currentPlan} />
          </MobileBottomSheet>
        </div>
      )}

      {/* Upgrade Confirmation Modal */}
      {/* Fixed notification toast */}
      {notification && (
        <div className="fixed top-0 left-0 right-0 z-[200] flex justify-center pointer-events-none">
          <div className={`mt-3 pointer-events-auto bg-[#18181b] text-white rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-2.5 transition-all duration-300 ease-out ${notification.visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`}>
            {notification.type === "success" ? <Check className="h-3.5 w-3.5 shrink-0 text-white" strokeWidth={2.5} /> : <X className="h-3.5 w-3.5 shrink-0 text-red-400" strokeWidth={2.5} />}
            <p className="text-[12px] font-medium">{notification.message}</p>
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
                if (!response.ok) { throw new Error(result.error || "Failed to change plan") }
                showNotification("success", result.message || `Plan changed to ${showUpgradeModal.planName}!`)
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
                if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Failed to create checkout session") }
                const { checkoutUrl } = await response.json()
                if (checkoutUrl) window.location.href = checkoutUrl
              }
            } catch (error: any) {
              setShowUpgradeModal(null)
              showNotification("error", error.message || "An error occurred")
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
    <div className="flex items-center gap-3 flex-wrap">
      {/* Visa */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#E5E7EB" />
        <path d="M25.7516 27.4332H21.8901L24.3054 13.4325H28.1667L25.7516 27.4332Z" fill="#15195A" />
        <path d="M39.7499 13.7748C38.9882 13.4915 37.7802 13.1787 36.2865 13.1787C32.4731 13.1787 29.7878 15.0851 29.7713 17.8106C29.7396 19.8215 31.6939 20.9384 33.1556 21.6089C34.6495 22.2941 35.1574 22.7413 35.1574 23.352C35.1422 24.29 33.9502 24.7223 32.8384 24.7223C31.2967 24.7223 30.4707 24.4994 29.2153 23.9776L28.7069 23.7539L28.1665 26.8967C29.0722 27.2835 30.7408 27.6268 32.4731 27.6419C36.5249 27.6419 39.1627 25.765 39.1939 22.8605C39.2093 21.2667 38.1774 20.0454 35.9526 19.0475C34.602 18.4069 33.7749 17.9749 33.7749 17.3195C33.7908 16.7236 34.4745 16.1133 35.9991 16.1133C37.2544 16.0834 38.1768 16.3663 38.8755 16.6494L39.2247 16.7981L39.7499 13.7748Z" fill="#15195A" />
        <path fillRule="evenodd" clipRule="evenodd" d="M46.6618 13.4325H49.6486L52.7639 27.433H49.1885C49.1885 27.433 48.8386 25.8244 48.7278 25.3328H43.7699C43.6266 25.705 42.9595 27.433 42.9595 27.433H38.9078L44.6435 14.5941C45.0409 13.6855 45.7407 13.4325 46.6618 13.4325ZM46.4238 18.556C46.4238 18.556 45.2001 21.6689 44.8821 22.4732H48.0918C47.933 21.7733 47.2017 18.4219 47.2017 18.4219L46.9319 17.2156C46.8182 17.5262 46.6539 17.9533 46.543 18.2414C46.4679 18.4366 46.4173 18.568 46.4238 18.556Z" fill="#15195A" />
        <path fillRule="evenodd" clipRule="evenodd" d="M5.1589 13.4325H11.3716C12.2138 13.462 12.8971 13.7152 13.1194 14.6094L14.4696 21.0422C14.4697 21.0426 14.4699 21.043 14.47 21.0434L14.8832 22.9796L18.6649 13.4325H22.7481L16.6785 27.4184H12.5951L9.15337 15.253C7.96587 14.6021 6.6106 14.0786 5.09534 13.7154L5.1589 13.4325Z" fill="#15195A" />
      </svg>
      {/* Mastercard */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#E5E7EB" />
        <path d="M34.3102 28.9765H23.9591V10.5122H34.3102V28.9765Z" fill="#FF5F00" />
        <path d="M24.6223 19.7429C24.6223 15.9973 26.3891 12.6608 29.1406 10.5107C27.1285 8.93843 24.5892 7.99998 21.8294 7.99998C15.2961 7.99998 10 13.2574 10 19.7429C10 26.2283 15.2961 31.4857 21.8294 31.4857C24.5892 31.4857 27.1285 30.5473 29.1406 28.975C26.3891 26.8249 24.6223 23.4884 24.6223 19.7429" fill="#EB001B" />
        <path d="M48.2706 19.7429C48.2706 26.2283 42.9745 31.4857 36.4412 31.4857C33.6814 31.4857 31.1421 30.5473 29.1293 28.975C31.8815 26.8249 33.6483 23.4884 33.6483 19.7429C33.6483 15.9973 31.8815 12.6608 29.1293 10.5107C31.1421 8.93843 33.6814 7.99998 36.4412 7.99998C42.9745 7.99998 48.2706 13.2574 48.2706 19.7429" fill="#F79E1B" />
      </svg>
      {/* Apple Pay */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#E5E7EB" />
        <path fillRule="evenodd" clipRule="evenodd" d="M17.5771 14.9265C17.1553 15.4313 16.4803 15.8294 15.8053 15.7725C15.7209 15.09 16.0513 14.3649 16.4381 13.9171C16.8599 13.3981 17.5982 13.0284 18.1959 13C18.2662 13.7109 17.992 14.4076 17.5771 14.9265ZM18.1888 15.9076C17.5942 15.873 17.0516 16.0884 16.6133 16.2624C16.3313 16.3744 16.0924 16.4692 15.9107 16.4692C15.7068 16.4692 15.4581 16.3693 15.1789 16.2571C14.813 16.1102 14.3947 15.9422 13.956 15.9502C12.9506 15.9645 12.0154 16.5403 11.5021 17.4573C10.4474 19.2915 11.2279 22.0071 12.2474 23.5C12.7467 24.2393 13.3443 25.0498 14.1318 25.0213C14.4783 25.0081 14.7275 24.9012 14.9854 24.7905C15.2823 24.6631 15.5908 24.5308 16.0724 24.5308C16.5374 24.5308 16.8324 24.6597 17.1155 24.7834C17.3847 24.9011 17.6433 25.014 18.0271 25.0071C18.8428 24.9929 19.356 24.2678 19.8553 23.5284C20.394 22.7349 20.6307 21.9605 20.6667 21.843L20.6709 21.8294C20.67 21.8285 20.6634 21.8254 20.6516 21.82C20.4715 21.7366 19.095 21.0995 19.0818 19.391C19.0686 17.957 20.1736 17.2304 20.3476 17.116C20.3582 17.109 20.3653 17.1043 20.3685 17.1019C19.6654 16.0498 18.5685 15.936 18.1888 15.9076ZM23.8349 24.9289V13.846H27.9482C30.0717 13.846 31.5553 15.3246 31.5553 17.4858C31.5553 19.6469 30.0435 21.1398 27.892 21.1398H25.5365V24.9289H23.8349ZM25.5365 15.2962H27.4982C28.9748 15.2962 29.8185 16.0924 29.8185 17.4929C29.8185 18.8934 28.9748 19.6967 27.4912 19.6967H25.5365V15.2962ZM37.1732 23.5995C36.7232 24.4668 35.7318 25.0142 34.6631 25.0142C33.081 25.0142 31.9771 24.0616 31.9771 22.6256C31.9771 21.2038 33.0459 20.3863 35.0217 20.2654L37.1451 20.1374V19.5261C37.1451 18.6232 36.5615 18.1327 35.5209 18.1327C34.6631 18.1327 34.0373 18.5806 33.9107 19.263H32.3779C32.4271 17.827 33.7631 16.782 35.5701 16.782C37.5177 16.782 38.7834 17.8128 38.7834 19.4123V24.9289H37.2084V23.5995H37.1732ZM35.1201 23.6991C34.2131 23.6991 33.6365 23.2583 33.6365 22.5829C33.6365 21.8863 34.192 21.481 35.2537 21.4171L37.1451 21.2962V21.9218C37.1451 22.9597 36.2732 23.6991 35.1201 23.6991ZM44.0076 25.3626C43.3256 27.3033 42.5451 27.9431 40.8857 27.9431C40.7592 27.9431 40.3373 27.9289 40.2388 27.9005V26.5711C40.3443 26.5853 40.6045 26.5995 40.7381 26.5995C41.4904 26.5995 41.9123 26.2796 42.1724 25.4479L42.3271 24.9573L39.4443 16.8886H41.2232L43.2271 23.436H43.2623L45.2662 16.8886H46.9959L44.0076 25.3626Z" fill="#000000" />
      </svg>
      {/* Google Pay */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="white" stroke="#E5E7EB" />
        <path fillRule="evenodd" clipRule="evenodd" d="M27.9174 24.1182V19.6071V19.6062H30.3578C31.3639 19.6068 32.2095 19.2907 32.8945 18.6578C33.5868 18.0571 33.9738 17.1935 33.9541 16.2934C33.9678 15.3982 33.5815 14.541 32.8945 13.9422C32.2155 13.3059 31.3023 12.9587 30.3578 12.9778H26.4404V24.1182H27.9174ZM27.9174 18.2382V14.3494V14.3485H30.3945C30.9466 14.3334 31.4788 14.5487 31.856 14.9396C32.2355 15.2971 32.4496 15.7881 32.4496 16.3009C32.4496 16.8137 32.2355 17.3048 31.856 17.6622C31.4741 18.0449 30.9436 18.254 30.3945 18.2382H27.9174Z" fill="#5F6368" />
        <path fillRule="evenodd" clipRule="evenodd" d="M39.9431 17.0951C39.3113 16.5297 38.4496 16.2471 37.3578 16.2471C35.9554 16.2471 34.8963 16.7448 34.1807 17.7404L35.4817 18.5342C35.9624 17.8598 36.6153 17.5226 37.4404 17.5226C37.9664 17.5167 38.4755 17.703 38.8661 18.0444C39.2555 18.3564 39.4795 18.8215 39.4762 19.3111V19.6382C38.9086 19.3271 38.1863 19.1715 37.3092 19.1715C36.2817 19.1727 35.4603 19.4062 34.845 19.872C34.2297 20.3377 33.922 20.965 33.922 21.7537C33.9086 22.4719 34.2302 23.1577 34.7973 23.6204C35.3807 24.1182 36.1058 24.3671 36.9725 24.3671C37.9878 24.3671 38.8012 23.9315 39.4129 23.0604H39.4771V24.1182H40.8899V19.4204C40.8905 18.4355 40.5749 17.6604 39.9431 17.0951ZM35.9367 22.7182C35.6273 22.5021 35.4448 22.1544 35.4468 21.7848C35.4468 21.3697 35.6477 21.024 36.0523 20.7395C36.4529 20.4592 36.9532 20.3191 37.5532 20.3191C38.3771 20.3191 39.0193 20.4968 39.4798 20.8524C39.4798 21.4533 39.2352 21.9768 38.7459 22.4231C38.3052 22.8501 37.7077 23.0905 37.0844 23.0915C36.6689 23.099 36.2634 22.9672 35.9367 22.7182Z" fill="#5F6368" />
        <path fillRule="evenodd" clipRule="evenodd" d="M49 16.496L44.0679 27.4782H42.5431L44.3734 23.6355L41.1303 16.496H42.7358L45.0798 21.9715H45.1119L47.3917 16.496H49Z" fill="#5F6368" />
        <path fillRule="evenodd" clipRule="evenodd" d="M21.9486 18.6347C21.9492 18.1986 21.9111 17.7632 21.8349 17.3334H15.6055V19.7983H19.1734C19.0259 20.5938 18.5493 21.2964 17.8541 21.7432V23.3432H19.9835C21.2303 22.2294 21.9486 20.5823 21.9486 18.6347Z" fill="#4285F4" />
        <path fillRule="evenodd" clipRule="evenodd" d="M15.6055 24.8889C17.3881 24.8889 18.889 24.3217 19.9835 23.344L17.8541 21.744C17.2615 22.1333 16.4982 22.3555 15.6055 22.3555C13.8826 22.3555 12.4202 21.2302 11.8973 19.7137H9.70367V21.3626C10.8249 23.5244 13.1085 24.8887 15.6055 24.8889Z" fill="#34A853" />
        <path fillRule="evenodd" clipRule="evenodd" d="M11.8973 19.7138C11.6208 18.9192 11.6208 18.0586 11.8973 17.264V15.6151H9.70367C8.76585 17.4232 8.76585 19.5546 9.70367 21.3627L11.8973 19.7138Z" fill="#FBBC04" />
        <path fillRule="evenodd" clipRule="evenodd" d="M15.6055 14.6223C16.5475 14.6073 17.4577 14.9522 18.1395 15.5823L20.0248 13.7556C18.8293 12.6677 17.2455 12.0704 15.6055 12.0889C13.1085 12.089 10.8249 13.4534 9.70367 15.6151L11.8973 17.264C12.4202 15.7476 13.8826 14.6223 15.6055 14.6223Z" fill="#EA4335" />
      </svg>
      {/* Amex */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-auto">
        <rect x="0.5" y="0.5" width="57" height="39" rx="3.5" fill="#006FCF" stroke="#E5E7EB" />
        <path fillRule="evenodd" clipRule="evenodd" d="M11.8632 28.8937V20.6592H21.1869L22.1872 21.8787L23.2206 20.6592H57.0632V28.3258C57.0632 28.3258 56.1782 28.8855 55.1546 28.8937H36.4152L35.2874 27.5957V28.8937H31.5916V26.6779C31.5916 26.6779 31.0867 26.9872 29.9953 26.9872H28.7373V28.8937H23.1415L22.1426 27.6481L21.1284 28.8937H11.8632ZM1 14.4529L3.09775 9.86914H6.7256L7.9161 12.4368V9.86914H12.4258L13.1346 11.7249L13.8216 9.86914H34.0657V10.8021C34.0657 10.8021 35.1299 9.86914 36.8789 9.86914L43.4474 9.89066L44.6173 12.4247V9.86914H48.3913L49.43 11.3247V9.86914H53.2386V18.1037H49.43L48.4346 16.6434V18.1037H42.8898L42.3321 16.8056H40.8415L40.293 18.1037H36.5327C35.0277 18.1037 34.0657 17.1897 34.0657 17.1897V18.1037H28.3961L27.2708 16.8056V18.1037H6.18816L5.63093 16.8056H4.14505L3.59176 18.1037H1V14.4529Z" fill="white" />
      </svg>
      {/* Maestro */}
      <svg viewBox="0 -9 58 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-auto">
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
          <h2 className="text-[17px] font-semibold text-[#1a1a2e]">Invoice Details</h2>
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
          <span className="text-[#6b7280]">Invoice ID</span>
          <span className="text-[#1a1a2e] font-mono text-[12px]">{invoice.stripe_invoice_id || invoice.id}</span>
        </div>
        <div className="flex justify-between text-[13px]">
          <span className="text-[#6b7280]">Description</span>
          <span className="text-[#1a1a2e]">{invoice.description || "Subscription"}</span>
        </div>
        {invoice.period_start && invoice.period_end && (
          <div className="flex justify-between text-[13px]">
            <span className="text-[#6b7280]">Billing Period</span>
            <span className="text-[#1a1a2e]">{formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}</span>
          </div>
        )}
        <div className="flex justify-between text-[13px]">
          <span className="text-[#6b7280]">Plan</span>
          <span className="text-[#1a1a2e]">{currentPlan?.name || "Subscription"}</span>
        </div>
        <div className="border-t border-[#e5e7eb] pt-3 flex justify-between text-[13px] font-semibold">
          <span className="text-[#1a1a2e]">Total</span>
          <span className="text-[#1a1a2e]">{formatAmount(invoice.amount_cents)}</span>
        </div>
      </div>

      {/* Legal footer */}
      <div className="text-[11px] text-[#9ca3af] leading-relaxed">
        <p>Billed by Storelib (storelib.com). Charges appear as &quot;STORELIB&quot; on your statement.</p>
        <p className="mt-1">For billing questions, contact support@storelib.com.</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {invoice.invoice_pdf_url && (
          <a href={invoice.invoice_pdf_url} target="_blank" rel="noopener noreferrer" className="flex-1 h-10 text-[13px] font-medium text-[#7c3aed] border border-[#7c3aed] rounded-xl hover:bg-[#f5f3ff] transition-colors flex items-center justify-center gap-2 cursor-pointer">
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </a>
        )}
        {invoice.hosted_invoice_url && (
          <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="flex-1 h-10 text-[13px] font-medium text-[#6b7280] border border-[#e5e7eb] rounded-xl hover:bg-[#f9fafb] transition-colors flex items-center justify-center gap-2 cursor-pointer">
            <ExternalLink className="h-3.5 w-3.5" />
            View on Stripe
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
    ? `Your next charge will be $${((preview?.nextAmountCents || priceCents) / 100).toFixed(2)} on ${new Date(preview.nextBillingDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`
    : ""

  return (
    <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-[18px] font-bold text-[#1a1a2e] mb-2">
            {isReUpgrade ? `Upgrade Again to ${planName}` : isUpgrade ? `Upgrade to ${planName}` : isDowngrade ? `Downgrade to ${planName}` : `Switch to ${planName}`}
          </h2>

          {isReUpgrade && isSubscribed && (
            <div className="bg-[#f5f3ff] border border-[#ede9fe] rounded-xl p-4 mb-4 space-y-2">
              <p className="text-[13px] text-[#374151]">
                Your cancellation will be reversed and you&apos;ll continue on the <span className="font-semibold text-[#7c3aed]">{planName}</span> plan at <span className="font-semibold text-[#7c3aed]">${(priceCents / 100).toFixed(2)}/month</span>.
              </p>
            </div>
          )}

          {isUpgrade && !isReUpgrade && isSubscribed && (
            <div className="bg-[#f5f3ff] border border-[#ede9fe] rounded-xl p-4 mb-4 space-y-2">
              <p className="text-[13px] text-[#374151]">
                You&apos;ll be charged <span className="font-semibold text-[#7c3aed]">${((preview?.amountDueTodayCents || 0) / 100).toFixed(2)}</span> today for the remaining time in your current billing cycle.
              </p>
              {nextChargeText && <p className="text-[13px] text-[#6b7280]">{nextChargeText}</p>}
            </div>
          )}

          {isDowngrade && isSubscribed && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="text-[13px] text-[#374151]">Your plan will downgrade at the end of your current billing cycle. You&apos;ll keep all current features until then.</p>
            </div>
          )}

          {!isSubscribed && (
            <div className="bg-[#f5f3ff] border border-[#ede9fe] rounded-xl p-4 mb-4">
              <p className="text-[13px] text-[#374151]">You&apos;ll be redirected to Stripe to complete your subscription of <span className="font-semibold text-[#7c3aed]">${(priceCents / 100).toFixed(2)}/month</span>.</p>
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <button onClick={onClose} disabled={loading} className="flex-1 h-10 text-[13px] font-medium text-[#374151] bg-white border border-[#e5e7eb] rounded-xl hover:bg-[#f9fafb] transition-colors cursor-pointer">
              Cancel
            </button>
            <button onClick={onConfirm} disabled={loading} className="flex-1 h-10 text-[13px] font-semibold text-white bg-[#7c3aed] rounded-xl hover:bg-[#6d28d9] transition-colors flex items-center justify-center gap-2 cursor-pointer">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : isReUpgrade ? "Confirm Upgrade" : isUpgrade ? "Confirm Upgrade" : isDowngrade ? "Confirm Downgrade" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Mobile Bottom Sheet
   ============================================================ */
function MobileBottomSheet({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && !isVisible) {
      setIsVisible(true)
      document.body.style.overflow = "hidden"
      requestAnimationFrame(() => { requestAnimationFrame(() => { setIsAnimating(true) }) })
    } else if (!isOpen && isVisible) {
      setIsAnimating(false)
      const timer = setTimeout(() => { document.body.style.overflow = ""; setIsVisible(false); setDragY(0) }, 400)
      return () => clearTimeout(timer)
    }
    return () => { document.body.style.overflow = "" }
  }, [isOpen, isVisible])

  const handleClose = () => { setIsAnimating(false); setDragY(0); setTimeout(onClose, 400) }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]; const sheet = sheetRef.current; if (!sheet) return
    const rect = sheet.getBoundingClientRect()
    if (touch.clientY - rect.top <= 60) { startY.current = touch.clientY; setIsDragging(true) }
  }
  const handleTouchMove = (e: React.TouchEvent) => { if (!isDragging) return; const diff = e.touches[0].clientY - startY.current; if (diff > 0) setDragY(diff * 0.8) }
  const handleTouchEnd = () => { if (!isDragging) return; setIsDragging(false); if (dragY > 80) handleClose(); else setDragY(0) }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-400 ${isAnimating ? "opacity-100" : "opacity-0"}`} onClick={handleClose} />
      <div ref={sheetRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl max-h-[85vh] overflow-hidden"
        style={{ transform: isAnimating ? `translateY(${dragY}px)` : "translateY(100%)", transition: isDragging ? "none" : "transform 400ms cubic-bezier(0.32, 0.72, 0, 1)" }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-[#d1d5db] rounded-full" /></div>
        <div className="flex items-center justify-between px-5 pb-3 border-b border-[#e5e7eb]">
          <h3 className="text-[16px] font-semibold text-[#1a1a2e]">{title}</h3>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[70vh]">{children}</div>
      </div>
    </div>
  )
}

/* ============================================================
   Pricing Tiers
   ============================================================ */
function PricingTiers({ plans, currentPlan, subscription, loading, setLoading, showNotification, router, onUpgradeClick, pendingPlanId }: {
  plans: any[]; currentPlan: any; subscription: any; loading: string | null; setLoading: (v: string | null) => void
  showNotification: (type: "success" | "error", message: string) => void; router: any
  onUpgradeClick: (planId: string, planName: string, priceCents: number) => void
  pendingPlanId?: string | null
}) {
  const isSubscribed = subscription && (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due")

  const handlePlanAction = (planId: string) => {
    if (planId === currentPlan.id || loading) return
    const plan = plans.find((p: any) => p.id === planId)
    if (!plan) return

    // Free = cancel subscription
    if (planId === "free") {
      onUpgradeClick(planId, "Free", 0)
      return
    }

    // Show confirmation modal for all plan changes
    onUpgradeClick(planId, plan.name, plan.price_cents)
  }

  const descriptions: Record<string, string> = {
    free: "Perfect for getting started.",
    growth: "For creators ready to scale and pay lower fees.",
    pro: "For serious creators who want the lowest fees and priority support.",
  }

  const featureLists: Record<string, string[]> = {
    free: ["6% + $0.25 per transaction", "Unlimited digital products", "Basic OnePage features", "500 emails / month"],
    growth: ["3% + $0.25 per transaction", "Unlimited digital products", "Premium OnePage features", "Custom domain", "Verified badge", "2,000 emails / month"],
    pro: ["1.5% + $0.25 per transaction", "Unlimited digital products", "Premium OnePage features", "Custom domain", "Verified badge", "5,000 emails / month", "Priority support"],
  }

  return (
    <div>
      <h2 className="text-[17px] font-bold text-[#1a1a2e] mb-4">Plans & Pricing</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan: any) => {
          const isCurrentPlan = plan.id === currentPlan.id
          const isPendingPlan = plan.id === pendingPlanId
          const isFree = plan.id === "free"
          const isPro = plan.id === "pro"
          const isDowngrade = plan.price_cents < currentPlan.price_cents
          const monthlyPrice = plan.price_cents / 100

          const isUpgrade = plan.price_cents > currentPlan.price_cents
          const isCanceling = subscription?.cancel_at_period_end === true

          let buttonLabel = `Upgrade to ${plan.name}`
          if (isCurrentPlan && isCanceling) buttonLabel = "Current Plan"
          else if (isCurrentPlan) buttonLabel = "Current Plan"
          else if (isPendingPlan) buttonLabel = "Downgrade Scheduled"
          else if (isCanceling && isFree) buttonLabel = "Cancel Scheduled"
          else if (isCanceling) buttonLabel = "Upgrade Again"
          else if (isFree) buttonLabel = "Downgrade to Free"
          else if (isDowngrade) buttonLabel = `Downgrade to ${plan.name}`

          // Disable: current plan, "cancel scheduled" Free, pending non-upgrade
          const isDisabled = isCurrentPlan || (isCanceling && isFree) || (isPendingPlan && !isUpgrade) || loading !== null

          const isGrowth = plan.id === "growth"

          return (
            <div key={plan.id} className={`relative rounded-2xl p-6 flex flex-col transition-all duration-200 ${isPro ? "bg-[#1a1a2e] text-white shadow-xl border-2 border-[#7c3aed]/30" : "bg-white border-2 border-[#e5e7eb] hover:border-[#d1d5db] shadow-sm hover:shadow-md"}`}>
              {isGrowth && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-3.5 py-1 bg-[#7c3aed] rounded-full text-[11px] font-bold text-white shadow-lg">Popular</span>
                </div>
              )}
              {isPro && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-3.5 py-1 bg-[#7c3aed] rounded-full text-[11px] font-bold text-white shadow-lg">Recommended</span>
                </div>
              )}
              <div className="mb-4">
                <h3 className={`text-[18px] font-bold mb-1 ${isPro ? "text-white" : "text-[#1a1a2e]"}`}>{plan.name}</h3>
                <p className={`text-[12px] leading-relaxed ${isPro ? "text-white/70" : "text-[#6b7280]"}`}>{descriptions[plan.id] || ""}</p>
              </div>
              <div className="mb-5">
                {isFree ? (
                  <div className={`text-[32px] font-bold leading-none ${isPro ? "text-white" : "text-[#1a1a2e]"}`}>$0</div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[32px] font-bold leading-none ${isPro ? "text-white" : "text-[#1a1a2e]"}`}>${monthlyPrice % 1 === 0 ? monthlyPrice.toFixed(0) : monthlyPrice.toFixed(2)}</span>
                    <span className={`text-[14px] ${isPro ? "text-white/60" : "text-[#9ca3af]"}`}>/mo</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => handlePlanAction(plan.id)}
                disabled={isDisabled}
                className={`w-full h-11 text-[13px] font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 mb-5 cursor-pointer ${
                  isCurrentPlan
                    ? isPro ? "bg-white/20 text-white/80 cursor-default" : "bg-[#f3f4f6] text-[#9ca3af] cursor-default"
                    : (isCanceling && isFree) || isPendingPlan
                      ? "bg-[#f3f4f6] text-[#6b7280] cursor-default"
                      : isPro ? "bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-lg shadow-[#7c3aed]/25" : "bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
                }`}
              >
                {loading === plan.id ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : buttonLabel}
              </button>
              <ul className="space-y-2.5 flex-1">
                {(featureLists[plan.id] || []).map((feature: string, idx: number) => (
                  <li key={idx} className={`flex items-start gap-2 text-[12px] ${isPro ? "text-white/80" : "text-[#374151]"}`}>
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isPro ? "bg-[#7c3aed]/30" : "bg-[#ede9fe]"}`}>
                      <Check className={`h-2.5 w-2.5 ${isPro ? "text-[#a78bfa]" : "text-[#7c3aed]"}`} strokeWidth={3} />
                    </div>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
