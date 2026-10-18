/**
 * Restoring a backup: it finishes, it is all or nothing, and the button
 * always hears back (round Z4).
 *
 *   npx tsx tests/restore-backup.test.ts
 *
 * lib/website-builder/restore-snapshot.ts runs here against an in-memory
 * database shaped like the three draft tables, with an imported theme's 504
 * files, a failure part way, the clock running out, and two presses.
 * lib/website-builder/restore-request.ts runs with a fetch that hangs, fails
 * and answers.
 */
import { readFileSync } from "node:fs"
import { batches, restoreSnapshot, RESTORE_BATCH_ROWS } from "../lib/website-builder/restore-snapshot"
import { settleRestore } from "../lib/website-builder/restore-request"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

type Row = Record<string, unknown>

/** Just enough of supabase-js for the restore: select/eq/in, maybeSingle/single, update, insert, upsert, delete. */
function fakeDb(tables: Record<string, Row[]>, opts: { failUpsertCall?: number; failPageUpdate?: string; failSettings?: boolean } = {}) {
  let upserts = 0
  let requests = 0
  let nextId = 1000
  const keyOf: Record<string, string[]> = { store_theme_custom_files: ["install_id", "path"] }
  function from(table: string) {
    const rows = (tables[table] ??= [])
    const filters: ((r: Row) => boolean)[] = []
    let op: "select" | "update" | "insert" | "upsert" | "delete" = "select"
    let payload: unknown = null
    let cols: string | null = null
    let mode: "many" | "single" | "maybe" = "many"
    const q = {
      select(c?: string) { if (op === "select") cols = c ?? "*"; else cols = c ?? "*"; return q },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return q },
      in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return q },
      order() { return q },
      limit() { return q },
      range() { return q },
      maybeSingle() { mode = "maybe"; return q },
      single() { mode = "single"; return q },
      update(p: Row) { op = "update"; payload = p; return q },
      insert(p: Row | Row[]) { op = "insert"; payload = p; return q },
      upsert(p: Row | Row[]) { op = "upsert"; payload = p; return q },
      delete() { op = "delete"; return q },
      then(resolve: (v: { data: unknown; error: { message: string } | null }) => void, reject?: (e: unknown) => void) {
        try { resolve(run()) } catch (e) { reject?.(e) }
      },
    }
    const match = (r: Row) => filters.every((f) => f(r))
    const pick = (r: Row) => {
      if (!cols || cols === "*") return { ...r }
      const out: Row = {}
      for (const c of cols.split(",").map((s) => s.trim())) out[c] = r[c] ?? null
      return out
    }
    function shape(list: Row[]) {
      if (mode === "many") return { data: list.map(pick), error: null }
      if (mode === "single" && list.length !== 1) return { data: null, error: { message: "not one row" } }
      return { data: list[0] ? pick(list[0]) : null, error: null }
    }
    function run() {
      requests++
      if (op === "select") return shape(rows.filter(match))
      if (op === "update") {
        if (table === "store_theme_pages" && opts.failPageUpdate && rows.some((r) => match(r) && r.page_key === opts.failPageUpdate) && JSON.stringify(payload).includes("RESTORED")) {
          return { data: null, error: { message: "boom" } }
        }
        if (table === "store_theme_settings" && opts.failSettings && JSON.stringify(payload).includes("RESTORED")) return { data: null, error: { message: "boom" } }
        const hit = rows.filter(match)
        for (const r of hit) Object.assign(r, payload as Row)
        return shape(hit)
      }
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[]
        const made = list.map((r) => ({ id: `id-${nextId++}`, ...r }))
        rows.push(...made)
        return shape(made)
      }
      if (op === "upsert") {
        upserts++
        if (opts.failUpsertCall && upserts === opts.failUpsertCall) return { data: null, error: { message: "statement timeout" } }
        const key = keyOf[table] ?? ["id"]
        for (const r of (Array.isArray(payload) ? payload : [payload]) as Row[]) {
          const found = rows.find((x) => key.every((k) => x[k] === r[k]))
          if (found) Object.assign(found, r)
          else rows.push({ id: `id-${nextId++}`, ...r })
        }
        return { data: null, error: null }
      }
      const keep = rows.filter((r) => !match(r))
      const gone = rows.length - keep.length
      rows.length = 0
      rows.push(...keep)
      return { data: null, error: null, count: gone }
    }
    return q
  }
  return { db: { from }, stats: () => ({ upserts, requests }) }
}

const INSTALL = "inst-1"

/** An imported theme as it is now: 504 files with a draft on some, three pages, settings. */
function theme() {
  const files: Row[] = []
  for (let i = 0; i < 504; i++) {
    files.push({ install_id: INSTALL, path: `sections/s${i}.storelib`, content: `live ${i}`, draft_content: i % 3 === 0 ? `draft ${i}` : null })
  }
  files.push({ install_id: "other", path: "sections/s1.storelib", content: "someone else", draft_content: null })
  return {
    store_theme_custom_files: files,
    store_theme_pages: [
      { id: "p-home", install_id: INSTALL, page_key: "home", sections: [{ id: "a" }], draft_sections: [{ id: "a", now: true }] },
      { id: "p-about", install_id: INSTALL, page_key: "about", sections: [{ id: "b" }], draft_sections: null },
      { id: "p-faq", install_id: INSTALL, page_key: "faq", sections: [{ id: "c" }], draft_sections: null },
    ],
    store_theme_settings: [{ id: "set-1", install_id: INSTALL, settings: { a: 1 }, draft_settings: { a: 2 } }],
    store_theme_file_versions: [] as Row[],
  }
}

/** The backup: every file different, one new file, the pages and settings marked so a write is visible. */
function snapshot() {
  const files = Array.from({ length: 504 }, (_, i) => ({ path: `sections/s${i}.storelib`, content: `RESTORED ${i} ${"x".repeat(i % 7 === 0 ? 30000 : 10)}` }))
  files.push({ path: "sections/brand-new.storelib", content: "RESTORED new" })
  return {
    settings: { a: "RESTORED" },
    pages: [
      { page_key: "home", sections: [{ id: "RESTORED-home" }] },
      { page_key: "about", sections: [{ id: "RESTORED-about" }] },
      { page_key: "faq", sections: [{ id: "c" }] },
      { page_key: "contact", sections: [{ id: "RESTORED-contact" }] },
    ],
    files,
  }
}

const freeze = (t: Record<string, Row[]>) => JSON.stringify({ f: t.store_theme_custom_files, p: t.store_theme_pages, s: t.store_theme_settings })

async function main() {
  console.log("\nA large theme finishes, in a few bulk writes")
  {
    const t = theme()
    const { db, stats } = fakeDb(t)
    const r = await restoreSnapshot(db, INSTALL, snapshot())
    check("it finishes and says what it changed", r.ok === true && (r as { files: number }).files === 505, JSON.stringify(r))
    const files = t.store_theme_custom_files.filter((f) => f.install_id === INSTALL)
    check("every file's draft is the backup's", files.filter((f) => String(f.path).startsWith("sections/s")).every((f) => String(f.draft_content).startsWith("RESTORED")))
    check("  and what is live is untouched", files.filter((f) => String(f.path).startsWith("sections/s")).every((f) => /^live \d+$/.test(String(f.content))))
    const fresh = files.find((f) => f.path === "sections/brand-new.storelib")
    check("a file the backup has and the site does not is a draft with nothing live", fresh?.content === "" && fresh?.draft_content === "RESTORED new")
    check("another website's file of the same path is not touched", t.store_theme_custom_files.find((f) => f.install_id === "other")?.content === "someone else")
    check("pages: drafts replaced, a page that matched left alone, a missing page made", (t.store_theme_pages.find((p) => p.page_key === "home")?.draft_sections as Row[])[0].id === "RESTORED-home" && t.store_theme_pages.find((p) => p.page_key === "faq")?.draft_sections === null && t.store_theme_pages.some((p) => p.page_key === "contact"))
    check("settings: the draft is the backup's, live stays", JSON.stringify(t.store_theme_settings[0].draft_settings) === '{"a":"RESTORED"}' && JSON.stringify(t.store_theme_settings[0].settings) === '{"a":1}')
    check("each restored file is a version of its own, kind restore", t.store_theme_file_versions.length === 505 && t.store_theme_file_versions.every((v) => v.kind === "restore"))
    const s = stats()
    check(`a few requests, not thousands (${s.requests} for 505 files)`, s.requests < 40, String(s.requests))
    check(`files in bulk (${s.upserts} upserts)`, s.upserts >= Math.ceil(505 / RESTORE_BATCH_ROWS) && s.upserts <= 12)
  }

  console.log("\nOnly what differs is written")
  {
    const t = theme()
    const { db } = fakeDb(t)
    await restoreSnapshot(db, INSTALL, snapshot())
    const { db: db2, stats } = fakeDb(t)
    const again = await restoreSnapshot(db2, INSTALL, snapshot())
    check("the same restore again writes nothing (a double press is harmless)", again.ok === true && (again as { files: number }).files === 0 && (again as { pages: number }).pages === 0 && stats().upserts === 0, JSON.stringify(again))
  }

  console.log("\nA failure part way leaves the draft exactly as it was")
  for (const [name, o] of [
    ["the third bulk write of files", { failUpsertCall: 3 }],
    ["a page", { failPageUpdate: "about" }],
    ["the settings, the very last write", { failSettings: true }],
  ] as const) {
    const t = theme()
    const before = freeze(t)
    const { db } = fakeDb(t, o)
    const r = await restoreSnapshot(db, INSTALL, snapshot())
    check(`${name} fails: refused, and says the draft is as it was`, r.ok === false && (r as { rolledBack: boolean }).rolledBack === true && /as it was before/.test((r as { error: string }).error), JSON.stringify(r))
    check("  every row is byte for byte what it was, new rows removed", freeze(t) === before)
    check("  no version rows for a restore that did not happen", t.store_theme_file_versions.length === 0)
  }

  console.log("\nThe clock running short stops it cleanly")
  {
    const t = theme()
    const before = freeze(t)
    let clock = 0
    const { db } = fakeDb(t)
    const r = await restoreSnapshot(db, INSTALL, snapshot(), { deadlineAt: 2, now: () => clock++ })
    check("past the deadline: stopped, put back, said", r.ok === false && /too long/.test((r as { error: string }).error) && freeze(t) === before)
  }

  console.log("\nA read that fails changes nothing")
  {
    const t = theme()
    const before = freeze(t)
    const db = { from: (table: string) => (table === "store_theme_pages" ? { select: () => ({ eq: () => Promise.resolve({ data: null, error: { message: "down" } }) }) } : fakeDb(t).db.from(table)) }
    const r = await restoreSnapshot(db, INSTALL, snapshot())
    check("refused before any write", r.ok === false && /Nothing was changed/.test((r as { error: string }).error) && freeze(t) === before)
  }

  console.log("\nBatches")
  {
    const big = batches(Array.from({ length: 250 }, (_, i) => i), () => 10)
    check("by count", big.length === 3 && big[0].length === RESTORE_BATCH_ROWS)
    const heavy = batches([1, 2, 3, 4], () => 1_500_000)
    check("by size: a 1.5 MB file each, one per write", heavy.length === 4)
    check("never an empty group", batches([], () => 1).length === 0)
  }

  console.log("\nThe button always settles")
  {
    const busy = { current: false }
    const states: boolean[] = []
    let error: string | null = null
    const base = { busy, setBusy: (b: boolean) => states.push(b), setError: (e: string | null) => { error = e }, fallback: "Could not restore this backup" }

    const hang: typeof fetch = (_u, init) => new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("timeout"), { name: "TimeoutError" })))
    })
    const t0 = Date.now()
    const timedOut = await settleRestore({ ...base, url: "/x", fetchImpl: hang, timeoutMs: 50 })
    check("a request that never answers: settles after the deadline, with words", timedOut === false && states.at(-1) === false && busy.current === false && /taking too long/.test(String(error)) && Date.now() - t0 < 2000)

    const offline: typeof fetch = () => Promise.reject(new TypeError("Failed to fetch"))
    check("no connection: settles, nothing restored", (await settleRestore({ ...base, url: "/x", fetchImpl: offline })) === false && /could not be reached/.test(String(error)))

    const refused: typeof fetch = async () => new Response(JSON.stringify({ error: "The restore could not be saved. Your draft is as it was before." }), { status: 500 })
    check("a refusal: its own words", (await settleRestore({ ...base, url: "/x", fetchImpl: refused })) === false && /as it was before/.test(String(error)))

    const html: typeof fetch = async () => new Response("<html>504</html>", { status: 504 })
    check("a gateway page instead of JSON: the fallback words", (await settleRestore({ ...base, url: "/x", fetchImpl: html })) === false && error === "Could not restore this backup")

    let posts = 0
    let release: (r: Response) => void = () => {}
    const slow: typeof fetch = () => { posts++; return new Promise<Response>((res) => { release = res }) }
    const first = settleRestore({ ...base, url: "/x", fetchImpl: slow })
    const second = await settleRestore({ ...base, url: "/x", fetchImpl: slow })
    release(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    check("two presses: one request, the second does nothing", second === false && (await first) === true && posts === 1 && busy.current === false)

    const holds: boolean[] = []
    const ok = await settleRestore({ ...base, url: "/x", fetchImpl: async () => new Response("{}", { status: 200 }), hold: async (h) => { holds.push(h); return true } })
    check("the editor's draft is saved and held first, and not let go after a success (it reloads)", ok === true && JSON.stringify(holds) === "[true]")
    holds.length = 0
    await settleRestore({ ...base, url: "/x", fetchImpl: offline, hold: async (h) => { holds.push(h); return true } })
    check("  let go again after a failure", JSON.stringify(holds) === "[true,false]")
    let fetched = false
    const unsaved = await settleRestore({ ...base, url: "/x", fetchImpl: async () => { fetched = true; return new Response("{}") }, hold: async () => false })
    check("  edits that cannot be saved: nothing is restored, said", unsaved === false && !fetched && /could not be saved yet/.test(String(error)))
  }

  console.log("\nWired")
  {
    const route = read("app/api/website-builder/themes/[installId]/backups/[backupId]/restore/route.ts")
    check("the route has the whole function time and stops itself before it", /export const maxDuration = 300/.test(route) && /deadlineAt: startedAt \+ STOP_AFTER_MS/.test(route))
    check("the safety copy is verified and taken before anything is written", /verify: true/.test(route) && route.indexOf("takeBackup(") < route.indexOf("await applySnapshot("))
    check("  and the backup being restored is kept out of the pruning", /keep: backup\.id/.test(route))
    const lib = read("lib/website-builder/backups.ts")
    check("a verified copy is read back by id and its fingerprint compared", /if \(opts\.verify\)[\s\S]{0,300}\.select\("id, fingerprint"\)[\s\S]{0,200}check\.fingerprint !== fingerprint/.test(lib))
    const ui = read("components/website-builder/website-settings/backups.tsx")
    check("the dialog goes through settleRestore and holds the editor's draft", /settleRestore\(/.test(ui) && /hold: ctx\.onHoldDraft/.test(ui))
    check("  says so when a large site takes a while", /Still restoring\. A large website can take a minute\./.test(ui))
    const page = read("app/website-builder/editor/[installId]/page.tsx")
    check("the editor: autosave waits while a restore runs", /if \(switchingPage\.current \|\| restoreHold\.current\) return/.test(page))
    check("  saves what is unsaved first, and reloads without asking about leaving", /onHoldDraft=\{async \(hold\) =>/.test(page) && /leaveAnswered\.current = true\s+window\.location\.reload\(\)/.test(page))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
