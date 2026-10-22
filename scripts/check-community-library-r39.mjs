/**
 * ===========================================================================
 *  THE COMMUNITY LIBRARY, ROUND 39, MEASURED
 * ===========================================================================
 * The real admin section and the member's screens (scripts/render-community-
 * library-r39.tsx), served at a storelib.com address with the API answered
 * here, at 1440x900 and on a 390x844 phone, in the light look and the dark
 * one (html[data-sl-dark] with app/theme-dark.css, as a member who chose dark
 * sees a community; /app itself never sets it, so the admin's dark shots are
 * only a look at the classes):
 *
 *   LAYOUT     nothing scrolls sideways; on a phone every button, link and
 *              field in the page is at least 40px tall
 *   SHELF      three cards to a row at 1440 and one at 390; the pills are All,
 *              each section and Yours; a section shows only its items, Yours
 *              only what is theirs; an item for sale has its price on a button
 *              of its own, outside the card's link
 *   ITEM       a sold item offers Buy for its price and no file can be
 *              downloaded; an open one has Download and Open through the
 *              Library's own routes, and no link's address in the page; a
 *              level item offers See your points
 *   ADMIN      the table from 768px with a grip per row, the list on a phone;
 *              Add asks what it is and lists only products not in it yet; the
 *              Library off says so with Turn on
 *   EDITOR     the five ways to open it in order, Buy picked with its price;
 *              the files with Add files and Add a link; the save bar only
 *              after a change
 *   COLOUR     no violet fill on a member's screen; in the dark look the
 *              cards are not white
 *
 *   node scripts/check-community-library-r39.mjs        (PROBE_CSS=source in a worktree; SHOTS_DIR to keep the shots)
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const faces = interFaces(root)
const work = mkdtempSync(join(tmpdir(), "storelib-library-r39-"))
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(work, "navigation.js"), `export const usePathname = () => "/app/community/makers/library"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
writeFileSync(join(work, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest }) }
`)
writeFileSync(join(work, "stripe-react.jsx"), `export function EmbeddedCheckoutProvider({ children }) { return children }\nexport function EmbeddedCheckout() { return null }\n`)
writeFileSync(join(work, "stripe-pure.js"), `export const loadStripe = () => Promise.resolve({})\n`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-library-r39.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    "next/navigation": join(work, "navigation.js"),
    "next/link": join(work, "link.jsx"),
    "next/image": join(work, "image.jsx"),
    "@stripe/react-stripe-js": join(work, "stripe-react.jsx"),
    "@stripe/stripe-js/pure": join(work, "stripe-pure.js"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_test_probe'}};" },
  loader: { ".css": "empty" },
  outfile: join(work, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(work, "app.js"), "utf8")
const html = (isDark) => `<!doctype html><html class="light"${isDark ? " data-sl-dark" : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const json = (r, body, status = 200) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) })

async function open(vp, which, isDark) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("https://storelib.com/__r39")) return r.respond({ status: 200, contentType: "text/html", body: html(isDark) })
    if (u.includes("/learn/members")) return json(r, { rows: [] })
    if (u.includes("/api/")) return json(r, { ok: true })
    if (u.startsWith("data:")) return r.continue()
    return r.abort()
  })
  await p.goto(`https://storelib.com/__r39?${which}`, { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[data-probe-case]")
  await sleep(350)
  return { p, errors }
}

async function common(p, label, phone) {
  const m = await p.evaluate(() => {
    const over = document.documentElement.scrollWidth - innerWidth
    const small = []
    for (const el of document.querySelectorAll("main a, main button, main input, main select")) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest("[hidden]") || el.closest("[aria-hidden=true]")) continue
      if (el.type === "file" || el.getAttribute("role") === "switch" || el.closest("[data-rich-text-toolbar], .ProseMirror, [role=toolbar]")) continue
      /* The card's stretched link is the card's whole height; its text line is not the target. */
      if (el.closest("[data-library-card]") && el.tagName === "A") continue
      if (r.height < 40) small.push(`${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return { over, small }
  })
  expect(m.over <= 0, `${label}: nothing scrolls sideways`, m.over)
  if (phone) expect(m.small.length === 0, `${label}: every button, link and field is at least 40px tall`, m.small)
}

const VIEWPORTS = [
  ["1440", { width: 1440, height: 900 }, false],
  ["390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
]
const MEMBER = ["shelf", "open", "paid", "level", "empty"]
const ADMIN = ["admin", "admin-off", "admin-empty", "editor", "editor-product"]

for (const [vpName, vp, phone] of VIEWPORTS) {
  for (const tone of ["light", "dark"]) {
    const isDark = tone === "dark"
    console.log(`\n${vpName} ${tone}`)
    for (const which of [...MEMBER, ...ADMIN]) {
      const label = `${vpName} ${tone} ${which}`
      const { p, errors } = await open(vp, which, isDark)
      await common(p, label, phone)
      expect(errors.length === 0, `${label}: no errors on the page`, errors)

      if (MEMBER.includes(which)) {
        const colour = await p.evaluate(() => {
          let violet = 0
          let whiteCards = 0
          for (const el of document.querySelectorAll("main *")) {
            const bg = getComputedStyle(el).backgroundColor
            if (/rgb\(139, 92, 246\)/.test(bg)) violet++
            if ((el.matches("[data-library-card], article") || el.hasAttribute("data-library-files")) && /rgb\(255, 255, 255\)/.test(bg)) whiteCards++
          }
          return { violet, whiteCards }
        })
        expect(colour.violet === 0, `${label}: no violet fill on a member's screen`, colour.violet)
        if (isDark) expect(colour.whiteCards === 0, `${label}: in the dark look no card is white`, colour.whiteCards)
      }

      if (which === "shelf") {
        const s = await p.evaluate(() => {
          const grid = document.querySelector("[data-library-grid]")
          const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0
          const pills = [...document.querySelectorAll("[data-library-filter]")].map((b) => b.textContent.trim())
          const buy = document.querySelector(`[data-library-card] [data-buy-item]`)
          return { cols, pills, buyText: buy?.textContent.trim() ?? null, buyInLink: !!buy?.closest("a"), cards: document.querySelectorAll("[data-library-card]").length }
        })
        expect(s.cols === (phone ? 1 : 3), `${label}: ${phone ? "one card" : "three cards"} to a row`, s.cols)
        expect(JSON.stringify(s.pills) === JSON.stringify(["All", "Templates", "Recordings", "Guides", "Yours"]), `${label}: the pills are All, each section and Yours`, s.pills)
        expect(s.buyText === "Buy for $29" && !s.buyInLink, `${label}: the price is a button of its own, outside the card's link`, s)
        await p.click('[data-library-filter]:nth-child(2)')
        await sleep(120)
        const templates = await p.evaluate(() => [...document.querySelectorAll("[data-library-card] h2")].map((h) => h.textContent.trim()))
        expect(templates.length === 2 && templates.every((t) => /Pricing kit|Gold member/.test(t)), `${label}: a section shows only its items`, templates)
        await p.click('[data-library-filter="yours"]')
        await sleep(120)
        const yours = await p.evaluate(() => [...document.querySelectorAll("[data-library-card]")].map((c) => c.getAttribute("data-state")))
        expect(yours.length === 3 && yours.every((st) => st === "open"), `${label}: Yours shows only what opens for them`, yours)
        await p.click('[data-library-filter="all"]')
        await sleep(120)
      }
      if (which === "paid") {
        const s = await p.evaluate(() => ({ buy: document.querySelector("[data-buy-item]")?.textContent.trim() ?? null, downloads: document.querySelectorAll("[data-library-download]").length, files: document.querySelectorAll("[data-library-file]").length }))
        expect(s.buy === "Buy for $29" && s.downloads === 0 && s.files === 3, `${label}: Buy for its price, the files listed and none downloadable`, s)
      }
      if (which === "open") {
        const s = await p.evaluate(() => ({
          download: document.querySelector("[data-library-download]")?.getAttribute("href") ?? "",
          link: document.querySelector("[data-library-open-link]")?.getAttribute("href") ?? "",
          owned: !!document.querySelector("[data-library-owned]"),
        }))
        expect(/^\/api\/community\/[^/]+\/library\/[^/]+\/files\//.test(s.download) && /^\/api\/community\/[^/]+\/library\/[^/]+\/links\/0$/.test(s.link) && s.owned, `${label}: Download and Open go through the Library's routes; bought, it points to their Storelib library`, s)
      }
      if (which === "level") {
        const s = await p.evaluate(() => ({ action: document.querySelector('[data-open-action="level"]')?.textContent.trim() ?? null, links: document.querySelectorAll("[data-library-open-link]").length }))
        expect(s.action === "See your points" && s.links === 0, `${label}: See your points, and no link to open`, s)
      }
      if (which === "admin") {
        const s = await p.evaluate(() => {
          const table = document.querySelector("[data-library-table]")
          const list = document.querySelector("[data-library-phone-list]")
          return { table: table ? getComputedStyle(table).display : "none", list: list ? getComputedStyle(list).display : "none", rows: document.querySelectorAll("[data-library-row]").length, grips: document.querySelectorAll("[data-library-grip]").length }
        })
        expect(phone ? s.table === "none" && s.list !== "none" : s.table === "table" && s.list === "none", `${label}: ${phone ? "the list on a phone" : "the table on a computer"}`, s)
        expect(s.rows === 10 && s.grips === 10, `${label}: every item a row with a grip, in both layouts`, s)
        await p.click("[data-library-add]")
        await sleep(400)
        const kinds = await p.evaluate(() => [...document.querySelectorAll("[data-library-add-kind]")].map((b) => b.getAttribute("data-library-add-kind")))
        expect(JSON.stringify(kinds) === JSON.stringify(["resource", "product"]), `${label}: Add asks what it is`, kinds)
        await p.screenshot({ path: join(shots, `${label.replace(/ /g, "-")}-add.png`) })
        await p.click('[data-library-add-kind="product"]')
        await sleep(250)
        const products = await p.evaluate(() => [...document.querySelectorAll("[data-library-product-choice]")].map((b) => b.textContent.trim()))
        expect(products.length === 1 && /Throwing drills/.test(products[0]), `${label}: only products not in the Library yet`, products)
        await p.screenshot({ path: join(shots, `${label.replace(/ /g, "-")}-add-product.png`) })
        await p.keyboard.press("Escape")
        await sleep(300)
      }
      if (which === "admin-off") {
        const s = await p.evaluate(() => ({ off: !!document.querySelector("[data-library-off]"), on: document.querySelector("[data-library-turn-on]")?.textContent.trim() ?? null }))
        expect(s.off && s.on === "Turn on", `${label}: off, said first, with Turn on`, s)
      }
      if (which === "editor") {
        const s = await p.evaluate(() => ({
          cards: [...document.querySelectorAll("[data-access-card]")].map((c) => c.getAttribute("data-access-card")),
          on: document.querySelector("[data-access-card][data-on]")?.getAttribute("data-access-card") ?? null,
          price: document.querySelector("#library-price")?.value ?? null,
          files: document.querySelectorAll("[data-library-edit-file]").length,
          addFiles: !!document.querySelector("[data-library-add-files]"),
          addLink: !!document.querySelector("[data-library-add-link]"),
          bar: !!document.querySelector("[data-editor-foot], [data-save-bar]"),
        }))
        expect(JSON.stringify(s.cards) === JSON.stringify(["free", "tier", "level", "paid", "private"]) && s.on === "paid" && s.price === "15", `${label}: the five ways to open it, Buy picked at its price`, s)
        expect(s.files === 1 && s.addFiles && s.addLink, `${label}: its file, Add files and Add a link`, s)
        await p.click('[data-access-card="tier"] button[role=radio]')
        await sleep(200)
        await p.screenshot({ path: join(shots, `${label.replace(/ /g, "-")}-tier.png`), fullPage: true })
        await p.click('[data-access-card="paid"] button[role=radio]')
        await sleep(150)
      }
      await p.screenshot({ path: join(shots, `${label.replace(/ /g, "-")}.png`), fullPage: true })
      await p.close()
    }
  }
}

await browser.close()
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall held")
process.exit(broken ? 1 : 0)
