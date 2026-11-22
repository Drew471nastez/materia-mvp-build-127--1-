/**
 * ===========================================================================
 *  A PUSH, FROM THE PHONE'S SIDE, IN A REAL BROWSER ENGINE (r57)
 * ===========================================================================
 * The web layer the Capacitor app loads, run in headless Chromium with the
 * native parts stood in at their edge (the Capacitor bridge and the push
 * plugin, which on a phone are Swift and Java):
 *
 *   register   lib/push/client.ts registerDevice, signed in, iOS and Android:
 *              the token reaches POST /api/push/register with the session's
 *              bearer token, once per person and token; Android makes the
 *              "default" channel every push names
 *   tap        pushNotificationActionPerformed with each push's data (a
 *              sale, a payout, an engine notification, an order event, a
 *              review, a community post): the app goes to the page
 *              lib/push/tap.ts names, inside the WebView, and nowhere else
 *              for anything that points off storelib.com
 *   badge      iOS: the delivered notifications (and the badge) are cleared
 *              when the app comes forward
 *   log out    lib/auth/log-out.ts endDeviceSession: DELETE /api/push/register
 *              with this phone's token BEFORE the sign out, and the client
 *              then sends the token again at the next sign in
 *
 * The server half (the engine, the sender, FCM's message, the routes) is
 * tests/notify-e2e-r57.test.ts. Prints what it measured; exits 1 on a miss.
 *
 *   node scripts/check-notify-e2e-r57.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "esbuild"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const root = process.cwd()
const ORIGIN = "https://storelib.com"
const dir = mkdtempSync(join(tmpdir(), "check-notify-r57-"))
const w = (name, src) => (writeFileSync(join(dir, name), src), join(dir, name))

const STUBS = {
  "@capacitor/core": w("core.js", `export const Capacitor = { getPlatform: () => window.__platform, isNativePlatform: () => true }
export class WebPlugin {}
export const registerPlugin = () => new Proxy({}, { get: () => async () => ({ keys: [], value: null }) })
`),
  "@capacitor/push-notifications": w("push.js", `const L = (window.__listeners = {})
window.__plugin = { channels: [], cleared: 0, registered: 0 }
export const PushNotifications = {
  checkPermissions: async () => ({ receive: "granted" }),
  addListener: (name, cb) => { (L[name] ||= []).push(cb); return { remove() {} } },
  createChannel: async (c) => { window.__plugin.channels.push(c) },
  register: async () => { window.__plugin.registered++; if (window.__platform === "android") setTimeout(() => (L.registration || []).forEach((cb) => cb({ value: "android-fcm-token" })), 10) },
  removeAllDeliveredNotifications: async () => { window.__plugin.cleared++ },
}
`),
  "@/lib/supabase/client": w("supabase.js", `export const createClient = () => ({ auth: { getSession: async () => ({ data: { session: window.__session } }) } })\n`),
  "@/lib/navigation/app-router-handle": w("router.js", `export const appRouter = () => null\n`),
}

const entry = w("entry.ts", `
import { registerDevice } from "@/lib/push/client"
import { endDeviceSession } from "@/lib/auth/log-out"
;(window as any).__registerDevice = registerDevice
;(window as any).__logOut = (scope: "local" | "global") => endDeviceSession(scope, {
  signOut: async () => { (window as any).__order.push("signOut"); return { error: null } },
  getSession: async () => { (window as any).__order.push("getSession"); return { data: { session: (window as any).__session } } },
}, undefined, async () => undefined)
`)

await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  alias: { "@": root },
  plugins: [{ name: "native-edge", setup(b) { b.onResolve({ filter: /.*/ }, (a) => (a.path in STUBS ? { path: STUBS[a.path] } : undefined)) } }],
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: join(dir, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(dir, "app.js"), "utf8")

let passed = 0
let failed = 0
const check = (label, ok, detail) => {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${!ok && detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
}

const browser = await chromium.launch()
async function phone(platform) {
  const page = await browser.newPage()
  const calls = []
  const visits = []
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await page.route("**/*", async (route) => {
    const req = route.request()
    const url = req.url()
    if (url.startsWith(`${ORIGIN}/api/`)) {
      calls.push({ method: req.method(), path: url.slice(ORIGIN.length), auth: req.headers()["authorization"] || null, body: req.postData() })
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, auth: true }) })
    }
    if (url.startsWith(ORIGIN) && req.isNavigationRequest()) {
      const path = url.slice(ORIGIN.length)
      if (path !== "/app") visits.push(path)
      return route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><title>${path}</title><script>window.__platform=${JSON.stringify(platform)};window.__order=[];window.__session={user:{id:"seller-1"},access_token:"access-1"};window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>${JSON.stringify(platform)}};${platform === "ios" ? "window.__storelibFcmToken=\"ios-fcm-token\";" : ""}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script>` })
    }
    return route.fulfill({ status: 404, body: "" })
  })
  await page.goto(`${ORIGIN}/app`)
  return { page, calls, visits, errors }
}

for (const platform of ["ios", "android"]) {
  console.log(`\n${platform}`)
  const p = await phone(platform)
  await p.page.evaluate(() => window.__registerDevice())
  await p.page.waitForTimeout(150)
  const token = platform === "ios" ? "ios-fcm-token" : "android-fcm-token"
  const saves = p.calls.filter((c) => c.method === "POST" && c.path === "/api/push/register")
  check("the token reaches /api/push/register once, with the session's bearer", saves.length === 1 && JSON.parse(saves[0].body).token === token && JSON.parse(saves[0].body).platform === platform && saves[0].auth === "Bearer access-1", saves)
  await p.page.evaluate(() => window.__registerDevice())
  await p.page.waitForTimeout(100)
  check("  registering again on the same launch sends nothing more", p.calls.filter((c) => c.path === "/api/push/register").length === 1)
  const plugin = await p.page.evaluate(() => window.__plugin)
  if (platform === "android") check("  Android makes the channel the server names, with a banner (importance 4)", plugin.channels.some((c) => c.id === "default" && c.importance === 4), plugin.channels)
  if (platform === "ios") {
    await p.page.waitForTimeout(1600)
    const atLaunch = (await p.page.evaluate(() => window.__plugin)).cleared
    await p.page.evaluate(() => document.dispatchEvent(new Event("resume")))
    const afterResume = (await p.page.evaluate(() => window.__plugin)).cleared
    check("  iOS clears delivered notifications and the badge at launch and on coming forward", atLaunch >= 1 && afterResume === atLaunch + 1, { atLaunch, afterResume })
  }

  const taps = [
    [{ type: "sale", orderId: "ord_123" }, "/app/orders?order=ord_123"],
    [{ type: "payout_available" }, "/app/payouts"],
    [{ type: "notification", kind: "payout_sent", url: "/app/payouts" }, "/app/payouts"],
    [{ type: "notification", kind: "order_return_requested", url: "/app/orders?order=55555555-5555-4555-8555-555555555555" }, "/app/orders?order=55555555-5555-4555-8555-555555555555"],
    [{ type: "notification", kind: "new_review", url: "/app/reviews?review=rv1" }, "/app/reviews?review=rv1"],
    [{ type: "inbox", url: "/community/film-loft/post/p1" }, "/community/film-loft/post/p1"],
  ]
  const fresh = async () => {
    await p.page.goto(`${ORIGIN}/app`)
    await p.page.evaluate(() => window.__registerDevice())
    await p.page.waitForTimeout(50)
  }
  const tap = (d) => p.page.evaluate((x) => window.__listeners.pushNotificationActionPerformed.forEach((cb) => cb({ notification: { data: x } })), d)
  for (const [data, want] of taps) {
    await fresh()
    p.visits.length = 0
    await Promise.all([p.page.waitForURL(`${ORIGIN}${want}`, { timeout: 3000 }).catch(() => undefined), tap(data)])
    await p.page.waitForLoadState("load")
    check(`  a tap on ${data.kind || data.type} opens ${want} inside the app, one page load`, p.page.url() === `${ORIGIN}${want}` && p.visits.length === 1, { url: p.page.url(), visits: p.visits })
  }
  for (const evil of [{ type: "inbox", url: "https://evil.example/x" }, { type: "inbox", url: "//evil.example" }, { type: "notification", url: "javascript:alert(1)" }]) {
    await fresh()
    await tap(evil)
    await p.page.waitForTimeout(400)
    await p.page.waitForLoadState("load")
    check(`  a push naming ${evil.url} never leaves storelib.com`, p.page.url().startsWith(ORIGIN) && !/evil/.test(p.page.url()), p.page.url())
  }
  await fresh()

  console.log("  log out")
  p.calls.length = 0
  await p.page.evaluate(() => window.__registerDevice())
  await p.page.waitForTimeout(150)
  await p.page.evaluate(() => window.__logOut("local"))
  const order = await p.page.evaluate(() => window.__order)
  const del = p.calls.find((c) => c.method === "DELETE" && c.path === "/api/push/register")
  check("  DELETE /api/push/register with this phone's token, before the sign out", !!del && JSON.parse(del.body).token === token && del.auth === "Bearer access-1" && order.indexOf("getSession") < order.indexOf("signOut"), { del, order })
  p.calls.length = 0
  await p.page.evaluate(() => window.__registerDevice())
  await p.page.waitForTimeout(150)
  check("  the next sign in on this launch sends the token again", p.calls.some((c) => c.method === "POST" && c.path === "/api/push/register"), p.calls)
  check("  no page errors", p.errors.length === 0, p.errors)
  await p.page.close()
}

await browser.close()
rmSync(dir, { recursive: true, force: true })
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
