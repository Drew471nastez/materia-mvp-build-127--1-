/**
 * ===========================================================================
 *  ROUND 27 (I7): THE COMPOSER'S TOOLBAR WHEN THE KEYBOARD GOES DOWN
 * ===========================================================================
 * The owner, on a phone: "when I write a post and I close the keyboard, it
 * leaves the bar with the attachment icons, emoji icon, GIF up there, it
 * freezes up there instead of smoothly going back down."
 *
 * The real community shell, feed and composer (round 17's harness,
 * scripts/render-community-mobile-r8.tsx) at 390x844, touch, 4x CPU. The
 * New post sheet is opened, the words are written, the keyboard comes up the
 * way each platform reports it and goes down again three ways:
 *
 *   kept     iPhone Safari: the keys go down while the field keeps the caret
 *            (the keyboard's own hide, an iPad's key, a web view's swipe); the
 *            visual viewport grows back to the whole screen
 *   done     iPhone Safari: Done lets go of the field, the keys fall over a
 *            quarter second, and only then does Safari report the viewport
 *   plugin   the iOS app with the keyboard plugin: keyboardWillHide with the
 *            field keeping the caret, and the web view reporting nothing
 *   android  Android: the back gesture hides the keys, the field keeps the
 *            caret, the visual viewport grows back
 *
 * Every frame the toolbar's foot on the screen is read (window.__track) and
 * the compositor's frames are filmed into a frame sheet to LOOK at:
 * SHOTS_DIR/<LABEL>-<case>-frames.png. The keyboard is drawn into the page
 * (translucent grey keys) so what shows through it is in the frames.
 *
 *   SHOTS_DIR=/tmp/p27 LABEL=after PROBE_CSS=source node scripts/check-posts27-keys.mjs [kept done plugin android]
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const LABEL = process.env.LABEL || "p27"
const THROTTLE = Number(process.env.THROTTLE || 4)
const KEYS = 380
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-p27-")), "shots")
mkdirSync(shots, { recursive: true })
const only = new Set(process.argv.slice(2).map((s) => s.toLowerCase()))
const want = (s) => only.size === 0 || only.has(s)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const results = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = join(root, ".p27-keys-probe")
mkdirSync(stubs, { recursive: true })

async function bundle() {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const move = (kind, h) => { log(kind, h); history[kind === "push" ? "pushState" : "replaceState"](history.state, "", h); window.dispatchEvent(new Event("probe:route")) }
const router = { push: (h) => move("push", h), replace: (h) => move("replace", h), prefetch: (h) => log("prefetch", h), back: () => history.back(), refresh: () => log("refresh") }
const useLocation = (read) => {
  const [v, setV] = useState(read)
  useEffect(() => {
    const on = () => startTransition(() => setV(read()))
    window.addEventListener("probe:route", on)
    window.addEventListener("popstate", on)
    return () => { window.removeEventListener("probe:route", on); window.removeEventListener("popstate", on) }
  }, [])
  return v
}
export const usePathname = () => useLocation(() => location.pathname)
export const useSearchParams = () => new URLSearchParams(useLocation(() => location.search))
export const useRouter = () => router
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "dynamic.jsx"), `import React from "react"
export default function dynamic(load) { const Lazy = React.lazy(() => load().then((m) => ({ default: m && m.default ? m.default : m }))); return function Dynamic(props) { return React.createElement(Lazy, props) } }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-mobile-r8.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.p27-keys-probe/navigation.js", "next/link": "./.p27-keys-probe/link.jsx", "next/image": "./.p27-keys-probe/image.jsx", "next/dynamic": "./.p27-keys-probe/dynamic.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  return readFileSync(join(stubs, "app.js"), "utf8")
}

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor StorelibWindows/1"
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"

/* The Keyboard plugin as the iOS app's native side presents it to @capacitor/core (round R8's stub, as check-post25.mjs). */
const PLUGIN_STUB = () => {
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
  const listeners = []
  window.Capacitor = {
    PluginHeaders: [{ name: "Keyboard", methods: [{ name: "addListener", rtype: "callback" }, { name: "removeListener", rtype: "promise" }, { name: "setScroll", rtype: "promise" }] }],
    nativeCallback(plugin, method, options, cb) {
      if (plugin === "Keyboard" && method === "addListener") listeners.push([options.eventName, cb])
      return String(listeners.length)
    },
    nativePromise: async () => undefined,
  }
  const fire = (name, data) => listeners.filter(([n]) => n === name).forEach(([, cb]) => cb(data))
  window.__kbShow = (h) => {
    fire("keyboardWillShow", { keyboardHeight: h })
    fire("keyboardDidShow", { keyboardHeight: h })
  }
  window.__kbHide = () => {
    fire("keyboardWillHide", {})
    fire("keyboardDidHide", {})
  }
}

/* The keys drawn into the page, the visual viewport faked as a platform reports it, and the toolbar read every frame. */
const PAGE_HOOKS = () => {
  /* A 4px magenta strip at the toolbar's right edge, for finding the bar in the compositor's own frames (barInFrames). */
  document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style")
    st.textContent = "[data-composer-toolbar]::after{content:'';position:absolute;right:0;top:0;bottom:0;width:4px;background:#ff00aa}"
    document.head.appendChild(st)
  })
  window.__keys = (h) => {
    let k = document.getElementById("probe-keys")
    if (!h) return k?.remove()
    if (!k) {
      k = document.createElement("div")
      k.id = "probe-keys"
      k.style.cssText = "position:fixed;left:0;right:0;z-index:2147483647;pointer-events:none;background:rgba(190,193,200,0.72);border-top:1px solid rgba(0,0,0,0.08);font:600 14px sans-serif;color:#374151;display:flex;align-items:flex-start;justify-content:center;padding-top:14px"
      document.documentElement.appendChild(k)
    }
    k.textContent = `keyboard ${h}px`
    k.style.height = `${h}px`
    k.style.top = `${844 - h}px`
  }
  /* The keys falling over 250ms, drawn frame by frame (iOS reports nothing until they are down). */
  window.__keysFall = (from) =>
    new Promise((done) => {
      const t0 = performance.now()
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / 250)
        const h = Math.round(from * (1 - p * p * (3 - 2 * p)))
        window.__keys(h)
        if (p < 1) requestAnimationFrame(step)
        else done()
      }
      requestAnimationFrame(step)
    })
  window.__vv = (top, height) => {
    const vv = window.visualViewport
    Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => top })
    Object.defineProperty(vv, "height", { configurable: true, get: () => height })
    vv.dispatchEvent(new Event("resize"))
    vv.dispatchEvent(new Event("scroll"))
  }
  window.__vvReal = () => {
    const vv = window.visualViewport
    delete vv.offsetTop
    delete vv.height
    vv.dispatchEvent(new Event("resize"))
  }
  window.__track = []
  window.__tracking = false
  /* Long tasks while it goes down (the main thread held: nothing on screen can follow the keys). */
  window.__long = []
  try {
    new PerformanceObserver((l) => {
      if (window.__tracking) for (const e of l.getEntries()) window.__long.push(Math.round(e.duration))
    }).observe({ type: "longtask", buffered: false })
  } catch {}
  /* The moments the platform spoke (the keys asked to go, the field let go, the viewport reported), on the page clock. */
  window.__marks = {}
  window.__mark = (k) => (window.__marks[k] = Math.round(performance.now()))
  /*
    Read once each frame has been drawn (a task after the frame's callbacks): what was on the screen. A read inside the
    frame's callbacks would force the layout before the page's own observers had run, and see a place never painted.
  */
  const read = () => {
    if (window.__tracking) {
      const bar = document.querySelector("[data-composer-toolbar]")
      const keys = document.getElementById("probe-keys")
      if (bar) window.__track.push({ t: Math.round(performance.now()), bar: Math.round(bar.getBoundingClientRect().bottom), keys: keys ? Math.round(keys.getBoundingClientRect().top) : 844, focus: document.activeElement?.tagName ?? null })
    }
  }
  const tick = () => {
    setTimeout(read, 0)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

let html = ""
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

async function session(env) {
  const p = await browser.newPage()
  p.setDefaultTimeout(180000)
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 400)))
  if (process.env.DEBUG) p.on("console", (m) => m.text().startsWith("[p27]") && console.log(`    ${m.text()}`))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return void r.respond({ status: 200, contentType: "application/json", body: "{}" })
    if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  await p.setUserAgent(env === "android" ? ANDROID : env === "plugin" ? APP : SAFARI)
  if (env === "plugin") {
    await p.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("capacitor")))
    await p.evaluateOnNewDocument(PLUGIN_STUB)
  }
  await p.evaluateOnNewDocument(PAGE_HOOKS)
  await p.goto(`${ORIGIN}/community/clay-studio`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(1200)
  const cdp = await p.target().createCDPSession()
  return { p, cdp, errors }
}

/* Every frame the compositor sends while `act` runs. */
async function record(s, act, ms) {
  const frames = []
  const onFrame = (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data })
    void s.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  }
  s.cdp.on("Page.screencastFrame", onFrame)
  await s.cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 })
  await sleep(200)
  const t0 = Date.now()
  await act()
  await sleep(ms)
  await s.cdp.send("Page.stopScreencast")
  s.cdp.off("Page.screencastFrame", onFrame)
  return { frames: frames.sort((a, b) => a.t - b.t), t0 }
}

let reader = null
/*
  WHERE THE BAR WAS ON THE SCREEN IN EACH FRAME THE COMPOSITOR DREW: the foot of the magenta strip (PAGE_HOOKS), read down the
  column 2px from the right edge. Under the drawn keys it shows through tinted, and is still found (red and blue well over
  green). A main thread held by the page draws nothing, while a move on the compositor goes on: only these frames say what
  was seen.
*/
async function barInFrames(rec) {
  reader ??= await browser.newPage()
  return reader.evaluate(async (frames) => {
    const out = []
    const c = document.createElement("canvas")
    const g = c.getContext("2d", { willReadFrequently: true })
    for (const f of frames) {
      const img = new Image()
      img.src = `data:image/jpeg;base64,${f.data}`
      await img.decode()
      c.width = img.width
      c.height = img.height
      g.drawImage(img, 0, 0)
      const x = img.width - 2
      const px = g.getImageData(x, 0, 1, img.height).data
      let foot = null
      for (let y = 0; y < img.height; y++) {
        const r = px[y * 4]
        const gr = px[y * 4 + 1]
        const b = px[y * 4 + 2]
        if (r - gr > 50 && b - gr > 30) foot = y + 1
      }
      out.push({ t: f.t, bar: foot === null ? null : Math.round((foot * 844) / img.height) })
    }
    return out
  }, rec.frames)
}

async function frameSheet(s, rec, file, { cols = 8, scale = 0.42, max = 40 } = {}) {
  reader ??= await browser.newPage()
  const picked = rec.frames.filter((f) => f.t >= rec.t0 - 50).slice(0, max)
  if (!picked.length) return
  const png = await reader.evaluate(
    async (frames, zero, cols, scale) => {
      const w = Math.round(390 * scale)
      const h = Math.round(844 * scale)
      const rows = Math.ceil(frames.length / cols)
      const c = document.createElement("canvas")
      c.width = cols * (w + 6) + 6
      c.height = rows * (h + 22) + 6
      const g = c.getContext("2d")
      g.fillStyle = "#30343b"
      g.fillRect(0, 0, c.width, c.height)
      for (let i = 0; i < frames.length; i++) {
        const img = new Image()
        img.src = `data:image/jpeg;base64,${frames[i].data}`
        await img.decode()
        const x = 6 + (i % cols) * (w + 6)
        const y = 6 + Math.floor(i / cols) * (h + 22)
        g.drawImage(img, x, y + 16, w, h)
        g.fillStyle = "#fff"
        g.font = "600 12px sans-serif"
        g.fillText(`#${i}  ${Math.round(frames[i].t - zero)}ms`, x + 2, y + 12)
      }
      return c.toDataURL("image/png").split(",")[1]
    },
    picked,
    rec.t0,
    cols,
    scale,
  )
  writeFileSync(join(shots, `${LABEL}-${file}.png`), Buffer.from(png, "base64"))
  await s.p.bringToFront()
}

/* The sheet open, the words written in the post's field, the keyboard up as `env` reports it, the toolbar on the keys. */
async function writeWithKeysUp(s, env) {
  await s.p.evaluate(() => window.__compose?.())
  await sleep(1600)
  await s.p.evaluate(() => {
    const t = document.querySelector("[data-composer=sheet] textarea")
    t?.focus({ preventScroll: true })
  })
  await s.p.keyboard.type("Fired the big bowl today", { delay: 5 })
  await sleep(200)
  if (env === "plugin") {
    await s.p.evaluate((h) => {
      window.__kbShow(h)
      window.__keys(h)
    }, KEYS)
    /* The web view reports nothing; the plugin's word is all there is. ViewportVars' resize, as a focus would make one. */
    await s.p.evaluate(() => window.visualViewport.dispatchEvent(new Event("resize")))
  } else {
    await s.p.evaluate((h) => {
      window.__keys(h)
      window.__vv(0, 844 - h)
    }, KEYS)
  }
  await sleep(700)
  return s.p.evaluate(() => ({ bar: Math.round(document.querySelector("[data-composer-toolbar]").getBoundingClientRect().bottom), focus: document.activeElement?.tagName ?? null }))
}

const CASES = {
  /* The keys go down, the field keeps the caret, Safari reports the whole screen again once they are down. */
  kept: { env: "safari", down: (s) => s.p.evaluate(async (h) => { window.__mark("start"); await window.__keysFall(h); window.__mark("word"); window.__vvReal() }, KEYS), keepsFocus: true, word: "the viewport reported" },
  /* Done: the field lets go at once (the platform's first word), the keys fall, then Safari reports. */
  done: { env: "safari", down: (s) => s.p.evaluate(async (h) => { window.__mark("start"); window.__mark("word"); document.activeElement?.blur(); await window.__keysFall(h); window.__vvReal() }, KEYS), keepsFocus: false, word: "the field let go" },
  /* The app with the plugin: keyboardWillHide before the keys move, the field keeps the caret, the web view says nothing. */
  plugin: { env: "plugin", down: (s) => s.p.evaluate(async (h) => { window.__mark("start"); window.__mark("word"); window.__kbHide(); await window.__keysFall(h) }, KEYS), keepsFocus: true, word: "keyboardWillHide" },
  /* Android: the back gesture hides the keys; the field keeps the caret; Chrome reports once they are down. */
  android: { env: "android", down: (s) => s.p.evaluate(async (h) => { window.__mark("start"); await window.__keysFall(h); window.__mark("word"); window.__vvReal() }, KEYS), keepsFocus: true, word: "the viewport reported" },
}

async function runCase(name) {
  const c = CASES[name]
  console.log(`\n${name.toUpperCase()}: writing a post, the keyboard up, then down (${c.env}, ${THROTTLE}x CPU)`)
  const s = await session(c.env)
  const up = await writeWithKeysUp(s, c.env)
  console.log(`  keys up: toolbar foot ${up.bar} (the keys' top ${844 - KEYS}), focus ${up.focus}`)
  expect(Math.abs(up.bar - (844 - KEYS)) <= 3, "with the keyboard up the toolbar sits on the keys", up)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  await s.p.evaluate(() => {
    window.__track = []
    window.__long = []
    window.__marks = {}
    window.__tracking = true
  })
  const t0 = await s.p.evaluate(() => performance.now())
  if (process.env.PROFILE) {
    await s.cdp.send("Profiler.enable")
    await s.cdp.send("Profiler.setSamplingInterval", { interval: 200 })
    await s.cdp.send("Profiler.start")
  }
  const rec = await record(s, () => c.down(s), 900)
  if (process.env.PROFILE) {
    /* Where the main thread's time went while the keys went down: the functions with the most time of their own, and with their callees. */
    const { profile } = await s.cdp.send("Profiler.stop")
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const parent = new Map()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const self = new Map()
    const total = new Map()
    const dt = profile.timeDeltas
    profile.samples.forEach((id, i) => {
      const ms = (dt[i + 1] ?? 0) / 1000
      const n = byId.get(id)
      const k = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`
      self.set(k, (self.get(k) ?? 0) + ms)
      const seen = new Set()
      for (let at = id; at !== undefined; at = parent.get(at)) {
        const m = byId.get(at)
        const kk = `${m.callFrame.functionName || "(anon)"}:${m.callFrame.lineNumber}`
        if (seen.has(kk)) continue
        seen.add(kk)
        total.set(kk, (total.get(kk) ?? 0) + ms)
      }
    })
    const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${Math.round(v)}ms ${k}`)
    console.log(`  self: ${top(self).join(" | ")}`)
    console.log(`  total: ${top(total).join(" | ")}`)
  }
  await s.p.evaluate(() => (window.__tracking = false))
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const track = await s.p.evaluate(() => window.__track)
  const marks = await s.p.evaluate(() => window.__marks)
  const long = await s.p.evaluate(() => window.__long.slice())
  await frameSheet(s, rec, `${name}-frames`)
  await s.p.screenshot({ path: join(shots, `${LABEL}-${name}-rest.png`) })
  const end = await s.p.evaluate(() => ({ bar: Math.round(document.querySelector("[data-composer-toolbar]").getBoundingClientRect().bottom), focus: document.activeElement?.tagName ?? null }))
  /* From the platform's word, in the compositor's frames: when the bar first left the keys, when it reached the foot, the biggest step between two frames. */
  const origin = await s.p.evaluate(() => performance.timeOrigin)
  const zero = origin + (marks.word ?? t0)
  const seen = (await barInFrames(rec)).filter((x) => x.bar !== null).map((x) => ({ t: Math.round(x.t - zero), bar: x.bar }))
  const firstMove = seen.find((x) => x.t > -20 && x.bar > up.bar + 2)
  const arrived = seen.find((x) => x.bar >= 844 - 2 && x.t >= (firstMove?.t ?? 0))
  let step = 0
  for (let i = 1; i < seen.length; i++) if (seen[i].t >= (firstMove?.t ?? 0)) step = Math.max(step, seen[i].bar - seen[i - 1].bar)
  /* The first frame drawn after the word (a busy page draws it late; the bar should move on it, or on the one after). */
  const after = seen.filter((x) => x.t > 0)
  /* The main thread's own reads, for the record (a held main thread reads late and sees a move the compositor already made). */
  const mainThread = track.map((x) => [Math.round(origin + x.t - zero), x.bar, x.keys])
  results[name] = { longTasksMs: long, up, end, firstMoveMs: firstMove?.t ?? null, arrivedMs: arrived?.t ?? null, biggestStepPx: step, frames: seen.length, seen, mainThread }
  console.log(`  down: toolbar foot ${end.bar}, focus ${end.focus}; from the platform's word (${c.word}), in the compositor's frames: first drawn ${after[0]?.t ?? "-"}ms, the bar first moved ${firstMove?.t ?? "never"}ms, at the foot ${arrived?.t ?? "never"}ms; biggest step ${step}px over ${seen.length} frames`)
  console.log(`  long tasks while it went down (ms, ${THROTTLE}x CPU): ${JSON.stringify(long)}`)
  console.log(`  frames [ms, bar foot] ${JSON.stringify(seen.filter((x) => x.t > -100).slice(0, 24).map((x) => [x.t, x.bar]))}`)
  expect(end.bar >= 844 - 2, "the keyboard down: the toolbar is back at the foot of the screen", end)
  expect(c.keepsFocus ? end.focus === "TEXTAREA" : end.focus !== "TEXTAREA", c.keepsFocus ? "the words keep the caret (the case as the phone has it)" : "Done let go of the field", end.focus)
  /* The sheet reads the viewport on its next frame and React draws after it: within the first five frames drawn after the word. */
  expect(!!firstMove && after.length > 0 && firstMove.t <= (after[4] ?? after.at(-1)).t + 1, "it starts down within the first frames drawn after the platform says the keys are going", { firstMove: firstMove?.t ?? null, drawn: after.slice(0, 5).map((x) => x.t) })
  expect(!!arrived && !!firstMove && arrived.t - firstMove.t <= 400, "it is at the foot about one keyboard move after it starts, not frozen", arrived && firstMove ? arrived.t - firstMove.t : null)
  /* A frame the screencast dropped on a loaded machine doubles a step; one jump is the whole keyboard (380). */
  expect(step <= KEYS * 0.6, "it goes down over several frames, never more than about half the keyboard between two", step)
  expect(!s.errors.length, "no page errors", s.errors.slice(0, 3))
  await s.p.close()
}

try {
  html = await (async () => {
    const [css, js] = await Promise.all([appCss(root), bundle()])
    const fonts = interFaces(root)
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Clay Studio</title><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  })()
  for (const name of Object.keys(CASES)) if (want(name)) await runCase(name)
} finally {
  rmSync(stubs, { recursive: true, force: true })
  await browser.close()
}
writeFileSync(join(shots, `${LABEL}-results.json`), JSON.stringify(results, null, 2))
console.log(`\n  frames and screenshots in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
