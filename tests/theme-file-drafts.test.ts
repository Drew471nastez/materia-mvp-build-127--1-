/**
 * ===========================================================================
 *  A SECTION FILE WAITS FOR PUBLISH, AND EVERY SAVE IS KEPT
 * ===========================================================================
 * A section's settings already waited: they sit in `draft_sections` until
 * somebody publishes. A section's CODE went live the second it was saved, so
 * there was no way to work on a section without shipping it, and nothing was
 * kept, so a mistake made at eleven could not be undone at noon.
 *
 * The database half is driven here against a stub that behaves like the real
 * one in both worlds: with the migration run, and without it. The second case
 * is not hypothetical — the SQL is run by hand, so every route has to work
 * before somebody has opened the SQL editor, and "works, worse" is the only
 * acceptable answer.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  editorContent,
  hasUnpublishedEdit,
  listVersions,
  promoteFileDrafts,
  recordVersion,
  saveDraft,
} from "@/lib/website-builder/theme-file-drafts"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

interface Row { install_id: string; path: string; content: string; draft_content: string | null; updated_at: string }
interface Version { id: string; install_id: string; path: string; content: string; kind: string; created_at: string }

/**
 * Enough Supabase to drive these four functions, and honest about the one
 * thing that matters: when `drafts` is false it rejects `draft_content` the
 * way Postgres does, and when `versions` is false the table is not there.
 */
function db(opts: { drafts: boolean; versions: boolean }) {
  const files: Row[] = []
  const versions: Version[] = []
  let seq = 0
  const err = (message: string) => ({ data: null, error: { message } })

  const api = {
    files,
    versions,
    from(table: string) {
      if (table === "store_theme_custom_files") {
        return {
          upsert(row: Record<string, unknown>) {
            if ("draft_content" in row && !opts.drafts) {
              return { select: () => ({ single: () => Promise.resolve(err('column "draft_content" of relation "store_theme_custom_files" does not exist')) }) }
            }
            const found = files.find((f) => f.install_id === row.install_id && f.path === row.path)
            const next: Row = found ?? { install_id: String(row.install_id), path: String(row.path), content: "", draft_content: null, updated_at: "" }
            if ("content" in row) next.content = String(row.content)
            if ("draft_content" in row) next.draft_content = row.draft_content === null ? null : String(row.draft_content)
            next.updated_at = new Date(Date.now() + ++seq).toISOString()
            if (!found) files.push(next)
            return { select: () => ({ single: () => Promise.resolve({ data: { ...next }, error: null }) }) }
          },
          select(cols: string) {
            if (cols.includes("draft_content") && !opts.drafts) {
              const rejected = { data: null, error: { message: 'column store_theme_custom_files.draft_content does not exist' } }
              const chain: Record<string, unknown> = {}
              const self = () => chain
              Object.assign(chain, { eq: self, not: self, like: self, maybeSingle: () => Promise.resolve(rejected), then: (r: (v: unknown) => void) => r(rejected) })
              return chain
            }
            let rows = files.slice()
            const chain = {
              eq(col: string, val: string) { rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val); return chain },
              not(col: string, _op: string, _v: unknown) { rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] !== null); return chain },
              like() { return chain },
              maybeSingle: () => Promise.resolve({ data: rows[0] ? { ...rows[0] } : null, error: null }),
              then: (resolve: (v: unknown) => void) => resolve({ data: rows.map((r) => ({ ...r })), error: null }),
            }
            return chain
          },
          /**
           * UPDATE, then SELECT, the way `saveDraft` asks for it. An update
           * that matches nothing answers with no row and no error, which is
           * how it learns the file does not exist yet.
           */
          update(patch: Record<string, unknown>) {
            let rows = files.slice()
            const apply = () => { for (const r of rows) Object.assign(r, patch) }
            const rejected = { data: null, error: { message: 'column "draft_content" of relation "store_theme_custom_files" does not exist' } }
            const blocked = "draft_content" in patch && !opts.drafts
            const chain: Record<string, unknown> = {}
            Object.assign(chain, {
              eq(col: string, val: string) {
                rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)
                return chain
              },
              select: () => chain,
              maybeSingle: () => {
                if (blocked) return Promise.resolve(rejected)
                apply()
                return Promise.resolve({ data: rows[0] ? { ...rows[0] } : null, error: null })
              },
              single: () => {
                if (blocked) return Promise.resolve(rejected)
                if (!rows[0]) return Promise.resolve(err("no rows returned"))
                apply()
                return Promise.resolve({ data: { ...rows[0] }, error: null })
              },
              then: (resolve: (v: unknown) => void) => {
                if (blocked) return resolve(rejected)
                apply()
                resolve({ data: null, error: null })
              },
            })
            return chain
          },
          /**
           * INSERT, and the constraint that made this bug. `content` is
           * `not null` in the real table, and an insert without one is
           * exactly what the old `upsert({ draft_content })` became when the
           * file did not exist yet.
           */
          insert(row: Record<string, unknown>) {
            const settle = () => {
              if ("draft_content" in row && !opts.drafts) {
                return Promise.resolve(err('column "draft_content" of relation "store_theme_custom_files" does not exist'))
              }
              const clash = files.find((f) => f.install_id === row.install_id && f.path === row.path)
              if (clash) return Promise.resolve(err('duplicate key value violates unique constraint "store_theme_custom_files_install_path_key"'))
              if (typeof row.content !== "string") {
                return Promise.resolve(err('null value in column "content" of relation "store_theme_custom_files" violates not-null constraint'))
              }
              const next: Row = {
                install_id: String(row.install_id),
                path: String(row.path),
                content: String(row.content),
                draft_content: row.draft_content === null || row.draft_content === undefined ? null : String(row.draft_content),
                updated_at: new Date(Date.now() + ++seq).toISOString(),
              }
              files.push(next)
              return Promise.resolve({ data: { ...next }, error: null })
            }
            return { select: () => ({ single: settle, maybeSingle: settle }) }
          },
        }
      }
      if (table === "store_theme_file_versions") {
        if (!opts.versions) {
          const gone = { data: null, error: { message: 'relation "public.store_theme_file_versions" does not exist' } }
          const chain: Record<string, unknown> = {}
          const self = () => chain
          Object.assign(chain, { eq: self, order: self, limit: self, range: self, in: self, then: (r: (v: unknown) => void) => r(gone) })
          return { insert: () => Promise.resolve(gone), select: self, delete: self }
        }
        return {
          insert(row: Record<string, unknown>) {
            versions.push({ id: `v${++seq}`, install_id: String(row.install_id), path: String(row.path), content: String(row.content), kind: String(row.kind), created_at: new Date(Date.now() + seq).toISOString() })
            return Promise.resolve({ data: null, error: null })
          },
          select() {
            let rows = versions.slice()
            const chain = {
              eq(col: string, val: string) { rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val); return chain },
              order() { rows = rows.slice().reverse(); return chain },
              limit(n: number) { rows = rows.slice(0, n); return chain },
              range(from: number, to: number) { rows = rows.slice(from, to + 1); return chain },
              then: (resolve: (v: unknown) => void) => resolve({ data: rows.map((r) => ({ ...r })), error: null }),
            }
            return chain
          },
          delete() {
            const chain = {
              in(_col: string, ids: string[]) {
                for (const id of ids) {
                  const at = versions.findIndex((v) => v.id === id)
                  if (at !== -1) versions.splice(at, 1)
                }
                return chain
              },
              then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
            }
            return chain
          },
        }
      }
      throw new Error(`no stub for ${table}`)
    },
  }
  return api
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("With the migration run: saving does not change the live site")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const d = db({ drafts: true, versions: true })
    await saveDraft(d as never, "i1", "sections/faq.storelib", "LIVE")
    await promoteFileDrafts(d as never, "i1")
    const live = d.files[0].content
    const save = await saveDraft(d as never, "i1", "sections/faq.storelib", "EDITED")
    check("a save reports that it was drafted", save.ok === true && save.drafts === true)
    check("and the live half is untouched by it", d.files[0].content === live && live === "LIVE")
    check("while the editor is shown the edit", editorContent(d.files[0]) === "EDITED")
    check("and the file reads as having something unpublished", hasUnpublishedEdit(d.files[0]))

    const moved = await promoteFileDrafts(d as never, "i1")
    check("publishing moves it across", moved === 1 && d.files[0].content === "EDITED")
    check("and clears the draft, so nothing is pending twice", d.files[0].draft_content === null && !hasUnpublishedEdit(d.files[0]))
    check("a second publish with nothing waiting moves nothing", (await promoteFileDrafts(d as never, "i1")) === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every save is kept")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const d = db({ drafts: true, versions: true })
    for (const text of ["one", "two", "three"]) {
      await saveDraft(d as never, "i1", "sections/a.storelib", text)
      await recordVersion(d as never, "i1", "sections/a.storelib", text, "save")
    }
    const list = await listVersions(d as never, "i1", "sections/a.storelib")
    check("three saves are three versions", list.length === 3)
    check("newest first", list[0].content === "three" && list[2].content === "one")
    check("a publish is recorded as one too", (async () => true)() !== null && (await (async () => {
      await promoteFileDrafts(d as never, "i1")
      const after = await listVersions(d as never, "i1", "sections/a.storelib")
      return after[0].kind === "publish"
    })()))
    check("another file's history is its own", (await listVersions(d as never, "i1", "sections/b.storelib")).length === 0)

    // Bounded: a file saved on every keystroke cannot fill the table.
    const many = db({ drafts: true, versions: true })
    for (let i = 0; i < 70; i++) await recordVersion(many as never, "i1", "sections/c.storelib", `v${i}`, "save")
    check("and it is trimmed, so it cannot grow without limit", many.versions.length <= 50, `${many.versions.length} rows`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Before the migration has run, everything still works")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * The SQL is run by hand in the Supabase editor, so there is a window where
   * the code is deployed and the columns are not. Saving has to keep working
   * through it, and it has to be honest that the save went live.
   */
  {
    const d = db({ drafts: false, versions: false })
    const save = await saveDraft(d as never, "i1", "sections/faq.storelib", "EDITED")
    check("the save lands", save.ok === true)
    check("in the live half, because there is nowhere else for it to go", d.files[0]?.content === "EDITED")
    check("and it says so, so the editor does not claim it is waiting", save.ok === true && save.drafts === false)
    check("recording a version fails quietly rather than failing the save", (await recordVersion(d as never, "i1", "sections/faq.storelib", "EDITED")) === false)
    check("the history reads as empty rather than throwing", (await listVersions(d as never, "i1", "sections/faq.storelib")).length === 0)
    check("and publishing moves nothing and does not throw", (await promoteFileDrafts(d as never, "i1")) === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The wiring, in the routes that use it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const root = process.cwd()
    /* The route delegates its save to the module the agent API shares. */
    const files =
      readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8") +
      readFileSync(join(root, "lib/website-builder/save-theme-file.ts"), "utf8")
    const publish = readFileSync(join(root, "app/api/website-builder/themes/[installId]/publish/route.ts"), "utf8")
    const storefront = readFileSync(join(root, "lib/website-builder/storefront-render.ts"), "utf8")
    const codePage = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
    const sql = readFileSync(join(root, "supabase/sql/RUN_THEME_FILE_DRAFTS.sql"), "utf8")

    check("saving goes through the draft half", /const saved = await saveDraft\(db, installId, path, content\)/.test(files) && /saveThemeFile\(/.test(files))
    check("and records a version", /await recordVersion\(db, installId, path, content, "save"\)/.test(files))
    check("publishing promotes the drafts, beside the sections it already promoted", /await promoteFileDrafts\(admin, installId\)/.test(publish) && publish.indexOf("await promoteFileDrafts(admin, installId)") > publish.indexOf("draft_sections: null"))
    /**
     * The one that keeps the whole thing meaningful: a visitor reads
     * `content` and nothing else. If the storefront ever read the draft, a
     * half-written section would be live again and none of the above would
     * matter.
     */
    check("a visitor is never shown a draft", /\.select\("path, content"\)/.test(storefront) && !/draft_content/.test(storefront))
    // The loop became `sourceMap`, which is the same rule in one place plus
    // one more: a row with nothing in either half is not a source at all.
    check("but the editor's canvas is", /select\("path, content, draft_content"\)/.test(files) && /const files = sourceMap\(/.test(files))
    check("the editor says when a file is saved and not yet live", /Not published yet/.test(codePage) && /setUnpublished\(saved\?\.drafted !== false\)/.test(codePage))
    check("and says the other thing when there is no draft column yet", /saved\?\.drafted === false \? "Saved and live"/.test(codePage))
    check("restoring an old version goes back out through the editor, not around it", /handleContentChange\(v\.content\)/.test(codePage) && /toast\.success\("Loaded\. Save to keep it\."\)/.test(codePage))
    check("the migration is idempotent and additive", /add column if not exists draft_content/.test(sql) && /create table if not exists public\.store_theme_file_versions/.test(sql))
    check("and the history is only readable by whoever owns the install", /enable row level security/.test(sql) && (sql.match(/c\.user_id = auth\.uid\(\)/g) ?? []).length >= 3)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
