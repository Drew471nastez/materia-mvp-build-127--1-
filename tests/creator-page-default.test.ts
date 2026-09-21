/**
 * ===========================================================================
 *  EVERY CREATOR PAGE IS THE SAME PAGE
 * ===========================================================================
 * Two screenshots, side by side. One creator had been into the store builder
 * and had Home / Products / Communities, a divider, an About block with their
 * name and stats, and the payment methods. The other had uploaded a product
 * and never opened the builder, and had none of it: two tabs, a grid, a
 * footer.
 *
 * None of that is a customisation anybody chose. It is the page. Its absence
 * reads as a broken account rather than an unstyled one, and the objection
 * was the right one.
 *
 * TWO RULES CAUSED IT, and each made sense on its own.
 *
 * The About block existed only if the saved config had an `about` section,
 * which only happens once a creator has been into the builder. The argument
 * for leaving it out is that there is nothing in it, and that is the claim
 * scripts/check-default-about.mjs measures by rendering the real section with
 * nothing but the defaults:
 *
 *     heading "About Sunshinedayzz"   true
 *     SALES / JOINED / PRODUCTS       true / true / true
 *     "Accepted payment methods"      true, 6 card marks
 *     the returns line                true
 *     full-width rules                2
 *     and it is 368px tall
 *
 * Four things a stranger deciding whether to buy actually looks for, all of
 * them true of somebody who has never opened a builder.
 *
 * And the Products tab appeared only above ONE product, on the reasoning that
 * a tab onto the thing already on screen is worth nothing. True of the tab,
 * and not true of the page: a visitor does not see a tab that was not worth
 * drawing, they see a shop missing a tab every other shop has.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  const page = read("app/(marketing)/u/[username]/page.tsx")
  /* The branch taken by a creator who has never opened the builder starts at
     the comment that says so. */
  const fallbackAt = page.indexOf("// Default rendering when no custom config exists")
  const fallback = fallbackAt < 0 ? "" : page.slice(fallbackAt)
  const configured = fallbackAt < 0 ? page : page.slice(0, fallbackAt)

  console.log("\nThe About block is a default, not a reward for visiting a builder")

  check("there is one definition of it", /function withDefaultAbout\(sections: Section\[\]\): Section\[\]/.test(page))
  check(
    "it is added before the theme colours are applied",
    /applySectionThemeColors\(withDefaultAbout\(publishedConfig\.sections\)\)/.test(configured),
    "so the block a creator has never touched is coloured by the same pass as one they have",
  )
  check(
    "and it stands aside for the creator's own",
    /if \(sections\.some\(\(section\) => section\.type === "about"\)\) return sections/.test(page),
  )
  check(
    "the branch with no config ends with it too",
    /id: DEFAULT_ABOUT_SECTION_ID/.test(fallback) && /sellerTotalSales=\{fallbackTotalSales\}/.test(fallback),
  )
  check(
    "with the same sum the other branch makes",
    /const fallbackTotalSales = products\?\.reduce\(\(acc, p\) => acc \+ \(p\.sales_count \|\| 0\), 0\) \|\| 0/.test(fallback),
  )
  check(
    "and the owner can still edit it from their own page",
    /aboutOwnerActions=\{[\s\S]{0,200}EditAboutButton/.test(fallback),
  )

  console.log("\nThe Products tab needs one product, not two")

  check("in the configured branch", /if \(productsData\.length > 0\) \{/.test(configured))
  check("and nothing still asks for two", !/productsData\.length > 1/.test(page))

  console.log("\nThe branch with no config has the same three tabs")

  check("it builds a tab strip at all", /const tabs: StorefrontTab\[\] = \[/.test(fallback))
  check('"Home"', /id: "home",\s*\n\s*label: "Home",/.test(fallback))
  check('"Products"', /id: "products",\s*\n\s*label: "Products"/.test(fallback))
  check('"Communities"', /id: "communities",\s*\n\s*label: "Communities"/.test(fallback))
  check("and hands them to the same strip", /return <StorefrontTabs tabs=\{tabs\} \/>/.test(fallback))
  check(
    "and still ends with the seller's footer",
    /<SellerFooter \/>/.test(fallback),
  )

  console.log("\nAnd the probe renders the real section, not a copy of it")

  const probe = read("scripts/render-default-about.tsx")
  check("it mounts the real renderer", /import \{ SectionRenderer \} from "@\/components\/store-builder\/section-renderer"/.test(probe))
  check("with nothing but the defaults", /settings: \{ \.\.\.defaultAboutSettings \}/.test(probe))
  check(
    "and the checker counts the card marks",
    /paymentIcons < 6/.test(read("scripts/check-default-about.mjs")),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
