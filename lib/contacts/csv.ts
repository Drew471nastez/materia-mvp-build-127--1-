/**
 * Contacts' CSV, both ways (round 51). Pure, so the import route, the export
 * route and the tests read and write it the same way.
 *
 * READING an import: RFC 4180 (quotes, doubled quotes, commas and line
 * breaks inside quotes), a comma or a semicolon as the separator (a
 * spreadsheet saved in a language that writes decimals with a comma uses
 * semicolons), a byte order mark ignored. The header row names the columns;
 * an address column is required and is found by its name in the usual
 * spellings, or else as the first column whose cells look like addresses.
 *
 * WRITING an export: every cell quoted when it needs it, and a cell a
 * spreadsheet would run as a formula written as text (lib/csv/formula-guard).
 */
import { guardFormula } from "@/lib/csv/formula-guard"
import { cleanTag, normalizeEmail } from "./identity"

export const IMPORT_MAX_ROWS = 5000
export const IMPORT_MAX_BYTES = 2_000_000

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "")
  const firstLine = src.slice(0, src.search(/\r?\n|$/))
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell === "") quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "")
const EMAIL_HEADS = ["email", "emailaddress", "mail", "email1", "correo", "courriel", "emailadresse", "eposta"]
const NAME_HEADS = ["name", "fullname", "nombre", "nom", "nome", "imie", "displayname"]
const FIRST_HEADS = ["firstname", "first", "givenname", "vorname", "prenom"]
const LAST_HEADS = ["lastname", "last", "surname", "familyname", "nachname"]
const TAG_HEADS = ["tags", "tag", "labels"]

export interface ImportRow {
  email: string
  name: string | null
  tags: string[]
}

export interface ParsedImport {
  rows: ImportRow[]
  /** Lines that had no usable address. */
  invalid: number
  /** Repeats of an address already in the file. */
  repeated: number
  /** The file had more rows than an import takes; the rest were not read. */
  truncated: boolean
  /** No column holds addresses. */
  noEmailColumn: boolean
}

/** The people in an import file, each address once. */
export function readImport(text: string): ParsedImport {
  const table = parseCsv(text)
  if (table.length === 0) return { rows: [], invalid: 0, repeated: 0, truncated: false, noEmailColumn: true }
  const head = table[0].map(norm)
  const find = (names: string[]) => head.findIndex((h) => names.includes(h))
  let emailAt = find(EMAIL_HEADS)
  let body = table.slice(1)
  if (emailAt < 0) {
    /* No header that names it: the first column whose cells are addresses, and the first line is data when it is one too. */
    emailAt = table[0].findIndex((c, i) => normalizeEmail(c) || table.slice(1, 6).some((r) => normalizeEmail(r[i])))
    if (emailAt < 0) return { rows: [], invalid: table.length, repeated: 0, truncated: false, noEmailColumn: true }
    if (normalizeEmail(table[0][emailAt])) body = table
  }
  const nameAt = find(NAME_HEADS)
  const firstAt = find(FIRST_HEADS)
  const lastAt = find(LAST_HEADS)
  const tagsAt = find(TAG_HEADS)
  const seen = new Set<string>()
  const rows: ImportRow[] = []
  let invalid = 0
  let repeated = 0
  const truncated = body.length > IMPORT_MAX_ROWS
  for (const r of body.slice(0, IMPORT_MAX_ROWS)) {
    const email = normalizeEmail(r[emailAt])
    if (!email) {
      invalid++
      continue
    }
    if (seen.has(email)) {
      repeated++
      continue
    }
    seen.add(email)
    const joined = [firstAt >= 0 ? r[firstAt] : "", lastAt >= 0 ? r[lastAt] : ""].map((x) => (x ?? "").trim()).filter(Boolean).join(" ")
    const name = ((nameAt >= 0 ? r[nameAt] : "") || joined || "").replace(/\s+/g, " ").trim().slice(0, 120) || null
    const tags = tagsAt >= 0 ? (r[tagsAt] ?? "").split(/[,;|]/).map(cleanTag).filter((t): t is string => !!t).slice(0, 20) : []
    rows.push({ email, name, tags })
  }
  return { rows, invalid, repeated, truncated, noEmailColumn: false }
}

/** One CSV cell: formula-guarded, quoted when it holds a separator, a quote or a line break. */
export function csvCell(v: unknown): string {
  const s = guardFormula(v === null || v === undefined ? "" : String(v))
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(",") + "\r\n"
}
