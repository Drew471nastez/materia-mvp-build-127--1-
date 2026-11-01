/**
 * ===========================================================================
 *  AN IMPORTED THEME'S CANVAS, WHEN ONE OF ITS STYLESHEETS DOES NOT ANSWER
 * ===========================================================================
 * The owner (andrewrullz, 1 Nov 2026): a section added from Add a section
 * was not drawn in the canvas, and sections already on the page, the footer
 * group among them, were listed in the sidebar but not drawn. Production
 * said "[compat-canvas] the page never said it had drawn; shown as it is".
 *
 * The real editor (scripts/editor-probe-harness.mjs) on the Materia fixture
 * with the theme's own-stylesheet sections (as check-section-insert-smooth.mjs
 * has them), the asset pass handed out with the files, and:
 *
 *   clean        every stylesheet answers at once (the control)
 *   head-hang    the layout's stylesheet (materia.css) never answers, as an
 *                asset route waiting on a database that does not answer
 *   section-hang the stylesheet of the section added never answers
 *   replace-hang a push rewrites the home page whole (GitHub's version used),
 *                with a section whose stylesheet never answers
 *
 * Each scenario opens Add a section, picks a card, and then asks: is the
 * section drawn in the canvas within 8s (ADDED), did the page say it was
 * ready (READY), and is every section of the page, the footer group's
 * included, in the canvas (GROUPS).
 *
 *   node tsx scripts/check-canvas-stalls.mjs
 *   SCENARIOS=head-hang STRICT=0 ...
 */
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { openEditor, importedTheme, sleep } = await import("./canvas-probe-kit.mjs")

const STRICT = process.env.STRICT !== "0"
const SCENARIOS = (process.env.SCENARIOS ?? "clean,head-hang,section-hang,replace-hang").split(",").filter(Boolean)
process.env.PROBE_ASSET_PASS ??= "1"

const own = (zip) => {
  for (const [i, k] of ["a", "b"].entries()) {
    zip.file(`sections/ins-${k}.liquid`, `{{ 'section-ins-${k}.css' | asset_url | stylesheet_tag }}
<div class="ins-${k}"><h2>{{ section.settings.heading }}</h2><p>Small batch, roasted on Tuesdays.</p></div>
{% schema %}
{ "name": "Insert ${k.toUpperCase()}", "settings": [ { "type": "text", "id": "heading", "label": "Heading", "default": "Heading ${k.toUpperCase()}" } ], "presets": [ { "name": "Insert ${k.toUpperCase()}" } ] }
{% endschema %}`)
    zip.file(`assets/section-ins-${k}.css`, `.ins-${k}{padding:${60 + i * 10}px 40px;background:#333;color:#fff}`)
  }
}
const compat = await importedTheme({ edit: own })
const results = []
for (const scenario of SCENARIOS) {
  const HANG = 600_000
  let hangB = false
  const assetDelay = (name) => (scenario === "head-hang" && name === "materia.css") || (scenario === "section-hang" && name === "section-ins-a.css") || (hangB && name === "section-ins-b.css") ? HANG : 0
  let ed = null
  const r = { scenario, opened: false, ready: false, added: false, groups: null, reports: [] }
  try {
    const activity = `window.PROBE_ACTIVITY={events:[],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[],github:{repo:"o/r"},latest:null};`
    ed = await openEditor({ kind: "imported", bundle, css, compat, globals: activity, settle: 1500, assetDelay, init: `(() => { if (window.parent !== window) return; window.__reports = []; const w = console.warn; console.warn = function (m) { if (typeof m === "string" && /^\\[compat-canvas\\]/.test(m)) window.__reports.push(m.slice(0, 160)); return w.apply(this, arguments) } })()` })
    r.opened = true
    const { page, js } = ed
    /*
      replace-hang: a push to GitHub rewrote templates/home.json whole while the builder had changed it too (GitHub's
      version is used, lib/github-sync/sync.ts), and the new page has a section whose own stylesheet does not answer.
      The editor reads the page again and draws it behind; the page with the new section must come forward, with its
      header and footer groups, and take the next add.
    */
    if (scenario === "replace-hang") {
      hangB = true
      await js(() => {
        const home = window.PROBE_COMPAT.pages.home
        home.push({ id: "pushed-b", type: "ins-b", settings: { heading: "From GitHub" }, blocks: [] })
        const a = window.PROBE_ACTIVITY
        a.events.push({ id: 1, agent_name: "GitHub", path: "pages/home", action: "page", created_at: new Date().toISOString(), detail: { page: "home", replaced: true } })
        window.dispatchEvent(new Event("focus"))
      })
      const t0 = Date.now()
      let landed = false
      while (Date.now() - t0 < 12_000 && !landed) {
        await sleep(250)
        const f = await ed.front()
        landed = await f.evaluate(() => !!document.querySelector(".shopify-section .ins-b") && !!document.querySelector("[id*='footer']")).catch(() => false)
      }
      r.replaced = landed
      r.replaceMs = landed ? Date.now() - t0 : null
      await sleep(1500)
    }
    /* The page's bridge said it was ready: the editor's selection ring and patches reach it only then. */
    const front = await ed.front()
    const before = await front.evaluate(() => [...document.querySelectorAll(".shopify-section")].map((e) => e.id.slice(16)))
    r.groups = { inPage: before.length, footer: before.filter((id) => /footer/.test(id)).length }
    await front.evaluate(() => {
      const main = [...document.querySelectorAll("main .shopify-section")]
      parent.postMessage({ storelib: 1, type: "add-section", before: main[1]?.id.slice(16) ?? null, after: main[0]?.id.slice(16) ?? null }, "*")
    })
    /* Add a section from the page needs the bridge (inspect mode, "add-section" heard by the editor): from the editor's own list otherwise. */
    let open = await page.waitForFunction(() => document.querySelector("[data-section-library-layer]")?.getAttribute("data-state") === "open", { timeout: 4000 }).then(() => true, () => false)
    if (!open) {
      await js(() => [...document.querySelectorAll("button")].find((b) => /^add section$/i.test((b.textContent ?? "").trim()))?.click())
      open = await page.waitForFunction(() => document.querySelector("[data-section-library-layer]")?.getAttribute("data-state") === "open", { timeout: 4000 }).then(() => true, () => false)
    }
    await sleep(800)
    const card = await js(() => {
      const c = [...document.querySelectorAll("[data-section-library] [data-library-card='ins-a']")].find((x) => !x.hidden && x.getClientRects().length)
      if (!c) return null
      c.scrollIntoView({ block: "center" })
      const b = c.getBoundingClientRect()
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + Math.min(b.height / 2, 60)) }
    })
    if (card) {
      await sleep(200)
      await page.mouse.click(card.x, card.y)
      const t0 = Date.now()
      while (Date.now() - t0 < 8000 && !r.added) {
        await sleep(250)
        const f = await ed.front()
        r.added = await f.evaluate(() => !!document.querySelector(".shopify-section .ins-a")).catch(() => false)
      }
      r.addMs = r.added ? Date.now() - t0 : null
    } else r.note = open ? "no ins-a card" : "the library did not open"
    const f = await ed.front()
    r.ready = await f.evaluate(() => typeof window.__slAddLabel !== "undefined" || !!document.querySelector("[data-sl-ring], [data-sl-selected]") || typeof window.__slGiveBack === "function").catch(() => false)
    r.reports = await js(() => window.__reports ?? [])
    r.errors = ed.errors.slice(0, 3)
  } catch (e) {
    r.note = String(e).slice(0, 200)
  } finally {
    await ed?.close()
  }
  results.push(r)
  console.log(`${scenario.padEnd(13)} opened ${r.opened}${"replaced" in r ? `  rewritten page drawn ${r.replaced}${r.replaceMs ? ` (${r.replaceMs}ms)` : ""}` : ""}  added in 8s ${r.added}${r.addMs ? ` (${r.addMs}ms)` : ""}  sections in page ${r.groups?.inPage ?? "-"} (footer ${r.groups?.footer ?? "-"})  reports ${JSON.stringify(r.reports)}${r.note ? `  note: ${r.note}` : ""}`)
}
const bad = results.filter((r) => !r.opened || !r.added || r.replaced === false)
if (bad.length) {
  console.log(`\n${bad.length} scenario(s) where the added section was not drawn: ${bad.map((r) => r.scenario).join(", ")}`)
  if (STRICT) process.exit(1)
} else console.log("\nPASS")
process.exit(0)
