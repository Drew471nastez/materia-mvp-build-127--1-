/**
 * Round 42: the last four areas open to a team member, the way round 40/41
 * opened Products, the OnePage and Community.
 *
 *   Website       lib/team/website: every website route and page asks
 *                 websiteCaller / websiteInstallCaller / websitePage, a site
 *                 in the URL is checked to be the store's, and a member's
 *                 pictures go into the store owner's folder.
 *   Creator page  lib/team/creator-page: the store owner's profile and page,
 *                 edited in place by a member with Creator page.
 *   Payouts       lib/team/money: payouts (see) and payouts_manage (cash out,
 *                 change the bank). Setting the Stripe account up stays the
 *                 owner's whatever is given.
 *   Billing       billing (see) and billing_manage (change the plan, the card).
 *
 * Each area: allowed (owner, member with it), forbidden (member without it,
 * member with "see" asking to change), cross-store (a site or a store that
 * is not the one the member works in).
 *
 *   npx tsx --conditions=react-server tests/team-areas-r42.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import {
  MANAGE_NEEDS,
  OFF_BY_DEFAULT,
  OPEN_TO_TEAM,
  PERMISSION_HINT,
  RETIRED_PERMISSIONS,
  areaOfPath,
  homeFor,
  memberSees,
  normalizePermissions,
  permissionGroups,
  permissionsOfRow,
  permits,
  presetPermissions,
  togglePermission,
  type TeamPermission,
} from "@/lib/team/permissions"
import type { ActingStore } from "@/lib/team/server"
import { areaStoreFor, storeInstall, teamActionRow } from "@/lib/team/areas"
import { creatorPageStoreFor } from "@/lib/team/creator-page"
import { moneyPermission, moneyStoreFor, paymentsActionLevel } from "@/lib/team/money"
import { memberSettingsTabs } from "@/lib/team/settings"
import { teamUploadPathOk } from "@/lib/team/uploads"
import { TEAM_ACTOR_KEY } from "@/lib/team/audit"

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
const OTHER_OWNER = "33333333-3333-4333-8333-333333333333"
const STORE = "44444444-4444-4444-8444-444444444444"
const ANA_STORE = "66666666-6666-4666-8666-666666666666"
const OTHER_STORE = "99999999-9999-4999-8999-999999999999"
const SITE = "bbbbbbbb-0000-4000-8000-000000000001"
const OTHER_SITE = "bbbbbbbb-0000-4000-8000-000000000002"

const acting = (permissions: TeamPermission[], creatorId = STORE, ownerUserId: string | null = OWNER): ActingStore => ({ creatorId, name: "Shop", ownerUserId, role: "staff", permissions, memberId: "55555555-5555-4555-8555-555555555555" })
const world = () =>
  fakeDb({
    creators: [
      { id: STORE, user_id: OWNER },
      { id: ANA_STORE, user_id: ANA },
      { id: OTHER_STORE, user_id: OTHER_OWNER },
    ],
    store_theme_installs: [
      { id: SITE, creator_id: STORE, name: "Shop site" },
      { id: OTHER_SITE, creator_id: OTHER_STORE, name: "Other" },
    ],
  })

async function main() {
  console.log("\nThe permissions")
  {
    check("every key is open to the team now", ["website", "creator_pages", "payouts", "payouts_manage", "billing", "billing_manage"].every((p) => OPEN_TO_TEAM.has(p as TeamPermission)))
    check("the old payouts_billing key is gone and never kept", !normalizePermissions(["payouts_billing"]).length)
    /* A member saved before round 42 with the old key: exactly what they had (it was never open, so nothing of money), never Payouts or Billing in its place. */
    const oldRow = permissionsOfRow({ permissions: ["orders", "payouts_billing", "products"], role: "manager" })
    check("a member with the old payouts_billing key keeps exactly what they had, nothing of money", same(oldRow, ["orders", "products"]) && !oldRow.some((p) => ["payouts", "payouts_manage", "billing", "billing_manage"].includes(p)), oldRow)
    check("  and the money areas refuse them", !permits(oldRow, "payouts") && !permits(oldRow, "billing") && RETIRED_PERMISSIONS.includes("payouts_billing"))
    const oldStore = await moneyStoreFor(world(), ANA, "payouts", "view", acting(oldRow))
    check("  even on the server, read as the row holds it", oldStore.kind === "denied")
    check("money is never in a preset", (["full", "content", "support"] as const).every((p) => !presetPermissions(p).some((k) => ["payouts", "payouts_manage", "billing", "billing_manage"].includes(k))) && OFF_BY_DEFAULT.includes("billing_manage"))
    check("Content editor gives the website and the creator page too", same(presetPermissions("content"), ["website", "onepage", "creator_pages", "products", "community"]))
    check("changing gives seeing: payouts_manage keeps payouts, billing_manage keeps billing", same(normalizePermissions(["payouts_manage"]), ["payouts", "payouts_manage"]) && same(normalizePermissions(["billing_manage"]), ["billing", "billing_manage"]))
    check("  ticking Change payouts ticks Payouts", same(togglePermission([], "payouts_manage", true), ["payouts", "payouts_manage"]))
    check("  unticking Payouts unticks Change payouts", same(togglePermission(["payouts", "payouts_manage", "orders"], "payouts", false), ["orders"]))
    check("  unticking Change billing keeps Billing", same(togglePermission(["billing", "billing_manage"], "billing_manage", false), ["billing"]))
    check("the pairs are the two money ones", same(Object.keys(MANAGE_NEEDS), ["payouts_manage", "billing_manage"]))
    check("the invite form has a Money group with the four, each with a line that says what it allows", permissionGroups().some((g) => g.id === "money" && same(g.keys, ["payouts", "payouts_manage", "billing", "billing_manage"])) && ["payouts", "payouts_manage", "billing", "billing_manage"].every((k) => PERMISSION_HINT[k as TeamPermission].length > 10))
    const picker = read("components/app/settings/team-permissions.tsx")
    check("the picker keeps each pair whole and draws Change under its Seeing", /togglePermission\(value, p, on\)/.test(picker) && /MANAGE_NEEDS\[p\] && "ml-\[26px\]"/.test(picker))
    check("addresses: Payouts is seeing, Settings › Payments is changing, Plan is billing", areaOfPath("/app/payouts") === "payouts" && areaOfPath("/app/settings/payments") === "payouts_manage" && areaOfPath("/app/settings/billing/upgrade") === "billing")
    check("the sidebar shows the website, the creator page and Payouts to a member who has them", memberSees(["website"], "/app/website-builder") && memberSees(["creator_pages"], "/creator-page") && memberSees(["payouts"], "/app/payouts") && !memberSees(["billing"], "/app/payouts"))
    check("Storelib AI's sites stay the owner's (kept under row level security by account)", areaOfPath("/app/sites") === "store")
    check("a member with only Payouts lands on Payouts; only Billing, on Plan", homeFor(["payouts"]) === "/app/payouts" && homeFor(["billing"]) === "/app/settings?tab=billing")
    check("Settings shows Plan with Billing, Payments with Change payouts", same(memberSettingsTabs(["billing"]), ["billing"]) && same(memberSettingsTabs(["payouts"]), []) && same(memberSettingsTabs(["payouts_manage"]), ["payments"]) && same(memberSettingsTabs(["settings", "billing"]), ["store", "billing"]))
    check("  and hides Plan from a member without Billing (it is the store's plan there)", /STORE_SIDE_ACCOUNT_TABS\.includes\(tab\.id\)/.test(read("components/app/settings-form-new.tsx")))
  }

  console.log("\nWebsite: whose store")
  {
    const db = world()
    const own = await areaStoreFor(db, db, OWNER, "website", null)
    check("the owner: their own store, their own client", own.kind === "store" && own.creatorId === STORE && own.isOwner && (own.db as unknown) === db, own)
    const member = await areaStoreFor(db, db, ANA, "website", acting(["website"]))
    check("a member with Website: the store, never their own", member.kind === "store" && member.creatorId === STORE && !member.isOwner && member.ownerUserId === OWNER, member)
    check("  through a client that names them on record lines", member.kind === "store" && (member.db as unknown) !== db)
    const without = await areaStoreFor(db, db, ANA, "website", acting(["products"]))
    check("a member without Website: refused, never their own store in its place", without.kind === "denied")
    const elsewhere = await areaStoreFor(db, db, ANA, "website", acting(["website"], OTHER_STORE, OTHER_OWNER))
    check("the store is the one the membership names, read from the database", elsewhere.kind === "store" && elsewhere.creatorId === OTHER_STORE)
    check("a site of the store: yes", (await storeInstall(db, STORE, SITE)).ok === true)
    const cross = await storeInstall(db, STORE, OTHER_SITE)
    check("another store's site, named in the URL: Theme not found", cross.ok === false && cross.status === 404)
    check("  and a site id that is not an id never reaches the database", (await storeInstall(db, STORE, "../x")).ok === false)
    const ownCross = await storeInstall(db, ANA_STORE, SITE)
    check("the member's own store cannot open the store's site either", ownCross.ok === false)
  }

  console.log("\nWebsite: every route and page asks")
  {
    const T = "app/api/website-builder/themes/[installId]"
    const installRoutes = ["route.ts", "settings/route.ts", "sections/route.ts", "sections/sync-global/route.ts", "files/route.ts", "publish/route.ts", "backups/route.ts", "backups/[backupId]/restore/route.ts", "releases/route.ts", "releases/[releaseId]/restore/route.ts", "preview/route.ts", "cover/route.ts", "focus/route.ts", "performance/route.ts", "performance/lab/route.ts", "security/route.ts"].map((r) => `${T}/${r}`)
    for (const r of installRoutes) {
      const src = read(r)
      check(`${r.replace(T, "…/[installId]")} asks websiteInstallCaller, never the account's own row`, /websiteInstallCaller/.test(src) && !/\.from\("creators"\)[\s\S]{0,40}\.eq\("user_id", user\.id\)/.test(src))
    }
    const storeRoutes = ["app/api/website-builder/themes/route.ts", "app/api/website-builder/themes/add/route.ts", `${T}/duplicate/route.ts`, "app/api/website-builder/menus/route.ts", "app/api/website-builder/products/route.ts", "app/api/website-builder/cart-offers/route.ts", "app/api/website-builder/site-password/route.ts", "app/api/website-builder/performance/route.ts", "app/api/website-builder/files/route.ts", "app/api/website-builder/initialize/route.ts"]
    for (const r of storeRoutes) check(`${r.replace("app/api/website-builder/", "…/")} asks websiteCaller`, /websiteCaller\(\)/.test(read(r)) && !/\.eq\("user_id", user\.id\)/.test(read(r)))
    check("the builder's collection picker reads for Website, making one is Products'", /shopCaller\(\["website", "products"\]\)/.test(read("app/api/website-builder/collections/route.ts")) && /shopCaller\("products"\)/.test(read("app/api/website-builder/collections/route.ts")))
    check("deleting a website stays the owner's", /if \(!isOwner\) return NextResponse\.json\(\{ error: OWNER_KEEPS_SITE \}, \{ status: 403 \}\)/.test(read(`${T}/route.ts`)))
    check("the owner's handle and covers are the store owner's, for a member too", /eq\("id", ownerUserId!\)/.test(read(`${T}/route.ts`)) && /userId: who\.ownerUserId/.test(read(`${T}/cover/route.ts`)) && /access\.ownerUserId,/.test(read("app/app/website-builder/page.tsx")))
    for (const p of ["app/app/website-builder/page.tsx", "app/app/website-builder/navigation/page.tsx", "app/app/website-builder/themes/page.tsx"]) check(`${p} asks websitePage`, /await websitePage\(\)/.test(read(p)) && !/eq\("user_id", user\.id\)/.test(read(p)))
    check("what stays the owner's keeps asking by account: GitHub, a Supabase project, agent tokens, Ask Storelib's AI, export, import", ["github/route.ts", "agent-connections/route.ts", "agent/route.ts", "chat/route.ts", "export/route.ts"].every((r) => !/lib\/team\/website/.test(read(`${T}/${r}`))) && !/lib\/team\/website/.test(read("app/api/website-builder/themes/import/route.ts")))
    check("a member's picture goes into the store owner's folder, signed by the server when storage refuses", /setWebsiteUploadOwner\(typeof data\.storeOwner === "string"/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /storeOwner: isOwner \? null : ownerUserId/.test(read(`${T}/route.ts`)) && /\$\{owner \?\? user\.id\}\/\$\{folder\}/.test(read("components/website-builder/editor/image-picker.tsx")) && /teamSignedUpload\(bucket, filePath, body, file\.type\)/.test(read("components/website-builder/editor/image-picker.tsx")))
    check("  storage signs that path only for Website in the store owner's folder", teamUploadPathOk(acting(["website"]), "store-builder-images", `${OWNER}/theme-images/1.jpg`) && !teamUploadPathOk(acting(["website"]), "store-builder-images", `${OTHER_OWNER}/theme-images/1.jpg`) && !teamUploadPathOk(acting(["orders"]), "store-builder-images", `${OWNER}/theme-images/1.jpg`))
    const editorSrc = read("app/website-builder/editor/[installId]/page.tsx")
    check("the editor knows a team member from the install's read, and offers them none of the owner's controls", /setTeamMember\(typeof data\.storeOwner === "string"\)/.test(editorSrc) && /\{!isMobileView && !teamMember && askButton\}/.test(editorSrc) && /\{isMobileView && !teamMember && askButton\}/.test(editorSrc) && /aiMounted && !teamMember/.test(editorSrc) && /\{!isMobileView && !teamMember && \(\s*<ConnectionButton/.test(editorSrc) && /\.\.\.\(teamMember \? \[\] : \[\s*\{\s*label: githubRepo/.test(editorSrc) && (editorSrc.match(/onAskAi=\{teamMember \? undefined :/g) ?? []).length === 2 && /if \(teamMember\) return\s*openConnections\(\)/.test(editorSrc) && /teamMember=\{teamMember\}/.test(editorSrc))
    check("  Website settings lists no Connections for them (GitHub, Supabase, agent tokens, an AI key)", /teamMember \? SETTINGS_SECTIONS\.filter\(\(s\) => s\.id !== "connections"\)/.test(read("components/website-builder/project-settings.tsx")) && /section === "connections" && !teamMember/.test(read("components/website-builder/project-settings.tsx")))
    check("  the code editor offers no Solve with AI to them", /setTeamMember\(typeof data\.storeOwner === "string"\)/.test(read("app/website-builder/code/[installId]/page.tsx")) && /\{teamMember \? null : \(\s*<button\s*type="button"\s*onClick=\{\(\) => void solveWithAi\(\)\}/.test(read("app/website-builder/code/[installId]/page.tsx")))
    const listSrc = read("app/app/website-builder/website-builder-client.tsx")
    check("  the Website page offers them no Import, Export or Remove", /teamMember=\{!access\.isOwner\}/.test(read("app/app/website-builder/page.tsx")) && /\.\.\.\(teamMember \? \[\] : \[\{ label: tt\("Export theme"\)/.test(listSrc) && /installs\.length > 1 && !teamMember/.test(listSrc) && /\{teamMember \? null : \(\s*<Button\s*variant="ghost"/.test(listSrc) && /if \(teamMember\) return\n/.test(listSrc) && /onDrop=\{teamMember \? undefined : onLibraryDrop\}/.test(listSrc))
    check("publishing and restoring by a member are on the record", /recordTeamAction\(site, user\.id, "website", "website_published"/.test(read(`${T}/publish/route.ts`)) && /"website_restored"/.test(read(`${T}/releases/[releaseId]/restore/route.ts`)) && /"website_restored"/.test(read(`${T}/backups/[backupId]/restore/route.ts`)))
  }

  console.log("\nCreator page")
  {
    const db = world()
    const own = await creatorPageStoreFor(db, db, OWNER, null)
    check("the owner: their own profile and store", own.kind === "page" && own.profileId === OWNER && own.creatorId === STORE && own.isOwner, own)
    const member = await creatorPageStoreFor(db, db, ANA, acting(["creator_pages"]))
    check("a member with Creator page: the store owner's profile and the store, never their own", member.kind === "page" && member.profileId === OWNER && member.creatorId === STORE && !member.isOwner, member)
    check("a member without it: refused", (await creatorPageStoreFor(db, db, ANA, acting(["website"]))).kind === "denied")
    const noStore = await creatorPageStoreFor(fakeDb({ creators: [] }), fakeDb({ creators: [] }), ANA, null)
    check("an account with no store still changes its own name, as before", noStore.kind === "page" && noStore.profileId === ANA && noStore.creatorId === null)
    for (const r of ["app/api/creator-profile/route.ts", "app/api/store-builder/route.ts", "app/api/store-builder/apply-theme-globally/route.ts", "app/api/store-builder/preview/route.ts"]) {
      const src = read(r)
      check(`${r} asks creatorPageStore and writes by its profile and store`, /creatorPageStore\(supabase, user\.id\)/.test(src) && !/\.eq\("user_id", user\.id\)/.test(src) && !/\.eq\("id", user\.id\)/.test(src))
    }
    check("the preview of a store named in the URL: only the one the caller works in", /page\.creatorId !== creatorId/.test(read("app/api/store-builder/preview/route.ts")))
    /* Round 49: asked after load (the page is one HTML for everybody), by the route the page's owner controls read. */
    check("the page's own owner controls show for a member with Creator page in this very store", /teamStoreIdFor\(user\.id, "creator_pages"\)/.test(read("app/api/creator-page/viewer/route.ts")) && /teamStore === row\.id/.test(read("app/api/creator-page/viewer/route.ts")))
    for (const p of ["app/creator-page/layout.tsx", "app/creator-page/page.tsx", "app/creator-page/sections/page.tsx"]) check(`${p} asks creatorPagePage`, /await creatorPagePage\(\)/.test(read(p)))
    check("  a member without it is shown the access card there (no team bar outside /app)", /<TeamAreaClosed area="creator_pages"/.test(read("app/creator-page/layout.tsx")))
    check("a member's change and publish are on the record", /"creator_page_changed"/.test(read("app/api/creator-profile/route.ts")) && /"creator_page_changed", \{ action: "publish"/.test(read("app/api/store-builder/route.ts")))
  }

  console.log("\nPayouts and billing: whose store, and at which level")
  {
    check("the four levels", moneyPermission("payouts", "view") === "payouts" && moneyPermission("payouts", "manage") === "payouts_manage" && moneyPermission("billing", "view") === "billing" && moneyPermission("billing", "manage") === "billing_manage")
    const db = world()
    const own = await moneyStoreFor(db, OWNER, "billing", "manage", null)
    check("the owner: every level of their own store", own.kind === "store" && own.creatorId === STORE && own.isOwner && own.ownerUserId === OWNER)
    const view = await moneyStoreFor(db, ANA, "payouts", "view", acting(["payouts"]))
    check("a member with Payouts sees the store's payouts, by the store owner's account", view.kind === "store" && view.creatorId === STORE && view.ownerUserId === OWNER && !view.isOwner)
    check("  and may not cash out or change the bank", (await moneyStoreFor(db, ANA, "payouts", "manage", acting(["payouts"]))).kind === "denied")
    check("a member with Change payouts may", (await moneyStoreFor(db, ANA, "payouts", "manage", acting(normalizePermissions(["payouts_manage"])))).kind === "store")
    check("a member with Billing sees the plan, never changes it", (await moneyStoreFor(db, ANA, "billing", "view", acting(["billing"]))).kind === "store" && (await moneyStoreFor(db, ANA, "billing", "manage", acting(["billing"]))).kind === "denied")
    check("Payouts gives nothing of billing, and the other way", (await moneyStoreFor(db, ANA, "billing", "view", acting(["payouts", "payouts_manage"]))).kind === "denied" && (await moneyStoreFor(db, ANA, "payouts", "view", acting(["billing", "billing_manage"]))).kind === "denied")
    check("a member without either: refused, never their own store's money in its place", (await moneyStoreFor(db, ANA, "payouts", "view", acting(["orders"]))).kind === "denied")
    const cross = await moneyStoreFor(db, ANA, "payouts", "view", acting(["payouts"], OTHER_STORE, OTHER_OWNER))
    check("cross-store: only the store the membership names (the cookie is read again from the database)", cross.kind === "store" && cross.creatorId === OTHER_STORE && cross.ownerUserId === OTHER_OWNER)
    check("a store that is gone answers nothing", (await moneyStoreFor(fakeDb({ creators: [] }), ANA, "payouts", "view", acting(["payouts"]))).kind === "none")
    check("Setting up the payment account is the owner's whatever is given", ["start", "begin", "details", "document", "identity", "prepare", "details-form", "hosted-setup", "disconnect"].every((a) => paymentsActionLevel(a, {}) === "owner") && paymentsActionLevel("component", { purpose: "stripe_onboarding" }) === "owner" && paymentsActionLevel("app-sheet", { form: "setup" }) === "owner")
    check("  the bank and Stripe's payouts form are Change payouts; reading where it is, Payouts", paymentsActionLevel("bank", {}) === "manage" && paymentsActionLevel("component", { purpose: "stripe_payouts" }) === "manage" && paymentsActionLevel("app-sheet", { form: "bank" }) === "manage" && paymentsActionLevel("overview", {}) === "view" && paymentsActionLevel("refresh", {}) === "view")
    check("permits is what decides, as everywhere", permits(["payouts_manage"], "payouts_manage") && !permits(["payouts"], "payouts_manage"))
  }

  console.log("\nPayouts and billing: every route asks, at its level")
  {
    const routes: [string, "payouts" | "billing", "view" | "manage"][] = [
      ["app/api/stripe/payouts/route.ts", "payouts", "view"],
      ["app/api/stripe/payout-method/route.ts", "payouts", "view"],
      ["app/api/stripe/seller-balance/route.ts", "payouts", "view"],
      ["app/api/stripe/revenue-chart/route.ts", "payouts", "view"],
      ["app/api/stripe/tax-summary/route.ts", "payouts", "view"],
      ["app/api/stripe/connect/status/route.ts", "payouts", "view"],
      ["app/api/stripe/cashout/route.ts", "payouts", "manage"],
      ["app/api/billing/overview/route.ts", "billing", "view"],
      ["app/api/billing/invoices/route.ts", "billing", "view"],
      ["app/api/billing/subscription/route.ts", "billing", "view"],
      ["app/api/billing/checkout/status/route.ts", "billing", "view"],
      ["app/api/billing/customer-portal/route.ts", "billing", "manage"],
      ["app/api/billing/payment-method/route.ts", "billing", "manage"],
      ["app/api/billing/checkout/setup/route.ts", "billing", "manage"],
      ["app/api/billing/subscription/cancel/route.ts", "billing", "manage"],
      ["app/api/billing/subscription/change/route.ts", "billing", "manage"],
      ["app/api/billing/subscription/create/route.ts", "billing", "manage"],
      ["app/api/billing/subscription/resume/route.ts", "billing", "manage"],
    ]
    for (const [r, kind, level] of routes) {
      const src = read(r)
      check(`${r.replace("app/api/", "")}: moneyCaller("${kind}", "${level}"), the store's row by its id`, src.includes(`moneyCaller("${kind}", "${level}"`) && !/\.eq\("user_id", user\.id\)/.test(src) && !/moneyCaller\("[a-z]+", "view"\)/.test(level === "manage" ? src : ""))
    }
    const settings = read("app/api/settings/payouts/route.ts")
    check("settings/payouts: reading is Payouts, changing is Change payouts", /export async function POST[\s\S]*?moneyCaller\("payouts", "manage"\)/.test(settings) && /export async function GET[\s\S]*?moneyCaller\("payouts", "view"\)/.test(settings))
    check("the Stripe customer of a plan change is the store owner's account and email, never the member's", ["customer-portal", "payment-method", "checkout/setup", "subscription/create"].every((r) => /userId: who\.ownerUserId/.test(read(`app/api/billing/${r}/route.ts`)) && /email: who\.ownerEmail/.test(read(`app/api/billing/${r}/route.ts`))))
    check("the payments hub asks paymentsActionLevel and refuses the setup to a member", /paymentsActionLevel\(action, body\)/.test(read("app/api/payments/[action]/route.ts")) && /if \(level === "owner" && !who\.isOwner\)/.test(read("app/api/payments/[action]/route.ts")))
    check("a cash out tells the store owner, whoever pressed it", /userId: who\.ownerUserId,/.test(read("app/api/stripe/cashout/route.ts")))
    check("refunds stay the owner's", !/lib\/team/.test(read("app/api/stripe/refund/route.ts")))
    check("money changes are on the record: cash out, the bank, the schedule, the plan, the card, cancel, resume", /"payout_cashed_out"/.test(read("app/api/stripe/cashout/route.ts")) && /"payout_account_opened"/.test(read("app/api/payments/[action]/route.ts")) && /"payout_schedule_changed"/.test(settings) && (read("app/api/billing/subscription/change/route.ts").match(/"billing_plan_changed"/g) ?? []).length === 3 && /"billing_cancelled"/.test(read("app/api/billing/subscription/cancel/route.ts")) && /"billing_resumed"/.test(read("app/api/billing/subscription/resume/route.ts")) && /"billing_payment_method_changed"/.test(read("app/api/billing/payment-method/route.ts")))
    check("  never in a preview of a plan change", !/if \(previewOnly\) \{\s*await recordTeamAction/.test(read("app/api/billing/subscription/change/route.ts")))
    const row = teamActionRow({ creatorId: STORE, memberUserId: ANA, area: "billing_manage", action: "billing_plan_changed", detail: { plan_id: "growth" } })
    check("the record line names the member, the store and the area", row.event_type === "team_billing_plan_changed" && row.metadata[TEAM_ACTOR_KEY] === ANA && row.metadata.creator_id === STORE && row.metadata.area === "billing_manage" && (row.metadata as Record<string, unknown>).plan_id === "growth")
    check("  and the member cannot overwrite who they are with the detail", teamActionRow({ creatorId: STORE, memberUserId: ANA, area: "payouts_manage", action: "payout_cashed_out", detail: { team_member_user_id: OWNER, creator_id: OTHER_STORE } }).metadata[TEAM_ACTOR_KEY] === ANA)
  }

  console.log("\nPayouts and billing: the pages")
  {
    const page = read("app/app/payouts/page.tsx")
    check("Payouts reads the store for a member with Payouts, by the store's id", /teamPageStore\("payouts"\)/.test(page) && /\.eq\("id", access\.creatorId\)/.test(page))
    check("  Cash out and the bank are drawn only with Change payouts", /canManage=\{canManage\}/.test(page) && /payoutsEnabled && canManage \?/.test(read("app/app/payouts/payouts-client.tsx")) && /if \(!canManage\) return;/.test(read("app/app/payouts/payouts-client.tsx")))
    check("  and a member is never shown the payment account's setup", /canManage && access\.isOwner \? \(\s*<StorelibPaymentsInline/.test(page))
    check("Plan: the overview says whether the buttons show, and the tab hides them without Change billing", /canManage \}/.test(read("app/api/billing/overview/route.ts")) && /const readOnly = initialData\.canManage === false/.test(read("components/app/billing/billing-page-client.tsx")))
    check("the upgrade page asks for Change billing", /teamPageStore\("billing_manage"\)/.test(read("app/app/settings/billing/upgrade/page.tsx")))
  }

  console.log("\nThe SQL (part 333)")
  {
    const sql = read("supabase/sql/run-now/333_team_money_areas.sql")
    check("the run-now part and the migration are the same text", sql === read("supabase/migrations/20271030_team_money_areas.sql"))
    check("the constraint knows every key, and still the old one, so no row stops being valid", ["website", "creator_pages", "payouts", "payouts_manage", "billing", "billing_manage", "payouts_billing"].every((k) => sql.includes(`'${k}'`)) && /DROP CONSTRAINT IF EXISTS store_team_members_permissions_check/.test(sql))
    check("team_store_ids answers for the new keys, security definer, never anon", /create or replace function public\.team_store_ids/.test(sql) && /security definer set search_path = public/.test(sql) && /REVOKE ALL ON FUNCTION public\.team_store_ids\(text\) FROM PUBLIC, anon/.test(sql))
    check("skips itself, said, before parts 135 and 320", /RAISE NOTICE 'part 333: store_team_members is not here yet/.test(sql) && /RAISE NOTICE 'part 333: store_team_members\.permissions is not here yet/.test(sql))
    check("writes no row and adds no policy", !/UPDATE public\.|INSERT INTO|CREATE POLICY/.test(sql))
    check("the check after and the README know it", /as p333_team_money_areas/.test(read("supabase/sql/run-now/99_check_after.sql")) && /\| `333_team_money_areas\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
