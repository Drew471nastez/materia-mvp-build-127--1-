/**
 * ===========================================================================
 *  ADD BLOCK, IN THE REAL EDITOR: OPEN, HOVER, KEYS, ADD, ON THREE SCREENS
 * ===========================================================================
 * The owner: Add block "opens that inline modal bad"; it should be a sheet
 * on a phone and, on a computer, a panel beside the sidebar with the blocks
 * on the left and a large live preview on the right, "smooth hover previews,
 * instant selection, accurate theme styling ... fast loading".
 *
 * The real editor (editor-probe-harness.mjs), a page with a "Section" that
 * takes any theme block (blocks_section: Heading, Text, Button, Image,
 * Group and the rest), at 1440 x 900, 1280 x 800 and 390 x 844:
 *
 *   OPEN      the section's Add block row pressed: how long the press held
 *             the main thread, and how long until the panel (or the sheet)
 *             is up with a preview drawn in it
 *   FOCUS     the search box has the focus (a computer)
 *   HOVER     the pointer moved onto each row in turn: the time from the
 *             move to the first frame whose preview is that block, at full
 *             speed and with the CPU at a quarter speed
 *   KEYS      ArrowDown moves the preview; Escape puts the panel away and
 *             the focus back on the Add block row
 *   MATCH     a block picked: the block the canvas draws is the block the
 *             preview showed (the same markup, ids aside, and the same size)
 *   FIT       nothing wider than the window, the panel inside it
 *
 *   node scripts/check-block-picker.mjs
 *   SHOTS=/path node scripts/check-block-picker.mjs     (where the pictures go)
 *   ONLY=390 node scripts/check-block-picker.mjs        (one size)
 */
import { createServer } from "node:http"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { bundle, css } from "./editor-probe-harness.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-block-picker")
mkdirSync(SHOTS, { recursive: true })
const shot = (name) => join(SHOTS, `blockpicker-${name}.png`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SECTION = "blocks_section-1"

const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>
  window.PROBE_SHORT = false
  window.PROBE_PAGES = { home: ["header", "blocks_section", "features_grid", "faq_accordion", "cta_simple", "footer"] }
</script>
<script src="/editor-probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(req.url.startsWith("/editor") ? page : "<!doctype html><title>blank</title>")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

let bad = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) bad++
}
const note = (what) => console.log(`  --    ${what}`)
const STRICT = process.env.REPORT_ONLY !== "1"

/** The block markup with every id that differs between the preview and the canvas taken out. */
const NORMALISE = `
  window.__norm = (el) => {
    const c = el.cloneNode(true)
    for (const n of [c, ...c.querySelectorAll("*")]) {
      for (const a of [...n.attributes]) {
        if (/^data-(block-id|bp-|section-id|sl-block|editor|wb-)|^(id|aria-[a-z]+|tabindex|contenteditable|spellcheck|draggable|loading|decoding)$/.test(a.name)) n.removeAttribute(a.name)
      }
      if (n.getAttribute && n.getAttribute("style")) n.setAttribute("style", n.getAttribute("style").replace(/block-picker-preview[^;"]*/g, ""))
    }
    return c.outerHTML.replace(/block-picker-preview[-a-z0-9_]*/gi, "X").replace(/blocks_section-1[-a-z0-9_]*/gi, "X").replace(/\\s+/g, " ").trim()
  }
`

async function run(kind) {
  const phone = kind.w < 640
  const p = await browser.newPage()
  await p.setViewport(phone ? { width: kind.w, height: kind.h, isMobile: true, hasTouch: true } : { width: kind.w, height: kind.h })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 4, { timeout: 60_000 })
  await p.evaluate(NORMALISE)
  await sleep(2500)
  console.log(`\n══ ${kind.w} × ${kind.h}${phone ? ", a phone" : ""} ══\n`)
  const tap = async (pt) => (phone ? p.touchscreen.tap(pt.x, pt.y) : p.mouse.click(pt.x, pt.y))
  const centre = (sel) => p.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    el.scrollIntoView({ block: "center" })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, sel)

  if (phone) {
    /* The sections sheet up, from its peek. */
    const tab = await p.evaluate(() => {
      const base = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((s) => s.querySelector("[data-wb-sidebar-scroll]"))
      const t = base && [...base.querySelectorAll("[role='tab']")].find((x) => /Sections/.test(x.textContent || ""))
      if (!t) return null
      const r = t.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    if (tab) await tap(tab)
    await sleep(900)
  }
  /* The section's blocks open in the tree. */
  const expand = await centre(`[data-section-expand="${SECTION}"]`)
  const already = await p.evaluate((id) => !!document.querySelector(`[data-section-blocks="${id}"] [data-add-block]`), SECTION)
  if (!already && expand) await tap(expand)
  await sleep(500)
  const addSel = `[data-section-blocks="${SECTION}"] [data-tree-add-block="1"]`
  const add = await centre(addSel)
  expect(!!add, "the section's Add block row is in the tree", add)
  if (!add) { await p.close(); return }
  await sleep(300)

  /* ── OPEN ── */
  await p.evaluate((addSel, phone) => {
    window.__open = { press: 0, ready: null }
    const el = document.querySelector(addSel)
    const t0 = performance.now()
    const surface = () => document.querySelector(phone ? "[data-block-picker='phone']" : "[data-block-picker='desktop']")
    const tick = () => {
      const s = surface()
      const stage = document.querySelector("[data-block-preview] [data-bp-showing]")
      const box = s && (phone ? s.closest("[data-mobile-bottom-sheet]") : s)
      const r = box?.getBoundingClientRect()
      const up = r && (phone ? r.top < innerHeight - 200 : Number(getComputedStyle(box).opacity) > 0.05)
      if (up && stage && window.__open.ready === null) window.__open.ready = Math.round(performance.now() - t0)
      if (performance.now() - t0 < 1500 && window.__open.ready === null) requestAnimationFrame(tick)
    }
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: phone ? "touch" : "mouse", isPrimary: true }))
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: phone ? "touch" : "mouse", isPrimary: true }))
    el.focus()
    el.click()
    window.__open.press = Math.round(performance.now() - t0)
    requestAnimationFrame(tick)
  }, addSel, phone)
  await sleep(700)
  const opened = await p.evaluate(() => window.__open)
  note(`open: the press held the main thread ${opened.press}ms; panel up with its preview ${opened.ready}ms after the press`)
  expect(opened.ready !== null && opened.ready < 400, "it opens, with a preview, in well under half a second", opened)
  const state = await p.evaluate((phone) => {
    const s = document.querySelector(phone ? "[data-block-picker='phone']" : "[data-block-picker='desktop']")
    const rows = [...document.querySelectorAll("[data-block-picker-list] [role='option']")]
    const r = (phone ? s?.closest("[data-mobile-bottom-sheet]") : s)?.getBoundingClientRect()
    const sidebar = document.querySelector("[data-wb-sidebar-fold]")?.getBoundingClientRect()
    return {
      rows: rows.map((x) => x.textContent.trim()),
      focus: document.activeElement?.hasAttribute("data-block-picker-search") ?? false,
      box: r ? { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null,
      sidebarRight: sidebar ? Math.round(sidebar.right) : null,
      placement: s?.getAttribute("data-placement"),
      overflow: document.documentElement.scrollWidth - innerWidth,
      shimmer: !!document.querySelector("[data-block-preview] .wb-preview-shimmer"),
    }
  }, phone)
  note(`blocks offered: ${state.rows.join(", ")}`)
  expect(state.rows.length >= 4, "the section's theme blocks are listed", state.rows.length)
  expect(!state.shimmer, "no spinner or shimmer: the first preview is there at once")
  if (!phone) {
    expect(state.focus, "the search box has the focus")
    expect(state.box && state.sidebarRight !== null && state.placement === "beside" ? state.box.left >= state.sidebarRight && state.box.left - state.sidebarRight <= 16 : state.placement === "center", "the panel sits beside the sidebar", { box: state.box, sidebar: state.sidebarRight, placement: state.placement })
  }
  expect(state.box && state.box.left >= 0 && state.box.right <= kind.w && state.box.bottom <= kind.h + 1, "the panel is inside the window", state.box)
  expect(state.overflow <= 0, "nothing wider than the window", state.overflow)
  await p.screenshot({ path: shot(`${kind.w}-1-open`) })

  /* ── HOVER, at full speed and at a quarter ── */
  const client = await p.target().createCDPSession()
  for (const rate of [1, 4]) {
    await client.send("Emulation.setCPUThrottlingRate", { rate })
    const times = await p.evaluate(async (phone) => {
      const rows = [...document.querySelectorAll("[data-block-picker-list] [role='option']")]
      const out = []
      for (const row of rows) {
        const want = `${row.getAttribute("data-block-choice")}:${row.getAttribute("data-preset")}`
        const t0 = performance.now()
        if (phone) row.click()
        else row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
        const got = await new Promise((resolve) => {
          const tick = () => {
            const stage = document.querySelector("[data-block-preview] [data-bp-showing]")
            if (stage?.getAttribute("data-bp-showing") === want) resolve(Math.round(performance.now() - t0))
            else if (performance.now() - t0 > 2000) resolve(null)
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        out.push({ block: row.textContent.trim(), ms: got })
        await new Promise((r) => setTimeout(r, 60))
      }
      return out
    }, phone)
    const ms = times.map((t) => t.ms).filter((x) => x !== null).sort((a, b) => a - b)
    const worst = ms[ms.length - 1]
    const median = ms[Math.floor(ms.length / 2)]
    note(`${phone ? "tap" : "hover"} to preview, CPU ${rate}x: median ${median}ms, worst ${worst}ms  ${times.map((t) => `${t.block} ${t.ms}`).join(", ")}`)
    expect(times.every((t) => t.ms !== null), `every ${phone ? "tap" : "hover"} shows its block (CPU ${rate}x)`)
    expect(worst <= (rate === 1 ? 50 : 120), `and on the next frame or so (CPU ${rate}x)`, { median, worst })
  }
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 })

  /* Each block's preview, pictured. */
  const choices = await p.evaluate(() => [...document.querySelectorAll("[data-block-picker-list] [role='option']")].map((r) => r.getAttribute("data-block-choice") + ":" + r.getAttribute("data-preset")))
  for (const want of choices) {
    await p.evaluate((want, phone) => {
      const row = [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => `${r.getAttribute("data-block-choice")}:${r.getAttribute("data-preset")}` === want)
      if (phone) row.click()
      else row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
    }, want, phone)
    await sleep(120)
    const info = await p.evaluate(() => {
      const pane = document.querySelector("[data-block-preview]")
      const t = pane?.querySelector("[data-bp-target]")
      /* What of the block is painted: its words and its pictures (its own box can be the section's whole width). */
      let r = null
      if (t) {
        const boxes = []
        const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT)
        for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); boxes.push(rg.getBoundingClientRect()) }
        for (const el of t.querySelectorAll("img, svg, video, iframe, button, input, hr")) boxes.push(el.getBoundingClientRect())
        const real = boxes.filter((b) => b.width > 0 && b.height > 0)
        r = real.length ? { left: Math.min(...real.map((b) => b.left)), right: Math.max(...real.map((b) => b.right)), top: Math.min(...real.map((b) => b.top)), bottom: Math.max(...real.map((b) => b.bottom)), width: 1 } : t.getBoundingClientRect()
      }
      const pr = pane?.getBoundingClientRect()
      return { found: !!t, inside: !!(r && pr && r.width > 0 && r.left >= pr.left - 1 && r.right <= pr.right + 1 && r.top >= pr.top - 1 && r.bottom <= pr.bottom + 1), note: pane?.querySelector("[data-preview-note]")?.textContent ?? null }
    })
    expect(info.found && (info.inside || info.note), `${want}: drawn, and inside its preview`, info)
    await p.screenshot({ path: shot(`${kind.w}-2-${want.replace(/[^a-z0-9]+/gi, "-")}`) })
  }

  if (!phone) {
    /* ── KEYS ── */
    await p.evaluate(() => document.querySelector("[data-block-picker-search]").focus())
    const before = await p.evaluate(() => document.querySelector("[data-bp-showing]")?.getAttribute("data-bp-showing"))
    await p.keyboard.press("ArrowDown")
    await sleep(80)
    const after = await p.evaluate(() => document.querySelector("[data-bp-showing]")?.getAttribute("data-bp-showing"))
    expect(before !== after && !!after, "ArrowDown moves the preview to the next block", { before, after })
    await p.keyboard.type("butt")
    await sleep(120)
    const filtered = await p.evaluate(() => ({ rows: [...document.querySelectorAll("[data-block-picker-list] [role='option']")].map((r) => r.textContent.trim()), showing: document.querySelector("[data-bp-showing]")?.getAttribute("data-bp-showing") }))
    expect(filtered.rows.length >= 1 && filtered.rows.every((r) => /butt/i.test(r)) && /^button/.test(filtered.showing ?? ""), "typing filters the list and previews what is left", filtered)
    await p.keyboard.press("Escape")
    await sleep(350)
    const closed = await p.evaluate((addSel) => ({ state: document.querySelector("[data-block-picker-layer]")?.getAttribute("data-state"), focusBack: document.activeElement === document.querySelector(addSel) }), addSel)
    expect(closed.state === "closed" && closed.focusBack, "Escape puts it away, the focus back on Add block", closed)

    /* Opened again and a press outside it. */
    await p.mouse.click(add.x, add.y)
    await sleep(350)
    await p.mouse.click(kind.w - 40, kind.h - 40)
    await sleep(350)
    const away = await p.evaluate(() => document.querySelector("[data-block-picker-layer]")?.getAttribute("data-state"))
    expect(away === "closed", "a press outside puts it away", away)

    /* The line between the first two blocks: a new opening, and the block drawn at that place, not at the end. */
    const between = await p.evaluate((id) => {
      const line = document.querySelector(`[data-section-blocks="${id}"] [data-insert-block]`)
      const first = document.querySelector(`[data-section-blocks="${id}"] [data-tree-block]`)?.getAttribute("data-tree-block")
      if (!line) return null
      line.click()
      return { first }
    }, SECTION)
    await sleep(350)
    if (between) {
      await p.evaluate(() => {
        const row = [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === "text")
        row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
      })
      await sleep(80)
      const placed = await p.evaluate(() => {
        const t = document.querySelector("[data-block-preview] [data-bp-target]")
        const ids = [...(t?.closest("[data-bp-stage]")?.querySelectorAll("[data-block-id]") ?? [])].map((e) => e.getAttribute("data-block-id")).filter((x) => !/block-picker-preview-/.test(x))
        return { ids, showing: document.querySelector("[data-bp-showing]")?.getAttribute("data-bp-showing") }
      })
      expect(placed.ids[1] === "block-picker-preview" && placed.ids[0] === between.first, "from the line between two blocks, the block is drawn between them", placed)
      await p.keyboard.press("Escape")
      await sleep(300)
    } else note("no insert line between blocks found")
    await p.mouse.click(add.x, add.y)
    await sleep(400)
  }

  /* ── MATCH: pick the Heading, and hold the canvas's block against the preview's ── */
  const pick = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-block-picker-list] [role='option']")]
    return rows.find((r) => r.getAttribute("data-block-choice") === "heading") ? "heading" : rows[0]?.getAttribute("data-block-choice")
  })
  const preview = await p.evaluate((pick, phone) => {
    const row = [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === pick)
    if (phone) row.click()
    else row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
    return new Promise((resolve) => requestAnimationFrame(() => {
      const t = document.querySelector("[data-block-preview] [data-bp-target]")
      const stage = t?.closest("[data-bp-stage]")
      const scale = stage ? Number((getComputedStyle(stage).transform.match(/matrix\(([^,]+)/) ?? [])[1] ?? 1) : 1
      const r = t?.getBoundingClientRect()
      const fs = t ? getComputedStyle(t.matches("h1,h2,h3,p,a,span") ? t : t.querySelector("h1,h2,h3,p,a,span") ?? t) : null
      const vars = {}
      if (fs) for (let i = 0; i < fs.length; i++) if (fs[i].startsWith("--")) vars[fs[i]] = fs.getPropertyValue(fs[i]).trim()
      resolve(t ? { vars, html: window.__norm(t), w: Math.round(r.width / scale), h: Math.round(r.height / scale), font: fs.fontFamily, size: fs.fontSize, color: fs.color, bg: getComputedStyle(document.querySelector("[data-block-preview] [aria-hidden]")).backgroundColor } : null)
    }))
  }, pick, phone)
  const blocksBefore = await p.evaluate((id) => [...document.querySelectorAll(`#wb-section-${id} [data-block-id]`)].map((e) => e.getAttribute("data-block-id")), SECTION)
  if (phone) {
    const btn = await centre("[data-block-picker-add]")
    await tap(btn)
  } else {
    await p.evaluate((pick) => [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === pick).click(), pick)
  }
  await sleep(1200)
  const landed = await p.evaluate((id, before) => {
    const fresh = [...document.querySelectorAll(`#wb-section-${id} [data-block-id]`)].find((e) => !before.includes(e.getAttribute("data-block-id")))
    if (!fresh) return null
    const r = fresh.getBoundingClientRect()
    const sc = document.getElementById("wb-preview-root").getBoundingClientRect()
    const fs = getComputedStyle(fresh.matches("h1,h2,h3,p,a,span") ? fresh : fresh.querySelector("h1,h2,h3,p,a,span") ?? fresh)
    const vars = {}
    for (let i = 0; i < fs.length; i++) if (fs[i].startsWith("--")) vars[fs[i]] = fs.getPropertyValue(fs[i]).trim()
    return { vars, html: window.__norm(fresh), w: Math.round(r.width), h: Math.round(r.height), font: fs.fontFamily, size: fs.fontSize, color: fs.color, onScreen: r.bottom > sc.top && r.top < sc.bottom, open: document.querySelector("[data-block-picker-layer]")?.getAttribute("data-state") ?? null }
  }, SECTION, blocksBefore)
  expect(!!landed, `the ${pick} block lands in the section`)
  if (landed && preview) {
    const same = landed.html === preview.html
    expect(same, "the canvas draws exactly the markup the preview showed", same ? undefined : { preview: preview.html.slice(0, 220), canvas: landed.html.slice(0, 220) })
    expect(Math.abs(landed.w - preview.w) <= 2 && Math.abs(landed.h - preview.h) <= 2, "at the same size", { preview: [preview.w, preview.h], canvas: [landed.w, landed.h] })
    expect(landed.font === preview.font && landed.size === preview.size && landed.color === preview.color, "in the same type and colour", { preview: [preview.font, preview.size, preview.color], canvas: [landed.font, landed.size, landed.color] })
    expect(landed.onScreen, "and is on screen in the canvas")
    const differ = Object.keys({ ...landed.vars, ...preview.vars }).filter((k) => landed.vars[k] !== preview.vars[k])
    if (differ.length) note(`custom properties that differ on the block: ${differ.slice(0, 12).map((k) => `${k} preview=${preview.vars[k]} canvas=${landed.vars[k]}`).join("; ")}`)
  }
  const selected = await p.evaluate(() => document.querySelector("[data-tree-block][data-tree-block] [aria-current='true']")?.textContent?.trim() ?? document.querySelector("[aria-current='true']")?.textContent?.trim() ?? null)
  note(`selected after adding: ${selected}`)
  await p.screenshot({ path: shot(`${kind.w}-3-added`) })
  expect((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, "still nothing wider than the window")
  await p.close()
}

/**
 * ===========================================================================
 *  AN IMPORTED THEME: tests/fixtures/shopify-posture, its "Rich text"
 * ===========================================================================
 * Its sections are drawn by the compat engine, in a frame: the preview is
 * the same engine, in a frame of its own. The block is found by what the
 * theme prints for `block.shopify_attributes`, and held against the block
 * the canvas's frame draws once it is added.
 */
async function CANVAS_FRAME(p) {
  for (const f of p.frames()) {
    if (f === p.mainFrame() || f.url() !== "about:srcdoc" || f.parentFrame() !== p.mainFrame()) continue
    const el = await f.frameElement().catch(() => null)
    if (el && !(await el.evaluate((x) => x.hasAttribute("data-bp-frame")))) return f
  }
  return null
}
async function compat() {
  const fixture = JSON.parse(execFileSync("npx", ["tsx", "-e", `
    import { converted } from "./scripts/check-builder-nav19"
    converted().then((t) => {
      const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
      const files = Object.fromEntries(Object.entries(t.files).filter(([p, v]) => p.startsWith("shopify/") && !String(v).startsWith("base64:")))
      const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
      process.stdout.write(JSON.stringify({ compat: { settings: t.settings, pages, sources, files }, all: t.files }))
    })`], { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" }))
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_COMPAT=${JSON.stringify(fixture.compat).replace(/</g, "\\u003c")}</script><script src="/editor-probe.js"></script></body></html>`
  const srv = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x")
    if (url.pathname === "/editor-probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const name = decodeURIComponent(asset[1])
      const text = fixture.all[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404); return res.end() }
      res.writeHead(200, { "content-type": name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "text/plain", "access-control-allow-origin": "*" })
      return res.end(text)
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(url.pathname.startsWith("/editor") ? html : "<!doctype html><title>blank</title>")
  })
  await new Promise((r) => srv.listen(0, "127.0.0.1", r))
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.evaluateOnNewDocument("window.__name = (f) => f")
  await p.goto(`http://127.0.0.1:${srv.address().port}/editor`, { waitUntil: "load" })
  console.log("\n══ 1440 × 900, an imported Shopify theme ══\n")
  for (let i = 0; i < 120 && !(await CANVAS_FRAME(p)); i++) await sleep(250)
  await sleep(2500)
  await p.evaluate(NORMALISE)
  const id = await p.evaluate(() => [...document.querySelectorAll("[data-section-row]")].find((r) => /Rich text/i.test(r.textContent || ""))?.getAttribute("data-section-row") ?? null)
  expect(!!id, "the theme's Rich text section is in the tree", id)
  if (!id) { await p.close(); srv.close(); return }
  const already = await p.evaluate((id) => !!document.querySelector(`[data-section-blocks="${id}"] [data-add-block]`), id)
  if (!already) await p.evaluate((id) => document.querySelector(`[data-section-expand="${id}"]`)?.click(), id)
  await sleep(500)
  const addSel = `[data-section-blocks="${id}"] [data-tree-add-block="1"]`
  const t0 = Date.now()
  await p.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: "center" }); el.focus(); el.click() }, addSel)
  let ready = null
  for (let i = 0; i < 100 && ready === null; i++) {
    await sleep(50)
    if (await p.evaluate(() => !!document.querySelector("[data-block-preview] iframe[data-bp-showing]"))) ready = Date.now() - t0
  }
  note(`the preview frame showed its first block ${ready}ms after the press (the theme's files are read once, the first time)`)
  expect(ready !== null, "the imported theme's block is drawn in the preview", ready)
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-block-picker-list] [role='option']")].map((r) => r.getAttribute("data-block-choice")))
  note(`blocks offered: ${rows.join(", ")}`)
  const times = []
  for (const type of rows) {
    const ms = await p.evaluate((type) => new Promise((resolve) => {
      const row = [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === type)
      const t = performance.now()
      row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
      const tick = () => {
        const f = document.querySelector("[data-block-preview] iframe[data-bp-showing]")
        if (f?.getAttribute("data-bp-showing")?.startsWith(type + ":")) resolve(Math.round(performance.now() - t))
        else if (performance.now() - t > 2000) resolve(null)
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }), type)
    times.push(ms)
    await sleep(150)
    const info = await p.evaluate(() => {
      const f = document.querySelector("[data-block-preview] iframe")
      const t = f?.contentDocument?.querySelector("[data-bp-target]")
      return { found: !!t, note: document.querySelector("[data-block-preview] [data-preview-note]")?.textContent ?? null, text: t?.textContent?.trim().slice(0, 40) ?? null }
    })
    expect(info.found && !info.note, `${type}: found and drawn in the theme's own styles`, info)
    await p.screenshot({ path: shot(`compat-${type}`) })
  }
  note(`hover to preview in the imported theme: ${times.join(", ")}ms`)
  expect(times.every((t) => t !== null && t <= 80), "each on the next frame or so", times)
  /* Pick the Heading, and hold the canvas frame's block against the preview frame's. */
  const preview = await p.evaluate(() => {
    const row = [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === "heading")
    row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
    const t = document.querySelector("[data-block-preview] iframe").contentDocument.querySelector("[data-bp-target]")
    const cs = t.ownerDocument.defaultView.getComputedStyle(t)
    return { html: window.__norm(t), font: cs.fontFamily, size: cs.fontSize, color: cs.color, w: Math.round(t.getBoundingClientRect().width) }
  })
  let frame = await CANVAS_FRAME(p)
  const before = await frame.evaluate(() => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id")))
  await p.evaluate(() => [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === "heading").click())
  await sleep(2500)
  frame = (await CANVAS_FRAME(p)) ?? frame
  const landed = await frame.evaluate((before) => {
    const el = [...document.querySelectorAll("[data-block-id]")].find((e) => !before.includes(e.getAttribute("data-block-id")))
    if (!el) return null
    const c = el.cloneNode(true)
    for (const n of [c, ...c.querySelectorAll("*")]) for (const a of [...n.attributes]) if (/^data-(block-id|bp-|section-id|sl-block|editor|wb-)|^(id|aria-[a-z]+|tabindex|contenteditable|spellcheck|draggable|loading|decoding)$/.test(a.name)) n.removeAttribute(a.name)
    const cs = getComputedStyle(el)
    return { html: c.outerHTML.replace(/\s+/g, " ").trim(), font: cs.fontFamily, size: cs.fontSize, color: cs.color, w: Math.round(el.getBoundingClientRect().width) }
  }, before).catch((e) => ({ error: String(e).slice(0, 120) }))
  expect(!!landed && !landed.error, "the heading lands in the canvas's frame", landed?.error)
  if (landed && !landed.error) {
    expect(landed.html === preview.html, "the frame draws the markup the preview showed", landed.html === preview.html ? undefined : { preview: preview.html.slice(0, 160), canvas: landed.html.slice(0, 160) })
    expect(landed.font === preview.font && landed.size === preview.size && landed.color === preview.color, "in the same type and colour", { preview: [preview.size, preview.color, preview.font.slice(0, 30)], canvas: [landed.size, landed.color, landed.font.slice(0, 30)] })
    note(`width: preview ${preview.w}px, canvas ${landed.w}px`)
  }
  await p.screenshot({ path: shot("compat-added") })
  await p.close()
  srv.close()
}

/* ONLY=390 runs one size; ONLY=compat the imported theme alone. */
for (const kind of [{ w: 1440, h: 900 }, { w: 1280, h: 800 }, { w: 390, h: 844 }].filter((k) => !process.env.ONLY || String(k.w) === process.env.ONLY)) await run(kind)
if (!process.env.ONLY || process.env.ONLY === "compat") await compat()
await browser.close()
server.close()
console.log(`\n${bad === 0 ? "all good" : `${bad} failed`}; pictures in ${SHOTS}\n`)
if (bad && STRICT) process.exit(1)
