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
import { cdnRuleFor, CDN_MAX_S, LARGE_BYTES } from "../app/api/media/[...path]/route"

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
check("browsers keep each /media file's own Cache-Control (only the CDN gets a rule)", !vercel.headers.some((h) => h.source === "/media/:path*" && h.headers.some((x) => x.key === "Cache-Control")))
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

/* Round 54, second pass */
check("the CDN keeps /media for an hour at most before asking again (the shortest lifetime any upload says)", vercel.headers.some((h) => h.source === "/media/:path*" && h.headers.some((x) => x.key === "Vercel-CDN-Cache-Control" && x.value === "max-age=3600, stale-while-revalidate=604800")))
const cspAt = vercel.headers.filter((h) => h.headers.some((x) => x.key === "Content-Security-Policy-Report-Only")) as { source: string; has?: { type: string; value: string }[] }[]
check("the report-only policy is sent on storelib.com only, so creator sites do not post reports to a function", cspAt.length === 1 && cspAt[0].source === "/(.*)" && JSON.stringify(cspAt[0].has) === JSON.stringify([{ type: "host", value: "^(www\\.)?storelib\\.com$" }]))
const part = read("supabase/sql/run-now/444_cache_ping_real_changes.sql")
check("part 444 skips an UPDATE that changes nothing but updated_at, before anything else", /BEGIN IF TG_OP = 'UPDATE' AND \(to_jsonb\(OLD\) - 'updated_at'\) = \(to_jsonb\(NEW\) - 'updated_at'\) THEN RETURN NULL; END IF;/.test(part))
check("and is otherwise part 179's function, triggers untouched", part.includes("PERFORM net.http_post(url := v_url") && !/CREATE TRIGGER/.test(part) && part === read("supabase/migrations/20271444_cache_ping_real_changes.sql"))
check("the check after has its column", /* Changed on purpose (round AU: part 451 follows it) */ / as p444_cache_ping_real_changes[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
check("an email being sent is checked every 5 s at first, slower if it waits", /slowingPoll\(\(\) => void ask\(\), 5000\)/.test(read("components/email/compose/composer.tsx")) && /slowingPoll\(\(\) => \{\s*if \(!document\.hidden\) refresh/.test(read("app/(storelib)/app/emails/email-detail.tsx")))
check("Settings is warmed at most every four minutes, on a computer too", /if \(Date\.now\(\) - settingsWarmedAt < 4 \* 60_000\) return/.test(read("components/app/sidebar.tsx")))

/* Pictures through app/api/media (live: Supabase's __cf_bm cookie kept the CDN from holding the plain rewrite) */
const media = read("app/api/media/[...path]/route.ts")
const cfg = read("next.config.mjs")
check("the CDN keeps a picture a day at most, never longer than the file says", cdnRuleFor("public, max-age=31536000") === "max-age=86400, stale-while-revalidate=604800" && cdnRuleFor("max-age=3600") === "max-age=3600, stale-while-revalidate=604800" && cdnRuleFor(null) === `max-age=${CDN_MAX_S}, stale-while-revalidate=604800`)
check("the storage host's cookie is not passed on (only named headers are)", !/set-cookie/i.test(media.replace(/\/\*[\s\S]*?\*\//g, "")) && /const KEEP = \["content-type", "cache-control", "etag", "last-modified", "content-disposition"\]/.test(media))
check("a missing or failing file is never held", /headers\.set\("Vercel-CDN-Cache-Control", "no-store"\)/.test(media))
check("a picture over 4 MB goes the old way (?direct=1), so no answer outgrows a function", LARGE_BYTES === 4 * 1024 * 1024 && /to\.searchParams\.set\("direct", "1"\)/.test(media))
check("a path that climbs or is empty is refused", /p !== "\." && p !== "\.\."/.test(media) && /path\.length < 2/.test(media))
const direct = cfg.indexOf('{ source: "/media/:path*", has: [{ type: "query", key: "direct" }]')
const pics = cfg.indexOf('destination: "/api/media/:path"')
const rest = cfg.indexOf('{ source: "/media/:path*", destination: `${storage}/storage/v1/object/public/:path*` }')
check("rewrites: ?direct=1 first, then pictures to the route, then every other file as before", direct > 0 && pics > direct && rest > pics)
check("only picture types go through the route (video and downloads keep range requests as before)", /\(\?:jpg\|jpeg\|png\|gif\|webp\|avif\|ico\|bmp\|/.test(cfg) && !/api\/media[^\n]*mp4/.test(cfg))

/* Third pass */
const seo = read("app/api/ai/seo/route.ts")
check("the SEO description helper is limited per account, after sign in, before the model call", /bucket: "ai-seo"/.test(seo) && seo.indexOf('bucket: "ai-seo"') > seo.indexOf('"Sign in to use this."') && seo.indexOf('bucket: "ai-seo"') < seo.indexOf("request.json()"))
check("the CDN check script asks every kind of public address", ["website (crawler)", "live marker", "picture"].every((k) => read("scripts/check-cdn-cache.mjs").includes(k)))

/* Scale: Explore's newest products by index */
const p445 = read("supabase/sql/run-now/445_explore_newest_index.sql")
check("part 445 adds Explore's newest-products index, published rows only, and runs again safely", /CREATE INDEX IF NOT EXISTS products_explore_newest_idx ON public\.products \(created_at DESC\) WHERE status = 'published'/.test(p445) && p445 === read("supabase/migrations/20271445_explore_newest_index.sql") && / as p445_explore_newest_index[,;]/.test(read("supabase/sql/run-now/99_check_after.sql"))) // Changed on purpose (round AU): part 451 now follows 445 in the check list
check("Explore still reads published products newest first, which the index serves", /\.eq\("status", "published"\)/.test(read("app/(storelib)/(marketing)/explore/page.tsx")) && /order\("created_at", \{ ascending: false \}\)\.limit\(100\)/.test(read("app/(storelib)/(marketing)/explore/page.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
