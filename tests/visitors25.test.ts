/**
 * Round 25, G25: a website's visitors.
 *
 *   Show visitors their own language: the browser's language sends a first
 *   visit there once (exact match only, from the website's own language,
 *   never a crawler, the cart or checkout), a near match or the country is
 *   only offered by a small card, remembered either way, on builder themes,
 *   imported themes and the creator page.
 *
 *   Google Analytics: the ID found in whatever was pasted, consent mode that
 *   never leaves everyone "denied", the tag on every kind of page the store
 *   has (website, imported theme, creator page, product page, OnePage,
 *   checkout, thank you page), page views on client navigations, the
 *   ecommerce steps with names and prices, and the "receiving data" proof.
 *
 *   node scripts/run-push-tests.mjs (registered there)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import { CONSENT_REGIONS, GA_PAGE_JS, gaCheckHtml, gaCheckoutOf, gaConsentJs, gaItem, gaProductJs, gaSeenJs, readGaInput } from "@/lib/store/ga"
import { purchaseTags, tidyId, trackingTags } from "@/lib/store/tracking"
import { gaBeginCheckout, gaPurchase, pixelEvent, PIXEL_EVENT_JS } from "@/lib/analytics/pixels"
import { askedLanguages, languageFit, suggestWords, visitorLanguageDecision, visitorLanguageFor } from "@/lib/markets/visitor-language"
import { LANGUAGE_SUGGEST_JS, languageSuggestTag } from "@/lib/markets/suggest-script"
import { validateLocalization } from "@/lib/markets/model"
import { STORED } from "@/lib/consent/consent"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const CREATOR = "11111111-2222-4333-8444-555555555555"
const PRODUCT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

/** A small browser for the inline scripts: dataLayer, cookies, storage, timers run at once, beacons recorded. */
function browser(opts: { cookie?: string; href?: string; framed?: boolean } = {}) {
  const beacons: { url: string; body: string }[] = []
  const session = new Map<string, string>()
  const local = new Map<string, string>()
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  let observer: ((list: { getEntries(): { name: string }[] }) => void) | null = null
  const timers: (() => void)[] = []
  const win: Record<string, unknown> = {
    document: { cookie: opts.cookie ?? "", title: "Mug", readyState: "complete", addEventListener: () => {} },
    location: { href: opts.href ?? "https://shop.example/", pathname: new URL(opts.href ?? "https://shop.example/").pathname },
    navigator: { sendBeacon: (url: string, b: { text: string }) => (beacons.push({ url, body: b.text }), true) },
    sessionStorage: { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v) },
    localStorage: { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => void local.set(k, v) },
    setTimeout: (f: () => void) => (timers.push(f), 1),
    addEventListener: (t: string, f: (e: unknown) => void) => void (listeners[t] ??= []).push(f),
    Blob: class {
      text: string
      constructor(parts: string[]) {
        this.text = parts.join("")
      }
    },
    PerformanceObserver: class {
      constructor(fn: (list: { getEntries(): { name: string }[] }) => void) {
        observer = fn
      }
      observe() {}
      disconnect() {}
    },
  }
  win.window = win
  win.self = win
  win.top = opts.framed ? {} : win
  return {
    win,
    beacons,
    session,
    local,
    run: (js: string) => runInNewContext(js, win),
    flush: () => {
      while (timers.length) timers.shift()!()
    },
    resource: (name: string) => observer?.({ getEntries: () => [{ name }] }),
    fire: (t: string) => (listeners[t] ?? []).forEach((f) => f({})),
    layer: () => (win.dataLayer as unknown[]).map((a) => Array.from(a as ArrayLike<unknown>)),
  }
}

console.log("\nGoogle Analytics: what was pasted\n")
{
  check("the ID itself, in any case and with spaces", (readGaInput(" g-1a2b3c4d5e ") as { id: string }).id === "G-1A2B3C4D5E")
  const snippet = `<!-- Google tag (gtag.js) --><script async src="https://www.googletagmanager.com/gtag/js?id=G-C2SD9ZCTXK"></script><script>window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-C2SD9ZCTXK');</script>`
  check("Google's whole snippet: the G- ID inside it, nothing else", JSON.stringify(readGaInput(snippet)) === JSON.stringify({ ok: true, id: "G-C2SD9ZCTXK" }))
  check("  the tag's address too", (readGaInput("https://www.googletagmanager.com/gtag/js?id=G-ABCD1234") as { id: string }).id === "G-ABCD1234")
  check("  Settings reads the snippet for its ID before saving; the server takes exactly an ID", /const found = readGaInput\(next\)/.test(read("components/app/settings/ga-connect.tsx")) && tidyId("ga4", snippet) === "bad" && tidyId("ga4", "G-C2SD9ZCTXK") === "G-C2SD9ZCTXK")
  const said = (v: string) => (readGaInput(v) as { error?: string }).error ?? ""
  check("a Universal Analytics UA- ID is named as switched off, never taken", /Universal Analytics/.test(said("UA-12345678-1")))
  check("  a Google tag GT- ID, an Ads ID, a Tag Manager container, a property number: each named", /GT-/.test(said("GT-ABCDE12")) && /Google Ads/.test(said("AW-123456789")) && /Tag Manager/.test(said("GTM-AB12CD")) && /property or stream/.test(said("123456789")))
  check("  and junk says what an ID looks like", /G-1A2B3C4D5E/.test(said("hello")) && /starts with G-/.test(said("")))
  check("  code is never kept", tidyId("ga4", "G-ABCD1234');alert(1)//") === "bad" && (readGaInput("G-ABCD1234');alert(1)//") as { id: string }).id === "G-ABCD1234")
  const server = read("lib/store/tracking-server.ts")
  check("  saving says the same words (saveTrackerId)", /tracker === "ga4" \? readGaInput\(value\)/.test(server))
}

console.log("\nThe tag: consent, config, frames\n")
{
  const tags = trackingTags({ ga4: "G-ABCD1234" }, { creatorId: CREATOR })
  const inline = tags.find((t) => t.key === "gtag")!.inline!
  check("the same two tags as before, gtag's config line unchanged", tags.map((t) => t.key).join() === "gtag-src,gtag" && /gtag\('config',"G-ABCD1234"\)/.test(inline))
  check("consent defaults come before gtag('js') and the config", inline.indexOf("gtag('consent','default'") < inline.indexOf("gtag('js'") && inline.indexOf("gtag('js'") < inline.indexOf("gtag('config'"))
  const b = browser()
  b.run(inline)
  const layer = b.layer()
  const defaults = layer.filter((a) => a[0] === "consent" && a[1] === "default").map((a) => a[2] as Record<string, unknown>)
  check("a page with the banner: the regions that need a yes wait for it, everyone else is counted", defaults.length === 2 && defaults[0].analytics_storage === "denied" && Array.isArray(defaults[0].region) && (defaults[0].region as string[]).includes("FR") && defaults[1].analytics_storage === "granted" && !("region" in defaults[1]), defaults)
  check("  never 'denied' for every visitor (what keeps Google saying data collection isn't active)", !defaults.some((d) => d.analytics_storage === "denied" && !d.region))
  check("  the regions are the EEA, the UK and Switzerland", CONSENT_REGIONS.length === 32 && ["GB", "CH", "NO", "DE"].every((c) => (CONSENT_REGIONS as readonly string[]).includes(c)) && !(CONSENT_REGIONS as readonly string[]).includes("US"))
  check("  then the config, once", layer.filter((a) => a[0] === "config").length === 1)
  const noBanner = browser()
  noBanner.run(trackingTags({ ga4: "G-ABCD1234" }, { creatorId: CREATOR, asks: false }).find((t) => t.key === "gtag")!.inline!)
  check("an imported theme (no Storelib banner): granted for everyone, no region waits", noBanner.layer().filter((a) => a[0] === "consent" && a[1] === "default").length === 1)
  const yes = browser({ cookie: `storelib_consent=2.p0.a1.m0.${Math.floor(Date.now() / 1000)}` })
  yes.run(inline)
  const upd = yes.layer().find((a) => a[0] === "consent" && a[1] === "update")?.[2] as Record<string, string> | undefined
  check("the visitor's own answer wins: analytics yes, marketing no", upd?.analytics_storage === "granted" && upd?.ad_storage === "denied", upd)
  const no = browser({ cookie: `storelib_consent=2.p0.a0.m0.${Math.floor(Date.now() / 1000)}` })
  no.run(inline)
  check("  and a no is a no, everywhere", (no.layer().find((a) => a[0] === "consent" && a[1] === "update")?.[2] as Record<string, string>)?.analytics_storage === "denied")
  const later = browser()
  later.run(inline)
  ;(later.win.document as { cookie: string }).cookie = `storelib_consent=2.p1.a1.m1.${Math.floor(Date.now() / 1000)}`
  later.fire("storelib:consent-changed")
  check("  pressing Accept on the banner updates consent on the same page", later.layer().some((a) => a[0] === "consent" && a[1] === "update" && (a[2] as Record<string, string>).analytics_storage === "granted"))
  const framed = browser({ framed: true })
  framed.run(inline)
  check("never in a frame (the editor's canvas, the Website page's preview)", !framed.layer().some((a) => a[0] === "config"))
  check("a stored value that is not an ID still never reaches a page", trackingTags({ ga4: "G-ABC</script><script>x" }).length === 0)
}

console.log("\nPage views after the first, without a full load\n")
{
  const b = browser({ href: "https://storelib.com/andrew/mug" })
  b.run(GA_PAGE_JS)
  ;(b.win as Record<string, unknown>).gtag = (...a: unknown[]) => (b.win.dataLayer as unknown[]).push(a)
  b.win.dataLayer = []
  ;(b.win.__slGaPage as (ids: string[]) => void)(["G-ABCD1234"])
  b.flush()
  const views = () => (b.win.dataLayer as unknown[][]).filter((a) => Array.isArray(a) && a[1] === "page_view")
  check("a client navigation is a page_view to the store's ID, with its address and title", views().length === 1 && (views()[0][2] as Record<string, string>).send_to === "G-ABCD1234" && (views()[0][2] as Record<string, string>).page_location === "https://storelib.com/andrew/mug")
  ;(b.win.__slGaPage as (ids: string[]) => void)(["G-ABCD1234"])
  b.flush()
  check("  the same address twice is one view", views().length === 1)
  ;(b.win.location as { href: string }).href = "https://storelib.com/andrew/cap"
  ;(b.win.__slGaPage as (ids: string[]) => void)(["G-ABCD1234"])
  ;(b.win.dataLayer as unknown[]).push({ event: "gtm.historyChange-v2", "gtm.newUrl": "https://storelib.com/andrew/cap" })
  b.flush()
  check("  Google's own history listener already counted it: not twice", views().length === 1)
  ;(b.win.location as { href: string }).href = "https://storelib.com/andrew/hat"
  ;(b.win as Record<string, unknown>)["ga-disable-G-ABCD1234"] = true
  ;(b.win.__slGaPage as (ids: string[]) => void)(["G-ABCD1234"])
  b.flush()
  check("  off the store's pages (ga-disable), nothing is sent", views().length === 1)
  const route = read("components/analytics/ga-route.tsx")
  check("GaRoute: the IDs on while the store's page is shown, off when it leaves, a view per path change", /w\[`ga-disable-\$\{id\}`\] = false/.test(route) && /w\[`ga-disable-\$\{id\}`\] = true/.test(route) && /\[pathname, key\]/.test(route) && /__slGaPage\(later\)/.test(route))
  const st = read("components/website-builder/store-tracking.tsx")
  check("  each store's tag has its own id, so a second store's page loads its own", /id=\{`storelib-\$\{x\.key\}-\$\{tagged\}`\}/.test(st) && /<GaRoute ids=\{gtagIds\}/.test(st))
}

console.log("\nGoogle took a hit: Settings shows Receiving data\n")
{
  const b = browser()
  b.run(gaSeenJs(["G-ABCD1234"], CREATOR))
  b.resource("https://www.googletagmanager.com/gtag/js?id=G-ABCD1234")
  b.resource("https://region1.google-analytics.com/g/collect?v=2&tid=G-OTHER999&en=page_view")
  check("not for a script load, nor another ID's hit", b.beacons.length === 0)
  b.resource("https://region1.google-analytics.com/g/collect?v=2&tid=G-ABCD1234&gtm=x&en=page_view")
  b.resource("https://region1.google-analytics.com/g/collect?v=2&tid=G-ABCD1234&en=scroll")
  check("the first hit with the store's ID tells Storelib once, the creator and the ID only", b.beacons.length === 1 && b.beacons[0].url === "/api/store/ga-seen" && b.beacons[0].body === JSON.stringify({ creatorId: CREATOR, id: "G-ABCD1234" }), b.beacons)
  const again = browser()
  again.session.set(`sl_ga_seen:${CREATOR}`, "1")
  again.run(gaSeenJs(["G-ABCD1234"], CREATOR))
  again.resource("https://region1.google-analytics.com/g/collect?v=2&tid=G-ABCD1234")
  check("  once a tab: the next page of the visit says nothing", again.beacons.length === 0)
  check("  nothing for a creator id that is not one", gaSeenJs(["G-ABCD1234"], "x") === "")
  const seen = read("app/api/store/ga-seen/route.ts")
  check("the route answers 204 whatever happens and keeps only the store's own ID (recordGaSeen)", /status: 204/.test(seen) && /recordGaSeen\(createAdminClient\(\), body\.creatorId, body\.id, "at"\)/.test(seen))
  check("  declared public, with why", /"store\/ga-seen\/route\.ts":/.test(read("tests/admin-key-routes.test.ts")))
}

async function statusChecks() {
  console.log("\nrecordGaSeen and the status Settings reads\n")
  const { recordGaSeen, loadGaStatus } = await import("@/lib/store/tracking-server")
  let row: Record<string, unknown> = { tracking: { ga4: "G-ABCD1234" }, tracking_seen: {} }
  let writes = 0
  const db = {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: row, error: null }),
        update: (v: Record<string, unknown>) => ({ eq: async () => ((row = { ...row, ...v }), writes++, { error: null }) }),
      }
      return q
    },
  }
  const t0 = Date.parse("2026-10-12T10:00:00Z")
  check("another ID is never kept", (await recordGaSeen(db, CREATOR, "G-OTHER999", "at", t0)) === false && writes === 0)
  check("the store's own is", (await recordGaSeen(db, "22222222-2222-4333-8444-555555555555", "G-ABCD1234", "at", t0)) === true && writes === 1)
  check("  and at most once a minute a store", (await recordGaSeen(db, "22222222-2222-4333-8444-555555555555", "G-ABCD1234", "at", t0 + 30_000)) === false && writes === 1)
  await recordGaSeen(db, "22222222-2222-4333-8444-555555555555", "G-ABCD1234", "checkedAt", t0 + 40_000)
  const st = await loadGaStatus(db, CREATOR)
  check("the status: the ID, the last hit and the last check", st.id === "G-ABCD1234" && st.seenAt === new Date(t0).toISOString() && st.checkedAt === new Date(t0 + 40_000).toISOString() && st.ready, st)
  row = { ...row, tracking: { ga4: "G-NEW12345" } }
  const fresh = await loadGaStatus(db, CREATOR)
  check("  a new ID starts over: nothing seen yet", fresh.id === "G-NEW12345" && fresh.seenAt === null && fresh.checkedAt === null)
}

console.log("\nEcommerce: view_item, add_to_cart, begin_checkout, purchase\n")
{
  const item = gaItem({ id: PRODUCT, title: "  Tech house   drum kit ", priceCents: 2499, kind: "digital" })!
  check("an item: id, name, price in units, physical or digital", item.item_id === PRODUCT && item.item_name === "Tech house drum kit" && item.price === 24.99 && item.item_category === "Digital")
  const calls: unknown[][] = []
  const w = { gtag: (...a: unknown[]) => calls.push(a), __slGaItems: { [PRODUCT]: { item, currency: "EUR" } } } as unknown as Window
  pixelEvent(w, "view_item", PRODUCT)
  const p = calls[0]?.[2] as Record<string, unknown>
  check("view_item carries the product's name, price, currency and value when the page named it", calls[0]?.[1] === "view_item" && p.currency === "EUR" && p.value === 24.99 && (p.items as Record<string, unknown>[])[0].item_name === "Tech house drum kit", p)
  pixelEvent({ gtag: (...a: unknown[]) => calls.push(a) } as unknown as Window, "add_to_cart", PRODUCT)
  check("  an unnamed product still sends its id", ((calls[1]?.[2] as Record<string, unknown>).items as Record<string, unknown>[])[0].item_id === PRODUCT)
  const later: unknown[][] = []
  const timers: (() => void)[] = []
  const waiting: Record<string, unknown> = { __slGaWait: true, setTimeout: (f: () => void) => (timers.push(f), 1) }
  pixelEvent(waiting as unknown as Window, "view_item", PRODUCT)
  waiting.gtag = (...a: unknown[]) => later.push(a)
  while (timers.length) timers.shift()!()
  check("a step asked before the tag loaded waits for it instead of being lost", later.length === 1 && later[0][1] === "view_item")
  const mem = new Map<string, string>()
  const bc: unknown[][] = []
  const tab = { gtag: (...a: unknown[]) => bc.push(a), sessionStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } } as unknown as Window
  const cart = gaCheckoutOf([{ productId: PRODUCT, title: "Kit", unitCents: 2000, quantity: 2, discountCents: 500, type: "physical" }], "usd")
  check("a checkout's lines: items, value before shipping and tax", cart.valueCents === 3500 && cart.currency === "USD" && cart.items[0].quantity === 2 && cart.items[0].item_category === "Physical")
  gaBeginCheckout(tab, { currency: cart.currency, valueCents: cart.valueCents, items: cart.items as unknown as Record<string, unknown>[] })
  gaBeginCheckout(tab, { currency: cart.currency, valueCents: cart.valueCents, items: cart.items as unknown as Record<string, unknown>[] })
  check("checkout opened: begin_checkout once, with the cart's value", bc.length === 1 && bc[0][1] === "begin_checkout" && (bc[0][2] as Record<string, unknown>).value === 35)
  const pressed: unknown[][] = []
  const mem2 = new Map<string, string>()
  const tab2 = { gtag: (...a: unknown[]) => pressed.push(a), sessionStorage: { getItem: (k: string) => mem2.get(k) ?? null, setItem: (k: string, v: string) => void mem2.set(k, v) } } as unknown as Window
  pixelEvent(tab2, "begin_checkout", PRODUCT)
  gaBeginCheckout(tab2, { currency: "USD", valueCents: 100, items: [] })
  check("  not again when the Check out press in this tab already told it", pressed.length === 1)
  const paid: unknown[][] = []
  const store = new Map<string, string>()
  const buyer = { gtag: (...a: unknown[]) => paid.push(a), localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } } as unknown as Window
  gaPurchase(buyer, { transactionId: "sl-0011223344556677", valueCents: 2499, currency: "USD", items: [item] })
  gaPurchase(buyer, { transactionId: "sl-0011223344556677", valueCents: 2499, currency: "USD", items: [item] })
  check("a download paid on Storelib checkout: purchase once, never the receipt's token", paid.length === 1 && paid[0][1] === "purchase" && (paid[0][2] as Record<string, unknown>).transaction_id === "sl-0011223344556677")
  const client = read("app/checkout/checkout-client.tsx")
  const route = read("components/analytics/ga-route.tsx")
  check("  checkout says it was paid, and the reference is fingerprinted before it goes", /new CustomEvent\("storelib:paid"/.test(client) && /crypto\.subtle\.digest\("SHA-256"/.test(route) && /addEventListener\("storelib:paid"/.test(route))
  const tags = purchaseTags({ ga4: "G-ABCD1234" }, { id: "55555555-5555-4555-8555-555555555555", valueCents: 4250, currency: "eur", quantity: 2, items: [item] })
  check("a thank you page's purchase names what was bought, and is told once per order in this browser", /gtag\('event','purchase',\{transaction_id:"55555555-5555-4555-8555-555555555555",value:42\.5,currency:"EUR",items:\[/.test(tags[0].inline) && /sl_tx:/.test(tags[0].inline))
  const without = purchaseTags({ ga4: "G-ABCD1234" }, { id: "55555555-5555-4555-8555-555555555555", valueCents: 4250, currency: "eur", quantity: 2 })
  check("  without products the line is as it was", /currency:"EUR"\}\)/.test(without[0].inline))
  const js = PIXEL_EVENT_JS
  const fake: unknown[][] = []
  const wctx: Record<string, unknown> = { gtag: (...a: unknown[]) => fake.push(a), __slGaItems: { [PRODUCT]: { item, currency: "GBP" } }, sessionStorage: { setItem() {} } }
  wctx.window = wctx
  runInNewContext(js + `window.__slPixel('add_to_cart',${JSON.stringify(PRODUCT)})`, wctx)
  check("an imported theme's Add to cart carries the name and price too (PIXEL_EVENT_JS)", (fake[0]?.[2] as Record<string, unknown>)?.currency === "GBP" && (fake[0]?.[2] as Record<string, unknown>)?.value === 24.99)
  check("  and the theme's page names its product (gaProductJs)", /__slGaItems\["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"\]=/.test(gaProductJs(item, "usd")) && gaProductJs(null, null) === "")
}

console.log("\nOn every kind of page the store has\n")
{
  const has = (p: string, re: RegExp) => re.test(read(p))
  check("creator page (never in the editor's canvas)", has("app/(marketing)/u/[username]/page.tsx", /\{!embedded && <StoreTracking creatorId=\{creator\.id\} \/>\}/))
  check("product pages on storelib.com, with the product named", has("app/(marketing)/p/[slug]/page.tsx", /<StoreTracking creatorId=\{product\.creator_id\} productId=\{product\.id\} \/>/))
  check("the OnePage", has("app/(marketing)/l/[slug]/page.tsx", /<StoreTracking creatorId=\{resolvedCreatorId\} \/>/))
  check("a builder website's pages, its banner's switch deciding consent mode", has("app/(site)/w/[username]/render-site.tsx", /<StoreTracking creatorId=\{site\.creatorId\} asks=\{/) && has("app/(site)/w/[username]/products/[slug]/page.tsx", /productSlug=\{slug\}/))
  check("an imported theme's pages, granted (no banner there), with the product named", has("app/api/site-theme/site/[username]/[[...path]]/route.ts", /* Round 25 (V25): the product's id from the lists already held, not a second read. */ /compatPageTags\(\{ stored, creatorId: found\.site\.creatorId, productId, named,/) && has("lib/store/compat-page-tags.ts", /trackingTags\(input\.stored, \{ creatorId: input\.creatorId, asks: false \}\)/) && has("lib/store/compat-page-tags.ts", /gaProductJs\(input\.named\.item, input\.named\.currency\)/))
  check("the website's checkout (begin_checkout) and its thank you page (purchase, physical and digital)", has("app/checkout/site/page.tsx", /<StoreTracking creatorId=\{site\.creatorId\} checkout=\{/) && has("app/checkout/site/thanks/[token]/page.tsx", /<StoreTracking creatorId=\{site\.creatorId\} purchase=\{\{ id: order\.ga\.id/))
  check("  the thank you page never sends the token, only the order's own id", has("app/checkout/site/thanks/[token]/page.tsx", /ga: \{ id: String\(co\.id\)/) && has("app/checkout/site/thanks/[token]/page.tsx", /id: String\(first\.id\)/))
  check("Storelib's checkout for a download (begin_checkout, then purchase when paid)", has("app/checkout/page.tsx", /<StoreTracking\s+creatorId=\{creator\.id\}\s+checkout=\{gaCheckoutOf\(/))
  check("the physical order page's purchase names its products", has("app/checkout/physical/order/[token]/page.tsx", /items: order\.lines\.map\(\(l\) => gaItem\(/))
  check("Settings' check page may be framed by Storelib alone", /url\.pathname === "\/api\/store\/ga-check"/.test(read("proxy.ts")))
  const csp = read("lib/security/csp.ts")
  check("the content security policy lets the tag load and report", /https:\/\/www\.googletagmanager\.com/.test(csp) && /https:\/\/\*\.google-analytics\.com/.test(csp) && /Content-Security-Policy-Report-Only/.test(read("vercel.json")))
}

console.log("\nSettings › Integrations › Google Analytics\n")
{
  const ui = read("components/app/settings/ga-connect.tsx")
  check("one field, Connect, then the live check runs at once", /Connect/.test(ui) && /if \(id\) void verify\(id\)/.test(ui) && /\/api\/store\/ga-check\?id=/.test(ui))
  check("  says Connected, receiving data with the last event's time", /Connected, receiving data/.test(ui) && /Last event \$\{ago\(ga\.seenAt\)\}/.test(ui))
  check("  explains Realtime within a minute and Google's 48 hours", /within a minute/.test(ui) && /48 hours/.test(ui))
  check("  and it is the Google Analytics page's setup card", /<GaConnect value=\{tracking\?\.ga4 \?\? null\}/.test(read("components/app/settings/integrations-directory.tsx")))
  const check2 = read("app/api/store/ga-check/route.ts")
  const page = gaCheckHtml("G-ABCD1234", "https://andrew.storelib.com/")
  check("the check page: the owner's alone, one storelib_connected event, the hit watched, cookies kept to itself", /shopCaller\(\)/.test(check2) && /gaCheckHtml\(asked, site\)/.test(check2) && /storelib_connected/.test(page) && /\/g\\\/collect/.test(page) && /cookie_path:location\.pathname/.test(page) && gaCheckHtml("UA-1", null) === "")
  const ws = read("components/website-builder/website-settings/commerce.tsx")
  check("Website settings' Integrations row shows a small Google Analytics status", /data-ga-badge/.test(ws))
}

console.log("\nShow visitors their own language: matching\n")
{
  check("fr-CA is French, en-GB is English, zh-TW is Traditional Chinese", languageFit("fr", "fr-CA") === "exact" && languageFit("en", "en-GB") === "exact" && languageFit("zh-Hant", "zh-TW") === "exact")
  check("  a near one: Portugal's Portuguese for Brazil's, Simplified for Traditional", languageFit("pt-BR", "pt-PT") === "near" && languageFit("zh-Hans", "zh-HK") === "near" && languageFit("de", "fr") === null)
  check("the browser's order, by q", askedLanguages("en;q=0.5, fr-FR, de;q=0.8, *;q=0.1").join() === "fr-FR,de,en")
  const site = ["en", "fr", "de", "pt-BR"]
  check("the first language asked for that the site has decides", visitorLanguageFor({ acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8", languages: site }).exact === "fr")
  check("  the website's own first: nothing to do", visitorLanguageFor({ acceptLanguage: "en-US,en;q=0.9,fr;q=0.5", languages: site }).exact === "en")
  check("  a near match is only offered", JSON.stringify(visitorLanguageFor({ acceptLanguage: "pt-PT", languages: site })) === JSON.stringify({ exact: null, closest: "pt-BR" }))
  check("  nothing asked fits: the country's language is offered, never sent", JSON.stringify(visitorLanguageFor({ acceptLanguage: "ja", country: "AT", languages: site })) === JSON.stringify({ exact: null, closest: "de" }))
  check("  one language: nothing", JSON.stringify(visitorLanguageFor({ acceptLanguage: "fr", languages: ["en"] })) === JSON.stringify({ exact: null, closest: null }))
  check("the offer is written in the language it offers", /Voir ce site/.test(suggestWords("fr").ask) && /ansehen/.test(suggestWords("de").ask) && suggestWords("pt-BR") === suggestWords("pt") && /檢視/.test(suggestWords("zh-TW").ask) && suggestWords("xx").ask === suggestWords("en").ask)
}

console.log("\nShow visitors their own language: what the proxy does\n")
{
  const base = { method: "GET", dest: "document", accept: "text/html,*/*", userAgent: "Mozilla/5.0 (iPhone) Safari", pathname: "/", skip: false, chosen: null, offered: null, on: true, defaultLanguage: "en", others: ["fr", "de"], acceptLanguage: "fr-FR,fr;q=0.9", country: "FR" }
  const d = visitorLanguageDecision(base)
  check("a French browser on the home page: to /fr once", d?.kind === "redirect" && d.to === "/fr" && d.language === "fr", d)
  check("  the same page, any page: /about to /fr/about", (visitorLanguageDecision({ ...base, pathname: "/about" }) as { to: string }).to === "/fr/about")
  check("  off: nothing", visitorLanguageDecision({ ...base, on: false }) === null)
  check("  once: a language chosen or sent before (sl_lang) is never overridden", visitorLanguageDecision({ ...base, chosen: "en" }) === null)
  check("  never a crawler", visitorLanguageDecision({ ...base, userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }) === null && visitorLanguageDecision({ ...base, userAgent: "facebookexternalhit/1.1" }) === null)
  check("  never a script, a form, a file, the cart or checkout", visitorLanguageDecision({ ...base, dest: "empty" }) === null && visitorLanguageDecision({ ...base, method: "POST" }) === null && visitorLanguageDecision({ ...base, pathname: "/logo.png" }) === null && visitorLanguageDecision({ ...base, skip: true }) === null && visitorLanguageDecision({ ...base, accept: "application/json" }) === null)
  check("  already in French: nothing", visitorLanguageDecision({ ...base, pathname: "/fr/about" }) === null)
  check("  a German browser on a French address someone shared: offered German, not moved", JSON.stringify(visitorLanguageDecision({ ...base, pathname: "/fr/about", acceptLanguage: "de-DE" })) === JSON.stringify({ kind: "suggest", language: "de" }))
  check("  an English browser on /fr: offered English, the address kept", JSON.stringify(visitorLanguageDecision({ ...base, pathname: "/fr", acceptLanguage: "en-US" })) === JSON.stringify({ kind: "suggest", language: "en" }))
  check("  a Japanese browser in Austria: German offered, never sent", JSON.stringify(visitorLanguageDecision({ ...base, acceptLanguage: "ja-JP", country: "AT" })) === JSON.stringify({ kind: "suggest", language: "de" }))
  check("  offered once a visit (sl_suggest)", visitorLanguageDecision({ ...base, acceptLanguage: "ja-JP", country: "AT", offered: "de" }) === null)
  const proxy = read("proxy.ts")
  check("the proxy asks it on the subdomain, a connected domain and an imported theme, after a market's own language", (proxy.match(/await visitorLanguageStart\(request, /g) ?? []).length === 3 && /marketLanguageStart\(request, name, pathname\)\s*\n\s*if \(started\) return started\s*\n\s*const own = await visitorLanguageStart/.test(proxy))
  check("  sent once, remembered (sl_lang), never kept by a cache", /r\.cookies\.set\("sl_lang", decided\.language\.toLowerCase\(\)/.test(proxy) && /visitorLanguageDecision\(\{[\s\S]{0,900}r\.headers\.set\("Cache-Control", "private, no-store"\)/.test(proxy))
  check("  an offer is a session cookie the page's card reads", /r\.cookies\.set\("sl_suggest", suggest\.toLowerCase\(\), \{ path: "\/", sameSite: "lax", secure: true \}\)/.test(proxy))
  check("  both cookies listed in the cookie policy", STORED.some((s) => s.name === "sl_suggest") && STORED.some((s) => s.name === "sl_lang"))
  check("  a database without part 173 is read as before, with the setting off", /if \(error && \/visitor_language\/\.test\(error\.message \?\? ""\)\)/.test(proxy))
}

console.log("\nThe offer card, the setting, the creator page\n")
{
  check("the card: never in a frame, never after a choice, only a published language, not the page's own", /if\(w\.self!==w\.top\)return/.test(LANGUAGE_SUGGEST_JS) && /if\(ck\('sl_lang'\)\)return/.test(LANGUAGE_SUGGEST_JS) && /code\.toLowerCase\(\)===String\(C\.current\)\.toLowerCase\(\)\)return/.test(LANGUAGE_SUGGEST_JS))
  check("  not a modal: no backdrop, no focus taken, Escape and × close it, both answers remembered", !/backdrop|\.focus\(/.test(LANGUAGE_SUGGEST_JS) && /e\.key==='Escape'/.test(LANGUAGE_SUGGEST_JS) && /keep\(C\.current\)/.test(LANGUAGE_SUGGEST_JS) && /keep\(code\)/.test(LANGUAGE_SUGGEST_JS))
  check("  on a builder theme (from the language switch), an imported theme, the creator page", /<LanguageSuggest conf=\{\{ current: choice\.code/.test(read("components/website-builder/theme/language-switch.tsx")) && /languageSuggestTag\(\{ current: input\.i18n\.locale/.test(read("lib/store/compat-page-tags.ts")) && /<LanguageSuggest conf=\{\{ current: code, defaultLanguage, languages: languages\.map\(\(l\) => l\.code\), address: "query", suggest \}\} \/>/.test(read("components/storefront/creator-language.tsx")))
  check("  an imported theme's tag never closes its script early", !/<\/script>[\s\S]*<\/script>[\s\S]*<\/script>/.test(languageSuggestTag({ current: "en", defaultLanguage: "en", languages: ["en", "fr</script>"], address: "path" })))
  const ok = validateLocalization({ defaultLanguage: "en", languages: [{ code: "fr", published: true }], markets: [{ id: "a", name: "Home", primary: true }], visitorLanguage: true }, { baseCurrency: "USD" })
  check("the setting is saved with the rest, off unless turned on", ok.ok && ok.value.visitorLanguage === true && (validateLocalization({ defaultLanguage: "en", markets: [{ id: "a", name: "Home", primary: true }] }, { baseCurrency: "USD" }) as { value: { visitorLanguage: boolean } }).value.visitorLanguage === false)
  const server = read("lib/markets/server.ts")
  check("  until part 173 runs, everything else saves and the switch says what it needs", /visitorLanguageMissing\(error\)/.test(server) && /VISITOR_LANGUAGE_NEEDS_PART/.test(server))
  check("  the switch in Markets and languages", /label="Show visitors their own language"/.test(read("components/app/settings/markets-panel.tsx")))
  const page = read("app/(marketing)/u/[username]/page.tsx")
  check("the creator page: products in the visitor's language, its language row, never in the editor", /creatorPageLanguage\(creator\.id, typeof lang === "string" \? lang : null\)/.test(page) && /pageLanguage\.product\(/.test(page) && /<CreatorLanguage code=\{pageLanguage\.code\}/.test(page) && /embedded \? null : await creatorPageLanguage/.test(page))
  const cpl = read("lib/markets/creator-page-language.ts")
  check("  a crawler always gets the store's own language; the browser only with the setting on", /crawler \? null : find\(jar\.get\("sl_lang"\)/.test(cpl) && /!crawler && !jar\.get\("sl_lang"\)\?\.value && \(await visitorLanguageOn\(creatorId\)\)/.test(cpl))
  const sql = read("supabase/sql/run-now/173_visitor_language_and_ga_status.sql")
  check("SQL part 173: one statement a line, safe to run again, schema reloaded last", sql.trim().split("\n").length === 4 && /ADD COLUMN IF NOT EXISTS visitor_language boolean NOT NULL DEFAULT false/.test(sql) && /ADD COLUMN IF NOT EXISTS tracking_seen jsonb/.test(sql) && /notify pgrst, 'reload schema';$/.test(sql.trim()) && /p173_visitor_language_and_ga_status/.test(read("supabase/sql/run-now/99_check_after.sql")))
}

statusChecks().then(
  () => {
    console.log(`\n${passed} passed, ${failed} failed\n`)
    if (failed) process.exit(1)
  },
  (e) => {
    console.log("FAIL  the status checks threw", e)
    process.exit(1)
  },
)
