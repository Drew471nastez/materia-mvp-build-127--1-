/**
 * ===========================================================================
 *  SETTINGS, SECURITY AND PRIVACY: ALIGNED, AND EVERY SWITCH SAVES
 * ===========================================================================
 * The real Settings page (scripts/render-account-settings.tsx) at 390 and
 * 1280, against a server that answers like Storelib's API. It measures:
 *
 *   PRIVACY    three rows, three switches. Every switch is a 44px target,
 *              its track ends exactly on the card's content edge, the text
 *              never runs under it, and the three line up.
 *              Pressing one flips it at once (no wait for the network),
 *              sends one PATCH, and says "Saved". Three presses in a row
 *              send at most two requests and end on the last value. A
 *              failed save puts the switch back and says why.
 *   SECURITY   the two password fields side by side on a computer and
 *              stacked on a phone, every button 44px or taller, the two
 *              sign out buttons ending on the same edge.
 *   EMAIL      the change sheet asks for a code from each address.
 *
 *   node scripts/check-account-settings.mjs
 *   SHOTS=/some/dir node scripts/check-account-settings.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".account-settings-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}), updateUser: async () => ({ data: {}, error: null }), reauthenticate: async () => ({ error: null }), refreshSession: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-account-settings.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

/** What the server was asked, and whether the newsletter save should fail. */
let patches = []
let failNewsletter = false
const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    let raw = ""
    req.on("data", (c) => { raw += c })
    req.on("end", () => {
      let status = 200
      let body = {}
      if (req.url.startsWith("/api/account/preferences") && req.method === "PATCH") {
        const parsed = JSON.parse(raw || "{}")
        patches.push(parsed)
        if (failNewsletter && "newsletter" in parsed) {
          status = 500
          body = { error: "That did not save. Try again in a moment." }
        } else body = { ok: true, ...parsed }
      } else if (req.url.startsWith("/api/auth/change-email")) {
        body = { success: true, double: true, currentEmail: "maker@example.com", newEmail: "new@example.com" }
      } else if (req.url.startsWith("/api/domains")) body = { domains: [] }
      setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 250)
    })
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })

try {
  for (const [label, viewport] of [
    ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }],
  ]) {
    /* ── Privacy ───────────────────────────────────────────────────────── */
    {
      const page = await browser.newPage()
      await page.setViewport(viewport)
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e)))
      await page.goto(`${base}/app/settings?tab=privacy`)
      await page.waitForSelector("[data-account-panel=privacy]")
      await wait(500)
      console.log(`\nPrivacy, ${label}px`)
      const m = await page.evaluate(() => {
        const r = (el) => el.getBoundingClientRect()
        const card = document.querySelector("[data-account-panel=privacy] section")
        const cs = getComputedStyle(card)
        const contentRight = r(card).right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
        const rows = [...document.querySelectorAll("[data-privacy-row]")].map((row) => {
          const sw = row.querySelector("[role=switch]")
          const track = sw.firstElementChild
          const text = row.firstElementChild
          return {
            id: row.dataset.privacyRow,
            hitW: Math.round(r(sw).width), hitH: Math.round(r(sw).height),
            trackRight: Math.round(r(track).right * 10) / 10,
            textRight: Math.round(r(text).right), swLeft: Math.round(r(sw).left),
            centreGap: Math.abs((r(sw).top + r(sw).bottom) / 2 - (r(text).top + r(text).bottom) / 2),
          }
        })
        const s = document.querySelector(".app-content-scroll")
        return {
          rows, contentRight: Math.round(contentRight * 10) / 10,
          overflow: Math.max(0, s.scrollWidth - s.clientWidth, document.documentElement.scrollWidth - window.innerWidth),
          labels: [...document.querySelectorAll("[data-account-panel=privacy] [role=switch]")].map((b) => b.getAttribute("aria-label")),
        }
      })
      expect(m.rows.length === 3, "three rows, each one saved somewhere", m.labels.join(", "))
      expect(m.rows.every((x) => x.hitW >= 44 && x.hitH >= 44), "every switch is a 44px target", m.rows.map((x) => `${x.hitW}x${x.hitH}`).join(" "))
      const trackOff = Math.max(...m.rows.map((x) => Math.abs(x.trackRight - m.contentRight)))
      expect(trackOff <= 1, `every track ends on the card's content edge (off by ${trackOff}px)`, JSON.stringify(m.rows.map((x) => x.trackRight)))
      expect(m.rows.every((x) => x.textRight <= x.swLeft), "no text runs under a switch", m.rows.map((x) => `${x.textRight}/${x.swLeft}`).join(" "))
      expect(m.rows.every((x) => x.centreGap <= 1), "each switch is centred on its text", m.rows.map((x) => x.centreGap.toFixed(1)).join(" "))
      expect(m.overflow === 0, "nothing scrolls sideways", `${m.overflow}px`)
      if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `settings-privacy-${label}.png`), fullPage: false }) }

      // Press once: flips at once, one PATCH, "Saved".
      patches = []
      const flip = await page.evaluate(async () => {
        const sw = document.querySelector("[data-privacy-row=personalized] [role=switch]")
        const before = sw.getAttribute("aria-checked")
        const t0 = performance.now()
        sw.click()
        await new Promise((r) => requestAnimationFrame(() => r()))
        return { before, after: sw.getAttribute("aria-checked"), ms: Math.round(performance.now() - t0) }
      })
      await wait(500)
      const savedShown = await page.evaluate(() => /Saved/.test(document.querySelector("[data-privacy-row=personalized]").textContent))
      expect(flip.before === "true" && flip.after === "false", `the switch flips on the next frame (${flip.ms}ms), before the server answers`, JSON.stringify(flip))
      expect(patches.length === 1 && patches[0].personalizedRecommendations === false, "one PATCH with the new value", JSON.stringify(patches))
      expect(savedShown, "and it says Saved")

      // Three presses in a row.
      patches = []
      await page.evaluate(() => {
        const sw = document.querySelector("[data-privacy-row=personalized] [role=switch]")
        sw.click(); sw.click(); sw.click()
      })
      await wait(1200)
      const final = await page.evaluate(() => document.querySelector("[data-privacy-row=personalized] [role=switch]").getAttribute("aria-checked"))
      expect(patches.length <= 2 && patches.length >= 1, `three quick presses send ${patches.length} request(s), not three`, JSON.stringify(patches))
      expect(final === "true" && patches[patches.length - 1]?.personalizedRecommendations === true, "and the last value is the one saved", `${final} ${JSON.stringify(patches)}`)

      // A failed save goes back and says so.
      failNewsletter = true
      patches = []
      await page.evaluate(() => document.querySelector("[data-privacy-row=newsletter] [role=switch]").click())
      await wait(700)
      const failed = await page.evaluate(() => {
        const row = document.querySelector("[data-privacy-row=newsletter]")
        return { checked: row.querySelector("[role=switch]").getAttribute("aria-checked"), text: row.textContent }
      })
      failNewsletter = false
      expect(failed.checked === "true", "a failed save puts the switch back", failed.checked)
      expect(/did not save/i.test(failed.text), "and says it did not save", failed.text.slice(0, 120))

      // Analytics writes the consent cookie on this device.
      const consent = await page.evaluate(() => {
        const sw = document.querySelector("[data-privacy-row=analytics] [role=switch]")
        const before = sw.getAttribute("aria-checked")
        sw.click()
        const m = /storelib_consent=\d+\.p[01]\.a([01])\.m[01]\.\d+/.exec(document.cookie)
        return { before, cookieSays: m ? (m[1] === "1" ? "true" : "false") : null, cookie: document.cookie }
      })
      expect(consent.cookieSays !== null && consent.cookieSays !== consent.before, "analytics is the consent record on this device", JSON.stringify(consent))
      expect(errors.length === 0, "no page errors", errors.join(" | "))
      await page.close()
    }

    /* ── Security ──────────────────────────────────────────────────────── */
    {
      const page = await browser.newPage()
      await page.setViewport(viewport)
      await page.goto(`${base}/app/settings?tab=security`)
      await page.waitForSelector("[data-account-panel=security]")
      await wait(500)
      console.log(`\nSecurity, ${label}px`)
      const m = await page.evaluate(() => {
        const r = (el) => el.getBoundingClientRect()
        const a = r(document.querySelector("[data-password-field=new]"))
        const b = r(document.querySelector("[data-password-field=confirm]"))
        const buttons = [...document.querySelectorAll("[data-account-panel=security] button")].map((el) => ({ t: el.textContent.trim(), h: Math.round(r(el).height) }))
        const rows = [...document.querySelectorAll("[data-session-row]")].map((row) => Math.round(r(row.querySelector("button")).right))
        const s = document.querySelector(".app-content-scroll")
        return {
          a: { top: Math.round(a.top), left: Math.round(a.left), w: Math.round(a.width) },
          b: { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width) },
          buttons, rows,
          overflow: Math.max(0, s.scrollWidth - s.clientWidth, document.documentElement.scrollWidth - window.innerWidth),
          comingSoon: /Coming Soon/i.test(document.querySelector("[data-account-panel=security]").textContent),
        }
      })
      if (label === "1280") expect(m.a.top === m.b.top && m.a.w === m.b.w && m.a.left < m.b.left, "the two password fields side by side, equal", JSON.stringify([m.a, m.b]))
      else expect(m.b.top > m.a.top && m.a.left === m.b.left && m.a.w === m.b.w, "the two password fields stacked, equal", JSON.stringify([m.a, m.b]))
      const short = m.buttons.filter((x) => x.h < 44)
      expect(short.length === 0, `every button 44px or taller (${m.buttons.length} checked)`, JSON.stringify(short))
      expect(m.rows.length === 2 && Math.abs(m.rows[0] - m.rows[1]) <= 1, "both sign out buttons end on the same edge", JSON.stringify(m.rows))
      expect(!m.comingSoon, "no control that does nothing (the Coming Soon button is gone)")
      expect(m.overflow === 0, "nothing scrolls sideways", `${m.overflow}px`)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `settings-security-${label}.png`), fullPage: false })

      // A password that is too short is refused before it goes anywhere.
      await page.type("[data-password-field=new]", "short1")
      await page.type("[data-password-field=confirm]", "short1")
      await page.evaluate(() => document.querySelector("[data-password-submit]").click())
      await wait(150)
      const said = await page.evaluate(() => document.querySelector("[data-account-panel=security] [role=alert]")?.textContent ?? ("NONE " + document.querySelector("[data-password-field=new]").value + " / " + document.querySelector("[data-settings-card=password]").textContent))
      expect(/at least 8/.test(said), "a short password is refused in plain words", said)
      await page.close()
    }

    /* ── Email change ──────────────────────────────────────────────────── */
    {
      const page = await browser.newPage()
      await page.setViewport(viewport)
      await page.goto(`${base}/app/settings?tab=general`)
      await page.waitForSelector("[data-settings-panel]")
      await wait(400)
      console.log(`\nEmail change, ${label}px`)
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Change")
        b.click()
      })
      await page.waitForSelector("[data-email-change=input] input[type=email]")
      await wait(450)
      await page.type("[data-email-change=input] input[type=email]", "new@example.com")
      await page.evaluate(() => document.querySelector("[data-email-change=input] button[type=submit]").click())
      await page.waitForSelector("[data-email-change=verify]")
      await wait(200)
      const v = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll("[data-email-change=verify] input")].map((el) => {
          const b = el.getBoundingClientRect()
          return { w: Math.round(b.width), h: Math.round(b.height), left: Math.round(b.left) }
        })
        return { inputs, text: document.querySelector("[data-email-change=verify]").textContent }
      })
      expect(v.inputs.length === 2, "a code from the new address and one from the current address", JSON.stringify(v.inputs))
      expect(v.inputs.every((x) => x.h >= 44) && new Set(v.inputs.map((x) => `${x.w}/${x.left}`)).size === 1, "both fields 44px tall, one width, one edge", JSON.stringify(v.inputs))
      expect(/new@example\.com/.test(v.text) && /maker@example\.com/.test(v.text), "each field names its address")
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `settings-email-change-${label}.png`), fullPage: false })
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
if (SHOTS) console.log(`\n  screenshots in ${SHOTS}`)
console.log(broken === 0 ? "\nall account settings checks passed\n" : `\n${broken} account settings checks failed\n`)
process.exitCode = broken === 0 ? 0 : 1
