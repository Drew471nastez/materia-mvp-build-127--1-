/**
 * ===========================================================================
 *  A STORE'S TEAM: WHO MAY DO WHAT
 * ===========================================================================
 * The one answer to "may this person do this here", asked by every page and
 * route that a team member can reach (lib/team/server.ts actingStore), and
 * by the dashboard to hide what a role does not have. Pure, so it is tested
 * whole (tests/team.test.ts).
 *
 *   OWNER     everything. The account the store belongs to.
 *   MANAGER   runs the store day to day: products, orders, customers and
 *             emails, and the analytics that go with them.
 *   STAFF     builds: products, the website and content.
 *
 * Billing, payouts, the team itself and deleting the store are the owner's
 * and nobody else's, whatever role is given (lib/settings/explainers "team").
 */

export type TeamRole = "owner" | "manager" | "staff"
/** The roles an owner can give. The owner is the account, never an invite. */
export type MemberRole = Exclude<TeamRole, "owner">
export const MEMBER_ROLES: readonly MemberRole[] = ["manager", "staff"]

/** The parts of a store a role can be given. */
export type TeamArea =
  | "products"
  | "orders"
  | "customers"
  | "emails"
  | "analytics"
  | "website"
  | "content"
  /* The owner's alone: */
  | "payouts"
  | "billing"
  | "team"
  | "store"

const AREAS: Record<TeamRole, ReadonlySet<TeamArea>> = {
  owner: new Set<TeamArea>(["products", "orders", "customers", "emails", "analytics", "website", "content", "payouts", "billing", "team", "store"]),
  manager: new Set<TeamArea>(["products", "orders", "customers", "emails", "analytics"]),
  staff: new Set<TeamArea>(["products", "website", "content"]),
}

/** The areas no role but the owner ever has. */
export const OWNER_ONLY: readonly TeamArea[] = ["payouts", "billing", "team", "store"]

export function can(role: TeamRole, area: TeamArea): boolean {
  return AREAS[role].has(area)
}

/**
 * WHAT IS OPEN TO A TEAM MEMBER TODAY. A role says what it will have; an
 * area is open to members only once every page and route of it reads the
 * store through lib/team (creatorFor). Orders is: the list, an order, its
 * fulfilment, shipments, returns and notes, receipts, invoices and the
 * export. Products, customers, emails, the website and content still read
 * the signed in account's own store in places, so they stay the owner's
 * until they are moved over; a member is told so rather than shown their
 * own account in the store's place.
 */
export const OPEN_TO_TEAM: ReadonlySet<TeamArea> = new Set<TeamArea>(["orders"])

/** May a member with this role open this area now: the role has it, and it is open to the team. */
export function memberCan(role: MemberRole, area: TeamArea): boolean {
  return can(role, area) && OPEN_TO_TEAM.has(area)
}

/** A role an owner can give today: one with at least one area open to the team. */
export function invitable(role: MemberRole): boolean {
  return [...AREAS[role]].some((a) => OPEN_TO_TEAM.has(a))
}

export function isMemberRole(v: unknown): v is MemberRole {
  return v === "manager" || v === "staff"
}

export const ROLE_LABEL: Record<TeamRole, string> = { owner: "Owner", manager: "Manager", staff: "Staff" }
/** What each role can do now (OPEN_TO_TEAM), in the words the Team page uses. */
export const ROLE_SUMMARY: Record<MemberRole, string> = {
  manager: "Orders: fulfil, ship, handle returns and send receipts",
  staff: "Products, the website and content, once they open to the team",
}

/**
 * What a role can do today, in the words the invite page and the Team page
 * use: a short list, then what stays with the owner. Only what is open to
 * the team (OPEN_TO_TEAM) is listed as something they can do.
 */
export const ROLE_CAN: Record<MemberRole, readonly string[]> = {
  manager: ["See and search every order", "Fulfil and ship orders, buy labels", "Handle returns and order notes", "Send receipts and invoices, export orders"],
  staff: ["Products, the website and content, once they open to the team"],
}
/** What stays with the owner, whatever the role. */
export const OWNER_KEEPS = "Refunds, payouts, billing, products, the website, the team and deleting the store stay with the owner."

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

/**
 * The dashboard area an /app address belongs to, for what a member is shown.
 * null is the dashboard's own home and the member's own account pages, which
 * everyone has. Anything not listed is treated as the owner's ("store").
 */
const PATH_AREAS: [prefix: string, area: TeamArea][] = [
  ["/app/orders", "orders"],
  ["/app/sales", "orders"],
  ["/app/customers", "customers"],
  ["/app/products", "products"],
  ["/app/collections", "products"],
  ["/app/inventory", "products"],
  ["/app/reviews", "products"],
  ["/app/emails", "emails"],
  ["/app/analytics", "analytics"],
  ["/app/website-builder", "website"],
  ["/app/sites", "website"],
  ["/app/onepage", "website"],
  ["/app/creator-page", "content"],
  ["/app/files", "content"],
  ["/app/courses", "content"],
  ["/app/payouts", "payouts"],
  ["/app/settings/billing", "billing"],
  ["/app/settings/payments", "payouts"],
]

export function areaOfPath(pathname: string): TeamArea | null {
  const p = pathname.replace(/\/+$/, "") || "/"
  if (p === "/app" || p === "/app/settings" || p.startsWith("/app/settings/account") || p.startsWith("/app/auth")) return null
  for (const [prefix, area] of PATH_AREAS) if (p === prefix || p.startsWith(`${prefix}/`)) return area
  return "store"
}

/** Where a member lands in the dashboard: the first part of the store their role has. */
export function roleHome(_role: MemberRole): string {
  // Orders is the one area open to the team (OPEN_TO_TEAM), and only a role
  // that has it can be given (invitable), so every member starts there.
  return "/app/orders"
}

/** Whether a member's dashboard shows a link to this address: a part of the store their role has and that is open to the team. */
export function memberSees(role: MemberRole, href: string): boolean {
  const area = areaOfPath(href.split(/[?#]/)[0])
  return area !== null && memberCan(role, area)
}
