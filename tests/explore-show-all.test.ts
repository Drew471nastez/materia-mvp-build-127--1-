/**
 * ===========================================================================
 *  A BUTTON THAT LINKS TO A 404
 * ===========================================================================
 * Reported with the picture of it: pressing "Show All Products Products" on
 * /explore landed on /explore/for-you, which is a 404, with the products
 * still on the screen behind it.
 *
 * TWO THINGS WERE WRONG AND ONE OF THEM MADE THE OTHER INEVITABLE.
 *
 * The button was shown for every pill except "All" and pointed at
 * `/explore/<the pill>`. One of the pills is "For you", which is a feed, not
 * a category: the route has a list of the categories it serves and calls
 * `notFound()` for anything else. That list lived INSIDE the route, so
 * nothing that built a link to it could check, and the explore page had no
 * way to know it was writing an address that does not exist.
 *
 * So the list moved to lib/explore/category-pages, the route imports it, and
 * the button asks it. A pill with no page of its own has no button — there is
 * nothing more to show than what is already on the screen.
 *
 * AND THE LABEL SAID IT TWICE. The section title answers "Products" for
 * anything it cannot name, and the button appended "Products" to whatever it
 * said.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CATEGORY_PAGES, hasCategoryPage, showAllLabel } from "@/lib/explore/category-pages"
import { FOR_YOU_ID } from "@/lib/explore/interests"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\nOnly the categories that have a page get a link to one")

  check("For you has no page", !hasCategoryPage(FOR_YOU_ID))
  check("nor does All", !hasCategoryPage("all"))
  check("nor does a pill somebody invents later", !hasCategoryPage("brand-new-thing"))
  check("nor does nothing at all", !hasCategoryPage("") && !hasCategoryPage(null) && !hasCategoryPage(undefined))
  check("Design does", hasCategoryPage("design"))
  check("and so does every one the route serves", CATEGORY_PAGES.every((id) => hasCategoryPage(id)))

  console.log("\nThe route and the links read the same list")

  const route = read("app/(storelib)/(marketing)/explore/[category]/page.tsx")
  check(
    "the route imports it",
    /import \{ CATEGORY_PAGES \} from "@\/lib\/explore\/category-pages"/.test(route),
  )
  check(
    "and does not keep its own copy",
    !/const VALID_CATEGORIES = \[\s*\n\s*"design"/.test(route),
    "a second copy is a list that drifts, which is how a link to a 404 gets written",
  )
  check(
    "it still refuses anything not on it",
    /if \(!VALID_CATEGORIES\.includes\(category\)\) \{/.test(route),
  )

  const client = read("components/explore/explore-page-client.tsx")
  check(
    "the button is drawn only when the page exists",
    /\{hasCategoryPage\(mainCategory\) && \(/.test(client),
  )
  check(
    "and the old rule that let For you through is gone",
    !/\(mainCategory !== "all" \|\| selectedSubcategoryId\) && \(/.test(client),
  )

  console.log("\nAnd it says Products once")

  check('an unnamed section', showAllLabel("Products") === "Show All Products", showAllLabel("Products"))
  check('an empty name', showAllLabel("") === "Show All Products")
  check('a missing name', showAllLabel(null) === "Show All Products" && showAllLabel(undefined) === "Show All Products")
  check('a named category', showAllLabel("Design") === "Show All Design Products", showAllLabel("Design"))
  check('a subcategory', showAllLabel("Logo Templates") === "Show All Logo Templates Products")
  check('whatever the case', showAllLabel("products") === "Show All Products")
  check('and space around it', showAllLabel("  Design  ") === "Show All Design Products")
  check("the client uses it rather than building the words again", /showAllProductsLabel\(selectedSubcategoryLabel \|\| sectionTitle\)/.test(client))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
