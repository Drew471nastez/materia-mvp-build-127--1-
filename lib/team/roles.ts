/**
 * ===========================================================================
 *  A STORE'S TEAM: SEATS, INVITES, AND THE OLD ROLES
 * ===========================================================================
 * Who may do what is a member's own list of permissions now (round 40,
 * lib/team/permissions.ts, SQL part 320), chosen from a preset or ticked one
 * by one. The two roles a member used to be given (Manager, Staff) stay only
 * as the column the table already has: a row from before part 320 reads as
 * what its role could really use (permissionsOfRow).
 *
 * The owner is the account the store belongs to and has everything.
 * Deleting the store and refunds are the owner's whatever is given.
 */
import { tt } from "@/lib/i18n/text"

export {
  OPEN_TO_TEAM,
  areaOfPath,
  homeFor,
  memberSees,
  permits,
  type TeamArea,
  type TeamPermission,
} from "./permissions"

export type TeamRole = "owner" | "manager" | "staff"
/** The roles the table's old column holds. The owner is the account, never an invite. */
export type MemberRole = Exclude<TeamRole, "owner">
export const MEMBER_ROLES: readonly MemberRole[] = ["manager", "staff"]

export function isMemberRole(v: unknown): v is MemberRole {
  return v === "manager" || v === "staff"
}

export const ROLE_LABEL: Record<TeamRole, string> = { get owner() { return tt("Owner") }, get manager() { return tt("Manager") }, get staff() { return tt("Staff") } }

/** People an owner can invite besides themselves: three on Free. */
export const FREE_SEATS = 3
export const PRO_SEATS = 10
export function seatLimit(pro: boolean): number {
  return pro ? PRO_SEATS : FREE_SEATS
}

/** How long an invite link works. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** How soon the same invite can be sent again: a double press, or an impatient one, is not a second email. */
export const RESEND_COOLDOWN_MS = 60 * 1000

/** Seconds until an invite sent at `invitedAt` can be sent again (0: now). */
export function resendWait(invitedAt: string | null | undefined, now = Date.now()): number {
  const at = invitedAt ? Date.parse(invitedAt) : NaN
  if (!Number.isFinite(at)) return 0
  return Math.max(0, Math.ceil((at + RESEND_COOLDOWN_MS - now) / 1000))
}

/** An email as the team keeps it: trimmed and lower case, or null when it is not one. */
export function teamEmail(v: unknown): string | null {
  if (typeof v !== "string") return null
  const e = v.trim().toLowerCase()
  if (e.length < 3 || e.length > 254) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}
