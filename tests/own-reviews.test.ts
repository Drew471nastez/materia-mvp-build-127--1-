/**
 * A seller does not review what a seller sells.
 *
 * The purchase check does not stop this on its own: a creator can hold an
 * entitlement to their own product, so "has bought it" is true for the person
 * who wrote it.
 *
 * The second half is the same person with a second account, which cannot be
 * solved, only made expensive. lib/reviews/eligibility links accounts by the
 * things that cost money to duplicate — a Stripe Connect account, a PayPal
 * merchant id — and by the seller's own published address. These drive the
 * real function with known rows.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { checkReviewEligibility, isOwnProduct } from "../lib/reviews/eligibility"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`)
  }
}

/**
 * Enough of the builder for the three reads. `creators` is asked for twice
 * with different shapes — once embedded under a product, once as the
 * reviewer's own rows — so the fake answers each table by name.
 */
function admin({
  seller,
  ownCreators = [],
  recentReviews = 0,
}: {
  seller: any
  ownCreators?: any[]
  recentReviews?: number
}) {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        maybeSingle: () => Promise.resolve({ data: table === "products" ? seller : null, error: null }),
        then: (res: any, rej: any) =>
          Promise.resolve(
            table === "creators"
              ? { data: ownCreators, error: null }
              : table === "reviews"
                ? { count: recentReviews, error: null }
                : { data: null, error: null },
          ).then(res, rej),
      }
      return builder
    },
  }
}

const OTHER_SELLER = { creator: { user_id: "seller", stripe_account_id: "acct_1", paypal_merchant_id: "pp_1", support_email: "hello@shop.com" } }

async function main() {
  console.log("\nThe owner of the listing\n")

  check("your own product is yours", await isOwnProduct(admin({ seller: { creator: { user_id: "u1" } } }), "p1", "u1"))
  /* PostgREST returns a one-to-one embed as an object in some versions and a
     single-element array in others. Reading one shape makes the seller look
     like nobody, and every check then passes — it fails OPEN. */
  check(
    "and is still yours when the embed arrives as an array",
    await isOwnProduct(admin({ seller: { creator: [{ user_id: "u1" }] } }), "p1", "u1"),
  )
  check("somebody else's is not", !(await isOwnProduct(admin({ seller: { creator: { user_id: "u2" } } }), "p1", "u1")))

  const own = await checkReviewEligibility(admin({ seller: { creator: { user_id: "u1" } } }), {
    productId: "p1",
    userId: "u1",
  })
  check("and the full check refuses it by name", !own.ok && own.code === "own_product", JSON.stringify(own))

  console.log("\nA second account, linked by what is expensive to duplicate\n")

  const byStripe = await checkReviewEligibility(
    admin({ seller: OTHER_SELLER, ownCreators: [{ stripe_account_id: "acct_1", paypal_merchant_id: null }] }),
    { productId: "p1", userId: "alt", email: "alt@example.com" },
  )
  check("a shared Stripe Connect account is one seller", !byStripe.ok && byStripe.code === "linked_seller", JSON.stringify(byStripe))

  const byPaypal = await checkReviewEligibility(
    admin({ seller: OTHER_SELLER, ownCreators: [{ stripe_account_id: null, paypal_merchant_id: "pp_1" }] }),
    { productId: "p1", userId: "alt", email: "alt@example.com" },
  )
  check("so is a shared PayPal merchant id", !byPaypal.ok && byPaypal.code === "linked_seller")

  const byEmail = await checkReviewEligibility(admin({ seller: OTHER_SELLER }), {
    productId: "p1",
    userId: "alt",
    /* Case and spacing are not a different person. */
    email: "  HELLO@Shop.com ",
  })
  check("and so is the seller's own published address", !byEmail.ok && byEmail.code === "linked_seller")

  console.log("\nAnd an unconnected buyer is left alone\n")

  const stranger = await checkReviewEligibility(
    admin({ seller: OTHER_SELLER, ownCreators: [{ stripe_account_id: "acct_9", paypal_merchant_id: "pp_9" }] }),
    { productId: "p1", userId: "buyer", email: "buyer@example.com" },
  )
  check("a buyer who also sells, but not this, may review", stranger.ok, JSON.stringify(stranger))

  /* Two sellers with no payout account yet both read null. Null is not a
     match, or every new creator would be linked to every other one. */
  const bothEmpty = await checkReviewEligibility(
    admin({
      seller: { creator: { user_id: "seller", stripe_account_id: null, paypal_merchant_id: null, support_email: null } },
      ownCreators: [{ stripe_account_id: null, paypal_merchant_id: null }],
    }),
    { productId: "p1", userId: "buyer", email: "buyer@example.com" },
  )
  check("two accounts with no payout account are not thereby the same one", bothEmpty.ok, JSON.stringify(bothEmpty))

  const noSeller = await checkReviewEligibility(admin({ seller: null }), { productId: "p1", userId: "u1" })
  check("a product with no seller is refused rather than allowed", !noSeller.ok)

  console.log("\nAnd nobody writes five an hour\n")

  const flood = await checkReviewEligibility(admin({ seller: OTHER_SELLER, recentReviews: 5 }), {
    productId: "p1",
    userId: "buyer",
    email: "buyer@example.com",
  })
  check("the ceiling is enforced", !flood.ok && flood.code === "too_many", JSON.stringify(flood))
  const under = await checkReviewEligibility(admin({ seller: OTHER_SELLER, recentReviews: 4 }), {
    productId: "p1",
    userId: "buyer",
    email: "buyer@example.com",
  })
  check("and one below it is not", under.ok)

  console.log("\nBoth endpoints ask, and in the right order\n")

  const write = readFileSync("app/api/reviews/route.ts", "utf8")
  const gate = readFileSync("app/api/reviews/check/route.ts", "utf8")
  const lib = readFileSync("lib/reviews/eligibility.ts", "utf8")

  check("the write endpoint asks", /checkReviewEligibility\(admin, \{/.test(write))
  check("the check endpoint asks", /checkReviewEligibility\(admin, \{/.test(gate))
  check("both reach the same module", [write, gate].every((f) => /from "@\/lib\/reviews\/eligibility"/.test(f)))
  check("the write endpoint refuses with a 403", /eligibility\.message[\s\S]{0,60}status: 403/.test(write))
  /*
    ORDER MATTERS. A creator CAN hold an entitlement to their own product, so
    asking after the purchase check lets the purchase check answer first and
    the ownership check never runs for the case it exists for.
  */
  check(
    "and asks before the purchase check, which a creator can pass",
    write.indexOf("checkReviewEligibility") < write.indexOf('.from("entitlements")'),
  )
  /* The signal that caught somebody is a map for the next attempt. */
  check(
    "the log records the code and not the address",
    /console\.warn\("\[reviews\] refused", \{ productId, code: eligibility\.code \}\)/.test(write) &&
      !/email/.test(write.slice(write.indexOf("[reviews] refused") - 200, write.indexOf("[reviews] refused") + 200)),
  )
  /* Vercel runs many instances and they share no memory. */
  check(
    "the rate limit counts rows rather than remembering",
    /\.from\("reviews"\)[\s\S]{0,200}count: "exact"/.test(lib) && !/new Map\(\)|globalThis\./.test(lib),
  )

  console.log(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`  failing: ${failures.join(", ")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
