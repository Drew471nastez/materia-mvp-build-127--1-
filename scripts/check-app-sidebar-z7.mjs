/**
 * ===========================================================================
 *  ROUND Z7: THE /app SIDEBAR'S NESTED ROWS AND ITS SCROLLBAR, MEASURED
 * ===========================================================================
 * The real DesktopSidebarContent (scripts/render-app-sidebar-z7.tsx) on
 * /app/integrations with Storelib Reviews lit under Integrations, in a
 * 260x480 sidebar so the list scrolls, in headless Chromium at 1280x800
 * (the rail is a computer's; a phone has the menu page instead):
 *
 *   NOT GLUED   the gap from the parent's lit pill to the first child's lit
 *               pill, and between children; the guide line starts below the
 *               parent's pill, on its icon's centre
 *   NO COLUMN   the platform's bar takes no width (offsetWidth equals
 *               clientWidth), and the rows are as wide and as far in when the
 *               thumb shows as when it is hidden
 *   THE THUMB   4px wide, at most 72px long, inset from the nav's ends;
 *               clear at rest, filmed fading in on hover and out on leave
 *               (opacity only), following a scroll
 *
 *   PROBE_CSS=source node scripts/check-app-sidebar-z7.mjs   (wrap in flock /tmp/v-heavy.lock)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".app-sidebar-z7-probe")
const shots = process.env.SHOTS_DIR || null
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.jsx"), `export const usePathname = () => "/app/integrations"
export const useSearchParams = () => new URLSearchParams("integration=storelib-reviews")
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children)
})
export const useLinkStatus = () => ({ pending: false })`)

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-app-sidebar-z7.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [
      {
        name: "stubs",
        setup(b) {
          b.onResolve({ filter: /^next\/(navigation|link)$/ }, (a) => ({ path: join(stubs, `${a.path.split("/")[1]}.jsx`) }))
          b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
        },
      },
    ],
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  html = `<!doctype html><html class="light"><head><meta charset="utf-8"><style>${interFaces(root)}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fff}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

const file = join(root, ".app-sidebar-z7.html")
writeFileSync(file, html)
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
try {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.setViewport({ width: 1280, height: 800 })
  await p.goto(`file://${file}`)
  await sleep(700)
  await p.mouse.move(900, 400)
  await sleep(600)

  console.log("\nNot glued\n")
  const g = await p.evaluate(() => {
    const parent = [...document.querySelectorAll("[data-nav-row]")].find((a) => a.textContent.trim() === "Integrations")
    const kids = [...parent.closest("div").parentElement.querySelectorAll("[data-nav-children] a")]
    const pr = parent.getBoundingClientRect()
    const rs = kids.map((k) => k.getBoundingClientRect())
    const list = parent.closest("div").parentElement.querySelector("[data-nav-children]")
    const lr = list.getBoundingClientRect()
    const icon = parent.querySelector("[data-nav-icon]")?.getBoundingClientRect()
    return {
      parentBg: getComputedStyle(parent).backgroundColor,
      childBg: getComputedStyle(kids[0]).backgroundColor,
      secondBg: getComputedStyle(kids[1]).backgroundColor,
      gapParentChild: +(rs[0].top - pr.bottom).toFixed(2),
      gapChildren: +(rs[1].top - rs[0].bottom).toFixed(2),
      lineX: +(lr.left + 0.5).toFixed(2),
      iconCentre: icon ? +(icon.left + icon.width / 2).toFixed(2) : null,
      lineTopBelowParent: +(lr.top - pr.bottom).toFixed(2),
      lineColour: getComputedStyle(list).borderLeftColor,
    }
  })
  expect(g.parentBg === "rgb(232, 232, 232)" && g.childBg === "rgb(232, 232, 232)", `both rows lit, as in the screenshot (${g.parentBg}, ${g.childBg})`)
  expect(g.gapParentChild >= 4, `${g.gapParentChild}px between Integrations' pill and Storelib Reviews' pill (was 1px)`)
  expect(g.gapChildren >= 3, `${g.gapChildren}px between two children (was 1px)`)
  expect(g.lineTopBelowParent >= 4, `the guide line starts ${g.lineTopBelowParent}px below the parent's pill, not against it`)
  expect(g.iconCentre !== null && Math.abs(g.lineX - g.iconCentre) <= 1, `the guide line sits on the parent's icon centre (${g.lineX} vs ${g.iconCentre})`)

  console.log("\nNo column, a slim thumb\n")
  const rest = await p.evaluate(() => {
    const nav = document.querySelector(".sidebar-nav")
    const thumb = document.querySelector("[data-nav-thumb]")
    const row = document.querySelector("[data-nav-row]").getBoundingClientRect()
    const before = getComputedStyle(thumb, "::before")
    const t = thumb.getBoundingClientRect(), n = nav.getBoundingClientRect()
    return { overflow: nav.scrollHeight - nav.clientHeight, gutter: nav.offsetWidth - nav.clientWidth, rowLeft: row.left, rowRight: row.right, op: +getComputedStyle(thumb).opacity, scrollable: thumb.hasAttribute("data-scrollable"), lineW: t.width - parseFloat(before.left) - parseFloat(before.right), h: t.height, top: t.top - n.top, navH: n.height, right: n.right - t.right }
  })
  expect(rest.overflow > 40 && rest.scrollable, `the list scrolls (${rest.overflow}px more than shows)`)
  expect(rest.gutter === 0, `the platform's bar takes ${rest.gutter}px`)
  expect(rest.op === 0, `the thumb is clear at rest (opacity ${rest.op})`)
  expect(rest.lineW === 4, `the thumb is ${rest.lineW}px wide`)
  expect(rest.h >= 28 && rest.h <= 72, `and ${rest.h}px long in a ${Math.round(rest.navH)}px nav (at most 72)`)
  expect(rest.top >= 8, `inset ${rest.top}px from the nav's top`)

  const film = async (move) => {
    await p.evaluate(() => {
      window.__f = []
      const th = document.querySelector("[data-nav-thumb]")
      const t0 = performance.now()
      const tick = (t) => {
        window.__f.push({ t: t - t0, op: +getComputedStyle(th).opacity, tf: getComputedStyle(th).transform })
        if (t - t0 < 900) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await sleep(30)
    await move()
    await sleep(950)
    const f = await p.evaluate(() => window.__f)
    const start = f.find((x, i) => i > 0 && x.op !== f[0].op)
    const end = f.find((x) => x.op === f.at(-1).op && start && x.t >= start.t)
    return { from: f[0].op, to: f.at(-1).op, ms: start && end ? Math.round(end.t - start.t) : null, between: f.filter((x) => x.op > 0.02 && x.op < 0.98).length, moved: new Set(f.map((x) => x.tf)).size > 1 }
  }
  const fin = await film(() => p.mouse.move(120, 300))
  expect(fin.from === 0 && fin.to === 1 && fin.ms >= 120 && fin.ms <= 320 && fin.between >= 6, `hover: it fades in over ${fin.ms}ms (${fin.between} frames between)`)
  const shown = await p.evaluate(() => { const r = document.querySelector("[data-nav-row]").getBoundingClientRect(); return { l: r.left, r: r.right } })
  expect(shown.l === rest.rowLeft && shown.r === rest.rowRight, `the rows do not move when it shows (${rest.rowLeft}-${rest.rowRight} then ${shown.l}-${shown.r})`)
  if (shots) {
    mkdirSync(shots, { recursive: true })
    await p.screenshot({ path: join(shots, "app-sidebar-z7-hover.png"), clip: { x: 0, y: 0, width: 280, height: 500 } })
  }
  const before = await p.evaluate(() => getComputedStyle(document.querySelector("[data-nav-thumb]")).transform)
  await p.mouse.wheel({ deltaY: 400 })
  await sleep(300)
  const after = await p.evaluate(() => ({ tf: getComputedStyle(document.querySelector("[data-nav-thumb]")).transform, top: document.querySelector(".sidebar-nav").scrollTop }))
  expect(after.top > 0 && after.tf !== before, `a scroll moves it (scrollTop ${after.top}, ${before} to ${after.tf})`)
  const fout = await film(() => p.mouse.move(900, 400))
  expect(fout.from === 1 && fout.to === 0 && fout.ms >= 300 && fout.ms <= 560 && fout.between >= 12, `leaving: it fades out over ${fout.ms}ms (${fout.between} frames between), slower than it came`)
  expect(errors.length === 0, "no page errors", errors)

  const reduce = await browser.newPage()
  await reduce.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await reduce.setViewport({ width: 1280, height: 800 })
  await reduce.goto(`file://${file}`)
  await sleep(500)
  const rm = await reduce.evaluate(() => getComputedStyle(document.querySelector("[data-nav-thumb]")).transitionDuration)
  expect(/^0s/.test(rm), `reduced motion: no fade (${rm})`)
} finally {
  await browser.close()
  rmSync(file, { force: true })
}
console.log(broken ? `\n${broken} FAILED\n` : "\nall ok\n")
process.exit(broken ? 1 : 0)
