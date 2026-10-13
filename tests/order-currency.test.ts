/**
 * Orders in the currency they were charged in (lib/orders/money.ts): the
 * Orders list and page, the refund dialog, the timeline, search, Home and
 * Customers used to write every amount in dollars, whatever the checkout
 * charged (lei by default: lib/payments/fees/currency-rules).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { currencySymbol, formatOrderMoney, minorPerUnit, orderCurrency, ordersCurrency } from "@/lib/orders/money"
import { groupOrders, type OrderRow } from "@/lib/orders/order-view"
import { platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\nThe currency of an amount")
  check("a recorded lower case code reads upper case", orderCurrency("ron") === "RON" && orderCurrency("eur") === "EUR")
  check("nothing recorded: the platform's charge currency", orderCurrency(null) === platformChargeCurrencyUpper() && orderCurrency("") === platformChargeCurrencyUpper())
  check("rubbish is never handed to Intl", orderCurrency("dollars") === platformChargeCurrencyUpper())

  console.log("\nWritten in it")
  const lei = formatOrderMoney(2500, "RON")
  check("lei are lei, never dollars", !lei.includes("$") && /25/.test(lei), lei)
  check("dollars stay dollars", formatOrderMoney(2500, "usd").includes("$"), formatOrderMoney(2500, "usd"))
  check("yen have no decimals: 2500 minor units is ¥2,500", /2[,.\s]?500/.test(formatOrderMoney(2500, "JPY")) && !/25\.00/.test(formatOrderMoney(2500, "JPY")), formatOrderMoney(2500, "JPY"))
  check("a typed refund amount in yen is whole yen", minorPerUnit("JPY") === 1 && minorPerUnit("EUR") === 100)
  check("the amount field's mark follows the currency", currencySymbol("EUR") === "€" && currencySymbol("USD") === "$", `${currencySymbol("EUR")} ${currencySymbol("USD")}`)

  console.log("\nOrders carry it")
  const row = (o: Partial<OrderRow>): OrderRow => ({ id: "l1", product_id: "p", amount_cents: 1000, status: "completed", created_at: "2026-10-13T10:00:00Z", ...o }) as OrderRow
  check("an order is in its first line's currency", groupOrders([row({ currency: "EUR" })])[0].currency === "EUR")
  check("an order with none recorded is in the platform's", groupOrders([row({})])[0].currency === platformChargeCurrencyUpper())
  check("a sum of many is in the one most were charged in", ordersCurrency([{ currency: "EUR" }, { currency: "EUR" }, { currency: "USD" }]) === "EUR")
  check("a sum of none is in the platform's", ordersCurrency([]) === platformChargeCurrencyUpper())

  console.log("\nEvery surface uses it")
  const loadRows = read("lib/orders/load-rows.ts")
  check("rows keep orders.currency", /currency: orderCurrency\(order\.currency\)/.test(loadRows))
  check("an order that ships takes its checkout's currency", /select\("id, fulfillment_status, return_status, delivery_method, tax_cents, shipping_rate, provider, currency"\)/.test(loadRows) && /r\.currency = orderCurrency\(c\.currency\)/.test(loadRows))
  const parts = read("app/app/orders/order-parts.tsx")
  check("Orders' formatter takes a currency", /export function formatMoney\(cents: number, currency: string = "USD"\)/.test(parts) && !/currency: "USD" \}\)/.test(parts))
  const detail = read("app/app/orders/order-detail.tsx")
  check("the order page passes the order's currency to every amount", !/formatMoney\([^()]*(\([^()]*\))?[^()]*\)(?!, )/.test(detail.replace(/formatMoney\([^()]*(\([^()]*\))?[^()]*, (order\.)?currency\)/g, "")))
  check("the refund dialog types in the order's units and mark", /Math\.round\(value \* unit\)/.test(detail) && /currencySymbol\(currency\)/.test(detail) && !/>\$<\/span>/.test(detail))
  const list = read("app/app/orders/orders-list.tsx")
  check("the list's totals and metrics", /formatMoney\(order\.totalCents, order\.currency\)/.test(list) && /formatMoney\(reading\.value, currency\)/.test(list))
  check("the refund notices", (read("app/app/orders/orders-client.tsx").match(/formatMoney\(cents, order\.currency\)/g) ?? []).length === 2)
  const timeline = read("lib/orders/timeline.ts")
  check("the timeline", !/currency: "USD"/.test(timeline) && /formatOrderMoney\(order\.totalCents, order\.currency\)/.test(timeline))
  check("the timeline says cash still to collect, not paid", /\{amount\} to collect in cash on delivery/.test(timeline))
  check("search's order results", /formatOrderMoney\(order\.totalCents, order\.currency\)/.test(read("lib/search/app-search.ts")))
  check("Home's revenue", !/currency: "USD"/.test(read("components/app/dashboard-client.tsx")) && !/`\$\$\{/.test(read("components/app/dashboard-client.tsx")))
  check("Customers", !/currency: "USD"/.test(read("app/app/customers/page.tsx")))
  check("a basket's lines record what Stripe charged", /currency: \(ctx\.currency \|\| "usd"\)\.toLowerCase\(\)/.test(read("lib/checkout/fulfil-cart-item.ts")) && (read("lib/checkout/fulfil-cart-session.ts").match(/currency: (session\.currency|pi\.currency)/g) ?? []).length === 2)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
