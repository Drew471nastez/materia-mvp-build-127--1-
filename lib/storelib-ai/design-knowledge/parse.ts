/**
 * Parsing and validating one knowledge markdown file.
 *
 * The frontmatter is a deliberately small subset of YAML, so it needs no
 * dependency and cannot surprise anybody:
 *
 *   ---
 *   id: hero-editorial
 *   title: Editorial hero
 *   priority: 4
 *   tags: [hero, editorial, type-led]
 *   ---
 *
 * One `key: value` per line. A value is a number, a [comma, separated] list
 * or plain text (optionally in double quotes). Nothing nested.
 *
 * Used by scripts/build-design-knowledge.ts and by the drift test. Pure.
 */
import {
  KNOWLEDGE_CAPABILITIES,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_PHASES,
  type KnowledgeCapability,
  type KnowledgeCategory,
  type KnowledgeEntry,
  type KnowledgePhase,
} from "./types"

type Raw = Record<string, string | number | string[]>

const LIST_KEYS = ["intents", "tags", "industries", "styles", "components", "capabilities", "phases", "related"] as const

function parseValue(v: string): string | number | string[] {
  const t = v.trim()
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim()
    return inner ? inner.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1")).filter(Boolean) : []
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return t.replace(/^"(.*)"$/, "$1")
}

export function parseFrontmatter(source: string): { data: Raw; body: string } {
  const text = source.replace(/\r\n/g, "\n")
  if (!text.startsWith("---\n")) throw new Error("missing frontmatter: the file must start with ---")
  const end = text.indexOf("\n---\n", 4)
  if (end < 0) throw new Error("frontmatter is not closed with ---")
  const data: Raw = {}
  for (const line of text.slice(4, end).split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue
    const m = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line)
    if (!m) throw new Error(`bad frontmatter line: ${line}`)
    if (m[1] in data) throw new Error(`duplicate frontmatter key: ${m[1]}`)
    data[m[1]] = parseValue(m[2])
  }
  return { data, body: text.slice(end + 5).trim() }
}

function list(data: Raw, key: string): string[] {
  const v = data[key]
  if (v === undefined) return []
  if (Array.isArray(v)) return v
  return [String(v)]
}

/** A file's text to an entry. Throws on anything malformed, naming the file. */
export function parseEntry(source: string, file = "<entry>"): KnowledgeEntry {
  try {
    const { data, body } = parseFrontmatter(source)
    for (const key of Object.keys(data)) {
      if (!["id", "title", "category", "summary", "priority", "version", ...LIST_KEYS].includes(key)) throw new Error(`unknown frontmatter key: ${key}`)
    }
    const entry: KnowledgeEntry = {
      id: String(data.id ?? ""),
      title: String(data.title ?? ""),
      category: String(data.category ?? "") as KnowledgeCategory,
      summary: String(data.summary ?? ""),
      intents: list(data, "intents"),
      tags: list(data, "tags"),
      industries: list(data, "industries"),
      styles: list(data, "styles"),
      components: list(data, "components"),
      capabilities: list(data, "capabilities") as KnowledgeCapability[],
      phases: list(data, "phases") as KnowledgePhase[],
      priority: Number(data.priority ?? 0),
      related: list(data, "related"),
      version: Number(data.version ?? 0),
      body,
    }
    const errors = validateEntry(entry)
    if (errors.length) throw new Error(errors.join("; "))
    return entry
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`)
  }
}

/** Everything wrong with one entry, as sentences. Empty when it is fine. */
export function validateEntry(e: KnowledgeEntry): string[] {
  const errors: string[] = []
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) errors.push(`id "${e.id}" is not kebab case`)
  if (e.title.trim().length < 3) errors.push("title is missing")
  if (!(KNOWLEDGE_CATEGORIES as readonly string[]).includes(e.category)) errors.push(`category "${e.category}" is not one of ${KNOWLEDGE_CATEGORIES.join(", ")}`)
  if (e.summary.trim().length < 20) errors.push("summary is missing or too short")
  if (!e.intents.length) errors.push("needs at least one intent")
  if (!e.tags.length) errors.push("needs at least one tag")
  if (!e.phases.length) errors.push("needs at least one phase")
  for (const p of e.phases) if (!(KNOWLEDGE_PHASES as readonly string[]).includes(p)) errors.push(`phase "${p}" is unknown`)
  for (const c of e.capabilities) if (!(KNOWLEDGE_CAPABILITIES as readonly string[]).includes(c)) errors.push(`capability "${c}" is unknown`)
  if (!Number.isInteger(e.priority) || e.priority < 1 || e.priority > 5) errors.push("priority must be 1 to 5")
  if (!Number.isInteger(e.version) || e.version < 1) errors.push("version must be a positive integer")
  const words = e.body.split(/\s+/).filter(Boolean).length
  if (words < 60) errors.push(`body has ${words} words; an entry needs real guidance (60+ words)`)
  if (/\bTODO\b|\bTBD\b|lorem ipsum/i.test(e.body)) errors.push("body has a placeholder")
  if (/—/.test(e.body) || /—/.test(e.summary) || /—/.test(e.title)) errors.push("uses an em dash")
  return errors
}
