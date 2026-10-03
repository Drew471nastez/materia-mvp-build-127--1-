/**
 * Set up payments, step two onwards, as a creator meets it: Storelib's own
 * details form and bank form. scripts/check-setup-own-form.mjs answers the
 * /api/payments calls the way the server would and walks it through.
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
  kind: "individual",
  requirements: [],
  checkoutOpen: false,
  balances: [],
  balancesAt: null,
  payoutDestination: null,
  payouts: [],
  can: { embeddedOnboarding: false, hostedOnboarding: false, embeddedPayoutForm: false, requestPayout: false },
  unavailable: [],
  badge: "off",
  uxState: "setup",
  beat: "verification",
  paymentsStatus: { status: "INCOMPLETE", title: "Finish setting up", line: "", action: "onboarding" },
  prefill: { firstName: "Andrei", lastName: "Balan", country: "RO" },
  payoutHint: { accountName: "Andrei Balan", currency: "RON", country: "RO", holderType: "individual", inStorelib: true },
} as unknown as Overview

function Page() {
  const [data, setData] = React.useState(overview)
  const [done, setDone] = React.useState(false)
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <h1 className="text-[24px] font-bold text-[#1a1a2e]">Payouts</h1>
        {done ? <p data-finished="">finished</p> : null}
      </div>
      <PaymentsSetupFlow open mode={location.search.includes("later") ? "details" : "setup"} data={data} onClose={() => {}} onData={setData} onFinished={() => setDone(true)} />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
