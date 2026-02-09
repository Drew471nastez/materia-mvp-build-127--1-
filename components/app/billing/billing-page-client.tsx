"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Settings, Shield, ToggleLeft, Wallet, Store, CreditCard,
} from "lucide-react"
import { PricingPlans } from "./pricing-plans"
import { SubscriptionStatus } from "./subscription-status"
import { PaymentMethodSection } from "./payment-method-section"
import { InvoicesList } from "./invoices-list"
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

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const handleTabChange = (tabId: TabId) => {
    if (tabId === "billing") return
    // All other tabs go to /app/settings
    router.push("/app/settings")
  }

  const handleUpgrade = async (planId: string) => {
    try {
      if (planId === "free") {
        const response = await fetch("/api/billing/subscription/cancel", {
          method: "POST",
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to cancel subscription")
        }

        showNotification("success", "Subscription will be canceled at the end of the billing period")
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
        } else {
          throw new Error("No checkout URL received")
        }
      }
    } catch (error: any) {
      console.error("Upgrade error:", error)
      showNotification("error", error.message || "An error occurred")
    }
  }

  const handleCancelSubscription = async () => {
    try {
      const response = await fetch("/api/billing/subscription/cancel", {
        method: "POST",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to cancel subscription")
      }

      showNotification("success", "Subscription canceled successfully")
      router.refresh()
    } catch (error: any) {
      console.error("Cancel error:", error)
      showNotification("error", error.message || "Failed to cancel subscription")
    }
  }

  const handleManagePayment = async () => {
    try {
      const response = await fetch("/api/billing/customer-portal", {
        method: "POST",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to open customer portal")
      }

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error("No portal URL received")
      }
    } catch (error: any) {
      console.error("Portal error:", error)
      showNotification("error", error.message || "Failed to open payment portal")
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

  return (
    <div className="h-full overflow-y-scroll overflow-x-hidden page-scroll bg-[#fafafa]" style={{ scrollbarGutter: 'stable' }}>
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
          <div
            className={`mb-6 p-4 rounded-xl border ${
              notification.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            <p className="text-[13px] font-medium">{notification.message}</p>
          </div>
        )}

        {/* Billing Content */}
        <div className="space-y-6">
          {/* Your Storelib Subscription heading */}
          <div>
            <h2 className="text-[18px] sm:text-[20px] font-bold text-[#1a1a2e] mb-1">
              Your Storelib Subscription
            </h2>
            <p className="text-[13px] text-[#6b7280]">
              Manage your plan, payment methods, and billing history
            </p>
          </div>

          {/* Subscription Status - Only show if user has a paid subscription */}
          {initialData.subscription && (
            <SubscriptionStatus
              subscription={initialData.subscription}
              onCancel={handleCancelSubscription}
            />
          )}

          {/* Pricing Plans */}
          <PricingPlans
            plans={initialData.plans}
            currentPlanId={initialData.currentPlan.id}
            onUpgrade={handleUpgrade}
          />

          {/* Payment Method */}
          <PaymentMethodSection
            paymentMethod={initialData.paymentMethod}
            onManagePayment={handleManagePayment}
          />

          {/* Invoices */}
          <InvoicesList invoices={initialData.invoices} />
        </div>
      </div>
    </div>
  )
}
