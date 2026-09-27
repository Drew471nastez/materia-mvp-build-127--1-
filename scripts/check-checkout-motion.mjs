/**
 * ===========================================================================
 *  LEAVING THE CHECKOUT, AND FINISHING IT, FILMED
 * ===========================================================================
 * The real checkout (scripts/render-checkout-motion.tsx) between two pages,
 * in headless Chromium with view transitions, filmed with the DevTools
 * screencast: every frame the compositor puts on screen, with its time. A
 * view transition stops the page's own animation frames while it waits, so
 * nothing measured from inside the page could see a frozen screen; the film
 * does.
 *
 *   BACK      "I click back, nothing happens, and it takes me back abruptly
 *             after 5 seconds." Pressed with the mouse, down and up: the
 *             first frame that differs from the checkout comes within
 *             100ms of the click, the page behind is on screen soon after
 *             it is drawn (DELAY), it arrives as a cross-fade and not in one
 *             frame, and no stretch of the film is frozen for longer than
 *             the hold. Through history (reached from the product page) and
 *             by replace (a shared link), at 1280 and on a 390 phone, and
 *             once with a page behind slower than the hold.
 *   FINISH    "After finishing the checkout, paid or free, the transition
 *             must be smooth." Get it free, the check, the receipt: every
 *             frame from the press to the receipt shows the paid screen or
 *             the receipt, never the bare loading page under them.
 *   ARRIVE    back from a bank's page with the payment made: the first frame
 *             is "Finishing your order", never the form with Pay on it.
 *   SKELETON  the loading skeleton laid over the page: the tip's line and
 *             its track of five, always open now, and the total under them
 *             sit where the page's own do, so nothing moves as it lands.
 *
 *   PROBE_CSS=source node scripts/check-checkout-motion.mjs
 *   BEFORE=<git ref> films that commit's checkout-client.tsx instead, to
 *   see the fault this fixes.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".checkout-motion-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-checkout-motion-")), "shots")
mkdirSync(shots, { recursive: true })
const BEFORE = process.env.BEFORE || ""
const beforeFile = join(root, "app/checkout/.probe-before-client.tsx")
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TOKEN = "rt_" + "a".repeat(40)

try {
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
  if (BEFORE) writeFileSync(beforeFile, execFileSync("git", ["show", `${BEFORE}:app/checkout/checkout-client.tsx`], { cwd: root, encoding: "utf8" }))
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-checkout-motion.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": '""' },
    alias: { "@": ".", "next/navigation": "./.checkout-motion-probe/navigation.js", "next/link": "./.checkout-motion-probe/link.jsx", "next/image": "./.checkout-motion-probe/image.jsx" },
    plugins: BEFORE
      ? [{ name: "before", setup: (b) => b.onResolve({ filter: /app\/checkout\/checkout-client$/ }, () => ({ path: beforeFile })) }]
      : [],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  /* A page that reads the films: each frame decoded on a canvas and measured. */
  const reader = await browser.newPage()

  const open = async (vp, query, { processDelay = 250, ready = '[data-page="checkout"]' } = {}) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    p.__errors = []
    p.on("pageerror", (e) => p.__errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", async (r) => {
      const url = r.url()
      if (url.startsWith("https://storelib.com/checkout")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.includes("/api/checkout/process") || url.includes("/api/checkout/confirm-payment")) {
        await sleep(processDelay)
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ receiptToken: TOKEN, amountCents: 0 }) })
      }
      if (url.startsWith("https://storelib.com/")) return r.respond({ status: 204, body: "" })
      return r.abort()
    })
    /* What happened when, from inside the page, for PROBE_DEBUG: the transition's attribute and the checkout leaving. */
    await p.evaluateOnNewDocument(() => {
      window.__log = []
      const note = (what) => window.__log.push([Math.round(performance.timeOrigin + performance.now()), what])
      let seen = false
      new MutationObserver((ms) => {
        for (const m of ms) {
          if (m.type === "attributes") note("motion=" + document.documentElement.getAttribute("data-checkout-motion"))
          else if (!window.__overlayAt && document.querySelector("[data-paid-overlay]")) { window.__overlayAt = performance.timeOrigin + performance.now(); note("overlay") }
          else if (document.querySelector('[data-page="checkout"]')) seen = true
          else if (seen) { seen = false; note("checkout gone") }
        }
      }).observe(document, { attributes: true, attributeFilter: ["data-checkout-motion"], childList: true, subtree: true })
      addEventListener("click", () => {
        note("click (VT " + typeof document.startViewTransition + ")")
        let n = 0
        const f = () => { note("frame " + ++n); if (n < 6) requestAnimationFrame(f) }
        requestAnimationFrame(f)
        for (const ms of [20, 60, 120]) setTimeout(() => { const c = document.querySelector('[data-page="checkout"]'); note(`+${ms} leaving=${c?.hasAttribute("data-leaving")} opacity=${c && getComputedStyle(c).opacity}`) }, ms)
      }, true)
    })
    await p.goto("https://storelib.com/checkout?productId=2bfe1ed7-0769-4ff0-a4a4-efb90f13e897&" + query, { waitUntil: "load" })
    await p.waitForSelector(ready)
    await sleep(700)
    return p
  }

  /* Film from now, run `act` (which returns the page's time of the press), film on for `ms`. */
  const film = async (p, vp, act, ms) => {
    const cdp = await p.createCDPSession()
    const frames = []
    cdp.on("Page.screencastFrame", (f) => {
      frames.push({ t: f.metadata.timestamp * 1000, data: f.data })
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    })
    /* Half size: every frame is encoded on the machine running the probe, and a full size film of a wide window slows the page it is filming. */
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1, maxWidth: Math.round(vp.width / 2), maxHeight: Math.round(vp.height / 2) })
    await sleep(400)
    const at = await act()
    await sleep(ms)
    await cdp.send("Page.stopScreencast")
    await sleep(100)
    /* Stamped when each was put on screen; they can arrive out of that order. */
    frames.sort((a, b) => a.t - b.t)
    return { at, frames }
  }

  /*
    Each frame, measured: how many points of it differ from the first (the
    checkout before the press) by more than a JPEG's noise, how much of the product page's teal band is showing
    and how much of the receipt's amber one (0 none, 1 all of it: the mean
    colour over the band, so a cross-fade reads as the fraction it is at),
    and whether the paid screen's ring is in the middle of it.
  */
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
          let diff = 0, teal = 0, amber = 0, bandN = 0, ring = 0
          for (let y = 0; y < vp.height; y += 4) for (let xx = 0; xx < vp.width; xx += 4) {
            const i = (y * vp.width + xx) * 4
            if (Math.max(Math.abs(d[i] - base[i]), Math.abs(d[i + 1] - base[i + 1]), Math.abs(d[i + 2] - base[i + 2])) > 6) diff++
            if (y >= 80 && y < 240) {
              teal += Math.max(0, d[i + 1] - d[i]) / 103
              amber += Math.max(0, d[i] - d[i + 2]) / 171
              bandN++
            }
            const cx = vp.width / 2, cy = vp.height / 2
            if (Math.abs(xx - cx) < 40 && Math.abs(y - cy + 40) < 40 && d[i] < 120 && d[i + 2] < 140) ring++
          }
          out.push({ t: f.t, diff, product: +(teal / bandN).toFixed(2), receipt: +(amber / bandN).toFixed(2), ring })
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
    await sleep(80)
    await p.mouse.up()
    await sleep(5)
    return p.evaluate(() => ({ down: window.__down, click: window.__click }))
  }

  const HOLD = 400
  /* ── SKELETON ── */
  for (const [label, vp] of [
    ["desktop-1280", { width: 1280, height: 860 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ].filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
    console.log(`\n${label} skeleton`)
    const where = async (query, pick) => {
      const p = await open(vp, query, { ready: query.includes("skeleton") ? "[data-checkout-skeleton]" : '[data-page="checkout"]' })
      await p.evaluate(() => document.querySelectorAll(".skeleton-deferred, .checkout-enter").forEach((e) => { e.style.animation = "none"; e.style.opacity = "1" }))
      const got = await p.evaluate(pick)
      await p.screenshot({ path: join(shots, `${label}-${query.includes("skeleton") ? "skeleton" : "page"}.png`) })
      await p.close()
      return got
    }
    const page = await where("mode=replace", () => {
      const track = document.querySelector('[data-tip] [role="radiogroup"]').getBoundingClientRect()
      const label = document.querySelector("[data-tip-label]").getBoundingClientRect()
      const total = document.querySelector('[data-totals="bottom"]').getBoundingClientRect()
      /* From the subtotal's line down: above it, the product's title wraps to however many lines it has. */
      const top = document.querySelector('[data-totals="top"]').getBoundingClientRect().top
      return { label: Math.round(label.top - top), track: Math.round(track.top - top), trackH: Math.round(track.height), total: Math.round(total.top - top) }
    })
    const sk = await where("skeleton=1", () => {
      const tip = document.querySelector("[data-skeleton-tip]")
      const track = tip.lastElementChild.getBoundingClientRect()
      const total = tip.nextElementSibling.getBoundingClientRect()
      const top = tip.parentElement.firstElementChild.getBoundingClientRect().top
      return { label: Math.round(tip.getBoundingClientRect().top - top), track: Math.round(track.top - top), trackH: Math.round(track.height), total: Math.round(total.top - top) }
    })
    const off = { label: sk.label - page.label, track: sk.track - page.track, total: sk.total - page.total }
    console.log("   page", JSON.stringify(page), "skeleton", JSON.stringify(sk))
    expect(sk.trackH === page.trackH && Math.abs(off.track) <= 6 && Math.abs(off.total) <= 6 && Math.abs(off.label) <= 6, "from the subtotal down, the skeleton's tip line, its track and the total sit within 6px of the page's own", off)
  }

  for (const [label, vp] of [
    ["desktop-1280", { width: 1280, height: 860 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: false, deviceScaleFactor: 1 }],
  ].filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
    if (process.env.SKELETON_ONLY) continue
    for (const [mode, delay] of [["history", 160], ["replace", 160], ["history", 900]]) {
      const name = `${label} back ${mode} delay=${delay}`
      console.log(`\n${name}`)
      const p = await open(vp, `mode=${mode}&delay=${delay}`)
      const len0 = await p.evaluate(() => history.length)
      const { at, frames } = await film(p, vp, () => press(p, "[data-back]"), delay + 1400)
      const m = await measure(frames, vp)
      const after = m.filter((f) => f.t > at.click)
      /* The press (Back pressed, on the way down) against the checkout as it was; the leaving (the page easing back) against the frame of the click. */
      const pressedFrame = m.find((f) => f.t > at.down && f.diff >= 6)
      const atClick = [...m].reverse().find((f) => f.t <= at.click) || m[0]
      const first = after.find((f) => f.diff - atClick.diff >= 200)
      const shown = after.find((f) => f.product > 0.03)
      const full = after.find((f) => f.product > 0.95)
      const blend = after.filter((f) => f.product > 0.05 && f.product < 0.9).length
      /* The longest time the screen stood still between the press and the page behind being fully there. */
      const until = full ? full.t : at.click + delay + 1400
      const times = [at.click, ...after.filter((f) => f.t <= until).map((f) => f.t), until]
      let still = 0
      for (let i = 1; i < times.length; i++) still = Math.max(still, times[i] - times[i - 1])
      const r = (v) => (v === undefined ? null : Math.round(v))
      const got = {
        pressShown: r(pressedFrame && pressedFrame.t - at.down),
        leavingShownAfterClick: r(first && first.t - at.click),
        productFirstShown: r(shown && shown.t - at.click),
        productFull: r(full && full.t - at.click),
        blendFrames: blend,
        longestStill: r(still),
        frames: m.length,
      }
      console.log("  ", JSON.stringify(got))
      if (process.env.PROBE_DEBUG) {
        console.log("   page:", JSON.stringify((await p.evaluate(() => window.__log)).map(([t, w]) => [Math.round(t - at.click), w])))
        console.log("   film:", JSON.stringify(m.map((f) => [Math.round(f.t - at.click), f.diff, f.product])))
      }
      expect(pressedFrame && pressedFrame.t - at.down < 100, "the press shows on screen within 100ms of pressing", got.pressShown)
      expect(first && first.t - at.click < 160, "and the page is seen to start leaving within 160ms of the click", got.leavingShownAfterClick)
      expect(shown && shown.t - at.click < Math.max(delay, 0) + HOLD + 120, "the page behind is on screen soon after it is drawn, never seconds later", got.productFirstShown)
      expect(full && full.t - at.click < delay + HOLD + 500, "and fully there within half a second of that", got.productFull)
      if (delay < HOLD) expect(blend >= 2, "it arrives as a cross-fade, not a cut", blend)
      expect(still < HOLD + 120, "no stretch of the film stands still longer than the hold", got.longestStill)
      const state = await p.evaluate(() => ({ len: history.length, path: location.pathname, motion: document.documentElement.getAttribute("data-checkout-motion"), router: (window.__router || []).map(([k]) => k) }))
      expect(state.len === len0 && !state.router.includes("push") && !state.router.includes("link"), "history does not grow and nothing is pushed", { len0, ...state })
      expect(state.motion === null, "and nothing is left on <html> once it has landed", state.motion)
      expect(p.__errors.length === 0, "no errors on the page", p.__errors)
      await p.close()
    }

    {
      const name = `${label} finish free`
      console.log(`\n${name}`)
      const p = await open(vp, "mode=replace&delay=700", { processDelay: 250 })
      await p.type("#checkout-name", "Sam Buyer")
      await p.click("#checkout-agree")
      await sleep(200)
      const button = await p.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => /Get it free/.test(b.textContent)))
      await p.evaluate((b) => b.setAttribute("data-probe-free", ""), button)
      const { at, frames } = await film(p, vp, () => press(p, "[data-probe-free]"), 250 + 1100 + 40 + 700 + 900)
      const m = await measure(frames, vp)
      /* From the paid screen's first frame (it fades in over 160ms), read from the page, to the receipt. */
      const overlayAt = await p.evaluate(() => window.__overlayAt || 0)
      const after = m.filter((f) => f.t > at.click)
      const firstRing = after.findIndex((f) => overlayAt && f.t > overlayAt + 200 && f.ring >= 8)
      const receiptAt = after.findIndex((f) => f.receipt > 0.95)
      /* Between the check appearing and the receipt being fully there, every frame has the ring or the receipt in it. */
      const between = firstRing >= 0 && receiptAt > firstRing ? after.slice(firstRing, receiptAt + 1) : []
      const bare = between.filter((f) => f.ring < 8 && f.receipt < 0.3)
      const blend = between.filter((f) => f.receipt > 0.3 && f.receipt < 0.9).length
      const got = { check: firstRing >= 0 ? Math.round(after[firstRing].t - at.click) : null, receipt: receiptAt >= 0 ? Math.round(after[receiptAt].t - at.click) : null, frames: between.length, bare: bare.length, blend }
      console.log("  ", JSON.stringify(got))
      if (process.env.PROBE_DEBUG) console.log("   film:", JSON.stringify(after.map((f) => [Math.round(f.t - at.click), f.ring, f.receipt])))
      expect(firstRing >= 0 && receiptAt > firstRing, "the check, then the receipt", got)
      expect(bare.length === 0, "and no frame between them is the bare page: the paid screen is held until the receipt is under it", bare.slice(0, 3).map((f) => ({ ...f, t: Math.round(f.t - at.click) })))
      expect(blend >= 1, "the paid screen fades off the receipt rather than vanishing: a frame is caught part way", blend)
      const end = await p.evaluate(() => ({ held: document.querySelectorAll("[data-paid-held]").length, path: location.pathname, router: (window.__router || []).filter(([k]) => k !== "prefetch" || true) }))
      expect(end.held === 0 && end.path.startsWith("/receipt/"), "the held screen is gone once the receipt is up", end)
      expect(end.router.some(([k, h]) => k === "prefetch" && h === `/receipt/${TOKEN}`), "the receipt was asked for while the check was drawing", end.router)
      expect(p.__errors.length === 0, "no errors on the page", p.__errors)
      await p.screenshot({ path: join(shots, `${label}-receipt.png`) })
      await p.close()
    }

    {
      const name = `${label} arrive from the bank`
      console.log(`\n${name}`)
      const p = await browser.newPage()
      await p.setViewport(vp)
      await p.setRequestInterception(true)
      p.on("request", async (r) => {
        const url = r.url()
        if (url.startsWith("https://storelib.com/checkout")) return r.respond({ status: 200, contentType: "text/html", body: html })
        if (url.includes("/api/checkout/confirm-payment")) {
          await sleep(900)
          return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ receiptToken: TOKEN, amountCents: 999 }) })
        }
        return url.startsWith("https://storelib.com/") ? r.respond({ status: 204, body: "" }) : r.abort()
      })
      /* Watch from the first frame the document draws. */
      await p.evaluateOnNewDocument(() => {
        window.__seen = []
        const look = () => {
          const o = document.querySelector("[data-paid-overlay]")
          const pay = document.querySelector("[data-page=checkout]")
          if (pay || o) window.__seen.push(o ? o.getAttribute("data-paid-state") : "form")
          if (window.__seen.length < 400) requestAnimationFrame(look)
        }
        requestAnimationFrame(look)
      })
      await p.goto("https://storelib.com/checkout?productId=x&mode=replace&delay=300&payment_intent=pi_123&payment_intent_client_secret=pi_123_secret_456&redirect_status=succeeded", { waitUntil: "load" })
      await sleep(250)
      await p.screenshot({ path: join(shots, `${label}-finishing.png`) })
      await sleep(3200)
      const seen = await p.evaluate(() => window.__seen)
      const order = seen.filter((s, i) => i === 0 || s !== seen[i - 1])
      expect(order[0] === "finishing" && !order.includes("form"), "the first frame is Finishing your order, and the form is never shown", order)
      expect(order.includes("paid"), "then the check", order)
      const end = await p.evaluate(() => location.pathname)
      expect(end.startsWith("/receipt/"), "then the receipt", end)
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
  rmSync(beforeFile, { force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
