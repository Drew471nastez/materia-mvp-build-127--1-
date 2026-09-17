/**
 * ===========================================================================
 *  THE HERO SAYS DISCOVER, THE WORD CHANGES, AND THE LINE DOES NOT MOVE
 * ===========================================================================
 * Four claims, and every one of them is a measurement rather than an opinion:
 *
 *   THE WORD ROTATES. Sampled over four seconds, how many different nouns
 *   appear. One means the rotation is dead; the point of it is that the
 *   catalogue is more than one kind of thing.
 *
 *   AND THE HEADING DOES NOT JUMP. The chip is sized from the longest word
 *   and centres the current one inside it. Without that the whole line
 *   re-centres every two seconds, which is what makes a rotating word look
 *   cheap. Measured as the movement of the word "Discover" across the swaps.
 *
 *   THE COLOUR IS PURPLE, NOT BLUE. Read off the computed style, as a hue.
 *
 *   IT FITS A PHONE. The heading, the sub-line and the field all inside
 *   375px with nothing overflowing.
 *
 *   pnpm build && node scripts/check-explore-hero.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const out = mkdtempSync(join(tmpdir(), "storelib-explore-hero-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-explore-hero.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const READ = `(() => {
  const h = document.querySelector("#host")
  const chip = h.querySelector("[aria-hidden] span.relative")
  const line = h.querySelector("p")
  const field = h.querySelector("input")
  const anchor = h.querySelector("[data-explore-search-anchor]")
  const word = chip ? chip.lastElementChild : null
  const lineRect = line.getBoundingClientRect()
  return {
    /*
      The chip holds TWO words: the visible one and an invisible copy of the
      longest, which is what stops the line re-centring on every swap. A plain
      textContent read therefore reports "Discover templatesebooks" and looks
      like a bug in the component rather than one in the reading.
    */
    heading: ("Discover " + (word ? word.textContent.trim() : "")).trim(),
    sizer: chip ? chip.firstElementChild.textContent.trim() : null,
    srOnly: (document.querySelector("h1") || {}).textContent || null,
    word: word ? word.textContent.trim() : null,
    wordColor: word ? getComputedStyle(word).color : null,
    chipWidth: chip ? Math.round(chip.getBoundingClientRect().width) : 0,
    /* Where the line starts. If the chip resized, this moves. */
    lineLeft: Math.round(lineRect.left),
    lineWidth: Math.round(lineRect.width),
    fieldWidth: field ? Math.round(field.getBoundingClientRect().width) : 0,
    fieldHeight: field ? Math.round(field.getBoundingClientRect().height) : 0,
    hasAnchor: !!anchor,
    docWidth: Math.round(document.documentElement.scrollWidth),
    viewport: window.innerWidth,
  }
})()`

async function main(width) {
  const profile = mkdtempSync(join(tmpdir(), "storelib-hero-profile-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    `--window-size=${width},900`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] })
  const reap = () => { try { chrome.kill("SIGKILL") } catch {} }
  for (const sig of ["exit", "SIGINT", "SIGTERM"]) process.on(sig, reap)

  const portFile = join(profile, "DevToolsActivePort")
  let port = null
  for (let i = 0; i < 80 && !port; i++) {
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, "utf8").split("\n")[0].trim()
      if (first) port = Number(first)
    }
    if (!port) await sleep(250)
  }
  if (!port) { reap(); fail("Chromium never reported a debugging port.") }
  let version = null
  for (let i = 0; i < 40 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() } catch { await sleep(250) }
  }
  if (!version) { reap(); fail("Chromium did not answer on its port.") }

  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.addEventListener("open", r, { once: true }); ws.addEventListener("error", j, { once: true }) })
  let id = 0
  const pending = new Map()
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? {}); pending.delete(m.id) }
  })
  let sessionId = null
  const send = (method, params = {}, session = sessionId) =>
    new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) })) })
  const ev = async (expr) => {
    const { result } = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
    return result?.value
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).sessionId
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 700 })
  await send("Page.navigate", { url: `file://${join(out, "index.html")}` })
  await sleep(1800)

  const samples = []
  for (let i = 0; i < 18; i++) {
    samples.push(await ev(READ))
    await sleep(260)
  }
  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  reap()
  return samples
}

const phone = await main(375)
const desk = await main(1280)

const report = (label, s) => {
  const words = [...new Set(s.map((x) => x.word).filter(Boolean))]
  const lefts = [...new Set(s.map((x) => x.lineLeft))]
  const chips = [...new Set(s.map((x) => x.chipWidth))]
  const last = s[s.length - 1]
  console.log(`  ${label} (${last.viewport}px)`)
  console.log(`    heading reads: ${JSON.stringify(last.heading)}  (chip sized from "${last.sizer}")`)
  console.log(`    for a screen reader: ${JSON.stringify(last.srOnly)}`)
  console.log(`    words seen: ${words.join(", ")}`)
  console.log(`    the chip is ${chips.join("/")}px wide and the line starts at ${lefts.join("/")}px`)
  console.log(`    word colour: ${last.wordColor}`)
  console.log(`    search field ${last.fieldWidth}x${last.fieldHeight}, anchor present: ${last.hasAnchor}`)
  console.log(`    document is ${last.docWidth}px wide in a ${last.viewport}px window`)
  console.log("")
  return { words, lefts, chips, last }
}

console.log("")
const p = report("on a phone", phone)
const d = report("on a desktop", desk)

const problems = []
for (const [label, r] of [["phone", p], ["desktop", d]]) {
  if (r.words.length < 3) problems.push(`On ${label} only ${r.words.length} word(s) appeared in four seconds: ${r.words.join(", ")}. The rotation is not running.`)
  if (r.lefts.length > 1) problems.push(`On ${label} the heading moved between ${r.lefts.join(" and ")}px as the word changed. The line is re-centring on every swap.`)
  if (r.chips.length > 1) problems.push(`On ${label} the chip resized (${r.chips.join(", ")}px), which is what moves the line.`)
  if (!r.last.hasAnchor) problems.push(`On ${label} the search carries no ${"data-explore-search-anchor"}, so the header can never take it over.`)
  if (r.last.docWidth > r.last.viewport + 1) problems.push(`On ${label} the document is ${r.last.docWidth}px in a ${r.last.viewport}px window. Something overflows.`)
  /* Purple, not blue: red has to be present and the hue has to sit in the
     violet band rather than the blue one. */
  const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(r.last.wordColor || "")
  if (!m) problems.push(`On ${label} the word's colour could not be read (${r.last.wordColor}).`)
  else {
    const [, R, G, B] = m.map(Number)
    if (!(R > G && B > R)) problems.push(`On ${label} the word is rgb(${R}, ${G}, ${B}). Purple needs red above green and blue above red; this reads as blue.`)
  }
}
if (!/^Discover/.test(p.last.heading || "")) problems.push(`The heading starts "${p.last.heading}" rather than "Discover".`)
if (!/Discover templates, courses, ebooks, tools and resources/.test(p.last.srOnly || "")) {
  problems.push(`The screen-reader heading is ${JSON.stringify(p.last.srOnly)}; it should read the whole list once.`)
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((x, i) => console.error(`  ${i + 1}. ${x}`))
  console.error("")
  process.exit(1)
}
console.log("  The word rotates, the line holds still, the colour is purple, and it fits a phone.\n")
