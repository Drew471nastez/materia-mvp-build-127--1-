/**
 * THE CARRIER PICKER'S OWN CARRIERS AND LIVE DATA
 *
 *   SEARCH        names, official names and aliases, best first, stable
 *   PRESELECTION  the number's shape, the default, the last one, the country's first pick
 *   PICKER        Starred, Connected, Your carriers, Popular, All; stars, a default, a carrier of the shop's own
 *   CUSTOM        a shop's own carrier and its tracking link, for the buyer too
 *   LOGO          a tile that fails to load leaves the carrier's letters, never a broken image
 *   NOTHING MADE UP  no price or estimate without a provider's answer behind it
 *   PROVIDERS     Shippo, EasyPost and ShipStation carrier accounts, read and held
 *   DATA          the static list: official names, local logo files that are real images, no services, no prices
 *   SQL           part 233, its check column, the README and the built files
 *
 * Run: npm run test:push (scripts/run-push-tests.mjs)
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CARRIER_LIST, carrierOf, carrierTrackingUrl, nationalCarrierFor } from "@/lib/physical/carriers"
import {
  EMPTY_CARRIER_PREFS,
  cleanCustomCarrier,
  customTrackingUrl,
  optionOfCarrier,
  optionOfProviderCarrier,
  preselectCarrier,
  rankCarrierOptions,
  readCarrierPrefsRow,
  toggleFavourite,
  type CarrierPrefs,
} from "@/lib/physical/carrier-prefs"
import { providerOptionFor, serviceFacts } from "@/components/physical/carrier-live"
import { CarrierLogo } from "@/components/physical/carrier-logo"
import { FRESH_MS, connectedCarriers, forgetConnectedCarriers, mergeConnected, readEasyPostAccounts, readShipStationCarriers, readShippoAccounts } from "@/lib/integrations/shipping/carrier-accounts-server"
import { guessCarrier } from "@/lib/physical/status"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const statics = () => CARRIER_LIST.map(optionOfCarrier)
const names = (q: string) => rankCarrierOptions(statics(), q).map((o) => o.name)
const prefs = (p: Partial<CarrierPrefs>): CarrierPrefs => ({ ...EMPTY_CARRIER_PREFS, ...p })

async function main() {
  console.log("\nSEARCH")
  {
    check("empty search: every carrier, in the list's own order", JSON.stringify(names("")) === JSON.stringify(CARRIER_LIST.map((c) => c.name)))
    check("'ups' is UPS first", names("ups")[0] === "UPS", names("ups").slice(0, 3))
    check("'us' is USPS first (the name starts with it)", names("us")[0] === "USPS", names("us").slice(0, 3))
    check("'united' finds USPS and UPS by their official names", ["USPS", "UPS"].every((n) => names("united").slice(0, 2).includes(n)), names("united"))
    check("'fdx' finds FedEx by its letters in order", names("fdx")[0] === "FedEx", names("fdx"))
    check("'posta' is Posta Romana; 'Poșta Română' with its accents too", names("posta")[0] === "Posta Romana" && carrierOf("Poșta Română")?.name === "Posta Romana")
    check("'fan' is FAN Courier, 'colissimo' is La Poste, 'hermes uk' is Evri", names("fan")[0] === "FAN Courier" && names("colissimo")[0] === "La Poste / Colissimo" && names("hermes uk")[0] === "Evri", [names("fan")[0], names("colissimo")[0], names("hermes uk")[0]])
    check("'post' finds the posts by a word of their name", ["Canada Post", "Australia Post", "An Post"].every((n) => names("post").includes(n)))
    check("nothing that does not match", names("zzqx").length === 0)
    check("the picker searches the same way (rankBy), not a plain 'includes'", /rankBy\(fresh, q,/.test(read("components/physical/carrier-picker.tsx")))
  }

  console.log("\nPRESELECTION")
  {
    const shop = prefs({ defaultCarrier: "DPD", lastCarrier: "GLS" })
    check("the number's shape wins (a UPS 1Z number is UPS whatever the default)", preselectCarrier(shop, { country: "RO", guessed: guessCarrier("1Z999AA10123456784") })?.carrier === "UPS")
    check("then the saved default", JSON.stringify(preselectCarrier(shop, { country: "RO" })) === JSON.stringify({ carrier: "DPD", because: "default" }))
    check("then the carrier last used", JSON.stringify(preselectCarrier(prefs({ lastCarrier: "GLS" }), { country: "RO" })) === JSON.stringify({ carrier: "GLS", because: "last" }))
    check("then the country's first pick: RO FAN Courier, US USPS, GB Royal Mail, CA Canada Post", ["RO:FAN Courier", "US:USPS", "GB:Royal Mail", "CA:Canada Post"].every((p) => preselectCarrier(EMPTY_CARRIER_PREFS, { country: p.split(":")[0] })?.carrier === p.split(":")[1]))
    check("a country no carrier names: nothing, never the busiest carrier worldwide", /* Changed on purpose (round AJ: Japan has its carriers now; Antarctica has none) */ preselectCarrier(EMPTY_CARRIER_PREFS, { country: "AQ" }) === null && nationalCarrierFor("xx") === null && nationalCarrierFor("") === null)
    check("a default naming a carrier the shop deleted does not preselect", preselectCarrier(prefs({ defaultCarrier: "Van Man" }), { country: "US" })?.carrier === "USPS")
    check("the shop's own carrier can be its default", preselectCarrier(prefs({ defaultCarrier: "Van Man", custom: [{ id: "vanman", name: "Van Man", urlTemplate: null }] }))?.carrier === "Van Man")
    const panel = read("components/physical/order-panel.tsx")
    check("the order panel guesses from the number as it is typed, and starts an empty shipment on the first guess", /guessCarrier\(v\)/.test(panel) && /firstCarrier\(prefs, \{ country, guessed: guessCarrier\(ship\.tracking\) \}\)/.test(panel) && /if \(!loaded \|\| picked\.current \|\| ship\.choice\) return/.test(panel))
    check("an order the shop delivers itself still starts on no tracking", /order\.delivery\?\.kind === "local" \? NO_TRACKING : ""/.test(panel))
    check("the carrier a shipment went with is remembered for the next order", (panel.match(/rememberCarrier\(carriers\.save, carriers\.prefs\.ready, shipBody\((?:first\.)?ship\)\.carrier\)/g) ?? []).length === 2)
  }

  console.log("\nPICKER")
  {
    const picker = read("components/physical/carrier-picker.tsx")
    check("a keyboard can star the highlighted carrier (Alt+S), and the star says so", /e\.altKey && e\.code === "KeyS"/.test(picker) && /onStar\(o\.star\)/.test(picker) && /aria-keyshortcuts="Alt\+S"/.test(picker))
    const order = ["Starred", "Connected", "Your carriers", "Popular in {country}", "All carriers"].map((t) => picker.indexOf(`tt("${t}"`))
    check("groups in order: Starred, Connected, Your carriers, Popular, All carriers", order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), order)
    check("a carrier is listed once, in the first group that has it", /if \(seen\.has\(k\)\) return false/.test(picker))
    check("a star on each carrier row, saved as the new list", /data-carrier-star=\{o\.star\}/.test(picker) && /save\(\{ favourites: toggleFavourite\(prefs\.favourites, name\) \}\)/.test(picker))
    check("Make it the default, and Add a carrier, only once the shop's carriers can be saved", /prefs\.ready && chosenName && !q/.test(picker) && /\.\.\.\(prefs\.ready \? \[\{ value: ADD/.test(picker) && /save\(\{ defaultCarrier:/.test(picker))
    check("a carrier with no id is chosen as Other with its name", /onOtherName\?\.\(v\.slice\(NAMED\.length\)/.test(picker) && /onChange\(OTHER_CARRIER\)/.test(picker))
    check("the country is shown on each carrier", /data-carrier-country=""/.test(picker))
    check("the shop's connected carriers fold in from its accounts", /useConnected\(\)/.test(picker))
    check("a star toggles, and at most 12 are kept", JSON.stringify(toggleFavourite(["UPS"], "ups")) === "[]" && toggleFavourite(Array.from({ length: 12 }, (_, i) => `C${i}`), "X").length === 12)
  }

  console.log("\nCUSTOM CARRIERS")
  {
    const ok = cleanCustomCarrier({ name: "  Van   Man ", urlTemplate: "https://track.example.com/p/{tracking}" })
    check("a name and a link with {tracking}", ok.ok && ok.carrier.name === "Van Man" && ok.carrier.urlTemplate === "https://track.example.com/p/{tracking}")
    check("refused: no name, http, no {tracking}, a carrier already in the list", [{ name: "" }, { name: "A", urlTemplate: "http://x.example/{tracking}" }, { name: "A", urlTemplate: "https://x.example/" }, { name: "fedex" }].every((i) => !cleanCustomCarrier(i).ok))
    const vm = { id: "vanman", name: "Van Man", urlTemplate: "https://track.example.com/p/{tracking}" }
    check("the buyer's link: the number put in, encoded", customTrackingUrl(vm, "AB 12-34") === "https://track.example.com/p/AB12-34" && customTrackingUrl(vm, "<x>") === null && customTrackingUrl({ ...vm, urlTemplate: null }, "AB1234") === null)
    check("saved with the shipment: the link typed, else the shop's own carrier's link with the number", /trackingUrl: s\.choice === OTHER_CARRIER \? s\.url\.trim\(\) \|\| ownCarrierLink\(s\.other, number\) : null/.test(read("components/physical/order-panel.tsx")))
    check("an old shipment's free text carrier still makes no made up link", carrierTrackingUrl("Local bike", "AB1234") === null)
    const row = readCarrierPrefsRow({ favourites: ["UPS", "ups", 7, "FedEx"], default_carrier: " DPD ", last_carrier: "", custom_carriers: [vm, { name: "<script>" }, vm] })
    check("a row is read clean: duplicates and junk left out", JSON.stringify(row.favourites) === '["UPS","FedEx"]' && row.defaultCarrier === "DPD" && row.lastCarrier === null && row.custom.length === 1)
  }

  console.log("\nLOGO: a tile that fails leaves the carrier's letters")
  {
    const known = renderToStaticMarkup(createElement(CarrierLogo, { carrier: "fan courier", size: 28 }))
    check("the letters are drawn first, the logo over them as a background (a failed one paints nothing), no <img>", /data-carrier-logo-letters="">FC</.test(known) && /background-image:url\(\/carriers\/fan-courier\.webp\)/.test(known) && known.indexOf(">FC<") < known.indexOf("background-image") && !/<img/.test(known), known)
    check("the tile is named once, on the tile itself", /role="img" aria-label="FAN Courier"/.test(known))
    const beside = renderToStaticMarkup(createElement(CarrierLogo, { carrier: "UPS", decorative: true }))
    check("beside its name: hidden, so it is not read twice", /aria-hidden="true"/.test(beside) && !/role="img"/.test(beside))
    const other = renderToStaticMarkup(createElement(CarrierLogo, { carrier: "Curier Local", size: 24 }))
    check("a carrier we don't know: its letters, no picture at all", />CL</.test(other) && !/<img/.test(other))
    const bad = CARRIER_LIST.filter((c) => {
      const f = join(root, "public", c.logo)
      if (!existsSync(f)) return true
      const b = readFileSync(f)
      return !(b.length > 200 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP")
    })
    check("every carrier's logo is a real WebP file in the repository, nothing fetched from a carrier", bad.length === 0 && CARRIER_LIST.every((c) => /^\/carriers\/[a-z-]+\.webp$/.test(c.logo)), bad.map((c) => c.id))
  }

  console.log("\nNOTHING MADE UP: no price or estimate without a provider's answer")
  {
    const ups = optionOfCarrier(carrierOf("UPS")!)
    check("our own list carries no services at all", statics().every((o) => o.services === undefined && o.provider === undefined))
    check("an option that did not come from a provider shows nothing, even if services were put on it", serviceFacts({ ...ups, services: [{ name: "Ground", days: 3, price: "$5.00" }] }).length === 0)
    const fromProvider = optionOfProviderCarrier({ carrier: "UPS", provider: { id: "shippo", name: "Shippo" }, services: [{ name: "Ground", days: 3, price: "$5.00" }, { name: "Next Day Air", days: null, price: null }] })
    const facts = serviceFacts(fromProvider)
    check("a provider's answer shows as given: price and days only where it gave them", facts[0].price === "$5.00" && facts[0].days === "3 days" && facts[1].price === null && facts[1].days === null, facts)
    const connected = { carriers: [{ carrier: "USPS", provider: { id: "shippo", name: "Shippo" }, services: ["Priority Mail"] }], errors: [] }
    const fromAccount = providerOptionFor("usps", connected, { status: "idle" })
    check("from a carrier account: the service names, never a price or a time", !!fromAccount && serviceFacts(fromAccount).every((s) => s.name === "Priority Mail" && s.price === null && s.days === null))
    const rated = providerOptionFor("USPS", connected, { status: "ready", rates: { provider: "Shippo", byCarrier: { USPS: [{ name: "Priority Mail", days: 2, price: "$9.10" }] }, warnings: [] } })
    check("after Show rates: the rate answer's own numbers", serviceFacts(rated!)[0].price === "$9.10" && serviceFacts(rated!)[0].days === "2 days")
    check("a carrier no provider knows: nothing to show", providerOptionFor("DPD", connected, { status: "idle" }) === null && providerOptionFor("DPD", connected, { status: "error", error: "x" }) === null)
    const live = read("components/physical/carrier-live.tsx")
    check("the panel draws only what serviceFacts gives", /const facts = option \? serviceFacts\(option\) : \[\]/.test(live) && /<ServicesPanel services=\{facts\}/.test(live) && !/price/.test(read("components/physical/carrier-picker.tsx")))
    check("a failed rate request is never kept to show again", /ratesKept\.delete\(key\)/.test(live))
    const sources = read("lib/physical/carriers.ts") + read("lib/physical/carrier-prefs.ts")
    check("no price, currency amount or delivery promise is written in the carrier files", !/[$€£]\s?\d|\d+\s?(business )?days?\b|"(Ground|Priority|Express Saver|Next Day)/i.test(sources.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
  }

  console.log("\nPROVIDERS: the shop's own carrier accounts")
  {
    const shippo = readShippoAccounts({ results: [{ carrier: "usps", carrier_name: "USPS", active: true, service_levels: [{ token: "usps_priority", name: "Priority Mail" }] }, { carrier: "ups", active: false }, { carrier: "dhl_express", carrier_name: "DHL Express", active: true }] })
    check("Shippo: active accounts only, as our names, with the service names it listed", shippo.length === 2 && shippo[0].carrier === "USPS" && shippo[0].services[0] === "Priority Mail" && shippo[1].carrier === "DHL Express")
    const ep = readEasyPostAccounts([{ id: "ca_1", type: "UpsAccount", readable: "UPS" }, { id: "ca_2", type: "LocalCourierAccount", readable: "" }])
    check("EasyPost: readable name, or the account type without 'Account'", ep.length === 2 && ep[0].carrier === "UPS" && ep[1].carrier === "LocalCourier" && ep.every((c) => c.services.length === 0))
    const ss = readShipStationCarriers([{ name: "Stamps.com", code: "stamps_com" }, { name: "FedEx", code: "fedex" }], { stamps_com: [{ name: "USPS Priority Mail" }], fedex: [] })
    check("ShipStation: Stamps.com is USPS; listservices gives the service names", ss[0].carrier === "USPS" && ss[0].services[0] === "USPS Priority Mail" && ss[1].carrier === "FedEx")
    check("two accounts for one carrier at one provider are one row", mergeConnected([...shippo, ...shippo]).length === 2)
    check("garbage in, nothing out", readShippoAccounts(null).length === 0 && readEasyPostAccounts({}).length === 0 && readShipStationCarriers("x", {}).length === 0)
    check("no price or delivery time comes from a carrier account", [...shippo, ...ep, ...ss].every((c) => Object.keys(c).sort().join() === "carrier,provider,services" && c.services.every((s) => typeof s === "string")))

    let reads = 0
    const db = { from: () => { reads++; const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }) }; return q } }
    forgetConnectedCarriers()
    const t = 1_000_000
    const first = await connectedCarriers(db, "shop-1", t)
    const readsAfterFirst = reads
    await connectedCarriers(db, "shop-1", t + FRESH_MS - 1)
    check("nothing connected: an empty list, no error", first.carriers.length === 0 && first.errors.length === 0)
    check("held per shop for a short while: a second look reads nothing", reads === readsAfterFirst, { reads, readsAfterFirst })
    await connectedCarriers(db, "shop-1", t + FRESH_MS + 1)
    check("past it, the providers are asked again", reads > readsAfterFirst)
    const route = read("app/api/physical/carriers/route.ts")
    check("the route serves them on ?connected=1, after the owner check", /searchParams\.get\("connected"\) === "1"/.test(route) && route.indexOf("physicalCaller") < route.indexOf("connectedCarriers(c.db"))
  }

  console.log("\nDATA: the static list")
  {
    check("every country is an ISO 3166-1 alpha-2 code", CARRIER_LIST.every((c) => c.countries.every((cc) => /^[A-Z]{2}$/.test(cc))))
    check("an official name, where set, finds its carrier", CARRIER_LIST.every((c) => !c.official || carrierOf(c.official)?.name === c.name) && CARRIER_LIST.filter((c) => c.official).length >= 5)
    check("no carrier holds services, days or prices", CARRIER_LIST.every((c) => Object.keys(c).every((k) => ["id", "name", "official", "countries", "rank", "track", "trackIn", "logo", "aliases", "url"].includes(k))))
  }

  console.log("\nSQL: part 233")
  {
    const part = read("supabase/sql/run-now/233_physical_carrier_prefs.sql")
    const lines = part.trim().split("\n")
    check("a comment line, one statement per line, notify pgrst last", lines[0].startsWith("/*") && lines[0].endsWith("*/") && lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("idempotent: IF NOT EXISTS and DROP POLICY IF EXISTS", /CREATE TABLE IF NOT EXISTS public\.physical_carrier_prefs/.test(part) && /DROP POLICY IF EXISTS physical_carrier_prefs_owner_read/.test(part))
    check("row level security: the owner reads their own, writes are the server's", /ENABLE ROW LEVEL SECURITY/.test(part) && /REVOKE ALL ON public\.physical_carrier_prefs FROM PUBLIC, anon, authenticated;/.test(part) && /GRANT SELECT ON public\.physical_carrier_prefs TO authenticated;/.test(part) && !/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO (anon|authenticated)/.test(part))
    check("names only: no price or service column", !/price|cents|service(?!_role)/i.test(lines.slice(1).join("\n")))
    check("the migration is the same text", read("supabase/migrations/20270202_physical_carrier_prefs.sql") === part)
    check("the README lists it", /\| `233_physical_carrier_prefs\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
    check("the check row has p233, whole", /\) as p233_physical_carrier_prefs;\s*$/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("built into the files the owner pastes", read("supabase/sql/run-four/3_of_4_latest.sql").includes(lines[1]) && read("supabase/sql/all-in-three/2_of_3_latest.sql").includes(lines[1]))
    check("the server says which part a save needs", /CARRIER_PREFS_SQL_PART = "233"/.test(read("lib/physical/carrier-prefs.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
