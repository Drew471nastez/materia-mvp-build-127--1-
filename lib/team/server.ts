import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { cache } from "react"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { SHELL_CREATOR_COLUMNS, SHELL_PRIVATE_CREATOR_COLUMNS, type RequestCreator } from "@/lib/auth/request-scope"
import { sendEmail } from "@/lib/mail"
import { baseUrl } from "@/lib/notify/urls"
import { isProPlan } from "@/lib/home/progress"
import { INVITE_TTL_MS, invitable, isMemberRole, memberCan, seatLimit, teamEmail, type MemberRole, type TeamArea, type TeamRole } from "./roles"

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
  const link = `${baseUrl()}/api/team/join?token=${encodeURIComponent(token)}`
  const roleWord = opts.role === "manager" ? "a Manager" : "Staff"
  const sent = await sendEmail({
    to: email,
    subject: `You're invited to ${storeName} on Storelib`,
    transactional: true,
    keepBounce: true,
    text: `You've been invited to join ${storeName} on Storelib as ${roleWord}.\n\nOpen this link and sign in with ${email} to accept:\n${link}\n\nThe link works for 7 days. If you weren't expecting this, you can ignore it.`,
    html: inviteHtml({ storeName, roleWord, email, link }),
  }).catch(() => ({ success: false }))
  return { ok: true, member: data as TeamMemberRow, emailed: !!sent.success }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

function inviteHtml(v: { storeName: string; roleWord: string; email: string; link: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f8f9fa;font-family:Inter,Arial,sans-serif;color:#1a1a2e"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px"><tr><td><p style="margin:0 0 8px;font-size:20px;font-weight:600">Join ${esc(v.storeName)}</p><p style="margin:0 0 24px;font-size:15px;line-height:22px;color:#6b7280">You've been invited to help run ${esc(v.storeName)} on Storelib as ${esc(v.roleWord)}. Sign in with ${esc(v.email)} to accept.</p><a href="${esc(v.link)}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:12px">Accept invite</a><p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#6b7280">The link works for 7 days. If you weren't expecting this, you can ignore it.</p></td></tr></table></td></tr></table></body></html>`
}

/**
 * Accept an invite, signed in. The account's email has to be the one the
 * invite was sent to: a forwarded link does not let someone else in.
 */
export async function acceptInvite(db: Db, token: unknown, user: { id: string; email: string | null }): Promise<Result<{ creatorId: string; role: MemberRole }>> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return { ok: false, status: 400, error: "This invite link is not complete. Open it from the email again." }
  const { data, error } = await db.from("store_team_members").select(`${MEMBER_COLUMNS}, token_hash`).eq("token_hash", hashToken(token)).maybeSingle()
  if (error) return { ok: false, status: teamMissing(error) ? 503 : 500, error: teamMissing(error) ? TEAM_NOT_SET_UP : "Could not read the invite. Try again." }
  const invite = data as (TeamMemberRow & { token_hash: string }) | null
  if (!invite) return { ok: false, status: 404, error: "This invite has been used, replaced or removed. Ask the store's owner to send a new one." }
  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) return { ok: false, status: 410, error: "This invite has expired. Ask the store's owner to send a new one." }
  if (!user.email || user.email.toLowerCase() !== invite.email) {
    return { ok: false, status: 403, error: `This invite was sent to ${invite.email}. Sign in with that email to accept it.` }
  }
  const store = await ownStore(db, user.id)
  if (store?.id === invite.creator_id) return { ok: false, status: 400, error: "This is your own store." }
  const { error: upErr } = await db
    .from("store_team_members")
    .update({ status: "active", user_id: user.id, accepted_at: new Date().toISOString(), token_hash: null })
    .eq("id", invite.id)
    .eq("token_hash", invite.token_hash)
  if (upErr) return { ok: false, status: 500, error: "Could not accept the invite. Try again." }
  return { ok: true, creatorId: invite.creator_id, role: invite.role }
}

/** Change a member's role, or remove them (or an invite). The owner's alone. */
export async function updateMember(
  db: Db,
  ownerId: string,
  memberId: string,
  change: { role: unknown } | { remove: true },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const store = await ownStore(db, ownerId)
  if (!store) return { ok: false, status: 403, error: "Only a store's owner can change its team." }
  if ("remove" in change) {
    const { error } = await db.from("store_team_members").delete().eq("id", memberId).eq("creator_id", store.id)
    return error ? { ok: false, status: 500, error: "Could not remove them. Try again." } : { ok: true }
  }
  if (!isMemberRole(change.role)) return { ok: false, status: 400, error: "Choose Manager or Staff." }
  if (!invitable(change.role)) return { ok: false, status: 400, error: "Staff is not open to the team yet." }
  const { data, error } = await db.from("store_team_members").update({ role: change.role }).eq("id", memberId).eq("creator_id", store.id).select("id").maybeSingle()
  if (error) return { ok: false, status: 500, error: "Could not change the role. Try again." }
  return data ? { ok: true } : { ok: false, status: 404, error: "They are not on your team any more." }
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
