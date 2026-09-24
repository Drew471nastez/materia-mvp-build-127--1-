/**
 * ===========================================================================
 *  THE STYLESHEET A PROBE RENDERS WITH
 * ===========================================================================
 * The built one when there is a build, because that is what ships. When
 * there is none, the same app/globals.css run through the same Tailwind
 * plugin the build uses, which takes under a second instead of a full
 * production build. A worktree has no build, and a probe that refuses to run
 * without one is a probe nobody runs there.
 *
 * PROBE_CSS=source forces the second path, for a build that is older than
 * the stylesheet being measured.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

export async function probeCss(root = process.cwd()) {
  const built = join(root, ".next/static/chunks")
  if (process.env.PROBE_CSS !== "source" && existsSync(built)) {
    const files = readdirSync(built).filter((f) => f.endsWith(".css"))
    if (files.length) return files.map((f) => readFileSync(join(built, f), "utf8")).join("\n")
  }
  const { default: postcss } = await import("postcss")
  const { default: tailwind } = await import("@tailwindcss/postcss")
  const from = join(root, "app/globals.css")
  const result = await postcss([tailwind({ base: root })]).process(readFileSync(from, "utf8"), { from })
  return result.css
}
