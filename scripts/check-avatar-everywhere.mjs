/**
 * ===========================================================================
 *  ONE PROFILE PHOTO, EVERYWHERE, IN A BROWSER
 * ===========================================================================
 * "When I click to delete the profile photo, it shows the initials there,
 * but then it shows the image I created my account with (Google) in the
 * black top bar."
 *
 * The /app shell as the layout mounts it (the black header, the sidebar,
 * the account menu and the phone's account sheet, each headed by the
 * businesses of the login) with the real Settings page in it
 * (scripts/render-avatar-everywhere.tsx), drawn from one answer this probe's
 * server holds, as the server components are. It starts as a Google sign up
 * does: the Google picture in the profile. Then, at 1280 and at 390:
 *
 *   remove    Settings, the header, the account menu (its row for the
 *             business you are in) or the phone's account sheet, and a
 *             second tab of the same browser show the initials, and on no
 *             frame from the press to a second after the server's answer
 *             has arrived does the header show the Google picture again
 *   upload    a new photo (a file chosen in Settings): the same show it
 *   reload    and still show it
 *   snapshot  the public site's header opens on the right photo (the
 *             session snapshot in this browser is corrected)
 *
 *   node scripts/check-avatar-everywhere.mjs     (SHOTS_DIR=... keeps the pictures)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const scratch = mkdtempSync(join(tmpdir(), "storelib-avatar-everywhere-"))
const shots = process.env.SHOTS_DIR || join(scratch, "shots")
mkdirSync(shots, { recursive: true })

const dir = join(root, ".avatar-everywhere-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() { window.__refresh && window.__refresh() }, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
const bucket = {
  upload: async (path, blob) => { const r = await fetch("/__upload?path=" + encodeURIComponent(path), { method: "POST", body: blob }); return { data: r.ok ? { path } : null, error: r.ok ? null : { message: "upload" } } },
  getPublicUrl: (path) => ({ data: { publicUrl: "/storage/v1/object/public/avatars/" + path } }),
}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "user-1", user_metadata: {} } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, rpc: () => q, storage: { from: () => bucket }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-avatar-everywhere.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = `${await appCss(root)}\n${interFaces(root).replace(/url\(file:\/\//g, "url(/__font?p=")}`
const script = readFileSync(join(dir, "probe.js"), "utf8")
rmSync(dir, { recursive: true, force: true })
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script><script>${script}</script></body></html>`

/* Two pictures: the one "Google sent" (warm), and the one the person uploads (cool). */
const GOOGLE = "/google/photo.png"
const pngOf = async (browser, color) => {
  const p = await browser.newPage()
  const data = await p.evaluate((c) => { const k = document.createElement("canvas"); k.width = k.height = 256; const g = k.getContext("2d"); g.fillStyle = c; g.fillRect(0, 0, 256, 256); g.fillStyle = "#fff"; g.beginPath(); g.arc(128, 110, 50, 0, 7); g.fill(); return k.toDataURL("image/png") }, color)
  await p.close()
  return Buffer.from(data.split(",")[1], "base64")
}

const state = { avatar: GOOGLE }
const files = new Map()
const posted = []
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.pathname.startsWith("/__font")) {
    const file = decodeURIComponent(u.searchParams.get("p") || "")
    if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(file) || !existsSync(file)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": "font/woff2" }); res.end(readFileSync(file)); return
  }
  /* The server's own answer (the layout drawn again after router.refresh) takes a while, as it does in the app: the time in which a copy that is not the shell's shows the old photo. */
  if (u.pathname === "/state") { const now = JSON.stringify(state); setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(now) }, 400); return }
  if (u.pathname === "/__upload") {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => { files.set("/storage/v1/object/public/avatars/" + u.searchParams.get("path"), Buffer.concat(chunks)); res.writeHead(200); res.end("{}") })
    return
  }
  /* The image optimizer, and the files it points at. */
  const src = u.pathname === "/_next/image" ? u.searchParams.get("url") : u.pathname
  if (src && (src === GOOGLE || files.has(src))) {
    const body = src === GOOGLE ? files.get(GOOGLE) : files.get(src)
    res.writeHead(200, { "content-type": src.endsWith(".png") ? "image/png" : "image/jpeg", "cache-control": "no-store" }); res.end(body); return
  }
  if (u.pathname === "/api/account/avatar") {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString() || "{}")
      posted.push(body.url)
      /* The save takes a moment, as a round trip to the database does. */
      setTimeout(() => { state.avatar = body.url; res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, url: body.url })) }, 250)
    })
    return
  }
  if (u.pathname.startsWith("/api/")) {
    let body = {}
    if (u.pathname.startsWith("/api/billing/subscription")) body = { currentPlan: { id: "pro" } }
    else if (u.pathname.startsWith("/api/domains")) body = { domains: [], schema: "current" }
    else if (u.pathname.startsWith("/api/stripe/connect/status")) body = { connected: true, status: "connected" }
    else if (u.pathname.startsWith("/api/notifications")) body = { notifications: [] }
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); return
  }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"], headless: true })
files.set(GOOGLE, await pngOf(browser, "#c2410c"))
const upload = join(scratch, "new-photo.png")
writeFileSync(upload, await pngOf(browser, "#0e7490"))

/* Every avatar of the signed in person on the page, by where it is. */
const avatars = (p) => p.evaluate(() => {
  const read = (el) => {
    if (!el) return null
    const img = el.querySelector("img")
    return { state: el.getAttribute("data-state"), src: img ? decodeURIComponent(img.getAttribute("src") || "") : null, text: el.textContent.trim() }
  }
  const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
  const header = [...document.querySelectorAll("header [data-app-avatar]")].find(shown)
  const settings = document.querySelector("[data-profile-photo] [data-app-avatar]")
  const sheet = [...document.querySelectorAll("[data-app-sheet] [data-app-avatar]")].find(shown)
  const aside = [...document.querySelectorAll("aside [data-app-avatar]")].find(shown)
  /* The business you are in, at the top of the account menu or sheet (components/app/business-switcher). */
  const business = [...document.querySelectorAll('[data-business-row="current"] [data-app-avatar]')].find(shown)
  return { header: read(header), settings: read(settings), sheet: read(sheet), aside: read(aside), business: read(business) }
})
/** Opens the account menu (the dropdown at 1280, the sheet at 390), reads it, and closes it again. */
const inMenu = async (p, label, shot) => {
  if (label === "390") await p.tap("#account-trigger")
  else await p.evaluate(() => [...document.querySelectorAll("header button")].find((b) => b.querySelector("[data-app-avatar]") && b.getClientRects().length > 0)?.click())
  await wait(700)
  const a = await avatars(p)
  if (shot) await p.screenshot({ path: join(shots, shot) })
  if (label === "390") await p.keyboard.press("Escape")
  else await p.evaluate(() => [...document.querySelectorAll("header button")].find((b) => b.querySelector("[data-app-avatar]") && b.getClientRects().length > 0)?.click())
  await wait(600)
  return a
}
const what = (a) => (!a ? "none" : a.state === "initials" ? "initials" : a.src?.includes("google") ? "google" : a.src?.includes("/avatars/") ? "new" : a.state)

for (const [label, viewport] of [
  ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }],
  ["390", { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
]) {
  console.log(`\n${label}`)
  state.avatar = GOOGLE
  for (const k of [...files.keys()]) if (k !== GOOGLE) files.delete(k)
  const ctx = await browser.createBrowserContext()
  const open = async () => {
    const p = await ctx.newPage()
    await p.setViewport(viewport)
    await p.goto(base, { waitUntil: "load" })
    await p.waitForFunction("window.__ran === true", { timeout: 15000 })
    await p.evaluate(() => document.fonts.ready)
    await wait(600)
    return p
  }
  const page = await open()
  const other = await open()
  /* A tab behind another one paints no frames: the one being driven is in front, the second waits behind it. */
  await page.bringToFront()
  await wait(300)
  /* The public site's header keeps the last session in this browser. */
  await page.evaluate(() => localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "user-1", avatarUrl: "/google/photo.png", displayName: "Mara Lind", username: "maralind", isSeller: true })))

  const start = await avatars(page)
  expect(what(start.header) === "google" && what(start.settings) === "google", "a Google sign up: the header and Settings show the Google picture", { header: what(start.header), settings: what(start.settings) })
  await page.screenshot({ path: join(shots, `avatar-${label}-1-google.png`), clip: { x: 0, y: 0, width: viewport.width, height: Math.min(560, viewport.height) } })

  /* ── Remove ─────────────────────────────────────────────────────────── */
  await page.evaluate(() => {
    window.__seen = []
    const t0 = performance.now()
    const tick = () => {
      const el = [...document.querySelectorAll("header [data-app-avatar]")].find((x) => x.getClientRects().length > 0)
      const img = el?.querySelector("img")
      /* The menu's row for the business you are in is built while closed (the dropdown, the kept sheet): watched too. */
      const business = [...document.querySelectorAll('[data-business-row="current"] [data-app-avatar] img')].some((i) => (i.getAttribute("src") || "").includes("google"))
      window.__seen.push({ t: Math.round(performance.now() - t0), state: el?.getAttribute("data-state"), google: !!img && (img.getAttribute("src") || "").includes("google"), business })
      if (performance.now() - t0 < 1800) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const remove = await page.evaluateHandle(() => [...document.querySelectorAll("[data-profile-photo] button")].find((b) => b.textContent.trim() === "Remove"))
  await remove.asElement().click()
  await wait(1900)
  const seen = await page.evaluate(() => window.__seen)
  const firstInitials = seen.findIndex((f) => f.state === "initials")
  const googleAfter = seen.slice(Math.max(0, firstInitials)).filter((f) => f.google)
  const refreshed = await page.evaluate(() => window.__refreshed ?? 0)
  const gone = await avatars(page)
  expect(posted[posted.length - 1] === null, "Remove saved a removal", posted[posted.length - 1])
  expect(firstInitials >= 0 && seen[firstInitials].t < 600, "the header shows the initials as the save lands", firstInitials >= 0 ? `${seen[firstInitials].t}ms` : "never")
  expect(refreshed > 0 && googleAfter.length === 0, "and on no frame after that, the server's answer included, does it show the Google picture", { refreshed, googleFrames: googleAfter.length })
  const businessAfter = seen.slice(Math.max(0, firstInitials)).filter((f) => f.business)
  expect(firstInitials >= 0 && businessAfter.length === 0, "nor does the account menu's row for the business you are in, while the server's answer is on its way", { frames: businessAfter.length, from: businessAfter[0]?.t, to: businessAfter[businessAfter.length - 1]?.t })
  expect(what(gone.header) === "initials" && what(gone.settings) === "initials" && (label === "390" || what(gone.aside) === "none" || what(gone.aside) === "initials"), "the header and Settings: the initials", { header: what(gone.header), settings: what(gone.settings) })
  const otherTab = await avatars(other)
  expect(what(otherTab.header) === "initials", "a second tab of the same browser: the initials, with no reload", what(otherTab.header))
  const snap = await page.evaluate(() => JSON.parse(localStorage.getItem("_sl_auth_v1") || "null"))
  expect(snap && snap.avatarUrl === null, "the public site's header will open on the initials too", snap?.avatarUrl)
  {
    const menu = await inMenu(page, label, `avatar-${label}-2b-menu-initials.png`)
    expect(what(menu.business) === "initials" && (label !== "390" || what(menu.sheet) === "initials"), `the account ${label === "390" ? "sheet" : "menu"}: the business you are in shows the initials`, { business: what(menu.business), sheet: what(menu.sheet) })
  }
  await page.screenshot({ path: join(shots, `avatar-${label}-2-removed.png`), clip: { x: 0, y: 0, width: viewport.width, height: Math.min(560, viewport.height) } })

  /* ── Upload ─────────────────────────────────────────────────────────── */
  const input = await page.$('[data-profile-photo] input[type="file"]')
  await input.uploadFile(upload)
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll("header [data-app-avatar]")].find((x) => x.getClientRects().length > 0)
    return el?.getAttribute("data-state") === "photo"
  }, { timeout: 8000 }).catch(() => {})
  await wait(900)
  const up = await avatars(page)
  await page.waitForFunction(() => !document.querySelector('[data-photo-preview]'), {timeout:10000})
  expect(await page.$('[data-photo-preview]') === null, "a committed upload releases its temporary preview so later replacements cannot be covered")
  expect(typeof posted[posted.length - 1] === "string" && posted[posted.length - 1].includes("/avatars/user-1/"), "the new photo was uploaded to the person's folder and saved", posted[posted.length - 1])
  expect(what(up.header) === "new" && what(up.settings) === "new", "the header and Settings show the new photo", { header: what(up.header), settings: what(up.settings) })
  const otherUp = await avatars(other)
  expect(what(otherUp.header) === "new", "and so does the second tab", what(otherUp.header))
  const menuUp = await inMenu(page, label)
  expect(what(menuUp.business) === "new", `and the account ${label === "390" ? "sheet" : "menu"}`, what(menuUp.business))
  await page.screenshot({ path: join(shots, `avatar-${label}-3-new.png`), clip: { x: 0, y: 0, width: viewport.width, height: Math.min(560, viewport.height) } })

  /* ── Reload ─────────────────────────────────────────────────────────── */
  await page.reload({ waitUntil: "load" })
  await page.waitForFunction("window.__ran === true", { timeout: 15000 })
  await wait(900)
  const again = await avatars(page)
  expect(what(again.header) === "new" && what(again.settings) === "new", "after a reload, still the new photo, from the server's answer", { header: what(again.header), settings: what(again.settings) })
  const menuAgain = await inMenu(page, label)
  expect(what(menuAgain.business) === "new", `and in the account ${label === "390" ? "sheet" : "menu"}`, what(menuAgain.business))
  const errors = await page.evaluate(() => window.__err)
  expect(errors.length === 0, "nothing threw", errors)
  await ctx.close()
}

await browser.close()
server.close()
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
