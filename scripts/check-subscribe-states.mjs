#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE SUBSCRIBE BAR: IN THE FIRST HTML, AND THREE STATES THAT MOVE NOTHING
 * ===========================================================================
 * "The Subscribe button in the creator's top bar: its states (idle,
 *  submitting, subscribed) must transition smoothly and cleanly."
 *
 * The real bar (scripts/render-subscribe-states.tsx), rendered to HTML and
 * painted before it is hydrated, exactly as a visitor's browser gets it, with
 * a cover-sized block under it standing for the rest of the page. The
 * subscribe request is held 700ms.
 *
 *   IN THE HTML   the bar is in the server render, and hydrating it does not
 *                 move the page (it used to render nothing until hydration
 *                 and then push the whole page down by its height)
 *   ONE WIDTH     the button is the same width idle, sending and done, so the
 *                 email field beside it never stretches
 *   NOTHING MOVES the block under the bar stays put through the whole submit
 *                 (the success line used to make the bar taller)
 *   THE PILL      a dark pill says it worked, and it is not green
 *
 *   node scripts/check-subscribe-states.mjs
 *   SHOTS=<dir> node scripts/check-subscribe-states.mjs   pictures of each state
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".subscribe-states-probe")
mkdirSync(dir, { recursive: true })
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-subscribe-states.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    logLevel: "error",
    outfile: join(dir, "probe.js"),
    banner: { js: 'var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;' },
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": root },
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) { rmSync(dir, { recursive: true, force: true }); fail(`the probe did not bundle: ${e.message}`) }
const js = readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")
rmSync(dir, { recursive: true, force: true })
const css = await appCss(root)
const faces = interFaces(root) || (process.env.INTER_WOFF2
  ? `@font-face{font-family:Inter;font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(process.env.INTER_WOFF2).toString("base64")}) format("woff2")}`
  : "")

const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="root"></div><script>${js}</script></body></html>`
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
if (process.env.SHOTS) mkdirSync(process.env.SHOTS, { recursive: true })

for (const theme of ["dark", "light"]) for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 800, deviceScaleFactor: 1 }],
]) {
  const at = `${label} ${theme}:`
  /* A fresh context each time: the bar remembers a subscription in storage. */
  const context = await browser.createBrowserContext()
  const p = await context.newPage()
  await p.setViewport(viewport)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/?theme=${theme}`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  const before = await p.evaluate(() => ({ has: window.__serverHasBar, cover: window.__coverBefore, err: window.__err || null }))
  if (before.err) fail(`${at} the bar did not render on the server: ${before.err}`)
  await p.evaluate(() => window.__hydrate())
  await wait(700)
  const after = await p.evaluate(() => ({ cover: window.__cover(), errors: window.__hydrationErrors }))
  console.log(`\n${at}`)
  console.log(`  in the server HTML          ${before.has ? "yes" : "no"}`)
  console.log(`  page under it, hydrating    ${before.cover}px → ${after.cover}px`)
  if (!before.has) problems.push(`${at} the bar is not in the server's HTML`)
  if (Math.abs(after.cover - before.cover) > 1) problems.push(`${at} hydrating the bar moved the page ${after.cover - before.cover}px`)
  if (after.errors.length) problems.push(`${at} hydration: ${after.errors[0]}`)
  if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `bar-${theme}-${label}-idle.png`), clip: { x: 0, y: 0, width: viewport.width, height: 130 } })

  /* Type into whichever field is showing at this width, then submit. */
  const field = await p.evaluateHandle(() => [...document.querySelectorAll('input[type="email"]')].find((i) => i.offsetParent))
  await field.type("reader@example.com")
  const frames = await p.evaluate(() => new Promise((resolve) => {
    const form = [...document.querySelectorAll("form")].find((f) => f.offsetParent)
    const button = form.querySelector('button[type="submit"]')
    const face = button.querySelector("[data-subscribe-phase]")
    const out = []
    const t0 = performance.now()
    button.click()
    const tick = () => {
      out.push({
        t: Math.round(performance.now() - t0),
        phase: face.getAttribute("data-subscribe-phase"),
        width: Math.round(button.getBoundingClientRect().width * 10) / 10,
        field: Math.round(form.querySelector("input").getBoundingClientRect().width * 10) / 10,
        cover: window.__cover(),
        opacity: getComputedStyle(button).opacity,
        done: Number(getComputedStyle(face.children[1]).opacity),
      })
      if (performance.now() - t0 < 1300) requestAnimationFrame(tick)
      else resolve(out)
    }
    requestAnimationFrame(tick)
  }))
  const phases = [...new Set(frames.map((f) => f.phase))]
  const widths = [...new Set(frames.map((f) => f.width))]
  const fields = [...new Set(frames.map((f) => f.field))]
  const covers = [...new Set(frames.map((f) => f.cover))]
  const opacities = [...new Set(frames.map((f) => f.opacity))]
  console.log(`  phases                      ${phases.join(" → ")}`)
  console.log(`  button width                ${widths.join(", ")}px`)
  console.log(`  email field width           ${fields.join(", ")}px`)
  console.log(`  page under it               ${covers.join(", ")}px`)
  console.log(`  button opacity              ${opacities.join(", ")}`)
  if (phases.join(",") !== "sending,done") problems.push(`${at} the button went ${phases.join(" → ")}, not sending → done`)
  if (widths.length > 1) problems.push(`${at} the button changed width: ${widths.join(", ")}`)
  if (fields.length > 1) problems.push(`${at} the email field changed width: ${fields.join(", ")}`)
  if (covers.length > 1) problems.push(`${at} the page moved during the submit: ${covers.join(", ")}`)
  if (opacities.some((o) => o !== "1")) problems.push(`${at} the whole button faded (${opacities.join(", ")})`)
  /* "Subscribed" arrives over several frames rather than on one. */
  const between = frames.filter((f) => f.done > 0.02 && f.done < 0.98).length
  console.log(`  "Subscribed" arriving       over ${between} frames`)
  if (between < 3) problems.push(`${at} "Subscribed" snapped in (${between} frames between hidden and shown)`)

  const toast = await p.evaluate(() => {
    const el = document.querySelector("[data-pill-toast]")
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return { text: el.textContent, bg: cs.backgroundColor, color: cs.color, top: Math.round(r.top), bottom: Math.round(innerHeight - r.bottom), h: Math.round(r.height) }
  })
  console.log(`  confirmation                ${toast ? `"${toast.text}" on ${toast.bg}, ${toast.h}px tall, ${toast.bottom}px from the bottom` : "none"}`)
  if (!toast) problems.push(`${at} no confirmation appeared`)
  else {
    if (toast.bg !== "rgb(17, 17, 19)") problems.push(`${at} the confirmation is ${toast.bg}, not the near-black pill`)
    if (!/^Subscribed to Luca Dragoste$/.test(toast.text)) problems.push(`${at} the confirmation says "${toast.text}"`)
  }
  if (process.env.SHOTS) {
    await p.screenshot({ path: join(process.env.SHOTS, `bar-${theme}-${label}-done.png`), clip: { x: 0, y: 0, width: viewport.width, height: 130 } })
    await p.screenshot({ path: join(process.env.SHOTS, `bar-${theme}-${label}-toast.png`) })
  }

  /* And the sending state on its own, for the eye, in a fresh context. */
  if (process.env.SHOTS) {
    const c2 = await browser.createBrowserContext()
    const p2 = await c2.newPage()
    await p2.setViewport(viewport)
    await p2.goto(`${base}/?theme=${theme}`, { waitUntil: "load" })
    await p2.evaluate(() => { window.__subscribeDelay = 4000; window.__hydrate() })
    await wait(500)
    const f2 = await p2.evaluateHandle(() => [...document.querySelectorAll('input[type="email"]')].find((i) => i.offsetParent))
    await f2.type("reader@example.com")
    await p2.evaluate(() => [...document.querySelectorAll("form")].find((f) => f.offsetParent).querySelector('button[type="submit"]').click())
    await wait(400)
    await p2.screenshot({ path: join(process.env.SHOTS, `bar-${theme}-${label}-sending.png`), clip: { x: 0, y: 0, width: viewport.width, height: 130 } })
    await c2.close()
  }
  if (errors.length) problems.push(`${at} ${errors[0]}`)
  await context.close()
}

await browser.close()
server.close()
console.log("")
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("The bar is in the HTML, and idle, sending and done move nothing.\n")
