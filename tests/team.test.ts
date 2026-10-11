/**
 * A store's team: who may do what, and that every way in asks the server.
 *
 *   npx tsx tests/team.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  FREE_SEATS,
  INVITE_TTL_MS,
  MEMBER_ROLES,
  OPEN_TO_TEAM,
  OWNER_ONLY,
  PRO_SEATS,
  areaOfPath,
  can,
  invitable,
  isMemberRole,
  memberCan,
  roleHome,
  seatLimit,
  teamEmail,
  type TeamArea,
} from "@/lib/team/roles"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const ALL: TeamArea[] = ["products", "orders", "customers", "emails", "analytics", "website", "content", "payouts", "billing", "team", "store"]

console.log("\nWho may do what")
{
  check("the owner has every area", ALL.every((a) => can("owner", a)))
  check("no member role ever has payouts, billing, the team or the store", MEMBER_ROLES.every((r) => OWNER_ONLY.every((a) => !can(r, a))))
  check("a manager runs products, orders, customers and emails", ["products", "orders", "customers", "emails"].every((a) => can("manager", a as TeamArea)) && !can("manager", "website"))
  check("staff build: products, the website and content", ["products", "website", "content"].every((a) => can("staff", a as TeamArea)) && !can("staff", "orders"))
  check("only orders is open to members today", [...OPEN_TO_TEAM].join() === "orders")
  check("  so a member reaches only what is both their role's and open", memberCan("manager", "orders") && !memberCan("manager", "products") && !memberCan("staff", "orders") && !memberCan("staff", "website"))
  check("a manager can be invited, staff waits until one of its areas opens", invitable("manager") && !invitable("staff"))
  check("every member starts in Orders", roleHome("manager") === "/app/orders")
  check("only manager and staff are roles to give", isMemberRole("manager") && isMemberRole("staff") && !isMemberRole("owner") && !isMemberRole("admin") && !isMemberRole(undefined))
}

console.log("\nSeats, invites and emails")
{
  check("three seats free, more on Pro", seatLimit(false) === FREE_SEATS && FREE_SEATS === 3 && seatLimit(true) === PRO_SEATS && PRO_SEATS > FREE_SEATS)
  check("an invite lasts a week", INVITE_TTL_MS === 7 * 24 * 60 * 60 * 1000)
  check("an email is kept lower case and trimmed", teamEmail("  Ana@Example.COM ") === "ana@example.com")
  check("  and anything that is not one is refused", teamEmail("ana") === null && teamEmail("") === null && teamEmail(42) === null && teamEmail("a@b") === null)
}

console.log("\nWhich area a dashboard address is")
{
  check("orders and an order's pages are Orders", areaOfPath("/app/orders") === "orders" && areaOfPath("/app/orders/sales") === "orders" && areaOfPath("/app/orders/abc/") === "orders")
  check("the dashboard, settings and one's own account belong to nobody's store", areaOfPath("/app") === null && areaOfPath("/app/settings") === null && areaOfPath("/app/settings/account") === null)
  check("payouts and billing are the owner's", areaOfPath("/app/payouts") === "payouts" && areaOfPath("/app/settings/billing") === "billing" && areaOfPath("/app/settings/payments") === "payouts")
  check("an address nobody listed is the owner's, never open by default", areaOfPath("/app/something-new") === "store")
}

console.log("\nEvery way in asks the server")
{
  const server = read("lib/team/server.ts")
  check("the store a member works in is read again from the database on each request", /\.from\("store_team_members"\)\.select\("role"\)\.eq\("creator_id", chosen\)\.eq\("user_id", userId\)\.eq\("status", "active"\)/.test(server))
  check("  and a role that does not have the area is denied, never shown their own account", /if \(!memberCan\(acting\.role, area\)\) return \{ kind: "denied", acting \}/.test(server))
  check("invites are stored as a hash, never the link itself", /token_hash: hashToken\(/.test(server) && !/token: token/.test(server))
  check("an invite is accepted only by the email it was sent to", /user\.email\.toLowerCase\(\) !== invite\.email/.test(server))
  check("a role that is not open yet cannot be given", (server.match(/if \(!invitable\(/g) ?? []).length === 2)
  check("an owner's own team is managed from their own store only", /const store = await ownStore\(db, opts\.owner\.id\)/.test(server))

  const auth = read("lib/physical/auth.ts")
  check("physical routes default to the owner's area", /physicalCaller\(area: TeamArea = "store"\)/.test(auth) && /shopCaller\(area: TeamArea = "store"\)/.test(auth))
  for (const p of ["app/api/physical/orders/route.ts", "app/api/physical/orders/[id]/route.ts", "app/api/physical/orders/export/route.ts"]) {
    check(`${p} opens to orders`, /physicalCaller\("orders"\)/.test(read(p)))
  }
  for (const p of ["app/api/app/orders/[id]/resend/route.ts", "app/api/app/orders/[id]/email/route.ts", "app/api/app/orders/[id]/activity/route.ts"]) {
    const src = read(p)
    check(`${p} reads the store through lib/team`, /storeIdFor\("orders"\)/.test(src) && !/currentCreatorId/.test(src))
  }
  check("the orders export and invoices read the store through lib/team", /creatorFor\(admin, user\.id, "orders"\)/.test(read("app/api/app/orders/export/route.ts")) && /storeIdFor\("orders"\)/.test(read("app/api/invoice/route.ts")))

  const sales = read("app/app/orders/sales/page.tsx")
  check("refunds stay the owner's", /canRefund=\{found\.role === "owner"\}/.test(sales) && /onRefund=\{canRefund && /.test(read("app/app/orders/order-detail.tsx")) && /\.\.\.\(canRefund && refundable/.test(read("app/app/orders/order-detail.tsx")))
  check("the refund route itself is untouched: the signed in account's own orders only", !/lib\/team/.test(read("app/api/stripe/refund/route.ts")))

  const join = read("app/api/team/join/route.ts")
  check("accepting from the email link checks where the form came from", /origin !== new URL\(req\.url\)\.origin/.test(join))
  check("the store cookie only names a store and is not readable by scripts", (read("app/api/team/act/route.ts").match(/httpOnly: true, sameSite: "lax", secure: true/g) ?? []).length === 1)

  const layout = read("app/app/layout.tsx")
  check("the dashboard draws the store only for a verified member", /actingStore\(createAdminClient\(\), user\.id\)/.test(layout) && /teamStore && acting \? <TeamBar/.test(layout))
}

console.log("\nThe table")
{
  const sql = read("supabase/sql/run-now/135_store_team.sql")
  check("the run-now part and the migration are the same text", sql === read("supabase/migrations/20270108_store_team.sql"))
  check("server only: row level security on, nothing granted to the browser", /ENABLE ROW LEVEL SECURITY/i.test(sql) && /REVOKE ALL ON (TABLE )?public\.store_team_members FROM PUBLIC, anon, authenticated/i.test(sql))
  check("one invite per email per store, one membership per person per store", /UNIQUE \(creator_id, email\)/i.test(sql) && /\(creator_id, user_id\)/i.test(sql))
  check("the check after running knows it", /as p135_store_team/.test(read("supabase/sql/run-now/99_check_after.sql")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
