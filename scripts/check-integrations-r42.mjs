/**
 * ===========================================================================
 *  ROUND 42: INTO AN INTEGRATION'S PAGE AND BACK, AND ITS STEPS
 * ===========================================================================
 * The real Integrations page in the /app shell (scripts/render-integrations-
 * y2.tsx, the same entry), in headless Chromium at 1280x800 and 390x844:
 *
 *   T1  a card's page is there on the first frame after the press, a few px
 *       under its place, whole (opacity 1 every frame), and rises into place
 *       by a translate alone in about 300ms, frames at pace
 *   T2  Back: the list is there on its first frame, settles down into place,
 *       and the card that was opened has the focus again
 *   T3  reduced motion: nothing moves
 *   S1  the way to the steps is a row of its own saying how many there are
 *   S2  the steps: the one to do now, the ones after it; where the
 *       integration stands; the one thing to do at the foot
 *   S3  inside the screen; on a phone a sheet from the bottom edge
 *   S4  the foot's action closes the steps and puts the cursor in the field
 *
 *   node scripts/check-integrations-r42.mjs     (wrap in flock /tmp/v-heavy.lock)
 *
 * Pictures go to SHOTS_DIR (.ir42-shots).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".integrations-r42-probe")
const shots = process.env.SHOTS_DIR || join(root, ".ir42-shots")
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
    alias: { "@": ".", "next/navigation": "./.integrations-r42-probe/navigation.js", "next/link": "./.integrations-r42-probe/link.jsx", "next/image": "./.integrations-r42-probe/image.jsx" },
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


  /* Films the directory's root, every frame, from a press to `ms` after it. */
  const film = (p, press, ms = 520) =>
    p.evaluate(
      (press, ms) =>
        new Promise((res) => {
          const frames = []
          const t0 = performance.now()
          let last = t0
          const gaps = []
          const tick = (t) => {
            const root = document.querySelector("[data-integrations]")
            const m = root ? new DOMMatrixReadOnly(getComputedStyle(root).transform === "none" ? undefined : getComputedStyle(root).transform) : null
            const props = root ? [...new Set(root.getAnimations().flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x)))))] : []
            frames.push({ t: Math.round(t - t0), view: root?.dataset.integrationsView ?? null, ty: m ? +m.m42.toFixed(2) : null, op: root ? +(+getComputedStyle(root).opacity).toFixed(3) : null, props })
            gaps.push(t - last)
            last = t
            if (t - t0 < ms) requestAnimationFrame(tick)
            else res({ frames, worstGap: Math.max(...gaps.slice(2)) })
          }
          requestAnimationFrame(tick)
          setTimeout(() => {
            const el = document.querySelector(press)
            el.click()
          }, 30)
        }),
      press,
      ms,
    )

  for (const vp of [DESK, PHONE]) {
    const tag = vp.width
    console.log(`\nT  into a page and back, ${tag}\n`)
    const { p, errors } = await open("/app/integrations", vp)
    const into = await film(p, '[data-integration-card="meta-pixel"]', 900)
    const page = into.frames.filter((f) => f.view === "page")
    const moving = page.filter((f) => Math.abs(f.ty) > 0.05)
    const settled = page.find((f, i) => i > 0 && Math.abs(f.ty) <= 0.05 && page[i - 1] && Math.abs(page[i - 1].ty) > 0.05)
    const firstPage = page[0]
    /* Pace while it moves: from the first frame it has left where it starts to the frame it is in place. */
    const startsAt = page.find((f) => firstPage && f.ty < firstPage.ty - 0.05)
    const run = page.filter((f) => startsAt && settled && f.t >= startsAt.t && f.t <= settled.t)
    const runGap = run.length > 1 ? Math.max(...run.slice(1).map((f, i) => f.t - run[i].t)) : null
    report[`T ${tag} in`] = { first: firstPage, movesFrom: startsAt?.t ?? null, settledAt: settled && firstPage ? settled.t - firstPage.t : null, moving: settled && startsAt ? settled.t - startsAt.t : null, runGap, worstGap: +into.worstGap.toFixed(1), film: page.slice(0, 24).map((f) => [f.t, f.ty, f.op]) }
    expect(!!firstPage && firstPage.ty > 4, `T1 ${tag}: the page is drawn on the first frame after the press, a few px under its place (${firstPage?.ty}px)`)
    expect(page.every((f) => f.op === 1), `T1 ${tag}: and whole: opacity 1 on every frame, no fade, no flash`, [...new Set(page.map((f) => f.op))])
    expect(moving.every((f, i) => i === 0 || f.ty <= moving[i - 1].ty + 0.01), `T1 ${tag}: it only rises, frame on frame`)
    expect(!!settled && !!startsAt && settled.t - startsAt.t >= 200 && settled.t - startsAt.t <= 360, `T1 ${tag}: it moves for ${settled && startsAt ? settled.t - startsAt.t : null}ms once it starts, ${startsAt && firstPage ? startsAt.t - firstPage.t : null}ms after the page is drawn`)
    expect(into.frames.every((f) => f.props.every((x) => x === "transform")), `T1 ${tag}: only transform animates`, [...new Set(into.frames.flatMap((f) => f.props))])
    expect(runGap !== null && runGap < 40, `T1 ${tag}: while it moves, frames keep their pace (worst gap ${runGap}ms; the page's own first drawing before it took ${into.worstGap.toFixed(1)}ms)`)
    await sleep(200)

    console.log(`\nS  the steps, ${tag}\n`)
    await p.evaluate(() => document.querySelector("[data-integration-steps-open]").scrollIntoView({ block: "center" }))
    await sleep(150)
    const row = await p.evaluate(() => {
      const b = document.querySelector("[data-integration-steps-open]")
      const r = b.getBoundingClientRect()
      return { h: Math.round(r.height), w: Math.round(r.width), text: b.innerText.replace(/\s+/g, " ").trim() }
    })
    expect(row.h >= (isPhone(vp) ? 44 : 40) && /How to set it up/.test(row.text) && /3 steps/.test(row.text), `S1 ${tag}: the way to the steps is a row of its own, ${row.h}px tall, saying how many: "${row.text}"`)
    await p.evaluate(() => document.querySelector("[data-integration-steps-open]").click())
    await sleep(700)
    const sheet = await p.evaluate(() => {
      const list = document.querySelector("[data-integration-steps]")
      const dlg = list?.closest('[role="dialog"]') ?? list?.closest("[data-modal-sheet]")?.parentElement
      const r = (dlg ?? list).getBoundingClientRect()
      const steps = [...document.querySelectorAll("[data-integration-step]")].map((li) => li.dataset.integrationStep)
      const go = document.querySelector("[data-integration-steps-go]")
      const standing = document.querySelector("[data-integration-steps-standing]")?.innerText
      return { steps, go: go?.innerText ?? null, standing, left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), top: Math.round(r.top), vw: innerWidth, vh: innerHeight, docW: document.documentElement.scrollWidth - innerWidth }
    })
    report[`S ${tag}`] = sheet
    expect(sheet.steps.join() === "now,next,next", `S2 ${tag}: three steps, the first to do now, the others after it`, sheet.steps)
    expect(sheet.go === "Install" && sheet.standing === "Not connected", `S2 ${tag}: where it stands (${sheet.standing}), and the one thing to do at the foot (${sheet.go})`)
    expect(sheet.left >= 0 && sheet.right <= sheet.vw && sheet.docW <= 0, `S3 ${tag}: inside the screen (${sheet.left} to ${sheet.right} of ${sheet.vw}), no horizontal scroll`)
    if (isPhone(vp)) expect(sheet.bottom >= sheet.vh - 2, `S3 ${tag}: on a phone a sheet from the bottom edge (its foot at ${sheet.bottom} of ${sheet.vh})`)
    await p.screenshot({ path: join(shots, `steps-${tag}.png`) })
    await p.evaluate(() => document.querySelector("[data-integration-steps-go]").click())
    await sleep(900)
    const after = await p.evaluate(() => ({ open: !!document.querySelector("[data-integration-steps]"), focus: document.activeElement?.id ?? document.activeElement?.tagName }))
    expect(!after.open && /tracker-meta_pixel|INPUT/.test(after.focus), `S4 ${tag}: Install closes the steps and puts the cursor in the field to paste into (${after.focus})`, after)
    await p.screenshot({ path: join(shots, `page-${tag}.png`) })

    console.log(`\nT  back to the list, ${tag}\n`)
    await p.evaluate(() => (document.querySelector("[data-integrations-scroll]").scrollTop = 0))
    await sleep(300)
    const back = await film(p, "[data-integration-back]", 900)
    const list = back.frames.filter((f) => f.view === "list")
    const lmove = list.filter((f) => Math.abs(f.ty) > 0.05)
    const lset = list.find((f, i) => i > 0 && Math.abs(f.ty) <= 0.05 && Math.abs(list[i - 1].ty) > 0.05)
    const lstart = list.find((f) => list[0] && f.ty > list[0].ty + 0.05)
    report[`T ${tag} back`] = { first: list[0], movesFrom: lstart?.t ?? null, moving: lset && lstart ? lset.t - lstart.t : null, settledAt: lset && list[0] ? lset.t - list[0].t : null, worstGap: +back.worstGap.toFixed(1), film: list.slice(0, 20).map((f) => [f.t, f.ty, f.op]) }
    expect(!!list[0] && list[0].ty < -2 && list.every((f) => f.op === 1), `T2 ${tag}: the list is there on the first frame, settling down from ${list[0]?.ty}px, whole`)
    expect(lmove.every((f, i) => i === 0 || f.ty >= lmove[i - 1].ty - 0.01) && !!lset && !!lstart && lset.t - lstart.t <= 300, `T2 ${tag}: and in place ${lset && lstart ? lset.t - lstart.t : null}ms after it starts to move (${lstart && list[0] ? lstart.t - list[0].t : null}ms after the list is drawn), only one way`)
    const focus = await p.evaluate(() => document.activeElement?.dataset?.integrationCard ?? null)
    expect(focus === "meta-pixel", `T2 ${tag}: the card that was opened has the focus again`, focus)
    expect(errors.length === 0, `${tag}: no page errors`, errors)
    await p.close()

    const r = await open("/app/integrations", { ...vp })
    await r.p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const still = await film(r.p, '[data-integration-card="meta-pixel"]', 300)
    expect(still.frames.every((f) => Math.abs(f.ty) <= 0.05), `T3 ${tag}: with reduced motion nothing moves`)
    await r.p.close()
  }

  writeFileSync(join(shots, "report.json"), JSON.stringify(report, null, 2))
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   (pictures and report.json in ${shots})\n`)
process.exit(broken ? 1 : 0)
