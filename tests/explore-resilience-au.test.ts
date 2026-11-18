/**
 * ===========================================================================
 *  ROUND AU: A PRODUCTS READ THAT FAILED IS NOT AN EMPTY PAGE OR A 404
 * ===========================================================================
 * Production logged "[ExplorePage] Products error: ... took longer than 20s",
 * "[CategoryPage] Products error: TimeoutError", "explore-catalogue ... no
 * products read" and "creator-page-head ... a read failed, so the answer is
 * not held". Held here:
 *
 *   Explore and its categories: each products try is bounded and asked once
 *   more; a failure shows this instance's last good catalogue, never held as
 *   a catalogue, and with none the grid says the products did not load and
 *   the browser asks again (never "No products found");
 *   a takedown forgets the last good copy at once;
 *   a creator page's held reads answer the last good one when a read fails,
 *   and a save forgets it;
 *   a product page whose read failed is the error screen, never a 404, and
 *   the failure is never held as "no such product";
 *   SQL part 451 is the index the catalogue reads by, and is in the bundles.
 *
 * Over the speed harness (scripts/speed18): the real supabase-js against the
 * fake PostgREST, Next's data cache kept as Next keeps it.
 *
 * Run with:  pnpm test:push
 */
import { fakeFetch, setRtt, useFixture, type Fixture } from "../scripts/speed18/fake-postgrest"
import { visit } from "../scripts/speed18/context"
import { buildFixture, SITE } from "../scripts/speed18/fixture"
import * as nextCache from "../scripts/speed18/shims/next-cache"
import * as nextHeaders from "../scripts/speed18/shims/next-misc"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
;(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
;(globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }).__PUSH_TEST_NEXT_HEADERS__ = nextHeaders
setRtt(0)

function fixtureWith(change: (f: Fixture) => void): Fixture {
  const f = buildFixture()
  change(f)
  return f
}

/** Every prop named `name` anywhere in a rendered tree. */
function propsNamed(tree: unknown, name: string): unknown[] {
  const found: unknown[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return
    const props = (n as { props?: Record<string, unknown> }).props
    if (props && name in props) found.push(props[name])
    if (props) for (const v of Object.values(props)) Array.isArray(v) ? v.forEach(walk) : walk(v)
  }
  walk(tree)
  return found
}

async function catalogue() {
  section("Explore's catalogue: a failed read shows the last good one (lib/explore/catalogue-cache.ts)")
  const cache = await import("@/lib/explore/catalogue-cache")
  cache.forgetLastGoodCatalogues()
  nextCache.resetCache()

  const good = await cache.cachedExploreCatalogue(async () => [{ id: "a" }, { id: "b" }], "au-test")
  check("a good read is handed out", good.length === 2)
  nextCache.resetCache()
  const failedRead = await visit(() => cache.cachedExploreCatalogue(async (): Promise<{ id: string }[]> => {
    throw new Error("products: no answer")
  }, "au-test"))
  check("a read that failed answers the last good catalogue", !failedRead.error && JSON.stringify(failedRead.value) === JSON.stringify(good), failedRead.error)
  const emptyRead = await visit(() => cache.cachedExploreCatalogue(async () => [] as { id: string }[], "au-test"))
  check("so does an empty answer", !emptyRead.error && (emptyRead.value as unknown[]).length === 2)
  check("and neither is held as the catalogue", !nextCache.cacheEntries().some((e) => e.key.includes("au-test")))
  check("another list's last good copy is its own", await cache.cachedExploreCatalogue(async () => [] as unknown[], "au-other").then(() => false, () => true))
  check("held for half an hour at most", cache.lastGoodCatalogue("au-test", Date.now() + cache.LAST_GOOD_MAX_AGE_MS + 1) === null && cache.lastGoodCatalogue("au-test") !== null)

  cache.exploreCatalogueTakenDown()
  check("a takedown forgets it at once", cache.lastGoodCatalogue("au-test") === null)
  const afterTakedown = await visit(() => cache.cachedExploreCatalogue(async (): Promise<unknown[]> => {
    throw new Error("products: no answer")
  }, "au-test"))
  check("so a failed read after a takedown shows nothing rather than the product taken down", !!afterTakedown.error)
  check("the visitor waits a bounded time for the read", cache.CATALOGUE_WAIT_MS <= 10_000 && /inTimeOrThrow\(held, CATALOGUE_WAIT_MS/.test(code("lib/explore/catalogue-cache.ts")))
}

async function pages() {
  section("Explore and a category page, the database failing")
  const cache = await import("@/lib/explore/catalogue-cache")
  const explorePage = await import("@/app/(storelib)/(marketing)/explore/page")
  const categoryPage = await import("@/app/(storelib)/(marketing)/explore/[category]/page")
  const renderExplore = () => explorePage.default({ searchParams: Promise.resolve({}) } as never)
  const renderSearch = () => explorePage.default({ searchParams: Promise.resolve({ q: "maya" }) } as never)
  const renderCategory = () => categoryPage.default({ params: Promise.resolve({ category: "design" }), searchParams: Promise.resolve({}) } as never)

  cache.forgetLastGoodCatalogues()
  nextCache.resetCache()
  useFixture(fixtureWith((f) => {
    f.fail = ["products"]
  }))
  for (const [name, render] of [["Explore", renderExplore], ["a category page", renderCategory], ["a search", renderSearch]] as const) {
    const v = await visit(render)
    const listed = propsNamed(v.value, "initialProducts").flat()
    const productReads = v.trips.filter((t) => t.table === "products" && !t.background).length
    check(`${name} with no copy anywhere: no products, and the grid is told they did not load`, !v.error && listed.length === 0 && propsNamed(v.value, "catalogueUnavailable").includes(true), v.error ?? propsNamed(v.value, "catalogueUnavailable"))
    check(`  the products read was asked twice, not once and not forever`, productReads === 2, v.trips.map((t) => t.table))
  }

  useFixture(buildFixture())
  nextCache.resetCache()
  const good = await visit(renderCategory)
  const goodIds = propsNamed(good.value, "initialProducts").flat().map((p) => (p as { id: string }).id)
  check("a category page that read: products, and nothing said about loading", goodIds.length > 20 && !propsNamed(good.value, "catalogueUnavailable").includes(true))
  nextCache.resetCache()
  useFixture(fixtureWith((f) => {
    f.fail = ["products"]
  }))
  const later = await visit(renderCategory)
  check("then the database fails and the data cache is empty: the last good catalogue, the same products", JSON.stringify(propsNamed(later.value, "initialProducts").flat().map((p) => (p as { id: string }).id)) === JSON.stringify(goodIds) && !propsNamed(later.value, "catalogueUnavailable").includes(true))
  useFixture(buildFixture())

  const explore = code("app/(storelib)/(marketing)/explore/page.tsx")
  check("Explore's products read is bounded per try and asked once more", /readTwice\(/.test(explore) && /\.abortSignal\(signal\)/.test(explore) && /attemptMs: CATALOGUE_ATTEMPT_MS, budgetMs: CATALOGUE_BUDGET_MS/.test(explore))
  check("only a refused embed reads again without it", /if \(error && refusedEmbed\(error\)\)/.test(explore))
  const category = code("app/(storelib)/(marketing)/explore/[category]/page.tsx")
  check("the category page's too, with no single AbortSignal.timeout left", /readTwice\(/.test(category) && !/AbortSignal\.timeout/.test(category))

  const client = code("components/explore/explore-page-client.tsx")
  const categoryClient = code("components/explore/category-page-client.tsx")
  const retry = code("components/explore/use-catalogue-retry.ts")
  check("both grids draw the unavailable state before the empty one", /catalogueRetry\.state \? \(\s*<CatalogueUnavailable/.test(client) && /catalogueRetry\.state \? \(\s*<CatalogueUnavailable/.test(categoryClient))
  check("the browser asks again with router.refresh (an RSC request the CDN never holds), twice, then a Try again", /router\.refresh\(\)/.test(retry) && /CATALOGUE_RETRY_AFTER_MS = \[3000, 8000\]/.test(retry) && /Try again/.test(code("components/explore/catalogue-unavailable.tsx")))
  check("an offline device waits until it is back online", /addEventListener\("online"/.test(retry))
  const words = code("components/explore/catalogue-unavailable.tsx")
  check("its words name what happened", /Products did not load\./.test(words) && !/No products found/.test(words))
}

async function creatorPage() {
  section("A creator page's held reads answer the last good one (lib/commerce/creator-page-held.ts)")
  const held = await import("@/lib/commerce/creator-page-held")
  held.forgetCreatorPageLastGood()
  nextCache.resetCache()
  const key = ["creator-page-head", "v1", "c-au", "u-au", "au"]
  const good = await held.heldForCreatorPage(key, "c-au", "u-au", async () => ({ count: 4, failed: false }), (v) => v.failed)
  nextCache.resetCache()
  const bad = await held.heldForCreatorPage(key, "c-au", "u-au", async () => ({ count: 0, failed: true }), (v) => v.failed)
  check("a failed read answers the last good one (no noindex from a count of 0)", bad.count === 4 && good.count === 4, bad)
  check("and holds nothing", !nextCache.cacheEntries().some((e) => e.key.includes("creator-page-head")))
  held.forgetCreatorPageLastGood("c-au")
  nextCache.resetCache()
  const afterSave = await held.heldForCreatorPage(key, "c-au", "u-au", async () => ({ count: 0, failed: true }), (v) => v.failed)
  check("a save forgets it: the failed answer is the visit's own again", afterSave.failed === true)
  check("a save on this instance forgets it (lib/storefront/creator-page-purge)", /forgetCreatorPageLastGood\(creatorId\)/.test(code("lib/storefront/creator-page-purge.ts")) && /forgetCreatorPageLastGood\(userId\)/.test(code("lib/storefront/creator-page-purge.ts")))
}

async function productPage() {
  section("A product page whose read failed is not a 404 (lib/commerce/product-page-data.ts)")
  const data = await import("@/lib/commerce/product-page-data")
  const pageCache = await import("@/lib/commerce/product-page-cache")
  const { isSiteReadError } = await import("@/lib/website-builder/site-read")
  nextCache.resetCache()
  useFixture(fixtureWith((f) => {
    f.fail = ["products"]
  }))
  const shared = await visit(() => pageCache.cachedProductBySlug(SITE.productSlug, SITE.creatorId))
  check("the shared read throws instead of answering no product", !!shared.error && shared.value === undefined)
  check("and nothing is held for it", !nextCache.cacheEntries().some((e) => e.key.includes("product-by-slug")))
  const loaded = await visit(() => data.loadProductBySlug(SITE.productSlug, SITE.creatorId))
  check("the page's loader throws SiteReadError (the shop's error screen with Try again), never a null that is a 404", isSiteReadError(loaded.error), loaded.error ? String(loaded.error) : loaded.value)
  check("  after asking twice", loaded.trips.filter((t) => t.table === "products" && !t.background).length >= 3, loaded.trips.map((t) => t.table))

  nextCache.resetCache()
  useFixture(buildFixture())
  const ok = await visit(() => data.loadProductBySlug(SITE.productSlug, SITE.creatorId))
  check("with the database there, the product", (ok.value as { product?: { slug?: string } })?.product?.slug === SITE.productSlug)
  const missing = await visit(() => data.loadProductBySlug("no-such-product", SITE.creatorId))
  check("and a product that is not there is still not there (the 404 stays a 404)", !missing.error && (missing.value as { product: unknown }).product === null)
}

function sql() {
  section("SQL part 451: the index Explore's catalogue reads by")
  const part = raw("supabase/sql/run-now/451_explore_catalogue_index.sql")
  check("a partial index of exactly the catalogue's filters, newest first", /CREATE INDEX IF NOT EXISTS products_explore_catalogue_idx ON public\.products \(created_at DESC\) WHERE status = 'published' AND type <> 'physical' AND community_id IS NULL;/.test(part))
  check("and the creator page's grid", /CREATE INDEX IF NOT EXISTS products_creator_page_idx ON public\.products \(creator_id, created_at DESC\) WHERE status = 'published';/.test(part))
  check("nothing destructive", !/\b(DROP|DELETE|TRUNCATE|UPDATE)\b/.test(part.replace(/\/\*[\s\S]*?\*\//g, "")))
  const concurrently = raw("supabase/sql/RUN_EXPLORE_INDEXES_CONCURRENTLY.sql")
  check("the same two, CONCURRENTLY, for a large table", (concurrently.match(/^CREATE INDEX CONCURRENTLY IF NOT EXISTS/gm) ?? []).length === 2)
  check("in the bundles, the README and the check after", raw("supabase/sql/run-four/3_of_4_latest.sql").includes("products_explore_catalogue_idx") && raw("supabase/sql/run-now/README.md").includes("451_explore_catalogue_index.sql") && raw("supabase/sql/run-now/99_check_after.sql").includes("p451_explore_catalogue_index"))
}

async function main() {
  await catalogue()
  await pages()
  await creatorPage()
  await productPage()
  sql()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
