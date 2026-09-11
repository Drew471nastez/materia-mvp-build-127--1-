/**
 * Writes lib/storelib-theme/controls/storelib-controls.json and
 * docs/theme/05-controls-reference.md from the registry, so the AI, the
 * editor and the docs read one source that cannot disagree with the code.
 * tests/storelib-theme.test.ts fails if either file on disk is not what this
 * would write.
 *
 *   npx tsx scripts/emit-controls.ts
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { controlsAsJson, controlsAsMarkdown } from "../lib/storelib-theme/controls/registry"

const out = join(process.cwd(), "lib/storelib-theme/controls/storelib-controls.json")
writeFileSync(out, JSON.stringify(controlsAsJson(), null, 2) + "\n")
console.log(`wrote ${out}`)

const doc = join(process.cwd(), "docs/theme/05-controls-reference.md")
writeFileSync(doc, controlsAsMarkdown())
console.log(`wrote ${doc}`)
