/**
 * What the project IS RIGHT NOW, read out of the files themselves.
 *
 * ---------------------------------------------------------------------------
 *  DERIVED, NEVER STORED
 * ---------------------------------------------------------------------------
 * The design tokens, the structure and the page routes are all recoverable
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

import type { SiteAsset } from "../assets"
import type { ProjectFiles } from "../types"
import { buildRepoMap, describeRepoMap } from "./repo-map"

const STYLES = "src/styles.css"
/** Enough to characterise a project; past this it is noise in the prompt. */
const MAX_TOKENS_SHOWN = 28

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

/**
 * Routes the project actually serves.
 *
 * Derived, like the components and the tokens, because a stored list of pages
 * is wrong the moment somebody adds one — and the files can always answer.
 * Read from the router if there is one, and otherwise from the page-shaped
 * files, which is what a small Vite project usually has instead.
 */
export function pageNames(files: ProjectFiles): string[] {
  const routes = new Set<string>()

  for (const [path, source] of Object.entries(files)) {
    if (!/\.(tsx|jsx)$/.test(path)) continue
    // <Route path="/about" …>, which is how a router declares one.
    for (const match of source.matchAll(/path\s*=\s*["'`]([^"'`]+)["'`]/g)) {
      const route = match[1].trim()
      if (route.startsWith("/")) routes.add(route)
    }
  }

  if (routes.size === 0) {
    for (const path of Object.keys(files)) {
      const match = path.match(/^src\/pages\/([^/]+)\.(tsx|jsx)$/)
      if (match) routes.add(`/${match[1].toLowerCase()}`)
    }
  }

  return [...routes].sort().slice(0, 30)
}

/**
 * A compact description of the project, for the system prompt.
 *
 * Returns "" for an empty project — a brand-new site has nothing to preserve,
 * and telling the model to match a design language that does not exist yet
 * would make a first generation timid.
 */
export function describeProject(files: ProjectFiles, assets: SiteAsset[] = []): string {
  const paths = Object.keys(files).sort()
  if (paths.length === 0) return ""

  const css = files[STYLES] ?? ""
  const tokens = designTokens(css)
  const fonts = fontFamilies(css)

  const sections: string[] = []

  /**
   * THE MAP REPLACED A LIST OF PATHS.
   *
   * A path list says a file exists and nothing else, so the only way to find
   * out what was in it was to read it — and every read is resent on every turn
   * that follows. The map answers what each file exports, what it imports and
   * who uses it, which is most of what those reads were being spent on.
   */
  sections.push(describeRepoMap(buildRepoMap(files)))

  // Non-source files are not in the map and some of them matter — the
  // stylesheet above all.
  const other = paths.filter((p) => !/\.(tsx|ts|jsx|js|mjs)$/.test(p))
  if (other.length) {
    sections.push(`Other files:\n${other.map((p) => `  ${p}`).join("\n")}`)
  }

  const pages = pageNames(files)
  if (pages.length) {
    sections.push(`Pages this site serves:\n  ${pages.join(", ")}`)
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

  /**
   * THE CREATOR'S OWN MEDIA, by the URL that actually serves it.
   *
   * Without this the model has no idea an upload happened, so it does what it
   * has always done and invents a stock photograph — and the creator watches
   * their own photo be ignored in favour of somebody else's. Listing the real
   * URLs is what turns "use the image I uploaded" into something the model can
   * actually carry out.
   */
  if (assets.length) {
    sections.push(
      `Media the creator has uploaded — use these URLs directly, and prefer them over any stock image:\n` +
        assets
          .slice(0, 40)
          .map((a) => `  ${a.name} (${a.mime}) → ${a.url}`)
          .join("\n"),
    )
  }

  return sections.join("\n\n")
}
