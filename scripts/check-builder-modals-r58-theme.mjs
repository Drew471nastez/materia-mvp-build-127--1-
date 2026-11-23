// For scripts/check-builder-modals-r58.mjs: composes a Materia template the way Add does (lib/themes/template-packages.ts), imports it with the real importer, and writes the install's files to OUT.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
const root = process.cwd()
const { default: JSZip } = await import(join(root, "node_modules/jszip/lib/index.js"))
const OUT = process.env.OUT
const TEMPLATE = process.env.TEMPLATE ?? "materia/clothing"
const tmp = mkdtempSync(join(tmpdir(), "mat-"))
const bundle = (entry, name) => {
  const out = join(tmp, name)
  execFileSync(join(root, "node_modules/.bin/esbuild"), [join(root, entry), "--bundle", "--platform=node", "--format=esm", "--log-level=error", `--alias:@=${root}`, `--outfile=${out}`, "--banner:js=import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"], { stdio: ["ignore", "ignore", "inherit"], cwd: root })
  return out
}
const { convertShopifyTheme } = await import(bundle("lib/storelib-theme/shopify/convert.ts", "convert.mjs"))
const { composeTemplateZip } = await import(bundle("lib/themes/template-packages.ts", "tp.mjs"))
const zip = await JSZip.loadAsync(await composeTemplateZip(TEMPLATE))
const r = await convertShopifyTheme(zip)
if (!r.ok) throw new Error(r.error)
let n = 0
for (const [p, t] of Object.entries(r.theme.files)) {
  if (!(p.endsWith(".storelib") || p.startsWith("shopify/"))) continue
  const f = join(OUT, p)
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, t.startsWith("base64:") ? Buffer.from(t.slice(7), "base64") : t)
  n++
}
mkdirSync(join(OUT, "config"), { recursive: true })
writeFileSync(join(OUT, "config/settings.json"), JSON.stringify(r.theme.settings ?? {}))
console.log(r.theme.name, n, "files")
