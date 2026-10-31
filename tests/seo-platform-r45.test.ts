/**
 * ===========================================================================
 *  ROUND 45: STORELIB.COM'S OWN PAGES, ITS CRAWLERS AND WHAT STAYS PRIVATE
 * ===========================================================================
 * PRIVATE    every private route, and every step of logging in, says noindex
 *            in its own answer: X-Robots-Tag from proxy.ts for the whole
 *            prefix, and a layout's robots with no canonical. /checkout said
 *            `index, follow` with itself as canonical.
 * AUTH       /login and the rest have titles of their own, still noindex.
 * CRAWLERS   one table of search, training and user crawlers; all allowed
 *            today through `*`, and refusing one never touches another.
 * SCHEMA     Organization (no empty sameAs), WebSite (no SearchAction),
 *            WebApplication with every price from lib/billing/plans.ts, and
 *            breadcrumbs on the platform pages that have depth.
 * METADATA   each public platform page: its own title and description,
 *            canonical, Open Graph and X card.
 * EXPLORE    an order or a search is noindex, canonical at the clean page;
 *            an unknown category is a real 404.
 * HELP       unique titles, canonicals at help.storelib.com, breadcrumbs.
 * LLMS       the plans as facts, from the plans table.
 */
import { unknownExploreCategory } from "../lib/explore/category-pages"
import { FEATURES_DESCRIPTION, FEATURES_PATH, FEATURES_TITLE } from "../lib/marketing/features-seo"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"
import {
  AUTH_FLOW_ROUTES,
  KNOWN_CRAWLERS,
  PLATFORM_DISALLOW,
  PRIVATE_ROBOTS_HEADER,
  PRIVATE_ROUTES,
  privatePlatformPath,
  refusedCrawlerRules,
} from "@/lib/seo/indexing"
import { AUTH_PAGE_METADATA, PRIVATE_PAGE_METADATA, authPageMetadata } from "@/lib/seo/private-metadata"
import {
  STORELIB_SAME_AS,
  schemaPrice,
  storelibApplicationJsonLd,
  storelibBreadcrumbJsonLd,
  storelibHomeJsonLd,
  storelibOrganizationJsonLd,
  storelibPlanOffers,
  storelibWebSiteJsonLd,
} from "@/lib/seo/structured-data"
import { OFFERED_PLANS, PRO_PRICE_CENTS } from "@/lib/billing/plans"
import { getFeeDescription } from "@/lib/billing/fee-calculator"
import { exploreIndexing, EXPLORE_COMMUNITIES_URL, EXPLORE_URL } from "@/lib/seo/explore-indexing"
import { CATEGORY_PAGES } from "@/lib/explore/category-pages"
import { DEV_PAGES } from "@/lib/developers/pages"
import { llmsTxt, planFacts } from "@/lib/developers/llms"
import { legalMetadata } from "@/lib/seo/page-metadata"
import { ALL_HELP_ARTICLES, HELP_CATEGORIES, helpArticlePath, helpCategory } from "@/lib/help/articles"
import { helpArticleJsonLd, helpCategoryJsonLd, helpHomeJsonLd } from "@/lib/help/structured-data"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 800)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/** Every file under a directory, recursively. */
const walk = (dir: string): string[] =>
  existsSync(join(root, dir))
    ? readdirSync(join(root, dir)).flatMap((f) => {
        const p = `${dir}/${f}`
        return statSync(join(root, p)).isDirectory() ? walk(p) : [p]
      })
    : []

console.log("\nEvery private route says noindex itself")
{
  /* The routes the lead listed by name, on top of PRIVATE_ROUTES. */
  const NAMED = [
    "/login", "/signup/verify", "/signup/success", "/forgot-password", "/onboarding", "/onboarding/start", "/upgrade", "/receipt/abc", "/pay/wallet-return",
    "/purchase/success", "/downloads", "/library", "/access/x", "/team/join", "/unsubscribe", "/review/x", "/order-help/x", "/store-builder",
    "/website-builder", "/creator-page", "/onepage-preview", "/sites/x", "/store", "/payouts-sheet", "/stripe-done", "/native-start",
    "/checkout", "/checkout/cart", "/app", "/admin", "/account", "/dashboard", "/auth/complete", "/reset-password", "/verify-email", "/welcome", "/request",
  ]
  const missed = NAMED.filter((p) => !privatePlatformPath(p))
  check("each named route, and what is under it, is a private path", missed.length === 0, missed)
  const all = [...PRIVATE_ROUTES, ...AUTH_FLOW_ROUTES]
  check("every route of both lists, bare, with a query's path and with a child", all.every((r) => privatePlatformPath(`/${r}`) && (r === "sell" || privatePlatformPath(`/${r}/x`)) && privatePlatformPath(`/${r.toUpperCase()}`)))
  const open = ["/", "/pricing", "/features", "/faq", "/signup", "/explore", "/explore/design", "/themes", "/developers/ai", "/terms", "/privacy", "/blog", "/libraryofsound", "/storefront", "/teams", "/payments-guide", "/reviews", "/andrewrullz"]
  check("public pages are not, and a creator whose name starts like a route is not either", open.every((p) => !privatePlatformPath(p)), open.filter(privatePlatformPath))
  check("/signup itself stays indexed (it is in the sitemap), the steps under it do not", !privatePlatformPath("/signup") && privatePlatformPath("/signup/verify"))
  check("the header says noindex", /noindex/.test(PRIVATE_ROBOTS_HEADER))

  const proxy = code("proxy.ts")
  check("proxy.ts writes X-Robots-Tag for those paths on storelib.com, after routing, so redirects and route handlers carry it",
    /const res = forgetStaleCountry\(request, await routeRequest\(request\)\)[\s\S]{0,400}onStorelibHost\(request\.headers\.get\("host"\)\) && privatePlatformPath\(request\.nextUrl\.pathname\) && !res\.headers\.has\("X-Robots-Tag"\)[\s\S]{0,80}res\.headers\.set\("X-Robots-Tag", PRIVATE_ROBOTS_HEADER\)/.test(proxy))
  check("  only on storelib.com and www, where these addresses are Storelib's own", /bare === MAIN_DOMAIN \|\| bare === `www\.\$\{MAIN_DOMAIN\}`/.test(proxy))

  const robotsOf = (m: Any) => m?.robots as Any
  check("the private metadata: noindex, nofollow, no canonical", robotsOf(PRIVATE_PAGE_METADATA).index === false && robotsOf(PRIVATE_PAGE_METADATA).follow === false && (PRIVATE_PAGE_METADATA.alternates as Any).canonical === null)
  check("an auth step: noindex, links followed, no canonical", robotsOf(AUTH_PAGE_METADATA).index === false && robotsOf(AUTH_PAGE_METADATA).follow === true && (AUTH_PAGE_METADATA.alternates as Any).canonical === null)

  /* Each private route with a folder has a layout at its top that says noindex, and nothing under it says index or names a canonical. */
  const NOINDEX_LAYOUT = /PRIVATE_PAGE_METADATA|AUTH_PAGE_METADATA|authPageMetadata\(|robots: \{ index: false/
  const dirs = PRIVATE_ROUTES.map((r) => `app/${r}`).filter((d) => existsSync(join(root, d)) && statSync(join(root, d)).isDirectory())
  const withPages = dirs.filter((d) => walk(d).some((f) => /\/page\.tsx$/.test(f)))
  const noLayout = withPages.filter((d) => !existsSync(join(root, `${d}/layout.tsx`)) || !NOINDEX_LAYOUT.test(code(`${d}/layout.tsx`)))
  check(`each private route with pages (${withPages.length}) has a layout that says noindex for all of them`, withPages.length >= 20 && noLayout.length === 0, noLayout)
  const authDirs = AUTH_FLOW_ROUTES.map((r) => `app/(auth)/${r}`).filter((d) => existsSync(join(root, d)))
  check("the auth steps sit under the auth layout, which says noindex and no canonical", authDirs.length >= 6 && /robots: \{ index: false, follow: true \}/.test(code("app/(auth)/layout.tsx")) && /alternates: \{ canonical: null \}/.test(code("app/(auth)/layout.tsx")))

  const files = [...dirs, ...authDirs, "app/(auth)/signup/verify", "app/(auth)/signup/success"].flatMap(walk).filter((f) => /\/(page|layout)\.tsx$/.test(f))
  const saysIndex = files.filter((f) => /index: true/.test(code(f)))
  check(`no page or layout under them says index (${files.length} files)`, files.length > 60 && saysIndex.length === 0, saysIndex)
  const namesCanonical = files.filter((f) => /\bcanonical:(?!\s*null)/.test(code(f)) || /alternates:\s*\{[^}]*\bcanonical\b(?!:\s*null)/.test(code(f)))
  check("  and none names a canonical", namesCanonical.length === 0, namesCanonical)

  const checkout = code("app/checkout/page.tsx")
  check("/checkout keeps the shared link's card (og:url) but names no canonical", !/alternates/.test(checkout) && /url: canonical/.test(checkout))
  check("  and says noindex through its layout", /export const metadata: Metadata = PRIVATE_PAGE_METADATA/.test(code("app/checkout/layout.tsx")))
  check("/signup/verify and /signup/success: noindex and no canonical, though /signup above them names one",
    /alternates: \{ canonical: null \}/.test(code("app/(auth)/signup/verify/layout.tsx")) && /authPageMetadata\(/.test(code("app/(auth)/signup/success/layout.tsx")))
  check("robots.txt still keeps crawlers off the private routes", PRIVATE_ROUTES.every((r) => PLATFORM_DISALLOW.includes(`/${r}/`)))
}

console.log("\nAuth pages have titles of their own")
{
  const titled: Record<string, string> = {
    "app/(auth)/login/layout.tsx": "Log in",
    "app/(auth)/reset-password/layout.tsx": "Choose a new password",
    "app/(auth)/request/layout.tsx": "Reset your password",
    "app/(auth)/welcome/layout.tsx": "Welcome",
    "app/(auth)/verify-email/page.tsx": "Verify your email",
  }
  const wrong = Object.entries(titled).filter(([f, t]) => !code(f).includes(`authPageMetadata("${t}"`))
  check("login, the reset, the email check and the welcome step each name themselves", wrong.length === 0, wrong)
  const titles = Object.values(titled)
  check("  every title different, and none the home page's", new Set(titles).size === titles.length && !titles.some((t) => /Sell Products & Grow/.test(t)))
  const m = authPageMetadata("Log in", "x") as Any
  check("  still noindex, links followed, no canonical", m.title === "Log in" && m.robots.index === false && m.robots.follow === true && m.alternates.canonical === null)
}

console.log("\nCrawlers: search and training, decided apart")
{
  const of = (t: string) => KNOWN_CRAWLERS.find((c) => c.token === t)
  check("Googlebot, Bingbot and OAI-SearchBot are search crawlers and allowed", ["Googlebot", "Bingbot", "OAI-SearchBot"].every((t) => of(t)?.purpose === "search" && of(t)?.allowed === true))
  check("GPTBot, Google-Extended and ClaudeBot are training crawlers, allowed today as before", ["GPTBot", "Google-Extended", "ClaudeBot"].every((t) => of(t)?.purpose === "training" && of(t)?.allowed === true))
  check("ChatGPT-User is a person's own fetch", of("ChatGPT-User")?.purpose === "user")
  check("each token once", new Set(KNOWN_CRAWLERS.map((c) => c.token.toLowerCase())).size === KNOWN_CRAWLERS.length)
  check("with every crawler allowed there is no group but `*`, so robots.txt is what it was", refusedCrawlerRules().length === 0)
  const noTraining = refusedCrawlerRules(KNOWN_CRAWLERS.map((c) => (c.purpose === "training" ? { ...c, allowed: false } : c)))
  check("refusing the training crawlers gives them one Disallow: / group", noTraining.length === 1 && noTraining[0].disallow === "/" && (noTraining[0].userAgent as string[]).includes("GPTBot"))
  check("  which names no search crawler", !(noTraining[0].userAgent as string[]).some((t) => of(t)?.purpose === "search"))
  const robots = code("app/robots.ts")
  check("app/robots.ts: `*` with the private disallows first, then the refused groups", /rules: \[\{ userAgent: "\*", allow: "\/", disallow: PLATFORM_DISALLOW \}, \.\.\.refusedCrawlerRules\(\)\]/.test(robots))
  const blocking = ["proxy.ts", "next.config.mjs", "vercel.json"].filter((f) => /(Googlebot|bingbot|OAI-SearchBot|GPTBot)[\s\S]{0,120}(403|deny|block)/i.test(code(f)))
  check("nothing in proxy.ts, next.config or vercel.json refuses a crawler by its user agent", blocking.length === 0, blocking)
}

console.log("\nStorelib's own structured data")
{
  const org = storelibOrganizationJsonLd() as Any
  check("Organization: name, address, an absolute logo", org["@type"] === "Organization" && org.url === "https://storelib.com" && /^https:\/\//.test(org.logo))
  check("  no sameAs while Storelib has no profile of its own listed", STORELIB_SAME_AS.length === 0 && !("sameAs" in org))
  const withProfiles = storelibOrganizationJsonLd(["https://www.youtube.com/@storelib", "javascript:alert(1)", "storelib"]) as Any
  check("  a real profile is listed, anything else left out", JSON.stringify(withProfiles.sameAs) === JSON.stringify(["https://www.youtube.com/@storelib"]))
  const site = storelibWebSiteJsonLd() as Any
  check("WebSite: name and address, and no SearchAction", site["@type"] === "WebSite" && site.name === "Storelib" && site.url === "https://storelib.com" && !("potentialAction" in site))
  const app = storelibApplicationJsonLd() as Any
  check("WebApplication: name, category, operating system, offers", app["@type"] === "WebApplication" && app.applicationCategory === "BusinessApplication" && app.operatingSystem === "Web" && Array.isArray(app.offers) && app.offers.length === OFFERED_PLANS.length)
  const offers = storelibPlanOffers() as Any[]
  const prices = offers.map((o) => o.price)
  check("every price in the markup is the price in lib/billing/plans.ts", JSON.stringify(prices) === JSON.stringify(OFFERED_PLANS.map((p) => (p.priceCents / 100).toFixed(2))), prices)
  check("  Free at 0.00 and Pro at its monthly price, in US dollars", prices[0] === "0.00" && prices.includes(schemaPrice(PRO_PRICE_CENTS)) && schemaPrice(PRO_PRICE_CENTS) === "29.00" && offers.every((o) => o.priceCurrency === "USD"))
  const pro = offers.find((o) => o.price !== "0.00")
  check("  Pro billed monthly, and its unit price agrees", pro.priceSpecification.billingDuration === "P1M" && pro.priceSpecification.price === pro.price)
  check("  each offer named as the card names it", offers.every((o, i) => o.name === OFFERED_PLANS[i].name))
  const home = storelibHomeJsonLd() as Any
  const types = home["@graph"].map((n: Any) => n["@type"])
  check("the home page: Organization, WebSite and WebApplication in one graph", home["@context"] === "https://schema.org" && ["Organization", "WebSite", "WebApplication"].every((t) => types.includes(t)))
  const ld = JSON.stringify(home)
  check("  no rating, no review, no FAQ, no SearchAction", !/AggregateRating|"Review"|FAQPage|SearchAction|HowTo/.test(ld))
  const homeSrc = code("app/(marketing)/page.tsx")
  check("  printed through jsonLdScript, with the old SearchAction and empty sameAs gone", /jsonLdScript\(storelibHomeJsonLd\(\)\)/.test(homeSrc) && !/SearchAction|sameAs/.test(homeSrc))
  check("/pricing and /features print the WebApplication and their breadcrumbs",
    /storelibApplicationJsonLd\(\), storelibBreadcrumbJsonLd\(\[\{ name: "Pricing", path: "\/pricing" \}\]\)/.test(code("app/(marketing)/pricing/page.tsx")) &&
      /storelibGraph\(storelibApplicationJsonLd\(\)\)/.test(code("app/(marketing)/features/layout.tsx")) &&
      /"BreadcrumbList"/.test(code("lib/marketing/features-seo.ts")))
  check("/sell is private, the /sell/<use-case> landing pages are not",
    privatePlatformPath("/sell") && privatePlatformPath("/sell/") && !privatePlatformPath("/sell/digital-products") && !privatePlatformPath("/sell/online-courses"))
  const crumbs = storelibBreadcrumbJsonLd([{ name: "Explore", path: "/explore" }, { name: "Design", path: "/explore/design" }]) as Any
  check("a breadcrumb trail starts at Storelib and carries full addresses", crumbs["@type"] === "BreadcrumbList" && crumbs.itemListElement.length === 3 && crumbs.itemListElement[0].item === "https://storelib.com" && crumbs.itemListElement[2].item === "https://storelib.com/explore/design" && crumbs.itemListElement[2].position === 3)
  const crumbed: Record<string, RegExp> = {
    "app/(marketing)/faq/page.tsx": /storelibBreadcrumbJsonLd\(\[\{ name: "FAQ", path: "\/faq" \}\]\)/,
    "app/(marketing)/themes/page.tsx": /storelibBreadcrumbJsonLd\(\[\{ name: "Themes", path: "\/themes" \}\]\)/,
    "app/(marketing)/themes/[slug]/page.tsx": /storelibBreadcrumbJsonLd\(\[\{ name: "Themes", path: "\/themes" \}, \{ name: listing\.name/,
    "app/(marketing)/explore/[category]/page.tsx": /storelibBreadcrumbJsonLd\(\[\{ name: "Explore", path: "\/explore" \}, \{ name: categoryLabel/,
    "components/developers/hub-page.tsx": /"@type": "BreadcrumbList"/,
    "components/legal/legal-page.tsx": /legalJsonLd\(kind\)/,
  }
  const noCrumbs = Object.entries(crumbed).filter(([f, re]) => !re.test(code(f))).map(([f]) => f)
  check("breadcrumbs on the platform pages with depth: FAQ, themes, a theme, a category, the developer pages, the legal pages", noCrumbs.length === 0, noCrumbs)
  check("  no FAQPage on /faq", !/FAQPage/.test(code("app/(marketing)/faq/page.tsx")))
}

console.log("\nEach public platform page names itself")
{
  /* The pages written with pageMetadata: their path, title and description read from the source. */
  const PAGES = [
    "app/(marketing)/pricing/page.tsx",
    "app/(marketing)/features/layout.tsx",
    "app/(marketing)/faq/page.tsx",
    "app/(marketing)/themes/page.tsx",
    "app/(marketing)/account-deletion/page.tsx",
  ]
  const facts = PAGES.map((f) => {
    /* /features reads its words from lib/marketing/features-seo (round 45, content), which its structured data shares. */
    if (f === "app/(marketing)/features/layout.tsx") return { f, path: FEATURES_PATH, title: FEATURES_TITLE, description: FEATURES_DESCRIPTION }
    const s = code(f)
    const block = /pageMetadata\(\{([\s\S]*?)\}\)/.exec(s)?.[1] ?? ""
    return { f, path: /path: "([^"]+)"/.exec(block)?.[1], title: /title: "([^"]+)"/.exec(block)?.[1], description: /description: "([^"]+)"/.exec(block)?.[1] }
  })
  check("each page sets its path, title and description through pageMetadata (canonical, Open Graph and the X card come with it)", facts.every((x) => x.path && x.title && x.description), facts)
  const root = code("app/layout.tsx")
  const homeTitle = /default: "([^"]+)"/.exec(root)?.[1]
  const homeDesc = /description: "([^"]+)"/.exec(root)?.[1]
  const legal = (["terms", "privacy"] as const).map((k) => legalMetadata(k) as Any)
  const dev = DEV_PAGES.map((p) => ({ title: p.title, description: p.description }))
  const categoryLabels = Object.fromEntries([...code("app/(marketing)/explore/[category]/page.tsx").matchAll(/"([a-z-]+)": "([^"]+)",/g)].map((m) => [m[1], m[2]]))
  const titles = [homeTitle, "Storelib | Discover", ...facts.map((x) => x.title), ...legal.map((m) => m.title), ...dev.map((d) => d.title), ...CATEGORY_PAGES.map((c) => categoryLabels[c])]
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i)
  check(`${titles.length} titles, every one different`, titles.every(Boolean) && dupes.length === 0, { dupes, missing: titles.filter((t) => !t) })
  const descriptions = [homeDesc, ...facts.map((x) => x.description), ...legal.map((m) => m.description), ...dev.map((d) => d.description)]
  const dDupes = descriptions.filter((d, i) => descriptions.indexOf(d) !== i)
  check("  and every description", descriptions.every(Boolean) && dDupes.length === 0, dDupes)
  const catPage = code("app/(marketing)/explore/[category]/page.tsx")
  check("a category page: its own canonical, og:url and X card", /canonical: `https:\/\/storelib\.com\/explore\/\$\{category\}`/.test(catPage) && /url: `https:\/\/storelib\.com\/explore\/\$\{category\}`/.test(catPage) && /card: "summary_large_image"/.test(catPage))
  const hub = code("components/developers/hub-page.tsx")
  check("a developer page: its canonical, og:url, and now Storelib's share picture", /alternates: \{ canonical: path \}/.test(hub) && /images: \[\{ url: storelibAssetUrl\(STORELIB_OG_IMAGE\)/.test(hub) && /card: "summary_large_image"/.test(hub))
  check("legal pages: canonical and og:url at their own address", legal.every((m) => m.alternates.canonical === m.openGraph.url && /^https:\/\/storelib\.com\/(terms|privacy)$/.test(m.alternates.canonical)))
  check("the home page's canonical is on the page", /alternates: \{ canonical: "https:\/\/storelib\.com" \}/.test(code("app/(marketing)/page.tsx")))
  const del = code("app/(marketing)/account-deletion/page.tsx")
  check("the account deletion page: its share card, still noindex, so no canonical to contradict it", /pageMetadata\(\{ path: "\/account-deletion"/.test(del) && /alternates: \{ canonical: null \}/.test(del) && /robots: \{ index: false, follow: false \}/.test(del))
}

console.log("\nExplore: views of a page, and pages that are not")
{
  check("an Explore category that does not exist is a 404 from the proxy, before /explore's loading screen sends a 200",
    unknownExploreCategory("/explore/nope") && unknownExploreCategory("/explore/nope/") && !unknownExploreCategory("/explore/design") && !unknownExploreCategory("/explore/communities") && !unknownExploreCategory("/explore/search") && !unknownExploreCategory("/explore") && !unknownExploreCategory("/explore/design/extra") &&
      /async function routeRequest[\s\S]{0,400}unknownExploreCategory\(pathname\)[\s\S]{0,120}NextResponse\.rewrite\(new URL\("\/_not-found", request\.url\), \{ status: 404 \}\)/.test(code("proxy.ts")))
  check("a sort is noindex, links followed, canonical at the clean page", (() => {
    const s = exploreIndexing({ sort: "newest", communitiesOn: true })
    return !s.index && s.canonical === EXPLORE_URL
  })())
  check("a search is noindex, canonical at the clean page", !exploreIndexing({ q: "fonts", communitiesOn: true }).index && exploreIndexing({ q: "fonts", communitiesOn: true }).canonical === EXPLORE_URL)
  check("the plain page and the communities view stay indexed", exploreIndexing({ communitiesOn: true }).index && exploreIndexing({ type: "communities", communitiesOn: true }).index && exploreIndexing({ type: "communities", communitiesOn: true }).canonical === EXPLORE_COMMUNITIES_URL)
  check("?type=products is the plain page", exploreIndexing({ type: "products", communitiesOn: true }).canonical === EXPLORE_URL)
  const page = code("app/(marketing)/explore/page.tsx")
  check("the page reads ?sort= and ?srt=, and the default order is no order", /\[params\?\.sort, params\?\.srt\]/.test(page) && /v !== "recommended"/.test(page) && /exploreIndexing\(\{ q, type, sort,/.test(page))
  const layout = code("app/(marketing)/explore/[category]/layout.tsx")
  check("an unknown category is a 404 decided in the layout, before the loading screen sends a 200", /CATEGORY_PAGES/.test(layout) && /notFound\(\)/.test(layout) && existsSync(join(root, "app/(marketing)/explore/[category]/loading.tsx")))
  check("  and its metadata says noindex too", /title: "Category Not Found",\s*robots: \{ index: false, follow: true \}/.test(code("app/(marketing)/explore/[category]/page.tsx")))
}

console.log("\nThe Help Center's metadata")
{
  const visible = ALL_HELP_ARTICLES
  const titles = visible.map((a) => `${a.title} | Storelib Help Center`)
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i)
  check(`${visible.length} articles, every title different`, dupes.length === 0, dupes)
  const catTitles = HELP_CATEGORIES.map((c) => c.title)
  check("every topic's title different", new Set(catTitles).size === catTitles.length)
  const article = code("app/help/[category]/[article]/page.tsx")
  check("an article's canonical and og:url are at help.storelib.com", /alternates: \{ canonical: publicHelpUrl\(path\.replace\(\/\^\\\/help\/, ""\)\) \}/.test(article) && /url: publicHelpUrl\(/.test(article))
  const a = visible[0]
  const ld = helpArticleJsonLd(a, helpCategory(a.category)!) as Any
  const crumbs = ld["@graph"].find((n: Any) => n["@type"] === "BreadcrumbList")
  check("an article's breadcrumbs: Help Center, its topic, itself, at help.storelib.com", crumbs?.itemListElement.length === 3 && crumbs.itemListElement.every((x: Any) => /^https:\/\/help\.storelib\.com/.test(x.item)) && crumbs.itemListElement[2].item.endsWith(helpArticlePath(a).replace(/^\/help/, "")))
  const cat = helpCategoryJsonLd(HELP_CATEGORIES[0], []) as Any
  check("a topic's breadcrumbs too", cat["@graph"].some((n: Any) => n["@type"] === "BreadcrumbList"))
  check("the home names no SearchAction", !("potentialAction" in (helpHomeJsonLd("x") as Any)))
}

console.log("\nllms.txt says what Storelib costs, from the plans table")
{
  const facts = planFacts()
  check("each plan with its price and its fee", OFFERED_PLANS.every((p) => facts.includes(p.name) && facts.includes(getFeeDescription(p.id))) && facts.includes("$29 a month") && facts.includes("no monthly fee"))
  const map = llmsTxt()
  check("in the Storelib section, with the features page", map.includes(facts) && map.indexOf(facts) > map.indexOf("## Storelib") && map.includes("](https://storelib.com/features)"))
  check("the summary names what can be sold and where", /digital products, courses, memberships and physical products/.test(map) && /OnePage/.test(map))
  check("no em dash and no banned word in what was added", !/—|unlock|seamless|powerful|effortless|supercharge|passive income/i.test(facts))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
