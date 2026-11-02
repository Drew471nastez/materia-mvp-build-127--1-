/**
 * ===========================================================================
 *  ROUND 48: THE SIGNED IN DASHBOARD, MEASURED AND MADE TO WAIT LESS
 * ===========================================================================
 * Measured in a local production build signed in against a fake Supabase that
 * logs every request (method in the round 48 appperf report). Held here:
 *
 * SHELL JS   the header's search imports its groups and query rules from
 *            lib/search/app-search-groups.ts, not the server's search module,
 *            which brought the whole Help Center, the integrations catalog
 *            and the orders grouping into every /app page's first load.
 * PILL       the phone's bar is hidden on a computer: there it still warms its
 *            four pages (a first click lands at once) but alone and once, not
 *            Analytics' figures and not again after every refresh.
 * RAIL       the rail's and header's links say prefetch={false}: each one
 *            fetched its route's outline as soon as it was on screen, about
 *            thirty signed in requests on every load of /app that bring no
 *            data (there is no loading boundary under /app). The rows fetch
 *            their whole page under the pointer, children rows now too.
 * SEARCH     the header's search takes the Community switch from the layout
 *            (through the sidebar), so a load of /app no longer asks
 *            GET /api/platform/flags for an answer the server already had.
 * ANALYTICS  once teamPageStore knows the store (the owner's own creator row
 *            through the per request cache, or the team store), every read
 *            goes in one round by the store's id: no second creator read, no
 *            second wave for the products and the places.
 * SETTINGS   the team store is asked beside the first reads, not after them.
 * EMAILS     the seven other tabs are warmed again at most every five minutes
 *            (the router's own keep), not every minute; an opened tab still
 *            reads again behind what is kept.
 * SIDEBAR    the installed integrations are asked again on a return to the
 *            tab at most once a minute (an install here still redraws at once).
 * PRODUCTS   the owner's list starts when the creator row lands, beside the
 *            profile, not after it (a move from another page reads both).
 * WEBSITE    the library, the website's name and the listings start with the
 *            creator and profile reads, by the store id websitePage has.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const flat = (s: string) => s.replace(/\s+/g, " ")

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

/** The source of the first `Promise.all([` ... `])` after `from`, flattened. */
function batchAfter(src: string, from: RegExp): string {
  const at = src.search(from)
  if (at < 0) return ""
  const start = src.indexOf("Promise.all([", at)
  if (start < 0) return ""
  let depth = 0
  for (let i = start + "Promise.all(".length; i < src.length; i++) {
    if (src[i] === "[" || src[i] === "(") depth++
    else if (src[i] === "]" || src[i] === ")") {
      depth--
      if (depth === 0) return flat(src.slice(start, i + 1))
    }
  }
  return ""
}

/** How many `await`s run between two points of a source: each one is a wait in a line. */
function awaitsBetween(src: string, from: RegExp, to: RegExp): number {
  const a = src.search(from)
  const b = src.search(to)
  if (a < 0 || b < 0 || b < a) return -1
  return (src.slice(a, b).match(/\bawait\b/g) ?? []).length
}

section("Shell JS: the search box brings no server search code into /app")
{
  const box = code("components/app/app-search.tsx")
  check("the box imports the groups module, never lib/search/app-search", /from "@\/lib\/search\/app-search-groups"/.test(box) && !/from "@\/lib\/search\/app-search"/.test(box))
  const groups = read("lib/search/app-search-groups.ts")
  const imports = [...groups.matchAll(/^import [^\n]* from "([^"]+)"/gm)].map((m) => m[1])
  check("  and that module imports nothing but the words", imports.length === 1 && imports[0] === "@/lib/i18n/text", imports)
  check("  no help, catalog, orders or database code in it", !/lib\/help|lib\/integrations|lib\/orders|supabase/.test(code("lib/search/app-search-groups.ts")))
  const server = code("lib/search/app-search.ts")
  check("the server module re-exports the same names for the route and the tests", /export \{ GROUP_LABELS, GROUP_LIMIT, MAX_QUERY_LENGTH, SEARCH_GROUPS, emptyResult, isSearchable, normalizeQuery \} from "@\/lib\/search\/app-search-groups"/.test(server) && /export type \{ SearchGroupId, SearchHit, SearchResult \} from "@\/lib\/search\/app-search-groups"/.test(server))
  check("  and still searches the Help Center on the server", /import \{ searchHelp \} from "@\/lib\/help\/search"/.test(server))
}

section("Pill: on a computer, where it is hidden, the pages alone and once")
{
  const nav = code("components/app/sidebar-mobile-nav.tsx")
  const shell = code("components/app/sidebar.tsx")
  const navigation = code("lib/ui/app-navigation.ts")
  check("the bar still warms its four pages at every width", /warmedAsPhone = isPhoneShell\(\)\s*for \(const item of items\) onPrefetch\(item\.href, warmedAsPhone\)/.test(nav))
  check("  a phone keeps them warm through a refresh, a computer asks for the page alone", /prefetchAppPage\(router, href, phone \? \{ keepWarm: true \} : \{ pageOnly: true \}\)/.test(shell))
  check("  the page alone is no figures, covers or Stripe reads", /if \(options\?\.pageOnly\) return\s*if \(href === "\/app\/analytics"/.test(navigation))
  check("  a window narrowed to a phone is warmed as one", /window\.matchMedia\(PHONE_WIDTH_QUERY\)/.test(nav) && /if \(!warmedAsPhone && isPhoneShell\(\)\) warm\(\)/.test(nav))
  check("  the same breakpoint isPhoneShell reads", /export const PHONE_WIDTH_QUERY = "\(max-width: 767px\)"/.test(navigation) && /window\.matchMedia\?\.\(PHONE_WIDTH_QUERY\)\.matches/.test(navigation))
  check("  the bar is hidden from md up, which is why", /md:hidden/.test(nav))
  check("the rail's hover still warms Analytics' figures with its page", /prefetchAppPage\(router, href\)/.test(shell) && /import\("@\/lib\/analytics\/report-cache"\)\.then\(\(m\) => m\.warmAnalytics\(\)\)/.test(navigation))
}

section("Rail links: fetched on intent, not by the router on sight")
{
  const rail = code("components/app/sidebar-desktop-nav.tsx")
  const shell = code("components/app/sidebar.tsx")
  const pill = code("components/app/sidebar-mobile-nav.tsx")
  check("every rail row, its children, the upgrade card and Settings say prefetch={false}", (rail.match(/prefetch=\{false\}/g) ?? []).length === 5, (rail.match(/prefetch=\{false\}/g) ?? []).length)
  check("  a row still fetches its whole page under the pointer and the keyboard", /const prefetch = \(\) => \{\s*if \(!item\.forceNavigation && !active\) onPrefetch\?\.\(item\.href\)/.test(rail))
  check("  and a child row now does too (it fetched only the route's outline before)", /if \(!active\) onPrefetch\?\.\(child\.href\)/.test(rail) && /onPrefetch=\{onPrefetch\}\s*\/>/.test(rail))
  check("the header's account links, Settings and logo say prefetch={false}", (shell.match(/prefetch=\{false\}/g) ?? []).length === 4 && /onMouseEnter=\{\(\) => warmAccountPage\(item\.href\)\}/.test(shell))
  check("the phone's bar says prefetch={false}: it warms its four pages itself", /href=\{item\.href\}\s*prefetch=\{false\}/.test(pill) && /onPrefetch\?\.\(item\.href, isPhoneShell\(\)\)/.test(pill))
  check("Settings is still fetched whole a moment after each page settles", /prefetchAppPage\(router, "\/app\/settings"\)/.test(shell))
}

section("Search: the Community switch comes from the layout")
{
  const search = code("components/app/app-search.tsx")
  const sidebar = code("components/app/sidebar.tsx")
  check("AppSearch takes communitiesEnabled as a prop", /forwardRef<AppSearchHandle, \{ className\?: string; communitiesEnabled\?: boolean \}>/.test(search))
  check("  and hands it to useCommunitiesEnabled, which then asks nothing", /useCommunitiesEnabled\(communitiesEnabled\)/.test(search) && !/useCommunitiesEnabled\(\)/.test(search))
  check("the sidebar passes the layout's answer", /<AppSearch ref=\{searchRef\} communitiesEnabled=\{communitiesEnabled\} \/>/.test(sidebar))
  const flags = code("lib/platform/use-flags.ts")
  check("useCommunitiesEnabled skips its request when given an answer", /if \(initial !== undefined\) return/.test(flags) && /return initial \?\? enabled/.test(flags))
  check("the layout reads the switch once and gives it to the sidebar", /communitiesEnabled\(\)\.catch\(\(\) => false\)/.test(code("app/app/layout.tsx")) && /communitiesEnabled=\{communitiesOn\}/.test(code("app/app/layout.tsx")))
}

section("Sidebar: the installed integrations, not on every return to the tab")
{
  const sidebar = code("components/app/sidebar.tsx")
  check("a return to the tab asks again only after a minute", /const INSTALLED_AGAIN_MS = 60_000/.test(sidebar) && /document\.visibilityState === "visible" && Date\.now\(\) - installedReadAt >= INSTALLED_AGAIN_MS\) read\(\)/.test(sidebar))
  check("  every read stamps the time", /installedReadAt = Date\.now\(\)\s*fetch\("\/api\/store\/integrations\/installed"/.test(sidebar))
  check("  an install in this tab still redraws the row at once", /window\.addEventListener\("storelib:integrations-changed", read\)/.test(sidebar))
}

section("Emails: the other tabs warmed once per five minutes")
{
  const emails = code("app/app/emails/emails-client.tsx")
  check("the idle warm-up keeps a tab for the router's five minutes", /for \(const t of TABS\) if \(t !== tab\) prefetch\(keyFor\(t\), loaderFor\(t\), APP_PAGE_KEPT_MS\)/.test(emails) && /export const APP_PAGE_KEPT_MS = 300_000/.test(code("lib/ui/app-navigation.ts")))
  const cache = code("components/email/emails-cache.ts")
  check("  a tab that is opened is still read again behind what is kept after a few seconds", /const FRESH_MS = 8_000/.test(cache) && /if \(!e \|\| e\.data === undefined \|\| Date\.now\(\) - e\.at > FRESH_MS\) void load\(key\)/.test(cache))
  check("  and a write from the composer still marks every list old", /export function refreshMatching\(prefix: string\)/.test(cache) && /entries\.set\(key, \{ \.\.\.e, at: 0 \}\)/.test(cache))
}

section("Analytics: one read round once the store is known")
{
  const page = code("app/app/analytics/page.tsx")
  check("the store is teamPageStore's, for an owner and a team member alike", /const access = await teamPageStore\("analytics"\)/.test(page) && /const creatorId = access\.creatorId/.test(page) && /const ownerUserId = access\.ownerUserId/.test(page))
  check("no creator row is read here a second time", !/\.from\("creators"\)/.test(page) && !/creators!inner/.test(page))
  const batch = batchAfter(page, /const ownerUserId = access\.ownerUserId/)
  check("products, communities, the added reports and the places in one Promise.all",
    /\.from\("products"\)\.select\("id, title, thumbnail_url, type"\)\.eq\("creator_id", creatorId\)/.test(batch) &&
      /\.from\("communities"\)/.test(batch) && /readReportLayout\(adminSupabase, ownerUserId\)/.test(batch) && /creatorProperties\(adminSupabase, creatorId, ownerUserId\)/.test(batch), batch.slice(0, 200))
  check("  and nothing awaited after it but drawing", awaitsBetween(page, /const ownerUserId = access\.ownerUserId/, /return <AnalyticsClient/) === 1)
  check("waits in a line before the page: the user, the store, the reads", awaitsBetween(page, /export default async function AnalyticsPage/, /return <AnalyticsClient/) === 3)
  check("a team member's communities only with Community, the owner's always", /!access\.acting \|\| permits\(access\.acting\.permissions, "community"\)/.test(page))
  check("drafts are no place, as before", /\.in\("status", \["published", "archived"\]\)/.test(page) && /\.is\("deleted_at", null\)/.test(page) && /\.limit\(12\)/.test(page))
  check("no store: onboarding, as a missing creator row did", /if \(access\.kind === "none"\) redirect\("\/onboarding"\)/.test(page))
  check("refused: the closed area, nothing of the store read", /if \(access\.kind === "denied"\) return <TeamAreaClosed area="analytics"/.test(page))
  check("the viewer key is teamPageStore's (the user's own id for an owner)", /userId=\{access\.viewer\}/.test(page) && /viewer: user\.id, acting: null/.test(code("lib/team/server.ts")))
  check("a place read that fails still lists no places", /\.catch\(\(\): CreatorProperties => \(\{ onePageId: null, websites: \[\], defaultWebsite: null \}\)\)/.test(page))
}

section("Settings: the team store beside the first reads")
{
  const src = code("app/app/settings/_server.ts")
  const first = batchAfter(src, /pageUser\(\)/)
  check("teamStoreForRequest is in the first round", /teamStoreForRequest\(user\.id\)\.catch\(\(\) => null\)/.test(first))
  check("  and not awaited on its own after it", !/await teamStoreForRequest/.test(src))
  check("a member with no store of their own still gets the Team section", /const stores = await teamStoresForRequest\(user\.id\)/.test(src) && /if \(actingTeam \|\| stores\.length > 0\) return \{ memberOnly: true as const \}/.test(src))
  check("the member's tabs still come from the acting store", /memberSettingsTabs\(actingTeam \? actingTeam\.acting\.permissions : null\)/.test(src))
}

section("Products: the list beside the profile")
{
  const src = code("app/app/products/page.tsx")
  check("the list is started from the creator row's promise, on the caller's own client", /const listRead = creatorForRequest\(user\.id\)\.then\(\(creator\) => \(creator \? readProductList<ListedRow>\(supabase, creator\.id\) : null\)\)/.test(src))
  check("  before the creator and profile batch is awaited", src.indexOf("const listRead") > 0 && src.indexOf("const listRead") < src.indexOf("await Promise.all([creatorForRequest(user.id), profileForRequest(user.id)])"))
  check("  and never left as an unhandled rejection when a redirect wins", /listRead\.catch\(\(\) => \{\}\)/.test(src))
  check("no creator still goes to /app before anything is drawn", src.indexOf('if (!creator) redirect("/app")') < src.indexOf("await listRead"))
  check("the request cache makes the second creatorForRequest the same answer", /export const creatorForRequest = cache\(/.test(code("lib/auth/request-scope.ts")))
}

section("Website: the library beside the creator read")
{
  const src = code("app/app/website-builder/page.tsx")
  const batch = batchAfter(src, /const handle = websiteHandleOf\(storeId\)/)
  check("installs, creator and profile in one Promise.all", /\.from\("creators"\)\.select\("id, slug"\)\.eq\("id", storeId\)/.test(batch) && /\.from\("profiles"\)/.test(batch) && /load\(\)/.test(batch), batch.slice(0, 160))
  check("  the library by the store id websitePage found", /\.eq\("creator_id", storeId\)/.test(src) && /const storeId = access\.creatorId/.test(src))
  check("  the website's name and the listings started before it", src.indexOf("const handle = websiteHandleOf(storeId)") < src.indexOf("const [{ data: creator }, { data: profile }, library]") && src.indexOf("const listings = publishedListings()") < src.indexOf("const [{ data: creator }, { data: profile }, library]"))
  check("no creator row: /app, as before", /if \(!creator\) redirect\("\/app"\)/.test(src))
  check("an empty library is still seeded and read again", /if \(rows && rows\.length === 0\)/.test(src) && /ensureStarterWebsite\(createAdminClient\(\), creator\.id\)/.test(src) && /\(\{ data: rows \} = await load\(\)\)/.test(src))
}

section("No route level loading screen under /app (the owner's rule, tests/app-shell-motion.test.ts)")
{
  const offenders = ["app/app/loading.tsx", "app/app/products/loading.tsx", "app/app/orders/loading.tsx", "app/app/analytics/loading.tsx", "app/app/emails/loading.tsx", "app/app/customers/loading.tsx", "app/app/community/loading.tsx", "app/app/settings/loading.tsx", "app/app/integrations/loading.tsx"].filter((f) => existsSync(join(root, f)))
  check("none added: the shell's bar and spinner are the slow-load state", offenders.length === 0, offenders)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
