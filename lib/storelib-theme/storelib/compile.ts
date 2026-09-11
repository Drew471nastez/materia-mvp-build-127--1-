/**
 * ===========================================================================
 *  FROM A .storelib FILE TO SOMETHING THAT CAN RENDER
 * ===========================================================================
 * The stages, in order, each one refusing with line numbers:
 *
 *   parse      the four blocks
 *   schema     JSON, then the registry's rules
 *   template   markup → tree; no scripts, no handlers
 *   css        scoped to the instance; keyframes renamed
 *   script     forbidden names refused; wrapped for the sandbox
 *
 * The result is a CompiledSection: everything needed to render ANY instance
 * of this section, and nothing about any particular one. It is cached by
 * the hash of its source, which is what keeps "change a heading" instant —
 * instance data changes never come through here — and "change the source"
 * a compile.
 *
 * DETERMINISTIC. The same file compiles to the same thing on every machine,
 * with no reference to the clock, the environment or the account. That is
 * what makes a theme exportable: what compiled here compiles there.
 */
import { createHash } from "node:crypto"

import { validateSectionSchema } from "../schema/validate"
import { LIMITS, type CompiledSection, type Result, type ThemeError } from "../types"
import { scopeCss } from "./css"
import { parseSchemaJson, parseStorelib } from "./parse"
import { checkScript } from "./script"
import { compileTemplate, pathsRead, type CompiledTemplate } from "./template"

export function sourceHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex")
}

export interface CompileOptions {
  /** The path, for error messages: sections/hero.storelib */
  file?: string
  /** When set, the schema's `type` must match the file's name. */
  expectType?: string
}

export function compileSection(source: string, opts: CompileOptions = {}): Result<CompiledSection> {
  const file = opts.file ?? "section.storelib"
  const errors: ThemeError[] = []
  const warnings: ThemeError[] = []

  if (Buffer.byteLength(source, "utf8") > LIMITS.sourceBytes) {
    return { ok: false, errors: [{ stage: "parse", file, message: `The file is over ${LIMITS.sourceBytes / 1024} KB` }] }
  }

  const parsed = parseStorelib(source, file)
  if (parsed.ok === false) return parsed
  const src = parsed.value

  const json = parseSchemaJson(src.schema, file)
  if (json.ok === false) return json
  const schema = validateSectionSchema(json.value, { file, line: src.schema.line, text: src.schema.text })
  if (schema.ok === false) return schema
  if (opts.expectType && schema.value.type !== opts.expectType) {
    errors.push({
      stage: "schema",
      file,
      line: src.schema.line,
      path: "type",
      message: `The schema says type "${schema.value.type}" but the file is ${file}; a section's type is its file name`,
    })
  }

  const template = compileTemplate(src.template.text, { file, line: src.template.line })
  if (template.ok === false) errors.push(...template.errors)

  let css = ""
  let cssTemplate: unknown
  if (src.style.text.trim()) {
    if (!src.style.scoped) {
      errors.push({
        stage: "css",
        file,
        line: src.style.line > 0 ? src.style.line - 1 : undefined,
        message: `A section's <style> must be <style scoped>. Page-wide rules belong in layout/theme.storelib.`,
      })
    } else {
      const scoped = scopeCss(src.style.text, { file, line: src.style.line, type: schema.value.type })
      if (scoped.ok === true) {
        css = scoped.value
        if (css.includes("{{")) {
          const t = compileTemplate(css, { file, line: src.style.line })
          if (t.ok === true) cssTemplate = t.value
          else errors.push(...t.errors.map((e) => ({ ...e, stage: "css" as const })))
        }
      } else errors.push(...scoped.errors)
    }
  }

  let script: string | null = null
  if (src.script && src.script.text.trim()) {
    const checked = checkScript(src.script.text, { file, line: src.script.line, capabilities: schema.value.capabilities })
    if (checked.ok === true) script = checked.value.bundle
    else errors.push(...checked.errors)
  }

  if (errors.length) return { ok: false, errors }

  // A setting nobody reads is usually a typo in the template, not a choice.
  const read = new Set(pathsRead((template as { ok: true; value: CompiledTemplate }).value).map((p) => p.replace(/^settings\./, "").split(".")[0]))
  for (const s of schema.value.settings) {
    const control = s.type
    if (control === "header" || control === "paragraph" || control === "divider") continue
    if (!read.has(s.id) && !s.id.startsWith("hdr_")) {
      warnings.push({ stage: "template", file, line: src.template.line, path: `settings.${s.id}`, message: `The template never reads settings.${s.id}` })
    }
  }

  return {
    ok: true,
    value: {
      type: schema.value.type,
      schema: schema.value,
      template: (template as { ok: true; value: CompiledTemplate }).value,
      css,
      cssTemplate,
      script,
      sourceHash: sourceHash(source),
    },
    warnings: warnings.length ? warnings : undefined,
  }
}

/** A compile cache keyed by source hash, so an unchanged file is never compiled twice. */
export function createCompileCache() {
  const cache = new Map<string, Result<CompiledSection>>()
  return {
    compile(source: string, opts: CompileOptions = {}): Result<CompiledSection> {
      const key = `${opts.file ?? ""}\0${sourceHash(source)}`
      const hit = cache.get(key)
      if (hit) return hit
      const r = compileSection(source, opts)
      cache.set(key, r)
      return r
    },
    clear() { cache.clear() },
    get size() { return cache.size },
  }
}
