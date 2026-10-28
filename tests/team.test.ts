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
  PRO_SEATS,
  areaOfPath,
  isMemberRole,
  seatLimit,
  teamEmail,
} from "@/lib/team/roles"
/* Round 40: who may do what is each member's own permissions (lib/team/permissions, tests/team-permissions-r40.test.ts), not a role's. */
import { OFF_BY_DEFAULT, homeFor, legacyPermissions, permits, presetPermissions } from "@/lib/team/permissions"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWho may do what (round 40: permissions per member)")
{
  /* The old roles still read as what they could use, for a row from before part 320. */
  check("an old Manager row keeps Orders, and only Orders", legacyPermissions("manager").join() === "orders" && permits(legacyPermissions("manager"), "orders") && !permits(legacyPermissions("manager"), "products"))
  check("an old Staff row has nothing", legacyPermissions("staff").length === 0)
  check("payouts and billing and the team are in no preset", (["full", "content", "support"] as const).every((p) => OFF_BY_DEFAULT.every((k) => !presetPermissions(p).includes(k))))
  check("the store's own area is nobody's but the owner's", !permits(["orders", "team", "payouts_billing"], "store"))
  check("an Orders member starts in Orders", homeFor(["orders"]) === "/app/orders")
  check("only manager and staff are values of the old role column", isMemberRole("manager") && isMemberRole("staff") && !isMemberRole("owner") && !isMemberRole("admin") && !isMemberRole(undefined))
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
  check("payouts and billing are one permission", areaOfPath("/app/payouts") === "payouts_billing" && areaOfPath("/app/settings/billing") === "payouts_billing" && areaOfPath("/app/settings/payments") === "payouts_billing")
  check("an address nobody listed is the owner's, never open by default", areaOfPath("/app/something-new") === "store")
}

console.log("\nEvery way in asks the server")
{
  const server = read("lib/team/server.ts")
  /* Round 40: the row is read with its permissions (readRows), still by store, account and active. */
  check("the store a member works in is read again from the database on each request", /\.from\("store_team_members"\)\.select\(cols\)\.eq\("creator_id", chosen\)\.eq\("user_id", userId\)\.eq\("status", "active"\)/.test(server))
  check("  and permissions that do not have the area are denied, never shown their own account", /if \(!permits\(acting\.permissions, area\)\) return \{ kind: "denied", acting \}/.test(server))
  check("invites are stored as a hash, never the link itself", /token_hash: hashToken\(/.test(server) && !/token: token/.test(server))
  /* The decision is lib/team/invite-state.ts (one table for the page and the accept). The link proves the inbox, so another account of whoever holds it may accept (tests/team-join-x.test.ts). */
  check("an invite is accepted only with its link, as the page shows it", /!sameEmail\(user\.email, invite\.email\)/.test(read("lib/team/invite-state.ts")) && /const refused = refusalOf\(state\)/.test(server) && /!acceptable\(state\)/.test(server))
  check("  and only once: the row turns active only while it is still an invite", /\.eq\("status", "invited"\)\s*\n\s*\.select\("id"\)/.test(server))
  /* Round 40: what can be given is what is open to the team, and for a member with Team only their own access (teamScope, withinGrant). */
  check("access beyond what the giver has cannot be given", (server.match(/if \(!withinGrant\(permissions, grant\)\)/g) ?? []).length === 2)
  check("an owner's own team is managed from their own store, a member's from the store they work in", /const store = await ownStore\(db, userId\)/.test(server) && /if \(!permits\(acting\.permissions, "team"\)\)/.test(server))

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
  check("accepting from the email link checks where the form came from", /fromOwnPage\(req\.headers, req\.url\)/.test(join))
  {
    const get = join.slice(join.indexOf("export async function GET"), join.indexOf("function back("))
    check("  and opening the old /api/team/join link goes to the invite page, changing nothing", /joinPath\(token\)/.test(get) && /308/.test(get) && !/acceptInvite|declineInvite/.test(get))
  }
  check("the store cookie only names a store and is not readable by scripts", (read("app/api/team/act/route.ts").match(/httpOnly: true, sameSite: "lax", secure: true/g) ?? []).length === 1)

  const layout = read("app/app/layout.tsx")
  check("the dashboard draws the store only for a verified member", /teamStoreForRequest\(user\.id\)/.test(layout) && /const acting = await actingStore\(db, userId\)/.test(read("lib/team/server.ts")) && /teamStore && acting \? <TeamBar/.test(layout))
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
