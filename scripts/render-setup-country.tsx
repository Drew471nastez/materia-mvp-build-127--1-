/**
 * Set up payments, step one, drawn as it is on a phone: the full screen
 * subpage with the Country field in it. scripts/check-setup-country.mjs opens
 * it, taps the field and looks at what comes up — the list has to be ON TOP of
 * the panel, not behind it.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { PaymentsSetupFlow } from "@/components/app/settings/payments-setup-flow"
import type { Overview } from "@/components/app/settings/payments-hub-shared"

const overview = {
  provider: "stripe",
  environment: "sandbox",
  configured: true,
  tableMissing: false,
  stage: "set_up",
  copy: { title: "Set up payments", line: "", action: "Set up payments" },
  kind: null,
  requirements: [],
  checkoutOpen: false,
  balances: [],
  balancesAt: null,
  payoutDestination: null,
  payouts: [],
  can: { embeddedOnboarding: true, hostedOnboarding: false, embeddedPayoutForm: true, requestPayout: false },
  unavailable: [],
  badge: "off",
  uxState: "setup",
  beat: "personal",
  prefill: { firstName: "", lastName: "", country: null },
  payoutHint: null,
} as unknown as Overview

function Page() {
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <h1 className="text-[24px] font-bold text-[#1a1a2e]">Payouts</h1>
      </div>
      <PaymentsSetupFlow open mode="setup" data={overview} onClose={() => {}} onData={() => {}} onFinished={() => {}} />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
