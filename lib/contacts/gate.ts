import "server-only"

/**
 * ===========================================================================
 *  WHO MAY SEE A STORE'S CONTACTS (round 51)
 * ===========================================================================
 * The people a store knows were split over two areas before Contacts: its
 * buyers on Customers (the "customers" permission) and its subscribers and
 * leads on Emails (the "marketing" permission). A team member given either
 * one keeps seeing the people they saw, so Contacts opens for either
 * (lib/team/permissions contactsPermitted). Marketing writes (taking someone
 * off the list, importing people as subscribers) still need Marketing.
 *
 * Every read is the service role filtered by the store's id the server found
 * from the session, never an id from the request.
 */
import { NextResponse } from "next/server"
import { requireTeamPermission, teamPageStore, type TeamGate } from "@/lib/team/server"
import { permits, type TeamPermission } from "@/lib/team/permissions"
import { createAdminClient } from "@/lib/supabase/admin"

export interface ContactsScope {
  creatorId: string
  /** The account the store belongs to: form answers are kept by account (form_submissions.owner_id). */
  ownerUserId: string | null
}

export interface ContactsGate extends ContactsScope {
  userId: string
  isOwner: boolean
  permissions: TeamPermission[]
  /** May take people off the marketing list and import subscribers. */
  marketing: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
}

function fromTeam(g: TeamGate): ContactsGate {
  return {
    creatorId: g.creatorId,
    ownerUserId: g.ownerUserId,
    userId: g.userId,
    isOwner: g.isOwner,
    permissions: g.permissions,
    marketing: g.isOwner || permits(g.permissions, "marketing"),
    db: g.db,
  }
}

/** A route's gate: Customers or Marketing (and Marketing alone when `marketing` is asked for). */
export async function requireContacts(opts: { read?: boolean; marketing?: boolean } = {}): Promise<ContactsGate | NextResponse> {
  if (opts.marketing) {
    const g = await requireTeamPermission("marketing", { read: opts.read })
    return g instanceof NextResponse ? g : fromTeam(g)
  }
  const first = await requireTeamPermission("customers", { read: opts.read })
  if (!(first instanceof NextResponse)) return fromTeam(first)
  if (first.status !== 403) return first
  const second = await requireTeamPermission("marketing", { read: opts.read })
  return second instanceof NextResponse ? second : fromTeam(second)
}

export type ContactsPage =
  | { kind: "store"; scope: ContactsScope; userId: string; isOwner: boolean; marketing: boolean; db: ReturnType<typeof createAdminClient> }
  | { kind: "denied"; store: string; permissions: TeamPermission[] }
  | { kind: "none" }
  | { kind: "signed_out" }

/** A page's answer to the same question (lib/team/server teamPageStore, for either area). */
export async function contactsPage(): Promise<ContactsPage> {
  const a = await teamPageStore("customers")
  const s = a.kind === "denied" ? await teamPageStore("marketing") : a
  if (s.kind === "signed_out") return { kind: "signed_out" }
  if (s.kind === "none") return { kind: "none" }
  if (s.kind === "denied") return { kind: "denied", store: s.acting.name, permissions: s.acting.permissions }
  const marketing = s.isOwner || (s.acting ? permits(s.acting.permissions, "marketing") : true)
  return { kind: "store", scope: { creatorId: s.creatorId, ownerUserId: s.ownerUserId }, userId: s.userId, isOwner: s.isOwner, marketing, db: createAdminClient() }
}

export const NO_STORE = { "Cache-Control": "private, no-store" }
