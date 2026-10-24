/**
 * A stub of the OnePage's server for scripts/check-onepage-audit.mjs: one row,
 * kept between requests the way the real routes keep it, so a probe can edit
 * in the editor, save, reload, and open the live page from what was saved.
 *
 *   GET  /api/onepage           { onepage }                      app/api/onepage GET
 *   PUT  /api/onepage           merge a save into the row          app/api/onepage PUT
 *                               (settings merged; the photo is the profile's, never the browser's)
 *   POST /api/onepage/publish   the published copy, from what was sent   app/api/onepage/publish
 *   GET  /__state               the row, the owner, the currency, the catalogue (the harness reads it)
 *   POST /__state               replace any of those (a probe sets a page up)
 *
 * Every other /api answer is "{}", as the editor probes have it.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { appCss, interFaces } from "./probe-css.mjs"

export async function serveAuditProbe({ root = process.cwd(), state, fail = (m) => { throw new Error(m) } }) {
  const dir = join(root, `.onepage-audit-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
  /* Products from the catalogue the server holds, the owner's profile for a read of profiles, onboarding done for anything else. */
  writeFileSync(join(dir, "supabase.js"), `const answer = (data) => { const r = { data, error: null }; const p = new Proxy(function () {}, { get: (_, k) => k === "then" ? (res) => res(r) : p, apply: () => p }); return p }
const other = answer(Object.assign([], { onboarding_completed: true }))
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: (table) => table === "products" ? answer(globalThis.PROBE_PRODUCTS || []) : table === "profiles" ? answer({ display_name: globalThis.PROBE_OWNER?.displayName ?? null, avatar_url: globalThis.PROBE_OWNER?.avatarUrl ?? null }) : other, storage: { from: () => other }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
  try {
    execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-onepage-audit.tsx"),
      "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
      '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
      `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
      `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
      { stdio: ["ignore", "ignore", "inherit"] })
  } catch {
    rmSync(dir, { recursive: true, force: true })
    fail("the audit probe did not bundle")
  }
  const css = await appCss(root)
  const bundle = readFileSync(join(dir, "probe.js"), "utf8")
  rmSync(dir, { recursive: true, force: true })
  const html = () => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
    `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.PROBE_OWNER=${JSON.stringify(state.owner)}</script><script>${bundle}</script></body></html>`

  const requests = []
  const body = (req) => new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => { try { r(JSON.parse(s || "null")) } catch { r(null) } }) })
  const server = createServer(async (req, res) => {
    const path = req.url.split("?")[0]
    if (path === "/" || path.startsWith("/app") || path.startsWith("/onepage-preview") || path.startsWith("/live")) {
      res.writeHead(200, { "content-type": "text/html" })
      return res.end(html())
    }
    res.writeHead(200, { "content-type": "application/json" })
    if (path === "/__state") {
      if (req.method === "POST") Object.assign(state, await body(req))
      return res.end(JSON.stringify(state))
    }
    if (path === "/api/onepage" && req.method === "GET") return res.end(JSON.stringify({ onepage: state.onepage }))
    if (path === "/api/onepage" && req.method === "PUT") {
      const b = (await body(req)) || {}
      requests.push({ path, method: "PUT", body: b })
      const row = state.onepage
      for (const k of ["title", "bio", "avatar_video_url", "theme", "social_links", "draft_blocks", "slug", "archived_blocks", "share_image_mode"]) if (b[k] !== undefined) row[k] = b[k]
      if (b.avatar_url !== undefined) row.avatar_url = state.owner.avatarUrl
      if (b.settings !== undefined || b.avatar_video_crop !== undefined) row.settings = { ...(row.settings || {}), ...(b.settings || {}), avatar_video_crop: b.avatar_video_crop ?? b.settings?.avatar_video_crop ?? row.settings?.avatar_video_crop ?? null }
      return res.end(JSON.stringify({ onepage: row }))
    }
    if (path === "/api/onepage/publish") {
      const b = (await body(req)) || {}
      requests.push({ path, method: "POST", body: b })
      const row = state.onepage
      const now = new Date().toISOString()
      Object.assign(row, {
        status: "published",
        published_at: now,
        published_blocks: b.draft_blocks,
        published_theme: b.theme,
        published_profile: { title: b.title || "", bio: b.bio || "", avatar_url: state.owner.avatarUrl, avatar_video_url: b.avatar_video_url || null, avatar_video_crop: b.avatar_video_crop || null },
        published_social_links: b.social_links || {},
        avatar_url: state.owner.avatarUrl,
      })
      return res.end(JSON.stringify({ success: true, published_at: now, onepage: row }))
    }
    if (path.startsWith("/api/store/currency")) return res.end(JSON.stringify({ currency: state.currency }))
    if (path.startsWith("/api/billing/subscription")) return res.end(JSON.stringify({ currentPlan: { id: "pro" } }))
    if (path.startsWith("/api/onepage/stats")) return res.end(JSON.stringify({ total_views: 0, total_clicks: 0, chart_data: [] }))
    res.end("{}")
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { base: `http://127.0.0.1:${server.address().port}`, server, state, requests }
}
