/**
 * ===========================================================================
 *  THE NEWSLETTER SIGN UP, SUBMITTED IN A REAL BROWSER
 * ===========================================================================
 * Two pages served from here and driven in headless Chromium:
 *
 *   IMPORTED THEME   a theme with no newsletter of its own, with Storelib
 *                    Newsletter (lib/storelib-theme/compat/storelib-
 *                    newsletter.ts) placed as the slim bar, drawn by the
 *                    compatible engine as the website draws it, its page
 *                    script (the theme shims' form handler) included. Every
 *                    request is answered by the engine's own `answer`, as
 *                    the website's route does; the subscribe route's call is
 *                    recorded instead of written.
 *   STORELIB THEME   the Storelib theme's Newsletter Signup (promo_newsletter)
 *                    rendered by the live engine and mounted with the real
 *                    StorelibSection, whose submit goes to
 *                    /api/website-builder/subscribe, recorded here.
 *
 * For each: the box is on screen, typing an address and pressing the button
 * shows the thank you, and the request carries this creator, the address and
 * the box it came from (bar / newsletter).
 *
 *   node scripts/check-newsletter-embed.mjs        SHOTS=/dir for screenshots
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const out = mkdtempSync(join(tmpdir(), "check-newsletter-"))
const at = (p) => JSON.stringify(join(root, p))
const CREATOR = "11111111-1111-4111-8111-111111111111"

/* ── the Storelib theme's section, mounted for real in the browser ───── */
writeFileSync(join(out, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }\n`)
writeFileSync(join(out, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, priority, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }\n`)
writeFileSync(join(out, "empty.js"), "export {}\n")
writeFileSync(
  join(out, "entry.tsx"),
  `import * as React from "react"
import { createRoot } from "react-dom/client"
import { StorefrontProvider } from ${at("components/website-builder/theme/storefront-context.tsx")}
import { StorelibSourcesProvider } from ${at("components/website-builder/sections/storelib-sources.tsx")}
import { StorelibSection } from ${at("components/website-builder/sections/StorelibSection.tsx")}
const d = (window as any).__nl
createRoot(document.getElementById("app")!).render(
  <StorefrontProvider value={{ creatorId: d.creator, currency: "USD" } as never}>
    <StorelibSourcesProvider prerendered={{ [d.section.id]: d.rendered }} page={{ template: "index" }}>
      <StorelibSection section={d.section} theme={{} as never} />
    </StorelibSourcesProvider>
  </StorefrontProvider>,
)
`,
)
execFileSync("pnpm", ["exec", "esbuild", join(out, "entry.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
  `--alias:server-only=${join(out, "empty.js")}`, `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
{ cwd: root, env: { ...process.env, NODE_PATH: join(root, "node_modules") }, stdio: ["ignore", "inherit", "inherit"] })

/* ── the server: both pages, and every request they make ─────────────── */
writeFileSync(
  join(out, "serve.ts"),
  `import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { CompatTheme, wrapCompatTemplate } from ${at("lib/storelib-theme/compat/theme.ts")}
import { answer, type SiteData } from ${at("lib/storelib-theme/compat/site.ts")}
import { withStorelibReviewsSection } from ${at("lib/storelib-theme/compat/storelib-reviews.ts")}
import { renderStorelibSection } from ${at("lib/website-builder/storelib-runtime.ts")}
const CREATOR = ${JSON.stringify(CREATOR)}
const files = withStorelibReviewsSection({
  "layout/theme.storelib": wrapCompatTemplate('<html><head><meta name="viewport" content="width=device-width,initial-scale=1">{{ content_for_header }}<style>body{margin:0;font-family:Georgia,serif;color:rgb(40,30,20);--color-button:160,40,30;--color-button-text:255,250,240;--color-background:250,246,238}</style></head><body><main>{{ content_for_layout }}</main></body></html>'),
  "sections/hero.storelib": wrapCompatTemplate('<h1 style="padding:40px 20px">Linen &amp; Co</h1>') + '\\n\\n<schema>\\n{"type":"hero","name":"hero","settings":[]}\\n</schema>\\n',
})
const site: SiteData = { creatorId: CREATOR, theme: new CompatTheme(files, {}, { assetUrl: (n) => "/a/" + n }), pages: { home: [{ id: "hero", type: "hero" }, { id: "nl", type: "storelib-newsletter", settings: { look: "bar", heading: "Join our list", consent: "You can unsubscribe at any time." } }] } as never, products: [], collections: [], menus: {}, shop: { name: "Linen & Co", currency: "USD", moneyFormat: "\${{amount}}" } as never, host: "127.0.0.1" }
const section = { id: "nl2", type: "promo_newsletter", name: "Newsletter Signup", settings: {}, blocks: [] }
const rendered = renderStorelibSection(section as never, {} as never, { template: "index" })
const posts: unknown[] = []
const read = (req: any) => new Promise<string>((r) => { let b = ""; req.on("data", (c: Buffer) => (b += c)); req.on("end", () => r(b)) })
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x")
  if (url.pathname === "/posts") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(posts)) }
  if (url.pathname === "/probe.js") { res.setHeader("content-type", "text/javascript"); return res.end(readFileSync(${JSON.stringify(join(out, "probe.js"))})) }
  if (url.pathname === "/api/website-builder/subscribe") { posts.push({ route: "storelib", body: JSON.parse(await read(req)) }); res.setHeader("content-type", "application/json"); return res.end('{"ok":true}') }
  if (url.pathname === "/storelib") {
    res.setHeader("content-type", "text/html")
    return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui}</style></head><body><div id="app"></div><script>window.__nl=' + JSON.stringify({ creator: CREATOR, section, rendered }).replace(/</g, "\\\\u003c") + '</script><script src="/probe.js"></script></body></html>')
  }
  /* The imported theme: every address answered by the engine, as the website's route does (app/api/site-theme/site). */
  let body: Record<string, unknown> | null = null
  if (req.method === "POST") { const raw = await read(req); const ct = String(req.headers["content-type"] ?? ""); if (ct.includes("multipart")) { const fd = await new Response(raw, { headers: { "content-type": ct } }).formData(); body = {}; fd.forEach((v, k) => { (body as any)[k] = String(v) }) } else body = Object.fromEntries(new URLSearchParams(raw)) }
  const ajax = String(req.headers["x-requested-with"] ?? "") === "XMLHttpRequest"
  const r = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body, cart: [], ajax, submit: async (kind, payload) => { posts.push({ route: kind, body: payload }); return { ok: true, status: 200 } } })
  res.statusCode = r.status
  for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v as string)
  res.setHeader("content-type", r.type)
  res.end(r.body)
}).listen(0, "127.0.0.1", function (this: any) { console.log("PORT " + this.address().port) })
`,
)
const server = spawn("npx", ["tsx", join(out, "serve.ts")], { cwd: root, env: { ...process.env, NODE_OPTIONS: "--conditions=react-server" }, stdio: ["ignore", "pipe", "inherit"] })
const port = await new Promise((resolve, reject) => {
  let buf = ""
  server.stdout.on("data", (c) => {
    buf += c
    const m = /PORT (\d+)/.exec(buf)
    if (m) resolve(Number(m[1]))
  })
  server.on("exit", (code) => reject(new Error(`server exited ${code}`)))
})

let failed = 0
const expect = (ok, label, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n          ${JSON.stringify(detail)}`}`)
  if (!ok) failed++
}
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
try {
  const base = `http://127.0.0.1:${port}`
  for (const width of [390, 1280]) {
    console.log(`\nImported theme, Storelib Newsletter as the bar, ${width}px`)
    const page = await browser.newPage()
    page.on("pageerror", (e) => expect(false, "no script error on the page", String(e)))
    await page.setViewport({ width, height: 800 })
    await page.goto(`${base}/`, { waitUntil: "networkidle0" })
    const box = await page.evaluate(() => {
      const bar = document.querySelector(".slnl--bar")
      const b = bar?.getBoundingClientRect()
      const btn = bar?.querySelector(".slnl__b")
      return b && btn ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right, vw: innerWidth, vh: innerHeight, btnBg: getComputedStyle(btn).backgroundColor, font: getComputedStyle(bar).fontFamily, consent: bar.querySelector(".slnl__c")?.textContent, scrollW: document.documentElement.scrollWidth } : null
    })
    expect(!!box && Math.round(box.bottom) === box.vh && box.left === 0 && Math.round(box.right) === box.vw, "the bar sits across the foot of the screen", box)
    expect(box?.btnBg === "rgb(160, 40, 30)" && /Georgia/.test(box?.font ?? ""), "  in the theme's button colour and font", box)
    expect(box?.consent === "You can unsubscribe at any time." && box.scrollW <= box.vw, "  with the consent line, and nothing scrolls sideways", box)
    await page.type(".slnl__i", `bar${width}@example.com`)
    await page.click(".slnl__b")
    await page.waitForSelector(".slnl__ok", { timeout: 8000 }).catch(() => null)
    const thanks = await page.evaluate(() => document.querySelector(".slnl__ok")?.textContent ?? null)
    expect(thanks === "Thanks for subscribing.", "pressing Sign up shows the thank you", thanks)
    const posts = await (await fetch(`${base}/posts`)).json()
    const sent = posts.find((p) => p.body?.email === `bar${width}@example.com`)
    expect(sent?.route === "subscribe" && sent.body.creator_id === CREATOR && sent.body.placement === "bar", "  and the subscribe route was asked for this creator, this address, from the bar", sent)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `imported-bar-${width}.png`) })
    await page.close()
  }

  console.log("\nStorelib theme, Newsletter Signup (promo_newsletter) in StorelibSection")
  const page = await browser.newPage()
  page.on("pageerror", (e) => expect(false, "no script error on the page", String(e)))
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(`${base}/storelib`, { waitUntil: "networkidle0" })
  const form = await page.evaluate(() => !!document.querySelector('form[data-storelib-form="subscribe"] input[type="email"]'))
  expect(form, "the section's email box is drawn")
  await page.type('form[data-storelib-form="subscribe"] input[type="email"]', "nl@example.com")
  await page.click('form[data-storelib-form="subscribe"] button[type="submit"]')
  await page.waitForFunction(() => /on the list/.test(document.body.innerText), { timeout: 8000 }).catch(() => null)
  const said = await page.evaluate(() => document.body.innerText)
  expect(/Thanks, you're on the list\./.test(said), "pressing the button shows the thank you", said.slice(0, 300))
  const posts = await (await fetch(`${base}/posts`)).json()
  const sent = posts.find((p) => p.route === "storelib")
  expect(sent?.body?.creator_id === CREATOR && sent.body.email === "nl@example.com" && sent.body.placement === "newsletter", "  posted to /api/website-builder/subscribe with this creator, the address, placement newsletter", sent)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "storelib-newsletter.png") })
} finally {
  await browser.close()
  server.kill()
  rmSync(out, { recursive: true, force: true })
}
console.log(failed ? `\n${failed} failed` : "\nall measured")
process.exit(failed ? 1 : 0)
