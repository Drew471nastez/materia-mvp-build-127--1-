/**
 * ===========================================================================
 *  GELATO AND CJ DROPSHIPPING CARDS AND MATCHING, ROUND 24: IN CHROMIUM
 * ===========================================================================
 * The real Settings › Integrations (scripts/render-integrations23.tsx), with
 * every /api answered here as the server would. At 1440x900 and at 390x844
 * (touch, CPU slowed 4x unless CPU_SLOWDOWN says otherwise):
 *
 *   both          no Coming soon on Gelato or CJ; the API key typed and
 *                 Connect; Connected with where orders come from, drafts or
 *                 unpaid orders, tracking; the key never shown again
 *   CJ            ships from and shipping method; Match products: search
 *                 CJ, open a product, Choose a variant, Matched; Keep stock
 *                 in step with CJ
 *   Gelato        shipment method from Gelato's list; the webhook address to
 *                 paste; Match products: product UID and print file
 *   layout        nothing wider than the screen at 390
 *
 *   node scripts/check-partners24.mjs     (SHOTS=/dir for screenshots)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || null
const SLOW = Number(process.env.CPU_SLOWDOWN || 4)
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".partners24-probe")
mkdirSync(dir, { recursive: true })
/* useSearchParams follows the address as Next's does: pushState, replaceState and Back all re-render. */
writeFileSync(join(dir, "navigation.js"), `import { useSyncExternalStore } from "react"
const sub = (cb) => { window.addEventListener("popstate", cb); window.addEventListener("__url", cb); return () => { window.removeEventListener("popstate", cb); window.removeEventListener("__url", cb) } }
export const usePathname = () => window.__path
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, () => location.search, () => ""))
const router = { push(h) { window.__nav.push.push(h) }, replace(h) { window.__nav.replace.push(h) }, prefetch() {}, refresh() {}, back() { window.__nav.back++ } }
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, rpc: async () => ({ data: false, error: null }), storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-integrations23.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__nav={back:0,push:[],replace:[]};window.__path="/app/settings"</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

/* ── the API, as the server answers it ─────────────────────────────── */
const state = {}
const keysSeen = []
const links = { gelato: {}, cj_dropshipping: {} }
const stockOn = {}
const VARIANTS = [
  { variantId: "v-m", productId: "p-tee", productTitle: "Cat Ear Hoody", variantName: "White / M", sku: "HOODY-M" },
  { variantId: "v-l", productId: "p-tee", productTitle: "Cat Ear Hoody", variantName: "White / L", sku: "CJNSSYWY01847-White-L" },
  { variantId: "v-print", productId: "p-print", productTitle: "Mountain poster", variantName: "50x70", sku: null },
]
function one(provider) {
  const base = { provider, status: "disconnected", url: null, keyHint: null, secretHint: null, lastSyncAt: null, lastError: null, account: null, verifiedAt: null, mode: null, autoConfirm: false, webhooks: null, webhookNote: null, location: null }
  return state[provider] ? { ...base, ...state[provider] } : base
}
function integrations() {
  return ["supplier_email", "custom_webhook", "printful", "printify", "gelato", "cj_dropshipping", "shipstation", "shippo", "easypost"].map(one)
}
function rows(provider) {
  return VARIANTS.map((v) => ({ ...v, atPartner: provider === "cj_dropshipping" ? v.productId === "p-tee" : true, link: links[provider][v.variantId] ? { ...links[provider][v.variantId], stockSync: !!stockOn[v.productId], stockLevel: stockOn[v.productId] ? 120 : null, stockSyncedAt: null, stockError: null } : null }))
}
function answer(method, url, body) {
  const path = url.split("?")[0]
  const q = new URL(url, "http://x").searchParams
  if (path === "/api/physical/integrations") return { integrations: integrations() }
  for (const p of ["gelato", "cj_dropshipping"]) {
    if (path === `/api/physical/integrations/${p}` && method === "PUT") {
      if (body.disconnect) delete state[p]
      else if (body.apiKey) {
        keysSeen.push(body.apiKey)
        state[p] = p === "gelato"
          ? { status: "connected", keyHint: body.apiKey.slice(-4), verifiedAt: new Date().toISOString(), lastSyncAt: new Date().toISOString(), webhooks: "off", webhookNote: "Gelato's webhooks are added in Gelato, under Developer › Webhooks: paste the address below and tick order status and tracking code updates. Until the first one arrives, Storelib checks Gelato for tracking every few hours.", location: { id: "loc-g", name: "Gelato" }, shipmentMethod: "normal", webhookAddress: "https://storelib.com/api/integrations/webhooks/gelato/11111111-1111-4111-8111-111111111111.Q2hlY2tlZEJ5U3RvcmVsaWJTZXJ2ZXI" }
          : { status: "connected", keyHint: body.apiKey.slice(-4), account: "CJ account 1234567", verifiedAt: new Date().toISOString(), lastSyncAt: new Date().toISOString(), webhooks: "on", webhookNote: "CJ sends order, tracking and stock updates to Storelib. CJ keeps one address for each, so an address set there before for these was replaced.", location: { id: "loc-c", name: "CJ Dropshipping" }, logistic: "cheapest", fromCountry: "CN" }
      } else if (state[p]) {
        if (typeof body.autoConfirm === "boolean") state[p].autoConfirm = body.autoConfirm
        if (body.shipmentMethod) state[p].shipmentMethod = body.shipmentMethod
        if (body.logistic) state[p].logistic = body.logistic
        if (body.fromCountry) state[p].fromCountry = body.fromCountry
      }
      return { integrations: integrations() }
    }
    if (path === `/api/physical/integrations/${p}/links`) {
      if (method === "PUT") {
        if (!body.providerVariantId) delete links[p][body.variantId]
        else links[p][body.variantId] = p === "gelato" ? { providerVariantId: body.providerVariantId, label: body.providerVariantId, providerSku: null, fileUrl: body.fileUrl } : { providerVariantId: body.providerVariantId, label: body.providerVariantId === "1424608152007086080" ? "Hoody White M" : "Hoody White L", providerSku: body.providerVariantId === "1424608152007086080" ? "CJNSSYWY01847-White-M" : "CJNSSYWY01847-White-L", fileUrl: null }
      }
      if (method === "POST" && typeof body.stockSync === "boolean") stockOn[body.productId] = body.stockSync
      return { rows: rows(p), locationId: p === "gelato" ? "loc-g" : "loc-c", synced: 1 }
    }
  }
  if (path === "/api/physical/integrations/cj_dropshipping/search") {
    if (q.get("pid")) return { products: [], variants: [{ vid: "1424608152007086080", pid: q.get("pid"), sku: "CJNSSYWY01847-White-M", name: "Hoody White M", image: null, price: "11.85" }, { vid: "1424608152007086081", pid: q.get("pid"), sku: "CJNSSYWY01847-White-L", name: "Hoody White L", image: null, price: "11.85" }] }
    return { variants: [], products: [{ pid: "04A22450-67F0-4617-A132-E7AE7F8963B0", sku: "CJNSSYWY01847", name: "Personalized Cat Ear Hoody Coat", image: null, price: "11.85" }] }
  }
  if (path === "/api/physical/integrations/gelato/shipment-methods") return { methods: [{ uid: "normal", name: "Standard", hasTracking: true }, { uid: "ups_ground", name: "UPS Ground", hasTracking: true }, { uid: "dhl_parcel", name: "DHL Parcel", hasTracking: true }] }
  if (path === "/api/store/integrations") return { tracking: {}, ready: true }
  if (path === "/api/store/integrations/catalog") return { overrides: [] }
  if (path === "/api/store/reviews-app") return { settings: { enabled: false } }
  if (path === "/api/store/settings") return { settings: { storeName: "Mara's", checkout: {}, ready: true }, suggested: {} }
  if (path === "/api/physical/settings") return { settings: {}, locations: [], zones: [], packages: [], ready: true }
  if (path === "/api/billing/overview") return { plans: [], subscription: null, currentPlan: null, invoices: [] }
  if (path === "/api/domains") return { domains: [] }
  if (path === "/api/notifications/preferences") return { categories: [] }
  return {}
}
const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      let body = {}
      try { body = raw ? JSON.parse(raw) : {} } catch { /* none */ }
      const out = answer(req.method, req.url, body)
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, 120)
    })
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"], headless: true })
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const SETUP = () => {
  for (const k of ["pushState", "replaceState"]) {
    const orig = history[k].bind(history)
    history[k] = (...a) => { const r = orig(...a); window.dispatchEvent(new Event("__url")); return r }
  }
}
async function until(page, fn, ms, arg) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true
    await wait(100)
  }
  return false
}
const click = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true }, sel)
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel)
const wide = (page) => page.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll("[data-integration] *")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && getComputedStyle(el).position !== "fixed" && !el.closest("code") }).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)} ${Math.round(el.getBoundingClientRect().right)}`).slice(0, 5)
})
async function shot(page, name, sel) {
  if (!SHOTS) return
  if (sel) await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "start" }), sel)
  await wait(250)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

for (const [label, width, height, touch] of [["1440", 1440, 900, false], ["390", 390, 844, true]]) {
  console.log(`\n${label}x${height}${touch ? ", touch, CPU " + SLOW + "x" : ""}`)
  for (const k of Object.keys(state)) delete state[k]
  links.gelato = {}
  links.cj_dropshipping = {}
  for (const k of Object.keys(stockOn)) delete stockOn[k]
  const page = await browser.newPage()
  await page.setViewport({ width, height, isMobile: touch, hasTouch: touch })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.evaluateOnNewDocument(SETUP)

  /* ── CJ Dropshipping ── */
  await page.goto(`${base}/app/settings?tab=integrations&integration=cj-dropshipping`, { waitUntil: "domcontentloaded", timeout: 120000 })
  say(await until(page, () => !!document.querySelector('[data-integration="cj_dropshipping"]'), 120000), "CJ Dropshipping's page opens with its card")
  await wait(700)
  if (touch && SLOW > 1) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: SLOW })
  const standing = await text(page, "[data-integration-standing]")
  const cardText = await text(page, '[data-integration="cj_dropshipping"]')
  say(!/Coming soon/.test(standing + cardText), `no Coming soon on CJ ("${standing.trim()}")`)
  await shot(page, `p24-cj-start-${label}`, '[data-integration="cj_dropshipping"]')
  const key = await page.$('[data-integration="cj_dropshipping"] [data-integration-key]')
  if (!key) await click(page, '[data-integration="cj_dropshipping"] [data-integration-connect]')
  await until(page, () => !!document.querySelector('[data-integration="cj_dropshipping"] [data-integration-key]'), 5000)
  say(/CJ API key/.test(await text(page, '[data-integration="cj_dropshipping"]')), "it asks for the CJ API key, and says where to find it")
  await page.type('[data-integration="cj_dropshipping"] [data-integration-key]', "CJ1234567@api@0f9e8d7c6b5a49382716abcdef012345")
  await click(page, '[data-integration="cj_dropshipping"] [data-integration-save]')
  say(await until(page, () => !!document.querySelector('[data-integration="cj_dropshipping"] [data-integration-facts]'), 10000), "Connect: connected")
  const cjFacts = await text(page, '[data-integration="cj_dropshipping"] [data-integration-facts]')
  say(/Products at the CJ Dropshipping location/.test(cjFacts) && /Unpaid, to pay in CJ/.test(cjFacts) && /tells Storelib as each parcel ships/.test(cjFacts), "facts: where orders come from, unpaid to pay in CJ, tracking by webhook")
  say(!(await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value).join("|"))).includes("CJ1234567@api@"), "the key is not shown again")
  say(!!(await page.$("[data-cj-from]")) && !!(await page.$("[data-cj-logistic]")), "ships from and shipping method are there")
  await shot(page, `p24-cj-connected-${label}`, '[data-integration="cj_dropshipping"]')
  await click(page, '[data-match-products="cj_dropshipping"] [data-match-products-open]')
  say(await until(page, () => document.querySelectorAll("[data-partner-link-row]").length === 2, 8000), "Match products lists the variants sold from the CJ location")
  say(/0 of 2 matched/.test(await text(page, "[data-partner-links]")), "  those sold from CJ first: 0 of 2 matched")
  await click(page, '[data-partner-link-row="v-m"] [data-partner-link-edit]')
  await until(page, () => !!document.querySelector("[data-cj-search]"), 4000)
  await page.evaluate(() => { const i = document.querySelector("[data-cj-search]"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })) })
  await page.type("[data-cj-search]", "cat ear hoody")
  await page.evaluate(() => document.querySelector("[data-cj-match] form").requestSubmit())
  say(await until(page, () => !!document.querySelector("[data-cj-product]"), 6000), "Search CJ by words shows CJ's products")
  await click(page, "[data-cj-product]")
  say(await until(page, () => document.querySelectorAll("[data-cj-variant]").length === 2, 6000), "opening a product shows its variants")
  await shot(page, `p24-cj-search-${label}`, "[data-cj-match]")
  await click(page, '[data-cj-variant="1424608152007086080"] button')
  say(await until(page, () => /Matched/.test(document.querySelector('[data-partner-link-row="v-m"]')?.textContent ?? "") && /Hoody White M/.test(document.querySelector('[data-partner-link-row="v-m"]')?.textContent ?? ""), 6000), "Choose: the row says Matched, with CJ's variant")
  say(/1 of 2 matched/.test(await text(page, "[data-partner-links]")), "  1 of 2 matched")
  say(await until(page, () => !!document.querySelector("#cj-stock-p-tee"), 3000), "Keep stock in step with CJ appears on the matched product")
  await click(page, "#cj-stock-p-tee")
  say(await until(page, () => /120 in stock at CJ/.test(document.querySelector('[data-partner-link-row="v-m"]')?.textContent ?? ""), 6000), "turned on: the row shows CJ's stock")
  await shot(page, `p24-cj-matched-${label}`, "[data-partner-links]")
  if (process.env.DEBUG) console.log(await page.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll("[data-integration] *")].filter((el) => el.getBoundingClientRect().right > w + 1 && ![...el.children].some((c) => c.getBoundingClientRect().right > w + 1)).map((el) => `${el.tagName}.${String(el.className).slice(0, 60)} w${Math.round(el.getBoundingClientRect().width)} r${Math.round(el.getBoundingClientRect().right)}`).slice(0, 12).join("\n") }))
  const w1 = await wide(page)
  say(w1.length === 0, `nothing wider than the screen${w1.length ? `: ${w1.join(", ")}` : ""}`)

  /* ── Gelato ── */
  await page.evaluate(() => { history.pushState(null, "", "/app/settings?tab=integrations&integration=gelato") })
  say(await until(page, () => !!document.querySelector('[data-integration="gelato"]'), 10000), "Gelato's page opens with its card")
  await wait(500)
  say(!/Coming soon/.test((await text(page, "[data-integration-standing]")) + (await text(page, '[data-integration="gelato"]'))), "no Coming soon on Gelato")
  if (!(await page.$('[data-integration="gelato"] [data-integration-key]'))) await click(page, '[data-integration="gelato"] [data-integration-connect]')
  await until(page, () => !!document.querySelector('[data-integration="gelato"] [data-integration-key]'), 5000)
  say(/Gelato API key/.test(await text(page, '[data-integration="gelato"]')), "it asks for the Gelato API key")
  await page.type('[data-integration="gelato"] [data-integration-key]', "gelato-key-abcdef-0001")
  await click(page, '[data-integration="gelato"] [data-integration-save]')
  say(await until(page, () => !!document.querySelector('[data-integration="gelato"] [data-integration-facts]'), 10000), "Connect: connected")
  const gFacts = await text(page, '[data-integration="gelato"] [data-integration-facts]')
  say(/Drafts to approve in Gelato/.test(gFacts) && /Checked with Gelato every few hours/.test(gFacts), "facts: drafts in Gelato, tracking on a timer until its webhook")
  say(/storelib\.com\/api\/integrations\/webhooks\/gelato\//.test(await text(page, "[data-gelato-webhook-address]")), "the address to paste in Gelato › Developer › Webhooks, with Copy")
  say(await until(page, () => [...document.querySelectorAll("[data-gelato-method] option")].some((o) => o.value === "ups_ground"), 6000), "shipment methods from Gelato's list")
  await shot(page, `p24-gelato-connected-${label}`, '[data-integration="gelato"]')
  await click(page, '[data-match-products="gelato"] [data-match-products-open]')
  await until(page, () => document.querySelectorAll('[data-partner-links="gelato"] [data-partner-link-row]').length === 3, 8000)
  await click(page, '[data-partner-links="gelato"] [data-partner-link-row="v-print"] [data-partner-link-edit]')
  say(await until(page, () => !!document.querySelector("[data-gelato-uid]") && !!document.querySelector("[data-gelato-file]"), 4000), "Match: product UID and print file")
  await page.type("[data-gelato-uid]", "flat_product_pf_500x700-mm_pt_200-gsm-uncoated_cl_4-0_ver")
  await page.type("[data-gelato-file]", "https://files.example.com/mountain.pdf")
  await shot(page, `p24-gelato-match-${label}`, "[data-gelato-match]")
  await page.evaluate(() => document.querySelector("[data-gelato-match]").requestSubmit())
  say(await until(page, () => /Matched/.test(document.querySelector('[data-partner-links="gelato"] [data-partner-link-row="v-print"]')?.textContent ?? ""), 6000), "Save match: Matched")
  const w2 = await wide(page)
  say(w2.length === 0, `nothing wider than the screen${w2.length ? `: ${w2.join(", ")}` : ""}`)
  await shot(page, `p24-gelato-matched-${label}`, '[data-partner-links="gelato"]')

  say(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ").slice(0, 300)}` : ""}`)
  await page.close()
}

await browser.close()
server.close()
console.log(bad ? `\n${bad} failed` : "\nall passed")
process.exit(bad ? 1 : 0)
