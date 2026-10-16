/**
 * ===========================================================================
 *  ROUND 32: WHAT A COMMUNITY WAS MISSING
 * ===========================================================================
 * Held from their inputs, against the in-memory database:
 *
 *   QUESTIONS   the questions an admin writes are checked (kinds, choices,
 *               ids, eight at most); what somebody answers is checked against
 *               them; joining asks them for a free join, a request and a
 *               paid one, keeps the answers with the words asked, refuses a
 *               missing answer with the question's id, skips an invite, and
 *               before part 186 joins as it always did
 *   REQUESTS    the queue carries the answers, emails only when allowed, and
 *               the CSV is every answer with formulas made harmless
 *   FIRST STEPS the list is checked; a member's list ticks a post, a comment,
 *               a lesson, an RSVP and a bio by itself, the rules and the
 *               admin's own steps when opened; hidden, finished, past 30
 *               days or the owner: nothing
 *   WELCOME     the message goes once per member, from the owner, only with
 *               Chat on, and a failed send is not counted as sent
 *   SCHEDULED   a draft may be half written, a scheduled post needs what a
 *               post needs and a time; who may change one; the run puts each
 *               up once, as its author, and fails what cannot go up
 *   INVITES     the addresses in a paste or a CSV; members, this week's
 *               invites and the day's limit are skipped
 *   SQL         parts 186 to 188 follow the run-now rules
 *   WIRING      the routes' gates, the cron, the join form, the feed
 *   COPY        no em dash, no banned word, no server code in a client file
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"
import { fakeDb } from "./_fake-db"
import { answerText, checkJoinAnswers, checkJoinQuestions, draftComplete, readJoinAnswers, readJoinQuestions, type JoinQuestion } from "@/lib/communities/join-questions"
import { checkOnboarding, checklistWindow, readOnboarding, stepUrl, welcomeText } from "@/lib/communities/onboarding-checklist"
import { checkScheduledInput, fromLocalParts, localParts } from "@/lib/communities/scheduled-posts"
import { parseEmailList, BULK_INVITE_MAX } from "@/lib/communities/bulk-invites"
import { joinCommunity } from "@/lib/communities/server/join"
import { answersCsv, listJoinRequests, readJoinForm, saveJoinForm } from "@/lib/communities/server/join-questions"
import { markStep, memberChecklist, saveOnboardingConfig, welcomeNewMember } from "@/lib/communities/server/onboarding-checklist"
import { createScheduled, deleteScheduled, publishDuePosts, updateScheduled } from "@/lib/communities/server/scheduled-posts"
import { inviteList } from "@/lib/communities/server/bulk-invites"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(untt(raw(p), p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const A = (x: unknown) => x as Any

const C = "c0000000-0000-4000-8000-000000000001"
const U = "a0000000-0000-4000-8000-000000000001"
const U2 = "a0000000-0000-4000-8000-000000000002"
const MOD = "a0000000-0000-4000-8000-0000000000bb"
const OWNER = "a0000000-0000-4000-8000-0000000000aa"
const FREE_TIER = "b0000000-0000-4000-8000-000000000002"
const PAID_TIER = "b0000000-0000-4000-8000-000000000001"
const TIER_PRODUCT = "d0000000-0000-4000-8000-000000000001"
const CREATOR = "e0000000-0000-4000-8000-000000000001"
const FEED = "f0000000-0000-4000-8000-000000000001"
const ANN = "f0000000-0000-4000-8000-000000000002"
const NOW = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()

const QUESTIONS = [
  { kind: "short", label: "What do you make?", required: true },
  { kind: "choice", label: "How did you hear about us?", required: true, options: ["A friend", "Instagram", "Search"] },
  { kind: "multi", label: "What are you here for?", required: false, options: ["Feedback", "Friends", "Courses"] },
  { kind: "email", label: "Your work email", required: false },
]

function world(o: { access?: string; approval?: boolean; paidOnly?: boolean; chat?: boolean; extra?: Record<string, Any[]>; fail?: Record<string, { code?: string; message: string }> } = {}) {
  return fakeDb(
    {
      communities: [
        {
          id: C,
          slug: "makers",
          name: "Makers",
          tagline: "People who make things",
          description: "",
          creator_id: CREATOR,
          owner_user_id: OWNER,
          access: o.access ?? "free",
          visibility: "public",
          status: "published",
          approval_required: o.approval ?? false,
          chat_enabled: o.chat ?? true,
          member_count: 12,
          benefits: [],
          rules: [{ title: "Be kind", body: "" }],
          faq: [],
          onboarding: {},
          deleted_at: null,
          suspended_at: null,
          archived_at: null,
          platform_hidden: false,
        },
      ],
      community_tiers: [
        { id: PAID_TIER, community_id: C, name: "Pro", kind: "paid", billing: "recurring", product_id: TIER_PRODUCT, position: 1, is_default: false, archived_at: null, benefits: [] },
        ...(o.paidOnly ? [] : [{ id: FREE_TIER, community_id: C, name: "Members", kind: "free", billing: null, product_id: null, position: 0, is_default: true, archived_at: null, benefits: [] }]),
      ],
      community_access_products: [{ community_id: C, tier_id: PAID_TIER, product_id: TIER_PRODUCT }],
      community_members: [
        { id: "m-owner", community_id: C, user_id: OWNER, role: "owner", source: "owner", status: "active", tier_id: null, banned_at: null, joined_at: iso(NOW - 400 * 86_400_000) },
        { id: "m-mod", community_id: C, user_id: MOD, role: "moderator", source: "free", status: "active", tier_id: FREE_TIER, banned_at: null, joined_at: iso(NOW - 90 * 86_400_000) },
      ],
      community_invites: [],
      community_spaces: [
        { id: FEED, community_id: C, slug: "general", name: "General", kind: "feed", position: 0, view_access: {}, post_role: "member", comments_enabled: true, archived_at: null, created_at: iso(NOW) },
        { id: ANN, community_id: C, slug: "announcements", name: "Announcements", kind: "announcements", position: 1, view_access: {}, post_role: "admin", comments_enabled: true, archived_at: null, created_at: iso(NOW) },
      ],
      products: [{ id: TIER_PRODUCT, title: "Makers Pro", slug: "makers-pro", type: "membership", status: "published", price_cents: 1900, creator_id: CREATOR, community_id: C }],
      membership_plans: [{ product_id: TIER_PRODUCT, monthly_price_cents: 1900, yearly_price_cents: 19000, currency: "usd" }],
      creators: [{ id: CREATOR, user_id: OWNER, slug: "ana", display_name: "Ana", stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true }],
      profiles: [
        { id: OWNER, username: "ana", display_name: "Ana Maker", avatar_url: null, email: "ana@example.com" },
        { id: U, username: "bo", display_name: "Bo Smith", avatar_url: null, email: "bo@example.com" },
        { id: U2, username: "cy", display_name: "=SUM(A1)", avatar_url: null, email: "cy@example.com" },
        { id: MOD, username: "mo", display_name: "Mo", avatar_url: null, email: "mo@example.com" },
      ],
      entitlements: [],
      memberships: [],
      reviews: [],
      community_audit_log: [],
      community_activity: [],
      community_courses: [],
      community_join_forms: [],
      community_join_answers: [],
      community_onboarding: [],
      community_onboarding_progress: [],
      community_scheduled_posts: [],
      community_conversations: [],
      ...(o.extra ?? {}),
    },
    {
      unique: { community_members: [["community_id", "user_id"]], community_onboarding_progress: [["community_id", "user_id", "step"]], community_join_answers: [["community_id", "user_id"]] },
      failWith: o.fail,
    },
  )
}

async function main() {
  /* ── Questions, checked ──────────────────────────────────────────────── */
  console.log("\nQuestions, checked")
  {
    const q = checkJoinQuestions(QUESTIONS, () => 0.5)
    check("four questions take ids and keep their order", q.ok && q.value.length === 4 && q.value.every((x) => /^q_[a-z0-9]{8}$/.test(x.id)) && new Set(q.value.map((x) => x.id)).size === 4 && q.value[1].label === "How did you hear about us?")
    check("a question with no words is refused at its place", (() => { const r = checkJoinQuestions([QUESTIONS[0], { kind: "short", label: "  " }]); return r.ok === false && r.index === 1 })())
    check("an unknown kind is refused", !checkJoinQuestions([{ kind: "date", label: "When?" }]).ok)
    check("a choice needs two different choices", !checkJoinQuestions([{ kind: "choice", label: "Pick", options: ["One"] }]).ok && !checkJoinQuestions([{ kind: "choice", label: "Pick", options: ["One", "one"] }]).ok)
    check("eight questions at most", !checkJoinQuestions(Array.from({ length: 9 }, () => QUESTIONS[0])).ok && checkJoinQuestions(Array.from({ length: 8 }, () => QUESTIONS[0])).ok)
    check("an id that is already taken in the list is made new", (() => { const r = checkJoinQuestions([{ ...QUESTIONS[0], id: "q_aaaaaaaa" }, { ...QUESTIONS[0], id: "q_aaaaaaaa" }]); return r.ok && r.value[0].id === "q_aaaaaaaa" && r.value[1].id !== "q_aaaaaaaa" })())
    check("a text question keeps no choices", (() => { const r = checkJoinQuestions([{ kind: "short", label: "Hi", options: ["x", "y"] }]); return r.ok && r.value[0].options.length === 0 })())
    check("read back, a malformed one is left out", readJoinQuestions([{ id: "bad", kind: "short", label: "x" }, { id: "q_abcdefgh", kind: "short", label: "Fine" }, { id: "q_abcdefgi", kind: "choice", label: "One", options: ["a"] }]).length === 1)
  }

  console.log("\nAnswers, checked")
  const asked = (checkJoinQuestions(QUESTIONS) as { value: JoinQuestion[] }).value
  const [qShort, qChoice, qMulti, qEmail] = asked
  {
    check("a required answer missing is refused with its question", (() => { const r = checkJoinAnswers(asked, { [qChoice.id]: "A friend" }); return r.ok === false && r.id === qShort.id })())
    check("a choice that is not one of the question's is refused", !checkJoinAnswers(asked, { [qShort.id]: "Pots", [qChoice.id]: "TikTok" }).ok)
    check("one choice is one", !checkJoinAnswers(asked, { [qShort.id]: "Pots", [qChoice.id]: ["A friend", "Search"] }).ok)
    check("an email that is not one is refused", !checkJoinAnswers(asked, { [qShort.id]: "Pots", [qChoice.id]: "Search", [qEmail.id]: "not an email" }).ok)
    const ok = checkJoinAnswers(asked, { [qShort.id]: "  Pots   and   bowls ", [qChoice.id]: "Search", [qMulti.id]: ["Courses", "Feedback", "Courses"], [qEmail.id]: "Bo@Example.COM", q_zzzzzzzz: "dropped" })
    check("good answers are kept, cleaned, with the words asked", ok.ok && ok.value.length === 4 && ok.value[0].value === "Pots and bowls" && ok.value[0].label === "What do you make?")
    check("several choices keep the question's order, once each", ok.ok && JSON.stringify(ok.value[2].value) === JSON.stringify(["Feedback", "Courses"]))
    check("an email is kept in lower case", ok.ok && ok.value[3].value === "bo@example.com")
    check("an optional question left empty is not an answer", (() => { const r = checkJoinAnswers(asked, { [qShort.id]: "Pots", [qChoice.id]: "Search" }); return r.ok && r.value.length === 2 })())
    check("a paragraph keeps its lines, a short answer is one line", (() => { const r = checkJoinAnswers([{ ...qShort, kind: "long" }], { [qShort.id]: "one\n\n\n\ntwo" }); return r.ok && r.value[0].value === "one\n\ntwo" })())
    check("too long is refused", !checkJoinAnswers(asked, { [qShort.id]: "x".repeat(201), [qChoice.id]: "Search" }).ok)
    check("answer text joins choices", answerText({ value: ["a", "b"] }) === "a, b")
    check("the form's button waits for the required ones", !draftComplete(asked, { [qShort.id]: "x" }) && draftComplete(asked, { [qShort.id]: "x", [qChoice.id]: "Search" }))
    check("answers read back leave out a broken one", readJoinAnswers([{ id: "q_a", label: "L", value: "" }, { id: "q_b", label: "L", value: "v" }]).length === 1)
  }

  /* ── Joining with questions ──────────────────────────────────────────── */
  console.log("\nJoining with questions")
  const withForm = (db: ReturnType<typeof world>) => {
    db.tables.community_join_forms.push({ community_id: C, questions: asked })
    return db
  }
  const memberOf = (db: ReturnType<typeof world>, u = U) => db.tables.community_members.find((m: Any) => m.user_id === u)
  const answersOf = (db: ReturnType<typeof world>, u = U) => db.tables.community_join_answers.find((m: Any) => m.user_id === u)
  const good = { [qShort.id]: "Pots", [qChoice.id]: "Search" }
  {
    const db = withForm(world())
    const no = A(await joinCommunity(db, C, U))
    check("a free join without the answers is refused, pointing at the first", !no.ok && no.status === 400 && no.error === "answers_needed" && no.field === qShort.id && !memberOf(db))
    const yes = A(await joinCommunity(db, C, U, { answers: good }))
    check("with them, in at once", yes.ok && yes.state === "member" && memberOf(db)?.status === "active")
    check("and the answers are kept with the words asked", answersOf(db)?.answers?.length === 2 && answersOf(db).answers[1].label === "How did you hear about us?" && answersOf(db).answers[1].value === "Search")
  }
  {
    const db = withForm(world({ approval: true }))
    const r = A(await joinCommunity(db, C, U, { answers: good, note: "hello" }))
    check("approval: a request with its answers", r.ok && r.state === "pending" && memberOf(db)?.status === "pending" && answersOf(db)?.answers?.length === 2)
    const again = A(await joinCommunity(db, C, U))
    check("asking again while it waits is not asked the questions again", again.ok && again.state === "pending")
  }
  {
    const db = withForm(world({ access: "paid", paidOnly: true }))
    const no = A(await joinCommunity(db, C, U, { interval: "year" }))
    check("paid: the questions come before checkout", !no.ok && no.error === "answers_needed")
    const r = A(await joinCommunity(db, C, U, { interval: "year", answers: good }))
    check("answered: to checkout, nothing granted, the answers kept", r.ok && r.state === "checkout" && !memberOf(db) && answersOf(db)?.answers?.length === 2)
  }
  {
    const db = withForm(world())
    db.tables.community_members.push({ id: "m-inv", community_id: C, user_id: U, role: "member", source: "invite", status: "cancelled", tier_id: FREE_TIER, invite_id: "inv-1", banned_at: null })
    const r = A(await joinCommunity(db, C, U))
    check("somebody who came in by invite is not asked", r.ok && r.state === "member")
  }
  {
    const db = world({ fail: { community_join_forms: { code: "42P01", message: "relation does not exist" } } })
    const r = A(await joinCommunity(db, C, U))
    check("before part 186 a join asks nothing, as before", r.ok && r.state === "member")
    check("  and the form reads as not ready", (await readJoinForm(db, C)).ready === false)
  }
  {
    const db = world()
    const saved = await saveJoinForm(db, { communityId: C, actorId: OWNER, raw: QUESTIONS })
    check("saving the questions writes one row and the audit log", saved.ok && db.tables.community_join_forms.length === 1 && db.tables.community_audit_log.some((r: Any) => r.action === "join_form.saved"))
    const bad = await saveJoinForm(db, { communityId: C, actorId: OWNER, raw: [{ kind: "short", label: "" }] })
    check("a bad list is refused with its place, nothing changed", bad.ok === false && bad.status === 400 && bad.index === 0 && (db.tables.community_join_forms[0].questions as Any[]).length === 4)
  }

  /* ── Requests ────────────────────────────────────────────────────────── */
  console.log("\nRequests")
  {
    const db = withForm(world({ approval: true }))
    await joinCommunity(db, C, U, { answers: { ...good, [qEmail.id]: "bo@work.com" } })
    await joinCommunity(db, C, U2, { answers: { [qShort.id]: "=HYPERLINK(\"x\")", [qChoice.id]: "A friend" } })
    const list = await listJoinRequests(db, C, { withEmail: false })
    check("the queue holds both, with their answers", list.total === 2 && list.rows.length === 2 && list.rows.every((r) => r.answers.length >= 2))
    check("no emails for a moderator", list.rows.every((r) => r.email === null))
    const withEmail = await listJoinRequests(db, C, { withEmail: true })
    check("emails for the owner and admins", withEmail.rows.some((r) => r.email === "bo@example.com"))
    const csv = await answersCsv(db, C, { withEmail: true })
    const lines = csv.trim().split("\r\n")
    check("the CSV: a header with each question, a row per person", lines.length === 3 && lines[0].includes("What do you make?") && lines[0].includes("Your work email") && lines[0].startsWith("Name,Username,Email,Status,Answered"))
    check("  a formula in an answer or a name is made harmless", csv.includes("'=HYPERLINK") && csv.includes("'=SUM(A1)") && !/(^|,)=/m.test(csv))
    check("  the status is the one now", lines.slice(1).every((l) => l.includes(",pending,")))
  }

  /* ── First steps ─────────────────────────────────────────────────────── */
  console.log("\nFirst steps, checked")
  {
    const c = checkOnboarding({ steps: [{ kind: "intro" }, { kind: "rules", label: "Read our rules" }, { kind: "custom", label: "Book a call", url: "https://cal.com/ana" }], dmEnabled: true, dmBody: "Hi {name}" }, () => 0.1)
    check("built in steps take their kind as id, a custom one c_ and six", c.ok && c.value.steps[0].id === "intro" && /^c_[a-z0-9]{6}$/.test(c.value.steps[2].id))
    check("a built in step twice is refused", !checkOnboarding({ steps: [{ kind: "intro" }, { kind: "intro" }] }).ok)
    check("a custom step needs words", !checkOnboarding({ steps: [{ kind: "custom", label: "" }] }).ok)
    check("a link is https or a path here, never javascript: or http:", stepUrl("javascript:alert(1)") === null && stepUrl("http://x.com") === null && stepUrl("//evil.com") === null && stepUrl("/community/makers/learn") === "/community/makers/learn" && stepUrl("https://cal.com/ana") === "https://cal.com/ana")
    check("the welcome message on needs words", !checkOnboarding({ steps: [], dmEnabled: true, dmBody: "  " }).ok)
    check("read back, a message turned on with no words is off", readOnboarding({ steps: [], dm_enabled: true, dm_body: "" }).dmEnabled === false)
    check("{name} becomes the first name, or there", welcomeText("Hi {name}!", "Bo Smith") === "Hi Bo!" && welcomeText("Hi {name}!", "") === "Hi there!" && welcomeText("Hi {name}", "@bo") === "Hi bo")
    check("30 days after joining", checklistWindow(iso(NOW - 29 * 86_400_000), NOW) && !checklistWindow(iso(NOW - 31 * 86_400_000), NOW) && !checklistWindow(null, NOW))
  }

  console.log("\nFirst steps, for a member")
  const member = (db: ReturnType<typeof world>, joinedDaysAgo = 2, bio: string | null = null) => {
    const row = { id: "m-u", community_id: C, user_id: U, role: "member", source: "free", status: "active", tier_id: FREE_TIER, banned_at: null, joined_at: iso(NOW - joinedDaysAgo * 86_400_000), bio, level: 1, points: 0 }
    db.tables.community_members.push(row)
    return row
  }
  const viewerOf = (row: Any, extra: Any = {}) => ({ userId: row.user_id, member: row, role: row.role, active: row.status === "active", status: row.status, tierId: row.tier_id, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...extra })
  const communityOf = (db: ReturnType<typeof world>) => db.tables.communities[0] as Any
  {
    const db = world()
    const saved = await saveOnboardingConfig(db, { communityId: C, actorId: OWNER, raw: { steps: [{ kind: "intro" }, { kind: "profile" }, { kind: "rules" }, { kind: "comment" }, { kind: "custom", label: "Book a call", url: "https://cal.com/ana" }] } })
    check("the list saves", saved.ok && db.tables.community_onboarding.length === 1)
    const row = member(db)
    let list = await memberChecklist(db, communityOf(db), viewerOf(row) as Any, NOW)
    check("a new member sees every step, none done", !!list && list.total === 5 && list.done === 0)
    check("  with where to do each", list!.items[0].href === "/community/makers" && list!.items[1].href === `/community/makers/members/${U}` && list!.items[2].href === "/community/makers/about#community-rules" && list!.items[4].href === "https://cal.com/ana")
    db.tables.community_activity.push({ id: 1, community_id: C, user_id: U, kind: "post" }, { id: 2, community_id: C, user_id: U2, kind: "comment" })
    row.bio = "I make pots"
    list = await memberChecklist(db, communityOf(db), viewerOf(row) as Any, NOW)
    check("a post and a bio tick themselves; somebody else's comment does not", list!.items[0].done && list!.items[1].done && !list!.items[3].done && list!.done === 2)
    const notManual = await markStep(db, communityOf(db), viewerOf(row) as Any, "comment")
    check("a step done by doing it cannot be ticked by hand", notManual.ok === false && notManual.status === 409)
    const unknown = await markStep(db, communityOf(db), viewerOf(row) as Any, "learn")
    check("a step not on the list cannot be ticked", unknown.ok === false && unknown.status === 404)
    const rules = await markStep(db, communityOf(db), viewerOf(row) as Any, "rules")
    const twice = await markStep(db, communityOf(db), viewerOf(row) as Any, "rules")
    check("the rules tick when opened, once", rules.ok && twice.ok && db.tables.community_onboarding_progress.filter((p: Any) => p.step === "rules").length === 1)
    db.tables.community_activity.push({ id: 3, community_id: C, user_id: U, kind: "comment" })
    const custom = (await memberChecklist(db, communityOf(db), viewerOf(row) as Any, NOW))!.items[4].id
    await markStep(db, communityOf(db), viewerOf(row) as Any, custom)
    check("all done: nothing to show", (await memberChecklist(db, communityOf(db), viewerOf(row) as Any, NOW)) === null)
  }
  {
    const db = world()
    await saveOnboardingConfig(db, { communityId: C, actorId: OWNER, raw: { steps: [{ kind: "intro" }] } })
    const row = member(db, 45)
    check("past 30 days: nothing", (await memberChecklist(db, communityOf(db), viewerOf(row) as Any, NOW)) === null)
    const fresh = member(world(), 1)
    const db2 = world()
    await saveOnboardingConfig(db2, { communityId: C, actorId: OWNER, raw: { steps: [{ kind: "intro" }] } })
    db2.tables.community_members.push(fresh)
    await markStep(db2, communityOf(db2), viewerOf(fresh) as Any, "dismissed")
    check("hidden: nothing", (await memberChecklist(db2, communityOf(db2), viewerOf(fresh) as Any, NOW)) === null)
    const owner = db2.tables.community_members.find((m: Any) => m.user_id === OWNER)
    check("the owner: nothing", (await memberChecklist(db2, communityOf(db2), viewerOf({ ...owner, joined_at: iso(NOW) }, { isOwner: true }) as Any, NOW)) === null)
    check("not a member: nothing, and nothing ticked", (await memberChecklist(db2, communityOf(db2), viewerOf({ ...fresh, status: "pending" }) as Any, NOW)) === null && !(await markStep(db2, communityOf(db2), viewerOf({ ...fresh, status: "pending" }) as Any, "dismissed")).ok)
    const before = world({ fail: { community_onboarding: { code: "42P01", message: "missing" } } })
    before.tables.community_members.push(fresh)
    check("before part 187: nothing, no error", (await memberChecklist(before, communityOf(before), viewerOf(fresh) as Any, NOW)) === null)
  }

  console.log("\nThe welcome message")
  {
    const sent: { to: string; body: string; from: string | null }[] = []
    const direct = {
      directReady: async (_db: Any, c: Any) => !!c.chat_enabled,
      openConversation: async (_db: Any, _c: Any, v: Any, other: Any) => ({ ok: true as const, value: { id: `conv-${other}`, other: { userId: other, name: "Bo Smith" } as Any } }),
      conversationOf: async (_db: Any, _c: Any, v: Any, id: string) => ({ id, user_a: v.userId, user_b: id.slice(5) }) as Any,
      sendDirectMessage: async (_db: Any, _c: Any, v: Any, conv: Any, body: Any) => {
        sent.push({ to: conv.user_b, body: body.body, from: v.userId })
        return { ok: true as const, value: {} as Any }
      },
    }
    const db = world()
    await saveOnboardingConfig(db, { communityId: C, actorId: OWNER, raw: { steps: [], dmEnabled: true, dmBody: "Welcome, {name}. Say hi in General." } })
    const row = member(db)
    const first = await welcomeNewMember(db, row as Any, { direct: direct as Any })
    const second = await welcomeNewMember(db, row as Any, { direct: direct as Any })
    check("sent once, from the owner, with their first name", first === "sent" && second === "already" && sent.length === 1 && sent[0].from === OWNER && sent[0].to === U && sent[0].body === "Welcome, Bo. Say hi in General.")
    check("an admin or the owner joining is not welcomed", (await welcomeNewMember(db, { ...row, user_id: U2, role: "admin" } as Any, { direct: direct as Any })) === "off")
    const noChat = world({ chat: false })
    await saveOnboardingConfig(noChat, { communityId: C, actorId: OWNER, raw: { steps: [], dmEnabled: true, dmBody: "Hi" } })
    check("Chat off: not sent", (await welcomeNewMember(noChat, member(noChat) as Any, { direct: direct as Any })) === "off")
    const broken = world()
    await saveOnboardingConfig(broken, { communityId: C, actorId: OWNER, raw: { steps: [], dmEnabled: true, dmBody: "Hi" } })
    const failing = { ...direct, sendDirectMessage: async () => ({ ok: false as const, error: "no" }) }
    const r = await welcomeNewMember(broken, member(broken) as Any, { direct: failing as Any })
    check("a failed send is not counted as sent, so it can go later", r === "failed" && !broken.tables.community_onboarding_progress.some((p: Any) => p.step === "welcome_dm"))
    const off = world()
    check("no message set: nothing", (await welcomeNewMember(off, member(off) as Any, { direct: direct as Any })) === "off")
    check("membership.ts sends it when somebody becomes active, and never throws into the join", /welcomeNewMember\(db, row\)/.test(raw("lib/communities/server/membership.ts")) && /try \{\s*const \{ welcomeNewMember \}/.test(raw("lib/communities/server/membership.ts")))
  }

  /* ── Scheduled posts ─────────────────────────────────────────────────── */
  console.log("\nScheduled posts, checked")
  {
    check("a draft may be half written", checkScheduledInput({ title: "Idea" }).ok && !checkScheduledInput({}).ok)
    const at = iso(NOW + 3_600_000)
    check("scheduled needs a space, a title and words", !checkScheduledInput({ title: "T", body: "B", publishAt: at }).ok && !checkScheduledInput({ spaceId: FEED, body: "B", publishAt: at }).ok && checkScheduledInput({ spaceId: FEED, title: "T", body: "B", publishAt: at }).ok)
    check("not in the past, not more than a year ahead", !checkScheduledInput({ spaceId: FEED, title: "T", body: "B", publishAt: iso(NOW - 1000) }).ok && !checkScheduledInput({ spaceId: FEED, title: "T", body: "B", publishAt: iso(NOW + 400 * 86_400_000) }).ok)
    const [day, time] = localParts(at)
    check("the form's day and time come back to the same minute", fromLocalParts(day, time) === new Date(Math.floor(Date.parse(at) / 60_000) * 60_000).toISOString() && fromLocalParts("x", "10:00") === null)
  }

  console.log("\nScheduled posts, kept and put up")
  {
    const db = world()
    const community = communityOf(db)
    const ownerViewer = { userId: OWNER, role: "owner", active: true, perms: null, member: null, isOwner: true } as Any
    const modViewer = { userId: MOD, role: "moderator", active: true, perms: null, member: null } as Any
    const at = iso(NOW + 3_600_000)
    const made = A(await createScheduled(db, { community, viewer: ownerViewer, userId: OWNER }, { spaceId: ANN, title: "Call on Friday", body: "Bring a pot.", publishAt: at }))
    check("the owner schedules an announcement", made.ok && made.post.status === "scheduled" && made.post.spaceName === "Announcements" && made.post.mine)
    const modAnn = A(await createScheduled(db, { community, viewer: modViewer, userId: MOD }, { spaceId: ANN, title: "x", body: "y", publishAt: at }))
    check("a moderator may not schedule into Announcements", !modAnn.ok && modAnn.status === 403 && modAnn.field === "space")
    const draft = A(await createScheduled(db, { community, viewer: modViewer, userId: MOD }, { spaceId: FEED, title: "Half an idea" }))
    check("a moderator keeps a draft in General", draft.ok && draft.post.status === "draft")
    const notTheirs = A(await updateScheduled(db, { community, viewer: modViewer, userId: MOD }, made.post.id, { title: "Mine now" }))
    check("a moderator cannot change the owner's", !notTheirs.ok && notTheirs.status === 403)
    const adminEdits = A(await updateScheduled(db, { community, viewer: ownerViewer, userId: OWNER }, draft.post.id, { title: "Whole idea", body: "Here it is.", publishAt: iso(NOW + 7_200_000) }))
    check("the owner can change anybody's, a draft becomes scheduled", adminEdits.ok && adminEdits.post.status === "scheduled" && adminEdits.post.title === "Whole idea")

    /* The run, with the post path stood in: who it posts as, and what. */
    const posted: { as: string | null; role: string | null; space: string | null; title: string }[] = []
    const make = (async (w: Any, input: Any) => {
      posted.push({ as: w.viewer.userId, role: w.viewer.role, space: input.spaceId, title: input.title })
      return { ok: true, value: { id: `post-${posted.length}` } }
    }) as Any
    for (const r of db.tables.community_scheduled_posts) (r as Any).publish_at = iso(NOW - 60_000)
    const [one, two] = await Promise.all([publishDuePosts(db, NOW, 10_000, make), publishDuePosts(db, NOW, 10_000, make)])
    check("two runs at once put each up once", one.published + two.published === 2 && posted.length === 2)
    check("  as its author, into its space", posted.some((p) => p.as === OWNER && p.space === ANN && p.title === "Call on Friday") && posted.some((p) => p.as === MOD && p.space === FEED))
    check("  marked posted, with the post it became", db.tables.community_scheduled_posts.every((r: Any) => r.status === "published" && /^post-/.test(r.post_id) && r.published_at))
    check("a posted one cannot be changed or published again", !A(await updateScheduled(db, { community, viewer: ownerViewer, userId: OWNER }, made.post.id, { publishNow: true }, make)).ok)

    const gone = A(await createScheduled(db, { community, viewer: modViewer, userId: MOD }, { spaceId: FEED, title: "Later", body: "words", publishAt: at }))
    db.tables.community_members.find((m: Any) => m.user_id === MOD).status = "cancelled"
    db.tables.community_scheduled_posts.find((r: Any) => r.id === gone.post.id).publish_at = iso(NOW - 1000)
    const run = await publishDuePosts(db, NOW, 10_000, make)
    check("an author who left: failed with the reason, not posted", run.failed === 1 && posted.length === 2 && /no longer a member/.test(db.tables.community_scheduled_posts.find((r: Any) => r.id === gone.post.id).error))

    const noSpace = A(await createScheduled(db, { community, viewer: ownerViewer, userId: OWNER }, { spaceId: FEED, title: "Space goes", body: "words", publishAt: at }))
    const nsRow = db.tables.community_scheduled_posts.find((r: Any) => r.id === noSpace.post.id)
    nsRow.space_id = null
    nsRow.publish_at = iso(NOW - 1000)
    await publishDuePosts(db, NOW, 10_000, make)
    check("its space removed: failed, saying so", nsRow.status === "failed" && /space was removed/.test(nsRow.error))

    db.tables.community_scheduled_posts.push({ id: "stale", community_id: C, author_id: OWNER, space_id: FEED, title: "t", body: "b", status: "publishing", claimed_at: iso(NOW - 20 * 60_000), attempts: 1 })
    await publishDuePosts(db, NOW, 10_000, make)
    check("left half way for 15 minutes: failed, never posted twice", db.tables.community_scheduled_posts.find((r: Any) => r.id === "stale").status === "failed" && posted.length === 2)

    const del = A(await createScheduled(db, { community, viewer: ownerViewer, userId: OWNER }, { spaceId: FEED, title: "Delete me" }))
    const removed = await deleteScheduled(db, { community, viewer: ownerViewer, userId: OWNER }, del.post.id)
    check("a draft is deleted", removed.ok && !db.tables.community_scheduled_posts.some((r: Any) => r.id === del.post.id))

    const now = A(await createScheduled(db, { community, viewer: ownerViewer, userId: OWNER }, { spaceId: FEED, title: "Now", body: "Right now" }))
    const pub = A(await updateScheduled(db, { community, viewer: ownerViewer, userId: OWNER }, now.post.id, { publishNow: true }, make))
    check("publish now puts it up at once through the same path", pub.ok && pub.post.status === "published" && posted.at(-1)?.title === "Now")

    const missing = world({ fail: { community_scheduled_posts: { code: "42P01", message: "missing" } } })
    check("before part 188 the run does nothing and says so", (await publishDuePosts(missing, NOW, 10_000, make)).available === false)
  }

  /* ── Invite a list ───────────────────────────────────────────────────── */
  console.log("\nInvite a list")
  {
    const p = parseEmailList("Name,Email\nAna,ana@example.com\n\"Bo\" <BO@example.com>, cy@example.com; ana@example.com\nnot-an-email\n")
    check("addresses from a CSV, a paste and angle brackets, once each, lower case", JSON.stringify(p.emails) === JSON.stringify(["ana@example.com", "bo@example.com", "cy@example.com"]) && p.repeated === 1)
    const many = parseEmailList(Array.from({ length: 250 }, (_, i) => `p${i}@ex.com`).join("\n"))
    check(`${BULK_INVITE_MAX} a list, the rest counted`, many.emails.length === BULK_INVITE_MAX && many.over === 50)
    const db = world()
    db.tables.community_members.push({ id: "m-u", community_id: C, user_id: U, role: "member", source: "free", status: "active", tier_id: FREE_TIER, banned_at: null })
    db.tables.community_invites.push({ id: "inv-old", community_id: C, email: "dee@example.com", revoked_at: null, created_at: iso(NOW - 2 * 86_400_000) })
    const r = A(await inviteList(db, { community: communityOf(db), actorId: OWNER, inviterName: "Ana", text: "bo@example.com\ndee@example.com\neve@example.com\nfay@example.com", tierId: null, now: NOW }))
    check("a member and this week's invite are skipped, the rest invited", r.ok && r.result.members === 1 && r.result.recent === 1 && r.result.sent === 2 && db.tables.community_invites.filter((i: Any) => i.email === "eve@example.com" || i.email === "fay@example.com").length === 2)
    check("  each one use, for its address", db.tables.community_invites.filter((i: Any) => i.email === "eve@example.com").every((i: Any) => i.max_uses === 1 && /^[0-9a-f]{64}$/.test(i.token_hash)))
    const full = world()
    for (let i = 0; i < 499; i++) full.tables.community_invites.push({ id: `x${i}`, community_id: C, email: `old${i}@ex.com`, revoked_at: null, created_at: iso(NOW - 3_600_000) })
    const capped = A(await inviteList(full, { community: communityOf(full), actorId: OWNER, inviterName: "Ana", text: "a1@ex.com, a2@ex.com, a3@ex.com", tierId: null, now: NOW }))
    check("the community's 500 a day: the rest left for tomorrow", capped.ok && capped.result.sent === 1 && capped.result.limited === 2)
    check("a tier that is not this community's is refused", !A(await inviteList(world(), { community: communityOf(world()), actorId: OWNER, inviterName: "Ana", text: "a@ex.com", tierId: "b0000000-0000-4000-8000-00000000ffff", now: NOW })).ok)
    check("nothing found: refused with what to do", !A(await inviteList(world(), { community: communityOf(world()), actorId: OWNER, inviterName: "Ana", text: "nothing here", tierId: null, now: NOW })).ok)
  }

  /* ── SQL parts ───────────────────────────────────────────────────────── */
  console.log("\nSQL parts 186 to 188")
  const PARTS: [string, string, string[]][] = [
    ["186_community_join_questions.sql", "20270125_community_join_questions.sql", ["community_join_forms", "community_join_answers"]],
    ["187_community_onboarding_checklist.sql", "20270126_community_onboarding_checklist.sql", ["community_onboarding", "community_onboarding_progress"]],
    ["188_community_scheduled_posts.sql", "20270127_community_scheduled_posts.sql", ["community_scheduled_posts"]],
  ]
  const after = raw("supabase/sql/run-now/99_check_after.sql")
  const readme = raw("supabase/sql/run-now/README.md")
  for (const [file, migration, tables] of PARTS) {
    const part = raw(`supabase/sql/run-now/${file}`)
    const lines = part.trimEnd().split("\n")
    const n = file.split("_")[0]
    check(`${n}: line 1 is the summary, safe to run again`, /^\/\* .*\(round 32\), run after part 81\..*Safe to run again\. \*\/$/.test(lines[0]))
    check(`${n}: one statement per line, notify last`, lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check(`${n}: only adds`, !/DROP TABLE|DROP COLUMN|DELETE FROM|^UPDATE |TRUNCATE/im.test(part) && !/CREATE TABLE public|CREATE INDEX (?!IF NOT EXISTS)/.test(part))
    check(`${n}: every new table is server only`, tables.every((t) => part.includes(`CREATE TABLE IF NOT EXISTS public.${t} (`) && part.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`) && part.includes(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`) && part.includes(`TO service_role;`)))
    check(`${n}: no policy lets a browser in`, !/CREATE POLICY|GRANT [A-Z, ]+ TO (anon|authenticated)/i.test(part))
    check(`${n}: the migration copy is the part, byte for byte`, existsSync(`supabase/migrations/${migration}`) && raw(`supabase/migrations/${migration}`) === part)
    check(`${n}: its README row and its check after column`, readme.includes(`| \`${file}\` |`) && new RegExp(`as p${n}_\\w+[,;]`).test(after))
    check(`${n}: in the built files and the parts record`, raw("supabase/sql/run-four/3_of_4_latest.sql").includes(`-- part ${file}`) && raw("lib/admin/sql-parts.generated.ts").includes(`part: "${n}", file: "${file}"`))
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */
  console.log("\nWiring")
  {
    const gate = (p: string, action: string) => code(p).includes(`requireCreatorCommunity(id, "${action}")`) || code(p).includes(`requireCreatorCommunity(id, csv ? "manage_members" : "${action}")`)
    check("questions: manage_settings to read and write", gate("app/api/app/community/[id]/join-questions/route.ts", "manage_settings"))
    check("requests: approve_member, the CSV manage_members", gate("app/api/app/community/[id]/join-requests/route.ts", "approve_member") && code("app/api/app/community/[id]/join-requests/route.ts").includes('"manage_members"'))
    check("first steps: manage_settings", gate("app/api/app/community/[id]/onboarding/route.ts", "manage_settings"))
    check("scheduled posts: post, both routes", gate("app/api/app/community/[id]/scheduled-posts/route.ts", "post") && gate("app/api/app/community/[id]/scheduled-posts/[postId]/route.ts", "post"))
    check("invite a list: invite, a rate limit", gate("app/api/app/community/[id]/invites/bulk/route.ts", "invite") && code("app/api/app/community/[id]/invites/bulk/route.ts").includes("rateLimit("))
    check("a member's first steps: an active member, for themselves", code("app/api/community/[communityId]/get-started/route.ts").includes('requireMember(db, communityId, await sessionUserId(), "view")'))
    check("the questions for the join form: a published, open community only", /status !== "published"/.test(code("app/api/community/[communityId]/join-questions/route.ts")))
    check("the join route passes the answers and the question it refused", code("app/api/community/[communityId]/join/route.ts").includes("answers: body.answers") && code("app/api/community/[communityId]/join/route.ts").includes("field: answer.field"))
    check("the cron puts up what is due, only while communities are on", /on \? await publishDuePosts\(db/.test(code("app/api/cron/community/route.ts")))
    const jc = code("components/community/public/join-controls.tsx")
    check("the join form asks the questions and sends the answers", jc.includes("join-questions") && jc.includes("answers })") && jc.includes("JoinQuestionFields") && jc.includes('"answers_needed"'))
    check("a paid join with questions goes through POST join, not straight to checkout", /if \(asked\.length\) \{[\s\S]*?setRequestOpen\(true\)/.test(jc))
    check("the feed shows a new member's first steps on All", code("components/community/member/feed.tsx").includes("<GetStarted communityId={getStarted} viewer={viewer} />"))
  }

  /* ── Copy and client code ────────────────────────────────────────────── */
  console.log("\ncopy")
  const mine = [
    "components/community/creator/join-questions-panel.tsx",
    "components/community/creator/join-requests-panel.tsx",
    "components/community/creator/onboarding-panel.tsx",
    "components/community/creator/scheduled-posts-panel.tsx",
    "components/community/creator/bulk-invite-panel.tsx",
    "components/community/public/join-questions-form.tsx",
    "components/community/member/get-started.tsx",
    "lib/communities/join-questions.ts",
    "lib/communities/onboarding-checklist.ts",
    "lib/communities/scheduled-posts.ts",
    "lib/communities/bulk-invites.ts",
    "lib/communities/server/join-questions.ts",
    "lib/communities/server/onboarding-checklist.ts",
    "lib/communities/server/scheduled-posts.ts",
    "lib/communities/server/bulk-invites.ts",
    ...PARTS.map(([f]) => `supabase/sql/run-now/${f}`),
  ]
  for (const f of mine) {
    const text = raw(f)
    check(`${f}: no em dash, no banned word`, !text.includes("—") && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }
  for (const f of mine.filter((f) => f.startsWith("components/") || (f.startsWith("lib/communities/") && !f.includes("/server/")))) {
    check(`${f}: a client file imports no server code`, !/from "@\/lib\/communities\/server|next\/headers|"server-only"/.test(code(f)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
