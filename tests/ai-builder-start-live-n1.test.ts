/**
 * ===========================================================================
 *  ROUND N, N1: PRESS START WITH AI, LAND IN THE EDITOR, WATCH IT BEING BUILT
 * ===========================================================================
 * Andrew: "When I start with the AI builder it needs to open the website
 * builder immediately and start designing in real time. I cannot see it."
 * and "It should NOT take me to the default theme."
 *
 * The root causes found (each pinned below, so none comes back):
 *
 *   R1  the create call waited up to 8 s for a photograph of the empty site
 *       before it answered, and the page showed only a spinner in Create;
 *   R2  the editor then said "Loading the editor", and the job was followed
 *       only once the website had loaded, after a first classic poll;
 *   R3  the canvas showed the theme's header and footer around "Empty Page"
 *       (inside the theme) or a white card (from scratch) while it built;
 *   R4  the agent's drafts were read again at most every 8 s, only for the
 *       open page, so a page it wrote other than home never showed;
 *   R5  the progress card sat in the middle of the canvas, up to 560 px tall,
 *       over the place the sections land, and said "write file
 *       sections/ai_x.storelib" in the tool's own words;
 *   R6  the start screen built inside Storelib's theme unless a checkbox was
 *       ticked, and with the new AI builder off for the account a "from
 *       scratch" press ran the older builder on the theme's sections.
 *
 *   1. The pure parts (lib/website-builder/ai-site/live-build.ts,
 *      start-options.ts): debounce, follow, plain steps, the default.
 *   2. What the screens draw (renderToStaticMarkup): the start screen with
 *      and without the new AI builder, the building canvas, the docked
 *      progress card, the classic card's honest note.
 *   3. The wiring in the editor, the hook, the create route (source checks).
 *   4. The real create route (tests/_journey): an AI press answers without a
 *      cover wait, a blank press without the agent is refused, with it the
 *      job runs on the agent engine.
 */
import "./_journey/env"
process.env.CHROMIUM_PATH = "/nonexistent/chromium" /* no browser here: a cover that were waited for would fail fast, not hang */
process.env.AI_JOB_SECRET = "journey-ai-job-secret-for-tests-only"
delete process.env.AI_BUILDER_AGENT
delete process.env.AI_BUILDER_AGENT_ACCOUNTS
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Journey } from "./_journey/harness"
import type { AgentEvent } from "@/lib/ai-builder/types"
import { LIVE_MAX_WAIT_MS, LIVE_QUIET_MS, arrivedIds, currentStep, followPage, liveRefreshDelay, pageWords, showBuilding, toolStep } from "@/lib/website-builder/ai-site/live-build"
import { START_GENERATION, readStartDraft, saveStartDraft, startGeneration } from "@/lib/website-builder/ai-site/start-options"
import { StartWebsite } from "@/app/(storelib)/app/website-builder/start-website"
import { BuildingCanvas } from "@/components/website-builder/ai-generation/building-canvas"
import { AgentProgressPanel, eventLine } from "@/components/website-builder/ai-generation/agent-progress-panel"
import { GenerationPanel } from "@/components/website-builder/ai-generation/generation-panel"
import type { AgentJobView } from "@/lib/website-builder/ai-site/agent-progress"

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
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Source without comments, so a check reads code, not the notes about it. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")

const at = "2026-11-09T12:00:00Z"
const tool = (seq: number, name: string, summary: string, ok = true): AgentEvent => ({ seq, at, kind: "tool", tool: name as never, summary, ok, ms: 10 })
const page = (seq: number, key: string, action: "created" | "updated" | "removed", sections: number): AgentEvent => ({ seq, at, kind: "page", page: key, title: key, action, sections })
const file = (seq: number, path: string): AgentEvent => ({ seq, at, kind: "file", path, action: "created", bytes: 100 })

function memoryStorage() {
  const store = new Map<string, string>()
  return { store, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
}

async function main() {
  section("1. The pure parts")
  {
    /* R4: debounced, never starved */
    check("a change alone is read LIVE_QUIET_MS later", liveRefreshDelay({ now: 1_000, firstAt: 1_000, lastAt: 1_000 }) === LIVE_QUIET_MS && LIVE_QUIET_MS < 1_500)
    check("  a newer change pushes it back", liveRefreshDelay({ now: 1_500, firstAt: 1_000, lastAt: 1_500 }) === LIVE_QUIET_MS)
    check("  but never past LIVE_MAX_WAIT_MS after the first (changes that keep coming still show)", liveRefreshDelay({ now: 1_000 + LIVE_MAX_WAIT_MS - 200, firstAt: 1_000, lastAt: 1_000 + LIVE_MAX_WAIT_MS - 200 }) === 200 && LIVE_MAX_WAIT_MS <= 3_000)
    check("  and never negative", liveRefreshDelay({ now: 99_999, firstAt: 1_000, lastAt: 1_000 }) === 0)
    check("the old 8 s throttle is gone from the editor", !/AGENT_REFRESH_MS = 8_000/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))

    /* R4: the page the agent is on */
    check("follow: the newest page it filled", followPage([page(1, "home", "updated", 5), file(2, "sections/ai_x.storelib"), page(3, "about", "updated", 3)]) === "about")
    check("  not a page it removed, not one just made empty", followPage([page(1, "home", "updated", 5), page(2, "faq", "created", 0), page(3, "old", "removed", 0)]) === "home")
    check("  nothing about a page: stay", followPage([file(1, "sections/ai_x.storelib")]) === null)

    /* R5: plain words */
    check("writing a section: Designing the header", toolStep({ tool: "write_file", summary: "write file sections/ai_header.storelib", ok: true }) === "Designing the header")
    check("  a page laid out: Writing the product page", toolStep({ tool: "set_page_sections", summary: "set page sections page product", ok: true }) === "Writing the product page")
    check("  a page of its own: Adding the size guide page", toolStep({ tool: "add_page", summary: "add page page size-guide", ok: true }) === "Adding the size guide page")
    check("  a refused write: Fixing the hero banner", toolStep({ tool: "write_file", summary: "write file sections/ai_hero_banner.storelib: 2 errors", ok: false }) === "Fixing the hero banner")
    check("  looking around is not a step", toolStep({ tool: "list_files", summary: "list files", ok: true }) === null && toolStep({ tool: "read_file", summary: "read file sections/ai_x.storelib", ok: true }) === null)
    check("  the tool's own words never leak", ![toolStep({ tool: "write_file", summary: "write file sections/ai_header.storelib", ok: true }), toolStep({ tool: "set_page_sections", summary: "set page sections page home", ok: true })].some((x) => /storelib|sections\/|_/.test(x ?? "")))
    check("current step: the newest that says something", currentStep([tool(1, "set_tokens", "set tokens"), tool(2, "list_files", "list files"), tool(3, "write_file", "write file sections/ai_header.storelib")]) === "Designing the header")
    check("  a page event: Writing the home page", currentStep([file(1, "sections/ai_hero.storelib"), page(2, "home", "updated", 4)]) === "Writing the home page")
    check("  nothing yet: null", currentStep([]) === null && pageWords("home") === "the home page")
    check("no em dash in any step", ![toolStep({ tool: "render_check", summary: "render check page home", ok: true }), toolStep({ tool: "bind_data", summary: "bind data page shop", ok: true }), currentStep([{ seq: 1, at, kind: "phase", phase: "plan", label: "x" }])].some((x) => (x ?? "").includes("—")))

    /* R3: the building state */
    check("building shows while live on an empty page", showBuilding({ live: true, bodyCount: 0 }) && !showBuilding({ live: true, bodyCount: 1 }) && !showBuilding({ live: false, bodyCount: 0 }) && !showBuilding({ live: true, bodyCount: 0, missing: true }))
    check("arrived: the new ids in page order", arrivedIds(["a", "b"], [{ id: "a" }, { id: "n1" }, { id: "b" }, { id: "n2" }]).join() === "n1,n2")

    /* R6: the default */
    check("Start with AI builds from scratch by default", START_GENERATION === "blank")
    check("  the new AI builder off: the press builds inside the theme (the page says so), never 'blank' on the older builder", startGeneration("blank", false) === "theme" && startGeneration("blank", true) === "blank" && startGeneration("theme", true) === "theme")
    const old = memoryStorage()
    old.setItem("storelib:start-ai-draft", JSON.stringify({ prompt: "My bakery", category: null, inserted: null, generation: "theme" }))
    check("  a draft from before this round (its 'theme' was the old default): from scratch", readStartDraft(old)?.generation === "blank" && readStartDraft(old)?.prompt === "My bakery")
    const now = memoryStorage()
    saveStartDraft(now, { prompt: "My bakery", category: null, inserted: null, generation: "theme" })
    check("  inside the theme picked this round: kept across a reload", readStartDraft(now)?.generation === "theme")
    saveStartDraft(now, { prompt: "", category: null, inserted: null, generation: "blank" })
    check("  an empty box on the default: nothing kept", now.store.size === 0)
  }

  section("2. What the screens draw")
  {
    const start = (agent: boolean) => renderToStaticMarkup(createElement(StartWebsite, { full: false, starting: null, agent, onStart() {}, onFull() {}, onBrowse() {} }))
    const on = start(true)
    check("start screen: From scratch is picked first", /data-start-generation="blank"/.test(on) && /data-start-generation-option="blank"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-start-generation-option="blank"/.test(on), on.match(/<div role="radiogroup"[\s\S]{0,600}/)?.[0])
    check("  the theme is the second option, named for what it keeps", /Inside Storelib(&#x27;|')s theme/.test(on) && /Keeps the theme(&#x27;|')s header, footer and sections/.test(on))
    check("  no 'Without the theme' checkbox any more", !/Without the theme/.test(on) && !/data-start-blank/.test(on))
    check("  no note while the new AI builder is on", !/data-start-agent-off/.test(on))
    const off = start(false)
    check("the new AI builder off: the theme is picked, From scratch cannot be, and one line says why", /data-start-generation="theme"/.test(off) && /data-start-agent-off/.test(off) && /The new AI builder isn(&#x27;|')t on for your account yet/.test(off) && /data-start-generation-option="blank"[^>]*disabled=""|disabled=""[^>]*data-start-generation-option="blank"/.test(off))
    check("  no em dash, never Shopify or Liquid", ![on, off].some((h) => /—|Shopify|Liquid/i.test(h)))

    const canvas = renderToStaticMarkup(createElement(BuildingCanvas, { step: "Designing the header" }))
    check("building canvas: what the AI is on, live for a screen reader, no grey outline of a page", /Designing your website/.test(canvas) && /Designing the header/.test(canvas) && /aria-live="polite"/.test(canvas) && /data-building-mark/.test(canvas) && !/skeleton|animate-pulse/.test(canvas))

    const view: AgentJobView = { id: "j", installId: "i", engine: "agent", status: "running", phase: "build", seq: 4, events: [], more: false, counts: { pagesPlanned: 4, pagesDone: 1 }, error: null, cancelRequested: false, summary: null, notes: [], continues: { used: 0, max: 3 } }
    const events = [tool(1, "set_tokens", "set tokens"), file(2, "sections/ai_header.storelib"), tool(3, "write_file", "write file sections/ai_header.storelib"), tool(4, "set_page_sections", "set page sections page home")]
    const panel = (collapsed: boolean) => renderToStaticMarkup(createElement(AgentProgressPanel, { view, events, busy: null, problem: null, onCancel() {}, onContinue() {}, onStartOver() {}, onClose() {}, startCollapsed: collapsed }))
    const open = panel(false)
    check("progress card: the step it is on and real counts under the title", /Writing the home page · 1 of 4 pages done/.test(open), open.match(/data-agent-line="">[^<]*/)?.[0])
    check("  the tool's own words never shown", !/write file|set page sections|\.storelib/.test(open))
    check("  a step a file line says is not said twice", (open.match(/header/g) ?? []).length === 1 && eventLine(tool(9, "write_file", "write file sections/ai_header.storelib")) === null)
    check("  not a 440 px card in the middle any more: the editor docks it", !/max-w-\[440px\]/.test(open) && /max-h-\[min\(52vh,480px\)\]/.test(open))
    const shut = panel(true)
    check("  on a phone the steps start closed, opened with a tap", /data-collapsed=""/.test(shut) && !/data-agent-events/.test(shut) && /aria-expanded="false"/.test(shut) && /data-agent-events/.test(open))

    const classic = renderToStaticMarkup(createElement(GenerationPanel, { view: { status: "running", step: "write", progress: 40, error: null, notes: [], findings: [], activity: [] }, mode: "job", onContinue() {}, onAskFix() {}, onClose() {} }))
    check("classic card: never passes for the new AI builder", /data-generation-engine="classic"/.test(classic) && /Built from the theme(&#x27;|')s sections\. The new AI builder isn(&#x27;|')t on for your account yet\./.test(classic))
  }

  section("3. The wiring")
  {
    const editor = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("R2: the editor knows the build before its first paint (a layout effect reads job= off the address)", /useLayoutEffect\(\(\) => \{\s*let stored: Storage \| null = null\s*try \{\s*stored = window\.sessionStorage/.test(editor))
    check("  opening on a build (and while its loader fades): the building canvas, not 'Loading the editor'", /\(showCanvasLoader \|\| openHold\) && buildLive \? \(\s*<div className="absolute inset-0 flex bg-white" data-building-opening="">\s*<BuildingCanvas/.test(editor))
    check("R3: an empty page while it builds is the building canvas, not 'Empty Page'", /building && showBuilding\(\{ live: true, bodyCount \}\) \? \(\s*<BuildingCanvas step=\{building\.step\} \/>/.test(editor) && editor.indexOf("showBuilding({ live: true, bodyCount })") < editor.indexOf("Empty Page"))
    check("  live from the first frame until the job's view says it ended", /genSource !== null &&\s*\(generation\.agent\.view \? !agentEnded : generation\.view \? genPhase === "working" : true\)/.test(editor))
    const live = editor.slice(editor.indexOf("const agentDraftsChanged = useCallback("), editor.indexOf("useEffect(() => () => { if (agentRefresh.current.timer)"))
    check("R4: debounced reads (liveRefreshDelay), files before the page, the agent's page followed", live.length > 200 && /liveRefreshDelay\(\{ now, firstAt: box\.firstAt, lastAt: box\.lastAt \}\)/.test(live) && live.indexOf("await reloadAiSources()") > 0 && live.indexOf("await reloadAiSources()") < live.indexOf("await loadData({ quiet: true })") && /followAgent\.current \? followPage\(taken\) : null/.test(editor) && /await handlePageChangeRef\.current\(target as PageKey\)/.test(editor))
    check("  the person picking a page stops the follow", /if \(!followingNow\.current\) followAgent\.current = false/.test(editor))
    check("  what the person is editing wins: no read over unsaved changes", /const calm = !isDirtyRef\.current && !savingRef\.current/.test(editor))
    check("  new sections are ringed, the newest arrives and is brought into view (not over the person's own scroll)", /setAiSettledIds\(fresh\)/.test(editor) && /setArrivedId\(newest\)/.test(editor) && /revealSection\(newest, true, undefined, buildOpenedAt\.current\)/.test(editor))
    check("R5: the card is docked, not centred over the canvas", /const GENERATION_DOCK = "pointer-events-none fixed inset-x-3 top-\[calc\(env\(safe-area-inset-top\)\+64px\)\] z-\[70\] flex justify-end md:left-auto md:right-5 md:w-\[360px\]"/.test(editor) && (editor.match(/data-generation-dock=""/g) ?? []).length === 2 && !/flex justify-center px-4" data-generation-dock/.test(editor) && /startCollapsed=\{isMobileView\}/.test(editor))

    const hook = code("lib/website-builder/ai-site/use-generation.ts")
    check("R2: the job is asked about before the editor is ready; a classic job's operations still wait for it", /if \(!source \|\| source\.kind !== "job"\) return\s*if \(agentJob === source\.jobId\) return/.test(hook) && /if \(!ready\) return\s*const next = answer as JobView/.test(hook))
    check("  an agent job's events are read from the first frame; the editor is told once it is ready", /React\.useEffect\(\(\) => \{\s*if \(!jobId\) return/.test(hook) && /\}, \[jobId, round, tell\]\)/.test(hook) && /if \(readyRef\.current\) \{\s*latest\.current\.onAgentChange\?\.\(finished, fresh\)/.test(hook))

    const route = code("app/api/website-builder/themes/create/route.ts")
    check("R1: an AI start answers without waiting for a photograph", /const first = generating \? AI_START_COVER : await coverForNewWebsite\(/.test(route) && /const AI_START_COVER = \{ cover: null, cover_pending: false \}/.test(route))
    check("R6: a blank press without the new AI builder is refused before anything is made or counted", /if \(generating && options\.generation === "blank" && engine !== "agent"\) \{\s*return NextResponse\.json\(\{ error: AGENT_OFF_MESSAGE, code: "agent_off" \}, \{ status: 409 \}\)/.test(route) && route.indexOf('code: "agent_off"') < route.indexOf('bucket: "site-create"') && route.indexOf('code: "agent_off"') < route.indexOf("createStartWebsite(") && route.indexOf('.eq("idempotency_key", key)') < route.indexOf('code: "agent_off"'))

    const client = code("app/(storelib)/app/website-builder/website-builder-client.tsx")
    check("R2: from the press, the editor's shell with the building canvas", /\{starting === "ai" && <StartingShell \/>\}/.test(client))
    check("  agent_off: the choice says so, the words stay", /if \(data\.code === "agent_off"\) \{\s*setAgentOn\(false\)/.test(client) && /agent=\{agentOn\}/.test(client))
    const page = code("app/(storelib)/app/website-builder/page.tsx")
    check("  the Website page asks the same switch as the create route", /agentEnabledFor\(createAdminClient\(\), \{ ownerUserId: access\.ownerUserId, creatorId: storeId \}\)/.test(page) && /aiAgent=\{aiAgent\}/.test(page))
    const startPage = code("app/(storelib)/app/website-builder/start-website.tsx")
    check("  Create sends the choice through startGeneration", /onStart\("ai", prompt, \{ generation: startGeneration\(generation, agent\)/.test(startPage) && /useState<GenerationMode>\(START_GENERATION\)/.test(startPage))
    check("the shell and the canvas mark respect reduced motion", /@media \(prefers-reduced-motion: reduce\) \{\s*\.wb-building-mark > span \{ animation: none; opacity: 1; \}/.test(read("app/globals.css")))
  }

  section("4. The real create route")
  {
    const j = await Journey.start()
    j.net.routes.push({ match: (u) => /^\/api\/website-builder\/ai-jobs\/[0-9a-f-]+\/run$/.test(u.pathname), answer: () => new Response(null, { status: 202 }) })
    const seller = await j.signUp("live@example.com", { name: "Lee Live" })
    await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "leelive" } })
    const creatorId = j.rows("creators").find((c) => c.user_id === seller.id)?.id as string
    const installs = () => j.rows("store_theme_installs").filter((r) => r.creator_id === creatorId).length
    const jobs = () => j.rows("ai_site_jobs").filter((r) => r.creator_id === creatorId)
    const before = installs()

    const blankOff = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "ai", prompt: "A shop for my ceramics.", key: "2b7c1e2a-0000-4000-8000-000000000001", options: { generation: "blank" } } })
    check("blank, the new AI builder off: 409 agent_off in plain words, nothing made", blankOff.status === 409 && blankOff.json?.code === "agent_off" && /isn't on for your account yet/.test(String(blankOff.json?.error)) && !/—/.test(String(blankOff.json?.error)) && installs() === before && jobs().length === 0, blankOff.json)

    const started = Date.now()
    const theme = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "ai", prompt: "A shop for my ceramics.", key: "2b7c1e2a-0000-4000-8000-000000000002", options: { generation: "theme" } } })
    const took = Date.now() - started
    check("inside the theme, the agent off: made at once on the classic engine", theme.status === 200 && typeof theme.json?.job?.id === "string" && jobs()[0]?.engine === "classic", theme.json)
    check("  the answer has no cover to wait for (the page takes one later)", theme.json?.cover === null && theme.json?.cover_pending === false && took < 8_000, { cover: theme.json?.cover, pending: theme.json?.cover_pending, took })
    jobs()[0].status = "complete"

    process.env.AI_BUILDER_AGENT_ACCOUNTS = "leelive"
    const blankOn = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "ai", prompt: "A shop for my ceramics.", key: "2b7c1e2a-0000-4000-8000-000000000003", options: { generation: "blank" } } })
    delete process.env.AI_BUILDER_AGENT_ACCOUNTS
    const agentRow = jobs().find((r) => r.id === blankOn.json?.job?.id)
    check("blank with the new AI builder on for the account: an agent job, mode blank", blankOn.status === 200 && agentRow?.engine === "agent" && agentRow?.mode === "blank" && agentRow?.step === "agent", { status: blankOn.status, row: agentRow && { engine: agentRow.engine, mode: agentRow.mode } })
    const home = j.rows("store_theme_pages").find((p) => p.install_id === blankOn.json?.install?.id && p.page_key === "home")
    check("  and its home page has nothing of the theme on it", Array.isArray(home?.sections) && (home!.sections as unknown[]).length === 0)

    const plain = await j.call("POST /api/website-builder/themes/create", { as: seller, body: { mode: "blank" } })
    check("Start from blank (no AI) is unchanged", plain.status === 200 && !plain.json?.job)
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
