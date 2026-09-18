/**
 * Nobody reviews their own product.
 *
 * Both review endpoints asked "have you bought this", and a creator can
 * satisfy that about their own work: take an entitlement to your own free
 * product and the purchase check passes. The product page then shows the
 * seller's name against five stars on the seller's own listing.
 *
 * The rule has to hold in TWO places and they must not drift. /api/reviews
 * /check decides whether the form is offered; /api/reviews decides whether a
 * review is accepted. A rule enforced only in the first is enforced nowhere,
 * because the second is reachable without it.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { isOwnProduct } from "../lib/reviews/own-product"

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

/** Enough of the builder for one maybeSingle. */
function admin(row: any) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  }
  return { from: () => builder }
}

async function main() {
  console.log("\nThe owner of the listing is the creator's user, not the product row\n")

  check(
    "an embedded creator as an object is read",
    await isOwnProduct(admin({ creator: { user_id: "u1" } }), "p1", "u1"),
  )
  /* PostgREST returns a one-to-one embed as an object in some versions and a
     single-element array in others. Getting this wrong fails OPEN. */
  check(
    "and as a single-element array",
    await isOwnProduct(admin({ creator: [{ user_id: "u1" }] }), "p1", "u1"),
  )
  check(
    "somebody else's product is not yours",
    !(await isOwnProduct(admin({ creator: { user_id: "u2" } }), "p1", "u1")),
  )
  check(
    "a product with no creator row belongs to nobody",
    !(await isOwnProduct(admin({ creator: null }), "p1", "u1")),
  )
  check("a missing product is not yours", !(await isOwnProduct(admin(null), "p1", "u1")))
  check("and neither argument may be empty", !(await isOwnProduct(admin({ creator: { user_id: "" } }), "", "")))

  console.log("\nAnd both endpoints ask\n")

  const write = readFileSync("app/api/reviews/route.ts", "utf8")
  const gate = readFileSync("app/api/reviews/check/route.ts", "utf8")

  check("the write endpoint asks", /isOwnProduct\(admin, productId, user\.id\)/.test(write))
  check("the check endpoint asks", /isOwnProduct\(admin, productId, user\.id\)/.test(gate))
  check(
    "the write endpoint refuses with a 403",
    /You cannot review your own product[\s\S]{0,80}status: 403/.test(write),
  )
  /*
    ORDER MATTERS. A creator CAN hold an entitlement to their own product, so
    asking after the purchase check would let the purchase check answer first
    and the ownership check never run for the case it exists for.
  */
  check(
    "and it asks before the purchase check, which a creator can pass",
    write.indexOf("isOwnProduct") < write.indexOf('.from("entitlements")'),
    `ownership at ${write.indexOf("isOwnProduct")}, entitlement at ${write.indexOf('.from("entitlements")')}`,
  )
  check(
    "both reach the same helper rather than repeating the rule",
    /from "@\/lib\/reviews\/own-product"/.test(write) && /from "@\/lib\/reviews\/own-product"/.test(gate),
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
