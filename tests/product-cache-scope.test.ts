/**
 * ===========================================================================
 *  A SHARED CACHE MUST ONLY EVER HOLD SHARED THINGS
 * ===========================================================================
 * The product page is fast because most of it is fetched once and handed to
 * everybody: the product row, the creator, the theme, the variants, the file
 * names, the reviews. That is safe for exactly as long as nothing personal
 * gets in there.
 *
 * The failure mode is not subtle and it is not recoverable: one cached read
 * of `entitlements` and the first visitor's purchases are served to the next
 * one. There is no error, no exception, and nothing in the logs — the page
 * just quietly tells a stranger what somebody else owns.
 *
 * So the rules are checked rather than remembered:
 *
 *   1. The cache module never reads a table that belongs to a person.
 *   2. It never reads the session, because a value that depends on who is
 *      asking cannot be shared with everybody.
 *   3. The client it uses is the anon one. The service role bypasses row
 *      level security entirely, so anything cached through it would be rows
 *      the database would have refused a stranger, handed to one.
 *   4. lib/supabase/public-read.ts never gains the service role.
 *   5. The page still reads the personal half on the per-request client.
 */
import { readFileSync } from "node:fs"

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
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const CACHE = "lib/commerce/product-page-cache.ts"
const PUBLIC_READ = "lib/supabase/public-read.ts"
const PAGE = "app/(marketing)/p/[slug]/page.tsx"

const cacheSrc = stripComments(readFileSync(CACHE, "utf8"))
const publicReadSrc = stripComments(readFileSync(PUBLIC_READ, "utf8"))
const pageSrc = stripComments(readFileSync(PAGE, "utf8"))

console.log("\nNothing that belongs to one person is cached for all of them\n")

/**
 * Every table here answers a question about a PERSON, not about a product.
 * `wishlist` and `subscribers` are on the list for the same reason as
 * `orders`: they are keyed on who is asking.
 */
const PERSONAL_TABLES = [
  "entitlements",
  "orders",
  "profiles_private",
  "wishlist",
  "subscribers",
  "download_events",
  "payouts",
  "stripe_accounts",
]

for (const table of PERSONAL_TABLES) {
  check(
    `the product cache never reads ${table}`,
    !new RegExp(`from\\(["']${table}["']\\)`).test(cacheSrc),
    `${CACHE} would be sharing one visitor's ${table} with the next`,
  )
}

check(
  "the product cache never reads the session",
  !/auth\.getUser|auth\.getSession/.test(cacheSrc),
  "a value that depends on who is asking cannot be cached for everybody",
)

check(
  "the product cache never takes the per-request client",
  !/from ["']@\/lib\/supabase\/server["']/.test(cacheSrc),
  "the cookie client would cache one visitor's view of a row",
)

check(
  "the product cache never takes the service role",
  !/SERVICE_ROLE|supabase\/admin/.test(cacheSrc),
  "the service role bypasses row level security; cached rows would be rows a stranger may not see",
)

check(
  "the public-read client never takes the service role",
  !/SERVICE_ROLE/.test(publicReadSrc) && /ANON_KEY/.test(publicReadSrc),
  PUBLIC_READ,
)

console.log("\nAnd the personal half is still read per request\n")

for (const table of ["entitlements", "orders"]) {
  check(
    `the product page still reads ${table} on the request's own client`,
    new RegExp(`supabase\\s*\\n?\\s*\\.from\\(["']${table}["']\\)`).test(pageSrc) ||
      new RegExp(`await supabase[\\s\\S]{0,40}from\\(["']${table}["']\\)`).test(pageSrc),
    `${PAGE}: if this moved to the cache, ownership would be shared between visitors`,
  )
}

check(
  "the product page still asks who is looking",
  /supabase\.auth\.getUser\(\)|currentUserForRequest\(\)/.test(pageSrc),
  PAGE,
)

console.log("\nA save clears what the save changed\n")

const revalidateSrc = stripComments(readFileSync("app/api/revalidate/route.ts", "utf8"))

check(
  "the revalidate route clears tags, not only paths",
  /revalidateTag\(/.test(revalidateSrc),
  "revalidatePath does not touch unstable_cache entries; they are stored by tag",
)

check(
  "the revalidate route checks the caller owns the product",
  /auth\.getUser\(\)/.test(revalidateSrc) && /eq\(["']creator_id["']/.test(revalidateSrc),
  "app/api/revalidate/route.ts took any slug from anybody",
)

/**
 * The editor sends the id as well as the slug. The variants, files and
 * reviews are cached under the product's ID, so a save that sends only the
 * slug leaves a creator's new variant price hidden behind the old one until
 * the sixty-second backstop expires.
 */
check(
  "the product editor sends the product id when it asks for a revalidation",
  /productId: savedProductId/.test(readFileSync("app/app/products/new/product-editor.tsx", "utf8")),
  "app/app/products/new/product-editor.tsx",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
