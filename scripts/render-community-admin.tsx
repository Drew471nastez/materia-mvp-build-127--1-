/**
 * /admin/communities with fixture data, for scripts/check-community-admin.mjs:
 * the real page component fed payloads shaped like /api/admin/communities and
 * /api/admin/flags answer, with long names, big numbers and a figure that
 * could not be read. `?on=1` or `?on=0` sets the switch, `&view=reports`
 * opens the escalated reports, `&open=1` opens the first community.
 * `fetch` is answered here, so pressing the switch and the actions work.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { CommunitiesAdmin, type AdminCommunity, type AdminReport, type OverviewAnswer } from "@/app/(storelib)/admin/communities/communities-admin"

const NOW = Date.now()
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString()
const params = new URLSearchParams(location.search)
const on = params.get("on") !== "0"

const NAMES = [
  ["Morning Runners", "morning-runners", "Ana Lopez"],
  ["The Lightroom Presets Collective for Wedding and Portrait Photographers", "lightroom-presets-collective", "Mihai Ionescu Photography"],
  ["Indie Makers", "indie-makers", "Jordan Blake"],
  ["Sourdough Club", "sourdough", "Elena Radu"],
  ["Founders Circle", "founders-circle", "Sam Rivera"],
  ["Watercolour Daily", "watercolour-daily", "Ioana Stan"],
]
const rows: AdminCommunity[] = NAMES.map(([name, slug, creator], i) => ({
  id: `c000000${i}-0000-4000-8000-000000000000`,
  slug,
  name,
  status: i === 3 ? "draft" : i === 4 ? "suspended" : "published",
  visibility: i === 5 ? "private" : "public",
  access: i % 2 ? "paid" : "free",
  memberCount: [12840, 2311, 940, 12, 4501, 77][i],
  postCount: [8411, 902, 120, 0, 3302, 18][i],
  platformHidden: i === 2,
  suspendedAt: i === 4 ? iso(30) : null,
  suspendedReason: i === 4 ? "Selling a course that copies another creator's work" : null,
  createdAt: iso(24 * (i * 9 + 3)),
  creator: { id: `cr${i}`, name: creator, username: slug },
}))

const reports: AdminReport[] = [
  { id: "r1", community: { id: rows[0].id, name: rows[0].name, slug: rows[0].slug }, targetType: "post", reason: "harassment", status: "open", createdAt: iso(2), resolvedAt: null },
  { id: "r2", community: { id: rows[1].id, name: rows[1].name, slug: rows[1].slug }, targetType: "message", reason: "illegal", status: "reviewing", createdAt: iso(20), resolvedAt: null },
  { id: "r3", community: null, targetType: "member", reason: "spam", status: "open", createdAt: iso(70), resolvedAt: null },
]

const initial: OverviewAnswer = {
  enabled: on,
  totals: {
    communities: { value: 1284 },
    published: { value: 1102 },
    paid: { value: 377 },
    free: { value: 865 },
    activeMembers30d: { value: 48211 },
    revenue30dCents: { value: 18_442_190 },
    revenueCurrency: "usd",
    openReports: { value: 23 },
    escalatedReports: { value: 3 },
    failedJobs: { value: null, unreadable: "The database said: canceling statement due to statement timeout" },
  },
  list: { rows, total: 1284, page: 1, pages: 52 },
}

let flag = on
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  await new Promise((r) => setTimeout(r, 60))
  if (url.startsWith("/api/admin/flags")) {
    const body = JSON.parse(String(init?.body ?? "{}"))
    flag = body.enabled === true
    return json({ key: "communities", enabled: flag, recorded: true })
  }
  if (url.includes("view=reports")) return json({ reports: { rows: reports, total: 3, page: 1, pages: 1 } })
  if (url.startsWith("/api/admin/communities") && init?.method === "POST") {
    const body = JSON.parse(String(init.body))
    const c = rows.find((r) => r.id === body.communityId) ?? rows[0]
    return json({ community: { id: c.id, slug: c.slug, name: c.name, status: body.action === "suspend" ? "suspended" : "published", platformHidden: body.action === "hide", suspendedAt: body.action === "suspend" ? new Date().toISOString() : null }, changed: true, recorded: true })
  }
  return json({ ...initial, enabled: flag })
}) as typeof fetch

function Probe() {
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      if (params.get("view") === "reports") (document.querySelectorAll('[role="tab"]')[1] as HTMLElement | undefined)?.click()
      if (params.get("open") === "1") (document.querySelector("[data-row]") as HTMLElement | null)?.click()
      if (params.get("confirm") === "1") (document.querySelector("[data-switch]") as HTMLElement | null)?.click()
    }, 50)
    return () => window.clearTimeout(t)
  }, [])
  return <CommunitiesAdmin initial={initial} />
}

createRoot(document.getElementById("root")!).render(<Probe />)
