/**
 * ===========================================================================
 *  A STRANGER'S COMMUNITY PAGE, ONE COPY HELD BY THE CDN (round 63)
 * ===========================================================================
 * lib/communities/stranger-page decides which requests are a stranger's whole
 * page load of a community's public page; the proxy marks those and refuses a
 * marked address from outside and puts the CDN's instructions on its own
 * rewrite, so only the marked address is held, under the community's tag; every staff write, a publish, a
 * take down and a hide clear that tag; the layout draws no visitor's Referer
 * into a shared copy.
 */
import { readFileSync } from "node:fs"
import { COMMUNITY_STRANGER_CDN, COMMUNITY_STRANGER_HEADER, STRANGER_MARK, communitySlugTag, communityStrangerPage, markedFromOutside } from "../lib/communities/stranger-page"

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failures.push(`${name}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
}
const read = (f: string) => readFileSync(f, "utf8")
const ask = (pathname: string, o: Partial<{ method: string; rsc: boolean; search: string; signedIn: boolean }> = {}) =>
  communityStrangerPage({ method: o.method ?? "GET", pathname, rsc: o.rsc ?? false, search: new URLSearchParams(o.search ?? ""), signedIn: o.signedIn ?? false })

console.log("\n1. Who is a stranger, and which pages are shared")
check("a signed out page load of a community is shared, under its slug", ask("/community/clay-studio") === "clay-studio")
check("and its About", ask("/community/clay-studio/about") === "clay-studio")
check("somebody signed in is drawn for themselves", ask("/community/clay-studio", { signedIn: true }) === null)
check("a client side move (rsc) is not held", ask("/community/clay-studio", { rsc: true }) === null)
check("any query is drawn per visit (?join=1, an invite, a preview)", ask("/community/clay-studio", { search: "join=1" }) === null && ask("/community/clay-studio/about", { search: "ref=x" }) === null)
check("a write is never held", ask("/community/clay-studio", { method: "POST" }) === null)
check("a member's page (a post, a space, members) is not held", ask("/community/clay-studio/post/abc") === null && ask("/community/clay-studio/members") === null)
check("an address in capitals is left to the layout's redirect", ask("/community/Clay-Studio") === null)

console.log("\n2. The mark")
const marked = new URL(`https://storelib.com/community/clay-studio?${STRANGER_MARK}=1`)
check("a marked address from outside goes back to the plain one", markedFromOutside(marked)?.toString() === "https://storelib.com/community/clay-studio")
check("the rest of the query is kept", markedFromOutside(new URL(`https://storelib.com/community/x?a=1&${STRANGER_MARK}=1`))?.search === "?a=1")
check("a plain address is left alone", markedFromOutside(new URL("https://storelib.com/community/clay-studio")) === null)
check("the tag is the lowercase slug", communitySlugTag("Clay-Studio") === "community-page:clay-studio")

console.log("\n3. Wired in")
const proxy = read("proxy.ts")
check("the proxy refuses a marked address from outside, and drops the header anybody else sent", /request\.headers\.delete\(COMMUNITY_STRANGER_HEADER\)[\s\S]{0,120}markedFromOutside\(request\.nextUrl\)[\s\S]{0,200}NextResponse\.redirect\(plain, 308\)/.test(proxy))
check("the proxy marks a stranger's page, with no session read or renewed", /signedIn: carriesSignIn\([\s\S]{0,200}if \(strangerCommunity\) \{[\s\S]{0,80}request\.headers\.set\(COMMUNITY_STRANGER_HEADER, "1"\)[\s\S]{0,140}marked\.searchParams\.set\(STRANGER_MARK, "1"\)[\s\S]{0,700}NextResponse\.rewrite\(marked, \{ request \}\)/.test(proxy))
check("and only on storelib.com, never a community's own domain", /!username && !isCustomDomain && !communityPath && STORELIB_HOST\.test\(host\.split\(":"\)\[0\]\)\s*\?\s*communityStrangerPage/.test(proxy))
check("the CDN's instructions ride on the proxy's own rewrite, a minute and five more, under the community's tag", /const shared = NextResponse\.rewrite\(marked, \{ request \}\)\s*shared\.headers\.set\("Vercel-CDN-Cache-Control", COMMUNITY_STRANGER_CDN\)\s*shared\.headers\.set\("Vercel-Cache-Tag", communitySlugTag\(strangerCommunity\)\)/.test(proxy) && COMMUNITY_STRANGER_CDN === "public, s-maxage=60, stale-while-revalidate=300")
check("not a next.config rule, which matches the address asked for and would hold a hand typed mark", !/_sl_pub/.test(read("next.config.mjs")))
check("the redirect for a hand typed mark is never held (it would loop every stranger)", /const back = NextResponse\.redirect\(plain, 308\)\s*back\.headers\.set\("Cache-Control", "private, no-store"\)\s*back\.headers\.set\("Vercel-CDN-Cache-Control", "no-store"\)/.test(proxy))
const cache = read("lib/communities/server/public-cache.ts")
check("every staff write clears the held copy too", /if \(slug\) revalidateTag\(communitySlugTag\(slug\), \{ expire: 0 \}\)/.test(cache) && (read("lib/communities/server/context.ts").match(/communityPublicChangedAfter\(community\.id, community\.creator_id, community\.slug\)/g) ?? []).length === 2)
check("a take down or a hide by Storelib clears it at once", /communityPublicChanged\(communityId, [^\n]*\(row as \{ slug\?: string \| null \}\)\.slug \?\? null\)/.test(read("lib/communities/server/admin.ts")))
check("a shared copy draws no visitor's Referer", /visitBeacon\(page, asked\.get\(COMMUNITY_STRANGER_HEADER\) \? null : asked\.get\("referer"\)\)/.test(read("app/(storelib)/(marketing)/community/[slug]/layout.tsx")) && COMMUNITY_STRANGER_HEADER === "x-sl-community-public")

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
