/**
 * ===========================================================================
 *  ROUND AX, TRACK 5: A FREE BASKET PRESSED AGAIN IS THE SAME BASKET
 * ===========================================================================
 * A basket a discount code makes free is written by fulfilFreeCart
 * (lib/checkout/fulfil-cart-session) from two routes: a built site's cart
 * (app/api/checkout/cart, with `buyer`) and the website's checkout
 * (app/api/checkout/site, action "free"). Its session id, which names every
 * line's receipt token, was random on every press, so a press whose answer
 * was lost and was pressed again wrote a second basket: a second receipt, a
 * second sale notice, a one use code used twice or "used up" for the buyer's
 * own order, limited copies taken twice.
 *
 *   1. the session id for one press (lib/checkout/free-claim freeBasketSession)
 *   2. the pages send their press's attempt id, the routes write under it (wiring)
 *
 * Through the real routes (the same press again, two sends at once, a page
 * from before this round): tests/free-basket-retry-ax-journey.test.ts.
 */
import { readCode } from "./_source"
import { claimedBasket, freeBasketSession, isFreeBasketSession } from "@/lib/checkout/free-claim"
import { cartReceiptToken } from "@/lib/checkout/cart-tokens"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}

/* The server's secret the ids are derived with (production has one; a server without one is checked below). */
process.env.RECEIPT_TOKEN_SECRET = process.env.RECEIPT_TOKEN_SECRET || "receipt-ax5-test"

async function units() {
  console.log("\n1. One press, one basket (lib/checkout/free-claim freeBasketSession)")
  const A = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
  const items = [{ productId: "p1", quantity: 1 }, { productId: "p2", variantId: "v2", quantity: 2 }]
  const one = freeBasketSession(A, { store: "cart", email: "Bea@Example.com ", items })
  check("the same press names the same basket", !!one && one === freeBasketSession(A, { store: "cart", email: "bea@example.com", items: JSON.parse(JSON.stringify(items)) }), one)
  check("  a session id fulfilFreeCart takes (free_ and the derived id)", isFreeBasketSession(one) && /^free_[A-Za-z0-9_-]{32}$/.test(String(one)), one)
  check("  the keys of a line in another order are the same basket", one === freeBasketSession(A, { store: "cart", email: "bea@example.com", items: [{ quantity: 1, productId: "p1" }, { quantity: 2, variantId: "v2", productId: "p2" }] }))
  const others = [
    freeBasketSession("ffffffff-e5f6-4a7b-8c9d-0e1f2a3b4c5d", { store: "cart", email: "bea@example.com", items }),
    freeBasketSession(A, { store: "site:c1", email: "bea@example.com", items }),
    freeBasketSession(A, { store: "cart", email: "cal@example.com", items }),
    freeBasketSession(A, { store: "cart", email: "bea@example.com", items: [items[0]] }),
    freeBasketSession(A, { store: "cart", email: "bea@example.com", items: [{ ...items[0], quantity: 2 }, items[1]] }),
  ]
  check("another press, store, email or basket is another basket", others.every((o) => !!o && o !== one) && new Set(others).size === others.length, others)
  check("no attempt id, or one that is not an id: no name (a random basket, as before)", [undefined, null, "", "short", "<script>alert(1)</script>-xxxxxxxx", 42, { id: A }].every((a) => freeBasketSession(a, { store: "cart", email: "bea@example.com", items }) === null))
  check("no email or no lines: no name", freeBasketSession(A, { store: "cart", email: "", items }) === null && freeBasketSession(A, { store: "cart", email: "bea@example.com", items: [] }) === null && freeBasketSession(A, { store: "cart", email: "bea@example.com", items: "p1" }) === null)
  const secrets = [process.env.RECEIPT_TOKEN_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY]
  delete process.env.RECEIPT_TOKEN_SECRET
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  const noSecret = freeBasketSession(A, { store: "cart", email: "bea@example.com", items })
  if (secrets[0] !== undefined) process.env.RECEIPT_TOKEN_SECRET = secrets[0]
  if (secrets[1] !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = secrets[1]
  check("a server with no secret to derive with names nothing (random, as before)", noSecret === null)
  check("fulfilFreeCart refuses anything else as a session id", [null, undefined, "cs_test_123", "free_", "free_a b", `free_${"x".repeat(80)}`, "pi_123"].every((v) => !isFreeBasketSession(v)))

  /* The lookup reads the first line under its own token and session, nothing looser. */
  const token = one ? cartReceiptToken(one, 0) : ""
  const rows: Record<string, unknown>[] = [{ id: "o1", receipt_token: token, stripe_session_id: "free_someoneelse000000000000", product_id: "p1" }]
  const db = { from: () => ({ select: () => ({ eq: (_c: string, v: string) => ({ limit: async () => ({ data: rows.filter((r) => r.receipt_token === v), error: null }), maybeSingle: async () => ({ data: { creator_id: "c1" }, error: null }) }) }) }) }
  check("a line under the token but another session is not this basket", (await claimedBasket(db, one)) === null)
  rows[0].stripe_session_id = one
  const found = await claimedBasket(db, one)
  check("  under both, it is: its receipt, its cookie, its store", !!found && found.receiptToken === token && found.creatorId === "c1" && typeof found.sessionFingerprint === "string" && found.sessionFingerprint.length === 32, found)
  check("  a database that fails to answer is \"none\", never an error", (await claimedBasket({ from: () => { throw new Error("down") } }, one)) === null && (await claimedBasket(db, null)) === null)
}

function wiring() {
  console.log("\n2. The pages send their press, the routes write under it (wiring)")
  const cartPage = readCode("components/website-builder/cart-page-body.tsx")
  check("a built site's cart page sends one attempt id per view with a free basket's buyer", /useRef<string \| null>\(null\)/.test(cartPage) && /buyer:\s*\{[^}]*\},\s*attemptId:\s*attemptIdOf\(freeAttempt\)/.test(cartPage))
  const sitePage = readCode("app/(storelib)/checkout/site/site-checkout.tsx")
  check("the website's checkout sends one attempt id per view with its free order", /action:\s*"free"[^\n]*attemptId:\s*attemptIdOf\(freeAttempt\)/.test(sitePage) && /freeAttempt = React\.useRef<string \| null>\(null\)/.test(sitePage))
  const fulfil = readCode("lib/checkout/fulfil-cart-session.ts")
  check("fulfilFreeCart writes under the press's session id when it is one, else a random one as before", /const sessionId = isFreeBasketSession\(b\.sessionId\) \? b\.sessionId : `free_\$\{randomBytes\(18\)/.test(fulfil))
  const cart = readCode("app/api/checkout/cart/route.ts")
  check("the cart route looks for the press's basket before the price, and writes under it", cart.indexOf("claimedBasket(admin, basketSession)") > -1 && cart.indexOf("claimedBasket(admin, basketSession)") < cart.indexOf("await priceCart(") && /sessionId:\s*c\.basketSession/.test(cart))
  const site = readCode("app/api/checkout/site/route.ts")
  const free = site.slice(site.indexOf("async function free("))
  check("the website's free order looks before the price, and writes under it", free.indexOf("const early = await claimed()") > -1 && free.indexOf("const early = await claimed()") < free.indexOf("priceSiteCart(") && /sessionId:\s*basketSession/.test(free))
  check("  both give back a code's place a second send did not use", /!written\.wroteFirst && holder\) await releaseCouponHold/.test(cart) && /!written\.wroteFirst && holder && coupon\) await releaseCouponHold/.test(free))
}

async function main() {
  await units()

  wiring()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
