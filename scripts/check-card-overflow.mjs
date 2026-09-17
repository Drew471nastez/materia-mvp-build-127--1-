/**
 * ===========================================================================
 *  A LONG CATEGORY MAY NOT SQUEEZE THE TITLE TO ONE LETTER
 * ===========================================================================
 * Reported as two bugs and it is one:
 *
 *   "The product cards are shifted layouts."
 *   "The footer is intergalactic with the product listing."
 *
 * The title could shrink and the category badge could not. On a phone, a card
 * about 200px wide with a category called "Lightroom Presets" left the title
 * roughly one character of room, and `break-words` did what it was told: it
 * broke after every letter. One letter per line, fifty lines, a card two
 * thousand pixels tall whose text overflowed the card and painted over
 * whatever was below it — which is the footer.
 *
 * So this renders the exact pair from the screenshot at phone width and
 * measures three things: how tall the card is, whether its text stays inside
 * it, and whether anything reaches the block that follows the grid.
 *
 *   pnpm build && node scripts/check-card-overflow.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
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

const out = mkdtempSync(join(tmpdir(), "storelib-card-overflow-"))
/*
  ProductCard prefetches on intent, so it calls useRouter and throws
  "invariant expected app router to be mounted" outside a Next tree. The same
  stubs every other probe in here uses: the component under test is real, the
  framework around it is not.
*/
/* Under the project root, not in /tmp: esbuild resolves `react` from the
   nearest node_modules, and a stub in the system temp directory has none. */
const stubs = join(root, ".card-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/explore"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, ...rest }) { const { fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...ok } = rest; return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...ok }) }
`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-card-overflow.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/image=${join(stubs, "image.jsx")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0;background:#f5f5f5}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const READ = `(() => {
  const cards = [...document.querySelectorAll("#grid > *")]
  const after = document.getElementById("after")
  const afterTop = after.getBoundingClientRect().top
  return {
    viewport: window.innerWidth,
    cards: cards.map((c) => {
      const r = c.getBoundingClientRect()
      const h3 = c.querySelector("h3")
      /* The CATEGORY badge, which is the one sharing the row with the title.
         Selecting on .capitalize alone found the discount flag over the
         picture instead, and reported "100% OFF" as the thing squeezing the
         title. */
      const badge = h3 && h3.parentElement ? h3.parentElement.lastElementChild : null
      const t = h3 ? h3.getBoundingClientRect() : null
      const b = badge ? badge.getBoundingClientRect() : null
      return {
        height: Math.round(r.height),
        width: Math.round(r.width),
        title: h3 ? h3.textContent.slice(0, 30) : null,
        titleWidth: t ? Math.round(t.width) : 0,
        titleHeight: t ? Math.round(t.height) : 0,
        badgeText: badge ? badge.textContent.trim() : null,
        badgeWidth: b ? Math.round(b.width) : 0,
        /* Does the title's box reach past the bottom of the card. */
        overflowsBy: t ? Math.round(Math.max(0, t.bottom - r.bottom)) : 0,
        /* And does anything in the card reach the block after the grid. */
        reachesAfter: t ? t.bottom > afterTop : false,
      }
    }),
    afterTop: Math.round(afterTop),
  }
})()`

async function main(width) {
  const profile = mkdtempSync(join(tmpdir(), "storelib-card-profile-"))
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
  const thrown = []
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? {}); pending.delete(m.id); return }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params?.exceptionDetails
      thrown.push(String(d?.exception?.description || d?.text || "exception").split("\n").slice(0, 3).join(" | "))
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
      thrown.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").split("\n").slice(0, 3).join(" | "))
    }
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
  await send("Page.enable"); await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 700 })
  await send("Page.navigate", { url: `file://${join(out, "index.html")}` })
  await sleep(2000)
  const r = await ev(READ)
  await send("Target.closeTarget", { targetId }, null)
  ws.close(); reap()
  if (!r) fail(`The probe page rendered nothing.\n  ${thrown.join("\n  ") || "no error was reported"}`)
  return r
}

const r = await main(390)
console.log(`\n  two cards side by side in a ${r.viewport}px window\n`)
for (const c of r.cards) {
  console.log(`    "${c.title}…"`)
  console.log(`      card ${c.width}x${c.height}   title box ${c.titleWidth}x${c.titleHeight}   badge "${c.badgeText}" ${c.badgeWidth}px`)
  console.log(`      title overflows the card by ${c.overflowsBy}px, reaches what follows: ${c.reachesAfter}`)
}
console.log("")

const problems = []
const [a, b] = r.cards
for (const c of r.cards) {
  if (c.overflowsBy > 0) problems.push(`"${c.title}…" overflows its own card by ${c.overflowsBy}px. That is what paints over the footer.`)
  if (c.reachesAfter) problems.push(`"${c.title}…" reaches the block after the grid.`)
  /* A title squeezed to one character is the shape of the bug. At 17px, a
     column narrower than about 40px cannot hold two characters. */
  if (c.titleWidth < 60) problems.push(`"${c.title}…" has a ${c.titleWidth}px column to render in. The badge has taken the row and the title is breaking after every letter.`)
  if (c.badgeWidth > c.width * 0.45) problems.push(`The badge "${c.badgeText}" is ${c.badgeWidth}px of a ${c.width}px card. It should be capped.`)
}
if (a && b && Math.abs(a.height - b.height) > a.height * 0.6) {
  problems.push(`The two cards are ${a.height}px and ${b.height}px. One of them is running away with the row.`)
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  Both cards stay inside themselves, and the title keeps the row.\n")
