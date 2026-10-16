/**
 * Round 32's new community pieces for scripts/check-community-features-round32.mjs, each drawn alone on the /app page
 * ground (#f8f9fa, the page container) the way a section draws it: ?panel= join-questions | requests | onboarding |
 * scheduled | bulk, or the member side's join-form (the sales page's pricing card and its join form) and get-started (a
 * new member's first steps above a stand-in feed). The probe answers every /api/ request itself.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import type { CommunityHead } from "@/components/community/creator/view-types"
import { ToastHost } from "@/components/community/creator/parts"
import { JoinQuestionsPanel } from "@/components/community/creator/join-questions-panel"
import { JoinRequestsPanel } from "@/components/community/creator/join-requests-panel"
import { OnboardingPanel } from "@/components/community/creator/onboarding-panel"
import { ScheduledPostsPanel } from "@/components/community/creator/scheduled-posts-panel"
import { BulkInviteButton } from "@/components/community/creator/bulk-invite-panel"
import { JoinProvider, PricingCard } from "@/components/community/public/join-controls"
import { GetStarted } from "@/components/community/member/get-started"
import type { JoinStateView, PublicCommunityView } from "@/components/community/public/types"
import type { ViewerView } from "@/lib/communities/types"

const params = new URLSearchParams(location.search)
const panel = params.get("panel") || "join-questions"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"

const head: CommunityHead = {
  id: ID,
  slug: "salajanywood",
  name: "SalajanyWood Woodworking Club",
  tagline: null,
  logoUrl: null,
  coverUrl: null,
  status: "published",
  access: "free",
  visibility: "public",
  memberCount: 1284,
  postCount: 3412,
  archived: false,
  suspended: false,
  gamificationEnabled: true,
  classroomEnabled: true,
  eventsEnabled: true,
  role: "owner",
  can: allowedActions("owner"),
  openReports: 0,
}

const community = {
  id: ID,
  slug: "salajanywood",
  name: "SalajanyWood Woodworking Club",
  tagline: "Make one thing a week, together.",
  logoUrl: null,
  coverUrl: null,
  category: null,
  visibility: "public",
  access: "free",
  status: "published",
  approvalRequired: params.get("kind") === "request",
  memberCount: 1284,
  descriptionHtml: null,
  descriptionText: "We make things.",
  benefits: [],
  rules: [],
  faq: [],
  creator: null,
  options: [],
  accessProducts: [],
  reviews: null,
  url: "/community/salajanywood",
  address: "storelib.com/community/salajanywood",
  gallery: [],
  stats: { members: 1284, online: null, admins: null },
} as unknown as PublicCommunityView

const kind = (params.get("kind") || "join_free") as JoinStateView["kind"]
const join: JoinStateView = {
  kind,
  signedIn: true,
  label: kind === "request" ? "Request to join" : "Join for free",
  option: { tierId: "t1", name: "Members", description: null, kind: "free", billing: null, priceLine: "Free", benefits: ["Weekly calls", "The plans library"], checkout: null } as unknown as JoinStateView["option"],
  href: null,
  note: null,
  isOwner: false,
  canLeave: false,
  manageHref: null,
  role: null,
  status: null,
}

const viewer: ViewerView = { userId: "u1", signedIn: true, role: "member", status: "active", active: true, tierId: null, level: 1, points: 0, isOwner: false, isCreatorAccount: false, mutedUntil: null, joinedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), can: allowedActions("member") }

function App() {
  if (panel === "join-form")
    return (
      <div className="mx-auto max-w-[720px] px-4 py-6">
        <JoinProvider community={community} join={join}>
          <PricingCard />
        </JoinProvider>
      </div>
    )
  if (panel === "get-started")
    return (
      <div className="mx-auto max-w-[640px] space-y-3 px-4 py-6" data-probe-feed="">
        <GetStarted communityId={ID} viewer={viewer} />
        <div className="h-40 rounded-2xl border border-[#e5e7eb]/80 bg-white" />
      </div>
    )
  return (
    <ToastHost>
      <div className="min-h-screen bg-[#f8f9fa]">
        <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-6 sm:px-6 lg:px-8" data-probe-page="">
          {panel === "join-questions" ? <JoinQuestionsPanel head={head} /> : null}
          {panel === "requests" ? <JoinRequestsPanel head={head} /> : null}
          {panel === "onboarding" ? <OnboardingPanel head={head} /> : null}
          {panel === "scheduled" ? <ScheduledPostsPanel head={head} /> : null}
          {panel === "bulk" ? <BulkInviteButton head={head} /> : null}
        </div>
      </div>
    </ToastHost>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
