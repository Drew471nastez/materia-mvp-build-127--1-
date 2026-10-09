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

import { DEFAULT_LANGUAGE_VERSION } from "../language"
import { validateBlockSchema, validateSectionSchema } from "../schema/validate"
import { ANIMATION_SETTING_ID } from "../schema/normalise"
import { LIMITS, type CompiledBlock, type CompiledSection, type Result, type ThemeError } from "../types"
import { blockScope, scopeCss } from "./css"
import { parseSchemaJson, parseStorelib } from "./parse"
import { checkScript } from "./script"
import { compileTemplate, contentForRefs, pathRefs, pathsRead, type CompiledTemplate } from "./template"

export function sourceHash(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex")
}

export interface CompileOptions {
  /** The path, for error messages: sections/hero.storelib */
  file?: string
  /** When set, the schema's `type` must match the file's name. */
  expectType?: string
  /**
   * Compile a file that was already saved. Tags a save refuses because they
   * act on the whole document (template.ts, DOCUMENT_MARKUP) are let through
   * here and stripped when the section is drawn, so a section saved before
   * that rule keeps rendering. Only the runtime passes this.
   */
  lenient?: boolean
}

/**
 * ===========================================================================
 *  A TEMPLATE IS CHECKED AGAINST ITS OWN SCHEMA
 * ===========================================================================
 * `{{ settings.headng }}` is a perfectly legal expression that can only ever
 * be empty, and a section built out of those renders as a shell: the markup
 * is there, the CSS is there, every word is missing. That was the single
 * worst thing about writing a section here, because nothing said so — not
 * the editor, not the preview, not the save.
 *
 * So the compiler reads every path the template reads and holds it against
 * the schema beside it. A name the schema does not declare is an error with
 * the line that reads it, the same as a syntax error, and the file does not
 * save until it is a name that exists.
 *
 * What is NOT an error: a declared setting that happens to be empty right
 * now. That is a section with nothing typed into it yet, which is the normal
 * state of a section somebody just added.
 */
const CONTEXT_ROOTS = new Set(["settings", "blocks", "products", "theme", "scheme", "page", "section", "forloop", "shop", "routes", "customer", "wishlist", "creator", "product", "collections", "collection", "request"])
const SECTION_KEYS = new Set(["id", "type", "settings", "blocks"])

function checkReferences(
  tpl: CompiledTemplate,
  schema: { settings: { id: string }[]; blocks?: { type: string; settings: { id: string }[] }[]; accepts?: string[] },
  file: string,
  line: number,
): ThemeError[] {
  const errors: ThemeError[] = []
  const at = (l: number) => line + l - 1
  const declared = new Set(schema.settings.map((s) => s.id))
  const blockIds = new Set((schema.blocks ?? []).flatMap((b) => b.settings.map((s) => s.id)))
  const local = (schema.blocks ?? []).length > 0
  const theme = (schema.accepts ?? []).length > 0
  const hasBlocks = local || theme
  const list = (ids: Set<string>) => (ids.size ? [...ids].sort().join(", ") : "none")
  const seen = new Set<string>()
  const push = (l: number, message: string) => {
    const key = `${l}:${message}`
    if (seen.has(key)) return
    seen.add(key)
    errors.push({ stage: "template", file, line: at(l), message })
  }

  for (const ref of pathRefs(tpl)) {
    const [root, second, third] = ref.segs
    const iterates = ref.bound.get(root)

    if (iterates !== undefined) {
      // A loop variable. Only one over the section's blocks can be checked.
      /* A theme block's settings are in its own file, which may not exist yet. */
      if ((iterates === "blocks" || iterates === "section.blocks") && second === "settings" && third && !theme) {
        if (!hasBlocks) push(ref.line, `This section declares no blocks, so "${root}.settings.${third}" is always empty. Add a "blocks" list to the schema.`)
        else if (!blockIds.has(third)) push(ref.line, `No block setting is called "${third}". This section's blocks have: ${list(blockIds)}.`)
      }
      continue
    }

    if (!CONTEXT_ROOTS.has(root)) {
      push(ref.line, `"${root}" is not something a section can read. A section reads settings, blocks, products, theme, scheme, page, request, section, shop, routes, customer, wishlist, creator, product, collections and collection.`)
      continue
    }
    if (root === "section" && second && !SECTION_KEYS.has(second)) {
      push(ref.line, `A section has id, type, settings and blocks. "section.${second}" is always empty.`)
      continue
    }
    const settingId = root === "settings" ? second : root === "section" && second === "settings" ? third : undefined
    if (settingId !== undefined && !declared.has(settingId)) {
      push(ref.line, `No setting is called "${settingId}". This section declares: ${list(declared)}.`)
      continue
    }
    const readsBlocks = root === "blocks" || (root === "section" && second === "blocks")
    if (readsBlocks && !hasBlocks) {
      push(ref.line, `This section reads its blocks but declares none, so the list is always empty. Add a "blocks" list to the schema.`)
    }
  }
  errors.push(...checkContentFor(tpl, { local, theme }, file, line, "section"))
  return errors
}

/**
 * `content_for "blocks"` draws THEME blocks. Written in a section whose
 * blocks are its own, it would draw nothing at all, and a section that
 * accepts no blocks has nothing for it to draw; both are said at the line.
 * Two static blocks under one id would be one block drawn twice.
 */
function checkContentFor(
  tpl: CompiledTemplate,
  has: { local: boolean; theme: boolean },
  file: string,
  line: number,
  owner: "section" | "block",
): ThemeError[] {
  const errors: ThemeError[] = []
  const ids = new Map<string, string>()
  for (const ref of contentForRefs(tpl)) {
    const at = line + ref.line - 1
    if (ref.what === "blocks") {
      if (has.local) errors.push({ stage: "template", file, line: at, message: `{% content_for "blocks" %} draws theme blocks, and this section's blocks are its own. Draw them with {% for block in blocks %}.` })
      else if (!has.theme) errors.push({ stage: "template", file, line: at, message: `{% content_for "blocks" %} draws the blocks this ${owner} holds, and it accepts none. Add "blocks": [{ "type": "@theme" }] to the schema.` })
      continue
    }
    const seen = ids.get(ref.id)
    if (seen && seen !== ref.type) errors.push({ stage: "template", file, line: at, message: `The static block "${ref.id}" is placed twice, as ${seen} and as ${ref.type}. Give each its own id.` })
    ids.set(ref.id, ref.type)
  }
  return errors
}

/** The static blocks a template places, once each. */
function staticsOf(tpl: CompiledTemplate): { type: string; id: string }[] {
  const out: { type: string; id: string }[] = []
  for (const ref of contentForRefs(tpl)) {
    if (ref.what === "block" && !out.some((o) => o.id === ref.id)) out.push({ type: ref.type, id: ref.id })
  }
  return out
}

/**
 * WHATEVER ANYBODY WRITES, THE ANSWER IS WORDS. A file is written by people
 * and by models, and the stages above were written for files that are at
 * least shaped like one. Anything a stage did not expect is caught here and
 * said in a sentence, never handed on as a stack trace to a person who only
 * wanted to save a section.
 */
function plainFailure(file: string, e: unknown): Result<never> {
  const why = e instanceof Error && e.message ? e.message.split("\n")[0].slice(0, 200) : "it is not in a shape Storelib can read"
  return { ok: false, errors: [{ stage: "parse", file, message: `Storelib could not read this file: ${why}. Check that it has <template> and <schema> blocks and that the schema is valid JSON.` }] }
}

export function compileSection(source: string, opts: CompileOptions = {}): Result<CompiledSection> {
  if (typeof source !== "string") return plainFailure(opts.file ?? "section.storelib", new Error("the file is empty"))
  try {
    return compileSectionUnguarded(source, opts)
  } catch (e) {
    return plainFailure(opts.file ?? "section.storelib", e)
  }
}

/** `<img>` tags in a template with no alt at all: a screen reader reads the file name instead. */
function imagesWithoutAlt(template: string): number {
  const tags = template.replace(/\{#[\s\S]*?#\}/g, " ").match(/<img\b[^>]*>/gi) ?? []
  return tags.filter((t) => !/\salt\s*=/.test(t)).length
}

function compileSectionUnguarded(source: string, opts: CompileOptions = {}): Result<CompiledSection> {
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
  /* What the schema meant rather than what it said (schema/normalise.ts), and its habits. */
  if (schema.warnings) warnings.push(...schema.warnings)
  if (opts.expectType && schema.value.type !== opts.expectType) {
    errors.push({
      stage: "schema",
      file,
      line: src.schema.line,
      path: "type",
      message: `The schema says type "${schema.value.type}" but the file is ${file}; a section's type is its file name`,
    })
  }

  const template = compileTemplate(src.template.text, { file, line: src.template.line, capabilities: schema.value.capabilities, lenient: opts.lenient })
  if (template.ok === false) errors.push(...template.errors)
  else errors.push(...checkReferences(template.value, schema.value, file, src.template.line))

  let css = ""
  let cssTemplate: unknown
  if (src.style.text.trim()) {
    /**
     * A SECTION'S CSS IS SCOPED, AND WRITING `scoped` IS NOT HOW YOU ASK.
     * This used to refuse a plain <style> and say the word was required,
     * which taught the format's one hard rule by throwing away a file. The
     * rule is real — a section's rules reach that section and nothing else —
     * but it is the engine's job, not a word the author has to remember. So
     * both spellings compile, and both are scoped, because there is no such
     * thing here as a section rule that is not.
     */
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
    /* The section's animation is read by the page, not the template (schema/normalise.ts). */
    if (s.id === ANIMATION_SETTING_ID) continue
    if (!read.has(s.id) && !s.id.startsWith("hdr_")) {
      warnings.push({ stage: "template", file, line: src.template.line, path: `settings.${s.id}`, message: `The template never reads settings.${s.id}` })
    }
  }
  const noAlt = imagesWithoutAlt(src.template.text)
  if (noAlt) {
    warnings.push({ stage: "template", file, line: src.template.line, message: `${noAlt === 1 ? "An image has" : `${noAlt} images have`} no alt. Give each one alt="{{ settings.image_alt }}" from a setting, or alt="" when it is decoration.` })
  }

  return {
    ok: true,
    value: {
      type: schema.value.type,
      schema: schema.value,
      // What it declared, or 1 because it declared nothing. Never "current".
      language_version: schema.value.language_version ?? DEFAULT_LANGUAGE_VERSION,
      template: (template as { ok: true; value: CompiledTemplate }).value,
      css,
      cssTemplate,
      script,
      statics: staticsOf((template as { ok: true; value: CompiledTemplate }).value),
      sourceHash: sourceHash(source),
    },
    warnings: warnings.length ? warnings : undefined,
  }
}

/**
 * ===========================================================================
 *  A THEME BLOCK: blocks/<type>.storelib
 * ===========================================================================
 * The same stages as a section, with a block's rules:
 *
 *   no <script>     a block lives inside a section, and the section's
 *                   script is the one with a sandbox; it finds its blocks by
 *                   `[data-block-type]`
 *   its own names   `block.settings.x` (or `settings.x`) is checked against
 *                   the block's schema, `section.settings.x` is whatever
 *                   section it sits in and is not
 *   its own scope   rules reach every block of this type, or, when a rule
 *                   reads a setting, this one block in this one section
 */
const BLOCK_ROOTS = new Set([...CONTEXT_ROOTS, "block"])
const BLOCK_KEYS = new Set(["id", "type", "settings", "blocks", "storelib_attributes"])

export function compileBlock(source: string, opts: CompileOptions & { type: string }): Result<CompiledBlock> {
  if (typeof source !== "string") return plainFailure(opts.file ?? `blocks/${opts.type}.storelib`, new Error("the file is empty"))
  try {
    return compileBlockUnguarded(source, opts)
  } catch (e) {
    return plainFailure(opts.file ?? `blocks/${opts.type}.storelib`, e)
  }
}

function compileBlockUnguarded(source: string, opts: CompileOptions & { type: string }): Result<CompiledBlock> {
  const file = opts.file ?? `blocks/${opts.type}.storelib`
  const errors: ThemeError[] = []

  if (Buffer.byteLength(source, "utf8") > LIMITS.sourceBytes) {
    return { ok: false, errors: [{ stage: "parse", file, message: `The file is over ${LIMITS.sourceBytes / 1024} KB` }] }
  }
  const parsed = parseStorelib(source, file)
  if (parsed.ok === false) return { ok: false, errors: parsed.errors.map((e) => ({ ...e, message: e.message.replace(/^A section needs/, "A block needs") })) }
  const src = parsed.value
  if (src.script && src.script.text.trim()) {
    errors.push({
      stage: "script",
      file,
      line: src.script.line,
      message: `A block has no <script>. What it does belongs to the section it sits in, whose script can find it with root.querySelectorAll('[data-block-type="${opts.type}"]').`,
    })
  }

  const json = parseSchemaJson(src.schema, file)
  if (json.ok === false) return json
  const schema = validateBlockSchema(json.value, { file, line: src.schema.line, text: src.schema.text, type: opts.type })
  if (schema.ok === false) return schema
  const s = schema.value

  const capabilities = Array.isArray(s.capabilities) ? (s.capabilities as string[]).filter((c) => c === "embed") : []
  const template = compileTemplate(src.template.text, { file, line: src.template.line, capabilities, lenient: opts.lenient })
  if (template.ok === false) errors.push(...template.errors)
  else {
    const tpl = template.value
    const own = new Set(s.settings.map((f) => f.id))
    const list = (ids: Set<string>) => (ids.size ? [...ids].sort().join(", ") : "none")
    const seen = new Set<string>()
    const push = (l: number, message: string) => {
      const key = `${l}:${message}`
      if (seen.has(key)) return
      seen.add(key)
      errors.push({ stage: "template", file, line: src.template.line + l - 1, message })
    }
    for (const ref of pathRefs(tpl)) {
      const [root, second, third] = ref.segs
      if (ref.bound.has(root)) continue
      if (!BLOCK_ROOTS.has(root)) {
        push(ref.line, `"${root}" is not something a block can read. A block reads block, settings, section, theme, scheme, page, shop, routes, customer, wishlist, creator and product.`)
        continue
      }
      if (root === "block" && second && !BLOCK_KEYS.has(second)) {
        push(ref.line, `A block has id, type, settings, blocks and storelib_attributes. "block.${second}" is always empty.`)
        continue
      }
      if (root === "section" && second && !SECTION_KEYS.has(second)) {
        push(ref.line, `A section has id, type, settings and blocks. "section.${second}" is always empty.`)
        continue
      }
      const id = root === "settings" ? second : root === "block" && second === "settings" ? third : undefined
      if (id !== undefined && !own.has(id)) push(ref.line, `No setting is called "${id}". This block declares: ${list(own)}.`)
    }
    errors.push(...checkContentFor(tpl, { local: false, theme: (s.accepts ?? []).length > 0 }, file, src.template.line, "block"))
    if (s.tag === null && !pathsRead(tpl).includes("block.storelib_attributes")) {
      errors.push({
        stage: "template",
        file,
        line: src.template.line,
        message: `With "tag": null nothing is wrapped round this block, so its outer element carries {{ block.storelib_attributes }}. Without them the editor cannot find the block to select it.`,
      })
    }
  }

  let css = ""
  let cssTemplate: unknown
  if (src.style.text.trim()) {
    const perInstance = src.style.text.includes("{{")
    const scoped = scopeCss(src.style.text, { file, line: src.style.line, type: `b-${opts.type}`, scope: blockScope(opts.type, perInstance) })
    if (scoped.ok === true) {
      css = scoped.value
      if (perInstance) {
        const t = compileTemplate(css, { file, line: src.style.line })
        if (t.ok === true) cssTemplate = t.value
        else errors.push(...t.errors.map((e) => ({ ...e, stage: "css" as const })))
      }
    } else errors.push(...scoped.errors)
  }

  if (errors.length) return { ok: false, errors }
  const tpl = (template as { ok: true; value: CompiledTemplate }).value
  return {
    ok: true,
    value: {
      type: opts.type,
      schema: s,
      language_version: s.language_version ?? DEFAULT_LANGUAGE_VERSION,
      template: tpl,
      css,
      cssTemplate,
      statics: staticsOf(tpl),
      sourceHash: sourceHash(source),
    },
    ...(schema.warnings?.length ? { warnings: schema.warnings } : {}),
  }
}

/**
 * BOUNDED, BECAUSE THE KEY IS THE SOURCE TEXT.
 *
 * Caching on content is what makes an unchanged file free and a changed one
 * compile exactly once. It also means every version of every file anybody
 * has ever saved is a new key: on a server that lives for days, a Map here
 * only grows, and the thing growing is a compiled template tree per entry.
 * Someone saving a file in a loop would be filling the process's heap with
 * no way to get it back.
 *
 * So it is a least-recently-used cache with a ceiling. A Map iterates in
 * insertion order, so the oldest key is the first one, and re-reading a key
 * moves it to the end. The ceiling is generous enough that the working set
 * of a busy account never reaches it.
 */
export const COMPILE_CACHE_LIMIT = 200

export function createLru<T>(limit: number) {
  const map = new Map<string, T>()
  return {
    get(key: string): T | undefined {
      const hit = map.get(key)
      if (hit === undefined) return undefined
      map.delete(key)
      map.set(key, hit)
      return hit
    },
    set(key: string, value: T) {
      if (map.has(key)) map.delete(key)
      map.set(key, value)
      while (map.size > limit) {
        const oldest = map.keys().next()
        if (oldest.done) break
        map.delete(oldest.value)
      }
    },
    clear() { map.clear() },
    get size() { return map.size },
  }
}

/** A compile cache keyed by source hash, so an unchanged file is never compiled twice. */
export function createCompileCache(limit = COMPILE_CACHE_LIMIT) {
  const cache = createLru<Result<CompiledSection>>(limit)
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

/**
 * ===========================================================================
 *  ONE FILE, BY WHERE IT LIVES
 * ===========================================================================
 * Every door that saves a `.storelib` file (the code editor, the assistant,
 * a connected agent, an import) compiles it here, so a file in blocks/ is
 * held to a block's rules and every other one to a section's. A block's type
 * is its file name, the same as a section's: `blocks/_slide.storelib` is the
 * private block "_slide".
 */
export function compileThemeFile(source: string, opts: CompileOptions & { file: string }): Result<CompiledSection | CompiledBlock> {
  if (opts.file.startsWith("blocks/")) {
    const type = opts.file.match(/^blocks\/(_?[a-z][a-z0-9_-]*)\.storelib$/)?.[1]
    if (!type) {
      return {
        ok: false,
        errors: [{ stage: "package", file: opts.file, message: `A block lives at blocks/<name>.storelib, the name in lowercase letters, digits, - and _, optionally after one _ for a private block` }],
      }
    }
    return compileBlock(source, { ...opts, type })
  }
  return compileSection(source, opts)
}
