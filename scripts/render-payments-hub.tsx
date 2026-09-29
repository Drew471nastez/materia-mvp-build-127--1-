/**
 * The Payments tab's hub for a creator on Storelib Payments (Airwallex),
 * drawn in the Settings column it lives in, with /api/payments answered by
 * the page itself: `window.__state` picks which overview comes back.
 * scripts/check-payments-hub.mjs drives it.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { PaymentsHub } from "@/components/app/settings/payments-hub"
import { STAGE_COPY, type PaymentsStage } from "@/lib/payments/model"

type W = Window & { __state?: string; __calls?: Array<{ path: string; body: unknown }> }
const w = window as W

function overview(stage: PaymentsStage, extra: Record<string, unknown> = {}) {
  return {
    provider: "airwallex",
    environment: "sandbox",
    configured: true,
    tableMissing: false,
    stage,
    copy: STAGE_COPY[stage],
    kind: "individual",
    requirements: [],
    checkoutOpen: stage === "active",
    balances: [],
    balancesAt: null,
    payoutDestination: null,
    payouts: [],
    can: { embeddedOnboarding: false, hostedOnboarding: true, embeddedPayoutForm: true, requestPayout: stage === "active" },
    unavailable: [],
    ...extra,
  }
}

const STATES: Record<string, unknown> = {
  set_up: overview("set_up", { kind: null }),
  verify: overview("verify"),
  review: overview("review"),
  action: overview("action", {
    requirements: [
      { key: "primary_id", text: "Upload a new photo of your ID: the document has expired." },
      { key: "selfie", text: "Take the selfie again." },
    ],
  }),
  payout: overview("payout"),
  active: overview("active", {
    balances: [
      { currency: "USD", availableMinor: 128450, pendingMinor: 4200 },
      { currency: "EUR", availableMinor: 0, pendingMinor: 1999 },
    ],
    balancesAt: "2026-09-29T10:12:00.000Z",
    payoutDestination: { bankName: "Chase", country: "US", currency: "USD", last4: "4821", holder: "individual" },
    payouts: [
      { id: "t1", amountMinor: 50000, currency: "USD", status: "paid", statusText: "Paid", createdAt: "2026-09-20T10:00:00+0000" },
      { id: "t2", amountMinor: 12050, currency: "USD", status: "processing", statusText: "On its way", createdAt: "2026-09-27T10:00:00+0000" },
      { id: "t3", amountMinor: 9900, currency: "USD", status: "failed", statusText: "Failed", createdAt: "2026-09-12T10:00:00+0000" },
    ],
  }),
  paused: overview("paused"),
  off: { ...overview("set_up"), configured: false },
}

w.__calls = []
const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  if (!url.startsWith("/api/payments/")) return realFetch(input, init)
  const path = url.slice("/api/payments/".length)
  w.__calls?.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null })
  const state = STATES[w.__state ?? "set_up"]
  return new Response(JSON.stringify(state), { status: 200, headers: { "content-type": "application/json" } })
}) as typeof fetch

function Page() {
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="mb-6 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Settings</h1>
        <div data-probe-column="" className="max-w-4xl">
          <PaymentsHub />
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app") as HTMLElement).render(<Page />)
