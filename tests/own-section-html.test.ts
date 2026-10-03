/**
 * ===========================================================================
 *  A RICH TEXT SETTING ON A SECTION THE THEME DOES NOT SHIP
 * ===========================================================================
 * The cleaner learned which settings hold HTML from the theme's registry, and
 * for any other section type it fell back to nine setting ids. A section a
 * creator wrote, or one an imported theme brought with it, could declare a
 * richtext setting under any other id (`promo_text` below), print it with
 * `raw`, and whatever the page data held reached the live storefront as
 * written. A shared theme is a stranger's page data.
 *
 * Now the schema comes from the install's own file, on the way in through an
 * import and through the editor's save, and `raw` looks at what it draws. The
 * rich text somebody actually writes goes through both unchanged.
 *
 * Run with:  pnpm test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { buildPackage, compileSection, readPackage, renderSection, sectionsFromTemplate } from "../lib/storelib-theme"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { ownSectionFields, readOwnSectionFields, sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** A section nobody at Storelib wrote, with rich text under an id the old list never knew. */
const PROMO = `<template>
<section class="promo">
  <h2>{{ settings.heading }}</h2>
  <div class="promo__text">{{ settings.promo_text | raw }}</div>
  {% for block in blocks %}<div class="promo__note">{{ block.settings.note | raw }}</div>{% endfor %}
</section>
</template>

<style>
.promo { padding: 24px; }
</style>

<schema>
{
  "type": "promo",
  "name": "Promo",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading" },
    { "type": "richtext", "id": "promo_text", "label": "Promo text" }
  ],
  "blocks": [
    { "type": "note", "name": "Note", "settings": [{ "type": "richtext", "id": "note", "label": "Note" }] }
  ],
  "presets": [{ "name": "Promo" }]
}
</schema>
`

const HOSTILE = `<p>Sale today</p><script>alert(1)</script><img src=x onerror=alert(1)>`
const BENIGN = `<p><strong>bold</strong> <a href="https://x.com">link</a></p>`
const DANGEROUS = /<script|onerror|javascript:/i

const PAGE = {
  sections: {
    promo_1: {
      type: "promo",
      settings: { heading: "Hello", promo_text: HOSTILE },
      blocks: { n1: { type: "note", settings: { note: HOSTILE } }, n2: { type: "note", settings: { note: BENIGN } } },
      block_order: ["n1", "n2"],
    },
    promo_2: { type: "promo", settings: { heading: "Again", promo_text: BENIGN } },
  },
  order: ["promo_1", "promo_2"],
}

type Loose = { settings: Record<string, string>; blocks?: { settings: Record<string, string> }[] }

/** The same questions of a cleaned page, whichever way it arrived. */
function judge(where: string, page: SectionInstance[]) {
  const [first, second] = page as unknown as Loose[]
  check(`${where}: the script and the handler are gone from promo_text`, !DANGEROUS.test(first.settings.promo_text), first.settings.promo_text)
  check(`${where}: and the words are still there`, first.settings.promo_text.includes("Sale today"))
  check(`${where}: a block's rich text is cleaned as well`, !DANGEROUS.test(first.blocks?.[0].settings.note ?? ""), first.blocks?.[0].settings.note)
  check(`${where}: bold and a link survive unchanged, on the section and on a block`,
    second.settings.promo_text === BENIGN && first.blocks?.[1].settings.note === BENIGN,
    `${second.settings.promo_text} / ${first.blocks?.[1].settings.note}`)
  check(`${where}: a plain text setting is left as typed`, first.settings.heading === "Hello")
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Before: the id list alone left it as written")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const list = sectionsFromTemplate(PAGE as never) as unknown as SectionInstance[]
    const byList = sanitizeSections(list) as unknown as Loose[]
    check("without the section's own schema, promo_text is not recognised as HTML", byList[0].settings.promo_text === HOSTILE,
      "if this starts failing because the id list learned promo_text, pick another id: the point is an id nobody listed")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The import path: a package from somebody else")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const built = await buildPackage({
      theme: { format: "storelib-theme", format_version: 1, name: "Shared", version: "1.0.0", author: "A stranger", engine: { min: 1 } } as never,
      files: { "sections/promo.storelib": PROMO, "templates/index.json": JSON.stringify(PAGE) },
      assets: {},
    })
    const got = await readPackage(built, { knownTypes: Object.keys(SECTION_SCHEMAS) })
    check("the package is valid, so it would be imported", got.ok === true, got.ok === false ? got.errors.map((e) => e.message).join(" | ") : "")
    if (got.ok === true) {
      /* What app/api/website-builder/themes/import/route.ts does with it. */
      const own = ownSectionFields(Object.entries(got.value.files).map(([path, content]) => ({ path, content })))
      judge("import", sanitizeSections(sectionsFromTemplate(JSON.parse(got.value.files["templates/index.json"])) as unknown as SectionInstance[], own))
    }
    const route = read("app/api/website-builder/themes/import/route.ts")
    check("the import route reads the package's own section files for the schema",
      /const own = ownSectionFields\(Object\.entries\(pkg\.files\)\.map\(\(\[path, content\]\) => \(\{ path, content \}\)\)\)/.test(route))
    /* Every page, header and footer groups included, comes from lib/website-builder/theme-pages.ts and is cleaned on the way in. */
    check("and hands them to the cleaner for every page",
      /pagesFromPackageFiles\(pkg\.files, packageKinds\)\.map\(\(page\) => \(\{\s*\n\s*page_key: page\.page_key,\s*\n\s*sections: sanitizeSections\(rewriteUrls\(page\.sections, refToUrl\) as SectionInstance\[\], own\),/.test(route))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The editor's save: a section the creator wrote in the code editor")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const list = sectionsFromTemplate(PAGE as never) as unknown as SectionInstance[]
    /* A file made in the code editor and not published yet: a draft and an empty live half. */
    const rows: { path: string; content: string; draft_content: string | null }[] = [{ path: "sections/promo.storelib", content: "", draft_content: PROMO }]
    judge("save", sanitizeSections(list, ownSectionFields(rows)))

    /* The route reads only the types on the page, through the user's own client. */
    const asked: string[][] = []
    const db = (stored: typeof rows, opts: { draftColumn: boolean; fail?: boolean }) => ({
      from: () => ({
        select: (cols: string) => ({
          eq: () => ({
            in: async (_col: string, paths: string[]) => {
              asked.push(paths)
              if (opts.fail) throw new Error("network")
              if (!opts.draftColumn && cols.includes("draft_content")) return { data: null, error: { message: "column draft_content does not exist" } }
              return { data: stored.filter((r) => paths.includes(r.path)), error: null }
            },
          }),
        }),
      }),
    })
    const types = list.map((s) => s.type).concat(["promo", "Not A Type", "hero"])
    judge("save, as the route reads it", sanitizeSections(list, await readOwnSectionFields(db(rows, { draftColumn: true }), "i1", types)))
    check("only the page's own types are asked for, once each, and nothing that is not a type name",
      JSON.stringify(asked[0]) === JSON.stringify(["sections/promo.storelib", "sections/hero.storelib"]), JSON.stringify(asked[0]))
    const published = [{ path: "sections/promo.storelib", content: PROMO, draft_content: null }]
    judge("save, on an install from before file drafts", sanitizeSections(list, await readOwnSectionFields(db(published, { draftColumn: false }), "i1", types)))
    check("a read that fails cleans by the registry instead of refusing the save",
      JSON.stringify(await readOwnSectionFields(db(rows, { draftColumn: true, fail: true }), "i1", types)) === "{}")
    const before = asked.length
    await readOwnSectionFields(db(rows, { draftColumn: true }), "i1", [])
    check("and a page with no section types asks for nothing", asked.length === before)

    const route = read("app/api/website-builder/themes/[installId]/sections/route.ts")
    check("the sections route cleans with the install's own files",
      /const own = await readOwnSectionFields\(supabase, installId, raw\.map\(\(s\) => s\.type\)\)/.test(route) && /const sections = sanitizeSections\(raw, own\)/.test(route))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("And as it is drawn, for a row that was stored before any of this")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const compiled = compileSection(PROMO, { file: "sections/promo.storelib" })
    check("the section compiles", compiled.ok === true, compiled.ok === false ? compiled.errors[0].message : "")
    if (compiled.ok === true) {
      const draw = (text: string) => renderSection({
        compiled: compiled.value,
        id: "s1",
        instance: { type: "promo", settings: { heading: "Hi", promo_text: text }, blocks: { n1: { type: "note", settings: { note: text } } }, block_order: ["n1"] } as never,
        theme: {},
        page: { template: "index" },
      }).html
      const hostile = draw(HOSTILE)
      check("stored markup that can run something is drawn as its words", !DANGEROUS.test(hostile) && hostile.includes("Sale today"), hostile)
      check("stored rich text is drawn exactly as written", draw(BENIGN).includes(`<div class="promo__text">${BENIGN}</div>`) && draw(BENIGN).includes(`<div class="promo__note">${BENIGN}</div>`))
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
