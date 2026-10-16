/**
 * ===========================================================================
 *  COMMUNITIES: WHO OPENS A PROGRAM, AND ADDING LESSONS AT ONCE (round 33)
 * ===========================================================================
 * The owner's round 33: five ways to open a program (Open, Reach a level,
 * Buy now, Days after joining, Private), a rich description from the product
 * editor's field, covers for a program, its modules and lessons, Publish and
 * Save with the shared save bar, and adding a module or a lesson that shows
 * at once. Held from the rules and against an in memory database:
 *
 *   RULES       programMode and programGate for each of the five, the
 *               older rows read as before, the builder's input checks
 *   SERVER      the shelf: locks in words with what opens them, a private
 *               program not there for anybody off its list; the course
 *               player's question for each (a private one: not even a free
 *               preview); the builder's save: the choice and the list
 *               written, the list kept to members, the description cleaned
 *               with a plain copy, nothing announced for a private one;
 *               before part 200 everything but private still saves
 *   CHECKOUT    Buy now through the same embedded checkout, the server's
 *               price; a private or a time program is not for sale
 *   LESSONS     a module or a lesson with the id the browser made, the
 *               editor's tree the same as the server's after the same
 *               changes, a cover only from Storelib's storage
 *   SQL         part 200 follows the run-now rules
 *   WIRING      the routes check, the editor uses the product editor's rich
 *               text field and the shared save bar
 *   COPY        no em dash and no banned word
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"

import { memDb, type MemDb } from "./_classroom-db"
import { stripComments } from "./_source"
import { checkProgramInput, programGate, programMemberIds, programMode, type ProgramRule, type ProgramViewer } from "@/lib/communities/learn"
import { descriptionPatch, listPrograms, loadLearnBuilder, programCard, programLessonLevel, readPrograms, updateProgram } from "@/lib/communities/server/learn"
import { startProgramCheckout, type CheckoutDeps } from "@/lib/communities/server/learn-checkout"
import { applyAction, coverInput, editorTree, type Owner } from "@/lib/courses/manage"
import { namesAny, optimistic, treeOnScreen } from "@/lib/courses/editor-ops"
import { lessonAccess } from "@/lib/courses/access"
import { lockHint } from "@/components/community/learn/model"
import type { Viewer } from "@/lib/communities/server/context"
import type { CommunityRow, MemberRow, Role } from "@/lib/communities/types"
import { untt } from "./i18n-source"

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
const raw = (p: string) => readFileSync(p, "utf8")
const read = (p: string) => untt(raw(p), p)
const code = (p: string) => stripComments(read(p))

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const id = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`
const A = id(1)
const CREATOR = id(10)
const OWNER = id(11)
const ALICE = id(20) /* member, level 1, joined 10 days ago */
const ERIN = id(24) /* member, level 3 */
const DANA = id(23) /* moderator */
const STRANGER = id(29) /* not a member of A */
const OPEN = id(30)
const LEVEL = id(31)
const PAID = id(32)
const TIME = id(33)
const PRIV = id(34)
const OLD_DRIP = id(35) /* a row from before part 200: no access_mode, drip days */
const COURSE_PRIV = id(40)
const COURSE_TIME = id(41)
const LESSON_PRIV_PREVIEW = id(50)
const NOW = Date.parse("2026-10-16T12:00:00Z")
const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString()

function community(over: Partial<CommunityRow> = {}): CommunityRow {
  return {
    id: A, creator_id: CREATOR, owner_user_id: OWNER, slug: "makers", name: "Makers", tagline: null, description: null, logo_url: null, cover_url: null, cover_video_id: null,
    visibility: "public", access: "free", status: "published", category: null, language: "en", member_count: 5, post_count: 0, discovery_enabled: true, approval_required: false,
    default_role: "member", directory_enabled: true, classroom_enabled: true, events_enabled: true, chat_enabled: true, gamification_enabled: true, rules: [], faq: [], benefits: [], links: [],
    onboarding: {}, seo_title: null, seo_description: null, trending_score: 0, trending_at: null, platform_hidden: false, suspended_at: null, suspended_reason: null, archived_at: null,
    deleted_at: null, created_at: iso(NOW - 90 * DAY), updated_at: iso(NOW), ...over,
  } as CommunityRow
}

function member(userId: string, over: Partial<MemberRow> = {}): MemberRow {
  return {
    id: `m${userId.slice(-8)}`, community_id: A, user_id: userId, status: "active", role: "member", tier_id: null, source: "free",
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
  id: pid, community_id: A, product_id: null, course_id: null, title: "Program", summary: null, cover_url: null, status: "published", price_cents: null, currency: null, access: {}, drip_days: null,
  position: 0, added_at: iso(NOW - 30 * DAY), access_mode: null, member_ids: [], description: null, ...over,
})

function world(extra: Record<string, any[]> = {}) {
  return memDb(
    {
      communities: [community()],
      community_members: [member(ALICE), member(ERIN, { level: 3 }), member(DANA, { role: "moderator" }), member(OWNER, { role: "owner" })],
      community_levels: [{ community_id: A, level: 3, name: "Regular" }],
      community_courses: [
        program(OPEN, { title: "Open program", access_mode: "free", position: 0 }),
        program(LEVEL, { title: "Level program", access_mode: "level", access: { minLevel: 3 }, position: 1 }),
        program(PAID, { title: "Paid program", access_mode: "paid", price_cents: 4900, currency: "usd", position: 2 }),
        program(TIME, { title: "Time program", access_mode: "time", drip_days: 14, course_id: COURSE_TIME, position: 3 }),
        program(PRIV, { title: "Private program", access_mode: "private", member_ids: [ERIN], course_id: COURSE_PRIV, position: 4 }),
        program(OLD_DRIP, { title: "Older drip", access_mode: undefined, member_ids: undefined, description: undefined, drip_days: 30, position: 5 }),
      ],
      products: [],
      creators: [{ id: CREATOR, user_id: OWNER, slug: "maker", display_name: "Maker", stripe_account_id: "acct_123creator", subscription_plan_id: "pro" }],
      profiles: [{ id: ERIN, display_name: "Erin", username: "erin", avatar_url: null }, { id: ALICE, display_name: "Alice", username: "alice", avatar_url: null }],
      courses: [{ id: COURSE_PRIV, product_id: null }, { id: COURSE_TIME, product_id: null }],
      course_modules: [{ id: id(60), course_id: COURSE_PRIV, title: "Start", position: 0 }, { id: id(61), course_id: COURSE_TIME, title: "Week one", position: 0 }],
      course_lessons: [{ id: LESSON_PRIV_PREVIEW, module_id: id(60), position: 0, title: "A look inside", is_preview: true }, { id: id(52), module_id: id(61), position: 0, title: "Hello" }],
      community_program_access: [],
      ...extra,
    },
    { unique: { community_program_access: [["program_id", "user_id"]], course_modules: [["id"]], course_lessons: [["id"]] } },
  )
}

/*
  A DATABASE WHERE PART 200 HAS NOT RUN: a read or a write that names one of its columns fails the way PostgREST does
  (42703, the column does not exist). Everything else is the ordinary in memory database.
*/
function before200(db: MemDb): MemDb {
  const NEW = /access_mode|member_ids|description/
  return new Proxy(db, {
    get(target, key) {
      if (key !== "from") return (target as any)[key]
      return (table: string) => {
        const b = (target as any).from(table)
        let bad = false
        const wrap: any = new Proxy(b, {
          get(bt, bk) {
            if (bk === "select") return (cols?: string, o?: unknown) => ((bad ||= typeof cols === "string" && NEW.test(cols)), bt.select(cols, o), wrap)
            if (bk === "update") return (p: Record<string, unknown>) => ((bad ||= !!p && Object.keys(p).some((k) => NEW.test(k))), bt.update(p), wrap)
            if (bk === "then") return (res: any, rej: any) => (bad ? Promise.resolve({ data: null, error: { code: "42703", message: "column does not exist" } }).then(res, rej) : bt.then(res, rej))
            const v = bt[bk]
            return typeof v === "function" ? (...args: unknown[]) => (v(...args), wrap) : v
          },
        })
        return wrap
      }
    },
  })
}

function fakeStripe() {
  const calls: any[] = []
  const stripe = {
    checkout: {
      sessions: {
        async create(params: any) {
          calls.push(params)
          return { id: `cs_test_${String(calls.length).padStart(10, "0")}`, client_secret: "secret_abc" }
        },
        async retrieve() {
          throw new Error("not used")
        },
      },
    },
  }
  return { stripe, calls }
}
const deps = (stripe: any): CheckoutDeps => ({ stripe, ready: async () => true, fee: async (c) => ({ platformFeeCents: Math.round(c * 0.05), feePercent: 5, feeFixedCents: 0, planId: "pro" }), chargeCurrency: "usd" })

async function main() {
  console.log("\nRULES: the five choices")
  {
    const pv = (over: Partial<ProgramViewer> = {}): ProgramViewer => ({ userId: ALICE, role: "member", active: true, tierId: null, ownedProductIds: [], level: 1, joinedAt: iso(NOW - 10 * DAY), purchased: false, ...over })
    const rule = (over: Partial<ProgramRule> = {}): ProgramRule => ({ status: "published", access: {}, priceCents: null, dripDays: null, accessMode: null, memberIds: [], ...over })
    check("the stored choice is read for each of the five", ["free", "level", "paid", "time", "private"].every((m) => programMode({ access: m === "level" ? { minLevel: 2 } : {}, priceCents: m === "paid" ? 900 : null, dripDays: m === "time" ? 3 : null, accessMode: m }) === m))
    check("an older row is read from its fields: price, level, drip days, otherwise free", programMode({ access: {}, priceCents: 900 }) === "paid" && programMode({ access: { minLevel: 4 }, priceCents: null }) === "level" && programMode({ access: {}, priceCents: null, dripDays: 7 }) === "time" && programMode({ access: {}, priceCents: null }) === "free")
    check("private is only ever chosen, never guessed from the fields", programMode({ access: {}, priceCents: null, memberIds: [ALICE] } as any) === "free")

    check("OPEN: every active member", programGate(rule({ accessMode: "free" }), pv(), NOW).open)
    const lv = programGate(rule({ accessMode: "level", access: { minLevel: 3 } }), pv({ level: 2 }), NOW)
    check("REACH A LEVEL: below it, locked with the level; at it, open", !lv.open && (lv as any).reason === "level" && (lv as any).level === 3 && programGate(rule({ accessMode: "level", access: { minLevel: 3 } }), pv({ level: 3 }), NOW).open)
    const buy = programGate(rule({ accessMode: "paid", priceCents: 4900 }), pv(), NOW)
    check("BUY NOW: locked with the price until bought, then open at once", !buy.open && (buy as any).reason === "paid" && (buy as any).priceCents === 4900 && (programGate(rule({ accessMode: "paid", priceCents: 4900 }), pv({ purchased: true }), NOW) as any).via === "purchase")
    const wait = programGate(rule({ accessMode: "time", dripDays: 14 }), pv(), NOW)
    check("DAYS AFTER JOINING: locked with the day it opens, counted from joining", !wait.open && (wait as any).reason === "drip" && (wait as any).opensAt === iso(NOW - 10 * DAY + 14 * DAY))
    check("  and open from that day", programGate(rule({ accessMode: "time", dripDays: 14 }), pv(), NOW + 4 * DAY + 1000).open)
    check("  the older drip row works the same", (programGate(rule({ dripDays: 30 }), pv(), NOW) as any).reason === "drip")
    const priv = rule({ accessMode: "private", memberIds: [ERIN] })
    check("PRIVATE: open to a member on the list", programGate(priv, pv({ userId: ERIN }), NOW).open)
    check("PRIVATE: closed to a member who is not, as private", (programGate(priv, pv({ userId: ALICE }), NOW) as any).reason === "private")
    check("PRIVATE: a viewer with no account id is never on the list", (programGate(priv, pv({ userId: null }), NOW) as any).reason === "private")
    check("PRIVATE: staff open it; a visitor is not a member", programGate(priv, pv({ userId: DANA, role: "moderator" }), NOW).open && (programGate(priv, pv({ userId: ERIN, role: null, active: false }), NOW) as any).reason === "not_member")
    check("PRIVATE: a list on the list in another case still matches; junk is dropped", programGate(rule({ accessMode: "private", memberIds: [ERIN.toUpperCase()] }), pv({ userId: ERIN }), NOW).open && programMemberIds(["x", 4, ERIN, ERIN]).join() === ERIN)
    check("a draft is still staff only, whatever the choice", (programGate({ ...priv, status: "draft" }, pv({ userId: ERIN }), NOW) as any).reason === "draft")

    check("time needs its days", checkProgramInput({ mode: "time" }).ok === false && (checkProgramInput({ mode: "time", dripDays: 7 }) as any).patch.dripDays === 7)
    check("open, buy now and private take the days away", (checkProgramInput({ mode: "free", dripDays: 9 }) as any).patch.dripDays === null && (checkProgramInput({ mode: "paid", priceCents: 900, dripDays: 9 }) as any).patch.dripDays === null && (checkProgramInput({ mode: "private", memberIds: [], dripDays: 9 }) as any).patch.dripDays === null)
    check("private keeps the list, each once; any other choice clears it", JSON.stringify((checkProgramInput({ mode: "private", memberIds: [ERIN, ERIN, "nope"] }) as any).patch.memberIds) === JSON.stringify([ERIN]) && (checkProgramInput({ mode: "free" }) as any).patch.memberIds.length === 0)
    check("a list that is not a list is refused, and so is one over 1,000", checkProgramInput({ mode: "private", memberIds: "everyone" }).ok === false && checkProgramInput({ mode: "private", memberIds: Array.from({ length: 1001 }, (_, i) => id(1000 + i)) }).ok === false)
    check("a rich description may be longer than the plain one, to its own limit", checkProgramInput({ summary: `<p>${"a".repeat(5000)}</p>` }).ok && checkProgramInput({ summary: "a".repeat(2001) }).ok === false && checkProgramInput({ summary: `<p>${"a".repeat(60_001)}</p>` }).ok === false)
    check("the lock hint for private says who it is for", lockHint({ reason: "private", label: "Members picked", opensAt: null, priceCents: null, currency: null }) === "For members the owner picked")
  }

  console.log("\nSERVER: the shelf")
  {
    const db = world()
    const alice = viewer(member(ALICE))
    const cards = await listPrograms(db, community(), alice, { now: NOW, timeZone: "UTC" })
    const by = (pid: string) => cards.find((c) => c.id === pid)
    check("a member sees open, level, paid, time and the older drip program", [OPEN, LEVEL, PAID, TIME, OLD_DRIP].every((p) => !!by(p)), cards.map((c) => c.id))
    check("A PRIVATE PROGRAM IS NOT THERE for a member off its list", !by(PRIV))
    check("open is open; the others are locked with their reason", !by(OPEN)?.locked && by(LEVEL)?.locked?.reason === "level" && by(PAID)?.locked?.reason === "paid" && by(TIME)?.locked?.reason === "drip" && by(OLD_DRIP)?.locked?.reason === "drip")
    check("the level lock carries the level the member is at", by(LEVEL)?.locked?.viewerLevel === 1 && by(LEVEL)?.locked?.label === "Level 3")
    check("the time lock carries the day it opens", by(TIME)?.locked?.opensAt === iso(NOW - 10 * DAY + 14 * DAY))
    check("the paid lock carries the price, for the Buy button", by(PAID)?.locked?.priceCents === 4900 && by(PAID)?.priceLabel === "$49")
    check("the mode is on every card", by(TIME)?.mode === "time" && by(OLD_DRIP)?.mode === "time" && by(PAID)?.mode === "paid")
    const erin = await listPrograms(db, community(), viewer(member(ERIN, { level: 3 })), { now: NOW })
    check("the member on the list sees it, open", erin.some((c) => c.id === PRIV && !c.locked))
    const staff = await listPrograms(db, community(), viewer(member(DANA, { role: "moderator" })), { now: NOW })
    check("staff see it, open", staff.some((c) => c.id === PRIV && !c.locked))
    check("its page is not found for a member off the list", (await programCard(db, community(), alice, PRIV, { now: NOW })) === null && (await programCard(db, community(), alice, "private-program", { now: NOW })) === null)
    const keys = cards.map((c) => c.href.split("/").pop())
    check("the others keep their addresses whether or not it is listed", keys.includes("time-program") && keys.includes("older-drip"))
  }

  console.log("\nSERVER: lessons and media, decided each time")
  {
    const db = world()
    const lv = (userId: string | null, courseId: string, now = NOW) => programLessonLevel(db, userId, courseId, { enabled: true, now }).then((r) => r?.level ?? null)
    check("PRIVATE: a member off the list gets none, not even the free preview", (await lv(ALICE, COURSE_PRIV)) === "none" && lessonAccess("none", true) === "none")
    check("PRIVATE: the member on the list is an owner", (await lv(ERIN, COURSE_PRIV)) === "owner")
    check("PRIVATE: someone from outside the community gets none", (await lv(STRANGER, COURSE_PRIV)) === "none" && (await lv(null, COURSE_PRIV)) === "none")
    check("TIME: before the day, previews only; from the day, owner", (await lv(ALICE, COURSE_TIME)) === "public" && (await lv(ALICE, COURSE_TIME, NOW + 5 * DAY)) === "owner")
    check("  a preview lesson plays, any other is refused", lessonAccess("public", true) === "preview" && lessonAccess("public", false) === "none")
  }

  console.log("\nSERVER: the builder's save")
  {
    const db = world()
    const toPrivate = await updateProgram(db, { communityId: A, programId: OPEN, actorId: OWNER, input: { mode: "private", memberIds: [ALICE, STRANGER, ALICE] }, currency: "usd" })
    const row = db.tables.community_courses.find((r) => r.id === OPEN)
    check("private: the choice and the list are written, only members of this community on it", toPrivate.ok && row?.access_mode === "private" && JSON.stringify(row?.member_ids) === JSON.stringify([ALICE]), row)
    const back = await updateProgram(db, { communityId: A, programId: OPEN, actorId: OWNER, input: { mode: "time", dripDays: 5 }, currency: "usd" })
    check("time: the days are written and the list is emptied", back.ok && row?.access_mode === "time" && row?.drip_days === 5 && row?.member_ids.length === 0 && row?.price_cents === null)
    await updateProgram(db, { communityId: A, programId: OPEN, actorId: OWNER, input: { mode: "paid", priceCents: 2500 }, currency: "usd" })
    check("buy now: the price and currency, the days gone", row?.access_mode === "paid" && row?.price_cents === 2500 && row?.currency === "usd" && row?.drip_days === null)
    await updateProgram(db, { communityId: A, programId: OPEN, actorId: OWNER, input: { mode: "level", level: 4 }, currency: "usd" })
    check("reach a level: the level rule, the price gone", row?.access_mode === "level" && row?.access?.minLevel === 4 && row?.price_cents === null)
    const desc = await updateProgram(db, { communityId: A, programId: OPEN, actorId: OWNER, input: { summary: '<h2>Clay</h2><p>Wedge, <b>throw</b> 😀<img src="https://storelib.com/media/product-images/a.jpg" onerror="alert(1)"></p><script>alert(2)</script>' }, currency: "usd" })
    check("the description is kept as cleaned HTML: no script, no handler", desc.ok && /<h2>Clay<\/h2>/.test(row?.description ?? "") && /<img/.test(row?.description ?? "") && !/script|onerror/i.test(row?.description ?? ""), row?.description)
    check("  with its words as plain text for the cards", typeof row?.summary === "string" && /Clay/.test(row.summary) && /throw/.test(row.summary) && !/</.test(row.summary), row?.summary)
    check("plain text stays plain, and empty clears both", JSON.stringify(descriptionPatch("Just words")) === JSON.stringify({ summary: "Just words", description: null }) && JSON.stringify(descriptionPatch("<p><br></p>")) === JSON.stringify({ summary: null, description: null }))
    const cards = await listPrograms(db, community(), viewer(member(OWNER, { role: "owner" })), { now: NOW })
    check("the page gets the cleaned HTML to draw", /<h2>Clay<\/h2>/.test(cards.find((c) => c.id === OPEN)?.descriptionHtml ?? ""))
    const builder = await loadLearnBuilder(db, community(), { currency: "usd", canSell: true })
    check("the builder gets the description as HTML, the list with names, and part 200 as there", /<h2>Clay/.test(builder.programs.find((p) => p.id === OPEN)?.summary ?? "") && builder.programs.find((p) => p.id === PRIV)?.members[0]?.name === "Erin" && builder.accessReady === true)

    const draft = world({ community_courses: [program(PRIV, { title: "Secret", status: "draft", access_mode: "private", member_ids: [ERIN], course_id: COURSE_PRIV })] })
    const published = await updateProgram(draft, { communityId: A, programId: PRIV, actorId: OWNER, input: { status: "published" }, currency: "usd" })
    check("publishing a private program tells nobody", published.ok && !(draft.tables.community_jobs ?? []).some((j) => String(j.idempotency_key ?? "").includes(PRIV)), draft.tables.community_jobs)
  }

  console.log("\nSERVER: before part 200")
  {
    const db = before200(world({ community_courses: [program(OPEN, { title: "Open program", access_mode: undefined, member_ids: undefined, description: undefined, drip_days: 3 })] }))
    const { ready, accessReady, rows } = await readPrograms(db, A)
    check("the programs are still read, without the new columns", ready && !accessReady && rows.length === 1 && rows[0].accessMode === null && rows[0].memberIds.length === 0)
    check("a row with drip days reads as days after joining", programMode(rows[0]) === "time")
    const level = await updateProgram(db, { communityId: A, programId: OPEN, actorId: OWNER, input: { mode: "level", level: 3, summary: "<p>Hello <b>you</b></p>" }, currency: "usd" })
    const row = (db as any).tables.community_courses[0]
    check("everything but private still saves, the description as its plain words", level.ok && row.access?.minLevel === 3 && row.summary === "Hello you" && row.access_mode === undefined, row)
    const priv = await updateProgram(db, { communityId: A, programId: OPEN, actorId: OWNER, input: { mode: "private", memberIds: [ALICE] }, currency: "usd" })
    check("private says it needs part 200, and nothing changes", priv.ok === false && (priv as any).status === 409 && /part 200/.test((priv as any).error) && row.access?.minLevel === 3)
    const lessons = await programLessonLevel(db, ALICE, COURSE_TIME, { enabled: true, now: NOW })
    check("the course player's question still answers", lessons === null || typeof lessons.level === "string")
  }

  console.log("\nCHECKOUT: Buy now")
  {
    const db = world()
    const alice = viewer(member(ALICE))
    const { stripe, calls } = fakeStripe()
    const started = await startProgramCheckout(db, deps(stripe), { community: community(), viewer: alice, programId: PAID, email: null })
    check("buy now opens the same embedded checkout, at the server's price, to the creator's account", started.ok && calls[0]?.ui_mode === "embedded" && calls[0]?.line_items?.[0]?.price_data?.unit_amount === 4900 && calls[0]?.payment_intent_data?.transfer_data?.destination === "acct_123creator")
    const priv = await startProgramCheckout(db, deps(stripe), { community: community(), viewer: alice, programId: PRIV, email: null })
    const time = await startProgramCheckout(db, deps(stripe), { community: community(), viewer: alice, programId: TIME, email: null })
    check("a private or a time program is not for sale", priv.ok === false && (priv as any).code === "not_for_sale" && time.ok === false && (time as any).code === "not_for_sale" && calls.length === 1)
    const erin = await startProgramCheckout(db, deps(stripe), { community: community(), viewer: viewer(member(ERIN, { level: 3 })), programId: PRIV, email: null })
    check("and nobody can pay their way onto a private list", erin.ok === false && calls.length === 1)
  }

  console.log("\nLESSONS: added at once, saved behind")
  {
    const db = world()
    const owner: Owner = { userId: OWNER, creatorId: CREATOR, planId: "pro", productId: TIME, programId: TIME }
    const start = await editorTree(db as any, TIME)
    const M = "a1b2c3d4-0000-4000-8000-000000000001"
    const L1 = "a1b2c3d4-0000-4000-8000-000000000002"
    const L2 = "a1b2c3d4-0000-4000-8000-000000000003"
    const ops: Record<string, unknown>[] = [
      { action: "add-module", moduleId: M, lessonId: L1, title: "Module 2", lessonTitle: "Lesson 1" },
      { action: "rename-module", moduleId: M, title: "Glazing" },
      { action: "add-lesson", moduleId: M, lessonId: L2, title: "Lesson 2" },
      { action: "update-lesson", lessonId: L2, title: "Firing" },
      { action: "order-modules", ids: [M, id(61)] },
      { action: "order-lessons", moduleId: M, ids: [L2, L1] },
    ]
    const shown = treeOnScreen(start, ops)
    check("the editor shows the module, its lessons and every change before any answer", shown.modules[0]?.id === M && shown.modules[0]?.title === "Glazing" && shown.modules[0]?.lessons.map((l) => l.title).join() === "Firing,Lesson 1")
    for (const body of ops) await applyAction(db as any, owner, String(body.action), body)
    const saved = await editorTree(db as any, TIME)
    const shape = (t: typeof saved) => t.modules.map((m) => `${m.id}:${m.title}:${m.lessons.map((l) => `${l.id}=${l.title}`).join(",")}`).join("|")
    check("THE SERVER KEEPS THE BROWSER'S IDS: the saved tree is the one shown", shape(saved) === shape(shown), { saved: shape(saved), shown: shape(shown) })
    let taken = ""
    try {
      await applyAction(db as any, owner, "add-module", { moduleId: M, title: "Again" })
    } catch (e) {
      taken = (e as Error).message
    }
    check("an id already used is refused, never reused", /already there/.test(taken))
    check("a change waiting on a module that failed goes with it", namesAny({ action: "rename-module", moduleId: M }, [M]) && namesAny({ action: "order-modules", ids: [id(61), M] }, [M]) && !namesAny({ action: "update-lesson", lessonId: id(52) }, [M]))
    check("an upload has no picture of its own: the editor waits for the server", optimistic(start, { action: "remove-video", lessonId: id(52) }) === null)

    let refused = ""
    try {
      coverInput("https://evil.example/x.jpg")
    } catch (e) {
      refused = (e as Error).message
    }
    check("a cover from anywhere but Storelib's storage is refused", /Upload the cover here/.test(refused) && coverInput("https://storelib.com/media/product-images/c.jpg") === "https://storelib.com/media/product-images/c.jpg" && coverInput("") === null)
    await applyAction(db as any, owner, "update-module", { moduleId: M, coverUrl: "https://storelib.com/media/product-images/m.jpg" })
    await applyAction(db as any, owner, "update-lesson", { lessonId: L1, coverUrl: "https://storelib.com/media/product-images/l.jpg" })
    const covered = await editorTree(db as any, TIME)
    check("a module and a lesson keep their covers", covered.modules[0]?.coverUrl === "https://storelib.com/media/product-images/m.jpg" && covered.modules[0]?.lessons.find((l) => l.id === L1)?.coverUrl === "https://storelib.com/media/product-images/l.jpg")
    let other = ""
    try {
      await applyAction(db as any, { ...owner, productId: PRIV, programId: PRIV }, "update-module", { moduleId: M, title: "Mine" })
    } catch (e) {
      other = (e as Error).message
    }
    check("another program's module is not found", /Module not found/.test(other))
  }

  console.log("\nSQL (part 200)")
  {
    const file = "200_learn_access_types.sql"
    const part = raw(`supabase/sql/run-now/${file}`)
    const lines = part.trimEnd().split("\n")
    check("line 1 is the summary, safe to run again, run after 74 and 102", /^\/\* .*\(round 33\), run after parts 74 and 102\..*Safe to run again\. \*\/$/.test(lines[0]))
    check("one statement per line, notify last", lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("only adds", !/DROP TABLE|DROP COLUMN|DROP CONSTRAINT|DELETE FROM|^UPDATE |TRUNCATE|CREATE POLICY|GRANT /im.test(part))
    check("the new columns, each added only when missing", ["community_courses ADD COLUMN IF NOT EXISTS access_mode text", "community_courses ADD COLUMN IF NOT EXISTS member_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]", "community_courses ADD COLUMN IF NOT EXISTS description text", "course_modules ADD COLUMN IF NOT EXISTS cover_url text", "course_lessons ADD COLUMN IF NOT EXISTS cover_url text"].every((s) => part.includes(s)))
    check("every constraint added only when missing", (part.match(/ADD CONSTRAINT/g) ?? []).length === 5 && (part.match(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = /g) ?? []).length === 5)
    check("the five choices, the list held to 1,000, covers https only", /access_mode IN \('free', 'level', 'paid', 'time', 'private'\)/.test(part) && /cardinality\(member_ids\) <= 1000/.test(part) && (part.match(/cover_url LIKE 'https:\/\/%'/g) ?? []).length === 2)
    check("the migration copy is the part, byte for byte", existsSync("supabase/migrations/20270128_learn_access_types.sql") && raw("supabase/migrations/20270128_learn_access_types.sql") === part)
    check("its README row and its check after column", raw("supabase/sql/run-now/README.md").includes(`| \`${file}\` |`) && /as p200_learn_access_types[,;]/.test(raw("supabase/sql/run-now/99_check_after.sql")) /* Changed on purpose (round 33 merge): part 202 is checked after it */)
    check("the check after also says the table stays server only", /not has_table_privilege\('authenticated', 'public\.community_courses', 'SELECT'\) as p200_learn_access_types/.test(raw("supabase/sql/run-now/99_check_after.sql")))
    check("in the built files and the parts record", raw("supabase/sql/run-four/3_of_4_latest.sql").includes(`-- part ${file}`) && raw("lib/admin/sql-parts.generated.ts").includes(`part: "200", file: "${file}"`))
  }

  console.log("\nWIRING")
  {
    const route = code("app/api/app/community/[id]/learn/members/route.ts")
    check("the members picker: communities on first, then whoever may manage Learn, names only", route.indexOf("requireCommunitiesOn()") > 0 && route.indexOf("requireCommunitiesOn()") < route.indexOf('requireCreatorCommunity(id, "manage_classroom")') && /withEmail: false/.test(route) && !/email:/.test(route.replace(/withEmail: false/, "")))
    const editor = code("components/community/learn/program-editor.tsx")
    check("the description is the product editor's own rich text field", /import \{ RichTextEditor \} from "@\/components\/app\/rich-text-editor"/.test(editor) && /<RichTextEditor/.test(editor) && /uploadImage=/.test(editor) && /import \{ RichTextEditor \} from "@\/components\/app\/rich-text-editor"/.test(code("app/app/products/new/product-editor.tsx")))
    check("Save and Cancel are the shared save bar; Publish saves on its own", /<EditorFoot /.test(editor) && /onCancel=\{\(\) => \{ setForm\(saved\)/.test(editor) && /learnRequest\(url, "PATCH", \{ status: next \}\)/.test(editor))
    check("the five choices as cards, each with what it needs", /value: "free"/.test(editor) && /value: "level"/.test(editor) && /value: "paid"/.test(editor) && /value: "time"/.test(editor) && /value: "private"/.test(editor) && /data-access-inputs=\{o\.value\}/.test(editor))
    check("no bar of its own in the page's flow, no inner scroll box", !/sticky bottom-0/.test(editor) && !/overflow-y-auto/.test(editor) && !/max-w-\[880px\]/.test(editor))
    const ce = code("app/app/products/new/course-editor.tsx")
    check("a new module and lesson carry the id made in the browser, and take the caret", /action: "add-module", moduleId, lessonId/.test(ce) && /action: "add-lesson", moduleId: m\.id, lessonId/.test(ce) && /el\.select\(\)/.test(ce))
    check("adding never waits: no button is held while a change is saved", !/disabled=\{busy\}[^\n]*data-add/.test(ce) && !/disabled=\{props\.busy\}/.test(ce) && !/\|\| props\.busy/.test(ce))
    check("a move glides, unless motion is asked to be less", /prefers-reduced-motion: reduce/.test(ce) && /translate: `0 \$\{own\}px`/.test(ce))
    const page = code("components/community/learn/program-page.tsx")
    check("the program page draws the cleaned description and the step that opens it", /cleanStoredHtml\(program\.descriptionHtml\)/.test(page) && /data-open-action="level"/.test(page) && /<BuyProgram/.test(page))
    const server = code("lib/communities/server/learn.ts")
    check("a private program is hidden from the shelf and from the lessons, checked by the same gate", /if \(privateToThem\(gates\.get\(r\.id\) as ProgramGate\)\)/.test(server) && /if \(privateToThem\(gate\)\) return found\("none"\)/.test(server))
    check("the Learn components still import no server code", ["components/community/learn/program-editor.tsx", "components/community/learn/program-page.tsx", "components/community/learn/learn-builder.tsx"].every((f) => !/server-only|lib\/communities\/server/.test(code(f))) && !/server-only|next\/headers/.test(code("lib/courses/editor-ops.ts")))
  }

  console.log("\nCOPY")
  {
    const mine = [
      "components/community/learn/program-editor.tsx",
      "components/community/learn/program-page.tsx",
      "components/community/learn/learn-builder.tsx",
      "components/community/learn/model.ts",
      "lib/communities/learn.ts",
      "lib/communities/server/learn.ts",
      "lib/courses/editor-ops.ts",
      "lib/courses/manage.ts",
      "app/app/products/new/course-editor.tsx",
      "app/api/app/community/[id]/learn/members/route.ts",
      "supabase/sql/run-now/200_learn_access_types.sql",
      "scripts/check-learn-round33.mjs",
      "tests/community-learn-access-round33.test.ts",
    ].filter((f) => existsSync(f))
    const banned = /\u2014|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform(?!:|-)/i
    const offenders = mine.filter((f) => banned.test(raw(f).replace(/transition-transform/g, "")))
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
