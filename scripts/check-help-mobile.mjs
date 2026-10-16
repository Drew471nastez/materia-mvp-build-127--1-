/**
 * ===========================================================================
 *  THE HELP CENTER ON A PHONE, AND THE WAY IN FROM THE ACCOUNT MENU
 * ===========================================================================
 * "The account dropdown must also contain Help, opening the Help Center as
 * its own page. And make the Help Center pages well optimised for phones and
 * the iOS and Android apps."
 *
 * scripts/render-help-mobile.tsx draws the real /app shell (AppSidebar, its
 * desktop dropdown and its phone sheet) and the real Help Center pages under
 * the real Storelib header. This measures, in the real stylesheet:
 *
 *   THE MENU     at 390 (touch) the account sheet and at 1280 the account
 *                dropdown each have Help, after Language and before the line
 *                above Sign out, linking to /help in the same tab; the
 *                sheet's row is 44px tall, and choosing it closes the menu
 *
 *   EACH PAGE    the index, a topic, an article with screenshots, an article
 *                with tables, the search results and Order problems, at 360
 *                and 390 in a browser, at 390 as the iOS app draws it (its
 *                status bar inset under the fixed header) and at 844x390 as
 *                Safari draws it on its side (the notch's insets at both
 *                sides; the app itself is portrait only, globals.css covers
 *                it in black on its side):
 *                  nothing past either edge of the window
 *                  every link, button and field 44px or more each way, but
 *                    for links inside a sentence (WCAG 2.5.8's own exception)
 *                  no text under 12px, an article's text 16px or more
 *                  every picture inside its column, at its own proportions,
 *                    never drawn wider than its file, with its size declared
 *                  on its side, no text under the notch at either side
 *
 *   CLEARING THE HEADER   a heading reached from On this page starts below
 *                the Storelib bar, and the row of topics on Order problems
 *                sticks under it rather than behind it, in a browser and in
 *                the app (where the bar is fixed and taller by the inset)
 *
 *   THE WAY BACK the band's Go to your dashboard is 44px tall, links to
 *                /app, and when the page behind is one of /app's it goes
 *                back to it rather than pushing a new one
 *
 *   node scripts/check-help-mobile.mjs
 *   SHOTS=<dir>   screenshots of every page and the two menus
 *   PAGES=questions,index   only these pages
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS || null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const TAP = 44

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* ── Bundle ─────────────────────────────────────────────────────────────── */

const dir = join(root, ".help-mobile-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `const nav = () => (globalThis.__nav = globalThis.__nav || [])
const router = { push(h) { nav().push(String(h)) }, replace(h) { nav().push(String(h)) }, prefetch() {}, refresh() {}, back() { history.back() }, forward() {} }
export const usePathname = () => window.__path || "/app"
export const useSearchParams = () => new URLSearchParams()
export const useRouter = () => router
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const useSelectedLayoutSegments = () => []
export function redirect() {}
export function permanentRedirect() {}
export function notFound() { throw new Error("notFound") }
`)
/* A Link that runs its onClick and then stays on the page, noting where it would have gone. */
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) {
  const to = typeof href === "string" ? href : "#"
  return React.createElement("a", { href: to, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (globalThis.__nav = globalThis.__nav || []).push(to) } } }, children)
})
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
const auth = { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), setSession: async () => ({ data: {}, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }
export function createClient() { return { auth, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
writeFileSync(join(dir, "physical.js"), `export async function isPhysicalCommerceEnabled() { return true }
export const PHYSICAL_COMMERCE_KEY = "physical_commerce_enabled"
export const PHYSICAL_COMMERCE_CACHE_TAG = "physical-commerce-enabled"
`)
writeFileSync(join(dir, "empty.js"), "export {}\n")
/* The render file reaches the in-app history through this, so the probe can say "the page behind is /app/products". */
writeFileSync(join(dir, "entry.tsx"), `import { noteClientNavigation } from "@/lib/navigation/in-app-history"
;(window as unknown as { __noteNav: typeof noteClientNavigation }).__noteNav = noteClientNavigation
import "../scripts/render-help-mobile"
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(dir, "entry.tsx"), "--bundle", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "client.js")}`,
    '--define:process.env.NODE_ENV="production"', "--format=iife", "--platform=browser",
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://placeholder.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"placeholder"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`, `--alias:@/lib/platform/physical-commerce=${join(dir, "physical.js")}`,
    `--alias:server-only=${join(dir, "empty.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail("scripts/render-help-mobile.tsx did not bundle. The error above is esbuild's.")
}
const clientJs = readFileSync(join(dir, "client.js"))
rmSync(dir, { recursive: true, force: true })

/*
  THE APP'S INSETS, IN THE STYLESHEET. A headless browser has no notch: every
  env(safe-area-inset-*) reads its fallback. The app's page is sent the same
  stylesheet with each one answered as an iPhone 15 answers it (59px under
  the status bar and 34px over the home indicator upright; 59px at each side
  and 21px at the foot on its side). The app's page also has html.capacitor,
  which is what makes the Storelib bar fixed and as tall as 65px plus the
  inset; Safari on its side, with viewport-fit=cover, has the side insets
  and no html.capacitor.
*/
const css = `${await appCss(root)}\n${interFaces(root).replace(/url\(file:\/\//g, "url(/__font?p=")}`
const INSETS = {
  portrait: { top: 59, bottom: 34, left: 0, right: 0 },
  landscape: { top: 0, bottom: 21, left: 59, right: 59 },
}
const withInsets = (i) => css.replace(/env\(\s*safe-area-inset-(top|bottom|left|right)\s*(?:,[^()]*(?:\([^()]*\))?[^()]*)?\)/g, (_, side) => `${i[side]}px`)
const sheets = { web: css, portrait: withInsets(INSETS.portrait), landscape: withInsets(INSETS.landscape) }

const pathFor = (which) => {
  const [kind, a, b] = which.split("/")
  if (kind === "category") return `/help/${a}`
  if (kind === "article") return `/help/${a}/${b}`
  if (kind === "search") return "/help/search"
  if (kind === "questions") return "/help/questions"
  return "/help"
}
const htmlFor = (sheet, app) => `<!doctype html><html lang="en" class="light${app ? " capacitor" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/app.css?sheet=${sheet}"><script>window.__path = location.pathname === "/shell" ? "/app" : (${pathFor.toString()})(location.hash.slice(1) || "index")</script></head>
<body class="font-sans antialiased"><div id="app"></div><script src="/client.js"></script></body></html>`

const TYPES = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" }
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://probe")
  const send = (status, type, body) => { res.writeHead(status, { "content-type": type, "cache-control": "no-store" }); res.end(body) }
  if (u.pathname.startsWith("/__font")) {
    const file = decodeURIComponent(u.searchParams.get("p") || "")
    if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(file) || !existsSync(file)) return send(404, "text/plain", "")
    return send(200, "font/woff2", readFileSync(file))
  }
  if (u.pathname === "/app.css") return send(200, "text/css", sheets[u.searchParams.get("sheet")] ?? css)
  if (u.pathname === "/client.js") return send(200, "text/javascript", clientJs)
  if (u.pathname.startsWith("/api/")) return send(200, "application/json", "{}")
  if (u.pathname === "/shell" || u.pathname === "/help") {
    const sheet = u.searchParams.get("sheet") || "web"
    return send(200, "text/html", htmlFor(sheet, u.searchParams.get("app") === "1"))
  }
  /* public/: the screenshots the articles show. */
  const file = normalize(join(root, "public", decodeURIComponent(u.pathname)))
  if (file.startsWith(join(root, "public")) && existsSync(file) && TYPES[extname(file)]) return send(200, TYPES[extname(file)], readFileSync(file))
  send(404, "text/plain", "")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const open = async ({ path, width, height, touch, hash = "" }) => {
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.log(`  page error: ${String(e.message || e).slice(0, 200)}`))
  await page.setViewport({ width, height, isMobile: !!touch, hasTouch: !!touch, deviceScaleFactor: 2 })
  await page.goto(`${base}${path}${hash ? `#${hash}` : ""}`, { waitUntil: "load" })
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 })
  await page.waitForFunction(() => document.querySelector("main h1, #account-trigger, [data-shell-chrome]"), { timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 300))
  return page
}

try {
  /* ── The menu ─────────────────────────────────────────────────────────── */
  console.log("\nThe account sheet, 390x844, touch")
  {
    const page = await open({ path: "/shell", width: 390, height: 844, touch: true })
    await page.tap("#account-trigger")
    await new Promise((r) => setTimeout(r, 700))
    const m = await page.evaluate(() => {
      const help = [...document.querySelectorAll('a[data-account-item="help"]')].find((a) => a.getBoundingClientRect().height > 0 && getComputedStyle(a).visibility !== "hidden" && a.closest('[role="dialog"]'))
      if (!help) return null
      const sheet = help.closest('[role="dialog"]')
      const rows = [...sheet.querySelectorAll("a, button")].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.textContent.trim())
      const r = help.getBoundingClientRect()
      return { href: help.getAttribute("href"), target: help.getAttribute("target"), text: help.textContent.trim(), h: Math.round(r.height), icon: !!help.querySelector("svg"), rows, inView: r.bottom <= innerHeight && r.top >= 0 }
    })
    expect(!!m, "the open sheet has a Help row", m?.rows)
    if (m) {
      expect(m.href === "/help" && !m.target, "it links to /help, in the same tab", { href: m.href, target: m.target })
      expect(m.text === "Help" && m.icon, "it reads Help, with an icon like its neighbours", m.text)
      expect(m.h >= TAP, `it is ${TAP}px tall or more`, m.h)
      expect(m.inView, "it is on screen without scrolling the sheet")
      const at = (w) => m.rows.findIndex((t) => t === w)
      expect(at("Language") >= 0 && at("Help") === at("Language") + 1 && at("Logout") > at("Help"), "the order: Language, Help, then Logout", m.rows)
    }
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "sheet-390.png") })
    if (m) {
      await page.tap('[role="dialog"] a[data-account-item="help"]')
      await new Promise((r) => setTimeout(r, 700))
      const after = await page.evaluate(() => ({ went: globalThis.__nav || [], open: !!document.querySelector("#account-trigger[data-open]") }))
      expect(after.went.includes("/help") && !after.open, "a tap goes to /help and puts the sheet away", after)
    }
    await page.close()
  }

  console.log("\nThe account dropdown, 1280x800, mouse")
  {
    const page = await open({ path: "/shell", width: 1280, height: 800 })
    await page.click("header[data-shell-chrome] .group\\/acct")
    await new Promise((r) => setTimeout(r, 400))
    const m = await page.evaluate(() => {
      const help = [...document.querySelectorAll('header[data-shell-chrome] a[data-account-item="help"]')][0]
      if (!help) return null
      const menu = help.parentElement
      const rows = [...menu.children].map((e) => (e.matches("a, button") ? e.textContent.trim() : e.className.includes("h-px") ? "—" : e.textContent.trim().slice(0, 20)))
      const r = help.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { href: help.getAttribute("href"), target: help.getAttribute("target"), text: help.textContent.trim(), icon: help.querySelector("svg")?.getAttribute("class"), rows, hittable: help.contains(hit), h: Math.round(r.height) }
    })
    expect(!!m, "the open dropdown has a Help row", m?.rows)
    if (m) {
      expect(m.href === "/help" && !m.target, "it links to /help, in the same tab, like Library", { href: m.href, target: m.target })
      expect(m.hittable, "it is the thing under the pointer at its middle")
      const at = (w) => m.rows.findIndex((t) => t === w)
      expect(at("Help") === at("Language") + 1 && m.rows[at("Help") + 1] === "—" && at("Sign Out") > at("Help"), "the order: Language, Help, the line, Sign Out", m.rows)
    }
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "dropdown-1280.png") })
    if (m) {
      await page.click('header[data-shell-chrome] a[data-account-item="help"]')
      await new Promise((r) => setTimeout(r, 400))
      const after = await page.evaluate(() => ({ went: globalThis.__nav || [], shut: getComputedStyle(document.querySelector('header[data-shell-chrome] a[data-account-item="help"]').closest(".absolute")).pointerEvents === "none" }))
      expect(after.went.includes("/help") && after.shut, "a click goes to /help and closes the dropdown", after)
    }
    await page.close()
  }

  /* ── The pages ────────────────────────────────────────────────────────── */
  const PAGES = (process.env.PAGES || "index,category/physical-products,article/physical-products/zero-to-100,article/physical-products/create-a-physical-product,article/account-and-billing/plans,search/refund,questions").split(",")
  const SCENES = [
    { name: "browser 360", width: 360, height: 780, sheet: "web" },
    { name: "browser 390", width: 390, height: 844, sheet: "web" },
    { name: "iOS app 390", width: 390, height: 844, sheet: "portrait", app: true, insets: INSETS.portrait },
    { name: "Safari on its side 844x390", width: 844, height: 390, sheet: "landscape", insets: INSETS.landscape },
  ]

  const MEASURE = `(async (insets) => {
    const main = document.querySelector("main")
    const W = document.documentElement.clientWidth
    const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && !e.closest(".sr-only, [aria-hidden=true], details:not([open]) > :not(summary)") }
    /* Pictures are lazy: bring each into view so it loads, then come back. */
    for (const img of main.querySelectorAll("img")) { img.loading = "eager" }
    await Promise.all([...main.querySelectorAll("img")].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000) })))
    const clipped = (e) => { for (let p = e.parentElement; p && p !== main; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true } return false }
    const past = [...main.querySelectorAll("*")].filter((e) => visible(e) && !clipped(e)).map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.right > W + 0.5 || r.left < -0.5)
    const name = (e) => (e.getAttribute("data-help-topic") || e.getAttribute("aria-label") || e.textContent || e.tagName).trim().replace(/\\s+/g, " ").slice(0, 48)
    const inSentence = (a) => { if (getComputedStyle(a).display !== "inline") return false; const host = a.parentElement.closest("p, li, dd, td, figcaption, span"); return !!host && host.textContent.trim().length > a.textContent.trim().length + 2 }
    const targets = [...main.querySelectorAll("a[href], button, summary, input:not([type=hidden]), select, [role=button]")].filter((e) => visible(e) && !(e.tagName === "A" && inSentence(e)))
    const small = targets.map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.height < ${TAP} - 0.5 || r.width < ${TAP} - 0.5).map(({ e, r }) => \`\${name(e)} \${Math.round(r.width)}x\${Math.round(r.height)}\`)
    const texts = [...main.querySelectorAll("p, span, a, li, h1, h2, h3, dt, dd, td, th, figcaption, label, button, time")].filter((e) => visible(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    const sizes = texts.map((e) => parseFloat(getComputedStyle(e).fontSize))
    const tiny = texts.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => \`\${name(e)} \${getComputedStyle(e).fontSize}\`)
    const bodyP = document.querySelector("[data-help-body] > p:not([data-help-note])")
    const images = [...main.querySelectorAll("img")].filter(visible).map((i) => {
      const r = i.getBoundingClientRect()
      const col = (i.closest("figure, [data-help-image], li, article") || main).getBoundingClientRect()
      const aw = +i.getAttribute("width"), ah = +i.getAttribute("height")
      const src = i.currentSrc || i.src
      const natural = i.naturalWidth && i.naturalHeight ? i.naturalWidth / i.naturalHeight : aw / ah
      return { src: src.replace(location.origin, ""), w: Math.round(r.width), h: Math.round(r.height), declared: !!aw && !!ah, inside: r.left >= col.left - 0.5 && r.right <= col.right + 0.5 && r.right <= W + 0.5, ratioOff: Math.abs(r.width / r.height - natural) / natural, upscaled: i.naturalWidth ? r.width > i.naturalWidth + 0.5 : false }
    })
    /* What is on the glass: a chip scrolled out of its row is clipped by the row, so the row's own edges are what count. */
    const shown = (e) => { let r = e.getBoundingClientRect(); let left = r.left, right = r.right; for (let p = e.parentElement; p && p !== main; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { const c = p.getBoundingClientRect(); left = Math.max(left, c.left); right = Math.min(right, c.right) } } return { left, right } }
    const underNotch = insets && (insets.left || insets.right) ? texts.filter((e) => { const r = shown(e); return r.right > r.left && (r.left < insets.left - 0.5 || r.right > W - insets.right + 0.5) }).map(name).slice(0, 5) : []
    const dash = document.querySelector("[data-help-dashboard]")
    const dr = dash?.getBoundingClientRect()
    return {
      docOverflow: document.documentElement.scrollWidth - W,
      past: past.slice(0, 6).map(({ e, r }) => \`\${name(e)} \${Math.round(r.left)}..\${Math.round(r.right)}\`),
      targets: targets.length, small: small.slice(0, 12), smallCount: small.length,
      minText: Math.min(...sizes), tiny: tiny.slice(0, 6), body: bodyP ? parseFloat(getComputedStyle(bodyP).fontSize) : null,
      images, underNotch,
      dashboard: dash ? { href: dash.getAttribute("href"), h: Math.round(dr.height), w: Math.round(dr.width), inside: dr.right <= W - (insets ? insets.right : 0) + 0.5 } : null,
    }
  })`

  for (const scene of SCENES) {
    console.log(`\n${scene.name}`)
    for (const which of PAGES) {
      const page = await open({ path: `/help?sheet=${scene.sheet}${scene.app ? "&app=1" : ""}`, width: scene.width, height: scene.height, touch: true, hash: which })
      const m = await page.evaluate(`${MEASURE}(${JSON.stringify(scene.insets ?? null)})`)
      const tag = `${which}:`
      expect(m.docOverflow <= 0 && m.past.length === 0, `${tag} nothing past the window's edges`, m.past.length ? m.past : m.docOverflow > 0 ? m.docOverflow : undefined)
      expect(m.smallCount === 0, `${tag} all ${m.targets} links, buttons and fields ${TAP}px or more`, m.smallCount ? m.small : undefined)
      expect(m.minText >= 12 && (m.body === null || m.body >= 16), `${tag} no text under 12px${m.body ? `, the article at ${m.body}px` : ""}`, m.tiny.length ? m.tiny : m.minText)
      if (m.images.length) {
        const bad = m.images.filter((i) => !i.declared || !i.inside || i.ratioOff > 0.02 || i.upscaled)
        expect(bad.length === 0, `${tag} ${m.images.length} pictures inside their column, at their own proportions, not upscaled, size declared`, bad.length ? bad.slice(0, 4) : undefined)
      }
      if (scene.insets?.left) expect(m.underNotch.length === 0, `${tag} no text under the notch at either side`, m.underNotch.length ? m.underNotch : undefined)
      expect(!!m.dashboard && m.dashboard.href === "/app" && m.dashboard.h >= TAP && m.dashboard.w >= TAP && m.dashboard.inside, `${tag} Go to your dashboard links to /app, ${TAP}px tall, on screen`, m.dashboard)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${scene.name.replace(/\W+/g, "-")}-${which.replace(/\//g, "_")}.png`), fullPage: true })

      /* Clearing the Storelib bar. */
      if (which === "article/physical-products/zero-to-100" && scene.width < 768) {
        await page.evaluate(() => { document.querySelector("[data-help-toc-inline]").open = true })
        const link = await page.evaluate(() => { const links = [...document.querySelectorAll("[data-help-toc-inline] a")]; const a = links[Math.min(3, links.length - 1)]; return a.getAttribute("href") })
        await page.evaluate((href) => { document.querySelector(`[data-help-toc-inline] a[href="${href}"]`).click() }, link)
        await new Promise((r) => setTimeout(r, 400))
        const c = await page.evaluate((href) => {
          const bar = document.getElementById("platform-header-root").getBoundingClientRect()
          const h = document.getElementById(decodeURIComponent(href.slice(1))).getBoundingClientRect()
          return { bar: Math.round(bar.bottom), heading: Math.round(h.top), shared: getComputedStyle(document.documentElement).getPropertyValue("--buyer-header-h") }
        }, link)
        expect(c.heading >= c.bar && c.heading <= c.bar + 40, `${tag} a heading reached from On this page starts under the bar, not behind it`, c)
      }
      if (which === "questions" && scene.width < 1024) {
        /* Half way down the questions, where the row should be stuck. */
        await page.evaluate(() => { const g = document.querySelector("[data-questions]").getBoundingClientRect(); window.scrollTo(0, scrollY + g.top + g.height / 2 - innerHeight / 2) })
        await new Promise((r) => setTimeout(r, 300))
        const c = await page.evaluate(() => {
          const bar = document.getElementById("platform-header-root").getBoundingClientRect()
          const pills = document.querySelector('[data-questions] nav[aria-label="Topics"]')
          const r = pills.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + 24, r.top + r.height / 2)
          return { bar: Math.round(bar.bottom), pillsTop: Math.round(r.top), seen: pills.contains(hit) }
        })
        expect(c.seen && Math.abs(c.pillsTop - c.bar) <= 1, `${tag} scrolled, the row of topics sticks under the bar and can be pressed`, c)
        const goTo = await page.evaluate(async () => {
          const pill = [...document.querySelectorAll("[data-pill]")][2]
          pill.click()
          await new Promise((r) => setTimeout(r, 1500))
          const pills = document.querySelector('[data-questions] nav[aria-label="Topics"]').getBoundingClientRect()
          const h = document.getElementById(`h-${pill.getAttribute("data-pill")}`).getBoundingClientRect()
          return { pillsBottom: Math.round(pills.bottom), heading: Math.round(h.top) }
        })
        expect(goTo.heading >= goTo.pillsBottom && goTo.heading <= goTo.pillsBottom + 40, `${tag} a topic chosen from the row starts just under the row, not behind it`, goTo)
      }
      await page.close()
    }
  }

  /* ── The way back ─────────────────────────────────────────────────────── */
  console.log("\nThe way back to /app")
  {
    const page = await open({ path: "/help?sheet=web", width: 390, height: 844, touch: true, hash: "index" })
    const press = () => page.evaluate(() => {
      let backs = 0
      const realBack = history.back.bind(history)
      history.back = () => { backs++ }
      let prevented = null
      const watch = (e) => { prevented = e.defaultPrevented; e.preventDefault() }
      window.addEventListener("click", watch)
      document.querySelector("[data-help-dashboard]").click()
      window.removeEventListener("click", watch)
      history.back = realBack
      return { prevented, backs }
    })
    if (!(await page.$("[data-help-dashboard]"))) { expect(false, "the band has Go to your dashboard"); await page.close() } else {
    const cold = await press()
    expect(cold.prevented === false && cold.backs === 0, "opened cold (a link, a search): it is a plain link to /app", cold)
    await page.evaluate(() => { window.__noteNav("/app/products") })
    await new Promise((r) => setTimeout(r, 1000))
    const fromApp = await press()
    expect(fromApp.prevented === true && fromApp.backs === 1, "opened from /app/products: it goes back to it instead of pushing /app again", fromApp)
    await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} failed` : "\nall held")
process.exit(broken ? 1 : 0)
