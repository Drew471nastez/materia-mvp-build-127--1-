/**
 * Round 33's Learn, for scripts/check-learn-round33.mjs: the real program
 * editor (through the real builder) and the member's locked pages, with
 * fixture props, inside a stand in for the community editor's section or the
 * member shell's main column. The API is the probe's. The case is the query
 * string:
 *
 *   ?editor        a program made here, open in the editor (Buy now, a rich description)
 *   ?level ?time ?paid   a locked program as a member sees it
 *   ?description   an open program's page with a rich description to draw
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LockedProgram, EmptyProgram } from "@/components/community/learn/program-page"
import { LearnBuilder } from "@/components/community/learn/learn-builder"
import type { LearnBuilderData, ProgramCard } from "@/components/community/learn/model"

const COMMUNITY = "8d0f3c52-5b8a-4a0e-9a57-3f0c6d1e2a11"
const DAY = 86_400_000

function cover(title: string, bg: string, fg = "#ffffff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="${bg}"/><text x="40" y="290" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="700" fill="${fg}">${title}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const RICH = '<h2>Six weeks at the wheel</h2><p>One form at a time, <strong>slowly</strong> 🙂</p><ul><li>Wedging</li><li>Centering</li></ul><p><img src="https://storelib.com/media/product-images/cups.svg" alt="Four cups"></p>'

const builder: LearnBuilderData = {
  communityId: COMMUNITY,
  slug: "makers",
  ready: true,
  accessReady: true,
  enabled: true,
  currency: "usd",
  canSell: true,
  levels: [
    { level: 2, name: "Regular" },
    { level: 3, name: "Maker" },
  ],
  courses: [],
  programs: [
    { id: "p2", kind: "program", productId: null, title: "Wheel throwing, from clay to cup", summary: RICH, coverUrl: cover("Wheel throwing", "#e8e3d9", "#1a1a2e"), status: "draft", mode: "paid", level: 2, priceCents: 4900, currency: "usd", dripDays: null, members: [], lessons: 3, buyers: 0, editHref: null },
  ],
}

const card = (over: Partial<ProgramCard>): ProgramCard => ({
  id: "p9",
  kind: "program",
  title: "Glaze chemistry for the curious",
  summary: "Why a glaze runs, crawls or pinholes, and what to change.",
  descriptionHtml: null,
  coverUrl: cover("Glaze chemistry", "#2f3e46"),
  lessons: 9,
  completedLessons: 0,
  percent: 0,
  status: "not_started",
  totalSeconds: 4 * 3600,
  draft: false,
  mode: "free",
  priceLabel: null,
  owned: false,
  locked: null,
  href: "/community/makers/learn/glaze",
  ...over,
})

const outline = {
  modules: [
    { id: "m1", title: "What a glaze is", coverUrl: cover("1", "#5c4b51"), lessons: ["Silica, flux, alumina", "Reading a recipe"] },
    { id: "m2", title: "Fixing faults", coverUrl: null, lessons: ["Crawling", "Pinholes", "Running"] },
  ],
}

const which = location.search.slice(1) || "editor"
const back = { learnHref: "/community/makers/learn", aboutHref: "/community/makers/about", communityId: COMMUNITY, communityName: "Makers", timeZone: "UTC" }
let body: React.ReactNode = null
let wide = false
switch (which) {
  case "editor":
    wide = true
    body = <LearnBuilder communityId={COMMUNITY} initial={builder} initialOpenId="p2" />
    break
  case "level":
    body = <LockedProgram {...back} program={card({ mode: "level", locked: { reason: "level", label: "Level 3", opensAt: null, priceCents: null, currency: null, viewerLevel: 1 } })} outline={outline} levelsHref="/community/makers/leaderboard" />
    break
  case "time":
    body = <LockedProgram {...back} program={card({ mode: "time", title: "The weekly studio review", locked: { reason: "drip", label: "Opens on", opensAt: new Date(Date.now() + 4 * DAY).toISOString(), priceCents: null, currency: null } })} outline={outline} />
    break
  case "paid":
    body = <LockedProgram {...back} program={card({ mode: "paid", title: "Wheel throwing, from clay to cup", priceLabel: "$49", descriptionHtml: RICH, locked: { reason: "paid", label: "$49", opensAt: null, priceCents: 4900, currency: "usd" } })} outline={outline} />
    break
  case "description":
    body = <EmptyProgram program={card({ descriptionHtml: `${RICH}<p><img src="x" onerror="window.__xss=1"><a href="javascript:alert(1)">bad link</a></p><script>window.__xss=2</script>` })} learnHref="/community/makers/learn" manageHref={null} />
    break
}

createRoot(document.getElementById("app")!).render(
  <div className="min-h-screen bg-[#f8f9fa]" data-probe-case={which}>
    <main className={wide ? "mx-auto w-full max-w-[1200px] px-4 pt-6 sm:px-6 lg:px-8" : "mx-auto w-full max-w-[1040px] px-4 py-5 sm:px-6 lg:py-8"}>{body}</main>
  </div>,
)
