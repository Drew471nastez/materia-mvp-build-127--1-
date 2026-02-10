"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Settings, Shield, ToggleLeft, Wallet, Store, CreditCard,
  Check, Loader2, Download, FileText, Clock, CheckCircle, XCircle, AlertCircle,
  Eye, EyeOff, Rocket, Lock, ShieldCheck, Pencil, Trash2, ExternalLink,
} from "lucide-react"
import { useLanguage } from "@/lib/i18n"

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "security", label: "Security", icon: Shield },
  { id: "privacy", label: "Privacy", icon: ToggleLeft },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "stores", label: "Stores", icon: Store },
  { id: "billing", label: "Billing", icon: CreditCard },
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
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [cancelingSubscription, setCancelingSubscription] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showCardNumber, setShowCardNumber] = useState(false)
  const [removingPayment, setRemovingPayment] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  // Handle success/cancel query params on mount
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
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const handleTabChange = (tabId: TabId) => {
    if (tabId === "billing") return
    router.push("/app/settings")
  }

  // Open Stripe Customer Portal (for card management, invoices, cancel)
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

  // Add/edit payment method via portal
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

  // Cancel subscription via Customer Portal
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

  const handleRemovePayment = async () => {
    setRemovingPayment(true)
    try {
      const response = await fetch("/api/billing/payment-method", { method: "DELETE" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to remove payment method")
      }
      showNotification("success", "Payment method removed successfully")
      setShowRemoveConfirm(false)
      router.refresh()
    } catch (error: any) {
      showNotification("error", error.message || "Failed to remove payment method")
    } finally {
      setRemovingPayment(false)
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const formatAmount = (cents: number) => `$${(cents / 100).toFixed(2)}`

  const maskCardNumber = (last4: string) => {
    if (showCardNumber) return `•••• •••• •••• ${last4}`
    return `XXXX XXXX XXXX ${last4}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full"><CheckCircle className="h-3 w-3" />Paid</span>
      case "open":
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full"><Clock className="h-3 w-3" />Pending</span>
      case "void":
      case "uncollectible":
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full"><XCircle className="h-3 w-3" />Failed</span>
      default:
        return <span className="text-[11px] font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
    }
  }

  const currentPlan = initialData.currentPlan
  const subscription = initialData.subscription
  const isSubscribed = subscription && (subscription.status === "active" || subscription.status === "trialing")
  const planPrice = currentPlan.price_cents > 0 ? `$${(currentPlan.price_cents / 100).toFixed(currentPlan.price_cents % 100 === 0 ? 0 : 2)}` : "$0"
  const feeDisplay = `${(currentPlan.fee_percent * 100).toFixed(currentPlan.fee_percent >= 0.01 ? 1 : 2)}% + $${(currentPlan.fee_fixed_cents / 100).toFixed(2)} per transaction`

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
        <div className="mb-6 sm:mb-8 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex gap-1 p-1 w-fit h-[44px] sm:h-[48px] items-center">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = tab.id === "billing"
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium transition-colors whitespace-nowrap cursor-pointer border ${
                    isActive
                      ? "bg-[#f3f4f6] text-[#1a1a2e] border-[#e5e7eb]"
                      : "text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border-transparent"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{getTabLabel(tab.id)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Notification */}
        {notification && (
          <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 ${notification.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-900"}`}>
            {notification.type === "success" ? <CheckCircle className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
            <p className="text-[13px] font-medium">{notification.message}</p>
          </div>
        )}

        {/* ============ BILLING CONTENT ============ */}
        <div className="space-y-6">

          {/* ---- SECTION 1: Subscription Overview ---- */}
          <div>
            <h2 className="text-[17px] font-bold text-[#1a1a2e] mb-4">Subscription Overview</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Left: Current Plan */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-semibold text-[#1a1a2e]">Current Plan</h3>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                    isSubscribed
                      ? "text-emerald-700 bg-emerald-50"
                      : "text-gray-600 bg-gray-100"
                  }`}>
                    <CheckCircle className="h-3 w-3" />
                    {currentPlan.name}
                  </span>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[36px] font-bold text-[#1a1a2e] leading-none">{planPrice}</span>
                    {currentPlan.price_cents > 0 && <span className="text-[14px] text-[#6b7280]">/month</span>}
                  </div>
                </div>

                <ul className="space-y-2.5 mb-5">
                  <li className="flex items-center gap-2.5 text-[13px] text-[#374151]">
                    <div className="w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <Check className="h-2.5 w-2.5 text-emerald-600" strokeWidth={3} />
                    </div>
                    Platform fee: {feeDisplay}
                  </li>
                  {(currentPlan.features || []).slice(0, 4).map((feature: string, idx: number) => (
                    <li key={idx} className="flex items-center gap-2.5 text-[13px] text-[#374151]">
                      <div className="w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <Check className="h-2.5 w-2.5 text-emerald-600" strokeWidth={3} />
                      </div>
                      {feature}
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
                  {currentPlan.id === "free" && (
                    <a
                      href="/app/settings/billing/upgrade"
                      className="h-10 px-5 text-[13px] font-semibold text-white bg-[#7c3aed] rounded-xl hover:bg-[#6d28d9] active:bg-[#5b21b6] transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2 no-underline"
                    >
                      <Rocket className="h-4 w-4" />
                      Upgrade
                    </a>
                  )}
                  {isSubscribed && !subscription.cancel_at_period_end && (
                    <>
                      <button
                        onClick={openCustomerPortal}
                        disabled={portalLoading}
                        className="h-10 px-5 text-[13px] font-medium text-[#7c3aed] border border-[#7c3aed] rounded-xl hover:bg-[#f5f3ff] transition-colors flex items-center gap-2"
                      >
                        {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                        Manage Subscription
                      </button>
                      <button
                        onClick={handleCancelSubscription}
                        disabled={portalLoading}
                        className="h-10 px-5 text-[13px] font-medium text-[#6b7280] border border-[#e5e7eb] rounded-xl hover:bg-[#f9fafb] hover:text-red-600 hover:border-red-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {isSubscribed && subscription.cancel_at_period_end && (
                    <div className="text-[13px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                      Your plan will be canceled on {formatDate(subscription.current_period_end)}
                    </div>
                  )}
                </div>
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

                {initialData.paymentMethod ? (
                  <div className="space-y-4">
                    {/* Card Info */}
                    <div className="bg-[#f9fafb] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wider">Card Number</span>
                        <button
                          onClick={() => setShowCardNumber(!showCardNumber)}
                          className="flex items-center gap-1 text-[11px] text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
                        >
                          {showCardNumber ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {showCardNumber ? "Hide" : "Show"}
                        </button>
                      </div>
                      <div className="text-[16px] font-mono font-medium text-[#1a1a2e] tracking-widest mb-4">
                        {maskCardNumber(initialData.paymentMethod.card_last4)}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wider block mb-1">Brand</span>
                          <span className="text-[13px] font-medium text-[#1a1a2e] capitalize">{initialData.paymentMethod.card_brand || "Card"}</span>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wider block mb-1">Expires</span>
                          <span className="text-[13px] font-medium text-[#1a1a2e]">
                            {String(initialData.paymentMethod.card_exp_month).padStart(2, "0")}/{initialData.paymentMethod.card_exp_year}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Trust Badges */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg">
                        <div className="w-7 h-4.5 bg-[#1a1f71] rounded-sm flex items-center justify-center text-white text-[6px] font-bold leading-none">VISA</div>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg">
                        <div className="w-7 h-4.5 bg-[#eb001b] rounded-sm flex items-center justify-center">
                          <div className="w-2.5 h-2.5 bg-[#f79e1b] rounded-full opacity-80" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-[10px] font-medium text-[#6b7280]">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        SSL Encrypted
                      </div>
                    </div>

                    {/* Remove Confirm */}
                    {showRemoveConfirm && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <p className="text-[13px] text-red-900 mb-3">Remove this payment method? You&apos;ll need to add a new one to subscribe.</p>
                        <div className="flex gap-2">
                          <button onClick={() => setShowRemoveConfirm(false)} disabled={removingPayment} className="flex-1 h-9 text-[13px] font-medium bg-white border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                          <button onClick={handleRemovePayment} disabled={removingPayment} className="flex-1 h-9 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5">
                            {removingPayment ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Removing...</> : "Remove"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Edit Payment / Remove buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleAddPaymentMethod}
                        disabled={portalLoading}
                        className="h-10 px-5 text-[13px] font-medium text-[#7c3aed] border border-[#7c3aed] rounded-xl hover:bg-[#f5f3ff] transition-colors flex items-center gap-2"
                      >
                        {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                        Edit Payment
                      </button>
                      <button
                        onClick={() => setShowRemoveConfirm(true)}
                        className="h-10 px-5 text-[13px] font-medium text-[#6b7280] border border-[#e5e7eb] rounded-xl hover:bg-[#f9fafb] hover:text-red-600 hover:border-red-200 transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
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
                    {/* Trust Badges */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg">
                        <div className="w-7 h-4.5 bg-[#1a1f71] rounded-sm flex items-center justify-center text-white text-[6px] font-bold leading-none">VISA</div>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg">
                        <div className="w-7 h-4.5 bg-[#eb001b] rounded-sm flex items-center justify-center">
                          <div className="w-2.5 h-2.5 bg-[#f79e1b] rounded-full opacity-80" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg text-[10px] font-medium text-[#6b7280]">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        SSL Encrypted
                      </div>
                    </div>

                    <button
                      onClick={handleAddPaymentMethod}
                      disabled={portalLoading}
                      className="h-10 px-5 text-[13px] font-medium text-[#7c3aed] border border-[#7c3aed] rounded-xl hover:bg-[#f5f3ff] transition-colors flex items-center gap-2"
                    >
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
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[17px] font-bold text-[#1a1a2e]">Billing History</h2>
              {initialData.invoices.length > 0 && (
                <button
                  onClick={openCustomerPortal}
                  disabled={portalLoading}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View All
                </button>
              )}
            </div>

            {initialData.invoices.length === 0 ? (
              <div className="bg-[#f9fafb] rounded-xl p-8 text-center">
                <FileText className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
                <p className="text-[13px] text-[#6b7280] mb-1">No invoices yet</p>
                <p className="text-[12px] text-[#9ca3af]">Your billing history will appear here</p>
              </div>
            ) : (
              <>
                {/* Mobile view */}
                <div className="block sm:hidden space-y-3">
                  {initialData.invoices.map((invoice: any) => (
                    <div key={invoice.id} className="bg-[#f9fafb] rounded-xl p-4 border border-[#e5e7eb]">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-[14px] font-semibold text-[#1a1a2e]">{formatAmount(invoice.amount_cents)}</div>
                          <div className="text-[12px] text-[#6b7280] mt-0.5">{formatDate(invoice.created_at)}</div>
                        </div>
                        {getStatusBadge(invoice.status)}
                      </div>
                      <p className="text-[12px] text-[#6b7280] mb-3">
                        {invoice.description || (invoice.period_start && invoice.period_end
                          ? `${formatDate(invoice.period_start)} to ${formatDate(invoice.period_end)}`
                          : "Subscription"
                        )}
                      </p>
                      {invoice.invoice_pdf_url && (
                        <a
                          href={invoice.invoice_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop table view */}
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
                      {initialData.invoices.map((invoice: any) => (
                        <tr key={invoice.id} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#fafafa] transition-colors">
                          <td className="py-4 text-[13px] text-[#374151]">{formatDate(invoice.created_at)}</td>
                          <td className="py-4 text-[13px] text-[#374151]">
                            {invoice.description || (invoice.period_start && invoice.period_end
                              ? `${formatDate(invoice.period_start)} to ${formatDate(invoice.period_end)}`
                              : "Subscription"
                            )}
                          </td>
                          <td className="py-4 text-[13px] font-medium text-[#1a1a2e]">{formatAmount(invoice.amount_cents)}</td>
                          <td className="py-4">{getStatusBadge(invoice.status)}</td>
                          <td className="py-4 text-right">
                            {invoice.invoice_pdf_url && (
                              <a
                                href={invoice.invoice_pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
                              >
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

          {/* ---- SECTION 3: Pricing Tiers (at the bottom) ---- */}
          <PricingTiers
            plans={initialData.plans}
            currentPlan={currentPlan}
            subscription={subscription}
            loading={loading}
            setLoading={setLoading}
            showNotification={showNotification}
            router={router}
          />

        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Pricing Tiers shown at the bottom of the billing page
   ============================================================ */
function PricingTiers({
  plans,
  currentPlan,
  subscription,
  loading,
  setLoading,
  showNotification,
  router,
}: {
  plans: any[]
  currentPlan: any
  subscription: any
  loading: string | null
  setLoading: (v: string | null) => void
  showNotification: (type: "success" | "error", message: string) => void
  router: any
}) {
  const isSubscribed = subscription && (subscription.status === "active" || subscription.status === "trialing")

  const handleUpgrade = async (planId: string) => {
    if (planId === currentPlan.id || loading) return
    setLoading(planId)
    try {
      if (planId === "free") {
        const response = await fetch("/api/billing/subscription/cancel", { method: "POST" })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to cancel subscription")
        }
        showNotification("success", "Subscription will be canceled at the end of the billing period")
        router.refresh()
        return
      }

      if (isSubscribed) {
        // Already subscribed - change plan via API
        const response = await fetch("/api/billing/subscription/change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPlanId: planId }),
        })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to change plan")
        }
        showNotification("success", "Plan changed successfully!")
        router.refresh()
      } else {
        // No subscription - redirect to Stripe Checkout
        const response = await fetch("/api/billing/subscription/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
        })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to create checkout session")
        }
        const { checkoutUrl } = await response.json()
        if (checkoutUrl) {
          window.location.href = checkoutUrl
        }
      }
    } catch (error: any) {
      showNotification("error", error.message || "An error occurred")
    } finally {
      setLoading(null)
    }
  }

  const descriptions: Record<string, string> = {
    free: "Perfect for getting started. Explore the basics at no cost.",
    growth: "Ideal for growing creators who want lower fees and more tools.",
    pro: "For professionals who demand the lowest fees and premium features.",
  }

  const featureLists: Record<string, (plan: any) => string[]> = {
    free: (plan) => [
      `${(plan.fee_percent * 100).toFixed(1)}% + $0.25 per transaction`,
      "Basic analytics dashboard",
      "Standard email support",
      "Up to 10 products",
      "Community access",
    ],
    growth: (plan) => [
      `${(plan.fee_percent * 100).toFixed(1)}% + $0.25 per transaction`,
      "Advanced analytics & reports",
      "Priority email support",
      "Custom domain support",
      "Unlimited products",
      "Email marketing tools",
      "Discount codes",
    ],
    pro: (plan) => [
      `${(plan.fee_percent * 100).toFixed(2)}% + $0.25 per transaction`,
      "Premium analytics & insights",
      "Dedicated account manager",
      "White-label options",
      "Full API access",
      "Unlimited products",
      "Custom integrations",
      "Priority processing",
    ],
  }

  return (
    <div>
      <h2 className="text-[17px] font-bold text-[#1a1a2e] mb-4">Plans & Pricing</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan: any) => {
          const isCurrentPlan = plan.id === currentPlan.id
          const isFree = plan.id === "free"
          const isPro = plan.id === "pro"
          const monthlyPrice = plan.price_cents / 100

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-6 flex flex-col transition-all duration-200 ${
                isPro
                  ? "bg-[#1a1a2e] text-white shadow-xl border-2 border-[#7c3aed]/30"
                  : "bg-white border-2 border-[#e5e7eb] hover:border-[#d1d5db] shadow-sm hover:shadow-md"
              }`}
            >
              {isPro && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-3.5 py-1 bg-[#7c3aed] rounded-full text-[11px] font-bold text-white shadow-lg">
                    Popular
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h3 className={`text-[18px] font-bold mb-1 ${isPro ? "text-white" : "text-[#1a1a2e]"}`}>
                  {plan.name}
                </h3>
                <p className={`text-[12px] leading-relaxed ${isPro ? "text-white/70" : "text-[#6b7280]"}`}>
                  {descriptions[plan.id] || ""}
                </p>
              </div>

              <div className="mb-5">
                {isFree ? (
                  <div className={`text-[32px] font-bold leading-none ${isPro ? "text-white" : "text-[#1a1a2e]"}`}>$0</div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[32px] font-bold leading-none ${isPro ? "text-white" : "text-[#1a1a2e]"}`}>
                      ${monthlyPrice % 1 === 0 ? monthlyPrice.toFixed(0) : monthlyPrice.toFixed(2)}
                    </span>
                    <span className={`text-[14px] ${isPro ? "text-white/60" : "text-[#9ca3af]"}`}>/mo</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrentPlan || loading !== null}
                className={`w-full h-11 text-[13px] font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 mb-5 ${
                  isCurrentPlan
                    ? isPro
                      ? "bg-white/20 text-white/80 cursor-default"
                      : "bg-[#f3f4f6] text-[#9ca3af] cursor-default"
                    : isPro
                      ? "bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-lg shadow-[#7c3aed]/25"
                      : "bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
                }`}
              >
                {loading === plan.id ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Processing...</>
                ) : isCurrentPlan ? (
                  "Current Plan"
                ) : isFree ? (
                  "Downgrade to Free"
                ) : (
                  `Upgrade to ${plan.name}`
                )}
              </button>

              <ul className="space-y-2.5 flex-1">
                {(featureLists[plan.id]?.(plan) || plan.features || []).map((feature: string, idx: number) => (
                  <li key={idx} className={`flex items-start gap-2 text-[12px] ${isPro ? "text-white/80" : "text-[#374151]"}`}>
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      isPro ? "bg-[#7c3aed]/30" : "bg-[#ede9fe]"
                    }`}>
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
