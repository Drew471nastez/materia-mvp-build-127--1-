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
  check("card details go into Stripe's own fields (StripePay), never inputs of ours", /<StripePay/.test(flow) && !/name="(card|cardNumber|cvc|cvv)"/i.test(flow) && !/autoComplete="cc-/.test(flow))
  check("Powered by Stripe only because the payment runs on Stripe", /PoweredByStripe/.test(flow) && /mode="subscription"/.test(flow))
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

  console.log("\nCopy")
  const mine = ["components/community/public/join-flow.tsx", "lib/communities/server/plan-checkout.ts", "app/api/community/[communityId]/checkout/route.ts"]
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
