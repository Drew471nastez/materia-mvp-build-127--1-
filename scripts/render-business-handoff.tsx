/* The claim page's cards and Settings › Team's Transfer ownership, drawn for scripts/check-business-handoff.mjs (?view=claim-<state> or ?view=panel-new|panel-open). */
import React from "react"
import { createRoot } from "react-dom/client"
import { Frame } from "@/components/team/join-card"
import { ClaimCard } from "@/components/handoff/claim-card"
import { HandoffPanel } from "@/components/app/settings/handoff-panel"
import type { ClaimState } from "@/lib/handoff/rules"

const business = { name: "Glow Studio", avatarUrl: null }
const token = "Hq71z9xBGdzyJXsxmNkRlWBo9ZyF8OPwAbCdEfGhIjK"
const preview = { storeAddress: "storelib.com/glowstudio", onePageAddress: "storelib.me/glowstudio", products: 12, websites: 1, domains: ["glowstudio.co", "shop.glowstudio.co"], sender: "Lia Pop" }
const STATES: Record<string, ClaimState> = {
  ready: { kind: "ready", business, email: "tom@example.com", keepFounder: true },
  signed_out: { kind: "signed_out", business, email: "tom@example.com" },
  wrong_email: { kind: "wrong_email", business, email: "tom@example.com", signedInAs: "a.very.long.address.for.testing@company-example.com" },
  verify_email: { kind: "verify_email", business, signedInAs: "tom@example.com", userId: "u" },
  limit: { kind: "limit", business },
  not_ready: { kind: "not_ready", business, blockers: ["paid_plan", "payout_balance"] },
  own: { kind: "own", business },
  accepted: { kind: "accepted", business, mine: true, businessUserId: "u" },
  expired: { kind: "expired", business },
  gone: { kind: "gone" },
}
const view = new URLSearchParams(location.search).get("view") ?? "claim-ready"
const root = createRoot(document.getElementById("app")!)
if (view.startsWith("claim-")) {
  const state = STATES[view.slice(6)] ?? STATES.ready
  root.render(<Frame><ClaimCard state={state} token={token} note={view === "claim-ready" ? "" : ""} signedIn preview={preview} /></Frame>)
} else {
  root.render(
    <main className="min-h-svh bg-[#f8f9fa] px-4 py-6">
      <div className="mx-auto w-full max-w-[720px]">
        <HandoffPanel />
      </div>
    </main>,
  )
}
