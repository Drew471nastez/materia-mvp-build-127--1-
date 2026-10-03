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
 *              stacked on a phone, every button 44px or taller there (40 on
 *              a computer), the two
 *              sign out buttons ending on the same edge.
 *   EMAIL      the change sheet asks for a code from each address.
 *   PROFILE    the username field before the name field.
 *   PHOTO      Remove saves through /api/account/avatar and the header's
 *              avatar (the shell's store, as the sidebar reads it) shows the
 *              initials at once, with no reload.
 *   TOOLTIP    the Support Email note is on the body, fully inside the
 *              screen, its whole sentence showing, at 390 (a tap) and 1280.
 *   PICKERS    Language and Time zone: the shared sheet at 390 (search at
 *              the top, 48px rows, no X), a popover under the field at 1280;
 *              search narrows them; a zone picked is saved to the account.
 *   TABS       no Stores tab, and ?tab=stores opens General.
 *   PUSH       "Notifications on this browser" with the browser's push
 *              stubbed: granted and saved, denied, no Push API, Safari on an
 *              iPhone, a server error, the push service refusing: each shows
 *              its own words.
 *
 *   node scripts/check-account-settings.mjs
 *   SHOTS=/some/dir node scripts/check-account-settings.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createECDH } from "node:crypto"
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
let avatarPosts = []
let zonePosts = []
let pushPosts = []
let pushServerFails = false
/* A real P-256 public key, base64url, as /api/push/web gives one. */
const PUSH_KEY = createECDH("prime256v1").generateKeys().toString("base64url")
/* A 2x2 opaque PNG, the profile's photo. */
const PHOTO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMAAAB0ABQHsA8QAAAAASUVORK5CYII=", "base64")
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
      else if (req.url.startsWith("/api/account/avatar")) {
        avatarPosts.push(JSON.parse(raw || "{}"))
        body = { ok: true, url: null }
      } else if (req.url.startsWith("/api/account/time-zone")) {
        const parsed = JSON.parse(raw || "{}")
        zonePosts.push(parsed)
        body = { ok: true, timeZone: parsed.timeZone }
      } else if (req.url.startsWith("/api/push/web")) {
        if (req.method === "POST") {
          pushPosts.push(JSON.parse(raw || "{}"))
          if (pushServerFails) {
            status = 500
            body = { error: "Storelib could not save this browser. Try again in a moment.", code: "server" }
          } else body = { ok: true }
        } else body = { publicKey: PUSH_KEY, saved: true }
      }
      setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 250)
    })
    return
  }
  if (req.url.startsWith("/photo.png")) {
    res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" })
    res.end(PHOTO)
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
      expect(m.rows.length === 4 && m.rows[3].id === "browser-notifications", "four rows, each one saved somewhere, the last this browser's notifications", m.labels.join(", "))
      /* "The toggles are a little too fat": the app's one slim switch, 36 by 20 with a 16px knob (components/ui/switch-style). */
      const tracks = await page.evaluate(() => [...document.querySelectorAll("[data-privacy-row] [role=switch] > span")].map((t) => { const r = t.getBoundingClientRect(); const k = t.firstElementChild.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}/${Math.round(k.width)}` }))
      expect(tracks.every((t) => t === "36x20/16"), "every track 36 by 20 with a 16px knob", tracks.join(" "))
      /* On a touch screen app/globals.css drops transforms inside a .group; the knob has to move anyway. */
      await wait(400)
      const knobs = await page.evaluate(() => [...document.querySelectorAll("[data-privacy-row] [role=switch]")].map((b) => { const t = b.firstElementChild; const k = t.firstElementChild; return [b.getAttribute("aria-checked"), Math.round(k.getBoundingClientRect().left - t.getBoundingClientRect().left)] }))
      expect(knobs.every(([on, x]) => (on === "true" ? x === 18 : x === 2)), "a switch that is on has its knob on the right, off on the left", JSON.stringify(knobs))
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
      /* The fields are a step: none on screen until Change password is pressed. */
      const resting = await page.evaluate(() => ({
        fields: document.querySelectorAll("[data-password-field]").length,
        open: !!document.querySelector("[data-password-open]"),
        reset: !!document.querySelector("[data-password-reset]"),
      }))
      expect(resting.fields === 0 && resting.open && resting.reset, "no password fields until Change password is pressed; the reset link beside it", JSON.stringify(resting))
      await page.evaluate(() => document.querySelector("[data-password-open]").click())
      await page.waitForSelector("[data-password-field=new]")
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
      /* A thumb's 44px on a phone; a computer's buttons may be the 40px the rest of /app uses. */
      const floor = label === "390" ? 44 : 40
      const short = m.buttons.filter((x) => x.h < floor)
      expect(short.length === 0, `every button ${floor}px or taller (${m.buttons.length} checked)`, JSON.stringify(short))
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
      await page.goto(`${base}/app/settings?tab=general&photo=none`)
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

    /* ── Profile order, photo, tooltip, stores ─────────────────────────── */
    {
      const page = await browser.newPage()
      await page.setViewport(viewport)
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e)))
      avatarPosts = []
      await page.goto(`${base}/app/settings?tab=general`)
      await page.waitForSelector("[data-settings-panel=general]")
      await wait(700)
      console.log(`\nGeneral: profile, photo, tooltip, tabs, ${label}px`)
      const order = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect()
        const u = r("#username"), n = r("#firstName")
        return { u: [Math.round(u.left), Math.round(u.top)], n: [Math.round(n.left), Math.round(n.top)] }
      })
      const usernameFirst = label === "1280" ? order.u[1] === order.n[1] && order.u[0] < order.n[0] : order.u[1] < order.n[1]
      expect(usernameFirst, `the username field comes before the name (${label === "1280" ? "left of it" : "above it"})`, JSON.stringify(order))

      const tabs = await page.evaluate(() => [...document.querySelectorAll("[data-settings-tabs] button")].map((b) => b.textContent.trim()))
      expect(!tabs.includes("Stores") && tabs.length === 6, `six tabs, no Stores: ${tabs.join(", ")}`, tabs.join(", "))

      const before = await page.evaluate(() => ({
        header: document.querySelector("[data-probe-header-avatar] [data-app-avatar]").dataset.state,
        settings: document.querySelector("[data-profile-photo] [data-app-avatar]").dataset.state,
      }))
      expect(before.header === "photo" && before.settings === "photo", "with a photo, the header and Settings both show it", JSON.stringify(before))
      await page.evaluate(() => [...document.querySelectorAll("[data-profile-photo] button")].find((b) => b.textContent.trim() === "Remove").click())
      const t0 = Date.now()
      await page.waitForFunction(() => document.querySelector("[data-probe-header-avatar] [data-app-avatar]").dataset.state === "initials", { timeout: 3000 }).catch(() => null)
      const after = await page.evaluate(() => ({
        header: document.querySelector("[data-probe-header-avatar] [data-app-avatar]").dataset.state,
        headerText: document.querySelector("[data-probe-header-avatar]").textContent.trim(),
        settings: document.querySelector("[data-profile-photo] [data-app-avatar]").dataset.state,
        reloaded: performance.getEntriesByType("navigation").length,
      }))
      expect(after.header === "initials" && after.headerText === "ML" && after.settings === "initials",
        `Remove: the header shows the initials "${after.headerText}" ${Date.now() - t0}ms after the press (the server answers in 250), and so does Settings`, JSON.stringify(after))
      expect(avatarPosts.length === 1 && avatarPosts[0].url === null, "saved through POST /api/account/avatar { url: null }", JSON.stringify(avatarPosts))
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `settings2-photo-removed-${label}.png`), fullPage: false })

      /* The Support Email note, pressed the way each screen presses. */
      await page.evaluate(() => document.querySelector("#supportEmailProfile").scrollIntoView({ block: "center" }))
      await wait(200)
      const tip = await page.$("[data-info-tip][aria-label='About the support email']")
      if (label === "390") await tip.tap()
      else await tip.hover()
      await page.waitForSelector("[data-slot=tooltip-content]", { timeout: 2000 }).catch(() => null)
      await wait(350)
      const t = await page.evaluate(() => {
        const el = document.querySelector("[data-slot=tooltip-content]")
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width),
          vw: innerWidth, vh: innerHeight,
          onBody: !el.closest("[data-settings-panel]"),
          /* The words as drawn (Radix keeps a hidden copy for screen readers beside them): every line inside the box. */
          clipped: (() => {
            const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
            if (!node) return true
            const range = document.createRange()
            range.selectNodeContents(node)
            const words = range.getBoundingClientRect()
            return words.left < r.left - 0.5 || words.right > r.right + 0.5 || words.top < r.top - 0.5 || words.bottom > r.bottom + 0.5
          })(),
          text: [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())?.textContent.trim() ?? "",
          lines: (() => {
            const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
            const range = document.createRange()
            range.selectNodeContents(node)
            return new Set([...range.getClientRects()].map((q) => Math.round(q.top))).size
          })(),
        }
      })
      expect(!!t, "the Support Email note opens", "no tooltip")
      if (t) {
        expect(t.onBody, "drawn on the body, outside the card that clipped it")
        expect(t.left >= 12 && t.right <= t.vw - 12 && t.top >= 0 && t.bottom <= t.vh, `inside the screen, 12px from its edges: ${t.left}..${t.right} of ${t.vw}, ${t.w}px wide`, JSON.stringify(t))
        expect(!t.clipped && /^This email appears on customer receipts[\s\S]*Customers write to it for support\.$/.test(t.text), `its whole sentence showing on ${t.lines} lines, nothing cut`, JSON.stringify(t))
      }
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `settings2-tooltip-${label}.png`), fullPage: false })
      expect(errors.length === 0, "no page errors", errors.join(" | "))
      await page.close()

      const old = await browser.newPage()
      await old.setViewport(viewport)
      await old.goto(`${base}/app/settings?tab=stores`)
      await old.waitForSelector("[data-settings-panel]")
      await wait(300)
      const landed = await old.evaluate(() => ({ panel: document.querySelector("[data-settings-panel]").dataset.settingsPanel, search: location.search }))
      expect(landed.panel === "general" && landed.search === "", "an old ?tab=stores link opens General, and the address loses the tab", JSON.stringify(landed))
      await old.close()
    }

    /* ── Language and Time zone ────────────────────────────────────────── */
    {
      const page = await browser.newPage()
      await page.setViewport(viewport)
      await page.emulateTimezone("Asia/Tokyo")
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e)))
      zonePosts = []
      await page.goto(`${base}/app/settings?tab=general&photo=none&tz=Europe/Bucharest`)
      await page.waitForSelector("[data-choice-field=language]")
      await wait(500)
      console.log(`\nLanguage and time zone pickers, ${label}px`)
      const measure = (name) => page.evaluate((name) => {
        const r = (el) => el.getBoundingClientRect()
        const sheet = document.querySelector("[data-sheet-panel] [data-choice-sheet]")?.closest("[data-sheet-panel]")
        const pop = document.querySelector(`[data-choice-popover=${name}]`)
        const root = sheet || pop
        if (!root) return null
        const rows = [...root.querySelectorAll("[data-choice]")].filter((b) => b.dataset.choice !== "__action")
        const search = root.querySelector("[data-choice-search]")
        const box = r(root)
        return {
          kind: sheet ? "sheet" : "popover",
          rows: rows.length,
          rowH: rows.slice(0, 6).map((b) => Math.round(r(b).height)),
          /* Above the box the rows scroll in: the list opens scrolled to the chosen row (the popover's list is its own
             scroller; in the sheet the rows scroll in the sheet's body, so the list's own box starts above the screen). */
          searchAboveRows: !!search && rows.length > 0 && r(search).bottom <= r(root.querySelector("[role=listbox]").closest("[data-sheet-scroll]") ?? root.querySelector("[role=listbox]")).top + 1,
          searchFont: search ? getComputedStyle(search).fontSize : null,
          closeButton: !!root.querySelector("[aria-label=Close]"),
          grabber: !!(sheet && sheet.querySelector("[data-sheet-handle]")),
          lead: root.querySelector("[data-choice=__action]")?.textContent.trim() ?? null,
          inside: box.left >= 0 && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
          width: Math.round(box.width),
          checked: root.querySelector("[data-choice][data-checked]")?.dataset.choice ?? null,
        }
      }, name)

      for (const [name, search, expectRow, minRows] of [["language", "germ", "de", 4], ["time-zone", "bucharest", "Europe/Bucharest", 300]]) {
        await page.evaluate((name) => document.querySelector(`[data-choice-field=${name}]`).scrollIntoView({ block: "center" }), name)
        await wait(150)
        await page.click(`[data-choice-field=${name}]`)
        await wait(700)
        const m = await measure(name)
        const want = label === "390" ? "sheet" : "popover"
        expect(m && m.kind === want, `${name}: a ${want} at ${label}`, JSON.stringify(m))
        if (!m) continue
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `settings2-${name}-${label}.png`), fullPage: false })
        expect(m.rows >= minRows, `${name}: ${m.rows} rows`, m.rows)
        expect(m.searchAboveRows, `${name}: the search at the top, above the rows`)
        if (label === "390") {
          expect(m.rowH.every((h) => h >= 48), `${name}: rows 48px or taller on a phone (${m.rowH.join(", ")})`, m.rowH.join(","))
          expect(!m.closeButton && m.grabber, `${name}: the sheet's grabber and no X`, JSON.stringify(m))
          expect(m.searchFont === "16px", `${name}: 16px search text, so iOS does not zoom (${m.searchFont})`, m.searchFont)
        } else {
          expect(m.rowH.every((h) => h >= 36), `${name}: rows 36px or taller (${m.rowH.join(", ")})`, m.rowH.join(","))
          expect(m.inside, `${name}: the popover inside the screen, ${m.width}px wide`, JSON.stringify(m))
        }
        if (name === "time-zone") {
          expect(m.checked === "Europe/Bucharest", `time-zone: the account's zone is the one checked (${m.checked})`, m.checked)
          expect(/^Use my current time zone \(Tokyo\)UTC\+9$/.test(m.lead ?? ""), `time-zone: "Use my current time zone" offers this device's (${m.lead})`, m.lead)
        }
        await page.focus(label === "390" ? "[data-sheet-panel] [data-choice-search]" : `[data-choice-popover=${name}] [data-choice-search]`)
        await page.keyboard.type(search)
        await wait(250)
        const found = await page.evaluate((expectRow) => {
          const rows = [...document.querySelectorAll("[data-choice]")].filter((b) => b.dataset.choice !== "__action" && b.getClientRects().length)
          return { n: rows.length, has: rows.some((b) => b.dataset.choice === expectRow) }
        }, expectRow)
        expect(found.has && found.n <= 3, `${name}: "${search}" narrows the list to ${found.n}, with ${expectRow}`, JSON.stringify(found))
        if (name === "time-zone") {
          /* A new search, set the way React hears it. */
          await page.evaluate((sel) => {
            const el = document.querySelector(sel)
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "tokyo")
            el.dispatchEvent(new Event("input", { bubbles: true }))
          }, label === "390" ? "[data-sheet-panel] [data-choice-search]" : `[data-choice-popover=${name}] [data-choice-search]`)
          await wait(250)
          await page.evaluate(() => document.querySelector("[data-choice='Asia/Tokyo']").click())
        } else {
          await page.evaluate((v) => document.querySelector(`[data-choice='${v}']`).click(), expectRow)
        }
        await wait(700)
      }
      const fields = await page.evaluate(() => ({
        language: document.querySelector("[data-choice-field=language]").textContent.trim(),
        zone: document.querySelector("[data-choice-field=time-zone]").textContent.trim(),
      }))
      expect(fields.language.startsWith("Deutsch") && /^Tokyo\s*UTC\+9/.test(fields.zone), `the fields read what was picked: ${fields.language} / ${fields.zone}`, JSON.stringify(fields))
      /* Save: the time zone goes to the account. The language is applied on save by a reload, which the stubbed page cannot survive, so it is put back first. */
      await page.evaluate(() => document.querySelector("[data-choice-field=language]").click())
      await wait(600)
      await page.evaluate(() => document.querySelector("[data-choice='en']").click())
      await wait(600)
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save").click())
      await wait(900)
      const stored = await page.evaluate(() => ({ local: localStorage.getItem("storelib_timezone"), cookie: document.cookie }))
      expect(zonePosts.length === 1 && zonePosts[0].timeZone === "Asia/Tokyo", "Save sends the zone to POST /api/account/time-zone", JSON.stringify(zonePosts))
      expect(stored.local === "Asia/Tokyo" && /storelib_tz=Asia%2FTokyo/.test(stored.cookie), "and this browser's pages read it from then on", JSON.stringify(stored))
      expect(errors.length === 0, "no page errors", errors.join(" | "))
      await page.close()
    }

    /* ── Notifications on this browser, with the browser's push stubbed ── */
    for (const scenario of ["granted", "denied", "unsupported", "iphone", "server", "abort"]) {
      const page = await browser.newPage()
      await page.setViewport(viewport)
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e)))
      await page.evaluateOnNewDocument((scenario) => {
        const state = { permission: scenario === "denied" ? "denied" : "default", sub: null }
        if (scenario === "unsupported" || scenario === "iphone") {
          /* "PushManager" in window has to be false: the property goes entirely. */
          delete window.PushManager
          if (scenario === "iphone") Object.defineProperty(navigator, "standalone", { value: false, configurable: true })
        } else {
          window.PushManager = function PushManager() {}
        }
        const NotificationStub = function () {}
        Object.defineProperty(NotificationStub, "permission", { get: () => state.permission })
        NotificationStub.requestPermission = () => {
          state.permission = scenario === "denied" ? "denied" : "granted"
          return Promise.resolve(state.permission)
        }
        window.Notification = NotificationStub
        const pushManager = {
          getSubscription: async () => state.sub,
          subscribe: async (opts) => {
            if (scenario === "abort") throw new DOMException("Registration failed - push service error", "AbortError")
            const bytes = new Uint8Array(opts.applicationServerKey)
            state.sub = {
              endpoint: "https://fcm.googleapis.com/fcm/send/probe_endpoint",
              options: { applicationServerKey: bytes.buffer },
              toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/probe_endpoint", keys: { p256dh: "BPk", auth: "au" } }),
              unsubscribe: async () => { state.sub = null; return true },
            }
            return state.sub
          },
        }
        const worker = { scriptURL: `${location.origin}/storelib-push-sw.js`, state: "activated", addEventListener() {} }
        const reg = { active: null, installing: null, waiting: null, pushManager }
        Object.defineProperty(navigator, "serviceWorker", {
          configurable: true,
          value: {
            getRegistrations: async () => (reg.active ? [reg] : []),
            register: async () => { reg.active = worker; return reg },
          },
        })
      }, scenario)
      pushPosts = []
      pushServerFails = scenario === "server"
      await page.goto(`${base}/app/settings?tab=privacy`)
      await page.waitForSelector("[data-account-panel=privacy]")
      await wait(500)
      if (scenario === "granted") console.log(`\nNotifications on this browser, ${label}px`)
      const read = () => page.evaluate(() => {
        const row = document.querySelector("[data-privacy-row=browser-notifications]")
        if (!row) return null
        const sw = row.querySelector("[role=switch]")
        return {
          checked: sw.getAttribute("aria-checked"), disabled: sw.disabled,
          detail: row.querySelector("[data-notifications-detail]")?.textContent ?? "",
          error: row.querySelector("[data-notifications-error]")?.textContent ?? "",
          saved: /Saved/.test(row.textContent),
        }
      })
      const first = await read()
      if (scenario === "unsupported" || scenario === "iphone" || scenario === "denied") {
        const words = { unsupported: /^This browser cannot show notifications\.$/, iphone: /^Safari on iPhone does not show website notifications\. The Storelib app for iPhone does\.$/, denied: /^Blocked in this browser's settings for storelib\.com\./ }[scenario]
        expect(first && first.disabled && first.checked === "false" && words.test(first.detail), `${scenario}: the switch is off and disabled, and says "${first?.detail}"`, JSON.stringify(first))
      } else {
        expect(first && !first.disabled && first.checked === "false", `${scenario}: off on load, and can be turned on`, JSON.stringify(first))
        await page.evaluate(() => document.querySelector("[data-privacy-row=browser-notifications] [role=switch]").click())
        await wait(900)
        const now = await read()
        if (scenario === "granted") {
          expect(now.checked === "true" && now.saved && !now.error && pushPosts.length === 1 && pushPosts[0].subscription?.endpoint?.includes("probe_endpoint"),
            "granted: on, saved (POST /api/push/web with the subscription), no error", JSON.stringify({ now, pushPosts }))
        } else if (scenario === "server") {
          expect(now.checked === "false" && /^Storelib could not save this browser\. Try again in a moment\.$/.test(now.error), `server error: back off, and says "${now.error}"`, JSON.stringify(now))
        } else {
          expect(now.checked === "false" && /push service refused/.test(now.error) && pushPosts.length === 0, `push service refused: back off, and says "${now.error}"`, JSON.stringify(now))
        }
        if (SHOTS && label === "390" && scenario === "server") await page.screenshot({ path: join(SHOTS, `settings2-push-server-error-${label}.png`), fullPage: false })
      }
      if (SHOTS && scenario === "denied") await page.screenshot({ path: join(SHOTS, `settings2-push-denied-${label}.png`), fullPage: false })
      expect(errors.length === 0, `${scenario}: no page errors`, errors.join(" | "))
      pushServerFails = false
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
