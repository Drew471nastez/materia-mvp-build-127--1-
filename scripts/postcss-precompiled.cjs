/**
 * For `next build` only (postcss.config.mjs, when scripts/build-next.mjs sets
 * STORELIB_CSS_PRECOMPILED=1): app/globals.css becomes the stylesheet
 * scripts/build-css.mjs already compiled with Tailwind, in its own process
 * that has ended. Every other stylesheet passes through untouched, as it did
 * through Tailwind's plugin, which only acts on its own directives. No
 * Tailwind is loaded in the build's PostCSS worker. See scripts/build-css.mjs.
 */
const { readFileSync } = require("node:fs")
const { join, resolve } = require("node:path")

const root = process.cwd()
/* Each source and what scripts/build-css.mjs compiled it to: Storelib's stylesheet, and a published website's (scripts/site-css.cjs). */
const COMPILED = new Map([
  [resolve(root, "app", "globals.css"), join(root, ".next-css", "globals.css")],
  [resolve(root, "app", "site.css"), join(root, ".next-css", "site.css")],
])

module.exports = () => ({
  postcssPlugin: "storelib-precompiled-css",
  Once(css, { result, postcss }) {
    const from = result.opts.from ? resolve(result.opts.from) : ""
    const file = COMPILED.get(from)
    if (!file) return
    const compiled = postcss.parse(readFileSync(file, "utf8"), { from })
    css.removeAll()
    css.append(compiled.nodes)
  },
})
module.exports.postcss = true
