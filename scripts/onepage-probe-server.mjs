/**
 * The OnePage editor, bundled and served for a probe: scripts/render-onepage-editor.tsx
 * with the router, next/link, next/image and Supabase stubbed, the app's
 * stylesheet (./probe-css.mjs), and a stub API. Used by
 * scripts/check-onepage-reorder.mjs and scripts/check-onepage-design.mjs.
 *
 * React's devtools hook is defined before the bundle runs, so a probe can
 * count commits (window.__commits) while a finger is down.
 *
 *   const { base, server } = await serveEditorProbe({ root, blocks, theme, fail })
 *   serveEditorProbe({ entry: "scripts/render-onepage-parity.tsx" })   another harness, the same stubs
 *   page.goto(`${base}/app/onepage#links`)   the editor
 *   page.goto(`${base}/app/onepage?live`)    the published page, with `liveTheme`
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { appCss, interFaces } from "./probe-css.mjs"

/* The file types a probe page asks this server for, beside the page itself. */
const STATIC_TYPES = { ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".gif": "image/gif", ".webm": "video/webm", ".mp4": "video/mp4" }

/**
 * `statics` maps an address prefix to a folder: `/images/` is the app's own
 * public/images, as the live site serves it, and a probe can add more
 * (`{ "/__remote/": dir }`, to serve a copy of a file that lives elsewhere).
 *
 * `throttle` ({ latency, bytesPerSecond }) serves those files as a slow
 * phone network would: each waits `latency` ms before its first byte, and
 * all of them share one pipe of `bytesPerSecond`. It is done here rather than
 * with the browser's own network throttling because the page itself (the
 * whole bundle, inline) would crawl through that too, and the probe measures
 * the files, not the harness.
 */
/*
 * `api` (round 11, scripts/check-onepage-blocks-r11.mjs): a probe's own answer
 * for a call, given the request and its body; null leaves it to the stubs
 * below. It is how a probe sees what Save sent and what a signup posted.
 */
export async function serveEditorProbe({ root = process.cwd(), entry = "scripts/render-onepage-editor.tsx", pathname = "/app/onepage", blocks = null, theme = {}, liveTheme = null, statics = {}, throttle = null, api = null, fail = (m) => { throw new Error(m) } } = {}) {
  const dir = join(root, `.onepage-probe-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => ${JSON.stringify(pathname)}
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
  writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
  /* One answer for every query: an empty list (the Products tab maps it) that also says onboarding is done (the editor reads that off a single row). */
  writeFileSync(join(dir, "supabase.js"), `const result = { data: Object.assign([], { onboarding_completed: true }), error: null }
/* A harness that sets globalThis.PROBE_EMPTY_READS gets nothing back instead (the onboarding: every name is free). */
const nothing = { data: null, error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(globalThis.PROBE_EMPTY_READS ? nothing : result) : q, apply: () => q })
/* A probe that names a catalogue (window.PROBE_PRODUCTS) gets it back from a read of products, the read lib/onepage/live-products makes. */
const rows = (list) => { const r = { data: list, error: null }; const p = new Proxy(function () {}, { get: (_, k) => k === "then" ? (res) => res(r) : p, apply: () => p }); return p }
const asyncRows = (read) => { const p = new Proxy(function () {}, { get: (_, k) => k === "then" ? (resolve, reject) => read().then(resolve, reject) : p, apply: () => p }); return p }
export const isNativePlatform = () => false
export function createClient() { return { auth: { getUser: async () => ({ data: { user: Object.prototype.hasOwnProperty.call(globalThis,"PROBE_USER") ? globalThis.PROBE_USER : { id: "probe-user" } } }), getSession: async () => ({ data: { session: globalThis.PROBE_SESSION ?? null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: (table) => (table === "profiles" && globalThis.PROBE_READ_PROFILE ? asyncRows(globalThis.PROBE_READ_PROFILE) : table === "profiles" && globalThis.PROBE_PROFILE ? rows(globalThis.PROBE_PROFILE) : table === "products" && Array.isArray(globalThis.PROBE_PRODUCTS) ? rows(globalThis.PROBE_PRODUCTS) : q), storage: { from: bucket => globalThis.PROBE_STORAGE ? globalThis.PROBE_STORAGE(bucket) : q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
  try {
    execFileSync("pnpm", ["exec", "esbuild", join(root, entry),
      "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
      '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
      `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
      `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
      { stdio: ["ignore", "ignore", "inherit"] })
  } catch {
    rmSync(dir, { recursive: true, force: true })
    fail("the probe did not bundle")
  }
  const css = await appCss(root)
  const bundle = readFileSync(join(dir, "probe.js"), "utf8")
  rmSync(dir, { recursive: true, force: true })
  /* React calls this hook on every commit, production build or not. */
  const devtoolsHook = `window.__commits=0;window.__REACT_DEVTOOLS_GLOBAL_HOOK__={isDisabled:false,supportsFiber:true,renderers:new Map(),inject(){return 1},onCommitFiberRoot(){window.__commits++},onCommitFiberUnmount(){},onPostCommitFiberRoot(){},onScheduleFiberRoot(){},checkDCE(){}};`
  const globals = `window.process={env:{NODE_ENV:"production"}};window.PROBE_THEME=${JSON.stringify(theme)};${blocks ? `window.PROBE_BLOCKS=${JSON.stringify(blocks)};` : ""}${liveTheme ? `window.PROBE_LIVE_THEME=${JSON.stringify(liveTheme)};` : ""}`
  const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
    `</head><body><div id="app"></div><script>${devtoolsHook}${globals}</script><script>${bundle}</script></body></html>`
  const folders = { "/images/": join(root, "public/images"), ...statics }
  /* One pipe for every throttled file: the time the next chunk may leave. */
  let pipeFreeAt = 0
  const sendThrottled = async (res, body) => {
    await new Promise((r) => setTimeout(r, throttle.latency))
    for (let at = 0; at < body.length; at += 4096) {
      const chunk = body.subarray(at, at + 4096)
      const now = Date.now()
      const leave = Math.max(now, pipeFreeAt)
      pipeFreeAt = leave + (chunk.length / throttle.bytesPerSecond) * 1000
      if (leave > now) await new Promise((r) => setTimeout(r, leave - now))
      res.write(chunk)
    }
    res.end()
  }
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0])
    for (const [prefix, dir] of Object.entries(folders)) {
      if (!path.startsWith(prefix)) continue
      const file = normalize(join(dir, path.slice(prefix.length)))
      if (!file.startsWith(normalize(dir)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end() }
      const body = readFileSync(file)
      res.writeHead(200, { "content-type": STATIC_TYPES[extname(file).toLowerCase()] || "application/octet-stream", "content-length": body.length, "cache-control": "public, max-age=31536000, immutable" })
      if (throttle) return void sendThrottled(res, body)
      return res.end(body)
    }
    /* /onepage-preview is the editor preview's own frame (components/onepage/live-preview). */
    if (req.url === "/" || req.url.startsWith("/app") || req.url.startsWith("/onepage-preview") || req.url.startsWith("/receipt/")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
    if (api) {
      const chunks = []
      req.on("data", (c) => chunks.push(c))
      req.on("end", () => {
        const answer = api(req, Buffer.concat(chunks).toString("utf8"))
        if (answer) {
          res.writeHead(answer.status ?? 200, { "content-type": "application/json" })
          return res.end(typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body ?? {}))
        }
        stub(req, res)
      })
      return
    }
    stub(req, res)
  })
  /* The stub API every probe gets. */
  function stub(req, res) {
    res.writeHead(200, { "content-type": "application/json" })
    if (req.url.startsWith("/api/billing/subscription")) return res.end(JSON.stringify({ currentPlan: { id: "pro" } }))
    if (req.url.startsWith("/api/onepage/stats")) {
      /* A fortnight of numbers with a shape, so a chart has something to draw. */
      const days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(Date.UTC(2026, 8, 10 + i))
        return { date: d.toISOString().slice(0, 10), views: 20 + Math.round(12 * Math.sin(i / 2) + i * 2), clicks: 6 + Math.round(4 * Math.cos(i / 3) + i) }
      })
      return res.end(JSON.stringify({ total_views: days.reduce((a, d) => a + d.views, 0), total_clicks: days.reduce((a, d) => a + d.clicks, 0), chart_data: days }))
    }
    res.end("{}")
  }
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { base: `http://127.0.0.1:${server.address().port}`, server }
}
