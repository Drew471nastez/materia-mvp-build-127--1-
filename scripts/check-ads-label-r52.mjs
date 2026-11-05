/**
 * ===========================================================================
 *  ROUND 52: GOOGLE ADS' PURCHASE CONVERSION LABEL ON ITS CARD
 * ===========================================================================
 * The real Integrations page (scripts/render-integrations-y2.tsx, as
 * scripts/check-integrations-r42.mjs renders it), Google Ads opened with its
 * Conversion ID saved, in headless Chromium at 1280x800 and 390x844:
 *
 *   A1  the label field is under the ID field, the same input height, left
 *       edge and width, and the same button height: one visual language
 *   A2  inside the card, no horizontal scroll at phone width
 *   A3  with no ID saved there is no label field, only the ID's
 *   A4  the card's line says what it is for
 *
 *   node scripts/check-ads-label-r52.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".ads-label-r52-probe")
const shots = process.env.SHOTS_DIR || join(root, ".ads-r52-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
const ORIGIN = "https://storelib.com"
let broken = 0
const report = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
let withLabel = true
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function answer(url) {
  const p = new URL(url).pathname
  if (p === "/api/store/integrations/installed") return { installed: [] }
  if (p === "/api/store/integrations") return { tracking: withLabel ? { google_ads: "AW-123456789", google_ads_label: "AbC-D_efG-h12_34-567" } : {}, ready: true, ga: null }
  if (p === "/api/physical/integrations") return { integrations: [] }
  if (p === "/api/store/integrations/marketing") return { marketing: [] }
  if (p === "/api/store/integrations/apps") return { states: { "storelib-reviews": "on", "courier-tracking": "on" }, hrefs: {} }
  if (p === "/api/store/integrations/catalog") return { overrides: [] }
  if (p === "/api/store/reviews-app") return { ready: true, counts: { pending: 0, published: 0, asked: 0 }, settings: { enabled: true } }
  if (p === "/api/store/tracking-app") return { tracking: { platform: { on: true, providerName: "17TRACK", webhooks: true }, ready: true, own: null, following: 0, lastCheckedAt: null } }
  return {}
}

try {
  writeFileSync(join(stubs, "navigation.js"), `import { useMemo, useSyncExternalStore } from "react"
const subs = new Set()
const ping = () => { for (const f of [...subs]) f() }
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
for (const name of ["pushState", "replaceState"]) {
  const orig = history[name].bind(history)
  history[name] = (...a) => { orig(...a); ping() }
}
addEventListener("popstate", () => setTimeout(ping, 0))
export const usePathname = () => useSyncExternalStore(sub, () => location.pathname)
export const useSearchParams = () => { const s = useSyncExternalStore(sub, () => location.search); return useMemo(() => new URLSearchParams(s), [s]) }
const router = { push(href) { history.pushState(null, "", href) }, replace(href) { history.replaceState(null, "", href) }, prefetch() {}, back() { history.back() }, refresh() {} }
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
import { useRouter } from "next/navigation"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) {
  const router = useRouter()
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (e.defaultPrevented) return; e.preventDefault(); router.push(href) } }, children)
})
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) }
  return {
    channel() { const ch = { on() { return ch }, subscribe() { return ch } }; return ch },
    removeChannel() {},
    auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    from() { return q },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  const nav = join(stubs, "navigation.js")
  await build({
    bundle: true,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.ads-label-r52-probe/navigation.js", "next/link": "./.ads-label-r52-probe/link.jsx", "next/image": "./.ads-label-r52-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })); b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: nav })) } }],
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    entryPoints: [join(root, "scripts/render-integrations-y2.tsx")],
    format: "iife",
    outfile: join(stubs, "page.js"),
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  })
  const css = await appCss(root)
  const fonts = interFaces(root)
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const page = (sheet) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  /* Headless Chromium answers (hover: none); a computer with a mouse reads the stylesheet as one (as scripts/check-integrations27.mjs does). */
  const mouseCss = css.replace(/\(hover: hover\) and \(pointer: fine\)/g, "all").replace(/\(hover: hover\)/g, "all").replace(/\(hover: none\)/g, "not all")
  const DESK = { width: 1280, height: 800, deviceScaleFactor: 1 }
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const isPhone = (vp) => vp.width < 768
  const htmlFor = (vp) => (isPhone(vp) ? page(css) : page(mouseCss))
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 240_000 })

  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(answer(url)) }).catch(() => {}), 60)
      if (url.startsWith(`${ORIGIN}/integrations/`)) {
        const file = join(root, "public", decodeURIComponent(new URL(url).pathname))
        const type = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[file.split(".").pop()] ?? "application/octet-stream"
        try {
          return void r.respond({ status: 200, contentType: type, body: readFileSync(file) })
        } catch {
          return void r.respond({ status: 404, body: "" })
        }
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: htmlFor(vp) })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(900)
    return { p, errors }
  }



  for (const vp of [DESK, PHONE]) {
    const tag = vp.width
    console.log(`\nGoogle Ads, ${tag}\n`)
    withLabel = true
    const { p, errors } = await open("/app/integrations", vp)
    await p.click('[data-integration-card="google-ads"]')
    await sleep(900)
    const m = await p.evaluate(() => {
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
      const id = document.querySelector("#tracker-google_ads")
      const label = document.querySelector("#tracker-google_ads_label")
      const btn = (input) => input?.closest("[data-tracker-row]")?.querySelector("button:last-of-type")
      return {
        id: box(id),
        label: box(label),
        labelValue: label?.value ?? null,
        idBtn: box(btn(id)),
        labelBtn: box(btn(label)),
        labelText: label?.closest("[data-ads-label]")?.innerText ?? "",
        about: document.body.innerText,
        scrollW: document.documentElement.scrollWidth,
        innerW: innerWidth,
      }
    })
    report[`A ${tag}`] = { id: m.id, label: m.label, idBtn: m.idBtn, labelBtn: m.labelBtn, scrollW: m.scrollW }
    await p.screenshot({ path: join(shots, `google-ads-${tag}.png`), fullPage: true })
    expect(!!m.id && !!m.label && m.label.y > m.id.y, `A1 ${tag}: the label field is under the ID field`, [m.id, m.label])
    expect(!!m.id && !!m.label && m.label.h === m.id.h && m.label.x === m.id.x && m.label.w === m.id.w, `A1 ${tag}: same input height, left edge and width`, [m.id, m.label])
    expect(!!m.idBtn && !!m.labelBtn && m.idBtn.h === m.labelBtn.h, `A1 ${tag}: same button height`, [m.idBtn, m.labelBtn])
    expect(m.labelValue === "AbC-D_efG-h12_34-567", `A1 ${tag}: the saved label is in its field`, m.labelValue)
    expect(/Purchase conversion label/.test(m.labelText) && /AW-123456789\/ in send_to/.test(m.labelText), `A1 ${tag}: named, and where to find it says send_to`, m.labelText)
    expect(m.scrollW <= m.innerW, `A2 ${tag}: no horizontal scroll`, [m.scrollW, m.innerW])
    expect(/Count your sales as Google Ads conversions\./.test(m.about), `A4 ${tag}: the card says what it is for, in a line`)
    expect(errors.length === 0, `${tag}: no page errors`, errors)
    await p.close()
  }
  withLabel = false
  {
    const { p, errors } = await open("/app/integrations", DESK)
    await p.click('[data-integration-card="google-ads"]')
    await sleep(900)
    const none = await p.evaluate(() => ({ id: !!document.querySelector("#tracker-google_ads"), label: !!document.querySelector("#tracker-google_ads_label") }))
    expect(none.id && !none.label, "A3: with no Conversion ID saved, the ID field alone", none)
    expect(errors.length === 0, "A3: no page errors", errors)
    await p.close()
  }
  writeFileSync(join(shots, "report.json"), JSON.stringify(report, null, 2))
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   (pictures and report.json in ${shots})\n`)
process.exit(broken ? 1 : 0)
