/**
 * ===========================================================================
 *  HOME'S BANNER: WHICH ANNOUNCEMENTS, WHEN, AND IN WHAT ORDER
 * ===========================================================================
 * lib/home/announcements.ts decides what the banner beside the globe says,
 * from the store's own state. Each rule here is run against fixture states
 * the way Home builds them: the facts Getting started reads
 * (lib/home/progress), the orders it holds and the plan. scripts/check-home-banner.mjs checks the same states in a
 * browser; this checks the rules themselves, edge by edge.
 */
import {
  COUNT_MILESTONES, MAX_ANNOUNCEMENTS, MONEY_MILESTONES, REAL_SAVING_CENTS, RULES,
  ago, announcementsFor, fromFacts, isPaidPlan, money, ordinal, proSaving, salesSummary, salesSummaryFrom, stepsDone,
  type HomeProgress,
} from "../lib/home/announcements"
import { NO_FACTS, homeProgress, nextSetupStep, type ProgressFacts } from "../lib/home/progress"
import type { OrderRow } from "../lib/orders/order-view"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`) }
}

/* The Home cards speak in dollars; the fee engine's charge currency defaults to RON when this is unset. */
process.env.NEXT_PUBLIC_PLATFORM_CURRENCY = "usd"

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0)
const HOUR = 3_600_000
const DAY = 24 * HOUR
let seq = 0
/** One paid order, one basket, `daysAgo` before NOW. */
const order = (daysAgo: number, cents: number, extra: Partial<OrderRow> = {}): OrderRow => {
  seq++
  return {
    id: `o${seq}`,
    product_id: "p1",
    amount_cents: cents,
    status: "completed",
    created_at: new Date(NOW - daysAgo * DAY).toISOString(),
    stripe_session_id: `cs_${seq}`,
    refund_amount_cents: 0,
    ...extra,
  } as OrderRow
}
type Fixture = Partial<Omit<HomeProgress, "sales">> & { orders?: OrderRow[] }
const state = (f: Fixture = {}): HomeProgress => {
  const { orders = [], ...rest } = f
  return {
    plan: "free",
    hasProduct: false,
    hasPayouts: false,
    websitePublished: false,
    hasDomain: false,
    subscribers: 0,
    activeAutomations: 0,
    canShare: true,
    ...rest,
    sales: salesSummary(orders, NOW),
  }
}
const ids = (p: HomeProgress) => announcementsFor(p, NOW).map((a) => a.id)
const find = (p: HomeProgress, id: string) => announcementsFor(p, NOW).find((a) => a.id === id)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** A store that is set up and selling on Free: product, payouts, a website, no domain. */
const SETUP: Fixture = { hasProduct: true, hasPayouts: true, websitePublished: true }

function main() {
  console.log("\nwhere the store is")
  /* "make sure for a new account or profile the announcements in the banner are really good and actually make sense." */
  check("signed up and nothing else: the welcome, then payouts and the first product, then what the builder does",
    same(ids(state()), ["welcome", "payouts", "first-product", "builder-intro"]), ids(state()))
  check("the welcome says the three steps and opens the guide that walks them",
    find(state(), "welcome")?.action === "guide" && /A product, Stripe, then your link\./.test(find(state(), "welcome")!.line))
  check("and it goes once anything is done: a product, or payouts",
    !ids(state({ hasProduct: true })).includes("welcome") && !ids(state({ hasPayouts: true })).includes("welcome") && !ids(state({ hasProduct: true })).includes("builder-intro"))
  check("a product and no payouts: payouts, then the website",
    same(ids(state({ hasProduct: true })), ["payouts", "website"]))
  check("payouts is critical and says checkout is closed once there is a product",
    find(state({ hasProduct: true }), "payouts")?.tone === "critical" && /can't check out/.test(find(state({ hasProduct: true }), "payouts")!.line))
  check("ready and unsold: share the link, then the website",
    same(ids(state({ hasProduct: true, hasPayouts: true })), ["share", "website"]))
  check("share opens the share sheet rather than a page", find(state({ hasProduct: true, hasPayouts: true }), "share")?.action === "share")
  check("no address to share: no share announcement",
    same(ids(state({ hasProduct: true, hasPayouts: true, canShare: false })), ["website"]))
  check("a website and no domain on Free: the domain is a Pro thing",
    ids(state({ ...SETUP, subscribers: 3, activeAutomations: 1 })).includes("domain-pro"))
  check("the same on Pro: connect it",
    same(ids(state({ ...SETUP, plan: "growth", subscribers: 3, activeAutomations: 1, orders: [order(60, 2000)] })), ["domain"]))
  check("a domain connected: neither", !ids(state({ ...SETUP, hasDomain: true })).some((id) => id.startsWith("domain")))

  console.log("\nthe first sale and milestones")
  const firstSale = state({ ...SETUP, orders: [order(1, 2900)] })
  check("the first sale this week comes first after anything critical",
    same(ids(firstSale), ["first-sale", "automations", "newsletter", "domain-pro"]), ids(firstSale))
  check("it names the money and when", find(firstSale, "first-sale")?.line.startsWith("$29, a day ago.") === true, find(firstSale, "first-sale")?.line)
  check("and goes to that order's page", find(firstSale, "first-sale")?.href === `/app/orders/o${seq}`, find(firstSale, "first-sale")?.href)
  check("a first sale more than a week old is not news",
    !ids(state({ ...SETUP, orders: [order(8, 2900)] })).includes("first-sale"))
  check("a sale that came in after the page took its clock is the first sale, just now",
    find(state({ ...SETUP, orders: [order(-0.01, 2900)] }), "first-sale")?.line === "$29, in the last hour. See who bought it.")
  const thousand = state({ ...SETUP, plan: "growth", hasDomain: true, subscribers: 5, activeAutomations: 1, orders: [...Array.from({ length: 38 }, (_, i) => order(9 + i, 2500)), order(3, 2500), order(2.5, 2500), order(2, 2500), order(1, 2500)] })
  check("$1,000 passed this week is a milestone", find(thousand, "milestone")?.title === "You passed $1,000 in sales", find(thousand, "milestone")?.title)
  check("with when and how many", find(thousand, "milestone")?.line === "It happened 2 days ago, across 42 sales.", find(thousand, "milestone")?.line)
  check("passed more than a week ago, it is not",
    !ids(state({ ...SETUP, orders: [...Array.from({ length: 42 }, (_, i) => order(8 + i, 2500))] })).includes("milestone"))
  const tenth = state({ ...SETUP, orders: [...Array.from({ length: 9 }, (_, i) => order(20 + i, 500)), order(1, 500)] })
  check("a 10th sale this week, under $100 in all, is a count milestone",
    find(tenth, "milestone")?.title === "Your 10th sale", find(tenth, "milestone")?.title)
  check("the first sale passing $100 on its own is the first sale, not a milestone",
    !ids(state({ ...SETUP, orders: [order(1, 15000)] })).includes("milestone"))
  const both = salesSummary([...Array.from({ length: 24 }, (_, i) => order(30 + i, 4000)), order(1, 4000)], NOW)
  check("money wins over count when both pass the same week", both.milestone?.kind === "money" && both.milestone.value === 100_000, both.milestone)

  console.log("\nwhat counts as a sale")
  const mixed = salesSummary([
    order(1, 2000, { stripe_session_id: "cs_basket" }), order(1, 3000, { stripe_session_id: "cs_basket" }),
    order(2, 5000, { status: "failed" }), order(2, 5000, { status: "pending" }), order(2, 5000, { status: "disputed" }),
    order(3, 4000, { status: "refunded", refund_amount_cents: 4000 }),
  ], NOW)
  check("a basket is one sale; failed, pending and disputed are none", mixed.count === 2, mixed.count)
  check("money is what was kept: the basket, less the full refund", mixed.cents === 5000, mixed.cents)

  console.log("\nwhat Pro would have saved")
  const selling = state({ ...SETUP, orders: Array.from({ length: 60 }, (_, i) => order(1 + (i % 29), 4500)) })
  check("60 sales of $45 in 30 days: $150 in fees on Free, $96 on Pro", selling.sales.last30.feeFreeCents === 15000 && selling.sales.last30.feeProCents === 9600, selling.sales.last30)
  check("so Pro would have saved $25, the $29 paid", proSaving(selling) === 2500 && find(selling, "upgrade-saving")?.title === "Pro would have saved you $25", find(selling, "upgrade-saving")?.title)
  check("the line gives both sides, the plan's price inside Pro's", find(selling, "upgrade-saving")?.line === "Fees, 30 days: $150 on Free, $125 on Pro.", find(selling, "upgrade-saving")?.line)
  check("and a second Pro slide about the domain is left out", !ids(selling).includes("domain-pro"), ids(selling))
  const close = state({ ...SETUP, orders: Array.from({ length: 40 }, (_, i) => order(1 + (i % 29), 4500)) })
  check(`a saving under ${money(REAL_SAVING_CENTS)} is not worth saying`, proSaving(close) > 0 && proSaving(close) < REAL_SAVING_CENTS && !ids(close).includes("upgrade-saving"), proSaving(close))
  check("sales older than 30 days do not count", state({ ...SETUP, orders: Array.from({ length: 60 }, (_, i) => order(31 + i, 4500)) }).sales.last30.count === 0)
  check("on Pro it never shows", !ids(state({ ...SETUP, plan: "growth", orders: Array.from({ length: 80 }, (_, i) => order(1 + (i % 29), 9900)) })).includes("upgrade-saving"))
  check("nor on the older Pro plan", !ids(state({ ...SETUP, plan: "pro", orders: Array.from({ length: 80 }, (_, i) => order(1 + (i % 29), 9900)) })).includes("upgrade-saving"))

  console.log("\nemails")
  check("sales and no automation: suggest one", ids(state({ ...SETUP, hasDomain: true, orders: [order(20, 2000)], activeAutomations: 0, subscribers: 4 })).includes("automations"))
  check("an automation on: not", !ids(state({ ...SETUP, orders: [order(20, 2000)], activeAutomations: 1 })).includes("automations"))
  check("automations unread: say nothing rather than guess", !ids(state({ ...SETUP, orders: [order(20, 2000)], activeAutomations: null })).includes("automations"))
  check("no sales yet: not about emailing buyers", !ids(state({ ...SETUP, activeAutomations: 0 })).includes("automations"))
  check("a website and nobody on the list: the newsletter section", ids(state({ ...SETUP, subscribers: 0 })).includes("newsletter"))
  check("subscribers unread, or some on the list: not", !ids(state({ ...SETUP, subscribers: null })).includes("newsletter") && !ids(state({ ...SETUP, subscribers: 12 })).includes("newsletter"))
  check("no website: not", !ids(state({ hasProduct: true, hasPayouts: true, subscribers: 0 })).includes("newsletter"))

  console.log("\nwhen nothing applies, and when too much does")
  const quietFree = state({ ...SETUP, hasDomain: true, subscribers: 4, activeAutomations: 1, orders: [order(60, 2000)] })
  check("Free with nothing new: the plan's own facts", same(ids(quietFree), ["pro-offer"]), ids(quietFree))
  const quietPro = state({ ...SETUP, plan: "growth", hasDomain: true, subscribers: 4, activeAutomations: 1, orders: [order(60, 2000)] })
  check("Pro with nothing new: the way to Analytics", same(ids(quietPro), ["all-set"]), ids(quietPro))
  const busy = state({ ...SETUP, hasPayouts: false, orders: [order(1, 2900)], subscribers: 0, activeAutomations: 0 })
  const list = announcementsFor(busy, NOW)
  check(`never more than ${MAX_ANNOUNCEMENTS}`, list.length === MAX_ANNOUNCEMENTS, list.map((a) => a.id))
  check("most important first", list.every((a, i) => i === 0 || list[i - 1].priority >= a.priority) && list[0].id === "payouts", list.map((a) => a.id))
  check("the fallbacks never join a list that has something to say", !ids(busy).includes("pro-offer") && !ids(busy).includes("all-set"))
  check("never empty", announcementsFor(state({ plan: "growth", hasProduct: true, hasPayouts: true, websitePublished: true, hasDomain: true, subscribers: 1, activeAutomations: 1 }), NOW).length === 1)

  console.log("\nfrom Getting started")
  const done = stepsDone([
    { id: "signup", done: true }, { id: "product", done: true }, { id: "store", done: false },
    { id: "payments", done: true }, { id: "domain", done: false }, { id: "sale", done: true },
  ])
  check("reads the module's own step ids", done.hasProduct && done.hasPayouts && !done.websitePublished && !done.hasDomain && done.hasSale, done)
  check("and the older names", stepsDone([{ id: "website", done: true }, { id: "payouts", done: true }]).websitePublished && stepsDone([{ id: "payouts", done: true }]).hasPayouts)

  console.log("\nfrom the facts Getting started reads (lib/home/progress)")
  const facts = (f: Partial<ProgressFacts> = {}): ProgressFacts => ({ ...NO_FACTS, guideOpened: true, ...f })
  const none = salesSummary([], NOW)
  const readyFacts = facts({ products: 2, paymentsReady: true, websiteLive: true, domainConnected: false, subscribers: 12, automationsOn: 1 })
  const mapped = fromFacts(readyFacts, none, "free", true)
  const card = stepsDone(homeProgress(readyFacts).steps)
  check("a step is done here exactly when the card ticks it",
    mapped.hasProduct === card.hasProduct && mapped.hasPayouts === card.hasPayouts && mapped.websitePublished === card.websitePublished && mapped.hasDomain === card.hasDomain && mapped.hasProduct && mapped.hasPayouts && mapped.websitePublished && !mapped.hasDomain, mapped)
  check("the counts are the facts' own", mapped.subscribers === 12 && mapped.activeAutomations === 1)
  check("the next step is the card's", mapped.nextStep === nextSetupStep(readyFacts)?.id && mapped.nextStep === "sale", mapped.nextStep)
  check("Stripe connected with charges and payouts: payouts is not asked for", !ids(fromFacts(readyFacts, none, "free", true)).includes("payouts"))
  /* A product and no payments: the card says "Set up payments" next, so the banner does too. */
  const noPay = fromFacts(facts({ products: 1 }), none, "free", true)
  check("no payments: the card's next step leads", noPay.nextStep === "payments" && ids(noPay)[0] === "payouts", ids(noPay))
  /* Nothing yet: the card says "Add your first product", ahead of Stripe's usual first place. */
  const fresh = fromFacts(facts(), none, "free", true)
  check("nothing yet: the welcome, then the first product, as on the card", fresh.nextStep === "product" && same(ids(fresh).slice(0, 3), ["welcome", "first-product", "payouts"]), ids(fresh))
  check("the guide unopened leads nothing: the usual order, the welcome and then payouts", same(ids(fromFacts(facts({ guideOpened: false }), none, "free", true)).slice(0, 2), ["welcome", "payouts"]))
  const siteNext = fromFacts(facts({ products: 1, paymentsReady: true }), none, "free", true)
  check("no website: the website leads, share after it", siteNext.nextStep === "store" && same(ids(siteNext).slice(0, 2), ["website", "share"]), ids(siteNext))
  const newsFirst = fromFacts(facts({ products: 1, paymentsReady: true, websiteLive: true, pro: true, sales: 42 }), salesSummary([...Array.from({ length: 38 }, (_, i) => order(9 + i, 2500)), order(3, 2500), order(2, 2500), order(1, 2500)], NOW), "growth", true)
  check("news this week stays ahead of the card's next step", newsFirst.nextStep === "domain" && same(ids(newsFirst).slice(0, 2), ["milestone", "domain"]), ids(newsFirst))
  const saleNoPay = fromFacts(facts({ products: 1, sales: 1 }), salesSummary([order(1, 2900)], NOW), "free", true)
  check("Stripe the card names next, with a sale this week: Stripe still first", same(ids(saleNoPay).slice(0, 2), ["payouts", "first-sale"]), ids(saleNoPay))
  check("every step done: nothing leads", fromFacts(facts({ products: 1, paymentsReady: true, websiteLive: true, domainConnected: true, pro: true, sales: 1 }), none, "growth", true).nextStep === null)

  console.log("\nthe words")
  check("money: whole dollars bare, cents when there are some, none from $1,000", money(2900) === "$29" && money(2950) === "$29.50" && money(99999) === "$999.99" && money(123456) === "$1,235" && money(100000) === "$1,000")
  check("ago: hours then days, never a weekday", ago(NOW - 10 * 60_000, NOW) === "in the last hour" && ago(NOW - HOUR, NOW) === "an hour ago" && ago(NOW - 5 * HOUR, NOW) === "5 hours ago" && ago(NOW - DAY, NOW) === "a day ago" && ago(NOW - 3 * DAY, NOW) === "3 days ago")
  check("ordinals", ordinal(1) === "1st" && ordinal(2) === "2nd" && ordinal(3) === "3rd" && ordinal(11) === "11th" && ordinal(22) === "22nd" && ordinal(1000) === "1,000th")
  check("plans: growth and the older pro are paid, anything else is Free", isPaidPlan("growth") && isPaidPlan("pro") && isPaidPlan("Professional") && !isPaidPlan("free") && !isPaidPlan(null))
  check("milestones are round numbers, ascending", same(MONEY_MILESTONES, [...MONEY_MILESTONES].sort((a, b) => a - b)) && COUNT_MILESTONES[0] === 10)

  /* Every announcement any fixture can produce, for the copy rules and the phone's column. */
  const every = new Map<string, ReturnType<typeof announcementsFor>[number]>()
  for (const p of [state(), state({ hasProduct: true }), state({ hasProduct: true, hasPayouts: true }), firstSale, thousand, tenth, selling, quietFree, quietPro,
    state({ ...SETUP, plan: "growth", subscribers: 3, activeAutomations: 1, orders: [order(60, 2000)] }), state({ ...SETUP, orders: Array.from({ length: 900 }, (_, i) => order(1 + (i % 29), 99900)) })]) {
    for (const a of announcementsFor(p, NOW, 99)) every.set(`${a.id}:${a.title}`, a)
  }
  const texts = [...every.values()]
  check("every rule is reached by some fixture", RULES.every((r) => texts.some((a) => a.id === r.id)), RULES.map((r) => r.id).filter((id) => !texts.some((a) => a.id === id)))
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b|[—–]/i
  check("no em or en dashes, none of the words CLAUDE.md bans", texts.every((a) => !banned.test(`${a.eyebrow} ${a.title} ${a.line} ${a.cta}`)), texts.filter((a) => banned.test(`${a.eyebrow} ${a.title} ${a.line} ${a.cta}`)).map((a) => a.id))
  /* The 360 phone's text column is 168px: two lines of title and three of body, measured (scripts/check-home-banner.mjs). */
  check("every title fits two lines on a 360 phone (34 characters)", texts.every((a) => a.title.length <= 34), texts.filter((a) => a.title.length > 34).map((a) => a.title))
  check("every line fits two on a phone (48 characters, even with a big number)", texts.every((a) => a.line.length <= 48), texts.filter((a) => a.line.length > 48).map((a) => `${a.line.length}: ${a.line}`))
  check("every button goes to a page in /app, or opens the share sheet", texts.every((a) => a.action === "share" || a.href.startsWith("/app/")), texts.map((a) => a.href))

  /* Home reads no order rows in the browser (a read stops at 1,000): the page counts every order on the server and reads only the last 30 days and the first few. */
  console.log("\nthe sales without every order (salesSummaryFrom, app/app/page.tsx)")
  const history = [...Array.from({ length: 1200 }, (_, i) => order(40 + i / 10, 700)), ...Array.from({ length: 6 }, (_, i) => order(20 - i, 2500)), order(2, 60000), order(1, 90000)]
  const full = salesSummary(history, NOW)
  const recentRows = history.filter((o) => NOW - Date.parse(o.created_at) <= 30 * DAY)
  const earliestRows = [...history].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).slice(0, 50)
  const split = salesSummaryFrom({ recent: recentRows, earliest: earliestRows, totals: { sales: full.count, revenueCents: full.cents } }, NOW)
  check("the same count, money and last 30 days as reading every order", split.count === full.count && split.cents === full.cents && same(split.last30, full.last30), { split, full })
  check("the same first sale", same(split.first, full.first), [split.first, full.first])
  check("and the same round number passed this week, though it counts orders the browser never read", same(split.milestone, full.milestone) && split.milestone?.kind === "money", [split.milestone, full.milestone])
  const noTotals = salesSummaryFrom({ recent: recentRows, earliest: earliestRows, totals: null }, NOW)
  check("totals not counted: at least what was read, never less", noTotals.count === recentRows.length && same(noTotals.last30, full.last30))
  const banner = readFileSync(join(process.cwd(), "components/app/home/home-banner.tsx"), "utf8")
  const page = readFileSync(join(process.cwd(), "app/app/page.tsx"), "utf8")
  check("the banner is handed the sales, and reads no orders itself",
    /sales: SalesSummary/.test(banner) && !/OrderRow|orders:/.test(banner)
    && /creatorSalesRows\(adminSupabase, creator\.id, now\)/.test(page) && /salesSummaryFrom\(\{ \.\.\.bannerRows, totals: salesTotals \}, now\)/.test(page) && /bannerSales=\{bannerSales\}/.test(page))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
