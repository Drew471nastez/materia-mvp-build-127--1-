/**
 * ===========================================================================
 *  ROUND L, L7: THE AI BUILDER BENCHMARKS, A TO J, ON A SCRIPTED MODEL
 * ===========================================================================
 * Andrew's scenarios, each through the REAL routes and modules
 * (tests/_journey) with AI_BUILDER_AGENT=1:
 *
 *   A premium fitness coach, multi page        F a blank website (no AI)
 *   B editorial fashion, its own header/footer G iterative edits, all else byte identical
 *   C music producer, bound to products        H a long job: many turns, a lost hand over, the cron, reconnecting
 *   D minimal portfolio, one page, no chrome    I editor compatibility: every control through save, reload, publish
 *   E redesign inside a theme, reversible      J security: tenants, imports, secrets, paths, owner only
 *
 * For each built website: model calls, the runner's turns, the job's spend,
 * working time on the fake clock, events, and L6's anti slop score of the
 * files and the drawn page; A to D must differ in structure (no preset
 * underneath).
 *
 * WHAT THIS DOES NOT MEASURE: the model is a SCRIPT of tool calls written by
 * hand (tests/ai-builder-bench-designs.ts). The slop scores and the
 * diversity check score those hand written files and the pipeline that
 * carried them; they say nothing about the quality or variety of what a real
 * model would write. A real model run is scripts/ai-builder/live-smoke.ts,
 * with a key and a dollar cap.
 *
 * Strict: it drives route handlers through tests/_journey.
 */
import "./_journey/env"
process.env.CHROMIUM_PATH = "/nonexistent/chromium"
process.env.AI_JOB_SECRET = "journey-ai-job-secret-for-tests-only"
process.env.AI_BUILDER_AGENT = "1"
import { aiWorld, checker, driveTurns, installFiles, installPages, installSettings, jobEvents, jobRow, scriptModels, seller, type AiWorld, type Script } from "./ai-builder-e2e-kit"
import { A, B, BANNER, C, D, KITCHEN, type Design } from "./ai-builder-bench-designs"
import { CONCEPT, HERO, HEADER } from "./ai-builder-agent-fixtures"
import type { StartOptions } from "@/lib/ai-builder/types"

const { check, done, section } = checker()
type Calls = [string, Record<string, unknown>][]

/** The script a careful model would run for a design: concept, tokens, files two at a time, pages, composition, binds, checks, finish. */
function designScript(d: Design, extra: { binds?: () => Calls } = {}): Script {
  const files = Object.entries(d.files)
  const steps: Script = [
    { text: "The look first.", calls: [["report_progress", { phase: "plan", label: "Concept", concept: d.concept, tasks: ["Components", "Pages"] }]] },
    { calls: [["list_capabilities", {}], ["set_tokens", { tokens: d.tokens }]] },
  ]
  for (let i = 0; i < files.length; i += 2) steps.push({ calls: files.slice(i, i + 2).map(([path, content]) => ["write_file", { path, content }]) as Calls })
  if (d.pages.length) steps.push({ calls: d.pages.map((p) => ["add_page", { key: p.key, title: p.title }]) as Calls })
  steps.push({ calls: Object.entries(d.compose).map(([page, sections]) => ["set_page_sections", { page, sections }]) as Calls })
  if (extra.binds) steps.push(() => ({ calls: extra.binds!() }))
  steps.push({ calls: [["validate", {}], ["render_check", { page: "home" }]] })
  steps.push({ calls: [["finish", { summary: `${d.label}: built.` }]] })
  return steps
}

interface Built {
  label: string
  installId: string
  jobId: string
  status: string
  calls: number
  turns: number
  usd: number
  activeMs: number
  events: number
  slop: number
  slopFindings: string[]
  fingerprint: string
  homeTypes: string[]
  html: string
  /** What the last tool calls answered the model (the finish gate's reasons), for a failure's detail. */
  lastAnswer: string
}

async function drawAll(tree: Parameters<typeof import("react-dom/server").renderToReadableStream>[0]): Promise<string> {
  const { renderToReadableStream } = await import("react-dom/server")
  const stream = await renderToReadableStream(tree, { onError: () => undefined })
  await stream.allReady
  return await new Response(stream).text()
}

/** The saved home page as the preview/cover renderer draws it (drafts, this store's data). */
async function drawDraft(installId: string): Promise<string> {
  const { coverPage } = await import("@/app/(site)/w/[username]/render-site")
  return drawAll(await coverPage(installId))
}

/** Creates a website with AI for `slug` and runs the job to its end. */
async function build(w: AiWorld, who: Awaited<ReturnType<typeof seller>>, d: Design, script: Script, opts: { generation?: StartOptions["generation"]; key: string; beforeTurns?: (installId: string, jobId: string) => Promise<void> }): Promise<Built> {
  const options: StartOptions = { generation: opts.generation ?? "blank", ...(d.category ? { category: d.category as StartOptions["category"] } : {}) }
  const made = await w.j.call("POST /api/website-builder/themes/create", { as: who.person, body: { mode: "ai", prompt: d.prompt, key: opts.key, options } })
  if (made.status !== 200 || !made.json?.job?.id) throw new Error(`create failed for ${d.label}: ${made.status} ${JSON.stringify(made.json)}`)
  const installId = String(made.json.install.id)
  const jobId = String(made.json.job.id)
  if (opts.beforeTurns) await opts.beforeTurns(installId, jobId)
  const s = scriptModels(script, { clock: w.clock })
  w.scripts.set(jobId, s)
  const turns = await driveTurns(w, jobId, 20)
  const row = jobRow(w, jobId)
  const html = await drawDraft(installId).catch((e) => `render failed: ${e instanceof Error ? e.message : String(e)}`)
  const { evaluateSlop, sectionFingerprint } = await import("@/lib/ai-builder/slop")
  const files = installFiles(w, installId)
  const sources = Object.entries(files).filter(([p]) => p.startsWith("sections/ai_")).map(([path, f]) => ({ path, content: f.draft ?? f.content ?? "" }))
  const homeTypes = (installPages(w, installId).home?.draft ?? installPages(w, installId).home?.sections ?? []).map((x: { type: string }) => x.type)
  const report = evaluateSlop({ sources, html, sections: homeTypes.map((type: string) => ({ type })) }, d.concept as never)
  return {
    label: d.label,
    installId,
    jobId,
    status: String(row.status),
    calls: s.run.calls,
    turns,
    usd: Number(row.cost_usd) || 0,
    activeMs: Number(row.state?.agent?.usage?.activeMs) || 0,
    events: jobEvents(w, jobId).length,
    slop: report.score,
    slopFindings: report.findings.filter((f) => f.severity !== "info").map((f) => `${f.severity}:${f.rule}`),
    fingerprint: sectionFingerprint(html.replace(/<style[\s\S]*?<\/style>/g, "")),
    homeTypes,
    html,
    lastAnswer: (() => {
      const all = JSON.stringify(s.run.requests.at(-1)?.turns ?? [])
      const at = all.lastIndexOf("Not finished")
      const refused = s.run.requests.flatMap((r) => r.turns).filter((t) => (t as { role: string }).role === "tool").flatMap((t) => ((t as { results?: { output: string }[] }).results ?? []).map((x) => x.output)).filter((o) => o.includes('"ok":false')).map((o) => o.slice(0, 600))
      return `${at < 0 ? "" : all.slice(at, at + 1500)}\nREFUSED: ${[...new Set(refused)].join("\n")}`.slice(0, 5000)
    })(),
  }
}

const SECRETS = () => [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.AI_JOB_SECRET, process.env.STRIPE_SECRET_KEY, process.env.CRON_SECRET, process.env.COMMERCE_SECRETS_KEY, process.env.ANTHROPIC_API_KEY, process.env.OPENAI_API_KEY].filter((s): s is string => typeof s === "string" && s.length >= 8)

async function main() {
  const w = await aiWorld()
  const { j } = w
  const built: Built[] = []

  section("A to D: four new websites, four designs")
  const a = await seller(w, "bench-a")
  const c = await seller(w, "bench-c", { title: "Night bus (lease)", priceCents: 3_000, type: "digital" })
  const cProduct2 = String(j.db.insert("products", { creator_id: c.creatorId, title: "Tape hiss (lease)", slug: "tape-hiss", status: "published", type: "digital", price_cents: 3_000 }, {})[0].id)
  const programId = (installId: string) => (installPages(w, installId).home?.draft ?? []).find((s: { type: string }) => s.type === "ai_program_list")?.id ?? ""
  const storeId = (installId: string, page: string) => (installPages(w, installId)[page]?.draft ?? []).find((s: { type: string }) => s.type === "ai_beat_store")?.id ?? ""
  let aInstall = ""
  let cInstall = ""
  const runs: [Design, Awaited<ReturnType<typeof seller>>, (() => Calls) | undefined][] = [
    [A, a, () => [["bind_data", { page: "home", sectionId: programId(aInstall), prop: "product", kind: "product", ids: [a.productId] }]]],
    [B, await seller(w, "bench-b"), undefined],
    [C, c, () => [["bind_data", { page: "home", sectionId: storeId(cInstall, "home"), prop: "beats", kind: "products", ids: [c.productId, cProduct2] }], ["bind_data", { page: "beats", sectionId: storeId(cInstall, "beats"), prop: "beats", kind: "products", ids: [c.productId, cProduct2] }]]],
    [D, await seller(w, "bench-d"), undefined],
  ]
  for (const [i, [d, who, binds]] of runs.entries()) {
    const b = await build(w, who, d, designScript(d, { binds }), {
      key: `1b7c1e2a-0000-4000-8000-00000000010${i}`,
      beforeTurns: async (installId) => {
        if (d === A) aInstall = installId
        if (d === C) cInstall = installId
      },
    })
    built.push(b)
    check(`${d.label}: complete`, b.status === "complete", { status: b.status, answer: b.lastAnswer, tools: jobEvents(w, b.jobId).filter((e) => e.kind === "tool").map((e) => `${e.payload.ok ? "ok" : "NO"} ${e.payload.summary}`) })
    check(`  its components drawn, no theme header or footer`, !b.html.startsWith("render failed") && b.homeTypes.every((t) => t.startsWith("ai_")) && !/data-section-type="(header|footer)"/.test(b.html), { types: b.homeTypes, html: b.html.slice(0, 300) })
    check(`  no high anti slop finding in what was built`, !b.slopFindings.some((f) => f.startsWith("error:")), b.slopFindings)
  }
  const [bA, bB, bC, bD] = built
  check("A: three pages; B: two; C: two; D: home only", ["programs", "about"].every((k) => k in installPages(w, bA.installId)) && "journal" in installPages(w, bB.installId) && "beats" in installPages(w, bC.installId) && Object.keys(installPages(w, bD.installId)).filter((k) => k !== "product").join() === "home")
  check("B's header and footer are its own design, not A's", bB.homeTypes[0] === "ai_masthead" && bB.homeTypes[bB.homeTypes.length - 1] === "ai_colophon" && /<header class="mh"/.test(bB.html) && !/<header class="ch"/.test(bB.html) && /<footer class="cp" data-scheme="site_inverse"/.test(bB.html), bB.html.match(/<(header|footer)[^>]*>/g))
  const cStore = (installPages(w, bC.installId).home?.draft ?? []).find((s: { type: string }) => s.type === "ai_beat_store")
  check("C's beat store is bound to the store's two products and draws them with add to cart", JSON.stringify(cStore?.settings?.beats) === JSON.stringify([c.productId, cProduct2]) && bC.html.includes(`data-storelib-add-to-cart="${c.productId}"`) && bC.html.includes("Tape hiss (lease)"), { beats: cStore?.settings?.beats, html: bC.html.match(/<li class="bs__row"[\s\S]{0,300}/)?.[0] })
  check("D has no header and no footer at all", !/<header\b/.test(bD.html) && !/<footer\b/.test(bD.html), bD.html.match(/<(header|footer)[^>]*>/g))
  const prints = [bA, bB, bC, bD].map((b) => b.fingerprint)
  check("A to D differ in structure: four different page skeletons", new Set(prints).size === 4, prints)
  check("  and no two share a component type or a header design", new Set([bA, bB, bC, bD].flatMap((b) => b.homeTypes)).size === [bA, bB, bC, bD].reduce((n, b) => n + new Set(b.homeTypes).size, 0))
  const fonts = [bA, bB, bC, bD].map((b) => installSettings(w, b.installId).draft?.font_heading)
  check("  four type systems in Theme settings", new Set(fonts).size >= 3, fonts)

  section("E: a redesign inside a theme keeps content and bindings, and is reversible")
  const e = await seller(w, "bench-e")
  let eInstall = ""
  let spotlightId = ""
  let before: { pages: Record<string, unknown>; settings: unknown } | null = null
  let backupId = ""
  const eDesign: Design = { label: "E theme redesign", prompt: "Keep my site and add an offer band under the header.", concept: CONCEPT, tokens: {}, files: { "sections/ai_offer_band.storelib": BANNER }, pages: [], compose: {} }
  const eScript: Script = [
    { calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT, tasks: ["Offer band"] }]] },
    { calls: [["list_pages", {}], ["write_file", { path: "sections/ai_offer_band.storelib", content: BANNER }]] },
    () => ({ calls: [["set_page_sections", { page: "home", sections: [{ type: "ai_offer_band", settings: { heading: "Autumn intake open" } }, { id: spotlightId, type: "product_spotlight" }] }]] }),
    { calls: [["finish", { summary: "Added an offer band; everything else kept." }]] },
  ]
  const bE = await build(w, e, eDesign, eScript, {
    generation: "theme",
    key: "1b7c1e2a-0000-4000-8000-000000000110",
    beforeTurns: async (installId) => {
      eInstall = installId
      /* The person's own work before the AI: a product spotlight bound to their product, saved through the editor. */
      const home = installPages(w, installId).home.sections
      spotlightId = "product_spotlight-mine"
      const mine = [home[0], { id: spotlightId, type: "product_spotlight", name: "Product spotlight", settings: { heading: "My program", button_url: e.productId }, blocks: [] }, ...home.slice(1)]
      const put = await j.call(`PUT /api/website-builder/themes/${installId}/sections`, { as: e.person, body: { page_key: "home", sections: mine, mode: "draft" } })
      if (put.status !== 200) throw new Error(`E seed save failed ${put.status} ${JSON.stringify(put.json)}`)
      const backup = await j.call(`POST /api/website-builder/themes/${installId}/backups`, { as: e.person, body: { label: "Before the AI" } })
      backupId = String(backup.json?.backup?.id ?? "")
      before = { pages: Object.fromEntries(Object.entries(installPages(w, installId)).map(([k, p]) => [k, p.draft ?? p.sections])), settings: installSettings(w, installId).draft ?? installSettings(w, installId).settings }
    },
  })
  built.push(bE)
  const eHome = installPages(w, eInstall).home.draft ?? []
  check("E: complete", bE.status === "complete", { status: bE.status, tail: jobEvents(w, bE.jobId).slice(-5).map((x) => [x.kind, x.payload]) })
  check("  the theme's header and footer stay; the offer band is added; the spotlight kept by id with its binding", eHome.map((s: { type: string }) => s.type).join() === "header,ai_offer_band,product_spotlight,footer" && eHome.find((s: { id: string }) => s.id === spotlightId)?.settings?.button_url === e.productId, eHome.map((s: { type: string; id: string; settings: unknown }) => [s.type, s.id, s.settings]))
  /* Taken by the person through the Backups route: the job itself takes none (architecture D4's backup first is not wired; no route starts a whole site job on an existing website). */
  check("  a backup was taken through the Backups route before the AI ran", backupId.length > 0)
  const restore = await j.call(`POST /api/website-builder/themes/${eInstall}/backups/${backupId}/restore`, { as: e.person })
  const afterRestore = { pages: Object.fromEntries(Object.entries(installPages(w, eInstall)).map(([k, p]) => [k, p.draft ?? p.sections])), settings: installSettings(w, eInstall).draft ?? installSettings(w, eInstall).settings }
  check("  restoring that backup brings every page and the settings back exactly", restore.status === 200 && JSON.stringify(afterRestore) === JSON.stringify(before), { status: restore.status, json: restore.json })
  check("  (the AI's file stays in the project, placed nowhere, so nothing draws it)", "sections/ai_offer_band.storelib" in installFiles(w, eInstall) && Object.values(installPages(w, eInstall)).every((p) => !(p.draft ?? p.sections).some((s: { type: string }) => s.type === "ai_offer_band")))

  section("F: a blank website without AI is as before")
  const f = await seller(w, "bench-f")
  const plain = await j.call("POST /api/website-builder/themes/create", { as: f.person, body: { mode: "blank" } })
  const fHome = installPages(w, String(plain.json?.install?.id)).home
  check("F: made, no job, the theme's header and footer", plain.status === 200 && !plain.json?.job && fHome.sections.map((s: { type: string }) => s.type).join() === "header,footer" && j.rows("ai_site_jobs").every((r) => r.creator_id !== f.creatorId))
  const fPub = await j.call(`POST /api/website-builder/themes/${plain.json?.install?.id}/publish`, { as: f.person, body: { action: "publish" } })
  const { publishedSiteByName } = await import("@/lib/website-builder/published-site")
  const fLive = await publishedSiteByName("bench-f", "home")
  check("  published, the live site draws the theme's header and footer (the legacy path keeps working)", fPub.status === 200 && fLive.kind === "site" && fLive.site.sections.map((s) => s.type).join() === "header,footer", fLive.kind === "site" ? fLive.site.sections.map((s) => s.type) : fLive.kind)

  section("G: iterative edits change only what was asked")
  const g = await seller(w, "bench-g")
  const bG = await build(w, g, A, designScript(A), { key: "1b7c1e2a-0000-4000-8000-000000000120" })
  check("G: the starting website is complete", bG.status === "complete")
  const snap = () => ({ files: Object.fromEntries(Object.entries(installFiles(w, bG.installId)).map(([p, x]) => [p, x.draft ?? x.content])), pages: Object.fromEntries(Object.entries(installPages(w, bG.installId)).map(([k, p]) => [k, JSON.stringify(p.draft ?? p.sections)])), settings: JSON.stringify(installSettings(w, bG.installId).draft) })
  const editJob = async (path: string, prompt: string, script: Script) => {
    const { versionOf } = await import("@/lib/ai-builder/agent/version")
    const text = installFiles(w, bG.installId)[path]
    const r = await j.call(`POST /api/website-builder/themes/${bG.installId}/ai-edit`, { as: g.person, body: { mode: "edit", path, page: "home", prompt, expectedVersion: versionOf(text.draft ?? text.content ?? "") } })
    if (r.status !== 202) throw new Error(`ai-edit ${r.status} ${JSON.stringify(r.json)}`)
    const id = String(r.json.job.id)
    w.scripts.set(id, scriptModels(script, { clock: w.clock }))
    await driveTurns(w, id)
    return id
  }
  const s0 = snap()
  const calmHero = HERO.replace("font-size: clamp(40px, 9cqi, 112px); line-height: 0.92;", "font-size: clamp(36px, 6cqi, 72px); line-height: 1.05;")
  const g1 = await editJob("sections/ai_coach_hero.storelib", "Make the heading calmer", [
    { calls: [["read_file", { path: "sections/ai_coach_hero.storelib" }]] },
    { calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: calmHero }], ["write_file", { path: "sections/ai_coach_header.storelib", content: HEADER.replace("Iron & Chalk", "Changed") }], ["set_tokens", { tokens: { fonts: { heading: "Comic Neue" } } }], ["add_page", { key: "sneaky", title: "Sneaky" }]] },
    { calls: [["finish", { summary: "Calmer heading." }]] },
  ])
  const s1 = snap()
  const g1run = w.scripts.get(g1)!.run
  check("  the hero the model read came back to it whole in the next call (" + HERO.length + " characters)", (g1run.requests[1]?.turns ?? []).flatMap((t) => ((t as { results?: { output: string }[] }).results ?? [])).some((x) => x.output.includes(JSON.stringify(HERO).slice(1, -1))), g1run.requests.map((r) => r.turns.length))
  check("hero only: the edit job completes", jobRow(w, g1).status === "complete", { status: jobRow(w, g1).status, error: jobRow(w, g1).error, tail: jobEvents(w, g1).slice(-5).map((x) => [x.kind, x.payload]) })
  check("  the hero file changed as asked", s1.files["sections/ai_coach_hero.storelib"] === calmHero)
  const otherFiles = (a1: Record<string, unknown>, b1: Record<string, unknown>, except: string) => Object.keys({ ...a1, ...b1 }).filter((p) => p !== except && a1[p] !== b1[p])
  check("  every other file byte identical (the header write refused)", otherFiles(s0.files, s1.files, "sections/ai_coach_hero.storelib").length === 0, otherFiles(s0.files, s1.files, "sections/ai_coach_hero.storelib"))
  check("  every page and the Theme settings byte identical (tokens and a new page refused in a one-component edit)", JSON.stringify(s0.pages) === JSON.stringify(s1.pages) && s0.settings === s1.settings, { pages: Object.keys(s1.pages).filter((k) => s0.pages[k] !== s1.pages[k]), settings: s0.settings === s1.settings })
  const navHeader = HEADER.replace('<nav class="ch__nav" aria-label="{{ settings.nav_label }}">', '<nav class="ch__nav ch__nav--wide" aria-label="{{ settings.nav_label }}">')
  const g2 = await editJob("sections/ai_coach_header.storelib", "Spread the menu out", [{ calls: [["write_file", { path: "sections/ai_coach_header.storelib", content: navHeader }]] }, { calls: [["read_file", { path: "sections/ai_coach_header.storelib" }]] }, { calls: [["write_file", { path: "sections/ai_coach_header.storelib", content: navHeader }]] }, { calls: [["finish", { summary: "Menu spread." }]] }])
  const s2 = snap()
  const g2tools = jobEvents(w, g2).filter((x) => x.kind === "tool").map((x) => `${x.payload.ok ? "ok" : "NO"} ${x.payload.summary}`)
  check("  an overwrite of a file it has not read is refused; after reading it, the write lands", g2tools[0]?.startsWith("NO write file") && g2tools.slice(1, 3).every((t) => t.startsWith("ok")), g2tools)
  check("nav only: complete, the header changed, everything else byte identical", jobRow(w, g2).status === "complete" && s2.files["sections/ai_coach_header.storelib"] === navHeader && otherFiles(s1.files, s2.files, "sections/ai_coach_header.storelib").length === 0 && JSON.stringify(s1.pages) === JSON.stringify(s2.pages) && s1.settings === s2.settings, { status: jobRow(w, g2).status, header: s2.files["sections/ai_coach_header.storelib"] === navHeader, files: otherFiles(s1.files, s2.files, "sections/ai_coach_header.storelib"), pages: Object.keys(s2.pages).filter((k) => s1.pages[k] !== s2.pages[k]), settings: s1.settings === s2.settings })
  /* Add a page: no route starts a whole-site change on an existing website yet, so the job row is made as the create route makes one (engine agent, mode theme). */
  const [g3row] = j.db.insert("ai_site_jobs", { creator_id: g.creatorId, owner_user_id: g.person.id, install_id: bG.installId, prompt: "Add a pricing page", idempotency_key: "g3-add-a-page-0001", status: "queued", step: "agent", engine: "agent", mode: "theme", options: { generation: "theme" }, progress: 0, state: {} }, {})
  const g3 = String(g3row.id)
  const PRICING = BANNER.replace(/ai_offer_band/g, "ai_price_band").replace("Offer band", "Price band")
  w.scripts.set(g3, scriptModels([
    { calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT, tasks: ["Pricing page"] }]] },
    { calls: [["write_file", { path: "sections/ai_price_band.storelib", content: PRICING }], ["add_page", { key: "pricing", title: "Pricing" }]] },
    { calls: [["set_page_sections", { page: "pricing", sections: [{ type: "ai_price_band", settings: { heading: "Prices" } }] }]] },
    { calls: [["finish", { summary: "Pricing page added." }]] },
  ], { clock: w.clock }))
  w.kicks.push({ jobId: g3, token: null })
  await driveTurns(w, g3)
  const s3 = snap()
  check("add a page: complete, the page and its component made", jobRow(w, g3).status === "complete" && "pricing" in s3.pages && "sections/ai_price_band.storelib" in s3.files, { status: jobRow(w, g3).status, error: jobRow(w, g3).error, tail: jobEvents(w, g3).slice(-5).map((x) => [x.kind, x.payload]) })
  const changedPages = Object.keys(s2.pages).filter((k) => s2.pages[k] !== s3.pages[k])
  check("  every file before it byte identical; the other pages' own sections untouched", otherFiles(s2.files, s3.files, "sections/ai_price_band.storelib").length === 0 && changedPages.length === 0, { files: otherFiles(s2.files, s3.files, "sections/ai_price_band.storelib"), pages: changedPages })
  const menuAfter = JSON.parse(s3.settings).menus?.["main-menu"]?.links?.map((l: { url: string }) => l.url)
  check("  the only settings change is the menu link and the page's search text", JSON.stringify({ ...JSON.parse(s2.settings), menus: null, page_seo: null }) === JSON.stringify({ ...JSON.parse(s3.settings), menus: null, page_seo: null }) && menuAfter?.includes("/pricing"), menuAfter)

  section("H: a long job over many turns, a lost hand over, reconnecting by seq")
  const h = await seller(w, "bench-h")
  const hScript: Script = [...designScript(A).slice(0, 2)]
  /* Twenty small steps: each file written, read back and edited, one call at a time. */
  for (const [path, content] of Object.entries(A.files)) {
    hScript.push({ calls: [["write_file", { path, content }]] }, { calls: [["read_file", { path }]] }, { calls: [["list_files", {}]] })
  }
  const hMade = await j.call("POST /api/website-builder/themes/create", { as: h.person, body: { mode: "ai", prompt: A.prompt, key: "1b7c1e2a-0000-4000-8000-000000000130", options: { generation: "blank", category: "fitness_coach" } } })
  const hJob = String(hMade.json?.job?.id)
  const hRun = scriptModels([hScript[0], hScript[1], ...hScript.slice(2, 17), { calls: [["add_page", { key: "programs", title: "Programs" }], ["add_page", { key: "about", title: "About" }]] }, { calls: Object.entries(A.compose).map(([page, sections]) => ["set_page_sections", { page, sections }]) as Calls }, { calls: [["finish", { summary: "Long build done." }]] }], { clock: w.clock })
  w.scripts.set(hJob, hRun)
  const seen: { seq: number; kind: string }[] = []
  let cursor = 0
  const poll = async () => {
    const r = await j.call(`GET /api/website-builder/ai-jobs/${hJob}?after=${cursor}`, { as: h.person })
    for (const ev of r.json?.events ?? []) seen.push({ seq: ev.seq, kind: ev.kind })
    cursor = Math.max(cursor, Number(r.json?.seq) || 0)
    return r.json
  }
  let hTurns = await driveTurns(w, hJob, 2)
  await poll()
  /* The next hand over is lost (Vercel dropped it): nobody runs the job until the cron finds its lapsed lease. */
  const lost = w.kicks.findIndex((k) => k.jobId === hJob)
  const dropped = lost >= 0 ? w.kicks.splice(lost, 1).length : 0
  check("a hand over was pending and is dropped", dropped === 1 && jobRow(w, hJob).status === "running")
  w.clock.advance(120_000)
  const cron = await j.call("GET /api/cron/ai-jobs", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  check("  the five minute cron finds it and asks for the next turn", cron.status === 200 && cron.json?.kicked >= 1 && w.kicks.some((k) => k.jobId === hJob), cron.json)
  let polls = 1
  for (let i = 0; i < 20 && !["complete", "partial", "failed", "cancelled"].includes(String(jobRow(w, hJob).status)); i++) {
    hTurns += await driveTurns(w, hJob, 1)
    await poll()
    polls++
  }
  await poll()
  /* Twenty calls of 70 s each is more than the job's 20 minutes of working time (DEFAULT_JOB_BUDGET.maxWallMs): it stops, says so, keeps its drafts. */
  const stopped = jobRow(w, hJob)
  check("H: the working time budget ends it partial, in plain words, drafts kept", stopped.status === "partial" && stopped.state?.agent?.errorCode === "budget_time" && /time/i.test(String(stopped.error)) && Object.keys(installFiles(w, String(hMade.json?.install?.id))).length === 5, { status: stopped.status, code: stopped.state?.agent?.errorCode, error: stopped.error })
  check("  the view offers Continue", (await poll())?.error?.actions?.includes("continue"))
  const more = await j.call(`POST /api/website-builder/ai-jobs/${hJob}/continue`, { as: h.person, body: { action: "continue" } })
  check("  Continue extends the budget once and runs on", more.status === 202 && more.json?.extended === true, more.json)
  for (let i = 0; i < 10 && !["complete", "partial", "failed", "cancelled"].includes(String(jobRow(w, hJob).status)); i++) {
    hTurns += await driveTurns(w, hJob, 1)
    await poll()
    polls++
  }
  await poll()
  const hRow = jobRow(w, hJob)
  check("H: complete after many turns and one Continue", hRow.status === "complete" && hRun.run.calls >= 20, { status: hRow.status, calls: hRun.run.calls, error: hRow.error })
  const seqs = seen.map((x) => x.seq)
  check("  the view, read a page at a time by seq, saw every event once and in order", seqs.length === jobEvents(w, hJob).length && seqs.every((s, i) => s === i + 1), { seen: seqs.length, stored: jobEvents(w, hJob).length, polls })
  check("  its terminal status is the last event", seen[seen.length - 1]?.kind === "finished" && jobEvents(w, hJob).at(-1)?.payload.status === "complete" && jobEvents(w, hJob).filter((x) => x.kind === "finished").map((x) => x.payload.status).join() === "partial,complete")
  const runner = hRow.state?.agent
  built.push({ label: "H long job", installId: String(hMade.json?.install?.id), jobId: hJob, status: String(hRow.status), calls: hRun.run.calls, turns: hTurns, usd: Number(hRow.cost_usd) || 0, activeMs: Number(runner?.usage?.activeMs) || 0, events: jobEvents(w, hJob).length, slop: NaN, slopFindings: [], fingerprint: "", homeTypes: [], html: "", lastAnswer: "" })

  section("I: every kind of control survives save, reload and publish")
  const iSeller = await seller(w, "bench-i")
  const iDesign: Design = { ...D, label: "I editor compatibility", files: { ...D.files, "sections/ai_feature_panel.storelib": KITCHEN }, compose: { home: [...D.compose.home, { type: "ai_feature_panel" }] } }
  const bI = await build(w, iSeller, iDesign, designScript(iDesign), { key: "1b7c1e2a-0000-4000-8000-000000000140" })
  check("I: the website is complete", bI.status === "complete", { answer: bI.lastAnswer, tools: jobEvents(w, bI.jobId).filter((e) => e.kind === "tool").map((e) => `${e.payload.ok ? "ok" : "NO"} ${e.payload.summary}`) })
  const photo = "https://journey.supabase.co/storage/v1/object/public/theme-assets/bench-i/coach.jpg"
  const wanted = { heading: "Coaching that fits your week", photo, photo_alt: "A coach spotting a squat", line_color: "#225588", layout: "row", show_note: true, note: "First call is free.", gap: 40 }
  const iHome = installPages(w, bI.installId).home.draft ?? []
  const iEdited = iHome.map((s: { type: string; settings: Record<string, unknown> }) => (s.type === "ai_feature_panel" ? { ...s, settings: { ...s.settings, ...wanted } } : s))
  const iSave = await j.call(`PUT /api/website-builder/themes/${bI.installId}/sections`, { as: iSeller.person, body: { page_key: "home", sections: iEdited, mode: "draft" } })
  const iRead = await j.call(`GET /api/website-builder/themes/${bI.installId}/sections?page=home`, { as: iSeller.person })
  const panel = (iRead.json?.sections ?? []).find((s: { type: string }) => s.type === "ai_feature_panel")
  /* The picture is kept as the platform's own media address for the same file (the save's sanitiser). */
  check("saved and read back: text, picture, colour, layout select, toggle, range", iSave.status === 200 && Object.entries(wanted).every(([k, v]) => (k === "photo" ? String(panel?.settings?.[k]).endsWith("/theme-assets/bench-i/coach.jpg") : panel?.settings?.[k] === v)), { save: iSave.status, got: panel?.settings })
  const iPub = await j.call(`POST /api/website-builder/themes/${bI.installId}/publish`, { as: iSeller.person, body: { action: "publish" } })
  const iLive = await publishedSiteByName("bench-i", "home")
  const iHtml = iLive.kind === "site" ? Object.values(iLive.site.prerendered).map((r) => r.html).join("\n") : ""
  check("published: the live page draws each value (heading, picture with its alt, colour, side by side, the note, the gap)", iPub.status === 200 && iHtml.includes("Coaching that fits your week") && iHtml.includes('alt="A coach spotting a squat"') && /<img class="fp__img" src="[^"]*coach\.jpg/.test(iHtml) && iHtml.includes("--fp-line: #225588") && iHtml.includes("fp--row") && iHtml.includes("First call is free.") && iHtml.includes("--fp-gap: 40px"), iHtml.match(/<section class="fp[\s\S]{0,700}/)?.[0])
  const { schemaToManifest } = await import("@/lib/ai-builder/manifest")
  const iManifest = JSON.stringify(schemaToManifest(installFiles(w, bI.installId)["sections/ai_feature_panel.storelib"].content ?? ""))
  check("  the manifest read from the published file still lists every prop", ["heading", "photo", "line_color", "layout", "show_note", "gap"].every((id) => iManifest.includes(`"${id}"`)), iManifest.slice(0, 400))

  section("J: security")
  const intruder = await seller(w, "bench-intruder")
  const target = bA.installId
  const { versionOf } = await import("@/lib/ai-builder/agent/version")
  const heroText = installFiles(w, target)["sections/ai_coach_hero.storelib"]
  const theirEdit = await j.call(`POST /api/website-builder/themes/${target}/ai-edit`, { as: intruder.person, body: { mode: "edit", path: "sections/ai_coach_hero.storelib", prompt: "x", expectedVersion: versionOf(heroText.draft ?? "") } })
  const anonEdit = await j.call(`POST /api/website-builder/themes/${target}/ai-edit`, { body: { mode: "edit", path: "sections/ai_coach_hero.storelib", prompt: "x", expectedVersion: null } })
  check("Edit with AI on another store's website: not found; signed out: refused", theirEdit.status === 404 && [401, 403].includes(anonEdit.status), [theirEdit.status, anonEdit.status])
  const theirSave = await j.call(`PUT /api/website-builder/themes/${target}/sections`, { as: intruder.person, body: { page_key: "home", sections: [], mode: "draft" } })
  const theirCancel = await j.call(`POST /api/website-builder/ai-jobs/${bA.jobId}/cancel`, { as: intruder.person })
  check("  their save, their cancel: refused, nothing changed", [403, 404].includes(theirSave.status) && theirCancel.status === 404 && (installPages(w, target).home.draft ?? []).length === 4, [theirSave.status, theirCancel.status])
  process.env.AI_BUILDER_AGENT = "0"
  const off = await j.call(`POST /api/website-builder/themes/${target}/ai-edit`, { as: a.person, body: { mode: "edit", path: "sections/ai_coach_hero.storelib", prompt: "x", expectedVersion: null } })
  process.env.AI_BUILDER_AGENT = "1"
  check("  Edit with AI with the agent switched off: 501", off.status === 501, off.status)

  const jSeller = await seller(w, "bench-j")
  const bad = (n: number, html: string) => HERO.replace("ai_coach_hero", `ai_bad_${n}`).replace("<template>", `<template>\n${html}`)
  const jScript: Script = [
    { calls: [["report_progress", { phase: "plan", label: "Concept", concept: CONCEPT, tasks: ["Hero"] }]] },
    {
      calls: [
        ["write_file", { path: "sections/ai_bad_1.storelib", content: bad(1, '<script src="https://evil.example/x.js"></script>') }],
        ["write_file", { path: "sections/ai_bad_2.storelib", content: bad(2, '<link rel="stylesheet" href="https://evil.example/x.css">') }],
        ["write_file", { path: "sections/ai_bad_3.storelib", content: bad(3, '<iframe src="https://evil.example"></iframe>') }],
        ["write_file", { path: "sections/ai_bad_4.storelib", content: bad(4, '<img src="https://evil.example/pixel.gif" alt="">') }],
        ["write_file", { path: "sections/ai_bad_5.storelib", content: bad(5, "").replace("</style>", "@import url(https://evil.example/x.css);\n</style>") }],
        ["write_file", { path: "layout/theme.storelib", content: HERO }],
        ["write_file", { path: "sections/hero.storelib", content: HERO }],
        ["write_file", { path: "../sections/ai_x.storelib", content: HERO }],
        ["write_file", { path: "sections/ai_x.liquid", content: HERO }],
        ["read_file", { path: "../../.env" }],
        ["bind_data", { page: "home", sectionId: "nope", prop: "product", kind: "product", ids: [a.productId] }],
      ],
    },
    { calls: [["write_file", { path: "sections/ai_coach_hero.storelib", content: HERO }], ["set_page_sections", { page: "home", sections: [{ type: "ai_coach_hero" }, { type: "header" }] }]] },
    /* The hero's button defaults to /programs, a page this one-page site does not have: a CTA to nowhere blocks finish (round M), so it is pointed at the shop. */
    { calls: [["set_page_sections", { page: "home", sections: [{ type: "ai_coach_hero", settings: { cta_url: "/products" } }] }]] },
    { calls: [["finish", { summary: "Hero only." }]] },
  ]
  const jMade = await j.call("POST /api/website-builder/themes/create", { as: jSeller.person, body: { mode: "ai", prompt: "A hero.", key: "1b7c1e2a-0000-4000-8000-000000000150", options: { generation: "blank" } } })
  const jJob = String(jMade.json?.job?.id)
  const jInstall = String(jMade.json?.install?.id)
  const jRun = scriptModels(jScript, { clock: w.clock, callMs: 10_000 }) /* short calls: the whole job in one turn, so the model's raw tool answers stay in its requests */
  w.scripts.set(jJob, jRun)
  await driveTurns(w, jJob)
  const jFiles = Object.keys(installFiles(w, jInstall))
  check("unsafe files are refused by validate and never saved: script src, link, iframe, a remote picture, @import", jFiles.join() === "sections/ai_coach_hero.storelib", jFiles)
  const jToolEvents = jobEvents(w, jJob).filter((x) => x.kind === "tool")
  const refused = jToolEvents.filter((x) => x.payload.ok === false).map((x) => x.payload.summary)
  check("  paths outside sections/ai_*.storelib refused (theme layout, a theme section name, ../, another extension)", refused.filter((s: string) => /^write file/.test(s)).length === 9, refused)
  /* The second model call's tenth tool call (call_2_9) is the read of ../../.env; its answer, as the model got it. */
  const envRead = jRun.run.requests.flatMap((r) => r.turns).flatMap((t) => ((t as { results?: { id: string; output: string }[] }).results ?? [])).find((x) => x.id === "call_2_9")?.output ?? "(no answer found)"
  const shapes = jRun.run.requests.map((r) => r.turns.map((t) => (t as { role: string }).role).join(","))
  check("one conversation per request: each call sees its earlier turns and tool answers, not a fresh digest", shapes.length >= 4 && shapes.slice(1).every((x, i) => x.startsWith(shapes[i]) && x.length > shapes[i].length), shapes)
  console.log(`  (read_file ../../.env answered: ${envRead.slice(0, 160)})`)
  check("  reading ../../.env reads the project's own files only: nothing comes back", envRead !== "(no answer found)" && !/SUPABASE|SECRET|KEY=/.test(envRead) && /"missing":true|"ok":false/.test(envRead), envRead.slice(0, 300))
  check("  a binding on another store's product refused; a built-in header refused in a blank site", refused.some((s: string) => /^bind data/.test(s)) && refused.some((s: string) => /^set page sections/.test(s)), refused)
  check("  the job still completes with what was allowed", jobRow(w, jJob).status === "complete", { status: jobRow(w, jJob).status, error: jobRow(w, jJob).error })
  const everything = JSON.stringify([j.rows("ai_site_job_events"), j.rows("store_theme_custom_files"), j.rows("ai_site_jobs").map((r) => ({ ...r, idempotency_key: null }))])
  const leaked = SECRETS().filter((s) => everything.includes(s))
  check("no secret (service key, job secret, Stripe, cron, provider keys) in any event, file or job row", leaked.length === 0, leaked.map((s) => `${s.slice(0, 3)}…`))
  const prompts = JSON.stringify(jRun.run.requests.map((r) => [r.system, r.turns]))
  check("  nor in anything sent to the model", SECRETS().every((s) => !prompts.includes(s)))

  section("The numbers (SCRIPTED model: plumbing, cost accounting and the slop rules on hand written files; NOT real model quality)")
  console.log("  scenario                                     status    calls turns  usd      work(s) events slop")
  for (const b of built) console.log(`  ${b.label.padEnd(44)} ${b.status.padEnd(9)} ${String(b.calls).padStart(5)} ${String(b.turns).padStart(5)}  ${b.usd.toFixed(4).padStart(7)} ${String(Math.round(b.activeMs / 1000)).padStart(7)} ${String(b.events).padStart(6)} ${Number.isNaN(b.slop) ? "  -" : String(b.slop).padStart(3)}`)
  check("every built website's spend is under the job's cap and counted", built.every((b) => b.usd > 0 && b.usd < 4), built.map((b) => b.usd))
  const unexpected = j.serverErrors.filter((e) => !(e.status === 501 && /\/ai-edit$/.test(e.route)))
  check("no server errors on the way (the 501 of Edit with AI switched off is the answer asked for)", unexpected.length === 0 && j.afterErrors.length === 0, { server: unexpected, after: j.afterErrors })
  done()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
