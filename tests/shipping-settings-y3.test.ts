/**
 * SETTINGS > SHIPPING, ROUND Y3: STORELIB'S OWN FORMS, ONE SAVE, WHAT THE
 * SUMMARY AND THE FREE SHIPPING BANNER SAY
 *
 *   the summary      several prices in a zone read "from 15 lei", never
 *                    "for from 15 lei"; a zone priced only by a connected
 *                    carrier is said, at live rates, not left out
 *   free over        a carrier rate's own "free over" counts for the free
 *                    shipping banner, as checkout prices it (ratePrice)
 *   one save         components/physical/ui SaveButton: greyed until
 *                    something changed, a spinner at the same width while
 *                    saving, Saved after; FormActions has no band of its own
 *   the rate form    no grey box, no hint under obvious fields, Save greyed
 *                    until the rate differs from what is saved
 *   one copy         the shipping and store details panels use the shared
 *                    button rather than keeping their own
 *
 * scripts/check-shipping-settings.mjs measures the page in a browser.
 *
 * Run: node scripts/run-push-tests.mjs
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { shippingSummary } from "@/lib/physical/quick-setup"
import { freeShippingFrom, quoteDelivery } from "@/lib/physical/rates"
import { FormActions, SaveButton } from "@/components/physical/ui"
import { RateForm } from "@/components/physical/shipping-settings"
import type { ShippingProfile, ShippingRate, ShippingZone } from "@/lib/physical/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const rate = (over: Partial<ShippingRate> = {}): ShippingRate => ({ id: "r1", zoneId: "z1", name: "Standard", kind: "flat", priceCents: 1500, minValue: null, maxValue: null, tiers: [], freeOverCents: null, minDays: 1, maxDays: 3, active: true, position: 0, ...over })
const zone = (over: Partial<ShippingZone> = {}): ShippingZone => ({ id: "z1", profileId: "p1", name: "Romania", countries: ["RO"], regions: [], restOfWorld: false, rates: [rate()], ...over })
const profile = (zones: ShippingZone[]): ShippingProfile => ({ id: "p1", name: "General", isDefault: true, zones })
const money = (c: number) => `${(c / 100).toFixed(2)} lei`

console.log("\nThe summary\n")
{
  const two = shippingSummary([profile([zone({ rates: [rate(), rate({ id: "r2", name: "Express", priceCents: 2500 })] })])], { home: "RO", money })
  check("two prices in a zone: \"from 15.00 lei\", not \"for from\"", /to Romania from 15\.00 lei/.test(two.sentence) && !/for from/.test(two.sentence), two.sentence)
  const one = shippingSummary([profile([zone()])], { home: "RO", money })
  check("one price: \"for 15.00 lei\"", /to Romania for 15\.00 lei, 1 to 3 business days\./.test(one.sentence), one.sentence)
  const free = shippingSummary([profile([zone({ rates: [rate({ kind: "free", priceCents: 0 })] })])], { home: "RO", money })
  check("a free rate: \"for free\"", /to Romania for free/.test(free.sentence), free.sentence)
  const eu = zone({ id: "z2", name: "Rest of the EU", countries: ["DE", "FR"], rates: [rate({ id: "r3", zoneId: "z2", kind: "carrier", carrier: "shippo", priceCents: 0, minDays: 3, maxDays: 7, freeOverCents: 30000 })] })
  const live = shippingSummary([profile([zone(), eu])], { home: "RO", money })
  check("a zone priced only by a carrier is in the summary", live.rows.length === 2 && live.rows[1].price === "live rates" && /at live carrier rates/.test(live.sentence), live)
  check("  with its days and its free over", live.rows[1].days !== "" && live.rows[1].free === "Free over 300.00 lei" && /1 to 7 business days/.test(live.sentence), live)
  const off = shippingSummary([profile([zone(), { ...eu, rates: [{ ...eu.rates[0], active: false }] }])], { home: "RO", money })
  check("a carrier rate turned off is not said", off.rows.length === 1, off.rows)
}

console.log("\nFree over on a carrier rate\n")
{
  const carrierOnly = profile([zone({ rates: [rate({ kind: "carrier", carrier: "shippo", priceCents: 0, freeOverCents: 20000 })] })])
  check("the banner counts a carrier rate's free over", freeShippingFrom(carrierOnly, "RO") === 20000, freeShippingFrom(carrierOnly, "RO"))
  const plain = profile([zone({ rates: [rate({ kind: "carrier", carrier: "shippo", priceCents: 0 })] })])
  check("a carrier rate without one says nothing", freeShippingFrom(plain, "RO") === null)
  const lines = [{ shippingProfileId: null, quantity: 1, lineCents: 25000, weightGrams: 500, requiresShipping: true }]
  const q = quoteDelivery([carrierOnly], lines, "RO", new Map([["r1", 1234]]))
  check("and checkout makes it free from there, as the banner says", q.ok === true && q.required === true && (q as { options: { priceCents: number }[] }).options[0]?.priceCents === 0, q)
  const below = quoteDelivery([carrierOnly], [{ ...lines[0], lineCents: 5000 }], "RO", new Map([["r1", 1234]]))
  check("  below it the carrier's price is charged", below.ok === true && (below as { options: { priceCents: number }[] }).options[0]?.priceCents === 1234, below)
}

console.log("\nOne save button\n")
{
  const idle = renderToStaticMarkup(createElement(SaveButton, { state: "idle", onClick: () => undefined, disabled: true }))
  check("unchanged: there and greyed, not missing", /disabled=""/.test(idle) && /data-save-state="idle"/.test(idle), idle)
  const saving = renderToStaticMarkup(createElement(SaveButton, { state: "saving", onClick: () => undefined, label: "Save rate" }))
  check("saving: disabled, busy, a spinner, the word kept in the cell so the width holds", /disabled=""/.test(saving) && /aria-busy="true"/.test(saving) && /Save rate/.test(saving) && /invisible/.test(saving), saving)
  const saved = renderToStaticMarkup(createElement(SaveButton, { state: "saved", onClick: () => undefined }))
  check("saved: Saved with a check, at full strength", /Saved/.test(saved) && /data-save-state="saved"/.test(saved) && /disabled:opacity-100/.test(saved), saved)
  const row = renderToStaticMarkup(createElement(FormActions, { error: "The rate could not be saved.", children: createElement("button", null, "Save") }))
  check("the action row has no ground of its own, and says what went wrong", !/bg-\[/.test(row) && /role="alert"/.test(row) && /could not be saved/.test(row), row)
}

console.log("\nThe rate form\n")
{
  const apps = [{ id: "shippo", name: "Shippo", connected: true }]
  const edit = renderToStaticMarkup(createElement(RateForm, { system: "metric", carrierApps: apps, initial: rate({ freeOverCents: 20000 }), onCancel: () => undefined, onSave: async () => null }))
  check("editing, Save rate starts greyed", /data-rate-save=""[^>]*disabled=""|disabled=""[^>]*data-rate-save=""/.test(edit), edit.slice(-800))
  check("no grey box around the form", !/bg-\[#fcfcfd\]/.test(edit) && !/bg-\[#fcfcfd\]/.test(read("components/physical/shipping-settings.tsx")))
  check("no hint under obvious fields", !/0 makes it free/.test(edit) && !/Optional: free once/.test(edit) && !/Like Standard or Express/.test(edit) && !/Not saved until you press/.test(edit))
  check("free over is a price field with the store's mark", /data-rate-free-over/.test(edit) && /data-currency-mark/.test(edit))
  check("the delivery time is one row of days", /data-days-inputs/.test(edit) && /business days/.test(edit))
  check("Cancel and Save in one action row", /data-form-actions/.test(edit) && /data-form-cancel/.test(edit))
  const fresh = renderToStaticMarkup(createElement(RateForm, { system: "metric", carrierApps: apps, onCancel: () => undefined, onSave: async () => null }))
  check("a new rate can be pressed at once (a missing price is said under it)", !/data-rate-save=""[^>]*disabled=""/.test(fresh) && /Add rate/.test(fresh))
}

console.log("\nOne copy of the button\n")
{
  const ship = read("components/physical/shipping-settings.tsx")
  const store = read("components/app/settings/store-details-panel.tsx")
  check("shipping settings keep no SaveButton of their own", !/function SaveButton/.test(ship) && /SaveButton/.test(ship))
  check("store details keep no SaveButton of their own", !/function SaveButton/.test(store) && /SaveButton,/.test(store))
  check("reviews and customer emails use it too", /<SaveButton/.test(read("components/app/settings/reviews-app-panel.tsx")) && /<SaveButton/.test(read("components/app/settings/customer-emails-panel.tsx")))
  check("a rate is deleted only after asking", /Delete the \{name\} rate\?/.test(ship))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
