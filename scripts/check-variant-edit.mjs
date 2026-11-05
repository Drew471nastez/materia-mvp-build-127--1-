/**
 * THE CHECKOUT'S OPTION PICKER, USED FOR REAL (app/(storelib)/checkout/parts/variant-edit.tsx)
 *
 * Mounts it in Chromium (scripts/render-variant-edit.tsx) on two lines, a
 * hoodie with Size and Colour and an ebook with two editions, and uses it:
 * Edit opens it, a size and a colour change the line, a sold out
 * combination can't be chosen, the edition changes, Done folds it. A
 * screenshot of each state is written to .variant-edit-shots/.
 *
 *   node scripts/check-variant-edit.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".variant-edit-probe")
const shots = join(root, ".variant-edit-shots")
mkdirSync(dir, { recursive: true })
mkdirSync(shots, { recursive: true })
writeFileSync(join(dir, "next-image.js"), `import * as React from "react"\nexport default function Image({ src, alt, fill, priority, quality, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }\n`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-variant-edit.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;', '--define:process.env.NODE_ENV="production"',
  `--alias:next/image=${join(dir, "next-image.js")}`, `--alias:@=${root}`, "--loader:.css=empty"], { cwd: root, stdio: "inherit" })
const css = await appCss(root)
writeFileSync(join(dir, "page.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fff}</style></head><body><div id="mount"></div><script src="probe.js"></script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] })
let broken = 0
const fail = (m) => { broken++; console.log(`  FAIL  ${m}`) }
const ok = (m) => console.log(`  ok    ${m}`)
try {
  for (const [w, label] of [[1280, "computer"], [390, "phone"]]) {
    console.log(`\n${label}, ${w}px`)
    const page = await browser.newPage()
    await page.setViewport({ width: w, height: 760 })
    await page.goto(`file://${join(dir, "page.html")}`)
    await page.waitForFunction(() => window.__ready === true)
    const line = (n) => `[data-line="${n}"]`
    const editCount = await page.$$eval("[data-variant-edit-toggle]", (els) => els.length)
    editCount === 2 ? ok("Edit beside each line's option") : fail(`expected 2 Edit buttons, saw ${editCount}`)
    await page.screenshot({ path: join(shots, `${label}-1-closed.png`) })
    await page.click(`${line("hoodie")} [data-variant-edit-toggle]`)
    const selects = await page.$$eval(`${line("hoodie")} select`, (els) => els.map((s) => ({ label: s.closest("label")?.querySelector("span")?.textContent, value: s.value })))
    JSON.stringify(selects) === JSON.stringify([{ label: "Size", value: "M" }, { label: "Colour", value: "Black" }]) ? ok("the hoodie opens on its Size and Colour, as chosen") : fail(`selects ${JSON.stringify(selects)}`)
    const lBlack = await page.$eval(`${line("hoodie")} select`, (s) => { const o = [...s.options].find((x) => x.value === "L"); return { disabled: o.disabled, text: o.textContent } })
    /* L is on sale in Grey, so it is offered; the picker takes L / Grey rather than the sold out L / Black. */
    !lBlack.disabled ? ok("L is offered (it is on sale in Grey)") : fail("L disabled though L / Grey is on sale")
    await page.screenshot({ path: join(shots, `${label}-2-open.png`) })
    await page.select(`${line("hoodie")} select`, "L")
    await new Promise((r) => setTimeout(r, 80))
    const picked = await page.evaluate(() => window.__picked.hoodie.slice())
    picked.join() === "l-g" ? ok("choosing L takes L / Grey, never the sold out L / Black") : fail(`picked ${picked.join()}`)
    const shown = await page.$eval(line("hoodie"), (el) => el.textContent)
    ;/L \/ Grey/.test(shown) && /\$49\.00/.test(shown) ? ok("the line now reads L / Grey at its own price") : fail(`line reads ${shown}`)
    await page.screenshot({ path: join(shots, `${label}-3-changed.png`) })
    await page.click(`${line("hoodie")} [data-variant-edit-toggle]`)
    const folded = await page.$$eval(`${line("hoodie")} select`, (els) => els.length)
    folded === 0 ? ok("Done folds it away") : fail("the selects stayed after Done")
    await page.click(`${line("ebook")} [data-variant-edit-toggle]`)
    const edition = await page.$$eval(`${line("ebook")} select option`, (els) => els.map((o) => o.textContent))
    /* In the currency checkout charges in (../app/(storelib)/checkout/parts/ui money), whatever this machine's platform currency is. */
    edition.length === 2 && /^Standard · .*15\.00$/.test(edition[0]) && /^Deluxe · .*29\.00$/.test(edition[1]) ? ok("the ebook offers its editions with their prices") : fail(`editions ${JSON.stringify(edition)}`)
    await page.select(`${line("ebook")} select`, "dlx")
    await new Promise((r) => setTimeout(r, 80))
    const ebookPicked = await page.evaluate(() => window.__picked.ebook.slice())
    ebookPicked.join() === "dlx" ? ok("choosing Deluxe changes the line") : fail(`ebook picked ${ebookPicked.join()}`)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    overflow <= 0 ? ok("nothing runs past the edge") : fail(`the page scrolls sideways by ${overflow}px`)
    await page.screenshot({ path: join(shots, `${label}-4-edition.png`) })
    await page.close()
  }
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : `\nall held; screenshots in .variant-edit-shots/`)
process.exit(broken ? 1 : 0)
