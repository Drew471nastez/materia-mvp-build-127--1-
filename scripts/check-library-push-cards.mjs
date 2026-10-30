/**
 * ===========================================================================
 *  ADD A SECTION KEEPS EVERY CARD THROUGH A PUSH, IMPORTED THEME, MEASURED
 * ===========================================================================
 * The question: on an imported theme, do the sections a push from GitHub or
 * an agent changed drop out of Add a section until a reload?
 * scripts/check-library-preview-placement.mjs saw 7 cards become 4 after a
 * push of 3 section files.
 *
 * The answer was the probe's own edit. It wrote `<i data-push></i></template>`
 * on one line, and a closing tag counts only when it starts a line
 * (lib/storelib-theme/storelib/parse.ts), so each of the 3 files was one
 * whose template never closes. The editor could not read their schemas and
 * left them out of the library, as it does any file that does not read. The
 * files route refuses such a file (compatFileErrors), so no push lands one.
 *
 * This opens the real editor (scripts/canvas-probe-kit.mjs) on the Materia
 * theme with Add a section open, and plays pushes the way the editor gets
 * them: the activity rows, and the files route answering with each file as
 * the server keeps it (syncCompatFile, then held to compatFileErrors, as
 * lib/website-builder/save-theme-file.ts does). For each it measures the
 * cards before and after, and whether the push is in the canvas and in the
 * cards' names:
 *
 *   markup     3 section files, a mark at the end of their markup
 *   schema     a section renamed and its preset renamed, another given a
 *              second preset (one more card)
 *   one-line   the old probe's edit, delivered anyway: the server's answer
 *              to it, and what the editor does with it
 *
 *   npx tsx scripts/check-library-push-cards.mjs
 *   CASES=markup,schema         which (all by default)
 */
import assert from "node:assert/strict"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep, withMarkup } = await import("./canvas-probe-kit.mjs")
const { compatFileErrors, syncCompatFile, compatBlockTypes } = await import("../lib/storelib-theme/compat/schema-sync.ts")
const { compatSchemaWords } = await import("../lib/storelib-theme/shopify/convert.ts")
const { splitCompatFile } = await import("../lib/storelib-theme/compat/theme.ts")

const CASES = (process.env.CASES ?? "markup,schema,one-line").split(",")
const GLOBALS = `window.PROBE_ACTIVITY={events:[{id:1000,agent_name:"GitHub · ada",path:"pages/home",action:"page",detail:{page:"home",replaced:true},created_at:"2026-10-01T00:00:00.000Z"}],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[{name:"Claude Code",kind:"claude"}],github:{repo:"ada/theme"},latest:null};`

/* The same 3 files the placement probe pushes. */
const base = await importedTheme({ store: true })
const SECTION_PATHS = Object.keys(base.sources).filter((p) => /^sections\/.*\.storelib$/.test(p) && base.sources[p].split("</template>").length === 2 && !/header|footer|announcement/.test(p))
const PUSHED = SECTION_PATHS.slice(0, 3)
const typeOf = (p) => p.replace(/^sections\//, "").replace(/\.storelib$/, "")

/* The file as the files route keeps it after a push, or why it refuses it. */
const ctx = { tr: compatSchemaWords(Object.fromEntries(Object.entries(base.all).filter(([p]) => p.startsWith("shopify/locales/")))), blockTypes: compatBlockTypes(Object.keys(base.all)) }
function serverKeeps(path, text, previous) {
  const synced = syncCompatFile(path, text, previous, ctx)
  if (synced.ok === false) return { refused: synced.errors.map((e) => e.message) }
  const errors = compatFileErrors(path, synced.source)
  return errors.length ? { refused: errors.map((e) => e.message) } : { text: synced.source }
}

/* A file with its theme schema changed: the panel part left as it was, for the save to make again. */
function withShopifySchema(source, change) {
  const { schema } = splitCompatFile(source)
  const next = { ...schema, shopify: change(structuredClone(schema.shopify)) }
  return source.replace(/<schema>[\s\S]*?<\/schema>/, () => `<schema>\n${JSON.stringify(next, null, 2)}\n</schema>`)
}

const stamp = Date.now().toString(36)
const PUSHES = {
  markup: () => Object.fromEntries(PUSHED.map((p) => [p, withMarkup(base.sources[p], `<i data-push="${stamp}"></i>`)])),
  schema: () => ({
    "sections/image-text.storelib": withShopifySchema(base.sources["sections/image-text.storelib"], (s) => ({ ...s, name: "Image beside text", presets: [{ ...s.presets[0], name: "Image beside text" }] })),
    "sections/rich-text.storelib": withShopifySchema(base.sources["sections/rich-text.storelib"], (s) => ({ ...s, presets: [...s.presets, { name: "Rich text, short" }] })),
  }),
  "one-line": () => Object.fromEntries(PUSHED.map((p) => [p, base.sources[p].replace("</template>", `<i data-push="${stamp}"></i></template>`)])),
}

const CARDS = () => [...document.querySelectorAll("[data-section-library-layer][data-state='open'] [data-library-card]")].filter((c) => !c.hidden).map((c) => ({ type: c.querySelector("[data-compat-preview]")?.getAttribute("data-compat-preview") ?? "", title: (c.textContent ?? "").trim() }))

async function run(name) {
  const compat = await importedTheme({ store: true })
  const sent = PUSHES[name]()
  /* What the files route answers: the kept file, or nothing new when it refuses (the push still delivered, for the one-line case). */
  const answered = {}
  const verdicts = {}
  for (const [p, text] of Object.entries(sent)) {
    const kept = serverKeeps(p, text, compat.sources[p])
    verdicts[p] = kept.refused ? `refused: ${kept.refused[0]}` : "kept"
    answered[p] = name === "one-line" ? text : kept.text
    if (name !== "one-line") assert(kept.text, `${p}: the server refuses this push (${kept.refused})`)
  }
  const ed = await openEditor({ kind: "imported", bundle, css, compat, globals: GLOBALS, settle: 1500 })
  try {
    for (let i = 0; i < 60; i++) {
      const ok = await ed.js(() => {
        if (document.querySelector("[data-section-library-layer][data-state='open'] [data-library-card]")) return true
        ;(document.querySelector("[data-section-group='template'] [data-add-section]") ?? document.querySelector("[data-add-section]"))?.click()
        return false
      })
      if (ok) break
      await sleep(250)
    }
    await sleep(1200)
    const before = await ed.js(CARDS)
    await ed.page.evaluate((p) => Object.assign(window.PROBE_COMPAT.sources, p), answered)
    await ed.js((paths) => {
      const a = window.PROBE_ACTIVITY
      let n = a.events[a.events.length - 1].id
      for (const path of paths) a.events.push({ agent_name: "GitHub · ada", path, action: "updated", id: ++n, created_at: new Date().toISOString() })
      a.syncAt = new Date().toISOString()
    }, Object.keys(answered))
    /* Landed: every file read, and the canvas (or the library) settled on it. */
    const t0 = Date.now()
    const want = Object.keys(answered).map((p) => `files?path=${encodeURIComponent(p)}`)
    while (Date.now() - t0 < 15_000) {
      const calls = await ed.js(() => window.probeCalls)
      if (want.every((w) => calls.some((c) => c.includes(w)))) break
      await sleep(250)
    }
    await sleep(2500)
    const after = await ed.js(CARDS)
    const front = await ed.front()
    const marks = front ? await front.evaluate((s) => document.querySelectorAll(`[data-push="${s}"]`).length, stamp) : -1
    const onPage = (compat.pages.home ?? []).filter((s) => Object.keys(answered).includes(`sections/${s.type}.storelib`)).length
    return { name, before, after, marks, onPage, verdicts, errors: ed.errors }
  } finally {
    await ed.close()
  }
}

let failed = 0
const check = (ok, line) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`); if (!ok) failed++ }
for (const name of CASES) {
  const r = await run(name)
  const types = (list) => [...new Set(list.map((c) => c.type))].sort()
  console.log(`\n${name}: ${r.before.length} cards before, ${r.after.length} after`)
  for (const [p, v] of Object.entries(r.verdicts)) console.log(`        server: ${p} ${v}`)
  const lost = types(r.before).filter((t) => !types(r.after).includes(t))
  if (name === "markup") {
    check(r.after.length === r.before.length && !lost.length, `every card stays (${r.before.length} to ${r.after.length}${lost.length ? `, lost ${lost.join(", ")}` : ""})`)
    check(r.marks === r.onPage && r.onPage > 0, `the edit is in the canvas: ${r.marks} marks for ${r.onPage} pushed sections on the page`)
  } else if (name === "schema") {
    check(r.after.length === r.before.length + 1 && !lost.length, `one more card, none lost (${r.before.length} to ${r.after.length}${lost.length ? `, lost ${lost.join(", ")}` : ""})`)
    check(r.after.some((c) => c.type === "image-text" && c.title.includes("Image beside text")), "the renamed section's card has its new name")
    check(r.after.some((c) => c.type === "rich-text" && c.title.includes("Rich text, short")), "the new preset is a card")
  } else {
    check(Object.values(r.verdicts).every((v) => v.startsWith("refused")), "the files route refuses every one of these files")
    console.log(`        delivered anyway, the editor leaves out ${lost.length}: ${lost.join(", ") || "none"} (${PUSHED.map(typeOf).join(", ")} pushed)`)
  }
  if (r.errors.length) check(false, `page errors: ${r.errors.slice(0, 3).join(" | ")}`)
}
console.log(failed ? `\n${failed} failed` : "\nAll held")
process.exit(failed ? 1 : 0)
