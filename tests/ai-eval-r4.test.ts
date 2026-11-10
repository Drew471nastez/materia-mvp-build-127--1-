/**
 * ===========================================================================
 *  ROUND R (R4): THE AI WEBSITE EVALUATION, AS A SUITE
 * ===========================================================================
 * Six businesses (premium personal fitness coach, contemporary clothing
 * brand, editorial photography portfolio, luxury skincare, modern
 * architecture studio, professional consulting) through BOTH engines:
 *
 *   agent    Start with AI with the agent on: the real loop, brief phase
 *            (O2 direction, P2 template chosen and applied), tools, finish
 *            gate and repair rounds, through the create and run routes
 *   native   Start with AI with the agent off: the classic job's steps with
 *            R2's native JSON engine (AI_NATIVE_ENGINE on by default): the
 *            registry, validation with repair, placement, the writer for
 *            what it left empty, photos, the check
 *
 * then every site held to the same checks (lib/ai-builder/eval/checks.ts):
 * valid Storelib data, only supported components, renders on every page,
 * real Chromium at 1440 and 390 with JS off (O4's measurements) and the live
 * runtime with JS on (the phone menu opens), no broken or empty pictures,
 * the direction fits the business (O2), the home page tells the trade's
 * story (O5), distinct from the other five (O3 fingerprints, palette and
 * type distance), coherent tokens, edited and saved through the editor's
 * routes, published and read back by the live site's reader.
 *
 * SCRIPTED, SAID PLAINLY: the model is a script (tests/_eval/decks.ts,
 * adapt.ts, native-answers.ts). This proves the SYSTEM turns a realistic
 * answer into a valid, editable, publishable, distinct site and that the
 * rules hold; it says nothing about how good a real model's site would be
 * (node scripts/ai-builder/eval.mjs --live does that, never in CI).
 *
 * KNOWN GAPS below are failures this suite found in the system and that
 * are another lane's to fix; each is written down with its reason. A known
 * gap that starts passing is reported (remove it); any OTHER failure fails
 * the suite.
 *
 * Without Chromium the browser checks are "not run" (never a pass) and the
 * rest still runs. R4_REPORT_DIR=<dir> also writes the report with its
 * screenshots there.
 *
 * Strict: it drives route handlers through tests/_journey.
 */
import "./_journey/env"
process.env.CHROMIUM_PATH = "/nonexistent/chromium"
process.env.AI_JOB_SECRET = "journey-ai-job-secret-for-tests-only"
import { checker } from "./ai-builder-e2e-kit"
import { runEval } from "./_eval/run"
import { browserHere } from "./_eval/browser"
import { EVAL_SCENARIOS } from "@/lib/ai-builder/eval/scenarios"
import { CHECKS, type EvalSite } from "@/lib/ai-builder/eval/types"
import { checkData, checkDirection, checkImages, checkNovelty, checkTokens, checkSections, deltaE, evaluateSites, noveltyTable } from "@/lib/ai-builder/eval/checks"
import { renderReport } from "@/lib/ai-builder/eval/report"
import { capped, liveCaps, liveGate } from "../scripts/ai-builder/eval"
import { DECKS } from "./_eval/decks"
import { CopyWriter, adaptFile, guardProductMedia } from "./_eval/adapt"

const { check, done, section } = checker()

/** Failures this suite found that belong to other lanes, with why. Key: engine:scenario:check. */
const KNOWN_GAPS: Record<string, string> = {
  "agent:consulting:direction.fit": "O5/O2: 'Professional consulting for manufacturers' is classified as the digital-creator story (the local-professional words have 'consultant' but not 'consulting'), and the brief's main action reads 'Book a session'.",
  "native:consulting:direction.fit": "Same brief as the agent's: the classification is shared (lib/storelib-ai/layout/stories.ts, direction/brief.ts).",
  "agent:fitness:novelty.distinct": "O2/P2: the fitness and consulting agent sites land on the same fingerprint (split hero with media, light white ground, plain grotesk): similarity 0.84 over O3's 0.82.",
  "agent:consulting:novelty.distinct": "The same pair as agent:fitness, seen from the consulting side.",
  "agent:photography:direction.fit": "O2: 'Show the work first, take commission enquiries and sell a few signed prints' reads as objective buy ('Shop now'): the side line about prints outranks the commissions the creator put first.",
  "native:photography:direction.fit": "Same brief as the agent's (shared O2 reading)."
}

async function units() {
  section("1. The checks catch what they are for (pure)")
  const sc = EVAL_SCENARIOS[0]
  const base: EvalSite = {
    engine: "native",
    engineLabel: "unit",
    scenario: sc,
    status: "complete",
    pages: [{ key: "home", sections: [{ id: "h", type: "hero_split", settings: { heading: "Strength coaching" }, blocks: [] }] }],
    sources: {},
    settings: { background_color: "#ffffff", text_color: "#111111", font_heading: "Archivo", font_body: "Inter" },
    capabilities: null,
    mode: "theme",
    notes: [],
  }
  check("data.valid passes a plain native page", checkData(base).status !== "fail", checkData(base))
  const unknown = { ...base, pages: [{ key: "home", sections: [{ id: "x", type: "ai_nowhere", settings: {}, blocks: [] }] }] }
  check("  and fails a section type with no file", checkData(unknown).status === "fail" && /no file|ai_nowhere/.test(checkData(unknown).detail), checkData(unknown))
  const http = { ...base, pages: [{ key: "home", sections: [{ id: "h", type: "hero_split", settings: { image: "http://example.com/a.jpg" }, blocks: [] }] }] }
  check("images.ok fails a picture that is not https or the media library", checkImages(http).status === "fail", checkImages(http))
  const grey = { ...base, settings: { ...base.settings, text_color: "#bbbbbb", background_color: "#ffffff" } }
  check("tokens.coherent fails body text under 4.5:1", checkTokens(grey).status === "fail", checkTokens(grey))
  const slop = { ...base, settings: { ...base.settings, background_color: "#f4efe6", font_heading: "Instrument Serif", accent_color: "#c2410c" }, concept: { name: "x", mood: [], styles: [], typeSystem: { display: "Instrument Serif", body: "Inter", scaleRatio: 1.3, rule: "labels in mono caps", mono: "IBM Plex Mono" }, palette: { mode: "light", background: "#f4efe6", text: "#1d1b18", accent: "#c2410c", accentUse: "" }, layout: { principles: [], density: "balanced", radius: 2 }, motion: { stance: "subtle", moves: [] }, imagery: { direction: "", avoid: [] }, signatureMoves: [] } as never }
  check("direction.fit fails the editorial-serif cliché on a fitness coach", checkDirection(slop).status === "fail" && /cliché|serif/i.test(checkDirection(slop).detail), checkDirection(slop))
  const skeleton = { ...base, pages: [{ key: "home", sections: ["hero_centered", "features_grid", "pricing_table", "faq_accordion", "cta_simple"].map((t, i) => ({ id: `s${i}`, type: t, settings: {}, blocks: [] })) }] }
  check("sections.relevant fails a software skeleton that says nothing of the trade", checkSections(skeleton).status === "fail", checkSections(skeleton))
  const twin = { ...base, scenario: EVAL_SCENARIOS[1] }
  const table = noveltyTable([base, twin])
  check("novelty.distinct fails two sites that are the same", checkNovelty(base, table).status === "fail" && table[0].nearest?.similarity === 1, table[0])
  check("deltaE: white to black is about 100, a colour to itself 0", Math.round(deltaE("#ffffff", "#000000")) === 100 && deltaE("#123456", "#123456") === 0)
  const pend = evaluateSites([{ ...base, status: "pending", why: "not here" }])
  check("a site whose engine did not run is 'not run' on every check, never a pass", pend[0].checks.length === CHECKS.length && pend[0].checks.every((c) => c.status === "pending"))
  const html = renderReport({ results: evaluateSites([base, twin]), mode: "scripted", generatedAt: "now", honesty: ["<b>scripted</b>"], findings: [] })
  check("the report names both, every check, and escapes what it prints", html.includes("Premium personal fitness coach") && CHECKS.every((c) => html.includes(c.label.replace(/&/g, "&amp;").split(" (")[0])) && html.includes("&lt;b&gt;scripted&lt;/b&gt;") && !html.includes("<b>scripted</b>"))
  check("  a page that reads in light and dark (tokens on :root, both schemes)", /prefers-color-scheme:dark/.test(html) && /:root\[data-theme="dark"\]/.test(html) && /<title>[^<]{3,40}<\/title>/.test(html))

  section("2. The scripted model's own pieces")
  const writer = new CopyWriter(DECKS.skincare)
  const file = `<template><h2>{{ settings.heading }}</h2></template>\n<style scoped>.x{backdrop-filter: blur(8px); color: red}</style>\n<schema>\n{"type":"ai_x_y","name":"Y","settings":[{"type":"text","id":"heading","label":"Heading","default":"Lift with a plan"},{"type":"url","id":"cta_url","label":"Link","default":"/book"},{"type":"text","id":"cart_label","label":"Cart","default":"Cart"}]}\n</schema>`
  const adapted = adaptFile(file, writer)
  check("adaptFile: the heading becomes the business's words; links and interface labels stay; no glass", /"default": "Three products, one ritual"/.test(adapted) && /"default": "\/book"/.test(adapted) && /"default": "Cart"/.test(adapted) && !/backdrop-filter/.test(adapted), adapted)
  check("guardProductMedia: the frame only when the product has pictures", guardProductMedia(`<div class="pp__media">{% for img in product.images %}<img src="{{ img }}">{% endfor %}</div>`) === `{% if product.images.size > 0 %}<div class="pp__media">{% for img in product.images %}<img src="{{ img }}">{% endfor %}</div>{% endif %}` && guardProductMedia("<div>nothing</div>") === null)

  section("3. The live mode's gate and caps (no call is made here)")
  check("refused without STORELIB_LIVE_AI_EVAL=1", !liveGate({ ANTHROPIC_API_KEY: "x" }).ok)
  check("refused without a key", !liveGate({ STORELIB_LIVE_AI_EVAL: "1" }).ok)
  check("refused in CI whatever else is set", !liveGate({ CI: "1", STORELIB_LIVE_AI_EVAL: "1", ANTHROPIC_API_KEY: "x" }).ok)
  check("allowed with both, outside CI", liveGate({ STORELIB_LIVE_AI_EVAL: "1", ANTHROPIC_API_KEY: "x" }).ok)
  check("caps: defaults $20 a run and $15 a site, bounded", JSON.stringify(liveCaps({})) === JSON.stringify({ totalUsd: 20, perSiteUsd: 15 }) && liveCaps({ AI_EVAL_MAX_USD: "9999", AI_EVAL_MAX_USD_PER_SITE: "9999" }).totalUsd === 150 && liveCaps({ AI_EVAL_MAX_USD_PER_SITE: "9999" }).perSiteUsd === 40)
  let calls = 0
  const inner = { id: "x", complete: async () => (calls++, { text: "", toolCalls: [], raw: null, usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 }, stop: "done" as const }) }
  const meter = { total: 0, site: 0, caps: { totalUsd: 1, perSiteUsd: 0.6 } }
  const p = capped(inner, meter, () => 0.5)
  const req = { model: "m", system: "", turns: [], tools: [] } as never
  await p.complete(req)
  await p.complete(req)
  let refused = ""
  await p.complete(req).catch((e: Error) => (refused = e.message))
  check("the capped provider refuses before a call once a site's cap is spent, and counts the spend", calls === 2 && /spend cap/.test(refused) && meter.total === 1, { calls, refused, meter })
}

async function main() {
  await units()

  section("4. Six businesses through both engines, every site checked")
  const reportDir = process.env.R4_REPORT_DIR || null
  const t0 = Date.now()
  const run = await runEval({ outDir: reportDir, log: (l) => console.log(l) })
  console.log(`        (${Math.round((Date.now() - t0) / 1000)} s on the wall clock)`)
  const { results } = run
  check("twelve sites: six businesses × two engines", results.length === 12 && EVAL_SCENARIOS.every((s) => results.filter((r) => r.site.scenario.id === s.id).length === 2), results.map((r) => `${r.site.engine}:${r.site.scenario.id}`))
  check("  every job completed", results.every((r) => r.site.status === "complete"), results.filter((r) => r.site.status !== "complete").map((r) => ({ k: `${r.site.engine}:${r.site.scenario.id}`, status: r.site.status, notes: r.site.notes })))
  const agent = results.filter((r) => r.site.engine === "agent")
  check("  the agent started five of six from a starting template, and consulting (no close template) from zero", agent.filter((r) => r.site.template).length === 5 && !agent.find((r) => r.site.scenario.id === "consulting")?.site.template, agent.map((r) => [r.site.scenario.id, r.site.template]))
  const native = results.filter((r) => r.site.engine === "native")
  check("  the native sites came from R2's JSON engine (no fallback to the classic planner)", native.every((r) => /R2 JSON engine/.test(r.site.engineLabel)), native.map((r) => r.site.engineLabel))
  check("  agent sites carry their own components; native sites only Storelib's sections", agent.every((r) => Object.keys(r.site.sources).some((p) => /^sections\/ai_/.test(p))) && native.every((r) => !Object.keys(r.site.sources).some((p) => /^sections\/ai_/.test(p))))

  const browser = browserHere()
  const always = ["data.valid", "components.supported", "render.ok", "editor.saved", "publish.ok"]
  for (const id of always) check(`${id}: every site passes`, results.every((r) => r.checks.find((c) => c.id === id)?.status === "pass"), results.filter((r) => r.checks.find((c) => c.id === id)?.status !== "pass").map((r) => ({ k: `${r.site.engine}:${r.site.scenario.id}`, c: r.checks.find((c) => c.id === id) })))
  for (const id of ["browser.desktop", "browser.mobile", "browser.interactive", "images.ok"]) {
    const statuses = results.map((r) => r.checks.find((c) => c.id === id)?.status)
    check(browser ? `${id}: no site fails in Chromium` : `${id}: reported as not run without Chromium (never a pass)`, browser ? !statuses.includes("fail") : statuses.every((s) => s === "pending" || (id === "images.ok" && s !== "pass")), results.filter((r) => r.checks.find((c) => c.id === id)?.status === "fail").map((r) => ({ k: `${r.site.engine}:${r.site.scenario.id}`, c: r.checks.find((c) => c.id === id) })))
  }
  if (browser) {
    const menus = agent.map((r) => r.site.browser?.interactive?.menu)
    check("  JS on: every agent site's phone menu opens with links", menus.every((m) => m === "opened"), agent.map((r) => [r.site.scenario.id, r.site.browser?.interactive]))
  }

  section("5. Every other failure is a known gap, written down")
  const failures = results.flatMap((r) => r.checks.filter((c) => c.status === "fail").map((c) => ({ key: `${r.site.engine}:${r.site.scenario.id}:${c.id}`, detail: c.detail })))
  const unknown = failures.filter((f) => !KNOWN_GAPS[f.key])
  check("no failure outside the known gaps", unknown.length === 0, unknown)
  for (const key of Object.keys(KNOWN_GAPS)) {
    const still = failures.some((f) => f.key === key)
    console.log(`  ${still ? "known" : "FIXED"} ${key}${still ? "" : "  (it passes now: remove it from KNOWN_GAPS)"}`)
  }
  check("the six agent sites are told apart by O3's fingerprints, but for the known pair", agent.filter((r) => r.checks.find((c) => c.id === "novelty.distinct")?.status === "fail").every((r) => KNOWN_GAPS[`agent:${r.site.scenario.id}:novelty.distinct`]))
  check("the six native sites are told apart", native.every((r) => r.checks.find((c) => c.id === "novelty.distinct")?.status !== "fail"), native.map((r) => r.checks.find((c) => c.id === "novelty.distinct")))
  if (run.reportPath) console.log(`\n  report: ${run.reportPath}`)

  check("no server errors on the way", run.serverErrors.length === 0, run.serverErrors)
  done()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
