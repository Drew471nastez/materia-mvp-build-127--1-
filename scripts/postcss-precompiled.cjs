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
const SOURCE = resolve(root, "app", "globals.css")
const COMPILED = join(root, ".next-css", "globals.css")

module.exports = () => ({
  postcssPlugin: "storelib-precompiled-css",
  Once(css, { result, postcss }) {
    const from = result.opts.from ? resolve(result.opts.from) : ""
    if (from !== SOURCE) return
    const compiled = postcss.parse(readFileSync(COMPILED, "utf8"), { from })
    css.removeAll()
    css.append(compiled.nodes)
  },
})
module.exports.postcss = true
