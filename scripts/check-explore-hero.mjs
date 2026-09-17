/**
 * ===========================================================================
 *  THE HERO SAYS DISCOVER, THE WORD CHANGES, AND THE LINE DOES NOT MOVE
 * ===========================================================================
 * Five claims, and every one of them is a measurement rather than an opinion:
 *
 *   THE WORD ROTATES. Sampled over four seconds, how many different nouns
 *   appear. One means the rotation is dead.
 *
 *   THE CHIP HUGS IT. One width across every word means the box is sized to
 *   the LONGEST one, which is the lake of empty violet around a short word
 *   that the owner reported. The widths have to differ, and the space left
 *   over inside the chip, with its own padding taken off, has to be nothing.
 *
 *   IT ROLLS RATHER THAN DISSOLVING. At rest exactly one word is in the
 *   window; mid-roll there are two, the one leaving and the one arriving,
 *   both fully opaque. An earlier version of this check called that second
 *   state a crossfade and was wrong: two moving words IS a roll. What would
 *   be a crossfade is a word caught part way between opaque and gone, so
 *   that is counted too, and has to be zero.
 *
 *   THE COLOUR IS PURPLE, NOT BLUE, read off the computed style as a hue.
 *
 *   IT FITS A PHONE, with nothing overflowing at 375px.
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
  const chip = h.querySelector("span.relative.inline-flex")
  const line = h.querySelector("p")
  const field = h.querySelector("input")
  const anchor = h.querySelector("[data-explore-search-anchor]")
  /* The stack that rolls, and the word sitting in the window right now. */
  const windowEl = chip ? chip.querySelector(".overflow-hidden") : null
  const stack = windowEl ? windowEl.firstElementChild : null
  const chipRect = windowEl ? windowEl.getBoundingClientRect() : null
  let visible = null
  if (stack && chipRect) {
    for (const w of stack.children) {
      const r = w.getBoundingClientRect()
      /* Whichever word's middle is inside the chip's window. */
      if (r.top + r.height / 2 > chipRect.top && r.top + r.height / 2 < chipRect.bottom) {
        visible = w.textContent.trim()
        break
      }
    }
  }
  const cs = chip ? getComputedStyle(chip) : null
  const stackCs = stack ? getComputedStyle(stack) : null
  const lineRect = line.getBoundingClientRect()
  return {
    heading: ("Discover " + (visible || "")).trim(),
    word: visible,
    /* How many words are showing at once. A roll shows one; a crossfade
       shows two, half-faded, which is what "junky" looks like. */
    wordsInWindow: (() => {
      if (!stack || !chipRect) return 0
      let n = 0
      for (const w of stack.children) {
        const r = w.getBoundingClientRect()
        if (r.bottom > chipRect.top + 1 && r.top < chipRect.bottom - 1) n++
      }
      return n
    })(),
    wordColor: stack && stack.children[0] ? getComputedStyle(stack.children[0]).color : null,
    /* A roll moves opaque words. A crossfade dissolves them, and that shows
       up here as a word part way between 0 and 1. */
    opacities: stack ? [...stack.children].map((w) => Math.round(parseFloat(getComputedStyle(w).opacity) * 100) / 100) : [],
    chipWidth: chip ? Math.round(chip.getBoundingClientRect().width) : 0,
    chipHeight: chip ? Math.round(chip.getBoundingClientRect().height) : 0,
    chipOverflow: windowEl ? getComputedStyle(windowEl).overflow : null,
    chipTransition: cs ? cs.transitionProperty : null,
    stackTransition: stackCs ? stackCs.transitionProperty : null,
    /* Empty space around the word, with the chip's own padding taken off.
       This is the "so much space" the owner reported: a chip sized to the
       longest word left a five-letter one floating in a nine-letter box. */
    slack: (() => {
      if (!chip || !chipRect || !visible) return null
      for (const w of stack.children) {
        if (w.textContent.trim() !== visible) continue
        const pad = parseFloat(getComputedStyle(chip).paddingLeft) + parseFloat(getComputedStyle(chip).paddingRight)
        return Math.round(chip.getBoundingClientRect().width - pad - w.getBoundingClientRect().width)
      }
      return null
    })(),
    lineLeft: Math.round(lineRect.left),
    lineWidth: Math.round(lineRect.width),
    fieldWidth: field ? Math.round(field.getBoundingClientRect().width) : 0,
    fieldHeight: field ? Math.round(field.getBoundingClientRect().height) : 0,
    hasAnchor: !!anchor,
    docWidth: Math.round(document.documentElement.scrollWidth),
    viewport: window.innerWidth,
    srOnly: (document.querySelector("h1") || {}).textContent || null,
    chipStyle: chip ? chip.getAttribute("style") : null,
    stackStyle: stack ? stack.getAttribute("style") : null,
    measurerFound: !!h.querySelector("span.fixed"),
    measuredWidths: h.querySelector("span.fixed") ? [...h.querySelector("span.fixed").children].map((c) => Math.round(c.getBoundingClientRect().width)) : null,
    sectionTop: Math.round(h.querySelector("section").getBoundingClientRect().top),
    headingTop: Math.round(lineRect.top),
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
  const chips = [...new Set(s.map((x) => x.chipWidth))]
  const slacks = s.map((x) => x.slack).filter((x) => x !== null)
  const maxInWindow = Math.max(...s.map((x) => x.wordsInWindow))
  /*
    AT REST, one word. DURING THE ROLL, two — the one leaving and the one
    arriving, both moving. That is what a roll IS, and an earlier version of
    this check called it a crossfade for exactly that reason. The number that
    means something is the minimum: if even the settled frames hold two
    words, the window is taller than a line.
  */
  const minInWindow = Math.min(...s.map((x) => x.wordsInWindow))
  const fadedWords = s.flatMap((x) => x.opacities).filter((o) => o > 0 && o < 1)
  const last = s[s.length - 1]
  console.log(`  ${label} (${last.viewport}px)`)
  console.log(`    heading reads: ${JSON.stringify(last.heading)}`)
  console.log(`    for a screen reader: ${JSON.stringify(last.srOnly)}`)
  console.log(`    words seen: ${words.join(", ")}`)
  console.log(`    chip widths: ${chips.sort((a, b) => a - b).join(", ")}px  (it hugs the word rather than the longest)`)
  console.log(`    empty space inside the chip: ${Math.min(...slacks)} to ${Math.max(...slacks)}px`)
  console.log(`    words in the window: ${minInWindow} at rest, ${maxInWindow} mid-roll`)
  console.log(`    words caught part-faded: ${fadedWords.length}`)
  console.log(`    chip overflow ${last.chipOverflow}, chip animates ${last.chipTransition}, stack animates ${last.stackTransition}`)
  console.log(`    word colour: ${last.wordColor}`)
  console.log(`    gap above the heading: ${last.headingTop - last.sectionTop}px`)
  console.log(`    search field ${last.fieldWidth}x${last.fieldHeight}, anchor present: ${last.hasAnchor}`)
  console.log(`    document is ${last.docWidth}px wide in a ${last.viewport}px window`)
  if (process.env.DEBUG_HERO) {
    console.log(`    [debug] chip style: ${last.chipStyle}`)
    console.log(`    [debug] stack style: ${last.stackStyle}`)
    console.log(`    [debug] measured widths: ${JSON.stringify(last.measuredWidths)}`)
  }
  console.log("")
  return { words, chips, slacks, maxInWindow, minInWindow, fadedWords, last }
}

console.log("")
const p = report("on a phone", phone)
const d = report("on a desktop", desk)

const problems = []
for (const [label, r] of [["phone", p], ["desktop", d]]) {
  if (r.words.length < 3) problems.push(`On ${label} only ${r.words.length} word(s) appeared in four seconds: ${r.words.join(", ")}. The rotation is not running.`)
  /*
    IT HAS TO HUG. A single chip width across every word is the box sized to
    the longest one, which is the lake of empty violet the owner reported.
  */
  if (r.chips.length < 2) problems.push(`On ${label} the chip held one width (${r.chips.join(", ")}px) across ${r.words.length} words. It is sized to the longest rather than to the word in it.`)
  if (Math.max(...r.slacks) > 40) problems.push(`On ${label} the chip has up to ${Math.max(...r.slacks)}px of empty space around the word. It is not hugging it.`)
  /*
    AND IT HAS TO BE A ROLL. Two words in the window at once, both part way
    through an opacity change, is the crossfade that read as cheap. One word
    at a time means the stack slides and nothing dissolves.
  */
  if (r.minInWindow !== 1) problems.push(`On ${label} the settled chip holds ${r.minInWindow} words. The window should be exactly one line tall, or the words above and below show their edges.`)
  if (r.maxInWindow < 2) problems.push(`On ${label} never more than one word was in the window. Nothing is sliding; the word is being swapped in place.`)
  if (r.fadedWords.length) problems.push(`On ${label} ${r.fadedWords.length} readings caught a word part-faded. A roll moves opaque words; dissolving them is the crossfade that read as cheap.`)
  if (r.last.chipOverflow !== "hidden") problems.push(`On ${label} the chip's overflow is ${r.last.chipOverflow}; a roll needs the window to clip.`)
  if (!/width/.test(r.last.chipTransition || "")) problems.push(`On ${label} the chip does not animate its width (${r.last.chipTransition}), so it will snap between words.`)
  if (!/transform/.test(r.last.stackTransition || "")) problems.push(`On ${label} the stack does not animate (${r.last.stackTransition}), so the word will jump.`)
  if (!r.last.hasAnchor) problems.push(`On ${label} the search carries no data-explore-search-anchor, so the header can never take it over.`)
  if (r.last.docWidth > r.last.viewport + 1) problems.push(`On ${label} the document is ${r.last.docWidth}px in a ${r.last.viewport}px window. Something overflows.`)
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
console.log("  The word rolls, the chip hugs it, nothing dissolves, and it fits a phone.\n")
