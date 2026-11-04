/**
 * ===========================================================================
 *  THE SHARED HALF IS CACHED, AND THE PERSONAL HALF NEVER IS
 * ===========================================================================
 * Measured on production before any of this:
 *
 *   product page   min 1.11s  median 4.13s  max 10.97s   (x-vercel-cache: MISS, always)
 *   /pricing       min 0.22s  median 0.26s  max 0.58s    (served from the CDN)
 *
 * Every product page request ran a server render. Most of what that render
 * fetches is the same for everybody, so it is fetched once and shared.
 *
 * WHAT THIS SUITE IS ACTUALLY FOR. A cache that holds the wrong thing is not
 * a performance bug, it is a data leak: one visitor's entitlements stored
 * under a key another visitor hits. So the rule is narrow and it is checked
 * rather than trusted —
 *
 *   cacheable      products, creators, profiles, store_builder_configs,
 *                  product_page_configs      (public rows, same for everyone)
 *   never          entitlements, orders, auth.getUser()
 *
 * and the cached reads go through an anon client with no session, so the
 * database itself refuses anything a signed-out stranger could not see.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const cacheLayer = read("lib/commerce/product-page-cache.ts")
/*
  Counting `unstable_cache(` on the raw file counts the one in the header
  comment explaining what `unstable_cache()` is for — the same trap that has
  caught three guards in this suite, where a check matched the prose above the
  code instead of the code.
*/
const cacheCode = stripComments(cacheLayer)
const publicClient = read("lib/supabase/public-read.ts")
const loaders = read("lib/commerce/product-page-data.ts")
const page = read("app/(marketing)/p/[slug]/page.tsx")
const publishRoute = read("app/api/store-builder/route.ts")

function main() {
  console.log("\nThe shared half is cached, and the personal half never is")

  /* ---------------------------------------------------------------------
     THE CLIENT THE CACHE READS THROUGH
     --------------------------------------------------------------------- */
  console.log("\n  a client with no session")

  /*
    THE SERVICE ROLE WOULD MAKE THIS A LEAK. It bypasses row-level security,
    so a cached value fetched with it could be a row the database would have
    refused to show a stranger — stored once and then served to one.
  */
  check("it never reaches for the service role", !/SERVICE_ROLE|createAdminClient/.test(publicClient))
  check("it uses the anon key", /NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(publicClient))
  check("and holds no session", /persistSession: false/.test(publicClient) && /autoRefreshToken: false/.test(publicClient))
  check("it reads no cookies", !/cookies\(\)|next\/headers/.test(publicClient))

  /* ---------------------------------------------------------------------
     ONLY PUBLIC TABLES ARE CACHED
     --------------------------------------------------------------------- */
  console.log("\n  only rows that belong to nobody")

  const CACHEABLE = ["products", "creators", "profiles", "store_builder_configs", "product_page_configs"]
  const NEVER = ["entitlements", "orders", "purchases", "download_tokens"]

  for (const table of CACHEABLE) {
    /* creators and profiles are read through their public views since run-now part 63 (lib/security/public-rows). */
    /* The two config tables are read for the cache by lib/store-builder/public-config.ts since round 48 (R48-6). */
    const configReader = table === "store_builder_configs" ? /readPublishedStoreConfig\(creatorId, pageType\)/ : table === "product_page_configs" ? /readPublishedProductPageConfig\(creatorId, productId\)/ : null
    check(`${table} is cached`, new RegExp(`\\.from\\("${table}"\\)`).test(cacheLayer) || new RegExp(`readPublicRow\\([^,]+, "${table}"`).test(cacheLayer) || (!!configReader && configReader.test(cacheLayer)))
  }
  for (const table of NEVER) {
    check(`${table} is NOT cached`, !new RegExp(`\\.from\\("${table}"\\)`).test(cacheLayer), "this would be one visitor's rows served to another")
  }
  /* Who is looking is asked fresh, every request, forever. */
  check("nothing in the cache layer asks who is signed in", !/auth\.getUser|getSession/.test(cacheLayer))
  /* Round 49: the page is one HTML for everybody (a CDN holds it); who is looking and what they own is asked by the browser after load, of /api/purchases/verify, per request, never cached. */
  const verifyRoute = readFileSync(join(process.cwd(), "app/api/purchases/verify/route.ts"), "utf8")
  check("and the page does not ask; the purchase check asks, per request", !/supabase\.auth\.getUser\(\)|currentUserForRequest\(\)/.test(page) && /supabase\.auth\.getUser\(\)/.test(verifyRoute))
  check("entitlements are read per request for the signed in person, never cached", /\.from\("entitlements"\)/.test(verifyRoute) && !/\.from\("entitlements"\)/.test(page))

  /* ---------------------------------------------------------------------
     IT FALLS BACK RATHER THAN SERVING AN EMPTY PAGE
     --------------------------------------------------------------------- */
  console.log("\n  it falls back rather than breaking")

  /*
    The anon client is subject to RLS. If a policy turns out to need a
    session, the cached read returns NOTHING — and an empty product page is
    worse than a slow one. Every loader tries the shared copy and falls
    through to the per-request client when it comes back empty.
  */
  const fallbacks = (loaders.match(/if \(shared\) return/g) || []).length
  check("every cached loader has a fallback", fallbacks === 5, `found ${fallbacks}`)
  /* Round 49: a fresh read as a stranger (the anon key, no session), so no cookie reaches the page's render. */
  check("and the fallback is a fresh read, as a stranger", /const supabase = createPublicReadClient\(\)/.test(loaders))

  /* ---------------------------------------------------------------------
     A PUBLISH CLEARS IT
     --------------------------------------------------------------------- */
  console.log("\n  a publish clears it")

  /*
    Without this a creator publishes, reloads, and sees the old page until
    the backstop expires — indistinguishable from a publish that did nothing,
    which is a bug this codebase has had reported before.
  */
  check("publishing revalidates the creator's tag", /revalidateTag\(creatorTag\(creator\.id\), "max"\)/.test(publishRoute))
  check("and the product's, when there is one", /if \(productId\) revalidateTag\(productTag\(productId\), "max"\)/.test(publishRoute))
  check("there is a backstop for the paths that forget", /export const PRODUCT_CACHE_TTL = 60/.test(cacheLayer))
  /*
    Counted against the number of cached reads rather than a literal, because
    the literal was 5 and the answer to the product page being slow was five
    MORE of them — the variants, the files, the reviews, the seller's other
    products, the course outline. A guard that has to be edited every time
    the thing it guards grows is a guard that gets edited without being read.
  */
  const cachedReads = (cacheCode.match(/unstable_cache\(/g) || []).length
  check("there are cached reads to check", cachedReads >= 10, `        found ${cachedReads}`)
  check(
    "and every cached read carries it",
    (cacheCode.match(/revalidate: PRODUCT_CACHE_TTL/g) || []).length === cachedReads,
  )
  check("with a tag on each", (cacheCode.match(/tags: \[/g) || []).length === cachedReads)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
