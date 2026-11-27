/**
 * ===========================================================================
 *  THE THEME MARKETPLACE, ITS ADMIN, AND A PLAN SET FROM /admin (round Z5)
 * ===========================================================================
 *   1. the library's Browse themes: Shopify style cards, eight and a ninth
 *      to the marketplace, a Theme marketplace link in a new tab
 *   2. storelib.com/themes and a theme's page: filters, live preview, Add
 *   3. /admin/themes: every route admin only, a zip checked (traversal,
 *      absolute paths, links, kinds, count, size) and never run
 *   4. a plan set from /admin: one source of truth every check reads, kept
 *      over Stripe's writes, written down, and never sent to Stripe
 *
 * Run: npx tsx tests/theme-marketplace.test.ts (the zip checks through the
 * server module run in the push runner, where server-only is empty).
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

import { stripComments } from "./_source"
import {
  CODE_TEMPLATES,
  ADD_REFUSALS,
  DEFAULT_LISTING_SLUG,
  LIBRARY_THEME_CARDS,
  addVerdict,
  builtinListings,
  filterListings,
  hasLivePreview,
  mergeListings,
  slugify,
  sortListings,
  tierLabel,
  type ThemeListing,
} from "../lib/themes/marketplace-shared"
import { MAX_THEME_ZIP_BYTES, MAX_THEME_ZIP_FILES, checkThemeZipEntries, checkThemeZipSize, isSymlinkMode, unsafeZipPath } from "../lib/themes/zip-rules"
import { parseListingInput, safeHttpsUrl } from "../lib/themes/marketplace-admin"
import { ASSIGNABLE_PLANS, OVERRIDE_SQL_MISSING, effectivePlanId, isAssignablePlan, readPlanOverride, setPlanOverride } from "../lib/billing/plan-override"
import { isReservedRootSegment } from "../lib/routes/reserved-segments"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

function listing(over: Partial<ThemeListing>): ThemeListing {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "one",
    name: "One",
    author: "Ana",
    authorAvatar: null,
    category: "general",
    tier: "free",
    priceCents: 0,
    cover: null,
    screenshots: [],
    builtinThemeId: null,
    codePackage: null,
    hasPackage: true,
    packageKind: "storelib",
    demoUrl: null,
    published: true,
    sortOrder: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...over,
  }
}

async function main() {
  /* ── 1. Listings ─────────────────────────────────────────────────────── */
  console.log("\nListings\n")
  const builtin = builtinListings()
  /* Changed on purpose (templates round 16, then 17, then 18): the code lists twelve templates (Skincare removed and Creator Landing added in round 18) made from one theme, the default first; the native Storelib Default is no longer listed (tests/theme-templates.test.ts holds the rest). */
  check("Storelib's own templates are listed from code, free, by Storelib, the default first", builtin.length === 19 /* Changed on purpose (templates round 20): Tour merch removed; Coach, Video sales letter, Online course, Course landing and Retro desktop added, nineteen (round 19 had added Art books, Night shop and Poster shop). */ + 5 /* Changed on purpose (templates round 21): Author, Content creator, Coach creator, Digital Renaissance and XP shop added, twenty four. */ + 2 /* Changed on purpose (templates round 22): Caps and tees and Print on demand added, twenty six. */ + 1 /* Changed on purpose (templates round 23): VSL funnel added. */ + 1 /* Changed on purpose (templates round 23): Outerwear label added. */ + 1 /* Changed on purpose (templates round 23): Notion sales page added. */ + 1 /* Changed on purpose (templates round 24): Boutique rail added. */ + 1 /* Changed on purpose (round 25): Personal trainer added. */ + 1 /* Changed on purpose (round 25): Notion creator added. */ + 1 /* Changed on purpose (round 25): Sound packs added. */ + 1 /* Changed on purpose (round 26): Digital studio added. */ + 1 /* Changed on purpose (round 29): New Leaf added. */ && builtin[0].slug === DEFAULT_LISTING_SLUG && builtin.every((b) => b.tier === "free" && b.author === "Storelib" && !b.builtinThemeId && !!b.codePackage && b.hasPackage))
  const codeSlugs = builtin.map((b) => b.slug).join(",")
  const merged = mergeListings([listing({ slug: "b", sortOrder: 2 }), listing({ slug: "a", sortOrder: 1 }), listing({ slug: "hidden", published: false })])
  /* Changed on purpose (templates round 16, then 17, then 18): twelve code listings lead, not one. */
  check("the merge keeps the code's templates first, orders the rest, and leaves hidden ones out", merged.map((l) => l.slug).join(",") === `${codeSlugs},a,b`, merged.map((l) => l.slug).join(","))
  check("  the admin's list includes hidden ones", mergeListings([listing({ slug: "hidden", published: false })], { includeHidden: true }).some((l) => l.slug === "hidden"))
  /* Changed on purpose (templates round 16): a row with a template's address dresses that template and still adds the code's package; a row naming the native theme is retired. */
  const over = mergeListings([listing({ slug: DEFAULT_LISTING_SLUG, hasPackage: false, packageKind: null, sortOrder: 5, cover: null })])
  const dressed = over.filter((l) => l.slug === DEFAULT_LISTING_SLUG)
  check("a row for a template replaces its code listing, keeps its picture and still adds the code's package", dressed.length === 1 && dressed[0].sortOrder === 5 && dressed[0].cover === builtin[0].cover && dressed[0].codePackage === builtin[0].codePackage && dressed[0].hasPackage)
  check("  hidden by its row, a template is on no list", !mergeListings([listing({ slug: "clothing", published: false })]).some((l) => l.slug === "clothing"))
  const native = listing({ slug: "old-default", builtinThemeId: "00000000-0000-0000-0000-000000000001", hasPackage: false, packageKind: null })
  check("a row that names the native theme is retired: on no list a creator sees, hidden in the admin's", !mergeListings([native]).some((l) => l.slug === "old-default") && mergeListings([native], { includeHidden: true }).some((l) => l.slug === "old-default" && !l.published))
  const many = [listing({ slug: "f", name: "Fern", tier: "free" }), listing({ slug: "p", name: "Pine", tier: "pro", category: "music" }), listing({ slug: "d", name: "Dune", tier: "paid", priceCents: 4900, author: "Kai" })]
  check("Free, Paid and Pro filter", filterListings(many, { tier: "paid" }).map((l) => l.slug).join() === "d" && filterListings(many, { tier: "pro" }).map((l) => l.slug).join() === "p" && filterListings(many, { tier: "free" }).map((l) => l.slug).join() === "f")
  check("search reads the name and the author, any case", filterListings(many, { q: "KAI" }).map((l) => l.slug).join() === "d" && filterListings(many, { q: "pin" }).map((l) => l.slug).join() === "p")
  check("a category narrows", filterListings(many, { category: "music" }).map((l) => l.slug).join() === "p")
  check("sort by name and by price (free, then Pro, then paid)", sortListings(many, "name").map((l) => l.slug).join() === "d,f,p" && sortListings(many, "price").map((l) => l.slug).join() === "f,p,d")
  /* Changed on purpose (pricing round 5): themes included from the $29 plan up say Grow. */
  check("the badge says Free, the price, or Grow", tierLabel(many[0]) === "Free" && tierLabel(many[2]) === "$49" && tierLabel(many[1]) === "Grow")
  check("a slug is lower case words and dashes", slugify("Studio Noir: Édition 2") === "studio-noir-edition-2")
  /* Changed on purpose (templates round 16): the code's templates are in the compatible profile, so their preview is their pictures. */
  check("the live preview draws native themes and Storelib packages, not themes in the compatible profile", hasLivePreview(listing({ builtinThemeId: "x", hasPackage: false })) && hasLivePreview(listing({})) && !hasLivePreview(listing({ packageKind: "shopify" })) && !hasLivePreview(builtin[0]))

  /* ── Add, decided on the server ─────────────────────────────────────── */
  console.log("\nAdd\n")
  check("a paid theme is not sold yet", addVerdict(listing({ tier: "paid", priceCents: 900 }), true).ok === false && (addVerdict(listing({ tier: "paid" }), true) as { reason: string }).reason === "paid_soon")
  check("a Pro theme needs Pro", (addVerdict(listing({ tier: "pro" }), false) as { reason: string }).reason === "needs_pro" && addVerdict(listing({ tier: "pro" }), true).ok === true)
  check("a listing with no zip cannot be added", (addVerdict(listing({ hasPackage: false }), true) as { reason: string }).reason === "no_package" && addVerdict(builtin[0], false).ok === true)
  check("the refusals are plain words", Object.values(ADD_REFUSALS).every((t) => t.length < 60 && !/—/.test(t)))
  const add = code("app/api/themes/marketplace/add/route.ts")
  /* Round 50: routeUser (lib/auth/route-user) is Auth's own answer, with a 503 when Auth did not answer. */
  const asks = add.indexOf("auth.getUser()") > 0 ? add.indexOf("auth.getUser()") : add.indexOf("await routeUser()")
  check("the add route asks who is signed in before anything else", asks > 0 && asks < add.indexOf("listingRowBySlug(slug"))
  check("  checks Pro on the server with the plan every check reads", /creatorSitePlan\(creator\.id/.test(add) && /addVerdict\(listing, plan === "growth" \|\| plan === "pro"\)/.test(add))
  /* Changed on purpose (templates round 16): Storelib's own are templates composed on the server and imported; the registry add is not called from here. */
  /* Changed on purpose (theme releases): a theme with published releases is added at the newest one (tests/theme-releases.test.ts); without, the code's template as before. */
  /* Changed on purpose (round 27, the owner: adding a theme takes too long): a template's files go straight to the import's own conversion and writes (convertTemplateFiles, storeImportedTheme), no zip and no second request; an uploaded zip still goes through the import pipeline. */
  check("  adds Storelib's own templates from their files through the import's own writes, and an uploaded zip through the import pipeline", /released\?\.files \?\? composeTemplateFiles\(listing\.codePackage\)/.test(add) && /convertTemplateFiles\(files, listing\.name\)/.test(add) && /storeImportedTheme\(admin, owner, converted\.theme, converted\.report, \{ name: listing\.name, mark/.test(add) && !/addRegistryTheme/.test(add) && /importThemePackage\(forward\("\/api\/website-builder\/themes\/import", \{ path: copy \}\)\)/.test(add))
  check("  hands the import a copy in the creator's own upload folder, never the listing's zip", /importPathFor\(user\.id, randomUUID\(\)\)/.test(add) && /\.copy\(source, copy\)/.test(add) && /PACKAGE_PATH_RE\.test\(source\)/.test(add))
  check("  renames only the creator's own new install", /\.eq\("id", made\.install_id\)\.eq\("creator_id", creator\.id\)/.test(add))

  /* ── 3. Zips ─────────────────────────────────────────────────────────── */
  console.log("\nTheme zips\n")
  check("traversal, absolute paths, drive letters and backslashes are unsafe",
    ["../x.liquid", "a/../../x.json", "/etc/passwd", "C:/x.css", "a\\b.css", "./x.css", "a/\u0000.css"].every(unsafeZipPath) && !unsafeZipPath("sections/hero.liquid"))
  check("a symbolic link is recognised from its mode bits", isSymlinkMode(0o120777) && !isSymlinkMode(0o100644) && !isSymlinkMode(null))
  check("a zip with ../ is refused by name", checkThemeZipEntries([{ name: "../../evil.liquid", dir: false }]).ok === false)
  check("an absolute path is refused", checkThemeZipEntries([{ name: "/tmp/x.json", dir: false }]).ok === false)
  check("a link is refused", checkThemeZipEntries([{ name: "assets/x.css", dir: false, unixPermissions: 0o120755 }]).ok === false)
  check("a program is refused whatever folder it is in", ["assets/run.exe", "snippets/a.php", "x.sh", "bin/tool"].every((n) => checkThemeZipEntries([{ name: n, dir: false }]).ok === false))
  check("more than the file limit is refused", checkThemeZipEntries(Array.from({ length: MAX_THEME_ZIP_FILES + 1 }, (_, i) => ({ name: `assets/${i}.css`, dir: false }))).ok === false)
  const shopifyLike = ["layout/theme.liquid", "sections/hero.liquid", "templates/index.json", "config/settings_schema.json", "assets/app.js", "assets/a.woff2", "LICENSE", ".gitignore", "__MACOSX/x", "locales/en.default.json"]
  const okRules = checkThemeZipEntries(shopifyLike.map((name) => ({ name, dir: false })))
  check("a real theme's files pass, its licence and dot files included", okRules.ok === true && (okRules as { files: number }).files === 8, JSON.stringify(okRules))
  check("an empty zip is refused", checkThemeZipEntries([{ name: "sections/", dir: true }]).ok === false)
  check("over 50 MB is refused before it is read", checkThemeZipSize(MAX_THEME_ZIP_BYTES + 1) !== null && checkThemeZipSize(0) !== null && checkThemeZipSize(1024) === null)

  /* What a zip really carries, through JSZip as the server reads it. */
  const evil = new JSZip()
  evil.file("sections/hero.liquid", "<div>hero</div>")
  evil.file("../../escape.liquid", "x")
  const evilRead = await JSZip.loadAsync(await evil.generateAsync({ type: "uint8array" }))
  const evilNames = Object.values(evilRead.files).map((f) => ({ name: f.name, dir: f.dir, unixPermissions: typeof f.unixPermissions === "number" ? f.unixPermissions : null }))
  check("a traversal name survives a zip round trip and is refused", checkThemeZipEntries(evilNames).ok === false, evilNames.map((e) => e.name).join(", "))
  const linked = new JSZip()
  linked.file("assets/a.css", "/etc/passwd", { unixPermissions: 0o120777 })
  const linkedRead = await JSZip.loadAsync(await linked.generateAsync({ type: "uint8array", platform: "UNIX" }))
  const linkedNames = Object.values(linkedRead.files).map((f) => ({ name: f.name, dir: f.dir, unixPermissions: typeof f.unixPermissions === "number" ? f.unixPermissions : null }))
  check("a symbolic link survives a zip round trip and is refused", checkThemeZipEntries(linkedNames).ok === false, JSON.stringify(linkedNames))

  /* The whole check, as the admin route runs it (server-only is empty in the push runner). */
  let server: typeof import("../lib/themes/marketplace-server") | null = null
  try {
    server = await import("../lib/themes/marketplace-server")
  } catch {
    console.log("  skip  the server check (server-only outside the push runner)")
  }
  if (server) {
    const big = await server.checkThemeZip(Buffer.alloc(MAX_THEME_ZIP_BYTES + 10))
    check("checkThemeZip refuses an oversize file", big.ok === false && /over/i.test((big as { error: string }).error))
    const notZip = await server.checkThemeZip(Buffer.from("hello, not a zip at all"))
    check("checkThemeZip refuses a file that is not a zip", notZip.ok === false)
    const trav = await server.checkThemeZip(Buffer.from(await evil.generateAsync({ type: "uint8array" })))
    check("checkThemeZip refuses a zip with ../ in it", trav.ok === false, JSON.stringify(trav))
    const exe = new JSZip()
    exe.file("sections/hero.liquid", "x")
    exe.file("assets/setup.exe", "MZ")
    const exeRes = await server.checkThemeZip(Buffer.from(await exe.generateAsync({ type: "uint8array" })))
    check("checkThemeZip refuses a program", exeRes.ok === false)
    const plain = new JSZip()
    plain.file("readme.txt", "hello")
    const plainRes = await server.checkThemeZip(Buffer.from(await plain.generateAsync({ type: "uint8array" })))
    check("checkThemeZip refuses a zip that is not a theme", plainRes.ok === false)
  }

  const pkg = code("app/api/admin/themes/package/route.ts")
  check("the package route reads only a path it handed out, under this listing's folder", /PACKAGE_PATH_RE\.test\(path\)/.test(pkg) && /path\.startsWith\(`theme-marketplace\/\$\{listingId\}\/`\)/.test(pkg))
  check("  reads the size from storage before downloading, and deletes a refused zip", /checkThemeZipSize\(recorded\)/.test(pkg) && /if \(verdict\.ok === false\) \{\s*await drop\(\)/.test(pkg))
  const srv = code("lib/themes/marketplace-server.ts")
  check("  the check is the central archive check, the name rules, then the import pipeline's parse", /inspectUpload\(/.test(srv) && /context: "theme_package"/.test(srv) && /checkThemeZipEntries\(entries\)/.test(srv) && /convertShopifyTheme\(zip/.test(srv) && /readPackage\(/.test(srv) && /parseThemePackageManifest\(/.test(srv))
  check("  and nothing in a zip is evaluated", !/\beval\(|new Function\(|child_process|vm\.run|writeFile/.test(srv))
  const img = code("app/api/admin/themes/image/route.ts")
  check("pictures: 4 MB, real pictures only, no SVG, a name the server chose", /LISTING_IMAGE_MAX_BYTES/.test(img) && /context: "public_image"/.test(img) && /randomUUID\(\)/.test(img) && !/svg/.test(code("lib/themes/marketplace-admin.ts").match(/LISTING_IMAGE_EXTENSIONS[^\n]*/)?.[0] ?? "svg"))

  /* ── Admin only ──────────────────────────────────────────────────────── */
  console.log("\nAdmin only\n")
  for (const file of ["app/api/admin/themes/route.ts", "app/api/admin/themes/package/route.ts", "app/api/admin/themes/image/route.ts", "app/api/admin/creators/plan/route.ts"]) {
    const src = code(file)
    const handlers = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)[^{]*\{\s*const denied = await requireAdmin\(\)\s*if \(denied\) return denied/g)]
    const all = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)]
    check(`${file}: every handler checks the admin cookie first (${all.length})`, all.length > 0 && handlers.length === all.length)
  }
  check("/admin/themes checks the cookie on the server before drawing", /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin \/>/.test(code("app/(storelib)/admin/themes/page.tsx")))
  check("the console links to it", /\{ href: "\/admin\/themes", label: "Themes" \}/.test(read("app/(storelib)/admin/_console/shell.tsx")))
  const input = parseListingInput({ name: "  Studio  Noir ", tier: "paid", price_cents: 4900, demo_url: "https://demo.storelib.com", published: true, extra: "ignored" })
  check("a listing's fields are trimmed and bounded", input.ok === true && (input as { value: { slug: string; name: string; price_cents: number } }).value.slug === "studio-noir" && (input as { value: { name: string } }).value.name === "Studio Noir")
  check("  a paid theme needs a price, a demo needs https", parseListingInput({ name: "x", tier: "paid", price_cents: 0 }).ok === false && parseListingInput({ name: "x", demo_url: "http://a.b" }).ok === false && safeHttpsUrl("javascript:alert(1)") === null)
  check("  a Free or Pro theme has no price", (parseListingInput({ name: "x", tier: "pro", price_cents: 900 }) as { value: { price_cents: number } }).value.price_cents === 0)

  /* ── 4. Plans ────────────────────────────────────────────────────────── */
  console.log("\nA plan set from /admin\n")
  check("every tier can be assigned: Free, Pro, the legacy Pro", ASSIGNABLE_PLANS.map((p) => p.id).join() === "free,growth,pro" && isAssignablePlan("growth") && !isAssignablePlan("gold"))
  check("the override wins over the paid plan, and its absence leaves it", effectivePlanId("free", { planId: "growth", paidPlanId: "free", paidStatus: "active", setAt: null }) === "growth" && effectivePlanId("pro", null) === "pro" && effectivePlanId(null, null) === "free")
  const missingDb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42P01" } }) }) }) }), rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) }
  check("before part 252 a read answers no override", (await readPlanOverride(missingDb, "x")) === null)
  const refused = await setPlanOverride(missingDb, "x", "growth")
  check("  and setting one says to run it", refused.ok === false && (refused as { status: number; error: string }).status === 503 && (refused as { error: string }).error === OVERRIDE_SQL_MISSING)
  const okDb = { from: () => ({}), rpc: async (fn: string, args: Record<string, unknown>) => ({ data: fn === "admin_set_plan_override" && args.p_plan === "growth" ? { from: "free", to: "growth", paid_plan_id: "free" } : null, error: null }) }
  const set = await setPlanOverride(okDb, "x", "growth")
  check("setting one goes through the one SQL function, from and to returned", set.ok === true && (set as { from: string; to: string }).from === "free" && (set as { to: string }).to === "growth")

  const sql = read("supabase/sql/run-now/252_theme_marketplace_and_plan_overrides.sql")
  check("part 252: the override is held in the columns every check reads", /CREATE TRIGGER creators_plan_override_hold BEFORE UPDATE OF subscription_plan_id, subscription_status ON public\.creators/.test(sql) && /NEW\.subscription_plan_id := o\.plan_id; NEW\.subscription_status := 'active'/.test(sql))
  check("  a webhook's plan is kept as the paid plan, never lost", /UPDATE public\.creator_plan_overrides SET paid_plan_id = CASE WHEN NEW\.subscription_plan_id IS DISTINCT FROM OLD\.subscription_plan_id THEN NEW\.subscription_plan_id/.test(sql))
  check("  clearing puts the paid plan back", /UPDATE public\.creators SET subscription_plan_id = coalesce\(o\.paid_plan_id, 'free'\), subscription_status = coalesce\(o\.paid_status, 'active'\)/.test(sql))
  check("  the function is the server's alone", /REVOKE ALL ON FUNCTION public\.admin_set_plan_override\(uuid, text\) FROM PUBLIC, anon, authenticated;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.admin_set_plan_override\(uuid, text\) TO service_role;/.test(sql))
  check("  row level security on both tables, published listings readable, writes revoked", (sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 2 && /USING \(published\)/.test(sql) && (sql.match(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE/g) ?? []).length === 2)
  check("  the creator reads only their own override, over realtime", /creator_id IN \(SELECT c\.id FROM public\.creators c WHERE c\.user_id = auth\.uid\(\)\)/.test(sql) && /ALTER PUBLICATION supabase_realtime ADD TABLE public\.creator_plan_overrides/.test(sql))
  check("  one statement a line, the migration the same text", sql.split("\n").filter(Boolean).every((l) => l.startsWith("/*") || /;$/.test(l)) && read("supabase/migrations/20270201_z5_theme_marketplace_and_plan_overrides.sql") === sql)
  check("  listed in the README and the check after", /252_theme_marketplace_and_plan_overrides\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p252_theme_marketplace_and_plan_overrides/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("  nothing in it touches Stripe", !/stripe_subscription_id|stripe_customer_id/.test(sql))
  for (const f of ["lib/billing/overview.ts", "app/api/billing/subscription/route.ts", "app/(storelib)/app/settings/billing/upgrade/page.tsx"]) {
    /* Changed on purpose: the overview reads the override through the per request read (lib/billing/request-reads billingPlanOverrideFor), which calls readPlanOverride. */
    const asks = /readPlanOverride\(/.test(code(f)) || (/billingPlanOverrideFor\(/.test(code(f)) && /readPlanOverride\(/.test(code("lib/billing/request-reads.ts")))
    check(`the reader that asks Stripe asks for the override too: ${f}`, asks)
  }
  const planRoute = code("app/api/admin/creators/plan/route.ts")
  check("each change is written to the audit log with the plan before and after", /recordAdminAction\(admin, \{\s*action: plan === null \? "plan_override_cleared" : "plan_override_set"/.test(planRoute) && /detail: \{ from: result\.from, to:/.test(planRoute))
  check("  and the admin route never calls Stripe", !/stripe/i.test(planRoute.replace(/Stripe subscription is unchanged/g, "")))
  check("the open app redraws when its plan changes", /<PlanWatch creatorId=/.test(read("app/(storelib)/app/layout.tsx")) && /table: "creator_plan_overrides", filter: `creator_id=eq\.\$\{creatorId\}`/.test(read("components/app/plan-watch.tsx")) && /router\.refresh\(\)/.test(read("components/app/plan-watch.tsx")))
  check("  and Settings reads the plan again", /addEventListener\("storelib:plan-changed", again\)/.test(read("components/app/settings-form-new.tsx")))
  check("the creator's admin page has the control", /<PlanPanel creatorId=\{c\.id\} \/>/.test(read("app/(storelib)/admin/_console/view-commerce.tsx")) && existsSync(join(root, "app/(storelib)/admin/_console/panel-plan.tsx")))

  /* ── 1 and 2: the pages ──────────────────────────────────────────────── */
  console.log("\nThe pages\n")
  const client = read("app/(storelib)/app/website-builder/website-builder-client.tsx")
  /* Changed on purpose (templates round 16): the marketplace is a popup over the page, opened by a button, not a link to /themes in a new tab (scripts/check-theme-popup.mjs measures it). */
  /* Changed on purpose (the owner: six template cards, then Show more that opens the marketplace popup; the Explore more themes card is gone). */
  /* Changed on purpose (round 24): the owner: nine cards (three rows), Storelib Default first, Notion templates in place of the Cookbook, and Night shop, Poster shop and Print on demand as the third row; the rest follow in the marketplace's order. */
  /* Changed on purpose (r67): the owner: a fourth row of three, twelve cards. */
  check("Browse themes is a grid of twelve cards, three to a row, then Show more that opens the popup", /const ROW_THEME_CARDS = 12/.test(client) && /const explore = browseThemes\(listings, ROW_THEME_CARDS\)/.test(client) && /<ThemeTemplateCard\b/.test(client) && !/MoreThemesCard/.test(client) && /lg:grid-cols-3/.test(client) && /data-theme-marketplace-open="more"[\s\S]{0,200}onClick=\{\(e\) => openThemes\(e\.currentTarget\)\}[\s\S]{0,1200}\{tt\("Show more"\)\}/.test(client))
  {
    /* Changed on purpose (round 24): the order Browse themes puts first, and that every one of them is a template the code ships. */
    const first = (client.match(/export const BROWSE_THEMES_FIRST = \[([^\]]+)\]/)?.[1] ?? "").match(/"[^"]+"/g)?.map((x) => x.slice(1, -1)) ?? []
    const names = first.map((slug) => CODE_TEMPLATES.find((t) => t.slug === slug)?.name)
    /* Changed on purpose (r67): the owner: the Ebook in Clothing's place, and Notion creator, Digital studio and Fitness as a fourth row. */
    /* Changed on purpose (r68): the owner: Digital studio and Digital products swap places, so Digital products is eleventh. */
    check("  Browse themes' first twelve: Storelib Default first, the Ebook, Notion templates, Night shop, Poster shop and Print on demand, then Notion creator, Digital products and Fitness", names.join("|") === "Storelib Default|Ebook|Merch|Digital studio|Art books|Notion templates|Night shop|Poster shop|Print on demand|Notion creator|Digital products|Fitness", names.join(", "))
    check("  and the rest of the marketplace fills what is left, in its own order", /return \[\.\.\.first, \.\.\.listings\.filter\(\(l\) => !first\.includes\(l\)\)\]\.slice\(0, count\)/.test(client))
  }
  check("  with a Theme marketplace button beside the heading that opens the popup", /data-theme-marketplace-open="heading"[\s\S]{0,1200}\{tt\("Theme marketplace"\)\}/.test(client) && /text-\[14px\] font-semibold/.test(client) && !/MARKETPLACE_PATH/.test(client) && /<ThemeMarketplace\b/.test(client))
  const card = read("components/themes/theme-card.tsx")
  check("the card: picture, bold name, by author, action at the row's end", /aspect-\[4\/3\]/.test(card) && /font-semibold/.test(card) && /tt\("by \{author\}"/.test(card) && /\{action \? <div className="shrink-0">\{action\}<\/div> : null\}/.test(card))
  check("  scrolls the full page on a mouse's hover, by transform, and a tap is the preview", /e\.pointerType === "mouse" && pan\(true\)/.test(card) && /translate3d\(0, \$\{-distance\}px, 0\)/.test(card) && /<a\s+ref=\{frame\}\s+href=\{href\}/.test(card) && /prefers-reduced-motion: reduce/.test(card))
  check("  the hover label follows the mouse that slides the picture", /f\.dataset\.hover = on \? "on" : "off"/.test(card) && /group-data-\[hover=on\]\/frame:opacity-100/.test(card))
  const market = read("app/(storelib)/(marketing)/themes/themes-marketplace.tsx")
  /* Changed on purpose (r58): after Shopify's theme store, categories are pages of their own (links), price and features are checkboxes, and the search field is gone; tests/theme-seo-r58.test.ts holds the rest. */
  check("the marketplace has categories, Free Paid and Grow, features and sort", /<CategoryRow\b/.test(market) && /\{ id: "paid", label: "Paid" \}/.test(market) && /THEME_FEATURES\.map/.test(market) && /THEME_SORTS\.map/.test(market))
  const detail = read("app/(storelib)/(marketing)/themes/[slug]/theme-detail.tsx")
  const detailPage = read("app/(storelib)/(marketing)/themes/[slug]/page.tsx")
  /* Changed on purpose (the owner, theme releases round): a listing has a description written in /admin/themes, shown under the name only when there is one. */
  /* Changed on purpose (r58): the page is drawn on the server for search: the gallery of the home page on a computer and a phone, the whole screenshots a link away, Use this template, and the demo in a new tab rather than a frame. */
  check("a theme's page: the gallery on a computer and a phone, Use this template, the demo, the description only when written", /data-theme-gallery/.test(detailPage) && /img\.phone/.test(detailPage) && /img\.fullDesktop/.test(detailPage) && /Use this template/.test(detail) && /View demo/.test(detail) && /listing\.description && copy\.intro !== listing\.description \? <p/.test(detailPage))
  check("  signed out goes to sign in and back", /\/login\?next=\$\{encodeURIComponent\(`\$\{listingPath\(slug\)\}\?add=1`\)\}/.test(read("components/themes/use-add-theme.ts")) && /p\.get\("add"\) !== "1"/.test(detail))
  check("the preview page has no creator and is never indexed", /const NOBODY = "00000000-0000-0000-0000-000000000000"/.test(read("app/(site)/theme-preview/[slug]/page.tsx")) && /robots: \{ index: false/.test(read("app/(site)/theme-preview/[slug]/page.tsx")))
  check("  framed by storelib.com only, with ?embedded=1", /url\.pathname\.startsWith\("\/theme-preview\/"\) \|\|/.test(read("proxy.ts")))
  check("no creator can take /themes or /theme-preview as a handle", isReservedRootSegment("themes") && isReservedRootSegment("theme-preview") && /"theme-preview", "themes",/.test(read("proxy.ts")))
  for (const f of ["components/themes/theme-card.tsx", "app/(storelib)/(marketing)/themes/themes-marketplace.tsx", "app/(storelib)/(marketing)/themes/[slug]/theme-detail.tsx", "app/(storelib)/admin/themes/themes-admin.tsx", "app/(storelib)/admin/_console/panel-plan.tsx", "components/themes/add-status.tsx"]) {
    const words = stripComments(read(f))
    check(`no AI words or em dashes in ${f}`, !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform your)\b/i.test(words) && !/—/.test(words))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
