/**
 * ===========================================================================
 *  HOME PROGRESS: EVERY STEP'S DONE STATE FROM THE ACCOUNT'S OWN ROWS
 * ===========================================================================
 * "It should actually track whether the user has connected his domain... and
 * whether he has set up payments." lib/home/progress is the one set of rules
 * Home's Getting started, the challenges after it, the purple bar and the
 * sidebar's setup ring all read. Each rule is held here against fixture rows
 * shaped like the ones the server reads, true and false, and the pages are
 * held to reading them from there.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CHALLENGE_ORDER,
  GUIDE_OPENED_KEY,
  NO_FACTS,
  SETUP_ORDER,
  VERIFIED_DOMAIN_STATUSES,
  challenges,
  domainFactsFrom,
  factsFromRows,
  guideOpenedFrom,
  homeProgress,
  isProPlan,
  legacyFacts,
  paymentsReadyFrom,
  readFacts,
  salesFrom,
  sameFacts,
  setupSteps,
  nextSetupStep,
  type ProgressFacts,
  type ProgressRows,
} from "../lib/home/progress"
import { LIVE_STATUSES } from "../lib/custom-domains/store"
import type { OrderRow } from "../lib/orders/order-view"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : `: ${JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

let seq = 0
function order(status: string, extra: Partial<OrderRow> = {}): OrderRow {
  seq++
  return {
    id: `o${seq}`,
    product_id: "p1",
    amount_cents: 2500,
    status,
    created_at: new Date(Date.UTC(2026, 8, 1, 12, seq)).toISOString(),
    stripe_session_id: `cs_${seq}`,
    refund_amount_cents: 0,
    ...extra,
  } as OrderRow
}

const blank: ProgressRows = { creator: { stripe_onboarding_status: "not_connected", charges_enabled: false, payouts_enabled: false, subscription_plan_id: "free" }, products: [], domains: [], websiteLive: false, orders: [], userMetadata: {}, counts: {} }
const facts = (over: Partial<ProgressRows>) => factsFromRows({ ...blank, ...over })
const step = (f: ProgressFacts, id: string) => setupSteps(f).find((s) => s.id === id)!

function main() {
  console.log("\na new account")
  {
    const f = facts({})
    const p = homeProgress(f)
    check("only Sign up is done", p.completed === 1 && step(f, "signup").done, p.steps.map((s) => [s.id, s.done]))
    /* Changed on purpose: "Remove the Upgrade to Pro in Getting started". Seven steps, the domain still last. */
    check("seven steps, in the order the work depends on", p.total === 7 && p.steps.map((s) => s.id).join() === SETUP_ORDER.join() && SETUP_ORDER.join() === "signup,guide,product,payments,store,sale,domain")
    check("Upgrade to Pro is not one of them", !p.steps.some((s) => (s.id as string) === "pro" || /Upgrade to Pro/.test(s.label)))
    check("a new account is 1 of 7 (14%), not 1 of 8", p.completed === 1 && Math.round((p.completed / p.total) * 100) === 14)
    check("the card shows Getting started, not the challenges", p.phase === "setup" && !p.setupDone)
    check("an account with no creator row reads as nothing done", sameFacts(factsFromRows({ creator: null, products: null, domains: null, websiteLive: false }), NO_FACTS))
  }

  console.log("\nfirst product: any product, draft or published")
  {
    check("none: open, and its link makes one", !step(facts({}), "product").done && step(facts({}), "product").href === "/app/products/new")
    const draft = facts({ products: [{ status: "draft" }] })
    check("a draft counts", step(draft, "product").done && draft.products === 1 && draft.publishedProducts === 0)
    check("done: its link is the list", step(draft, "product").href === "/app/products")
    check("published ones are counted apart, for the challenges", facts({ products: [{ status: "published" }, { status: "draft" }, { status: "published" }] }).publishedProducts === 2)
    check("a list of ids alone (the layout's read) counts products", facts({ products: [{ id: "a" }, { id: "b" }] }).products === 2)
  }

  console.log("\npayments: Stripe can take a charge and pay out")
  {
    check("connected by the webhook's word", paymentsReadyFrom({ stripe_onboarding_status: "connected" }))
    check("charges and payouts both on", paymentsReadyFrom({ stripe_onboarding_status: "pending", charges_enabled: true, payouts_enabled: true }))
    check("payouts alone is not enough", !paymentsReadyFrom({ stripe_onboarding_status: "pending", charges_enabled: false, payouts_enabled: true }))
    check("charges alone is not enough", !paymentsReadyFrom({ stripe_onboarding_status: "pending", charges_enabled: true, payouts_enabled: false }))
    check("pending onboarding is not", !paymentsReadyFrom({ stripe_onboarding_status: "pending" }))
    check("no row is not", !paymentsReadyFrom(null))
    check("the step reads it", step(facts({ creator: { stripe_onboarding_status: "connected" } }), "payments").done)
  }

  console.log("\nonline store: a website published right now")
  {
    check("published", step(facts({ websiteLive: true }), "store").done)
    check("not published (installed, unpublished, a draft)", !step(facts({ websiteLive: false }), "store").done)
    check("its link is the website builder, a page in the shell", step(facts({}), "store").href === "/app/website-builder")
  }

  console.log("\nfirst sale: a sale by the rule every figure uses")
  {
    check("none", salesFrom([]).sales === 0)
    check("failed, pending and disputed are not sales", salesFrom([order("failed"), order("pending"), order("disputed")]).sales === 0)
    check("a completed order is", salesFrom([order("completed")]).sales === 1)
    check("a refunded one was a sale", salesFrom([order("refunded", { refund_amount_cents: 2500 })]).sales === 1)
    const basket = salesFrom([order("completed", { stripe_session_id: "cs_basket" }), order("completed", { stripe_session_id: "cs_basket" })])
    check("a basket of two is one sale, and makes both lines' money", basket.sales === 1 && basket.revenueCents === 5000, basket)
    check("a partial refund comes off the money", salesFrom([order("refunded", { refund_amount_cents: 1000 })]).revenueCents === 1500)
    const f = facts({ orders: [order("completed")] })
    check("the step ticks, and is then a link to Orders", step(f, "sale").done && step(f, "sale").href === "/app/orders")
    check("before it, the step opens the share panel", step(facts({}), "sale").action === "share" && !step(facts({}), "sale").href)
  }

  console.log("\ndomain: a custom domain whose DNS is verified")
  {
    check("the statuses are the domain store's own", JSON.stringify([...VERIFIED_DOMAIN_STATUSES]) === JSON.stringify(LIVE_STATUSES), { here: VERIFIED_DOMAIN_STATUSES, store: LIVE_STATUSES })
    check("active", domainFactsFrom([{ domain: "shop.example.com", status: "active", purpose: "website" }]).domainConnected)
    check("ssl_provisioning (verified, certificate on its way)", domainFactsFrom([{ domain: "shop.example.com", status: "ssl_provisioning", purpose: "website" }]).domainConnected)
    for (const s of ["pending", "verifying", "failed", "error", null]) {
      check(`${s ?? "no status"} is not`, !domainFactsFrom([{ domain: "shop.example.com", status: s, purpose: "website" }]).domainConnected)
    }
    check("a row with no domain is not", !domainFactsFrom([{ domain: "", status: "active", purpose: "website" }]).domainConnected)
    check("the website's does not put the creator page on it", !domainFactsFrom([{ domain: "a.com", status: "active", purpose: "website" }]).creatorPageDomain)
    check("the creator page's does", domainFactsFrom([{ domain: "a.com", status: "active", purpose: "creator_page" }]).creatorPageDomain)
    check("on a database from before purposes, the one domain served the page too", domainFactsFrom([{ domain: "a.com", status: "active" }]).creatorPageDomain)
    check("the step reads it", step(facts({ domains: [{ domain: "a.com", status: "active", purpose: "website" }] }), "domain").done)
  }

  console.log("\nthe guide: opened, kept on the account")
  {
    check("opened", guideOpenedFrom({ [GUIDE_OPENED_KEY]: "2026-09-25T10:00:00.000Z" }))
    check("never opened", !guideOpenedFrom({}) && !guideOpenedFrom(null) && !guideOpenedFrom({ [GUIDE_OPENED_KEY]: "" }) && !guideOpenedFrom({ [GUIDE_OPENED_KEY]: true }))
    check("the step reads it, and is a button, not a link", step(facts({ userMetadata: { [GUIDE_OPENED_KEY]: "2026-09-25" } }), "guide").done && step(facts({}), "guide").action === "guide")
  }

  console.log("\nPro: growth, or the earlier pro, a fact and not a step")
  {
    check("growth", isProPlan("growth"))
    check("pro", isProPlan("pro"))
    check("free, nothing, or anything else is not", !isProPlan("free") && !isProPlan(null) && !isProPlan(undefined) && !isProPlan("enterprise"))
    const pro = facts({ creator: { subscription_plan_id: "growth" } })
    check("the plan is still read", pro.pro && !facts({}).pro)
    check("but it counts for nothing in Getting started", homeProgress(pro).completed === homeProgress(facts({})).completed && homeProgress(pro).total === 7)
  }

  console.log("\nall seven: the challenges")
  {
    const all = facts({
      creator: { stripe_onboarding_status: "connected", subscription_plan_id: "growth" },
      products: [{ status: "published" }, { status: "published" }],
      domains: [{ domain: "a.com", status: "active", purpose: "website" }],
      websiteLive: true,
      orders: [order("completed"), order("completed"), order("completed")],
      userMetadata: { [GUIDE_OPENED_KEY]: "2026-09-25" },
      counts: { subscribers: 12, emailsSent: 0, automationsOn: 1, couponUses: 0 },
    })
    const p = homeProgress(all)
    check("setup is done", p.setupDone && p.completed === 7 && p.phase === "challenges")
    check("and there is no next step to nudge about", nextSetupStep(all) === null)
    check("eight challenges, in their order", p.challenges.length === 8 && p.challenges.map((c) => c.id).join() === CHALLENGE_ORDER.join())
    const c = (id: string) => p.challenges.find((x) => x.id === id)!
    check("3 of 10 sales", c("sales").current === 3 && c("sales").target === 10 && !c("sales").done)
    check("2 of 5 published products", c("products").current === 2 && c("products").target === 5 && !c("products").done)
    check("12 of 50 subscribers", c("subscribers").current === 12 && c("subscribers").target === 50)
    check("an automation is on", c("automation").done)
    check("no email sent yet", !c("email").done && c("email").current === 0)
    check("no coupon used yet", !c("coupon").done)
    check("$75 of $1,000 in cents", c("revenue").current === 7500 && c("revenue").target === 100000 && c("revenue").unit === "cents")
    check("the website's domain does not count for the creator page", !c("page-domain").done)
    check("each is a link or the share panel", p.challenges.every((x) => !!x.href || x.action === "share"))
    const many = challenges({ ...all, sales: 25, subscribers: 300 })
    check("a count past its target is shown at the target, and done", many.find((x) => x.id === "sales")!.current === 10 && many.find((x) => x.id === "sales")!.done && many.find((x) => x.id === "subscribers")!.done)
    check("done without Pro: the plan is not a step", homeProgress({ ...all, pro: false }).setupDone)
    const one = homeProgress({ ...all, domainConnected: false })
    check("one step open again (the domain went): back to Getting started", one.phase === "setup" && one.completed === 6)
  }

  console.log("\nwhat the API sends is checked, never trusted")
  {
    check("not an object: nothing", readFacts(null) === null && readFacts("x") === null)
    const r = readFacts({ products: 3, paymentsReady: "yes", websiteLive: true, extra: 1 })!
    check("right types kept, wrong ones read as not done", r.products === 3 && r.paymentsReady === false && r.websiteLive === true && !("extra" in r))
    check("the same facts are the same", sameFacts(NO_FACTS, { ...NO_FACTS }) && !sameFacts(NO_FACTS, { ...NO_FACTS, sales: 1 }))
    check("the old checklist's shape still reads", legacyFacts([{ id: "product", completed: true }, { id: "payouts", completed: true }], "growth").products === 1 && legacyFacts([{ id: "payouts", completed: true }]).paymentsReady && legacyFacts([], "growth").pro)
  }

  console.log("\nthe pages read it from there")
  {
    const page = read("app/app/page.tsx")
    /* Changed on purpose: the sales are counted over every order (creatorSalesTotals), not from one read of the rows, which stopped at 1,000. */
    check("Home builds its facts with factsFromRows, sales and counts included", /factsFromRows\(\{[\s\S]*sales(: salesTotals)?,[\s\S]*counts: challengeCounts[\s\S]*\}\)/.test(page) && /initialProgress=\{progressFacts\}/.test(page))
    check("Home reads a website that is published now, by its status", /\.from\("store_theme_installs"\)[\s\S]{0,120}\.eq\("status", WEBSITE_LIVE_STATUS\)/.test(page))
    check("Home reads every domain, so a verified one waiting on its certificate counts", /\.from\("custom_domains"\)[\s\S]{0,400}\.select\("\*"\)\s*\.eq\("creator_id", creator\.id\)\s*\.order/.test(page) && !/\.from\("custom_domains"\)[\s\S]{0,400}\.eq\("status", "active"\)/.test(page))
    check("and the challenge counts in the same batch", /readChallengeCounts\(adminSupabase, creator\.id\)/.test(page))
    const layout = read("app/app/layout.tsx")
    check("the sidebar's ring counts the same steps", /homeProgress\(\{[\s\S]*factsFromRows\(/.test(layout) && /const completedSteps = setup\.completed/.test(layout) && /const totalSteps = setup\.total/.test(layout))
    check("the layout reads them on the caller's own client", !/createAdminClient/.test(layout) && /\.from\("custom_domains"\)\.select\("\*"\)\.eq\("creator_id", creator\.id\)/.test(layout))
    const dash = read("components/app/dashboard-client.tsx")
    check("Home's sales are its live orders, by the same rule", /sales: totals\.totalOrders/.test(dash) && /homeProgress\(facts(, storeCurrencyCode)?\)/.test(dash))
    check("the purple bar counts the same steps", /const completedSteps = progress\.completed/.test(dash) && /const totalSteps = progress\.total/.test(dash))
    const api = read("app/api/home/progress/route.ts")
    check("GET /api/home/progress: signed in only, no store, no cache", /current\.state === "indeterminate"/.test(api) && /if \(!current\.user\)/.test(api) && /Cache-Control": "no-store"/.test(api) && /userId: current\.user\.id/.test(api))
    check("and no database error text in what it sends", !/error\.message/.test(api))
    const guide = read("app/api/home/guide/route.ts")
    check("POST /api/home/guide writes the person's own metadata, once", /supabase\.auth\.updateUser\(\{ data: \{ \[GUIDE_OPENED_KEY\]/.test(guide) && /if \(guideOpenedFrom\(current\.user\.user_metadata\)\)/.test(guide) && !/createAdminClient/.test(guide))
    const server = read("lib/home/progress-server.ts")
    check("the next step to nudge about is the first not done, and none once all are",
      nextSetupStep({ ...NO_FACTS })?.id === "guide" && nextSetupStep({ ...NO_FACTS, guideOpened: true, products: 1 })?.id === "payments")
    check("every read by the creator's own id", (server.match(/\.eq\("creator_id", creator(Id|\.id)\)/g) ?? []).length >= 7 && /\.eq\("user_id", input\.userId\)/.test(server))
    check("a read that fails is 0, never a thrown error", /async function settle/.test(server) && /r\.error \? 0/.test(server))
    const hook = read("components/app/home/use-home-progress.ts")
    check("Home asks again when landed on from another page, and when it comes back into view", /hasInAppHistory\(\)/.test(hook) && /visibilitychange/.test(hook) && /\/api\/home\/progress\?sales=0/.test(hook))
    check("never more than once in a few seconds", /MIN_GAP_MS/.test(hook))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}
main()
