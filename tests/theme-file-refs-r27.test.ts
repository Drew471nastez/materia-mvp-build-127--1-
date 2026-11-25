/**
 * ===========================================================================
 *  A WEBSITE'S UNCHANGED THEME FILES, KEPT ONCE (round 27)
 * ===========================================================================
 * lib/website-builder/theme-file-refs.ts over an in-memory database that
 * behaves like the tables after supabase/sql/RUN_PENDING_ROUND_27.sql
 * (the blob_sha256 column, its copy-on-write trigger, theme_file_blobs), and
 * like the tables before it (no column: every query naming it fails).
 *
 *   OFF            the switch off: no query asks for the column, nothing is
 *                  resolved, a new website is full copies (today, exactly)
 *   SIDE BY SIDE   an old full-copy website and a new referencing one of the
 *                  same Materia template, read through the storefront's read
 *                  (compat-site installFiles, live and draft), the theme's
 *                  asset read (asset-serve readAssetRows) and the resolver:
 *                  the same files, to the character
 *   SAVINGS        the referencing website's rows hold a small part of the
 *                  text; a second one writes no new blobs
 *   COPY ON WRITE  an edit makes the file the creator's own; the other
 *                  website keeps the shared text; a draft is the creator's
 *   GATE           new websites are references only when every reader of
 *                  the table resolves (REMAINING_READERS empty); the list is
 *                  kept honest against the code
 *
 * Run with:  pnpm test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { composeTemplateFiles } from "@/lib/themes/template-packages"
import { convertTemplateFiles } from "@/lib/themes/template-install"
import { storeImportedTheme } from "@/lib/themes/imported-theme-store"
import {
  REFS_READERS_DONE,
  REF_MIN_CHARS,
  asReferenceRows,
  forgetHeldBlobs,
  forgetRefColumn,
  heldBlobCount,
  isRefRow,
  refReads,
  refWrites,
  resolveFileRows,
  sha256Text,
  withRefColumn,
} from "@/lib/website-builder/theme-file-refs"
import { installFiles } from "@/lib/website-builder/compat-site"
import { readAssetRows } from "@/lib/storelib-theme/compat/asset-serve"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)})`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

type Row = Record<string, unknown>
/* The tables in memory. `column`: whether RUN_PENDING_ROUND_27.sql has run (blob_sha256 and its trigger). */
function memoryDb(opts: { column: boolean }) {
  const tables: Record<string, Row[]> = { store_theme_installs: [], store_theme_settings: [], store_theme_pages: [], store_theme_custom_files: [], theme_file_blobs: [], themes: [{ id: "x" }] }
  const asked: string[] = []
  let ids = 0
  const client = {
    from(table: string) {
      let op: "select" | "insert" | "upsert" | "update" | "delete" = "select"
      let cols = "*"
      let payload: Row | Row[] | null = null
      let head = false
      let one = false
      const filters: ((r: Row) => boolean)[] = []
      let range: [number, number] | null = null
      let limit: number | null = null
      let orderBy: string | null = null
      const run = async () => {
        asked.push(`${op} ${table} ${cols}`)
        if (!opts.column && (/blob_sha256/.test(cols) || (Array.isArray(payload) ? payload : payload ? [payload] : []).some((r) => "blob_sha256" in r))) {
          return { data: null, error: { code: "42703", message: "column store_theme_custom_files.blob_sha256 does not exist" } }
        }
        const t = tables[table]
        if (op === "insert" || op === "upsert") {
          const list = (Array.isArray(payload) ? payload : [payload]) as Row[]
          for (const r of list) {
            if (table === "theme_file_blobs") {
              if (!t.some((x) => x.sha256 === r.sha256)) t.push({ ...r })
              continue
            }
            if (table === "store_theme_custom_files" && typeof r.blob_sha256 === "string" && !tables.theme_file_blobs.some((b) => b.sha256 === r.blob_sha256)) {
              return { data: null, error: { code: "23503", message: "violates foreign key store_theme_custom_files_blob_sha256_fkey" } }
            }
            t.push(table === "store_theme_installs" ? { id: `i${++ids}`, ...r } : { ...r })
          }
          return { data: table === "store_theme_installs" ? t[t.length - 1] : null, error: null }
        }
        if (op === "update") {
          for (const r of t.filter((x) => filters.every((f) => f(x)))) {
            const next = { ...r, ...(payload as Row) }
            /* The trigger store_theme_file_own_copy: content changed, the reference goes. */
            if (opts.column && table === "store_theme_custom_files" && next.content !== r.content) next.blob_sha256 = null
            Object.assign(r, next)
          }
          return { data: null, error: null }
        }
        if (op === "delete") {
          tables[table] = t.filter((x) => !filters.every((f) => f(x)))
          return { data: null, error: null }
        }
        let rows = t.filter((x) => filters.every((f) => f(x)))
        if (head) return { data: null, error: null, count: rows.length }
        if (orderBy) rows = [...rows].sort((a, b) => String(a[orderBy!]).localeCompare(String(b[orderBy!])))
        if (range) rows = rows.slice(range[0], range[1] + 1)
        if (limit !== null) rows = rows.slice(0, limit)
        const names = cols.split(",").map((c) => c.trim()).filter(Boolean)
        const pick = (r: Row) => (cols === "*" ? r : Object.fromEntries(names.map((n) => [n, r[n] ?? null])))
        if (table === "store_theme_installs" && one && !rows.length) return { data: { sort_order: 0 }, error: null }
        return { data: one ? (rows[0] ? pick(rows[0]) : null) : rows.map(pick), error: null }
      }
      const q: Record<string, unknown> = {
        select(c?: string, o?: { head?: boolean }) { if (op === "select") cols = c ?? "*"; if (o?.head) head = true; return q },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return q },
        in(k: string, vs: unknown[]) { filters.push((r) => vs.includes(r[k])); return q },
        like(k: string, pat: string) { const re = new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`); filters.push((r) => re.test(String(r[k]))); return q },
        or() { return q },
        order(k: string) { orderBy = k; return q },
        range(a: number, b: number) { range = [a, b]; return q },
        limit(n: number) { limit = n; return q },
        abortSignal() { return q },
        insert(p: Row | Row[]) { op = "insert"; payload = p; return q },
        upsert(p: Row | Row[]) { op = "upsert"; payload = p; return q },
        update(p: Row) { op = "update"; payload = p; return q },
        delete() { op = "delete"; return q },
        maybeSingle() { one = true; return run() },
        single() { one = true; return run() },
        then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) { return run().then(ok, bad) },
      }
      return q
    },
    storage: { from: () => ({ list: async () => ({ data: [], error: null }), upload: async () => ({ error: null }), getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
  }
  return { client: client as never, tables, asked }
}

const chars = (rows: Row[]) => rows.reduce((a, r) => a + String(r.content ?? "").length + String(r.draft_content ?? "").length, 0)
const noMenus = (async () => undefined) as never

async function main() {
  const who = { userId: "u1", creatorId: "c1" }
  const converted = (await convertTemplateFiles(composeTemplateFiles("materia/clothing"), "Clothing"))!
  const fresh = async () => (await convertTemplateFiles(composeTemplateFiles("materia/clothing"), "Clothing"))!

  section("Off: production as today")
  {
    delete process.env.STORELIB_THEME_FILE_REFS
    forgetRefColumn()
    const db = memoryDb({ column: false })
    check("the switch off: no read asks for the column, and nothing is asked to find out", !(await refReads(db.client)) && db.asked.length === 0)
    check("  the columns of every read are today's", withRefColumn("path, content", false) === "path, content")
    const made = await storeImportedTheme(db.client, who, converted.theme, converted.report, { name: "Old", menus: noMenus })
    const rows = db.tables.store_theme_custom_files
    check("  a new website is full copies, with no reference column in any write", made.ok && rows.length > 900 && rows.every((r) => !("blob_sha256" in r) && typeof r.content === "string") && db.tables.theme_file_blobs.length === 0)
    const files = await installFiles(db.client as never, (made as { installId: string }).installId, false)
    check("  the storefront's read is the same query and the same files", Object.keys(files).length === Object.keys(converted.theme.files).length + 2 && !db.asked.some((a) => /blob_sha256/.test(a)))
    process.env.STORELIB_THEME_FILE_REFS = "1"
    forgetRefColumn()
    check("the switch on before the SQL ran: the column is looked for, not found, and not asked for", !(await refReads(db.client)) && !(await refWrites(db.client, undefined, true)))
    delete process.env.STORELIB_THEME_FILE_REFS
  }

  section("Side by side: an old full-copy website and a new referencing one")
  process.env.STORELIB_THEME_FILE_REFS = "1"
  forgetRefColumn()
  forgetHeldBlobs()
  const db = memoryDb({ column: true })
  check("the switch on and the SQL run: reads ask for the reference column", await refReads(db.client))
  check("  but new websites are not references while a reader does not resolve them", REFS_READERS_DONE === false && !(await refWrites(db.client)) && (await refWrites(db.client, undefined, true)))
  const old = await storeImportedTheme(db.client, who, (await fresh()).theme, (await fresh()).report, { name: "Old", menus: noMenus, refs: false })
  const oldId = (old as { installId: string }).installId
  const oldChars = chars(db.tables.store_theme_custom_files.filter((r) => r.install_id === oldId))
  const neu = await storeImportedTheme(db.client, who, (await fresh()).theme, (await fresh()).report, { name: "New", menus: noMenus, refs: true })
  const newId = (neu as { installId: string }).installId
  const newRows = db.tables.store_theme_custom_files.filter((r) => r.install_id === newId)
  const blobsAfterFirst = db.tables.theme_file_blobs.length
  console.log(`        old website: ${(oldChars / 1e6).toFixed(1)} MB of text in its rows; new: ${(chars(newRows) / 1e6).toFixed(2)} MB, ${newRows.filter((r) => isRefRow(r as never)).length} of ${newRows.length} rows references, ${blobsAfterFirst} blobs`)
  check("the new website is stored, every file of REF_MIN_CHARS or more a reference", old.ok && neu.ok && newRows.length === Object.keys(converted.theme.files).length + 2 && newRows.filter((r) => (r.path as string) in converted.theme.files).every((r) => (converted.theme.files[r.path as string].length >= REF_MIN_CHARS ? isRefRow(r as never) : !isRefRow(r as never))))
  check("  its rows hold under a tenth of the old website's text", chars(newRows) < oldChars / 10, { old: oldChars, now: chars(newRows) })
  const third = await storeImportedTheme(db.client, who, (await fresh()).theme, (await fresh()).report, { name: "Third", menus: noMenus, refs: true })
  check("  a second referencing website writes no new blob", third.ok && db.tables.theme_file_blobs.length === blobsAfterFirst)
  check("  every blob is named by its own text", db.tables.theme_file_blobs.every((b) => sha256Text(String(b.content)) === b.sha256))

  forgetHeldBlobs()
  const liveOld = await installFiles(db.client as never, oldId, false)
  const liveNew = await installFiles(db.client as never, newId, false)
  const same = (a: Record<string, string>, b: Record<string, string>) => {
    const ka = Object.keys(a).filter((k) => k !== "shopify/config/assets.json").sort()
    const kb = Object.keys(b).filter((k) => k !== "shopify/config/assets.json").sort()
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && (a[k] === b[k] || k === "shopify/import-report.json"))
  }
  check("the storefront's read: the old and the new website are the same files, to the character", same(liveOld, liveNew) && Object.keys(liveNew).length > 900, { old: Object.keys(liveOld).length, now: Object.keys(liveNew).length })
  check("  and the old website's rows were read as they are (no blob asked for them)", db.tables.store_theme_custom_files.filter((r) => r.install_id === oldId).every((r) => !isRefRow(r as never)))
  const draftNew = await installFiles(db.client as never, newId, true)
  check("  the builder's read (drafts first) resolves the same", same(liveNew, draftNew))
  check("  the shared text is held once by this server, for every website", heldBlobCount() > 0 && heldBlobCount() <= blobsAfterFirst)
  const assetName = Object.keys(converted.theme.files).find((p) => p.startsWith("shopify/assets/") && converted.theme.files[p].length > REF_MIN_CHARS)!
  const asset = await readAssetRows(db.client as never, newId, withRefColumn("path, content", true), [assetName], 0)
  check("the theme's asset read (a stylesheet, a script) resolves a reference", asset.length === 1 && asset[0].content === converted.theme.files[assetName])

  section("Copy on write")
  const edited = newRows.find((r) => isRefRow(r as never) && String(r.path).endsWith(".storelib"))!
  const path = String(edited.path)
  await (db.client as unknown as { from: (t: string) => { update: (p: Row) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => Promise<unknown> } } } }).from("store_theme_custom_files").update({ draft_content: "<!-- draft -->" }).eq("install_id", newId).eq("path", path)
  const withDraft = await installFiles(db.client as never, newId, true)
  const liveStill = await installFiles(db.client as never, newId, false)
  check("a draft edit is the creator's draft; the live file is still the shared text", withDraft[path] === "<!-- draft -->" && liveStill[path] === converted.theme.files[path])
  await (db.client as unknown as { from: (t: string) => { update: (p: Row) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => Promise<unknown> } } } }).from("store_theme_custom_files").update({ content: "<!-- mine -->", draft_content: null }).eq("install_id", newId).eq("path", path)
  const row = db.tables.store_theme_custom_files.find((r) => r.install_id === newId && r.path === path)!
  const after = await installFiles(db.client as never, newId, false)
  const thirdFiles = await installFiles(db.client as never, (third as { installId: string }).installId, false)
  check("publishing it (content written) makes it the creator's own copy: the reference is cleared", row.blob_sha256 === null && after[path] === "<!-- mine -->")
  check("  and the other referencing website keeps the shared text", thirdFiles[path] === converted.theme.files[path])
  check("a row with text is its own copy even when it still names a blob", !isRefRow({ path: "a", content: "x", blob_sha256: "a".repeat(64) }) && isRefRow({ path: "a", content: "", blob_sha256: "a".repeat(64) }))
  const missing = await resolveFileRows(db.client, [{ path: "x", content: "", blob_sha256: "f".repeat(64) }]).then(() => "resolved", (e: Error) => e.message)
  check("a reference whose blob is not there is an error, never a file with no text", /not there/.test(missing), missing)
  const small = await asReferenceRows(db.client, [{ install_id: "i", path: "tiny.json", content: "{}" }])
  check("a file under REF_MIN_CHARS keeps its own text", small[0].content === "{}" && !("blob_sha256" in small[0]))
  delete process.env.STORELIB_THEME_FILE_REFS
  forgetRefColumn()

  section("The gate: every reader of the table resolves before new websites are references")
  /* Files that read or write store_theme_custom_files rows. CONVERTED resolve references (or only write own copies). */
  const CONVERTED = new Set([
    "lib/website-builder/compat-site.ts",
    "app/api/website-builder/themes/[installId]/files/route.ts",
    "lib/storelib-theme/compat/asset-serve.ts",
    "app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts",
    "lib/website-builder/site-releases-server.ts",
    "lib/themes/imported-theme-store.ts",
    "lib/website-builder/theme-file-refs.ts",
  ])
  /* Still reading `content` without resolving: each must resolve (resolveFileRows, with withRefColumn) before REFS_READERS_DONE may be true. */
  const REMAINING_READERS = [
    "app/api/website-builder/themes/[installId]/agent/decide/route.ts",
    "app/api/website-builder/themes/[installId]/agent/route.ts",
    "app/api/website-builder/themes/[installId]/ai-edit/route.ts",
    "app/api/website-builder/themes/[installId]/duplicate/route.ts",
    "app/api/website-builder/themes/[installId]/export/route.ts",
    "app/api/website-builder/themes/[installId]/generate/route.ts",
    "app/api/website-builder/themes/[installId]/github/route.ts",
    "app/api/website-builder/themes/[installId]/sections/code/fix/route.ts",
    "app/api/website-builder/themes/[installId]/sections/code/route.ts",
    "lib/agent-access/operations.ts",
    "lib/agent-access/project.ts",
    "lib/ai-builder/agent/server.ts",
    "lib/github-sync/editor-status.ts",
    "lib/github-sync/snapshot.ts",
    "lib/store/logo-server.ts",
    "lib/storelib-ai/bank/store.ts",
    "lib/storelib-ai/design-contract-server.ts",
    "lib/themes/theme-update.ts",
    "lib/website-builder/added-since.ts",
    "lib/website-builder/backups.ts",
    "lib/website-builder/compat-overlay-repair.ts",
    "lib/website-builder/custom-schemas.ts",
    "lib/website-builder/design-md-sync.ts",
    "lib/website-builder/draft-section-sources.ts",
    "lib/website-builder/restore-snapshot.ts",
    "lib/website-builder/sanitize-sections.ts",
    "lib/website-builder/save-theme-file.ts",
    "lib/website-builder/storefront-render.ts",
    "lib/website-builder/theme-config-store.ts",
    "lib/website-builder/theme-file-drafts.ts",
  ]
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [] })
  const touching = [...walk("app"), ...walk("lib")].filter((f) => !/\.generated\.|\/types\.ts$/.test(f) && /from\("store_theme_custom_files"\)|from\(FILES_TABLE\)|"store_theme_custom_files"/.test(code(f))).sort()
  const unknown = touching.filter((f) => !CONVERTED.has(f) && !REMAINING_READERS.includes(f))
  check("every file that touches the table is either converted or on the remaining list", unknown.length === 0, unknown)
  const gone = REMAINING_READERS.filter((f) => !touching.includes(f))
  check("  the remaining list names only files that still touch it", gone.length === 0, gone)
  const converted2 = [...CONVERTED].filter((f) => !["lib/themes/imported-theme-store.ts", "app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts", "lib/website-builder/theme-file-refs.ts"].includes(f))
  check("  each converted reader resolves references", converted2.every((f) => /resolveFileRows\(/.test(code(f))) && /withRefColumn\(/.test(code("app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts")))
  check(`  REFS_READERS_DONE is true only when the remaining list is empty (${REMAINING_READERS.length} left)`, REFS_READERS_DONE === (REMAINING_READERS.length === 0))
  const sql = read("supabase/sql/RUN_PENDING_ROUND_27.sql")
  check("the SQL adds and never removes: a nullable column, its key, a partial index, the copy-on-write trigger",
    /ADD COLUMN IF NOT EXISTS blob_sha256 text;/.test(sql) && /REFERENCES public\.theme_file_blobs \(sha256\) ON DELETE RESTRICT NOT VALID/.test(sql) && /WHERE blob_sha256 IS NOT NULL/.test(sql) && /NEW\.content IS DISTINCT FROM OLD\.content THEN\s*NEW\.blob_sha256 := NULL/.test(sql) && !/\b(DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE|UPDATE public\.)/i.test(sql))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
