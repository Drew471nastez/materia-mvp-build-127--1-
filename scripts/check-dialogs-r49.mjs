/**
 * ===========================================================================
 *  DIALOGS, ROUND 49, MEASURED: THE LONGEST TASK WHILE ONE OPENS
 * ===========================================================================
 * Opening any dialog in /app was one long main-thread task (130 to 160ms on
 * a computer in the analytics engineer's trace), two whole-document style
 * recalculations: the shell's `html:has([role=dialog][aria-modal=true])`
 * rules, re-asked over the whole document by every dialog's `role` and by the
 * `aria-hidden` Radix puts on every child of <body>.
 *
 * Mounts the real analytics page (scripts/render-dialogs-page.tsx over
 * scripts/render-analytics-page.tsx, the network answered from fixtures) with
 * the shell's pill and cookie card, and opens, RUNS times each:
 *
 *   detail   Analytics' opened chart (Radix Dialog)
 *   send     Send analytics (Radix Dialog on a computer, the sheet on a phone)
 *   dialog   the shared Dialog as the settings dialogs use it
 *   custom   a hand-made role=dialog aria-modal=true, as most of /app draws them
 *   nested   that, with a second one opened over it
 *   menu     the products page's ... menu, the shared action sheet (phone only)
 *
 * For each: every long task (over 50ms, PerformanceObserver "longtask") from
 * the press to 700ms after it, the longest and the median of the longest; and
 * with TRACE=1 the largest style recalculation (elements) in the opening.
 * It also checks what <html> says: data-modal-open is the number of dialogs
 * open (2 with the nested one), back to 1 when the top one closes, and gone
 * when the last does, and the pill steps under the dialog (z-index 39) and
 * gives up its taps while one is open, as it did under the :has() rules.
 *
 *   node scripts/check-dialogs-r49.mjs
 *   PAGE_ROOT=<a checkout of the commit before> node scripts/check-dialogs-r49.mjs   (the before)
 *   RUNS=5  CPU=4 (phone CPU slowdown, default 4)  TRACE=1 (the trace: style
 *   passes, time by kind, what forced a pass)
 *
 * To find out why, with TRACE=1: INVAL=1 lists Chromium's reasons for each
 * restyle, SELSTATS=1 the selectors the style passes spent their time on.
 * Without TRACE, EXPERIMENT=1 times what a dialog does to the document, one
 * change at a time (body attributes, aria-hidden, an element put in, body
 * pointer-events), and adds, on the phone page: PE=1 body pointer-events with
 * the stylesheets on and off, ISOLATE=<regex> the cost of putting an element
 * in with each matching rule taken out alone, VARIANTS=1 the card rule
 * (NEVER A VEIL OVER A CARD) written other ways, and whether a press inside a
 * pictured link still keeps full strength.
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 * Exit 1 when a check fails (except under PAGE_ROOT, which only reports).
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const target = process.env.PAGE_ROOT || root
const report = !!process.env.PAGE_ROOT
const RUNS = Number(process.env.RUNS || 5)
const CPU = Number(process.env.CPU || 4)
const TRACE = !!process.env.TRACE
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const dir = join(root, ".r49-dialogs-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}\nexport function isNativeApp() { return false }\nexport async function triggerHaptic() {}\nexport function openExternal() {}\nexport function nativePlatform() { return "web" }\nexport function shareNative() { return Promise.resolve(false) }\n`)
writeFileSync(join(dir, "next-navigation.js"), `const router = { replace() {}, push() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"\nexport default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }\n`)
writeFileSync(join(dir, "next-dynamic.js"), `import * as React from "react"
export default function dynamic(load) {
  const Lazy = React.lazy(() => load().then((c) => ({ default: c.default || c })))
  return function Dynamic(props) { return React.createElement(React.Suspense, { fallback: null }, React.createElement(Lazy, props)) }
}
`)
writeFileSync(join(dir, "no-watch.js"), `export function holdModalWatch() { return () => {} }\n`)
/* A checkout from before the watch has no lib/ui/modal-open: the page holds a stand-in that does nothing. */
const watch = existsSync(join(target, "lib/ui/modal-open.ts")) ? null : join(dir, "no-watch.js")

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : report ? "note" : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok && !report) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }

let server
let browser
const summary = []
try {
  const css = await appCss(root, target !== root && existsSync(join(target, "app/globals.css")) ? join(target, "app/globals.css") : null)
  const fonts = new Map()
  const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
    const name = path.split("/").pop()
    fonts.set(name, path)
    return `url(/__font/${name})`
  })
  const bundle = join(dir, "probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-dialogs-page.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:next/dynamic=${join(dir, "next-dynamic.js")}`,
    ...(watch ? [`--alias:@/lib/ui/modal-open=${watch}`] : []),
    `--alias:@=${target}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>
window.__long = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ at: e.startTime, ms: Math.round(e.duration) }) }).observe({ type: "longtask", buffered: true }) } catch {}
</script></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    if (req.url.startsWith("/__font/")) {
      const f = fonts.get(req.url.split("/").pop())
      if (f && existsSync(f)) { res.writeHead(200, { "content-type": "font/woff2" }); return res.end(readFileSync(f)) }
    }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu"] })

  const OPENERS = {
    detail: '[data-card="sales-over-time"] [data-view-report]',
    send: "[data-analytics-send]",
    dialog: '[data-open="dialog"]',
    custom: '[data-open="custom"]',
    nested: '[data-open="nested"]',
    menu: '[data-open="menu"]',
  }
  const close = async (p) => {
    await p.keyboard.press("Escape")
    await sleep(80)
    await p.evaluate(() => {
      for (const b of [...document.querySelectorAll('[data-probe-custom] > button[aria-label="Close"]')].reverse()) b.click()
    })
    await sleep(500)
  }

  for (const [w, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const phone = vp.width < 640
    console.log(`\n${w} wide${phone ? `, CPU ${CPU}x slower` : ""}`)
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport(vp)
    await p.evaluateOnNewDocument(() => {
      try { localStorage.setItem("storelib.analytics.reports.v3:c1", JSON.stringify(["pageviews", "sessions", "clicks", "toplinks", "refunds", "downloads"])) } catch {}
    })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)))
    await p.goto(`${origin}/app/analytics?seller=digital`, { waitUntil: "load" })
    await p.waitForFunction(() => document.querySelector("[data-analytics-head]") && !document.querySelector('[aria-busy="true"]'), { timeout: 20000 }).catch(() => {})
    await sleep(1200)
    const elements = await p.evaluate(() => document.getElementsByTagName("*").length)
    console.log(`  the page: ${elements} elements`)
    const cdp = await p.createCDPSession()
    if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })

    if (process.env.EXPERIMENT) {
      /* What each thing a dialog does to the document costs, alone: the style work its next read forces. */
      const steps = await p.evaluate(() => {
        const force = () => { const t = performance.now(); void document.body.getBoundingClientRect(); return Math.round((performance.now() - t) * 10) / 10 }
        const out = {}
        const step = (name, fn) => { force(); fn(); out[name] = force() }
        const html = document.documentElement, body = document.body
        step("noop", () => {})
        step("body attr data-scroll-locked", () => body.setAttribute("data-scroll-locked", "1"))
        step("body attr remove", () => body.removeAttribute("data-scroll-locked"))
        let st
        step("insert lock <style>", () => { st = document.createElement("style"); st.textContent = "body[data-scroll-locked]{overflow:hidden!important;overscroll-behavior:contain;position:relative!important;margin-right:0px!important}.right-scroll-bar-position{right:0px!important}body[data-scroll-locked]{--removed-body-scroll-bar-size:0px}"; document.head.appendChild(st) })
        step("body attr again (style present)", () => body.setAttribute("data-scroll-locked", "1"))
        step("remove <style>", () => st.remove())
        body.removeAttribute("data-scroll-locked")
        step("html inline overscroll", () => { html.style.overscrollBehavior = "none" })
        step("body inline overscroll", () => { body.style.overscrollBehavior = "none" })
        html.style.overscrollBehavior = ""; body.style.overscrollBehavior = ""
        step("aria-hidden on body children", () => { for (const c of body.children) c.setAttribute("aria-hidden", "true") })
        step("aria-hidden off", () => { for (const c of body.children) c.removeAttribute("aria-hidden") })
        step("data-aria-hidden on body children", () => { for (const c of body.children) c.setAttribute("data-aria-hidden", "true") })
        for (const c of body.children) c.removeAttribute("data-aria-hidden")
        let d
        step("insert div role=dialog", () => { d = document.createElement("div"); d.setAttribute("role", "dialog"); d.setAttribute("data-state", "open"); body.appendChild(d) })
        step("remove it", () => d.remove())
        step("insert plain div", () => { d = document.createElement("div"); body.appendChild(d) })
        d.remove()
        step("insert div in #app's last child", () => { d = document.createElement("div"); document.getElementById("app").appendChild(d) })
        d.remove()
        step("insert span[data-radix-focus-guard]", () => { d = document.createElement("span"); d.setAttribute("data-radix-focus-guard", ""); d.tabIndex = 0; body.prepend(d) })
        d.remove()
        step("html attr data-modal-open", () => html.setAttribute("data-modal-open", "1"))
        html.removeAttribute("data-modal-open")
        step("pointer-events none on body", () => { body.style.pointerEvents = "none" })
        body.style.pointerEvents = ""
        return out
      })
      console.log("  experiment (ms of forced style+layout):", JSON.stringify(steps, null, 1))
      if (process.env.ISOLATE && phone) {
        /* Each rule matching ISOLATE taken out alone, on a fresh page: the cost of inserting an element into <body>, median of 5. */
        const rows = []
        const n = await p.evaluate((pattern) => { const re = new RegExp(pattern); let k = 0; const walk = (box) => { for (const r of box.cssRules) { if (r.cssRules && !r.selectorText) walk(r); else if (r.selectorText && re.test(r.selectorText)) k++ } }; for (const sh of document.styleSheets) { try { walk(sh) } catch {} } return k }, process.env.ISOLATE)
        for (let k = -1; k < n; k++) {
          await p.reload({ waitUntil: "load" })
          await p.waitForFunction(() => document.querySelector("[data-analytics-head]") && !document.querySelector('[aria-busy="true"]'), { timeout: 20000 }).catch(() => {})
          await sleep(800)
          rows.push(await p.evaluate((pattern, k) => {
            const re = new RegExp(pattern)
            let idx = 0, sel = "none"
            const walk = (box) => { for (const r of [...box.cssRules]) { if (r.cssRules && !r.selectorText) walk(r); else if (r.selectorText && re.test(r.selectorText)) { if (idx === k) { sel = r.selectorText; box.deleteRule([...box.cssRules].indexOf(r)) } idx++ } } }
            for (const sh of document.styleSheets) { try { walk(sh) } catch {} }
            void document.body.getBoundingClientRect()
            const xs = []
            for (let i = 0; i < 5; i++) { const d = document.createElement("div"); const t = performance.now(); document.body.appendChild(d); void document.body.getBoundingClientRect(); xs.push(performance.now() - t); d.remove(); void document.body.getBoundingClientRect() }
            xs.sort((a, b) => a - b)
            return [sel.slice(0, 150), Math.round(xs[2] * 10) / 10]
          }, process.env.ISOLATE, k))
        }
        console.log("  isolate:", JSON.stringify(rows, null, 1))
      }
      if (process.env.PE && phone) {
        /* body pointer-events none (Radix's outside-press block): its cost with the stylesheets on and off, and visibility for comparison. */
        const pe = await p.evaluate(() => {
          const force = () => { const t = performance.now(); void document.body.getBoundingClientRect(); return Math.round((performance.now() - t) * 10) / 10 }
          const m = (fn, undo) => { const xs = []; for (let i = 0; i < 5; i++) { force(); fn(); xs.push(force()); undo(); force() } xs.sort((a, b) => a - b); return xs[2] }
          const body = document.body
          const out = {}
          out.peOn = m(() => { body.style.pointerEvents = "none" }, () => { body.style.pointerEvents = "" })
          out.colorOn = m(() => { body.style.color = "red" }, () => { body.style.color = "" })
          out.overscroll = m(() => { body.style.overscrollBehavior = "none" }, () => { body.style.overscrollBehavior = "" })
          const sheets = [...document.styleSheets]
          for (const s of sheets) s.disabled = true
          force()
          out.peNoCss = m(() => { body.style.pointerEvents = "none" }, () => { body.style.pointerEvents = "" })
          for (const s of sheets) s.disabled = false
          force()
          return out
        })
        console.log("  pointer-events:", JSON.stringify(pe))
      }
      if (process.env.VARIANTS && phone) {
        /* The card rule (app/globals.css, NEVER A VEIL OVER A CARD) with its selector list changed: the cost of inserting an element into <body>. */
        const CARD = ':is(a, button, [role="button"], [tabindex="0"])'
        const MEDIA = ':has(img, picture, video, canvas)'
        const IN = ':is(a, button, [role="button"], [tabindex], div, span, p, img, picture, video, canvas, svg, figure, li, article, section, h1, h2, h3, h4, h5, h6)'
        const variants = {
          original: null,
          none: [],
          only1: [`${CARD}${MEDIA}:active`],
          drop2: [`${CARD}${MEDIA}:active`, `:is([data-card], [data-product-card], [data-community-card]):active`, `:is([data-card], [data-product-card], [data-community-card]) ${IN}:active`],
          activeFirst: [`${CARD}${MEDIA}:active`, `${CARD}:active${MEDIA} ${IN}:active`, `:is([data-card], [data-product-card], [data-community-card]):active`, `:is([data-card], [data-product-card], [data-community-card]) ${IN}:active`],
          only2: [`${CARD}${MEDIA} ${IN}:active`],
          only4: [`:is([data-card], [data-product-card], [data-community-card]) ${IN}:active`],
          narrow: [`${CARD}${MEDIA}:active`, `${CARD}${MEDIA} :is(a, button, [role="button"], [tabindex], [class*="active:"]):active`, `:is([data-card], [data-product-card], [data-community-card]):active`, `:is([data-card], [data-product-card], [data-community-card]) ${IN}:active`],
          isWrap: [`${CARD}${MEDIA}:active`, `${IN}:active:is(${CARD}${MEDIA} *)`, `:is([data-card], [data-product-card], [data-community-card]):active`, `:is([data-card], [data-product-card], [data-community-card]) ${IN}:active`],
          styleQuery: { sels: [`${CARD}${MEDIA}:active`, `:is([data-card], [data-product-card], [data-community-card]):active`, `:is([data-card], [data-product-card], [data-community-card]) ${IN}:active`], extra: [`${CARD}${MEDIA}:active { --sl-card-press: 1; }`, `@container style(--sl-card-press: 1) { ${IN}:active { opacity: 1 !important; filter: none !important; } }`] },
        }
        const rows = []
        for (const [name, sels] of Object.entries(variants)) {
          await p.reload({ waitUntil: "load" })
          await p.waitForFunction(() => document.querySelector("[data-analytics-head]") && !document.querySelector('[aria-busy="true"]'), { timeout: 20000 }).catch(() => {})
          await sleep(800)
          rows.push([name, await p.evaluate((sels) => {
            const extra = sels && !Array.isArray(sels) ? sels.extra : []
            if (sels && !Array.isArray(sels)) sels = sels.sels
            for (const rule of extra) document.styleSheets[document.styleSheets.length - 1].insertRule(rule, document.styleSheets[document.styleSheets.length - 1].cssRules.length)
            if (sels) {
              const walk = (box) => { for (const r of [...box.cssRules]) { if (r.cssRules && !r.selectorText) walk(r); else if (r.selectorText && r.selectorText.includes("picture, video, canvas):active")) { const body = r.style.cssText; const i = [...box.cssRules].indexOf(r); box.deleteRule(i); if (sels.length) box.insertRule(`${sels.join(", ")} { ${body} }`, i) } } }
              for (const sh of document.styleSheets) { try { walk(sh) } catch {} }
            }
            void document.body.getBoundingClientRect()
            const xs = []
            for (let i = 0; i < 5; i++) { const d = document.createElement("div"); const t = performance.now(); document.body.appendChild(d); void document.body.getBoundingClientRect(); xs.push(performance.now() - t); d.remove(); void document.body.getBoundingClientRect() }
            xs.sort((a, b) => a - b)
            /* And does it still hold: a span inside a pictured link, pressed, keeps full strength. */
            const a = document.createElement("a"); a.href = "#"; a.innerHTML = '<img alt="" width="4" height="4"><span class="probe-in" style="display:block">x</span>'
            document.body.appendChild(a)
            const st = document.createElement("style"); st.textContent = ".probe-in{opacity:.5}"; document.head.appendChild(st)
            return [Math.round(xs[2] * 10) / 10, a]
          }, sels).then(async ([ms, handle]) => {
            const node = await p.evaluateHandle(() => document.querySelector(".probe-in"))
            const c = await p.createCDPSession()
            await c.send("DOM.enable"); await c.send("CSS.enable")
            const { root } = await c.send("DOM.getDocument")
            const { nodeId } = await c.send("DOM.querySelector", { nodeId: root.nodeId, selector: ".probe-in" })
            const { nodeId: aId } = await c.send("DOM.querySelector", { nodeId: root.nodeId, selector: "body > a:last-child" })
            await c.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] })
            await c.send("CSS.forcePseudoState", { nodeId: aId, forcedPseudoClasses: ["active"] })
            const op = await node.evaluate((n) => getComputedStyle(n).opacity)
            await c.detach()
            return [ms, `inner opacity pressed ${op}`]
          })])
        }
        console.log("  variants:", JSON.stringify(rows))
      }
    }
    for (const name of Object.keys(OPENERS)) {
      if (name === "menu" && !phone) continue
      const longest = []
      let biggestStyle = null
      for (let run = 0; run < RUNS; run++) {
        await p.evaluate(() => { const s = document.querySelector(".page-scroll"); if (s) s.scrollTop = 0 })
        const opener = await p.$(OPENERS[name])
        if (!opener) { console.log(`  ${name}: no opener`); break }
        await p.evaluate((b) => b.scrollIntoView({ block: "center" }), opener)
        await sleep(300)
        const trace = TRACE && run === RUNS - 1 ? join(dir, `trace-${name}.json`) : null
        if (trace) await p.tracing.start({ path: trace, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", ...(process.env.INVAL ? ["disabled-by-default-devtools.timeline.invalidationTracking"] : []), ...(process.env.SELSTATS ? ["disabled-by-default-blink.debug"] : [])] })
        const t0 = await p.evaluate(() => performance.now())
        if (phone) await opener.tap()
        else await opener.click()
        if (name === "nested") {
          await sleep(500)
          await (await p.$('[data-open="inner"]'))?.click()
        }
        await sleep(700)
        if (trace) {
          await p.tracing.stop()
          const raw = JSON.parse(readFileSync(trace, "utf8"))
          const events = raw.traceEvents ?? raw
          const recalcs = events.filter((ev) => ev.ph === "X" && ev.name === "UpdateLayoutTree" && ev.dur > 1000).map((ev) => ({ ms: Math.round(ev.dur / 1000), elements: ev.args?.elementCount ?? null }))
          biggestStyle = recalcs.sort((a, b) => b.elements - a.elements).slice(0, 3)
          if (process.env.SELSTATS) {
            /* Which selectors the style passes spent their time matching (Chromium's selector stats). */
            const per = new Map()
            for (const ev of events) {
              const stats = ev.name === "SelectorStats" ? ev.args?.selector_stats?.selector_timings : null
              if (!stats) continue
              for (const t of stats) {
                const k = t.selector
                const cur = per.get(k) || { us: 0, attempts: 0, matches: 0, fast: 0 }
                cur.us += t["elapsed (us)"] ?? 0; cur.attempts += t.match_attempts ?? 0; cur.matches += t.match_count ?? 0; cur.fast += t.fast_reject_count ?? 0
                per.set(k, cur)
              }
            }
            const top = [...per].sort((a, b) => b[1].us - a[1].us).slice(0, 25).map(([k, v]) => [Math.round(v.us / 100) / 10, v.attempts, v.matches, k.slice(0, 140)])
            const total = [...per.values()].reduce((a, v) => a + v.us, 0)
            console.log(`  ${name} selector ms total ${Math.round(total / 1000)} over ${per.size} selectors, top:`, JSON.stringify(top, null, 1))
          }
          const sum = {}
          for (const ev of events) if (ev.ph === "X" && ev.dur && ["UpdateLayoutTree", "Layout", "EventDispatch", "FunctionCall", "Paint", "PrePaint", "Layerize", "FireAnimationFrame", "RunMicrotasks", "TimerFire"].includes(ev.name)) sum[ev.name] = Math.round((sum[ev.name] || 0) + ev.dur / 1000)
          const forced = events.filter((ev) => ev.ph === "X" && ev.name === "UpdateLayoutTree" && ev.dur > 3000 && ev.args?.beginData?.stackTrace?.length).map((ev) => [Math.round(ev.dur / 1000), ev.args?.elementCount, ev.args.beginData.stackTrace.slice(0, 3).map((f) => `${f.functionName}:${f.lineNumber}`).join("<")])
          console.log(`  ${name} trace ms by kind:`, JSON.stringify(sum), "forced:", JSON.stringify(forced))
          if (process.env.INVAL) {
            /* Why the browser restyled what it did: each invalidation's reason, and the selector or attribute behind it. */
            const why = new Map()
            for (const ev of events) {
              if (!/Invalidation/.test(ev.name)) continue
              const d = ev.args?.data ?? {}
              const k = `${ev.name} ${d.reason ?? ""} ${d.changedAttribute ?? d.changedClass ?? d.changedId ?? d.changedPseudo ?? ""} ${(d.selectors ?? []).map((x) => x.selector ?? JSON.stringify(x)).join(" | ").slice(0, 160)} ${d.nodeName ?? ""}`.replace(/\s+/g, " ")
              why.set(k, (why.get(k) || 0) + 1)
            }
            console.log(`  ${name} invalidations:`, JSON.stringify([...why].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.INVAL_N || 18)), null, 1))
          }
        }
        const state = await p.evaluate((t0) => {
          const pill = document.querySelector("[data-app-nav-pill]")
          const tap = pill?.querySelector(".pointer-events-auto")
          return {
            long: window.__long.filter((l) => l.at >= t0).map((l) => l.ms),
            open: document.documentElement.getAttribute("data-modal-open"),
            any: document.documentElement.hasAttribute("data-modal-any"),
            locked: document.body.hasAttribute("data-scroll-locked"),
            sheetUp: document.documentElement.getAttribute("data-app-sheet-up"),
            pillZ: pill ? getComputedStyle(pill).zIndex : null,
            pillTaps: tap ? getComputedStyle(tap).pointerEvents : null,
            banner: getComputedStyle(document.querySelector("[data-cookie-banner]")).visibility,
          }
        }, t0)
        longest.push(state.long.length ? Math.max(...state.long) : 0)
        if (run === 0) {
          if (!report) {
            if (name === "custom") expect(state.open === "1" && state.any, "custom: <html> says one modal is open", state.open)
            if (name === "nested") expect(state.open === "2", "nested: <html> counts two", state.open)
          }
          /* What the pill and the banner do, before (the :has() rules) and after alike. */
          /* The pill's rules are a phone's (it is not drawn from 768px). */
          if (phone) expect(state.pillZ === "39" && state.pillTaps === "none", `${name}: the pill steps under it and gives up its taps`, state)
          expect(state.banner === "hidden", `${name}: the cookie card steps aside`, state.banner)
          if (name === "nested") {
            await p.evaluate(() => [...document.querySelectorAll('[data-probe-custom] > button[aria-label="Close"]')].pop()?.click())
            await sleep(150)
            const after = await p.evaluate(() => document.documentElement.getAttribute("data-modal-open"))
            if (!report) expect(after === "1", "nested: the top one closed, <html> counts one", after)
          }
        }
        await close(p)
        if (run === 0) {
          const after = await p.evaluate(() => {
            const pill = document.querySelector("[data-app-nav-pill]")
            return { open: document.documentElement.getAttribute("data-modal-open"), any: document.documentElement.hasAttribute("data-modal-any"), pillZ: pill ? getComputedStyle(pill).zIndex : null, banner: getComputedStyle(document.querySelector("[data-cookie-banner]")).visibility }
          })
          expect(after.open === null && !after.any && after.pillZ === "55" && after.banner === "visible", `${name}: closed, <html> says nothing and the pill and the card are back`, after)
        }
      }
      const line = { viewport: w, dialog: name, longestMs: Math.max(...longest), medianLongestMs: median(longest), runs: longest, ...(biggestStyle ? { biggestStyle } : {}) }
      summary.push(line)
      console.log(`  ${name}: ${JSON.stringify(line)}`)
      if (!phone) expect(line.medianLongestMs <= 50, `${name}: no long task over 50ms on open (median of ${RUNS})`, line.runs)
    }
    if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    expect(errors.length === 0, "no page errors", errors)
    await ctx.close()
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log("\nsummary:")
for (const s of summary) console.log(`  ${s.viewport.padEnd(5)} ${s.dialog.padEnd(7)} longest ${String(s.longestMs).padStart(4)}ms  median ${String(s.medianLongestMs).padStart(4)}ms  ${JSON.stringify(s.runs)}${s.biggestStyle ? `  style ${JSON.stringify(s.biggestStyle)}` : ""}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
