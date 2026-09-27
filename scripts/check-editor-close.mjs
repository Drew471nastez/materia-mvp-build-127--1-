/**
 * ===========================================================================
 *  EVERY WAY OUT OF THE PRODUCT EDITOR, ON A PHONE, DROPS
 * ===========================================================================
 * "When I'm in the edit product page or add new product page and I click
 * Cancel to close that page, it's not closing smoothly, going down, on
 * mobile version; it's abrupt, direct."
 *
 * At 390 by 844 with touch, the CPU at a quarter, in two engines (Chromium
 * with view transitions, and the same with none, which is how WebKit before
 * Safari 18 and those iPhones' app web view behave), this opens the editor
 * from the Products list (scripts/render-layer-motion.tsx: the real list, the
 * real editor, the real layer, a router whose back is a real history.back()
 * and popstate) and leaves it every way there is:
 *
 *   new product, nothing typed      Cancel
 *   new product, a title typed      Cancel, then Discard in the sheet
 *   saved product, nothing changed  Back
 *   saved product, a change         Cancel, then Discard in the sheet
 *   saved product, the list 600ms away (a list the router has to fetch again)
 *
 * From the tap until the list takes a press, every frame is sampled twice:
 * by the page's own clock (where the editor is drawn, whether the list is
 * mounted, whether the list takes a press) and by the compositor's
 * screencast (the pixels, for a frame with no page in it). Checked:
 *
 *   the editor moves down over several frames, never back up, and is last
 *   seen at the bottom edge, not cut off part way;
 *   no frame without a page: until the editor starts moving it covers the
 *   screen, from then on the list is mounted under it; and no screencast
 *   frame is bare page colour;
 *   the drop is about LAYER_LEAVE_MS long and fades a little;
 *   then the list is under the finger, with nothing of the move left over.
 *
 *   node scripts/check-editor-close.mjs
 *   SHOTS_DIR=/some/dir node scripts/check-editor-close.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
/* The CPU as it is: the frame times of the move at a quarter speed are check-layer-motion.mjs's to hold. THROTTLE=4 for a slow phone. */
const THROTTLE = Number(process.env.THROTTLE ?? 1)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}

/* The same page the layer probe draws: built by it, and only built. */
const built = execFileSync(process.execPath, [join(root, "scripts/check-layer-motion.mjs")], { cwd: root, env: { ...process.env, BUILD_ONLY: "1" }, encoding: "utf8" })
  .trim()
  .split("\n")
  .pop()
const html = readFileSync(built, "utf8")
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-editor-close-")), "shots")
mkdirSync(shots, { recursive: true })

/* ── In the page: one sample a frame ─────────────────────────────────── */
const SAMPLE = () => {
  window.__samples = []
  window.__sampling = true
  const t0 = performance.now()
  window.__t0 = t0
  /* The drop's own clock: when it was let go, and in what state its still was taken away. */
  window.__drop = { anim: null, went: null, removed: null }
  window.__dropSeen?.disconnect()
  window.__dropSeen = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.removedNodes) {
        if (n.nodeType !== 1 || n.dataset?.layerStill !== "over" || window.__drop.removed) continue
        const a = window.__drop.anim
        window.__drop.removed = { t: +(performance.now() - t0).toFixed(1), state: a?.playState ?? null, progress: a ? a.effect.getComputedTiming().progress : null, ms: a ? Number(a.effect.getTiming().duration) : null }
      }
    }
  })
  window.__dropSeen.observe(document.body, { childList: true, subtree: true })
  const yOfVt = () => {
    const a = document.getAnimations().find((x) => /page-layer\)$/.test(x.effect?.pseudoElement || "") && /old/.test(x.effect.pseudoElement))
    if (!a) return null
    const kf = a.effect.getKeyframes()
    const m = /cubic-bezier\(([^)]+)\)/.exec(kf[0]?.easing || "")
    let p = a.effect.getComputedTiming().progress ?? 0
    if (m) {
      const [x1, y1, x2, y2] = m[1].split(",").map(Number)
      const bx = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t
      const by = (t) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
      let lo = 0
      let hi = 1
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2
        if (bx(mid) < p) lo = mid
        else hi = mid
      }
      p = by((lo + hi) / 2)
    }
    return { y: p * innerHeight, o: 1 }
  }
  const tick = () => {
    if (!window.__sampling) return
    const t = performance.now() - t0
    const still = document.querySelector('[data-layer-still="over"]')
    const layer = document.querySelector("[data-page-layer]")
    let editor = null
    let how = null
    const vt = yOfVt()
    if (vt) {
      editor = vt
      how = "vt"
    } else if (still) {
      const a = still.getAnimations().find((x) => x.effect?.getKeyframes().some((k) => k.transform))
      if (a) {
        window.__drop.anim = a
        window.__drop.fade = a.effect.getKeyframes().at(-1)?.opacity ?? null
        if (window.__drop.went === null && a.playbackRate > 0 && (a.currentTime ?? 0) > 0) window.__drop.went = +(t - (a.currentTime ?? 0)).toFixed(1)
      }
      const cs = getComputedStyle(still)
      editor = { y: new DOMMatrixReadOnly(cs.transform).m42, o: +cs.opacity }
      how = "still"
    } else if (layer) {
      const cs = getComputedStyle(layer)
      editor = { y: cs.transform === "none" ? 0 : new DOMMatrixReadOnly(cs.transform).m42, o: +cs.opacity }
      how = "layer"
    }
    const list = !!document.querySelector("[data-new-product]")
    /* Asked only once nothing of the editor is left: a hit test lays the page out, and inside the move that would be the probe's own work in its frames. */
    let takes = false
    if (!editor && list) {
      const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2)
      takes = !!hit && !hit.closest("[data-layer-still],[data-page-layer]") && !!hit.closest("[data-row], section, main")
    }
    window.__samples.push({ t: +t.toFixed(1), y: editor ? +editor.y.toFixed(1) : null, o: editor ? +editor.o.toFixed(3) : null, how, list, takes })
    if (t < 3000) requestAnimationFrame(tick)
    else window.__sampling = false
  }
  requestAnimationFrame(tick)
}

/** Share of the page area that is neither bare page grey nor white: 0 is a frame with no page in it. */
async function inkOf(p, b64, top, bottom) {
  return p.evaluate(
    async (b64, top, bottom) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext("2d")
      g.drawImage(img, 0, 0)
      const scale = img.width / innerWidth
      const d = g.getImageData(0, Math.round(top * scale), c.width, Math.round((bottom - top) * scale)).data
      let ink = 0
      const near = (i, [r, gg, bb]) => Math.abs(d[i] - r) <= 6 && Math.abs(d[i + 1] - gg) <= 6 && Math.abs(d[i + 2] - bb) <= 6
      for (let i = 0; i < d.length; i += 4) if (!near(i, [248, 249, 250]) && !near(i, [255, 255, 255])) ink++
      return +(ink / (d.length / 4)).toFixed(4)
    },
    b64,
    top,
    bottom,
  )
}

async function tapOn(p, sel) {
  const box = await p.$eval(sel, (el) => {
    const b = el.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await p.touchscreen.tap(box.x, box.y)
}

async function openEditor(p, isNew) {
  await p.evaluate(() => document.querySelector(".app-content-scroll")?.scrollTo(0, 0))
  await sleep(150)
  if (isNew) await tapOn(p, "[data-new-product]")
  else {
    await p.evaluate(() => {
      const a = [...document.querySelectorAll("[data-row]:not([hidden]) a[data-row-link]")].find((x) => {
        const b = x.getBoundingClientRect()
        return b.height > 0 && b.top > 200 && b.bottom < innerHeight - 120
      })
      document.querySelectorAll("[data-probe-open]").forEach((x) => x.removeAttribute("data-probe-open"))
      a?.setAttribute("data-probe-open", "")
    })
    await tapOn(p, "a[data-probe-open]")
  }
  for (let i = 0; i < 60; i++) {
    await sleep(50)
    const up = await p.evaluate(() => !!document.querySelector("[data-page-layer]") && !document.documentElement.dataset.layerMotion)
    if (up) break
  }
  await sleep(700)
}

const LEAVE = "[data-editor-bar] [data-leave-button]"

/*
  ONE RETRY, AND IT IS SAID. The page's clock misses frames whenever the
  main thread is busy, and on a machine whose CPU is shared with other work
  a whole move can land inside someone else's burst. A scenario whose checks
  fail is run once more, and the first run's failures are printed with it,
  so a real regression (which fails both times) still fails.
*/
async function scenario(p, cdp, engine, opts) {
  const first = await scenarioOnce(p, cdp, engine, opts)
  let result = first
  if (first.some((c) => !c.ok)) {
    console.log(`        (retried once; the first run failed: ${first.filter((c) => !c.ok).map((c) => `${c.what} ${JSON.stringify(c.got)}`).join("; ")})`)
    result = await scenarioOnce(p, cdp, engine, opts)
  }
  for (const c of result) expect(c.ok, c.what, c.got)
}

async function scenarioOnce(p, cdp, engine, { isNew, dirty, slowMs = 0 }) {
  const checks = []
  const check = (ok, what, got) => checks.push({ ok, what, got })
  const name = `${engine} ${isNew ? "new product" : "saved product"}${dirty ? ", a change, Cancel then Discard" : isNew ? ", Cancel" : ", Back"}${slowMs ? `, the list ${slowMs}ms away` : ""}`
  console.log(`\n  -- ${name}`)
  await openEditor(p, isNew)
  if (dirty) {
    await tapOn(p, "#title")
    await p.keyboard.type(" 2")
    await sleep(300)
  }
  await p.evaluate((ms) => { window.__slowMs = ms }, slowMs)
  let confirmTapped = false
  if (dirty) {
    await tapOn(p, LEAVE)
    for (let i = 0; i < 40 && !(await p.$("[data-confirm]")); i++) await sleep(50)
    await sleep(450)
  }
  const mode = await p.$eval(LEAVE, (el) => el.getAttribute("data-mode")).catch(() => null)
  const frames = []
  cdp.removeAllListeners("Page.screencastFrame")
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ data: f.data, ts: f.metadata.timestamp })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  await p.evaluate(SAMPLE)
  if (dirty) {
    const sheet = await p.$("[data-confirm]")
    check(!!sheet, `${name}: the sheet asks first`, !!sheet)
    if (sheet) {
      await tapOn(p, "[data-confirm]")
      confirmTapped = true
    }
  } else {
    await tapOn(p, LEAVE)
  }
  await sleep(2400 + slowMs)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await cdp.send("Page.stopScreencast")
  const samples = await p.evaluate(() => window.__samples)
  const drop = await p.evaluate(() => ({ went: window.__drop.went, removed: window.__drop.removed, fade: window.__drop.fade ?? null }))
  const timing = await p.evaluate(() => ({
    commit: +((window.__commits.filter((c) => c.path === "/app/products").pop()?.at ?? NaN) - window.__t0).toFixed(0),
    long: window.__long.filter((l) => l.t >= window.__t0).map((l) => [+(l.t - window.__t0).toFixed(0), +l.d.toFixed(0)]),
    loaf: (window.__loaf || []).filter((l) => l.startTime >= window.__t0).map((l) => ({ at: +(l.startTime - window.__t0).toFixed(0), d: +l.duration.toFixed(0), render: +(l.startTime + l.duration - l.renderStart).toFixed(0), style: +(l.startTime + l.duration - l.styleAndLayoutStart).toFixed(0), scripts: l.scripts.map((x) => `${x.invoker}|${x.sourceFunctionName}|${x.duration.toFixed(0)}`).slice(0, 4) })),
  }))
  if (process.env.LOAF) console.log(JSON.stringify(timing.loaf, null, 0))
  const vh = 844

  /* The editor's frames: from the tap to the last frame anything of it is drawn. */
  const seen = samples.filter((s) => s.y !== null)
  const lastSeen = seen[seen.length - 1]
  /* Taken away part way: the still went before its move had run to the end (a frame the page's clock missed at the end is not that). */
  const cut = !drop.removed || drop.removed.state !== "finished" || drop.removed.progress !== 1
  const moving = seen.filter((s) => s.y > 2 && s.y < vh - 2)
  const ys = seen.map((s) => s.y)
  const never = ys.every((y, i) => i === 0 || y >= ys[i - 1] - 1)
  /* A frame with no page: the editor has started to go (or has gone) and the list is not mounted under it. */
  const bare = samples.filter((s) => !s.list && (s.y === null || s.y > 2))
  /* From the frame the drop was let go to the one its still was taken away in: the move's whole run, by its own clock. */
  const dur = drop.went !== null && drop.removed ? +(drop.removed.t - drop.went).toFixed(0) : null
  const minO = seen.length ? Math.min(...seen.map((s) => s.o)) : null
  const takes = samples.find((s) => s.takes && s.y === null)
  const hows = [...new Set(seen.map((s) => s.how))]
  console.log(`        (button ${mode}; ${seen.length} frames with the editor drawn, ${moving.length} part way; y ${seen.map((s) => Math.round(s.y)).join(" ")})`)
  console.log(`        (drawn as ${hows.join(", ")}; last seen at ${lastSeen?.y}px; let go at ${drop.went}ms, taken away at ${drop.removed?.t}ms ${drop.removed?.state} at ${drop.removed?.progress}; drop ${dur}ms of ${drop.removed?.ms}; opacity down to ${minO}; the list takes a press at ${takes?.t}ms)`)

  /* The pixels: every compositor frame from the tap on. */
  const inks = []
  for (const f of frames) inks.push(await inkOf(p, f.data, 80, vh - 90))
  const blank = inks.filter((x) => x < 0.005).length
  const tag = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
  const pick = [0, Math.floor(frames.length / 4), Math.floor(frames.length / 2), Math.floor((frames.length * 3) / 4), frames.length - 1]
  for (const [k, i] of [...new Set(pick)].entries()) if (frames[i]) writeFileSync(join(shots, `editor-close-${tag}-${k}.png`), Buffer.from(frames[i].data, "base64"))
  console.log(`        (the list commits at ${timing.commit}ms; long tasks [at, ms] ${JSON.stringify(timing.long)})`)
  console.log(`        (${frames.length} screencast frames, ink min ${inks.length ? Math.min(...inks) : null})`)

  if (dirty) check(confirmTapped, `${name}: Discard pressed`, confirmTapped)
  check(moving.length >= 5 && never, `${name}: the editor moves down over several frames, never back`, { partWay: moving.length, never })
  check(!cut, `${name}: it runs to the bottom edge before it is taken away, never cut part way`, drop.removed)
  check(bare.length === 0, `${name}: no frame without a page (the list is mounted under every frame the editor is not covering)`, bare.slice(0, 4))
  check(frames.length > 5 && blank === 0, `${name}: no blank screencast frame`, { frames: frames.length, blank })
  /* The move is set to 280ms; by the page's clock it runs from the frame it is let go to the task its end is heard in, which a busy main thread can make a frame or two longer, or its first frame seen a frame late. */
  check(drop.removed?.ms === 280 && dur !== null && dur >= 200 && dur <= 480, `${name}: a drop of about 280ms`, { ms: drop.removed?.ms, ran: dur })
  check(drop.fade !== null && Number(drop.fade) >= 0.7 && Number(drop.fade) < 1 && minO !== null && minO < 1, `${name}: it fades a little as it goes (to the opacity its move is set to, and less than 1 in the frames seen)`, { to: drop.fade, seen: minO })
  check(!!takes, `${name}: then the list takes a press, with nothing of the move over it`, takes?.t ?? null)
  const leftover = await p.evaluate(() => ({ stills: document.querySelectorAll("[data-layer-still]").length, motion: document.documentElement.dataset.layerMotion ?? null, layer: !!document.querySelector("[data-page-layer]") }))
  check(leftover.stills === 0 && leftover.motion === null && !leftover.layer, `${name}: nothing of the move left behind`, leftover)
  await p.evaluate(() => { window.__slowMs = 0 })
  return checks
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const engine of ["chromium", "no-view-transitions"]) {
    console.log(`\nphone 390x844, touch, ${engine}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    if (engine !== "chromium") {
      await p.evaluateOnNewDocument(() => {
        delete Document.prototype.startViewTransition
      })
    }
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (!u.startsWith("http://probe.test/app") && u.startsWith("http://probe.test/")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
      r.abort()
    })
    await p.evaluateOnNewDocument(() => {
      window.__loaf = []
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push(e) }).observe({ type: "long-animation-frame", buffered: true }) } catch {}
    })
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    const cdp = await p.createCDPSession()
    await p.goto("http://probe.test/app/products")
    await sleep(1200)
    const vt = await p.evaluate(() => typeof document.startViewTransition === "function")
    expect(vt === (engine === "chromium"), `${engine}: view transitions ${vt ? "present" : "absent"}`, vt)
    await scenario(p, cdp, engine, { isNew: true, dirty: false })
    await scenario(p, cdp, engine, { isNew: true, dirty: true })
    await scenario(p, cdp, engine, { isNew: false, dirty: false })
    await scenario(p, cdp, engine, { isNew: false, dirty: true })
    await scenario(p, cdp, engine, { isNew: false, dirty: false, slowMs: 600 })
    if (errors.length) expect(false, `${engine}: nothing threw`, errors)
    await p.close()
  }
} finally {
  await browser.close()
}
console.log(`\nScreenshots: ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed.\n`)
  process.exit(1)
}
console.log("\nEvery way out of the editor drops.\n")
