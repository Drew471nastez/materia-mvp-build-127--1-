/**
 * ===========================================================================
 *  BACK TO THE EMAILS LIST, MEASURED EVERY FRAME, AT 390 AND 1280
 * ===========================================================================
 * "When I'm in Emails and I click on an email to go to its sub page and then
 * I go back, there is an animation bump happening throughout the whole page,
 * kind of coming up and down, which is clunky."
 *
 * An automation (and a draft, in the composer) is a page of its own, so the
 * way back to the list is a navigation, and the stage played its landing on
 * it (components/app/app-stage.tsx playEntrance): everything in the list
 * faded in from nothing and rose 2px, the whole page, on every Back. This
 * drives the real list (app/(storelib)/app/emails/emails-client.tsx) inside the real
 * NavigationLoadingBar and AppStage (scripts/render-emails-back.tsx), served
 * over http so the history is the browser's own, and reads every frame:
 *
 *   BACK                  from the first frame the list is there it is whole:
 *                         everything in it at opacity 1, nothing moved from
 *                         its place, on every frame after; the list is as far
 *                         down as it was left, on its first frame
 *   A VISIT STILL LANDS   the same list pushed as a new page (the rail, a
 *                         link) plays the landing as every page does, which
 *                         is also what shows the reading above can see one
 *
 * An email or a contact opened over the list, and closed, is measured by
 * scripts/check-emails-page.mjs.
 *
 *   node scripts/check-emails-back.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".emails-back-probe")
mkdirSync(dir, { recursive: true })

/* The router, as far as these pages can see one (see render-emails-back.tsx). */
writeFileSync(
  join(dir, "navigation.js"),
  `import { useSyncExternalStore } from "react"
const subs = new Set()
let href = location.pathname + location.search
const commit = () => { href = location.pathname + location.search; for (const f of [...subs]) f() }
for (const m of ["pushState", "replaceState"]) {
  const original = history[m].bind(history)
  history[m] = (...a) => { original(...a); commit() }
}
/* Back and forward commit a moment after the popstate, as the real router's
   restore does: every popstate listener (the shell's own) has run by then. */
window.addEventListener("popstate", () => setTimeout(commit, 16))
window.__delay = 80
const later = (fn) => setTimeout(fn, window.__delay)
const router = {
  push(u) { later(() => history.pushState({ __NA: true }, "", u)) },
  replace(u) { later(() => history.replaceState({ __NA: true }, "", u)) },
  back() { history.back() },
  forward() { history.forward() },
  prefetch() {},
  refresh() {},
}
window.__push = (u) => router.push(u)
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => href.split("?")[0], () => "/app/emails")
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, () => href.split("?")[1] || "", () => ""))
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
)
writeFileSync(
  join(dir, "link.js"),
  `import { createElement } from "react"
export default function Link({ href, prefetch, replace, scroll, ...rest }) { return createElement("a", { href, ...rest }) }
`,
)
/* Forty automations, so the list is tall enough to leave part way down. */
writeFileSync(
  join(dir, "supabase-client.js"),
  `const flows = Array.from({ length: 40 }, (_, i) => ({ id: "f" + i, name: "Automation " + i, trigger_type: i % 2 ? "purchase" : "new_subscriber", trigger_config: null, status: i % 3 ? "active" : "paused", steps: [{ id: "a", type: "email", config: { subject: "Hi", body: "<p>Hi</p>" } }], updated_at: "2026-09-01T00:00:00Z" }))
const tables = { creators: { id: "cr-1" }, subscribers: [], products: [], orders: [], email_flows: flows }
function from(table) {
  const q = {
    select() { return q }, eq() { return q }, in() { return q }, order() { return q }, limit() { return q }, update() { return q }, delete() { return q },
    maybeSingle() { return new Promise((r) => setTimeout(() => r({ data: tables[table] ?? null, error: null }), 40)) },
    then(res, rej) { return new Promise((r) => setTimeout(() => r({ data: tables[table] ?? [], error: null }), 40)).then(res, rej) },
  }
  return q
}
export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "ana@example.com" } } }) },
    from,
    rpc: () => new Promise((r) => setTimeout(() => r({ data: [], error: null }), 40)),
  }
}
`,
)
try {
  execFileSync(
    "npx",
    [
      "--no-install",
      "esbuild",
      join(root, "scripts/render-emails-back.tsx"),
      "--bundle",
      "--format=iife",
      "--platform=browser",
      "--jsx=automatic",
      "--log-level=error",
      `--outfile=${join(dir, "probe.js")}`,
      '--define:process.env.NODE_ENV="production"',
      "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
      `--alias:@/lib/supabase/client=${join(dir, "supabase-client.js")}`,
      `--alias:next/navigation=${join(dir, "navigation.js")}`,
      `--alias:next/link=${join(dir, "link.js")}`,
      `--alias:@=${root}`,
      "--loader:.css=empty",
      "--loader:.svg=dataurl",
    ],
    { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail("the probe did not bundle")
}
const html =
  `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/*
  One reading per drawn frame, taken in a task right after the frame's
  callbacks (the stage starts its landing in a requestAnimationFrame of its
  own, so a reading inside this one would be from before it began). For the
  list: the lowest opacity anything in it is drawn at (its own, times every
  box above it) and the furthest anything in it sits from its place (the
  stage moves it with `translate`, order-motion with `transform`).
*/
const record = (p) =>
  p.evaluate(() => {
    window.__rec = []
    window.__recording = true
    const drawn = new MessageChannel()
    const frames = []
    const opacityOf = (el) => {
      let o = 1
      for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
      return o
    }
    const offsetOf = (el) => {
      const cs = getComputedStyle(el)
      const t = cs.translate && cs.translate !== "none" ? Number(String(cs.translate).split(" ")[1]?.replace("px", "") || 0) : 0
      const m = cs.transform && cs.transform !== "none" ? new DOMMatrixReadOnly(cs.transform).m42 : 0
      return Math.abs(t) + Math.abs(m)
    }
    const read = (t) => {
      const list = document.querySelector("[data-emails-page] .orders-list")
      const flow = document.querySelector("[data-page=flow]")
      const kids = list ? [...list.children].filter((c) => c.getClientRects().length) : []
      window.__rec.push({
        t,
        page: list ? "list" : flow ? "flow" : null,
        opacity: kids.length ? Math.min(...kids.map(opacityOf)) : null,
        offset: kids.length ? Math.max(...kids.map(offsetOf)) : null,
        scrollTop: list ? list.scrollTop : null,
        rows: list ? list.querySelectorAll("[data-flow-row]").length : 0,
      })
    }
    drawn.port1.onmessage = () => {
      const t = frames.shift()
      if (t != null) read(t)
    }
    const tick = (t) => {
      if (!window.__recording) return
      frames.push(t)
      drawn.port2.postMessage(0)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
const stop = (p) => p.evaluate(() => { window.__recording = false; return window.__rec })

const LEFT_AT = 420

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 860, deviceScaleFactor: 1 }],
]) {
  console.log(`\n${label} wide`)
  const p = await browser.newPage()
  await p.setViewport(viewport)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/emails?tab=flows`)
  await p.waitForSelector("[data-flow-row]", { timeout: 8000 })
  await wait(600)

  /* Left part way down, then into an automation. */
  await p.evaluate((y) => { document.querySelector("[data-emails-page] .orders-list").scrollTop = y }, LEFT_AT)
  await wait(250)
  const left = await p.evaluate(() => document.querySelector("[data-emails-page] .orders-list").scrollTop)
  const into = async () => {
    const row = await p.evaluateHandle(() => [...document.querySelectorAll("[data-flow-row]")].find((r) => { const b = r.getBoundingClientRect(); return b.top > 150 && b.bottom < innerHeight - 40 }))
    await row.asElement().click()
    await p.waitForSelector("[data-page=flow]", { timeout: 4000 })
    await wait(500)
  }
  await into()

  /* Back, by the page's own back (a history back). */
  await record(p)
  await p.click("[data-flow-back]")
  await wait(900)
  const back = (await stop(p)).filter((f) => f.page === "list" && f.rows > 0)
  const first = back[0]
  const minOpacity = back.length ? Math.min(...back.map((f) => f.opacity)) : null
  const maxOffset = back.length ? Math.max(...back.map((f) => f.offset)) : null
  console.log(`  ..    back: ${back.length} frames of the list; lowest opacity ${minOpacity}, furthest from its place ${maxOffset}px; first frame at scroll ${first?.scrollTop} (left at ${left})`)
  expect(back.length > 10, "the list comes back", back.length)
  expect(minOpacity === 1, "whole on every frame: nothing in it fades in", minOpacity)
  expect(maxOffset !== null && maxOffset < 0.01, "and nothing in it rises or falls", maxOffset)
  expect(first && Math.abs(first.scrollTop - left) <= 1 && back.every((f) => Math.abs(f.scrollTop - left) <= 1), "as far down as it was left, from its first frame", [...new Set(back.map((f) => f.scrollTop))])

  /* The browser's own back, from the automation again. */
  await into()
  await record(p)
  await p.goBack()
  await wait(900)
  const browserBack = (await stop(p)).filter((f) => f.page === "list" && f.rows > 0)
  expect(browserBack.length > 10 && Math.min(...browserBack.map((f) => f.opacity)) === 1 && Math.max(...browserBack.map((f) => f.offset)) < 0.01, "the browser's back too", { frames: browserBack.length, opacity: Math.min(...browserBack.map((f) => f.opacity)), offset: Math.max(...browserBack.map((f) => f.offset)) })

  /* A visit, not a return: the list pushed as a new page still lands. */
  await into()
  await record(p)
  await p.evaluate(() => window.__push("/app/emails?tab=flows"))
  await wait(900)
  const visit = (await stop(p)).filter((f) => f.page === "list" && f.rows > 0)
  const visitFirst = visit[0]?.opacity ?? null
  console.log(`  ..    a visit: first frame at opacity ${visitFirst}, ${visit.filter((f) => f.opacity < 0.999).length} frames landing`)
  expect(visitFirst !== null && visitFirst < 0.5 && visit.at(-1)?.opacity === 1, "a visit to the list still lands as every page does (and the reading sees a landing)", { first: visitFirst, last: visit.at(-1)?.opacity })

  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

await browser.close()
server.close()
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nAll checks passed")
