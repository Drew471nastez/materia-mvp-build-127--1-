/* The claim page's cards and Settings › Team's Transfer ownership, drawn for scripts/check-business-handoff.mjs (?view=claim-<state>, join-ready|join-signed_out, or panel-new|panel-open). */
import React from "react"
import { createRoot } from "react-dom/client"
import { Frame, StateCard } from "@/components/team/join-card"
import { ClaimCard } from "@/components/handoff/claim-card"
import { HandoffPanel } from "@/components/app/settings/handoff-panel"
import type { ClaimState } from "@/lib/handoff/rules"

const business = { name: "Glow Studio", avatarUrl: null }
const token = "k7m2-x9qp-4hfd-w3nc"
const preview = { storeAddress: "storelib.com/glowstudio", onePageAddress: "storelib.me/glowstudio", products: 12, websites: 1, domains: ["glowstudio.co", "shop.glowstudio.co"] }
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
if (view.startsWith("join-")) {
  /* The team invite, in the same layout (components/auth/auth-split). */
  const store = { id: "s", name: "Glow Studio", avatarUrl: null }
  const base = { store, role: "manager" as const, permissions: ["products", "orders", "customers"] as never, email: "tom@example.com" }
  const state = view === "join-signed_out" ? { kind: "signed_out" as const, ...base, hasAccount: false } : { kind: "ready" as const, ...base, inviteId: "i" }
  root.render(<Frame><div data-claim-state={state.kind}><StateCard state={state} token="t" note="" signedIn={view !== "join-signed_out"} /></div></Frame>)
} else if (view.startsWith("claim-")) {
  const state = STATES[view.slice(6)] ?? STATES.ready
  root.render(<Frame><ClaimCard state={state} token={token} note="" signedIn={view !== "claim-signed_out"} preview={preview} expiresAt="2026-11-14T12:00:00Z" founderAccess="content" /></Frame>)
} else {
  root.render(
    <main className="min-h-svh bg-[#f8f9fa] px-4 py-6">
      <div className="mx-auto w-full max-w-[720px]">
        <HandoffPanel />
      </div>
    </main>,
  )
}
