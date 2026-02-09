"use client"

import { useState } from "react"
import { CreditCard, Loader2, ExternalLink } from "lucide-react"

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

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">Payment details</h3>
        <p className="text-[13px] text-[#6b7280]">Update card number, expiration, and CVC in Stripe&apos;s secure billing form.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <div className="text-[11px] text-[#6b7280] mb-1">Card number</div>
          <div className="text-[13px] font-medium text-[#1a1a2e]">{paymentMethod ? `•••• •••• •••• ${paymentMethod.card_last4}` : "Not added"}</div>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3">
          <div className="text-[11px] text-[#6b7280] mb-1">Expiration month/year</div>
          <div className="text-[13px] font-medium text-[#1a1a2e]">
            {paymentMethod ? `${String(paymentMethod.card_exp_month).padStart(2, "0")}/${paymentMethod.card_exp_year}` : "Not added"}
          </div>
        </div>
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3 sm:col-span-2">
          <div className="text-[11px] text-[#6b7280] mb-1">CVC</div>
          <div className="text-[13px] font-medium text-[#1a1a2e]">•••</div>
        </div>
      </div>

      <button
        onClick={handleManage}
        disabled={loading}
        className="w-full sm:w-auto px-5 h-10 text-[13px] font-medium bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:bg-[#c4b5fd] text-white rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening Portal...
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            {paymentMethod ? "Update Payment Method" : "Set Up Payment Method"}
            <ExternalLink className="h-3.5 w-3.5" />
          </>
        )}
      </button>
    </div>
  )
}
