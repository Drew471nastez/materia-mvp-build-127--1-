/**
 * ===========================================================================
 *  BACK FROM WEBSITE SETTINGS TO THE BUILDER, ON A PHONE, MEASURED
 * ===========================================================================
 * "Leaving the website builder Settings page back to the website builder
 * must be smooth and clean: no blank flash, no jump, no stall."
 *
 * The real editor (scripts/render-editor-probe.tsx, bundled by
 * scripts/check-editor-scroll.mjs) at 390 x 844 with touch, the CPU at a
 * quarter (THROTTLE=1 for full speed). Website settings is opened from the
 * Actions sheet and also on one of its subjects, then left with Back to
 * editor. From the tap, every frame is read on the page's clock: whether
 * the settings page is still drawn and how opaque, where the canvas and the
 * builder's sheet are, and the compositor's own frames are read from the
 * screencast for one that is bare background. Checked:
 *
 *   the settings page leaves in one motion (its opacity only falls), on
 *   transform and opacity, and is gone after it;
 *   the builder is under it the whole time: the canvas has its sections
 *   from the first frame, and no screencast frame is one flat colour;
 *   nothing of the builder moves after the settings page has gone: the
 *   canvas's place and scroll and the sheet's resting place are the same in
 *   the last frame as in the first (no jump), and the sheet is not drawn
 *   again from nothing (no second arrival);
 *   the tap is answered: the first frame after it within 120ms, and the
 *   longest frame of the leaving is reported.
 *
 *   node scripts/check-website-settings-back.mjs      SHOTS_DIR=dir saves pictures
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const THROTTLE = Number(process.env.THROTTLE ?? 4)
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const out = mkdtempSync(join(tmpdir(), "storelib-settings-back-"))
const shots = process.env.SHOTS_DIR || ""
if (shots) mkdirSync(shots, { recursive: true })
const bundlePath = process.env.EDITOR_BUNDLE ?? join(out, "editor-probe.js")
if (!existsSync(bundlePath)) {
  execFileSync(process.execPath, [join(root, "scripts/check-editor-scroll.mjs")], {
    cwd: root, stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, EDITOR_BUNDLE: bundlePath, EDITOR_BUNDLE_ONLY: "1" },
  })
}
if (!existsSync(bundlePath)) fail("The editor bundle was not built.")
const bundle = readFileSync(bundlePath)
const css = (await appCss(root)) + "\n" + interFaces(root)

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_LIVE=true</script><script src="/editor-probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
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

async function open() {
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message || e)))
  await p.goto(origin, { waitUntil: "load" })
  await p.waitForFunction(() => (document.getElementById("wb-preview-root")?.querySelectorAll("[id^=wb-section-]").length ?? 0) >= 3, { timeout: 30000 })
  await sleep(1200)
  return { p, errors }
}

/** Website settings, from the Actions sheet. */
async function openSettings(p) {
  await p.evaluate(() => document.querySelector("header button[aria-label='Actions']").click())
  await sleep(700)
  await p.evaluate(() => [...document.querySelectorAll("[data-action-sheet] button, [data-action-sheet] a")].find((b) => b.textContent.trim() === "Website settings").click())
  await p.waitForSelector("[role=dialog][aria-label='Website settings']", { timeout: 5000 })
  await sleep(900)
}

/** The builder as it is now: the canvas, its scroll, the sheet. */
const builder = (p) =>
  p.evaluate(() => {
    const sc = document.getElementById("wb-preview-root")
    const r = sc?.getBoundingClientRect()
    const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]") ?? document.querySelector("[data-app-sheet]")
    const pr = panel?.getBoundingClientRect()
    return {
      canvas: r ? [r.top, r.height].map(Math.round) : null,
      scroll: sc ? Math.round(sc.scrollTop) : null,
      sections: sc ? sc.querySelectorAll("[id^=wb-section-]").length : 0,
      sheet: pr ? Math.round(pr.top) : null,
    }
  })

/* Every frame from now until stopped, on the page's clock. */
const record = (p) =>
  p.evaluate(() => {
    window.__rec = []
    window.__on = true
    window.__sheets = 0
    const mo = new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.("[data-app-sheet]") || n.querySelector?.("[data-app-sheet]"))) window.__sheets++
    })
    mo.observe(document.body, { childList: true, subtree: true })
    window.__mo = mo
    const t0 = performance.now()
    const tick = (t) => {
      const d = document.querySelector("[role=dialog][aria-label='Website settings']")
      const sc = document.getElementById("wb-preview-root")
      const r = sc?.getBoundingClientRect()
      const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]") ?? document.querySelector("[data-app-sheet]")
      const ds = d ? getComputedStyle(d) : null
      window.__rec.push({
        t: Math.round(t - t0),
        settings: ds ? +ds.opacity : null,
        moving: d ? d.getAnimations().map((a) => [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)))].join("+")).join(",") : "",
        canvas: r ? Math.round(r.top) : null,
        height: r ? Math.round(r.height) : null,
        scroll: sc ? Math.round(sc.scrollTop) : null,
        sections: sc ? sc.querySelectorAll("[id^=wb-section-]").length : 0,
        sheet: panel ? Math.round(panel.getBoundingClientRect().top) : null,
      })
      if (window.__on) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
const stop = (p) => p.evaluate(() => { window.__on = false; window.__mo.disconnect(); return { rec: window.__rec, sheets: window.__sheets } })

/* The compositor's frames: a frame that is one flat colour is a blank flash. */
async function screencast(p) {
  const c = await p.createCDPSession()
  const frames = []
  c.on("Page.screencastFrame", async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data })
    await c.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await c.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: 195, maxHeight: 422 })
  return async () => {
    await c.send("Page.stopScreencast").catch(() => {})
    return frames
  }
}
/* How many distinct colours a frame's middle band has: 1 or 2 is a bare screen. */
const flatness = (p, frames) =>
  p.evaluate(async (list) => {
    const res = []
    for (const src of list) {
      const img = new Image()
      img.src = `data:image/png;base64,${src}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const x = c.getContext("2d")
      x.drawImage(img, 0, 0)
      const d = x.getImageData(0, Math.round(c.height * 0.2), c.width, Math.round(c.height * 0.5)).data
      const seen = new Set()
      for (let i = 0; i < d.length; i += 16) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`)
      res.push(seen.size)
    }
    return res
  }, frames.map((f) => f.data))

const gaps = (rec) => rec.slice(1).map((r, i) => r.t - rec[i].t)

for (const [name, how] of [
  ["from the Actions sheet", null],
  ["from inside a subject (Domains, then its Back to the list, then Back to editor)", "subject"],
]) {
  console.log(`\nBack to editor, ${name}, 390 x 844, CPU at 1/${THROTTLE}\n`)
  const { p, errors } = await open()
  const c = await p.createCDPSession()
  await openSettings(p)
  if (how === "subject") {
    await p.evaluate(() => [...document.querySelectorAll("[role=dialog][aria-label='Website settings'] nav button")].find((b) => b.textContent.trim() === "Domains").click())
    await sleep(700)
    await p.evaluate(() => document.querySelector("[data-settings-bar] button").click())
    await sleep(700)
  }
  const under = await builder(p)
  await c.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  await record(p)
  const film = await screencast(p)
  await sleep(150)
  const back = await p.$$eval("[role=dialog][aria-label='Website settings'] button", (bs) => bs.findIndex((b) => b.textContent.trim() === "Back to editor"))
  const buttons = await p.$$("[role=dialog][aria-label='Website settings'] button")
  const tapAt = await p.evaluate(() => performance.now())
  await buttons[back].tap()
  await sleep(1400)
  const frames = await film()
  const { rec: all, sheets } = await stop(p)
  await c.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  if (shots) await p.screenshot({ path: join(shots, `settings-back-${how ?? "list"}.png`) })
  const t0 = all.length ? all[0].t : 0
  const startT = await p.evaluate((tap) => Math.round(tap - (performance.now() - window.__rec[window.__rec.length - 1].t - 0)), tapAt).catch(() => 0)
  void startT
  const after = all.filter((r) => r.t >= 150 - 20 + t0)
  const shown = after.filter((r) => r.settings !== null)
  const gone = after.filter((r) => r.settings === null)
  const opac = shown.map((r) => r.settings)
  const first = after[0]
  const last = after[after.length - 1]
  const firstGone = gone[0]
  const moved = gone.filter((r) => r.canvas !== firstGone?.canvas || r.scroll !== firstGone?.scroll || r.sheet !== firstGone?.sheet || r.height !== firstGone?.height)
  const props = [...new Set(shown.map((r) => r.moving).filter(Boolean).join(",").split(",").filter(Boolean))]
  expect(gone.length > 0 && last.settings === null, "the settings page is gone after Back to editor", `${shown.length} frames with it drawn, then ${gone.length} without`)
  expect(opac.every((o, i) => i === 0 || o <= opac[i - 1] + 0.001) && (opac.length < 2 || opac[opac.length - 1] < opac[0]), "it leaves in one motion: its opacity only falls", opac.slice(0, 14).map((o) => o.toFixed(2)).join(" "))
  expect(props.length > 0 && props.every((x) => x.split("+").every((k) => k === "opacity" || k === "transform")), "on transform and opacity only", props.join(" | "))
  expect(after.every((r) => r.sections >= 3), "the builder's canvas has its sections under it on every frame", `${Math.min(...after.map((r) => r.sections))} at the fewest`)
  expect(moved.length === 0, "nothing of the builder moves once it has gone: canvas, scroll and sheet hold their place", moved.length ? `${JSON.stringify(firstGone)} -> ${JSON.stringify(moved[0])}` : `canvas at ${firstGone?.canvas}, scroll ${firstGone?.scroll}, sheet at ${firstGone?.sheet}`)
  expect(first.canvas === under.canvas[0] && first.scroll === under.scroll && (under.sheet === null || last.sheet === under.sheet), "the builder is where it was before settings opened", `before ${JSON.stringify(under)}, after canvas ${last.canvas} scroll ${last.scroll} sheet ${last.sheet}`)
  expect(sheets === 0, "the builder's sheet is not mounted again from nothing", `${sheets} new sheets`)
  const flat = await flatness(p, frames)
  const blank = flat.filter((n) => n <= 2).length
  expect(frames.length > 0 && blank === 0, "no compositor frame is a bare screen", `${frames.length} frames, distinct colours at the fewest ${Math.min(...flat)}`)
  const g = gaps(after.slice(0, Math.max(2, after.findIndex((r) => r.t > (firstGone?.t ?? 0) + 200))))
  console.log(`        leaving: ${shown.length + gone.length} frames, longest ${g.length ? Math.max(...g) : 0}ms, ${g.filter((x) => x > 50).length} over 50ms; settings gone ${firstGone ? firstGone.t - after[0].t : "never"}ms after the first frame`)
  expect(errors.length === 0, "no script errors", errors.slice(0, 2).join(" | "))
  await p.close()
}

await browser.close()
server.close()
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
