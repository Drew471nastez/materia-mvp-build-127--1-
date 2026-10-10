/**
 * ===========================================================================
 *  ROUND 18, H18B: FASTER, AND STILL RIGHT
 * ===========================================================================
 * Every speed change of this round (lib/perf/optimizations.ts lists them
 * with their numbers) is held here to two things: it asks the database
 * less, and it answers exactly what it answered before. The cached ones are
 * held to three more, against a cache kept the way Next keeps it
 * (scripts/speed18/shims/next-cache.ts, installed through the test
 * loader's next/cache hook):
 *
 *   a cached public page never holds another creator's rows;
 *   it never holds a draft, a private column or anything about a visitor;
 *   its owner's publish, product change or theme change clears it, and
 *   clears nobody else's.
 *
 * The database is scripts/speed18/fake-postgrest.ts under the real
 * supabase-js, over the fixture in scripts/speed18/fixture.ts (two creators,
 * drafts and private columns carrying marker strings to look for).
 *
 * Run with:  pnpm test:push
 */
import { createClient } from "@supabase/supabase-js"
import { fakeFetch, setRtt, useFixture, type Fixture } from "../scripts/speed18/fake-postgrest"
import { visit } from "../scripts/speed18/context"
import { buildFixture, SITE, OTHER, DRAFT_MARKER, OTHER_MARKER, PRIVATE_MARKER } from "../scripts/speed18/fixture"
import * as nextCache from "../scripts/speed18/shims/next-cache"

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

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
;(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
setRtt(0)

const db = () => createClient("https://fixture.supabase.co", "service-fixture-key", { auth: { persistSession: false, autoRefreshToken: false } })

function fixtureWith(change: (f: Fixture) => void): Fixture {
  const f = buildFixture()
  change(f)
  return f
}

async function routeFacts() {
  section("The proxy asks about a site's name once (lib/website-builder/route-facts.ts)")
  const { readSiteFacts, siteFactsFor, rememberCreatorOf, forgetSiteFacts } = await import("@/lib/website-builder/route-facts")

  useFixture(buildFixture())
  const maya = await visit(() => readSiteFacts(db(), "Maya"))
  check("a username: its creator, a published website, not an imported theme", maya.value?.facts.creatorId === SITE.creatorId && maya.value.facts.published && !maya.value.facts.compat && !maya.value.failed, maya.value)
  check("in three round trips (profile, creator, install with its settings)", maya.foreground === 3, maya.trips.map((t) => t.table))

  useFixture(fixtureWith((f) => {
    const s = f.tables.store_theme_settings.find((r) => r.install_id === SITE.installId)!
    s.settings = { ...(s.settings as object), compat: { kind: "shopify" } }
  }))
  const compat = await visit(() => readSiteFacts(db(), "maya"))
  check("an imported Shopify theme is seen through the embed, as the fourth read saw it", compat.value?.facts.compat === true && compat.value.facts.published, compat.value)

  useFixture(fixtureWith((f) => {
    f.tables.store_theme_installs.find((r) => r.id === SITE.installId)!.status = "draft"
  }))
  const unpublished = await visit(() => readSiteFacts(db(), "maya"))
  check("nothing published: a creator, no website", unpublished.value?.facts.creatorId === SITE.creatorId && !unpublished.value.facts.published && !unpublished.value.facts.compat)

  useFixture(fixtureWith((f) => {
    f.tables.profiles = f.tables.profiles.filter((p) => p.id !== OTHER.userId)
  }))
  const bySlug = await visit(() => readSiteFacts(db(), "leo"))
  check("a creator slug with no profile of that name is still found", bySlug.value?.facts.creatorId === OTHER.creatorId && bySlug.value.facts.published)

  useFixture(buildFixture())
  const nobody = await visit(() => readSiteFacts(db(), "no-such-name"))
  check("a name nobody has: no creator, no website, and not a failure", nobody.value?.facts.creatorId === null && !nobody.value.facts.published && !nobody.value.failed)

  useFixture(fixtureWith((f) => {
    f.fail = ["store_theme_installs"]
  }))
  const broken = await visit(() => readSiteFacts(db(), "maya"))
  check("a database that does not answer is a failure, never \"no website\"", broken.value?.failed === true, broken.value)

  useFixture(buildFixture())
  const hinted = await visit(() => readSiteFacts(db(), "maya", SITE.creatorId))
  check("a connected domain that knows its creator asks one read", hinted.foreground === 1 && hinted.value?.facts.published === true, hinted.trips.map((t) => t.table))

  forgetSiteFacts()
  const together = await visit(() => Promise.all([siteFactsFor(db(), "maya"), siteFactsFor(db(), "MAYA")]))
  check("two questions asked together share one read", together.foreground === 3, together.trips.map((t) => t.table))

  forgetSiteFacts()
  rememberCreatorOf("maya", SITE.creatorId)
  const known = await visit(() => siteFactsFor(db(), "maya"))
  check("a name a domain named is looked up by its creator", known.foreground === 1)
  forgetSiteFacts()
}

/** Lets every refresh started behind a visitor finish, as the next visitor would find it. */
async function settle() {
  await Promise.allSettled(nextCache.pending.splice(0))
}

async function productPageTheme() {
  section("A live product page's theme is held with the site (lib/website-builder/product-page-theme.ts)")
  const { publishedProductTheme } = await import("@/lib/website-builder/product-page-theme")
  const { revalidatePublishedSite, creatorSiteTag, ownerOf } = await import("@/lib/website-builder/published-site")
  nextCache.resetCache()
  const fixture = buildFixture()
  useFixture(fixture)

  const first = await visit(() => publishedProductTheme(SITE.creatorId))
  const again = await visit(() => publishedProductTheme(SITE.creatorId))
  check("read once, then held: no round trip for the next visitor", first.foreground === 2 && again.foreground === 0, [first.foreground, again.foreground])
  const text = JSON.stringify(first.value)
  check("published only: no draft section and no draft setting in it", !text.includes(DRAFT_MARKER) && !text.includes("draft_"))
  check("no preview token in it", !text.includes("token-") && !text.includes("preview_token"))
  check("no product, price or stock in it: those stay fresh per visit", !text.includes("price_cents") && !text.includes("inventory") && !text.includes(PRIVATE_MARKER))
  const leo = await visit(() => publishedProductTheme(OTHER.creatorId))
  check("each creator's own entry: Maya's never holds Leo's rows, nor Leo's Maya's", !text.includes(OTHER_MARKER) && JSON.stringify(leo.value).includes(OTHER_MARKER) && first.value?.install.id === SITE.installId && leo.value?.install.id === OTHER.installId)
  const entries = nextCache.cacheEntries().filter((e) => e.key.includes("product-page-theme"))
  check("keyed and tagged by creator", entries.length === 2 && entries.every((e) => e.tags.length === 1 && (e.tags[0] === creatorSiteTag(SITE.creatorId) || e.tags[0] === creatorSiteTag(OTHER.creatorId))) && entries.every((e) => e.key.includes(SITE.creatorId) !== e.key.includes(OTHER.creatorId)), entries.map((e) => e.tags))

  /* Maya publishes a new product page: her pages change in the database, and Publish revalidates her site. */
  const page = fixture.tables.store_theme_pages.find((r) => r.install_id === SITE.installId && r.page_key === "product")!
  page.sections = [{ id: "new", type: "rich_text", settings: { heading: "Published just now" } }]
  await visit(() => revalidatePublishedSite(SITE.creatorId))
  check("Publish revalidates her tag and her rendered pages", nextCache.revalidatedTags.some((t) => t.tag === creatorSiteTag(SITE.creatorId)) && nextCache.purgedPaths.some((p) => p.path === "/w/maya" && p.type === "layout"))
  await visit(() => publishedProductTheme(SITE.creatorId))
  await settle()
  const after = await visit(() => publishedProductTheme(SITE.creatorId))
  check("her next visitors see the published change", JSON.stringify(after.value).includes("Published just now"), after.value?.product)
  const leoAfter = await visit(() => publishedProductTheme(OTHER.creatorId))
  check("and Leo's entry was not touched: still held, no round trip", leoAfter.foreground === 0 && leoAfter.background === 0 && JSON.stringify(leoAfter.value).includes(OTHER_MARKER))

  /* Unpublishing takes it away for good, not after an hour. */
  fixture.tables.store_theme_installs.find((r) => r.id === SITE.installId)!.status = "draft"
  await visit(() => revalidatePublishedSite(SITE.creatorId))
  await visit(() => publishedProductTheme(SITE.creatorId))
  await settle()
  const gone = await visit(() => publishedProductTheme(SITE.creatorId))
  check("unpublished: the next visitors find no theme, so no product page", gone.value === null)
  fixture.tables.store_theme_installs.find((r) => r.id === SITE.installId)!.status = "published"

  nextCache.resetCache()
  useFixture(fixtureWith((f) => {
    f.fail = ["store_theme_installs"]
  }))
  const broken = await visit(() => publishedProductTheme(SITE.creatorId))
  check("a database that did not answer is thrown, never held as \"no website\"", !!broken.error && nextCache.cacheEntries().filter((e) => e.key.includes("product-page-theme")).length === 0)

  section("The live page's section files are held with the site, and a failed read is not")
  nextCache.resetCache()
  useFixture(buildFixture())
  const settings = {}
  const live1 = await visit(() => ownerOf(SITE.creatorId, SITE.installId, settings, { cached: true }))
  const live2 = await visit(() => ownerOf(SITE.creatorId, SITE.installId, settings, { cached: true }))
  check("the second visitor asks nothing for the files", live1.trips.some((t) => t.table === "store_theme_custom_files") && !live2.trips.some((t) => t.table === "store_theme_custom_files"))
  const preview = await visit(() => ownerOf(SITE.creatorId, SITE.installId, settings, { cached: false }))
  check("a preview or a cover still reads its files directly", preview.trips.some((t) => t.table === "store_theme_custom_files"))
  nextCache.resetCache()
  useFixture(fixtureWith((f) => {
    f.fail = ["store_theme_custom_files"]
  }))
  const failedFiles = await visit(() => ownerOf(SITE.creatorId, SITE.installId, settings, { cached: true }))
  check("a failed read of the files is thrown and nothing is held", !!failedFiles.error && !nextCache.cacheEntries().some((e) => e.key.includes("section-sources")))
}

async function collectionPages() {
  section("A collection page's members are held with the shop (lib/website-builder/collection-members.ts)")
  const { collectionMembers } = await import("@/lib/website-builder/collection-members")
  const { creatorShopTag } = await import("@/lib/website-builder/published-site")
  nextCache.resetCache()
  const fixture = buildFixture()
  useFixture(fixture)
  const first = await visit(() => collectionMembers(SITE.creatorId, "maya-best"))
  const again = await visit(() => collectionMembers(SITE.creatorId, "maya-best"))
  const mayaIds = new Set(fixture.tables.products.filter((p) => p.creator_id === SITE.creatorId).map((p) => p.id))
  check("read once, then held for the next visitor", first.foreground === 3 && again.foreground === 0 && (first.value?.productIds.length ?? 0) > 0, [first.foreground, again.foreground])
  check("only the shop's own products are members", (first.value?.productIds ?? []).every((id) => mayaIds.has(id)))
  const crossed = await visit(() => collectionMembers(OTHER.creatorId, "maya-best"))
  check("another shop asking for Maya's handle finds nothing", crossed.value === null)
  const missing1 = await visit(() => collectionMembers(SITE.creatorId, "no-such-collection"))
  const missing2 = await visit(() => collectionMembers(SITE.creatorId, "no-such-collection"))
  check("a collection that is not there is asked again, never held as a 404", missing1.value === null && missing2.foreground > 0)
  const held = nextCache.cacheEntries().filter((e) => e.key.includes("collection-members"))
  check("held under the shop's tag, keyed by creator and handle", held.length === 1 && held[0].tags[0] === creatorShopTag(SITE.creatorId) && held[0].key.includes(SITE.creatorId) && held[0].key.includes("maya-best"))
  /* A product leaves the collection; the shop tag (a deleted product, lib/products/forget-product.ts) or the minute clears it. */
  fixture.tables.product_collection_items = fixture.tables.product_collection_items.filter((i) => i.product_id !== first.value?.productIds[0])
  nextCache.clock.advance(61_000)
  await visit(() => collectionMembers(SITE.creatorId, "maya-best"))
  await settle()
  const later = await visit(() => collectionMembers(SITE.creatorId, "maya-best"))
  check("within the shop's minute the page lists what the collection holds now", !later.value?.productIds.includes(first.value!.productIds[0]))
}

async function main() {
  await routeFacts()
  await productPageTheme()
  await collectionPages()
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
