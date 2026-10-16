/**
 * The community Analytics section (components/community/creator/
 * analytics-section.tsx) on its own page, for scripts/check-community-
 * analytics-round31.mjs. The section asks /api/app/community/<id>/analytics
 * for the period in the address; fetch is answered here with a report of
 * the right number of buckets for that period, so switching the period
 * redraws real charts. ?case= picks the answer:
 *
 *   full     everything counted (SQL part 184), a paid community, events,
 *            programs, Google Analytics connected
 *   nopart   before part 184: no visits, sources, engagement or lists that
 *            need it, nothing sold, Google Analytics not connected
 *   quiet    everything counted and nothing happened
 *   fail     the answer never comes back right
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { AnalyticsSection } from "@/components/community/creator/analytics-section"
import { bucketsOf, type CommunityReport, type Line } from "@/lib/communities/analytics-report"
import type { CommunityHead } from "@/components/community/creator/view-types"

const which = new URLSearchParams(location.search).get("case") || "full"
const w = window as unknown as { __asks: string[]; __fetches: { at: number; url: string; aborted?: boolean }[]; __delay: number; __tick?: () => void; __remount: () => void }
w.__asks = []
/* Round 32: every request with when it was made, how long an answer takes (?delay=, or the probe sets it), and the minute's refresh handed to the probe. */
w.__fetches = []
w.__delay = Number(new URLSearchParams(location.search).get("delay") || 120)
const realSetInterval = window.setInterval.bind(window)
window.setInterval = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
  if (ms === 60_000) {
    w.__tick = fn
    return 0
  }
  return realSetInterval(fn, ms, ...(rest as []))
}) as typeof window.setInterval

const head = {
  id: "c0000000-0000-4000-8000-000000000001",
  slug: "clay-studio",
  name: "Clay Studio",
  tagline: null,
  logoUrl: null,
  coverUrl: null,
  status: "published",
  access: "free",
  visibility: "public",
  memberCount: 412,
  postCount: 230,
  archived: false,
  suspended: false,
  gamificationEnabled: true,
  classroomEnabled: true,
  eventsEnabled: true,
  role: "owner",
  can: { view_analytics: true },
  openReports: 0,
} as unknown as CommunityHead

/** A steady wave, so every chart has a shape and the period before differs from this one. */
const wave = (i: number, base: number, amp: number, seed: number) => Math.max(0, Math.round(base + amp * Math.sin((i + seed) / 2.3) + ((i * 7 + seed) % 5)))

function report(q: URLSearchParams): CommunityReport {
  const span = { start: Date.parse(q.get("start")!), end: Date.parse(q.get("end")!) }
  const tz = q.get("tz") || "UTC"
  const { grain, keys } = bucketsOf(span, tz)
  const n = keys.length
  const quiet = which === "quiet"
  const counted = which !== "nopart"
  const compared = q.has("cstart")
  const make = (base: number, amp: number, seed: number): Line => ({
    current: keys.map((_, i) => (quiet ? 0 : wave(i, base, amp, seed))),
    previous: compared ? keys.map((_, i) => (quiet ? 0 : wave(i, base * 0.8, amp, seed + 3))) : null,
  })
  const joined = make(4, 3, 1)
  const left = make(1, 1, 2)
  let level = 380
  const members: Line = { current: joined.current.map((j, i) => (level += (j ?? 0) - (left.current[i] ?? 0))), previous: compared ? joined.current.map((_, i) => 340 + i) : null }
  const visits = make(60, 25, 4)
  const prospects = make(40, 18, 4)
  const rsvps = make(3, 2, 10)
  const lessons = make(5, 3, 11)
  const active = make(70, 20, 5)
  const posts = make(6, 4, 6)
  const comments = make(18, 9, 7)
  const reactions = make(40, 18, 8)
  const pctLine = (a: Line, b: Line): Line => ({ current: a.current.map((x, i) => (b.current[i] ? Math.round(((x ?? 0) / (b.current[i] as number)) * 1000) / 10 : null)), previous: null })
  const sum = (l: Line) => l.current.reduce<number>((s, x) => s + (x ?? 0), 0)
  const prevSum = (l: Line) => (l.previous ? l.previous.reduce<number>((s, x) => s + (x ?? 0), 0) : null)
  const fig = (l: Line) => ({ value: sum(l), previous: prevSum(l) })
  const nul: Line = { current: new Array(n).fill(null), previous: null }
  const money = counted
    ? {
        currency: "usd",
        figures: {
          revenue: { value: quiet ? 0 : 412000, previous: compared ? 351000 : null },
          mrr: { value: quiet ? 0 : 268000, previous: compared ? 241000 : null },
          subscribers: { value: quiet ? 0 : 134, previous: compared ? 121 : null },
          newPaid: { value: quiet ? 0 : 19, previous: compared ? 15 : null },
          cancellations: { value: quiet ? 0 : 6, previous: compared ? 7 : null },
        },
        lines: { revenue: make(13000, 6000, 9), mrr: { current: keys.map((_, i) => 241000 + i * 900), previous: null }, subscribers: { current: keys.map((_, i) => 121 + Math.floor(i / 3)), previous: null }, newPaid: make(1, 1, 3), cancellations: make(0, 1, 4) },
        upgrades: quiet ? 0 : 7,
        churnRate: quiet ? null : 4.8,
        refunds: { count: quiet ? 0 : 2, totalCents: quiet ? 0 : 4000 },
        bySource: quiet ? [] : [{ key: "memberships" as const, cents: 371000 }, { key: "tickets" as const, cents: 27000 }, { key: "programs" as const, cents: 14000 }],
        reasons: quiet ? [] : [{ reason: "too_busy", count: 3 }, { reason: "too_expensive", count: 2 }, { reason: "none", count: 1 }],
      }
    : null
  const rows = (xs: [string, number][]) => (quiet ? [] : xs.map(([key, value]) => ({ key, label: key, value, previous: compared ? Math.round(value * 0.8) : undefined })))
  return {
    version: 2,
    grain,
    buckets: n,
    firstDay: "2025-03-02",
    figures: {
      members: { value: members.current[n - 1], previous: compared ? 360 : null },
      joined: fig(joined),
      left: fig(left),
      churn: { value: quiet ? 0 : 3.1, previous: compared ? 3.6 : null },
      visits: counted ? fig(visits) : { value: null, previous: null },
      prospects: counted ? fig(prospects) : { value: null, previous: null },
      rsvps: counted ? fig(rsvps) : { value: null, previous: null },
      lessons: counted ? fig(lessons) : { value: null, previous: null },
      joinRate: counted ? { value: quiet ? null : 6.4, previous: compared ? 5.1 : null } : { value: null, previous: null },
      active: { value: quiet ? 0 : 214, previous: compared ? 190 : null },
      posts: fig(posts),
      comments: fig(comments),
      reactions: fig(reactions),
      engagement: counted ? { value: quiet ? 0 : 31.2, previous: compared ? 28.4 : null } : { value: null, previous: null },
    },
    lines: { members, joined, left, churn: pctLine(left, members), visits: counted ? visits : nul, prospects: counted ? prospects : nul, joinRate: counted ? pctLine(joined, prospects) : nul, active, posts, comments, reactions, engagement: counted ? pctLine(posts, active) : nul, rsvps: counted ? rsvps : nul, lessons: counted ? lessons : nul },
    counted: { visits: counted, visitsByHour: true, active: true, engagement: counted, detail: counted },
    countedSince: { visits: counted && !quiet ? "2026-10-01" : null, active: null },
    live: { members: 412, active1: quiet ? 0 : 48, active7: quiet ? 0 : 120, active30: quiet ? 0 : 214, stickiness: quiet ? null : 22.4 },
    activeSplit: counted ? { new: quiet ? 0 : 38, returning: quiet ? 0 : 176 } : null,
    leaveReasons: counted ? (quiet ? [] : [{ reason: "too_busy", count: 4 }, { reason: "not_for_me", count: 2 }, { reason: "none", count: 3 }]) : null,
    people: { posters: quiet ? 0 : 41, commenters: quiet ? 0 : 88, reactors: quiet ? 0 : 160 },
    money,
    traffic: counted
      ? {
          source: rows([["direct", 410], ["social_instagram", 260], ["explore", 190], ["organic_search", 120], ["storelib", 80], ["email", 40], ["referral", 22]]),
          referrer: rows([["l.instagram.com", 240], ["google.com", 118], ["potterymag.example.com", 22]]),
          device: rows([["mobile", 820], ["desktop", 270], ["tablet", 32]]),
          country: rows([["RO", 420], ["US", 300], ["DE", 140], ["GB", 90], ["FR", 60], ["IT", 41]]),
        }
      : null,
    joins: { bySource: quiet ? [] : [{ key: "free", label: "free", value: 61 }, { key: "subscription", label: "subscription", value: 19 }, { key: "invite", label: "invite", value: 8 }], invites: quiet ? [] : [{ key: "i1", label: "Link made Sep 20", value: 6, note: null }, { key: "i2", label: "Invite to ana@example.com", value: 1, note: "off" }] },
    topPosts: quiet ? [] : [
      { id: "p1", title: "My first celadon glaze came out of the kiln this morning and it is everything I hoped", reactions: 84, comments: 31 },
      { id: "p2", title: "Wheel or hand building for a first class?", reactions: 40, comments: 52 },
      { id: "p3", title: "Studio hours this week", reactions: 22, comments: 4 },
    ],
    topSpaces: counted && !quiet ? [{ id: "s1", name: "General", slug: "general", posts: 120, comments: 410 }, { id: "s2", name: "Kiln results", slug: "kiln", posts: 60, comments: 190 }] : [],
    contributors: counted && !quiet ? [{ userId: "u1", name: "Ana Pop", avatarUrl: null, posts: 14, comments: 61 }, { userId: "u2", name: "Mihai Ionescu", avatarUrl: null, posts: 9, comments: 40 }, { userId: "u3", name: "@lena", avatarUrl: null, posts: 3, comments: 22 }] : [],
    cohorts: counted && !quiet ? [{ month: "2026-10", joined: 31, stayed: 30, active: 28 }, { month: "2026-09", joined: 58, stayed: 51, active: 40 }, { month: "2026-08", joined: 44, stayed: 35, active: 22 }] : [],
    programs: counted && !quiet ? [{ id: "pr1", title: "Glazing from zero", started: 88, completed: 21, percent: 46, lessons: 140 }] : [],
    events: quiet ? [] : [{ id: "e1", title: "Glaze night", startsAt: "2026-10-05T18:00:00Z", going: 34, checkedIn: null }, { id: "e2", title: "Wheel basics, Saturday class", startsAt: "2026-10-12T17:00:00Z", going: 18, checkedIn: 14 }],
    eventMoney: counted && !quiet ? { sold: 18, invited: 2, grossCents: 27000, refundedCents: 1500, netCents: 25500, refunds: 1, events: 1, currency: "usd" } : null,
    ga: counted ? { id: "G-7XK2Q9PL0D", seenAt: "2026-10-15T09:40:00Z" } : { id: null, seenAt: null },
    at: Date.now(),
  }
}

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.includes("/api/app/community/")) return realFetch(input, init)
  const q = new URL(url, "http://x").searchParams
  w.__asks.push(q.toString())
  const entry: { at: number; url: string; aborted?: boolean } = { at: performance.now(), url: q.toString() }
  w.__fetches.push(entry)
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, w.__delay)
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(t)
      entry.aborted = true
      reject(new DOMException("aborted", "AbortError"))
    })
  })
  if (which === "fail") return new Response(JSON.stringify({ error: "x" }), { status: 500 })
  return new Response(JSON.stringify(report(q)), { status: 200, headers: { "Content-Type": "application/json" } })
}

/* The shell's frame (components/community/creator/community-shell): its background, its width and its gutter. */
function Page() {
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto app-gutter max-w-[1080px] pb-12 pt-4 lg:pt-5">
        <h1 className="mb-4 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Analytics</h1>
        <AnalyticsSection head={head} />
      </div>
    </div>
  )
}

let root = createRoot(document.getElementById("app")!)
root.render(<Page />)
/* Leaving the section and coming back mounts it again. */
w.__remount = () => {
  root.unmount()
  root = createRoot(document.getElementById("app")!)
  root.render(<Page />)
}
