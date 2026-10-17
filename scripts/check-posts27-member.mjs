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
 *   SHOTS_DIR=/tmp/p27 LABEL=after PROBE_CSS=source node scripts/check-posts27-member.mjs [kept done plugin android]
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
  /*
    The keys are one element made once and only restyled: adding or removing an element under <html> is itself a
    document-wide style pass where the page has html:has() rules, which a real keyboard never is (the cost part measures
    the page's own work, not the probe's).
  */
  window.__keys = (h) => {
    let k = document.getElementById("probe-keys")
    if (!h) {
      if (k) {
        k.style.height = "0px"
        k.style.top = "844px"
      }
      return
    }
    if (!k) {
      k = document.createElement("div")
      k.id = "probe-keys"
      k.style.cssText = "position:fixed;left:0;right:0;z-index:2147483647;pointer-events:none;background:rgba(190,193,200,0.72);border-top:1px solid rgba(0,0,0,0.08);font:600 14px sans-serif;color:#374151;display:flex;align-items:flex-start;justify-content:center;padding-top:14px"
      document.documentElement.appendChild(k)
    }
    if (k.textContent !== "keyboard") k.textContent = "keyboard"
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
  document.addEventListener("DOMContentLoaded", () => {
    window.__keys(1)
    window.__keys(0)
  })
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

async function session(env, { locked = [] } = {}) {
  const p = await browser.newPage()
  p.setDefaultTimeout(180000)
  if (env === "desktop") await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  else await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  /* Posts with their comments closed (the harness reads this as it loads: render-communities-post17.tsx). */
  if (locked.length) await p.evaluateOnNewDocument((ids) => (window.__lockedPosts = ids), locked)
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
  if (env !== "desktop") await p.setUserAgent(env === "android" ? ANDROID : env === "plugin" ? APP : SAFARI)
  if (env === "plugin") {
    await p.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("capacitor")))
    await p.evaluateOnNewDocument(PLUGIN_STUB)
  }
  await p.evaluateOnNewDocument(PAGE_HOOKS)
  await p.goto(`${ORIGIN}/community/clay-studio`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(1200)
  const cdp = await p.target().createCDPSession()
  return { p, cdp, errors, desk: env === "desktop" }
}

/* Every frame the compositor sends while `act` runs. */
async function record(s, act, ms) {
  const frames = []
  const onFrame = (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data })
    void s.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  }
  s.cdp.on("Page.screencastFrame", onFrame)
  await s.cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: s.desk ? 720 : 390, maxHeight: s.desk ? 450 : 844, everyNthFrame: 1 })
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
  const [fw, fh] = s.desk ? [720, 450] : [390, 844]
  const png = await reader.evaluate(
    async (frames, zero, cols, scale, fw, fh) => {
      const w = Math.round(fw * scale)
      const h = Math.round(fh * scale)
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
    fw,
    fh,
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

/*
  I6: A POST WITH ITS COMMENTS CLOSED, OPENED (the owner: "when I open a post and it says comments closed, it's shrinking on
  mobile devices, and the desktop version larger screens"). The post "Glaze tip..." with no comments is opened from the feed
  with its comments closed, and every frame drawn after the press the box it opens in is read (its height on a computer, its
  top edge on a phone) together with where its comments area ends. Once it has arrived nothing may get shorter.
*/
const CLOSED_ID = "a0000000-0000-4000-8000-000000000003"
async function partClosed(where) {
  const desk = where === "desktop"
  console.log(`\nCLOSED (${where}): a post with its comments closed, opened from the feed${desk ? "" : ` (${THROTTLE}x CPU)`}`)
  const s = await session(desk ? "desktop" : "safari", { locked: [CLOSED_ID] })
  const at = await s.p.evaluate((id) => {
    const el = document.querySelector(`article[data-post="${id}"] [data-post-excerpt]`) ?? document.querySelector(`article[data-post="${id}"]`)
    if (!el) return null
    el.scrollIntoView({ block: "center" })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + Math.min(60, r.width / 2)), y: Math.round(r.top + r.height / 2) }
  }, CLOSED_ID)
  expect(!!at, "the closed post is in the feed", at)
  if (!at) return void (await s.p.close())
  await sleep(300)
  await s.p.evaluate(() => {
    window.__boxes = []
    window.__boxing = true
    const read = () => {
      if (!window.__boxing) return
      const panel = document.querySelector('[data-post-overlay="panel"]')
      const sheet = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((x) => x.querySelector("[data-post-fullscreen]"))
      const box = panel ?? sheet
      const section = document.querySelector("[data-post-overlay-scroll] section#comments, [data-post-overlay-scroll] [data-comments]")
      if (box) {
        const r = box.getBoundingClientRect()
        window.__boxes.push({ t: Math.round(performance.now()), top: Math.round(r.top), h: Math.round(r.height), comments: section ? Math.round(section.getBoundingClientRect().height) : null, closed: !!document.querySelector("[data-comments-closed]"), loading: !!document.querySelector("[data-comments-loading]") })
      }
      requestAnimationFrame(() => setTimeout(read, 0))
    }
    requestAnimationFrame(() => setTimeout(read, 0))
  })
  if (!desk) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  const t0 = await s.p.evaluate(() => performance.now())
  const rec = await record(
    s,
    async () => {
      if (desk) await s.p.mouse.click(at.x, at.y)
      else {
        await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y, radiusX: 4, radiusY: 4, force: 1 }] })
        await sleep(40)
        await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      }
    },
    2200,
  )
  if (!desk) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await sleep(400)
  const boxes = (await s.p.evaluate(() => ((window.__boxing = false), window.__boxes))).map((b) => ({ ...b, t: Math.round(b.t - t0) }))
  await frameSheet(s, rec, `closed-${where}-frames`, desk ? { cols: 4, scale: 0.5, max: 24 } : {})
  await s.p.screenshot({ path: join(shots, `${LABEL}-closed-${where}-rest.png`) })
  const last = boxes.at(-1)
  /* Once it has arrived (its top no longer moving, or on a computer its height at its first full size), the largest it was against where it ends. */
  const settledFrom = desk ? boxes.findIndex((b) => b.h >= (last?.h ?? 0) - 1) : boxes.findIndex((b, i) => i > 0 && Math.abs(b.top - (last?.top ?? 0)) <= 1)
  const after = settledFrom >= 0 ? boxes.slice(settledFrom) : []
  const tallest = Math.max(0, ...after.map((b) => b.h))
  const comments = after.map((b) => b.comments).filter((x) => x !== null)
  const commentsShrink = comments.length ? Math.max(...comments) - comments.at(-1) : null
  results[`closed-${where}`] = { last, tallest, commentsShrink, boxes: boxes.filter((_, i) => i % 2 === 0).slice(0, 60) }
  console.log(`  arrived: box ${desk ? `height ${last?.h}` : `top ${last?.top}`}, its tallest after arriving ${tallest}; the comments area ranged ${comments.length ? `${Math.min(...comments)}..${Math.max(...comments)}` : "-"} and ended ${comments.at(-1) ?? "-"}; closed line shown ${last?.closed}`)
  console.log(`  frames [ms, top, height, comments, loading] ${JSON.stringify(boxes.filter((_, i) => i % 3 === 0).slice(0, 30).map((b) => [b.t, b.top, b.h, b.comments, b.loading ? 1 : 0]))}`)
  expect(!!last?.closed, "the post says its comments are closed", last)
  expect(!!last && tallest - last.h <= 1, desk ? "on a computer the panel never gets shorter once it is open" : "on a phone the sheet never gets shorter once it is up", { tallest, end: last?.h })
  expect(commentsShrink !== null && commentsShrink <= 1, "the comments area under the post does not shrink as the comments arrive", commentsShrink)
  expect(!s.errors.length, "no page errors", s.errors.slice(0, 3))
  await s.p.close()
}

/*
  I3: THE "NEW POST" PILL GOES SMOOTHLY (the owner: "the New post pill in the feed should smoothly disappear as I scroll up and
  see the new post"). A reader scrolled down; a quiet refresh finds a new post (FRESH_POSTS_EVENT, as feed.tsx sends it); the
  pill waits under the bar; the reader scrolls back up and the post goes in. Every drawn frame the pill's opacity is read: it
  must fade over several frames, not vanish in one.
*/
async function partPill() {
  console.log(`\nPILL: a new post while scrolled down, then back up to it (390x844, touch, ${THROTTLE}x CPU)`)
  const s = await session("safari")
  await s.p.evaluate(() => window.scrollTo(0, 900))
  await sleep(500)
  await s.p.evaluate(() => {
    const now = new Date().toISOString()
    const post = { id: "a0000000-0000-4000-8000-000000000099", communityId: "c0000000-0000-4000-8000-000000000001", space: { id: "s-general", slug: "general", name: "General" }, kind: "post", title: "Fresh from the kiln", body: "", bodyText: "Unloaded this morning.", media: [], pinned: false, featured: false, locked: false, status: "published", author: { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, role: "member", level: 3, hasStorefront: false }, reactionCount: 0, commentCount: 0, reacted: false, bookmarked: false, poll: null, createdAt: now, editedAt: null, lastActivityAt: now, canEdit: false, canModerate: false }
    window.dispatchEvent(new CustomEvent("storelib:feed-fresh-posts", { detail: { key: "c0000000-0000-4000-8000-000000000001|all|default", posts: [post] } }))
  })
  await sleep(600)
  const waiting = await s.p.evaluate(() => !!document.querySelector("[data-feed-new-pill]"))
  expect(waiting, "scrolled down, the new post waits under the pill", waiting)
  await s.p.screenshot({ path: join(shots, `${LABEL}-pill-waiting.png`) })
  await s.p.evaluate(() => {
    window.__pill = []
    window.__pilling = true
    const read = () => {
      if (!window.__pilling) return
      const el = document.querySelector("[data-feed-new-pill]")
      window.__pill.push({ t: Math.round(performance.now()), on: !!el, opacity: el ? Math.round(Number(getComputedStyle(el).opacity) * 100) / 100 : 0, post: !!document.querySelector('[data-feed-list] > [data-post="a0000000-0000-4000-8000-000000000099"]') })
      requestAnimationFrame(() => setTimeout(read, 0))
    }
    requestAnimationFrame(() => setTimeout(read, 0))
  })
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  const rec = await record(s, () => s.p.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })), 1600)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const pill = await s.p.evaluate(() => ((window.__pilling = false), window.__pill))
  await frameSheet(s, rec, "pill-frames")
  const inAt = pill.findIndex((x) => x.post)
  const fading = pill.filter((x, i) => i >= inAt && x.on && x.opacity > 0.02 && x.opacity < 0.98).length
  const goneAt = pill.findIndex((x, i) => i >= inAt && !x.on)
  results.pill = { fading, inAt, goneAt, pill: pill.slice(Math.max(0, inAt - 2), inAt + 14) }
  console.log(`  the post went in at frame ${inAt}; the pill was drawn half faded on ${fading} frame(s) after that, and gone at frame ${goneAt}`)
  console.log(`  [on, opacity, post in] ${JSON.stringify(pill.slice(Math.max(0, inAt - 2), inAt + 14).map((x) => [x.on ? 1 : 0, x.opacity, x.post ? 1 : 0]))}`)
  expect(inAt >= 0, "back at the top, the new post goes in", inAt)
  expect(fading >= 2, "the pill fades over several frames as the post goes in, rather than vanishing in one", fading)
  expect(goneAt > inAt, "and then it is gone", goneAt)
  expect(!s.errors.length, "no page errors", s.errors.slice(0, 3))
  await s.p.close()
}

/*
  COST: WHAT ONE KEYBOARD MOVE COSTS THE PAGE (round 27 follow-up). With the New post sheet open over the feed and the words
  typed in, the keyboard comes up and goes down the way Safari reports it; a trace of each move counts the style recalcs
  (and how many elements each touched) and the layouts, and the long tasks are listed. Then each root write alone
  (KeyboardGuard's class, ViewportVars' --vv-h and --kb-inset, KeyboardGuard's --vvh) is timed forced, at 1x.
*/
async function partCost(throttle) {
  console.log(`\nCOST: a keyboard up and down with the New post sheet open (390x844, touch, ${throttle}x CPU)`)
  const s = await session("safari")
  await s.p.evaluate(() => window.__compose?.())
  await sleep(1600)
  await s.p.evaluate(() => document.querySelector("[data-composer=sheet] textarea")?.focus({ preventScroll: true }))
  await s.p.keyboard.type("Fired the big bowl today", { delay: 5 })
  await sleep(300)
  const each = await s.p.evaluate(() => {
    const root = document.documentElement
    const t = (f) => { void document.body.offsetHeight; const a = performance.now(); f(); void document.body.offsetHeight; return Math.round((performance.now() - a) * 10) / 10 }
    const runs = (f) => { const xs = [t(f), t(f), t(f), t(f)]; return xs.sort((a, b) => a - b)[1] }
    return {
      nodes: document.querySelectorAll("*").length,
      keyboardOpenClass: runs(() => root.classList.toggle("keyboard-open")),
      vvH: runs(() => root.style.setProperty("--vv-h", `${800 + Math.round(Math.random() * 40)}px`)),
      kbInset: runs(() => root.style.setProperty("--kb-inset", `${Math.round(Math.random() * 40)}px`)),
      vvTop: runs(() => root.style.setProperty("--vv-top", `${Math.round(Math.random() * 4)}px`)),
      vvh: runs(() => root.style.setProperty("--vvh", `${800 + Math.round(Math.random() * 40)}px`)),
      dataKeyboard: runs(() => (root.dataset.keyboard = root.dataset.keyboard === "open" ? "" : "open")),
      nothing: runs(() => {}),
      /* How many custom properties every element inherits (each recalc after a root change copies them). */
      unusedRootVar: runs(() => root.style.setProperty("--zz-unused", `${Math.random()}px`)),
      unusedBodyVar: runs(() => document.body.style.setProperty("--zz-unused", `${Math.random()}px`)),
      unusedClassOnRoot: runs(() => root.classList.toggle("zz-unused")),
      ...((() => {
        const st = document.createElement("style")
        st.textContent = "html.zz-a .zz-x > * { min-height: 0 } html.zz-b [data-zz] > div { min-height: 0 } html.zz-c body { padding-bottom: 0 } html.zz-d .zz-x { padding-bottom: 0 }"
        document.head.appendChild(st)
        return {
          childUniversal: runs(() => root.classList.toggle("zz-a")),
          childTag: runs(() => root.classList.toggle("zz-b")),
          bodyTag: runs(() => root.classList.toggle("zz-c")),
          classOnly: runs(() => root.classList.toggle("zz-d")),
        }
      })()),
      inheritedCustom: (() => { const cs = getComputedStyle(document.body); let n = 0; for (let i = 0; i < cs.length; i++) if (cs[i].startsWith("--")) n++; return n })(),
    }
  })
  console.log(`  each write alone, forced style and layout, median of 4 (ms, 1x): ${JSON.stringify(each)}`)
  await s.p.evaluate(() => {
    delete document.documentElement.dataset.keyboard
    document.documentElement.classList.remove("keyboard-open")
  })
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  const out = {}
  const REPEAT = Number(process.env.REPEAT || 3)
  const moves = []
  for (let i = 0; i < REPEAT; i++) moves.push([`up${i + 1}`, () => s.p.evaluate((h) => { window.__keys(h); window.__vv(0, 844 - h) }, KEYS)], [`down${i + 1}`, () => s.p.evaluate(() => { window.__keys(0); window.__vvReal() })])
  for (const [name, act] of moves) {
    await s.p.evaluate(() => { window.__long = []; window.__tracking = true })
    await s.p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack"] })
    await act()
    await sleep(900)
    const buf = await s.p.tracing.stop()
    const long = await s.p.evaluate(() => ((window.__tracking = false), window.__long.slice()))
    const ev = JSON.parse(Buffer.from(buf).toString("utf8")).traceEvents
    const styles = ev.filter((e) => (e.name === "UpdateLayoutTree" || e.name === "RecalculateStyles") && e.ph === "X")
    const layouts = ev.filter((e) => e.name === "Layout" && e.ph === "X")
    const ms = (xs) => Math.round(xs.reduce((a, e) => a + (e.dur || 0), 0) / 100) / 10
    out[name] = {
      longTasks: long,
      styleMs: ms(styles),
      styleElements: styles.map((e) => e.args?.elementCount ?? e.args?.beginData?.elementCount ?? null).filter((x) => x !== null),
      layoutMs: ms(layouts),
      layoutObjects: layouts.map((e) => e.args?.beginData?.dirtyObjects ?? null).filter((x) => x !== null),
    }
    if (process.env.WHO) for (const e of styles.filter((e) => (e.args?.elementCount ?? e.args?.beginData?.elementCount ?? 0) > 100 || (e.dur || 0) > 3000)) console.log(`    recalc ${Math.round((e.dur || 0) / 1000)}ms ${e.args?.elementCount ?? e.args?.beginData?.elementCount}: ${(e.args?.beginData?.stackTrace ?? []).slice(0, 5).map((f) => `${f.functionName}:${f.lineNumber}`).join(" < ") || "(the frame)"}`)
    console.log(`  ${name}: long tasks ${JSON.stringify(long)}; style ${out[name].styleMs}ms over ${styles.length} recalcs, elements ${JSON.stringify(out[name].styleElements)}; layout ${out[name].layoutMs}ms, dirty objects ${JSON.stringify(out[name].layoutObjects)}`)
  }
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  /* The median move each way: the main thread's longest task, the style time, and how many whole document restyles (over 400 elements). */
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  for (const dir of ["up", "down"]) {
    const runs = Object.entries(out).filter(([k]) => k.startsWith(dir)).map(([, v]) => v)
    out[`${dir}-median`] = { longestTaskMs: med(runs.map((r) => Math.max(0, ...r.longTasks))), styleMs: med(runs.map((r) => r.styleMs)), wholeDocumentRestyles: med(runs.map((r) => r.styleElements.filter((n) => n > 400).length)) }
    console.log(`  ${dir}, median of ${runs.length}: ${JSON.stringify(out[`${dir}-median`])}`)
  }
  results[`cost-${throttle}x`] = { each, ...out }
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
  if (want("pill")) await partPill()
  if (only.has("cost")) {
    await partCost(1)
    await partCost(4)
  }
  if (want("closed")) {
    await partClosed("phone")
    await partClosed("desktop")
  }
} finally {
  rmSync(stubs, { recursive: true, force: true })
  await browser.close()
}
writeFileSync(join(shots, `${LABEL}-results.json`), JSON.stringify(results, null, 2))
console.log(`\n  frames and screenshots in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
