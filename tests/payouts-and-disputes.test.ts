/**
 * PAYOUTS SAYS WHAT IS TRUE, AND A DISPUTE IS SOMETHING STORELIB HANDLES.
 *
 * Three things this holds in place.
 *
 * MONEY IN ITS OWN CURRENCY. Payouts drew every figure in dollars: a lei
 * sale read "$360.00", and the balance was Stripe's own divided by a market
 * exchange rate, which is not what reaches the bank. Nothing is converted
 * for display now (lib/payments/display-currency), and when Stripe cannot
 * be read the page shows nothing rather than the creator's all time order
 * totals standing in for a balance.
 *
 * A DISPUTE BELONGS TO SOMEBODY. A Storelib sale is charged on Storelib's
 * own account, so its dispute arrives with no `account` on the event: the
 * old webhook answered "received" and did nothing at all, no order marked,
 * no email, and Storelib paid it. The creator is found from the charge's
 * transfer now, their share is taken back while the case is open, and given
 * back if the bank decides for them (lib/stripe/disputes).
 *
 * THE DEMO IS A DEMO. Made up accounts, behind a password nobody can read
 * out of the code, and the production components drawn with them.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { pickBalance, salesCurrencyOf, upcomingByDay } from "@/lib/payments/display-currency"
import { cleanCreatorNote, disputeFeeMinor, isClosed, isInquiry, outcomeOf, reasonWords, reversibleMinor, stageOf, STAGE_WORDS } from "@/lib/stripe/dispute-facts"
import { creatorBusinessProfile } from "@/lib/payments/stripe/business-profile"
import { demoToken, demoTokenValid, passwordMatches } from "@/lib/payouts-demo/gate"
import { buildScenario, SCENARIOS, type ScenarioId } from "@/components/app/payouts-demo/scenarios"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
  }
}
/* The push harness runs the compiled suite as an ES module, where __dirname does not exist; the repo root is the working directory. */
const root = process.cwd()
const read = (p: string) => untt(readFileSync(join(root, p), "utf8"), p)
/** A file without its block comments: what it does, rather than what it says about itself. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")

console.log("\nThe balance is Stripe's, in Stripe's currency")
{
  const balance = { available: [{ amount: 12_000, currency: "ron" }], pending: [{ amount: 4_000, currency: "ron" }] }
  const picked = pickBalance(balance, "ron")
  check("the account's own currency, with Stripe's amounts unchanged", picked?.currency === "ron" && picked.available === 12_000 && picked.pending === 4_000)
  check("below zero after a dispute stays below zero", pickBalance({ available: [{ amount: -500, currency: "eur" }], pending: [] }, "eur")?.available === -500)
  const mixed = pickBalance({ available: [{ amount: 100, currency: "usd" }, { amount: 9_000, currency: "ron" }], pending: [] }, null)
  check("no preference: the currency holding the most, and the rest is not hidden", mixed?.currency === "ron" && mixed.others.length === 1 && mixed.others[0].currency === "usd")
  check("the preference wins when Stripe holds anything in it", pickBalance({ available: [{ amount: 100, currency: "usd" }, { amount: 9_000, currency: "ron" }], pending: [] }, "usd")?.currency === "usd")
  check("nothing from Stripe is nothing, not a zero in a made up currency", pickBalance(null, "ron") === null && pickBalance({ available: [], pending: [] }, "ron") === null)
  check("sales are counted in the currency they were charged in", salesCurrencyOf([{ currency: "ron" }, { currency: "ron" }, { currency: "usd" }], "eur") === "ron" && salesCurrencyOf([], "eur") === "eur")
  const days = upcomingByDay(
    [
      { status: "pending", available_on: Date.parse("2026-10-09T00:00:00Z") / 1000, net: 4_000, currency: "ron" },
      { status: "pending", available_on: Date.parse("2026-10-09T10:00:00Z") / 1000, net: 1_000, currency: "ron" },
      { status: "available", available_on: Date.parse("2026-10-05T00:00:00Z") / 1000, net: 900, currency: "ron" },
      { status: "pending", available_on: Date.parse("2026-10-07T00:00:00Z") / 1000, net: 700, currency: "usd" },
    ],
    "ron",
  )
  check("arriving soon is Stripe's own dates, one line a day, its currency only", JSON.stringify(days) === JSON.stringify([{ date: "2026-10-09", amount: 5_000, currency: "ron" }]), days)
}

console.log("\nPayouts draws what it was given")
{
  const client = read("app/app/payouts/payouts-client.tsx")
  const page = read("app/app/payouts/page.tsx")
  const api = read("app/api/stripe/payouts/route.ts")
  const chart = read("app/api/stripe/revenue-chart/route.ts")
  check("no conversion left in the page, the client or the payouts answer", ![client, page, api].some((s) => /toUsd|exchangeRate|getMarketExchangeRate/.test(s)))
  check("  each sale in its own currency, each payout in its own", /fmt\(order\.amount_cents, order\.currency \|\| salesCurrency\)/.test(client) && /fmt\(p\.amount, p\.currency\)/.test(client))
  check("  and amounts use that currency's decimals, so yen is not drawn with cents", /const d = decimalsOf\(code\)/.test(client))
  check("the chart is one currency, and another is reported beside it rather than added in", /salesCurrencyOf\(inPeriod/.test(chart) && /otherCurrencies/.test(chart) && !/currency: "usd",/.test(chart))
  check("the heading lost its subtitle", !/Your balance, sales and cash outs/.test(page))
  check("Cash out is the page's one violet action", /const LOOK_CASH_OUT = cn\(accentDepth/.test(client) && /look=\{LOOK_CASH_OUT\}/.test(client) && /const SHEET_CASH_OUT = cn\(accentDepth/.test(client))
  check("the settling wait is Stripe's own days, not a promise of 2 to 7", /settleText\(settleDays\)/.test(client) && !/2 to 7/.test(code("app/app/payouts/payouts-client.tsx")))
  check("  and each amount says the day it becomes available", /Available \{fmtDay\(item\.date\)\}/.test(client) && /Next on \$\{fmtDay\(next\.date\)\}/.test(client))
  check("the help link goes to an article that exists", /HOW_PAYOUTS_WORK = "\/help\/orders-and-payouts\/how-payouts-work"/.test(client) && /slug: "how-payouts-work"/.test(read("lib/help/articles.ts")))
}

console.log("\nThe account panel answers the press, and can be let go")
{
  const client = code("app/app/payouts/payouts-client.tsx")
  const settings = code("components/app/settings/storelib-payments-settings.tsx")
  const flow = code("components/app/settings/payments-setup-flow.tsx")
  /* The owner, October 2026: "when I click update bank, it takes too much to appear, and it doesn't appear smooth". */
  check("the overview is fetched while the page is read, not on the press", /warmOverview\(\)/.test(client) && /if \(paymentsReady\) warmOverview\(\)/.test(client))
  check("the panel opens on the press, before the answer arrives", /if \(manageRequest > 0\) setPanel\(\{ open: true/.test(settings) && !/manageRequest > 0 && data/.test(settings))
  check("  with the same shell and the card's own shapes in it", /export function PaymentsPanelWaiting/.test(flow) && /flow \?\? <PaymentsPanelWaiting/.test(settings))
  /* Changed on purpose: a panel asked to open as setup stays setup when the answer lands (openAs, d5b643082). */
  check("  and the real flow takes its place once it lands", /setPanel\(\(p\) => \(p\.open \? \{ \.\.\.p, mode: openAs === "setup" \? "setup" : modeFor\(view\?\.action\) \} : p\)\)/.test(settings))
  check("every press that opens it says so until it is there", /const openAccountPanel = useCallback/.test(client) && !/onClick: \(\) => setManageRequest/.test(client) && /opening \? <Loader2/.test(client))
  check("  and stops saying so when the panel reports itself shown", /onPanelShown=\{\(\) => setOpening\(false\)\}/.test(client) && /if \(panel\.open\) onPanelShown\?\.\(\)/.test(settings))
  check("it comes and goes on a curve, and the timer matches the leaving", /const ENTER_MS = 260/.test(flow) && /const EXIT_MS = 200/.test(flow) && /\}, EXIT_MS\)/.test(flow) && /data-setup-card\]\]:animate-out/.test(flow))

  /* The owner: a creator should be able to disconnect the current setup and connect another, subtly, somewhere clean on Payouts. */
  check("Payouts offers a different account, quietly, under the bank", /data-switch-account=""/.test(client) && /Use a different account/.test(client) && /Selling under a different name or business\?/.test(client))
  check("  it says what stays and what stops before anything happens", /Your orders, payouts and everything already paid out stay exactly as they are\./.test(client) && /Checkout is closed until payments are set up again/.test(client))
  check("  it warns while money is still in the account", /You still have \{fmt\(holding, currency\)\} in this account/.test(client))
  check("  the server is the one that refuses, with the creator's second yes", /body: JSON\.stringify\(\{ confirm: true \}\)/.test(client) && /Cash out your balance first, then you can disconnect\./.test(code("lib/payments/stripe/connect.ts")))
  check("  and nothing is deleted on an account that ever took money", /const started = !!\(account\.details_submitted \|\| account\.charges_enabled \|\| account\.payouts_enabled\)/.test(code("lib/payments/stripe/connect.ts")))
}

console.log("\nWhat a dispute means")
{
  check("an inquiry is not a chargeback", isInquiry("warning_needs_response") && isInquiry("warning_under_review") && !isInquiry("needs_response") && !isInquiry(null))
  check("closed is won, lost or an inquiry the bank closed", isClosed("won") && isClosed("lost") && isClosed("warning_closed") && !isClosed("under_review"))
  check("the outcome is named", outcomeOf("won") === "won" && outcomeOf("lost") === "lost" && outcomeOf("warning_closed") === "inquiry_closed" && outcomeOf("needs_response") === null)
  check("Stripe's fee comes from the withdrawal, never a guessed $15", disputeFeeMinor([{ amount: -2500, fee: 1500 }]) === 1500 && disputeFeeMinor([{ amount: 2500, fee: 1500 }]) === 0 && disputeFeeMinor(undefined) === 0)
  check("never more is taken back than the creator received", reversibleMinor({ amount: 900 }, 2500) === 900 && reversibleMinor({ amount: 2500 }, 900) === 900 && reversibleMinor({ amount: 900, amount_reversed: 900 }, 900) === 0 && reversibleMinor(null, 900) === 0)
  check("every stage has words a creator can read", Object.values(STAGE_WORDS).every((w) => w.label.length > 0 && w.line.length > 20 && !/stripe|chargeback|acct_|dp_/i.test(w.line)))
  check("the stage follows Stripe's status", stageOf("needs_response") === "respond" && stageOf("warning_needs_response") === "inquiry" && stageOf("won") === "won" && stageOf("warning_closed") === "closed")
  check("the reason is plain words, never Stripe's code", reasonWords("product_not_received").startsWith("The buyer says they did not get") && reasonWords(null).length > 10 && !/_/.test(reasonWords("fraudulent")))
  check("evidence is trimmed, capped and never empty", cleanCreatorNote("  they downloaded it twice  ") === "they downloaded it twice" && cleanCreatorNote("short") === null && cleanCreatorNote(42) === null && (cleanCreatorNote("x".repeat(9000)) ?? "").length === 4000)
}

console.log("\nThe dispute reaches the right creator, and the right money")
{
  const disputes = read("lib/stripe/disputes.ts")
  const hook = read("app/api/stripe/webhook/route.ts")
  const block = hook.slice(hook.indexOf('event.type === "charge.dispute.created" ||'))
  check("a Storelib sale's dispute is no longer dropped for having no account", !/if \(!connectedAccountId\) \{\s*return NextResponse\.json\(\{ received: true \}\)/.test(block) && /disputeContext\(dispute, accountOnEvent\)/.test(block))
  check("  the creator is the account the money went to, then the checkout's own id", /transfer_data\?\.destination/.test(disputes) && /metadata\?\.creator_id/.test(disputes) && /disputeCreator\(supabaseAdmin, ctx\)/.test(block))
  check("the creator's share is taken back once, by Stripe's idempotency key", /idempotencyKey: `storelib:dispute:\$\{dispute\.id\}:reversal`/.test(disputes) && /createReversal/.test(disputes))
  check("  and given back once if they win", /idempotencyKey: `storelib:dispute:\$\{dispute\.id\}:restore`/.test(disputes) && /giveBackAfterWon\(ctx, dispute, reversed\)/.test(block))
  check("an inquiry moves no money", /if \(!ctx\.onPlatform \|\| isInquiry\(dispute\.status\)\) return \{ state: "not_needed"/.test(disputes) && /if \(!inquiry\) await takeBack\(\)/.test(block))
  check("  and leaves the sale a sale until a case is really opened", /const rows = inquiry\n\s*\? \(\(\(await supabaseAdmin/.test(block))
  check("the ledger lines are in the dispute's own currency", /amountText\(totalDeduction, disputeCurrency\)/.test(block) && !/\$\$\{\(disputeAmountCents \/ 100\)/.test(block))
  check("each case is recorded for the creator and for support", /saveDispute\(supabaseAdmin, \{/.test(block) && /payment_disputes/.test(disputes))
  check("  and a missing table never breaks the money or the email", /42P01|PGRST205/.test(disputes))
  const sql = read("supabase/sql/run-now/82_payment_disputes.sql")
  check("the table is private, server only, with row level security on", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.payment_disputes FROM PUBLIC, anon, authenticated/.test(sql) && /GRANT SELECT, INSERT, UPDATE ON public\.payment_disputes TO service_role/.test(sql))
  check("  its mirror and check are in place", read("supabase/migrations/20261102_payment_disputes.sql") === sql && /as p82_payment_disputes/.test(read("supabase/sql/run-now/99_check_after.sql")))
}

console.log("\nWhat the creator sees and may do")
{
  const route = read("app/api/payments/disputes/route.ts")
  const client = read("app/app/payouts/payouts-client.tsx")
  check("a creator reads only their own cases, found by their own creator row", /\.eq\("creator_id", id\)/.test(route) && /\.eq\("user_id", user\.id\)/.test(route))
  check("  and may only write to one of their own, while it is open", /\.eq\("id", disputeId\)\n\s*\.eq\("creator_id", id\)/.test(route) && /already closed/.test(route))
  check("no Stripe id ever reaches the browser", !/stripe_dispute_id/.test(route.slice(route.indexOf("function shown"))) && !/dp_|du_/.test(client))
  check("the page has a disputes card, and the dispute emails land on it", /<DisputesCard \/>/.test(client) && /id="disputes"/.test(client) && /disputes: "\/app\/payouts#disputes"/.test(read("lib/notify/templates/catalog.ts")))
  check("the creator is told Storelib answers the bank, not told to go to Stripe", /Storelib answers the bank/.test(client) && !/Send your evidence through Stripe|send Stripe your evidence/.test(client + read("lib/notifications/rules/payments.ts")))
  check("how a dispute ended is its own email", /DISPUTE_CLOSED/.test(read("lib/notify/types.ts")) && /case "dispute.closed":/.test(read("lib/notify/workflows/sales.ts")))
}

console.log("\nSetup asks for identity, and says so")
{
  const flow = read("components/app/settings/payments-setup-flow.tsx")
  const rules = read("lib/notifications/rules/payments.ts")
  check("verification collects everything the account needs, not only today's", /eventually_due/.test(read("lib/payments/stripe/own-form-rules.ts")) && /function DetailsStep/.test(flow))
  check("an account left half set up is told, published products or not", /kind: "verification_unfinished"/.test(rules) && /needs: \["creator"\]/.test(rules.slice(rules.indexOf('kind: "verification_unfinished"'))))
  check("  it is critical and pushed, like the rest of the money rules", /verification_unfinished[\s\S]{0,200}category: "critical"[\s\S]{0,200}push: true/.test(rules))
  check("  and it stands in for the setup to-do rather than doubling it", /"verification_unfinished"/.test(read("lib/notifications/rules/index.ts")))
}

console.log("\nStripe is told what the creator really sells")
{
  const profile = creatorBusinessProfile({ username: "AndreiRadu", displayName: "Andrei Radu", platformUrl: "https://storelib.com" })
  check("the creator's own page, not storelib.com", profile.url === "https://storelib.com/andreiradu")
  check("  a description of the real business, not their bio", profile.product_description.includes("digital products") && profile.product_description.includes("https://storelib.com/andreiradu") && profile.product_description.length > 120)
  check("  and digital goods as the trade", profile.mcc === "5818")
  check("a creator with no username falls back to the platform, never to nothing", creatorBusinessProfile({ username: null, displayName: null, platformUrl: "https://storelib.com" }).url === "https://storelib.com")
  check("the account is opened with it", /business_profile: creatorBusinessProfile\(\{ username: row\.username, displayName: row\.display_name/.test(read("lib/payments/stripe/connect.ts")))
}

console.log("\nThe demo")
{
  const gate = read("lib/payouts-demo/gate.ts")
  check("the password is not in the code, only its hash", !/Amfetamina/i.test(gate) && /createHash\("sha256"\)/.test(gate) && /PAYOUTS_DEMO_PASSWORD_SHA256/.test(gate))
  check("  and it is checked in constant time", /timingSafeEqual/.test(gate))
  check("the right password opens it, a wrong one does not", passwordMatches("Amfetamina11") && !passwordMatches("amfetamina11") && !passwordMatches("") && !passwordMatches(null))
  /* A signing key comes from the environment in production; the harness has none, so the test gives it one. */
  process.env.PAYOUTS_DEMO_SECRET = "test-only-demo-signing-secret"
  const token = demoToken("user-1")
  check("the cookie is signed for one person", !!token && demoTokenValid(token, "user-1") && !demoTokenValid(token, "user-2"))
  check("  it runs out", !!token && !demoTokenValid(token, "user-1", Date.now() + 8 * 24 * 3600 * 1000))
  check("  and nothing else opens it", !demoTokenValid("1799999999.".padEnd(75, "a"), "user-1") && !demoTokenValid(null, "user-1") && !demoTokenValid(token, null))
  const unlock = read("app/api/payouts-demo/unlock/route.ts")
  check("the door is rate limited and the cookie is httpOnly", /rateLimit\(/.test(unlock) && /httpOnly: true/.test(unlock))
  const page = read("app/app/payouts/demo/page.tsx")
  check("the page checks the cookie on the server and keeps itself out of search", /demoTokenValid\(token, user\.id\)/.test(page) && /robots: \{ index: false/.test(page))
  const demo = read("components/app/payouts-demo/payouts-demo.tsx")
  check("it draws the production components, not a copy of them", /from "@\/app\/app\/payouts\/payouts-client"/.test(demo) && /<PayoutsClient/.test(demo) && /StorelibPaymentsInline/.test(demo))
  check("  and answers their requests in this tab only, putting fetch back after", /window\.fetch = wrapped/.test(demo) && /window\.fetch = original/.test(demo))
  check("every scenario builds, with its status from the real mapper", SCENARIOS.every((s) => {
    const built = buildScenario(s.id as ScenarioId, "ron")
    return built.status.title.length > 0 && built.currency === "ron" && built.orders.every((o) => o.currency === "ron")
  }))
  const dispute = buildScenario("dispute", "ron")
  check("  the dispute one has an open case and a won one", dispute.disputes.length === 2 && dispute.disputes.some((d) => d.stage === "respond") && dispute.orders.some((o) => o.status === "disputed"))
  check("  the setup one is not ready, so the page is the setup card", buildScenario("setup", "ron").paymentsReady === false && buildScenario("active", "ron").paymentsReady === true)
  check("  and a scenario in another currency prices in that currency", buildScenario("active", "usd").orders.every((o) => o.currency === "usd"))
  check("the demo lives under /app/payouts/demo and nowhere else", existsSync(join(root, "app/app/payouts/demo/page.tsx")) && !/payouts-demo/.test(read("app/app/payouts/page.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
