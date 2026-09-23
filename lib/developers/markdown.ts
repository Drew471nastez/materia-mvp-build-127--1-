/**
 * ===========================================================================
 *  THE HUB'S MARKDOWN, AS ONE TREE WITH TWO READERS
 * ===========================================================================
 * A page of the Developer Hub is markdown in content/developers. It is read
 * twice: by the web page, which draws it with the site's own type and code
 * blocks, and by /llms-full.txt, which gives an AI agent the same words as
 * plain text. Both read THIS tree, so the two cannot say different things.
 *
 * Only the markdown the hub actually uses is understood: headings, paragraphs,
 * fenced code, tables, lists, quotes and rules. That is deliberate. A parser
 * for the whole of CommonMark is a dependency for a format nobody here writes,
 * and anything this does not recognise is kept as a paragraph rather than
 * silently lost.
 *
 * `@[name]` or `@[name:argument]` alone on a line is a DIRECTIVE: a place
 * where a table or a code block is generated from the framework itself, such
 * as every control type from the registry. See lib/developers/directives.ts.
 *
 * Nothing here produces HTML. Inline markup stays a string, and the web page
 * turns it into React elements, so there is no path from a document to
 * `dangerouslySetInnerHTML`.
 */

/** Inline markdown: `code`, **bold**, *emphasis*, [text](href). Kept as written. */
export type Inline = string

export type DocNode =
  | { kind: "heading"; level: 1 | 2 | 3; text: Inline; id: string }
  | { kind: "paragraph"; text: Inline }
  | { kind: "code"; lang: string; code: string; title?: string }
  | { kind: "table"; head: Inline[]; rows: Inline[][] }
  | { kind: "list"; ordered: boolean; items: Inline[] }
  | { kind: "quote"; text: Inline }
  | { kind: "rule" }
  | { kind: "details"; summary: string; children: DocNode[] }
  | { kind: "directive"; name: string; arg?: string }

/** The words of a piece of inline markdown, without its markup. */
export function plainInline(text: Inline): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
}

/**
 * A heading's anchor. Lowercase words joined by hyphens, which is what every
 * other docs site does, so a link written by hand elsewhere guesses right.
 */
export function slugify(text: Inline): string {
  return plainInline(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
}

const FENCE = /^```\s*([a-z0-9_-]*)\s*$/i
const HEADING = /^(#{1,3})\s+(.*)$/
const DIRECTIVE = /^@\[([a-z0-9-]+)(?::([a-z0-9_.-]+))?\]\s*$/i
const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const TABLE_ROW = /^\|(.*)\|\s*$/
const TABLE_RULE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

function cells(row: string): string[] {
  const inner = row.trim().replace(/^\|/, "").replace(/\|\s*$/, "")
  /* A pipe inside inline code is part of the code, not a column break. */
  const out: string[] = []
  let cur = ""
  let inCode = false
  for (const ch of inner) {
    if (ch === "`") inCode = !inCode
    if (ch === "|" && !inCode) { out.push(cur.trim()); cur = ""; continue }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

export function parseMarkdown(src: string): DocNode[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n")
  const out: DocNode[] = []
  const used = new Map<string, number>()
  let i = 0

  const uniqueId = (base: string) => {
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    return n === 0 ? base : `${base}-${n}`
  }

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { i++; continue }

    const fence = line.match(FENCE)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { body.push(lines[i]); i++ }
      i++ // the closing fence
      out.push({ kind: "code", lang: fence[1] || "text", code: body.join("\n") })
      continue
    }

    const directive = line.match(DIRECTIVE)
    if (directive) {
      out.push({ kind: "directive", name: directive[1], arg: directive[2] })
      i++
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3
      const text = heading[2].trim()
      out.push({ kind: "heading", level, text, id: uniqueId(slugify(text)) })
      i++
      continue
    }

    if (/^-{3,}\s*$/.test(line)) { out.push({ kind: "rule" }); i++; continue }

    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && TABLE_ROW.test(lines[i])) { rows.push(cells(lines[i])); i++ }
      out.push({ kind: "table", head, rows })
      continue
    }

    const item = line.match(LIST_ITEM)
    if (item) {
      const ordered = /\d/.test(item[2])
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM)
        if (m && /\d/.test(m[2]) === ordered) { items.push(m[3].trim()); i++; continue }
        /* A wrapped continuation of the item above, indented under it. */
        if (items.length && /^\s{2,}\S/.test(lines[i]) && !FENCE.test(lines[i].trim())) {
          items[items.length - 1] += " " + lines[i].trim()
          i++
          continue
        }
        break
      }
      out.push({ kind: "list", ordered, items })
      continue
    }

    if (line.startsWith(">")) {
      const body: string[] = []
      while (i < lines.length && lines[i].startsWith(">")) { body.push(lines[i].replace(/^>\s?/, "")); i++ }
      out.push({ kind: "quote", text: body.join(" ").trim() })
      continue
    }

    /* A paragraph runs until a blank line or the start of anything else. */
    const body: string[] = [line.trim()]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !DIRECTIVE.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !TABLE_ROW.test(lines[i]) &&
      !lines[i].startsWith(">")
    ) { body.push(lines[i].trim()); i++ }
    out.push({ kind: "paragraph", text: body.join(" ") })
  }

  return out
}

/** The page's own title: its first level-one heading. */
export function titleOf(nodes: DocNode[]): string | undefined {
  const h = nodes.find((n) => n.kind === "heading" && n.level === 1)
  return h && h.kind === "heading" ? plainInline(h.text) : undefined
}

/** "On this page": every level-two and level-three heading, in order. */
export function outlineOf(nodes: DocNode[]): { id: string; text: string; level: 2 | 3 }[] {
  const out: { id: string; text: string; level: 2 | 3 }[] = []
  for (const n of nodes) {
    if (n.kind === "heading" && n.level > 1) out.push({ id: n.id, text: plainInline(n.text), level: n.level as 2 | 3 })
  }
  return out
}
