import "server-only"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { permits, type TeamPermission } from "./permissions"
import { NO_ACCESS, actingStore, type ActingStore } from "./server"
import { teamStampDb } from "./audit"

/**
 * ===========================================================================
 *  THE WEBSITE, THE CREATOR PAGE, PAYOUTS AND BILLING FOR THE TEAM (round 42)
 * ===========================================================================
 * The same question round 40 and 41 asked for Products and the OnePage,
 * for the four areas still closed: whose store does this request work in.
 *
 *   their own account          the owner: their own client, read under row
 *                              level security as it always was, and their
 *                              own creator row
 *   working in a store, with the area
 *                              that store's row, read with the service role
 *                              by the store's id, through a client that names
 *                              the member on the record lines it writes
 *                              (lib/team/audit)
 *   working in a store, without it
 *                              refused, never their own account in its place
 *
 * The routes of each area filter every read and write by the creatorId this
 * answers with, so a member's request can only reach the store they work in.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type AreaStore =
  | { kind: "store"; db: Db; creatorId: string; isOwner: boolean; ownerUserId: string; acting: ActingStore | null }
  | { kind: "denied" }
  | { kind: "none" }
  | { kind: "unreachable" }

/**
 * The database half, for the suite: `own` is the signed in account's own
 * client, `admin` the service role, `acting` the store the cookie names
 * (read again from the database), or null for their own account.
 */
export async function areaStoreFor(
  own: Db,
  admin: Db,
  userId: string,
  area: TeamPermission,
  acting: ActingStore | null,
): Promise<AreaStore> {
  if (acting) {
    if (!permits(acting.permissions, area)) return { kind: "denied" }
    const { data, error } = await admin.from("creators").select("id, user_id").eq("id", acting.creatorId).maybeSingle()
    if (error) return { kind: "unreachable" }
    const row = data as { id: string; user_id: string | null } | null
    if (!row || !row.user_id) return { kind: "none" }
    return { kind: "store", db: teamStampDb(admin, userId), creatorId: row.id, isOwner: false, ownerUserId: row.user_id, acting }
  }
  const first = await own.from("creators").select("id").eq("user_id", userId).maybeSingle()
  const read = first.error ? await own.from("creators").select("id").eq("user_id", userId).maybeSingle() : first
  if (read.error) return { kind: "unreachable" }
  const row = read.data as { id: string } | null
  if (!row) return { kind: "none" }
  return { kind: "store", db: own, creatorId: row.id, isOwner: true, ownerUserId: userId, acting: null }
}

/** For a route: whose store, for this area, from the cookie and the database. */
export async function areaStore(own: Db, userId: string, area: TeamPermission): Promise<AreaStore> {
  const admin = createAdminClient()
  const acting = await actingStore(admin, userId).catch(() => null)
  return areaStoreFor(own, admin, userId, area, acting)
}

/** The answer a route sends when areaStore said no. */
export function areaRefusal(found: Exclude<AreaStore, { kind: "store" }>, noStore = "Set up your store first."): NextResponse {
  const headers = { "Cache-Control": "no-store" }
  if (found.kind === "denied") return NextResponse.json({ error: NO_ACCESS }, { status: 403, headers })
  if (found.kind === "unreachable") return NextResponse.json({ error: "Storelib could not reach your store just now. Try again in a moment." }, { status: 503, headers })
  return NextResponse.json({ error: noStore }, { status: 404, headers })
}

/**
 * Whether this site (a store_theme_installs row) is the store's. Every
 * website route asks it before touching the site's pages, settings, files,
 * backups or releases, so an install id in a request is only a claim.
 */
export async function storeInstall<T = { id: string; creator_id: string }>(db: Db, creatorId: string, installId: string, columns = "id, creator_id"): Promise<{ ok: true; install: T } | { ok: false; status: 404 | 503 }> {
  if (!/^[0-9a-f-]{36}$/i.test(installId)) return { ok: false, status: 404 }
  const run = () => db.from("store_theme_installs").select(columns).eq("id", installId).eq("creator_id", creatorId).maybeSingle()
  let r = await run()
  if (r.error) r = await run()
  if (r.error) return { ok: false, status: 503 }
  if (!r.data) return { ok: false, status: 404 }
  return { ok: true, install: r.data as T }
}

/* ── What a member did, on the record ───────────────────────────────────── */

/** The sensitive actions written to security_events with the member's name on them. */
export type TeamRecordedAction =
  | "website_published"
  | "website_restored"
  | "creator_page_changed"
  | "payout_account_opened"
  | "payout_cashed_out"
  | "payout_schedule_changed"
  | "billing_plan_changed"
  | "billing_payment_method_changed"
  | "billing_cancelled"
  | "billing_resumed"
  | "billing_portal_opened"

/** Pure: the line a member's action writes. Exported for the suite. */
export function teamActionRow(a: { creatorId: string; memberUserId: string; area: TeamPermission; action: TeamRecordedAction; detail?: Record<string, unknown> }) {
  return {
    event_type: `team_${a.action}`,
    ip: "server",
    user_agent: "team",
    metadata: { ...(a.detail ?? {}), creator_id: a.creatorId, area: a.area, team_member_user_id: a.memberUserId },
  }
}

/**
 * Writes the line for a member's action; nothing for the owner (their own
 * account did it). Never throws: a line that could not be written is logged,
 * the action itself has already happened.
 */
export async function recordTeamAction(store: { isOwner: boolean; creatorId: string; acting: ActingStore | null }, memberUserId: string, area: TeamPermission, action: TeamRecordedAction, detail?: Record<string, unknown>): Promise<void> {
  if (store.isOwner || !store.acting) return
  try {
    const { error } = await createAdminClient().from("security_events").insert(teamActionRow({ creatorId: store.creatorId, memberUserId, area, action, detail }))
    if (error) console.error("[team] action not recorded", { action, code: error.code })
  } catch {
    console.error("[team] action not recorded", { action })
  }
}
