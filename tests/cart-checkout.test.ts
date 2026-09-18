/**
 * ===========================================================================
 *  CARRYING A BASKET THROUGH STRIPE, AND SPLITTING WHAT WAS TAKEN
 * ===========================================================================
 * Two pieces of arithmetic sit between a shopper pressing Check out and
 * their purchases existing, and neither can be checked by reading the code.
 *
 * THE BASKET HAS TO SURVIVE THE ROUND TRIP. Stripe caps one metadata value
 * at 500 characters and three product ids with variants and prices are
 * already past it, so the basket is split across keys. A basket that comes
 * back short is a buyer who paid for four things and received three.
 *
 * THE FEE HAS TO ADD UP. It is taken once on the whole basket and recorded
 * on every line, because that is where the seller's earnings are read from.
 * Parts that sum to a cent more than was taken are a seller who is short a
 * cent, for ever, in a number they can see.
 */
import {
  METADATA_VALUE_LIMIT,
  apportionFee,
  packItems,
  packedTotalCents,
  unpackItems,
  type PackedItem,
} from "../lib/checkout/cart-items"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

/** A realistic id: a UUID is 36 characters and that is what drives the split. */
const uuid = (n: number) => `0000000${String(n).padStart(4, "0")}-aaaa-4bbb-8ccc-ddddeeeeffff`
const item = (n: number, over: Partial<PackedItem> = {}): PackedItem => ({
  productId: uuid(n),
  variantId: null,
  quantity: 1,
  priceCents: 1999,
  ...over,
})

function main() {
  console.log("\n  the basket survives the round trip")

  const one = [item(1)]
  check("one item goes out and comes back",
    (() => {
      const back = unpackItems(packItems(one))
      return back.length === 1 && back[0].productId === uuid(1) && back[0].priceCents === 1999
    })())

  check("a variant and a quantity come back with it",
    (() => {
      const back = unpackItems(packItems([item(1, { variantId: uuid(9), quantity: 3, priceCents: 500 })]))
      return back[0].variantId === uuid(9) && back[0].quantity === 3 && back[0].priceCents === 500
    })())

  const many = Array.from({ length: 40 }, (_, i) => item(i))
  const packed = packItems(many)

  check("forty items come back as forty items",
    unpackItems(packed).length === 40, `${unpackItems(packed).length}`)

  check("and in the order they were put in",
    unpackItems(packed).every((it, i) => it.productId === uuid(i)))

  check("no single metadata value is over Stripe's limit",
    Object.values(packed).every((v) => v.length <= METADATA_VALUE_LIMIT),
    `longest ${Math.max(...Object.values(packed).map((v) => v.length))} of ${METADATA_VALUE_LIMIT}`)

  check("forty items needed more than one key, which is the whole point",
    Object.keys(packed).filter((k) => k.startsWith("cart_") && k !== "cart_items").length > 1,
    `${Object.keys(packed).filter((k) => k.startsWith("cart_") && k !== "cart_items").length} keys`)

  check("the total is the sum of the lines, quantities included",
    packedTotalCents([item(1, { priceCents: 1000, quantity: 3 }), item(2, { priceCents: 250 })]) === 3250)

  console.log("\n  and a basket that comes back damaged loses lines, not the payment")

  check("no metadata at all is an empty basket", unpackItems(null).length === 0 && unpackItems({}).length === 0)
  check("a truncated line is dropped", unpackItems({ cart_0: "abc|def" }).length === 0)
  check("a line with no product id is dropped", unpackItems({ cart_0: "||1|500" }).length === 0)
  check("a line with a nonsense quantity is dropped", unpackItems({ cart_0: `${uuid(1)}||x|500` }).length === 0)
  check("a zero quantity is dropped rather than fulfilled", unpackItems({ cart_0: `${uuid(1)}||0|500` }).length === 0)
  check("the good lines beside a bad one still come back",
    unpackItems({ cart_0: `${uuid(1)}||1|500;broken;${uuid(2)}||2|300` }).length === 2)

  console.log("\n  the fee adds up to what was taken")

  const sums = (fee: number, lines: number[]) => apportionFee(fee, lines).reduce((n, c) => n + c, 0)

  check("three even lines", sums(300, [1000, 1000, 1000]) === 300, `${sums(300, [1000, 1000, 1000])}`)
  check("a split that does not divide", sums(100, [333, 333, 334]) === 100, `${sums(100, [333, 333, 334])}`)
  check("a fee of one cent across three lines", sums(1, [1000, 1000, 1000]) === 1, `${sums(1, [1000, 1000, 1000])}`)
  check("one line takes the whole fee", apportionFee(275, [4999])[0] === 275)
  check("a line's share is proportional to its price",
    (() => {
      const [a, b] = apportionFee(300, [3000, 1000])
      return a === 225 && b === 75
    })())

  check("no fee is no fee", apportionFee(0, [1000, 2000]).every((f) => f === 0))
  check("an empty basket has nothing to apportion", apportionFee(300, []).length === 0)
  check("no share is negative",
    apportionFee(50, [1, 1, 1, 9999]).every((f) => f >= 0),
    JSON.stringify(apportionFee(50, [1, 1, 1, 9999])))

  /* A hundred random baskets, because the rounding is where this goes wrong
     and three hand-picked cases do not find it. */
  let worst = ""
  let exact = 0
  for (let i = 0; i < 100; i++) {
    const lines = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, () => 1 + Math.floor(Math.random() * 20000))
    const fee = Math.floor(Math.random() * 3000)
    const total = apportionFee(fee, lines).reduce((n, c) => n + c, 0)
    if (total === fee) exact++
    else worst = `fee ${fee} over ${lines.join(",")} came to ${total}`
  }
  check("and it adds up on a hundred random baskets", exact === 100, worst || `${exact} of 100`)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
