/**
 * The membership screens for scripts/check-memberships.mjs: the real
 * components with fixtures, chosen by ?screen=, inside the frame each is
 * drawn in on the site (the library's column on #fafafa, the /app pane on
 * #f8f9fa, the checkout on its own). The routes the pages call are answered
 * by the probe.
 *
 *   list          /library/memberships with three running and one ended
 *   list-empty    /library/memberships with none
 *   member        /library/memberships/<id>, active, two new posts
 *   past-due      the same, a failed payment in its grace
 *   ended         the same, ended: titles only, Join again
 *   creator       /app/memberships/<id>, Updates
 *   members       the same, Members
 *   settings      the same, Settings
 *   checkout      /checkout for a membership with monthly, yearly and a trial
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { MembershipsList } from "@/components/memberships/library-list"
import { MemberPage } from "@/components/memberships/member-page"
import { CreatorMembershipScreenView } from "@/components/memberships/creator-screen"
import MembershipCheckout from "@/app/checkout/membership-checkout"
import { describeStatus } from "@/lib/memberships/state"
import type { CreatorMembershipScreen, MembershipCard, MembershipPage } from "@/lib/memberships/view-types"

const NOW = Date.parse("2026-09-28T12:00:00Z")
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

/* Pictures drawn here, so the probe needs no network for them. */
const picture = (a: string, b: string, label = "") =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="${a}"/><circle cx="560" cy="220" r="170" fill="${b}"/><rect x="80" y="380" width="420" height="120" rx="18" fill="#ffffff" opacity="0.55"/><text x="100" y="455" font-family="Arial" font-size="44" fill="#1a1a2e">${label}</text></svg>`)}`

const view = (status: string, periodEnd: number, pastDueSince: number | null = null, trialEnd: number | null = null, amount = 900, interval = "month") =>
  describeStatus({ status, current_period_end: iso(periodEnd), past_due_since: pastDueSince ? iso(pastDueSince) : null, billing_interval: interval, amount_cents: amount, currency: "usd", trial_end: trialEnd ? iso(trialEnd) : null }, NOW)

const card = (over: Partial<MembershipCard> & { id: string }): MembershipCard => ({
  title: "Inner circle",
  cover: null,
  creator: { id: "c1", name: "Ana Lopez", avatarUrl: null, handle: "analopez" },
  status: "active",
  view: view("active", NOW + 20 * DAY),
  access: true,
  unread: 0,
  lastPostAt: iso(NOW - DAY),
  billingInterval: "month",
  amountCents: 900,
  currency: "usd",
  ...over,
})

const LIST: MembershipCard[] = [
  card({ id: "m1", title: "Film photography club", cover: picture("#e9e3d8", "#c9a66b", "Club"), status: "past_due", view: view("past_due", NOW, NOW - 2 * DAY), unread: 1, creator: { id: "c2", name: "Mateo Ruiz", avatarUrl: null, handle: "mateo" } }),
  card({ id: "m2", title: "Inner circle", cover: picture("#ede9fe", "#8b5cf6", "Inner"), unread: 3 }),
  card({ id: "m3", title: "Weekly sketch prompts", status: "trialing", view: view("trialing", NOW + 5 * DAY, null, NOW + 5 * DAY, 500), amountCents: 500, creator: { id: "c3", name: "Priya Nair", avatarUrl: null, handle: "priya" } }),
  card({ id: "m4", title: "Lightroom presets drop", status: "canceled", view: view("canceled", NOW + 12 * DAY, null, null, 9000, "year"), billingInterval: "year", amountCents: 9000, creator: { id: "c4", name: "Jonas Weber", avatarUrl: null, handle: "jonas" } }),
]
const ENDED: MembershipCard[] = [card({ id: "m5", title: "Ceramics studio notes", status: "expired", view: view("expired", NOW - 40 * DAY), access: false, creator: { id: "c5", name: "Lea Martin", avatarUrl: null, handle: "lea" } })]

const POSTS = [
  {
    id: "p1",
    title: "Week 12: the scanning setup, and the files for it",
    body: "Here is the setup I promised last week. The light box, the copy stand and the settings I scan at.\n\nThe profiles are attached. Load them in Lightroom and start from there. Questions go in the monthly call, and the recording will be here on Friday.\n\nMore on grain next week: https://example.com/grain",
    images: [{ url: picture("#dbeafe", "#60a5fa", "Setup") }, { url: picture("#fef3c7", "#f59e0b", "Stand") }, { url: picture("#dcfce7", "#22c55e", "Light") }],
    attachments: [
      { assetId: "a1", name: "Scanning profiles v3.zip", size: 18_400_000 },
      { assetId: "a2", name: "Checklist.pdf", size: 240_000 },
    ],
    links: [{ id: "x1", title: "Darkroom basics course", cover: picture("#fee2e2", "#ef4444"), href: "/account/library/courses/x1" }],
    publishedAt: iso(NOW - 3 * 3600_000),
    unread: true,
  },
  { id: "p2", title: "A quick one: the call moved to Thursday", body: "Same time, one day earlier. The link is the same as always.", images: [], attachments: [], links: [], publishedAt: iso(NOW - 2 * DAY), unread: true },
  { id: "p3", title: "Portra or Ektar for autumn?", body: "I shot both last weekend. Side by side below.", images: [{ url: picture("#fde68a", "#b45309", "Portra") }], attachments: [], links: [], publishedAt: iso(NOW - 9 * DAY), unread: false },
]

const PAGE = (status: string): MembershipPage => {
  const access = status !== "expired"
  const v =
    status === "past_due" ? view("past_due", NOW + 2 * DAY, NOW - 2 * DAY) : status === "expired" ? view("expired", NOW - 40 * DAY) : view("active", NOW + 20 * DAY)
  return {
    membership: {
      id: "m2",
      title: "Film photography club",
      status,
      view: v,
      access,
      graceEndsAt: status === "past_due" ? iso(NOW + 5 * DAY) : null,
      billingInterval: "month",
      amountCents: 900,
      currency: "usd",
      currentPeriodEnd: iso(NOW + 20 * DAY),
      trialEnd: null,
      cardLast4: "4242",
      cardBrand: "visa",
      emailUpdates: true,
      startedAt: iso(NOW - 60 * DAY),
    },
    product: { id: "prod1", slug: "film-club", description: "A small club for people who shoot film. A new lesson every week, the scanning profiles I use, and a monthly call.\n\nCancel any time.", cover: picture("#e9e3d8", "#c9a66b", "Club") },
    benefits: ["A new lesson every week", "My scanning profiles and presets", "A monthly call with members", "The darkroom course, included"],
    included: [
      { id: "x1", title: "Darkroom basics course", type: "course", cover: picture("#fee2e2", "#ef4444"), href: "/account/library/courses/x1" },
      { id: "x2", title: "Film presets pack", type: "digital", cover: null, href: "/account/library/products/x2" },
    ],
    creator: { id: "c2", name: "Mateo Ruiz", avatarUrl: null, handle: "mateo" },
    posts: access ? POSTS : POSTS.map((p) => ({ ...p, body: null, images: [], attachments: [], links: [], unread: false })),
    hasOlder: true,
    invoices: [
      { id: "in_3", amountCents: 900, currency: "usd", status: status === "past_due" ? "failed" : "paid", paidAt: iso(NOW - 10 * DAY), createdAt: iso(NOW - 10 * DAY), url: "https://invoice.stripe.com/i/x" },
      { id: "in_2", amountCents: 900, currency: "usd", status: "paid", paidAt: iso(NOW - 40 * DAY), createdAt: iso(NOW - 40 * DAY), url: "https://invoice.stripe.com/i/y" },
    ],
  }
}

const SCREEN: CreatorMembershipScreen = {
  product: { id: "prod1", title: "Film photography club", slug: "film-club", description: "", status: "published", thumbnail_url: picture("#e9e3d8", "#c9a66b", "Club"), descriptionText: "A small club for people who shoot film." },
  plan: { monthlyPriceCents: 900, yearlyPriceCents: 9000, trialDays: 7, benefits: ["A new lesson every week", "My scanning profiles and presets", "A monthly call with members"], includedProductIds: ["x1"] },
  posts: POSTS.map((p) => ({ id: p.id, title: p.title, body: p.body || "", images: p.images, attachments: p.attachments, linked_product_ids: p.links.map((l) => l.id), published_at: p.publishedAt, email_status: "sent", emailed_count: 128 })),
  members: [
    { id: "a", name: "Sam Rivera", email: "sam@example.com", status: "active", billing_interval: "month", amount_cents: 900, currency: "usd", current_period_end: iso(NOW + 12 * DAY), trial_end: null, past_due_since: null, started_at: iso(NOW - 90 * DAY), created_at: iso(NOW - 90 * DAY) },
    { id: "b", name: "Kiko Tanaka", email: "kiko@example.com", status: "trialing", billing_interval: "year", amount_cents: 9000, currency: "usd", current_period_end: iso(NOW + 4 * DAY), trial_end: iso(NOW + 4 * DAY), past_due_since: null, started_at: iso(NOW - 3 * DAY), created_at: iso(NOW - 3 * DAY) },
    { id: "c", name: null, email: "noname@example.com", status: "past_due", billing_interval: "month", amount_cents: 900, currency: "usd", current_period_end: iso(NOW + 1 * DAY), trial_end: null, past_due_since: iso(NOW - DAY), started_at: iso(NOW - 40 * DAY), created_at: iso(NOW - 40 * DAY) },
    { id: "d", name: "Ola Nordmann", email: "ola@example.com", status: "canceled", billing_interval: "month", amount_cents: 900, currency: "usd", current_period_end: iso(NOW + 6 * DAY), trial_end: null, past_due_since: null, started_at: iso(NOW - 200 * DAY), created_at: iso(NOW - 200 * DAY) },
    { id: "e", name: "Lea Martin", email: "lea@example.com", status: "expired", billing_interval: "month", amount_cents: 900, currency: "usd", current_period_end: iso(NOW - 30 * DAY), trial_end: null, past_due_since: null, started_at: iso(NOW - 300 * DAY), created_at: iso(NOW - 300 * DAY) },
  ],
  stats: { members: 4, trialing: 1, pastDue: 1, cancelling: 1, monthlyCents: 1800 },
  products: [
    { id: "x1", title: "Darkroom basics course", type: "course", status: "published", cover: picture("#fee2e2", "#ef4444") },
    { id: "x2", title: "Film presets pack", type: "digital", status: "published", cover: null },
    { id: "x3", title: "Scanning guide", type: "digital", status: "draft", cover: null },
  ],
  handle: "mateo",
  paymentsReady: true,
}

/* A membership as the New product question makes it (lib/memberships/creator createMembershipProduct): a draft named Membership, no price, nothing posted, nobody in it. */
const NEW_SCREEN: CreatorMembershipScreen = {
  product: { id: "new1", title: "Membership", slug: "membership", description: "", status: "draft", thumbnail_url: null, descriptionText: "" },
  plan: { monthlyPriceCents: null, yearlyPriceCents: null, trialDays: 0, benefits: [], includedProductIds: [] },
  posts: [],
  members: [],
  stats: { members: 0, trialing: 0, pastDue: 0, cancelling: 0, monthlyCents: 0 },
  products: SCREEN.products,
  handle: "mateo",
  paymentsReady: true,
}

const screen = new URLSearchParams(location.search).get("screen") || "list"

function LibraryFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="library">
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  )
}

function AppFrame({ children }: { children: React.ReactNode }) {
  return <div className="h-svh bg-[#f8f9fa]">{children}</div>
}

let tree: React.ReactNode
if (screen === "list" || screen === "list-empty") {
  tree = (
    <LibraryFrame>
      <div data-page-memberships="" className="mx-auto max-w-3xl px-0.5 pb-10 sm:px-0">
        <header className="mb-5">
          <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Memberships</h1>
          <p className="mt-0.5 text-[14px] text-[#6b7280]">{screen === "list" ? "4 memberships running" : "Creators you support, and what they post for members"}</p>
        </header>
        <MembershipsList current={screen === "list" ? LIST : []} ended={screen === "list" ? ENDED : []} />
      </div>
    </LibraryFrame>
  )
} else if (screen === "member" || screen === "past-due" || screen === "ended") {
  tree = (
    <LibraryFrame>
      <MemberPage page={PAGE(screen === "member" ? "active" : screen === "past-due" ? "past_due" : "expired")} now={NOW} />
    </LibraryFrame>
  )
} else if (screen === "new") {
  tree = (
    <AppFrame>
      <CreatorMembershipScreenView screen={NEW_SCREEN} initialTab={null} isNew />
    </AppFrame>
  )
} else if (screen === "creator" || screen === "members" || screen === "settings") {
  tree = (
    <AppFrame>
      <CreatorMembershipScreenView screen={SCREEN} initialTab={screen === "creator" ? "updates" : screen} />
    </AppFrame>
  )
} else {
  tree = (
    <MembershipCheckout
      product={{ id: "prod1", title: "Film photography club", slug: "film-club", thumbnail_url: picture("#e9e3d8", "#c9a66b", "Club") }}
      creator={{ id: "c2", name: "Mateo Ruiz", avatar_url: null, username: "mateo" }}
      plan={{ monthlyPriceCents: 900, yearlyPriceCents: 9000, trialDays: 7, benefits: SCREEN.plan.benefits }}
      userEmail={null}
      isLoggedIn={false}
    />
  )
}

createRoot(document.getElementById("app")!).render(tree)
