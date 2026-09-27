/**
 * ===========================================================================
 *  THE PAGE ADDRESS FIELD: storelib.me/{name}, CHECKED AS YOU TYPE
 * ===========================================================================
 * The real OnePage Settings tab (scripts/render-onepage-address.tsx) at a
 * phone and a laptop width. The live check (/api/onepage/address) is
 * answered here: `takenname` is taken, anything else is free, each answer
 * 300ms late so the "Checking" line has a moment to be seen.
 *
 *   THE FIELD      reads storelib.me/ in front and nothing after it (it was
 *                  storelib.com/ ... /links), and fits its box at 390px
 *   THE LINE       under it: an address a rule refuses says why at once and
 *                  never asks the server; a good one says Checking, then
 *                  free or taken; Save is off while it is taken
 *   THE ASKING     once per pause in typing, not once per key
 *   THE COPY LINE  storelib.me/satori, no scheme
 *
 *   node scripts/check-onepage-address.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-address.mjs
 */
import puppeteer from "puppeteer-core"
import { join } from "node:path"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }

let passed = 0
let failed = 0
const check = (label, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`) }
}

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-address.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
try {
  for (const [label, width] of [["phone", 390], ["laptop", 1280]]) {
    console.log(`\n${label}`)
    const page = await browser.newPage()
    await page.setViewport({ width, height: 900, deviceScaleFactor: 2 })
    const asked = []
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const url = new URL(req.url())
      if (url.pathname === "/api/onepage/address") {
        const name = url.searchParams.get("name")
        asked.push(name)
        const body = name === "takenname" ? { name, available: false, error: "That page address is taken" } : { name, available: true }
        setTimeout(() => req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) }), 300)
        return
      }
      req.continue()
    })
    await page.goto(`${base}/app/onepage`, { waitUntil: "networkidle0" })
    await page.waitForSelector("[data-settings-slug]")

    const field = await page.$eval("[data-settings-slug]", (input) => {
      const box = input.parentElement
      const spans = [...box.querySelectorAll("span")].map((s) => s.textContent)
      const r = box.getBoundingClientRect()
      return { spans, value: input.value, w: r.width, right: r.right, vw: innerWidth, copy: document.querySelector("[data-settings-basic] p[title]")?.textContent }
    })
    check("the field reads storelib.me/ and nothing after", field.spans.length === 1 && field.spans[0] === "storelib.me/", JSON.stringify(field.spans))
    check("it holds the page's address", field.value === "satori")
    check("the box fits the screen", field.right <= field.vw, JSON.stringify(field))
    check("the copy line is storelib.me/satori, no scheme", field.copy === "storelib.me/satori", field.copy)

    const setValue = async (v) => {
      await page.focus("[data-settings-slug]")
      const had = await page.$eval("[data-settings-slug]", (i) => i.value.length)
      await page.$eval("[data-settings-slug]", (i) => i.setSelectionRange(i.value.length, i.value.length))
      for (let k = 0; k < had; k++) await page.keyboard.press("Backspace")
      await page.type("[data-settings-slug]", v, { delay: 40 })
    }
    const line = () => page.evaluate(() => {
      const box = document.querySelector("[data-settings-slug]").closest(".space-y-1\\.5")
      const p = box.querySelector("p")
      const save = [...document.querySelectorAll("[data-settings-save] button")][0]
      return { text: p?.textContent ?? "", error: !!box.querySelector("[data-slug-error]"), checking: !!box.querySelector("[data-slug-checking]"), free: !!box.querySelector("[data-slug-free]"), saveOff: save?.disabled ?? null }
    })

    asked.length = 0
    await setValue("ab")
    await new Promise((r) => setTimeout(r, 500))
    const short = await line()
    check("too short says so at once", short.error && short.text === "Use at least 3 characters", JSON.stringify(short))
    check("and never asks the server", asked.length === 0, asked.join(","))
    check("Save is off", short.saveOff === true)
    if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `onepage-address-${label}-short.png`) })

    await setValue("app")
    await new Promise((r) => setTimeout(r, 450))
    const reserved = await line()
    check("a reserved word is not available, without asking", reserved.error && reserved.text === "That name is not available" && asked.length === 0, JSON.stringify(reserved))

    await setValue("takenname")
    await new Promise((r) => setTimeout(r, 380))
    const checking = await line()
    check("a good name says Checking while it is asked", checking.checking && /Checking storelib\.me\/takenname/.test(checking.text), JSON.stringify(checking))
    await new Promise((r) => setTimeout(r, 500))
    const taken = await line()
    check("then that it is taken", taken.error && taken.text === "That page address is taken", JSON.stringify(taken))
    check("and Save is off", taken.saveOff === true)
    check("typing nine letters asked once, not nine times", asked.filter((n) => n.startsWith("tak")).length === 1, asked.join(","))
    if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `onepage-address-${label}-taken.png`) })

    await setValue("satori-prints")
    await new Promise((r) => setTimeout(r, 900))
    const free = await line()
    check("a free name says so, and where the page will be", free.free && /storelib\.me\/satori-prints is free/.test(free.text), JSON.stringify(free))
    check("and Save is on", free.saveOff === false)
    if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `onepage-address-${label}-free.png`) })

    await setValue("satori")
    await new Promise((r) => setTimeout(r, 500))
    const own = await line()
    check("its own address again: nothing to say, nothing asked", own.text === "" && !asked.includes("satori"), JSON.stringify(own))
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
