/**
 * ===========================================================================
 *  ROUND AR3: EVERY BLOCK'S LAYOUTS, ITS WORDS, ITS SETTINGS, MEASURED
 * ===========================================================================
 * scripts/render-onepage-ar3.tsx draws the real live page (?live), the same
 * page as the editor's preview draws it (?preview), and the real editor with
 * one block of every type. This reads, in headless Chromium:
 *
 *   matrix     every block type x every Layout choice, at 390 (a phone,
 *              touch) and 1440, on the live page and in the preview:
 *                words     the block's title and description are drawn
 *                distinct  no two layouts of one block draw the same boxes
 *                same      the preview draws each block as the live page does
 *   settings   every block type opened in the editor: its settings are
 *              there, visible (opacity 1) and more than a line tall, also
 *              when what is inside grows while it opens (image 137)
 *
 * Nothing leaves the machine: every request to another host is answered
 * here with an empty page (no provider is called).
 *
 *   node scripts/check-onepage-ar3.mjs            SHOTS=<dir> for pictures
 *   ONLY=matrix | settings                        one half
 *   REPORT=1                                      print, do not fail
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const ONLY = process.env.ONLY || ""
const report = !!process.env.REPORT
const shots = process.env.SHOTS || ""
if (shots) mkdirSync(shots, { recursive: true })
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-ar3.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const lines = []
const expect = (ok, what, got) => {
  const line = `  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`
  console.log(line)
  lines.push(line)
  if (!ok) broken++
}

const PRODUCTS = [1, 2].map((n) => ({ id: `6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c2${n}`, title: `Guide ${n}`, price_cents: 900 * n, thumbnail_url: null, status: "published", type: "digital", slug: `g${n}`, created_at: "2026-01-01" }))

async function newPage(width) {
  const p = await browser.newPage()
  const phone = width < 600
  await p.setViewport({ width, height: phone ? 844 : 900, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    /* The harness's pictures: a coloured box of the size the address names. */
    const pic = u.match(/^https:\/\/pics\.probe\.test\/(\d+)-(\d+)x(\d+)\.svg/)
    if (pic) {
      const [, n, w, h] = pic
      return r.respond({ status: 200, contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" }, body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 67},55%,55%)"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="#fff"/></svg>` })
    }
    /* Another host (YouTube, Spotify, Instagram...): an empty page, never the real one. */
    return r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><title>stub</title>" })
  })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.evaluateOnNewDocument((products) => { window.PROBE_PRODUCTS = products }, PRODUCTS)
  return { p, errors }
}

/* ── The matrix ─────────────────────────────────────────────────────── */

const READ = () => {
  const rows = window.__MATRIX
  const out = {}
  for (const r of rows) {
    const el = document.querySelector(`[data-op-block="${r.id}"]`)
    if (!el) { out[r.id] = null; continue }
    const box = el.getBoundingClientRect()
    /* Every drawn box inside, relative to the block, rounded: two layouts that draw the same boxes look the same. */
    const parts = []
    for (const n of el.querySelectorAll("*")) {
      const b = n.getBoundingClientRect()
      if (b.width < 2 || b.height < 2) continue
      const cs = getComputedStyle(n)
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue
      parts.push(`${n.tagName}:${Math.round((b.left - box.left) / 4)},${Math.round((b.top - box.top) / 4)},${Math.round(b.width / 4)},${Math.round(b.height / 4)}`)
    }
    const text = (el.innerText || "").replace(/\s+/g, " ").trim()
    out[r.id] = { w: Math.round(box.width), h: Math.round(box.height), sig: parts.join("|"), text, frames: el.querySelectorAll("iframe,video").length, imgs: [...el.querySelectorAll("img")].map((i) => getComputedStyle(i).objectFit + ":" + Math.round(i.getBoundingClientRect().width) + "x" + Math.round(i.getBoundingClientRect().height)) }
  }
  return out
}

async function matrix(mode, width) {
  const { p, errors } = await newPage(width)
  await p.goto(`${base}/app/onepage?${mode}`, { waitUntil: "domcontentloaded" })
  await p.waitForFunction(() => window.__MATRIX && document.querySelector("[data-op-block]"), { timeout: 20000 })
  /* Scroll through once so every lazy picture and card has been in view. */
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)) } window.scrollTo(0, 0) })
  await sleep(700)
  /* The page's entrance (each block fades in 50ms after the one above) is finished at once, so the pictures show the blocks themselves. */
  await p.addStyleTag({ content: "[data-onepage-enter]{animation:none!important;opacity:1!important;transform:none!important}" })
  await sleep(100)
  const rows = await p.evaluate(() => window.__MATRIX)
  const got = await p.evaluate(READ)
  /* Each embed's frame: its box before the service answers (nothing answers here), and whether it waits to be near the screen. */
  const embeds = await p.evaluate(() => [...document.querySelectorAll('[data-op-block^="link_embed"]')].map((el) => {
    const f = el.querySelector("iframe")
    const box = el.querySelector("[data-native-social],[data-compact-post]")
    return { id: el.getAttribute("data-op-block"), frame: !!f, lazy: f?.getAttribute("loading") === "lazy", h: box ? Math.round(box.getBoundingClientRect().height) : 0, sandbox: f?.getAttribute("sandbox") || "" }
  }))
  if (shots && width === 390) {
    for (const g of [...new Set(rows.map((r) => r.group))]) {
      const ids = rows.filter((r) => r.group === g).map((r) => r.id)
      const clip = await p.evaluate((ids) => {
        const els = ids.map((id) => document.querySelector(`[data-op-block="${id}"]`)).filter(Boolean)
        if (!els.length) return null
        const top = Math.min(...els.map((e) => e.getBoundingClientRect().top + scrollY)), bottom = Math.max(...els.map((e) => e.getBoundingClientRect().bottom + scrollY))
        return { x: 0, y: Math.max(0, top - 8), width: innerWidth, height: Math.min(6000, bottom - top + 16) }
      }, ids)
      if (clip) await p.screenshot({ path: join(shots, `${mode}-${width}-${g}.png`), clip, captureBeyondViewport: true })
    }
  }
  await p.close()
  return { rows, got, errors, embeds }
}

if (!ONLY || ONLY === "matrix") {
  for (const width of [390, 1440]) {
    const live = await matrix("live", width)
    const preview = await matrix("preview", width)
    console.log(`\nMatrix at ${width}: ${live.rows.length} blocks in ${new Set(live.rows.map((r) => r.group)).size} groups`)
    expect(live.errors.length === 0 && preview.errors.length === 0, `${width}: no page errors`, [...live.errors, ...preview.errors].slice(0, 3))
    for (const e of live.embeds) expect(e.frame && e.h >= 150 && (e.id.endsWith("instagram") || e.lazy), `${width} ${e.id}: shown in place in a lazy frame with its room kept before it loads`, `${e.h}px${e.lazy ? " lazy" : ""}${/allow-forms/.test(e.sandbox) ? " forms" : ""}`)
    const groups = [...new Set(live.rows.map((r) => r.group))]
    for (const g of groups) {
      const rs = live.rows.filter((r) => r.group === g)
      const missing = rs.filter((r) => !live.got[r.id])
      const noTitle = rs.filter((r) => live.got[r.id] && !live.got[r.id].text.includes(`T ${r.id}`))
      const noDesc = rs.filter((r) => live.got[r.id] && !live.got[r.id].text.includes(`D ${r.id}`))
      /* Two layouts that draw exactly the same boxes. */
      const same = []
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = live.got[rs[i].id], b = live.got[rs[j].id]
        if (a && b && a.sig === b.sig) same.push(`${rs[i].layout}=${rs[j].layout}`)
      }
      const drift = rs.filter((r) => live.got[r.id] && preview.got[r.id] && (Math.abs(live.got[r.id].h - preview.got[r.id].h) > 2 || live.got[r.id].frames !== preview.got[r.id].frames))
      expect(!missing.length, `${width} ${g}: every layout is drawn`, missing.map((r) => r.layout))
      expect(!noTitle.length, `${width} ${g}: the title is drawn in every layout`, noTitle.map((r) => r.layout))
      expect(!noDesc.length, `${width} ${g}: the description is drawn in every layout`, noDesc.map((r) => r.layout))
      expect(!same.length, `${width} ${g}: each layout draws differently (${rs.length})`, same)
      expect(!drift.length, `${width} ${g}: the preview draws it as the live page`, drift.map((r) => `${r.layout} ${live.got[r.id].h}/${preview.got[r.id].h}`))
      if (g.endsWith("_fit")) {
        const fits = rs.map((r) => (live.got[r.id]?.imgs || []).join(","))
        expect(new Set(fits).size === rs.length, `${width} ${g}: Cover, Contain and Full draw the picture differently`, fits)
      }
    }
  }
}

/* ── Every block's settings ─────────────────────────────────────────── */

if (!ONLY || ONLY === "settings") {
  for (const width of [390, 1440]) {
    const { p, errors } = await newPage(width)
    await p.goto(`${base}/app/onepage#links`, { waitUntil: "domcontentloaded" })
    await p.waitForSelector("[data-block-open]", { timeout: 20000 })
    await sleep(800)
    const blocks = await p.evaluate(() => window.__EDITOR_BLOCKS)
    const empty = []
    const firstMissed = []
    let grown = null
    for (const [n, b] of blocks.entries()) {
      const sel = `[data-block-open="${b.id}"]`
      if (!(await p.$(sel))) { empty.push(`${b.id}: no row`); continue }
      await p.$eval(sel, (e) => e.scrollIntoView({ block: "center" }))
      if ((await p.$eval(sel, (e) => e.getAttribute("aria-expanded"))) !== "true") await p.click(sel)
      /* At 1440 the very first press on the list after load is sometimes not taken (seen on the first row only); pressed again, as a person would. */
      await sleep(250)
      if ((await p.$eval(sel, (e) => e.getAttribute("aria-expanded"))) !== "true") { firstMissed.push(b.id); await p.click(sel) }
      /* Image 137's cause: the editor grows while its open is held for two frames. The first block opened is made to grow then. */
      if (n === 0 || b.id === "e_shelf_digital") {
        await p.evaluate((id) => {
          const box = document.getElementById(document.querySelector(`[data-block-open="${id}"]`).getAttribute("aria-controls"))
          const inner = box?.firstElementChild
          if (!inner) return
          requestAnimationFrame(() => { const s = document.createElement("div"); s.style.height = "220px"; s.dataset.grow = ""; inner.appendChild(s) })
        }, b.id)
      }
      await sleep(900)
      const m = await p.evaluate((id) => {
        const box = document.getElementById(document.querySelector(`[data-block-open="${id}"]`).getAttribute("aria-controls"))
        if (!box) return null
        const inner = box.firstElementChild
        const r = box.getBoundingClientRect()
        const fields = box.querySelectorAll("input,textarea,button,[role=radio],[role=switch]").length
        const text = (box.innerText || "").replace(/\s+/g, " ").trim()
        return { h: Math.round(r.height), opacity: Number(getComputedStyle(inner).opacity), fields, text: text.length, anims: inner.getAnimations().map((a) => a.playState) }
      }, b.id)
      if (n === 0 || b.id === "e_shelf_digital") grown = { id: b.id, ...m }
      if (!m || m.h < 60 || m.opacity < 0.99 || m.fields < 1 || m.text < 8) empty.push(`${b.id}${b.provider ? `(${b.provider})` : ""}: ${JSON.stringify(m)}`)
      if (shots && width === 390 && (b.id === "e_shelf_digital" || b.id === "e_music" || b.id === "e_video" || b.id === "e_app_tiktok")) await p.screenshot({ path: join(shots, `settings-${width}-${b.id}.png`) })
      await p.evaluate(() => document.querySelectorAll("[data-grow]").forEach((e) => e.remove()))
      if ((await p.$eval(sel, (e) => e.getAttribute("aria-expanded"))) === "true") await p.click(sel)
      await sleep(350)
    }
    console.log(`\nSettings at ${width}: ${blocks.length} blocks opened`)
    expect(errors.length === 0, `${width}: no page errors`, errors.slice(0, 3))
    expect(empty.length === 0, `${width}: every block's settings are drawn, visible and filled`, empty)
    if (firstMissed.length) console.log(`  note  ${width}: a press that did not open the row the first time: ${firstMissed.join(", ")}`)
    expect(!!grown && grown.opacity >= 0.99, `${width}: settings that grow while opening still show (image 137)`, grown)
    await p.close()
  }
}

await browser.close()
server.close()
console.log(`\n${broken ? `${broken} FAILED` : "all passed"} (Chromium paints at 60 Hz)`)
if (broken && !report) process.exit(1)
