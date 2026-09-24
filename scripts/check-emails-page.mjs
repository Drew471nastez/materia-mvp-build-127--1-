/**
 * ===========================================================================
 *  THE EMAILS PAGE, MEASURED
 * ===========================================================================
 * The Emails screen was rebuilt in the Orders page's language. What that
 * claims, checked in Chromium with the built stylesheet:
 *
 *   - the views are tabs in the card's toolbar, one row, 48px tall;
 *   - each view has its own metrics strip, and Sent has the period picker;
 *   - tables are dense (48px rows) and the first column stays put when a
 *     phone scrolls the table sideways, while the page itself never does;
 *   - fifty rows to a page, with Previous and Next;
 *   - a row's actions are a dropdown on a desktop and a sheet on a phone;
 *   - a long address or subject is cut with an ellipsis, not wrapped.
 *
 *   pnpm build && node scripts/check-emails-page.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const stubs = join(root, ".emails-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-emails-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/emails"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams()
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
  execFileSync("npx", [
    "esbuild", "scripts/render-emails-probe.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    `--alias:next/navigation=./.emails-probe/navigation.js`, `--alias:next/link=./.emails-probe/link.jsx`,
    `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  writeFileSync(join(stubs, "index.html"), html)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const open = async (viewport, tab) => {
    const p = await browser.newPage()
    await p.setViewport(viewport)
    await p.goto(`file://${join(stubs, "index.html")}?tab=${tab}`)
    await p.waitForSelector("[role=tablist]")
    return p
  }
  const sidewaysScroll = (p) => p.evaluate(() => document.querySelector(".orders-pane").scrollWidth - document.querySelector(".orders-pane").clientWidth)

  for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    console.log(`\n${label}`)
    const p = await open(vp, "subscribers")
    const tabs = await p.$$eval("[role=tablist][aria-label=Views] [role=tab]", (t) => t.map((x) => x.textContent.trim()))
    expect(tabs.join("|") === "Subscribers|Automations|Sent|Scheduled|Drafts", "the views are tabs in the card", tabs)
    const toolbar = await p.$eval("[role=tablist]", (t) => Math.round(t.closest("div.flex.h-12").getBoundingClientRect().height))
    expect(toolbar === 48, "in one 48px toolbar", toolbar)
    const strip = await p.$$eval("[aria-label='Email metrics'] .border-l, [aria-label='Email metrics'] .orders-strip > div", (d) => d.length)
    expect(strip >= 4, "Subscribers has its own metrics", strip)
    const rows = await p.$$eval("section[aria-label=Emails] tbody tr", (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)))
    expect(rows.length === 50 && rows.every((h) => h === 48), "fifty dense 48px rows to a page", { count: rows.length, heights: [...new Set(rows)] })
    expect((await p.$$eval("section[aria-label=Emails] button", (b) => b.map((x) => x.textContent.trim()))).includes("Next"), "and a Next page")
    const long = await p.$eval("section[aria-label=Emails] tbody tr:nth-child(4) td span", (el) => ({ w: el.scrollWidth > el.clientWidth, h: Math.round(el.closest("td").getBoundingClientRect().height), ell: getComputedStyle(el).textOverflow }))
    expect(long.h === 48 && long.ell === "ellipsis", "a long address is cut, not wrapped", long)
    expect((await sidewaysScroll(p)) === 0, "the page never scrolls sideways", await sidewaysScroll(p))
    if (label === "phone") {
      const before = await p.$eval("section[aria-label=Emails] tbody tr td", (td) => Math.round(td.getBoundingClientRect().left))
      await p.$eval("section[aria-label=Emails] .overflow-x-auto", (el) => { el.scrollLeft = 200 })
      const after = await p.$eval("section[aria-label=Emails] tbody tr td", (td) => Math.round(td.getBoundingClientRect().left))
      expect(before === after, "the email column stays put while the table scrolls", { before, after })
      const col = await p.$eval("section[aria-label=Emails] tbody td", (td) => Math.round(td.getBoundingClientRect().width))
      expect(col <= 220, "and is narrow enough to leave the scrolling columns in view", col)
      await p.$eval("section[aria-label=Emails] .overflow-x-auto", (el) => { el.scrollLeft = 0 })
    }
    await p.screenshot({ path: join(shots, `${label}-subscribers.png`) })
    const btn = await p.$("section[aria-label=Emails] tbody tr:first-child td:last-child button")
    await btn.evaluate((b) => b.scrollIntoView({ block: "center", inline: "end" }))
    const hit = await btn.evaluate((b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("button") === b })
    expect(hit, "the actions button is not covered by the pinned column", hit)
    await btn.click()
    await new Promise((r) => setTimeout(r, 450))
    const menu = await p.evaluate(() => {
      const sheet = [...document.querySelectorAll("[role=dialog]")].find((d) => /Copy email/.test(d.textContent))
      const drop = document.querySelector("[role=menu]")
      return { sheet: !!sheet, dropdown: !!drop && /Copy email/.test(drop.textContent) }
    })
    expect(label === "phone" ? menu.sheet && !menu.dropdown : menu.dropdown && !menu.sheet, `a row's actions are a ${label === "phone" ? "sheet" : "dropdown"}`, menu)
    await p.screenshot({ path: join(shots, `${label}-subscriber-actions.png`) })
    await p.close()

    const sent = await open(vp, "published")
    expect(await sent.$("[aria-label='Email metrics']") !== null && (await sent.$$eval("button", (b) => b.some((x) => /Last 30 days/.test(x.textContent)))), "Sent has its metrics and the period picker")
    const heads = await sent.$$eval("section[aria-label=Emails] thead th", (t) => t.map((x) => x.textContent.trim()).filter(Boolean))
    expect(heads.join("|") === "Subject|Sent|Recipients|Opened|Clicked", "a sent email shows who got it, opened it and clicked", heads)
    const resent = await sent.$eval("section[aria-label=Emails] tbody tr:nth-child(2)", (r) => r.textContent)
    expect(/Sent again/.test(resent) && !/\(Resend\)/.test(resent), "a resend says Sent again instead of a raw (Resend) suffix")
    await sent.click("section[aria-label=Emails] tbody tr:first-child td:first-child")
    expect((await sent.evaluate(() => window.__log)).includes("open c0"), "a row opens its email")
    expect((await sidewaysScroll(sent)) === 0, "and this page never scrolls sideways either")
    await sent.screenshot({ path: join(shots, `${label}-sent.png`) })
    await sent.close()

    const flows = await open(vp, "flows")
    const toggle = await flows.$("section[aria-label=Emails] tbody tr:nth-child(2) [role=switch]")
    await toggle.click()
    const log = await flows.evaluate(() => window.__log)
    expect(log.includes("toggle f2") && !log.some((l) => l.startsWith("edit flow")), "an automation is switched on from its row without opening it", log)
    await flows.screenshot({ path: join(shots, `${label}-automations.png`) })
    await flows.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
