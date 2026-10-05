/**
 * ===========================================================================
 *  COMMUNITIES ROUND 13: RUNNING A COMMUNITY FROM /app (worker A)
 * ===========================================================================
 * Held from their inputs:
 *
 *   ROLES       what admins and moderators may do is the owner's choice
 *               per community (run-now part 100, communities.role_permissions),
 *               a group of actions at a time; the defaults are the roles as
 *               they were; money, deleting and handing over never move;
 *               every gate hands the choice to can(): requireMember,
 *               requireCreatorCommunity, the /app pages and the moderation
 *               actions, which refuse what the owner turned off.
 *   MODERATION  mute (time boxed), ban, close comments, pin, remove and
 *               restore, end to end through the same function the post menu
 *               and /app call; the queue tells a join alarm apart.
 *   PLAN        Free makes two communities; the third (and a duplicate)
 *               answers 402 plan_limit and the screens open the upgrade sheet.
 *   LIST        cards in a grid with a menu of what this person may do.
 *   ANALYTICS   revenue, churn, refunds, joins by source and invite links,
 *               counted from rows, never made up.
 *   SETTINGS    rules, the refund policy and contact (through worker M's
 *               helpers), the Roles tab for the owner; New community and
 *               Settings read like the product editor.
 *   SQL         part 100 follows the run-now rules.
 *   COPY        no em dash, no banned word, no server code in a client file.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"

import { fakeDb } from "./_fake-db"
import { stripComments } from "./_source"
import {
  DEFAULT_ROLE_PERMISSIONS,
  OWNER_ONLY_ACTIONS,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  allowedActions,
  assignableRoles,
  can,
  parseRolePermissions,
  roleGroups,
  type CommunityAction,
} from "@/lib/communities/permissions"
import { FREE_COMMUNITY_LIMIT, PLAN_LIMIT_ERROR, communityLimitFor, mayCreateCommunity } from "@/lib/communities/plan-limit"
import { REFUND_POLICY_MAX, cleanContactEmail, cleanRefundPolicy } from "@/lib/communities/membership-policy"
import { rolePermissionsOf, saveRolePermissions, staffPermissions, staffPermissionsFor } from "@/lib/communities/server/creator-roles"
import { actOnContent, actOnMember, updateReport } from "@/lib/communities/server/moderation"
import { churnRate, inviteLabel, loadMoneyAndGrowth } from "@/lib/communities/server/stats"
import { duplicateCommunity, loadPolicies, savePolicies } from "@/lib/communities/server/creator-policies"
import { settingsTabOf, systemReportKind } from "@/components/community/creator/logic"
import type { CommunityRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const UID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const CID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const community = { id: CID, slug: "makers", name: "Makers", status: "published", access: "free" } as unknown as CommunityRow
const OWNER = UID(1)
const ADMIN = UID(2)
const MOD = UID(3)
const AUTHOR = UID(4)
const status = (r: unknown) => (r as { status?: number }).status

async function main() {
  /* ── Roles: the pure rules ───────────────────────────────────────────── */
  console.log("\nroles")
  /* Round 14 put the tickets group on for a moderator as well, so a moderator may price an event and refund a ticket with nothing chosen. */
  const OLD_MODERATOR: CommunityAction[] = ["view", "post", "comment", "react", "chat", "upload", "report", "moderate_content", "pin", "lock", "mute", "suspend", "ban", "remove_member", "approve_member", "review_reports", "view_audit", "price_events", "refund_tickets"]
  check("with nothing chosen a moderator may do exactly what a moderator always could", Object.keys(allowedActions("moderator")).sort().join() === [...OLD_MODERATOR].sort().join())
  check("with nothing chosen an admin may do everything but money, deleting and handing over", Object.keys(allowedActions("admin")).length === Object.keys(allowedActions("owner")).length - OWNER_ONLY_ACTIONS.length && OWNER_ONLY_ACTIONS.every((a) => !can("admin", a)))
  check("every staff action belongs to exactly one group", (() => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.actions as readonly string[])
    const staffOnly = Object.keys(allowedActions("admin")).filter((a) => !["view", "post", "comment", "react", "chat", "upload", "report"].includes(a))
    return staffOnly.every((a) => grouped.filter((x) => x === a).length === 1) && grouped.length === new Set(grouped).size
  })())
  check("the defaults: admins every group, moderators content, members, reports, the audit log and tickets", PERMISSION_KEYS.every((k) => DEFAULT_ROLE_PERMISSIONS.admin[k]) && PERMISSION_KEYS.filter((k) => DEFAULT_ROLE_PERMISSIONS.moderator[k]).sort().join() === ["audit", "content", "members", "reports", "tickets"].join())
  const noContent = parseRolePermissions({ moderator: { content: false } })
  check("an owner can take removing posts away from moderators", !can("moderator", "moderate_content", noContent) && !can("moderator", "pin", noContent) && !can("moderator", "lock", noContent) && can("moderator", "ban", noContent))
  const modsAnnounce = parseRolePermissions({ moderator: { announce: true, analytics: true } })
  check("and can hand moderators more: announcements and analytics", can("moderator", "announce", modsAnnounce) && can("moderator", "view_analytics", modsAnnounce) && !can("moderator", "announce"))
  const greedy = parseRolePermissions({ admin: { settings: true, money: true, delete: true }, moderator: { settings: true } })
  check("money, deleting and handing over stay with the owner whatever is stored", OWNER_ONLY_ACTIONS.every((a) => !can("admin", a, greedy) && !can("moderator", a, greedy)) && can("moderator", "manage_settings", greedy))
  check("what a member may do never depends on the choices", ["view", "post", "comment", "react", "report"].every((a) => can("member", a as CommunityAction, noContent)) && !can("member", "moderate_content", parseRolePermissions({ member: { content: true } })))
  check("staff keep the member actions even with every group off", (() => {
    const off = parseRolePermissions({ admin: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])), moderator: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) })
    return can("admin", "post", off) && can("moderator", "comment", off) && !can("admin", "manage_settings", off) && !can("moderator", "ban", off)
  })())
  check("the owner is never narrowed", Object.keys(allowedActions("owner", parseRolePermissions({ admin: { settings: false } }))).length === Object.keys(allowedActions("owner")).length)
  check("junk is dropped, so a bad row means the defaults, never more", JSON.stringify(parseRolePermissions({ admin: { content: "yes", nope: true }, owner: { x: true }, moderator: [] })) === "{}" && JSON.stringify(parseRolePermissions("admin")) === "{}" && JSON.stringify(parseRolePermissions(null)) === "{}")
  check("roleGroups fills the defaults around a choice", roleGroups("moderator", noContent).content === false && roleGroups("moderator", noContent).members === true && roleGroups("moderator", noContent).settings === false)
  check("without the people group an admin cannot change roles", assignableRoles("admin", parseRolePermissions({ admin: { people: false } })).length === 0 && assignableRoles("admin").join() === "moderator,member")

  /* ── Roles: stored and read ──────────────────────────────────────────── */
  console.log("\nroles, stored")
  const missingCol = fakeDb({ communities: [{ id: CID, name: "Makers" }] }, { failWith: { communities: { code: "42703", message: 'column communities.role_permissions does not exist' } } })
  const before = await rolePermissionsOf(missingCol, CID)
  check("before part 100 the read answers the defaults and not ready", JSON.stringify(before.perms) === "{}" && before.ready === false)
  const refusedEarly = await saveRolePermissions(missingCol, { communityId: CID, communityName: "Makers", actorId: OWNER, role: "owner", body: { moderator: { content: false } } })
  check("and saving says an update is needed (503), never pretends", !refusedEarly.ok && status(refusedEarly) === 503 && (refusedEarly as { error?: string }).error === "needs_update")
  const db = fakeDb({ communities: [{ id: CID, name: "Makers", role_permissions: {} }], community_audit_log: [] })
  const notOwner = await saveRolePermissions(db, { communityId: CID, communityName: "Makers", actorId: ADMIN, role: "admin", body: { moderator: { content: false } } })
  check("only the owner changes them", !notOwner.ok && status(notOwner) === 403)
  const empty = await saveRolePermissions(db, { communityId: CID, communityName: "Makers", actorId: OWNER, role: "owner", body: { owner: { content: false } } })
  check("a body with nothing about admins or moderators is refused", !empty.ok && status(empty) === 400)
  const saved = await saveRolePermissions(db, { communityId: CID, communityName: "Makers", actorId: OWNER, role: "owner", body: { moderator: { content: false }, admin: { analytics: false } } })
  const stored = db.tables.communities[0].role_permissions as Record<string, Record<string, boolean>>
  check("the owner's choice is stored whole, the defaults filled in", saved.ok && stored.moderator.content === false && stored.moderator.members === true && stored.admin.analytics === false && stored.admin.settings === true && Object.keys(stored.admin).length === PERMISSION_KEYS.length)
  check("and what changed is in the audit log", db.tables.community_audit_log.some((a: Record<string, unknown>) => a.action === "community.roles_changed" && JSON.stringify(a.detail).includes("moderator.content=off")))
  check("a gate reads them only for an admin or a moderator", (await staffPermissions(db, CID, "owner")) === null && (await staffPermissions(db, CID, "member")) === null && (await staffPermissions(db, CID, "moderator"))?.moderator?.content === false)
  const many = await staffPermissionsFor(db, [CID])
  check("the list reads several at once", many.get(CID)?.admin?.analytics === false)

  /* ── Moderation, end to end, with the owner's choices ────────────────── */
  console.log("\nmoderation")
  const POST = UID(20)
  const mdb = fakeDb({
    communities: [{ id: CID, name: "Makers", role_permissions: {} }],
    community_members: [
      { id: "m0", community_id: CID, user_id: OWNER, status: "active", role: "owner", source: "owner", tier_id: null },
      { id: "m1", community_id: CID, user_id: ADMIN, status: "active", role: "admin", source: "free", tier_id: null },
      { id: "m2", community_id: CID, user_id: MOD, status: "active", role: "moderator", source: "free", tier_id: null },
      { id: "m3", community_id: CID, user_id: AUTHOR, status: "active", role: "member", source: "free", tier_id: null },
    ],
    community_feed_posts: [{ id: POST, community_id: CID, author_id: AUTHOR, status: "published", title: "Hello", body_text: "hello", pinned: false, locked: false, featured: false, space_id: UID(30) }],
    community_reports: [],
    community_audit_log: [],
  })
  const post = () => mdb.tables.community_feed_posts[0] as Record<string, unknown>
  const member = (id: string) => mdb.tables.community_members.find((m: Record<string, unknown>) => m.user_id === id) as Record<string, unknown>
  const asMod = { userId: MOD, role: "moderator" as const }
  const pin = await actOnContent(mdb, { community, actor: asMod, action: "pin", targetType: "post", targetId: POST })
  check("pin to top", pin.ok && post().pinned === true)
  const lock = await actOnContent(mdb, { community, actor: asMod, action: "lock", targetType: "post", targetId: POST })
  check("close comments", lock.ok && post().locked === true)
  const reopen = await actOnContent(mdb, { community, actor: asMod, action: "reopen", targetType: "post", targetId: POST })
  check("and open them again", reopen.ok && post().locked === false)
  const remove = await actOnContent(mdb, { community, actor: asMod, action: "remove", targetType: "post", targetId: POST, reason: "spam" })
  check("remove", remove.ok && post().status === "removed")
  const restore = await actOnContent(mdb, { community, actor: { userId: ADMIN, role: "admin" }, action: "restore", targetType: "post", targetId: POST })
  check("restore", restore.ok && post().status === "published")
  const mute = await actOnMember(mdb, { community, actor: asMod, action: "mute", userId: AUTHOR, until: 24 * 3 })
  const until = Date.parse(String(member(AUTHOR).muted_until))
  check("mute, time boxed: three days from now", mute.ok && Math.abs(until - (Date.now() + 3 * 86_400_000)) < 60_000)
  const unmute = await actOnMember(mdb, { community, actor: asMod, action: "unmute", userId: AUTHOR })
  check("unmute", unmute.ok && !member(AUTHOR).muted_until)
  const ban = await actOnMember(mdb, { community, actor: asMod, action: "ban", userId: AUTHOR, reason: "spam" })
  check("ban", ban.ok && member(AUTHOR).status === "banned")
  const unban = await actOnMember(mdb, { community, actor: asMod, action: "unban", userId: AUTHOR })
  check("unban", unban.ok && member(AUTHOR).status !== "banned")
  check("every one of them is in the audit log", ["post.pinned", "post.locked", "post.reopened", "post.removed", "post.restored", "member.muted", "member.unmuted", "member.banned", "member.unbanned"].every((a) => mdb.tables.community_audit_log.some((x: Record<string, unknown>) => x.action === a)), mdb.tables.community_audit_log.map((x: Record<string, unknown>) => x.action).join(","))
  /* The owner takes posts and bans away from moderators: the same calls are refused, read from the community itself. */
  ;(mdb.tables.communities[0] as Record<string, unknown>).role_permissions = { moderator: { content: false, members: false } }
  const removeOff = await actOnContent(mdb, { community, actor: asMod, action: "remove", targetType: "post", targetId: POST })
  const banOff = await actOnMember(mdb, { community, actor: asMod, action: "ban", userId: AUTHOR })
  check("with content off, a moderator's remove is refused (403)", !removeOff.ok && status(removeOff) === 403 && post().status === "published")
  check("with members off, a moderator's ban is refused (403)", !banOff.ok && status(banOff) === 403)
  const reportOk = await updateReport(mdb, { community, actor: asMod, id: UID(99), status: "resolved" })
  check("reports stay theirs (404 for a report that is not there, not 403)", !reportOk.ok && status(reportOk) === 404)
  ;(mdb.tables.communities[0] as Record<string, unknown>).role_permissions = { moderator: { reports: false } }
  const reportOff = await updateReport(mdb, { community, actor: asMod, id: UID(99), status: "resolved" })
  check("with reports off, the queue is refused", !reportOff.ok && status(reportOff) === 403)
  const passedIn = await actOnContent(mdb, { community, actor: { ...asMod, perms: {} }, action: "pin", targetType: "post", targetId: POST })
  check("a caller that already read the choices passes them and nothing is read again", passedIn.ok)

  check("the queue tells a join alarm and a paused invite link apart", systemReportKind("Join alarm: 40 people joined in 60 minutes, so new people now ask to join.") === "join_alarm" && systemReportKind("Invite link turned off: used 30 times") === "invite_paused" && systemReportKind("spam") === null && systemReportKind(null) === null)
  const modSection = code("components/community/creator/moderation-section.tsx")
  check("a join alarm offers Turn approval off and Keep it on, and resolves its report", /settleAlarm/.test(modSection) && /approvalRequired: false/.test(modSection) && /Turn approval off/.test(modSection) && /Keep it on/.test(modSection))

  /* ── The gates hand the choices to can() ─────────────────────────────── */
  console.log("\ngates")
  const ctx = code("lib/communities/server/context.ts")
  check("viewerContext reads the owner's choices for staff", /const perms = await staffPermissions\(db, community\.id, role\)/.test(ctx))
  check("requireMember and requireCreatorCommunity decide with them", /can\(viewer\.role, action, viewer\.perms\)/.test(ctx) && /can\(role, action, viewer\.perms\)/.test(ctx))
  check("what a client is told it may do includes them", /allowedActions\(v\.role, v\.perms\)/.test(ctx))
  const creator = code("lib/communities/server/creator.ts")
  check("the /app pages decide with them", /can\(ctx\.role, action, ctx\.viewer\.perms\)/.test(creator) && /allowedActions\(ctx\.role, ctx\.viewer\.perms\)/.test(creator))
  for (const f of ["app/app/community/[id]/moderation/page.tsx", "app/app/community/[id]/members/page.tsx", "app/app/community/[id]/feed/page.tsx"]) check(`${f}: every can() has the choices`, !/can\(ctx\.role, "[a-z_]+"\)/.test(code(f)))
  const mod = code("lib/communities/server/moderation.ts")
  check("moderation never decides on the role alone", !/[^.]can\(a\.actor\.role/.test(mod) && /actorMay\(/.test(mod))

  /* ── The Free plan's two ─────────────────────────────────────────────── */
  console.log("\nplan")
  check("Free makes two, Pro has no limit", FREE_COMMUNITY_LIMIT === 2 && communityLimitFor("free") === 2 && communityLimitFor(null) === 2 && communityLimitFor("growth") === null && communityLimitFor("pro") === null)
  check("the third on Free is refused, any on Pro is not", mayCreateCommunity("free", 1) && !mayCreateCommunity("free", 2) && mayCreateCommunity("growth", 40))
  const full = fakeDb({ communities: [{ id: CID, creator_id: UID(70), deleted_at: null, name: "A", tagline: null, description: "", logo_url: null, cover_url: null, visibility: "public", access: "free", rules: [], faq: [], benefits: [], links: [], onboarding: {} }, { id: UID(71), creator_id: UID(70), deleted_at: null }] })
  const third = await duplicateCommunity(full, { source: full.tables.communities[0] as unknown as CommunityRow, creatorId: UID(70), userId: OWNER })
  check("a duplicate at the limit answers 402 plan_limit and makes nothing", !third.ok && status(third) === 402 && (third as { error?: string }).error === PLAN_LIMIT_ERROR && full.tables.communities.length === 2)
  check("creating at the limit answers 402 plan_limit first", /if \(!\(await communityRoom\(db, a\.creatorId\)\)\.ok\) return no\(402, PLAN_LIMIT_ERROR\)\n\s+const \{ access, visibility \}/.test(creator))
  check("the plan comes from the one place Sites reads it", /creatorSitePlan\(creatorId\)/.test(creator) && /from "@\/lib\/sites\/plan-server"/.test(creator))
  const list = code("components/community/creator/community-list.tsx")
  const create = code("components/community/creator/create-flow.tsx")
  check("New community and Duplicate open the upgrade sheet at the limit", /setUpgrade\(true\)/.test(list) && /res\.status === 402/.test(list) && /<UpgradeSheet/.test(list) && /res\.status === 402/.test(create) && /<UpgradeSheet/.test(create))
  const sheet = code("components/community/creator/upgrade-sheet.tsx")
  check("the sheet sells Pro from the plans table and goes to the plans page", /offeredPlan\(PRO_CHECKOUT_PLAN_ID\)/.test(sheet) && /\/app\/settings\/billing\/upgrade/.test(sheet))

  /* ── Duplicate ───────────────────────────────────────────────────────── */
  console.log("\nduplicate")
  const src = { id: CID, creator_id: UID(80), owner_user_id: OWNER, slug: "makers", name: "Makers", tagline: "Make things", description: "<p>Hi</p>", logo_url: "https://x.supabase.co/l.png", cover_url: null, visibility: "public", access: "paid", status: "published", category: "art", language: "en", rules: [{ title: "Be kind", body: "" }], faq: [], benefits: ["Calls"], links: [], onboarding: { enabled: true }, approval_required: true, discovery_enabled: true, directory_enabled: false, classroom_enabled: true, events_enabled: false, chat_enabled: true, gamification_enabled: false, member_count: 40, post_count: 9, role_permissions: { moderator: { content: false } }, deleted_at: null }
  const ddb = fakeDb({ communities: [src], community_members: [{ id: "x", community_id: CID, user_id: AUTHOR, status: "active", role: "member" }], community_spaces: [], community_levels: [], community_tiers: [], community_audit_log: [] })
  const copy = await duplicateCommunity(ddb, { source: src as unknown as CommunityRow, creatorId: UID(80), userId: OWNER })
  const made = ddb.tables.communities.find((c: Record<string, unknown>) => c.id !== CID) as Record<string, unknown> | undefined
  check("a duplicate is a new draft with the settings", copy.ok && !!made && made.status === "draft" && made.name === "Makers copy" && JSON.stringify(made.rules) === JSON.stringify(src.rules) && made.approval_required === true && made.directory_enabled === false && made.events_enabled === false, JSON.stringify(made ?? copy))
  check("a paid one's copy starts free (a price is a product with buyers of its own)", made?.access === "free")
  check("never the members", !ddb.tables.community_members.some((m: Record<string, unknown>) => m.community_id === made?.id && m.user_id === AUTHOR))
  check("the roles come along", JSON.stringify((made?.role_permissions as Record<string, Record<string, boolean>>)?.moderator?.content) === "false")
  const dupRoute = code("app/api/app/community/[id]/duplicate/route.ts")
  check("the duplicate route: switch first, the owner only, rate limited", /requireCommunitiesOn\(\)[\s\S]*requireCreatorCommunity\(id, "transfer_ownership"\)[\s\S]*manageLimit/.test(dupRoute) && /creator_id !== gate\.ctx\.creatorId/.test(dupRoute))

  /* ── Rules and policies (worker M's helpers and columns) ─────────────── */
  console.log("\npolicies")
  check("a refund policy is plain text, at most 2000 characters, empty is none", REFUND_POLICY_MAX === 2000 && cleanRefundPolicy("  a\r\nb\u0000 ") === "a\nb" && cleanRefundPolicy("x".repeat(3000))?.length === 2000 && cleanRefundPolicy("   ") === null)
  check("a contact email is an address or nothing", cleanContactEmail(" Me@Example.COM ") === "me@example.com" && cleanContactEmail("not an email") === null && cleanContactEmail("") === null)
  const pdbMissing = fakeDb({ communities: [{ id: CID }] }, { failWith: { communities: { code: "42703", message: "column communities.refund_policy does not exist" } } })
  const pRead = await loadPolicies(pdbMissing, CID)
  check("before part 101 the policies read as not ready", pRead.ready === false && pRead.refundPolicy === "")
  const pdb = fakeDb({ communities: [{ id: CID, name: "Makers", refund_policy: null, contact_email: null, contact_email_public: false }], community_audit_log: [] })
  const notOwnerP = await savePolicies(pdb, { community, role: "admin", actorId: ADMIN, body: { refundPolicy: "x" } })
  check("only the owner saves them", !notOwnerP.ok && status(notOwnerP) === 403)
  const badEmail = await savePolicies(pdb, { community, role: "owner", actorId: OWNER, body: { contactEmail: "nope" } })
  check("a wrong email is said beside its field", !badEmail.ok && status(badEmail) === 400 && (badEmail as { field?: string }).field === "contactEmail")
  const tooLong = await savePolicies(pdb, { community, role: "owner", actorId: OWNER, body: { refundPolicy: "x".repeat(2001) } })
  check("a policy over 2000 characters is refused", !tooLong.ok && (tooLong as { field?: string }).field === "refundPolicy")
  const pSaved = await savePolicies(pdb, { community, role: "owner", actorId: OWNER, body: { refundPolicy: "Full refund within 14 days.", contactEmail: "Owner@Makers.io", contactEmailPublic: true } })
  const prow = pdb.tables.communities[0] as Record<string, unknown>
  check("saved through the helpers, and logged", pSaved.ok && prow.refund_policy === "Full refund within 14 days." && prow.contact_email === "owner@makers.io" && prow.contact_email_public === true && pdb.tables.community_audit_log.some((a: Record<string, unknown>) => a.action === "community.policies_changed"))
  await savePolicies(pdb, { community, role: "owner", actorId: OWNER, body: { contactEmail: "" } })
  check("taking the email away hides it too", prow.contact_email === null && prow.contact_email_public === false)
  check("part 100 does not add M's columns", !/refund_policy|contact_email/.test(read("supabase/sql/run-now/100_community_role_permissions.sql")))

  /* ── Analytics ───────────────────────────────────────────────────────── */
  console.log("\nanalytics")
  check("churn is cancelled over those paying at the start, one decimal", churnRate({ activeNow: 90, cancelled: 10, started: 0 }) === 10 && churnRate({ activeNow: 18, cancelled: 3, started: 1 }) === 15)
  check("with nobody paying at the start there is no rate, never a made up one", churnRate({ activeNow: 4, cancelled: 0, started: 4 }) === null && churnRate({ activeNow: 0, cancelled: 0, started: 0 }) === null)
  check("an invite is named by who it was for, or when the link was made", inviteLabel({ email: "a@b.co", created_at: "2026-09-01T00:00:00Z", max_uses: null }) === "Invite to a@b.co" && inviteLabel({ email: null, created_at: "2026-09-01T12:00:00Z", max_uses: 5 }) === "Link made Sep 1")
  const now = Date.parse("2026-10-05T12:00:00Z")
  const day = (d: number) => new Date(now - d * 86_400_000).toISOString()
  const P1 = UID(90)
  const P2 = UID(91)
  const adb = fakeDb({
    community_tiers: [
      { community_id: CID, kind: "paid", billing: "recurring", product_id: P1 },
      { community_id: CID, kind: "paid", billing: "one_time", product_id: P2 },
    ],
    memberships: [
      { id: "s1", product_id: P1, status: "active", billing_interval: "month", amount_cents: 1900, currency: "usd", created_at: day(60), canceled_at: null },
      { id: "s2", product_id: P1, status: "active", billing_interval: "year", amount_cents: 19200, currency: "usd", created_at: day(5), canceled_at: null },
      { id: "s3", product_id: P1, status: "past_due", billing_interval: "month", amount_cents: 1900, currency: "usd", created_at: day(90), canceled_at: null },
      { id: "s4", product_id: P1, status: "canceled", billing_interval: "month", amount_cents: 1900, currency: "usd", created_at: day(100), canceled_at: day(3) },
      { id: "s5", product_id: P1, status: "incomplete", billing_interval: "month", amount_cents: 1900, currency: "usd", created_at: day(2), canceled_at: null },
    ],
    orders: [
      { id: "o1", product_id: P2, status: "refunded", amount_cents: 9900, refund_amount_cents: 9900, currency: "usd", refunded_at: day(4) },
      { id: "o2", product_id: P2, status: "refunded", amount_cents: 9900, refund_amount_cents: 2000, currency: "usd", refunded_at: day(45) },
      { id: "o3", product_id: P2, status: "completed", amount_cents: 9900, currency: "usd" },
    ],
    community_members: [
      { id: "j1", community_id: CID, source: "free", status: "active", joined_at: day(2), last_active_at: day(1) },
      { id: "j2", community_id: CID, source: "free", status: "active", joined_at: day(10), last_active_at: day(20) },
      { id: "j3", community_id: CID, source: "invite", status: "active", joined_at: day(3), last_active_at: day(40) },
      { id: "j4", community_id: CID, source: "subscription", status: "active", joined_at: day(5), last_active_at: day(2) },
      { id: "j5", community_id: CID, source: "free", status: "active", joined_at: day(200), last_active_at: day(100) },
      { id: "j6", community_id: CID, source: "owner", status: "active", joined_at: day(300), last_active_at: day(0) },
    ],
    community_invites: [
      { id: "i1", community_id: CID, email: null, created_at: "2026-09-20T12:00:00Z", max_uses: null, revoked_at: null, uses: 1 },
      { id: "i2", community_id: CID, email: "pal@x.co", created_at: "2026-09-21T12:00:00Z", max_uses: 1, revoked_at: null, uses: 0 },
    ],
    community_invite_uses: [{ invite_id: "i1", user_id: UID(60), used_at: day(3) }],
  })
  const stats = await loadMoneyAndGrowth(adb, CID, 30, now)
  const r = stats.revenue
  check("MRR from active and past due subscriptions, a yearly one as a twelfth", r?.mrrCents === 1900 + 1600 + 1900, String(r?.mrrCents))
  check("active subscribers counted, the incomplete and the cancelled are not", r?.activeSubscribers === 3)
  check("new subscribers in the period, an unfinished checkout is not one", r?.newSubscribers === 1)
  check("cancellations in the period", r?.cancellations === 1)
  check("the churn rate from those rows", r?.churnRate === Math.round((1 / (3 + 1 - 1)) * 1000) / 10)
  check("refunds in the period from the refunded orders of the products its tiers sell", r?.refunds.count === 1 && r?.refunds.totalCents === 9900)
  check("joins by source, the owner's own row is not a join", stats.joins.total === 4 && stats.joins.bySource[0]?.source === "free" && stats.joins.bySource[0]?.count === 2 && !stats.joins.bySource.some((x) => x.source === "owner"))
  check("the invite link that brought someone in", stats.joins.invites.length === 1 && stats.joins.invites[0].uses === 1 && stats.joins.invites[0].label === "Link made Sep 20")
  check("active members in 7 and 30 days", stats.active.last7 === 3 && stats.active.last30 === 4, JSON.stringify(stats.active))
  const freeStats = await loadMoneyAndGrowth(fakeDb({ community_tiers: [], community_members: [] }), CID, 30, now)
  check("a community that sells nothing has no revenue block", freeStats.revenue === null)
  const ana = code("components/community/creator/analytics-section.tsx")
  check("the revenue strip is the /app Analytics figure tabs", /from "@\/components\/app\/metric-tab"/.test(ana) && /useTabStrip/.test(ana) && ["Monthly revenue", "Active subscribers", "Cancellations", "Churn rate", "Refunds"].every((w) => ana.includes(w)))
  check("the joins and invite cards", /How people joined/.test(ana) && /Invite links/.test(ana))
  const anaRoute = code("app/api/app/community/[id]/analytics/route.ts")
  check("the analytics route answers money too, behind view_analytics", /requireCreatorCommunity\(id, "view_analytics"\)/.test(anaRoute) && /loadMoneyAndGrowth/.test(anaRoute))

  /* ── The list, the editor, the settings ──────────────────────────────── */
  console.log("\nscreens")
  check("the list is a grid of cards with cover, logo, state, members and MRR", /data-community-grid/.test(list) && /sm:grid-cols-2/.test(list) && /lg:grid-cols-3/.test(list) && /data-card-cover/.test(list) && /data-card-logo/.test(list) && /data-card-mrr/.test(list) && /data-card-members/.test(list))
  check("each card's menu: Open, Edit, Share, Analytics, Duplicate settings, Archive", ["\"Open\"", "\"Edit\"", "\"Share\"", "\"Analytics\"", "\"Duplicate settings\"", "\"Archive\"", "\"Bring back\""].every((w) => list.includes(w)) && /ResponsiveActionMenu/.test(list))
  check("and only what this person may do", /r\.can\.edit/.test(list) && /r\.can\.analytics/.test(list) && /r\.can\.duplicate/.test(list) && /r\.can\.archive/.test(list))
  check("MRR on a card only for somebody who may see analytics", /may\(c, "view_analytics"\)/.test(creator))
  check("archiving asks first; sharing uses the system sheet or copies", /<Confirm/.test(list) && /navigator\.share/.test(list) && /clipboard\.writeText/.test(list))
  const shell = code("components/community/creator/community-shell.tsx")
  check("the editor's sections: Learn and Calendar", /label: "Learn"/.test(shell) && /label: "Calendar"/.test(shell) && !/label: "Classroom"/.test(shell) && !/label: "Events"/.test(shell))
  check("New community is the product editor: phone bar, two columns, foot bar from 1024px", /data-create-bar/.test(create) && /lg:hidden/.test(create) && /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/.test(create) && /data-create-foot/.test(create) && /sticky bottom-0/.test(create) && /barButton/.test(create) && /primaryDepth/.test(create))
  check("and is a page layer on a phone, as New product", /<PageLayer pill inset="bar" phoneOnly>/.test(code("app/app/community/new/layout.tsx")))
  const settings = code("components/community/creator/settings-section.tsx")
  const parts = code("components/community/creator/parts.tsx")
  check("Settings forms have the editor's save foot: Cancel and Save, always there", /export function EditorFoot/.test(parts) && /<SaveButton/.test(parts) && /Cancel/.test(parts) && /<EditorFoot/.test(settings))
  check("the Page tab is two columns from 1024px with the editor's cards", /lg:grid-cols-\[minmax\(0,1fr\)_320px\]/.test(settings) && /<EditorCard title="About"/.test(settings) && /<EditorCard title="Address"/.test(settings))
  check("Settings has Rules and policies and, for the owner, Roles", /value: "policies", label: "Rules and policies"/.test(settings) && /value: "roles", label: "Roles", needs: "transfer_ownership"/.test(settings) && /<RulesEditor/.test(settings) && /PERMISSION_GROUPS\.map/.test(settings))
  check("old links to the rules land on the new tab", settingsTabOf("rules") === "policies" && settingsTabOf("roles") === "roles" && settingsTabOf("policies") === "policies" && settingsTabOf("page") === "page")
  const patch = code("app/api/app/community/[id]/route.ts")
  check("the settings route saves roles and policies through the owner only helpers", /saveRolePermissions\(/.test(patch) && /savePolicies\(/.test(patch))

  /* ── SQL part 100 ────────────────────────────────────────────────────── */
  console.log("\nsql")
  const part = read("supabase/sql/run-now/100_community_role_permissions.sql")
  const lines = part.split("\n").filter((l) => l.trim())
  check("a summary comment on line 1", /^\/\* .+ \*\/$/.test(lines[0]))
  check("one statement per line, the DO block on one line", lines.slice(1).every((l) => /;\s*$/.test(l)) && lines.filter((l) => /^DO \$do\$/.test(l)).length === 1)
  check("safe twice: IF NOT EXISTS for the column and the check", /ADD COLUMN IF NOT EXISTS role_permissions jsonb NOT NULL DEFAULT '\{\}'::jsonb/.test(part) && /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'communities_role_permissions_shape'/.test(part))
  check("it skips itself without part 81", /IF to_regclass\('public\.communities'\) IS NULL THEN RAISE NOTICE/.test(part))
  check("server only: not readable or writable by visitors or members", /REVOKE SELECT \(role_permissions\), INSERT \(role_permissions\), UPDATE \(role_permissions\) ON public\.communities FROM PUBLIC, anon, authenticated/.test(part))
  check("notify pgrst last", lines[lines.length - 1].trim() === "notify pgrst, 'reload schema';")
  check("the migration copy is the same", existsSync("supabase/migrations/20261116_community_role_permissions.sql") && read("supabase/migrations/20261116_community_role_permissions.sql") === part)
  check("a README row and a p100 check column", read("supabase/sql/run-now/README.md").includes("`100_community_role_permissions.sql`") && /as p100_community_role_permissions/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("the bundles carry it", read("supabase/sql/all-in-two/1_of_2_everything.sql").includes("communities_role_permissions_shape"))

  /* ── Copy and client code ────────────────────────────────────────────── */
  console.log("\ncopy")
  const mine = [
    "components/community/creator/community-list.tsx",
    "components/community/creator/create-flow.tsx",
    "components/community/creator/upgrade-sheet.tsx",
    "components/community/creator/settings-section.tsx",
    "components/community/creator/analytics-section.tsx",
    "components/community/creator/moderation-section.tsx",
    "components/community/creator/parts.tsx",
    "components/community/creator/community-shell.tsx",
    "lib/communities/permissions.ts",
    "lib/communities/plan-limit.ts",
    "lib/communities/server/creator-roles.ts",
    "lib/communities/server/stats.ts",
    "supabase/sql/run-now/100_community_role_permissions.sql",
  ]
  for (const f of mine) {
    const text = read(f)
    check(`${f}: no em dash`, !text.includes("—"))
    check(`${f}: no banned word`, !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }
  for (const f of mine.filter((x) => x.endsWith(".tsx"))) check(`${f}: a client file imports no server code`, !/from "@\/lib\/communities\/server|next\/headers|"server-only"|lib\/admin-blog-auth|lib\/sites\/plan-server/.test(code(f)))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
