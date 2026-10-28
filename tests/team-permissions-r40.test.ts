/**
 * Round 40: team permissions, like Shopify's staff permissions. The owner:
 * "When I'm inviting people to the team, I can give them permissions, with
 * sensible defaults: edit the one page, edit the website, edit creator
 * pages, manage community, see certain things in the sidebar, change certain
 * settings, like Shopify. Make sure it works 100%."
 *
 *   the model     each key, the presets, a row from before part 320, what is
 *                 open to the team, what a member with Team may give
 *   the server    a member's permissions read from the database decide the
 *                 store a page or route gets (creatorFor), the invite and
 *                 the change of access (inviteMember, updateMember), with
 *                 the fake database
 *   the routes    every page and route of an open area asks the one helper
 *                 with its area (source pins)
 *   the screens   the sidebar, the "You don't have access" card, the team
 *                 panel and the invite page read the permissions
 *   the SQL       part 320 and its migration, the check after, the README
 *
 *   npx tsx --conditions=react-server tests/team-permissions-r40.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import {
  OFF_BY_DEFAULT,
  OPEN_TO_TEAM,
  TEAM_PERMISSIONS,
  TEAM_PRESETS,
  accessSummaryEn,
  areaOfPath,
  defaultPreset,
  grantable,
  homeFor,
  isTeamPermission,
  legacyPermissions,
  legacyRoleFor,
  memberSees,
  normalizePermissions,
  permissionGroups,
  permissionLinesEn,
  permissionsOfRow,
  permits,
  presetOf,
  presetPermissions,
  type TeamPermission,
} from "@/lib/team/permissions"
import { actingStoreIn, creatorFor, inviteMember, listTeam, permissionsMissing, storeAccessOf, teamScope, updateMember, viewerKey, type ActingStore } from "@/lib/team/server"
import { inviteStateOf } from "@/lib/team/invite-state"
import { teamInviteEmail } from "@/lib/team/invite-email"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const same = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join()

const OWNER = "11111111-1111-4111-8111-111111111111"
const ANA = "22222222-2222-4222-8222-222222222222"
const BEN = "33333333-3333-4333-8333-333333333333"
const STORE = "44444444-4444-4444-8444-444444444444"
const OTHER_STORE = "66666666-6666-4666-8666-666666666666"
const ANA_ROW = "55555555-5555-4555-8555-555555555555"
const BEN_ROW = "77777777-7777-4777-8777-777777777777"

async function main() {
  console.log("\nThe keys")
  {
    const want = ["onepage", "website", "creator_pages", "community", "products", "orders", "customers", "analytics", "marketing", "payouts_billing", "settings", "team"]
    check("every key the owner asked for is a permission", same(TEAM_PERMISSIONS, want), TEAM_PERMISSIONS)
    check("anything else is not", !isTeamPermission("store") && !isTeamPermission("refunds") && !isTeamPermission("") && !isTeamPermission(null))
    check("a list is cleaned: unknown keys, repeats and closed areas dropped, in one order", normalizePermissions(["team", "orders", "refunds", "orders", 4, null]).join() === ["orders", "team"].filter((p) => OPEN_TO_TEAM.has(p as TeamPermission)).join())
    check("  and anything that is not a list is nothing", normalizePermissions("orders").length === 0 && normalizePermissions(null).length === 0)
    check("the invite form groups every key once", same(permissionGroups().flatMap((g) => g.keys), TEAM_PERMISSIONS) && permissionGroups().length === 4)
  }

  console.log("\nPresets and sensible defaults")
  {
    check("four presets: Full access, Content editor, Support, Custom", TEAM_PRESETS.join() === "full,content,support,custom")
    check("payouts and billing and the team are off in every preset", (["full", "content", "support"] as const).every((p) => OFF_BY_DEFAULT.every((k) => !presetPermissions(p).includes(k))) && same(OFF_BY_DEFAULT, ["payouts_billing", "team"]))
    check("Full access is everything open but money and the team", same(presetPermissions("full"), [...OPEN_TO_TEAM].filter((p) => !OFF_BY_DEFAULT.includes(p))))
    check("Support is orders and customers", same(presetPermissions("support"), ["orders", "customers"].filter((p) => OPEN_TO_TEAM.has(p as TeamPermission))))
    check("Custom starts from nothing", presetPermissions("custom").length === 0)
    check("a list reads back as its preset, else Custom", presetOf(presetPermissions("support")) === "support" && presetOf(["orders"]) === "custom" && presetOf([]) === "custom")
    check("a new invite starts on a preset that gives something", presetPermissions(defaultPreset()).length > 0)
  }

  console.log("\nRows from before part 320 keep what they could use")
  {
    check("a Manager is Orders", same(legacyPermissions("manager"), ["orders"]) && same(permissionsOfRow({ role: "manager" }), ["orders"]))
    check("Staff is nothing (it was never open to invite)", legacyPermissions("staff").length === 0)
    check("a row with the column reads the column, not the role", same(permissionsOfRow({ role: "manager", permissions: ["customers"] }), ["customers"]) && permissionsOfRow({ role: "manager", permissions: [] }).length === 0)
    check("the old role column is still given a value it accepts", legacyRoleFor(["orders"]) === "manager" && legacyRoleFor(["website", "products"]) === "staff")
    check("a missing column is told apart from a missing table", permissionsMissing({ code: "42703", message: 'column store_team_members.permissions does not exist' }) && !permissionsMissing({ code: "42P01", message: "relation does not exist" }))
  }

  console.log("\nAsking: permits, the sidebar, where a member lands")
  {
    check("a permission opens its area", permits(["orders"], "orders") && !permits(["orders"], "customers"))
    check("the store's own area (refunds, deleting it, anything unassigned) is never a member's", !permits([...TEAM_PERMISSIONS], "store"))
    check("a key that is not open yet is never honoured, even if a row holds it", TEAM_PERMISSIONS.filter((p) => !OPEN_TO_TEAM.has(p)).every((p) => !permits([p], p)))
    const paths: [string, string | null][] = [
      ["/app", null],
      ["/app/settings", null],
      ["/app/help/orders", null],
      ["/app/orders/abc", "orders"],
      ["/app/customers", "customers"],
      ["/app/analytics", "analytics"],
      ["/app/coupons/new", "marketing"],
      ["/app/offers", "marketing"],
      ["/app/emails/flow/x", "marketing"],
      ["/app/products/collections", "products"],
      ["/app/community/x/feed", "community"],
      ["/app/website-builder", "website"],
      ["/app/onepage", "onepage"],
      ["/creator-page", "creator_pages"],
      ["/app/payouts", "payouts_billing"],
      ["/app/settings/billing", "payouts_billing"],
      /* Changed on purpose (round 41 team): Store settings is Store details alone; Integrations and its keys stay the owner's. */
      ["/app/integrations", "store"],
      ["/app/something-new", "store"],
    ]
    const wrong = paths.filter(([p, a]) => areaOfPath(p) !== a)
    check("every dashboard address belongs to one area", wrong.length === 0, wrong.map(([p]) => [p, areaOfPath(p)]))
    check("the sidebar shows only what the permissions open", memberSees(["analytics"], "/app/analytics") && !memberSees(["analytics"], "/app/orders") && !memberSees(["analytics"], "/app"))
    check("a member lands on the first page they may use", homeFor(["analytics"]) === "/app/analytics" && homeFor(["orders", "analytics"]) === "/app/orders")
    check("  and on Settings › Team with nothing open (the stores they are on, and leaving)", homeFor([]) === "/app/settings?tab=team")
    check("a cached answer for their own store is never the one for the store they work in", viewerKey(ANA, null) === ANA && viewerKey(ANA, STORE) !== viewerKey(ANA, null))
  }

  console.log("\nWho may give what")
  {
    check("the owner may give everything open", same(grantable(true, []), [...OPEN_TO_TEAM]))
    check("a member with Team may give only what they have", same(grantable(false, ["team", "orders"]), ["team", "orders"].filter((p) => OPEN_TO_TEAM.has(p as TeamPermission))))
  }

  /* The fake database: an owner, a store, Ana on its team with Orders and Team, Ben with Orders. */
  const world = (ana: TeamPermission[] = ["orders", "team"]) =>
    fakeDb({
      creators: [
        { id: STORE, user_id: OWNER, slug: "shop", display_name: "Shop", avatar_url: null, subscription_plan_id: "pro" },
        { id: OTHER_STORE, user_id: BEN, slug: "bens", display_name: "Ben's", avatar_url: null, subscription_plan_id: null },
      ],
      store_team_members: [
        { id: ANA_ROW, creator_id: STORE, email: "ana@example.com", user_id: ANA, role: "manager", permissions: ana, status: "active", invited_at: new Date(Date.now() - 86400000).toISOString(), expires_at: null, accepted_at: new Date().toISOString() },
        { id: BEN_ROW, creator_id: STORE, email: "ben@example.com", user_id: BEN, role: "manager", permissions: ["orders"], status: "active", invited_at: new Date(Date.now() - 86400000).toISOString(), expires_at: null, accepted_at: new Date().toISOString() },
      ],
      store_settings: [],
      profiles: [{ id: OWNER, display_name: "Owner" }],
      seller_notifications: [],
      user_notifications: [],
    })

  console.log("\nThe server reads the permissions from the database")
  {
    const db = world()
    const ana = (await actingStoreIn(db as never, ANA, STORE)) as ActingStore
    check("working in the store: their permissions as the row holds them", !!ana && same(ana.permissions, normalizePermissions(["orders", "team"])) && ana.ownerUserId === OWNER && ana.memberId === ANA_ROW, ana)
    check("a cookie naming a store they are not on gets nothing", (await actingStoreIn(db as never, ANA, OTHER_STORE)) === null)
    check("a cookie that is not an id gets nothing", (await actingStoreIn(db as never, ANA, "../evil")) === null)
    const orders = await creatorFor(db as never, ANA, "orders", "id", ana)
    check("an area they have: the store's row", orders.kind === "store" && (orders.creator as { id: string }).id === STORE, orders)
    const analytics = await creatorFor(db as never, ANA, "analytics", "id", ana)
    check("an area they do not have: denied, never their own account in its place", analytics.kind === "denied", analytics)
    const own = await creatorFor(db as never, OWNER, "analytics", "id", null)
    check("the owner, in their own account: their store, as the owner", own.kind === "store" && own.role === "owner" && (own.creator as { id: string }).id === STORE)
    check("a signed link is checked again without the cookie", (await storeAccessOf(db as never, ANA, STORE, "orders")).ok === true && (await storeAccessOf(db as never, ANA, STORE, "analytics")).ok === false && (await storeAccessOf(db as never, OWNER, STORE, "analytics")).ok === true)
    /* Taken away: the next request reads the row again and finds less. */
    const db2 = world(["team"])
    const after = (await actingStoreIn(db2 as never, ANA, STORE)) as ActingStore
    check("a permission taken away is gone on the next request", !!after && !(await creatorFor(db2 as never, ANA, "orders", "id", after) as { kind: string }).kind.startsWith("store"))
  }

  console.log("\nInviting and changing access")
  {
    const db = world()
    const out = await inviteMember(db as never, { owner: { id: OWNER, email: "owner@example.com" }, email: "Cara@Example.com", permissions: ["orders", "customers", "refunds"] })
    check("the owner invites with permissions; unknown keys are dropped", out.ok === true && same(out.member.permissions, normalizePermissions(["orders", "customers"])), out)
    const wrote = (db as unknown as { log: { table: string; op: string; payload?: Record<string, unknown> }[] }).log.find((l) => l.table === "store_team_members" && l.op === "insert")
    check("  the row keeps the list and an old role the column accepts", !!wrote && Array.isArray(wrote.payload?.permissions) && ["manager", "staff"].includes(String(wrote.payload?.role)), wrote?.payload)
    const none = await inviteMember(world() as never, { owner: { id: OWNER, email: null }, email: "dan@example.com", permissions: [] })
    check("an invite that gives nothing is refused", none.ok === false && none.status === 400)
    const legacy = await inviteMember(world() as never, { owner: { id: OWNER, email: null }, email: "eve@example.com", role: "manager" })
    check("an older page sending a role still invites, as what the role could use", legacy.ok === true && same(legacy.member.permissions, ["orders"]))

    const anaScope = (await actingStoreIn(world() as never, ANA, STORE)) as ActingStore
    const byAna = await inviteMember(world() as never, { owner: { id: ANA, email: "ana@example.com" }, email: "fay@example.com", permissions: ["orders"], acting: anaScope })
    check("a member with Team invites to the store they work in", byAna.ok === true && byAna.member.creator_id === STORE, byAna)
    if (OPEN_TO_TEAM.has("customers")) {
      const beyond = await inviteMember(world() as never, { owner: { id: ANA, email: "ana@example.com" }, email: "gus@example.com", permissions: ["customers"], acting: anaScope })
      check("  but never with access they do not have", beyond.ok === false && beyond.status === 403, beyond)
    }
    const benActing = (await actingStoreIn(world() as never, BEN, STORE)) as ActingStore
    const byBen = await inviteMember(world() as never, { owner: { id: BEN, email: "ben@example.com" }, email: "hal@example.com", permissions: ["orders"], acting: benActing })
    check("a member without Team cannot invite", byBen.ok === false && byBen.status === 403, byBen)
    const scope = await teamScope(world() as never, ANA, anaScope)
    check("a member with Team manages the store's team, not the owner's other stores", scope.ok === true && scope.scope.store.id === STORE && scope.scope.byOwner === false && scope.scope.selfMemberId === ANA_ROW)

    const db3 = world()
    const changed = await updateMember(db3 as never, OWNER, BEN_ROW, { permissions: ["orders", "analytics"] })
    check("the owner changes a member's access", changed.ok === true && same(changed.member?.permissions ?? [], normalizePermissions(["orders", "analytics"])), changed)
    const told = (db3 as unknown as { log: { table: string; op: string }[] }).log.some((l) => l.table === "user_notifications")
    check("  and the member is told", told)
    check("access cannot be changed to nothing (remove them instead)", (await updateMember(world() as never, OWNER, BEN_ROW, { permissions: [] })).ok === false)
    check("a member cannot change their own access", (await updateMember(world() as never, ANA, ANA_ROW, { permissions: ["orders", "team"] }, anaScope)).ok === false)
    const anaEditsBen = await updateMember(world() as never, ANA, BEN_ROW, { permissions: ["orders", "team"] }, anaScope)
    check("a member with Team changes someone within their own access", anaEditsBen.ok === true, anaEditsBen)
    if (OPEN_TO_TEAM.has("analytics")) {
      const richer = world(["orders", "team"])
      const benMore = await updateMember(richer as never, OWNER, BEN_ROW, { permissions: ["orders", "analytics"] })
      const anaTries = await updateMember(richer as never, ANA, BEN_ROW, { remove: true }, anaScope)
      check("  but not someone who has more than they do", benMore.ok === true && anaTries.ok === false && anaTries.status === 403, anaTries)
    }
    const listed = await listTeam(world() as never, STORE)
    check("the team lists each member with their permissions", listed.ok === true && listed.members.every((m) => Array.isArray(m.permissions)))
  }

  console.log("\nThe invite says what they will be able to do")
  {
    const row = { id: ANA_ROW, creator_id: STORE, email: "ana@example.com", role: "manager" as const, permissions: ["orders", "customers"] as TeamPermission[], status: "invited" as const, user_id: null, expires_at: null }
    const state = inviteStateOf({ token: "Gr58y8yAGczyJXsxmNkRlWBo9ZyF8OPv", invite: row, store: { id: STORE, name: "Shop", avatarUrl: null, ownerUserId: OWNER, pro: true }, teamSize: 1, user: { id: ANA, email: "ana@example.com" }, hasAccount: true, now: Date.now() })
    check("the invite page's state carries the permissions", state.kind === "ready" && same(state.permissions, normalizePermissions(["orders", "customers"])))
    check("and lists them in words", permissionLinesEn(["orders", "customers"]).length === normalizePermissions(["orders", "customers"]).length && accessSummaryEn([]) === "No access yet")
    const mail = teamInviteEmail({ storeName: "Shop", permissions: ["orders"], email: "ana@example.com", link: "https://storelib.com/team/join?token=x" })
    check("the email says what they will be able to do", /be able to see, fulfil and ship orders/.test(mail.text), mail.text.slice(0, 300))
    const card = read("components/team/join-card.tsx")
    check("the join card lists the permissions, not a role", /RoleBox permissions=\{state\.permissions\}/.test(card) && !/ROLE_CAN/.test(card))
  }

  console.log("\nEvery page and route of an open area asks the one helper")
  {
    const routes: [string, RegExp][] = [
      ["app/api/analytics/reports/route.ts", /requireTeamPermission\("analytics"\)/],
      ["app/api/analytics/commerce/route.ts", /requireTeamPermission\("analytics"\)/],
      ["app/api/analytics/summary/route.ts", /requireTeamPermission\("analytics"\)/],
      ["app/api/analytics/layout/route.ts", /requireTeamPermission\("analytics"\)/],
      ["app/api/analytics/export/route.ts", /creatorFor<[^>]+>\(admin, userId, "analytics"/],
      ["app/api/coupons/write.ts", /requireTeamPermission\("marketing"\)/],
      ["app/api/store/offers/route.ts", /shopCaller\("marketing"\)/],
      ["app/api/store/offers/try/route.ts", /shopCaller\("marketing"\)/],
      ["app/api/invoice/route.ts", /storeIdFor\("orders"\)/],
      ["app/api/app/orders/export/route.ts", /creatorFor\(admin, user\.id, "orders"\)/],
    ]
    for (const [p, re] of routes) check(`${p} asks for its area`, re.test(read(p)))
    check("the export's signed link reads the membership again", /storeAccessOf\(admin, userId, linkStore, "analytics"\)/.test(read("app/api/analytics/export/route.ts")))
    check("no analytics route finds the store by the session's user_id any more", ["reports", "commerce", "summary", "layout"].every((r) => !/\.eq\("user_id", user\.id\)/.test(read(`app/api/analytics/${r}/route.ts`))))
    check("coupon routes all go through signedInCreator", /signedInCreator\(\)/.test(read("app/api/coupons/route.ts")) && (read("app/api/coupons/[id]/route.ts").match(/signedInCreator\(\)/g) ?? []).length >= 2)
    const pages: [string, string][] = [
      ["app/app/customers/page.tsx", "customers"],
      ["app/app/analytics/page.tsx", "analytics"],
      ["app/app/offers/page.tsx", "marketing"],
      ["app/app/coupons/load-coupons.ts", "marketing"],
    ]
    for (const [p, area] of pages) check(`${p} asks teamPageStore("${area}")`, read(p).includes(`teamPageStore("${area}")`))
    for (const p of ["app/app/customers/page.tsx", "app/app/analytics/page.tsx", "app/app/offers/page.tsx", "app/app/coupons/page.tsx", "app/app/coupons/new/page.tsx", "app/app/coupons/[id]/page.tsx", "app/app/orders/sales/page.tsx"]) {
      check(`${p} draws "You don't have access" when refused, not the page`, /<TeamAreaClosed area="[a-z_]+" store=\{[a-z.]+acting\.name\} permissions=\{[a-z.]+acting\.permissions\} \/>/.test(read(p)))
    }
    const server = read("lib/team/server.ts")
    check("the helper answers 401 signed out and 403 without the permission", /export async function requireTeamPermission\(area: TeamArea\)/.test(server) && /status: 401/.test(server) && /error: NO_ACCESS \}, \{ status: 403/.test(server))
    check("  and the permission is read from the database on each request (actingStoreIn)", /\.from\("store_team_members"\)\.select\(cols\)\.eq\("creator_id", chosen\)\.eq\("user_id", userId\)\.eq\("status", "active"\)/.test(server))
    check("refunds stay the owner's", /canRefund=\{found\.role === "owner"\}/.test(read("app/app/orders/sales/page.tsx")) && !/lib\/team/.test(read("app/api/stripe/refund/route.ts")))
    check("payouts and billing pages are not taught about the team: a member reads their own account there", !/lib\/team/.test(read("app/app/payouts/page.tsx")) && !/lib\/team/.test(read("app/app/settings/billing/page.tsx")))
  }

  console.log("\nThe screens follow")
  {
    const sidebar = read("components/app/sidebar.tsx")
    check("the sidebar filters by permissions, and lifts a row out of a group they cannot open", /memberSees\(teamPermissions, item\.href\)/.test(sidebar) && /memberSees\(teamPermissions, c\.href\)/.test(sidebar) && /const \{ icon \} = item/.test(sidebar))
    const bar = read("components/app/team-bar.tsx")
    check("a page outside their permissions is the access card, read from the path", /permits\(permissions, area\)/.test(bar) && /<TeamAreaClosed area=\{area \?\? "store"\} store=\{store\} permissions=\{permissions\} \/>/.test(bar))
    const closed = read("components/app/team-area-closed.tsx")
    check("the card says they don't have access and links to what they can use", /You don't have access to \{area\}/.test(closed) && /homeFor\(perms\)/.test(closed))
    const panel = read("components/app/settings/team-panel.tsx")
    check("the invite form sends permissions, chosen in the picker", /body: \{ email: cleanEmail, permissions: access \}/.test(panel) && /<PermissionPicker value=\{access\}/.test(panel))
    check("an existing member's access is changed in the same picker", /method: "PATCH", body: \{ permissions: next \}/.test(panel) && /<PermissionPicker key=\{editing\.id\} value=\{editAccess\}/.test(panel))
    const picker = read("components/app/settings/team-permissions.tsx")
    check("the picker has the presets, the groups, and says what is not open or not theirs to give", /TEAM_PRESETS\.map/.test(picker) && /permissionGroups\(\)\.map/.test(picker) && /Not open to the team yet/.test(picker) && /Only the owner can give this/.test(picker))
    check("the layout hands the shell the member's permissions", /teamPermissions=\{teamStore && acting \? acting\.permissions : null\}/.test(read("app/app/layout.tsx")) && /permissions=\{acting\.permissions\}/.test(read("app/app/layout.tsx")))
    check("Home sends a member to the first page they may use", /redirect\(homeFor\(acting\.permissions\)\)/.test(read("app/app/page.tsx")))
    check("search shows a member only the groups they may open", /permits\(acting\.permissions, GROUP_AREA\[g\]\)/.test(read("app/api/app/search/route.ts")))
  }

  console.log("\nThe SQL (part 320)")
  {
    const sql = read("supabase/sql/run-now/320_team_permissions.sql")
    check("the run-now part and the migration are the same text", sql === read("supabase/migrations/20271028_team_permissions.sql"))
    check("adds the column only when it is not there", /ADD COLUMN IF NOT EXISTS permissions text\[\]/.test(sql))
    check("everyone already on a team keeps what they could use: a Manager Orders, Staff nothing", /SET permissions = CASE WHEN role = 'manager' THEN ARRAY\['orders'\]::text\[\] ELSE '\{\}'::text\[\] END WHERE permissions IS NULL/.test(sql))
    check("only known keys, the constraint added once", /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'store_team_members_permissions_check'/.test(sql) && TEAM_PERMISSIONS.every((k) => sql.includes(`'${k}'`)))
    check("still server only: row level security on, nothing for the browser", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.store_team_members FROM PUBLIC, anon, authenticated/.test(sql))
    check("skips itself, said, before part 135", /to_regclass\('public\.store_team_members'\) IS NULL THEN RAISE NOTICE/.test(sql))
    check("the check after knows it", /as p320_team_permissions/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("the README lists it", /\| `320_team_permissions\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
