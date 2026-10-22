/**
 * ===========================================================================
 *  COMMUNITIES ROUND 13: THE FRAME, ABOUT, THE BELL, MEMBERSHIP, PROFILES
 * ===========================================================================
 *   ABOUT       one cover; no "Active this week"; the facts as one quiet list
 *               (side card and sheet); Who runs it on a phone; the swipe
 *   WARM        leaving the community asks for its home again
 *   EMPTY       the bell's empty list is calm and specific, per filter
 *   STACK       every avatar stack: 2px ring of the ground, 8px overlap
 *   SCROLLBAR   slim and light grey on pointer screens, by the two standard
 *               properties only
 *   ACTIVE      the right column's cards have Polaris depth
 *   TAB         "(3) Club" in the title and a red dot on the icon
 *   MEMBERSHIP  the page, its entry in the "..." menu, M's two slots
 *   CONTRIB     a person's contributions per community, their own editable
 *   INVITES     one quiet row a day for whoever shared the link
 *
 *   The frame by frame proof is scripts/check-community-frame13.mjs.
 *
 * Run with:  npm run test:push
 */
import { existsSync } from "node:fs"
import { readCode, readSource } from "./_source"
import { aboutFacts, aboutFigures, factFigure, galleryIsCoverOnly } from "@/components/community/public/about-facts"
import { badgedTitle, DOT_COLOUR } from "@/components/notifications/tab-badge"
import { contributionLine, editHref } from "@/lib/profile/shared-view"
import { inviteJoinsKey, inviteJoinsTitle, noteInviteJoin } from "@/lib/communities/server/invite-joins"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)

/* A database that answers each chain by its table and what was asked, and keeps every write. */
type Op = { table: string; calls: [string, unknown[]][] }
function fakeDb(answer: (op: Op) => { data?: unknown; error?: unknown; count?: number | null }) {
  const ops: Op[] = []
  const db = {
    from(table: string) {
      const op: Op = { table, calls: [] }
      ops.push(op)
      const chain: Record<string, unknown> = {}
      for (const m of ["select", "eq", "neq", "in", "gte", "limit", "order", "is", "upsert", "update", "maybeSingle", "single"]) {
        chain[m] = (...args: unknown[]) => {
          op.calls.push([m, args])
          return chain
        }
      }
      chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        try {
          const a = answer(op)
          resolve({ data: a.data ?? null, error: a.error ?? null, count: a.count ?? null })
        } catch (e) {
          reject(e)
        }
      }
      return chain
    },
    ops,
  }
  return db
}
const called = (op: Op, m: string) => op.calls.find((c) => c[0] === m)?.[1]

async function main() {
  /* ── ABOUT ──────────────────────────────────────────────────────────── */
  console.log("\nABOUT: one cover, a quiet facts list")
  {
    const extras = { activity: { posts30: 186, active7: 402, since: "2024-03-02T00:00:00Z" }, classroom: { total: 9, courses: [] }, creatorBio: null }
    const creator = { name: "Mara Lindqvist", username: "mara", avatarUrl: null, href: "/mara" }
    const facts = aboutFacts({ visibility: "private", creator }, { members: 8012, online: 191, admins: 2 }, extras)
    /* Changed on purpose (round 26, the owner): the admin count moved from the row under the name into this list. */
    check("the facts: members, kind, admins, started, run by", facts.map((f) => `${f.key}=${f.value}`).join() === "members=8,012,visibility=Private,admins=2,since=Mar 2024,creator=Mara Lindqvist", facts)
    check("never active this week, never online now", !facts.some((f) => /active|online/i.test(f.label)))
    const bare = aboutFacts({ visibility: "public", creator: null }, { members: 1, online: null, admins: null }, null)
    check("a community with nothing counted yet: members and its kind alone", bare.map((f) => f.key).join() === "members,visibility", bare)
    check("big counts are compact, small ones exact", factFigure(1284) === "1,284" && factFigure(12_400) === "12k" && factFigure(0) === "0")
    check("no figure row says active this week either", !aboutFigures({ members: 40, online: 0, admins: 1 }, extras).some((c) => c.key === "active"))
    check("the cover alone is a cover only gallery; a chosen one is not", galleryIsCoverOnly([{ type: "image", url: "/c.jpg" }], "/c.jpg") && !galleryIsCoverOnly([{ type: "image", url: "/c.jpg" }, { type: "image", url: "/d.jpg" }], "/c.jpg") && !galleryIsCoverOnly([{ type: "video", videoId: "v", posterUrl: "/c.jpg" }], "/c.jpg") && !galleryIsCoverOnly([], "/c.jpg") && !galleryIsCoverOnly([{ type: "image", url: "/c.jpg" }], null))
    const page = code("components/community/public/sales-page.tsx")
    check("the sheet leaves a cover only gallery out from 1024px, where the left card has it", /coverOnly && "lg:hidden"/.test(page) && /const coverOnly = galleryIsCoverOnly\(c\.gallery, c\.coverUrl\)/.test(page))
    /* Changed on purpose (round 33): the owner asked for the key facts in one row under the name at every width (about-row.tsx); the side card keeps the list of what the row does not say. */
    check("no facts line under the name and no figures panel; the facts row under the name and the list in the side card", !/<FactsLine/.test(page) && !/<Figures /.test(page) && /<AboutRow facts=\{row\} faces=\{extras\?\.faces \?\? \[\]\}/.test(page) && /<JoinCard\s+facts=\{facts\.length \? <FactsList facts=\{facts\} \/> : null\}/.test(page))
    check("no copy says active this week", !/Active this week/.test(page) && !/Active this week/.test(code("components/community/public/about-facts.ts")))
    const controls = code("components/community/public/join-controls.tsx")
    check("the side card draws the facts where the member count line was", /export function JoinCard\(\{ facts = null,/.test(controls) && /data-join-card-facts=""/.test(controls))
    check("Who runs it: View profile ends the row at every width; the line under the whole row on a phone", /grid-cols-\[48px_minmax\(0,1fr\)_auto\]/.test(page) && /col-start-3 row-start-1[^"]*justify-self-end/.test(page) && /col-span-3 col-start-1 row-start-2 mt-3/.test(page))
    const view = code("components/community/public/gallery-view.tsx")
    check("the swipe's index is a transition, so React never stalls the glide", /React\.startTransition\(\(\) => \{\s*setIndex\(i\)/.test(view))
    check("the neighbours are decoded ahead when idle", /for \(const i of \[at \+ 1, at - 1, at \+ 2\]\)/.test(view) && /img\.decode\?\.\(\)/.test(view) && /requestIdleCallback\(run, \{ timeout: 600 \}\)/.test(view))
  }

  /* ── WARM ───────────────────────────────────────────────────────────── */
  console.log("\nWARM: the way back is quick")
  {
    const frame = code("components/community/member/shell-frame.tsx")
    check("when the frame goes, the community's home is asked for again in full", /\(\) => \(\) => \{\s*window\.setTimeout\(\(\) => \{\s*try \{\s*router\.prefetch\(homeHref, \{ kind: FULL \}\)/.test(frame))
  }

  /* ── EMPTY ──────────────────────────────────────────────────────────── */
  console.log("\nEMPTY: the bell's empty list")
  {
    const bell = code("components/notifications/notification-bell.tsx")
    check("never \"Nothing new\"", !/Nothing new/.test(bell))
    check("a title and a line per filter, each saying what lands there", ["all", "communities", "following", "purchases"].every((k) => new RegExp(`${k}: \\{ title: "[^"]+", line: "[^"]+will show up here\\." \\}`).test(bell)))
    check("the bell on a white tile with a hairline and a 1px shadow", /rounded-\[12px\] border border-\[#e6e8eb\] bg-white[^"]*shadow-\[0_1px_2px_rgba\(16,24,40,0\.06\)\]/.test(bell))
  }

  /* ── STACK ──────────────────────────────────────────────────────────── */
  console.log("\nSTACK: even rings")
  {
    const ui = code("components/community/member/ui.ts")
    check("one stack: 8px overlap, a 2px ring of the ground on a box of the face's own size", /export const STACK = "flex items-center \[&>\*\]:relative \[&>\*\]:shrink-0 \[&>\*\+\*\]:-ml-2"/.test(ui) && /export const STACK_FACE = "flex rounded-full shadow-\[0_0_0_2px_#fff\]"/.test(ui))
    const wall = code("components/community/member/wall.tsx")
    check("the community card's faces use it, the link sized to the face", /className=\{STACK\} data-avatar-stack=""/.test(wall) && /className=\{`\$\{STACK_FACE\} h-8 w-8/.test(wall) && !/ring-2 ring-white/.test(wall))
    check("event attendees and a post's commenters use it", /className=\{STACK\} data-avatar-stack=""/.test(code("components/community/events/event-detail.tsx")) && /\$\{STACK\}`\} data-commenters=""/.test(code("components/community/member/post-card.tsx")))
  }

  /* ── SCROLLBAR ──────────────────────────────────────────────────────── */
  console.log("\nSCROLLBAR: slim and light grey")
  {
    const css = code("app/globals.css")
    check("pointer screens: thin, light grey, on the page, the opened post and the bell's list", /@media \(hover: hover\) and \(pointer: fine\) \{\s*html,\s*\[data-post-overlay-scroll\],\s*\[data-bell-list\] \{\s*scrollbar-width: thin;\s*scrollbar-color: rgba\(156, 163, 175, 0\.5\) transparent;/.test(css))
    check("no ::-webkit-scrollbar rule on the page's html for pointers", !/@media \(hover: hover\) and \(pointer: fine\) \{[^}]*html::-webkit-scrollbar/.test(css))
  }

  /* ── ACTIVE ─────────────────────────────────────────────────────────── */
  console.log("\nACTIVE: Polaris depth")
  {
    const ui = code("components/community/member/ui.ts")
    const wall = code("components/community/member/wall.tsx")
    check("a raised card: a hairline, a 1px shadow, a darker foot", /export const CARD_RAISED =\s*"rounded-2xl border border-\[#e3e5e9\] bg-white shadow-\[0_1px_0_rgba\(16,24,40,0\.04\),0_1px_3px_rgba\(16,24,40,0\.06\),inset_0_-1px_0_rgba\(16,24,40,0\.05\)\]"/.test(ui))
    check("Most active and the next event wear it; each rank a white tile", /\$\{CARD_RAISED\} p-4`\} data-wall-contributors/.test(wall) && /\$\{CARD_RAISED\} p-4`\} data-wall-upcoming/.test(wall) && /rounded-\[7px\] border border-\[#e3e5e9\] bg-white/.test(wall))
  }

  /* ── TAB ────────────────────────────────────────────────────────────── */
  console.log("\nTAB: the count and the dot")
  {
    check("(3) in front, 99+ past 99, nothing at 0, never twice", badgedTitle("Clay Studio", 3) === "(3) Clay Studio" && badgedTitle("Clay Studio", 140) === "(99+) Clay Studio" && badgedTitle("(3) Clay Studio", 0) === "Clay Studio" && badgedTitle("(3) Clay Studio", 5) === "(5) Clay Studio")
    check("the dot is the bubble's red", DOT_COLOUR === "#ef4444")
    const badge = code("components/notifications/tab-badge.ts")
    check("the head is watched so a new title or icon from the page keeps the badge", /new MutationObserver\(apply\)/.test(badge) && /attributeFilter: \["href"\]/.test(badge))
    check("the icon's own address is put back exactly", /link\.setAttribute\("href", from\)/.test(badge) && /getAttribute\("href"\)/.test(badge))
    check("the community's bell owns the tab", /<NotificationBell className=\{BELL\} sheetMin="50dvh" tabBadge \/>/.test(code("components/community/member/top-bar.tsx")) && /useTabBadge\(userId \? unread : 0, tabBadge\)/.test(code("components/notifications/notification-bell.tsx")))
  }

  /* ── MEMBERSHIP ─────────────────────────────────────────────────────── */
  console.log("\nMEMBERSHIP: the page and its entry")
  {
    const route = "app/(marketing)/community/[slug]/(member)/membership/page.tsx"
    check("the page and its loading screen are there, under the members' door", existsSync(route) && existsSync("app/(marketing)/community/[slug]/(member)/membership/loading.tsx"))
    const page = code(route)
    /* Round 15: the page seeds the shell (PlacePage checks the member); the facts are the place loader's, from the member's own row. */
    const placesLoader = code("lib/communities/server/places.ts")
    check("members only, from their own row", /<PlacePage slug=\{slug\} place=\{\{ kind: "membership" \}\} \/>/.test(page) && /case "membership": \{\s*if \(!viewer\.userId\) return missing/.test(placesLoader) && /notifyLevel: m\?\.notify_level \?\? "important"/.test(placesLoader))
    const menu = code("components/community/member/account-menu.tsx")
    check("\"Membership\" in the \"...\" menu, after Saved posts", /if \(savedHref\) out\.push[^\n]+\n\s*if \(membershipHref\) out\.push\(\{ item: "membership", label: "Membership"/.test(menu))
    check("the frame hands the bar its address", /membershipHref: `\/community\/\$\{community\.slug\}\/membership`/.test(code("components/community/member/shell-frame.tsx")))
    check("membership is read ahead with the other places", /\/community\/\$\{community\.slug\}\/membership`/.test(code("components/community/member/shell-frame.tsx")) && /out\.push\(\{ kind: "membership" \}\)/.test(code("components/community/member/place-host.tsx")))
    /* Changed on purpose (round 39): with the community and the viewer the request already read (known), so neither is read twice. */
    check("the membership page pulls to refresh and loads without reviews or gallery", /RouterPullToRefresh scope=\{COMMUNITY_MEMBERSHIP_REFRESH_SCOPE\}/.test(code("components/community/member/membership.tsx")) && /loadSalesPage\(community\.slug, viewer\.userId, db, \{ light: true, known: \{ community, viewer \} \}\)/.test(code("lib/communities/server/places.ts")))
    const m = code("components/community/member/membership.tsx")
    check("the four levels, saved on the press through PATCH /me", /role="radiogroup"/.test(m) && /api\(`\$\{apiBase\(communityId\)\}\/me`, \{ method: "PATCH", body: \{ notifyLevel: next \} \}\)/.test(m) && (m.match(/\{ key: "(all|important|mentions|none)"/g) || []).length === 4)
    check("leaving is the About page's confirm (it asks why)", /<JoinProvider community=\{community\} join=\{join\} askWhy=\{askWhy\}>/.test(m) && /const \{ canLeave, open, busy, error \} = useLeave\(\)/.test(m))
    const withComments = readSource("components/community/member/membership.tsx")
    /* Round 13: worker M's parts are in their slots now (the coordinator's merge), not only named. */
    check("worker M's CancelMembership and ContactOwner are mounted in their slots", /<CancelMembership communityId=\{community\.id\} slug=\{community\.slug\} endsAt=\{facts\.expiresAt\} variant="inline" \/>/.test(withComments) && /<ContactOwner communityId=\{community\.id\} ownerName=\{community\.creator\?\.name \?\? null\} \/>/.test(withComments))
  }

  /* ── CONTRIB ────────────────────────────────────────────────────────── */
  console.log("\nCONTRIB: contributions per community")
  {
    check("the line: level, points, posts, each only when known", contributionLine({ level: 3, points: 84, posts: 12 }) === "Level 3 · 84 points · 12 posts" && contributionLine({ level: null, points: null, posts: 1 }) === "1 post" && contributionLine({ level: null, points: null, posts: null }) === "")
    check("Edit opens the post with its editor", editHref("/community/c/post/1") === "/community/c/post/1?edit=1" && editHref("/community/c/post/1?c=2") === "/community/c/post/1?c=2&edit=1")
    const shared = code("lib/profile/shared-posts.ts")
    check("a person's own posts are listed for them (the viewer may be the person)", !/input\.viewerId === input\.targetId\) return null/.test(shared) && /if \(!input\.viewerId\) return null/.test(shared))
    check("the first page counts, on the author index, by the same space filter", /\.eq\("author_id", input\.targetId\)\.eq\("community_id", community\.id\)\.eq\("status", "published"\)\.is\("deleted_at", null\)\.or\(spaceScope\)/.test(shared))
    const contrib = code("lib/profile/contributions.ts")
    check("their own communities for themselves, the shared ones for anybody else, none signed out", /const all = own \? await ownCommunities\(db, targetId\) : await sharedCommunities\(db, viewerId, targetId\)/.test(contrib) && /if \(!viewerId \|\| !UUID\.test\(viewerId\)/.test(contrib))
    check("points and level only where the community keeps points", /if \(!scored\.has\(m\.community_id\)\) continue/.test(contrib))
    const api = code("app/api/profile/contributions/route.ts")
    check("the route: off first, rate limited, signed out gets nothing", api.indexOf("requireCommunitiesOn") < api.indexOf("rateLimit({") && /if \(!user\?\.id\) return NextResponse\.json\(\{ sections: \[\] \}/.test(api))
    check("the creator page's Communities tab draws them under the cards", /<CommunityContributions userId=\{creator\.id\} firstName=\{first\} only=\{cards\.map\(\(c\) => c\.id\)\} tone="storefront" \/>/.test(code("components/profile/creator-communities-tab.tsx")))
    check("a profile reads them for the person themselves too", /communitiesOn && viewerId && !creator \? sharedSections\(db, viewerId, profile\.userId\)/.test(code("app/(marketing)/member/[username]/page.tsx")))
  }

  /* ── INVITES ────────────────────────────────────────────────────────── */
  console.log("\nINVITES: one quiet row a day")
  {
    const C = "c0000000-0000-4000-8000-000000000001"
    const NOW = Date.parse("2026-10-05T15:00:00Z")
    check("one key per inviter, community and UTC day", inviteJoinsKey(C, "u1", NOW) === inviteJoinsKey(C, "u1", Date.parse("2026-10-05T00:00:01Z")) && inviteJoinsKey(C, "u1", NOW) !== inviteJoinsKey(C, "u1", Date.parse("2026-10-06T00:00:01Z")))
    check("the first says who, then how many", inviteJoinsTitle(1, "Ayla") === "Ayla joined through your link" && inviteJoinsTitle(3, null) === "3 people joined through your link" && inviteJoinsTitle(1, null) === "Someone joined through your link")

    /* The first join of the day: a new row, no push. */
    const first = fakeDb((op) => {
      if (op.table === "community_members") return { data: { status: "active", notify_level: "important" } }
      if (op.table === "profiles") return { data: { display_name: "Ayla Demir", username: "ayla" } }
      if (op.table === "community_notifications") return { data: [{ id: "n1" }] }
      return {}
    })
    const a = await noteInviteJoin(first as never, { communityId: C, slug: "clay", inviterId: "u-inv", joinerId: "u-new", now: NOW })
    const row = called(first.ops.find((o) => o.table === "community_notifications")!, "upsert")?.[0] as Record<string, unknown>
    check("first join: one row, \"Ayla joined through your link\", to the members list", a === "sent" && row?.title === "Ayla joined through your link" && row?.url === "/community/clay/members" && row?.kind === "membership" && row?.dedupe_key === inviteJoinsKey(C, "u-inv", NOW))

    /* Later the same day: the row says how many, and is not made unread again. */
    let updated: Record<string, unknown> | null = null
    const later = fakeDb((op) => {
      if (op.table === "community_members") return { data: { status: "active", notify_level: "all" } }
      if (op.table === "profiles") return { data: { display_name: "Joe", username: "joe" } }
      if (op.table === "community_notifications") {
        const u = called(op, "update")
        if (u) {
          updated = u[0] as Record<string, unknown>
          return { data: null }
        }
        return { data: [] }
      }
      if (op.table === "community_invites") return { data: [{ id: "i1" }, { id: "i2" }] }
      if (op.table === "community_invite_uses") return { count: 3 }
      return {}
    })
    const b = await noteInviteJoin(later as never, { communityId: C, slug: "clay", inviterId: "u-inv", joinerId: "u-joe", now: NOW })
    const uses = later.ops.find((o) => o.table === "community_invite_uses")!
    check("later that day: the same row, \"3 people joined through your link\", still read, not moved", b === "updated" && (updated as Record<string, unknown> | null)?.title === "3 people joined through your link" && !("read_at" in (updated ?? {})) && !("created_at" in (updated ?? {})))
    check("counted from the day's start over their own links", JSON.stringify(called(uses, "in")) === JSON.stringify(["invite_id", ["i1", "i2"]]) && (called(uses, "gte") as string[])[1] === "2026-10-05T00:00:00.000Z")

    const none = fakeDb((op) => (op.table === "community_members" ? { data: { status: "active", notify_level: "none" } } : {}))
    check("an inviter at Nothing hears nothing", (await noteInviteJoin(none as never, { communityId: C, slug: "clay", inviterId: "u-inv", joinerId: "u-new", now: NOW })) === "skipped" && !none.ops.some((o) => o.table === "community_notifications"))
    const self = fakeDb(() => ({}))
    check("never about themselves, never without an inviter", (await noteInviteJoin(self as never, { communityId: C, slug: "clay", inviterId: "u1", joinerId: "u1" })) === "skipped" && (await noteInviteJoin(self as never, { communityId: C, slug: "clay", inviterId: null, joinerId: "u1" })) === "skipped" && self.ops.length === 0)
    const broken = fakeDb(() => {
      throw new Error("down")
    })
    check("a failure never fails the join", (await noteInviteJoin(broken as never, { communityId: C, slug: "clay", inviterId: "u-inv", joinerId: "u-new" })) === "unavailable")
    check("redeeming a new use tells the inviter", /if \(r\.new !== false\) await noteInviteJoin\(db, \{ communityId: community\.id, slug: community\.slug, inviterId: refs\.invitedBy, joinerId: userId \}\)/.test(code("lib/communities/server/join.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
