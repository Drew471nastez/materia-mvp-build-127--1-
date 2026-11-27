/**
 * ===========================================================================
 *  ROUND 69: STORELIB AI KNOWS A NEW SECTION FROM AN EDIT, AND SAYS WHICH
 * ===========================================================================
 * The owner: "Storelib AI, which can create new sections or edit current
 * sections, should be smart and know how to make the distinction ... It
 * should be easy for people to see, understand and apply. Right now it
 * builds really weird things."
 *
 * What was wrong, measured first (BEFORE below): selecting a section turned
 * the "Editing: <Name>" lock on, and a locked request was never read for
 * what it asked, so "add a newsletter signup below this" with the hero open
 * was written into the hero. And on a site made from a Storelib template,
 * a new section of a kind Materia has went to the writer, which wrote a file
 * from nothing in no template's style.
 *
 *   INTENT    the words and the selection, read in the browser as they are
 *             typed (lib/website-builder/section-aim.ts): edit, new (where),
 *             replace; a tap overrides; nothing selected creates
 *   ROUTER    the aim the chip showed is honoured (agent/router.ts): new is
 *             never locked to the open section, edit always is; Materia
 *             purposes send a new section to Materia's own sections
 *   LOOP      recorded model answers through the real loop: an edit changes
 *             only the setting asked for, a removal or an addition under
 *             the edit is refused; a new section lands at the chip's index
 *             and the open one is not touched
 *   PLACE     the writer's spot is the chip's place (ai-placement.ts)
 *   CHIP      "Editing: Hero" with "New section instead"; "New section below
 *             Hero" with "Edit Hero instead" and a flip; Keep and Discard
 *   COPY      no AI words, no dashes, in every language
 *
 * Run with:  npm run test:push
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import * as React from "react"

import { aimLabel, aimWire, readAim, resolveAim, writerPlace } from "@/lib/website-builder/section-aim"
import { routeByRules, type RouteSelection } from "@/lib/website-builder/agent/router"
import { purposeOfWords } from "@/lib/website-builder/agent/purpose-words"
import type { SelectedShape } from "@/lib/website-builder/agent/selection-intent"
import { writingAnchor } from "@/lib/website-builder/ai-placement"
import { themeAgent, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import { applyOps, type ThemeOp, type ThemeState } from "@/lib/website-builder/agent/operations"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { ScopeChip } from "@/components/website-builder/ask-parts"
import { PURPOSES } from "@/lib/storelib-ai/materia"
import type { AgentProvider, AgentTurn, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const section = (title: string) => console.log(`\n${title}`)
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── the page every case reads: header, hero, FAQ, footer ── */
const hero: SelectedShape = { id: "hero-1", type: "image_banner", name: "Hero", position: 1, total: 4, blockTypes: [] }
const faq: SelectedShape = { id: "faq-1", type: "faq", name: "FAQ", position: 2, total: 4, blockTypes: ["faq_item"] }
const heroSel: RouteSelection = { sectionId: "hero-1", sectionType: "image_banner", sectionName: "Hero", origin: "builtin" }
const addable = ADDABLE_SECTIONS.map((type) => ({ type, name: SECTION_SCHEMAS[type]?.name }))
const onPage = [{ type: "image_banner", name: "Hero" }, { type: "faq", name: "FAQ" }]
const route = (prompt: string, selection: RouteSelection | null, shape: SelectedShape | null, extra: Partial<Parameters<typeof routeByRules>[0]> = {}) => {
  const aim = resolveAim({ prompt, selected: shape, choice: "auto" })
  return routeByRules({ prompt, selection, scoped: !!selection, images: 0, bodySections: 2, addable, onPage, aim: aim ? { kind: aim.kind, by: aim.by } : undefined, ...extra })
}
const short = (d: { agent: string; lock: boolean }) => `${d.agent}${d.lock ? " lock" : ""}`

/* ── a fake model: recorded turns ── */
type Call = [string, Record<string, unknown>]
type Scripted = { text?: string; calls?: Call[] }
function scripted(script: Scripted[], sent: ProviderRequest[]): AgentProvider {
  let turn = 0
  return {
    id: "scripted",
    async complete(request): Promise<ProviderTurn> {
      sent.push({ ...request, turns: request.turns.map((t) => ({ ...t })) as AgentTurn[] })
      const step = script[turn++] ?? { text: "Done." }
      const toolCalls: ToolCall[] = (step.calls ?? []).map(([name, args], i) => ({ id: `call_${turn}_${i}`, name, argumentsJson: JSON.stringify(args) }))
      return { text: step.text ?? "", toolCalls, raw: [], usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 }, stop: toolCalls.length > 0 ? "tool_calls" : "done" }
    },
  }
}
function make(id: string, type: string, settings: Record<string, unknown> = {}, blocks: SectionInstance["blocks"] = []): SectionInstance {
  return { id, type, name: id === "hero-1" ? "Hero" : SECTION_SCHEMAS[type]?.name ?? type, settings, blocks }
}
function page(): ThemeState {
  return {
    sections: [
      make("header-1", "header"),
      make("hero-1", "image_banner", { heading: "Bread baked before six", subheading: "Sourdough, rye and seeded loaves from our oven in Leith.", button_label: "See this week's loaves" }),
      make("faq-1", "faq", {}, [{ id: "f1", type: "faq_item", settings: { question: "Do you deliver?", answer: "<p>Within Edinburgh, Tuesday to Saturday.</p>" } }]),
      make("footer-1", "footer"),
    ],
    settings: {},
  }
}
async function run(prompt: string, script: Scripted[], extra: Partial<Parameters<typeof themeAgent>[0]> = {}) {
  const sent: ProviderRequest[] = []
  const events: ThemeAgentEvent[] = []
  let n = 0
  const loop = themeAgent({ provider: scripted(script, sent), model: "test", prompt, state: page(), page: "home", addable: ADDABLE_SECTIONS, maxReviews: 0, newId: (t) => `${t}-new-${++n}`, ...extra })
  for (;;) {
    const step = await loop.next()
    if (step.done === true) return { sent, events, result: step.value }
    events.push(step.value as ThemeAgentEvent)
  }
}
const opsOf = (events: ThemeAgentEvent[]): ThemeOp[] => events.flatMap((e) => (e.type === "op" ? [e.op] : []))
const toolOutputs = (sent: ProviderRequest[]) => sent.flatMap((req) => req.turns.flatMap((t) => (t.role === "tool" ? t.results.map((r) => r.output) : [])))

async function main() {
  // ===========================================================================
  section("BEFORE: what the router did with a section selected and its lock on (the lock came on with every selection)")
  // ===========================================================================
  {
    /* The router as it was: no aim. These went into the open hero. */
    const was = (prompt: string) => short(routeByRules({ prompt, selection: heroSel, scoped: true, images: 0, bodySections: 2, addable, onPage }))
    const before = ["add a newsletter signup below this", "I need a pricing table under this", "add a gallery", "add a map with our address", "turn this into a FAQ"].map((p) => `${p}: ${was(p)}`)
    console.log(`        ${before.join("\n        ")}`)
    check("measured: without the aim, five requests for another section are locked to the open hero", before.every((line) => /: page lock$/.test(line)), before)
  }

  // ===========================================================================
  section("INTENT: the words and the selection, read before Enter")
  // ===========================================================================
  {
    type Row = [string, SelectedShape | null, string]
    const table: Row[] = [
      ["make the heading bigger", hero, "edit"],
      ["make it feel calmer", hero, "edit"],
      ["add a button", hero, "edit"],
      ["add two more questions", faq, "edit"],
      ["add testimonials", faq, "edit"],
      ["add a newsletter signup below this", hero, "new below"],
      ["I need a pricing table under this", hero, "new below"],
      ["add a gallery", hero, "new below"],
      ["add a map with our address", hero, "new below"],
      ["add a section about our story above this", hero, "new above"],
      ["show our reviews under this", hero, "new below"],
      ["a block with our opening hours after this", hero, "new below"],
      ["copy this section", hero, "new below"],
      ["add a testimonials section at the end of the page", hero, "new bottom"],
      ["turn this into a FAQ", hero, "replace"],
      ["replace this with a gallery", hero, "replace"],
      ["add a section with three reasons to visit the bakery", null, "new top"],
      ["add a contact section at the bottom of the page", null, "new bottom"],
      ["make the heading bigger", null, "none"],
      ["what fonts does this site use?", null, "none"],
    ]
    const say = (a: ReturnType<typeof readAim>) => (a ? `${a.kind}${a.kind === "new" ? ` ${a.where}` : ""}` : "none")
    const wrong = table.map(([p, s, want]) => ({ p, want, got: say(resolveAim({ prompt: p, selected: s, choice: "auto" })) })).filter((r) => r.got !== r.want)
    check(`every row reads as expected (${table.length} rows, selected and not)`, wrong.length === 0, wrong)

    const tapNew = resolveAim({ prompt: "make the heading bigger", selected: hero, choice: "new" })
    check("a tap on New section wins over words that read as an edit, placed below the open one", tapNew?.kind === "new" && tapNew.by === "choice" && tapNew.where === "below" && tapNew.index === 2, tapNew)
    const tapEdit = resolveAim({ prompt: "add a gallery", selected: hero, choice: "edit" })
    check("a tap on Edit Hero instead wins over words that read as new", tapEdit?.kind === "edit" && tapEdit.by === "choice")
    const flipped = resolveAim({ prompt: "add a gallery", selected: hero, choice: "new", where: "above" })
    check("the place flips to above: the index is the open section's own", flipped?.where === "above" && flipped.index === 1, flipped)
    const nothing = resolveAim({ prompt: "add a section with our hours", selected: null, choice: "auto", where: "bottom" })
    check("with nothing selected the place is the top or the end of the page, and the end is above the footer", nothing?.where === "bottom" && writerPlace(nothing, null)?.end === "bottom")
    check("the wire carries what the label says", JSON.stringify(aimWire(flipped)) === JSON.stringify({ kind: "new", by: "choice", index: 1, where: "above" }))
    check("labels: Editing: Hero, New section below Hero, Replacing: Hero", aimLabel({ kind: "edit", by: "words" }, "Hero")?.subject === "Hero" && aimLabel(tapNew, "Hero")?.subject === "below Hero" && aimLabel({ kind: "replace", by: "words" }, "Hero")?.lead === "Replacing:")
  }

  // ===========================================================================
  section("ROUTER: what the chip said is what happens")
  // ===========================================================================
  {
    check("a newsletter signup below the hero is not locked to the hero", route("add a newsletter signup below this", heroSel, hero).lock === false)
    check("  and it is the page assistant, adding the theme's own newsletter section", short(route("add a newsletter signup below this", heroSel, hero)) === "page")
    check("a pricing table under it: not locked", route("I need a pricing table under this", heroSel, hero).lock === false)
    check("turn this into a FAQ: the page assistant, not locked, so it can put the FAQ in its place", short(route("turn this into a FAQ", heroSel, hero)) === "page")
    check("a new kind of section of its own goes to the writer", short(route("add a section below this where a loaf turns as you scroll", heroSel, hero)) === "writer")
    check("an edit stays locked to the open section", short(route("make the heading bigger", heroSel, hero)) === "page lock")
    const chosenEdit = routeByRules({ prompt: "add a new section with a flag", selection: heroSel, scoped: true, images: 0, bodySections: 2, addable, onPage, aim: { kind: "edit", by: "choice" } })
    check("Edit Hero instead, tapped, holds even when the words ask for a new section", short(chosenEdit) === "page lock", chosenEdit)
    const chosenNew = routeByRules({ prompt: "make the heading bigger", selection: heroSel, scoped: true, images: 0, bodySections: 2, addable, onPage, aim: { kind: "new", by: "choice" } })
    check("New section, tapped, is never locked to the open one", chosenNew.lock === false && chosenNew.target === "section")
    const noAim = routeByRules({ prompt: "make the heading bigger", selection: heroSel, scoped: true, images: 0, bodySections: 2, addable, onPage })
    check("an older browser that sends no aim routes as before", short(noAim) === "page lock")

    /* A site made from a Storelib template: its Materia sections cover these purposes. */
    const materiaPurposes = ["hero", "faq", "testimonials and reviews", "newsletter and contact", "comparison and pricing", "steps and timeline", "media and gallery"]
    const bare = { prompt: "", selection: null, scoped: false, images: 0, bodySections: 4, addable: [{ type: "hero-image1" }, { type: "testimonial-slider" }], onPage: [] }
    const was = routeByRules({ ...bare, prompt: "add a new testimonials section" })
    const now = routeByRules({ ...bare, prompt: "add a new testimonials section", materiaPurposes })
    check("on a Materia site a new testimonials section was written from nothing (before)", was.agent === "writer")
    check("  and is now one of Materia's own testimonial sections, through the page assistant", now.agent === "page" && now.lock === false, now)
    check("  but a custom one, or one from a picture, is still written", routeByRules({ ...bare, prompt: "add a custom testimonials section", materiaPurposes }).agent === "writer" && routeByRules({ ...bare, prompt: "add a testimonials section like this", images: 1, materiaPurposes }).agent === "writer")
    check("a purpose no Materia section on the site has is written", routeByRules({ ...bare, prompt: "add a new countdown section", materiaPurposes }).agent === "writer")
    const known = new Set<string>(PURPOSES)
    const words = ["a FAQ", "testimonials", "a pricing table", "a newsletter signup", "how it works", "our team", "a gallery", "a video", "press logos", "a countdown to launch"].map((w) => purposeOfWords(w))
    check("purposes read from words are the catalogue's own purposes", words.every((p) => p !== null && known.has(p)), words)
  }

  // ===========================================================================
  section("LOOP, recorded answers: an edit stays an edit, a new section stays new")
  // ===========================================================================
  {
    const before = page()
    const edit = await run(
      "make the heading shorter",
      [
        { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Bread before six" }) }]] },
        { calls: [["remove_section", { id: "hero-1" }], ["add_section", { sectionType: "rich_text", index: 1 }], ["update_section", { id: "faq-1", settingsJson: JSON.stringify({ heading: "Questions" }) }]] },
        { text: "Shortened the heading." },
      ],
      { selectedSectionId: "hero-1", lockToSelection: true, selectionAim: { kind: "edit" } },
    )
    const ops = opsOf(edit.events)
    const after = applyOps(page(), edit.result.ops)
    const heroBefore = before.sections[1]
    const heroAfter = after?.sections.find((s) => s.id === "hero-1")
    const changedKeys = heroAfter ? Object.keys({ ...heroBefore.settings, ...heroAfter.settings }).filter((k) => JSON.stringify(heroBefore.settings[k]) !== JSON.stringify(heroAfter.settings[k])) : ["missing"]
    check("the edit made one change, to the open section", ops.length === 1 && ops[0].kind === "update_section", ops)
    check("  the one setting asked for, and nothing else in it (subheading and button kept)", JSON.stringify(changedKeys) === JSON.stringify(["heading"]) && heroAfter?.type === "image_banner" && heroAfter?.name === "Hero", { changedKeys, heroAfter })
    check("  removing it, adding a section and changing the FAQ were refused, never silent", toolOutputs(edit.sent).filter((o) => /is the only (?:thing open|section you may change)/.test(o)).length === 3, toolOutputs(edit.sent))
    check("  the page still has the same sections in the same order", JSON.stringify(after?.sections.map((s) => s.id)) === JSON.stringify(before.sections.map((s) => s.id)))

    const created = await run(
      "make the heading bigger",
      [{ calls: [["add_section", { sectionType: "newsletter", index: 2, settingsJson: JSON.stringify({ heading: "Hear when the rye is out" }) }]] }, { text: "Added a signup below the hero." }],
      { selectedSectionId: "hero-1", selectionAim: { kind: "new", index: 2 } },
    )
    const first = (created.sent[0].turns[0] as { content: string }).content
    check("a tapped New section tells the model a new section at the chip's index, overriding the words", /BUT THIS REQUEST IS FOR A NEW SECTION/.test(first) && /index 2/.test(first), first.slice(0, 300))
    check("  and asks for a layout of its own, the site's own type and colour, real words, no placeholders", /a layout of its own/.test(first) && /real words for this business: no placeholder text/.test(first))
    const createdOps = opsOf(created.events)
    const hero2 = applyOps(page(), created.result.ops).sections.find((s) => s.id === "hero-1")
    check("the new section lands below the hero and the hero is untouched", applyOps(page(), created.result.ops).sections[2]?.type === "newsletter" && JSON.stringify(hero2?.settings) === JSON.stringify(before.sections[1].settings) && createdOps.every((o) => (o as { id?: string }).id !== "hero-1"), applyOps(page(), created.result.ops).sections.map((s) => s.type))

    const nothingOpen = await run("add a section with our opening hours", [{ text: "x" }], { selectionAim: { kind: "new", index: 1 } })
    check("nothing open: the model is told the index the chip showed", /told them where it goes: index 1/.test((nothingOpen.sent[0].turns[0] as { content: string }).content))
    const replaced = await run("make it about workshops", [{ text: "x" }], { selectedSectionId: "hero-1", selectionAim: { kind: "replace" } })
    check("Replacing: Hero is read as a replacement in its place", /WANTS IT REPLACED/.test((replaced.sent[0].turns[0] as { content: string }).content))
    const lockedEdit = await run("add a testimonials section below this", [{ text: "x" }], { selectedSectionId: "hero-1", lockToSelection: true, selectionAim: { kind: "edit" } })
    check("Edit Hero instead keeps the lock, even for words that ask for a section", /OPEN AND LOCKED/.test((lockedEdit.sent[0].turns[0] as { content: string }).content))
  }

  // ===========================================================================
  section("PLACE: the writer's spot is the chip's place")
  // ===========================================================================
  {
    const s = page().sections
    check("New section below Hero: right after the hero", writingAnchor(s, { selectedId: "hero-1", prompt: "a map", place: { selectedId: "hero-1", near: "after" } }).index === 2)
    check("flipped to above Hero: right before it", writingAnchor(s, { selectedId: "hero-1", prompt: "a map below this", place: { selectedId: "hero-1", near: "before" } }).index === 1)
    check("at the end of the page: above the footer", writingAnchor(s, { prompt: "a map", place: { end: "bottom" } }).index === 3)
    check("no place: as before (round AK, the top of the page)", writingAnchor(s, { prompt: "a map" }).index === 1)
  }

  // ===========================================================================
  section("CHIP and REVIEW: what Enter does, one tap to switch, Keep and Discard")
  // ===========================================================================
  {
    const noop = () => {}
    const html = (aim: Parameters<typeof ScopeChip>[0]["aim"], locked = true) => renderToStaticMarkup(React.createElement(ScopeChip, { name: "Hero", locked, onLock: noop, onUnlock: noop, phone: false, aim }))
    const editing = html({ kind: "edit", switchLabel: "New section instead", onSwitch: noop })
    check("editing: Editing: Hero, its x, and New section instead beside it", /data-ask-scope="locked"/.test(editing) && /Editing:<\/span> Hero/.test(editing) && /data-ask-aim-switch="new"[^>]*>New section instead</.test(editing))
    const creating = html({ kind: "new", place: "below Hero", onPlace: noop, switchLabel: "Edit Hero instead", onSwitch: noop })
    check("new: New section below Hero, a button that flips the place, and Edit Hero instead", /data-ask-scope="new"/.test(creating) && /New section<\/span> below Hero/.test(creating) && /data-ask-aim-place=""[^>]*aria-label="Move where it goes"/.test(creating) && />Edit Hero instead</.test(creating))
    const replacing = html({ kind: "replace", switchLabel: "Edit Hero instead", onSwitch: noop })
    check("replace: Replacing: Hero", /data-ask-scope="replace"/.test(replacing) && /Replacing:<\/span> Hero/.test(replacing))
    check("the new chip is the builder's near black, not violet, no gradient", /bg-\[#1a1a2e\]/.test(creating) && !/gradient|8b5cf6/.test(creating))

    const chat = code("components/website-builder/theme-chat.tsx")
    check("the chat reads the aim from the draft as it is typed", /resolveAim\(\{ prompt: draft, selected: selectedShape, choice: aimChoice, where: aimWhere \}\)/.test(chat))
    check("the router and the run are sent the aim, and a new section is never sent locked", /aim: \{ kind: now\.aim\.kind, by: now\.aim\.by \}/.test(chat) && /lockToSelection: lockNow && opts\.aim\?\.kind !== "new"/.test(chat) && /aim: wire \}\)/.test(chat))
    check("the writer is told the chip's place", /onWriteStart\?\.\(prompt, writePlace\.current\)/.test(chat))
    check("a tap is reset by another selection and by sending", /setAimChoice\("auto"\)\n    setAimWhere\(null\)\n  \}, \[selectedSectionId\]\)/.test(chat) && /The tap was for this message/.test(chat))
    check("Keep and Discard under the newest change; Discard is the run's undo", /data-ask-keep=""/.test(chat) && /data-ask-discard=""[\s\S]{0,80}onClick=\{\(\) => onUndo\(exchange\)\}/.test(chat))
    check("a run that wrote code, and a written section, are on review too", !/e\.activity\.code\.length > 0\) return null/.test(chat) && /onRunStart\(writeRun\)/.test(chat))
    const editor = code("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("Discard puts a run's code back through the code editor's own save", /run\.files\[path\] = pendingAiSources\.current\[path\] \?\? storelibSourcesRef\.current\[path\] \?\? null/.test(editor) && /putBack[\s\S]{0,600}method: "PUT"/.test(editor))
    check("a written section is one undo step, not two", /if \(!snapshotted\) pushUndo\(\)/.test(editor))
    const decide = code("app/api/website-builder/themes/[installId]/agent/decide/route.ts")
    check("the decide route reads the words itself for an older browser, and knows a Materia site", /readSelection\(body\.prompt, shape\)/.test(decide) && /MATERIA_INSTALL_MIN/.test(decide) && /materiaPurposes,/.test(decide))
    const agentRoute = code("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("the run route honours the aim over the lock", /selectionAim: \{ kind: body\.aim\.kind, index: body\.aim\.index \}/.test(agentRoute) && /body\.aim\?\.kind !== "new" && body\.aim\?\.kind !== "replace"/.test(agentRoute))
  }

  // ===========================================================================
  section("COPY: plain, in every language")
  // ===========================================================================
  {
    const words = ["New section", "Replacing:", "Move where it goes", "New section instead", "Edit {name} instead", "above {name}", "below {name}", "at the end of the page", "at the top of the page", "Describe the new section", "Keep", "Discard"]
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(?:ly)?|supercharge|transform)\b|—/i
    const langs = ["de", "es", "fr", "it", "pl", "pt-BR"]
    const missing: string[] = []
    for (const l of langs) {
      const cat = code(`lib/i18n/catalog/${l}.ts`)
      for (const w of words) if (!cat.includes(`${JSON.stringify(w)}:`)) missing.push(`${l}: ${w}`)
    }
    check("every new sentence is translated in all six languages", missing.length === 0, missing)
    const aimSource = code("lib/website-builder/section-aim.ts") + code("components/website-builder/ask-parts.tsx")
    const shipped = [...aimSource.matchAll(/tt\("([^"]+)"/g)].map((m) => m[1])
    check("no AI words and no em dash in what the chip says", words.concat(shipped).every((w) => !banned.test(w)))
    const guidance = code("lib/website-builder/agent/selection-intent.ts")
    check("nor in what the model is told to write", !/\b(unlock|elevate|seamless|powerful|supercharge)\b/i.test(guidance.replace(/never [^.]*\./gi, "")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailing:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((thrown) => {
  console.log(thrown)
  process.exit(1)
})
