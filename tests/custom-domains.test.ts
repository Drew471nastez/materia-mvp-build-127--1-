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
 * And the help around the records: the provider picker's spellings and
 * links, what a check reads per record, the fixes, the four lines on how a
 * domain behaves, and the plan that includes it.
 * Measured on screen by scripts/check-domains-flow.mjs.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
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
import { brandRecord, HOST_RESERVED_SUFFIXES, isServingCname, SERVING_IPS } from "@/lib/custom-domains/targets"
import { creatorPageHostFrom, creatorPageHostFromRows } from "@/lib/custom-domains/client"
import { REGISTRARS, fixesFor, hostFor, readRecord, recordFqdn, registrarById, type RecordCheck } from "@/lib/custom-domains/dns-help"
import { siteGate, siteLimits } from "@/lib/sites/plan"
import { getLinksShareUrl, getProductShareUrl, getStoreShareUrl, getLinksUrlWithCustomDomain } from "@/lib/url-helpers"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { DomainsPanel, type DomainItem } from "@/components/app/settings/domains-panel"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => stripComments(read(p))

console.log("\nWhat was typed, as a hostname")
check("scheme, path, port, case and a trailing dot come off", cleanHostname("https://WWW.MaraLind.com:443/about?x=1") === "maralind.com" && cleanHostname("maralind.com.") === "maralind.com")
check("www is stored as its apex", cleanHostname("www.maralind.co.uk") === "maralind.co.uk")
check("a unicode name becomes its punycode spelling", cleanHostname("café.fr") === "xn--caf-dma.fr", cleanHostname("café.fr"))
check("nothing typed is nothing", cleanHostname("   ") === "" && cleanHostname(null) === "")

console.log("\nWhat is refused")
check("storelib.com and every name under it", hostnameProblem("storelib.com") === "reserved" && hostnameProblem("andrew.storelib.com") === "reserved" && hostnameProblem("a.b.storelib.com") === "reserved")
check("a lookalike is not storelib.com", hostnameProblem("storelib.com.ro") === null && hostnameProblem("mystorelib.com") === null)
check("the platform's own hosts", hostnameProblem("abc.supabase.co") === "reserved" && ["x.vercel.app", "vercel.com", "cname.vercel-dns.com"].every((h) => hostnameProblem(h, "storelib.com", HOST_RESERVED_SUFFIXES) === "reserved"))
check("and domains.storelib.com, the name creators point at", hostnameProblem("domains.storelib.com") === "reserved")
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
  check("an apex: A on @ and CNAME on www to domains.storelib.com",
    apex.length === 2 && apex[0].type === "A" && apex[0].name === "@" && apex[0].value === "216.150.1.1" && apex[1].type === "CNAME" && apex[1].name === "www" && apex[1].value === "domains.storelib.com")
  const sub = recordsFor("links.maralind.co.uk")
  check("a subdomain: one CNAME to domains.storelib.com, named relative to its apex", sub.length === 1 && sub[0].type === "CNAME" && sub[0].name === "links" && sub[0].value === "domains.storelib.com")
  const vercel = recordsFor("maralind.com", {
    ipv4: "216.198.79.1",
    cname: "d1d4fc829fe7bc7c.vercel-dns-017.com.",
    challenges: [{ type: "TXT", domain: "_vercel.maralind.com", value: "vc-domain-verify=maralind.com,abc" }],
  })
  check("the host's address wins, its CNAME never shows, and a TXT challenge is listed by the name to add",
    vercel[0].value === "216.198.79.1" && vercel[1].value === "domains.storelib.com" && vercel[2]?.type === "TXT" && vercel[2].name === "_vercel" && vercel[2].value.startsWith("vc-domain-verify") && !/vercel/i.test(vercel[2].note ?? ""))
  const saved = [{ type: "A" as const, name: "@", value: "216.150.1.1" }, { type: "CNAME" as const, name: "www", value: "d1d4fc829fe7bc7c.vercel-dns-017.com" }, { type: "CNAME" as const, name: "shop", value: "cname.vercel-dns.com." }, { type: "TXT" as const, name: "_vercel", value: "vc", note: "Vercel asks for it." }].map(brandRecord)
  check("a row saved before shows domains.storelib.com and a note that names no one",
    saved[0].value === "216.150.1.1" && saved[1].value === "domains.storelib.com" && saved[2].value === "domains.storelib.com" && !/vercel/i.test(saved[3].note ?? ""), JSON.stringify(saved))
  check("the store reads every saved row through it", /storedRecords\(row\.dns_records\)\?\.map\(brandRecord\)/.test(code("lib/custom-domains/store.ts")))
  check("stored records are used only when they are well formed", storedRecords(apex) !== null && storedRecords([{ type: "MX", name: "@", value: "x" }]) === null && storedRecords(null) === null)
}

console.log("\nShare links and canonicals name the creator page's domain")
check("the creator page", getStoreShareUrl("mara", "www.maralind.com") === "https://www.maralind.com/" && getStoreShareUrl("mara") === "https://storelib.com/mara")
check("its products, without the handle", getProductShareUrl("mara", "prints", "links.maralind.com") === "https://links.maralind.com/prints" && getProductShareUrl("mara", "prints") === "https://storelib.com/mara/prints")
check("and the OnePage at /links, or storelib.me/<handle> without a domain", getLinksShareUrl("mara", "links.maralind.com") === "https://links.maralind.com/links" && getLinksShareUrl("mara", null) === "https://storelib.me/mara")
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
    /* The creator rides along as an embed on custom_domains.creator_id, which saves a round trip (lib/perf/optimizations.ts). */
    /\.select\("creator_id, status, purpose, is_primary, creator:creators \( user_id \)"\)/.test(proxy) && /\.select\("creator_id, status, creator:creators \( user_id \)"\)/.test(proxy))
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
  /* Changed on purpose: a creator page domain (and a website domain with no
     website published) used to fall through to storelib.com's robots.txt and
     sitemap index. It now answers its own (lib/seo/creator-domain.ts); the
     website's own files are still only for a website domain with a website. */
  check("robots and sitemap come from the website only on a website domain, from the creator page's own on every other",
    /const website = domainPurpose === "website" && !\(await hasLiveAiSite\(username\)\) && \(await hasPublishedWebsite\(username\)\)/.test(proxy)
      && /if \(website\) seoUrl\.pathname = `\/w\/\$\{username\}\$\{pathname\}`\s*else seoUrl\.pathname = `\/u\/\$\{username\}\$\{pathname\}`/.test(proxy))
}

console.log("\nOnly the owner, on the server")
{
  const owner = code("lib/custom-domains/owner.ts")
  /* Changed on purpose (round rel-auth): the session is read through lib/auth/route-user routeUser() (getUser with a ceiling and one retry, 503 when Auth did not answer). */
  check("the session names the user, and the user names the creator", /await routeUser\((?:\{ fresh: (?:false|!opts\.read) \})?\)/.test(owner) && /if \(who\.kind === "unavailable"\) return authUnavailableResponse\(\)/.test(owner) && /\.from\("creators"\)\.select\("id"\)\.eq\("user_id", user\.id\)/.test(owner))
  for (const route of ["app/api/domains/route.ts", "app/api/domains/verify/route.ts", "app/api/domains/check/route.ts"]) {
    const src = code(route)
    check(`${route} starts from the session`, /await domainOwner\((?:"store", \{ read: true \}|\{ read: true \})?\)/.test(src) && /if \(owner instanceof NextResponse\) return owner/.test(src))
  }
  const route = code("app/api/domains/route.ts")
  const store = code("lib/custom-domains/store.ts")
  check("every write is scoped to that creator",
    (route.match(/\.eq\("creator_id", creatorId\)/g) ?? []).length >= 3 && /\.update\(\{ is_primary: true \}\)\.eq\("id", row\.id\)\.eq\("creator_id", creatorId\)/.test(store) && /listCreatorDomains\(admin, creatorId\)[\s\S]*rows\.find\(\(r\) => r\.id === domainId\)/.test(code("app/api/domains/verify/route.ts")))
  check("adding is rate limited per person and per address", /bucket: "domain-add"/.test(route) && /subjects: \[`user:\$\{userId\}`, addressSubject\(request\)\]/.test(route))
  check("checking is rate limited too", /bucket: "domain-verify"/.test(code("app/api/domains/verify/route.ts")))
  check("the name is validated on the server, not only in the form", /const problem = hostnameProblem\(cleanDomain, getMainDomain\(\), HOST_RESERVED_SUFFIXES\)/.test(route))
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
  check("the creator page's canonical", /const pageUrl = pageHost \? `https:\/\/\$\{pageHost\}\/` : `https:\/\/storelib\.com\/\$\{handle\}`/.test(code("app/(marketing)/u/[username]/page.tsx")) && /canonical: pageUrl,/.test(code("app/(marketing)/u/[username]/page.tsx")))
  const product = code("app/(marketing)/p/[slug]/page.tsx")
  check("a product's canonical, structured data and share sheet", /getProductShareUrl\(sellerHandle \|\| "", product\.slug, pageHost\)/.test(product) && /getProductShareUrl\(creatorUsername, product\.slug, pageHost\)/.test(product) && /pageHost=\{pageHost\}/.test(product))
  check("the OnePage's canonical and share sheet", /alternates: \{ canonical: seo\.url \}/.test(code("lib/onepage/seo.ts")) && /* the route hands the domain to lib/onepage/public-shape, which puts it in settings.custom_domain (moved there on purpose: the editor's preview builds the same shape) */ /customDomain: await primaryHostFor\(resolvedCreatorId, "creator_page"\)/.test(code("app/(marketing)/l/[slug]/page.tsx")) && /custom_domain: customDomain/.test(code("lib/onepage/public-shape.ts")) && /getLinksShareUrl\(onepage\.slug, /.test(code("components/onepage/public-onepage.tsx")))
  check("a website's canonical is its own primary domain, never the creator page's", /primaryHostFor\(creatorId, "website"\)/.test(code("lib/website-builder/site-seo-data.ts")))
}

console.log("\nSettings › Domains")
{
  const panel = code("components/app/settings/domains-panel.tsx")
  /*
    "The DNS setup instructions and how custom domain works should not
    appear if I didn't start adding my domain. The Connect to should appear
    after I add my domain." The tab grows with the domain: the field alone,
    then a row per domain with what it connects to and its records, then
    the records folded away once it is connected.
  */
  const addCard = panel.slice(panel.indexOf('data-domains-connect=""'), panel.indexOf("data-domains-reveal"))
  check("the add card is the field, Add and one line: no records, no chooser, no explainer",
    addCard.length > 0 && /id="domains-new"/.test(addCard) && /"Add"/.test(addCard) && !/radiogroup|data-dns|recordsOf|connectsOf|How Custom Domains Work|Help/.test(addCard))
  check("the list, with Help, only exists once there is a domain", /<Reveal open=\{ordered\.length > 0\} animate=\{touched\} data-domains-reveal="list">/.test(panel))
  check("no How Custom Domains Work card, no suggested names", !/How Custom Domains Work|data-domains-how|data-domains-suggested|Suggested domains/.test(panel))
  check("a domain is added to the website, and what it connects to is asked on its row",
    /body: JSON\.stringify\(\{ domain: clean, purpose: "website" \}\)/.test(panel) && /role="radiogroup"[^>]*data-domain-connects=\{d\.domain\}/.test(panel) && /action: "set_purpose", purpose: next/.test(panel))
  const domainsRoute = code("app/api/domains/route.ts")
  check("the route moves a domain between website and creator page, keeping one primary on each side, and only the creator's own",
    /body\.action === "set_purpose" && isDomainPurpose\(body\.purpose\)/.test(domainsRoute) && /\.update\(\{ purpose: to, is_primary: !there\.some\(\(r\) => r\.is_primary === true\) \}\)\s*\.eq\("id", row\.id\)\s*\.eq\("creator_id", creatorId\)/.test(domainsRoute) && /await ensurePrimary\(admin, creatorId, from\)/.test(domainsRoute) && /if \(from === "creator_page" \|\| to === "creator_page"\) await syncOnepageDomain/.test(domainsRoute))
  check("the records show while the DNS is not done, and fold behind DNS records after",
    /const recordsShown = !dnsDone \|\| !!openRecords\[d\.id\]/.test(panel) && /<Reveal open=\{recordsShown\}/.test(panel) && /data-dns-disclosure=""/.test(panel))
  check("status in three words: Connected, Pending, Needs attention", /label: "Connected"/.test(panel) && /label: "Needs attention"/.test(panel) && /label: "Pending"/.test(panel))
  check("Check or Check again, Make primary, and a remove that asks first, in the row",
    /checked \? "Check again" : "Check"/.test(panel) && /action: "make_primary"/.test(panel) && /Remove \{d\.domain\}\?/.test(panel) && /role="alertdialog"/.test(panel) && /data-domain-remove=""/.test(panel) && !/<ResponsiveActionMenu/.test(panel))
  check("sections come and go by a grid row, 200ms, still under reduced motion",
    /const REVEAL_MS = 200/.test(panel) && /gridTemplateRows: visible \? "1fr" : "0fr"/.test(panel) && /transition-\[grid-template-rows,opacity\] duration-200 ease-out motion-reduce:transition-none/.test(panel))
  check("44px controls on a phone: Add, the row's buttons, Copy", /flex h-11 min-w-\[72px\]/.test(panel) && /const ROW_BUTTON =\s*"h-11 sm:h-8/.test(panel) && /inline-flex h-11 w-11 shrink-0[^"]*sm:h-8 sm:w-8/.test(panel))
  check("a long value wraps inside its cell", /"min-w-0 flex-1 font-mono text-\[13px\][^"]*\[overflow-wrap:anywhere\]"/.test(panel))
  check("the owner's free plan: the violet Pro bar and the cards blurred", /bg-gradient-to-r from-\[#7c3aed\] to-\[#6d28d9\]/.test(panel) && /const BLURRED = "blur-\[1\.5px\] opacity-80 pointer-events-none select-none"/.test(panel) && (panel.match(/blurred && BLURRED/g) ?? []).length === 2)
  check("and the Settings page uses it", /<DomainsPanel/.test(code("components/app/settings-form-new.tsx")))
  check("the creator page's Share card reads the creator page's domain, not a field no domain has",
    /creatorPageHostFrom\(data\)/.test(code("components/app/creator-page-share.tsx")) && !/d\.is_active/.test(code("components/app/creator-page-share.tsx")))
  const copy = read("components/app/settings/domains-panel.tsx")
  check("no em dashes and none of the banned words in it", !/\u2014/.test(copy) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(copy.replace(/transition-transform|transform/g, (m) => (m === "transition-transform" ? "" : m))))
}

console.log("\nSettings › Domains, drawn: nothing to set up before a domain is added")
{
  const base = { websiteAddress: "maralind.storelib.com", creatorPageAddress: "storelib.com/maralind", locked: false, planLoading: false, loading: false, onData: () => {} }
  const draw = (domains: DomainItem[]) =>
    renderToStaticMarkup(createElement(DomainsPanel, { ...base, data: { domains, schema: "current", purposes: ["website", "creator_page"] } }))
  const words = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").split(/\s+/).filter(Boolean).length
  const empty = draw([])
  check("empty: the field and Add", /id="domains-new"/.test(empty) && />Add</.test(empty))
  check("empty: no DNS records", !/data-dns-|Type<|>A<|CNAME/.test(empty), empty.match(/data-dns-[a-z-]+/g)?.join() ?? "")
  check("empty: no explainer and no Help", !/How Custom Domains Work|How custom|data-domains-help|>Help</.test(empty))
  check("empty: no connect-to choice", !/radiogroup|Connects to|Creator page/.test(empty))
  check("empty: no list card", !/data-domains-list/.test(empty))
  check("empty: under 25 words", words(empty) < 25, String(words(empty)))

  const pending: DomainItem = { id: "d1", domain: "maralind.com", status: "pending", purpose: "website", is_primary: true, created_at: "2026-09-20T10:00:00Z", records: recordsFor("maralind.com") }
  const added = draw([pending])
  check("added: its row, Pending", /data-domain-row="maralind\.com"/.test(added) && /data-domain-standing="Pending"/.test(added))
  check("added: Connects to, for that domain", /data-domain-connects="maralind\.com"/.test(added) && /role="radiogroup"/.test(added) && /aria-checked="true"[^>]*>Website</.test(added))
  check("added: its records, one per row, each value with Copy", (added.match(/data-dns-record=/g) ?? []).length === 2 && (added.match(/data-dns-copy=""/g) ?? []).length === 4 && /data-dns-table="maralind\.com"/.test(added))
  check("added: Check, and Help closed", /data-domain-check=""/.test(added) && /data-domains-help-toggle=""/.test(added) && /aria-expanded="false"[^>]*data-domains-help-toggle/.test(added) && !/id="domains-help"/.test(added))

  const connected = draw([{ ...pending, status: "active", ssl_status: "active", host: "www.maralind.com" }])
  check("connected: Connected, and what it connects to", /data-domain-standing="Connected"/.test(connected) && /data-domain-connects="maralind\.com"/.test(connected))
  check("connected: the records folded behind DNS records", /data-dns-disclosure=""/.test(connected) && !/data-dns-table/.test(connected) && !/data-domain-check=""/.test(connected))
}

console.log("\nWhere the records go: the provider picker")
{
  const ids = REGISTRARS.map((r) => r.id).join()
  check("GoDaddy, Namecheap, Cloudflare, Squarespace, Porkbun, Hostinger and somewhere else", /* Changed on purpose (round AJ: more providers, each with its mark) */ ids === "godaddy,namecheap,cloudflare,squarespace,porkbun,hostinger,ionos,wix,ovh,route53,namesilo,hetzner,infomaniak,other", ids)
  check("the Name column is @ for the domain itself, and empty where Porkbun wants it empty",
    hostFor(registrarById("godaddy"), { name: "@" }) === "@" && hostFor(registrarById("porkbun"), { name: "@" }) === "" && hostFor(registrarById("porkbun"), { name: "www" }) === "www" && hostFor(registrarById("namecheap"), { name: "_vercel" }) === "_vercel")
  check("each named provider links to its DNS page for the registrable domain",
    registrarById("godaddy").dnsUrl?.("maralind.com") === "https://dcc.godaddy.com/control/dnsmanagement?domainName=maralind.com" && /\/maralind\.com\/advancedns$/.test(registrarById("namecheap").dnsUrl?.("maralind.com") ?? "") && registrarById("other").dnsUrl === null)
  check("an unknown provider reads as somewhere else", registrarById("nope").id === "other" && registrarById(null).id === "other")
  check("a record's full name", recordFqdn("@", "maralind.com") === "maralind.com" && recordFqdn("links", "maralind.co.uk") === "links.maralind.co.uk")
}

console.log("\nWhat a check reads, record by record")
{
  const [a, www] = recordsFor("maralind.com")
  const none = { a: [], cname: [], txt: [] }
  check("A: missing, found, and the older address still counts", readRecord(a, none).state === "missing" && readRecord(a, { ...none, a: ["216.150.1.1"] }, SERVING_IPS).state === "found" && readRecord(a, { ...none, a: ["76.76.21.21"] }, SERVING_IPS).state === "found")
  const old = readRecord(a, { ...none, a: ["216.150.1.1", "34.1.2.3"] }, SERVING_IPS)
  check("A beside an old host is a conflict, naming the old one", old.state === "conflict" && old.seen.join() === "34.1.2.3", JSON.stringify(old))
  check("A: the project's own recommended address counts", readRecord({ type: "A", name: "@", value: "216.198.79.1" }, { ...none, a: ["216.198.79.1"] }, ["216.198.79.1", "216.150.1.1"]).state === "found")
  const accepts = (t: string) => isServingCname(t, "d1d4fc829fe7bc7c.vercel-dns-017.com")
  check("CNAME: domains.storelib.com is found", readRecord(www, { ...none, cname: ["domains.storelib.com."] }).state === "found")
  check("CNAME: a domain set up before, on the host's own name in any spelling, is still found",
    readRecord(www, { ...none, cname: ["d1d4fc829fe7bc7c.vercel-dns-017.com."] }, SERVING_IPS, accepts).state === "found" && readRecord(www, { ...none, cname: ["cname.vercel-dns.com"] }, SERVING_IPS, accepts).state === "found" && readRecord(www, { ...none, cname: ["cname.storelib.com"] }, SERVING_IPS, accepts).state === "found")
  check("the route reads the same way, both for the status and for each record",
    /cnames\.some\(\(r\) => isServingCname\(r, recommended\.cname\)\)/.test(code("app/api/domains/verify/route.ts")) && /readRecord\(r, \{ a, cname, txt \}, acceptedIps, \(t\) => isServingCname\(t, recommendedCname\)\)/.test(code("app/api/domains/verify/route.ts")))
  const parked = readRecord(www, { ...none, cname: ["parkingpage.namecheap.com"] })
  check("CNAME at a parking page is a conflict", parked.state === "conflict" && parked.seen[0] === "parkingpage.namecheap.com")
  check("CNAME flattened to our addresses is found", readRecord(www, { ...none, a: ["216.150.1.1"] }, SERVING_IPS).state === "found")
  check("and the addresses domains.storelib.com answers with are read at check time", /\[CNAME_TARGET, \.\.\.LEGACY_CNAMES\]\.map\(\(h\) => orEmpty\(resolve4\(h\)\)\)/.test(code("app/api/domains/verify/route.ts")))
  const txt = { type: "TXT" as const, name: "_vercel", value: "vc-domain-verify=maralind.com,abc" }
  check("TXT: found when its value is there, other values beside it are fine", readRecord(txt, { ...none, txt: ["vc-domain-verify=other.maralind.com,zzz", "vc-domain-verify=maralind.com,abc"] }).state === "found" && readRecord(txt, { ...none, txt: ["x"] }).state === "missing")
}

console.log("\nThe fixes, after a check that did not pass")
{
  const records = recordsFor("maralind.com")
  const at = (state: RecordCheck["state"], seen: string[] = []) => records.map((r) => ({ type: r.type, name: r.name, state, seen }))
  check("nothing yet says so once, and nothing else", JSON.stringify(fixesFor(records, at("missing"))) === JSON.stringify(["Nothing has shown up yet. New records usually appear within an hour, sometimes up to 48 hours."]))
  check("everything found is nothing to fix", fixesFor(records, at("found")).length === 0 && fixesFor(records, null).length === 0)
  const oldHost: RecordCheck[] = [{ type: "A", name: "@", state: "conflict", seen: ["34.1.2.3"] }, { type: "CNAME", name: "www", state: "missing", seen: [] }]
  const lines = fixesFor(records, oldHost, { warnings: ["maralind.com has 2 A records, including 34.1.2.3. Remove the extra ones.", "maralind.com has IPv6 (AAAA) records (::1). Remove every AAAA record for it."] })
  check("an old A record is named, the missing CNAME asked for, and the route's own A line not said twice",
    lines[0] === "Delete the A record 34.1.2.3 on @. Only 216.150.1.1 should be there." && lines[1] === "No CNAME record on www yet. Add it with the value domains.storelib.com." && lines.filter((l) => /A records/.test(l) && !/AAAA/.test(l)).length === 0 && lines.some((l) => /AAAA/.test(l)), JSON.stringify(lines))
  const proxied = fixesFor(records, [{ type: "A", name: "@", state: "conflict", seen: ["104.21.3.4"] }, { type: "CNAME", name: "www", state: "conflict", seen: ["172.67.1.1"] }])
  check("Cloudflare's proxy is said first, instead of blaming each record", proxied.length === 1 && /Cloudflare's proxy is on/.test(proxied[0]), JSON.stringify(proxied))
  check("the route's blocking issues come before the records", fixesFor(records, at("missing"), { issues: ["A CAA record blocks it."] })[0] === "A CAA record blocks it.")
  check("plain words: no em dashes", [...lines, ...proxied].every((l) => !/\u2014/.test(l)))
}

console.log("\nCheck DNS answers per record, beside what it always answered")
{
  const verify = code("app/api/domains/verify/route.ts")
  check("it reads each record at its own name with the shared reading", /const checks = await checkRecords\(records, apexOf\(domain\), expectedIps, recommended\.cname\)/.test(verify) && /readRecord\(r, \{ a, cname, txt \}, acceptedIps,/.test(verify))
  check("the waiting answer keeps records, found, hints, warnings and issues, and adds checks and fixes",
    /hints,\s*records,\s*found: \{ aRecord: aRecordVerified, cname: cnameVerified, txt: txtVerified \},\s*warnings,\s*issues,\s*checks,\s*fixes,/.test(verify))
  check("the status still moves on the same rule", /const dnsVerified = apex \? aRecordVerified \|\| cnameVerified \|\| txtVerified : cnameVerified \|\| aRecordVerified/.test(verify))
}

console.log("\nThe DNS set up, on both screens")
{
  const setup = code("components/domains/dns-setup.tsx")
  check("a provider picker that rewrites the Name column and links to its DNS page",
    /* Changed on purpose (round AJ: a real list with each provider's mark, not the system's select) */ /<Select value=\{registrar\.id\}/.test(setup) && /<RegistrarMark id=\{r\.id\}/.test(setup) && /REGISTRARS\.map/.test(setup) && /hostFor\(registrar, r\)/.test(setup) && /registrar\.dnsUrl\(apex\)/.test(setup))
  check("Type, Name, Value, TTL and Status", ["Type", "Name", "Value", "TTL", "Status"].every((h) => new RegExp(`role="columnheader">${h}<`).test(setup)))
  check("a copy button per value, 44px until the table has room", /data-dns-copy=""/.test(setup) && /h-11 w-11 shrink-0[^"]*@xl:h-8 @xl:w-8/.test(setup))
  check("three steps: add, wait, check", /Add these records where you bought/.test(setup) && /Wait for them to show/.test(setup) && /n=\{3\}/.test(setup))
  check("fixes only after a check that did not pass", /const showFixes = Boolean\(result && result\.tone !== "ok" && fixes\.length > 0\)/.test(setup))
  check("the provider is remembered on this device, and storage failing is fine", /localStorage\.getItem\(REGISTRAR_KEY\)/.test(setup) && (setup.match(/try \{/g) ?? []).length >= 2)
  check("no violet in it", !/#(8b5cf6|7c3aed|6d28d9|a78bfa|ede9fe|f5f3ff)/i.test(setup))
  const panel = code("components/app/settings/domains-panel.tsx")
  check("Settings draws the records the route sent, each with its check", /const records = d\.records && d\.records\.length > 0 \? d\.records : recordsFor\(d\.domain\)/.test(panel) && /result\?\.checks\?\.find\(\(c\) => c\.type === r\.type && c\.name === r\.name\)/.test(panel))
  check("named for the provider it was bought at, on the same key the builder remembers it by", /hostFor\(registrar, r\)/.test(panel) && /const REGISTRAR_KEY = "storelib:domain-registrar"/.test(panel) && /REGISTRAR_KEY = "storelib:domain-registrar"/.test(code("components/domains/dns-setup.tsx")))
  check("each domain not yet connected has its records on its own row, and what to fix after a check that did not pass", /\{recordsOf\(d, !dnsDone\)\}/.test(panel) && /result\.tone === "bad" && \(result\.message \|\| result\.fixes\.length > 0\)/.test(panel))
  const site = code("components/website-builder/website-settings/domains.tsx")
  check("Website Settings › Domains uses the same set up, in the look Website Settings is in (dark unless the person chose light, round X3)", /<DnsSetup[\s\S]{0,800}tone=\{look\}/.test(site) && /const look = useSettingsLook\(\)/.test(site) && !/function DnsRecord\(/.test(site))
}

console.log("\nThe DNS values a creator sees are Storelib's, never the host's")
{
  /*
   * Every file a creator's browser can load or read: pages and components,
   * the help centre, the developer docs, and the lib files the Domains
   * screens import. None may show vercel-dns, whether as a value, in a link
   * or in words; the older names live in lib/custom-domains/targets.ts,
   * which only the server reads.
   */
  const walk = (dir: string): string[] => {
    if (!existsSync(join(process.cwd(), dir))) return []
    return readdirSync(join(process.cwd(), dir)).flatMap((name) => {
      const rel = `${dir}/${name}`
      if (statSync(join(process.cwd(), rel)).isDirectory()) return rel === "app/api" ? [] : walk(rel)
      return /\.(tsx?|mdx?|json|html)$/.test(name) ? [rel] : []
    })
  }
  const userFacing = [
    ...walk("app"),
    ...walk("components"),
    ...walk("content"),
    ...walk("lib/help"),
    "lib/custom-domains/hostname.ts",
    "lib/custom-domains/dns-help.ts",
    "lib/custom-domains/client.ts",
  ]
  const showing = userFacing.filter((f) => /vercel-dns/i.test(read(f)))
  check("no page, component, help article or doc shows vercel-dns", showing.length === 0, showing.join(", "))
  const domainScreens = ["components/app/settings/domains-panel.tsx", "components/domains/dns-setup.tsx", "components/website-builder/website-settings/domains.tsx", "lib/custom-domains/hostname.ts", "lib/custom-domains/dns-help.ts", "lib/help/articles.ts"]
  check("and the Domains screens and their help say Vercel nowhere in what they draw", domainScreens.every((f) => !/vercel/i.test(code(f).replace(/vercelHostsFor/g, ""))), domainScreens.filter((f) => /vercel/i.test(code(f).replace(/vercelHostsFor/g, ""))).join(", "))
  const clientFiles = userFacing.filter((f) => /\.tsx?$/.test(f) && /^["']use client["']/m.test(read(f)))
  check("no client file imports the older names", clientFiles.length > 20 && clientFiles.every((f) => !/custom-domains\/targets/.test(read(f))))
  const routeMessages = ["app/api/domains/route.ts", "app/api/domains/verify/route.ts", "app/api/domains/check/route.ts", "lib/custom-domains/vercel.ts"]
    .flatMap((f) => code(f).match(/(["'`])(?:(?!\1)[^\\\n]|\\.)*\1/g) ?? [])
    .filter((lit) => /\s/.test(lit) && /vercel/i.test(lit) && !/\[vercel-domains\]/.test(lit))
  check("the domain routes send no message that names the host", routeMessages.length === 0, routeMessages.join(" | "))
  check("domains is never a creator's site address", /EXCLUDED_SUBDOMAINS = \[[^\]]*"domains"/.test(code("proxy.ts")))
}

console.log("\nGet a domain, and how domains work")
{
  const panel = code("components/app/settings/domains-panel.tsx")
  check("Get a domain, with GoDaddy, Namecheap and Hostinger", /Get a domain/.test(panel) && /godaddy\.com\/en\/domains/.test(panel) && /namecheap\.com\/domains/.test(panel) && /hostinger\.com\/domain-name-search/.test(panel))
  check("the owner's marks for them, 20px in #374151", (panel.match(/width="20" height="20"[^>]*fill="#374151"/g) ?? []).length === 3)
  check("and how domains behave, as five short lines under a closed Help", /id="domains-help"/.test(panel) && /Your storelib\.com addresses keep working\./.test(panel) && /OnePage at \/links/.test(panel))
  const how = code("components/domains/how-it-works.tsx")
  const rows = how.match(/^\s*\["[^"]+", /gm) ?? []
  check("four lines, no more", rows.length === 4, String(rows.length))
  check("what each purpose shows, www, and HTTPS", /\["Website", /.test(how) && /\["Creator page", /.test(how) && /\["www", /.test(how) && /\["HTTPS", /.test(how))
  const everywhere = [how, panel, code("components/domains/dns-setup.tsx"), code("components/website-builder/website-settings/domains.tsx")].join("\n")
  check("none of the old promises: Your Store, product pages at /p/", !/Your Store|\/p\/\.\.\./.test(everywhere))
  check("no em dashes in what the Domains screens say", !/\u2014/.test(everywhere))
}

console.log("\nThe plan that includes a domain")
{
  check("Free does not, Pro does (its id is growth), and the old Pro still does", !siteLimits("free").customDomain && siteLimits("growth").customDomain && siteLimits("pro").customDomain)
  check("the refusal names Pro, the only paid plan sold", siteGate("free", "customDomain") === "Connecting your own domain is available on Pro." && siteGate("growth", "customDomain") === null)
  const panel = code("components/app/settings/domains-panel.tsx")
  check("Settings names Pro, not Growth", /Custom domains are available on the Pro plan\./.test(panel) && !/Growth/.test(panel))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
