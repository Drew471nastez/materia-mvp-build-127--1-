#!/usr/bin/env node
/**
 * Build the Sites editor's runtime assets out of node_modules into
 * public/: esbuild's WebAssembly binary, and Monaco.
 *
 * BOTH ARE SELF-HOSTED ON PURPOSE. @monaco-editor/react loads Monaco from
 * jsDelivr by default and esbuild-wasm's docs point at unpkg, and either
 * default makes "can this person edit their website today" depend on a CDN
 * neither we nor they control. Neither is an enhancement that degrades: without
 * the wasm there is no preview, and without Monaco there is no code tab.
 *
 * They are copied rather than imported because both are megabytes of binary and
 * worker code that must NOT go through the app's bundler — Monaco alone is
 * ~5MB, for a route most people using Storelib never open.
 *
 * The third asset is the bundler worker itself, compiled here rather than by
 * Next. `new Worker(new URL("./bundler.worker.ts", import.meta.url))` is the
 * documented pattern and it BUILDS FINE — then throws
 * `TypeError: Failed to construct 'URL': Invalid URL` in the browser, because
 * `import.meta.url` is empty in the production client chunk. It failed only in
 * a real browser against a production build, which is the one place it matters.
 *
 * Runs before `next build` and `next dev`. Every output is gitignored;
 * regenerate with
 *
 *     node scripts/build-sites-assets.mjs
 */
import { cpSync, copyFileSync, mkdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)

const source = join(dirname(require.resolve("esbuild-wasm/package.json")), "esbuild.wasm")
const targetDir = join(ROOT, "public/sites")
const target = join(targetDir, "esbuild.wasm")

mkdirSync(targetDir, { recursive: true })
copyFileSync(source, target)
console.log(`copied esbuild.wasm (${(statSync(target).size / 1e6).toFixed(1)}MB) to public/sites/`)

// Monaco's AMD build. `min/vs` is the whole loader + editor + language workers,
// and @monaco-editor/react is pointed at it in components/sites/editor/code-pane.tsx.
const monacoSource = join(dirname(require.resolve("monaco-editor/package.json")), "min/vs")
const monacoTarget = join(ROOT, "public/sites/monaco/vs")
cpSync(monacoSource, monacoTarget, { recursive: true })
console.log("copied monaco-editor min/vs to public/sites/monaco/")

/**
 * The bundler worker, compiled with esbuild-wasm's Node API — the same package
 * the worker itself runs in the browser, so there is no second bundler and no
 * new dependency to hold a version of.
 *
 * IIFE, not ESM: a classic worker needs no `{ type: "module" }` and works the
 * same in every browser Storelib supports, and the worker imports nothing at
 * runtime that a module graph would have to resolve.
 */
const esbuild = await import("esbuild-wasm")
await esbuild.initialize({ wasmURL: undefined, worker: false }).catch(() => {})
const built = await esbuild.build({
  entryPoints: [join(ROOT, "components/sites/editor/bundler.worker.ts")],
  outfile: join(targetDir, "bundler-worker.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  // The `@/` the rest of the app uses. Without it the worker's imports of
  // lib/sites/module-graph resolve to nothing and the build fails loudly here
  // rather than quietly in someone's browser.
  alias: { "@": ROOT },
  logLevel: "warning",
})
if (built.errors.length > 0) {
  console.error(built.errors)
  process.exit(1)
}
console.log(`built bundler-worker.js (${(statSync(join(targetDir, "bundler-worker.js")).size / 1e3).toFixed(0)}KB)`)

/**
 * React, as ESM, for the preview's import map.
 *
 * The obvious answer is esm.sh, and it is the wrong one for the same reason as
 * Monaco and the wasm: whether a creator can see their own website today
 * should not depend on a CDN we do not control. It is also unverifiable — the
 * preview cannot be tested anywhere without egress to a third party.
 *
 * React 19 ships CommonJS, and esbuild converting CJS to ESM gives a default
 * export and no named ones — `import { useState } from "react"` would break.
 * So the re-export list is DERIVED from the installed package by requiring it
 * here and reading its keys. Generated, not typed out: a hand-written list of
 * React's exports is wrong the first time React adds a hook, and wrong
 * silently.
 */
const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const RESERVED = new Set(["default", "__esModule"])

function esmShimFor(specifier) {
  const names = Object.keys(require(specifier))
    .filter((n) => identifier.test(n) && !RESERVED.has(n))
    .sort()
  return `import m from ${JSON.stringify(specifier)}\n` +
    `export const { ${names.join(", ")} } = m\n` +
    "export default m\n"
}

/**
 * Mark the bare specifier `react` external — and ONLY that one.
 *
 * `external: ["react"]` looks equivalent and is not: esbuild treats it as a
 * prefix, so it also externalised `react/jsx-runtime` while that WAS the entry
 * point. The result was a 123-byte file importing "react/jsx-runtime", which
 * the preview's import map resolves to that same file — a module that imports
 * itself and exports nothing.
 */
const onlyReactExternal = {
  name: "only-react-external",
  setup(build) {
    build.onResolve({ filter: /^react$/ }, (args) =>
      args.kind === "entry-point" ? null : { path: "react", external: true },
    )
  },
}

/**
 * React's CJS calls `require("react")` internally. esbuild wraps CJS modules
 * and rewrites that to `__require`, whose ESM fallback throws
 * "Dynamic require of react is not supported" — at runtime, in the frame, with
 * a preview that had built perfectly.
 *
 * esbuild's own `__require` helper prefers a `require` already in scope, and a
 * banner lands above the helpers, so defining one here is what makes it resolve
 * to the module the import map serves rather than to a thrower.
 */
const CJS_INTEROP = [
  'import * as __reactNamespace from "react";',
  "var require = (id) => {",
  '  if (id === "react") return __reactNamespace.default ?? __reactNamespace;',
  '  throw new Error("Sites cannot require " + id);',
  "};",
].join("\n")

const vendorDir = join(targetDir, "vendor")
mkdirSync(vendorDir, { recursive: true })

for (const [specifier, file] of [
  ["react", "react.js"],
  ["react/jsx-runtime", "react-jsx-runtime.js"],
  ["react/jsx-dev-runtime", "react-jsx-dev-runtime.js"],
  ["react-dom", "react-dom.js"],
  ["react-dom/client", "react-dom-client.js"],
]) {
  const isReactItself = specifier === "react"
  const result = await esbuild.build({
    stdin: {
      contents: esmShimFor(specifier),
      resolveDir: ROOT,
      loader: "js",
      sourcefile: `${specifier}-shim.js`,
    },
    outfile: join(vendorDir, file),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: true,
    /**
     * React is external in everything but its own bundle, so react-dom and the
     * jsx runtimes get the SAME module instance the import map serves. Two
     * copies of React in one page is the "invalid hook call" nobody can debug.
     */
    plugins: isReactItself ? [] : [onlyReactExternal],
    banner: isReactItself ? undefined : { js: CJS_INTEROP },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  })
  if (result.errors.length > 0) {
    console.error(result.errors)
    process.exit(1)
  }
}
console.log("built react/react-dom ESM for the preview import map")
