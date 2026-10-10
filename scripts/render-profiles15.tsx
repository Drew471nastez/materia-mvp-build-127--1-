/**
 * Round 15 (R), for scripts/check-profiles15.mjs. The real components, with
 * the router and the network stubbed by the probe:
 *
 *   ?case=journey&who=sam|me   a community screen (a stand in for the shell's
 *                    frame: its own header, a feed of cards, kept mounted
 *                    while another place is up, as <Activity> keeps it) where
 *                    a name opens the REAL profile place
 *                    (components/community/member/member-profile.tsx) by
 *                    pushState, and Back returns to the feed where it was
 *   ?case=place&who=sam|me     the profile place alone, as the shell draws it
 *   ?case=full&cold=0|1        a person's full page (MemberProfilePage, the
 *                    route's composition) arriving from a community, with
 *                    ProfileArrival and the sticky top bar; cold=1 is opened
 *                    with nothing of ours behind
 */
import React, { useEffect, useLayoutEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { MemberProfilePlace } from "@/components/community/member/member-profile"
import { MemberProfilePage } from "@/components/profile/member-profile-page"
import { noteClientNavigation } from "@/lib/navigation/in-app-history"
import type { MemberProfileData, ProfilePostView } from "@/lib/communities/member-profile-view"
import type { MemberProfileData as FullProfileData } from "@/lib/profile/member-profile-data"

const q = new URLSearchParams(location.search)
const kase = q.get("case") || "journey"
const who = q.get("who") || "sam"
const COVER = "https://storelib.com/__cover/cover.png"
const FACE = "https://storelib.com/__cover/face.png"

const C1 = { id: "c1c1c1c1-0000-4000-8000-000000000001", slug: "clay", name: "Clay Club", logoUrl: null }
const C2 = { id: "c2c2c2c2-0000-4000-8000-000000000002", slug: "glaze-lab", name: "Glaze Lab", logoUrl: null }
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function posts(mine: boolean, n: number, from = 0): ProfilePostView[] {
  return Array.from({ length: n }, (_, i) => {
    const k = from + i
    const community = mine && k % 2 ? C2 : C1
    return {
      id: `d0000000-0000-4000-8000-${String(k + 1).padStart(12, "0")}`,
      title: ["First firing of the new stoneware", "Which glaze for a matte black?", "Studio hours this week", "Trimming feet without chatter", "Shared kiln schedule", "A crackle that held", "Wedging tables, any advice?", "Show and tell: mugs"][k % 8],
      excerpt: k % 3 ? "Cone 6 oxidation, slow cool. The rim broke at the handle join, so next round I will compress it more." : null,
      space: k % 2 ? "Glazes" : "General",
      at: ago(30 + k * 190),
      reactions: (k * 7) % 13,
      comments: (k * 3) % 5,
      href: `/community/${community.slug}/post/x${k}`,
      imageUrl: k % 4 === 1 ? FACE : null,
      community,
      canEdit: mine && k !== 3,
      canDelete: mine,
    }
  })
}

function data(self: boolean): MemberProfileData {
  return {
    self,
    person: {
      userId: self ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222",
      username: self ? "mia" : "sam.kerr",
      name: self ? "Mia Lopez" : "Sam Kerr",
      avatarUrl: FACE,
      coverUrl: COVER,
      coverCrop: { x: 50, y: 50, zoom: 1 },
      bio: self ? null : "Potter in Lisbon. Wood fired stoneware, slow glazes, and a kiln named Dora.",
      location: self ? null : "Lisbon, Portugal",
      role: self ? null : "admin",
      level: self ? 2 : 5,
      joinedAt: "2026-03-04T10:00:00.000Z",
      followers: self ? 31 : 1284,
      following: self ? 12 : 210,
      pageHref: self ? "/@mia" : "/@sam.kerr",
      hasStorefront: false,
    },
    viewerFollowing: !self,
    scope: self ? "all" : "community",
    posts: { posts: posts(self, 8), next: self ? "cursor-2" : null },
    activity: self
      ? [
          { id: "1", kind: "comment", at: ago(12), community: C1, title: "Which glaze for a matte black?", href: "/community/clay/post/x1", level: null },
          { id: "2", kind: "rsvp", at: ago(240), community: C2, title: "Kiln night", href: "/community/glaze-lab/events/e1", level: null },
          { id: "3", kind: "level_up", at: ago(1600), community: C1, title: null, href: "/community/clay", level: 2 },
          { id: "4", kind: "joined", at: ago(9000), community: C2, title: null, href: "/community/glaze-lab", level: null },
        ]
      : null,
    now: Date.now(),
  }
}

/* ── A stand in for the community's frame: its header and a feed, kept mounted under another place. ── */

function CommunityHeader() {
  return (
    <div className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white" data-probe-community-header="">
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

function Feed({ onPerson }: { onPerson: () => void }) {
  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-3 py-3" data-probe-feed="">
      {Array.from({ length: 14 }, (_, i) => (
        <article key={i} className="rounded-2xl border border-[#e5e7eb]/70 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] text-[#6b7280]">
            <a
              href={who === "me" ? "/community/clay?profile=me" : "/community/clay?profile=sam.kerr"}
              data-probe-person={i}
              className="inline-flex min-h-10 items-center font-semibold text-[#1a1a2e]"
              onClick={(e) => {
                e.preventDefault()
                onPerson()
              }}
            >
              {who === "me" ? "Mia Lopez" : "Sam Kerr"}
            </a>{" "}
            · General · {i + 1}h
          </p>
          <p className="mt-1 text-[15px] font-semibold text-[#1a1a2e]">Post number {i + 1} in the feed</p>
          <div className="mt-3 h-40 rounded-xl bg-[#eef0f3]" />
        </article>
      ))}
    </div>
  )
}

function Journey() {
  const [place, setPlace] = useState<"feed" | "profile">(() => (new URLSearchParams(location.search).get("profile") ? "profile" : "feed"))
  const [feedY, setFeedY] = useState(0)
  useEffect(() => {
    const onPop = () => setPlace(new URLSearchParams(location.search).get("profile") ? "profile" : "feed")
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  /* The feed is put back where it was before it is painted, as the shell's kept place is. */
  useLayoutEffect(() => {
    if (place === "feed") window.scrollTo(0, feedY)
    else window.scrollTo(0, 0)
  }, [place]) // eslint-disable-line react-hooks/exhaustive-deps
  const ref = who === "me" ? "me" : "sam.kerr"
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <CommunityHeader />
      <div className="px-4" hidden={place !== "feed"}>
        <Feed
          onPerson={() => {
            setFeedY(window.scrollY)
            history.pushState({ probe: 1 }, "", `/community/clay?profile=${ref}&case=journey&who=${who}`)
            ;(window as unknown as { __openedAt: number }).__openedAt = performance.now()
            setPlace("profile")
          }}
        />
      </div>
      {place === "profile" ? (
        <div className="px-4">
          <MemberProfilePlace community={C1} viewer={{ userId: "11111111-1111-4111-8111-111111111111", signedIn: true }} profileRef={ref} data={data(who === "me")} />
        </div>
      ) : null}
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

function Full() {
  const cold = q.get("cold") === "1"
  if (!cold) noteClientNavigation("/community/clay")
  return (
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
if (kase === "full") root.render(<Full />)
else if (kase === "place")
  root.render(
    <div className="min-h-screen bg-[#f8f9fa] px-4">
      <MemberProfilePlace community={C1} viewer={{ userId: "11111111-1111-4111-8111-111111111111", signedIn: true }} profileRef={who === "me" ? "me" : "sam.kerr"} data={data(who === "me")} />
    </div>,
  )
else root.render(<Journey />)
