/**
 * ===========================================================================
 *  ROUND 22: ORDERS ON A PHONE, A SIZE UP AND LESS TO READ; SETTINGS TABS SOONER
 * ===========================================================================
 * The owner: "in sub pages of orders, and in all orders in general ... on
 * mobile, the whole scale and size of the texts is just too low ... more like
 * Shopify ... and be less text", and "navigating between settings tabs should
 * be faster and smoother". Measured with scripts/check-orders27.mjs (phone:
 * one stacked row per order, its number at 17px) and
 * scripts/check-settings-tabs.mjs (a tab fully there about 200ms after the
 * press, from 270 to 340ms).
 *
 * Read from source (comments out). Run with:  npm run test:push
 */
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}`)
  }
}

const list = readCode("app/(storelib)/app/orders/orders-list.tsx")
const detail = readCode("app/(storelib)/app/orders/order-detail.tsx")
const css = readCode("app/globals.css")

console.log("\nThe orders list on a phone")
check("each order is one stacked cell, hidden from a computer", /function PhoneRow\(/.test(list) && /data-phone-row="" className="[^"]*sm:hidden"/.test(list))
check("its number at 17px and its total at 16px", /text-\[17px\] font-semibold/.test(list) && /text-\[16px\] font-medium tabular-nums/.test(list))
check("who bought, then when and how many, then where it is", /\{who \|\| /.test(list) && /\{listDate\(order\.createdAt, now, timeZone\)\} · \{itemsLabel\(order\.itemCount\)\}/.test(list))
check("the table's own cells and header are a computer's only", (list.match(/max-sm:hidden/g) ?? []).length >= 5 && /<thead className="max-sm:hidden">/.test(list))
check("the phone cell comes last, so a computer's cells keep their places", list.indexOf("<PhoneRow order={order}") > list.indexOf("<Cell column={c.key}"))

console.log("\nAn order on a phone")
check("its number at 24px, 20px from a computer up", /text-\[24px\] font-bold leading-8 text-\[#1a1a2e\] sm:text-\[20px\]/.test(detail))
check("its cards read a size up below 640px", /@media \(max-width: 639px\) \{\s*\.orders-body \.text-\\\[12px\\\] \{ font-size: 13px; \}\s*\.orders-body \.text-\\\[13px\\\] \{ font-size: 15px;/.test(css))

console.log("\nSettings tabs")
check("the new section settles over 160ms, from 0.25", /animation: settings-panel-in 160ms/.test(css) && /from \{ opacity: 0\.25; \}/.test(css))
check("the probe's server answers the favicon itself, not with the bundle", /req\.url\.startsWith\("\/favicon"\)/.test(readCode("scripts/check-settings-tabs.mjs")))
check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/orders-phone-r22.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
