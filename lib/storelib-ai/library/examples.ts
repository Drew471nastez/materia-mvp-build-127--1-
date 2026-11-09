/**
 * ===========================================================================
 *  INTERACTIVE COMPONENTS THAT WORK IN STORELIB'S RUNTIME, AS EXAMPLES
 * ===========================================================================
 * Each file under ./examples is a complete .storelib section (template,
 * scoped style, optional sandboxed script, schema) for one interaction the
 * agent is asked for again and again: scroll reveals, a marquee, sticky
 * stacked panels, a sideways gallery, a hover image index, a staggered
 * headline, before and after, tabs, an accordion, counters from real
 * numbers, parallax, a video opening, and a free site's own header (mega
 * menu, mobile menu, its own search window and cart drawer) and footer
 * (sign up, menus, language and currency).
 *
 * They are written for what the runtime really allows: CSS first
 * (scroll-driven animation, :has(), details, popover, sticky), a script only
 * where state needs one, and then only class, attribute and style changes on
 * its own copy of the markup (lib/storelib-theme/sandbox/protocol.ts). Every
 * one respects prefers-reduced-motion and works by keyboard.
 * tests/ai-design-n4.test.ts compiles and draws each through the agent's own
 * file check (validateFile, the strict section check) and the render check,
 * and holds each to the anti-slop evaluator.
 *
 * The agent gets one in full through search_knowledge (by id or "example
 * <thing>"); the brief lists their ids. They are patterns to adapt to the
 * concept, never to paste unchanged.
 *
 * Pure. Browser safe (server modules import it; the sources are ~90 KB).
 */
import { EXAMPLE_SOURCES } from "./examples.generated"
import { tokenize } from "./retrieve"

export interface ComponentExample {
  /** The section type, ai_<name>, also the file name. */
  id: string
  title: string
  summary: string
  tags: string[]
  /** The whole file, the header comment included. */
  source: string
}

/** The `{# example ... #}` header: title, summary and tags, one per line. */
export function parseExample(file: string, source: string): ComponentExample {
  const head = /^\{#\s*example\s*\n([\s\S]*?)#\}/.exec(source)
  if (!head) throw new Error(`${file}: starts without an {# example ... #} header`)
  const meta: Record<string, string> = {}
  for (const line of head[1].split("\n")) {
    const m = /^([a-z]+):\s*(.*)$/.exec(line.trim())
    if (m) meta[m[1]] = m[2].trim()
  }
  const id = file.replace(/\.storelib$/, "")
  if (!/^ai_[a-z0-9_]+$/.test(id)) throw new Error(`${file}: an example's file name is its ai_ type`)
  if (!meta.title || !meta.summary || !meta.tags) throw new Error(`${file}: the header needs title, summary and tags`)
  return { id, title: meta.title, summary: meta.summary, tags: meta.tags.split(",").map((t) => t.trim()).filter(Boolean), source }
}

let cache: ComponentExample[] | null = null

export function allExamples(): ComponentExample[] {
  if (!cache) cache = EXAMPLE_SOURCES.map((s) => parseExample(s.file, s.source))
  return cache
}

export function exampleById(id: string): ComponentExample | undefined {
  return allExamples().find((e) => e.id === id)
}

/**
 * The examples a query is about, best first: an id named exactly wins,
 * otherwise tag and title words. Only when the query asks for an example
 * (the word example, an ai_ id, or `force`), so ordinary knowledge searches
 * are not crowded by source code.
 */
export function matchExamples(query: string, limit = 1, force = false): ComponentExample[] {
  const q = query.toLowerCase()
  const named = allExamples().filter((e) => q.includes(e.id))
  if (named.length) return named.slice(0, limit)
  if (!force && !/\bexamples?\b|\bworking (?:code|component)\b/.test(q)) return []
  const words = new Set(tokenize(q))
  return allExamples()
    .map((e, i) => {
      const tags = e.tags.map((t) => t.toLowerCase())
      const phrase = tags.filter((t) => t.includes(" ") && q.includes(t)).length * 3
      const tw = tokenize(`${e.tags.join(" ")} ${e.title}`).filter((w) => words.has(w)).length
      return { e, i, score: phrase + tw }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.e)
}

/** One line per example, for the agent's brief. */
export function exampleCatalog(): string {
  return allExamples().map((e) => `${e.id} (${e.title.toLowerCase()})`).join("; ")
}
