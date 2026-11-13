/**
 * ROUND AU, TRACK 2: THE ONEPAGE EDITOR ON A SLOW PHONE, MEASURED.
 *
 * The real editor (scripts/render-onepage-editor.tsx) at 390x844 with touch, the
 * CPU slowed 4x through CDP, and at 1440x900 slowed 2x.
 *
 *   open     a block's fields opened by a tap: the time to the next two frames
 *   typing   characters typed into a link's title: main thread time per
 *            keystroke, the longest task, and React commits per keystroke
 *   scroll   the Links list scrolled by a touch gesture: frame intervals
 *   safety   at 390 with touch: a Save with the network off says it is retrying
 *            and lands once the network is back, with no second press; an edit
 *            survives a reload (kept on the device) and comes back; a save over a
 *            page saved elsewhere is answered 409, says so, and a second Save
 *            keeps this copy
 *
 *   node scripts/check-onepage-au2.mjs      (REPORT=1 prints without failing)
 */
import puppeteer from "puppeteer-core"
import { existsSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}

const BLOCKS = [
  { id: "hd", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } },
  ...Array.from({ length: 24 }, (_, i) => ({ id: `x${i}`, type: "link_button", enabled: true, sort_order: i, data: { label: `Link ${i + 1}`, url: `https://example.com/${i}` } })),
  { id: "em", type: "email_capture", enabled: true, sort_order: 30, data: { headline: "Join my newsletter", description: "Get updates", placeholder: "Enter your email", button_preset: "subscribe", custom_button_text: "", layout_type: "default", animation_type: "none" } },
]

/* The stub API's answer to a save: what each PUT sent, and a 409 while `conflict` is on. */
const saves = []
let conflict = false
const api = (req, body) => {
  if (req.method === "PUT" && req.url.split("?")[0] === "/api/onepage") {
    let sent = {}
    try { sent = JSON.parse(body) } catch {}
    saves.push({ base: sent.base_version ?? null, bio: sent.bio ?? null, at: Date.now() })
    if (conflict && sent.base_version) return { status: 409, body: { error: "This page was saved somewhere else since you opened it", conflict: true } }
    return { status: 200, body: { onepage: {}, edit_version: `${(saves.length).toString(16).padStart(16, "0")}` } }
  }
  return null
}
const { base, server } = await serveEditorProbe({ blocks: BLOCKS, api })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-gpu"] })
const out = {}

async function open(viewport, cpu) {
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
  await page.setViewport(viewport)
  await page.evaluateOnNewDocument(() => {
    /* Each measurement starts with nothing kept on the device. */
    try { for (const k of Object.keys(localStorage)) if (k.startsWith("storelib:onepage-draft:")) localStorage.removeItem(k) } catch {}
    window.__long = []
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration) }).observe({ type: "longtask", buffered: true }) } catch {}
  })
  await page.goto(`${base}/app/onepage#links`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-block-id]", { timeout: 30000 })
  await page.waitForSelector("[data-onepage-loader]", { hidden: true, timeout: 20000 }).catch(() => null)
  await sleep(1500)
  const cdp = await page.createCDPSession()
  await cdp.send("Performance.enable")
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  return { page, cdp }
}
const taskMs = async (cdp) => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "TaskDuration").value * 1000

async function run(label, viewport, cpu) {
  const { page, cdp } = await open(viewport, cpu)
  const r = {}
  /* open: a tap on a link's row, to two frames later */
  await page.$eval('[data-block-id="x2"]', (e) => e.scrollIntoView({ block: "center" }))
  await sleep(400)
  await page.evaluate(() => { window.__long = [] })
  const t0 = await taskMs(cdp)
  const openMs = await page.evaluate(async () => {
    const row = document.querySelector('[data-block-id="x2"] .cursor-pointer')
    const s = performance.now()
    row?.click()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return performance.now() - s
  })
  await sleep(1200)
  r.open = { toFrameMs: Math.round(openMs), mainMs: Math.round((await taskMs(cdp)) - t0), longest: Math.round(Math.max(0, ...(await page.evaluate(() => window.__long)))) }

  /* typing: the link's title field */
  const field = await page.evaluateHandle(() => [...document.querySelectorAll("input, textarea")].find((i) => i.value === "Link 3" && i.getClientRects().length) || null)
  const el = field.asElement()
  check(!!el, `${label}: the link's title field is open`)
  if (el) {
    await el.focus()
    await page.evaluate(() => { const i = document.activeElement; i.setSelectionRange?.(i.value.length, i.value.length) })
    await sleep(300)
    await page.evaluate(() => { window.__long = []; window.__c0 = window.__commits })
    const t1 = await taskMs(cdp)
    const text = " for the spring"
    const per = []
    if (process.env.PROFILE) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
    for (const ch of text) {
      const a = await taskMs(cdp)
      await page.keyboard.type(ch)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))))
      per.push((await taskMs(cdp)) - a)
    }
    if (process.env.PROFILE) {
      const { profile } = await cdp.send("Profiler.stop")
      const byId = new Map(profile.nodes.map((n) => [n.id, n]))
      const self = new Map()
      const dt = profile.timeDeltas
      profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000) })
      /* inclusive time per function, each sample counted once per distinct function on its stack */
      const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id)
      const incl = new Map()
      profile.samples.forEach((id, i) => { const seen = new Set(); let cur = id; while (cur != null) { const n = byId.get(cur); const k = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + (dt[i] || 0) / 1000) } cur = parent.get(cur) } })
      console.log("SELF", [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(" | "))
      console.log("INCL", [...incl].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(" | "))
    }
    await sleep(1500)
    const total = (await taskMs(cdp)) - t1
    const commits = await page.evaluate(() => window.__commits - window.__c0)
    const longs = await page.evaluate(() => window.__long)
    per.sort((a, b) => a - b)
    r.typing = { keys: text.length, mainMsPerKey: Math.round(total / text.length), p95KeyMs: Math.round(per[Math.floor(per.length * 0.95)]), maxKeyMs: Math.round(per[per.length - 1]), longTasks: longs.length, longest: Math.round(Math.max(0, ...longs)), commitsPerKey: +(commits / text.length).toFixed(1) }
  }

  /* scroll: the list, by a touch gesture (or the wheel on a computer) */
  await page.evaluate(() => { window.__long = []; window.__frames = []; let last = performance.now(); window.__stopF = false; const f = (t) => { window.__frames.push(t - last); last = t; if (!window.__stopF) requestAnimationFrame(f) }; requestAnimationFrame(f) })
  if (viewport.hasTouch) {
    for (let i = 0; i < 3; i++) await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 600, yDistance: -500, speed: 1200, gestureSourceType: "touch" })
    for (let i = 0; i < 3; i++) await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 300, yDistance: 500, speed: 1200, gestureSourceType: "touch" })
  } else {
    for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: 200 }); await sleep(30) }
    for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: -200 }); await sleep(30) }
  }
  await sleep(300)
  const frames = (await page.evaluate(() => { window.__stopF = true; return window.__frames.slice(2) })).sort((a, b) => a - b)
  const longs = await page.evaluate(() => window.__long)
  r.scroll = { frames: frames.length, medianMs: Math.round(frames[Math.floor(frames.length / 2)] || 0), p95Ms: Math.round(frames[Math.floor(frames.length * 0.95)] || 0), over50: frames.filter((f) => f > 50).length, longTasks: longs.length }
  out[label] = r
  console.log(label, JSON.stringify(r))
  await page.close()
}

const bioField = (page) => page.evaluateHandle(() => [...document.querySelectorAll("textarea, input")].find((i) => i.value === "Prints, posters and a newsletter" && i.getClientRects().length) || null)

async function safety() {
  console.log("\n── safety (390 touch)")
  const vp = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
  await page.setViewport(vp)
  /* Leaving with unsaved work asks first (beforeunload): a reload here is the app killed, so it is answered. */
  page.on("dialog", (d) => void d.accept().catch(() => {}))
  await page.evaluateOnNewDocument(() => { window.PROBE_EDIT_VERSION = "00000000000000aa" })
  const ready = async () => {
    await page.waitForSelector("[data-block-id]", { timeout: 30000 })
    await page.waitForSelector("[data-onepage-loader]", { hidden: true, timeout: 20000 }).catch(() => null)
    await sleep(1200)
  }
  await page.goto(`${base}/app/onepage#links`, { waitUntil: "domcontentloaded" })
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("storelib:onepage-draft:")) localStorage.removeItem(k) })
  await page.reload({ waitUntil: "domcontentloaded" })
  await ready()
  const saveState = () => page.$eval("[data-onepage-save]", (b) => b.getAttribute("data-onepage-save")).catch(() => null)
  const editLink = async (text) => {
    await page.$eval('[data-block-id="x0"]', (e) => e.scrollIntoView({ block: "center" }))
    if (!(await page.$('[data-block-id="x0"] [data-block-settings]'))) { await page.evaluate(() => document.querySelector('[data-block-id="x0"] .cursor-pointer')?.click()); await sleep(900) }
    const h = await page.evaluateHandle(() => [...document.querySelectorAll('[data-block-id="x0"] input')].find((i) => i.value.startsWith("Link 1") && i.getClientRects().length) || null)
    const el = h.asElement()
    if (!el) return false
    await el.focus()
    await page.evaluate(() => { const i = document.activeElement; i.setSelectionRange?.(i.value.length, i.value.length) })
    await page.keyboard.type(text)
    return true
  }

  /* 1. Offline: Save says it is retrying, and lands once the network is back without a second press. */
  check(await editLink(" A"), "safety: a link's title typed into")
  await sleep(300)
  await page.setOfflineMode(true)
  const before = saves.length
  await page.click("[data-onepage-save]")
  await sleep(1200)
  const offlineState = await saveState()
  check(offlineState === "retrying", `safety: offline, the Save button says it is retrying (${offlineState})`)
  const label = await page.$eval("[data-onepage-save]", (b) => b.textContent.trim())
  check(/Not saved, retrying/.test(label) || vp.width < 640, `safety: in words where the button has room (${JSON.stringify(label)})`)
  await sleep(2500)
  check(saves.length === before, `safety: nothing reached the server while offline (${saves.length - before})`)
  await page.setOfflineMode(false)
  await page.evaluate(() => window.dispatchEvent(new Event("online")))
  await sleep(2500)
  const after = await saveState()
  check(saves.length === before + 1 && after === "saved", `safety: back online, the save lands on its own, once (${saves.length - before} PUT, state ${after})`)
  check(saves[saves.length - 1]?.base === "00000000000000aa", `safety: the save named the copy it started from (${saves[saves.length - 1]?.base})`)

  /* 2. An edit kept on the device survives a reload (an app killed in the background). */
  check(await editLink(" B"), "safety: typed again")
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))
  await sleep(700)
  const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("storelib:onepage-draft:")).length)
  check(kept === 1, `safety: the unsaved edit is kept on the device (${kept})`)
  /* The server now holds the copy the last save wrote (edit version 1): the editor opens on it. */
  await page.evaluateOnNewDocument((v) => { window.PROBE_EDIT_VERSION = v }, saves[saves.length - 1] ? (saves.length).toString(16).padStart(16, "0") : null)
  await page.reload({ waitUntil: "domcontentloaded" })
  await ready()
  const question = await page.$("[data-draft-question]")
  /* The harness opens the page as first drawn (not as saved), so the kept draft's base is the version the save answered, and the page opened is another: the editor asks. */
  if (question) {
    check(true, "safety: after the reload the editor asks which copy to keep")
    await page.click("[data-draft-use-device]")
    await sleep(800)
  }
  const restored = await page.evaluate(() => [...document.querySelectorAll("input")].some((i) => i.value === "Link 1 A B")) || await page.evaluate(() => { document.querySelector('[data-block-id="x0"] .cursor-pointer')?.click(); return new Promise((r) => setTimeout(() => r([...document.querySelectorAll("input")].some((i) => i.value === "Link 1 A B")), 900)) })
  const dirty = await saveState()
  check(restored && dirty === "idle", `safety: the edit is back after the reload, unsaved (${restored}, ${dirty})`)

  /* 3. Saved somewhere else since: 409, said so, and the second Save keeps this copy. */
  conflict = true
  const c0 = saves.length
  await page.click("[data-onepage-save]")
  await sleep(1200)
  const refused = await saveState()
  const toast = await page.evaluate(() => document.body.innerText.includes("saved somewhere else"))
  check(refused === "failed" && toast, `safety: a save over a newer copy is refused and says so (${refused}, toast ${toast})`)
  await page.click("[data-onepage-save]")
  await sleep(1500)
  const second = saves.slice(c0)
  check(second.length === 2 && second[0].base !== null && second[1].base === null && (await saveState()) === "saved", `safety: the second Save sends no base and lands (${JSON.stringify(second.map((s) => s.base))})`)
  conflict = false
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("storelib:onepage-draft:")).length)
  check(left === 0, `safety: once saved, nothing is left on the device (${left})`)

  await page.close()
}

try {
  if (!process.env.SKIP_SAFETY) await safety()
  await run("390 touch cpu4x", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 4)
  if (!process.env.ONLY390) await run("1440 cpu2x", { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, 2)
} finally {
  await browser.close()
  server.close()
}
if (failures.length && !report) { console.log(`\n${failures.length} failed`); process.exit(1) }
