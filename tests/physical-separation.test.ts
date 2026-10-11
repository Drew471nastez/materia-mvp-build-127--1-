/**
 * A shop that ships things is its own business: its products are sold on
 * the creator's own website, through its own checkout, and followed on their
 * own order page with tracking. They never appear on Storelib's digital side:
 * Explore, creator profiles, Storelib's search, profile activity, the Library.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const surfaces: [string, string, number][] = [
  ["Explore", "app/(marketing)/explore/page.tsx", 1],
  ["an Explore category", "app/(marketing)/explore/[category]/page.tsx", 1],
  ["a creator's profile", "lib/profile/member-profile-data.ts", 1],
  ["Storelib's search", "app/api/v2/search/route.ts", 1],
  ["the header's quick search, by title and by creator", "lib/nav/quick-search.ts", 2],
  ["a profile's activity", "lib/profile/activity.ts", 1],
]
for (const [what, file, n] of surfaces) {
  const src = read(file)
  check(`${what} never lists a physical product`, (src.match(/\.neq\("type", "physical"\)/g) ?? []).length >= n, file)
}
check("the ranked search drops a physical result too", /results = results\.filter\(\(r\) => \(r as \{ type\?: unknown \} \| null\)\?\.type !== "physical"\)/.test(read("app/api/v2/search/route.ts")))
check("the Library's orders and receipts leave out an order that ships", /\.filter\(\(o\) => o\.product\?\.type !== "physical"\)/.test(read("lib/library/library-extras.ts")))
check("and its downloads were already digital only", /row\.product\?\.type === "digital"/.test(read("lib/library/get-library-downloads.ts")))
check("the digital checkout refuses a product that ships", /This product ships, so it is bought from the shop's cart\./.test(read("lib/checkout/pricing.ts")))
check("a paid physical order ends on its own order page", /\/checkout\/physical\/order\//.test(read("lib/physical/checkout-server.ts")))
/* Keyed by the checkout's token (orderPagePath), which is the order page's key; the order row's own token is a receipt's. */
check("the shop's own customer account sends an order that ships to that page, as Track order", /shipsOnly && orderPage\s*\? orderPage/.test(read("lib/site-accounts/account-data.ts")) && /orderPagePath\(shipFacts\.token\)/.test(read("lib/site-accounts/account-data.ts")) && /\? "Track order"/.test(read("lib/site-accounts/account-data.ts")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
