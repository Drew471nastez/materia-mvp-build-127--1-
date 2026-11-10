/**
 * ===========================================================================
 *  ROUND R (R4): THE WHOLE EVALUATION, ONE CALL
 * ===========================================================================
 * Every scenario through every engine asked for, in one journey world (the
 * in-memory PostgREST built from the SQL files, the real routes), then the
 * harness's observations (./harness.ts), the checks
 * (lib/ai-builder/eval/checks.ts) and, when asked, the report
 * (lib/ai-builder/eval/report.ts) with its screenshots.
 *
 * Used by tests/ai-eval-r4.test.ts (scripted) and scripts/ai-builder/eval.ts
 * (scripted by default, --live on real providers).
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import type { AgentModels } from "@/lib/ai-builder/agent/ports"
import type { Models } from "@/lib/website-builder/ai-site/models"
import { EVAL_SCENARIOS, type EvalScenarioId } from "@/lib/ai-builder/eval/scenarios"
import { evaluateSites } from "@/lib/ai-builder/eval/checks"
import { renderReport } from "@/lib/ai-builder/eval/report"
import type { EvalEngine, EvalResult, EvalShot, EvalSite } from "@/lib/ai-builder/eval/types"
import { aiWorld } from "../ai-builder-e2e-kit"
import { agentExtraDeps, runAgentScenario } from "./agent-run"
import { runNativeScenario } from "./native-run"
import { editAndPublish, lookInBrowser, photographBefore, renderPages, snapshot } from "./harness"
import { fontsLoaded, launchBrowser } from "./browser"
import { setPicturePalette } from "./images"
import { DECKS } from "./decks"

export interface EvalRunOptions {
  engines?: EvalEngine[]
  scenarios?: EvalScenarioId[]
  /** Where the report and its pictures go; null: no report, no pictures. */
  outDir?: string | null
  browser?: boolean
  /** Live: real models per engine, and a spend cap over the whole run (USD). */
  live?: { agent?: () => Promise<AgentModels>; native?: () => Promise<Models>; maxUsd: number; spent?: () => number }
  log?: (line: string) => void
}

export interface EvalRunResult {
  results: EvalResult[]
  reportPath: string | null
  serverErrors: unknown[]
  refusedHosts: string[]
}

export async function runEval(opts: EvalRunOptions = {}): Promise<EvalRunResult> {
  const log = opts.log ?? ((l: string) => console.log(l))
  const engines = opts.engines ?? ["agent", "native"]
  const scenarios = EVAL_SCENARIOS.filter((s) => !opts.scenarios || opts.scenarios.includes(s.id))
  const out = opts.outDir ?? null
  const shotsDir = out ? join(out, "shots") : null
  if (shotsDir) mkdirSync(shotsDir, { recursive: true })
  const { defaultTemplates } = await import("@/lib/ai-builder/agent/templates")
  /* Template first, as production runs it (the e2e kit's default is none), with the eval's picture service. */
  const w = await aiWorld({ extra: (job) => ({ templates: defaultTemplates, ...agentExtraDeps(job) }) })
  const browser = opts.browser === false ? null : await launchBrowser()
  if (!browser) log("  (no Chromium here: the browser checks are reported as not run)")
  const sites: EvalSite[] = []
  let spentUsd = 0
  try {
    for (const sc of scenarios) {
      const deck = DECKS[sc.id]
      setPicturePalette(sc.id, [deck.native.palette.background, deck.native.palette.accent, deck.native.palette.surface, deck.native.palette.text, deck.native.palette.heading])
      for (const engine of engines) {
        const stem = shotsDir ? join(shotsDir, `${engine}-${sc.id}`) : null
        if (opts.live && spentUsd >= opts.live.maxUsd) {
          sites.push(pendingSite(engine, sc, `the run's spend cap ($${opts.live.maxUsd}) was reached before this one`))
          continue
        }
        const t0 = Date.now()
        let before: EvalShot | null = null
        let beforeLabel = ""
        try {
          const site =
            engine === "agent"
              ? await runAgentScenario(w, sc, {
                  ...(opts.live?.agent ? { models: await opts.live.agent() } : {}),
                  afterFirstTurn: async ({ installId }) => {
                    const snap = await snapshot(w, pendingSite("agent", sc, ""), installId)
                    before = await photographBefore(browser, { ...snap, status: "partial" }, stem ? `${stem}-before` : null)
                    beforeLabel = "Template as applied (before) → adapted by the agent (after)"
                  },
                })
              : await runNativeScenario(w, sc, {
                  ...(opts.live?.native ? { models: await opts.live.native() } : {}),
                  afterBuild: async ({ installId }) => {
                    const snap = await snapshot(w, { ...pendingSite("native", sc, ""), mode: "theme" }, installId)
                    before = await photographBefore(browser, { ...snap, status: "partial" }, stem ? `${stem}-before` : null)
                    beforeLabel = "Placed (before the photo and check steps) → finished"
                  },
                })
          const { person, ...rest } = site
          const evalSite: EvalSite = rest
          const creatorId = String(w.j.rows("store_theme_installs").find((r) => r.id === evalSite.installId)?.creator_id ?? "")
          evalSite.render = await renderPages(evalSite, creatorId)
          evalSite.browser = await lookInBrowser(browser, evalSite, stem)
          const slug = String(w.j.rows("creators").find((c) => c.id === creatorId)?.slug ?? "")
          const after = evalSite.browser.shots.find((s) => s.page === "home") ?? null
          evalSite.refinement = beforeLabel ? { label: beforeLabel, before, after, detail: engine === "agent" ? "The same install photographed after the brief phase applied the starting template (with the direction's palette and type), and again when the job finished." : "R3's native review (targeted JSON patches) is not on this branch yet; this shows the native placement before the photo and check steps, and the finished site." } : null
          const { editor, publish } = await editAndPublish(w, evalSite, person, slug)
          evalSite.editor = editor
          evalSite.publish = publish
          sites.push(evalSite)
          spentUsd = opts.live?.spent?.() ?? spentUsd + (evalSite.costUsd ?? 0)
          log(`  ${engine.padEnd(6)} ${sc.id.padEnd(12)} ${evalSite.status.padEnd(9)} ${String(Date.now() - t0).padStart(6)} ms  ${evalSite.engineLabel}`)
        } catch (e) {
          log(`  ${engine.padEnd(6)} ${sc.id.padEnd(12)} THREW ${e instanceof Error ? (e.stack ?? e.message).slice(0, 800) : String(e)}`)
          sites.push({ ...pendingSite(engine, sc, `the run threw: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`), status: "failed" })
        }
      }
    }
  } finally {
    await browser?.close().catch(() => undefined)
  }
  const results = evaluateSites(sites)
  let reportPath: string | null = null
  if (out) {
    /* Pictures by paths relative to the page. */
    const rel = (p?: string) => (p ? relative(out, p) : undefined)
    const relShot = (s: EvalShot | null | undefined): EvalShot | null => (s ? { page: s.page, desktop: rel(s.desktop), mobile: rel(s.mobile), desktopFold: rel(s.desktopFold), mobileFold: rel(s.mobileFold), mobileMenu: rel(s.mobileMenu) } : null)
    for (const r of results) {
      if (r.site.browser) r.site.browser = { ...r.site.browser, shots: r.site.browser.shots.map((s) => relShot(s)!) }
      if (r.site.refinement) r.site.refinement = { ...r.site.refinement, before: relShot(r.site.refinement.before), after: relShot(r.site.refinement.after) }
    }
    const html = renderReport({
      results,
      mode: opts.live ? "live" : "scripted",
      generatedAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
      honesty: honestyLines(!!opts.live, !!browser, results),
      findings: findingsOf(results),
    })
    reportPath = join(out, "index.html")
    writeFileSync(reportPath, html)
    writeFileSync(join(out, "results.json"), JSON.stringify(results.map((r) => ({ engine: r.site.engine, engineLabel: r.site.engineLabel, scenario: r.site.scenario.id, status: r.site.status, template: r.site.template, notes: r.site.notes, checks: r.checks })), null, 2))
  }
  return { results, reportPath, serverErrors: [...w.j.serverErrors, ...w.j.afterErrors], refusedHosts: [...w.j.net.refused] }
}

export function pendingSite(engine: EvalEngine, sc: (typeof EVAL_SCENARIOS)[number], why: string): EvalSite {
  return { engine, engineLabel: engine, scenario: sc, status: "pending", why, pages: [], sources: {}, settings: {}, capabilities: null, mode: engine === "agent" ? "blank" : "theme", notes: why ? [why] : [] }
}

function honestyLines(live: boolean, browser: boolean, results: EvalResult[]): string[] {
  const lines = live
    ? ["LIVE: the models are the real providers (the creator's or the platform's keys), so this measures the models' choices as well as the system, for these six briefs on this day. Spend is capped per run."]
    : [
        "SCRIPTED: no API key here, so the model is a script. Its words, decisions and tool calls were written by hand per business (tests/_eval/decks.ts) to be realistic. Everything it asks for is executed by the real code: the agent's loop, tools, starting templates, finish gate and repair rounds; the native engine's registry, validation and placement (R2); the classic job's steps; the editor's save routes; publish; the live site's reader.",
        "So this measures the SYSTEM (does a realistic answer become a valid, editable, publishable, distinct site; do the direction, story, novelty and slop rules hold), not how good a real model's words or choices are. `scripts/ai-builder/eval.ts --live` does that when keys are configured.",
        "Copy in the agent runs is placed by the role of each setting (heading, paragraph, question...) from a per-business deck, not composed per section the way a model reads it, so a heading can sit a little off its spot.",
      ]
  lines.push("PICTURES are stand-ins: no image provider has a key here, so the agent's picture service and the native photo search answer with abstract compositions in each business's palette, at the asked size. The screenshots show where and how big pictures are, not real photography.")
  if (!browser) lines.push("NO BROWSER: Chromium was not available, so the screenshot, measurement and interactivity checks are reported as not run (never as a pass).")
  else lines.push(`Fonts: ${fontsLoaded() === false ? "Google Fonts could not be reached here, so the screenshots use fallback faces" : "Google Fonts were fetched through the environment's proxy, so the screenshots use the real faces"}. JS-off pictures are what a visitor sees before any script; the menu picture is the live runtime with JS on.`)
  const pending = results.filter((r) => r.site.status === "pending")
  if (pending.length) lines.push(`Not run: ${pending.map((r) => `${r.site.scenario.name} (${r.site.engine}): ${r.site.why}`).join("; ")}.`)
  return lines
}

/** What building and running this suite found about the system, beyond the table (said once, kept current by hand). */
export const SYSTEM_NOTES = [
  "P2a's templates ship at five or six of the six anti-slop warnings O3 lets a finished site carry (frosted glass, pills, animation and accent use in the shared kit chrome): Pressure with its direction's palette came to seven and finish refused until the header's glass came out. Template-first adaptation starts at the edge of the budget.",
  "After the brief phase applies a starting template, its files are not marked as read for the agent: the first write_file to any of them is refused (\"already exists. Read it before you change it\"), so a model spends a turn reading every file first.",
  "The course-coach and studio-kinetic product templates draw an empty media frame for a product with no pictures; finish refuses it (render.empty_media) and the model has to repair it (the script does: the frame only when there are pictures).",
  "O4's browser measure counted a storefront hook's hidden template picture (the search result and cart line <img width> inside a hidden element) as an empty picture, a hard gate: with Chromium on, the critic would refuse every P4 kit header. Fixed here in lib/ai-builder/visual-critic/measure.ts.",
  "R2's native engine has no novelty pressure across a creator's sites (O3's noveltyIssues runs in the agent loop only): the first hand-written native answers put three sites on one fingerprint and the engine took them. The answers were then varied as a careful model would; a real model is not held to it.",
  "Consulting has no starting template close enough (chooseTemplate scores 0), so the agent builds it from zero.",
]

function findingsOf(results: EvalResult[]): string[] {
  const out: string[] = [...SYSTEM_NOTES]
  for (const r of results)
    for (const c of r.checks) if (c.status === "fail") out.push(`${r.site.scenario.name}, ${r.site.engine}: ${c.id}: ${c.detail}`)
  for (const r of results) if (r.site.status !== "complete" && r.site.status !== "pending") out.push(`${r.site.scenario.name}, ${r.site.engine}: the job ended ${r.site.status}. ${r.site.notes.slice(-2).join(" ")}`)
  return out
}
