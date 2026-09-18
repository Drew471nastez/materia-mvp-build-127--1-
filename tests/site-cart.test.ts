/**
 * ===========================================================================
 *  THE CART MODEL
 * ===========================================================================
 * Unit tests against the real functions, not a source read: the cart is
 * arithmetic and defensive parsing, and both are worth executing.
 *
 * What is actually checked:
 *  - adding the same product twice is one line, not two
 *  - a variant makes it a different line
 *  - a digital product cannot be bought twice
 *  - prices never leave local storage as anything but a number
 *  - rubbish in local storage renders nothing rather than crashing the shop
 */
import {
  MAX_LINES,
  MAX_QUANTITY,
  addLine,
  cartCount,
  cartStorageKey,
  cartSubtotalCents,
  checkoutItems,
  lineKey,
  parseCart,
  removeLine,
  serializeCart,
  setQuantity,
  type CartLine,
} from "../lib/website-builder/cart"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: "p1",
  variantId: null,
  title: "A thing",
  variantName: null,
  priceCents: 1200,
  thumbnailUrl: null,
  slug: "a-thing",
  digital: false,
  quantity: 1,
  ...over,
})

function main() {
  console.log("\n  one line per product and variant")

  check("the same product twice is one line of two",
    (() => { const c = addLine(addLine([], line()), line()); return c.length === 1 && c[0].quantity === 2 })())

  check("a different variant is a different line",
    (() => {
      const c = addLine(addLine([], line({ variantId: "v1" })), line({ variantId: "v2" }))
      return c.length === 2 && cartCount(c) === 2
    })())

  check("a line's identity is the product and the variant",
    lineKey({ productId: "p1", variantId: null }) !== lineKey({ productId: "p1", variantId: "v1" }))

  console.log("\n  a digital product cannot be owned twice")

  check("adding it again leaves the quantity at one",
    (() => { const c = addLine(addLine([], line({ digital: true })), line({ digital: true })); return c[0].quantity === 1 })())

  check("and a stepper cannot raise it",
    (() => {
      const c = setQuantity(addLine([], line({ digital: true })), lineKey({ productId: "p1", variantId: null }), 5)
      return c[0].quantity === 1
    })())

  check("a physical product can be raised",
    (() => {
      const c = setQuantity(addLine([], line()), lineKey({ productId: "p1", variantId: null }), 4)
      return c[0].quantity === 4
    })())

  check("but not past the cap",
    (() => {
      const c = setQuantity(addLine([], line()), lineKey({ productId: "p1", variantId: null }), 5000)
      return c[0].quantity === MAX_QUANTITY
    })())

  console.log("\n  totals and removal")

  check("the subtotal multiplies by quantity",
    cartSubtotalCents([line({ priceCents: 1200, quantity: 3 }), line({ productId: "p2", priceCents: 500 })]) === 4100,
    `${cartSubtotalCents([line({ priceCents: 1200, quantity: 3 }), line({ productId: "p2", priceCents: 500 })])}`)

  check("dropping to zero removes the line",
    setQuantity(addLine([], line()), lineKey({ productId: "p1", variantId: null }), 0).length === 0)

  check("removing a line that is not there changes nothing",
    removeLine([line()], "nope::").length === 1)

  console.log("\n  the basket is bounded")

  check("a new line past the cap is refused",
    (() => {
      let c: CartLine[] = []
      for (let i = 0; i < MAX_LINES + 5; i++) c = addLine(c, line({ productId: `p${i}` }))
      return c.length === MAX_LINES
    })())

  check("but more of something already in it is not",
    (() => {
      let c: CartLine[] = []
      for (let i = 0; i < MAX_LINES; i++) c = addLine(c, line({ productId: `p${i}` }))
      c = addLine(c, line({ productId: "p0" }))
      return c.length === MAX_LINES && c[0].quantity === 2
    })())

  console.log("\n  what comes back out of local storage")

  check("a round trip is the same cart",
    (() => {
      const c = [line({ quantity: 2 }), line({ productId: "p2", variantId: "v1", variantName: "Large" })]
      const back = parseCart(serializeCart(c))
      return back.length === 2 && back[0].quantity === 2 && back[1].variantName === "Large"
    })())

  check("nothing stored is an empty cart", parseCart(null).length === 0 && parseCart("").length === 0)
  check("rubbish is an empty cart", parseCart("{not json").length === 0)
  check("a JSON object that is not a list is an empty cart", parseCart('{"productId":"p1"}').length === 0)
  check("a line with no product id is dropped", parseCart('[{"title":"x"}]').length === 0)

  check("a price that is not a number becomes zero rather than NaN",
    (() => {
      const back = parseCart('[{"productId":"p1","priceCents":"1200"}]')
      return back.length === 1 && back[0].priceCents === 0 && Number.isFinite(cartSubtotalCents(back))
    })())

  check("a negative price is not a discount",
    parseCart('[{"productId":"p1","priceCents":-5000}]')[0].priceCents === 0)

  check("a duplicate line in storage is collapsed",
    parseCart('[{"productId":"p1"},{"productId":"p1"}]').length === 1)

  check("a stored quantity of a thousand is capped",
    parseCart('[{"productId":"p1","quantity":1000}]')[0].quantity === MAX_QUANTITY)

  check("a stored digital line is still pinned to one",
    parseCart('[{"productId":"p1","digital":true,"quantity":9}]')[0].quantity === 1)

  console.log("\n  what the checkout is handed")

  check("ids and quantities, and no prices",
    (() => {
      const items = checkoutItems([line({ quantity: 3 }), line({ productId: "p2", variantId: "v1" })])
      return items.length === 2 &&
        items[0].quantity === 3 &&
        items[1].variantId === "v1" &&
        !Object.keys(items[0]).includes("priceCents")
    })())

  check("carts are stored per shop", cartStorageKey("a") !== cartStorageKey("b"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
