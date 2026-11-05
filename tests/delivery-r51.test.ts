/**
 * ===========================================================================
 *  ROUND 51: ONE DELIVERY RULE FOR THE PUBLIC PAGES, AND WHAT TAKES THEM DOWN
 * ===========================================================================
 * Round 49 let the CDN hold storelib.com/<handle> for everybody. This round
 * extends the same rule (the render reads nothing of the visitor's, a tag
 * per tenant, a purge on every write) and pins:
 *
 *   1. storelib.me/<name> (a OnePage) is held by the CDN, tagged by its
 *      name, never for an RSC request, a write or any other storelib.me
 *      answer; its render reads no cookie, and the host only to word a
 *      redirect (the host is part of the address the CDN keys on).
 *   2. A OnePage change expires the CDN tag with the data; a product change
 *      finds the store's OnePage names and expires theirs.
 *   3. A ban, its lifting, an account deleted and a domain connected, made
 *      live or removed take every public page of the creator down
 *      (lib/delivery/public-pages-purge); a site password change redraws
 *      the site; the ban and spam verdicts carry tags so the minute is only
 *      a backstop.
 *   4. Storelib's landing rule (`/`, an hour at the CDN) is storelib.com's
 *      alone: a website's `/` (its 302 to its own domain included) never
 *      gets it.
 *   5. A new name cannot be a fake sign in page or support desk
 *      (lib/security/phishing-names), for a username, a OnePage and a
 *      website; the payment confirm is rate limited.
 *
 * What a production build answers (headers, the same bytes for a stranger,
 * a signed in person, the owner and every personal cookie, database round
 * trips, answers a second) is measured by scripts/check-public-delivery-r51.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
import { stripComments } from "./_source"
const require = createRequire(join(process.cwd(), "package.json"))

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

/** What next.config.mjs's header rules answer for a host, a path and a request's headers, by Next's own matchers. */
async function configAnswer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijkl.supabase.co"
  const { pathToFileURL } = await import("node:url")
  const config = await import(`${pathToFileURL(join(ROOT, "next.config.mjs")).href}?d51=${Date.now()}`)
  const rules = (await config.default.headers()) as { source: string; has?: object[]; missing?: object[]; headers: { key: string; value: string }[] }[]
  const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match") as { getPathMatch: (p: string) => (path: string) => Record<string, string> | false }
  const { matchHas } = require("next/dist/shared/lib/router/utils/prepare-destination") as { matchHas: (req: object, query: object, has?: object[], missing?: object[]) => unknown }
  return (host: string, path: string, headers: Record<string, string> = {}) => {
    const out: Record<string, string> = {}
    for (const r of rules) {
      const params = getPathMatch(r.source)(path)
      if (!params) continue
      if (!matchHas({ headers: { host, ...headers } }, {}, r.has as object[], r.missing as object[])) continue
      for (const h of r.headers) out[h.key.toLowerCase()] = h.value.replace(/:(\w+)/g, (_, k: string) => params[k] ?? `:${k}`)
    }
    return out
  }
}

async function main() {
  console.log("\n1. storelib.me/<name> is held by the CDN, for everybody")
  {
    const { onePageCdnTag, ONEPAGE_EDGE } = await import("@/lib/onepage/edge")
    const answer = await configAnswer()
    const visitors = [{}, { cookie: "sb-abcdefghijkl-auth-token=x" }, { cookie: "sl_owned_hint=1; sl_lang=fr; sl_country=FR" }, { referer: "https://storelib.com/app" }]
    const all = visitors.map((h) => JSON.stringify(answer("storelib.me", "/satori", h)))
    check("a OnePage: one answer for every visitor", new Set(all).size === 1, all)
    const page = answer("storelib.me", "/satori")
    check("  Vercel-CDN-Cache-Control, the same rule as a creator page, tagged by its name", page["vercel-cdn-cache-control"] === ONEPAGE_EDGE && page["vercel-cache-tag"] === onePageCdnTag("satori") && page["cache-control"] === undefined, page)
    check("  a minute, served stale for five while drawn again (round 49's EDGE_PAGE)", ONEPAGE_EDGE === "public, s-maxage=60, stale-while-revalidate=300" && /EDGE_PAGE = "public, s-maxage=60, stale-while-revalidate=300"/.test(read("next.config.mjs")))
    check("  a name with a dot or an underscore (pages older than the rules) too", answer("storelib.me", "/old.page_1")["vercel-cache-tag"] === "onepage-old.page_1")
    check("never an RSC request (a client side move, ScheduleRefresh's own ask)", answer("storelib.me", "/satori", { rsc: "1" })["vercel-cdn-cache-control"] === undefined)
    check("never another storelib.me answer: robots, a sitemap, a file, the canvas, an API call, two segments", ["/robots.txt", "/sitemap.xml", "/favicon.ico", "/site.webmanifest", "/api/onepage/track", "/__canvas/abc", "/satori/links", "/sitemap/onepages-1-of-2.xml", "/"].every((p) => answer("storelib.me", p)["vercel-cdn-cache-control"] === undefined))
    check("only on storelib.me: not a look alike host, not storelib.com's own /<handle> rule", answer("storelib.me.evil.test", "/satori")["vercel-cache-tag"] === undefined && answer("xstorelib.me", "/satori")["vercel-cache-tag"] === undefined && answer("storelib.com", "/satori")["vercel-cache-tag"] === "creator-page-satori")
    check("  the tag is the name lower case", onePageCdnTag(" Satori ") === "onepage-satori")
    const proxy = code("proxy.ts")
    check("the proxy sets nothing of its own on the OnePage rewrite (Next hides the rsc header from it)", /case "rewrite":\s*return NextResponse\.rewrite\(new URL\(onePage\.path, request\.url\)\)/.test(proxy) && !/onePageEdgeHeaders/.test(proxy))
    check("  and storelib.me still returns before any session is read or cookie written", proxy.indexOf("const onePage = onePageRoute(") > 0 && proxy.indexOf("const onePage = onePageRoute(") < proxy.indexOf("skipsSessionRefresh(pathname, cookieNames)"))
    const render = code("app/(storelib)/(marketing)/l/[slug]/page.tsx")
    check("the OnePage's render reads no cookie, and a header only for a renamed page's redirect (the host, which the CDN keys on)", !/\bcookies\s*\(/.test(render) && (render.match(/\bheaders\(\)/g) ?? []).length === 1 && /const onOnePageHost = isOnePageHost\(\(await headers\(\)\)\.get\("host"\)\)/.test(render) && !/getUser|currentUserForRequest|createClient\(\)/.test(render))
    check("  the route under the handle reads nothing either", !/cookies\(|headers\(\)/.test(code("app/(storelib)/(marketing)/[sellername]/links/page.tsx")))
    check("  and the layouts above it are round 49's cookie free ones", !/cookies\(|headers\(\)|from "next\/headers"/.test(code("app/(storelib)/(marketing)/[sellername]/layout.tsx")) && !/cookies\(|headers\(\)|from "next\/headers"/.test(code("app/(storelib)/(marketing)/layout.tsx")))
    const refresh = code("components/onepage/schedule-refresh.tsx")
    const { scheduleWait } = await import("@/lib/onepage/schedule-clock")
    check("a held copy past its next scheduled change asks the server again at once (round 40's scheduled link)", /router\.refresh\(\)/.test(refresh) && (scheduleWait(Date.now() - 30_000, Date.now()) ?? 99_999) < 5_000)
  }

  console.log("\n2. A OnePage change takes the CDN copy down with its data")
  {
    const src = code("lib/onepage/public-cache.ts")
    check("onePageChanged expires onepage-<name> for every name, after the data", /for \(const tag of onePageChangeTags\(change\)\) expire\(tag\)\s*for \(const name of new Set\(\(change\.names \?\? \[\]\)\.filter\(present\)\.map\(\(n\) => n\.trim\(\)\.toLowerCase\(\)\)\)\) expire\(onePageCdnTag\(name\)\)/.test(src))
    check("  expired, not marked stale", /revalidateTag\(tag, \{ expire: 0 \}\)/.test(src))
    check("onePageProductsChanged clears the blocks first, then finds the store's OnePage names and expires their CDN copies", /expire\(onePageShopTag\(creatorId\)\)[\s\S]*from\("onepages"\)\.select\("slug"\)\.or\(`seller_id\.eq\.\$\{creatorId\},creator_id\.eq\.\$\{creatorId\}`\)[\s\S]*expire\(onePageCdnTag\(name\)\)/.test(src))
    check("  only a uuid goes into the filter", /if \(!\/\^\[0-9a-f-\]\{36\}\$\/i\.test\(creatorId\)\) return/.test(src))
    for (const p of ["app/api/revalidate/route.ts", "app/api/internal/invalidate/route.ts", "app/api/store/channels/product/route.ts"]) check(`  awaited by ${p}`, /await onePageProductsChanged\(/.test(code(p)))
    check("  and started by a product forgotten (a sync purge)", /void onePageProductsChanged\(creatorId\)/.test(code("lib/products/forget-product.ts")))
    const wired: [string, RegExp][] = [
      ["app/api/onepage/publish/route.ts", /await onePageChangedFor\(ownerId/],
      ["app/api/onepage/route.ts", /await onePageChangedFor\(ownerId, \[existing\.slug\]\)/],
      ["lib/account/identity-caches.ts", /onePageChangedFor\(userId\)/],
      ["lib/custom-domains/store.ts", /await onePageChangedFor\(userId\)/],
    ]
    for (const [p, re] of wired) check(`  a OnePage writer clears it: ${p}`, re.test(code(p)))
  }

  console.log("\n3. A change to all of a creator's pages takes every one down")
  {
    const { publicPagesChanged } = await import("@/lib/delivery/public-pages-purge")
    const seen: string[] = []
    await publicPagesChanged({ creatorId: "c1", userId: "u1", names: ["lena", "satori"] }, {
      expire: (t) => seen.push(`tag ${t}`),
      creatorPages: async (w) => { seen.push(`creator ${w.creatorId} ${w.userId} ${w.handles.join(",")}`) },
      site: async (c) => { seen.push(`site ${c}`) },
      onePage: (c) => { seen.push(`onepage ${c.ownerUserId} ${c.names.join(",")}`) },
    })
    const want = ["tag creator-banned:c1", "tag profile-spam-state:u1", "creator c1 u1 lena,satori", "site c1", "onepage u1 lena,satori"]
    check("the verdicts first, then the creator page, the website and the OnePage, each by every name", JSON.stringify(seen) === JSON.stringify(want), seen)
    const failing = await publicPagesChanged({ creatorId: "c1", userId: null, names: [] }, { expire: () => { throw new Error("x") }, creatorPages: async () => {}, site: async () => {}, onePage: () => {} }).then(() => true, () => false)
    check("  never throws", failing)
    const bans = code("lib/seo/bans.ts")
    check("the ban and spam verdicts are tagged, so a purge reaches them", /tags: \[creatorBanTag\(creatorId\)\]/.test(bans) && /tags: \[spamStateTag\(userId\)\]/.test(bans))
    const moderate = code("app/api/admin/creators/moderate/route.ts")
    check("a ban takes the pages down, after the products go dark", /"unpublish the products",\s*\)[\s\S]*?exploreCatalogueTakenDown\(\)\s*await publicPagesChanged\(await readPublicNames\(\{ creatorId: target\.creatorId, userId: target\.userId \}\)\)/.test(moderate))
    check("  lifting it draws them again", /"lift the ban",\s*\)\s*await publicPagesChanged\(await readPublicNames/.test(moderate))
    const del = code("lib/account/delete-account.ts")
    check("an account deleted: its names read first, every page taken down last", del.indexOf("const publicNames = await readPublicNames({ creatorId, userId })") > 0 && del.indexOf("const publicNames = await readPublicNames") < del.indexOf("personalBuckets") && /if \(publicNames\) await publicPagesChanged\(publicNames\)\s*return \{ ok, mode, failures \}/.test(del))
    const domains = code("app/api/domains/route.ts")
    check("a domain connected, edited or removed (every change the route makes)", /async function changed\(creatorId: string\) \{\s*revalidateTag\(creatorDomainsTag\(creatorId\), \{ expire: 0 \}\)\s*await publicPagesChanged\(await readPublicNames\(\{ creatorId \}\)\)/.test(domains) && !/(?<!await )(?<!function )\bchanged\(creatorId\)/.test(domains))
    check("  and one made live by verification", /await publicPagesChanged\(await readPublicNames\(\{ creatorId, userId \}\)\)/.test(code("app/api/domains/verify/route.ts")))
    check("a site password turned on, off or changed redraws every page of the site", /refreshSiteSoon\(who\.creatorId\)\s*await revalidatePublishedSite\(who\.creatorId\)/.test(code("app/api/website-builder/site-password/route.ts")))
    check("a website published, unpublished or renamed still purges it (revalidatePublishedSite)", (code("app/api/website-builder/themes/[installId]/publish/route.ts").match(/await revalidatePublishedSite\(creator\.id\)/g) ?? []).length >= 2 && /await revalidatePublishedSite\(me\.creatorId\)/.test(code("app/api/website-address/route.ts")))
  }

  console.log("\n4. The landing page's hour at the CDN is storelib.com's alone")
  {
    const answer = await configAnswer()
    check("storelib.com/ keeps its hour", answer("storelib.com", "/")["cache-control"] === "public, s-maxage=3600, stale-while-revalidate=7200" && answer("www.storelib.com", "/")["cache-control"] === "public, s-maxage=3600, stale-while-revalidate=7200")
    check("a website's / gets nothing from it: its subdomain (the 302 to its own domain too), its own domain, storelib.me", ["lena.storelib.com", "www.lenashop.test", "storelib.me"].every((h) => answer(h, "/")["cache-control"] === undefined))
  }

  console.log("\n5. Names and writes")
  {
    const { isPhishingName } = await import("@/lib/security/phishing-names")
    const refused = ["paypal-login", "login", "secure-signin", "apple-support", "paypalsupport", "supportpaypal", "coinbase-wallet", "verify-account", "office365-alert", "metamask-recovery2", "my-login-page"]
    const allowed = ["apple-pie-bakery", "blogin", "loginov", "supportive", "amazonia-prints", "lena", "satori", "andrewrullz", "walletmaker", "secure-sounds", "stripe-studio-art", "help-me-paint"]
    check("a fake sign in page or support desk is refused", refused.every(isPhishingName), refused.filter((n) => !isPhishingName(n)))
    check("  an ordinary name is not", !allowed.some(isPhishingName), allowed.filter(isPhishingName))
    const { isValidUsername } = await import("@/lib/reserved-words")
    check("a username (and so a OnePage name) goes through it, with the same plain answer", isValidUsername("paypal-login").valid === false && isValidUsername("paypal-login").error === "This username is not available" && isValidUsername("lena-loops").valid === true)
    const { checkOnePageName } = await import("@/lib/onepage/username")
    check("  a OnePage name", checkOnePageName("apple-support").ok === false && checkOnePageName("lena-loops").ok === true)
    const { handleProblem } = await import("@/lib/website-builder/site-address")
    check("  a website's own name (<name>.storelib.com)", handleProblem("paypal-login") === "That name is not available." && handleProblem("lena-loops") === null)
    const confirm = code("app/api/checkout/confirm-payment/route.ts")
    check("the payment confirm is rate limited by address before Stripe is asked", /const limited = await rateLimit\(\{ bucket: "checkout-confirm", subjects: \[addressSubject\(request\)\]/.test(confirm) && confirm.indexOf("const limited = await rateLimit") < confirm.indexOf("fulfilPaymentIntent("))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
