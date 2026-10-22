/**
 * ANALYTICS ROUND Z6: WHO VISITS, FROM WHERE, AND HOW FAR THEY GET
 *
 * Operating systems from the signature and the browser's platform hint,
 * referrers folded to the company behind them (Google's country sites and
 * app, l.instagram.com, t.co, android-app:// packages), a source named by
 * ?ref= when there are no UTM tags, the five step funnel with Added to cart,
 * visitors by system, orders by country, sales by kind of product and the
 * digital orders' downloads, and the trackers that now send the steps a
 * physical sale takes. With ANALYTICS_PG_HOST (and PGPORT) set, part 253's
 * analytics_audience runs on a real Postgres and is held to the same answer
 * counted from the rows.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { audienceOf, buildReports, kindOf, type StepRow, type ViewRow } from "../lib/analytics/reports"
import { canonicalReferrerHost, categorizeServerSource, isInternalReferrer, referrerBrand, referrerHost, sourceParamOf } from "../lib/analytics/sources"
import { isBotAgent, osFromPlatformHint, osKey, parseUserAgent } from "../lib/analytics/user-agent"
import type { OrderRow } from "../lib/orders/order-view"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail).slice(0, 400)})` : ""}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

console.log("\nOperating systems")
{
  const os = (ua: string) => parseUserAgent(ua).os
  check("an iPhone is iOS, not macOS", os("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1") === "iOS")
  check("Android, from Chrome's reduced signature", os("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36") === "Android")
  check("Windows", os("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36") === "Windows")
  check("macOS", os("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15") === "macOS")
  check("ChromeOS, not Linux", os("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36") === "ChromeOS")
  check("Linux", os("Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0") === "Linux")
  check("HarmonyOS, not Android", os("Mozilla/5.0 (Phone; OpenHarmony 4.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 ArkWeb/4.1.6.1") === "HarmonyOS")
  check("the platform hint names the system when the signature does not", osFromPlatformHint('"Windows"') === "Windows" && osFromPlatformHint('"Chrome OS"') === "ChromeOS" && osFromPlatformHint('"macOS"') === "macOS" && osFromPlatformHint('"Unknown"') === null && osFromPlatformHint(null) === null)
  check("a stored system is listed by its name, a blank Unknown, anything else Other",
    osKey("iOS") === "iOS" && osKey("Mac OS") === "macOS" && osKey("windows") === "Windows" && osKey("Chrome OS") === "ChromeOS" && osKey("") === "unknown" && osKey("Tizen") === "other" && osKey("Other") === "other")
  check("robots that run pages are not visitors", isBotAgent("Mozilla/5.0 (compatible; Google-InspectionTool/1.0)") && isBotAgent("Mozilla/5.0 (X11; Linux x86_64; Storebot-Google/1.0) AppleWebKit/537.36") && isBotAgent("Mozilla/5.0 GoogleOther") && !isBotAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Instagram 300.0"))
}

console.log("\nReferrers")
{
  check("Gmail's Android app is Gmail, and email", referrerHost("android-app://com.google.android.gm/") === "mail.google.com" && categorizeServerSource("com.google.android.gm") === "email")
  check("the Google app is Google search", canonicalReferrerHost("com.google.android.googlequicksearchbox") === "google.com" && categorizeServerSource(referrerHost("android-app://com.google.android.googlequicksearchbox")) === "organic_search")
  check("the Instagram, Facebook and X apps are their networks", categorizeServerSource("com.instagram.android") === "social_instagram" && categorizeServerSource("com.facebook.katana") === "social_facebook" && categorizeServerSource("com.twitter.android") === "social_x")
  const brand = (h: string) => referrerBrand(h)?.key ?? null
  check("one Google: google.com, google.co.uk, www.google.ro", brand("google.com") === "google" && brand("google.co.uk") === "google" && brand("www.google.ro") === "google" && referrerBrand("google.de")?.label === "Google")
  check("Gmail is not Google search", brand("mail.google.com") === "gmail")
  check("Instagram by any of its doors", brand("l.instagram.com") === "instagram" && brand("instagram.com") === "instagram" && brand("com.instagram.android") === "instagram")
  check("Facebook by any of its doors", brand("lm.facebook.com") === "facebook" && brand("l.facebook.com") === "facebook" && brand("m.facebook.com") === "facebook")
  check("Twitter is X: t.co, twitter.com, x.com", brand("t.co") === "x" && brand("twitter.com") === "x" && brand("x.com") === "x" && referrerBrand("t.co")?.label === "X")
  check("GitHub, Apple, Stripe, Bing, DuckDuckGo, TikTok, YouTube, Reddit, LinkedIn, Pinterest, WhatsApp, Telegram, Discord, Snapchat",
    brand("github.com") === "github" && brand("apps.apple.com") === "apple" && brand("stripe.com") === "stripe" && brand("bing.com") === "bing" && brand("duckduckgo.com") === "duckduckgo"
      && brand("vm.tiktok.com") === "tiktok" && brand("youtu.be") === "youtube" && brand("old.reddit.com") === "reddit" && brand("lnkd.in") === "linkedin" && brand("pin.it") === "pinterest"
      && brand("wa.me") === "whatsapp" && brand("t.me") === "telegram" && brand("discord.gg") === "discord" && brand("snapchat.com") === "snapchat")
  check("a site that is no company listed keeps its own host", referrerBrand("myblog.example.com") === null && brand("notgoogle.com") === null && brand("pinterest.com.evil.io") === null)
  check("a buyer back from Stripe's checkout is not a referrer; Stripe's own site is", isInternalReferrer("checkout.stripe.com", "storelib.com") && isInternalReferrer("hooks.stripe.com", "storelib.com") && !isInternalReferrer("stripe.com", "storelib.com") && !isInternalReferrer("dashboard.stripe.com", "storelib.com"))
  const q = (s: string) => sourceParamOf(new URLSearchParams(s))
  check("?ref=, ?source= and ?via= name a source; an id does not", q("ref=producthunt") === "producthunt" && q("source=Newsletter") === "newsletter" && q("via=instagram") === "instagram" && q("ref=12345") === null && q("ref=") === null && q("x=1") === null)
  check("  and ?ref=instagram is Instagram", categorizeServerSource("Direct", q("ref=instagram"), null) === "social_instagram")
}

console.log("\nThe reports")
{
  const DAY = 86_400_000
  const T0 = Date.UTC(2026, 7, 1)
  const at = (d: number, h = 12) => new Date(T0 + d * DAY + h * 3_600_000).toISOString()
  const view = (who: string, d: number, extra: Partial<ViewRow> = {}): ViewRow => ({ visitor_id: who, session_id: `s-${who}`, created_at: at(d), property_type: "creator_page", property_id: null, path: "/ana", ...extra })
  const views: ViewRow[] = [
    view("a", 8, { os: "iOS", referrer_domain: "l.instagram.com", source_category: "social_instagram", page_title: "Ana" }),
    view("a", 8, { os: "iOS", path: "/ana/mug", product_id: "mug", page_title: "Mug" }),
    view("b", 9, { os: "Android", referrer_domain: "www.google.com", source_category: "organic_search" }),
    view("c", 9, { os: "Windows", referrer_domain: "google.co.uk", source_category: "organic_search", product_id: "mug", path: "/ana/mug", page_title: "Mug, white" }),
    view("d", 10, { os: "", referrer_domain: "t.co", source_category: "social_x" }),
    view("e", 10, { os: "Tizen", referrer_domain: "instagram.com", source_category: "social_instagram" }),
    view("old", 2, { os: "iOS" }),
  ]
  const steps: StepRow[] = [
    { event_type: "buy_click", visitor_id: "a", product_id: "mug", created_at: at(8, 13), property_type: "creator_page" },
    { event_type: "buy_click", visitor_id: "c", product_id: "mug", created_at: at(9, 13), property_type: "creator_page" },
    { event_type: "checkout_start", visitor_id: "a", product_id: "mug", created_at: at(8, 14), property_type: "creator_page" },
  ]
  const order = (id: string, d: number, extra: Partial<OrderRow>): OrderRow => ({ id, product_id: "mug", amount_cents: 2500, status: "completed", created_at: at(d, 15), ...extra })
  const orders: OrderRow[] = [
    order("o1", 8, { buyer_country_code: "RO", quantity: 2 }),
    order("o2", 9, { product_id: "ebook", amount_cents: 900, buyer_country_code: "US" }),
    order("o3", 10, { product_id: "ebook", amount_cents: 900, buyer_country_code: "RO", status: "refunded", refund_amount_cents: 900 }),
  ]
  const r = buildReports({
    views, steps, orders,
    window: { start: T0 + 7 * DAY, end: T0 + 14 * DAY },
    timeZone: "UTC",
    mainDomain: "storelib.com",
    productTitles: { mug: "Mug", ebook: "Ebook" },
    productTypes: { mug: "physical", ebook: "digital" },
    downloadsByLine: { o2: 3 },
  })
  const os = Object.fromEntries(r.breakdowns.os.map((x) => [x.key, x.value]))
  check("visitors by system: one each, a blank Unknown, an odd one Other", os.iOS === 1 && os.Android === 1 && os.Windows === 1 && os.unknown === 1 && os.other === 1, r.breakdowns.os)
  check("  with their page views and a share of all", r.breakdowns.os.find((x) => x.key === "iOS")?.extra?.views === 2 && Math.abs(r.breakdowns.os.reduce((n, x) => n + x.share, 0) - 1) < 1e-9)
  const ref = Object.fromEntries(r.breakdowns.referrer.map((x) => [x.key, x]))
  check("referrers by company: Google twice (two country sites), Instagram twice (two doors), X once", ref.google?.value === 2 && ref.google?.label === "Google" && ref.instagram?.value === 2 && ref.x?.value === 1 && ref.x?.label === "X", r.breakdowns.referrer)
  const f = Object.fromEntries(r.funnel.map((s) => [s.key, s]))
  check("the funnel has five steps, Added to cart between the product and the checkout",
    r.funnel.map((s) => s.key).join() === "visitors,product,cart,checkout,orders" && f.visitors.value === 5 && f.product.value === 2 && f.cart.value === 2 && f.checkout.value === 1 && f.orders.value === 3, r.funnel)
  check("  each a share of the one before", f.product.rate === 0.4 && f.cart.rate === 1 && f.checkout.rate === 0.5 && f.orders.rate === null, r.funnel.map((s) => s.rate))
  const page = r.topPages.find((p) => p.label === "/ana/mug")
  check("a page is named by its latest title", page?.title === "Mug, white" && r.topPages.find((p) => p.label === "/ana")?.title === "Ana", r.topPages)
  const oc = Object.fromEntries(r.breakdowns.orderCountry.map((x) => [x.key, x]))
  check("orders by the buyer's country, with their revenue", oc.RO?.value === 2 && oc.US?.value === 1 && oc.RO?.extra?.salesCents === 2500 && oc.US?.label === "United States", r.breakdowns.orderCountry)
  const kinds = Object.fromEntries(r.kinds.map((k) => [k.key, k]))
  check("sales by kind: physical with its units, digital less its refund", kinds.physical?.salesCents === 2500 && kinds.physical?.units === 2 && kinds.digital?.salesCents === 900 && kinds.digital?.orders === 2 && kinds.digital?.refunds === 1, r.kinds)
  check("  and the kinds add up to Revenue", r.kinds.reduce((n, k) => n + k.salesCents, 0) === r.sales.value)
  check("digital: orders, revenue, average, and the share of orders downloaded", r.digital.orders === 2 && r.digital.salesCents === 900 && r.digital.averageCents === 450 && r.digital.downloads?.total === 3 && r.digital.downloads?.orders === 1 && r.digital.top[0]?.downloads === 3, r.digital)
  check("top products say their kind", r.topProducts.find((p) => p.key === "mug")?.kind === "physical" && r.topProducts.find((p) => p.key === "ebook")?.kind === "digital")
  check("a product's type is its kind", kindOf("physical") === "physical" && kindOf("digital") === "digital" && kindOf(null) === "digital" && kindOf("membership") === "membership" && kindOf("course") === "course")

  const a = audienceOf(views.filter((v) => v.visitor_id !== "old"), steps.filter((s) => s.event_type === "buy_click"))
  check("counted from rows: the systems, the cart's visitors and the titles", a.carts === 2 && a.os.find((x) => x[0] === "iOS")?.[1] === 1 && a.os.find((x) => x[0] === "iOS")?.[2] === 2 && a.titles.length === 2)
}

console.log("\nThe trackers")
{
  const cart = read("components/website-builder/site-cart.tsx")
  check("every add to a website's cart is a step towards a sale", /if \(shopId && line\.productId\) void trackFunnelStep\("buy_click", shopId, line\.productId\)/.test(cart))
  const product = read("components/website-builder/sections/renderers/ProductSection.tsx")
  check("Buy now on something that ships says so before it leaves the page", product.indexOf('trackFunnelStep("buy_click", storefront.creatorId, product.id)') < product.indexOf("window.location.href = physicalCheckoutHref("))
  const box = read("components/physical/buy-box.tsx")
  check("the Storelib product page's Add to cart and Buy now too", (box.match(/trackFunnelStep\("buy_click", data\.product\.creatorId, data\.product\.id\)/g) ?? []).length === 2)
  check("the physical checkout and the website's checkout say a checkout started",
    /trackFunnelStep\("checkout_start", quoteCreator, id\)/.test(read("app/checkout/physical/physical-checkout.tsx")) && /trackFunnelStep\("checkout_start", shopId, id\)/.test(read("app/checkout/site/site-checkout.tsx")))
  check("a view carries its page's title, on every kind of page", /pageTitle: \(document\.title/.test(read("components/analytics/track-view.tsx")) && /pageTitle:\(d\.title/.test(read("lib/storelib-theme/compat/track-script.ts")))
  const collect = read("lib/analytics/collect.ts")
  check("the server keeps the title once part 253 is there, and the system from the platform hint", /row\.page_title = pageTitle/.test(collect) && /if \(col === "page_title"\) noTitleUntil/.test(collect) && /osFromPlatformHint\(req\.headers\.get\("sec-ch-ua-platform"\)\)/.test(collect))
}

console.log("\nPart 253")
{
  const part = read("supabase/sql/run-now/253_analytics_audience.sql")
  check("the same text as the migration", part === read("supabase/migrations/20270201_z6_analytics_audience.sql"))
  check("server only, not SECURITY DEFINER", !/SECURITY DEFINER/.test(part.split("\n").find((l) => l.startsWith("CREATE OR REPLACE FUNCTION")) ?? "SECURITY DEFINER") && /REVOKE ALL ON FUNCTION public\.analytics_audience\([^)]*\) FROM PUBLIC, anon, authenticated;/.test(part) && /TO service_role;/.test(part))
  check("every read is the creator's own rows", /WHERE a\.creator_id = p_creator_id /.test(part))
  check("listed in the README and checked after", /`253_analytics_audience\.sql`/.test(read("supabase/sql/run-now/README.md")) && /as p253_analytics_audience[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
}

const PSQL = ["/usr/bin/psql", "/usr/lib/postgresql/16/bin/psql"].find((p) => existsSync(p))
const HOST = process.env.ANALYTICS_PG_HOST
const USER = process.env.ANALYTICS_PG_USER || "storelib"
if (PSQL && HOST) {
  console.log("\nanalytics_audience on Postgres")
  const db = `z6_audience_${process.pid}`
  const run = (database: string, sql: string) => execFileSync(PSQL, ["-h", HOST, "-U", USER, "-d", database, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-tA", "-c", sql], { encoding: "utf8" }).trim()
  try {
    run("postgres", `CREATE DATABASE ${db}`)
    run(db, "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;".replace(/CREATE ROLE (\w+) NOLOGIN;/g, (_m, role: string) => `DO $do$ BEGIN CREATE ROLE ${role} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $do$;`))
    run(db, "CREATE TABLE public.analytics_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid, product_id uuid, event_type text, visitor_id text, session_id text, os text, property_type text, property_id uuid, path text, created_at timestamptz)")
    const sql = read("supabase/sql/run-now/253_analytics_audience.sql")
    execFileSync(PSQL, ["-h", HOST, "-U", USER, "-d", db, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", join(root, "supabase/sql/run-now/253_analytics_audience.sql")], { encoding: "utf8" })
    execFileSync(PSQL, ["-h", HOST, "-U", USER, "-d", db, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", join(root, "supabase/sql/run-now/253_analytics_audience.sql")], { encoding: "utf8" })
    check("part 253 runs, and runs again", sql.length > 0)
    const C = "c1000000-0000-0000-0000-000000000001"
    const OTHER = "c2000000-0000-0000-0000-000000000002"
    const W = "c1000000-5555-0000-0000-000000000001"
    const rows: string[] = []
    const oses = ["iOS", "iOS", "Android", "Windows", "", "macOS", "Linux", "ChromeOS"]
    for (let i = 0; i < 40; i++) {
      const who = `v${i % 13}`
      const os = oses[i % oses.length]
      const type = i % 4 === 0 ? "buy_click" : "view"
      const place = i % 3 === 0 ? `'website', ${i % 6 === 0 ? `'${W}'` : "NULL"}` : "'creator_page', NULL"
      rows.push(`('${C}', '${type}', ${i % 7 === 0 ? "NULL" : `'${who}'`}, 's${i % 5}', '${os}', ${place}, '/p${i % 4}', ${i % 2 ? `'Page ${i}'` : "NULL"}, timestamptz '2026-08-02T00:00:00Z' + interval '${i} hours')`)
    }
    rows.push(`('${OTHER}', 'view', 'stranger', 's', 'iOS', 'creator_page', NULL, '/x', 'X', '2026-08-02T05:00:00Z')`)
    run(db, `INSERT INTO public.analytics_events (creator_id, event_type, visitor_id, session_id, os, property_type, property_id, path, page_title, created_at) VALUES ${rows.join(", ")}`)
    const all = JSON.parse(run(db, `SELECT public.analytics_audience('${C}', NULL, NULL, '${W}', NULL, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z')::text`))
    const site = JSON.parse(run(db, `SELECT public.analytics_audience('${C}', 'website', '${W}', '${W}', NULL, '2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z')::text`))
    const raw = JSON.parse(run(db, `SELECT coalesce(json_agg(e), '[]') FROM (SELECT id::text, event_type, visitor_id, session_id, os, property_type, property_id::text, path, page_title, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at FROM public.analytics_events WHERE creator_id = '${C}') e`)) as Array<ViewRow & StepRow>
    const sortOs = (xs: Array<[string, number, number]>) => xs.map((x) => x.join(":")).sort().join("|")
    const sortTitles = (xs: Array<[string | null, string | null, string | null, string]>) => xs.map((x) => x.join(":")).sort().join("|")
    const mine = (rs: Array<ViewRow & StepRow>) => audienceOf(rs.filter((x) => x.event_type === "view"), rs.filter((x) => x.event_type === "buy_click"))
    const fromRows = mine(raw)
    check("the database's systems are the rows' systems", sortOs(all.os) === sortOs(fromRows.os), { db: all.os, rows: fromRows.os })
    check("  its cart visitors and titles too", all.carts === fromRows.carts && sortTitles(all.titles) === sortTitles(fromRows.titles), { db: [all.carts, all.titles.length], rows: [fromRows.carts, fromRows.titles.length] })
    const siteRows = mine(raw.filter((x) => x.property_type === "website" && (x.property_id === W || x.property_id === null)))
    check("the live website: its own rows and those that never knew their install", sortOs(site.os) === sortOs(siteRows.os) && site.carts === siteRows.carts, { db: site.os, rows: siteRows.os })
    check("another creator's rows are never counted", !JSON.stringify(all).includes("stranger") && !all.titles.some((t: string[]) => t[3] === "X"))
  } catch (error) {
    check("analytics_audience ran on Postgres", false, (error as Error).message.slice(0, 600))
  } finally {
    try { run("postgres", `DROP DATABASE IF EXISTS ${db}`) } catch { /* left behind */ }
  }
} else {
  console.log("\n  skipped  analytics_audience on Postgres: set ANALYTICS_PG_HOST")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
