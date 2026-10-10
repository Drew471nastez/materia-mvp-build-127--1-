/**
 * ===========================================================================
 *  THE COMPATIBLE PROFILE OF THE STORELIB TEMPLATE LANGUAGE: READING A FILE
 * ===========================================================================
 * A theme imported from Shopify keeps its templates in the full template
 * language Shopify themes are written in: `{% assign %}`, `{% capture %}`,
 * `{% case %}`, `{% render %}`, whitespace control with `{%-` and `-%}`, and
 * the rest. Storelib reads and draws that language itself (this folder): no
 * Shopify service and no third-party engine is involved, and nothing in it
 * runs JavaScript. A file is text, cut here into tokens, built into a tree
 * by ./parser.ts and walked by ./runtime.ts.
 *
 * The cut follows Liquid's own rules, because a theme's markup depends on
 * them to the character:
 *
 *   `{{ x }}` and `{% x %}`, and a `-` just inside either strips every space
 *   and line break on that side, up to the next text that is not white.
 *   `{% raw %}` holds text that is never read as tags.
 *   `{% comment %}` and `{% doc %}` are dropped, and nest.
 *   `{% # note %}` is a comment on one line.
 *   `{% liquid … %}` is one tag a line, without the braces.
 *   `{% schema %}`, `{% javascript %}` and `{% stylesheet %}` are taken whole:
 *   their bodies are JSON, a script and a stylesheet, not markup.
 */

export type Tok =
  | { kind: "text"; value: string; line: number }
  | { kind: "output"; value: string; line: number }
  | { kind: "tag"; name: string; args: string; line: number }
  /** A tag taken whole with its body: raw, schema, javascript, stylesheet. */
  | { kind: "verbatim"; name: string; args: string; body: string; line: number }

export class CompatSyntaxError extends Error {
  constructor(message: string, public line: number) {
    super(message)
  }
}

/** Tags whose body is taken as text, up to their own end tag. */
const VERBATIM = new Set(["raw", "schema", "javascript", "stylesheet"])
/** Tags whose body is dropped. They nest: a comment inside a comment ends with its own endcomment. */
const DROPPED = new Set(["comment", "doc"])

function lineAt(src: string, at: number, from: number, line: number): number {
  for (let i = from; i < at; i++) if (src.charCodeAt(i) === 10) line++
  return line
}

/** Where the next `{{` or `{%` starts, and which. */
function nextOpen(src: string, from: number): { at: number; kind: "output" | "tag" } | null {
  const o = src.indexOf("{{", from)
  const t = src.indexOf("{%", from)
  if (o < 0 && t < 0) return null
  if (o < 0) return { at: t, kind: "tag" }
  if (t < 0) return { at: o, kind: "output" }
  return o < t ? { at: o, kind: "output" } : { at: t, kind: "tag" }
}

/**
 * The end of a tag or an output: the first closer, quotes or not. That is
 * how Shopify cuts a template (its tokenizer is a non-greedy match from
 * `{%` to `%}`), and themes are written against it: a comment in a
 * `{% liquid %}` block holds an apostrophe, and only this reading of it
 * draws the page Shopify draws.
 */
function closeOf(src: string, from: number, closer: "}}" | "%}"): number {
  return src.indexOf(closer, from)
}

/** `{% endraw %}` and the like: the next one at the same depth, for the dropped kinds. */
function endOf(src: string, from: number, name: string): { start: number; end: number } | null {
  const open = new RegExp(`\\{%-?\\s*${name}\\b`, "g")
  const close = new RegExp(`\\{%-?\\s*end${name}\\s*-?%\\}`, "g")
  let depth = 1
  let i = from
  for (;;) {
    close.lastIndex = i
    const c = close.exec(src)
    if (!c) return null
    if (DROPPED.has(name)) {
      open.lastIndex = i
      let o: RegExpExecArray | null
      while ((o = open.exec(src)) && o.index < c.index) {
        depth++
        open.lastIndex = o.index + 2
      }
    }
    depth--
    if (depth === 0) return { start: c.index, end: c.index + c[0].length }
    i = c.index + c[0].length
  }
}

/**
 * `lax` reads as Shopify's own lenient parser does: an unclosed `{{` is
 * text, a line of `{% liquid %}` that is not a tag is skipped, and an
 * unclosed raw or comment runs to the end. The page always draws; the
 * strict reading is what names the line in the import report and the code
 * editor.
 */
export function lex(src: string, lax = false): Tok[] {
  const toks: Tok[] = []
  let i = 0
  let line = 1
  /* A `-` on the left of the next tag strips the white space before it from the text already pushed. */
  const trimLast = () => {
    const last = toks[toks.length - 1]
    if (last && last.kind === "text") last.value = last.value.replace(/\s+$/, "")
  }
  let trimNext = false
  const pushText = (text: string, at: number) => {
    let t = text
    if (trimNext) { t = t.replace(/^\s+/, ""); trimNext = false }
    if (t) toks.push({ kind: "text", value: t, line: at })
  }

  while (i < src.length) {
    const open = nextOpen(src, i)
    if (!open) {
      pushText(src.slice(i), line)
      break
    }
    if (open.at > i) pushText(src.slice(i, open.at), line)
    else if (trimNext) trimNext = trimNext // nothing between two tags
    line = lineAt(src, open.at, i, line)
    const startLine = line
    const closer = open.kind === "output" ? "}}" : "%}"
    const end = closeOf(src, open.at + 2, closer)
    if (end < 0) {
      if (!lax) throw new CompatSyntaxError(`"${src.slice(open.at, open.at + 2)}" is never closed`, startLine)
      pushText(src.slice(open.at), startLine)
      break
    }
    let inner = src.slice(open.at + 2, end)
    const ltrim = inner.startsWith("-")
    const rtrim = inner.endsWith("-")
    if (ltrim) inner = inner.slice(1)
    if (rtrim) inner = inner.slice(0, -1)
    if (ltrim) trimLast()
    line = lineAt(src, end + 2, open.at, line)
    i = end + 2
    trimNext = false

    if (open.kind === "output") {
      toks.push({ kind: "output", value: inner.trim(), line: startLine })
      trimNext = rtrim
      continue
    }

    const body = inner.trim()
    /* `{% # a note %}` */
    if (body.startsWith("#")) { trimNext = rtrim; continue }
    const m = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*([\s\S]*)$/)
    if (!m) {
      if (!lax) throw new CompatSyntaxError(`"{% ${body.slice(0, 40)} %}" is not a tag`, startLine)
      trimNext = rtrim
      continue
    }
    const name = m[1]
    const args = m[2].trim()

    if (VERBATIM.has(name) || DROPPED.has(name)) {
      const close = endOf(src, i, name) ?? (lax ? { start: src.length, end: src.length } : null)
      if (!close) throw new CompatSyntaxError(`{% ${name} %} is never closed with {% end${name} %}`, startLine)
      const text = src.slice(i, close.start)
      const closeTag = src.slice(close.start, close.end)
      line = lineAt(src, close.end, i, line)
      i = close.end
      if (VERBATIM.has(name)) {
        if (name === "raw") {
          /* A raw block is text; the trim marks on its own tags work as on any tag. */
          let t = text
          if (rtrim) t = t.replace(/^\s+/, "")
          if (/^\{%-/.test(closeTag)) t = t.replace(/\s+$/, "")
          if (t) toks.push({ kind: "text", value: t, line: startLine })
        } else {
          toks.push({ kind: "verbatim", name, args, body: text, line: startLine })
        }
      }
      trimNext = /-%\}$/.test(closeTag)
      continue
    }

    if (name === "liquid") {
      /* One tag a line; `echo` outputs. Comments start with #. */
      let l = startLine
      for (const raw of args.split("\n")) {
        const s = raw.trim()
        if (s && !s.startsWith("#")) {
          const mm = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*([\s\S]*)$/)
          if (!mm && !lax) throw new CompatSyntaxError(`"${s.slice(0, 40)}" in {% liquid %} is not a tag`, l)
          if (!mm) { /* skipped, as Shopify's lenient parser skips it */ }
          else if (mm[1] === "echo") toks.push({ kind: "output", value: mm[2].trim(), line: l })
          else toks.push({ kind: "tag", name: mm[1], args: mm[2].trim(), line: l })
        }
        l++
      }
      trimNext = rtrim
      continue
    }

    if (name === "echo") {
      toks.push({ kind: "output", value: args, line: startLine })
      trimNext = rtrim
      continue
    }

    toks.push({ kind: "tag", name, args, line: startLine })
    trimNext = rtrim
  }
  return toks
}
