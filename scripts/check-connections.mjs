/**
 * ===========================================================================
 *  CONNECTIONS, AS A CREATOR WHO HAS NEVER HEARD OF MCP WOULD USE IT
 * ===========================================================================
 * "Plain steps, fewer words, clear status per connection (Claude, Codex,
 * GitHub), one primary action each."
 *
 * The real Website Settings screen on Connections (scripts/render-connections.tsx),
 * with only the network answered, at 1440 × 900 and at 390 × 844, and:
 *
 *   the list      Claude Code, Codex and GitHub, each with its status in
 *                 words and exactly one button, and nothing wider than the
 *                 screen
 *   Connect       on Claude Code: the key is made as the line opens (one
 *                 request, and no second one when it is closed and opened
 *                 again), the steps have it in the line to paste, and
 *   noticing      when the tool first uses the key the line says Connected
 *                 by itself, with no reload. Timed from the press.
 *   one at a time opening GitHub closes Claude Code
 *   Manage        a linked repository, and a tool with keys
 *   opening       frames and long tasks while a line opens, CPU at a quarter
 *
 * SHOTS=<dir> keeps a screenshot of each state.
 *
 *   node scripts/check-connections.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const SHOTS = process.env.SHOTS ?? null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail !== undefined ? `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
}
const note = (line) => console.log(`  --    ${line}`)

/* ── The page, bundled with the network and the upload client stubbed ───── */
const out = mkdtempSync(join(tmpdir(), "storelib-connections-"))
const stub = join(out, "supabase-client.js")
writeFileSync(
  stub,
  `export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }\n`,
)
execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-connections.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    `--alias:@/lib/supabase/client=${stub}`,
    `--alias:@=${root}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    "--loader:.css=empty",
  ],
  { cwd: root, stdio: "inherit" },
)
const js = readFileSync(join(out, "probe.js"))
const css = await appCss(root)

/* Inter, served from here: a page on http:// may not read file:// fonts. */
const fonts = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fonts.set(name, path)
  return `url(/font/${name})`
})

const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const GH_NONE = { configured: true, ready: true, link: null, repos: [], accounts: [], events: [] }
const GH_LINKED = {
  configured: true,
  ready: true,
  link: {
    account: "maya-studio", repo: "maya-studio/storefront", branch: "main", folder: "", lastSyncedAt: hoursAgo(0.2),
    lastSyncedSha: "9f8e7d6", lastError: null, pushOnSave: true, pullOnPush: true,
  },
  repos: [],
  accounts: [],
  events: [
    { id: 3, direction: "from_github", ok: true, summary: "Pricing section, from a push to main", commit_sha: "9f8e7d6c5b4a", created_at: hoursAgo(0.2) },
    { id: 2, direction: "to_github", ok: true, summary: "3 sections saved in the builder", commit_sha: "1a2b3c4d5e6f", created_at: hoursAgo(5) },
    { id: 1, direction: "from_github", ok: false, summary: "faq.storelib did not compile", commit_sha: null, created_at: hoursAgo(26) },
  ],
}
const STATES = {
  none: { agents: [], github: GH_NONE, useAfterMs: 2500 },
  mixed: {
    agents: [
      { id: "a2", name: "Codex", prefix: "slb_7HwPz0", created_at: hoursAgo(1), last_used_at: null },
      { id: "a1", name: "Claude Code", prefix: "slb_c9Kd2Q", created_at: hoursAgo(72), last_used_at: hoursAgo(2) },
    ],
    github: GH_LINKED,
  },
}

const page = (state) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;background:#0f0f0f}</style></head>
<body><div id="app"></div><script>window.PROBE=${JSON.stringify(STATES[state])}</script><script src="/probe.js"></script></body></html>`

const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (req.url.startsWith("/font/")) {
    const path = fonts.get(req.url.slice(6))
    if (path && existsSync(path)) {
      res.writeHead(200, { "content-type": "font/woff2" })
      return res.end(readFileSync(path))
    }
    res.writeHead(404)
    return res.end()
  }
  const state = new URL(req.url, "http://x").searchParams.get("state") ?? "none"
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(state))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

/** Every line: its id, what its status says, its header's buttons, whether it is open. */
const rows = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll("section[aria-label=Connections] [data-connection]")].map((r) => ({
      id: r.getAttribute("data-connection"),
      status: (r.querySelector("[data-connection-status]")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      buttons: [...r.firstElementChild.querySelectorAll("button, a")].map((b) => b.textContent.trim()),
      open: r.hasAttribute("data-open"),
    })),
  )
const press = (p, id) => p.evaluate((id) => document.querySelector(`[data-connection="${id}"] > div:first-child button`)?.click(), id)
const posts = (p) => p.evaluate(() => window.probeCalls.filter((c) => c.startsWith("POST") && c.includes("agent-connections")).length)
const overflow = (p) =>
  p.evaluate(() => {
    const main = document.querySelector("main[data-settings-page]")
    return {
      page: document.documentElement.scrollWidth - innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    }
  })
const shot = async (p, name) => {
  if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) })
}

async function run(label, vp) {
  console.log(`\n══ ${label}, ${vp.width} × ${vp.height} ══\n`)
  const tag = vp.width < 600 ? "390" : "1440"
  const p = await browser.newPage()
  await p.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.width < 600 ? 2 : 1, isMobile: vp.width < 600, hasTouch: vp.width < 600 })
  const cdp = await p.createCDPSession()

  /* ── Nothing connected ─────────────────────────────────────────────── */
  await p.goto(`${origin}/?state=none`)
  await p.waitForSelector("[data-connection='github'] [data-connection-status]")
  await sleep(400)
  await shot(p, `connections-none-${tag}`)
  const first = await rows(p)
  check(
    "three lines: Claude Code, Codex, GitHub",
    first.map((r) => r.id).join(",") === "claude,codex,github",
    first.map((r) => r.id),
  )
  check("each says Not connected", first.every((r) => r.status === "Not connected"), first.map((r) => r.status))
  check("and has one button, Connect", first.every((r) => r.buttons.length === 1 && r.buttons[0] === "Connect"), first.map((r) => r.buttons))
  const wide = await overflow(p)
  check("nothing is wider than the screen", wide.page <= 0 && wide.main <= 0, wide)

  /* ── Connect Claude Code, at a quarter speed while it opens ─────────── */
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await p.evaluate(() => {
    window.__long = []
    window.__frames = []
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__long.push(Math.round(e.duration))
    }).observe({ type: "longtask", buffered: false })
    let last = performance.now()
    const until = last + 700
    const tick = (t) => {
      window.__frames.push(t - last)
      last = t
      if (t < until) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const pressedAt = Date.now()
  await press(p, "claude")
  await sleep(900)
  const opening = await p.evaluate(() => {
    const f = window.__frames.slice(1).sort((a, b) => a - b)
    return { median: Math.round(f[Math.floor(f.length / 2)] * 10) / 10, worst: Math.round(f[f.length - 1] * 10) / 10, long: window.__long }
  })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  note(`a line opening at a quarter speed: frames median ${opening.median}ms, worst ${opening.worst}ms; long tasks [${opening.long.join(",")}]`)
  check("no long task while a line opens, at a quarter speed", opening.long.every((d) => d < 100), opening.long)

  const steps = await p.evaluate(() => {
    const row = document.querySelector("[data-connection='claude']")
    return {
      open: row.hasAttribute("data-open"),
      steps: [...row.querySelectorAll("ol > li")].map((li) => li.querySelector("p")?.textContent.trim()),
      line: row.querySelector("pre")?.textContent ?? "",
      copy: !row.querySelector("pre + button")?.disabled,
    }
  })
  check("Connect opens the line on its steps", steps.open && steps.steps.length === 3, steps.steps)
  check("with the key already in the line to paste, and Copy on", /Bearer slb_Q7mX2p/.test(steps.line) && steps.copy, steps.line.slice(0, 60))
  check("made with one request", (await posts(p)) === 1, await posts(p))
  await shot(p, `connections-claude-steps-${tag}`)

  /* ── The tool starts on the creator's computer; the page notices ─────── */
  let connectedAt = null
  for (let i = 0; i < 40 && connectedAt === null; i++) {
    await sleep(250)
    const r = (await rows(p)).find((x) => x.id === "claude")
    if (/^Connected/.test(r.status)) connectedAt = Date.now()
  }
  check("the line says Connected by itself once the key is used", connectedAt !== null)
  if (connectedAt) note(`press to Connected: ${connectedAt - pressedAt}ms (the key was used 2500ms after it was made; looks are ${5000}ms apart)`)
  const said = await p.evaluate(() => document.querySelector("[data-connection='claude'] [role='status']")?.textContent ?? "")
  check("and says so under the steps", /Claude Code is connected/.test(said), said)
  await sleep(300)
  await shot(p, `connections-claude-connected-${tag}`)

  await press(p, "claude")
  await sleep(350)
  await press(p, "claude")
  await sleep(350)
  check("closing and opening again makes no second key", (await posts(p)) === 1, await posts(p))

  /* ── GitHub: one line open at a time ───────────────────────────────── */
  await press(p, "github")
  await sleep(700)
  const gh = await rows(p)
  check("opening GitHub closes Claude Code", gh.find((r) => r.id === "github").open && !gh.find((r) => r.id === "claude").open, gh.map((r) => `${r.id}:${r.open}`))
  const toGitHub = await p.evaluate(() => [...document.querySelectorAll("[data-connection='github'] a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]))
  check("whose first step is the button to GitHub", toGitHub.some(([t, h]) => t === "Continue to GitHub" && /\/api\/github\/connect\?installId=/.test(h)), toGitHub)
  await shot(p, `connections-github-steps-${tag}`)

  /* ── Connected things ──────────────────────────────────────────────── */
  await p.goto(`${origin}/?state=mixed`)
  await p.waitForSelector("[data-connection='github'] [data-connection-status]")
  await sleep(400)
  await shot(p, `connections-mixed-${tag}`)
  const mixed = await rows(p)
  const by = Object.fromEntries(mixed.map((r) => [r.id, r]))
  check("Claude Code: Connected, and when it was last used", /^Connected · used 2 hours ago$/.test(by.claude.status), by.claude.status)
  check("Codex: a key nobody has used yet", by.codex.status === "Not used yet", by.codex.status)
  check("GitHub: Connected, and to which repository", /^Connected · maya-studio\/storefront$/.test(by.github.status), by.github.status)
  check("each with one button, Manage", mixed.every((r) => r.buttons.length === 1 && r.buttons[0] === "Manage"), mixed.map((r) => r.buttons))

  await press(p, "github")
  await sleep(700)
  const manage = await p.evaluate(() => {
    const row = document.querySelector("[data-connection='github']")
    return {
      switches: [...row.querySelectorAll("[role='switch']")].map((s) => `${s.getAttribute("aria-label")}:${s.getAttribute("aria-checked")}`),
      buttons: [...row.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
      recent: row.querySelectorAll("li").length,
    }
  })
  check("GitHub's Manage: Pull, Push, both directions and what happened lately",
    manage.buttons.includes("Pull") && manage.buttons.includes("Push") && manage.switches.length === 2 && manage.recent === 3, manage)
  await shot(p, `connections-github-manage-${tag}`)

  await press(p, "codex")
  await sleep(700)
  const keys = await p.evaluate(() => [...document.querySelectorAll("[data-connection='codex'] li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()))
  check("Codex's Manage lists its key and how to replace it", keys.length === 1 && /Key slb_7HwPz0/.test(keys[0]), keys)
  await shot(p, `connections-codex-manage-${tag}`)
  const wide2 = await overflow(p)
  check("still nothing wider than the screen with a line open", wide2.page <= 0 && wide2.main <= 0, wide2)

  await p.close()
}

try {
  await run("A computer", { width: 1440, height: 900 })
  await run("A phone", { width: 390, height: 844 })
} finally {
  await browser.close()
  server.close()
}

if (SHOTS) console.log(`\nScreenshots in ${SHOTS}`)
console.log(failed ? `\n${failed} check${failed === 1 ? "" : "s"} failed.` : "\nAll checks passed.")
process.exit(failed ? 1 : 0)
