/**
 * ===========================================================================
 *  A BACK PRESS THAT BLOCKS, FILMED
 * ===========================================================================
 * "Sometimes trying to go back from a checkout or whatever takes too much and
 * blocks." The checkout's own Back was fixed once for a warm page behind;
 * this films the cases that were never measured, where the page behind is
 * slow, never comes, or is reached by the browser's own back rather than by
 * the control:
 *
 *   SLOW      the page behind takes 2.5s. Every frame from the press must
 *             keep moving: the press answered, the page seen to leave, and
 *             no stretch of the film standing still for longer than a
 *             blink. A view transition that waits on the network freezes
 *             the screen for exactly as long as it waits, and the film is
 *             the only instrument that sees it (a frozen page runs no
 *             animation frames of its own).
 *   OFFLINE   the page behind never comes. The press must still be answered
 *             and the checkout must come back to life rather than sit under
 *             a spinner for ever.
 *   DEAD      history.back() that does nothing (an entry the browser
 *             replaced, a webview that reports a length it cannot go back
 *             through). Something must happen anyway.
 *   GESTURE   the browser's own back (page.goBack), the iPhone edge swipe:
 *             the page has to answer that press too.
 *   DOUBLE    two taps on Back in quick succession: one navigation, one
 *             history entry.
 *
 * Numbers reported per case: ms from the press to the first frame that
 * differs (first change), ms to the page behind fully painted, and the
 * longest stretch of film with no change at all (the freeze).
 *
 *   PROBE_CSS=source node scripts/check-back-stall.mjs
 *   BEFORE=<git ref> films that commit's checkout-client.tsx instead.
 */
import { execFileSync } from "node:child_process"
import { Buffer } from "node:buffer"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".back-stall-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-back-stall-")), "shots")
mkdirSync(shots, { recursive: true })
const BEFORE = process.env.BEFORE || ""
const beforeFile = join(root, "app/(storelib)/checkout/.probe-stall-client.tsx")
let broken = 0
const rows = []
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = {
  push: (h) => { log("push", h); window.dispatchEvent(new CustomEvent("probe-nav", { detail: h })) },
  replace: (h) => { log("replace", h); window.dispatchEvent(new CustomEvent("probe-nav", { detail: h })) },
  prefetch: (h) => log("prefetch", h),
  back: () => { log("back"); history.back() },
  refresh: () => log("refresh"),
}
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); window.dispatchEvent(new CustomEvent("probe-nav", { detail: href })) } } }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
if (BEFORE) writeFileSync(beforeFile, execFileSync("git", ["show", `${BEFORE}:app/(storelib)/checkout/checkout-client.tsx`], { cwd: root, encoding: "utf8" }))

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-checkout-motion.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": '""' },
  alias: { "@": ".", "next/navigation": "./.back-stall-probe/navigation.js", "next/link": "./.back-stall-probe/link.jsx", "next/image": "./.back-stall-probe/image.jsx" },
  plugins: BEFORE ? [{ name: "before", setup: (b) => b.onResolve({ filter: /app\/checkout\/checkout-client$/ }, () => ({ path: beforeFile })) }] : [],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

/* The bar's own router: the address it reports is the one the page has COMMITTED, as Next's is. */
writeFileSync(join(stubs, "bar-navigation.js"), `import { useSyncExternalStore } from "react"
const subs = new Set()
const read = () => window.__path || location.pathname
export const usePathname = () => useSyncExternalStore((f) => { subs.add(f); const t = setInterval(f, 16); return () => { subs.delete(f); clearInterval(t) } }, read, () => "/account/library")
const params = new URLSearchParams(location.search)
export const useSearchParams = () => params
export const useRouter = () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => history.back(), refresh: () => {} })
`)
await build({
  entryPoints: [join(root, "scripts/render-route-bar.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.back-stall-probe/bar-navigation.js" },
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "bar.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const barJs = readFileSync(join(stubs, "bar.js"), "utf8")
const barHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${barJs.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const reader = await browser.newPage()

const open = async (vp, query) => {
  const p = await browser.newPage()
  await p.setViewport(vp)
  p.__errors = []
  p.on("pageerror", (e) => p.__errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (url.startsWith("https://storelib.com/checkout")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("https://storelib.com/")) return r.respond({ status: 204, body: "" })
    return r.abort()
  })
  await p.goto("https://storelib.com/checkout?productId=2bfe1ed7-0769-4ff0-a4a4-efb90f13e897&" + query, { waitUntil: "load" })
  await p.waitForSelector('[data-page="checkout"]')
  await sleep(700)
  return p
}

/* Film from now, run `act` (which returns the press's own times), film on for `ms`. */
const film = async (p, vp, act, ms) => {
  const cdp = await p.createCDPSession()
  const frames = []
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1, maxWidth: Math.round(vp.width / 2), maxHeight: Math.round(vp.height / 2) })
  await sleep(400)
  const at = await act()
  await sleep(ms)
  await cdp.send("Page.stopScreencast")
  await sleep(100)
  frames.sort((a, b) => a.t - b.t)
  return { at, frames }
}

/* Each frame against the first: how much of it differs, and how much of the product page's teal band is showing. */
const measure = (frames, vp) =>
  reader.evaluate(
    async (frames, vp) => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/jpeg;base64," + src })
      const cv = document.createElement("canvas")
      cv.width = vp.width
      cv.height = vp.height
      const x = cv.getContext("2d", { willReadFrequently: true })
      let base = null
      const out = []
      for (const f of frames) {
        const img = await load(f.data)
        x.drawImage(img, 0, 0, vp.width, vp.height)
        const d = x.getImageData(0, 0, vp.width, vp.height).data
        if (!base) base = d.slice()
        let diff = 0, teal = 0, bandN = 0
        for (let y = 0; y < vp.height; y += 4) for (let xx = 0; xx < vp.width; xx += 4) {
          const i = (y * vp.width + xx) * 4
          if (Math.max(Math.abs(d[i] - base[i]), Math.abs(d[i + 1] - base[i + 1]), Math.abs(d[i + 2] - base[i + 2])) > 6) diff++
          if (y >= 80 && y < 240) { teal += Math.max(0, d[i + 1] - d[i]) / 103; bandN++ }
        }
        out.push({ t: f.t, diff, product: +(teal / bandN).toFixed(2) })
      }
      return out
    },
    frames,
    vp,
  )

const press = async (p, sel) => {
  const box = await p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await p.evaluate(() => {
    window.__down = 0
    window.__click = 0
    addEventListener("pointerdown", (e) => { window.__down = performance.timeOrigin + e.timeStamp }, { capture: true, once: true })
    addEventListener("click", (e) => { window.__click = performance.timeOrigin + e.timeStamp }, { capture: true, once: true })
  })
  await p.mouse.move(box.x, box.y)
  await p.mouse.down()
  await sleep(60)
  await p.mouse.up()
  await sleep(5)
  return p.evaluate(() => ({ down: window.__down, click: window.__click }))
}

/*
  What the film says about one press: when the screen first changed, when the
  page behind was fully painted, and the longest it stood perfectly still.
*/
const read = (m, at, until) => {
  const after = m.filter((f) => f.t > at.click)
  const atClick = [...m].reverse().find((f) => f.t <= at.click) || m[0]
  const pressed = m.find((f) => f.t > at.down && f.diff >= 6)
  const first = after.find((f) => Math.abs(f.diff - atClick.diff) >= 200)
  const full = after.find((f) => f.product > 0.95)
  const end = full ? full.t : until
  const ts = [at.click, ...after.filter((f) => f.t <= end).map((f) => f.t), end]
  let still = 0
  for (let i = 1; i < ts.length; i++) still = Math.max(still, ts[i] - ts[i - 1])
  const r = (v) => (v === undefined || v === null ? null : Math.round(v))
  return {
    firstChange: r(pressed && pressed.t - at.down),
    leaveSeen: r(first && first.t - at.click),
    painted: r(full && full.t - at.click),
    freeze: r(still),
  }
}

const VPS = [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: false, deviceScaleFactor: 1 }],
  ["desktop-1280", { width: 1280, height: 860 }],
].filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))

try {
  for (const [label, vp] of VPS) {
    /* ── SLOW ── the page behind takes 2.5s: nothing may stand still waiting for it. */
    for (const delay of [2500]) {
      const name = `${label} back, page behind ${delay}ms`
      console.log(`\n${name}`)
      const p = await open(vp, `mode=history&delay=${delay}`)
      const { at, frames } = await film(p, vp, () => press(p, "[data-back]"), delay + 900)
      const m = await measure(frames, vp)
      const got = read(m, at, at.click + delay + 900)
      rows.push([name, got])
      console.log("  ", JSON.stringify(got))
      /* One frame caught in the middle of the fade, to look at: the checkout going off the page behind. */
      const mid = m.find((f) => f.product > 0.2 && f.product < 0.85)
      if (mid) writeFileSync(join(shots, `${label}-midfade.jpg`), Buffer.from(frames.find((f) => f.t === mid.t).data, "base64"))
      await p.screenshot({ path: join(shots, `${label}-slow.png`) })
      expect(got.firstChange !== null && got.firstChange < 180, "the press shows within a tenth of a second or so", got.firstChange)
      expect(got.leaveSeen !== null && got.leaveSeen < 160, "the page is seen to leave within 160ms", got.leaveSeen)
      /* The quiet after the press is the page having eased back and the spinner not yet due (370ms), never a wait on the network: the view transition this replaces stood still for 429ms with the OLD page on screen. */
      expect(got.freeze !== null && got.freeze < 320, "no stretch of the film stands still for a third of a second", got.freeze)
      expect(p.__errors.length === 0, "no errors on the page", p.__errors)
      await p.close()
    }

    /* ── OFFLINE ── the page behind never comes. */
    {
      const name = `${label} back, page behind never comes`
      console.log(`\n${name}`)
      const p = await open(vp, "mode=history&delay=160")
      await p.evaluate(() => { window.__delay = -1 })
      const { at, frames } = await film(p, vp, () => press(p, "[data-back]"), 2600)
      const m = await measure(frames, vp)
      const got = read(m, at, at.click + 2600)
      rows.push([name, got])
      console.log("  ", JSON.stringify(got))
      await p.screenshot({ path: join(shots, `${label}-offline.png`) })
      expect(got.firstChange !== null && got.firstChange < 180, "the press shows within a tenth of a second or so", got.firstChange)
      expect(got.freeze !== null && got.freeze < 400, "the checkout keeps drawing rather than freezing", got.freeze)
      const left = await p.evaluate(() => ({ motion: document.documentElement.getAttribute("data-checkout-motion"), still: !!document.querySelector("[data-checkout-leaving]") }))
      expect(left.motion === null && !left.still, "and nothing of the move is left over it", left)
      expect(p.__errors.length === 0, "no errors on the page", p.__errors)
      await p.close()
    }

    /* ── DEAD ── history.back() that does nothing at all. */
    {
      const name = `${label} back with a dead history entry`
      console.log(`\n${name}`)
      const p = await open(vp, "mode=history&delay=160")
      await p.evaluate(() => { history.back = () => {} })
      const { at, frames } = await film(p, vp, () => press(p, "[data-back]"), 2600)
      const m = await measure(frames, vp)
      const got = read(m, at, at.click + 2600)
      const landed = await p.evaluate(() => ({ path: location.pathname, router: (window.__router || []).map(([k]) => k) }))
      rows.push([name, { ...got, ...landed }])
      console.log("  ", JSON.stringify({ ...got, ...landed }))
      await p.screenshot({ path: join(shots, `${label}-dead.png`) })
      expect(got.firstChange !== null && got.firstChange < 180, "the press shows within a tenth of a second or so", got.firstChange)
      expect(landed.router.includes("replace") || got.painted !== null, "a back that did nothing is followed by the page itself", landed)
      expect(p.__errors.length === 0, "no errors on the page", p.__errors)
      await p.close()
    }

    /* ── GESTURE ── the browser's own back, with a slow page behind. */
    {
      const name = `${label} the browser's own back, page behind 2500ms`
      console.log(`\n${name}`)
      const p = await open(vp, "mode=history&delay=2500")
      const { at, frames } = await film(
        p,
        vp,
        async () => {
          const t = await p.evaluate(() => performance.timeOrigin + performance.now())
          p.goBack().catch(() => {})
          return { down: t, click: t }
        },
        3400,
      )
      const m = await measure(frames, vp)
      const got = read(m, at, at.click + 3400)
      rows.push([name, got])
      console.log("  ", JSON.stringify(got))
      await p.screenshot({ path: join(shots, `${label}-gesture.png`) })
      expect(got.firstChange !== null && got.firstChange < 200, "the gesture is answered within 200ms", got.firstChange)
      expect(got.freeze !== null && got.freeze < 400, "and nothing stands still waiting for the page behind", got.freeze)
      expect(p.__errors.length === 0, "no errors on the page", p.__errors)
      await p.close()
    }

    /* ── DOUBLE ── two taps on Back. */
    {
      const name = `${label} two taps on Back`
      console.log(`\n${name}`)
      const p = await open(vp, "mode=history&delay=900")
      const len0 = await p.evaluate(() => history.length)
      const at = await press(p, "[data-back]")
      await press(p, "[data-back]").catch(() => {})
      await sleep(1600)
      const state = await p.evaluate(() => ({ len: history.length, path: location.pathname, router: (window.__router || []).map(([k]) => k) }))
      rows.push([name, state])
      console.log("  ", JSON.stringify({ len0, ...state }))
      expect(state.len === len0, "one press, one history entry", { len0, len: state.len })
      expect(state.router.filter((k) => k === "replace" || k === "push").length <= 1, "and one navigation", state.router)
      expect(p.__errors.length === 0, "no errors on the page", p.__errors)
      await p.close()
    }
  }

  /*
    ── THE LOADING LINE ── the buyer's own answer to a slow navigation
    (components/navigation/route-loading-bar.tsx). It started on a link press
    only, so the browser's own back said nothing at all however long it took.
  */
  for (const [label, vp] of VPS) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    p.__errors = []
    p.on("pageerror", (e) => p.__errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith("https://storelib.com/account/library") ? r.respond({ status: 200, contentType: "text/html", body: barHtml }) : r.url().startsWith("https://storelib.com/") ? r.respond({ status: 204, body: "" }) : r.abort()))
    await p.goto("https://storelib.com/account/library?delay=2500", { waitUntil: "load" })
    await p.waitForSelector("[data-open]")
    await sleep(300)

    const barAfter = (act) =>
      p.evaluate(async (which) => {
        const began = performance.now()
        if (which === "click") document.querySelector("[data-open]").click()
        else history.back()
        for (let i = 0; i < 200; i++) {
          if (document.querySelector(".route-loading-bar")) return Math.round(performance.now() - began)
          await new Promise((r) => requestAnimationFrame(r))
        }
        return null
      }, act)

    console.log(`\n${label} the loading line`)
    /* A popstate that lands where the page already is (the search screen's own entry) starts nothing. */
    const onSame = await p.evaluate(async () => {
      history.pushState({ overlay: 1 }, "")
      await new Promise((r) => setTimeout(r, 60))
      const began = performance.now()
      history.back()
      for (let i = 0; i < 40; i++) {
        if (document.querySelector(".route-loading-bar")) return Math.round(performance.now() - began)
        await new Promise((r) => requestAnimationFrame(r))
      }
      return null
    })
    await sleep(200)
    const onClick = await barAfter("click")
    await sleep(2800)
    const onBack = await barAfter("back")
    await sleep(2800)
    rows.push([`${label} loading line: click / back`, { firstChange: onClick, painted: onBack, freeze: null }])
    console.log("  ", JSON.stringify({ onClick, onBack, onSameAddress: onSame }))
    if (process.env.PROBE_DEBUG) console.log("   debug:", JSON.stringify(await p.evaluate(() => ({ path: window.__path, loc: location.pathname, html: document.body.innerHTML.slice(0, 200) }))))
    expect(onClick !== null && onClick < 600, "a slow press shows the line", onClick)
    expect(onBack !== null && onBack < 600, "and so does the browser's own back", onBack)
    expect(onSame === null, "a back to the address already showing shows nothing", onSame)
    expect(p.__errors.length === 0, "no errors on the page", p.__errors)
    await p.close()
  }
} finally {
  await browser.close()
  try { execFileSync("rm", ["-rf", stubs, beforeFile]) } catch { /* nothing to clear */ }
}

console.log("\n─ case ─────────────────────────────────────────────  first change / painted / freeze")
for (const [name, got] of rows) console.log(`  ${name.padEnd(50)}  ${got.firstChange ?? "-"} / ${got.painted ?? "-"} / ${got.freeze ?? "-"}`)
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall ok")
process.exit(broken ? 1 : 0)
