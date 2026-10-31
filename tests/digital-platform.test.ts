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

/**
 * "/" is app/(marketing)/page.tsx again -- the file itself, restored verbatim
 * from 95bb2f8f, not a wrapper re-exporting a parked copy.
 *
 * The pivot renamed this file to _legacy-landing.tsx and put a fashion feed in
 * its place; an earlier pass at the switch-back left the rename alone and added
 * app/(marketing)/(feed)/page.tsx to re-export it, which worked but meant the
 * home page lived at a path Next.js only resolved to "/" by route-group
 * accident. Both the group and the parked copy are gone.
 */
const home = code("app/(marketing)/page.tsx")
check(
  '"/" is the landing page file itself, not a wrapper around a parked copy',
  home.includes("StorelibLanding") &&
    !home.includes("_legacy-landing") &&
    !/ExploreFeed/.test(home) &&
    gone("app/(marketing)/_legacy-landing.tsx") &&
    gone("app/(marketing)/(feed)/page.tsx"),
  "        app/(marketing)/page.tsx",
)

check(
  "the landing page's sections all still exist",
  [
    "hero", "bento-grid", "stats-bar", "manage-section", "split-features-section",
    "carousel-section", "tool-stack-section", "pricing-section",
    "features-badges-section", "faq-section", "cta-section", "product-marquee",
  ].every((f) => !gone(`components/marketing/${f}.tsx`)),
)

check(
  "the home page says what Storelib sells",
  (() => {
    // The landing itself carries no metadata export -- it inherits the root
    // layout's, which is where the title and description live. Checking both,
    // so the claim is tested where it is actually made.
    const root = code("app/layout.tsx")
    return (
      /Sell Products & Grow Your Audience/.test(root) &&
      /sell digital products/i.test(root) &&
      /* Changed on purpose (round 45): the Organization is built in lib/seo/structured-data.ts and printed by storelibHomeJsonLd. */
      /storelibHomeJsonLd\(\)/.test(home) &&
      /"@type": "Organization"/.test(code("lib/seo/structured-data.ts")) &&
      !/Second-Hand|Sneakers|Vintage/i.test(home)
    )
  })(),
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
  // Fashion-only helpers that outlived their callers.
  "lib/marketplace/listing-completeness.ts",
  "lib/marketplace/owned-listing.ts",
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
      "lib/seo/sitemaps.ts",
      "app/checkout/page.tsx",
      "app/api/checkout/stripe-session/route.ts",
      "components/platform/platform-header-client.tsx",
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
    // disagreed with the page.
    //
    // An earlier version of this check required `const shippingCents = 0` --
    // correct while checkout was the marketplace's with the postage zeroed out.
    // Checkout is the pre-pivot one now and has no shipping concept AT ALL, so
    // the constant does not exist and asserting it would have forced a zero back
    // into a file with nothing to zero. The property is the absence of postage,
    // not the presence of a zero.
    const files = [
      "app/checkout/page.tsx",
      "app/checkout/checkout-client.tsx",
      "app/api/checkout/stripe-session/route.ts",
      "app/api/checkout/process/route.ts",
    ]
    const POSTAGE = /shippingCents|quoteDelivery|quoteMatches|isShippable|MarketplaceCheckout|deliveryMode|awb/i
    const bad = files.filter((f) => POSTAGE.test(code(f)))
    if (bad.length) console.log(`        ${bad.join(", ")}`)
    return bad.length === 0
  })(),
)

/* ── THE TAXONOMY ────────────────────────────────────────────────────────── */

check(
  "the taxonomy is the real pre-pivot one, with no fashion left in it",
  (() => {
    // The fourteen recovered from 95bb2f8f, the last commit before the pivot.
    // An earlier pass invented six departments while this list was believed
    // lost and dropped AI, Social Media, Productivity, Video, E-commerce and
    // Freebies outright, so the count is checked as well as the members.
    const ids: string[] = CATEGORIES.map((c) => c.id)
    const REAL = [
      "all", "design", "development", "marketing", "business", "ai",
      "social-media", "productivity", "photography", "video", "audio-music",
      "education", "ecommerce", "freebies", "other",
    ]
    const INVENTED = ["templates", "learning", "audio", "software", "memberships"]
    const FASHION = ["womenswear", "menswear", "sneakers", "bags-accessories", "jewellery", "vintage"]
    return (
      ids.length === REAL.length &&
      REAL.every((r) => ids.includes(r)) &&
      INVENTED.every((i) => !ids.includes(i)) &&
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
  "the shared taxonomy still agrees with the browse pages it drives",
  (() => {
    // Three files carry this list: lib/marketplace/categories.ts (the shared
    // one), the CATEGORIES array inside explore-page-client.tsx, and the
    // VALID_CATEGORIES literal in the category route. The last two are restored
    // pre-pivot files and are deliberately left verbatim, so this is what stops
    // the shared copy drifting away from what the pages actually browse.
    const client = code("components/explore/explore-page-client.tsx")
    const route = code("app/(marketing)/explore/[category]/page.tsx")
    return CATEGORIES.every(
      (c) =>
        new RegExp(`id: "${c.id}"`).test(client) &&
        (c.id === "all" || new RegExp(`"${c.id}"`).test(route)),
    )
  })(),
  "        components/explore/explore-page-client.tsx",
)

check(
  "the nav shapes are derived, not a second hand-maintained list",
  // department-nav.ts existed because the menus needed a different shape from
  // the taxonomy. It derived from a SECOND fashion taxonomy file, and the two
  // periodically disagreed. One source now.
  CATEGORY_NAV.length === CATEGORIES.length - 1 &&
    CATEGORY_RAIL.length === CATEGORIES.length &&
    // "freebies" and "other" have no subcategories, and never did -- they are
    // buckets, not shelves. Every OTHER category must have some.
    CATEGORY_NAV.filter((n) => !["freebies", "other"].includes(n.id)).every(
      (n) => n.subcategories.length > 0,
    ),
)

check(
  "legacy database category strings still resolve",
  // products.category is free text with three generations of value in it.
  normalizeCategoryToId("Notion Templates") === "productivity" &&
    normalizeCategoryToId("beat pack") === "audio-music" &&
    normalizeCategoryToId("UI Kit") === "design" &&
    normalizeCategoryToId("Online Course") === "education" &&
    normalizeCategoryToId("Lightroom Presets") === "photography" &&
    normalizeCategoryToId("ChatGPT Templates") === "ai" &&
    // A fashion value has no home here. It lands in "other" -- a real browsable
    // category -- rather than being filed under a real one it does not belong to.
    normalizeCategoryToId("Womenswear") === "other" &&
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
    return (
      !/redirect\(/.test(src) &&
      /from\("products"\)/.test(src) &&
      /CollectionPage/.test(src) &&
      /ExplorePageClient/.test(src)
    )
  })(),
)

check(
  "the sitemap advertises the digital taxonomy and nothing fashion",
  (() => {
    const src = code("lib/seo/sitemaps.ts")
    return (
      /for \(const category of CATEGORIES\)/.test(src) &&
      !/DEPARTMENT_NAV|categoryPath\(dept/.test(src) &&
      !/\/shop/.test(src) &&
      // No `?sub=` rows: the category route does not read `sub`, so all seventy
      // of them served the same unfiltered page.
      !/\?sub=/.test(src)
    )
  })(),
)

check(
  "the marketing pages the pivot retired are reachable again",
  (() => {
    // /pricing, /features and /faq were 307ing to "/" and the Website Builder
    // was unreachable by URL -- all four retired BY the marketplace pivot, and
    // all four belong to a platform people subscribe to. The redirect list is
    // empty now; this fails if any of them is funnelled away again.
    const cfg = read("next.config.mjs")
    const block = cfg.slice(cfg.indexOf("async redirects()"))
    return (
      !/source: '\/(pricing|features|faq)'/.test(block) &&
      !/website-builder/.test(block) &&
      ["pricing", "features", "faq"].every((r) => !gone(`app/(marketing)/${r}/page.tsx`)) &&
      !gone("app/app/website-builder")
    )
  })(),
  "        next.config.mjs",
)

check(
  "and the sitemap advertises them",
  (() => {
    const src = code("lib/seo/sitemaps.ts")
    return ["/pricing", "/features", "/faq", "/explore"].every((r) => src.includes(`${"${BASE}"}${r}\`"`.slice(0, -1)) || src.includes(r))
  })(),
)

check(
  "every URL the sitemap advertises has a route behind it",
  (() => {
    // The sitemap listed /explore/<id> before the route existed, so a crawler
    // following it got a 404 from the domain that submitted the sitemap. The
    // category page is a real route now; this is what stops the two drifting
    // apart again.
    return (
      !gone("app/(marketing)/explore/[category]/page.tsx") &&
      !gone("app/(marketing)/explore/page.tsx") &&
      ["pricing", "features", "faq", "blog"].every((r) => !gone(`app/(marketing)/${r}/page.tsx`))
    )
  })(),
  "        app/(marketing)/explore/[category]/page.tsx",
)

check(
  "every category has an SEO description of its own",
  (() => {
    // An empty meta description wastes the page: it is what a search result
    // shows. One hand-written sentence per category, not a generated list.
    const src = read("app/(marketing)/explore/[category]/page.tsx")
    const block = src.slice(src.indexOf("CATEGORY_DESCRIPTIONS"))
    return CATEGORIES.filter((c) => c.id !== "all").every((c) =>
      new RegExp(`"${c.id}":\\s*\n?\\s*"`).test(block),
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
  "every category is translated in every offered locale",
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
