/**
 * Round 18 (C18), for scripts/check-member18.mjs. The real components, with
 * the router and the network stubbed by the probe:
 *
 *   ?case=place&board=full|empty|nogrid|none&cover=1|0&dark=0|1
 *        the REAL profile place (components/community/member/member-profile.tsx)
 *        with its activity board, as the shell draws it: a year of activity,
 *        a new member's empty year, the board before SQL part 125 (no grid),
 *        or no board at all (an answer from before round 18)
 *   ?case=journey
 *        a stand in for the community's frame (data-community-shell, its
 *        header, and the real place inside it) that the probe swaps for a
 *        person's REAL full page (MemberProfilePage, with ProfileArrival) in
 *        one commit, as the router does after Visit page, and back again
 *        after the full page's back arrow. The stand in's arrival calls
 *        arriveWithPageMotion exactly as shell-frame.tsx does.
 */
import React, { useLayoutEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { MemberProfilePlace } from "@/components/community/member/member-profile"
import { MemberProfilePage } from "@/components/profile/member-profile-page"
import { noteClientNavigation } from "@/lib/navigation/in-app-history"
import { arriveWithPageMotion } from "@/lib/navigation/page-push"
import { addDays, boardFrom, type BoardDay, type MemberBoard } from "@/lib/communities/member-activity"
import type { MemberProfileData, ProfilePostView } from "@/lib/communities/member-profile-view"
import type { MemberProfileData as FullProfileData } from "@/lib/profile/member-profile-data"

const q = new URLSearchParams(location.search)
const kase = q.get("case") || "place"
const boardKind = q.get("board") || "full"
const withCover = q.get("cover") !== "0"
const dark = q.get("dark") === "1"
const COVER = "https://storelib.com/__cover/cover.png"
const FACE = "https://storelib.com/__cover/face.png"
const TODAY = "2026-10-10"

const C1 = { id: "c1c1c1c1-0000-4000-8000-000000000001", slug: "clay", name: "Clay Club", logoUrl: null }
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function posts(n: number): ProfilePostView[] {
  return Array.from({ length: n }, (_, k) => ({
    id: `d0000000-0000-4000-8000-${String(k + 1).padStart(12, "0")}`,
    title: ["First firing of the new stoneware", "Which glaze for a matte black?", "Studio hours this week", "Trimming feet without chatter"][k % 4],
    excerpt: k % 2 ? "Cone 6 oxidation, slow cool. The rim broke at the handle join, so next round I will compress it more." : null,
    space: k % 2 ? "Glazes" : "General",
    at: ago(30 + k * 190),
    reactions: (k * 7) % 13,
    comments: (k * 3) % 5,
    href: `/community/clay/post/x${k}`,
    imageUrl: k % 3 === 1 ? FACE : null,
    community: C1,
    canEdit: false,
    canDelete: false,
  }))
}

/* A year that looks like a person: quiet months, busy weeks, more lately. Deterministic, so every run draws the same squares. */
function year(): BoardDay[] {
  const out: BoardDay[] = []
  const from = boardFrom(TODAY)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let d = from, i = 0; d <= TODAY; d = addDays(d, 1), i++) {
    const lately = i / 364
    const busy = rnd() < 0.12 + lately * 0.45
    if (!busy) continue
    const p = rnd() < 0.3 ? 1 + Math.floor(rnd() * 2) : 0
    const c = Math.floor(rnd() * (2 + lately * 5))
    const l = Math.floor(rnd() * (3 + lately * 6))
    if (p + c + l) out.push([d, p, c, l])
  }
  return out
}

function board(): MemberBoard | null {
  const from = boardFrom(TODAY)
  const standing = { level: 3, name: "Contributor", points: 104, floor: 60, next: { level: 4, name: "Insider", minPoints: 150 } }
  if (boardKind === "none") return null
  if (boardKind === "empty") return { grid: { tz: "Europe/Lisbon", from, today: TODAY, days: [] }, standing: { level: 1, name: "Newcomer", points: 0, floor: 0, next: { level: 2, name: "Regular", minPoints: 20 } }, joinedAt: "2026-10-09T10:00:00.000Z", posts: 0, comments: 0 }
  if (boardKind === "nogrid") return { grid: null, standing, joinedAt: "2026-03-04T10:00:00.000Z", posts: 38, comments: null }
  return { grid: { tz: "Europe/Lisbon", from, today: TODAY, days: year() }, standing, joinedAt: "2026-03-04T10:00:00.000Z", posts: 38, comments: 214 }
}

function data(): MemberProfileData {
  return {
    self: false,
    person: {
      userId: "22222222-2222-4222-8222-222222222222",
      username: "sam.kerr",
      name: "Sam Kerr",
      avatarUrl: FACE,
      coverUrl: withCover ? COVER : null,
      coverCrop: { x: 50, y: 50, zoom: 1 },
      bio: "Potter in Lisbon. Wood fired stoneware, slow glazes, and a kiln named Dora.",
      location: "Lisbon, Portugal",
      role: null,
      level: 3,
      joinedAt: "2026-03-04T10:00:00.000Z",
      followers: 2,
      following: 1,
      pageHref: "/@sam.kerr",
      hasStorefront: true,
    },
    viewerFollowing: true,
    scope: "community",
    posts: { posts: posts(3), next: null },
    activity: null,
    board: board(),
    now: Date.parse(`${TODAY}T12:00:00Z`),
  }
}

function CommunityHeader() {
  return (
    <div className="sticky top-0 z-30 border-b border-[#e5e7eb] bg-white" data-probe-community-header="">
      <div className="mx-auto flex h-14 max-w-[1080px] items-center gap-3 px-4">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a1a2e] text-[13px] font-bold text-white">C</span>
        <span className="text-[15px] font-semibold text-[#1a1a2e]">Clay Club</span>
      </div>
      <div className="mx-auto flex h-11 max-w-[1080px] items-center gap-5 px-4 text-[14px] text-[#6b7280]">
        <span className="font-semibold text-[#1a1a2e]">Community</span>
        <span>Learn</span>
        <span>Calendar</span>
        <span>Members</span>
      </div>
    </div>
  )
}

/** The community's frame as far as the motion is concerned: its root, and the arrival shell-frame.tsx plays. */
function Shell({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    /* shell-frame.tsx: `const popped = landing && arriveWithPageMotion(el)` (landing: no frame was there before). */
    if (arriveWithPageMotion(root.current)) (window as unknown as { __shellPopped: boolean }).__shellPopped = true
  }, [])
  return (
    <div ref={root} data-community-shell="" data-community-theme={dark ? "dark" : "light"} className="min-h-svh bg-[#f8f9fa] text-[#1a1a2e]">
      <CommunityHeader />
      <div className="px-4">{children}</div>
    </div>
  )
}

function full(): FullProfileData {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    name: "Sam Kerr",
    username: "sam.kerr",
    avatarUrl: FACE,
    coverUrl: COVER,
    bio: "Potter in Lisbon. Wood fired stoneware, slow glazes, and a kiln named Dora.",
    memberSince: "March 2026",
    joinedAt: "2026-03-04T10:00:00.000Z",
    hasStorefront: false,
    storefrontHandle: "sam.kerr",
    creatorId: null,
    followers: 1284,
    following: 210,
    products: [],
    productCount: 0,
    reviews: [],
    privacy: { showActivity: true, showCommunities: true } as never,
    socials: [],
  }
}

function Place() {
  return <MemberProfilePlace community={C1} viewer={{ userId: "11111111-1111-4111-8111-111111111111", signedIn: true }} profileRef="sam.kerr" data={data()} />
}

function Journey() {
  const [where, setWhere] = useState<"community" | "full">("community")
  ;(window as unknown as { __go: (w: "community" | "full") => void }).__go = (w) => {
    noteClientNavigation(w === "full" ? "/community/clay" : "/@sam.kerr")
    setWhere(w)
  }
  return where === "community" ? (
    <Shell>
      <Place />
    </Shell>
  ) : (
    <MemberProfilePage
      profile={full()}
      viewerId="11111111-1111-4111-8111-111111111111"
      viewerFollowing
      extras={{
        activity: { items: [], next: null, hidden: false },
        communities: { enabled: true, owned: [], member: [] },
        shared: [],
        backShown: true,
        backTarget: "/community/clay?profile=sam.kerr",
        now: Date.now(),
        location: "Lisbon, Portugal",
      }}
    />
  )
}

const root = createRoot(document.getElementById("app")!)
if (kase === "journey") root.render(<Journey />)
else
  root.render(
    <Shell>
      <Place />
    </Shell>,
  )
