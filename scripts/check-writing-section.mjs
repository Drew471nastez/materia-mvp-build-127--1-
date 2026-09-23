#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE SPOT ASK AI IS WRITING A SECTION INTO, MEASURED
 * ===========================================================================
 * components/website-builder/editor/writing-section.tsx, with the rules
 * app/globals.css ships for it, on two pages: a light site at the width of
 * the desktop canvas and a dark site at the width of a phone. What a
 * screenshot answers badly:
 *
 *   no words          nothing is drawn but code; the status line is for a
 *                     screen reader only
 *   it is writing     the lane holds more code a moment later than it did,
 *                     at about the rate it claims, and a caret sits at the end
 *   it fades          the lane is masked from clear at the top to solid at the
 *                     bottom, so old lines leave and new ones arrive
 *   it is the page's  its colours are mixed from the site's own, so a dark
 *                     site gets a dark lane
 *   it fits           nothing spills sideways, on a phone or a desktop
 *   it can be still   with reduced motion asked for, nothing moves and the
 *                     lane is drawn once
 *
 * Driven in real time over the DevTools protocol, because the typing runs on
 * animation frames and a virtual clock starves those. Leaves
 * .probe-writing-section.png behind to look at.
 *
 *   node scripts/check-writing-section.mjs
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

/* The product's own rules, read out of the stylesheet rather than copied. */
const globals = readFileSync(join(root, "app/globals.css"), "utf8")
const ownBlock = globals.slice(globals.indexOf("/* ===========================================================================\n   A SECTION THE AI IS STILL WRITING"))
const nextBlock = ownBlock.indexOf("/* ====", 10)
const css = [
  globals.match(/@property --wb-ai-angle \{[^}]*\}/)?.[0],
  globals.match(/@keyframes wb-ai-shimmer \{[^}]*\}\s*\}/)?.[0],
  nextBlock === -1 ? ownBlock : ownBlock.slice(0, nextBlock),
]
if (css.some((c) => !c)) fail("Could not find the placeholder's rules in app/globals.css.")

const work = join(root, ".writing-probe")
mkdirSync(work, { recursive: true })

try {
  writeFileSync(join(work, "entry.tsx"), `
import { createRoot } from "react-dom/client"
import { WritingSection, TYPING_RATE } from "@/components/website-builder/editor/writing-section"
;(window as any).TYPING_RATE = TYPING_RATE
for (const el of document.querySelectorAll("[data-slot]")) {
  createRoot(el).render(<WritingSection prompt="A pricing table with three plans" />)
}
`)
  execFileSync("npx", [
    "esbuild", join(work, "entry.tsx"), "--bundle", "--platform=browser", "--format=iife",
    `--outfile=${join(work, "probe.js")}`, `--alias:@=${root}`, "--jsx=automatic", "--log-level=error",
    '--define:process.env.NODE_ENV="production"',
  ], { cwd: root, stdio: "inherit" })

  const page = join(work, "writing.html")
  writeFileSync(page, `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; background: #eef1f5; font-family: Inter, system-ui, sans-serif; display: flex; gap: 24px; padding: 24px; align-items: flex-start; }
  .site { border-radius: 20px; overflow: hidden; background: var(--theme-bg); color: var(--theme-text); }
  .site[data-tone="light"] { width: 1100px; --theme-text: #0f172a; --theme-bg: #ffffff; }
  .site[data-tone="dark"] { width: 390px; --theme-text: #f5f5f4; --theme-bg: #111111; }
  .neighbour { padding: 40px 24px; font-size: 20px; font-weight: 700; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  ${css.join("\n")}
</style>
<div class="site" data-tone="light" id="light"><div class="neighbour">Hero</div><div data-slot></div><div class="neighbour">FAQ</div></div>
<div class="site" data-tone="dark" id="dark"><div class="neighbour">Hero</div><div data-slot></div><div class="neighbour">FAQ</div></div>
<pre id="out" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">pending</pre>
<script src="./probe.js"></script>
<script>
function lum(c) {
  var n = (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
  if (c.indexOf("color(srgb") === 0) n = n.map(function (x) { return x * 255 });
  var f = function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) };
  return 0.2126 * f(n[0]) + 0.7152 * f(n[1]) + 0.0722 * f(n[2]);
}
function look(id) {
  var box = document.querySelector("#" + id + " [data-writing-section]");
  var code = box.querySelector(".wb-code");
  var visibleText = Array.prototype.filter.call(box.querySelectorAll("p, span, h1, h2, h3, div"), function (el) {
    return !el.closest(".wb-code") && !el.classList.contains("sr-only") && el.childNodes.length && Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim() });
  }).map(function (el) { return el.textContent.trim() });
  var cs = getComputedStyle(code);
  var r = box.getBoundingClientRect(), s = document.getElementById(id).getBoundingClientRect();
  return {
    chars: code.textContent.length,
    typed: Number(code.dataset.typed || 0),
    codeText: code.textContent,
    lines: code.querySelectorAll(".wb-code-line").length,
    caret: !!code.querySelector(".wb-code-caret"),
    caretAnim: code.querySelector(".wb-code-caret") ? getComputedStyle(code.querySelector(".wb-code-caret")).animationName : "none",
    mask: cs.webkitMaskImage || cs.maskImage,
    visibleText: visibleText,
    status: (box.querySelector("[role=status]") || {}).textContent || "",
    inside: r.left >= s.left && r.right <= s.right + 0.5,
    overflowX: box.scrollWidth > box.clientWidth + 1,
    bg: getComputedStyle(box).backgroundColor,
    siteBg: getComputedStyle(document.getElementById(id)).backgroundColor,
    ring: getComputedStyle(box, "::before").animationName,
    sweep: getComputedStyle(box.querySelector(".wb-writing-inner"), "::after").animationName,
    height: Math.round(r.height),
  };
}
var first = null;
setTimeout(function () {
  first = { light: look("light"), dark: look("dark"), at: performance.now() };
  setTimeout(function () {
    var second = { light: look("light"), dark: look("dark"), at: performance.now() };
    document.getElementById("out").textContent = JSON.stringify({ first: first, second: second, rate: window.TYPING_RATE, darkLum: lum(second.dark.bg) });
  }, 1000);
}, 700);
</script>`)

  writeFileSync(join(work, "drive.mjs"), `
import { spawn } from "node:child_process"
const [url, reduced, shot] = process.argv.slice(2)
const port = 9433 + (reduced === "1" ? 1 : 0)
const chrome = spawn(${JSON.stringify(CHROMIUM)}, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", \`--remote-debugging-port=\${port}\`, "about:blank"], { stdio: "ignore" })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 60 && !target; i++) {
  try { target = (await (await fetch(\`http://127.0.0.1:\${port}/json/list\`)).json()).find((t) => t.type === "page") } catch { await sleep(200) }
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener("open", r))
let id = 0; const pending = new Map()
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 760, deviceScaleFactor: 1, mobile: false })
if (reduced === "1") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
await send("Page.enable")
await send("Page.navigate", { url })
let out = null
for (let i = 0; i < 40 && !out; i++) {
  await sleep(300)
  const res = await send("Runtime.evaluate", { expression: "document.getElementById('out').textContent", returnByValue: true })
  const t = res.result?.result?.value
  if (typeof t === "string" && t !== "pending") out = t
}
if (shot) {
  const png = await send("Page.captureScreenshot", { format: "png" })
  ;(await import("node:fs")).writeFileSync(shot, Buffer.from(png.result.data, "base64"))
}
console.log(out ?? JSON.stringify({ error: "no measurement" }))
ws.close(); chrome.kill(); process.exit(0)
`)
  const drive = (reduced, shot = "") =>
    JSON.parse(execFileSync(process.execPath, [join(work, "drive.mjs"), `file://${page}`, reduced, shot], { encoding: "utf8", timeout: 90_000 }))

  const moving = drive("0", join(root, ".probe-writing-section.png"))
  const still = drive("1")
  if (moving.error || still.error) fail(moving.error || still.error)

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${JSON.stringify(got)}`}`)
    if (!ok) broken++
  }

  for (const tone of ["light", "dark"]) {
    const a = moving.first[tone], b = moving.second[tone]
    const perSecond = Math.round((b.typed - a.typed) / ((moving.second.at - moving.first.at) / 1000))
    console.log(`\n${tone === "light" ? "Light site, desktop canvas" : "Dark site, phone"}: ${b.height}px tall, ${b.lines} lines, about ${perSecond} characters a second\n`)
    expect(b.visibleText.length === 0, "no words are drawn, only code", b.visibleText)
    expect(!/wb-code-/.test(b.codeText), "and the colouring never shows up as text in the lane", b.codeText.slice(0, 120))
    expect(/Writing a section/.test(b.status), "a screen reader still hears what is happening", b.status)
    expect(b.codeText !== a.codeText, "it is writing: the lane changes between two looks", [a.chars, b.chars])
    expect(perSecond >= 150 && perSecond <= 260, "at the speed it claims, about 200 characters a second", perSecond)
    expect(b.lines >= 13, "and the lane is full from the start, not filling from empty", b.lines)
    expect(b.caret && b.caretAnim === "wb-code-caret", "with a caret at the end of the line being written", b.caretAnim)
    expect(/linear-gradient\((to bottom, )?(transparent|rgba\(0, 0, 0, 0\)) 0%, [^)]*\) 62%\)|rgb\(0, 0, 0\) 62%/.test(b.mask), "faded from clear at the top to solid at the bottom", b.mask)
    expect(b.ring === "wb-ai-shimmer" && b.sweep === "wb-lane-sweep", "the Ask AI ring runs round it and light crosses the lane", [b.ring, b.sweep])
    expect(b.inside && !b.overflowX, "nothing spills out sideways", [b.inside, b.overflowX])
    expect(b.height >= 280 && b.height <= 560, "section sized", b.height)
  }
  expect(moving.darkLum < 0.1, "a dark site gets a dark lane", moving.darkLum)

  console.log("\nWith reduced motion asked for\n")
  for (const tone of ["light", "dark"]) {
    const a = still.first[tone], b = still.second[tone]
    expect(a.chars === b.chars && b.lines > 0, "the lane is drawn once and does not change", [a.chars, b.chars])
    expect(!b.caret && b.sweep === "none" && b.ring === "none", "and nothing moves", [b.caret, b.sweep, b.ring])
  }

  console.log("\nScreenshot: .probe-writing-section.png")
  if (broken) fail(`${broken} check(s) failed.`)
  console.log("\nall checks passed\n")
} finally {
  rmSync(work, { recursive: true, force: true })
}
