/**
 * ROUND 13, WORKER M: THE MEMBERSHIP LIFECYCLE, with fixtures, for
 * scripts/check-community-membership.mjs. The real client components:
 *
 *   ?case=member     the Membership page's parts as F2 mounts them
 *                    (MembershipSection: the plan with Cancel or Resume, the
 *                    refund policy, the form to the owner) in a 680px column
 *                    on #f8f9fa. ?state=active|canceled|trialing|purchase,
 *                    ?public=1 shows the owner's chosen address.
 *   ?case=refund     the owner's Payments on /app's Members (PaymentsSection
 *                    and its RefundDialog) in the /app container.
 *   ?case=checkout   a community's membership checkout
 *                    (app/checkout/membership-checkout.tsx) with the refund
 *                    policy and the EU waiver; ?locale=de-DE&currency=eur
 *                    writes the price the buyer's way.
 *
 * The routes are answered by the probe (request interception); what was
 * posted is kept on window.__posts.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { MembershipSection } from "@/components/community/membership"
import { PaymentsSection } from "@/components/community/membership/refund-dialog"
import MembershipCheckout from "@/app/checkout/membership-checkout"
import type { CommunityMembershipView } from "@/lib/communities/membership-policy"

const params = new URLSearchParams(location.search)
const which = params.get("case") || "member"
const state = params.get("state") || "active"
const CID = "c0000000-0000-4000-8000-000000000001"
const DAY = 86_400_000
const ends = new Date(Date.UTC(2026, 9, 31, 12)).toISOString()

const POLICY = "Full refund within 7 days of your first payment, no questions asked.\n\nAfter that, write to me from the Membership page and I will look at every case. Renewals are not refunded once a month has started."

function view(): CommunityMembershipView {
  const base: CommunityMembershipView = {
    communityId: CID,
    communityName: "Clay Studio",
    kind: "subscription",
    membershipId: "m1",
    status: "active",
    access: true,
    amountCents: 1900,
    currency: "usd",
    interval: "month",
    periodEnd: ends,
    cancelAtPeriodEnd: false,
    canCancel: true,
    canResume: false,
    cardLast4: "4242",
    manageUrl: "/account/library/memberships/m1",
    refundPolicy: POLICY,
    contact: { form: true, publicEmail: params.get("public") === "1" ? "studio@claystudio.co" : null, ownerName: "Mara Lindqvist" },
  }
  if (state === "canceled") return { ...base, status: "canceled", cancelAtPeriodEnd: true, canCancel: false, canResume: true }
  if (state === "trialing") return { ...base, status: "trialing" }
  if (state === "purchase") return { ...base, kind: "purchase", membershipId: null, status: null, canCancel: false, manageUrl: null, interval: null, amountCents: 0 }
  return base
}

function Screen() {
  if (which === "refund") {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8" data-probe-frame="">
          <h1 className="mb-5 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Members</h1>
          <PaymentsSection communityId={CID} />
        </div>
      </div>
    )
  }
  if (which === "checkout") {
    const locale = params.get("locale") || "en-US"
    const currency = params.get("currency") || "usd"
    return (
      <MembershipCheckout
        product={{ id: "p1", title: "Clay Studio", slug: "clay-studio", thumbnail_url: null }}
        creator={{ id: "cr1", name: "Mara Lindqvist", avatar_url: null, username: "mara" }}
        plan={{ monthlyPriceCents: 1950, yearlyPriceCents: 19000, trialDays: 0, benefits: ["Weekly live throwing sessions", "Glaze recipes and firing logs"], currency }}
        userEmail="sam@example.com"
        isLoggedIn
        returnTo="/community/clay-studio?welcome=1"
        communityTerms={{ communityName: "Clay Studio", refundPolicy: POLICY, waiver: params.get("waiver") !== "0", locale }}
      />
    )
  }
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <main className="mx-auto w-full max-w-[680px] px-4 py-6 sm:py-10" data-probe-frame="">
        <h1 className="mb-4 text-[22px] font-semibold text-[#1a1a2e]">Membership</h1>
        <MembershipSection communityId={CID} initial={view()} />
      </main>
    </div>
  )
}

void DAY
createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Screen />
  </LocaleProvider>,
)
