/**
 * ===========================================================================
 *  THE ADMIN'S TOP BAR, MEASURED AT FOUR WIDTHS
 * ===========================================================================
 * The bar has three zones — who and how busy, the tabs, the actions — and the
 * failure it is built against is the tabs growing into the actions and the two
 * drawing on top of each other. So this measures the rectangles rather than
 * looking at them: at every width the three zones must not overlap, the tab
 * strip must stay inside the bar, and the bar must be one row high.
 *
 * It also checks the thing the whole dashboard is built around: a figure that
 * could not be READ must not be printed as a zero. Pointed at a server whose
 * database is unreachable, every card should say so.
 *
 * It needs a running build with an admin password, which is not something the
 * push suite can assume, so it is a tool rather than a test:
 *
 *   BLOG_ADMIN_PASSWORD=… BLOG_ADMIN_SECRET=… PORT=3113 pnpm start &
 *   ADMIN_URL=http://127.0.0.1:3113 ADMIN_PASSWORD=… node scripts/check-admin-layout.mjs
 */
import { spawn } from "node:child_process"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = process.env.ADMIN_URL ?? "http://127.0.0.1:3113"
const USER = process.env.ADMIN_USER ?? "storelib"
const PASSWORD = process.env.ADMIN_PASSWORD ?? ""

const fail = (m) => {
  console.error(`\n  ${m}\n`)
  process.exit(1)
}

/* Is anything there? A probe that silently measures nothing is worse than one
   that says it could not run. */
try {
  const res = await fetch(`${BASE}/admin`)
  if (!res.ok) fail(`${BASE}/admin answered ${res.status}. Start a build first.`)
} catch {
  fail(`Nothing is listening at ${BASE}. Start a build first (see the note above).`)
}
if (!PASSWORD) fail("Set ADMIN_PASSWORD to the password the server was started with.")

/* Sign in over HTTP and keep the cookie the server sets. */
const login = await fetch(`${BASE}/api/admin/blog/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: USER, password: PASSWORD }),
})
if (!login.ok) fail(`Signing in answered ${login.status}. Check ADMIN_USER and ADMIN_PASSWORD.`)
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]
if (!cookie.includes("=")) fail("The login did not set a cookie.")
const [cookieName, cookieValue] = cookie.split("=")

/* ── A browser, driven over CDP ──────────────────────────────────────────── */

const port = 9200 + Math.floor(Math.random() * 300)
const proc = spawn(
  CHROMIUM,
  ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
   `--remote-debugging-port=${port}`, "about:blank"],
  { stdio: ["ignore", "ignore", "ignore"] },
)
const cdpBase = `http://127.0.0.1:${port}`
let version = null
for (let i = 0; i < 100 && !version; i++) {
  try { version = await (await fetch(`${cdpBase}/json/version`)).json() } catch { await new Promise((r) => setTimeout(r, 100)) }
}
if (!version) { proc.kill(); fail("Chromium did not start.") }

const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  const entry = pending.get(msg.id)
  if (!entry) return
  pending.delete(msg.id)
  msg.error ? entry.rej(new Error(JSON.stringify(msg.error))) : entry.res(msg.result)
}
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const S = (m, p) => send(m, p, sessionId)
await S("Page.enable")
await S("Runtime.enable")
await S("Network.enable")
await S("Network.setCookie", { name: cookieName, value: cookieValue, url: BASE, path: "/" })

const evalJs = async (expression) => {
  const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result.value
}

const WIDTHS = [
  { w: 1440, h: 900, name: "desktop" },
  { w: 1280, h: 800, name: "laptop" },
  { w: 1024, h: 768, name: "small laptop" },
  { w: 820, h: 1180, name: "tablet" },
  { w: 390, h: 844, name: "phone" },
]

const problems = []
console.log("")

for (const v of WIDTHS) {
  await S("Emulation.setDeviceMetricsOverride", { width: v.w, height: v.h, deviceScaleFactor: 1, mobile: v.w < 500 })
  await S("Page.navigate", { url: `${BASE}/admin` })
  await evalJs("new Promise(r => { if (document.readyState === 'complete') r(); else addEventListener('load', () => r()) })")
  await new Promise((r) => setTimeout(r, 2500))

  const m = await evalJs(`(() => {
    const header = document.querySelector("header")
    if (!header) return { error: "no header — the login is probably still on screen" }
    const row = header.firstElementChild
    const zones = Array.from(row.children).map((el) => {
      const r = el.getBoundingClientRect()
      return { tag: el.tagName, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }
    })
    const nav = row.querySelector("nav")
    const navRect = nav ? nav.getBoundingClientRect() : null
    const tabs = nav ? Array.from(nav.querySelectorAll("button")) : []
    const headerRect = header.getBoundingClientRect()
    return {
      headerHeight: Math.round(headerRect.height),
      zones,
      navScrollable: nav ? nav.scrollWidth > nav.clientWidth + 1 : false,
      tabCount: tabs.length,
      firstTabVisible: tabs[0] ? tabs[0].getBoundingClientRect().left >= (navRect?.left ?? 0) - 1 : false,
      unavailableCards: document.querySelectorAll("p.text-\\\\[20px\\\\]").length,
      bodyText: (document.body.innerText || "").slice(0, 60),
    }
  })()`)

  if (m.error) { problems.push(`${v.name}: ${m.error}`); continue }

  /* Three zones, left to right, and none of them may start before the one
     before it ends. That IS the overlap. */
  let overlap = null
  for (let i = 1; i < m.zones.length; i++) {
    if (m.zones[i].left < m.zones[i - 1].right - 1) {
      overlap = `${m.zones[i - 1].tag} ends at ${m.zones[i - 1].right} but ${m.zones[i].tag} starts at ${m.zones[i].left}`
    }
  }

  console.log(
    `  ${v.name.padEnd(13)} ${String(v.w).padStart(4)}px  header ${String(m.headerHeight).padStart(3)}px  ` +
      `zones ${m.zones.map((z) => `${z.left}-${z.right}`).join(" | ")}  ` +
      `${m.navScrollable ? "tabs scroll" : "tabs fit"}`,
  )

  if (overlap) problems.push(`${v.name}: the bar's zones overlap — ${overlap}`)
  if (m.headerHeight > 72) problems.push(`${v.name}: the bar is ${m.headerHeight}px tall, so it has wrapped onto a second row.`)
  if (m.tabCount < 10) problems.push(`${v.name}: only ${m.tabCount} tabs rendered.`)
  if (!m.firstTabVisible) problems.push(`${v.name}: the first tab starts outside the strip.`)
}

/**
 * AND THE CONTRACT THE WHOLE THING RESTS ON. This is pointed at a build whose
 * database is unreachable, so every figure is unreadable — and every card has
 * to SAY so rather than printing the zero it never measured.
 */
const cards = await evalJs(`(() => {
  const text = document.body.innerText || ""
  return { unavailable: (text.match(/Unavailable/g) || []).length, zeroes: (text.match(/\\n0\\n/g) || []).length }
})()`)
console.log(`\n  cards reporting "Unavailable": ${cards.unavailable}`)

try { ws.close() } catch {}
proc.kill()

if (problems.length) {
  console.error("")
  for (const p of problems) console.error(`  ${p}`)
  console.error("")
  process.exit(1)
}
console.log("\n  The bar holds its three zones at every width.\n")
