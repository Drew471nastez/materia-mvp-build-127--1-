/**
 * ===========================================================================
 *  ONE PART OF ONE DOCS PAGE, FOR AN AGENT THAT NEEDS ONLY THAT PART
 * ===========================================================================
 * The developer docs (content/developers) are the single account of the
 * Storelib Builder Framework. A skill that needs the product fields, or how
 * a schema setting is written, used to carry its own copy of them, and two
 * copies drift the first time somebody adds a field to one.
 *
 * So a skill names a page and a heading, and the words come from here: the
 * page as /llms-full.txt prints it (directives expanded, links absolute),
 * cut at that heading and the next heading of the same level. When the docs
 * change, every agent reads the change on its next request.
 *
 * Server side only in practice (the bundled docs are a large module), which
 * is where every agent that reads a skill runs.
 */
import { pageText } from "./render-text"

const pages = new Map<string, string>()

function page(slug: string): string {
  let text = pages.get(slug)
  if (text === undefined) {
    text = pageText(slug)
    pages.set(slug, text)
  }
  return text
}

/**
 * The section of a page under the first `## ` heading that starts with
 * `heading`, heading included, down to the next `## ` heading. "" when the
 * page or the heading is not there, which the tests treat as a broken
 * reference rather than an empty one.
 */
export function docSection(slug: string, heading: string): string {
  const text = page(slug)
  if (!text) return ""
  const lines = text.split("\n")
  const start = lines.findIndex((l) => l.startsWith("## ") && l.slice(3).trim().startsWith(heading))
  if (start < 0) return ""
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join("\n").trim()
}
