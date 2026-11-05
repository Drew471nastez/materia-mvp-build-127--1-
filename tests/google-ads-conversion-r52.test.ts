/**
 * ===========================================================================
 *  ROUND 52: A PAID ORDER IS A GOOGLE ADS CONVERSION
 * ===========================================================================
 * Storelib kept only the AW- ID, so the thank you page's gtag('event',
 * 'purchase') reached Google Ads naming no conversion action and Google Ads
 * counted no sale. Google's own event snippet for a purchase conversion
 * (Google Ads › Goals › Conversions › your action › Tag setup › Event
 * snippet) is:
 *
 *   gtag('event', 'conversion', {
 *       'send_to': 'AW-123456789/AbC-D_efG-h12_34-567',
 *       'value': 1.0,
 *       'currency': 'USD',
 *       'transaction_id': ''
 *   });
 *
 * Here the real tags (lib/store/tracking trackingTags and purchaseTags) run
 * in a sandbox with gtag as Google's base tag defines it (dataLayer.push of
 * the arguments), and what reaches the data layer is compared with that.
 *
 *   npx tsx tests/google-ads-conversion-r52.test.ts
 */
import vm from "node:vm"
import { readFileSync } from "node:fs"
import { purchaseTags, readTracking, tidyAdsLabel, trackingTags } from "@/lib/store/tracking"
import { FakeSupabase } from "./fake-supabase"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 700)}`}`)
}

const ADS = "AW-123456789"
const LABEL = "AbC-D_efG-h12_34-567"
const ORDER = { id: "4f1c2a90-0000-4000-8000-000000000001", valueCents: 2550, currency: "eur", quantity: 2 }

/** A thank you page: the base tags, then the purchase, in a sandbox with a cookie and a localStorage that persist between "visits". */
function visit(stored: unknown, opts: { cookie?: string; store?: Map<string, string> } = {}) {
  const store = opts.store ?? new Map<string, string>()
  const listeners: Record<string, (() => void)[]> = {}
  const win: Record<string, unknown> = {}
  const ctx = {
    window: win,
    document: { cookie: opts.cookie ?? "", readyState: "complete", getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }], createElement: () => ({}) },
    location: { href: `https://shop.example/thanks/t?paid=1`, pathname: "/thanks/t", search: "?paid=1", hash: "" },
    history: { state: null, replaceState() {} },
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    Intl,
    URL,
    Date,
    JSON,
    setTimeout: (f: () => void) => f(),
    addEventListener: (e: string, f: () => void) => ((listeners[e] ??= []).push(f)),
  }
  Object.assign(win, ctx, { self: win, top: win })
  vm.createContext(win)
  for (const t of [...trackingTags(stored, { asks: true }), ...purchaseTags(stored, ORDER)]) if (t.inline) vm.runInContext(t.inline, win)
  const layer = ((win.dataLayer as unknown[]) ?? []).map((a) => Array.from(a as ArrayLike<unknown>))
  return { layer, store }
}

const conversions = (layer: unknown[][]) => layer.filter((a) => a[0] === "event" && a[1] === "conversion")

async function main() {
  console.log("\nBefore: the AW- ID alone")
  const before = visit({ google_ads: ADS })
  check("a purchase event reaches Google, and no conversion names an action (what Google Ads counted: nothing)", before.layer.some((a) => a[0] === "event" && a[1] === "purchase") && conversions(before.layer).length === 0, before.layer)

  console.log("\nAfter: the ID and the purchase conversion label")
  const stored = { google_ads: ADS, google_ads_label: LABEL }
  const after = visit(stored)
  const conv = conversions(after.layer)
  console.log("    ", JSON.stringify(conv))
  /* Google's snippet: send_to 'AW-ID/label', value as a number in major units, an ISO currency, the order's id. */
  check("one gtag('event','conversion', …), exactly the keys of Google's event snippet", conv.length === 1 && JSON.stringify(Object.keys(conv[0][2] as object).sort()) === JSON.stringify(["currency", "send_to", "transaction_id", "value"]), conv)
  const p = conv[0]?.[2] as Record<string, unknown>
  check(`send_to is '${ADS}/${LABEL}'`, p?.send_to === `${ADS}/${LABEL}`, p)
  check("value 25.5, a number in major units, and currency EUR", p?.value === 25.5 && typeof p?.value === "number" && p?.currency === "EUR", p)
  check("transaction_id is the order's id, so Google drops a repeat", p?.transaction_id === ORDER.id, p)
  check("the Ads ID is configured before it (gtag('config','AW-…'))", after.layer.findIndex((a) => a[0] === "config" && a[1] === ADS) < after.layer.findIndex((a) => a[1] === "conversion"))

  console.log("\nOnce per order")
  const again = visit(stored, { store: after.store })
  check("the thank you page opened again in the same browser sends no second conversion", conversions(again.layer).length === 0, again.layer.filter((a) => a[0] === "event"))

  console.log("\nConsent")
  const no = visit(stored, { cookie: "storelib_consent=2.p1.a1.m0" })
  const update = no.layer.find((a) => a[0] === "consent" && a[1] === "update") as unknown[] | undefined
  const at = (x: unknown) => no.layer.indexOf(x as unknown[])
  check("a visitor who said No to Marketing: ad_storage and ad_user_data denied before the conversion, by Google's consent mode as every Google tag here", !!update && (update[2] as Record<string, string>).ad_storage === "denied" && (update[2] as Record<string, string>).ad_user_data === "denied" && at(update) < no.layer.findIndex((a) => a[1] === "conversion"), no.layer.filter((a) => a[0] === "consent"))
  const fresh = visit(stored)
  const defaults = fresh.layer.filter((a) => a[0] === "consent" && a[1] === "default")
  check("no answer yet: denied by default in the regions that need a yes first", defaults.some((a) => (a[2] as Record<string, unknown>).ad_storage === "denied" && Array.isArray((a[2] as Record<string, unknown>).region)), defaults)

  console.log("\nWhat is kept")
  check("a label with no Ads ID is not read", readTracking({ google_ads_label: LABEL }).google_ads_label === undefined)
  check("a label that is not one is not read", readTracking({ google_ads: ADS, google_ads_label: "<script>" }).google_ads_label === undefined)
  check("the label alone, typed", JSON.stringify(tidyAdsLabel(` ${LABEL} `)) === JSON.stringify({ label: LABEL, id: null }))
  check("the send_to pair, or the whole snippet, pasted: the label and the ID it is for", JSON.stringify(tidyAdsLabel(`gtag('event', 'conversion', { 'send_to': '${ADS}/${LABEL}', 'value': 1.0 });`)) === JSON.stringify({ label: LABEL, id: ADS }))
  check("empty removes it; anything else is refused", tidyAdsLabel("") === null && tidyAdsLabel("not a label!") === "bad")
  const { saveTrackerId } = await import("@/lib/store/tracking-server")
  const db = new FakeSupabase().table("store_settings", { unique: [["creator_id"]] }, [{ creator_id: "s1", tracking: {} }])
  const first = await saveTrackerId(db as never, "s1", "google_ads_label", LABEL)
  check("no Conversion ID yet: the label is refused with what to do", !first.ok && first.error === "Add your Conversion ID first.", first)
  await saveTrackerId(db as never, "s1", "google_ads", ADS)
  const wrong = await saveTrackerId(db as never, "s1", "google_ads_label", `AW-999999999/${LABEL}`)
  check("a label of another Ads ID is refused, naming both", !wrong.ok && /AW-999999999/.test(wrong.error) && /AW-123456789/.test(wrong.error), wrong)
  const ok = await saveTrackerId(db as never, "s1", "google_ads_label", `${ADS}/${LABEL}`)
  check("the pair pasted is kept as its label, beside the ID", ok.ok && ok.tracking.google_ads_label === LABEL && ok.tracking.google_ads === ADS, ok)
  const gone = await saveTrackerId(db as never, "s1", "google_ads", null)
  check("removing the Conversion ID takes its label with it", gone.ok && !gone.tracking.google_ads && !gone.tracking.google_ads_label, gone)
  const server = readFileSync("lib/store/tracking-server.ts", "utf8")
  check("saving checks the label is for the saved ID, and a new or removed ID takes the label away", /tidy\.id !== now\.tracking\.google_ads/.test(server) && /tracker === "google_ads" && next\.google_ads !== now\.tracking\.google_ads\) delete next\.google_ads_label/.test(server))
  check("Admin's install counts do not count the label as a service", /id !== "google_ads_label"/.test(readFileSync("app/api/admin/integrations/route.ts", "utf8")))
  const card = readFileSync("components/app/settings/integration-detail.tsx", "utf8")
  check("the Google Ads card has a Purchase conversion label field, shown once the ID is saved", /tt\("Purchase conversion label"\)/.test(card) && /label !== undefined && value \? <AdsLabelInstall/.test(card))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
