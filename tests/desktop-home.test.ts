/**
 * ===========================================================================
 *  THE DESKTOP HOME PAGE
 * ===========================================================================
 *
 * It was a banner, a recommended grid, a pill rail and a browse grid — four
 * sections, three of them the same hundred listings in a different order, and
 * none of them different on a second visit. On a marketplace whose whole
 * proposition is "there is one of these and somebody near you has it", showing
 * an identical grid twice is the surface admitting it has not been paying
 * attention.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { signalsFrom, type RecentView } from "../lib/marketplace/recent-views"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const home = read("components/explore/home/desktop-home.tsx")
const hero = read("components/explore/home/hero-slides.tsx")
const row = read("components/explore/home/listing-row.tsx")
const pills = read("components/explore/home/you-might-be-into.tsx")
const tiles = read("components/explore/home/shop-by-category.tsx")
const more = read("components/explore/home/more-listings.tsx")
const feed = read("app/(marketing)/_explore-feed.tsx")
const loading = read("app/(marketing)/(feed)/loading.tsx")
const detail = read("components/product/product-detail.tsx")

console.log("\nThe sections, and their order")

check(
  "the page is hero, views, pills, recent, suggested, categories, more",
  (() => {
    // Personal first: somebody who has been here before should see what they
    // were doing before they see what we would like them to do.
    const order = [
      "<HeroSlides",
      "Pe baza vizualizărilor tale",
      "<YouMightBeInto",
      "Vizualizate recent",
      "Sugestii pentru tine",
      "<ShopByCategory",
      "<MoreListings",
    ].map((s) => home.indexOf(s))
    return order.every((i) => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1])
  })(),
)

check(
  "one row for the personal sections, three for the wider net",
  (() => {
    const based = home.slice(home.indexOf("Pe baza vizualizărilor tale"))
    const suggested = home.slice(home.indexOf("Sugestii pentru tine"))
    return /rows=\{1\}/.test(based.slice(0, 260)) && /rows=\{3\}/.test(suggested.slice(0, 260))
  })(),
)

check(
  "two rows in the load-more grid, and it grows by two",
  /const ROWS_PER_PAGE = 2/.test(more) && /const PAGE = PER_ROW \* ROWS_PER_PAGE/.test(more),
)

check(
  "load more is a button first and an observer after",
  (() => {
    // Pure infinite scroll takes the footer away and loads pages nobody asked
    // for; a pure button asks for a press every twelve cards.
    return /const \[auto, setAuto\] = useState\(false\)/.test(more) && /if \(!auto \|\| !hasMore\) return/.test(more)
  })(),
)

console.log("\nThe hero is split, and two thirds of it is real stock")

check(
  "words on a solid ground, photograph beside it — never on top of it",
  (() => {
    // Text over a photograph is legible over the picture you chose and over
    // nothing else, and every one of these is uploaded by a seller who was
    // photographing a jumper rather than composing a banner.
    return (
      /grid-cols-\[minmax\(0,0\.42fr\)_minmax\(0,0\.58fr\)\]/.test(hero) &&
      /backgroundColor: s\.ground/.test(hero)
    )
  })(),
)

check(
  "three slides: one editorial, two from the catalogue",
  (() => {
    return (
      /const EDITORIAL: Slide/.test(hero) &&
      /contentful\.depop\.com/.test(hero) &&
      /listings\s*\n?\s*\.slice\(0, 2\)/.test(hero) &&
      /return \[EDITORIAL, \.\.\.fromCatalogue\]/.test(hero)
    )
  })(),
)

check(
  "a slide with no photograph is dropped rather than drawn empty",
  /if \(!image\) return null/.test(hero),
)

check(
  "and the editorial host is allowed through next/image",
  (() => {
    // A host that is not listed is not "unoptimised" — next/image REFUSES it and
    // the browser paints its own broken-image glyph, on the first thing anybody
    // sees.
    return /hostname: 'contentful\.depop\.com'/.test(read("next.config.mjs"))
  })(),
)

check(
  "the carousel stops for the cursor and for a hidden tab",
  (() => {
    // A carousel that moves while you are reading the slide is the reason
    // people hate carousels; a background tab advancing thirty slides is thirty
    // layout passes nobody watched.
    return /onMouseEnter=\{\(\) => setPaused\(true\)\}/.test(hero) && /document\.visibilityState === "visible"/.test(hero)
  })(),
)

check(
  "an off-screen slide's button is out of the tab order",
  /tabIndex=\{i === index \? 0 : -1\}/.test(hero),
)

console.log("\nIt knows what this person was looking at")

check(
  "opening a listing is what records the signal",
  (() => {
    // A search can be a typo and a scroll can be a thumb; nobody opens a jumper
    // by accident.
    return /recordView\(\{/.test(detail) && /subcategory: product\.subcategory \?\? null/.test(detail)
  })(),
)

check(
  "the history lives on the device and is capped",
  (() => {
    // The most sensitive thing a shopping site holds. No server copy to leak
    // and no join to an account.
    const src = read("lib/marketplace/recent-views.ts")
    return (
      /localStorage/.test(src) &&
      /const MAX = 40/.test(src) &&
      !/fetch\(/.test(src) &&
      !/supabase/i.test(src)
    )
  })(),
)

check(
  "re-opening something moves it rather than counting it twice",
  (() => {
    const src = read("lib/marketplace/recent-views.ts")
    return /const list = read\(\)\.filter\(\(e\) => e\.id !== v\.id\)/.test(src)
  })(),
)

check(
  "recency is weighted, so this morning outranks last week",
  (() => {
    const views: RecentView[] = [
      { id: "1", brand: "Nike", at: 3 },
      { id: "2", brand: "Zara", at: 2 },
      { id: "3", brand: "Zara", at: 1 },
    ]
    const s = signalsFrom(views, "brand")
    // Two older Zaras still outweigh one recent Nike; the decay is a tie-break,
    // not a cliff.
    return s[0].value === "Zara" && s[1].value === "Nike" && s[0].weight > s[1].weight
  })(),
)

check(
  "and an empty history is not an error",
  signalsFrom([], "brand").length === 0,
)

check(
  "the ranking prefers brand, then the kind of thing, then the department",
  (() => {
    // Somebody looking at Carhartt trousers is likelier to want a Carhartt
    // jacket than another pair of trousers by anybody.
    return /brandScores\.get\(brand\) \?\? 0\) \* 3/.test(home) && /subScores\.get\(sub\) \?\? 0\) \* 2/.test(home)
  })(),
)

check(
  "the two recommendation rows cannot restate each other",
  (() => {
    // Eighteen cards repeating the six above them is worse than one row.
    return /const usedInBased = new Set\(basedOnViews\.slice\(0, 6\)/.test(home) && /!usedInBased\.has\(p\.id\)/.test(home)
  })(),
)

check(
  "you are never recommended what you just looked at",
  /const candidates = products\.filter\(\(p\) => !viewedIds\.has\(p\.id\)\)/.test(home),
)

check(
  "nothing is fetched — it is one array cut seven ways",
  !/fetch\(/.test(home) && !/useSWR/.test(home) && !/fetch\(/.test(row) && !/fetch\(/.test(more),
)

check(
  "the history is not read during render, so hydration cannot mismatch",
  (() => {
    // localStorage does not exist on the server; seeding state from it in a
    // lazy initialiser makes React discard the server HTML for the whole page.
    return /useState<RecentView\[\]>\(\[\]\)/.test(home) && /useEffect\(\(\) => \{\s*\n\s*const read = \(\) => setViews/.test(home)
  })(),
)

console.log("\nThe pills are a search somebody was about to run")

check(
  "a brand crossed with what it was sold as",
  (() => {
    // "Nike" alone is a brand page; "Nike sneakers" is a query.
    return /signalsFrom\(views, "brand"\)/.test(pills) && /\$\{b\.value\} \$\{noun\.toLowerCase\(\)\}/.test(pills)
  })(),
)

check(
  "and a first-time visitor still gets real ones",
  (() => {
    // A strip that is empty on every first visit is empty for most visits.
    return /if \(out\.length < 4\)/.test(pills) && /catalogue/.test(pills)
  })(),
)

check(
  "they are outlined, not filled",
  /border border-neutral-200 bg-white/.test(pills) && !/bg-neutral-900 text-white/.test(pills),
)

console.log("\nCategories wear their own stock")

check(
  "one tile per department, with a photograph from a listing inside it",
  /DEPARTMENTS\.map/.test(tiles) && /cardImage\(readVariants/.test(tiles),
)

check(
  "an empty department is not dressed in somebody else's stock",
  (() => {
    // Sending people to a page with nothing on it.
    return /image: cover\.get\(d\.id\) \?\? null/.test(tiles) && /\{t\.image && \(/.test(tiles)
  })(),
)

check(
  "the old browse-by-category rail is gone from the home page",
  (() => {
    // The feed no longer renders it, and the client block that carried it is
    // scoped to search results.
    const client = read("components/explore/explore-page-client.tsx")
    return (
      !/FeaturedCategoriesSection/.test(feed) &&
      !/MostPopularSection/.test(feed) &&
      /urlSearchQuery \? "space-y-8 hidden md:block" : "hidden"/.test(client)
    )
  })(),
)

console.log("\nAnd the desktop stops flashing a skeleton of the wrong page")

check(
  "there is no desktop skeleton",
  (() => {
    // It guessed the wrong shape AND guessed there would be a wait: ten grey
    // cards for two hundred milliseconds reads as a glitch, and the page still
    // jumps afterwards because the real layout is a hero and five rows.
    return !/md:block/.test(loading) && !/xl:grid-cols-5/.test(loading)
  })(),
)

check(
  "the phone shell stays",
  (() => {
    // The app has no browser chrome to say a navigation happened, and this is
    // the most expensive route in the product.
    return /mobile-feed-shell md:hidden fixed inset-0/.test(loading)
  })(),
)

check(
  "the home page is only drawn when there is nothing being searched for",
  /\{!searchQuery && <DesktopHome products=\{productsWithCreators\} \/>\}/.test(feed),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
