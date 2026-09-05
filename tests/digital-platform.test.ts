/**
 * ===========================================================================
 *  STORELIB SELLS DIGITAL PRODUCTS
 * ===========================================================================
 *
 * The platform was built to sell digital products -- downloads, courses,
 * templates, memberships -- and at some point the front door was given over to
 * a second-hand fashion marketplace. It has been switched back, and the
 * marketplace removed rather than parked.
 *
 * This suite is what keeps it switched. Not because anybody plans to pivot
 * again, but because the removal touched sixty-odd files and the easy failure
 * mode is a half-revert: a landing page that is digital while the sitemap still
 * advertises /shop, or a taxonomy that says Design while the header still
 * imports department-nav. Each check below is one of those seams.
 *
 * Run with:  npm run test:push
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  CATEGORIES,
  CATEGORY_NAV,
  CATEGORY_RAIL,
  categoryPath,
  normalizeCategoryToId,
} from "../lib/marketplace/categories"
import { dictionaries } from "../lib/i18n/dictionaries"
import { stripComments } from "./_source"

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

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))
const gone = (p: string) => !existsSync(join(root, p))

console.log("\nStorelib sells digital products\n")

/* ── THE FRONT DOOR ──────────────────────────────────────────────────────── */

const home = code("app/(marketing)/(feed)/page.tsx")
check(
  '"/" renders the digital-products landing, not a feed',
  home.includes("StorelibLanding") &&
    home.includes("_legacy-landing") &&
    !/ExploreFeed/.test(home),
  "        app/(marketing)/(feed)/page.tsx",
)

check(
  "the landing page and its sections still exist",
  !gone("app/(marketing)/_legacy-landing.tsx") &&
    ["hero", "bento-grid", "pricing-section", "product-marquee", "faq-section"].every(
      (f) => !gone(`components/marketing/${f}.tsx`),
    ),
)

check(
  "the home page says what Storelib sells",
  /Sell Digital Products Online/.test(home) && !/Second-Hand|Sneakers|Vintage/i.test(home),
)

/* ── THE MARKETPLACE IS GONE, NOT PARKED ─────────────────────────────────── */

const REMOVED = [
  "lib/shipping",
  "lib/eawb.ts",
  "components/shipping",
  "app/api/shipping",
  "app/checkout/livrare",
  "app/api/cron/shipping-awb",
  "lib/import",
  "app/api/import",
  "lib/marketplace/listing-taxonomy.ts",
  "lib/marketplace/department-nav.ts",
  "lib/marketplace/feed-filters.ts",
  "app/(marketing)/shop",
  "app/(marketing)/_explore-feed.tsx",
  "components/sell/new-listing-form.tsx",
  "components/checkout/marketplace-checkout.tsx",
  "app/api/listings",
]
const survivors = REMOVED.filter((p) => !gone(p))
check(
  `all ${REMOVED.length} marketplace-only modules are removed`,
  survivors.length === 0,
  survivors.length ? `        still present: ${survivors.join(", ")}` : undefined,
)

check(
  "nothing still imports them",
  (() => {
    // A dangling import is a build failure, so this is really a guard against
    // somebody restoring one file and not the rest.
    const FILES = [
      "app/sitemap.ts",
      "app/checkout/page.tsx",
      "app/api/checkout/stripe-session/route.ts",
      "components/platform/platform-header-client.tsx",
      "components/product/product-detail.tsx",
    ]
    const bad = FILES.filter((f) =>
      /lib\/shipping|lib\/eawb|listing-taxonomy|department-nav|feed-filters|marketplace-checkout/.test(code(f)),
    )
    if (bad.length) console.log(`        ${bad.join(", ")}`)
    return bad.length === 0
  })(),
)

check(
  "checkout charges no postage",
  (() => {
    // The parcel branch priced a delivery and refused the sale when the quote
    // disagreed with the page. Nothing is posted now, so the constant is zero
    // and there is no second checkout to route to.
    const page = code("app/checkout/page.tsx")
    const session = code("app/api/checkout/stripe-session/route.ts")
    return (
      /const shippingCents = 0/.test(session) &&
      !/quoteDelivery|quoteMatches/.test(session) &&
      !/isShippable|MarketplaceCheckout/.test(page)
    )
  })(),
)

/* ── THE TAXONOMY ────────────────────────────────────────────────────────── */

check(
  "the taxonomy is digital, with no fashion left in it",
  (() => {
    const ids: string[] = CATEGORIES.map((c) => c.id)
    const FASHION = ["womenswear", "menswear", "sneakers", "bags-accessories", "jewellery", "vintage"]
    return (
      ids.includes("design") &&
      ids.includes("templates") &&
      ids.includes("learning") &&
      ids.includes("audio") &&
      ids.includes("software") &&
      ids.includes("memberships") &&
      FASHION.every((f) => !ids.includes(f))
    )
  })(),
)

check(
  "sizes and conditions are gone with the physical goods",
  (() => {
    // A download has no waist measurement and is never "very good condition".
    const src = code("lib/marketplace/categories.ts")
    return !/SIZE_SYSTEMS|CONDITIONS|sizeOptionsForCategory|conditionLabel/.test(src)
  })(),
)

check(
  "every label comes from the marketing site's own vocabulary",
  (() => {
    // The twenty-one subcategory labels are the ones product-marquee.tsx has
    // shown all along. Checking a sample against that file, so the taxonomy
    // cannot drift into invented categories.
    const marquee = read("components/marketing/product-marquee.tsx")
    const labels = CATEGORIES.flatMap((c) => c.subcategories.map((s) => s.label))
    const SAMPLE = ["Notion Templates", "Beat Packs", "Online Courses", "E-books", "Game Assets", "Fonts"]
    return SAMPLE.every((l) => labels.includes(l) && marquee.includes(l))
  })(),
)

check(
  "the nav shapes are derived, not a second hand-maintained list",
  // department-nav.ts existed because the menus needed a different shape from
  // the taxonomy. It derived from a SECOND fashion taxonomy file, and the two
  // periodically disagreed. One source now.
  CATEGORY_NAV.length === CATEGORIES.length - 1 &&
    CATEGORY_RAIL.length === CATEGORIES.length &&
    CATEGORY_NAV.every((n) => n.subcategories.length > 0),
)

check(
  "legacy database category strings still resolve",
  // products.category is free text with three generations of value in it.
  normalizeCategoryToId("Notion Templates") === "templates" &&
    normalizeCategoryToId("beat pack") === "audio" &&
    normalizeCategoryToId("UI Kit") === "design" &&
    normalizeCategoryToId("Online Course") === "learning" &&
    // A fashion value has no home here and must NOT be quietly filed somewhere.
    normalizeCategoryToId("Womenswear") === "all" &&
    normalizeCategoryToId("") === "",
)

/* ── BROWSE AND SEO ──────────────────────────────────────────────────────── */

check(
  "/explore is a page again, not a redirect to the landing",
  (() => {
    // It redirected to "/" because "/" WAS the feed. "/" is a marketing page
    // now, so a redirect would send somebody asking to browse to the wrong
    // place entirely.
    const src = code("app/(marketing)/explore/page.tsx")
    return !/redirect\(/.test(src) && /from\("products"\)/.test(src) && /CollectionPage/.test(src)
  })(),
)

check(
  "the sitemap advertises the digital taxonomy and nothing fashion",
  (() => {
    const src = code("app/sitemap.ts")
    return (
      /for \(const category of CATEGORIES\)/.test(src) &&
      !/DEPARTMENT_NAV|categoryPath\(dept/.test(src) &&
      !/\/shop/.test(src)
    )
  })(),
)

check(
  "category paths point at /explore",
  categoryPath("design") === "/explore/design" &&
    categoryPath("design", "fonts") === "/explore/design?sub=fonts" &&
    categoryPath("all") === "/explore" &&
    categoryPath(null) === "/explore",
)

/* ── THE COPY ────────────────────────────────────────────────────────────── */

check(
  "no locale still describes a clothing marketplace",
  (() => {
    // Word-bounded on purpose. Unbounded, Romanian "haine" (clothes) matches
    // inside French "prochaine" and this check fails on a billing date.
    const BAD = /\b(second-hand|sneakers?|wardrobes?|dressing|pre-loved|haine|mâna a doua)\b/i
    const offenders: string[] = []
    for (const [loc, dict] of Object.entries(dictionaries)) {
      for (const [k, v] of Object.entries(dict)) {
        if (BAD.test(v)) offenders.push(`${loc}:${k} = ${v}`)
      }
    }
    if (offenders.length) console.log("        " + offenders.slice(0, 6).join("\n        "))
    return offenders.length === 0
  })(),
)

check(
  "the six categories are translated in every offered locale",
  (() => {
    // The picker offers a locale once it covers 70% of English; these are the
    // strings the header and the browse page render, so a missing one shows an
    // untranslated key to a real user.
    const ids: string[] = CATEGORIES.map((c) => c.id)
    return ["ro", "en", "es", "fr", "de"].every((loc) =>
      ids.every((id) => typeof dictionaries[loc]?.[`category.${id}`] === "string"),
    )
  })(),
)

check(
  "the dead fashion subcategory keys are gone from all five locales",
  ["ro", "en", "es", "fr", "de"].every(
    (loc) => !Object.keys(dictionaries[loc] ?? {}).some((k) => k.startsWith("marketplace.sub_")),
  ),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
