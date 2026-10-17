/**
 * ===========================================================================
 *  THE MODERATION COUNT, MEASURED
 * ===========================================================================
 * The owner: "The Moderation count displayed in community navigation must
 * update dynamically and represent actionable pending items." This reads the
 * real shell and the real Moderation section in headless Chromium
 * (scripts/render-community-content-round32.tsx, the same fixture the round
 * 32 probe uses: five open reports, head.openReports 5), at 1280 and 390,
 * and measures:
 *
 *   SAME        the number beside Moderation in the row of tabs and the
 *               number on the Reports tab are one number, before anything
 *               is pressed
 *   MOVES       Dismiss sends PATCH and both numbers become what the server
 *               counted (4), with nothing refreshed
 *   BY HOW MANY removing a post three people reported moves both numbers by
 *               three (the server answers 2), which the old arithmetic in
 *               the browser could not do
 *   HANDLED     a report handled in another tab is counted out: the next
 *               queue read carries the count and the badge follows it
 *   GONE        at zero the badge is not there at all, rather than a 0
 *   PHONE       at 390 nothing scrolls sideways and every button in a report
 *               is at least 40px tall
 *   LOOK        /app is light at every width by the owner's own round 27
 *               decision (lib/appearance/site-appearance THEMED_PREFIXES has
 *               no /app), so the dark attribute on <html> must change
 *               nothing here: the same pixels, measured.
 *
 * Pictures go to SHOTS_DIR (.r34-moderation-shots by default); look at them,
 * then delete the folder.
 *
 *   node scripts/check-moderation-r34.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const stubs = join(root, ".r34-moderation-probe")
const shots = process.env.SHOTS_DIR || join(root, ".r34-moderation-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => window.__path || location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "${uid(1)}" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-content-round32.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.r34-moderation-probe/navigation.js", "next/link": "./.r34-moderation-probe/link.jsx", "next/image": "./.r34-moderation-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const page = (dark) =>
    `<!doctype html><html${dark ? " data-sl-dark" : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const VIEWS = { 1280: { width: 1280, height: 900, deviceScaleFactor: 1 }, 390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }

  /**
   * The stub. `open` is the number the real route counts in the database
   * after the write (openReportCount), so this is what the browser is handed
   * rather than what it could work out: 5 open reports, one dismissed leaves
   * 4, and removing the post that three of them are about leaves 2.
   */
  async function open_(vp, { dark = false, openAfter = {} } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.evaluateOnNewDocument("window.__sent = [];")
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        const method = r.method()
        const path = short.split("?")[0]
        let sent = null
        try {
          sent = r.postData() ? JSON.parse(r.postData()) : null
        } catch {
          sent = r.postData()
        }
        p.evaluate((x) => window.__sent.push(x), { short, method, sent }).catch(() => {})
        const base = `/api/app/community/${ID}`
        let body = { ok: true }
        if (path === `${base}/moderation` && method === "GET") body = { rows: [], next: null, open: openAfter.get ?? 0 }
        else if (path === `${base}/moderation` && method === "PATCH") body = { ok: true, open: openAfter.patch ?? 4 }
        else if (path === `${base}/moderation` && method === "POST") body = { status: "removed", open: openAfter.post ?? 2 }
        else if (path === `${base}/audit`) body = { rows: [], next: null }
        else if (path.includes("/members")) body = { rows: [], next: null, capped: false }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: page(dark) })
      if (url.startsWith("data:") || url.startsWith("blob:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/app/community/${ID}?case=moderation`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(700)
    return { p, errors }
  }

  /** The two numbers: the one in the row of tabs, and the one on the Reports tab. */
  const counts = (p) =>
    p.evaluate(() => {
      const nav = document.querySelector('[data-section-tabs] [data-tab="moderation"]')
      const navText = nav ? nav.textContent.replace(/[^\d]/g, "") : ""
      const tab = document.querySelector("[data-filter='reports']")
      const tabText = tab ? tab.textContent.replace(/[^\d]/g, "") : ""
      return { nav: navText === "" ? null : Number(navText), tab: tabText === "" ? null : Number(tabText), navLabel: nav ? nav.textContent.trim() : null }
    })
  const writes = (p) => p.evaluate(() => window.__sent.filter((x) => x.method !== "GET"))

  console.log("\nSAME: one number, in both places")
  {
    const { p, errors } = await open_(VIEWS[1280])
    const before = await counts(p)
    expect(before.nav === 5 && before.tab === 5, "1280: the row of tabs and the Reports tab both say 5", before)

    /* Dismiss: the server answers 4, and both follow it. */
    await p.click("[data-report]:nth-child(1) [data-report-dismiss]")
    await sleep(600)
    const w = await writes(p)
    const after = await counts(p)
    expect(w.some((x) => x.method === "PATCH" && x.sent?.status === "dismissed"), "Dismiss sends dismissed", w.slice(-1))
    expect(after.nav === 4 && after.tab === 4, "MOVES: both numbers are the 4 the server counted", { before, after })
    /* No poll: the queue is read when it is opened and when something is handled, never on a timer. */
    const readsBefore = await p.evaluate(() => window.__sent.filter((x) => x.method === "GET" && x.short.includes("/moderation")).length)
    await sleep(3000)
    const readsAfter = await p.evaluate(() => window.__sent.filter((x) => x.method === "GET" && x.short.includes("/moderation")).length)
    expect(readsAfter === readsBefore, "and three idle seconds ask the server nothing: no poll behind the number", { readsBefore, readsAfter })
    await p.screenshot({ path: join(shots, "moderation-1280-light.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  console.log("\nBY HOW MANY: a removal that closes three reports")
  {
    const { p } = await open_(VIEWS[1280], { openAfter: { post: 2, get: 2 } })
    await p.click("[data-report] [data-report-remove]")
    await sleep(400)
    const pressed = await p.evaluate(() => {
      const b = [...document.querySelectorAll("[role=dialog] button")].find((x) => /^Remove/.test(x.textContent.trim()))
      if (b) b.click()
      return !!b
    })
    await sleep(800)
    const after = await counts(p)
    expect(pressed, "the removal asks first")
    expect(after.nav === 2 && after.tab === 2, "both numbers fall by three, because the server counted 2", after)
    await p.close()
  }

  console.log("\nHANDLED ELSEWHERE, and zero")
  {
    const { p } = await open_(VIEWS[1280], { openAfter: { get: 0 } })
    /* Another moderator cleared the queue: the next read of it carries the count, and the badge follows. */
    await p.evaluate(() => {
      const b = [...document.querySelectorAll("[data-filter]")].find((x) => /Resolved/.test(x.textContent))
      if (b) b.click()
    })
    await sleep(700)
    await p.evaluate(() => {
      const b = [...document.querySelectorAll("[data-filter]")].find((x) => /Reports/.test(x.textContent))
      if (b) b.click()
    })
    await sleep(700)
    const after = await counts(p)
    expect(after.tab === null || after.tab === 0 ? after.nav === null : false, "GONE: at zero the badge is not drawn at all, and never a 0", after)
    await p.close()
  }

  console.log("\nPHONE: 390")
  {
    const { p, errors } = await open_(VIEWS[390])
    const phone = await p.evaluate(() => {
      const doc = document.scrollingElement
      const pane = document.querySelector(".orders-pane")
      const row = document.querySelector("[data-report]")
      /* Only the buttons a finger can reach: the desktop row menu is in a hidden span at this width. */
      const buttons = [...(row?.querySelectorAll("[data-report-actions] button") ?? [])]
        .filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => Math.round(b.getBoundingClientRect().height))
      /* Past the screen and not inside a row that scrolls sideways on purpose (the view tabs, the queue's filters). */
      const inScroller = (el) => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const x = getComputedStyle(n).overflowX
          if (x === "auto" || x === "scroll") return true
        }
        return false
      }
      const wide = [...document.querySelectorAll("[data-moderation] *")]
        .filter((el) => el.getBoundingClientRect().right > 391 && el.getBoundingClientRect().width > 0 && !inScroller(el))
        .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}@${Math.round(el.getBoundingClientRect().right)}`)
      return { docScroll: doc.scrollWidth - doc.clientWidth, paneScroll: pane ? pane.scrollWidth - pane.clientWidth : -1, buttons, wide }
    })
    expect(phone.docScroll <= 0 && phone.paneScroll <= 0, "nothing scrolls sideways", phone)
    expect(phone.buttons.length > 0 && phone.buttons.every((h) => h >= 40), "every button in a report is at least 40px tall", phone.buttons)
    expect(phone.wide.length === 0, "nothing in the card reaches past the screen", phone.wide)
    const before = await counts(p)
    await p.click("[data-report]:nth-child(1) [data-report-dismiss]")
    await sleep(600)
    const after = await counts(p)
    expect(before.nav === 5 && after.nav === 4 && after.tab === 4, "the count moves on a phone too", { before, after })
    await p.screenshot({ path: join(shots, "moderation-390-light.png"), fullPage: false })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  console.log("\nLOOK: /app is light, deliberately")
  {
    const themed = readFileSync(join(root, "lib/appearance/site-appearance.ts"), "utf8")
    const prefixes = /THEMED_PREFIXES = \[([^\]]*)\]/.exec(themed)?.[1] ?? ""
    expect(!/\/app/.test(prefixes), "the person's dark choice does not reach /app (round 27)", prefixes.replace(/\s+/g, " ").trim())
    /*
      So on the real screen nothing below is reached. The pictures are taken
      anyway, at both widths, with the attribute forced on, because the dark
      stylesheet is generated from every colour class Storelib's sources use
      (scripts/gen-theme-dark.mjs) and this screen's classes are in it: if
      /app ever follows the person, the queue has to be readable, so the
      contrast is measured rather than assumed.
    */
    const read = async (dark, width) => {
      const { p } = await open_(VIEWS[width], { dark })
      const paint = await p.evaluate(() => {
        const lum = (c) => {
          const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((n) => {
            const v = Number(n) / 255
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const ratio = (a, b) => {
          const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
          return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
        }
        const pane = document.querySelector(".orders-pane")
        const words = document.querySelector("[data-report-preview]")
        const card = words?.closest("ul")?.parentElement
        const cardBg = card ? getComputedStyle(card).backgroundColor : null
        const nav = document.querySelector('[data-section-tabs] [data-tab="moderation"] span')
        return {
          pane: pane ? getComputedStyle(pane).backgroundColor : null,
          card: cardBg,
          words: words ? getComputedStyle(words).color : null,
          wordsOnCard: words && cardBg ? ratio(getComputedStyle(words).color, cardBg) : null,
          countOnGround: nav && pane ? ratio(getComputedStyle(nav).color, getComputedStyle(pane).backgroundColor) : null,
        }
      })
      await p.screenshot({ path: join(shots, `moderation-${width}-${dark ? "dark" : "light"}.png`) })
      await p.close()
      return paint
    }
    const light = await read(false, 1280)
    const dark = await read(true, 1280)
    const darkPhone = await read(true, 390)
    expect(light.pane === "rgb(248, 249, 250)", "light: the page's ground is #f8f9fa, as CLAUDE.md's table says", light.pane)
    expect(light.wordsOnCard >= 4.5, "light: a report's words on the card are 4.5:1 or better", light.wordsOnCard)
    expect(light.countOnGround >= 4.5, "light: the Moderation count is 4.5:1 or better", light.countOnGround)
    expect(dark.pane !== light.pane && dark.card !== light.card, "with the attribute forced on, the generated dark stylesheet does reach this screen", { light: light.pane, dark: dark.pane })
    expect(dark.wordsOnCard >= 4.5, "dark: a report's words on the card are 4.5:1 or better", dark.wordsOnCard)
    expect(dark.countOnGround >= 4.5, "dark: the Moderation count is 4.5:1 or better", dark.countOnGround)
    expect(darkPhone.wordsOnCard >= 4.5, "dark at 390: the same", darkPhone.wordsOnCard)
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken === 0 ? "all measured ok" : `${broken} measurement(s) off`}   pictures in ${shots}`)
process.exit(broken === 0 ? 0 : 1)
