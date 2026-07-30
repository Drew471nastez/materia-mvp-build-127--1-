"use client"

import { useState } from "react"
import { CreditCard, Loader2, ExternalLink } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

interface PaymentMethod {
  card_brand: string
  card_last4: string
  card_exp_month: number
  card_exp_year: number
}

interface PaymentMethodSectionProps {
  paymentMethod: PaymentMethod | null
  onManagePayment: () => Promise<void>
}

export function PaymentMethodSection({ paymentMethod, onManagePayment }: PaymentMethodSectionProps) {
  const { t } = useLocale()
  const [loading, setLoading] = useState(false)

  const handleManage = async () => {
    setLoading(true)
    try {
      await onManagePayment()
    } catch (error) {
      console.error("Error opening customer portal:", error)
      setLoading(false)
    }
  }

  const getCardBrandIcon = (brand: string) => {
    // You can expand this with actual card brand SVGs
    const brandUpper = brand.toUpperCase()
    return (
      <div className="w-10 h-7 bg-gradient-to-br from-gray-700 to-gray-900 rounded flex items-center justify-center text-white text-[10px] font-bold">
        {brandUpper === "VISA" && "VISA"}
        {brandUpper === "MASTERCARD" && "MC"}
        {brandUpper === "AMEX" && "AMEX"}
        {brandUpper === "DISCOVER" && "DISC"}
        {!["VISA", "MASTERCARD", "AMEX", "DISCOVER"].includes(brandUpper) && brandUpper.slice(0, 4)}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
            {t("settings.pmPaymentMethod")}
          </h3>
          <p className="text-[13px] text-[#6b7280]">
            {t("settings.pmManageDesc")}
          </p>
        </div>
      </div>

      {paymentMethod ? (
        <div className="bg-[#f9fafb] rounded-xl p-4 mb-4">
          <div className="flex items-center gap-4">
            {getCardBrandIcon(paymentMethod.card_brand)}
            <div className="flex-1">
              <div className="text-[14px] font-medium text-[#1a1a2e] mb-0.5">
                {paymentMethod.card_brand.charAt(0).toUpperCase() + paymentMethod.card_brand.slice(1)} •••• {paymentMethod.card_last4}
              </div>
              <div className="text-[12px] text-[#6b7280]">
                {t("settings.pmExpires")} {String(paymentMethod.card_exp_month).padStart(2, "0")}/{paymentMethod.card_exp_year}
              </div>
            </div>
            <div className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              {t("settings.pmDefault")}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#f9fafb] rounded-xl p-6 text-center mb-4">
          <CreditCard className="h-10 w-10 text-[#9ca3af] mx-auto mb-3" />
          <p className="text-[13px] text-[#6b7280] mb-1">{t("settings.pmNoMethod")}</p>
          <p className="text-[12px] text-[#9ca3af]">
            {t("settings.pmAddToSubscribe")}
          </p>
        </div>
      )}

      <button
        onClick={handleManage}
        disabled={loading}
        className="w-full sm:w-auto px-5 h-10 text-[13px] font-medium bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:bg-[#c4b5fd] text-white rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("settings.pmOpeningPortal")}
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            {paymentMethod ? t("settings.pmManageMethods") : t("settings.coAddPaymentMethod")}
            <ExternalLink className="h-3.5 w-3.5" />
          </>
        )}
      </button>

      <p className="text-[11px] text-[#9ca3af] mt-3">
        {t("settings.pmRedirectNote")}
      </p>
    </div>
  )
}
