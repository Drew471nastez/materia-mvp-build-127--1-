/**
 * ===========================================================================
 *  COMMUNITIES ROUND 2: THE COMMUNITY'S OWN FRAME AND ITS ABOUT PAGE
 * ===========================================================================
 *   NO STORELIB BAR    nothing of Storelib's header under /community/<slug>;
 *                      the community's layout draws its own bar instead, for
 *                      members (with the pills) and for everybody else (alone),
 *                      and never around a draft or suspended community for
 *                      somebody who may not see it.
 *   THE TOP BAR        logo, name, By <creator> to their page, the switcher
 *                      (my communities, Discover communities, Explore),
 *                      Messages wired to the existing panel, the bell slot,
 *                      my menu (profile, library, settings, explore).
 *   PILLS AND CHIPS    one row: Community, Classroom, Calendar, Members,
 *                      Leaderboards, About, only those on; spaces as chips at
 *                      the top of the feed.
 *   PEOPLE             every name opens the person's page by one rule:
 *                      /<handle> for a storefront, /@handle otherwise.
 *   ABOUT              the gallery (or the cover), the facts line, real
 *                      reviews with "Still a paying member" only when true,
 *                      Members / Online / Admins with Online from a real
 *                      heartbeat or not shown, the sticky card, the phone bar.
 *   PRESENCE           POST /presence: switch first, a member, rate limited,
 *                      at most one write a minute, nobody else's row.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"

import { fakeDb } from "./_fake-db"
import { memberHref, personHref } from "@/components/community/member/person-href"
import { navEntries, pillFor, sectionFromPath } from "@/components/community/member/nav"
import { GALLERY_MAX, parseGallery, payingTenure, safeImageUrl } from "@/components/community/public/gallery"
import { communityGallery, loadSalesPage, topBarData } from "@/lib/communities/server/public"
import { adminCount, communityStats, HEARTBEAT_MS, onlineCount, ONLINE_WINDOW_MS, touchPresence } from "@/lib/communities/server/presence"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"

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
const read = (p: string) => readFileSync(p, "utf8")
/* Code without its comments, so a check reads what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const DAY = 86_400_000
const NOW = Date.parse("2026-10-03T12:00:00.000Z")
const iso = (ms: number) => new Date(ms).toISOString()

async function main() {
  /* ── No Storelib bar ─────────────────────────────────────────────────── */
  console.log("\nNo Storelib bar under /community")
  {
    const header = code("components/marketing/conditional-header.tsx")
    check("every page under /community/<slug> is its own screen: the platform header is not drawn", /function isOwnScreen\(p: string\): boolean \{[^}]*p\.startsWith\("\/community\/"\)/.test(header))
    check("and that is decided in the first render, so it never flashes in", /useState\(\s*\(\) => !isOwnScreen\(pathname\)/.test(header))
    check("the old hide-it-after-paint class is gone", !existsSync("components/community/public/plain-chrome.tsx") && !/community-plain/.test(read("app/globals.css")))
    const layout = code("app/(marketing)/community/[slug]/layout.tsx")
    check("the layout draws the member frame for an active member", /page\.state === "member" && page\.community && page\.viewer\)[\s\S]{0,80}<CommunityShell community=\{page\.community\} viewer=\{page\.viewer\}>/.test(layout))
    check("and the bar alone for anybody else who may see the community", /barVisible\(page\)\)[\s\S]{0,80}<CommunityPublicShell community=\{page\.community\} viewer=\{page\.viewer\}>/.test(layout))
    check("never around a missing, switched off or suspended community", /page\.state === "off" \|\| page\.state === "missing" \|\| page\.state === "closed"\) return false/.test(layout))
    check("and a draft only for its staff", /community\.status !== "draft"\) return true[\s\S]{0,40}return !!viewer && \(viewer\.isOwner \|\| viewer\.isCreatorAccount \|\| meetsRole\(viewer\.role, "moderator"\)\)/.test(layout))
    check("community pages are still never indexed by the layout", /robots: \{ index: false, follow: false \}/.test(layout))
  }

  /* ── The top bar ─────────────────────────────────────────────────────── */
  console.log("\nThe community's top bar")
  {
    const bar = code("components/community/member/top-bar.tsx")
    check("logo and name go to the community's home", /<Link href=\{base\} aria-label=\{`\$\{community\.name\}, home`\}/.test(bar) && /<Link href=\{base\} className="block truncate/.test(bar))
    check("By <creator> opens the creator's page", /By\{" "\}[\s\S]{0,80}<Link href=\{creator\.href\}/.test(bar))
    check("the switcher: my communities, Discover communities, Explore Storelib", /others\.map\(\(c, i\) => \(\{[\s\S]*?href: `\/community\/\$\{c\.slug\}`/.test(bar) && /label: "Discover communities", href: "\/explore\/communities"/.test(bar) && /label: "Explore Storelib", href: "\/explore"/.test(bar))
    check("the switcher is a menu on a computer and a sheet on a phone (the shared action list)", /<ResponsiveActionMenu\s+title="Switch community"/.test(bar))
    check("my menu: profile, library, settings, explore", /label: "My profile", href: me\.profileHref/.test(bar) && /label: "Library", href: "\/library"/.test(bar) && /label: "Settings", href: "\/account\/settings"/.test(bar) && /label: "Explore Storelib", href: "\/explore"/.test(bar))
    check("Manage community only when the server says this person runs it", /data\.manageHref \? \[\{ label: "Manage community", href: data\.manageHref/.test(bar))
    check("a visitor gets Log in, back to this page", /href=\{`\/login\?next=\$\{encodeURIComponent\(pathname \|\| base\)\}`\}/.test(bar))
    check("Messages only when the panel is available, with its unread count", /messages !== null && onMessages \?/.test(bar) && /messages > 0 \? <Badge n=\{messages\} \/>/.test(bar))
    check("the bell is one slot the notifications worker's bell drops into", /<BellSlot /.test(bar) && /NotificationBell/.test(read("components/community/member/bell-slot.tsx")))
    check("the bell slot draws nothing for somebody who is not a member", /if \(!community \|\| !userId\) return null/.test(code("components/community/member/bell-slot.tsx")))
    check("the bar sits below the status bar in the phone app", /pt-\[env\(safe-area-inset-top\)\]/.test(bar))
    check("its height is measured once and shared as --community-top", /frame\.style\.setProperty\("--community-top", h\)/.test(bar) && /html\.style\.setProperty\("--community-top", h\)/.test(bar))
    const frame = code("components/community/member/shell-frame.tsx")
    check("the frame wires Messages to the existing panel and its unread count", /useUnreadMessages\(community\.id, viewer\.userId, unreadMessages\)/.test(frame) && /<MessagesPanel communityId=\{community\.id\}/.test(frame) && /onMessages=\{\(\) => setChat/.test(frame))
    check("Message on a member's page still opens the panel", /window\.addEventListener\(MESSAGES_EVENT, on\)/.test(frame))
    check("the old left column is gone", !/data-community-rail|RailLink|SpaceLink/.test(frame))
  }

  /* ── Pills and chips ─────────────────────────────────────────────────── */
  console.log("\nOne row of pills, spaces as chips")
  {
    const all = navEntries({ slug: "s", classroomEnabled: true, eventsEnabled: true, directoryEnabled: true, gamificationEnabled: true }, false)
    check("Community, Classroom, Calendar, Members, Leaderboards, About", all.map((e) => e.label).join() === "Community,Classroom,Calendar,Members,Leaderboards,About", all.map((e) => e.label))
    check("each to its own address", all.map((e) => e.href).join() === "/community/s,/community/s/classroom,/community/s/events,/community/s/members,/community/s/leaderboard,/community/s/about")
    const none = navEntries({ slug: "s", classroomEnabled: false, eventsEnabled: false, directoryEnabled: false, gamificationEnabled: false }, false)
    check("only the places that are on", none.map((e) => e.label).join() === "Community,About")
    check("a space, a post, Saved and the inbox light Community", ["/community/s/space/x", "/community/s/post/p", "/community/s/saved", "/community/s/notifications", "/community/s"].every((p) => pillFor(sectionFromPath(p, "s")) === "home"))
    check("About lights About; Calendar lights on an event", pillFor(sectionFromPath("/community/s/about", "s")) === "about" && pillFor(sectionFromPath("/community/s/events/e1", "s")) === "events")
    const chips = code("components/community/member/space-chips.tsx")
    check("chips: All, then every space the member may see, then Saved", /data-space-chip="all"/.test(chips) && /spaces\.map\(\(s\) =>/.test(chips) && /href=\{`\$\{base\}\/space\/\$\{s\.slug\}`\}/.test(chips) && /href=\{`\$\{base\}\/saved`\}/.test(chips))
    check("chips are on the feed, a space and Saved", /<SpaceChips slug=\{community\.slug\} spaces=\{shell\.spaces\} active=\{null\} \/>/.test(code("components/community/member/feed-page.tsx")) && /<SpaceChips slug=\{community\.slug\} spaces=\{shell\.spaces\} active=\{space\.slug\} \/>/.test(code("app/(marketing)/community/[slug]/(member)/space/[space]/page.tsx")) && /savedOn/.test(code("app/(marketing)/community/[slug]/(member)/saved/page.tsx")))
  }

  /* ── People ──────────────────────────────────────────────────────────── */
  console.log("\nA name opens the person's page")
  {
    check("a storefront is /<handle>", personHref({ username: "Ana", hasStorefront: true }) === "/ana")
    check("anybody else is /@handle", personHref({ username: "sam", hasStorefront: false }) === "/@sam" && personHref({ username: "sam" }) === "/@sam")
    check("no username, no page", personHref({ username: null }) === "/" && personHref({ username: "  " }) === "/")
    check("inside a community, no username falls back to this community's view of them", memberHref("club", { id: "u1", username: null }) === "/community/club/members/u1" && memberHref("club", { id: "u1", username: "sam" }) === "/@sam")
    for (const f of ["post-card.tsx", "post-page.tsx", "chat.tsx", "leaderboard.tsx", "members.tsx"]) {
      const src = code(`components/community/member/${f}`)
      check(`${f}: names link through memberHref, not the community's member page`, /memberHref\(/.test(src) && !/href=\{`\$\{base\}\/members\/\$\{author\.id\}`\}|href=\{`\/community\/\$\{slug\}\/members\/\$\{(c\.author|m\.author|r|m)\.(id|userId)\}`\}/.test(src))
    }
    const dir = code("lib/communities/server/directory.ts")
    check("who has a storefront is read once per page of people (finished onboarding, as /<handle> checks)", /from\("creators"\)\.select\("user_id"\)\.in\("user_id", list\)\.eq\("onboarding_completed", true\)/.test(dir) && (dir.match(/storefrontsOf\(db,/g) || []).length >= 3)
    check("a member row offers Message beside the name when chat is on", /openMessages\(\{ userId: m\.userId \}\)/.test(code("components/community/member/members.tsx")))
  }

  /* ── The gallery ─────────────────────────────────────────────────────── */
  console.log("\nThe gallery")
  {
    const V1 = "a1111111-1111-4111-8111-111111111111"
    const parsed = parseGallery([
      { type: "image", url: "https://cdn.example/a.jpg" },
      { type: "image", url: "javascript:alert(1)" },
      { type: "image", url: "//evil.example/x.jpg" },
      { type: "image", url: "/storage/b.jpg" },
      { type: "video", videoId: V1 },
      { type: "video", videoId: "not-a-uuid" },
      { type: "image", url: "https://cdn.example/a.jpg" },
      { type: "gif", url: "https://cdn.example/c.gif" },
      null,
    ])
    check("only https or site images and real video ids, no repeats", JSON.stringify(parsed) === JSON.stringify([{ type: "image", url: "https://cdn.example/a.jpg" }, { type: "image", url: "/storage/b.jpg" }, { type: "video", videoId: V1 }]), parsed)
    check("at most 12", parseGallery(Array.from({ length: 20 }, (_, i) => ({ type: "image", url: `https://x/${i}.jpg` }))).length === GALLERY_MAX && GALLERY_MAX === 12)
    check("not an array is nothing", parseGallery({ a: 1 }).length === 0 && parseGallery(null).length === 0)
    check("image addresses: https or a path here, nothing else", safeImageUrl("http://x/a.jpg") === null && safeImageUrl("data:image/png;base64,x") === null && safeImageUrl("https://x/a.jpg") === "https://x/a.jpg")
    const C = "c0000000-0000-4000-8000-0000000000c1"
    const V2 = "a2222222-2222-4222-8222-222222222222"
    const before = fakeDb({ communities: [{ id: C }], media_videos: [] }, { failWith: { communities: { code: "42703", message: "column communities.gallery does not exist" } } })
    const cover = await communityGallery(before, { id: C, cover_url: "https://x/cover.jpg", cover_video_id: null })
    check("before part 85: the cover alone", JSON.stringify(cover) === JSON.stringify([{ type: "image", url: "https://x/cover.jpg" }]), cover)
    const chosen = fakeDb({
      communities: [{ id: C, gallery: [{ type: "video", videoId: V1 }, { type: "image", url: "https://x/1.jpg" }, { type: "video", videoId: V2 }] }],
      media_videos: [
        { id: V1, community_id: C, status: "ready", thumbnail_url: "https://x/v1.jpg" },
        { id: V2, community_id: C, status: "processing", thumbnail_url: null },
      ],
    })
    const g = await communityGallery(chosen, { id: C, cover_url: "https://x/cover.jpg", cover_video_id: null })
    check("the creator's order, ready videos only, with their posters, and no cover added", JSON.stringify(g) === JSON.stringify([{ type: "video", videoId: V1, posterUrl: "https://x/v1.jpg" }, { type: "image", url: "https://x/1.jpg" }]), g)
    const route = code("app/api/community/[communityId]/videos/[videoId]/play/route.ts")
    check("a gallery video plays for whoever can see the about page, after the switch and a rate limit", /const off = await requireCommunitiesOn\(\)[\s\S]*rateLimit\([\s\S]*inPublicGallery\(db, community, video\.id\)/.test(route))
    check("and only while the community is published and open", /if \(community\.status !== "published" \|\| !communityOpen\(community\)\) return false/.test(code("lib/communities/server/public.ts")))
  }

  /* ── Reviews ─────────────────────────────────────────────────────────── */
  console.log("\nStill a paying member, only when true")
  {
    const joined = (days: number) => iso(NOW - days * DAY)
    check("a subscriber for 95 days: 3 months", payingTenure({ status: "active", source: "subscription", joinedAt: joined(95) }, NOW) === "3 months")
    check("four days in: 4 days", payingTenure({ status: "active", source: "purchase", joinedAt: joined(4) }, NOW) === "4 days")
    check("joined today: 1 day", payingTenure({ status: "active", source: "product", joinedAt: joined(0.2) }, NOW) === "1 day")
    check("over a year: years", payingTenure({ status: "active", source: "subscription", joinedAt: joined(800) }, NOW) === "2 years")
    check("a free member: nothing", payingTenure({ status: "active", source: "free", joinedAt: joined(95) }, NOW) === null)
    check("somebody who left or expired: nothing", payingTenure({ status: "expired", source: "subscription", joinedAt: joined(95) }, NOW) === null && payingTenure({ status: "cancelled", source: "subscription", joinedAt: joined(95) }, NOW) === null)
    check("no member row, or no date: nothing", payingTenure(null, NOW) === null && payingTenure({ status: "active", source: "subscription", joinedAt: null }, NOW) === null)
  }

  /* ── The about page against a database ───────────────────────────────── */
  console.log("\nThe about page, read")
  const C = "c0000000-0000-4000-8000-000000000001"
  const U = "a0000000-0000-4000-8000-000000000001"
  const OWNER = "a0000000-0000-4000-8000-0000000000aa"
  const PAYER = "a0000000-0000-4000-8000-0000000000b1"
  const FREEBIE = "a0000000-0000-4000-8000-0000000000b2"
  const ADMIN = "a0000000-0000-4000-8000-0000000000b3"
  const TIER = "b0000000-0000-4000-8000-000000000001"
  const PRODUCT = "d0000000-0000-4000-8000-000000000001"
  const CREATOR = "e0000000-0000-4000-8000-000000000001"
  const OTHER = "c0000000-0000-4000-8000-000000000002"
  const DRAFT = "c0000000-0000-4000-8000-000000000003"
  const now = Date.now()
  const world = (o: { onboarded?: boolean; lastSeen?: boolean } = {}) =>
    fakeDb({
      communities: [
        { id: C, slug: "makers", name: "Makers", tagline: "People who make things", description: "We build.", creator_id: CREATOR, owner_user_id: OWNER, access: "paid", visibility: "private", status: "published", approval_required: false, member_count: 4, benefits: [], rules: [], faq: [], cover_url: "https://x/cover.jpg", logo_url: null, deleted_at: null, suspended_at: null, archived_at: null, platform_hidden: false },
        { id: OTHER, slug: "potters", name: "Potters", logo_url: null, status: "published", suspended_at: null, deleted_at: null },
        { id: DRAFT, slug: "secret", name: "Secret", logo_url: null, status: "draft", suspended_at: null, deleted_at: null },
      ],
      community_tiers: [{ id: TIER, community_id: C, name: "Pro", kind: "paid", billing: "recurring", product_id: PRODUCT, position: 0, is_default: true, archived_at: null, benefits: [] }],
      community_access_products: [],
      community_members: [
        { id: "m1", community_id: C, user_id: OWNER, role: "owner", source: "owner", status: "active", joined_at: iso(now - 400 * DAY), ...(o.lastSeen ? { last_seen_at: iso(now - 60_000) } : {}) },
        { id: "m2", community_id: C, user_id: PAYER, role: "member", source: "subscription", status: "active", joined_at: iso(now - 95 * DAY), ...(o.lastSeen ? { last_seen_at: iso(now - 2 * 60_000) } : {}) },
        { id: "m3", community_id: C, user_id: FREEBIE, role: "member", source: "free", status: "active", joined_at: iso(now - 95 * DAY), ...(o.lastSeen ? { last_seen_at: iso(now - 20 * 60_000) } : {}) },
        { id: "m4", community_id: C, user_id: ADMIN, role: "admin", source: "manual", status: "active", joined_at: iso(now - 30 * DAY) },
        { id: "m5", community_id: OTHER, user_id: U, role: "member", source: "free", status: "active", last_active_at: iso(now - DAY) },
        { id: "m6", community_id: DRAFT, user_id: U, role: "member", source: "free", status: "active", last_active_at: iso(now) },
      ],
      community_invites: [],
      products: [{ id: PRODUCT, title: "Makers Pro", slug: "makers-pro", type: "membership", status: "published", price_cents: 900, creator_id: CREATOR, community_id: C, reviews_count: 2, reviews_average: 4.5 }],
      membership_plans: [{ product_id: PRODUCT, monthly_price_cents: 900, yearly_price_cents: null, currency: "usd" }],
      creators: [{ id: CREATOR, user_id: OWNER, slug: "ana", display_name: "Ana", avatar_url: null, stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true, onboarding_completed: o.onboarded ?? true }],
      profiles: [
        { id: OWNER, username: "ana", display_name: "Ana Maker", avatar_url: null },
        { id: PAYER, username: "pat", display_name: "Pat Payer", avatar_url: null },
        { id: FREEBIE, username: null, display_name: "Fran", avatar_url: null },
        { id: U, username: "uma", display_name: "Uma", avatar_url: "https://x/uma.jpg" },
      ],
      reviews: [
        { id: "r1", product_id: PRODUCT, rating: 5, content: "Worth it.", created_at: iso(now - 5 * 3600_000), status: "published", buyer_id: PAYER, reviewer_name: null },
        { id: "r2", product_id: PRODUCT, rating: 4, content: "Good calls.", created_at: iso(now - 2 * DAY), status: "published", buyer_id: FREEBIE, reviewer_name: null },
      ],
      entitlements: [],
      memberships: [],
      community_audit_log: [],
      community_activity: [],
      community_courses: [],
      community_spaces: [],
      media_videos: [],
    })
  {
    const page = await loadSalesPage("makers", null, world())
    const c = page?.data.community
    check("the reviews, newest first", c?.reviews?.items.map((r) => r.id).join() === "r1,r2", c?.reviews?.items.map((r) => r.id))
    check("the subscriber's review says Still a paying member after 3 months", c?.reviews?.items[0].payingFor === "3 months", c?.reviews?.items[0])
    check("the free member's review says nothing about paying", c?.reviews?.items[1].payingFor === null)
    check("a reviewer's name opens their page; no username, no link", c?.reviews?.items[0].href === "/@pat" && c?.reviews?.items[1].href === null)
    check("the gallery falls back to the cover", JSON.stringify(c?.gallery) === JSON.stringify([{ type: "image", url: "https://x/cover.jpg" }]))
    check("Members from the trigger count, admins counted (owner and admins)", c?.stats.members === 4 && c?.stats.admins === 2, c?.stats)
    check("no heartbeat yet: online is 0 from real rows, never invented", c?.stats.online === 0, c?.stats)
    check("the card prints the address", c?.address === "storelib.com/community/makers")
    check("By the creator, to their storefront", c?.creator?.href === "/ana")
    const notYet = await loadSalesPage("makers", null, world({ onboarded: false }))
    check("a creator who has not finished onboarding opens at /@handle", notYet?.data.community.creator?.href === "/@ana")
    const live = await loadSalesPage("makers", null, world({ lastSeen: true }))
    check("online is active members seen in the last five minutes", live?.data.community.stats.online === 2, live?.data.community.stats)
  }
  {
    const missingColumn = fakeDb({ community_members: [] }, { failWith: { community_members: { code: "42703", message: "column community_members.last_seen_at does not exist" } } })
    check("before part 85 the online figure is null (hidden), not zero", (await onlineCount(missingColumn, C)) === null)
    check("and the admins figure too when it cannot be read", (await adminCount(missingColumn, C)) === null)
    const stats = await communityStats(missingColumn, { id: C, member_count: 7 })
    check("members still come from the community row", stats.members === 7 && stats.online === null)
    check("the window is five minutes and the heartbeat a minute", ONLINE_WINDOW_MS === 300_000 && HEARTBEAT_MS === 60_000)
    const row = code("components/community/public/stats-row.tsx")
    check("the stats row leaves Online out when it is null", /if \(stats\.online !== null\) cells\.push/.test(row))
  }

  /* ── The top bar's facts ─────────────────────────────────────────────── */
  console.log("\nThe top bar's facts")
  {
    const db = world()
    const community = db.tables.communities[0] as never
    const visitor = await topBarData(community, null, db)
    check("a visitor: the community, By Ana to her page, no me, no communities", visitor.community.slug === "makers" && visitor.creator?.name === "Ana Maker" && visitor.creator?.href === "/ana" && visitor.me === null && visitor.communities.length === 0 && visitor.manageHref === null)
    const viewer = { userId: U, active: false, role: null, isOwner: false, isCreatorAccount: false } as never
    const signedIn = await topBarData(community, viewer, db)
    check("signed in: their name, picture and page", signedIn.me?.name === "Uma" && signedIn.me?.avatarUrl === "https://x/uma.jpg" && signedIn.me?.profileHref === "/@uma", signedIn.me)
    check("the switcher lists their communities, not a draft they are only a member of", signedIn.communities.map((c) => c.slug).join() === "potters", signedIn.communities)
    const owner = await topBarData(community, { userId: OWNER, active: true, role: "owner", isOwner: true, isCreatorAccount: true } as never, db)
    check("its owner gets Manage community, and their own page is their storefront", owner.manageHref === `/app/community/${C}` && owner.me?.profileHref === "/ana")
    const member = await topBarData(community, { userId: PAYER, active: true, role: "member", isOwner: false, isCreatorAccount: false } as never, db)
    check("a member does not", member.manageHref === null)
  }

  /* ── Presence ────────────────────────────────────────────────────────── */
  console.log("\nThe presence heartbeat")
  {
    const route = code("app/api/community/[communityId]/presence/route.ts")
    check("the switch first", /export async function POST\([^)]*\)[^{]*\{\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(route))
    check("an active member (requireMember view) from the session, never a user id from the body", /requireMember\(db, communityId, await sessionUserId\(\), "view"\)/.test(route) && !/request\.json|readJson/.test(route))
    check("rate limited on its own bucket", /rateLimit\(\{ bucket: rateBucket\("presence"\), subjects: \[memberSubject\(/.test(route) && rateBucket("presence") === "community-presence" && RATE_LIMITS.presence.length > 0)
    check("no store", /headers: NO_STORE/.test(route))
    /* touchPresence's write, recorded. */
    const calls: [string, ...unknown[]][] = []
    const builder: Record<string, (...a: unknown[]) => unknown> = {}
    for (const m of ["update", "eq", "or", "select"]) builder[m] = (...a: unknown[]) => (calls.push([m, ...a]), builder)
    ;(builder as { then?: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "m" }], error: null }).then(resolve)
    const db = { from: (t: string) => (calls.push(["from", t]), builder) }
    const done = await touchPresence(db, C, U, NOW)
    const or = calls.find((c) => c[0] === "or")?.[1]
    check("it writes last_seen_at on the member's own active row", JSON.stringify(calls.find((c) => c[0] === "update")?.[1]) === JSON.stringify({ last_seen_at: iso(NOW) }) && calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === U) && calls.some((c) => c[0] === "eq" && c[1] === "status" && c[2] === "active"))
    check("at most once a minute: only when it was last written over a minute ago", or === `last_seen_at.is.null,last_seen_at.lt."${iso(NOW - 60_000)}"`, or)
    check("and says it wrote", done.ready && done.written)
    const missing = { from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ or: () => ({ select: () => Promise.resolve({ data: null, error: { code: "42703" } }) }) }) }) }) }) }) }
    check("before part 85 it answers not ready, so the page stops asking", JSON.stringify(await touchPresence(missing, C, U, NOW)) === JSON.stringify({ ready: false, written: false }))
    const frame = code("components/community/member/shell-frame.tsx")
    check("the page stops when the server says not ready or the member is not one", /data\.ready === false\) stopped = true/.test(frame) && /res\.status === 401 \|\| res\.status === 403 \|\| res\.status === 404\) stopped = true/.test(frame))
  }

  /* ── The about page's shape ──────────────────────────────────────────── */
  console.log("\nThe about page's shape")
  {
    const page = code("components/community/public/sales-page.tsx")
    check("title, then rating, then the gallery, then the facts line and the description", page.indexOf("<h1") < page.indexOf("data-community-rating") && page.indexOf("data-community-rating") < page.indexOf("<CommunityGallery") && page.indexOf("<CommunityGallery") < page.indexOf("<InfoRow") && page.indexOf("<InfoRow") < page.indexOf("data-community-description"))
    check("the facts line: visibility, members, price, By creator", /data-info="visibility"/.test(page) && /data-info="members"/.test(page) && /data-info="price"/.test(page) && /data-info="creator"/.test(page))
    check("Still a paying member is drawn only when the server says so", /\{r\.payingFor \? <span data-review-paying=""> · Still a paying member after \{r\.payingFor\}<\/span> : null\}/.test(page))
    check("the card's content flows under the media on a phone, and the bar sticks at the bottom", page.indexOf("<JoinSummaryPhone") > page.indexOf("<CommunityGallery") && /<JoinBarPhone \/>/.test(page))
    const controls = code("components/community/public/join-controls.tsx")
    check("the card sticks under the community's bar, with Members / Online / Admins and the button", /sticky top-\[calc\(var\(--community-top,65px\)\+24px\)\]/.test(controls) && /<StatsRow stats=\{community\.stats\}/.test(controls) && /<PrimaryAction className="mt-4 w-full" \/>/.test(controls))
    check("the sales page calls no client function on the server", !/from "\.\/join-controls"[\s\S]*intervalPrice/.test(page))
  }

  /* ── Copy and boundaries ─────────────────────────────────────────────── */
  console.log("\nCopy, and no server code in the browser")
  {
    const mine = [
      "components/community/member/top-bar.tsx",
      "components/community/member/shell-frame.tsx",
      "components/community/member/bell-slot.tsx",
      "components/community/member/space-chips.tsx",
      "components/community/member/person-href.ts",
      "components/community/member/nav.ts",
      "components/community/public/gallery.ts",
      "components/community/public/gallery-view.tsx",
      "components/community/public/stats-row.tsx",
      "components/community/public/public-frame.tsx",
      "components/community/public/sales-page.tsx",
      "components/community/public/join-controls.tsx",
      "lib/communities/server/presence.ts",
      "app/api/community/[communityId]/presence/route.ts",
      "app/(marketing)/community/[slug]/layout.tsx",
    ]
    const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
    check("no em dash and no banned word", offenders.length === 0, offenders)
    const clients = mine.filter((f) => /^"use client"/.test(read(f)))
    const leaks = clients.filter((f) => /server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)|lib\/admin-blog-auth|\.\/(data|shell|feed-page)"/.test(code(f)))
    check("client parts import nothing from the server", clients.length >= 6 && leaks.length === 0, leaks)
    check("the presence module says server-only", /^import "server-only"/m.test(read("lib/communities/server/presence.ts")))
    check("no violet fills on the community's frame", !mine.some((f) => /bg-\[#8b5cf6\]|bg-violet|bg-purple/.test(code(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
