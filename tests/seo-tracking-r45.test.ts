/**
 * ===========================================================================
 *  ROUND 45: AI REFERRED TRAFFIC, THE SEO CONSOLE'S NEW PANELS, AGENT USABILITY
 * ===========================================================================
 *   AI SOURCES   referrer hosts and utm_source values named, lookalikes not;
 *                a touch carries ai_source, worked out again on the server
 *   SIGN UPS     storelib.com's own scope, sent once for a new account,
 *                only touches that landed on storelib.com, part 346
 *   FUNNEL       views, sign ups, paid and selling by assistant, labelled
 *                "where the source is known"
 *   ROBOTS       the matcher against Google's documented examples
 *                (developers.google.com/search/docs/crawling-indexing/
 *                robots/robots_txt) and RFC 9309's rules
 *   SITEMAPS     a sitemap file read and its invalid entries named
 *   INDEXED      nothing is called indexed without Google's own answer
 *   SEARCH       Search Analytics requests, Bing's answer, and the honest
 *                notes on AI Overviews, AI Mode and Copilot citations
 *   VERIFY       google-site-verification and msvalidate.01 only when set,
 *                rendered by Next's own metadata code
 *   AGENTS       labels, landmarks and headings the journeys need
 *                (scripts/check-agent-journeys.mjs drives them in a browser)
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

import { stripComments } from "./_source"

import { AI_REFERRED_LABEL, aiSourceOf, aiSourceOfHost, aiSourceOfUtm } from "@/lib/attribution/ai-sources"
import { buildAiFunnel, signupAiSource } from "@/lib/attribution/ai-funnel"
import { accountAttributionRow, isNewAccount, platformTouchesFrom } from "@/lib/attribution/account"
import { cleanTouch, encodeTouches, storedTouch, touchFromVisit } from "@/lib/attribution/touch"
import { normalizeRobotsPath, parseRobots, robotsAllowed, robotsVerdict, ruleMatches } from "@/lib/seo/robots-match"
import { invalidEntries, parseSitemapXml } from "@/lib/seo/sitemap-check"
import { siteVerification } from "@/lib/seo/site-verification"
import { NO_COVERAGE_STATE, conflictOf, coverageFromRpc, groupCoverage, isGoogleAnswer } from "@/lib/admin/seo/coverage"
import { robotsAllows } from "@/lib/admin/seo/score"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

async function main() {
  /* ── AI sources ──────────────────────────────────────────────────────── */
  console.log("\nAn AI assistant is named by its referrer or its utm_source, and nothing else\n")
  {
    const hosts: [string, string][] = [
      ["chatgpt.com", "chatgpt"], ["chat.openai.com", "chatgpt"], ["perplexity.ai", "perplexity"], ["www.perplexity.ai", "perplexity"],
      ["copilot.microsoft.com", "copilot"], ["gemini.google.com", "gemini"], ["bard.google.com", "gemini"], ["claude.ai", "claude"],
      ["you.com", "you"], ["phind.com", "phind"], ["poe.com", "poe"], ["meta.ai", "meta_ai"], ["www.meta.ai", "meta_ai"], ["grok.com", "grok"],
      ["x.ai", "grok"], ["deepseek.com", "deepseek"], ["chat.deepseek.com", "deepseek"], ["chat.mistral.ai", "mistral"],
    ]
    for (const [h, key] of hosts) check(`referrer ${h} is ${key}`, aiSourceOfHost(h)?.key === key, aiSourceOfHost(h))
    check("a whole referrer address works too", aiSourceOfHost("https://chatgpt.com/c/abc?x=1")?.key === "chatgpt")
    check("lookalikes and neighbours are not assistants", ["notchatgpt.com", "chatgpt.com.evil.io", "google.com", "mistral.ai", "x.com", "openai.com.example", "microsoft.com", ""].every((h) => aiSourceOfHost(h) === null))
    check("utm_source=chatgpt.com (ChatGPT search) is ChatGPT", aiSourceOfUtm("chatgpt.com")?.key === "chatgpt" && aiSourceOfUtm("ChatGPT.com")?.key === "chatgpt")
    check("utm_source=perplexity and copilot.com", aiSourceOfUtm("perplexity")?.key === "perplexity" && aiSourceOfUtm("copilot.com")?.key === "copilot")
    check("a utm word is matched whole: notperplexity, you, newsletter are nothing", aiSourceOfUtm("notperplexity") === null && aiSourceOfUtm("you") === null && aiSourceOfUtm("newsletter") === null && aiSourceOfUtm("instagram") === null)
    check("a tag wins over the referrer", aiSourceOf({ referrerHost: "perplexity.ai", utmSource: "chatgpt.com" })?.key === "chatgpt")
    check("no referrer and no tag is not an assistant (never guessed)", aiSourceOf({ referrerHost: null, utmSource: null }) === null)
    check("the label says the source must be known", AI_REFERRED_LABEL === "AI-referred (where the source is known)")
    check("no user agent and no fingerprint are read", !/userAgent|navigator|fingerprint|canvas/i.test(code("lib/attribution/ai-sources.ts")))

    const now = Date.UTC(2026, 9, 31, 12)
    const t = touchFromVisit({ href: "https://storelib.com/pricing?utm_source=chatgpt.com", referrer: "", userAgent: "Mozilla/5.0", mainDomain: "storelib.com", now })
    check("a visit from ChatGPT search becomes a touch with ai_source chatgpt", t?.ai_source === "chatgpt", t)
    check("  and its source category is unchanged (referral), so creator reports read as before", t?.source === "referral", t?.source)
    check("  stored on first_touch/last_touch with ai_source", storedTouch(t)?.ai_source === "chatgpt")
    const forged = cleanTouch({ at: now, referrer_host: "google.com", ai_source: "claude" })
    check("an ai_source a page claims is ignored and worked out again", forged?.ai_source === undefined, forged)
    const p = cleanTouch({ at: now, referrer_host: "perplexity.ai", landing_host: "storelib.com", landing_path: "/" })!
    const carried = encodeTouches({ first: p, last: p })
    check("ai_source is not on the wire; it comes back from the referrer", !/ai_source/.test(Buffer.from(carried, "base64url").toString()) && platformTouchesFrom(carried, "storelib.com", now)?.first?.ai_source === "perplexity")
  }

  /* ── Sign ups ────────────────────────────────────────────────────────── */
  console.log("\nA new Storelib account carries where its storelib.com visit came from\n")
  {
    const now = Date.UTC(2026, 9, 31, 12)
    const on = (host: string, ref: string) => cleanTouch({ at: now - 60_000, referrer_host: ref, landing_host: host, landing_path: "/pricing" })!
    const sent = encodeTouches({ first: on("storelib.com", "chatgpt.com"), last: on("storelib.com", "perplexity.ai") })
    const touches = platformTouchesFrom(sent, "storelib.com", now)
    check("touches that landed on storelib.com are kept", touches?.first?.ai_source === "chatgpt" && touches?.last?.ai_source === "perplexity")
    check("a touch that landed on a creator's host is not Storelib's", platformTouchesFrom(encodeTouches({ first: on("maya.storelib.com", "chatgpt.com"), last: on("shop.example.com", "chatgpt.com") }), "storelib.com", now) === null)
    check("anything not made by encodeTouches is nothing", platformTouchesFrom("{\"f\":1}", "storelib.com", now) === null && platformTouchesFrom(42, "storelib.com", now) === null)
    const row = accountAttributionRow({ id: "u1", created_at: "2026-10-31T11:59:00Z" }, touches)
    check("the row: both touches, both assistants, the sign up time", row.first_ai_source === "chatgpt" && row.last_ai_source === "perplexity" && row.first_touch?.referrer_host === "chatgpt.com" && row.signed_up_at === "2026-10-31T11:59:00Z")
    check("a new account with no known source still gets a row, with no source", accountAttributionRow({ id: "u2" }, null).first_touch === null && accountAttributionRow({ id: "u2" }, null).first_ai_source === null)
    check("only a new account (made in the last fifteen minutes) is given a source", isNewAccount("2026-10-31T11:50:00Z", now) && !isNewAccount("2026-10-30T11:50:00Z", now) && !isNewAccount(null, now))
    const route = code("app/api/auth/signup-attribution/route.ts")
    check("the route reads the signed in account, never an id from the body", /supabase\.auth\.getUser\(\)/.test(route) && !/body\.(user|id|userId)/.test(route))
    check("  writes once (ignoreDuplicates on user_id) and always answers 204", /onConflict: "user_id", ignoreDuplicates: true/.test(route) && /status: 204/.test(route))
    check("the arrival note sends it for a new account only", /if \(note\.arrival === "new"\) recordSignupTouches\(\)/.test(code("components/auth/arrival-note.tsx")))
    const browser = code("lib/attribution/browser.ts")
    check("Storelib's scope is kept apart, only on storelib.com, with its own arrival", /PLATFORM_SCOPE = "s:storelib"/.test(browser) && /platformHost\(window\.location\.hostname\)\) return/.test(browser) && /platformArrived/.test(browser))
    check("  stored only with analytics consent, like every touch", /if \(!hasConsent\("analytics"\)\) return(?: touch)?\s*const kept = readStore\(now\)\s*kept\[PLATFORM_SCOPE\]/.test(browser))
    check("the capture is mounted once, in the root layout, and never in /admin or a frame", /<CapturePlatformTouch \/>/.test(read("app/layout.tsx")) && /window\.self !== window\.top/.test(read("components/attribution/capture-platform-touch.tsx")) && /startsWith\("\/admin\/"\)/.test(read("components/attribution/capture-platform-touch.tsx")))
    check("no new third party script", !/<script[^>]*src=/.test(read("components/attribution/capture-platform-touch.tsx")) && !/https?:\/\//.test(code("lib/attribution/signup-browser.ts")))
  }

  /* ── The funnel in the admin ─────────────────────────────────────────── */
  console.log("\nVisits, sign ups and paid, by assistant\n")
  {
    const f = buildAiFunnel({
      views: [
        { visitor_id: "a", referrer_domain: "chatgpt.com", utm_source: null },
        { visitor_id: "a", referrer_domain: null, utm_source: "chatgpt.com" },
        { visitor_id: "b", referrer_domain: "perplexity.ai", utm_source: null },
        { visitor_id: "c", referrer_domain: "google.com", utm_source: null },
        { visitor_id: "d", referrer_domain: null, utm_source: null },
      ],
      signups: [
        { user_id: "u1", first_ai_source: "chatgpt", last_ai_source: null },
        { user_id: "u2", first_ai_source: "perplexity", last_ai_source: "chatgpt" },
        { user_id: "u3", first_ai_source: null, last_ai_source: "perplexity" },
      ],
      signupsAll: 40,
      paidUsers: new Set(["u2"]),
      saleUsers: new Set(["u1", "u3"]),
    })
    const chat = f.rows.find((r) => r.key === "chatgpt")
    const perp = f.rows.find((r) => r.key === "perplexity")
    check("views and visitors per assistant; Google and direct are not in it", chat?.views === 2 && chat?.visitors === 1 && perp?.views === 1 && f.views === 3)
    check("a sign up is credited to its last touch's assistant, else its first's", signupAiSource({ first_ai_source: "perplexity", last_ai_source: "chatgpt" }) === "chatgpt" && chat?.signups === 2 && perp?.signups === 1)
    check("paid plan and a sale counted per assistant", chat?.paidPlan === 1 && chat?.hasSale === 1 && perp?.hasSale === 1 && f.signupsAll === 40)
    const panel = read("app/admin/_console/view-platform.tsx")
    check("the Audience view has the AI assistants group, labelled where the source is known", /title="AI assistants" meta="AI-referred \(where the source is known\)"/.test(panel) && /count as Direct/.test(panel))
    const view = code("lib/admin/views/platform.ts")
    check("  read from the existing views and part 346, never a parallel dashboard", /referrer_domain, utm_source/.test(view) && /from\("account_attribution"\)/.test(view) && /346_account_attribution\.sql/.test(view))
  }

  /* ── robots.txt ──────────────────────────────────────────────────────── */
  console.log("\nrobots.txt, by Google's documented examples\n")
  {
    const m = (rule: string, path: string) => ruleMatches(rule, path)
    const table: [string, string[], string[]][] = [
      ["/", ["/", "/index.html", "/a/b"], []],
      ["/*", ["/", "/index.html"], []],
      ["/$", ["/"], ["/index.html", "/?x"]],
      ["/fish", ["/fish", "/fish.html", "/fish/salmon.html", "/fishheads", "/fishheads/yummy.html", "/fish.php?id=anything"], ["/Fish.asp", "/catfish", "/?id=fish", "/desert/fish"]],
      ["/fish*", ["/fish", "/fish.html", "/fish/salmon.html", "/fishheads", "/fishheads/yummy.html", "/fish.php?id=anything"], ["/Fish.asp", "/catfish", "/?id=fish", "/desert/fish"]],
      ["/fish/", ["/fish/", "/fish/?id=anything", "/fish/salmon.htm"], ["/fish", "/fish.html", "/animals/fish/", "/Fish/Salmon.asp"]],
      ["/*.php", ["/index.php", "/filename.php", "/folder/filename.php", "/folder/filename.php?parameters", "/folder/any.php.file.html", "/filename.php/"], ["/", "/windows.PHP"]],
      ["/*.php$", ["/filename.php", "/folder/filename.php"], ["/filename.php?parameters", "/filename.php/", "/filename.php5", "/windows.PHP"]],
      ["/fish*.php", ["/fish.php", "/fishheads/catfish.php?parameters"], ["/Fish.PHP"]],
    ]
    for (const [rule, yes, no] of table) {
      const badYes = yes.filter((p) => !m(rule, p))
      const badNo = no.filter((p) => m(rule, p))
      check(`${rule} matches what Google lists, and only that`, badYes.length === 0 && badNo.length === 0, { badYes, badNo })
    }
    const pre = (rules: string, path: string) => robotsAllowed(`user-agent: *\n${rules}`, path, "googlebot")
    check("allow: /p, disallow: / -> /page allowed (longer wins)", pre("allow: /p\ndisallow: /", "/page"))
    check("allow: /folder, disallow: /folder -> /folder/page allowed (tie, Allow wins)", pre("allow: /folder\ndisallow: /folder", "/folder/page"))
    check("allow: /page, disallow: /*.htm -> /page.htm disallowed (longer wins)", !pre("allow: /page\ndisallow: /*.htm", "/page.htm"))
    check("allow: /page, disallow: /*.ph -> /page.php5 allowed (tie, Allow wins)", pre("allow: /page\ndisallow: /*.ph", "/page.php5"))
    check("allow: /$, disallow: / -> / allowed, /page.htm disallowed", pre("allow: /$\ndisallow: /", "/") && !pre("allow: /$\ndisallow: /", "/page.htm"))

    const groups = "user-agent: googlebot-news\ndisallow: /news-only\n\nuser-agent: *\ndisallow: /star-only\n\nuser-agent: googlebot\ndisallow: /g-only\n"
    check("Googlebot News follows its own group", !robotsAllowed(groups, "/news-only", "googlebot-news") && robotsAllowed(groups, "/star-only", "googlebot-news"))
    check("Googlebot follows the googlebot group, not *", !robotsAllowed(groups, "/g-only", "googlebot") && robotsAllowed(groups, "/star-only", "googlebot"))
    check("Storebot-Google and Otherbot follow *", !robotsAllowed(groups, "/star-only", "storebot-google") && !robotsAllowed(groups, "/star-only", "otherbot") && robotsAllowed(groups, "/g-only", "otherbot"))
    check("Googlebot News crawling images still follows googlebot-news (tokens most specific first)", !robotsAllowed(groups, "/news-only", ["googlebot-news", "googlebot"]))
    check("a related name is not a match: googlebot does not obey a group for googlebot-news", robotsVerdict(groups, "/news-only", "googlebot").allowed)
    check("two groups for one agent are merged", !robotsAllowed("user-agent: bingbot\ndisallow: /a\n\nuser-agent: bingbot\ndisallow: /b\n", "/b", "bingbot") && !robotsAllowed("user-agent: bingbot\ndisallow: /a\n\nuser-agent: bingbot\ndisallow: /b\n", "/a", "bingbot"))
    check("consecutive user-agent lines share one group", !robotsAllowed("user-agent: a\nuser-agent: OAI-SearchBot\ndisallow: /x\n", "/x", "oai-searchbot"))
    check("the agent is matched case insensitively, its version ignored", !robotsAllowed("User-Agent: Googlebot/2.1\nDisallow: /x\n", "/x", "googlebot"))
    check("an empty Disallow allows everything", robotsAllowed("user-agent: *\ndisallow:\n", "/anything", "googlebot"))
    check("no robots.txt allows everything; /robots.txt itself is always allowed", robotsAllowed("", "/x", "bingbot") && robotsAllowed("user-agent: *\ndisallow: /\n", "/robots.txt", "googlebot"))
    check("comments, sitemap lines and unknown lines do not break a group", !robotsAllowed("user-agent: *  # all\nsitemap: https://x/s.xml\ncrawl-delay: 4\ndisallow: /p # private\n", "/p", "googlebot") && parseRobots("sitemap: https://x/s.xml\n").sitemaps[0] === "https://x/s.xml")
    check("percent escapes and non ASCII are compared in one form", normalizeRobotsPath("/caf%c3%a9") === normalizeRobotsPath("/café") && !robotsAllowed("user-agent: *\ndisallow: /café\n", "/caf%C3%A9", "googlebot"))
    check("a hostile pattern is matched without a regular expression", (() => { const t = Date.now(); ruleMatches(`/${"*a".repeat(200)}$`, `/${"a".repeat(5000)}b`); return Date.now() - t < 500 })())
    check("the score's robots check is this matcher", robotsAllows("user-agent: *\ndisallow: /app\n", "/app/x") === false && /robotsAllowed\(txt, pathWithQuery, agent\)/.test(code("lib/admin/seo/score.ts")))

    const live = "User-Agent: *\nAllow: /\nDisallow: /admin$\nDisallow: /admin?\nDisallow: /admin/\nDisallow: /app/\n\nSitemap: https://storelib.com/sitemap.xml\n"
    check("storelib.com's shape: the important pages allowed for all three crawlers, /app/ and /admin blocked", ["/", "/pricing", "/blog", "/maya/notion-planner", "/maya"].every((p) => ["googlebot", "bingbot", "oai-searchbot"].every((a) => robotsAllowed(live, p, a))) && !robotsAllowed(live, "/admin", "oai-searchbot") && !robotsAllowed(live, "/app/x", "bingbot") && robotsAllowed(live, "/administrators", "googlebot"))
  }

  /* ── Sitemap files ───────────────────────────────────────────────────── */
  console.log("\nA sitemap file, read and checked\n")
  {
    const index = parseSitemapXml(`<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://storelib.com/sitemap/pages.xml</loc></sitemap><sitemap><loc>https://storelib.com/sitemap/products-0-of-1.xml</loc></sitemap></sitemapindex>`)
    check("an index lists its files", index.kind === "index" && index.entries.length === 2)
    const set = parseSitemapXml(`<urlset><url><loc>https://storelib.com/a?x=1&amp;y=2</loc><lastmod>2026-10-31</lastmod></url><url><loc>https://storelib.com/a?x=1&amp;y=2</loc></url><url><loc>https://evil.example/x</loc></url><url><loc>/relative</loc></url><url><loc>https://storelib.com/b</loc><lastmod>yesterday</lastmod></url><url><loc>https://maya.storelib.com/</loc><lastmod>2026-10-31T10:00:00+00:00</lastmod></url><url></url></urlset>`)
    const bad = invalidEntries(set, "storelib.com", true)
    const reasons = bad.map((b) => b.reason)
    check("a urlset with every entry read, &amp; unescaped", set.kind === "urlset" && set.entries.length === 7 && set.entries[0].loc === "https://storelib.com/a?x=1&y=2")
    check("duplicates, other hosts, relative addresses, bad lastmod and a missing loc are named", reasons.includes("Listed twice") && reasons.some((r) => r.startsWith("On evil.example")) && reasons.includes("Not an absolute address") && reasons.some((r) => /lastmod "yesterday"/.test(r)) && reasons.includes("No <loc>") && bad.length === 5, reasons)
    check("a subdomain is allowed only in Storelib's own index", invalidEntries(parseSitemapXml("<urlset><url><loc>https://maya.storelib.com/</loc></url></urlset>"), "storelib.me").length === 1)
    const crawl = code("lib/admin/seo/crawl.ts")
    check("contains() is handed JSON text, never an array (postgrest-js would send {[object Object]})", !/\.contains\("[a-z_]+", \[\{/.test(read("lib/admin/seo/insights.ts")))
    check("the live check is gentle: the public fetch, time limits, two at a time, a deadline, at most 40 files", /from "@\/lib\/api\/public-fetch"/.test(crawl) && /timeoutMs: 12_000/.test(crawl) && /FILE_LANES = 2/.test(crawl) && /MAX_FILES = 40/.test(crawl) && /Date\.now\(\) >= deadline/.test(crawl))
    check("  the cron checks only when the last report is six hours old; the button at most once a minute", /CRAWL_STALE_MS = 6 \* 60 \* 60 \* 1000/.test(crawl) && /crawlCheckIfStale\(admin, options\.budgetMs \/ 10\)/.test(code("lib/admin/seo/run.ts")) && /CRAWL_MIN_GAP_MS/.test(code("app/api/admin/seo/crawl/route.ts")))
    check("  the button's route is admin only and rate limited", /const denied = await requireAdmin\(\)\s*if \(denied\) return denied\s*const limited = await rateLimit/.test(code("app/api/admin/seo/crawl/route.ts")))
    check("  judged for Googlebot, Bingbot and OAI-SearchBot", /"googlebot"/.test(crawl) && /"bingbot"/.test(crawl) && /"oai-searchbot"/.test(crawl))
  }

  /* ── Indexed only when Google said so ────────────────────────────────── */
  console.log("\nNothing is called indexed without an answer from Google\n")
  {
    const rows = [
      { google_status: "indexed", coverage_state: "Submitted and indexed", inspected_at: "2026-10-30T10:00:00Z" },
      { google_status: "indexed", coverage_state: "Submitted and indexed", inspected_at: "2026-10-31T10:00:00Z" },
      { google_status: "not_indexed", coverage_state: "Crawled - currently not indexed", inspected_at: "2026-10-29T10:00:00Z" },
      { google_status: "indexed", coverage_state: "Submitted and indexed", inspected_at: null },
      { google_status: null, coverage_state: null, inspected_at: null },
      { google_status: "unknown", coverage_state: null, inspected_at: "2026-10-31T10:00:00Z" },
      { google_status: "error", coverage_state: null, inspected_at: "2026-10-31T10:00:00Z" },
      { google_status: "no_property", coverage_state: null, inspected_at: null },
      { google_status: "not_indexed", coverage_state: null, inspected_at: "2026-10-28T10:00:00Z" },
    ]
    const groups = groupCoverage(rows)
    const indexed = groups.filter((g) => g.googleStatus === "indexed").reduce((n, g) => n + g.addresses, 0)
    check("only answered rows count as indexed (two, not three)", indexed === 2, groups)
    check("unknown, error, never asked and outside Search Console are in no group", groups.reduce((n, g) => n + g.addresses, 0) === 4)
    check("the newest answer is kept per group", groups.find((g) => g.googleStatus === "indexed")?.newestAnswer === "2026-10-31T10:00:00Z")
    check("an answer with no coverage state says so", groups.some((g) => g.coverageState === NO_COVERAGE_STATE))
    check("isGoogleAnswer needs a verdict and a time", isGoogleAnswer({ google_status: "indexed", inspected_at: "x" }) && !isGoogleAnswer({ google_status: "indexed", inspected_at: null }) && !isGoogleAnswer({ google_status: "unknown", inspected_at: "x" }))
    check("the database's groups are read back the same way, dropping anything else", coverageFromRpc([{ google_status: "indexed", coverage_state: "Submitted and indexed", addresses: 3 }, { google_status: "error", coverage_state: "x", addresses: 9 }, { google_status: null, addresses: 1 }]).length === 1)
    const sql = read("supabase/sql/run-now/346_account_attribution.sql")
    check("seo_coverage_groups counts only indexed and not_indexed rows with a time", /WHERE s\.in_sitemap AND s\.inspected_at IS NOT NULL AND s\.google_status IN \('indexed', 'not_indexed'\)/.test(sql))
    const panels = read("app/admin/seo/seo-panels.tsx")
    check("the coverage panel's green dot is Google's indexed verdict only", /value=\{g\.googleStatus === "indexed" \? "ok" : "failed"\}/.test(panels))
    const admin = read("app/admin/seo/seo-admin.tsx")
    check("the existing rule stands: On Google only for google_status indexed", /case "indexed":\s*return \{ tone: "ok", label: "On Google" \}/.test(admin) && (() => { const fn = admin.slice(admin.indexOf("export function googleWord"), admin.indexOf("const scoreTone")); return (fn.match(/tone: "ok"/g) ?? []).length === 1 && (fn.match(/On Google/g) ?? []).length === 1 })())
    check("the conflicts come from Storelib's own fetch, never called Google's", /fromOwnCheck/.test(panels) && /Sitemap conflicts/.test(panels))
    const c404 = conflictOf({ url: "https://storelib.com/x", http_status: 404, checks: [{ id: "http", state: "fail", found: "HTTP 404" }], scored_at: "t" })
    const cNo = conflictOf({ url: "https://storelib.com/y", http_status: 200, checks: [{ id: "indexable", state: "fail", found: "robots meta: noindex" }], scored_at: "t" })
    const cCan = conflictOf({ url: "https://storelib.com/z", http_status: 200, checks: [{ id: "indexable", state: "pass", found: "Indexable" }, { id: "canonical", state: "fail", found: "Points to https://storelib.com/a" }], scored_at: "t" })
    const cOk = conflictOf({ url: "https://storelib.com/ok", http_status: 200, checks: [{ id: "indexable", state: "pass", found: "" }, { id: "canonical", state: "pass", found: "" }], scored_at: "t" })
    check("a conflict is a non 200, a noindex or a canonical elsewhere, and a clean page is none", c404?.kind === "not_200" && cNo?.kind === "noindex" && cCan?.kind === "canonical" && /Points to/.test(cCan?.found ?? "") && cOk === null)
    check("every figure on the page carries its source", (admin.match(/source: from(Google|OwnCheck|Database)\(/g) ?? []).length === 6)
    check("the service account is shown as set, never its address", /clientEmail: null/.test(code("lib/admin/seo/console-data.ts")) && !/Connected as \$\{google\.clientEmail\}/.test(admin))
  }

  /* ── Search Console and Bing ─────────────────────────────────────────── */
  console.log("\nSearch performance, and what the APIs cannot say about AI\n")
  {
    const { last28Days, parseSearchRows, searchBody, SEARCH_ANALYTICS_URL } = await import("@/lib/admin/seo/search-analytics")
    const r = last28Days(new Date("2026-10-31T12:00:00Z"))
    check("28 days ending yesterday, Pacific", r.startDate === "2026-10-03" && r.endDate === "2026-10-30", r)
    check("the request: web, final data, top 25 by page or query", JSON.stringify(searchBody(r, "page")) === JSON.stringify({ startDate: "2026-10-03", endDate: "2026-10-30", type: "web", dataState: "final", dimensions: ["page"], rowLimit: 25 }) && !("dimensions" in searchBody(r, null)))
    check("the property is escaped into the address", SEARCH_ANALYTICS_URL("sc-domain:storelib.com") === "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Astorelib.com/searchAnalytics/query")
    check("rows read as Google gives them", JSON.stringify(parseSearchRows({ rows: [{ keys: ["storelib"], clicks: 3, impressions: 40, ctr: 0.075, position: 2.5 }] })) === JSON.stringify([{ key: "storelib", clicks: 3, impressions: 40, ctr: 0.075, position: 2.5 }]))
    check("the same read only scope as the inspections (no new scope asked)", !/auth\/webmasters"/.test(read("lib/admin/seo/search-analytics.ts")) && /from "\.\/google"/.test(read("lib/admin/seo/search-analytics.ts")))
    const panels = read("app/admin/seo/seo-panels.tsx")
    check("the page says AI Overviews and AI Mode are inside Web, and the API has no AI type", /AI Overviews and AI Mode are counted inside the Web search type/.test(panels) && /no generative AI type or dimension/.test(panels))
    check("  and links Google's Generative AI performance report as interface only", /gen-ai-performance-reports/.test(panels) && /Search Console interface/.test(panels))
    check("Copilot citations: Bing's AI Performance report linked, no API claimed", /bing\.com\/webmasters\/aiperformance/.test(panels) && /no API for it/.test(panels))

    const { bingDate, sumBingStats, bingFromEnv } = await import("@/lib/admin/seo/bing")
    check("Bing's /Date()/ is read", bingDate("/Date(1316156400000-0700)/") === 1316156400000)
    const now = Date.UTC(2026, 9, 31)
    const sum = sumBingStats({ d: [{ Date: `/Date(${now - 2 * 86_400_000})/`, Clicks: 5, Impressions: 100 }, { Date: `/Date(${now - 40 * 86_400_000})/`, Clicks: 99, Impressions: 999 }] }, "https://storelib.com/", now)
    check("only the last 28 days are added", sum.clicks === 5 && sum.impressions === 100 && sum.days === 1)
    check("no key is not connected; a key uses storelib.com by default", bingFromEnv({}) === null && bingFromEnv({ BING_WEBMASTER_API_KEY: "k" })?.siteUrl === "https://storelib.com/")
    check("the key is never shown: the page gets only whether it is set", !/BING_WEBMASTER_API_KEY/.test(code("lib/admin/seo/console-data.ts").replace(/bingFromEnv\(\)/g, "")) && /connected: !!bingFromEnv\(\)/.test(code("lib/admin/seo/console-data.ts")))
    check("the client imports no server module", !/from "@\/lib\/admin\/seo\/(google|run|live|inventory|console-data|store|crawl|insights|bing|search-analytics)"/.test(read("app/admin/seo/seo-panels.tsx").replace(/import type[^\n]*\n/g, "")))
  }

  /* ── Verification meta ───────────────────────────────────────────────── */
  console.log("\nSite verification tags only when the variable is set\n")
  {
    const require = createRequire(join(process.cwd(), "package.json"))
    const React = require("react")
    const { renderToStaticMarkup } = require("react-dom/server")
    const { resolveVerification } = require("next/dist/lib/metadata/resolvers/resolve-basics")
    const { VerificationMeta } = require("next/dist/lib/metadata/generate/basic")
    const html = (env: Record<string, string | undefined>) => renderToStaticMarkup(React.createElement(React.Fragment, null, VerificationMeta({ verification: resolveVerification(siteVerification(env)) })))
    check("nothing set: no tag", siteVerification({}) === undefined && html({}) === "")
    const both = html({ GOOGLE_SITE_VERIFICATION: "abcDEF123_google-token", BING_SITE_VERIFICATION: "0123456789ABCDEF0123456789ABCDEF" })
    check("Google set: google-site-verification", /<meta name="google-site-verification" content="abcDEF123_google-token"\/>/.test(both), both)
    check("Bing set: msvalidate.01", /<meta name="msvalidate\.01" content="0123456789ABCDEF0123456789ABCDEF"\/>/.test(both), both)
    check("Bing alone: no Google tag", !/google-site-verification/.test(html({ BING_SITE_VERIFICATION: "0123456789ABCDEF" })) && /msvalidate/.test(html({ BING_SITE_VERIFICATION: "0123456789ABCDEF" })))
    check("a value that is not a token is never written", siteVerification({ BING_SITE_VERIFICATION: '"><script>x</script>' }) === undefined && siteVerification({ GOOGLE_SITE_VERIFICATION: "   " }) === undefined)
    check("the root layout's metadata uses it", /verification: siteVerification\(\),/.test(code("app/layout.tsx")))
  }

  /* ── Agent and screen reader usability ───────────────────────────────── */
  console.log("\nThe public journeys, by role and label\n")
  {
    for (const f of ["app/(auth)/signup/page.tsx", "app/(auth)/login/page.tsx"]) {
      const s = read(f)
      check(`${f}: the email field has a label`, /<label htmlFor="email" className="sr-only">/.test(s) && /id="email"/.test(s))
      check(`${f}: the password field has a label`, /<label htmlFor="password" className="sr-only">/.test(s))
      check(`${f}: the error is announced and tied to the fields`, /id="auth-error" role="alert"/.test(s) && (s.match(/aria-describedby=\{error \? "auth-error" : undefined\}/g) ?? []).length === 2)
      check(`${f}: the show password button is named`, /aria-label="Show password"\s*aria-pressed=\{showPassword\}/.test(s))
    }
    check("signup: email and new-password autocomplete", /autoComplete="email"/.test(read("app/(auth)/signup/page.tsx")) && /autoComplete="new-password"/.test(read("app/(auth)/signup/page.tsx")))
    check("login: current-password autocomplete", /autoComplete="current-password"/.test(read("app/(auth)/login/page.tsx")))
    check("the sign in steps have a main landmark", /<main className="min-h-svh bg-white/.test(read("app/(auth)/layout.tsx")))
    check("/pricing has an h1: the plans' heading", /headingLevel=\{1\}/.test(read("app/(marketing)/pricing/pricing-client.tsx")) && /const Heading = headingLevel === 1 \? "h1" : "h2"/.test(read("components/marketing/pricing-section.tsx")))
    check("the marketing footer's headings follow the page's (h2, not h4)", !/<h4/.test(read("components/marketing/footer.tsx")))
    for (const f of ["app/(marketing)/explore/page.tsx", "app/(marketing)/explore/[category]/page.tsx", "app/(marketing)/explore/loading.tsx", "app/(marketing)/explore/[category]/loading.tsx"]) {
      check(`${f}: no second main inside the layout's`, !/<main\b/.test(code(f)))
    }
    check("explore has one h1, the hero's", !/<h1/.test(code("app/(marketing)/explore/page.tsx")) && /<h1 className="sr-only">/.test(read("components/explore/explore-hero.tsx")))
    const usr = read("components/store-builder/unified-section-renderer.tsx")
    check("the product page's What's included is an h2 under the h1, payment and returns h3", !/<h3[^>]*>\s*What&apos;s included/.test(usr) && !/<h4/.test(usr.slice(usr.indexOf("Accepted payment methods") - 400, usr.lastIndexOf("Returns & exchanges") + 40)))
    for (const f of ["components/store-builder/subscribe-bar.tsx", "components/store-builder/product-creator-bar.tsx"]) {
      const s = read(f)
      const inputs = s.split('type="email"').length - 1
      check(`${f}: every email field is named, with autocomplete`, inputs > 0 && (s.match(/aria-label=/g) ?? []).length >= inputs && (s.match(/autoComplete="email"/g) ?? []).length >= inputs)
    }
    check("the journey script uses only role and label locators", (() => { const s = code("scripts/check-agent-journeys.mjs"); return /getByRole/.test(s) && /getByLabel/.test(s) && !/page\.locator\(|\$\$\(|getByTestId|getByPlaceholder/.test(s) })())
    check("no new agent protocol or endpoint was added", !/mcp|\.well-known\/(ai|agent)/i.test(code("scripts/check-agent-journeys.mjs")))
  }

  /* ── SQL ─────────────────────────────────────────────────────────────── */
  console.log("\nPart 346\n")
  {
    const sql = read("supabase/sql/run-now/346_account_attribution.sql")
    const lines = sql.trimEnd().split("\n")
    check("a comment line, then one whole statement per line", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1).every((l) => l.trim().endsWith(";")))
    check("safe to run again", !/CREATE TABLE (?!IF NOT EXISTS)/.test(sql) && !/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(sql) && !/CREATE FUNCTION/.test(sql))
    for (const t of ["account_attribution", "seo_crawl_reports"]) {
      check(`${t}: row level security on, no public access, service role only`, sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`) && sql.includes(`REVOKE ALL ON public.${t} FROM anon, authenticated;`) && sql.includes(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO service_role;`) && !new RegExp(`CREATE POLICY[^;]*${t}`).test(sql))
    }
    check("an account's row goes with the account", /user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/.test(sql))
    check("no email or address column", !/email|ip_address|user_agent/i.test(sql.split("\n").slice(1).join("\n")))
    check("the function is the service role's alone, and waits for 342", /REVOKE ALL ON FUNCTION public\.seo_coverage_groups\(\) FROM PUBLIC, anon, authenticated/.test(sql) && /to_regclass\('public\.seo_index_status'\) IS NULL/.test(sql))
    check("the migration is the same SQL", read("supabase/migrations/20271103_account_attribution.sql") === sql)
    check("99_check_after has p346", /as p346_account_attribution[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("the README lists it", read("supabase/sql/run-now/README.md").includes("| `346_account_attribution.sql` |"))
    check("the parts list has it", read("lib/admin/sql-parts.generated.ts").includes('part: "346", file: "346_account_attribution.sql"'))
    check("without part 346 the code carries on: the route, the admin view and the console", /does not exist\|could not find\|42P01\|PGRST205/.test(read("app/api/auth/signup-attribution/route.ts")) && /missingTable\(list\.error\)/.test(read("lib/admin/views/platform.ts")) && /missingTable: true/.test(read("lib/admin/seo/crawl.ts")) && /basis: "sample"/.test(read("lib/admin/seo/insights.ts")))
  }

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\nThe words\n")
  {
    const files = ["app/admin/seo/seo-panels.tsx", "app/admin/seo/seo-admin.tsx", "app/admin/_console/view-platform.tsx", "lib/admin/seo/crawl.ts", "lib/attribution/ai-sources.ts", "components/attribution/capture-platform-touch.tsx"]
    const text = files.map(read).join("\n")
    check("no em dash", !text.includes("—"))
    check("none of the banned words", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text))
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
