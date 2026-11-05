/**
 * ===========================================================================
 *  ROUND 45, CONTENT: WHAT STORELIB IS, READ FROM THE CODE, ON EVERY PAGE
 * ===========================================================================
 * FACTS      lib/marketing/facts: prices equal lib/billing/plans, fees equal
 *            the fee rules checkout charges with, a worked example equals
 *            lib/billing/fee-calculator's own preview, every fact names a file
 *            that exists, every help link is a real article.
 * PAGES      /sell/<use case>, /features and the comparison pages: unique
 *            titles, descriptions and absolute canonicals, one h1, no heading
 *            skipped, WebPage with dateModified and a BreadcrumbList, no
 *            FAQPage, sign up links that carry the page's source.
 * WIRING     the sitemap, the footer, the header and the app's native gate
 *            know the /sell pages.
 * COPY       no em dash, none of the banned words, never "passive income".
 * VIDEOS     the registry's validator and the VideoObject builder.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import { ALL_FACTS, FACTS_UPDATED, FEES, LIMITATIONS, PLANS, PLAN_CODE_ID, PRODUCT_TYPES, monthYear, proBreakEvenDollars, saleBreakdown, storelibSummary } from "@/lib/marketing/facts"
import { OFFERED_PLANS, PRO_PRICE_CENTS } from "@/lib/billing/plans"
import { getFeeDescription, getFeePreview } from "@/lib/billing/fee-calculator"
import { codeDefaultFeeConfig } from "@/lib/payments/fees/defaults"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS } from "@/lib/storage/plans"
import { STORELIB, proBreakEvenDollars as altBreakEven } from "@/lib/alternatives/storelib"
import { USE_CASES, SUPPORTED_TYPES, getUseCase, useCasePath, useCaseSource, useCasesFor } from "@/lib/marketing/use-cases"
import { SELL_PAGES } from "@/lib/marketing/sell-links"
import { useCaseJsonLd, useCaseMetadata } from "@/lib/marketing/use-case-seo"
import { FEATURES_DESCRIPTION, FEATURES_TITLE, featuresJsonLd } from "@/lib/marketing/features-seo"
import { helpLink } from "@/lib/marketing/help-links"
import { MOVING_HELP } from "@/lib/alternatives/moving"
import { ALTERNATIVES, alternativePath } from "@/lib/alternatives"
import { alternativeJsonLd, alternativeMetadata, hubMetadata, type Flags } from "@/lib/alternatives/seo"
import { readSignupSource, signupHrefFor } from "@/lib/alternatives/attribution"
import { VIDEOS, clock, durationSeconds, videoForPath, videoJsonLd, videoProblems, type Video } from "@/lib/marketing/videos"
import { UseCasePage } from "@/components/marketing/use-case-page"
import { AlternativePage } from "@/components/alternatives/alternative-page"
import { RelatedVideo } from "@/components/marketing/related-video"
import { SaleExample } from "@/components/marketing/sale-example"

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
const exists = (p: string) => existsSync(join(process.cwd(), p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const ALL_ON: Flags = { communities: true, explore: true, physical: true }
const ALL_OFF: Flags = { communities: false, explore: false, physical: false }

console.log("\nFacts: prices and fees equal the code that charges them")
{
  const offeredPro = OFFERED_PLANS.find((p) => p.id === PLAN_CODE_ID.pro)!
  check("Pro's price is lib/billing/plans PRO_PRICE_CENTS", PLANS.pro.monthlyCents === PRO_PRICE_CENTS && PLANS.pro.monthlyCents === offeredPro.priceCents && PLANS.pro.price === offeredPro.price)
  check("Free costs nothing a month", PLANS.free.monthlyCents === 0 && OFFERED_PLANS.find((p) => p.id === "free")!.priceCents === 0)
  check("the plan names are the ones a person reads", PLANS.free.name === "Free" && PLANS.pro.name === offeredPro.name)
  const cfg = codeDefaultFeeConfig()
  check("rates equal the fee rules checkout falls back to", PLANS.free.rate === cfg.freeStandardRate && PLANS.pro.rate === cfg.paidStandardRate && PLANS.free.smallOrderRate === cfg.freeMicroRate && PLANS.pro.smallOrderRate === cfg.paidMicroRate, cfg)
  check("the $0.25 and the $4.00 line are the USD rule", FEES.fixedCents === CURRENCY_FEE_RULES.USD.fixedFeeMinor && FEES.smallOrderBelowCents === CURRENCY_FEE_RULES.USD.microThresholdMinor)
  check("the fee as a card says it equals the pricing page's", `${PLANS.free.feeLabel} per sale` === getFeeDescription("free") && `${PLANS.pro.feeLabel} per sale` === getFeeDescription(PLAN_CODE_ID.pro), [PLANS.free.feeLabel, getFeeDescription("free")])
  check("the comparison pages read the same words", STORELIB.freeFee === PLANS.free.feeLabel && STORELIB.proFee === PLANS.pro.feeLabel && STORELIB.proPrice === PLANS.pro.price && altBreakEven() === proBreakEvenDollars())
  for (const id of ["free", "pro"] as const) {
    const code = PLAN_CODE_ID[id]
    check(`${id}: websites, pages, domain from lib/sites/plan; storage and files from lib/storage/plans`, PLANS[id].websites === siteLimits(code).maxSites && PLANS[id].pagesPerWebsite === siteLimits(code).maxPages && PLANS[id].ownDomain === siteLimits(code).customDomain && PLANS[id].filesPerProduct === PLAN_LIMITS[code].maxFilesPerProduct)
  }
  const prices = [0, 1, 100, 299, 399, 400, 999, 1500, 2900, 4000, 14900, 99999]
  for (const currency of ["USD", "EUR", "GBP"]) {
    const bad = prices.flatMap((p) =>
      (["free", "pro"] as const).flatMap((id) => {
        const ours = saleBreakdown(p, id, currency)
        const theirs = getFeePreview(p, PLAN_CODE_ID[id], currency)
        return ours.storelibFeeCents === theirs.platformFeeCents && ours.afterStorelibCents === theirs.sellerReceivesCents ? [] : [{ p, id, ours, theirs }]
      }),
    )
    check(`${currency}: the worked example equals lib/billing/fee-calculator getFeePreview at ${prices.length} prices on both plans`, bad.length === 0, bad[0])
  }
  check("a $29 sale on Free: $1.70 to Storelib, $27.30 left", saleBreakdown(2900, "free").storelibFeeCents === 170 && saleBreakdown(2900, "free").afterStorelibCents === 2730)
  check("a $3 sale pays the small order rate, no $0.25", saleBreakdown(300, "free").tier === "micro" && saleBreakdown(300, "free").storelibFeeCents === Math.round(300 * PLANS.free.smallOrderRate))
}

console.log("\nFacts: each one names code that exists, each help link a real article")
{
  const ids = ALL_FACTS.map((f) => f.id)
  check("fact ids are unique", new Set(ids).size === ids.length)
  const missing = ALL_FACTS.filter((f) => !exists(f.source)).map((f) => `${f.id}: ${f.source}`)
  check("every fact's source path exists", missing.length === 0, missing)
  const badHelp = ALL_FACTS.filter((f) => f.help && !helpLink(f.help)).map((f) => f.help)
  check("every fact's help link is an article", badHelp.length === 0, badHelp)
  check("limitations are said, not hidden: merchant of record, license keys, affiliates, bookings, Stripe's fee", ["mor", "license-keys", "affiliates", "bookings", "stripe-fee"].every((id) => LIMITATIONS.some((f) => f.id === id)))
  check("coaching and bookings are a No, not a feature", PRODUCT_TYPES.find((f) => f.id === "coaching")?.status === "no")
  check("memberships are partial: sold as paid community plans", PRODUCT_TYPES.find((f) => f.id === "memberships")?.status === "partial")
  check("the summary names the plans' prices and fees", storelibSummary().includes(PLANS.pro.price) && storelibSummary().includes(PLANS.free.feeLabel))
  check("  and leaves out what a switch has turned off", !storelibSummary({ communities: false, physical: false }).includes("communities") && !storelibSummary({ physical: false }).includes("physical"))
  check("dates print as Month YYYY", monthYear("2026-10-31") === "October 2026" && /^\d{4}-\d{2}-\d{2}$/.test(FACTS_UPDATED))
}

console.log("\nThe /sell pages: only real uses, each different")
{
  check("the pages and the light list the footer reads agree", JSON.stringify(USE_CASES.map((u) => [u.slug, u.nav, u.flag ?? null])) === JSON.stringify(SELL_PAGES.map((p) => [p.slug, p.nav, "flag" in p ? p.flag : null])))
  check("a page for courses and communities exists only because the product types do", SUPPORTED_TYPES.includes("courses") && SUPPORTED_TYPES.includes("communities"))
  check("the route is static, from the list, anything else a 404", /dynamicParams = false/.test(code("app/(storelib)/(marketing)/sell/[slug]/page.tsx")) && code("app/(storelib)/(marketing)/sell/[slug]/page.tsx").includes("USE_CASES.map") && code("app/(storelib)/(marketing)/sell/[slug]/page.tsx").includes("useCaseOn(u, flags)"))
  check("/sell itself stays the sign up door", exists("app/(storelib)/(auth)/sell/page.tsx") && !exists("app/(storelib)/(marketing)/sell/page.tsx"))
  for (const u of USE_CASES) {
    const badHelp = u.help.filter((h) => !helpLink(h))
    check(`${u.slug}: every help link is a real article`, badHelp.length === 0, badHelp)
    check(`${u.slug}: every fact and limitation it names exists`, u.facts.every((id) => ALL_FACTS.some((f) => f.id === id)) && u.limits.every((id) => LIMITATIONS.some((f) => f.id === id)))
    check(`${u.slug}: every comparison it links exists`, u.alternatives.every((s) => ALTERNATIVES.some((c) => c.slug === s)))
    check(`${u.slug}: its blog links are blog posts`, u.blog.every((b) => /^\/blog\/[a-z0-9-]+$/.test(b.path)))
    check(`${u.slug}: every picture is a file in public/`, u.steps.every((s) => !s.shot || exists(`public${s.shot.src}`)))
    check(`${u.slug}: a walkthrough, examples and at least four questions`, u.steps.length >= 3 && u.examples.length >= 2 && u.faqs.length >= 4)
    check(`${u.slug}: generic examples say they are examples`, u.examples.every((e) => e.href || /^Example:/.test(e.title)))
  }
  const ledes = USE_CASES.map((u) => u.lede)
  const qs = USE_CASES.flatMap((u) => u.faqs.map((f) => f.q))
  check("no two pages share a lede or a question", new Set(ledes).size === ledes.length && new Set(qs).size === qs.length, qs)
  check("comparison pages link the /sell pages that name them", ALTERNATIVES.every((c) => useCasesFor(c.slug).length > 0))
}

console.log("\nEvery new or changed page: its own title, description and canonical")
{
  const metas: { path: string; m: Any }[] = [
    ...USE_CASES.map((u) => ({ path: useCasePath(u.slug), m: useCaseMetadata(u) as Any })),
    ...ALTERNATIVES.map((c) => ({ path: alternativePath(c.slug), m: alternativeMetadata(c) as Any })),
    { path: "/alternatives", m: hubMetadata() as Any },
  ]
  const titleOf = (m: Any) => (typeof m.title === "string" ? m.title : m.title.absolute)
  const titles = [...metas.map((x) => titleOf(x.m)), FEATURES_TITLE]
  const descs = [...metas.map((x) => x.m.description), FEATURES_DESCRIPTION]
  check("titles are unique", new Set(titles).size === titles.length, titles)
  check("titles fit a search result (70 characters or fewer)", titles.every((t) => t.length <= 70), titles.filter((t) => t.length > 70))
  check("descriptions are unique and 70 to 170 characters", new Set(descs).size === descs.length && descs.every((d) => d.length >= 70 && d.length <= 170), descs.map((d) => d.length))
  check("each canonical is the page's own absolute address", metas.every((x) => x.m.alternates.canonical === `https://storelib.com${x.path}`))
  check("Open Graph carries the same address and a picture", metas.every((x) => x.m.openGraph.url === x.m.alternates.canonical && x.m.openGraph.images.length === 1))
  check("/features sets its own, from its layout", /path: FEATURES_PATH/.test(code("app/(storelib)/(marketing)/features/layout.tsx")))
  for (const u of USE_CASES) {
    const ld = useCaseJsonLd(u) as Any
    const types = ld["@graph"].map((n: Any) => n["@type"])
    check(`${u.slug}: WebPage with dateModified and a BreadcrumbList, no FAQPage`, types.includes("WebPage") && types.includes("BreadcrumbList") && !types.includes("FAQPage") && ld["@graph"][0].dateModified === u.updated)
    check(`${u.slug}: breadcrumbs are absolute and end at the page`, ld["@graph"][1].itemListElement.at(-1).item === `https://storelib.com${useCasePath(u.slug)}` && ld["@graph"][1].itemListElement.every((i: Any) => /^https:\/\/storelib\.com/.test(i.item)))
  }
  const f = featuresJsonLd() as Any
  check("/features: WebPage with dateModified", f["@graph"][0]["@type"] === "WebPage" && f["@graph"][0].dateModified === FACTS_UPDATED)
  check("comparison pages: no FAQPage", ALTERNATIVES.every((c) => !JSON.stringify(alternativeJsonLd(c)).includes("FAQPage")))
}

console.log("\nRendered: the /sell pages")
{
  for (const u of USE_CASES) {
    const html = renderToStaticMarkup(createElement(UseCasePage, { u, flags: ALL_ON }))
    const headings = [...html.matchAll(/<h([1-6])/g)].map((m) => Number(m[1]))
    check(`${u.slug}: one h1, no heading skips a level`, headings.filter((h) => h === 1).length === 1 && headings.every((h, i) => i === 0 || h <= headings[i - 1] + 1), headings)
    check(`${u.slug}: sign up carries the page's source`, html.includes(`href="/signup?intent=sell&amp;src=${useCaseSource(u.slug)}`))
    check(`${u.slug}: links pricing and a comparison`, html.includes('href="/pricing"') && u.alternatives.some((s) => html.includes(`href="${alternativePath(s)}"`)))
    const free = saleBreakdown(u.example.priceCents, "free")
    const dollars = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, "")}`
    check(`${u.slug}: the worked example prints checkout's figures`, html.includes(dollars(free.storelibFeeCents)) && html.includes(dollars(free.afterStorelibCents)), [dollars(free.storelibFeeCents), dollars(free.afterStorelibCents)])
    check(`${u.slug}: questions are plain HTML`, u.faqs.every((x) => html.includes(x.q.replace(/'/g, "&#x27;"))) && !html.includes("FAQPage"))
    check(`${u.slug}: images have alt text`, [...html.matchAll(/<img[^>]*>/g)].every((m) => /alt="[^"]+"/.test(m[0])))
    check(`${u.slug}: help links go to the Help Center's own address`, u.help.every((h) => html.includes(helpLink(h)!.href)))
  }
  const src = readSignupSource(new URLSearchParams(signupHrefFor("sell-online-courses").split("?")[1]))
  check("the signup page reads the source back", src?.src === "sell-online-courses" && src.ref === "sell-online-courses")
  check("a page's own source is never markup", signupHrefFor("<x>").includes("src=alternatives"))
  const sale = renderToStaticMarkup(createElement(SaleExample, { priceCents: 2900, what: "a $29 ebook" }))
  check("the sale example names Stripe's fee as separate, not added", /Stripe&#x27;s card processing fee is separate/.test(sale))
}

console.log("\nRendered: the comparison pages")
{
  for (const c of ALTERNATIVES) {
    const html = renderToStaticMarkup(createElement(AlternativePage, { c, flags: ALL_ON }))
    const pricing = c.sources.find((s) => s.id === c.plans[0].claim.sources[0])!
    check(`${c.name}: prices carry a visible Checked <Month YYYY> and the pricing page`, html.includes(`Checked ${monthYear(pricing.checkedOn)} on`) && html.includes(`href="${pricing.url}"`))
    check(`${c.name}: moving products, customers and the domain, each with help articles`, html.includes("data-moving") && Object.values(MOVING_HELP).flat().every((h) => html.includes(helpLink(h)!.href)))
    check(`${c.name}: links a /sell page`, useCasesFor(c.slug).some((u) => html.includes(`href="${useCasePath(u.slug)}"`)))
    check(`${c.name}: questions are plain HTML, no FAQPage`, !html.includes("FAQPage"))
  }
  check("every moving help link is a real article", Object.values(MOVING_HELP).flat().every((h) => !!helpLink(h)))
  check("Linktree's prices are the ones its pricing page shows on the day checked", (() => {
    const l = ALTERNATIVES.find((c) => c.slug === "linktree")!
    const pro = l.plans.find((p) => p.id === "pro")!
    return pro.monthlyCents === 1700 && pro.yearlyMonthlyCents === 1400 && pro.claim.status === "conflicting"
  })())
}

console.log("\nWiring: sitemap, footer, header, the app's native gate")
{
  const sm = code("lib/seo/sitemaps.ts")
  check("the pages sitemap lists the /sell pages from their list, a switched off one left out", sm.includes("useCasesListed()") && sm.includes("USE_CASES.filter((u) => useCaseOn(u, flags))"))
  const footer = code("components/marketing/footer.tsx")
  check("the footer links them, from the light list (no fee tables in its bundle)", footer.includes('from "@/lib/marketing/sell-links"') && !footer.includes("lib/marketing/use-cases") && footer.includes("SELL.map"))
  check("the marketing header and footer draw on /sell/ pages", code("components/marketing/conditional-header.tsx").includes('p.startsWith("/sell/")') && code("components/marketing/conditional-footer.tsx").includes('pathname.startsWith("/sell/")'))
  check("the app's shell sends /sell/ pages to native-start, never /sell itself", /pathname\.startsWith\("\/sell\/"\)\)/.test(code("proxy.ts")) && !/NATIVE_BLOCKED = \[[^\]]*"\/sell"/.test(code("proxy.ts")))
  check("/features links each /sell page and each comparison", code("app/(storelib)/(marketing)/features/page.tsx").includes("useCasePath(uc.slug)") && code("app/(storelib)/(marketing)/features/page.tsx").includes("ALTERNATIVES.map"))
  check("/features is a server page now", !/^"use client"/.test(read("app/(storelib)/(marketing)/features/page.tsx")))
}

console.log("\nCopy: no em dash, no banned words, no passive income")
{
  const banned = /\b(unlock(s|ed|ing)?|elevate[sd]?|seamless(ly)?|powerful|effortless(ly)?|supercharge[sd]?|transform(s|ed|ing|ative)?|passive income|revolutioni[sz]e|game[- ]chang)/i
  const copy: [string, string][] = [
    ["facts", JSON.stringify(ALL_FACTS) + storelibSummary()],
    ["use cases", JSON.stringify(USE_CASES)],
    ["comparisons", JSON.stringify(ALTERNATIVES)],
    ...[
      "components/marketing/use-case-page.tsx",
      "components/marketing/sale-example.tsx",
      "components/marketing/related-video.tsx",
      "components/marketing/video-player.tsx",
      "components/alternatives/alternative-page.tsx",
      "components/alternatives/hub-sections.tsx",
      "app/(storelib)/(marketing)/alternatives/page.tsx",
      "app/(storelib)/(marketing)/features/page.tsx",
      "lib/marketing/features-seo.ts",
      "docs/youtube-videos.md",
      /* Class names are not copy: transition-transform is a CSS utility. */
    ].map((p) => [p, p.endsWith(".md") ? read(p) : code(p).replace(/className=(?:"[^"]*"|\{`[^`]*`\})/g, "")] as [string, string]),
  ]
  for (const [name, text] of copy) {
    check(`${name}: no em or en dash`, !text.includes("—") && !text.includes("–"))
    check(`${name}: none of the banned words`, !banned.test(text), text.match(banned)?.[0])
  }
}

console.log("\nVideos: the registry and its structured data")
{
  /* A path is a page when app/ has a route for it: a static page file, or a slug a generated route lists. */
  const routeExists = (path: string) => {
    if (/^\/alternatives\/[a-z0-9-]+$/.test(path)) return ALTERNATIVES.some((c) => alternativePath(c.slug) === path)
    if (/^\/sell\/[a-z0-9-]+$/.test(path)) return !!getUseCase(path.split("/")[2])
    /* Changed on purpose (r52): Storelib's pages are under app/(storelib), the published websites' root is app/(site). */
    return exists(`app/(storelib)/(marketing)${path === "/" ? "" : path}/page.tsx`)
  }
  const problems = VIDEOS.flatMap((v) => videoProblems(v, routeExists))
  check(`every registered video is valid (${VIDEOS.length} registered)`, problems.length === 0, problems)
  check("  ids are unique", new Set(VIDEOS.map((v) => v.youtubeId)).size === VIDEOS.length)
  check("the route check knows real pages and refuses made up ones", routeExists("/alternatives/gumroad") && routeExists("/sell/digital-products") && routeExists("/features") && !routeExists("/alternatives/nope") && !routeExists("/sell/nope"))

  const sample: Video = {
    youtubeId: "AbCdEfGhIjK",
    title: "Storelib vs Gumroad",
    description: "Fees, features and moving over.",
    uploadDate: "2026-11-04",
    duration: "PT9M12S",
    chapters: [
      { t: 0, label: "What we compare" },
      { t: 95, label: "Fees on a $25 sale" },
      { t: 310, label: "Moving your products" },
    ],
    transcript: "First paragraph.\n\nSecond paragraph.",
    pages: ["/alternatives/gumroad"],
  }
  check("a sample entry passes", videoProblems(sample, routeExists).length === 0, videoProblems(sample, routeExists))
  check("a short id is refused", videoProblems({ ...sample, youtubeId: "abc" }).length > 0)
  check("a date that is not a day is refused", videoProblems({ ...sample, uploadDate: "2026-02-30" }).length > 0 && videoProblems({ ...sample, uploadDate: "Nov 4" }).length > 0)
  check("chapters out of order, or not starting at 0, are refused", videoProblems({ ...sample, chapters: [{ t: 5, label: "a" }] }).length > 0 && videoProblems({ ...sample, chapters: [{ t: 0, label: "a" }, { t: 0, label: "b" }] }).length > 0)
  check("a chapter after the end is refused", videoProblems({ ...sample, chapters: [{ t: 0, label: "a" }, { t: 600, label: "b" }] }).length > 0)
  check("a page that does not exist is refused", videoProblems({ ...sample, pages: ["/alternatives/nope"] }, routeExists).length > 0)
  check("durations and clocks", durationSeconds("PT9M12S") === 552 && durationSeconds("PT1H2M3S") === 3723 && durationSeconds("9:12") === null && clock(95) === "1:35" && clock(3723) === "1:02:03")
  check("videoForPath finds the entry for its page only", videoForPath("/alternatives/gumroad", [sample]) === sample && videoForPath("/alternatives/whop", [sample]) === null)

  const ld = videoJsonLd(sample, "https://storelib.com/alternatives/gumroad") as Any
  check("VideoObject: name, description, thumbnailUrl, uploadDate, embedUrl, contentUrl", ld["@type"] === "VideoObject" && ld.name === sample.title && ld.description === sample.description && ld.thumbnailUrl[0] === "https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg" && ld.uploadDate === "2026-11-04" && ld.embedUrl === "https://www.youtube-nocookie.com/embed/AbCdEfGhIjK" && ld.contentUrl === "https://www.youtube.com/watch?v=AbCdEfGhIjK")
  check("  duration when known", ld.duration === "PT9M12S" && !("duration" in (videoJsonLd({ ...sample, duration: undefined }, "https://storelib.com/x") as Any)))
  check("  a Clip for each chapter, with start, end and a &t= address", ld.hasPart.length === 3 && ld.hasPart.every((c: Any) => c["@type"] === "Clip") && ld.hasPart[1].startOffset === 95 && ld.hasPart[1].endOffset === 310 && ld.hasPart[1].url === "https://www.youtube.com/watch?v=AbCdEfGhIjK&t=95s" && ld.hasPart[2].endOffset === 552 && ld.hasPart[0].url.endsWith("&t=0s"))
  check("  the last Clip has no end when the length is unknown", !("endOffset" in (videoJsonLd({ ...sample, duration: undefined }, "https://storelib.com/x") as Any).hasPart[2]))
  check("  no Clips for fewer than two chapters", !("hasPart" in (videoJsonLd({ ...sample, chapters: [{ t: 0, label: "All" }] }, "https://storelib.com/x") as Any)))
  check("  nothing at all without a required field", videoJsonLd({ ...sample, title: "" }, "x") === null && videoJsonLd({ ...sample, uploadDate: "" }, "x") === null && videoJsonLd({ ...sample, description: " " }, "x") === null)
  check("  only fields Google documents: no transcript in the markup", !("transcript" in ld))

  const none = renderToStaticMarkup(createElement(RelatedVideo, { path: "/alternatives/gumroad", video: null }))
  check("RelatedVideo draws nothing without a video", none === "")
  const html = renderToStaticMarkup(createElement(RelatedVideo, { path: "/alternatives/gumroad", video: sample }))
  check("RelatedVideo: a thumbnail link to YouTube, and no player until pressed", html.includes('href="https://www.youtube.com/watch?v=AbCdEfGhIjK"') && html.includes("hqdefault.jpg") && !html.includes("<iframe") && !/youtube\.com\/iframe_api|www-widgetapi/.test(html))
  check("  chapters as timestamp links", html.includes("&amp;t=95s") && html.includes(">1:35<"))
  check("  the transcript folded in a details element, on the server", /<details[\s\S]*Read the transcript[\s\S]*Second paragraph\.[\s\S]*<\/details>/.test(html))
  check("  its VideoObject, printed safely", html.includes('"@type":"VideoObject"') && html.includes("application/ld+json"))
  check("the pages render RelatedVideo with their own path", code("components/marketing/use-case-page.tsx").includes("<RelatedVideo path={path} />") && code("components/alternatives/alternative-page.tsx").includes("<RelatedVideo path={alternativePath(c.slug)} />"))
  check("the doc says how to add one", exists("docs/youtube-videos.md") && /YouTube Studio/.test(read("docs/youtube-videos.md")))
}

void ALL_OFF
console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
