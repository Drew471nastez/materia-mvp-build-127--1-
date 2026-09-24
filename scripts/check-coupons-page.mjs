/**
 * ===========================================================================
 *  THE COUPONS PAGES, MEASURED
 * ===========================================================================
 * The list in the Products area's frame (its tabs, one card, views with
 * counts, a table from 768px and a list of whole-row presses under it) and
 * the form with its bar at the top, at a phone's widths and a computer's.
 *
 *   node scripts/check-coupons-page.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const stubs = join(root, ".coupons-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-coupons-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back() {}, refresh: () => log("refresh") }
export const usePathname = () => "/app/coupons"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { e.preventDefault(); rest.onClick && rest.onClick(e) } }, children) })
`)
  execFileSync("npx", [
    "esbuild", "scripts/render-coupons-probe.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    "--banner:js=var process={env:{NODE_ENV:'production'}};",
    "--alias:next/navigation=./.coupons-probe/navigation.js", "--alias:next/link=./.coupons-probe/link.jsx",
    `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const phone = (width) => ({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  for (const [label, vp] of [["phone-390", phone(390)], ["phone-360", phone(360)], ["desktop-1440", { width: 1440, height: 900 }], ["wide-1920", { width: 1920, height: 1080 }]]) {
    const isPhone = label.startsWith("phone")
    console.log(`\n${label}: the list`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    await p.goto(`file://${join(stubs, "index.html")}`)
    await sleep(450)
    if (errors.length) fail(`The page threw: ${errors[0]}`)

    const views = await p.$$eval("[role=tablist][aria-label=Views] [role=tab]", (t) => t.map((x) => x.textContent.trim()))
    expect(views.join("|") === "All6|Active2|Scheduled1|Ended3", "views with counts: all, active, scheduled, ended", views)
    const tabs = await p.$$eval("nav[aria-label='Products area'] a", (a) => a.map((x) => [x.textContent.trim(), x.getAttribute("aria-current")]))
    expect(tabs[1][0] === "Coupons" && tabs[1][1] === "page", "Coupons is the current tab of the Products area", tabs)
    const sideways = await p.evaluate(() => { const el = document.querySelector(".orders-pane"); return el.scrollWidth - el.clientWidth })
    expect(sideways === 0, "nothing scrolls sideways", sideways)
    const states = await p.evaluate(() => [...document.querySelectorAll(window.innerWidth < 768 ? "section ul > li" : "section tbody tr")].map((r) => r.querySelector("span.inline-flex, td:nth-child(2) span")?.textContent.trim()))
    expect(states.join(",") === "Active,Active,Scheduled,Expired,Used up,Off", "each code says where it stands", states)
    if (isPhone) {
      const rows = await p.$$eval("section ul > li", (r) => r.map((li) => ({ h: Math.round(li.getBoundingClientRect().height), link: Math.round(li.querySelector("a").getBoundingClientRect().width) === Math.round(li.getBoundingClientRect().width), menu: Math.round(li.querySelector("button").getBoundingClientRect().height) })))
      expect(rows.every((r) => r.h >= 76 && r.link && r.menu >= 44), "rows of at least 76px, the whole row a press, a 44px menu", rows[0])
      const line = await p.$eval("section ul > li:nth-child(1)", (li) => li.innerText.replace(/\s+/g, " "))
      expect(/20% off · 14 of 100 used · Ends/.test(line), "the discount, the uses and the end date under the code", line)
    } else {
      const heads = await p.$$eval("section thead th", (t) => t.map((x) => x.textContent.trim()).filter(Boolean))
      expect(heads.join("|") === "Code|Status|Discount|Applies to|Used|Dates", "the table's columns", heads)
      const used = await p.$eval("section tbody tr:nth-child(1) td:nth-child(5)", (td) => td.textContent.trim())
      expect(used === "14 / 100", "uses against the limit", used)
    }
    await p.screenshot({ path: join(shots, `${label}-coupons.png`) })
    await p.close()

    for (const mode of ["form", "edit"]) {
      console.log(`${label}: the ${mode === "form" ? "new" : "saved"} coupon form`)
      const f = await browser.newPage()
      const ferrors = []
      f.on("pageerror", (e) => ferrors.push(e.message))
      await f.setViewport(vp)
      await f.goto(`file://${join(stubs, "index.html")}?${mode}`)
      await sleep(450)
      if (ferrors.length) fail(`The form threw: ${ferrors[0]}`)
      const bar = await f.evaluate(() => {
        const b = document.querySelector("[data-editor-bar]")
        const vis = [...b.querySelectorAll("button")].filter((x) => x.getBoundingClientRect().width > 0)
        const save = vis.find((x) => x.textContent.trim() === "Save")
        return { top: Math.round(b.getBoundingClientRect().top), h: Math.round(b.getBoundingClientRect().height), save: save && { h: Math.round(save.getBoundingClientRect().height), disabled: save.disabled }, cancel: vis.some((x) => x.textContent.trim() === "Cancel"), status: b.querySelector("p").textContent }
      })
      expect(bar.top === 0 && bar.h === (isPhone ? 56 : 64) && bar.cancel && bar.save, "the bar at the top, with Cancel and Save", bar)
      expect(bar.save?.disabled === true, "Save waits for something to save", bar.status)
      expect(mode === "form" ? bar.status === "Not saved yet" : /^Active · used 14 times$/.test(bar.status), "and the bar says where the code stands", bar.status)
      const fields = await f.$$eval("[data-coupon-form] input", (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ size: getComputedStyle(e).fontSize, mode: e.inputMode, h: Math.round(e.getBoundingClientRect().height) })))
      if (isPhone) expect(fields.every((x) => x.size === "16px" && x.h >= 44), "fields are 16px text in 44px boxes", fields)
      const segmented = await f.$$eval("[role=radiogroup] [role=radio]", (r) => r.map((x) => [x.textContent.trim(), x.getAttribute("aria-checked"), Math.round(x.getBoundingClientRect().height)]))
      expect(segmented.length === 4, "percentage or fixed, all or some products, as segmented controls", segmented)
      const side = await f.evaluate(() => { const el = document.querySelector("[data-coupon-form]"); return el.scrollWidth - el.clientWidth })
      expect(side === 0, "nothing scrolls sideways", side)
      if (mode === "form") {
        await f.type("#coupon-code", "spring 25!")
        const code = await f.$eval("#coupon-code", (i) => i.value)
        expect(code === "SPRING25", "a code is typed in capitals, without spaces or symbols", code)
        const enabled = await f.evaluate(() => ![...document.querySelectorAll("[data-editor-bar] button")].find((b) => b.textContent.trim() === "Save").disabled)
        expect(enabled, "and Save lights up", enabled)
        await f.click("[data-value=specific]")
        await sleep(100)
        const list = await f.$$eval("[role=checkbox]", (c) => c.length)
        expect(list === 6, "Some products lists the products to pick", list)
        await f.evaluate(() => [...document.querySelectorAll("[role=switch]")][1].click())
        await sleep(100)
        await f.screenshot({ path: join(shots, `${label}-coupon-form.png`), fullPage: false })
        await f.evaluate(() => document.querySelector("[data-coupon-form]").scrollTo(0, 9999))
        await sleep(150)
        await f.screenshot({ path: join(shots, `${label}-coupon-form-end.png`) })
        await f.keyboard.down("Control")
        await f.keyboard.press("s")
        await f.keyboard.up("Control")
        await sleep(200)
        const err = await f.$eval("[role=alert]", (a) => a.textContent).catch(() => null)
        expect(err === "Enter how much the code takes off.", "Ctrl and S checks the form before asking the server", err)
      } else {
        await f.screenshot({ path: join(shots, `${label}-coupon-edit.png`) })
      }
      await f.close()
    }
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
