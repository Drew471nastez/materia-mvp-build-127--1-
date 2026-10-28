/**
 * ===========================================================================
 *  WHAT A TEAM MEMBER MAY DO (round 40)
 * ===========================================================================
 * The owner: "When I'm inviting people to the team, I can give them
 * permissions, with sensible defaults, like Shopify." Each member carries
 * their own list of permissions (store_team_members.permissions, SQL part
 * 320), chosen from a preset or ticked one by one when they are invited,
 * and changed later from Settings › Team. The owner has every permission and
 * is never on the list.
 *
 * Pure, so every page, route, the sidebar and the invite form ask the same
 * functions, and tests/team-permissions-r40.test.ts reads them whole.
 *
 * What keeps a store's data to the right people is the server: every page
 * and route of an area asks lib/team/server (requireTeamPermission,
 * creatorFor), which reads the member's permissions from the database on
 * each request. What this file decides for the browser (the sidebar, the
 * "You don't have access" card) only follows it.
 */
import { tt } from "@/lib/i18n/text"

export const TEAM_PERMISSIONS = [
  "website",
  "onepage",
  "creator_pages",
  "products",
  "orders",
  "customers",
  "marketing",
  "community",
  "analytics",
  "settings",
  "team",
  "payouts_billing",
] as const

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number]

/**
 * A part of the store a page or a route belongs to: a permission, or
 * "store" for what is the owner's alone whatever is given (deleting the
 * store, refunds, an address nobody has assigned to an area yet).
 */
export type TeamArea = TeamPermission | "store"

export function isTeamPermission(v: unknown): v is TeamPermission {
  return typeof v === "string" && (TEAM_PERMISSIONS as readonly string[]).includes(v)
}

/**
 * WHAT A MEMBER CAN USE TODAY. A permission is open to members once every
 * page and route of its area reads the store through lib/team, so a member
 * working in the store sees the store's data and not their own account's.
 * A permission not open yet is shown in the invite form, unticked and
 * unavailable, and is never stored or honoured.
 */
export const OPEN_TO_TEAM: ReadonlySet<TeamPermission> = new Set<TeamPermission>(["onepage", "orders", "customers", "marketing", "community", "analytics", "team"])
/*
  Round 40, second pass: OnePage (lib/team/onepage, the store owner's page
  through the editor's server routes) and Community (lib/communities/server
  /team.ts, an admin of each of the store's communities, acting as the
  store) are open. Still closed, and why, in tests/team-areas-r40.test.ts:
  the website builder, the creator page, products and store settings read
  and write from the browser under row level security that answers only
  for the owner.
*/

export function isOpen(p: TeamPermission): boolean {
  return OPEN_TO_TEAM.has(p)
}

/** Never in a preset: given one by one, by the owner, when they mean it. */
export const OFF_BY_DEFAULT: readonly TeamPermission[] = ["payouts_billing", "team"]

/**
 * A member's permissions as the server keeps them: known keys only, each
 * once, in the order of TEAM_PERMISSIONS, and only what is open to the team.
 * Anything else (a string, an unknown key, null) is dropped.
 */
export function normalizePermissions(v: unknown): TeamPermission[] {
  if (!Array.isArray(v)) return []
  const given = new Set(v.filter(isTeamPermission))
  return TEAM_PERMISSIONS.filter((p) => given.has(p) && isOpen(p))
}

/* ── Presets ─────────────────────────────────────────────────────────────── */

export type TeamPreset = "full" | "content" | "support" | "custom"
export const TEAM_PRESETS: readonly TeamPreset[] = ["full", "content", "support", "custom"]

/** What each preset ticks, before what is open to the team is applied. */
const PRESET_KEYS: Record<Exclude<TeamPreset, "custom">, readonly TeamPermission[]> = {
  /* Everything a member can be given except money and the team itself, which stay off until the owner ticks them. */
  full: TEAM_PERMISSIONS.filter((p) => !OFF_BY_DEFAULT.includes(p)),
  content: ["website", "onepage", "creator_pages", "products", "community"],
  support: ["orders", "customers"],
}

export function isTeamPreset(v: unknown): v is TeamPreset {
  return typeof v === "string" && (TEAM_PRESETS as readonly string[]).includes(v)
}

/** The permissions a preset gives today. Custom starts from nothing. */
export function presetPermissions(preset: TeamPreset): TeamPermission[] {
  return preset === "custom" ? [] : normalizePermissions(PRESET_KEYS[preset])
}

/** Which preset a set of permissions is, or custom. A preset that gives nothing today is never matched. */
export function presetOf(perms: readonly TeamPermission[]): TeamPreset {
  const key = normalizePermissions(perms).join(",")
  for (const p of ["full", "content", "support"] as const) {
    const want = presetPermissions(p)
    if (want.length > 0 && want.join(",") === key) return p
  }
  return "custom"
}

/** The preset a new invite starts on: the first that gives something today. */
export function defaultPreset(): TeamPreset {
  return (["full", "support", "content"] as const).find((p) => presetPermissions(p).length > 0) ?? "custom"
}

/**
 * THE OLD ROLES, FOR A ROW FROM BEFORE PART 320 (or a database that has not
 * run it yet): what that role could really use, which was Orders for a
 * Manager and nothing for Staff (Staff was never open to invite).
 */
export function legacyPermissions(role: unknown): TeamPermission[] {
  return role === "manager" ? ["orders"] : []
}

/** The old role column still has to hold manager or staff: a list that edits pages reads as staff, anything else as manager. */
export function legacyRoleFor(perms: readonly TeamPermission[]): "manager" | "staff" {
  const pages: TeamPermission[] = ["website", "onepage", "creator_pages", "products"]
  return perms.length > 0 && perms.every((p) => pages.includes(p) || p === "community") ? "staff" : "manager"
}

/** A row's permissions: the column once part 320 has run, else what its role could use. */
export function permissionsOfRow(row: { permissions?: unknown; role?: unknown }): TeamPermission[] {
  return Array.isArray(row.permissions) ? normalizePermissions(row.permissions) : legacyPermissions(row.role)
}

/* ── Asking ──────────────────────────────────────────────────────────────── */

/**
 * May someone with these permissions use this area. "store" never: it is
 * the owner's. A permission not open to the team never, even if a row
 * somehow holds it.
 */
export function permits(perms: readonly TeamPermission[], area: TeamArea): boolean {
  if (area === "store") return false
  return isOpen(area) && perms.includes(area)
}

/** What a member who can change the team may give: only what they have themselves. */
export function grantable(byOwner: boolean, granter: readonly TeamPermission[]): TeamPermission[] {
  return byOwner ? TEAM_PERMISSIONS.filter(isOpen) : normalizePermissions(granter)
}

/**
 * The dashboard area an /app address belongs to. null is the dashboard's
 * own home and the member's own account pages, which everyone has.
 * Anything not listed is the owner's ("store"), never open by default.
 */
const PATH_AREAS: [prefix: string, area: TeamArea][] = [
  ["/app/orders", "orders"],
  ["/app/sales", "orders"],
  ["/app/customers", "customers"],
  ["/app/products", "products"],
  ["/app/collections", "products"],
  ["/app/inventory", "products"],
  ["/app/reviews", "products"],
  ["/app/files", "products"],
  ["/app/courses", "products"],
  ["/app/memberships", "products"],
  ["/app/coupons", "marketing"],
  ["/app/offers", "marketing"],
  ["/app/emails", "marketing"],
  ["/app/analytics", "analytics"],
  ["/app/community", "community"],
  ["/app/website-builder", "website"],
  ["/app/sites", "website"],
  ["/app/onepage", "onepage"],
  ["/app/creator-page", "creator_pages"],
  ["/creator-page", "creator_pages"],
  ["/app/integrations", "settings"],
  ["/app/payouts", "payouts_billing"],
  ["/app/settings/billing", "payouts_billing"],
  ["/app/settings/payments", "payouts_billing"],
]

export function areaOfPath(pathname: string): TeamArea | null {
  const p = pathname.replace(/\/+$/, "") || "/"
  /* Help is everyone's, owner and team alike: it is opened from the account menu every member has (/app/help). */
  if (p === "/app" || p === "/app/settings" || p.startsWith("/app/settings/account") || p.startsWith("/app/auth") || p === "/app/help" || p.startsWith("/app/help/")) return null
  for (const [prefix, area] of PATH_AREAS) if (p === prefix || p.startsWith(`${prefix}/`)) return area
  return "store"
}

/** Whether a member's dashboard shows a link to this address. */
export function memberSees(perms: readonly TeamPermission[], href: string): boolean {
  const area = areaOfPath(href.split(/[?#]/)[0])
  return area !== null && permits(perms, area)
}

/** The first page of each area, for where a member lands. */
const AREA_HOME: Partial<Record<TeamPermission, string>> = {
  orders: "/app/orders",
  customers: "/app/customers",
  products: "/app/products",
  marketing: "/app/coupons",
  community: "/app/community",
  analytics: "/app/analytics",
  website: "/app/website-builder",
  onepage: "/app/onepage",
  creator_pages: "/creator-page",
  payouts_billing: "/app/payouts",
}

/**
 * Where a member lands in the store: the first page they may use, in the
 * order the sidebar lists them. Settings when there is none (Team there is
 * every member's: the stores they are on and leaving one).
 */
export function homeFor(perms: readonly TeamPermission[]): string {
  const area = homeArea(perms)
  return area ? AREA_HOME[area]! : "/app/settings?tab=team"
}

/** The area homeFor opens, or null for Settings › Team. */
export function homeArea(perms: readonly TeamPermission[]): TeamPermission | null {
  const order: TeamPermission[] = ["orders", "products", "customers", "website", "onepage", "creator_pages", "community", "marketing", "analytics", "payouts_billing"]
  return order.find((p) => permits(perms, p) && !!AREA_HOME[p]) ?? null
}

/* ── Words ───────────────────────────────────────────────────────────────── */

export const PERMISSION_LABEL: Record<TeamPermission, string> = {
  get website() { return tt("Website") },
  get onepage() { return tt("OnePage") },
  get creator_pages() { return tt("Creator page") },
  get products() { return tt("Products") },
  get orders() { return tt("Orders") },
  get customers() { return tt("Customers") },
  get marketing() { return tt("Marketing") },
  get community() { return tt("Community") },
  get analytics() { return tt("Analytics") },
  get settings() { return tt("Store settings") },
  get team() { return tt("Team") },
  get payouts_billing() { return tt("Payouts and billing") },
}

/** One line under each permission in the invite form: what it lets them do. */
export const PERMISSION_HINT: Record<TeamPermission, string> = {
  get website() { return tt("Edit and publish the website") },
  get onepage() { return tt("Edit and publish the OnePage") },
  get creator_pages() { return tt("Edit the creator page") },
  get products() { return tt("Products, collections, inventory, reviews and files") },
  get orders() { return tt("See, fulfil and ship orders, handle returns. Refunds stay with the owner.") },
  get customers() { return tt("See customers and what they bought") },
  get marketing() { return tt("Coupons, upsells and bundles, emails") },
  get community() { return tt("Posts, members and settings of the store's communities") },
  get analytics() { return tt("Reports and exports") },
  get settings() { return tt("Store details, shipping, taxes, checkout and integrations") },
  get team() { return tt("Invite people and change their access, up to their own") },
  get payouts_billing() { return tt("Payouts, the plan and invoices") },
}

/*
  The invite page (/team/join) and the invite email read these: they are
  outside the dashboard and its language, in English as the rest of them.
  i18n-ignore-start
*/
export const PERMISSION_CAN_EN: Record<TeamPermission, string> = {
  website: "Edit and publish the website",
  onepage: "Edit and publish the OnePage",
  creator_pages: "Edit the creator page",
  products: "Manage products, collections, inventory and reviews",
  orders: "See, fulfil and ship orders, handle returns",
  customers: "See customers and what they bought",
  marketing: "Run coupons, upsells, bundles and emails",
  community: "Manage the store's communities",
  analytics: "See reports and export them",
  settings: "Change store settings",
  team: "Invite people and change their access",
  payouts_billing: "See payouts and billing",
}
/** What stays with the owner, whatever is given. */
export const OWNER_KEEPS_EN = "Refunds and deleting the store stay with the owner."
/* i18n-ignore-end */

/** The lines an invite lists, in English: what these permissions let them do. */
export function permissionLinesEn(perms: readonly TeamPermission[]): string[] {
  return normalizePermissions(perms).map((p) => PERMISSION_CAN_EN[p])
}

export interface PermissionGroup {
  id: string
  label: string
  keys: readonly TeamPermission[]
}

/** The invite form's groups, in the order the sidebar has them. */
export function permissionGroups(): PermissionGroup[] {
  return [
    { id: "pages", label: tt("Pages"), keys: ["website", "onepage", "creator_pages"] },
    { id: "store", label: tt("Store"), keys: ["products", "orders", "customers"] },
    { id: "audience", label: tt("Audience"), keys: ["marketing", "community", "analytics"] },
    { id: "admin", label: tt("Admin"), keys: ["settings", "team", "payouts_billing"] },
  ]
}

export const PRESET_LABEL: Record<TeamPreset, string> = {
  get full() { return tt("Full access") },
  get content() { return tt("Content editor") },
  get support() { return tt("Support") },
  get custom() { return tt("Custom") },
}

/* i18n-ignore-start */
const PRESET_LABEL_EN: Record<TeamPreset, string> = { full: "Full access", content: "Content editor", support: "Support", custom: "Custom access" }
const PERMISSION_NAME_EN: Record<TeamPermission, string> = {
  website: "Website", onepage: "OnePage", creator_pages: "Creator page", products: "Products", orders: "Orders", customers: "Customers",
  marketing: "Marketing", community: "Community", analytics: "Analytics", settings: "Store settings", team: "Team", payouts_billing: "Payouts and billing",
}
/* i18n-ignore-end */

/** The same summary in English, for the invite email and page. */
export function accessSummaryEn(perms: readonly TeamPermission[]): string {
  const list = normalizePermissions(perms)
  if (list.length === 0) return "No access yet" // i18n-ignore
  const preset = presetOf(list)
  if (preset !== "custom" || list.length > 3) return PRESET_LABEL_EN[preset]
  return list.map((p) => PERMISSION_NAME_EN[p]).join(", ")
}

/** A member's access in a few words, for a list row: the preset, or the permissions themselves. */
export function accessSummary(perms: readonly TeamPermission[]): string {
  const list = normalizePermissions(perms)
  if (list.length === 0) return tt("No access yet")
  const preset = presetOf(list)
  if (preset !== "custom") return PRESET_LABEL[preset]
  if (list.length <= 3) return list.map((p) => PERMISSION_LABEL[p]).join(", ")
  return tt("{count} permissions", { count: list.length })
}
