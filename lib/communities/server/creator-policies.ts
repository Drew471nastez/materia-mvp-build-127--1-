import "server-only"

/**
 * ===========================================================================
 *  A CREATOR'S COMMUNITIES: THE PLAN'S LIMIT, DUPLICATES, RULES AND POLICIES
 * ===========================================================================
 * Round 13, beside ./creator.ts (which imports from here):
 *
 *   ROOM        whether the creator may make one more community on their
 *               plan (lib/communities/plan-limit.ts: Free makes two; round
 *               26: one whose deletion is scheduled takes no place).
 *   DUPLICATE   a new draft with one community's settings.
 *   POLICIES    the refund policy and the contact email, worker M's columns
 *               (run-now part 101), written with M's helpers
 *               (lib/communities/membership-policy.ts), the owner's only.
 *
 * Kept apart from creator.ts so the round's suite can run them against an
 * in-memory database (tests/communities-admin13.test.ts).
 */
import { creatorSitePlan } from "@/lib/sites/plan-server"
import { communityLimitFor, mayCreateCommunity, PLAN_LIMIT_ERROR, takesCommunitySlot, type CommunityPlan } from "../plan-limit"
import { canUndoDeletion } from "../community-deletion"
import { REFUND_POLICY_MAX, cleanContactEmail, cleanRefundPolicy } from "../membership-policy"
import { accessColumnsFor, privacyOf } from "../access-model"
import { COMMUNITY_COLUMNS, type CommunityRow, type Role } from "../types"
import type { CommunityLimitView, PoliciesView } from "@/components/community/creator/view-types"
import { audit } from "./audit"
import { createCommunity } from "./create"
import { rolePermissionsOf, rolesView } from "./creator-roles"
import { missing, reasonOf, type Db } from "./db"

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string; status: number; field?: string }
const no = (status: number, error: string, field?: string) => ({ ok: false as const, status, error, field })

/** A scheduled deletion as the list and the plan's count read it. */
export interface PendingDeletion {
  deleteAt: string
  /** Keep (Undo) is still possible: a deletion at the end of the paid time, before its date. */
  canKeep: boolean
}

/**
 * ROUND 26: THE COMMUNITIES AMONG `ids` WHOSE DELETION IS SCHEDULED (run-now
 * part 202, community_deletions.state 'scheduled'). Before part 202, or when
 * the read fails, none: such a community then still counts, as it did.
 * Scheduling archives the community, so callers pass only archived ids and
 * the list stays short.
 */
export async function pendingDeletions(db: Db, ids: string[], now: number = Date.now()): Promise<Map<string, PendingDeletion>> {
  const out = new Map<string, PendingDeletion>()
  if (!ids.length) return out
  const { data, error } = await db.from("community_deletions").select("community_id, state, mode, delete_at").in("community_id", ids.slice(0, 200)).eq("state", "scheduled")
  if (error) {
    if (!missing(error)) console.error(`[communities] pending deletions: ${reasonOf(error)}`)
    return out
  }
  for (const r of (data as { community_id: string; state: string; mode: string; delete_at: string }[] | null) ?? []) out.set(r.community_id, { deleteAt: r.delete_at, canKeep: canUndoDeletion(r, now) })
  return out
}

/** The communities this account owns that take a place on its plan (lib/communities/plan-limit.ts takesCommunitySlot), oldest first. */
async function slotHolders(db: Db, creatorId: string): Promise<{ id: string; created_at: string }[]> {
  const { data, error } = await db.from("communities").select("id, status, archived_at, created_at").eq("creator_id", creatorId).is("deleted_at", null).order("created_at", { ascending: true }).limit(1000)
  if (error) {
    if (!missing(error)) console.error(`[communities] plan count: ${reasonOf(error)}`)
    return []
  }
  const rows = (data as { id: string; status: string; archived_at: string | null; created_at: string }[] | null) ?? []
  const pending = await pendingDeletions(db, rows.filter((r) => r.status === "archived" || r.archived_at).map((r) => r.id))
  return rows
    .filter((r) => takesCommunitySlot({ deleting: pending.has(r.id) }))
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))
}

/**
 * Whether this creator may make one more community on their plan
 * (lib/communities/plan-limit.ts). Round 26: a community whose deletion is
 * scheduled takes no place, so a replacement can be made the same day.
 * `plan` is for a caller (or a test) that already knows it.
 */
export async function communityRoom(db: Db, creatorId: string, plan?: CommunityPlan): Promise<{ ok: boolean; limit: CommunityLimitView }> {
  const [p, holders] = await Promise.all([plan ?? creatorSitePlan(creatorId), slotHolders(db, creatorId)])
  const limit = { max: communityLimitFor(p), owned: holders.length }
  return { ok: mayCreateCommunity(p, limit.owned), limit }
}

/**
 * ROUND 26, TWO TABS AT ONCE: whether a community just made is inside the
 * plan's places. Two creates (or a create and a Keep) can both pass
 * communityRoom before either is written; asked again after the write, the
 * places go oldest first, so exactly the later one is over and its caller
 * takes it back. Never more communities than the plan holds.
 */
export async function madeWithinLimit(db: Db, creatorId: string, communityId: string, plan?: CommunityPlan): Promise<boolean> {
  const [p, holders] = await Promise.all([plan ?? creatorSitePlan(creatorId), slotHolders(db, creatorId)])
  const max = communityLimitFor(p)
  if (max === null) return true
  const at = holders.findIndex((h) => h.id === communityId)
  return at === -1 || at < max
}

/* ── Duplicate ──────────────────────────────────────────────────────────── */

/**
 * A NEW DRAFT WITH THIS ONE'S SETTINGS, from the list's menu: the page
 * (description, category, logo, cover, what members get, questions, links,
 * rules, welcome), which sections are on, approval and discovery, and what
 * admins and moderators may do. Never the members, posts, events, invites
 * or prices: a paid community's copy starts free, and its price is set in
 * Settings, Access (a price is a product with buyers of its own). Owner
 * only, and it counts against the plan's limit like any new community.
 */
export async function duplicateCommunity(db: Db, a: { source: CommunityRow; creatorId: string; userId: string }): Promise<Result<{ community: CommunityRow }>> {
  if (!(await communityRoom(db, a.creatorId)).ok) return no(402, PLAN_LIMIT_ERROR)
  const src = a.source
  const name = `${src.name.trim().slice(0, 74)} copy`
  const made = await createCommunity(db, {
    creatorId: a.creatorId,
    ownerUserId: a.userId,
    name,
    tagline: src.tagline ?? undefined,
    /* The copy keeps who can get in and starts free: a price is a product with buyers of its own (../access-model.ts). */
    ...accessColumnsFor(privacyOf(src), "free"),
    logoUrl: src.logo_url ?? undefined,
    coverUrl: src.cover_url ?? undefined,
  })
  if (made.ok === false) return made.error === "not_set_up" ? no(503, "Communities are not set up on Storelib yet.") : no(500, "The copy could not be made. Try again.")
  if (!(await madeWithinLimit(db, a.creatorId, made.community.id))) {
    await db.from("communities").delete().eq("id", made.community.id)
    return no(402, PLAN_LIMIT_ERROR)
  }
  const copied = {
    description: src.description,
    category: src.category,
    language: src.language,
    rules: src.rules,
    faq: src.faq,
    benefits: src.benefits,
    links: src.links,
    onboarding: src.onboarding,
    approval_required: src.approval_required,
    discovery_enabled: src.discovery_enabled,
    directory_enabled: src.directory_enabled,
    classroom_enabled: src.classroom_enabled,
    events_enabled: src.events_enabled,
    chat_enabled: src.chat_enabled,
    gamification_enabled: src.gamification_enabled,
  }
  const { data, error } = await db.from("communities").update(copied).eq("id", made.community.id).select(COMMUNITY_COLUMNS).single()
  if (error) console.error(`[communities] duplicate settings: ${reasonOf(error)}`)
  /* What admins and moderators may do comes along when part 100 has run; before it there is nothing to copy. */
  const roles = await rolePermissionsOf(db, src.id)
  if (roles.ready && Object.keys(roles.perms).length) await db.from("communities").update({ role_permissions: rolesView(roles.perms) }).eq("id", made.community.id)
  await audit(db, { communityId: made.community.id, actorId: a.userId, actorKind: "member", action: "community.duplicated", targetType: "community", targetId: made.community.id, targetLabel: name, detail: { from: src.id } })
  return { ok: true, community: (data as CommunityRow | null) ?? made.community }
}

/* ── Rules and policies (worker M's columns, run-now part 101) ───────────── */

/**
 * The refund policy and the contact email, read for Settings. Before part
 * 101 has added the columns, `ready` is false and the fields say an update
 * is needed rather than pretending to save.
 */
export async function loadPolicies(db: Db, communityId: string): Promise<PoliciesView> {
  const { data, error } = await db.from("communities").select("refund_policy, contact_email, contact_email_public").eq("id", communityId).maybeSingle()
  if (error) {
    if (!missing(error)) console.error(`[communities] policies read: ${reasonOf(error)}`)
    return { ready: false, refundPolicy: "", contactEmail: "", contactEmailPublic: false }
  }
  const row = (data as { refund_policy?: string | null; contact_email?: string | null; contact_email_public?: boolean | null } | null) ?? {}
  return { ready: true, refundPolicy: row.refund_policy ?? "", contactEmail: row.contact_email ?? "", contactEmailPublic: row.contact_email_public === true }
}

/**
 * What a cleaning helper answered, whatever its shape: a string or null (the
 * value), false (refused), or an object with ok and value.
 */
function cleaned(result: unknown): { ok: boolean; value: string | null } {
  if (result === null || result === undefined) return { ok: true, value: null }
  if (typeof result === "string") return { ok: true, value: result.trim() || null }
  if (result === false) return { ok: false, value: null }
  if (typeof result === "object") {
    const r = result as { ok?: unknown; value?: unknown }
    if (r.ok === false) return { ok: false, value: null }
    return { ok: true, value: typeof r.value === "string" && r.value.trim() ? r.value.trim() : null }
  }
  return { ok: false, value: null }
}

/** The owner saves the refund policy and how members reach them, through M's helpers (lib/communities/membership-policy.ts). */
export async function savePolicies(db: Db, a: { community: CommunityRow; role: Role; actorId: string; body: unknown }): Promise<Result<{ policies: PoliciesView }>> {
  if (a.role !== "owner") return no(403, "forbidden")
  const b = a.body && typeof a.body === "object" ? (a.body as Record<string, unknown>) : {}
  const patch: Record<string, unknown> = {}
  if (b.refundPolicy !== undefined) {
    if (typeof b.refundPolicy === "string" && b.refundPolicy.length > REFUND_POLICY_MAX) return no(400, `A refund policy is up to ${REFUND_POLICY_MAX.toLocaleString("en-US")} characters.`, "refundPolicy")
    const policy = cleaned(cleanRefundPolicy(b.refundPolicy))
    if (!policy.ok) return no(400, "That refund policy could not be saved.", "refundPolicy")
    patch.refund_policy = policy.value
  }
  if (b.contactEmail !== undefined) {
    const raw = typeof b.contactEmail === "string" ? b.contactEmail.trim() : ""
    const email = cleaned(raw ? cleanContactEmail(raw) : null)
    if (!email.ok || (raw && !email.value)) return no(400, "Enter an email address people can write to.", "contactEmail")
    patch.contact_email = email.value
  }
  if (b.contactEmailPublic !== undefined) {
    if (typeof b.contactEmailPublic !== "boolean") return no(400, "Show the email is on or off.", "contactEmailPublic")
    patch.contact_email_public = b.contactEmailPublic
  }
  if (patch.contact_email === null) patch.contact_email_public = false
  if (!Object.keys(patch).length) return { ok: true, policies: await loadPolicies(db, a.community.id) }
  const { error } = await db.from("communities").update(patch).eq("id", a.community.id)
  if (error) {
    if (missing(error)) return no(503, "needs_update")
    console.error(`[communities] policies save: ${reasonOf(error)}`)
    return no(500, "That did not save. Try again.")
  }
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "community.policies_changed", targetType: "community", targetId: a.community.id, targetLabel: a.community.name, detail: { fields: Object.keys(patch) } })
  return { ok: true, policies: await loadPolicies(db, a.community.id) }
}

