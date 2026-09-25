/**
 * EXPLORE'S LOADING SCREEN, CATEGORY LISTS AND FILTERS
 *
 * The owner's four asks for the marketplace, pinned where a regex can see
 * them. The geometry, the slide and the drag are measured by
 * scripts/check-explore-browse.mjs, which renders the real components.
 *
 *   1. The loading screen is the page with the products missing, not a
 *      banner and two sections the page no longer has.
 *   2. The More pill opens a panel on a computer and the shared sheet on a
 *      phone, with plain rows and a category's subcategories as a level
 *      that slides.
 *   3. The filters are two questions that apply as they are answered.
 *   4. The header's category menu is the same list.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { findInGroups, type BrowseGroup } from "@/components/explore/category-browser"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Code without its comments, so a note that names a thing does not count as the thing. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\s*\}/g, "{}")

function main() {
  const loading = code("app/(marketing)/explore/loading.tsx")
  const skeleton = code("components/explore/explore-skeleton.tsx")
  const card = code("components/explore/product-card-skeleton.tsx")
  const page = code("components/explore/explore-page-client.tsx")
  /* read, not code: a template string in it holds "/*", which the comment stripper would eat. */
  const browser = read("components/explore/category-browser.tsx")
  const picker = code("components/explore/explore-category-picker.tsx")
  const filters = code("components/explore/explore-filters.tsx")
  const header = code("components/platform/platform-header-client.tsx")

  console.log("\n1. The loading screen is the page")
  check("loading.tsx draws the Explore skeleton and nothing of its own", /<ExploreSkeleton\b/.test(loading) && !/<Skeleton\b/.test(loading))
  check("on the page's own ground, not white", /bg-\[#f8f9fa\]/.test(loading) && !/bg-white/.test(loading))
  check("only the cards are held back, so a quick page shows none", /gridClassName="skeleton-deferred"/.test(loading))
  check("the hero is the real one", /<ExploreHero\b/.test(skeleton))
  check("the pills are the real ones", /CATEGORY_PILLS\.map/.test(skeleton) && /PILL_EMOJI\[cat\.id\]/.test(skeleton))
  check("no banner, no pager, no second board", !/aspectRatio|Browse by Category|Pagination/i.test(skeleton + loading))
  check("the card placeholder is the card's rows in the card's type", /text-\[17px\] font-medium leading-tight/.test(card) && /aspect-video/.test(card) && /pt-4 font-semibold/.test(card))
  check("and it breathes on opacity, not a sweeping gradient", /chart-skeleton-breath/.test(card) && !/background-position|skeleton-shimmer|from "@\/components\/ui\/skeleton"/.test(card))

  console.log("\n2. The More pill")
  check("the old modal and the old filter sheet are gone", !/function CategorySelectorModal|function MobileFilterSheet/.test(page))
  check("More opens the picker", /<ExploreCategoryPicker\b/.test(page))
  check("a panel on a computer", /PopoverPrimitive\.Content/.test(picker) && /data-category-panel/.test(picker))
  check("the shared sheet on a phone, at a fixed height", /<BottomSheet\b[\s\S]*?\bfill\b[\s\S]*?height="min\(78dvh, 680px\)"/.test(picker))
  check("the list draws its own marks and imports no icon set", !/lucide-react/.test(browser))
  check("the levels move by transform and opacity only", /`transform \$\{BROWSE_SLIDE_MS\}ms \$\{EASE\}, opacity \$\{BROWSE_SLIDE_MS\}ms \$\{EASE\}`/.test(browser) && !/transition:\s*`(?:width|height|left|top)/.test(browser))
  check("each level scrolls itself, so back returns to where you were", (browser.match(/data-browse-level=/g) || []).length === 2 && /absolute inset-0 overflow-y-auto/.test(browser))
  check("the level out of sight takes no focus", /inert=\{inSub \|\| undefined\}/.test(browser) && /inert=\{!inSub \|\| undefined\}/.test(browser))
  check("a category held by More is named on it", /moreHolds \?/.test(page))

  const groups: BrowseGroup[] = [
    { id: "design", label: "Design", items: [{ id: "fonts", label: "Fonts & Typography" }, { id: "mockups", label: "Mockups" }] },
    { id: "photography", label: "Photography", items: [{ id: "presets", label: "Lightroom Presets" }] },
    { id: "freebies", label: "Freebies", items: [] },
  ]
  const f = (q: string) => findInGroups(groups, q).map((x) => (x.item ? `${x.group.id}/${x.item.id}` : x.group.id)).join(",")
  check("a search finds a subcategory by a word in it", f("typo") === "design/fonts", f("typo"))
  check("word starts come before matches inside a word", f("pre") === "photography/presets", f("pre"))
  check("a category's own name finds the category", f("free") === "freebies", f("free"))
  check("nothing typed, nothing found", f("   ") === "")

  console.log("\n3. The filters")
  check("two questions: an order and a price", /export const SORT_OPTIONS/.test(filters) && /export const PRICE_FILTERS/.test(filters) && !/Subcategories/.test(filters))
  check("no Apply: a choice applies when it is made", !/>\s*Apply\s*</.test(filters))
  check("the default order is called Recommended", /export const DEFAULT_SORT = "recommended"/.test(filters))
  check("and Newest sorts by date", /case "newest":\s*\n\s*products = products\.sort\(\(a, b\) => new Date\(b\.created_at\)/.test(page))
  check("the list follows the choice deferred, so the tap is not held by the grid", /useDeferredValue\(priceFilter\)/.test(page) && /useDeferredValue\(sortBy\)/.test(page))
  check("a panel on a computer, the shared sheet on a phone", /data-filters-panel/.test(filters) && /<BottomSheet\b/.test(filters))
  check("the phone's button says how many results", /Show \$\{resultCount\}/.test(filters))
  check("the Active: row under the pills is gone", !/>\s*Active:\s*</.test(page))
  check("For you keeps its own order", /mainCategory === FOR_YOU_ID && !searching \? "for-you"/.test(page))

  console.log("\n4. The header's category menu is the same list")
  check("on a computer", /data-header-categories[\s\S]{0,1200}<CategoryBrowser\b/.test(header))
  check("and in the phone sheet, at a fixed height", /fill=\{!isMarketingNavRoute\}/.test(header) && /height=\{isMarketingNavRoute \? undefined : "min\(78dvh, 680px\)"\}/.test(header))
  check("no Back to Categories link, no Hot badge, no violet icon", !/Back to Categories|<Flame|text-violet-500/.test(header))
  check("it ticks the category Explore is on, read from c as well as category", /searchParams\.get\("c"\) \|\| searchParams\.get\("category"\)/.test(header))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
