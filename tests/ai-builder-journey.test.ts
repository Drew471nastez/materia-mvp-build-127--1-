/**
 * ===========================================================================
 *  ROUND L, L7: THE FITNESS COACH JOURNEY, EVERY PIECE TOGETHER
 * ===========================================================================
 * The whole AI Website Builder path through the REAL routes and modules
 * (tests/_journey: an in memory PostgREST built from the SQL files), with
 * AI_BUILDER_AGENT=1:
 *
 *   chip → edited words → Create (twice: one website, one job) → the job's
 *   options → the editor's address → the runner's turns chained on a fake
 *   clock → events in order → ai_ .storelib files (compiled by the real
 *   compiler on save) → pages, routes, menu → no Foundation header/footer →
 *   render check → bindings to this store's products only → a prop set
 *   through the editor's save route, re-read from the database → publish →
 *   the live site's reader (/w/<user>) draws the components, the AI header,
 *   no theme chrome → cancel mid run keeps drafts, Continue resumes → the
 *   editor finds the same state again.
 *
 * SCRIPTED, SAID PLAINLY: the model is a script of tool calls
 * (tests/ai-builder-e2e-kit.ts scriptModels). Everything it asks for is done
 * by the real loop, tools and store; nothing here says how good a real
 * model's website would be.
 *
 * Strict: it drives route handlers through tests/_journey.
 */
import "./_journey/env"
process.env.CHROMIUM_PATH = "/nonexistent/chromium"
process.env.AI_JOB_SECRET = "journey-ai-job-secret-for-tests-only"
process.env.AI_BUILDER_AGENT = "1"
import { aiWorld, checker, driveTurns, installFiles, installPages, installSettings, jobEvents, jobRow, scriptModels, seller, type Script } from "./ai-builder-e2e-kit"
import { ABOUT, CONCEPT, FOOTER, HEADER, HERO, PROGRAMS } from "./ai-builder-agent-fixtures"
import { chipAction, pendingStartKey, presetFor } from "@/lib/website-builder/ai-site/start-options"
import { withJobParam } from "@/lib/website-builder/start-handoff"
import type { StartOptions } from "@/lib/ai-builder/types"

const { check, done, section } = checker()

const TOKENS = { colors: { background: "#f4efe6", surface: "#ebe4d8", text: "#1d1b18", muted: "#5c564d", accent: "#c2410c", accentText: "#ffffff", border: "#d6cdbd", inverse: { background: "#1d1b18", text: "#f4efe6", accent: "#fb923c" } }, fonts: { heading: "Oswald", body: "Inter" }, radius: { small: 2, medium: 4, large: 0 }, spacing: { scale: 1.1, sectionY: 96, pageWidth: 1240, gutter: 24 }, motion: { level: "subtle", style: "rise", durationMs: 500 }, custom: { radius: "2px" } }

function memoryStorage() {
  const store = new Map<string, string>()
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
}

/** A server tree drawn to HTML with everything it suspends on waited for, as Next streams it. */
async function drawAll(tree: Parameters<typeof import("react-dom/server").renderToReadableStream>[0]): Promise<string> {
  const { renderToReadableStream } = await import("react-dom/server")
  const stream = await renderToReadableStream(tree, { onError: () => undefined })
  await stream.allReady
  return await new Response(stream).text()
}

async function main() {
  const w = await aiWorld()
  const { j } = w
  const coach = await seller(w, "jocoach")
  const stranger = await seller(w, "othercoach", { title: "Someone else's program", priceCents: 9_900 })

  section("1. Fitness coach chip, edited, Create twice: one website, one agent job")
  const FITNESS = presetFor("fitness_coach").prompt
  const press = chipAction("", null, FITNESS)
  const typed = press.kind === "replace" ? `${press.text}\nI coach small groups in Leeds, mostly beginners.` : ""
  const options: StartOptions = { generation: "blank", category: "fitness_coach" }
  const key = pendingStartKey(memoryStorage(), typed, options, () => "0b7c1e2a-0000-4000-8000-000000000101")
  const body = { mode: "ai", prompt: typed, key, options }
  const first = await j.call("POST /api/website-builder/themes/create", { as: coach.person, body })
  const second = await j.call("POST /api/website-builder/themes/create", { as: coach.person, body })
  check("Create: a website and a job", first.status === 200 && typeof first.json?.install?.id === "string" && typeof first.json?.job?.id === "string", first.json)
  check("  Create again with the same press: the same website and job", second.status === 200 && second.json?.install?.id === first.json?.install?.id && second.json?.job?.id === first.json?.job?.id, second.json)
  const installId = String(first.json?.install?.id)
  const jobId = String(first.json?.job?.id)
  const jobs = j.rows("ai_site_jobs").filter((r) => r.creator_id === coach.creatorId)
  check("  one job row, on the agent engine (AI_BUILDER_AGENT=1), step agent", jobs.length === 1 && jobs[0].engine === "agent" && jobs[0].step === "agent" && jobs[0].status === "queued", jobs.map((r) => ({ engine: r.engine, step: r.step, status: r.status })))
  check("  the words exactly, the chip's category and blank in options", jobs[0]?.prompt === typed && JSON.stringify(jobs[0]?.options) === JSON.stringify(options) && jobs[0]?.mode === "blank")
  check("  the job was handed to the run route once", w.kicks.length === 1 && w.kicks[0].jobId === jobId, w.kicks)
  const href = withJobParam(`/store/jocoach/themes/${installId}/editor?previewPath=%2F`, jobId)
  check("the editor's address carries the job, never the words", href.endsWith(`&start=ai&job=${jobId}`) && !href.includes("Leeds"))

  /* The script, filled in as the job goes: the program list's id is read from the page the agent wrote. */
  const programsId = () => (installPages(w, installId).home?.draft ?? []).find((s: { type: string }) => s.type === "ai_program_list")?.id ?? ""
  const script: Script = [
    { text: "Planning the look first.", calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT, tasks: ["Header and footer", "Home: hero and programs", "Programs page", "About page"] }]] },
    { calls: [["list_capabilities", {}], ["set_tokens", { tokens: TOKENS }]] },
    { calls: [["write_file", { path: "sections/ai_coach_header.storelib", content: HEADER }], ["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }], ["write_file", { path: "sections/ai_program_list.storelib", content: PROGRAMS }]] },
    { calls: [["write_file", { path: "sections/ai_coach_footer.storelib", content: FOOTER }], ["write_file", { path: "sections/ai_coach_story.storelib", content: ABOUT }]] },
    { calls: [["add_page", { key: "programs", title: "Programs" }], ["add_page", { key: "about", title: "About", seo: { description: "Who coaches you." } }]] },
    {
      calls: [
        ["set_page_sections", { page: "home", sections: [{ type: "ai_coach_header", group: "header" }, { type: "ai_coach_hero", settings: { heading: "Lift with a plan", cta_url: "/programs" } }, { type: "ai_program_list", blocks: [{ type: "program", settings: { name: "Small group strength", when: "Mon Wed Fri 7am" } }] }, { type: "ai_coach_footer", group: "footer" }] }],
        ["set_page_sections", { page: "programs", sections: [{ type: "ai_program_list", settings: { heading: "All programs" } }] }],
        ["set_page_sections", { page: "about", sections: [{ type: "ai_coach_story" }] }],
      ],
    },
    () => ({ calls: [["list_pages", {}], ["bind_data", { page: "home", sectionId: programsId(), prop: "product", kind: "product", ids: [stranger.productId] }], ["bind_data", { page: "home", sectionId: programsId(), prop: "product", kind: "product", ids: ["prod_invented"] }], ["bind_data", { page: "home", sectionId: programsId(), prop: "product", kind: "product", ids: [coach.productId] }]] }),
    { calls: [["validate", {}], ["render_check", { page: "home" }], ["render_check", { page: "programs" }]] },
    { calls: [["finish", { summary: "A three page site for Jo with its own header and footer." }]] },
  ]
  const scripted = scriptModels(script, { clock: w.clock })
  w.scripts.set(jobId, scripted)

  section("2. The runner's turns, chained on the fake clock")
  const turns = await driveTurns(w, jobId)
  const row = jobRow(w, jobId)
  check("the job completes", row.status === "complete", { status: row.status, error: row.error, phase: row.phase, agent: row.state?.agent, tail: jobEvents(w, jobId).slice(-8) })
  check("  over several turns (each model call takes 70 s of a 240 s turn)", turns >= 3, turns)
  const events = jobEvents(w, jobId)
  const kinds = events.map((e) => e.kind)
  check("events numbered 1..n with no gap, last_event_seq the newest", events.every((e, i) => e.seq === i + 1) && Number(row.last_event_seq) === events.length, { seqs: events.map((e) => e.seq), last: row.last_event_seq })
  const phases = events.filter((e) => e.kind === "phase").map((e) => e.payload.phase)
  check("  phases in order: brief, plan, build, verify, finish", phases.join() === "brief,plan,build,verify,finish", phases)
  const firstOf = (k: string, p?: (e: (typeof events)[number]) => boolean) => events.findIndex((e) => e.kind === k && (!p || p(e)))
  check("  the concept before any file, files before pages are composed, validation before the end", firstOf("tokens") < firstOf("file") && firstOf("file") < firstOf("page", (e) => e.payload.page === "home") && firstOf("validation") < firstOf("finished"), kinds)
  check("  one finished event, the last, complete", kinds.filter((k) => k === "finished").length === 1 && events[events.length - 1].payload.status === "complete")
  check("  a file event per component written, with its bytes", events.filter((e) => e.kind === "file").map((e) => e.payload.path).sort().join() === ["sections/ai_coach_footer.storelib", "sections/ai_coach_header.storelib", "sections/ai_coach_hero.storelib", "sections/ai_coach_story.storelib", "sections/ai_program_list.storelib"].join() && events.filter((e) => e.kind === "file").every((e) => e.payload.bytes > 500))
  check("  pages created: programs and about", events.filter((e) => e.kind === "page" && e.payload.action === "created").map((e) => e.payload.page).sort().join() === "about,programs", events.filter((e) => e.kind === "page").map((e) => e.payload))
  check("  the last validation found no errors", events.filter((e) => e.kind === "validation").pop()?.payload.errors === 0, events.filter((e) => e.kind === "validation").map((e) => e.payload))
  check("  no event carries a file body", events.every((e) => !JSON.stringify(e.payload).includes("<template>")))
  check("the spend is the job's (cost_usd) and every model call is one iteration", Number(row.cost_usd) > 0 && row.state?.agent?.usage?.iterations === scripted.run.calls, { cost: row.cost_usd, it: row.state?.agent?.usage?.iterations, calls: scripted.run.calls })

  section("3. The files: ai_ .storelib components, drafts, compiled, history says ai")
  const { compileSection } = await import("@/lib/storelib-theme/storelib/compile")
  const files = installFiles(w, installId)
  const paths = Object.keys(files).sort()
  check("five section files, every one ai_ and .storelib", paths.length === 5 && paths.every((p) => /^sections\/ai_[a-z0-9_]+\.storelib$/.test(p)), paths)
  check("  drafts only: nothing live before Publish", paths.every((p) => !files[p].content && !!files[p].draft))
  check("  each compiles with the real compiler", paths.every((p) => compileSection(files[p].draft ?? "").ok), paths.map((p) => [p, compileSection(files[p].draft ?? "").ok]))
  check("  each is the source the model wrote, kept whole", files["sections/ai_coach_hero.storelib"].draft === HERO && files["sections/ai_program_list.storelib"].draft === PROGRAMS)
  const versions = j.rows("store_theme_file_versions").filter((v) => v.install_id === installId)
  check("  every version row says author ai and the job", versions.length >= 5 && versions.every((v) => v.author === "ai" && v.job_id === jobId), versions.map((v) => [v.path, v.author, v.job_id === jobId]))

  section("4. Pages, routes, menu; no Foundation header or footer")
  const pages = installPages(w, installId)
  const homeDraft = pages.home?.draft ?? []
  check("home: the AI header, hero, programs and the AI footer", homeDraft.map((s: { type: string }) => s.type).join() === "ai_coach_header,ai_coach_hero,ai_program_list,ai_coach_footer", homeDraft.map((s: { type: string }) => s.type))
  check("  the header and footer sit in their groups", homeDraft[0]?.group === "header" && homeDraft[3]?.group === "footer")
  const own = (list: { type: string; group?: string }[] | null) => (list ?? []).filter((x) => !x.group).map((x) => x.type).join()
  const chromeOfPage = (list: { type: string; group?: string }[] | null) => (list ?? []).filter((x) => x.group).map((x) => `${x.group}:${x.type}`).join()
  check("  programs and about pages with their components", own(pages.programs?.draft) === "ai_program_list" && own(pages.about?.draft) === "ai_coach_story", { programs: pages.programs, about: pages.about })
  check("  their chrome, when copied, is the AI header and footer", [pages.programs?.draft, pages.about?.draft].every((l) => ["", "header:ai_coach_header,footer:ai_coach_footer"].includes(chromeOfPage(l))))
  check("  no page holds a theme header or footer section", Object.values(pages).every((p) => [...(p.sections ?? []), ...(p.draft ?? [])].every((s: { type: string }) => s.type !== "header" && s.type !== "footer")), Object.fromEntries(Object.entries(pages).map(([k, p]) => [k, [...(p.draft ?? p.sections)].map((s: { type: string }) => s.type)])))
  const draftSettings = installSettings(w, installId).draft ?? {}
  check("  the site draws home's chrome only (site_chrome home)", draftSettings.site_chrome === "home")
  const main = (draftSettings.menus ?? {})["main-menu"]
  check("  the main menu links the new pages", !!main && ["/programs", "/about"].every((u) => main.links.some((l: { url: string }) => l.url === u)), main)
  check("  the tokens are Theme settings (heading font, accent)", draftSettings.font_heading === "Oswald" && draftSettings.background_color === "#f4efe6", { font: draftSettings.font_heading, bg: draftSettings.background_color })

  section("5. Bindings: this store's products only")
  const program = homeDraft.find((s: { type: string }) => s.type === "ai_program_list")
  check("the program list is bound to the coach's own product", program?.settings?.product === coach.productId, program?.settings)
  const bindEvents = events.filter((e) => e.kind === "tool" && e.payload.tool === "bind_data")
  check("  another store's product and an invented id were refused", bindEvents.length === 3 && bindEvents[0].payload.ok === false && bindEvents[1].payload.ok === false && bindEvents[2].payload.ok === true, bindEvents.map((e) => e.payload))
  const caps = await (await import("@/lib/ai-builder/capabilities")).readRuntimeCapabilities((await import("@/lib/supabase/admin")).createAdminClient() as never, { creatorId: coach.creatorId, ownerUserId: coach.person.id, installId })
  check("  the capabilities the agent saw hold the coach's product and not the stranger's", caps.products.some((p) => p.id === coach.productId) && !caps.products.some((p) => p.id === stranger.productId), caps.products.map((p) => p.id))

  section("6. The render check passes on every page")
  const { renderCheckForInstall } = await import("@/lib/ai-builder/render-check-server")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const admin = createAdminClient() as never
  for (const page of ["home", "programs", "about"]) {
    const r = await renderCheckForInstall(admin, { creatorId: coach.creatorId, installId, page })
    check(`  ${page}: ok, drawn, every AI section drew something`, r.ok && r.htmlBytes > 500 && r.sections.filter((x) => x.type.startsWith("ai_")).every((x) => x.bytes > 0), { ok: r.ok, issues: r.issues.filter((i) => i.severity === "error"), sections: r.sections })
  }
  const stranger404 = await renderCheckForInstall(admin, { creatorId: stranger.creatorId, installId, page: "home" })
  check("  another store's creator id reads nothing of this website", !stranger404.ok && stranger404.htmlBytes === 0)

  section("7. A component's manifest prop, set through the editor's save, survives a reload")
  const { schemasFromSources } = await import("@/lib/website-builder/storelib-schemas")
  const { schemaToManifest } = await import("@/lib/ai-builder/manifest")
  const schemas = schemasFromSources({ "sections/ai_coach_hero.storelib": files["sections/ai_coach_hero.storelib"].draft ?? "" } as never) as unknown as Record<string, { fields?: { id: string; type: string }[] }>
  const heroSchema = schemas.ai_coach_hero
  check("the editor reads the hero's manifest from its file: heading, photo, layout select, colour scheme", !!heroSchema && ["heading", "photo", "layout", "color_scheme"].every((id) => heroSchema.fields?.some((f) => f.id === id)), heroSchema?.fields?.map((f) => f.id))
  const manifest = schemaToManifest(files["sections/ai_coach_hero.storelib"].draft ?? "")
  check("  and L5's schemaToManifest gives the same props back", !!manifest && ["heading", "layout", "photo"].every((id) => JSON.stringify(manifest).includes(`"${id}"`)), manifest)
  const edited = homeDraft.map((s: { type: string; settings: Record<string, unknown> }) => (s.type === "ai_coach_hero" ? { ...s, settings: { ...s.settings, heading: "Strength for real life", layout: "stacked" } } : s))
  const saved = await j.call(`PUT /api/website-builder/themes/${installId}/sections`, { as: coach.person, body: { page_key: "home", sections: edited, mode: "draft" } })
  check("the editor's Save takes it", saved.status === 200, saved.json)
  const reread = await j.call(`GET /api/website-builder/themes/${installId}/sections?page=home`, { as: coach.person })
  const heroAfter = (reread.json?.sections ?? []).find((s: { type: string }) => s.type === "ai_coach_hero")
  check("  a reload reads it back from the database", heroAfter?.settings?.heading === "Strength for real life" && heroAfter?.settings?.layout === "stacked", heroAfter?.settings)
  check("  the binding and the other sections are untouched", (reread.json?.sections ?? []).find((s: { type: string }) => s.type === "ai_program_list")?.settings?.product === coach.productId && (reread.json?.sections ?? []).length === 4)
  const { coverPage } = await import("@/app/(site)/w/[username]/render-site")
  const { renderToStaticMarkup } = await import("react-dom/server")
  let draftHtml = ""
  try {
    draftHtml = renderToStaticMarkup(await coverPage(installId))
  } catch (e) {
    draftHtml = `render failed: ${e instanceof Error ? e.stack : String(e)}`
  }
  check("  the saved page drawn again (the preview/cover renderer) shows the new heading in the stacked layout", draftHtml.includes("Strength for real life") && draftHtml.includes("hx--stacked") && !draftHtml.includes("Lift with a plan"), draftHtml.slice(0, 600))

  section("8. Publish through the existing publish route; the live site draws the AI's website")
  const pub = await j.call(`POST /api/website-builder/themes/${installId}/publish`, { as: coach.person, body: { action: "publish" } })
  check("Publish answers ok", pub.status === 200, pub.json)
  const afterPub = installFiles(w, installId)
  check("  every AI file's draft is now its live half", Object.values(afterPub).every((f) => !!f.content && f.draft === null) && afterPub["sections/ai_coach_hero.storelib"].content === HERO)
  const livePages = installPages(w, installId)
  check("  the pages' live sections are the drafts, with the edited heading", livePages.home.sections.find((s: { type: string }) => s.type === "ai_coach_hero")?.settings?.heading === "Strength for real life" && own(livePages.about.sections) === "ai_coach_story", livePages.home.sections.map((s: { type: string }) => s.type))
  check("  the website is the live one", j.rows("store_theme_installs").find((r) => r.id === installId)?.status === "published")
  const { publishedSiteByName } = await import("@/lib/website-builder/published-site")
  const liveHome = await publishedSiteByName("jocoach", "home")
  const liveAbout = await publishedSiteByName("jocoach", "about")
  const html = (l: Awaited<ReturnType<typeof publishedSiteByName>>) => (l.kind === "site" ? l.site.sections.map((x) => `<!--${x.type}-->${l.site.prerendered[x.id]?.html ?? ""}`).join("\n") : `(${l.kind})`)
  const homeHtml = html(liveHome)
  const aboutHtml = html(liveAbout)
  check("/w/jocoach: the live reader finds the published website", liveHome.kind === "site" && liveAbout.kind === "site", { home: liveHome.kind, about: liveAbout.kind })
  const liveTypes = liveHome.kind === "site" ? liveHome.site.sections.map((x) => x.type) : []
  check("  home draws the AI header, hero, programs and footer, and no theme header or footer", liveTypes.join() === "ai_coach_header,ai_coach_hero,ai_program_list,ai_coach_footer", liveTypes)
  check("  the components are drawn by the template engine on the server (their markup, the edited heading, the stacked layout)", homeHtml.includes('class="ch"') && homeHtml.includes("Strength for real life") && homeHtml.includes("hx--stacked") && homeHtml.includes('class="pg"'), homeHtml.slice(0, 800))
  check("  the bound product is drawn with its add to cart hook", homeHtml.includes(`data-storelib-add-to-cart="${coach.productId}"`), homeHtml.match(/pg__buy[^>]*>/)?.[0])
  check("  the header's menu lists the new pages", /href="\/programs"/.test(homeHtml) && /href="\/about"/.test(homeHtml), homeHtml.match(/<nav[\s\S]*?<\/nav>/)?.[0])
  check("  the AI footer is drawn in the inverse scheme its author gave it", /<footer class="cf" data-scheme="site_inverse" style="--s-bg: #1d1b18;/.test(homeHtml), homeHtml.match(/<footer[^>]*>/)?.[0])
  const aboutTypes = liveAbout.kind === "site" ? liveAbout.site.sections.map((x) => x.type) : []
  check("  /about: the AI header and footer around the story, no theme chrome", aboutTypes.join() === "ai_coach_header,ai_coach_story,ai_coach_footer" && aboutHtml.includes('class="ab'), aboutTypes)
  check("  nothing on the live pages is the Foundation theme's header or footer", ![...liveTypes, ...aboutTypes].some((t) => t === "header" || t === "footer") && !/class="site-header|data-section-type="header"/.test(homeHtml))
  const { renderSite } = await import("@/app/(site)/w/[username]/render-site")
  let page = ""
  try {
    page = await drawAll(await renderSite("jocoach", undefined, "home"))
  } catch (e) {
    page = `render failed: ${e instanceof Error ? e.stack : String(e)}`
  }
  check("  the live page itself (renderSite, as /w/jocoach serves it) carries the AI's markup", page.includes("Strength for real life") && page.includes('class="ch"') && !page.startsWith("render failed"), page.slice(0, 600))
  const drawnTypes = [...new Set([...page.matchAll(/data-section-type="([^"]+)"/g)].map((m) => m[1]))]
  check("  every section on it is the AI's; its only <header> and <footer> are the AI's", drawnTypes.length === 4 && drawnTypes.every((t) => t.startsWith("ai_")) && (page.match(/<header\b/g) ?? []).length === 1 && /<header class="ch"/.test(page) && (page.match(/<footer\b/g) ?? []).length === 1 && /<footer class="cf"/.test(page), { drawnTypes, headers: page.match(/<header[^>]*>/g), footers: page.match(/<footer[^>]*>/g) })

  section("9. Reconnecting: the progress view reads events after the seq it has")
  const all = await j.call(`GET /api/website-builder/ai-jobs/${jobId}`, { as: coach.person })
  const half = Math.floor(events.length / 2)
  const rest = await j.call(`GET /api/website-builder/ai-jobs/${jobId}?after=${half}`, { as: coach.person })
  check("the whole list from 0, the rest from a seq, nothing repeated", all.status === 200 && all.json?.events?.length === events.length && rest.json?.events?.length === events.length - half && rest.json.events[0].seq === half + 1, { all: all.json?.events?.length, rest: rest.json?.events?.length })
  check("  the view: complete, phase finish, the job's counts", all.json?.status === "complete" && all.json?.phase === "finish" && all.json?.counts?.componentsWritten === 5, { status: all.json?.status, phase: all.json?.phase, counts: all.json?.counts })
  const theirs = await j.call(`GET /api/website-builder/ai-jobs/${jobId}`, { as: stranger.person })
  check("  another store: not found, no events", theirs.status === 404 && !JSON.stringify(theirs.json).includes("ai_coach"), theirs.status)

  section("10. Cancel part way keeps the drafts; Continue resumes from the checkpoint")
  const key2 = "0b7c1e2a-0000-4000-8000-000000000202"
  const made2 = await j.call("POST /api/website-builder/themes/create", { as: coach.person, body: { mode: "ai", prompt: `${typed} Second try.`, key: key2, options } })
  const install2 = String(made2.json?.install?.id)
  const job2 = String(made2.json?.job?.id)
  check("a second website and job (the first one is finished)", made2.status === 200 && job2 !== jobId && install2 !== installId, made2.json)
  const s2 = scriptModels(script.map((step, i) => (i === 6 ? () => ({ calls: [["list_pages", {}]] as [string, Record<string, unknown>][] }) : step)), { clock: w.clock })
  w.scripts.set(job2, s2)
  await driveTurns(w, job2, 1)
  const mid = jobRow(w, job2)
  check("  one turn ran: the job is running, some files written", mid.status === "running" && Object.keys(installFiles(w, install2)).length > 0, { status: mid.status, files: Object.keys(installFiles(w, install2)) })
  const callsBefore = s2.run.calls
  const cancel = await j.call(`POST /api/website-builder/ai-jobs/${job2}/cancel`, { as: coach.person })
  const cancelled = jobRow(w, job2)
  check("Cancel: accepted, the job ends cancelled before another model call", cancel.status === 202 && cancelled.status === "cancelled" && s2.run.calls === callsBefore, { status: cancel.status, job: cancelled.status, calls: [callsBefore, s2.run.calls] })
  const ev2 = jobEvents(w, job2)
  check("  its last event says cancelled", ev2[ev2.length - 1]?.kind === "finished" && ev2[ev2.length - 1]?.payload.status === "cancelled" && ev2[ev2.length - 1]?.payload.stopped === "cancelled", ev2.slice(-3))
  const keptFiles = Object.keys(installFiles(w, install2))
  check("  the drafts it made are kept", keptFiles.length > 0 && keptFiles.every((p) => !!installFiles(w, install2)[p].draft))
  const again = await j.call(`POST /api/website-builder/ai-jobs/${job2}/cancel`, { as: coach.person })
  check("  a second press changes nothing", again.status === 200 && again.json?.status === "cancelled" && jobRow(w, job2).status === "cancelled")
  const notOwner = await j.call(`POST /api/website-builder/ai-jobs/${job2}/continue`, { as: stranger.person, body: { action: "continue" } })
  check("  another store cannot continue it", notOwner.status === 404, notOwner.status)
  const cont = await j.call(`POST /api/website-builder/ai-jobs/${job2}/continue`, { as: coach.person, body: { action: "continue" } })
  check("Continue: accepted and running again from where it stopped", cont.status === 202 && cont.json?.status === "queued", cont.json)
  await driveTurns(w, job2)
  const resumed = jobRow(w, job2)
  check("  it finishes complete", resumed.status === "complete", { status: resumed.status, error: resumed.error, tail: jobEvents(w, job2).slice(-4) })
  check("  without starting over: the brief and plan ran once, the model was not asked for the concept again", jobEvents(w, job2).filter((e) => e.kind === "phase" && e.payload.phase === "brief").length === 1 && s2.run.asked.filter((t) => t === "report_progress").length === 1, s2.run.asked)
  const ev2b = jobEvents(w, job2)
  check("  events carry on numbering after the cancel's", ev2b.every((e, i) => e.seq === i + 1) && ev2b.filter((e) => e.kind === "finished").map((e) => e.payload.status).join() === "cancelled,complete", ev2b.filter((e) => e.kind === "finished").map((e) => e.payload))
  check("  the continue is counted on the job", resumed.state?.agent?.continues === 1, resumed.state?.agent?.continues)

  section("11. Reopening the editor finds the same state")
  const reopen = await j.call(`GET /api/website-builder/themes/${installId}/ai-start`, { as: coach.person })
  check("the editor finds the first job from the server, with its words", reopen.status === 200 && reopen.json?.job?.id === jobId && reopen.json?.job?.prompt === typed, reopen.json)
  const view = await j.call(`GET /api/website-builder/ai-jobs/${jobId}?after=${events.length}`, { as: coach.person })
  check("  its view: complete, nothing new, no runner started again", view.status === 200 && view.json?.status === "complete" && view.json?.events?.length === 0 && w.kicks.every((k) => k.jobId !== jobId))
  const homeAgain = await j.call(`GET /api/website-builder/themes/${installId}/sections?page=home`, { as: coach.person })
  check("  the page as published, with the edited heading", (homeAgain.json?.sections ?? []).find((s: { type: string }) => s.type === "ai_coach_hero")?.settings?.heading === "Strength for real life")

  check("no server errors on the way", j.serverErrors.length === 0 && j.afterErrors.length === 0, { server: j.serverErrors, after: j.afterErrors })
  done()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
