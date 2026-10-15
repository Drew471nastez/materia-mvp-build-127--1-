/**
 * ===========================================================================
 *  THE ASSISTANT CAN EDIT THE SECTIONS THE CREATOR WROTE
 * ===========================================================================
 * It read `SECTION_SCHEMAS`, a map built when the site is built out of the
 * theme that ships with it. A section somebody wrote in their own install can
 * never be in that map, so the assistant could move, hide, duplicate and
 * remove those sections and could not name a single one of their settings: it
 * did not know they had any. Asked to change the heading on one, the honest
 * answer it had was that the section was unknown.
 *
 * A lookup is built per request now and passed down. PASSED, not held: a
 * module-level map would be shared by every request the server is handling,
 * and one creator's sections reaching another creator's assistant is exactly
 * what the rest of this codebase is careful about. That is the property the
 * last section here holds.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { schemaMapFor, schemaOf, nameOf } from "@/lib/website-builder/agent/schemas"
import {
  blockSpecs,
  buildSection,
  describeSection,
  describeSectionTypes,
  describeTheme,
  fieldsFor,
  maxBlocks,
} from "@/lib/website-builder/agent/operations"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { ThemeState } from "@/lib/website-builder/agent/operations"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const MINE = [
  "<template>",
  "<h2>{{ settings.heading }}</h2>",
  '{% for b in blocks %}<p data-block-id="{{ b.id }}">{{ b.settings.line }}</p>{% endfor %}',
  "</template>",
  "<style>.m { padding: 40px; }</style>",
  "<schema>" + JSON.stringify({
    type: "drewwww",
    name: "Drewwww",
    description: "A section I wrote",
    settings: [
      { type: "text", id: "heading", label: "Heading", default: "Hi" },
      { type: "color", id: "tint", label: "Tint" },
    ],
    blocks: [{ type: "row", name: "Row", settings: [{ type: "text", id: "line", label: "Line" }] }],
    max_blocks: 12,
    presets: [{ name: "Drewwww", blocks: [{ type: "row" }] }],
  }) + "</schema>",
].join("\n")

const sources = { "sections/drewwww.storelib": MINE }
const schemas = schemaMapFor(sources)
const state: ThemeState = {
  sections: [{ id: "d1", type: "drewwww", name: "Drewwww", settings: { heading: "Hi" }, blocks: [{ id: "b1", type: "row", settings: { line: "one" } }] }],
  settings: {},
} as never

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Without the creator's files, which is what it had before")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("it can see the section is there", describeTheme(state, "home").includes("[d1] drewwww"))
    check("but has no settings to write", fieldsFor("drewwww").length === 0)
    check("no blocks to add", blockSpecs("drewwww").length === 0)
    check("and cannot build one", buildSection("x", "drewwww") === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("With them")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const line = describeTheme(state, "home", schemas)
    check("the section is described like any other", line.includes("[d1] drewwww") && !line.includes("← no file"))
    /* `animation` is how it arrives, the control every body section's design panel has (agent/operations SECTION_ENTRANCE_FIELD). */
    check("its settings can be written, by name", fieldsFor("drewwww", schemas).map((f) => f.id).sort().join(",") === "animation,heading,tint")
    check("its blocks are known", blockSpecs("drewwww", schemas).map((b) => b.type).join(",") === "row")
    check("and how many it will take", maxBlocks("drewwww", schemas) === 12)
    check("it can be built from its preset", (() => {
      const built = buildSection("x", "drewwww", schemas)
      return built?.type === "drewwww" && built.blocks?.length === 1
    })())
    check("it can be offered as something to add", describeSectionTypes(["drewwww"], schemas).includes("Drewwww — A section I wrote"))
    check("and described in full, blocks and all", (() => {
      const d = describeSection(state.sections[0], schemas)
      return d.includes("drewwww") && d.includes("line")
    })())
    check("its name is its name", nameOf(schemas, "drewwww") === "Drewwww")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A type with no file at all is still handled")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * What is left after this change: a section on a page whose file has been
   * deleted since. It can still be moved and removed, and the model is told
   * exactly that rather than being told nothing.
   */
  {
    const orphan: ThemeState = { sections: [{ id: "o1", type: "gone_for_good", name: "Gone", settings: {}, blocks: [] }], settings: {} } as never
    const line = describeTheme(orphan, "home", schemas)
    check("it is named, with what can still be done to it", line.includes("gone_for_good") && /moved, hidden, duplicated or removed/.test(line))
    check("and nothing pretends it has settings", fieldsFor("gone_for_good", schemas).length === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("One creator's sections cannot reach another's assistant")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const theirs = schemaMapFor({ "sections/someone_else.storelib": MINE.replace(/drewwww/g, "someone_else").replace("Drewwww", "Someone Else") })
    check("two lookups are two different maps", schemaOf(schemas, "someone_else") === undefined && schemaOf(theirs, "drewwww") === undefined)
    check("and the built-in map is not written into by either", !("drewwww" in SECTION_SCHEMAS) && !("someone_else" in SECTION_SCHEMAS))
    check("with no sources at all, it is exactly the built-in map", schemaMapFor() === SECTION_SCHEMAS && schemaMapFor({}) === SECTION_SCHEMAS)
    check("a creator's file shadows the theme's of the same type", (() => {
      const shadow = schemaMapFor({ "sections/faq_accordion.storelib": MINE.replace('"type": "drewwww"', '"type": "faq_accordion"').replace('"Drewwww"', '"My FAQ"') })
      return shadow.faq_accordion?.name === "My FAQ" && SECTION_SCHEMAS.faq_accordion?.name === "Accordion FAQ"
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Nothing in the agent reads the build-time map any more")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const dir = join(process.cwd(), "lib/website-builder/agent")
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && f !== "schemas.ts")
      .filter((f) => /\bSECTION_SCHEMAS\b/.test(readFileSync(join(dir, f), "utf8")))
    check("not one of them", offenders.length === 0, offenders.join(", "))

    const route = readFileSync(join(process.cwd(), "app/api/website-builder/themes/[installId]/agent/route.ts"), "utf8")
    check("the route reads the creator's files through the creator's own client", /await supabase\s*\n?\s*\.from\("store_theme_custom_files"\)/.test(route) && !/createAdminClient\(\)[\s\S]{0,200}store_theme_custom_files/.test(route))
    check("and hands them to the run", /sources: agentSources/.test(route))
    check("their sections can be added, not only edited", /customAddableSections\(customSectionSchemas\(agentSources\)\)/.test(route))
    check("a failure to read them leaves the assistant working, as it did before", /catch \{[\s\S]{0,120}the assistant works without them/.test(route))
    const loop = readFileSync(join(dir, "loop.ts"), "utf8")
    /* `let`: built once per run, and built again only after the run writes a section file that changes a schema. */
    check("the map is built once per run and passed down", /let schemas = schemaMapFor\(input\.sources\)/.test(loop))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
