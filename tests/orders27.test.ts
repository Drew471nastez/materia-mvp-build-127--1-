/**
 * ROUND 27, THE SELLER'S ORDERS (K27): H1 TO H9
 *
 *   carriers        one shared list: ids, names, aliases, logos on disk, the tracking page per carrier,
 *                   popular carriers first for the shipping country
 *   logo            <CarrierLogo>: the carrier's tile, a neutral mark for anyone else
 *   tracking rule   a number for every carrier, none only for local delivery / no tracking, on the server too
 *
 * Run: node scripts/run-push-tests.mjs (suite orders27)
 */
import { readFileSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CARRIER_LIST, CARRIER_NAMES, POPULAR_IN, carrierChoices, carrierLogo, carrierOf, carrierTrackingUrl, trackingRuleProblem } from "@/lib/physical/carriers"
import { CarrierLogo } from "@/components/physical/carrier-logo"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    process.stdout.write(`  ok    ${label}\n`)
  } else {
    failed++
    process.stdout.write(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}`}\n`)
  }
}
const section = (t: string) => process.stdout.write(`\n${t}\n`)
export const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  section("Carriers: the shared list")
  {
    const wanted = ["DHL", "DHL Express", "UPS", "FedEx", "USPS", "DPD", "GLS", "TNT", "Royal Mail", "Evri", "Hermes", "PostNL", "Poste Italiane", "La Poste / Colissimo", "Correos", "InPost", "Posta Romana", "FAN Courier", "Sameday", "Cargus", "Canada Post", "Australia Post", "Amazon Logistics"]
    const missing = wanted.filter((n) => !CARRIER_LIST.some((c) => c.name === n))
    check("the popular set the owner named is all there", missing.length === 0, missing)
    check("ids are unique and file safe", new Set(CARRIER_LIST.map((c) => c.id)).size === CARRIER_LIST.length && CARRIER_LIST.every((c) => /^[a-z0-9-]+$/.test(c.id)))
    const logos = CARRIER_LIST.map((c) => ({ id: c.id, path: join(process.cwd(), "public", c.logo) }))
    const absent = logos.filter((l) => !existsSync(l.path)).map((l) => l.id)
    check("every carrier has its logo on disk, local (no hotlink)", absent.length === 0 && CARRIER_LIST.every((c) => c.logo.startsWith("/carriers/")), absent)
    const heavy = logos.filter((l) => existsSync(l.path) && statSync(l.path).size > 6000).map((l) => l.id)
    check("every logo is small (under 6 KB)", heavy.length === 0, heavy)
    check("every carrier's tracking page is https and carries the number", CARRIER_LIST.every((c) => /^https:\/\/[^\s"'<>]+$/.test(c.url("AB123456")) && c.url("AB123456").includes("AB123456")))
    check("ranks follow the list, 1 first", CARRIER_LIST.every((c, i) => c.rank === i + 1))
    check("Other is still the seller's last choice in the old list", CARRIER_NAMES[CARRIER_NAMES.length - 1] === "Other" && CARRIER_NAMES.length === CARRIER_LIST.length + 1)
  }

  section("Carriers: matched however they are written")
  {
    check("by id", carrierOf("fan-courier")?.name === "FAN Courier" && carrierOf("dhl-express")?.name === "DHL Express")
    check("by name, any case and spacing", carrierOf("fan courier")?.name === "FAN Courier" && carrierOf("ROYAL MAIL")?.name === "Royal Mail")
    check("accents taken off: Poșta Română", carrierOf("Poșta Română")?.name === "Posta Romana")
    check("aliases: Hermes UK is Evri, Colissimo is La Poste, DHL Paket is DHL", carrierOf("Hermes UK")?.name === "Evri" && carrierOf("Colissimo")?.name === "La Poste / Colissimo" && carrierOf("DHL Paket")?.name === "DHL")
    check("a name wins over another carrier's alias: DHL is DHL, not DHL Express", carrierOf("DHL")?.id === "dhl" && carrierOf("DHL Express")?.id === "dhl-express")
    check("an unknown carrier is unknown", carrierOf("Speedy Bob") === null && carrierOf("") === null && carrierOf(null) === null)
    check("the logo path follows the match", carrierLogo("fan courier") === "/carriers/fan-courier.webp" && carrierLogo("Speedy Bob") === null)
  }

  section("Carriers: tracking pages")
  {
    const want: [string, string, RegExp][] = [
      ["UPS", "1Z999AA10123456784", /^https:\/\/www\.ups\.com\/track\?tracknum=1Z999AA10123456784$/],
      ["DHL", "JJD000390012345678", /^https:\/\/www\.dhl\.com\/global-en\/home\/tracking\.html\?tracking-id=JJD000390012345678&submit=1$/],
      ["GLS", "12345678901", /^https:\/\/gls-group\.com\/GROUP\/en\/parcel-tracking\?match=12345678901$/],
      ["TNT", "123456789", /^https:\/\/www\.tnt\.com\/.*cons=123456789$/],
      ["Amazon Logistics", "TBA123456789000", /^https:\/\/track\.amazon\.com\/tracking\/TBA123456789000$/],
      ["PostNord", "00370712345678901234", /^https:\/\/portal\.postnord\.com\/tracking\/details\/00370712345678901234$/],
      ["InPost", "520000012345678901234567", /^https:\/\/inpost\.pl\//],
      ["Correos", "PQ4F6P0703673180181750T", /^https:\/\/www\.correos\.es\//],
      ["Poste Italiane", "RR123456789IT", /^https:\/\/www\.poste\.it\//],
    ]
    for (const [carrier, number, re] of want) check(`${carrier}`, re.test(carrierTrackingUrl(carrier, number) ?? ""), carrierTrackingUrl(carrier, number))
    check("DPD in Romania goes to DPD Romania's own page, elsewhere to DPD's", /^https:\/\/tracking\.dpd\.ro\/\?shipmentNumber=80012345678/.test(carrierTrackingUrl("DPD", "80012345678", "ro") ?? "") && /^https:\/\/tracking\.dpd\.de\//.test(carrierTrackingUrl("DPD", "80012345678", "DE") ?? ""))
    check("nothing made up for an unknown carrier or a bad number", carrierTrackingUrl("Speedy Bob", "ABC12345") === null && carrierTrackingUrl("UPS", "<script>") === null)
  }

  section("Carriers: popular first for the shipping country")
  {
    const ro = carrierChoices("RO")
    check("Romania: FAN Courier, Sameday, Cargus first", ro.popular.slice(0, 3).map((c) => c.id).join(",") === "fan-courier,sameday,cargus")
    check("United States: USPS, UPS, FedEx first", carrierChoices("us").popular.slice(0, 3).map((c) => c.id).join(",") === "usps,ups,fedex")
    check("United Kingdom: Royal Mail, Evri first", carrierChoices("GB").popular.slice(0, 2).map((c) => c.id).join(",") === "royal-mail,evri")
    const hu = carrierChoices("HU")
    check("a country without its own row: its carriers first, then the busiest", hu.popular[0]?.id === "gls" && hu.popular.some((c) => c.id === "sameday") && hu.popular.length <= 6)
    const none = carrierChoices(null)
    check("no country: the busiest worldwide", none.popular.map((c) => c.id).join(",") === "dhl-express,ups,fedex,dhl,dpd,gls")
    check("popular and the rest together are every carrier, once", [ro, hu, none].every((x) => x.popular.length + x.rest.length === CARRIER_LIST.length && new Set([...x.popular, ...x.rest].map((c) => c.id)).size === CARRIER_LIST.length))
    check("the rest is by name", ro.rest.map((c) => c.name).join("|") === [...ro.rest].sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.name).join("|"))
    check("every popular id names a real carrier", Object.values(POPULAR_IN).flat().every((id) => CARRIER_LIST.some((c) => c.id === id)))
  }

  section("CarrierLogo")
  {
    const known = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: "fan courier", size: 28 }))
    check("a known carrier: its local tile, sized, named", /<img[^>]+src="\/carriers\/fan-courier\.webp"/.test(known) && /width="28"/.test(known) && /alt="FAN Courier"/.test(known) && /loading="lazy"/.test(known), known)
    const beside = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: "UPS", decorative: true }))
    check("beside its name: not read twice", /alt=""/.test(beside))
    const other = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: "Speedy Bob", size: 24 }))
    check("an unknown carrier: a neutral tile with its letters", /data-carrier-logo="other"/.test(other) && />SB</.test(other) && /aria-label="Speedy Bob"/.test(other), other)
    const none = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: null }))
    check("no carrier: a neutral truck, hidden from screen readers", /data-carrier-logo="none"/.test(none) && /<svg/.test(none) && /aria-hidden="true"/.test(none), none)
  }

  section("Tracking number rule")
  {
    check("a carrier with no number is refused, and the seller is told why and what to do", /Add the tracking number/.test(trackingRuleProblem("FAN Courier", "") ?? "") && /Local delivery \/ no tracking/.test(trackingRuleProblem("FAN Courier", null) ?? ""))
    check("an Other carrier needs its number too", !!trackingRuleProblem("Speedy Bob", ""))
    check("a number is enough", trackingRuleProblem("UPS", "1Z999AA10123456784") === null)
    check("no carrier (local delivery, no tracking) needs no number", trackingRuleProblem(null, null) === null && trackingRuleProblem("", "") === null)
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
