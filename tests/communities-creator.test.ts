/**
 * ===========================================================================
 *  COMMUNITIES: THE CREATOR'S SIDE (/app/community)
 * ===========================================================================
 * Held from their inputs:
 *
 *   CREATE      the five fields and the price, checked the same on both
 *               sides; the three kinds stored as access and visibility.
 *   PRICES      a paid tier is sold by the memberships engine (monthly or
 *               yearly) or a one time community product, with
 *               products.community_id and its access row.
 *   NEXT STEPS  only what is not done, each gone once it is.
 *   PAGING      keyset cursors that cannot be turned into filter syntax;
 *               members and the export never load everything.
 *   CSV         a cell a spreadsheet would run is text.
 *   TIME        an event's wall clock in its own zone, across a DST change.
 *   MODERATION  a removed chat message is blanked in the same update;
 *               nobody acts on an equal or a senior, or their posts; every
 *               member action a screen offers is one the route takes and
 *               the role may take; the rules, the restricted people and the
 *               report's author actions are on the Moderation screen.
 *   GALLERY     at most twelve pictures and videos, pictures only from our
 *               storage, videos only this community's; a database without
 *               the column answers "run the update", never "try again".
 *   ROUTES      every route is behind the switch first, gated, rate limited.
 *   PAGES       every page 404s while the switch is off.
 *   SHELL       the sidebar row and the search entry only while it is on.
 *   CLIENT      no client screen imports server code.
 *   COPY        no em dash, no banned word.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import {
  accessForType,
  checkCreate,
  checkEvent,
  checkInvite,
  checkLevels,
  checkLinks,
  checkPrice,
  checkSpace,
  csvCell,
  csvRow,
  decodeCursor,
  encodeCursor,
  fillDays,
  htmlToText,
  keysetOr,
  nextSteps,
  parseMemberQuery,
  replayVideoId,
  taglineFrom,
  textToHtml,
  typeOf,
  utcToZonedParts,
  zonedTimeToUtc,
  type NextStepFacts,
  GALLERY_MAX,
  MEMBER_STATUS_FILTERS,
  MUTE_CHOICES,
  checkGallery,
  memberChoices,
  moveItem,
  settingsTabOf,
} from "@/components/community/creator/logic"
import { GALLERY_NOT_READY, checkGalleryForCommunity, saveGallery } from "@/lib/communities/server/gallery"
import { MEMBER_ACTIONS } from "@/lib/communities/server/moderation"
import { allowedActions, can } from "@/lib/communities/permissions"
import { actOnContent, actOnMember, contentActionFits, contentActionNeeds, memberActionNeeds, muteUntil } from "@/lib/communities/server/moderation"
import { hashInviteToken, newInviteToken } from "@/lib/communities/server/invites"
import { trendingScore } from "@/lib/communities/server/analytics"
import { matchPages } from "@/lib/search/app-pages"
import type { CommunityRow } from "@/lib/communities/types"
import { untt } from "./i18n-source"

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
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => stripComments(read(p))

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const UID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const COMMUNITY_ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const community = { id: COMMUNITY_ID, slug: "makers", name: "Makers", status: "published", access: "free" } as unknown as CommunityRow

async function main() {
  /* ── Create ──────────────────────────────────────────────────────────── */
  console.log("\ncreate")
  check("a name is needed", !checkCreate({ name: "  ", type: "free" }).ok)
  check("a free community needs only a name and a kind", checkCreate({ name: "Makers", type: "free" }).ok)
  const paidNoPrice = checkCreate({ name: "Makers", type: "paid", interval: "month" })
  check("a paid one needs a price", !paidNoPrice.ok && (paidNoPrice as { field?: string }).field === "price")
  const paid = checkCreate({ name: "Makers", type: "paid", price: "19", interval: "month" })
  check("a paid one keeps its price in cents and how often", paid.ok && paid.value.price?.cents === 1900 && paid.value.price.interval === "month")
  check("a one time price is allowed", checkCreate({ name: "M", type: "paid", price: "99", interval: "once" }).ok)
  check("prices under $1 are refused", !checkPrice("0.50", "month").ok)
  check("a monthly price over $10,000 is refused, a yearly one up to $100,000 is not", !checkPrice("10001", "month").ok && checkPrice("90000", "year").ok)
  check("an unknown interval is refused", !checkPrice("10", "weekly").ok)
  check("a price on a free community is ignored", (() => { const r = checkCreate({ name: "M", type: "free", price: "10", interval: "month" }); return r.ok && r.value.price === null })())
  check("only https pictures are kept", (() => { const r = checkCreate({ name: "M", type: "free", logoUrl: "javascript:alert(1)", coverUrl: "https://x.supabase.co/a.png" }); return r.ok && r.value.logoUrl === null && r.value.coverUrl === "https://x.supabase.co/a.png" })())
  check("free is public and free", JSON.stringify(accessForType("free")) === JSON.stringify({ access: "free", visibility: "public" }))
  check("paid is public and paid", accessForType("paid").access === "paid" && accessForType("paid").visibility === "public")
  check("private is invite only and hidden", accessForType("private").access === "invite_only" && accessForType("private").visibility === "private")
  check("typeOf reads each back", (["free", "paid", "private"] as const).every((t) => typeOf(accessForType(t)) === t))
  check("the tagline is the first line, cut at a word", taglineFrom("First line here\nsecond") === "First line here" && (taglineFrom("word ".repeat(60)) ?? "").length <= 160)
  check("text becomes escaped paragraphs and back", textToHtml("a <b>\n\nc") === "<p>a &lt;b&gt;</p><p>c</p>" && htmlToText(textToHtml("a <b>\n\nc")) === "a <b>\n\nc")

  /* ── Next steps ──────────────────────────────────────────────────────── */
  console.log("\nnext steps")
  const fresh: NextStepFacts = { published: false, paid: true, paymentsReady: false, members: 1, invites: 0, posts: 0, courses: 0, events: 0, customized: false, rules: 0, classroomEnabled: true, eventsEnabled: true }
  const ids = (f: NextStepFacts) => nextSteps(f, "/app/community/x").map((s) => s.id).join(",")
  check("a new paid community without payouts has every step", ids(fresh) === "payouts,publish,invite,welcome,course,event,customize,rules", ids(fresh))
  check("each step disappears once done", ids({ ...fresh, paymentsReady: true, published: true, invites: 1, posts: 1, courses: 1, events: 1, customized: true, rules: 2 }) === "")
  check("writing the rules opens Moderation on its Rules view", nextSteps(fresh, "/b").find((s) => s.id === "rules")?.href === "/b/moderation?tab=rules")
  check("customizing the page opens Settings on its Page tab, where the gallery is", nextSteps(fresh, "/b").find((s) => s.id === "customize")?.href === "/b/settings?tab=page")
  check("a second member counts as invited", !ids({ ...fresh, members: 2 }).includes("invite"))
  check("a section that is off asks for nothing", !ids({ ...fresh, classroomEnabled: false, eventsEnabled: false }).match(/course|event/))
  check("the welcome step opens the composer", nextSteps(fresh, "/b").find((s) => s.id === "welcome")?.href === "/b/feed?compose=welcome")

  /* ── Paging and CSV ──────────────────────────────────────────────────── */
  console.log("\npaging")
  const cur = encodeCursor("2026-10-03T07:28:00.123+00:00", UID(7))
  const back = decodeCursor(cur)
  check("a cursor goes there and back", back?.sort === "2026-10-03T07:28:00.123+00:00" && back?.id === UID(7))
  check("a cursor is url safe", /^[A-Za-z0-9_-]+$/.test(cur))
  check("a cursor carrying filter syntax is refused", decodeCursor(encodeCursor("x),or(id.neq.1", UID(1))) === null && decodeCursor(encodeCursor("2026", "not-a-uuid")) === null && decodeCursor("%%%") === null)
  check("the keyset filter quotes the value and breaks ties by id", keysetOr("joined_at", "2026-01-01", UID(2)) === `joined_at.lt."2026-01-01",and(joined_at.eq."2026-01-01",id.lt.${UID(2)})`)
  check("oldest first uses gt", keysetOr("created_at", 5, UID(3), "asc").startsWith("created_at.gt.5,"))
  check("a member query defaults to active and drops junk", JSON.stringify(parseMemberQuery({ status: "zzz", role: "god", tier: "x" })) === JSON.stringify({ status: "active", role: null, tierId: null, q: "", cursor: null }))
  check("a formula in a CSV cell is text", csvCell("=HYPERLINK(1)") === "'=HYPERLINK(1)" && csvCell("+1") === "'+1" && csvCell("@x") === "'@x")
  check("a CSV cell with a comma or quote is quoted", csvCell('a,"b"') === '"a,""b"""')
  check("a CSV row ends with CRLF", csvRow(["a", 1, null]) === "a,1,\r\n")
  const creatorSrc = code("lib/communities/server/creator.ts")
  check("members are read a page at a time, never by offset", /limit\(MEMBERS_PAGE \+ 1\)/.test(creatorSrc) && !/\.range\(/.test(creatorSrc) && !/offset/i.test(creatorSrc))
  check("the export streams pages of 500 into a ReadableStream", /new ReadableStream<Uint8Array>/.test(creatorSrc) && /limit\(500\)/.test(creatorSrc) && /async pull\(controller\)/.test(creatorSrc))
  check("the export route answers the stream as CSV", /new Response\(stream/.test(code("app/api/app/community/[id]/members/export/route.ts")) && /text\/csv/.test(read("app/api/app/community/[id]/members/export/route.ts")))
  /* Round 14 moved the cleaning and the cap into lib/communities/search.ts, where the ticket holder search reads them too. */
  check("a member search reads at most 300 accounts and then says so", /SEARCH_CAP = 300/.test(code("lib/communities/search.ts")) && /SEARCH_CAP/.test(creatorSrc) && /capped/.test(creatorSrc))
  check("monthly revenue reads memberships 1000 at a time, three columns, by monthlyValue", /monthlyValue\(m\)/.test(creatorSrc) && /\.limit\(1000\)/.test(creatorSrc) && /select\("id, status, billing_interval, amount_cents, currency"\)/.test(creatorSrc))

  /* ── Time ────────────────────────────────────────────────────────────── */
  console.log("\ntime")
  check("6:30pm in Bucharest in summer is 15:30 UTC", zonedTimeToUtc("2026-07-01", "18:30", "Europe/Bucharest") === "2026-07-01T15:30:00.000Z")
  check("and in winter 16:30 UTC", zonedTimeToUtc("2026-12-01", "18:30", "Europe/Bucharest") === "2026-12-01T16:30:00.000Z")
  check("the day after the clocks change in New York is right", zonedTimeToUtc("2026-03-09", "09:00", "America/New_York") === "2026-03-09T13:00:00.000Z")
  check("UTC is itself", zonedTimeToUtc("2026-01-02", "00:00", "UTC") === "2026-01-02T00:00:00.000Z")
  check("a date that is not one is refused", zonedTimeToUtc("2026-02-30", "10:00", "UTC") === null && zonedTimeToUtc("2026-01-01", "25:00", "UTC") === null && zonedTimeToUtc("2026-01-01", "10:00", "Mars/Base") === null)
  check("an instant reads back as the same wall clock", JSON.stringify(utcToZonedParts("2026-07-01T15:30:00.000Z", "Europe/Bucharest")) === JSON.stringify({ date: "2026-07-01", time: "18:30" }))
  const ev = checkEvent({ title: "Q&A", kind: "ama", timezone: "UTC", startDate: "2026-11-04", startTime: "18:00", endTime: "17:00" })
  check("an event must end after it starts", !ev.ok && (ev as { field?: string }).field === "end")
  check("a meeting link must be https", !checkEvent({ title: "x", timezone: "UTC", startDate: "2026-11-04", startTime: "18:00", meetingUrl: "http://zoom.us" }).ok)
  check("capacity is a whole number from 1", !checkEvent({ title: "x", timezone: "UTC", startDate: "2026-11-04", startTime: "18:00", capacity: "0" }).ok)
  check("a good event is stored as instants", (() => { const r = checkEvent({ title: "x", timezone: "Europe/London", startDate: "2026-11-04", startTime: "18:00", endTime: "19:00" }); return r.ok && r.value.startsAt === "2026-11-04T18:00:00.000Z" && r.value.endsAt === "2026-11-04T19:00:00.000Z" })())
  check("a replay id is found inside a pasted link", replayVideoId(`https://storelib.com/v?id=${UID(9)}`) === UID(9) && replayVideoId("") === null && replayVideoId("nope") === false)

  /* ── Levels, spaces, invites, links ──────────────────────────────────── */
  console.log("\nsettings")
  check("level 1 is at 0 points whatever was typed", (() => { const r = checkLevels([{ name: "A", minPoints: 50 }, { name: "B", minPoints: 60 }]); return r.ok && r.value[0].minPoints === 0 })())
  check("each level needs more points than the one before", !checkLevels([{ name: "A" }, { name: "B", minPoints: 20 }, { name: "C", minPoints: 20 }]).ok)
  check("at most 20 levels", !checkLevels(Array.from({ length: 21 }, (_, i) => ({ name: `L${i}`, minPoints: i * 10 }))).ok)
  check("an announcements space is posted in by admins unless told", (() => { const r = checkSpace({ name: "News", kind: "announcements" }, { creating: true }); return r.ok && r.value.postRole === "admin" })())
  check("a space name over 40 characters is refused", !checkSpace({ name: "x".repeat(41) }, { creating: true }).ok)
  check("an email invite is for one use and lasts 30 days unless told", (() => { const r = checkInvite({ email: "A@B.co" }); return r.ok && r.value.email === "a@b.co" && r.value.maxUses === 1 && r.value.expiresInDays === 30 })())
  check("a link invite may have no limit", (() => { const r = checkInvite({}); return r.ok && r.value.maxUses === null && r.value.expiresInDays === null })())
  check("a bad email is refused", !checkInvite({ email: "nope" }).ok)
  check("links must be https", !checkLinks([{ label: "Site", url: "http://x.com" }]).ok && checkLinks([{ label: "Site", url: "https://x.com" }]).ok)
  const token = newInviteToken()
  check("an invite token is 32 random bytes; only its sha256 is stored", token.token.length >= 43 && /^[0-9a-f]{64}$/.test(token.hash) && hashInviteToken(token.token) === token.hash && newInviteToken().token !== token.token)

  /* ── Analytics ───────────────────────────────────────────────────────── */
  console.log("\nanalytics")
  const days = fillDays([{ day: "2026-10-02", value: 4 }], 3, "2026-10-03")
  check("missing days are zero, oldest first, ending today", JSON.stringify(days) === JSON.stringify([{ day: "2026-10-01", value: 0 }, { day: "2026-10-02", value: 4 }, { day: "2026-10-03", value: 0 }]))
  check("the trending score counts joins most and nothing for a quiet week", trendingScore([]) === 0 && trendingScore([{ new_members: 1, posts: 0, comments: 0, reactions: 0, rsvps: 0 }]) > trendingScore([{ new_members: 0, posts: 1, comments: 0, reactions: 0, rsvps: 0 }]))
  const jobs = code("lib/communities/server/jobs/index.ts")
  check("rollup and trending are registered", /rollup: \(db, job, ctx\) => import\("\.\/rollup"\)/.test(jobs) && /trending: \(db, job, ctx\) => import\("\.\/trending"\)/.test(jobs))
  check("the rollup carries on from the last community when time runs out", /again: \{ payload: \{ day, after \} \}/.test(code("lib/communities/server/jobs/rollup.ts")))
  check("a day is upserted, so counting it twice is one row", /onConflict: "community_id,day"/.test(code("lib/communities/server/analytics.ts")))

  /* ── Prices ──────────────────────────────────────────────────────────── */
  console.log("\nprices")
  const tiers = code("lib/communities/server/tiers.ts")
  check("a recurring tier is a membership product made by the memberships engine", /createMembershipProduct\(db, t\.creatorId, title\)/.test(tiers) && /saveMembership\(db, t\.creatorId, product,/.test(tiers))
  check("its product is linked to the community", /update\(\{ community_id: t\.community\.id \}\)/.test(tiers))
  check("a one time tier is a community product with a price, linked", /type: "community"/.test(tiers) && /price_cents: t\.cents/.test(tiers) && /community_id: t\.community\.id/.test(tiers))
  check("the selling product is also the tier's access row", /from\("community_access_products"\)\.insert\(\{ community_id: t\.community\.id, tier_id: tier\.id, product_id: productId \}\)/.test(tiers))
  check("a failed tier takes its product back", (tiers.match(/from\("products"\)\.delete\(\)\.eq\("id", productId\)/g) ?? []).length >= 3)
  check("a price change goes through saveMembership", /updateTier[\s\S]*saveMembership\(db, u\.creatorId, product,/.test(tiers))
  check("the products go on and off sale with the community", /syncTierProducts/.test(creatorSrc) && /status: onSale \? "published" : "draft"/.test(tiers))
  check("a paid community is never made without its price", /if \(!tier\.ok\) \{\s*await db\.from\("communities"\)\.delete\(\)\.eq\("id", community\.id\)/.test(creatorSrc))
  check("deleting is refused while members still pay", /still pay/.test(creatorSrc) && /eq\("source", "subscription"\)/.test(creatorSrc))

  /* ── Moderation ──────────────────────────────────────────────────────── */
  console.log("\nmoderation")
  check("pin needs pin, lock needs lock, remove needs moderate_content", contentActionNeeds("pin") === "pin" && contentActionNeeds("lock") === "lock" && contentActionNeeds("remove") === "moderate_content" && contentActionNeeds("feature") === "feature")
  check("a message can only be removed, a comment removed or restored", contentActionFits("remove", "message") && !contentActionFits("restore", "message") && !contentActionFits("pin", "comment") && contentActionFits("restore", "comment"))
  check("ban needs ban, approve needs approve_member, role needs change_role", memberActionNeeds("ban") === "ban" && memberActionNeeds("approve") === "approve_member" && memberActionNeeds("role") === "change_role")
  const now = Date.parse("2026-10-03T00:00:00Z")
  check("a mute is 24 hours unless told, and at most a year", muteUntil(undefined, now) === "2026-10-04T00:00:00.000Z" && muteUntil(24 * 400, now) === null && muteUntil(0.001, now) === null)

  const MOD = UID(1)
  const ADMIN = UID(2)
  const AUTHOR = UID(3)
  const db = fakeDb({
    community_members: [
      { id: "m1", community_id: COMMUNITY_ID, user_id: MOD, status: "active", role: "moderator", source: "free", tier_id: null },
      { id: "m2", community_id: COMMUNITY_ID, user_id: ADMIN, status: "active", role: "admin", source: "free", tier_id: null },
      { id: "m3", community_id: COMMUNITY_ID, user_id: AUTHOR, status: "active", role: "member", source: "free", tier_id: null },
    ],
    community_messages: [{ id: UID(20), community_id: COMMUNITY_ID, author_id: AUTHOR, status: "published", body: "something awful", space_id: UID(30), attachments: [{ type: "image", url: "https://x" }] }],
    community_feed_posts: [
      { id: UID(21), community_id: COMMUNITY_ID, author_id: ADMIN, status: "published", title: "Admin post", body_text: "", pinned: false, locked: false, featured: false, space_id: UID(30) },
      { id: UID(22), community_id: "other-community", author_id: AUTHOR, status: "published", title: "Elsewhere", body_text: "", space_id: UID(31) },
    ],
    community_reports: [{ id: UID(40), community_id: COMMUNITY_ID, target_type: "message", target_id: UID(20), status: "open" }],
    community_audit_log: [],
  })
  const removed = await actOnContent(db, { community, actor: { userId: MOD, role: "moderator" }, action: "remove", targetType: "message", targetId: UID(20), reason: "abuse" })
  const msgWrite = db.log.find((l) => l.table === "community_messages" && l.op === "update")
  const payload = (msgWrite?.payload ?? {}) as Record<string, unknown>
  check("a moderator removes a member's message", removed.ok)
  check("its body is blanked in the same update that removes it", payload.status === "removed" && payload.body === "" && Array.isArray(payload.attachments) && (payload.attachments as unknown[]).length === 0 && db.log.filter((l) => l.table === "community_messages" && l.op === "update").length === 1)
  check("the reports about it are closed", db.tables.community_reports[0].status === "resolved")
  check("and it is in the audit log", db.tables.community_audit_log.some((a: Record<string, unknown>) => a.action === "message.removed" && a.actor_id === MOD))
  const senior = await actOnContent(db, { community, actor: { userId: MOD, role: "moderator" }, action: "remove", targetType: "post", targetId: UID(21) })
  check("a moderator cannot remove an admin's post", !senior.ok && (senior as { status?: number }).status === 403)
  const elsewhere = await actOnContent(db, { community, actor: { userId: ADMIN, role: "admin" }, action: "remove", targetType: "post", targetId: UID(22) })
  check("a post from another community is not found", !elsewhere.ok && (elsewhere as { status?: number }).status === 404)
  const memberCannot = await actOnContent(db, { community, actor: { userId: AUTHOR, role: "member" }, action: "pin", targetType: "post", targetId: UID(21) })
  check("a member cannot pin", !memberCannot.ok && (memberCannot as { status?: number }).status === 403)
  const banAdmin = await actOnMember(db, { community, actor: { userId: MOD, role: "moderator" }, action: "ban", userId: ADMIN })
  check("a moderator cannot ban an admin", !banAdmin.ok && (banAdmin as { status?: number }).status === 403)
  const self = await actOnMember(db, { community, actor: { userId: ADMIN, role: "admin" }, action: "mute", userId: ADMIN })
  check("nobody acts on themselves", !self.ok)
  const promoteToAdmin = await actOnMember(db, { community, actor: { userId: ADMIN, role: "admin" }, action: "role", userId: AUTHOR, role: "admin" })
  check("an admin cannot make another admin", !promoteToAdmin.ok)
  const promote = await actOnMember(db, { community, actor: { userId: ADMIN, role: "admin" }, action: "role", userId: AUTHOR, role: "moderator" })
  check("an admin makes a member a moderator, logged", promote.ok && db.tables.community_members.find((m: Record<string, unknown>) => m.user_id === AUTHOR)?.role === "moderator" && db.tables.community_audit_log.some((a: Record<string, unknown>) => a.action === "member.role_changed"))
  const mute = await actOnMember(db, { community, actor: { userId: ADMIN, role: "admin" }, action: "mute", userId: AUTHOR, until: 2 })
  check("a mute sets muted_until", mute.ok && typeof db.tables.community_members.find((m: Record<string, unknown>) => m.user_id === AUTHOR)?.muted_until === "string")

  /* Every member action a screen offers is one the route takes, and one the role may take. */
  const EXTRA_WRITES = ["complimentary", "end_complimentary", "points", "badge"]
  const target = { userId: UID(50), role: "member" as const, status: "active", source: "free", mutedUntil: null }
  for (const role of ["owner", "admin", "moderator"] as const) {
    const actor = { userId: UID(51), role, can: allowedActions(role), gamification: true, badges: 1 }
    const offered = [
      ...memberChoices(actor, target),
      ...memberChoices(actor, { ...target, mutedUntil: "2099-01-01T00:00:00Z" }),
      ...memberChoices(actor, { ...target, status: "pending" }),
      ...memberChoices(actor, { ...target, status: "paused" }),
      ...memberChoices(actor, { ...target, status: "banned" }),
      ...memberChoices(actor, { ...target, source: "manual" }),
    ]
    const routed = offered.filter((c) => !EXTRA_WRITES.includes(c.action))
    check(`${role}: every member action offered is a route action`, routed.every((c) => (MEMBER_ACTIONS as readonly string[]).includes(c.action)), routed.map((c) => c.action).join(","))
    check(`${role}: and one the role may take`, routed.every((c) => can(role, memberActionNeeds(c.action as (typeof MEMBER_ACTIONS)[number]))))
    check(`${role}: the extra writes only with their permission`, offered.filter((c) => c.action === "complimentary" || c.action === "end_complimentary").every(() => can(role, "manage_members")) && offered.filter((c) => c.action === "points" || c.action === "badge").every(() => can(role, "award_points")))
  }
  const asMod = memberChoices({ userId: UID(51), role: "moderator", can: allowedActions("moderator"), gamification: false, badges: 0 }, target).map((c) => c.action)
  check("a moderator can mute, suspend, remove and ban a member, and nothing about roles or access", ["mute", "suspend", "remove", "ban"].every((a) => asMod.includes(a as never)) && !asMod.includes("role") && !asMod.includes("complimentary"))
  const asAdmin = memberChoices({ userId: UID(51), role: "admin", can: allowedActions("admin"), gamification: false, badges: 0 }, target)
  check("an admin may make a moderator but not an admin", asAdmin.some((c) => c.action === "role" && c.role === "moderator") && !asAdmin.some((c) => c.action === "role" && c.role === "admin"))
  check("nobody is offered anything on an equal, a senior, the owner or themselves",
    memberChoices({ userId: UID(51), role: "admin", can: allowedActions("admin"), gamification: true, badges: 1 }, { ...target, role: "admin" }).length === 0 &&
      memberChoices({ userId: UID(51), role: "moderator", can: allowedActions("moderator"), gamification: true, badges: 1 }, { ...target, role: "admin" }).length === 0 &&
      memberChoices({ userId: UID(51), role: "admin", can: allowedActions("admin"), gamification: true, badges: 1 }, { ...target, role: "owner" }).length === 0 &&
      memberChoices({ userId: UID(50), role: "owner", can: allowedActions("owner"), gamification: true, badges: 1 }, target).length === 0)
  check("a muted member is offered Unmute, not another mute", (() => { const a = memberChoices({ userId: UID(51), role: "moderator", can: allowedActions("moderator"), gamification: false, badges: 0 }, { ...target, mutedUntil: "2099-01-01T00:00:00Z" }).map((c) => c.action); return a.includes("unmute") && !a.includes("mute") })())
  check("a request has Approve and Decline, a suspension Bring back, a ban Unban",
    memberChoices({ userId: UID(51), role: "moderator", can: allowedActions("moderator"), gamification: false, badges: 0 }, { ...target, status: "pending" }).map((c) => c.action).join(",") === "approve,reject" &&
      memberChoices({ userId: UID(51), role: "moderator", can: allowedActions("moderator"), gamification: false, badges: 0 }, { ...target, status: "paused" })[0]?.action === "unsuspend" &&
      memberChoices({ userId: UID(51), role: "moderator", can: allowedActions("moderator"), gamification: false, badges: 0 }, { ...target, status: "banned" })[0]?.action === "unban")
  check("every mute length the screen offers is one the server accepts", MUTE_CHOICES.every((c) => muteUntil(c.hours, now) !== null))
  const week = await actOnMember(db, { community, actor: { userId: ADMIN, role: "admin" }, action: "mute", userId: AUTHOR, until: 24 * 7 })
  const until = Date.parse(String(db.tables.community_members.find((m: Record<string, unknown>) => m.user_id === AUTHOR)?.muted_until))
  check("a mute for 7 days ends in 7 days", week.ok && Math.abs(until - (Date.now() + 7 * 86_400_000)) < 60_000)
  check("Muted is a view of the member list: active members whose mute has not run out", (MEMBER_STATUS_FILTERS as readonly string[]).includes("muted") && parseMemberQuery({ status: "muted" }).status === "muted" && /eq\("status", query\.status === "muted" \? "active" : query\.status\)/.test(creatorSrc) && /gt\("muted_until", nowIso\(\)\)/.test(creatorSrc))
  check("a report says what its author's member row is, so the menu offers what works", /select\("user_id, role, status, source, muted_until"\)/.test(code("lib/communities/server/moderation.ts")))

  /* The screens act through those routes. */
  const memberActionsSrc = code("components/community/creator/member-actions.tsx")
  check("member actions go to the member route, complimentary access to the members route", /send\(`\$\{base\}\/members\/\$\{person\.userId\}`, "PATCH", \{ action: choice\.action/.test(memberActionsSrc) && /action: "end_complimentary", userId: person\.userId/.test(memberActionsSrc) && /action: "complimentary", userId: person\.userId/.test(memberActionsSrc))
  check("a mute asks how long and sends it as hours", /until: hours/.test(memberActionsSrc) && /MUTE_CHOICES\.map/.test(memberActionsSrc))
  check("Members and Moderation both act through useMemberActions", /useMemberActions\(/.test(code("components/community/creator/members-section.tsx")) && /useMemberActions\(/.test(code("components/community/creator/moderation-section.tsx")))
  const modSrc = code("components/community/creator/moderation-section.tsx")
  check("Moderation has the reports, the resolved ones, the restricted people, the rules and the audit log", /"reports" \| "resolved" \| "restricted" \| "rules" \| "audit"/.test(modSrc) && /<RulesEditor/.test(modSrc) && /<Restricted/.test(modSrc))
  check("the rules are saved through the settings route with checkRules first", /checkRules\(rules\)/.test(modSrc) && /send\(`\/api\/app\/community\/\$\{head\.id\}`, "PATCH", \{ rules: checked\.value \}\)/.test(modSrc))
  check("only the owner and admins edit the rules; a moderator reads them", /const canEdit = head\.can\.manage_settings === true/.test(modSrc) && can("moderator", "review_reports") && !can("moderator", "manage_settings"))
  check("removing reported content goes through the moderation route", /send\(`\$\{base\}\/moderation`, "POST", \{ action: "remove", targetType: r\.targetType, targetId: r\.targetId/.test(modSrc))
  check("an author action from a report resolves the report", /fromReport\.current = r/.test(modSrc) && /setStatus\(r, "resolved"/.test(modSrc))
  const modPage = code("app/app/community/[id]/moderation/page.tsx")
  check("the Moderation page reads the restricted lists and the audit log only for roles that may use them", /restrict \? page\("muted"\)/.test(modPage) && /can\(ctx\.role, "view_audit", ctx\.viewer\.perms\) \? auditLog/.test(modPage) && /rules=\{Array\.isArray\(c\.rules\)/.test(modPage))

  /* ── Gallery ─────────────────────────────────────────────────────────── */
  console.log("\ngallery")
  const own = (u: unknown) => (typeof u === "string" && u.startsWith("https://abc.supabase.co/") ? u : null)
  const pic = (n: number) => ({ type: "image", url: `https://abc.supabase.co/storage/v1/object/public/product-images/${n}.png` })
  const good = checkGallery([pic(1), { type: "video", videoId: UID(60) }, pic(2)], own)
  check("pictures and videos are kept in order", good.ok && good.value.map((g) => g.type).join(",") === "image,video,image")
  check("at most twelve", GALLERY_MAX === 12 && checkGallery(Array.from({ length: 12 }, (_, i) => pic(i)), own).ok && !checkGallery(Array.from({ length: 13 }, (_, i) => pic(i)), own).ok)
  check("a picture from anywhere else is refused", !checkGallery([{ type: "image", url: "https://evil.example.com/x.png" }], own).ok && !checkGallery([{ type: "image", url: "javascript:alert(1)" }], own).ok)
  check("a video is an id, nothing else", !checkGallery([{ type: "video", videoId: "https://youtube.com/x" }], own).ok)
  check("anything that is not a picture or a video is refused, and so is a gallery that is not a list", !checkGallery([{ type: "file", url: pic(1).url }], own).ok && !checkGallery({ 0: pic(1) }, own).ok)
  check("the same picture twice is kept once", (() => { const r = checkGallery([pic(1), pic(1)], own); return r.ok && r.value.length === 1 })())
  check("moving a tile moves only it", moveItem(["a", "b", "c", "d"], 1, 2).join("") === "acbd" && moveItem(["a", "b", "c"], 2, 0).join("") === "cab" && moveItem(["a", "b"], 5, 0).join("") === "ab")
  check("the gallery is a setting only the owner and admins change", !/field === "gallery"/.test(creatorSrc) && /return "manage_settings"\s*\}/.test(creatorSrc) && !can("moderator", "manage_settings") && can("admin", "manage_settings"))
  const vdb = fakeDb({
    media_videos: [
      { id: UID(60), community_id: COMMUNITY_ID, status: "ready" },
      { id: UID(61), community_id: "another", status: "ready" },
      { id: UID(62), community_id: COMMUNITY_ID, status: "failed" },
    ],
  })
  check("a video of this community is accepted", (await checkGalleryForCommunity(vdb, COMMUNITY_ID, [{ type: "video", videoId: UID(60) }])).ok)
  check("a video of another community is refused", !(await checkGalleryForCommunity(vdb, COMMUNITY_ID, [{ type: "video", videoId: UID(61) }])).ok)
  check("a video that failed is refused", !(await checkGalleryForCommunity(vdb, COMMUNITY_ID, [{ type: "video", videoId: UID(62) }])).ok)
  check("a picture from anywhere but our storage is refused by the route's check", !(await checkGalleryForCommunity(vdb, COMMUNITY_ID, [{ type: "image", url: "https://evil.example.com/x.png" }])).ok && (await checkGalleryForCommunity(vdb, COMMUNITY_ID, [pic(4)])).ok)
  const gdb = fakeDb({ communities: [{ id: COMMUNITY_ID, slug: "makers", name: "Makers" }] })
  const savedGallery = await saveGallery(gdb, COMMUNITY_ID, [pic(3) as { type: "image"; url: string }])
  const write = gdb.log.find((l) => l.table === "communities" && l.op === "update")
  check("a gallery is saved in communities.gallery", savedGallery.ok && JSON.stringify((write?.payload as Record<string, unknown>)?.gallery) === JSON.stringify([pic(3)]))
  const before85 = fakeDb({ communities: [] }, { failWith: { communities: { code: "42703", message: 'column "gallery" of relation "communities" does not exist' } } })
  const missingColumn = await saveGallery(before85, COMMUNITY_ID, [pic(3) as { type: "image"; url: string }])
  check("before the column exists the answer says to run the update", missingColumn.ok === false && missingColumn.status === 409 && missingColumn.error === GALLERY_NOT_READY && /Run the update/.test(GALLERY_NOT_READY))
  const settingsBody = creatorSrc.slice(creatorSrc.indexOf("export async function updateSettings"), creatorSrc.indexOf("async function ensureFreeDefault"))
  check("the route checks the gallery before it writes anything, and saves it first", /checkGalleryForCommunity\(db, c\.id, b\.gallery\)/.test(settingsBody) && settingsBody.indexOf("checkGalleryForCommunity") < settingsBody.indexOf("saveGallery(db, c.id, gallery)") && settingsBody.indexOf("saveGallery(db, c.id, gallery)") < settingsBody.indexOf('db.from("communities").update(patch)'))
  check("a failed gallery save answers its own status and words", /if \(!g\.ok\) return no\(g\.status, g\.error, "gallery"\)/.test(settingsBody))
  const galleryEditor = code("components/community/creator/gallery-editor.tsx")
  check("pictures upload like the logo and cover, videos through the community's video upload", /compressPostPicture\(j\.file, \{ maxEdge: 2000/.test(galleryEditor) && /new DirectUploader\(\{ file, folder: "product-images"/.test(galleryEditor) /* Changed on purpose (round 27): sized on the device before it goes up. */ && /uploadCommunityVideo\(\{ endpoint: `\/api\/app\/community\/\$\{communityId\}\/videos`/.test(galleryEditor))
  check("tiles reorder by dragging, by arrows and from a phone's menu", /draggable/.test(galleryEditor) && /onDrop=/.test(galleryEditor) && /Move \$\{i \+ 1\} later/.test(galleryEditor) && /label: "Move later"/.test(galleryEditor))
  check("Save waits while a file is still uploading", /onBusy=\{setUploading\}/.test(code("components/community/creator/settings-section.tsx")) && /busy=\{busy \|\| uploading\}/.test(code("components/community/creator/settings-section.tsx")))
  check("the editor says so while the database has no gallery yet", /galleryReady: gallery\.ready/.test(creatorSrc) && /if \(!ready\)/.test(galleryEditor))

  /* ── Settings and the shell ──────────────────────────────────────────── */
  console.log("\nsettings")
  check("old tab names land on the tab that holds them now", settingsTabOf("general") === "page" && settingsTabOf("discovery") === "access" && settingsTabOf("gamification") === "gamification" && settingsTabOf("nonsense") === "page" && settingsTabOf(undefined) === "page")
  check("Gamification is a Settings tab, not a section of its own", !/id: "gamification"/.test(code("components/community/creator/community-shell.tsx")) && /redirect\(`\/app\/community\/\$\{ctx\.community\.slug\}\/settings\?tab=gamification`\)/.test(code("app/app/community/[id]/gamification/page.tsx")))
  check("lists are one card: views and actions in its first row (ListCard)", ["members", "moderation", "feed", "events", "spaces", "classroom"].every((f) => /<ListCard/.test(code(`components/community/creator/${f}-section.tsx`))))

  /* ── Routes ──────────────────────────────────────────────────────────── */
  console.log("\nroutes")
  const routes = [...walk("app/api/app/community"), ...walk("app/api/community").filter((f) => f.includes("/moderation/"))].filter((f) => f.endsWith("route.ts")).filter((f) => !f.includes("/videos"))
  check("there are creator and moderation routes", routes.length >= 25, String(routes.length))
  for (const f of routes) {
    const src = code(f)
    const handlers = [...src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\(([\s\S]*?)\n\}/g)]
    const short = f.replace(/^app\/api\//, "")
    check(`${short}: every handler asks the switch first`, handlers.length > 0 && handlers.every((h) => /^[^{]*\{\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(h[0].slice(h[0].indexOf("{", h[0].indexOf(")"))))))
    check(`${short}: gated`, /requireCreatorCommunity\(|requireMember\(|requireCreator\(\)/.test(src))
    const writes = handlers.filter((h) => h[1] !== "GET")
    check(`${short}: every write is rate limited`, writes.every((h) => /rateLimit\(|manageLimit\(/.test(h[0])))
    check(`${short}: no role compared as a string`, !/role\s*===\s*"(owner|admin|moderator)"/.test(src))
  }
  const moderation = code("lib/communities/server/moderation.ts")
  /* Found end to end (QA): the templates existed and nothing raised them, so an approved person heard nothing by email. */
  {
    const at = moderation.indexOf('case "approve": {')
    const approve = moderation.slice(at, moderation.indexOf('case "reject":', at))
    check("approving a request emails the person (join_approved), whether they still pay or are in",
      (approve.match(/await sendCommunityEmail\(db, "join_approved", \{ userId: a\.userId, communityId: a\.community\.id, data: \{ needsPayment: (true|false) \}, key: `approved:\$\{target\.id\}/g) ?? []).length === 2 && /needsPayment: true/.test(approve) && /needsPayment: false/.test(approve))
  }
  check("moderation decides with can() and canActOn(), not role strings", /can\(actor\.role, action, perms\)/.test(moderation) && /actorMay\(db, a\.community\.id, a\.actor/.test(moderation) && /canActOn\(a\.actor\.role, target\.role\)/.test(moderation))
  const audited = ["createSpace", "updateSpace", "reorderSpaces", "deleteSpace", "attachCourse", "updateCourse", "reorderCourses", "detachCourse", "createEvent", "updateEvent", "setEventCancelled", "createCreatorPost", "saveLevels", "createBadge", "deleteBadge", "awardBadge", "givePoints", "grantComplimentary", "updateSettings", "setPublished", "setArchived", "deleteCommunity"]
  for (const fn of audited) {
    const at = creatorSrc.indexOf(`export async function ${fn}(`)
    const body = at < 0 ? "" : creatorSrc.slice(at, creatorSrc.indexOf("\nexport ", at + 10) > 0 ? creatorSrc.indexOf("\nexport ", at + 10) : undefined)
    check(`${fn} writes the audit log`, /await audit\(db,/.test(body))
  }
  check("tier changes and invites write the audit log", (tiers.match(/await audit\(db,/g) ?? []).length >= 6 && (code("lib/communities/server/invites.ts").match(/await audit\(db,/g) ?? []).length >= 2)

  /* ── Pages ───────────────────────────────────────────────────────────── */
  console.log("\npages")
  const pages = walk("app/app/community").filter((f) => /(page|layout)\.tsx$/.test(f))
  check("the list, new, the layout and ten sections exist", pages.length >= 13, String(pages.length))
  for (const f of pages) {
    const src = code(f)
    check(`${f}: a 404 while communities are off`, /communitiesEnabled\(\)\)\) notFound\(\)/.test(src) || /sectionPage\(id, "/.test(src))
  }
  check("sectionPage itself 404s while off or without the permission", /if \(!\(await communitiesEnabled\(\)\)\) notFound\(\)[\s\S]{0,200}if \(!ctx \|\| !can\(ctx\.role, action, ctx\.viewer\.perms\)\) notFound\(\)/.test(creatorSrc))

  /* ── Shell ───────────────────────────────────────────────────────────── */
  console.log("\nshell")
  const sidebar = code("components/app/sidebar.tsx")
  check("the Community row exists only while the switch is on", /communitiesEnabled \? \[\{ href: "\/app\/community", label: "Community", icon: NAV_ICONS_EXTRA\.community \}\] : \[\]/.test(sidebar) && /\.\.\.communityItem,/.test(sidebar))
  check("its icon is a Solar line and bold pair", /community: \{ line: CommunityLinear, fill: CommunityBold \}/.test(code("components/app/sidebar-desktop-nav.tsx")) && /@solar-icons\/react\/bold\/users-group-rounded/.test(read("components/app/sidebar-desktop-nav.tsx")))
  /* Found end to end (QA): the floating Setup pill sat on the settings' sticky Save. */
  {
    const re = (sidebar.match(/const COMMUNITY_SETTINGS_PATH = (\/.*\/)\n/) || [])[1]
    const rx = re ? new Function(`return ${re}`)() as RegExp : null
    check("the Setup pill is hidden on a community's settings, where the sticky Save bar sits",
      !!rx && rx.test("/app/community/0b6c/settings") && rx.test("/app/community/0b6c/settings/") && !rx.test("/app/community/0b6c") && !rx.test("/app/community/0b6c/members")
        && /COMMUNITY_SETTINGS_PATH\.test\(pathname\)\) && "!hidden"/.test(sidebar))
  }
  check("the /app layout reads the switch and hands it to the sidebar", /communitiesEnabled\(\)\.catch\(\(\) => false\)/.test(code("app/app/layout.tsx")) && /communitiesEnabled=\{communitiesOn\}/.test(code("app/app/layout.tsx")))
  check("search does not offer Community while it is off", !matchPages("community").some((p) => p.href === "/app/community"))
  check("and offers it while it is on", matchPages("community", 5, { communities: true })[0]?.href === "/app/community")
  check("the header search passes the switch", /matchPages\(q, 5, \{ communities \}\)/.test(code("components/app/app-search.tsx")))

  /* ── Client modules ──────────────────────────────────────────────────── */
  console.log("\nclient")
  const clientFiles = walk("components/community/creator")
  for (const f of clientFiles) {
    const src = read(f)
    check(`${f}: no server code`, !/from "@\/lib\/communities\/server|next\/headers|"server-only"|lib\/admin-blog-auth|@\/lib\/video\/provider"/.test(src))
  }
  check("every screen is a client component", clientFiles.filter((f) => f.endsWith(".tsx")).every((f) => read(f).startsWith('"use client"')))

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\ncopy")
  const mine = [
    ...clientFiles,
    ...pages,
    ...routes,
    "lib/communities/server/creator.ts",
    "lib/communities/server/tiers.ts",
    "lib/communities/server/invites.ts",
    "lib/communities/server/analytics.ts",
    "lib/communities/server/moderation.ts",
    "lib/communities/server/jobs/rollup.ts",
    "lib/communities/server/jobs/trending.ts",
    "scripts/check-community-creator.mjs",
    "scripts/render-community-creator.tsx",
  ]
  const banned = /\b(unlock|unlocks|unlocked|elevate|seamless|seamlessly|powerful|effortless|effortlessly|supercharge|transform|transforms)\b/i
  for (const f of mine) {
    const src = read(f)
    check(`${f}: no em dash, no banned word`, !src.includes("—") && !banned.test(src), (src.match(banned) ?? [])[0])
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
