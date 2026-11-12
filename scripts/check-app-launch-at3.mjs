/**
 * ===========================================================================
 *  ROUND AT, TRACK 3: OPENING THE PHONE APP, MEASURED
 * ===========================================================================
 * The iOS and Android apps open https://storelib.com/native-start in their
 * web view (capacitor.config.ts server.url). This drives that launch in
 * headless Chromium against a running Storelib server, as the shell does:
 *
 *   a phone viewport (390 x 844, touch), the shell's user agent (it appends
 *   "Capacitor StorelibWindows/1"), a stand in for the bridge the shell
 *   injects (window.Capacitor with App, Preferences and SplashScreen, and
 *   Android's window.StorelibNative), throttled 4G (150 ms round trip,
 *   1.6 Mbps down, 750 kbps up) and a 4x slower CPU, from a cold cache
 *   (a new profile) and a warm one (the same profile opened again).
 *
 * For each launch it reports:
 *   first paint            the first frame the web view drew
 *   content                the first frame with the landing page's own
 *                          content on it (welcome's buttons signed out;
 *                          signed in, the moment the gate hands over to
 *                          /app, since a session needs a real backend)
 *   splash down            when the iOS launch screen was told to hide
 *                          (SplashScreen.hide), and when Android's overlay
 *                          was (StorelibNative.appReady)
 *   redirects              HTTP redirects plus in page hops (router.replace,
 *                          location.replace) between the shell's URL and
 *                          the landing page
 *   loaders                every distinct web loader that was drawn: the
 *                          gate's spinner, the shell's cold start frame, an
 *                          auth screen, any spinner or skeleton
 *   JS                     script bytes over the wire before content
 *
 *   BASE=http://localhost:4517 node scripts/check-app-launch-at3.mjs
 *   SHOTS_DIR=<dir> to keep a picture of each landing.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const BASE = process.env.BASE || "http://localhost:4517"
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS_DIR || null
const LABEL = process.env.LABEL || "run"
const RUNS = Number(process.env.RUNS || 3)
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor StorelibWindows/1"
const NET = { download: (1.6 * 1024 * 1024) / 8, upload: (750 * 1024) / 8, latency: 150 }
const REF = "placeholder"
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/* The shell's bridge, before any page script: what native-bridge.js gives a real web view. */
const BRIDGE = `(() => {
  if (location.pathname === "/robots.txt") return
  const at = () => Math.round(performance.timeOrigin + performance.now())
  const log = (k, v) => { try { const a = JSON.parse(sessionStorage.getItem("__launch") || "[]"); a.push([k, at(), v || null]); sessionStorage.setItem("__launch", JSON.stringify(a)) } catch {} }
  window.__launchLog = log
  const prefs = { get: ({ key }) => ({ value: localStorage.getItem("__prefs:" + key) }), set: ({ key, value }) => { localStorage.setItem("__prefs:" + key, value); return {} }, remove: ({ key }) => { localStorage.removeItem("__prefs:" + key); return {} }, keys: () => ({ keys: [] }) }
  const handlers = {
    App: { getLaunchUrl: () => ({}), getState: () => ({ isActive: true }), addListener: () => ({}), removeAllListeners: () => ({}) },
    Preferences: prefs,
    SplashScreen: { hide: () => { log("splash-hide"); return {} }, show: () => ({}) },
    StatusBar: { setStyle: () => ({}), setBackgroundColor: () => ({}), setOverlaysWebView: () => ({}), getInfo: () => ({}) },
    SystemBars: { setStyle: () => ({}), show: () => ({}), hide: () => ({}) },
    Keyboard: { addListener: () => ({}), setAccessoryBarVisible: () => ({}) },
    Haptics: { impact: () => ({}), selectionStart: () => ({}), selectionChanged: () => ({}), selectionEnd: () => ({}), notification: () => ({}), vibrate: () => ({}) },
    PushNotifications: { checkPermissions: () => ({ receive: "prompt" }), addListener: () => ({}), removeAllListeners: () => ({}) },
    Browser: { addListener: () => ({}) },
  }
  const headers = Object.entries(handlers).map(([name, m]) => ({ name, methods: Object.keys(m).map((n) => ({ name: n, rtype: n === "addListener" ? "callback" : "promise" })) }))
  let id = 0
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    PluginHeaders: headers,
    nativePromise: (p, m, o) => { const h = handlers[p] && handlers[p][m]; return h ? Promise.resolve(h(o || {})) : Promise.reject(new Error(p + "." + m + " is not there")) },
    nativeCallback: () => String(++id),
    Plugins: Object.fromEntries(Object.entries(handlers).map(([p, m]) => [p, Object.fromEntries(Object.keys(m).map((k) => [k, async (o) => m[k](o || {})]))])),
  }
  window.StorelibNative = { appReady() { log("android-ready") }, authStart() {} }
  /* What is on the glass, every frame. */
  const LOADERS = [
    ["gate spinner", ".ns-spinner"],
    ["cold start frame", "[data-app-cold-start]"],
    ["auth screen", "[data-auth-resolving]"],
    ["spinner", ".animate-spin, [role='progressbar']"],
    ["skeleton", ".animate-pulse, [data-skeleton]"],
  ]
  const seen = new Set()
  const shown = (el) => { const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return false; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false } return true }
  const tick = () => {
    try {
      for (const [k, sel] of LOADERS) if (!seen.has(k) && [...document.querySelectorAll(sel)].some(shown)) { seen.add(k); log("loader", k) }
      if (location.pathname === "/welcome" && [...document.querySelectorAll("button")].some(shown)) { if (!seen.has("content")) { seen.add("content"); log("content", "/welcome") } }
    } catch {}
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) log(e.name, Math.round(performance.timeOrigin + e.startTime)) }).observe({ type: "paint", buffered: true }) } catch {}
  log("document", location.pathname)
  const wrap = (o, k) => { const f = o[k]; o[k] = function (...a) { log("hop", k + " " + String(a[2] ?? a[0])); return f.apply(this, a) } }
  wrap(history, "replaceState"); wrap(history, "pushState")
})()`

async function launch(browser, context, signedIn, cold) {
  const page = await context.newPage()
  await page.setUserAgent(UA)
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.evaluateOnNewDocument(BRIDGE)
  const cdp = await page.createCDPSession()
  await cdp.send("Network.enable")
  await cdp.send("Network.emulateNetworkConditions", { offline: false, ...{ downloadThroughput: NET.download, uploadThroughput: NET.upload, latency: NET.latency } })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const scripts = new Map()
  const redirects = []
  const rsc = []
  cdp.on("Network.requestWillBeSent", (e) => {
    if (e.redirectResponse) redirects.push(`${e.redirectResponse.status} ${new URL(e.redirectResponse.url).pathname} -> ${new URL(e.request.url).pathname}`)
    if (e.type === "Script") scripts.set(e.requestId, { url: e.request.url, at: e.wallTime * 1000, bytes: 0 })
    if (e.request.headers?.RSC === "1" || e.request.headers?.rsc === "1" || /[?&]_rsc=/.test(e.request.url)) rsc.push({ at: e.wallTime * 1000, path: new URL(e.request.url).pathname })
  })
  cdp.on("Network.loadingFinished", (e) => {
    const s = scripts.get(e.requestId)
    if (s) s.bytes = e.encodedDataLength
  })
  /* The phone's storage: a session and a home, or nothing. */
  await page.goto(`${BASE}/robots.txt`).catch(() => {})
  await page.evaluate((signedIn, ref) => {
    sessionStorage.clear()
    if (!signedIn) return
    const exp = Math.floor(Date.now() / 1000) + 3600
    const session = JSON.stringify({ access_token: "probe.token.only", refresh_token: "probe", expires_at: exp, expires_in: 3600, token_type: "bearer", user: { id: "00000000-0000-4000-8000-000000000001" } })
    localStorage.setItem(`sb-${ref}-auth-token`, session)
    localStorage.setItem("sb-native-home", "/app")
  }, signedIn, REF)
  const t0 = Date.now()
  await page.goto(`${BASE}/native-start`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {})
  /* Long enough for the slowest landing at these settings. */
  const deadline = Date.now() + 25000
  let log = []
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250))
    log = await page.evaluate(() => JSON.parse(sessionStorage.getItem("__launch") || "[]")).catch(() => log)
    const done = signedIn ? rsc.some((r) => r.path.startsWith("/app")) : log.some(([k]) => k === "content")
    const splash = log.some(([k]) => k === "splash-hide")
    if (done && (splash || signedIn)) { await new Promise((r) => setTimeout(r, 1200)); break }
  }
  log = await page.evaluate(() => JSON.parse(sessionStorage.getItem("__launch") || "[]")).catch(() => log)
  const first = (k) => { const e = log.find(([n]) => n === k); return e ? e[1] - t0 : null }
  const contentAt = signedIn ? (rsc.find((r) => r.path.startsWith("/app"))?.at ?? null) : log.find(([k]) => k === "content")?.[1] ?? null
  const content = contentAt === null ? null : Math.round(contentAt - t0)
  const hops = log.filter(([k]) => k === "hop").map(([, , v]) => v).filter((v) => !/null$|undefined$/.test(v) && !/native-start$/.test(v))
  const docs = log.filter(([k]) => k === "document").map(([, , v]) => v)
  const loaders = [...new Set(log.filter(([k]) => k === "loader").map(([, , v]) => v))]
  const jsBefore = [...scripts.values()].filter((s) => contentAt === null || s.at <= contentAt).reduce((n, s) => n + s.bytes, 0)
  const jsAll = [...scripts.values()].reduce((n, s) => n + s.bytes, 0)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${LABEL}-${signedIn ? "signed-in" : "signed-out"}-${cold ? "cold" : "warm"}.png`) }).catch(() => {})
  const out = {
    firstPaint: first("first-paint"),
    firstContentfulPaint: first("first-contentful-paint"),
    handoff: (() => { const e = log.find(([k, , v]) => k === "hop" && v && !/native-start$/.test(v)); return e ? e[1] - t0 : null })(),
    content,
    splashHide: first("splash-hide"),
    androidReady: first("android-ready"),
    httpRedirects: redirects,
    inPageHops: hops,
    documents: docs,
    loaders,
    jsKBBeforeContent: Math.round(jsBefore / 1024),
    jsKBTotal: Math.round(jsAll / 1024),
    landedOn: await page.evaluate(() => location.pathname).catch(() => null),
  }
  await page.close()
  return out
}

const median = (xs) => { const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], userDataDir: mkdtempSync(join(tmpdir(), "storelib-at3-")) })
const results = {}
for (const signedIn of [false, true]) {
  for (const cold of [true, false]) {
    const runs = []
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.createBrowserContext()
      if (!cold) await launch(browser, context, signedIn, true) // fills the cache, as the app's earlier opening did
      runs.push(await launch(browser, context, signedIn, cold))
      await context.close()
    }
    const key = `${signedIn ? "signed in" : "signed out"}, ${cold ? "cold" : "warm"}`
    results[key] = {
      firstPaint: median(runs.map((r) => r.firstPaint)),
      firstContentfulPaint: median(runs.map((r) => r.firstContentfulPaint)),
      handoff: median(runs.map((r) => r.handoff)),
      content: median(runs.map((r) => r.content)),
      splashHide: median(runs.map((r) => r.splashHide)),
      androidReady: median(runs.map((r) => r.androidReady)),
      jsKBBeforeContent: median(runs.map((r) => r.jsKBBeforeContent)),
      jsKBTotal: median(runs.map((r) => r.jsKBTotal)),
      sample: runs[runs.length - 1],
    }
    console.log(`\n${key}`)
    console.log(JSON.stringify(results[key], null, 1))
  }
}
await browser.close()
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 2))
