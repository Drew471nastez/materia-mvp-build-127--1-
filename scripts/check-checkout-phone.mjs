/**
 * ===========================================================================
 *  THE CHECKOUT PHONE, TYPED IN A BROWSER
 * ===========================================================================
 * The owner: "next to the phone number I want to know where the country I am
 * from is, or change the country". Types into the real field
 * (app/(storelib)/checkout/parts/phone-input) and reads what is on screen and what the
 * order would keep: the code following the address's country, the code
 * picked from the searchable list, a pasted number with its own code, the
 * digits kept when the country changes, the code never shown twice. At 390
 * (an iPhone) and 1440.
 *
 *   node scripts/check-checkout-phone.mjs        (SHOTS=/dir for pictures)
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

const stubs = mkdtempSync(join(tmpdir(), "storelib-checkout-phone-"))
const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-checkout-phone.tsx")],
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
const out = process.env.SHOTS || join(root, ".checkout-phone-probe")
mkdirSync(out, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
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
    await p.setViewport({ width, height: 760, deviceScaleFactor: width < 640 ? 3 : 1, isMobile: width < 640, hasTouch: width < 640 })
    await p.goto("http://probe.test/")
    await p.waitForSelector("[data-checkout-phone]")
    const read = () => p.evaluate(() => {
      const input = document.querySelector("[data-checkout-phone] input")
      const code = document.querySelector("[data-checkout-phone] [data-choice-field]")
      const box = document.querySelector("[data-checkout-phone]").getBoundingClientRect()
      return { shown: input.value, code: code.textContent.trim(), kept: document.querySelector("[data-kept]").textContent, placeholder: input.placeholder, label: input.labels?.[0]?.textContent, h: Math.round(box.height), fontSize: getComputedStyle(input).fontSize, flag: !!code.querySelector("use") }
    })
    const start = await read()
    expect(start.code === "+40" && start.flag && start.placeholder === "Phone", "Romania's flag and +40 before the field, Phone as its placeholder", start)
    expect(start.label === "Phone", "the field is named by its label", start.label)
    expect(start.h === 44 && start.fontSize === (width < 640 ? "16px" : "15px"), "44px tall, 16px type on a phone (iOS does not zoom) and the checkout's 15px above", { h: start.h, font: start.fontSize })
    await p.click("[data-checkout-phone] input")
    await p.keyboard.type("0712345678")
    const typed = await read()
    expect(typed.shown === "712 345 678" && typed.kept === "+40 712 345 678", "0712345678 reads 712 345 678 and is kept as +40 712 345 678", typed)

    /* The address moves to the UK: the code follows and the digits stay. */
    await p.click('[data-address-country="GB"]')
    await wait(100)
    const gb = await read()
    expect(gb.code === "+44" && gb.kept.startsWith("+44 ") && gb.kept.replace(/\D/g, "") === "44712345678", "the address's country changed: +44 before the same digits", gb)

    /* The buyer picks their own country from the list, by searching for its code. */
    await p.click("[data-checkout-phone] [data-choice-field]")
    await p.waitForSelector("[data-choice-search]", { visible: true })
    await wait(width < 640 ? 450 : 150)
    if (width < 640) await p.screenshot({ path: join(out, `checkout-phone-sheet-${width}.png`) })
    await p.type("[data-choice-search]", "+33")
    await wait(120)
    const rows = await p.$$eval("[data-choice]", (els) => els.map((e) => e.textContent.trim()).slice(0, 4))
    expect(rows.some((r) => r.includes("France") && r.includes("+33")), "searching +33 finds France with its code", rows)
    if (width >= 640) await p.screenshot({ path: join(out, `checkout-phone-list-${width}.png`), clip: { x: 0, y: 0, width: 760, height: 560 } })
    await p.evaluate(() => [...document.querySelectorAll("[data-choice]")].find((e) => e.textContent.includes("France"))?.click())
    await wait(width < 640 ? 500 : 150)
    const fr = await read()
    expect(fr.code === "+33" && fr.kept.startsWith("+33 ") && fr.kept.replace(/\D/g, "") === "33712345678", "France picked: +33, the digits kept", fr)
    await p.click('[data-address-country="US"]')
    await wait(100)
    expect((await read()).code === "+33", "a code the buyer picked stays when the address changes after", (await read()).code)

    /* A number filled in or pasted with another code moves the code to it, shown once. */
    await p.focus("[data-checkout-phone] input")
    await p.evaluate(() => document.querySelector("[data-checkout-phone] input").select())
    await p.keyboard.press("Backspace")
    await p.keyboard.sendCharacter("+44 7700 900123")
    await wait(100)
    const pasted = await read()
    expect(pasted.code === "+44" && pasted.shown === "7700 900123" && pasted.kept === "+44 7700 900123", "a pasted +44 7700 900123 moves the code to the UK and is not +44 44", pasted)
    await p.screenshot({ path: join(out, `checkout-phone-${width}.png`), clip: { x: 0, y: 0, width: Math.min(width, 760), height: 220 } })
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await p.close()
  }
} finally {
  await browser.close()
}
if (broken) { console.error(`\n${broken} wrong.`); process.exit(1) }
console.log("\n  all good.")
