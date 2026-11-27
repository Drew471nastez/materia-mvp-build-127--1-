/**
 * ===========================================================================
 *  ADD A THEME, AND OPEN IT, WITHOUT THE WAIT (round 27)
 * ===========================================================================
 * The owner, as the most important issue: adding a theme (Browse themes, Add
 * to library) takes too long, Edit website takes too long to open, sometimes
 * "the server is slow". Production (fra1, 2026-11-25): /api/themes/
 * marketplace/add spent 6 to 11 s before it even tried the photograph, which
 * then failed (the browser is not in that function) and the page asked for
 * the cover again a dozen times.
 *
 * Measured on the real Materia clothing template (986 files, 28.5 MB of text,
 * 49 pictures), over a database and storage that answer after a fixed delay
 * (DB_MS a query, UPLOAD_MS an upload), so the numbers are round trips and
 * not this machine's speed:
 *
 *   WRITES      the pictures a few at a time and only those not stored
 *               already, the library's place and the catalogue row read
 *               while they go up, the rows in parts of at most 3 MB with
 *               three in flight; the old order (one after the other) is run
 *               over the same fake as the baseline
 *   CONVERT     a template's files converted once per server, each use its
 *               own report, pages and settings
 *   ADD ROUTE   a template goes straight to the import's own conversion and
 *               writes: no zip, no second request, the name and the
 *               listing's note in the first write, the template's own
 *               picture as the cover; only its own and the base's release
 *               rows read
 *   EDITOR      the theme's sources and files answer a 304 with no body when
 *               the browser already has exactly them; still asked every time
 *
 * Run with:  pnpm test:push   (one file: scratchpad rtc.sh tests/theme-add-speed-r27.test.ts)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { composeTemplateFiles } from "@/lib/themes/template-packages"
import { convertTemplateFiles, forgetConvertedTemplates } from "@/lib/themes/template-install"
import { CHUNK_CHARS, CHUNK_PARALLEL, CHUNK_ROWS, MEDIA_PARALLEL, fileChunks, forgetCatalogDefault, inPool, storeImportedTheme } from "@/lib/themes/imported-theme-store"
import { convertShopifyTheme, conversionSummary, type ConversionReport, type ImportedTheme } from "@/lib/storelib-theme/shopify/convert"
import { ASSET_MAP_PATH } from "@/lib/storelib-theme/compat/install"
import { REVALIDATED_CACHE, bodyTag, revalidatedJson, tagMatches } from "@/lib/website-builder/revalidated-json"

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const DB_MS = 40
const UPLOAD_MS = 80

type Row = Record<string, unknown>
/* A database and a storage bucket that answer after a fixed delay, counting what was asked and how much of it at once. */
function slowAdmin(opts: { existing?: string[]; failFilesPart?: number; listFails?: boolean } = {}) {
  const stats = { db: 0, uploads: 0, lists: 0, inFlight: 0, maxInFlight: 0, filesInFlight: 0, maxFilesInFlight: 0, uploadsInFlight: 0, maxUploadsInFlight: 0, fileParts: [] as { rows: number; chars: number }[], deleted: [] as string[] }
  const tables: Record<string, Row[]> = { store_theme_installs: [], store_theme_settings: [], store_theme_pages: [], store_theme_custom_files: [], themes: [{ id: "storelib-default" }] }
  const stored = new Set(opts.existing ?? [])
  let ids = 0
  let filePart = 0
  const timed = async <T>(kind: "db" | "files" | "upload" | "list", work: () => T): Promise<T> => {
    stats.inFlight++
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight)
    if (kind === "files") stats.maxFilesInFlight = Math.max(stats.maxFilesInFlight, ++stats.filesInFlight)
    if (kind === "upload") stats.maxUploadsInFlight = Math.max(stats.maxUploadsInFlight, ++stats.uploadsInFlight)
    await sleep(kind === "upload" ? UPLOAD_MS : DB_MS)
    stats.inFlight--
    if (kind === "files") stats.filesInFlight--
    if (kind === "upload") stats.uploadsInFlight--
    return work()
  }
  const client = {
    from(table: string) {
      let op: "select" | "insert" | "delete" | "upsert" = "select"
      let payload: Row | Row[] | null = null
      let head = false
      const run = () => {
        if (table === "store_theme_custom_files" && op === "insert") {
          const part = filePart++
          const list = payload as Row[]
          stats.fileParts.push({ rows: list.length, chars: list.reduce((a, r) => a + String(r.content).length + String(r.path).length, 0) })
          return timed("files", () => {
            if (opts.failFilesPart === part) return { data: null, error: { message: "statement timeout" } }
            tables[table].push(...list)
            return { data: null, error: null }
          })
        }
        stats.db++
        return timed("db", () => {
          if (op === "delete") {
            stats.deleted.push(table)
            tables[table] = []
            return { data: null, error: null }
          }
          if (op === "insert" || op === "upsert") {
            const list = (Array.isArray(payload) ? payload : [payload]) as Row[]
            const made = list.map((r) => (table === "store_theme_installs" ? { id: `install-${++ids}`, ...r } : r))
            tables[table].push(...made)
            return { data: made[0], error: null }
          }
          if (head) return { data: null, error: null, count: tables[table].length }
          if (table === "store_theme_installs") return { data: { sort_order: 0 }, error: null }
          return { data: tables[table][0] ?? null, error: null }
        })
      }
      const q: Record<string, unknown> = {}
      const chain = (name: string, f?: (...a: unknown[]) => void) => (q[name] = (...a: unknown[]) => (f?.(...a), q))
      chain("select", (_c, o) => { if ((o as { head?: boolean } | undefined)?.head) head = true })
      for (const n of ["eq", "in", "like", "order", "limit", "range", "abortSignal"]) chain(n)
      chain("insert", (p) => { op = "insert"; payload = p as Row })
      chain("upsert", (p) => { op = "upsert"; payload = p as Row })
      chain("delete", () => { op = "delete" })
      q.single = () => run()
      q.maybeSingle = () => run()
      q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => run().then(ok, bad)
      return q
    },
    storage: {
      from: () => ({
        list: () => { stats.lists++; return timed("list", () => (opts.listFails ? { data: null, error: { message: "boom" } } : { data: [...stored].map((name) => ({ name })), error: null })) },
        upload: (path: string) => { stats.uploads++; return timed("upload", () => { stored.add(path.split("/").pop()!); return { data: {}, error: null } }) },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  }
  return { client: client as never, stats, tables, stored }
}

/*
  THE ORDER BEFORE ROUND 27, over the same fake: every picture one after the
  other, then the library's place, the catalogue row, the install, its
  recount, then the settings and pages beside the rows, the rows 200 at a
  time one after the other. The same calls as lib/themes/imported-theme-store.ts
  made before, so the difference is only the order.
*/
async function before(admin: ReturnType<typeof slowAdmin>["client"], theme: ImportedTheme, report: ConversionReport): Promise<number> {
  const t0 = performance.now()
  const a = admin as unknown as { from: (t: string) => Record<string, (...x: unknown[]) => unknown>; storage: { from: (b: string) => { upload: (p: string, b: unknown) => Promise<unknown> } } }
  const q = (t: string) => a.from(t) as unknown as { select: (...x: unknown[]) => Promise<unknown> & Record<string, (...x: unknown[]) => unknown>; insert: (r: unknown) => Promise<unknown> & Record<string, (...x: unknown[]) => unknown> }
  for (const asset of theme.binaries) await a.storage.from("b").upload(`u/imported/${createHash("sha256").update(asset.bytes).digest("hex").slice(0, 32)}`, asset.bytes)
  await (q("store_theme_installs").select("sort_order") as unknown as { maybeSingle: () => Promise<unknown> }).maybeSingle()
  await (q("themes").select("id") as unknown as { maybeSingle: () => Promise<unknown> }).maybeSingle()
  await (q("store_theme_installs").insert({}) as unknown as { single: () => Promise<unknown> }).single()
  await q("store_theme_installs").select("id", { count: "exact", head: true })
  const rows = Object.entries({ ...theme.files, [ASSET_MAP_PATH]: "{}", "shopify/import-report.json": JSON.stringify({ summary: conversionSummary(report) }) }).map(([path, content]) => ({ install_id: "i", path, content }))
  const chunks = (async () => { for (let i = 0; i < rows.length; i += 200) await q("store_theme_custom_files").insert(rows.slice(i, i + 200)) })()
  await Promise.all([q("store_theme_settings").insert({}), q("store_theme_pages").insert([]), chunks])
  return performance.now() - t0
}

async function main() {
  section("The real template, converted once per server")
  const files = composeTemplateFiles("materia/clothing")
  let converts = 0
  const counting: typeof convertShopifyTheme = async (zip, o) => { converts++; return convertShopifyTheme(zip, o) }
  forgetConvertedTemplates()
  let t = performance.now()
  const first = await convertTemplateFiles(files, "Clothing", counting)
  const coldMs = performance.now() - t
  t = performance.now()
  const second = await convertTemplateFiles(composeTemplateFiles("materia/clothing"), "Clothing", counting)
  const warmMs = performance.now() - t
  console.log(`        convert: first ${Math.round(coldMs)} ms, again ${Math.round(warmMs)} ms`)
  check("the second add of the same template does not convert it again", !!first && !!second && converts === 1, { converts })
  check(`  and is quick (${Math.round(warmMs)} ms against ${Math.round(coldMs)} ms)`, warmMs < coldMs / 3)
  first!.report.skipped.push({ file: "x", reason: "y" })
  ;(first!.theme.pages[0] as unknown as Row).page_key = "changed"
  check("  each use has its own report and pages (storing one never changes the next)", !second!.report.skipped.some((s) => s.file === "x") && second!.theme.pages[0].page_key !== "changed")
  check("  the whole theme: its files, pages and pictures", Object.keys(second!.theme.files).length > 900 && second!.theme.pages.length > 5 && second!.theme.binaries.length > 20, Object.keys(second!.theme.files).length)
  const otherFiles = new Map(files)
  otherFiles.set("layout/theme.liquid", Buffer.concat([files.get("layout/theme.liquid")!, Buffer.from("\n")]))
  await convertTemplateFiles(otherFiles, "Clothing", counting)
  check("  other files (a release) are another entry, never the cached one", converts === 2)
  const theme = second!.theme
  const report = second!.report
  console.log(`        ${Object.keys(theme.files).length} files, ${(Object.values(theme.files).reduce((a, c) => a + c.length, 0) / 1e6).toFixed(1)} MB of text, ${theme.binaries.length} pictures`)

  section(`Stored over a database that takes ${DB_MS} ms a query and storage ${UPLOAD_MS} ms an upload`)
  const old = slowAdmin()
  const oldMs = await before(old.client, theme, structuredClone(report))
  forgetCatalogDefault()
  const now = slowAdmin()
  const steps: string[] = []
  let lapAt = performance.now()
  t = performance.now()
  const made = await storeImportedTheme(now.client, { userId: "u1", creatorId: "c1" }, theme, structuredClone(report), {
    name: "Clothing",
    menus: (async () => undefined) as never,
    mark: (s) => ({ ...s, __listing: "clothing" }),
    timing: (step) => { const n = performance.now(); steps.push(`${step} ${Math.round(n - lapAt)}`); lapAt = n },
  })
  const newMs = performance.now() - t
  console.log(`        before: ${Math.round(oldMs)} ms, ${old.stats.uploads} uploads, ${old.stats.fileParts.length} parts of rows one after the other`)
  console.log(`        now:    ${Math.round(newMs)} ms (${steps.join(", ")}), ${now.stats.uploads} uploads at most ${now.stats.maxUploadsInFlight} at once, ${now.stats.fileParts.length} parts at most ${now.stats.maxFilesInFlight} at once`)
  check("the template is stored, named, every row written", made.ok === true && now.tables.store_theme_custom_files.length === Object.keys(theme.files).length + 2 && (now.tables.store_theme_installs[0] as Row)?.name === "Clothing", { made, rows: now.tables.store_theme_custom_files.length })
  check("  the listing's note is in the first settings write (no rename and second write after)", (now.tables.store_theme_settings[0] as { settings?: Row })?.settings?.__listing === "clothing" && (now.tables.store_theme_settings[0] as { draft_settings?: Row })?.draft_settings?.__listing === "clothing")
  check(`  at most ${MEDIA_PARALLEL} pictures and ${CHUNK_PARALLEL} parts of rows at once`, now.stats.maxUploadsInFlight <= MEDIA_PARALLEL && now.stats.maxUploadsInFlight > 1 && now.stats.maxFilesInFlight <= CHUNK_PARALLEL && now.stats.maxFilesInFlight > 1, now.stats)
  check(`  every part at most ${CHUNK_ROWS} rows and ${CHUNK_CHARS.toLocaleString("en-US")} characters`, now.stats.fileParts.every((p) => p.rows <= CHUNK_ROWS && p.chars <= CHUNK_CHARS + 1_200_000), now.stats.fileParts)
  check(`  under 40% of the old wait (${Math.round(newMs)} ms against ${Math.round(oldMs)} ms)`, newMs < oldMs * 0.4)

  const again = slowAdmin({ existing: [...now.stored] })
  forgetCatalogDefault()
  t = performance.now()
  const twice = await storeImportedTheme(again.client, { userId: "u1", creatorId: "c1" }, theme, structuredClone(report), { name: "Clothing 2", menus: (async () => undefined) as never })
  const twiceMs = performance.now() - t
  console.log(`        the same creator again: ${Math.round(twiceMs)} ms, ${again.stats.uploads} uploads`)
  check("a picture the creator already has (same bytes, same name) is not uploaded again", twice.ok === true && again.stats.uploads === 0 && again.stats.lists === 1)
  const map = JSON.parse(String((again.tables.store_theme_custom_files.find((r) => r.path === ASSET_MAP_PATH) as Row).content)) as Record<string, string>
  check("  and every picture still has its address", Object.keys(map).length === now.stats.uploads && Object.values(map).every((u) => u.startsWith("https://cdn.test/u1/imported/")), Object.keys(map).length)

  const noList = slowAdmin({ existing: [...now.stored], listFails: true })
  const listFailed = await storeImportedTheme(noList.client, { userId: "u1", creatorId: "c1" }, theme, structuredClone(report), { name: "x", menus: (async () => undefined) as never })
  check("  a listing that fails is 'none known': everything is uploaded, as before", listFailed.ok === true && noList.stats.uploads === now.stats.uploads)

  const broken = slowAdmin({ failFilesPart: 1 })
  const brokenR = await storeImportedTheme(broken.client, { userId: "u1", creatorId: "c1" }, theme, structuredClone(report), { name: "x", menus: (async () => undefined) as never })
  check("a part of rows that fails takes the whole website back, as before", brokenR.ok === false && (brokenR as { status: number }).status === 500 && broken.stats.deleted.includes("store_theme_installs"), { brokenR, deleted: broken.stats.deleted })

  section("Parts and pools")
  const parts = fileChunks([{ path: "a", content: "x".repeat(10) }, { path: "b", content: "x".repeat(10) }, { path: "c", content: "x".repeat(10) }], 2, 25)
  check("parts keep the order and respect both limits", JSON.stringify(parts.map((p) => p.map((f) => f.path))) === JSON.stringify([["a", "b"], ["c"]]))
  check("  a single file larger than a part is a part of its own", fileChunks([{ path: "big", content: "x".repeat(100) }], 200, 10).length === 1)
  let live = 0
  let most = 0
  const order = await inPool([5, 1, 3, 2, 4], 2, async (n) => { most = Math.max(most, ++live); await sleep(n * 3); live--; return n * 10 })
  check("a pool answers in the items' order, at most its limit at once", JSON.stringify(order) === "[50,10,30,20,40]" && most === 2)

  section("The add route")
  const add = code("app/api/themes/marketplace/add/route.ts")
  const templateBranch = add.slice(add.indexOf("if (listing.codePackage) {"), add.indexOf("if (released) {"))
  check("a template is converted and stored in this request: no zip, no import request, no rename after", templateBranch.length > 0 && /convertTemplateFiles\(files, listing\.name\)/.test(templateBranch) && /storeImportedTheme\(admin, owner, converted\.theme, converted\.report, \{ name: listing\.name, mark, timing: lap \}\)/.test(templateBranch) && !/zipOf|importThemePackage|named\(/.test(templateBranch))
  check("  its picture is the template's own cover, and the photograph runs after the answer", /templateCoverBytes\(\{ cover: listing\.cover/.test(templateBranch) && /firstTemplateCover\(/.test(templateBranch) && !/coverForNewWebsite|coverWithin/.test(add) && /* Changed on purpose (r67): after the editor's first read window (quietAfterPublish), still after the answer */ /* Changed on purpose (r68): it names its website (editor-open-r68.test.ts) */ /after\(async \(\) => \{\s*(\/\*[^*]*\*\/\s*)?await quietAfterPublish\((owner\.installId)?\)\s*await coverAfterCreate\(owner, origin, "template"\)\s*\}\)/.test(add))
  check("  the answer says how long each step took (Server-Timing) and keeps the import's answer fields", /"Server-Timing": timing\.join\(", "\)/.test(templateBranch) && /install_id: stored\.installId, name: listing\.name, migrated: false, media: describeMedia\(stored\.imported\), left_out: \[\]/.test(templateBranch) && /install: \{ id: stored\.installId \}/.test(templateBranch))
  check("  an uploaded theme still goes through the import with every check a stranger's file gets", /importThemePackage\(new Request\(/.test(add.slice(add.indexOf("if (released) {"))) && /importThemePackage\(forward\("\/api\/website-builder\/themes\/import", \{ path: copy \}\)\)/.test(add))
  check("  only this listing's and the base's published releases are read, without manifests", /readReleaseRowsFor\(listing\.slug\)/.test(add) && !/readReleaseRows\(/.test(add))
  const rel = code("lib/themes/releases-server.ts")
  check("  that read names its targets and leaves the manifest out; a pinned release's files are held by the server", /\.select\(RELEASE_LAYER_COLUMNS\)\.in\("target", \[\.\.\.new Set\(\[slug, BASE_TARGET\]\)\]\)\.eq\("published", true\)/.test(rel) && !/manifest/.test(rel.match(/RELEASE_LAYER_COLUMNS = `[^`]*`/)?.[0] ?? "manifest") && /releaseFilesHeld\.get\(key\)/.test(rel))
  const create = code("lib/themes/template-install.ts")
  check("Start with AI from a template takes the same held conversion", /convertTemplateFiles\(composeTemplateFiles\(packageId\), opts\.name, deps\.convert\)/.test(create))

  section("Opening the editor: unchanged files are not sent again")
  const value = { files: { "sections/a.storelib": "x".repeat(1000) }, settings_schema: null }
  const ask = (h?: string) => new Request("https://storelib.test/api/x", h ? { headers: { "if-none-match": h } } : undefined)
  const full = revalidatedJson(ask(), value)
  const tag = full.headers.get("etag")!
  check("the answer carries its tag and may be kept only as 'ask me first'", full.status === 200 && tag === bodyTag(JSON.stringify(value)) && full.headers.get("cache-control") === REVALIDATED_CACHE && REVALIDATED_CACHE === "private, no-cache")
  const same = revalidatedJson(ask(tag), value)
  check("  asked with that tag: a 304 with no body", same.status === 304 && (await same.text()) === "")
  const changed = revalidatedJson(ask(tag), { ...value, files: { "sections/a.storelib": "y" } })
  check("  a file changed: the whole answer, with a new tag", changed.status === 200 && changed.headers.get("etag") !== tag && (await changed.json()).files["sections/a.storelib"] === "y")
  check("  tags compare weakly and in a list", tagMatches(`"abc", ${tag}`, tag) && tagMatches(tag.replace(/^W\//, ""), tag) && !tagMatches(null, tag) && tagMatches("*", tag))
  const route = code("app/api/website-builder/themes/[installId]/files/route.ts")
  check("the files route answers both large reads that way, and everything else stays no-store", /* Changed on purpose (r66): through revisionJson, which asks the rows' revision before any file is read (lib/website-builder/files-revision.ts) and keeps this tag's 304 by the body's hash. */ /* Changed on purpose (r68): and the sources' two parts (types=, rest=: 4 answers, 3 revisions asked) */ (route.match(/return revisionJson\(req, revision, /g) ?? []).length === 4 && (route.match(/const unchanged = unchangedSince\(req, revision\)/g) ?? []).length === 3 && /if \(res\.headers\.get\("Cache-Control"\) !== REVALIDATED_CACHE\) res\.headers\.set\("Cache-Control", "no-store"\)/.test(route))
  check("  the theme's settings file is asked beside the sources, not after them", /* Changed on purpose (r68): the whole read's, after the two parts' own reads */ route.indexOf("const schemaAsked") > 0 && route.indexOf("const schemaAsked") < route.indexOf('.like("path", "%.storelib")', route.indexOf("const schemaAsked")) && /const schemaRead = await schemaAsked/.test(route))
  const editor = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  const compatFiles = code("components/website-builder/compat/compat-files.ts")
  check("the editor asks every time with what it has ({ cache: \"no-cache\" }), so a push is still read", /files\?sources=1`, \{ cache: "no-cache"/.test(editor) && /* Changed on purpose (r68): scripts by version */ /files\?compat=1(&scripts=versions)?`, \{ cache: "no-cache" \}/.test(compatFiles))

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
