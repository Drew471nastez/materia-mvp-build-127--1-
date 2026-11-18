/**
 * ===========================================================================
 *  PUBLIC PAGES: WHAT A STRANGER COSTS, WHAT IS NEVER SHARED, WHAT A SPIKE HITS
 * ===========================================================================
 * Reliability round (public delivery). Four promises, each held here:
 *
 *   ROUND TRIPS   a published OnePage costs the database nothing for its
 *                 second visitor (lib/onepage/public-cache), measured
 *                 against Next's data cache as Next 16 keeps it
 *                 (scripts/speed18/shims/next-cache.ts) over a fake
 *                 PostgREST under the real supabase-js; the page writes no
 *                 view row of its own.
 *   PUBLISH       a publish, a draft save that changes what the live page
 *                 reads, a new name or photo and a product change each
 *                 clear exactly the copies they change, at once; a publish
 *                 that failed clears nothing, so the copy that was live stays.
 *   PRIVATE       what is held is what a visitor is shown (no draft), and the
 *                 pages that are somebody's (previews, accounts, carts,
 *                 orders, receipts, members' communities) are drawn per
 *                 request and never given a shared cache header.
 *   SPIKES        a beacon is limited in memory first, so a OnePage spike
 *                 never becomes a write storm on rate_limit_hits, the table
 *                 publishing and payments are limited in; every public write
 *                 or search a stranger can call is limited.
 *
 * scripts/check-public-roundtrips.mjs measures the same on a production
 * build, surface by surface.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fakeFetch, setRtt, useFixture } from "../scripts/speed18/fake-postgrest"
import { visit } from "../scripts/speed18/context"
import { buildFixture, SITE, ONEPAGE, DRAFT_MARKER, PRIVATE_MARKER } from "../scripts/speed18/fixture"
import * as nextCache from "../scripts/speed18/shims/next-cache"
import * as nextHeaders from "../scripts/speed18/shims/next-misc"
import { readCode } from "./_source"

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
const section = (t: string) => console.log(`\n${t}`)
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
;(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
;(globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }).__PUSH_TEST_NEXT_HEADERS__ = nextHeaders
setRtt(0)

const tablesOf = (trips: { table: string }[]) => trips.map((t) => t.table)

/* ── ROUND TRIPS ───────────────────────────────────────────────────────── */

async function roundTrips() {
  section("A published OnePage: the second visitor costs the database nothing (lib/onepage/public-cache)")
  const { resolveOnePage, onePageOwner, liveBlocksFor, publishedShape } = await import("@/lib/onepage/published-page")
  nextCache.resetCache()
  const fixture = buildFixture()
  useFixture(fixture)

  /* What the page and its metadata read for one visit: the address, the owner, the blocks with their products. */
  const oneVisit = async () => {
    const address = await resolveOnePage(ONEPAGE.slug)
    if (address.kind !== "page") return { address, owner: null, blocks: null }
    const page = address.page as Record<string, unknown>
    const owner = await onePageOwner((page.seller_id as string) ?? null, (page.creator_id as string) ?? null, (page.owner_id as string) ?? null)
    const shape = publishedShape(page as never, owner)
    const blocks = await liveBlocksFor(shape.seller_id ?? "", shape.blocks)
    return { address, owner, blocks }
  }

  const first = await visit(oneVisit)
  check("the first visitor reads the page, its owner and its products", first.value?.address.kind === "page" && first.foreground > 0 && tablesOf(first.trips).includes("onepages") && tablesOf(first.trips).includes("products"), tablesOf(first.trips))
  const second = await visit(oneVisit)
  check("the second visitor reads nothing at all", second.trips.length === 0, tablesOf(second.trips))
  check("  and is shown the same page", JSON.stringify(second.value) === JSON.stringify(first.value))
  const fourth = (await visit(oneVisit), await visit(oneVisit))
  check("  so does every visitor after them, inside the minute", fourth.trips.length === 0)
  console.log(`        measured: ${first.foreground} round trips for the first visitor, ${second.trips.length} for each after`)

  /* What is held is what a visitor is shown. */
  const held = JSON.stringify(nextCache.cacheEntries().map((e) => e.value))
  check("no draft block is held beside the published copy", !held.includes(DRAFT_MARKER))
  check("nothing private of the owner is held", !held.includes(PRIVATE_MARKER))

  section("The layout around /<name>/links (storelib.me/<name>) reads nothing per visit either")
  const { heldShopLayout } = await import("@/lib/commerce/creator-page-data")
  const layoutFirst = await visit(() => heldShopLayout(SITE.username))
  const layoutSecond = await visit(() => heldShopLayout(SITE.username))
  check("its store and theme are read once, then held", layoutFirst.value?.creatorId === SITE.creatorId && layoutFirst.trips.length > 0 && layoutSecond.trips.length === 0, [layoutFirst.trips.length, layoutSecond.trips.length, layoutFirst.value])
  const strangerName1 = await visit(() => heldShopLayout("nobody-by-this-name"))
  const strangerName2 = await visit(() => heldShopLayout("nobody-by-this-name"))
  check("  a name that is nobody's is not held, and gets the plain skeleton", strangerName1.value?.creatorId === null && strangerName1.value.themePreset === "default" && strangerName2.trips.length > 0)
  const layout = readCode("app/(storelib)/(marketing)/u/[username]/layout.tsx")
  check("  the layout asks only the held facts, and the currency through its own tagged cache", /await heldShopLayout\(username\)/.test(layout) && /cachedStoreCurrency\(facts\.creatorId\)/.test(layout) && !/loadProfileByUsername|loadCreatorForUser/.test(layout))
  check("  the creator page itself still reads its profile per request (a renamed account never shows somebody else's page)", /const profile = await loadProfileByUsername\(username\)/.test(readCode("app/(storelib)/(marketing)/u/[username]/page.tsx")))

  section("Every answer a name gives is held, and none outlives what the name leads to")
  const nobody1 = await visit(() => resolveOnePage("nobody-has-this-name"))
  const nobody2 = await visit(() => resolveOnePage("nobody-has-this-name"))
  check("a name that leads nowhere is asked once, then held (a scan of made up names costs one read each)", nobody1.value?.kind === "missing" && nobody1.trips.length > 0 && nobody2.trips.length === 0, [nobody1.trips.length, nobody2.trips.length])
  /* Somebody publishes a page at that name: the publish clears it (onePageChangedFor names the page's address). */
  const { onePageChanged } = await import("@/lib/onepage/public-cache")
  const pageRow = fixture.tables.onepages.find((r) => r.id === ONEPAGE.id)!
  fixture.tables.onepages.push({ ...pageRow, id: "e9999999-9999-4999-8999-999999999999", slug: "nobody-has-this-name", owner_id: "99999999-9999-4999-8999-999999999999" })
  onePageChanged({ ownerUserId: "99999999-9999-4999-8999-999999999999", names: ["nobody-has-this-name"] })
  const published = await visit(() => resolveOnePage("nobody-has-this-name"))
  check("  and a page published at it is there for the very next visitor, never a held 404", published.value?.kind === "page")
  /* A page taken down by a writer that cleared nothing: after its minute the held page is replaced, not kept. */
  fixture.tables.onepages = fixture.tables.onepages.filter((r) => r.slug !== "nobody-has-this-name")
  nextCache.clock.advance(61_000)
  await visit(() => resolveOnePage("nobody-has-this-name"))
  await Promise.all(nextCache.pending)
  const gone = await visit(() => resolveOnePage("nobody-has-this-name"))
  check("  a page gone without a purge is gone after its minute (a stale answer is replaced, never kept)", gone.value?.kind === "missing", gone.value?.kind)
  const failing = buildFixture()
  failing.fail = ["onepages"]
  useFixture(failing)
  const broken = await visit(() => resolveOnePage("a-name-asked-while-down"))
  useFixture(fixture)
  const recovered = await visit(() => resolveOnePage("a-name-asked-while-down"))
  /* Changed on purpose (round rel-sites): a failed lookup is thrown (the page's error screen with Try again), never "missing" (the page's 404); tests/rel-sites.test.ts covers the held last answer. */
  check("a lookup that failed is not held: the next visitor asks again", broken.value === undefined && (broken.error as Error | undefined)?.name === "SiteReadError" && recovered.trips.length > 0, [recovered.trips.length, String(broken.error)])

  section("The page itself: no cookie, no header, no write (app/(storelib)/(marketing)/l/[slug]/page.tsx)")
  const route = readCode("app/(storelib)/(marketing)/l/[slug]/page.tsx")
  check("the render reads no cookie and writes no view row", !/cookies\(\)/.test(route) && !/onepage_views/.test(route) && !/\bafter\(/.test(route) && !/\.insert\(/.test(route))
  check("  the only header it reads is the host, and only to redirect a renamed address", (route.match(/headers\(\)/g) ?? []).length === 1 && /isOnePageHost\(\(await headers\(\)\)\.get\("host"\)\)/.test(route))
  check("  still drawn per request: a block's schedule is decided at each draw", /export const dynamic = "force-dynamic"/.test(route) && /private, no-cache, must-revalidate/.test((raw("next.config.mjs").split("source: '/l/:slug*'")[1] ?? "").split("source:")[0]))
  const lib = readCode("lib/onepage/published-page.ts")
  check("the held reads ask nothing about the visitor", !/next\/headers|lib\/supabase\/server|cookies\(|getUser|currentUser/.test(lib))
  check("  three reads held, each for a minute at most, under tags", (lib.match(/heldRead\(/g) ?? []).length === 3 && (lib.match(/revalidate: ONE_PAGE_HOLD_SECONDS/g) ?? []).length === 3)
  /* Changed on purpose (OnePage production audit, SEC1): the held page also carries its owner's store (lib/onepage/page-store withOwnerStore). */
  check("  what is held of the row is the published copy (publishedOnly)", /if \(answer\.kind !== "page"\) return answer/.test(lib) && /const page = await withOwnerStore\(db, publishedOnly\(answer\.page\)\)/.test(lib))
}

/* ── PUBLISH ───────────────────────────────────────────────────────────── */

async function publishing() {
  section("Publishing clears the live copy at once, and a failed publish keeps the live one")
  const { resolveOnePage, onePageOwner, liveBlocksFor } = await import("@/lib/onepage/published-page")
  const { onePageChanged, onePageChangeTags, onePageProductsChanged, onePageNameTag, onePageOwnerTag, shopProductsTag } = await import("@/lib/onepage/public-cache")
  const { creatorShopTag } = await import("@/lib/website-builder/published-site")
  nextCache.resetCache()
  const fixture = buildFixture()
  useFixture(fixture)
  const page = fixture.tables.onepages.find((r) => r.id === ONEPAGE.id)!

  await visit(() => resolveOnePage(ONEPAGE.slug))
  /* The creator publishes a new bio: the database has it, the held copy does not yet. */
  page.published_profile = { title: "Maya", bio: "Published just now" }
  const beforePurge = await visit(() => resolveOnePage(ONEPAGE.slug))
  check("without a purge the held copy is served (the minute's backstop)", beforePurge.trips.length === 0 && !JSON.stringify(beforePurge.value).includes("Published just now"))
  onePageChanged({ ownerUserId: SITE.userId, names: [ONEPAGE.slug, SITE.username] })
  const afterPurge = await visit(() => resolveOnePage(ONEPAGE.slug))
  check("after the publish's purge the next visitor reads the new copy", afterPurge.trips.length > 0 && JSON.stringify(afterPurge.value).includes("Published just now"))
  check("  expired at once, never stale: { expire: 0 }", /revalidateTag\(tag, \{ expire: 0 \}\)/.test(readCode("lib/onepage/public-cache.ts")))

  check("a change names the owner and every name, lower cased, each once, and never an empty one",
    JSON.stringify(onePageChangeTags({ ownerUserId: "u1", names: ["Maya", "maya", "", null, " Leo "] })) === JSON.stringify([onePageOwnerTag("u1"), onePageNameTag("maya"), onePageNameTag("leo")]))
  check("  nobody's change clears nothing", onePageChangeTags({ ownerUserId: "", names: [] }).length === 0)

  /* The owner's held answer: a new photo clears it through identityChanged (lib/account/identity-caches). */
  await visit(() => onePageOwner(SITE.creatorId, SITE.creatorId, SITE.userId))
  const ownerHeld = await visit(() => onePageOwner(SITE.creatorId, SITE.creatorId, SITE.userId))
  check("the owner is held too", ownerHeld.trips.length === 0)
  const { identityChanged } = await import("@/lib/account/identity-caches")
  const expired: string[] = []
  const ownerCleared: string[] = []
  await identityChanged({ userId: SITE.userId, creatorId: SITE.creatorId }, { expireTag: (t) => expired.push(t), expireSite: async () => {}, expireOnePage: async (u) => { ownerCleared.push(u) } })
  check("a new name or photo clears the OnePage's owner as well as the creator page and the website", ownerCleared.join() === SITE.userId && expired.includes(`creator:${SITE.userId}`))
  check("  and the route's own identityChanged uses lib/onepage/public-cache", /onePageChangedFor/.test(readCode("lib/account/identity-caches.ts")))

  /* A product the page draws is archived: the store's purge clears the blocks. */
  const shown = (page.published_blocks as { type?: string; data: { product_id?: string } }[]).find((b) => b.type === "product")!.data.product_id!
  await visit(() => liveBlocksFor(SITE.creatorId, page.published_blocks))
  fixture.tables.products = fixture.tables.products.map((p) => (p.id === shown ? { ...p, status: "archived", archived: true } : p))
  onePageProductsChanged(SITE.creatorId)
  const afterArchive = await visit(() => liveBlocksFor(SITE.creatorId, page.published_blocks))
  check("an archived product leaves the OnePage at the store's purge", afterArchive.trips.length > 0 && !JSON.stringify(afterArchive.value).includes(shown))
  check("the shop tag a OnePage also carries is the website's own", shopProductsTag(SITE.creatorId) === creatorShopTag(SITE.creatorId))

  section("Every writer of what the live page reads clears it")
  const publish = readCode("app/api/onepage/publish/route.ts")
  check("publish: cleared only after the update succeeded, so a failed publish keeps the live copy",
    publish.indexOf("if (publishError)") > 0 && publish.indexOf("await onePageChangedFor(ownerId") > publish.indexOf("if (publishError)") &&
      /return NextResponse\.json\(\{ error: "Failed to publish" \}, \{ status: 500 \}\)/.test(publish))
  check("  and the publish is one update of every published field together", (publish.match(/\.update\(publishData\)/g) ?? []).length === 1)
  const put = readCode("app/api/onepage/route.ts")
  check("a draft save clears the live copy only when it changed what the live page reads (settings, address, share picture, photo)",
    /* Changed on purpose (OnePage production audit, S2): a save that publishes (publish: true) changed the live copy, so it clears it too, under the old address and the one it wrote. */
    /if \(publishing \|\| updates\.settings !== undefined \|\| updates\.slug !== undefined \|\| updates\.share_image_mode !== undefined \|\| photoNow !== undefined\) \{\s*await onePageChangedFor\(ownerId, \[existing\.slug, \(updated as \{ slug\?: string \| null \} \| null\)\?\.slug\]\)/.test(put) &&
      put.indexOf("await onePageChangedFor(") > put.indexOf("if (error) {"))
  check("a new creator page domain clears it", /if \(moved && userId\) await onePageChangedFor\(userId\)/.test(readCode("lib/custom-domains/store.ts")))
  check("the creator page's publish (its name and photo sync) clears it", (readCode("app/api/store-builder/route.ts").match(/await onePageChangedFor\(page\.profileId\)/g) ?? []).length === 2)
  for (const p of ["app/api/revalidate/route.ts", "app/api/internal/invalidate/route.ts", "lib/products/forget-product.ts", "app/api/store/channels/product/route.ts"]) {
    check(`a product change clears the OnePage's blocks: ${p}`, /onePageProductsChanged\(/.test(readCode(p)))
  }
}

/* ── A COMMUNITY'S PUBLIC PAGE ─────────────────────────────────────────── */

async function communityPages() {
  section("A community's public page: the row is read once per visit, everything shown alike is held (lib/communities/server/public-cache)")
  const { loadSalesPage, topBarData, communityBySlug } = await import("@/lib/communities/server/public")
  const { memberPage } = await import("@/components/community/member/data")
  const { publicAboutExtras } = await import("@/lib/communities/server/about")
  const { communitySummary, communityDeleting } = await import("@/lib/communities/server/community-summary")
  const { communityPublicChanged, communityPublicTag, communityCreatorTags } = await import("@/lib/communities/server/public-cache")
  const { creatorTag } = await import("@/lib/commerce/product-page-cache")
  const { shopProductsTag } = await import("@/lib/onepage/public-cache")
  nextCache.resetCache()
  const fixture = buildFixture()
  useFixture(fixture)
  const community = fixture.tables.communities[0]
  const CID = community.id as string
  community.updated_at = "2026-10-01T09:00:00.000Z"
  const sold = fixture.tables.products.find((r) => r.creator_id === SITE.creatorId)!
  fixture.tables.community_tiers.push(
    { id: "7a000001-0000-4000-8000-000000000001", community_id: CID, name: "Free", description: null, position: 0, kind: "free", billing: null, product_id: null, benefits: [], is_default: true, archived_at: null, created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z" },
    { id: "7a000001-0000-4000-8000-000000000002", community_id: CID, name: "Studio", description: null, position: 1, kind: "paid", billing: "one_time", product_id: sold.id, benefits: [], is_default: false, archived_at: null, created_at: "2026-10-01T09:00:00.000Z", updated_at: "2026-10-01T09:00:00.000Z" },
  )
  const slug = community.slug as string

  /* What /community/<slug> and /about read for a stranger: the layout's memberPage, the page's load, the bar, the About facts and the metadata's. */
  const oneVisit = async () => {
    const page = await memberPage(slug)
    const meta = await communityBySlug(slug)
    const load = await loadSalesPage(slug, null)
    if (!load) return { state: page.state, meta: !!meta, load: null }
    const [bar, extras, summary, deleting] = await Promise.all([topBarData(load.community, null), publicAboutExtras(load.community), communitySummary(load.community.id), communityDeleting(load.community.id)])
    return { state: page.state, meta: !!meta, load: load.data, bar, extras, summary, deleting }
  }
  const first = await visit(oneVisit)
  const communityReads = (trips: { table: string }[]) => trips.filter((t) => t.table === "communities").length
  /* React's cache (one community read per request for the layout, the page and the metadata) is not per request outside Next; scripts/check-public-roundtrips.mjs measures it on a production build. */
  check("the first visitor reads the tiers, the creator and the figures", !!first.value?.load && ["community_tiers", "creators", "profiles", "products"].every((t) => tablesOf(first.trips).includes(t)), tablesOf(first.trips))
  const second = await visit(oneVisit)
  check("the second visitor reads the community's own row and nothing else", second.trips.length > 0 && second.trips.every((t) => t.table === "communities" && /select=id%2Ccreator_id|select=id,creator_id/.test(t.query)), second.trips.map((t) => `${t.table}${t.query.slice(0, 40)}`))
  check("  and is shown the same page", JSON.stringify(second.value) === JSON.stringify(first.value))
  console.log(`        measured: ${first.foreground} round trips for the first visitor, ${second.trips.length} for each after`)
  check("  the join is worked out for this viewer, from held prices", (first.value?.load?.join as { kind?: string } | undefined)?.kind !== undefined && JSON.stringify(first.value?.load?.community.options.map((o) => o.priceLine)).includes("$"))

  const held = JSON.stringify(nextCache.cacheEntries().map((e) => e.value))
  check("nothing private of the creator is held (no Stripe account, no email)", !/stripe_account_id|charges_enabled|@fixture\.test|PRIVATE-ROW/.test(held))
  check("  no entry is keyed by who is looking", nextCache.cacheEntries().every((e) => !/user-token|11111111-1111-4111-8111-111111111111/.test(e.key) || e.key.includes(SITE.creatorId)))

  section("Draft and suspended are decided from the live row: a 404 on the very next request, with nothing cleared")
  community.status = "draft"
  const drafted = await visit(oneVisit)
  check("made a draft: the next stranger gets no page (a 404)", drafted.value?.load === null && drafted.value?.state === "signed_out", drafted.value)
  community.status = "published"
  community.suspended_at = "2026-10-02T00:00:00.000Z"
  const suspended = await visit(oneVisit)
  check("suspended: the next stranger gets no page either", suspended.value?.load === null)
  community.suspended_at = null
  community.deleted_at = "2026-10-02T00:00:00.000Z"
  const deleted = await visit(oneVisit)
  check("deleted: the address leads nowhere", deleted.value?.load === null && deleted.value?.state === "missing")
  community.deleted_at = null
  const back = await visit(oneVisit)
  check("restored: the page is back at the next visit", !!back.value?.load)

  section("Every writer clears what it changed")
  sold.price_cents = 4321
  const stalePrice = await visit(oneVisit)
  check("without a clear the held price is served (the minute's backstop)", !JSON.stringify(stalePrice.value).includes("43.21"))
  nextCache.revalidateTag(shopProductsTag(SITE.creatorId), { expire: 0 })
  const newPrice = await visit(oneVisit)
  check("a product saved (the store's product tag, cleared by every product writer) is on the page at the next visit", JSON.stringify(newPrice.value).includes("43.21"))
  fixture.tables.community_tiers[1].name = "Studio pass"
  communityPublicChanged(CID)
  const renamedTier = await visit(oneVisit)
  check("a staff write (the community's tag, cleared after every gated request) is on the page at the next visit", JSON.stringify(renamedTier.value).includes("Studio pass"))
  const profile = fixture.tables.profiles.find((r) => r.id === SITE.userId)!
  profile.display_name = "Maya Renamed"
  nextCache.revalidateTag(creatorTag(SITE.creatorId), { expire: 0 })
  const renamedCreator = await visit(oneVisit)
  check("a new name or photo (identityChanged clears creator:<creator id>) is on the page and its bar at the next visit", JSON.stringify(renamedCreator.value?.bar).includes("Maya Renamed") && JSON.stringify(renamedCreator.value?.load).includes("Maya Renamed"))
  community.name = "Maya Club Two"
  community.updated_at = "2026-10-03T09:00:00.000Z"
  const renamedCommunity = await visit(oneVisit)
  check("a change to the row itself is a new held entry at once (keyed by updated_at)", JSON.stringify(renamedCommunity.value?.load).includes("Maya Club Two") && renamedCommunity.trips.length > 1)
  check("the creator's tags are the product page's and the store's own", JSON.stringify(communityCreatorTags(SITE.creatorId)) === JSON.stringify([creatorTag(SITE.creatorId), shopProductsTag(SITE.creatorId)]))
  check("  and every held entry carries the community's tag", nextCache.cacheEntries().filter((e) => e.key.includes(CID)).every((e) => e.tags.includes(communityPublicTag(CID))))

  section("A failed read and a draft are never held")
  nextCache.resetCache()
  const failing = buildFixture()
  failing.tables.communities[0].updated_at = "2026-10-01T09:00:00.000Z"
  failing.fail = ["community_tiers"]
  useFixture(failing)
  await visit(oneVisit)
  failing.fail = []
  const afterFailure = await visit(oneVisit)
  check("tiers that could not be read are asked again by the next visitor", tablesOf(afterFailure.trips).includes("community_tiers"), tablesOf(afterFailure.trips))
  nextCache.resetCache()
  failing.tables.communities[0].status = "draft"
  await visit(() => loadSalesPage(slug, null))
  check("a draft community's page is never held", nextCache.cacheEntries().length === 0, nextCache.cacheEntries().map((e) => e.key))

  section("Wiring")
  const gate = readCode("lib/communities/server/context.ts")
  const gateEnd = gate.slice(gate.indexOf("export async function requireCreatorCommunity"))
  check("every gated staff request clears the community's public page once it has answered", /communityPublicChangedAfter\(community\.id, community\.creator_id, community\.slug\)\s*return \{ ok: true, ctx, community/.test(gateEnd) && (gate.match(/communityPublicChangedAfter\(community\.id, community\.creator_id, community\.slug\)/g) ?? []).length === 2)
  const cache = readCode("lib/communities/server/public-cache.ts")
  check("  expired at once, never stale: { expire: 0 }", /revalidateTag\(communityPublicTag\(communityId\), \{ expire: 0 \}\)/.test(cache))
  check("  held a minute at most", /COMMUNITY_PUBLIC_HOLD_SECONDS = 60/.test(cache) && /revalidate: COMMUNITY_PUBLIC_HOLD_SECONDS/.test(cache))
  const lib = readCode("lib/communities/server/public.ts")
  check("only a community anybody may see is held; a caller's own database reads its own", /const held = !given && sharePreviewable\(community\)/.test(lib))
  check("the held reads ask nothing about the visitor", !/userId|viewer/.test(lib.slice(lib.indexOf("async function readSalesFacts"), lib.indexOf("export async function loadSalesPage"))))
  check("the layout's community is the page's (one read per request)", /communityBySlug\(slug\), currentUserForRequest\(\)/.test(readCode("components/community/member/data.ts")))
}

/* ── THE CREATOR PAGE ──────────────────────────────────────────────────── */

async function creatorPage() {
  section("storelib.com/<handle>: who the address is, read live; what it shows everybody, held (lib/commerce/creator-page-held)")
  const { heldForCreatorPage, creatorPageTags } = await import("@/lib/commerce/creator-page-held")
  const { creatorTag } = await import("@/lib/commerce/product-page-cache")
  const { shopProductsTag } = await import("@/lib/onepage/public-cache")
  nextCache.resetCache()
  let reads = 0
  const read = async () => {
    reads++
    return { rows: [1, 2, 3], failed: false }
  }
  await visit(() => heldForCreatorPage(["t", SITE.creatorId, SITE.userId], SITE.creatorId, SITE.userId, read, (v) => v.failed))
  await visit(() => heldForCreatorPage(["t", SITE.creatorId, SITE.userId], SITE.creatorId, SITE.userId, read, (v) => v.failed))
  check("read once, then held for every visitor", reads === 1, reads)
  nextCache.revalidateTag(creatorTag(SITE.creatorId), { expire: 0 })
  await visit(() => heldForCreatorPage(["t", SITE.creatorId, SITE.userId], SITE.creatorId, SITE.userId, read, (v) => v.failed))
  check("  a writer of the page (creatorPagesChanged clears creator:<creator id>) is read at the next visit", reads === 2, reads)
  let failing = 0
  const broken = async () => {
    failing++
    return { rows: [], failed: true }
  }
  await visit(() => heldForCreatorPage(["f", SITE.creatorId, SITE.userId], SITE.creatorId, SITE.userId, broken, (v) => v.failed))
  await visit(() => heldForCreatorPage(["f", SITE.creatorId, SITE.userId], SITE.creatorId, SITE.userId, broken, (v) => v.failed))
  check("  a read that failed is answered and never held", failing === 2, failing)
  check("  its tags are the ones every writer of the page clears (the creator, the person, the store's products)",
    JSON.stringify(creatorPageTags(SITE.creatorId, SITE.userId)) === JSON.stringify([creatorTag(SITE.creatorId), creatorTag(SITE.userId), shopProductsTag(SITE.creatorId)]) &&
      /if \(creatorId\) expire\(creatorTag\(creatorId\)\)/.test(readCode("lib/storefront/creator-page-purge.ts")) && /if \(userId\) expire\(creatorTag\(userId\)\)/.test(readCode("lib/storefront/creator-page-purge.ts")))

  const page = readCode("app/(storelib)/(marketing)/u/[username]/page.tsx")
  check("the profile by the name in the address and its creator are read live, never held (a renamed account never shows somebody else's page)",
    /const profile = await loadProfileByUsernameStrict\(username\)/.test(page) && /const creator = await loadCreatorForUserStrict\(profile\.id\)/.test(page) && /export const loadProfileByUsernameStrict = cache\(async \(username: string\) => \{[\s\S]{0,120}try \{\s*const row = await publicProfileByNameStrict\(stranger\(\), username\)/.test(readCode("lib/commerce/creator-page-data.ts")) && /export const loadCreatorForUserStrict = cache\(async \(userId: string\) => \{\s*try \{\s*const row = await readPublicRowStrict\(/.test(readCode("lib/commerce/creator-page-data.ts"))) // Changed on purpose (round AV): still read live every request; only a read that FAILED answers from this instance's last good row (tests/platform-issues-av.test.ts)
  check("  every held read of the page is keyed by the ids that lookup answered, never by the name alone",
    /heldForCreatorPage\(\["creator-page-catalogue", "v1", creator\.id, profile\.id\], creator\.id, profile\.id, readCatalogue/.test(page) && /heldForCreatorPage\(\["creator-page-head", "v1", creator\.id, profile\.id, handle\], creator\.id, profile\.id, readHead/.test(page))
  check("  and still reads nobody's cookie or header", !/cookies\(\)|headers\(\)|currentUserForRequest/.test(page))
  const held = readCode("lib/commerce/creator-page-held.ts")
  check("  held a minute at most, the CDN's own minute", /CREATOR_PAGE_HOLD_SECONDS = 60/.test(held) && /revalidate: CREATOR_PAGE_HOLD_SECONDS/.test(held))

  section("A creator's community cards are held, and cleared with the community")
  const lib = readCode("lib/communities/server/public.ts")
  check("the cards on a creator's page are held under the creator's and the cards' tags", /\["community-cards", "v1", creatorId\], \[communityCardsTag\(creatorId\), \.\.\.communityCreatorTags\(creatorId\)\]/.test(lib))
  check("  a Storelib suspension or hiding clears the community and its card", /communityPublicChanged\(communityId, \(row as \{ creator_id\?: string \| null \}\)\.creator_id \?\? null, \(row as \{ slug\?: string \| null \}\)\.slug \?\? null\)/.test(readCode("lib/communities/server/admin.ts")))

  section("A OnePage click is one request's worth of work (app/api/onepage/track)")
  const track = readCode("app/api/onepage/track/route.ts")
  check("it writes no onepage_clicks or onepage_views row (read only before the first event, which this click is after or would double)", !/from\("onepage_clicks"\)|from\("onepage_views"\)/.test(track) && /await recordLinkClick\(request, body\)/.test(track))
  check("  and uses only the server's own client, never the visitor's", !/lib\/supabase\/server/.test(track) && /createAdminClient\(\)/.test(track))
  check("  the older rows are still read before the first event", /"onepage_clicks", "id, block_id, url, visitor_id, created_at"/.test(readCode("lib/analytics/report-read.ts")))
}

/* ── PRIVATE ───────────────────────────────────────────────────────────── */

async function privatePages() {
  section("What is somebody's is drawn for them alone, and never given a shared cache header")
  const PRIVATE_ROUTES = [
    "app/(site)/w/[username]/preview/[token]/page.tsx",
    "app/(site)/w/[username]/preview/[token]/[page]/page.tsx",
    "app/(site)/w/[username]/preview/[token]/products/[slug]/page.tsx",
    "app/(site)/w/[username]/preview/[token]/products/page.tsx",
    "app/(site)/w/[username]/preview/[token]/collections/page.tsx",
    "app/(site)/w/[username]/preview/[token]/collections/[handle]/page.tsx",
    "app/(site)/w/[username]/account/page.tsx",
    "app/(site)/w/[username]/account/orders/[id]/page.tsx",
    "app/(site)/w/[username]/account/login/page.tsx",
    "app/(site)/w/[username]/cart/page.tsx",
    "app/(site)/w/[username]/password/page.tsx",
    "app/(site)/w/[username]/wishlist/page.tsx",
    "app/(site)/w/[username]/search/page.tsx",
    "app/(site)/cover-render/[pass]/page.tsx",
    "app/(storelib)/receipt/[token]/page.tsx",
    "app/(storelib)/receipt/cart/[sessionId]/page.tsx",
    "app/(storelib)/order-help/[id]/page.tsx",
    "app/(storelib)/purchase/success/page.tsx",
    "app/(storelib)/downloads/page.tsx",
    "app/(storelib)/checkout/receipt/page.tsx",
    "app/(storelib)/checkout/physical/order/[token]/page.tsx",
    "app/(storelib)/checkout/site/thanks/[token]/page.tsx",
    "app/(storelib)/checkout/site/track/page.tsx",
    "app/(storelib)/(marketing)/p/[slug]/page.tsx",
    "app/(storelib)/(marketing)/u/[username]/page.tsx",
    "app/(storelib)/(marketing)/[sellername]/page.tsx",
    "app/(storelib)/(marketing)/[sellername]/[productSlug]/page.tsx",
  ]
  for (const p of PRIVATE_ROUTES) {
    const code = readCode(p)
    check(`drawn per request, never held as a page: ${p}`, /export const dynamic = "force-dynamic"/.test(code) && !/export const revalidate = [1-9]/.test(code))
  }
  const community = readCode("app/(storelib)/(marketing)/community/[slug]/layout.tsx")
  check("every page of a community (members' posts, courses, drafts) is drawn per request", /await connection\(\)/.test(community) && !/export const revalidate/.test(community))
  check("  and a draft or suspended one is a real 404 for anybody but its staff, before anything streams", /if \(!communityOpen\(community\) && !viewer\?\.isOwner\) return false/.test(community) && /notFound\(\)/.test(community))

  const config = raw("next.config.mjs")
  const ruleFor = (source: string) => (config.split(`source: '${source}'`)[1] ?? "").split("source:")[0]
  for (const source of ["/p/:slug*", "/u/:username*", "/l/:slug*"]) {
    check(`${source} is private in every shared cache (a buyer's Download, an owner's Edit)`, /private, no-cache, must-revalidate/.test(ruleFor(source)) && !/s-maxage/.test(ruleFor(source)))
  }
  /*
    Changed on purpose (round 49, cdnpages): Explore is one HTML for everybody
    now. It reads no cookie and draws nobody's "For you" (interests are
    EMPTY_INTERESTS on the server; the browser asks the private
    /api/explore/interests after load, signed in only), so the CDN may hold the
    same copy for every request (Vercel-CDN-Cache-Control) and the old
    cookie-keyed pair (stranger held, session private) is gone. Never an RSC
    request, the editor's frame or a scheme being tried, and only on
    storelib.com.
  */
  const before = process.env.NEXT_PUBLIC_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co"
  const { default: nextConfig } = (await import(`${join(process.cwd(), "next.config.mjs")}?explore=${Date.now()}`)) as { default: { headers: () => Promise<{ source: string; has?: { type: string; key: string; value?: string }[]; missing?: { type: string; key: string }[]; headers: { key: string; value: string }[] }[]> } }
  process.env.NEXT_PUBLIC_SUPABASE_URL = before
  const exploreRules = (await nextConfig.headers()).filter((r) => r.source === "/explore/:path*")
  const shared = exploreRules.filter((r) => r.headers.some((h) => /public|s-maxage/.test(h.value)))
  const explorePage = readCode("app/(storelib)/(marketing)/explore/page.tsx")
  const interestsRoute = readCode("app/api/explore/interests/route.ts")
  const exploreClient = readCode("components/explore/explore-page-client.tsx")
  check("Explore is held at the edge the same for every request: no cookie decides it, and the page reads none",
    shared.length === 1 && shared[0].headers.some((h) => h.key === "Vercel-CDN-Cache-Control" && /^public, s-maxage=\d+/.test(h.value)) && !shared[0].headers.some((h) => h.key === "Cache-Control") &&
    !JSON.stringify([shared[0].has, shared[0].missing]).includes('"cookie"') && JSON.stringify(shared[0].missing?.map((m) => m.key).sort()) === JSON.stringify(["embedded", "rsc", "scheme"]) &&
    shared[0].has?.length === 1 && shared[0].has[0].type === "host" && /storelib/.test(shared[0].has[0].value ?? "") &&
    !/cookies\(\)|headers\(\)|currentUserForRequest/.test(explorePage) && /interests=\{EMPTY_INTERESTS\}/.test(explorePage))
  check("  and a signed in person's For you is asked after load from a private, no-store route",
    /"Cache-Control": "private, no-store"/.test(interestsRoute) && /"Vercel-CDN-Cache-Control": "no-store"/.test(interestsRoute) && /currentUserForRequest\(\)/.test(interestsRoute) &&
    /fetch\("\/api\/explore\/interests"/.test(exploreClient) && /if \(serverInterests\.enough \|\| !mayBeSignedIn\(\)\) return/.test(exploreClient))
  check("  the cookie is the one the app keeps a session in (lib/supabase/session-jar storedSessionKey)", /return `sb-\$\{new URL\(url\)\.hostname\.split\("\."\)\[0\]\}-auth-token`/.test(readCode("lib/supabase/session-jar.ts")))
  check("no public cache rule covers an account, a receipt, a checkout, a preview, the library or an order", !/source: '\/(?:account|receipt|checkout|onepage-preview|library|order-help|purchase|downloads|w\/:username\/(?:account|cart|preview))/.test(config))

  /* An imported theme's stranger copy: never an account, a cart, a checkout or a preview. */
  const anon = readCode("lib/storelib-theme/compat/anonymous-cache.ts")
  check("an imported theme never shares a cart, checkout, account, password, search or preview page", /cart\|checkout\|account\|password\|search\|localization\|wishlist\|preview/.test(anon))

  /* The held OnePage copy carries no viewer input: its keys are the page's own. */
  const lib = readCode("lib/onepage/published-page.ts")
  check("held OnePage entries are keyed by the page alone (name, ids, block fingerprint)",
    /* Changed on purpose (OnePage production audit, SEC1): v2, the held page carries its owner's store (lib/onepage/page-store). */ /\["onepage-address", "v2", slug\]/.test(lib) && /\["onepage-owner", "v1", sellerId \?\? "", creatorId \?\? "", ownerId \?\? ""\]/.test(lib) && /* Changed on purpose (round AR): v2, the held blocks now carry the data blocks' fill (lib/onepage/data-blocks-server). */ /\["onepage-live-blocks", "v2", creatorId, fingerprint\]/.test(lib))
}

/* ── SPIKES AND ABUSE ──────────────────────────────────────────────────── */

async function spikes() {
  section("A beacon is counted in memory first (lib/api/rate-limit memoryFirst)")
  const { memoryFirstVerdict, MEMORY_FIRST_SHARE, LIMITS } = await import("@/lib/api/rate-limit")
  const store = new Map<string, { n: number; until: number }>()
  const windows = [{ limit: 8, seconds: 60 }]
  const t = 1_000_000
  const verdicts = Array.from({ length: 10 }, () => memoryFirstVerdict("track", ["ip:a"], windows, t, store))
  const quiet = Math.floor(8 * MEMORY_FIRST_SHARE)
  check("under a quarter of the limit: allowed with no question to Postgres", verdicts.slice(0, quiet).every((v) => v === "allow"), verdicts)
  check("  from there to the limit: Postgres decides", verdicts.slice(quiet, 8).every((v) => v === "ask"), verdicts)
  check("  past the limit on this function: refused with no question to Postgres", verdicts.slice(8).every((v) => v === "refuse"), verdicts)
  check("  a refusal is not counted, so retrying never extends the block", store.get("track|60|ip:a")?.n === 8)
  check("another address is counted apart", memoryFirstVerdict("track", ["ip:b"], windows, t, store) === "allow")
  check("another bucket is counted apart", memoryFirstVerdict("blog-track", ["ip:a"], windows, t, store) === "allow")
  check("the window ends and the count starts again", memoryFirstVerdict("track", ["ip:a"], windows, t + 61_000, store) === "allow")
  check("a normal reader (a page view every few seconds) never reaches Postgres", Math.floor(LIMITS.track[0].limit * MEMORY_FIRST_SHARE) >= 20)

  section("Memory first only where the worst abuse is a figure too high, never for mail, money or a guess")
  // Changed on purpose (round AW): "product-prices" joins the public reads, /api/products/prices limited the way /api/cart/prices is.
  const MEMORY_OK = new Set(["track", "onepage-track", "blog-track", "cart-prices", "product-prices", "public-search", "site-search", "ga-seen", "ai-visit"])
  const callers: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { if (name !== "node_modules" && !name.startsWith(".")) walk(p); continue }
      if (!/\.(ts|tsx)$/.test(name)) continue
      const code = readFileSync(p, "utf8")
      for (const m of code.matchAll(/rateLimit\(\{[^}]*memoryFirst: true[^}]*\}/g)) callers.push(`${p}: ${(/bucket: "([^"]+)"/.exec(m[0]) ?? [])[1] ?? "?"}`)
    }
  }
  walk(join(process.cwd(), "app"))
  walk(join(process.cwd(), "lib"))
  const wrong = callers.filter((c) => !MEMORY_OK.has(c.split(": ").pop()!))
  check(`every memory-first limit is a beacon or a public read (${callers.length} found)`, callers.length >= 6 && wrong.length === 0, wrong)
  check("the analytics pipeline's limit is memory first", /bucket: "track", subjects: \[subject\], windows: LIMITS\.track, memoryFirst: true/.test(readCode("lib/analytics/collect-route.ts")))
  check("the OnePage click's own limit is memory first", /bucket: "onepage-track", subjects: \[subject\], windows: LIMITS\.track, memoryFirst: true/.test(readCode("lib/onepage/visit-gate.ts")))
  check("the payment, coupon, email and claim limits are counted in Postgres as before",
    !/memoryFirst/.test(readCode("lib/checkout/access-link.ts")) && !/memoryFirst/.test(readCode("app/api/coupons/validate/route.ts")) && !/memoryFirst/.test(readCode("app/api/subscribe/route.ts")))

  section("Every public write or search a stranger can call is limited")
  const blog = readCode("app/api/blog/track/route.ts")
  check("a blog view: a robot is not a reader, an id must be a post's, an address is limited", /isBotAgent\(req\.headers\.get\("user-agent"\)\)/.test(blog) && /UUID\.test\(postId\)/.test(blog) && /bucket: "blog-track"/.test(blog) && blog.indexOf("rateLimit(") < blog.indexOf('from("blog_post_views")'))
  const prices = readCode("app/api/cart/prices/route.ts")
  check("a cart priced again is limited per address, before the database", /bucket: "cart-prices"/.test(prices) && prices.indexOf("rateLimit(") < prices.indexOf("createAdminClient()"))
  const search = readCode("app/api/v2/search/route.ts")
  check("public search is limited per address before any query", /bucket: "public-search"/.test(search) && search.indexOf("rateLimit(") < search.indexOf("admin.rpc("))
  check("  answers a card's columns, never the whole row", !/select\("\*/.test(search) && /\$\{RESULT_COLUMNS\}/.test(search) && /\.map\(publicResult\)/.test(search))
  check("  and the words cannot write a filter of their own into or()", /const words = ilikeWords\(query\)/.test(search) && /title\.ilike\.%\$\{words\}%,description\.ilike\.%\$\{words\}%/.test(search) && !/ilike\.%\$\{query\}%/.test(search))
  const { ilikeWords } = await import("@/lib/search/ilike-words")
  check("ilikeWords takes out what ends a PostgREST condition", ilikeWords("loops,status.neq.x)") === "loops status neq x" && ilikeWords('a"b(c)\\d%e*f') === "a b c d e f")
  check("  and keeps the words as typed", ilikeWords("Lo-fi drum kit") === "Lo-fi drum kit")
  check("Google's seen ping is limited per address before it reads a store", /bucket: "ga-seen"/.test(readCode("app/api/store/ga-seen/route.ts")))
}

async function main() {
  await roundTrips()
  await publishing()
  await communityPages()
  await creatorPage()
  await privatePages()
  await spikes()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n  ${failures.join("\n  ")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
