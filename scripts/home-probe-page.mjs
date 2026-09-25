/**
 * ===========================================================================
 *  HOME, SERVED FOR A PROBE
 * ===========================================================================
 * Bundles scripts/render-home-banner.tsx (the real DashboardClient with the
 * account in a chosen state) and serves it on a local port inside the same
 * frame the app draws around it: at phone width a 68px dark bar over the
 * page, from 768 a 58px header and the 240px sidebar beside it, so the
 * banner is exactly as wide as it is in the app.
 *
 * The Supabase client is a stub that answers every read with no rows,
 * except the two counts the banner asks for, which come from the address:
 * `&subs=N` subscribers and `&flows=N` active automations.
 *
 * Used by scripts/check-home-banner.mjs and scripts/check-home-scroll.mjs.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { appCss, interFaces } from "./probe-css.mjs"

export async function homeProbePage(root = process.cwd()) {
  const dir = join(root, `.home-banner-${process.pid}-probe`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push(h) { window.__pushed = h }, prefetch(h) { (window.__prefetched = window.__prefetched || []).push(h) }, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
  /* A Link that records where it went instead of leaving the page, so a probe can press one. */
  writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, onClick, ...rest }) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest, onClick: (e) => { onClick && onClick(e); if (!e.defaultPrevented) { e.preventDefault(); window.__linked = typeof href === "string" ? href : "" } } }, children)
}
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, priority, fill, sizes, quality, placeholder, blurDataURL, loader, unoptimized, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt: alt || "", width, height, ...rest })
}
`)
  writeFileSync(join(dir, "supabase.js"), `
const qs = new URLSearchParams(location.search)
/* The address wins; otherwise what the fixture set for its state (window.__probeCounts); otherwise none. */
const countOf = (table, param) => {
  if (qs.get(param) != null) return Number(qs.get(param))
  const fixture = window.__probeCounts || {}
  return table in fixture ? fixture[table] : 0
}
window.__reads = []
function query(table) {
  const answer = () => ({ data: [], error: null, count: table === "subscribers" ? countOf(table, "subs") : table === "email_flows" ? countOf(table, "flows") : 0 })
  const q = new Proxy(function () {}, {
    get: (_, k) => (k === "then" ? (resolve, reject) => { window.__reads.push(table); return Promise.resolve(answer()).then(resolve, reject) } : q),
    apply: () => q,
  })
  return q
}
export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (table) => query(table), rpc: () => query("rpc"), storage: { from: () => query("storage") },
    channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {},
  }
}
export function isNativePlatform() { return false }
`)
  try {
    execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-home-banner.tsx"),
      "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
      '--define:process.env.NODE_ENV="production"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://probe.invalid"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon-key"',
      `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
      `--alias:next/image=${join(dir, "image.jsx")}`, `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
      `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
      { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  } catch {
    rmSync(dir, { recursive: true, force: true })
    throw new Error("the Home probe did not bundle")
  }
  const script = readFileSync(join(dir, "probe.js"), "utf8")
  rmSync(dir, { recursive: true, force: true })

  /* The frame the app draws around a page: app/app/layout.tsx. */
  const shell = `
    html,body{margin:0;height:100%;font-family:Inter,system-ui,sans-serif;background:#111111}
    .probe-top{position:fixed;left:0;right:0;top:0;height:68px;background:#111111}
    .probe-rail{display:none}
    .probe-main{position:fixed;left:0;right:0;top:68px;bottom:0;border-radius:20px 20px 0 0;overflow:hidden;background:#f8f9fa}
    .probe-main > .app-content-scroll{height:100%;overflow-y:auto}
    #app{height:100%}
    @media (min-width:768px){
      .probe-top{height:58px;background:#131316}
      .probe-rail{display:block;position:fixed;left:0;top:58px;bottom:0;width:240px;background:#fff;border-right:1px solid rgba(229,229,229,.6)}
      .probe-main{top:58px;left:240px;border-radius:0}
    }`
  /* Inter from the build, served from here: a page on http may not load a file:// font. */
  const fontFiles = new Map()
  const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, file) => {
    const name = `/__font/${fontFiles.size}.woff2`
    fontFiles.set(name, file)
    return `url(${name})`
  })
  const html = `<!doctype html><html class="light app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${faces}</style><style>${await appCss(root)}</style><style>${shell}</style>` +
    `</head><body><div class="probe-top"></div><div class="probe-rail"></div><main class="probe-main"><div class="app-content-scroll"><div id="app"></div></div></main>` +
    `<script>window.process={env:{NODE_ENV:"production"}};window.__err=[];addEventListener("error",function(e){window.__err.push(String(e.message))})</script><script>${script}</script></body></html>`

  const server = createServer((req, res) => {
    if (fontFiles.has(req.url)) {
      try {
        const body = readFileSync(fontFiles.get(req.url))
        res.writeHead(200, { "content-type": "font/woff2" })
        res.end(body)
      } catch {
        res.writeHead(404)
        res.end()
      }
      return
    }
    if (req.url.startsWith("/api/")) {
      res.writeHead(200, { "content-type": "application/json" })
      res.end("{}")
      return
    }
    if (/\.(png|jpe?g|webp|svg|avif)(\?|$)/.test(req.url)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}
