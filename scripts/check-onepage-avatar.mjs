/**
 * ===========================================================================
 *  THE ONEPAGE'S PICTURE, ITS HEADER AND ITS CANVAS, BEFORE AND AFTER
 * ===========================================================================
 * "In the preview and in the live, it doesn't display the photo avatar that
 * I uploaded there." "When there's no profile picture uploaded it moves the
 * profile avatar area up and it's close to the top bar." And, on a dark
 * page scrolled to the end, a band of white under the footer.
 *
 * Three versions are drawn from the same rows:
 *
 *   v360    before #361: lib/onepage/public-shape at 3d763cc9~1
 *   v361    #361 as it went live: public-shape and lib/account/identity at
 *           3d763cc9
 *   now     this tree
 *
 * and the page component itself twice: as it was live at 3d763cc9 and as it
 * is in this tree. Measured:
 *
 *   MATRIX  for every mix of a draft photo, a published photo and a profile
 *           photo, which picture the editor's preview and the live page draw
 *           in each version
 *   PAGE    the real /links component at 390 and 1280: which picture the
 *           header draws, where the name sits (from the top of the page) with
 *           and without a picture in the classic and the hero header, and the
 *           colour under the footer on a dark page, with the 34px band an
 *           iPhone adds for its home indicator
 *   PREVIEW the editor's real preview on a phone (the editor's own frame,
 *           /onepage-preview, drawing the page it is posted) with a draft
 *           upload that is not published yet
 *
 * Nothing leaves the machine: pictures are answered by the probe with a
 * labelled square, every other request is refused.
 *
 *   PROBE_CSS=source node scripts/check-onepage-avatar.mjs
 *   SHOTS_DIR=/some/dir   where the pictures go (prefix avatar-)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const shots = process.env.SHOTS_DIR || join(tmpdir(), "storelib-onepage-avatar-shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── The versions, written beside the tree for one bundle ─────────────────── */
const work = join(root, ".onepage-avatar-probe")
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })
const git = (spec) => execFileSync("git", ["show", spec], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
writeFileSync(join(work, "shape-v360.ts"), git("3d763cc9~1:lib/onepage/public-shape.ts"))
writeFileSync(join(work, "identity-v361.ts"), git("3d763cc9:lib/account/identity.ts").replace('"./avatar"', '"@/lib/account/avatar"'))
writeFileSync(join(work, "shape-v361.ts"), git("3d763cc9:lib/onepage/public-shape.ts").replace('"@/lib/account/identity"', '"./identity-v361"'))
writeFileSync(join(work, "public-onepage-main.tsx"), git("3d763cc9:components/onepage/public-onepage.tsx"))

writeFileSync(join(work, "navigation.js"), `export const usePathname = () => "/app/onepage"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(work, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
/* The owner's profile answers with a photo of its own, every other read with an empty list. */
writeFileSync(join(work, "supabase.js"), `const empty = { data: Object.assign([], { onboarding_completed: true }), error: null }
const profile = { data: { display_name: "Luca Dragoste", avatar_url: window.PROBE_PROFILE_PHOTO || null }, error: null }
const query = (result) => { const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (ok) => ok(result) : q, apply: () => q }); return q }
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: (t) => query(t === "profiles" ? profile : empty), storage: { from: () => query(empty) }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)

writeFileSync(join(work, "entry.tsx"), `import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { PublicOnePage as PublicOnePageMain } from "./public-onepage-main"
import { OnePageProvider } from "@/lib/onepage/context"
import * as Preview from "@/components/onepage/phone-preview"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { defaultTheme, defaultSettings } from "@/lib/onepage/types"
import * as now from "@/lib/onepage/public-shape"
import * as v361 from "./shape-v361"
import * as v360 from "./shape-v360"

const SHAPES: Record<string, any> = { now, v361, v360 }
const P = (window as any).PROBE
const params = new URLSearchParams(location.search)

/* Every mix, through every version: what the preview and the live page draw. */
;(window as any).__MATRIX = (P.matrix as any[]).map((m) => {
  const row = { ...P.row, avatar_url: m.draft, published_profile: { title: "Luca Dragoste", bio: "", avatar_url: m.published } }
  const out: Record<string, unknown> = { ...m }
  for (const [name, shape] of Object.entries(SHAPES)) {
    out[name + "_preview"] = shape.publicOnePageFromDraft(row as any, name === "now" ? { liveAvatarUrl: m.profile } : {}).avatar_url
    out[name + "_live"] = shape.publicOnePage(row as any, { source: "published", displayName: "Luca Dragoste", liveAvatarUrl: m.profile }).avatar_url
  }
  return out
})

const root = createRoot(document.getElementById("app")!)
if (location.pathname.startsWith("/onepage-preview")) {
  root.render(<OnePagePreviewDocument />)
} else if (params.get("view") === "editor") {
  const Mobile = (Preview as any).MobilePreviewContent as React.ComponentType
  root.render(
    <OnePageProvider initialOnePage={{ ...P.row, owner_id: "probe-user", theme: { ...defaultTheme, ...P.row.theme }, settings: { ...defaultSettings, ...P.row.settings }, status: "published", created_at: "", updated_at: "", onboarding_completed: true } as any}>
      <div className="flex flex-col" style={{ position: "fixed", inset: 0 }}><Mobile /></div>
    </OnePageProvider>,
  )
} else if (params.get("view") === "live") {
  const version = params.get("version") || "now"
  const row = { ...P.row, ...(P.scenario || {}) }
  const page = SHAPES[version].publicOnePage(row, { source: "published", displayName: "Luca Dragoste", liveAvatarUrl: P.profilePhoto })
  const Page = version === "now" ? PublicOnePage : PublicOnePageMain
  root.render(<Page onepage={page as any} />)
}
`)

try {
execFileSync("pnpm", ["exec", "esbuild", join(work, "entry.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(work, "probe.js")}`,
  '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  `--alias:next/navigation=${join(work, "navigation.js")}`, `--alias:next/link=${join(work, "link.jsx")}`, `--alias:next/image=${join(work, "image.jsx")}`,
  `--alias:@/lib/supabase/client=${join(work, "supabase.js")}`,
  `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} catch {
  rmSync(work, { recursive: true, force: true })
  console.error("the probe did not bundle")
  process.exit(1)
}
const bundle = readFileSync(join(work, "probe.js"), "utf8")
const css = await appCss(root)
rmSync(work, { recursive: true, force: true })

/* ── The rows ─────────────────────────────────────────────────────────────── */
const ST = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public"
const PIC = {
  LD: `${ST}/onepage-assets/u1/avatar-1789991372145.png`,
  NEW: `${ST}/onepage-assets/u1/avatar-1790500000000.png`,
  PROFILE: `${ST}/avatars/u1/avatar-1800000000000.jpg`,
  GOOGLE: "https://lh3.googleusercontent.com/a/ACg8ocK-old-face=s96-c",
  PHOTOS: "https://lh3.googleusercontent.com/pw/AP1Gcz-chosen=w800",
}
const LABEL = Object.fromEntries(Object.entries(PIC).map(([k, v]) => [v, k]))
const HUE = { LD: 220, NEW: 140, PROFILE: 30, GOOGLE: 0, PHOTOS: 280 }
const square = (label) => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${HUE[label]},60%,45%)"/><text x="200" y="245" font-size="130" font-family="Arial" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`

const GREEN = "#0f3d2e"
const block = (id, type, data, sort_order) => ({ id, type, enabled: true, sort_order, data })
const BLOCKS = [
  block("header", "header", { show_avatar: true, show_name: true, show_bio: true }, 0),
  block("l1", "link_button", { label: "My Link", url: "https://example.com" }, 1),
  block("l2", "link_button", { label: "Templates", url: "https://example.com/t" }, 2),
  block("l3", "link_button", { label: "Newsletter", url: "https://example.com/n" }, 3),
]
const ROW = {
  id: "page-1", slug: "lucadragoste", title: "Luca Dragoste", bio: "Notion templates", avatar_url: PIC.LD, avatar_video_url: null,
  theme: { background_type: "solid", background_color: GREEN, text_color: "#ffffff", secondary_text_color: "#cfe3da", button_color: "#ffffff", button_text_color: "#0f3d2e", header_layout: "classic", font_family: "Inter", button_style: "filled" },
  settings: { show_branding: true, subscribe_enabled: true, share_enabled: true, analytics_enabled: false, seo_title: "Zarra Bianco" },
  social_links: {}, draft_blocks: BLOCKS, published_blocks: BLOCKS, published_theme: null,
  published_profile: { title: "Luca Dragoste", bio: "Notion templates", avatar_url: PIC.LD }, seller_id: "seller-1",
}
const MATRIX = []
for (const draft of [PIC.LD, PIC.NEW, PIC.GOOGLE, PIC.PHOTOS, null])
  for (const published of [PIC.LD, PIC.GOOGLE, null])
    for (const profile of [PIC.PROFILE, null]) MATRIX.push({ draft, published, profile })

function html(probe) {
  return `<!doctype html><html lang="en" class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`
    + `<style>${interFaces(root)}</style><style>${css}</style>`
    /* What env(safe-area-inset-bottom) is on an iPhone with a home indicator; a desktop browser reads 0. */
    + (probe.iphoneBand ? `<style>body{padding-bottom:34px!important}</style>` : "")
    + `<style>*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important}</style>`
    + `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.PROBE=${JSON.stringify(probe)};window.PROBE_PROFILE_PHOTO=${JSON.stringify(probe.profilePhoto ?? null)};</script><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
}

let current = { row: ROW, matrix: MATRIX, profilePhoto: PIC.PROFILE }
const server = createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/app") || req.url.startsWith("/onepage-preview")) {
    res.writeHead(200, { "content-type": "text/html" })
    return res.end(html(current))
  }
  res.writeHead(200, { "content-type": "application/json" })
  res.end("{}")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
async function open(vp, path) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url().split("?")[0]
    const label = LABEL[url] || LABEL[r.url()]
    if (label) return r.respond({ status: 200, contentType: "image/svg+xml", body: square(label) })
    if (r.url().startsWith(base) || r.url().startsWith("data:") || r.url().startsWith("blob:")) return r.continue()
    return r.abort()
  })
  await p.goto(`${base}${path}`, { waitUntil: "load" })
  await sleep(700)
  return p
}
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1280, height: 900 }

/** What the header draws: the picture's label, or "initial" for the letter in the circle. */
const drawnAvatar = (p) => p.evaluate((labels) => {
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
  const live = [...document.querySelectorAll(".onepage-live")].find(visible) || document
  const img = [...live.querySelectorAll("img")].find((i) => visible(i) && i.complete && i.naturalWidth > 0 && (labels[i.currentSrc.split("?")[0]] || labels[i.src]))
  return img ? labels[img.currentSrc.split("?")[0]] || labels[img.src] : "initial"
}, LABEL)
const nameTop = (p) => p.evaluate(() => {
  const visible = (el) => !!el && el.getClientRects().length > 0
  const live = [...document.querySelectorAll(".onepage-live")].find(visible)
  const h = [...live.querySelectorAll("h1")].find(visible)
  return h ? Math.round(h.getBoundingClientRect().top + scrollY) : null
})
/** The average colour of a strip of the screen, read from a screenshot. */
async function stripColour(p, y, height, width) {
  const png = await p.screenshot({ clip: { x: 0, y, width, height }, encoding: "base64" })
  const probe = await browser.newPage()
  const rgb = await probe.evaluate(async (src) => {
    const img = new Image()
    img.src = `data:image/png;base64,${src}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let r = 0, gg = 0, b = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2] }
    const n = d.length / 4
    return [Math.round(r / n), Math.round(gg / n), Math.round(b / n)]
  }, png)
  await probe.close()
  return rgb
}

/* ── 1. The matrix ────────────────────────────────────────────────────────── */
console.log("\nWhich picture each version draws (preview / live)")
{
  const p = await open(DESK, "/app/blank")
  const rows = await p.evaluate(() => window.__MATRIX)
  await p.close()
  const L = (v) => (v ? LABEL[v] || v : "none")
  const pad = (s, n) => String(s).padEnd(n)
  console.log(`  ${pad("draft", 8)}${pad("published", 11)}${pad("profile", 9)}${pad("v360 preview/live", 20)}${pad("v361 preview/live", 20)}now preview/live`)
  let hidden361 = 0
  for (const r of rows) {
    const cell = (v) => `${L(r[`${v}_preview`])}/${L(r[`${v}_live`])}`
    const flag = r.v361_preview !== r.v360_preview || r.v361_live !== r.v360_live ? "  <- #361 changed this" : ""
    console.log(`  ${pad(L(r.draft), 8)}${pad(L(r.published), 11)}${pad(L(r.profile), 9)}${pad(cell("v360"), 20)}${pad(cell("v361"), 20)}${cell("now")}${flag}`)
    if (r.draft && r.v361_preview === null && r.v360_preview) hidden361++
  }
  const ownUpload = rows.filter((r) => r.draft === PIC.LD || r.draft === PIC.NEW)
  expect(ownUpload.every((r) => r.now_preview === r.draft), "now: a page upload in the draft is what the preview draws, every time")
  expect(rows.filter((r) => r.published === PIC.LD).every((r) => r.now_live === PIC.LD), "now: a published page upload is what the live page draws, every time")
  expect(rows.filter((r) => r.draft === PIC.PHOTOS).every((r) => r.now_preview === PIC.PHOTOS), "now: a Google Photos picture somebody chose is drawn", rows.filter((r) => r.draft === PIC.PHOTOS).map((r) => L(r.now_preview)))
  expect(rows.every((r) => r.now_live !== PIC.GOOGLE && r.now_preview !== PIC.GOOGLE), "now: the picture Google sent at sign in is never drawn from a copy")
  expect(rows.filter((r) => !r.draft && !r.published).every((r) => r.now_preview === r.now_live), "now: a page with no picture draws the same in the preview as live")
  console.log(`  (#361 left the preview empty where #360 drew a picture in ${hidden361} of ${rows.length} mixes)`)
}

/* ── 2. The live page: its picture, its header, its canvas ────────────────── */
for (const [label, vp] of [["390", PHONE], ["1280", DESK]]) {
  console.log(`\nThe live page at ${label}`)
  const width = vp.width
  for (const version of ["v360", "now"]) {
    const tag = version === "v360" ? "before" : "after"
    current = { row: ROW, matrix: [], profilePhoto: PIC.PROFILE, scenario: {} }
    let p = await open(vp, `/app?view=live&version=${version}`)
    const pic = await drawnAvatar(p)
    expect(pic === "LD", `${tag}: the uploaded OnePage photo is drawn`, pic)
    await p.screenshot({ path: join(shots, `avatar-live-${label}-${tag}.png`) })
    await p.close()

    for (const layout of ["classic", "hero"]) {
      const tops = {}
      for (const withPic of [true, false]) {
        current = {
          row: { ...ROW, theme: { ...ROW.theme, header_layout: layout } },
          matrix: [], profilePhoto: null,
          scenario: withPic ? {} : { avatar_url: null, published_profile: { ...ROW.published_profile, avatar_url: null } },
        }
        p = await open(vp, `/app?view=live&version=${version}`)
        tops[withPic ? "with" : "without"] = await nameTop(p)
        tops[`${withPic ? "with" : "without"}Pic`] = await drawnAvatar(p)
        await p.screenshot({ path: join(shots, `avatar-header-${layout}-${withPic ? "photo" : "nophoto"}-${label}-${tag}.png`) })
        await p.close()
      }
      console.log(`  ${tag} ${layout}: name at ${tops.with}px with a photo, ${tops.without}px without`)
      if (version === "now") {
        if (layout === "classic") expect(tops.with === tops.without, `${tag} ${layout}: the name sits at the same height with or without a photo`, tops)
        else {
          /* A hero without a photo is the classic header: it must sit where the classic one does, not higher. */
          const classic = await (async () => {
            current = { row: { ...ROW, theme: { ...ROW.theme, header_layout: "classic" } }, matrix: [], profilePhoto: null, scenario: { avatar_url: null, published_profile: { ...ROW.published_profile, avatar_url: null } } }
            const q = await open(vp, `/app?view=live&version=now`)
            const t = await nameTop(q)
            await q.close()
            return t
          })()
          expect(tops.without === classic, `${tag} hero with no photo: the name sits where the classic header puts it (${classic}px)`, tops.without)
        }
      }
    }

    /* The canvas, scrolled to the end of a dark page, with an iPhone's home indicator band. */
    current = { row: ROW, matrix: [], profilePhoto: PIC.PROFILE, scenario: {}, iphoneBand: true }
    p = await open(vp, `/app?view=live&version=${version}`)
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await sleep(200)
    /* The clip is in the document's coordinates: the last 30px of the screen once scrolled to the end. */
    const geo = await p.evaluate(() => ({
      y: Math.round(scrollY + innerHeight - 30),
      band: getComputedStyle(document.body).paddingBottom,
      end: document.documentElement.scrollHeight,
      page: Math.round(([...document.querySelectorAll(".onepage-live")].find((e) => e.getClientRects().length > 0)?.getBoundingClientRect().bottom ?? 0) + scrollY),
    }))
    const bottom = await stripColour(p, geo.y, 30, width)
    const canvas = await p.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor])
    await p.screenshot({ path: join(shots, `avatar-canvas-${label}-${tag}.png`) })
    await p.close()
    const white = bottom.every((c) => c > 230)
    console.log(`  ${tag}: page box ends at ${geo.page}px, document at ${geo.end}px (body band ${geo.band}); bottom 30px of the screen averages rgb(${bottom.join(",")}); html ${canvas[0]}, body ${canvas[1]}`)
    if (version === "now") {
      expect(!white && Math.abs(bottom[0] - 0x0f) < 12 && Math.abs(bottom[1] - 0x3d) < 12 && Math.abs(bottom[2] - 0x2e) < 12, "after: the band under the footer is the page's green", bottom)
    } else {
      console.log(`  before: ${white ? "WHITE band under the footer" : "no white band"}`)
    }
  }
}

/* ── 3. The editor's real preview ─────────────────────────────────────────── */
console.log("\nThe editor's preview on a phone, with an upload not yet published")
{
  current = { row: { ...ROW, avatar_url: PIC.NEW }, matrix: [], profilePhoto: PIC.PROFILE }
  const p = await open(PHONE, "/app/onepage?view=editor")
  await sleep(1500)
  const frame = p.frames().find((f) => f.url().includes("/onepage-preview"))
  expect(!!frame, "the preview frame loaded")
  if (frame) {
    const pic = await frame.evaluate((labels) => {
      const visible = (el) => !!el && el.getClientRects().length > 0
      const live = [...document.querySelectorAll(".onepage-live")].find(visible) || document
      const img = [...live.querySelectorAll("img")].find((i) => visible(i) && i.naturalWidth > 0 && labels[i.src.split("?")[0]])
      return img ? labels[img.src.split("?")[0]] : "initial"
    }, LABEL)
    expect(pic === "NEW", "the preview draws the new upload before it is published", pic)
    const canvas = await frame.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor])
    expect(canvas.every((c) => c === "rgb(15, 61, 46)"), "the preview's own document is painted in the page's colour", canvas)
  }
  await p.screenshot({ path: join(shots, "avatar-preview-390-after.png") })
  await p.close()

  current = { row: { ...ROW, avatar_url: null, published_profile: { ...ROW.published_profile, avatar_url: null } }, matrix: [], profilePhoto: PIC.PROFILE }
  const q = await open(PHONE, "/app/onepage?view=editor")
  await sleep(1500)
  const f2 = q.frames().find((f) => f.url().includes("/onepage-preview"))
  if (f2) {
    const pic = await f2.evaluate((labels) => {
      const visible = (el) => !!el && el.getClientRects().length > 0
      const live = [...document.querySelectorAll(".onepage-live")].find(visible) || document
      const img = [...live.querySelectorAll("img")].find((i) => visible(i) && i.naturalWidth > 0 && labels[i.src.split("?")[0]])
      return img ? labels[img.src.split("?")[0]] : "initial"
    }, LABEL)
    expect(pic === "PROFILE", "a page with no picture: the preview falls back to the profile photo, as the live page does", pic)
  }
  await q.screenshot({ path: join(shots, "avatar-preview-nophoto-390-after.png") })
  await q.close()
}

await browser.close()
server.close()
console.log(`\nScreenshots: ${shots}`)
if (broken > 0) {
  console.log(`\n${broken} failed`)
  process.exit(1)
}
console.log("\nall ok")
