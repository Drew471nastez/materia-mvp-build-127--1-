/**
 * ===========================================================================
 *  ROUND 29: POSTING AND AN OPENED POST, MEASURED
 * ===========================================================================
 * The real shell, feed, composer, opened post and comments
 * (scripts/render-composer-round29.tsx) in headless Chromium, light and dark:
 *
 *   COMMENT   the comment box at the foot of an opened post on a phone, in
 *             the dark look: no light surface or light border in it, at rest
 *             and while typed in (the owner's white ring)
 *   SHEET     the New post sheet in the dark look: nothing light in it; its
 *             open and its Cancel are moves over many frames, never a jump
 *   EMOJI     the picker on a phone (sheet) and a computer (popover): scrolled
 *             through a step at a time, every group on screen has its emoji
 *             (none blank), and every group has them at the end; nothing
 *             light in it in the dark look
 *   TITLE     with the caret in the title, a picked emoji goes into the title
 *             at the caret, and the words stay as they were; with the caret
 *             in the words, into the words
 *   VIDEO     a post whose video has no still: a thumbnail on the card (its
 *             first frame) and in the opened post on a computer; a video with
 *             a poster: the box has its shape at once, the poster layer is
 *             there and the player's own abrupt poster is not drawn
 *   POST      on a phone, from a feed scrolled down: Post keeps its width and
 *             its full colour while it waits, the sheet goes down over many
 *             frames, the page then glides up (no frame jumps more than a
 *             quarter of the way), and the post lands with its highlight
 *   (SOUND, the post's chime, is measured in check-composer-round30.mjs
 *   since round 30 made it one soft pop)
 *
 *   PROBE_CSS=source node scripts/check-composer-round29.mjs [part ...]
 *   SHOTS_DIR=/tmp/r29 to keep the pictures somewhere chosen (a temp folder otherwise, printed at the end)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-r29-")), "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".composer-r29-probe")
mkdirSync(stubs, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const PID = (n) => `a${n}000000-0000-4000-8000-00000000000${n}`

try {
  /* A two second clip for the videos' play address (ffmpeg's test card). */
  const clip = join(stubs, "clip.webm")
  let hasClip = false
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=2", "-c:v", "libvpx", "-b:v", "400k", "-pix_fmt", "yuv420p", clip])
    hasClip = existsSync(clip)
  } catch {
    console.log("  (no ffmpeg: the first frame checks are skipped)")
  }

  writeFileSync(
    join(stubs, "navigation.js"),
    `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => history.back(), refresh: () => log("refresh") }
const useLocation = (read) => {
  const [v, setV] = useState(read)
  useEffect(() => {
    const on = () => startTransition(() => setV(read()))
    window.addEventListener("popstate", on)
    return () => window.removeEventListener("popstate", on)
  }, [])
  return v
}
export const usePathname = () => useLocation(() => location.pathname)
export const useSearchParams = () => new URLSearchParams(useLocation(() => location.search))
export const useRouter = () => router
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`)
  writeFileSync(join(stubs, "dynamic.jsx"), `import React from "react"
export default function dynamic(load) { const Lazy = React.lazy(() => load().then((m) => ({ default: m && m.default ? m.default : m }))); return function Dynamic(props) { return React.createElement(Lazy, props) } }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-composer-round29.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.composer-r29-probe/navigation.js", "next/link": "./.composer-r29-probe/link.jsx", "next/image": "./.composer-r29-probe/image.jsx", "next/dynamic": "./.composer-r29-probe/dynamic.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const css = await appCss(root)
  const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${interFaces(root)}${css}</style><style>${themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const clipBytes = hasClip ? readFileSync(clip) : null

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(vp, { dark = false, noIdle = false } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    /* No idle time at all: what is made is only what the scroll asks for (the picker's idle fill never runs). */
    if (noIdle) await p.evaluateOnNewDocument(() => {
      window.requestIdleCallback = () => 0
      window.cancelIdleCallback = () => {}
    })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      /* A media request carries its fragment (#t=0.1) and asks for a range. */
      const url = r.url().split("#")[0]
      if (url === `${ORIGIN}/__clip.webm`) {
        if (!clipBytes) return r.respond({ status: 404, body: "" })
        const n = clipBytes.length
        return r.respond({ status: 206, contentType: "video/webm", body: clipBytes, headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes 0-${n - 1}/${n}`, "Content-Length": String(n) } })
      }
      if (url.startsWith(`${ORIGIN}/api/`)) return r.respond({ status: 200, contentType: "application/json", body: "{}" })
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("file:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/community/clay-studio${dark ? "?dark=1" : ""}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await p.waitForSelector("[data-feed-list] [data-post]", { timeout: 15000 })
    await sleep(600)
    return { p, errors }
  }

  /* Every element under `sel` whose own ground or border is light (the round 27 probe's rule). */
  const lightPatches = (p, sel) =>
    p.evaluate((sel) => {
      const out = []
      const parse = (rgb) => {
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(rgb || "")
        if (!m) return null
        return { l: (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255, a: m[4] === undefined ? 1 : Number(m[4]) }
      }
      for (const el of document.querySelectorAll(`${sel}, ${sel} *`)) {
        const b = el.getBoundingClientRect()
        if (b.width < 6 || b.height < 6 || b.bottom < 0 || b.top > innerHeight) continue
        /* A glyph drawn in the button's own light ink (Post's ring) is ink, not a surface. */
        if (el.closest("img, video, svg, picture, [data-keep-bright], [data-post-ring]")) continue
        let seen = 1
        for (let x = el; x && seen > 0.05; x = x.parentElement) seen *= Number(getComputedStyle(x).opacity)
        if (seen <= 0.05) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue
        const bg = parse(cs.backgroundColor)
        if (bg && bg.a > 0.35 && bg.l > 0.55) out.push({ what: "background", el: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)}`, bg: cs.backgroundColor })
        for (const side of ["Top", "Right", "Bottom", "Left"]) {
          const wdt = parseFloat(cs[`border${side}Width`])
          const c = parse(cs[`border${side}Color`])
          if (wdt >= 1 && c && c.a > 0.3 && c.l > 0.45) {
            out.push({ what: `border ${side}`, el: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)}`, color: cs[`border${side}Color`] })
            break
          }
        }
        const shadow = cs.boxShadow
        if (shadow && shadow !== "none") {
          for (const m of shadow.matchAll(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)[^,]*?(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/g)) {
            const l = (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255
            const a = m[4] === undefined ? 1 : Number(m[4])
            const spread = Number(m[8] || 0)
            if (l > 0.6 && a > 0.3 && spread >= 1) out.push({ what: "ring", el: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)}`, shadow })
          }
        }
      }
      return out.slice(0, 10)
    }, sel)

  /* Records `measure()` (run in the page) on every frame for `ms` after `act` starts. */
  const record = async (p, act, ms, measure) => {
    await p.evaluate((ms, src) => {
      const fn = new Function(`return (${src})()`)
      window.__trace = []
      const t0 = performance.now()
      const tick = () => {
        const t = performance.now() - t0
        try {
          window.__trace.push({ t: Math.round(t), ...fn() })
        } catch (e) {
          window.__trace.push({ t: Math.round(t), err: String(e) })
        }
        if (t < ms) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, ms, measure.toString())
    await act()
    await sleep(ms + 120)
    return p.evaluate(() => window.__trace)
  }
  const sheetTop = () => {
    const s = document.querySelector("[data-mobile-bottom-sheet]:has([data-composer=sheet])")
    if (!s) return { top: null }
    return { top: Math.round(s.getBoundingClientRect().top) }
  }
  /* The frames of a move: how many distinct places it passed through, and its time from first to last change. */
  const moveOf = (trace, key = "top") => {
    const vals = trace.map((f) => f[key]).filter((v) => typeof v === "number")
    const distinct = new Set(vals).size
    let first = null
    let last = null
    for (let i = 1; i < trace.length; i++) {
      if (typeof trace[i][key] === "number" && typeof trace[i - 1][key] === "number" && trace[i][key] !== trace[i - 1][key]) {
        first ??= trace[i - 1].t
        last = trace[i].t
      }
    }
    const span = vals.length ? Math.max(...vals) - Math.min(...vals) : 0
    let biggest = 0
    for (let i = 1; i < vals.length; i++) biggest = Math.max(biggest, Math.abs(vals[i] - vals[i - 1]))
    return { distinct, ms: first === null ? 0 : last - first, span, biggestStep: biggest }
  }

  /* A real press on a card's words (an element's .click() lands at 0,0, which the feed's press handling reads as another card). */
  const pressCard = async (p, id, phone) => {
    const sel = `[data-feed-list] > [data-post="${id}"] h2 [data-post-open]`
    await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center" }), sel)
    await sleep(250)
    const at = await p.evaluate((sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect()
      return r ? { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 } : null
    }, sel)
    if (!at) return false
    if (phone) await p.touchscreen.tap(at.x, at.y)
    else await p.mouse.click(at.x, at.y)
    return true
  }

  const openSheet = async (p) => {
    await p.evaluate(() => document.querySelector("[data-composer-open]")?.click())
    await p.waitForSelector("[data-composer=sheet] [data-composer-title]", { timeout: 10000 })
    await sleep(900)
  }

  if (want("COMMENT")) {
    console.log("\nCOMMENT: the comment box at the foot of an opened post, dark")
    for (const dark of [false, true]) {
      const { p, errors } = await open(PHONE, { dark })
      await pressCard(p, PID(2), true)
      await p.waitForSelector('[data-comments-composer="float"] [data-comment-box=comment]', { timeout: 15000 })
      await sleep(900)
      const look = dark ? "dark" : "light"
      await p.screenshot({ path: join(shots, `comment-${look}.png`) })
      const pill = await p.evaluate(() => {
        const box = document.querySelector('[data-comments-composer="float"] [data-comment-box=comment]')
        const field = box?.querySelector("[data-comment-field]")
        const cs = box && getComputedStyle(box)
        const fs = field && getComputedStyle(field)
        return box ? { pill: box.hasAttribute("data-comment-pill"), bg: cs.backgroundColor, border: cs.borderTopColor, radius: cs.borderTopLeftRadius, fieldBg: fs?.backgroundColor, fieldBorder: fs?.borderTopColor } : null
      })
      expect(!!pill?.pill && pill.radius === "26px", `${look}: the box is the rounded pill itself`, pill)
      if (dark) {
        const patches = await lightPatches(p, '[data-comments-composer="float"]')
        expect(patches.length === 0, "dark: nothing light in the comment box at rest", patches)
        await p.evaluate(() => document.querySelector('[data-comments-composer="float"] textarea')?.focus())
        await p.keyboard.type("Lovely foot")
        await sleep(400)
        const typing = await p.evaluate(() => !!document.querySelector("[data-typing]"))
        const patches2 = await lightPatches(p, '[data-comments-composer="float"]')
        await p.screenshot({ path: join(shots, "comment-dark-typing.png") })
        expect(patches2.length === 0, `dark: nothing light while typed in (typing mark ${typing})`, patches2)
        const ground = await p.evaluate(() => getComputedStyle(document.querySelector('[data-comments-composer="float"]')).backgroundColor)
        expect(!typing || ground === "rgb(24, 24, 27)", "dark: the typing ground is the sheet's charcoal surface", ground)
      } else {
        expect(pill?.bg === "rgb(255, 255, 255)", "light: the pill is white", pill?.bg)
      }
      expect(errors.length === 0, `${look}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("SHEET")) {
    console.log("\nSHEET: the New post sheet, its open and its Cancel")
    const { p, errors } = await open(PHONE, { dark: true })
    const rise = await record(p, () => p.evaluate(() => document.querySelector("[data-composer-open]")?.click()), 900, sheetTop)
    const up = moveOf(rise)
    expect(up.distinct >= 10 && up.ms >= 200, "the open is a move over many frames", up)
    await sleep(400)
    await p.screenshot({ path: join(shots, "sheet-dark.png") })
    const patches = await lightPatches(p, "[data-composer=sheet]")
    expect(patches.length === 0, "dark: nothing light in the sheet (Cancel, Post, the fields, the toolbar)", patches)
    const buttons = await p.evaluate(() => {
      const c = document.querySelector("[data-composer=sheet] [data-composer-cancel]")
      const b = document.querySelector("[data-composer=sheet] [data-composer-post]")
      const one = (el) => {
        const cs = getComputedStyle(el)
        return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopWidth }
      }
      return { cancel: c && one(c), post: b && one(b) }
    })
    expect(buttons.cancel?.bg === "rgba(0, 0, 0, 0)" && buttons.post?.border === "0px", "Cancel is a plain word, Post a filled button with no edge", buttons)
    const shut = await record(p, () => p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-cancel]")?.click()), 900, sheetTop)
    const down = moveOf(shut)
    expect(down.distinct >= 10 && down.ms >= 250, "Cancel: the sheet goes down over many frames (close duration > 0)", down)
    expect(down.biggestStep < down.span * 0.3, "Cancel: no frame jumps more than 30% of the way", down)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  const scrollGroups = async (p, listSel, label) => {
    /* Scroll the list a step at a time; on each step, every group whose top half is on screen must have its emoji. */
    const res = await p.evaluate(async (listSel) => {
      const list = document.querySelector(listSel)
      if (!list) return { error: "no list" }
      const blank = []
      const seen = new Set()
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      let steps = 0
      while (steps < 400) {
        await frame()
        const lr = list.getBoundingClientRect()
        for (const s of list.querySelectorAll("[data-emoji-group]")) {
          const r = s.getBoundingClientRect()
          const onScreen = r.top < lr.bottom - 40 && r.bottom > lr.top + 40
          if (!onScreen) continue
          seen.add(s.dataset.emojiGroup)
          const n = s.querySelectorAll("[data-emoji]").length
          if (!n) blank.push({ group: s.dataset.emojiGroup, at: Math.round(list.scrollTop) })
        }
        if (list.scrollTop + list.clientHeight >= list.scrollHeight - 2) break
        list.scrollTop += Math.round(list.clientHeight * 0.45)
        steps++
      }
      await frame()
      const all = [...list.querySelectorAll("[data-emoji-group]")].map((s) => ({ group: s.dataset.emojiGroup, cells: s.querySelectorAll("[data-emoji]").length }))
      return { blank: blank.slice(0, 8), blankCount: blank.length, seen: seen.size, groups: all.length, emptyAtEnd: all.filter((g) => !g.cells).map((g) => g.group), steps }
    }, listSel)
    expect(!res.error && res.blankCount === 0, `${label}: no group on screen without its emoji while scrolling`, res)
    expect(!res.error && res.emptyAtEnd.length === 0 && res.seen === res.groups, `${label}: every group has its emoji cells at the end`, { seen: res.seen, groups: res.groups, emptyAtEnd: res.emptyAtEnd })
  }

  if (want("EMOJI")) {
    console.log("\nEMOJI: every group fills in as it is scrolled to")
    {
      const { p, errors } = await open(PHONE, { dark: true })
      await openSheet(p)
      await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-tool=emoji] [data-emoji-trigger]")?.click())
      await sleep(700)
      const list = "[data-emoji-panel] > div.overflow-y-auto"
      await p.screenshot({ path: join(shots, "emoji-phone-dark.png") })
      const patches = await lightPatches(p, "[data-emoji-panel]")
      expect(patches.length === 0, "phone, dark: nothing light in the emoji panel", patches)
      await scrollGroups(p, list, "phone sheet")
      await p.screenshot({ path: join(shots, "emoji-phone-end.png") })
      expect(errors.length === 0, "phone: no page errors", errors)
      await p.close()
    }
    {
      /* The scroll alone, with the idle fill held back: the observer has to make each group as it comes near. */
      const { p, errors } = await open(PHONE, { noIdle: true })
      await openSheet(p)
      await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-tool=emoji] [data-emoji-trigger]")?.click())
      await sleep(700)
      const before = await p.evaluate(() => document.querySelectorAll('[data-emoji-panel] [data-emoji-built="true"]').length)
      expect(before < 8, "no idle time: only the groups near the top are made before the scroll", before)
      await scrollGroups(p, "[data-emoji-panel] > div.overflow-y-auto", "phone sheet, scroll alone")
      expect(errors.length === 0, "phone, scroll alone: no page errors", errors)
      await p.close()
    }
    {
      const { p, errors } = await open(DESK, { dark: false })
      await p.evaluate(() => document.querySelector("[data-composer-open]")?.click())
      await p.waitForSelector("[data-composer=open] [data-composer-title]")
      await sleep(500)
      await p.evaluate(() => document.querySelector("[data-composer=open] [data-composer-tool=emoji] [data-emoji-trigger]")?.click())
      await p.waitForSelector("[data-emoji-popover] [data-emoji-panel]")
      await sleep(400)
      await scrollGroups(p, "[data-emoji-popover] [data-emoji-panel] > div.overflow-y-auto", "computer popover")
      await p.screenshot({ path: join(shots, "emoji-desk.png") })
      expect(errors.length === 0, "computer: no page errors", errors)
      await p.close()
    }
  }

  if (want("DESK")) {
    console.log("\nDESK: the editor in place on a computer, both looks")
    for (const dark of [false, true]) {
      const look = dark ? "dark" : "light"
      const { p, errors } = await open(DESK, { dark })
      await p.evaluate(() => document.querySelector("[data-composer-open]")?.click())
      await p.waitForSelector("[data-composer=open] [data-composer-title]")
      await sleep(600)
      await p.click("[data-composer=open] [data-composer-title]")
      await p.keyboard.type("Kiln day")
      await sleep(200)
      const state = await p.evaluate(() => {
        const card = document.querySelector("[data-composer]")
        const ed = document.querySelector("[data-composer-editor]")
        return { card: card?.getAttribute("data-composer"), editorOpacity: ed ? getComputedStyle(ed).opacity : null, title: document.querySelector("[data-composer-title]")?.value ?? null }
      })
      expect(state.card === "open" && state.editorOpacity === "1" && state.title === "Kiln day", `${look}: the editor is open and drawn`, state)
      await p.screenshot({ path: join(shots, `composer-desk-${look}.png`) })
      if (dark) {
        const patches = await lightPatches(p, "[data-composer=open]")
        expect(patches.length === 0, "dark: nothing light in the editor, Cancel or Post", patches)
      }
      expect(errors.length === 0, `${look}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("TITLE")) {
    console.log("\nTITLE: an emoji goes where the caret was")
    {
      const { p, errors } = await open(DESK)
      await p.evaluate(() => document.querySelector("[data-composer-open]")?.click())
      await p.waitForSelector("[data-composer=open] [data-composer-title]")
      await sleep(500)
      await p.click("[data-composer=open] [data-composer-title]")
      await p.keyboard.type("Kiln day")
      await p.evaluate(() => document.querySelector("[data-composer=open] [data-composer-title]").setSelectionRange(4, 4))
      await p.evaluate(() => document.querySelector("[data-composer=open] [data-composer-tool=emoji] [data-emoji-trigger]")?.click())
      await p.waitForSelector("[data-emoji-popover] [data-emoji]")
      await sleep(250)
      const picked = await p.evaluate(() => {
        const b = document.querySelector("[data-emoji-popover] [data-emoji-group] [data-emoji]")
        b?.click()
        return b?.dataset.emoji
      })
      await sleep(250)
      const after = await p.evaluate(() => ({ title: document.querySelector("[data-composer=open] [data-composer-title]").value, body: document.querySelector("[data-composer=open] textarea").value, caret: document.querySelector("[data-composer=open] [data-composer-title]").selectionStart }))
      expect(after.title === `Kiln${picked} day` && after.body === "", "computer: into the title at its caret, the words untouched", { picked, ...after })
      expect(after.caret === 4 + picked.length, "computer: the caret after the emoji", after.caret)
      await p.keyboard.press("Escape")
      await sleep(200)
      await p.click("[data-composer=open] textarea")
      await p.keyboard.type("hi")
      await p.evaluate(() => document.querySelector("[data-composer=open] [data-composer-tool=emoji] [data-emoji-trigger]")?.click())
      await p.waitForSelector("[data-emoji-popover] [data-emoji]")
      await sleep(250)
      const picked2 = await p.evaluate(() => {
        const b = document.querySelector("[data-emoji-popover] [data-emoji-group] [data-emoji]")
        b?.click()
        return b?.dataset.emoji
      })
      await sleep(250)
      const after2 = await p.evaluate(() => ({ title: document.querySelector("[data-composer=open] [data-composer-title]").value, body: document.querySelector("[data-composer=open] textarea").value }))
      expect(after2.body === `hi${picked2}` && after2.title === `Kiln${picked} day`, "computer: the caret in the words, into the words", after2)
      expect(errors.length === 0, "computer: no page errors", errors)
      await p.close()
    }
    {
      const { p, errors } = await open(PHONE)
      await openSheet(p)
      await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-title]").focus())
      await p.keyboard.type("Glaze")
      await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-title]").setSelectionRange(0, 0))
      await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-tool=emoji] [data-emoji-trigger]")?.click())
      await sleep(700)
      const picked = await p.evaluate(() => {
        const b = document.querySelector("[data-emoji-panel] [data-emoji-group] [data-emoji]")
        b?.click()
        return b?.dataset.emoji
      })
      await sleep(400)
      const after = await p.evaluate(() => ({ title: document.querySelector("[data-composer=sheet] [data-composer-title]").value, body: document.querySelector("[data-composer=sheet] textarea").value }))
      expect(after.title === `${picked}Glaze` && after.body === "", "phone: into the title at its caret", { picked, ...after })
      expect(errors.length === 0, "phone: no page errors", errors)
      await p.close()
    }
  }

  if (want("VIDEO") && hasClip) {
    console.log("\nVIDEO: a thumbnail for a video, at once and softly")
    {
      const { p, errors } = await open(DESK, { dark: false })
      await p.evaluate((id) => document.querySelector(`[data-feed-list] > [data-post="${id}"]`)?.scrollIntoView({ block: "center" }), PID(3))
      await p.waitForSelector(`[data-post="${PID(3)}"] [data-post-thumb] [data-video-frame="shown"]`, { timeout: 8000 }).catch(() => null)
      const thumb = await p.evaluate((id) => {
        const t = document.querySelector(`[data-feed-list] > [data-post="${id}"] [data-post-thumb]`)
        if (!t) return null
        const r = t.getBoundingClientRect()
        const card = t.closest("[data-post]").getBoundingClientRect()
        return { kind: t.dataset.postThumb, frame: t.querySelector("[data-video-frame]")?.dataset.videoFrame, w: Math.round(r.width), right: Math.round(card.right - r.right) }
      }, PID(3))
      await p.screenshot({ path: join(shots, "video-card-desk.png") })
      expect(thumb?.kind === "video" && thumb.frame === "shown" && thumb.w === 96, "the card: the video's first frame in the 96px thumbnail on the right", thumb)
      /* Opened over the feed (the computer's panel): the box has its shape from the press, the frame comes into it. */
      const opened = await record(
        p,
        () => pressCard(p, PID(3), false),
        1600,
        () => {
          const box = document.querySelector('[data-post-overlay="panel"] [data-media-tile="video"]')
          const f = box?.querySelector("[data-video-frame]")
          return { h: box ? Math.round(box.getBoundingClientRect().height) : null, frame: f?.dataset.videoFrame ?? null }
        },
      )
      const firstBox = opened.find((f) => f.h)
      const heights = new Set(opened.filter((f) => f.h).map((f) => f.h))
      const shownAt = opened.find((f) => f.frame === "shown")?.t ?? null
      expect(!!firstBox && heights.size === 1, "the opened post: the video's box has one height from its first frame (no shift)", { first: firstBox, heights: [...heights] })
      expect(shownAt !== null, "the opened post: the video's first frame is shown", { shownAt })
      await sleep(300)
      await p.screenshot({ path: join(shots, "video-modal-desk.png") })
      await p.keyboard.press("Escape")
      await sleep(600)
      await pressCard(p, PID(4), false)
      await p.waitForSelector('[data-post-overlay="panel"] [data-video-poster-layer]', { timeout: 6000 }).catch(() => null)
      await sleep(500)
      const poster = await p.evaluate(() => {
        const layer = document.querySelector('[data-post-overlay="panel"] [data-video-poster-layer]')
        const own = document.querySelector('[data-post-overlay="panel"] [data-video-poster]')
        const player = document.querySelector('[data-post-overlay="panel"] [data-storelib-video]')
        return { layer: layer?.dataset.videoPosterLayer ?? null, ownShown: own ? getComputedStyle(own).display !== "none" : null, playerGround: player ? getComputedStyle(player).backgroundColor : null }
      })
      await p.screenshot({ path: join(shots, "video-poster-modal-desk.png") })
      expect(poster.layer === "shown" && poster.ownShown === false && poster.playerGround === "rgba(0, 0, 0, 0)", "a video with a poster: the poster layer is shown, the player's own is not drawn over it", poster)
      expect(errors.length === 0, "computer: no page errors", errors)
      await p.close()
    }
    {
      const { p, errors } = await open(PHONE, { dark: true })
      await p.evaluate((id) => document.querySelector(`[data-feed-list] > [data-post="${id}"]`)?.scrollIntoView({ block: "center" }), PID(3))
      await p.waitForSelector(`[data-post="${PID(3)}"] [data-card-media-frame] [data-video-frame="shown"]`, { timeout: 8000 }).catch(() => null)
      const card = await p.evaluate((id) => document.querySelector(`[data-feed-list] > [data-post="${id}"] [data-card-media-frame] [data-video-frame]`)?.dataset.videoFrame ?? null, PID(3))
      await p.screenshot({ path: join(shots, "video-card-phone-dark.png") })
      expect(card === "shown", "phone: the card shows the video's first frame under the words", card)
      /* The post with a poster, opened as the phone's sheet: its box has one height from the first frame it is drawn in, the poster is shown in it. */
      const sheetOpen = await record(
        p,
        () => pressCard(p, PID(4), true),
        1800,
        () => {
          const box = document.querySelector('[data-post-fullscreen] [data-media-tile="video"]')
          return { h: box ? Math.round(box.getBoundingClientRect().height) : null, layer: box?.querySelector("[data-video-poster-layer]")?.dataset.videoPosterLayer ?? null }
        },
      )
      const hs = new Set(sheetOpen.filter((f) => f.h).map((f) => f.h))
      const posterAt = sheetOpen.find((f) => f.layer === "shown")?.t ?? null
      const boxAt = sheetOpen.find((f) => f.h)?.t ?? null
      expect(hs.size === 1 && posterAt !== null, "phone sheet: the video box keeps one height and its poster is shown", { heights: [...hs], boxAt, posterAt })
      await sleep(300)
      await p.screenshot({ path: join(shots, "video-poster-phone-dark.png") })
      expect(errors.length === 0, "phone: no page errors", errors)
      await p.close()
    }
  }

  if (want("POST")) {
    console.log("\nPOST: the pending state, the close, the glide, the landing")
    const { p, errors } = await open(PHONE, { dark: false })
    await p.evaluate(() => window.scrollTo(0, 1400))
    await sleep(400)
    await openSheet(p)
    await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-title]").focus())
    await p.keyboard.type("Bisque firing tonight")
    await p.evaluate(() => document.querySelector("[data-composer=sheet] textarea").focus())
    await p.keyboard.type("Loading the kiln at six.")
    await sleep(300)
    const ready = await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-post]")?.dataset.postReady)
    expect(ready === "true", "Post is ready", ready)
    await p.evaluate(() => (window.__postLatency = 700))
    const trace = await record(
      p,
      () => p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-post]")?.click()),
      3400,
      () => {
        const b = document.querySelector("[data-composer=sheet] [data-composer-post]")
        const s = document.querySelector("[data-mobile-bottom-sheet]:has([data-composer=sheet])")
        const mine = document.querySelector('[data-feed-list] > [data-post^="b"]')
        return {
          state: b?.dataset.postState ?? null,
          w: b ? Math.round(b.getBoundingClientRect().width * 10) / 10 : null,
          o: b ? Number(getComputedStyle(b).opacity) : null,
          top: s ? Math.round(s.getBoundingClientRect().top) : null,
          y: Math.round(window.scrollY),
          landed: !!mine,
          lit: !!mine?.querySelector("[data-post-highlight]"),
        }
      },
    )
    const withBtn = trace.filter((f) => f.w !== null)
    const widths = new Set(withBtn.map((f) => f.w))
    const minO = Math.min(...withBtn.map((f) => f.o))
    const states = [...new Set(withBtn.map((f) => f.state))]
    expect(widths.size === 1 && states.includes("busy") && states.includes("sent"), "Post keeps one width through Post, the ring, the check", { widths: [...widths], states })
    expect(minO >= 0.99, "Post keeps its full colour while it waits (nothing dims it)", minO)
    const sheetFrames = trace.filter((f) => f.top !== null)
    const down = moveOf(sheetFrames)
    expect(down.distinct >= 10 && down.ms >= 250, "the sheet goes down over many frames", down)
    const goneAt = trace.find((f, i) => i > 0 && f.top === null && trace[i - 1].top !== null)?.t ?? null
    const after = trace.filter((f) => goneAt !== null && f.t >= goneAt)
    const glide = moveOf(after, "y")
    const landedAt = trace.find((f) => f.landed)?.t ?? null
    const startY = after[0]?.y
    const endY = after.at(-1)?.y
    expect(startY > 600 && endY < 200, "after the close the page goes up to where the post goes", { startY, endY })
    expect(glide.distinct >= 8 && glide.biggestStep <= glide.span * 0.25, "it glides there: many frames, none more than a quarter of the way", glide)
    const glideEnd = after.findLast((f, i) => i > 0 && f.y !== after[i - 1].y)?.t ?? null
    expect(landedAt !== null && glideEnd !== null && landedAt >= glideEnd - 20, "the post goes in once the glide is over", { landedAt, glideEnd })
    expect(trace.some((f) => f.lit), "it lands with its warm highlight", trace.some((f) => f.lit))
    await p.screenshot({ path: join(shots, "post-landed.png") })
    writeFileSync(join(shots, "post-trace.json"), JSON.stringify(trace))
    /* The pending state, to look at: a second post on a slow answer, photographed while it waits. */
    await sleep(1600)
    await openSheet(p)
    await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-title]").focus())
    await p.keyboard.type("Second one")
    await p.evaluate(() => document.querySelector("[data-composer=sheet] textarea").focus())
    await p.keyboard.type("Words.")
    await p.evaluate(() => (window.__postLatency = 2500))
    await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-post]")?.click())
    await sleep(500)
    const waiting = await p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-post]")?.dataset.postState)
    expect(waiting === "busy", "a slow answer: Post shows its ring", waiting)
    await p.screenshot({ path: join(shots, "post-pending.png") })
    await sleep(3000)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* SOUND moved to scripts/check-composer-round30.mjs (round 30: the chime became one soft pop). */

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\n  pictures: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
