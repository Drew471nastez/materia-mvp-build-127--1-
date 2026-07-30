"use client"

import { useState } from "react"
import { AlertCircle, CheckCircle, Clock, XCircle, Loader2 } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

interface Subscription {
  id: string
  status: string
  current_period_end: string
  cancel_at_period_end: boolean
  subscription_plans: {
    name: string
    price_cents: number
  }
}

interface SubscriptionStatusProps {
  subscription: Subscription | null
  onCancel: () => Promise<void>
}

export function SubscriptionStatus({ subscription, onCancel }: SubscriptionStatusProps) {
  const { t } = useLocale()
  const [canceling, setCanceling] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  if (!subscription) {
    return null // Free plan users don't have a subscription
  }

  const handleCancel = async () => {
    setCanceling(true)
    try {
      await onCancel()
      setShowConfirm(false)
    } catch (error) {
      console.error("Cancel error:", error)
    } finally {
      setCanceling(false)
    }
  }

  const getStatusBadge = () => {
    switch (subscription.status) {
      case "active":
        if (subscription.cancel_at_period_end) {
          return (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
              <Clock className="h-3 w-3" />
              {t("settings.ssCanceling")}
            </div>
          )
        }
        return (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
            <CheckCircle className="h-3 w-3" />
            {t("settings.ssActive")}
          </div>
        )
      case "past_due":
        return (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
            <AlertCircle className="h-3 w-3" />
            {t("settings.ssPastDue")}
          </div>
        )
      case "canceled":
        return (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
            <XCircle className="h-3 w-3" />
            {t("settings.ssCanceled")}
          </div>
        )
      default:
        return (
          <div className="text-[11px] font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
            {subscription.status}
          </div>
        )
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }

  const nextBillingDate = new Date(subscription.current_period_end)
  const planPrice = `$${(subscription.subscription_plans.price_cents / 100).toFixed(0)}`

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[15px] font-semibold text-[#1a1a2e]">
              {t("settings.ssTitle")}
            </h3>
            {getStatusBadge()}
          </div>
          <p className="text-[13px] text-[#6b7280]">
            {t("settings.ssManage")} {subscription.subscription_plans.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-[#f9fafb] rounded-xl p-4">
          <div className="text-[12px] font-medium text-[#6b7280] mb-1">{t("settings.currentPlan")}</div>
          <div className="text-[16px] font-bold text-[#1a1a2e]">
            {subscription.subscription_plans.name}
          </div>
          <div className="text-[13px] text-[#6b7280] mt-0.5">
            {planPrice}{t("settings.perMonth")}
          </div>
        </div>

        <div className="bg-[#f9fafb] rounded-xl p-4">
          <div className="text-[12px] font-medium text-[#6b7280] mb-1">
            {subscription.cancel_at_period_end ? t("settings.ssExpiresOn") : t("settings.ssNextBilling")}
          </div>
          <div className="text-[16px] font-bold text-[#1a1a2e]">
            {formatDate(subscription.current_period_end)}
          </div>
          {!subscription.cancel_at_period_end && (
            <div className="text-[13px] text-[#6b7280] mt-0.5">
              {t("settings.ssYoullBeCharged")} {planPrice}
            </div>
          )}
        </div>
      </div>

      {subscription.cancel_at_period_end && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-medium text-amber-900 mb-1">
                {t("settings.ssCanceledTitle")}
              </p>
              <p className="text-[12px] text-amber-700">
                {t("settings.ssEndOnA")} {formatDate(subscription.current_period_end)}. {t("settings.ssEndOnB")}
              </p>
            </div>
          </div>
        </div>
      )}

      {subscription.status === "past_due" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-medium text-red-900 mb-1">
                {t("settings.ssPaymentFailed")}
              </p>
              <p className="text-[12px] text-red-700">
                {t("settings.ssPaymentFailedDesc")}
              </p>
            </div>
          </div>
        </div>
      )}

      {!subscription.cancel_at_period_end && subscription.status === "active" && (
        <div>
          {showConfirm ? (
            <div className="bg-[#f9fafb] rounded-xl p-4">
              <p className="text-[13px] text-[#1a1a2e] mb-4">
                {t("settings.ssConfirmCancelA")}{" "}
                {formatDate(subscription.current_period_end)}{t("settings.ssConfirmCancelB")}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={canceling}
                  className="flex-1 h-9 text-[13px] font-medium bg-white hover:bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb] rounded-lg transition-colors"
                >
                  {t("settings.ssKeepSubscription")}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={canceling}
                  className="flex-1 h-9 text-[13px] font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {canceling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("settings.ssCancelingEllipsis")}
                    </>
                  ) : (
                    t("settings.ssConfirmCancellation")
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="text-[13px] font-medium text-[#dc2626] hover:text-[#b91c1c] transition-colors"
            >
              {t("settings.ssCancelSubscription")}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
