/**
 * ===========================================================================
 *  THE STYLESHEET A PROBE RENDERS WITH
 * ===========================================================================
 * The built one when there is a build, because that is what ships. When
 * there is none (a worktree, a machine another build is running on), the
 * same app/globals.css run through the same Tailwind plugin the build uses,
 * over the same sources: the same CSS for every class a probe sees, in under
 * a second instead of a full production build.
 *
 * PROBE_CSS=source forces the second path, for a build that is older than
 * the stylesheet being measured. `stylesheet` compiles another copy of
 * globals.css (an older commit's, to measure against this one) over this
 * checkout's sources.
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import { dirname, join } from "node:path"

export async function appCss(root = process.cwd(), stylesheet = null) {
  const built = join(root, ".next/static/chunks")
  if (!stylesheet && process.env.PROBE_CSS !== "source" && existsSync(built)) {
    const files = readdirSync(built).filter((f) => f.endsWith(".css"))
    if (files.length) return files.map((f) => readFileSync(join(built, f), "utf8")).join("\n")
  }
  const { default: postcss } = await import("postcss")
  const { default: tailwind } = await import("@tailwindcss/postcss")
  const from = stylesheet || join(root, "app/globals.css")
  const result = await postcss([tailwind({ base: root })]).process(readFileSync(from, "utf8"), { from: join(root, "app/globals.css") })
  return result.css
}

/** The same, under the name the editor probes import it by. */
export const probeCss = (root = process.cwd()) => appCss(root)

/**
 * Inter's @font-face rules from a production build, pointed at the font files
 * by absolute path, so a probe page measures text in the face that ships
 * rather than the container's one fallback (which is wider, and wraps lines
 * Inter does not). The build is this checkout's or, in a worktree whose
 * node_modules is a link, the main checkout's. Empty when there is none; the
 * probe then measures the fallback and says so.
 */
export function interFaces(root = process.cwd()) {
  if (process.env.PROBE_FONT === "fallback") return ""
  const candidates = [join(root, ".next")]
  try {
    candidates.push(join(dirname(realpathSync(join(root, "node_modules"))), ".next"))
  } catch {
    /* no node_modules link: this checkout's build only */
  }
  for (const next of candidates) {
    const chunks = join(next, "static/chunks")
    if (!existsSync(chunks)) continue
    const faces = readdirSync(chunks)
      .filter((f) => f.endsWith(".css"))
      .flatMap((f) => readFileSync(join(chunks, f), "utf8").match(/@font-face\{font-family:Inter;[^}]*\}/g) ?? [])
    if (faces.length) return faces.join("\n").replace(/url\(\.\.\/media\//g, `url(file://${join(next, "static/media")}/`)
  }
  return ""
}
