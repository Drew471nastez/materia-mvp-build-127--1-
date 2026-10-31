/**
 * ===========================================================================
 *  MARKETING PAGES SERVED FROM THE CDN
 * ===========================================================================
 * The owner: "cut Vercel function cost by making the public marketing pages
 * CDN-cacheable, without changing what anybody sees."
 *
 * One request read in a layout makes every page under it render per request.
 * app/(marketing)/layout read the wishlist cookie and the Host header, so
 * /pricing, /features, /faq and the homepage ran a function for every
 * visitor and were served `private, no-store`. Measured on a production
 * build (`next build`, then `next start`):
 *
 *   before  /, /pricing, /features, /faq, /blog, /blog/[slug],
 *           /developers, /legal/*, /account-deletion       all ƒ (dynamic)
 *   after   the same pages ○ or ● with a 30 second revalidate
 *
 * and the first paint of every one of them, signed out, is the same DOM as
 * before at a phone and a desktop width (scripts blocked, so nothing has
 * hydrated), with <main> starting at the same pixel signed in and signed out.
 *
 * These checks hold the source in that shape. What stays per request, and
 * why, is checked at the end.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Source without comments, so a note that names a function is not mistaken for a call. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const REQUEST_READS = /from "next\/headers"|\bcookies\(\)|\bheaders\(\)|readWishlistCount|isPlatformDomain|currentUserForRequest|createClient\(\)|searchParams|force-dynamic|connection\(\)/

console.log("\nThe marketing layout asks nothing about the request")
const layout = code("app/(marketing)/layout.tsx")
check("no cookie, no header, no session", !REQUEST_READS.test(layout), layout.match(REQUEST_READS)?.[0])
check("the header colour is the platform setting, held 30 seconds for everybody", /await isBuyerHeaderLight\(\)/.test(layout) && /revalidate: 30/.test(read("lib/platform/buyer-header-theme.ts")) && /unstable_cache\(/.test(read("lib/platform/buyer-header-theme.ts")))
check("and the header is told to answer the homepage question from the route", /<ConditionalHeader platformHomeFromRoute buyerHeaderLight=\{buyerHeaderLight\} \/>/.test(layout))
check("the same frame as before: header, main, the footer in its one Suspense, the tab bar", /<main className="flex-1">\{children\}<\/main>/.test(layout) && (layout.match(/<Suspense/g) ?? []).length === 1 && /<BuyerTabBar \/>/.test(layout))

console.log("\nThe homepage header is still in the first paint, and still only on Storelib's domain")
const header = code("components/marketing/conditional-header.tsx")
check("the page segment under the marketing layout is its own page.tsx only at the homepage", /const segmentBelow = useSelectedLayoutSegment\(\)/.test(header) && /hostSaysPlatform \|\| \(platformHomeFromRoute && segmentBelow === null\)/.test(header))
check("the first render still draws it at \"/\" from that answer", /pathname === "\/" && onPlatformDomain/.test(header))
check("and the effect still has the last word on the host", /const isOnCustomDomain = isCustomDomain\(host\)/.test(header) && /if \(isOnCustomDomain\) \{\s*setShowPlatformHeader\(false\)/.test(header))
const proxy = read("proxy.ts")
check("the proxy rewrites \"/\" on a connected domain to the creator's page", /\} else if \(pathname === "\/" \|\| pathname === ""\) \{\s*\/\/ username\.storelib\.com -> \/u\/\{username\}\s*rewritePath = `\/u\/\$\{username\}`/.test(proxy))
check("and sends a domain nobody connected to storelib.com", /Truly unknown domain — fallback to main site/.test(proxy))
check("the account layout, per visitor anyway, still asks the host", /isPlatformDomain\(\)/.test(code("app/account/layout.tsx")))

console.log("\nThe wishlist count")
const platformHeader = code("components/platform/platform-header-client.tsx")
check("the header never draws the count it was seeded with, so the server read drew nothing", /const \[, setWishlistCount\] = useState\(initialWishlistCount\)/.test(platformHeader))
check("and still asks /api/wishlist after it mounts", /\/api\/wishlist/.test(platformHeader))

console.log("\n/pricing is built once")
const pricingPage = code("app/(marketing)/pricing/page.tsx")
check("the page reads no session and no query", !REQUEST_READS.test(pricingPage), pricingPage.match(REQUEST_READS)?.[0])
const pricing = code("app/(marketing)/pricing/pricing-client.tsx")
check("who is signed in is the header's record of the session, read after hydration", /useSyncExternalStore\(subscribeAuthSnapshot, readSignedIn, \(\) => false\)/.test(pricing))
check("the upgrade mode is read from the address before the browser paints again", /useLayoutEffect\(\(\) => setQuery\(readUpgradeQuery\(\)\), \[\]\)/.test(pricing) && /new URLSearchParams\(window\.location\.search\)/.test(pricing))
check("returnTo is decoded once more, as the server did, and a bad escape does not throw", /try \{ returnTo = decodeURIComponent\(raw\) \} catch \{ returnTo = raw \}/.test(pricing))
check("the heading the upgrade mode renames is inside a scroll-in that starts hidden", /<AnimateOnScroll variant="blur-in">[\s\S]{0,400}headingOverride/.test(code("components/marketing/pricing-section.tsx")) && /"blur-in":\s*\{ opacity: 0/.test(read("components/marketing/bento-grid.tsx")))

console.log("\nThe blog is rebuilt at most once a minute")
for (const p of ["app/(marketing)/blog/page.tsx", "app/(marketing)/blog/[slug]/page.tsx", "app/(marketing)/blog/category/[slug]/page.tsx"]) {
  const src = code(p)
  check(`${p}: revalidate 60, not force-dynamic`, /export const revalidate = 60/.test(src) && !/force-dynamic/.test(src))
  check(`${p}: posts from the admin client, which reads no cookie`, !/from "@\/lib\/supabase\/server"/.test(src) && !/next\/headers/.test(src))
}
check("next.config gives the CDN the same minute for /blog", /source: '\/blog\/:path\*',\s*headers: \[\s*\{ key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' \}/.test(read("next.config.mjs")))
const post = code("app/(marketing)/blog/[slug]/page.tsx")
/* Changed on purpose (round 44): fetchPost moved to lib/blog/post so the post's layout can answer 404 before anything streams; still one read per render. */
const postData = read("lib/blog/post.ts")
check("fetchPost is one read per render: the layout, generateMetadata and the page share it through cache()", /import \{ cache \} from "react"/.test(postData) && /export const fetchPost = cache\(async \(slug: string\) =>/.test(postData) && /import \{[^}]*\bfetchPost\b[^}]*\} from "@\/lib\/blog\/post"/.test(post) && /blogPostExists\(slug\)/.test(read("app/(marketing)/blog/[slug]/layout.tsx")))
check("  and both still call it", (post.match(/await fetchPost\(slug\)/g) ?? []).length === 2)

console.log("\nWhat stays per request, and why")
check("/explore: the visitor's catalogue and session, and its search screen reads useSearchParams", /export const dynamic = "force-dynamic"/.test(code("app/(marketing)/explore/layout.tsx")) && /export const dynamic = "force-dynamic"/.test(code("app/(marketing)/explore/page.tsx")) && /readInterests/.test(code("app/(marketing)/explore/page.tsx")))
check("/p/[slug]: what the visitor owns and whether they made it", /export const dynamic = "force-dynamic"/.test(code("app/(marketing)/p/[slug]/page.tsx")) && /currentUserForRequest/.test(code("app/(marketing)/p/[slug]/page.tsx")))
check("/wishlist: the visitor's own list", /export const dynamic = "force-dynamic"/.test(code("app/(marketing)/wishlist/page.tsx")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
