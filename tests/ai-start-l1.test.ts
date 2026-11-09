/**
 * ===========================================================================
 *  ROUND L, L1: START WITH AI, FROM THE EXAMPLE CHIP TO THE JOB ROW
 * ===========================================================================
 * The journey Andrew asked for: Describe your website, press Fitness coach,
 * the example's words land in the box, the person edits them, presses
 * Create (twice), and the server makes ONE website and ONE job whose row
 * holds the exact words, the category and blank or theme, before the editor
 * is opened on `?start=ai&job=<id>`; the job is kicked on the server, and
 * the editor finds it again from the server after a reload.
 *
 *   1. The pure parts (lib/website-builder/ai-site/start-options.ts): what a
 *      chip press does to words already in the box, the options checked,
 *      the generator's context line, the key kept per words and options,
 *      the box kept across a reload.
 *   2. The rows (create-website.ts): a blank page start has no header,
 *      footer or theme sections; the theme start is as before.
 *   3. The job row (ai-site/start.ts): options, mode and engine written; a
 *      database without SQL part 401 still gets the prompt.
 *   4. The journey through the REAL routes (tests/_journey: in memory
 *      PostgREST built from the SQL files, so the unique key on
 *      (creator_id, idempotency_key) is the database's own).
 *
 * Strict: it drives route handlers through tests/_journey.
 */
import "./_journey/env"
process.env.CHROMIUM_PATH = "/nonexistent/chromium" /* the cover is not this suite's: fail fast, the answer says pending or none */
process.env.AI_JOB_SECRET = "journey-ai-job-secret-for-tests-only" /* the signed hand over to the run route (ai-site/server.ts jobToken) */
import { Journey } from "./_journey/harness"
import {
  START_PRESETS,
  chipAction,
  clearStartDraft,
  forgetPendingStart,
  parseStartOptions,
  pendingStartKey,
  presetFor,
  readStartDraft,
  saveStartDraft,
  startContext,
  startHash,
  PENDING_TTL_MS,
} from "@/lib/website-builder/ai-site/start-options"
import { BLANK_SETTINGS, startRows } from "@/lib/website-builder/create-website"
import { isMissingColumn, startEngine, startJobRow } from "@/lib/website-builder/ai-site/start"
import { readJobParam, withJobParam } from "@/lib/website-builder/start-handoff"
import { START_CATEGORIES, type StartOptions } from "@/lib/ai-builder/types"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)

function memoryStorage() {
  const store = new Map<string, string>()
  return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
}

const FITNESS = presetFor("fitness_coach").prompt
const CANDLES = presetFor("candle_shop").prompt

async function main() {
  section("1. The chips, the options, the key")
  {
    check("one example per category, in the contract's order", START_PRESETS.map((p) => p.id).join() === START_CATEGORIES.join())
    check("the Fitness coach words are the page's own", FITNESS === "A website for my personal training business with my programs, client results, prices and a way to book a free first call.")
    check("an empty box takes the example", JSON.stringify(chipAction("", null, FITNESS)) === JSON.stringify({ kind: "replace", text: FITNESS }))
    check("  spaces only count as empty", chipAction("  \n ", null, FITNESS).kind === "replace")
    check("the last example's words untouched: another example replaces them", JSON.stringify(chipAction(FITNESS, FITNESS, CANDLES)) === JSON.stringify({ kind: "replace", text: CANDLES }))
    const edited = `${FITNESS} I am based in Leeds.`
    const ask = chipAction(edited, FITNESS, CANDLES)
    check("words the person changed are never replaced on their own: asked", ask.kind === "ask")
    check("  with Replace and Add to mine ready", ask.kind === "ask" && ask.replace === CANDLES && ask.append === `${edited}\n\n${CANDLES}`)
    check("  their own words with no example before: asked too", chipAction("My bakery", null, CANDLES).kind === "ask")
    check("  the same words again: nothing to do", chipAction(FITNESS, FITNESS, FITNESS).kind === "none")

    check("no options: inside the theme, as before", JSON.stringify(parseStartOptions(undefined)) === JSON.stringify({ ok: true, options: { generation: "theme" } }))
    const full = parseStartOptions({ generation: "blank", category: "fitness_coach", preset: "warm-studio", preferences: { pages: [" Programs ", "Book"], tone: "friendly", colors: ["#AA3300"], language: "en" } })
    check("every option kept, checked", full.ok && JSON.stringify(full.options) === JSON.stringify({ generation: "blank", category: "fitness_coach", preset: "warm-studio", preferences: { pages: ["Programs", "Book"], tone: "friendly", colors: ["#aa3300"], language: "en" } }), full)
    check("an unknown category is refused, never dropped", !parseStartOptions({ generation: "theme", category: "yoga" }).ok)
    check("  an unknown generation too", !parseStartOptions({ generation: "remix" }).ok)
    check("  a colour that is not hex, a preset with markup, an array: refused", !parseStartOptions({ generation: "theme", preferences: { colors: ["red"] } }).ok && !parseStartOptions({ generation: "theme", preset: "<x>" }).ok && !parseStartOptions([]).ok)

    const ctx = startContext({ generation: "blank", category: "fitness_coach" })
    check("the category and blank page reach the generator's context", /Personal trainer and fitness coach/.test(ctx) && /blank page/i.test(ctx), ctx)
    check("  inside the theme says so", /keep its header and footer/.test(startContext({ generation: "theme" })))

    const s = memoryStorage()
    let n = 0
    const make = () => `key-${++n}-abcdef`
    const opts: StartOptions = { generation: "blank", category: "fitness_coach" }
    const k1 = pendingStartKey(s, edited, opts, make, 1_000)
    check("the same words and options pressed again: the same key", pendingStartKey(s, edited, opts, make, 2_000) === k1)
    check("  after a reload too (it is in this tab's storage)", pendingStartKey({ ...s }, edited, opts, make, 3_000) === k1)
    check("  other words: a new key", pendingStartKey(s, `${edited}!`, opts, make, 4_000) !== k1)
    check("  other options: a new key", startHash(edited, opts) !== startHash(edited, { generation: "theme", category: "fitness_coach" }))
    const k3 = pendingStartKey(s, edited, opts, make, 5_000)
    check("  an old press is not reused", pendingStartKey(s, edited, opts, make, 5_000 + PENDING_TTL_MS) !== k3)
    forgetPendingStart(s)
    check("  answered: the next press is new", pendingStartKey(s, edited, opts, make, 6_000) !== k3)
    const refusing = { getItem: () => { throw new Error("no") }, setItem: () => { throw new Error("no") }, removeItem: () => { throw new Error("no") } }
    check("  storage refused: a key all the same", /^key-/.test(pendingStartKey(refusing, edited, opts, make)))

    const d = memoryStorage()
    saveStartDraft(d, { prompt: edited, category: "fitness_coach", inserted: FITNESS, generation: "blank" })
    check("the box is kept across a reload of the Website page", JSON.stringify(readStartDraft(d)) === JSON.stringify({ prompt: edited, category: "fitness_coach", inserted: FITNESS, generation: "blank" }))
    clearStartDraft(d)
    check("  and gone once the website is made", readStartDraft(d) === null)
  }

  section("2. The new website's rows: blank page or inside the theme")
  {
    const blank = startRows("none")!
    const home = blank.pages.find((p) => p.page_key === "home")!
    const product = blank.pages.find((p) => p.page_key === "product")!
    check("blank: the home page has no sections, so no header and no footer", home.sections.length === 0)
    check("  the product page only draws the product", product.sections.length === 1 && product.sections[0].type === "product")
    /* Changed on purpose (round L integration): a blank site is also marked site_chrome "home" (L4), so no page draws a stored theme header. */
    check("  neutral settings, no Foundation brand name, home-only chrome", JSON.stringify(blank.settings) === JSON.stringify({ ...BLANK_SETTINGS, site_chrome: "home" }) && !("brand_name" in blank.settings))
    const theme = startRows("theme")!
    const themeHome = theme.pages.find((p) => p.page_key === "home")!.sections
    check("inside the theme: header and footer, as before", themeHome.map((s) => s.type).join() === "header,footer" && JSON.stringify(startRows()) === JSON.stringify(theme))
  }

  section("3. The job row")
  {
    const writes: Record<string, unknown>[] = []
    const db = (answers: { data: unknown; error: unknown }[]) => ({
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          writes.push(row)
          const a = answers.shift()!
          return { select: () => ({ single: async () => a }) }
        },
      }),
    })
    const opts: StartOptions = { generation: "blank", category: "fitness_coach" }
    const made = await startJobRow(db([{ data: { id: "j1" }, error: null }]) as never, { creatorId: "c", ownerUserId: "u", installId: "i", prompt: "  exact words \n", key: "abcdefgh", options: opts, engine: "classic" })
    check("made, with the prompt exactly, the options, mode and engine", made.kind === "made" && writes[0].prompt === "  exact words \n" && JSON.stringify(writes[0].options) === JSON.stringify(opts) && writes[0].mode === "blank" && writes[0].engine === "classic")
    writes.length = 0
    const old = await startJobRow(db([{ data: null, error: { code: "PGRST204", message: "Could not find the 'options' column of 'ai_site_jobs' in the schema cache" } }, { data: { id: "j2" }, error: null }]) as never, { creatorId: "c", ownerUserId: "u", installId: "i", prompt: "p", key: "abcdefgh", options: opts })
    check("before SQL part 401: made again without the new columns, the prompt kept", old.kind === "made" && writes.length === 2 && !("options" in writes[1]) && writes[1].prompt === "p")
    check("  a missing column is not taken for a missing table", isMissingColumn({ code: "PGRST204", message: "Could not find the 'options' column of 'ai_site_jobs' in the schema cache" }) && !isMissingColumn({ code: "42P01" }))
    check("the engine: classic unless AI_BUILDER_AGENT=1", startEngine({}) === "classic" && startEngine({ AI_BUILDER_AGENT: "1" }) === "agent")
  }

  section("4. The journey: Fitness coach, edited, Create twice, one website and one job")
  {
    const j = await Journey.start()
    const kicks: string[] = []
    j.net.routes.push({
      match: (u) => /^\/api\/website-builder\/ai-jobs\/[0-9a-f-]+\/run$/.test(u.pathname),
      answer: (req) => {
        kicks.push(new URL(req.url).pathname)
        return new Response(null, { status: 202 })
      },
    })
    const seller = await j.signUp("coach@example.com", { name: "Jo Coach" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "jocoach" } })
    const creatorId = j.rows("creators").find((c) => c.user_id === seller.id)?.id as string
    check("a store to make websites in", typeof creatorId === "string")

    /* The page: Fitness coach pressed on an empty box, then the person adds a line of their own. */
    const press = chipAction("", null, FITNESS)
    const typed = press.kind === "replace" ? `${press.text}\nI coach online and in Leeds, mostly beginners.\n` : ""
    const options: StartOptions = { generation: "blank", category: "fitness_coach" }
    const tab = memoryStorage()
    let keys = 0
    const key = pendingStartKey(tab, typed, options, () => `0b7c1e2a-0000-4000-8000-00000000000${++keys}`)
    const body = { mode: "ai", prompt: typed, key, options }
    const installsOf = () => j.rows("store_theme_installs").filter((r) => r.creator_id === creatorId).length
    const installsBefore = installsOf()

    /* Nothing is made for an AI press the server cannot use. */
    const noKey = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "ai", prompt: typed, options } })
    const empty = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "ai", prompt: "   ", key, options } })
    const long = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "ai", prompt: "x".repeat(2001), key, options } })
    const badCat = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "ai", prompt: typed, key, options: { generation: "blank", category: "yoga" } } })
    check("no key, no words, too many words, an unknown category: 400, and no website", noKey.status === 400 && empty.status === 400 && long.status === 400 && badCat.status === 400 && installsOf() === installsBefore, [noKey.status, empty.status, long.status, badCat.status])

    /* Changed on purpose (round N, N1): From scratch is the new AI builder's. With it off for the account the press is refused, said in words, and nothing is made; never the older builder on the theme's sections in its place. */
    const off = await j.call("POST /api/website-builder/themes/create", { as: seller, body })
    check("round N: blank with the new AI builder off for the account: 409 agent_off, no website, no job", off.status === 409 && off.json?.code === "agent_off" && installsOf() === installsBefore && j.rows("ai_site_jobs").filter((r) => r.creator_id === creatorId).length === 0, { status: off.status, json: off.json })
    process.env.AI_BUILDER_AGENT_ACCOUNTS = "jocoach"
    const first = await j.call("POST /api/website-builder/themes/create", { as: seller, body })
    check("Create: a website and a job", first.status === 200 && typeof first.json?.install?.id === "string" && typeof first.json?.job?.id === "string", first.json)
    /* The second press (a double click, or a retry after a lost answer, or a reload: the tab gives the same key). */
    const again = pendingStartKey({ ...tab }, typed, options, () => "never-used-key")
    const second = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { ...body, key: again } })
    check("Create again with the same press: the same website and job", second.status === 200 && second.json?.install?.id === first.json?.install?.id && second.json?.job?.id === first.json?.job?.id, second.json)

    const installId = first.json.install.id as string
    const jobId = first.json.job.id as string
    const jobs = j.rows("ai_site_jobs").filter((r) => r.creator_id === creatorId)
    check("one new website, one job", installsOf() === installsBefore + 1 && jobs.length === 1, { before: installsBefore, installs: installsOf(), jobs: jobs.length })
    const row = jobs[0] ?? {}
    check("the job row holds the prompt exactly as typed", row.prompt === typed, row.prompt)
    check("  the category and blank page in options, mode blank", JSON.stringify(row.options) === JSON.stringify(options) && row.mode === "blank", { options: row.options, mode: row.mode })
    /* Changed on purpose (round N): a blank page start runs on the agent engine (on for this account), never the classic one. */
    check("  queued for the agent engine with the press's key", row.status === "queued" && row.engine === "agent" && row.idempotency_key === key && row.install_id === installId, { engine: row.engine, status: row.status })
    delete process.env.AI_BUILDER_AGENT_ACCOUNTS
    check("the job was started on the server once, after the answer", kicks.length === 1 && kicks[0] === `/api/website-builder/ai-jobs/${jobId}/run`, kicks)

    const pages = j.rows("store_theme_pages").filter((p) => p.install_id === installId)
    const home = pages.find((p) => p.page_key === "home")
    check("blank page: the home page has no header, footer or sections", Array.isArray(home?.sections) && (home!.sections as unknown[]).length === 0, home?.sections)

    /* The page opens the editor on the job, never with the words in the address. */
    const href = withJobParam(`/store/jocoach/themes/${installId}/editor?previewPath=%2F`, jobId)
    check("the builder route: the editor, start=ai and the job", href === `/store/jocoach/themes/${installId}/editor?previewPath=%2F&start=ai&job=${jobId}` && readJobParam(`https://storelib.com${href}`).jobId === jobId && !href.includes("Leeds"))

    /* The editor in another tab, the address and the tab's storage both gone: the server's record. */
    const found = await j.call(`GET /api/website-builder/themes/${installId}/ai-start`, { as: seller })
    check("the editor finds the job again from the server, with the exact prompt and options", found.status === 200 && found.json?.job?.id === jobId && found.json?.job?.prompt === typed && JSON.stringify(found.json?.job?.options) === JSON.stringify(options), found.json)
    const stranger = await j.signUp("other@example.com", { name: "Other" })
    await j.call("POST /api/onboarding/finalize", { as: stranger, body: { role: "creator", creatorSlug: "othercoach" } })
    const theirs = await j.call(`GET /api/website-builder/themes/${installId}/ai-start`, { as: stranger })
    check("  another store asking for it: not found", theirs.status === 404 && !JSON.stringify(theirs.json).includes("Leeds"), theirs)

    /* Inside the theme, a custom prompt and no chip: as before, header and footer, no category. */
    const custom = "A one page site for my pottery classes in Porto, Saturdays only."
    const themeKey = pendingStartKey(memoryStorage(), custom, { generation: "theme" }, () => "1b7c1e2a-0000-4000-8000-000000000009")
    /* One job at a time per store (MAX_RUNNING_JOBS): the first is finished for this press. */
    const firstRow = j.rows("ai_site_jobs").find((r) => r.id === jobId)!
    firstRow.status = "complete"
    const busyBefore = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "ai", prompt: custom, key: themeKey, options: { generation: "theme" } } })
    check("a custom prompt inside the theme: made", busyBefore.status === 200 && typeof busyBefore.json?.job?.id === "string", busyBefore.json)
    const themeJob = j.rows("ai_site_jobs").find((r) => r.id === busyBefore.json?.job?.id) ?? {}
    check("  its words exactly, no category, mode theme", themeJob.prompt === custom && JSON.stringify(themeJob.options) === JSON.stringify({ generation: "theme" }) && themeJob.mode === "theme")
    const themeHome = j.rows("store_theme_pages").find((p) => p.install_id === busyBefore.json?.install?.id && p.page_key === "home")
    check("  and the theme's header and footer, as before", ((themeHome?.sections ?? []) as { type: string }[]).map((s) => s.type).join() === "header,footer")

    const plain = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "blank" } })
    check("Start from blank (no AI) is unchanged: a website with header and footer, no job", plain.status === 200 && !plain.json?.job && ((j.rows("store_theme_pages").find((p) => p.install_id === plain.json?.install?.id && p.page_key === "home")?.sections ?? []) as { type: string }[]).map((s) => s.type).join() === "header,footer")

    check("no server errors on the way", j.serverErrors.length === 0 && j.afterErrors.length === 0, { server: j.serverErrors, after: j.afterErrors })
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
