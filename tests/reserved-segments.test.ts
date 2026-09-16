/**
 * ===========================================================================
 *  A HANDLE THAT COLLIDES WITH A ROUTE IS A PAGE THAT NEVER LOADS
 * ===========================================================================
 * `storelib.com/<handle>` is a creator's page, so every top-level route the
 * platform owns is a word no creator may hold. The failure mode is not an
 * error anyone would notice: Next serves the route, and that creator's page
 * is unreachable for ever while their dashboard goes on telling them that is
 * their address.
 *
 * The guard existed in THREE places and they had already drifted. The two
 * route files disagreed with each other over `creator-page`, and neither
 * agreed with lib/reserved-words, which is the one signup and the username
 * field actually check — so `checkout`, `library`, `dashboard`, `wishlist`,
 * `downloads`, `receipt` and a dozen more were free to claim.
 *
 * So the list is one list, and this walks `app/` and fails if a route exists
 * that is not in it. Adding a top-level route means adding a word; that is
 * the whole cost, and this is what tells you.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

import { RESERVED_ROOT_SEGMENTS, isReservedRootSegment } from "../lib/routes/reserved-segments"
import { isReservedWord } from "../lib/reserved-words"
import { creatorHandleFromPath, productFromPath, isSellerPage, isProductPage } from "../lib/url-helpers"

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

/**
 * Every first path segment `app/` can serve. A route group — `(marketing)` —
 * contributes nothing to the URL, so its children are the segments.
 */
function topLevelSegments(): string[] {
  const out = new Set<string>()
  const visit = (dir: string, isGroup: boolean) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (!statSync(p).isDirectory()) continue
      if (name.startsWith("_") || name.startsWith("@")) continue
      if (name.startsWith("(") && name.endsWith(")")) {
        visit(p, true)
        continue
      }
      /* A dynamic segment is the creator-handle slot itself, not a route. */
      if (name.startsWith("[")) continue
      out.add(name)
    }
    void isGroup
  }
  visit("app", false)
  return [...out].sort()
}

console.log("\nEvery route the platform owns is a word no creator can take\n")

const segments = topLevelSegments()
check("app/ has top-level routes to check", segments.length > 10, `${segments.length} found`)

const missing = segments.filter((s) => !RESERVED_ROOT_SEGMENTS.includes(s))
check(
  "every top-level route is in RESERVED_ROOT_SEGMENTS",
  missing.length === 0,
  `add to lib/routes/reserved-segments: ${missing.join(", ")}`,
)

/**
 * The list is only worth having if the thing that VALIDATES A USERNAME reads
 * it. This is the half that was missing: the routes guarded themselves and
 * signup did not, so the handle could be taken and then never resolve.
 */
const unguarded = segments.filter((s) => !isReservedWord(s))
check(
  "signup refuses every one of them",
  unguarded.length === 0,
  `isReservedWord says these are free: ${unguarded.join(", ")}`,
)

check("and the routes read the same list", isReservedRootSegment("explore") && isReservedRootSegment("APP"))
check("a real handle is not reserved", !isReservedRootSegment("andrew-rullz"))

console.log("\nReading the two bare addresses\n")

check("a single segment is a creator", creatorHandleFromPath("/andrew-rullz") === "andrew-rullz")
check("case is not part of a handle", creatorHandleFromPath("/AndrewRullz") === "andrewrullz")
check("a trailing slash changes nothing", creatorHandleFromPath("/andrew-rullz/") === "andrew-rullz")
check("the platform's own pages are not creators", creatorHandleFromPath("/pricing") === null)
check("nor is the root", creatorHandleFromPath("/") === null)
check("two segments is not a creator page", creatorHandleFromPath("/andrew-rullz/thing") === null)

check("two segments is a product", JSON.stringify(productFromPath("/andrew-rullz/t-shirt")) ===
  JSON.stringify({ handle: "andrew-rullz", slug: "t-shirt" }))
check("a query string is not a segment", JSON.stringify(productFromPath("/andrew-rullz/t-shirt?src=x")) ===
  JSON.stringify({ handle: "andrew-rullz", slug: "t-shirt" }))
check("a platform route with a child is not a product", productFromPath("/explore/design") === null)
check("neither is a blog post", productFromPath("/blog/some-post") === null)

/**
 * On a creator's own subdomain the paths mean something else entirely, and
 * these must stay out of the way — otherwise the marketing chrome decisions
 * flip on the one surface that is most definitely a seller's.
 */
check("a subdomain's own paths are left alone", creatorHandleFromPath("/links", "andrew.storelib.com") === null)

console.log("\nWhat counts as a seller surface\n")

check("the bare handle counts", isSellerPage("/andrew-rullz"))
check("the nested product counts", isSellerPage("/andrew-rullz/t-shirt"))
check("the old spellings still count", isSellerPage("/u/andrew-rullz") && isSellerPage("/p/t-shirt"))
check("marketing pages do not", !isSellerPage("/pricing") && !isSellerPage("/") && !isSellerPage("/explore"))
check("a product is a product under either spelling", isProductPage("/p/x") && isProductPage("/a/x"))
check("a creator page is not a product page", !isProductPage("/andrew-rullz"))

console.log("\nThe chrome asks the helper, not the prefix\n")

/**
 * Every one of these decides whether to show the marketing header or footer
 * over what is really a creator's page. They each did it with
 * `pathname.startsWith("/u/") || startsWith("/p/")`, which stopped being the
 * question the day a creator page became `/<handle>`. Storelib's own black
 * header came back over every one of them.
 *
 * Absence is checked on comment-stripped source, so a note ABOUT the old
 * spelling cannot fail this and cannot satisfy it either.
 */
const CHROME = [
  "components/marketing/conditional-header.tsx",
  "components/marketing/conditional-footer.tsx",
  "components/platform/platform-header-client.tsx",
]
for (const file of CHROME) {
  const src = stripComments(readFileSync(file, "utf8"))
  check(`${file} asks isSellerPage`, /isSellerPage\(pathname/.test(src))
  check(
    `${file} does not decide from the prefixes alone`,
    !/const isSellerPa(th|ge) =\s*\n?\s*pathname\.startsWith/.test(src) &&
      !/isSellerOrProductPage = pathname\.startsWith/.test(src),
    "`/<handle>` and `/<handle>/<slug>` are seller surfaces too",
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
