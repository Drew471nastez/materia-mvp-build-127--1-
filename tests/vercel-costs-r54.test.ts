/**
 * VERCEL COSTS, ROUND 54: what each change keeps, and what it stops.
 * Found by reading production: published websites answered crawlers and
 * monitors with a whole render each time, /media files were fetched from
 * Supabase through Vercel on every request (x-vercel-cache: MISS), an open
 * website editor asked the server once a second all day, and each deploy
 * captured every page of every visited site again.
 */
import { readFileSync } from "node:fs"
import { sharedAtCdn, openedAsDocument } from "../lib/storelib-theme/compat/first-load"
import { visiblePollDelay, POLL_ACTIVE_MS, POLL_BASE_MS, POLL_LEFT_ALONE_MS } from "../lib/agent-access/connection-mark"
import { failedPollDelay, POLL_MS, POLL_FAILED_MAX_MS } from "../lib/website-builder/ai-site/use-generation"
import { slowingDelay } from "../lib/ui/slowing-poll"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

/* Public websites at the CDN */
check("a page and a client that sends no Sec-Fetch-Dest are kept at the CDN", sharedAtCdn(new Headers({ "sec-fetch-dest": "document" })) && sharedAtCdn(new Headers()))
check("a script's fetch and a frame are not (they get other markup)", !sharedAtCdn(new Headers({ "sec-fetch-dest": "empty" })) && !sharedAtCdn(new Headers({ "sec-fetch-dest": "iframe" })))
check("what a page is sent still depends on being opened as a page only", !openedAsDocument(new Headers()))
const route = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
check("the CDN header is only on a stranger's shared answer, keyed apart by Sec-Fetch-Dest", /if \(shared\) \{[\s\S]*if \(sharedAtCdn\(req\.headers\)\) \{[\s\S]*headers\.set\("Vary", "Sec-Fetch-Dest, X-Vercel-IP-Country"\)/.test(route))

/* /media through the CDN */
const vercel = JSON.parse(read("vercel.json")) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
check("the CDN may hold /media files as Supabase says", vercel.headers.some((h) => h.source === "/media/:path*" && h.headers.some((x) => x.key === "x-vercel-enable-rewrite-caching" && x.value === "1")))
check("no cache lifetime is forced on /media (each file's own Cache-Control is kept)", !vercel.headers.some((h) => h.source === "/media/:path*" && h.headers.some((x) => /cdn-cache-control/i.test(x.key))))
check("the proxy no longer runs for /media files", /matcher: \["\/\(\(\?!_next\/static\|_next\/image\|media\/\|/.test(read("proxy.ts")))
check("the rewrite to public storage is unchanged", /source: "\/media\/:path\*", destination: `\$\{storage\}\/storage\/v1\/object\/public\/:path\*`/.test(read("next.config.mjs")))

/* The open website editor */
check("in use: once a second; left alone: five seconds, then fifteen", visiblePollDelay(0) === POLL_ACTIVE_MS && visiblePollDelay(3 * 60_000) === POLL_BASE_MS && visiblePollDelay(11 * 60_000) === POLL_LEFT_ALONE_MS)

/* Polls that failed or wait on something that may never come */
check("an AI build poll backs off after failures, up to a minute, and is normal on success", failedPollDelay(POLL_MS, 0) === POLL_MS && failedPollDelay(POLL_MS, 2) === POLL_MS && failedPollDelay(POLL_MS, 4) === POLL_MS * 4 && failedPollDelay(POLL_MS, 30) === POLL_FAILED_MAX_MS)
check("a certificate check: 12 s for five minutes, then a minute, then five", slowingDelay(0, 12_000) === 12_000 && slowingDelay(6 * 60_000, 12_000) === 60_000 && slowingDelay(31 * 60_000, 12_000) === 300_000)
for (const f of ["components/app/settings/domains-panel.tsx", "components/website-builder/website-settings/domains.tsx", "components/community/creator/community-domain-panel.tsx"]) {
  check(`${f}: the certificate check slows down`, /slowingPoll\(/.test(read(f)) && !/setInterval\(tick, 12000\)/.test(read(f)))
}
check("the site link token is not minted while the tab is hidden", /if \(document\.visibilityState === "visible"\) primeOwnMarker\(\)\s*\}, 15_000\)/.test(read("lib/analytics/own-site.ts")))

/* ISR and stored copies */
check("after a deploy only the warmed pages of a site are taken again", /onlyThese: had !== null/.test(read("lib/edge/snapshot-capture.ts")))
check("the live marker is held at the CDN 30 s under the site's tag, never by a browser", /"Vercel-CDN-Cache-Control": "max-age=30", "Vercel-Cache-Tag": creatorSiteTag\(creator\.creatorId\)/.test(read("app/api/public/site-release/route.ts")) && /NO_STORE = \{ "Cache-Control": "no-store" \}/.test(read("app/api/public/site-release/route.ts")))
check("Publish expires that tag", /revalidateTag\(creatorSiteTag\(creatorId\), \{ expire: 0 \}\)/.test(read("lib/website-builder/published-site.ts")))
check("the store currency is held an hour, cleared by its tag", /tags: \[storeCurrencyTag\(creatorId\)\],[\s\S]{0,200}revalidate: 3600/.test(read("lib/store/selling-currency-server.ts")))
check("a site's shared copy is rewritten hourly at most", /revalidate: SHARED_ENTRY_S/.test(read("lib/website-builder/shared-copy.ts")) && /export const SHARED_ENTRY_S = 3600/.test(read("lib/website-builder/shared-copy.ts")))
check("blog list pages are cleared on publish too", /revalidatePath\("\/blog\/page", "layout"\)/.test(read("lib/blog/admin-http.ts")) && /revalidatePath\("\/blog\/page", "layout"\)/.test(read("lib/blog/went-live.ts")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
