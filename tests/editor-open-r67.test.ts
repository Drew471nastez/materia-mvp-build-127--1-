/**
 * ===========================================================================
 *  THE FIRST OPEN AFTER ADD OR PUBLISH (round 67)
 * ===========================================================================
 * The owner: "When I add a new theme and hit Publish, or want to get inside
 * it to start editing in the website builder, I get 'Still opening your
 * website / Storelib is slow to answer'."
 *
 * Measured through the real route handlers over the stand-in Supabase of
 * tests/_r65-rest-world.ts on the real Materia clothing template stored by
 * the marketplace's own storeImportedTheme: the editor's first read (the
 * install and the home page's sections, page.tsx loadData), asked while the
 * work an Add or a Publish leaves behind (the cover's draw, the publish's
 * after() work) is reading the same database over one shared link.
 *
 * Each scenario prints R67 <name>: <numbers>.
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
import { POST as publishPost } from "@/app/api/website-builder/themes/[installId]/publish/route"
import { compatDraftHome } from "@/lib/website-builder/compat-site"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)?.slice(0, 400)}` : ""}`) }
}
const report = (name: string, line: string) => out(`  R67 ${name}: ${line}`)
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
  if (p === `/api/website-builder/themes/${id}/publish`) return (await publishPost(req, params)) as Response
  return new Response("{}", { status: 404 })
}
installFetch(app)

const install = () => `/api/website-builder/themes/${INSTALL}`
const sections = () => `/api/website-builder/themes/${INSTALL}/sections?page=home`

/** The editor's first read: both asked at once, timed until both have answered (the "Still opening" clock). */
async function firstRead(): Promise<{ ms: number; ok: boolean }> {
  const t = performance.now()
  const [a, b] = await Promise.all([fetch(install()), fetch(sections())])
  await Promise.all([a.text(), b.text()])
  return { ms: Math.round(performance.now() - t), ok: a.status === 200 && b.status === 200 }
}

/** The sections read alone: its database asks in order, and the longest chain of asks that waited on each other. */
async function sectionsAlone(path = sections()) {
  resetCounts()
  world.log = []
  const t = performance.now()
  const r = await fetch(path)
  const body = await r.text()
  const ms = Math.round(performance.now() - t)
  const log = world.log
  world.log = null
  /* Asks that started after the one before had ended are serial waits. */
  let serial = 0
  let lastEnd = -1
  for (const e of [...log].sort((x, y) => x.at - y.at)) {
    if (e.at >= lastEnd) serial++
    lastEnd = Math.max(lastEnd, e.end)
  }
  return { status: r.status, ms, db: world.bytes, asks: log.length, serial, body, log }
}

async function main() {
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
  /* The policy pages a first open makes, made now, so each scenario below is the same open. */
  await fetch(install())

  net.rttMs = 25
  net.mbps = 25
  out("\n1. The home page's sections, alone")
  {
    const s = await sectionsAlone()
    const byTable = new Map<string, number>()
    for (const e of s.log) byTable.set(e.table, (byTable.get(e.table) ?? 0) + e.bytes)
    report("sections alone", `${s.status} ${s.ms} ms, ${s.asks} database asks, ${s.serial} one after another, database ${MB(s.db)} (${[...byTable].map(([k, v]) => `${k} ${MB(v)}`).join(", ")}), answer ${Math.round(s.body.length / 1024)} KB`)
    check("the sections read answers", s.status === 200)
    check("it moves under 1 MB from the database (was 2.96 MB)", s.db < 1_000_000, MB(s.db))
    check("in at most 4 asks one after another (was 7)", s.serial <= 4, s.serial)
    const i = await sectionsAlone(install())
    report("install alone", `${i.status} ${i.ms} ms, ${i.asks} database asks, ${i.serial} one after another, database ${MB(i.db)}, answer ${Math.round(i.body.length / 1024)} KB`)
    for (const e of i.log) out(`      ${e.table} ${e.method} ${Math.round(e.at)}-${Math.round(e.end)} ${e.select.slice(0, 80)}`)
    out("    sections:")
    for (const e of s.log) out(`      ${e.table} ${e.method} ${Math.round(e.at)}-${Math.round(e.end)} ${e.bytes} ${e.select.slice(0, 80)}`)
  }

  out("\n1b. A busy database: every ask waits 800 ms before it starts to answer")
  {
    net.rttMs = 800
    const r = await firstRead()
    net.rttMs = 25
    report("first read, busy database", `${r.ms} ms`)
    check("on a busy database the first read is under 6 s (was ~8 s)", r.ms < 6000, r.ms)
  }

  out("\n2. Opened while the cover of a website just added is drawn (one shared link)")
  for (const mbps of [10, 3]) {
    net.shared = true
    net.mbps = mbps
    const quiet = await firstRead()
    resetCounts()
    const cover = compatDraftHome(INSTALL).catch(() => null)
    await new Promise((r) => setTimeout(r, 100))
    const busy = await firstRead()
    const tc = performance.now()
    await cover
    net.shared = false
    report(`open beside the cover at ${mbps} MB/s`, `quiet ${quiet.ms} ms | beside the cover's draw ${busy.ms} ms (cover finished ${Math.round(performance.now() - tc)} ms later), database ${MB(world.bytes)}`)
    check(`at ${mbps} MB/s the first read answers`, quiet.ok && busy.ok)
  }

  out("\n3. Opened right after Publish, while the publish's work after the answer runs (one shared link)")
  for (const mbps of [10, 3]) {
    net.shared = true
    net.mbps = mbps
    afterTasks.length = 0
    resetCounts()
    holdRequest()
    const pub = await fetch(`/api/website-builder/themes/${INSTALL}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) })
    check(`at ${mbps} MB/s it publishes`, pub.status === 200, await pub.clone().text())
    resetCounts()
    world.log = []
    const tAfter = performance.now()
    /* As on Vercel: every after() task at once, once the answer has gone. */
    const running = Promise.all(afterTasks.splice(0).map((task) => Promise.resolve().then(task).catch(() => {})))
    await new Promise((r) => setTimeout(r, 100))
    const busy = await firstRead()
    await running
    const log = world.log
    world.log = null
    const byTable = new Map<string, number>()
    for (const e of log) byTable.set(e.table, (byTable.get(e.table) ?? 0) + e.bytes)
    net.shared = false
    report(`open after publish at ${mbps} MB/s`, `first read ${busy.ms} ms | the work after the answer: database ${MB(world.bytes)} in ${Math.round(performance.now() - tAfter)} ms (${[...byTable].filter(([, v]) => v > 100_000).map(([k, v]) => `${k} ${MB(v)}`).join(", ")})`)
    check(`at ${mbps} MB/s the first read answers`, busy.ok)
  }
  net.mbps = 25

  out("\n4. What stays as it was")
  {
    const s = await sectionsAlone()
    const body = JSON.parse(s.body) as { sections: { type: string; group?: string }[] }
    check("the home page still comes with its sections", body.sections.some((x) => x.type === "slideshow"), body.sections.map((x) => x.type))
    void read
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
