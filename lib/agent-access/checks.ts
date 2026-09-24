/**
 * ===========================================================================
 *  storelib_run_tests: THE CHECKS, AND ONLY CHECKS THAT HAVE AN ANSWER
 * ===========================================================================
 * An agent that says "done" has to be able to find out whether it is. These
 * are the checks it runs, and every one names a failure with an objective
 * answer and a fix:
 *
 *   compile        the file compiles, every name it reads is declared
 *   quality        lib/storelib-ai/quality.ts: scheme colours, container
 *                  queries, no fixed ids, reduced motion, real buttons...
 *   page-types     every section on the page is a type this site has
 *   page-settings  every setting on the page is one its section declares
 *   contrast       text against its background, 4.5:1 or better
 *   limits         sections per page and blocks per section
 *
 * They are the same functions the save paths run. The write tools refuse a
 * section file that fails compile or quality, so a file an agent could save
 * is a file these pass; the page checks are what an agent runs after a patch.
 *
 * No command runs. Nothing here spawns a process, reads the filesystem or
 * reaches the network: an agent's "run the tests" is these functions over
 * this site's rows, and nothing on the host is reachable from it.
 *
 * Pure. tests/agent-mcp.test.ts drives it.
 */

import { validateSection } from "@/lib/storelib-ai/validate"
import { contrastFindings } from "@/lib/website-builder/agent/review"
import { fieldsFor, type ThemeState } from "@/lib/website-builder/agent/operations"
import { schemaOf, type SchemaMap } from "@/lib/website-builder/agent/schemas"
import { LIMITS } from "@/lib/storelib-theme/types"
import type { CheckId } from "@/lib/agent-skills"

export interface CheckResult {
  check: CheckId
  target: string
  ok: boolean
  /** What failed, one line each, with a line number or section id. */
  problems: string[]
  /** Worth knowing, not a failure. */
  warnings: string[]
}

export const ALL_CHECKS: CheckId[] = ["compile", "quality", "page-types", "page-settings", "contrast", "limits"]

/** compile and quality for one section file. */
export function checkSectionFile(path: string, source: string, wanted: CheckId[] = ALL_CHECKS): CheckResult[] {
  const type = /^sections\/([a-z0-9_-]+)\.storelib$/.exec(path)?.[1]
  const v = validateSection(source, { path, expectType: type })
  const out: CheckResult[] = []
  if (wanted.includes("compile")) {
    out.push({
      check: "compile",
      target: path,
      ok: !(v.ok === false && v.reason === "compile"),
      problems: v.ok === false && v.reason === "compile" ? v.errors.map((e) => `${path}${e.line ? `:${e.line}` : ""} ${e.message}`) : [],
      warnings: [],
    })
  }
  if (wanted.includes("quality") && !(v.ok === false && v.reason === "compile")) {
    const failed = v.ok === false && v.reason === "quality"
    out.push({
      check: "quality",
      target: path,
      ok: !failed,
      problems: failed ? v.findings.filter((f) => f.severity === "error").map((f) => `${path}: ${f.message}`) : [],
      warnings: v.ok === true ? v.findings.map((f) => f.message) : [],
    })
  }
  return out
}

/** The page checks, for one page as it stands (or as a patch left it). */
export function checkPageState(pageKey: string, state: ThemeState, schemas: SchemaMap, wanted: CheckId[] = ALL_CHECKS): CheckResult[] {
  const target = `page ${pageKey}`
  const out: CheckResult[] = []

  if (wanted.includes("page-types")) {
    const unknown = state.sections.filter((s) => !schemaOf(schemas, s.type))
    out.push({
      check: "page-types",
      target,
      ok: unknown.length === 0,
      problems: unknown.map((s) => `[${s.id}] is a "${s.type}" section, and this site has no section of that type. Write sections/${s.type}.storelib or remove it.`),
      warnings: [],
    })
  }

  if (wanted.includes("page-settings")) {
    /**
     * A WARNING, NOT A FAILURE, for a setting the schema no longer declares.
     * A section file that dropped a setting leaves the old value on every
     * page that used it; it does nothing, and it is not the agent's to
     * delete. A value a control cannot take IS a failure: it is what the
     * page tools refuse, so only a hand edit or an old row can have it.
     */
    const problems: string[] = []
    const warnings: string[] = []
    for (const s of state.sections) {
      const fields = schemaOf(schemas, s.type) ? fieldsFor(s.type, schemas) : []
      if (!fields.length) continue
      const byId = new Map(fields.map((f) => [f.id, f]))
      for (const [id, value] of Object.entries(s.settings ?? {})) {
        const f = byId.get(id)
        if (!f) {
          warnings.push(`[${s.id}] ${s.type}: "${id}" is not a setting of this section; it has no effect.`)
          continue
        }
        if ((f.type === "select" || f.type === "radio") && f.options?.length && typeof value === "string" && value !== "") {
          if (!f.options.some((o) => o.value === value)) problems.push(`[${s.id}] ${s.type}: "${id}" is "${value}", which is not one of its choices (${f.options.map((o) => o.value).join(", ")}).`)
        }
        if ((f.type === "range" || f.type === "number") && typeof value === "number") {
          if ((f.min !== undefined && value < f.min) || (f.max !== undefined && value > f.max)) {
            problems.push(`[${s.id}] ${s.type}: "${id}" is ${value}, outside ${f.min ?? "-"} to ${f.max ?? "-"}.`)
          }
        }
      }
    }
    out.push({ check: "page-settings", target, ok: problems.length === 0, problems, warnings: warnings.slice(0, 20) })
  }

  if (wanted.includes("contrast")) {
    const problems: string[] = []
    const all = new Set(state.sections.map((s) => s.id))
    for (const s of state.sections) {
      if (s.hidden || !schemaOf(schemas, s.type)) continue
      /* Every colour the section has, as if just written: the whole page is checked, not only a run's changes. */
      const written = new Set(fieldsFor(s.type, schemas).map((f) => f.id))
      for (const f of contrastFindings(s, state.settings, written, state, all, schemas)) problems.push(`[${s.id}] ${s.type}: ${f.message}`)
    }
    out.push({ check: "contrast", target, ok: problems.length === 0, problems, warnings: [] })
  }

  if (wanted.includes("limits")) {
    const problems: string[] = []
    if (state.sections.length > LIMITS.sectionsPerTemplate) problems.push(`The page has ${state.sections.length} sections; it holds ${LIMITS.sectionsPerTemplate}.`)
    for (const s of state.sections) {
      if ((s.blocks?.length ?? 0) > LIMITS.blocksPerSection) problems.push(`[${s.id}] has ${s.blocks?.length} blocks; a section holds ${LIMITS.blocksPerSection}.`)
    }
    out.push({ check: "limits", target, ok: problems.length === 0, problems, warnings: [] })
  }

  return out
}

/** The results as an agent reads them: a verdict first, then what to fix. */
export function describeResults(results: CheckResult[]): string {
  const failed = results.filter((r) => !r.ok)
  const head = failed.length
    ? `FAILED: ${failed.length} of ${results.length} checks. Fix these, then run storelib_run_tests again.`
    : `PASSED: all ${results.length} checks.`
  const lines = results.map((r) => {
    const mark = r.ok ? "pass" : "FAIL"
    const detail = [...r.problems.map((p) => `    - ${p}`), ...r.warnings.slice(0, 8).map((w) => `    note: ${w}`)]
    return [`  ${mark}  ${r.check}  ${r.target}`, ...detail].join("\n")
  })
  return [head, ...lines].join("\n")
}
