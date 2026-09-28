/**
 * ===========================================================================
 *  WHAT THE PRODUCT EDITOR'S FIRST PAINT HAS TO CARRY
 * ===========================================================================
 * "It takes so much time to load a product edit page." Part of that time is
 * the code: the route's client bundle has to arrive, parse and hydrate before
 * a field can be typed in. This bundles the editor the way the build does
 * (esbuild, minified, production React left out as a shared chunk would leave
 * it) and prints what is in it, biggest first, so a thing that could be
 * deferred can be named and measured rather than guessed at.
 *
 *   node scripts/check-editor-weight.mjs
 *   node scripts/check-editor-weight.mjs 20        (twenty entries)
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = process.cwd()
const top = Number(process.argv[2] ?? 14)
const stubs = mkdtempSync(join(tmpdir(), "storelib-editor-weight-"))
writeFileSync(join(stubs, "entry.tsx"), `export { ProductEditor } from "@/app/app/products/new/product-editor"\n`)
writeFileSync(join(stubs, "list.tsx"), `export { ProductsClient } from "@/app/app/products/products-client"\n`)

const { build } = await import("esbuild")
const external = ["react", "react-dom", "react/jsx-runtime", "next/navigation", "next/link", "next/image", "server-only"]

async function weigh(entry) {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "esm",
    jsx: "automatic",
    metafile: true,
    write: false,
    external,
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": "." },
    loader: { ".css": "empty" },
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    logLevel: "error",
    plugins: [
      {
        /* A "use server" file is a reference in the browser, not code: the
           build ships the call, not what it calls. Counting it here made the
           description's server side (sanitize-html and its parser, 60 KB)
           look like part of the editor's own weight. */
        name: "server-actions-are-references",
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, (args) => {
            if (args.path.includes("node_modules")) return null
            const text = readFileSync(args.path, "utf8")
            if (!/^\s*(["'])use server\1/.test(text)) return null
            const names = [...text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1])
            return { contents: names.map((n) => `export const ${n} = () => {}`).join("\n"), loader: "js" }
          })
        },
      },
    ],
  })
  const meta = Object.values(out.metafile.outputs)[0]
  const parts = Object.entries(meta.inputs)
    .map(([file, v]) => ({ file, kb: +(v.bytesInOutput / 1024).toFixed(1) }))
    .sort((a, b) => b.kb - a.kb)
  return { kb: +(meta.bytes / 1024).toFixed(1), parts }
}

const editor = await weigh(join(stubs, "entry.tsx"))
const list = await weigh(join(stubs, "list.tsx"))
console.log(`\nthe editor, minified: ${editor.kb} KB   (the Products list, for scale: ${list.kb} KB)\n`)
for (const p of editor.parts.slice(0, top)) console.log(`  ${String(p.kb).padStart(7)} KB  ${p.file}`)
const rest = editor.parts.slice(top).reduce((n, p) => n + p.kb, 0)
console.log(`  ${String(+rest.toFixed(1)).padStart(7)} KB  everything else (${editor.parts.length - top} files)`)
