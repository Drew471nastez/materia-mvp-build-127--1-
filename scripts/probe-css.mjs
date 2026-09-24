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
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

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
