/**
 * Round 41, "finish what's still needed": the areas still closed to a team
 * member after round 40, opened where it could be done properly, and the
 * member gaps that were left.
 *
 *   Products        open. Pages read the store through teamPageStore
 *                   ("products"); routes ask shopCaller("products") or
 *                   requireTeamPermission("products"); the editor's browser
 *                   writes go under SQL part 327 (team_can on the product
 *                   tables, a trigger that keeps a product in its store, no
 *                   delete from the browser). Pictures and files go into the
 *                   store's folder. Deleting a product with sales archives it,
 *                   for the member as for the owner.
 *   Store settings  open as Settings › Store details alone: name, contact,
 *                   phone, logo (lib/team/settings). Everything else in
 *                   Settings stays the owner's.
 *   Still closed    the website builder and the creator page (pinned below,
 *                   with why), and payouts and billing for good.
 *   OnePage gaps    uploads into the page owner's folder, the integrations
 *                   and tags panels read the store's (keys stay the owner's),
 *                   the preview's owner name and photo come with the page.
 *   Record lines    a member's client names them on the order's timeline,
 *                   the security events and the community's log.
 *
 *   npx tsx --conditions=react-server tests/team-areas-r41.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { OPEN_TO_TEAM, areaOfPath, memberSees, normalizePermissions, permits, presetPermissions, homeFor, type TeamPermission } from "@/lib/team/permissions"
import type { ActingStore } from "@/lib/team/server"
import { PRODUCT_FILE_AREAS, TEAM_BUCKET_AREAS, UPLOAD_AREAS, mayUploadProductFile, productCreatorFor, teamUploadPathOk, uploadStoreOf } from "@/lib/team/uploads"
import { TEAM_ACTOR_KEY, TEAM_STAMPED, stampTeamRow, teamStampDb } from "@/lib/team/audit"
import { TEAM_AUDIT_KEY } from "@/lib/communities/server/team"
import { MEMBER_STORE_SETTING_KEYS, memberMaySave, memberSettingsTabs } from "@/lib/team/settings"
import { memberMayStep } from "@/lib/onepage/integrations/team-steps"
import { sellersReview } from "@/lib/reviews/access"
import { ownerOf } from "@/lib/courses/manage"

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
const STORE = "44444444-4444-4444-8444-444444444444"
const ANA_STORE = "66666666-6666-4666-8666-666666666666"
const OTHER_STORE = "99999999-9999-4999-8999-999999999999"
const PRODUCT = "aaaaaaaa-0000-4000-8000-000000000001"
const OTHER_PRODUCT = "aaaaaaaa-0000-4000-8000-000000000004"
const R1 = "dddddddd-0000-4000-8000-000000000001"
const R2 = "dddddddd-0000-4000-8000-000000000002"

const acting = (permissions: TeamPermission[], ownerUserId: string | null = OWNER): ActingStore => ({ creatorId: STORE, name: "Shop", ownerUserId, role: "staff", permissions, memberId: "55555555-5555-4555-8555-555555555555" })

async function main() {
  console.log("\nWhat is open now")
  {
    check("Products and Store settings are open to the team", OPEN_TO_TEAM.has("products") && OPEN_TO_TEAM.has("settings"))
    /* Changed on purpose (round 42 team): the website, the creator page, payouts and billing opened (tests/team-areas-r42.test.ts). */
    check("the website and the creator page are open now", OPEN_TO_TEAM.has("website") && OPEN_TO_TEAM.has("creator_pages"))
    check("payouts and billing stay the owner's", !OPEN_TO_TEAM.has("payouts_billing" as never) && !normalizePermissions(["payouts_billing" as never]).length)
    check("an invite keeps Products, Store settings and the website", same(normalizePermissions(["products", "settings", "website"]), ["website", "products", "settings"])) // Changed on purpose (round 42 team)
    check("Content editor now gives Products too", same(presetPermissions("content"), ["website", "onepage", "creator_pages", "products", "community"])) // Changed on purpose (round 42 team)
    check("Full access gives Products and Store settings, never money or the team", presetPermissions("full").includes("products") && presetPermissions("full").includes("settings") && !presetPermissions("full").includes("payouts_billing" as never) && !presetPermissions("full").includes("team"))
    check("the sidebar shows every Products page to a member who has it", ["/app/products", "/app/products/collections", "/app/inventory", "/app/reviews", "/app/files", "/app/memberships"].every((h) => memberSees(["products"], h)) && !memberSees(["onepage"], "/app/products"))
    check("a member with Products lands on Products", homeFor(["products"]) === "/app/products")
    check("Integrations is the owner's now (Store settings is Store details alone)", areaOfPath("/app/integrations") === "store" && !memberSees(["settings"], "/app/integrations"))
    check("the picker's \"Not open to the team yet\" follows the same set", /!open\.includes\(p\) \? tt\("Not open to the team yet"\)/.test(read("components/app/settings/team-permissions.tsx")))
  }

  console.log("\nStill closed, and why (opening one is a decision)")
  {
    const builderRoutes = ["app/api/website-builder/themes/route.ts", "app/api/website-builder/files/route.ts", "app/api/website-builder/menus/route.ts"].filter((p) => { try { read(p); return true } catch { return false } })
    /* Changed on purpose (round 42 team): the website, the creator page, payouts and billing opened (tests/team-areas-r42.test.ts). */
    check("the website builder's routes ask lib/team/website for the store now", builderRoutes.every((p) => /websiteCaller\(\)/.test(read(p)) && !/\.eq\("user_id", user\.id\)/.test(read(p))), builderRoutes)
    check("  and its site files are read and written under row level security alone (lib/sites/projects never imports the admin client)", !/createAdminClient|supabase\/admin/.test(read("lib/sites/projects.ts")))
    /* Changed on purpose (round 42 team): the website, the creator page, payouts and billing opened (tests/team-areas-r42.test.ts). */
    check("the creator page is the owner's account profile, read by the store owner's account", /\.from\("profiles"\)\.select\("username, display_name"\)\.eq\("id", page\.profileId\)/.test(read("app/creator-page/page.tsx")))
  }

  console.log("\nProducts: uploads into the store's folder")
  {
    check("Products uploads pictures, and its files, into the store's folder", UPLOAD_AREAS.includes("products") && same(PRODUCT_FILE_AREAS, ["products"]) && uploadStoreOf(acting(["products"])).kind === "store")
    check("a product's file: the owner, or a member with Products", mayUploadProductFile({ kind: "own" }) && mayUploadProductFile(uploadStoreOf(acting(["products"]))) && !mayUploadProductFile(uploadStoreOf(acting(["onepage"]))) && !mayUploadProductFile({ kind: "refused" }))
    const ok = (perms: TeamPermission[], bucket: unknown, path: unknown) => teamUploadPathOk(acting(perms), bucket, path)
    check("a member's picture into the store's folder", ok(["products"], "product-images", `${STORE}/${PRODUCT}/1_a.jpg`))
    check("  a video or a Files upload into the owner's account folder", ok(["products"], "store-builder-images", `${OWNER}/files/1-a.mp4`))
    check("  never their own folder, nor anybody else's", !ok(["products"], "product-images", `${ANA}/x/a.jpg`) && !ok(["products"], "product-images", `${OTHER_STORE}/x/a.jpg`))
    check("  never a path that climbs out or is empty", !ok(["products"], "product-images", `${STORE}/../${OTHER_STORE}/a.jpg`) && !ok(["products"], "product-images", `${STORE}//a.jpg`) && !ok(["products"], "product-images", `/${STORE}/a.jpg`) && !ok(["products"], "product-images", STORE))
    check("  never a bucket that is not listed (avatars, the private one)", !ok(["products"], "avatars", `${STORE}/a.jpg`) && !ok(["products"], "digital-products", `${STORE}/a.pdf`))
    check("  never without an area for that bucket", !ok(["orders"], "product-images", `${STORE}/a.jpg`) && ok(["onepage"], "onepage-assets", `${OWNER}/thumb-1.jpg`) && !ok(["products"], "onepage-assets", `${OWNER}/thumb-1.jpg`))
    check("the buckets and their areas", same(Object.keys(TEAM_BUCKET_AREAS), ["product-images", "store-builder-images", "onepage-assets"]))
    const route = read("app/api/team/upload-url/route.ts")
    check("the signing route asks the database who is acting, then the path, then signs that path once", /const acting = await actingStore\(admin, user\.id\)/.test(route) && /if \(!acting \|\| !teamUploadPathOk\(acting, body\?\.bucket, body\?\.path\)\)/.test(route) && /createSignedUploadUrl\(path\)/.test(route) && !/upsert/.test(route))
    check("  the owner never gets one (their own folder is theirs)", /if \(!acting \|\|/.test(route))
    const fallback = read("lib/team/upload-fallback.ts")
    check("the browser asks only after storage refused, and every direct upload uses it", /fetch\("\/api\/team\/upload-url"/.test(fallback) && /if \(!\(await teamSignedUpload\(bucket, path, body, type, onProgress\)\)\) throw refused/.test(read("lib/files/upload-video.ts")) && /teamSignedUpload\("product-images", path, upload, upload\.type\)/.test(read("lib/rich-text/upload-image.ts")) && /teamSignedUpload\("product-images", filePath, file, file\.type/.test(read("app/app/products/new/product-editor.tsx")))
    check("a product video goes into the store owner's folder", /uploadVideo\(file, "products", [\s\S]*?loadedCreator\.team_owner \?\? null\)/.test(read("app/app/products/new/product-editor.tsx")) && /const path = `\$\{owner \|\| user\.id\}\/\$\{folder\}/.test(read("lib/files/upload-video.ts")))
    check("the Files library uploads into the folder its list names", /libraryFolder = typeof r\.data\.folder === "string"/.test(read("components/files/files-library.tsx")) && /\$\{libraryFolder \|\| user\.id\}\/files\//.test(read("components/files/files-library.tsx")) && /folder: c\.ownerUserId/.test(read("app/api/files/route.ts")))
    const prepare = read("app/api/v2/upload/prepare/route.ts")
    check("the shared upload takes a product file from a member with Products, recorded as uploaded by them", /if \(isDigital && !mayUploadProductFile\(store\)\)/.test(prepare) && /uploaded_by: user\.id/.test(prepare))
  }

  console.log("\nProducts: the routes for a product's files")
  {
    const db = fakeDb({ creators: [{ id: STORE, user_id: OWNER, subscription_plan_id: "pro" }, { id: ANA_STORE, user_id: ANA, subscription_plan_id: null }] })
    const own = await productCreatorFor(db as never, ANA, null, "id")
    check("in their own account: their own store, by their account", own?.id === ANA_STORE, own)
    const member = await productCreatorFor(db as never, ANA, acting(["products"]), "id, subscription_plan_id")
    check("working in a store with Products: the store's row, never theirs", member?.id === STORE && member?.subscription_plan_id === "pro", member)
    check("working in a store without it: nothing", (await productCreatorFor(db as never, ANA, acting(["onepage"]), "id")) === null)
    for (const r of ["app/api/storage/upload-file/route.ts", "app/api/v2/upload/bundle/route.ts", "app/api/v2/upload/server-upload/route.ts", "app/api/v2/upload/scan/route.ts", "app/api/v2/upload/cancel/route.ts"]) {
      const src = read(r)
      check(`${r} asks productCreator, never the account's own row`, /await productCreator\(/.test(src) && !/\.from\("creators"\)[\s\S]{0,60}\.eq\("user_id", user\.id\)/.test(src))
    }
    check("a picture checked after upload: the store's folders for a member working in it", /const team = store\.kind === "store" \? \[store\.acting\.creatorId, store\.acting\.ownerUserId\] : \[\]/.test(read("app/api/storage/uploaded/route.ts")))
    check("the bundle of a product's files: the owner, or a member with Products in its store", /creatorOwner\.id !== \(await teamStoreIdFor\(user\.id, "products"\)\)/.test(read("app/api/storage/generate-bundle/route.ts")))
    check("a sold file is read as before: the owner's download route is unchanged", !/team/.test(read("app/api/products/files/[assetId]/download/route.ts")))
  }

  console.log("\nProducts: pages and routes read the store")
  {
    for (const p of ["app/app/products/collections/page.tsx", "app/app/products/size-charts/page.tsx", "app/app/products/size-charts/load-size-charts.ts", "app/app/inventory/page.tsx", "app/app/files/page.tsx", "app/app/reviews/page.tsx", "app/app/memberships/page.tsx", "app/app/memberships/[id]/page.tsx"]) {
      check(`${p} asks teamPageStore("products")`, read(p).includes('teamPageStore("products")') && !/currentCreatorId\(\)/.test(read(p)))
    }
    const list = read("app/app/products/page.tsx")
    check("the list: a member's read with the service role by the store's id, the owner's on their own client as before", /* Changed on purpose (round rel-db): the same two clients through lib/products/list-read */ /readProductList<ListedRow>\(admin, team\.creatorId\)/.test(list) && /readProductList<ListedRow>\(supabase, creator\.id\)/.test(list) && /const supabase = await createClient\(\)/.test(list))
    check("  and the list's pull to refresh reads the store, not the member's own", /\?\? storeId/.test(read("app/app/products/products-client.tsx")))
    const editor = read("app/app/products/load-editor.ts")
    check("the editor: a member's product read by id and by the store, kept only when it is the store's", /if \(!permits\(team\.acting\.permissions, "products"\)\) return \{ state: "signed-out" \}/.test(editor) && /\.eq\("id", id\)\.eq\("creator_id", acting\.creatorId\)/.test(editor) && /product\.creator_id !== acting\.creatorId/.test(editor))
    check("  the owner's path reads with their own client as it did", /creatorForRequest\(user\.id\),\s*profileForRequest\(user\.id\),\s*productReads/.test(editor))
    const routes = ["app/api/collections/route.ts", "app/api/collections/[id]/route.ts", "app/api/collections/product/route.ts", "app/api/store/channels/product/route.ts", "app/api/files/usage/route.ts", "app/api/app/reviews/route.ts", "app/api/app/reviews/bulk/route.ts", "app/api/reviews/widgets/route.ts", "app/api/physical/products/[id]/route.ts", "app/api/physical/inventory/route.ts", "app/api/size-charts/route.ts"]
    for (const r of routes) check(`${r} asks for Products`, /(shopCaller|physicalCaller)\("products"\)/.test(read(r)) && !/(shopCaller|physicalCaller)\(\)/.test(read(r)))
    check("Settings › Sales channels itself stays the owner's", /shopCaller\(\)/.test(read("app/api/store/channels/route.ts")))
    check("the currency a price form checks: Products may read that one answer, the rest of the page is the owner's", /readyCaller\(only \? "products" : "store"\)/.test(read("app/api/store/currency/route.ts")))
    const del = read("app/api/products/delete/route.ts")
    check("delete: the store from requireTeamPermission, and a product with sales archived for the member as for the owner", /requireTeamPermission\("products"\)/.test(del) && /deleteOwnProduct\(admin, \{ creatorId, productId \}\)/.test(del) && /previewDelete\(who\.admin, \{ creatorId: who\.creatorId, productId \}\)/.test(del))
    check("  a member without Products is refused, never their own store in its place", /if \(who instanceof NextResponse\) return NextResponse\.json\(\{ ok: false, error: NO_ACCESS \}, \{ status: 403 \}\)/.test(del))
    check("forget and revalidate: the store's caches, by the store's owner's handle", /requireTeamPermission\("products"\)/.test(read("app/api/products/forget/route.ts")) && /eq\("id", ownerId\)/.test(read("app/api/products/forget/route.ts")) && /teamStoreIdFor\(user\.id, "products"\)/.test(read("app/api/revalidate/route.ts")))
    check("the course card: the store's course for a member with Products; playing a lesson stays the owner's and buyers'", /ownerOf\(db, userId, body\.productId, await teamStoreIdFor\(userId, "products"\)\)/.test(read("app/api/courses/manage/route.ts")) && !/teamStoreIdFor/.test(read("app/api/courses/lessons/[id]/play/route.ts")))
    check("the Files library lists for Products, OnePage and Store settings; changing a file stays Products'", /shopCaller\(\["products", "onepage", "settings"\]\)/.test(read("app/api/files/route.ts")) && (read("app/api/files/route.ts").match(/shopCaller\("products"\)/g) ?? []).length === 2)
  }

  console.log("\nProducts: library checks that knew only the owner")
  {
    const world = () => fakeDb({
      reviews: [{ id: R1, creator_id: STORE, product_id: PRODUCT }, { id: R2, creator_id: OTHER_STORE, product_id: OTHER_PRODUCT }],
      creators: [{ id: STORE, user_id: OWNER }, { id: OTHER_STORE, user_id: "33333333-3333-4333-8333-333333333333" }],
      products: [{ id: PRODUCT, creator_id: STORE, title: "Book", slug: "book" }, { id: OTHER_PRODUCT, creator_id: OTHER_STORE, title: "X", slug: "x" }],
    })
    const asOwner = await sellersReview(world(), R1, OWNER)
    check("a review: the owner, as before", asOwner.ok === true)
    const asMember = await sellersReview(world(), R1, ANA, STORE)
    check("  a member with Products in its store", asMember.ok === true)
    const elsewhere = await sellersReview(world(), R2, ANA, STORE)
    check("  never another store's", "error" in elsewhere && elsewhere.status === 403)
    const without = await sellersReview(world(), R1, ANA, null)
    check("  and never without the store", "error" in without && without.status === 403)
    const course = await ownerOf(world() as never, ANA, PRODUCT, STORE).catch((e: Error) => e)
    check("a course: a member with Products edits the store's", !(course instanceof Error) && course.creatorId === STORE && course.userId === ANA, course instanceof Error ? course.message : course)
    const courseElsewhere = await ownerOf(world() as never, ANA, OTHER_PRODUCT, STORE).catch((e: Error) => e)
    check("  never another store's", courseElsewhere instanceof Error)
    const courseOwner = await ownerOf(world() as never, OWNER, PRODUCT).catch((e: Error) => e)
    check("  the owner, as before", !(courseOwner instanceof Error) && courseOwner.creatorId === STORE)
  }

  console.log("\nStore settings: Store details alone")
  {
    check("what a member may change: name, contact, phone, logo", same(MEMBER_STORE_SETTING_KEYS, ["storeName", "supportEmail", "phone", "phoneCountry", "logoUrl"]))
    check("  a name and a logo: yes", memberMaySave({ storeName: "Shop", logoUrl: null }))
    check("  business details, checkout, the sales channel: no", !memberMaySave({ legal: { company: "X" } }) && !memberMaySave({ checkout: {} }) && !memberMaySave({ storeName: "x", defaultSalesChannelId: null }) && !memberMaySave({}))
    check("the Settings sections: Store details with Store settings, nothing without", same(memberSettingsTabs(["settings"]), ["store"]) && memberSettingsTabs(["products"]).length === 0 && memberSettingsTabs(null).length === 0)
    const route = read("app/api/store/settings/route.ts")
    check("the route: the owner, or a member with Store settings, and a member's change checked key by key", /shopCaller\(\["store", "settings"\]\)/.test(route) && /if \(c\.isOwner === false && !memberMaySave\(body\)\) return physicalJson\(\{ error: OWNER_KEEPS_SETTING \}, 403\)/.test(route))
    check("  the suggested email is the store owner's, and the bank statement is renamed by the owner's save only", /getUserById\(c\.ownerUserId \?\? c\.userId\)/.test(route) && /if \("storeName" in body && c\.isOwner !== false\)/.test(route))
    const form = read("components/app/settings-form-new.tsx")
    check("the page shows a member their own account's sections and Store details", /tab\.group === "account" && !STORE_SIDE_ACCOUNT_TABS\.includes\(tab\.id\)\) \|\| teamTabs\.includes\(tab\.id\)/.test(form) /* Changed on purpose (round 42 team): Plan is the store's for a member, shown with Billing */ && /teamTabs = memberSettingsTabs\(/.test(read("app/app/settings/_server.ts")))
    check("  Store details for a member: no currency, no business details, no shipping origin, and Profile's email left alone", /member \? null : <CurrencyLink \/>/.test(read("components/app/settings/store-details-panel.tsx")) && /member \? null : <Business/.test(read("components/app/settings/store-details-panel.tsx")) && /physical && !member \? <OrdersFrom/.test(read("components/app/settings/store-details-panel.tsx")) && /onSupportEmail=\{teamActing \? undefined :/.test(form))
  }

  console.log("\nOnePage gaps")
  {
    const media = read("lib/onepage/media-upload.ts")
    check("a member's picture or video goes into the page owner's folder, through a signed path", /const teamOwner = o\.owner === undefined \? teamPageOwner\(\) : o\.owner/.test(media) && /mediaPath\(teamOwner \?\? first\.userId, o\.prefix, ext\)/.test(media) && /if \(teamOwner && teamOwner !== first\.userId\)/.test(media) && /fetch\("\/api\/team\/upload-url"/.test(media))
    check("  the owner's upload is the one it was", /\} else if \(uploadRoute\(total\) === "single"\) \{/.test(media))
    check("  the share picture too", /const path = `\$\{owner \?\? user\.id\}\/og-image-/.test(read("components/onepage/seo-panel.tsx")))
    check("the page owner is set with the store, and cleared when the editor goes", /setTeamPageOwner\(team\?\.ownerUserId \?\? null\)/.test(read("lib/onepage/team-context.tsx")) && /setTeamPageOwner\(null\)/.test(read("lib/onepage/team-context.tsx")))
    check("integrations: a member tests and picks a list with the owner's key", memberMayStep({ provider: "mailchimp", step: "test" }) && memberMayStep({ provider: "kit", step: "lists" }) && memberMayStep({ provider: "mailchimp", step: "connect", listId: "a" }) && memberMayStep({ provider: "zapier", step: "test" }))
    check("  never adds, replaces or removes a key or a webhook", !memberMayStep({ provider: "mailchimp", step: "connect", apiKey: "abc-us1" }) && !memberMayStep({ provider: "kit", disconnect: true }) && !memberMayStep({ provider: "webhook", step: "connect", url: "https://x" }))
    const integ = read("app/api/onepage/integrations/route.ts")
    check("  the route reads the store's for OnePage, and asks memberMayStep for a member", (integ.match(/shopCaller\("onepage"\)/g) ?? []).length === 2 && /if \(c\.isOwner === false && !memberMayStep\(body\)\) return physicalJson\(\{ error: OWNER_KEEPS_KEYS \}, 403\)/.test(integ))
    check("the tags and email tools a page loads: read for OnePage, changed by the owner", /export async function GET\(\) \{[\s\S]*?shopCaller\(\["store", "onepage"\]\)/.test(read("app/api/store/integrations/route.ts")) && /export async function PUT[\s\S]*?shopCaller\(\)/.test(read("app/api/store/integrations/route.ts")) && /* Changed on purpose (round 43): Emails › Platforms reads the same status for a member with Marketing; connecting stays the owner's (POST). */ /export async function GET\(\) \{[\s\S]*?shopCaller\(\["store", "onepage"(, "marketing")?\]\)/.test(read("app/api/store/integrations/marketing/route.ts")) && /export async function POST[\s\S]*?shopCaller\(\)/.test(read("app/api/store/integrations/marketing/route.ts")))
    check("  the domain row is the store's, from the page", /useJson<DomainsAnswer>\(team \? null : "\/api\/domains"\)/.test(read("components/onepage/settings-integrations.tsx")))
    const preview = read("components/onepage/live-preview.tsx")
    check("the preview's owner name and photo come with the page for a member, never from their browser or their own photo", /if \(!ownerId \|\| team\) return/.test(preview) && /team \? \{ displayName: team\.ownerName \?\? null, avatarUrl: team\.ownerAvatar \?\? null \}/.test(preview) && /admin\.from\("profiles"\)\.select\("display_name, avatar_url"\)\.eq\("id", ownerUserId\)/.test(read("app/app/onepage/page.tsx")))
    check("the free products a lead magnet lists are the store's", /const teamStore = teamStoreForProducts\(\)/.test(read("components/onepage/storelib-blocks.tsx")))
  }

  console.log("\nRecord lines name the member")
  {
    check("one key, the same as the community's log", TEAM_ACTOR_KEY === TEAM_AUDIT_KEY && same(Object.keys(TEAM_STAMPED), ["commerce_order_events", "security_events", "community_audit_log"]))
    const row = stampTeamRow("commerce_order_events", { kind: "note", actor: "creator", detail: { text: "hi" } }, ANA) as { detail: Record<string, unknown>; actor: string }
    check("an order's timeline line keeps what it said and names the member", row.detail.text === "hi" && row.detail[TEAM_ACTOR_KEY] === ANA && row.actor === "creator")
    check("  a security event, in its metadata", (stampTeamRow("security_events", { metadata: null }, ANA) as unknown as { metadata: Record<string, unknown> }).metadata[TEAM_ACTOR_KEY] === ANA)
    check("  any other table as it was", stampTeamRow("products", { title: "x" }, ANA).title === "x" && !("detail" in stampTeamRow("products", { title: "x" }, ANA)))
    const db = fakeDb({ commerce_order_events: [], products: [] })
    const wrapped = teamStampDb(db, ANA)
    await wrapped.from("commerce_order_events").insert({ kind: "note", detail: { text: "a" } })
    await wrapped.from("products").insert({ title: "b" })
    const log = (db as unknown as { log: { table: string; op: string; payload?: Record<string, unknown> }[] }).log
    const ev = log.find((l) => l.table === "commerce_order_events")?.payload as { detail?: Record<string, unknown> } | undefined
    const pr = log.find((l) => l.table === "products")?.payload as Record<string, unknown> | undefined
    check("  through the wrapped client, on the record tables only", ev?.detail?.[TEAM_ACTOR_KEY] === ANA && pr?.title === "b" && !("detail" in (pr ?? {})), { ev, pr })
    check("the clients a team route hands out are wrapped for a member, plain for the owner", /db: found\.acting \? teamStampDb\(db, user\.id\) : db/.test(read("lib/physical/auth.ts")) && /db: found\.acting \? teamStampDb\(db, user\.id\) : db/.test(read("lib/team/server.ts")))
    check("a receipt resent or an email changed by a member names them", /store\.role === "owner" \? null : store\.userId\)/.test(read("app/api/app/orders/[id]/resend/route.ts")) && /store\.role === "owner" \? null : store\.userId\)/.test(read("app/api/app/orders/[id]/email/route.ts")))
  }

  console.log("\nThe SQL (part 327)")
  {
    const sql = read("supabase/sql/run-now/327_team_products.sql")
    check("the run-now part and the migration are the same text", sql === read("supabase/migrations/20271029_team_products.sql"))
    check("skips itself, said, before part 319 and without products", /IF to_regprocedure\('public\.team_store_ids\(text\)'\) IS NULL THEN RAISE NOTICE 'part 327/.test(sql) && /IF to_regclass\('public\.products'\) IS NULL THEN RAISE NOTICE 'part 327/.test(sql))
    check("guarded per table", /IF to_regclass\('public\.product_variants'\) IS NOT NULL THEN/.test(sql) && /IF to_regclass\('public\.product_variant_files'\) IS NOT NULL THEN/.test(sql) && /IF to_regclass\('public\.digital_assets'\) IS NOT NULL THEN/.test(sql))
    check("every policy for signed in people only, and each added once", (sql.match(/CREATE POLICY/g) ?? []).length === 11 && (sql.match(/FOR (SELECT|INSERT|UPDATE|DELETE) TO authenticated/g) ?? []).length === 11 && (sql.match(/IF NOT EXISTS \(SELECT 1 FROM pg_policies/g) ?? []).length === 11)
    check("products: read, add, change by team_store_ids('products'); never deleted from the browser", /ON public\.products FOR SELECT TO authenticated USING \(creator_id IN \(SELECT public\.team_store_ids\('products'\)\)\)/.test(sql) && /ON public\.products FOR UPDATE TO authenticated USING \(creator_id IN \(SELECT public\.team_store_ids\('products'\)\)\) WITH CHECK \(creator_id IN \(SELECT public\.team_store_ids\('products'\)\)\)/.test(sql) && !/ON public\.products FOR (DELETE|ALL)/.test(sql))
    check("a file is linked only to a variant of its own product", /FOR INSERT TO authenticated WITH CHECK \(public\.team_variant_file_ok\(variant_id, digital_asset_id\)\)/.test(sql) && /join public\.digital_assets da on da\.product_id = v\.product_id/.test(sql))
    check("digital_assets: read only (names and sizes); the file stays in the private bucket", /ON public\.digital_assets FOR SELECT/.test(sql) && !/ON public\.digital_assets FOR (INSERT|UPDATE|DELETE|ALL)/.test(sql) && !/storage\.objects/.test(sql))
    check("the trigger keeps a product in its store and a variant on its product, the service role untouched", /BEFORE UPDATE OF creator_id ON public\.products/.test(sql) && /BEFORE UPDATE OF product_id ON public\.product_variants/.test(sql) && /if me is null then return new; end if;/.test(sql) && /raise exception 'A product stays in its store\.'/.test(sql))
    check("security definer with a fixed search path, never anon", (sql.match(/security definer set search_path = public/g) ?? []).length === 4 && (sql.match(/FROM PUBLIC, anon;/g) ?? []).length === 4)
    check("the check after knows it", /as p327_team_products/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("the README lists it", /\| `327_team_products\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
    check("permits is what decides, as everywhere", permits(["products"], "products") && !permits(["products"], "website"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
