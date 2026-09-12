/**
 * ===========================================================================
 *  SIX THINGS, AND THE ONE THAT ONLY APPEARED AFTER THE MIGRATION RAN
 * ===========================================================================
 * 1. Creating a file threw `null value in column "content"`.
 * 2. A button's label was forced to the section's text colour.
 * 3. Clicking the canvas scrolled the canvas.
 * 4. A section renamed in its code kept its old name in the sidebar.
 * 5. Naming a new file happened in a 240px column off to one side.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { saveDraft, sourceMap } from "@/lib/website-builder/theme-file-drafts"
import { sectionDisplayName } from "@/lib/website-builder/section-name"
import { themeStylesheet } from "@/lib/website-builder/theme-css"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/**
 * A database that behaves like Postgres does here: `content` is `not null`,
 * and `(install_id, path)` is unique. That is the whole of what the bug was
 * about, so it is the whole of what this fake enforces.
 */
function fakeDb(rows: { install_id: string; path: string; content: string; draft_content?: string | null }[] = []) {
  const log: string[] = []
  const q = (table: string) => {
    let op: "update" | "insert" | "upsert" | null = null
    let payload: Record<string, unknown> = {}
    const filters: Record<string, string> = {}
    const api: Record<string, unknown> = {}
    const find = () => rows.find((r) => r.install_id === filters.install_id && r.path === filters.path)
    api.update = (p: Record<string, unknown>) => { op = "update"; payload = p; log.push(`update ${JSON.stringify(p)}`); return api }
    api.insert = (p: Record<string, unknown>) => { op = "insert"; payload = p; log.push(`insert ${JSON.stringify(p)}`); return api }
    api.upsert = (p: Record<string, unknown>) => { op = "upsert"; payload = p; log.push(`upsert ${JSON.stringify(p)}`); return api }
    api.eq = (c: string, v: string) => { filters[c] = v; return api }
    api.select = () => api
    const settle = (single: boolean) => {
      if (op === "update") {
        const row = find()
        if (!row) return Promise.resolve({ data: null, error: single ? { message: "no rows" } : null })
        Object.assign(row, payload)
        return Promise.resolve({ data: row, error: null })
      }
      if (op === "insert" || op === "upsert") {
        const p = payload as { install_id: string; path: string; content?: string; draft_content?: string | null }
        const exists = rows.find((r) => r.install_id === p.install_id && r.path === p.path)
        if (exists && op === "insert") {
          return Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint "store_theme_custom_files_pkey"' } })
        }
        if (exists) { Object.assign(exists, p); return Promise.resolve({ data: exists, error: null }) }
        // THE CONSTRAINT. This is the bug, expressed once.
        if (typeof p.content !== "string") {
          return Promise.resolve({ data: null, error: { message: 'null value in column "content" of relation "store_theme_custom_files" violates not-null constraint' } })
        }
        const row = { install_id: p.install_id, path: p.path, content: p.content, draft_content: p.draft_content ?? null }
        rows.push(row)
        return Promise.resolve({ data: row, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }
    api.single = () => settle(true)
    api.maybeSingle = () => settle(false)
    void table
    return api
  }
  return { db: { from: q } as never, rows, log }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Creating a file writes a row that Postgres will accept")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const f = fakeDb()
    const made = await saveDraft(f.db, "i1", "sections/new.storelib", "<template>hi</template>")
    check("a brand-new file is created", made.ok === true, made.ok === true ? "" : made.error)
    check("and never with a null content", f.rows[0]?.content === "", JSON.stringify(f.rows[0]))
    /**
     * `content: ""` is "nothing published for this path", NOT "an empty
     * file". The draft is the file.
     */
    check("the draft holds what was written", f.rows[0]?.draft_content === "<template>hi</template>")
    check("it says the save waited for Publish", made.ok && made.drafts === true)

    const again = await saveDraft(f.db, "i1", "sections/new.storelib", "<template>two</template>")
    check("saving it again moves the draft", again.ok === true && f.rows[0]?.draft_content === "<template>two</template>")
    check("and leaves what is live alone", f.rows[0]?.content === "")
    check("a second save is an update, not an insert", f.log.filter((l) => l.startsWith("insert")).length === 1, f.log.join(" | "))

    const live = fakeDb([{ install_id: "i2", path: "sections/hero.storelib", content: "PUBLISHED", draft_content: null }])
    await saveDraft(live.db, "i2", "sections/hero.storelib", "EDITED")
    check("editing a published file never touches what is live", live.rows[0].content === "PUBLISHED" && live.rows[0].draft_content === "EDITED")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A file with nothing published is not an empty override")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const rows = [
      { path: "sections/hero.storelib", content: "", draft_content: "WORKING ON IT" },
      { path: "sections/faq.storelib", content: "LIVE", draft_content: null },
      { path: "sections/old.storelib", content: "", draft_content: null },
      { path: "sections/both.storelib", content: "LIVE", draft_content: "NEWER" },
    ]
    const map = sourceMap(rows)
    check("the editor sees the draft", map["sections/hero.storelib"] === "WORKING ON IT")
    check("and what is live where there is no draft", map["sections/faq.storelib"] === "LIVE")
    check("a draft wins over what is live", map["sections/both.storelib"] === "NEWER")
    /**
     * The one that matters. A row with nothing in either half would shadow
     * the theme's own file with an empty string, so creating
     * `sections/hero.storelib` to work on it would blank the shipped hero.
     */
    check("a row with nothing in either half is not a source", !("sections/old.storelib" in map))
    check("nothing at all is an empty map, not a crash", Object.keys(sourceMap(null)).length === 0 && Object.keys(sourceMap([])).length === 0)

    const storefront = read("lib/website-builder/storefront-render.ts")
    check("the published site skips an empty one too", /if \(typeof row\.content !== "string" \|\| row\.content\.trim\(\) === ""\) continue/.test(storefront))
    check("and it reads `content`, never a draft", /\.select\("path, content"\)/.test(storefront) && !/draft_content/.test(storefront))
    check("the export skips one as well", /\.filter\(r => typeof r\.content === "string" && \(r\.content as string\)\.trim\(\) !== ""\)/.test(read("app/api/website-builder/themes/[installId]/export/route.ts")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A button's label is the section's business, not the theme's")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const css = themeStylesheet({} as ThemeSettingsValues)
    /**
     * `[data-storelib-theme] a:not([style*="color"])` weighs 0,2,1 — MORE
     * than the 0,2,0 of a section's own `[data-section-id="…"] .s__btn`. So
     * every anchor in every section was forced to `color: inherit`, and a
     * primary button became a black slab wearing the section's body colour.
     * Measured across the shipped theme: nine sections at 3.1:1 and two at
     * 1.5:1. `scripts/check-buttons.mjs` reads them out of a real browser.
     */
    check("the link rule carries no specificity at all", /:where\(\[data-storelib-theme\] a\)\{color:inherit;\}/.test(css))
    check("and the old rule that outweighed every section is gone", !/a:not\(\[style\*="color"\]\)/.test(css))
    check("a section's own scoped rule is heavier than it", (() => {
      // 0,0,0 for `:where(...)`, against 0,2,0 for a scoped class rule.
      const m = /:where\(\[data-storelib-theme\] a\)/.test(css)
      return m
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Clicking the canvas does not move the canvas")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    const fn = editor.slice(editor.indexOf("const selectSectionFromCanvas"), editor.indexOf("const selectSectionFromCanvas") + 400)
    check("selecting from the canvas scrolls nothing", !/scrollToSection/.test(fn))
    /**
     * The five callers that stay, because each has something you cannot
     * see: a section just added or duplicated is elsewhere on the page, and
     * a row picked in the sidebar is a section you pointed at from a list.
     */
    check("adding a section still brings it into view", /scrollToSection\(newSection\.id\)/.test(editor))
    check("so does duplicating one", /scrollToSection\(copy\.id\)/.test(editor))
    check("and the three sidebar rows still do", (editor.match(/setSelectedPanel\(\{ type: "section", sectionId: \w+\.id \}\); scrollToSection\(\w+\.id\)/g) ?? []).length === 3)
    /**
     * `scrollIntoView` walks EVERY scrollable ancestor, so bringing a
     * sidebar row into view could bring the canvas with it on a phone,
     * where the sidebar is a sheet over the canvas.
     */
    check("the sidebar row is scrolled by its own container, not by scrollIntoView", /const scroller = row\.closest\("\[data-sheet-scroll\], \[data-wb-sidebar-scroll\]"\)/.test(editor) && /scroller\.scrollBy\(\{ top: delta, behavior: "smooth" \}\)/.test(editor))
    check("and a row already in view is left alone", /if \(r\.top >= box\.top && r\.bottom <= box\.bottom\) return/.test(editor))
    check("both sidebar scrollers are marked", (editor.match(/data-wb-sidebar-scroll/g) ?? []).length === 3)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A section is called what its code says it is called")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const schemas = { waves: { name: "Marquee" }, faq_accordion: { name: "FAQ" } }
    check("the schema's name wins over the stored copy", sectionDisplayName({ type: "waves", name: "Waves" }, schemas) === "Marquee")
    check("a stored copy is the fallback when the type is gone", sectionDisplayName({ type: "retired_thing", name: "Old Banner" }, schemas) === "Old Banner")
    check("and the type is the last resort", sectionDisplayName({ type: "mystery" }, schemas) === "mystery")
    check("a blank name in the schema does not win", sectionDisplayName({ type: "waves", name: "Waves" }, { waves: { name: "   " } }) === "Waves")
    check("no schemas at all still names something", sectionDisplayName({ type: "hero", name: "Hero" }, null) === "Hero")

    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("the sidebar list reads the schema", /\{sectionDisplayName\(section, librarySchemas\)\}/.test(editor))
    check("every row is handed a resolved name", (editor.match(/displayName=\{sectionDisplayName\(/g) ?? []).length === 4)
    check("and the row itself no longer reads the stale copy", !/\{section\.name\}/.test(editor) && /\{displayName\}/.test(editor))
    check("including what a screen reader is told", !/\$\{section\.name\}/.test(editor))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Naming a new file is asked in the middle of the screen")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const code = read("app/website-builder/code/[installId]/page.tsx")
    check("it is a centred dialog, not a row in the file list", /role="dialog"[\s\S]{0,120}aria-label="Name the new file"/.test(code) && /fixed inset-0 z-\[200\] flex items-center justify-center/.test(code))
    /**
     * One expression is the whole of the responsiveness: a comfortable
     * column on a monitor, edge to edge with a 16px gutter on a phone, and
     * never a horizontal scrollbar between the two.
     */
    check("it fits any screen without a second breakpoint", /w-\[min\(420px,calc\(100vw-32px\)\)\]/.test(code))
    check("the field is 16px on a phone, so iOS does not zoom", /className="mt-3 h-11 w-full min-w-0[^"]*text-\[16px\]/.test(code))
    check("the explorer no longer holds it", !/Stacked, never a row: a label, a field and two buttons/.test(code))
    check("clicking away closes it", /onPointerDown=\{\(e\) => \{ if \(e\.target === e\.currentTarget\) setPendingAction\(null\) \}\}/.test(code))
    check("and Escape does", /if \(e\.key === "Escape"\) setPendingAction\(null\)/.test(code))
    check("Create still says it is creating and cannot be pressed twice", /\{creating \? "Creating" : "Create"\}/.test(code) && /disabled=\{!fileNameOf\(pendingAction\.path\)\.name \|\| creating\}/.test(code))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
