/**
 * ===========================================================================
 *  ROUND 8: THE EMAIL COMPOSER ON A PHONE, MEASURED
 * ===========================================================================
 * The real composer in its route's layer over a shell shaped like /app's
 * (scripts/render-emails-mobile-r8.tsx), at 390x844 with touch, a simulated
 * 300px keyboard on visualViewport:
 *
 *   LEAVE      New email, a field typed in, Back to the list: the /app header
 *              is painted again over the violet strip, with nothing of the
 *              layer left on <html> (no grey band where the header was)
 *   SEGMENT    New segment from Send to: a sheet on the keyboard, its name
 *              field and its Save above the keys, its content scrolling inside
 *              it, a way to put the keyboard away (Done) without closing it
 *   BLOCKS     Add a block is a sheet of large rows; a button's settings are a
 *              sheet with the link field above the keys; the formatting bar is
 *              there only with the keyboard
 *
 *   SHOTS_DIR=/tmp/r8 node scripts/check-emails-mobile-r8.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const PART = process.env.PART || "all"
const LABEL = process.env.LABEL || "r8"
const stubs = join(root, ".emails-r8-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-emails-r8-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.test"
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
const KB = 300

let browser = null
try {
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `const rows = { profiles: { display_name: "Ana Pop", username: "anapop", avatar_url: null, email: "ana@example.com" }, creators: { id: "cr-1", support_email: "hello@anapop.studio" } }
function from(table) {
  const q = { select() { return q }, eq() { return q }, order() { return q }, limit() { return q },
    maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej) } }
  return q
}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "ana@example.com" } } }) }, from } }
`,
  )
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => location.pathname
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
  execFileSync(
    "npx",
    [
      "esbuild",
      "scripts/render-emails-mobile-r8.tsx",
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
      "--alias:@=.",
      "--alias:@/lib/supabase/client=./.emails-r8-probe/supabase-client.js",
      "--alias:next/navigation=./.emails-r8-probe/navigation.js",
      "--alias:next/link=./.emails-r8-probe/link.jsx",
      `--outfile=${join(stubs, "app.js")}`,
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const css = await appCss(root)
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const page = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  async function open(path = "/app/emails/new", { app = false } = {}) {
    const p = await browser.newPage()
    /* The iOS app's <html> (its canvas and the shield under the clock follow the layer's class: app/globals.css). */
    if (app) await p.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("capacitor")))
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: page }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: GIF }) : r.continue()))
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.goto(`${ORIGIN}${path}`)
    if (path.endsWith("/new")) await p.waitForSelector("[data-email-editor] [data-email-text]", { timeout: 15000 })
    await sleep(700)
    const cdp = await p.target().createCDPSession()
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] })
    const tap = async (x, y) => {
      await touch("touchStart", x, y)
      await sleep(40)
      await touch("touchEnd", x, y)
    }
    const tapOn = async (sel) => {
      const at = await p.evaluate((q) => {
        const el = typeof q === "string" ? document.querySelector(q) : null
        if (!el) return null
        el.scrollIntoView({ block: "center" })
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      }, sel)
      if (!at) return false
      await sleep(150)
      await tap(at.x, at.y)
      return true
    }
    return { p, errors, tap, tapOn }
  }
  /* What the phone shows: the top of the page down to the keys, and the keys as grey. */
  async function phoneShot(p, name, keys = 0) {
    await p.bringToFront()
    await p.screenshot({ path: join(shots, `${LABEL}-${name}.png`) })
    if (!keys) return
    await p.evaluate((k) => {
      const d = document.createElement("div")
      d.id = "probe-keys"
      d.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${k}px;background:#d1d3d9;z-index:2147483647;display:flex;align-items:center;justify-content:center;font:600 15px sans-serif;color:#6b7280`
      d.textContent = `keyboard ${k}px`
      document.body.appendChild(d)
    }, keys)
    await p.screenshot({ path: join(shots, `${LABEL}-${name}.png`) })
    await p.evaluate(() => document.getElementById("probe-keys")?.remove())
  }

  /* ── LEAVE ── New email, a field typed in with the keyboard up, Back: the header comes back over the strip. */
  if (PART === "all" || PART === "leave") {
    console.log("\nLEAVE: New email, then Back to the list (390x844)")
    for (const how of ["keyboard down", "keyboard up"]) {
      const { p, errors, tapOn } = await open("/app/emails/new", { app: true })
      const during = await p.evaluate(() => ({ cls: document.documentElement.className, header: getComputedStyle(document.querySelector("[data-probe-header]")).visibility }))
      if (how === "keyboard up") {
        await p.evaluate(() => document.querySelector("#compose-subject, input[name=subject], [data-compose] input[type=text]")?.focus())
        await p.evaluate((k) => window.__keyboard(k), KB)
        await sleep(400)
      }
      await tapOn('button[aria-label="Back to emails"]')
      await p.evaluate(() => window.__keyboard(0))
      await sleep(900)
      const after = await p.evaluate(() => {
        const header = document.querySelector("[data-probe-header]")
        const strip = document.querySelector("[data-page-strip]")
        const top = document.elementFromPoint(195, 30)
        return {
          cls: document.documentElement.className,
          layerKinds: [...document.querySelectorAll("[data-layer-kind]")].map((e) => e.getAttribute("data-layer-kind")),
          header: getComputedStyle(header).visibility,
          topIsHeader: !!top?.closest("[data-probe-header]"),
          stripTop: strip ? Math.round(strip.getBoundingClientRect().top) : null,
          kbOpen: document.documentElement.classList.contains("keyboard-open"),
          canvas: getComputedStyle(document.documentElement).backgroundColor,
          kbInset: document.documentElement.style.getPropertyValue("--keyboard-inset-height") || document.documentElement.style.getPropertyValue("--kb-inset"),
        }
      })
      await phoneShot(p, `leave-${how.replace(" ", "-")}`)
      console.log(`  ${how}: during ${JSON.stringify(during)}`)
      expect(after.header === "visible" && after.topIsHeader && !/has-phone-page-layer|has-page-layer/.test(after.cls) && after.stripTop === 68, `${how}: after Back the header is painted again and the strip sits right under it (68), nothing of the layer left on <html>`, after)
      expect(!after.kbOpen, `${how}: no keyboard state left behind`, after)
      expect(!errors.length, `no page errors (leave, ${how})`, errors.slice(0, 3))
      await p.close()
    }
  }

  /* ── NEW SEGMENT ── a sheet on the keyboard. */
  if (PART === "all" || PART === "segment") {
    console.log("\nSEGMENT: New segment from Send to, with the keyboard (390x844, keyboard 300)")
    const { p, errors, tapOn } = await open()
    await tapOn("#compose-to")
    await sleep(700)
    await tapOn("[data-new-segment]")
    await sleep(900)
    /* Nothing takes the caret while the sheet rises; a tap on the name brings the keyboard up. */
    const rising = await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
    expect(rising !== "segment-name", "the sheet arrives with no caret in it (no keyboard rising under a moving sheet)", rising)
    await tapOn("#segment-name")
    await p.evaluate((k) => window.__keyboard(k), KB)
    await sleep(600)
    const up = await p.evaluate(() => {
      const ed = document.querySelector("[data-segment-editor]")
      const sheet = ed?.closest("[data-sheet-panel], [role=dialog]")
      const name = document.querySelector("#segment-name")
      const save = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save segment")
      const done = document.querySelector("[data-segment-done]")
      const scroller = ed?.closest("[data-sheet-scroll], [data-segment-scroll]") ?? null
      const r = (el) => (el ? (({ top, bottom }) => ({ top: Math.round(top), bottom: Math.round(bottom) }))(el.getBoundingClientRect()) : null)
      return {
        sheet: !!sheet,
        inSheet: !!ed?.closest("[data-sheet-panel]"),
        nameFocused: document.activeElement === name,
        name: r(name),
        save: r(save),
        done: done ? { ...r(done), shown: getComputedStyle(done).visibility !== "hidden" && getComputedStyle(done).display !== "none" } : null,
        scrolls: scroller ? scroller.scrollHeight > scroller.clientHeight || getComputedStyle(scroller).overflowY : null,
        enterKey: name?.getAttribute("enterkeyhint"),
        fontSize: name ? getComputedStyle(name).fontSize : null,
        selectSize: getComputedStyle(document.querySelector("#segment-joined")).fontSize,
      }
    })
    await phoneShot(p, "segment-keyboard", KB)
    const keysTop = 844 - KB
    expect(up.inSheet, "New segment is the app's bottom sheet on a phone", up)
    expect(up.nameFocused && up.name && up.name.bottom <= keysTop && up.name.top >= 0, "its name field has the caret and is above the keys", up)
    expect(up.save && up.save.bottom <= keysTop && up.save.top > 0, "Save segment is above the keys, not behind them", up)
    expect(up.done && up.done.shown && up.done.bottom <= keysTop, "a Done puts the keyboard away", up)
    expect(up.fontSize === "16px" && up.selectSize === "16px" && up.enterKey === "done", "its fields are 16px (iOS does not zoom into them) and the name's return key says done", up)
    /* Done: the keyboard goes, the sheet stays. */
    await tapOn("[data-segment-done]")
    await p.evaluate(() => window.__keyboard(0))
    await sleep(500)
    const done = await p.evaluate(() => ({ focused: document.activeElement?.id || document.activeElement?.tagName, sheet: !!document.querySelector("[data-segment-editor]") }))
    expect(done.focused !== "segment-name" && done.sheet, "Done takes the caret away and leaves the sheet open", done)
    /* Purchases: Bought a product you pick, the list scrolls inside the sheet. */
    await p.evaluate(() => {
      const s = document.querySelector("#segment-purchased")
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set
      set.call(s, "products")
      s.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await sleep(400)
    const picked = await p.evaluate(() => {
      const box = document.querySelector('[role=group][aria-label="Products"]')
      const sheet = document.querySelector("[data-segment-editor]")?.closest("[data-sheet-panel]")
      return { rows: box ? box.querySelectorAll("label").length : 0, rowH: box ? Math.round(box.querySelector("label").getBoundingClientRect().height) : 0, sheetBottom: sheet ? Math.round(sheet.getBoundingClientRect().bottom) : null }
    })
    await phoneShot(p, "segment-products")
    expect(picked.rows === 3 && picked.rowH >= 44, "the products are rows a thumb can take (44px)", picked)
    /* Save, with a name typed. */
    await p.evaluate(() => document.querySelector("#segment-name").focus())
    await p.keyboard.type("Bought a course")
    await p.evaluate(() => document.querySelector('[role=group][aria-label="Products"] input')?.click())
    await sleep(400)
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save segment")?.click())
    await sleep(900)
    const saved = await p.evaluate(() => ({ sheet: !!document.querySelector("[data-segment-editor]"), to: document.querySelector("#compose-to")?.textContent }))
    expect(!saved.sheet && /Bought a course/.test(saved.to || ""), "Save keeps it and picks it for this email", saved)
    expect(!errors.length, "no page errors (segment)", errors.slice(0, 3))
    await p.close()
  }

  /* ── BLOCKS ── Add a block, a button's settings, the formatting bar. */
  if (PART === "all" || PART === "blocks") {
    console.log("\nBLOCKS: adding a block and editing a button on a phone (390x844)")
    const { p, errors, tapOn } = await open()
    const bar0 = await p.evaluate(() => document.querySelector("[data-format-bar]")?.getAttribute("data-open"))
    expect(bar0 !== "true", "no formatting bar without the keyboard", bar0)
    await tapOn("[data-add-block]")
    await sleep(700)
    const menu = await p.evaluate(() => {
      const rows = [...document.querySelectorAll("[data-sheet-panel] [role=menuitem], [data-sheet-panel] button")].filter((b) => /^(Text|Button|Image|Product|Divider|Space)$/.test(b.textContent.trim()))
      return { rows: rows.map((r) => r.textContent.trim()), heights: rows.map((r) => Math.round(r.getBoundingClientRect().height)) }
    })
    await phoneShot(p, "add-block")
    expect(menu.rows.length === 6 && menu.heights.every((h) => h >= 44), "Add a block is a sheet of six rows, each a 44px target", menu)
    await p.evaluate(() => [...document.querySelectorAll("[data-sheet-panel] [role=menuitem], [data-sheet-panel] button")].find((b) => b.textContent.trim() === "Button")?.click())
    await sleep(900)
    const btn = await p.evaluate(() => {
      const panel = document.querySelector('[data-block-panel="button"]')
      const sheet = panel?.closest("[data-sheet-panel]")
      return { panel: !!panel, inSheet: !!sheet, label: document.activeElement?.hasAttribute?.("data-button-label") }
    })
    expect(btn.panel && btn.inSheet, "a button's settings open as a bottom sheet on a phone", btn)
    await phoneShot(p, "button-sheet-rest")
    /* Its words, typed in the sheet, are on the button behind it. */
    await p.evaluate(() => document.querySelector("[data-button-label-field]")?.focus())
    await p.keyboard.type("Shop the sale")
    await sleep(200)
    const words = await p.evaluate(() => ({ field: document.querySelector("[data-button-label-field]")?.value, onButton: document.querySelector("[data-button-label]")?.value, canvasReadOnly: document.querySelector("[data-button-label]")?.readOnly }))
    expect(words.field === "Shop the sale" && words.onButton === "Shop the sale" && words.canvasReadOnly, "the words typed in the sheet are on the button; the button itself is not a field on a phone", words)
    const sizes = await p.evaluate(() => ({ swatch: Math.round(document.querySelector('[data-button-sheet] [role=radiogroup][aria-label=Color] button[aria-label]').getBoundingClientRect().height), align: Math.round(document.querySelector('[data-button-sheet] [role=radiogroup][aria-label=Alignment]').getBoundingClientRect().height), actions: [...document.querySelectorAll("[data-button-sheet-actions] button")].map((b) => b.textContent.trim()) }))
    expect(sizes.swatch >= 40 && sizes.align >= 44 && sizes.actions.includes("Delete"), "its colours and alignment are a thumb's size, and the block's moves are in the sheet", sizes)
    /* The link field with the keyboard up: above the keys. */
    await p.evaluate(() => document.querySelector('[data-block-panel="button"] input[inputmode=url]')?.focus())
    await p.evaluate((k) => window.__keyboard(k), KB)
    await sleep(600)
    const link = await p.evaluate(() => {
      const el = document.querySelector('[data-block-panel="button"] input[inputmode=url]')
      const r = el?.getBoundingClientRect()
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), focused: document.activeElement === el, bar: document.querySelector("[data-format-bar]")?.getAttribute("data-open") } : null
    })
    await phoneShot(p, "button-sheet", KB)
    expect(link && link.focused && link.bottom <= 844 - KB && link.top > 0, "the link field is above the keys", link)
    expect(link && link.bar !== "true", "and the formatting bar stays away (it is for text)", link)
    /* Done closes it; a tap on the button opens it again. */
    await tapOn("[data-button-sheet-done]")
    await p.evaluate(() => window.__keyboard(0))
    await sleep(700)
    const shut = await p.evaluate(() => ({ sheet: !!document.querySelector("[data-button-sheet]"), focused: document.activeElement?.tagName }))
    expect(!shut.sheet && shut.focused !== "INPUT", "Done closes the sheet and the keyboard", shut)
    await tapOn('[data-block-type="button"] [data-button-label]')
    await sleep(800)
    const again = await p.evaluate(() => !!document.querySelector('[data-sheet-panel] [data-block-panel="button"]'))
    expect(again, "a tap on the button opens its sheet again", again)
    expect(!errors.length, "no page errors (blocks)", errors.slice(0, 3))
    await p.close()
  }
} finally {
  rmSync(stubs, { recursive: true, force: true })
  await browser?.close()
}
console.log(`\n  screenshots in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
