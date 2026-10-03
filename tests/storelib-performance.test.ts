/**
 * ===========================================================================
 *  A REAL PAGE, MEASURED
 * ===========================================================================
 * Thirty sections, several of them the same type twice over, a hundred and
 * more blocks between them, container queries, keyframes and images. That is
 * a page somebody would actually build, and the numbers below are what it
 * costs to compile and render it.
 *
 * The two that matter:
 *
 *   A FIRST COMPILE is per distinct FILE, not per section on the page. Two
 *   heroes are one compile and two renders.
 *
 *   CHANGING ONE SETTING RE-RENDERS ONE SECTION. Nothing recompiles, because
 *   the file did not change, and nothing else on the page is touched. If that
 *   ever stops being true, a page with thirty sections types at a crawl.
 *
 * Budgets are deliberately loose: this is a guard against an order of
 * magnitude, not a benchmark to tune against. A CI box is not a laptop.
 */
import { readFileSync, readdirSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { join } from "node:path"
import { createCompileCache, renderSection, compileSection } from "../lib/storelib-theme"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { toInstanceData } from "@/lib/website-builder/storelib-runtime"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const DIR = join(process.cwd(), "themes/default/sections")
const sources: Record<string, string> = {}
for (const f of readdirSync(DIR).filter((n) => n.endsWith(".storelib"))) {
  sources[f.replace(/\.storelib$/, "")] = readFileSync(join(DIR, f), "utf8")
}

/** One section as Add Section would put it on a page, with its preset blocks. */
function instance(type: string, n: number, extraBlocks = 0): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  const preset = schema.presets?.[0]
  Object.assign(settings, preset?.settings ?? {})
  const blocks = (preset?.blocks ?? []).map((b, i) => ({ id: `${type}-${n}-b${i}`, type: b.type, settings: { ...(b.settings ?? {}) } }))
  const blockType = (schema.blocks ?? [])[0]?.type
  if (blockType) {
    for (let i = 0; i < extraBlocks; i++) {
      const bs: Record<string, unknown> = {}
      for (const f of (schema.blocks ?? [])[0].fields ?? []) if (f.default !== undefined) bs[f.id] = f.default
      blocks.push({ id: `${type}-${n}-x${i}`, type: blockType, settings: bs })
    }
  }
  return { id: `${type}-${n}`, type, name: schema.name, settings, blocks }
}

/**
 * Thirty sections, with duplicates: the first fifteen types appear twice, so
 * the page has thirty sections drawn from fifteen files. Blocks are piled onto
 * every section that takes them until the page is past a hundred.
 */
function buildPage(): SectionInstance[] {
  const withBlocks = ADDABLE_SECTIONS.filter((t) => (SECTION_SCHEMAS[t].blocks ?? []).length > 0)
  const types = [...ADDABLE_SECTIONS.slice(0, 15), ...ADDABLE_SECTIONS.slice(0, 15)]
  return types.map((t, i) => instance(t, i, withBlocks.includes(t) ? 6 : 0))
}

function ms(fn: () => void): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

async function main() {
  const page = buildPage()
  const blockCount = page.reduce((n, s) => n + (s.blocks?.length ?? 0), 0)
  const distinctTypes = new Set(page.map((s) => s.type)).size

  section(`A page of ${page.length} sections, ${distinctTypes} distinct types, ${blockCount} blocks`)
  check("the page is the size it claims to be", page.length === 30 && blockCount >= 100 && distinctTypes < page.length, `${page.length} sections, ${blockCount} blocks, ${distinctTypes} types`)

  // ── Compiling ────────────────────────────────────────────────────────────
  const cache = createCompileCache()
  const compiled = new Map<string, ReturnType<typeof compileSection>>()
  const compileAll = () => {
    for (const s of page) {
      if (compiled.has(s.type)) continue
      compiled.set(s.type, cache.compile(sources[s.type], { file: `sections/${s.type}.storelib` }))
    }
  }
  const cold = ms(compileAll)
  check(`every distinct file compiled once, in ${cold.toFixed(0)}ms`, [...compiled.values()].every((c) => c.ok === true) && cache.size === distinctTypes, `cache holds ${cache.size}`)
  check("compiling is under a second for the whole page", cold < 1000, `${cold.toFixed(0)}ms`)

  // A second pass touches no compiler at all: same text, same entry.
  const warm = ms(() => { for (const s of page) cache.compile(sources[s.type], { file: `sections/${s.type}.storelib` }) })
  check(`re-reading all ${page.length} sections is free (${warm.toFixed(1)}ms)`, warm < cold / 2, `${warm.toFixed(1)}ms against ${cold.toFixed(0)}ms cold`)

  // ── Rendering ────────────────────────────────────────────────────────────
  let html = ""
  let css = ""
  const renderAll = () => {
    html = ""
    css = ""
    for (const s of page) {
      const c = compiled.get(s.type)!
      if (c.ok === false) continue
      // Through the adapter, so blocks are keyed by id as the engine holds
      // them rather than by position: see tests/storelib-blocks.test.ts.
      const r = renderSection({
        compiled: c.value, id: s.id,
        instance: toInstanceData(s), theme: {}, page: { template: "index" },
      })
      html += r.html
      css += r.css
    }
  }
  const draw = ms(renderAll)
  check(`the whole page renders in ${draw.toFixed(0)}ms`, draw < 1000, `${draw.toFixed(0)}ms`)
  const gz = (t: string) => gzipSync(t).length
  console.log(`        ${(html.length / 1024).toFixed(0)}KB of HTML (${(gz(html) / 1024).toFixed(0)}KB gzipped), ${(css.length / 1024).toFixed(0)}KB of CSS (${(gz(css) / 1024).toFixed(0)}KB gzipped)`)
  check("the HTML it produces is a page, not a fragment", html.length > 50_000)
  /**
   * SCOPED CSS MEANS A PAGE WITH TWO HEROES CARRIES TWO HERO STYLESHEETS.
   * That is the cost of the design, and it is worth knowing the size of it:
   * measured on this page, 127KB of CSS raw against 64KB if each type could
   * ship once. On the wire, after gzip, that difference is about 3KB, because
   * the duplicate is a byte-for-byte repeat and that is exactly what gzip is
   * good at. So the budget here is on what is actually sent, and the raw
   * figure is printed rather than asserted.
   *
   * The saving is only available to a section whose CSS reads no setting, and
   * on this page that is none of the thirty: every one of them interpolates
   * its own padding or colour. A per-type stylesheet would mean splitting
   * each file's CSS into the static half and the interpolated half, which is
   * a real change to make when the wire cost justifies it, and 3KB does not.
   */
  check("what is actually sent stays small", gz(css) < 64 * 1024, `${(gz(css) / 1024).toFixed(0)}KB gzipped`)

  // ── One setting changes ──────────────────────────────────────────────────
  section("Changing one setting")
  {
    let compiles = 0
    const counting = createCompileCache()
    const wrap = (type: string) => { compiles++; return counting.compile(sources[type], { file: `sections/${type}.storelib` }) }
    for (const s of page) wrap(s.type)
    const before = compiles

    // What the editor does when somebody types in a field: the section's
    // settings change, the file does not.
    const target = page[7]
    const edited = { ...target, settings: { ...target.settings, heading: "Changed" } }
    const c = counting.compile(sources[edited.type], { file: `sections/${edited.type}.storelib` })
    /**
     * ═══════════════════════════════════════════════════════════════════
     *  THE MEDIAN OF NINE, NOT ONE SHOT
     * ═══════════════════════════════════════════════════════════════════
     * This timed a single render of about two milliseconds and compared it
     * to a single render of thirty. Two milliseconds is short enough that a
     * garbage collection, another process on the machine or a cold branch
     * predictor doubles it, so the check failed on perhaps half of the runs
     * on a busy machine — at 2.02, 2.54 and 2.34ms against a bar of 1.9 —
     * and passed on the quiet ones.
     *
     * A test that fails half the time is worse than no test: it is read as
     * noise, and the run it is really trying to tell you about is read as
     * noise too. The claim is not about any one render, so the measurement
     * should not be either. Nine, and the middle one, which is the number a
     * single outlier cannot move.
     */
    const runs: number[] = []
    for (let i = 0; i < 9; i++) {
      runs.push(ms(() => {
        if (c.ok === false) return
        renderSection({ compiled: c.value, id: edited.id, instance: toInstanceData(edited), theme: {}, page: { template: "index" } })
      }))
    }
    runs.sort((a, b) => a - b)
    const one = runs[Math.floor(runs.length / 2)]
    check("nothing recompiles, because no file changed", counting.size === distinctTypes, `${counting.size} entries after ${before} lookups`)
    check(`and one section redraws in ${one.toFixed(2)}ms`, one < draw / 10,
      `${one.toFixed(2)}ms median of ${runs.length}, ${runs[0].toFixed(2)} to ${runs[runs.length - 1].toFixed(2)}, against ${draw.toFixed(0)}ms for all thirty`)
  }

  // ── One FILE changes ─────────────────────────────────────────────────────
  section("Changing one file in the code editor")
  {
    const cache2 = createCompileCache()
    for (const s of page) cache2.compile(sources[s.type], { file: `sections/${s.type}.storelib` })
    const sizeBefore = cache2.size
    const type = page[0].type
    const editedSource = sources[type].replace("<template>", "<template>\n<!-- edited -->")
    cache2.compile(editedSource, { file: `sections/${type}.storelib` })
    check("the edited file is a new entry and the rest are untouched", cache2.size === sizeBefore + 1, `${cache2.size} against ${sizeBefore}`)
    /**
     * The cache is keyed by the file's text, so every keystroke in the code
     * editor is a new entry. That is why it is bounded: see createLru.
     */
    const bounded = createCompileCache(8)
    for (let i = 0; i < 40; i++) bounded.compile(`${sources[type]}\n<!-- ${i} -->`, { file: "sections/x.storelib" })
    check("and forty edits in a row do not grow it without limit", bounded.size <= 8, `${bounded.size} entries`)
  }

  // ── The block-heaviest section on its own ────────────────────────────────
  section("One section with a hundred blocks")
  {
    const type = ADDABLE_SECTIONS.find((t) => (SECTION_SCHEMAS[t].blocks ?? []).length > 0)!
    const big = instance(type, 99, 100)
    const c = compileSection(sources[type], { file: `sections/${type}.storelib` })
    check("it compiles", c.ok === true)
    if (c.ok === true) {
      const t = ms(() => {
        renderSection({ compiled: c.value, id: big.id, instance: toInstanceData(big), theme: {}, page: { template: "index" } })
      })
      check(`${big.blocks?.length} blocks render in ${t.toFixed(0)}ms`, t < 500, `${t.toFixed(0)}ms`)
      const r = renderSection({ compiled: c.value, id: big.id, instance: toInstanceData(big), theme: {}, page: { template: "index" } })
      /**
       * One stylesheet for the section, however many blocks are in it. A
       * per-block stylesheet is the mistake that turns a long FAQ into a
       * megabyte of CSS, so it is worth holding to.
       */
      /* Measured against the same section with one block: the product grid's
         stylesheet carries the shop's filters too, so a fixed size says less
         than the comparison does. The ceiling still catches a runaway. */
      const one = renderSection({ compiled: c.value, id: big.id, instance: toInstanceData(instance(type, 1, 1)), theme: {}, page: { template: "index" } })
      check("and the section's CSS does not grow with its blocks", r.css.length === one.css.length && r.css.length < 16_000, `${(r.css.length / 1024).toFixed(1)}KB with ${big.blocks?.length} blocks, ${(one.css.length / 1024).toFixed(1)}KB with one`)
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
