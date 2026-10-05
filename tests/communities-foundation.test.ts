/**
 * ===========================================================================
 *  COMMUNITIES: THE FOUNDATION EVERY COMMUNITY FEATURE STANDS ON
 * ===========================================================================
 * Held from their inputs:
 *
 *   PERMISSIONS   the whole matrix: what each role may do, who may act on
 *                 whom, who hears about what.
 *   ACCESS        every branch of evaluateAccess, the rule spaces, courses
 *                 and events share with the SQL chat stream.
 *   ADDRESSES     a community's slug, the same shape as the SQL CHECK.
 *   LIMITS        lengths that match the CHECKs, the rate windows, mentions.
 *   WORDS         counts, prices, the join button and times, from real values.
 *   MEMBERSHIP    granting, revoking and reconciling against an in memory
 *                 database: never a second row, never a downgrade, never a
 *                 banned member back, paid access in step with billing.
 *   THE SQL       part 81: every table server only, the only three reads,
 *                 the triggers, the keys that make actions happen once, the
 *                 switch seeded off, run-now's rules.
 *   THE SWITCH    flag modules and routes, and what OFF means for the cron.
 *   BILLING       each payment hook is called and can never throw.
 *   ROUTING       /community is the platform's, and no tab bar covers it.
 *   COPY          no em dash and no banned word in anything new here.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import { COMMUNITY_ACTIONS, ROLE_RANK, allowedActions, assignableRoles, can, canActOn, meetsRole, wantsNotification, type CommunityAction } from "@/lib/communities/permissions"
import { evaluateAccess, isOpenRule, parseAccessRule } from "@/lib/communities/access"
import { RESERVED_COMMUNITY_SLUGS, SLUG_PATTERN, slugWithSuffix, slugify, validSlug, validSpaceSlug } from "@/lib/communities/slug"
import { DEFAULT_LEVELS, DEFAULT_SPACES, LENGTHS, MAX_MENTIONS_PER_POST, RATE_LIMITS, extractMentions, fits, mentionsEveryone, rateBucket } from "@/lib/communities/limits"
import { compactCount, eventDateBadge, eventTime, joinButtonLabel, memberCountLabel, priceLine, relativeTime } from "@/lib/communities/format"
import { NOTIFICATION_KINDS, ROLES, type NotificationKind, type Role } from "@/lib/communities/types"
import { grantMembership, reconcileAccess, revokeMembership, syncCommunityAccessForEntitlement, syncCommunityAccessForMembership } from "@/lib/communities/server/membership"
import { jobBackoffMs, JOB_MAX_ATTEMPTS } from "@/lib/communities/server/notify"
import { buyerTabsBelongOn } from "@/lib/nav/buyer-tabs"
import { CUSTOM_DOMAIN_DISALLOW, PLATFORM_DISALLOW } from "@/lib/seo/indexing"
import { RESERVED_ROOT_EXTRAS, RESERVED_ROOT_SEGMENTS, isReservedRootSegment } from "@/lib/routes/reserved-segments"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

async function main() {
  /* ── Permissions ─────────────────────────────────────────────────────── */
  console.log("\nWho may do what")
  const memberSet: CommunityAction[] = ["view", "post", "comment", "react", "chat", "upload", "report"]
  /* Round 14 added pricing events and refunding tickets, on for a moderator by default because the owner asked for moderators too. */
  const moderatorSet: CommunityAction[] = [...memberSet, "moderate_content", "pin", "lock", "mute", "suspend", "ban", "remove_member", "approve_member", "review_reports", "view_audit", "price_events", "refund_tickets"]
  const ownerOnly: CommunityAction[] = ["transfer_ownership", "delete", "manage_pricing"]
  check("the owner may do everything", COMMUNITY_ACTIONS.every((a) => can("owner", a)))
  check("an admin may do everything but transfer, delete and pricing", COMMUNITY_ACTIONS.every((a) => can("admin", a) === !ownerOnly.includes(a)))
  check("a moderator keeps order and nothing more", COMMUNITY_ACTIONS.every((a) => can("moderator", a) === moderatorSet.includes(a)))
  check("a member reads, posts, comments, reacts, chats, uploads and reports", COMMUNITY_ACTIONS.every((a) => can("member", a) === memberSet.includes(a)))
  check("nobody who is not an active member may do anything", COMMUNITY_ACTIONS.every((a) => !can(null, a) && !can(undefined, a)))
  check("a moderator may not manage settings, pricing, spaces or roles", !can("moderator", "manage_settings") && !can("moderator", "manage_pricing") && !can("moderator", "manage_spaces") && !can("moderator", "change_role"))
  check("the ranks are owner > admin > moderator > member", ROLE_RANK.owner > ROLE_RANK.admin && ROLE_RANK.admin > ROLE_RANK.moderator && ROLE_RANK.moderator > ROLE_RANK.member)
  const actOn: [Role, Role, boolean][] = [
    ["owner", "admin", true], ["owner", "owner", false], ["admin", "moderator", true], ["admin", "admin", false], ["admin", "owner", false],
    ["moderator", "member", true], ["moderator", "moderator", false], ["moderator", "admin", false], ["member", "member", false],
  ]
  for (const [a, t, want] of actOn) check(`canActOn(${a}, ${t}) is ${want}`, canActOn(a, t) === want)
  check("canActOn with no role is false", !canActOn(null, "member") && !canActOn("owner", null))
  check("meetsRole compares by rank", meetsRole("admin", "moderator") && meetsRole("member", "member") && !meetsRole("member", "moderator") && !meetsRole(null, "member"))
  check("an owner may give admin, moderator and member", JSON.stringify(assignableRoles("owner")) === JSON.stringify(["admin", "moderator", "member"]))
  check("an admin may give moderator and member, not admin", JSON.stringify(assignableRoles("admin")) === JSON.stringify(["moderator", "member"]))
  check("a moderator and a member may give nothing", assignableRoles("moderator").length === 0 && assignableRoles("member").length === 0)
  check("allowedActions lists what can() allows", Object.keys(allowedActions("member")).sort().join() === [...memberSet].sort().join())

  console.log("\nWho hears about what")
  const kinds = NOTIFICATION_KINDS as readonly NotificationKind[]
  check("all: everything", kinds.every((k) => wantsNotification("all", k)))
  check("important: everything but reactions", kinds.every((k) => wantsNotification("important", k) === (k !== "reaction")))
  check("mentions: a mention, a reply, an admin message, their membership", kinds.every((k) => wantsNotification("mentions", k) === ["mention", "reply", "admin_message", "membership"].includes(k)))
  check("none: nothing", kinds.every((k) => !wantsNotification("none", k)))

  /* ── Access ──────────────────────────────────────────────────────────── */
  console.log("\nWho may see a space, a course or an event")
  const v = (o: Partial<{ role: Role | null; active: boolean; tierId: string | null; ownedProductIds: string[]; level: number }> = {}) => ({
    role: "member" as Role | null, active: true, tierId: null as string | null, ownedProductIds: [] as string[], level: 1, ...o,
  })
  const deny = (r: ReturnType<typeof evaluateAccess>) => {
    if (r.ok) return "ok"
    const no = r as { reason: string; need?: string }
    return `${no.reason}${no.need ? `:${no.need}` : ""}`
  }
  check("not active: not_member", deny(evaluateAccess({}, v({ active: false }))) === "not_member")
  check("no role: not_member", deny(evaluateAccess({}, v({ role: null }))) === "not_member")
  check("an empty rule: every active member", evaluateAccess({}, v()).ok && evaluateAccess(null, v()).ok)
  for (const staff of ["owner", "admin", "moderator"] as Role[]) check(`${staff}: always, whatever the rule`, evaluateAccess({ tierIds: ["t9"], minLevel: 9, roles: ["owner"] }, v({ role: staff })).ok)
  check("on the tier: in", evaluateAccess({ tierIds: ["t1", "t2"] }, v({ tierId: "t2" })).ok)
  check("off the tier: tier, naming one", deny(evaluateAccess({ tierIds: ["t1"] }, v({ tierId: "t3" }))) === "tier:t1")
  check("owns the product: in", evaluateAccess({ productIds: ["p1"] }, v({ ownedProductIds: ["p1"] })).ok)
  check("does not own it: product", deny(evaluateAccess({ productIds: ["p1"] }, v())) === "product:p1")
  check("a role list a member is not on: role", deny(evaluateAccess({ roles: ["moderator"] }, v())) === "role:moderator")
  check("tiers, products and roles are alternatives", evaluateAccess({ tierIds: ["t1"], productIds: ["p1"] }, v({ tierId: "x", ownedProductIds: ["p1"] })).ok)
  check("a level too low: level, naming it", deny(evaluateAccess({ minLevel: 3 }, v({ level: 2 }))) === "level:3")
  check("the level reached: in", evaluateAccess({ minLevel: 3 }, v({ level: 3 })).ok)
  check("minLevel is on top of the lists", deny(evaluateAccess({ tierIds: ["t1"], minLevel: 4 }, v({ tierId: "t1", level: 2 }))) === "level:4")
  check("a stored rule is cleaned: junk keys, bad roles and a level of 1 are dropped", JSON.stringify(parseAccessRule({ tierIds: ["a", 3, "a"], roles: ["admin", "king"], minLevel: 1, other: true })) === JSON.stringify({ tierIds: ["a"], roles: ["admin"] }))
  check("a rule that is not an object is open", isOpenRule("x" as never) && isOpenRule([] as never) && !isOpenRule({ minLevel: 2 }))

  /* ── Addresses ───────────────────────────────────────────────────────── */
  console.log("\nA community's address")
  check("slugify: plain words", slugify("Café Makers & Friends!") === "cafe-makers-and-friends")
  check("slugify: trims hyphens and collapses runs", slugify("--Hello   World--") === "hello-world")
  check("slugify: at most 48, never ending in a hyphen", slugify("a".repeat(47) + " b c").length <= 48 && !slugify("a".repeat(47) + " b c").endsWith("-"))
  check("valid: makers", validSlug("makers") && validSlug("a1b") && validSlug("x".repeat(48)))
  for (const bad of ["ab", "x".repeat(49), "Makers", "-makers", "makers-", "ma--kers", "ma kers", "admin", "storelib", "new"]) check(`not valid: "${bad.slice(0, 20)}"`, !validSlug(bad))
  check("a space may be one character", validSpaceSlug("a") && !validSpaceSlug("A") && !validSpaceSlug(""))
  check("a suffix still fits", slugWithSuffix("x".repeat(48), 12).length === 48 && slugWithSuffix("makers", 2) === "makers-2")
  check("the reserved words include the sub pages", ["join", "about", "events", "members", "leaderboard"].every((w) => RESERVED_COMMUNITY_SLUGS.includes(w)))

  /* ── Limits ──────────────────────────────────────────────────────────── */
  console.log("\nHow long, how many, how often")
  check("posts: 10 per 10 minutes and 50 a day", JSON.stringify(RATE_LIMITS.post) === JSON.stringify([{ limit: 10, seconds: 600 }, { limit: 50, seconds: 86400 }]))
  check("comments: 30 per 10 minutes", JSON.stringify(RATE_LIMITS.comment) === JSON.stringify([{ limit: 30, seconds: 600 }]))
  check("reactions: 120 per 10 minutes", JSON.stringify(RATE_LIMITS.reaction) === JSON.stringify([{ limit: 120, seconds: 600 }]))
  check("chat: 30 a minute", JSON.stringify(RATE_LIMITS.chat) === JSON.stringify([{ limit: 30, seconds: 60 }]))
  check("reports: 10 an hour; invites: 50 a day", JSON.stringify(RATE_LIMITS.report) === JSON.stringify([{ limit: 10, seconds: 3600 }]) && JSON.stringify(RATE_LIMITS.invite) === JSON.stringify([{ limit: 50, seconds: 86400 }]))
  check("each bucket has its own name", rateBucket("post") === "community-post" && rateBucket("chat") === "community-chat")
  check("at most 10 mentions a post", MAX_MENTIONS_PER_POST === 10 && extractMentions(Array.from({ length: 15 }, (_, i) => `@user${i}`).join(" ")).length === 10)
  check("mentions: once each, lowercased, no @everyone, not an email", JSON.stringify(extractMentions("hi @Ana and @ana, @everyone, mail me at bo@x.com")) === JSON.stringify(["ana"]))
  check("@everyone is seen", mentionsEveryone("hey @everyone") && !mentionsEveryone("me@everyone.com"))
  check("fits trims and counts", fits("  ", "tagline") && !fits("", "communityName") && fits("x".repeat(80), "communityName") && !fits("x".repeat(81), "communityName"))
  check("the default levels are the six named in the architecture", JSON.stringify(DEFAULT_LEVELS.map((l) => [l.level, l.name, l.minPoints])) === JSON.stringify([[1, "Newcomer", 0], [2, "Regular", 20], [3, "Contributor", 60], [4, "Insider", 150], [5, "Core", 400], [6, "Pillar", 1000]]))
  check("the default spaces: General, Announcements (admins post), Introductions", DEFAULT_SPACES.map((s) => `${s.name}:${s.kind}:${s.postRole}`).join() === "General:feed:member,Announcements:announcements:admin,Introductions:feed:member")

  /* ── Words ───────────────────────────────────────────────────────────── */
  console.log("\nCounts, prices and times")
  check("compact counts round down", compactCount(999) === "999" && compactCount(1000) === "1k" && compactCount(1290) === "1.2k" && compactCount(12900) === "12k" && compactCount(1_250_000) === "1.2M" && compactCount(-3) === "0")
  check("member counts", memberCountLabel(1) === "1 member" && memberCountLabel(0) === "0 members" && memberCountLabel(1200) === "1.2k members")
  check("prices", priceLine({ kind: "free" }) === "Free" && priceLine({ kind: "paid", billing: "recurring", monthlyCents: 1900 }) === "$19/month" && priceLine({ kind: "paid", billing: "recurring", yearlyCents: 19000 }) === "$190/year" && priceLine({ kind: "paid", billing: "one_time", priceCents: 4900 }) === "$49")
  check("a paid tier with no price says nothing rather than Free", priceLine({ kind: "paid" }) === "")
  check("the one button", joinButtonLabel({ isMember: true }) === "Open community" && joinButtonLabel({ isMember: false, approvalRequired: true, priceLine: "$19/month" }) === "Request to join" && joinButtonLabel({ isMember: false, priceLine: "Free" }) === "Join for free" && joinButtonLabel({ isMember: false, priceLine: "$19/month" }) === "Join for $19/month" && joinButtonLabel({ isMember: false, pending: true }) === "Request sent")
  const now = Date.parse("2026-10-03T12:00:00Z")
  check("relative times", relativeTime("2026-10-03T11:59:40Z", now) === "just now" && relativeTime("2026-10-03T11:55:00Z", now) === "5m" && relativeTime("2026-10-03T09:00:00Z", now) === "3h" && relativeTime("2026-10-01T12:00:00Z", now) === "2d" && relativeTime("2026-03-04T12:00:00Z", now, "UTC") === "Mar 4" && relativeTime("2025-03-04T12:00:00Z", now, "UTC") === "Mar 4, 2025")
  const t = eventTime("2026-10-06T18:00:00Z", "2026-10-06T19:00:00Z", { timeZone: "UTC" })
  check("an event in the viewer's zone, start to end", t.startsWith("Tue, Oct 6, 6:00 PM to 7:00 PM") && !/—|–/.test(t), t)
  check("the same event in another zone", eventTime("2026-10-06T18:00:00Z", null, { timeZone: "Asia/Tokyo" }).startsWith("Wed, Oct 7, 3:00 AM"))
  check("the calendar chip", JSON.stringify(eventDateBadge("2026-10-06T18:00:00Z", "UTC")) === JSON.stringify({ month: "Oct", day: "6", weekday: "Tue" }))

  /* ── Membership against an in memory database ────────────────────────── */
  console.log("\nGranting, revoking and reconciling")
  const C = "c0000000-0000-4000-8000-000000000001"
  const U = "u0000000-0000-4000-8000-000000000001"
  const OWNER = "u0000000-0000-4000-8000-0000000000aa"
  const PAID_TIER = "t0000000-0000-4000-8000-000000000001"
  const FREE_TIER = "t0000000-0000-4000-8000-000000000002"
  const TIER_PRODUCT = "p0000000-0000-4000-8000-000000000001"
  const COURSE = "p0000000-0000-4000-8000-000000000002"
  const world = (o: { access?: string } = {}) =>
    fakeDb(
      {
        communities: [{ id: C, owner_user_id: OWNER, access: o.access ?? "paid", slug: "makers", name: "Makers" }],
        community_tiers: [
          { id: PAID_TIER, community_id: C, kind: "paid", product_id: TIER_PRODUCT, position: 1, is_default: false, archived_at: null },
          { id: FREE_TIER, community_id: C, kind: "free", product_id: null, position: 0, is_default: true, archived_at: null },
        ],
        community_access_products: [
          { community_id: C, tier_id: PAID_TIER, product_id: TIER_PRODUCT },
          { community_id: C, tier_id: PAID_TIER, product_id: COURSE },
        ],
        community_members: [{ id: "m-owner", community_id: C, user_id: OWNER, role: "owner", source: "owner", status: "active", tier_id: null, banned_at: null }],
        entitlements: [],
        memberships: [],
        community_audit_log: [],
        community_activity: [],
      },
      { unique: { community_members: [["community_id", "user_id"]] } },
    )
  const memberRow = (db: ReturnType<typeof fakeDb>, userId = U) => db.tables.community_members.filter((m) => m.user_id === userId)

  {
    const db = world()
    const a = await grantMembership(db, { communityId: C, userId: U, source: "free", tierId: FREE_TIER, actorId: U })
    const b = await grantMembership(db, { communityId: C, userId: U, source: "free", tierId: FREE_TIER, actorId: U })
    check("a free join makes one active row", a?.status === "active" && memberRow(db).length === 1)
    check("and joining again is the same row, one 'joined'", b?.id === a?.id && db.tables.community_activity.filter((x) => x.kind === "joined" && x.user_id === U).length === 1)
    check("the join is in the audit log", db.tables.community_audit_log.some((x) => x.action === "member.joined" && x.target_id === U))
    await grantMembership(db, { communityId: C, userId: U, source: "manual", role: "moderator" })
    await grantMembership(db, { communityId: C, userId: U, source: "free", role: "member" })
    check("a role is raised and never lowered by a grant", memberRow(db)[0].role === "moderator")
    await grantMembership(db, { communityId: C, userId: U, source: "free", status: "pending", requestNote: "hi" })
    check("a request never turns an active member back into one", memberRow(db)[0].status === "active")
  }
  {
    const db = world()
    await grantMembership(db, { communityId: C, userId: U, source: "free" })
    await revokeMembership(db, { communityId: C, userId: U, status: "banned", reason: "spam", actorId: OWNER })
    const again = await grantMembership(db, { communityId: C, userId: U, source: "invite" })
    check("a banned member is not brought back by a grant", again?.status === "banned" && memberRow(db)[0].banned_at)
    const forced = await grantMembership(db, { communityId: C, userId: U, source: "manual", force: true, actorId: OWNER })
    check("an admin's force brings them back, ban cleared", forced?.status === "active" && forced?.banned_at === null)
    check("the ban and the 'left' are written down", db.tables.community_audit_log.some((x) => x.action === "member.banned" && x.reason === "spam") && db.tables.community_activity.some((x) => x.kind === "left"))
    const ownerAfter = await revokeMembership(db, { communityId: C, userId: OWNER, status: "removed", reason: "x" })
    check("the owner is never revoked", ownerAfter?.status === "active" && ownerAfter?.role === "owner")
  }
  {
    const db = world()
    db.tables.entitlements.push({ buyer_id: U, product_id: TIER_PRODUCT })
    const row = await reconcileAccess(db, C, U)
    check("owning the tier's product lets a non member in, as a purchase of that tier", row?.status === "active" && row?.source === "purchase" && row?.tier_id === PAID_TIER && row?.source_product_id === TIER_PRODUCT)
    db.tables.entitlements.length = 0
    const after = await reconcileAccess(db, C, U)
    check("the product gone (refund): expired, not removed", after?.status === "expired" && memberRow(db).length === 1)
    check("and the expiry is in the audit log", db.tables.community_audit_log.some((x) => x.action === "member.expired"))
    db.tables.entitlements.push({ buyer_id: U, product_id: COURSE })
    const back = await reconcileAccess(db, C, U)
    check("owning another product that grants the tier brings them back, as 'product'", back?.status === "active" && back?.source === "product")
  }
  {
    const db = world({ access: "free" })
    await grantMembership(db, { communityId: C, userId: U, source: "free", tierId: FREE_TIER })
    db.tables.memberships.push({ id: "ms1", buyer_id: U, product_id: TIER_PRODUCT, status: "active", current_period_end: null, past_due_since: null })
    const up = await syncCommunityAccessForMembership(db, { product_id: TIER_PRODUCT, buyer_id: U }, { fresh: true })
    check("a free member who subscribes moves to the paid tier", up === 1 && memberRow(db)[0].tier_id === PAID_TIER && memberRow(db)[0].source === "subscription" && memberRow(db)[0].source_membership_id === "ms1")
    db.tables.memberships[0].status = "canceled"
    db.tables.memberships[0].current_period_end = new Date(Date.now() + 86_400_000).toISOString()
    await syncCommunityAccessForMembership(db, { product_id: TIER_PRODUCT, buyer_id: U })
    check("cancelled with the period still running: still in", memberRow(db)[0].status === "active" && memberRow(db)[0].tier_id === PAID_TIER)
    db.tables.memberships[0].status = "expired"
    await syncCommunityAccessForMembership(db, { product_id: TIER_PRODUCT, buyer_id: U })
    check("ended, in a free community: back on the free tier, still a member", memberRow(db)[0].status === "active" && memberRow(db)[0].tier_id === FREE_TIER && memberRow(db)[0].source === "free")
  }
  {
    const db = world()
    db.tables.memberships.push({ id: "ms2", buyer_id: U, product_id: TIER_PRODUCT, status: "past_due", current_period_end: null, past_due_since: new Date(Date.now() - 3 * 86_400_000).toISOString() })
    await syncCommunityAccessForMembership(db, { product_id: TIER_PRODUCT, buyer_id: U }, { fresh: true })
    check("past due within the grace: in", memberRow(db)[0]?.status === "active")
    db.tables.memberships[0].past_due_since = new Date(Date.now() - 8 * 86_400_000).toISOString()
    await syncCommunityAccessForMembership(db, { product_id: TIER_PRODUCT, buyer_id: U })
    check("past the 7 day grace, in a paid community: expired", memberRow(db)[0]?.status === "expired")
  }
  {
    const db = world()
    db.tables.entitlements.push({ buyer_id: U, product_id: TIER_PRODUCT })
    await reconcileAccess(db, C, U)
    await revokeMembership(db, { communityId: C, userId: U, status: "cancelled", reason: "left", actorId: U })
    const visit = await reconcileAccess(db, C, U)
    check("a member who left is not pulled back in by a visit", visit?.status === "cancelled")
    await syncCommunityAccessForEntitlement(db, { userId: U, productId: TIER_PRODUCT, orderId: "o2", granted: true })
    check("a new purchase brings them back", memberRow(db)[0].status === "active" && memberRow(db)[0].source_order_id === "o2")
  }
  {
    const db = world()
    db.tables.entitlements.push({ buyer_id: OWNER, product_id: TIER_PRODUCT })
    const n = await syncCommunityAccessForEntitlement(db, { userId: OWNER, productId: TIER_PRODUCT, granted: false })
    check("the owner is never touched by billing", n === 0 && memberRow(db, OWNER)[0].role === "owner" && memberRow(db, OWNER)[0].status === "active")
    check("no buyer, nothing to do", (await syncCommunityAccessForMembership(db, { product_id: TIER_PRODUCT, buyer_id: null })) === 0)
  }
  {
    const notThere = { code: "42P01", message: 'relation "public.community_members" does not exist' }
    const db = fakeDb({}, { failWith: { community_members: notThere, community_access_products: notThere } })
    let threw = false
    let answers: unknown[] = []
    try {
      answers = [
        await grantMembership(db, { communityId: C, userId: U, source: "free" }),
        await reconcileAccess(db, C, U),
        await revokeMembership(db, { communityId: C, userId: U, status: "expired", reason: "x" }),
        await syncCommunityAccessForEntitlement(db, { userId: U, productId: TIER_PRODUCT, granted: true }),
      ]
    } catch {
      threw = true
    }
    check("before part 81 has run: nothing throws, every answer is empty", !threw && JSON.stringify(answers) === JSON.stringify([null, null, null, 0]))
  }

  console.log("\nThe job queue")
  check("a failed job waits longer each time, at most an hour", jobBackoffMs(1) === 60_000 && jobBackoffMs(2) === 120_000 && jobBackoffMs(20) === 3_600_000)
  check("and is given up after five attempts, as the claim function does", JOB_MAX_ATTEMPTS === 5)

  /* ── The SQL part ────────────────────────────────────────────────────── */
  console.log("\nPart 81, the database")
  const P = "supabase/sql/run-now/81_communities.sql"
  const sql = read(P)
  const lines = sql.split("\n").filter(Boolean)
  check("it is the next part, and its migration is a byte for byte copy", read("supabase/migrations/20261101_communities.sql") === sql)
  check("line 1 is a plain summary that says it is safe to run again", /^\/\* .*Safe to run again\. \*\/$/.test(lines[0]))
  check("one statement per line, no -- comments", lines.slice(1).every((l) => l.trim().endsWith(";")) && !/^\s*--/m.test(sql) && !lines.slice(1).some((l) => / -- /.test(l)))
  check("the last line reloads the schema", lines[lines.length - 1] === "notify pgrst, 'reload schema';")
  check("safe twice: every create checks first", !/CREATE TABLE (?!IF NOT EXISTS)/.test(sql) && !/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(sql) && !/CREATE FUNCTION/.test(sql) && !/CREATE TRIGGER (?!\w+_keep_deleted)/.test(sql.replace(/CREATE OR REPLACE TRIGGER/g, "")) && !/CREATE POLICY/.test(sql.replace(/DROP POLICY IF EXISTS "([^"]+)" ON ([\w.]+); CREATE POLICY "\1"/g, "")))
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1])
  const expected = ["platform_flags", "communities", "community_tiers", "community_access_products", "community_members", "community_spaces", "community_feed_posts", "community_feed_comments", "community_reactions", "community_bookmarks", "community_polls", "community_poll_options", "community_poll_votes", "community_reports", "community_audit_log", "community_invites", "community_invite_uses", "community_courses", "community_events", "community_event_rsvps", "community_messages", "community_space_reads", "community_levels", "community_point_events", "community_badges", "community_member_badges", "community_activity", "community_notifications", "community_jobs", "community_daily_stats", "media_videos", "media_video_events"]
  check("every table in the architecture is made", expected.every((t) => tables.includes(t)) && tables.length === expected.length, tables.filter((t) => !expected.includes(t)).join(","))
  check("the old community_posts and community_comments are not touched", !/public\.community_posts\b|public\.community_comments\b/.test(sql))
  const revoke = sql.match(/^REVOKE ALL ON (public\.platform_flags[^;]+) FROM anon, authenticated;$/m)?.[1] ?? ""
  for (const t of tables) check(`${t}: row level security on and nothing for visitors`, sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`) && revoke.split(", ").includes(`public.${t}`))
  const grants = [...sql.matchAll(/^GRANT (?!EXECUTE)[^;]+;$/gm)].map((m) => m[0])
  check("the only reads granted: a community's public columns, chat and own notifications", grants.length === 2 && grants.some((g) => g.startsWith("GRANT SELECT (id, slug, name, tagline, description, logo_url, cover_url, visibility, access, status, category, language, member_count, post_count, creator_id, created_at) ON public.communities TO anon, authenticated;")) && grants.includes("GRANT SELECT ON public.community_messages, public.community_notifications TO authenticated;"), grants.join(" | "))
  check("no write is ever granted", !/GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*TO (anon|authenticated)/.test(sql))
  const policies = [...sql.matchAll(/CREATE POLICY "([^"]+)" ON public\.(\w+) FOR (\w+) TO ([\w, ]+) USING \(([^;]+)\); END/g)].map((m) => ({ name: m[1], table: m[2], cmd: m[3], to: m[4], using: m[5] }))
  check("three policies, all SELECT", policies.length === 3 && policies.every((p) => p.cmd === "SELECT"))
  check("a community is public only published, public or unlisted, not deleted, not suspended", policies.some((p) => p.table === "communities" && p.name === "storelib public community reads" && p.using === "status = 'published' AND visibility IN ('public', 'unlisted') AND deleted_at IS NULL AND suspended_at IS NULL"))
  check("chat through community_can_read_space", policies.some((p) => p.table === "community_messages" && p.name === "storelib members read chat" && p.to === "authenticated" && p.using === "public.community_can_read_space(space_id)"))
  check("a member's own notifications only", policies.some((p) => p.table === "community_notifications" && p.to === "authenticated" && p.using === "user_id = (SELECT auth.uid())"))
  const fns = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([^)]*)\) RETURNS ([^$]*) AS \$f\$/g)].map((m) => ({ name: m[1], definer: m[3].includes("SECURITY DEFINER SET search_path = public") }))
  const wanted = ["community_touch_updated_at", "community_member_count", "community_post_count", "community_comment_count", "community_reaction_count", "community_going_count", "community_vote_count", "community_points_apply", "community_audit_append_only", "community_cast_vote", "community_rsvp", "community_redeem_invite", "community_award_points", "community_claim_jobs", "community_leaderboard", "community_role_of", "community_can_read_space"]
  check("every function in the architecture is made", wanted.every((w) => fns.some((f) => f.name === w)), wanted.filter((w) => !fns.some((f) => f.name === w)).join(","))
  check("every function is SECURITY DEFINER with search_path public", fns.every((f) => f.definer) && fns.length === wanted.length)
  const revokeFns = sql.match(/^REVOKE ALL ON FUNCTION ([^;]+) FROM PUBLIC, anon, authenticated;$/m)?.[1] ?? ""
  check("every function is taken from the public and visitors", wanted.every((w) => revokeFns.includes(`public.${w}(`)))
  check("the service role may run them all", (sql.match(/^GRANT EXECUTE ON FUNCTION ([^;]+) TO service_role;$/m)?.[1] ?? "") === revokeFns)
  check("and signed in people only community_can_read_space", [...sql.matchAll(/GRANT EXECUTE ON FUNCTION ([^;]+) TO authenticated;/g)].map((m) => m[1]).join() === "public.community_can_read_space(uuid)")
  for (const trig of ["community_members_count", "community_feed_posts_count", "community_feed_comments_count", "community_reactions_count", "community_event_rsvps_count", "community_poll_votes_count", "community_point_events_apply", "community_audit_log_append_only", "communities_touch_updated_at", "community_members_touch_updated_at"])
    check(`trigger ${trig}`, new RegExp(`CREATE OR REPLACE TRIGGER ${trig} `).test(sql))
  check("member_count counts active rows only", /IF OLD\.status = 'active' THEN UPDATE public\.communities SET member_count = greatest\(member_count - 1, 0\)/.test(sql) && /IF NEW\.status = 'active' THEN UPDATE public\.communities SET member_count = member_count \+ 1/.test(sql))
  check("the audit log refuses update and delete", /BEFORE UPDATE OR DELETE ON public\.community_audit_log FOR EACH ROW EXECUTE FUNCTION public\.community_audit_append_only\(\)/.test(sql) && /RAISE EXCEPTION 'community_audit_log is append only/.test(sql))
  check("  except clearing the community when one is deleted for good", /NEW\.community_id IS NULL AND \(to_jsonb\(NEW\) - 'community_id'\) = \(to_jsonb\(OLD\) - 'community_id'\)/.test(sql))
  const keys: [string, RegExp][] = [
    ["a member once per community", /CONSTRAINT community_members_once UNIQUE \(community_id, user_id\)/],
    ["points once per key", /CONSTRAINT community_point_events_once UNIQUE \(community_id, user_id, source_key\)/],
    ["a reaction once", /CONSTRAINT community_reactions_once UNIQUE \(target_type, target_id, user_id, kind\)/],
    ["an invite used once per person", /community_invite_uses \([^;]*PRIMARY KEY \(invite_id, user_id\)/],
    ["one RSVP per person per event", /community_event_rsvps \([^;]*PRIMARY KEY \(event_id, user_id\)/],
    ["one vote per option per person", /community_poll_votes \([^;]*PRIMARY KEY \(option_id, user_id\)/],
    ["a notification once per dedupe key", /CONSTRAINT community_notifications_dedupe_key UNIQUE \(dedupe_key\)/],
    ["a job once per idempotency key", /CONSTRAINT community_jobs_idempotency_key UNIQUE \(idempotency_key\)/],
    ["a video webhook once", /media_video_events \([^;]*PRIMARY KEY \(provider, event_id\)/],
    ["one open report per person per target", /CREATE UNIQUE INDEX IF NOT EXISTS community_reports_one_open ON public\.community_reports \(reporter_id, target_type, target_id\) WHERE status IN \('open', 'reviewing'\);/],
    ["one default tier per community", /CREATE UNIQUE INDEX IF NOT EXISTS community_tiers_one_default ON public\.community_tiers \(community_id\) WHERE is_default;/],
    ["a product sells one tier", /CONSTRAINT community_tiers_product_key UNIQUE \(product_id\)/],
    ["an address once", /CONSTRAINT communities_slug_key UNIQUE \(slug\)/],
  ]
  for (const [what, re] of keys) check(`once: ${what}`, re.test(sql))
  check("the slug CHECK is the same shape as slug.ts", sql.includes("char_length(slug) BETWEEN 3 AND 48 AND slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'") && SLUG_PATTERN.source === "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")
  check("lengths match: name 80, tagline 160, post 20000, comment 5000, chat 4000, bio 280, event 140", sql.includes("char_length(name) BETWEEN 1 AND 80") && LENGTHS.communityName.max === 80 && sql.includes("char_length(tagline) <= 160") && sql.includes("char_length(body) <= 5000") && LENGTHS.commentBody.max === 5000 && sql.includes("char_length(body) <= 4000") && LENGTHS.messageBody.max === 4000 && sql.includes("char_length(bio) <= 280") && LENGTHS.bio.max === 280 && sql.includes("char_length(title) BETWEEN 1 AND 140"))
  check("every role and notification kind in TypeScript is one the CHECK allows", ROLES.every((r) => sql.includes(`'${r}'`)) && NOTIFICATION_KINDS.every((k) => sql.includes(`'${k}'`)))
  check("products.community_id, guarded on products", /IF to_regclass\('public\.products'\) IS NULL THEN RAISE NOTICE[^;]*; RETURN; END IF; ALTER TABLE public\.products ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public\.communities\(id\) ON DELETE SET NULL; CREATE INDEX IF NOT EXISTS products_community_idx/.test(sql))
  check("the communities switch is seeded off, and never overwritten", /INSERT INTO public\.platform_flags \(key, enabled, note\) VALUES \('communities', false, [^)]*\) ON CONFLICT \(key\) DO NOTHING;/.test(sql))
  check("chat and the bell join realtime only when the publication is there and ours", /FROM pg_publication WHERE pubname = 'supabase_realtime'/.test(sql) && /pg_has_role\(current_user, v_owner, 'MEMBER'\)/.test(sql) && /FROM pg_publication_tables WHERE pubname = 'supabase_realtime'/.test(sql))
  check("deleted rows are kept when part 66 is there", /IF to_regprocedure\('public\.storelib_keep_deleted_row\(\)'\) IS NULL THEN/.test(sql) && ["communities", "community_tiers", "community_members", "community_feed_posts", "community_events"].every((t) => sql.includes(`CREATE TRIGGER ${t}_keep_deleted AFTER DELETE ON public.${t}`)))
  check("an RSVP locks the event and waits when it is full", /FROM public\.community_events WHERE id = p_event FOR UPDATE/.test(sql) && /THEN 'going' ELSE 'waitlist' END/.test(sql))
  check("an invite is locked, checked and counted only on a new use", /FROM public\.community_invites WHERE token_hash = p_token_hash FOR UPDATE/.test(sql) && /ON CONFLICT \(invite_id, user_id\) DO NOTHING; v_new := FOUND; IF v_new THEN UPDATE public\.community_invites SET uses = uses \+ 1/.test(sql))
  check("jobs are claimed without two workers taking one", /FOR UPDATE SKIP LOCKED/.test(sql) && /OR \(j\.state = 'running' AND j\.lease_until < now\(\)\)/.test(sql))
  const readme = read("supabase/sql/run-now/README.md")
  const row = readme.split("\n").find((l) => l.startsWith("| `81_communities.sql` |")) ?? ""
  check("the README names it, with its lines and bytes", row.endsWith(`| ${sql.split("\n").length - 1} | ${Buffer.byteLength(sql).toLocaleString("en-US")} |`), row.slice(-30))
  check("the check after has its column", /as p81_communities\b/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("and the built files carry it", read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 81_communities.sql"))

  /* ── The switch ──────────────────────────────────────────────────────── */
  console.log("\nThe communities switch")
  const flags = read("lib/platform/flags.ts")
  check("platform flags are read on the server only, cached ten seconds, off when unsure", /^import "server-only"/m.test(flags) && /FLAG_CACHE_MS = 10_000/.test(flags) && /export async function readFlag\(key: PlatformFlagKey\): Promise<boolean>/.test(flags) && /export async function setFlag\(key: PlatformFlagKey, enabled: boolean, by: string\)/.test(flags) && /export function clearFlagCache\(\)/.test(flags) && /PLATFORM_FLAG_KEYS = \["communities"\] as const/.test(flags))
  const flag = read("lib/communities/flag.ts")
  check("requireCommunitiesOn answers 404 communities_off", /^import "server-only"/m.test(flag) && /\{ error: "communities_off" \}, \{ status: 404/.test(flag) && /export async function communitiesEnabled\(\): Promise<boolean>/.test(flag))
  const pub = code("app/api/platform/flags/route.ts")
  check("GET /api/platform/flags answers { communities } cached 15 seconds at the edge", /export async function GET\(\)/.test(pub) && /\{ communities \}/.test(pub) && /"public, s-maxage=15, stale-while-revalidate=60"/.test(pub))
  const hook = read("lib/platform/use-flags.ts")
  check("useCommunitiesEnabled is a client hook that imports no server code", /^"use client"/.test(hook) && /export function useCommunitiesEnabled\(initial\?: boolean\): boolean/.test(hook) && !/server-only|next\/headers|lib\/platform\/flags|lib\/supabase|lib\/communities\/(flag|server)/.test(hook))
  const adminFlags = code("app/api/admin/flags/route.ts")
  check("POST /api/admin/flags is the admin's, and written to the audit trail as a flag", /export async function POST\(request: NextRequest\) \{\s*const denied = await requireAdmin\(\)\s*if \(denied\) return denied/.test(adminFlags) && /targetType: "flag"/.test(adminFlags) && /isPlatformFlagKey\(body\.key\)/.test(adminFlags) && /typeof body\.enabled !== "boolean"/.test(adminFlags))
  check("the admin audit trail names flags and communities", /targetType: [^\n]*"flag" \| "community"/.test(read("lib/admin/audit.ts")))
  const cron = code("app/api/cron/community/route.ts")
  /* Round 2: while off, the jobs that are not about a community (a product's followers, a membership's post) still run; every community job waits (tests/user-notifications.test.ts). */
  check("the cron checks CRON_SECRET, records its run and skips community jobs while off", /requireBearerSecret\(request, "CRON_SECRET"\)/.test(cron) && /recordCronRun\("\/api\/cron\/community"/.test(cron) && /\{ \.\.\.summary, skipped: "communities_off" \}/.test(cron) && /kinds: PLATFORM_JOB_KINDS/.test(cron) && /RUN_BUDGET_MS = 45_000/.test(cron) && cron.indexOf("requireBearerSecret") < cron.indexOf("communitiesEnabled()"))
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] }
  check("every five minutes in vercel.json and on the admin's list", vercel.crons.some((c) => c.path === "/api/cron/community" && c.schedule === "*/5 * * * *") && /\{ path: "\/api\/cron\/community", schedule: "\*\/5 \* \* \* \*"/.test(read("lib/admin/schema-expectations.ts")))
  const jobs = read("lib/communities/server/jobs/index.ts")
  check("the job registry has the recount handler", /JOB_HANDLERS: Partial<Record<JobKind, JobHandler>> = \{\s*recount,/.test(jobs) && existsSync("lib/communities/server/jobs/recount.ts"))

  /* ── Billing ─────────────────────────────────────────────────────────── */
  console.log("\nBilling tells communities, and can never be stopped by them")
  const hooks = code("lib/communities/server/payment-hooks.ts")
  const bodies = [...hooks.matchAll(/export async function (\w+)\([\s\S]*?\): Promise<void> \{\s*try \{[\s\S]*?await import\("\.\/membership"\)[\s\S]*?\} catch \(\w+\) \{[\s\S]*?\}\s*\}/g)].map((m) => m[1])
  check("each hook loads the community code when it runs and catches everything", bodies.join() === "communityAccessAfterMembership,communityAccessAfterEntitlement" && !/^import (?!"server-only")/m.test(hooks))
  const callers: [string, RegExp][] = [
    ["lib/memberships/sync.ts", /await quietly\("community access", \(\) => communityAccessAfterMembership\(admin, row, \{ fresh: changed\.includes\("access_on"\) \}\)\)/],
    ["lib/checkout/fulfil-payment.ts", /try \{\s*await communityAccessAfterEntitlement\(admin, \{ userId: buyerId, productId: g\.productId, orderId: g\.orderId, granted: true \}\)\s*\} catch/],
    ["app/api/checkout/process/route.ts", /try \{\s*await communityAccessAfterEntitlement\(admin, \{ userId: user\.id, productId: product\.id, orderId: order\.id, granted: true \}\)\s*\} catch/],
    ["app/api/checkout/quick-free/route.ts", /try \{\s*await communityAccessAfterEntitlement\(admin, \{ userId: user\.id, productId: product\.id, orderId: order\.id, granted: true \}\)\s*\} catch/],
    ["lib/stripe/refund-sync.ts", /try \{\s*await communityAccessAfterEntitlement\(db, \{ userId: row\.buyer_id, productId: row\.product_id, orderId: row\.id, granted: false \}\)\s*\} catch/],
  ]
  for (const [file, re] of callers) check(`${file} calls its hook inside a catch`, re.test(code(file)) && /from "@\/lib\/communities\/server\/payment-hooks"/.test(read(file)) && !/from "@\/lib\/communities\/server\/membership"/.test(read(file)))
  check("a refund's hook runs after the library row is deleted", (() => { const r = code("lib/stripe/refund-sync.ts"); return r.indexOf('from("entitlements").delete()') < r.indexOf("granted: false") })())
  check("quietly() in the membership sync catches", /const quietly = async \(what: string, fn: \(\) => Promise<unknown>\) => \{\s*try \{\s*await fn\(\)\s*\} catch/.test(code("lib/memberships/sync.ts")))

  /* ── Routing ─────────────────────────────────────────────────────────── */
  console.log("\n/community is the platform's")
  check("community is a route segment now, not an extra", RESERVED_ROOT_SEGMENTS.includes("community") && !RESERVED_ROOT_EXTRAS.includes("community") && isReservedRootSegment("Community"))
  const proxy = code("proxy.ts")
  check("the proxy keeps /community a platform page on every host", /const RESERVED_PATHS = \[[^\]]*"\/community",/.test(proxy))
  check("and a creator's own domain keeps crawlers off its copy", CUSTOM_DOMAIN_DISALLOW.includes("/community$") && CUSTOM_DOMAIN_DISALLOW.includes("/community/"))
  check("storelib.com's own community pages stay open to crawlers", !PLATFORM_DISALLOW.some((r) => r.startsWith("/community")))
  check("and lists it among the framable first segments", /FRAME_RESERVED_FIRST_SEGMENT = new Set\(\[[^\]]*"community"/.test(proxy))
  /* Round 2: still a platform path, but every community page is its own screen with the community's own bar, so Storelib's is not drawn there. */
  check("a platform path, drawn without the platform header (the community's own bar instead)", /p === "\/community" \|\|\s*p\.startsWith\("\/community\/"\)/.test(code("components/marketing/conditional-header.tsx")) && /function isOwnScreen\(p: string\): boolean \{[^}]*p\.startsWith\("\/community\/"\)/.test(code("components/marketing/conditional-header.tsx")))
  /* Round 7: the owner asked for the phone's tab bar inside a community, made the community's (tests/native-app-links.test.ts); /community alone still has none. */
  check("the buyer tab bar is inside a community, never on /community alone", buyerTabsBelongOn("/community/makers") && !buyerTabsBelongOn("/community") && buyerTabsBelongOn("/community/makers/events", { sellerStore: true }) && buyerTabsBelongOn("/account/library"))
  const index = code("app/(marketing)/community/page.tsx")
  check("/community: Explore's communities when on, a 404 when off, read per request", /await connection\(\)\s*if \(!\(await communitiesEnabled\(\)\)\) notFound\(\)\s*redirect\("\/explore\?type=communities"\)/.test(index))
  /* /app/community is the new creator area now (W1); what must be gone is the old feed it used to render. */
  check("the old creator feed is gone", !existsSync("components/app/community-feed.tsx") && (!existsSync("app/app/community/page.tsx") || !/community_posts|CommunityFeed/.test(code("app/app/community/page.tsx"))))
  check("the old buyer pages send to the library", ["app/dashboard/communities/page.tsx", "app/dashboard/communities/[creatorId]/page.tsx"].every((f) => /redirect\("\/account\/communities"\)/.test(code(f)) && !/community_posts|CommunityFeed/.test(code(f))))

  /* ── Copy and the client boundary ────────────────────────────────────── */
  console.log("\nCopy rules, and no server code in the browser")
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
  const mine = [
    ...walk("lib/communities"),
    "lib/platform/flags.ts",
    "lib/platform/use-flags.ts",
    "app/api/platform/flags/route.ts",
    "app/api/admin/flags/route.ts",
    "app/api/cron/community/route.ts",
    "app/(marketing)/community/page.tsx",
    P,
  ]
  const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
  check("no em dash and no banned word, in copy, comments or names", offenders.length === 0, offenders.join(", "))
  const pure = ["types", "permissions", "access", "slug", "format", "limits"].map((n) => `lib/communities/${n}.ts`)
  check("the pure modules import nothing from the server", pure.every((f) => !/server-only|next\/headers|next\/server|lib\/supabase|\/server\/|lib\/memberships\/(server|sync)|lib\/admin/.test(code(f))))
  check("every server module says server-only", walk("lib/communities/server").every((f) => /^import "server-only"/m.test(read(f))) && /^import "server-only"/m.test(flag))

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
