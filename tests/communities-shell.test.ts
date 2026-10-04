/**
 * ===========================================================================
 *  COMMUNITIES ROUND 2: THE COMMUNITY'S OWN FRAME AND ITS ABOUT PAGE
 * ===========================================================================
 *   NO STORELIB BAR    nothing of Storelib's header under /community/<slug>;
 *                      the community's layout draws its own bar instead, for
 *                      members (with the pills) and for everybody else (alone),
 *                      and never around a draft or suspended community for
 *                      somebody who may not see it.
 *   THE TOP BAR        the hamburger (Storelib's one navigator) before the
 *                      logo and name, By <creator> to their page, no chevron
 *                      switcher, Messages wired to the existing panel, the
 *                      bell, my menu (profile, library, settings, explore),
 *                      a hairline and a soft shadow under it.
 *   TABS AND CHIPS     one row of plain text tabs with a line under the
 *                      chosen one (not pills): Community, Classroom, Calendar,
 *                      Members, Leaderboards, About, only those on; spaces as
 *                      chips at the top of the feed.
 *   PEOPLE             every name opens the person's page by one rule:
 *                      /<handle> for a storefront, /@handle otherwise. There
 *                      is no member page inside a community: its old address
 *                      redirects to the person's page.
 *   PERSON CARD        resting on a name opens a card (350ms in, a short
 *                      grace out, keyboard focus too, never on touch) with
 *                      public facts only, from a rate limited member route.
 *   MESSAGE            opens the panel in place; ?dm=<userId> opens that
 *                      conversation once and leaves the address.
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
import { memberHref } from "@/components/community/member/person-href"
import { personHref } from "@/lib/profile/person-href"
import { navEntries, sectionFromPath, tabFor } from "@/components/community/member/nav"
import { activeLabel, CARD_GRACE_MS, CARD_OPEN_MS, communitiesLine, hoverPointer, ownerLine } from "@/components/community/member/person-card-facts"
import { personCard } from "@/lib/communities/server/people"
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
    check("no chevron switcher any more", !/ChevronsUpDown|Switch community|data-community-switcher/.test(bar))
    check("the hamburger first: Storelib's navigator, marked as this community, before the picture and the name", /<PlaceNavigator current=\{\{ kind: "community", id: community\.id \}\}/.test(bar) && bar.indexOf("<PlaceNavigator") < bar.indexOf("<CommunityMark") && bar.indexOf("<PlaceNavigator") < bar.indexOf("data-community-identity"))
    check("the navigator comes from one import that becomes components/nav/place-navigator.tsx on merge", /import \{ PlaceFallbackContext, PlaceNavigator \} from "\.\/place-navigator"/.test(bar))
    const stand = code("components/community/member/place-navigator.tsx")
    check("the stand in has the navigator's props and a working menu: my communities, Discover, Explore", /export function PlaceNavigator\(\{ current, className = "" \}: PlaceNavigatorProps\)/.test(stand) && /current\?: \{ kind: "community"; id: string \} \| \{ kind: "storelib" \}/.test(stand) && /href: `\/community\/\$\{c\.slug\}`/.test(stand) && /label: "Discover communities", href: "\/explore\/communities"/.test(stand) && /label: "Explore Storelib", href: "\/explore"/.test(stand))
    check("the bar reads as a bar over the page: a hairline and a soft shadow", /data-community-top=""[\s\S]{0,40}className="sticky top-0 z-40 border-b border-\[#e6e8ec\] bg-white[^"]*shadow-\[0_1px_2px/.test(bar))
    check("my menu: profile, library, settings, explore", /label: "My profile", href: me\.profileHref/.test(bar) && /label: "Library", href: "\/account\/library"/.test(bar) && /label: "Settings", href: "\/account\/settings"/.test(bar) && /label: "Explore Storelib", href: "\/explore"/.test(bar))
    check("Manage community only when the server says this person runs it", /data\.manageHref \? \[\{ label: "Manage community", href: data\.manageHref/.test(bar))
    check("a visitor gets Log in, back to this page", /href=\{`\/login\?next=\$\{encodeURIComponent\(pathname \|\| base\)\}`\}/.test(bar))
    check("Messages only when the panel is available, with its unread count", /messages !== null && onMessages \?/.test(bar) && /messages > 0 \? <Badge n=\{messages\} \/>/.test(bar))
    check("the bell is Storelib's own, for anybody signed in", /import \{ NotificationBell \} from "@\/components\/notifications\/notification-bell"/.test(bar) && /\{me \? <NotificationBell /.test(bar) && !existsSync("components/community/member/bell-slot.tsx"))
    check("the bell keeps the two realtime exports it reads from the member area", /export async function realtimeAuth\(/.test(read("components/community/member/realtime.ts")) && /export const INBOX_EVENT = /.test(read("components/community/member/realtime.ts")))
    check("the bar sits below the status bar in the phone app", /pt-\[env\(safe-area-inset-top\)\]/.test(bar))
    check("its height is measured once and shared as --community-top", /frame\.style\.setProperty\("--community-top", h\)/.test(bar) && /html\.style\.setProperty\("--community-top", h\)/.test(bar))
    const frame = code("components/community/member/shell-frame.tsx")
    check("the frame wires Messages to the existing panel and its unread count", /useUnreadMessages\(community\.id, viewer\.userId, unreadMessages\)/.test(frame) && /<MessagesPanel communityId=\{community\.id\}/.test(frame) && /onMessages=\{\(\) => setChat/.test(frame))
    check("Message on a person's card or a member row opens the panel", /window\.addEventListener\(MESSAGES_EVENT, on\)/.test(frame))
    check("?dm=<userId> opens that conversation once and takes ?dm off the address", /const dm = search\?\.get\("dm"\) \?\? null/.test(frame) && /url\.searchParams\.delete\("dm"\)/.test(frame) && /window\.history\.replaceState\(window\.history\.state, "", url\.pathname \+ url\.search \+ url\.hash\)/.test(frame) && /setChat\(\{ userId: dm \}\)/.test(frame))
    check("only when messages are available, never to yourself, only an id", /if \(!canMessage \|\| !DM_TARGET\.test\(dm\) \|\| dm === viewer\.userId\) return/.test(frame) && /const DM_TARGET = \/\^\[0-9a-z-\]\{1,64\}\$\/i/.test(frame))
    check("the person card layer lives in the frame", /<PersonCardLayer communityId=\{community\.id\} canMessage=\{canMessage\} \/>/.test(frame))
    check("the old left column is gone", !/data-community-rail|RailLink|SpaceLink/.test(frame))
  }

  /* ── Pills and chips ─────────────────────────────────────────────────── */
  console.log("\nOne row of section tabs, spaces as chips")
  {
    const all = navEntries({ slug: "s", classroomEnabled: true, eventsEnabled: true, directoryEnabled: true, gamificationEnabled: true }, false)
    check("Community, Classroom, Calendar, Members, Leaderboards, About", all.map((e) => e.label).join() === "Community,Classroom,Calendar,Members,Leaderboards,About", all.map((e) => e.label))
    check("each to its own address", all.map((e) => e.href).join() === "/community/s,/community/s/classroom,/community/s/events,/community/s/members,/community/s/leaderboard,/community/s/about")
    const none = navEntries({ slug: "s", classroomEnabled: false, eventsEnabled: false, directoryEnabled: false, gamificationEnabled: false }, false)
    check("only the places that are on", none.map((e) => e.label).join() === "Community,About")
    check("a space, a post, Saved and the inbox mark Community", ["/community/s/space/x", "/community/s/post/p", "/community/s/saved", "/community/s/notifications", "/community/s"].every((p) => tabFor(sectionFromPath(p, "s")) === "home"))
    check("About marks About; Calendar marks on an event; an old member address marks Members", tabFor(sectionFromPath("/community/s/about", "s")) === "about" && tabFor(sectionFromPath("/community/s/events/e1", "s")) === "events" && tabFor(sectionFromPath("/community/s/members/u1", "s")) === "members")
    const frameCode = code("components/community/member/shell-frame.tsx")
    check("the tabs are plain words, not pills", /<SectionTabs entries=\{entries\} current=\{tabFor\(current\)\} \/>/.test(frameCode) && /className=\{`\$\{TAB\} \$\{on \? TAB_ON : TAB_OFF\}`\}/.test(frameCode) && !/PillRow|PILL_ON|PILL_OFF/.test(frameCode))
    const ui = code("components/community/member/ui.ts")
    const tab = /export const TAB =\s*"([^"]+)"/.exec(ui)?.[1] ?? ""
    check("a tab has no box: no border, no fill, no pill rounding", !!tab && !/(^|\s)(border|bg-\[)|rounded-full/.test(tab) && /h-11/.test(tab), tab)
    check("the chosen one has a 2px ink line on the bar's edge that grows in by scale and opacity", /data-tab-line=""[\s\S]{0,80}absolute inset-x-0 bottom-0 h-\[2px\] rounded-full bg-\[#1a1a2e\] transition-\[opacity,scale\]/.test(frameCode) && /on \? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"/.test(frameCode))
    const chips = code("components/community/member/space-chips.tsx")
    check("chips: All, then every space the member may see, then Saved", /data-space-chip="all"/.test(chips) && /spaces\.map\(\(s\) =>/.test(chips) && /href=\{`\$\{base\}\/space\/\$\{s\.slug\}`\}/.test(chips) && /href=\{`\$\{base\}\/saved`\}/.test(chips))
    check("chips are on the feed, a space and Saved", /<SpaceChips slug=\{community\.slug\} spaces=\{shell\.spaces\} active=\{null\} \/>/.test(code("components/community/member/feed-page.tsx")) && /<SpaceChips slug=\{community\.slug\} spaces=\{shell\.spaces\} active=\{space\.slug\} \/>/.test(code("app/(marketing)/community/[slug]/(member)/space/[space]/page.tsx")) && /savedOn/.test(code("app/(marketing)/community/[slug]/(member)/saved/page.tsx")))
  }

  /* ── People ──────────────────────────────────────────────────────────── */
  console.log("\nA name opens the person's page")
  {
    check("a storefront is /<handle>", personHref({ username: "Ana", hasStorefront: true }) === "/ana")
    check("anybody else is /@handle", personHref({ username: "sam", hasStorefront: false }) === "/@sam")
    check("no username, no page", personHref({ username: null, hasStorefront: false }) === "/" && personHref({ username: "  ", hasStorefront: true }) === "/")
    check("inside a community, no handle yet goes through the old address, which only redirects", memberHref("club", { id: "u1", username: null }) === "/community/club/members/u1" && memberHref("club", { id: "u1", username: "sam" }) === "/@sam")
    for (const f of ["post-card.tsx", "post-page.tsx", "chat.tsx", "leaderboard.tsx", "members.tsx"]) {
      const src = code(`components/community/member/${f}`)
      check(`${f}: names link through memberHref and say who they are, for the card`, /memberHref\(/.test(src) && /data-person-id=\{/.test(src) && !/href=\{`\$\{base\}\/members\/\$\{author\.id\}`\}|href=\{`\/community\/\$\{slug\}\/members\/\$\{(c\.author|m\.author|r|m)\.(id|userId)\}`\}/.test(src))
    }
    check("the chat's names open the person too, not only the faces", (code("components/community/member/chat.tsx").match(/data-person-id=\{m\.author\.id\}/g) || []).length === 2)
    check("a conversation's name opens the person's page, not a member page", /<a href=\{memberHref\(slug, \{ id: other\.id, username: other\.username \}\)\}/.test(code("components/community/member/messages.tsx")) && !/members\/\$\{other\.id\}/.test(code("components/community/member/messages.tsx")))
    const dir = code("lib/communities/server/directory.ts")
    check("who has a storefront is read once per page of people (finished onboarding, as /<handle> checks)", /from\("creators"\)\.select\("user_id"\)\.in\("user_id", list\)\.eq\("onboarding_completed", true\)/.test(dir) && (dir.match(/storefrontsOf\(db,/g) || []).length >= 3)
    const M = "app/(marketing)/community/[slug]/(member)/members/[userId]"
    const old = code(`${M}/page.tsx`)
    check("the member page inside a community is gone", !existsSync("components/community/member/member-profile.tsx") && !existsSync(`${M}/loading.tsx`) && !/MemberProfile|memberProfile\(/.test(old))
    check("its old address redirects to the person's own page (a member asking; no handle, the member list)", /page\.state !== "member" \|\| !page\.community \|\| !page\.viewer\) notFound\(\)/.test(old) && /personHref\(\{ username: person\.username, hasStorefront: !!person\.hasStorefront \}\)/.test(old) && /redirect\(href === "\/" \? `\$\{base\}\/members` : href\)/.test(old))
    check("and an old ?message=1 link opens the conversation in the community instead", /query\.message === "1" && userId !== page\.viewer\.userId\) redirect\(`\$\{base\}\?dm=\$\{userId\}`\)/.test(old))
    check("names come with a handle: anybody without one is given one when a page of people is read", /ensureUsernames\(db, unnamed\)/.test(code("lib/communities/server/directory.ts")))
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

  /* ── The person card ─────────────────────────────────────────────────── */
  console.log("\nThe card on a person")
  {
    check("it opens after 350ms of rest and waits a short grace after the pointer leaves", CARD_OPEN_MS === 350 && CARD_GRACE_MS > 0 && CARD_GRACE_MS <= 250)
    check("a mouse or a pen hovers; a finger never opens it", hoverPointer("mouse") && hoverPointer("pen") && !hoverPointer("touch") && !hoverPointer(""))
    const N = Date.parse("2026-10-03T12:00:00.000Z")
    check("Online now within the heartbeat's five minutes", activeLabel(iso(N - 2 * 60_000), N) === "Online now")
    check("Active 2h ago, Active 3d ago, then the date", activeLabel(iso(N - 2 * 3600_000), N) === "Active 2h ago" && activeLabel(iso(N - 3 * DAY), N) === "Active 3d ago" && activeLabel(iso(N - 40 * DAY), N) === "Active Aug 24")
    check("nothing when it is not known", activeLabel(null, N) === "" && activeLabel("nope", N) === "")
    check("4 communities (1 in common); 1 community; none says nothing", communitiesLine({ count: 4, inCommon: 1 }) === "4 communities (1 in common)" && communitiesLine({ count: 1, inCommon: 0 }) === "1 community" && communitiesLine({ count: 0, inCommon: 0 }) === "" && communitiesLine(null) === "")
    check("Owner of 2 communities; Owner of 1 community; none says nothing", ownerLine(2) === "Owner of 2 communities" && ownerLine(1) === "Owner of 1 community" && ownerLine(0) === "")

    const C = "c0000000-0000-4000-8000-0000000000c1"
    const PUB = "c0000000-0000-4000-8000-0000000000c2"
    const PUB2 = "c0000000-0000-4000-8000-0000000000c3"
    const PRIV = "c0000000-0000-4000-8000-0000000000c4"
    const HIDDEN = "c0000000-0000-4000-8000-0000000000c5"
    const ME = "a0000000-0000-4000-8000-0000000000e1"
    const LEO = "a0000000-0000-4000-8000-0000000000e2"
    const GONE = "a0000000-0000-4000-8000-0000000000e3"
    const BANNED = "a0000000-0000-4000-8000-0000000000e4"
    const pub = { status: "published", visibility: "public", platform_hidden: false, deleted_at: null, suspended_at: null }
    const people = (o: { show?: boolean; gamification?: boolean; chat?: boolean; seen?: boolean; follows?: boolean } = {}) =>
      fakeDb({
        communities: [
          { id: C, slug: "studio", name: "Studio", visibility: "private", status: "published", gamification_enabled: o.gamification ?? true, chat_enabled: o.chat ?? true, platform_hidden: false, deleted_at: null, suspended_at: null },
          { id: PUB, slug: "pub", name: "Pub", owner_user_id: LEO, ...pub },
          { id: PUB2, slug: "pub2", name: "Pub2", ...pub },
          { id: PRIV, slug: "priv", name: "Priv", owner_user_id: LEO, ...pub, visibility: "private" },
          { id: HIDDEN, slug: "hid", name: "Hid", ...pub, platform_hidden: true },
        ],
        community_members: [
          { community_id: C, user_id: LEO, role: "admin", status: "active", level: 4, bio: "Here for the glaze talk.", banned_at: null, last_active_at: iso(Date.now() - 3 * DAY), ...(o.seen ? { last_seen_at: iso(Date.now() - 2 * 3600_000) } : {}) },
          { community_id: C, user_id: ME, role: "member", status: "active", level: 1, banned_at: null },
          { community_id: C, user_id: GONE, role: "member", status: "cancelled", level: 1, banned_at: null },
          { community_id: C, user_id: BANNED, role: "member", status: "active", level: 1, banned_at: iso(Date.now()) },
          { community_id: PUB, user_id: LEO, role: "owner", status: "active", level: 1 },
          { community_id: PUB2, user_id: LEO, role: "member", status: "active", level: 1 },
          { community_id: PRIV, user_id: LEO, role: "owner", status: "active", level: 1 },
          { community_id: HIDDEN, user_id: LEO, role: "member", status: "active", level: 1 },
          { community_id: PUB2, user_id: ME, role: "member", status: "active", level: 1 },
          { community_id: PRIV, user_id: ME, role: "member", status: "active", level: 1 },
        ],
        community_levels: [{ community_id: C, level: 4, name: "Insider" }],
        profiles: [
          { id: LEO, username: "leo", display_name: "Leo Martins", avatar_url: null, bio: o.show === undefined ? "Potter in Lisbon." : null, email: "leo@example.com", ...(o.show === undefined ? {} : { show_communities: o.show }) },
          { id: ME, username: "me", display_name: "Me", avatar_url: null },
        ],
        creators: [],
        follows: o.follows ? [{ follower_id: ME, following_id: LEO }] : [],
        community_conversations: [],
      })
    const viewer = { userId: ME }
    const community = (db: ReturnType<typeof people>) => db.tables.communities[0] as never
    const db1 = people({ seen: true, follows: true })
    const card = await personCard(db1, community(db1), viewer, LEO)
    check("an active member's card: name, handle, their page, role", card?.name === "Leo Martins" && card?.username === "leo" && card?.href === "/@leo" && card?.role === "admin", card)
    check("their Storelib bio first", card?.bio === "Potter in Lisbon.")
    check("their level here, with its name, while the community counts points", card?.level === 4 && card?.levelName === "Insider")
    check("Active is the later of the heartbeat and their last activity", card?.activeAt === db1.tables.community_members[0].last_seen_at, card?.activeAt)
    check("public communities only: not the private one, not one Storelib hid", card?.communities?.count === 2, card?.communities)
    check("in common: the public ones the viewer is in too", card?.communities?.inCommon === 1, card?.communities)
    check("owns: public ones only", card?.owns === 1, card?.owns)
    check("following and Message from real rows", card?.following === true && card?.canMessage === true && card?.isSelf === false)
    check("never an email", !JSON.stringify(card).includes("leo@example.com"))
    const hiding = people({ show: false })
    const hid = await personCard(hiding, community(hiding), viewer, LEO)
    check("somebody who hides their memberships: no communities line, owned still counted, the community bio instead", hid?.communities === null && hid?.owns === 1 && hid?.bio === "Here for the glaze talk.", hid)
    const quiet = people({ gamification: false, chat: false })
    const q = await personCard(quiet, community(quiet), viewer, LEO)
    check("no level while points are off; no Message while chat is off", q?.level === null && q?.levelName === null && q?.canMessage === false)
    check("before part 85 Active falls back to their last activity", q?.activeAt === quiet.tables.community_members[0].last_active_at)
    const self = await personCard(db1, community(db1), viewer, ME)
    check("my own card: no Message, no following", self?.isSelf === true && self?.canMessage === false && self?.following === false)
    check("nobody who left or was banned, and nothing for a bad id", (await personCard(db1, community(db1), viewer, GONE)) === null && (await personCard(db1, community(db1), viewer, BANNED)) === null && (await personCard(db1, community(db1), viewer, "x")) === null)

    const route = code("app/api/community/[communityId]/people/[userId]/card/route.ts")
    check("the card route: the switch first, a member asking (from the session), rate limited, no store", /export async function GET\([^)]*\)[^{]*\{\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(route) && /requireMember\(db, communityId, await sessionUserId\(\), "view"\)/.test(route) && /rateLimit\(\{ bucket: rateBucket\("card"\)/.test(route) && /headers: NO_STORE/.test(route) && RATE_LIMITS.card.length > 0)
    const server = code("lib/communities/server/people.ts")
    check("the server reads no email and lists only published, public, open communities", !/email/.test(server) && /eq\("status", "published"\)\.eq\("visibility", "public"\)\.eq\("platform_hidden", false\)/.test(server))
    const layer = code("components/community/member/person-card.tsx")
    check("the card opens from a name's data-person-id, by pointer type, and from keyboard focus-visible", /closest<HTMLElement>\("\[data-person-id\]"\)/.test(layer) && /if \(!hoverPointer\(e\.pointerType\)\) return/.test(layer) && /anchor\.matches\(":focus-visible"\)/.test(layer))
    check("Escape closes it and hands focus back; scrolling closes it", /e\.key === "Escape"[\s\S]{0,200}back\.focus\(\)/.test(layer) && /addEventListener\("scroll", onScroll/.test(layer))
    check("Message opens the panel in place", /openMessages\(\{ userId: person\.id \}\)/.test(layer) && !/router\.push/.test(layer))
    check("Follow goes through the one follow route", /api<\{ following: boolean \}>\("\/api\/follow", \{ body: \{ userId: person\.id, follow: next \} \}\)/.test(layer))
  }

  /* ── Copy and boundaries ─────────────────────────────────────────────── */
  console.log("\nCopy, and no server code in the browser")
  {
    const mine = [
      "components/community/member/top-bar.tsx",
      "components/community/member/shell-frame.tsx",
      "components/community/member/space-chips.tsx",
      "components/community/member/person-href.ts",
      "components/community/member/nav.ts",
      "components/community/member/place-navigator.tsx",
      "components/community/member/person-card.tsx",
      "components/community/member/person-card-facts.ts",
      "components/community/member/messages.tsx",
      "lib/communities/server/people.ts",
      "app/api/community/[communityId]/people/[userId]/card/route.ts",
      "app/(marketing)/community/[slug]/(member)/members/[userId]/page.tsx",
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
    check("client parts import nothing from the server", clients.length >= 5 && leaks.length === 0, { clients: clients.length, leaks })
    check("the presence and people modules say server-only", /^import "server-only"/m.test(read("lib/communities/server/presence.ts")) && /^import "server-only"/m.test(read("lib/communities/server/people.ts")))
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
