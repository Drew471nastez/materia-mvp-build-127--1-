/**
 * ===========================================================================
 *  ROUND 39, MEASURED: THE JAVASCRIPT A COMMUNITY PAGE LOADS FIRST
 * ===========================================================================
 * The member frame's client code (components/community/member/shell-frame.tsx
 * and everything it imports, which is what the community's layout hydrates
 * on every page; place-views.tsx loads each place but the feed as a chunk of
 * its own) bundled the way the browser gets it: minified, split at every
 * dynamic import(), React and the rest of node_modules included. Prints the
 * first load (the entry chunk, gzipped) and the heaviest modules in it, so
 * a piece that should load on demand (the chat, the emoji picker, a video
 * player, a lightbox) and does not is plain to see.
 *
 * Not Next's own chunking (no build here): the shared framework chunk is in
 * these numbers too, the same for every page, so read them as a comparison
 * between two versions of this code, not as the bytes a phone downloads.
 *
 *   node scripts/measure-community-js-r39.mjs [--top=25]
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { gzipSync } from "node:zlib"
import { build } from "esbuild"

const root = process.cwd()
const TOP = Number((process.argv.find((a) => a.startsWith("--top=")) || "--top=25").slice(6))
let up = root
while (!existsSync(join(up, "node_modules")) && dirname(up) !== up) up = dirname(up)
const out = join(root, ".community-js-r39-probe")
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "navigation.js"), "export const usePathname = () => '/'\nexport const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })\nexport const useSearchParams = () => new URLSearchParams()\nexport const redirect = () => {}\nexport const notFound = () => {}\n")
writeFileSync(join(out, "entry.tsx"), `import { ShellFrame } from "@/components/community/member/shell-frame"
import { PlaceSeed } from "@/components/community/member/place-host"
import { MediaLinks } from "@/components/community/member/media-viewer"
export { ShellFrame, PlaceSeed, MediaLinks }
`)
try {
  const result = await build({
    entryPoints: [join(out, "entry.tsx")],
    bundle: true,
    splitting: true,
    format: "esm",
    minify: true,
    metafile: true,
    jsx: "automatic",
    outdir: join(out, "dist"),
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-js-r39-probe/navigation.js" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(up, "node_modules")],
    external: ["server-only"],
  })
  const outputs = result.metafile.outputs
  const entryKey = Object.keys(outputs).find((k) => outputs[k].entryPoint?.endsWith("entry.tsx"))
  const entry = outputs[entryKey]
  /* What the entry needs before it runs: itself and every chunk it imports statically, transitively. */
  const first = new Set()
  const walk = (k) => {
    if (first.has(k)) return
    first.add(k)
    for (const imp of outputs[k].imports) if (imp.kind === "import-statement") walk(imp.path)
  }
  walk(entryKey)
  const bytes = (k) => readFileSync(join(root, k))
  const firstRaw = [...first].reduce((n, k) => n + bytes(k).length, 0)
  const firstGz = [...first].reduce((n, k) => n + gzipSync(bytes(k)).length, 0)
  const lazy = Object.keys(outputs).filter((k) => k.endsWith(".js") && !first.has(k))
  const lazyGz = lazy.reduce((n, k) => n + gzipSync(bytes(k)).length, 0)
  console.log(`\nfirst load: ${(firstRaw / 1024).toFixed(0)} KB minified, ${(firstGz / 1024).toFixed(0)} KB gzipped, in ${first.size} chunks`)
  console.log(`on demand:  ${(lazyGz / 1024).toFixed(0)} KB gzipped in ${lazy.length} chunks`)
  /* The heaviest modules in the first load, by their minified bytes, grouped by package or folder. */
  const sizes = new Map()
  for (const k of first) for (const [path, info] of Object.entries(outputs[k].inputs)) {
    const m = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/.exec(path)
    const key = m ? `npm:${m[1]}` : path.replace(/^\.\//, "")
    sizes.set(key, (sizes.get(key) ?? 0) + info.bytesInOutput)
  }
  console.log(`\nheaviest in the first load (minified KB):`)
  for (const [k, v] of [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log(`  ${(v / 1024).toFixed(1).padStart(7)}  ${k}`)
  if (process.env.JSON_OUT) writeFileSync(process.env.JSON_OUT, JSON.stringify({ firstRaw, firstGz, lazyGz, top: [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80) }, null, 2))
  void entry
} finally {
  rmSync(out, { recursive: true, force: true })
}
