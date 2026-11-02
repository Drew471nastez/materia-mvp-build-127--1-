/**
 * ===========================================================================
 *  A COMMUNITY ON ITS OWN DOMAIN (round 31)
 * ===========================================================================
 * "Make sure users can add their own domain to the community. They can set
 * up a custom domain and it connects well. Update the settings so a domain
 * can be assigned to the community, also in Settings › Domains, and make it
 * visible in the community admin inside /app."
 *
 * Held here: what a request on a community's domain becomes
 * (lib/custom-domains/community.ts, case by case), which domain may serve
 * which community, the canonical the pages name, how proxy.ts and
 * app/api/domains use them (the session names the creator, the creator must
 * own the community, one domain per community, served only once verified),
 * the database change and its run-now part, and the two screens: Settings ›
 * Domains with Community as an answer, and the community's own Domain panel.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { COMMUNITY_SECTIONS, communityDomainStep, communityIdOf, communityServable, communityDomainTag, communityRobots, communitySitemap } from "@/lib/custom-domains/community"
import { isDomainPurpose, DOMAIN_PURPOSES } from "@/lib/custom-domains/hostname"
import { canonicalUrl, communityMetadata, type SeoFacts } from "@/components/community/public/seo"
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
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const read = (p: string) => untt(raw(p), p)
const code = (p: string) => stripComments(read(p))

const MAIN = "storelib.com"
const HOST = "club.maralind.com"
const step = (pathname: string, search = "") => communityDomainStep({ slug: "clay-studio", pathname, search, host: HOST, mainDomain: MAIN })
const rewrite = (pathname: string, search = "") => {
  const s = step(pathname, search)
  return s.kind === "rewrite" ? s.path : `(${s.kind})`
}
const redirect = (pathname: string, search = "") => {
  const s = step(pathname, search)
  return s.kind === "redirect" ? `${s.status} ${s.location}` : `(${s.kind})`
}

console.log("\nThe community, at the domain's root")
check("/ is the community", rewrite("/") === "/community/clay-studio" && rewrite("") === "/community/clay-studio")
check("its pages: about, join, members, learn, events, a post, a space", [
  ["/about", "/community/clay-studio/about"],
  ["/join", "/community/clay-studio/join"],
  ["/members", "/community/clay-studio/members"],
  ["/members/7f0c", "/community/clay-studio/members/7f0c"],
  ["/learn", "/community/clay-studio/learn"],
  ["/learn/p1", "/community/clay-studio/learn/p1"],
  ["/events", "/community/clay-studio/events"],
  ["/post/123", "/community/clay-studio/post/123"],
  ["/space/wins", "/community/clay-studio/space/wins"],
  ["/leaderboard", "/community/clay-studio/leaderboard"],
].every(([from, to]) => rewrite(from) === to), ["/about", "/members/7f0c", "/post/123"].map((p) => rewrite(p)).join(" "))
check("a section typed in capitals is still that section", rewrite("/About") === "/community/clay-studio/about")
check("every section the community's routes have is listed", ["about", "join", "post", "members", "space", "learn", "events", "leaderboard", "saved", "notifications", "membership"].every((s) => COMMUNITY_SECTIONS.includes(s)))
check("the words people type for a section: calendar, classroom, posts", redirect("/calendar") === "308 /events" && redirect("/classroom/p1") === "308 /learn/p1" && redirect("/posts") === "308 /" && redirect("/calendar", "?m=5") === "308 /events?m=5")

console.log("\nThe pages' own links come back to the domain")
check("/community/<slug>/... answers 308 without the prefix, query kept", redirect("/community/clay-studio/members", "?q=ana") === "308 /members?q=ana" && redirect("/community/clay-studio") === "308 /" && redirect("/community/Clay-Studio/about") === "308 /about")
check("an encoded slug is read as the slug", redirect("/community/clay%2Dstudio/learn") === "308 /learn")

console.log("\nNothing else of Storelib's is served at a creator's domain")
check("another community goes to storelib.com", redirect("/community/other-club/about") === "307 https://storelib.com/community/other-club/about")
check("the list of communities goes to storelib.com", redirect("/community") === "307 https://storelib.com/community")
check("sign in, sign up, auth and /app go to storelib.com, where the session lives",
  redirect("/login", "?next=%2Fcommunity%2Fclay-studio") === "307 https://storelib.com/login?next=%2Fcommunity%2Fclay-studio" &&
  redirect("/signup") === "307 https://storelib.com/signup" &&
  redirect("/auth/callback", "?code=x") === "307 https://storelib.com/auth/callback?code=x" &&
  redirect("/app/community/clay-studio") === "307 https://storelib.com/app/community/clay-studio" &&
  redirect("/logout") === "307 https://storelib.com/logout")
check("checkout, a creator page, a product and the marketing site too", ["/checkout", "/maralind", "/p/mug", "/pricing", "/u/maralind", "/l/maralind", "/library"].every((p) => redirect(p).startsWith("307 https://storelib.com/")))
check("307 keeps a POST a POST", step("/login").kind === "redirect" && (step("/login") as { status: number }).status === 307)

console.log("\nWhat passes untouched")
check("the pages' own API calls, Next's files and .well-known", ["/api/communities/x/join", "/api", "/_next/data/x.json", "/.well-known/apple-developer-merchantid-domain-association"].every((p) => step(p).kind === "pass"))
check("a file at the root: favicon, the push worker", step("/favicon.ico").kind === "pass" && step("/storelib-push-sw.js").kind === "pass")
{
  const robots = step("/robots.txt")
  const sitemap = step("/sitemap.xml")
  check("its own robots.txt, naming its own sitemap, never storelib.com's", robots.kind === "text" && robots.body === communityRobots(HOST) && /Sitemap: https:\/\/club\.maralind\.com\/sitemap\.xml/.test(robots.body) && !/storelib\.com/.test(robots.body))
  check("its own sitemap: the community's one canonical address (About names it as canonical, so is not listed)", sitemap.kind === "text" && /<loc>https:\/\/club\.maralind\.com\/<\/loc>/.test(sitemap.body) && !/<loc>https:\/\/club\.maralind\.com\/about<\/loc>/.test(sitemap.body) && sitemap.body === communitySitemap(HOST))
}

console.log("\nWhich community a domain serves, and only while it may")
check("a community row names its community", communityIdOf({ purpose: "community", target_type: "community", target_id: "c1" }) === "c1")
check("any other row names none", communityIdOf({ purpose: "website", target_type: null, target_id: null }) === null && communityIdOf({ purpose: "community", target_type: "site", target_id: "c1" }) === null && communityIdOf({ purpose: "community", target_type: "community", target_id: "" }) === null && communityIdOf(null) === null)
check("served while the community is the domain owner's", communityServable({ creator_id: "cr1" }, { creator_id: "cr1", deleted_at: null, slug: "clay-studio" }))
check("not once it changed hands, was deleted, or has no owner", !communityServable({ creator_id: "cr1" }, { creator_id: "cr2", deleted_at: null, slug: "x" }) && !communityServable({ creator_id: "cr1" }, { creator_id: "cr1", deleted_at: "2026-10-01", slug: "x" }) && !communityServable({ creator_id: "cr1" }, { creator_id: null, slug: "x" }) && !communityServable({ creator_id: "cr1" }, null))
check("community is a purpose", isDomainPurpose("community") && DOMAIN_PURPOSES.includes("community") && !isDomainPurpose("communities"))
check("its cache tag is per community", communityDomainTag("c1") === "community-domain:c1")

console.log("\nThe canonical is the domain once it is connected")
{
  const facts: SeoFacts = { slug: "clay-studio", name: "Clay Studio", tagline: null, description: null, seoTitle: null, seoDescription: null, coverUrl: null, logoUrl: null, indexable: true, creatorName: "Mara" }
  check("without a domain, storelib.com/community/<slug>", canonicalUrl("clay-studio") === "https://storelib.com/community/clay-studio" && communityMetadata(facts).alternates?.canonical === "https://storelib.com/community/clay-studio")
  check("with one, the domain's root", canonicalUrl("clay-studio", "https://club.maralind.com") === "https://club.maralind.com/" && communityMetadata({ ...facts, origin: "https://club.maralind.com" }).alternates?.canonical === "https://club.maralind.com/")
  const page = code("app/(marketing)/community/[slug]/page.tsx")
  const about = code("app/(marketing)/community/[slug]/about/page.tsx")
  check("the community's page and About read it, and the structured data names it", /* Changed on purpose (round AH: the reads start together). */ /communityDomainOrigin\(community\.id\)\]\)/.test(page) && /communityDomainOrigin\(load\.community\.id\)\]\)/.test(page) && /communityJsonLd\(load\.data\.community, communityIndexable\(load\.community\), origin\)/.test(page) && /origin: await communityDomainOrigin\(community\.id\)/.test(about))
  const server = code("lib/custom-domains/community-server.ts")
  check("only a live domain, only while the community is the owner's, cached under its tag", /\.eq\("status", "active"\)/.test(server) && /communityServable\(row,/.test(server) && /tags: \[communityDomainTag\(communityId\)\]/.test(server))
}

console.log("\nproxy.ts serves a community domain")
{
  const proxy = code("proxy.ts")
  check("asks for what the domain serves, then without those columns, then the old way",
    /\.select\("creator_id, status, purpose, is_primary, target_type, target_id, creator:creators \( user_id \)"\)/.test(proxy) && /\.select\("creator_id, status, purpose, is_primary, creator:creators \( user_id \)"\)/.test(proxy) && /\.select\("creator_id, status, creator:creators \( user_id \)"\)/.test(proxy))
  check("only once verified (active or ssl_provisioning), only while the owner's", /const verified = row\.status === "active" \|\| row\.status === "ssl_provisioning"/.test(proxy) && /if \(communityServable\(row, c\)\) communitySlug = c!\.slug/.test(proxy))
  check("the community is read by its id, so a renamed one keeps its domain", /\.from\("communities"\)\s*\.select\("slug, creator_id, deleted_at"\)\s*\.eq\("id", communityId\)/.test(proxy))
  check("unverified: nobody's pages, never indexed", /if \(!slug\) \{[\s\S]{0,400}DOMAIN_NOT_CONNECTED, \{ status: 404/.test(proxy))
  check("every request is decided by communityDomainStep", /const step = communityDomainStep\(\{ slug, pathname, search, host: hostWithoutPort\.toLowerCase\(\), mainDomain: MAIN_DOMAIN \}\)/.test(proxy))
  check("the community's layouts are told the community's own path", /request\.headers\.set\(COMMUNITY_PATH_HEADER, `\$\{step\.path\}\$\{search\}`\)/.test(proxy))
  check("the page goes through respond, so the headers after it still apply, and is never shared-cached",
    /if \(communityPath\) \{[\s\S]{0,400}respond = \(\) => \{[\s\S]{0,200}NextResponse\.rewrite\(communityUrl, \{ request \}\)[\s\S]{0,120}"private, no-cache, must-revalidate"/.test(proxy) && /supabaseResponse = respond\(\)/.test(proxy))
  check("a community domain is never a website or creator page domain", /if \(connected\?\.purpose === "community"\) \{[\s\S]*\} else if \(connected\) \{/.test(proxy))
  check("the session cookie stays host only", /domain: undefined,\s*secure: !isLocalhost,\s*sameSite: "lax"/.test(proxy))
}

console.log("\napp/api/domains: the session's creator, a community they own, one domain each")
{
  const route = code("app/api/domains/route.ts")
  check("every handler starts from the session", (route.match(/await domainOwner\((?:"store", \{ read: true \}|\{ read: true \})?\)/g) ?? []).length >= 4)
  check("adding to a community: owned by this creator, and without a domain already",
    /community = await ownedCommunity\(admin, creatorId, body\.communityId\)/.test(route) && /if \(!community\) return NextResponse\.json\(\{ error: "Community not found" \}, \{ status: 404 \}\)/.test(route) && /already has a domain, \$\{holder\.domain\}\. Remove it first\./.test(route))
  check("refused until the database has the columns", /if \(schema === "legacy" \|\| !targets\) return NextResponse\.json\(\{ error: COMMUNITY_NEEDS_UPDATE \}, \{ status: 409 \}\)/.test(route) && /if \(to === "community" && !communityOn\) return NextResponse\.json\(\{ error: COMMUNITY_NEEDS_UPDATE \}/.test(route))
  check("the row names the community and is never primary", /is_primary: false, target_type: COMMUNITY_TARGET, target_id: community\.id/.test(route))
  check("a failed community insert never becomes a website domain", /isMissingColumn\(inserted\.error\) && !community/.test(route))
  check("the plan, the rate limit and the name checks are the same as any domain's", /siteGate\(await creatorSitePlan\(creatorId\), "customDomain"\)/.test(route) && /bucket: "domain-add"/.test(route) && /hostnameProblem\(cleanDomain, getMainDomain\(\), HOST_RESERVED_SUFFIXES\)/.test(route) && /This domain is connected to another Storelib account/.test(route))
  const move = route.slice(route.indexOf("async function moveCommunityDomain"))
  check("moving onto a community: owned, free, and only this creator's row", /await ownedCommunity\(admin, creatorId, communityIdAsked\)/.test(move) && /\.update\(\{ purpose: "community", is_primary: false, target_type: COMMUNITY_TARGET, target_id: community\.id \}\)\s*\.eq\("id", row\.id\)\s*\.eq\("creator_id", creatorId\)/.test(move))
  check("moving off a community clears what it named", /\.update\(\{ purpose: to, is_primary: !there\.some\(\(r\) => r\.is_primary === true\), target_type: null, target_id: null \}\)\s*\.eq\("id", row\.id\)\s*\.eq\("creator_id", creatorId\)/.test(move))
  check("a community domain is not made primary", /if \(purposeOf\(row\) === "community"\) return NextResponse\.json\(\{ error: "A community has one domain\." \}, \{ status: 400 \}\)/.test(route))
  check("removed, its visitors go to the community's storelib.com address for the grace period", /if \(purpose === "community"\) return communitySlug \? `https:\/\/\$\{main\}\/community\/\$\{communitySlug\}`/.test(route) && /fallbackFor\(purpose, creatorId, username, communityLeft\?\.slug\)/.test(route))
  check("every change empties the community's cache", (route.match(/communityChanged\(/g) ?? []).length >= 5 && /communityDomainTag\(communityId\)/.test(code("app/api/domains/verify/route.ts")))
  const server = code("lib/custom-domains/community-server.ts")
  check("owned means communities.creator_id is this creator, not an admin role", /\.eq\("creator_id", creatorId\)/.test(server) && /communityServable\(\{ creator_id: creatorId \}, row\)/.test(server) && /communitiesEnabled\(\)/.test(server))
  const store = code("lib/custom-domains/store.ts")
  check("the list reads the new columns, then the purpose ones, then the old ones", /select\(TARGET_COLUMNS\)/.test(store) && /select\(CURRENT_COLUMNS\)/.test(store) && /select\(LEGACY_COLUMNS\)/.test(store))
  check("a community's domain is never handed a primary", /if \(purpose === "community"\) return/.test(store))
}

console.log("\nThe database change")
{
  const migration = raw("supabase/migrations/20270119_community_domains.sql")
  const part = raw("supabase/sql/run-now/185_community_domains.sql")
  check("two nullable columns", /ADD COLUMN IF NOT EXISTS target_type TEXT;/.test(migration) && /ADD COLUMN IF NOT EXISTS target_id UUID;/.test(migration) && !/ADD COLUMN IF NOT EXISTS target_\w+ \w+ NOT NULL/.test(migration))
  check("community is a purpose, and a community domain names its community and is never primary",
    /CHECK \(purpose IN \('website', 'creator_page', 'community'\)\) NOT VALID/.test(migration) && /purpose = 'community' AND target_type = 'community' AND target_id IS NOT NULL AND is_primary = false/.test(migration))
  check("one domain per community, held by the database", /CREATE UNIQUE INDEX IF NOT EXISTS custom_domains_one_per_target ON public\.custom_domains \(target_type, target_id\) WHERE target_id IS NOT NULL/.test(migration))
  check("the run-now part: one statement a line, the same statements", part.trim().split("\n").every((l) => l.startsWith("/*") || l.endsWith(";")) && part.trim().split("\n").slice(1, -1).every((l) => migration.includes(l)) && part.trim().endsWith("notify pgrst, 'reload schema';"))
  check("listed in the README and in the check after", /\| `185_community_domains\.sql` \|/.test(raw("supabase/sql/run-now/README.md")) && /as p185_community_domains/.test(raw("supabase/sql/run-now/99_check_after.sql")))
  check("and in the files the owner runs", raw("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 185_community_domains.sql") && /part: "185", file: "185_community_domains\.sql"/.test(raw("lib/admin/sql-parts.generated.ts")))
}

console.log("\nSettings › Domains: Community is an answer")
{
  const base = { websiteAddress: "maralind.storelib.com", creatorPageAddress: "storelib.com/maralind", locked: false, planLoading: false, loading: false, onData: () => {} }
  const communities = [{ id: "c1", name: "Clay Studio", slug: "clay-studio" }, { id: "c2", name: "Glaze Lab", slug: "glaze-lab" }]
  const row = (over: Partial<DomainItem>): DomainItem => ({ id: "d1", domain: "maralind.com", status: "active", purpose: "website", is_primary: true, records: [], ...over })
  const draw = (domains: DomainItem[], purposes: ("website" | "creator_page" | "community")[], list = communities) =>
    renderToStaticMarkup(createElement(DomainsPanel, { ...base, data: { domains, schema: "current", purposes, communities: list } }))
  const before = draw([row({})], ["website", "creator_page"])
  check("before part 185, two answers", (before.match(/data-domain-connects-option=/g) ?? []).length === 2 && !/Community/.test(before))
  const noCommunity = draw([row({})], ["website", "creator_page", "community"], [])
  check("with no community of their own, two answers", (noCommunity.match(/data-domain-connects-option=/g) ?? []).length === 2)
  const three = draw([row({})], ["website", "creator_page", "community"])
  check("with a community, three: Website, Creator page, Community", (three.match(/data-domain-connects-option=/g) ?? []).length === 3 && /data-domain-connects-option="community"/.test(three) && /grid-cols-3/.test(three))
  const shown = draw([row({ id: "d2", domain: "club.maralind.com", purpose: "community", community_id: "c1", is_primary: false }), row({ id: "d3", domain: "glaze.club", purpose: "community", community_id: "c2", is_primary: false })], ["website", "creator_page", "community"])
  check("a community domain shows which community, and what members do", /data-domain-community="club\.maralind\.com"/.test(shown) && /Which community/.test(shown) && /Shows Clay Studio and its pages\. Members sign in on/.test(shown))
  check("community domains are not primary, and have no Make primary", !/data-domain-primary=""/.test(shown) && !/>Primary</.test(shown))
  const panel = code("components/app/settings/domains-panel.tsx")
  check("picking asks the route with the community, and a taken community cannot be picked", /purpose: next, communityId/.test(panel) && /disabled=\{!!taken\}/.test(panel))
  check("one community of their own is picked at once", /if \(communities\.length === 1 && free\.length === 1\) return void setPurposeOf\(d, "community", free\[0\]\.id\)/.test(panel))
}

console.log("\nThe community's own Domain panel in /app")
{
  const file = "components/community/creator/community-domain-panel.tsx"
  check("it exists and is exported by name", existsSync(join(process.cwd(), file)) && /export function CommunityDomainPanel\(\{ communityId \}: \{ communityId: string \}\)/.test(raw(file)))
  const panel = code(file)
  check("the records are the shared DNS setup", /import \{ DnsSetup, type DnsCheckResult \} from "@\/components\/domains\/dns-setup"/.test(panel) && /<DnsSetup/.test(panel) && /tone="light"/.test(panel))
  check("connect, check and disconnect go through app/api/domains", /send<[^>]*>\("\/api\/domains", "POST", \{ domain: clean, purpose: "community", communityId: community\.id \}\)/.test(panel) && /"\/api\/domains\/verify", "POST"/.test(panel) && /send\("\/api\/domains", "DELETE", \{ domainId: domain\.id \}\)/.test(panel))
  check("it links to Settings › Domains", /\/app\/settings\?tab=domains/.test(panel))
  check("somebody who is not the owner is told who connects it", /The community's owner connects its domain\./.test(raw(file)))
  check("disconnecting asks first", /<Confirm/.test(panel) && /danger/.test(panel))
  /* Changed on purpose (round 31 merge): the merge mounted it, once, in the settings section's Page panel. */
  check("the panel is mounted once, in the settings section, never in the shell", !/CommunityDomainPanel/.test(raw("components/community/creator/community-shell.tsx")) && (raw("components/community/creator/settings-section.tsx").match(/<CommunityDomainPanel communityId=\{head\.id\} \/>/g) || []).length === 1)
}

console.log("\nThe words")
{
  const files = ["components/community/creator/community-domain-panel.tsx", "components/app/settings/domains-panel.tsx", "lib/custom-domains/community.ts", "app/api/domains/route.ts"]
  const words = files.map((f) => raw(f)).join("\n")
  check("no em dashes", !/—/.test(words))
  check("none of the banned words", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge)\b/i.test(words) && !/\btransform\b/i.test(words.replace(/transition-transform|transform/g, (m) => (m === "transition-transform" ? "" : m))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
