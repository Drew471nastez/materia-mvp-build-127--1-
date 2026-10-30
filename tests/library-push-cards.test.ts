/**
 * ADD A SECTION KEEPS A PUSHED SECTION'S CARD, IMPORTED THEME.
 *
 * scripts/check-library-preview-placement.mjs saw 7 cards become 4 after a
 * push of 3 section files. The probe wrote `<i data-push></i></template>` on
 * one line; a closing tag counts only when it starts a line, so each file was
 * one whose template never closes. The editor could not read its schema and
 * left it out of the library (customSectionSchemas), as it does any file that
 * does not read, and the files route refuses such a file, so no real push
 * lands one. A push the server keeps keeps its card.
 *
 * Measured in the editor by scripts/check-library-push-cards.mjs.
 *
 * Run with:  npm run test:push
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { customAddableSections, customSectionSchemas, schemaFromStorelib } from "@/lib/website-builder/storelib-schemas"
import { compatBlockTypes, compatFileErrors, syncCompatFile } from "@/lib/storelib-theme/compat/schema-sync"
import { compatSchemaWords, convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { splitCompatFile } from "@/lib/storelib-theme/compat/theme"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function materia(): Promise<Record<string, string>> {
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-materia")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the Materia fixture did not convert")
  return r.theme.files
}

async function main() {
  const all = await materia()
  const sources = Object.fromEntries(Object.entries(all).filter(([p]) => p.endsWith(".storelib")))
  const ctx = { tr: compatSchemaWords(Object.fromEntries(Object.entries(all).filter(([p]) => p.startsWith("shopify/locales/")))), blockTypes: compatBlockTypes(Object.keys(all)) }
  /* What the files route keeps of a pushed file (lib/website-builder/save-theme-file.ts), or null when it refuses it. */
  const kept = (path: string, text: string): string | null => {
    const synced = syncCompatFile(path, text, sources[path], ctx)
    if (synced.ok === false) return null
    return compatFileErrors(path, synced.source).length ? null : synced.source
  }
  const { withMarkup } = (await import("../scripts/canvas-probe-kit.mjs")) as { withMarkup: (s: string, html: string) => string }
  const addable = customAddableSections(customSectionSchemas(sources))
  const pushed = ["sections/image-text.storelib", "sections/rich-text.storelib", "sections/slideshow.storelib"].filter((p) => p in sources)
  check("the fixture has the sections pushed", pushed.length === 3 && pushed.every((p) => addable.includes(p.slice(9, -9))), { addable })

  console.log("\nA push that only changes markup keeps every card")
  {
    const patch = Object.fromEntries(pushed.map((p) => [p, kept(p, withMarkup(sources[p], '<i data-push="1"></i>'))]))
    check("the server keeps each file", Object.values(patch).every((t) => typeof t === "string"))
    const next = { ...sources, ...(patch as Record<string, string>) }
    const after = customAddableSections(customSectionSchemas(next))
    check("the library offers the same sections", after.join() === addable.join(), { before: addable, after })
    check("each pushed file has the mark in its markup", pushed.every((p) => splitCompatFile(next[p]).markup.includes('data-push="1"')))
  }

  console.log("\nA push that changes a section's schema renames its card and adds a preset's")
  {
    const change = (p: string, edit: (s: Record<string, unknown>) => Record<string, unknown>) => {
      const { schema } = splitCompatFile(sources[p])
      const next = { ...schema, shopify: edit(structuredClone((schema as { shopify: Record<string, unknown> }).shopify)) }
      return kept(p, sources[p].replace(/<schema>[\s\S]*?<\/schema>/, () => `<schema>\n${JSON.stringify(next, null, 2)}\n</schema>`))
    }
    const renamed = change("sections/image-text.storelib", (s) => ({ ...s, name: "Image beside text", presets: [{ ...(s.presets as object[])[0], name: "Image beside text" }] }))
    const more = change("sections/rich-text.storelib", (s) => ({ ...s, presets: [...(s.presets as object[]), { name: "Rich text, short" }] }))
    check("the server keeps both", typeof renamed === "string" && typeof more === "string")
    const schemas = customSectionSchemas({ ...sources, "sections/image-text.storelib": renamed!, "sections/rich-text.storelib": more! })
    check("the renamed section is still offered, under its new name", customAddableSections(schemas).join() === addable.join() && schemas["image-text"]?.name === "Image beside text", schemas["image-text"]?.name)
    check("the new preset is there", (schemas["rich-text"]?.presets ?? []).map((x) => x.name).includes("Rich text, short"), schemas["rich-text"]?.presets)
  }

  console.log("\nThe probe's old edit was a file no push lands")
  {
    const p = "sections/image-text.storelib"
    const oneLine = sources[p].replace("</template>", '<i data-push="1"></i></template>')
    check("its template never closes, so its schema does not read and its card goes", schemaFromStorelib(oneLine, p).ok === false && !customAddableSections(customSectionSchemas({ ...sources, [p]: oneLine })).includes("image-text"))
    check("the files route refuses it", kept(p, oneLine) === null)
    check("withMarkup puts the mark on its own line, and that file reads", schemaFromStorelib(withMarkup(sources[p], "<i></i>"), p).ok === true && /\n<i><\/i>\n<\/template>/.test(withMarkup(sources[p], "<i></i>")))
    const sameLine = /\.replace\("<\/template>", `[^`]*<\/template>`\)/
    /* check-library-push-cards.mjs plays the old edit on purpose, as its control case. */
    const offenders = readdirSync(join(process.cwd(), "scripts")).filter((f) => /\.m?[jt]s$/.test(f) && f !== "check-library-push-cards.mjs" && sameLine.test(read(`scripts/${f}`)))
    check("no probe pushes a file with </template> after other markup on its line", offenders.length === 0, offenders)
  }
  check("this suite runs with the others", read("scripts/run-push-tests.mjs").includes('"tests/library-push-cards.test.ts"'))
}

void main().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})
