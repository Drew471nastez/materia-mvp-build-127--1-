/**
 * ===========================================================================
 *  OPENING THE EDITOR RIGHT AFTER ADD AND PUBLISH (round 68)
 * ===========================================================================
 * The owner: "I go to the templates, I add the template to my library ...
 * Let's say I click publish. Then I click edit website, and it takes me to
 * the website builder editor. It truly takes so much to load, and sometimes
 * it tells me that Storelib takes too much to respond. Ensure these kind of
 * issues are never happening."
 *
 * Round 67 measured only the editor's first read (the install and the page's
 * sections). The canvas of a Materia website waits for two more: the theme's
 * own files (files?compat=1, 6.8 MB) and every section source
 * (files?sources=1, 22.8 MB), asked once the first read has answered. Over
 * the stand-in Supabase of tests/_r65-rest-world.ts, with the real routes on
 * the real Materia clothing template, pressed 2.5 s after a Publish whose
 * work after the answer reads the same tables over one shared link and ten
 * connections, the canvas had its data after 21 s at 3 MB/s, and the sources
 * read alone took 19.7 s, past the 15 s the editor gave it (round 67's first
 * read: 1.3 s of that).
 *
 * Now the canvas waits for the page's part of the sources and the theme's
 * files without their plain scripts' text; the other sections follow; and
 * the work after the Publish waits while this server answers the editor's
 * open. Each scenario prints R68 <name>: <numbers>.
 *
 * The browser half: scripts/check-editor-open-r68.mjs (the real editor on
 * the same template, CPU slowed 4x: time to the shell, the canvas's card
 * and its first paint, the longest main thread task).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { world, net, seedStore, resetCounts, installFetch, holdRequest, table, CREATOR_ID, USER_ID } from "./_r65-rest-world"
import { composeTemplateFiles } from "@/lib/themes/template-packages"
import { convertTemplateFiles } from "@/lib/themes/template-install"
import { storeImportedTheme } from "@/lib/themes/imported-theme-store"
import { createAdminClient } from "@/lib/supabase/admin"
import { forgetSigningKeys } from "@/lib/auth/verify-token"
import { forgetHeldBlobs } from "@/lib/website-builder/theme-file-refs"
import { forgetSectionFileMemo } from "@/lib/website-builder/custom-schemas"
import { MAX_PART_TYPES, OWN_SECTION_TYPES, partSectionPaths, partTypes, sectionTagNames, sectionTypesOf, sourcesCover, withRest } from "@/lib/website-builder/source-parts"
import { PLAIN_SCRIPT, textVersion } from "@/lib/storelib-theme/compat/script-version"
import { afterEditorReads, editorReadBegins, editorReading, forgetEditorReads, EDITOR_FIRST_CAP_MS } from "@/lib/website-builder/editor-reads"
import { readInSlices, unreadSections, READ_AT_ONCE } from "@/lib/website-builder/warm-schemas"
import { schemaHeld } from "@/lib/website-builder/storelib-schemas"
import { mayHoldTag, compatMarkupOf, isCompatSource } from "@/lib/storelib-theme/compat/theme"
import { parseCompat } from "@/lib/storelib-theme/compat/parser"
import { GET as installGet } from "@/app/api/website-builder/themes/[installId]/route"
import { GET as sectionsGet } from "@/app/api/website-builder/themes/[installId]/sections/route"
import { GET as filesGet } from "@/app/api/website-builder/themes/[installId]/files/route"
import { POST as publishPost } from "@/app/api/website-builder/themes/[installId]/publish/route"
import * as nextCache from "../scripts/speed18/shims/next-cache"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)?.slice(0, 400)}` : ""}`) }
}
const report = (name: string, line: string) => out(`  R68 ${name}: ${line}`)
console.warn = () => {}
console.error = () => {}
console.info = () => {}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const MB = (n: number) => `${(n / 1e6).toFixed(2)} MB`

let INSTALL = ""
const afterTasks: (() => unknown)[] = []
;(globalThis as Record<string, unknown>).__PUSH_TEST_AFTER__ = (task: () => unknown) => void afterTasks.push(task)

async function app(path: string, init?: RequestInit): Promise<Response> {
  holdRequest()
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

const base = () => `/api/website-builder/themes/${INSTALL}`
type Timed = { status: number; ms: number; kb: number; text: string; etag: string | null }
async function timed(path: string, init?: RequestInit): Promise<Timed> {
  const t = performance.now()
  const r = await fetch(path, init)
  const text = await r.text()
  return { status: r.status, ms: Math.round(performance.now() - t), kb: Math.round(text.length / 1024), text, etag: r.headers.get("etag") }
}
const filesOf = (t: Timed) => (JSON.parse(t.text) as { files: Record<string, string> }).files

let TYPES = ""
/**
 * The editor's open, as the editor asks: its first read (the install and the page's sections, at once), then the
 * theme's files and the page's sources at once (the canvas draws once both are in: canvasData), then the rest.
 * `whole`: as before this round (every source and every script's text, at once).
 */
async function editorOpen(whole: boolean) {
  const t0 = performance.now()
  const [install, sections] = await Promise.all([timed(base()), timed(`${base()}/sections?page=home`)])
  const first = Math.round(performance.now() - t0)
  if (whole) {
    const [compat, sources] = await Promise.all([timed(`${base()}/files?compat=1`), timed(`${base()}/files?sources=1`)])
    const canvasData = Math.round(performance.now() - t0)
    return { ok: [install, sections, compat, sources].every((x) => x.status === 200), first, compat, sources, rest: null as Timed | null, canvasData, all: canvasData }
  }
  const [compat, sources] = await Promise.all([timed(`${base()}/files?compat=1&scripts=versions`), timed(`${base()}/files?sources=1&types=${TYPES}`)])
  const canvasData = Math.round(performance.now() - t0)
  const rest = await timed(`${base()}/files?sources=1&rest=${TYPES}`)
  return { ok: [install, sections, compat, sources, rest].every((x) => x.status === 200), first, compat, sources, rest, canvasData, all: Math.round(performance.now() - t0) }
}
const line = (o: Awaited<ReturnType<typeof editorOpen>>) =>
  `canvas has its data ${o.canvasData} ms (first read ${o.first} ms, theme files ${o.compat.kb} KB in ${o.compat.ms} ms, sources ${o.sources.kb} KB in ${o.sources.ms} ms${o.rest ? `, the rest ${o.rest.kb} KB by ${o.all} ms` : ""})`

async function main() {
  ;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
  forgetSigningKeys()
  seedStore()
  const converted = await convertTemplateFiles(composeTemplateFiles("materia/clothing"), "Clothing")
  holdRequest()
  net.rttMs = 0
  net.mbps = 1e6
  const stored = await storeImportedTheme(createAdminClient(), { userId: USER_ID, creatorId: CREATOR_ID }, converted!.theme, converted!.report, { name: "Clothing" })
  check("the template is stored", stored.ok === true, stored)
  if (!stored.ok) return
  INSTALL = stored.installId
  await fetch(base())
  const home = JSON.parse((await timed(`${base()}/sections?page=home`)).text) as { sections: { type: string }[] }
  TYPES = sectionTypesOf(home.sections).join(",")

  out("\n1. The sources in two parts: the page's, then the rest, together exactly the whole")
  {
    const whole = await timed(`${base()}/files?sources=1`)
    const page = await timed(`${base()}/files?sources=1&types=${TYPES}`)
    const rest = await timed(`${base()}/files?sources=1&rest=${TYPES}`)
    const w = filesOf(whole)
    const p = filesOf(page)
    const r = filesOf(rest)
    report("sources", `whole ${whole.kb} KB (${Object.keys(w).length} files) | the page's ${page.kb} KB (${Object.keys(p).length}) | the rest ${rest.kb} KB (${Object.keys(r).length})`)
    check("each answers", whole.status === 200 && page.status === 200 && rest.status === 200, [whole.status, page.status, rest.status])
    const merged = withRest(p, r)
    const keys = (o: Record<string, string>) => Object.keys(o).sort().join("|")
    check("the page's part with the rest laid under it is the whole, file for file", keys(merged) === keys(w) && Object.keys(w).every((k) => merged[k] === w[k]), Object.keys(w).filter((k) => merged[k] !== w[k]).slice(0, 5))
    check("the page's part holds every section the page draws (sourcesCover)", sourcesCover(home.sections, p))
    check("and every file that is not a section (layout, snippets, blocks)", Object.keys(w).filter((k) => !k.startsWith("sections/")).every((k) => p[k] === w[k]))
    check("the page's part is under 30% of the whole (22.8 MB before, every open)", page.kb < whole.kb * 0.3, `${page.kb} of ${whole.kb} KB`)
    check("the rest holds sections only", Object.keys(r).every((k) => k.startsWith("sections/")))
    check("a section the layout names ({% section %}) is in the page's part", sectionTagNames(p).every((t) => p[`sections/${t}.storelib`] !== undefined), sectionTagNames(p))
    check("Storelib's own sections an imported theme always has are in the page's part", OWN_SECTION_TYPES.every((t) => p[`sections/${t}.storelib`] !== undefined))
    /* Asked again with what the browser holds: a 304 before a file is read. */
    resetCounts()
    world.log = []
    const again = await timed(`${base()}/files?sources=1&types=${TYPES}`, { headers: { "if-none-match": page.etag ?? "" } })
    const content = (world.log ?? []).filter((e) => /content/.test(e.select)).length
    world.log = null
    check("the page's part asked again with its tag is a 304 that reads no file", again.status === 304 && content === 0, { status: again.status, content })

    /* A real file of Storelib's own section is the one in the page's part, not the one made for a theme without it. */
    const own = `sections/${OWN_SECTION_TYPES[0]}.storelib`
    const made = p[own]
    table("store_theme_custom_files").push({ id: "r68-own", install_id: INSTALL, path: own, content: `${made}\n<!-- r68 -->`, draft_content: null, updated_at: new Date().toISOString() })
    const page2 = filesOf(await timed(`${base()}/files?sources=1&types=${TYPES}`))
    const rest2 = filesOf(await timed(`${base()}/files?sources=1&rest=${TYPES}`))
    check("a real file of Storelib's own section is the page's part's", /r68/.test(page2[own] ?? ""), (page2[own] ?? "").slice(-40))
    check("and the rest does not hand it again", rest2[own] === undefined)
    const files = table("store_theme_custom_files")
    files.splice(files.findIndex((row) => row.id === "r68-own"), 1)

    /* Anything that is not a plain list of section types is the whole, as before. */
    const odd = await timed(`${base()}/files?sources=1&types=../secret,ok`)
    check("a types= that is not a list of section types answers the whole, as before", odd.status === 200 && Object.keys(filesOf(odd)).length === Object.keys(w).length)
    check("partTypes refuses what is not a type, and too many", partTypes("a,b") !== null && partTypes("a,B") === null && partTypes("a/b") === null && partTypes("") === null && partTypes(Array.from({ length: MAX_PART_TYPES + 1 }, (_, i) => `t${i}`).join(",")) === null)
    check("partSectionPaths names the types and Storelib's own", partSectionPaths(["x"]).includes("sections/x.storelib") && OWN_SECTION_TYPES.every((t) => partSectionPaths([]).includes(`sections/${t}.storelib`)))
  }

  out("\n2. The theme's files with its plain scripts by version: the same addresses, without 3.9 MB of text")
  {
    const full = await timed(`${base()}/files?compat=1`)
    const lean = await timed(`${base()}/files?compat=1&scripts=versions`)
    const f = filesOf(full)
    const l = JSON.parse(lean.text) as { files: Record<string, string>; script_versions: Record<string, string>; asset_pass?: string }
    const scripts = Object.keys(f).filter((k) => PLAIN_SCRIPT.test(k))
    report("theme files", `with every script's text ${full.kb} KB | scripts by version ${lean.kb} KB (${scripts.length} scripts)`)
    check("no plain script's text is sent", Object.keys(l.files).every((k) => !PLAIN_SCRIPT.test(k)))
    check("everything else is as before, file for file", Object.keys(f).filter((k) => !PLAIN_SCRIPT.test(k)).every((k) => l.files[k] === f[k]) && Object.keys(l.files).length === Object.keys(f).length - scripts.length)
    check("each script's version is the one its text gives (the canvas's ?v=, so the browser's copy of it is still good)", scripts.length > 0 && scripts.every((k) => l.script_versions[PLAIN_SCRIPT.exec(k)![1]] === textVersion(f[k])))
    /* The canvas's own hash before this round (compat-canvas.tsx assetVersionIn), kept here as it was. */
    const before = (text: string) => {
      let h = 0x811c9dc5
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
      return `${(h >>> 0).toString(36)}${text.length.toString(36)}`
    }
    check("textVersion is the canvas's hash as it was", scripts.every((k) => textVersion(f[k]) === before(f[k])) && textVersion("") === before(""))
    check("the draft asset pass still comes with it", typeof l.asset_pass === "string" && l.asset_pass.length > 0)
    check("under half the bytes", lean.kb < full.kb * 0.5, `${lean.kb} of ${full.kb} KB`)
    const lean304 = await timed(`${base()}/files?compat=1&scripts=versions`, { headers: { "if-none-match": lean.etag ?? "" } })
    const full2 = await timed(`${base()}/files?compat=1`, { headers: { "if-none-match": lean.etag ?? "" } })
    check("its own tag is a 304, and is not taken for the full answer's", lean304.status === 304 && full2.status === 200, [lean304.status, full2.status])
  }

  out("\n3. The open, pressed 2.5 s after Publish, while the publish's work after the answer runs (one shared link, 10 connections)")
  const results: Record<number, { before: number; after: number }> = {}
  for (const mbps of [10, 3]) {
    const row = { before: 0, after: 0 }
    for (const whole of [true, false]) {
      net.rttMs = 25
      net.shared = true
      net.pool = 10
      net.mbps = mbps
      forgetEditorReads()
      afterTasks.length = 0
      holdRequest()
      const pub = await fetch(`${base()}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) })
      check(`at ${mbps} MB/s it publishes`, pub.status === 200)
      await pub.text()
      /* A server that has drawn nothing of this theme yet. */
      forgetHeldBlobs()
      forgetSectionFileMemo()
      resetCounts()
      const tPub = performance.now()
      /* As on Vercel: every after() task at once, once the answer has gone. */
      const running = Promise.all(afterTasks.splice(0).map((task) => Promise.resolve().then(task).catch(() => {})))
      await new Promise((r) => setTimeout(r, 2500))
      /* Before this round: the whole read, and the publish's work did not wait for it. */
      ;(globalThis as { __PUSH_TEST_EDITOR_FIRST_OFF__?: boolean }).__PUSH_TEST_EDITOR_FIRST_OFF__ = whole
      const o = await editorOpen(whole)
      await running
      net.shared = false
      net.pool = 0
      report(`${whole ? "before" : "after"}, ${mbps} MB/s`, `${line(o)}; the publish's work done ${Math.round(performance.now() - tPub)} ms after its answer, database ${MB(world.bytes)} in all`)
      check(`${whole ? "before" : "after"}, ${mbps} MB/s: every read answers`, o.ok)
      if (whole) row.before = o.canvasData
      else row.after = o.canvasData
    }
    results[mbps] = row
    report(`canvas data at ${mbps} MB/s`, `${row.before} ms before, ${row.after} ms after`)
    check(`at ${mbps} MB/s the canvas has its data in under half the time it took before`, row.after < row.before * 0.5, row)
  }
  ;(globalThis as { __PUSH_TEST_EDITOR_FIRST_OFF__?: boolean }).__PUSH_TEST_EDITOR_FIRST_OFF__ = false
  check("at 3 MB/s, right after a Publish, the canvas has its data within 8 s (21 s before this round)", results[3].after < 8000, results[3])

  out("\n4. The work after a Publish waits while this server answers that website's editor as it opens")
  {
    forgetEditorReads()
    check("nothing on its way: not reading", !editorReading("site-a"))
    const end = editorReadBegins("site-a")
    check("a read on its way: that website's editor is reading", editorReading("site-a"))
    check("and another website's is not (a server answers many people's editors)", !editorReading("site-b"))
    const t = performance.now()
    setTimeout(end, 300)
    await afterEditorReads("site-a", 5000, 20)
    const waited = performance.now() - t
    check("the work waits for the read and a moment after it, then goes", waited >= 300 && waited < 3000, Math.round(waited))
    const t3 = performance.now()
    const other = editorReadBegins("site-b")
    await afterEditorReads("site-c", 5000, 20)
    other()
    check("another website's open holds nothing up", performance.now() - t3 < 100)
    forgetEditorReads()
    const end2 = editorReadBegins("site-a")
    const t2 = performance.now()
    await afterEditorReads("site-a", 400, 20)
    end2()
    check("never longer than its cap", performance.now() - t2 < 1000)
    check("the cap is stated: 15 s", EDITOR_FIRST_CAP_MS === 15_000)
    forgetEditorReads()
    const src = read("lib/website-builder/after-publish.ts")
    check("quietAfterPublish waits for that website's editor reads after its quiet window", src.includes("setTimeout(r, ms)).then(() => (installId ? afterEditorReads(installId) : undefined))"))
    check("the publish and the add name their website", (read("app/api/website-builder/themes/[installId]/publish/route.ts").match(/quietAfterPublish\(installId\)/g) ?? []).length === 4 && (read("app/api/themes/marketplace/add/route.ts").match(/quietAfterPublish\(owner\.installId\)/g) ?? []).length === 2)
    for (const f of ["app/api/website-builder/themes/[installId]/route.ts", "app/api/website-builder/themes/[installId]/sections/route.ts", "app/api/website-builder/themes/[installId]/files/route.ts"]) {
      check(`${f.split("/").slice(-2).join("/")} counts its GET as a read of that website's editor`, /asEditorRead\(\(await (ctx|params)\.params\)\.installId, \(\) => (readGET|handleGET)\(req, (ctx|params)\)\)/.test(read(f)))
    }
  }

  out("\n5. Every section's schema read a few at a time, and the bundles that parse only files with the tag")
  {
    const sources = filesOf(await timed(`${base()}/files?sources=1`))
    /* As a browser has them: texts this process has not read yet (the routes above read their schemas on the server). */
    const fresh = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, `${v}\n`]))
    const unread = unreadSections(fresh)
    check("a theme's worth of section files is more than is read at once", unread.length > READ_AT_ONCE, unread.length)
    /* A clock that moves 5 ms each time it is read: how many times the reading gave way is how often it read the clock beyond once per file. */
    let reads = 0
    const done = await readInSlices(unread.slice(0, 40), () => false, () => ++reads * 5)
    const gaveWay = reads - 1 - 40
    check("read in slices: every schema is then held", done && unread.slice(0, 40).every(([, s]) => schemaHeld(s)))
    check("and it gave the page its turn between slices", gaveWay > 5, gaveWay)
    let asked = 0
    const halted = await readInSlices(unread.slice(40, 60), () => ++asked > 3)
    check("told to stop, it stops", halted === false && !unread.slice(40, 60).every(([, s]) => schemaHeld(s)))

    /* Every file mayHoldTag lets go holds no {% stylesheet %} and no {% javascript %}: the bundles are the same. */
    let skipped = 0
    const wrong: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      if (!/^(sections|blocks|snippets)\/[^/]+\.(storelib|liquid)$/.test(path)) continue
      for (const tag of ["stylesheet", "javascript"] as const) {
        if (mayHoldTag(text, tag)) continue
        skipped++
        const markup = isCompatSource(text) ? compatMarkupOf(text) : text
        let parsed: ReturnType<typeof parseCompat> | null = null
        try { parsed = parseCompat(markup) } catch { try { parsed = parseCompat(markup, { lax: true }) } catch { parsed = null } }
        if (parsed && (tag === "stylesheet" ? parsed.stylesheet : parsed.javascript).trim() !== "") wrong.push(`${path} ${tag}`)
      }
    }
    report("bundles", `${skipped} file and tag pairs not parsed for the bundles`)
    check("no file the bundles skip had anything for them", wrong.length === 0 && skipped > 600, wrong.slice(0, 5))
    check("a {% stylesheet %} tag, with or without dashes, and a line of a {% liquid %} tag, are still parsed", mayHoldTag("{% stylesheet %}a{}{% endstylesheet %}", "stylesheet") && mayHoldTag("{%- stylesheet -%}", "stylesheet") && mayHoldTag("{% liquid\n  stylesheet\n%}", "stylesheet") && mayHoldTag("{% javascript %}x{% endjavascript %}", "javascript") && !mayHoldTag("{{ 'a.css' | stylesheet_tag }}", "stylesheet"))
  }

  out("\n6. The editor asks as measured, and the slow path never ends without the page")
  {
    const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("the open asks for the page's sources first (types=), the rest once idle (rest=)", page.includes('readSourcesPart(installId, `&types=${types.join(",")}`)') && page.includes('readSourcesPart(installId, `&rest=${types.join(",")}`)'))
    check("the canvas draws once the page's part covers its sections", page.includes("sourcesReady={canvasSourcesReady}") && page.includes("storelibPageRead && sourcesCover(sections, storelibSources)"))
    check("a whole read already asked for a website found to be imported is let go for the page's part", page.includes("whole.abort()"))
    check("the open's read of the sources is asked again by itself (4s, 12s, 30s), never left as no sources", page.includes("SOURCES_AGAIN_MS = [0, 4_000, 12_000, 30_000]") && page.includes("keepTrying: !last"))
    check("a theme's worth of schemas is read in slices (useCustomSchemas)", page.includes("useCustomSchemas(storelibSources)") && !page.includes("useMemo(() => customSectionSchemas(storelibSources)"))
    const files = read("components/website-builder/compat/compat-files.ts")
    check("the canvas asks for the theme's files with scripts by version", files.includes("files?compat=1&scripts=versions"))
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("a failed read of the theme's files is asked again by itself (3s, 10s, 30s, and when back online), said as a slow wait meanwhile", canvas.includes("FILES_AGAIN_MS = [3_000, 10_000, 30_000]") && canvas.includes('addEventListener("online", go)'))
    const lib = read("components/website-builder/editor/section-library.tsx")
    check("the library is drawn ahead only once the canvas has painted", lib.includes("afterCanvasPainted(() => { t = window.setTimeout") && page.includes("noteCanvasPainted()"))
    check("sourcesCover: a list whose types all have files", sourcesCover([{ type: "a" }, { type: "b" }], { "sections/a.storelib": "", "sections/b.liquid": "" }) && !sourcesCover([{ type: "c" }], {}))
    check("withRest keeps what the editor holds", JSON.stringify(withRest({ a: "1" }, { a: "2", b: "3" })) === JSON.stringify({ a: "1", b: "3" }))
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
