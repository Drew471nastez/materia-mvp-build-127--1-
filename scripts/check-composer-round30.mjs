/**
 * ===========================================================================
 *  ROUND 30: THE MEMBERS HOVER, THE NO SPACE CUE, THE POP, THE CLOSE
 * ===========================================================================
 * The real shell, feed, composer and Members list
 * (scripts/render-composer-round29.tsx, with round 30's ?spaces=2 and
 * /members) in headless Chromium:
 *
 *   MEMBERS    a member row under the pointer with the person card open: in
 *              the dark look a dark step with the name clearly legible (it
 *              was the light grey, a white row), in the light look as it was
 *   NOSPACE    Post pressed with a title and words but no space, on a
 *              computer, in the dark, on a phone and with reduced motion: one
 *              soft shake of the picker (many frames, at most 4px; none for
 *              reduced motion), "Choose a space first" beside it at once, an
 *              amber ring, the picker opening, Post never greyed out, nothing
 *              sent; a space chosen clears it all
 *   SOUND      the post's pop rendered offline: its peak, its length, the
 *              first and last samples (no click), the pitch falling
 *   DESKCLOSE  on a computer, Cancel folds the editor over many frames with
 *              no jump and no snap after; Post from a page scrolled down
 *              folds, glides the page up, and the post lands in sight
 *
 * The phone's sheet (its open, Cancel, and Post with the glide) is measured by
 * scripts/check-composer-round29.mjs (SHEET, POST).
 *
 *   PROBE_CSS=source node scripts/check-composer-round30.mjs [part ...]
 *   SHOTS_DIR=/tmp/r30 to keep the pictures somewhere chosen (a temp folder otherwise, printed at the end)
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
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-r30-")), "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".composer-r30-probe")
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
    alias: { "@": ".", "next/navigation": "./.composer-r30-probe/navigation.js", "next/link": "./.composer-r30-probe/link.jsx", "next/image": "./.composer-r30-probe/image.jsx", "next/dynamic": "./.composer-r30-probe/dynamic.jsx" },
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
  /*
    A COMPUTER IS A MOUSE. This headless Chromium answers hover: none and pointer: none whatever it is told (the
    --blink-settings flags and CDP's emulated media change nothing here), so no hover style would ever apply. A computer's
    page is served with the mouse queries in its stylesheets written as always true ((hover: hover), (pointer: fine) become (min-width: 0px)),
    so what is measured is the stylesheet as compiled, on a device that can hover.
  */
  const mouseQueries = (sheet) => sheet.replace(/\((?:any-)?hover:\s?hover\)/g, "(min-width: 0px)").replace(/\((?:any-)?pointer:\s?fine\)/g, "(min-width: 0px)")
  /* Only the stylesheets: the page's own class names ([@media(hover:hover)]:...) stay as they are. */
  const htmlMouse = html.split(css).join(mouseQueries(css)).split(themeCss).join(mouseQueries(themeCss))

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(vp, { dark = false, noIdle = false, query = "", path = "", ready = "[data-feed-list] [data-post]", reduce = false } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    if (reduce) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
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
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: vp.isMobile ? html : htmlMouse })
      if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("file:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    const qs = [dark ? "dark=1" : "", query].filter(Boolean).join("&")
    await p.goto(`${ORIGIN}/community/clay-studio${path}${qs ? `?${qs}` : ""}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await p.waitForSelector(ready, { timeout: 15000 })
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

  /* A colour's relative luminance (WCAG), and the contrast of two. */
  const lum = (rgb) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(rgb || "")
    if (!m) return null
    const ch = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * ch(+m[1]) + 0.7152 * ch(+m[2]) + 0.0722 * ch(+m[3])
  }
  const contrast = (a, b) => {
    const x = lum(a)
    const y = lum(b)
    return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2)
  }

  if (want("MEMBERS")) {
    console.log("\nMEMBERS: a member row under the pointer, with the person card open")
    for (const dark of [false, true]) {
      const look = dark ? "dark" : "light"
      const { p, errors } = await open(DESK, { dark, path: "/members", ready: "ul [data-person-link]" })
      const row = await p.evaluate(() => {
        const a = document.querySelectorAll("ul [data-person-link]")[1]
        const r = a.parentElement.getBoundingClientRect()
        return { x: r.left + 120, y: r.top + r.height / 2 }
      })
      const rest = await p.evaluate(() => getComputedStyle(document.querySelectorAll("ul [data-person-link]")[1].parentElement).backgroundColor)
      await p.mouse.move(row.x, row.y, { steps: 4 })
      await p.waitForSelector("[data-person-card]", { timeout: 5000 }).catch(() => null)
      await sleep(700)
      const m = await p.evaluate(() => {
        const a = document.querySelectorAll("ul [data-person-link]")[1]
        const rowEl = a.parentElement
        const name = a.querySelector(".font-semibold")
        /* What is under the row: the first ancestor with a ground of its own. */
        let under = rowEl.parentElement
        while (under && getComputedStyle(under).backgroundColor === "rgba(0, 0, 0, 0)") under = under.parentElement
        const card = document.querySelector("[data-person-card]")
        return { row: getComputedStyle(rowEl).backgroundColor, under: under ? getComputedStyle(under).backgroundColor : null, name: getComputedStyle(name).color, card: !!card, cardBg: card ? getComputedStyle(card).backgroundColor : null }
      })
      await p.screenshot({ path: join(shots, `members-hover-${look}.png`) })
      expect(m.card, `${look}: the person card is open beside the hovered row`, m.card)
      if (dark) {
        const l = lum(m.row)
        expect(l !== null && l < 0.03, "dark: the hovered row is a dark step, not white", { row: m.row, luminance: l && +l.toFixed(4) })
        expect(m.row !== m.under && m.row !== rest, "dark: the hover still reads (a step off the list's ground)", { rest, hover: m.row, under: m.under })
        expect(contrast(m.name, m.row) >= 7, "dark: the name on the hovered row is clearly legible", { name: m.name, row: m.row, ratio: contrast(m.name, m.row) })
        expect(lum(m.cardBg) < 0.03, "dark: the person card is dark too", m.cardBg)
      } else {
        expect(m.row === "rgb(248, 249, 250)", "light: the hover is the light grey it was", m.row)
      }
      expect(errors.length === 0, `${look}: no page errors`, errors)
      await p.close()
    }
    /* The same unread variant elsewhere in the community: the feed's space chips ([@media(hover:hover)]:hover:bg-[#f5f6f7]). */
    const { p, errors } = await open(DESK, { dark: true })
    const chip = await p.evaluate(() => {
      const r = document.querySelector('[data-space-chip="general"]').getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    await p.mouse.move(chip.x, chip.y, { steps: 3 })
    await sleep(400)
    const chipBg = await p.evaluate(() => getComputedStyle(document.querySelector('[data-space-chip="general"]')).backgroundColor)
    expect(lum(chipBg) < 0.03, "dark: a hovered space chip is a dark step, not white", { bg: chipBg, luminance: +lum(chipBg).toFixed(4) })
    expect(errors.length === 0, "chips: no page errors", errors)
    await p.close()
  }

  /* Types a title and words into the composer (`scope` is the sheet or the card). */
  const fill = async (p, scope) => {
    await p.evaluate((scope) => document.querySelector(`${scope} [data-composer-title]`).focus(), scope)
    await p.keyboard.type("Glaze test results")
    await p.evaluate((scope) => document.querySelector(`${scope} textarea`).focus(), scope)
    await p.keyboard.type("Three tiles, one shelf.")
    await sleep(250)
  }
  const cueFrame = () => {
    const btn = document.querySelector("button[data-composer-space]")
    const hint = document.querySelector("[data-composer-space-hint]")
    const t = btn ? getComputedStyle(btn).translate : "none"
    const tx = t && t !== "none" ? parseFloat(t) || 0 : 0
    const post = document.querySelector("[data-composer-post]")
    return {
      tx: Math.round(tx * 100) / 100,
      hint: hint ? hint.textContent : null,
      hintO: hint ? Number(getComputedStyle(hint).opacity) : null,
      menu: !!document.querySelector('[role="menu"]') || !![...document.querySelectorAll("[data-sheet-root]")].some((s) => /Post in/.test(s.textContent || "")),
      postO: post ? Number(getComputedStyle(post).opacity) : null,
    }
  }

  if (want("NOSPACE")) {
    console.log("\nNOSPACE: Post pressed before a space is chosen")
    for (const [where, vp, reduce, dark] of [["computer", DESK, false, false], ["computer, dark", DESK, false, true], ["phone", PHONE, false, false], ["computer, reduced motion", DESK, true, false]]) {
      const { p, errors } = await open(vp, { dark, query: "spaces=2", reduce })
      const phone = vp === PHONE
      let scope = "[data-composer=open]"
      if (phone) {
        await openSheet(p)
        scope = "[data-composer=sheet]"
      } else {
        await p.evaluate(() => document.querySelector("[data-composer-open]")?.click())
        await p.waitForSelector("[data-composer=open] [data-composer-title]")
        await sleep(500)
      }
      await fill(p, scope)
      const before = await p.evaluate((scope) => {
        const b = document.querySelector(`${scope} [data-composer-post]`)
        return { ready: b?.dataset.postReady, label: b?.getAttribute("aria-label"), o: Number(getComputedStyle(b).opacity), space: document.querySelector("button[data-composer-space]")?.textContent }
      }, scope)
      expect(before.ready === "false" && /Choose a space first/.test(before.label || ""), `${where}: Post says what it waits for`, before)
      const shot = where.replace(/[ ,]+/g, "-")
      const trace = await record(
        p,
        async () => {
          await p.evaluate((scope) => document.querySelector(`${scope} [data-composer-post]`)?.click(), scope)
          /* The cue before the picker opens over it. */
          await sleep(260)
          await p.screenshot({ path: join(shots, `nospace-${shot}-cue.png`) })
        },
        900,
        cueFrame,
      )
      const whole = await p.evaluate(() => {
        const h = document.querySelector("[data-composer-space-hint]")
        return h ? { scroll: h.scrollWidth, client: h.clientWidth } : null
      })
      expect(whole && whole.scroll <= whole.client + 1, `${where}: the line is whole, not cut short`, whole)
      await p.screenshot({ path: join(shots, `nospace-${shot}-open.png`) })
      const txs = trace.map((f) => f.tx)
      const moved = new Set(txs).size
      const maxTx = Math.max(...txs.map(Math.abs))
      const hintAt = trace.find((f) => f.hint)?.t ?? null
      const menuAt = trace.find((f) => f.menu)?.t ?? null
      const asked = await p.evaluate(() => (window.__asked || []).filter((a) => /^POST .*\/posts$/.test(a)))
      if (reduce) expect(moved === 1 && txs[0] === 0, `${where}: no shake`, { distinct: moved })
      else {
        let steps = 0
        for (let i = 1; i < txs.length; i++) if (txs[i] !== txs[i - 1]) steps++
        expect(moved >= 6 && maxTx <= 4.01 && txs.at(-1) === 0, `${where}: one soft shake (many frames, at most 4px, back at rest)`, { distinct: moved, frames: steps, maxPx: maxTx, end: txs.at(-1) })
      }
      expect(hintAt !== null && hintAt <= 60 && trace.at(-1).hint === "Choose a space first", `${where}: "Choose a space first" beside the picker at once`, { hintAt, text: trace.at(-1).hint })
      expect(menuAt !== null && (reduce ? menuAt <= 120 : menuAt >= 300), `${where}: the picker opens${reduce ? " at once" : " once the shake has settled"}`, { menuAt })
      expect(Math.min(...trace.map((f) => f.postO)) >= before.o - 0.001, `${where}: Post keeps its look (never greyed out)`, { before: before.o, min: Math.min(...trace.map((f) => f.postO)) })
      expect(asked.length === 0, `${where}: nothing was sent`, asked)
      const ring = await p.evaluate(() => getComputedStyle(document.querySelector("button[data-composer-space]")).boxShadow)
      expect(/(217, 119, 6|oklab\(0\.66[^)]*\/ 0\.35\)) 0px 0px 0px 2px/.test(ring), `${where}: the picker has its amber ring`, ring)
      /* A space chosen: the line and the ring go, Post is ready. */
      if (phone) {
        const row = await p.evaluateHandle(() => [...document.querySelectorAll("[data-sheet-root] button")].find((b) => /General/.test(b.textContent || "")))
        await row.asElement()?.click()
      } else {
        const item = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"]')].find((b) => /General/.test(b.textContent || "")))
        await item.asElement()?.click()
      }
      await sleep(700)
      const after = await p.evaluate((scope) => ({ hint: !!document.querySelector("[data-composer-space-hint]"), ready: document.querySelector(`${scope} [data-composer-post]`)?.dataset.postReady, space: document.querySelector("button[data-composer-space]")?.textContent }), scope)
      expect(!after.hint && after.ready === "true", `${where}: a space chosen, the line goes and Post is ready`, after)
      expect(errors.length === 0, `${where}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("SOUND")) {
    console.log("\nSOUND: the post's pop, rendered offline")
    const { p, errors } = await open(DESK)
    const m = await p.evaluate(async () => {
      const { postPop, POST_POP } = window.__sound
      const rate = 48000
      const ctx = new OfflineAudioContext(1, Math.round(rate * 0.5), rate)
      const end = postPop(ctx, 0, ctx.destination)
      const buf = await ctx.startRendering()
      const d = buf.getChannelData(0)
      let peak = 0
      let peakAt = 0
      let lastLoud = 0
      for (let i = 0; i < d.length; i++) {
        const v = Math.abs(d[i])
        if (v > peak) {
          peak = v
          peakAt = i
        }
        if (v > peak * 0.001 && v > 0.00002) lastLoud = i
      }
      const maxIn = (a, b) => {
        let m = 0
        for (let i = Math.round(a * rate); i < Math.min(d.length, Math.round(b * rate)); i++) m = Math.max(m, Math.abs(d[i]))
        return m
      }
      /* The pitch from the time between upward zero crossings, early and late. */
      const pitch = (a, b) => {
        const ups = []
        for (let i = Math.round(a * rate) + 1; i < Math.round(b * rate); i++) if (d[i - 1] < 0 && d[i] >= 0) ups.push(i)
        return ups.length > 1 ? Math.round((rate * (ups.length - 1)) / (ups.at(-1) - ups[0])) : null
      }
      /* The biggest jump between two samples, against the peak: a click is a step far bigger than the wave's own. */
      let jump = 0
      for (let i = 1; i < d.length; i++) jump = Math.max(jump, Math.abs(d[i] - d[i - 1]))
      const endIdx = Math.round(end * rate)
      return {
        shape: POST_POP,
        peak: +peak.toFixed(4),
        peakMs: +((peakAt / rate) * 1000).toFixed(1),
        audibleMs: Math.round((lastLoud / rate) * 1000),
        endMs: Math.round(end * 1000),
        first8: [...d.slice(0, 8)].map((v) => +v.toExponential(2)),
        firstMs: +maxIn(0, 0.001).toFixed(5),
        lastSamples: [...d.slice(endIdx - 6, endIdx)].map((v) => +v.toExponential(2)),
        last5ms: +maxIn(end - 0.005, end).toFixed(6),
        afterEnd: +maxIn(end, 0.5).toFixed(6),
        pitchEarly: pitch(0.012, 0.035),
        pitchLate: pitch(0.11, 0.17),
        maxStepRatio: +(jump / peak).toFixed(3),
      }
    })
    console.log("   ", JSON.stringify(m))
    expect(m.peak >= 0.015 && m.peak <= 0.035, "very soft: its peak near a like's", m.peak)
    expect(m.endMs <= 220 && m.audibleMs <= 220, "short: under 220ms", { audibleMs: m.audibleMs, endMs: m.endMs })
    expect(m.firstMs < m.peak * 0.05, "no click at its start (the first ms is near silence)", { firstMs: m.firstMs, first8: m.first8 })
    expect(m.last5ms < m.peak * 0.03 && m.afterEnd === 0, "a clean end (the last 5ms near zero, silence after)", { last5ms: m.last5ms, afterEnd: m.afterEnd })
    expect(m.pitchEarly > m.pitchLate && m.pitchEarly <= 640 && m.pitchLate >= 380, "one falling pop (pitch glides down), no second note", { early: m.pitchEarly, late: m.pitchLate })
    expect(m.maxStepRatio < 0.2, "no sample to sample step anywhere near a click", m.maxStepRatio)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  const firstPostTop = () => {
    const el = document.querySelector("[data-feed-list] > [data-post]")
    const ed = document.querySelector("[data-composer-editor]")
    return { top: el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null, ed: ed ? Math.round(Number(getComputedStyle(ed).opacity) * 100) / 100 : null, state: document.querySelector("[data-composer]")?.getAttribute("data-composer") ?? null, y: Math.round(window.scrollY) }
  }

  if (want("DESKCLOSE")) {
    console.log("\nDESKCLOSE: the editor in place on a computer, Cancel and Post")
    const { p, errors } = await open(DESK)
    await p.evaluate(() => document.querySelector("[data-composer-open]")?.click())
    await p.waitForSelector("[data-composer=open] [data-composer-title]")
    await sleep(700)
    const shut = await record(p, () => p.evaluate(() => document.querySelector("[data-composer=open] [data-composer-cancel]")?.click()), 700, firstPostTop)
    const fold = moveOf(shut)
    expect(fold.distinct >= 8 && fold.ms >= 150, "Cancel: the posts come up over many frames", fold)
    expect(fold.biggestStep <= fold.span * 0.3, "Cancel: no frame jumps more than 30% of the way", fold)
    const fades = new Set(shut.map((f) => f.ed).filter((v) => v !== null)).size
    expect(fades >= 4 || shut.every((f) => f.ed === null || f.ed === 1) === false, "Cancel: the editor's content fades, it is not cut", { opacitySteps: fades })
    expect(shut.at(-1).state === "closed", "Cancel: closed at the end", shut.at(-1).state)
    /* After the fold, the end: the next frames must not move the posts again (no snap when the card is redrawn closed). */
    const settled = shut.slice(-10).map((f) => f.top)
    expect(new Set(settled).size === 1, "Cancel: still once it has closed (no snap after)", settled)
    await sleep(500)

    /* Post from a page scrolled down: the fold, then a glide up, then the post lands. */
    await p.evaluate(() => document.querySelector("[data-composer-open]")?.click())
    await p.waitForSelector("[data-composer=open] [data-composer-title]")
    await sleep(600)
    await fill(p, "[data-composer=open]")
    await p.evaluate(() => window.scrollTo(0, 700))
    await sleep(400)
    await p.evaluate(() => (window.__postLatency = 500))
    const trace = await record(
      p,
      () => p.evaluate(() => document.querySelector("[data-composer=open] [data-composer-post]")?.click()),
      2600,
      () => {
        const mine = document.querySelector('[data-feed-list] > [data-post^="b"]')
        const c = document.querySelector("[data-composer]")
        return { y: Math.round(window.scrollY), state: c?.getAttribute("data-composer") ?? null, landed: !!mine, lit: !!mine?.querySelector("[data-post-highlight]"), mineTop: mine ? Math.round(mine.getBoundingClientRect().top) : null }
      },
    )
    const closedAt = trace.find((f) => f.state === "closed")?.t ?? null
    const after = trace.filter((f) => closedAt !== null && f.t >= closedAt)
    const glide = moveOf(after, "y")
    expect(closedAt !== null, "Post: the editor folds closed", closedAt)
    expect(after[0]?.y >= 500 && after.at(-1)?.y < 120, "Post: the page goes up to where the post goes", { from: after[0]?.y, to: after.at(-1)?.y })
    expect(glide.distinct >= 8 && glide.biggestStep <= glide.span * 0.25, "Post: it glides there (many frames, none more than a quarter of the way)", glide)
    const landedAt = trace.find((f) => f.landed)?.t ?? null
    expect(landedAt !== null && trace.some((f) => f.lit), "Post: the post lands with its highlight", { landedAt })
    const lastTop = trace.filter((f) => f.mineTop !== null).map((f) => f.mineTop)
    expect(lastTop.length && lastTop.at(-1) > 0 && lastTop.at(-1) < 450, "Post: the new post is on screen at the end", lastTop.at(-1))
    await p.screenshot({ path: join(shots, "desk-posted.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\n  pictures: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
