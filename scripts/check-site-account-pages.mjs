/**
 * ===========================================================================
 *  THE VISITOR'S PAGES, MEASURED: SIGN IN, ACCOUNT, CONTACT, WISHLIST, PASSWORD
 * ===========================================================================
 * tests/site-customer-pages.test.ts proves the markup and the rules. This
 * measures what a visitor gets, on a light theme and a dark one, at a phone
 * (390) and a desktop (1280): each page drawn on the server the way a
 * website draws it (scripts/prerender-site-customer-pages.tsx), hydrated in
 * Chromium with the client code a website ships, then read:
 *
 *   fields       every visible input and textarea: its rendered height, its
 *                font size, and its placeholder (there must be one)
 *   overflow     how far the page is wider than the screen (must be 0)
 *   buttons      the submit buttons' heights (a thumb's 44px on a phone)
 *   errors       anything the page threw or failed to load
 *
 *   node scripts/check-site-account-pages.mjs      (SHOTS=<dir> keeps pictures)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? ""
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "site-navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "site-link.jsx"), `import React from "react"\nexport default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : String(href && href.pathname || "#"), ...rest }, children) }\n`)
writeFileSync(join(stubs, "site-image.jsx"), `import React from "react"\nexport default function Image({ src, alt, ...rest }) { const { fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...ok } = rest; return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...ok }) }\n`)
writeFileSync(join(stubs, "site-supabase.js"), `export function createClient() { throw new Error("a website page must not open a Supabase client") }\n`)
writeFileSync(join(stubs, "site-empty.js"), `export {}\n`)
writeFileSync(join(stubs, "site-crypto.js"), `export function createHash() { let h = 2166136261; const self = { update(s) { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return self }, digest() { return (h >>> 0).toString(16).padStart(8, "0").repeat(8) } }; return self }\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-site-customer-pages-"))
const aliases = [
  `--alias:next/navigation=${join(stubs, "site-navigation.js")}`, `--alias:next/link=${join(stubs, "site-link.jsx")}`,
  `--alias:next/image=${join(stubs, "site-image.jsx")}`, `--alias:@/lib/supabase/client=${join(stubs, "site-supabase.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
]

const server = join(out, "prerender.cjs")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/prerender-site-customer-pages.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${server}`,
  '--define:process.env.NODE_ENV="production"', `--alias:server-only=${join(stubs, "site-empty.js")}`, ...aliases],
  { stdio: ["ignore", "ignore", "inherit"] })
const fixtures = join(out, "pages")
execFileSync("node", [server], { env: { ...process.env, OUT_DIR: fixtures, NODE_ENV: "production" }, stdio: ["ignore", "ignore", "inherit"] })

const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-site-accounts.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--minify", "--log-level=error", `--outfile=${bundle}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  `--alias:node:crypto=${join(stubs, "site-crypto.js")}`, ...aliases],
  { stdio: ["ignore", "ignore", "inherit"] })

const css = await appCss(root)
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = `/media/${fontFiles.size}.woff2`
  fontFiles.set(name, path)
  return `url(${name})`
})
const js = readFileSync(bundle)
const pages = Object.fromEntries(readdirSync(fixtures).map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(fixtures, f), "utf8"))]))

function html(p) {
  const probe = JSON.stringify({ template: p.template, prerendered: p.prerendered, props: p.props }).replace(/</g, "\\u003c")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0}</style></head>
<body><div id="app">${p.ssr}</div><script>window.__PROBE__=${probe}</script><script src="/probe.js"></script></body></html>`
}

const http = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return }
  if (url.pathname === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(js); return }
  if (fontFiles.has(url.pathname)) { res.writeHead(200, { "content-type": "font/woff2" }); res.end(readFileSync(fontFiles.get(url.pathname))); return }
  if (url.pathname.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return }
  const key = url.pathname.slice(1).replace("/", "-")
  const p = pages[key]
  if (!p) { res.writeHead(404); res.end("no page"); return }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(html(p))
})
await new Promise((r) => http.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${http.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const VIEWPORTS = [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }],
]
const THEMES = ["storelib-default", "studio-noir"]
const KEYS = ["login", "login-code", "account", "account-edit", "contact", "wishlist", "password", "password-wrong"]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true })
const rows = []

try {
  for (const theme of THEMES) {
    for (const [label, viewport] of VIEWPORTS) {
      console.log(`\n${theme} ${label}`)
      for (const key of KEYS) {
        const page = await browser.newPage()
        await page.setViewport(viewport)
        const errors = []
        page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
        page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text().slice(0, 200)) })
        page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url().replace(base, "")}`) })
        await page.setRequestInterception(true)
        page.on("request", (r) => {
          if (r.url().startsWith(base) || r.url().startsWith("data:")) return r.continue()
          if (r.url().startsWith("https://fonts.googleapis.com/")) return r.respond({ status: 200, contentType: "text/css", body: "" })
          return r.abort()
        })
        await page.goto(`${base}/${theme}/${key}`, { waitUntil: "load" })
        await page.waitForFunction("window.__HYDRATED__ === true", { timeout: 15000 })
        await wait(300)
        const m = await page.evaluate(() => {
          const fields = []
          for (const el of document.querySelectorAll("input, textarea")) {
            const type = el.getAttribute("type") || (el.tagName === "TEXTAREA" ? "textarea" : "text")
            if (["hidden", "checkbox", "radio", "submit"].includes(type)) continue
            if (el.getAttribute("tabindex") === "-1") continue
            const r = el.getBoundingClientRect()
            if (r.width === 0 && r.height === 0) continue
            fields.push({ name: el.getAttribute("name") || "?", type, h: Math.round(r.height), w: Math.round(r.width), font: parseFloat(getComputedStyle(el).fontSize), placeholder: el.getAttribute("placeholder") || "", right: Math.round(r.right) })
          }
          const buttons = []
          for (const el of document.querySelectorAll('main button[type="submit"], section button[type="submit"]')) {
            const r = el.getBoundingClientRect()
            if (r.width === 0) continue
            buttons.push({ text: (el.textContent || "").trim().slice(0, 20), h: Math.round(r.height), right: Math.round(r.right) })
          }
          return { overflow: document.documentElement.scrollWidth - window.innerWidth, fields, buttons, width: window.innerWidth }
        })
        if (SHOTS) {
          mkdirSync(SHOTS, { recursive: true })
          await page.screenshot({ path: join(SHOTS, `customer-${theme}-${key}-${label}.png`), fullPage: true })
        }
        const phone = label === "390"
        const noPlaceholder = m.fields.filter((f) => !f.placeholder.trim())
        const short = m.fields.filter((f) => f.h < (phone ? 44 : 40))
        const smallText = phone ? m.fields.filter((f) => f.font < 16) : []
        const offscreen = [...m.fields, ...m.buttons].filter((f) => f.right > m.width)
        const lowButtons = phone ? m.buttons.filter((b) => b.h < 44) : []
        expect(
          m.overflow <= 0 && noPlaceholder.length === 0 && short.length === 0 && smallText.length === 0 && offscreen.length === 0 && lowButtons.length === 0 && errors.length === 0 && m.fields.length > (key === "wishlist" || key === "account" ? -1 : 0),
          `${key}: ${m.fields.length} fields, every one with a placeholder, none short, nothing past the edge`,
          JSON.stringify({ overflow: m.overflow, noPlaceholder, short, smallText, offscreen, lowButtons, errors }),
        )
        rows.push({ theme, label, key, overflow: m.overflow, fields: m.fields, buttons: m.buttons })
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
  http.close()
}

console.log("\nMeasurements (field: height px / font px / placeholder; buttons: height px; overflow px)")
for (const r of rows) {
  const f = r.fields.map((x) => `${x.name} ${x.h}/${x.font} "${x.placeholder}"`).join(", ") || "no fields"
  const b = r.buttons.map((x) => `${x.text} ${x.h}`).join(", ")
  console.log(`  ${`${r.theme} ${r.label} ${r.key}`.padEnd(38)} overflow ${String(r.overflow).padStart(3)}  ${f}${b ? `  | buttons ${b}` : ""}`)
}
if (broken) fail(`${broken} check(s) failed.`)
console.log("\nAll checks passed.")
