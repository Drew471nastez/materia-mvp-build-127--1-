/**
 * ===========================================================================
 *  THE CONNECTION MARK, AND THE NOTICE OF WHAT AN AGENT IS CHANGING
 * ===========================================================================
 * The real editor, with the activity route answered here: Claude Code is
 * connected, and a moment after the editor opens it writes two sections.
 * Read back from the page, not from the source:
 *
 *   - the top bar's mark is Claude's, with the live dot, labelled with what
 *     is connected;
 *   - a notice appears under that mark saying who is editing, a line per
 *     change, with the loading line running;
 *   - a line selects its section and does not move the canvas;
 *   - after the quiet period it says "Done, 2 changes", stays while hovered,
 *     and fades once the pointer leaves;
 *   - the reads slow down while nothing happens;
 *   - with nothing connected the editor asks once and never again;
 *   - on a phone the notice is a toast at the top, under the bar.
 *
 *   node scripts/check-live-notice.mjs
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { CHROMIUM, bundle, css } from "./editor-probe-harness.mjs"

/**
 * After the editor's own fetch stub (render-editor-probe.tsx), so this one
 * sees the activity route first. `window.__activity` records every ask.
 */
const stub = (connected) => `<script>
(function () {
  var inner = window.fetch
  var started = Date.now()
  window.__activity = []
  window.__served = false
  var brief = ${connected
    ? `{ agents: [{ name: "Claude Code", lastUsedAt: new Date(Date.now() - 30000).toISOString() }], github: { repo: "drew/shop" }, latest: null }`
    : `{ agents: [], github: null, latest: null }`}
  function json(body) { return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) }
  window.fetch = function (input, init) {
    var url = String(typeof input === "string" ? input : (input && input.url) || "")
    if (url.indexOf("/agent-activity") === -1) return inner.apply(this, arguments)
    var after = url.split("after=")[1]
    window.__activity.push({ at: Date.now() - started, after: after === undefined ? null : Number(after) })
    if (after === undefined) return json({ ready: true, cursor: 10, events: [], connections: brief })
    if (!window.__served && window.__release) {
      window.__served = true
      var now = new Date().toISOString()
      return json({ ready: true, cursor: 12, events: [
        { id: 11, agent_name: "Claude Code", path: "sections/hero_centered.storelib", action: "updated", created_at: now },
        { id: 12, agent_name: "Claude Code", path: "sections/pricing_table.storelib", action: "created", created_at: now }
      ] })
    }
    return json({ ready: true, cursor: Number(after), events: [] })
  }
})()
</script>`

const page = (connected) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false</script><script src="/editor-probe.js"></script>${stub(connected)}</body></html>`
const js = readFileSync(bundle)
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(!req.url.includes("none")))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.SHOTS_DIR

async function open(vp, path = "/") {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
  await p.goto(origin + path, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
  return { p, errors }
}
const notice = (p) =>
  p.evaluate(() => {
    const n = document.querySelector("[data-live-notice]")
    if (!n) return null
    const r = n.getBoundingClientRect()
    return {
      phase: n.getAttribute("data-live-notice"),
      title: n.querySelector("p")?.textContent ?? "",
      rows: [...n.querySelectorAll("li")].map((li) => li.textContent.trim()),
      loading: !!n.querySelector(".wb-live-progress"),
      box: { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width) },
      opacity: getComputedStyle(n).opacity,
    }
  })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
try {
  /* ── Desktop, Claude Code connected ─────────────────────────────────── */
  {
    const { p, errors } = await open({ width: 1440, height: 900 })
    await sleep(800)
    console.log("\nthe mark in the top bar")
    const mark = await p.evaluate(() => {
      const b = document.querySelector("button[data-connection]")
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { kind: b.getAttribute("data-connection"), online: b.hasAttribute("data-online"), label: b.getAttribute("aria-label"), dot: !!b.querySelector(".wb-live-dot"), pulse: b.querySelector(".wb-live-dot")?.hasAttribute("data-pulse") ?? false, size: [Math.round(r.width), Math.round(r.height)], svg: !!b.querySelector("svg path") }
    })
    expect(mark?.kind === "claude" && mark.online && mark.dot && mark.svg, "Claude's mark, drawn, with the live dot", mark)
    expect(mark?.label === "Claude Code connected", "labelled with what is connected", mark?.label)
    expect(mark?.pulse === true, "and breathing, because it acted a minute ago", mark?.pulse)
    expect(mark?.size?.[0] === 32 && mark?.size?.[1] === 32, "the same 32px tile as the bar's other icons", mark?.size)
    if (shots) {
      const b = await p.$("button[data-connection]")
      const bb = await b.boundingBox()
      await p.screenshot({ path: `${shots}/connection-mark.png`, clip: { x: bb.x - 120, y: 0, width: 300, height: 48 } })
    }

    console.log("\nthe notice, while Claude Code writes")
    const scrollBefore = await p.evaluate(() => document.getElementById("wb-preview-root").scrollTop)
    await p.evaluate(() => { window.__release = true })
    await p.waitForSelector("[data-live-notice]", { timeout: 15_000 })
    await sleep(300)
    let n = await notice(p)
    expect(n?.phase === "working" && n.title === "Claude Code is editing", "it says who is editing", n?.title)
    expect(n?.loading === true, "with the loading line running", n?.loading)
    expect(
      n?.rows.length === 2 && /^Centered Hero section updated$/i.test(n.rows[0]) && n.rows[1] === "New section: Pricing table",
      "a line per change, in words",
      n?.rows,
    )
    const anchor = await p.evaluate(() => {
      const r = document.querySelector("button[data-connection]").getBoundingClientRect()
      return { bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }
    })
    expect(!!n && n.box.top >= anchor.bottom && n.box.top - anchor.bottom <= 12 && n.box.right >= anchor.left && n.box.left <= anchor.right, "hanging from the mark", { notice: n?.box, mark: anchor })
    expect(!/slb_/.test(JSON.stringify(n)), "and never a token")
    if (shots) await p.screenshot({ path: `${shots}/live-notice-working.png`, clip: { x: 900, y: 0, width: 540, height: 200 } })

    const scrollAfter = await p.evaluate(() => document.getElementById("wb-preview-root").scrollTop)
    expect(scrollAfter === scrollBefore, "the canvas did not move while the agent wrote", { before: scrollBefore, after: scrollAfter })

    await p.evaluate(() => [...document.querySelectorAll("[data-live-notice] li button")][0]?.click())
    await sleep(600)
    const picked = await p.evaluate(() => ({
      toolbar: !!document.querySelector(".wb-section-toolbar"),
      scrollTop: document.getElementById("wb-preview-root").scrollTop,
    }))
    expect(picked.toolbar, "its line selects the hero on the canvas", picked)
    expect(picked.scrollTop === scrollBefore, "without moving a canvas that already shows it", picked.scrollTop)

    console.log("\nwhen it stops")
    await p.waitForFunction(() => document.querySelector("[data-live-notice]")?.getAttribute("data-live-notice") === "done", { timeout: 20_000 })
    n = await notice(p)
    expect(n?.title === "Done, 2 changes" && !n.loading, "Done, 2 changes, and the loading line stops", n?.title)
    if (shots) await p.screenshot({ path: `${shots}/live-notice-done.png`, clip: { x: 900, y: 0, width: 540, height: 200 } })
    const nb = n.box
    await p.mouse.move(nb.left + 40, nb.top + 20)
    await sleep(7000)
    n = await notice(p)
    expect(n?.phase === "done", "a pointer on it keeps it", n?.phase)
    await p.mouse.move(200, 600)
    await sleep(6000)
    n = await notice(p)
    expect(n === null, "and it fades once the pointer leaves", n)

    const asks = await p.evaluate(() => window.__activity)
    const gaps = asks.slice(1).map((a, i) => a.at - asks[i].at)
    console.log(`  reads: ${asks.length}, gaps ${gaps.map((g) => Math.round(g / 100) / 10 + "s").join(", ")}`)
    expect(asks[0]?.after === null && asks.slice(1).every((a) => a.after !== null), "one brief, then only reads after the cursor", asks.slice(0, 3))
    const idle = gaps.slice(-3)
    expect(idle.length >= 2 && idle.every((g, i) => i === 0 || g >= idle[i - 1] - 250), "the reads slow down while nothing happens", gaps)
    expect(errors.length === 0, "no page errors", errors.slice(0, 3))
    await p.close()
  }

  /* ── Nothing connected ──────────────────────────────────────────────── */
  {
    const { p, errors } = await open({ width: 1440, height: 900 }, "/none")
    await sleep(12_000)
    console.log("\nnothing connected")
    const asks = await p.evaluate(() => window.__activity.length)
    const mark = await p.evaluate(() => {
      const b = document.querySelector("button[data-connection]")
      return b && { kind: b.getAttribute("data-connection"), online: b.hasAttribute("data-online"), dot: !!b.querySelector(".wb-live-dot") }
    })
    expect(asks === 1, "the editor asks once and then not at all", asks)
    expect(mark?.kind === "github" && !mark.online && !mark.dot, "GitHub's mark, without a dot", mark)
    expect(errors.length === 0, "no page errors", errors.slice(0, 3))
    await p.close()
  }

  /* ── Phone ──────────────────────────────────────────────────────────── */
  {
    const { p, errors } = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await sleep(800)
    await p.evaluate(() => { window.__release = true })
    await p.waitForSelector("[data-live-notice]", { timeout: 15_000 })
    await sleep(300)
    console.log("\nphone")
    const n = await notice(p)
    const bar = await p.evaluate(() => Math.round(document.querySelector(".wb-editor-topbar, header")?.getBoundingClientRect().bottom ?? 48))
    expect(!!n && n.box.top >= bar && n.box.top <= bar + 16, "a toast at the top, just under the bar", { top: n?.box.top, bar })
    expect(!!n && n.box.left >= 12 && n.box.right <= 390 - 12, "inside the screen's gutters", n?.box)
    expect(n?.title === "Claude Code is editing" && n.rows.length === 2, "saying the same thing", n)
    if (shots) await p.screenshot({ path: `${shots}/live-notice-phone.png`, clip: { x: 0, y: 0, width: 390, height: 300 } })
    expect(errors.length === 0, "no page errors", errors.slice(0, 3))
    await p.close()
  }
} finally {
  await browser.close()
  server.close()
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
