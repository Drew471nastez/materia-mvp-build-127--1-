/**
 * ===========================================================================
 *  IS THE CANVAS IN A PROCESS OF ITS OWN? (lib/website-builder/canvas-origin.ts)
 * ===========================================================================
 * The real editor (editor-probe-harness.mjs) open on the owner's Materia
 * theme (materia-live-fixture.mjs). Reports, from the browser's own
 * DevTools targets, whether the canvas frame is an out-of-process frame
 * (its own renderer) and that the page drew in it: sections, a section
 * picked from the sidebar outlined in the frame, and the theme's assets
 * loaded with the draft pass.
 *
 *   npx tsx scripts/check-canvas-site-r3.mjs                       (srcdoc, the default)
 *   CANVAS_ORIGIN=http://storelib.me npx tsx scripts/check-canvas-site-r3.mjs
 *   SITE_PER_PROCESS=1 (desktop Chrome's default, should headless lack it)
 */
process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { openEditor, sleep } = await import("./canvas-probe-kit.mjs")
const { materiaLiveTheme } = await import("./materia-live-fixture.mjs")

const compat = await materiaLiveTheme()
const watch = (page) => {
  if (!process.env.DEBUG_SHEETS) return
  page.on("requestfailed", (r) => { if (/navigation\.css|minicart|experience/.test(r.url())) console.log("failed", r.url().slice(-60), r.failure()?.errorText) })
  page.on("requestfinished", (r) => { if (/navigation\.css|minicart|experience/.test(r.url())) console.log("finished", r.response()?.status(), r.url().slice(-50), r.frame()?.url().slice(0, 30)) })
  page.on("request", (r) => { if (/navigation\.css|minicart|experience/.test(r.url())) console.log("request", r.url().slice(-50), r.resourceType(), r.frame()?.url().slice(0, 30)) })
}
const ed = await openEditor({ kind: "imported", bundle, css, compat, settle: 1500, beforeOpen: watch })
let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`); if (!ok) broken++ }
try {
  const { page, browser } = ed
  const cdp = await browser.target().createCDPSession()
  const { targetInfos } = await cdp.send("Target.getTargets")
  const frames = targetInfos.filter((t) => t.type === "iframe").map((t) => t.url.slice(0, 60))
  const mode = process.env.CANVAS_ORIGIN ? "cross-site" : "srcdoc"
  console.log(`mode: ${mode}; out-of-process frames: ${JSON.stringify(frames)}`)
  let procs = null
  try { procs = (await cdp.send("SystemInfo.getProcessInfo")).processInfo.filter((p) => p.type === "renderer").length } catch (e) { procs = String(e.message).slice(0, 80) }
  console.log(`renderer processes: ${procs}`)
  if (process.env.CANVAS_ORIGIN) expect(frames.some((u) => u.startsWith(process.env.CANVAS_ORIGIN)), "the canvas shell is an out-of-process frame", frames)
  else expect(frames.length === 0, "the srcdoc canvas is in the editor's process", frames)
  if (process.env.DEBUG_SHEETS) {
    page.on("requestfailed", (r) => { if (/navigation|minicart|experience|popup/.test(r.url())) console.log("failed", r.url().slice(-60), r.failure()?.errorText) })
    page.on("response", (r) => { if (/navigation\.css|minicart\.css|experience\.css|popup\.css/.test(r.url())) console.log("resp", r.status(), r.url().slice(-50), r.frame()?.url().slice(0, 30)) })
    await page.evaluate(() => { const f = document.querySelector("[data-compat-frame='front']"); window.__x = 1; void f })
  }
  if (process.env.WAIT) await sleep(Number(process.env.WAIT))
  const f = await ed.front()
  const n = await f.evaluate(() => document.querySelectorAll(".shopify-section").length)
  expect(n > 10, "the page drew its sections in the frame", n)
  const origin = await f.evaluate(() => [location.href.slice(0, 20), String(self.origin), document.baseURI.slice(0, 40), window.__slTo ?? null])
  console.log(`  frame: ${JSON.stringify(origin)}`)
  expect(origin[1] === "null", "the theme still runs with no origin", origin[1])
  const sheets = await f.evaluate(() => [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => l.href).filter((h) => /site-theme\/assets/.test(h)).slice(0, 2))
  expect(sheets.length > 0 && sheets.every((h) => /\/edit\.p{32}\//.test(h) || !process.env.CANVAS_ORIGIN), "draft assets are addressed with the pass", sheets)
  const loadedCss = await f.evaluate(() => [...document.styleSheets].filter((s) => { try { return s.href && /site-theme/.test(s.href) && s.cssRules.length > 0 } catch (e) { return true } }).length)
  const links = await f.evaluate(() => document.querySelectorAll("link[rel=stylesheet]").length)
  if (process.env.DEBUG_SHEETS) console.log(await f.evaluate(() => [...document.querySelectorAll("link")].filter((l) => /navigation\.css|minicart|experience/.test(l.href)).map((l) => l.outerHTML.replace(/pppp+/g, "P").slice(0, 300))))
  if (process.env.DEBUG_SHEETS) console.log(await f.evaluate(() => [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => { let n; try { n = l.sheet ? l.sheet.cssRules.length : "no sheet" } catch (e) { n = "x" } return l.href.split("/").pop() + ":" + n + ":" + (l.media || "") })))
  expect(loadedCss > 0, "the theme's stylesheets loaded", { loadedCss, links, sheets: await f.evaluate(() => document.styleSheets.length) })
  /* A section picked in the canvas: the editor hears the pick (bridge -> shell -> editor, by exact origin). */
  const box = await page.evaluate(() => { const r = document.querySelector("[data-compat-frame='front']").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 } })
  await page.evaluate(() => { window.__picks = 0; addEventListener("message", (e) => { if (e.data && e.data.type === "pick") window.__picks++ }) })
  await page.mouse.click(box.x, box.y)
  await sleep(800)
  const picks = await page.evaluate(() => window.__picks)
  expect(picks > 0, "a press in the canvas picks a section in the editor", picks)
  const outlined = await f.evaluate(() => !!document.querySelector("[data-sl-box], .sl-outline, [data-sl-selected]"))
  console.log(`  outline drawn in frame: ${outlined}`)
  expect(ed.errors.length === 0, "no page errors", ed.errors.slice(0, 3))
} finally {
  await ed.close()
}
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
