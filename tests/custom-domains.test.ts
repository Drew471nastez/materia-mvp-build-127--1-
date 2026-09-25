/**
 * ===========================================================================
 *  A CREATOR'S OWN DOMAINS: WEBSITE AND CREATOR PAGE
 * ===========================================================================
 * A creator connects a domain to their website or to their creator page
 * (which carries the OnePage at /links). Held here: how a typed domain is
 * read and which names are refused, how it is served (www for an apex, a
 * subdomain as it is), the records it needs, the share links and canonicals
 * that name it, how proxy.ts routes each purpose, that the session and not
 * the browser says whose a domain is, and that the database change can wait.
 * Measured on screen by scripts/check-domains.mjs.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  apexOf,
  cleanHostname,
  hostnameProblem,
  isApexHost,
  recordsFor,
  servingHost,
  storedRecords,
  vercelHostsFor,
} from "@/lib/custom-domains/hostname"
import { creatorPageHostFrom, creatorPageHostFromRows } from "@/lib/custom-domains/client"
import { getLinksShareUrl, getProductShareUrl, getStoreShareUrl, getLinksUrlWithCustomDomain } from "@/lib/url-helpers"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))

console.log("\nWhat was typed, as a hostname")
check("scheme, path, port, case and a trailing dot come off", cleanHostname("https://WWW.MaraLind.com:443/about?x=1") === "maralind.com" && cleanHostname("maralind.com.") === "maralind.com")
check("www is stored as its apex", cleanHostname("www.maralind.co.uk") === "maralind.co.uk")
check("a unicode name becomes its punycode spelling", cleanHostname("café.fr") === "xn--caf-dma.fr", cleanHostname("café.fr"))
check("nothing typed is nothing", cleanHostname("   ") === "" && cleanHostname(null) === "")

console.log("\nWhat is refused")
check("storelib.com and every name under it", hostnameProblem("storelib.com") === "reserved" && hostnameProblem("andrew.storelib.com") === "reserved" && hostnameProblem("a.b.storelib.com") === "reserved")
check("a lookalike is not storelib.com", hostnameProblem("storelib.com.ro") === null && hostnameProblem("mystorelib.com") === null)
check("the platform's own hosts", ["x.vercel.app", "vercel.com", "cname.vercel-dns.com", "abc.supabase.co"].every((h) => hostnameProblem(h) === "reserved"))
check("names that belong to nobody", ["localhost", "shop.local", "a.test", "example.com", "x.example.org", "printer.internal"].every((h) => hostnameProblem(h) !== null))
check("an address, not a name", hostnameProblem("76.76.21.21") === "ip")
check("a word with no dot, and a suffix on its own", hostnameProblem("maralind") === "invalid" && hostnameProblem("co.uk") === "invalid")
check("broken labels", ["-a.com", "a-.com", "a..com", "a_b.com", "a.c0m"].every((h) => hostnameProblem(h) === "invalid"))
check("more than one level under the apex", hostnameProblem("a.b.maralind.com") === "too_deep" && hostnameProblem("a.b.maralind.co.uk") === "too_deep")
check("and these connect", ["maralind.com", "shop.maralind.com", "maralind.co.uk", "links.maralind.co.uk", "xn--caf-dma.fr"].every((h) => hostnameProblem(h) === null))
check("the main domain is read from the environment's too", hostnameProblem("a.mystore.io", "mystore.io") === "reserved")

console.log("\nHow it is served")
check("an apex is its own registrable name", isApexHost("maralind.com") && isApexHost("maralind.co.uk") && isApexHost("www.maralind.com"))
check("a subdomain is not", !isApexHost("shop.maralind.com") && !isApexHost("links.maralind.co.uk"))
check("the apex of a subdomain", apexOf("links.maralind.co.uk") === "maralind.co.uk" && apexOf("shop.maralind.com") === "maralind.com")
check("an apex is served at www, a subdomain as it is", servingHost("maralind.com") === "www.maralind.com" && servingHost("links.maralind.com") === "links.maralind.com" && servingHost("www.maralind.com") === "www.maralind.com")
check("an apex puts www and a redirecting bare name on Vercel",
  JSON.stringify(vercelHostsFor("maralind.com")) === JSON.stringify([{ name: "www.maralind.com" }, { name: "maralind.com", redirect: "www.maralind.com" }]))
check("a subdomain puts itself, and never a www in front of it", JSON.stringify(vercelHostsFor("links.maralind.com")) === JSON.stringify([{ name: "links.maralind.com" }]))

console.log("\nThe records to add")
{
  const apex = recordsFor("maralind.com")
  check("an apex: A on @ and CNAME on www, Vercel's documented values by default",
    apex.length === 2 && apex[0].type === "A" && apex[0].name === "@" && apex[0].value === "216.150.1.1" && apex[1].type === "CNAME" && apex[1].name === "www" && apex[1].value === "cname.vercel-dns.com")
  const sub = recordsFor("links.maralind.co.uk")
  check("a subdomain: one CNAME, named relative to its apex", sub.length === 1 && sub[0].type === "CNAME" && sub[0].name === "links")
  const vercel = recordsFor("maralind.com", {
    ipv4: "216.198.79.1",
    cname: "d1d4fc829fe7bc7c.vercel-dns-017.com.",
    challenges: [{ type: "TXT", domain: "_vercel.maralind.com", value: "vc-domain-verify=maralind.com,abc" }],
  })
  check("Vercel's recommendation wins, and a TXT challenge is listed by name",
    vercel[0].value === "216.198.79.1" && vercel[1].value === "d1d4fc829fe7bc7c.vercel-dns-017.com" && vercel[2]?.type === "TXT" && vercel[2].name === "_vercel" && vercel[2].value.startsWith("vc-domain-verify"))
  check("stored records are used only when they are well formed", storedRecords(apex) !== null && storedRecords([{ type: "MX", name: "@", value: "x" }]) === null && storedRecords(null) === null)
}

console.log("\nShare links and canonicals name the creator page's domain")
check("the creator page", getStoreShareUrl("mara", "www.maralind.com") === "https://www.maralind.com/" && getStoreShareUrl("mara") === "https://storelib.com/mara")
check("its products, without the handle", getProductShareUrl("mara", "prints", "links.maralind.com") === "https://links.maralind.com/prints" && getProductShareUrl("mara", "prints") === "https://storelib.com/mara/prints")
check("and the OnePage at /links", getLinksShareUrl("mara", "links.maralind.com") === "https://links.maralind.com/links" && getLinksShareUrl("mara", null) === "https://storelib.com/mara/links")
check("a bare apex is given its www, a subdomain never is", getLinksShareUrl("mara", "maralind.com") === "https://www.maralind.com/links" && getLinksUrlWithCustomDomain("mara", "links.maralind.com") === "https://links.maralind.com/links")

console.log("\nWhich host the editors show")
check("the creator page's primary host", creatorPageHostFrom({ primary: { website: "www.a.com", creator_page: "links.a.com" }, schema: "current" }) === "links.a.com")
check("a website domain is not the creator page's", creatorPageHostFrom({ primary: { website: "www.a.com", creator_page: null }, schema: "current" }) === null)
check("before the database knows purposes, the one domain stands in, as it did", creatorPageHostFrom({ primary: { website: "www.a.com", creator_page: null }, schema: "legacy" }) === "www.a.com")
check("from rows: the live primary creator page domain",
  creatorPageHostFromRows([
    { domain: "a.com", status: "active", purpose: "website", is_primary: true },
    { domain: "links.a.com", status: "pending", purpose: "creator_page", is_primary: false },
    { domain: "b.com", status: "active", purpose: "creator_page", is_primary: true },
  ]) === "www.b.com")
check("from rows on an old database: the one there is", creatorPageHostFromRows([{ domain: "a.com", status: "active" }]) === "www.a.com" && creatorPageHostFromRows([]) === null)

console.log("\nproxy.ts serves each purpose")
{
  const proxy = code("proxy.ts")
  check("it reads what a domain is for, and asks again the old way on an old database",
    /\.select\("creator_id, status, purpose, is_primary"\)/.test(proxy) && /\.select\("creator_id, status"\)/.test(proxy))
  check("a domain that is not primary sends every page to the one that is",
    /if \(connected\.redirectTo && !isApiCall && !isReservedPath\(pathname\)\)/.test(proxy) && /NextResponse\.redirect\(to, \{ status: 308 \}\)/.test(proxy) && /\.eq\("is_primary", true\)\s*\.eq\("status", "active"\)/.test(proxy))
  check("only a bare apex is sent to www; a connected subdomain is its own address",
    /!hostWithoutPort\.startsWith\("www\."\) && isApexHost\(hostWithoutPort\)/.test(proxy))
  check("a creator page domain: / is the page, /<product> the product, /links the OnePage",
    /domainPurpose === "creator_page"/.test(proxy) && /parts\.length === 0\s*\?\s*`\/u\/\$\{username\}`/.test(proxy) && /`\/\$\{username\}\/\$\{parts\.join\("\/"\)\}`/.test(proxy) && /rewritePath = `\/l\/\$\{username\}`/.test(proxy))
  check("and a link built with the handle in front is sent to the same address without it",
    /parts\[0\]\.toLowerCase\(\) === username\.toLowerCase\(\)/.test(proxy))
  check("a website domain still shows the website, and a creator page domain never does",
    /const builtSite = !looksLikeFile && domainPurpose === "website" &&/.test(proxy))
  check("robots and sitemap come from the website only on a website domain", /isCustomDomain &&\s*domainPurpose === "website" &&\s*\(pathname === "\/robots\.txt"/.test(proxy))
}

console.log("\nOnly the owner, on the server")
{
  const owner = code("lib/custom-domains/owner.ts")
  check("the session names the user, and the user names the creator", /supabase\.auth\.getUser\(\)/.test(owner) && /\.from\("creators"\)\.select\("id"\)\.eq\("user_id", user\.id\)/.test(owner))
  for (const route of ["app/api/domains/route.ts", "app/api/domains/verify/route.ts", "app/api/domains/check/route.ts"]) {
    const src = code(route)
    check(`${route} starts from the session`, /await domainOwner\(\)/.test(src) && /if \(owner instanceof NextResponse\) return owner/.test(src))
  }
  const route = code("app/api/domains/route.ts")
  const store = code("lib/custom-domains/store.ts")
  check("every write is scoped to that creator",
    (route.match(/\.eq\("creator_id", creatorId\)/g) ?? []).length >= 3 && /\.update\(\{ is_primary: true \}\)\.eq\("id", row\.id\)\.eq\("creator_id", creatorId\)/.test(store) && /listCreatorDomains\(admin, creatorId\)[\s\S]*rows\.find\(\(r\) => r\.id === domainId\)/.test(code("app/api/domains/verify/route.ts")))
  check("adding is rate limited per person and per address", /bucket: "domain-add"/.test(route) && /subjects: \[`user:\$\{userId\}`, addressSubject\(request\)\]/.test(route))
  check("checking is rate limited too", /bucket: "domain-verify"/.test(code("app/api/domains/verify/route.ts")))
  check("the name is validated on the server, not only in the form", /const problem = hostnameProblem\(cleanDomain, getMainDomain\(\)\)/.test(route))
  check("a domain another account holds, or held until recently, is refused",
    /This domain is connected to another Storelib account/.test(route) && /from\("domain_redirects"\)[\s\S]{0,200}\.gt\("keep_until"/.test(route))
  check("the plan is checked on the server", /siteGate\(await creatorSitePlan\(creatorId\), "customDomain"\)/.test(route))
  const vercel = read("lib/custom-domains/vercel.ts")
  check("the Vercel token is read on the server only", /^import "server-only"/m.test(vercel) && /process\.env\.VERCEL_TOKEN/.test(vercel))
  const everywhere = ["components/app/settings/domains-panel.tsx", "components/app/settings-form-new.tsx", "components/website-builder/website-settings/domains.tsx", "lib/custom-domains/hostname.ts", "lib/custom-domains/client.ts", "lib/url-helpers.ts", "proxy.ts"]
  check("and named nowhere a browser bundle reads", everywhere.every((f) => !/VERCEL_TOKEN|NEXT_PUBLIC_VERCEL/.test(code(f))))
  check("a route file exports only its handlers now", !/export async function getVercelDomainConfig/.test(route))
}

console.log("\nThe database change, and before it runs")
{
  const migration = read("supabase/migrations/20261001_custom_domain_purposes.sql")
  check("purpose and primary, with one primary per creator and purpose",
    /ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'website'/.test(migration) && /CREATE UNIQUE INDEX IF NOT EXISTS custom_domains_one_primary ON public\.custom_domains \(creator_id, purpose\) WHERE is_primary/.test(migration))
  check("browser writes are closed; reading your own is not",
    /DROP POLICY IF EXISTS "Creators can add own domains"/.test(migration) && /DROP POLICY IF EXISTS "Creators can update own domains"/.test(migration) && /DROP POLICY IF EXISTS "Creators can delete own domains"/.test(migration) && !/DROP POLICY IF EXISTS "Creators can view own domains"/.test(migration))
  const part = "supabase/sql/run-now/22_custom_domain_purposes.sql"
  check("the run-now part exists and is listed", existsSync(join(process.cwd(), part)) && /22_custom_domain_purposes\.sql/.test(read("supabase/sql/run-now/README.md")))
  check("every line of it is one whole statement", read(part).trim().split("\n").slice(1).every((l) => /;\s*$/.test(l)))
  const store = code("lib/custom-domains/store.ts")
  check("reads ask again without the new columns, and say it is the old schema",
    /if \(!isMissingColumn\(current\.error\)\)/.test(store) && /schema: "legacy"/.test(store) && /LEGACY_COLUMNS/.test(store))
  check("a creator page domain is refused until the columns exist, a website one is not", /schema === "legacy" && purpose === "creator_page"/.test(code("app/api/domains/route.ts")))
  check("the creator page's domain is written to the OnePage's settings", /settings: \{ \.\.\.settings, custom_domain: host \}/.test(store))
}

console.log("\nThe pages name it")
{
  check("the creator page's canonical", /canonical: pageHost \? `https:\/\/\$\{pageHost\}\/` : `https:\/\/storelib\.com\/\$\{username\}`/.test(code("app/(marketing)/u/[username]/page.tsx")))
  const product = code("app/(marketing)/p/[slug]/page.tsx")
  check("a product's canonical, structured data and share sheet", /getProductShareUrl\(sellerHandle \|\| "", product\.slug, pageHost\)/.test(product) && /getProductShareUrl\(creatorUsername, product\.slug, pageHost\)/.test(product) && /pageHost=\{pageHost\}/.test(product))
  check("the OnePage's canonical and share sheet", /alternates: \{ canonical: pageAddress \}/.test(code("app/(marketing)/l/[slug]/page.tsx")) && /custom_domain: await primaryHostFor\(resolvedCreatorId, "creator_page"\)/.test(code("app/(marketing)/l/[slug]/page.tsx")) && /getLinksShareUrl\(onepage\.slug, /.test(code("components/onepage/public-onepage.tsx")))
  check("a website's canonical is its own primary domain, never the creator page's", /primaryHostFor\(creatorId, "website"\)/.test(code("lib/website-builder/site-seo-data.ts")))
}

console.log("\nSettings › Domains")
{
  const panel = code("components/app/settings/domains-panel.tsx")
  check("asks what the domain is for", /role="radiogroup"/.test(panel) && /body: JSON\.stringify\(\{ domain: clean, purpose \}\)/.test(panel))
  check("shows the records, Check again, Make primary and a remove that asks first",
    /<Records records=\{d\.records\} \/>/.test(panel) && /Check again/.test(panel) && /action: "make_primary"/.test(panel) && /Remove \{host\}\?/.test(panel))
  check("the action list is the shared one: a menu on a computer, a sheet on a phone", /<ResponsiveActionMenu/.test(panel))
  check("no violet", !/#(8b5cf6|7c3aed|6d28d9|a78bfa|ede9fe|f5f3ff|8B56FA)/i.test(panel))
  check("and the Settings page uses it", /<DomainsPanel/.test(code("components/app/settings-form-new.tsx")))
  check("the creator page's Share card reads the creator page's domain, not a field no domain has",
    /creatorPageHostFrom\(data\)/.test(code("components/app/creator-page-share.tsx")) && !/d\.is_active/.test(code("components/app/creator-page-share.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
