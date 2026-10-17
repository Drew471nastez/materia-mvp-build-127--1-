/**
 * ===========================================================================
 *  REVIEW IMPORT: A FILE AS A TABLE
 * ===========================================================================
 * Whatever the export is, it becomes headers and rows of text:
 *
 *   CSV / TSV   RFC 4180 as spreadsheets write it (quoted fields, "" inside
 *               quotes, CRLF or LF), with the separator read off the first
 *               line: comma, semicolon (Excel in much of Europe), tab or pipe
 *   JSON        a list of reviews, or an object holding one (Google's
 *               `reviews`, `data`, `items`, `results`); nested objects become
 *               columns ("reviewer.displayName" is reviewer_display_name), a
 *               list of pictures becomes one cell of addresses
 *   XML         a WordPress / WooCommerce export (WXR): every product's
 *               comments, with the rating and verified flags kept in their
 *               comment meta, as the columns WooCommerce's CSV uses
 *
 * Pure: the browser reads the file and hands the text here.
 */

export type FileFormat = "csv" | "json" | "xml"

export interface ImportTable {
  format: FileFormat
  headers: string[]
  rows: string[][]
  /** More rows than MAX_IMPORT_FILE_ROWS: the rest were not read. */
  truncated: boolean
}

/** The most rows one import reads. A bigger export is split and imported in parts. */
export const MAX_IMPORT_FILE_ROWS = 50_000
/** The most bytes the browser reads from one file. */
export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024

/** Which separator the first line uses most, outside quotes. */
export function sniffDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 }
  let quoted = false
  for (let i = 0; i < text.length && i < 20_000; i++) {
    const ch = text[i]
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === "\n" || ch === "\r")) break
    else if (!quoted && ch in counts) counts[ch]++
  }
  let best = ","
  for (const d of Object.keys(counts)) if (counts[d] > counts[best]) best = d
  return best
}

/** RFC 4180 with any one-character separator. Empty lines are dropped. Stops after `maxRows` rows past the header. */
export function parseDelimited(text: string, delimiter = ",", maxRows = MAX_IMPORT_FILE_ROWS): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let truncated = false
  const src = text.replace(/^﻿/, "")
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === "") quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(field)
      field = ""
      if (row.some((c) => c.trim() !== "")) rows.push(row)
      row = []
      if (rows.length > maxRows) {
        truncated = i < src.length - 1
        break
      }
    } else field += ch
  }
  if (!truncated && (field !== "" || row.length)) {
    row.push(field)
    if (row.some((c) => c.trim() !== "")) rows.push(row)
  }
  return { rows: rows.slice(0, maxRows + 1), truncated: truncated || rows.length > maxRows + 1 }
}

/* ── JSON ─────────────────────────────────────────────────────────────── */

function cellOf(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) {
    return v
      .map((x) => (x && typeof x === "object" ? String((x as Record<string, unknown>).url ?? (x as Record<string, unknown>).src ?? (x as Record<string, unknown>).original ?? (x as Record<string, unknown>).image_url ?? "") : cellOf(x)))
      .filter(Boolean)
      .join(" ")
  }
  return ""
}

function flatten(obj: Record<string, unknown>, prefix: string, out: Record<string, string>, depth: number) {
  for (const [k, v] of Object.entries(obj)) {
    const name = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object" && !Array.isArray(v) && depth < 3) flatten(v as Record<string, unknown>, name, out, depth + 1)
    else out[name] = cellOf(v)
  }
}

function reviewList(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>
    for (const k of ["reviews", "data", "items", "results", "records", "rows", "product_reviews", "productReviews"]) {
      if (Array.isArray(o[k])) return o[k] as unknown[]
      if (o[k] && typeof o[k] === "object") {
        const inner = reviewList(o[k])
        if (inner) return inner
      }
    }
  }
  return null
}

export function parseJsonTable(text: string, maxRows = MAX_IMPORT_FILE_ROWS): ImportTable | null {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ""))
  } catch {
    /* JSON Lines: one review a line. */
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    try {
      data = lines.map((l) => JSON.parse(l))
    } catch {
      return null
    }
  }
  const list = reviewList(data)
  if (!list) return null
  const flat: Record<string, string>[] = []
  for (const item of list.slice(0, maxRows)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const out: Record<string, string> = {}
    flatten(item as Record<string, unknown>, "", out, 0)
    flat.push(out)
  }
  const headers: string[] = []
  const seen = new Set<string>()
  for (const r of flat.slice(0, 500)) for (const k of Object.keys(r)) if (!seen.has(k)) (seen.add(k), headers.push(k))
  return { format: "json", headers, rows: flat.map((r) => headers.map((h) => r[h] ?? "")), truncated: list.length > maxRows }
}

/* ── WordPress / WooCommerce XML ──────────────────────────────────────── */

const WXR_COLUMNS = ["comment_ID", "comment_post_ID", "product_title", "product_slug", "comment_author", "comment_author_email", "comment_date_gmt", "comment_content", "comment_approved", "comment_type", "comment_parent", "rating", "verified"]

function xmlText(s: string): string {
  const cdata = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  const v = cdata ? cdata[1] : s
  return (cdata ? v : v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")).trim()
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))
  return m ? xmlText(m[1]) : ""
}

export function parseWxr(text: string, maxRows = MAX_IMPORT_FILE_ROWS): ImportTable | null {
  if (!/<wp:comment>/.test(text)) return null
  const rows: string[][] = []
  for (const item of text.split(/<item>/).slice(1)) {
    const body = item.split(/<\/item>/)[0]
    const postType = tag(body, "wp:post_type")
    if (postType && postType !== "product") continue
    const title = tag(body, "title")
    const slug = tag(body, "wp:post_name")
    const postId = tag(body, "wp:post_id")
    for (const c of body.split(/<wp:comment>/).slice(1)) {
      const cm = c.split(/<\/wp:comment>/)[0]
      const meta: Record<string, string> = {}
      for (const m of cm.matchAll(/<wp:commentmeta>([\s\S]*?)<\/wp:commentmeta>/g)) meta[tag(m[1], "wp:meta_key")] = tag(m[1], "wp:meta_value")
      rows.push([
        tag(cm, "wp:comment_id"),
        postId,
        title,
        slug,
        tag(cm, "wp:comment_author"),
        tag(cm, "wp:comment_author_email"),
        tag(cm, "wp:comment_date_gmt") || tag(cm, "wp:comment_date"),
        tag(cm, "wp:comment_content"),
        tag(cm, "wp:comment_approved"),
        tag(cm, "wp:comment_type"),
        tag(cm, "wp:comment_parent"),
        meta.rating ?? "",
        meta.verified ?? "",
      ])
      if (rows.length >= maxRows) return { format: "xml", headers: WXR_COLUMNS, rows, truncated: true }
    }
  }
  return { format: "xml", headers: WXR_COLUMNS, rows, truncated: false }
}

/* ── any file ─────────────────────────────────────────────────────────── */

/**
 * The file as a table, by what it starts with: `[` or `{` is JSON, `<` is
 * XML, anything else is a delimited text file. Null when nothing in it reads
 * as rows.
 */
export function readImportFile(text: string, fileName = "", maxRows = MAX_IMPORT_FILE_ROWS): ImportTable | null {
  const head = text.replace(/^﻿/, "").trimStart()
  if (!head) return null
  const ext = fileName.toLowerCase().split(".").pop() ?? ""
  if (head.startsWith("[") || head.startsWith("{") || ext === "json" || ext === "jsonl") return parseJsonTable(text, maxRows)
  if (head.startsWith("<") || ext === "xml") return parseWxr(text, maxRows)
  const delimiter = ext === "tsv" ? "\t" : sniffDelimiter(head)
  const { rows, truncated } = parseDelimited(text, delimiter, maxRows)
  if (rows.length < 1) return null
  const width = rows[0].length
  return { format: "csv", headers: rows[0].map((h) => h.trim()), rows: rows.slice(1).map((r) => (r.length >= width ? r : [...r, ...Array(width - r.length).fill("")])), truncated }
}
