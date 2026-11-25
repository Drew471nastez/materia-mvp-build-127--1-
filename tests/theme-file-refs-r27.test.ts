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
  copyRows,
  ownRowsOnly,
  setRefsAdmin,
  REF_MIN_CHARS,
  asReferenceRows,
  forgetHeldBlobs,
  forgetRefColumn,
  refColumnChecks,
  refColumnPresent,
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
            if (opts.column && table === "store_theme_custom_files" && next.blob_sha256 && next.content !== r.content && (next.content ?? "") !== "") next.blob_sha256 = null
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
        not(k: string, op: string, v: unknown) { if (op === "is" && v === null) filters.push((r) => r[k] !== null && r[k] !== undefined); return q },
        is(k: string, v: unknown) { filters.push((r) => (v === null ? r[k] === null || r[k] === undefined : r[k] === v)); return q },
        ilike(k: string, pat: string) { const re = new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i"); filters.push((r) => re.test(String(r[k]))); return q },
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

  section("Before the SQL: production as today")
  {
    delete process.env.STORELIB_THEME_FILE_REFS
    forgetRefColumn()
    const db = memoryDb({ column: false })
    setRefsAdmin(() => db.client)
    check("the column is looked for once, found absent, and no read asks for it", !(await refReads(db.client)) && db.asked.length === 1 && /select store_theme_custom_files blob_sha256/.test(db.asked[0]))
    check("  the columns of every read are today's", withRefColumn("path, content", false) === "path, content")
    const made = await storeImportedTheme(db.client, who, converted.theme, converted.report, { name: "Old", menus: noMenus })
    const rows = db.tables.store_theme_custom_files
    check("  a new website is full copies, with no reference column in any write", made.ok && rows.length > 900 && rows.every((r) => !("blob_sha256" in r) && typeof r.content === "string") && db.tables.theme_file_blobs.length === 0)
    const files = await installFiles(db.client as never, (made as { installId: string }).installId, false)
    check("  the storefront's read is the same query and the same files", Object.keys(files).length === Object.keys(converted.theme.files).length + 2)
    const oid0 = (made as { installId: string }).installId
    await Promise.all([
      (await import("@/lib/agent-access/operations")).listFiles(db.client as never, oid0),
      (await import("@/lib/website-builder/storefront-render")).sectionSources(db.client as never, oid0),
      (await import("@/lib/website-builder/draft-section-sources")).draftSectionSources(db.client, oid0),
      (await import("@/lib/website-builder/backups")).readSnapshot(db.client as never, oid0),
      (await import("@/lib/website-builder/theme-file-drafts")).promoteFileDrafts(db.client, oid0),
    ])
    check("  every converted reader and writer asks today's queries; the server checked the column once in all", refColumnChecks() === 1 && db.asked.filter((a) => /blob_sha256|theme_file_blobs/.test(a)).length === 1, { checks: refColumnChecks(), asked: db.asked.filter((a) => /blob_sha256|theme_file_blobs/.test(a)) })
    process.env.STORELIB_THEME_FILE_REFS = "1"
    forgetRefColumn()
    check("the switch on before the SQL ran: nothing is written as references", !(await refReads(db.client)) && !(await refWrites(db.client, undefined, true)))
    delete process.env.STORELIB_THEME_FILE_REFS
    forgetRefColumn()
    let flaky = true
    const healthy = memoryDb({ column: true }).client as unknown as { from: (t: string) => unknown }
    const blinking = { from: (t: string) => (flaky ? { select: () => ({ limit: async () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }) }) } : healthy.from(t)) }
    const first = await refColumnPresent(blinking as never)
    flaky = false
    const second = await refColumnPresent(blinking as never)
    check("  a check that failed for another reason (a timeout) decides nothing: the next read asks again", first === false && second === true && refColumnChecks() === 2)
    setRefsAdmin(null)
  }

  section("Side by side: an old full-copy website and a new referencing one")
  process.env.STORELIB_THEME_FILE_REFS = "1"
  forgetRefColumn()
  forgetHeldBlobs()
  const db = memoryDb({ column: true })
  setRefsAdmin(() => db.client)
  check("the SQL run: reads ask for the reference column", await refReads(db.client))
  check("  and new websites may be references: every reader resolves them (REFS_READERS_DONE)", REFS_READERS_DONE === true && (await refWrites(db.client)) && !(await refWrites(db.client, undefined, false)))
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

  section("Every reader and writer, an old full copy and a new reference website side by side")
  setRefsAdmin(() => db.client)
  {
    /* Files every reader below looks for, given to both websites: the old one as text, the new one as references. */
    const big = (s: string) => `${s}\n${"<!-- filler -->".repeat(120)}`
    const extra: Record<string, string> = {
      "config/settings_schema.json": JSON.stringify([{ name: "theme_info", theme_name: "Clothing" }, { name: "Colours", settings: [{ type: "color", id: "accent", label: "Accent", default: "#112233" }] }], null, 2) + " ".repeat(1200),
      "DESIGN.md": big("# Design\n\nAccent: #112233"),
      "sections/own-hero.storelib": big('<template><section class="own-hero">{{ section.settings.heading }}</section></template>\n<schema>{"name":"Own hero","settings":[{"type":"text","id":"heading","label":"Heading"}]}</schema>'),
    }
    const oid = oldId
    const nid = (third as { installId: string }).installId
    for (const [path, content] of Object.entries(extra)) {
      db.tables.store_theme_custom_files.push({ install_id: oid, path, content, draft_content: null })
      const [ref] = await asReferenceRows(db.client, [{ install_id: nid, path, content }])
      db.tables.store_theme_custom_files.push({ ...ref, draft_content: null })
    }
    check("the new website's extra files are references", Object.keys(extra).every((p) => isRefRow(db.tables.store_theme_custom_files.find((r) => r.install_id === nid && r.path === p) as never)))
    const both = async <T,>(name: string, f: (id: string) => Promise<T>, norm: (v: T) => unknown = (v) => v) => {
      forgetHeldBlobs()
      const [a, b] = [await f(oid), await f(nid)]
      const ja = JSON.stringify(norm(a))
      const jb = JSON.stringify(norm(b))
      check(`  ${name}: the same answer for both`, ja === jb && ja !== undefined && ja !== "null" && ja !== "{}" && ja !== "[]", { old: ja?.slice(0, 160), now: jb?.slice(0, 160) })
    }
    const ops = await import("@/lib/agent-access/operations")
    await both("agent access: listFiles", async (id) => ops.listFiles(db.client as never, id), (r) => (r.ok ? (r as { value: { files: { path: string; unpublished: boolean }[] } }).value.files.map((f) => [f.path, f.unpublished]) : r))
    await both("agent access: readFile", async (id) => ops.readFile(db.client as never, id, "sections/own-hero.storelib"), (r) => (r.ok ? (r as { value: { source: string } }).value.source : r))
    await both("agent access: sectionSources", async (id) => ops.sectionSources(db.client as never, id), (m) => [...m.entries()].sort())
    const ai = await import("@/lib/ai-builder/agent/server")
    await both("the website agent's project: listFiles", async (id) => (await ai.supabaseProjectStore(db.client as never, id).listFiles()).map((f) => [f.path, f.text.length]).sort())
    await both("the website agent's project: readFile", async (id) => (await ai.supabaseProjectStore(db.client as never, id).readFile("DESIGN.md"))?.text)
    const logo = await import("@/lib/store/logo-server")
    const pic = Object.keys(JSON.parse(converted.theme.files["shopify/config/settings_data.json"] ? "{}" : "{}"))
    void pic
    await both("the store logo's picture lookup (the asset map)", async (id) => {
      const map = db.tables.store_theme_custom_files.find((r) => r.install_id === id && r.path === "shopify/config/assets.json")
      const resolved = (await resolveFileRows(db.client, [map as never]))[0] as { content: string }
      const first = Object.keys(JSON.parse(resolved.content))[0]
      return first ? logo.compatPicture(db.client as never, id, `shopify://shop_images/${first}`) : "no pictures"
    })
    const bank = await import("@/lib/storelib-ai/bank/store")
    await both("Storelib AI's bank: readSiteForBank (its files)", async (id) => {
      db.tables.store_theme_installs.find((r) => r.id === id)!.name = "Same"
      return bank.readSiteForBank(db.client as never, id)
    }, (v) => (v ? Object.keys((v as { files: Record<string, string> }).files).sort().map((k) => [k, (v as { files: Record<string, string> }).files[k].length]) : v))
    const design = await import("@/lib/storelib-ai/design-contract-server")
    await both("the design contract (DESIGN.md)", async (id) => (await design.readDesignContract(db.client, id))?.text)
    const backups = await import("@/lib/website-builder/backups")
    await both("a backup's snapshot", async (id) => backups.readSnapshot(db.client as never, id), (v) => (v.files ?? []).map((f) => [f.path, f.content.length]))
    const added = await import("@/lib/website-builder/added-since")
    await both("added since a backup", async (id) => added.addedSince(db.client as never, id, { created_at: "2000-01-01T00:00:00Z", snapshot: { files: [] } }), (v) => v.remove.length + v.keep.length)
    const schemas = await import("@/lib/website-builder/custom-schemas")
    const richType = Object.keys(converted.theme.files).map((p) => /^sections\/([a-z0-9_-]+)\.storelib$/.exec(p)?.[1]).find((t) => t && /"type":\s*"richtext"/.test(converted.theme.files[`sections/${t}.storelib`]))!
    await both(`the custom section schemas (${richType})`, async (id) => (await schemas.customSchemaLookup(db.client as never, id, [{ type: richType }], { draft: true }))?.(richType))
    const drafts = await import("@/lib/website-builder/draft-section-sources")
    await both("the builder's section sources", async (id) => drafts.draftSectionSources(db.client, id), (v) => Object.keys(v).sort().map((k) => [k, v[k].length]))
    const sanitize = await import("@/lib/website-builder/sanitize-sections")
    await both(`a section's own fields (cleaning, ${richType})`, async (id) => sanitize.readOwnSectionFields(db.client as never, id, [richType]))
    const render = await import("@/lib/website-builder/storefront-render")
    await both("the storefront's section sources", async (id) => render.sectionSources(db.client as never, id), (v) => Object.keys(v).sort().map((k) => [k, v[k].length]))
    const config = await import("@/lib/website-builder/theme-config-store")
    await both("the theme's own settings schema", async (id) => config.readThemeSchemaText(db.client as never, id))
    const save = await import("@/lib/website-builder/save-theme-file")
    await both("the section names in use (a save's check)", async (id) => save.sectionNamesInUse(db.client as never, id, "sections/x.storelib"), (m) => [...m.entries()].sort())
    const snap = await import("@/lib/github-sync/snapshot")
    check("  GitHub's snapshot, the agent's project, theme updates and restore read through the same helpers", /resolveRefs\(/.test(code("lib/github-sync/snapshot.ts")) && /resolveRefs\(/.test(code("lib/agent-access/project.ts")) && /resolveRefs\(/.test(code("lib/themes/theme-update.ts")) && /copyRows\(/.test(code("lib/themes/theme-update.ts")) && /resolveRefs\(/.test(code("lib/website-builder/restore-snapshot.ts")) && /resolveRefs\(/.test(code("lib/website-builder/compat-overlay-repair.ts")) && /resolveRef\(/.test(code("lib/website-builder/design-md-sync.ts")) && typeof snap.readSnapshot === "function")

    /* Routes: each reads through fileCols and resolves (they need a signed-in request; their helpers are the ones run above). */
    const routeFiles = [
      "app/api/website-builder/themes/[installId]/agent/route.ts",
      "app/api/website-builder/themes/[installId]/ai-edit/route.ts",
      "app/api/website-builder/themes/[installId]/duplicate/route.ts",
      "app/api/website-builder/themes/[installId]/export/route.ts",
      "app/api/website-builder/themes/[installId]/generate/route.ts",
      "app/api/website-builder/themes/[installId]/github/route.ts",
      "app/api/website-builder/themes/[installId]/sections/code/fix/route.ts",
      "app/api/website-builder/themes/[installId]/sections/code/route.ts",
      "app/api/website-builder/themes/[installId]/files/route.ts",
      "app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts",
    ]
    check("  every route that reads the text asks for references and resolves them", routeFiles.every((f) => /fileCols\(|refsHere\(|withRefColumn\(/.test(code(f)) && /resolveRefs?\(|resolveHere\(|copyRows\(|readAssetRows\(/.test(code(f))), routeFiles.filter((f) => !(/fileCols\(|refsHere\(|withRefColumn\(/.test(code(f)) && /resolveRefs?\(|resolveHere\(|copyRows\(|readAssetRows\(/.test(code(f)))))

    section("Writers: copy on write, and a delete never takes a reference")
    /* A duplicate: a reference stays a reference, a row with text stays text. */
    const srcRows = db.tables.store_theme_custom_files.filter((r) => r.install_id === nid).slice(0, 50).map((r) => ({ install_id: "copy", path: String(r.path), content: String(r.content ?? ""), blob_sha256: (r.blob_sha256 as string | null) ?? null }))
    const copied = await copyRows(srcRows)
    check("a copy keeps every reference (no text written) and every own text as it is", copied.length === srcRows.length && copied.every((c, i) => (isRefRow(srcRows[i]) ? c.blob_sha256 === srcRows[i].blob_sha256 && c.content === "" : c.content === srcRows[i].content && !c.blob_sha256)))
    /* Publish: a draft equal to the shared text keeps the reference; another text makes the creator's own copy. */
    const designNew = db.tables.store_theme_custom_files.find((r) => r.install_id === nid && r.path === "DESIGN.md")!
    const schemaNew = db.tables.store_theme_custom_files.find((r) => r.install_id === nid && r.path === "config/settings_schema.json")!
    designNew.draft_content = extra["DESIGN.md"]
    schemaNew.draft_content = "[]"
    const tdrafts = await import("@/lib/website-builder/theme-file-drafts")
    const moved = await tdrafts.promoteFileDrafts(db.client, nid)
    check("Publish: a draft that says what is shared keeps the reference; another text is the creator's own", moved === 2 && isRefRow(designNew as never) && designNew.draft_content === null && schemaNew.content === "[]" && schemaNew.blob_sha256 === null)
    /* A delete meant for files with no text of their own (a draft never published) never takes a reference. */
    const before = db.tables.store_theme_custom_files.filter((r) => r.install_id === nid).length
    const gone = await added.removeAdded(db.client as never, nid, [{ kind: "file", key: "DESIGN.md" } as never])
    check("Undo added since: a reference row is not removed as an empty file", db.tables.store_theme_custom_files.filter((r) => r.install_id === nid).length === before && db.tables.store_theme_custom_files.some((r) => r.install_id === nid && r.path === "DESIGN.md"), gone)
    const refsOff = await (async () => {
      const before = memoryDb({ column: false })
      forgetRefColumn()
      setRefsAdmin(() => before.client)
      const q = { is: () => { throw new Error("asked") } }
      const r = await ownRowsOnly(q as never)
      forgetRefColumn()
      setRefsAdmin(() => db.client)
      return r === q
    })()
    check("  before the SQL the delete is today's query, untouched", refsOff)
  }

  section("The switch turned off after websites were stored as references")
  {
    delete process.env.STORELIB_THEME_FILE_REFS
    const refSite = (third as { installId: string }).installId
    forgetHeldBlobs()
    const live = await installFiles(db.client as never, refSite, false)
    check("a website stored as references still draws every file: reading never depends on the switch", Object.keys(live).length > 900 && live[Object.keys(converted.theme.files).find((p) => converted.theme.files[p].length > REF_MIN_CHARS && p.startsWith("shopify/assets/"))!] !== undefined && db.tables.store_theme_custom_files.some((r) => r.install_id === refSite && isRefRow(r as never)))
    const sources = await (await import("@/lib/website-builder/storefront-render")).sectionSources(db.client as never, refSite)
    check("  and every reader still resolves (the storefront's section sources)", Object.keys(sources).length >= 0 && Object.values(sources).every((t) => t.length > 0))
    const afterOff = await storeImportedTheme(db.client, who, (await fresh()).theme, (await fresh()).report, { name: "After", menus: noMenus })
    const afterRows = db.tables.store_theme_custom_files.filter((r) => r.install_id === (afterOff as { installId: string }).installId)
    check("  only writing stops: a new website is full copies again", afterOff.ok && afterRows.length > 900 && afterRows.every((r) => !isRefRow(r as never)))
    process.env.STORELIB_THEME_FILE_REFS = "1"
  }
  setRefsAdmin(null)
  delete process.env.STORELIB_THEME_FILE_REFS
  forgetRefColumn()

  section("The gate: every reader of the table resolves references")
  /* Files that read store_theme_custom_files rows' text resolve references; these only read paths, counts, or delete by path. */
  const PATH_ONLY = new Set([
    "app/api/website-builder/themes/[installId]/agent/decide/route.ts",
    "lib/github-sync/editor-status.ts",
  ])
  const MODULE = "lib/website-builder/theme-file-refs.ts"
  /* Resolves the rows its caller asked for with the reference column (the asset route's withRefColumn). */
  const GIVEN_COLUMNS = new Set(["lib/storelib-theme/compat/asset-serve.ts"])
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [] })
  const touching = [...walk("app"), ...walk("lib")].filter((f) => !/\.generated\.|\/types\.ts$/.test(f) && /from\("store_theme_custom_files"\)|from\(FILES\)|"store_theme_custom_files"/.test(code(f))).sort()
  const resolves = (f: string) => /resolveRefs?\(|resolveFileRows\(|copyRows\(|readAssetRows\(|asReferenceRows\(/.test(code(f)) && /fileCols\(|withRefColumn\(|refWrites\(/.test(code(f))
  const notResolving = touching.filter((f) => f !== MODULE && !PATH_ONLY.has(f) && !(GIVEN_COLUMNS.has(f) ? /resolveFileRows\(/.test(code(f)) : resolves(f)))
  check(`every file that reads the table's text resolves references (${touching.length} files)`, notResolving.length === 0, notResolving)
  const pathOnlyReadsText = [...PATH_ONLY].filter((f) => /\.select\("[^"]*content/.test(code(f)))
  check("  the path-only ones read no text", pathOnlyReadsText.length === 0, pathOnlyReadsText)
  check("  so REFS_READERS_DONE is true", REFS_READERS_DONE === true)
  const sideBySide = read("tests/theme-file-refs-r27.test.ts")
  const routes = touching.filter((f) => f.startsWith("app/") && !PATH_ONLY.has(f))
  check("  each route that reads the text is named in this test (source checked, its helpers run side by side above)", routes.every((f) => sideBySide.includes(f)), routes.filter((f) => !sideBySide.includes(f)))
  const sql = read("supabase/sql/RUN_PENDING_ROUND_27.sql")
  check("the SQL adds and never removes: a nullable column, its key, a partial index, the copy-on-write trigger",
    /ADD COLUMN IF NOT EXISTS blob_sha256 text;/.test(sql) && /REFERENCES public\.theme_file_blobs \(sha256\) ON DELETE RESTRICT NOT VALID/.test(sql) && /WHERE blob_sha256 IS NOT NULL/.test(sql) && /NEW\.content IS DISTINCT FROM OLD\.content AND coalesce\(NEW\.content, ''\) <> '' THEN\s*NEW\.blob_sha256 := NULL/.test(sql) && !/\b(DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE)/i.test(sql) && (sql.match(/UPDATE public\./g) ?? []).length === 1 && /UPDATE public\.site_live_releases SET release_id = NULL, rev = rev \+ 1/.test(sql))
  check("  a reference added, removed or pointed elsewhere lets go of the live release pointer", /CREATE TRIGGER store_theme_file_ref_forget AFTER INSERT OR DELETE OR UPDATE OF blob_sha256/.test(sql) && /IF NEW\.blob_sha256 IS NULL THEN RETURN NULL; END IF;/.test(sql) && /coalesce\(NEW\.content, ''\) <> ''/.test(sql))

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
