/**
 * What the project IS RIGHT NOW, read out of the files themselves.
 *
 * ---------------------------------------------------------------------------
 *  DERIVED, NEVER STORED
 * ---------------------------------------------------------------------------
 * The design tokens, the components and the page structure are all recoverable
 * from the code, so they are recomputed on every run rather than remembered.
 * That is not laziness about caching — it is the only way these facts can be
 * trusted. A stored copy saying the primary colour is #7c3fed keeps saying it
 * after somebody changes the token, and an agent that believes a stale
 * manifest will "match the existing style" against a style that no longer
 * exists. Anything the files can answer, the files answer.
 *
 * The manifest holds the other half — purpose, audience, decisions — which no
 * amount of reading the code can tell you.
 *
 * ---------------------------------------------------------------------------
 *  WHY IT GOES IN THE PROMPT RATHER THAN BEING LOOKED UP
 * ---------------------------------------------------------------------------
 * The agent has list_files and read_file and could work all of this out. It
 * just does not reliably do so before deciding how something should look —
 * and a model that has not read styles.css will invent a palette rather than
 * reuse one. Putting the tokens in front of it costs a few hundred tokens and
 * removes the step most likely to be skipped.
 */

import type { ProjectFiles } from "../types"

const STYLES = "src/styles.css"
/** Enough to characterise a project; past this it is noise in the prompt. */
const MAX_TOKENS_SHOWN = 28
const MAX_FILES_SHOWN = 60

/** `--name: value;` pairs from the top of the stylesheet. */
export function designTokens(css: string): Array<[string, string]> {
  const tokens: Array<[string, string]> = []
  const seen = new Set<string>()
  const pattern = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;}]+)[;}]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css)) !== null) {
    const name = match[1]
    if (seen.has(name)) continue
    seen.add(name)
    tokens.push([name, match[2].trim().replace(/\s+/g, " ").slice(0, 80)])
    if (tokens.length >= MAX_TOKENS_SHOWN) break
  }
  return tokens
}

/** Font stacks actually in use, so new markup inherits them instead of picking. */
export function fontFamilies(css: string): string[] {
  const found = new Set<string>()
  const pattern = /font-family\s*:\s*([^;}]+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css)) !== null) {
    const value = match[1].trim().replace(/\s+/g, " ").slice(0, 120)
    if (value.startsWith("var(")) continue
    found.add(value)
    if (found.size >= 4) break
  }
  return [...found]
}

/** Component files, by the name the rest of the project imports them under. */
export function componentNames(files: ProjectFiles): string[] {
  return Object.keys(files)
    .filter((p) => /^src\/components\/[^/]+\.(tsx|jsx)$/.test(p))
    .map((p) => p.replace(/^src\/components\//, "").replace(/\.(tsx|jsx)$/, ""))
    .sort()
}

/**
 * A compact description of the project, for the system prompt.
 *
 * Returns "" for an empty project — a brand-new site has nothing to preserve,
 * and telling the model to match a design language that does not exist yet
 * would make a first generation timid.
 */
export function describeProject(files: ProjectFiles): string {
  const paths = Object.keys(files).sort()
  if (paths.length === 0) return ""

  const css = files[STYLES] ?? ""
  const tokens = designTokens(css)
  const fonts = fontFamilies(css)
  const components = componentNames(files)

  const sections: string[] = []

  sections.push(
    `Files (${paths.length}):\n` +
      paths
        .slice(0, MAX_FILES_SHOWN)
        .map((p) => `  ${p}`)
        .join("\n") +
      (paths.length > MAX_FILES_SHOWN ? `\n  …and ${paths.length - MAX_FILES_SHOWN} more` : ""),
  )

  if (components.length) {
    sections.push(`Existing components (reuse these before writing new ones):\n  ${components.join(", ")}`)
  }

  if (tokens.length) {
    sections.push(
      `Design tokens already defined in ${STYLES} — use these, do not invent new values:\n` +
        tokens.map(([name, value]) => `  ${name}: ${value}`).join("\n"),
    )
  }

  if (fonts.length) {
    sections.push(`Typography in use:\n${fonts.map((f) => `  ${f}`).join("\n")}`)
  }

  return sections.join("\n\n")
}
