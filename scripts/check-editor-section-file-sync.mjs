/**
 * A SAVED SECTION FILE, DRAWN ALONE, IS DRAWN AS THE WHOLE PAGE WOULD DRAW IT.
 *
 * compat-canvas.tsx syncFileChange draws only the sections whose file an
 * agent saved and swaps them into the page on screen, instead of drawing
 * the page again. This holds it to the page drawn whole: an editor that
 * took the saves one by one, and an editor opened afresh on the same files,
 * must show the same markup in every section, the changed ones and the
 * rest. Also that the page was not drawn again for them (no document
 * loaded) and that the swaps were the only change.
 *
 *   npx tsx scripts/check-editor-section-file-sync.mjs
 *   BIG_THEME_ZIP=<a theme's zip>   a store theme (scripts/big-theme-kit.mjs); the Materia fixture otherwise
 *   EXPECT_ALONE=0                  for a bundle from before syncFileChange: compare the markup only
 *   BEHIND=0                        without the stylesheet saved and the files saved while its page loads behind
 */
import assert from "node:assert/strict"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep, withMarkup } = await import("./canvas-probe-kit.mjs")
const compat = process.env.BIG_THEME_ZIP ? await (await import("./big-theme-kit.mjs")).bigImportedTheme() : await importedTheme({ store: true })
const GLOBALS = `window.PROBE_ACTIVITY={events:[{id:1000,agent_name:"Claude Code",path:"pages/home",action:"page",detail:{page:"home",ops:[]},created_at:"2026-10-01T00:00:00.000Z"}],syncAt:null};window.PROBE_CONNECTIONS={agents:[{name:"Claude Code",kind:"claude"}],github:null,latest:null};`

/* Files whose only </template> is the file's own: a marker put before an inner one (Dawn prints <template> elements) would never show. */
const onPage = [...new Set((compat.pages.home ?? []).map((s) => `sections/${s.type}.storelib`))].filter((p) => compat.sources[p] && !/theme-(header|footer)|announcement/.test(p) && compat.sources[p].split("</template>").length === 2)
const targets = onPage.slice(0, 3)
assert(targets.length > 0, "no section of the home page to save")

/* Every section's markup in the page in front, without what the canvas adds while it runs. */
const sectionsOf = async (ed) => {
  const f = await ed.front()
  return f.evaluate(() => Object.fromEntries([...document.querySelectorAll(".shopify-section[data-section-id]")].map((el) => {
    const c = el.cloneNode(true)
    /* A swapped section's stylesheets are taken up by the frame (canvas-bridge.ts), as they always were: compared without them. */
    c.querySelectorAll("[data-sl-own], [data-storelib-overlay], .sl-box, .sl-gap, link[rel=stylesheet]").forEach((x) => x.remove())
    for (const a of ["style", "data-sl-shown", "data-sl-held", "class"]) c.removeAttribute(a)
    /*
      What the theme's own script writes as the page runs (Dawn's scroll-trigger--offscreen as it scrolls, the role and aria
      state its disclosure script gives a <summary> when the page loads, not when a section is swapped in) is the page
      running, not its markup.
    */
    return [el.getAttribute("data-section-id"), (c.innerHTML || "").replace(/\s+/g, " ").replace(/ (data-sl-[a-z-]+|style|role|aria-[a-z]+)="[^"]*"/g, "").replace(/ scroll-trigger--(offscreen|cancel)/g, "").trim()]
  })))
}

const ed = await openEditor({ kind: "imported", bundle, css, compat, globals: GLOBALS, width: 1280, height: 900, settle: 3000 })
let after
try {
  await ed.js(() => { const P = (window.__docs = { n: 0 }); new MutationObserver((l) => { for (const r of l) for (const n of r.addedNodes) if (n.tagName === "IFRAME") n.addEventListener("load", () => P.n++) }).observe(document, { childList: true, subtree: true }) })
  for (const [k, p] of targets.entries()) {
    const text = withMarkup(compat.sources[p], `<p data-saved="s${k}">saved ${k}</p>`)
    compat.sources[p] = text
    compat.all[p] = text
    await ed.page.evaluate((path, t) => {
      window.PROBE_COMPAT.sources[path] = t
      const a = window.PROBE_ACTIVITY
      a.events.push({ id: a.events[a.events.length - 1].id + 1, agent_name: "Claude Code", path, action: "updated", created_at: new Date().toISOString() })
    }, p, text)
    const f = await ed.front()
    await f.waitForFunction((s) => !!document.querySelector(`[data-saved="${s}"]`), { timeout: 30_000, polling: 200 }, `s${k}`)
    await sleep(1500)
  }
  const docs = await ed.js(() => window.__docs.n)
  const alone = await ed.js(() => performance.getEntriesByName("sl-section-file-sync").length)
  if (process.env.BEHIND !== "0") {
    /*
      A stylesheet saved (the page is loaded again, behind), and two section
      files saved while that page loads: both reach the page once it is in
      front (compat-canvas.tsx behindStale), and the page ends as the files
      draw it whole.
    */
    const cssPath = Object.keys(compat.files).find((p) => /^shopify\/assets\/(materia|base)\.css$/.test(p))
    const more = onPage.slice(3, 5).length ? onPage.slice(3, 5) : onPage.slice(0, 2)
    const cssText = `${compat.files[cssPath]}\n:root{--saved-behind:1}`
    compat.files[cssPath] = cssText
    compat.all[cssPath] = cssText
    const rows = [{ path: cssPath, files: { [cssPath]: cssText } }]
    for (const [j, p] of more.entries()) {
      const text = withMarkup(compat.sources[p], `<p data-saved="b${j}">behind ${j}</p>`)
      compat.sources[p] = text
      compat.all[p] = text
      rows.push({ path: p, sources: { [p]: text } })
    }
    for (const r of rows) {
      await ed.page.evaluate((row) => {
        Object.assign(window.PROBE_COMPAT.files, row.files ?? {})
        Object.assign(window.PROBE_COMPAT.sources, row.sources ?? {})
        const a = window.PROBE_ACTIVITY
        a.events.push({ id: a.events[a.events.length - 1].id + 1, agent_name: "Claude Code", path: row.path, action: "updated", created_at: new Date().toISOString() })
      }, r)
      /* Each its own read of the log, the way an agent's saves a second apart arrive. */
      await sleep(1300)
    }
    const f = await ed.front()
    const reached = (n) => getComputedStyle(document.documentElement).getPropertyValue("--saved-behind").trim() === "1" && [...Array(n).keys()].every((j) => !!document.querySelector(`[data-saved="b${j}"]`))
    const ok = await f.waitForFunction(reached, { timeout: 45_000, polling: 250 }, more.length).then(() => true, () => false)
    if (!ok) {
      const now = await (await ed.front()).evaluate((n) => ({ css: getComputedStyle(document.documentElement).getPropertyValue("--saved-behind").trim(), files: [...Array(n).keys()].map((j) => !!document.querySelector(`[data-saved="b${j}"]`)), links: [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => l.getAttribute("href")).filter((h) => /base|materia/.test(h)) }), more.length)
      throw new Error(`the stylesheet and the files saved while the page loaded behind did not all reach the page: ${JSON.stringify(now)}`)
    }
    await sleep(2000)
    console.log(`a stylesheet and ${more.length} section files saved while the page loaded behind: all on the page`)
  }
  console.log(`saves taken: ${targets.length}; drawn alone: ${alone}; documents loaded for them: ${docs}`)
  assert.equal(docs, 0, "no document loaded for a saved section file")
  if (process.env.EXPECT_ALONE !== "0") assert.equal(alone, targets.length, "each save drawn alone, not the page drawn again")
  after = await sectionsOf(ed)
} finally {
  await ed.close()
}

/* The same files, opened afresh: the page drawn whole. */
const fresh = await openEditor({ kind: "imported", bundle, css, compat, globals: GLOBALS, width: 1280, height: 900, settle: 3000 })
let whole
try {
  whole = await sectionsOf(fresh)
} finally {
  await fresh.close()
}
const ids = Object.keys(whole)
assert.deepEqual(Object.keys(after).sort(), ids.slice().sort(), "the same sections, no more and no fewer")
const differ = ids.filter((id) => after[id] !== whole[id])
for (const id of differ.slice(0, 3)) {
  const a = after[id], b = whole[id]
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  console.log(`  ${id} differs at ${i}:\n    taken: ${a.slice(Math.max(0, i - 80), i + 120)}\n    whole: ${b.slice(Math.max(0, i - 80), i + 120)}`)
}
assert.equal(differ.length, 0, `${differ.length} of ${ids.length} sections differ from the page drawn whole: ${differ.slice(0, 5).join(", ")}`)
console.log(`ok: ${ids.length} sections, the ${targets.length} saved ones among them, are what the page drawn whole shows`)
