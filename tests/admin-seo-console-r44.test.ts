/**
 * ===========================================================================
 *  ROUND 44: THE SEO STATUS CONSOLE AT /admin/seo
 * ===========================================================================
 *   SIGNING     the service account JWT (RS256, the webmasters.readonly
 *               scope, Google's token address), checked with a key made here
 *   GOOGLE      a recorded URL Inspection answer read field by field, the
 *               request sent (inspectionUrl and siteUrl), refusals in words
 *   PROPERTIES  storelib.com and every subdomain, storelib.me, a URL prefix
 *               from the environment, and a creator's own domain in none
 *   SCORE       every check on fixture pages, robots.txt as Google reads it,
 *               a check that cannot be known left out of the score
 *   QUOTA       the cron's share per run, the rotation order, the database's
 *               locked counter
 *   GUARDS      the admin session on the page and the route, the cron
 *               secret on the cron, a rate limit on Check now
 *   NO ENV      without the service account the console says so, still
 *               shows the rest, and Google is never asked
 *   SQL         part 342 and its check after
 *
 * Google is not reachable from here: every request is checked against the
 * documented shape, not a live answer.
 *
 * Run with:  npm run test:push
 */
import { generateKeyPairSync, createVerify } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"

import { stripComments } from "./_source"

import { INSPECT_URL, SCOPE, TOKEN_URL, accessToken, forgetToken, inspectUrl, inspectionRefusal, parseInspection, serviceAccountFromEnv, signServiceAccountJwt, statusOfVerdict } from "@/lib/admin/seo/google"
import { CRON_SCHEDULE, inspectionsPerRun, kindOf, quotaDayStart, quotaFromEnv, rotationOrder, siteHandleOf, takePerProperty, type RotationRow } from "@/lib/admin/seo/plan"
import { DEFAULT_PROPERTIES, propertiesFromEnv, propertyFor } from "@/lib/admin/seo/properties"
import { POINTS, noindexIn, robotsAllows, sameAddress, scorePage, type PageFacts } from "@/lib/admin/seo/score"
import { parseListQuery } from "@/lib/admin/seo/store"

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
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

async function main() {
  /* ── Signing ─────────────────────────────────────────────────────────── */
  console.log("\nThe service account signs in the way Google documents\n")
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const account = { clientEmail: "storelib-seo@storelib-prod.iam.gserviceaccount.com", privateKey: pem }
  {
    const jwt = signServiceAccountJwt(account, 1_800_000_000)
    const [h, c, s] = jwt.split(".")
    const header = JSON.parse(Buffer.from(h, "base64url").toString())
    const claims = JSON.parse(Buffer.from(c, "base64url").toString())
    check("three base64url parts, no padding", jwt.split(".").length === 3 && !/[=+/]/.test(jwt))
    check("header is RS256, JWT", header.alg === "RS256" && header.typ === "JWT")
    check("claims: iss, scope, aud, iat, exp an hour later", claims.iss === account.clientEmail && claims.scope === SCOPE && claims.aud === TOKEN_URL && claims.iat === 1_800_000_000 && claims.exp === 1_800_003_600)
    check("scope is read only Search Console", SCOPE === "https://www.googleapis.com/auth/webmasters.readonly")
    const verify = createVerify("RSA-SHA256")
    verify.update(`${h}.${c}`)
    check("the signature verifies with the public key", verify.verify(publicKey, Buffer.from(s, "base64url")))

    const env = { GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: account.clientEmail, GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n") }
    const fromEnv = serviceAccountFromEnv(env)
    check("a key pasted with \\n for its line breaks is read back as PEM", fromEnv?.privateKey === pem.trim())
    check("no new dependency: node:crypto signs it", /from "node:crypto"/.test(read("lib/admin/seo/google.ts")) && !/googleapis|google-auth-library|jsonwebtoken|jose/.test(read("package.json")))

    forgetToken()
    const sent: { url: string; body: string }[] = []
    const fakeToken = (async (url: string, init?: RequestInit) => {
      sent.push({ url, body: String(init?.body ?? "") })
      return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3599, token_type: "Bearer" }), { status: 200 })
    }) as unknown as typeof fetch
    const token = await accessToken(account, fakeToken)
    const form = new URLSearchParams(sent[0]?.body ?? "")
    check("the JWT is exchanged at oauth2.googleapis.com/token", sent[0]?.url === "https://oauth2.googleapis.com/token" && token === "ya29.test")
    check("  as a jwt-bearer grant", form.get("grant_type") === "urn:ietf:params:oauth:grant-type:jwt-bearer" && (form.get("assertion") ?? "").split(".").length === 3)
    await accessToken(account, fakeToken)
    check("  and the token is reused while it lasts", sent.length === 1)
    forgetToken()
    let refused = ""
    try {
      await accessToken(account, (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch)
    } catch (e) {
      refused = e instanceof Error ? e.message : ""
    }
    check("a refused sign in says so, with Google's code and no key", refused.includes("invalid_grant") && !refused.includes("PRIVATE"))
    forgetToken()
  }

  /* ── Google's answer ─────────────────────────────────────────────────── */
  console.log("\nA recorded URL Inspection answer is read as Google wrote it\n")
  {
    const indexed = parseInspection(JSON.parse(read("tests/fixtures/search-console/url-inspection-indexed.json")))
    check("PASS is on Google", indexed.googleStatus === "indexed" && indexed.verdict === "PASS")
    check("coverage, indexing, robots.txt and fetch kept as Google said them", indexed.coverageState === "Submitted and indexed" && indexed.indexingState === "INDEXING_ALLOWED" && indexed.robotsTxtState === "ALLOWED" && indexed.pageFetchState === "SUCCESSFUL")
    check("last crawl as an ISO time", indexed.lastCrawlTime === "2026-10-27T14:03:11.000Z")
    check("both canonicals and the Search Console link", indexed.googleCanonical === "https://storelib.com/maya/notion-planner" && indexed.userCanonical === indexed.googleCanonical && !!indexed.inspectionLink?.startsWith("https://search.google.com/search-console/inspect"))
    const neutral = parseInspection(JSON.parse(read("tests/fixtures/search-console/url-inspection-not-indexed.json")))
    check("NEUTRAL is not on Google, with the reason", neutral.googleStatus === "not_indexed" && neutral.coverageState === "Crawled - currently not indexed")
    check("  and the two canonicals that disagree are both kept", neutral.googleCanonical === "https://storelib.me/maya" && neutral.userCanonical === "https://storelib.me/maya/")
    check("FAIL is not on Google; anything else is unknown, never indexed", statusOfVerdict("FAIL") === "not_indexed" && statusOfVerdict("VERDICT_UNSPECIFIED") === "unknown" && statusOfVerdict(null) === "unknown")
    const empty = parseInspection({})
    check("an empty answer is unknown with nothing made up", empty.googleStatus === "unknown" && empty.verdict === null && empty.lastCrawlTime === null)

    const calls: { url: string; init?: RequestInit }[] = []
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(read("tests/fixtures/search-console/url-inspection-indexed.json"), { status: 200 })
    }) as unknown as typeof fetch
    await inspectUrl("ya29.test", "https://storelib.com/maya/notion-planner", "sc-domain:storelib.com", fake)
    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}"))
    check("POST to urlInspection/index:inspect", calls[0]?.url === "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect" && INSPECT_URL === calls[0]?.url && calls[0]?.init?.method === "POST")
    check("  with inspectionUrl and siteUrl", body.inspectionUrl === "https://storelib.com/maya/notion-planner" && body.siteUrl === "sc-domain:storelib.com")
    check("  and the bearer token", (calls[0]?.init?.headers as Record<string, string>)?.Authorization === "Bearer ya29.test")
    let said = ""
    try {
      await inspectUrl("t", "https://storelib.com/", "sc-domain:storelib.com", (async () => new Response(JSON.stringify({ error: { code: 403, message: "You do not own this site, or the inspected URL is not part of this property." } }), { status: 403 })) as unknown as typeof fetch)
    } catch (e) {
      said = e instanceof Error ? e.message : ""
    }
    check("a 403 says the service account is not a user on the property", said === "The service account is not a user on sc-domain:storelib.com in Search Console.")
    check("a 429 says the day's quota is used", /quota/.test(inspectionRefusal(429, null, "sc-domain:storelib.com")))
  }

  /* ── Properties ──────────────────────────────────────────────────────── */
  console.log("\nEach address is asked about on its own Search Console property\n")
  {
    const p = DEFAULT_PROPERTIES
    check("defaults are the two Domain properties", p.join(",") === "sc-domain:storelib.com,sc-domain:storelib.me")
    check("storelib.com", propertyFor("https://storelib.com/maya/notion-planner", p) === "sc-domain:storelib.com")
    check("help.storelib.com", propertyFor("https://help.storelib.com/getting-started", p) === "sc-domain:storelib.com")
    check("a website at <name>.storelib.com", propertyFor("https://maya.storelib.com/", p) === "sc-domain:storelib.com")
    check("a OnePage at storelib.me", propertyFor("https://storelib.me/maya", p) === "sc-domain:storelib.me")
    check("a creator's own domain is in none of them", propertyFor("https://www.mayamakes.com/products/planner", p) === null)
    check("  nor is a look alike host", propertyFor("https://notstorelib.com/", p) === null && propertyFor("https://storelib.com.evil.io/", p) === null)
    const env = propertiesFromEnv({ GOOGLE_SEARCH_CONSOLE_PROPERTIES: "sc-domain:storelib.com, sc-domain:storelib.me, https://www.mayamakes.com/" })
    check("the environment can add a URL prefix property", env.length === 3 && propertyFor("https://www.mayamakes.com/products/planner", env) === "https://www.mayamakes.com/")
    check("  which is more specific than a Domain property over it", propertyFor("https://shop.storelib.com/x", ["sc-domain:storelib.com", "https://shop.storelib.com/"]) === "https://shop.storelib.com/")
    check("nonsense in the environment falls back to the defaults", propertiesFromEnv({ GOOGLE_SEARCH_CONSOLE_PROPERTIES: "storelib, ???" }).join(",") === DEFAULT_PROPERTIES.join(","))
  }

  /* ── Kinds ───────────────────────────────────────────────────────────── */
  console.log("\nEvery address has a kind, from the sitemap file that listed it\n")
  {
    check("products-N, creators-N, onepages-N, communities-N, websites-N", kindOf("https://storelib.com/a/b", "products-3") === "product" && kindOf("https://storelib.com/a", "creators-0") === "profile" && kindOf("https://storelib.me/a", "onepages-0") === "onepage" && kindOf("https://storelib.com/community/x", "communities-0") === "community" && kindOf("https://a.storelib.com/", "websites-0") === "website" && kindOf("https://a.storelib.com/about", "site:a") === "website")
    check("pages.xml: blog, help, category, legal, page", kindOf("https://storelib.com/blog/x", "pages") === "blog" && kindOf("https://help.storelib.com/x", "pages") === "help" && kindOf("https://storelib.com/explore/templates", "pages") === "collection" && kindOf("https://storelib.com/privacy", "pages") === "legal" && kindOf("https://storelib.com/terms", "pages") === "legal" && kindOf("https://storelib.com/pricing", "pages") === "page")
    check("a website's handle from its front page", siteHandleOf("https://maya.storelib.com/", "storelib.com") === "maya" && siteHandleOf("https://help.storelib.com/", "storelib.com") === null && siteHandleOf("https://storelib.com/", "storelib.com") === null)
    const q = parseListQuery((k) => ({ kind: "product", status: "not_indexed", q: "  planner ", page: "3" })[k])
    check("the list's filters are read and bounded", q.kind === "product" && q.status === "not_indexed" && q.q === "planner" && q.page === 3)
    const bad = parseListQuery((k) => ({ kind: "drop table", status: "x", page: "-2" })[k])
    check("  and unknown values fall back", bad.kind === "all" && bad.status === "all" && bad.page === 1)
  }

  /* ── Score ───────────────────────────────────────────────────────────── */
  console.log("\nThe score is the live page's checks, each with what it found\n")
  {
    check("the points add up to 100", Object.values(POINTS).reduce((a, b) => a + b, 0) === 100)
    const good = `<!doctype html><html><head>
      <title>Notion planner by Maya | Storelib</title>
      <meta name="description" content="A Notion planner for weekly reviews, habits and goals, with a dashboard and templates for every month.">
      <link rel="canonical" href="https://storelib.com/maya/notion-planner">
      <meta property="og:title" content="Notion planner">
      <meta property="og:image" content="https://storelib.com/media/p/1.jpg">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Notion planner"}</script>
      </head><body><h1>Notion planner</h1><img src="/a.jpg" alt="The planner's dashboard"><img src="/b.jpg" alt=""></body></html>`
    const facts: PageFacts = { url: "https://storelib.com/maya/notion-planner", status: 200, headers: { "content-type": "text/html" }, html: good, inSitemap: true, robotsAllowed: true, google: "indexed" }
    const full = scorePage(facts)
    check("a page that passes everything scores 100", full.score === 100 && full.checks.every((c) => c.state === "pass"), full.checks.filter((c) => c.state !== "pass").map((c) => `${c.id}: ${c.found}`).join("; "))
    check("thirteen checks, each with a label and what it found", full.checks.length === 13 && full.checks.every((c) => c.label && c.found))
    const unknownGoogle = scorePage({ ...facts, google: null })
    check("Google not asked yet: skipped, and left out of the score", unknownGoogle.score === 100 && unknownGoogle.checks.find((c) => c.id === "google")?.state === "skip")
    const notIndexed = scorePage({ ...facts, google: "not_indexed" })
    check("Google's not indexed costs its five points", notIndexed.score === 95)

    const bad = `<html><head><title>Hi</title><meta name="robots" content="noindex, follow"><link rel="canonical" href="https://storelib.com/other">
      <script type="application/ld+json">{"@type": "Product",}</script></head>
      <body><h1>One</h1><h1>Two</h1><img src="/x.jpg"><!-- <h1>not counted</h1> --></body></html>`
    const low = scorePage({ ...facts, html: bad, inSitemap: false, robotsAllowed: false, google: "not_indexed" })
    const state = (id: string) => low.checks.find((c) => c.id === id)
    check("noindex in the robots meta fails", state("indexable")?.state === "fail" && /noindex/.test(state("indexable")?.found ?? ""))
    check("a canonical to another address fails and names it", state("canonical")?.state === "fail" && state("canonical")?.found === "Points to https://storelib.com/other")
    check("a two letter title fails with its length", state("title")?.state === "fail" && state("title")?.found.startsWith("2 characters"))
    check("no description fails", state("description")?.found === "No description")
    check("two h1 fail, and a commented one is not counted", state("h1")?.found === "2 h1")
    check("no Open Graph title or image fail", state("ogTitle")?.state === "fail" && state("ogImage")?.state === "fail")
    check("JSON-LD that does not parse fails", state("structuredData")?.found === "1 of 1 blocks do not parse")
    check("an image without alt fails", state("imageAlt")?.found === "1 of 1 without alt")
    check("not in the sitemap and blocked by robots.txt fail", state("sitemap")?.state === "fail" && state("robots")?.state === "fail")
    check("and the score is the 15 points of HTTP 200 alone", low.score === 15)

    const header = scorePage({ ...facts, headers: { "x-robots-tag": "noindex" } })
    check("noindex in X-Robots-Tag fails", header.checks.find((c) => c.id === "indexable")?.found === "X-Robots-Tag: noindex")
    const gone = scorePage({ ...facts, status: 404, html: good })
    check("a 404 fails every page check, whatever its body", gone.checks.find((c) => c.id === "http")?.found === "HTTP 404" && gone.checks.find((c) => c.id === "title")?.state === "fail")
    const moved = scorePage({ ...facts, status: 0, html: "", fetchError: "Redirects to https://storelib.com/maya" })
    check("a redirect is said as one", moved.checks.find((c) => c.id === "http")?.found === "Redirects to https://storelib.com/maya")
    check("noindex is read in its forms, and index is not mistaken for it", noindexIn("noindex") && noindexIn("NOINDEX, nofollow") && noindexIn("googlebot: noindex") && noindexIn("none") && !noindexIn("index, follow") && !noindexIn("max-image-preview:large"))
    check("a trailing slash is the same address", sameAddress("https://Storelib.com/maya/", "https://storelib.com/maya") && !sameAddress("https://storelib.com/maya?x=1", "https://storelib.com/maya"))
    const relative = scorePage({ ...facts, html: good.replace('href="https://storelib.com/maya/notion-planner"', 'href="/maya/notion-planner"') })
    check("a relative canonical is read against the page", relative.checks.find((c) => c.id === "canonical")?.state === "pass")

    const robots = "User-agent: *\nDisallow: /app\nDisallow: /*?preview=\nAllow: /app/help\n\nUser-agent: Googlebot\nDisallow: /private\nAllow: /private/open$\n"
    check("robots.txt: Googlebot's own group wins over *", robotsAllows(robots, "/app/x") && !robotsAllows(robots, "/private/x"))
    check("  the longest rule wins, and $ anchors", robotsAllows(robots, "/private/open") && !robotsAllows(robots, "/private/open/x"))
    check("  * groups for other agents, wildcards understood", !robotsAllows(robots, "/app/x", "bingbot") && robotsAllows(robots, "/app/help", "bingbot") && !robotsAllows(robots, "/p?preview=1", "bingbot"))
    check("  an empty robots.txt allows everything", robotsAllows("", "/anything"))
    check("the live fetch is the public fetch helper, with a time limit, no redirects followed", /from "@\/lib\/api\/public-fetch"/.test(read("lib/admin/seo/live.ts")) && /timeoutMs: 10_000/.test(read("lib/admin/seo/live.ts")) && /maxRedirects: 0/.test(read("lib/admin/seo/live.ts")))
  }

  /* ── Quota and rotation ──────────────────────────────────────────────── */
  console.log("\nGoogle's quota is spent evenly, in rotation, and counted in the database\n")
  {
    const q = quotaFromEnv({})
    check("defaults: 2,000 a day, 600 a minute, 200 kept for Check now, 144 runs", q.perDay === 2000 && q.perMinute === 600 && q.reserve === 200 && q.runsPerDay === 144)
    check("the cron runs every ten minutes, as vercel.json says", CRON_SCHEDULE === "*/10 * * * *" && JSON.parse(read("vercel.json")).crons.some((c: { path: string; schedule: string }) => c.path === "/api/cron/seo-index" && c.schedule === CRON_SCHEDULE))
    const per = inspectionsPerRun(q)
    check("13 per property per run, 1,872 a day: under the 1,800 plus the reserve", per === 13 && per * q.runsPerDay <= q.perDay)
    check("the environment cannot raise the quota past Google's", quotaFromEnv({ GOOGLE_SEARCH_CONSOLE_DAILY_QUOTA: "50000", GOOGLE_SEARCH_CONSOLE_MINUTE_QUOTA: "9999" }).perDay === 2000 && quotaFromEnv({ GOOGLE_SEARCH_CONSOLE_MINUTE_QUOTA: "9999" }).perMinute === 600)
    check("a quota all kept in reserve gives the cron nothing", inspectionsPerRun({ ...q, perDay: 100, reserve: 100 }) === 0)
    const rows: RotationRow[] = [
      { url: "https://storelib.com/c", property: "sc-domain:storelib.com", in_sitemap: true, inspected_at: "2026-10-20T00:00:00Z" },
      { url: "https://storelib.com/a", property: "sc-domain:storelib.com", in_sitemap: true, inspected_at: "2026-10-28T00:00:00Z" },
      { url: "https://storelib.com/b", property: "sc-domain:storelib.com", in_sitemap: true, inspected_at: null },
      { url: "https://storelib.com/z", property: "sc-domain:storelib.com", in_sitemap: true, inspected_at: null },
      { url: "https://storelib.com/gone", property: "sc-domain:storelib.com", in_sitemap: false, inspected_at: null },
      { url: "https://www.own.com/", property: null, in_sitemap: true, inspected_at: null },
      { url: "https://storelib.me/m", property: "sc-domain:storelib.me", in_sitemap: true, inspected_at: "2026-10-01T00:00:00Z" },
    ]
    const order = rotationOrder(rows).map((r) => r.url.replace(/^https:\/\//, ""))
    check("never checked first, then stalest; nothing out of the sitemap or off a property", order.join(" ") === "storelib.com/b storelib.com/z storelib.me/m storelib.com/c storelib.com/a", order.join(" "))
    const taken = takePerProperty(rows, { "sc-domain:storelib.com": 2, "sc-domain:storelib.me": 1 }).map((r) => r.url)
    check("each property's share taken in that order", taken.join(" ") === "https://storelib.com/b https://storelib.com/z https://storelib.me/m")
    const store = code("lib/admin/seo/store.ts")
    check("the database orders the same way", /\.order\("inspected_at", \{ ascending: true, nullsFirst: true \}\)\s*\.order\("url", \{ ascending: true \}\)/.test(store) && /\.eq\("in_sitemap", true\)\s*\.eq\("property", property\)/.test(store))
    const sql = read("supabase/sql/run-now/342_seo_index_status.sql")
    check("the counter takes the day's and the minute's rows FOR UPDATE and never more than both allow", /FOR UPDATE; SELECT used INTO used_m[^;]*FOR UPDATE; n := greatest\(0, least\(p_want, p_per_day - used_d, p_per_minute - used_m\)\)/.test(sql))
    check("  by Pacific day, when Google's quota resets", sql.includes("date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'"))
    const pst = quotaDayStart(new Date("2026-10-29T05:30:00Z"))
    const pdtEarly = quotaDayStart(new Date("2026-10-29T07:10:00Z"))
    check("Pacific midnight is read in its own time zone", pst === "2026-10-28T07:00:00.000Z" && pdtEarly === "2026-10-29T07:00:00.000Z", `${pst} ${pdtEarly}`)
    const run = code("lib/admin/seo/run.ts")
    check("each run takes its share from the counter before asking Google", /takeQuota\(admin, property, rows\.length, quota\.perDay, quota\.perMinute\)/.test(run) && /rows\.slice\(0, tally\.granted\)/.test(run))
    check("Check now takes one inspection from the same counter", /takeQuota\(admin, property, 1, quota\.perDay, quota\.perMinute\)/.test(run))
    check("a 403 or 429 stops the property for the run", /e\.status === 403 \|\| e\.status === 429/.test(run))
  }

  /* ── Guards ──────────────────────────────────────────────────────────── */
  console.log("\nAdmin only, the cron by its secret\n")
  {
    const page = code("app/admin/seo/page.tsx")
    check("the page asks for the admin session on the server before reading", /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin \/>[\s\S]*readSeoConsole/.test(page) && !/^\s*["']use client/.test(page))
    check("the page is never indexed", /robots: \{ index: false, follow: false, nocache: true \}/.test(page))
    const route = code("app/api/admin/seo/check/route.ts")
    const post = route.slice(route.indexOf("export async function POST"))
    check("Check now asks for the admin session first", /^export async function POST\(request: Request\) \{\s*const denied = await requireAdmin\(\)\s*if \(denied\) return denied/.test(post))
    check("  then a rate limit, before any work", post.indexOf("requireAdmin()") < post.indexOf("rateLimit(") && post.indexOf("rateLimit(") < post.indexOf("request.json()") && post.indexOf("rateLimit(") < post.indexOf("checkNow("))
    check("  and only for an address the inventory lists", /if \(!row\) return null/.test(code("lib/admin/seo/run.ts")))
    const cron = code("app/api/cron/seo-index/route.ts")
    check("the cron is opened by CRON_SECRET and recorded like the other jobs", /requireBearerSecret\(request, "CRON_SECRET"\)\s*if \(denied\) return denied/.test(cron) && cron.includes('recordCronRun("/api/cron/seo-index", request, () =>'))
    const client = read("app/admin/seo/seo-admin.tsx")
    check("the client imports nothing that holds a secret", !/from "@\/lib\/admin\/seo\/(google|run|live|inventory|console-data|store)"/.test(client.replace(/import type[^\n]*\n/g, "")) && !/process\.env/.test(client))
    check("the console lists it", read("app/admin/_console/shell.tsx").includes('{ href: "/admin/seo", label: "SEO status" }'))
    const shared = ["lib/seo/indexing.ts", "lib/seo/sitemaps.ts", "app/layout.tsx", "app/admin/_console/console.tsx"]
    check("nothing shared imports it (build memory)", shared.every((f) => !existsSync(f) || !/lib\/admin\/seo/.test(read(f))))
  }

  /* ── No env ──────────────────────────────────────────────────────────── */
  console.log("\nWithout the service account, the console says so and shows the rest\n")
  {
    check("no email or no key is not connected", serviceAccountFromEnv({}) === null && serviceAccountFromEnv({ GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: "a@b.c" }) === null && serviceAccountFromEnv({ GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: "a@b.c", GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY: "not a key" }) === null)

    const saved = { ...process.env }
    const realFetch = globalThis.fetch
    const calls: string[] = []
    const row = {
      url: "https://example.invalid/maya", kind: "product", source: "products-0", property: "sc-domain:example.invalid", in_sitemap: true,
      first_seen_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-29T00:00:00Z", left_sitemap_at: null, google_status: null,
      verdict: null, coverage_state: null, indexing_state: null, robots_txt_state: null, page_fetch_state: null, last_crawl_time: null,
      google_canonical: null, user_canonical: null, inspection_link: null, inspect_error: null, inspected_at: null,
      score: null, checks: null, http_status: null, score_error: null, scored_at: null,
    }
    const writes: { url: string; body: string }[] = []
    try {
      delete process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL
      delete process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY
      /* A property for the test's own host, whose live fetch fails at once (.invalid never resolves), so nothing leaves the machine. */
      process.env.GOOGLE_SEARCH_CONSOLE_PROPERTIES = "sc-domain:storelib.com,sc-domain:example.invalid"
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test"
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test"
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        calls.push(`${init?.method ?? "GET"} ${url}`)
        if (init?.method === "PATCH" || init?.method === "POST") writes.push({ url, body: String(init?.body ?? "") })
        const json = (v: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json", ...extra } })
        if (url.includes("/rest/v1/rpc/seo_index_totals")) return json([{ kind: "product", listed: 3, in_sitemap: 3, answers_200: 2, indexed: 0, not_indexed: 0, not_checked: 3, no_property: 0, scored: 2, average_score: "81.5" }])
        if (url.includes("/rest/v1/rpc/rate_limit") || url.includes("rate_limit_hits")) return json([], { "Content-Range": "*/0" })
        if (url.includes("/rest/v1/seo_index_status") && url.includes("url=eq.")) return json(decodeURIComponent(url).includes(`url=eq.${row.url}`) ? [row] : [])
        if (url.includes("/rest/v1/seo_index_status")) return json([row], { "Content-Range": "0-0/1" })
        return json([], { "Content-Range": "*/0" })
      }) as typeof fetch

      const { readSeoConsole } = await import("@/lib/admin/seo/console-data")
      const data = await readSeoConsole({ kind: "all", status: "all", q: "", page: 1 })
      check("the console reads as not connected", data.google.connected === false && data.google.clientEmail === null)
      check("  and still has the totals and the rows", data.schemaReady && data.totals[0]?.listed === 3 && data.totals[0]?.average_score === 81.5 && data.list.total === 1 && data.list.rows[0]?.url === row.url)
      check("  with no problem reported", data.problems.length === 0, data.problems.join("; "))

      const { checkNow } = await import("@/lib/admin/seo/run")
      const result = await checkNow(row.url)
      check("Check now without the service account says Google was not asked", !!result && result.notes.includes("Google Search Console is not connected, so Google was not asked."))
      check("  never asks Google for a token or an inspection", !calls.some((c) => /googleapis\.com/.test(c)))
      const scoreWrite = writes.find((w) => w.url.includes("seo_index_status") && w.body.includes('"scored_at"'))
      check("  still fetches the live page and saves its score", !!scoreWrite && /"checks":\[/.test(scoreWrite.body))
      check("  and never writes an indexed status", !writes.some((w) => /"google_status":"indexed"/.test(w.body)))
      const before = calls.length
      const outside = await checkNow("https://storelib.com/not-listed")
      check("an address the inventory does not list is not checked", outside === null && !calls.slice(before).some((c) => !c.includes("db.test")))

      const copy = read("app/admin/seo/seo-admin.tsx")
      check("the page says plainly it is not connected, and how to connect", copy.includes("Google Search Console is not connected") && copy.includes("GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL") && copy.includes("GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY") && /add the service account&apos;s email as a user/.test(copy))
      check("  and never promises indexing", copy.includes("Google decides what it indexes") && !/(get|will be|guarantee[ds]?) indexed/i.test(copy))
      check("a custom domain reads as outside Storelib's Search Console", copy.includes("Not in Storelib&apos;s Search Console") || copy.includes("Not in Storelib's Search Console"))
    } finally {
      globalThis.fetch = realFetch
      process.env = saved
    }
  }

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\nThe words on the page\n")
  {
    const files = ["app/admin/seo/seo-admin.tsx", "app/admin/seo/page.tsx", "app/api/admin/seo/check/route.ts", "lib/admin/seo/run.ts", "lib/admin/seo/google.ts", "lib/admin/seo/score.ts"]
    const text = files.map(read).join("\n")
    check("no em dash", !text.includes("—"))
    check("none of the banned words", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
  }

  /* ── SQL ─────────────────────────────────────────────────────────────── */
  console.log("\nPart 342\n")
  {
    const sql = read("supabase/sql/run-now/342_seo_index_status.sql")
    const lines = sql.trimEnd().split("\n")
    check("a comment line, then one whole statement per line", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1).every((l) => l.trim().endsWith(";")))
    check("safe to run again", !/CREATE TABLE (?!IF NOT EXISTS)/.test(sql) && !/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(sql) && !/CREATE FUNCTION/.test(sql))
    for (const t of ["seo_index_status", "seo_inspection_quota", "seo_sync_state"]) {
      check(`${t}: row level security on, no public access, service role only`, sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`) && sql.includes(`REVOKE ALL ON public.${t} FROM anon, authenticated;`) && sql.includes(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO service_role;`) && !new RegExp(`CREATE POLICY[^;]*${t}`).test(sql))
    }
    check("the functions are the service role's alone", /REVOKE ALL ON FUNCTION public\.seo_take_inspection_quota\(text, integer, integer, integer\) FROM PUBLIC, anon, authenticated;/.test(sql) && /REVOKE ALL ON FUNCTION public\.seo_index_totals\(\) FROM PUBLIC, anon, authenticated;/.test(sql))
    for (const col of ["verdict", "coverage_state", "indexing_state", "robots_txt_state", "page_fetch_state", "last_crawl_time", "google_canonical", "user_canonical", "inspected_at", "score", "checks", "in_sitemap", "kind"]) {
      check(`seo_index_status keeps ${col}`, new RegExp(`[(,] ${col} `).test(sql))
    }
    check("the paging indexes are there", sql.includes("seo_index_status_kind_idx") && sql.includes("seo_index_status_inspect_next_idx") && sql.includes("seo_index_status_score_next_idx"))
    check("the migration is the same SQL", read("supabase/migrations/20271101_seo_index_status.sql") === sql)
    const after = read("supabase/sql/run-now/99_check_after.sql")
    check("99_check_after has a p342 column that cannot error before 342 ran", /as p342_seo_index_status;\s*$/.test(after) && after.includes("case when to_regclass('public.seo_index_status') is null"))
    check("the README lists it", read("supabase/sql/run-now/README.md").includes("| `342_seo_index_status.sql` |"))
    const catalog = JSON.parse(read("lib/admin/sql-catalog.generated.json")) as { id: string; file: string }[]
    check("the SQL catalog has it", catalog.some((c) => c.id === "342" && c.file === "342_seo_index_status.sql"))
    check("the bundles have it", read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 342_seo_index_status.sql") && read("supabase/sql/all-in-two/1_of_2_everything.sql").includes("-- part 342_seo_index_status.sql"))
    check("the parts list has it", read("lib/admin/sql-parts.generated.ts").includes('part: "342", file: "342_seo_index_status.sql"'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
