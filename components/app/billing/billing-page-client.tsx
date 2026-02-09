"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PricingPlans } from "./pricing-plans"
import { SubscriptionStatus } from "./subscription-status"
import { PaymentMethodSection } from "./payment-method-section"
import { InvoicesList } from "./invoices-list"

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
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const handleUpgrade = async (planId: string) => {
    try {
      if (planId === "free") {
        // Downgrading to free requires canceling the subscription
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

      // Check if user has an active subscription
      if (initialData.subscription) {
        // Changing plans
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
        // Creating new subscription
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

        // Redirect to Stripe Checkout
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

      // Redirect to Stripe Customer Portal
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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex gap-1 p-1 w-fit h-[44px] sm:h-[48px] items-center">
          <Link href="/app/settings" className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border border-transparent whitespace-nowrap">
            General
          </Link>
          <Link href="/app/settings" className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border border-transparent whitespace-nowrap">
            Security
          </Link>
          <Link href="/app/settings" className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border border-transparent whitespace-nowrap">
            Privacy
          </Link>
          <span className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium bg-[#f3f4f6] text-[#1a1a2e] border border-[#e5e7eb] whitespace-nowrap">
            Billing
          </span>
          <Link href="/app/settings" className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border border-transparent whitespace-nowrap">
            Payments
          </Link>
          <Link href="/app/settings" className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border border-transparent whitespace-nowrap">
            Stores
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-[22px] sm:text-[28px] font-bold text-[#1a1a2e] mb-2">
          Billing & Subscription
        </h1>
        <p className="text-[14px] text-[#6b7280]">
          This tab manages plans, subscriptions, and platform transaction fees. It does not manage payout provider connections.
        </p>
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

      <div className="space-y-6">
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
  )
}
