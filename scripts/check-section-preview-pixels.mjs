/**
 * ===========================================================================
 *  ADD A SECTION: DOES EVERY CARD SHOW A PICTURE, IN PIXELS
 * ===========================================================================
 * The owner (andrewrullz, Materia Themes, 1 Nov 2026, after #395): every card
 * in Add a section had its real height and its name, and an empty grey box
 * where the picture should be. Earlier probes counted cards "drawn" by their
 * boxes and state, never by what was painted, and said 145/145.
 *
 * This one opens the real dialog (section-library.tsx through
 * scripts/render-section-preview-stress.tsx) on a real imported theme, its
 * assets served from its own shopify/assets with production's delays (some
 * stylesheets slower than SHEET_WAIT_MS), takes a screenshot, and for each
 * card on screen counts the pixels that are not the card's grey: a card
 * whose section is drawn (state "shown") and whose picture is under 2%
 * painted is BLANK.
 *
 * It walks the whole list a screen at a time. A card over its grey but
 * with nothing on it but one colour is EMPTY: a section whose theme hides
 * it until a script runs, and the cards run none.
 *
 *   npx tsx scripts/check-section-preview-pixels.mjs
 *   THEME=/path/to/storelib/repo npx tsx scripts/check-section-preview-pixels.mjs
 *   THEME=... WIDTH=1440,1920 SLOW=4000 SHOTS=/dir JSON=/out.json STRICT=0 ...
 *
 * Without THEME: the 157 section stress theme (scripts/section-preview-stress-theme.ts)
 * with three sections that hide what they hold until a script reveals it, the
 * way Materia's do (`<motion-element class="opacity-0">`, `[data-cd-reveal]`,
 * `.reveal`).
 */
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs"
import { join, relative, extname } from "node:path"
import { tmpdir } from "node:os"
import { build } from "esbuild"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const STRICT = process.env.STRICT !== "0"
const root = process.cwd()
const THEME = process.env.THEME ?? null
/*
  Section types allowed to show one colour. The stress theme's countdowns
  (the third of its 16 kinds: stress-2, stress-18, ...) are drawn 120px
  above their own box, waiting for an animation the cards never play: the
  card is right to show them as their page would with motion off.
*/
const ALLOW_EMPTY = process.env.ALLOW_EMPTY ? new RegExp(process.env.ALLOW_EMPTY) : THEME ? null : { test: (type) => /^stress-\d+$/.test(type) && Number(type.slice(7)) % 16 === 2 }
const WIDTHS = (process.env.WIDTH ?? "1440").split(",").map(Number)
const SLOW = Number(process.env.SLOW ?? 4000)
const SHOTS = process.env.SHOTS ?? null
const WAIT = Number(process.env.WAIT ?? 9000)
const PASS = "p".repeat(32)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── the theme, as the editor holds it: its .storelib sources, its shopify/ files, its settings ── */
const binary = /\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|pdf)$/i
let sources = {}
let files = {}
let settings = {}
if (THEME) {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (name === ".git" || name === "node_modules") continue
      if (statSync(p).isDirectory()) walk(p)
      else {
        const rel = relative(THEME, p)
        if (rel.endsWith(".storelib")) sources[rel] = readFileSync(p, "utf8")
        else if (rel.startsWith("shopify/") && !binary.test(rel)) files[rel] = readFileSync(p, "utf8")
      }
    }
  }
  walk(THEME)
  const settingsPath = join(THEME, "config/settings.json")
  if (existsSync(settingsPath)) settings = JSON.parse(readFileSync(settingsPath, "utf8"))
} else {
  const { stressTheme } = await import("./section-preview-stress-theme.ts")
  ;({ sources, files, settings } = await stressTheme())
  const hidden = (type, name, markup, style) => `<template compat="shopify">
<style>${style}</style>
${markup}
</template>

<schema>
${JSON.stringify({ type, name, settings: [], presets: [{ name }], shopify: { name, settings: [], presets: [{ name }] } })}
</schema>
`
  /* Hidden until a script plays them in, one with a failsafe animation the cards (animations off) never play. */
  sources["sections/aa-motion.storelib"] = hidden("aa-motion", "AA Motion slideshow", `<div class="mo"><motion-element class="opacity-0" data-motion="fade-up-lg"><h2>Motion heading revealed by a script</h2><p>Words a visitor sees once the theme's script plays them in.</p></motion-element></div>`, `.mo{padding:40px;background:#fff}.opacity-0{opacity:0}motion-element.opacity-0{animation:mo-show 0s linear 3s forwards}@keyframes mo-show{to{opacity:1}}.mo h2{font-size:40px}`)
  sources["sections/aa-countdown.storelib"] = hidden("aa-countdown", "AA Countdown reveal", `<div class="cd0"><div class="cd0__in" data-cd-reveal="fade"><h2>Sale ends soon</h2><p>00 : 12 : 41 : 09</p></div></div>`, `.cd0{padding:40px;background:#fff}.cd0__in[data-cd-reveal]:not(.is-revealed){opacity:0;transform:translateY(20px)}.cd0 h2{font-size:40px}`)
  sources["sections/aa-reveal.storelib"] = hidden("aa-reveal", "AA Reveal text", `<div class="rv"><div class="reveal-on-scroll"><h2>Revealed as it is scrolled to</h2><p>A paragraph under it.</p></div></div>`, `.rv{padding:40px;background:#fff}.reveal-on-scroll{opacity:0;clip-path:inset(0 0 100% 0)}.rv h2{font-size:40px}`)
}

const stubs = mkdtempSync(join(tmpdir(), "storelib-pixels-stubs-"))
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
    /* PREVIEW_MODULE=/path/to/an/older/compat-section-preview.tsx: measure that one instead, for a before. */
    ...(process.env.PREVIEW_MODULE ? { "@/components/website-builder/compat/compat-section-preview": process.env.PREVIEW_MODULE } : {}),
  },
  nodePaths: [join(root, "node_modules")],
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
})
const js = built.outputFiles[0].text
const css = await appCss(root)

/* Production's asset route: most answer in tens of ms, a few of the theme's stylesheets take SLOW ms (over the 3s the cards wait). */
const slowNames = new Set((process.env.SLOW_NAMES ?? "tingle.min.css,judgeme-reviews.css,popup.css,main-product.css,slideshow.css").split(","))
const mime = { ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff" }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: process.env.HEADFUL ? false : true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
const results = []
try {
  for (const W of WIDTHS) {
    const knobs = `window.STRESS_PASS=${JSON.stringify(PASS)};window.STRESS_FILES_MS=300;`
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>${knobs}window.STRESS=${JSON.stringify({ sources, files, settings }).replace(/</g, "\\u003c")}</script><script src="/probe.js"></script></body></html>`
    const server = createServer((req, res) => {
      const url = req.url ?? "/"
      if (url === "/probe.js") return res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end(js)
      const asset = /^\/api\/site-theme\/assets\/[^/]+\/([^/]+)\/([^?]+)/.exec(url)
      if (asset) {
        const name = decodeURIComponent(asset[2])
        const delay = slowNames.has(name) ? SLOW : 30
        const text = files[`shopify/assets/${name}`]
        if (text !== undefined) return setTimeout(() => res.writeHead(200, { "Content-Type": mime[extname(name).toLowerCase()] ?? "text/plain", "Access-Control-Allow-Origin": "*" }).end(text), delay)
        const p = THEME ? join(THEME, "shopify/assets", name) : ""
        return setTimeout(() => {
          if (!p || !existsSync(p)) return res.writeHead(404, { "Access-Control-Allow-Origin": "*" }).end()
          res.writeHead(200, { "Content-Type": mime[extname(name).toLowerCase()] ?? "text/plain", "Access-Control-Allow-Origin": "*" }).end(readFileSync(p))
        }, delay)
      }
      if (url === "/" || url.startsWith("/?")) return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
      res.writeHead(404).end()
    })
    await new Promise((r) => server.listen(0, "127.0.0.1", r))
    const origin = `http://127.0.0.1:${server.address().port}`
    const page = await browser.newPage()
    const reports = []
    page.on("console", (m) => { if (/^\[(section-preview|compat-canvas)\]/.test(m.text())) reports.push(m.text().slice(0, 200)) })
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const u = r.url()
      if (u.endsWith("/api/client-errors")) { reports.push(String(r.postData() ?? "").slice(0, 300)); return r.respond({ status: 204, body: "" }) }
      if (u.startsWith(origin) || u.startsWith("data:") || u.startsWith("about:") || u.startsWith("blob:")) return r.continue()
      return r.respond({ status: 404, body: "" })
    })
    await page.setViewport({ width: W, height: Math.round(W * 0.56) })
    await page.goto(origin, { waitUntil: "domcontentloaded" })
    await sleep(500)
    await page.evaluate(() => window.stress.open())
    await sleep(WAIT)
    /* PROBE=file.js: an expression run in the page before the first screenshot, for finding out why a card is blank. */
    if (process.env.PROBE) console.log("PROBE", JSON.stringify(await page.evaluate(readFileSync(process.env.PROBE, "utf8"))))
    /*
      The list, a screen at a time (SWEEP=0: only the first screen). On each,
      every card wholly on screen: its state, and from a screenshot, the share
      of its box that is not the card's grey (`placed`: the picture is over it
      at all) and the share that is not the picture's own commonest colour
      (`ink`: something is drawn on it, not only a background).
    */
    const seen = new Map()
    let screen = 0
    for (;;) {
      const cards = await page.evaluate(() => {
        const v = document.querySelector("[data-section-library-layer] [data-library-scroll]")?.getBoundingClientRect()
        const out = []
        for (const b of document.querySelectorAll("[data-section-library-layer] [data-compat-preview-state]")) {
          const r = b.getBoundingClientRect()
          /* What of it is on screen: a card taller than the list is measured where it can be seen. */
          const top = Math.max(r.top, v?.top ?? 0), bottom = Math.min(r.bottom, v?.bottom ?? 0)
          if (!v || !(r.height > 20) || bottom - top < Math.min(r.height, 120)) continue
          out.push({ type: b.getAttribute("data-compat-preview"), state: b.getAttribute("data-compat-preview-state"), x: r.left, y: top, w: r.width, h: bottom - top, full: r.height })
        }
        return out
      })
      const shot = await page.screenshot({ type: "png" })
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true })
        writeFileSync(join(SHOTS, `pixels-${W}-${String(screen).padStart(2, "0")}.png`), shot)
      }
      const measured = await page.evaluate(async (b64, cards) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const c = document.createElement("canvas")
        c.width = img.width
        c.height = img.height
        const g = c.getContext("2d")
        g.drawImage(img, 0, 0)
        const dpr = img.width / innerWidth
        return cards.map((k) => {
          const x = Math.round((k.x + 2) * dpr), y = Math.round((k.y + 2) * dpr), w = Math.max(1, Math.round((k.w - 4) * dpr)), h = Math.max(1, Math.round((k.h - 4) * dpr))
          const d = g.getImageData(x, y, w, h).data
          const n = d.length / 4
          let placed = 0
          const counts = new Map()
          for (let i = 0; i < d.length; i += 4) {
            if (Math.abs(d[i] - 243) + Math.abs(d[i + 1] - 244) + Math.abs(d[i + 2] - 246) > 24) placed++
            const q = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
            counts.set(q, (counts.get(q) ?? 0) + 1)
          }
          let top = 0
          for (const v of counts.values()) if (v > top) top = v
          return { placed: placed / n, ink: 1 - top / n }
        })
      }, shot.toString("base64"), cards)
      cards.forEach((k, i) => {
        const was = seen.get(k.type)
        if (!was || (was.state !== "shown" && k.state === "shown") || (was.state === k.state && k.h > was.h)) seen.set(k.type, { ...k, ...measured[i], screen })
      })
      if (process.env.SWEEP === "0") break
      const moved = await page.evaluate(() => {
        const list = document.querySelector("[data-section-library-layer] [data-library-scroll]")
        const before = list.scrollTop
        list.scrollTop = before + list.clientHeight - 40
        return list.scrollTop !== before
      })
      if (!moved) break
      screen++
      await sleep(Number(process.env.SETTLE ?? 900))
    }
    const rows = [...seen.values()]
    const shown = rows.filter((r) => r.state === "shown")
    /*
      A card said shown with nothing on it but one colour. BLANK when that is
      the card's own grey (the picture is not over it at all), EMPTY when it
      is the picture's background (what it holds is hidden). A light section
      that is mostly the grey's colour still has its words and is neither.
    */
    const allowed = (r) => !!ALLOW_EMPTY && ALLOW_EMPTY.test(r.type)
    const blank = shown.filter((r) => r.ink < 0.0005 && r.placed < 0.02 && !allowed(r))
    const empty = shown.filter((r) => r.ink < 0.0005 && r.placed >= 0.02 && !allowed(r))
    /* The sections that hide what they hold until a script runs: each shown, with its words on it. */
    const unrevealed = (THEME ? [] : ["aa-motion", "aa-countdown", "aa-reveal"]).filter((t) => !shown.some((r) => r.type === t && r.ink >= 0.0005))
    if (unrevealed.length) console.log(`  not shown with their words: ${unrevealed.join(", ")}`)
    results.push({ width: W, cards: rows.length, shown: shown.length, blank: blank.length, empty: empty.length + unrevealed.length, reports, rows })
    console.log(`${W}px  cards seen ${rows.length}, shown ${shown.length}, named ${rows.filter((r) => r.state === "named").length}, waiting ${rows.filter((r) => r.state === "waiting").length}, blank ${blank.length}, empty ${empty.length}`)
    const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
    console.log(`  mean placed ${(avg(shown.map((r) => r.placed)) * 100).toFixed(1)}%, mean ink ${(avg(shown.map((r) => r.ink)) * 100).toFixed(1)}%`)
    for (const r of [...blank, ...empty].slice(0, 30)) console.log(`  ${blank.includes(r) ? "BLANK" : "EMPTY"} ${r.type} ${Math.round(r.full)}px placed ${(r.placed * 100).toFixed(1)}% ink ${(r.ink * 100).toFixed(2)}% (screen ${r.screen})`)
    if (reports.length) console.log(`  reports: ${reports.slice(0, 3).join(" | ")}`)
    if (process.env.DEBUG) {
      const dbg = await page.evaluate(() => {
        const f = document.querySelector("iframe[data-compat-sheet]")
        const d = f?.contentDocument
        const fr = f?.getBoundingClientRect()
        const cards = Array.from(d?.querySelectorAll("body>sl-card") ?? []).slice(0, 6).map((c) => {
          const s = d.defaultView.getComputedStyle(c)
          const r = c.getBoundingClientRect()
          const main = c.firstElementChild
          const sec = main?.firstElementChild
          const ss = sec ? d.defaultView.getComputedStyle(sec) : null
          const sr = sec?.getBoundingClientRect()
          return { key: c.getAttribute("data-sl-card"), attrs: c.getAttributeNames().join(","), op: s.opacity, vis: s.visibility, disp: s.display, cv: s.contentVisibility, r: [r.x, r.y, r.width, r.height].map(Math.round), sec: sec ? { tag: sec.tagName, cls: sec.className.slice(0, 60), op: ss.opacity, vis: ss.visibility, disp: ss.display, r: [sr.x, sr.y, sr.width, sr.height].map(Math.round) } : null, text: c.textContent.trim().slice(0, 60) }
        })
        return { frame: fr && [fr.x, fr.y, fr.width, fr.height].map(Math.round), transform: f?.style.transform, ready: d?.readyState, cards }
      })
      console.log(JSON.stringify(dbg, null, 1))
    }
    await page.close()
    server.closeAllConnections?.()
    server.close()
  }
} finally {
  await browser.close()
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(results, null, 2))
const bad = results.filter((r) => r.blank > 0 || r.empty > 0 || r.shown === 0)
if (bad.length) {
  console.log(`\nBLANK: cards drawn but showing nothing at ${bad.map((r) => `${r.width}px (${r.blank} blank, ${r.empty} empty of ${r.shown})`).join(", ")}`)
  if (STRICT) process.exit(1)
} else console.log("\nPASS")
