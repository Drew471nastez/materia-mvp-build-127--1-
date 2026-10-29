import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { cache } from "react"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { SHELL_CREATOR_COLUMNS, SHELL_PRIVATE_CREATOR_COLUMNS, creatorForRequest, currentUserForRequest, type RequestCreator } from "@/lib/auth/request-scope"
import { shouldSendToLogin } from "@/lib/auth/current-user"
import { sendEmail } from "@/lib/mail"
import { emailImageSrc } from "@/lib/email-campaigns/sender"
import { teamInviteEmail } from "./invite-email"
import { baseUrl } from "@/lib/notify/urls"
import { isProPlan } from "@/lib/home/progress"
import { INVITE_TTL_MS, isMemberRole, resendWait, seatLimit, teamEmail, type MemberRole, type TeamRole } from "./roles"
import {
  TEAM_PERMISSIONS,
  accessSummaryEn,
  grantable,
  homeFor,
  legacyPermissions,
  legacyRoleFor,
  normalizePermissions,
  permissionsOfRow,
  permits,
  type TeamArea,
  type TeamPermission,
} from "./permissions"
import { acceptable, inviteStateOf, refusalOf, sameEmail, tokenShapeOk, type InviteRow, type InviteState } from "./invite-state"
import { teamHomeHref } from "./landing"
import { teamStampDb } from "./audit"

/**
 * ===========================================================================
 *  A STORE'S TEAM, ON THE SERVER
 * ===========================================================================
 * The team lives in public.store_team_members (SQL part 135), which only
 * the service role can read: a member's browser can never list a team,
 * change what someone may do or join a store by itself. Everything goes
 * through here. Since part 320 each member has their own permissions
 * (lib/team/permissions.ts); before it runs, a row reads as what its old
 * role could use.
 *
 * A member signs in with their OWN Storelib account. They are never given
 * the owner's session (that is how businesses switch, lib/businesses, and
 * it would hand a member everything the owner can do, payouts included).
 * Instead they choose which store they are working in (a cookie that only
 * names a store), and every page and route a member can reach asks
 * requireTeamPermission() / creatorFor(): it re-reads the membership and the
 * permissions from the database on each request, so a removed member, a
 * permission taken away or a cookie pointed at another store gets nothing.
 *
 * A page that has not been taught about the team keeps reading the signed
 * in account's own store, which for a member is their own (often empty)
 * account: nothing of the owner's can reach a page that does not ask.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The cookie that says which store a member is working in. It names a store; the database says whether they may. */
export const TEAM_STORE_COOKIE = "sl_team_store"

export const TEAM_NOT_SET_UP = "The team is not set up on Storelib yet. Try again later."
/** Said when part 320 has not run and the change needs its column. */
export const PERMISSIONS_NOT_SET_UP = "Team permissions are not set up on Storelib yet. Try again later."
/** Said to a member asking for an area their permissions do not have. */
export const NO_ACCESS = "You don't have access to this. Ask the store's owner."

export interface TeamMemberRow {
  id: string
  creator_id: string
  email: string
  user_id: string | null
  /** The old column, still written (lib/team/permissions legacyRoleFor). */
  role: MemberRole
  permissions: TeamPermission[]
  status: "invited" | "active"
  invited_at: string
  expires_at: string | null
  accepted_at: string | null
}

const BASE_COLUMNS = "id, creator_id, email, user_id, role, status, invited_at, expires_at, accepted_at"
const MEMBER_COLUMNS = `${BASE_COLUMNS}, permissions`

/** The table is not there yet (part 135 not run): said, never thrown. */
export function teamMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return ["42P01", "PGRST205", "PGRST204", "42703"].includes(error.code ?? "") || /store_team_members/.test(error.message ?? "")
}

/** The permissions column is not there yet (part 320 not run): the row is read as its role. */
export function permissionsMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return ["42703", "PGRST204"].includes(error.code ?? "") && /permissions/.test(error.message ?? "")
}

/** A read of team rows with their permissions, read again without them when part 320 has not run. */
async function readRows<T>(run: (columns: string) => PromiseLike<{ data: T; error: { code?: string; message?: string } | null }>): Promise<{ data: T; error: { code?: string; message?: string } | null }> {
  const first = await run(MEMBER_COLUMNS)
  if (!permissionsMissing(first.error)) return first
  return run(BASE_COLUMNS)
}

/** A row as the app uses it: its permissions always a clean list. */
function memberOf(row: Record<string, unknown>): TeamMemberRow {
  return { ...(row as unknown as TeamMemberRow), permissions: permissionsOfRow(row) }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

type StoreRow = { id: string; user_id?: string | null; slug: string | null; display_name: string | null; subscription_plan_id: string | null }

/** The store this account owns, if it owns one. */
export async function ownStore(db: Db, userId: string): Promise<StoreRow | null> {
  const { data } = await db.from("creators").select("id, slug, display_name, subscription_plan_id").eq("user_id", userId).maybeSingle()
  return (data as StoreRow | null) ?? null
}

/**
 * WHAT EACH STORE IS CALLED: Settings › Store details' name
 * (store_settings.store_name), the one receipts, order emails and checkout
 * are signed with. The invite, the member's store list and the "You're now
 * on …" line said the owner's own name (creators.display_name) while every
 * buyer saw the store's. Only stores that have one are in the map; any
 * failure is an empty map, and the owner's name stands in.
 */
export async function storeNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  try {
    const { data, error } = await db.from("store_settings").select("creator_id, store_name").in("creator_id", ids)
    if (error) return out
    for (const r of (data ?? []) as { creator_id?: string; store_name?: string | null }[]) {
      const name = typeof r.store_name === "string" ? r.store_name.trim() : ""
      if (r.creator_id && name) out.set(r.creator_id, name)
    }
  } catch {
    /* The owner's name stands in. */
  }
  return out
}

/** One store's name for its team's emails and lists: Store details' name, else the owner's, else its address. */
async function storeNameOf(db: Db, store: { id: string; display_name: string | null; slug: string | null }, fallback: string): Promise<string> {
  return (await storeNames(db, [store.id])).get(store.id) || store.display_name || store.slug || fallback
}

export async function listTeam(db: Db, creatorId: string): Promise<{ ok: true; members: TeamMemberRow[] } | { ok: false; error: string; missing?: boolean }> {
  const { data, error } = await readRows<Record<string, unknown>[] | null>((cols) => db.from("store_team_members").select(cols).eq("creator_id", creatorId).order("invited_at", { ascending: true }))
  if (error) return teamMissing(error) ? { ok: false, error: TEAM_NOT_SET_UP, missing: true } : { ok: false, error: "Could not read the team. Try again." }
  return { ok: true, members: (data ?? []).map(memberOf) }
}

type Result<T> = ({ ok: true } & T) | { ok: false; status: number; error: string }

/**
 * WHOSE TEAM, AND WHAT THEY MAY GIVE. The owner manages their own store's
 * team and may give anything open to the team. A member working in a store
 * with the Team permission manages that store's team, and only up to what
 * they have themselves: they cannot give payouts they do not have, change
 * the owner, or change their own access.
 */
export interface TeamScope {
  store: StoreRow
  byOwner: boolean
  /** What this person may give. */
  grant: TeamPermission[]
  /** Their own row when they are a member, so they are never their own editor. */
  selfMemberId: string | null
}

/**
 * `acting` is the store the request works in, read from its cookie when not
 * given (a suite hands it in, as the cookie would name it).
 */
export async function teamScope(db: Db, userId: string, given?: ActingStore | null): Promise<Result<{ scope: TeamScope }>> {
  const acting = given !== undefined ? given : await actingStore(db, userId).catch(() => null)
  if (acting) {
    if (!permits(acting.permissions, "team")) return { ok: false, status: 403, error: "Only the store's owner, or someone they gave Team to, can change its team." }
    const { data } = await db.from("creators").select("id, user_id, slug, display_name, subscription_plan_id").eq("id", acting.creatorId).maybeSingle()
    if (!data) return { ok: false, status: 404, error: "This store isn't on Storelib any more." }
    return { ok: true, scope: { store: data as StoreRow, byOwner: false, grant: grantable(false, acting.permissions), selfMemberId: acting.memberId } }
  }
  const store = await ownStore(db, userId)
  if (!store) return { ok: false, status: 403, error: "Only a store's owner can change its team." }
  return { ok: true, scope: { store, byOwner: true, grant: grantable(true, []), selfMemberId: null } }
}

/** What an invite or a change asks for: a list of permissions, or (an older page) a role read as what it could use. */
function askedPermissions(input: { permissions?: unknown; role?: unknown }): TeamPermission[] {
  if (Array.isArray(input.permissions)) return normalizePermissions(input.permissions)
  if (isMemberRole(input.role)) return legacyPermissions(input.role)
  return []
}

/** Whether every permission asked for is one this person may give. */
function withinGrant(asked: readonly TeamPermission[], grant: readonly TeamPermission[]): boolean {
  return asked.every((p) => grant.includes(p))
}

/**
 * Invite someone by email, with what they may do. Sending again to the
 * same email is a new link (the old one stops working), with the access
 * given this time; someone already on the team is said so.
 */
export async function inviteMember(
  db: Db,
  opts: { owner: { id: string; email: string | null }; email: unknown; permissions?: unknown; role?: unknown; acting?: ActingStore | null },
): Promise<Result<{ member: TeamMemberRow; emailed: boolean }>> {
  const email = teamEmail(opts.email)
  if (!email) return { ok: false, status: 400, error: "Enter an email address." }
  const permissions = askedPermissions(opts)
  if (permissions.length === 0) return { ok: false, status: 400, error: "Choose at least one thing they can do." }
  if (opts.owner.email && email === opts.owner.email.toLowerCase()) return { ok: false, status: 400, error: "That is your own email. You are already on this store." }
  const scoped = await teamScope(db, opts.owner.id, opts.acting)
  if (scoped.ok === false) return { ok: false, status: scoped.status, error: scoped.status === 403 ? "Only a store's owner, or someone they gave Team to, can invite people to it." : scoped.error }
  const { store, grant } = scoped.scope
  if (!withinGrant(permissions, grant)) return { ok: false, status: 403, error: "You can only give access you have yourself." }

  const listed = await listTeam(db, store.id)
  if (listed.ok === false) return { ok: false, status: listed.missing ? 503 : 500, error: listed.error }
  const existing = listed.members.find((m) => m.email === email)
  if (existing?.status === "active") return { ok: false, status: 409, error: `${email} is already on your team.` }
  if (existing && !withinGrant(existing.permissions, grant)) return { ok: false, status: 403, error: "Only the owner can send this invite again." }
  /* The same invite again within a minute is a double press, not a second email (lib/team/roles RESEND_COOLDOWN_MS). */
  const wait = existing ? resendWait(existing.invited_at) : 0
  if (wait > 0) return { ok: false, status: 429, error: `An invite just went to ${email}. You can send it again in ${wait} seconds.` }
  const limit = seatLimit(isProPlan(store.subscription_plan_id))
  if (!existing && listed.members.length >= limit) {
    return { ok: false, status: 403, error: `Your plan has room for ${limit} people on the team. Remove someone, or upgrade to invite more.` }
  }

  const token = randomBytes(24).toString("base64url")
  const row = {
    creator_id: store.id,
    email,
    role: legacyRoleFor(permissions),
    permissions,
    status: "invited" as const,
    token_hash: hashToken(token),
    invited_by: opts.owner.id,
    invited_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    user_id: null,
    accepted_at: null,
  }
  const write = (r: Record<string, unknown>, cols: string) =>
    existing
      ? db.from("store_team_members").update(r).eq("id", existing.id).eq("creator_id", store.id).select(cols).single()
      : db.from("store_team_members").insert(r).select(cols).single()
  let { data, error } = await write(row, MEMBER_COLUMNS)
  if (permissionsMissing(error)) {
    /* Part 320 not run: only what the old role could hold can be kept, which is Orders. */
    const legacy = legacyPermissions("manager")
    if (permissions.join() !== legacy.join()) return { ok: false, status: 503, error: PERMISSIONS_NOT_SET_UP }
    const { permissions: _drop, ...without } = row
    ;({ data, error } = await write({ ...without, role: "manager" }, BASE_COLUMNS))
  }
  if (error || !data) return { ok: false, status: teamMissing(error) ? 503 : 500, error: teamMissing(error) ? TEAM_NOT_SET_UP : "Could not send the invite. Try again." }

  const member = memberOf(data as Record<string, unknown>)
  const storeName = await storeNameOf(db, store, "a store")
  const link = joinLink(token)
  const mail = teamInviteEmail({ storeName, permissions: member.permissions, email, link, ...(await inviteContext(db, store.id, opts.owner.id)) })
  const sent = await sendEmail({ to: email, subject: mail.subject, transactional: true, keepBounce: true, text: mail.text, html: mail.html }).catch(() => ({ success: false }))
  return { ok: true, member, emailed: !!sent.success }
}

/** The store's picture and the inviter's name for the invite email. Either may be missing; the email reads without them. */
async function inviteContext(db: Db, creatorId: string, inviterId: string): Promise<{ storeImageUrl: string | null; inviterName: string | null }> {
  const [creator, profile] = await Promise.all([
    db.from("creators").select("avatar_url").eq("id", creatorId).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
    db.from("profiles").select("display_name").eq("id", inviterId).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
  ])
  const avatar = (creator as { data: { avatar_url?: string | null } | null })?.data?.avatar_url ?? null
  const name = (profile as { data: { display_name?: string | null } | null })?.data?.display_name ?? null
  return { storeImageUrl: emailImageSrc(avatar, 48), inviterName: typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : null }
}

/** The page an invite link opens (app/team/join). The old /api/team/join address sends people here too. */
export function joinPath(token: string): string {
  return `/team/join?token=${encodeURIComponent(token)}`
}
export function joinLink(token: string): string {
  return `${baseUrl()}${joinPath(token)}`
}

type InviteStoreRow = { id: string; user_id: string | null; slug: string | null; display_name: string | null; avatar_url: string | null; subscription_plan_id: string | null }

/**
 * Everything an invite link needs, read once: the invite by its hash, the
 * store, how big the team is now, and (signed out only) whether the invited
 * email has an account, so the page offers Sign in or Create account. The
 * answer is decided by lib/team/invite-state.ts.
 */
export async function readInvite(
  db: Db,
  token: unknown,
  user: { id: string; email: string | null } | null,
): Promise<{ ok: true; state: InviteState; invite: InviteRow | null; ownerUserId: string | null } | { ok: false; status: number; error: string }> {
  const now = Date.now()
  if (!tokenShapeOk(token)) return { ok: true, state: inviteStateOf({ token, invite: null, store: null, teamSize: 0, user, hasAccount: false, now }), invite: null, ownerUserId: null }
  const { data, error } = await readRows<Record<string, unknown> | null>((cols) => db.from("store_team_members").select(cols).eq("token_hash", hashToken(token)).maybeSingle())
  if (error) return { ok: false, status: teamMissing(error) ? 503 : 500, error: teamMissing(error) ? TEAM_NOT_SET_UP : "Could not read the invite. Try again." }
  const invite = data ? memberOf(data) : null
  let store: (InviteStoreRow & { name: string }) | null = null
  let teamSize = 0
  let hasAccount = false
  let alreadyMember = false
  if (invite) {
    const [{ data: c }, { count }, account, member] = await Promise.all([
      db.from("creators").select("id, user_id, slug, display_name, avatar_url, subscription_plan_id").eq("id", invite.creator_id).maybeSingle(),
      db.from("store_team_members").select("id", { count: "exact", head: true }).eq("creator_id", invite.creator_id),
      !user && invite.status === "invited"
        ? db.from("profiles").select("id").eq("email", invite.email).limit(1).then((r: { data: unknown[] | null }) => (r.data?.length ?? 0) > 0, () => false)
        : Promise.resolve(false),
      /* Signed in and already on this team through another invite: one membership per person per store. */
      user && invite.status === "invited"
        ? db.from("store_team_members").select("id").eq("creator_id", invite.creator_id).eq("user_id", user.id).neq("id", invite.id).limit(1).then((r: { data: unknown[] | null }) => (r.data?.length ?? 0) > 0, () => false)
        : Promise.resolve(false),
    ])
    const row = c as InviteStoreRow | null
    store = row ? { ...row, name: await storeNameOf(db, row, "A Storelib store") } : null
    teamSize = typeof count === "number" ? count : 0
    hasAccount = account as boolean
    alreadyMember = member as boolean
  }
  const state = inviteStateOf({
    token,
    invite,
    store: store ? { id: store.id, name: store.name, avatarUrl: store.avatar_url, ownerUserId: store.user_id, pro: isProPlan(store.subscription_plan_id) } : null,
    teamSize,
    user,
    hasAccount,
    alreadyMember,
    now,
  })
  return { ok: true, state, invite, ownerUserId: store?.user_id ?? null }
}

/**
 * Accept an invite, signed in. Usually the account's email is the invited
 * one. When it is not (Google with another address, Apple's Hide My Email,
 * a second account) the link still works for the account that is signed in:
 * only the invited inbox received it, the page shows which email it was sent
 * to before the press, and the owner is told which account took it. Once:
 * the row turns active only while it is still an invite, so two presses (or
 * two tabs) are one membership and a used link lets nobody else in. The
 * link's hash stays on the row so opening it again says "already used"
 * rather than "never sent".
 */
export async function acceptInvite(db: Db, token: unknown, user: { id: string; email: string | null }): Promise<Result<{ creatorId: string; role: MemberRole; permissions: TeamPermission[]; storeName: string; home: string }>> {
  const read = await readInvite(db, token, user)
  if (read.ok === false) return read
  const state = read.state
  const refused = refusalOf(state)
  if (refused || !acceptable(state) || !read.invite) return { ok: false, ...(refused ?? { status: 400, error: "Could not accept the invite." }) }
  const { data, error: upErr } = await db
    .from("store_team_members")
    .update({ status: "active", user_id: user.id, accepted_at: new Date().toISOString() })
    .eq("id", read.invite.id)
    .eq("token_hash", hashToken(token as string))
    .eq("status", "invited")
    .select("id")
  /* 23505: this account is already on the team (one membership per person per store), from a race with another invite. */
  if (upErr) return (upErr as { code?: string }).code === "23505" ? { ok: false, status: 409, error: "You're already on this team." } : { ok: false, status: 500, error: "Could not accept the invite. Try again." }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, status: 409, error: "This invite has already been used." }
  /* The owner hears about it in their notifications (best effort: the accept never waits on it failing). */
  if (read.ownerUserId) {
    await notifyOwner(db, {
      creatorId: state.store.id,
      ownerUserId: read.ownerUserId,
      title: `${state.email} joined your team`,
      message: `They're on ${state.store.name} with ${accessSummaryEn(state.permissions).toLowerCase()}.${user.email && !sameEmail(user.email, state.email) ? ` They signed in as ${user.email}.` : ""}`,
    })
  }
  return { ok: true, creatorId: state.store.id, role: state.role, permissions: state.permissions, storeName: state.store.name, home: homeFor(state.permissions) }
}

/**
 * Say no to an invite. The link is the proof: whoever holds it can turn it
 * down, the same as ignoring the email would, and the owner is told. Only an
 * invite still open is removed; a membership is left by Leave.
 */
export async function declineInvite(db: Db, token: unknown): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!tokenShapeOk(token)) return { ok: false, status: 400, error: "This invite link is not complete. Open it from the email again." }
  const { data, error } = await db.from("store_team_members").delete().eq("token_hash", hashToken(token)).eq("status", "invited").select("creator_id, email")
  if (error) return { ok: false, status: teamMissing(error) ? 503 : 500, error: "Could not turn the invite down. Try again." }
  const row = (Array.isArray(data) ? data[0] : null) as { creator_id: string; email: string } | null
  if (!row) return { ok: true }
  const { data: c } = await db.from("creators").select("user_id").eq("id", row.creator_id).maybeSingle()
  const owner = (c as { user_id?: string | null } | null)?.user_id
  if (owner) await notifyOwner(db, { creatorId: row.creator_id, ownerUserId: owner, title: `${row.email} turned down your invite`, message: "You can invite someone else from Settings, Team." })
  return { ok: true }
}

/* ── Telling people ──────────────────────────────────────────────────────── */

const oneLine = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max)

/** A line in the owner's bell (seller_notifications), the shape a contact form message uses. Never throws. */
export async function notifyOwner(db: Db, n: { creatorId: string; ownerUserId: string; title: string; message: string }): Promise<void> {
  try {
    const { error } = await db.from("seller_notifications").insert({
      creator_id: n.creatorId,
      user_id: n.ownerUserId,
      type: "update",
      title: oneLine(n.title, 200),
      message: oneLine(n.message, 140),
      action_url: "/app/settings?tab=team",
      metadata: { area: "Team" },
    })
    if (error) console.warn(`[team] owner notification not written (${typeof error.code === "string" ? error.code : "error"})`)
  } catch {
    console.warn("[team] owner notification threw")
  }
}

/** A line in a member's own notifications (user_notifications, part 85). Never throws. */
export async function notifyMember(db: Db, n: { userId: string; title: string; body: string; url: string; dedupeKey: string }): Promise<void> {
  try {
    const { notifyUser } = await import("@/lib/notifications/user-inbox")
    await notifyUser(db as never, { userId: n.userId, kind: "system", source: "system", title: n.title, body: n.body, url: n.url, dedupeKey: n.dedupeKey })
  } catch {
    console.warn("[team] member notification threw")
  }
}

/**
 * Change what a member may do, or remove them (or take back an invite). The
 * owner, or a member with Team for what is within their own access. Takes
 * effect on the member's next request: every page and route reads the
 * permissions again (actingStore). The member is told in their own
 * notifications.
 */
export async function updateMember(
  db: Db,
  byUserId: string,
  memberId: string,
  change: { permissions?: unknown; role?: unknown } | { remove: true },
  /** The store the request works in, when the caller already knows it (teamScope). */
  acting?: ActingStore | null,
): Promise<{ ok: true; member?: TeamMemberRow } | { ok: false; status: number; error: string }> {
  const scoped = await teamScope(db, byUserId, acting)
  if (scoped.ok === false) return { ok: false, status: scoped.status, error: scoped.error }
  const { store, grant, selfMemberId, byOwner } = scoped.scope
  if (selfMemberId && selfMemberId === memberId) return { ok: false, status: 403, error: "Ask the store's owner to change your own access, or leave the store from Settings, Team." }
  const { data: found, error: readErr } = await readRows<Record<string, unknown> | null>((cols) => db.from("store_team_members").select(cols).eq("id", memberId).eq("creator_id", store.id).maybeSingle())
  if (readErr) return { ok: false, status: 500, error: "Could not read the team. Try again." }
  if (!found) return { ok: false, status: 404, error: "They are not on your team any more." }
  const target = memberOf(found)
  /* A member with Team edits only people whose access is within their own: never someone who has more than they do. */
  if (!byOwner && !withinGrant(target.permissions, grant)) return { ok: false, status: 403, error: "Only the owner can change someone with access you don't have." }
  const storeName = await storeNameOf(db, store, "a store")
  const stamp = Date.now().toString(36)
  if ("remove" in change) {
    const { data, error } = await db.from("store_team_members").delete().eq("id", memberId).eq("creator_id", store.id).select("user_id, status")
    if (error) return { ok: false, status: 500, error: "Could not remove them. Try again." }
    const gone = (Array.isArray(data) ? data[0] : null) as { user_id: string | null; status: string } | null
    if (gone?.user_id && gone.status === "active") {
      await notifyMember(db, { userId: gone.user_id, title: `You're no longer on ${storeName}'s team`, body: "The owner removed you. Your own account is untouched.", url: "/app", dedupeKey: `team:removed:${memberId}:${stamp}` })
    }
    return { ok: true }
  }
  const permissions = askedPermissions(change)
  if (permissions.length === 0) return { ok: false, status: 400, error: "Choose at least one thing they can do, or remove them from the team." }
  if (!withinGrant(permissions, grant)) return { ok: false, status: 403, error: "You can only give access you have yourself." }
  let { data, error } = await db
    .from("store_team_members")
    .update({ permissions, role: legacyRoleFor(permissions) })
    .eq("id", memberId)
    .eq("creator_id", store.id)
    .select(MEMBER_COLUMNS)
    .maybeSingle()
  if (permissionsMissing(error)) {
    const legacy = legacyPermissions("manager")
    if (permissions.join() !== legacy.join()) return { ok: false, status: 503, error: PERMISSIONS_NOT_SET_UP }
    ;({ data, error } = await db.from("store_team_members").update({ role: "manager" }).eq("id", memberId).eq("creator_id", store.id).select(BASE_COLUMNS).maybeSingle())
  }
  if (error) return { ok: false, status: 500, error: "Could not change their access. Try again." }
  if (!data) return { ok: false, status: 404, error: "They are not on your team any more." }
  const member = memberOf(data as Record<string, unknown>)
  if (member.user_id && member.status === "active") {
    await notifyMember(db, { userId: member.user_id, title: `Your access to ${storeName} changed`, body: "It applies right away.", url: "/app", dedupeKey: `team:access:${memberId}:${permissions.join("+")}:${stamp}` })
  }
  return { ok: true, member }
}

/** Leave a store you are on. */
export async function leaveStore(db: Db, userId: string, creatorId: string): Promise<boolean> {
  const { error } = await db.from("store_team_members").delete().eq("creator_id", creatorId).eq("user_id", userId)
  return !error
}

export interface MemberStore {
  creatorId: string
  name: string
  avatarUrl: string | null
  role: MemberRole
  permissions: TeamPermission[]
}

/** The stores this account is on as a member, with their names. */
export async function storesOf(db: Db, userId: string): Promise<MemberStore[]> {
  const { data, error } = await readRows<Record<string, unknown>[] | null>((cols) => db.from("store_team_members").select(cols).eq("user_id", userId).eq("status", "active"))
  if (error || !data?.length) return []
  const rows = data.map(memberOf)
  const ids = rows.map((r) => r.creator_id)
  const [{ data: creators }, names] = await Promise.all([db.from("creators").select("id, slug, display_name, avatar_url").in("id", ids), storeNames(db, ids)])
  const byId = new Map(((creators ?? []) as { id: string; slug: string | null; display_name: string | null; avatar_url: string | null }[]).map((c) => [c.id, c]))
  return rows
    .filter((r) => byId.has(r.creator_id))
    .map((r) => {
      const c = byId.get(r.creator_id)!
      return { creatorId: r.creator_id, name: names.get(r.creator_id) || c.display_name || c.slug || "Store", avatarUrl: c.avatar_url, role: r.role, permissions: r.permissions }
    })
}

export interface ActingStore {
  creatorId: string
  name: string
  /** The owner's account, for what is keyed by the account and not the store (a OnePage). */
  ownerUserId: string | null
  role: MemberRole
  permissions: TeamPermission[]
  memberId: string
}

/** The store this account is working in as a member right now, read again from the database. null: their own account. */
export async function actingStore(db: Db, userId: string): Promise<ActingStore | null> {
  let chosen: string | undefined
  try {
    chosen = (await cookies()).get(TEAM_STORE_COOKIE)?.value
  } catch {
    return null
  }
  return actingStoreIn(db, userId, chosen)
}

/** The database half of actingStore: the store the cookie names, if this account is an active member of it, with its permissions as the row holds them now. */
export async function actingStoreIn(db: Db, userId: string, chosen: string | null | undefined): Promise<ActingStore | null> {
  if (!chosen || !/^[0-9a-f-]{36}$/i.test(chosen)) return null
  const { data, error } = await readRows<Record<string, unknown> | null>((cols) => db.from("store_team_members").select(cols).eq("creator_id", chosen).eq("user_id", userId).eq("status", "active").maybeSingle())
  if (error || !data || !isMemberRole((data as { role: unknown }).role)) return null
  const row = memberOf(data)
  const { data: c } = await db.from("creators").select("slug, display_name, user_id").eq("id", chosen).maybeSingle()
  if (!c) return null
  const store = c as { slug: string | null; display_name: string | null; user_id?: string | null }
  return { creatorId: chosen, name: await storeNameOf(db, { id: chosen, slug: store.slug, display_name: store.display_name }, "Store"), ownerUserId: store.user_id ?? null, role: row.role, permissions: row.permissions, memberId: row.id }
}

/**
 * The dashboard's side of it, once per request: the store this account is
 * working in as a member, checked against the database (actingStore), and
 * that store's row in the shell's shape (lib/auth/request-scope). null for
 * everyone working in their own account, which costs them no query (no
 * cookie, no read).
 */
export const teamStoreForRequest = cache(async (userId: string): Promise<{ acting: ActingStore; store: RequestCreator } | null> => {
  const db = createAdminClient()
  const acting = await actingStore(db, userId).catch(() => null)
  if (!acting) return null
  const [{ data }, { data: privateCols }] = await Promise.all([
    db.from("creators").select(SHELL_CREATOR_COLUMNS).eq("id", acting.creatorId).maybeSingle(),
    db.from("creators").select(SHELL_PRIVATE_CREATOR_COLUMNS).eq("id", acting.creatorId).maybeSingle(),
  ])
  if (!data) return null
  const store = { stripe_onboarding_status: null, stripe_account_id: null, subscription_plan_id: null, ...(data as object), ...((privateCols as object | null) ?? {}) } as RequestCreator
  return { acting, store }
})

/** The stores this account is on as a member, once per request, for the account menu (app/app/layout.tsx). One indexed read; none listed is []. */
export const teamStoresForRequest = cache(async (userId: string): Promise<MemberStore[]> => storesOf(createAdminClient(), userId).catch(() => []))

/**
 * Round 41: for library code that checks "is this the seller" by account
 * (a review, a course): the store a member works in, when their permissions
 * cover the area, so that check can also accept that one store. null for
 * everyone in their own account (no cookie, no read) and for a member
 * without the area.
 */
export async function teamStoreIdFor(userId: string | null, area: TeamArea): Promise<string | null> {
  if (!userId) return null
  const acting = await actingStore(createAdminClient(), userId).catch(() => null)
  return acting && permits(acting.permissions, area) ? acting.creatorId : null
}

/**
 * THE ONE QUESTION A TEAM-AWARE PAGE ASKS: whose store, for this area.
 *
 *   working in another store, and their permissions cover the area: that store
 *   working in another store, and they do not: denied (never their own
 *     account in its place, which would look like the store's data)
 *   their own account: their own store, as the owner
 */
export async function creatorFor<T extends Record<string, unknown> = { id: string }>(
  db: Db,
  userId: string,
  area: TeamArea,
  columns = "id",
  /** The store the request works in, when the caller already read it (a suite hands it in as the cookie would name it). */
  given?: ActingStore | null,
): Promise<{ kind: "store"; creator: T; role: TeamRole; acting: ActingStore | null } | { kind: "denied"; acting: ActingStore } | { kind: "none" }> {
  const acting = given !== undefined ? given : await actingStore(db, userId)
  if (acting) {
    if (!permits(acting.permissions, area)) return { kind: "denied", acting }
    const { data } = await db.from("creators").select(columns).eq("id", acting.creatorId).maybeSingle()
    return data ? { kind: "store", creator: data as T, role: acting.role, acting } : { kind: "none" }
  }
  const { data } = await db.from("creators").select(columns).eq("user_id", userId).maybeSingle()
  return data ? { kind: "store", creator: data as T, role: "owner", acting: null } : { kind: "none" }
}

/**
 * A route's answer to "may the signed in person do this, and in which
 * store": the store's id, who is asking, whether they are its owner, and the
 * service role client every query is then filtered by that id with. Or the
 * response to send: 401 signed out, 403 when their permissions do not cover
 * the area (or they have no store), so a route reads
 *
 *   const gate = await requireTeamPermission("customers")
 *   if (gate instanceof NextResponse) return gate
 */
export interface TeamGate {
  creatorId: string
  userId: string
  userEmail: string | null
  isOwner: boolean
  /** The account the store belongs to, for what is kept by account and not by store (a OnePage, a saved report layout). */
  ownerUserId: string | null
  /**
   * Who an answer is for, when a page keeps answers in the browser: the
   * owner's user id as before, and for a member their id and the store's,
   * so an answer for their own store is never shown in the one they work in.
   */
  viewer: string
  acting: ActingStore | null
  /** Everything for the owner; the member's own list otherwise. */
  permissions: TeamPermission[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
}

/** The owner is their user id; a member working in a store is their id and the store's. */
export function viewerKey(userId: string, actingIn: string | null): string {
  return actingIn ? `${userId}:${actingIn}` : userId
}

export async function requireTeamPermission(area: TeamArea): Promise<TeamGate | NextResponse> {
  /*
    WHO IS ASKING, WITH A CEILING AND THREE ANSWERS (lib/auth/route-user). This read getUser() and only its
    `user`, so Supabase Auth timing out came back as 401 "Sign in again" and the screen said a signed in person's
    session had ended. Now: a user, a 401 only when Auth said nobody, and a 503 with Try again when it did not
    answer. Nothing is allowed on that last answer; it is refused with a true reason.
  */
  const { routeUser, authUnavailableResponse } = await import("@/lib/auth/route-user")
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user") return NextResponse.json({ error: "Sign in again to do this." }, { status: 401, headers: { "Cache-Control": "no-store" } })
  const user = who.user
  const db = createAdminClient()
  const found = await creatorFor(db, user.id, area)
  if (found.kind === "denied") return NextResponse.json({ error: NO_ACCESS }, { status: 403, headers: { "Cache-Control": "no-store" } })
  if (found.kind === "none") return NextResponse.json({ error: "Set up your store first." }, { status: 403, headers: { "Cache-Control": "no-store" } })
  return {
    creatorId: found.creator.id,
    userId: user.id,
    userEmail: user.email ?? null,
    isOwner: found.role === "owner",
    ownerUserId: found.acting ? found.acting.ownerUserId : user.id,
    viewer: viewerKey(user.id, found.acting ? found.creator.id : null),
    acting: found.acting,
    permissions: found.acting ? found.acting.permissions : [...TEAM_PERMISSIONS],
    /* Round 41: a member's client names them on the record lines it writes (lib/team/audit); the owner's is the plain client. */
    db: found.acting ? teamStampDb(db, user.id) : db,
  }
}

/**
 * WITHOUT THE COOKIE: whether this account may use this area of this very
 * store, read from the database alone. For a signed link opened where the
 * dashboard's cookies are not (the phone app's system browser sheet): the
 * link names the store and the account, and the membership and its
 * permissions are read again when it is opened.
 */
export async function storeAccessOf(
  db: Db,
  userId: string,
  creatorId: string,
  area: TeamArea,
): Promise<{ ok: true; isOwner: boolean; ownerUserId: string | null } | { ok: false }> {
  if (!/^[0-9a-f-]{36}$/i.test(creatorId)) return { ok: false }
  const { data: c } = await db.from("creators").select("id, user_id").eq("id", creatorId).maybeSingle()
  const store = c as { id: string; user_id: string | null } | null
  if (!store) return { ok: false }
  if (store.user_id === userId) return { ok: true, isOwner: true, ownerUserId: userId }
  const { data, error } = await readRows<Record<string, unknown> | null>((cols) => db.from("store_team_members").select(cols).eq("creator_id", creatorId).eq("user_id", userId).eq("status", "active").maybeSingle())
  if (error || !data) return { ok: false }
  return permits(memberOf(data).permissions, area) ? { ok: true, isOwner: false, ownerUserId: store.user_id } : { ok: false }
}

/**
 * For a route: the signed in person's store for this area, or why not, as
 * an answer to send. The session decides who; creatorFor decides whose store.
 */
export async function storeIdFor(area: TeamArea): Promise<{ ok: true; creatorId: string; userId: string; role: TeamRole } | { ok: false; status: number; error: string }> {
  const gate = await requireTeamPermission(area)
  if (gate instanceof NextResponse) {
    const body = (await gate.clone().json().catch(() => ({}))) as { error?: string }
    return { ok: false, status: gate.status, error: body.error ?? NO_ACCESS }
  }
  return { ok: true, creatorId: gate.creatorId, userId: gate.userId, role: gate.isOwner ? "owner" : (gate.acting?.role ?? "manager") }
}

/**
 * A page's answer to the same question (round 40). The page draws the
 * store's data for "store", the "You don't have access" card for "denied"
 * (components/app/team-area-closed), and its own no-store path for "none".
 * Read once per request per area.
 */
export type TeamPageStore =
  | { kind: "store"; creatorId: string; userId: string; isOwner: boolean; ownerUserId: string | null; viewer: string; acting: ActingStore | null }
  | { kind: "denied"; userId: string; acting: ActingStore }
  | { kind: "none"; userId: string }
  | { kind: "signed_out" }

export const teamPageStore = cache(async (area: TeamArea): Promise<TeamPageStore> => {
  const { pageUser } = await import("@/lib/auth/page-user")
  const user = await pageUser()
  if (!user) return { kind: "signed_out" }
  /* The answers the /app layout already asked for, once per request: an owner pays no read of their own here. */
  const team = await teamStoreForRequest(user.id).catch(() => null)
  if (team) {
    const acting = team.acting
    if (!permits(acting.permissions, area)) return { kind: "denied", userId: user.id, acting }
    return { kind: "store", creatorId: acting.creatorId, userId: user.id, isOwner: false, ownerUserId: acting.ownerUserId, viewer: viewerKey(user.id, acting.creatorId), acting }
  }
  const own = await creatorForRequest(user.id)
  if (!own) return { kind: "none", userId: user.id }
  return { kind: "store", creatorId: own.id, userId: user.id, isOwner: true, ownerUserId: user.id, viewer: user.id, acting: null }
})

/**
 * The stores this account is on as an active member, each with when it was
 * joined, for picking one to open (lib/team/landing pickTeamStore). Only
 * stores that still exist. [] when the team is not set up or the read fails.
 */
export async function memberRowsOf(db: Db, userId: string): Promise<{ creatorId: string; acceptedAt: string | null }[]> {
  const { data, error } = await db.from("store_team_members").select("creator_id, accepted_at").eq("user_id", userId).eq("status", "active")
  if (error || !data?.length) return []
  const rows = data as { creator_id: string; accepted_at: string | null }[]
  const { data: creators } = await db.from("creators").select("id").in("id", rows.map((r) => r.creator_id))
  const live = new Set(((creators ?? []) as { id: string }[]).map((c) => c.id))
  return rows.filter((r) => live.has(r.creator_id)).map((r) => ({ creatorId: r.creator_id, acceptedAt: r.accepted_at }))
}

/** On at least one store's team, for where a sign in ends (lib/auth/continue destinationAfterAuth). false on any error. */
export async function onATeam(db: Db, userId: string): Promise<boolean> {
  try {
    return (await memberRowsOf(db, userId)).length > 0
  } catch {
    return false
  }
}

/**
 * A dashboard page found no store of the signed in account's own. Before,
 * every such page sent them to /sell, a team member too. Now (lib/team/
 * landing):
 *
 *   working in a team store   null: the page draws nothing of its own, and
 *                             the team bar over it says whether they have
 *                             this part (components/app/team-bar)
 *   on a team, no cookie      back into that store, then this page
 *   neither                   /sell, as before
 */
export async function noStorePage(path: string): Promise<null> {
  /* Asked for here, not at the top: the rest of this file is read by suites outside Next, where navigation's client half cannot load. */
  const redirect: (url: string) => never = (await import("next/navigation")).redirect
  /*
    THE REQUEST'S ONE ANSWER, NOT A SECOND getUser (lib/auth/request-scope). This asked Supabase Auth again after
    the layout and the page had, and read only `user`: Auth slow for a moment sent a seller with a store to /sell.
    Could not tell: nothing here, and the /app layout's gate recovers the session in the browser (lib/auth/page-user).
  */
  const current = await currentUserForRequest()
  if (!current.user) {
    if (shouldSendToLogin(current)) redirect("/sell")
    return null
  }
  const user = current.user
  const db = createAdminClient()
  const acting = await actingStore(db, user.id).catch(() => null)
  if (acting) return null
  const rows = await memberRowsOf(db, user.id).catch(() => [])
  if (rows.length > 0) redirect(teamHomeHref(path))
  redirect("/sell")
}
