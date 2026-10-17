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
import { checkRenderedSection } from "@/lib/storelib-ai/structural"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { isCompatSource, splitCompatFile } from "@/lib/storelib-theme/compat/theme"
import { parseCompat } from "@/lib/storelib-theme/compat/parser"
import { CompatSyntaxError } from "@/lib/storelib-theme/compat/lexer"
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

/** The findings that are facts about the file, held even on a lenient pass: invented schema keys, a layout no phone fits. */
const HARD = /^(schema-key|schema-capability|schema-animation|structure-)/

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
  /**
   * `notes`: what the drawn HTML still shows worth fixing (lib/storelib-ai/structural.ts, checkRenderedSection):
   * a picture with no size, a text colour hard to read on its scheme. Never a refusal; handed back with the save.
   */
  | { ok: true; notes?: QualityFinding[] }
  | {
      ok: false
      /** Which gate refused it. "structure": a fact a lenient pass still holds (HARD). */
      reason: "compile" | "quality" | "render" | "structure"
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
  /* An imported theme's file is the theme's own template language, not Storelib's: read by the theme engine's parser instead. */
  if (isCompatSource(input.source)) return checkCompatSource(input.path, input.source)
  const compiled = compileSection(input.source, { file: input.path, expectType: input.type })
  if (compiled.ok === false) {
    return {
      ok: false,
      reason: "compile",
      errors: compiled.errors,
      feedback: `${input.path} did not compile, so nothing was saved and the file is unchanged:\n${plainCompileErrors(compiled.errors, input.source)}`,
    }
  }

  /*
    LENIENT LETS A HEURISTIC GO, NEVER A FACT. After two send-backs a quality
    finding is let through, because some of them read text and can be wrong.
    A key Storelib does not read and a box no phone can fit are not opinions
    (lib/storelib-ai/schema-keys.ts, structural.ts): those still refuse, as
    "structure", which counts toward the file's MAX_CODE_ATTEMPTS.
  */
  if (!input.lenient || input.strict === true) {
    const findingsOf = (text: string): QualityFinding[] =>
      qualityErrors(input.strict === false ? checkSectionQuality(text) : [...checkSectionQuality(text), ...checkSectionIntegration(text)]).filter((f) => !input.lenient || HARD.test(f.id))
    const had = new Set(input.before ? findingsOf(input.before).map((f) => f.id) : [])
    const introduced = findingsOf(input.source).filter((f) => !had.has(f.id))
    if (introduced.length) {
      return {
        ok: false,
        reason: input.lenient ? "structure" : "quality",
        feedback: `${input.path} compiles, but it was not saved because it would be wrong on a real page:\n${describeQuality(introduced)}\n\nFix those and send it again, keeping everything else exactly as it is.`,
      }
    }
  }

  const overrides = { ...(input.sources ?? {}), [input.path]: input.source }
  let notes: QualityFinding[] = []
  let read = false
  for (const instance of input.instances ?? []) {
    if (instance.type !== input.type) continue
    try {
      const drawn = renderStorelibSection(instance, (input.theme ?? {}) as unknown as ThemeSettingsValues, { template: "index", in_editor: true }, overrides)
      /* The first instance drawn is read for what a phone and a slow connection show: notes, never a refusal. */
      if (drawn.ok === true && !read) {
        read = true
        notes = checkRenderedSection({ html: drawn.html, css: drawn.css, schemaSettings: compiled.value.schema.settings, theme: input.theme ?? null })
        /* Only what this edit brought: a note the file had already earned is not news. */
        if (input.before && notes.length) {
          const had = new Set(renderedNoteIds(input.before, input.path, instance, input.theme, overrides))
          notes = notes.filter((n) => !had.has(n.id))
        }
      }
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
  return notes.length ? { ok: true, notes } : { ok: true }
}

/** The notes the file's earlier version already drew, so an edit is told only what it added. */
function renderedNoteIds(before: string, path: string, instance: SectionInstance, theme: Record<string, unknown> | undefined, overrides: Record<string, string>): string[] {
  try {
    const compiled = compileSection(before, { file: path })
    const drawn = renderStorelibSection(instance, (theme ?? {}) as unknown as ThemeSettingsValues, { template: "index", in_editor: true }, { ...overrides, [path]: before })
    if (compiled.ok === false || drawn.ok === false) return []
    return checkRenderedSection({ html: drawn.html, css: drawn.css, schemaSettings: compiled.value.schema.settings, theme: theme ?? null }).map((n) => n.id)
  } catch {
    return []
  }
}

/**
 * AN IMPORTED THEME'S SECTION OR BLOCK (`<template compat="shopify">`): its
 * markup read by the parser that draws it (lib/storelib-theme/compat), and
 * its `<schema>` one JSON object. Storelib's compiler and quality rules are
 * for Storelib's own format and refused every such file on its first tag,
 * so Storelib AI could not change an imported theme's code at all. The
 * builder's panel is made from the theme's schema when the file is kept
 * (lib/storelib-theme/compat/schema-sync.ts), which checks it again.
 */
function checkCompatSource(path: string, source: string): SourceCheck {
  const errors: ThemeError[] = []
  const { markup, schema } = splitCompatFile(source)
  try {
    parseCompat(markup)
  } catch (e) {
    /* The markup starts on the file's second line, after <template compat="shopify">. */
    errors.push({ stage: "template", file: path, line: e instanceof CompatSyntaxError ? e.line + 1 : undefined, message: (e as Error).message })
  }
  if (!errors.length && /^(sections|blocks)\//.test(path)) {
    if (!/<schema>[\s\S]*<\/schema>/.test(source)) errors.push({ stage: "schema", file: path, message: "The <schema> block is missing. Keep it after </template>." })
    else if (!schema || Array.isArray(schema)) errors.push({ stage: "schema", file: path, message: "The <schema> block is not one JSON object." })
  }
  if (!errors.length) return { ok: true }
  return {
    ok: false,
    reason: "compile",
    errors,
    feedback: `${path} did not read, so nothing was saved and the file is unchanged:\n${plainCompileErrors(errors, source)}`,
  }
}

/** What the model reads once a file has used up its attempts in this run. */
export function outOfAttempts(path: string): string {
  return `${path} has been refused ${MAX_CODE_ATTEMPTS} times in this edit, so it is left exactly as it was. Stop writing its code now. Do what the section's settings allow, and say in one plain sentence what the code change would still need.`
}
