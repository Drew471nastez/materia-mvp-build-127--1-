/**
 * ===========================================================================
 *  SET UP PAYOUTS: THE PHONE NUMBER, TYPED IN A BROWSER
 * ===========================================================================
 * Round 12, ask 36: "the calling code prefix follows the chosen country
 * automatically and the number formats as typed." This types into the real
 * field (components/app/settings/phone-field) a key at a time and reads
 * what is on screen and what the form would keep: the code before the
 * number, the grouping after every key, the caret staying after the digit
 * just typed, a backspace over a space taking the digit before it, and the
 * code changing when the country does. At 390 (an iPhone) and 1440.
 *
 *   node scripts/check-phone-field.mjs           (SHOTS=/dir for pictures)
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = mkdtempSync(join(tmpdir(), "storelib-phone-field-"))
const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-phone-field.tsx")],
  bundle: true, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", react: compiled("react"), "react-dom": compiled("react-dom") },
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"), logLevel: "error", absWorkingDir: root, nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
const out = process.env.SHOTS || join(root, ".phone-field-probe")
mkdirSync(out, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const width of [390, 1440]) {
    console.log(`\nAt ${width}px`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (u === "http://probe.test/") return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("http://probe.test/flags/")) {
        const file = join(root, "public", new URL(u).pathname)
        return existsSync(file) ? r.respond({ status: 200, contentType: "image/svg+xml", body: readFileSync(file) }) : r.respond({ status: 404, body: "" })
      }
      if (u.startsWith("data:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width, height: 600, deviceScaleFactor: width < 640 ? 3 : 1, isMobile: width < 640, hasTouch: width < 640 })
    await p.goto("http://probe.test/")
    await p.waitForSelector("[data-phone-field]")
    const read = () => p.evaluate(() => {
      const input = document.querySelector("[data-phone-field] input")
      const prefix = document.querySelector("[data-phone-prefix]")
      const box = document.querySelector("[data-phone-field]").getBoundingClientRect()
      return { shown: input.value, caret: input.selectionStart, prefix: prefix && prefix.getAttribute("data-phone-prefix"), kept: document.querySelector("[data-kept]").textContent, placeholder: input.placeholder, h: Math.round(box.height), fontSize: getComputedStyle(input).fontSize }
    })
    const start = await read()
    expect(start.prefix === "+40" && start.placeholder === "712 345 678", "Romania's code stands before the field, with a number in its shape as the example", start)
    expect(width >= 640 || (start.h >= 44 && start.fontSize === "16px"), "44px tall and 16px on a phone (iOS does not zoom)", { h: start.h, font: start.fontSize })
    await p.click("[data-phone-field] input")
    const steps = []
    for (const key of "0712345678") {
      await p.keyboard.type(key)
      steps.push((await read()).shown)
    }
    const typed = await read()
    console.log(`  as typed: ${steps.map((s) => JSON.stringify(s)).join(" ")}`)
    expect(typed.shown === "712 345 678", "0712345678 typed a key at a time reads 712 345 678 (the local 0 dropped)", typed.shown)
    expect(steps.includes("712 34") && steps.includes("712 345 6"), "and it is grouped after every key, not at the end", steps)
    expect(typed.kept === "+40 712 345 678", "the form keeps +40 712 345 678", typed.kept)
    expect(typed.caret === typed.shown.length, "the caret stays at the end as it grows", typed.caret)
    if (width < 640) await p.screenshot({ path: join(out, `phone-ro-${width}.png`), clip: { x: 0, y: 0, width, height: 200 } })

    /* A backspace just after a space removes the digit before it. */
    await p.evaluate(() => { const i = document.querySelector("[data-phone-field] input"); i.setSelectionRange(4, 4) })
    await p.keyboard.press("Backspace")
    const back = await read()
    expect(back.shown === "713 456 78" && back.caret === 2, "a backspace after a space takes the 2 before it and the caret stays there", back)
    /* A digit typed in the middle keeps the caret after it. */
    await p.keyboard.type("2")
    const mid = await read()
    expect(mid.shown === "712 345 678" && mid.caret === 3, "a digit typed in the middle leaves the caret right after it", mid)

    /* The country changes: the code follows and the digits stay. */
    await p.click('[data-country="US"]')
    await new Promise((r) => setTimeout(r, 150))
    const us = await read()
    expect(us.prefix === "+1" && us.shown === "(712) 345-678" && us.kept === "+1 (712) 345-678", "choosing the US puts +1 before the same digits, in its own shape", us)
    await p.click('[data-country="GB"]')
    await new Promise((r) => setTimeout(r, 150))
    const gb = await read()
    expect(gb.prefix === "+44" && gb.kept.startsWith("+44 "), "and the UK +44", gb)
    /* A number pasted whole with its code comes in without it. */
    await p.click('[data-country="FR"]')
    await p.evaluate(() => { const i = document.querySelector("[data-phone-field] input"); i.select() })
    await p.keyboard.press("Backspace")
    await p.keyboard.sendCharacter("+33 6 12 34 56 78")
    const fr = await read()
    expect(fr.prefix === "+33" && fr.shown === "6 12 34 56 78" && fr.kept === "+33 6 12 34 56 78", "a pasted +33 6 12 34 56 78 in France keeps the number once, not +33 33", fr)
    await p.screenshot({ path: join(out, `phone-fr-${width}.png`), clip: { x: 0, y: 0, width, height: width < 640 ? 200 : 220 } })
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.close()
  }
} finally {
  await browser.close()
}
if (broken) { console.error(`\n${broken} wrong.`); process.exit(1) }
console.log("\n  all good.")
