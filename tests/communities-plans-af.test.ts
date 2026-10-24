/**
 * Round AF: community plans, the Select your plan page and the community's own checkout.
 *
 *   PLANS      up to 3 on sale at once (archived ones kept for the people on them), each with a
 *              description, benefits and an optional free trial, in the creator's order
 *   BUTTON     "Join $24/month", "Join free", "Start free trial", "Choose plan": never "Join for"
 *   PICKER     several plans open Select your plan; one plan goes straight to its checkout
 *   CHECKOUT   Monthly or Annual chosen in the checkout, a savings badge only when annual is
 *              cheaper, the trial and the first charge spelled out, Stripe's own card fields,
 *              paid access granted by the server (/api/memberships/confirm and the webhooks)
 *   TRIALS     one free trial per person per community, whichever plan it was on
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { decideJoin, joinablePlans, type JoinFacts } from "@/components/community/public/join-state"
import { cardPrice, nextCharge, planButton, planIntervals, plansPrice, trialEnds } from "@/components/community/public/plan-words"
import type { JoinOption } from "@/components/community/public/types"
import { joinButtonLabel } from "@/lib/communities/format"
import { MAX_ACTIVE_TIERS, MAX_TIERS, TRIAL_MAX_DAYS } from "@/lib/communities/limits"
import { yearlySaving } from "@/lib/memberships/state"
import { canChangePlan, changeKind, nextChargeAt, previewAmounts, prorationFor, subscriberCounts } from "@/lib/communities/plan-change"
import { applyPlanChange, finishPlanChange, planChoices, previewPlanChange, type PlanChangeDeps } from "@/lib/communities/server/plan-change"
import { confirmLabel, previewSentence } from "@/components/community/membership/plan-words"
import { welcomeVideoSrc } from "@/lib/communities/post-media"
import { fakeDb } from "./_fake-db"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
/* Code without its comments, so a check reads what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const free: JoinOption = { tierId: "t-free", name: "Free", description: null, kind: "free", billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "Free", benefits: [], trialDays: 0, checkout: null }
const std: JoinOption = { tierId: "t-std", name: "Standard", description: null, kind: "paid", billing: "recurring", productId: "p-std", monthlyCents: 9800, yearlyCents: 90000, priceCents: null, currency: "usd", priceLine: "$98/month", benefits: ["Full access"], trialDays: 7, checkout: { month: "/c?m", year: "/c?y", once: null } }
const pre: JoinOption = { tierId: "t-pre", name: "Premium", description: null, kind: "paid", billing: "recurring", productId: "p-pre", monthlyCents: 199700, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "$1,997/month", benefits: [], trialDays: 0, checkout: { month: "/c?p", year: null, once: null } }
const once: JoinOption = { tierId: "t-once", name: "Lifetime", description: null, kind: "paid", billing: "one_time", productId: "p-once", monthlyCents: null, yearlyCents: null, priceCents: 24900, currency: "usd", priceLine: "$249", benefits: [], trialDays: 0, checkout: { month: null, year: null, once: "/c?o" } }

const facts = (options: JoinOption[], over: { access?: JoinFacts["community"]["access"]; canTakePayments?: boolean } = {}): JoinFacts => ({
  community: { slug: "makers", status: "published", access: over.access ?? "free", approvalRequired: false, suspended: false, archived: false, creatorName: "Ana" },
  viewer: { signedIn: true, active: false, status: null, role: null, isOwner: false, banned: false, approved: false, source: null, membershipId: null },
  options,
  accessProducts: [],
  canTakePayments: over.canTakePayments ?? true,
})

async function main() {
  console.log("\nPlans: how many, and what each carries")
  check("3 plans on sale at once, 10 kept in all (archived ones stay for the people on them)", MAX_ACTIVE_TIERS === 3 && MAX_TIERS === 10)
  check("a trial is at most 90 days", TRIAL_MAX_DAYS === 90)
  const tiers = code("lib/communities/server/tiers.ts")
  check("creating a plan past 3 on sale is refused, with what to do", /slot\.count >= MAX_ACTIVE_TIERS/.test(tiers) && /Archive one to add another/.test(read("lib/communities/server/tiers.ts")))
  check("bringing an archived plan back is refused when 3 are on sale", /MAX_ACTIVE_TIERS/.test(tiers.slice(tiers.indexOf("export async function archiveTier"))))
  check("a plan's trial is saved on its membership plan, and audited", /trialDays/.test(tiers) && /trial_days/.test(tiers))
  check("plans can be moved up and down, audited", /export async function moveTier/.test(tiers) && /"tier\.moved"/.test(tiers))
  const route = code("app/api/app/community/[id]/tiers/[tierId]/route.ts")
  check("the tier route takes move and a whole trial in days, 0 to 90", /move/.test(route) && /TRIAL_MAX_DAYS/.test(route) && /Number\.isInteger/.test(route))
  const settings = read("components/community/creator/settings-section.tsx")
  check("the creator's Plans card: description, benefits, trial, order, preview", ["data-tier-description", "data-tier-benefits", "data-tier-trial", "data-tier-move", "data-plans-preview"].every((a) => settings.includes(a)))
  check("the trial is picked from pills, never a browser select", !/<select\b/.test(settings) && /role="radiogroup"/.test(settings))

  console.log("\nThe button's words")
  check("free: Join free", joinButtonLabel({ isMember: false, priceLine: "Free" }) === "Join free")
  check("paid: Join $24/month", joinButtonLabel({ isMember: false, priceLine: "$24/month" }) === "Join $24/month")
  check("a trial: Start free trial", joinButtonLabel({ isMember: false, priceLine: "$24/month", trialDays: 7 }) === "Start free trial")
  check("several plans with a free one: Join free; all paid: Choose plan", joinButtonLabel({ isMember: false, plans: 3, anyFree: true }) === "Join free" && joinButtonLabel({ isMember: false, plans: 2, anyFree: false }) === "Choose plan")
  const words = ["lib/communities/format.ts", "components/community/public/join-controls.tsx", "components/community/public/join-flow.tsx", "app/checkout/membership-checkout.tsx"].map(code).join("\n")
  check("no button says Join for, anywhere the join is drawn", !/["`]Join for /.test(words))

  console.log("\nWhich plans the picker shows")
  check("free and paid plans that can be bought are offered", joinablePlans([free, std, pre], true).length === 3)
  check("a paid plan with no checkout, or no way to take payments, is not offered", joinablePlans([free, { ...std, checkout: null }], true).length === 1 && joinablePlans([free, std], false).length === 1)
  const three = decideJoin(facts([free, std, pre]))
  check("three plans: the button opens the picker, and says Join free", three.plans?.length === 3 && three.label === "Join free")
  const twoPaid = decideJoin(facts([std, pre], { access: "paid" }))
  check("two paid plans: Choose plan", twoPaid.plans?.length === 2 && twoPaid.label === "Choose plan")
  const one = decideJoin(facts([std], { access: "paid" }))
  check("one plan: no picker, straight to its checkout", !one.plans && one.kind === "checkout" && one.option?.tierId === "t-std")

  console.log("\nPrices on the cards")
  check("a free plan's card says Free, not $0/month", cardPrice(free).amount === "Free" && cardPrice(free).per === null)
  check("a recurring card leads with the monthly price", cardPrice(std).amount === "$98" && cardPrice(std).per === "/month")
  check("a one-time plan shows its one price", cardPrice(once).amount === "$249" && cardPrice(once).per === null)
  check("card buttons: Join free, Start 7-day free trial, Join $1,997/month, Join $249", planButton(free) === "Join free" && planButton(std) === "Start 7-day free trial" && planButton(pre) === "Join $1,997/month" && planButton(once) === "Join $249")
  check("intervals offered are the ones with a checkout", planIntervals(std).join() === "month,year" && planIntervals(pre).join() === "month")
  check("the savings badge is real: $900 a year against $98 a month is 23%", yearlySaving(9800, 90000) === 23)
  check("no badge when annual is not cheaper", !yearlySaving(1000, 12000) && !yearlySaving(1000, 13000))
  check("several plans as one line: Free or N paid plans, else From the cheapest", plansPrice([free, std, pre])?.amount === "Free" && plansPrice([free, std, pre])?.per === "or 2 paid plans" && plansPrice([std, pre])?.amount === "From $98")

  console.log("\nDates in the checkout")
  const jan31 = new Date(2027, 0, 31, 12)
  check("monthly from Jan 31 renews Feb 28, as Stripe bills it", nextCharge("month", jan31) === "Feb 28, 2027", nextCharge("month", jan31))
  check("yearly from Feb 29 renews Feb 28", nextCharge("year", new Date(2028, 1, 29, 12)) === "Feb 28, 2029")
  check("a 7-day trial from Oct 17 ends Oct 24", trialEnds(7, new Date(2026, 9, 17, 12).getTime()) === "Oct 24, 2026")

  console.log("\nThe community's own checkout")
  const flow = code("components/community/public/join-flow.tsx")
  /* Changed on purpose (round AG): the checkout is Skool's shape, Stripe's one line card field and the device's own wallet (./compact-pay.tsx), still Stripe's hosted fields. */
  const payUi = code("components/community/public/compact-pay.tsx")
  check("card details go into Stripe's own fields (CardElement, paymentRequest), never inputs of ours", /<CompactPay/.test(flow) && /<CardElement/.test(payUi) && /paymentRequest\(/.test(payUi) && !/name="(card|cardNumber|cvc|cvv)"/i.test(flow + payUi) && !/autoComplete="cc-/.test(flow + payUi))
  /* Round 10: the window's frame (head, body, Powered by Stripe) moved to components/checkout/checkout-window, shared with the OnePage's instant checkout; read with it. */
  check("Powered by Stripe only because the payment runs on Stripe; no tick box, the terms sit under the button", /<CheckoutWindow/.test(flow) && /PoweredByStripe/.test(code("components/checkout/checkout-window.tsx")) && !/CheckRow/.test(flow) && /By joining you agree to the/.test(read("components/community/public/join-flow.tsx")) && /agreedToTerms: true/.test(flow))
  check("the subscription is made by the memberships route, and confirmed by the server", /\/api\/memberships\/checkout/.test(flow) && /\/api\/memberships\/confirm/.test(flow))
  check("Monthly and Annual are chosen in the checkout, with the monthly equivalent and billed yearly", /data-interval/.test(flow) && /billed yearly/.test(read("components/community/public/join-flow.tsx")))
  check("the trial note says what is paid today, then what and from when", /Nothing today, then/.test(read("components/community/public/join-flow.tsx")) && /trialEnds\(/.test(flow))
  check("the summary shows due today and the recurring price", /data-due-today/.test(flow) && /data-checkout-summary/.test(flow))
  check("a 3D Secure return is picked up when the page comes back", /requires_action/.test(flow) || /redirect_status/.test(flow))

  console.log("\nThe checkout's facts route")
  const facts$ = code("app/api/community/[communityId]/checkout/route.ts")
  check("checks the communities switch first, then who is asking", facts$.search(/await requireCommunitiesOn\(\)/) < facts$.search(/auth\.getUser\(\)/) && /viewerContext\(/.test(facts$))
  check("refuses signed out, a plan not on sale, and the checkout gate's refusals", /status: 401/.test(facts$) && /plan_unavailable/.test(facts$) && /checkoutGate\(/.test(facts$))
  check("grants nothing", !/grantMembership|\.insert\(|\.update\(|\.upsert\(/.test(facts$))
  check("never cached", /no-store/.test(facts$))

  console.log("\nOne free trial per community")
  const helper = code("lib/communities/server/plan-checkout.ts")
  check("any membership of any of the community's plans ends the trial", /export async function communityTrialUsed/.test(helper) && /communityPlanProducts/.test(helper))
  check("a read that fails counts as used: never a second trial by accident", /return true/.test(helper))
  const pay = code("app/api/memberships/checkout/route.ts")
  check("the memberships checkout asks it before giving a trial", /communityTrialUsed/.test(pay) && /const hadTrial = rows\.some/.test(pay))

  console.log("\nThe join route takes the plan picked")
  check("the join route passes the plan on", /tierId: body\.tierId/.test(code("app/api/community/[communityId]/join/route.ts")))


  console.log("\nChanging plan: the rules")
  const std$ = { productId: "p-std", amountCents: 9800, interval: "month" as const }
  check("more per month is an upgrade, less a downgrade, another interval its own kind", changeKind(std$, { productId: "p-pre", amountCents: 199700, interval: "month" }) === "upgrade" && changeKind({ productId: "p-pre", amountCents: 199700, interval: "month" }, std$) === "downgrade" && changeKind(std$, { productId: "p-std", amountCents: 90000, interval: "year" }) === "interval" && changeKind(std$, std$) === "same")
  check("upgrades and interval changes are invoiced now, downgrades credited, trials neither", prorationFor("upgrade", false) === "always_invoice" && prorationFor("interval", false) === "always_invoice" && prorationFor("downgrade", false) === "create_prorations" && prorationFor("upgrade", true) === "none")
  check("only a paying or trialing membership not set to end can change", canChangePlan({ status: "active" }) && canChangePlan({ status: "trialing" }) && !canChangePlan({ status: "past_due" }) && !canChangePlan({ status: "active", cancel_at_period_end: true }) && !canChangePlan(null))
  check("the preview's numbers: an invoice now is paid now", previewAmounts("always_invoice", { amount_due: 150000, total: 150000 }).dueNowCents === 150000)
  check("a downgrade's credit is its proration lines, nothing paid now", JSON.stringify(previewAmounts("create_prorations", { amount_due: 9800, total: 9800, lines: { data: [{ amount: -150000, proration: true }, { amount: 140000, parent: { subscription_item_details: { proration: true } } }, { amount: 9800 }] } })) === JSON.stringify({ dueNowCents: 0, creditCents: 10000 }))
  check("next charge: after the trial, a year from today on annual, else the period's end", nextChargeAt("upgrade", "month", { status: "trialing", trial_end: "2026-10-24T00:00:00Z" }) === "2026-10-24T00:00:00Z" && nextChargeAt("downgrade", "month", { status: "active", current_period_end: "2026-11-01T00:00:00Z" }) === "2026-11-01T00:00:00Z" && (nextChargeAt("interval", "year", { status: "active" }, new Date(2026, 9, 17, 12)) ?? "").startsWith("2027-10-17"))
  const pv = { kind: "upgrade" as const, toName: "Premium", interval: "month" as const, amountCents: 199700, currency: "usd", dueNowCents: 150000, creditCents: 0, nextChargeAt: "2026-11-01T12:00:00Z", trialing: false }
  check("the member reads what is paid today and then", previewSentence(pv) === "You pay $1,500 today, the difference for the rest of this period. Then $1,997/month from Nov 1, 2026.", previewSentence(pv))
  check("a downgrade reads nothing today and the credit", /^Nothing to pay today\. \$100 for the time you have not used comes off your next bill\./.test(previewSentence({ ...pv, kind: "downgrade", dueNowCents: 0, creditCents: 10000 })))
  check("a trial reads that it carries on", /^Your free trial carries on\./.test(previewSentence({ ...pv, trialing: true })))
  check("the confirm button says what happens", confirmLabel("upgrade", "Premium", "month") === "Upgrade to Premium" && confirmLabel("interval", "Standard", "year") === "Switch to annual" && confirmLabel("downgrade", "Standard", "month") === "Switch to Standard")

  console.log("\nChanging plan: against a database, with Stripe stood in")
  const C = "c0000000-0000-4000-8000-0000000000af"
  const U = "a0000000-0000-4000-8000-0000000000af"
  const STD = "d0000000-0000-4000-8000-0000000000a1"
  const PRE = "d0000000-0000-4000-8000-0000000000a2"
  const community = { id: C, slug: "salajan", name: "Salajan", creator_id: "cr1", owner_user_id: "owner" } as never
  const world = (m: Record<string, unknown> = {}) =>
    fakeDb({
      community_tiers: [
        { id: "t-std", community_id: C, name: "Standard", description: null, kind: "paid", billing: "recurring", product_id: STD, position: 1, is_default: false, archived_at: null, benefits: [] },
        { id: "t-pre", community_id: C, name: "Premium", description: null, kind: "paid", billing: "recurring", product_id: PRE, position: 2, is_default: false, archived_at: null, benefits: [] },
      ],
      products: [
        { id: STD, type: "membership", status: "published", title: "Standard", price_cents: 9800, community_id: C, creator_id: "cr1" },
        { id: PRE, type: "membership", status: "published", title: "Premium", price_cents: 199700, community_id: C, creator_id: "cr1" },
      ],
      membership_plans: [
        { product_id: STD, creator_id: "cr1", monthly_price_cents: 9800, yearly_price_cents: 90000, currency: "usd", trial_days: 7, benefits: [], included_product_ids: [] },
        { product_id: PRE, creator_id: "cr1", monthly_price_cents: 199700, yearly_price_cents: null, currency: "usd", trial_days: 0, benefits: [], included_product_ids: [] },
      ],
      creators: [{ id: "cr1", user_id: "owner", stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true }],
      memberships: [{ id: "m1", product_id: STD, creator_id: "cr1", buyer_id: U, buyer_email: "a@b.c", title: "Standard", stripe_subscription_id: "sub_1", billing_interval: "month", amount_cents: 9800, currency: "usd", status: "active", cancel_at_period_end: false, current_period_end: "2026-11-01T12:00:00Z", trial_end: null, created_at: "2026-10-01T00:00:00Z", ...m }],
      community_audit_log: [],
    })
  const person = { id: U, email: "a@b.c", emailConfirmed: true }
  const calls: { update?: Record<string, unknown>; updates: Record<string, unknown>[]; previewed: number; reconciled: number; told?: string } = { updates: [], previewed: 0, reconciled: 0 }
  const deps = (over: Partial<PlanChangeDeps> = {}): PlanChangeDeps => ({
    retrieve: async () => ({ id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ id: "si_1", price: { id: "price_std_m" } }] } }),
    preview: async () => {
      calls.previewed++
      return { amount_due: 150000, total: 150000 }
    },
    update: async (_id, params) => {
      if (!calls.update) calls.update = params
      calls.updates.push(params)
      return {}
    },
    ensurePrice: async (plan, _product, interval) => ({ priceId: `price_${plan.product_id}_${interval}`, amountCents: (interval === "year" ? plan.yearly_price_cents : plan.monthly_price_cents) ?? 0 }),
    sync: async () => null,
    reconcile: async () => {
      calls.reconciled++
      return null
    },
    tell: async (_id, extra) => {
      calls.told = extra.changeKind
      return null
    },
    ...over,
  })
  {
    const db = world()
    const ch = (await planChoices(db as never, community, person)) as { ok: boolean; value?: { canChange: boolean; plans: { tierId: string; current: unknown }[] } }
    check("the member sees both plans, theirs marked, and can change", !!ch.ok && !!ch.value?.canChange && ch.value.plans.length === 2 && ch.value.plans.find((p) => p.tierId === "t-std")?.current !== null)
    const pre = (await previewPlanChange(db as never, community, person, { tierId: "t-pre", interval: "month" }, deps())) as { ok: boolean; value?: { kind: string; dueNowCents: number; nextChargeAt: string | null } }
    check("upgrade preview: Stripe's amount due now, nothing changed", !!pre.ok && pre.value?.kind === "upgrade" && pre.value.dueNowCents === 150000 && !calls.update && db.tables.memberships[0].product_id === STD)
    const done = (await applyPlanChange(db as never, community, person, { tierId: "t-pre", interval: "month" }, deps())) as { ok: boolean }
    const u = calls.update as { items?: { id: string; price: string }[]; proration_behavior?: string; payment_behavior?: string; metadata?: { product_id?: string } } | undefined
    /* Changed on purpose (round AG): an upgrade is held until paid (pending_if_incomplete), so a bank's check can finish it in the browser. */
    check("upgrade: the one item moves to the new price, invoiced now, held until paid", !!done.ok && u?.items?.[0]?.id === "si_1" && u.items[0].price === `price_${PRE}_month` && u.proration_behavior === "always_invoice" && u.payment_behavior === "pending_if_incomplete" && !u.metadata)
    const meta = calls.updates.find((x) => (x as { metadata?: unknown }).metadata) as { metadata?: { product_id?: string } } | undefined
    check("once paid, the subscription's metadata and the membership row name the new plan", meta?.metadata?.product_id === PRE && db.tables.memberships[0].product_id === PRE && db.tables.memberships[0].title === "Premium")
    check("the member is emailed that their plan changed", calls.told === "upgrade")
    check("the member's tier is brought in step, and the change audited", calls.reconciled === 1 && db.tables.community_audit_log.some((r) => (r as { action?: string }).action === "membership.upgraded"))
  }
  {
    calls.update = undefined
    calls.updates = []
    const db = world()
    const held = (await applyPlanChange(db as never, community, person, { tierId: "t-pre", interval: "month" }, deps({ update: async () => ({ pending_update: { expires_at: 1 }, latest_invoice: { confirmation_secret: { client_secret: "pi_1_secret_x" } } }) }))) as { ok: boolean; value?: { needsAction?: { clientSecret: string } } }
    check("an upgrade the bank wants to confirm: the secret for the page, the member not moved yet", !!held.ok && held.value?.needsAction?.clientSecret === "pi_1_secret_x" && db.tables.memberships[0].product_id === STD)
    const early = (await finishPlanChange(db as never, community, person, { tierId: "t-pre", interval: "month" }, deps())) as { ok: boolean; error?: string }
    check("finishing before Stripe shows the new price paid changes nothing", !early.ok && early.error === "not_paid" && db.tables.memberships[0].product_id === STD)
    const paid = (await finishPlanChange(db as never, community, person, { tierId: "t-pre", interval: "month" }, deps({ retrieve: async () => ({ id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ id: "si_1", price: { id: `price_${PRE}_month` } }] } }) }))) as { ok: boolean; value?: { kind: string } }
    check("once Stripe shows it paid, the finish moves the member to the new plan", !!paid.ok && paid.value?.kind === "upgrade" && db.tables.memberships[0].product_id === PRE)
  }
  {
    calls.update = undefined
    const db = world()
    const same = (await applyPlanChange(db as never, community, person, { tierId: "t-std", interval: "month" }, deps())) as { ok: boolean; error?: string }
    check("the plan they already have is refused", !same.ok && same.error === "same_plan" && !calls.update)
    const noYear = (await previewPlanChange(db as never, community, person, { tierId: "t-pre", interval: "year" }, deps())) as { ok: boolean; error?: string }
    check("an interval the plan does not sell is refused", !noYear.ok && noYear.error === "interval_unavailable")
    const yearly = (await previewPlanChange(db as never, community, person, { tierId: "t-std", interval: "year" }, deps())) as { ok: boolean; value?: { kind: string; proration: string } }
    check("monthly to annual on the same plan: its own kind, invoiced now", !!yearly.ok && yearly.value?.kind === "interval" && yearly.value.proration === "always_invoice")
    const bad = (await applyPlanChange(db as never, community, person, { tierId: "nope", interval: "month" }, deps())) as { ok: boolean; error?: string }
    check("a plan not on sale here is refused", !bad.ok && bad.error === "plan_unavailable")
  }
  {
    calls.update = undefined
    calls.previewed = 0
    const db = world({ status: "trialing", trial_end: "2026-10-24T12:00:00Z" })
    const t = (await previewPlanChange(db as never, community, person, { tierId: "t-pre", interval: "month" }, deps())) as { ok: boolean; value?: { dueNowCents: number; trialing: boolean; nextChargeAt: string | null } }
    check("during a trial: nothing charged, Stripe not even asked, the trial's end is the next charge", !!t.ok && t.value?.dueNowCents === 0 && t.value.trialing && calls.previewed === 0 && t.value.nextChargeAt === "2026-10-24T12:00:00Z")
    await applyPlanChange(db as never, community, person, { tierId: "t-pre", interval: "month" }, deps())
    const tu = calls.update as { proration_behavior?: string; payment_behavior?: string } | undefined
    check("and the change during a trial prorates nothing", tu?.proration_behavior === "none" && tu.payment_behavior === undefined)
  }
  {
    const pd = (await applyPlanChange(world({ status: "past_due" }) as never, community, person, { tierId: "t-pre", interval: "month" }, deps())) as { ok: boolean; error?: string }
    check("past due: update the card first", !pd.ok && pd.error === "past_due")
    const ending = (await planChoices(world({ cancel_at_period_end: true }) as never, community, person)) as { ok: boolean; value?: { canChange: boolean; reason: string | null } }
    check("set to end: resume first", !!ending.ok && ending.value?.canChange === false && /Resume/.test(ending.value.reason ?? ""))
    const db = world()
    const declined = (await applyPlanChange(db as never, community, person, { tierId: "t-pre", interval: "month" }, deps({ update: async () => { throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError", raw: { message: "Your card was declined." } }) } }))) as { ok: boolean; status?: number; message?: string }
    check("a declined upgrade changes nothing, and says so", !declined.ok && declined.status === 402 && /Nothing changed/.test(declined.message ?? "") && db.tables.memberships[0].product_id === STD)
  }
  {
    const now = Date.parse("2026-10-17T12:00:00Z")
    const counts = subscriberCounts([
      { product_id: "p", status: "active", trial_end: null },
      { product_id: "p", status: "trialing", trial_end: "2026-10-20T00:00:00Z" },
      { product_id: "p", status: "active", trial_end: "2026-10-01T00:00:00Z" },
      { product_id: "p", status: "canceled", trial_end: "2026-10-02T00:00:00Z" },
      { product_id: "p", status: "past_due", trial_end: null },
    ], now).get("p")
    check("creators see per plan: paying, on a trial, and ended trials now paying", JSON.stringify(counts) === JSON.stringify({ paying: 3, trialing: 1, trialsEnded: 2, trialsConverted: 1 }), counts)
    check("the plan card draws them", /data-tier-subscribers/.test(read("components/community/creator/settings-section.tsx")))
  }
  {
    const gate = code("lib/communities/server/join.ts")
    check("a free member may buy a paid plan (an upgrade); somebody paying or running the community may not", /const paying = \(PAID_SOURCES as readonly string\[\]\)\.includes/.test(gate) && /if \(paying \|\| staff\)/.test(gate))
    /* Changed on purpose (round 39): a member's home address is drawn by memberHome, whichever way the member was found. */
    check("a plan picked before signing in, by somebody already in, goes on in the Membership page", /const home = `\/community\/\$\{communitySlug\}`/.test(code("app/(marketing)/community/[slug]/page.tsx")) && /redirect\(`\$\{home\}\/membership\?\$\{keep\.toString\(\)\}`\)/.test(code("app/(marketing)/community/[slug]/page.tsx")))
    const jc = code("components/community/public/join-controls.tsx")
    check("inside, a free member's Upgrade opens the paid plans or the one checkout", /export function UpgradeButton/.test(jc) && /<UpgradeButton \/>/.test(code("components/community/member/membership.tsx")) && /o\.kind === "paid" && !!o\.checkout/.test(jc))
    check("an upgrade the bank checks is confirmed in Stripe's own window, then finished by the server", /confirmCardPayment\(r\.data\.needsAction\.clientSecret\)/.test(code("components/community/membership/change-plan.tsx")) && /finish: true/.test(code("components/community/membership/change-plan.tsx")))
  }
  const planRoute = code("app/api/community/[communityId]/membership/plan/route.ts")
  check("the plan route: switch first, then who is asking, rate limited, never cached", (planRoute.match(/const off = await requireCommunitiesOn\(\)\s*if \(off\) return off[\s\S]*?await person\(\)/g) ?? []).length === 2 && /viewerContext\(/.test(planRoute) && /rateLimit\(/.test(planRoute) && /no-store/.test(planRoute))
  check("Change plan sits on the member's plan card", /<ChangePlan /.test(code("components/community/membership/cancel-membership.tsx")))

  console.log("\nThe welcome popup")
  check("a welcome video can be YouTube, Vimeo or Loom, and nothing else", !!welcomeVideoSrc("https://youtu.be/dQw4w9WgXcQ") && !!welcomeVideoSrc("https://vimeo.com/123456789") && !!welcomeVideoSrc("https://www.loom.com/share/0123456789abcdef0123456789abcdef") && !welcomeVideoSrc("https://example.com/v.mp4"))
  check("and the player does not start on its own", !/autoplay/.test(welcomeVideoSrc("https://youtu.be/dQw4w9WgXcQ") ?? "autoplay"))
  const save = code("lib/communities/server/creator.ts")
  check("the creator's heading, video, button and popup are saved, and a video link we cannot play is refused", /title: typeof o\.title === "string"/.test(save) && /if \(videoUrl && !welcomeVideoSrc\(videoUrl\)\) return no\(400/.test(save) && /style: o\.style === "popup"/.test(save))
  const member = code("components/community/member/data.ts")
  check("the member gets them only while they have not seen the welcome", /viewer\.member\.onboarded_at\) return null/.test(member) && /popup: o\.style === "popup"/.test(member))
  const welcome = code("components/community/member/feed.tsx")
  check("as a popup, closing it any way marks it seen on the server, once for every device", /<MembershipSheet[\s\S]*?onClose=\{\(\) => void done\(\)\}/.test(welcome) && /body: \{ onboarded: true \}/.test(welcome))
  check("the creator edits it with a preview", ["data-welcome-style", "data-welcome-title", "data-welcome-video", "data-welcome-button", "data-welcome-preview"].every((a) => read("components/community/creator/settings-section.tsx").includes(a)))

  console.log("\nThe plan changed email")
  check("a plan change is told to the member through the notification engine, once per change", /"membership\.plan_changed": "MEMBERSHIP_PLAN_CHANGED"/.test(code("lib/notify/workflows/memberships.ts")) && /membership:\$\{membershipId\}:plan:/.test(code("lib/communities/server/plan-change.ts")))
  check("a billing notice: always sent, never budgeted away", /MEMBERSHIP_PLAN_CHANGED: "essential"/.test(code("lib/notify/email-budget.ts")) && /MEMBERSHIP_PLAN_CHANGED: E\(\{ category: "sales", priority: "normal", requirement: "required_service"/.test(code("lib/notify/registry.ts")))

  console.log("\nTax on a membership (round AG)")
  {
    const { membershipTaxQuote, buyerCountry, buyerIp } = await import("@/lib/tax/membership")
    const creator = "cr-tax"
    const taxDb = (digital: boolean) =>
      fakeDb({
        commerce_settings: [{ creator_id: creator, tax_mode: "manual", prices_include_tax: false, tax_on_shipping: false, tax_digital: digital }],
        commerce_tax_rates: [{ id: "r-ro", creator_id: creator, country: "RO", region: null, name: "VAT", rate_bps: 2100 }],
        commerce_tax_overrides: [],
      })
    const ro = await membershipTaxQuote(taxDb(true) as never, { creatorId: creator, productId: "p1", amountCents: 9900, currency: "usd", country: "RO", ip: null })
    check("a creator who taxes digital sales: their rate on the membership, added on top", ro?.taxCents === 2079 && ro.included === false && ro.source === "creator" && /VAT/.test(ro.label), ro)
    check("a buyer outside the creator's regions pays no tax", (await membershipTaxQuote(taxDb(true) as never, { creatorId: creator, productId: "p1", amountCents: 9900, currency: "usd", country: "US", ip: null })) === null)
    check("a creator who does not tax digital sales charges none: Storelib never invents a rate", (await membershipTaxQuote(taxDb(false) as never, { creatorId: creator, productId: "p1", amountCents: 9900, currency: "usd", country: "RO", ip: null })) === null)
    const h = new Headers({ "x-vercel-ip-country": "ro", "x-forwarded-for": "203.0.113.9, 10.0.0.1" })
    check("the buyer's country and address come from the request, no form", buyerCountry(h) === "RO" && buyerIp(h) === "203.0.113.9" && buyerCountry(new Headers({ "x-vercel-ip-country": "XX" })) === null)
    const taxMod = code("lib/tax/membership.ts")
    check("Stripe Tax only when Storelib turns it on, and the subscription then carries automatic tax", /STRIPE_TAX/.test(taxMod) && /automaticTax: true/.test(taxMod) && /params\.automatic_tax = \{ enabled: true \}/.test(code("lib/memberships/billing.ts")))
    check("the creator's rate rides every renewal as a Stripe tax rate", /stripe\.taxRates\.create/.test(taxMod) && /params\.default_tax_rates = p\.taxRateIds/.test(code("lib/memberships/billing.ts")))
    check("the checkout shows the same tax it charges", /membershipTaxQuote/.test(code("app/api/community/[communityId]/checkout/route.ts")) && /membershipTaxForSubscription/.test(code("app/api/memberships/checkout/route.ts")) && /tax-quote/.test(code("app/checkout/membership-checkout.tsx")))
    check("never claims to file or pay tax", !/(we|Storelib) (file|files|remit|remits|pay|pays) (your|the) tax/i.test(read("lib/tax/membership.ts")))
  }

  console.log("\nCopy")
  const mine = ["components/community/public/join-flow.tsx", "components/community/public/compact-pay.tsx", "lib/tax/membership.ts", "lib/communities/server/plan-checkout.ts", "app/api/community/[communityId]/checkout/route.ts", "lib/communities/plan-change.ts", "lib/communities/server/plan-change.ts", "components/community/membership/change-plan.tsx", "app/api/community/[communityId]/membership/plan/route.ts"]
  const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
  check("no em dash and no banned word", offenders.length === 0, offenders)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
