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
import { buildFixture, SITE, OTHER, ONEPAGE, DRAFT_MARKER, OTHER_MARKER, PRIVATE_MARKER } from "../scripts/speed18/fixture"
import * as nextCache from "../scripts/speed18/shims/next-cache"
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

const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))

async function onePage() {
  section("The OnePage asks less and still reads its products live (lib/onepage/published-page.ts)")
  const { onePageOwner, liveBlocksFor } = await import("@/lib/onepage/published-page")
  nextCache.resetCache()
  const fixture = buildFixture()
  useFixture(fixture)
  const page = fixture.tables.onepages.find((r) => r.id === ONEPAGE.id)!

  const owner = await visit(() => onePageOwner(SITE.creatorId, null, SITE.userId))
  check("a page naming its creator and owner reads them in one wave", owner.foreground === 4 && owner.value?.handle === SITE.username && owner.value.creatorId === SITE.creatorId && owner.value.publishedProducts === 30, [owner.foreground, owner.value?.handle])
  const legacy = await visit(() => onePageOwner(null, null, SITE.userId))
  check("a page that names only its owner is read the old way, to the same answer", legacy.value?.handle === owner.value?.handle && legacy.value?.creatorId === owner.value?.creatorId && legacy.value?.publishedProducts === owner.value?.publishedProducts && legacy.value?.canonical === owner.value?.canonical)
  check("nothing private of the owner is in what the page is handed", !JSON.stringify(owner.value).includes(PRIVATE_MARKER))

  const blocks = page.published_blocks as unknown[]
  /*
    React's cache() keeps an answer only inside the server renderer's
    request, which this suite has no part of; scripts/measure-speed18.mjs
    runs it per request and counts the shared read (lib/perf/optimizations.ts).
    Here: both sides go through the one cached reader, keyed by the blocks.
  */
  const lib = code("lib/onepage/published-page.ts")
  check("the metadata and the body share one read of the page's products, per request", /const liveBlocksOnce = cache\(/.test(lib) && /liveProducts \? await liveBlocksFor\(/.test(lib) && /\.blocks = await liveBlocksFor\(\w+\.seller_id/.test(code("app/(marketing)/l/[slug]/page.tsx")))
  const first = await visit(() => liveBlocksFor(SITE.creatorId, blocks))
  const productReads = (r: typeof first) => r.trips.filter((t) => t.table === "products").length
  check("and it answers what withLiveProducts answers", JSON.stringify(first.value) === JSON.stringify(await (await import("@/lib/onepage/live-products")).withLiveProducts((await import("@/lib/supabase/admin")).createAdminClient() as never, SITE.creatorId, blocks)))
  /* The creator deletes a product: the very next visitor's page no longer has it (nothing held across visits). */
  const named = (blocks.find((b) => (b as { type?: string }).type === "product") as { data: { product_id: string } }).data.product_id
  fixture.tables.products = fixture.tables.products.filter((p) => p.id !== named)
  const next = await visit(() => liveBlocksFor(SITE.creatorId, blocks))
  check("a deleted product leaves the page on the next visit, with nothing to purge", productReads(next) === 1 && !JSON.stringify(next.value).includes(named))

  const route = code("app/(marketing)/l/[slug]/page.tsx")
  check("a view is counted after the page is sent, by the same read and insert", /after\(async \(\) => \{[\s\S]*from\("onepage_views"\)[\s\S]*\.select\("id"\)[\s\S]*\.insert\(/.test(route) && (route.match(/from\("onepage_views"\)/g) ?? []).length === 2)
  check("and the page still renders for every visitor (its products are live)", /export const dynamic = "force-dynamic"/.test(route))
}

async function explore() {
  section("Explore's catalogue is one copy for everybody (lib/explore/catalogue-cache.ts)")
  const { EXPLORE_CATALOGUE_TAG, cachedExploreCatalogue } = await import("@/lib/explore/catalogue-cache")
  const { purgeProductCaches } = await import("@/lib/products/forget-product")
  const pageModule = await import("@/app/(marketing)/explore/page")
  nextCache.resetCache()
  const fixture = buildFixture()
  useFixture(fixture)
  const render = () => pageModule.default({ searchParams: Promise.resolve({}) } as never)
  const products = (tree: unknown) => {
    const found: unknown[] = []
    const walk = (n: unknown) => {
      if (!n || typeof n !== "object") return
      const props = (n as { props?: Record<string, unknown> }).props
      if (props && Array.isArray(props.initialProducts)) found.push(...(props.initialProducts as unknown[]))
      if (props) for (const v of Object.values(props)) Array.isArray(v) ? v.forEach(walk) : walk(v)
    }
    walk(tree)
    return found as { id: string; title: string; status: string }[]
  }

  const first = await visit(render)
  const again = await visit(render, { cookies: { "sb-fixture-auth-token": "someone" } })
  const listed = products(first.value)
  check("the grid is drawn from it: products are there", listed.length > 50, listed.length)
  check("the second visitor, signed in or not, costs no catalogue read", !again.trips.some((t) => t.table === "products" || t.table === "profiles"), again.trips.map((t) => t.table))
  check("and is shown the same catalogue", JSON.stringify(products(again.value)) === JSON.stringify(listed))
  const catalogueTrips = first.trips.filter((t) => t.table === "products" || t.table === "profiles" || t.table === "membership_plans")
  check("read as a stranger: the anon key, no session", catalogueTrips.length >= 2 && catalogueTrips.every((t) => t.key === "anon"), catalogueTrips.map((t) => `${t.table}:${t.key}`))
  const held = JSON.stringify(nextCache.cacheEntries().filter((e) => e.key.includes("explore-catalogue")).map((e) => e.value))
  check("never a draft, and nothing private of a creator", !held.includes(DRAFT_MARKER) && !held.includes(PRIVATE_MARKER) && !held.includes("stripe"))
  check("tagged so the writes that change it can clear it", nextCache.cacheEntries().some((e) => e.key.includes("explore-catalogue") && e.tags.includes(EXPLORE_CATALOGUE_TAG)))

  /* An operator takes a product down: purgeProductCaches (the moderation route, a delete, an archive) expires it at once. */
  const taken = listed[0]
  fixture.tables.products.find((p) => p.id === taken.id)!.status = "unpublished"
  purgeProductCaches({ creatorId: SITE.creatorId, productId: taken.id, slug: null })
  const next = await visit(render)
  check("a product taken down is gone for the very next visitor", !products(next.value).some((p) => p.id === taken.id) && next.trips.some((t) => t.table === "products" && !t.background))

  const search = await visit(() => pageModule.default({ searchParams: Promise.resolve({ q: "market product 1" }) } as never))
  const searchAgain = await visit(() => pageModule.default({ searchParams: Promise.resolve({ q: "market product 1" }) } as never))
  check("a search is one person's words: read live each time, never held", search.trips.some((t) => t.table === "products") && searchAgain.trips.some((t) => t.table === "products"))

  nextCache.resetCache()
  useFixture(fixtureWith((f) => {
    f.fail = ["products"]
  }))
  const blinked = await visit(render)
  check("a database that did not answer is never held as an empty Explore", products(blinked.value).length === 0 && !nextCache.cacheEntries().some((e) => e.key.includes("explore-catalogue")))
  const empty = await visit(() => cachedExploreCatalogue(async () => [] as unknown[]))
  check("nor is an empty answer", !!empty.error && !nextCache.cacheEntries().some((e) => e.key.includes("explore-catalogue")))

  const saveRoute = code("app/api/revalidate/route.ts")
  check("a product save clears Explore and the creator's website shop", /exploreCatalogueChanged\(\)/.test(saveRoute) && /revalidateTag\(creatorShopTag\(owned\.creator_id\), "max"\)/.test(saveRoute) && /\.eq\("creator_id", creator\.id\)/.test(saveRoute))
  check("a ban and a closed account take their products off it at once", /exploreCatalogueTakenDown\(\)/.test(code("app/api/admin/creators/moderate/route.ts")) && /exploreCatalogueTakenDown\(\)/.test(code("lib/account/delete-account.ts")))
  const page = code("app/(marketing)/explore/page.tsx")
  check("For you and the visitor stay outside it, per visit", /cachedExploreCatalogue\(\(\) => readCatalog\(createPublicReadClient\(\)/.test(page) && !/cachedExploreCatalogue\([^\n]*(interests|getUser|cookies)/.test(page))
}

async function profileByName() {
  section("A profile by its name: the exact name first (lib/profile/profile-by-name.ts)")
  const { publicProfileByName } = await import("@/lib/profile/profile-by-name")
  const fixture = buildFixture()
  /* An older account kept in mixed case, and a name that ILIKE read as a pattern. */
  fixture.tables.profiles_public.push({ id: "aaaaaaaa-0000-4000-8000-000000000001", username: "ZarraBianco", display_name: "Zarra" })
  fixture.tables.profiles_public.push({ id: "aaaaaaaa-0000-4000-8000-000000000002", username: "a_b", display_name: "Underscore" })
  fixture.tables.profiles_public.push({ id: "aaaaaaaa-0000-4000-8000-000000000003", username: "axb", display_name: "Other" })
  useFixture(fixture)
  const exact = await visit(() => publicProfileByName(db(), "maya"))
  check("a name as stored is one exact read, which the username index answers", exact.value?.id === SITE.userId && exact.foreground === 1 && /username=eq\.maya/.test(exact.trips[0].query), exact.trips.map((t) => t.query))
  const otherCase = await visit(() => publicProfileByName(db(), "zarrabianco"))
  check("a name typed in another case is still found, by the read it always had", (otherCase.value as { username?: string } | null)?.username === "ZarraBianco" && otherCase.foreground === 2 && /ilike/.test(otherCase.trips[1].query))
  const pattern = await visit(() => publicProfileByName(db(), "a_b"))
  check("a name ILIKE read as a pattern is now its own page, not a 404", (pattern.value as { username?: string } | null)?.username === "a_b")
  const nobody = await visit(() => publicProfileByName(db(), "nobody-here"))
  check("nobody by that name is still nobody", nobody.value === null)
  const page = code("app/(marketing)/u/[username]/page.tsx")
  const batch = page.indexOf("{ data: catalogue, error: productsError }")
  const started = ["const followingPromise = Promise.resolve(", "const viewerFollowsPromise = viewerPromise.then(", "const placePromise = readProfileLocation(", "const offPagePromise = offChannel("]
  check("the creator page starts its follow counts, location and channels with its first batch, not after it", started.every((s) => page.indexOf(s) > 0 && page.indexOf(s) < batch) && /followingPromise,\s*viewerFollowsPromise,\s*headers\(\),[\s\S]{0,200}placePromise,\s*\]\)/.test(page) && /await offPagePromise/.test(page))
  check("and the viewer's own follow is still asked only for a signed in visitor who is not the owner", /data\.user && data\.user\.id !== profile\.id\s*\?\s*supabase\.from\("follows"\)\.select\("id"\)\.eq\("follower_id", data\.user\.id\)\.eq\("following_id", profile\.id\)/.test(page))
  check("the creator page and the member profile both read it this way", /publicProfileByName\(await createClient\(\), username\)/.test(code("lib/commerce/creator-page-data.ts")) && /publicProfileByName\(await createClient\(\), username\)/.test(code("lib/profile/member-profile-data.ts")))
}

async function main() {
  await routeFacts()
  await productPageTheme()
  await collectionPages()
  await onePage()
  await explore()
  await profileByName()
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
