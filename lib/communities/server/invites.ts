import "server-only"

/**
 * ===========================================================================
 *  INVITES: A LINK OR AN EMAIL THAT LETS SOMEBODY IN
 * ===========================================================================
 * An invite is a random 32 byte token, shown to the creator once as a link
 * (/community/<slug>/join?invite=<token>). Only its sha256 is stored, so a
 * leaked database row cannot be turned back into a working link. A link
 * invite may have a number of uses and an end date; an email invite is for
 * that one address and is used once. Revoking one stops it at once.
 * Redeeming is public.community_redeem_invite, called by the join page
 * (W3's /api/community/[id]/invite/redeem), which checks all of that
 * atomically and grants the membership.
 *
 * An email invite is also sent through the notification engine
 * (sendCommunityEmail, community.invite): the link, from Storelib, naming the
 * creator and the community. Sending is best effort;
 * the link works whether or not the message arrives, and the screen shows
 * the link either way.
 */
import { createHash, randomBytes } from "node:crypto"
import { sendCommunityEmail } from "./email"
import { siteUrl } from "@/lib/memberships/server"
import { joinCosts, needsInvite } from "../access-model"
import type { CommunityRow } from "../types"
import { decodeCursor, encodeCursor, isUuid, keysetOr, type InviteInput } from "@/components/community/creator/logic"
import type { InviteView } from "@/components/community/creator/view-types"
import { audit } from "./audit"
import { missing, reasonOf, type Db } from "./db"

export const INVITES_PAGE = 30

/** A fresh token and the hash stored for it. */
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function inviteUrl(slug: string, token: string): string {
  return siteUrl(`/community/${slug}/join?invite=${encodeURIComponent(token)}`)
}

/* ── Whether an invite would be accepted, without spending it ───────────── */

/** Why an invite cannot be used, or "ok": the same reasons community_redeem_invite answers with. */
export type InviteStanding = "ok" | "revoked" | "expired" | "used_up" | "email_mismatch"

export interface InviteStandingRow {
  email?: string | null
  max_uses?: number | null
  uses?: number | null
  expires_at?: string | null
  revoked_at?: string | null
}

/**
 * WOULD THIS INVITE BE ACCEPTED NOW, counting nothing. The checks are the
 * database function's, in the same order, so an invite that passes here is
 * an invite that passes there. `reserved` is how many people are holding
 * this invite and have not paid yet, counted against its uses so a link
 * that lets one person in cannot be held by two.
 *
 * Pure: the caller reads the row and the person's address.
 */
export function inviteStanding(invite: InviteStandingRow, a: { email: string | null; reserved?: number; now?: number }): InviteStanding {
  const now = a.now ?? Date.now()
  if (invite.revoked_at) return "revoked"
  if (invite.expires_at) {
    const at = Date.parse(invite.expires_at)
    if (Number.isFinite(at) && at <= now) return "expired"
  }
  if (invite.email) {
    const mine = (a.email ?? "").trim().toLowerCase()
    if (!mine || mine !== invite.email.trim().toLowerCase()) return "email_mismatch"
  }
  const max = invite.max_uses
  if (typeof max === "number" && Number.isFinite(max)) {
    const held = Math.max(0, invite.uses ?? 0) + Math.max(0, a.reserved ?? 0)
    if (held >= max) return "used_up"
  }
  return "ok"
}

/**
 * How many other people hold this invite and have not finished paying:
 * their row is a request (pending) made by this invite. Their own hold is
 * not counted against them, so pressing the link twice is one person.
 */
export async function reservedInviteUses(db: Db, inviteId: string, userId: string): Promise<number> {
  const { data, error } = await db.from("community_members").select("user_id, status").eq("invite_id", inviteId).eq("status", "pending").limit(200)
  if (error) {
    if (!missing(error)) console.error(`[communities] invite holds read: ${reasonOf(error)}`)
    return 0
  }
  return ((data as { user_id: string }[] | null) ?? []).filter((r) => r.user_id !== userId).length
}

/** The address an account signs in with, for an invite sent to one address. */
export async function accountEmail(db: Db, userId: string): Promise<string | null> {
  try {
    const auth = (db as { auth?: { admin?: { getUserById?: (id: string) => Promise<{ data?: { user?: { email?: unknown } | null } }> } } }).auth
    const got = auth?.admin?.getUserById ? await auth.admin.getUserById(userId) : null
    const email = got?.data?.user?.email
    if (typeof email === "string" && email.includes("@")) return email.toLowerCase()
  } catch {
    /* profiles.email below */
  }
  const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle()
  const email = (data as { email?: unknown } | null)?.email
  return typeof email === "string" && email.includes("@") ? email.toLowerCase() : null
}

interface InviteRowLite {
  id: string
  email: string | null
  tier_id: string | null
  max_uses: number | null
  uses: number
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

const COLUMNS = "id, email, tier_id, max_uses, uses, expires_at, revoked_at, created_at"

async function tierNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await db.from("community_tiers").select("id, name").in("id", ids)
  return new Map(((data as { id: string; name: string }[] | null) ?? []).map((t) => [t.id, t.name]))
}

function view(r: InviteRowLite, tiers: Map<string, string>): InviteView {
  return {
    id: r.id,
    email: r.email,
    maxUses: r.max_uses,
    uses: r.uses,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
    tierName: r.tier_id ? (tiers.get(r.tier_id) ?? null) : null,
  }
}

/** Invites newest first, a page at a time (keyset on created_at, id). */
export async function listInvites(db: Db, communityId: string, cursor: string | null): Promise<{ rows: InviteView[]; next: string | null }> {
  let q = db.from("community_invites").select(COLUMNS).eq("community_id", communityId)
  const c = decodeCursor(cursor)
  if (c && typeof c.sort === "string") q = q.or(keysetOr("created_at", c.sort, c.id))
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(INVITES_PAGE + 1)
  if (error) {
    if (!missing(error)) console.error(`[communities] invites read: ${reasonOf(error)}`)
    return { rows: [], next: null }
  }
  const rows = (data as InviteRowLite[] | null) ?? []
  const page = rows.slice(0, INVITES_PAGE)
  const tiers = await tierNames(db, [...new Set(page.map((r) => r.tier_id).filter((x): x is string => Boolean(x)))])
  const last = page[page.length - 1]
  return { rows: page.map((r) => view(r, tiers)), next: rows.length > INVITES_PAGE && last ? encodeCursor(last.created_at, last.id) : null }
}

/** Whether anyone has ever been invited, for the Overview's first step. */
export async function inviteCount(db: Db, communityId: string): Promise<number> {
  const { count } = await db.from("community_invites").select("id", { count: "exact", head: true }).eq("community_id", communityId)
  return count ?? 0
}

export interface MadeInvite {
  invite: InviteView
  sent: boolean | null
}

/**
 * Makes an invite. The tier, when given, must be one of this community's,
 * and naming one is a gift of it: the person gets that tier without paying.
 *
 * WHETHER THE INVITE IS COMPLIMENTARY. In a private community that charges,
 * the link is the way in and not the gift: whoever follows it lands on the
 * join screen with the price and pays, and the use is counted when the
 * payment lands (../access-model.ts, ./invite-spend.ts). Everywhere else an
 * invite is the gift it has always been, so a public paid community's staff
 * invite still lets somebody in without paying. The caller may say outright
 * with `complimentary`.
 *
 * Answers the invite with its link, which is the only time the link can be
 * shown.
 */
export async function createInvite(
  db: Db,
  a: { community: CommunityRow; createdBy: string; inviterName: string; input: InviteInput },
): Promise<{ ok: true; made: MadeInvite } | { ok: false; error: string; status: number }> {
  let tierId: string | null = null
  if (a.input.tierId) {
    const { data: tier } = await db.from("community_tiers").select("id, archived_at").eq("id", a.input.tierId).eq("community_id", a.community.id).maybeSingle()
    if (!tier || tier.archived_at) return { ok: false, error: "That tier is not in this community.", status: 404 }
    tierId = tier.id
  }
  if (a.input.email) {
    /* One open invite per address: the same person invited twice gets the newer link, the older one stops working. */
    const { data: open } = await db.from("community_invites").select("id").eq("community_id", a.community.id).eq("email", a.input.email).is("revoked_at", null).limit(5)
    for (const o of (open as { id: string }[] | null) ?? []) await db.from("community_invites").update({ revoked_at: new Date().toISOString() }).eq("id", o.id)
  }
  const paidPrivate = needsInvite(a.community) && joinCosts(a.community)
  const complimentary = typeof a.input.complimentary === "boolean" ? a.input.complimentary : Boolean(tierId) || !paidPrivate
  const { token, hash } = newInviteToken()
  const expiresAt = a.input.expiresInDays ? new Date(Date.now() + a.input.expiresInDays * 86_400_000).toISOString() : null
  const { data, error } = await db
    .from("community_invites")
    .insert({
      community_id: a.community.id,
      token_hash: hash,
      email: a.input.email,
      tier_id: tierId,
      max_uses: a.input.maxUses,
      expires_at: expiresAt,
      created_by: a.createdBy,
      complimentary,
    })
    .select(COLUMNS)
    .single()
  if (error || !data) {
    if (missing(error)) return { ok: false, error: "Communities are not set up on Storelib yet.", status: 503 }
    console.error(`[communities] invite: ${reasonOf(error)}`)
    return { ok: false, error: "The invite could not be made. Try again.", status: 500 }
  }
  const url = inviteUrl(a.community.slug, token)
  let sent: boolean | null = null
  if (a.input.email) {
    /*
      Through the notification engine (lib/communities/server/email.ts), once per invite and address. The email's
      button is the same link as `url`: /community/<slug>/join?invite=<token>. Queued is as good as sent; the engine
      sends it in seconds and retries it if Mailgun asks.
    */
    const outcome = await sendCommunityEmail(db, "community.invite", {
      email: a.input.email,
      communityId: a.community.id,
      data: { inviterName: a.inviterName, inviteCode: token, tagline: a.community.tagline ?? "", expiresAt: expiresAt ?? "" },
      key: `invite:${data.id}:${a.input.email.toLowerCase()}`,
    })
    sent = outcome !== "unavailable"
  }
  await audit(db, {
    communityId: a.community.id,
    actorId: a.createdBy,
    actorKind: "member",
    action: a.input.email ? "invite.emailed" : "invite.link_created",
    targetType: "invite",
    targetId: data.id,
    targetLabel: a.input.email ?? "Invite link",
    detail: { tierId, maxUses: a.input.maxUses, expiresAt, sent, complimentary },
  })
  const tiers = tierId ? await tierNames(db, [tierId]) : new Map()
  return { ok: true, made: { invite: { ...view(data as InviteRowLite, tiers), url }, sent } }
}

export async function revokeInvite(db: Db, a: { communityId: string; inviteId: string; actorId: string }): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!isUuid(a.inviteId)) return { ok: false, error: "Not found", status: 404 }
  const { data: row } = await db.from("community_invites").select("id, email, revoked_at").eq("id", a.inviteId).eq("community_id", a.communityId).maybeSingle()
  if (!row) return { ok: false, error: "That invite is not in this community.", status: 404 }
  if (!row.revoked_at) {
    const { error } = await db.from("community_invites").update({ revoked_at: new Date().toISOString() }).eq("id", row.id)
    if (error) return { ok: false, error: "The invite could not be revoked. Try again.", status: 500 }
    await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "invite.revoked", targetType: "invite", targetId: row.id, targetLabel: row.email ?? "Invite link" })
  }
  return { ok: true }
}
