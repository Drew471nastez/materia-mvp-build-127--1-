/**
 * ===========================================================================
 *  storelib.com's MARKETING PAGES ON A PHONE, LOADED AND SCROLLED, MEASURED
 * ===========================================================================
 * "Make sure the whole storelib.com on mobile phones, its graphics and
 * sections, don't glitch or cost too much performance."
 *
 * Points headless Chromium at a running `next start` (BASE, default
 * http://127.0.0.1:3000) as a phone: 390x844 at 3x, touch, a phone's user
 * agent, the CPU four times slower and a mid-tier mobile network (100ms round
 * trip, 4 Mbps down, 1.5 up). For each page, a cold load and then a real
 * touch scroll (CDP touch events: a finger down, moved 600px up over about
 * 40 frames and lifted, so the page flings a little as on a phone) from the top to
 * the foot of the page, and reports:
 *
 *   LOAD     long tasks from navigation to the first scroll: count, total ms,
 *            blocking ms (over 50 each), the worst one
 *   SCROLL   requestAnimationFrame deltas while the finger moves: worst, p95,
 *            and how many frames took more than 1.5 frames (dropped); long
 *            tasks inside the scroll
 *   CLS      every layout shift without input over the whole visit, summed,
 *            and the nodes that moved
 *   BYTES    over the wire by kind (script, image, media, font, css, doc)
 *   IMAGES   each picture's decoded pixels against what the screen shows
 *            (displayed CSS size x 3); the ones decoded far over that
 *   MOTION   animations and transitions running on properties the compositor
 *            cannot do alone (layout or paint every frame), and running ones
 *            whose element is off the screen
 *   IDLE     two seconds with the finger still, at the foot of the page and
 *            back at the top: main thread task ms, layouts, style recalcs,
 *            rAF callbacks, paints (from a trace), so anything still moving
 *            off the screen shows as work
 *   TOP 10s  ten seconds at the top after the load, nothing touched: main thread busy, main frames, paints, and
 *            React commits counted through a stand-in devtools hook (components rendered, how many in the header,
 *            and the elements whose own state changed)
 *   VIDEO    each <video>: source, preload, decoded size against shown size,
 *            paused when off the screen, and its media bytes
 *
 *   BASE=http://127.0.0.1:3000 LABEL=before PAGES=/,/pricing,/features \
 *     node scripts/check-marketing-mobile-perf.mjs
 *
 * Numbers, not a verdict: run against two builds and compare. RUNS (default
 * 2) loads per page; scroll metrics are the median, the worst frame the max.
 * JSON=path writes everything.
 */
import puppeteer from "puppeteer-core"
import { writeFileSync } from "node:fs"

const BASE = process.env.BASE ?? "http://127.0.0.1:3000"
const LABEL = process.env.LABEL ?? ""
const RUNS = Number(process.env.RUNS ?? 2)
const PAGES = (process.env.PAGES ?? "/,/pricing,/features").split(",")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const pct = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
const r1 = (n) => Math.round(n * 10) / 10

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

const OBSERVE = () => {
  const w = window
  w.__long = []
  w.__shifts = []
  w.__cls = 0
  w.__frames = null
  w.__raf = 0
  const describe = (n) => {
    if (!n || n.nodeType !== 1) return n ? n.nodeName.toLowerCase() : "?"
    const data = [...n.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name).slice(0, 2).join(",")
    const sec = n.closest("section,[data-lazy-section],[data-home-hero]")
    const where = sec ? ` in ${sec.tagName.toLowerCase()}${sec.getAttribute("data-lazy-section") ? `[${sec.getAttribute("data-lazy-section")}]` : ""}${sec.id ? `#${sec.id}` : ""}${sec.getAttribute("aria-label") ? `"${sec.getAttribute("aria-label").slice(0, 30)}"` : ""}` : ""
    return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}${data ? `[${data}]` : ""}.${String(n.className?.baseVal ?? n.className ?? "").slice(0, 40)}${where}`
  }
  new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push({ s: e.startTime, d: e.duration }) }).observe({ type: "longtask", buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue
      w.__cls += e.value
      w.__shifts.push({ v: e.value, t: Math.round(e.startTime), y: Math.round(scrollY), nodes: (e.sources || []).map((s) => `${describe(s.node)} ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`) })
    }
  }).observe({ type: "layout-shift", buffered: true })
  /*
    React commits, counted by a stand-in for the devtools hook, walked the way React DevTools walks them: a child list
    that is the same object as in the last commit bailed out whole and is skipped, and a component counts as rendered
    when it is new or carries React's PerformedWork flag. (Reading that flag on every fiber, without the skip, counts
    fibers that rendered in some earlier commit: that is where "the header renders 95 components every two seconds"
    came from.) Per commit: components rendered, how many of them are in the header, and the elements whose own state
    changed (where the render started).
  */
  w.__commits = []
  const hostOf = (f) => { let n = f; while (n && !(n.stateNode instanceof Element)) n = n.child; return n?.stateNode ?? null }
  const isComponent = (f) => f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false, supportsFiber: true, renderers: new Map(),
    inject(r) { this.renderers.set(this.renderers.size + 1, r); return this.renderers.size },
    onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {},
    onCommitFiberRoot(_id, root) {
      let n = 0, header = 0
      const origins = new Set()
      const visit = (next, prev) => {
        if (isComponent(next) && (!prev || (next.flags & 1) === 1)) {
          n++
          const el = hostOf(next)
          if (el?.closest?.("#platform-header-root")) header++
          if (prev && prev.memoizedProps === next.memoizedProps) origins.add(el ? `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? "").slice(0, 36)}` : "?")
        }
        if (prev && next.child === prev.child) return
        for (let c = next.child; c; c = c.sibling) visit(c, prev ? c.alternate : null)
      }
      try { visit(root.current, root.current.alternate) } catch { /* a tree shape this walk does not know */ }
      if (n) w.__commits.push({ t: performance.now(), n, header, origins: [...origins].slice(0, 4) })
    },
  }
  /* Every rAF callback any script registers, counted, so an idle page that keeps asking for frames shows it. */
  const raf = w.requestAnimationFrame.bind(w)
  w.requestAnimationFrame = (cb) => raf((t) => { w.__raf++; cb(t) })
  /* A frame clock of the probe's own, on when a scroll runs. */
  w.__startFrames = () => {
    w.__frames = []
    let last = performance.now()
    const tick = (t) => { if (!w.__frames) return; w.__frames.push(t - last); last = t; raf(tick) }
    raf((t) => { last = t; raf(tick) })
  }
  w.__stopFrames = () => { const f = w.__frames; w.__frames = null; return f }
}

const MOTION = () => {
  const COMPOSITED = new Set(["transform", "opacity", "translate", "scale", "rotate", "offset", "composite", "easing", "computedOffset", "offsetDistance"])
  const vh = innerHeight
  const out = []
  for (const a of document.getAnimations()) {
    if (a.playState !== "running") continue
    const el = a.effect?.target
    let props = []
    try {
      if (a.transitionProperty) props = [a.transitionProperty]
      else props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((p) => !["offset", "easing", "composite", "computedOffset"].includes(p))
    } catch { /* not readable */ }
    const r = el?.getBoundingClientRect?.()
    const onScreen = r ? r.bottom > 0 && r.top < vh && r.width > 0 && r.height > 0 : false
    const hidden = el ? getComputedStyle(el).visibility === "hidden" || el.closest("[hidden]") !== null : false
    const bad = props.filter((p) => !COMPOSITED.has(p))
    const name = a.animationName || a.transitionProperty || a.id || "web-animation"
    const iter = a.effect?.getComputedTiming?.().iterations
    const sec = el?.closest?.("section,[data-lazy-section],[data-home-hero]")
    out.push({
      name, props, bad, onScreen, hidden, infinite: iter === Infinity,
      el: el ? `${el.tagName?.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? "").slice(0, 50)}${sec ? ` in ${sec.getAttribute("data-lazy-section") || sec.getAttribute("aria-label")?.slice(0, 30) || sec.tagName.toLowerCase()}` : ""}` : "?",
    })
  }
  return out
}

const IMAGES = () => {
  const dpr = devicePixelRatio
  /* Not an SVG: it is drawn at the size shown, whatever its natural size says, so it is never "decoded too large". */
  return [...document.images].filter((i) => i.complete && i.naturalWidth > 0 && !/\.svg(\?|$)/i.test(i.currentSrc || i.src)).map((i) => {
    const r = i.getBoundingClientRect()
    const shown = Math.round(r.width * dpr) * Math.round(r.height * dpr)
    const decoded = i.naturalWidth * i.naturalHeight
    return {
      src: (i.currentSrc || i.src).replace(location.origin, "").slice(0, 110),
      natural: `${i.naturalWidth}x${i.naturalHeight}`,
      shown: `${Math.round(r.width)}x${Math.round(r.height)}`,
      ratio: shown > 0 ? decoded / shown : Infinity,
      decodedMp: decoded / 1e6,
      loading: i.loading, hasSize: i.hasAttribute("width") && i.hasAttribute("height"),
      top: Math.round(r.top + scrollY),
    }
  })
}

const VIDEOS = () => [...document.querySelectorAll("video")].map((v) => {
  const r = v.getBoundingClientRect()
  return {
    src: (v.currentSrc || v.getAttribute("src") || "").replace(location.origin, ""), preload: v.preload, autoplay: v.autoplay,
    decoded: `${v.videoWidth}x${v.videoHeight}`, shown: `${Math.round(r.width)}x${Math.round(r.height)}`,
    paused: v.paused, onScreen: r.bottom > 0 && r.top < innerHeight, readyState: v.readyState,
  }
})

async function idleWindow(page, cdp, ms = 2000) {
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))
  await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "toplevel", "cc"] })
  const a = await metrics()
  const raf0 = await page.evaluate(() => window.__raf)
  await wait(ms)
  const raf1 = await page.evaluate(() => window.__raf)
  const b = await metrics()
  const trace = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8"))
  const ev = trace.traceEvents
  const count = (name) => ev.filter((e) => e.name === name && e.ph !== "E").length
  const durOf = (name) => ev.filter((e) => e.name === name && e.dur).reduce((s, e) => s + e.dur, 0) / 1000
  /* Workers drawing (OffscreenCanvas) are threads of their own: their script time shows as FunctionCall on a non-main thread. */
  const threads = {}
  for (const e of ev) if (e.name === "thread_name") threads[`${e.pid}:${e.tid}`] = e.args?.name
  const workerMs = ev.filter((e) => e.dur && (e.name === "FunctionCall" || e.name === "RunMicrotasks" || e.name === "EvaluateScript") && /Worker/i.test(threads[`${e.pid}:${e.tid}`] || "")).reduce((s, e) => s + e.dur, 0) / 1000
  return {
    taskMs: r1((b.TaskDuration - a.TaskDuration) * 1000),
    scriptMs: r1((b.ScriptDuration - a.ScriptDuration) * 1000),
    layouts: b.LayoutCount - a.LayoutCount,
    styles: b.RecalcStyleCount - a.RecalcStyleCount,
    raf: raf1 - raf0,
    paints: count("Paint"),
    paintMs: r1(durOf("Paint")),
    workerMs: r1(workerMs),
    /* Frames the main thread had to make with nothing being touched: each one is style, paint and a commit. */
    mainFrames: ev.filter((e) => e.name === "ProxyMain::BeginMainFrame" && threads[`${e.pid}:${e.tid}`] === "CrRendererMain").length,
    mainBusyMs: r1(ev.filter((e) => e.name === "RunTask" && e.dur && threads[`${e.pid}:${e.tid}`] === "CrRendererMain").reduce((s, e) => s + e.dur, 0) / 1000),
  }
}

/* One finger stroke: down at 760, up 600px in 40 moves a frame apart, lifted (synthesizeScrollGesture's touch source does not scroll headless Chromium). */
async function stroke(cdp) {
  const at = (y) => [{ x: 195, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(760) })
  for (let i = 1; i <= 40; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(760 - i * 15) }); await wait(16) }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await wait(120)
}

async function run(path) {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] })
  try {
    const page = await browser.newPage()
    await page.setUserAgent(UA)
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    const cdp = await page.createCDPSession()
    await cdp.send("Performance.enable")
    await cdp.send("Network.enable")
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 100, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const types = new Map()
    const bytes = {}
    const media = []
    cdp.on("Network.responseReceived", (e) => types.set(e.requestId, { type: e.type, url: e.response.url }))
    cdp.on("Network.loadingFinished", (e) => {
      const t = types.get(e.requestId)
      const k = (t?.type || "Other").toLowerCase()
      bytes[k] = (bytes[k] || 0) + e.encodedDataLength
      if (k === "media") media.push({ url: t.url.replace(BASE, ""), kb: Math.round(e.encodedDataLength / 1024) })
    })
    await page.evaluateOnNewDocument(OBSERVE)
    const t0 = Date.now()
    await page.goto(BASE + path, { waitUntil: "load", timeout: 120000 })
    const loadMs = Date.now() - t0
    await wait(5000)
    const loadLong = await page.evaluate(() => window.__long.map((l) => l.d))
    const loadIdle = await idleWindow(page, cdp)
    /* Ten seconds more at the top with nothing touched: React renders (all, and the header's) and main thread busy. */
    const c0 = await page.evaluate(() => window.__commits.length)
    const topLong = await idleWindow(page, cdp, 10000)
    const topCommits = await page.evaluate((c) => window.__commits.slice(c), c0)
    const loadCommits = await page.evaluate((c) => window.__commits.slice(0, c), c0)
    const renders = { loadCommits: loadCommits.length, loadComponents: loadCommits.reduce((s, c) => s + c.n, 0), loadHeader: loadCommits.reduce((s, c) => s + c.header, 0), commits: topCommits.length, components: topCommits.reduce((s, c) => s + c.n, 0), header: topCommits.reduce((s, c) => s + c.header, 0), origins: [...new Set(topCommits.flatMap((c) => c.origins))].slice(0, 8), busyMs: topLong.mainBusyMs, mainFrames: topLong.mainFrames, paints: topLong.paints }
    const motionTop = await page.evaluate(MOTION)

    /* The touch scroll, top to foot, in finger strokes of 600px. */
    const longBefore = await page.evaluate(() => window.__long.length)
    await page.evaluate(() => window.__startFrames())
    const scrollT0 = Date.now()
    let last = -1, stuck = 0
    const motionSeen = []
    for (let i = 0; i < 120; i++) {
      await stroke(cdp)
      const y = await page.evaluate(() => scrollY)
      if (i % 4 === 0) motionSeen.push(...(await page.evaluate(MOTION)))
      if (y === last) { if (++stuck >= 3) break } else stuck = 0
      last = y
    }
    const scrollMs = Date.now() - scrollT0
    const frames = (await page.evaluate(() => window.__stopFrames())).slice(2)
    const scrollLong = await page.evaluate((n) => window.__long.slice(n).map((l) => l.d), longBefore)
    const height = await page.evaluate(() => `${document.documentElement.scrollHeight} (scrolled to ${Math.round(scrollY + innerHeight)})`)
    await wait(1500)
    const motionFoot = await page.evaluate(MOTION)
    const idleFoot = await idleWindow(page, cdp)
    const images = await page.evaluate(IMAGES)
    const videosFoot = await page.evaluate(VIDEOS)
    await page.evaluate(() => window.scrollTo(0, 0))
    await wait(1500)
    const idleTop = await idleWindow(page, cdp)
    const videosTop = await page.evaluate(VIDEOS)
    const { cls, shifts } = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts }))

    const frame = 1000 / 60
    return {
      loadMs, height,
      load: { count: loadLong.length, total: r1(loadLong.reduce((a, b) => a + b, 0)), tbt: r1(loadLong.reduce((a, b) => a + Math.max(0, b - 50), 0)), worst: r1(Math.max(0, ...loadLong)) },
      scroll: { ms: scrollMs, frames: frames.length, worst: r1(Math.max(0, ...frames)), p95: r1(pct(frames, 0.95)), p50: r1(pct(frames, 0.5)), dropped: frames.filter((f) => f > frame * 1.5).length, long: scrollLong.length, longMs: r1(scrollLong.reduce((a, b) => a + b, 0)), worstLong: r1(Math.max(0, ...scrollLong)) },
      cls: Math.round(cls * 10000) / 10000, shifts,
      bytes: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])), media,
      images,
      motion: { top: motionTop, seen: motionSeen, foot: motionFoot },
      idle: { load: loadIdle, foot: idleFoot, top: idleTop }, renders,
      videos: { foot: videosFoot, top: videosTop },
    }
  } finally {
    await browser.close()
  }
}

const all = {}
for (const path of PAGES) {
  const runs = []
  for (let i = 0; i < RUNS; i++) runs.push(await run(path))
  all[path] = runs
  const m = (f) => median(runs.map(f))
  console.log(`\n== ${LABEL} ${path}  (${RUNS} runs, page ${runs[0].height}px tall)`)
  console.log(`load      long tasks ${m((r) => r.load.count)}  total ${m((r) => r.load.total)}ms  blocking ${m((r) => r.load.tbt)}ms  worst ${m((r) => r.load.worst)}ms  (load event ${m((r) => r.loadMs)}ms)`)
  console.log(`scroll    frames ${m((r) => r.scroll.frames)}  p50 ${m((r) => r.scroll.p50)}  p95 ${m((r) => r.scroll.p95)}  worst ${Math.max(...runs.map((r) => r.scroll.worst))}ms  dropped ${m((r) => r.scroll.dropped)}  long tasks ${m((r) => r.scroll.long)} (${m((r) => r.scroll.longMs)}ms, worst ${m((r) => r.scroll.worstLong)})`)
  console.log(`cls       ${m((r) => r.cls)}`)
  for (const s of runs[0].shifts.sort((a, b) => b.v - a.v).slice(0, 6)) console.log(`          ${s.v.toFixed(4)} at ${s.t}ms y=${s.y}: ${s.nodes.join(" | ")}`)
  const kinds = [...new Set(runs.flatMap((r) => Object.keys(r.bytes)))]
  console.log(`bytes KB  ${kinds.map((k) => `${k} ${m((r) => r.bytes[k] || 0)}`).join("  ")}`)
  for (const v of runs[0].media) console.log(`          media ${v.url} ${v.kb}KB`)
  const over = runs[0].images.filter((i) => i.ratio > 2.5).sort((a, b) => b.decodedMp - a.decodedMp)
  console.log(`images    ${runs[0].images.length} decoded, ${r1(runs[0].images.reduce((s, i) => s + i.decodedMp, 0))} MP; ${over.length} decoded >2.5x what the screen shows:`)
  for (const i of over.slice(0, 10)) console.log(`          ${i.natural} shown ${i.shown} (${r1(i.ratio)}x) ${i.loading}${i.hasSize ? "" : " no width/height"} y=${i.top} ${i.src}`)
  const eager = runs[0].images.filter((i) => i.loading !== "lazy" && i.top > 1700)
  if (eager.length) console.log(`          ${eager.length} eager images far below the first screen: ${eager.slice(0, 5).map((i) => i.src.slice(0, 60)).join(", ")}`)
  const uniq = (list) => { const seen = new Map(); for (const a of list) { const k = `${a.name}|${a.el}`; if (!seen.has(k)) seen.set(k, a) } return [...seen.values()] }
  const bad = uniq(runs[0].motion.seen.concat(runs[0].motion.top, runs[0].motion.foot)).filter((a) => a.bad.length)
  console.log(`motion    ${bad.length} running animations on non-composited properties:`)
  for (const a of bad.slice(0, 15)) console.log(`          ${a.name} [${a.bad.join(",")}]${a.infinite ? " infinite" : ""} ${a.el}`)
  const off = uniq(runs[0].motion.foot.concat(runs[0].motion.top)).filter((a) => !a.onScreen && a.infinite)
  console.log(`          ${off.length} infinite animations running off screen (at the foot, at the top):`)
  for (const a of off.slice(0, 15)) console.log(`          ${a.name} [${a.props.join(",")}] ${a.el}`)
  console.log(`top 10s   main busy ${m((r) => r.renders.busyMs)}ms (${r1(m((r) => r.renders.busyMs) / 100)}%)  main frames ${m((r) => r.renders.mainFrames)}  paints ${m((r) => r.renders.paints)}  React commits ${m((r) => r.renders.commits)}, components rendered ${m((r) => r.renders.components)}, in the header ${m((r) => r.renders.header)}`)
  console.log(`          before that, from navigation: ${m((r) => r.renders.loadCommits)} commits, ${m((r) => r.renders.loadComponents)} components rendered, ${m((r) => r.renders.loadHeader)} in the header`)
  for (const o of runs[0].renders.origins) console.log(`          state changed in ${o}`)
  console.log(`decoded   ${r1(m((r) => r.images.reduce((s, i) => s + i.decodedMp, 0)))} MP median, ${m((r) => r.images.filter((i) => i.ratio > 2.5).length)} images >2.5x`)
  for (const k of ["load", "foot", "top"]) { const i = runs[0].idle[k]; console.log(`idle ${k.padEnd(5)}task ${i.taskMs}ms  script ${i.scriptMs}ms  layouts ${i.layouts}  styles ${i.styles}  rAF ${i.raf}  paints ${i.paints} (${i.paintMs}ms)  worker ${i.workerMs}ms  main frames ${i.mainFrames}  main busy ${i.mainBusyMs}ms  / 2s`) }
  for (const v of runs[0].videos.foot) console.log(`video     at foot: ${v.src} preload=${v.preload} ${v.decoded} shown ${v.shown} paused=${v.paused} onScreen=${v.onScreen}`)
  for (const v of runs[0].videos.top) console.log(`video     at top:  ${v.src} ${v.decoded} shown ${v.shown} paused=${v.paused} ready=${v.readyState}`)
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(all, null, 1))
