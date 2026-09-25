/**
 * The real notifications panel (components/app/notifications-modal.tsx) with
 * a mix of what the rules engine writes (lib/notifications): two critical
 * rows, a problem, a milestone, a digest of three opportunities, a launch
 * and an older review, answered by a stand-in `fetch` the way
 * app/api/notifications answers once its SQL has run. For
 * scripts/check-notification-kinds.mjs.
 *
 * ?legacy answers as the route does before that SQL: the same rows with no
 * category, no area and nothing covered.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "@/lib/i18n"
import { NotificationsModal, LiveNotificationBadge } from "@/components/app/notifications-modal"

declare global {
  interface Window {
    __patches: Array<{ ids?: string[]; action: string }>
    __openPanel: () => void
    __closePanel: () => void
    __gets: number
  }
}
window.__patches = []
window.__gets = 0
const legacy = location.search.includes("legacy")
const now = Date.now()
const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

type Row = Record<string, unknown> & { id: string; read_at: string | null; dismissed_at?: string | null }
const engine: Row[] = [
  {
    id: "k1", type: "critical", kind: "stripe_restricted", category: "critical", priority: 100,
    title: "Stripe paused your payouts", message: "Sales still come in, but nothing reaches your bank until Stripe has what it needs.",
    action_url: "/app/settings/payments", metadata: { area: "Payouts" }, read_at: null, created_at: at(60 * 26),
  },
  {
    id: "k2", type: "critical", kind: "payout_failed", category: "critical", priority: 95,
    title: "A payout of $184.20 failed", message: "The account number is not right. Update your bank details, then cash out again.",
    action_url: "/app/payouts", metadata: { area: "Payouts" }, read_at: at(30), created_at: at(70),
  },
  {
    id: "k3", type: "problem", kind: "product_missing_file", category: "problem", priority: 75,
    title: "Lightroom presets has no file to deliver", message: "Buyers can pay and get nothing to download. Add the file or unpublish it.",
    action_url: "/app/products/p1", metadata: { area: "Products" }, read_at: null, created_at: at(300),
  },
  {
    id: "k4", type: "milestone", kind: "sales_milestone", category: "milestone", priority: 65,
    title: "Your 10th sale", message: "That is 10 sales since your first on Aug 2.",
    action_url: "/app/orders", metadata: { area: "Milestone", sales: 10 }, read_at: null, created_at: at(20),
  },
  {
    id: "k5", type: "opportunity", kind: "opportunity_digest", category: "opportunity", priority: 55,
    title: "3 opportunities this week", message: "4 buyers left checkout; the reminder is off; Portrait retouching course: 212 views, no sales; 240 subscribers, no email in 45 days",
    action_url: "/app/emails/flow/new",
    metadata: {
      area: "Opportunities",
      items: [
        { title: "4 buyers left checkout; the reminder is off", href: "/app/emails/flow/new" },
        { title: "Portrait retouching course: 212 views, no sales", href: "/app/products/p2" },
        { title: "240 subscribers, no email in 45 days", href: "/app/emails/new" },
      ],
    },
    read_at: null, created_at: at(120),
  },
  {
    id: "k6", type: "update", kind: "feature_launch", category: "update", priority: 20,
    title: "Sell products together as a bundle", message: "Pick two or more products, set one price, and buyers get every file.",
    action_url: "/app/products/new", metadata: { area: "New in Storelib" }, read_at: at(600), created_at: at(60 * 20),
  },
  {
    id: "k7", type: "new_review", kind: null, category: null, priority: null,
    title: "New 5 star review on Portrait retouching course", message: "Maria: “Clear and worth every cent.”",
    action_url: "/p/portrait-retouching#testimonials", metadata: {}, read_at: at(60 * 30), created_at: at(60 * 49),
  },
]
const rows: Row[] = legacy ? engine.map(({ kind: _k, category: _c, priority: _p, ...r }) => ({ ...r, type: r.type === "new_review" ? "new_review" : "update", metadata: {} })) : engine

/* The route's order: open critical, problem and next step rows first by priority, then the rest newest first. */
function answer() {
  const open = rows.filter((r) => !r.dismissed_at)
  const pinned = legacy ? [] : open.filter((r) => ["critical", "problem", "next_step"].includes(String(r.category))).sort((a, b) => Number(b.priority) - Number(a.priority))
  const rest = open.filter((r) => !pinned.includes(r)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const unread = open.filter((r) => !r.read_at).length
  return { notifications: [...pinned, ...rest], unreadCount: unread, totalCount: open.length, ...(legacy ? {} : { covered: ["payment-setup"] }) }
}

window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url)
  if (init?.method === "PATCH") {
    const body = JSON.parse(String(init.body)) as { ids?: string[]; action: string }
    window.__patches.push(body)
    const stamp = new Date().toISOString()
    for (const r of rows) {
      if (body.action === "read_all" && !r.read_at) r.read_at = stamp
      if (body.ids?.includes(r.id)) {
        if (body.action === "read") r.read_at = stamp
        if (body.action === "dismiss") r.dismissed_at = stamp
      }
    }
    await new Promise((r) => setTimeout(r, 120))
    return new Response(JSON.stringify({ success: true }), { status: 200 })
  }
  window.__gets++
  const a = answer()
  if (u.includes("summary=1")) return new Response(JSON.stringify(legacy ? { unreadCount: a.unreadCount } : { unreadCount: a.unreadCount, covered: a.covered }), { status: 200 })
  return new Response(JSON.stringify(a), { status: 200 })
}) as typeof fetch

function Shell() {
  const [open, setOpen] = React.useState(false)
  window.__openPanel = () => setOpen(true)
  window.__closePanel = () => setOpen(false)
  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-40 flex h-[58px] items-center justify-end bg-[#131316] px-5">
        <button type="button" data-bell="" onClick={() => setOpen(true)} className="relative flex h-[34px] w-[34px] items-center justify-center text-white" aria-label="Notifications">
          B
          <LiveNotificationBadge stripeConnected stripeStatus="pending" onePagePublished={false} />
        </button>
      </header>
      <div className="fixed inset-x-0 bottom-0 top-[58px] overflow-y-auto bg-[#f8f9fa]" />
      <NotificationsModal open={open} onOpenChange={setOpen} stripeConnected stripeStatus="pending" onePagePublished={false} />
    </>
  )
}

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <Shell />
  </LanguageProvider>,
)
