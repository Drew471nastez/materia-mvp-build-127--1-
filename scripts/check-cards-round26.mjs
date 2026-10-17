/**
 * ===========================================================================
 *  ROUND 26 (W1), MEASURED: THE COMMUNITY CARDS AND A COMMUNITY'S STATES
 * ===========================================================================
 * The owner: "the Published and Archived badges sit too close to the cover,
 * almost touching it", "fix card layouts on desktop, tablet and mobile",
 * "hover, focus and active states don't create unexpected visual movement",
 * "clear draft, published, archived and pending-deletion states". Headless
 * Chromium over the real list and the real Settings
 * (scripts/render-cards-round26.tsx), at 1440x900, 820x1180 and 390x844
 * (touch, 4x CPU), light and with the dark attribute:
 *
 *   CARDS    the badge's distance under the cover, the same on every card;
 *            the card's height (BASE_SRC=dir measures an older copy for the
 *            before); columns 3, 2, 1; no sideways scroll; the name's width
 *            (narrow cards keep it whole, the badge goes to the line under)
 *   STILL    nothing on a card moves by a pixel on hover, keyboard focus or
 *            a press
 *   MENUS    a draft offers no Share; one being deleted offers Keep and no
 *            Archive or Share; the plan note's count
 *   STATES   Settings, Publish and archive for a draft, a published, an
 *            archived and a deleting community: the header's badge, which
 *            cards and buttons show
 *
 *   node scripts/check-cards-round26.mjs
 *   SHOTS_DIR=dir keeps the pictures (.round26-cards-shots by default; delete it before committing)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".cards26-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round26-cards-shots")
const ORIGIN = "https://storelib.com"
const NOV5 = new Date(Date.UTC(2026, 10, 5, 12)).toISOString()
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
let state = { pathname: location.pathname, search: location.search }
const set = (p) => { state = { ...state, ...p }; listeners.forEach((f) => f()) }
const sub = (f) => (listeners.add(f), () => listeners.delete(f))
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, refresh: () => log("refresh"), back: () => {}, forward: () => {} }
export const usePathname = () => useSyncExternalStore(sub, () => state.pathname, () => state.pathname)
export const useSearchParams = () => { const s = useSyncExternalStore(sub, () => state.search, () => state.search); return useMemo(() => new URLSearchParams(s), [s]) }
export const useRouter = () => router
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault(); (window.__router ||= []).push(["link", href]) } }, children)
})
`,
  )
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { const ch = { on() { return ch }, subscribe() { return ch } }; return { channel: () => ch, removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }) } } }\nexport const isNativePlatform = () => false\n`)
  let sheet = null
  if (process.env.BASE_SRC) {
    sheet = join(stubs, "globals-with-base.css")
    writeFileSync(sheet, `${readFileSync(join(root, "app/globals.css"), "utf8")}\n@source "${process.env.BASE_SRC}";\n`)
  }
  const css = await appCss(root, sheet)
  const dark = readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-cards-round26.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.cards26-probe/navigation.js", "next/link": "./.cards26-probe/link.jsx", "next/image": "./.cards26-probe/image.jsx" },
    plugins: [
      { name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } },
      /* BASE_SRC=dir: an older copy of components/community and lib/communities (git archive <commit> ... | tar -x -C dir), for the before. */
      ...(process.env.BASE_SRC
        ? [{ name: "base-src", setup(b) { b.onResolve({ filter: /^(@|\.)\/(components\/community|lib\/communities)\// }, (args) => (args.resolveDir === root || args.path.startsWith("@") ? b.resolve(`./${args.path.replace(/^(@|\.)\//, "")}`, { resolveDir: process.env.BASE_SRC, kind: args.kind }) : undefined)) } }]
        : []),
    ],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "cards.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "cards.js"), "utf8")
  const page = (isDark) =>
    `<!doctype html><html${isDark ? " data-sl-dark" : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style>${isDark ? `<style>${dark}</style>` : ""}<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const SIZES = [
    ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }, 3],
    ["1024", { width: 1024, height: 768, deviceScaleFactor: 1 }, 3],
    ["820", { width: 820, height: 1180, deviceScaleFactor: 1 }, 2],
    ["390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 1],
  ]
  const plan = (state) => ({
    ready: true,
    paying: state === "deleting" ? 1 : 0,
    lastPaidUntil: state === "deleting" ? NOV5 : null,
    refundEstimateCents: 0,
    currency: "usd",
    scheduled: state === "deleting" ? { mode: "period_end", deleteAt: NOV5, requestedAt: new Date().toISOString(), stopped: 1, total: 1, failing: 0, canUndo: true } : null,
  })

  async function open(path, vp, isDark) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    if (vp.isMobile) {
      const cdp = await p.target().createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    }
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    const html = page(isDark)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const state = new URL(path, ORIGIN).searchParams.get("state") || "published"
        const body = url.includes("/delete") ? plan(state) : {}
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load", timeout: 180_000 })
    await p.evaluate(() => document.fonts.ready)
    await sleep(700)
    return { p, errors }
  }

  const cards = (p) =>
    p.evaluate(() =>
      [...document.querySelectorAll("[data-community-card]")].map((card) => {
        const r = (el) => (el ? el.getBoundingClientRect() : null)
        const c = r(card)
        const cover = r(card.querySelector("[data-card-cover]"))
        const badge = r(card.querySelector("[data-card-state]"))
        const logo = r(card.querySelector("[data-card-logo]"))
        const name = r(card.querySelector("[data-card-name]"))
        return {
          id: card.getAttribute("data-community-card"),
          state: card.querySelector("[data-community-state]")?.getAttribute("data-community-state"),
          word: card.querySelector("[data-community-state]")?.textContent,
          line: card.querySelector("[data-card-name]")?.parentElement?.nextElementSibling?.textContent ?? card.querySelector("[data-card-name]")?.nextElementSibling?.textContent,
          x: Math.round(c.left),
          h: Math.round(c.height),
          gap: badge && cover ? Math.round(badge.top - cover.bottom) : null,
          badgeRightInside: badge ? Math.round(c.right - badge.right) : null,
          badgeOverName: badge && name ? badge.left < name.right - 0.5 && badge.top < name.bottom && badge.bottom > name.top : null,
          logoBelowCover: logo && cover ? Math.round(logo.bottom - cover.bottom) : null,
          nameW: name ? Math.round(name.width) : null,
          bodyW: Math.round(c.width - 32),
        }
      }),
    )
  const sideways = (p) => p.evaluate(() => ({ doc: document.scrollingElement.scrollWidth - innerWidth, pane: (() => { const el = document.querySelector("[data-community-list]"); return el ? el.scrollWidth - el.clientWidth : null })() }))
  const rects = (p, id) =>
    p.evaluate((id) => {
      const card = document.querySelector(`[data-community-card="${id}"]`)
      return ["[data-card-cover]", "[data-card-logo]", "[data-card-name]", "[data-card-state]", "[data-card-members]", "[data-card-menu]"].map((s) => {
        const b = (s === "" ? card : card.querySelector(s)).getBoundingClientRect()
        return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10].join(",")
      }).concat([(() => { const b = card.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10).join(",") })()])
    }, id)
  const menuWords = async (p, id) => {
    await p.click(`[data-community-card="${id}"] [data-card-menu]`)
    await sleep(400)
    const words = await p.evaluate(() => [...document.querySelectorAll('[role="menuitem"], [data-action-item], [role="dialog"] button, [role="dialog"] a')].map((el) => el.textContent.trim()).filter(Boolean))
    await p.keyboard.press("Escape")
    await sleep(300)
    return words
  }

  const summary = []
  for (const isDark of [false, true]) {
    for (const [label, vp, cols] of SIZES) {
      const tag = `${label}${isDark ? "-dark" : ""}`
      console.log(`\nlist ${tag}`)
      const { p, errors } = await open("/app/community?plan=free", vp, isDark)
      const cs = await cards(p)
      const gaps = cs.map((c) => c.gap)
      const heights = cs.map((c) => c.h)
      const columns = new Set(cs.map((c) => c.x)).size
      summary.push({ tag, gaps: [...new Set(gaps)], heights: [...new Set(heights)], columns, nameW: cs[0]?.nameW, bodyW: cs[0]?.bodyW })
      expect(errors.length === 0, `${tag}: no page errors`, errors)
      expect(gaps.every((g) => g !== null && g >= 28), `${tag}: every badge is clear of the cover (px under its edge)`, gaps)
      expect(new Set(gaps).size === 1, `${tag}: the same distance on every card`)
      expect(cs.every((c) => c.badgeOverName === false && c.badgeRightInside >= 12), `${tag}: the badge never covers the name and keeps the card's padding`, cs.map((c) => c.badgeRightInside))
      expect(columns === cols, `${tag}: ${cols} column(s)`, columns)
      /* A card under 300px keeps the name's whole width (the badge goes to the line under it). */
      expect(cs.every((c) => c.bodyW + 32 >= 300 || c.nameW >= c.bodyW - 3), `${tag}: a narrow card's name has the card's whole width`, cs.map((c) => [c.bodyW, c.nameW]))
      const side = await sideways(p)
      expect(side.doc <= 0 && (side.pane ?? 0) <= 0, `${tag}: no sideways scroll`, side)
      expect(cs.find((c) => c.id === "c4")?.state === "deleting" && /^Deleting$/.test(cs.find((c) => c.id === "c4")?.word ?? ""), `${tag}: the one being deleted says Deleting`, cs.find((c) => c.id === "c4")?.word)
      expect(["published", "published", "draft", "archived", "deleting", "published"].every((s, i) => cs[i]?.state === s), `${tag}: Published, Draft, Archived, Deleting as badges`, cs.map((c) => c.state))
      const note = await p.evaluate(() => document.querySelector("[data-limit-note]")?.textContent.trim())
      expect(/^1 of 2 communities on the Free plan\. Communities being deleted do not count\./.test(note ?? ""), `${tag}: the plan note counts 1 of 2 and says why`, note)
      await p.screenshot({ path: join(shots, `list-${tag}.png`) })
      if (!isDark) {
        /* STILL: the first card's parts before and after a hover, a keyboard focus and a press. */
        const still = await rects(p, "c0")
        if (!vp.isMobile) {
          await p.hover('[data-community-card="c0"] [data-card-name]')
          await sleep(250)
          expect(JSON.stringify(await rects(p, "c0")) === JSON.stringify(still), `${tag}: hover moves nothing`)
          await p.mouse.move(2, 2)
        }
        await p.evaluate(() => document.querySelector('[data-community-card="c0"] [data-card-link]').focus())
        await sleep(200)
        expect(JSON.stringify(await rects(p, "c0")) === JSON.stringify(still), `${tag}: keyboard focus moves nothing`)
        const name = await p.$('[data-community-card="c0"] [data-card-name]')
        const b = await name.boundingBox()
        if (vp.hasTouch) {
          const cdp = await p.target().createCDPSession()
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x + 5, y: b.y + 5 }] })
          await sleep(220)
          expect(JSON.stringify(await rects(p, "c0")) === JSON.stringify(still), `${tag}: a finger resting on it moves nothing`)
          await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] })
        } else {
          await p.mouse.move(b.x + 5, b.y + 5)
          await p.mouse.down()
          await sleep(200)
          expect(JSON.stringify(await rects(p, "c0")) === JSON.stringify(still), `${tag}: a press moves nothing`)
          await p.mouse.move(2, 2)
          await p.mouse.up()
        }
        if (label === "1440" || label === "390") {
          const draft = await menuWords(p, "c2")
          expect(!draft.includes("Share") && draft.includes("Open"), `${tag}: a draft offers no Share`, draft)
          const leaving = await menuWords(p, "c4")
          expect(leaving.includes("Keep the community") && !leaving.includes("Archive") && !leaving.includes("Bring back") && !leaving.includes("Share"), `${tag}: one being deleted offers Keep, not Archive or Share`, leaving)
          const live = await menuWords(p, "c0")
          expect(live.includes("Share") && live.includes("Archive"), `${tag}: a published one keeps Share and Archive`, live)
        }
      }
      await p.close()
    }
  }

  for (const isDark of [false, true]) {
    for (const [label, vp] of SIZES) {
      for (const state of ["draft", "published", "archived", "deleting"]) {
        const tag = `${state}-${label}${isDark ? "-dark" : ""}`
        const { p, errors } = await open(`/app/community/nightshift/settings?tab=advanced&state=${state}`, vp, isDark)
        await sleep(300)
        const seen = await p.evaluate(() => {
          const badge = document.querySelector("[data-community-shell] [data-community-state]")
          const text = (document.querySelector("[data-community-shell]") || document.body).innerText
          const buttons = [...document.querySelectorAll("[data-community-shell] button")].map((b) => b.textContent.trim()).join(" | ")
          return { badge: badge?.getAttribute("data-community-state") ?? null, word: badge?.textContent ?? null, text, buttons }
        })
        /* Headings and the buttons: the shell's archived line (its own worker's) mentions Bring it back in words. */
        const has = (re) => re.test(seen.buttons) || (re.source.startsWith("Deleting") && re.test(seen.text))
        expect(errors.length === 0, `${tag}: no page errors`, errors)
        expect(seen.badge === state, `${tag}: the header's badge says ${state}`, seen.word)
        if (state === "draft") expect(has(/\bPublish\b/) && has(/\bArchive\b/) && !has(/Unpublish/), `${tag}: Publish and Archive`)
        if (state === "published") expect(has(/Unpublish/) && has(/\bArchive\b/), `${tag}: Unpublish and Archive`)
        if (state === "archived") expect(has(/Bring it back/) && !has(/Unpublish/), `${tag}: Bring it back, no Publish`)
        if (state === "deleting") expect(has(/Deleting on/) && has(/Keep the community/) && !has(/Bring it back/) && !has(/Unpublish/), `${tag}: Deleting on its date and Keep, no Bring it back`, seen.buttons)
        if (label !== "820") await p.screenshot({ path: join(shots, `settings-${tag}.png`) })
        await p.close()
      }
    }
  }
  console.log("\n" + JSON.stringify(summary))
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall measured")
process.exit(broken ? 1 : 0)
