/**
 * ===========================================================================
 *  ONE GATE, IN FRONT OF EVERY WAY A SECTION FILE CAN BE WRITTEN
 * ===========================================================================
 * There are three: the assistant writing a new section, the assistant editing
 * an existing one through write_section_code, and the code editor's repair
 * button. All three used to decide separately what "good enough to save"
 * meant, and all three stopped after one repair attempt, which is the attempt
 * where a model most often repeats its own mistake.
 *
 * So: compile first, because a file that does not compile has no meaningful
 * quality to assess; then the checks in quality.ts; then a verdict and, when
 * it failed, the exact words to send back.
 *
 * THREE ATTEMPTS, NOT ONE. The second is where the compiler's message usually
 * lands, and the third is what catches a model that fixed the error it was
 * shown and introduced another. Past that it is looping, and somebody is
 * waiting.
 */

import { compileSection, compileThemeFile } from "@/lib/storelib-theme/storelib/compile"
import type { ThemeError } from "@/lib/storelib-theme/types"
import { checkSectionQuality, describeQuality, qualityErrors, type QualityFinding } from "./quality"
import { checkSectionIntegration, sectionAdvice } from "./integration"

/** How many times a model may be asked to fix its own output before we stop. */
export const MAX_REPAIR_ATTEMPTS = 3

export type Validation =
  | { ok: true; type: string; name: string; findings: QualityFinding[] }
  | { ok: false; reason: "compile"; errors: ThemeError[]; feedback: string }
  | { ok: false; reason: "quality"; findings: QualityFinding[]; feedback: string }

const say = (errors: ThemeError[]) =>
  errors.map((e) => `${e.line ? `line ${e.line}: ` : ""}${e.message}`).join("\n")

/**
 * Compile, then check, then decide.
 *
 * `expectType` is passed through to the compiler, which insists a section's
 * declared type matches its file name. Quality WARNINGS never fail: they ride
 * along on a passing result so a caller can log them, and a file is not held
 * back from somebody because a heuristic over text had an opinion.
 */
/**
 * `strict` is for a file an AGENT wrote: Storelib AI, Claude Code or Codex
 * over MCP, the agent API, a push from a linked repository. It adds the
 * integration rules (./integration.ts), which say a section takes its
 * colours, type, buttons, spacing, words and links from the theme and the
 * creator, the way the built-in ones do. A person saving in the code editor
 * is not held to them.
 */
export function validateSection(source: string, opts: { path?: string; expectType?: string; strict?: boolean } = {}): Validation {
  /* A theme block is held to a block's compile rules, which are its whole contract: it has no scheme or spacing of its own, it reads its section's. */
  if (opts.path?.startsWith("blocks/")) {
    const block = compileThemeFile(source, { file: opts.path })
    if (block.ok === false) {
      return {
        ok: false,
        reason: "compile",
        errors: block.errors,
        feedback: `That did not compile:\n${say(block.errors)}\n\nFix exactly that and send the whole file again. Change nothing else.`,
      }
    }
    return { ok: true, type: block.value.type, name: block.value.schema.name.trim(), findings: [] }
  }
  const compiled = compileSection(source, { file: opts.path, expectType: opts.expectType })
  if (compiled.ok === false) {
    return {
      ok: false,
      reason: "compile",
      errors: compiled.errors,
      feedback: `That did not compile:\n${say(compiled.errors)}\n\nFix exactly that and send the whole file again. Change nothing else.`,
    }
  }

  const findings = opts.strict ? [...checkSectionQuality(source), ...checkSectionIntegration(source)] : checkSectionQuality(source)
  const errors = qualityErrors(findings)
  if (errors.length) {
    return {
      ok: false,
      reason: "quality",
      findings,
      feedback: `It compiles, but it would not be correct on a real page:\n${describeQuality(errors)}\n\nFix those and send the whole file again. Keep everything else exactly as it is.`,
    }
  }

  /* Advice rides on a save that went through: the compiler's notes and what a native section should still have. */
  const notes: QualityFinding[] = (compiled.warnings ?? []).filter((w) => w.stage === "schema").map((w) => ({ id: "compile-note", severity: "warning", message: w.message }))
  const advice = opts.strict ? [...notes, ...sectionAdvice(source)] : []
  return { ok: true, type: compiled.value.type, name: compiled.value.schema.name.trim(), findings: [...findings, ...advice] }
}
