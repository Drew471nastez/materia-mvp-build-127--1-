/**
 * ===========================================================================
 *  A THEME'S OWN NEWSLETTER, PRESSED IN THE BUILDER'S CANVAS (ROUND 51)
 * ===========================================================================
 * The owner: "with the newsletter section ... entering an email and
 * pressing subscribe, in the editor ... says did not go through, check your
 * connection and try again."
 *
 * The canvas as it really is: the editor's page on its own origin, the theme
 * drawn in an <iframe sandbox="allow-scripts allow-forms allow-popups"
 * srcdoc> (compat-canvas.tsx), so the theme's page has no origin of its own
 * (location.origin is "null") and its base address is the editor's; the
 * bridge's head (CANVAS_HEAD) first in it; every request the page asks of
 * the editor answered by answerInCanvas with designMode on, as the editor
 * does. The theme is the owner's real Materia (tests/fixtures/materia-live)
 * with its real materia-forms.js, whose inline newsletter checks the form
 * posts to its own site before it sends:
 *
 *     if (url.origin !== location.origin || ...) throw errorMessage
 *
 * Before round 51 the builder's origin met "null" there, nothing was sent,
 * and the box said the theme's own words for a failure. Now an address on
 * the builder's origin reads as the page's own in the canvas (canvas-
 * bridge.ts, CANVAS_REQUESTS), the post is asked of the editor, and the
 * theme shows its thank you. Nothing is subscribed from the canvas.
 *
 *   node scripts/check-newsletter-canvas-r51.mjs        SHOTS=/dir for a screenshot
 */
import { spawn } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const require = createRequire(join(root, "package.json"))
const esbuild = require("esbuild")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const out = mkdtempSync(join(tmpdir(), "check-nl-canvas-"))
const at = (p) => JSON.stringify(join(root, p))

writeFileSync(join(out, "empty.js"), "export {}\n")
writeFileSync(join(out, "serve.ts"), `import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { CANVAS_HEAD } from ${at("lib/storelib-theme/compat/canvas-bridge.ts")}
import { answerInCanvas } from ${at("lib/storelib-theme/compat/canvas-cart.ts")}
import { CompatTheme, wrapCompatTemplate } from ${at("lib/storelib-theme/compat/theme.ts")}
const ROOT = ${JSON.stringify(root)}
const theme = new CompatTheme({ "layout/theme.storelib": wrapCompatTemplate("<html><body>{{ content_for_layout }}</body></html>") }, {}, { assetUrl: (n: string) => "/a/" + n })
const site: any = { creatorId: "c1", theme, pages: { home: [] }, products: [], collections: [], menus: {}, shop: { name: "Materia", currency: "USD", moneyFormat: "{{amount}}" }, host: "x", designMode: true }
const asked: unknown[] = []
let doc = readFileSync(ROOT + "/tests/fixtures/materia-live/home.html", "utf8")
doc = doc.replace(/<script[^>]*src="[^"]*"[^>]*><\\/script>/g, "")
doc = doc.replace(/<head>/i, '<head><script>window.__slPath="/";</script>' + CANVAS_HEAD)
doc = doc.replace("</body>", "<script>" + readFileSync(ROOT + "/tests/fixtures/materia-live/assets/materia-forms.js", "utf8").replace(/<\\/script/g, "<\\\\/script") + "</script></body>")
const editor = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style></head><body><iframe id="c" sandbox="allow-scripts allow-forms allow-popups"></iframe><script>var f=document.getElementById("c");fetch("/canvas-doc").then(function(r){return r.text()}).then(function(t){f.srcdoc=t});addEventListener("message",function(e){var m=e.data;if(!m||m.storelib!==1||m.type!=="request")return;fetch("/canvas-answer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(m)}).then(function(r){return r.json()}).then(function(a){f.contentWindow.postMessage({storelib:1,type:"response",id:m.id,status:a.status,contentType:a.type,body:a.body,redirectedTo:a.redirectedTo,checkout:a.checkout},"*")})});</script></body></html>'
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x")
  if (url.pathname === "/asked") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(asked)); return }
  if (url.pathname === "/canvas-doc") { res.setHeader("content-type", "text/plain; charset=utf-8"); res.end(doc); return }
  if (url.pathname === "/canvas-answer") {
    let b = ""
    for await (const c of req) b += c
    const m = JSON.parse(b)
    asked.push({ method: m.method, url: m.url, body: m.body })
    const r = await answerInCanvas(site, { cart: [], note: "" } as any, { method: m.method, url: m.url, body: m.body, ajax: m.ajax } as any, "/")
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify(r.answer))
    return
  }
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.end(editor)
}).listen(0, "127.0.0.1", function (this: any) { console.log("PORT " + this.address().port) })
`)
await esbuild.build({ entryPoints: [join(out, "serve.ts")], outfile: join(out, "serve.cjs"), bundle: true, platform: "node", format: "cjs", logLevel: "error", alias: { "@": root, "server-only": join(out, "empty.js") }, nodePaths: [join(root, "node_modules")] })
const server = spawn(process.execPath, [join(out, "serve.cjs")], { cwd: root, stdio: ["ignore", "pipe", "inherit"] })
const port = await new Promise((resolve, reject) => {
  let buf = ""
  server.stdout.on("data", (c) => { buf += c; const m = /PORT (\d+)/.exec(buf); if (m) resolve(Number(m[1])) })
  server.on("exit", (code) => reject(new Error(`server exited ${code}`)))
})

let failed = 0
const expect = (ok, label, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  if (!ok) failed++
}
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  console.log("\nMateria's inline newsletter, in the builder's canvas")
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(`http://127.0.0.1:${port}/website-builder/editor/x`, { waitUntil: "domcontentloaded" })
  await new Promise((r) => setTimeout(r, 2500))
  const frame = page.frames().find((f) => f !== page.mainFrame())
  const form = "form[data-mt-inline-subscribe]"
  await frame.waitForSelector(form, { timeout: 8000 })
  const where = await frame.evaluate(() => ({ origin: location.origin, ownOrigin: new URL(document.querySelector("form[data-mt-inline-subscribe]").action).origin }))
  expect(where.origin === "null", "the page has no origin of its own, as in the editor", where.origin)
  expect(where.ownOrigin === "null", "  and its own form's address reads as this page's", where.ownOrigin)
  await frame.$eval(form, (f) => f.scrollIntoView({ block: "center" }))
  await frame.type(`${form} input[type=email]`, "ana@example.com")
  await frame.$eval(form, (f) => f.requestSubmit(f.querySelector("button[type=submit]")))
  await new Promise((r) => setTimeout(r, 1500))
  const seen = await frame.evaluate((s) => {
    const f = document.querySelector(s)
    return { state: f.dataset.state || null, error: f.querySelector("[data-inline-result]")?.textContent || null, toast: document.querySelector(".mt-toast__text")?.textContent || null }
  }, form)
  expect(seen.state === "done" && !seen.error, "pressing Subscribe does not say it did not go through", seen)
  expect(seen.toast === "Thanks, you're on the list.", "  the theme's own thank you shows", seen.toast)
  const asked = await (await fetch(`http://127.0.0.1:${port}/asked`)).json()
  expect(asked.length === 1 && asked[0].method === "POST" && asked[0].url === "/contact" && asked[0].body?.["contact[email]"] === "ana@example.com", "  the post was asked of the editor, which answers it in design mode (nothing subscribed)", asked)
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, "newsletter-canvas.png") })
} finally {
  await browser.close()
  server.kill()
}
console.log(failed ? `\n${failed} failed\n` : "\nall measured\n")
process.exit(failed ? 1 : 0)
