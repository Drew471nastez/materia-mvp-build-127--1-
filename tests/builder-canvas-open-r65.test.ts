/**
 * ===========================================================================
 *  "STILL OPENING YOUR WEBSITE" (round 65)
 * ===========================================================================
 * The owner: the website builder's canvas often sits on "Still opening your
 * website / Storelib is slow to answer", especially after adding a theme
 * from the marketplace and publishing it; only a reload helps.
 *
 * That card is the editor's first read (loadData: GET /api/website-builder/
 * themes/[installId] and GET .../sections?page=home) still unanswered after
 * OPEN_SLOW_MS. Measured here through the real route handlers, supabase-js
 * and every helper under them, over a stand-in Supabase held in memory at
 * the network edge (tests/_r65-rest-world.ts), on the real Materia clothing
 * template stored by the marketplace's own storeImportedTheme (989 files,
 * 28.9 MB of text, 16 pages):
 *
 *   THE INSTALL READ   read every page's sections and drafts, then every
 *                      section file those pages use (5.4 MB of theme code)
 *                      to clean sections the editor never reads from it. It
 *                      now names the pages; the sections route cleans the
 *                      page it sends, as it always did.
 *   THE CANVAS READS   an imported theme's sources and files (29 MB) were
 *                      asked for beside the first read, on one database. An
 *                      imported theme's now wait until the first read has
 *                      answered; the marketplace's add tells the editor
 *                      before it opens that the website is one.
 *
 * Each scenario prints a line, R65 <name>: <numbers>. The same file run on
 * the code before this round gives the "before" figures in the report.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { world, net, seedStore, resetCounts, installFetch, holdRequest, table, CREATOR_ID, USER_ID } from "./_r65-rest-world"
import { composeTemplateFiles } from "@/lib/themes/template-packages"
import { convertTemplateFiles } from "@/lib/themes/template-install"
import { storeImportedTheme } from "@/lib/themes/imported-theme-store"
import { createAdminClient } from "@/lib/supabase/admin"
import { forgetSigningKeys } from "@/lib/auth/verify-token"
import { GET as installGet } from "@/app/api/website-builder/themes/[installId]/route"
import { GET as sectionsGet } from "@/app/api/website-builder/themes/[installId]/sections/route"
import { GET as filesGet } from "@/app/api/website-builder/themes/[installId]/files/route"
import { POST as publishPost } from "@/app/api/website-builder/themes/[installId]/publish/route"
import { customSchemaLookup } from "@/lib/website-builder/custom-schemas"
import { postAddTheme } from "@/lib/themes/add-attempt-client"
import { compatHintKey, knownCompatInstall } from "@/lib/website-builder/compat-hint"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)?.slice(0, 400)}` : ""}`) }
}
const report = (name: string, line: string) => out(`  R65 ${name}: ${line}`)
console.warn = () => {}
console.error = () => {}
console.info = () => {}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

let INSTALL = ""
const afterTasks: (() => unknown)[] = []
;(globalThis as Record<string, unknown>).__PUSH_TEST_AFTER__ = (task: () => unknown) => void afterTasks.push(task)
let signedIn = true

async function app(path: string, init?: RequestInit): Promise<Response> {
  holdRequest()
  if (!signedIn) (globalThis as Record<string, unknown>).__PUSH_TEST_NEXT_HEADERS__ = { cookies: () => ({ getAll: () => [], get: () => undefined, set() {} }), headers: () => new Headers({ host: "storelib.com" }) }
  const req = new Request(`https://storelib.com${path}`, init)
  const id = path.split("/")[4]?.split("?")[0] ?? ""
  const params = { params: Promise.resolve({ installId: id }) }
  const p = path.split("?")[0]
  if (p === `/api/website-builder/themes/${id}`) return (await installGet(req, params)) as Response
  if (p === `/api/website-builder/themes/${id}/sections`) return (await sectionsGet(req, params)) as Response
  if (p === `/api/website-builder/themes/${id}/files`) return (await filesGet(req, params)) as Response
  if (p === `/api/website-builder/themes/${id}/publish`) return (await publishPost(req, params)) as Response
  return new Response("{}", { status: 404 })
}
installFetch(app)

type Got = { path: string; status: number; ms: number; bytes: number; body: string; dbBytes: number }
/** One request, with the database bytes it moved (requests run one at a time for this count). */
async function measure(path: string): Promise<Got> {
  resetCounts()
  const s = performance.now()
  const r = await fetch(path)
  const body = await r.text()
  return { path, status: r.status, ms: Math.round(performance.now() - s), bytes: body.length, body, dbBytes: world.bytes }
}
const MB = (n: number) => `${(n / 1e6).toFixed(2)} MB`
const paths = () => ({
  install: `/api/website-builder/themes/${INSTALL}`,
  sections: `/api/website-builder/themes/${INSTALL}/sections?page=home`,
  sources: `/api/website-builder/themes/${INSTALL}/files?sources=1`,
  compat: `/api/website-builder/themes/${INSTALL}/files?compat=1`,
})

/**
 * The editor's open, in the order the page asks (page.tsx loadData and the
 * canvas reads), over one shared database link. `deferCanvas`: the theme's
 * sources and files wait for the first read (this round); otherwise they go
 * out with it (before). Times: until loadData has both answers (the card's
 * clock), and until the canvas has its files.
 */
async function editorOpen(deferCanvas: boolean): Promise<{ firstRead: number; canvas: number; db: number }> {
  resetCounts()
  const p = paths()
  const t0 = performance.now()
  const get = (u: string) => fetch(u).then((r) => r.text())
  const canvas = () => Promise.all([get(p.sources), get(p.compat)])
  const early = deferCanvas ? null : canvas()
  await Promise.all([get(p.install), get(p.sections)])
  const firstRead = performance.now() - t0
  await (early ?? canvas())
  return { firstRead: Math.round(firstRead), canvas: Math.round(performance.now() - t0), db: world.bytes }
}

async function main() {
  forgetSigningKeys()
  seedStore()

  out("\n1. A Materia template added through the marketplace's own store step")
  const converted = await convertTemplateFiles(composeTemplateFiles("materia/clothing"), "Clothing")
  holdRequest()
  net.rttMs = 0
  net.mbps = 1e6
  const stored = await storeImportedTheme(createAdminClient(), { userId: USER_ID, creatorId: CREATOR_ID }, converted!.theme, converted!.report, { name: "Clothing" })
  check("the template is stored", stored.ok === true, stored)
  if (!stored.ok) return
  INSTALL = stored.installId
  const files = table("store_theme_custom_files").filter((f) => f.install_id === INSTALL)
  report("template", `${files.length} files, ${MB(files.reduce((a, f) => a + String(f.content).length, 0))} of text, ${table("store_theme_pages").filter((p) => p.install_id === INSTALL).length} pages`)

  net.rttMs = 25
  net.mbps = 25
  out("\n2. The editor's first read, one request at a time (25 ms a round trip, 25 MB/s)")
  for (const label of ["fresh", "second open"]) {
    const a = await measure(paths().install)
    const b = await measure(paths().sections)
    report(`first read, ${label}`, `install ${a.status} ${a.ms} ms, answer ${Math.round(a.bytes / 1024)} KB, database ${MB(a.dbBytes)} | sections ${b.status} ${b.ms} ms, answer ${Math.round(b.bytes / 1024)} KB, database ${MB(b.dbBytes)}`)
    if (label === "fresh") {
      check("the install answers", a.status === 200 && b.status === 200, [a.status, b.status])
      const inst = JSON.parse(a.body).install as { pages: { page_key: string; sections?: unknown }[]; settings: { draft_settings?: Record<string, unknown> } }
      const keys = inst.pages.map((pg) => pg.page_key)
      check("it names every page, the policy pages it made included", ["home", "product", "collection", "lookbook", "refund-policy", "privacy-policy", "terms-of-service"].every((k) => keys.includes(k)), keys)
      check("and carries no page's sections (the sections route sends the page it opens)", inst.pages.every((pg) => pg.sections === undefined))
      check("the install read moves under a megabyte from the database (was 6.8 MB)", a.dbBytes < 1_000_000, MB(a.dbBytes))
      check("and answers in under 50 KB (was 453 KB)", a.bytes < 50_000, a.bytes)
      check("its theme settings come with it", !!inst.settings?.draft_settings && typeof inst.settings.draft_settings === "object")
      const s = JSON.parse(b.body) as { sections: { type: string }[] }
      check("the sections route still sends the home page", Array.isArray(s.sections) && s.sections.some((x) => x.type === "slideshow"), s.sections?.map((x) => x.type))
    }
  }

  out("\n3. The editor's whole open over one database link (sources and files included)")
  for (const mbps of [25, 5]) {
    net.shared = true
    net.mbps = mbps
    const before = await editorOpen(false)
    const after = await editorOpen(true)
    net.shared = false
    report(`open at ${mbps} MB/s`, `canvas reads beside the first read: first read ${before.firstRead} ms, canvas ${before.canvas} ms | after it: first read ${after.firstRead} ms, canvas ${after.canvas} ms | database ${MB(after.db)} an open`)
    check(`at ${mbps} MB/s the first read is at least 1.5 times as quick when the canvas reads wait`, after.firstRead * 1.5 <= before.firstRead, { before, after })
    check(`and the canvas is not later for it (within 15%)`, after.canvas <= before.canvas * 1.15 + 50, { before, after })
  }
  net.mbps = 25

  out("\n4. Publish, then open again")
  resetCounts()
  holdRequest()
  afterTasks.length = 0
  const pub = await fetch(`/api/website-builder/themes/${INSTALL}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) })
  check("it publishes", pub.status === 200, await pub.clone().text())
  const answered = world.bytes
  resetCounts()
  const t = performance.now()
  for (const task of afterTasks.splice(0)) await Promise.resolve(task()).catch(() => {})
  report("publish", `answer: database ${MB(answered)}; the work after the answer (history, backup, release, warm): database ${MB(world.bytes)} in ${Math.round(performance.now() - t)} ms, backup row ${MB(JSON.stringify(table("store_theme_backups").at(-1) ?? {}).length)}`)
  report("publish, after the answer, by table", [...world.byTable].filter(([, v]) => v.bytes > 100_000).map(([k, v]) => `${k} ${v.n} asks ${MB(v.bytes)}`).join(", "))
  {
    const a = await measure(paths().install)
    const b = await measure(paths().sections)
    report("first read after publish", `install ${a.status} ${a.ms} ms, database ${MB(a.dbBytes)} | sections ${b.status} ${b.ms} ms, database ${MB(b.dbBytes)}`)
    check("after a publish the install read is as light as before it", a.status === 200 && a.dbBytes < 500_000, MB(a.dbBytes))
  }

  out("\n5. What stays as it was")
  {
    /* A richtext setting with a script in it, on a section whose own file says it holds rich text. */
    const home = table("store_theme_pages").find((p) => p.install_id === INSTALL && p.page_key === "home")!
    const list = (home.draft_sections ?? home.sections) as { type: string; settings: Record<string, unknown> }[]
    const slide = list.find((x) => x.type === "titleandsubtitle") ?? list[2]
    const lookup = await customSchemaLookup(createAdminClient() as never, INSTALL, [slide], { draft: true })
    const schema = lookup?.(slide.type)
    const rich = (schema?.fields ?? []).find((f) => f.type === "richtext" || f.type === "html")
    check("the section's schema is read from its own file", !!schema && !!rich, { type: slide.type, fields: schema?.fields?.length })
    if (rich) {
      slide.settings[rich.id] = `<p>Hi</p><script>alert(1)</script><img src=x onerror=alert(2)>`
      const b = await measure(paths().sections)
      check("the sections route still cleans what it sends, by the section's own file", b.status === 200 && !/<script|onerror/i.test(b.body) && /Hi/.test(b.body))
    }
    check("one lookup reads each type's schema once and gives the same answer each time", lookup?.(slide.type) === schema)
    const settings = table("store_theme_settings").find((x) => x.install_id === INSTALL)!
    settings.draft_settings = { ...(settings.draft_settings as object ?? {}), tagline: `<b>Hey</b><script>alert(3)</script>` }
    const a = await measure(paths().install)
    check("the install's theme settings are still cleaned", a.status === 200 && !/<script/i.test(a.body) && /Hey/.test(a.body))
    signedIn = false
    const nobody = await measure(paths().install)
    const nobodySections = await measure(paths().sections)
    signedIn = true
    check("signed out: refused, both reads", nobody.status === 401 && nobodySections.status === 401, [nobody.status, nobodySections.status])
    const other = table("store_theme_installs").find((x) => x.id === INSTALL)!
    other.creator_id = "someone-else"
    const theirs = await measure(paths().install)
    other.creator_id = CREATOR_ID
    check("another store's website: not found", theirs.status === 404, theirs.status)
  }

  out("\n6. The editor and the marketplace")
  {
    const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("Still opening is still said after OPEN_SLOW_MS, with Try again that opens afresh", /const OPEN_SLOW_MS = 15_000/.test(editor) && /title=\{tt\("Still opening your website"\)\}/.test(editor) && /setLoadAutoTries\(0\)\s*void loadData\(\)/.test(editor))
    check("an imported theme's canvas code is asked for at once, its files once the first read has answered", /function warmCompatCode\(\) \{\s*void loadCompatCanvas\(\)/.test(editor) && /if \(!openSettled\) return\s*if \(importedTheme\.current \|\| knownCompatInstall\(installId\)\) warmCompat\(installId\)/.test(editor))
    check("its sources too; any other theme's sources at once, as before", /if \(knownCompatInstall\(installId\)\) \{\s*warmCompatCode\(\)\s*return\s*\}\s*sourcesAsked\.current = true\s*void loadStorelibSources\(\)/.test(editor))
    check("the first read is marked answered either way, failed included", /if \(!stale\(\)\) \{\s*setLoading\(false\)\s*if \(!quiet\) setOpenSettled\(true\)/.test(editor))
    check("the install read names its pages and reads no section file", /pages:store_theme_pages\(id, page_key\)/.test(read("app/api/website-builder/themes/[installId]/route.ts")) && !/customSchemaLookup/.test(read("app/api/website-builder/themes/[installId]/route.ts")))

    const store = new Map<string, string>()
    ;(globalThis as Record<string, unknown>).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } }
    await postAddTheme("clothing", async () => new Response(JSON.stringify({ ok: true, install_id: "new-site" }), { status: 200 }), async () => {})
    await new Promise((r) => setTimeout(r, 0))
    check("a website the marketplace adds is known to the editor as imported before it opens", knownCompatInstall("new-site") && store.get(compatHintKey("new-site")) === "1")
    await postAddTheme("merch", async () => new Response(JSON.stringify({ error: "full" }), { status: 400 }), async () => {})
    check("a refused add remembers nothing", store.size === 1)
    delete (globalThis as Record<string, unknown>).window
    check("with no storage it says no and never throws", knownCompatInstall("new-site") === false)
  }
}

main()
  .catch((e) => {
    failed++
    failures.push(`threw: ${e instanceof Error ? e.stack : String(e)}`)
  })
  .finally(() => {
    out(`\n${passed} passed, ${failed} failed`)
    if (failed) {
      for (const f of failures) out(`  - ${f}`)
      process.exit(1)
    }
    process.exit(0)
  })
