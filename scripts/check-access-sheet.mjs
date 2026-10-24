/**
 * THE CAMERA, THE LIBRARY AND NOTIFICATIONS AFTER A NO, IN A REAL BROWSER.
 *
 * Mounts components/platform/access-sheet.tsx and notifications-ask.tsx in
 * headless Chromium with the app's plugins stood in for, then taps through
 * each case and measures what opened: the sheet, the file picker, the
 * phone's prompt, the phone's Settings. Also writes a picture of the sheet
 * at an iPhone's width for the visual review.
 *
 *   node scripts/check-access-sheet.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-access-"))
const stubs = join(out, "stubs")
mkdirSync(stubs, { recursive: true })

writeFileSync(join(stubs, "camera.js"), `
export const CameraSource = { Camera: "CAMERA", Photos: "PHOTOS", Prompt: "PROMPT" }
export const CameraResultType = { Base64: "base64" }
export const Camera = {
  async checkPermissions() { return { camera: window.__cam, photos: window.__photos || "granted" } },
  async requestPermissions() { window.__camAsked = (window.__camAsked || 0) + 1; return { camera: window.__cam, photos: window.__photos || "granted" } },
  async getPhoto() { if (window.__cam === "denied") throw new Error("User denied access to camera"); return { base64String: "AA==", format: "jpeg" } },
}
`)
writeFileSync(join(stubs, "push.js"), `
export const PushNotifications = {
  async checkPermissions() { return { receive: window.__push } },
  async requestPermissions() { window.__pushAsked = (window.__pushAsked || 0) + 1; window.__push = "granted"; return { receive: "granted" } },
}
`)
writeFileSync(join(stubs, "supabase.js"), `export const createClient = () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: "u" } } } }) } })\n`)
writeFileSync(join(stubs, "push-client.js"), `export async function registerDevice() { window.__registered = (window.__registered || 0) + 1 }\n`)

const bundle = join(out, "page.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-access-sheet.tsx"),
  "--bundle", "--platform=browser", "--format=iife", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  "--define:process.env.NODE_ENV=\"production\"",
  `--alias:@capacitor/camera=${join(stubs, "camera.js")}`, `--alias:@capacitor/push-notifications=${join(stubs, "push.js")}`,
  `--alias:@/lib/supabase/client=${join(stubs, "supabase.js")}`, `--alias:@/lib/push/client=${join(stubs, "push-client.js")}`,
  `--alias:@=${root}`], { stdio: ["ignore", "ignore", "inherit"] })

/* The page's Tailwind, from the classes these two files use. */
const postcss = require("postcss")
const tailwind = require("@tailwindcss/postcss")
const cssIn = `@import "tailwindcss" source(none);\n@source "${join(root, "components/platform/access-sheet.tsx")}";\n@source "${join(root, "components/platform/notifications-ask.tsx")}";\n`
const css = (await postcss([tailwind({ base: root })]).process(cssIn, { from: join(root, "app/check-access.css") })).css
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="background:#f8f9fa"><div id="root"></div><script src="page.js"></script></body></html>`)

let passed = 0
let failed = 0
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}

const browser = await chromium.launch()
const NOW = Date.now()

async function open(init) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  /* A file:// page has no server: the account's switch is counted where it is sent. */
  await page.addInitScript(() => {
    const real = window.fetch
    window.fetch = (url, init) => {
      if (String(url).includes("/api/me/push") && init?.method === "PATCH") { window.__patched = (window.__patched || 0) + 1; return Promise.resolve(new Response("{}")) }
      return real(url, init)
    }
  })
  await page.addInitScript(init)
  await page.goto("file://" + join(out, "index.html"))
  await page.waitForTimeout(300)
  return { page, context }
}

/** Whether the tap opens a file picker within the time, without waiting the whole time when it does. */
async function opensPicker(page, tap, ms = 700) {
  const chooser = page.waitForEvent("filechooser", { timeout: ms }).then(() => true, () => false)
  await tap()
  return chooser
}
const sheet = (page) => page.locator("[data-access-sheet]")
const sheetTitle = (page) => page.locator("#access-sheet-title").first().textContent()

console.log("\niPhone, camera refused")
{
  const { page, context } = await open(`window.__platform = "ios"; window.__cam = "denied"; window.__push = "granted"`)
  check("a photo input is held: the sheet, not the picker", !(await opensPicker(page, () => page.click("#photo"))) && (await sheet(page).count()) === 1)
  check("  it says the camera is off", (await sheetTitle(page)) === "Camera is off for Storelib")
  check("  and where to turn it on", /Settings, Storelib, Camera/.test(await page.locator("[data-access-sheet] p").textContent()))
  await page.screenshot({ path: join(out, "camera-off-iphone.png") })
  check("Choose from library opens the picker from that tap", await opensPicker(page, () => page.click("[data-access-secondary]")))
  await page.waitForTimeout(300)
  check("  and the sheet is gone", (await sheet(page).count()) === 0)
  check("the next photo goes straight to the picker (now and then, not every time)", (await opensPicker(page, () => page.click("#photo"))) && (await sheet(page).count()) === 0)
  check("a label for a photo input is held the same way, once the days have passed", await (async () => {
    await page.evaluate(() => localStorage.setItem("storelib_camera_off_held", String(Date.now() - 4 * 24 * 3600 * 1000)))
    const opened = await opensPicker(page, () => page.click("#photo-label"))
    return !opened && (await sheet(page).count()) === 1
  })())
  await page.click("[data-access-later]")
  await page.waitForTimeout(300)
  check("a product's files are never held", (await opensPicker(page, () => page.click("#pdf"))) && (await sheet(page).count()) === 0)
  check("an input that only takes a photo is held every time", !(await opensPicker(page, () => page.click("#cam"))) && (await sheet(page).count()) === 1)
  check("  Choose from library drops the camera for that pick and opens the picker", await opensPicker(page, () => page.click("[data-access-secondary]")))
  await page.waitForTimeout(50)
  check("  and the input asks for the camera again afterwards", (await page.getAttribute("#cam", "capture")) === "environment", await page.getAttribute("#cam", "capture"))
  await page.waitForTimeout(300)
  await page.evaluate(() => { location.href = "about:blank#unused" }).catch(() => {})
  await context.close()
}

console.log("\niPhone, the native picker (profile photo) with the camera refused")
{
  const { page, context } = await open(`window.__platform = "ios"; window.__cam = "denied"; window.__push = "granted"`)
  await page.click("#pick-camera")
  await page.waitForTimeout(300)
  check("the sheet instead of an alert", (await sheet(page).count()) === 1 && (await sheetTitle(page)) === "Camera is off for Storelib")
  const alerts = []
  page.on("dialog", (d) => { alerts.push(d.message()); void d.dismiss() })
  await page.evaluate(() => { window.__picked = undefined; void window.__pickPhoto("CAMERA") })
  await page.waitForTimeout(300)
  check("a second ask while the sheet is open is not lost: it says so and settles", alerts.length === 1 && /Camera is off for Storelib/.test(alerts[0]) && (await page.evaluate(() => window.__picked)) === "none", alerts)
  check("Choose from library opens the system picker, no permission needed", await opensPicker(page, () => page.click("[data-access-secondary]")))
  await context.close()
}

console.log("\nAndroid")
{
  const { page, context } = await open(`window.__platform = "android"; window.__cam = "denied"; window.__push = "granted"; window.StorelibNative = { openAppSettings() { window.__settings = (window.__settings || 0) + 1 } }`)
  check("a photo input with the library only is not held (Android offers no camera there)", (await opensPicker(page, () => page.click("#photo"))) && (await sheet(page).count()) === 0)
  check("an input that takes a photo is held", !(await opensPicker(page, () => page.click("#cam"))) && (await sheet(page).count()) === 1)
  check("  in Android's words", /Settings, Apps, Storelib, Permissions, Camera/.test(await page.locator("[data-access-sheet] p").textContent()))
  await page.click("[data-access-primary]")
  check("Open Settings opens Storelib's App info", (await page.evaluate(() => window.__settings)) === 1)
  await context.close()
}

console.log("\nCamera allowed, or not asked yet")
for (const cam of ["granted", "prompt"]) {
  const { page, context } = await open(`window.__platform = "ios"; window.__cam = "${cam}"; window.__push = "granted"`)
  check(`${cam}: every input goes straight to the picker (the phone asks for itself)`, (await opensPicker(page, () => page.click("#photo"))) && (await opensPicker(page, () => page.click("#cam"))) && (await sheet(page).count()) === 0)
  await context.close()
}

console.log("\nNotifications")
{
  const { page, context } = await open(`window.__platform = "ios"; window.__cam = "granted"; window.__push = "prompt"`)
  await page.waitForTimeout(1500)
  check("first launch, not asked yet: the phone's own prompt", (await page.evaluate(() => window.__pushAsked)) === 1)
  check("  a yes turns the account's switch on", (await page.evaluate(() => window.__patched)) === 1, await page.evaluate(() => ({ patched: window.__patched, registered: window.__registered })))
  await page.evaluate(() => window.__nudge("posted"))
  await page.waitForTimeout(1300)
  check("  once allowed, a moment asks nothing", (await page.evaluate(() => window.__pushAsked)) === 1 && (await page.locator("[data-push-ask]").count()) === 0)
  await context.close()
}
{
  const { page, context } = await open(`window.__platform = "ios"; window.__cam = "granted"; window.__push = "denied"; localStorage.setItem("storelib_push_ask", JSON.stringify({ at: ${NOW} - 60000, count: 1 }))`)
  await page.waitForTimeout(1500)
  check("refused and reminded a minute ago: nothing at launch", (await page.locator("[data-push-ask]").count()) === 0)
  await page.evaluate(() => window.__nudge("joined"))
  await page.waitForTimeout(1300)
  check("  nor at a moment: one budget for both", (await page.locator("[data-push-ask]").count()) === 0)
  await context.close()
}
{
  const { page, context } = await open(`window.__platform = "android"; window.__cam = "granted"; window.__push = "denied"; window.StorelibNative = { openAppSettings() { window.__settings = (window.__settings || 0) + 1 } }; localStorage.setItem("storelib_push_ask", JSON.stringify({ at: ${NOW} - 5 * 24 * 3600 * 1000, count: 1 })); addEventListener("load", () => setTimeout(() => window.__nudge("posted"), 50))`)
  /* Posted just after the page is up, so its turn comes before the launch reminder's at 1.2s; whichever comes first is the only sheet. */
  await page.waitForTimeout(1600)
  check("refused, days later, just posted: the sheet in that moment's words", (await page.locator("[data-push-ask]").count()) === 1 && (await sheetTitle(page)) === "Know when someone replies")
  check("  only one sheet, the launch reminder does not stack on it", (await page.locator('[role="dialog"]').count()) === 1)
  await page.screenshot({ path: join(out, "push-nudge-android.png") })
  await page.click("[data-push-ask-allow]")
  check("Open Settings opens the phone's settings", (await page.evaluate(() => window.__settings)) === 1)
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    window.__push = "granted"
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
    document.dispatchEvent(new Event("visibilitychange"))
  })
  await page.waitForTimeout(400)
  check("back with them on: the phone is registered and the account switched on", (await page.evaluate(() => window.__registered)) === 1 && (await page.evaluate(() => window.__patched)) === 1, await page.evaluate(() => ({ patched: window.__patched, registered: window.__registered })))
  await page.evaluate(() => window.__nudge("commented"))
  await page.waitForTimeout(1300)
  check("a later moment, inside the budget: nothing", (await page.locator("[data-push-ask]").count()) === 0)
  await context.close()
}

await browser.close()
console.log(`\nPictures: ${join(out, "camera-off-iphone.png")} and ${join(out, "push-nudge-android.png")}`)
console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
