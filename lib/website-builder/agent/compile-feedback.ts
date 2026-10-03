/**
 * ===========================================================================
 *  A SECTION FILE IS CHECKED BEFORE ANYTHING KEEPS IT, AND THE MODEL IS TOLD
 *  WHAT WAS WRONG IN WORDS IT CAN FIX
 * ===========================================================================
 * The page assistant writes a section's code with edit_section_code and
 * write_section_code. Each write goes through `checkSectionSource` here:
 *
 *   1. it compiles                 the same compiler the code editor saves
 *                                  through
 *   2. it is held to what an       lib/storelib-ai/validate (strict), so it
 *      agent's section is held to  plugs into the theme like a built in one
 *   3. it draws                    every instance of it on this page is
 *                                  rendered with that instance's own
 *                                  settings, so a template that compiles and
 *                                  then throws on a real value is caught
 *                                  here rather than on the canvas
 *
 * A write that fails any of them is not kept, and the model gets the
 * compiler's findings as numbered lines, each with the line of the file it is
 * about, so "line 41: unknown filter" arrives next to the text on line 41.
 * It then tries again, up to MAX_CODE_ATTEMPTS per file per run; past that
 * the file is left exactly as it was and the model is told to stop.
 *
 * Pure: no database, no provider. tests/ask-section-edit.test.ts drives it.
 */
import { checkSectionQuality, describeQuality, qualityErrors, type QualityFinding } from "@/lib/storelib-ai/quality"
import { checkSectionIntegration } from "@/lib/storelib-ai/integration"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import type { ThemeError } from "@/lib/storelib-theme/types"
import { renderStorelibSection } from "../storelib-runtime"
import type { SectionInstance, ThemeSettingsValues } from "../types"

/**
 * How many refused writes a file gets in one run before the run stops trying.
 * Three: the first refusal usually lands the fix, the second catches a fix
 * that broke something else, and a third failure is a model going in circles
 * while somebody waits.
 */
export const MAX_CODE_ATTEMPTS = 3

/** How many findings are quoted back. More than this and the model fixes none of them well. */
const MAX_FINDINGS = 8

/**
 * The compiler's findings as plain numbered lines, each followed by the line
 * of the file it points at. No stage names, no JSON: the same words a person
 * would read in the code editor's error list.
 */
export function plainCompileErrors(errors: readonly Pick<ThemeError, "line" | "message">[], source?: string): string {
  const lines = source ? source.split("\n") : []
  const shown = errors.slice(0, MAX_FINDINGS).map((error, i) => {
    const where = typeof error.line === "number" && error.line > 0 ? `Line ${error.line}: ` : ""
    const message = String(error.message ?? "").replace(/\s+/g, " ").trim() || "This part could not be read."
    const text = typeof error.line === "number" ? lines[error.line - 1] : undefined
    const quoted = text !== undefined && text.trim() ? `\n   ${text.trim().slice(0, 160)}` : ""
    return `${i + 1}. ${where}${message}${quoted}`
  })
  const more = errors.length > MAX_FINDINGS ? `\n…and ${errors.length - MAX_FINDINGS} more of the same kind.` : ""
  return `${shown.join("\n")}${more}`
}

export type SourceCheck =
  | { ok: true }
  | {
      ok: false
      /** Which gate refused it. */
      reason: "compile" | "quality" | "render"
      /** For the model: what to fix, in plain words. */
      feedback: string
      /** The compiler's own findings, when it was the compiler. */
      errors?: ThemeError[]
    }

/**
 * Compile, check and draw one section file before it is kept.
 *
 * `instances` are the sections on the page that use this type: each is drawn
 * with its own settings, because a file can compile and still throw on a
 * value a creator actually set. `sources` is every other file in the theme,
 * so a section that holds theme blocks finds them.
 */
export function checkSectionSource(input: {
  path: string
  type: string
  source: string
  instances?: readonly SectionInstance[]
  theme?: Record<string, unknown>
  sources?: Record<string, string>
  /**
   * What the file said before this edit. A problem it ALREADY had is not
   * this edit's fault, and refusing a colour change over it would refuse
   * every change to that file forever.
   */
  before?: string | null
  /** Agents are held to the integration rules as well (lib/storelib-ai/integration). */
  strict?: boolean
  /** Quality findings are not held: the run was already sent back over them, or this is Storelib's own file. */
  lenient?: boolean
}): SourceCheck {
  const compiled = compileSection(input.source, { file: input.path, expectType: input.type })
  if (compiled.ok === false) {
    return {
      ok: false,
      reason: "compile",
      errors: compiled.errors,
      feedback: `${input.path} did not compile, so nothing was saved and the file is unchanged:\n${plainCompileErrors(compiled.errors, input.source)}`,
    }
  }

  if (!input.lenient) {
    const findingsOf = (text: string): QualityFinding[] =>
      qualityErrors(input.strict === false ? checkSectionQuality(text) : [...checkSectionQuality(text), ...checkSectionIntegration(text)])
    const had = new Set(input.before ? findingsOf(input.before).map((f) => f.id) : [])
    const introduced = findingsOf(input.source).filter((f) => !had.has(f.id))
    if (introduced.length) {
      return {
        ok: false,
        reason: "quality",
        feedback: `${input.path} compiles, but it was not saved because it would be wrong on a real page:\n${describeQuality(introduced)}\n\nFix those and send it again, keeping everything else exactly as it is.`,
      }
    }
  }

  const overrides = { ...(input.sources ?? {}), [input.path]: input.source }
  for (const instance of input.instances ?? []) {
    if (instance.type !== input.type) continue
    try {
      const drawn = renderStorelibSection(instance, (input.theme ?? {}) as unknown as ThemeSettingsValues, { template: "index", in_editor: true }, overrides)
      if (drawn.ok === false) {
        return {
          ok: false,
          reason: "compile",
          errors: drawn.errors,
          feedback: `${input.path} did not compile, so nothing was saved and the file is unchanged:\n${plainCompileErrors(drawn.errors, input.source)}`,
        }
      }
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      return {
        ok: false,
        reason: "render",
        feedback: `${input.path} compiles, but drawing the section [${instance.id}] with its current settings failed: ${message.replace(/\s+/g, " ").slice(0, 240)}. Nothing was saved. Make the template handle that value and send it again.`,
      }
    }
  }
  return { ok: true }
}

/** What the model reads once a file has used up its attempts in this run. */
export function outOfAttempts(path: string): string {
  return `${path} has been refused ${MAX_CODE_ATTEMPTS} times in this edit, so it is left exactly as it was. Stop writing its code now. Do what the section's settings allow, and say in one plain sentence what the code change would still need.`
}
