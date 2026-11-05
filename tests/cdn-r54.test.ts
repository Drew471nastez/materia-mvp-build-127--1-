/**
 * ===========================================================================
 *  ROUND 54: HOW LONG THE CDN AND ISR HOLD A PUBLIC PAGE
 * ===========================================================================
 * Production (Vercel, 12 h): a 35% CDN hit rate, and 85K ISR revalidations
 * against 11K reads, ISR writes the largest line of the bill. Measured on a
 * production build with a CDN stand in (scripts/check-cdn-r54.mjs), the
 * causes were lifetimes, not leaks:
 *
 *   1. creator pages, product pages, Explore, OnePages and imported theme
 *      pages were fresh for a minute and served stale for five (an imported
 *      page for a day): a page nobody opened in six minutes was a MISS;
 *   2. every page of a Storelib theme website said `revalidate = 60`, and
 *      Next keeps the shortest lifetime of any held read in the draw, which
 *      were 60 and 300 seconds, so a page was drawn and written again every
 *      minute somebody opened it;
 *   3. a website's front page alone was sent `stale-while-revalidate=300` by
 *      the proxy, over the page's own ISR header (a year).
 *
 * This pins the new lifetimes, that each held read in a website's draw is at
 * least as long as the page (so the page keeps its hour), that the names a
 * site answers to are expired by every change that moves one, and that
 * nothing about WHO gets a shared copy changed: the RSC, embedded and scheme
 * requests are still never held, a market's or a password pass's answer is
 * still private, and the creator page's render still reads no cookie
 * (tests/cdnpages-r49 and tests/site-speed-r53 keep their own checks).
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const code = (p: string) => stripComments(read(p))
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name)
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

async function main() {
  console.log("\n1. The CDN's lifetimes: five minutes fresh, a day served stale")
  {
    const config = read("next.config.mjs")
    const edge = config.match(/export const EDGE_PAGE = "([^"]+)"/)?.[1]
    check("creator pages, product pages and Explore (EDGE_PAGE)", edge === "public, s-maxage=300, stale-while-revalidate=86400", edge)
    const { ONEPAGE_EDGE } = await import("@/lib/onepage/edge")
    check("  OnePages the same", ONEPAGE_EDGE === edge, ONEPAGE_EDGE)
    const anon = code("lib/storelib-theme/compat/anonymous-cache.ts")
    check("  an imported theme's shared page the same", /SHARED_PAGE_CDN = "public, s-maxage=300, stale-while-revalidate=86400"/.test(anon))
    check("  and its hold beside it as long as the CDN's fresh", /STRANGER_HOLD_SECONDS = 300\b/.test(code("lib/storelib-theme/compat/stranger-hold.ts")))
    const conf = stripComments(config)
    check("never held: an RSC request, the editor's canvas, a scheme preview", /const NEVER_HELD = \[\s*\{ type: 'header', key: 'rsc' \},\s*\{ type: 'query', key: 'embedded' \},\s*\{ type: 'query', key: 'scheme' \},\s*\]/.test(conf))
    check("  and the OnePage rule still leaves an RSC request out", /has: \[\{ type: 'host', value: 'storelib\\\\\.me' \}\],\s*missing: \[\{ type: 'header', key: 'rsc' \}\]/.test(conf))
    check("  still Vercel-CDN-Cache-Control, so a browser is never told to keep a page", (conf.match(/key: 'Vercel-CDN-Cache-Control', value: EDGE_PAGE/g) ?? []).length === 2)
  }

  console.log("\n2. A Storelib theme website's pages: an hour, purged on every change")
  {
    const { PUBLISHED_HOLD_S, SHOP_HOLD_PINGED_S, SHOP_HOLD_UNPINGED_S, shopHoldSeconds, siteNameTag } = await import("@/lib/delivery/holds")
    check("an hour as the backstop", PUBLISHED_HOLD_S === 3600)
    check("the shop: an hour when the database pings, five minutes when it cannot", shopHoldSeconds({ CACHE_INVALIDATE_SECRET: "s".repeat(40) }) === SHOP_HOLD_PINGED_S && SHOP_HOLD_PINGED_S === 3600 && shopHoldSeconds({}) === SHOP_HOLD_UNPINGED_S && SHOP_HOLD_UNPINGED_S === 300)
    check("a name's tag is its lower case", siteNameTag(" Nova ") === "site-name:nova")
    const routes = walk("app/(site)/w").filter((p) => /page\.tsx$/.test(p))
    const isr = routes.filter((p) => /^export const revalidate = /m.test(read(p)))
    const wrong = isr.filter((p) => !new RegExp(`^export const revalidate = ${PUBLISHED_HOLD_S}$`, "m").test(read(p)))
    check(`every held page of a website says ${PUBLISHED_HOLD_S} (${isr.length} pages)`, isr.length >= 15 && wrong.length === 0, wrong)
    /*
      THE PAGE KEEPS ITS HOUR ONLY IF EVERY HELD READ IN ITS DRAW IS AS LONG. Next shortens a page to its shortest
      `unstable_cache` revalidate (next/dist/server/web/spec-extension/unstable-cache.js). These are the modules a
      website's draw reads through; none may hold for less than the shop's own five minutes.
    */
    const drawn = [
      "lib/website-builder/published-site.ts",
      "lib/website-builder/collection-members.ts",
      "lib/website-builder/live-release.ts",
      "lib/website-builder/site-releases-server.ts",
      "lib/website-builder/site-seo-data.ts",
      "lib/markets/live.ts",
      "lib/markets/server.ts",
      "lib/reviews/app-server.ts",
    ]
    for (const p of drawn) {
      const src = code(p)
      const literal = [...src.matchAll(/revalidate:\s*(\d+)/g)].map((m) => Number(m[1])).filter((n) => n < SHOP_HOLD_UNPINGED_S)
      const named = [...src.matchAll(/const (\w+_(?:TTL|HOLD_S)) = (\d+)\b/g)].filter((m) => Number(m[2]) < SHOP_HOLD_UNPINGED_S).map((m) => m[1])
      check(`  ${p}: no held read shorter than five minutes`, literal.length === 0 && named.length === 0, { literal, named })
    }
    const site = code("lib/website-builder/published-site.ts")
    check("the name lookups are tagged by name", /\["site-name", lower\], \{ tags: \[siteNameTag\(lower\)\], revalidate: NAME_TTL \}/.test(site) && /\["site-renamed", lower\], \{ tags: \[siteNameTag\(lower\)\], revalidate: NAME_TTL \}/.test(site))
    check("  and Publish (revalidatePublishedSite) expires every name the site answers to, at once", /export async function revalidatePublishedSite[\s\S]*?for \(const name of await siteNames\(creatorId\)\) \{\s*revalidateTag\(siteNameTag\(name\), \{ expire: 0 \}\)\s*revalidatePath\(`\/w\/\$\{name\}`, "layout"\)/.test(site))
    for (const [p, re] of [
      ["app/api/website-address/route.ts", /await revalidatePublishedSite\(me\.creatorId\)/],
      ["lib/account/identity-caches.ts", /await d\.expireSite\(ids\.creatorId\)/],
    ] as const) check(`  a name moved runs it: ${p}`, re.test(code(p)))
    const { publicPagesChanged } = await import("@/lib/delivery/public-pages-purge")
    const seen: string[] = []
    await publicPagesChanged({ creatorId: "c1", userId: "u1", names: ["lena"] }, { expire: (t) => seen.push(t), creatorPages: async () => {}, site: async () => {}, onePage: () => {} })
    check("  and a ban, a deletion or a domain change expires each name read before it", seen.includes("site-name:lena"), seen)
    check("the shop's reads follow the database's pings", (site.match(/revalidate: shopHoldSeconds\(\)/g) ?? []).length >= 8 && !/SHOP_TTL/.test(site))
    check("  a community card, which no tag announces, keeps five minutes", /\["community-cards"[^\n]*\], \{ revalidate: SHOP_HOLD_UNPINGED_S \}\)/.test(site))
  }

  console.log("\n3. The front page is held like every other page, and only a shared answer is")
  {
    const proxy = code("proxy.ts")
    check("the proxy no longer sends a website's `/` a five minute stale window", !/"public, s-maxage=60, stale-while-revalidate=300"/.test(proxy))
    check("  the page drawn in a market's currency stays private", /if \(inLanguage\?\.kind === "page" && \/~m-\/\.test\(inLanguage\.path\)\) rewritten\.headers\.set\("Cache-Control", "private, no-cache"\)/.test(proxy) && /else if \(\/~m-\/\.test\(rewritePath\)\) r\.headers\.set\("Cache-Control", "private, no-cache"\)/.test(proxy))
    check("  a page let in with a password pass stays private", /if \(guarded\) rewritten\.headers\.set\("Cache-Control", "private, no-store"\)/.test(proxy) && /if \(guardedDomain\) r\.headers\.set\("Cache-Control", "private, no-store"\)/.test(proxy))
    check("  storelib.com's own landing rule still names storelib.com's hosts only", /source: '\/',\s*has: \[\{ type: 'host', value: `\(\?:\$\{STORELIB_HOSTS\}\)` \}\]/.test(stripComments(read("next.config.mjs"))))
    check("  the creator page still reads no cookie and no header (round 49)", !/\b(cookies|headers)\(\)/.test(code("app/(storelib)/(marketing)/[sellername]/page.tsx")))
  }

  console.log("\n4. Public reads after load: a day served stale while they are asked again")
  for (const p of ["app/api/reviews/stats/route.ts", "app/api/reviews/breakdown/route.ts", "app/api/physical/storefront/shop/route.ts"]) {
    check(`  ${p}`, /s-maxage=60, stale-while-revalidate=86400/.test(code(p)))
  }
  check("  the shop's owner still gets a private answer", /owner \? "private, no-store" :/.test(code("app/api/physical/storefront/shop/route.ts")))

  console.log("\n5. No request a page view did not need")
  {
    const { sharedJson, forgetSharedReads, SHARED_READ_MS } = await import("@/lib/net/shared-read")
    const asked: string[] = []
    const realFetch = globalThis.fetch
    let clock = 1000
    globalThis.fetch = (async (url: string) => { asked.push(String(url)); return new Response(JSON.stringify({ n: asked.length }), { status: 200 }) }) as typeof fetch
    try {
      forgetSharedReads()
      const [a, b] = await Promise.all([sharedJson<{ n: number }>("/api/offers?product=p1", undefined, () => clock), sharedJson<{ n: number }>("/api/offers?product=p1", undefined, () => clock)])
      check("two parts of a page asking at once: one request, one answer", asked.length === 1 && a?.n === 1 && b?.n === 1, asked)
      clock += SHARED_READ_MS + 1
      await sharedJson("/api/offers?product=p1", undefined, () => clock)
      check("  asked again once the moment has passed, so a change is never hidden", asked.length === 2, asked)
      await sharedJson("/api/offers?product=p2", undefined, () => clock)
      check("  another address is its own read", asked.length === 3)
    } finally {
      globalThis.fetch = realFetch
    }
    check("the product page's wishlist and offers reads go through it", /sharedJson<[^>]+>\(`\/api\/wishlist\/check\?productId=/.test(code("components/wishlist/wishlist-button.tsx")) && /sharedJson<[\s\S]{0,200}>\(`\/api\/offers\?product=/.test(code("components/offers/bundle-offers.tsx")))
    const { worthReadingAhead } = await import("@/lib/nav/prefetch-policy")
    check("a signed out visitor's tab bar never reads sign in or the library ahead", !worthReadingAhead("/login?next=%2Faccount", false) && !worthReadingAhead("/account/library", null) && !worthReadingAhead("/signup", false) && worthReadingAhead("/explore", false))
    check("  a signed in one still reads every tab", worthReadingAhead("/account/library", true) && worthReadingAhead("/account", true))
    const bar = code("components/nav/buyer-tab-bar.tsx")
    check("  both of the tab bar's read aheads filter by it", (bar.match(/\.filter\(\(href\) => worthReadingAhead\(href, signedIn\)\)/g) ?? []).length === 2)
    check("Log in and Sign up in the platform header are read on press", /const READ_ON_PRESS = /.test(code("components/platform/platform-header-client.tsx")) && /READ_ON_PRESS\.test\(path\) \? \{ prefetch: false as const \}/.test(code("components/platform/platform-header-client.tsx")))
    check("  and in the marketing headers", /<Link href="\/login" prefetch=\{false\}>/.test(code("components/marketing/header-client.tsx")) && /<Link href="\/signup" prefetch=\{false\}/.test(code("components/marketing/header.tsx")))
    check("Storelib's tab icon is cacheable (its query names its picture)", /source: '\/:icon\(icon\|apple-icon\)-:hash\(\[a-z0-9\]\+\)\.png'/.test(read("next.config.mjs")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
