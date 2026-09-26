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
 *   page.goto(`${base}/app/onepage#links`)   the editor
 *   page.goto(`${base}/app/onepage?live`)    the published page, with `liveTheme`
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { appCss, interFaces } from "./probe-css.mjs"

export async function serveEditorProbe({ root = process.cwd(), blocks = null, theme = {}, liveTheme = null, fail = (m) => { throw new Error(m) } } = {}) {
  const dir = join(root, `.onepage-probe-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/onepage"
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
  writeFileSync(join(dir, "supabase.js"), `const result = { data: { onboarding_completed: true }, error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
  try {
    execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-onepage-editor.tsx"),
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
  const server = createServer((req, res) => {
    if (req.url === "/" || req.url.startsWith("/app")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
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
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { base: `http://127.0.0.1:${server.address().port}`, server }
}
