/**
 * Learn, a program, its checkout sheet and the builder, for
 * scripts/check-community-learn.mjs: the real components with fixture
 * props, inside a stand in for the member shell's main column (the shell is
 * the member layout's) or the community editor's section. Stripe's Embedded
 * Checkout is a stub (the probe's esbuild aliases @stripe/react-stripe-js
 * and @stripe/stripe-js/pure), and the API is the probe's. The case is the
 * query string:
 *
 *   ?learn  ?empty  ?locked  ?level  ?checkout  ?program  ?builder  ?editor
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LearnLibrary } from "@/components/community/learn/learn-library"
import { LockedProgram, ProgramPlayer } from "@/components/community/learn/program-page"
import { BuyProgram } from "@/components/community/learn/program-checkout"
import { LearnBuilder } from "@/components/community/learn/learn-builder"
import type { LearnBuilderData, ProgramCard } from "@/components/community/learn/model"
import type { PlayerData } from "@/lib/courses/types"

const COMMUNITY = "8d0f3c52-5b8a-4a0e-9a57-3f0c6d1e2a11"
const DAY = 86_400_000
const at = (ms: number) => new Date(Math.round((Date.now() + ms) / (15 * 60_000)) * 15 * 60_000).toISOString()

function cover(title: string, bg: string, fg = "#ffffff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="${bg}"/><circle cx="560" cy="70" r="140" fill="${fg}" opacity="0.07"/><text x="40" y="290" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="700" fill="${fg}">${title}</text><text x="40" y="232" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600" fill="${fg}" opacity="0.7">MAKERS</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const base = (id: string, over: Partial<ProgramCard>): ProgramCard => ({
  id,
  kind: "program",
  title: "Program",
  summary: null,
  coverUrl: null,
  lessons: 6,
  completedLessons: 0,
  percent: 0,
  status: "not_started",
  totalSeconds: 3600,
  draft: false,
  mode: "free",
  priceLabel: null,
  owned: false,
  locked: null,
  href: `/community/makers/learn/${id}`,
  ...over,
})

const programs: ProgramCard[] = [
  base("p1", { title: "Start here: your first 30 days", coverUrl: cover("First 30 days", "#1f2a37"), lessons: 12, completedLessons: 7, percent: 58, status: "in_progress", totalSeconds: 2 * 3600 + 640 }),
  base("p2", { title: "Wheel throwing, from clay to cup", coverUrl: cover("Wheel throwing", "#e8e3d9", "#1a1a2e"), lessons: 18, mode: "paid", priceLabel: "$49", totalSeconds: 5 * 3600, locked: { reason: "paid", label: "$49", opensAt: null, priceCents: 4900, currency: "usd" } }),
  base("p3", { title: "Glaze chemistry for the curious", coverUrl: cover("Glaze chemistry", "#2f3e46"), lessons: 9, mode: "level", totalSeconds: 4 * 3600, locked: { reason: "level", label: "Level 3", opensAt: null, priceCents: null, currency: null } }),
  base("p4", { title: "Pricing your work without guessing", coverUrl: cover("Pricing", "#d8e2dc", "#1a1a2e"), lessons: 8, completedLessons: 8, percent: 100, status: "completed", totalSeconds: 5400 }),
  base("p5", { title: "The weekly studio review", coverUrl: null, lessons: 5, totalSeconds: 1500, locked: { reason: "drip", label: "Opens on Oct 14", opensAt: at(9 * DAY), priceCents: null, currency: null } }),
  base("p6", { title: "Kiln loading, the careful way", coverUrl: cover("Kiln loading", "#5c4b51"), lessons: 4, totalSeconds: 1260, draft: true }),
]

const outline = {
  modules: [
    { id: "m1", title: "Clay and the wheel", lessons: ["Wedging without wrist pain", "Centering, slowly", "Opening the form", "Pulling walls", "Fixing a wobble", "Cutting it off clean"] },
    { id: "m2", title: "Trimming", lessons: ["Leather hard, explained", "Feet that look right", "Trimming tools"] },
    { id: "m3", title: "Your first set of four cups", lessons: ["Matching sizes", "Handles"] },
  ],
}

const player: PlayerData = {
  productId: "p1",
  courseId: "k1",
  title: "Start here: your first 30 days",
  thumbnailUrl: programs[0].coverUrl,
  productHref: null,
  creator: { name: "Makers", avatarUrl: null, storeHref: null },
  modules: [
    {
      id: "m1",
      title: "Week one",
      lessons: [
        { id: "l1", moduleId: "m1", title: "Welcome and how this works", durationSeconds: 240, isPreview: false, kind: "text", notes: "Read this first. It takes four minutes.", attachments: [], hasCaptions: false, locked: false },
        { id: "l2", moduleId: "m1", title: "Set up your bench", durationSeconds: 610, isPreview: false, kind: "text", notes: null, attachments: [], hasCaptions: false, locked: false },
      ],
    },
  ],
  progress: [],
  initialLessonId: "l1",
  access: "owner",
  emailsOff: false,
  contact: false,
}

const builder: LearnBuilderData = {
  communityId: COMMUNITY,
  slug: "makers",
  ready: true,
  enabled: true,
  currency: "usd",
  canSell: true,
  levels: [
    { level: 2, name: "Regular" },
    { level: 3, name: "Maker" },
  ],
  courses: [{ id: "c9", title: "Studio photography", coverUrl: cover("Photography", "#1f2a37"), status: "published" }],
  programs: [
    { id: "p1", kind: "program", productId: null, title: "Start here: your first 30 days", summary: "Everything a new member needs in the first month.", coverUrl: programs[0].coverUrl, status: "published", mode: "free", level: 2, priceCents: null, currency: "usd", dripDays: null, lessons: 12, buyers: 0, editHref: null },
    { id: "p2", kind: "program", productId: null, title: "Wheel throwing, from clay to cup", summary: "Six weeks at the wheel, one form at a time.", coverUrl: programs[1].coverUrl, status: "published", mode: "paid", level: 2, priceCents: 4900, currency: "usd", dripDays: null, lessons: 18, buyers: 23, editHref: null },
    { id: "p3", kind: "program", productId: null, title: "Glaze chemistry for the curious", summary: "", coverUrl: programs[2].coverUrl, status: "published", mode: "level", level: 3, priceCents: null, currency: "usd", dripDays: null, lessons: 9, buyers: 0, editHref: null },
    { id: "p7", kind: "course", productId: "c7", title: "Selling at markets", summary: "", coverUrl: cover("Markets", "#d8e2dc", "#1a1a2e"), status: "published", mode: "free", level: 2, priceCents: null, currency: "usd", dripDays: 7, lessons: 7, buyers: 0, editHref: "/app/products/c7/edit" },
    { id: "p6", kind: "program", productId: null, title: "Kiln loading, the careful way", summary: "", coverUrl: null, status: "draft", mode: "free", level: 2, priceCents: null, currency: "usd", dripDays: null, lessons: 0, buyers: 0, editHref: null },
  ],
}

const which = location.search.slice(1) || "learn"
let body: React.ReactNode = null
let wide = false
switch (which) {
  case "learn":
    body = <LearnLibrary programs={programs} timeZone="UTC" />
    break
  case "empty":
    body = <LearnLibrary programs={[]} manageHref="/app/community/x/learn" />
    break
  case "locked":
  case "checkout":
    body = (
      <>
        <LockedProgram program={{ ...programs[1], summary: "Six weeks at the wheel, one form at a time. Ends with a set of four matching cups you would be happy to give away." }} outline={outline} learnHref="/community/makers/learn" aboutHref="/community/makers/about" communityId={COMMUNITY} communityName="Makers" timeZone="UTC" />
        {which === "checkout" ? (
          <div hidden>
            <BuyProgram communityId={COMMUNITY} communityName="Makers" programId="p2" title={programs[1].title} priceLabel="$49" coverUrl={programs[1].coverUrl} initiallyOpen />
          </div>
        ) : null}
      </>
    )
    break
  case "level":
    body = <LockedProgram program={programs[2]} outline={null} learnHref="/community/makers/learn" aboutHref="/community/makers/about" communityId={COMMUNITY} communityName="Makers" />
    break
  case "program":
    body = <ProgramPlayer data={player} learnHref="/community/makers/learn" />
    break
  case "builder":
    wide = true
    body = <LearnBuilder communityId={COMMUNITY} initial={builder} />
    break
  case "editor":
    wide = true
    body = <LearnBuilder communityId={COMMUNITY} initial={builder} initialOpenId="p2" />
    break
}

createRoot(document.getElementById("app")!).render(
  <div className="min-h-screen bg-[#f8f9fa]" data-probe-case={which}>
    <main className={wide ? "mx-auto w-full max-w-[1200px] px-4 pt-6 sm:px-6 lg:px-8" : "mx-auto w-full max-w-[1040px] px-4 py-5 sm:px-6 lg:py-8"}>{body}</main>
  </div>,
)
