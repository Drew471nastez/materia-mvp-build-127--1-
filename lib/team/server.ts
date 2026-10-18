import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { cache } from "react"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { SHELL_CREATOR_COLUMNS, SHELL_PRIVATE_CREATOR_COLUMNS, type RequestCreator } from "@/lib/auth/request-scope"
import { sendEmail } from "@/lib/mail"
import { emailImageSrc } from "@/lib/email-campaigns/sender"
import { teamInviteEmail } from "./invite-email"
import { baseUrl } from "@/lib/notify/urls"
import { isProPlan } from "@/lib/home/progress"
import { INVITE_TTL_MS, ROLE_LABEL, invitable, isMemberRole, memberCan, resendWait, roleHome, seatLimit, teamEmail, type MemberRole, type TeamArea, type TeamRole } from "./roles"
import { acceptable, inviteStateOf, refusalOf, sameEmail, tokenShapeOk, type InviteRow, type InviteState } from "./invite-state"

/**
 * ===========================================================================
 *  A STORE'S TEAM, ON THE SERVER
 * ===========================================================================
 * The team lives in public.store_team_members (SQL part 135), which only
 * the service role can read: a member's browser can never list a team,
 * change a role or join a store by itself. Everything goes through here.
 *
 * A member signs in with their OWN Storelib account. They are never given
 * the owner's session (that is how businesses switch, lib/businesses, and
 * it would hand a member everything the owner can do, payouts included).
 * Instead they choose which store they are working in (a cookie that only
 * names a store), and every page and route a member can reach asks
 * actingStore() / creatorFor(): it re-reads the membership and the role
 * from the database on each request, so a removed member, a lowered role or
 * a cookie pointed at another store gets nothing.
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

export interface TeamMemberRow {
  id: string
  creator_id: string
  email: string
  user_id: string | null
  role: MemberRole
  status: "invited" | "active"
  invited_at: string
  expires_at: string | null
  accepted_at: string | null
}

const MEMBER_COLUMNS = "id, creator_id, email, user_id, role, status, invited_at, expires_at, accepted_at"

/** The table is not there yet (part 135 not run): said, never thrown. */
export function teamMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return ["42P01", "PGRST205", "PGRST204", "42703"].includes(error.code ?? "") || /store_team_members/.test(error.message ?? "")
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** The store this account owns, if it owns one. */
export async function ownStore(db: Db, userId: string): Promise<{ id: string; slug: string | null; display_name: string | null; subscription_plan_id: string | null } | null> {
  const { data } = await db.from("creators").select("id, slug, display_name, subscription_plan_id").eq("user_id", userId).maybeSingle()
  return (data as { id: string; slug: string | null; display_name: string | null; subscription_plan_id: string | null } | null) ?? null
}

export async function listTeam(db: Db, creatorId: string): Promise<{ ok: true; members: TeamMemberRow[] } | { ok: false; error: string; missing?: boolean }> {
  const { data, error } = await db.from("store_team_members").select(MEMBER_COLUMNS).eq("creator_id", creatorId).order("invited_at", { ascending: true })
  if (error) return teamMissing(error) ? { ok: false, error: TEAM_NOT_SET_UP, missing: true } : { ok: false, error: "Could not read the team. Try again." }
  return { ok: true, members: (data ?? []) as TeamMemberRow[] }
}

type Result<T> = ({ ok: true } & T) | { ok: false; status: number; error: string }

/**
 * Invite someone by email. Sending again to the same email is a new link
 * (the old one stops working); someone already on the team is said so.
 */
export async function inviteMember(
  db: Db,
  opts: { owner: { id: string; email: string | null }; email: unknown; role: unknown },
): Promise<Result<{ member: TeamMemberRow; emailed: boolean }>> {
  const email = teamEmail(opts.email)
  if (!email) return { ok: false, status: 400, error: "Enter an email address." }
  if (!isMemberRole(opts.role)) return { ok: false, status: 400, error: "Choose Manager or Staff." }
  if (!invitable(opts.role)) return { ok: false, status: 400, error: "Staff is not open to the team yet. Invite them as a Manager, or wait for Staff." }
  if (opts.owner.email && email === opts.owner.email.toLowerCase()) return { ok: false, status: 400, error: "That is your own email. You are already the owner." }
  const store = await ownStore(db, opts.owner.id)
  if (!store) return { ok: false, status: 403, error: "Only a store's owner can invite people to it." }

  const listed = await listTeam(db, store.id)
  if (listed.ok === false) return { ok: false, status: listed.missing ? 503 : 500, error: listed.error }
  const existing = listed.members.find((m) => m.email === email)
  if (existing?.status === "active") return { ok: false, status: 409, error: `${email} is already on your team.` }
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
    role: opts.role,
    status: "invited" as const,
    token_hash: hashToken(token),
    invited_by: opts.owner.id,
    invited_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    user_id: null,
    accepted_at: null,
  }
  const write = existing
    ? db.from("store_team_members").update(row).eq("id", existing.id).eq("creator_id", store.id).select(MEMBER_COLUMNS).single()
    : db.from("store_team_members").insert(row).select(MEMBER_COLUMNS).single()
  const { data, error } = await write
  if (error || !data) return { ok: false, status: teamMissing(error) ? 503 : 500, error: teamMissing(error) ? TEAM_NOT_SET_UP : "Could not send the invite. Try again." }

  const storeName = store.display_name || store.slug || "a store"
  const link = joinLink(token)
  const mail = teamInviteEmail({ storeName, role: opts.role, email, link, ...(await inviteContext(db, store.id, opts.owner.id)) })
  const sent = await sendEmail({ to: email, subject: mail.subject, transactional: true, keepBounce: true, text: mail.text, html: mail.html }).catch(() => ({ success: false }))
  return { ok: true, member: data as TeamMemberRow, emailed: !!sent.success }
}

/** The store's picture and the owner's name for the invite email. Either may be missing; the email reads without them. */
async function inviteContext(db: Db, creatorId: string, ownerId: string): Promise<{ storeImageUrl: string | null; inviterName: string | null }> {
  const [creator, profile] = await Promise.all([
    db.from("creators").select("avatar_url").eq("id", creatorId).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
    db.from("profiles").select("display_name").eq("id", ownerId).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
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
  const { data, error } = await db.from("store_team_members").select(MEMBER_COLUMNS).eq("token_hash", hashToken(token)).maybeSingle()
  if (error) return { ok: false, status: teamMissing(error) ? 503 : 500, error: teamMissing(error) ? TEAM_NOT_SET_UP : "Could not read the invite. Try again." }
  const invite = (data as TeamMemberRow | null) ?? null
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
    store = row ? { ...row, name: row.display_name || row.slug || "A Storelib store" } : null
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
export async function acceptInvite(db: Db, token: unknown, user: { id: string; email: string | null }): Promise<Result<{ creatorId: string; role: MemberRole; storeName: string; home: string }>> {
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
      message: `They're on ${state.store.name} as ${ROLE_LABEL[state.role]}.${user.email && !sameEmail(user.email, state.email) ? ` They signed in as ${user.email}.` : ""}`,
    })
  }
  return { ok: true, creatorId: state.store.id, role: state.role, storeName: state.store.name, home: roleHome(state.role) }
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
 * Change a member's role, or remove them (or take back an invite). The
 * owner's alone. Takes effect on the member's next request: every page and
 * route reads the role again (actingStore). The member is told in their own
 * notifications.
 */
export async function updateMember(
  db: Db,
  ownerId: string,
  memberId: string,
  change: { role: unknown } | { remove: true },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const store = await ownStore(db, ownerId)
  if (!store) return { ok: false, status: 403, error: "Only a store's owner can change its team." }
  const storeName = store.display_name || store.slug || "a store"
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
  if (!isMemberRole(change.role)) return { ok: false, status: 400, error: "Choose Manager or Staff." }
  if (!invitable(change.role)) return { ok: false, status: 400, error: "Staff is not open to the team yet." }
  const { data, error } = await db.from("store_team_members").update({ role: change.role }).eq("id", memberId).eq("creator_id", store.id).select("id, user_id, status").maybeSingle()
  if (error) return { ok: false, status: 500, error: "Could not change the role. Try again." }
  if (!data) return { ok: false, status: 404, error: "They are not on your team any more." }
  const row = data as { user_id: string | null; status: string }
  if (row.user_id && row.status === "active") {
    await notifyMember(db, { userId: row.user_id, title: `You're now ${ROLE_LABEL[change.role]} on ${storeName}`, body: "The owner changed your role. It applies right away.", url: "/app", dedupeKey: `team:role:${memberId}:${change.role}:${stamp}` })
  }
  return { ok: true }
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
}

/** The stores this account is on as a member, with their names. */
export async function storesOf(db: Db, userId: string): Promise<MemberStore[]> {
  const { data, error } = await db.from("store_team_members").select("creator_id, role").eq("user_id", userId).eq("status", "active")
  if (error || !data?.length) return []
  const rows = data as { creator_id: string; role: MemberRole }[]
  const { data: creators } = await db.from("creators").select("id, slug, display_name, avatar_url").in("id", rows.map((r) => r.creator_id))
  const byId = new Map(((creators ?? []) as { id: string; slug: string | null; display_name: string | null; avatar_url: string | null }[]).map((c) => [c.id, c]))
  return rows
    .filter((r) => byId.has(r.creator_id))
    .map((r) => {
      const c = byId.get(r.creator_id)!
      return { creatorId: r.creator_id, name: c.display_name || c.slug || "Store", avatarUrl: c.avatar_url, role: r.role }
    })
}

export interface ActingStore {
  creatorId: string
  name: string
  role: MemberRole
}

/** The store this account is working in as a member right now, read again from the database. null: their own account. */
export async function actingStore(db: Db, userId: string): Promise<ActingStore | null> {
  let chosen: string | undefined
  try {
    chosen = (await cookies()).get(TEAM_STORE_COOKIE)?.value
  } catch {
    return null
  }
  if (!chosen || !/^[0-9a-f-]{36}$/i.test(chosen)) return null
  const { data, error } = await db.from("store_team_members").select("role").eq("creator_id", chosen).eq("user_id", userId).eq("status", "active").maybeSingle()
  if (error || !data || !isMemberRole((data as { role: unknown }).role)) return null
  const { data: c } = await db.from("creators").select("slug, display_name").eq("id", chosen).maybeSingle()
  if (!c) return null
  const store = c as { slug: string | null; display_name: string | null }
  return { creatorId: chosen, name: store.display_name || store.slug || "Store", role: (data as { role: MemberRole }).role }
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
 * THE ONE QUESTION A TEAM-AWARE PAGE ASKS: whose store, for this area.
 *
 *   working in another store, and the role covers the area: that store
 *   working in another store, and it does not: denied (never their own
 *     account in its place, which would look like the store's data)
 *   their own account: their own store, as the owner
 */
export async function creatorFor<T extends Record<string, unknown> = { id: string }>(
  db: Db,
  userId: string,
  area: TeamArea,
  columns = "id",
): Promise<{ kind: "store"; creator: T; role: TeamRole; acting: ActingStore | null } | { kind: "denied"; acting: ActingStore } | { kind: "none" }> {
  const acting = await actingStore(db, userId)
  if (acting) {
    if (!memberCan(acting.role, area)) return { kind: "denied", acting }
    const { data } = await db.from("creators").select(columns).eq("id", acting.creatorId).maybeSingle()
    return data ? { kind: "store", creator: data as T, role: acting.role, acting } : { kind: "none" }
  }
  const { data } = await db.from("creators").select(columns).eq("user_id", userId).maybeSingle()
  return data ? { kind: "store", creator: data as T, role: "owner", acting: null } : { kind: "none" }
}

/**
 * For a route: the signed in person's store for this area, or why not, as
 * an answer to send. The session decides who; creatorFor decides whose store.
 */
export async function storeIdFor(area: TeamArea): Promise<{ ok: true; creatorId: string; userId: string; role: TeamRole } | { ok: false; status: number; error: string }> {
  const { createClient } = await import("@/lib/supabase/server")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return { ok: false, status: 401, error: "Sign in again to do this." }
  const found = await creatorFor(createAdminClient(), user.id, area)
  if (found.kind === "denied") return { ok: false, status: 403, error: "Your role on this store's team does not include this. Ask the store's owner." }
  if (found.kind === "none") return { ok: false, status: 403, error: "Set up your store first." }
  return { ok: true, creatorId: found.creator.id, userId: user.id, role: found.role }
}
