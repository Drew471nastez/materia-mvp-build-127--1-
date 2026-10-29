/**
 * ===========================================================================
 *  ROUND 44: CREATOR SURFACES, AS A SEARCH ENGINE MEETS THEM
 * ===========================================================================
 * Creator pages, products, OnePages, communities and member profiles. Held
 * here, each a fix of something confirmed in the audit:
 *
 *   1. storelib.com/<handle>/<slug> is that creator's product. The handle was
 *      thrown away: any first segment drew the product (one page at as many
 *      addresses as there are words), a creator's own domain drew another
 *      creator's product, and two creators with the same slug (a slug is
 *      unique per creator) were a 404 for both, at the addresses the sitemap
 *      lists. A creator's address with no such product of theirs is a 404;
 *      an old link under a handle nobody has goes to the product.
 *   2. A creator page domain's sitemap lists only pages of that domain: never
 *      a product that ships (its address redirects to the store's website)
 *      or one that sells a community tier (it redirects to the community).
 *   3. storelib.com/products/<slug> names the same canonical the product
 *      itself does (the creator page's own domain when it has one), and says
 *      noindex for a banned seller.
 *   4. A member profile reads the operator's spam verdict, as the creator
 *      page and the OnePage do.
 *   5. A banned creator's community, its posts and its events say noindex,
 *      as its sitemap row already left it out.
 *
 * And the privacy rules these sit on, held again for every surface: a draft,
 * an unpublished, a private, a banned or a spam account's page is noindex
 * and in no sitemap; a missing one is a real 404.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"
import { productAddressStep } from "@/lib/commerce/product-address"
import { creatorDomainEntries, creatorDomainSitemap } from "@/lib/seo/creator-domain"
import { creatorIndexable, onePageIndexable, pageRobots, productIndexable } from "@/lib/seo/indexing"
import { creatorChunkEntries } from "@/lib/seo/sitemaps"
import { deservesIndexing } from "@/lib/security/spam-signals"
import { profileMetadata } from "@/lib/profile/profile-seo"
import { getProductShareUrl, getStoreShareUrl } from "@/lib/url-helpers"
import { indexablePost, postArticleJsonLd, postMetadata, publicPost, type PostFacts } from "@/app/(marketing)/community/[slug]/(member)/post/[postId]/post-seo"
import { eventMetadata, indexableEvent, type EventFacts } from "@/app/(marketing)/community/[slug]/(member)/events/[eventId]/event-seo"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
type Row = Record<string, Any>

/** Enough of the Supabase client for lib/seo/creator-domain.ts. `noCommunityColumn` answers like a database before part 81. */
function fakeDb(tables: Record<string, Row[]>, opts: { noCommunityColumn?: boolean } = {}) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let error: { code: string; message: string } | null = null
      const answer = () => (error ? { data: null, error } : { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null })
      const chain: Any = {
        select(cols: string) {
          if (table === "products" && opts.noCommunityColumn && /community_id/.test(cols)) error = { code: "42703", message: "column products.community_id does not exist" }
          return chain
        },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return chain },
        in(k: string, vs: unknown[]) { filters.push((r) => vs.includes(r[k])); return chain },
        or(expr: string) {
          const parts = expr.split(",").map((p) => p.split("."))
          filters.push((r) => parts.some(([k, op, ...v]) => op === "eq" && String(r[k]) === v.join(".")))
          return chain
        },
        not() { return chain },
        order() { return chain },
        range() { return chain },
        limit() { return chain },
        async maybeSingle() { const a = answer(); return a.error ? a : { data: a.data?.[0] ?? null, error: null } },
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) { return Promise.resolve(answer()).then(resolve, reject) },
      }
      return chain
    },
  } as never
}

const ana = {
  profiles: [{ id: "u1", username: "anaprints", avatar_url: null }],
  creators: [{ id: "c1", user_id: "u1", cover_url: null, banned_at: null }],
  custom_domains: [{ id: "d1", creator_id: "c1", domain: "shop.anaprints.com", status: "active", purpose: "creator_page", is_primary: true, created_at: "2026-01-01" }],
  products: [
    { creator_id: "c1", slug: "risograph-pack", status: "published", type: "digital", community_id: null, updated_at: "2026-09-01T00:00:00Z" },
    { creator_id: "c1", slug: "framed-print", status: "published", type: "physical", community_id: null, updated_at: "2026-09-02T00:00:00Z" },
    { creator_id: "c1", slug: "studio-club", status: "published", type: "membership", community_id: "k1", updated_at: "2026-09-03T00:00:00Z" },
    { creator_id: "c1", slug: "next-zine", status: "draft", type: "digital", community_id: null, updated_at: "2026-09-04T00:00:00Z" },
  ],
  onepages: [],
}

async function main() {
  /* ── 1. The handle in the address ─────────────────────────────────── */
  console.log("\n1. storelib.com/<handle>/<slug> is that creator's product")
  {
    const owner = { creatorId: "c1", handle: "AnaPrints" }
    const page = productAddressStep({ slug: "ebook", owner, found: { slug: "ebook", viaHistory: false }, renamedTo: null, elsewhere: null })
    check("the creator's own product is the page, read among their products only", page.kind === "page" && page.owner === "c1", page)
    const moved = productAddressStep({ slug: "old-ebook", owner, found: { slug: "ebook", viaHistory: true }, renamedTo: null, elsewhere: null })
    check("their product under a slug it used to have: a 308 to the current one, the handle as the canonical writes it",
      moved.kind === "redirect" && moved.permanent && moved.to === "/anaprints/ebook", moved)
    const renamed = productAddressStep({ slug: "ebook", owner: null, found: null, renamedTo: "ana", elsewhere: "https://storelib.com/someoneelse/ebook" })
    check("a handle that was renamed: a 308 to the new handle, before any guess", renamed.kind === "redirect" && renamed.permanent && renamed.to === "/ana/ebook", renamed)
    const someoneElse = productAddressStep({ slug: "ebook", owner, found: null, renamedTo: null, elsewhere: "https://storelib.com/bob/ebook" })
    check("another creator's product under Ana's handle (or on Ana's domain, which the proxy reads as /anaprints/<slug>): a 404, never Bob's product under her name",
      someoneElse.kind === "missing", someoneElse)
    const oldLink = productAddressStep({ slug: "ebook", owner: null, found: null, renamedTo: null, elsewhere: getProductShareUrl("bob", "ebook", "shop.bob.com") })
    check("  a handle nobody has and somebody's product: a temporary redirect to its own canonical, its creator page domain included",
      oldLink.kind === "redirect" && !oldLink.permanent && oldLink.to === "https://shop.bob.com/ebook", oldLink)
    check("nothing anywhere: a real 404", productAddressStep({ slug: "nope", owner, found: null, renamedTo: null, elsewhere: null }).kind === "missing")
    check("  and for a handle nobody has", productAddressStep({ slug: "nope", owner: null, found: null, renamedTo: null, elsewhere: null }).kind === "missing")

    const door = code("app/(marketing)/[sellername]/[productSlug]/page.tsx")
    check("the door decides by the handle, once per request for the metadata and the page",
      /const addressOf = cache\(async \(handle: string, slug: string\)/.test(door) && (door.match(/await addressOf\(at\.handle, at\.slug\)/g) ?? []).length === 2)
    check("  the owner is the profile the handle names and its creator row, the creator page's own loaders",
      /await loadProfileByUsername\(handle\)/.test(door) && /await loadCreatorForUser\(profile\.id\)/.test(door) && /await loadProductBySlug\(slug, owner\.creatorId\)/.test(door))
    check("  the page, its metadata and its frame read the owner's product",
      /productMetadata\(\{ params: Promise\.resolve\(\{ slug: at\.slug, owner: step\.owner \}\)/.test(door) &&
        /ProductPageFrame\(\{ slug, children: await ProductPage\(\{ params: Promise\.resolve\(\{ slug, owner \}\), searchParams \} as never\), owner \}\)/.test(door))
    check("  a redirect is a redirect and a miss is notFound(), never a 200 page that says not found",
      /if \(step\.permanent\) permanentRedirect\(step\.to\)\s*\n\s*redirect\(step\.to\)/.test(door) && /if \(step\.kind !== "page"\) notFound\(\)/.test(door))
    check("  and the metadata of anything else says noindex",
      /if \(step\.kind !== "page"\) return \{ title: "Product Not Found", robots: \{ index: false, follow: false \} \}/.test(door))
    check("  where it lives elsewhere is the product's own canonical, its creator page's domain included",
      /getProductShareUrl\(profile\?\.username \|\| "", product\.slug, await primaryHostFor\(product\.creator_id, "creator_page"\)\)/.test(door))
    check("  and is asked only when no creator has the handle", /if \(owner\) return productAddressStep\(\{ slug, owner, found, renamedTo: null, elsewhere: null \}\)/.test(door))

    const loader = code("lib/commerce/product-page-data.ts")
    const cacheFile = code("lib/commerce/product-page-cache.ts")
    check("the loader takes the owner and holds the slug to it", /export const loadProductBySlug = cache\(async \(slug: string, owner\?: string \| null\)/.test(loader) && /if \(owner\) currentQuery = currentQuery\.eq\("creator_id", owner\)/.test(loader))
    check("  and so does the shared copy, keyed by both", /if \(creatorId\) query = query\.eq\("creator_id", creatorId\)/.test(cacheFile) && /\["product-by-slug", slug, creatorId \?\? ""\]/.test(cacheFile))
    check("  never \"no row\" because two creators chose one slug: the oldest, one row, never maybeSingle on a slug",
      !/\.eq\("slug", slug\)[^]{0,120}\.maybeSingle\(\)/.test(loader) && !/\.eq\("slug", slug\)[^]{0,120}\.maybeSingle\(\)/.test(cacheFile) &&
        /\.order\("created_at", \{ ascending: true \}\)\.limit\(1\)/.test(cacheFile) && /\.order\("created_at", \{ ascending: true \}\)\.limit\(1\)/.test(loader))
    check("  an old slug is the owner's own move, not another creator's", /\(!owner \|\| p\.creator_id === owner\)/.test(loader) && !/old_slug", slug\)\s*\.maybeSingle/.test(loader))
    const product = code("app/(marketing)/p/[slug]/page.tsx")
    check("/p/<slug> itself has no owner segment: only the door can set one", /params: Promise<\{ slug: string; owner\?: string \| null \}>/.test(product) && (product.match(/loadProductBySlug\(slug, owner\)/g) ?? []).length === 2)
  }

  /* ── 2. A creator page domain's sitemap ───────────────────────────── */
  console.log("\n2. A creator page domain lists only its own pages")
  {
    const urls = ((await creatorDomainSitemap("anaprints", "shop.anaprints.com", fakeDb(ana))) ?? []).map((e) => e.url)
    check("the page and the digital product, at the domain's addresses",
      JSON.stringify(urls) === JSON.stringify(["https://shop.anaprints.com/", "https://shop.anaprints.com/risograph-pack"]), urls)
    check("  never a product that ships (it redirects to the store's website)", !urls.some((u) => u.includes("framed-print")))
    check("  never one that sells a community tier (it redirects to the community)", !urls.some((u) => u.includes("studio-club")))
    check("  never a draft", !urls.some((u) => u.includes("next-zine")))
    const legacy = ((await creatorDomainSitemap("anaprints", "shop.anaprints.com", fakeDb(ana, { noCommunityColumn: true }))) ?? []).map((e) => e.url)
    check("a database before part 81 (no community_id) still answers, physical left out", legacy.length === 2 && !legacy.some((u) => u.includes("framed-print")), legacy)
    check("the page still counts every published product for its own robots rule, as the page does",
      creatorDomainEntries({ host: "shop.anaprints.com", handle: "anaprints", banned: false, products: [{ slug: "framed-print", status: "published", type: "physical", updated_at: null }], onePage: null }).map((e) => e.url).join() === "https://shop.anaprints.com/")
    const banned = { ...ana, creators: [{ ...ana.creators[0], banned_at: "2026-09-01T00:00:00Z" }] }
    check("a banned creator's domain lists nothing", (await creatorDomainSitemap("anaprints", "shop.anaprints.com", fakeDb(banned)))?.length === 0)
    check("a host that is not the live primary has no sitemap", (await creatorDomainSitemap("anaprints", "anaprints.com", fakeDb(ana))) === null)
  }

  /* ── 3. storelib.com/products/<slug> ───────────────────────────────── */
  console.log("\n3. The platform's /products/<slug> names the product's one canonical")
  {
    const render = code("components/website-builder/theme/render-product.tsx")
    check("the creator page's own domain when it has one", /primaryHostFor\(product\.creator_id, "creator_page"\)/.test(render) && /if \(handle\) canonical = getProductShareUrl\(handle, product\.slug, pageHost\)/.test(render))
    check("  the same address storelib.com/<handle>/<slug> names", /const productUrl = getProductShareUrl\(sellerHandle \|\| "", product\.slug, pageHost\)/.test(code("app/(marketing)/p/[slug]/page.tsx")))
    check("and noindex for a banned seller", /index = productIndexable\(product, handle \|\| null\) && !isBanned\(creator/.test(render) && /\.from\("creators"\)\.select\("\*"\)/.test(render))
  }

  /* ── 4. Member profiles ───────────────────────────────────────────── */
  console.log("\n4. A member profile reads the operator's verdict")
  {
    check("a confirmed spammer is out of search whatever the handle", !deservesIndexing({ handle: "maya", spamState: "confirmed" }))
    check("  a cleared one is in, whatever the score", deservesIndexing({ handle: "maya", spamState: "clear" }))
    check("  no verdict: the handle score, as before", deservesIndexing({ handle: "maya", spamState: null }) === deservesIndexing({ handle: "maya" }))
    const facts = { name: "Maya", username: "maya", bio: null, avatarUrl: null, coverUrl: null, followers: 0 }
    check("  and noindex is what the page then says", JSON.stringify(profileMetadata({ ...facts, indexable: false }).robots).includes('"index":false'))
    const route = code("app/(marketing)/member/[username]/page.tsx")
    check("the page and its metadata ask one rule, with spamStateOf",
      /const inSearch = cache\(async \(userId: string, username: string\) => deservesIndexing\(\{ handle: username, spamState: await spamStateOf\(userId\) \}\)\)/.test(route) &&
        /indexable: await inSearch\(profile\.userId, profile\.username\)/.test(route) && /const indexable = await inSearch\(profile\.userId, profile\.username\)/.test(route) && !/scoreSignup/.test(route))
    check("  and the structured data only when it is in search", /\{indexable \? <script type="application\/ld\+json"/.test(route))
    check("a missing profile is a real 404, an old handle a 308", /permanentRedirect\(memberProfilePublicPath\(moved\)\)\s*\n\s*notFound\(\)/.test(route))
  }

  /* ── 5. A banned creator's community ──────────────────────────────── */
  console.log("\n5. A banned creator's community is out of search")
  {
    const post = (over: Partial<PostFacts> = {}): PostFacts => ({
      community: { slug: "makers", name: "Makers", logo_url: null, visibility: "public", access: "free", status: "published", platform_hidden: false, suspended_at: null, deleted_at: null },
      space: null,
      post: { id: "p0000000-0000-4000-8000-000000000001", title: "Kiln day", bodyText: "We fired the kiln.", media: [], status: "published", deletedAt: null, createdAt: "2026-10-01T10:00:00Z", editedAt: null, commentCount: 0 },
      author: { name: "Ana", username: "ana", avatarUrl: null },
      ...over,
    })
    check("a public post: indexed", indexablePost(post()) && (postMetadata(post()).robots as Any).index === true)
    const banned = post({ ownerBanned: true })
    check("its creator banned: readable by its link, noindex, no Article, the generic preview",
      publicPost(banned) && !indexablePost(banned) && (postMetadata(banned).robots as Any).index === false && postArticleJsonLd(banned) === null && !JSON.stringify(postMetadata(banned)).includes("Kiln day"))
    const event = (ownerBanned?: boolean): EventFacts => ({
      community: { slug: "makers", name: "Makers", logo_url: null, visibility: "public", access: "free", status: "published", platform_hidden: false, suspended_at: null, deleted_at: null },
      event: { id: "e1", title: "Open studio", description: null, coverUrl: null, startsAt: "2026-11-01T10:00:00Z", timezone: "UTC", location: null, status: "scheduled", access: null, updatedAt: null },
      ownerBanned,
    })
    check("an event the same", indexableEvent(event()) && !indexableEvent(event(true)) && (eventMetadata(event(true)).robots as Any).index === false)
    check("the facts read the ban for both", /creatorIsBanned\(community\.creator_id\)/.test(code("app/(marketing)/community/[slug]/(member)/post/[postId]/post-facts.ts")) && /ownerBanned: await banned/.test(code("app/(marketing)/community/[slug]/(member)/events/[eventId]/event-facts.ts")))
    const page = code("app/(marketing)/community/[slug]/page.tsx")
    const about = code("app/(marketing)/community/[slug]/about/page.tsx")
    check("the community's page and About say noindex for it", [page, about].every((s) => /\.\.\.\(\(await banned\) \? \{ indexable: false \} : \{\}\)/.test(s)))
    check("  and the page's structured data follows its metadata (waiting to be deleted, or banned)", /const unlisted = Promise\.all\(\[communityDeleting\(load\.community\.id\), ownerBanned\(load\.community\.creator_id\)\]\)/.test(page) && /const hidden = await unlisted/.test(page) && /\{jsonLd && !hidden \? <script type="application\/ld\+json"/.test(page))
    check("a private post is never more than the generic card", !indexablePost(post({ community: { ...post().community, visibility: "private" } })) && !publicPost(post({ community: { ...post().community, visibility: "private" } })))
    check("  nor a post in a members-only space", !publicPost(post({ space: { name: "Inner", view_access: { tierIds: ["t1"] }, archived_at: null } })))
    check("  nor a draft post", !publicPost(post({ post: { ...post().post, status: "draft" } })))
  }

  /* ── 6. The privacy rules, held for every surface ─────────────────── */
  console.log("\n6. Drafts, private, banned and spam pages are noindex and in no sitemap")
  {
    check("a draft product is never indexable", !productIndexable({ status: "draft", slug: "x" }, "ana"))
    check("  nor an archived one, nor one without an address", !productIndexable({ status: "published", archived: true, slug: "x" }, "ana") && !productIndexable({ status: "published", slug: null }, "ana"))
    check("  nor a confirmed spammer's", !productIndexable({ status: "published", slug: "x" }, "ana", "confirmed"))
    check("an empty creator page is noindex and nofollow", !creatorIndexable({ publishedProducts: 0, handle: "ana" }) && JSON.stringify(pageRobots({ indexable: false, publishedProducts: 0 })) === JSON.stringify({ index: false, follow: false }))
    check("  one with a product is indexed", creatorIndexable({ publishedProducts: 1, handle: "ana" }))
    check("an unpublished OnePage is not indexable", !onePageIndexable({ status: "draft", handle: "ana" }) && onePageIndexable({ status: "published", handle: "ana" }))
    const chunk = creatorChunkEntries({
      creators: [{ id: "c1", user_id: "u1" }, { id: "c2", user_id: "u2" }, { id: "c3", user_id: "u3" }, { id: "c4", user_id: "u4" }],
      products: new Map([["c1", { n: 2, at: null }], ["c2", { n: 2, at: null }], ["c3", { n: 2, at: null }], ["c4", { n: 0, at: null }]]),
      sellers: new Map([["u1", { username: "ana" }], ["u2", { username: "bannedbob" }], ["u3", { username: "spamsam" }], ["u4", { username: "emptyeve" }]] as never),
      onePages: new Map([["c1", null], ["c2", null], ["c3", null]]),
      banned: new Set(["c2"]),
      ownDomain: new Set(),
      spam: new Set(["u3"]),
    }, (h) => `https://storelib.me/${h}`)
    const all = [...chunk.creators, ...chunk.onePages].map((e) => e.url)
    check("storelib.com's creator files: the seller listed; banned, spam and empty never", JSON.stringify(all) === JSON.stringify(["https://storelib.com/ana", "https://storelib.me/ana"]), all)
    const owned = creatorChunkEntries({ creators: [{ id: "c1", user_id: "u1" }], products: new Map([["c1", { n: 1, at: null }]]), sellers: new Map([["u1", { username: "ana" }]] as never), onePages: new Map([["c1", null]]), banned: new Set(), ownDomain: new Set(["c1"]), spam: new Set() })
    check("a creator page on its own live domain is not a second copy in storelib.com's files", owned.creators.length === 0 && owned.onePages.length === 0)
    check("  its canonical is the domain's root, and its products the domain's /<slug>", getStoreShareUrl("ana", "shop.ana.com") === "https://shop.ana.com/" && getProductShareUrl("ana", "zine", "shop.ana.com") === "https://shop.ana.com/zine")
    check("  and without one, storelib.com/<handle>/<slug>, lowercase", getProductShareUrl("Ana", "zine") === "https://storelib.com/ana/zine")
    const maps = code("lib/seo/sitemaps.ts")
    check("storelib.com's product files: published only, never a product that ships or sells a tier, never a banned seller's",
      /\.eq\("status", "published"\)\s*\.neq\("type", "physical"\)/.test(maps) && /q = q\.is\("community_id", null\)/.test(maps) && /banned\.has\(row\.creator_id\)\)\) continue/.test(maps))
    check("a OnePage on storelib.com is a redirect to storelib.me, never a copy", /`\/l\/\{slug\}` and `\/\{handle\}\/links` answer with a 308/.test(read("proxy.ts")))
    const storefront = code("app/(marketing)/u/[username]/page.tsx")
    check("a creator page nobody has is a real 404, a renamed one a 308", /permanentRedirect\(`\/\$\{historyRecord\.new_username\}`\)\s*\n\s*\}\s*\n\s*notFound\(\)/.test(storefront))
    check("  and its canonical names one host, without the query it was opened with", /const pageUrl = pageHost \? `https:\/\/\$\{pageHost\}\/` : `https:\/\/storelib\.com\/\$\{handle\}`/.test(storefront) && /canonical: pageUrl,/.test(storefront))
    check("  its banned owner keeps it out of search", /creatorIndexable\(\{ publishedProducts, handle, spamState \}\) && !isBanned\(creator\)/.test(storefront))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
