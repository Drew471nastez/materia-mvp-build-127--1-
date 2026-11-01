/**
 * ===========================================================================
 *  A PUSHED FILE, IN THE FORMAT THIS THEME KEEPS
 * ===========================================================================
 * An imported theme keeps its sections in the compatible profile: the
 * theme's own markup between `<template compat="shopify">` and
 * `</template>`, then a `<schema>` whose `"shopify"` object is the theme's
 * own schema. A Storelib theme keeps `<template>`, `<style>`, `<schema>`.
 *
 * Coding agents get this wrong in a few predictable ways, and every one of
 * them was a refused file and a second push:
 *
 *   • a Storelib section pushed to an imported theme. The engine draws those
 *     in an imported theme too (lib/storelib-theme/compat/theme.ts,
 *     renderNative), and a section added from Storelib's library is kept
 *     that way, so it is TAKEN as it is. Refusing it was the bug: an agent
 *     that kept a file's own format was told it had the wrong one.
 *   • the theme's original file pushed as it was before the import: the
 *     markup with a `{% schema %}` tag and no first line. Converted: the
 *     first line and `</template>` around the markup, the schema JSON moved
 *     into `<schema>` under `"shopify"`. Nothing in it is changed, so the
 *     conversion loses nothing; the save makes the builder's panel from it.
 *   • the first line kept, but the schema left as a `{% schema %}` tag
 *     inside the markup. Moved out the same way.
 *   • a snippet or layout file without the first line: wrapped.
 *
 * What cannot be converted without guessing is refused with words that say
 * exactly what the file needs, never a platform's name.
 *
 * Pure: tests/github-format-z4.test.ts runs it.
 */
import { COMPAT_ATTR, compatTemplateEnd, isCompatSource, isNativeSectionSource, wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"

export type FormatResult =
  | { ok: true; text: string; converted: boolean; note: string | null }
  | { ok: false; error: string }

const SCHEMA_TAG = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/
/** Template tags of the imported theme's language: a file with these and no first line is that theme's own file. */
const THEME_TAGS = /\{%-?\s*(?:schema|render|section|sections|liquid|assign|capture|form|paginate|style|javascript|stylesheet|include|comment|if|for|unless|case)\b/

/** The `<schema>` JSON a converted file carries: the theme's own schema under "shopify", the panel made from it on save. */
function schemaBlock(raw: Record<string, unknown>): string {
  return `<schema>\n${JSON.stringify({ shopify: raw }, null, 2)}\n</schema>\n`
}

function parseSchema(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text) as unknown
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The markup of a compatible file, between its first line and `</template>`, and what comes after. */
function splitWrapped(text: string): { markup: string; rest: string } | null {
  const lines = text.split("\n")
  const start = lines.findIndex((l) => COMPAT_ATTR.test(l))
  if (start < 0) return null
  const end = compatTemplateEnd(lines, start)
  if (end < 0) return null
  return { markup: lines.slice(start + 1, end).join("\n"), rest: lines.slice(end + 1).join("\n") }
}

const SECTION_OR_BLOCK = /^(sections|blocks)\//
const SNIPPET_OR_LAYOUT = /^(snippets|layout)\//

/**
 * A `.storelib` file pushed to a theme, fitted to the format that theme keeps,
 * or refused with what it needs. `compat`: the theme is an imported one.
 */
export function fitToThemeFormat(path: string, text: string, opts: { compat: boolean }): FormatResult {
  const wrapped = isCompatSource(text)

  if (!opts.compat) {
    if (wrapped || (SCHEMA_TAG.test(text) && !/^\s*<template(\s[^>]*)?>/m.test(text))) {
      return {
        ok: false,
        error: `${path}: this is written in an imported theme's format, and this website is a Storelib theme. Write it as a Storelib section: <template>, then <style scoped>, then <schema> with its settings, as the other files in ${path.split("/")[0]}/ are.`,
      }
    }
    return { ok: true, text, converted: false, note: null }
  }

  /* ── an imported theme ── */
  if (wrapped) {
    if (!SECTION_OR_BLOCK.test(path)) return { ok: true, text, converted: false, note: null }
    const parts = splitWrapped(text)
    if (!parts) return { ok: true, text, converted: false, note: null }
    const tag = parts.markup.match(SCHEMA_TAG)
    if (!tag || /<schema>[\s\S]*<\/schema>/.test(parts.rest)) return { ok: true, text, converted: false, note: null }
    const raw = parseSchema(tag[1])
    if (!raw) return { ok: false, error: `${path}: the settings block inside the markup is not valid JSON. Fix it, or move it after </template> as <schema> … </schema>, then push again.` }
    const markup = parts.markup.replace(SCHEMA_TAG, "").replace(/\s+$/, "")
    return { ok: true, text: `${wrapCompatTemplate(markup)}\n\n${schemaBlock(raw)}`, converted: true, note: `${path}: converted to this theme's format (its settings moved into <schema>).` }
  }

  /*
    A Storelib section: drawn as it is in an imported theme, the way a section
    from Storelib's library is. One with a mistake in it goes on to the save,
    whose checker names the line, rather than being told its format is wrong.
  */
  if (/^sections\//.test(path) && (isNativeSectionSource(text) || /^\s*<template(\s[^>]*)?>/m.test(text))) {
    return { ok: true, text, converted: false, note: null }
  }

  /* The theme's original file, without the first line. */
  const looksLikeTheme = THEME_TAGS.test(text) || /\{\{[\s\S]*?\}\}/.test(text)
  if (SNIPPET_OR_LAYOUT.test(path) && looksLikeTheme && !/^\s*<template(\s[^>]*)?>/m.test(text)) {
    return { ok: true, text: `${wrapCompatTemplate(text.replace(/\s+$/, ""))}\n`, converted: true, note: `${path}: converted to this theme's format (the first line added).` }
  }
  if (SECTION_OR_BLOCK.test(path) && !/^\s*<template(\s[^>]*)?>/m.test(text)) {
    const tag = text.match(SCHEMA_TAG)
    if (tag) {
      const raw = parseSchema(tag[1])
      if (!raw) return { ok: false, error: `${path}: its settings block ({% schema %}) is not valid JSON, so it cannot be read. Fix the JSON and push again.` }
      const markup = text.replace(SCHEMA_TAG, "").replace(/\s+$/, "")
      return { ok: true, text: `${wrapCompatTemplate(markup)}\n\n${schemaBlock(raw)}`, converted: true, note: `${path}: converted to this theme's format (first line added, settings moved into <schema>).` }
    }
    if (looksLikeTheme) {
      return { ok: true, text: `${wrapCompatTemplate(text.replace(/\s+$/, ""))}\n\n${schemaBlock({ name: path.replace(/^.*\//, "").replace(/\.storelib$/, "") })}`, converted: true, note: `${path}: converted to this theme's format. It had no settings block, so it has nothing to change in the builder yet.` }
    }
  }

  if (/^blocks\//.test(path) && isNativeSectionSource(text)) {
    return {
      ok: false,
      error: `${path}: a block in this theme is written in the theme's own format. Start it with <template compat="shopify">, end the markup with </template>, then add <schema> with its settings under "shopify", as the other files in blocks/ do.`,
    }
  }
  return {
    ok: false,
    error: `${path}: Storelib could not tell which format this is. Start it with <template compat="shopify">, end the markup with </template>, then add <schema> with its settings under "shopify", as the other files in ${path.split("/")[0]}/ do, and push again.`,
  }
}

/* ── the examples AGENTS.md shows, one per folder ───────────────────────── */

const EXAMPLE_CHARS = 2400
const MARKUP_LINES = 14

/** A schema cut to its first few settings, blocks and presets, keys and order kept. */
function shortSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema)) {
    if (Array.isArray(v)) out[k] = v.slice(0, k === "presets" ? 1 : 3)
    else if (v && typeof v === "object" && k === "shopify") out[k] = shortSchema(v as Record<string, unknown>)
    else out[k] = v
  }
  return out
}

/**
 * One file of the theme as AGENTS.md shows it: whole when it is short, or its
 * first lines and a schema cut to a few settings, said to be shortened. For
 * an imported theme only the `"shopify"` part of the schema is shown, since
 * that is the part an agent writes.
 */
export function exampleOf(text: string, compat: boolean): { text: string; abridged: boolean } {
  if (compat && isCompatSource(text)) {
    const parts = splitWrapped(text)
    if (!parts) return { text: text.slice(0, EXAMPLE_CHARS), abridged: text.length > EXAMPLE_CHARS }
    const lines = parts.markup.split("\n")
    const cut = lines.length > MARKUP_LINES
    const markup = cut ? [...lines.slice(0, MARKUP_LINES), "{% comment %} the rest of the markup {% endcomment %}"].join("\n") : parts.markup
    const m = /<schema>\s*([\s\S]*?)\s*<\/schema>/.exec(parts.rest)
    const schema = m ? parseSchema(m[1]) : null
    const theirs = schema ? ((schema.shopify && typeof schema.shopify === "object" ? schema.shopify : schema) as Record<string, unknown>) : null
    const short = theirs ? shortSchema(theirs) : null
    const schemaText = short ? `\n\n<schema>\n${JSON.stringify({ shopify: short }, null, 2)}\n</schema>` : ""
    const abridged = cut || (theirs !== null && JSON.stringify(short) !== JSON.stringify(theirs)) || (schema !== null && Object.keys(schema).some((k) => k !== "shopify"))
    return { text: `<template compat="shopify">\n${markup}\n</template>${schemaText}`, abridged }
  }
  if (text.length <= EXAMPLE_CHARS) return { text, abridged: false }
  /* A Storelib section: each part's first lines, the schema cut short. */
  const piece = (tag: string) => new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(text)
  const out: string[] = []
  for (const tag of ["template", "style"]) {
    const m = piece(tag)
    if (!m) continue
    const lines = m[2].replace(/^\n/, "").split("\n")
    const body = lines.length > MARKUP_LINES ? [...lines.slice(0, MARKUP_LINES), tag === "style" ? "  /* the rest of the CSS */" : "  <!-- the rest of the markup -->"] : lines
    out.push(`<${tag}${m[1] ?? ""}>\n${body.join("\n")}\n</${tag}>`)
  }
  const s = /<schema>\s*([\s\S]*?)\s*<\/schema>/.exec(text)
  const parsed = s ? parseSchema(s[1]) : null
  if (parsed) out.push(`<schema>\n${JSON.stringify(shortSchema(parsed), null, 2)}\n</schema>`)
  return { text: out.join("\n\n"), abridged: true }
}

export type ExampleFolder = "sections" | "blocks" | "snippets" | "layout" | "templates"

/**
 * For each folder, the theme's own file AGENTS.md shows: the shortest one in
 * that folder that is in the theme's format, so the example is a real file
 * of this theme and not a made up one. Deterministic, so the guide does not
 * change from one Push to the next unless the theme did.
 */
export function folderExamples(
  files: Record<string, string>,
  compat: boolean,
  template?: { path: string; text: string } | null,
): { folder: ExampleFolder; path: string; text: string; abridged?: boolean }[] {
  const out: { folder: ExampleFolder; path: string; text: string; abridged?: boolean }[] = []
  for (const folder of ["sections", "blocks", "snippets"] as const) {
    if (!compat && folder === "snippets") continue
    const name = new RegExp(`^${folder}/[A-Za-z0-9_][A-Za-z0-9_.-]*\\.storelib$`)
    const fits = Object.entries(files)
      .filter(([p, t]) => name.test(p) && typeof t === "string" && t.trim() !== "")
      .filter(([, t]) => (compat ? isCompatSource(t) && (folder === "snippets" || /<schema>/.test(t)) : isNativeSectionSource(t)))
      .sort((a, b) => a[1].length - b[1].length || (a[0] < b[0] ? -1 : 1))
    const pick = fits.find(([, t]) => t.split("\n").length >= 4) ?? fits[0]
    if (!pick) continue
    const e = exampleOf(pick[1], compat)
    out.push({ folder, path: pick[0], text: e.text, ...(e.abridged ? { abridged: true } : {}) })
  }
  if (template && template.text.length <= EXAMPLE_CHARS) out.push({ folder: "templates", path: template.path, text: template.text })
  return out
}
