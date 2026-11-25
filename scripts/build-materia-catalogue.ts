/**
 * Writes lib/storelib-ai/materia/catalogue.generated.ts from theme-packages/materia (run for you by
 * scripts/build-materia-catalogue.mjs, a pre-step of `build`, `dev` and the push tests):
 * the sections, blocks and templates the AI website builder builds with
 * (lib/storelib-ai/materia/build.ts says what is kept). Run it after changing
 * a Materia section's schema, a template's pages or CODE_TEMPLATES:
 *
 *   node_modules/.bin/esbuild scripts/build-materia-catalogue.ts --bundle --platform=node \
 *     --format=esm --packages=external --alias:@=. --outfile=.tmp-test/materia.mjs && node .tmp-test/materia.mjs
 *
 * tests/ai-materia-catalogue.test.ts fails while the generated file is stale.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildMateriaCatalogue, catalogueModuleText } from "../lib/storelib-ai/materia/build"
import { readCatalogueInput } from "../lib/storelib-ai/materia/read-files"

const out = join(process.cwd(), "lib", "storelib-ai", "materia", "catalogue.generated.ts")
const catalogue = buildMateriaCatalogue(readCatalogueInput())
const text = catalogueModuleText(catalogue)
/* Written only when it changed, so a build or a test run that finds it current touches nothing. */
const same = existsSync(out) && readFileSync(out, "utf8") === text
if (!same) writeFileSync(out, text)
console.log(`Materia catalogue: ${catalogue.sections.length} sections, ${catalogue.blocks.length} blocks, ${catalogue.templates.length} templates, ${Math.round(text.length / 1024)} KB${same ? ", current" : ", written"}`)
