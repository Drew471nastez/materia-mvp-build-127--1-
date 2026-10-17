/**
 * SHIPPING AND DELIVERY FOR A BEGINNER: QUICK SETUP, THE SUMMARY, ONE
 * FULFILMENT QUESTION, CARRIER RATES ONLY WITH A CARRIER APP
 *
 *   the proposal     what Quick setup starts from, per country: units,
 *                    the EU or the rest of the world, the currency, and no
 *                    price (lib/physical/quick-setup.ts)
 *   the summary      a store's shipping in a sentence and a few rows
 *   the radiogroup   the fulfilment question drawn once, used twice, with
 *                    roles, aria-checked, one Tab stop and the arrow keys
 *   carrier rates    offered only while a carrier app is connected
 *   the settings     the page's read no longer opens sealed keys
 *
 * The routes themselves are walked in tests/e2e-shipsetup.test.ts.
 *
 * Run: node scripts/run-push-tests.mjs
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EU_COUNTRIES, hasUsableRate, isSimpleSetup, quickSetupProposal, quickSetupZones, shippingSummary, unitSystemFor, zonePlace } from "@/lib/physical/quick-setup"
import { FulfilmentChoice, RateForm, radioKeys } from "@/components/physical/shipping-settings"
import type { ShippingProfile, ShippingRate, ShippingZone } from "@/lib/physical/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const rate = (over: Partial<ShippingRate> = {}): ShippingRate => ({ id: "r1", zoneId: "z1", name: "Standard", kind: "flat", priceCents: 1500, minValue: null, maxValue: null, tiers: [], freeOverCents: null, minDays: 2, maxDays: 4, active: true, position: 0, ...over })
const zone = (over: Partial<ShippingZone> = {}): ShippingZone => ({ id: "z1", profileId: "p1", name: "Romania", countries: ["RO"], regions: [], restOfWorld: false, rates: [rate()], ...over })
const profile = (zones: ShippingZone[], over: Partial<ShippingProfile> = {}): ShippingProfile => ({ id: "p1", name: "General", isDefault: true, zones, ...over })

console.log("\nThe proposal: from the store's country, never a price\n")
{
  const ro = quickSetupProposal({ country: "ro", currency: "ron" })!
  check("Romania: metric, without asking", ro.units === "metric" && unitSystemFor("RO") === "metric")
  check("the US, Liberia and Myanmar: imperial", unitSystemFor("US") === "imperial" && unitSystemFor("lr") === "imperial" && unitSystemFor("MM") === "imperial")
  check("the UK, Canada, Germany: metric", ["GB", "CA", "DE"].every((c) => unitSystemFor(c) === "metric"))
  check("27 EU countries, from the list Markets uses", EU_COUNTRIES.length === 27 && EU_COUNTRIES.includes("RO") && !EU_COUNTRIES.includes("GB"))
  check("an EU store: home is its country, abroad the other 26", ro.home.countries.join() === "RO" && ro.abroad.kind === "eu" && ro.abroad.countries.length === 26 && !ro.abroad.countries.includes("RO") && !ro.abroad.restOfWorld)
  check("  said plainly", ro.home.label === "Shipping inside Romania" && ro.abroad.label === "Shipping to the rest of the EU", [ro.home.label, ro.abroad.label])
  const us = quickSetupProposal({ country: "US", currency: "USD" })!
  check("a store outside the EU: abroad is every other country", us.abroad.kind === "world" && us.abroad.restOfWorld && us.abroad.countries.length === 0 && us.abroad.label === "Shipping to the rest of the world")
  check("the UK is outside the EU", quickSetupZones("GB").abroad.kind === "world")
  check("the currency is the store's, upper case", ro.currency === "RON" && us.currency === "USD")
  check("delivery times to start from, shorter at home", ro.home.minDays < ro.abroad.minDays && ro.home.maxDays <= ro.abroad.maxDays && us.abroad.maxDays > ro.abroad.maxDays)
  check("no price anywhere in the proposal", !/price|cents/i.test(JSON.stringify(ro)) && !/price|cents/i.test(JSON.stringify(us)))
  check("no country, no proposal", quickSetupProposal({ country: "", currency: "EUR" }) === null && quickSetupProposal({ country: null, currency: "EUR" }) === null)
}

console.log("\nThe summary: where, how much, how long\n")
{
  const money = (c: number) => `${(c / 100).toFixed(0)} lei`
  const eu = EU_COUNTRIES.filter((c) => c !== "RO")
  const two = [profile([zone(), zone({ id: "z2", name: "Rest of the EU", countries: eu, rates: [rate({ id: "r2", zoneId: "z2", priceCents: 4000, minDays: 3, maxDays: 5 })] })])]
  const s = shippingSummary(two, { home: "RO", money })
  check("one sentence for the whole setup", s.sentence === "You ship to Romania for 15 lei and to the rest of the EU for 40 lei, 2 to 5 business days.", s.sentence)
  check("a row per zone", s.rows.length === 2 && s.rows[1].place === "the rest of the EU" && s.rows[1].days === "3 to 5 business days")
  const free = shippingSummary([profile([zone({ rates: [rate({ priceCents: 1500, freeOverCents: 20000 })] }), zone({ id: "z3", restOfWorld: true, countries: [], rates: [rate({ id: "r3", priceCents: 0, minDays: null, maxDays: null })] })])], { home: "RO", money })
  check("free over is said on its row, a 0 price reads as free, rest of world as everywhere else", free.rows[0].free === "Free over 200 lei" && free.rows[1].price === "free" && free.rows[1].place === "everywhere else", free.rows)
  check("carrier and inactive rates are not counted as shipping", !hasUsableRate([profile([zone({ rates: [rate({ kind: "carrier" }), rate({ id: "x", active: false })] })])]) && hasUsableRate(two))
  check("a zone with no places ships nowhere", !hasUsableRate([profile([zone({ countries: [] })])]))
  check("simple: one profile, up to 3 zones, each flat or free with a rate", isSimpleSetup(two))
  check("  not simple: a custom profile, a weight rate, a zone with no rate", !isSimpleSetup([...two, profile([], { id: "p2", isDefault: false })]) && !isSimpleSetup([profile([zone({ rates: [rate({ kind: "weight", tiers: [{ from: 0, priceCents: 500 }] })] })])]) && !isSimpleSetup([profile([zone(), zone({ id: "z9", rates: [] })])]))
  check("the EU named whole", zonePlace({ name: "EU", countries: [...EU_COUNTRIES], regions: [], restOfWorld: false }, "US") === "the EU")
}

console.log("\nOne fulfilment question, a real radiogroup\n")
{
  const html = renderToStaticMarkup(createElement(FulfilmentChoice, { value: "self", onChange: () => undefined }))
  check("role=radiogroup with a name", /role="radiogroup"[^>]*aria-label="How do you fulfil your physical orders\?"/.test(html))
  check("seven radios, one checked", (html.match(/role="radio"/g) ?? []).length === 7 && (html.match(/aria-checked="true"/g) ?? []).length === 1 && /aria-checked="true"[^>]*data-radio="self"/.test(html))
  check("one Tab stop: the chosen one", (html.match(/tabindex="0"/g) ?? []).length === 1 && (html.match(/tabindex="-1"/g) ?? []).length === 6)
  check("no aria-pressed toggles any more", !/aria-pressed/.test(html))
  const none = renderToStaticMarkup(createElement(FulfilmentChoice, { value: null, onChange: () => undefined }))
  check("  before a pick, the first is the Tab stop", (none.match(/tabindex="0"/g) ?? []).length === 1 && /tabindex="0"[^>]*data-radio="self"/.test(none))

  const g = globalThis as unknown as { requestAnimationFrame?: (f: () => void) => number }
  g.requestAnimationFrame = (f) => {
    f()
    return 0
  }
  const ids = ["a", "b", "c"] as const
  const press = (key: string, current: "a" | "b" | "c" | "", focusedNow: string | null = null) => {
    let picked: string | null = null
    let focused: string | null = null
    let prevented = false
    radioKeys(ids, current, (id) => (picked = id))({ key, target: { getAttribute: () => focusedNow }, preventDefault: () => (prevented = true), currentTarget: { querySelector: (sel: string) => ({ focus: () => (focused = sel) }) } } as never)
    return { picked, focused, prevented }
  }
  check("Down and Right move on, Up and Left back, wrapping round", press("ArrowDown", "a").picked === "b" && press("ArrowRight", "c").picked === "a" && press("ArrowUp", "a").picked === "c" && press("ArrowLeft", "b").picked === "a")
  check("before any pick, the arrows move on from the radio with the focus", press("ArrowDown", "", "a").picked === "b" && press("ArrowUp", "", "a").picked === "c")
  check("Home and End go to the ends", press("Home", "c").picked === "a" && press("End", "a").picked === "c")
  check("the new choice takes the focus", press("ArrowDown", "a").focused === '[data-radio="b"]')
  check("other keys are left alone", press("Tab", "a").picked === null && !press("Tab", "a").prevented && !press(" ", "a").prevented)

  const ui = read("components/physical/shipping-settings.tsx")
  check("the first visit and the card under All shipping settings draw the same list", (ui.match(/<FulfilmentChoice /g) ?? []).length === 2 && !/MODELS\.map\(\(m\) => \(\s*<button/.test(ui))
  check("the units switch and the rate kinds move with the arrow keys too", /data-unit-system=\{system\} onKeyDown=\{radioKeys\(/.test(ui) && /data-rate-kinds="" onKeyDown=\{radioKeys\(/.test(ui))
}

console.log("\nCarrier calculated, only with a carrier app\n")
{
  const form = (carrierApps: { id: string; name: string; connected: boolean }[], initial?: ShippingRate) => renderToStaticMarkup(createElement(RateForm, { system: "metric", carrierApps, initial, onCancel: () => undefined, onSave: async () => null }))
  const off = form([
    { id: "shippo", name: "Shippo", connected: false },
    { id: "easypost", name: "EasyPost", connected: false },
  ])
  check("nothing connected: not offered", !/data-rate-kind="carrier"/.test(off) && /data-rate-kind="flat"/.test(off))
  check("  and the form says why, with the way to Integrations", /data-carrier-hidden/.test(off) && /Shippo or EasyPost is connected/.test(off) && /href="\/app\/settings\?tab=integrations"/.test(off))
  const on = form([
    { id: "shippo", name: "Shippo", connected: true },
    { id: "easypost", name: "EasyPost", connected: false },
  ])
  check("one connected: offered, no hiding line", /data-rate-kind="carrier"/.test(on) && !/data-carrier-hidden/.test(on))
  const old = form([{ id: "easypost", name: "EasyPost", connected: false }], rate({ kind: "carrier", carrier: "easypost", serviceCode: null }))
  check("a carrier rate made before stays editable, its app marked not connected", /data-rate-kind="carrier"/.test(old) && /EasyPost \(not connected\)/.test(old), old.slice(0, 300))
  const ui = read("components/physical/shipping-settings.tsx")
  /* The kinds a seller can pick from are still these six (tests/shippingapps24.test.ts pins the list); which show depends on carrierApps. */
  check("the list is filtered by what is connected, not edited", /RATE_KINDS_OFFERED\.filter\(\(k\) => k !== "carrier" \|\| canCarrier\)/.test(ui))
}

console.log("\nThe settings read: what the page uses, no secrets\n")
{
  const route = read("app/api/physical/settings/route.ts")
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  check("no loadIntegrations, no openSecret", !/loadIntegrations|openSecret|secretHint/.test(code))
  check("integrations read as connected or not", /loadIntegrationStates\(c\.db, c\.creatorId\)/.test(route) && /carrierApps/.test(route))
  const server = read("lib/physical/config-server.ts")
  const states = server.slice(server.indexOf("export async function loadIntegrationStates"))
  check("  the light read selects provider and status only", /select\("provider, status"\)/.test(states) && !/ciphertext/.test(states.slice(0, 800)))
  const ui = read("components/physical/shipping-settings.tsx")
  check("the page never read integrations, and still doesn't", !/data\.integrations|integrations: Integration/.test(ui))
  check("a save is drawn from the PUT's answer, a failure reads again", /function useSettingsSave\(setData: SetData, reload: \(\) => void\)/.test(ui) && /const kept = r\.data\?\.settings/.test(ui) && !/setState\("saved"\)\s*\n\s*reload\(\)/.test(ui))
}

console.log("\nThe page leads with the simple thing\n")
{
  const ui = read("components/physical/shipping-settings.tsx")
  check("no rate yet: Quick setup; one that ships: the summary", /\{noRates && !skipped \? \(\s*<QuickSetup/.test(ui) && /\{usable \? <ShippingSummary/.test(ui))
  check("everything else under All shipping settings, open for a store set up further", /aria-expanded=\{open\}/.test(ui) && /useState\(\(\) => !isSimpleSetup\(data\.profiles\) && !noRates\)/.test(ui))
  check("prices start empty, Use this setup sends what was typed", /useState\(\{ price: "", min: "", max: "", freeOver: "" \}\)/.test(ui) && /useState\(\{ on: true, price: "", min: "", max: "" \}\)/.test(ui) && /"\/api\/physical\/shipping\/quick-setup"/.test(ui))
  check("the EU in one tap in the zone picker", /data-quick-eu/.test(ui) && /EU_COUNTRIES\.filter\(\(c\) => !otherCountries\.includes\(c\)\)/.test(ui))
  check("motion is opacity and transform only", /@keyframes shipping-all-in \{\s*from \{ opacity: 0; transform: translateY\(6px\); \}/.test(read("app/globals.css")))
  check("no em dash in the new words", !/—/.test(read("lib/physical/quick-setup.ts")) && !/—/.test(read("app/api/physical/shipping/quick-setup/route.ts")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
