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
 * `{ before: BASE }` builds Home as it was at commit BASE where this work
 * changed it: the old banner (scripts/home-banner-before.tsx), the old globe
 * and the old pull to refresh hook, both read from the repository at BASE.
 * Everything else is this checkout's, so a before and an after differ only
 * in those.
 *
 * `{ swaps: { "@/some/module": "/abs/file" } }` puts other files in place of
 * single modules, for a probe that measures an older version of one of them.
 *
 * Used by scripts/check-home-banner.mjs, scripts/check-home-scroll.mjs and
 * scripts/check-metric-tabs-gesture.mjs.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { build } from "esbuild"
import { appCss, interFaces } from "./probe-css.mjs"

export async function homeProbePage(root = process.cwd(), { before = null, swaps: extra = {} } = {}) {
  const dir = join(root, `.home-banner-${process.pid}${before ? "-before" : ""}-probe`)
  mkdirSync(dir, { recursive: true })
  /* The old files go beside the new ones (in folders the repository ignores), so their own relative imports still resolve. */
  const swaps = {}
  const oldDirs = []
  if (before) {
    const show = (file) => execFileSync("git", ["show", `${before}:${file}`], { cwd: root, encoding: "utf8" })
    const globeDir = join(root, "components/app/home", `.old-${process.pid}-probe`)
    mkdirSync(globeDir, { recursive: true })
    oldDirs.push(globeDir)
    writeFileSync(join(globeDir, "globe.tsx"), show("components/app/home/globe.tsx"))
    writeFileSync(join(globeDir, "globe-land.ts"), show("components/app/home/globe-land.ts"))
    swaps["@/components/app/home/home-banner"] = join(root, "scripts/home-banner-before.tsx")
    swaps["@probe/old-globe"] = join(globeDir, "globe.tsx")
    /*
      THE PULL TO REFRESH IS NO LONGER SWAPPED HERE, AND CANNOT BE.

      BASE's hook used to drop straight in beside this checkout's Home, because
      it was the only one of the three files the gesture lives in that had
      changed. It is not any more: the hook hands the page two element refs and
      exports the gesture's numbers, so this checkout's dashboard and indicator
      do not build against BASE's hook at all.

      Taking all three from BASE does not work either: BASE predates the home
      banner, so BASE's dashboard never renders the globe this probe waits for,
      and the before column would be a different page rather than an older one.

      The gesture's own before and after is a measurement of its own now:
      scripts/check-pull-refresh.mjs swaps all three together and reports
      frames, renders, resistance and settle for each.
    */
  }
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
/* Every read answers nothing: the account's facts are handed to the page (scripts/render-home-banner.tsx). */
/* window.__readMs holds each read for that long, as a round trip to the database would (default none); window.__reads counts them. */
function query() {
  const answer = () => ({ data: [], error: null, count: 0 })
  const wait = () => {
    window.__reads = (window.__reads || 0) + 1
    const ms = window.__readMs || 0
    return ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()
  }
  const q = new Proxy(function () {}, {
    get: (_, k) => (k === "then" ? (resolve, reject) => wait().then(answer).then(resolve, reject) : q),
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
  /* These exact import paths go to these files; everything else resolves as the app's does. */
  const redirect = (map) => ({
    name: "home-probe-redirects",
    setup(b) {
      for (const [spec, file] of Object.entries(map)) {
        const filter = new RegExp(`^${spec.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`)
        b.onResolve({ filter }, () => ({ path: file }))
      }
    },
  })
  try {
    await build({
      entryPoints: [join(root, "scripts/render-home-banner.tsx")],
      bundle: true,
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      logLevel: "error",
      outfile: join(dir, "probe.js"),
      define: {
        "process.env.NODE_ENV": '"production"',
        "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://probe.invalid"',
        "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"probe-anon-key"',
      },
      plugins: [redirect({
        ...swaps,
        /* A probe's own replacements for single modules (scripts/check-metric-tabs-gesture.mjs). */
        ...extra,
        "next/navigation": join(dir, "navigation.js"),
        "next/link": join(dir, "link.jsx"),
        "next/image": join(dir, "image.jsx"),
        "@/lib/supabase/client": join(dir, "supabase.js"),
      })],
      alias: { "@": root },
      loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    })
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    for (const d of oldDirs) rmSync(d, { recursive: true, force: true })
    throw new Error(`the Home probe did not bundle: ${e?.message ?? e}`)
  }
  for (const d of oldDirs) rmSync(d, { recursive: true, force: true })
  const script = readFileSync(join(dir, "probe.js"), "utf8")
  rmSync(dir, { recursive: true, force: true })

  /* The frame the app draws around a page: app/(storelib)/app/layout.tsx. */
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
  /*
    SWIPER'S OWN TWO STYLESHEETS, which the banner imports and this bundle
    drops (the .css loader is "empty" here, because a probe takes its CSS
    from the build or from globals.css, not from the JavaScript). They are
    put AFTER the app's, the worse order for the banner: its own rules have
    to win on specificity rather than on order, which is what they are
    written to do.
  */
  const swiperCss = ["swiper.css", "modules/effect-fade.css"]
    .map((f) => readFileSync(join(root, "node_modules/swiper", f), "utf8"))
    .join("\n")
  const html = `<!doctype html><html class="light app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${faces}</style><style>${await appCss(root)}</style><style>${swiperCss}</style><style>${shell}</style>` +
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
