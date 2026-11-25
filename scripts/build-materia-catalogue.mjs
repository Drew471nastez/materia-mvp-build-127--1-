// Regenerate lib/storelib-ai/materia/catalogue.generated.ts from theme-packages/materia, so a template or section
// edit can never leave the AI builder's catalogue stale. A pre-step of `build`, `dev` and scripts/run-push-tests.mjs,
// like scripts/build-sql-catalog.mjs. The generator is TypeScript (scripts/build-materia-catalogue.ts): bundled with
// esbuild into a temporary file, run once, removed. It writes only when the catalogue changed.
import { createRequire } from "node:module"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const started = Date.now()
const { build } = createRequire(import.meta.url)("esbuild")
const out = join(tmpdir(), `storelib-materia-catalogue-${process.pid}.mjs`)
try {
  await build({
    entryPoints: ["scripts/build-materia-catalogue.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    alias: { "@": "." },
    outfile: out,
    logLevel: "error",
    banner: { js: "import {createRequire as __cr} from 'module';const require=__cr(import.meta.url);" },
  })
  await import(pathToFileURL(out).href)
} finally {
  rmSync(out, { force: true })
}
console.log(`Materia catalogue checked in ${Date.now() - started} ms`)
