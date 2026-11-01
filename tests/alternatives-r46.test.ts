/**
 * ===========================================================================
 *  ROUND 46: PAYHIP, KAJABI, PODIA AND SKOOL ON THE COMPARISON PAGES
 * ===========================================================================
 * EVIDENCE   every claim on the four new pages names a source on the
 *            competitor's own site, checked in October 2026, or says the
 *            sources disagree with a note; a plan's figures are the ones the
 *            pricing pages printed on the day checked.
 * SUMS       the calculator charges each plan by its published rule:
 *            Payhip's 5%, 2% and 0% plus Stripe, Kajabi's 0% plus Kajabi
 *            Payments, Podia's 5% on Mover only, Skool's 10% + 30¢ and
 *            2.9% + 30¢ (3.9% + 30¢ over $899) with processing included.
 * FAIR       each page says where the other platform is better, and every
 *            Storelib claim names code that exists.
 * WIRING     the hub (its need groups and its matrix), the sitemap, the /sell
 *            pages' related links, the extra moving help articles.
 * COPY       no em dash, none of the banned words, never "passive income".
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { stripComments } from "./_source"
import { ALTERNATIVES, alternativePath, getAlternative } from "@/lib/alternatives"
import { alternativeMetadata, HUB_DESCRIPTION, hubMetadata, type Flags } from "@/lib/alternatives/seo"
import { compare, competitorCost, perSaleCents, planFeeRate, storelibCost, verdict } from "@/lib/alternatives/calculator"
import { STORELIB } from "@/lib/alternatives/storelib"
import { helpLink } from "@/lib/marketing/help-links"
import { monthYear } from "@/lib/marketing/facts"
import { USE_CASES, useCasePath, useCasesFor } from "@/lib/marketing/use-cases"
import { MONTHLY_EMAILS } from "@/lib/email-campaigns/limits"
import { AlternativePage } from "@/components/alternatives/alternative-page"
import { HubGroups, HubMatrix, NEEDS } from "@/components/alternatives/hub-sections"
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
const NEW = ["payhip", "kajabi", "podia", "skool"] as const
const OWN_SITE: Record<(typeof NEW)[number], RegExp> = {
  payhip: /^https:\/\/payhip\.com\//,
  kajabi: /^https:\/\/(www|help)\.kajabi\.com\//,
  podia: /^https:\/\/(www|help)\.podia\.com\//,
  skool: /^https:\/\/(www|help)\.skool\.com\//,
}
const page = (slug: string): Competitor => {
  const c = getAlternative(slug)
  if (!c) throw new Error(`no page ${slug}`)
  return c
}
const plan = (slug: string, id: string) => {
  const p = page(slug).plans.find((x) => x.id === id)
  if (!p) throw new Error(`no plan ${slug}:${id}`)
  return p
}
function claimsOf(c: Competitor): (Claim | CompetitorCell)[] {
  return [...c.strengths, ...c.limits, ...c.whenToStay, ...c.pricingNotes, ...c.plans.map((p) => p.claim), ...c.features.map((f) => f.competitor)]
}

console.log("\nThe four pages are in the list")
{
  const slugs = ALTERNATIVES.map((c) => c.slug)
  check("Payhip, Kajabi, Podia and Skool are listed, after the first five", NEW.every((s) => slugs.includes(s)) && slugs.indexOf("payhip") > slugs.indexOf("shopify"), slugs)
  check("each has a file of its own and an import in the list", NEW.every((s) => existsSync(join(process.cwd(), `lib/alternatives/competitors/${s}.ts`)) && code("lib/alternatives/index.ts").includes(`./competitors/${s}"`)))
}

console.log("\nEvery claim is sourced on the competitor's own site and dated")
for (const slug of NEW) {
  const c = page(slug)
  check(`${c.name}: every source is ${c.name}'s own page`, c.sources.every((s) => OWN_SITE[slug].test(s.url) && s.publisher === c.name), c.sources.filter((s) => !OWN_SITE[slug].test(s.url)).map((s) => s.url))
  check(`${c.name}: every source was checked in October 2026`, c.sources.every((s) => /^2026-10-\d{2}$/.test(s.checkedOn) && monthYear(s.checkedOn) === "October 2026"))
  const ids = new Set(c.sources.map((s) => s.id))
  const bad = claimsOf(c).filter((x) => x.sources.length === 0 || x.sources.some((id) => !ids.has(id)) || (x.status !== "verified" && !x.note))
  check(`${c.name}: each claim cites at least one listed source, a disagreement carries its note`, bad.length === 0, bad)
  check(`${c.name}: nothing is marked unverified: a fact that could not be confirmed is left out`, claimsOf(c).every((x) => x.status !== "unverified" && !("value" in x && x.value === "unknown")))
  check(`${c.name}: the page was updated on the day it was checked`, c.updated === c.sources.map((s) => s.checkedOn).sort().at(-1))
  const html = renderToStaticMarkup(createElement(AlternativePage, { c, flags: ALL_ON }))
  check(`${c.name}: the page prints Checked October 2026 and links ${c.name}'s pricing page`, html.includes("Checked October 2026 on") && html.includes(`href="${c.sources[0].url}"`))
}

console.log("\nPlan figures are the ones the pricing pages printed")
{
  const p = (slug: string, id: string) => plan(slug, id)
  check("Payhip: Free $0 at 5%, Plus $29 at 2%, Pro $99 at 0%", p("payhip", "free").monthlyCents === 0 && p("payhip", "free").fee.percent === 5 && p("payhip", "plus").monthlyCents === 2900 && p("payhip", "plus").fee.percent === 2 && p("payhip", "pro").monthlyCents === 9900 && p("payhip", "pro").fee.percent === 0)
  check("  no fixed part on Payhip's cut", page("payhip").plans.every((x) => x.fee.fixedCents === 0))
  check("Kajabi: $179, $249, $499 billed monthly; $143, $199, $399 yearly; no revenue share", [["basic", 17900, 14300], ["growth", 24900, 19900], ["pro", 49900, 39900]].every(([id, m, y]) => p("kajabi", id as string).monthlyCents === m && p("kajabi", id as string).yearlyMonthlyCents === y && p("kajabi", id as string).fee.percent === 0))
  check("  Kajabi Payments in the US: 2.9%, 2.8%, 2.7%, each + 30¢", [["basic", 2.9], ["growth", 2.8], ["pro", 2.7]].every(([id, r]) => p("kajabi", id as string).processing?.percent === r && p("kajabi", id as string).processing?.fixedCents === 30))
  check("Podia: $49, $99, $179 billed monthly; $42, $84, $150 yearly", [["mover", 4900, 4200], ["shaker", 9900, 8400], ["earthquaker", 17900, 15000]].every(([id, m, y]) => p("podia", id as string).monthlyCents === m && p("podia", id as string).yearlyMonthlyCents === y))
  check("  5% on Mover only", p("podia", "mover").fee.percent === 5 && p("podia", "shaker").fee.percent === 0 && p("podia", "earthquaker").fee.percent === 0)
  check("Skool: Hobby $9 at 10% + 30¢, Pro $99 at 2.9% + 30¢, 3.9% + 30¢ over $899", p("skool", "hobby").monthlyCents === 900 && p("skool", "hobby").fee.percent === 10 && p("skool", "hobby").fee.fixedCents === 30 && p("skool", "pro").monthlyCents === 9900 && p("skool", "pro").fee.percent === 2.9 && p("skool", "pro").feeAbove?.overCents === 89900 && p("skool", "pro").feeAbove?.fee.percent === 3.9)
  check("  Skool's plans say the pricing page and the help article disagree on the 30¢", page("skool").plans.every((x) => x.claim.status === "conflicting" && /30¢/.test(x.claim.note ?? "")))
  check("  Skool's processing is included in its fee, not unknown", page("skool").plans.every((x) => x.processing === null && x.processingKnown))
}

console.log("\nThe calculator charges each plan by its published rule")
{
  const pay = competitorCost("Payhip", plan("payhip", "free"), { priceCents: 1500, sales: 40 })
  check("Payhip Free, 40 x $15: 5% is $30, Stripe 2.9% + 30¢ is $29.40, no plan", pay.planCents === 0 && pay.feeCents === 3000 && pay.processingCents === (44 + 30) * 40, pay)
  const plus = competitorCost("Payhip", plan("payhip", "plus"), { priceCents: 1500, sales: 40 })
  check("Payhip Plus: $29 and 2% ($12)", plus.planCents === 2900 && plus.feeCents === 1200)
  const kb = competitorCost("Kajabi", plan("kajabi", "basic"), { priceCents: 4900, sales: 40 })
  check("Kajabi Basic, 40 x $49: $179 plan, no cut, Kajabi Payments $68.80", kb.planCents === 17900 && kb.feeCents === 0 && kb.processingCents === (142 + 30) * 40 && kb.totalCents === 17900 + 6880, kb)
  const kp = competitorCost("Kajabi", plan("kajabi", "pro"), { priceCents: 4900, sales: 40 })
  check("Kajabi Pro: 2.7% + 30¢ ($1.62 a sale)", kp.processingCents === (132 + 30) * 40)
  const mv = competitorCost("Podia", plan("podia", "mover"), { priceCents: 2900, sales: 25 })
  check("Podia Mover, 25 x $29: $49 plan, 5% ($1.45 a sale), Stripe $1.14 a sale", mv.planCents === 4900 && mv.feeCents === 145 * 25 && mv.processingCents === 114 * 25, mv)
  const hob = competitorCost("Skool", plan("skool", "hobby"), { priceCents: 900, sales: 1 })
  check("Skool Hobby, one $9 payment: $1.20, so $7.80 paid out, as Skool's own example says", hob.feeCents === 120 && 900 - hob.feeCents === 780 && hob.processingCents === 0 && !hob.totalExcludesProcessing, hob)
  const pro9 = competitorCost("Skool", plan("skool", "pro"), { priceCents: 900, sales: 1 })
  check("Skool Pro, one $9 payment: 56¢, $8.44 paid out (Skool says $8.4)", pro9.feeCents === 56 && 900 - pro9.feeCents === 844, pro9.feeCents)
  const pro999 = competitorCost("Skool", plan("skool", "pro"), { priceCents: 99900, sales: 1 })
  check("Skool Pro, one $999 payment: 3.9% + 30¢ = $39.26, $959.74 paid out, as Skool's own example says", pro999.feeCents === 3926 && 99900 - pro999.feeCents === 95974, pro999.feeCents)
  check("  the line: $899 pays 2.9% + 30¢, $899.01 pays 3.9% + 30¢", planFeeRate(plan("skool", "pro"), 89900).percent === 2.9 && planFeeRate(plan("skool", "pro"), 89901).percent === 3.9)
  check("  a plan with no line always pays its own rate", planFeeRate(plan("skool", "hobby"), 1_000_000).percent === 10 && planFeeRate({ fee: { percent: 1, fixedCents: 0 } }, 5_000_00).percent === 1)
  check("  perSaleCents never takes more than the sale", perSaleCents(20, { percent: 10, fixedCents: 30 }) === 20)
  const free = storelibCost("free", { priceCents: 900, sales: 1 })
  check("Storelib Free on the same $9: its fee and Stripe's, from checkout's own function", free.feeCents + (free.processingCents ?? 0) === free.totalCents)
}

console.log("\nThe verdict says who is cheaper, either way")
{
  const v = (slug: string, priceCents: number, sales: number) => verdict(compare(page(slug).name, page(slug).plans, { priceCents, sales }))
  const pay = v("payhip", 1500, 40)
  check("Payhip at its defaults is cheaper than Storelib, and the verdict says so", pay?.cheaper === "competitor" && pay.competitor.plan === "Free Forever" && pay.basis === "total", pay)
  const kaj = v("kajabi", 4900, 40)
  check("Kajabi at 40 x $49: Storelib is cheaper", kaj?.cheaper === "storelib", kaj)
  const kajBig = v("kajabi", 20000, 400)
  check("Kajabi at 400 x $200: Kajabi is cheaper", kajBig?.cheaper === "competitor", kajBig)
  const pod = v("podia", 2900, 25)
  check("Podia at 25 x $29: Storelib Free is cheaper", pod?.cheaper === "storelib", pod)
  const podBig = v("podia", 10000, 300)
  check("Podia at 300 x $100: Podia is cheaper", podBig?.cheaper === "competitor", podBig)
  const sk = v("skool", 2900, 40)
  check("Skool at 40 x $29: judged on the whole month, processing included on both", sk?.basis === "total", sk)
  const skBig = v("skool", 5000, 1000)
  check("Skool at 1,000 x $50: Skool Pro is cheaper", skBig?.cheaper === "competitor" && skBig.competitor.plan === "Pro", skBig)
}

console.log("\nFair: where the other platform is better, said plainly")
{
  const words = (slug: string) => JSON.stringify([page(slug).whenToStay, page(slug).strengths, page(slug).faqs, page(slug).storelibLimits])
  check("Payhip: handles EU/UK VAT and US sales tax, says reseller, not a claim Storelib does", /VAT/.test(words("payhip")) && /reseller/.test(JSON.stringify(page("payhip"))) && /not a merchant of record/.test(words("payhip")))
  check("Payhip: its lower cut is said to be lower", /On fees per sale, yes/.test(words("payhip")))
  check("Kajabi: courses and email tooling, unlimited emails, against Storelib's real monthly cap", /cohort courses/i.test(words("kajabi")) && /Unlimited marketing emails/.test(words("kajabi")) && words("kajabi").includes(MONTHLY_EMAILS.free.toLocaleString("en-US")) && words("kajabi").includes(MONTHLY_EMAILS.growth.toLocaleString("en-US")))
  check("Podia: quizzes, certificates, drip lessons and coaching are Podia's", /quizzes, certificates and drip lessons/.test(words("podia")) && /no quizzes, certificates or drip/.test(words("podia")))
  check("Skool: points, levels and leaderboards, and merchant of record", /points, levels and leaderboards/i.test(words("skool")) && /merchant of record/.test(words("skool")))
  for (const slug of NEW) {
    const c = page(slug)
    check(`${c.name}: at least three reasons to stay and three Storelib limits`, c.whenToStay.length >= 3 && c.storelibLimits.length >= 3)
    const missing = [...c.whyStorelib, ...c.storelibStrengths, ...c.storelibLimits].map((p) => p.code).concat(c.features.map((f) => f.storelib.code)).filter((p) => !existsSync(join(process.cwd(), p)))
    check(`${c.name}: every Storelib claim names code that exists`, missing.length === 0, missing)
    check(`${c.name}: Storelib's prices and fees are read from the code`, JSON.stringify(c).includes(STORELIB.freeFee) && !/\b5% \+ \$0\.25\b/.test(read(`lib/alternatives/competitors/${slug}.ts`)))
  }
  const off = renderToStaticMarkup(createElement(AlternativePage, { c: page("skool"), flags: ALL_OFF }))
  check("Skool with communities off: no Storelib community is promised", off.includes("Not offered today") && !off.includes("Your community, your store") && off.includes("Communities are not offered on Storelib today"))
}

console.log("\nUnique metadata")
{
  const metas = ALTERNATIVES.map((c) => alternativeMetadata(c) as Any)
  const titles = metas.map((m) => m.title.absolute as string)
  const descs = metas.map((m) => m.description as string)
  check("every comparison title is unique, names its platform and Storelib, 70 characters or fewer", new Set(titles).size === titles.length && ALTERNATIVES.every((c, i) => titles[i].includes(c.name) && titles[i].includes("Storelib")) && titles.every((t) => t.length <= 70), titles.filter((t) => t.length > 70))
  check("every description is unique and 70 to 170 characters", new Set(descs).size === descs.length && descs.every((d) => d.length >= 70 && d.length <= 170), descs.map((d) => d.length))
  check("each new page has its own h1", new Set(ALTERNATIVES.map((c) => c.seo.h1)).size === ALTERNATIVES.length)
  check("the hub's description still fits with nine platforms", HUB_DESCRIPTION.length >= 70 && HUB_DESCRIPTION.length <= 170 && (hubMetadata() as Any).description === HUB_DESCRIPTION, HUB_DESCRIPTION.length)
  const intros = ALTERNATIVES.map((c) => c.intro[0])
  check("no two pages open with the same paragraph", new Set(intros).size === intros.length)
}

console.log("\nThe sitemap, the hub and the /sell pages")
{
  /* pagesSitemap reads platform switches from the database, so its source is checked: it maps the very list the four pages are in. */
  const sm = code("lib/seo/sitemaps.ts")
  check("the pages sitemap lists every page of the list, each with its updated date", sm.includes("...ALTERNATIVES.map((c) => ({ url: `${BASE}${alternativePath(c.slug)}`, lastModified: c.updated }))"))
  check("  and the hub's date is the newest page's, so it moved to the day these were added", sm.includes("newestOf(...ALTERNATIVES.map((c) => c.updated))") && NEW.every((s) => ALTERNATIVES.some((c) => c.slug === s && c.updated === "2026-10-31")))
  const groups = renderToStaticMarkup(createElement(HubGroups, { list: ALTERNATIVES, flags: ALL_ON }))
  const inGroup = (need: string, slug: string) => {
    const at = groups.indexOf(`data-need="${need}"`)
    const next = groups.indexOf("data-need=", at + 1)
    return at >= 0 && groups.slice(at, next < 0 ? undefined : next).includes(`href="${alternativePath(slug)}"`)
  }
  check("hub: Payhip, Kajabi and Podia under downloads and courses", inGroup("digital-products", "payhip") && inGroup("digital-products", "kajabi") && inGroup("digital-products", "podia"))
  check("hub: Skool, Kajabi and Podia under paid communities, Skool nowhere else", inGroup("communities", "skool") && inGroup("communities", "kajabi") && inGroup("communities", "podia") && !inGroup("digital-products", "skool"))
  check("every need group names a known category", NEEDS.every((n) => ALTERNATIVES.some((c) => c.categories.includes(n.id))))
  const matrix = renderToStaticMarkup(createElement(HubMatrix, { list: ALTERNATIVES, flags: ALL_ON }))
  check("matrix: a column for each new platform", NEW.every((s) => matrix.includes(`>${page(s).name}</a></th>`)))
  check("matrix: Community and Sales tax rows", matrix.includes(">Community</th>") && matrix.includes(">Sales tax and VAT</th>"))
  const rows = [...matrix.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]).slice(1)
  const cols = 2 + ALTERNATIVES.length
  check("matrix: every row has a cell for every platform", rows.every((r) => (r.match(/<t[hd][ >]/g) ?? []).length === cols), rows.map((r) => (r.match(/<t[hd][ >]/g) ?? []).length))
  const skoolCol = ALTERNATIVES.findIndex((c) => c.slug === "skool")
  const skoolDigital = rows.find((r) => r.includes(">Digital products</th>"))!.match(/<td[\s\S]*?<\/td>/g)![skoolCol + 1]
  check("matrix: a row Skool's page does not compare reads Not compared", skoolDigital.includes("Not compared"), skoolDigital)
  check("matrix: Skool's disagreeing fee reads Sources disagree", rows.find((r) => r.includes(">Fee per sale</th>"))!.match(/<td[\s\S]*?<\/td>/g)![skoolCol + 1].includes("Sources disagree"))
  check("matrix is wide enough for every column", /minWidth/.test(code("components/alternatives/hub-sections.tsx")))
  for (const slug of NEW) {
    const uses = useCasesFor(slug)
    check(`${page(slug).name}: named by a /sell page, and the page links it`, uses.length > 0 && renderToStaticMarkup(createElement(AlternativePage, { c: page(slug), flags: ALL_ON })).includes(`href="${useCasePath(uses[0].slug)}"`))
  }
  check("/sell/online-courses links Kajabi and Podia, /sell/communities Skool, /sell/digital-products Payhip", USE_CASES.find((u) => u.slug === "online-courses")!.alternatives.includes("kajabi") && USE_CASES.find((u) => u.slug === "online-courses")!.alternatives.includes("podia") && USE_CASES.find((u) => u.slug === "communities")!.alternatives.includes("skool") && USE_CASES.find((u) => u.slug === "digital-products")!.alternatives.includes("payhip"))
  check("Skool still links a /sell page while communities is off", useCasesFor("skool").some((u) => !u.flag))
  check("the footer lists only the hub, so it is left alone", code("components/marketing/footer.tsx").includes('{ label: "Compare", href: "/alternatives" }') && !NEW.some((s) => code("components/marketing/footer.tsx").includes(`/alternatives/${s}`)))
}

console.log("\nMoving to Storelib: the extra Help Center articles are real")
for (const slug of NEW) {
  const c = page(slug)
  const extra = Object.values(c.movingHelp ?? {}).flat()
  check(`${c.name}: each extra article is a Help Center article`, extra.every((h) => !!helpLink(h)), extra)
  const html = renderToStaticMarkup(createElement(AlternativePage, { c, flags: ALL_ON }))
  check(`${c.name}: and the page links it at help.storelib.com`, extra.every((h) => html.includes(`href="${helpLink(h)!.href}"`) && helpLink(h)!.href.startsWith("https://help.storelib.com/")))
  check(`${c.name}: products, customers and domain each say what moves`, Object.values(c.moving).every((t) => t.length > 40))
}

console.log("\nRendered: the tiered fee is printed")
{
  const html = renderToStaticMarkup(createElement(AlternativePage, { c: page("skool"), flags: ALL_ON }))
  check("Skool Pro's line says 3.9% + 30¢ on a sale over $899", html.includes("3.9% + 30¢ on a sale over $899"))
  check("Skool's processing reads included", html.includes("included in Skool&#x27;s fee"))
}

console.log("\nCopy: no em dash, no banned words, no passive income")
{
  const banned = /\b(unlock(s|ed|ing)?|elevate[sd]?|seamless(ly)?|powerful|effortless(ly)?|supercharge[sd]?|transform(s|ed|ing|ative)?|passive income|revolutioni[sz]e|game[- ]chang)/i
  for (const slug of NEW) {
    const text = JSON.stringify(page(slug)) + code(`lib/alternatives/competitors/${slug}.ts`)
    check(`${page(slug).name}: no em or en dash`, !text.includes("—") && !text.includes("–"))
    check(`${page(slug).name}: none of the banned words`, !banned.test(text), text.match(banned)?.[0])
    const html = renderToStaticMarkup(createElement(AlternativePage, { c: page(slug), flags: ALL_ON })).replace(/class="[^"]*"/g, "")
    check(`${page(slug).name}: the rendered page has none either`, !banned.test(html) && !html.includes("—"), html.match(banned)?.[0])
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
