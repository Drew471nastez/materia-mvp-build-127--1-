/**
 * ===========================================================================
 *  A SECTION ASK AI WRITES LANDS ON THE PAGE, AND THE CANVAS SHOWS IT COMING
 * ===========================================================================
 * Before this, writing a section took thirty seconds with nothing on the
 * canvas, and at the end the section was not on the page: the chat said it
 * was "in Add Section under Created by you". Two more things were wrong on
 * the way there:
 *
 *   the writer sent stale settings   its callback listed `[installId]` only,
 *                                    so a section written after a colour
 *                                    change was written for the old colours
 *   the agent could not place one    `applyOp` built every added section
 *                                    from the built-in schemas, so adding a
 *                                    type the creator wrote did nothing
 *
 * The placement is pure (lib/website-builder/ai-placement.ts) and tested as
 * such. The wiring is pinned by reading the source, because the editor is one
 * nine-thousand-line component with no harness.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  WRITING_SECTION_ID,
  WRITING_SECTION_TYPE,
  anchorIndex,
  gapWithoutPlaceholder,
  instanceFromSchema,
  placeWrittenSection,
  withWritingPlaceholder,
  writingAnchor,
} from "@/lib/website-builder/ai-placement"
import { customSectionSchemas } from "@/lib/website-builder/storelib-schemas"
import { applyOp, describeSection, fieldsFor } from "@/lib/website-builder/agent/operations"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const s = (id: string, type = id): SectionInstance => ({ id, type, name: id, settings: {}, blocks: [] })
const ids = (list: SectionInstance[]) => list.map((x) => x.id).join(",")
const PAGE = [s("header"), s("hero"), s("faq"), s("gallery"), s("footer")]

function main() {
  console.log("\nWhere it lands")

  check("under the section that is open",
    ids(placeWrittenSection(PAGE, writingAnchor(PAGE, { selectedId: "hero" }), s("new"))) === "header,hero,new,faq,gallery,footer")
  check("in the gap the creator chose, over the section they have open",
    ids(placeWrittenSection(PAGE, writingAnchor(PAGE, { chosenIndex: 3, selectedId: "hero" }), s("new"))) === "header,hero,faq,new,gallery,footer")
  check("with nothing chosen, at the end of the page above the footer",
    ids(placeWrittenSection(PAGE, writingAnchor(PAGE), s("new"))) === "header,hero,faq,gallery,new,footer")
  check("the header being open does not put it above the header",
    ids(placeWrittenSection(PAGE, writingAnchor(PAGE, { selectedId: "header" }), s("new"))) === "header,hero,faq,gallery,new,footer")
  check("the footer being open does not put it below the footer",
    ids(placeWrittenSection(PAGE, writingAnchor(PAGE, { selectedId: "footer" }), s("new"))) === "header,hero,faq,gallery,new,footer")
  check("a chosen gap outside the body is pulled back into it",
    anchorIndex(PAGE, writingAnchor(PAGE, { chosenIndex: 0 })) === 1 && anchorIndex(PAGE, writingAnchor(PAGE, { chosenIndex: 99 })) === 4)
  const bare = [s("a"), s("b")]
  check("a page with no header or footer takes it at the top or the end",
    ids(placeWrittenSection(bare, writingAnchor(bare, { chosenIndex: 0 }), s("new"))) === "new,a,b"
      && ids(placeWrittenSection(bare, writingAnchor(bare), s("new"))) === "a,b,new")

  console.log("\nThe spot survives the creator working while it is written")

  const anchor = writingAnchor(PAGE, { selectedId: "hero" })
  const addedAbove = [s("header"), s("banner"), s("hero"), s("faq"), s("gallery"), s("footer")]
  check("a section added above it moves the spot with the section it was under",
    ids(placeWrittenSection(addedAbove, anchor, s("new"))) === "header,banner,hero,new,faq,gallery,footer")
  const reordered = [s("header"), s("faq"), s("gallery"), s("hero"), s("footer")]
  check("the section it was under dragged elsewhere takes the spot with it",
    ids(placeWrittenSection(reordered, anchor, s("new"))) === "header,faq,gallery,hero,new,footer")
  const deleted = [s("header"), s("faq"), s("gallery"), s("footer")]
  check("that section deleted, it falls back to where the spot was",
    ids(placeWrittenSection(deleted, anchor, s("new"))) === "header,faq,new,gallery,footer")

  console.log("\nThe placeholder is drawn, never saved")

  const before = ids(PAGE)
  const canvas = withWritingPlaceholder(PAGE, anchor, "A pricing table with three plans")
  check("it is in the canvas's list, at the spot", ids(canvas) === `header,hero,${WRITING_SECTION_ID},faq,gallery,footer`)
  check("and the page's own list is untouched", ids(PAGE) === before)
  const held = canvas.find((x) => x.id === WRITING_SECTION_ID)
  check("it carries its own type, which nothing real has", held?.type === WRITING_SECTION_TYPE)
  check("and the prompt, cut short", withWritingPlaceholder(PAGE, anchor, "x".repeat(500)).find((x) => x.id === WRITING_SECTION_ID)?.settings.prompt === "x".repeat(160))
  check("the placeholder sits where the section then lands",
    canvas.findIndex((x) => x.id === WRITING_SECTION_ID) === placeWrittenSection(PAGE, anchor, s("new")).findIndex((x) => x.id === "new"))

  console.log("\nThe canvas's insert strips count the page, not the placeholder")

  // Body of the canvas: hero(0) writing(1) faq(2) gallery(3); gaps 0..4.
  check("gaps above the placeholder are unchanged", gapWithoutPlaceholder(canvas, 0) === 0 && gapWithoutPlaceholder(canvas, 1) === 1)
  check("the gap directly under it is the same gap as the one over it, and is not drawn", gapWithoutPlaceholder(canvas, 2) === null)
  check("gaps below it are one fewer", gapWithoutPlaceholder(canvas, 3) === 2 && gapWithoutPlaceholder(canvas, 4) === 3)
  check("with no placeholder, every gap is itself", [0, 1, 2, 3].every((g) => gapWithoutPlaceholder(PAGE, g) === g))

  console.log("\nThe section arrives the way its first preset says")

  const custom = customSectionSchemas({
    "sections/tabs_panel.storelib": read("content/developers/examples/tabs_panel.storelib"),
    "sections/signup_card.storelib": read("content/developers/examples/signup_card.storelib"),
  })
  const tabs = custom.tabs_panel
  check("a written file gives a schema", !!tabs && !!custom.signup_card)
  const a = instanceFromSchema("tabs_panel-1", "tabs_panel", tabs)
  const b = instanceFromSchema("tabs_panel-2", "tabs_panel", tabs)
  check("named from the schema, with the preset's blocks", a.name === "Tabs" && a.blocks?.length === 3 && a.hidden === false)
  check("two copies do not share block objects", a.blocks?.[0] !== b.blocks?.[0] && a.blocks?.[0] !== tabs.presets?.[0].blocks?.[0])
  check("nor settings", a.settings !== tabs.presets?.[0].settings)
  check("a schema with no preset still makes a section, empty", instanceFromSchema("x-1", "x", { name: "X" }).blocks?.length === 0)

  console.log("\nThe agent can place a section the creator wrote")

  const schemas = { ...custom }
  const state = { sections: PAGE, settings: {} }
  const op = { kind: "add_section" as const, id: "signup_card-9", sectionType: "signup_card" }
  const added = applyOp(state, op, schemas).sections
  check("add_section with the lookup adds it, above the footer",
    ids(added) === "header,hero,faq,gallery,signup_card-9,footer")
  const card = added.find((x) => x.id === "signup_card-9")
  check("named from its own schema, as the type it is", card?.name === "Sign-up card" && card?.type === "signup_card")
  check("without the lookup it is not invented from nothing",
    ids(applyOp(state, op).sections) === ids(PAGE), "the built-in schemas do not know it")
  check("its controls are described from its own schema",
    /heading/.test(describeSection(added.find((x) => x.id === "signup_card-9")!, schemas)) && fieldsFor("signup_card", schemas).length > 0)
  check("block controls reach the section's own blocks",
    /Tab title/.test(describeSection(instanceFromSchema("t-1", "tabs_panel", tabs), schemas)))

  const operations = read("lib/website-builder/agent/operations.ts")
  check("applyOp builds the section with the lookup it was given",
    /const section = buildSection\(op\.id, op\.sectionType, schemas\)/.test(operations))
  const loop = read("lib/website-builder/agent/loop.ts")
  check("the loop checks an added section's settings against its own schema",
    /checkSettings\(fieldsFor\(sectionType, schemas\), settings, sectionType\)/.test(loop)
      && /applyOp\(state, op, schemas\)\.sections\.find\(\(s\) => s\.id === fresh\)/.test(loop))
  check("and every block lookup in it passes the lookup on",
    !/blockSpecs\(section\.type\)|maxBlocks\(section\.type\)|blockFieldsFor\(section\.type, block(Type|\.type)\)/.test(loop))

  console.log("\nThe chat tells the canvas")

  const chat = read("components/website-builder/theme-chat.tsx")
  const writeOne = chat.slice(chat.indexOf("const writeOne = React.useCallback("), chat.indexOf("const submit = React.useCallback("))
  check("the spot is held before the request goes", writeOne.indexOf("onWriteStart?.(prompt)") > -1
    && writeOne.indexOf("onWriteStart?.(prompt)") < writeOne.indexOf("await fetch("))
  /* The ending is lib/website-builder/ask-code-run.ts (finishWrite), driven for real in tests/ask-images-u.test.ts. */
  const codeRun = read("lib/website-builder/ask-code-run.ts")
  check("a section that was kept is handed over by type", /place: \(section\) => \(onWriteDone \? onWriteDone\(section\) : false\)/.test(writeOne) && /const section = \{ type, name: answer\.name, path: answer\.path \}/.test(codeRun))
  check("anything else lets go of the spot, and says why", /finally \{[\s\S]{0,200}if \(!kept\) onWriteFailed\?\.\(done\?\.reply \?\? done\?\.error \?\? "The section could not be written\.", answered\)/.test(writeOne))
  check("the editor failing to place it is not reported as the write failing",
    /\} catch \{\s*placed = false\s*\}/.test(codeRun) && /is written\. Add it from Add Section, under Created\./.test(codeRun))
  check("the request reads the settings and sections of now, not of the first render",
    /settings: live\.current\.settings,/.test(writeOne) && /live\.current\.sections\.map\(\(s\) => s\.type\)/.test(writeOne))
  /* The creator's own category is called Created now, and the message names it the same way. */
  check("the message says where it went",
    /Added \$\{answer\.name\} to the page\./.test(codeRun) && /Add it from Add Section, under Created\./.test(codeRun) && !/under Created by you/.test(chat + codeRun))
  check("and no longer tells the creator to go and find it",
    !/It is in Add Section under Created by you, and not published until you publish/.test(chat))

  console.log("\nThe editor draws the spot and places the section")

  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("both chat panels, phone and desktop, are wired",
    (editor.match(/onWriteStart=\{handleWriteStart\}\s*onWriteDone=\{handleWriteDone\}\s*onWriteFailed=\{handleWriteFailed\}/g) ?? []).length === 2)
  check("the placeholder is added to the list the canvas draws",
    /withWritingPlaceholder\(deferredSections, aiWriting\.anchor, aiWriting\.prompt\)/.test(editor))
  check("and never to the page's own sections",
    !/setSections\([^\n]*withWritingPlaceholder/.test(editor) && !/sectionsRef\.current = withWritingPlaceholder/.test(editor))
  check("it is drawn only on the page it was started from", /aiWriting\.page === currentPage/.test(editor))
  check("it stays until the canvas is drawing what replaced it, so no frame has neither",
    /!\(aiWriting\.placedId && deferredSections\.some\(\(s\) => s\.id === aiWriting\.placedId\)\)/.test(editor))
  const done = editor.slice(editor.indexOf("const handleWriteDone = useCallback("), editor.indexOf("const handleWriteFailed = useCallback("))
  check("the new file is fetched before it is placed", done.indexOf("await loadStorelibSources()") > -1
    && done.indexOf("await loadStorelibSources()") < done.indexOf("setSections("))
  check("placed as an undoable, saved edit: undo step, dirty, selected",
    /pushUndo\(\)/.test(done) && /setIsDirty\(true\)/.test(done) && /setSelectedPanel\(\{ type: "section", sectionId: id \}\)/.test(done))
  check("not placed on another page than the one it was asked on",
    /writing\.page !== currentPageRef\.current/.test(done))
  check("loadStorelibSources hands back what it loaded",
    /const loadStorelibSources = useCallback\(async \(\): Promise<Record<string, string> \| null>/.test(editor))
  check("the canvas draws the placeholder as the writing component, not as a section",
    /if \(section\.type === WRITING_SECTION_TYPE\) \{[\s\S]{0,200}<WritingSection prompt=/.test(editor))
  check("the insert strips are counted without it", /gapWithoutPlaceholder\(sections, at\)/.test(editor))
  check("a phone closes the chat to show the canvas, and reopens it on failure",
    /if \(isMobileView\) setAiOpen\(false\)/.test(editor) && /if \(isMobileViewRef\.current \|\| answered\) setAiOpen\(true\)/.test(editor))
  check("a desktop whose chat was closed meanwhile is told why the spot went",
    /else if \(!aiOpenRef\.current\) showNotification\(reason, "error"\)/.test(editor))
  check("the AI's own add_section is replayed with the creator's sections in the lookup",
    /applyOp\(\{ sections: previous, settings: \{\} \}, op, librarySchemas\)/.test(editor))

  console.log("\nThe placeholder itself")

  const component = read("components/website-builder/editor/writing-section.tsx")
  check("it announces itself to a screen reader, and only to one",
    /className="sr-only" role="status" aria-live="polite"/.test(component) && /Writing a section/.test(component))
  /* What is drawn is code and nothing else: no label, no prompt, no bones. */
  const drawn = component.slice(component.indexOf("return (\n    <div className=\"wb-writing\""))
  check("nothing but the code lane is drawn",
    /<div className="wb-writing-inner" aria-hidden="true">\s*<div ref=\{codeRef\} className="wb-writing-code" \/>/.test(drawn)
      && !/wb-writing-label|wb-writing-prompt|wb-bone/.test(component))
  check("and it claims no progress it does not have",
    !/%|Styling|Compiling|Almost|step \d|line \d/i.test(drawn.replace(/\{prompt[^}]*\}/g, "")))
  check("it types by animation frame into the DOM, not by re-rendering",
    /requestAnimationFrame\(draw\)/.test(component) && /el\.innerHTML =/.test(component) && !/useState/.test(component))
  check("its colouring is one pass over its own sample, so no markup leaks into the lane",
    /const token = \/\(/.test(component) && /The input is SAMPLE above and\s*\n \* nothing else/.test(component))
  const css = read("app/globals.css")
  const block = css.slice(css.indexOf("A SECTION THE AI IS STILL WRITING"))
  check("coloured from the page it sits on", /var\(--theme-text/.test(block) && /var\(--theme-bg/.test(block))
  check("faded from clear at the top to solid at the bottom",
    /mask-image: linear-gradient\(to bottom, transparent 0%, #000 62%\)/.test(block))
  check("every motion stops under reduced motion",
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.wb-writing,\s*\.wb-writing::before,\s*\.wb-writing-inner::after,\s*\.wb-writing-caret,\s*\.wb-section-arrive \{ animation: none; \}/.test(block)
      && /prefers-reduced-motion: reduce\)"\)\.matches === true/.test(component))
  check("no em dash in anything a creator reads",
    ![component.replace(/\/\*\*[\s\S]*?\*\//g, ""), chat.match(/"Describe a section the library does not have[^"]*"/)?.[0] ?? ""].some((t) => /—|–/.test(t)))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
