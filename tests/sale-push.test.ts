/**
 * ===========================================================================
 *  EVERY SALE REACHES THE SELLER'S PHONE, ONCE
 * ===========================================================================
 * The push for a sale used to be sent by each caller in its own way, never
 * with the currency (so never with the amount), and not at all for a quick
 * free claim or a community program or module. Held here:
 *
 *   ONE PLACE      lib/orders/sale-events.ts pushes the purchase, only for the
 *                  caller that recorded its order.created first, after the
 *                  response; no other caller of raiseSaleEvents pushes a sale
 *                  of its own (a membership renewal, which is not a purchase,
 *                  aside).
 *   EVERY CHANNEL  each path that writes a sale raises it there, with its
 *                  currency, and a community program or module sale pushes
 *                  its owner once, from the call that granted it.
 *   THE WORDS      a sale, a basket, a free claim, an unknown currency.
 *   THE PHONE      the same order collapses on the device; Android has the
 *                  channel the server names.
 *
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import { saleText } from "@/lib/push/sale-text"
import { pushTapTarget } from "@/lib/push/tap"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`)
  }
}

console.log("\nOne place")
const events = readCode("lib/orders/sale-events.ts")
check("the purchase is pushed when its order.created is new, or could not be recorded at all", /if \(recorded\.fresh \|\| !recorded\.ok\)/.test(events) && /afterResponse\(\(\) => pushPurchase\(/.test(events))
check("emit says which call recorded the event", /fresh: result\.status === "inserted"/.test(readCode("lib/notify/outbox.ts")))
check("the push is sent after the response, and runs now outside a request", /after\(safe\)/.test(events) && /catch \{\s*void safe\(\)/.test(events))
check("a sale is the seller's own: Settings' push switch, which is for communities and follows, does not hold it", !/readPushEnabled/.test(events))
check("a basket names its first item and how many more", /more: Math\.max\(0, p\.lineCount - 1\)/.test(events))

const CALLERS = [
  "app/api/stripe/webhook/route.ts",
  "app/api/checkout/process/route.ts",
  "app/api/checkout/quick-free/route.ts",
  "lib/physical/checkout-server.ts",
  "lib/checkout/fulfil-payment.ts",
  "lib/checkout/fulfil-cart-session.ts",
]
for (const f of CALLERS) {
  const src = readCode(f)
  check(`${f} raises the sale`, /raiseSaleEvents\((admin|supabaseAdmin|db), \{/.test(src))
  check(`${f} sends no sale push of its own`, !/notifySale/.test(src))
}
const membership = readCode("lib/memberships/sync.ts")
check("a membership's first payment is a purchase, and only a renewal pushes from the membership itself", /purchase: firstPayment \?/.test(membership) && /if \(!firstPayment\) \{\s*await step\("push"/.test(membership) && !/notifySale/.test(membership))

console.log("\nEvery channel, in its own currency")
check("a physical order names its currency", /currency: co\.currency \?\? null,\s*buyerEmail: co\.buyer_email/.test(readCode("lib/physical/checkout-server.ts")))
check("a website basket names its currency", /currency: ctx\.currency \?\? null,\s*buyerEmail: ctx\.buyerEmail/.test(readCode("lib/checkout/fulfil-cart-session.ts")))
check("a community program sale pushes its owner once, from the call that granted it", /if \(done\.created\) pushCommunitySale\(db, \{/.test(readCode("lib/communities/server/learn-checkout.ts")))
check("a community module sale pushes its owner once, from the call that granted it", /if \(!error\) pushCommunitySale\(db, \{/.test(readCode("lib/communities/server/module-sales.ts")))
check("a community sale never pushes the buyer, and opens the community's Learn", /userId === s\.buyerId\) return/.test(events) && /url: `\/app\/community\/\$\{s\.communityId\}\/learn`/.test(events))
check("a tap on a community sale opens its Learn", pushTapTarget({ type: "notification", kind: "sale", url: "/app/community/abc/learn" }) === "/app/community/abc/learn")
/* Changed on purpose (r57): the order itself, not /app/sales (a redirect to the list that dropped which order it was). */
check("a tap on an order's sale opens that order", pushTapTarget({ type: "sale", orderId: "x" }) === "/app/orders?order=x" && pushTapTarget({ type: "sale" }) === "/app/orders")

console.log("\nThe words")
const one = saleText({ productName: "Preset pack", amountCents: 1240, currency: "usd" }, null)
check("a sale names the item and its price", one.title === "🎉 You made a sale!" && one.body === "You sold Preset pack for $12.40", one)
const basket = saleText({ productName: "Mug", amountCents: 4500, currency: "eur", more: 2 }, null)
check("a basket names the first item and how many more", /^You sold Mug and 2 more for /.test(basket.body) && basket.body.includes("45"), basket)
const lei = saleText({ productName: "Tee", amountCents: 4900, currency: "ron" }, null)
check("a sale in lei is in lei, never dollars", !lei.body.includes("$") && /lei|RON/.test(lei.body), lei)
check("an unknown currency names no amount rather than guessing one", saleText({ productName: "Tee", amountCents: 900, currency: null }, null).body === "You sold Tee")
const free = saleText({ productName: "Guide", amountCents: 0, currency: "usd" }, "First sale!")
check("a free claim is a free order, never a sale or a milestone", free.title === "New free order" && free.body === "Someone got Guide", free)
check("a milestone takes the sale's title", saleText({ productName: "Tee", amountCents: 900, currency: "usd" }, "Your 10th sale").title === "Your 10th sale")

console.log("\nThe phone")
const notifications = readCode("lib/push/notifications.ts")
check("the same order told twice collapses on the device", /collapseKey: `sale:\$\{opts\.orderId\}`/.test(notifications))
const client = readCode("lib/push/client.ts")
check("Android has the channel every push names, with a banner and a sound", /createChannel\(\{ id: "default", name: "Notifications", importance: 4/.test(client) && /channelId: "default"/.test(readCode("lib/push/sender.ts")))
check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/sale-push.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
