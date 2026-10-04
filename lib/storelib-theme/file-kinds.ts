/**
 * ===========================================================================
 *  WHAT A FILE SETTING TAKES: `accept` ON A `file_picker`
 * ===========================================================================
 * A file setting is an attachment on the website: a PDF sample, a price
 * list, a press kit, a track. The schema can say what kind it is for, and
 * the editor's picker then offers only those files, says so in words ("PDF",
 * "PDF or Word document"), and refuses anything else before it uploads.
 *
 *   { "type": "file_picker", "id": "sample", "label": "Sample", "accept": ["pdf"] }
 *   { "type": "file_picker", "id": "kit", "label": "Press kit", "accept": ["document", "archive"] }
 *   { "type": "file_picker", "id": "stems", "label": "Stems", "accept": [".zip", ".wav"] }
 *
 * An entry is a KIND by name (below) or a file EXTENSION, with or without its
 * dot. No `accept` means any file a website may hand out. Whatever the schema
 * says, the upload itself is checked on the server like every public file
 * (lib/security/uploads, the link page file rules): never a web page, a
 * script or an SVG, whatever its name.
 */

export const FILE_KINDS = {
  pdf: { label: "PDF", ext: ["pdf"] },
  document: { label: "document", ext: ["pdf", "doc", "docx", "odt", "rtf", "txt", "md"] },
  spreadsheet: { label: "spreadsheet", ext: ["xls", "xlsx", "ods", "csv"] },
  presentation: { label: "presentation", ext: ["ppt", "pptx", "odp"] },
  archive: { label: "ZIP or archive", ext: ["zip", "rar", "7z", "tar", "gz"] },
  audio: { label: "audio file", ext: ["mp3", "wav", "m4a", "aac", "flac", "ogg", "aiff"] },
  ebook: { label: "ebook", ext: ["epub", "mobi", "pdf"] },
} as const

export type FileKind = keyof typeof FILE_KINDS

/** Never offered, whatever a schema asks for: a browser would run or render it as a page. */
const NEVER = new Set(["html", "htm", "xhtml", "shtml", "svg", "svgz", "xml", "js", "mjs", "cjs", "php", "exe", "msi", "bat", "cmd", "sh", "app", "dmg", "jar", "apk"])

const EXT = /^\.?[a-z0-9]{1,8}$/i

/** Why an `accept` entry is not one, or null when it is. */
export function acceptEntryProblem(entry: unknown): string | null {
  if (typeof entry !== "string" || entry.trim() === "") return "an entry is a kind or an extension, as a string"
  const e = entry.trim().toLowerCase()
  if (e in FILE_KINDS) return null
  if (!EXT.test(e)) return `"${entry}" is neither a kind (${Object.keys(FILE_KINDS).join(", ")}) nor an extension like ".pdf"`
  if (NEVER.has(e.replace(/^\./, ""))) return `"${entry}" cannot be a file on a website: a browser would run it or show it as a page`
  return null
}

/** The extensions an `accept` list comes to, without dots, deduplicated. Empty means any. */
export function acceptedExtensions(accept: unknown): string[] {
  if (!Array.isArray(accept)) return []
  const out = new Set<string>()
  for (const raw of accept) {
    if (acceptEntryProblem(raw)) continue
    const e = String(raw).trim().toLowerCase()
    if (e in FILE_KINDS) for (const x of FILE_KINDS[e as FileKind].ext) out.add(x)
    else out.add(e.replace(/^\./, ""))
  }
  return [...out]
}

/** The `accept` attribute for a file input: ".pdf,.docx", or "" for any. */
export function inputAccept(accept: unknown): string {
  return acceptedExtensions(accept).map((e) => `.${e}`).join(",")
}

/** What the setting takes, in words: "PDF", "PDF or ZIP or archive", "any file". */
export function acceptLabel(accept: unknown): string {
  if (!Array.isArray(accept) || accept.length === 0) return "any file"
  const words: string[] = []
  for (const raw of accept) {
    if (acceptEntryProblem(raw)) continue
    const e = String(raw).trim().toLowerCase()
    const word = e in FILE_KINDS ? FILE_KINDS[e as FileKind].label : e.replace(/^\./, "").toUpperCase()
    if (!words.includes(word)) words.push(word)
  }
  if (words.length === 0) return "any file"
  if (words.length === 1) return words[0]
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`
}

/** Does this file name fit the list? Any name fits an empty one. */
export function fileFits(name: string, accept: unknown): boolean {
  const allowed = acceptedExtensions(accept)
  const ext = (name.split(".").pop() ?? "").toLowerCase()
  if (NEVER.has(ext)) return false
  return allowed.length === 0 || allowed.includes(ext)
}

/** The extension shown on a file's tile: "PDF", "ZIP", or "FILE" when there is none. */
export function fileBadge(nameOrUrl: string): string {
  let name = nameOrUrl
  try {
    name = decodeURIComponent(new URL(nameOrUrl, "https://x.invalid").pathname.split("/").pop() || nameOrUrl)
  } catch {
    /* not an address: the name as given */
  }
  const ext = name.includes(".") ? (name.split(".").pop() ?? "") : ""
  return /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toUpperCase() : "FILE"
}
