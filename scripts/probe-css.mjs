/**
 * THE APP'S CSS FOR A PROBE, WITH OR WITHOUT A BUILD.
 *
 * The render probes paint real markup and need the real stylesheet. They
 * read it from `.next/static/chunks` after `pnpm build`; when there is no
 * build (a worktree, a machine another build is running on), this compiles
 * app/globals.css with the same Tailwind PostCSS plugin the build uses, over
 * the same sources, which is the same CSS for every class the probes see.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

export async function appCss(root = process.cwd()) {
  const built = join(root, ".next/static/chunks")
  if (existsSync(built)) {
    const files = readdirSync(built).filter((f) => f.endsWith(".css"))
    if (files.length) return files.map((f) => readFileSync(join(built, f), "utf8")).join("\n")
  }
  const postcss = (await import("postcss")).default
  const tailwind = (await import("@tailwindcss/postcss")).default
  const from = join(root, "app/globals.css")
  const out = await postcss([tailwind({ base: root })]).process(readFileSync(from, "utf8"), { from })
  return out.css
}
