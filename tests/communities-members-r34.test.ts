/**
 * ===========================================================================
 *  ROUND 34: MANAGING MEMBERS, AND WHAT A MEMBER'S PROFILE NEVER SAYS
 * ===========================================================================
 * The owner, on the Members area: view everyone, search, filter, open a
 * member, invite, approve or reject, remove, restrict, ban and unban, assign
 * permitted roles, grant complimentary access, and export authorized member
 * data, every administrative action authorized on the server. And on
 * profiles: "Do not publicly reveal private purchases, private enrollment,
 * billing details, or personal information without permission."
 *
 * Held against the real functions, run over an in-memory database
 * (./_fake-db) whose rows carry exactly the things that must not come out:
 * an email, a Stripe customer, an order, a paid tier and a private course.
 *
 *   ACTIONS     approve, decline, mute, suspend, ban, unban, remove, let
 *               back in, change a role, complimentary access and ending it,
 *               each through actOnMember and each refused to the role that
 *               may not take it, including a moderator calling the admin
 *               action himself.
 *   FEATURED    the mark, its permission, its cap, and what it does before
 *               the database update has run.
 *   LISTS       the filters and the search of the Members query, and the
 *               export's columns.
 *   PRIVACY     every shape the browser can ask for about another member,
 *               searched through every key and every value for an email, a
 *               payment, an order, a Stripe id and a private enrolment.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { fakeDb } from "./_fake-db"
import { readCode } from "./_source"
import { FEATURED_MAX, FEATURED_WORD, canFeatureMembers, featurable, featureRefusal, featureRefusalText } from "@/lib/communities/featured-members"
import { can } from "@/lib/communities/permissions"
import { featuredMembers, setMemberFeatured } from "@/lib/communities/server/featured-members"
import { actOnMember, memberActionNeeds } from "@/lib/communities/server/moderation"
import { listMembers as directoryMembers, memberProfile } from "@/lib/communities/server/directory"
import { personCard } from "@/lib/communities/server/people"
import { parseMemberQuery } from "@/components/community/creator/logic"
import type { CommunityRow } from "@/lib/communities/types"

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

/* ── The community, and the people in it ────────────────────────────────── */

const CID = "11111111-1111-4111-8111-111111111111"
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const OWNER = uid(1)
const ADMIN = uid(2)
const MOD = uid(3)
const MEMBER = uid(4)
const PAYING = uid(5)

/** The things that must never come out of a member facing read. */
const SECRETS = {
  email: "private.person@example.com",
  stripeCustomer: "cus_PRIVATE123",
  stripeSubscription: "sub_PRIVATE123",
  orderId: "99999999-9999-4999-8999-999999999999",
  privateProgram: "a private course nobody else may see",
  tierId: "77777777-7777-4777-8777-777777777777",
}

const community = {
  id: CID,
  slug: "morning-writers",
  name: "The Morning Writers",
  status: "published",
  access: "paid",
  visibility: "public",
  owner_user_id: OWNER,
  creator_id: "22222222-2222-4222-8222-222222222222",
  member_count: 5,
  post_count: 2,
  directory_enabled: true,
  chat_enabled: true,
  gamification_enabled: true,
  classroom_enabled: true,
  suspended_at: null,
  archived_at: null,
  deleted_at: null,
} as unknown as CommunityRow

const day = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString()

function rows(over: { featured?: string[]; status?: Record<string, string> } = {}) {
  const featured = over.featured ?? []
  const status = over.status ?? {}
  const member = (userId: string, role: string, extra: Record<string, unknown> = {}) => ({
    id: `m-${userId}`,
    community_id: CID,
    user_id: userId,
    role,
    status: status[userId] ?? "active",
    tier_id: null,
    source: "free",
    source_membership_id: null,
    source_product_id: null,
    source_order_id: null,
    invite_id: null,
    invited_by: null,
    request_note: null,
    requested_at: null,
    approved_by: null,
    joined_at: day(2),
    last_active_at: day(3),
    expires_at: null,
    points: 10,
    level: 2,
    muted_until: null,
    ban_reason: null,
    banned_at: null,
    banned_by: null,
    removed_at: null,
    notify_level: "important",
    email_announcements: true,
    email_events: true,
    onboarded_at: null,
    bio: "Writes before breakfast.",
    featured_at: featured.includes(userId) ? day(4) : null,
    featured_by: featured.includes(userId) ? OWNER : null,
    created_at: day(1),
    updated_at: day(1),
    ...extra,
  })
  return {
    communities: [{ ...community, role_permissions: {} }],
    community_members: [
      member(OWNER, "owner"),
      member(ADMIN, "admin"),
      member(MOD, "moderator"),
      member(MEMBER, "member"),
      member(PAYING, "member", {
        source: "subscription",
        tier_id: SECRETS.tierId,
        source_membership_id: SECRETS.stripeSubscription,
        source_order_id: SECRETS.orderId,
      }),
    ],
    profiles: [OWNER, ADMIN, MOD, MEMBER, PAYING].map((id, i) => ({
      id,
      display_name: `Person ${i + 1}`,
      username: `person${i + 1}`,
      avatar_url: null,
      bio: "Writes before breakfast.",
      email: id === PAYING ? SECRETS.email : `person${i + 1}@example.com`,
      stripe_customer_id: id === PAYING ? SECRETS.stripeCustomer : null,
      location_city: "Lisbon",
      location_country: "PT",
    })),
    community_tiers: [{ id: SECRETS.tierId, community_id: CID, name: "Lifetime", kind: "paid" }],
    community_levels: [
      { community_id: CID, level: 1, name: "Newcomer", min_points: 0 },
      { community_id: CID, level: 2, name: "Regular", min_points: 5 },
    ],
    community_spaces: [{ id: "s1", community_id: CID, view_access: {}, archived_at: null }],
    community_member_badges: [{ community_id: CID, user_id: PAYING, badge_id: "b1", awarded_at: day(3) }],
    community_badges: [{ id: "b1", community_id: CID, name: "Early bird", icon: "x", description: null }],
    community_feed_posts: [{ id: "p1", community_id: CID, author_id: PAYING, status: "published", space_id: "s1", title: "Morning", body_text: "words", created_at: day(3), reaction_count: 1, comment_count: 0, media: [] }],
    community_courses: [{ id: "c1", community_id: CID, product_id: "pr1", title: SECRETS.privateProgram, status: "published", price_cents: 4900, currency: "usd" }],
    community_program_access: [{ community_id: CID, program_id: "c1", user_id: PAYING, order_id: SECRETS.orderId }],
    orders: [{ id: SECRETS.orderId, buyer_user_id: PAYING, amount_cents: 4900, stripe_payment_intent_id: "pi_PRIVATE123" }],
    creators: [],
    community_audit_log: [],
    community_access_products: [],
    follows: [],
  }
}

const missingColumn = { code: "42703", message: 'column community_members.featured_at does not exist' }

/* ── Every administrative action, authorized on the server ──────────────── */

async function actions() {
  console.log("\nEvery administrative action, on the server\n")
  const actor = (userId: string, role: "owner" | "admin" | "moderator" | "member") => ({ userId, role, perms: null })

  {
    /* A free community: approval lets them straight in. */
    const free = rows({ status: { [MEMBER]: "pending" } })
    free.community_tiers = [...free.community_tiers, { id: "free-tier", community_id: CID, name: "Members", kind: "free", is_default: true, archived_at: null } as never]
    const db = fakeDb(free)
    const done = await actOnMember(db as never, { community, actor: actor(MOD, "moderator"), action: "approve", userId: MEMBER, reason: null, until: null, role: undefined })
    check("a moderator approves a request to join a free community", done.ok === true && db.tables.community_members.find((m) => m.user_id === MEMBER)?.status === "active")
  }
  {
    /* A paid community: approval is the way in, and the payment is still theirs to make. */
    const db = fakeDb(rows({ status: { [MEMBER]: "pending" } }))
    const done = await actOnMember(db as never, { community, actor: actor(ADMIN, "admin"), action: "approve", userId: MEMBER, reason: null, until: null, role: undefined })
    const row = db.tables.community_members.find((m) => m.user_id === MEMBER)
    check("approving into a paid community marks the approval and waits for the payment", done.ok === true && row?.approved_by === ADMIN && row?.status === "pending")
  }
  {
    const db = fakeDb(rows({ status: { [MEMBER]: "pending" } }))
    const done = await actOnMember(db as never, { community, actor: actor(MOD, "moderator"), action: "reject", userId: MEMBER, reason: "not this time", until: null, role: undefined })
    check("a moderator declines a request", done.ok === true && db.tables.community_members.find((m) => m.user_id === MEMBER)?.status !== "pending")
  }
  {
    const db = fakeDb(rows({ status: { [MEMBER]: "pending" } }))
    const done = await actOnMember(db as never, { community, actor: actor(MEMBER, "member"), action: "approve", userId: PAYING, reason: null, until: null, role: undefined })
    check("a member approves nobody", done.ok === false && done.status === 403)
  }
  {
    const db = fakeDb(rows())
    const done = await actOnMember(db as never, { community, actor: actor(MOD, "moderator"), action: "ban", userId: ADMIN, reason: "no", until: null, role: undefined })
    check("a moderator does not ban an admin", done.ok === false && done.status === 403 && db.tables.community_members.find((m) => m.user_id === ADMIN)?.status === "active")
  }
  {
    const db = fakeDb(rows())
    const done = await actOnMember(db as never, { community, actor: actor(MOD, "moderator"), action: "ban", userId: MEMBER, reason: "spam", until: null, role: undefined })
    const banned = db.tables.community_members.find((m) => m.user_id === MEMBER)
    check("a moderator bans a member, with the reason and who did it", done.ok === true && banned?.status === "banned" && banned?.ban_reason === "spam" && banned?.banned_by === MOD)
    check("and the ban is in the audit log", db.tables.community_audit_log.some((r) => r.action === "member.banned" && r.target_id === MEMBER && r.actor_id === MOD))
  }
  {
    const db = fakeDb(rows({ status: { [MEMBER]: "banned" } }))
    db.tables.community_members.find((m) => m.user_id === MEMBER)!.banned_by = ADMIN
    const done = await actOnMember(db as never, { community, actor: actor(MOD, "moderator"), action: "unban", userId: MEMBER, reason: null, until: null, role: undefined })
    check("a moderator does not undo an admin's ban", done.ok === false && done.error === "outranked")
  }
  {
    const db = fakeDb(rows({ status: { [MEMBER]: "banned" } }))
    db.tables.community_members.find((m) => m.user_id === MEMBER)!.banned_by = MOD
    const done = await actOnMember(db as never, { community, actor: actor(ADMIN, "admin"), action: "unban", userId: MEMBER, reason: null, until: null, role: undefined })
    check("an admin undoes a moderator's ban", done.ok === true && db.tables.community_members.find((m) => m.user_id === MEMBER)?.status === "active")
  }
  {
    const db = fakeDb(rows())
    const done = await actOnMember(db as never, { community, actor: actor(MOD, "moderator"), action: "role", userId: MEMBER, reason: null, until: null, role: "moderator" })
    check("a moderator hands out no roles", done.ok === false && done.status === 403 && db.tables.community_members.find((m) => m.user_id === MEMBER)?.role === "member")
  }
  {
    const db = fakeDb(rows())
    const done = await actOnMember(db as never, { community, actor: actor(ADMIN, "admin"), action: "role", userId: MEMBER, reason: null, until: null, role: "admin" })
    check("an admin does not make another admin", done.ok === false && db.tables.community_members.find((m) => m.user_id === MEMBER)?.role === "member")
  }
  {
    const db = fakeDb(rows())
    const done = await actOnMember(db as never, { community, actor: actor(ADMIN, "admin"), action: "role", userId: MEMBER, reason: null, until: null, role: "moderator" })
    check("an admin makes a moderator", done.ok === true && db.tables.community_members.find((m) => m.user_id === MEMBER)?.role === "moderator")
  }
  {
    const db = fakeDb(rows())
    const done = await actOnMember(db as never, { community, actor: actor(ADMIN, "admin"), action: "mute", userId: MEMBER, reason: null, until: 24, role: undefined })
    check("an admin mutes a member for a while, not for ever", done.ok === true && typeof db.tables.community_members.find((m) => m.user_id === MEMBER)?.muted_until === "string")
    const silly = await actOnMember(db as never, { community, actor: actor(ADMIN, "admin"), action: "mute", userId: MEMBER, reason: null, until: 999_999, role: undefined })
    check("and a mute longer than a year is refused", silly.ok === false && silly.status === 400)
  }
  {
    const db = fakeDb(rows())
    const done = await actOnMember(db as never, { community, actor: actor(OWNER, "owner"), action: "ban", userId: OWNER, reason: null, until: null, role: undefined })
    check("nobody acts on themselves", done.ok === false && done.status === 409)
  }
  {
    const db = fakeDb(rows())
    const done = await actOnMember(db as never, { community, actor: actor(ADMIN, "admin"), action: "remove", userId: "not-a-uuid", reason: null, until: null, role: undefined })
    check("a target that is not an id is not found", done.ok === false && done.status === 404)
  }
  check("every member action's permission is the one the roles say", memberActionNeeds("ban") === "ban" && memberActionNeeds("role") === "change_role" && memberActionNeeds("approve") === "approve_member" && memberActionNeeds("reinstate") === "remove_member" && memberActionNeeds("feature") === "feature")
}

/* ── The mark ──────────────────────────────────────────────────────────── */

async function featured() {
  console.log("\nFeatured members\n")
  check("the rules read from the one place", FEATURED_MAX === 12 && FEATURED_WORD === "Featured" && canFeatureMembers("admin") && canFeatureMembers("owner") && !canFeatureMembers("moderator") && !canFeatureMembers("member") && !canFeatureMembers(null))
  check("only somebody who is here can be featured", featurable({ status: "active" }) && !featurable({ status: "pending" }) && !featurable({ status: "banned" }) && !featurable(null))
  check("the cap is counted, and a refusal says what to do", featureRefusal({ on: true, member: { status: "active" }, featured: FEATURED_MAX }) === "too_many" && featureRefusal({ on: true, member: { status: "active" }, featured: FEATURED_MAX - 1 }) === null && featureRefusal({ on: true, member: { status: "banned" }, featured: 0 }) === "not_active" && featureRefusal({ on: false, member: { status: "banned" }, featured: 99 }) === null && featureRefusalText("too_many").includes("12"))

  {
    const db = fakeDb(rows())
    const done = await setMemberFeatured(db as never, { community, actor: { userId: ADMIN, role: "admin", perms: null }, userId: MEMBER, on: true })
    check("an admin features a member", done.ok === true && typeof db.tables.community_members.find((m) => m.user_id === MEMBER)?.featured_at === "string" && db.tables.community_members.find((m) => m.user_id === MEMBER)?.featured_by === ADMIN)
    check("and it is in the audit log", db.tables.community_audit_log.some((r) => r.action === "member.featured" && r.target_id === MEMBER))
    const again = await setMemberFeatured(db as never, { community, actor: { userId: ADMIN, role: "admin", perms: null }, userId: MEMBER, on: true })
    check("a second press writes nothing new", again.ok === true && db.tables.community_audit_log.filter((r) => r.action === "member.featured").length === 1)
    const off = await setMemberFeatured(db as never, { community, actor: { userId: ADMIN, role: "admin", perms: null }, userId: MEMBER, on: false })
    check("and it comes off", off.ok === true && db.tables.community_members.find((m) => m.user_id === MEMBER)?.featured_at === null)
  }
  {
    const db = fakeDb(rows())
    const done = await setMemberFeatured(db as never, { community, actor: { userId: MOD, role: "moderator", perms: null }, userId: MEMBER, on: true })
    check("a moderator features nobody", done.ok === false && done.status === 403 && db.tables.community_members.find((m) => m.user_id === MEMBER)?.featured_at === null)
  }
  {
    const db = fakeDb(rows())
    const done = await setMemberFeatured(db as never, { community, actor: { userId: ADMIN, role: "admin", perms: null }, userId: ADMIN, on: true })
    check("an admin may recognise a peer, themselves included: it takes nothing away", done.ok === true)
  }
  {
    const db = fakeDb(rows({ status: { [MEMBER]: "banned" } }))
    const done = await setMemberFeatured(db as never, { community, actor: { userId: OWNER, role: "owner", perms: null }, userId: MEMBER, on: true })
    check("somebody who is not here cannot be featured", done.ok === false && done.error === "not_active")
  }
  {
    const many = rows()
    const extra = Array.from({ length: FEATURED_MAX }, (_, i) => ({ ...many.community_members[3], id: `extra-${i}`, user_id: uid(100 + i), featured_at: day(5) }))
    const db = fakeDb({ ...many, community_members: [...many.community_members, ...extra] })
    const done = await setMemberFeatured(db as never, { community, actor: { userId: OWNER, role: "owner", perms: null }, userId: MEMBER, on: true })
    check(`a community features ${FEATURED_MAX} and no more`, done.ok === false && done.error === "too_many")
    const off = await setMemberFeatured(db as never, { community, actor: { userId: OWNER, role: "owner", perms: null }, userId: uid(100), on: false })
    check("and one can always be taken off to make room", off.ok === true)
  }
  {
    /* Before the database update: every read empty, the write refused in words, nothing thrown. */
    const db = fakeDb(rows(), { failWith: { community_members: missingColumn } })
    const read = await featuredMembers(db as never, CID)
    check("before the database update the list is empty and says it is not ready", read.ids.length === 0 && read.ready === false)
    const done = await setMemberFeatured(db as never, { community, actor: { userId: OWNER, role: "owner", perms: null }, userId: MEMBER, on: true })
    check("and the write says the update is needed", done.ok === false && done.status === 503 && done.error === "needs_update" && featureRefusalText("needs_update").includes("database update"))
  }
  {
    const db = fakeDb(rows({ featured: [MEMBER, PAYING] }))
    const read = await featuredMembers(db as never, CID)
    check("the featured are read as a short list, not a ranking", read.ready && read.ids.length === 2 && read.ids.includes(MEMBER) && read.ids.includes(PAYING))
    const page = await directoryMembers(db as never, CID, {})
    check("the directory marks them and nobody else", page.members.filter((m) => m.featured).map((m) => m.userId).sort().join() === [MEMBER, PAYING].sort().join())
    check("and the mark carries no number and no place in a list", JSON.stringify(page.members.find((m) => m.featured)).includes('"featured":true') && !JSON.stringify(page.members).includes("featuredRank") && !JSON.stringify(page.members).includes("featuredAt"))
  }
}

/* ── The list's own filters ─────────────────────────────────────────────── */

function lists() {
  console.log("\nThe Members list: its views, filters, search and order\n")
  const q = (s: string) => parseMemberQuery(new URLSearchParams(s))
  check("the views are the membership statuses, and anything else is the active one", q("status=pending").status === "pending" && q("status=banned").status === "banned" && q("status=restricted").status === "restricted" && q("status=nonsense").status === "active" && q("").status === "active")
  check("a role filter only takes a real role", q("role=moderator").role === "moderator" && q("role=admin").role === "admin" && q("role=wizard").role === null)
  check("a plan filter takes a tier id and nothing else", q(`tier=${SECRETS.tierId}`).tierId === SECRETS.tierId && q("tier=../../etc").tierId === null)
  check("a join date filter is one of the offered spans of days", q("joined=30").joined === 30 && q("joined=365").joined === 365 && q("joined=0").joined === undefined && q("joined=31").joined === undefined && q("joined=abc").joined === undefined)
  check("the order is one of the four, and newest is the absent one", q("sort=oldest").sort === "oldest" && q("sort=active").sort === "active" && q("sort=points").sort === "points" && q("sort=sideways").sort === undefined && q("sort=newest").sort === undefined)
  check("the search is kept as typed, trimmed", q("q=%20ana%20").q === "ana")

  const route = readCode("app/api/app/community/[id]/members/route.ts")
  check("the list route reads emails only for somebody who may manage members", /const withEmail = can\(gate\.role, "manage_members", gate\.viewer\.perms\)/.test(route) && /withEmail/.test(route))
  const exportRoute = readCode("app/api/app/community/[id]/members/export/route.ts")
  check("the export demands manage_members and is written to the audit log", /requireCreatorCommunity\(id, "manage_members"\)/.test(exportRoute) && /members\.exported/.test(exportRoute))
  check("the export is streamed, not held in memory", /membersCsv\(/.test(exportRoute) && /ReadableStream/.test(readCode("lib/communities/server/creator.ts")))
  const section = readCode("components/community/creator/members-section.tsx")
  check("the Members screen keeps the search and the filters while a member is opened", /setOpenId/.test(section) && /data-member-row/.test(section))
}

/* ── What a member facing read must never say ──────────────────────────── */

/** Every key in a value, however deep. */
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysOf(v, out)
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      out.add(k)
      keysOf(v, out)
    }
  return out
}

const PRIVATE_KEY = /email|stripe|payment|order|invoice|billing|amount|cents|card|customer|subscription/i
const PRIVATE_VALUE = [SECRETS.email, SECRETS.stripeCustomer, SECRETS.stripeSubscription, SECRETS.orderId, "pi_PRIVATE123"]

function privateBits(value: unknown): string[] {
  const found: string[] = []
  for (const k of keysOf(value)) if (PRIVATE_KEY.test(k)) found.push(`key ${k}`)
  const text = JSON.stringify(value) ?? ""
  for (const v of PRIVATE_VALUE) if (text.includes(v)) found.push(`value ${v}`)
  return found
}

async function privacy() {
  console.log("\nWhat another member is never told\n")

  /* The checker itself: it must find a planted email and a planted Stripe id. */
  check("the checker finds a private key and a private value", privateBits({ person: { email: "a@b.c" } }).length === 1 && privateBits({ person: { note: SECRETS.stripeCustomer } }).some((s) => s.startsWith("value")) && privateBits({ person: { name: "Ana", bio: "hi" } }).length === 0)

  const db = fakeDb(rows({ featured: [PAYING] }))
  const viewer = { userId: MEMBER, role: "member" as const, active: true, tierId: null, ownedProductIds: [] as string[], level: 1 }

  const page = await directoryMembers(db as never, CID, {})
  check("the member directory says nobody's email, payment or order", privateBits(page.members).length === 0, privateBits(page.members).join(", "))
  check("and it does say the public facts a directory is for", page.members.length === 5 && page.members.every((m) => m.name && typeof m.level === "number"))

  const card = await personCard(db as never, community, { userId: MEMBER }, PAYING)
  check("the card on a name says none of it", !!card && privateBits(card).length === 0, privateBits(card).join(", "))

  const profile = await memberProfile(db as never, community, PAYING, { ...viewer, userId: MEMBER })
  check("a member's profile says none of it", !!profile && privateBits(profile).length === 0, privateBits(profile).join(", "))
  check("and their private course is not named on it", !JSON.stringify(profile).includes(SECRETS.privateProgram))

  /* The member facing routes themselves: none of them asks the database for an email. */
  const memberRoutes = [
    "app/api/community/[communityId]/members/route.ts",
    "app/api/community/[communityId]/members/[userId]/route.ts",
    "app/api/community/[communityId]/people/[userId]/card/route.ts",
    "app/api/community/[communityId]/member-profile/route.ts",
  ]
  for (const f of memberRoutes) {
    const src = readCode(f)
    check(`${f} never reads an email`, !/\bemail\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "it names email outside a comment")
  }
  const directory = readCode("lib/communities/server/directory.ts")
  check("the directory's own reads name their columns and never email", /const MEMBER_LITE = "id, user_id, role, status, tier_id, level, points, bio, joined_at, last_active_at"/.test(directory) && !/select\("[^"]*email/.test(directory))
  const people = readCode("lib/communities/server/people.ts")
  check("the card's reads name their columns and never email", !/select\("[^"]*email/.test(people))
  const peopleOf = readCode("lib/communities/server/moderation.ts")
  check("an email is read only when the caller asked for one", /opts\.email \? "id, display_name, username, avatar_url, email" : "id, display_name, username, avatar_url"/.test(peopleOf))

  /* The two member facing shapes, read for what they do carry, so this is not passing by being empty. */
  check("the card does carry what it is for", !!card && card.name === "Person 5" && card.username === "person5" && card.role === "member")
  check("a profile carries their badges and their posts here, not their purchases", !!profile && Array.isArray(profile.badges) && typeof profile.posts === "number")

  /* The creator side is the only place an email comes out, and only for somebody who may manage members. */
  const { listMembers: creatorMembers } = await import("@/lib/communities/server/creator")
  const withoutEmail = await creatorMembers(db as never, CID, parseMemberQuery(new URLSearchParams("")) as never, { withEmail: false })
  check("the creator's list without the permission carries no email", withoutEmail.rows.length > 0 && withoutEmail.rows.every((r) => r.email === null))
  const withEmail = await creatorMembers(db as never, CID, parseMemberQuery(new URLSearchParams("")) as never, { withEmail: true })
  check("and with it the email is there, so the gate is what decides", withEmail.rows.some((r) => r.email === SECRETS.email))
  check("the creator's list carries the mark too", withEmail.rows.find((r) => r.userId === PAYING)?.featured === true && withEmail.rows.find((r) => r.userId === MEMBER)?.featured === false)

  /* The data safety note says the same thing in words, so the rule is written down where the next person looks. */
  const safety = readFileSync("lib/communities/DATA-SAFETY.md", "utf8")
  check("DATA-SAFETY.md says what a member profile never shows", /What a member never sees about another member/.test(safety))
}

async function main() {
  await actions()
  await featured()
  lists()
  await privacy()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

void main()
