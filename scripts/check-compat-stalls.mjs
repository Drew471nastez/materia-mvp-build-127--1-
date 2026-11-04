/**
 * ===========================================================================
 *  ADD A SECTION ON AN IMPORTED THEME, WHEN THE NETWORK DOES NOT ANSWER
 * ===========================================================================
 * The owner (andrewrullz, a 157 section imported theme, 1 Nov 2026): every
 * card in Add a section stayed an empty grey box, with its name under it.
 *
 * The real dialog (section-library.tsx, scripts/render-section-preview-stress.tsx)
 * on the 157 section stress theme, with what production does to the cards'
 * document laid over it:
 *
 *   clean         nothing fails (the control)
 *   font-hang     the layout links a web font stylesheet that never answers
 *   asset-hang    the layout links a theme stylesheet the files do not hold
 *                 (a .css.liquid, drawn by the asset route), and the route
 *                 never answers (a database that does not answer)
 *   asset-404     the same stylesheet answered 404 at once
 *   section-hang  a section links a stylesheet of its own that never answers
 *   pass-late     the theme's files (and their asset pass) answer after 4s
 *   many-sheets   the layout links 228 stylesheets the files do not hold, a
 *                 tenth of them never answering, a tenth 404
 *
 * After the dialog opens, how many of the cards on screen show their
 * section at 3s, 8s and 15s. A card on screen that is still grey at 8s is
 * a stall.
 *
 *   node tsx scripts/check-compat-stalls.mjs
 *   SCENARIOS=font-hang,asset-hang STRICT=0 ... (report without failing, for a before)
 */
import { createServer } from "node:http"
import { mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { build } from "esbuild"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"
import { stressTheme } from "./section-preview-stress-theme.ts"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const STRICT = process.env.STRICT !== "0"
const ALL = ["clean", "font-hang", "asset-hang", "asset-404", "section-hang", "pass-late", "many-sheets"]
const SCENARIOS = (process.env.SCENARIOS ?? ALL.join(",")).split(",").filter(Boolean)
const root = process.cwd()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PASS = "p".repeat(32)

const stubs = mkdtempSync(join(tmpdir(), "storelib-stalls-stubs-"))
const stub = (name, body) => {
  writeFileSync(join(stubs, name), body)
  return join(stubs, name)
}
const empty = stub("empty.js", "export default {}; export const readFileSync=()=>{throw Error('fs')}, existsSync=()=>false, join=(...p)=>p.join('/'), dirname=(p)=>p, resolve=(...p)=>p.join('/'), basename=(p)=>p;")
const crypto = stub("crypto.js", "export function createHash(){let a='';return{update(s){a+=String(s);return this},digest(){let h=0x811c9dc5;for(let i=0;i<a.length;i++){h^=a.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(16).padStart(8,'0').repeat(4)}}} export function randomUUID(){return globalThis.crypto.randomUUID()} export default {createHash,randomUUID}")
const nav = stub("navigation.js", "export const usePathname=()=>'/website-builder/editor/stress-install';export const useRouter=()=>({push(){},replace(){},refresh(){},prefetch(){},back(){}});export const useSearchParams=()=>new URLSearchParams();export const useParams=()=>({installId:'stress-install'});export const redirect=()=>{};export const notFound=()=>{};")
const link = stub("link.jsx", "import React from 'react';export default function Link({href,children,...r}){return React.createElement('a',{href,...r},children)}")
const image = stub("image.jsx", "import React from 'react';export default function Image({src,alt,fill,priority,unoptimized,sizes,quality,placeholder,blurDataURL,loader,...r}){return React.createElement('img',{src:typeof src==='string'?src:src&&src.src,alt,...r})}")
const supa = stub("supabase.js", "const chain=()=>new Proxy(function(){},{get:(_,k)=>k==='then'?undefined:chain,apply:()=>chain()});export function createClient(){return{auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>chain(),channel:()=>({on(){return this},subscribe(){return this},unsubscribe(){}}),removeChannel(){}}}")
const built = await build({
  entryPoints: [join(root, "scripts/render-section-preview-stress.tsx")],
  bundle: true, write: false, platform: "browser", format: "iife", minify: true, jsx: "automatic", logLevel: "error",
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://placeholder.supabase.co"', "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"placeholder"', "process.env.NEXT_PUBLIC_APP_URL": '"https://storelib.com"' },
  banner: { js: 'var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;' },
  alias: {
    "@": root, "next/navigation": nav, "next/link": link, "next/image": image, "@/lib/supabase/client": supa, "node:crypto": crypto, crypto, "node:fs": empty, fs: empty, "node:path": empty, path: empty,
    ...(process.env.PREVIEW_MODULE ? { "@/components/website-builder/compat/compat-section-preview": process.env.PREVIEW_MODULE } : {}),
  },
  nodePaths: [join(root, "node_modules")],
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
})
const js = built.outputFiles[0].text
const css = await appCss(root)
const base = await stressTheme()

/** The theme as the scenario has it: its layout and one section linking what the files do not hold. */
function themeFor(scenario) {
  const files = { ...base.files }
  const sources = { ...base.sources }
  const layoutPath = "layout/theme.storelib"
  let extra = ""
  if (scenario === "font-hang") extra = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins&display=swap" data-storelib-font>`
  if (scenario === "asset-hang" || scenario === "asset-404") extra = `{{ 'drawn.css' | asset_url | stylesheet_tag }}`
  if (scenario === "many-sheets") for (let i = 0; i < 228; i++) extra += `{{ 'pack-${i}.css' | asset_url | stylesheet_tag }}`
  if (extra) sources[layoutPath] = sources[layoutPath].replace("</head>", `${extra}\n</head>`)
  if (scenario === "section-hang") {
    for (const p of Object.keys(sources).filter((p) => /^sections\/.+\.storelib$/.test(p)).slice(0, 40)) sources[p] = sources[p].replace(/(<template compat="shopify">)/, `$1{{ 'own-section.css' | asset_url | stylesheet_tag }}`)
  }
  return { files, sources, settings: base.settings }
}

/** What the asset route does for a name the files do not hold, per scenario: "hang", "404", or a delay in ms. */
function assetAnswer(scenario, name) {
  if (scenario === "asset-hang" && name === "drawn.css") return "hang"
  if (scenario === "asset-404" && name === "drawn.css") return "404"
  if (scenario === "section-hang" && name === "own-section.css") return "hang"
  if (scenario === "many-sheets") {
    const n = Number(/pack-(\d+)/.exec(name)?.[1] ?? 0)
    return n % 10 === 3 ? "hang" : n % 10 === 7 ? "404" : 50 + (n % 5) * 60
  }
  return 0
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
const results = []
const hung = []
try {
  for (const scenario of SCENARIOS) {
    const theme = themeFor(scenario)
    const knobs = `window.STRESS_PASS=${JSON.stringify(PASS)};window.STRESS_FILES_MS=${scenario === "pass-late" ? 4000 : 300};`
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>${knobs}window.STRESS=${JSON.stringify(theme).replace(/</g, "\\u003c")}</script><script src="/probe.js"></script></body></html>`
    const asked = []
    const server = createServer((req, res) => {
      const url = req.url ?? "/"
      if (url === "/probe.js") return res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end(js)
      const asset = /^\/api\/site-theme\/assets\/[^/]+\/([^/]+)\/([^?]+)/.exec(url)
      if (asset) {
        const name = decodeURIComponent(asset[2])
        asked.push(`${asset[1]}/${name}`)
        const text = theme.files[`shopify/assets/${name}`]
        if (text !== undefined) return res.writeHead(200, { "Content-Type": "text/css", "Access-Control-Allow-Origin": "*" }).end(text)
        const a = assetAnswer(scenario, name)
        if (a === "hang") { hung.push(res); return }
        if (a === "404") return res.writeHead(404, { "Access-Control-Allow-Origin": "*" }).end()
        return setTimeout(() => res.writeHead(200, { "Content-Type": "text/css", "Access-Control-Allow-Origin": "*" }).end(`/* ${name} */`), a)
      }
      if (/^\/(img|font)\//.test(url)) return res.writeHead(404).end()
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
    })
    await new Promise((r) => server.listen(0, "127.0.0.1", r))
    const origin = `http://127.0.0.1:${server.address().port}`
    const page = await browser.newPage()
    const reports = []
    /* What reportLoadProblem says (it posts the same line to /api/client-errors, which the stress page answers itself). */
    page.on("console", (m) => { if (/^\[(section-preview|compat-canvas)\]/.test(m.text())) reports.push(m.text().slice(0, 200)) })
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const u = r.url()
      /* A web font host that never answers (font-hang); any other outside address answers empty at once. */
      if (/fonts\.googleapis\.com/.test(u)) return
      if (u.endsWith("/api/client-errors")) { reports.push(String(r.postData() ?? "").slice(0, 300)); return r.respond({ status: 204, body: "" }) }
      if (u.startsWith(origin) || u.startsWith("data:") || u.startsWith("about:")) return r.continue()
      return r.respond({ status: 200, contentType: "text/plain", body: "" })
    })
    await page.setViewport({ width: 1440, height: 900 })
    await page.goto(origin, { waitUntil: "domcontentloaded" })
    await sleep(400)
    const t0 = Date.now()
    await page.evaluate(() => window.stress.open())
    const count = () => page.evaluate(() => {
      const v = document.querySelector("[data-section-library-layer] [data-library-scroll]")?.getBoundingClientRect()
      let onScreen = 0, shown = 0, named = 0, all = 0, allShown = 0
      for (const b of document.querySelectorAll("[data-section-library-layer] [data-compat-preview-state]")) {
        const r = b.getBoundingClientRect()
        if (!(r.height > 0)) continue
        all++
        const st = b.getAttribute("data-compat-preview-state")
        if (st !== "waiting") allShown++
        if (!v || r.bottom <= v.top || r.top >= v.bottom) continue
        onScreen++
        if (st === "shown") shown++
        if (st === "named") named++
      }
      return { onScreen, shown, named, all, allShown }
    })
    const at = {}
    for (const t of [3000, 8000, 15000]) {
      await sleep(Math.max(0, t0 + t - Date.now()))
      at[t / 1000] = await count()
    }
    const passVersion = asked.filter((a) => a.startsWith(`edit.${PASS}/`)).length
    const plainEdit = asked.filter((a) => a.startsWith("edit/")).length
    const r = { scenario, at, assetsAsked: asked.length, withPass: passVersion, withoutPass: plainEdit, reports: reports.length, reportSample: reports[0] ?? null }
    const s8 = at[8]
    r.stalled = s8.onScreen > 0 && s8.shown + s8.named < s8.onScreen
    /* A wait that had to be cut short is said to the error log. */
    r.unreported = ["font-hang", "asset-hang", "many-sheets"].includes(scenario) && reports.length === 0
    results.push(r)
    console.log(`${scenario.padEnd(13)} on screen shown 3s ${at[3].shown}/${at[3].onScreen}  8s ${at[8].shown}/${at[8].onScreen}  15s ${at[15].shown}/${at[15].onScreen}  all drawn 15s ${at[15].allShown}/${at[15].all}  assets edit.<pass> ${passVersion}, edit ${plainEdit}  reports ${reports.length}${r.stalled ? "  STALLED" : ""}`)
    await page.close()
    for (const h of hung.splice(0)) h.destroy?.()
    server.closeAllConnections?.()
    server.close()
  }
} finally {
  await browser.close()
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(results, null, 2))
const bad = results.filter((r) => r.stalled || r.unreported || r.withoutPass > 0)
if (bad.length) {
  console.log(`\n${bad.length} scenario(s) with cards still grey at 8s or assets asked without their pass: ${bad.map((r) => r.scenario).join(", ")}`)
  if (STRICT) process.exit(1)
} else console.log("\nPASS")
