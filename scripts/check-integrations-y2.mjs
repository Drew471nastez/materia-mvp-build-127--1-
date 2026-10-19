/**
 * ===========================================================================
 *  ROUND Y2: AN INTEGRATION'S BAR WITH ITS WAY BACK, AND THE CARDS' COVERS
 * ===========================================================================
 * The real Integrations page and the directory as Settings draws it, in the
 * /app shell (scripts/render-integrations-y2.tsx), in headless Chromium at
 * 1280x800 (a mouse) and 390x844 (touch):
 *
 *   B1  the bar comes the frame the Back link's last pixel leaves the top,
 *       and goes when it is back; the link and the bar's back arrow change
 *       in the same frame, both ways
 *   B2  how long the bar and the link take to fade, in and out
 *   B3  nothing moves when the bar comes (the header's place, the page's
 *       height, layout-shift entries)
 *   B4  the bar's action only once the header's actions are out of view
 *   B5  the bar's back arrow goes back to the list
 *   C1  a card's cover fills under the pointer and empties after it, over
 *       time; the card never moves; reduced motion: no animation
 *   W   no horizontal scroll at 390 and 1280, list and page
 *   P   round Z7: a card's specks, on the Integrations page and in the
 *       Settings tab alike: clear and still at rest, spread out and drifting
 *       under the pointer, gathered and still again after it; only
 *       transform, translate, scale and opacity animate, nothing is blurred
 *       by a filter, and the frames keep their pace while they move;
 *       reduced motion: none drawn
 *
 *   node scripts/check-integrations-y2.mjs     (wrap in flock /tmp/v-heavy.lock)
 *
 * Pictures go to SHOTS_DIR (.iy2-shots).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".integrations-y2-probe")
const shots = process.env.SHOTS_DIR || join(root, ".iy2-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
const ORIGIN = "https://storelib.com"
let broken = 0
const report = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function answer(url) {
  const p = new URL(url).pathname
  if (p === "/api/store/integrations/installed") return { installed: [] }
  if (p === "/api/store/integrations") return { tracking: { ga4: "G-TEST123" }, ready: true, ga: null }
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
    alias: { "@": ".", "next/navigation": "./.integrations-y2-probe/navigation.js", "next/link": "./.integrations-y2-probe/link.jsx", "next/image": "./.integrations-y2-probe/image.jsx" },
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

  /* Scrolls the page's scroller by `step` px a frame from `from` to `to`, reading the bar, the link and the header every frame. */
  const scrollFilm = (p, from, to, step, hold = 420) =>
    p.evaluate(
      (from, to, step, hold) =>
        new Promise((res) => {
          const box = document.querySelector("[data-integrations-view=page]").closest("[data-integrations-scroll], [data-settings-sheet-scroll]")
          const pin = document.querySelector("[data-integration-pin]")
          const link = document.querySelector("[data-integration-back]")
          const header = document.querySelector("[data-integration-header]")
          const actions = document.querySelector("[data-integration-actions]")
          const slot = document.querySelector("[data-integration-pin-action-slot]")
          const top = () => box.getBoundingClientRect().top
          const shifts = []
          const po = new PerformanceObserver((l) => {
            for (const e of l.getEntries()) shifts.push(+e.value.toFixed(4))
          })
          try {
            po.observe({ type: "layout-shift", buffered: false })
          } catch {}
          box.scrollTop = from
          const frames = []
          let at = from
          let endAt = null
          const tick = () => {
            frames.push({
              t: Math.round(performance.now()),
              scroll: Math.round(box.scrollTop),
              linkBottom: +(link.getBoundingClientRect().bottom - top()).toFixed(1),
              actionsBottom: +(actions.getBoundingClientRect().bottom - top()).toFixed(1),
              pin: pin.dataset.integrationPin,
              back: link.dataset.integrationBack,
              slot: slot ? slot.dataset.integrationPinActionSlot : null,
              pinOp: +(+getComputedStyle(pin).opacity).toFixed(3),
              linkOp: +(+getComputedStyle(link).opacity).toFixed(3),
              headerAt: +(header.getBoundingClientRect().top - top() + box.scrollTop).toFixed(1),
              height: box.scrollHeight,
              barTop: +(pin.firstElementChild.getBoundingClientRect().top - top()).toFixed(1),
            })
            if ((step > 0 && at >= to) || (step < 0 && at <= to)) {
              endAt ??= performance.now()
              if (performance.now() - endAt >= hold) {
                po.disconnect()
                return res({ frames, shifts })
              }
              return requestAnimationFrame(tick)
            }
            at += step
            box.scrollTop = at
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      from,
      to,
      step,
      hold,
    )

  const settleAt = (film, key, target) => {
    const hit = film.find((f) => Math.abs(f[key] - target) <= 0.01)
    return hit ? hit.t : null
  }

  async function barCase(vp, path, card, label) {
    const tag = `${label} ${vp.width}`
    console.log(`\nB  ${tag}: ${card}\n`)
    const { p, errors } = await open(path, vp)
    await p.evaluate((id) => document.querySelector(`[data-integration-card="${id}"]`).click(), card)
    await sleep(700)
    const linkBottom0 = await p.evaluate(() => {
      const box = document.querySelector("[data-integrations-view=page]").closest("[data-integrations-scroll], [data-settings-sheet-scroll]")
      return document.querySelector("[data-integration-back]").getBoundingClientRect().bottom - box.getBoundingClientRect().top + box.scrollTop
    })
    const start = Math.max(0, Math.round(linkBottom0) - 40)
    const down = await scrollFilm(p, start, Math.round(linkBottom0) + 16, 2)
    const first = down.frames.findIndex((f) => f.pin === "shown")
    const shownAt = down.frames[first]
    const lastHidden = down.frames[first - 1]
    report[`${tag} down`] = { first: shownAt, before: lastHidden }
    expect(!!shownAt && lastHidden.linkBottom > -2.5 && shownAt.linkBottom <= 0.5 && shownAt.linkBottom >= -4.5, `B1 ${tag}: the bar comes as the link's last pixel leaves the top (link foot at ${shownAt?.linkBottom}px against the scroller's top; the frame before ${lastHidden?.linkBottom}px)`)
    expect(down.frames.every((f) => (f.pin === "shown") === (f.back === "away")), `B1 ${tag}: the link and the bar's arrow change in the same frame, every frame`)
    const fadeIn = down.frames.slice(first).map((f) => ({ t: f.t - shownAt.t, pin: f.pinOp, link: f.linkOp }))
    const inPin = settleAt(fadeIn, "pin", 1)
    const outLink = settleAt(fadeIn, "link", 0)
    report[`${tag} fade in`] = { pinAt1: inPin, linkAt0: outLink, film: fadeIn.filter((_, i) => i % 2 === 0).slice(0, 16) }
    expect(inPin !== null && inPin >= 150 && inPin <= 280 && outLink !== null && Math.abs(inPin - outLink) <= 20, `B2 ${tag}: from the flip, the bar is in in ${inPin}ms as the link is out in ${outLink}ms`)
    const headerMoves = new Set(down.frames.map((f) => f.headerAt)).size
    const heights = new Set(down.frames.map((f) => f.height)).size
    expect(headerMoves === 1 && heights === 1 && down.shifts.length === 0, `B3 ${tag}: nothing moves as the bar comes: the header at one place (${[...new Set(down.frames.map((f) => f.headerAt))]}), one page height, ${down.shifts.length} layout shifts`)
    const settled = down.frames[down.frames.length - 1].barTop
    expect(settled === (isPhone(vp) ? 8 : 12), `B3 ${tag}: settled, the bar sits ${settled}px under the top of the scroller (the scroller starts under the app header and its safe area)`)
    /* On to where the header's actions go out of view. */
    const actionsAt = await p.evaluate(() => {
      const box = document.querySelector("[data-integrations-view=page]").closest("[data-integrations-scroll], [data-settings-sheet-scroll]")
      return document.querySelector("[data-integration-actions]").getBoundingClientRect().bottom - box.getBoundingClientRect().top + box.scrollTop
    })
    const deeper = await scrollFilm(p, Math.round(linkBottom0) + 16, Math.round(actionsAt) - 64 + 24, 4)
    const slotShown = deeper.frames.find((f) => f.slot === "shown")
    const slotEarly = deeper.frames.filter((f) => f.slot === "shown" && f.actionsBottom > 64.5)
    report[`${tag} action`] = { firstShown: slotShown }
    expect(!!slotShown && slotEarly.length === 0 && deeper.frames.every((f) => f.slot === "shown" || f.actionsBottom > 60), `B4 ${tag}: the bar's action only once the header's actions are under the bar (first at the actions' foot ${slotShown?.actionsBottom}px)`)
    expect(new Set(deeper.frames.map((f) => f.headerAt)).size === 1 && deeper.shifts.length === 0, `B4 ${tag}: and nothing moves then either`)
    await p.screenshot({ path: join(shots, `bar-${label}-${vp.width}.png`) })
    /* Back up: the bar goes as the link comes back. */
    const up = await scrollFilm(p, Math.round(linkBottom0) + 16, start, -2)
    const gone = up.frames.findIndex((f) => f.pin === "hidden")
    report[`${tag} up`] = { first: up.frames[gone] }
    const goneAt = up.frames[gone]
    expect(gone > 0 && goneAt.linkBottom >= -0.5 && goneAt.linkBottom <= 4.5, `B1 ${tag}: the bar goes as the link is back (link foot ${goneAt?.linkBottom}px; the frame before ${up.frames[gone - 1]?.linkBottom}px)`)
    expect(up.frames.every((f) => (f.pin === "shown") === (f.back === "away")), `B1 ${tag}: same frame on the way up`)
    const fadeOut = up.frames.slice(gone).map((f) => ({ t: f.t - goneAt.t, pin: f.pinOp, link: f.linkOp }))
    const outPin = settleAt(fadeOut, "pin", 0)
    const inLink = settleAt(fadeOut, "link", 1)
    report[`${tag} fade out`] = { pinAt0: outPin, linkAt1: inLink }
    expect(outPin !== null && outPin >= 150 && outPin <= 280 && inLink !== null && Math.abs(outPin - inLink) <= 20, `B2 ${tag}: from the flip, the bar is out in ${outPin}ms as the link is back in ${inLink}ms`)
    /* The arrow goes back to the list. */
    await p.evaluate(() => {
      const box = document.querySelector("[data-integrations-view=page]").closest("[data-integrations-scroll], [data-settings-sheet-scroll]")
      box.scrollTop = 600
    })
    await sleep(400)
    await p.evaluate(() => document.querySelector("[data-integration-pin-back]").click())
    await sleep(500)
    const view = await p.evaluate(() => document.querySelector("[data-integrations]")?.dataset.integrationsView)
    expect(view === "list", `B5 ${tag}: the bar's back arrow goes back to the list`, view)
    const wide = await p.evaluate(() => {
      const box = document.querySelector("[data-integrations-scroll], [data-settings-sheet-scroll]")
      return { doc: document.documentElement.scrollWidth - innerWidth, box: box.scrollWidth - box.clientWidth }
    })
    expect(wide.doc <= 0 && wide.box <= 0, `W ${tag}: no horizontal scroll on the list`, wide)
    expect(errors.length === 0, `${tag}: no page errors`, errors)
    await p.close()
  }

  /* A page's own horizontal scroll, on its page. */
  async function wideOnPage(vp, path, card, label) {
    const { p, errors } = await open(path, vp)
    await p.evaluate((id) => document.querySelector(`[data-integration-card="${id}"]`).click(), card)
    await sleep(600)
    await p.evaluate(() => (document.querySelector("[data-integrations-view=page]").closest("[data-integrations-scroll], [data-settings-sheet-scroll]").scrollTop = 500))
    await sleep(400)
    const wide = await p.evaluate(() => {
      const box = document.querySelector("[data-integrations-view=page]").closest("[data-integrations-scroll], [data-settings-sheet-scroll]")
      return { doc: document.documentElement.scrollWidth - innerWidth, box: box.scrollWidth - box.clientWidth, bar: Math.round(document.querySelector("[data-integration-pin]").getBoundingClientRect().right - box.getBoundingClientRect().right) }
    })
    expect(wide.doc <= 0 && wide.box <= 0 && wide.bar <= 0, `W ${label} ${vp.width}: no horizontal scroll on ${card}'s page with the bar shown`, wide)
    await p.screenshot({ path: join(shots, `page-${label}-${card}-${vp.width}.png`) })
    expect(errors.length === 0, `${label} ${vp.width}: no page errors`, errors)
    await p.close()
  }

  async function hoverCase(card, reduce) {
    const tag = reduce ? "reduced motion" : "motion"
    console.log(`\nC1  ${card}'s cover (${tag})\n`)
    const { p, errors } = await open("/app/integrations", DESK)
    if (reduce) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const box = await p.evaluate((id) => {
      const el = document.querySelector(`[data-integration-card="${id}"]`)
      el.scrollIntoView({ block: "center" })
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }, card)
    await sleep(300)
    await p.mouse.move(box.x - 20, box.y - 20)
    await sleep(200)
    const startFilm = () =>
      p.evaluate((id) => {
        const card = document.querySelector(`[data-integration-card="${id}"]`)
        const fill = card.querySelector("[data-integration-cover-fill]")
        window.__film = []
        const t0 = performance.now()
        const tick = (t) => {
          const r = card.getBoundingClientRect()
          window.__film.push({ t: Math.round(t - t0), op: +(+getComputedStyle(fill).opacity).toFixed(3), scale: getComputedStyle(fill).scale, x: r.x, y: r.y })
          if (t - t0 < 700) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }, card)
    const readFilm = () => p.evaluate(() => window.__film)
    await startFilm()
    await sleep(40)
    await p.mouse.move(box.x + box.w / 2, box.y + box.h / 2)
    await sleep(720)
    const inFilm = await readFilm()
    await startFilm()
    await sleep(40)
    await p.mouse.move(box.x + box.w / 2, box.y + box.h + 80)
    await sleep(720)
    const outFilm = await readFilm()
    const timeline = (film, from, to) => {
      const s = film.find((f) => Math.abs(f.op - from) > 0.01)
      const half = film.find((f) => (to > from ? f.op >= 0.5 : f.op <= 0.5))
      const done = film.find((f) => (to > from ? f.op >= 0.99 : f.op <= 0.01))
      return { start: s?.t ?? null, half: half && s ? half.t - s.t : null, done: done && s ? done.t - s.t : null, steps: film.filter((f) => f.op > 0.01 && f.op < 0.99).length }
    }
    const tin = timeline(inFilm, 0, 1)
    const tout = timeline(outFilm, 1, 0)
    const still = new Set([...inFilm, ...outFilm].map((f) => `${f.x},${f.y}`)).size === 1
    report[`hover ${card} ${tag}`] = { in: tin, out: tout, inFilm: inFilm.filter((_, i) => i % 3 === 0).map((f) => [f.t, f.op, f.scale]), outFilm: outFilm.filter((_, i) => i % 3 === 0).map((f) => [f.t, f.op, f.scale]) }
    if (reduce) {
      expect(tin.done !== null && tin.done <= 20 && tout.done !== null && tout.done <= 20, `C1 ${card} (reduced motion): the fill is there and gone with no animation (in ${tin.done}ms, out ${tout.done}ms)`)
    } else {
      expect(tin.done !== null && tin.done >= 280 && tin.done <= 460 && tin.steps >= 10, `C1 ${card}: the cover fills in ${tin.done}ms (half at ${tin.half}ms, ${tin.steps} frames between)`)
      expect(tout.done !== null && tout.done >= 200 && tout.done <= 380 && tout.steps >= 8, `C1 ${card}: and empties in ${tout.done}ms (half at ${tout.half}ms, ${tout.steps} frames between)`)
      const peak = inFilm[inFilm.length - 1]
      expect(peak.scale === "1" || peak.scale === "none", `C1 ${card}: it grows out to full size from the logo (scale ${inFilm.find((f) => f.op > 0.01)?.scale} -> ${peak.scale})`)
    }
    expect(still, `C1 ${card}: the card never moves under the pointer`)
    if (!reduce) {
      await p.mouse.move(box.x + box.w / 2, box.y + box.h / 2)
      await sleep(500)
      await p.screenshot({ path: join(shots, `hover-${card}.png`), clip: { x: box.x - 10, y: box.y - 10, width: box.w + 20, height: box.h + 20 } })
    }
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  for (const vp of [DESK, PHONE]) {
    await barCase(vp, "/app/integrations", "meta-pixel", "integrations")
    await barCase(vp, "/app/integrations", "google-analytics", "integrations-installed")
    await barCase(vp, "/app/settings", "meta-pixel", "settings")
    await wideOnPage(vp, "/app/integrations", "klaviyo", "integrations")
    await wideOnPage(vp, "/app/settings", "google-analytics", "settings")
  }
  await hoverCase("klaviyo", false)
  await hoverCase("meta-pixel", false)
  await hoverCase("klaviyo", true)
  async function speckCase(path, card, reduce) {
    const tag = `${path} ${card}${reduce ? " (reduced motion)" : ""}`
    console.log(`\nP   ${tag}: the cover's specks\n`)
    const { p, errors } = await open(path, DESK)
    if (reduce) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const box = await p.evaluate((id) => {
      const el = document.querySelector(`[data-integration-card="${id}"]`)
      el.scrollIntoView({ block: "center" })
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }, card)
    await p.mouse.move(box.x - 30, box.y - 30)
    await sleep(500)
    const read = () => p.evaluate((id) => {
      const card = document.querySelector(`[data-integration-card="${id}"]`)
      const cover = card.querySelector("[data-integration-cover]").getBoundingClientRect()
      return [...card.querySelectorAll("[data-integration-speck]")].map((el) => {
        const cs = getComputedStyle(el), dot = getComputedStyle(el.firstElementChild)
        const r = el.getBoundingClientRect()
        return { op: +(+cs.opacity).toFixed(3), translate: cs.translate, scale: cs.scale, display: cs.display, play: dot.animationPlayState, anim: dot.animationName, props: cs.transitionProperty, filter: cs.filter + "|" + dot.filter, image: dot.backgroundImage.slice(0, 40), cx: Math.round(r.left + r.width / 2 - cover.left), inCover: r.top >= cover.top - 20 && r.bottom <= cover.bottom + 20 }
      })
    }, card)
    const atRest = await read()
    if (reduce) {
      expect(atRest.length > 0 && atRest.every((x) => x.display === "none"), `P ${tag}: no specks drawn`, atRest.map((x) => x.display))
      await p.close()
      return
    }
    expect(atRest.length >= 5, `P ${tag}: ${atRest.length} specks in the cover`)
    expect(atRest.every((x) => x.op === 0 && x.play === "paused"), `P ${tag}: at rest they are clear and their drift is paused`, atRest.map((x) => [x.op, x.play]))
    expect(atRest.every((x) => /radial-gradient/.test(x.image) && x.filter === "none|none"), `P ${tag}: each is a soft radial gradient, no blur filter`, atRest[0]?.filter)
    expect(atRest.every((x) => x.props.split(", ").every((pp) => ["opacity", "translate", "scale"].includes(pp)) && x.anim === "int-speck-drift"), `P ${tag}: only opacity, translate and scale transition; the drift is a transform keyframe`, atRest[0] && [atRest[0].props, atRest[0].anim])
    await p.evaluate((id) => {
      const el = document.querySelector(`[data-integration-card="${id}"] [data-integration-speck]`)
      window.__sp = []
      const t0 = performance.now()
      const tick = (t) => {
        window.__sp.push({ t: t - t0, op: +getComputedStyle(el).opacity, tr: getComputedStyle(el).translate, dot: getComputedStyle(el.firstElementChild).transform })
        if (t - t0 < 1600) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, card)
    await sleep(30)
    await p.mouse.move(box.x + box.w / 2, box.y + box.h / 2)
    await sleep(1650)
    const film = await p.evaluate(() => window.__sp)
    const hovered = await read()
    const gaps = film.slice(1).map((f, i) => f.t - film[i].t)
    const worst = Math.max(...gaps)
    const first = film.find((f) => f.op > 0.01), full = film.find((f) => f.op > 0.99)
    const spread = new Set(hovered.map((x) => Math.round(x.cx / 20))).size
    expect(hovered.every((x) => x.op === 1 && (x.translate === "0px" || x.translate === "none")), `P ${tag}: under the pointer every speck shows`, hovered.map((x) => x.op))
    expect(first && full && full.t - first.t >= 300 && full.t - first.t <= 800, `P ${tag}: they spread in over ${first && full ? Math.round(full.t - first.t) : null}ms, not at once`)
    expect(spread >= 5 && hovered.every((x) => x.inCover), `P ${tag}: spread across the cover (${spread} different places), inside it`, hovered.map((x) => x.cx))
    expect(hovered.every((x) => x.play === "running") && new Set(film.slice(-30).map((f) => f.dot)).size > 1, `P ${tag}: and drift while the pointer stays`)
    expect(worst < 40, `P ${tag}: frames keep their pace while they move (worst gap ${worst.toFixed(1)}ms over ${film.length} frames)`)
    await p.mouse.move(box.x + box.w / 2, box.y + box.h + 120)
    await sleep(900)
    const after = await read()
    expect(after.every((x) => x.op === 0 && x.play === "paused"), `P ${tag}: after it leaves they gather back, clear and still`, after.map((x) => [x.op, x.play]))
    /* A clipped capture drops the pointer's hover, so the picture pins the spread state on this card, after the checks. */
    if (shots) {
      await p.addStyleTag({ content: `[data-integration-card="${card}"] .int-speck{opacity:1!important;translate:0 0!important;scale:1!important;transition:none!important}` })
      await p.screenshot({ path: join(shots, `specks-${path.split("/").pop()}-${card}.png`), clip: { x: box.x - 10, y: box.y - 10, width: box.w + 20, height: box.h + 20 } })
    }
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
  await speckCase("/app/integrations", "klaviyo", false)
  await speckCase("/app/integrations", "storelib-reviews", false)
  await speckCase("/app/settings", "google-analytics", false)
  await speckCase("/app/integrations", "klaviyo", true)

  for (const vp of [DESK, PHONE]) {
    const { p } = await open("/app/integrations", vp)
    const w = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, box: (() => { const b = document.querySelector("[data-integrations-scroll]"); return b.scrollWidth - b.clientWidth })() }))
    expect(w.doc <= 0 && w.box <= 0, `W ${vp.width}: the Integrations list has no horizontal scroll`, w)
    await p.screenshot({ path: join(shots, `list-${vp.width}.png`) })
    await p.close()
  }

  writeFileSync(join(shots, "report.json"), JSON.stringify(report, null, 2))
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   (pictures and report.json in ${shots})\n`)
process.exit(broken ? 1 : 0)
