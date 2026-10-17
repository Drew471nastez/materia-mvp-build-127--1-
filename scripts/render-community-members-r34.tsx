/**
 * The Members screen of round 34 for scripts/check-community-members-r34.mjs:
 * the real MembersSection and the real member sheet with fixture props,
 * inside a stand-in for the /app frame. Picked by the address:
 *
 *   ?case=list       the creator's Members: everyone, two of them featured
 *   ?case=member     the same; the checker then presses a row, so the sheet
 *                    opens the way it opens for the owner
 *   ?case=directory  the member side's own directory rows, where the mark is
 *                    drawn for members rather than for the creator. This is
 *                    the half that has a dark look: /app is never served
 *                    dark (scripts/gen-theme-dark.mjs skips it).
 *   the dark look    set on <html> by the page the checker serves
 *
 * The detail the sheet asks for once it is open is answered here by a
 * stand-in fetch, so the screen is the real one and nothing goes out.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import { MembersSection } from "@/components/community/creator/members-section"
import { MemberRow } from "@/components/community/member/members"
import type { CommunityHead, MemberRowView } from "@/components/community/creator/view-types"
import type { Role } from "@/lib/communities/types"
import type { MemberDetail } from "@/lib/communities/member-detail"
import { ViewportVars } from "@/components/viewport-vars"

const params = new URLSearchParams(location.search)
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const ME = "00000000-0000-4000-8000-000000000001"
const NOW = Date.now()
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const ahead = (d: number) => new Date(NOW + d * 86_400_000).toISOString()
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const head: CommunityHead = {
  id: ID,
  slug: "morning-writers",
  name: "The Morning Writers",
  tagline: "Write 500 words before breakfast, together.",
  logoUrl: null,
  coverUrl: null,
  status: "published",
  access: "paid",
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
  openReports: 5,
  me: { userId: ME, name: "Ana Popescu", avatarUrl: null },
}

const tiers = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Members", kind: "paid" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Lifetime", kind: "paid" },
]

const NAMES = ["Marcus Lee", "Priya Raman", "Sofia Rossi", "Jonas Becker", "Amelie Laurent", "Kwame Mensah", "Hana Sato", "Diego Alvarez", "Olivia Brown", "Mateusz Nowak", "Lucia Fernandez", "Tom Fischer"]
const ROLES: Role[] = ["admin", "moderator", "member", "member", "member", "member", "member", "member", "member", "member", "member", "member"]
const member = (i: number, over: Partial<MemberRowView> = {}): MemberRowView => ({
  userId: uid(100 + i),
  name: NAMES[i % NAMES.length],
  username: NAMES[i % NAMES.length].toLowerCase().replace(/[^a-z]+/g, ""),
  avatarUrl: null,
  email: `${NAMES[i % NAMES.length].toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
  role: ROLES[i % ROLES.length],
  status: "active",
  source: i % 5 === 0 ? "manual" : "subscription",
  tierId: tiers[i % 2].id,
  tierName: tiers[i % 2].name,
  level: 1 + (i % 6),
  points: 40 + i * 37,
  joinedAt: ago(3 + i * 9),
  requestedAt: null,
  requestNote: null,
  lastActiveAt: i % 4 === 3 ? null : ago(i * 0.7),
  mutedUntil: i === 4 ? ahead(1) : null,
  approved: false,
  featured: i === 1 || i === 6,
  acted: i === 4 ? { kind: "muted", byUserId: ME, byName: "Ana Popescu", byRole: "owner", at: ago(0.2), reason: "Spam links", until: ahead(1) } : null,
})
const members = NAMES.map((_, i) => member(i))

/* What the sheet asks for, answered here so nothing leaves the page. */
const detail: MemberDetail = {
  userId: uid(102),
  engagement: { posts: 34, comments: 128, likes: 302, lastPostAt: ago(1.2) },
  access: { source: "subscription", tierName: "Lifetime", joinedAt: ago(21), expiresAt: ahead(11), complimentary: false, invitedBy: "Ana Popescu", approvedBy: null },
  learning: [
    { title: "The 30 day writing habit", how: "bought" },
    { title: "Editing your first draft", how: "given" },
  ],
}
const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" || input instanceof URL ? input : input.url)
  if (/\/members\/[0-9a-f-]+$/.test(url)) {
    const userId = url.split("/").pop() as string
    await new Promise((r) => setTimeout(r, Number(params.get("delay") ?? 0)))
    return new Response(JSON.stringify({ detail: { ...detail, userId } }), { status: 200, headers: { "Content-Type": "application/json" } })
  }
  return realFetch(input as RequestInfo, init)
}) as typeof window.fetch

function Frame({ children }: { children: React.ReactNode }) {
  ;(window as unknown as { __path: string }).__path = `/app/community/${ID}/members`
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-30 h-[68px] bg-[#131316] md:h-[58px]" />
      <aside className="fixed bottom-0 left-0 top-[58px] hidden w-[240px] bg-[#131316] md:block" />
      <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[68px] md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">{children}</div>
      </main>
    </div>
  )
}

/** The member side's directory rows: the same component the community's Members place draws. */
function Directory() {
  const people = members.map((m) => ({
    userId: m.userId,
    name: m.name,
    username: m.username,
    avatarUrl: m.avatarUrl,
    role: m.role,
    level: m.level,
    levelName: m.level > 3 ? "Regular" : "Newcomer",
    bio: m.userId.endsWith("02") ? "Writes before breakfast, mostly about Lisbon." : null,
    hasStorefront: false,
    location: m.level % 2 === 0 ? "Lisbon, Portugal" : null,
    featured: m.featured,
  }))
  return (
    <div className="min-h-svh bg-[#f8f9fa] px-4 py-6 sm:px-6" data-community-place="members">
      <div className="mx-auto w-full max-w-[720px]">
        <ul className="divide-y divide-[#f0f1f3] overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]" data-member-list="">
          {people.map((m) => (
            <li key={m.userId}>
              <MemberRow m={m} slug="morning-writers" canMessage />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function App() {
  if (new URLSearchParams(location.search).get("case") === "directory") return <Directory />
  return (
    <Frame>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <MembersSection
          head={head}
          meId={ME}
          initial={{ rows: members, next: "next1", capped: false }}
          counts={{ active: 1284, pending: 3, restricted: 4, muted: 1, paused: 1, banned: 1, removed: 1, expired: 12, cancelled: 30 }}
          status="active"
          tiers={tiers}
          canEmail
          invites={{ rows: [], next: null }}
          openInvite={false}
          badges={[{ id: "b1", name: "Early bird", description: null, icon: "x", awarded: 4 }]}
        />
      </div>
    </Frame>
  )
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <>
    <ViewportVars />
    <App />
  </>,
)
