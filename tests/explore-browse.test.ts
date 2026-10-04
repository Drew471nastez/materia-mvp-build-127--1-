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
 *   5. A category page (/explore/[category]) is built from the same parts:
 *      its loading screen is the page with the cards missing, and its
 *      category list and filters are Explore's.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { findInGroups, type BrowseGroup } from "@/components/explore/category-browser"
import { matchesSubcategory, subcategoryTerms } from "@/lib/explore/subcategory-match"

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
  /* Changed on purpose: "more standard, smooth and clean... not laggy". The cross of two moves and two fades is a push now. */
  check("the levels move by transform, and the veil by opacity, on one curve and one duration", /const move = still \? "none" : `transform \$\{BROWSE_SLIDE_MS\}ms \$\{BROWSE_EASE\}`/.test(browser) && /const veil = still \? "none" : `opacity \$\{BROWSE_SLIDE_MS\}ms \$\{BROWSE_EASE\}`/.test(browser)
    && /BROWSE_SLIDE_MS = 340/.test(browser) && /BROWSE_EASE = "cubic-bezier\(0\.25, 0\.9, 0\.3, 1\)"/.test(browser) && !/transition:\s*`(?:width|height|left|top)/.test(browser))
  check("a level is pushed in from the right edge, over the list", /transform: inSub \? "translate3d\(0, 0, 0\)" : "translate3d\(100%, 0, 0\)"/.test(browser))
  check("  the list under it moves a quarter left and dims under a veil", /transform: inSub \? `translate3d\(\$\{BROWSE_PARALLAX\}, 0, 0\)` : "translate3d\(0, 0, 0\)"/.test(browser) && /BROWSE_PARALLAX = "-25%"/.test(browser) && /opacity: inSub \? BROWSE_DIM : 0/.test(browser) && /BROWSE_DIM = 0\.06/.test(browser))
  check("  neither list fades, and no shadow rides the edge", !/boxShadow/.test(browser) && !/opacity: inSub \? 0 : 1/.test(browser) && !/opacity: inSub \? 1 : 0/.test(browser))
  check("  both lists are layers from the start", (browser.match(/willChange: "transform"/g) ?? []).length === 2)
  /*
    Changed on purpose: the level was drawn on the press (pointer down), so
    ten hidden buttons appeared under the finger before the click, and an
    iPhone drops the click for that (WebKit's ContentChangeObserver takes it
    for a hover menu opening): "tapping a category does nothing, it works on
    a later tap". scripts/check-explore-drill.mjs taps with real touches and
    counts what appears between the press and the click.
  */
  check("  nothing happens on the press: the tap draws the level and moves it, in one commit", !/onPointerDown/.test(browser) && !/prepare\(/.test(browser)
    && /const drillIn = useCallback\(\(id: string\) => \{[\s\S]{0,160}setHeld\(id\)\s*setSubOut\(false\)\s*setOpen\(id\)/.test(browser))
  check("  the chosen row wears a circled check that grows in and shrinks away by scale and opacity, and its text keeps its weight",
    /export function CheckDisc\(/.test(browser) && /transition-\[scale,opacity\]/.test(browser) && /on \? "scale-100 opacity-100/.test(browser) && /rounded-full bg-\[#eceef1\] text-\[#1a1a2e\]/.test(browser)
    && (browser.match(/<CheckDisc on=\{on\} \/>/g) ?? []).length === 2 && !/on && "font-medium"/.test(browser))
  /* Categories one step above subcategories; both lighter than the old semibold/medium pair. */
  check("  a category row is medium and a subcategory row normal, by level and never by whether it is chosen",
    /const groupWeight = "font-medium"/.test(browser) && /const itemWeight = "font-normal"/.test(browser) && /className=\{cn\(rowBase, rowCommon, groupWeight\)\}/.test(browser) && /className=\{cn\(rowBase, rowCommon, weight\)\}/.test(browser) && !/font-\[450\]/.test(browser))
  check("  and kept after going back, so nothing renders during a move", !/setHeld\(null\)/.test(browser) && /setSubOut\(true\)/.test(browser))
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
  check("a sort choice moves the circled check, and no row's weight changes", /<CheckDisc on=\{on\} \/>/.test(filters) && !/on && "font-medium"/.test(filters) && !/\bTick\b/.test(filters))
  check("the phone's button hands its close to the sheet, which moves before the page re-renders", /data-filters-done=""\s*data-sheet-close=""/.test(filters) && !/data-filters-done=""\s*onClick=/.test(filters))
  check("the Active: row under the pills is gone", !/>\s*Active:\s*</.test(page))
  check("For you keeps its own order", /mainCategory === FOR_YOU_ID && !searching \? "for-you"/.test(page))

  /*
    ROUND 3: the owner moved the header's hamburger to the navigator (my
    communities, Discover communities, Explore, Dashboard or Start creating;
    tests/place-navigator.test.ts). Categories are browsed on Explore itself,
    from its pills and More (section 2 above), so the header no longer
    carries a second copy of the list.
  */
  console.log("\n4. The header's hamburger is the navigator; categories stay on Explore")
  check("the header no longer draws the category browser", !/<CategoryBrowser\b|data-header-categories|data-categories-dropdown/.test(header))
  check("its hamburger is the navigator", /<PlaceNavigator\b/.test(header))
  check("Explore still has the whole list, from More", /<ExploreCategoryPicker\b/.test(page) && /<CategoryBrowser\b/.test(picker))
  check("no Back to Categories link, no Hot badge, no violet icon", !/Back to Categories|<Flame|text-violet-500/.test(header))

  console.log("\n5. A category page is built from Explore's parts")
  const catLoading = code("app/(marketing)/explore/[category]/loading.tsx")
  const catRoute = code("app/(marketing)/explore/[category]/page.tsx")
  const catSkeleton = code("components/explore/category-skeleton.tsx")
  const catFrame = code("components/explore/category-frame.tsx")
  const catPage = code("components/explore/category-page-client.tsx")
  check("its loading screen draws the page's frame and nothing of its own", /<CategoryLoading\b/.test(catLoading) && !/<Skeleton\b/.test(catLoading + catSkeleton))
  check("on the page's ground, in the page's container", [catLoading, catRoute].every((f) => /explore-ground min-h-screen bg-\[#f8f9fa\]/.test(f) && /max-w-\[1400px\] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8/.test(f)) && !/bg-white/.test(catRoute))
  check("only the cards are held back", /gridClassName="skeleton-deferred"/.test(catSkeleton) && /<ProductCardSkeleton\b/.test(catSkeleton))
  check("the page and its loading screen draw the same hero and pill row", [catSkeleton, catPage].every((f) => /<CategoryHero\b/.test(f) && /<CategoryControls\b/.test(f)))
  check("the loading screen knows the category and subcategory it is loading", /useParams/.test(catSkeleton) && /get\("sub"\)/.test(catSkeleton))
  check("the route reads ?sub= so the first HTML is the subcategory", /initialSubcategory=\{initialSub\}/.test(catRoute))
  check("the category list is Explore's picker", /<ExploreCategoryPicker\b/.test(catPage))
  check("the filters are Explore's, without a Recommended the page cannot rank", /<ExploreFilters\b/.test(catPage) && /o\.id !== "recommended"/.test(catPage) && /const DEFAULT_SORT = "newest"/.test(catPage))
  check("its own sheets, modal and chips are gone", !/function (MobileFilterSheet|MobileSubcategorySheet|DesktopSubcategoryModal)|<BottomSheet\b|>\s*Active:\s*<|>\s*Apply/.test(catPage))
  check("no violet and no icon beside the pills", !/violet/.test(catPage + catFrame + catSkeleton) && !/Layers|LayoutGrid|Grid3X3/.test(catPage))
  check("the addresses are the same: ?sub= on the category's page", /router\.push\(categoryPath\(category, target\), \{ scroll: false \}\)/.test(catPage) && /router\.push\(categoryPath\(groupId, itemId\)\)/.test(catPage))
  check("its search hands the header's field back like Explore's", /SEARCH_ANCHOR_ATTR/.test(catFrame))

  console.log("\n   a subcategory is found in the fields the pages load")
  const explore = code("components/explore/explore-page-client.tsx")
  check("explore remembers scroll for back from a product", /useExploreScrollRestore/.test(explore) && /useExploreScrollRestore/.test(catPage) && /useExploreScrollRestoring/.test(explore))
  check("neither page reads subcategory or tags, which the routes never select", ![catPage, explore].some((f) => /p\.subcategory|p\.tags/.test(f)))
  check("both use the shared rule", [catPage, explore].every((f) => /matchesSubcategory\(/.test(f)))
  const m = (id: string, label: string, product: { category?: string; title?: string; description?: string }) => matchesSubcategory(product, subcategoryTerms(id, label))
  check("a product filed under the subcategory's own name", m("presets", "Lightroom Presets", { category: "Lightroom Presets", title: "Moody Tones" }))
  check("a plural and its singular are one word", m("mockups", "Mockups", { title: "iPhone Mockup" }) && m("fonts", "Fonts & Typography", { title: "Display Font Family" }))
  check("the id's words, not the slug", m("after-effects", "After Effects", { title: "After Effects title pack" }) && m("ui-ux", "UI/UX Templates", { category: "UI Kits" }))
  check("half of a label finds it", m("scripts", "Scripts & Plugins", { title: "Figma plugin" }))
  check("a label without its generic last word", m("logos", "Logo Templates", { title: "Minimal logo pack" }))
  check("whole words only", !m("ads", "Ad Creatives", { title: "Uploads manager" }) && !m("print", "Print Design", { title: "Blueprint notes" }))
  check("a generic word on its own finds nothing", !m("apis", "APIs & Tools", { title: "Handy tools" }))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
