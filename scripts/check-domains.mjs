/**
 * ===========================================================================
 *  SETTINGS › DOMAINS, MEASURED
 * ===========================================================================
 * The Domains tab, rendered for real at a phone's width (390) and a
 * computer's (1280), in four states: a domain waiting for DNS, one being
 * checked, one connected, and one whose check found something else in the
 * way. For each:
 *
 *   • nothing scrolls sideways;
 *   • the records table has its three records, every value there in full,
 *     and every copy button inside the screen, 44px square on a phone;
 *   • the chooser offers the website, the creator page and the OnePage;
 *   • "How custom domains work" is four short lines, none about /p/;
 *   • a failed check marks the record that is wrong, names what it saw,
 *     and lists the fix; a connected domain shows no DNS steps at all;
 *   • what a domain shows can be changed from its row.
 *
 *   PROBE_CSS=source node scripts/check-domains.mjs
 *
 * Screenshots go to SHOTS_DIR (named domains-*.png), or a temporary folder
 * that is printed.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = (await appCss(root)) + "\n" + interFaces(root)

const out = mkdtempSync(join(tmpdir(), "storelib-domains-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".domains-probe")
mkdirSync(stubs, { recursive: true })

let bundle
try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams("tab=domains")
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
  writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-domains-probe.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
  execFileSync(
    "npx",
    [
      "esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
      "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit" },
  )
  bundle = readFileSync(join(out, "probe.js"))
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/probe.js"></script></body></html>`

const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1280, height: 900, deviceScaleFactor: 1 }

async function open(viewport, fixture) {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.goto(`${origin}/?fixture=${fixture}`, { waitUntil: "load" })
  await p.waitForSelector("[data-domains-panel]")
  await p.waitForSelector("[data-domain-row]", { timeout: 5000 })
  await sleep(250)
  return p
}

const overflow = (p) => p.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth))

const tableFacts = (p) =>
  p.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const rows = [...document.querySelectorAll("[data-dns-record]")]
    const copies = [...document.querySelectorAll("[data-dns-copy]")].map((b) => {
      const r = b.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), left: Math.round(r.left) }
    })
    const cut = [...document.querySelectorAll("[data-dns-value]")].filter((v) => v.scrollWidth > v.clientWidth + 1).map((v) => v.textContent)
    const values = [...document.querySelectorAll("[data-dns-value]")].map((v) => v.textContent)
    /* What a person sees in the row: innerText skips the parts hidden at this width. */
    const statuses = rows.map((r) => r.innerText.replace(/\s+/g, " ").trim())
    return { vw, types: rows.map((r) => r.getAttribute("data-dns-record")), copies, cut, values, statuses }
  })

const chooser = (p) =>
  p.evaluate(() => {
    const g = document.querySelector("[data-target-choice]")
    if (!g) return null
    const radios = [...g.querySelectorAll("[role=radio]")]
    return {
      labels: radios.map((r) => r.getAttribute("data-target")),
      checked: radios.filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.getAttribute("data-target")),
      minH: Math.min(...radios.map((r) => Math.round(r.getBoundingClientRect().height))),
    }
  })

const how = (p) =>
  p.evaluate(() => {
    const dl = document.querySelector("[data-how-it-works]")
    return { rows: dl ? dl.children.length : 0, text: dl?.textContent ?? "", words: (dl?.textContent ?? "").split(/\s+/).filter(Boolean).length }
  })

for (const [label, viewport] of [["390", PHONE], ["1280", DESK]]) {
  console.log(`\n${label} wide`)
  const phone = label === "390"

  /* ── Waiting for DNS ─────────────────────────────────────────────── */
  {
    const p = await open(viewport, "pending")
    expect((await overflow(p)) === 0, "pending: nothing scrolls sideways", await overflow(p))
    const t = await tableFacts(p)
    expect(JSON.stringify(t.types) === JSON.stringify(["A", "CNAME", "TXT"]), "the records table has A, CNAME and TXT", t.types)
    expect(t.cut.length === 0, "every value is there in full, to type by hand if need be", t.cut)
    expect(t.copies.length >= 5 && t.copies.every((c) => c.right <= t.vw - 16 && c.left >= 16), "every copy button is inside the page's gutter", t.copies.map((c) => c.right))
    if (phone) expect(t.copies.every((c) => c.w >= 44 && c.h >= 44), "copy buttons are 44px on a phone", t.copies.map((c) => `${c.w}x${c.h}`))
    else expect(t.copies.every((c) => c.w === 32 && c.h === 32), "and 32px on a computer", t.copies.map((c) => `${c.w}x${c.h}`))
    expect(t.statuses.every((s) => /Not checked/.test(s)), "before a check each record says not checked", t.statuses)
    const c = await chooser(p)
    expect(c && JSON.stringify(c.labels) === JSON.stringify(["website", "creator_page", "onepage"]), "the chooser offers website, creator page and OnePage", c?.labels)
    if (phone) expect(c.minH >= 44, "each choice is at least a thumb tall", c.minH)
    const h = await how(p)
    expect(h.rows === 4 && !/\/p\//.test(h.text) && h.words <= 60, "How custom domains work is four short lines, none about /p/", `${h.rows} rows, ${h.words} words`)
    expect(/www\.marastudio\.com/.test(h.text) && /Sends visitors to www\.marastudio\.com/.test(h.text), "it says www is the address and the bare domain redirects to it")
    const picker = await p.evaluate(() => {
      const s = document.querySelector("[data-dns-setup] select")
      s.value = "porkbun"
      s.dispatchEvent(new Event("change", { bubbles: true }))
      return true
    })
    await sleep(150)
    const porkbun = await p.evaluate(() => document.querySelector("[data-dns-record='A']").textContent)
    expect(picker && /Leave empty/.test(porkbun), "choosing Porkbun rewrites @ as leave empty", porkbun.slice(0, 60))
    await p.evaluate(() => {
      const s = document.querySelector("[data-dns-setup] select")
      s.value = "godaddy"
      s.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await sleep(120)
    const link = await p.evaluate(() => [...document.querySelectorAll("[data-dns-setup] a")].map((a) => a.href))
    expect(link.some((h) => h.includes("dcc.godaddy.com") && h.includes("marastudio.com")), "GoDaddy's link opens its DNS page for this domain", link[0])
    await p.evaluate(() => document.querySelector("[data-dns-card]")?.scrollIntoView({ block: "start" }))
    await p.screenshot({ path: join(shots, `domains-pending-${label}.png`), fullPage: true })
    await p.close()
  }

  /* ── Being checked ───────────────────────────────────────────────── */
  {
    const p = await open(viewport, "verifying")
    const pill = await p.evaluate(() => document.querySelector("[data-domain-row]").textContent)
    expect(/Verifying/.test(pill), "verifying: the row says so", pill.slice(0, 80))
    expect((await overflow(p)) === 0, "and nothing scrolls sideways", await overflow(p))
    await p.screenshot({ path: join(shots, `domains-verifying-${label}.png`), fullPage: true })
    await p.close()
  }

  /* ── A check that found something in the way ─────────────────────── */
  {
    const p = await open(viewport, "conflict")
    await p.evaluate(() => [...document.querySelectorAll("[data-dns-setup] button")].find((b) => b.textContent.trim() === "Check DNS").click())
    await p.waitForSelector("[data-dns-trouble]", { timeout: 3000 }).catch(() => null)
    await sleep(150)
    const t = await tableFacts(p)
    expect(/Conflicting record/.test(t.statuses[0]) && /192\.0\.2\.10/.test(t.statuses[0]), "the A record is marked, naming the old address it saw", t.statuses[0])
    expect(/Conflicting record/.test(t.statuses[1]) && /parkingpage\.namecheap\.com/.test(t.statuses[1]), "and www, naming the parking page", t.statuses[1])
    expect(/Not found yet/.test(t.statuses[2]), "the TXT is not found yet", t.statuses[2])
    const trouble = await p.evaluate(() => document.querySelector("[data-dns-trouble]")?.textContent ?? "")
    expect(/Remove the old A record 192\.0\.2\.10/.test(trouble) && /parking page/.test(trouble), "the fix names exactly what to remove", trouble.slice(0, 120))
    expect(!/—/.test(trouble), "in plain words, no em dash")
    expect((await overflow(p)) === 0, "and nothing scrolls sideways with it open", await overflow(p))
    await p.evaluate(() => document.querySelector("[data-dns-card]")?.scrollIntoView({ block: "start" }))
    await p.screenshot({ path: join(shots, `domains-conflict-${label}.png`), fullPage: !phone })
    if (phone) await p.screenshot({ path: join(shots, `domains-conflict-${label}-full.png`), fullPage: true })
    await p.close()
  }

  /* ── Connected ───────────────────────────────────────────────────── */
  {
    const p = await open(viewport, "connected")
    const facts = await p.evaluate(() => ({
      dns: document.querySelectorAll("[data-dns-setup]").length,
      row: document.querySelector("[data-domain-row]").textContent,
      how: document.querySelector("[data-how-it-works]").textContent,
    }))
    expect(facts.dns === 0, "connected: no DNS steps are shown", facts.dns)
    expect(/Connected/.test(facts.row) && /Creator page/.test(facts.row), "the row says Connected and that it shows the creator page", facts.row.slice(0, 90))
    expect(/Your creator page, storelib\.com\/mara/.test(facts.how), "the explanation follows what the domain shows", facts.how.slice(0, 120))
    expect((await overflow(p)) === 0, "nothing scrolls sideways", await overflow(p))
    await p.screenshot({ path: join(shots, `domains-connected-${label}.png`), fullPage: true })

    /* Changing what it shows, from the row. */
    const trigger = await p.$("[data-domain-row] button[aria-label*='shows your']")
    const box = await trigger.boundingBox()
    if (phone) expect(Math.round(box.height) >= 44, "the Shows control is a thumb tall on a phone", Math.round(box.height))
    await trigger.click()
    await sleep(phone ? 500 : 250)
    const picked = await p.evaluate(() => {
      const item = [...document.querySelectorAll("[role=menuitem], [role=dialog] button, [role=dialog] a")].find((e) => e.textContent.trim() === "Website")
      if (!item) return false
      item.click()
      return true
    })
    await sleep(phone ? 700 : 300)
    const after = await p.evaluate(() => ({ calls: window.__domainCalls, row: document.querySelector("[data-domain-row]").textContent }))
    expect(picked && after.calls.includes("PATCH /api/domains") && /Website/.test(after.row), "choosing Website there saves it and the row says so", after.calls.filter((c) => c.startsWith("PATCH")))
    await p.close()
  }
}

const errs = await (async () => {
  const p = await open(DESK, "pending")
  const e = await p.evaluate(() => window.__errors)
  await p.close()
  return e
})()
expect(errs.length === 0, "no errors in the console", errs.slice(0, 3))

await browser.close()
server.close()
console.log(`\nscreenshots: ${shots}\n`)
if (broken) fail(`${broken} check${broken === 1 ? "" : "s"} failed.`)
console.log("Domains measured as asked.\n")
