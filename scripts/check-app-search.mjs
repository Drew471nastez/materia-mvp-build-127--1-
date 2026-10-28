/**
 * ===========================================================================
 *  THE /app SEARCH, MEASURED
 * ===========================================================================
 * The real component (components/app/app-search.tsx) over a page shaped like
 * /app, with the server replaced by fixtures (scripts/render-app-search.tsx).
 * At a phone's width and a computer's:
 *
 *   - a phone gets the whole screen, a 16px field at least 44px tall, rows
 *     of 48px, and nothing scrolls sideways
 *   - a computer gets the panel dropped from the header bar, centred
 *   - typing asks the server once per pause, not once per letter
 *   - an answer to an older query never lands: it is cancelled
 *   - results come back grouped, Pages first, then Orders, Customers, ...
 *   - up and down move the lit row, Enter opens it, Escape closes
 *   - an empty answer and a failed one each say so in words
 *
 *   node scripts/check-app-search.mjs
 *   SHOTS_DIR=/some/dir node scripts/check-app-search.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const stubs = join(root, ".app-search-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-search-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** What a person does to replace a search: select what is there, type over it. */
const retype = async (p, text) => {
  await p.$eval("[data-app-search] input", (el) => el.select())
  await p.keyboard.press("Backspace")
  await p.type("[data-app-search] input", text)
}

try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/app"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`,
  )
  execFileSync(
    "npx",
    [
      "esbuild", "scripts/render-app-search.tsx", "--bundle", "--format=iife", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"', "--alias:@=.",
      "--banner:js=var process={env:{NODE_ENV:'production'}};",
      "--alias:next/navigation=./.app-search-probe/navigation.js", "--alias:next/link=./.app-search-probe/link.jsx",
      `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(
    join(stubs, "index.html"),
    `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const viewports = [
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop-1440", { width: 1440, height: 900 }],
  ]
  for (const [label, vp] of viewports) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    await p.goto(`file://${join(stubs, "index.html")}`)
    /* Round 42: what was opened is kept in this browser (Recent); each width starts with none. */
    await p.evaluate(() => { try { localStorage.clear() } catch {} })
    await sleep(300)
    if (errors.length) fail(`The page threw: ${errors[0]}`)

    const closed = await p.evaluate(() => {
      const panel = document.querySelector("[data-app-search]")
      return { visible: getComputedStyle(panel).visibility, open: panel.hasAttribute("data-open") }
    })
    expect(closed.visible === "hidden" && !closed.open, "closed until asked, and hidden from focus while closed", closed)

    if (phone) await p.tap("[data-phone-search]")
    else await p.click("#app button[aria-label=Search]")
    await sleep(320)
    const opened = await p.evaluate(() => {
      const panel = document.querySelector("[data-app-search]")
      const b = panel.getBoundingClientRect()
      const input = panel.querySelector("input")
      const ib = input.getBoundingClientRect()
      const cancel = [...panel.querySelectorAll("button")].find((x) => x.textContent.trim() === "Cancel")
      return {
        box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
        focused: document.activeElement === input,
        font: getComputedStyle(input).fontSize,
        inputH: Math.round(ib.height),
        cancelH: cancel && cancel.getBoundingClientRect().height ? Math.round(cancel.getBoundingClientRect().height) : 0,
        go: [...panel.querySelectorAll("[role=option]")].map((o) => o.querySelector("p").textContent.trim()),
      }
    })
    expect(opened.focused, "the field has the focus as it opens", opened.focused)
    expect(opened.go.join("|") === "Dashboard|Orders|Products|Analytics|Emails|Settings", "an empty search offers the places people go most", opened.go)
    if (phone) {
      expect(opened.box.join() === "0,0,390,844", "a phone: the whole screen", opened.box)
      expect(opened.font === "16px" && opened.inputH >= 44, "a 16px field, 44px or taller, so iOS does not zoom", { font: opened.font, h: opened.inputH })
      expect(opened.cancelH >= 44, "Cancel is a 44px target", opened.cancelH)
    } else {
      expect(opened.box[1] === 10 && opened.box[2] === 600 && Math.abs(opened.box[0] + opened.box[2] / 2 - 720) <= 1, "a computer: 600px wide, centred, dropped from the header bar", opened.box)
    }

    /* Typing: one request per pause. */
    await p.type("[data-app-search] input", "jane", { delay: 40 })
    await sleep(450)
    const asked = await p.evaluate(() => window.__asked.slice())
    expect(asked.length === 1 && asked[0] === "jane", "four letters typed, one question asked", asked)
    const grouped = await p.evaluate(() =>
      [...document.querySelectorAll("#app-search-list [role=group]")].map((g) => ({
        label: g.querySelector("p").textContent.trim(),
        rows: [...g.querySelectorAll("[role=option]")].map((o) => ({ text: o.querySelector("p").textContent.trim(), h: Math.round(o.getBoundingClientRect().height) })),
      })),
    )
    expect(grouped.map((g) => g.label).join("|") === "Orders|Customers|Emails", "grouped: Orders, then Customers, then Emails", grouped.map((g) => g.label))
    expect(grouped[0]?.rows[0]?.text === "Order #1043", "the newest order first", grouped[0]?.rows[0])
    const rowMin = Math.min(...grouped.flatMap((g) => g.rows.map((r) => r.h)))
    expect(rowMin >= (phone ? 48 : 44), `rows at least ${phone ? 48 : 44}px tall`, rowMin)
    const sideways = await p.evaluate(() => {
      const list = document.querySelector("#app-search-list")
      return { list: list.scrollWidth - list.clientWidth, page: document.documentElement.scrollWidth - window.innerWidth }
    })
    expect(sideways.list === 0 && sideways.page === 0, "nothing scrolls sideways", sideways)
    await p.screenshot({ path: join(shots, `${label}-search-jane.png`) })

    /* Keys. */
    const lit = () => p.evaluate(() => document.querySelector("#app-search-list [aria-selected=true]")?.querySelector("p").textContent.trim())
    expect((await lit()) === "Order #1043", "the first result is lit", await lit())
    await p.keyboard.press("ArrowDown")
    await p.keyboard.press("ArrowDown")
    const third = await lit()
    const active = await p.evaluate(() => {
      const input = document.querySelector("[data-app-search] input")
      const id = input.getAttribute("aria-activedescendant")
      return document.getElementById(id)?.querySelector("p").textContent.trim()
    })
    expect(third === "Jane Doe" && active === third, "down twice lights the third, and the field says which", { third, active })
    await p.keyboard.press("ArrowUp")
    expect((await lit()) === "Order #1012", "up goes back one", await lit())
    await p.keyboard.press("ArrowDown")
    await p.keyboard.press("Enter")
    await sleep(80)
    const pushed = await p.evaluate(() => (window.__router || []).filter(([k]) => k === "push").map(([, h]) => h))
    expect(pushed.at(-1) === "/app/orders?range=all_time&q=jane%40example.com", "Enter opens the lit customer's orders", pushed)
    const afterEnter = await p.evaluate(() => document.querySelector("[data-app-search]").hasAttribute("data-open"))
    expect(!afterEnter, "and the search closes behind it", afterEnter)

    /* An order number, and Enter before the answer. */
    if (phone) await p.tap("[data-phone-search]")
    else await p.keyboard.down("Control"), await p.keyboard.press("k"), await p.keyboard.up("Control")
    await sleep(250)
    const reopened = await p.evaluate(() => ({ open: document.querySelector("[data-app-search]").hasAttribute("data-open"), value: document.querySelector("[data-app-search] input").value }))
    expect(reopened.open && reopened.value === "", phone ? "opens again, empty" : "Ctrl and K opens it again, empty", reopened)
    /* Round 42: the customer opened a moment ago is offered first, under Recent, above Go to. */
    const recentRows = await p.evaluate(() => ({ heads: [...document.querySelectorAll("#app-search-list [role=group] > p")].map((x) => x.textContent.trim()), first: document.querySelector("#app-search-list [role=option] p")?.textContent.trim() }))
    expect(recentRows.heads.join("|") === "Recent|Go to" && recentRows.first === "Jane Doe", "what was opened last is offered first, under Recent", recentRows)
    await p.type("[data-app-search] input", "#1043")
    await p.keyboard.press("Enter")
    await sleep(450)
    const pushed2 = await p.evaluate(() => (window.__router || []).filter(([k]) => k === "push").map(([, h]) => h))
    expect(pushed2.at(-1) === "/app/orders?order=o3", "Enter pressed before the answer opens the order when it comes", pushed2.at(-1))

    /* A slow answer overtaken by a quicker one. */
    if (phone) await p.tap("[data-phone-search]")
    else await p.click("#app button[aria-label=Search]")
    await sleep(250)
    await p.type("[data-app-search] input", "slowly")
    await sleep(320)
    await p.keyboard.press("Backspace")
    await p.keyboard.press("Backspace")
    await sleep(1000)
    const race = await p.evaluate(() => ({
      aborted: window.__aborted.slice(),
      rows: [...document.querySelectorAll("#app-search-list [role=option]")].map((o) => o.querySelector("p").textContent.trim()),
    }))
    expect(race.aborted.includes("slowly"), "the older request is cancelled", race.aborted)
    expect(race.rows.includes("Slow cooker guide") && !race.rows.includes("STALE ANSWER"), "and its answer never shows", race.rows)

    /* Pages and data together, pages first. */
    await retype(p, "launch")
    await sleep(450)
    const labels = await p.evaluate(() => [...document.querySelectorAll("#app-search-list [role=group] > p")].map((x) => x.textContent.trim()))
    expect(labels.join("|") === "Products|Emails|Automations", "products, emails and automations each under their name", labels)

    /* Nothing found, and a failure. */
    await retype(p, "zzqx")
    await sleep(450)
    const empty = await p.evaluate(() => document.querySelector("[data-search-empty]")?.textContent.trim())
    expect(/^No results for “zzqx”/.test(empty || ""), "an empty answer says so", empty)
    await p.screenshot({ path: join(shots, `${label}-search-empty.png`) })
    await retype(p, "boom")
    await sleep(450)
    const alert = await p.evaluate(() => {
      const a = document.querySelector("#app-search-list [role=alert]")
      return a && { text: a.querySelector("p").textContent.trim(), retry: !!a.querySelector("button") }
    })
    expect(alert?.text === "Search is not working right now." && alert.retry, "a failure says so, with Try again", alert)
    await p.screenshot({ path: join(shots, `${label}-search-error.png`) })
    const before = await p.evaluate(() => window.__asked.length)
    await p.evaluate(() => [...document.querySelectorAll("#app-search-list [role=alert] button")][0].click())
    await sleep(400)
    const after = await p.evaluate(() => window.__asked.length)
    expect(after === before + 1, "Try again asks again", { before, after })

    await p.keyboard.press("Escape")
    await sleep(250)
    const esc = await p.evaluate(() => ({ open: document.querySelector("[data-app-search]").hasAttribute("data-open"), vis: getComputedStyle(document.querySelector("[data-app-search]")).visibility }))
    expect(!esc.open && esc.vis === "hidden", "Escape closes it", esc)

    if (errors.length) expect(false, "no errors in the page", errors)
    await p.close()
  }
  await browser.close()
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed\n`)
  process.exit(1)
}
console.log("\nall checks passed\n")
