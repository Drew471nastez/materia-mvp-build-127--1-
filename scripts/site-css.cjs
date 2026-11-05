/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE'S STYLESHEET: THE SAME RULES, ITS OWN UTILITIES
 * ===========================================================================
 * app/globals.css is Storelib's whole stylesheet: about 150 KB of rules of
 * its own and 860 KB of Tailwind utilities, one for every class written
 * anywhere in the project (round 51 measured 1 MB raw, 138 KB gzip, render
 * blocking, on every page of every website). A website's pages use a small
 * part of those classes.
 *
 * app/site.css, the stylesheet of app/(site)'s own root layout, is built
 * from the same source with one change: Tailwind writes utilities only for
 * the classes in the files a website's pages import (siteSources below:
 * every page, layout and boundary under app/(site), and everything they
 * import, followed with esbuild). Storelib's own rules, its theme variables
 * and its base layer are the same text, so nothing a website draws looks
 * different; a class in a file no website imports is simply not there.
 *
 * Used twice:
 *   - postcss.config.mjs, for every compile but the production build's
 *     (`next dev`, the render checks): app/site.css is replaced with that
 *     source before Tailwind reads it (the plugin below);
 *   - scripts/build-css.mjs, before `next build`, which compiles it once
 *     into .next-css/site.css (scripts/postcss-precompiled.cjs hands it over).
 *
 * app/site.css itself only imports app/globals.css, so a compile that skips
 * all of this still draws every website correctly, with the whole sheet.
 */
const { readFileSync, readdirSync, statSync } = require("node:fs")
const { join, relative, resolve, sep } = require("node:path")

const SITE_ROUTES = join("app", "(site)")
const ENTRY = /^(page|layout|not-found|error|loading|template|route|default)\.(tsx?|jsx?)$/
const SCANNED = /\.(tsx?|jsx?|mjs|cjs)$/

function entries(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) entries(p, out)
    else if (ENTRY.test(name)) out.push(p)
  }
  return out
}

/** Every source file a website's pages import, relative to the project root, sorted. */
function siteSources(root = process.cwd()) {
  const esbuild = require("esbuild")
  const result = esbuild.buildSync({
    entryPoints: entries(join(root, SITE_ROUTES)),
    absWorkingDir: root,
    bundle: true,
    write: false,
    metafile: true,
    splitting: true,
    format: "esm",
    outdir: join(root, ".next-css", "site-scan"),
    platform: "neutral",
    packages: "external",
    tsconfig: join(root, "tsconfig.json"),
    jsx: "automatic",
    logLevel: "silent",
    loader: { ".css": "empty", ".png": "empty", ".jpg": "empty", ".svg": "empty", ".webp": "empty", ".woff2": "empty", ".woff": "empty", ".ico": "empty", ".txt": "empty", ".liquid": "text", ".md": "text" },
  })
  return Object.keys(result.metafile.inputs)
    .filter((p) => SCANNED.test(p) && !p.includes("node_modules"))
    .map((p) => relative(root, resolve(root, p)).split(sep).join("/"))
    .sort()
}

/** app/globals.css with Tailwind told to read only `sources` (paths from the project root). */
function siteCssSource(root = process.cwd(), sources = siteSources(root)) {
  const globals = readFileSync(join(root, "app", "globals.css"), "utf8")
  const head = '@import "tailwindcss";'
  if (!globals.startsWith(head)) throw new Error(`app/globals.css must start with ${head}`)
  const lines = sources.map((p) => `@source "../${p}";`).join("\n")
  return `@import "tailwindcss" source(none);\n${lines}\n${globals.slice(head.length)}`
}

/** The PostCSS plugin: app/site.css becomes siteCssSource(), for Tailwind to compile next. */
function plugin() {
  return {
    postcssPlugin: "storelib-site-css",
    Once(css, { result, postcss }) {
      const root = process.cwd()
      const from = result.opts.from ? resolve(result.opts.from) : ""
      if (from !== join(root, "app", "site.css")) return
      const source = postcss.parse(siteCssSource(root), { from })
      css.removeAll()
      css.append(source.nodes)
    },
  }
}
plugin.postcss = true

module.exports = plugin
module.exports.siteSources = siteSources
module.exports.siteCssSource = siteCssSource
