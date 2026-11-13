/**
 * ===========================================================================
 *  ROUND AU, TRACK 1: THE PHONE APP ON A BAD NETWORK, MEASURED
 * ===========================================================================
 * Drives the app's start (https://storelib.com/native-start, as the shells
 * open it) in headless Chromium at 390 x 844 touch, with a stand in for the
 * bridge the shell injects, and breaks the network in the ways a phone does:
 *
 *   offline at the hand over   the gate's document is in, then the phone is
 *                              offline (navigator.onLine false) when it sends
 *                              a signed in start to /app
 *   no answer at the hand over online as far as the phone knows, but /app
 *                              never answers (a dead cell, a captive portal)
 *   failed at the hand over    online, and every /app request fails at once
 *   offline tap                signed out on /welcome, the phone goes
 *                              offline, then a tap on a link to sign in
 *
 * For each it reports when the launch screen was told to come down (iOS
 * SplashScreen.hide, Android StorelibNative.appReady), where the web view
 * ended (a chrome-error: address is the system's own error page, a dead
 * end inside the app), and whether a Try again button is on screen.
 *
 *   BASE=http://localhost:4531 node scripts/check-app-network-au1.mjs
 */
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const BASE = process.env.BASE || "http://localhost:4531"
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const WAIT = Number(process.env.WAIT_MS || 30000)
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 wv Capacitor StorelibWindows/1"
const REF = "placeholder"

const BRIDGE = (offlineAtStart) => `(() => {
  if (location.pathname === "/robots.txt") return
  const at = () => Math.round(performance.timeOrigin + performance.now())
  const log = (k, v) => { try { const a = JSON.parse(localStorage.getItem("__au1") || "[]"); a.push([k, at(), v || null]); localStorage.setItem("__au1", JSON.stringify(a)) } catch {} }
  ${offlineAtStart ? `try { Object.defineProperty(Navigator.prototype, "onLine", { get: () => !window.__au1Online ? false : true, configurable: true }) } catch {}` : ""}
  const prefs = { get: ({ key }) => ({ value: localStorage.getItem("__prefs:" + key) }), set: ({ key, value }) => { localStorage.setItem("__prefs:" + key, value); return {} }, remove: () => ({}), keys: () => ({ keys: [] }) }
  const handlers = {
    App: { getLaunchUrl: () => ({}), getState: () => ({ isActive: true }), addListener: () => ({ remove() {} }), removeAllListeners: () => ({}) },
    Preferences: prefs,
    SplashScreen: { hide: () => { log("splash-hide"); return {} }, show: () => ({}) },
    StatusBar: { setStyle: () => ({}), setBackgroundColor: () => ({}), setOverlaysWebView: () => ({}), getInfo: () => ({}) },
    SystemBars: { setStyle: () => ({}), show: () => ({}), hide: () => ({}) },
    Keyboard: { addListener: () => ({ remove() {} }), setAccessoryBarVisible: () => ({}) },
    Haptics: { impact: () => ({}), selectionStart: () => ({}), selectionChanged: () => ({}), selectionEnd: () => ({}), notification: () => ({}), vibrate: () => ({}) },
    PushNotifications: { checkPermissions: () => ({ receive: "prompt" }), addListener: () => ({ remove() {} }), removeAllListeners: () => ({}) },
    Browser: { addListener: () => ({ remove() {} }) },
  }
  const headers = Object.entries(handlers).map(([name, m]) => ({ name, methods: Object.keys(m).map((n) => ({ name: n, rtype: n === "addListener" ? "callback" : "promise" })) }))
  let id = 0
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    PluginHeaders: headers,
    nativePromise: (p, m, o) => { const h = handlers[p] && handlers[p][m]; return h ? Promise.resolve(h(o || {})) : Promise.reject(new Error(p + "." + m + " is not there")) },
    nativeCallback: () => String(++id),
    Plugins: Object.fromEntries(Object.entries(handlers).map(([p, m]) => [p, Object.fromEntries(Object.keys(m).map((k) => [k, async (o) => m[k](o || {})]))])),
  }
  window.androidBridge = { postMessage() {} }
  window.StorelibNative = { appReady() { log("android-ready") }, authStart() {} }
  log("document", location.pathname)
})()`

async function state(page) {
  return page
    .evaluate(() => {
      const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== "hidden" }
      const buttons = [...document.querySelectorAll("button, a")].filter(shown).map((b) => (b.textContent || "").trim()).filter(Boolean)
      return { url: location.href, retry: buttons.some((t) => /try again|retry/i.test(t)), buttons: buttons.slice(0, 6), text: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 140) }
    })
    .catch((e) => ({ url: page.url(), retry: false, buttons: [], text: `(not readable: ${String(e.message).slice(0, 60)})` }))
}

async function readLog(page, fallback) {
  try {
    const cdp = await page.createCDPSession()
    const { result } = await cdp.send("Runtime.evaluate", { expression: `localStorage.getItem("__au1")`, returnByValue: true })
    await cdp.detach()
    return JSON.parse(result.value || "[]")
  } catch {
    return fallback
  }
}

async function scenario(browser, name, { signedIn, offlineAtStart, appRequests, tapOffline }) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setUserAgent(UA)
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.evaluateOnNewDocument(BRIDGE(offlineAtStart))
  await page.goto(`${BASE}/robots.txt`).catch(() => {})
  await page.evaluate((signedIn, ref) => {
    localStorage.clear()
    sessionStorage.clear()
    if (!signedIn) return
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: "probe.token.only", refresh_token: "probe", expires_at: exp, expires_in: 3600, token_type: "bearer", user: { id: "00000000-0000-4000-8000-000000000001" } }))
    localStorage.setItem("sb-native-home", "/app")
  }, signedIn, REF)
  /* What happens to the requests for /app (the RSC payload and any document load of it). */
  if (appRequests) {
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const u = new URL(req.url())
      if (u.pathname === "/app" || u.pathname.startsWith("/app/")) {
        if (appRequests === "hang") return /* never answered */
        return void req.abort("internetdisconnected").catch(() => {})
      }
      req.continue().catch(() => {})
    })
  }
  const t0 = Date.now()
  await page.goto(`${BASE}${signedIn ? "/native-start" : "/welcome"}`, { waitUntil: "load", timeout: 90000 }).catch(() => {})
  let tapped = null
  if (tapOffline) {
    await new Promise((r) => setTimeout(r, 4000))
    const cdp = await page.createCDPSession()
    await cdp.send("Network.enable")
    await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await new Promise((r) => setTimeout(r, 300))
    tapped = await page.evaluate(() => {
      /* A link that loads a document (a plain anchor, or the router falling back when it cannot fetch a page): what fails offline. */
      const a = document.createElement("a")
      a.href = "/help"
      a.textContent = "Help"
      document.body.appendChild(a)
      a.click()
      return "/help"
    }).catch(() => null)
  }
  await new Promise((r) => setTimeout(r, WAIT))
  const log = await readLog(page, [])
  const first = (k) => { const e = log.find(([n]) => n === k); return e ? e[1] - t0 : null }
  const out = { scenario: name, tapped, splashHide: first("splash-hide"), androidReady: first("android-ready"), ...(await state(page)) }
  await context.close()
  return out
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], userDataDir: mkdtempSync(join(tmpdir(), "storelib-au1-")) })
const results = []
for (const [name, opts] of [
  ["offline at the hand over", { signedIn: true, offlineAtStart: true, appRequests: "fail" }],
  ["no answer at the hand over", { signedIn: true, appRequests: "hang" }],
  ["failed at the hand over", { signedIn: true, appRequests: "fail" }],
  ["offline tap", { signedIn: false, tapOffline: true }],
].filter(([n]) => !process.env.ONLY || n === process.env.ONLY)) {
  const r = await scenario(browser, name, opts)
  results.push(r)
  console.log(JSON.stringify(r))
}
await browser.close()
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 2))
