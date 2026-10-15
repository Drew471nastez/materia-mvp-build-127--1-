/**
 * PUBLISHING AND THE CACHES
 *
 * 1. An imported theme's file address is versioned by what the file is drawn
 *    from (lib/storelib-theme/compat/asset-version.ts): a live setting saved
 *    without Publish moves a `.css.liquid` file's address, and a Publish that
 *    left a file alone leaves its address alone.
 * 2. A product, variant, stock or collection row the database changed pings
 *    app/api/internal/invalidate (Supabase part 179), which purges the
 *    store's tags at most once per window and never drops the last change.
 */
import { readFileSync } from "node:fs"

import { ASSET_RENDER_SALT, assetSource, assetVersion, isContentVersion, plainAssetVersion, settingsDigest, textHash, themeDigest } from "../lib/storelib-theme/compat/asset-version"
import { compatThemeFor, themeAssetUrl } from "../lib/website-builder/compat-site"
import { renderString } from "../lib/storelib-theme/compat/runtime"
import { PingGate, mergePing, parsePing } from "../lib/cache/db-invalidate"
import { POST } from "../app/api/internal/invalidate/route"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

console.log("\nThe hash")
{
  check("sha256, hex", textHash("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  check("the same text, the same hash", textHash("x".repeat(10000)) === textHash("x".repeat(10000)))
  check("a different text, a different hash", textHash("a") !== textHash("b"))
  check("settings: one key's value changes the digest, length kept", settingsDigest({ c: "#111111" }) !== settingsDigest({ c: "#222222" }))
  check("settings: none is the same as empty", settingsDigest(null) === settingsDigest({}))
  const v = plainAssetVersion("body{}")
  check("a version reads h- and sixteen hex digits", /^h-[0-9a-f]{16}$/.test(v) && isContentVersion(v), v)
  check("a published_at version is not one", !isContentVersion("20261015T120000123Z") && !isContentVersion("1") && !isContentVersion("edit") && !isContentVersion("draft-1700000000000"))
  check("the render salt is part of it", typeof ASSET_RENDER_SALT === "string" && ASSET_RENDER_SALT.length > 0)
}

const ROWS: Record<string, string> = {
  "shopify/assets/theme.css": "body{color:red}",
  "shopify/assets/theme.js": "console.log(1)",
  "shopify/assets/vars.css.liquid": ":root{--c:{{ settings.colour }}}",
  "shopify/assets/old.scss.liquid": "$c: {{ settings.colour }}; a{color:$c}",
  "shopify/locales/en.default.json": "{}",
  "shopify/sections/hero.liquid": "<div>hero</div>",
}

console.log("\nWhat each file's version depends on")
{
  const s1 = { colour: "#111111" }
  const s2 = { colour: "#222222" }
  check("a plain file: its own text", assetSource(ROWS, "theme.css")?.liquid === false && assetVersion(ROWS, "theme.css", s1) === plainAssetVersion(ROWS["shopify/assets/theme.css"]))
  check("  not the settings", assetVersion(ROWS, "theme.css", s1) === assetVersion(ROWS, "theme.css", s2))
  check("  not another file", assetVersion(ROWS, "theme.css", s1) === assetVersion({ ...ROWS, "shopify/assets/theme.js": "console.log(2)" }, "theme.css", s1))
  check("  its own text does", assetVersion(ROWS, "theme.css", s1) !== assetVersion({ ...ROWS, "shopify/assets/theme.css": "body{color:blue}" }, "theme.css", s1))
  check("a .css.liquid file: drawn with Liquid", assetSource(ROWS, "vars.css")?.liquid === true)
  check("  a setting changes it, same length", assetVersion(ROWS, "vars.css", s1) !== assetVersion(ROWS, "vars.css", s2))
  check("  so does another asset, whose address it may print", assetVersion(ROWS, "vars.css", s1) !== assetVersion({ ...ROWS, "shopify/assets/theme.js": "console.log(2)" }, "vars.css", s1))
  check("  and a locale", assetVersion(ROWS, "vars.css", s1) !== assetVersion({ ...ROWS, "shopify/locales/en.default.json": "{\"a\":1}" }, "vars.css", s1))
  check("  but not a section, which an asset never reads", assetVersion(ROWS, "vars.css", s1) === assetVersion({ ...ROWS, "shopify/sections/hero.liquid": "<div>new</div>" }, "vars.css", s1))
  check("x.scss.css comes from x.scss.liquid, with the settings", assetSource(ROWS, "old.scss.css")?.liquid === true && assetVersion(ROWS, "old.scss.css", s1) !== assetVersion(ROWS, "old.scss.css", s2))
  check("a file the install does not have has none", assetVersion(ROWS, "missing.css", s1) === null)
  check("the theme digest is order free", themeDigest(ROWS) === themeDigest(Object.fromEntries(Object.entries(ROWS).reverse())))
}

console.log("\nThe address a live page prints")
{
  const id = "11111111-2222-4333-8444-555555555555"
  const settings = (colour: string) => ({ colour, compat: { kind: "shopify", theme: "Dawn" } })
  const urlOf = (version: string, s: unknown, rows = ROWS) => (name: string) => {
    const theme = compatThemeFor(id, version, rows, s)
    return renderString(`{{ '${name}' | asset_url }}`, theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
  }
  const a = urlOf("20261001T100000Z", settings("#111111"))
  const b = urlOf("20261001T100000Z", settings("#222222"))
  const published = urlOf("20261015T090000Z", settings("#111111"))
  check("a .css.liquid file's address moves with a setting saved without Publish", a("vars.css") !== b("vars.css"), [a("vars.css"), b("vars.css")])
  check("  a plain file's does not", a("theme.css") === b("theme.css"))
  check("a Publish that changed nothing moves no address", a("theme.css") === published("theme.css") && a("vars.css") === published("vars.css"))
  check("the address is the route's, with the content version", a("theme.css") === themeAssetUrl(id, plainAssetVersion(ROWS["shopify/assets/theme.css"]), "theme.css"), a("theme.css"))
  const edit = urlOf("edit", settings("#111111"))
  check("the builder's and a preview's addresses keep their own version, which the route never caches", edit("theme.css") === themeAssetUrl(id, "edit", "theme.css") && urlOf("draft-1", settings("#1"))("vars.css") === themeAssetUrl(id, "draft-1", "vars.css"))
  check("a file the install does not have keeps the publish's version", a("nothing.css") === themeAssetUrl(id, "20261001T100000Z", "nothing.css"))
}

console.log("\nThe route")
{
  const route = read("app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts")
  check("a published file is still cached for a year", route.includes(`"public, max-age=31536000, immutable"`))
  check("a hash that is not the file's own is held for a minute", /isContentVersion\(version\) && current !== version \? "public, max-age=60" : cache/.test(route))
  check("  for a plain file and for a Liquid one", route.includes("cacheFor(plainAssetVersion(text))") && route.includes("assetVersion(files, name, settings)"))
  check("the old published_at addresses are still answered (no version is refused)", !/isContentVersion\(version\)\)? return new NextResponse\("Not found"/.test(route))
  const site = read("lib/storelib-theme/compat/site.ts")
  check("a live page is still never held by a shared cache", /"private, no-cache"/.test(site) && !/s-maxage/.test(site))
}

console.log("\nA ping from the database")
{
  const C = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  const P = "11111111-2222-4333-8444-555555555555"
  check("a ping reads", JSON.stringify(parsePing({ creatorId: C, kind: "product", productId: P, slug: "film-presets", op: "UPDATE" })) === JSON.stringify({ creatorId: C, kind: "product", productId: P, slug: "film-presets", op: "UPDATE" }))
  check("anything else does not", parsePing(null) === null && parsePing({ creatorId: "x", kind: "product" }) === null && parsePing({ creatorId: C, kind: "orders" }) === null)
  check("a bad product id or slug is dropped, not trusted", (() => { const p = parsePing({ creatorId: C, kind: "variant", productId: "1; drop", slug: "../x" }); return p !== null && p.productId === null && p.slug === null })())
  let b = mergePing(null, parsePing({ creatorId: C, kind: "inventory", productId: P })!)
  check("stock leaves Explore alone", b.explore === "none")
  b = mergePing(b, parsePing({ creatorId: C, kind: "product", productId: P, slug: "a", op: "UPDATE" })!)
  check("a product refreshes it", b.explore === "changed" && b.productIds.length === 1 && b.slugs[0] === "a")
  b = mergePing(b, parsePing({ creatorId: C, kind: "product", productId: P, op: "DELETE" })!)
  check("a deleted one drops it at once", b.explore === "taken-down")

  let t = 0
  const gate = new PingGate(10_000, () => t)
  const ping = (slug: string) => parsePing({ creatorId: C, kind: "product", productId: P, slug })!
  const first = gate.add(ping("one"))
  check("the first ping purges at once", "now" in first && first.now.slugs[0] === "one")
  t = 2000
  const second = gate.add(ping("two"))
  check("one inside the window is held for the rest of it", "later" in second && second.later === 8000, second)
  t = 3000
  check("and the next is folded into it", "merged" in gate.add(ping("three")))
  t = 10_000
  const held = gate.take(C)
  check("the held purge carries every change since, the last one too", held !== null && held.slugs.join() === "two,three", held)
  t = 10_500
  check("the window starts again from that purge", "later" in gate.add(ping("four")))
  t = 40_000
  check("a held purge whose timer never ran is not waited on for ever", "now" in gate.add(ping("five")))
  const other = gate.add(parsePing({ creatorId: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee", kind: "collection" })!)
  check("another store has its own window", "now" in other)
}

console.log("\nSupabase part 179")
{
  const sql = read("supabase/sql/run-now/179_cache_invalidation_pings.sql")
  const lines = sql.trimEnd().split("\n")
  check("a note, then one statement per line", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1).every((l) => /;$/.test(l)))
  for (const [table, kind] of [["products", "product"], ["product_variants", "variant"], ["inventory_levels", "inventory"], ["product_collections", "collection"], ["product_collection_items", "collection"]]) {
    check(`a trigger on ${table}, skipped with a notice when it or pg_net is missing`, sql.includes(`CREATE TRIGGER storelib_cache_ping AFTER INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.storelib_cache_ping('${kind}');`) && sql.includes(`IF to_regclass('public.${table}') IS NULL THEN RAISE NOTICE`) && sql.includes(`DROP TRIGGER IF EXISTS storelib_cache_ping ON public.${table};`))
  }
  check("every trigger line checks pg_net first", (sql.match(/IF NOT EXISTS \(SELECT 1 FROM pg_extension WHERE extname = 'pg_net'\) THEN RAISE NOTICE/g) ?? []).length === 5)
  const fn = lines.find((l) => l.startsWith("CREATE OR REPLACE FUNCTION public.storelib_cache_ping()")) ?? ""
  check("the ping goes out through pg_net, with the secret as a bearer token", fn.includes("PERFORM net.http_post(url := v_url") && fn.includes("'Authorization', 'Bearer ' || v_secret"))
  check("nothing is sent until the address and secret are set", fn.indexOf("coalesce(v_url, '') !~ '^https?://' OR coalesce(v_secret, '') = '' THEN RETURN NULL") < fn.indexOf("net.http_post"))
  check("a ping that fails never stops the write (every lookup and the post inside one EXCEPTION block)", /BEGIN IF TG_OP = 'DELETE' THEN r := to_jsonb\(OLD\);.*PERFORM net\.http_post\(.*EXCEPTION WHEN OTHERS THEN RAISE WARNING/.test(fn))
  check("once per store, kind and product per transaction", fn.includes("current_setting(v_key, true) = '1' THEN RETURN NULL") && fn.includes("set_config(v_key, '1', true)"))
  check("the settings table is server only", sql.includes("REVOKE ALL ON public.storelib_cache_invalidation FROM PUBLIC, anon, authenticated;") && sql.includes("ALTER TABLE public.storelib_cache_invalidation ENABLE ROW LEVEL SECURITY;"))
  check("the check after has a column for it", read("supabase/sql/run-now/99_check_after.sql").includes("as p179_cache_invalidation_pings"))
  check("and the four files carry it", read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 179_cache_invalidation_pings.sql"))
}

async function main() {
  console.log("\nThe endpoint")
  const route = read("app/api/internal/invalidate/route.ts")
  const post = (auth: string | null, body: unknown) => POST(new Request("http://localhost/api/internal/invalidate", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }))
  const good = { creatorId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", kind: "product" }
  delete process.env.CACHE_INVALIDATE_SECRET
  check("unset secret: 503, whatever is sent, nothing cleared", (await post("Bearer anything", good)).status === 503 && (await post(null, good)).status === 503)
  process.env.CACHE_INVALIDATE_SECRET = "s".repeat(40)
  check("a wrong or missing secret: 401", (await post("Bearer " + "t".repeat(40), good)).status === 401 && (await post("Bearer " + "s".repeat(39), good)).status === 401 && (await post(null, good)).status === 401)
  check("the right secret, a body that is not a ping: 400", (await post("Bearer " + "s".repeat(40), { creatorId: "x" })).status === 400)
  delete process.env.CACHE_INVALIDATE_SECRET
  check("the secret is compared in constant time", route.includes("matchesSecret(") && read("lib/api/require-secret.ts").includes("timingSafeEqual"))
  check("it clears the tags the editor's save clears", ["productTag(id)", "productTag(slug)", "creatorTag(b.creatorId)", "creatorShopTag(b.creatorId)", "exploreCatalogueChanged()", "exploreCatalogueTakenDown()", "revalidatePublishedProduct("].every((s) => route.includes(s)))
  check("a held purge runs after the answer", route.includes("after(async () =>") && route.includes("gate.take(ping.creatorId)"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
