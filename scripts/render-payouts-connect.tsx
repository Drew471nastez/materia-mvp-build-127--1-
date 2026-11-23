/**
 * Payouts before payments are on, as a seller meets it: the status card and
 * Set up payouts, with /api/payments answered by scripts/check-payouts-connect.mjs.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { StorelibPaymentsInline } from "@/components/app/settings/storelib-payments-inline"

function Page() {
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto min-h-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8" data-payouts-setup="">
        <header className="pb-1 pt-2">
          <h1 className="flex min-h-[48px] items-center text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Payouts</h1>
          <p className="-mt-1 text-[13px] leading-5 text-[#6b7280]">Set up payments to start selling</p>
        </header>
        <div className="mt-4">
          <StorelibPaymentsInline compact />
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
