/**
 * ===========================================================================
 *  WHICH BUTTONS THE HEADER SHOWS, TO WHOM, ON WHICH PAGE
 * ===========================================================================
 * Renders the real PlatformHeaderClient (scripts/render-header-states.tsx)
 * logged out, signed in without seller access, signed in as a seller, and on
 * a first visit before the session is known, on the homepage and on Explore,
 * at phone, tablet and desktop widths, and checks the owner's rules as
 * numbers:
 *
 *   COMPUTER, LOGGED OUT, HOMEPAGE: a thin rule, Sell on Storelib (text, to
 *   /sell), Log in (outlined, /login), Sign up (filled purple, /signup), in
 *   that order, 8px corners, no pill, no Start selling (image 20).
 *   COMPUTER, LOGGED OUT, EXPLORE: the same without Log in, after the
 *   wishlist and library icons.
 *   SIGNED IN: a buyer sees no Dashboard and no Start selling, only the
 *   icons and the photo; a seller sees Dashboard (/app).
 *   A FIRST VISIT: an invisible stand in exactly the width of the logged out
 *   row, so nothing moves when the answer comes.
 *   PHONE SHEETS: on the homepage Sign up (purple), Discover (outlined, a
 *   compass), Sell on Storelib (purple text) as in image 23; on Explore Sign
 *   up, Log in, Sell on Storelib and no Discover. Signed in, the account
 *   sheet has Become a seller (/sell) for a buyer, Dashboard (/app) for a
 *   seller, beside My Library, Settings and Language.
 *   THE LOGO in the header is 5% under what it was; the hero's button and
 *   search field take the Log in button's corner, under the subheading.
 *   Nothing is wider than the window, from 360px to 1920px.
 *
 * Screenshots go to SHOTS_DIR (or a temp folder, printed at the end).
 *
 *   PROBE_CSS=source node scripts/check-header-states.mjs
 */
import { createServer } from "node:http"
import { extname, resolve } from "node:path"
import { build } from "esbuild"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".header-states-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-header-states-")), "shots")
mkdirSync(shots, { recursive: true })

const STUBS = {
  "next/navigation": `import { useSyncExternalStore } from "react"
const router = { push: (h) => (window.__pushed ||= []).push(h), replace() {}, prefetch() {}, back() {}, refresh() {} }
const sub = (f) => { window.__nav.subs.add(f); return () => window.__nav.subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})`,
  "next/link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })`,
  /* A root-relative picture (the logo) is read from public/, so the screenshots show it. */
  "next/image": `import React from "react"
const PUBLIC = ""
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, className, style, ...rest }) {
  const url = typeof src === "string" ? (src.startsWith("/") ? PUBLIC + src : src) : ""
  return React.createElement("img", { src: url, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
export function getImageProps({ src, alt, width, height }) {
  return { props: { src: typeof src === "string" ? src : "", alt, width, height } }
}`,
  /*
    WHO IS LOOKING, from window.__who. The header asks for the user, then
    the profile, then the creator row; the creator row's onboarding_completed
    is the seller check (see SELLER ACCESS in the header).
  */
  "supabase-client": `const who = () => window.__who
const USER = { id: "u1", email: "ava@example.com", user_metadata: {} }
const rowFor = (table) => {
  if (table === "profiles") return { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: who() === "seller" }
  if (table === "creators") return who() === "seller" ? { id: "c1", slug: "ava", onboarding_completed: true } : null
  return null
}
const chain = (table) => new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (r) => r({ data: rowFor(table), error: null }) : chain(table),
  apply: () => chain(table),
})
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => who() === "unknown" ? new Promise(() => {}) : Promise.resolve({ data: { user: who() === "guest" ? null : USER }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: (table) => chain(table),
    rpc: () => chain(null),
    channel: () => chain(null),
    removeChannel() {},
  }
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k.replace(/\//g, "-")}.jsx`), v)

try {
  await build({
    entryPoints: [join(root, "scripts/render-header-states.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({ path: join(stubs, `${a.path.replace(/\//g, "-")}.jsx`) }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  fail(`The probe did not bundle: ${e.message}`)
}
const js = readFileSync(join(stubs, "app.js"), "utf8")
writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://local').pathname
  const file=path==='/index.html'?join(stubs,'index.html'):resolve(root,'public','.'+decodeURIComponent(path))
  if(file!==join(stubs,'index.html')&&!file.startsWith(join(root,'public')+'/')){res.writeHead(403);return res.end()}
  if(!existsSync(file)){res.writeHead(404);return res.end()}
  res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file))
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const origin=`http://127.0.0.1:${server.address().port}`
process.on('exit',()=>rmSync(stubs,{recursive:true,force:true}))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", ...(process.env.HEADER_ONLY === "marketing" ? ["--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2"] : []), "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] })
const PHONE = (width) => ({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const DESK = (width) => ({ width, height: 900, deviceScaleFactor: 1 })

async function open(vp, path, who) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(`${origin}/index.html#path=${encodeURIComponent(path)}&who=${who}`)
  await p.evaluate(() => document.fonts.ready)
  await sleep(700)
  if (errors.length) fail(`The page threw (${path}, ${who}): ${errors[0]}`)
  return p
}

/* What the bar shows on a computer: its visible links and buttons, left to right. */
const DESK_READ = `(() => {
  const root = document.getElementById("platform-header-root")
  const shown = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !el.closest("[inert]") && !el.closest("[aria-hidden=true]") }
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, border: cs.borderTopWidth + " " + cs.borderTopColor, color: cs.color, weight: cs.fontWeight, size: cs.fontSize, href: el.getAttribute("href"), text: el.textContent.trim(), visible: shown(el) } }
  const q = (s) => root.querySelector(s)
  const row = root.querySelector(".platform-header-row")
  const text = [...root.querySelectorAll("a, button")].filter(shown).map((e) => (e.getAttribute("aria-label") || e.textContent).trim()).filter(Boolean)
  const logo = [...root.querySelectorAll("[data-storelib-logo]")].filter(shown).map((i) => Math.round(i.getBoundingClientRect().width * 100) / 100)
  return {
    text,
    logo,
    guest: box(q("[data-guest-actions]:not([data-placeholder])")),
    placeholder: box(q("[data-guest-actions][data-placeholder]")),
    divider: box(q("[data-guest-actions]:not([data-placeholder]) [data-guest-divider]")),
    sell: box(q("[data-guest-actions]:not([data-placeholder]) [data-guest-sell]")),
    login: box(q("[data-guest-actions]:not([data-placeholder]) [data-guest-login]")),
    signup: box(q("[data-guest-actions]:not([data-placeholder]) [data-guest-signup]")),
    dashboard: box(q("[data-header-dashboard]")),
    avatar: box(q("[data-header-avatar]")),
    avatarTag: q("[data-header-avatar]")?.tagName ?? null,
    wishlist: box([...root.querySelectorAll("a[aria-label]")].find((a) => /wishlist/i.test(a.getAttribute("aria-label")) && shown(a))),
    library: box([...root.querySelectorAll("a[aria-label]")].find((a) => /library/i.test(a.getAttribute("aria-label")) && shown(a))),
    rootH: Math.round(root.getBoundingClientRect().height * 100) / 100,
    overflow: { doc: document.documentElement.scrollWidth - innerWidth, row: row ? row.scrollWidth - row.clientWidth : 0, rightmost: Math.max(0, ...[...root.querySelectorAll("a, button")].filter(shown).map((e) => e.getBoundingClientRect().right)) - innerWidth },
  }
})()`

/* The sheet that is open, top to bottom. */
const SHEET_READ = `(() => {
  const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]")
  if (!panel) return null
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height * 10) / 10, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, border: cs.borderTopWidth + " " + cs.borderTopColor, color: cs.color, weight: cs.fontWeight, size: cs.fontSize, href: el.getAttribute("href"), text: el.textContent.trim(), svg: !!el.querySelector("svg") } }
  const q = (s) => panel.querySelector(s)
  const pill = panel.querySelector("[data-sheet-handle] > div")
  return {
    text: panel.textContent,
    pillBottom: pill ? Math.round(pill.getBoundingClientRect().bottom) : null,
    panelX: Math.round(panel.getBoundingClientRect().left), panelW: Math.round(panel.getBoundingClientRect().width),
    signUp: box(q("[data-menu-sign-up]")), discover: box(q("[data-menu-discover]")), logIn: box(q("[data-menu-log-in]")), sell: box(q("[data-menu-sell]")),
    become: box(q("[data-become-seller]")), dashboard: box(q("[data-sheet-dashboard]")) || box([...panel.querySelectorAll("a")].find((a) => a.textContent.trim() === "Dashboard")),
    account: box(q("[data-account-link]")),
    links: [...panel.querySelectorAll("a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
  }
})()`

const VIOLET_600 = /^(rgb\(127, 34, 254\)|oklch\(0\.541 0\.281 293\.009\)|color\(srgb 0\.4\d+ 0\.1\d+ 0\.99\d+\))$/
const isViolet = (c) => !!c && (VIOLET_600.test(c) || /oklch\(0\.54/.test(c))
const r8 = (b) => b && b.radius === "8px"

/* ------------------------------------------------------------------ */
if(process.env.HEADER_ONLY==='mobile-scroll'){
  const p=await open(PHONE(390),'/','guest')
  await sleep(400)
  const initialHeader=await p.evaluate(()=>({bg:getComputedStyle(document.querySelector('#platform-header-root')).backgroundColor,heroTop:document.querySelector('[data-home-hero]').getBoundingClientRect().top,transition:getComputedStyle(document.querySelector('#platform-header-root')).transitionProperty}))
  expect(initialHeader.bg==='rgba(0, 0, 0, 0)' && Math.abs(initialHeader.heroTop)<1 && initialHeader.transition.includes('background-color'),'transparent header overlays the hero from the first layout',initialHeader)
  await p.evaluate(()=>scrollTo(0,150));await sleep(400)
  expect(await p.$eval('#platform-header-root',e=>getComputedStyle(e).backgroundColor)==='rgb(16, 16, 18)','scrolling fades the homepage header to solid')
  await p.evaluate(()=>scrollTo(0,0));await sleep(400)
  const heroHeight=await p.$eval('[data-home-hero]',e=>e.getBoundingClientRect().height)
  for(const height of [844,650,900]){
    await p.setViewport({width:390,height,isMobile:true,hasTouch:true,deviceScaleFactor:2})
    for(const y of [0,220,440,50,0]){
      await p.evaluate(y=>scrollTo(0,y),y);await sleep(100)
      const r=await p.evaluate(()=>({top:document.querySelector('#platform-header-root').getBoundingClientRect().top,y:scrollY,h:document.querySelector('[data-home-hero]').getBoundingClientRect().height}))
      expect(Math.abs(r.top)<1 && Math.abs(r.y-y)<2 && r.h===heroHeight,'mobile header stays pinned, page scrolls both ways and hero geometry stays fixed',r)
    }
  }
  await p.tap('button[aria-label="Open menu"]');await sleep(500)
  expect(await p.$$eval('[role="dialog"]',els=>els.some(e=>e.getAttribute('aria-hidden')!=='true'&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().height>0)),'real mobile menu opens')
  await p.keyboard.press('Escape');await sleep(650)
  expect(await p.$$eval('[role="dialog"]',els=>els.every(e=>e.getAttribute('aria-hidden')==='true'||!e.getClientRects().length)),'real mobile menu closes')
  await p.evaluate(()=>scrollTo(0,400));await sleep(120);await p.evaluate(()=>scrollTo(0,0));await sleep(120)
  expect(await p.evaluate(()=>scrollY===0 && getComputedStyle(document.body).overflowY!=='hidden'),'upward scrolling remains available after menu close')
  await p.close();await browser.close();await new Promise(r=>server.close(r));rmSync(stubs,{recursive:true,force:true});process.exit(broken?1:0)
}
if(process.env.HEADER_ONLY==='marketing'){
  for(const path of ['/','/pricing']){
    const p=await open(DESK(1440),path,'guest')
    if(path==='/'){
      const top=await p.evaluate(()=>({heroTop:document.querySelector('[data-home-hero]').getBoundingClientRect().top,bg:getComputedStyle(document.querySelector('#platform-header-root')).backgroundColor,sell:!!document.querySelector('a[href="/sell"]'),divider:getComputedStyle(document.querySelector('[data-guest-divider]')).display}))
      expect(Math.abs(top.heroTop)<1 && top.bg==='rgba(0, 0, 0, 0)' && top.sell && top.divider!=='none','desktop header overlays video transparently and keeps Sell on Storelib',top)
      await p.evaluate(()=>scrollTo(0,160));await sleep(400)
      expect(await p.$eval('#platform-header-root',e=>getComputedStyle(e).backgroundColor)==='rgb(16, 16, 18)','desktop header becomes solid after scrolling')
      await p.evaluate(()=>scrollTo(0,0));await sleep(400)
    }
    const selector='[data-marketing-nav] a[href="/blog"]'
    const links=await p.$$eval('[data-marketing-nav] a',els=>els.map(e=>({radius:getComputedStyle(e).borderRadius,bg:getComputedStyle(e).backgroundColor,transition:getComputedStyle(e).transitionProperty})))
    expect(links.length>=4&&links.every(n=>n.radius==='0px'&&n.bg==='rgba(0, 0, 0, 0)'&&n.transition.includes('color')),`${path}: plain marketing links, no pills, color transitions`,links)
    const before=await p.$eval(selector,e=>getComputedStyle(e).color)
    await p.hover(selector);await sleep(250)
    const hover=await p.$eval(selector,e=>({color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,hover:e.matches(":hover"),fine:matchMedia("(pointer:fine)").matches,canHover:matchMedia("(hover:hover)").matches}))
    expect(hover.color!==before&&hover.bg==='rgba(0, 0, 0, 0)',`${path}: hover brightens without adding a background`,hover)
    await p.mouse.move(0,800);await sleep(250)
    expect(await p.$eval(selector,e=>getComputedStyle(e).color)===before,`${path}: hover out restores the original tone`)
    await p.screenshot({path:join(shots,path==='/'?'marketing-home.png':'marketing-pricing.png'),clip:{x:0,y:0,width:1440,height:110}})
    await p.close()
  }
  await browser.close();await new Promise(r=>server.close(r));rmSync(stubs,{recursive:true,force:true});process.exit(broken?1:0)
}
console.log("\ncomputer, 1280")
const measured = {}
for (const path of ["/", "/explore"]) {
  for (const who of ["guest", "buyer", "seller", "unknown"]) {
    const p = await open(DESK(1280), path, who)
    const d = await p.evaluate(DESK_READ)
    measured[`${path}|${who}`] = d
    await p.screenshot({ path: join(shots, `desk-1280-${path === "/" ? "home" : "explore"}-${who}.png`), clip: { x: 0, y: 0, width: 1280, height: path === "/" ? 760 : 140 } })
    const tag = `${path} ${who}:`
    if(path==='/'){
      const nav=await p.$$eval('[data-marketing-nav] a',els=>els.map(e=>({radius:getComputedStyle(e).borderRadius,bg:getComputedStyle(e).backgroundColor,transition:getComputedStyle(e).transitionProperty})))
      expect(nav.length>0&&nav.every(n=>n.radius==='0px'&&n.bg==='rgba(0, 0, 0, 0)'&&n.transition.split(',').map(s=>s.trim()).includes('color')),`${tag} marketing links brighten with a color transition and no pills`,nav)
    }

    expect(!d.text.some((t) => /start selling/i.test(t)), `${tag} no Start selling anywhere in the bar`, d.text)
    expect(d.overflow.doc <= 0 && d.overflow.row <= 0 && d.overflow.rightmost <= 0, `${tag} nothing wider than the window`, d.overflow)
    expect(d.logo.length === 1 && Math.abs(d.logo[0] - 41.8) < 0.05, `${tag} the logo is 41.8px (5% under 44)`, d.logo)
    /* The bar is the height it was, whoever is looking: 69.35px row + 1px, what the SSR placeholder reserves. */
    expect(Math.abs(d.rootH - 70.35) < 0.3, `${tag} the bar is 70.35px tall, as before and in every state`, d.rootH)
    if (path === "/explore") expect(!!d.wishlist?.visible && !!d.library?.visible, `${tag} the wishlist and library icons are still there`)
    if (who === "guest") {
      const withLogin = path === "/"
      expect(!!d.guest && !!d.divider && !!d.sell && !!d.signup, `${tag} rule, Sell on Storelib and Sign up`, d.guest && { sell: d.sell?.text, signup: d.signup?.text })
      expect(withLogin ? !!d.login : !d.login, `${tag} ${withLogin ? "with" : "without"} Log in`, d.login?.text ?? null)
      expect(d.divider && d.divider.w <= 1.01 && d.divider.h >= 20 && d.divider.h <= 28, `${tag} the rule is a thin vertical line`, d.divider && { w: d.divider.w, h: d.divider.h })
      expect(d.sell?.href === "/sell" && d.sell.bg === "rgba(0, 0, 0, 0)" && d.sell.border.startsWith("0px"), `${tag} Sell on Storelib is plain text to /sell`, d.sell && { href: d.sell.href, bg: d.sell.bg })
      expect(d.signup?.href === "/signup" && isViolet(d.signup.bg) && r8(d.signup) && d.signup.text === "Sign up", `${tag} Sign up is filled Storelib purple, 8px corners, to /signup`, d.signup && { bg: d.signup.bg, radius: d.signup.radius, text: d.signup.text })
      if (withLogin) {
        expect(d.login.href === "/login" && r8(d.login) && d.login.bg === "rgba(0, 0, 0, 0)" && /^1px/.test(d.login.border) && d.login.h === d.signup.h, `${tag} Log in is outlined, 8px corners, as tall as Sign up, to /login`, { radius: d.login.radius, border: d.login.border, h: [d.login.h, d.signup.h] })
        expect(d.divider.x < d.sell.x && d.sell.right < d.login.x && d.login.right < d.signup.x, `${tag} in order: rule, Sell on Storelib, Log in, Sign up`, [d.divider.x, d.sell.x, d.login.x, d.signup.x])
        expect(Math.round(d.signup.x - d.login.right) === 12, `${tag} 12px between Log in and Sign up`, Math.round(d.signup.x - d.login.right))
      } else {
        expect(d.library.right < d.divider.x && d.divider.x < d.sell.x && d.sell.right < d.signup.x, `${tag} in order: icons, rule, Sell on Storelib, Sign up`, [d.library.right, d.divider.x, d.sell.x, d.signup.x])
      }
      expect(!d.avatar && !d.dashboard, `${tag} no photo and no Dashboard`)
    }
    if (who === "buyer") {
      expect(!!d.avatar?.visible && !d.dashboard && !d.guest && !d.text.some((t) => /^dashboard$/i.test(t)), `${tag} only the photo after the icons: no Dashboard, no Sign up`, d.text)
      expect(d.text.filter((t) => /^library$/i.test(t)).length === 1, `${tag} one Library (the icon), no second, purple Library button`, d.text)
      expect(d.avatarTag === "A" && d.avatar.href === "/account", `${tag} the photo is a link to /account`, { tag: d.avatarTag, href: d.avatar?.href })
      await p.focus("[data-header-avatar]")
      const focused = await p.evaluate(() => document.activeElement?.hasAttribute("data-header-avatar"))
      expect(focused, `${tag} and a keyboard reaches it`)
    }
    if (who === "seller") {
      expect(d.dashboard?.href === "/app" && d.dashboard.visible && isViolet(d.dashboard.bg) && r8(d.dashboard) && !!d.avatar?.visible, `${tag} Dashboard (/app) beside the photo, 8px corners`, d.dashboard && { href: d.dashboard.href, radius: d.dashboard.radius })
      expect(d.avatarTag === "A" && d.avatar.href === "/account", `${tag} the photo is a link to /account`, d.avatar?.href)
    }
    if (who === "unknown") {
      const g = measured[`${path}|guest`]
      expect(!!d.placeholder && !d.placeholder.visible && !d.guest && !d.avatar, `${tag} before the session is known: an invisible stand in, no buttons to flash`, d.placeholder && { visible: d.placeholder.visible })
      expect(d.placeholder && g.guest && Math.abs(d.placeholder.w - g.guest.w) < 0.2 && Math.abs(d.placeholder.x - g.guest.x) < 0.2, `${tag} the stand in is exactly where and as wide as the logged out row`, d.placeholder && { stand_in: [d.placeholder.x, d.placeholder.w], guest: [g.guest.x, g.guest.w] })
    }
    if (path === "/" && who === "guest") {
      const hero = await p.evaluate(() => {
        const box = document.querySelector(".cinematic-actions")
        /* The owner's remake (round AA1): one button and the marketplace search, under the subheading. */
        const links = [...box.querySelectorAll(".cinematic-desktop-signup, .cinematic-search input")].map((a) => ({ text: (a.textContent || a.placeholder).trim(), radius: getComputedStyle(a).borderTopLeftRadius, top: a.getBoundingClientRect().top }))
        const sub = [...document.querySelectorAll("p")].find((x) => /Everything you need to create/.test(x.textContent))
        return { links, subBottom: sub?.getBoundingClientRect().bottom }
      })
      expect(hero.links.length === 2 && hero.links.every((l) => l.radius === "12px"), "/ hero: signup and search share the requested 12px corner", hero.links.map((l) => `${l.text} ${l.radius}`))
      expect(hero.links.every((l) => l.top >= hero.subBottom), "/ hero: both under the subheading", { controls: hero.links.map((l) => Math.round(l.top)), sub: Math.round(hero.subBottom) })
    }
    await p.close()
  }
}

/* ------------------------------------------------------------------ */
console.log("\ntablet and wide desktop: nothing wider than the window")
for (const width of [768, 1024, 1440, 1920]) {
  for (const path of ["/", "/explore"]) {
    for (const who of ["guest", "seller"]) {
      const p = await open(DESK(width), path, who)
      const d = await p.evaluate(DESK_READ)
      expect(d.overflow.doc <= 0 && d.overflow.row <= 0 && d.overflow.rightmost <= 0, `${width} ${path} ${who}: fits`, d.overflow)
      if (who === "guest") expect(!!d.signup?.visible && !!d.sell?.visible && (path !== "/" || !!d.login?.visible), `${width} ${path} ${who}: Sell on Storelib${path === "/" ? ", Log in" : ""} and Sign up all on screen`)
      if (width === 768 || width === 1920) await p.screenshot({ path: join(shots, `desk-${width}-${path === "/" ? "home" : "explore"}-${who}.png`), clip: { x: 0, y: 0, width, height: 110 } })
      await p.close()
    }
  }
}

/* ------------------------------------------------------------------ */
async function openSheet(p, which) {
  const sel = which === "account" ? 'button[aria-label="Open profile menu"]' : 'button[aria-label="Open menu"], button[aria-label="Open categories"]'
  const b = await p.$(sel)
  if (!b) return null
  await b.tap()
  await sleep(800)
  return p.evaluate(SHEET_READ)
}

console.log("\nphone, 390")
for (const path of ["/", "/explore"]) {
  for (const who of ["guest", "buyer", "seller"]) {
    const tag = `${path} ${who}:`
    const p = await open(PHONE(390), path, who)
    const bar = await p.evaluate(DESK_READ)
    expect(bar.overflow.doc <= 0, `${tag} nothing wider than the window`, bar.overflow.doc)
    const phoneLogo = path === "/" ? 39.9 : 36.1
    /* The smaller logo must not make the bar shorter: 64.6px is what conditional-header's placeholder reserves. */
    expect(Math.abs(bar.rootH - 64.6) < 0.3, `${tag} the bar is still 64.6px tall, the placeholder's height`, bar.rootH)
    expect(bar.logo.length === 1 && Math.abs(bar.logo[0] - phoneLogo) < 0.05, `${tag} the logo is ${phoneLogo}px (5% under ${path === "/" ? 42 : 38})`, bar.logo)
    if (path === "/explore" && who === "guest") {
      const signIn = await p.evaluate(() => { const a = document.querySelector("[data-phone-sign-in]"); if (!a) return null; const cs = getComputedStyle(a); return { tag: a.tagName, bg: cs.backgroundColor, href: a.getAttribute("href"), nested: !!a.querySelector("button"), inButton: !!a.closest("button") } })
      expect(signIn && signIn.bg === "rgb(255, 255, 255)" && signIn.href === "/login" && !signIn.nested && !signIn.inButton, `${tag} the white Sign in stays in the bar, one link`, signIn)
    }
    await p.screenshot({ path: join(shots, `phone-390-${path === "/" ? "home" : "explore"}-${who}-bar.png`), clip: { x: 0, y: 0, width: 390, height: 120 } })
    const s = await openSheet(p, "menu")
    await p.screenshot({ path: join(shots, `phone-390-${path === "/" ? "home" : "explore"}-${who}-menu.png`) })
    expect(!!s, `${tag} the menu sheet opens`)
    /* THE TAB BAR UNDER IT. The sheet and its scrim sit over the buyer tab bar, so the bar is covered cleanly, never on top of the sheet. */
    const tabs = await p.evaluate(() => {
      const bar = document.querySelector("[data-buyer-tab-bar]")
      if (!bar) return { bar: false, where: location.hash }
      const r = bar.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]").getBoundingClientRect()
      return { bar: r.height > 0, covered: !!hit?.closest("[data-app-sheet]"), panelBottom: Math.round(panel.bottom), h: innerHeight }
    })
    if (path === "/") expect(!tabs.bar, `${tag} no buyer tab bar on the homepage, so nothing under the sheet`)
    else expect(tabs.bar && tabs.covered && Math.abs(tabs.panelBottom - tabs.h) <= 1, `${tag} the sheet covers the buyer tab bar cleanly, down to the bottom of the screen`, tabs)
    if (s) {
      expect(!/start selling/i.test(s.text), `${tag} no Start selling in the menu`)
      if (who === "guest") {
        const second = path === "/" ? s.discover : s.logIn
        expect(!!s.signUp && !!second && !!s.sell, `${tag} ${path === "/" ? "Sign up, Discover, Sell on Storelib" : "Sign up, Log in, Sell on Storelib"}`, { signUp: s.signUp?.text, second: second?.text, sell: s.sell?.text })
        if (path === "/explore") expect(!s.discover, `${tag} no Discover on Explore`)
        if (s.signUp && second && s.sell) {
          expect(isViolet(s.signUp.bg) && s.signUp.color === "rgb(255, 255, 255)" && s.signUp.href === "/signup", `${tag} Sign up is filled Storelib purple (not blue), to /signup`, { bg: s.signUp.bg, href: s.signUp.href })
          expect(second.bg === "rgb(255, 255, 255)" && /^1px/.test(second.border) && second.href === (path === "/" ? "/explore" : "/login"), `${tag} ${second.text} is outlined, to ${second.href}`, { bg: second.bg, border: second.border })
          if (path === "/") expect(s.discover.svg, `${tag} Discover carries the compass`)
          expect(isViolet(s.sell.color) && s.sell.bg === "rgba(0, 0, 0, 0)" && s.sell.href === "/sell", `${tag} Sell on Storelib is purple text, to /sell`, { color: s.sell.color, href: s.sell.href })
          expect(s.signUp.h === 46 && second.h === 46 && r8(s.signUp) && r8(second), `${tag} 46px buttons with the 8px corner`, { h: [s.signUp.h, second.h], radius: [s.signUp.radius, second.radius] })
          expect(Math.round(second.top - s.signUp.bottom) === 6 && s.sell.top > second.bottom, `${tag} 6px apart, Sell under them`, { gap: Math.round(second.top - s.signUp.bottom), sellGap: Math.round(s.sell.top - second.bottom) })
          expect(s.signUp.size === "16px" && second.size === "16px" && s.sell.size === "16px", `${tag} labels at 16px`, [s.signUp.size, second.size, s.sell.size])
          const inset = s.signUp.x - s.panelX
          expect(inset >= 16 && inset <= 22 && s.signUp.w === s.panelW - 2 * inset, `${tag} full width, ${inset}px from the sheet's edges`, { inset, w: s.signUp.w, panel: s.panelW })
          const gap = Math.round(s.signUp.top - s.pillBottom)
          expect(gap >= 12 && gap <= 20, `${tag} ${gap}px under the drag pill`)
        }
      }
      if (who === "buyer") {
        expect(!s.signUp && !s.sell && !s.dashboard, `${tag} no guest buttons, no Dashboard`)
        expect(!!s.become && s.become.href === "/sell" && /Become a seller/.test(s.become.text), `${tag} Become a seller (/sell)`, s.become && { href: s.become.href, color: s.become.color })
      }
      if (who === "seller") {
        expect(!s.become && !!s.dashboard && s.dashboard.href === "/app", `${tag} Dashboard (/app), no Become a seller`, s.dashboard?.href)
      }
    }
    await p.close()
  }
}

console.log("\nphone, 390: the account sheet from the photo")
for (const who of ["buyer", "seller"]) {
  for (const path of ["/explore"]) {
    const tag = `${path} ${who}:`
    if(path==='/'){
      const nav=await p.$$eval('[data-marketing-nav] a',els=>els.map(e=>({radius:getComputedStyle(e).borderRadius,bg:getComputedStyle(e).backgroundColor,transition:getComputedStyle(e).transitionProperty})))
      expect(nav.length>0&&nav.every(n=>n.radius==='0px'&&n.bg==='rgba(0, 0, 0, 0)'&&n.transition.split(',').map(s=>s.trim()).includes('color')),`${tag} marketing links brighten with a color transition and no pills`,nav)
    }

    const p = await open(PHONE(390), path, who)
    const s = await openSheet(p, "account")
    await p.screenshot({ path: join(shots, `phone-390-explore-${who}-account.png`) })
    expect(!!s, `${tag} the account sheet opens from the photo`)
    if (s) {
      expect(s.account?.href === "/account" && /Settings/.test(s.account.text), `${tag} Settings goes to /account`, s.account && { href: s.account.href, text: s.account.text })
      expect(/My Library/.test(s.text) && /Settings/.test(s.text) && /Language/.test(s.text) && /Log out/.test(s.text), `${tag} My Library, Settings, Language and Log out are still there`)
      if (who === "buyer") {
        expect(s.become?.href === "/sell" && !s.dashboard, `${tag} Become a seller (/sell), no Dashboard`, s.become?.href)
        const calm = s.become && /rgb\(245, 243, 255\)/.test(s.become.bg) && s.become.h >= 44 && s.become.h <= 56
        expect(!!calm, `${tag} Become a seller is a pale violet row, the height of the others: calm, not a badge`, s.become && { bg: s.become.bg, h: s.become.h, color: s.become.color })
      } else {
        expect(!s.become && s.dashboard?.href === "/app", `${tag} Dashboard (/app), no Become a seller`, s.dashboard?.href)
      }
    }
    await p.close()
  }
}

console.log("\nsmall and large phones: nothing wider than the window")
for (const width of [360, 430]) {
  for (const path of ["/", "/explore"]) {
    for (const who of ["guest", "buyer"]) {
      const p = await open(PHONE(width), path, who)
      const d = await p.evaluate(DESK_READ)
      expect(d.overflow.doc <= 0 && d.overflow.rightmost <= 0.5, `${width} ${path} ${who}: fits`, d.overflow)
      if (path === "/" && who === "guest") {
        const s = await openSheet(p, "menu")
        expect(s && s.signUp && s.discover && s.sell && s.signUp.x >= 16 && s.signUp.x + s.signUp.w <= width - 16, `${width} ${path} guest: the sheet's buttons fit`, s && { x: s.signUp?.x, w: s.signUp?.w })
        await p.screenshot({ path: join(shots, `phone-${width}-home-guest-menu.png`) })
      }
      await p.close()
    }
  }
}

await browser.close()
await new Promise(r=>server.close(r))
rmSync(stubs, { recursive: true, force: true })
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
