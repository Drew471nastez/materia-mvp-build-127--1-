/**
 * ===========================================================================
 *  COMMUNITIES: LEARN (round 13, asks 44 to 46)
 * ===========================================================================
 * The Classroom renamed Learn, its courses programs, and programs that open
 * at a level, free for members, or sold on their own in an embedded Stripe
 * checkout on the creator's connected account. Held from their inputs and
 * against an in memory database:
 *
 *   RULES       programMode and programGate: free, level, paid (bought or
 *               not), drafts, drip, the older tier rule, staff, visitors;
 *               the builder's input checks; prices; the old addresses.
 *   SERVER      programs read in both shapes (before and after part 102),
 *               cards with locks in words and real progress, buying once,
 *               the course player's question for a program's lesson, the
 *               attached course grant honouring a price, points once, the
 *               builder's create, update, reorder and delete.
 *   CHECKOUT    the session (stubbed Stripe): embedded, never redirecting,
 *               the server's price, the creator's account as destination
 *               and the platform's fee, no product in the metadata; every
 *               refusal; the grant from a paid session once, never for
 *               somebody else, never unpaid; a full refund locks it again.
 *   WIRING      routes check the switch and the member or the creator and
 *               limit writes; the webhook hands program sessions over before
 *               anything else reads them; proxy.ts sends /classroom on with a
 *               308; the nav says Learn; client modules import no server code.
 *   SQL         part 102 follows the run-now rules.
 *   COPY        no em dash and no banned word in this work.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { memDb, type MemDb } from "./_classroom-db"
import { stripComments } from "./_source"
import {
  accessForMode,
  centsFromTyped,
  checkProgramInput,
  learnAddressFor,
  programGate,
  programHref,
  programMode,
  programPrice,
  typedFromCents,
  type ProgramRule,
  type ProgramViewer,
} from "@/lib/communities/learn"
import {
  attachedCourseOpen,
  createProgram,
  deleteProgram,
  findProgram,
  grantProgram,
  listPrograms,
  onProgramProgress,
  programLessonLevel,
  readPrograms,
  reorderPrograms,
  updateProgram,
} from "@/lib/communities/server/learn"
import { confirmProgramCheckout, grantFromSession, isProgramSession, programCheckoutParams, revokeRefundedProgram, startProgramCheckout, type CheckoutDeps } from "@/lib/communities/server/learn-checkout"
import { communityGrantsCourse } from "@/lib/communities/server/classroom"
import { lessonContext, readCourseTree } from "@/lib/courses/server"
import { isEventsLibraryPath, isLearnLessonPath, isLearnLibraryPath, navEntries, sectionFromPath } from "@/components/community/member/nav"
import { lockHint } from "@/components/community/learn/model"
import type { Viewer } from "@/lib/communities/server/context"
import type { CommunityRow, MemberRow, Role } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const id = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`
const A = id(1)
const B = id(2)
const CREATOR = id(10)
const OWNER = id(11)
const ALICE = id(20) /* member of A, level 1 */
const BOB = id(21) /* member of B only */
const DANA = id(23) /* moderator of A */
const ERIN = id(24) /* member of A, level 3 */
const FREE = id(30) /* a free program */
const LEVEL = id(31) /* opens at level 3 */
const PAID = id(32) /* sold on its own, 4900 */
const DRAFT = id(33) /* a draft */
const ATTACHED = id(34) /* an attached course product, made paid in Learn */
const ATTACHED_ROW = id(35)
const COURSE_FREE = id(40)
const COURSE_PAID = id(41)
const COURSE_ATTACHED = id(42)
const LESSON_PAID_1 = id(50)
const LESSON_PAID_PREVIEW = id(51)
const LESSON_FREE = id(52)
const NOW = Date.parse("2026-10-05T12:00:00Z")
const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString()

function community(over: Partial<CommunityRow> = {}): CommunityRow {
  return {
    id: A, creator_id: CREATOR, owner_user_id: OWNER, slug: "makers", name: "Makers", tagline: null, description: null, logo_url: null, cover_url: null, cover_video_id: null,
    visibility: "public", access: "free", status: "published", category: null, language: "en", member_count: 4, post_count: 0, discovery_enabled: true, approval_required: false,
    default_role: "member", directory_enabled: true, classroom_enabled: true, events_enabled: true, chat_enabled: true, gamification_enabled: true, rules: [], faq: [], benefits: [], links: [],
    onboarding: {}, seo_title: null, seo_description: null, trending_score: 0, trending_at: null, platform_hidden: false, suspended_at: null, suspended_reason: null, archived_at: null,
    deleted_at: null, created_at: iso(NOW - 90 * DAY), updated_at: iso(NOW), ...over,
  } as CommunityRow
}

function member(communityId: string, userId: string, over: Partial<MemberRow> = {}): MemberRow {
  return {
    id: `${communityId.slice(-4)}${userId.slice(-8)}`, community_id: communityId, user_id: userId, status: "active", role: "member", tier_id: null, source: "free",
    source_membership_id: null, source_product_id: null, source_order_id: null, invite_id: null, invited_by: null, request_note: null, requested_at: null, approved_by: null,
    joined_at: iso(NOW - 10 * DAY), last_active_at: null, expires_at: null, points: 0, level: 1, muted_until: null, ban_reason: null, banned_at: null, banned_by: null, removed_at: null,
    notify_level: "important", email_announcements: true, email_events: true, onboarded_at: null, bio: null, created_at: iso(NOW - 10 * DAY), updated_at: iso(NOW), ...over,
  } as MemberRow
}

function viewer(m: MemberRow | null, over: Partial<Viewer> = {}): Viewer {
  const active = m?.status === "active"
  return {
    userId: m?.user_id ?? null, member: m, role: active ? (m?.role as Role) : null, active, status: m?.status ?? null, tierId: m?.tier_id ?? null, ownedProductIds: [], level: m?.level ?? 1,
    points: m?.points ?? 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...over,
  } as Viewer
}

const program = (pid: string, over: Record<string, unknown> = {}) => ({
  id: pid, community_id: A, product_id: null, course_id: null, title: "Program", summary: null, cover_url: null, status: "published", price_cents: null, currency: null, access: {}, drip_days: null, position: 0, added_at: iso(NOW - 30 * DAY), ...over,
})

const pointsRpc = (args: Record<string, any>, db: MemDb) => {
  const rows = (db.tables.community_point_events ??= [])
  if (rows.some((r) => r.community_id === args.p_community && r.user_id === args.p_user && r.source_key === args.p_source_key)) return { data: false, error: null }
  rows.push({ community_id: args.p_community, user_id: args.p_user, points: args.p_points, reason: args.p_reason, source_key: args.p_source_key })
  return { data: true, error: null }
}

function learnDb(extra: Record<string, any[]> = {}) {
  return memDb(
    {
      communities: [community(), community({ id: B, slug: "other", name: "Other", creator_id: id(12), owner_user_id: id(13) })],
      community_members: [member(A, ALICE), member(B, BOB), member(A, DANA, { role: "moderator" }), member(A, ERIN, { level: 3 }), member(A, OWNER, { role: "owner" })],
      community_levels: [{ community_id: A, level: 3, name: "Regular" }],
      community_courses: [
        program(FREE, { title: "Free program", course_id: COURSE_FREE, position: 0 }),
        program(LEVEL, { title: "Level program", access: { minLevel: 3 }, position: 1 }),
        program(PAID, { title: "Paid program", price_cents: 4900, currency: "usd", course_id: COURSE_PAID, position: 2, summary: "Throwing, trimming, glazing." }),
        program(DRAFT, { title: "Draft program", status: "draft", position: 3 }),
        program(ATTACHED_ROW, { product_id: ATTACHED, title: null, price_cents: 1500, currency: "usd", position: 4 }),
      ],
      products: [{ id: ATTACHED, title: "Glaze course", slug: "glaze", status: "published", type: "course", creator_id: CREATOR, thumbnail_url: "https://img.test/glaze.jpg" }],
      creators: [{ id: CREATOR, user_id: OWNER, slug: "maker", display_name: "Maker", stripe_account_id: "acct_123creator", subscription_plan_id: "pro" }],
      courses: [{ id: COURSE_FREE, product_id: null }, { id: COURSE_PAID, product_id: null }, { id: COURSE_ATTACHED, product_id: ATTACHED }],
      course_modules: [
        { id: id(60), course_id: COURSE_FREE, title: "Start", position: 0 },
        { id: id(61), course_id: COURSE_PAID, title: "Clay", position: 0 },
      ],
      course_lessons: [
        { id: LESSON_FREE, module_id: id(60), position: 0, duration_seconds: 300, title: "Hello" },
        { id: LESSON_PAID_1, module_id: id(61), position: 0, duration_seconds: 600, title: "Wedging" },
        { id: LESSON_PAID_PREVIEW, module_id: id(61), position: 1, duration_seconds: 120, title: "A look inside", is_preview: true },
      ],
      community_program_access: [],
      ...extra,
    },
    { rpc: { community_award_points: pointsRpc }, unique: { community_program_access: [["program_id", "user_id"], ["checkout_session_id"]] } },
  )
}

const alice = viewer(member(A, ALICE))
const erin = viewer(member(A, ERIN, { level: 3 }))
const dana = viewer(member(A, DANA, { role: "moderator" }))

function fakeStripe(over: Partial<Record<string, any>> = {}) {
  const calls: any[] = []
  const sessions = new Map<string, any>()
  const stripe = {
    checkout: {
      sessions: {
        async create(params: any) {
          calls.push(params)
          if (over.fail) throw new Error("stripe down")
          const sid = `cs_test_${String(calls.length).padStart(10, "0")}`
          sessions.set(sid, { id: sid, metadata: params.metadata, payment_status: "unpaid", amount_total: params.line_items[0].price_data.unit_amount, currency: params.line_items[0].price_data.currency, payment_intent: null })
          return { id: sid, client_secret: `${sid}_secret_abc` }
        },
        async retrieve(sid: string) {
          const s = sessions.get(sid)
          if (!s) throw new Error("no such session")
          return s
        },
      },
    },
  }
  return { stripe, calls, sessions }
}

function deps(stripe: any, over: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return {
    stripe,
    ready: async () => true,
    fee: async (cents) => ({ platformFeeCents: Math.round(cents * 0.05), feePercent: 5, feeFixedCents: 0, planId: "pro" }),
    chargeCurrency: "usd",
    ...over,
  }
}

async function main() {
  console.log("\nRULES")
  {
    const pv = (over: Partial<ProgramViewer> = {}): ProgramViewer => ({ role: "member", active: true, tierId: null, ownedProductIds: [], level: 1, joinedAt: iso(NOW - 10 * DAY), purchased: false, ...over })
    const rule = (over: Partial<ProgramRule> = {}): ProgramRule => ({ status: "published", access: {}, priceCents: null, dripDays: null, ...over })
    check("a price makes it paid, a level above 1 a level program, otherwise free", programMode({ access: {}, priceCents: 4900 }) === "paid" && programMode({ access: { minLevel: 3 }, priceCents: null }) === "level" && programMode({ access: {}, priceCents: null }) === "free")
    check("FREE: open to every active member", programGate(rule(), pv(), NOW).open)
    check("a visitor or an expired member gets not_member", (programGate(rule(), pv({ role: null, active: false }), NOW) as any).reason === "not_member")
    const low = programGate(rule({ access: { minLevel: 3 } }), pv({ level: 2 }), NOW)
    check("LEVEL: below the level it is locked, naming the level", !low.open && (low as any).reason === "level" && (low as any).level === 3, low)
    check("LEVEL: at the level it opens", programGate(rule({ access: { minLevel: 3 } }), pv({ level: 3 }), NOW).open)
    const paid = programGate(rule({ priceCents: 4900 }), pv({ level: 20 }), NOW)
    check("PAID: not bought is locked with its price, whatever the level", !paid.open && (paid as any).reason === "paid" && (paid as any).priceCents === 4900)
    const bought = programGate(rule({ priceCents: 4900, dripDays: 30 }), pv({ purchased: true }), NOW)
    check("PAID: bought opens it at once (no drip wait)", bought.open && (bought as any).via === "purchase")
    check("a draft is hidden from members and open to staff", (programGate(rule({ status: "draft" }), pv(), NOW) as any).reason === "draft" && programGate(rule({ status: "draft", priceCents: 900 }), pv({ role: "moderator" }), NOW).open)
    check("staff open a paid program without buying it", programGate(rule({ priceCents: 4900 }), pv({ role: "admin" }), NOW).open)
    const drip = programGate(rule({ dripDays: 21 }), pv(), NOW)
    check("a drip program waits for its day, then opens", !drip.open && (drip as any).reason === "drip" && programGate(rule({ dripDays: 21 }), pv(), NOW + 12 * DAY).open)
    check("an older tier rule still holds", (programGate(rule({ access: { tierIds: ["t1"] } }), pv({ tierId: "t2" }), NOW) as any).reason === "tier" && programGate(rule({ access: { tierIds: ["t1"] } }), pv({ tierId: "t1" }), NOW).open)
    check("a tier rule comes before the price: no checkout for a member it is closed to", (programGate(rule({ access: { tierIds: ["t1"] }, priceCents: 900 }), pv(), NOW) as any).reason === "tier")

    const noTitle = checkProgramInput({ title: "  " }, { requireTitle: true })
    check("a program needs a name", noTitle.ok === false && noTitle.field === "title")
    check("names are trimmed and held to 120", (checkProgramInput({ title: "  Clay  101 " }) as any).patch.title === "Clay 101" && checkProgramInput({ title: "x".repeat(121) }).ok === false)
    check("paid needs at least 0.50", checkProgramInput({ mode: "paid", priceCents: 49 }).ok === false && (checkProgramInput({ mode: "paid", priceCents: 4900 }) as any).patch.priceCents === 4900)
    check("a level must be 2 to 20", checkProgramInput({ mode: "level", level: 1 }).ok === false && checkProgramInput({ mode: "level", level: 21 }).ok === false && (checkProgramInput({ mode: "level", level: 4 }) as any).patch.level === 4)
    check("free and level clear the price", (checkProgramInput({ mode: "free" }) as any).patch.priceCents === null && (checkProgramInput({ mode: "level", level: 3 }) as any).patch.priceCents === null)
    check("status is draft or published only", checkProgramInput({ status: "live" }).ok === false && (checkProgramInput({ status: "published" }) as any).patch.status === "published")
    check("drip days 0 to 3650, empty clears", (checkProgramInput({ dripDays: "" }) as any).patch.dripDays === null && (checkProgramInput({ dripDays: 14 }) as any).patch.dripDays === 14 && checkProgramInput({ dripDays: 9999 }).ok === false)
    const kept = accessForMode({ tierIds: ["t1"], minLevel: 5 }, "free")
    check("a mode change keeps an older tier rule and moves the level", JSON.stringify(kept) === JSON.stringify({ tierIds: ["t1"] }) && (accessForMode({}, "level", 4) as any).minLevel === 4)
    check("prices read as people write them", centsFromTyped("49") === 4900 && centsFromTyped("49,5") === 4950 && centsFromTyped("4.999") === null && centsFromTyped("abc") === null && typedFromCents(4950) === "49.50" && typedFromCents(4900) === "49")
    check('a price shows as "$49" and "$49.50"', programPrice(4900, "usd") === "$49" && programPrice(4950, "usd") === "$49.50")
    check("THE OLD ADDRESSES: /classroom and /classroom/<id> go to /learn", learnAddressFor("/community/makers/classroom") === "/community/makers/learn" && learnAddressFor("/community/makers/classroom/") === "/community/makers/learn" && learnAddressFor(`/community/makers/classroom/${PAID}`) === `/community/makers/learn/${PAID}`)
    check("and nothing else", learnAddressFor("/community/makers/classroomy") === null && learnAddressFor("/community/makers") === null && learnAddressFor("/community/makers/space/classroom") === null && learnAddressFor(`/community/makers/classroom/${PAID}/x`) === null)
    check("a program's address, with the lesson to resume", programHref("makers", PAID, LESSON_PAID_1) === `/community/makers/learn/${PAID}?lesson=${LESSON_PAID_1}`)
    check("the lock hints: sold separately, opens at a level, days to go", lockHint({ reason: "paid", label: "$49", opensAt: null, priceCents: 4900, currency: "usd" }) === "Sold separately" && lockHint({ reason: "level", label: "Level 3", opensAt: null, priceCents: null, currency: null }) === "Opens at level 3" && lockHint({ reason: "drip", label: "", opensAt: iso(NOW + 3 * DAY), priceCents: null, currency: null }, NOW) === "Opens in 3 days")
  }

  console.log("\nTHE NAV")
  {
    const entries = navEntries({ slug: "makers", classroomEnabled: true, eventsEnabled: true, directoryEnabled: true, gamificationEnabled: true }, false)
    const learn = entries.find((e) => e.key === "classroom")
    check('the place is called "Learn", at /learn', learn?.label === "Learn" && learn.href === "/community/makers/learn", learn)
    check("no place is called Classroom any more", !entries.some((e) => /classroom/i.test(e.label) || /\/classroom/.test(e.href)))
    check("Learn and a program inside it mark the Learn tab", sectionFromPath("/community/makers/learn", "makers") === "classroom" && sectionFromPath(`/community/makers/learn/${PAID}`, "makers") === "classroom")
    check("a lesson player address is known for the wide layout", isLearnLessonPath(`/community/makers/learn/${PAID}`) && isLearnLessonPath(`/community/makers/classroom/${PAID}`) && !isLearnLessonPath("/community/makers/learn"))
    check("the learn library index hides the right column too", isLearnLibraryPath("/community/makers/learn") && !isLearnLibraryPath(`/community/makers/learn/${PAID}`) && !isLearnLibraryPath("/community/makers"))
    check("the calendar list and an event page hide the right column too", isEventsLibraryPath("/community/makers/events") && isEventsLibraryPath("/community/makers/events/e1") && !isEventsLibraryPath("/community/makers"))
  }

  console.log("\nSERVER: reading and cards")
  {
    const db = learnDb()
    const { ready, rows } = await readPrograms(db, A)
    check("after part 102: every row with its own id, in order", ready && rows.map((r) => r.id).join() === [FREE, LEVEL, PAID, DRAFT, ATTACHED_ROW].join())
    const old = memDb({ community_courses: [{ community_id: A, product_id: ATTACHED, position: 0, access: {}, drip_days: null, added_at: iso(NOW) }] })
    const oldRead = await readPrograms(old, A)
    check("before part 102 an attached course's id is its product's", oldRead.rows[0]?.id === ATTACHED && oldRead.rows[0]?.status === "published")
    check("an old course link finds the program by its product id", (await findProgram(db, A, ATTACHED))?.id === ATTACHED_ROW)

    const cards = await listPrograms(db, community(), alice, { now: NOW, timeZone: "UTC" })
    const by = (pid: string) => cards.find((c) => c.id === pid)
    check("a member never sees a draft", !by(DRAFT) && cards.length === 4, cards.map((c) => c.id))
    check("the free program is open, with its lessons counted", !by(FREE)?.locked && by(FREE)?.lessons === 1 && by(FREE)?.kind === "program")
    check('the level program reads "Level 3"', by(LEVEL)?.locked?.reason === "level" && by(LEVEL)?.locked?.label === "Level 3")
    check('the paid program reads "$49", with its price', by(PAID)?.locked?.reason === "paid" && by(PAID)?.locked?.label === "$49" && by(PAID)?.priceLabel === "$49" && by(PAID)?.locked?.priceCents === 4900)
    check("an attached course shows with the product's title and cover", by(ATTACHED_ROW)?.title === "Glaze course" && by(ATTACHED_ROW)?.coverUrl === "https://img.test/glaze.jpg" && by(ATTACHED_ROW)?.kind === "course")
    check("every card goes to /learn with a readable key, and an old id still opens", cards.every((c) => /^\/community\/makers\/learn\/[a-z0-9-]+/.test(c.href.split("?")[0])) && cards.some((c) => !c.href.includes(c.id)))
    const erinCards = await listPrograms(db, community(), erin, { now: NOW })
    check("at level 3 the level program is open", !erinCards.find((c) => c.id === LEVEL)?.locked)
    const staff = await listPrograms(db, community(), dana, { now: NOW })
    check("staff see the draft, marked, and nothing locked", staff.find((c) => c.id === DRAFT)?.draft === true && staff.every((c) => !c.locked))
  }

  console.log("\nSERVER: buying once")
  {
    const db = learnDb()
    const first = await grantProgram(db, { programId: PAID, userId: ALICE, communityId: A, source: "purchase", checkoutSessionId: "cs_test_aaaaaaaaaa", amountCents: 4900, currency: "usd" })
    const again = await grantProgram(db, { programId: PAID, userId: ALICE, communityId: A, source: "purchase", checkoutSessionId: "cs_test_aaaaaaaaaa", amountCents: 4900, currency: "usd" })
    check("the first grant makes the row, the second changes nothing", first.ok && first.created && again.ok && !again.created && db.tables.community_program_access.length === 1)
    const cards = await listPrograms(db, community(), alice, { now: NOW })
    const paid = cards.find((c) => c.id === PAID)
    check("bought: the paid program opens for her, marked hers", !paid?.locked && paid?.owned === true)
    const bob = await listPrograms(db, community({ id: B, slug: "other" }), viewer(member(B, BOB)), { now: NOW })
    check("CROSS COMMUNITY: another community lists none of A's programs", bob.length === 0)
  }

  console.log("\nSERVER: the course player's question")
  {
    const db = learnDb()
    const level = (userId: string | null, courseId = COURSE_PAID) => programLessonLevel(db, userId, courseId, { enabled: true, now: NOW }).then((r) => r?.level ?? null)
    check("a member who has not bought: previews only (public)", (await level(ALICE)) === "public")
    check("the owner, who runs Learn: creator", (await level(OWNER)) === "creator")
    check("a moderator (staff, but not running Learn): owner", (await level(DANA)) === "owner")
    check("a member of another community: none", (await level(BOB)) === "none")
    check("signed out: none", (await level(null)) === "none")
    check("a course that is no program's: null", (await programLessonLevel(db, ALICE, id(999), { enabled: true })) === null)
    check("switched off: none", (await programLessonLevel(db, OWNER, COURSE_PAID, { enabled: false }))?.level === "none")
    await grantProgram(db, { programId: PAID, userId: ALICE, communityId: A, source: "purchase", checkoutSessionId: "cs_test_bbbbbbbbbb" })
    check("bought: owner", (await level(ALICE)) === "owner")
    const found = await programLessonLevel(db, ALICE, COURSE_PAID, { enabled: true })
    check("the program stands in for a product: its id and the community's creator", found?.product.id === PAID && found?.creatorId === CREATOR && found?.programId === PAID)
    const ctx = await lessonContext(db as any, ALICE, LESSON_PAID_1)
    check("lessonContext asks the community for a program's lesson (no product), and says no while the switch is off", ctx !== null && ctx.programId === PAID && ctx.access === "none")
    const tree = await readCourseTree(db as any, PAID)
    check("readCourseTree finds a program's lessons by the program's id", tree?.course.id === COURSE_PAID && tree.modules[0]?.lessons.length === 2)
  }

  console.log("\nSERVER: an attached course with a price")
  {
    const db = learnDb()
    check("a course made paid in Learn is not the community's to give until bought", !(await attachedCourseOpen(db, ALICE, ATTACHED, { now: NOW })) && !(await communityGrantsCourse(db, ALICE, ATTACHED, { enabled: true, now: NOW })))
    await grantProgram(db, { programId: ATTACHED_ROW, userId: ALICE, communityId: A, source: "purchase" })
    check("bought in Learn: the course player lets her in", await communityGrantsCourse(db, ALICE, ATTACHED, { enabled: true, now: NOW }))
    check("still nobody else", !(await communityGrantsCourse(db, ERIN, ATTACHED, { enabled: true, now: NOW })) && !(await communityGrantsCourse(db, BOB, ATTACHED, { enabled: true, now: NOW })))
  }

  console.log("\nSERVER: points")
  {
    const db = learnDb()
    const one = await onProgramProgress(db, { userId: ALICE, programId: FREE, lessonsBefore: 0, lessonsNow: 1, finished: true }, { enabled: true })
    const two = await onProgramProgress(db, { userId: ALICE, programId: FREE, lessonsBefore: 0, lessonsNow: 1, finished: true }, { enabled: true })
    const bob = await onProgramProgress(db, { userId: BOB, programId: FREE, lessonsBefore: 0, lessonsNow: 1, finished: true }, { enabled: true })
    check("finishing a program earns points once, under program:<id>", one.awarded && !two.awarded && (db.tables.community_point_events ?? []).filter((r) => r.source_key === `program:${FREE}`).length === 1)
    check("not for somebody who is not a member there", !bob.awarded)
  }

  console.log("\nSERVER: the builder")
  {
    const db = learnDb()
    const made = await createProgram(db, { communityId: A, actorId: OWNER, title: "  Glazing basics " })
    const row = made.ok ? db.tables.community_courses.find((r) => r.id === made.id) : null
    check("a new program is a draft, with no product, at the end", made.ok && row?.status === "draft" && row?.product_id === null && row?.title === "Glazing basics" && row?.position === 5, row)
    check("a nameless one is refused", (await createProgram(db, { communityId: A, actorId: OWNER, title: "" })).ok === false)
    const published = await updateProgram(db, { communityId: A, programId: DRAFT, actorId: OWNER, input: { status: "published" }, currency: "usd" })
    await updateProgram(db, { communityId: A, programId: DRAFT, actorId: OWNER, input: { status: "draft" }, currency: "usd" })
    await updateProgram(db, { communityId: A, programId: DRAFT, actorId: OWNER, input: { status: "published" }, currency: "usd" })
    const jobs = (db.tables.community_jobs ?? []).filter((j) => j.idempotency_key === `fanout_program:${DRAFT}`)
    check("publishing tells the members once (notifyProgramPublished), with the program's address", published.ok && jobs.length === 1 && jobs[0].payload?.url === `/community/makers/learn/${DRAFT}` && jobs[0].payload?.title === "Draft program", db.tables.community_jobs)
    const madePaid = await updateProgram(db, { communityId: A, programId: FREE, actorId: OWNER, input: { mode: "paid", priceCents: 2900 }, currency: "usd" })
    const freeRow = db.tables.community_courses.find((r) => r.id === FREE)
    check("paid: the price and the currency are written, the level rule cleared", madePaid.ok && freeRow?.price_cents === 2900 && freeRow?.currency === "usd")
    await updateProgram(db, { communityId: A, programId: FREE, actorId: OWNER, input: { mode: "level", level: 4 }, currency: "usd" })
    check("level: the price goes and access.minLevel is 4", freeRow?.price_cents === null && freeRow?.access?.minLevel === 4)
    const cover = await updateProgram(db, { communityId: A, programId: FREE, actorId: OWNER, input: { coverUrl: "https://evil.example/x.jpg" }, currency: "usd" })
    check("a cover from anywhere but our storage is refused", cover.ok === false && (cover as any).field === "cover")
    const other = await updateProgram(db, { communityId: B, programId: FREE, actorId: OWNER, input: { title: "Mine now" }, currency: "usd" })
    check("CROSS COMMUNITY: another community cannot change it", other.ok === false && (other as any).status === 404)
    const order = [PAID, FREE, LEVEL, DRAFT, ATTACHED_ROW, (made as any).id]
    const moved = await reorderPrograms(db, { communityId: A, actorId: OWNER, ids: order })
    check("reorder takes every program once", moved.ok && db.tables.community_courses.find((r) => r.id === PAID)?.position === 0 && (await reorderPrograms(db, { communityId: A, actorId: OWNER, ids: [PAID] })).ok === false)
    await grantProgram(db, { programId: PAID, userId: ALICE, communityId: A, source: "purchase" })
    const refused = await deleteProgram(db, { communityId: A, programId: PAID, actorId: OWNER })
    check("a program members bought is not deleted", refused.ok === false && (refused as any).status === 409 && !!db.tables.community_courses.find((r) => r.id === PAID))
    const gone = await deleteProgram(db, { communityId: A, programId: FREE, actorId: OWNER })
    check("a program made here goes with its course", gone.ok && !db.tables.community_courses.find((r) => r.id === FREE) && !db.tables.courses.find((c) => c.id === COURSE_FREE))
    const detached = await deleteProgram(db, { communityId: A, programId: ATTACHED_ROW, actorId: OWNER })
    check("an attached course is only taken out: the course product and its course stay", detached.ok && !!db.tables.products.find((p) => p.id === ATTACHED) && !!db.tables.courses.find((c) => c.id === COURSE_ATTACHED))
    check("every change is in the audit log", (db.tables.community_audit_log ?? []).filter((r) => /^program\.|^course\./.test(r.action)).length >= 5)
  }

  console.log("\nCHECKOUT (Stripe stubbed)")
  {
    const db = learnDb()
    const { stripe, calls } = fakeStripe()
    const started = await startProgramCheckout(db, deps(stripe), { community: community(), viewer: alice, programId: PAID, email: "alice@example.com" })
    const p = calls[0]
    check("a session comes back with its client secret", started.ok && (started as any).clientSecret.endsWith("_secret_abc") && calls.length === 1, started)
    check("EMBEDDED, never redirecting (the sheet hears onComplete)", p?.ui_mode === "embedded" && p?.redirect_on_completion === "never" && p?.mode === "payment" && !p?.success_url && !p?.cancel_url)
    check("the server's price, once, in the platform's currency", p?.line_items?.length === 1 && p.line_items[0].price_data.unit_amount === 4900 && p.line_items[0].price_data.currency === "usd" && p.line_items[0].quantity === 1)
    check("ON THE CREATOR'S CONNECTED ACCOUNT: the destination and the platform's fee", p?.payment_intent_data?.transfer_data?.destination === "acct_123creator" && p?.payment_intent_data?.application_fee_amount === 245)
    const m = p?.payment_intent_data?.metadata ?? {}
    check("the metadata names the program, the community and the buyer, and no product", m.kind === "community_program" && m.community_program_id === PAID && m.community_id === A && m.buyer_id === ALICE && !("product_id" in m) && !("receipt_token" in m))
    check("the buyer's email and id go with it", p?.customer_email === "alice@example.com" && p?.client_reference_id === ALICE)
    check("the pure parameters are what was sent", JSON.stringify(programCheckoutParams({ program: { id: PAID, title: "Paid program", summary: null, coverUrl: null, priceCents: 4900 }, community: community(), buyer: { userId: ALICE, email: "alice@example.com" }, creatorId: CREATOR, destination: "acct_123creator", currency: "usd", fee: { platformFeeCents: 245, feePercent: 5, feeFixedCents: 0, planId: "pro" } })) === JSON.stringify(p))

    const refusals: [string, Promise<any>, number, string][] = [
      ["a free program is not for sale", startProgramCheckout(db, deps(stripe), { community: community(), viewer: alice, programId: FREE, email: null }), 409, "not_for_sale"],
      ["a draft is not for sale", startProgramCheckout(db, deps(stripe), { community: community(), viewer: alice, programId: DRAFT, email: null }), 409, "not_for_sale"],
      ["staff never pay: it is already theirs", startProgramCheckout(db, deps(stripe), { community: community(), viewer: dana, programId: PAID, email: null }), 409, "already_yours"],
      ["a visitor is refused", startProgramCheckout(db, deps(stripe), { community: community(), viewer: viewer(null), programId: PAID, email: null }), 403, "not_member"],
      ["CROSS COMMUNITY: another community's program is not found", startProgramCheckout(db, deps(stripe), { community: community({ id: B, slug: "other" }), viewer: viewer(member(B, BOB)), programId: PAID, email: null }), 404, "not_found"],
      ["an attached course is sold as its product, not here", startProgramCheckout(db, deps(stripe), { community: community(), viewer: alice, programId: ATTACHED_ROW, email: null }), 404, "not_found"],
      ["a creator whose payouts cannot take payments", startProgramCheckout(db, deps(stripe, { ready: async () => false }), { community: community(), viewer: alice, programId: PAID, email: null }), 409, "seller_unavailable"],
      ["a price in another currency than the platform charges", startProgramCheckout(db, deps(stripe, { chargeCurrency: "ron" }), { community: community(), viewer: alice, programId: PAID, email: null }), 409, "price_changed"],
      ["Learn switched off in the community", startProgramCheckout(db, deps(stripe), { community: community({ classroom_enabled: false }), viewer: alice, programId: PAID, email: null }), 404, "not_found"],
    ]
    const before = calls.length
    for (const [name, run, status, codeWanted] of refusals) {
      const r = await run
      check(`REFUSED: ${name}`, r.ok === false && r.status === status && r.code === codeWanted, r)
    }
    check("and none of them reached Stripe", calls.length === before)
    const down = await startProgramCheckout(db, deps(fakeStripe({ fail: true }).stripe), { community: community(), viewer: alice, programId: PAID, email: null })
    check("Stripe refusing: a sentence, nothing charged", down.ok === false && (down as any).status === 502 && /Nothing was charged/.test((down as any).error))
  }

  console.log("\nCHECKOUT: the grant")
  {
    const db = learnDb()
    const { stripe, sessions } = fakeStripe()
    const started = (await startProgramCheckout(db, deps(stripe), { community: community(), viewer: alice, programId: PAID, email: null })) as any
    const sid = started.sessionId as string
    check("a session this file made is recognised, another is not", isProgramSession(sessions.get(sid)) && !isProgramSession({ metadata: { cart: "1" } } as any))
    const unpaid = await confirmProgramCheckout(db, stripe, { sessionId: sid, userId: ALICE })
    check("NOT PAID YET: nothing granted (409, the sheet asks again)", unpaid.ok === false && (unpaid as any).status === 409 && db.tables.community_program_access.length === 0)
    sessions.get(sid).payment_status = "paid"
    sessions.get(sid).payment_intent = "pi_test_123"
    const stranger = await confirmProgramCheckout(db, stripe, { sessionId: sid, userId: ERIN })
    check("SOMEBODY ELSE'S SESSION: refused, nothing granted", stranger.ok === false && (stranger as any).status === 403 && db.tables.community_program_access.length === 0)
    check("a session id that is not one: refused before Stripe", (await confirmProgramCheckout(db, stripe, { sessionId: "../x", userId: ALICE })).ok === false)
    const hook = await grantFromSession(db, sessions.get(sid))
    const sheet = await confirmProgramCheckout(db, stripe, { sessionId: sid, userId: ALICE })
    check("PAID: the webhook grants it, the sheet's confirm then changes nothing", hook.ok && hook.created && sheet.ok && !sheet.created && db.tables.community_program_access.length === 1)
    const row = db.tables.community_program_access[0]
    check("the row keeps the session, the payment and the amount", row.checkout_session_id === sid && row.payment_intent_id === "pi_test_123" && row.amount_cents === 4900 && row.source === "purchase")
    check("the program opens for her", !(await listPrograms(db, community(), alice, { now: NOW })).find((c) => c.id === PAID)?.locked)
    check("a full refund locks it again", (await revokeRefundedProgram(db, "pi_test_123")) === 1 && (await listPrograms(db, community(), alice, { now: NOW })).find((c) => c.id === PAID)?.locked?.reason === "paid")
    check("an unrelated refund touches nothing", (await revokeRefundedProgram(db, "pi_other")) === 0 && (await revokeRefundedProgram(db, null)) === 0)
    const rebought = await grantProgram(db, { programId: PAID, userId: ALICE, communityId: A, source: "purchase", checkoutSessionId: "cs_test_cccccccccc" })
    check("buying again after a refund opens it again", rebought.ok && !(await listPrograms(db, community(), alice, { now: NOW })).find((c) => c.id === PAID)?.locked)
  }

  console.log("\nWIRING")
  {
    const routes = [
      "app/api/community/[communityId]/learn/route.ts",
      "app/api/community/[communityId]/learn/[programId]/checkout/route.ts",
      "app/api/community/[communityId]/learn/[programId]/checkout/confirm/route.ts",
      "app/api/app/community/[id]/learn/route.ts",
      "app/api/app/community/[id]/learn/[programId]/route.ts",
    ]
    for (const r of routes) {
      const src = code(r)
      const handlers = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b[\s\S]*?\n}\n/g)].map((x) => x[0])
      check(`${r}: every handler checks the switch first, then the member or the creator`, handlers.length > 0 && handlers.every((h) => h.indexOf("requireCommunitiesOn()") >= 0 && h.indexOf("requireCommunitiesOn()") < h.search(/requireMember|requireCreatorCommunity/)))
      const writes = handlers.filter((h) => /export async function (POST|PUT|PATCH|DELETE)/.test(h))
      check(`${r}: every write is rate limited`, writes.every((h) => /rateLimit\(|manageLimit\(/.test(h)))
    }
    check("the checkout reads nothing from the body (the price is the server's)", !/readJson|request\.json/.test(code("app/api/community/[communityId]/learn/[programId]/checkout/route.ts")))
    const hook = code("app/api/stripe/webhook/route.ts")
    const at = hook.indexOf('session.metadata?.kind === "community_program"')
    check("the webhook grants a program from its session before the generic checkout handling", at > 0 && at < hook.indexOf('console.log("[Webhook] Checkout session:"') && /grantFromSession\(supabaseAdmin, session\)/.test(hook))
    check("a full refund is checked against programs", /revokeRefundedProgram\(supabaseAdmin/.test(hook))
    const proxy = code("proxy.ts")
    check("proxy.ts answers the old /classroom addresses with a 308 to /learn", /learnAddressFor\(pathname\)/.test(proxy) && /NextResponse\.redirect\(new URL\(`\$\{learn\}\$\{search\}`, request\.url\), 308\)/.test(proxy))
    check("the old classroom pages are gone (the 308 answers first)", !existsSync("app/(marketing)/community/[slug]/(member)/classroom/page.tsx"))
    check("the Learn pages check for themselves", /openMemberPage\(db, slug, "classroom"/.test(code("app/(marketing)/community/[slug]/(member)/learn/page.tsx")) && /openMemberPage\(db, slug, "classroom"/.test(code("app/(marketing)/community/[slug]/(member)/learn/[programId]/page.tsx")))
    const client = walk("components/community/learn").filter((f) => /\.tsx?$/.test(f))
    check("the Learn components import no server code", client.every((f) => !/server-only|next\/headers|lib\/communities\/server|lib\/admin-blog-auth/.test(code(f))), client)
    check("the checkout sheet is Stripe's Embedded Checkout in the shared sheet", /EmbeddedCheckoutProvider/.test(code("components/community/learn/program-checkout.tsx")) && /<SheetDialog/.test(code("components/community/learn/program-checkout.tsx")) && !/window\.location|router\.push\("\/checkout/.test(code("components/community/learn/program-checkout.tsx")))
    check("the builder edits lessons with the product editor's own course card", /<CourseEditor productId=\{program\.id\}/.test(code("components/community/learn/program-editor.tsx")) && /<SaveButton/.test(code("components/community/learn/program-editor.tsx")))
    check("no Storelib product is made for a program", !/from\("products"\)\.insert|from\("products"\)\.upsert/.test(code("lib/communities/server/learn.ts")) && !/from\("products"\)\.insert/.test(code("lib/communities/server/learn-checkout.ts")))
    check("the course emails skip a program (no product)", (code("lib/courses/emails.ts").match(/\.not\("product_id", "is", null\)/g) ?? []).length === 2)
    const visible = ["components/community/learn/learn-library.tsx", "components/community/learn/program-page.tsx", "components/community/learn/program-checkout.tsx", "components/community/learn/learn-builder.tsx", "components/community/learn/program-editor.tsx"]
    check("the member and creator copy never says Classroom", visible.every((f) => !/Classroom|classroom yet/.test(code(f).replace(/place="classroom"|place: "classroom"|"classroom"/g, ""))))
  }

  console.log("\nSQL (part 102)")
  {
    const part = read("supabase/sql/run-now/102_community_programs.sql")
    const lines = part.trim().split("\n")
    check("a comment, three DO blocks each on one line, notify pgrst last", lines[0].startsWith("/*") && lines.slice(1, -1).every((l) => /^DO \$do\$ BEGIN .* END \$do\$;$/.test(l)) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("community_courses gains its id, title, price, status and course, and product_id may be empty", ["ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid()", "ADD COLUMN IF NOT EXISTS price_cents integer", "ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published'", "ADD COLUMN IF NOT EXISTS course_id uuid", "ALTER COLUMN product_id DROP NOT NULL"].every((s) => part.includes(s)))
    check("the old pair stays unique before the old primary key goes", part.indexOf("community_courses_community_product_key UNIQUE (community_id, product_id)") < part.indexOf("DROP CONSTRAINT community_courses_pkey"))
    check("every constraint is added only when missing", (part.match(/ADD CONSTRAINT/g) ?? []).length === (part.match(/NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE con(name|relid)/g) ?? []).length)
    check("the price is held to Stripe's smallest charge", /price_cents BETWEEN 50 AND 99999999/.test(part))
    check("who bought what: server only, one row per person and program, the session unique", /CREATE TABLE IF NOT EXISTS public\.community_program_access/.test(part) && /PRIMARY KEY \(program_id, user_id\)/.test(part) && /UNIQUE \(checkout_session_id\)/.test(part) && /ENABLE ROW LEVEL SECURITY/.test(part) && /REVOKE ALL ON public\.community_program_access FROM PUBLIC, anon, authenticated/.test(part))
    check("courses and their rows may have no product", /ALTER TABLE public\.courses ALTER COLUMN product_id DROP NOT NULL/.test(part) && /ALTER TABLE public\.course_enrollments ALTER COLUMN product_id DROP NOT NULL/.test(part))
    check("the migration copy is the same", read("supabase/migrations/20261117_community_programs.sql") === part)
    check("the check after has its column, the README its row", /as p102_community_programs/.test(read("supabase/sql/run-now/99_check_after.sql")) && /`102_community_programs\.sql`/.test(read("supabase/sql/run-now/README.md")))
    check("the run files carry it", read("supabase/sql/run-four/3_of_4_latest.sql").includes("community_program_access"))
  }

  console.log("\nCOPY")
  {
    const mine = [
      ...walk("components/community/learn"),
      "lib/communities/learn.ts",
      "lib/communities/server/learn.ts",
      "lib/communities/server/learn-checkout.ts",
      "app/(marketing)/community/[slug]/(member)/learn/page.tsx",
      "app/(marketing)/community/[slug]/(member)/learn/[programId]/page.tsx",
      "app/api/community/[communityId]/learn/route.ts",
      "app/api/community/[communityId]/learn/[programId]/checkout/route.ts",
      "app/api/community/[communityId]/learn/[programId]/checkout/confirm/route.ts",
      "app/api/app/community/[id]/learn/route.ts",
      "app/api/app/community/[id]/learn/[programId]/route.ts",
      "supabase/sql/run-now/102_community_programs.sql",
      "scripts/check-community-learn.mjs",
      "scripts/render-community-learn.tsx",
    ].filter((f) => existsSync(f))
    const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
    const offenders = mine.filter((f) => banned.test(read(f)))
    check("no em dash and none of the banned words", offenders.length === 0, offenders)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  FAIL  ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
