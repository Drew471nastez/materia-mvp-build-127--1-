/**
 * ===========================================================================
 *  THE BUYER SIDE'S LEFTOVERS, PINNED
 * ===========================================================================
 * One QA pass over the buyer side after a day of new screens. Each group
 * below is one thing the owner or the pass found, pinned so it stays fixed.
 * What it looks like is measured by the probes each group names.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { twMerge } from "tailwind-merge"
import { PRIMARY, SECONDARY, SMALL } from "../components/library/library-ui"
import { listPrice } from "../lib/pricing/list-price"
import { planInterval, planIntervals, withPriceIntervals } from "../lib/memberships/intervals"
import { onboardingResume } from "../lib/account/onboarding-resume"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

async function membershipPrices() {
  console.log("\nA membership's price says what it is per, everywhere it is written")
  const usd = (c: number) => `$${(c / 100).toFixed(0)}`
  check("a card: $9/month", listPrice({ price_cents: 900, type: "membership" }, usd).main === "$9/month")
  check("a yearly only plan: $90/year", listPrice({ price_cents: 9000, type: "membership", price_interval: "year" }, usd).main === "$90/year")
  check("a one-off price is left alone", listPrice({ price_cents: 900, type: "digital" }, usd).main === "$9")
  check("free stays Free", listPrice({ price_cents: 0, type: "membership" }, usd).main === "Free")
  check("monthly first, as the product row is", planInterval({ monthly_price_cents: 900, yearly_price_cents: 9000 }) === "month" && planInterval({ monthly_price_cents: null, yearly_price_cents: 9000 }) === "year")
  const asked: string[] = []
  const fake = { from: (t: string) => ({ select: () => ({ in: async (_c: string, ids: string[]) => { asked.push(t); return { data: ids.map((id) => ({ product_id: id, monthly_price_cents: null, yearly_price_cents: 9000 })), error: null } } }) }) }
  const rows = await withPriceIntervals(fake, [{ id: "a", type: "digital" }, { id: "b", type: "membership" }])
  check("a list with a membership reads its plan once", asked.length === 1 && (rows[1] as { price_interval?: string }).price_interval === "year" && !("price_interval" in rows[0]), rows)
  asked.length = 0
  await withPriceIntervals(fake, [{ id: "a", type: "digital" }])
  check("and a list without one asks nothing", asked.length === 0)
  const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { code: "42P01" } }) }) }) }
  check("a missing table is the default, never a failure", (await planIntervals(broken, ["x"])).size === 0)

  const wired: Array<[string, RegExp]> = [
    /* Changed on purpose: with its store's currency. */
    ["components/explore/product-card.tsx", /listPrice\(\{ \.\.\.product, currency: /],
    ["app/(marketing)/explore/page.tsx", /planIntervals\(supabase/],
    ["app/(marketing)/explore/[category]/page.tsx", /planIntervals\(supabase/],
    ["app/(marketing)/u/[username]/page.tsx", /price_interval: intervals\.get\(p\.id\)/],
    ["components/storefront/storefront-product-card.tsx", /price_interval: product\.price_interval/],
    ["components/store-builder/unified-section-renderer.tsx", /priced\(productPrice\)/],
    ["app/(marketing)/p/[slug]/page.tsx", /price_interval: membershipInfo\?\.interval/],
    ["components/store-builder/sticky-add-to-cart.tsx", /barPriceText\(product, pageCurrency\)/],
    ["lib/nav/quick-search.ts", /withPriceIntervals\(client, found\)/],
    /* The header's results draw the price quick-search already worked out (listPrice, above); the drawing moved out of the header itself. */
    ["components/platform/header-search-results.tsx", /\{hit\.price\}/],
    /* A person without a store has no products to price (components/profile/member-profile-page.tsx passes products={[]}); a creator's are the storefront card's, already checked above. */
    ["components/explore/featured-banner-carousel.tsx", /perInterval\(/],
    ["components/onepage/public-onepage.tsx", /perInterval\(/],
    ["lib/onepage/live-products.ts", /product_price_interval/],
    ["app/checkout/membership-checkout.tsx", /data-summary-price/],
    ["lib/receipts/load.ts", /priceInterval: type === "membership"/],
    ["app/receipt/[token]/receipt-view.tsx", /item\.priceInterval/],
    ["components/library/library-receipts.tsx", /r\.priceInterval/],
    ["lib/email.tsx", /i\.priceInterval/],
    /* The wishlist's price is listPrice's, handed the type and the plan's interval (components/wishlist/wishlist-entry.ts). */
    ["components/wishlist/wishlist-entry.ts", /price_interval: e\.interval/],
  ]
  for (const [file, pattern] of wired) check(`${file} writes the interval`, pattern.test(code(file)))
}

console.log("\nA half set up seller opens /sell where they left it (scripts/check-sell-onboarding.mjs resume)")
{
  const row = onboardingResume({ creator: { slug: "maya-prints", bio: "Risograph prints", niche_tags: ["Art"], onboarding_completed: false }, profile: { display_name: "Maya Chen" } })
  check("the row the plan step wrote is read back, and it opens on the plan step", !!row && row.displayName === "Maya Prints" && row.bio === "Risograph prints" && row.category === "Art" && row.step === 4, row)
  const typed = onboardingResume({ creator: { slug: "maya-prints", display_name: "Maya PRINTS!", onboarding_completed: false }, profile: null })
  check("the name as typed wins when its slug is the row's", typed?.displayName === "Maya PRINTS!", typed)
  check("a finished seller has nothing to resume", onboardingResume({ creator: { slug: "x", onboarding_completed: true } }) === null)
  check("a buyer who never started has nothing to resume", onboardingResume({ creator: null, profile: { display_name: "Ana", is_creator: false } }) === null)
  const old = onboardingResume({ creator: null, profile: { display_name: "Ana Ruiz", is_creator: true } })
  check("the old creator choice with no row opens on step one with the name", old?.step === 1 && old.displayName === "Ana Ruiz", old)
  const sell = code("app/(auth)/sell/page.tsx")
  check("/sell reads it back only for a setup that was started", /if \(access\.state === "started"\)/.test(sell) && /resume=\{resume\}/.test(sell))
  const modal = code("components/app/creator-onboarding-modal.tsx")
  /* Changed on purpose: d5b64308 (Name your store starts from the current name) starts from the profile's name, then the sign in's; neither replaces a store name read back. */
  check("and the sign in's name never replaces a store name read back", /const fromAccount = profileName \|\| \(user\.user_metadata\?\.full_name/.test(modal) && /if \(fromAccount && !resume\?\.displayName\)/.test(modal))
}

console.log("\nOne heading on every library tab (scripts/check-course-player.mjs draws the courses list)")
{
  const courses = code("components/courses/courses-index.tsx")
  check("the courses list draws no heading of its own under Library", !/<h1\b|<h2\b/.test(courses))
  check("and its skeleton draws no heading block either", !/h-7 w-32/.test(code("app/account/library/courses/loading.tsx")))
  const wishlist = code("components/wishlist/wishlist-content.tsx")
  check("the library's wishlist has no heading of its own either", !/<h1\b/.test(wishlist) && !/Nothing saved yet<\/h2>/.test(wishlist))
  check("and waits in its own shape, not a spinner or a header card", /<WishlistSkeleton \/>/.test(wishlist) && !/animate-spin/.test(wishlist) && !/Header card skeleton/.test(read("app/account/library/wishlist/loading.tsx")))
}

console.log("\nSMALL really is 36px (scripts/check-buyer-library.mjs measures it)")
{
  const merged = twMerge(PRIMARY, SMALL)
  check("merged, h-9 is the only height left", /\bh-9\b/.test(merged) && !/\bh-10\b/.test(merged), merged)
  check("and px-3 and 13px the only padding and size", /\bpx-3\b/.test(merged) && !/\bpx-4\b/.test(merged) && /text-\[13px\]/.test(merged) && !/text-\[14px\]/.test(merged))
  check("the secondary merges the same way", !/\bh-10\b/.test(twMerge(SECONDARY, SMALL)))
  const files = [
    "components/library/file-row.tsx",
    "components/library/library-home.tsx",
    "components/library/product-row.tsx",
    "components/library/library-product.tsx",
    "components/library/library-reviews.tsx",
    "components/courses/courses-index.tsx",
    "app/receipt/[token]/receipt-view.tsx",
  ]
  const concatenated = files.filter((f) => /\$\{(PRIMARY|SECONDARY|VIOLET)\}[^`]*\$\{SMALL\}|\$\{[^}]*\}\s+\$\{SMALL\}/.test(read(f)))
  check("no screen concatenates SMALL after a button any more; every one goes through cn()", concatenated.length === 0, concatenated)
}

/* THE BUY BAR'S PRICE NEVER CALLS ITSELF. A find-and-replace once turned
   barPriceText's own body into barPriceText(product), which threw "Maximum
   call stack size exceeded" on every priced product page. */
{
  const src = read("components/store-builder/sticky-add-to-cart.tsx")
  /* Changed on purpose: in the page's store currency. */
  const body = src.match(/function barPriceText\(product: ProductData, currency: string\): string \{([\s\S]*?)\n\}/)?.[1] ?? ""
  check("the sticky buy bar's price is formatted, not recursive", body.length > 0 && !/barPriceText\(/.test(body) && /formatPrice\(product\.price_cents, currency\)/.test(body))
}

/* "More from this creator" draws a community as a card, and a community has
   no category, so the pill fell through to the product's own kind and read
   "Membership" beside the community's name. The owner asked for that one
   pill to go. Every other card keeps its category pill, including the
   product's own page, so the check is that the opt-out exists, is used for a
   membership ONLY in that row, and that nothing else turned its pill off. */
{
  const card = read("components/explore/product-card.tsx")
  const fallsBackToKind = /const badgeText = product\.categoryName \|\| product\.categories\?\.\[0\]\?\.name \|\| product\.category \|\| \(categoryBadge \? product\.type : ""\)/
  check("the pill is a category, and the product's kind is its fallback only when the pill is asked for", fallsBackToKind.test(card))
  check("and no pill is drawn when there is nothing to say", /\{badgeText \? \(/.test(card) && /\{badgeText\}\s*<\/Badge>/.test(card))

  const row = read("components/store-builder/unified-section-renderer.tsx")
  check("More from this creator turns it off for a community and leaves every other kind alone", /categoryBadge=\{product\.type !== "membership"\}/.test(row))
  /* The product's own page still says what it is: that badge is a different one, from its own section. */
  check("the product's own page keeps its badge", /const categoryBadgeText = product\?\.categories\?\.\[0\]\?\.name \|\| productType/.test(row))

  const storefront = read("components/storefront/storefront-product-card.tsx")
  check("the storefront card passes the choice through rather than deciding for itself", /categoryBadge = true/.test(storefront) && /categoryBadge=\{categoryBadge\}/.test(storefront))
}

membershipPrices().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})
