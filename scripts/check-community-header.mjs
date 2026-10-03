/**
 * ===========================================================================
 *  THE SEARCH STRIP DOES NOT LIE OVER A COMMUNITY
 * ===========================================================================
 * Reported from a phone: on a community page a "Search for anything" bar sat
 * under the header, on top of the community's own row of spaces. The strip is
 * `fixed` at the foot of the header (z 35); the community's nav is `sticky`
 * at the same offset (z 20, --community-top), so one covered the other and
 * the nav could not be read or tapped.
 *
 * The real header and the real community frame are drawn together
 * (scripts/render-community-header.tsx) and this checks, at phone widths:
 *
 *   on a community   no strip at all, and a tap on the community's nav row
 *                    lands on the nav
 *   on Explore       the strip is still there, which is where it belongs
 *
 * Pictures go to .community-header-probe/ for the eye.
 *
 *   node scripts/check-community-header.mjs
 */
import { build } from "esbuild"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
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
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".community-header-probe")
mkdirSync(stubs, { recursive: true })

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
  "next/image": `import React from "react"
const PUBLIC = ${JSON.stringify("file://" + join(root, "public"))}
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, className, style, ...rest }) {
  const url = typeof src === "string" ? (src.startsWith("/") ? PUBLIC + src : src) : ""
  return React.createElement("img", { src: url, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}`,
  "supabase-client": `const USER = { id: "u-me", email: "sam@example.com", user_metadata: {} }
const rowFor = (table) => {
  if (table === "profiles") return { display_name: "Sam Carter", avatar_url: null, username: "samc", is_creator: false }
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
      getUser: async () => ({ data: { user: USER }, error: null }),
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

await build({
  entryPoints: [join(root, "scripts/render-community-header.tsx")],
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
}).catch((e) => fail(`The probe did not bundle: ${e.message}`))

const js = readFileSync(join(stubs, "app.js"), "utf8")
writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const shots = join(root, ".community-header-probe/shots")
mkdirSync(shots, { recursive: true })

/* Every community address: the public page, about, join, and the member area. */
const COMMUNITY = [
  "/community/studio-notes",
  "/community/studio-notes/about",
  "/community/studio-notes/join",
  "/community/studio-notes/space/general",
  "/community/studio-notes/members",
  "/community/studio-notes/classroom",
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] })
async function open(width, path) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await p.goto(`file://${join(stubs, "index.html")}#path=${encodeURIComponent(path)}`)
  await p.evaluate(() => document.fonts.ready)
  await sleep(800)
  if (errors.length) fail(`The page threw (${path}): ${errors[0]}`)
  return p
}

const READ = `(() => {
  const strip = document.querySelector("[data-header-search-strip]")
  const pills = document.querySelector("[data-community-pills]")
  const seen = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" }
  let onPills = null
  if (seen(pills)) {
    const r = pills.getBoundingClientRect()
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    onPills = !!hit && pills.contains(hit)
  }
  return {
    strip: seen(strip),
    stripText: strip ? (strip.querySelector("input")?.placeholder ?? null) : null,
    pills: seen(pills),
    onPills,
    anySearch: /Search for anything/.test(document.body.innerText),
  }
})()`

try {
  for (const width of [390, 430]) {
    console.log(`\nAt ${width}px`)
    for (const path of COMMUNITY) {
      const p = await open(width, path)
      /* Scrolled down too: the strip only appears once the page's own search is past. */
      await p.evaluate(() => window.scrollTo(0, 600))
      await sleep(400)
      const got = await p.evaluate(READ)
      expect(got.strip === false, `${path}: no search bar under the header`, got.stripText)
      if (got.pills) expect(got.onPills === true, `${path}: the community's own nav takes the tap`, got)
      await p.screenshot({ path: join(shots, `${path.replace(/\//g, "_")}-${width}.png`) })
      await p.close()
    }
  }

  /* The control: it is still the way into search everywhere it belongs. */
  console.log("\nThe control")
  const p = await open(390, "/explore")
  await p.evaluate(() => window.scrollTo(0, 600))
  await sleep(500)
  const got = await p.evaluate(READ)
  expect(got.strip === true, "explore still has the search bar under the header", got.stripText)
  await p.screenshot({ path: join(shots, "explore-390.png") })
  await p.close()
} finally {
  await browser.close()
}

console.log(`\n  pictures in .community-header-probe/shots/`)
if (broken) fail(`${broken} wrong.`)
console.log("\n  all good.")
