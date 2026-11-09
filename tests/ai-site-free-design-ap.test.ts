/**
 * ===========================================================================
 *  ROUND AP (track 3): START WITH AI, FROM THE PRESET TO A SITE OF ITS OWN
 * ===========================================================================
 * The owner: pick "Fitness coach" under Describe your website, press Create,
 * and the AI must take that exact description and start coding the site,
 * with visible progress. And the AI must not be "tied and limited" to the
 * default theme: no preset header or footer, its own sections where it needs
 * them, every one still editable in the theme editor, with Storelib's live
 * data, all the pages, much longer runs, and the studio's anti AI slop rules
 * on the server. Nothing here calls a model: fakes stand in for it.
 *
 *   1. THE HAND-OFF. The preset's words reach the create route, the job row
 *      and the planner verbatim; the editor address carries the job, never
 *      the words; a reload finds the job again; one press is one job.
 *   2. FREE DESIGN. With a coder, the plan may hold custom sections and the
 *      header and footer are briefs; the theme's header and footer are
 *      replaced on every page by coded ones reading the site's own menu.
 *   3. ACCEPTING A FILE. A coded file is checked as if nobody had: compiles
 *      under the strict gate, has a settings schema, its kind, no secret, no
 *      remote script, no typed picture, no placeholder, no banned words.
 *   4. LONG RUNS. The code step stops before the request's deadline and the
 *      next request carries on; a job has a ceiling on turns; Continue resets.
 *   5. THE CHECK. Placeholders, banned words and pictures a browser cannot
 *      draw are findings; the studio's rules are in the planner's prompt.
 *   6. SAFETY. No key in a prompt, paths in one folder, the install scoped.
 *   7. THE WEBSITE PAGE. Every refresh goes through one transition and a
 *      page copy behind a save is asked for again once (pagesBehind).
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { startRows } from "@/lib/website-builder/create-website"
import { CREATIVE_EXAMPLE } from "@/lib/website-builder/agent/creative-section"
import { readSitePlan, sitePlanTool, sitePlannerSystem, sitePlanTurn, plannableTypes, CUSTOM_TYPE, MAX_CUSTOM_SECTIONS, SITE_PLANNER_SYSTEM } from "@/lib/website-builder/agent/site-plan"
import { acceptCoded, codePrompt, codeTasks, CODED_PATH, CODE_START_RESERVE_MS, CODE_TRIES, placementOps, resolvePlan, siteMenu, siteMenuHandle, withCoded, type SectionCoder } from "@/lib/website-builder/ai-site/code"
import { BANNED_COPY, placeholderIn, slopIn, STUDIO_CRAFT } from "@/lib/website-builder/ai-site/craft"
import { newJob, runStep, runUntil, publicView, outOfRuns, MAX_JOB_RUNS, STEPS, type Job, type JobDeps } from "@/lib/website-builder/ai-site/job"
import { deterministicFindings, rewritable } from "@/lib/website-builder/ai-site/verify"
import { PLAN_MODEL, SMALL_MODEL, WRITE_MODEL, type Models } from "@/lib/website-builder/ai-site/models"
import { startJobRow } from "@/lib/website-builder/ai-site/start"
import { applyOp } from "@/lib/website-builder/agent/operations"
import { homeChrome, type SiteState } from "@/lib/website-builder/ai-site/apply"
import { readJobParam, readStartParam, recallJob, rememberJob, withJobParam, startMessage, START_PROMPT_MAX } from "@/lib/website-builder/start-handoff"
import { GenerationPanel, codeActivity } from "@/components/website-builder/ai-generation/generation-panel"
import { pagesBehind } from "@/lib/website-builder/page-refresh"
import { ceramicsPlan, fakeOpenverse, fakeProvider, memorySite, richCaps, emptyCaps, type CallLog } from "./ai-site-fakes"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const schemas = SECTION_SCHEMAS
const addable = [...ADDABLE_SECTIONS]

/** The Fitness coach example on the Website page, read from the page itself so the test follows the copy. */
const FITNESS = (() => {
  /* Changed on purpose (round AP, after round L): the examples live in start-options.ts. */
  const m = /label: msg\("Fitness coach"\),\s*prompt: msg\("([^"]+)"\)/.exec(read("lib/website-builder/ai-site/start-options.ts"))
  return m ? m[1] : ""
})()

function startingSite(): SiteState {
  const rows = startRows()!
  return { settings: rows.settings as Record<string, unknown>, pages: Object.fromEntries(rows.pages.map((p) => [p.page_key, p.sections])) }
}

function models(log: CallLog[], opts: Parameters<typeof fakeProvider>[1] = {}): Models {
  const provider = fakeProvider(log, opts)
  return { plan: { provider, model: PLAN_MODEL, effort: "medium" }, write: { provider, model: WRITE_MODEL, effort: "low" }, small: { provider, model: SMALL_MODEL, effort: "low" } }
}

/* ── coded files, as a careful model would write them ─────────────────── */

function sectionFile(type: string, name: string, heading: string): string {
  return CREATIVE_EXAMPLE.replace('"type": "flag_feature"', `"type": "${type}"`)
    .replace(/"name": "Flag feature"/g, `"name": "${name}"`)
    .replace('"default": "A heading about this"', `"default": "${heading}"`)
    .replace('"default": "One or two sentences that say what this is."', '"default": "Four weeks of strength work, planned around the hours you actually have."')
}

function chromeFile(type: string, kind: "header" | "footer", name: string): string {
  const tag = kind === "header" ? "header" : "footer"
  return `<template>
<${tag} class="c" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px;">
  <div class="c__in">
    <a class="c__brand" href="{{ routes.root_url }}">{% if theme.logo.url != "" %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" width="120" height="40">{% else %}{{ settings.brand }}{% endif %}</a>
    <nav class="c__nav" aria-label="{{ settings.nav_label }}" data-storelib-menu>
      {% for link in settings.menu.links %}<a class="c__link" href="{{ link.url }}">{{ link.title }}</a>{% for child in link.links %}<a class="c__link c__link--sub" href="{{ child.url }}">{{ child.title }}</a>{% endfor %}{% endfor %}
    </nav>
  </div>
</${tag}>
</template>

<style scoped>
.c { container-type: inline-size; background: var(--s-bg); color: var(--s-text); }
.c__in { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; max-width: var(--theme-page-width, 1200px); margin: 0 auto; padding: var(--s-pt) var(--theme-padding-x, 24px) var(--s-pb); }
.c__brand { color: inherit; text-decoration: none; font-weight: 700; }
.c__nav { display: flex; flex-wrap: wrap; gap: 16px; }
.c__link { color: inherit; text-decoration: none; min-height: 44px; display: inline-flex; align-items: center; transition: opacity 150ms ease; }
.c__link:hover { opacity: 0.7; }
.c__link:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .c__link { transition: none; } }
</style>

<schema>
{
  "type": "${type}",
  "name": "${name}",
  "kind": "${kind}",
  "settings": [
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" },
    { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" },
    { "type": "text", "id": "brand", "label": "Brand name", "default": "Northside Strength" },
    { "type": "text", "id": "nav_label", "label": "Menu description", "default": "Main" },
    { "type": "range", "id": "padding_top", "label": "Top padding", "min": 0, "max": 64, "step": 4, "unit": "px", "default": 16 },
    { "type": "range", "id": "padding_bottom", "label": "Bottom padding", "min": 0, "max": 64, "step": 4, "unit": "px", "default": 16 }
  ],
  "presets": [{ "name": "${name}" }]
}
</schema>`
}

/** A coder that writes a real file for each task and counts what it was asked. */
function fakeCoder(asked: { key: string; prompt: string; extra: boolean }[], opts: { bad?: (key: string, n: number) => string | null; slow?: () => void } = {}): SectionCoder {
  const tries: Record<string, number> = {}
  return {
    model: PLAN_MODEL,
    async write(task, prompt, o) {
      opts.slow?.()
      const n = (tries[task.key] = (tries[task.key] ?? 0) + 1)
      asked.push({ key: task.key, prompt, extra: /WAS REFUSED/.test(prompt) })
      o.onUsage?.({ inputTokens: 4000, cachedInputTokens: 0, cacheWriteTokens: 4000, outputTokens: 3000 })
      const bad = opts.bad?.(task.key, n)
      if (bad !== null && bad !== undefined) return { ok: true, source: bad }
      const slug = task.key.replace(/[^a-z0-9]+/g, "_")
      if (task.role === "header") return { ok: true, source: chromeFile("northside_header", "header", "Northside header") }
      if (task.role === "footer") return { ok: true, source: chromeFile("northside_footer", "footer", "Northside footer") }
      return { ok: true, source: sectionFile(`ns_${slug}`, task.name, "Strength you can keep") }
    },
  }
}

/** The plan a careful model sends for the Fitness coach brief, with free design. */
function fitnessPlan(over: Record<string, unknown> = {}) {
  return ceramicsPlan({
    brand: { name: "Northside Strength", tagline: "Personal training in Leeds" },
    header: "A slim header: the brand set in the heading font on the left, the menu on the right, folding into a full screen menu on a phone. A Book a free call link at the end.",
    footer: "A dark footer: the brand, one line on where the gym is, the menu, and the year.",
    pages: [
      {
        key: "home",
        title: "Home",
        purpose: "Get people to book a free first call",
        sections: [
          { type: "custom", name: "Coach intro", purpose: "Open on the coach and the promise", content: "A split: a tall photo of a barbell session, a heading about strength that fits a busy week, one line, Book a free call.", scheme: "light", layout: [], images: [{ slot: "x", query: "barbell training gym", aspect: "portrait" }] },
          { type: "features_grid", purpose: "What the programs are", content: "Strength, conditioning, nutrition habits", scheme: "alt", layout: [], images: [] },
          { type: "custom", name: "Programs and prices", purpose: "The three programs", content: "A list, each program a bold name, who it is for, weeks, a link to book.", scheme: "dark", layout: [], images: [] },
          { type: "faq_accordion", purpose: "Questions", content: "First session, location, equipment", scheme: "light", layout: [], images: [] },
        ],
      },
      { key: "about", title: "About", purpose: "The coach", sections: [{ type: "custom", name: "Coach story", purpose: "Who the coach is", content: "A long read with a pull quote from the brief, no invented credentials.", scheme: "light", layout: [], images: [] }] },
      { key: "contact", title: "Book a call", purpose: "Book", sections: [{ type: "contact", purpose: "Book a free first call", content: "Form", scheme: "light", layout: [], images: [] }] },
    ],
    ...over,
  })
}

type Site = ReturnType<typeof memorySite> & { files?: Record<string, string> }
function deps(over: Partial<JobDeps> & { log: CallLog[]; site: Site }): JobDeps & { saved: Job[] } {
  const saved: Job[] = []
  const searches: string[] = []
  const files: Record<string, string> = {}
  const site = over.site
  site.files = files
  const io = {
    ...site,
    read: site.read,
    write: site.write,
    async writeFile(path: string, source: string) {
      if (!CODED_PATH.test(path)) throw new Error("bad path")
      files[path] = source
    },
    async ensureMenu() {
      return "theme" as const
    },
  }
  return {
    models: models(over.log, { plan: fitnessPlan() }),
    capabilities: async () => emptyCaps(),
    images: { search: fakeOpenverse(searches), copy: async (url: string) => ({ ok: true as const, url: `https://cdn.storelib.test/${encodeURIComponent(url).slice(-24)}.jpg` }) },
    schemas,
    addable,
    save: async (j: Job) => {
      saved.push(JSON.parse(JSON.stringify(j)))
    },
    saved,
    ...over,
    site: io,
  } as JobDeps & { saved: Job[] }
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("1. The hand-off: Fitness coach, Create, and the AI starts on those exact words")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("the Website page has the Fitness coach example", FITNESS.length > 40 && /personal training/i.test(FITNESS), FITNESS)
    const page = code("app/(storelib)/app/website-builder/start-website.tsx")
    /* Changed on purpose (round AP, after round L): the chip goes through put() with its category, and Create sends the words as written. */
    check("choosing it puts its words in the box, unchanged", /put\(x\.id, x\.prompt, x\.prompt\)/.test(page) && /setPrompt\(text\.slice\(0, START_PROMPT_MAX\)\)/.test(page))
    check("Create sends the box's words as the AI start", /onStart\("ai", prompt, \{ generation/.test(page))
    const client = code("app/(storelib)/app/website-builder/website-builder-client.tsx")
    check("the press posts mode, prompt, a key for this press and the options to the create route", /fetch\("\/api\/website-builder\/themes\/create", json\("POST", withAi \? \{ mode, prompt, key, options: chosen \} : \{ mode \}\)\)/.test(client))
    check("one key per description: a second press of the same words is the same job", /pendingStartKey\(storage, prompt!, chosen, newStartKey\)/.test(client))
    check("a press in flight is never sent twice", /if \(startFlight\.current \|\| making\) return/.test(client))
    const route = code("app/api/website-builder/themes/create/route.ts")
    check("the route keeps the words exactly as they came, refusing more than 2,000 characters", /const prompt = typeof body\?\.prompt === "string" \? \(body\.prompt as string\) : ""/.test(route) && /prompt\.length > START_PROMPT_MAX/.test(route) && START_PROMPT_MAX === 2000)
    check("and starts the job in the same request, after answering", /startJobRow\(admin, \{ creatorId, ownerUserId: site\.ownerUserId, installId: made\.install\.id, prompt, key: key!, options/.test(route) && /after\(\(\) => kickJob\(origin, job\.id\)\)/.test(route))

    const inserted: Record<string, unknown>[] = []
    const admin = { from: () => ({ insert: (row: Record<string, unknown>) => (inserted.push(row), { select: () => ({ single: async () => ({ data: { id: "11111111-2222-4333-8444-555555555555" }, error: null }) }) }) }) }
    const made = await startJobRow(admin, { creatorId: "c1", ownerUserId: "u1", installId: "i1", prompt: FITNESS, key: "press-key-1234" })
    check("the job row holds the exact words, queued at the plan step", made.kind === "made" && inserted[0]?.prompt === FITNESS && inserted[0]?.status === "queued" && inserted[0]?.step === "plan")

    const href = withJobParam("/website-builder/editor/abc?page=home", "11111111-2222-4333-8444-555555555555")
    check("the editor opens on the job, never with the words in the address", /start=ai/.test(href) && /job=11111111/.test(href) && !href.includes(encodeURIComponent(FITNESS.slice(0, 12))) && !href.includes(FITNESS.slice(0, 12)))
    const job = readJobParam(href)
    const start = readStartParam(job.cleaned!)
    check("the editor takes job and start off the address before anything else", job.jobId === "11111111-2222-4333-8444-555555555555" && start.wanted && start.cleaned === "/website-builder/editor/abc?page=home")
    const box = new Map<string, string>()
    const storage = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v), removeItem: (k: string) => void box.delete(k) }
    rememberJob(storage, "abc", job.jobId)
    check("a reload while it runs finds the job again in this tab", recallJob(storage, "abc") === job.jobId)
    const editor = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("the editor follows the job as soon as the website is up, and reads new section files before placing them", /useSiteGeneration\(\{\s*onFiles: generationFiles,/.test(editor) && /ready: !loading && !loadFailed/.test(editor))

    const log: CallLog[] = []
    const site: Site = memorySite(startingSite())
    const d = deps({ log, site, code: fakeCoder([]) })
    const after = await runStep(newJob({ id: "aaaaaaaa-0000-4000-8000-000000000001", creatorId: "c1", ownerUserId: "u1", installId: "i1", prompt: FITNESS }), d)
    check("the first step is the plan, and the planner reads the words verbatim", after.step === "build" && log[0]?.kind === "plan" && log[0].user.includes(FITNESS))
    check("the progress is saved as it goes, for the editor's poll", d.saved.length >= 1 && d.saved[d.saved.length - 1].step === "build")
    /* Round AP: part 380's step check has no "code", so the code step is stored as "build" with state.coding and read back as "code". */
    const srv = code("lib/website-builder/ai-site/server.ts")
    check("the code step is saved as a step the database accepts, and read back as the code step", /step: job\.step === "code" \? "build" : job\.step/.test(srv) && /coding: job\.step === "code"/.test(srv) && /step: r\.step === "build" && r\.state\?\.coding \? "code" : r\.step/.test(srv))
    check("a description alone still reads as a whole new website in the chat fallback", startMessage(FITNESS).length >= FITNESS.length)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("2. Free design: its own header, footer and sections")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const caps = emptyCaps()
    const types = plannableTypes(addable, schemas, caps)
    const tool = JSON.stringify(sitePlanTool(types, undefined, { free: true }).parameters)
    check("with a coder, the plan tool offers custom sections and asks for a header and footer brief", tool.includes('"custom"') && /"header":\{"type":"string"/.test(tool) && /"footer":\{"type":"string"/.test(tool))
    check("without one, the tool is what it was", !JSON.stringify(sitePlanTool(types).parameters).includes('"custom"'))
    const system = sitePlannerSystem({ free: true, craft: STUDIO_CRAFT })
    check("the planner is told it is not limited to the theme", /not limited to the listed section types/.test(system) && /does not use the theme's header or footer/.test(system) && !/Use only the section types listed/.test(system))
    check("and gets the studio's anti slop rules", system.includes("No purple, violet or indigo gradients") && /giant generic hero/.test(system) && /Never: unlock, elevate, seamless, powerful, effortless/.test(system) && /No em dashes/.test(system))
    check("the turn lists custom beside the library", /- custom: a section designed and coded for this site/.test(sitePlanTurn({ prompt: FITNESS, caps, capsText: "", addable, schemas, free: true })))

    const plan = readSitePlan(fitnessPlan(), { caps, addable, schemas, free: true })!
    check("custom sections are kept with their name and brief", plan.pages[0].sections[0].type === CUSTOM_TYPE && plan.pages[0].sections[0].name === "Coach intro" && /barbell/.test(plan.pages[0].sections[0].content))
    check("their pictures are named in order, to be matched to the coded file", plan.pages[0].sections[0].images[0]?.slot === "image_1" && plan.pages[0].sections[0].images[0]?.query === "barbell training gym")
    check("the header and footer briefs are read", /slim header/.test(plan.chrome!.header) && /dark footer/.test(plan.chrome!.footer))
    check("without free design, custom is not a section type", !readSitePlan(fitnessPlan(), { caps, addable, schemas })!.pages[0].sections.some((s) => s.type === CUSTOM_TYPE))
    const many = fitnessPlan({ pages: [{ key: "home", title: "Home", purpose: "", sections: Array.from({ length: 9 }, (_, i) => ({ type: "custom", name: `S${i}`, purpose: "p", content: "c", scheme: "light", layout: [], images: [] })) }, { key: "more", title: "More", purpose: "", sections: Array.from({ length: 6 }, (_, i) => ({ type: "custom", name: `M${i}`, purpose: "p", content: "c", scheme: "light", layout: [], images: [] })) }] })
    const capped = readSitePlan(many, { caps, addable, schemas, free: true })!
    check(`at most ${MAX_CUSTOM_SECTIONS} custom sections on a site, and said`, capped.pages.flatMap((p) => p.sections).filter((s) => s.type === CUSTOM_TYPE).length === MAX_CUSTOM_SECTIONS && capped.corrections.some((c) => /custom sections/.test(c)))

    const tasks = codeTasks(plan)
    check("the coder's work: the header and the footer first, then every custom section", tasks[0].role === "header" && tasks[1].role === "footer" && tasks.filter((t) => t.role === "section").map((t) => t.key).join(",") === "home:0,home:2,about:0")
    const p = codePrompt(tasks[0], { plan, capsText: "Store: nothing for sale yet.", shop: false, menuHandle: "site-abc", prompt: FITNESS })
    check("the header's brief: kind header, the site's own menu as a link_list, no cart when nothing is sold", /"kind": "header"/.test(p) && /"type": "link_list", "id": "menu", "label": "Menu", "default": "site-abc"/.test(p) && /no cart/.test(p) && p.includes(FITNESS))
    const s = codePrompt(tasks[2], { plan, capsText: "", shop: true, menuHandle: "site-abc", prompt: FITNESS })
    check("a section's brief: editable words as settings, live data, mobile first, the studio's rules", /every word a visitor reads is a setting/.test(s) && /\{% for block in products %\}/.test(s) && /MOBILE FIRST/.test(s) && s.includes(STUDIO_CRAFT) && /"barbell training gym"/.test(s))

    const log: CallLog[] = []
    const site: Site = memorySite(startingSite())
    const asked: { key: string; prompt: string; extra: boolean }[] = []
    const d = deps({ log, site, code: fakeCoder(asked) })
    const done = await runUntil(newJob({ id: "bbbbbbbb-0000-4000-8000-000000000002", creatorId: "c1", ownerUserId: "u1", installId: "bbbbbbbb-1111", prompt: FITNESS }), d)
    const final = site.state()
    check("the job finishes", done.step === "done", { step: done.step, status: done.status, error: done.error, notes: done.state.notes })
    check("every task was coded, header and footer included", done.state.coded.length === 5 && done.state.coded.some((c) => c.role === "header") && done.state.coded.some((c) => c.role === "footer"), done.state.coded.map((c) => c.key))
    check("the files were saved in the site's own folder", Object.keys(site.files!).length === 5 && Object.keys(site.files!).every((k) => CODED_PATH.test(k)))
    const everyPage = Object.entries(final.pages)
    check("no page keeps the theme's preset header or footer", everyPage.every(([, secs]) => !secs.some((x) => x.type === "header" || x.type === "footer")), everyPage.map(([k, secs]) => [k, secs.map((x) => x.type)]))
    check("every page opens with the coded header and closes with the coded footer", everyPage.every(([, secs]) => secs[0]?.type === "northside_header" && secs[secs.length - 1]?.type === "northside_footer"), everyPage.map(([k, secs]) => [k, secs.map((x) => x.type)]))
    const header = final.pages.home[0] as { group?: string; settings: Record<string, unknown> }
    check("the coded header sits in the header group and reads this site's own menu", header.group === "header" && header.settings.menu === siteMenuHandle("bbbbbbbb-1111"))
    const menus = final.settings.menus as Record<string, { links: { title: string; url: string }[] }> | undefined
    check("that menu lists the site's pages", !!menus?.[siteMenuHandle("bbbbbbbb-1111")] && menus[siteMenuHandle("bbbbbbbb-1111")].links.map((l) => l.url).join(",") === "/,/about,/contact", menus)
    const home = final.pages.home.map((x) => x.type)
    check("custom sections land in the plan's order among the built-in ones", home.indexOf("ns_home_0") > 0 && home.indexOf("ns_home_0") < home.indexOf("features_grid") && home.indexOf("features_grid") < home.indexOf("ns_home_2") && home.indexOf("ns_home_2") < home.indexOf("faq_accordion"), home)
    check("and on the other pages", final.pages.about.some((x) => x.type === "ns_about_0"))
    const intro = final.pages.home.find((x) => x.type === "ns_home_0")!
    check("a coded section is placed with its schema's preset, editable like any section", !!intro.settings && intro.name === "Coach intro")
    check("its planned picture went to the coded file's own picture setting", typeof intro.settings.portrait === "string" && /^https:\/\/cdn\.storelib\.test\//.test(String(intro.settings.portrait)), intro.settings)
    check("the coded section's words are not rewritten by the copy step", !log.some((c) => c.kind === "write" && c.user.includes("ns_home_0")))
    const view = publicView(done, 0)
    check("the editor's poll names the coded files and what the coder did", view.files.length === 5 && view.activity.some((a) => a.kind === "coded"))
    check("the pages the build made are all there", ["home", "about", "contact"].every((k) => !!final.pages[k]))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("3. A coded file is checked as if nobody had")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const good = acceptCoded(sectionFile("ns_programs", "Programs", "Three ways to train"), { role: "section", takenTypes: [] })
    check("a real section with a settings schema is accepted", good.ok === true && good.type === "ns_programs" && good.path === "sections/ns_programs.storelib" && (good.ok && good.schema.fields.length > 3), good)
    check("a coded header with its kind and the menu is accepted", acceptCoded(chromeFile("ns_header", "header", "NS header"), { role: "header", takenTypes: [] }).ok === true, acceptCoded(chromeFile("ns_header", "header", "NS header"), { role: "header", takenTypes: [] }))
    const refused = (src: string, role: "section" | "header" | "footer" = "section", taken: string[] = []) => {
      const r = acceptCoded(src, { role, takenTypes: taken })
      return r.ok === true ? "" : (r as { reason: string }).reason
    }
    check("a file that does not compile is refused, with the compiler's words", /compile/i.test(refused(sectionFile("ns_x", "X", "H").replace("</template>", ""))))
    check("a built-in type cannot be overwritten", /already a section/.test(refused(sectionFile("hero_split", "Hero", "H"))))
    check("a type taken on this site cannot be reused", /already a section/.test(refused(sectionFile("ns_x", "X", "H"), "section", ["ns_x"])))
    check("a header without its kind is refused", /must say "kind": "header"/.test(refused(sectionFile("ns_h", "H", "H"), "header")))
    check("a page section claiming to be the header is refused", /must not say "kind"/.test(refused(chromeFile("ns_h2", "header", "H2"), "section")))
    check("a header that does not read the menu is refused", /link_list/.test(refused(chromeFile("ns_h3", "header", "H3").replace('{ "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" },', "").replace(/\{% for link in settings\.menu\.links %\}[\s\S]*?\{% endfor %\}\{% endfor %\}/, ""), "header")))
    check("a placeholder left in a default is refused", /Lorem ipsum/i.test(refused(sectionFile("ns_p", "P", "Lorem ipsum dolor"))))
    check("a banned word in a default is refused", /Unlock/i.test(refused(sectionFile("ns_q", "Q", "Unlock your strength"))))
    check("an em dash in a default is refused", /em dash/.test(refused(sectionFile("ns_r", "R", "Strength — for busy people"))))
    check("a key in the file is refused", /key or a server setting/.test(refused(sectionFile("ns_s", "S", "H").replace("<style scoped>", "<!-- sk-ant-api03-abcdefghijkl --><style scoped>"))))
    check("an env read in the file is refused", /key or a server setting/.test(refused(sectionFile("ns_t", "T", "H").replace("<style scoped>", "<!-- process.env.SECRET --><style scoped>"))))
    check("a script from another address is refused", /script from another address/.test(refused(sectionFile("ns_u", "U", "H").replace("</template>", '</template>\n<script src="https://evil.example/x.js"></script>'))))
    check("a picture typed into the markup is refused", /typed into the markup/.test(refused(sectionFile("ns_v", "V", "H").replace('<h2 class="fx__h">', '<img src="https://images.example/x.jpg" alt=""><h2 class="fx__h">'))))
    check("a picture default that is not an https address is refused", /not an https address/.test(refused(sectionFile("ns_w", "W", "H").replace('"id": "portrait", "label": "Portrait", "default": ""', '"id": "portrait", "label": "Portrait", "default": "javascript:alert(1)"'))))
    {
      const hdr = { id: "header-1", type: "header", name: "Header", settings: {} }
      const own = { id: "own-1", type: "northside_header", name: "Own", settings: {}, group: "header" as const }
      const body = { id: "b-1", type: "hero_split", name: "Hero", settings: {} }
      check("the theme's header is never removed from a page that would have none", applyOp({ sections: [hdr, body], settings: {} }, { kind: "remove_section", id: "header-1" }).sections.length === 2)
      check("it is removed when the site's own header is showing in its place", applyOp({ sections: [hdr, own, body], settings: {} }, { kind: "remove_section", id: "header-1" }).sections.map((s) => s.id).join(",") === "own-1,b-1")
      check("a hidden header of its own does not count", applyOp({ sections: [hdr, { ...own, hidden: true }, body], settings: {} }, { kind: "remove_section", id: "header-1" }).sections.length === 3)
    }
    check("a path outside sections/ can never be made", !CODED_PATH.test("sections/../secrets.storelib") && !CODED_PATH.test("/etc/passwd") && !CODED_PATH.test("layout/theme.storelib") && !CODED_PATH.test("sections/Hero.storelib") && CODED_PATH.test("sections/ns_programs.storelib"))

    const log: CallLog[] = []
    const site: Site = memorySite(startingSite())
    const asked: { key: string; prompt: string; extra: boolean }[] = []
    const d = deps({ log, site, code: fakeCoder(asked, { bad: (key, n) => (key === "home:2" && n <= 1 ? sectionFile("ns_bad", "Bad", "Lorem ipsum dolor sit amet") : key === "footer" ? sectionFile("ns_foot_wrong", "Wrong", "H") : null) }) })
    const done = await runUntil(newJob({ id: "cccccccc-0000-4000-8000-000000000003", creatorId: "c1", ownerUserId: "u1", installId: "cccccccc-1111", prompt: FITNESS }), d)
    check("a refused file is tried again with the reason", asked.filter((a) => a.key === "home:2").length === 2 && asked.filter((a) => a.key === "home:2")[1].extra && /Lorem ipsum/i.test(asked.filter((a) => a.key === "home:2")[1].prompt))
    check(`a file refused ${CODE_TRIES} times is left out and said, never placed broken`, done.state.codeFailed.includes("footer") && done.state.notes.some((n) => /footer could not be coded/.test(n)))
    const pages = Object.values(site.state().pages)
    check("then the theme's footer stays, so no page is left without one", pages.every((secs) => secs.some((x) => x.type === "footer")) && pages.every((secs) => secs[0]?.type === "northside_header"))
    check("nothing refused was saved", !Object.values(site.files!).some((src: string) => /Lorem ipsum|ns_foot_wrong/.test(src)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("4. Long runs: as many turns as the site needs, never for ever")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("the job has a code step between building and writing", STEPS.join(",") === "plan,build,code,write,photos,check,done")
    let clock = 0
    const log: CallLog[] = []
    const site: Site = memorySite(startingSite())
    const asked: { key: string; prompt: string; extra: boolean }[] = []
    const d0 = deps({ log, site, code: fakeCoder(asked, { slow: () => void (clock += 70_000) }) })
    const run = async (job: Job, deadline: number) => runUntil(job, { ...d0, now: () => clock, deadline })
    let job = newJob({ id: "dddddddd-0000-4000-8000-000000000004", creatorId: "c1", ownerUserId: "u1", installId: "dddddddd-1111", prompt: FITNESS })
    job = await run(job, clock + 240_000)
    const firstTurn = asked.length
    check("the first turn plans, builds and starts coding, then stops before its deadline", job.step === "code" && firstTurn > 0 && firstTurn < 5, { step: job.step, asked: firstTurn })
    let turns = 1
    while (job.step !== "done" && turns < 10) {
      job = await run(job, clock + 240_000)
      turns++
    }
    check("the next turns carry on where it stopped and finish", job.step === "done" && turns > 1 && job.state.coded.length === 5, { turns, step: job.step })
    check("no file was written twice", new Set(asked.map((a) => a.key)).size === asked.length)
    check(`a file is not started with less than ${CODE_START_RESERVE_MS / 1000}s left`, CODE_START_RESERVE_MS >= 60_000)
    check(`a job stops after ${MAX_JOB_RUNS} turns`, outOfRuns({ attempts: MAX_JOB_RUNS }) && !outOfRuns({ attempts: MAX_JOB_RUNS - 1 }) && MAX_JOB_RUNS >= 20)
    const runner = code("lib/website-builder/ai-site/runner.ts")
    check("the runner refuses a job past its turns and keeps what it made", /if \(outOfRuns\(job\)\) \{\s*await saveJob\(admin, \{ \.\.\.job, status: "partial"/.test(runner))
    check("Continue starts the count again", /attempts: 0/.test(code("app/api/website-builder/ai-jobs/[jobId]/continue/route.ts")))
    check("each turn hands over to the next with a signed token (no long request)", /if \(after\.step !== "done" && after\.status === "running" && !after\.error\) await kickJob\(origin, jobId\)/.test(runner))
    check("the job's coding counts in its spend", job.state.spend.byModel[PLAN_MODEL]?.calls >= 5)
    check("the coder writes with the strongest model, at medium effort, never a smaller one", /code: writerCoder\(models\.plan\.effort === "medium" \? models\.plan : \{ \.\.\.models\.plan, effort: "medium" \}/.test(runner))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("5. The check: placeholders, banned words and broken pictures")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("banned words are caught as words", !!slopIn("Unlock your best self") && !!slopIn("a seamless booking") && !!slopIn("Strength — for you") && slopIn("Book a free first call") === null && BANNED_COPY.test("Elevate"))
    check("placeholders are caught", !!placeholderIn("Lorem ipsum dolor") && !!placeholderIn("[Your company name]") && !!placeholderIn("Your heading here") && placeholderIn("Four weeks of strength work") === null)
    const site = startingSite()
    const id = "hero_split-x"
    site.pages.home = [...site.pages.home.slice(0, 1), { id, type: "hero_split", name: "Hero", settings: { heading: "Lorem ipsum dolor", image: "javascript:alert(1)" } }, ...site.pages.home.slice(1)]
    const ctx = { site: readSitePlan(fitnessPlan(), { caps: emptyCaps(), addable, schemas, free: true })!, caps: emptyCaps(), capsText: "", prompt: FITNESS, schemas, links: [], defaultLink: "/" }
    const found = deterministicFindings(site, [{ page: "home", id, type: "hero_split", plan: 0 }], {}, ctx, schemas)
    check("a placeholder is a finding the writer is asked to fix", found.some((f) => /Lorem ipsum/i.test(f.message) && rewritable(f)), found)
    check("a picture a browser cannot draw is a finding", found.some((f) => f.kind === "image" && /image/.test(f.message)), found)
    const ok = { ...site, pages: { ...site.pages, home: site.pages.home.map((s) => (s.id === id ? { ...s, settings: { heading: "Strength you can keep", image: "https://cdn.storelib.test/a.jpg" } } : s)) } }
    check("a finished section passes", !deterministicFindings(ok, [{ page: "home", id, type: "hero_split", plan: 0 }], {}, ctx, schemas).some((f) => f.kind === "image" || /Lorem/.test(f.message)))
    check("the old planner prompt is untouched for a job without a coder", SITE_PLANNER_SYSTEM === sitePlannerSystem({}))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("6. Safety: no key in a prompt, one install, one folder")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const was = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-SECRETSECRETSECRET"
    const log: CallLog[] = []
    const site: Site = memorySite(startingSite())
    const asked: { key: string; prompt: string; extra: boolean }[] = []
    const d = deps({ log, site, code: fakeCoder(asked) })
    await runUntil(newJob({ id: "eeeeeeee-0000-4000-8000-000000000005", creatorId: "c1", ownerUserId: "u1", installId: "eeeeeeee-1111", prompt: FITNESS }), d)
    const everything = [...log.map((c) => c.system + c.user), ...asked.map((a) => a.prompt)].join("\n")
    check("no server key reaches any prompt", !everything.includes("SECRETSECRET") && !/service_role|SUPABASE_SERVICE/i.test(everything))
    if (was === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = was
    const server = code("lib/website-builder/ai-site/server.ts")
    check("the server saves a coded file only into this install, only under sections/", /async writeFile\(path, source\) \{\s*if \(!CODED_PATH\.test\(path\) \|\| !installId\) throw/.test(server) && /saveDraft\(admin, installId, path, source\)/.test(server))
    check("the site's menu is its own handle, in this creator's menus only", /if \(!creatorId \|\| !\/\^site-\[a-z0-9\]\{1,16\}\$\/\.test\(handle\)\) return null/.test(server) && /readStoreMenus\(admin, creatorId\)/.test(server))
    check("a handle is made from the install, never from the model", siteMenuHandle("ABCDEF12-3456") === "site-abcdef12")
    const runner = code("lib/website-builder/ai-site/runner.ts")
    check("the runner scopes the site to the job's install and creator", /site: siteIO\(admin, job\.installId, job\.creatorId\)/.test(runner))
    const gen = code("app/api/website-builder/themes/[installId]/generate/route.ts")
    check("a checkpoint from the browser is believed only as far as this install's stored files say", /withStoredCode\(fromCheckpoint\(job, body\.checkpoint\), installId\)/.test(gen) && /\.eq\("install_id", installId\)\.in\("path"/.test(gen))
    check("job routes still ask who is calling and scope by creator", /websiteCaller\(\)/.test(code("app/api/website-builder/ai-jobs/[jobId]/route.ts")) && /\.eq\("creator_id", site\.creatorId\)/.test(code("app/api/website-builder/ai-jobs/[jobId]/route.ts")) && /verifyJobToken\(jobId/.test(code("app/api/website-builder/ai-jobs/[jobId]/run/route.ts")))
    const coded = code("lib/website-builder/ai-site/code.ts")
    check("the coder runs on the server through the provider layer; no key is read here", !/process\.env/.test(coded) && /provider: counted\(ref\.provider/.test(coded))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("7. The progress view and the Website page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const act = codeActivity([{ kind: "code", name: "Header" }, { kind: "code", name: "Programs" }, { kind: "coded", name: "Header" }, { kind: "code", name: "Footer" }, { kind: "skipped", name: "Footer" }])
    check("what is being coded comes first, then what was just coded; a file left out is not shown as working", act.length === 2 && act[0].kind === "code" && act[0].name === "Programs" && act[1].kind === "coded" && act[1].name === "Header", act)
    const html = renderToStaticMarkup(createElement(GenerationPanel, { view: { status: "running", step: "code", progress: 30, error: null, notes: [], findings: [], activity: [{ kind: "code", name: "Programs and prices" }] }, mode: "job", onContinue: () => {}, onAskFix: () => {}, onClose: () => {} }))
    check("the progress view shows the Code step and the section being coded", html.includes("Coding your sections") && html.includes("Coding Programs and prices") && html.includes("data-generation-activity"))
    check("five steps in one row", /data-generation-steps/.test(html) && (html.match(/<li /g) ?? []).length >= 5)

    const t0 = Date.parse("2026-11-09T10:00:00Z")
    const rows = [{ id: "a", saved_at: new Date(t0).toISOString() }]
    check("a page copy older than this tab's save is asked for again", pagesBehind(rows, () => t0 + 60_000, new Set()).length === 1)
    check("once per save, never in a loop", pagesBehind(rows, () => t0 + 60_000, new Set(["a:" + (t0 + 60_000)])).length === 0)
    check("a copy that already has the save, or a site this tab never saved, is left alone", pagesBehind(rows, () => t0 + 1_000, new Set()).length === 0 && pagesBehind(rows, () => 0, new Set()).length === 0)
    const client = code("app/(storelib)/app/website-builder/website-builder-client.tsx")
    check("every refresh on the Website page goes through the one transition, never router.refresh directly", (client.match(/router\.refresh\(\)/g) ?? []).length === 1 && /startRefresh\(\(\) => router\.refresh\(\)\)/.test(client))
    check("a refresh while one is on its way is folded into it", /if \(refreshing\.current\) \{\s*again\.current = true/.test(client))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
