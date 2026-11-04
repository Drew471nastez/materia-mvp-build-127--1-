/**
 * ===========================================================================
 *  EXPLORE, ROUND 10: FAST PILLS, A FIELD WHOSE DEPTH IS NEVER CUT, A NEW
 *  CATEGORIES ICON, SQUARE STAT WELLS
 * ===========================================================================
 * Held from their inputs where they are pure (the prefetch budget, the
 * address, the per pill cache against a stubbed fetch) and by regex where
 * the thing is a line of a page:
 *
 *   ITEM 11   the first grid is drawn by the server in one round trip for
 *             the catalogue (creators and faces embedded, a three step
 *             fallback) with every read started at once; a pill rewrites
 *             the address in place instead of asking the server for the
 *             page; the pill answers in the tap's frame and the grid follows
 *             deferred, two rows first; communities are kept per pill, one
 *             request per question however many ask, warmed on idle within
 *             the device's budget and on a press; the previous grid stays
 *             while the next loads (a skeleton only when there was never
 *             one); pictures at the size the grid draws them, one preloaded.
 *   ITEM 12   the header's field keeps the hero's look, its depth scaled to
 *             end inside the bar; the hero's is unchanged.
 *   ITEM 13   the categories icon is Explore's own, not a grid and not a
 *             sparkle, in both fields through the one button (round 11
 *             changed the glyph to a plain list: tests/explore-round11).
 *   ITEM 14   the card's stat wells are 22px squares with a 7px corner and
 *             a quieter depth.
 *
 * The timings themselves are measured by scripts/check-explore-speed.mjs
 * (4x CPU, Slow 3G, before and after) and the looks by
 * scripts/check-explore-search-icon.mjs and scripts/check-community-cards.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { prefetchBudgetFor } from "@/lib/explore/prefetch-budget"
import { EXPLORE_CATEGORY_IDS, exploreCategoryFrom } from "@/lib/explore/explore-address"
import { cachedCommunities, clearCommunitiesCache, FRESH_MS, loadCommunities, prefetchCommunities, seedCommunities } from "@/lib/explore/communities-cache"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}
const code = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

async function main() {
  console.log("\nHow much to fetch ahead")
  check("Data Saver: nothing, whatever the network", prefetchBudgetFor({ connection: { saveData: true, effectiveType: "4g" } }) === 0)
  check("slow-2G: nothing", prefetchBudgetFor({ connection: { effectiveType: "slow-2g" } }) === 0)
  check("2G (DevTools' Slow 3G): the next pill only", prefetchBudgetFor({ connection: { effectiveType: "2g" } }) === 1)
  check("3G: the pills on either side", prefetchBudgetFor({ connection: { effectiveType: "3g" }, deviceMemory: 8, hardwareConcurrency: 8 }) === 2)
  check("4G on a capable device: four", prefetchBudgetFor({ connection: { effectiveType: "4g" }, deviceMemory: 8, hardwareConcurrency: 8 }) === 4)
  check("4G on a small device: two", prefetchBudgetFor({ connection: { effectiveType: "4g" }, deviceMemory: 2 }) === 2 && prefetchBudgetFor({ connection: { effectiveType: "4g" }, hardwareConcurrency: 2 }) === 2)
  check("no signal at all (Safari): a middle answer", prefetchBudgetFor({}) === 3)
  check("the server: nothing", prefetchBudgetFor(null) === 0)

  console.log("\nThe category in the address")
  check("c is read", exploreCategoryFrom(new URLSearchParams("c=design")) === "design")
  check("the older category= still works", exploreCategoryFrom(new URLSearchParams("category=ai")) === "ai")
  check("c wins over category", exploreCategoryFrom(new URLSearchParams("c=video&category=ai")) === "video")
  check("case does not matter", exploreCategoryFrom({ c: "DESIGN" }) === "design")
  check("anything unknown, or nothing, is All", exploreCategoryFrom(new URLSearchParams("c=nope")) === "all" && exploreCategoryFrom(new URLSearchParams("")) === "all" && exploreCategoryFrom({}) === "all")
  check("the list is the server's old one, freebies and other included", EXPLORE_CATEGORY_IDS.length === 16 && (["freebies", "other", "audio-music", "social-media"] as const).every((c) => (EXPLORE_CATEGORY_IDS as readonly string[]).includes(c)))

  console.log("\nCommunities, kept per pill")
  {
    const asked: string[] = []
    let answer = (url: string) => ({ items: [{ id: url }], next: null as string | null })
    const realFetch = globalThis.fetch
    let release: (() => void) | null = null
    let hold = false
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      asked.push(url)
      if (hold) await new Promise<void>((r) => { release = r })
      return new Response(JSON.stringify(answer(url)), { status: 200, headers: { "content-type": "application/json" } })
    }) as typeof fetch
    try {
      clearCommunitiesCache()
      seedCommunities("", { items: [], next: "c1", broadened: false })
      check("the server's first page is kept as if it had been asked for", cachedCommunities("")?.next === "c1" && cachedCommunities("")?.stale === false && asked.length === 0)

      hold = true
      const a = loadCommunities("c=design")
      const b = loadCommunities("c=design")
      const c = prefetchCommunities("c=design")
      check("one question on its way is asked once, however many ask (a press, an idle prefetch, the tap)", asked.length === 1 && a === b, asked)
      hold = false
      ;(release as (() => void) | null)?.()
      await Promise.all([a, b, c])
      check("the answer is kept, under the exact question", cachedCommunities("c=design")?.items[0]?.id === "/api/explore/communities?c=design&limit=24" && asked[0] === "/api/explore/communities?c=design&limit=24", asked)

      await prefetchCommunities("c=design")
      check("a fresh answer in memory is not asked for again", asked.length === 1)

      const realNow = Date.now
      Date.now = () => realNow() + FRESH_MS + 1000
      check("older than a minute it is still there, marked stale", cachedCommunities("c=design")?.stale === true)
      await prefetchCommunities("c=design")
      check("and a prefetch asks again, quietly", asked.length === 2)
      Date.now = realNow

      answer = () => { throw new Error("down") }
      let threw = false
      try { await loadCommunities("c=ai") } catch { threw = true }
      check("a failed answer is not kept and the next ask goes again", threw && cachedCommunities("c=ai") === null)
      answer = (url: string) => ({ items: [{ id: url }], next: null })
      await prefetchCommunities("c=ai")
      check("  (it does)", cachedCommunities("c=ai") !== null)

      for (let i = 0; i < 45; i++) await loadCommunities(`c=x${i}`)
      check("at most forty questions are kept, the oldest dropped first", cachedCommunities("c=x0") === null && cachedCommunities("c=x44") !== null && cachedCommunities("") === null)
      check("the empty query asks for the first page without a stray &", asked.every((u) => !/\?&/.test(u)))
    } finally {
      globalThis.fetch = realFetch
      clearCommunitiesCache()
    }
  }

  console.log("\nItem 11: the page and its pills")
  {
    const page = code("app/(marketing)/explore/page.tsx")
    /* Round 17: creators.user_id points at auth.users, so `profiles!creators_user_id_fkey` named a key PostgREST does not have and was refused on every load. The creators are embedded on products.creator_id; their faces are one read by user id. */
    check("the catalogue embeds its creators on products.creator_id, and names no creators to profiles key that does not exist", /CREATOR_EMBED = "creator:creators\(id, user_id, slug, niche_tags\)"/.test(page) && /read\(`\$\{PRODUCT_COLUMNS\}, \$\{CREATOR_EMBED\}`\)/.test(page) && !/profiles!creators_user_id_fkey/.test(page))
    check("the faces, the sales channels and the intervals are read together after the one products read", /from\("profiles"\)\.select\(PROFILE_FIELDS\)\.in\("id", userIds\)/.test(page) && /const together = Promise\.all\(\[\s*offChannelAmong\(/.test(page) && /\] = await together/.test(page) && /creatorsPromise,\s*profilesPromise,\s*intervalsPromise/.test(page))
    check("a refused creators embed reads the products alone, never an empty page", /* Changed on purpose (round rel-obs: the fallback still serves the page, so it is a warning, one JSON line) */ /if \(error\) \{\s*logEvent\("warn", "explore_creators_embed_refused", \{ msg: "\[ExplorePage\] Creators embed refused/.test(page) && /from\("creators"\)\.select\("id, user_id, slug, niche_tags"\)/.test(page))
    /* Round 18: browsing reads the shared catalogue (lib/explore/catalogue-cache.ts), a search the live one; either starts here. */
    /* Round AG: the Products or Communities tab is remembered in the tab's session storage, so the server reads no cookie for it. */
    check("the switches and the catalogue start at once", /const catalogRead = searchQuery\s*\?\s*readCatalog\(createPublicReadClient\(\), searchQuery\)/.test(page) && /: cachedExploreCatalogue\(/.test(page) && /const catalogPromise = catalogRead\.catch/.test(page) && /await Promise\.all\(\[\s*isExploreDiscoverModeSwitcherEnabled\(\),\s*communitiesEnabled\(\),\s*\]\)/.test(page) && !/cookies\(\)/.test(page) && page.indexOf("const catalogPromise") < page.indexOf("await Promise.all(["))
    /* Round 49: nobody is asked on the server (one HTML for everybody, the CDN holds it); For you is asked after load (/api/explore/interests). */
    check("the visitor is not asked; the catalogue is collected on its own", /productsWithCreators = await catalogPromise/.test(page) && !/currentUserForRequest|interestsPromise/.test(page) && /currentUserForRequest\(\)/.test(code("app/api/explore/interests/route.ts")))
    check("the server reads the category with the browser's rule", /exploreCategoryFrom\(\{ c: params\?\.c, category: params\?\.category \}\)/.test(page) && !/const VALID_CATEGORIES/.test(page))

    const client = code("components/explore/explore-page-client.tsx")
    check("a pill rewrites the address in place: no server round trip (the router only where the history API throws)", /window\.history\.replaceState\(null, "", href\)/.test(client) && (client.match(/router\.replace\(/g) ?? []).length === 1 && /catch \{\s*router\.replace\(href, \{ scroll: false \}\)/.test(client) && /replaceAddress\(href\)/.test(client) && (client.match(/scheduleAddress\(/g) ?? []).length >= 4)
    check("the category is read back from the address, not the server's first prop", /const fromUrl = exploreCategoryFrom\(searchParams\)/.test(client) && /const raw = exploreCategoryFrom\(searchParams\)/.test(client))
    check("the pill answers in the tap's frame; the grid follows deferred", /const gridCategory = useDeferredValue\(mainCategory\)/.test(client) && /const gridSub = useDeferredValue\(selectedSubcategoryId\)/.test(client) && /\}, \[initialProducts, gridCategory, gridSub, /.test(client) && /category=\{gridCategory\}\s*sub=\{gridSub\}/.test(client))
    check("a changed grid draws its first two rows first", /useProgressiveCount\(productsGridToken, paginatedProducts\.length\)/.test(client) && /paginatedProducts\.slice\(0, productsShown\)/.test(client))
    check("communities: the pills beside the current one are handed over to warm, nearest first", /ahead=\{communitiesAhead\}/.test(client) && /if \(ids\[at \+ d\]\) order\.push\(ids\[at \+ d\]\)\s*if \(ids\[at - d\]\) order\.push\(ids\[at - d\]\)/.test(client))
    check("communities: a press (or a mouse over a pill) starts the request the tap will make", /onPointerDown=\{communities && !isSelected \? \(\) => void prefetchCommunities\(communitiesQueryFor\(cat\.id\)\) : undefined\}/.test(client) && /e\.pointerType === "mouse"/.test(client))
    check("products mode warms the way into communities on idle, not on Data Saver or 2G", /if \(communities \|\| !communitiesEnabled \|\| prefetchBudget\(\) < 2\) return/.test(client))
    check("pictures at the size the grid draws them, one preloaded", /priority=\{index === 0\}\s*sizes=\{GRID_SIZES\}/.test(client) && !/priority=\{index < 3\}/.test(client))

    const results = code("components/explore/explore-communities-results.tsx")
    check("communities come from the per pill cache, seeded by the server's first page", /seedCommunities\(initial\.query/.test(results) && /const hit = cachedCommunities\(query\)/.test(results) && /loadCommunities\(query\)/.test(results))
    check("a stale answer is shown at once and asked for again, unless the visitor paged it with Show more", /if \(!hit\.stale \|\| hasMoreThanFirstPage\(hit\)\) return/.test(results))
    check("an answer to a question no longer asked is never drawn", /if \(!live\) return/.test(results) && /live = false/.test(results))
    check("the previous grid stays while the next loads, a step quieter and only after 150ms; no skeleton then", /const pending = !!shown && shown\.query !== query/.test(results) && /pending \? "opacity-60 delay-150 duration-200"/.test(results) && /if \(items === null\) \{/.test(results))
    check("warmed on idle, one at a time, within the budget", /const queue = ahead\.filter\(\(a\) => a !== query\)\.slice\(0, budget\)/.test(results) && /whenIdle\(\(\) => \{\s*void prefetchCommunities\(next\)\.then\(step\)/.test(results))
    check("the cards are not drawn again by the tap's own render", /const grid = React\.useMemo\(/.test(results))

    const card = code("components/explore/community-card.tsx")
    /* Changed on purpose (round 29): the cover is drawn by SoftImg, which offers the same COVER_WIDTHS files. */
    check("covers from real widths by the grid's columns, not one 1920px file", /<SoftImg\s+src=\{card\.coverUrl\}\s+width=\{420\}\s+widths=\{COVER_WIDTHS\}/.test(card) && /GRID_SIZES = "\(max-width: 639px\) 100vw, \(max-width: 1023px\) 50vw, 440px"/.test(card) && !/optimizedImageUrl\(card\.coverUrl, 640\)/.test(card))

    const progressive = code("lib/explore/use-progressive-count.ts")
    check("arriving draws everything (scroll restore, the HTML); only a change starts from the first rows", /useState<\{ token: string; full: boolean \}>\(\{ token, full: true \}\)/.test(progressive) && /startTransition\(/.test(progressive))
  }

  console.log("\nItem 12: the field's depth")
  {
    const look = code("lib/explore/search-field-look.ts")
    const reach = (shadow: string) => Math.max(...shadow.split(/,(?![^(]*\))/).map((l) => { const n = l.replace(/rgba\([^)]*\)/, "").split("_").filter(Boolean).map(parseFloat); return (n[1] || 0) + (n[2] || 0) + (n[3] || 0) }))
    const hero = look.match(/border-neutral-200\/80 shadow-\[([^\]]+)\]/)?.[1] ?? ""
    const bar = look.match(/HEADER_DEPTH_REST = "in-\[\[data-header-search-field\]\]:shadow-\[([^\]]+)\]"/)?.[1] ?? ""
    const barFocus = look.match(/HEADER_DEPTH_FOCUS = "in-\[\[data-header-search-field\]\]:focus:shadow-\[([^\]]+)\]"/)?.[1] ?? ""
    check("the hero's depth is unchanged (20px under the field)", hero === "0_1px_3px_rgba(15,23,42,0.045),0_9px_27px_-16px_rgba(15,23,42,0.315)" && reach(hero) === 20, hero)
    check("in the header's field it ends inside the bar's 13px, resting and focused", !!bar && !!barFocus && reach(bar) <= 12 && reach(barFocus) <= 12, { bar: reach(bar), focus: reach(barFocus) })
    check("keyed off the header field's own marker, so the header needs no change", /SEARCH_FIELD_SURFACE =[\s\S]{0,260}\+\s*HEADER_DEPTH_REST/.test(look) && /SEARCH_FIELD_FOCUS =[\s\S]{0,260}\+\s*HEADER_DEPTH_FOCUS/.test(look) && /data-header-search-field=""/.test(code("components/platform/platform-header-client.tsx")))
  }

  console.log("\nItem 13: the categories icon")
  {
    const icon = code("components/explore/categories-icon.tsx")
    const button = code("components/explore/search-categories-button.tsx")
    /* Round 11 asked for a simpler, more regular glyph: a plain list now (tests/explore-round11 holds its shape). */
    check("its own glyph, outline only, with round caps", /fill="none"/.test(icon) && /strokeLinecap="round"/.test(icon))
    check("not a 2x2 grid of squares and no sparkle", !/<rect /.test(icon) && !/<(LayoutGrid|Grid2X2|Sparkles?)\b/.test(icon + button))
    check("the one button draws it, so the hero's field and the header's both have it", /<CategoriesIcon aria-hidden className=\{size === "hero" \? "h-5 w-5" : "h-\[18px\] w-\[18px\]"\} strokeWidth=\{2\} \/>/.test(button))
  }

  console.log("\nItem 14: the stat wells")
  {
    const card = code("components/explore/community-card.tsx")
    check("22px squares with a 7px corner, not circles", /STAT_WELL_CLASS = "inline-flex h-\[22px\] w-\[22px\] shrink-0 items-center justify-center rounded-\[7px\]"/.test(card) && /STAT_WELL_CLASS,\s*storefront/.test(card))
    const drops = [...card.matchAll(/data-stat-well[\s\S]{0,700}/g)][0]?.[0].match(/rgba\(16,24,40,([\d.]+)\)/g) ?? ([] as string[])
    check("an even subtler depth: nothing over 5%", drops.length >= 3 && drops.every((d) => parseFloat(d.split(",")[3]) <= 0.05), drops)
  }

  console.log("\nCreator faces (round 10, with P3's shared avatar)")
  {
    const productCard = code("components/explore/product-card.tsx")
    const banner = code("components/explore/featured-banner-carousel.tsx")
    const card = code("components/explore/community-card.tsx")
    check("the product card's seller face is the shared avatar: a photo or the default face, never initials", /<AppAvatar src=\{creatorAvatarUrl\} name=\{creatorName\} alt="" size=\{20\} kind="person"/.test(productCard) && !/function CreatorAvatar|charAt\(0\)/.test(productCard))
    check("and so is the featured banner's", /<AppAvatar src=\{creatorAvatar\} name=\{creatorName\} alt="" size=\{24\} kind="person" tone="dark" \/>/.test(banner) && !/function BannerCreatorAvatar|charAt\(0\)/.test(banner))
    check("a community without a logo keeps its initials (a mark, not a face)", /<AppAvatar src=\{null\} name=\{card\.name\} alt="" size=\{size\} sizedByClass className=\{className\} kind="mark" \/>/.test(card))
  }

  console.log("\nHouse rules")
  {
    const mine = [
      "lib/explore/prefetch-budget.ts", "lib/explore/communities-cache.ts", "lib/explore/explore-address.ts", "lib/explore/use-progressive-count.ts",
      "components/explore/categories-icon.tsx", "components/explore/explore-communities-results.tsx",
      "components/explore/community-card.tsx", "components/explore/search-categories-button.tsx", "lib/explore/search-field-look.ts",
      "scripts/check-explore-speed.mjs", "scripts/check-explore-speed-live.mjs", "scripts/render-explore-speed.tsx", "scripts/explore-speed-fixture.ts", "scripts/probe-crop.mjs",
    ]
    const offenders = mine.filter((f) => /—/.test(code(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(code(f)))
    check("no em dash and no banned word", offenders.length === 0, offenders)
    const browserSide = ["lib/explore/prefetch-budget.ts", "lib/explore/communities-cache.ts", "lib/explore/explore-address.ts", "lib/explore/use-progressive-count.ts", "components/explore/categories-icon.tsx"]
    check("what the browser runs imports no server code", browserSide.every((f) => !/server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)/.test(code(f))))
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
