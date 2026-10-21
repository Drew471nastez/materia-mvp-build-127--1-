/**
 * ===========================================================================
 *  SETTINGS › CHECKOUT › CHECKOUT TEXT, MEASURED
 * ===========================================================================
 * The editor's claims are claims about a browser, so they are checked in
 * one, at a phone's width (390), a small laptop's (1024) and a desktop's
 * (1440), with the real editor and the real preview frame
 * (scripts/render-checkout-editor.tsx):
 *
 *   • nothing scrolls sideways, in the editor or in the frame;
 *   • from 1024 the fields and the checkout sit side by side; on a phone the
 *     checkout is the screen and the fields come up in a sheet;
 *   • THE PREVIEW IS THE CHECKOUT: the frame's checkout and thank you page
 *     are held against the same pages drawn on their own (/real) for the
 *     same store: the same words, line for line, and the same elements;
 *   • a word typed shows in the frame's checkout, and how long it took;
 *   • words pressed in the frame open their field;
 *   • the text being edited is ringed in the frame;
 *   • "Buying for a business" is in the frame only when the store offers
 *     company invoices;
 *   • frame times while the page is switched, a sheet opens and words are
 *     typed, and which properties moved (transform and opacity only).
 *
 *   pnpm build && node scripts/check-checkout-editor.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-checkout-editor-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".checkout-editor-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(
  join(stubs, "navigation.js"),
  `export const usePathname = () => location.pathname
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const notFound = () => { throw new Error("not found") }
export const redirect = () => { throw new Error("redirect") }
`,
)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }\n`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
writeFileSync(join(stubs, "empty.js"), `export {}\n`)
writeFileSync(
  join(stubs, "browser.tsx"),
  `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-checkout-editor.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ").slice(0, 300)); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
boot((el) => createRoot(document.getElementById("app")).render(el))
`,
)
execFileSync(
  "npx",
  [
    "esbuild",
    join(stubs, "browser.tsx"),
    "--bundle",
    "--format=iife",
    `--outfile=${join(out, "probe.js")}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`,
    `--alias:next/navigation=${join(stubs, "navigation.js")}`,
    `--alias:next/image=${join(stubs, "image.jsx")}`,
    `--alias:server-only=${join(stubs, "empty.js")}`,
    `--alias:@=${root}`,
    "--loader:.jsx=jsx",
    "--loader:.css=empty",
    "--loader:.svg=dataurl",
    "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    "--log-level=error",
  ],
  { cwd: root, stdio: "inherit" },
)
const bundle = readFileSync(join(out, "probe.js"))
const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(bundle)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const notes = []
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const note = (what) => {
  notes.push(what)
  console.log(`  note  ${what}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] })

const VIEWPORTS = [
  ["phone 390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["laptop 1024", { width: 1024, height: 768 }],
  ["desktop 1440", { width: 1440, height: 900 }],
]

async function openEditor(viewport, query = "") {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.goto(`${origin}/app${query}`, { waitUntil: "load" })
  await p.waitForSelector("[data-checkout-preview-frame][data-drawn]", { timeout: 20000 })
  await sleep(500)
  const frame = p.frames().find((f) => f.url().includes("/checkout/preview"))
  return { p, frame }
}

/** What the checkout says and is made of: its text line by line, its element count, and its key pieces. */
const reading = () => {
  const root = document.querySelector("[data-site-checkout]") ?? document.querySelector("[data-page=checkout-thanks]")
  if (!root) return null
  const pick = (s) => [...root.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, " ").trim())
  return {
    lines: root.innerText.split("\n").map((l) => l.trim()).filter(Boolean),
    elements: root.querySelectorAll("*").length,
    tags: [...root.querySelectorAll("*")].map((e) => e.tagName).join(","),
    total: pick("[data-total]"),
    pay: pick("[data-pay]"),
    bar: pick("[data-checkout-bar]"),
    items: pick("[data-line-item] p:first-of-type"),
    business: !!document.getElementById("buying-for-business"),
  }
}

/** The page on its own at the frame's own size, read the same way. */
async function realReading(width, height, query) {
  const p = await browser.newPage()
  await p.setViewport({ width, height, deviceScaleFactor: 1 })
  await p.goto(`${origin}/real?${query}`, { waitUntil: "load" })
  await p.waitForSelector("[data-site-checkout], [data-page=checkout-thanks]")
  await sleep(1500)
  const r = await p.evaluate(reading)
  await p.close()
  return r
}

function same(a, b) {
  if (!a || !b) return { ok: false, why: "missing" }
  const diff = a.lines.filter((l, i) => b.lines[i] !== l).slice(0, 4)
  const ok = a.lines.length === b.lines.length && diff.length === 0 && a.elements === b.elements && a.tags === b.tags
  return { ok, why: ok ? `${a.lines.length} lines, ${a.elements} elements` : { lines: [a.lines.length, b.lines.length], elements: [a.elements, b.elements], firstDiff: diff, other: diff.map((l) => b.lines[a.lines.indexOf(l)]) } }
}

/** Frame intervals on the editor's page while `run` happens, and every property a transition moved. */
async function frames(p, run, ms = 900) {
  await p.evaluate(() => {
    window.__deltas = []
    window.__moved = new Set()
    let last = performance.now()
    const tick = (t) => {
      window.__deltas.push(t - last)
      last = t
      if (window.__rec) requestAnimationFrame(tick)
    }
    window.__rec = true
    requestAnimationFrame(tick)
    const note = (e) => {
      const el = e.target
      const where = el.closest?.("[data-preview-segments]") ? "segments" : el.closest?.("[data-sheet-panel]") || el.matches?.("[data-sheet-panel]") ? "sheet" : el.matches?.("[data-checkout-preview-frame]") ? "frame" : null
      if (where) window.__moved.add(`${where}:${e.propertyName}`)
    }
    document.addEventListener("transitionrun", note, true)
    window.__stopMoved = () => document.removeEventListener("transitionrun", note, true)
  })
  await run()
  await sleep(ms)
  return p.evaluate(() => {
    window.__rec = false
    window.__stopMoved()
    const d = window.__deltas.slice(1).sort((a, b) => a - b)
    const q = (x) => Math.round(d[Math.min(d.length - 1, Math.floor(d.length * x))] * 10) / 10
    const anims = document.getAnimations().map((a) => (a.effect?.getKeyframes?.() ?? []).flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x)))).flat()
    return { frames: d.length, p50: q(0.5), p95: q(0.95), max: Math.round(d[d.length - 1] ?? 0), over25: d.filter((x) => x > 25).length, moved: [...window.__moved, ...new Set(anims.map((a) => `animation:${a}`))] }
  })
}
const onlyCheap = (moved) => moved.every((m) => /:(transform|opacity|translate|scale)$/.test(m))

for (const [label, vp] of VIEWPORTS) {
  console.log(`\n${label}`)
  const phone = vp.width < 1024
  const { p, frame } = await openEditor(vp)
  expect(!!frame, "the preview frame is there and drew")
  const side = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(side <= 0, "nothing scrolls sideways in the editor", side)
  const frameSide = await frame.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(frameSide <= 0, "nothing scrolls sideways in the frame", frameSide)
  const layout = await p.evaluate(() => document.querySelector("[data-checkout-text-layout]")?.getAttribute("data-checkout-text-layout"))
  expect(layout === (phone ? "phone" : "side"), phone ? "on a phone the checkout is the screen" : "the fields and the checkout side by side", layout)
  if (!phone) {
    const cols = await p.evaluate(() => {
      const a = document.querySelector("[data-checkout-text-list]").getBoundingClientRect()
      const b = document.querySelector("[data-checkout-text-preview]").getBoundingClientRect()
      return { listRight: Math.round(a.right), previewLeft: Math.round(b.left), previewWidth: Math.round(b.width) }
    })
    expect(cols.listRight <= cols.previewLeft + 1 && cols.previewWidth >= 420, "  the list on the left, the checkout on the right", cols)
  }
  const size = await frame.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  console.log(`        the frame is ${size.w} × ${size.h}`)

  /* ── The preview is the checkout ── */
  const mode = await frame.evaluate(() => (document.querySelector("[data-site-checkout]") && document.body.innerText.includes("Shipping method") ? "shipped" : "digital"))
  const framed = await frame.evaluate(reading)
  const real = await realReading(size.w, size.h, `mode=${mode}`)
  const s1 = same(framed, real)
  expect(s1.ok, `the ${mode} checkout in the frame is the website's checkout, line for line and element for element`, s1.why)
  expect(JSON.stringify([framed?.total, framed?.pay, framed?.bar, framed?.items]) === JSON.stringify([real?.total, real?.pay, real?.bar, real?.items]), "  the same total, Pay, shop bar and lines", { frame: [framed?.total, framed?.pay, framed?.items], real: [real?.total, real?.pay, real?.items] })
  expect(framed && !framed.business, "  no Buying for a business: the store hasn't turned on company invoices")

  /* ── Typing shows in the checkout ── */
  let typedAt = 0
  if (phone) {
    /* Words pressed in the frame: the Pay button's. */
    await frame.evaluate(() => document.querySelector("[data-pay]").click())
    await p.waitForSelector("[data-checkout-text-sheet=one] input", { timeout: 4000 }).catch(() => null)
    await sleep(450)
    const opened = await p.evaluate(() => document.activeElement?.id)
    expect(opened === "ct-buttons.pay_amount", "pressing Pay in the checkout opens its field in a sheet, ready to type", opened)
  } else {
    await frame.evaluate(() => [...document.querySelectorAll("h2, h3, p, span")].find((e) => e.textContent.trim() === "Shipping method" || e.textContent.trim() === "Contact information")?.click())
    await sleep(200)
    const picked = await p.evaluate(() => document.activeElement?.id)
    expect(picked === "ct-delivery.method" || picked === "ct-contact.heading", "pressing a heading in the checkout focuses its field", picked)
    await p.focus("#ct-buttons\\.pay_amount")
  }
  const typing = await frames(p, async () => {
    typedAt = Date.now()
    await p.keyboard.type("Buy now {amount}", { delay: 25 })
  }, 300)
  const seenAfter = await frame
    .waitForFunction(() => document.querySelector("[data-pay]")?.textContent.startsWith("Buy now"), { timeout: 3000 })
    .then(() => Date.now() - typedAt)
    .catch(() => null)
  expect(seenAfter !== null, "what is typed is on the checkout's Pay button", seenAfter === null ? "never" : `${seenAfter} ms after the first key, typing 16 keys`)
  console.log(`        while typing: ${typing.frames} frames, p50 ${typing.p50} ms, p95 ${typing.p95} ms, max ${typing.max} ms, ${typing.over25} over 25 ms`)
  const ringed = await frame.evaluate(() => {
    const r = document.querySelector('[data-preview-layer="focus"]')
    const pay = document.querySelector("[data-pay]")
    if (!r || !pay) return null
    const a = r.getBoundingClientRect()
    const b = pay.getBoundingClientRect()
    return { opacity: getComputedStyle(r).opacity, around: a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom }
  })
  expect(ringed?.opacity === "1" && ringed.around, "the text being edited is ringed in the checkout", ringed)
  const framed2 = await frame.evaluate(reading)
  const real2 = await realReading(size.w, size.h, `mode=${mode}&pay=${encodeURIComponent("Buy now {amount}")}`)
  const s2 = same(framed2, real2)
  expect(s2.ok, "  and the checkout reads as the real one does with those words", s2.why)

  /* ── Another page ── */
  if (phone) await p.evaluate(() => document.activeElement?.blur())
  if (phone) await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Done")?.click())
  await sleep(500)
  const switching = await frames(p, async () => {
    await p.evaluate(() => [...document.querySelectorAll("[data-preview-segments=Page] button")].find((b) => b.textContent.trim() === "Thank you").click())
  })
  await frame.waitForSelector("[data-page=checkout-thanks]", { timeout: 3000 }).catch(() => null)
  await sleep(300)
  const thanks = await frame.evaluate(reading)
  const realThanks = await realReading(size.w, size.h, `mode=${mode}&view=thanks`)
  const s3 = same(thanks, realThanks)
  expect(s3.ok, "the thank you page in the frame is the website's own", s3.why)
  console.log(`        switching page: ${switching.frames} frames, p50 ${switching.p50} ms, p95 ${switching.p95} ms, max ${switching.max} ms, ${switching.over25} over 25 ms; moved ${switching.moved.join(", ") || "nothing"}`)
  expect(onlyCheap(switching.moved), "  the switch moves only transform and opacity", switching.moved)

  if (phone) {
    const sheet = await frames(p, async () => {
      await p.click("[data-checkout-text-all]")
    }, 700)
    const up = await p.evaluate(() => !!document.querySelector("[data-checkout-text-sheet=all]"))
    expect(up, "All texts opens every field in a sheet over the checkout")
    console.log(`        the sheet opening: ${sheet.frames} frames, p50 ${sheet.p50} ms, p95 ${sheet.p95} ms, max ${sheet.max} ms, ${sheet.over25} over 25 ms; moved ${sheet.moved.join(", ") || "nothing"}`)
    expect(onlyCheap(sheet.moved), "  it moves only transform and opacity", sheet.moved)
    const inside = await p.evaluate(() => {
      const s = document.querySelector("[data-checkout-text-sheet=all]")
      return s ? s.scrollWidth - s.clientWidth : null
    })
    expect(inside !== null && inside <= 0, "  nothing in it scrolls sideways", inside)
    await p.screenshot({ path: join(shots, `editor-${vp.width}-sheet.png`) })
    await p.keyboard.press("Escape")
    await sleep(500)
  }
  await p.evaluate(() => [...document.querySelectorAll("[data-preview-segments=Page] button")].find((b) => b.textContent.trim() === "Checkout").click())
  await sleep(600)
  await p.screenshot({ path: join(shots, `editor-${vp.width}.png`) })

  /* ── A message shown the way a buyer sees it ── */
  if (!phone) {
    await p.focus("#ct-messages\\.email_invalid")
    const said = await frame.waitForFunction(() => document.body.innerText.includes("Enter a valid email address."), { timeout: 5000 }).then(() => true).catch(() => false)
    const payReady = await frame.evaluate(() => !document.querySelector("[data-pay]")?.disabled)
    if (said) expect(true, "the email message is shown under the email field, by pressing Pay as a buyer would")
    else if (!payReady) note(`${label}: Stripe.js cannot load here, so Pay stays off and the email message is not pressed for (the editor then says nothing either way)`)
    else expect(false, "the email message is shown under the email field")
    const absent = await p.evaluate(() => !!document.querySelector("[data-text-row='messages.email_invalid'] [data-text-absent]"))
    expect(said || !absent, "  and is never called absent when Pay could not be pressed", absent)
  }

  const errors = await p.evaluate(() => window.__errors)
  const frameErrors = await frame.evaluate(() => window.__errors ?? [])
  const counts = (e) => !/stripe|Failed to load resource|ERR_|net::/i.test(e)
  expect(errors.filter(counts).length === 0 && frameErrors.filter(counts).length === 0, "no errors in the console", [...errors, ...frameErrors].filter(counts).slice(0, 4))
  await p.close()
}

console.log("\nCompany invoices on")
{
  const { p, frame } = await openEditor({ width: 1440, height: 900 }, "?business=1")
  const has = await frame.evaluate(() => !!document.getElementById("buying-for-business"))
  expect(has, "Buying for a business is on the frame's checkout when the store offers company invoices")
  await frame.evaluate(() => document.getElementById("buying-for-business").click())
  await sleep(400)
  const fields = await frame.evaluate(() => Math.round(document.getElementById("business-company")?.getBoundingClientRect().height ?? 0))
  expect(fields >= 40, "  and it opens the company fields there", fields)
  await p.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots: ${shots}`)
if (notes.length) console.log(`${notes.length} note${notes.length === 1 ? "" : "s"} above`)
console.log(broken ? `\n${broken} check${broken === 1 ? "" : "s"} failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
