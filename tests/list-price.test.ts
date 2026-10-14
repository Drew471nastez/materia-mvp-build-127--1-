/**
 * ===========================================================================
 *  A PRODUCT'S PRICE READS THE SAME EVERYWHERE, AND IS SAVED THE WAY IT READS
 * ===========================================================================
 * lib/pricing/list-price is the one rule the cards (Explore, the category
 * pages, the creator page) and the product page's header use. A pay what
 * you want product used to read "Free", and a compare-at price left from
 * before a product went free could put "100% OFF" on it. The editor now
 * saves only what can be shown: a compare-at price on a fixed price that it
 * is above, and a pay what you want product at its minimum.
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { listPrice, usd } from "../lib/pricing/list-price"

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
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\nThe rule")
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  check("a price", same(listPrice({ price_cents: 1500 }), { main: "$15.00", was: null, off: null }))
  check("a price with a real saving: struck through, and the saving", same(listPrice({ price_cents: 1500, compare_at_cents: 2000 }), { main: "$15.00", was: "$20.00", off: 25 }))
  check("a compare-at price at or under the price is not shown", same(listPrice({ price_cents: 1500, compare_at_cents: 1500 }), { main: "$15.00", was: null, off: null }) && listPrice({ price_cents: 1500, compare_at_cents: 900 }).was === null)
  check("free is Free, and never on sale", same(listPrice({ price_cents: 0, compare_at_cents: 2000 }), { main: "Free", was: null, off: null }))
  check("pay what you want from its minimum, never Free", listPrice({ price_cents: 0, pay_what_you_want: true, pwyw_min_price_cents: 500 }).main === "$5.00+")
  check("pay what you want with no minimum says so", listPrice({ price_cents: 0, pay_what_you_want: true, pwyw_min_price_cents: 0 }).main === "Pay what you want")
  check("pay what you want is never on sale", listPrice({ price_cents: 500, pay_what_you_want: true, pwyw_min_price_cents: 500, compare_at_cents: 900 }).was === null)
  check("a saving that rounds to nothing or everything shows no badge", listPrice({ price_cents: 9999, compare_at_cents: 10000 }).off === null && listPrice({ price_cents: 1, compare_at_cents: 100000 }).off === null)
  check("missing or negative numbers read as nothing", listPrice({ price_cents: null }).main === "Free" && listPrice({ price_cents: -5 }).main === "Free" && usd(123456) === "$1,234.56")

  console.log("\nWhere it is used")
  const card = read("components/explore/product-card.tsx")
  check("the card draws the rule's words, the struck price and the badge", /const priceLabel = listPrice\(product\)/.test(card) && /\{priceLabel\.main\}/.test(card) && /\{priceLabel\.was\}/.test(card) && /\{priceLabel\.off\}% OFF/.test(card) && !/product\.price_cents === 0 \? "Free"/.test(card))
  const page = read("app/(marketing)/p/[slug]/page.tsx")
  check("the product page's header too, in both layouts", (page.match(/\{headerPrice\.main\}/g) ?? []).length === 2 && !/product\.price_cents === 0 \? "Free"/.test(page))
  for (const f of ["app/(marketing)/explore/page.tsx", "app/(marketing)/explore/[category]/page.tsx"]) {
    check(`${f} reads what the rule needs`, /price_cents, compare_at_cents, pay_what_you_want, pwyw_min_price_cents,/.test(read(f)))
  }
  check("the creator page hands it to its cards", /pay_what_you_want: p\.pay_what_you_want \?\? null,/.test(read("app/(marketing)/u/[username]/page.tsx")) && /pay_what_you_want: product\.pay_what_you_want \?\? null,/.test(read("components/storefront/storefront-product-card.tsx")))

  console.log("\nThe editor saves what can be shown")
  const editor = read("app/app/products/new/product-editor.tsx")
  check("free saves 0, pay what you want its minimum, a fixed price the price",
    /price_cents: priceMode === "free" \? 0 : priceMode === "pwyw" \? Math\.round\(Number\.parseFloat\(pwywMinPrice \|\| "0"\) \* 100\) : Math\.round\(Number\.parseFloat\(price \|\| "0"\) \* 100\)/.test(editor))
  check("a compare-at price only on a fixed price, and only above it", /if \(priceMode !== "fixed" \|\| !compareAtPrice\) return null/.test(editor) && /return Number\.isFinite\(compare\) && compare > now \? compare : null/.test(editor))
  check("price fields are text with a decimal keyboard: no spinner, no wheel, no drag", !/type="number"/.test(editor.replace(/\/\*[\s\S]*?\*\//g, "")) && /onChange=\{\(e\) => setPrice\(moneyTyped\(e\.target\.value\)\)\}/.test(editor) && /onChange=\{\(e\) => setCompareAtPrice\(moneyTyped\(e\.target\.value\)\)\}/.test(editor))
  check("compare-at is a chip until it is wanted", /data-compare-chip=""/.test(editor) && /const \[compareOpen, setCompareOpen\] = useState\(\(\) => !!initial\.compareAtPrice\)/.test(editor))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
