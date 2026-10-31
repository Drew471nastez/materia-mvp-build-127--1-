/**
 * ===========================================================================
 *  THE ERROR PAGES GO INTO EVERY SERVER FUNCTION (EVD-5)
 * ===========================================================================
 * Production: "Failed to load static file for page: /500 ENOENT" on /w
 * routes, 30 times since Sep 12. When a page fails during an ISR render (a
 * first visit after a deploy with the database away), Next's server answers
 * the error by loading pages-manifest's "/500" -> "pages/500.html"
 * (next/dist/server/base-server.js renderErrorToResponseImpl ->
 * next-server findPageComponents -> next/dist/server/require.js requirePage,
 * which reads the .html and throws MissingStaticPage when it is not there).
 *
 * Vercel builds each function from the `.nft.json` trace files. Next writes
 * every trace (each route's, next-server's and next-minimal-server's) when
 * the compile ends, BEFORE "Generating static pages" writes pages/500.html
 * and pages/404.html (measured on this build: traces at 21:24:22, 500.html
 * at 21:25:05). So no trace can name them, and outputFileTracingIncludes,
 * which is resolved against the files present when the traces are written,
 * matches nothing: that is why the include tried in wave 1 did not apply.
 *
 * This runs after `next build` and adds the static error pages named in
 * pages-manifest.json to every server trace, so a failing render reaches
 * Next's own error handling (and its real error is the one logged) instead
 * of a missing file. A few kilobytes per function. Idempotent; a build with
 * no such page (or no traces) is left as it is.
 *
 * Usage: node scripts/trace-error-pages.mjs [distDir]   (default .next)
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** Every trace a server function is built from: the routes' and the server's own. */
function traces(distDir) {
  const out = []
  for (const name of ["next-server.js.nft.json", "next-minimal-server.js.nft.json"]) {
    const p = join(distDir, name)
    if (existsSync(p)) out.push(p)
  }
  const walk = (dir) => {
    if (!existsSync(dir)) return
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (n.endsWith(".nft.json")) out.push(p)
    }
  }
  walk(join(distDir, "server"))
  return out
}

/** The static error pages pages-manifest.json sends a failing request to. */
export function errorPages(distDir) {
  const manifest = join(distDir, "server", "pages-manifest.json")
  if (!existsSync(manifest)) return []
  const pages = JSON.parse(readFileSync(manifest, "utf8"))
  return ["/500", "/404"]
    .map((route) => pages[route])
    .filter((file) => typeof file === "string" && file.endsWith(".html"))
    .map((file) => join(distDir, "server", file))
    .filter((file) => existsSync(file))
}

export function traceErrorPages(distDir = ".next") {
  const dist = resolve(distDir)
  const pages = errorPages(dist)
  let changed = 0
  const files = pages.length ? traces(dist) : []
  for (const trace of files) {
    const data = JSON.parse(readFileSync(trace, "utf8"))
    if (!Array.isArray(data.files)) continue
    const have = new Set(data.files)
    let added = false
    for (const page of pages) {
      const rel = relative(dirname(trace), page).split("\\").join("/")
      if (!have.has(rel)) {
        data.files.push(rel)
        added = true
      }
    }
    if (added) {
      writeFileSync(trace, JSON.stringify(data))
      changed++
    }
  }
  return { pages: pages.map((p) => relative(dist, p)), traces: files.length, changed }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = traceErrorPages(process.argv[2] ?? ".next")
  console.log(`error pages traced: ${r.pages.join(", ") || "none"} into ${r.changed} of ${r.traces} traces`)
}
