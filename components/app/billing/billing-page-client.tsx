"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Settings, Shield, ToggleLeft, Wallet, Store, CreditCard,
  X, Check, Star, Loader2, Download, FileText, Clock, CheckCircle, XCircle, AlertCircle, CreditCard as CardIcon,
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
  const { t } = useLanguage()
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly")
  const [loading, setLoading] = useState<string | null>(null)
  const [cancelingSubscription, setCancelingSubscription] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Payment form state
  const [cardNumber, setCardNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvc, setCvc] = useState("")
  const [updatingPayment, setUpdatingPayment] = useState(false)

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const handleTabChange = (tabId: TabId) => {
    if (tabId === "billing") return
    router.push("/app/settings")
  }

  const handleUpgrade = async (planId: string) => {
    if (planId === initialData.currentPlan.id || loading) return
    setLoading(planId)
    try {
      if (planId === "free") {
        const response = await fetch("/api/billing/subscription/cancel", { method: "POST" })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to cancel subscription")
        }
        showNotification("success", "Subscription will be canceled at the end of the billing period")
        setShowPricingModal(false)
        router.refresh()
        return
      }

      if (initialData.subscription) {
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
        setShowPricingModal(false)
        router.refresh()
      } else {
        const response = await fetch("/api/billing/subscription/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId }),
        })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to create subscription")
        }
        const data = await response.json()
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl
        }
      }
    } catch (error: any) {
      showNotification("error", error.message || "An error occurred")
    } finally {
      setLoading(null)
    }
  }

  const handleCancelSubscription = async () => {
    setCancelingSubscription(true)
    try {
      const response = await fetch("/api/billing/subscription/cancel", { method: "POST" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to cancel subscription")
      }
      showNotification("success", "Subscription canceled successfully")
      setShowCancelConfirm(false)
      router.refresh()
    } catch (error: any) {
      showNotification("error", error.message || "Failed to cancel subscription")
    } finally {
      setCancelingSubscription(false)
    }
  }

  const handleUpdatePayment = async () => {
    setUpdatingPayment(true)
    try {
      const response = await fetch("/api/billing/customer-portal", { method: "POST" })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to open customer portal")
      }
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error: any) {
      showNotification("error", error.message || "Failed to open payment portal")
    } finally {
      setUpdatingPayment(false)
    }
  }

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ")
  }

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4)
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return digits
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="h-3 w-3" />Paid</span>
      case "open":
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="h-3 w-3" />Pending</span>
      case "void":
      case "uncollectible":
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="h-3 w-3" />{status.charAt(0).toUpperCase() + status.slice(1)}</span>
      default:
        return <span className="text-[11px] font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
    }
  }

  const currentPlan = initialData.currentPlan
  const subscription = initialData.subscription
  const planPrice = currentPlan.price_cents > 0 ? `$${(currentPlan.price_cents / 100).toFixed(0)}/mo` : "Free"
  const feeDisplay = `${(currentPlan.fee_percent * 100).toFixed(currentPlan.fee_percent >= 0.01 ? 1 : 2)}% + $${(currentPlan.fee_fixed_cents / 100).toFixed(2)} per transaction`

  return (
    <>
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
            <div className={`mb-6 p-4 rounded-xl border ${notification.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-900"}`}>
              <p className="text-[13px] font-medium">{notification.message}</p>
            </div>
          )}

          {/* ============ BILLING CONTENT ============ */}
          <div className="space-y-6">

            {/* Row: Subscription Info + Payment Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Left: Your Storelib Subscription */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h2 className="text-[16px] sm:text-[18px] font-bold text-[#1a1a2e] mb-4">Your Storelib Subscription</h2>
                <div className="bg-[#f9fafb] rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[14px] font-semibold text-[#1a1a2e]">{currentPlan.name} Plan</span>
                    <span className="text-[14px] font-bold text-[#1a1a2e]">{planPrice}</span>
                  </div>
                  {subscription && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[12px] text-[#6b7280]">Status:</span>
                      {subscription.cancel_at_period_end ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="h-3 w-3" />Canceling</span>
                      ) : subscription.status === "active" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="h-3 w-3" />Active</span>
                      ) : subscription.status === "past_due" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><AlertCircle className="h-3 w-3" />Past Due</span>
                      ) : (
                        <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{subscription.status}</span>
                      )}
                    </div>
                  )}
                  <p className="text-[12px] text-[#6b7280]">Platform fee: {feeDisplay}</p>
                  {subscription?.current_period_end && (
                    <p className="text-[12px] text-[#6b7280] mt-1">
                      {subscription.cancel_at_period_end ? "Expires" : "Next billing"}: {formatDate(subscription.current_period_end)}
                    </p>
                  )}
                </div>

                {/* Cancel Confirm */}
                {showCancelConfirm && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                    <p className="text-[13px] text-red-900 mb-3">Are you sure? You'll keep access until the end of your billing period.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowCancelConfirm(false)} disabled={cancelingSubscription} className="flex-1 h-9 text-[13px] font-medium bg-white border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Keep Plan</button>
                      <button onClick={handleCancelSubscription} disabled={cancelingSubscription} className="flex-1 h-9 text-[13px] font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5">
                        {cancelingSubscription ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Canceling...</> : "Confirm Cancel"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3">
                  {subscription && subscription.status === "active" && !subscription.cancel_at_period_end && (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="h-10 px-5 text-[13px] font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      Cancel Subscription
                    </button>
                  )}
                  <button
                    onClick={() => setShowPricingModal(true)}
                    className="h-10 px-5 text-[13px] font-medium text-[#6c47ff] border border-[#6c47ff] rounded-xl hover:bg-[#f5f3ff] transition-colors"
                  >
                    Change Plan
                  </button>
                </div>
              </div>

              {/* Right: Payment Details */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h2 className="text-[16px] sm:text-[18px] font-bold text-[#1a1a2e] mb-4">Payment Details</h2>

                {initialData.paymentMethod ? (
                  <div className="bg-[#f9fafb] rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-7 bg-gradient-to-br from-gray-700 to-gray-900 rounded flex items-center justify-center text-white text-[9px] font-bold">
                        {initialData.paymentMethod.card_brand?.toUpperCase().slice(0, 4)}
                      </div>
                      <div>
                        <div className="text-[14px] font-medium text-[#1a1a2e]">
                          {initialData.paymentMethod.card_brand?.charAt(0).toUpperCase() + initialData.paymentMethod.card_brand?.slice(1)} •••• {initialData.paymentMethod.card_last4}
                        </div>
                        <div className="text-[12px] text-[#6b7280]">
                          Expires {String(initialData.paymentMethod.card_exp_month).padStart(2, "0")}/{initialData.paymentMethod.card_exp_year}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#6b7280] mb-4">No payment method saved.</p>
                )}

                {/* Card input fields */}
                <div className="space-y-3 mb-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Card number"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      className="w-full h-11 pl-4 pr-24 text-[14px] border border-[#e5e7eb] rounded-xl focus:ring-2 focus:ring-[#6c47ff] focus:border-[#6c47ff] outline-none"
                      maxLength={19}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <div className="w-8 h-5 bg-[#1a1f71] rounded-sm flex items-center justify-center text-white text-[6px] font-bold">VISA</div>
                      <div className="w-8 h-5 bg-[#eb001b] rounded-sm flex items-center justify-center">
                        <div className="w-3 h-3 bg-[#f79e1b] rounded-full opacity-80" />
                      </div>
                      <div className="w-8 h-5 bg-[#006fcf] rounded-sm flex items-center justify-center text-white text-[5px] font-bold">AMEX</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Expiration date"
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      className="h-11 px-4 text-[14px] border border-[#e5e7eb] rounded-xl focus:ring-2 focus:ring-[#6c47ff] focus:border-[#6c47ff] outline-none"
                      maxLength={5}
                    />
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Security code"
                        value={cvc}
                        onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        className="w-full h-11 pl-4 pr-10 text-[14px] border border-[#e5e7eb] rounded-xl focus:ring-2 focus:ring-[#6c47ff] focus:border-[#6c47ff] outline-none"
                        maxLength={4}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#9ca3af] border border-[#d1d5db] rounded px-1 py-0.5 font-mono">123</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleUpdatePayment}
                  disabled={updatingPayment}
                  className="w-full sm:w-auto h-11 px-8 text-[14px] font-semibold bg-[#1a1a2e] text-white rounded-xl hover:bg-[#2d2d44] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  {updatingPayment ? <><Loader2 className="h-4 w-4 animate-spin" />Updating...</> : "Update"}
                </button>
              </div>
            </div>

            {/* Invoices */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5e7eb]">
              <div className="flex items-center gap-2 mb-5">
                <Clock className="h-5 w-5 text-[#1a1a2e]" />
                <h2 className="text-[16px] sm:text-[18px] font-bold text-[#1a1a2e]">Invoices</h2>
              </div>

              {initialData.invoices.length === 0 ? (
                <div className="bg-[#f9fafb] rounded-xl p-8 text-center">
                  <FileText className="h-10 w-10 text-[#9ca3af] mx-auto mb-3" />
                  <p className="text-[13px] text-[#6b7280]">No invoices yet</p>
                  <p className="text-[12px] text-[#9ca3af] mt-1">Your billing history will appear here</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#e5e7eb]">
                        <th className="text-left text-[13px] font-semibold text-[#1a1a2e] pb-3">Date</th>
                        <th className="text-left text-[13px] font-semibold text-[#1a1a2e] pb-3">Amount</th>
                        <th className="text-left text-[13px] font-semibold text-[#1a1a2e] pb-3">Status</th>
                        <th className="text-right text-[13px] font-semibold text-[#1a1a2e] pb-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {initialData.invoices.map((invoice: any) => (
                        <tr key={invoice.id} className="border-b border-[#f3f4f6] last:border-0">
                          <td className="py-4 text-[13px] text-[#374151]">{formatDate(invoice.created_at)}</td>
                          <td className="py-4 text-[13px] text-[#374151]">{formatAmount(invoice.amount_cents)}</td>
                          <td className="py-4">{getStatusBadge(invoice.status)}</td>
                          <td className="py-4 text-right">
                            {invoice.invoice_pdf_url && (
                              <a
                                href={invoice.invoice_pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#374151] border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors"
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
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============ FULLSCREEN PRICING MODAL ============ */}
      {showPricingModal && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          {/* Close button */}
          <button
            onClick={() => setShowPricingModal(false)}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="h-6 w-6 text-[#374151]" />
          </button>

          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            {/* Monthly / Annual toggle */}
            <div className="flex justify-center mb-10">
              <div className="inline-flex items-center bg-[#f3f4f6] rounded-full p-1">
                <button
                  onClick={() => setBillingPeriod("monthly")}
                  className={`px-5 py-2 text-[14px] font-medium rounded-full transition-colors ${
                    billingPeriod === "monthly" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280]"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod("annual")}
                  className={`px-5 py-2 text-[14px] font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                    billingPeriod === "annual" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-[#6b7280]"
                  }`}
                >
                  Annual <span className="text-[12px] font-semibold text-emerald-600">(Save 20%)</span>
                </button>
              </div>
            </div>

            {/* Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {initialData.plans.map((plan: any) => {
                const isCurrentPlan = plan.id === currentPlan.id
                const isFree = plan.id === "free"
                const isGrowth = plan.id === "growth"
                const monthlyPrice = plan.price_cents / 100
                const annualPrice = Math.round(monthlyPrice * 0.8 * 100) / 100
                const displayPrice = billingPeriod === "annual" && !isFree ? annualPrice : monthlyPrice
                const originalPrice = billingPeriod === "annual" && !isFree ? monthlyPrice : null
                const feePercent = (plan.fee_percent * 100).toFixed(plan.fee_percent >= 0.01 ? 1 : 2)

                const descriptions: Record<string, string> = {
                  free: "Get started with the essentials. Perfect for new creators.",
                  growth: "Lower fees and advanced tools for growing creators.",
                  pro: "The lowest fees and premium features for professionals.",
                }

                const featureLists: Record<string, string[]> = {
                  free: [
                    `${feePercent}% + $0.25 per transaction`,
                    "Basic analytics",
                    "Standard support",
                    "Up to 10 products",
                    "Community access",
                  ],
                  growth: [
                    `${feePercent}% + $0.25 per transaction`,
                    "Advanced analytics",
                    "Priority support",
                    "Custom domain",
                    "Unlimited products",
                    "Email marketing tools",
                  ],
                  pro: [
                    `${feePercent}% + $0.25 per transaction`,
                    "Premium analytics",
                    "Dedicated support",
                    "White-label options",
                    "API access",
                    "Unlimited products",
                    "Custom integrations",
                    "Priority processing",
                  ],
                }

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl border-2 p-6 sm:p-7 flex flex-col ${
                      isGrowth
                        ? "border-[#d4a017] shadow-lg"
                        : isCurrentPlan
                          ? "border-[#6c47ff] bg-[#faf8ff]"
                          : "border-[#e5e7eb]"
                    }`}
                  >
                    {/* Most Popular badge */}
                    {isGrowth && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#fffbeb] border border-[#d4a017] rounded-full text-[11px] font-semibold text-[#92710c]">
                          <Star className="h-3 w-3 fill-[#d4a017] text-[#d4a017]" />
                          Most Popular
                        </span>
                      </div>
                    )}

                    {/* Plan name */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-[22px] sm:text-[26px] font-bold text-[#1a1a2e]">{plan.name}</h3>
                        {billingPeriod === "annual" && !isFree && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Save 20%</span>
                        )}
                      </div>
                      <p className="text-[13px] text-[#6b7280] leading-relaxed">{descriptions[plan.id] || ""}</p>
                    </div>

                    {/* Price */}
                    <div className="mb-5">
                      {isFree ? (
                        <>
                          <div className="text-[40px] font-bold text-[#1a1a2e] leading-none">$0</div>
                          <p className="text-[13px] text-[#6b7280] mt-1">Free</p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-2">
                            <span className="text-[40px] font-bold text-[#1a1a2e] leading-none">${displayPrice.toFixed(displayPrice % 1 === 0 ? 0 : 2)}</span>
                            {originalPrice && (
                              <span className="text-[18px] text-[#9ca3af] line-through">${originalPrice.toFixed(0)}</span>
                            )}
                          </div>
                          <p className="text-[13px] text-[#6b7280] mt-1">
                            Per month{billingPeriod === "annual" ? ", billed annually" : ""}
                          </p>
                        </>
                      )}
                    </div>

                    {/* CTA Button */}
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isCurrentPlan || loading !== null}
                      className={`w-full h-12 text-[14px] font-semibold rounded-xl transition-all flex items-center justify-center gap-2 mb-6 ${
                        isCurrentPlan
                          ? "bg-[#1a1a2e] text-white cursor-default"
                          : isGrowth
                            ? "bg-[#2d6a4f] hover:bg-[#245a42] text-white"
                            : isFree
                              ? "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]"
                              : "bg-[#2d6a4f] hover:bg-[#245a42] text-white"
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

                    {/* Features */}
                    <ul className="space-y-3 flex-1">
                      {(featureLists[plan.id] || plan.features || []).map((feature: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                          <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="h-3 w-3 text-emerald-600" strokeWidth={3} />
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
        </div>
      )}
    </>
  )
}
