/**
 * How one file in a project finds another.
 *
 * esbuild-wasm in the browser has no filesystem, so every import is resolved by
 * a plugin — this module is that plugin's brain, kept separate from it because
 * the plugin can only be exercised with a WebAssembly runtime and a worker, and
 * the rules below are exactly the part that is easy to get subtly wrong.
 *
 * The rules are Vite's, narrowed to what a project here can contain. Narrowed
 * deliberately: a resolver that supports more than the projects it will ever see
 * is a resolver whose extra branches are never exercised and quietly rot.
 */

import type { ProjectFiles } from "./types"

/**
 * What is NOT bundled, because it arrives through the preview's import map.
 *
 * The dependency set is fixed — that is the trade the in-browser bundler asks
 * for (docs/storelib-sites.md §2). A bare specifier outside this list is an
 * error the author can act on, not a silent 404 at runtime: "react-router is
 * not available yet" is a sentence; a blank preview is not.
 */
export const EXTERNAL_MODULES = [
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom",
  "react-dom/client",
] as const

/** Tried in order, so a `.tsx` beats a `.ts` beats a `.js` at the same path. */
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json"]

/** Where the app starts. The scaffold's index.html points at the first of these. */
const ENTRY_CANDIDATES = ["src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js", "src/index.tsx"]

export function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/")
}

export function isExternal(specifier: string): boolean {
  return (EXTERNAL_MODULES as readonly string[]).includes(specifier)
}

/**
 * `a/b/../c` → `a/c`, and a leading `/` is dropped.
 *
 * Written out rather than reached for through a Node path module: this runs in
 * a web worker, where `node:path` is not there, and a bundler shim for it is a
 * dependency to serve four lines of logic.
 */
export function normalizePath(path: string): string {
  const out: string[] = []
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") out.pop()
    else out.push(part)
  }
  return out.join("/")
}

export function dirname(path: string): string {
  const at = path.lastIndexOf("/")
  return at === -1 ? "" : path.slice(0, at)
}

/**
 * The file a specifier means, or null.
 *
 * Null is a real answer and the caller must surface it. An unresolved import
 * that silently becomes an empty module produces a page that renders nothing
 * with no error anywhere — the single worst outcome for someone who just asked
 * the AI to add a section.
 */
export function resolveSpecifier(
  specifier: string,
  importer: string,
  files: ProjectFiles,
): string | null {
  if (isBareSpecifier(specifier)) return null

  const base = specifier.startsWith("/") ? specifier : `${dirname(importer)}/${specifier}`
  const target = normalizePath(base)
  if (!target) return null

  // An explicit extension is taken at its word — `./styles.css` must not
  // silently resolve to `./styles.css.ts`.
  if (files[target] !== undefined) return target

  for (const ext of EXTENSIONS) {
    if (files[target + ext] !== undefined) return target + ext
  }
  for (const ext of EXTENSIONS) {
    if (files[`${target}/index${ext}`] !== undefined) return `${target}/index${ext}`
  }
  return null
}

/** esbuild's loader for a path, by extension. */
export function loaderFor(path: string): "tsx" | "ts" | "jsx" | "js" | "css" | "json" | "text" {
  if (path.endsWith(".tsx")) return "tsx"
  if (path.endsWith(".ts")) return "ts"
  if (path.endsWith(".jsx")) return "jsx"
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".json")) return "json"
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "js"
  return "text"
}

/**
 * The project's entry point.
 *
 * Read from index.html when it says, because that is where a Vite project
 * declares it and an author who moves their entry expects the html to be what
 * decides. The candidate list is the fallback for an index.html that has been
 * edited into something this cannot parse — a project should still build.
 */
export function entryPoint(files: ProjectFiles): string | null {
  const html = files["index.html"]
  if (html) {
    const match = html.match(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/i)
    if (match) {
      const declared = normalizePath(match[1])
      if (files[declared] !== undefined) return declared
    }
  }
  for (const candidate of ENTRY_CANDIDATES) {
    if (files[candidate] !== undefined) return candidate
  }
  return null
}

/**
 * Every import in a file, as written.
 *
 * Used to tell an author which import failed BEFORE handing the project to
 * esbuild, so an unavailable dependency reads as "react-router is not available
 * yet" instead of as a build error mentioning a virtual filesystem.
 *
 * A regex, not a parse. It over-matches inside strings and comments, which for
 * this purpose is the safe direction: naming an import that turns out to be in
 * a comment is a worse message, never a broken build, and the alternative is
 * carrying a JS parser to produce a warning.
 */
export function importedSpecifiers(source: string): string[] {
  const found = new Set<string>()
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.add(match[1])
  }
  return [...found]
}

/**
 * Every file the entry point can actually reach, following relative imports.
 *
 * THIS IS NOT AN OPTIMISATION. A project is a Vite project on disk, so it
 * contains `vite.config.ts` — which imports `vite` and `@vitejs/plugin-react`,
 * neither of which the preview can supply. Checking every file in the project
 * meant the STARTER ITSELF reported two unavailable dependencies and refused to
 * build, before the author had typed anything. Those files are build config;
 * they are never part of the bundle, and their imports are not the preview's
 * business.
 *
 * Found by running the editor, not by reading it.
 */
export function reachableFiles(files: ProjectFiles): string[] {
  const entry = entryPoint(files)
  if (!entry) return []

  const seen = new Set<string>([entry])
  const queue = [entry]

  while (queue.length > 0) {
    const path = queue.pop() as string
    const source = files[path]
    if (!source) continue
    for (const specifier of importedSpecifiers(source)) {
      if (isBareSpecifier(specifier)) continue
      const resolved = resolveSpecifier(specifier, path, files)
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved)
        queue.push(resolved)
      }
    }
  }
  return [...seen]
}

/**
 * The bare imports the bundle needs that the preview cannot supply.
 *
 * Reported as its own kind of problem rather than left to esbuild, because
 * esbuild's answer ("Could not resolve …") describes a filesystem the author
 * does not have and cannot fix.
 */
export function unavailableDependencies(files: ProjectFiles): string[] {
  const missing = new Set<string>()
  for (const path of reachableFiles(files)) {
    if (!/\.(tsx?|jsx?|mjs)$/.test(path)) continue
    for (const specifier of importedSpecifiers(files[path] ?? "")) {
      if (!isBareSpecifier(specifier)) continue
      if (isExternal(specifier)) continue
      missing.add(specifier)
    }
  }
  return [...missing].sort()
}
