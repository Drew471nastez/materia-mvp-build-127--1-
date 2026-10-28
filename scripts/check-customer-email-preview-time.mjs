/**
 * ===========================================================================
 *  CUSTOMER EMAILS: FROM THE CLICK TO THE PREVIEW DRAWN, MEASURED
 * ===========================================================================
 * The real panel and editor in headless Chromium (1440x900), every
 * /api/store/emails read answered after DELAY ms (400 by default) and every
 * code chunk after the same, as a network would. For each email: the time
 * from the click on its row to its preview's text in the frame, three ways:
 *
 *   hover      the pointer rests on the row for 150 ms first, as a person's does
 *   straight   the click lands with no rest (a first tap)
 *   again      the same email opened a second time
 *
 * BEFORE=<dir> builds the panel and the frame from that directory's
 * customer-emails-panel.tsx and email-parts.tsx instead (an older version,
 * e.g. from `git show <rev>:path`), so the two can be compared.
 *
 *   node scripts/check-customer-email-preview-time.mjs
 *   BEFORE=/path/to/old node scripts/check-customer-email-preview-time.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const DELAY = Number(process.env.DELAY || 400)
const BEFORE = process.env.BEFORE || ""
const out = mkdtempSync(join(tmpdir(), "storelib-preview-time-"))
const ORIGIN = "https://storelib.test"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(out, "navigation.js"), `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export function redirect() {}
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
const previews = execFileSync("npx", ["tsx", "scripts/customer-email-preview-samples.ts"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
const alias = BEFORE ? [`--alias:@/components/app/settings/customer-emails-panel=${join(BEFORE, "customer-emails-panel.tsx")}`, `--alias:@/components/app/emails/email-parts=${join(BEFORE, "email-parts.tsx")}`] : []
execFileSync(
  "npx",
  ["esbuild", "scripts/render-customer-email-preview-time.tsx", ...alias, `--alias:next/navigation=${join(out, "navigation.js")}`, `--alias:next/link=${join(out, "link.jsx")}`, '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://x.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="x"', "--bundle", "--splitting", "--format=esm", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined", "--define:process.env.NEXT_PUBLIC_APP_URL=undefined", "--alias:@=.", `--outdir=${join(out, "js")}`, "--entry-names=main", "--chunk-names=chunk-[hash]", "--log-level=error"],
  { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
)
const chunks = readdirSync(join(out, "js"))
const css = await appCss(root)
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>window.process={env:{}};window.__delay=${DELAY};window.__previews=${previews.replace(/<\/script/gi, "<\\/script")}</script></head><body><div id="app"></div><script type="module" src="/js/main.js"></script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
async function open() {
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  p.on("pageerror", (e) => console.error("[page]", String(e).slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = new URL(r.url())
    if (u.origin === ORIGIN && u.pathname.startsWith("/js/")) {
      const name = u.pathname.slice(4)
      if (!chunks.includes(name)) return r.respond({ status: 404, body: "" })
      /* Every chunk but the page's own arrives after the network's delay, as a code split chunk does. */
      if (name !== "main.js") await sleep(DELAY)
      return r.respond({ status: 200, contentType: "text/javascript", body: readFileSync(join(out, "js", name)) })
    }
    if (u.origin === ORIGIN) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.protocol === "https:") return r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") })
    return r.continue()
  })
  await p.goto(`${ORIGIN}/app/settings?tab=emails`)
  await p.waitForSelector("[data-customer-email]", { timeout: 20000 })
  await sleep(DELAY * 2 + 200)
  return p
}

/* From the click on the row to the email's text in the frame, read every frame. */
async function timeOpen(p, id, how) {
  await p.evaluate((id) => {
    window.__done = null
    document.addEventListener(
      "click",
      () => {
        const t0 = performance.now()
        const tick = () => {
          const f = document.querySelector(`[data-email-sheet="${id}"] [data-email-frame]`)
          const n = f?.contentDocument?.body?.innerText?.length ?? 0
          if (n > 80) window.__done = Math.round(performance.now() - t0)
          else if (performance.now() - t0 < 10000) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { capture: true, once: true },
    )
  }, id)
  const sel = `[data-customer-email="${id}"]`
  if (how === "hover") {
    await p.hover(sel)
    await sleep(150)
  }
  await p.click(sel)
  await p.waitForFunction(() => window.__done !== null, { timeout: 12000 }).catch(() => {})
  const ms = await p.evaluate(() => window.__done)
  await p.keyboard.press("Escape")
  await p.waitForFunction(() => !document.querySelector("[data-email-sheet]"), { timeout: 4000 }).catch(() => {})
  await sleep(400)
  return ms
}

const IDS = ["receipt", "order_confirmation", "shipping_confirmation", "digital_refund"]
const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}
const results = { hover: [], straight: [], again: [] }
for (const id of IDS) {
  const exists = await (async () => {
    const p = await open()
    const ok = !!(await p.$(`[data-customer-email="${id}"]`))
    if (ok) {
      results.hover.push(await timeOpen(p, id, "hover"))
      results.again.push(await timeOpen(p, id, "straight"))
    }
    await p.close()
    return ok
  })()
  if (!exists) continue
  const p = await open()
  results.straight.push(await timeOpen(p, id, "straight"))
  await p.close()
}
await browser.close()
console.log(`\n${BEFORE ? "BEFORE" : "NOW"}, every read and chunk after ${DELAY} ms, ms from click to preview drawn (per email: ${IDS.join(", ")})\n`)
for (const [k, xs] of Object.entries(results)) console.log(`  ${k.padEnd(9)} median ${median(xs)}   ${JSON.stringify(xs)}`)
