/**
 * ===========================================================================
 *  CUSTOM DOMAINS: WHAT A DOMAIN SHOWS, AND THE DNS TO GET IT THERE
 * ===========================================================================
 * A creator chooses what their domain shows: the website, the creator page
 * or the OnePage (custom_domains.target). Held here:
 *
 *   • the proxy's decision, run for every target: pages, products, /links,
 *     robots.txt and sitemap.xml, and the fallback while no website is live
 *   • the canonical address and the sitemap a domain gives each page
 *   • what a DNS check found, per record, and the fix it words
 *   • who may change a domain: only its creator, only to the three targets
 *   • the database change, in all three of its shapes
 *   • both Domains screens use the same records, chooser and explanation
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { canonicalOnDomain, domainRoute, domainSitemapUrls, effectiveTarget } from "@/lib/custom-domain/routing"
import {
  DEFAULT_DOMAIN_TARGET,
  creatorPageUrlOnDomain,
  domainOrigin,
  isDomainTarget,
  liveDomainFor,
  onePageUrlOnDomain,
  targetOf,
  websiteUrlOnDomain,
} from "@/lib/custom-domain/targets"
import { dnsPointsHere, hostFor, readChecks, recordsFor, registrarById, troubleFor } from "@/lib/custom-domain/dns"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const route = (pathname: string, target: "website" | "creator_page" | "onepage", hasWebsite = true) =>
  domainRoute({ pathname, username: "Mara", target, hasWebsite })

console.log("\nWhat a domain shows by default")
{
  check("a row from before the column shows the website", targetOf({}) === "website" && targetOf({ target: null }) === "website" && DEFAULT_DOMAIN_TARGET === "website")
  check("an unknown value is not trusted", targetOf({ target: "admin" }) === "website" && !isDomainTarget("admin") && isDomainTarget("onepage"))
  check("a website target with nothing live shows the creator page, as every domain did before", effectiveTarget("website", false) === "creator_page" && effectiveTarget("website", true) === "website")
  check("and the other two are never swapped", effectiveTarget("creator_page", true) === "creator_page" && effectiveTarget("onepage", false) === "onepage")
}

console.log("\nThe website")
{
  check("the front page is the website's", same(route("/", "website"), { kind: "rewrite", path: "/w/mara" }), JSON.stringify(route("/", "website")))
  check("every path is kept, so About is About", same(route("/about", "website"), { kind: "rewrite", path: "/w/mara/about" }))
  check("its products are the website's", same(route("/products/tee", "website"), { kind: "rewrite", path: "/w/mara/products/tee" }))
  check("robots.txt is the website's own", same(route("/robots.txt", "website"), { kind: "rewrite", path: "/w/mara/robots.txt" }))
  check("and so is sitemap.xml", same(route("/sitemap.xml", "website"), { kind: "rewrite", path: "/w/mara/sitemap.xml" }))
  check("/links is the OnePage on every target", same(route("/links", "website"), { kind: "rewrite", path: "/l/mara" }) && same(route("/links/", "creator_page"), { kind: "rewrite", path: "/l/mara" }))
  const unpublished = route("/", "website", false)
  check("with no website live the front page is the creator page, uncached", same(unpublished, { kind: "rewrite", path: "/u/mara", creatorPage: true }), JSON.stringify(unpublished))
  check("and its robots.txt is the creator page's, not storelib.com's", same(route("/robots.txt", "website", false), { kind: "rewrite", path: "/u/mara/robots.txt", search: "?shows=creator_page" }))
}

console.log("\nThe creator page")
{
  check("the front page is the creator page, private to each viewer", same(route("/", "creator_page"), { kind: "rewrite", path: "/u/mara", creatorPage: true }))
  const product = route("/film-presets", "creator_page")
  check("/<slug> is one of their products, asked about first", same(product, { kind: "product", slug: "film-presets", path: "/mara/film-presets", fallback: "/u/mara" }), JSON.stringify(product))
  check("the page's own links answer too: /<username>/<slug>", same(route("/mara/film-presets", "creator_page"), { kind: "product", slug: "film-presets", path: "/mara/film-presets", fallback: "/u/mara" }))
  check("and /p/<slug>, the old spelling", same(route("/p/film-presets", "creator_page"), { kind: "product", slug: "film-presets", path: "/p/film-presets", fallback: "/u/mara" }))
  check("/<username> is the page itself", same(route("/mara", "creator_page"), { kind: "rewrite", path: "/u/mara", creatorPage: true }))
  check("/<username>/links is the OnePage", same(route("/mara/links", "creator_page"), { kind: "rewrite", path: "/l/mara" }))
  check("a deeper path nobody made is the front page", same(route("/a/b/c", "creator_page"), { kind: "rewrite", path: "/u/mara", creatorPage: true }))
  check("a file it does not have is left alone, never read as a product", same(route("/manifest.json", "creator_page"), { kind: "pass" }))
  check("robots.txt and sitemap.xml name what the domain shows", same(route("/sitemap.xml", "creator_page"), { kind: "rewrite", path: "/u/mara/sitemap.xml", search: "?shows=creator_page" }))
  check("it never sends a page to the website", !JSON.stringify(["/", "/about", "/x/y"].map((p) => route(p, "creator_page"))).includes("/w/"))
}

console.log("\nThe OnePage")
{
  check("the front page is the OnePage", same(route("/", "onepage"), { kind: "rewrite", path: "/l/mara" }))
  check("products still open, falling back to the OnePage", same(route("/film-presets", "onepage"), { kind: "product", slug: "film-presets", path: "/mara/film-presets", fallback: "/l/mara" }))
  check("its sitemap is asked for as the OnePage's", same(route("/sitemap.xml", "onepage"), { kind: "rewrite", path: "/u/mara/sitemap.xml", search: "?shows=onepage" }))
}

console.log("\nThe proxy asks, and checks the product is theirs")
{
  const proxy = read("proxy.ts")
  check("it reads the target with the domain, and falls back without the column", /\.select\("creator_id, status, target"\)/.test(proxy) && /\.select\("creator_id, status"\)/.test(proxy))
  check("it decides with the routing module", /domainRoute\(\{ pathname, username, target: domainTarget, hasWebsite \}\)/.test(proxy))
  check("a product path is served only when the product is the domain's creator's",
    /if \(domainDecision\.kind === "product"\)/.test(proxy) && /ownsProduct\(domainCreatorId, domainDecision\.slug\)/.test(proxy) && /owned \? domainDecision\.path : domainDecision\.fallback/.test(proxy))
  check("and ownership is a query on creator_id and slug together", /async function ownsProduct[\s\S]*?\.eq\("creator_id", creatorId\)[\s\S]*?\.eq\("slug"/.test(proxy))
  check("the search the route needs is passed on", /rewriteUrl\.search = domainSearch/.test(proxy))
  check("no second copy of the rules is left in the proxy", !/rewritePath = `\/w\//.test(proxy) && !/seoUrl\.pathname/.test(proxy))
}

console.log("\nThe address each page declares on a domain")
{
  check("a domain is canonical at www", domainOrigin("Mara.com") === "https://www.mara.com" && domainOrigin("www.mara.com") === "https://www.mara.com")
  check("the creator page is the domain's front page", canonicalOnDomain("https://www.mara.com", { kind: "creator_page" }) === "https://www.mara.com/")
  check("a product is /<slug>", canonicalOnDomain("https://www.mara.com/", { kind: "product", slug: "tee" }) === "https://www.mara.com/tee")
  check("the OnePage is the front page when shown, /links otherwise", canonicalOnDomain("https://www.mara.com", { kind: "onepage", front: true }) === "https://www.mara.com/" && canonicalOnDomain("https://www.mara.com", { kind: "onepage", front: false }) === "https://www.mara.com/links")
  const store = read("app/(marketing)/u/[username]/page.tsx")
  check("the creator page's canonical and og:url name the domain when one shows it", /liveOriginOf\(creator\.id, "creator_page"\)/.test(store) && /canonical: pageUrl/.test(store) && /url: pageUrl/.test(store))
  const product = read("app/(marketing)/p/[slug]/page.tsx")
  check("a product's too, in the tag, og:url and structured data", /liveOriginOf\(product\.creator_id, "creator_page"\)/.test(product) && /canonical: pageUrl/.test(product) && /canonicalOnDomain\(canonicalOrigin/.test(product))
  check("the OnePage's when a domain shows it", /liveOriginOf\(effectiveSellerId, "onepage"\)/.test(read("app/(marketing)/l/[slug]/page.tsx")))
  check("the website names a domain only when it is set to show the website", /liveDomainOf\(creatorId, "website"\)/.test(read("lib/website-builder/site-seo-data.ts")))
}

console.log("\nA domain's own sitemap")
{
  const base = { origin: "https://www.mara.com", products: [{ slug: "tee", lastModified: "2026-09-01" }] }
  const page = domainSitemapUrls({ ...base, shows: "creator_page", creatorIndexable: true, onepageLive: true })
  check("the creator page lists itself, the OnePage and its products at the domain", same(page.map((e) => e.url), ["https://www.mara.com/", "https://www.mara.com/links", "https://www.mara.com/tee"]), JSON.stringify(page))
  const held = domainSitemapUrls({ ...base, shows: "creator_page", creatorIndexable: false, onepageLive: false })
  check("a page that has not earned indexing is left out, its products stay", same(held.map((e) => e.url), ["https://www.mara.com/tee"]))
  const one = domainSitemapUrls({ ...base, shows: "onepage", creatorIndexable: true, onepageLive: true })
  check("the OnePage lists its front page, never /links", same(one.map((e) => e.url), ["https://www.mara.com/", "https://www.mara.com/tee"]))
  const seo = read("lib/custom-domain/seo.ts")
  check("the domain comes from the database for that creator, never from the request", /liveOriginOf\(creatorId, shows\)/.test(seo) && !/headers\(/.test(seo))
}

console.log("\nLinks handed out by the dashboard")
{
  const rows = [
    { domain: "mara.com", status: "active", target: "creator_page" },
    { domain: "old.com", status: "pending", target: "website" },
  ]
  check("a live domain showing the creator page is the creator page's address", creatorPageUrlOnDomain(rows) === "https://www.mara.com/")
  check("a pending one is nobody's address yet", liveDomainFor(rows, "website") === null && websiteUrlOnDomain(rows) === null)
  check("the OnePage is /links on a domain that shows something else", onePageUrlOnDomain(rows) === "https://www.mara.com/links")
  check("and the front page on a domain that shows it", onePageUrlOnDomain([{ domain: "m.link", status: "active", target: "onepage" }]) === "https://www.m.link/")
  check("the share card reads the target, not a column that never existed", !/is_active/.test(read("components/app/creator-page-share.tsx")) && /targetOf\(d\) === "creator_page"/.test(read("components/app/creator-page-share.tsx")))
}

console.log("\nDNS, record by record")
{
  const token = "storelib-verify-abc"
  const good = readChecks({ apexA: ["216.150.1.1"], wwwCname: ["cname.vercel-dns.com."], wwwA: [], txt: [token], aaaa: [], caaIssuers: null, token })
  check("all three found", good.a.state === "found" && good.cname.state === "found" && good.txt.state === "found" && troubleFor(good, "mara.com").length === 0)
  const old = readChecks({ apexA: ["216.150.1.1", "1.2.3.4"], wwwCname: [], wwwA: [], txt: [], aaaa: [], caaIssuers: null, token })
  check("an old A record beside ours is a conflict, naming it", old.a.state === "conflict" && same(old.a.seen, ["1.2.3.4"]))
  check("and the fix says to remove exactly that one", troubleFor(old, "mara.com").some((t) => t.includes("Remove the old A record 1.2.3.4")), JSON.stringify(troubleFor(old, "mara.com")))
  const cf = readChecks({ apexA: ["104.21.3.4"], wwwCname: [], wwwA: ["172.67.1.2"], txt: [], aaaa: [], caaIssuers: null, token })
  check("Cloudflare's proxy is recognised and named plainly", cf.cloudflareProxy && troubleFor(cf, "mara.com")[0].includes("grey cloud"))
  const parked = readChecks({ apexA: [], wwwCname: ["parkingpage.namecheap.com"], wwwA: [], txt: [], aaaa: [], caaIssuers: null, token })
  check("a registrar's parking page on www is called that", parked.cname.state === "conflict" && troubleFor(parked, "mara.com").some((t) => t.includes("parking page")))
  const wwwA = readChecks({ apexA: [], wwwCname: [], wwwA: ["76.76.21.21"], txt: [], aaaa: [], caaIssuers: null, token })
  check("www answering with Vercel's address counts as found", wwwA.cname.state === "found")
  const stale = readChecks({ apexA: [], wwwCname: [], wwwA: [], txt: ["storelib-verify-old"], aaaa: ["2606::1"], caaIssuers: ["digicert.com"], token })
  check("a TXT from an earlier attempt, AAAA records and a blocking CAA are each found", stale.txt.state === "conflict" && stale.aaaa.length === 1 && stale.caaBlocks)
  const nothing = readChecks({ apexA: [], wwwCname: [], wwwA: [], txt: [], aaaa: [], caaIssuers: null, token })
  check("nothing at all says to wait, once", troubleFor(nothing, "mara.com").length === 1 && /Nothing has shown up yet/.test(troubleFor(nothing, "mara.com")[0]) && !dnsPointsHere(nothing))
  check("any one record reaching us moves the domain on, as before", dnsPointsHere(readChecks({ apexA: ["216.150.1.1"], wwwCname: [], wwwA: [], txt: [], aaaa: [], caaIssuers: null, token })))
  const all = [good, old, cf, parked, stale, nothing].flatMap((c) => troubleFor(c, "mara.com")).join(" ")
  check("the fixes are plain: no em dash, no banned words", !/[—]|unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all))
  const verify = read("app/api/domains/verify/route.ts")
  check("the Check DNS route answers with the per record reading", /const checks = await lookUp\(domain, token\)/.test(verify) && /checks,\s*\n\s*records: legacyRecords\(checks\)/.test(verify))
}

console.log("\nRegistrars")
{
  const records = recordsFor("tok")
  check("three records, the TXT only with a token", records.length === 3 && recordsFor(null).length === 2)
  check("Porkbun leaves the domain's own name empty", hostFor(registrarById("porkbun"), records[0]) === "" && hostFor(registrarById("godaddy"), records[0]) === "@")
  check("www and _storelib read the same everywhere", hostFor(registrarById("porkbun"), records[1]) === "www" && hostFor(registrarById("namecheap"), records[2]) === "_storelib")
  check("each named registrar links to its DNS page for this domain", ["godaddy", "namecheap", "cloudflare", "squarespace", "hostinger"].every((id) => (registrarById(id).dnsUrl?.("mara.com") ?? "").includes("mara.com")))
  check("an unknown one is the generic advice", registrarById("nope").id === "other" && registrarById("other").dnsUrl === null)
}

console.log("\nOnly the owner changes a domain")
{
  const api = read("app/api/domains/route.ts")
  const patch = api.slice(api.indexOf("export async function PATCH"))
  check("PATCH exists and needs a session", /auth\.getUser\(\)/.test(patch) && /status: 401/.test(patch))
  check("the target is one of the three, or refused", /if \(!isDomainTarget\(body\.target\)\)/.test(patch))
  check("the domain is found by its id and the caller's creator id", /\.eq\("id", body\.domainId\)\s*\n\s*\.eq\("creator_id", creator\.id\)/.test(patch))
  check("and updated the same way, so another account's row cannot be touched", /\.update\(\{ target \}\)\s*\n\s*\.eq\("id", body\.domainId\)\s*\n\s*\.eq\("creator_id", creator\.id\)/.test(patch))
  check("no website id is taken from the caller: the website is always their own live one", !/installId|install_id|siteId|site_id/.test(patch))
  check("a OnePage nobody can see cannot be chosen", /target === "onepage"/.test(patch) && /Publish your OnePage first/.test(patch))
  check("every change clears the cached address", (api.match(/await revalidateCustomDomain\(creator\.id\)/g) ?? []).length >= 3 && /revalidateCustomDomain\(creator\.id\)/.test(read("app/api/domains/verify/route.ts")))
  const post = api.slice(api.indexOf("export async function POST"), api.indexOf("export async function DELETE"))
  check("connecting takes a target too, checked the same way", /isDomainTarget\(body\.target\)/.test(post) && /insert\(\{ \.\.\.row, target \}\)/.test(post))
  check("the cache is cleared at once, not served stale once more", /revalidateTag\(customDomainTag\(creatorId\), \{ expire: 0 \}\)/.test(read("lib/custom-domain/server.ts")))
}

console.log("\nThe database change")
{
  const mig = read("supabase/migrations/20261001_custom_domain_target.sql")
  check("a target column, defaulting to what every domain showed", /ADD COLUMN IF NOT EXISTS target text NOT NULL DEFAULT 'website'/.test(mig))
  check("held to the three by a check constraint", /CHECK \(target IN \('website', 'creator_page', 'onepage'\)\)/.test(mig))
  check("guarded for a database without custom_domains", /to_regclass\('public\.custom_domains'\) IS NULL/.test(mig))
  check("the paste-once file is the same statements", read("supabase/sql/RUN_CUSTOM_DOMAIN_TARGET.sql").includes("ADD CONSTRAINT custom_domains_target_check CHECK (target IN ('website', 'creator_page', 'onepage'))"))
  const part = read("supabase/sql/run-now/23_custom_domain_target.sql").trimEnd().split("\n")
  check("the run-now part: a comment, then one whole statement per line", /^\/\* .* \*\/$/.test(part[0]) && part.slice(1).every((l) => /;$/.test(l)) && part.length === 3)
  check("and safe to run twice", /add column if not exists/.test(part[1]) && /drop constraint if exists/.test(part[1]))
  check("the check after says whether it landed", /as p23_domain_target/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("the README lists it", /`23_custom_domain_target\.sql`/.test(read("supabase/sql/run-now/README.md")))
}

console.log("\nBoth Domains screens, one set of parts")
{
  const panel = read("components/app/settings/domains-panel.tsx")
  const builder = read("components/website-builder/website-settings/domains.tsx")
  check("Settings uses the shared records, chooser and explanation", /<DnsSetup/.test(panel) && /<TargetChoice/.test(panel) && /<HowItWorks/.test(panel))
  check("Website Settings uses the same records and chooser", /<DnsSetup/.test(builder) && /<TargetChoice/.test(builder))
  check("and says so when the domain shows something other than this website", /not this website/.test(builder) && /Show this website/.test(builder))
  const form = read("components/app/settings-form-new.tsx")
  check("the tab is its own file, not a block of the settings form", /<DomainsPanel/.test(form) && !/DNS Setup Instructions/.test(form) && !/How Custom Domains Work/.test(form))
  const how = read("components/domains/how-it-works.tsx")
  const shown = (how + panel).replace(/\/\*[\s\S]*?\*\//g, "")
  check("the old promise of /p/ product pages and 'Your Store' is gone", !/Your Store|Product Pages|\/p\/\.\.\./.test(shown))
  check("no em dash in the copy written for these screens", ![panel, how, read("components/domains/dns-setup.tsx"), read("components/domains/target-choice.tsx")].some((s) => s.replace(/\/\*[\s\S]*?\*\//g, "").includes("—")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
