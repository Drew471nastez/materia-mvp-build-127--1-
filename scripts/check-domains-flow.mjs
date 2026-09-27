/**
 * ===========================================================================
 *  SETTINGS › DOMAINS: THE TAB GROWS WITH THE DOMAIN
 * ===========================================================================
 * "The DNS setup instructions and how custom domain works should not appear
 * if I didn't start adding my domain. The Connect to should appear after I
 * add my domain."
 *
 * components/app/settings/domains-panel.tsx drawn on its own, this checkout
 * (`after`) beside the commit it started from (`before`, BEFORE=<commit>,
 * default HEAD when the file is changed in the worktree, else HEAD~1), at 390
 * and 1280, in three states:
 *
 *   empty       nothing added
 *   pending     one domain added, its DNS not done
 *   connected   the same domain, connected
 *
 * For each: which sections are on screen (the add field, the list, records,
 * the connect-to choice, the How it works explainer, Help), the words on
 * screen, sideways overflow, and every control's size. Then, on `after`, the
 * real flow (type, Add, Check, DNS records) with the height and opacity of
 * each section sampled every frame as it comes and goes, and once more under
 * prefers-reduced-motion. Sideways overflow is also read at 320 and 430.
 *
 *   PROBE_CSS=source node scripts/check-domains-flow.mjs
 *   SHOTS_DIR=... keeps the pictures (domains-flow-<version>-<width>-<state>.png)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-domains-flow-")), "shots")
mkdirSync(shots, { recursive: true })
const PANEL = "components/app/settings/domains-panel.tsx"

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return null
  }
}
const dirty = (git(["status", "--porcelain", PANEL]) ?? "").trim().length > 0
const BEFORE = process.env.BEFORE || (dirty ? "HEAD" : "HEAD~1")

const dir = join(root, ".domains-flow-probe")
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
try {
  writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
  writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
  const mount = (panel) => `import { useState } from "react"
import { createRoot } from "react-dom/client"
import { DomainsPanel } from "${panel}"
function App() {
  const [data, setData] = useState(window.__fixture.data)
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 lg:px-8" data-settings-panel="domains">
        <DomainsPanel data={data} loading={false} onData={setData} websiteAddress="maralind.storelib.com" creatorPageAddress="storelib.com/maralind" handle="maralind" locked={window.__fixture.free} planLoading={false} />
      </div>
    </div>
  )
}
createRoot(document.getElementById("app")).render(<App />)
setTimeout(() => { window.__ran = true }, 50)
`
  const before = git(["show", `${BEFORE}:${PANEL}`])
  const versions = { after: mount(`@/${PANEL.replace(/\.tsx$/, "")}`) }
  if (before) {
    writeFileSync(join(dir, "before-panel.tsx"), before)
    versions.before = mount("./before-panel")
  }
  var scripts = {}
  for (const [name, entry] of Object.entries(versions)) {
    writeFileSync(join(dir, `entry-${name}.tsx`), entry)
    try {
      execFileSync("pnpm", ["exec", "esbuild", join(dir, `entry-${name}.tsx`),
        "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, `${name}.js`)}`,
        '--define:process.env.NODE_ENV="production"',
        `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
        `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
        { stdio: ["ignore", "ignore", "inherit"] })
      scripts[name] = readFileSync(join(dir, `${name}.js`), "utf8")
    } catch {
      console.log(`  (${name} did not bundle: it is left out)`)
    }
  }
  const sheet = join(dir, "probe.css")
  writeFileSync(sheet, `${readFileSync(join(root, "app/globals.css"), "utf8")}\n@source "../.domains-flow-probe/before-panel.tsx";\n@source "../.domains-flow-probe/entry-after.tsx";\n`)
  var css = `${await appCss(root, sheet)}\n${interFaces(root).replace(/url\(file:\/\//g, "url(/__font?p=")}`
} finally {
  rmSync(dir, { recursive: true, force: true })
}
if (!scripts.after) fail("this checkout's panel did not bundle")

/* ── The fixture and the API it talks to ───────────────────────────────── */
const RECORDS = [{ type: "A", name: "@", value: "216.150.1.1" }, { type: "CNAME", name: "www", value: "domains.storelib.com" }, { type: "TXT", name: "_vercel", value: "vc-domain-verify=maralind.com,7f3c9a1d2e4b6f8a0c1e3d5b7a9f2c4e6d8b0a1c" }]
const domainIn = (status) => ({ id: "d1", domain: "maralind.com", purpose: "website", is_primary: true, status, ssl_status: status === "active" ? "active" : "pending", created_at: "2026-09-20T10:00:00Z", host: "www.maralind.com", apex: true, records: RECORDS })
const listOf = (domains) => ({ domains, schema: "current", purposes: ["website", "creator_page"], primary: { website: domains.some((d) => d.status === "active") ? "www.maralind.com" : null, creator_page: null } })
const initial = { empty: () => [], pending: () => [domainIn("pending")], connected: () => [domainIn("active")] }
const stores = new Map()

const pageOf = (script, state, free) => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__fixture={data:${JSON.stringify(listOf(initial[state]()))},free:${free}};window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script><script>${script}</script></body></html>`

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.pathname === "/__font") {
    const file = u.searchParams.get("p") || ""
    if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(file) || !existsSync(file)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": "font/woff2" }); res.end(readFileSync(file)); return
  }
  const ref = req.headers.referer ? new URL(req.headers.referer).searchParams : u.searchParams
  const sid = ref.get("sid") || "x"
  if (u.pathname.startsWith("/api/")) {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const sent = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "null") : null
      const store = stores.get(sid) ?? []
      let body = {}
      if (u.pathname === "/api/domains/verify") {
        const answer = ref.get("verify") || "active"
        if (answer === "active") {
          for (const d of store) d.status = "active"
          body = { verified: true, status: "active", message: "Connected", records: RECORDS, checks: RECORDS.map((r) => ({ type: r.type, name: r.name, state: "found", seen: [] })), fixes: [] }
        } else {
          body = { verified: false, status: "pending", message: "The records are not showing yet.", records: RECORDS, checks: [{ type: "A", name: "@", state: "conflict", seen: ["34.120.5.9"] }, { type: "CNAME", name: "www", state: "missing", seen: [] }, { type: "TXT", name: "_vercel", state: "missing", seen: [] }], fixes: ["Delete the A record 34.120.5.9 on @. Only 216.150.1.1 should be there."] }
        }
      } else if (u.pathname === "/api/domains" && req.method === "POST") {
        const d = { ...domainIn("pending"), domain: sent?.domain || "maralind.com", purpose: sent?.purpose || "website" }
        store.unshift(d)
        body = { domain: d }
      } else if (u.pathname === "/api/domains" && req.method === "PATCH") {
        const d = store.find((x) => x.id === sent?.domainId)
        if (d && sent?.action === "set_purpose") d.purpose = sent.purpose
        body = listOf(store)
      } else if (u.pathname === "/api/domains") body = listOf(store)
      stores.set(sid, store)
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 40)
    })
    return
  }
  const which = u.searchParams.get("v") || "after"
  const state = u.searchParams.get("state") || "empty"
  if (!scripts[which]) { res.writeHead(404); res.end(); return }
  stores.set(sid, initial[state]())
  res.writeHead(200, { "content-type": "text/html" }); res.end(pageOf(scripts[which], state, u.searchParams.get("plan") === "free"))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"], headless: true })
let sids = 0
const open = async (which, state, width, { reduced = false, verify = "active", plan = "pro" } = {}) => {
  const p = await browser.newPage()
  const phone = width < 640
  await p.setViewport(phone ? { width, height: 1400, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width, height: 1400, deviceScaleFactor: 1 })
  if (reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await p.goto(`${base}/?v=${which}&state=${state}&sid=s${++sids}&verify=${verify}&plan=${plan}`, { waitUntil: "load" })
  await p.waitForFunction("window.__ran === true", { timeout: 15000 })
  await p.evaluate(() => document.fonts.ready)
  await wait(400)
  await p.evaluate(() => {
    window.__sample = (sel, ms) => new Promise((resolve) => {
      const out = []
      const t0 = performance.now()
      const tick = () => {
        const el = document.querySelector(sel)
        const r = el?.getBoundingClientRect()
        out.push({ t: Math.round(performance.now() - t0), h: r ? Math.round(r.height) : null, o: el ? Math.round(Number(getComputedStyle(el).opacity) * 100) / 100 : null })
        if (performance.now() - t0 < ms) requestAnimationFrame(tick)
        else resolve(out)
      }
      requestAnimationFrame(tick)
    })
  })
  return p
}

/** What is on screen in the panel. Something inside a closed section counts as gone. */
const read = (p, width) => p.evaluate((width) => {
  const panel = document.querySelector("[data-domains-panel]")
  const shown = (el) => {
    if (!el || !el.getClientRects().length) return false
    if (el.closest("[inert]")) return false
    const r = el.getBoundingClientRect()
    if (r.height < 1) return false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (Number(cs.opacity) === 0) return false
      if (cs.overflow !== "visible" && a.getBoundingClientRect().height < 1) return false
    }
    return true
  }
  const any = (sel) => [...panel.querySelectorAll(sel)].some(shown)
  const text = panel.innerText
  const sections = {
    add: shown(panel.querySelector("#domains-new")),
    list: any("[data-domains-list]"),
    records: any("[data-dns-record]"),
    connectTo: any('[role="radiogroup"]'),
    explainer: /How Custom Domains Work/i.test(text) || any("[data-domains-how]"),
    help: any("[data-domains-help-toggle]"),
    helpOpen: any("#domains-help li"),
    shops: any("[data-domains-shops] a"),
    suggestions: any("[data-domains-suggested]"),
  }
  const words = text.split(/\s+/).filter(Boolean).length
  const controls = [...panel.querySelectorAll("button, a, select, input")].filter(shown).map((el) => {
    const r = el.getBoundingClientRect()
    return { what: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) }
  })
  const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth
  const outside = [...panel.querySelectorAll("*")].filter(shown).filter((el) => el.getBoundingClientRect().right > width + 0.5).map((el) => el.tagName + "." + String(el.className).slice(0, 40))
  return { sections, words, controls, overflowX, outside: outside.slice(0, 5) }
}, width)
const shoot = async (p, name) => {
  const box = await p.evaluate(() => { const el = document.querySelector("[data-settings-panel]"); const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })
  await p.screenshot({ path: join(shots, `${name}.png`), clip: { x: box.x, y: box.y, width: box.w, height: Math.max(80, box.h) } })
}
const on = (s) => Object.entries(s).filter(([, v]) => v).map(([k]) => k).join(", ") || "nothing"

console.log(`\nThree states, before (${BEFORE}) and after`)
const words = {}
for (const width of [390, 1280]) {
  for (const state of ["empty", "pending", "connected"]) {
    for (const which of ["before", "after"]) {
      if (!scripts[which]) continue
      const p = await open(which, state, width)
      const m = await read(p, width)
      words[`${width} ${state} ${which}`] = m.words
      const small = m.controls.filter((c) => c.h < 44 || c.w < 44)
      console.log(`  ${String(width).padEnd(5)} ${state.padEnd(10)} ${which.padEnd(7)} words ${String(m.words).padStart(3)}   overflow ${m.overflowX}px   shows: ${on(m.sections)}`)
      if (which === "after") {
        console.log(`        controls (w x h): ${m.controls.map((c) => `${c.what} ${c.w}x${c.h}`).join(" | ")}`)
        expect(m.overflowX === 0 && m.outside.length === 0, `${width} ${state}: nothing sideways`, { overflowX: m.overflowX, outside: m.outside })
        if (width < 640) expect(small.length === 0, `${width} ${state}: every control is at least 44 by 44`, small)
        if (state === "empty") {
          expect(m.sections.add && !m.sections.records && !m.sections.connectTo && !m.sections.explainer && !m.sections.list && !m.sections.help, `${width} empty: the field only, no records, no connect-to, no explainer, no Help`, m.sections)
        }
        if (state === "pending") {
          expect(m.sections.list && m.sections.records && m.sections.connectTo && !m.sections.explainer && m.sections.help && !m.sections.helpOpen, `${width} pending: the row, its records and Connects to; Help closed`, m.sections)
        }
        if (state === "connected") {
          expect(m.sections.list && !m.sections.records && m.sections.connectTo && !m.sections.explainer, `${width} connected: the row and Connects to; records folded`, m.sections)
        }
        const errors = await p.evaluate(() => window.__err)
        if (errors.length) expect(false, `${width} ${state}: the page threw`, errors)
      }
      await shoot(p, `domains-flow-${which}-${width}-${state}`)
      await p.close()
    }
  }
}
console.log("\n  Words on screen, before -> after")
for (const width of [390, 1280]) for (const state of ["empty", "pending", "connected"]) {
  const b = words[`${width} ${state} before`]
  const a = words[`${width} ${state} after`]
  console.log(`  ${String(width).padEnd(5)} ${state.padEnd(10)} ${b ?? "-"} -> ${a}`)
}
expect(words["390 empty after"] < 25, "the empty tab says under 25 words", words["390 empty after"])

console.log("\nNarrow and wide phones: nothing sideways")
for (const width of [320, 430]) {
  for (const state of ["empty", "pending", "connected"]) {
    const p = await open("after", state, width)
    if (state === "connected") await p.evaluate(() => document.querySelector("[data-dns-disclosure]")?.click())
    await wait(350)
    const m = await read(p, width)
    expect(m.overflowX === 0 && m.outside.length === 0, `${width} ${state}${state === "connected" ? " (records open)" : ""}: overflow ${m.overflowX}px`, m.outside)
    if (width === 320 && state === "pending") await shoot(p, "domains-flow-after-320-pending")
    await p.close()
  }
}

/** Frames of a section coming or going: its height and opacity each frame. */
const describe = (frames) => {
  const moving = frames.filter((f, i) => i > 0 && (f.h !== frames[i - 1].h || f.o !== frames[i - 1].o))
  const first = moving[0]?.t ?? null
  const last = moving.at(-1)?.t ?? null
  return { frames: frames.length, moving: moving.length, from: frames.find((f) => f.h !== null) ?? null, to: frames.at(-1), took: first !== null ? last - first : 0, heights: frames.map((f) => f.h).filter((h, i, a) => h !== a[i - 1]).join(" ") }
}
const monotonic = (frames, up) => {
  const hs = frames.map((f) => f.h).filter((h) => h !== null)
  return hs.every((h, i) => i === 0 || (up ? h >= hs[i - 1] : h <= hs[i - 1]))
}

console.log("\nThe flow, frame by frame (after)")
for (const width of [390, 1280]) {
  const p = await open("after", "empty", width)
  await p.type("#domains-new", "maralind.com")
  const added = await p.evaluate(() => {
    const frames = window.__sample('[data-domains-reveal="list"]', 700)
    document.querySelector("[data-domains-add-button]").click()
    return frames
  })
  const a = describe(added)
  console.log(`  ${width} Add, the list appearing: ${a.moving} moving frames over ${a.took}ms, heights ${a.heights}`)
  expect(a.moving >= 5 && a.took >= 120 && a.took <= 320 && monotonic(added, true) && a.to.o === 1, `${width}: the list opens over about 200ms, only growing`, { moving: a.moving, took: a.took })
  await wait(300)
  let m = await read(p, width)
  expect(m.sections.records && m.sections.connectTo, `${width}: after Add, its records and Connects to are there`, m.sections)
  await shoot(p, `domains-flow-after-${width}-added`)

  /* Connects to: the creator page, then back. */
  await p.evaluate(() => [...document.querySelectorAll('[data-domain-connects] [role="radio"]')].find((b) => b.textContent.trim() === "Creator page").click())
  await wait(300)
  const purpose = await p.evaluate(() => document.querySelector("[data-domain-row]").getAttribute("data-domain-purpose"))
  expect(purpose === "creator_page", `${width}: Connects to moves it to the creator page`, purpose)
  await p.evaluate(() => [...document.querySelectorAll('[data-domain-connects] [role="radio"]')].find((b) => b.textContent.trim() === "Website").click())
  await wait(300)

  /* Check: connected, the records fold away. */
  const folded = await p.evaluate(() => {
    const frames = window.__sample("[data-dns-reveal]", 700)
    document.querySelector("[data-domain-check]").click()
    return frames
  })
  const f = describe(folded)
  console.log(`  ${width} Check, the records folding: ${f.moving} moving frames over ${f.took}ms, heights ${f.heights}`)
  expect(f.moving >= 5 && f.took >= 120 && f.took <= 320 && monotonic(folded.filter((x) => x.h !== null), false), `${width}: the records fold over about 200ms, only shrinking`, { moving: f.moving, took: f.took })
  await wait(300)
  m = await read(p, width)
  expect(!m.sections.records && m.sections.connectTo, `${width}: connected, records folded, Connects to kept`, m.sections)

  /* DNS records: open for reference. */
  const opened = await p.evaluate(() => {
    const frames = window.__sample("[data-dns-reveal]", 600)
    document.querySelector("[data-dns-disclosure]").click()
    return frames
  })
  const o = describe(opened)
  console.log(`  ${width} DNS records, opening: ${o.moving} moving frames over ${o.took}ms, heights ${o.heights}`)
  expect(o.moving >= 5 && o.took >= 120 && o.took <= 320 && monotonic(opened.filter((x) => x.h !== null), true), `${width}: DNS records opens over about 200ms, only growing`, { moving: o.moving, took: o.took })
  await wait(300)
  m = await read(p, width)
  expect(m.sections.records && m.overflowX === 0, `${width}: the records, opened, fit`, { records: m.sections.records, overflowX: m.overflowX })
  await shoot(p, `domains-flow-after-${width}-connected-records`)

  /* Help */
  const help = await p.evaluate(() => {
    const frames = window.__sample("#domains-help", 600)
    document.querySelector("[data-domains-help-toggle]").click()
    return frames
  })
  const h = describe(help)
  console.log(`  ${width} Help, opening: ${h.moving} moving frames over ${h.took}ms`)
  expect(h.took >= 120 && h.took <= 320, `${width}: Help opens over about 200ms`, h.took)
  await wait(300)
  await shoot(p, `domains-flow-after-${width}-help`)
  const errors = await p.evaluate(() => window.__err)
  expect(errors.length === 0, `${width}: nothing threw`, errors)
  await p.close()
}

console.log("\nA check that did not pass (390)")
{
  const p = await open("after", "pending", 390, { verify: "bad" })
  await p.evaluate(() => document.querySelector("[data-domain-check]").click())
  await wait(400)
  const got = await p.evaluate(() => ({
    standing: document.querySelector("[data-domain-standing]")?.getAttribute("data-domain-standing"),
    states: [...document.querySelectorAll("[data-dns-state]")].map((s) => s.textContent.trim()),
    fixes: [...document.querySelectorAll("[data-dns-fixes] li")].length,
    seen: document.querySelector("[data-dns-seen]")?.textContent.trim() ?? null,
    button: document.querySelector("[data-domain-check]")?.textContent.trim(),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  expect(got.standing === "Needs attention" && got.states.join() === "Other value,Not found,Not found" && got.fixes === 1 && /34\.120\.5\.9/.test(got.seen ?? "") && got.button === "Check again" && got.overflowX === 0, "Needs attention, each record's state, what to fix, Check again", got)
  await shoot(p, "domains-flow-after-390-needs-attention")
  await p.close()
}

console.log("\nThe provider picked, and Remove (1280)")
{
  const p = await open("after", "pending", 1280)
  await p.select("[data-dns-registrar]", "porkbun")
  await wait(150)
  const got = await p.evaluate(() => ({
    names: [...document.querySelectorAll("[data-dns-name]")].map((n) => n.textContent.trim()),
    tip: document.querySelector("[data-dns-tip]")?.textContent.trim() ?? "",
    open: document.querySelector("[data-dns-open]")?.getAttribute("aria-label"),
  }))
  expect(got.names.join() === "Leave empty,www,_vercel" && /Porkbun/.test(got.tip) && got.open === "Open Porkbun DNS", "Porkbun: the domain's own record is Leave empty, with Porkbun's one line", got)
  const frames = await p.evaluate(() => {
    const out = window.__sample("[data-domain-confirm-reveal]", 500)
    document.querySelector("[data-domain-remove]").click()
    return out
  })
  const ask = await p.evaluate(() => document.querySelector("[data-domain-confirm]")?.textContent.replace(/\s+/g, " ").trim())
  expect(/Remove maralind\.com\?/.test(ask ?? "") && /nothing stops working/.test(ask ?? ""), "Remove asks in the row first", ask)
  const r = describe(frames)
  console.log(`  Remove, the question opening: ${r.moving} moving frames over ${r.took}ms, heights ${r.heights}`)
  expect(r.took >= 120 && r.took <= 320 && monotonic(frames.filter((x) => x.h !== null), true), "the question opens over about 200ms", r.took)
  await p.close()
}

console.log("\nThe free plan (390 and 1280)")
for (const width of [390, 1280]) {
  const p = await open("after", "empty", width, { plan: "free" })
  const free = await p.evaluate(() => {
    const bar = document.querySelector("[data-domains-upgrade]")
    const cs = getComputedStyle(document.querySelector("[data-domains-connect]"))
    return { bar: bar ? bar.textContent.replace(/\s+/g, " ").trim() : null, filter: cs.filter, opacity: cs.opacity, pointer: cs.pointerEvents, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  })
  expect(/Upgrade/.test(free.bar ?? "") && free.filter === "blur(1.5px)" && free.opacity === "0.8" && free.pointer === "none" && free.overflowX === 0, `${width}: the Pro bar, and the add card blurred, taking no pointer`, free)
  await shoot(p, `domains-flow-after-${width}-free`)
  await p.close()
}

console.log("\nReduced motion (390)")
{
  const p = await open("after", "connected", 390, { reduced: true })
  const frames = await p.evaluate(() => {
    const out = window.__sample("[data-dns-reveal]", 400)
    document.querySelector("[data-dns-disclosure]").click()
    return out
  })
  const r = describe(frames)
  console.log(`  DNS records, opening: ${r.moving} moving frames over ${r.took}ms, heights ${r.heights}`)
  expect(r.moving <= 2 && r.took <= 40, "under prefers-reduced-motion it opens at once", { moving: r.moving, took: r.took })
  await p.close()
}

await browser.close()
server.close()
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
