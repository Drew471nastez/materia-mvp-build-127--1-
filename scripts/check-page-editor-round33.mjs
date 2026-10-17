/**
 * ===========================================================================
 *  ROUND 33, MEASURED: THE PAGE EDITOR AND THE ABOUT PAGE
 * ===========================================================================
 * Over the real editor and the real About page (scripts/render-page-editor-round33.tsx) in headless Chromium:
 *
 *   EDITOR   at 1440 and 390: the page drawn in the preview frame at a visitor's width (1440 scaled, or 390), resting on
 *            a part outlines it with an Edit button, pressing a part opens its editor (the side panel from 1024px, the
 *            bottom sheet on a phone), typing changes the page in the frame, the cover drags, a network and @name make
 *            a link icon, the button's style changes the button, Save sends only what changed
 *   ABOUT    at 1440, 1280 and 390: the sheet with the gallery 10% wider than round 32's 772px, the facts in one row
 *            with light grey dividers (no divider at the start of a wrapped line), the overlapping faces, the links as
 *            icons, the rich text drawn as rich text, the creator's button, no Membership with one member, no sideways
 *            scroll
 *   DARK     the About page in the dark look: nothing left light, no dark words on the dark ground
 *
 *   node scripts/check-page-editor-round33.mjs [EDITOR ABOUT DARK]
 *   SHOTS_DIR=dir to keep the pictures (.round33-page-shots by default; delete it before committing)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const stubs = join(root, ".page-editor33-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round33-page-shots")
const ORIGIN = "https://storelib.com"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { useMemo, useSyncExternalStore } from "react"
const listeners = new Set()
let state = { pathname: location.pathname, search: location.search, routed: location.pathname + location.search, v: 0 }
const set = (p) => { state = { ...state, ...p }; listeners.forEach((f) => f()) }
const log = (k, a) => (window.__router ||= []).push([k, a])
const push0 = history.pushState.bind(history)
const replace0 = history.replaceState.bind(history)
history.pushState = (s, u, url) => { push0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
history.replaceState = (s, u, url) => { replace0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
window.__probeRouter = { subscribe: (f) => (listeners.add(f), () => listeners.delete(f)), get: () => state }
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, refresh: () => log("refresh", ""), back: () => history.back(), forward: () => history.forward() }
export const usePathname = () => useSyncExternalStore(window.__probeRouter.subscribe, () => state.pathname, () => state.pathname)
export const useSearchParams = () => { const s = useSyncExternalStore(window.__probeRouter.subscribe, () => state.search, () => state.search); return useMemo(() => new URLSearchParams(s), [s]) }
export const useRouter = () => router
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })\n`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { const ch = { on() { return ch }, subscribe() { return ch } }; return { channel: () => ch, removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }) }, storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }\nexport const isNativePlatform = () => false\n`)
  const css = await appCss(root)
  const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-page-editor-round33.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.page-editor33-probe/navigation.js", "next/link": "./.page-editor33-probe/link.jsx", "next/image": "./.page-editor33-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>${dark}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
  const LAPTOP = { width: 1280, height: 800, deviceScaleFactor: 1 }

  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    const api = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        api.push({ url: url.replace(ORIGIN, ""), method: r.method(), body: r.postData() ?? null })
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, questions: [] }) })
      }
      if (url.startsWith(`${ORIGIN}/_next/image`)) return r.respond({ status: 404, body: "" })
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("about:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(700)
    return { p, errors, api }
  }
  const frameOf = async (p) => (await p.$("iframe[data-page-preview]"))?.contentFrame()
  const shot = (p, name) => p.screenshot({ path: join(shots, `${name}.png`) })
  /* A point on a part inside the frame, in the editor's own coordinates (the frame is scaled): brought into view first. */
  async function pointIn(p, f, sel) {
    const r = await f.evaluate((sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length > 0)
      const r0 = el.getBoundingClientRect()
      scrollTo(0, Math.max(0, scrollY + r0.top - Math.max(80, (innerHeight - r0.height) / 2)))
      const b = el.getBoundingClientRect()
      return { x: b.left + Math.min(b.width / 2, 60), y: b.top + Math.min(b.height / 2, 16) }
    }, sel)
    await sleep(150)
    const fb = await p.evaluate(() => { const fr = document.querySelector("iframe[data-page-preview]"); const b = fr.getBoundingClientRect(); return { x: b.left, y: b.top, s: b.width / fr.offsetWidth } })
    return { x: fb.x + r.x * fb.s, y: fb.y + r.y * fb.s }
  }
  const clickIn = async (p, f, sel) => { const at = await pointIn(p, f, sel); await p.mouse.click(at.x, at.y); await sleep(300) }

  /* ── EDITOR ─────────────────────────────────────────────────────────── */
  if (want("EDITOR")) {
    for (const vp of [DESK, PHONE]) {
      const tag = vp.width
      console.log(`\nEDITOR ${tag}`)
      const { p, errors, api } = await open("/app/community/salajanywood/page", vp)
      const f = await frameOf(p)
      const facts = await p.evaluate(() => {
        const pane = document.querySelector("[data-preview-pane]")
        const fr = document.querySelector("iframe[data-page-preview]")
        const side = document.querySelector("[data-page-side]")
        const b = (el) => (el ? (({ left, top, width, height }) => ({ x: Math.round(left), y: Math.round(top), w: Math.round(width), h: Math.round(height) }))(el.getBoundingClientRect()) : null)
        return { device: pane?.getAttribute("data-preview-pane"), scale: Number(pane?.getAttribute("data-preview-scale")), frameWidth: fr ? fr.offsetWidth : 0, pane: b(pane), side: side && getComputedStyle(side).display !== "none" ? b(side) : null, scroll: document.documentElement.scrollWidth - innerWidth }
      })
      const inner = f ? await f.evaluate(() => ({ width: innerWidth, sheet: !!document.querySelector("[data-community-sheet]"), name: document.querySelector("h1[data-page-block=name]")?.textContent, blocks: [...new Set([...document.querySelectorAll("[data-page-block]")].filter((e) => e.getClientRects().length).map((e) => e.getAttribute("data-page-block")))], styles: document.head.querySelectorAll("style").length })) : null
      expect(!!inner?.sheet, `${tag}: the real About page is drawn inside the preview frame`, inner && { styles: inner.styles })
      expect(inner?.width === (tag === 1440 ? 1440 : 390), `${tag}: the frame is a visitor's screen, ${tag === 1440 ? 1440 : 390}px wide, scaled to the pane`, { inner: inner?.width, scale: facts.scale, device: facts.device })
      expect(facts.scroll <= 0, `${tag}: no sideways scroll`, facts.scroll)
      if (tag === 1440) expect(!!facts.side && facts.side.w >= 360, `${tag}: the panel beside the page`, facts.side)
      const want10 = ["cover", "gallery", "logo", "name", "tagline", "description", "links", "benefits", "join", "faq"]
      const seen = new Set(inner?.blocks ?? [])
      expect(want10.filter((b) => b !== "cover" || tag === 1440).every((b) => seen.has(b)), `${tag}: every part can be picked in the frame`, inner?.blocks)
      await shot(p, `editor-${tag}`)

      if (f && tag === 1440) {
        /* Resting on the name: an outline and an Edit button. */
        const at = await pointIn(p, f, "h1[data-page-block=name]")
        await p.mouse.move(at.x, at.y)
        await sleep(250)
        const hover = await f.evaluate(() => ({ outline: !!document.querySelector("[data-hotspot=name][data-hotspot-state=hover]"), chip: !!document.querySelector("[data-edit-chip=name]") }))
        expect(hover.outline && hover.chip, `${tag}: resting on the name outlines it and shows Edit`, hover)
        await shot(p, `editor-${tag}-hover`)
        /* Pressing it opens the name's editor in the side panel. */
        await p.mouse.click(at.x, at.y)
        await sleep(300)
        const panel = await p.evaluate(() => document.querySelector("[data-page-side] [data-page-panel]")?.getAttribute("data-page-panel"))
        expect(panel === "name", `${tag}: pressing the name opens its editor in the side panel`, panel)
        const sel = await f.evaluate(() => !!document.querySelector("[data-hotspot=name][data-hotspot-state=selected]"))
        expect(sel, `${tag}: the part being edited keeps its outline`)
        /* Typing: the page in the frame changes as it is typed. */
        await p.evaluate(() => { const i = document.querySelector("#pe-name"); i.focus(); i.select() })
        await p.keyboard.type("Oak and Ash Club")
        await sleep(200)
        const live = await f.evaluate(() => [document.querySelector("h1[data-page-block=name]")?.textContent, document.querySelector("[data-join-card] [data-page-block=name]")?.textContent])
        expect(live[0] === "Oak and Ash Club" && live[1] === "Oak and Ash Club", `${tag}: the new name is on the page at once, in the sheet and the side card`, live)

        /* The description: the product editor's rich text field. */
        await clickIn(p, f, "[data-community-description]")
        const rich = await p.evaluate(() => ({ panel: document.querySelector("[data-page-side] [data-page-panel]")?.getAttribute("data-page-panel"), editable: !!document.querySelector("[data-page-side] [contenteditable=true]"), tools: document.querySelectorAll("[data-page-side] [contenteditable=true]")?.length }))
        expect(rich.panel === "description" && rich.editable, `${tag}: the description opens the rich text editor`, rich)
        await p.click("[data-page-side] [contenteditable=true]")
        await p.keyboard.press("End")
        await p.keyboard.type(" Every level welcome.")
        await sleep(250)
        const descLive = await f.evaluate(() => document.querySelector("[data-community-description]")?.textContent?.includes("Every level welcome."))
        expect(descLive, `${tag}: what is typed in the description is on the page`)

        /* The cover: the side card's cover opens the cover editor, and dragging moves what stays in view. */
        await clickIn(p, f, "[data-join-card-cover]")
        const before = await f.evaluate(() => getComputedStyle(document.querySelector("[data-join-card-cover] img")).objectPosition)
        const frameBox = await (await p.$("[data-cover-focus-frame]")).boundingBox()
        await p.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2)
        await p.mouse.down()
        await p.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2 + 40, { steps: 6 })
        await p.mouse.up()
        await sleep(200)
        const after = await f.evaluate(() => getComputedStyle(document.querySelector("[data-join-card-cover] img")).objectPosition)
        const shownValue = await p.evaluate(() => document.querySelector("[data-cover-focus-value]")?.textContent)
        expect(before !== after, `${tag}: dragging the cover down moves what the side card shows`, { before, after, shownValue })
        await shot(p, `editor-${tag}-cover`)

        /* Links: TikTok and @woodclub make a TikTok icon to https://www.tiktok.com/@woodclub. */
        await clickIn(p, f, "[data-page-block=links]")
        await p.click("[data-link-network=tiktok]")
        await sleep(100)
        await p.keyboard.type("@woodclub")
        await sleep(250)
        const link = await f.evaluate(() => document.querySelector("[data-community-link=tiktok]")?.getAttribute("href"))
        expect(link === "https://www.tiktok.com/@woodclub", `${tag}: picking TikTok and typing @woodclub puts a TikTok icon on the page`, link)
        await p.click("[data-link-network=instagram]")
        await p.keyboard.type("tiktok.com/@wrong")
        await p.click("[data-page-side] h2")
        await sleep(200)
        const wrong = await p.evaluate(() => document.querySelector("[data-link-error]")?.textContent)
        expect(!!wrong && /TikTok/.test(wrong), `${tag}: a TikTok address under Instagram says so`, wrong)
        await p.click("[data-link-row=instagram]:last-child button[aria-label]")
        await sleep(100)

        /* The join button: Outline, with the line under it. */
        await clickIn(p, f, "[data-join-card] [data-page-block=join]")
        await p.click("[data-join-style-option=outline]")
        await sleep(200)
        const btn = await f.evaluate(() => {
          const b = document.querySelector("[data-join-card] [data-join-style]")
          const cs = getComputedStyle(b)
          return { style: b.getAttribute("data-join-style"), bg: cs.backgroundColor, color: cs.color, label: b.textContent.trim(), note: document.querySelector("[data-join-card] [data-join-note]")?.textContent }
        })
        expect(btn.style === "outline" && btn.bg === "rgb(255, 255, 255)" && btn.label === "Join for free" && btn.note === "No card needed", `${tag}: the button takes the creator's words, the outline style and the line under it`, btn)
        await shot(p, `editor-${tag}-join`)

        /* Save sends only what changed. */
        await p.click("[data-page-save-button]")
        await sleep(400)
        const patch = api.find((a) => a.method === "PATCH")
        if (!patch) console.log("    (save)", await p.evaluate(() => [document.querySelector("[data-page-status]")?.textContent, document.querySelector("[data-page-save-button]")?.disabled]), errors)
        const sent = patch ? Object.keys(JSON.parse(patch.body)).sort() : []
        expect(JSON.stringify(sent) === JSON.stringify(["descriptionHtml", "links", "name", "pageLook"]), `${tag}: Save sends what changed and nothing else`, sent)
        /* Phone toggle: the same page at 390. */
        await p.click('[data-page-toolbar] [role=radio]:nth-child(2)')
        await sleep(400)
        const phone = await f.evaluate(() => ({ w: innerWidth, bar: !!document.querySelector("[data-join-bar]") && getComputedStyle(document.querySelector("[data-join-bar]")).display !== "none" }))
        expect(phone.w === 390 && phone.bar, `${tag}: Phone shows the page at 390 with the phone's join bar in the frame`, phone)
        const leaked = await p.evaluate(() => [...document.body.children].some((c) => c.matches("[data-join-bar]")))
        expect(!leaked, `${tag}: the phone's join bar stays inside the frame, not on the editor`)
        await shot(p, `editor-${tag}-phone`)
      }

      if (f && tag === 390) {
        expect(facts.device === "phone", `${tag}: a phone opens on the phone's page`, facts.device)
        const chips = await f.evaluate(() => document.querySelectorAll("[data-edit-badge]").length)
        expect(chips >= 3, `${tag}: on a touch screen the parts show a small pencil`, chips)
        const at = await pointIn(p, f, "[data-page-block=tagline]")
        await p.touchscreen.tap(at.x, at.y)
        await sleep(600)
        const sheet = await p.evaluate(() => {
          const s = document.querySelector("[data-page-sheet]")
          const b = s?.getBoundingClientRect()
          return s ? { part: s.getAttribute("data-page-sheet"), top: Math.round(b.top), bottom: Math.round(b.bottom), h: innerHeight } : null
        })
        expect(sheet?.part === "tagline" && sheet.top > 200 && sheet.bottom <= sheet.h + 1, `${tag}: tapping the tagline opens its editor in the bottom sheet, the page still above it`, sheet)
        await p.type("#pe-tagline", " Every Saturday.")
        await sleep(200)
        const live = await f.evaluate(() => document.querySelector("[data-page-block=tagline]")?.textContent)
        expect(/Every Saturday\.$/.test(live || ""), `${tag}: the tagline changes on the page behind the sheet`, live)
        await shot(p, `editor-${tag}-sheet`)
        await p.click("[data-page-sheet-done]")
        await sleep(600)
        const foot = await p.evaluate(() => document.querySelector("[data-editor-foot]")?.getAttribute("data-foot"))
        expect(foot === "up", `${tag}: the save bar is up with the change`, foot)
        await shot(p, `editor-${tag}-after`)
      }
      expect(errors.length === 0, `${tag}: no errors`, errors.slice(0, 3))
      await p.close()
    }
  }

  /* ── ABOUT ──────────────────────────────────────────────────────────── */
  const aboutFacts = (p) =>
    p.evaluate(() => {
      const b = (el) => (el ? (({ left, top, width, height, right }) => ({ x: Math.round(left), y: Math.round(top), w: Math.round(width), h: Math.round(height), right: Math.round(right) }))(el.getBoundingClientRect()) : null)
      const row = document.querySelector("[data-about-row]")
      const items = [...document.querySelectorAll("[data-about-row-fact]")]
      const rb = row?.getBoundingClientRect()
      const lineStarts = items.filter((li) => Math.abs(li.getBoundingClientRect().left - (rb.left - 13)) < 1.5)
      const faces = [...document.querySelectorAll("[data-about-faces] > span")].map((s) => b(s))
      const btn = document.querySelector("[data-join-card] [data-join-style]")
      const desc = document.querySelector("[data-community-description]")
      return {
        sheet: b(document.querySelector("[data-community-sheet]")),
        card: b(document.querySelector("[data-join-card]")),
        row: b(row),
        items: items.map((li) => ({ k: li.getAttribute("data-about-row-fact"), y: Math.round(li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2), text: li.textContent.trim(), border: getComputedStyle(li).borderLeftColor })),
        lineStartsClipped: lineStarts.length,
        faces,
        links: [...document.querySelectorAll("[data-community-link]")].map((a) => [a.getAttribute("data-community-link"), a.getAttribute("href"), Math.round(a.getBoundingClientRect().width)]),
        rich: desc ? { h2: desc.querySelectorAll("h2").length, li: desc.querySelectorAll("li").length, img: desc.querySelectorAll("img").length, strong: desc.querySelectorAll("strong").length, a: desc.querySelectorAll("a").length, text: desc.textContent.slice(0, 40) } : null,
        membership: !!document.querySelector("[data-community-membership]"),
        button: btn ? { style: btn.getAttribute("data-join-style"), bg: getComputedStyle(btn).backgroundColor, label: btn.textContent.trim() } : null,
        note: document.querySelector("[data-join-note]")?.textContent ?? null,
        cover: getComputedStyle(document.querySelector("[data-join-card-cover] img") || document.body).objectPosition,
        scroll: document.documentElement.scrollWidth - innerWidth,
      }
    })
  if (want("ABOUT")) {
    for (const vp of [DESK, LAPTOP, PHONE]) {
      const tag = vp.width
      console.log(`\nABOUT ${tag}`)
      const { p, errors } = await open("/community/salajanywood/about", vp)
      const a = await aboutFacts(p)
      if (tag >= 1280) {
        expect(a.sheet && a.sheet.w >= Math.round(772 * 1.1) - 2 && a.sheet.w <= Math.round(772 * 1.1) + 2, `${tag}: the sheet with the gallery is 10% wider than round 32's 772px`, { sheet: a.sheet?.w, target: Math.round(772 * 1.1), card: a.card?.w })
        expect(new Set(a.items.map((i) => i.y)).size === 1, `${tag}: the facts are one row`, a.items.map((i) => i.text))
      }
      /* Changed on purpose (round 26, W4): the admins moved into the info card. */
      expect(a.items.map((i) => i.k).join(",") === "visibility,members,online,price", `${tag}: the row says who it is for, members, online and the price`, a.items.map((i) => i.text))
      const grey = a.items.every((i) => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(i.border); return m && Number(m[1]) > 200 && Number(m[1]) < 240 })
      expect(grey, `${tag}: the dividers are a light grey hairline`, a.items[0]?.border)
      expect(a.lineStartsClipped >= 1, `${tag}: the first fact on each line starts flush, its divider clipped`, a.lineStartsClipped)
      const overlap = a.faces.length === 5 && a.faces.slice(1).every((f, i) => f.x < a.faces[i].right)
      expect(overlap, `${tag}: five faces overlap in front of the member count`, a.faces.map((f) => f.x))
      /* Changed on purpose (round 26, W4): the icons are in the info card (32px discs) from 1280px and with who runs it below; drawn in one place at a time. */
      const shownLinks = a.links.filter((l) => l[2] > 0)
      expect(shownLinks.length === 3 && shownLinks[0][1] === "https://www.instagram.com/salajanywood" && shownLinks.every((l) => l[2] >= 32), `${tag}: the links are icons, 32px or more each, drawn once`, a.links)
      expect(a.rich && a.rich.h2 === 1 && a.rich.li === 2 && a.rich.img === 1 && a.rich.strong === 1 && a.rich.a === 1, `${tag}: the description is drawn as rich text (heading, list, picture, bold, link)`, a.rich)
      /* Changed on purpose (round 26, W4, the owner): no Membership block; the card and the button carry the way in. */
      expect(!a.membership, `${tag}: no Membership block`)
      if (tag >= 1280) {
        expect(a.button?.style === "brand" && a.button.bg === "rgb(31, 122, 92)" && a.button.label === "Join for free" && a.note === "No card needed", `${tag}: the side card's button is the creator's: their words, their colour, their line`, { ...a.button, note: a.note })
        expect(a.cover === "50% 30%", `${tag}: the side card's cover sits where the creator put it`, a.cover)
      }
      expect(a.scroll <= 0, `${tag}: no sideways scroll`, a.scroll)
      await shot(p, `about-${tag}`)
      expect(errors.length === 0, `${tag}: no errors`, errors.slice(0, 3))
      await p.close()
      const one = await open("/community/salajanywood/about?members=1&plain=1", vp)
      const b = await aboutFacts(one.p)
      expect(!b.membership, `${tag}: with one member there is no Membership section`)
      expect(b.rich && b.rich.h2 === 0 && /A small club/.test(b.rich.text), `${tag}: an older plain text description still reads as text`, b.rich)
      await one.p.close()
    }
  }

  /* ── DARK ───────────────────────────────────────────────────────────── */
  if (want("DARK")) {
    for (const vp of [DESK, PHONE]) {
      const tag = vp.width
      console.log(`\nDARK ${tag}`)
      const { p, errors } = await open("/community/salajanywood/about?dark=1", vp)
      const patches = await p.evaluate(() => {
        const out = []
        const parse = (rgb) => {
          const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(rgb || "")
          if (!m) return null
          return { l: (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255, a: m[4] === undefined ? 1 : Number(m[4]) }
        }
        const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).slice(0, 90)}`
        const KEEP = "img, video, picture, canvas, [data-community-mark], [data-keep-bright], [data-soft-img], iframe, [data-join-style=brand]"
        for (const el of document.querySelectorAll("[data-community-sales] *, [data-community-top] *")) {
          if (el.closest(KEEP)) continue
          const b = el.getBoundingClientRect()
          if (b.bottom < 0 || b.top > innerHeight * 3 || b.width === 0) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === "hidden" || cs.display === "none") continue
          if (el instanceof SVGElement) continue
          if (b.width >= 14 && b.height >= 14) {
            const bg = parse(cs.backgroundColor)
            if (bg && bg.a > 0.35 && bg.l > 0.55) out.push({ what: "light background", el: name(el), bg: cs.backgroundColor })
            for (const side of ["Top", "Right", "Bottom", "Left"]) {
              const w = parseFloat(cs[`border${side}Width`])
              const c = parse(cs[`border${side}Color`])
              if (w >= 1 && c && c.a > 0.3 && c.l > 0.45) {
                out.push({ what: `light border ${side}`, el: name(el), color: cs[`border${side}Color`] })
                break
              }
            }
          }
          const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
          const ink = parse(cs.color)
          if (ownText && ink && ink.a > 0.5 && ink.l < 0.3) out.push({ what: "dark text", el: name(el), color: cs.color, text: el.textContent.trim().slice(0, 30) })
        }
        const seen = new Set()
        return out.filter((o) => { const k = `${o.what}|${o.el}`; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 20)
      })
      expect(patches.length === 0, `${tag}: the About page in the dark look has nothing left light and no dark words`, patches)
      await shot(p, `dark-${tag}`)
      expect(errors.length === 0, `${tag}: no errors`, errors.slice(0, 3))
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
