/**
 * ===========================================================================
 *  READING A .storelib FILE
 * ===========================================================================
 * A section file is four top-level blocks, in any order:
 *
 *   <template> … </template>        required
 *   <style> … </style>              required (may be empty); `scoped` is accepted
 *   <script> … </script>            optional
 *   <schema> … </schema>            required, JSON
 *
 * This finds them and nothing more. It does not parse the markup, the CSS,
 * the script or the JSON; each of those has its own stage, and each gets the
 * line its block started on so that an error inside it can be reported at
 * the line a person is looking at in the editor.
 *
 * Only the top level is read. A `<script>` inside `<template>` belongs to the
 * template and is left there — it is the template compiler's business to
 * refuse it. So blocks are matched only when their opening tag starts a line
 * (after whitespace), and the closing tag is the first matching one after it
 * that also starts a line. That is enough to keep `</style>` inside a
 * template's text from ending the style block, and simple enough to explain.
 */
import type { Result, SourceBlock, StorelibSource, ThemeError } from "../types"

const BLOCKS = ["template", "style", "script", "schema"] as const
type BlockName = (typeof BLOCKS)[number]

interface Found {
  name: BlockName
  attrs: string
  text: string
  /** 1-based line of the file on which the content (not the tag) begins. */
  line: number
  /** 1-based line of the opening tag, for duplicate errors. */
  tagLine: number
}

export function parseStorelib(source: string, file = "section.storelib"): Result<StorelibSource> {
  const errors: ThemeError[] = []
  const found: Partial<Record<BlockName, Found>> = {}

  const lines = source.split("\n")
  let i = 0
  while (i < lines.length) {
    const open = lines[i].match(/^\s*<(template|style|script|schema)(\s[^>]*)?>\s*(.*)$/)
    if (!open) {
      if (lines[i].trim() !== "" && !lines[i].trim().startsWith("<!--")) {
        errors.push({
          stage: "parse",
          file,
          line: i + 1,
          message: `Only <template>, <style>, <script> and <schema> may appear at the top level; found "${lines[i].trim().slice(0, 40)}"`,
        })
      }
      i++
      continue
    }
    const name = open[1] as BlockName
    const attrs = (open[2] ?? "").trim()
    const rest = open[3] ?? ""
    const tagLine = i + 1
    const close = new RegExp(`^\\s*</${name}>\\s*$`)

    // Content may start on the same line as the tag; more often the next.
    const body: string[] = []
    let contentLine = i + 1
    if (rest.trim()) {
      const sameLineClose = rest.match(new RegExp(`^(.*?)</${name}>\\s*$`))
      if (sameLineClose) {
        record(name, attrs, sameLineClose[1], tagLine, tagLine)
        i++
        continue
      }
      body.push(rest)
      contentLine = i + 1
    } else {
      contentLine = i + 2
    }

    let j = i + 1
    let closed = false
    while (j < lines.length) {
      if (close.test(lines[j])) {
        closed = true
        break
      }
      body.push(lines[j])
      j++
    }
    if (!closed) {
      errors.push({ stage: "parse", file, line: tagLine, message: `<${name}> is never closed` })
      break
    }
    record(name, attrs, body.join("\n"), contentLine, tagLine)
    i = j + 1
  }

  function record(name: BlockName, attrs: string, text: string, line: number, tagLine: number) {
    if (found[name]) {
      errors.push({
        stage: "parse",
        file,
        line: tagLine,
        message: `A second <${name}> block; the first is on line ${found[name]!.tagLine}. A section has one of each.`,
      })
      return
    }
    found[name] = { name, attrs, text, line, tagLine }
  }

  for (const required of ["template", "schema"] as const) {
    if (!found[required]) errors.push({ stage: "parse", file, message: `A section needs a <${required}> block` })
  }
  if (errors.length) return { ok: false, errors }

  const style = found.style
  const block = (f: Found): SourceBlock => ({ text: f.text, line: f.line })

  return {
    ok: true,
    value: {
      template: block(found.template!),
      style: style ? { ...block(style), scoped: /\bscoped\b/.test(style.attrs) } : { text: "", line: 0, scoped: true },
      script: found.script ? block(found.script) : null,
      schema: block(found.schema!),
    },
  }
}

/**
 * Parse the `<schema>` block's JSON, turning a JSON syntax error into a line
 * of the .storelib file rather than a line of the JSON in isolation.
 */
export function parseSchemaJson(block: SourceBlock, file = "section.storelib"): Result<unknown> {
  try {
    return { ok: true, value: JSON.parse(block.text) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // V8 says "… in JSON at position N" (older) or "… (line L column C)" (newer).
    let line = block.line
    let column: number | undefined
    const lc = msg.match(/line (\d+) column (\d+)/)
    const pos = msg.match(/position (\d+)/)
    if (lc) {
      line = block.line + Number(lc[1]) - 1
      column = Number(lc[2])
    } else if (pos) {
      const before = block.text.slice(0, Number(pos[1]))
      line = block.line + (before.match(/\n/g)?.length ?? 0)
      column = before.length - before.lastIndexOf("\n")
    }
    return {
      ok: false,
      errors: [{ stage: "schema", file, line, column, message: `The <schema> block is not valid JSON: ${msg.replace(/ in JSON.*$/, "")}` }],
    }
  }
}
