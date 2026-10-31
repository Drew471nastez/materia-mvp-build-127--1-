/**
 * ===========================================================================
 *  THE COMPARISON PAGES (/alternatives): EVIDENCE, SUMS, METADATA, LINKS
 * ===========================================================================
 * DATA       every claim about a competitor names a source that exists, with
 *            a URL and the day it was checked, or says it is unverified or
 *            conflicting with a note; every claim about Storelib names a
 *            path in this repository that exists.
 * SPECIFIC   no two pages share an intro, a FAQ or a feature list: a page is
 *            not another with the name swapped.
 * COPY       no em dash and none of the words CLAUDE.md bans.
 * SUMS       the calculator charges Storelib exactly as checkout does, and
 *            each competitor's plan as its sources say.
 * SEO        unique titles and descriptions, absolute canonicals, one
 *            BreadcrumbList, no FAQPage (round 45: the questions stay as
 *            plain HTML).
 * WIRING     static params, the sitemap reads the list, the routes are
 *            reserved words, header, footer and pricing link here, the sign
 *            up link keeps the visit's own tags.
 * RENDER     the page and the hub render to markup with their headings in
 *            order, their sources listed, and the disclaimer.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import { ALTERNATIVES, CATEGORIES, alternativePath, getAlternative, relatedAlternatives } from "@/lib/alternatives"
import { alternativeJsonLd, alternativeMetadata, hubJsonLd, hubMetadata, resolveFaqs, type Flags } from "@/lib/alternatives/seo"
import { compare, competitorCost, perSaleCents, storelibCost, verdict } from "@/lib/alternatives/calculator"
import { STORELIB, storelibFeeCents } from "@/lib/alternatives/storelib"
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { comparisonSource, incomingTags, readSignupSource, signupHref } from "@/lib/alternatives/attribution"
import { alternativesAddresses } from "@/lib/seo/announce-pages"
import { RESERVED_ROOT_SEGMENTS } from "@/lib/routes/reserved-segments"
import { WEB_ONLY_SEGMENTS } from "@/lib/platform/app-links"
import { AlternativePage } from "@/components/alternatives/alternative-page"
import { HubGroups, HubMatrix } from "@/components/alternatives/hub-sections"
import type { Claim, Competitor, CompetitorCell } from "@/lib/alternatives/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const ALL_ON: Flags = { communities: true, explore: true, physical: true }
const ALL_OFF: Flags = { communities: false, explore: false, physical: false }
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Every claim a page makes about the competitor, with where it sits. */
function claimsOf(c: Competitor): { where: string; claim: Claim | CompetitorCell }[] {
  return [
    ...c.strengths.map((claim) => ({ where: "strengths", claim })),
    ...c.limits.map((claim) => ({ where: "limits", claim })),
    ...c.whenToStay.map((claim) => ({ where: "whenToStay", claim })),
    ...c.pricingNotes.map((claim) => ({ where: "pricingNotes", claim })),
    ...c.plans.map((p) => ({ where: `plan ${p.id}`, claim: p.claim })),
    ...c.features.map((f) => ({ where: `feature ${f.id}`, claim: f.competitor })),
  ]
}

/** All the words a page prints, for the copy rules. */
function wordsOf(c: Competitor): string {
  return JSON.stringify([c.summary, c.pricingShort, c.seo, c.intro, c.whyStorelib, c.whenToStay, c.strengths, c.limits, c.storelibStrengths, c.storelibLimits, c.features, c.plans.map((p) => [p.name, p.processingLabel, p.claim]), c.pricingNotes, c.examples, c.switching, c.moving, c.importer, c.faqs])
}

console.log("\nThe list")
{
  const slugs = ALTERNATIVES.map((c) => c.slug)
  check("the five pages the owner asked for", ["gumroad", "stan-store", "whop", "shopify", "linktree"].every((s) => slugs.includes(s)), slugs)
  check("slugs are unique and URL safe", new Set(slugs).size === slugs.length && slugs.every((s) => /^[a-z0-9-]+$/.test(s)))
  check("every category used is a known one", ALTERNATIVES.every((c) => c.categories.length > 0 && c.categories.every((k) => CATEGORIES.some((x) => x.id === k))))
  check("getAlternative finds each, and nothing else", slugs.every((s) => getAlternative(s)?.slug === s) && !getAlternative("nope"))
  check("related comparisons never include the page itself", ALTERNATIVES.every((c) => relatedAlternatives(c.slug).every((r) => r.slug !== c.slug)))
}

console.log("\nEvery competitor claim has its evidence")
for (const c of ALTERNATIVES) {
  const ids = new Set(c.sources.map((s) => s.id))
  check(`${c.name}: source ids unique`, ids.size === c.sources.length)
  check(`${c.name}: every source has an https URL, a publisher and a checked date`, c.sources.every((s) => /^https:\/\//.test(s.url) && s.publisher && ISO.test(s.checkedOn) && s.title), c.sources.filter((s) => !ISO.test(s.checkedOn)))
  const bad = claimsOf(c).filter(({ claim }) => {
    if (claim.sources.some((id) => !ids.has(id))) return true
    if (claim.status === "verified") return claim.sources.length === 0
    if (claim.status === "unverified") return !claim.note
    if (claim.status === "conflicting") return claim.sources.length === 0 || !claim.note
    return true
  })
  check(`${c.name}: each claim is sourced, or marked with a note`, bad.length === 0, bad)
  const unknownCells = c.features.filter((f) => f.competitor.value === "unknown" && f.competitor.status === "verified")
  check(`${c.name}: an unknown cell is never marked verified`, unknownCells.length === 0, unknownCells.map((f) => f.id))
  const used = new Set(claimsOf(c).flatMap(({ claim }) => claim.sources))
  check(`${c.name}: every listed source is cited somewhere`, c.sources.every((s) => used.has(s.id)), c.sources.filter((s) => !used.has(s.id)).map((s) => s.id))
  check(`${c.name}: at least one plan can sell a digital product`, c.plans.some((p) => p.sellsDigital))
  check(`${c.name}: a plan with no processing rate says whether it is included or unknown`, c.plans.every((p) => p.processing !== null || p.processingLabel.length > 0))
}

console.log("\nEvery Storelib claim points at the code that makes it true")
for (const c of ALTERNATIVES) {
  const paths = [
    ...c.whyStorelib.map((p) => p.code),
    ...c.storelibStrengths.map((p) => p.code),
    ...c.storelibLimits.map((p) => p.code),
    ...c.features.map((f) => f.storelib.code),
  ]
  const missing = paths.filter((p) => !existsSync(join(process.cwd(), p)))
  check(`${c.name}: every path exists`, missing.length === 0, missing)
  check(`${c.name}: a flagged point has its off wording`, [...c.whyStorelib, ...c.storelibStrengths, ...c.storelibLimits].every((p) => !p.flag || !!p.textOff))
  check(`${c.name}: a flagged answer has its off answer`, c.faqs.every((f) => !f.flag || !!f.aOff))
}

console.log("\nEach page is about its platform, not a template")
{
  const intros = ALTERNATIVES.map((c) => c.intro.join(" "))
  check("no two intros are the same", new Set(intros).size === intros.length)
  const firstFaqs = ALTERNATIVES.flatMap((c) => c.faqs.map((f) => f.q))
  check("no question is asked on two pages", new Set(firstFaqs).size === firstFaqs.length, firstFaqs)
  check("each intro names its platform and says who uses it", ALTERNATIVES.every((c) => c.intro.join(" ").includes(c.name) && c.intro.length >= 2))
  const featureSets = ALTERNATIVES.map((c) => c.features.map((f) => f.id).join(","))
  check("feature tables differ from page to page", new Set(featureSets).size === featureSets.length)
  check("each page says when the other platform is the better choice", ALTERNATIVES.every((c) => c.whenToStay.length >= 2 || (c.whenToStay.length >= 1 && c.storelibLimits.length >= 3)))
  check("each page has Storelib limits, not only strengths", ALTERNATIVES.every((c) => c.storelibLimits.length >= 2))
  check("examples cover sellers, educators and creators", ALTERNATIVES.every((c) => ["Sellers", "Educators", "Creators"].every((w) => c.examples.some((e) => e.who === w))))
  check("each switching guide has at least four steps and each FAQ list four questions", ALTERNATIVES.every((c) => c.switching.length >= 4 && c.faqs.length >= 4))
}

console.log("\nCopy: no em dash, none of the banned words")
{
  const banned = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(ative)?|revolutioni[sz]e|game[- ]chang)/i
  for (const c of ALTERNATIVES) {
    const words = wordsOf(c)
    check(`${c.name}: no em dash`, !words.includes("—") && !words.includes("–"))
    check(`${c.name}: no banned words`, !banned.test(words), words.match(banned)?.[0])
  }
  const pages = ["components/alternatives/alternative-page.tsx", "components/alternatives/hub-sections.tsx", "components/alternatives/fee-calculator.tsx", "components/alternatives/disclaimer.tsx", "app/(marketing)/alternatives/page.tsx", "lib/alternatives/seo.ts"]
  check("the page code prints no em dash either", pages.every((p) => !code(p).includes("—")))
  check("no testimonials, ratings or review counts are claimed", ALTERNATIVES.every((c) => !/\b(\d(\.\d)? stars?|rated \d|testimonial|reviews? from)\b/i.test(wordsOf(c))))
}

console.log("\nThe calculator charges Storelib as checkout does")
{
  for (const price of [100, 399, 400, 1000, 2500, 4900, 9999]) {
    const free = calculateStorelibFee({ grossMinor: price, currency: "USD", sellerPlan: "free" }).totalStorelibFeeMinor
    const paid = calculateStorelibFee({ grossMinor: price, currency: "USD", sellerPlan: "paid" }).totalStorelibFeeMinor
    check(`$${price / 100}: Free and Pro fees equal checkout's`, storelibFeeCents(price, "free") === free && storelibFeeCents(price, "growth") === paid, { free, paid })
  }
  const free = storelibCost("free", { priceCents: 2500, sales: 40 })
  check("Free, 40 x $25: fee $60 (5% + 25¢), no plan", free.feeCents === 6000 && free.planCents === 0, free)
  check("  Stripe 2.9% + 30¢ on each, rounded per sale (73¢ + 30¢): $41.20", free.processingCents === 4120, free.processingCents)
  check("  total and what is kept add up", free.totalCents === 10120 && free.keepCents === 100000 - 10120)
  const pro = storelibCost("growth", { priceCents: 2500, sales: 40 })
  check(`Pro, 40 x $25: fee $40 and the ${STORELIB.proPrice} plan`, pro.feeCents === 4000 && pro.planCents === STORELIB.proPriceCents)
  const small = storelibCost("free", { priceCents: 300, sales: 10 })
  check("a $3 sale pays the small order rate with no fixed part (11.25%, 34¢)", small.feeCents === 340, small.feeCents)
  check("nothing is charged on a price of 0", storelibCost("free", { priceCents: 0, sales: 10 }).totalCents === 0)
  check("absurd inputs are clamped", storelibCost("free", { priceCents: -5, sales: 1e12 }).totalCents === 0)
  check("perSaleCents rounds per sale", perSaleCents(999, { percent: 2.9, fixedCents: 30 }) === 59)
}

console.log("\nThe calculator charges each competitor as its sources say")
{
  const g = getAlternative("gumroad")!
  const direct = competitorCost("Gumroad", g.plans.find((p) => p.id === "direct")!, { priceCents: 2500, sales: 40 })
  check("Gumroad direct, 40 x $25: $120 (10% + 50¢)", direct.feeCents === 12000 && direct.planCents === 0, direct)
  check("  its processing is unknown and left out of the total, and the row says so", direct.processingCents === null && direct.totalExcludesProcessing)
  const disc = competitorCost("Gumroad", g.plans.find((p) => p.id === "discover")!, { priceCents: 2500, sales: 40 })
  check("Gumroad Discover: 30%", disc.feeCents === 30000)
  const s = getAlternative("stan-store")!
  const creator = competitorCost("Stan Store", s.plans.find((p) => p.id === "creator")!, { priceCents: 1500, sales: 10 })
  check("Stan Creator: $29 plan, 0% fee, Stripe 2.9% + 30¢", creator.planCents === 2900 && creator.feeCents === 0 && creator.processingCents === (44 + 30) * 10, creator)
  const w = getAlternative("whop")!
  const whop = competitorCost("Whop", w.plans[0], { priceCents: 4900, sales: 30 })
  check("Whop: 2.7% + 30¢, processing included (0, not unknown)", whop.feeCents === (132 + 30) * 30 && whop.processingCents === 0 && !whop.totalExcludesProcessing, whop)
  const l = getAlternative("linktree")!
  const rows = compare("Linktree", l.plans, { priceCents: 900, sales: 60 })
  check("Linktree Starter is left out: it cannot sell digital products", !rows.some((r) => r.plan === "Starter") && rows.some((r) => r.plan === "Pro"))
  const sh = getAlternative("shopify")!
  const basic = competitorCost("Shopify", sh.plans.find((p) => p.id === "basic")!, { priceCents: 1200, sales: 20 })
  check("Shopify Basic: $39 billed monthly and 2.9% + 30¢", basic.planCents === 3900 && basic.processingCents === (35 + 30) * 20)
}

console.log("\nThe verdict says who is cheaper, either way")
{
  const w = getAlternative("whop")!
  const v = verdict(compare("Whop", w.plans, { priceCents: 4900, sales: 30 }))
  check("Whop at $49 x 30 is cheaper than Storelib, and the verdict says so", v?.cheaper === "competitor" && v.basis === "total", v)
  const g = getAlternative("gumroad")!
  const vg = verdict(compare("Gumroad", g.plans, { priceCents: 2500, sales: 40 }))
  check("Gumroad, unknown processing: judged on platform take only", vg?.basis === "platform" && vg.cheaper === "storelib", vg)
  const s = getAlternative("stan-store")!
  const big = verdict(compare("Stan Store", s.plans, { priceCents: 10000, sales: 500 }))
  check("Stan at high volume comes out cheaper, and the verdict says so", big?.cheaper === "competitor", big)
  const smallStan = verdict(compare("Stan Store", s.plans, { priceCents: 1500, sales: 10 }))
  check("Stan at ten $15 sales: Storelib Free is cheaper", smallStan?.cheaper === "storelib" && smallStan.storelib.plan === "Free")
}

console.log("\nMetadata and structured data")
{
  const metas = ALTERNATIVES.map((c) => alternativeMetadata(c) as Any)
  const titles = metas.map((m) => m.title.absolute)
  check("titles are unique and say what the page is", new Set(titles).size === titles.length && ALTERNATIVES.every((c, i) => titles[i].includes(c.name) && titles[i].includes("Storelib")))
  check("titles fit in a search result (70 characters or fewer)", titles.every((t: string) => t.length <= 70), titles.filter((t: string) => t.length > 70))
  const descs = metas.map((m) => m.description)
  check("descriptions are unique and between 70 and 170 characters", new Set(descs).size === descs.length && descs.every((d: string) => d.length >= 70 && d.length <= 170), descs.map((d: string) => d.length))
  check("canonical is the absolute address of the page", ALTERNATIVES.every((c, i) => metas[i].alternates.canonical === `https://storelib.com/alternatives/${c.slug}`))
  check("og:url and the X card match", metas.every((m) => m.openGraph.url === m.alternates.canonical && m.twitter.card === "summary_large_image"))
  const hub = hubMetadata() as Any
  check("the hub has its own title and canonical", hub.alternates.canonical === "https://storelib.com/alternatives" && !titles.includes(hub.title.absolute))

  for (const c of ALTERNATIVES) {
    const ld = JSON.parse(JSON.stringify(alternativeJsonLd(c))) as Any
    const types = ld["@graph"].map((n: Any) => n["@type"])
    check(`${c.name}: WebPage and BreadcrumbList once each, no FAQPage`, ["WebPage", "BreadcrumbList"].every((t) => types.filter((x: string) => x === t).length === 1) && !types.includes("FAQPage"))
    check(`${c.name}: the WebPage carries dateModified`, ld["@graph"][0].dateModified === c.updated)
    const crumbs = ld["@graph"].find((n: Any) => n["@type"] === "BreadcrumbList").itemListElement
    check(`${c.name}: breadcrumbs Storelib > Alternatives > ${c.name}, absolute`, crumbs.length === 3 && crumbs[2].item === `https://storelib.com${alternativePath(c.slug)}` && crumbs.every((x: Any, i: number) => x.position === i + 1))
  }
  const flagged = getAlternative("whop")!.faqs.find((f) => f.flag)!
  check("a flagged answer reads its off answer while the switch is off", resolveFaqs([flagged], ALL_OFF)[0].a === flagged.aOff && resolveFaqs([flagged], ALL_ON)[0].a === flagged.a)
  const hubLd = hubJsonLd() as Any
  check("the hub lists every comparison in an ItemList", hubLd["@graph"][0].mainEntity.itemListElement.length === ALTERNATIVES.length)
  check("structured data goes through jsonLdScript", code("components/alternatives/alternative-page.tsx").includes("jsonLdScript(") && code("app/(marketing)/alternatives/page.tsx").includes("jsonLdScript("))
}

console.log("\nRoutes, sitemap, IndexNow")
{
  const route = code("app/(marketing)/alternatives/[slug]/page.tsx")
  check("pages are statically generated from the list, anything else a 404", route.includes("generateStaticParams") && /dynamicParams = false/.test(route) && route.includes("ALTERNATIVES.map"))
  check("the hub is not dynamic", !/force-dynamic|headers\(\)|cookies\(\)/.test(code("app/(marketing)/alternatives/page.tsx")))
  const sm = code("lib/seo/sitemaps.ts")
  check("the sitemap lists the hub and every page from the same list", sm.includes("${BASE}${HUB_PATH}") && sm.includes("ALTERNATIVES.map((c) => ({ url: `${BASE}${alternativePath(c.slug)}`"))
  const all = alternativesAddresses()
  check("IndexNow addresses: every page and the hub", all.length === ALTERNATIVES.length + 1 && all.includes("https://storelib.com/alternatives"))
  check("  only the named pages when some are named, unknown slugs dropped", JSON.stringify(alternativesAddresses("gumroad", "nope")) === JSON.stringify(["https://storelib.com/alternatives/gumroad", "https://storelib.com/alternatives"]))
  check("  the announce route is behind CRON_SECRET", code("app/api/seo/announce-alternatives/route.ts").includes('requireBearerSecret(request, "CRON_SECRET")'))
  check("/alternatives is a reserved first segment (no creator can take it)", RESERVED_ROOT_SEGMENTS.includes("alternatives") && (WEB_ONLY_SEGMENTS as readonly string[]).includes("alternatives"))
  check("  and in the proxy's frame list and native gate", /"alternatives"/.test(code("proxy.ts")) && /NATIVE_BLOCKED = \[[^\]]*"\/alternatives"/.test(code("proxy.ts")))
}

console.log("\nLinks into and out of the pages")
{
  check("the header draws on /alternatives and links Compare", code("components/marketing/conditional-header.tsx").includes('p.startsWith("/alternatives/")') && code("components/platform/platform-header-client.tsx").includes('href: "/alternatives", label: "Compare"'))
  check("the phone menu has Compare", /href="\/alternatives"[\s\S]{0,300}<span>Compare<\/span>/.test(code("components/platform/platform-header-client.tsx")))
  check("the footer links Compare and draws on these pages", code("components/marketing/footer.tsx").includes('{ label: "Compare", href: "/alternatives" }') && code("components/marketing/conditional-footer.tsx").includes('pathname.startsWith("/alternatives/")'))
  check("/pricing carries the Compare Storelib line", code("app/(marketing)/pricing/page.tsx").includes("<CompareStrip />") && code("components/alternatives/compare-strip.tsx").includes("Compare Storelib"))
  const gum = getAlternative("gumroad")!
  check("the Gumroad page names the importer only if its route exists", !gum.importer || existsSync(join(process.cwd(), "app/app/products/import/gumroad/page.tsx")))
}

console.log("\nSign up links keep the visit's own tags")
{
  check("the plain address: seller sign up, tagged with the page", signupHref("gumroad") === "/signup?intent=sell&src=alternatives-gumroad&ref=alternatives-gumroad")
  check("the hub's source", comparisonSource(null) === "alternatives")
  const h = new URL(signupHref("whop", "?utm_source=news&utm_medium=email&utm_campaign=oct&ref=partner1"), "https://storelib.com")
  check("utm tags carried on, the visitor's own ref kept", h.searchParams.get("utm_source") === "news" && h.searchParams.get("utm_campaign") === "oct" && h.searchParams.get("ref") === "partner1" && h.searchParams.get("src") === "alternatives-whop")
  check("markup in a tag is dropped, not carried", !("utm_source" in incomingTags("?utm_source=<script>")))
  const back = readSignupSource(new URLSearchParams("intent=sell&src=alternatives-gumroad&ref=x&utm_source=y"))
  check("the signup page reads the same tags back", back?.src === "alternatives-gumroad" && back.ref === "x" && back.utm_source === "y")
  check("  and nothing when there are none", readSignupSource(new URLSearchParams("intent=sell")) === null)
  const signup = code("app/(auth)/signup/page.tsx")
  check("signup tells analytics when it opens from a tagged link and when the account exists", signup.includes('trackAlternatives("Signup started"') && signup.includes('trackAlternatives("Signup completed"'))
  const track = code("lib/alternatives/track.ts")
  check("events go through Vercel Web Analytics' track, which the consent banner gates", track.includes('from "@vercel/analytics"') && code("components/cookie-consent-banner.tsx").includes("consent?.analytics === true"))
}

console.log("\nRendered: a comparison page")
for (const c of ALTERNATIVES) {
  const html = renderToStaticMarkup(createElement(AlternativePage, { c, flags: ALL_OFF }))
  const headings = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]))
  check(`${c.name}: one h1, and no heading skips a level`, headings.filter((h) => h === 1).length === 1 && headings.every((h, i) => i === 0 || h <= headings[i - 1] + 1), headings)
  check(`${c.name}: every source listed with its date`, c.sources.every((s) => html.includes(`id="source-${s.id}"`)) && html.includes("checked on"))
  check(`${c.name}: the disclaimer is on the page`, html.includes("data-alternatives-disclaimer") && html.includes("not affiliated"))
  check(`${c.name}: the calculator renders its table on the server`, html.includes("data-fee-calculator") && html.includes("Storelib Free") && html.includes("data-calculator-verdict"))
  check(`${c.name}: every input has a label`, [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].every((m) => html.includes(`for="${m[1]}"`)))
  check(`${c.name}: images have alt text`, [...html.matchAll(/<img[^>]*>/g)].every((m) => /alt="[^"]+"/.test(m[0])))
  check(`${c.name}: sign up links point at /signup with the page's source`, html.includes(`href="/signup?intent=sell&amp;src=alternatives-${c.slug}`))
  check(`${c.name}: every FAQ is in the page`, resolveFaqs(c.faqs, ALL_OFF).every((f) => html.includes(f.q.replace(/'/g, "&#x27;"))))
  check(`${c.name}: internal links to pricing and the hub`, html.includes('href="/pricing"') && html.includes('href="/alternatives"'))
}
{
  const off = renderToStaticMarkup(createElement(AlternativePage, { c: getAlternative("whop")!, flags: ALL_OFF }))
  const on = renderToStaticMarkup(createElement(AlternativePage, { c: getAlternative("whop")!, flags: ALL_ON }))
  check("a switch that is off: its feature is Not offered today and its screen is not shown", off.includes("Not offered today") && !off.includes("slide-community") && on.includes("slide-community"))
  const gum = renderToStaticMarkup(createElement(AlternativePage, { c: getAlternative("gumroad")!, flags: ALL_OFF }))
  check("the Gumroad page links the importer", gum.includes('href="/app/products/import/gumroad"'))
}

console.log("\nRendered: the hub")
{
  const groups = renderToStaticMarkup(createElement(HubGroups, { list: ALTERNATIVES, flags: ALL_ON }))
  check("every comparison is in a group, in the server markup", ALTERNATIVES.every((c) => groups.includes(`href="${alternativePath(c.slug)}"`)))
  check("  grouped by need: downloads, link in bio, communities, a full store", ["digital-products", "link-in-bio", "communities", "online-store"].every((n) => groups.includes(`data-need="${n}"`)))
  const matrix = renderToStaticMarkup(createElement(HubMatrix, { list: ALTERNATIVES, flags: ALL_ON }))
  check("the matrix has a column for Storelib and each platform", ALTERNATIVES.every((c) => matrix.includes(`>${c.name}</a></th>`)) && matrix.includes(">Storelib</th>"))
  check("  a row a page does not compare says so, never a guess", matrix.includes("Not compared"))
  const off = renderToStaticMarkup(createElement(HubMatrix, { list: ALTERNATIVES, flags: ALL_OFF }))
  check("  a Storelib feature behind a switch that is off reads Not offered today", off.includes("Not offered today"))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
