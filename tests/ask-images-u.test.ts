/**
 * ===========================================================================
 *  ASK STORELIB, THE U ROUND: PICTURES, CODE A SECTION, ANSWERS THAT ACT,
 *  AND VOICE THAT KEEPS UP
 * ===========================================================================
 * The owner's ten requests, each held to what it does:
 *
 *   1  A PICTURE IS SEEN BY EVERY CALL    the writer's plan, write and review,
 *                                         and every turn of the page
 *                                         assistant, carry it as input_image
 *   2  ONE PICTURE, ONE THUMBNAIL         the same file by the picker, a
 *                                         paste and a drop is attached once
 *   3  ACCURACY OVER SPEED                plan, write, check, review, refine;
 *                                         Deep by default for code; more turns
 *   4  IT SAYS WHAT IT IS WORKING ON      "Editing Pricing", "New section: …"
 *   5  A NEW SECTION IS PUT ON THE PAGE   and the canvas goes to it; no code
 *                                         window in the chat
 *   6  CODE A SECTION IS THE DEFAULT      and the words always go
 *   7  WHAT WAS ASKED IS BUILT            SVG, keyframes, a photo slot; the
 *                                         worked example passes the gate
 *   8  VOICE                              sessions that restart, words at
 *                                         the caret, Android's repeats once
 *   9  ANSWERS THAT ACT                   Upload image, Paste image URL
 *
 * Pure where it can be; the composer itself is measured in a browser by
 * scripts/check-ask-attach.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { toInput } from "@/lib/sites/agent/openai-provider"
import type { AgentImage } from "@/lib/sites/agent/attachments"
import type { AgentProvider, ProviderRequest, ProviderTurn, ToolCall } from "@/lib/sites/agent/types"
import { writeSection, writeSectionSystem } from "@/lib/website-builder/agent/write-section"
import { checkImageTarget, selfCheckNote, subjectFor, themeAgent, MAX_TURNS, type ThemeAgentEvent } from "@/lib/website-builder/agent/loop"
import {
  CREATIVE_EXAMPLE,
  CREATIVE_RULES,
  emptyImageSlots,
  newSectionSubject,
  editingSubject,
  readPlan,
  readReview,
} from "@/lib/website-builder/agent/creative-section"
import { readAsk, ASK_TOOL } from "@/lib/website-builder/agent/ask"
import { describeMenus, editMenu } from "@/lib/website-builder/agent/menu-edits"
import { classifyRequest } from "@/lib/website-builder/agent/ambition"
import { validateSection } from "@/lib/storelib-ai"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { checkSectionSource } from "@/lib/website-builder/agent/compile-feedback"
import { instanceFromSchema } from "@/lib/website-builder/ai-placement"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { ThemeState } from "@/lib/website-builder/agent/operations"
import { fileKey, newFiles, pastedFiles, pictureFingerprint } from "@/lib/website-builder/ask-attach"
import { codeTarget, finishWrite, readWriteAnswer } from "@/lib/website-builder/ask-code-run"
import { EMPTY_ACTIVITY, reduceActivity, timelineRows } from "@/lib/website-builder/ask-activity"
import { DEFAULT_CODE_STRENGTH, DEFAULT_STRENGTH, defaultStrengthFor, effortOf, strengthKeyFor } from "@/lib/website-builder/ask-engines"
import { imageAnswer, imageOp, optionAction, readImageUrl } from "@/lib/sites/agent/questions"
import { anchorAt, composeDictation, joinHeard, shouldRestart, spokenSince, transcriptOf } from "@/lib/website-builder/ask-dictation"
import { typeToward } from "@/lib/website-builder/ask-typing"
import { MODES } from "@/components/website-builder/ask-parts"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const section = (name: string) => console.log(`\n${name}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** A real 4x4 PNG, as the composer sends one. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC"
const picture: AgentImage = { mediaType: "image/png", data: PNG, name: "romania.png" }

/** Every request a provider is handed, and the answers it gives in order. */
function recording(answers: Array<{ text?: string; calls?: Array<[string, Record<string, unknown>]>; stop?: ProviderTurn["stop"] }>) {
  const seen: ProviderRequest[] = []
  let i = 0
  const provider: AgentProvider = {
    id: "recording",
    async complete(request): Promise<ProviderTurn> {
      seen.push(request)
      const a = answers[Math.min(i++, answers.length - 1)]
      const toolCalls: ToolCall[] = (a.calls ?? []).map(([name, args], n) => ({ id: `c${i}_${n}`, name, argumentsJson: JSON.stringify(args) }))
      return {
        text: a.text ?? "",
        toolCalls,
        raw: [],
        usage: { inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
        stop: a.stop ?? (toolCalls.length ? "tool_calls" : "done"),
      }
    },
  }
  return { provider, seen }
}

/** How many input_image parts the OpenAI Responses payload for a request carries. */
function imagesInPayload(request: ProviderRequest): number {
  let n = 0
  for (const item of toInput(request.turns)) {
    const content = (item as { content?: unknown }).content
    if (Array.isArray(content)) for (const part of content) if ((part as { type?: string }).type === "input_image") n++
  }
  return n
}

const GOOD = CREATIVE_EXAMPLE.replace('"type": "flag_feature"', '"type": "romania_flag"').replace('"name": "Flag feature"', '"name": "Romania flag"')
const PLAN = [
  "NAME: Romania flag",
  "SEE: a portrait on the left, a flag on the right with a light sweep, a heading under it.",
  "ELEMENTS:",
  "- portrait of the president",
  "- the Romanian flag, blue yellow red",
  "- a shimmer animation around the flag",
  "BUILD: two columns, an SVG flag, a keyframe sweep.",
].join("\n")

async function main() {
  // ═════════════════════════════════════════════════════════════════════════
  section("1. The picture reaches every call the writer makes, as input_image")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const { provider, seen } = recording([{ text: PLAN }, { text: GOOD }, { text: "OK\n- portrait: the figure\n- flag: the svg" }])
    const events: string[] = []
    const out = await writeSection({
      provider,
      model: "test",
      prompt: "a section with the president of Romania's image and a flag, with a CSS animation shimmering around Romania",
      images: [picture],
      takenTypes: [],
      takenNames: [],
      effort: "high",
      onEvent: (e) => events.push(`${e.type}:${"text" in e ? e.text : `${e.label}:${e.state}`}`),
    })
    check("the section is written", out.ok === true, out.ok === false ? out.error : "")
    check("three calls: the plan, the file, the review", seen.length === 3, seen.length)
    check(
      "the picture rides on the first turn of every one of them",
      seen.every((r) => (r.turns[0] as { images?: AgentImage[] }).images?.[0]?.data === PNG),
      seen.map((r) => (r.turns[0] as { images?: AgentImage[] }).images?.length ?? 0),
    )
    check(
      "and reaches the Responses API as input_image on every call",
      seen.every((r) => imagesInPayload(r) === 1),
      seen.map(imagesInPayload),
    )
    check("as a data URL at high detail", (() => {
      const first = toInput(seen[0].turns)[0] as { content: Array<{ type: string; image_url?: string; detail?: string }> }
      return first.content[0].type === "input_image" && first.content[0].image_url === `data:image/png;base64,${PNG}` && first.content[0].detail === "high"
    })())
    check("the creator's words are on every call too, beside the picture", seen.every((r) => /REQUEST\na section with the president of Romania/.test(String((r.turns[0] as { content: string }).content))))
    check("the plan asks it to describe what it sees first", /STEP 1 OF 3: PLAN/.test(String((seen[0].turns[0] as { content: string }).content)) && /SEE: what the picture shows/.test(String((seen[0].turns[0] as { content: string }).content)))
    check("the review compares the file with the picture, element by element", /STEP 3 OF 3: CHECK YOUR FILE/.test(String((seen[2].turns[seen[2].turns.length - 1] as { content: string }).content)) && /the Romanian flag, blue yellow red/.test(String((seen[2].turns[seen[2].turns.length - 1] as { content: string }).content)))
    check("Deep thinking is passed to the provider", seen.every((r) => r.effort === "high"))
    check("it says what it is making: New section, then its name", events.includes("subject:New section") && events.includes("subject:New section: Romania flag"))
    check("its steps are said as they happen, the picture first", events.includes("step:Reading your picture and planning:running") && events.includes("step:Comparing it with your picture:done"))
    check("and the plan's elements are shown", events.some((e) => e.startsWith("plan:") && /the Romanian flag/.test(e)))
    check("the photo slot is offered for upload", out.ok === true && out.value.imageSlots?.[0]?.setting === "portrait")
    check("the review said OK, so the first file stands", out.ok === true && out.value.reviewed === "ok")
  }

  /* The page assistant: every turn resends the first, picture and all. */
  {
    const { provider, seen } = recording([
      { calls: [["read_section", { id: "hero-1" }]] },
      { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Romania" }) }]] },
      { text: "Changed the hero." },
    ])
    const state: ThemeState = { sections: [mk("header-1", "header"), mk("hero-1", "hero"), mk("footer-1", "footer")], settings: {} }
    const loop = themeAgent({ provider, model: "test", prompt: "make the hero look like this", images: [picture], state, page: "home", addable: ADDABLE_SECTIONS })
    for (let s = await loop.next(); !s.done; s = await loop.next()) {
      /* drained */
    }
    check("the page assistant made three calls", seen.length === 3, seen.length)
    check("and every one carried the picture as input_image", seen.every((r) => imagesInPayload(r) === 1), seen.map(imagesInPayload))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("3. Accuracy over speed: the review refines, and never loses a file")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const refined = GOOD.replace('"default": "A heading about this"', '"default": "Romania, in colour"')
    const { provider, seen } = recording([{ text: PLAN }, { text: GOOD }, { text: refined }])
    const out = await writeSection({ provider, model: "test", prompt: "a flag section", takenTypes: [], takenNames: [] })
    check("a review that sends a better file replaces the first", out.ok === true && out.value.reviewed === "refined" && out.value.source.includes("Romania, in colour"), out.ok ? out.value.reviewed : out.error)
    check("the refined file kept its own type and name", out.ok === true && out.value.type === "romania_flag" && out.value.name === "Romania flag")
    check("and the review was asked for once", seen.length === 3)
  }
  {
    const broken = GOOD.replace("</schema>", "")
    const { provider } = recording([{ text: PLAN }, { text: GOOD }, { text: broken.replace(/^/, "") }])
    const out = await writeSection({ provider, model: "test", prompt: "a flag section", takenTypes: [], takenNames: [] })
    check("a review whose file would not compile leaves the first one standing", out.ok === true && out.value.source === GOOD && out.value.reviewed !== "refined", out.ok ? out.value.reviewed : out.error)
  }
  {
    const { provider } = recording([{ text: PLAN }, { text: GOOD }])
    let calls = 0
    const counting: AgentProvider = { id: "x", complete: (r) => (++calls === 3 ? Promise.reject(new Error("deadline")) : provider.complete(r)) }
    const out = await writeSection({ provider: counting, model: "test", prompt: "a flag section", takenTypes: [], takenNames: [] })
    check("a review that fails keeps the file that passed", out.ok === true && out.value.source === GOOD && out.value.reviewed === "kept")
  }
  {
    const { provider, seen } = recording([{ text: PLAN }, { text: GOOD }])
    const out = await writeSection({ provider, model: "test", prompt: "a flag section", takenTypes: [], takenNames: [], deadlineAt: Date.now() + 10_000 })
    check("too close to the deadline, the review is not started", out.ok === true && out.value.reviewed === "skipped" && seen.length === 2)
  }
  {
    /* A file that compiles and throws when drawn with its own preset is sent back, like a compile error. */
    const throws = GOOD.replace("{{ settings.heading }}", "{{ settings.heading | nope_filter }}")
    const { provider, seen } = recording([{ text: PLAN }, { text: throws }, { text: GOOD }, { text: "OK" }])
    const out = await writeSection({ provider, model: "test", prompt: "a flag section", takenTypes: [], takenNames: [] })
    check("a file the gate refuses is sent back with the reason, and the fixed one kept", out.ok === true && seen.length >= 3 && out.value.source === GOOD, out.ok ? "" : out.error)
  }
  check("Code a section thinks on Deep by default, a page change on Standard", DEFAULT_CODE_STRENGTH === "deep" && defaultStrengthFor("code") === "deep" && defaultStrengthFor("change") === DEFAULT_STRENGTH && effortOf("deep") === "high")
  check("each mode keeps its own Strength", strengthKeyFor("code") !== strengthKeyFor("change"))
  check("the code route asks for high when the panel sends nothing", /effort: parsed\.data\.effort \?\? "high"/.test(read("app/api/website-builder/themes/[installId]/sections/code/route.ts")))
  check("the panel sends Code a section's own Strength with a new section", /effort: live\.current\.codeEffort,/.test(read("components/website-builder/theme-chat.tsx")))
  check("the page assistant may take more turns", MAX_TURNS >= 24 && classifyRequest("design a complete FAQ section").maxTurns >= 32 && classifyRequest("make the heading red").maxTurns >= 10)
  check("and the route gives it five minutes, like the writer", /export const maxDuration = 300/.test(read("app/api/website-builder/themes/[installId]/agent/route.ts")))

  /* The self check: after it thinks it is done, it reads its work back once. */
  {
    const { provider, seen } = recording([
      { calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "Romania" }) }]] },
      { text: "Changed the hero." },
      { text: "Changed the hero heading to Romania." },
    ])
    const state: ThemeState = { sections: [mk("header-1", "header"), mk("hero-1", "hero"), mk("footer-1", "footer")], settings: {} }
    const events: ThemeAgentEvent[] = []
    const loop = themeAgent({ provider, model: "test", prompt: "make the hero about Romania", state, page: "home", addable: ADDABLE_SECTIONS, selfCheck: true, maxReviews: 0 })
    let s = await loop.next()
    for (; !s.done; s = await loop.next()) events.push(s.value)
    const last = seen[seen.length - 1]
    const note = String((last.turns[last.turns.length - 1] as { content?: string }).content ?? "")
    check("it is asked to read its work back once before it finishes", seen.length === 3 && /BEFORE YOU FINISH, READ YOUR WORK BACK/.test(note), seen.length)
    check("the chat says so while it does", events.some((e) => e.type === "step" && e.label === "Checking every part you asked for" && e.state === "running") && events.some((e) => e.type === "step" && e.label === "Checking every part you asked for" && e.state === "done"))
    check("and its last sentence is the answer", s.value.message === "Changed the hero heading to Romania.")
    check("with a picture the read back is against the picture too", /and the picture/.test(selfCheckNote(true)) && !/and the picture/.test(selfCheckNote(false)))
    check("the route turns it on for anything built, coded or from a picture", /selfCheck: "auto",/.test(read("app/api/website-builder/themes/[installId]/agent/route.ts")))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("4. It says plainly what it is working on")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const state: ThemeState = { sections: [mk("header-1", "header"), mk("hero-1", "hero", "Pricing"), mk("footer-1", "footer")], settings: {} }
    check("an edit to a section is Editing <its name>", subjectFor("update_section", JSON.stringify({ id: "hero-1" }), state) === "Editing Pricing")
    check("a section being added is New section: <its kind>", subjectFor("add_section", JSON.stringify({ sectionType: "faq" }), state) === newSectionSubject(SECTION_SCHEMAS.faq.name))
    check("a read says nothing", subjectFor("read_section", JSON.stringify({ id: "hero-1" }), state) === "")
    check("the words", editingSubject("Pricing") === "Editing Pricing" && newSectionSubject("Hero with flag") === "New section: Hero with flag")
    const { provider } = recording([{ calls: [["update_section", { id: "hero-1", settingsJson: JSON.stringify({ heading: "x" }) }]] }, { text: "Done." }])
    const events: ThemeAgentEvent[] = []
    const loop = themeAgent({ provider, model: "test", prompt: "tighten this", state, page: "home", addable: ADDABLE_SECTIONS, selectedSectionId: "hero-1", lockToSelection: true })
    for (let s = await loop.next(); !s.done; s = await loop.next()) events.push(s.value)
    const first = events.findIndex((e) => e.type === "subject")
    check("locked to a section, the run says Editing <name> before anything else it does", first === 0 && (events[0] as { text: string }).text === "Editing Pricing", events.slice(0, 2))
    const activity = events.reduce((a, e) => reduceActivity(a, e as unknown as Record<string, unknown>), EMPTY_ACTIVITY)
    check("the chat keeps it over the steps", activity.subject === "Editing Pricing")
    const chat = read("components/website-builder/theme-chat.tsx")
    check("and draws it over the line while it works", /data-ask-subject=""/.test(chat) && /\{exchange\.running && activity\.subject && \(/.test(chat))
    check("the canvas is told the same words with the sections it marks", /onWorkingChange\?\.\(\[\.\.\.working\], subject \|\| undefined\)/.test(chat) && /onWorkingChange\?\.\(\[WRITING_SECTION_ID\], subject\)/.test(chat))
    const overlay = read("components/website-builder/editor/ai-working-overlay.tsx")
    check("and labels the section with them", /data-ai-label=""/.test(overlay) && /\{label\}/.test(overlay) && /label=\{aiWorkingLabel\}/.test(read("app/website-builder/editor/[installId]/page.tsx")))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("5. A new section goes on the page, the canvas goes to it, and no code window")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const placed: string[] = []
    const finished: string[][] = []
    const outcome = await finishWrite(
      { status: 200, path: "sections/romania_flag.storelib", type: "romania_flag", name: "Romania flag", imageSlots: [{ setting: "portrait", label: "Portrait" }] },
      { place: (s) => (placed.push(s.type), "romania_flag-1"), finished: (ids) => finished.push(ids), plainError: () => "x" },
    )
    check("it is handed to the editor by type", placed.join() === "romania_flag")
    check("and the canvas is sent to the placed section, which is the scroll and the ring", finished.length === 1 && finished[0][0] === "romania_flag-1")
    check("the chat says one line", outcome.reply === "Added Romania flag to the page.")
    check("with View code for the file, not the file", outcome.written?.path === "sections/romania_flag.storelib")
    check("and offers the photo slot, aimed at the placed section", outcome.offer?.target.sectionId === "romania_flag-1" && outcome.offer.target.setting === "portrait" && outcome.offer.options.join() === "Upload image,Paste image URL" && outcome.offer.offer === true)
    const notPlaced = await finishWrite({ status: 200, path: "sections/a.storelib", type: "a", name: "A" }, { place: () => false, finished: (ids) => finished.push(ids), plainError: () => "x" })
    check("not placed: no scroll, and it says where it is", finished.length === 1 && /Add it from Add Section, under Created/.test(notPlaced.reply ?? ""))
    const answered = await finishWrite({ status: 200, reply: "Which plans?" }, { place: () => "x", finished: (ids) => finished.push(ids), plainError: () => "x" })
    check("an answer instead of a file is a conversation", answered.answered === true && answered.reply === "Which plans?" && !answered.written)

    /* What the writer streams draws as steps, and no code row. */
    const { provider } = recording([{ text: PLAN }, { text: GOOD }, { text: "OK" }])
    let activity = EMPTY_ACTIVITY
    await writeSection({ provider, model: "test", prompt: "a flag", takenTypes: [], takenNames: [], onEvent: (e) => (activity = reduceActivity(activity, e as unknown as Record<string, unknown>)) })
    check("the writer's steps reach the chat", activity.steps.length >= 4 && activity.subject === "New section: Romania flag")
    check("and nothing in them is a file: no code window", activity.code.length === 0 && timelineRows(activity).every((r) => r.kind !== "code"))
    const ui = read("components/website-builder/ask-activity.tsx")
    check("a file the page assistant wrote is one folded line, View code, the source only when asked", /const \[open, setOpen\] = React\.useState\(false\)/.test(ui) && /\{open \? "Hide code" : "View code"\}/.test(ui) && /\{open && \(\s*\/\*[^*]*\*\/\s*<pre/.test(ui))
    check("the old card with its Open the code button is gone", !/Open the code/.test(read("components/website-builder/theme-chat.tsx")))
    check("the editor answers with the placed section's id", /return id\n\s*\},\n\s*\[loadStorelibSources, pushUndo, revealSection\]/.test(read("app/website-builder/editor/[installId]/page.tsx")))

    /* The stream reader hands every line to the chat as it lands, and the answer at the end. */
    const body = [
      JSON.stringify({ type: "conversation", id: "c1", title: "t" }),
      JSON.stringify({ type: "subject", text: "New section: Romania flag" }),
      JSON.stringify({ type: "step", id: "plan", label: "Planning the section", state: "done" }),
      JSON.stringify({ type: "result", status: 200, answer: { path: "sections/a.storelib", type: "a", name: "A" } }),
    ].join("\n")
    const lines: string[] = []
    const answer = await readWriteAnswer(new Response(body, { headers: { "content-type": "application/x-ndjson" } }), (l) => lines.push(String(l.type)))
    check("the stream is read line by line, then the answer", lines.join() === "conversation,subject,step" && answer.status === 200 && answer.name === "A")
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("6. Code a section is the default, and the words always go")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const chat = read("components/website-builder/theme-chat.tsx")
    check("the box starts in Code a section", /initialMode = "code",/.test(chat) && /React\.useState<AskMode>\(initialMode\)/.test(chat) && !/initialMode=/.test(read("app/website-builder/editor/[installId]/page.tsx")))
    check("and it is the first of the two, where the eye starts", MODES[0][0] === "code" && MODES[1][0] === "change")
    check("switching is one press, or an arrow key", /event\.key !== "ArrowLeft" && event\.key !== "ArrowRight"/.test(read("components/website-builder/ask-parts.tsx")))
    check("with no section open, Code a section writes a new one", codeTarget("make it nicer", { selectedId: null, locked: false }) === "new")
    check("with one open and in scope, it changes that section's code", codeTarget("make the cards slide in", { selectedId: "hero-1", locked: true }) === "edit" && codeTarget("edit this to look like this image", { selectedId: "hero-1", locked: true }) === "edit")
    check("unless the words ask for a section of their own", ["build me a section like this image", "add a new section with a flag", "a section with the president's image and a flag", "copy this section"].every((p) => codeTarget(p, { selectedId: "hero-1", locked: true }) === "new"))
    check("scope cleared, it is a new section", codeTarget("make the cards slide in", { selectedId: "hero-1", locked: false }) === "new")
    check("the edit goes to the page assistant as code", /if \(target === "edit"\) void send\(prompt, images, quiet, \{ codeFocus: true \}\)/.test(chat) && /codeFocus: body\.codeFocus === true && !!selected/.test(read("app/api/website-builder/themes/[installId]/agent/route.ts")))
    const writeOne = chat.slice(chat.indexOf("const writeOne = React.useCallback("), chat.indexOf("const dispatch = React.useCallback("))
    check("a new section's request carries the words and the pictures", /body: JSON\.stringify\(\{\s*prompt,\s*images: images\.map/.test(writeOne))
    const send = chat.slice(chat.indexOf("const send = React.useCallback("), chat.indexOf("const writeOne = React.useCallback("))
    check("so does a page change", /JSON\.stringify\(\{\s*prompt,\s*images: images\.map/.test(send))
    const submit = chat.slice(chat.indexOf("const submit = React.useCallback("), chat.indexOf("const answerQuestion = React.useCallback("))
    check("a message typed while a section is being written is queued, not dropped", /if \(busy \|\| writing\) \{[\s\S]{0,300}setQueued\(\{ text: prompt, mode \}\)/.test(submit) && !/if \(writing\) return/.test(submit))
    check("and the box is only emptied once its words have somewhere to go", submit.indexOf("setDraft(\"\")") > submit.indexOf("if (!prompt) return"))
    const { provider, seen } = recording([{ text: "REPLY: x" }])
    await writeSection({ provider, model: "test", prompt: "make it like this", images: [picture], takenTypes: [], takenNames: [] })
    check("with a picture attached the words still reach the model", /REQUEST\nmake it like this/.test(String((seen[0].turns[0] as { content: string }).content)) && imagesInPayload(seen[0]) === 1)
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("2. One picture, one thumbnail")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const shot = { name: "Screenshot.png", size: 52_311, type: "image/png", lastModified: 1_760_000_000_000 }
    const taken = new Set<string>()
    const viaInput = newFiles([shot], taken)
    for (const f of viaInput) taken.add(fileKey(f))
    const viaPaste = newFiles([{ ...shot }], taken)
    const viaDrop = newFiles([{ ...shot }], taken)
    check("the same file by the picker, a paste and a drop in one moment is attached once", viaInput.length === 1 && viaPaste.length === 0 && viaDrop.length === 0)
    check("twice in one drop is once", newFiles([shot, { ...shot }], new Set()).length === 1)
    check("two different screenshots are both kept", newFiles([shot, { ...shot, name: "Screenshot 2.png", size: 1 }], new Set()).length === 2)
    check("a paste holding the same picture as a PNG and a TIFF is one picture", pastedFiles([{ name: "image.png", type: "image/png" }, { name: "image.tiff", type: "image/tiff" }]).length === 1)
    check("the same pixels by another name are known by their fingerprint", pictureFingerprint(PNG) === pictureFingerprint(`${PNG}`) && pictureFingerprint(PNG) !== pictureFingerprint(`${PNG}A`))
    const chat = read("components/website-builder/theme-chat.tsx")
    check("a drop is attached by the panel only (the composer had its own and attached twice)", (chat.match(/void attach\(event\.dataTransfer\.files\)/g) ?? []).length === 1)
    check("the keys are written the moment a file is taken, not on the next render", /attachKeys\.current\.set\(fileKey\(file\), id\)/.test(chat) && /newFiles\(Array\.from\(files\), new Set\(attachKeys\.current\.keys\(\)\)\)/.test(chat))
    check("a prepared picture already in the box by its fingerprint is let go", /if \(other !== id && seen === print\)/.test(chat))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("7. What was asked for is built: SVG, keyframes, a photo slot")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const v = validateSection(CREATIVE_EXAMPLE, { path: "sections/flag_feature.storelib", expectType: "flag_feature", strict: true })
    check("the worked example passes the strict gate", v.ok === true, v.ok === false ? v.feedback : "")
    const compiled = compileSection(CREATIVE_EXAMPLE, { file: "sections/flag_feature.storelib", expectType: "flag_feature" })
    const drawn = compiled.ok
      ? checkSectionSource({ path: "sections/flag_feature.storelib", type: "flag_feature", source: CREATIVE_EXAMPLE, instances: [instanceFromSchema("f1", "flag_feature", compiled.value.schema as never)], strict: true })
      : { ok: false }
    check("and draws with its own preset", drawn.ok === true)
    check("it draws a flag in SVG, a light sweeping across it, a pulsing glow, all stopped for reduced motion", /<svg viewBox="0 0 3 2"/.test(CREATIVE_EXAMPLE) && /@keyframes fx-sweep/.test(CREATIVE_EXAMPLE) && /@keyframes fx-glow/.test(CREATIVE_EXAMPLE) && /prefers-reduced-motion: reduce\) \{ \.fx__flag, \.fx__shine \{ animation: none; \} \}/.test(CREATIVE_EXAMPLE))
    check("the flag's colours are colour settings with its real values", /"id": "stripe_1", "label": "Stripe 1", "default": "#002B7F"/.test(CREATIVE_EXAMPLE))
    check("the photo is an image_picker with an in-editor placeholder", /\{% elsif page\.in_editor %\}/.test(CREATIVE_EXAMPLE) && compiled.ok && emptyImageSlots(compiled.value.schema as never)[0]?.setting === "portrait")
    check("the writer is shown all of it, and told to build every part", writeSectionSystem().includes(CREATIVE_RULES) && /BUILD WHAT WAS ASKED, ALL OF IT/.test(writeSectionSystem()))
    check("and the T1 rules stand beside it: image_picker, a colour per element, menus", /image_picker/.test(writeSectionSystem()) && /a color setting per element/.test(writeSectionSystem()) && /link_list/.test(writeSectionSystem()))
    const plan = readPlan(PLAN)
    check("a plan is read for its name and every element", plan.name === "Romania flag" && plan.elements.length === 3 && /shimmer/.test(plan.elements[2]) && /portrait on the left/.test(plan.seen))
    check("a review is OK, a file, or neither", readReview("OK - all there").kind === "ok" && readReview(GOOD).kind === "file" && readReview("I think it is fine").kind === "unclear")
    check("no em dash in what the model is told here", !/—/.test(CREATIVE_RULES))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("9. Upload image and Paste image URL do what they say")
  // ═════════════════════════════════════════════════════════════════════════
  {
    check("the pills are read as actions", optionAction("Upload image") === "upload_image" && optionAction("Paste image URL") === "image_url" && optionAction("Upload a photo") === "upload_image" && optionAction("Use a link") === "image_url" && optionAction("Hero") === null)
    check("an https address is taken", readImageUrl(" https://cdn.example.com/p.jpg ").ok === true)
    check("and a path on the site", readImageUrl("/images/me.jpg").ok === true)
    check("http, javascript:, data: and nonsense are refused in words", [readImageUrl("http://x.com/a.png"), readImageUrl("javascript:alert(1)"), readImageUrl("data:image/png;base64,AA"), readImageUrl("not a url"), readImageUrl("//evil.com/a.png")].every((r) => r.ok === false && r.error.length > 10))
    check("the picture goes into the section setting", JSON.stringify(imageOp({ sectionId: "hero-1", setting: "hero_image" }, "https://x.com/a.jpg")) === JSON.stringify({ kind: "update_section", id: "hero-1", settings: { hero_image: "https://x.com/a.jpg" } }))
    check("or a block's", JSON.stringify(imageOp({ sectionId: "s1", blockId: "b1", setting: "image" }, "/a.jpg")) === JSON.stringify({ kind: "update_block", sectionId: "s1", blockId: "b1", settings: { image: "/a.jpg" } }))
    const answer = imageAnswer({ sectionId: "hero-1", setting: "hero_image", label: "portrait" }, "https://x.com/a.jpg", "upload_image")
    check("and the run is told, as the next message, that it is in and where", /I uploaded portrait: https:\/\/x\.com\/a\.jpg/.test(answer) && /set as hero_image on \[hero-1\]/.test(answer) && /carry on/.test(answer))

    check("ask_creator names the picture setting (strict: every field required)", (ASK_TOOL.parameters as { required: string[] }).required.join() === "question,options,why,imageSectionId,imageBlockId,imageSetting")
    const read1 = readAsk(JSON.stringify({ question: "Please upload or paste the portrait", options: ["Upload image", "Paste image URL"], why: "The section shows it.", imageSectionId: "hero-1", imageBlockId: "", imageSetting: "hero_image" }), "q1", { products: null, asked: 0 })
    check("a picture question keeps where the picture goes", "question" in read1 && read1.question.target?.sectionId === "hero-1" && read1.question.target.setting === "hero_image")
    const state: ThemeState = { sections: [mk("header-1", "header"), mk("hero-1", "hero"), mk("footer-1", "footer")], settings: {} }
    check("checked against the page: a real image setting, with its label", checkImageTarget({ sectionId: "hero-1", setting: "hero_image" }, state)?.label === "Side image")
    check("a setting that is not a picture, or a section not on the page, is dropped", checkImageTarget({ sectionId: "hero-1", setting: "heading" }, state) === null && checkImageTarget({ sectionId: "nope", setting: "hero_image" }, state) === null)

    /* The whole way through the loop: the question event carries the target. */
    const { provider } = recording([{ calls: [["ask_creator", { question: "Please upload or paste the portrait", options: ["Upload image", "Paste image URL"], why: "It goes in the hero.", imageSectionId: "hero-1", imageBlockId: "", imageSetting: "hero_image" }]] }])
    const events: ThemeAgentEvent[] = []
    const loop = themeAgent({ provider, model: "test", prompt: "add the president's portrait to the hero", state, page: "home", addable: ADDABLE_SECTIONS })
    for (let s = await loop.next(); !s.done; s = await loop.next()) events.push(s.value)
    const q = events.find((e) => e.type === "question") as Extract<ThemeAgentEvent, { type: "question" }> | undefined
    check("the run's question names the setting", q?.target?.sectionId === "hero-1" && q.target.setting === "hero_image" && q.target.label === "Side image")
    const activity = reduceActivity(EMPTY_ACTIVITY, q as unknown as Record<string, unknown>)
    check("and the chat reads it, so its pills act", activity.question?.target?.setting === "hero_image")
    const parts = read("components/website-builder/ask-parts.tsx")
    check("Upload image opens the file picker and uploads", /if \(action === "upload_image" && onUpload\) \{[\s\S]{0,120}fileRef\.current\?\.click\(\)/.test(parts) && /const url = await onUpload\(file\)\s*\n\s*onImage\(url, "upload_image", uploadOption\.current\)/.test(parts))
    check("Paste image URL shows an address box with a preview that must load", /<ImageUrlField/.test(parts) && /onLoad=\{\(\) => setLoaded\("ok"\)\}/.test(parts) && /disabled=\{!usable\}/.test(parts))
    const chat = read("components/website-builder/theme-chat.tsx")
    check("the picture is applied at once, and the run continues with the answer", /onOp\(imageOp\(target, url\) as ThemeOp\)/.test(chat) && /void send\(imageAnswer\(target, url, how\), \[\], false, \{ display: option, shown: \[shown\] \}\)/.test(chat))
    check("uploads go to the creator's own folder in the media bucket", /const path = `\$\{user\.id\}\/ai\//.test(read("lib/website-builder/ask-image-upload.ts")) && /confirmUpload\("store-builder-images", path\)/.test(read("lib/website-builder/ask-image-upload.ts")))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("8. Voice: the words keep coming, at the caret")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const r = (isFinal: boolean, transcript: string) => ({ isFinal, 0: { transcript } })
    check("a session is read whole: what it is sure of, and what it may change", JSON.stringify(transcriptOf([r(true, "make the hero"), r(false, "taller")])) === JSON.stringify({ final: "make the hero", interim: "taller" }))
    check("Android repeating an earlier phrase counts it once", transcriptOf([r(true, "make the"), r(true, "make the hero red")]).final === "make the hero red" && transcriptOf([r(true, "hello"), r(true, "hello")]).final === "hello")
    check("a new session after a pause keeps what the old one heard", joinHeard("make the hero", "taller please") === "make the hero taller please")
    const anchor = anchorAt("Add  please", 4)
    const said = composeDictation(anchor, "a flag")
    check("the words go at the caret, with what was after it kept after them", said.text === "Add a flag please" && said.caret === "Add a flag".length, said)
    check("and the caret lands just after them", composeDictation(anchorAt("Make it ", 8), "blue").caret === "Make it blue".length)
    check("no caret: at the end", composeDictation(anchorAt("Make it", null), "blue").text === "Make it blue")
    check("before punctuation, no space is added", composeDictation(anchorAt("Make it.", 7), "blue").text === "Make it blue.")
    check("typing mid recording keeps what was typed: later words are what came after", spokenSince("make the hero", "make the hero taller") === "taller" && spokenSince("", "hi there") === "hi there")
    check("a revision of what was already placed brings back only the changed end", spokenSince("make the hero", "make the hair") === "air")
    check("while recording, a session that ends is followed by another", shouldRestart({ wanted: true, elapsedSeconds: 12, limitSeconds: 60, quickEnds: 0 }) === true)
    check("but not after Stop, past the limit, or three quick ends in a row", !shouldRestart({ wanted: false, elapsedSeconds: 1, limitSeconds: 60, quickEnds: 0 }) && !shouldRestart({ wanted: true, elapsedSeconds: 60, limitSeconds: 60, quickEnds: 0 }) && !shouldRestart({ wanted: true, elapsedSeconds: 5, limitSeconds: 60, quickEnds: 3 }))
    /* A recording played through: interim words typing in, a pause, a new session, a revision. */
    let shown = ""
    const playTo = (target: string) => {
      for (let i = 0; i < 400 && shown !== target; i++) shown = typeToward(shown, target)
      return shown
    }
    const a = anchorAt("Make ", 5)
    playTo(joinHeard("", "the hero"))
    playTo(joinHeard("the hero", "red"))
    const end = composeDictation(a, playTo(joinHeard("the hero", "bold red")))
    check("a whole recording ends with exactly what was heard, where the caret was", end.text === "Make the hero bold red", end.text)
    const voice = read("components/website-builder/ask-voice.ts")
    check("the recogniser restarts while the person is still recording", /if \(!failed && shouldRestart\(\{ wanted: wanted\.current/.test(voice) && /if \(session\(\)\) return/.test(voice))
    check("silence and a dropped connection end a session, not the recording", /if \(isTransientSpeechError\(event\.error\) && wanted\.current\) return/.test(voice))
    check("Stop is the last session", /wanted\.current = false\s*\n\s*if \(recognition\.current\) \{\s*\n\s*recognition\.current\.stop\(\)/.test(voice))
    check("the page's audio session lets the recogniser hear, as it does a recording", /openMicrophoneSession\(\)\s*\n\s*wanted\.current = true/.test(voice))
    const chat = read("components/website-builder/theme-chat.tsx")
    check("typing while it listens wins, and the next words go at the new caret", /if \(listening\) rebaseVoice\(event\.target\.value, event\.target\.selectionStart\)/.test(chat))
    check("the words start where the caret is", /anchor\.current = anchorAt\(draft, caret\)/.test(chat))
  }

  // ═════════════════════════════════════════════════════════════════════════
  section("Navigation is the Main menu: the AI edits the menu, never nav_link blocks")
  // ═════════════════════════════════════════════════════════════════════════
  {
    const header: SectionInstance = {
      id: "header-1",
      type: "header",
      name: "Header",
      settings: {},
      blocks: [
        { id: "n1", type: "nav_link", settings: { label: "Shop", url: "/shop", link_type: "custom" } },
        { id: "n2", type: "nav_link", settings: { label: "About", url: "/pages/about", link_type: "custom" } },
      ],
    }
    const footerMenu = { title: "Footer", links: [{ title: "Terms", url: "/policies/terms" }] }
    const state: ThemeState = { sections: [header, mk("hero-1", "hero"), mk("footer-1", "footer")], settings: { menus: { footer: footerMenu } } }
    check("read_menus says which menu the header shows, and every menu's links", /THE HEADER SHOWS: main-menu/.test(describeMenus(state)) && /- Shop -> \/shop/.test(describeMenus(state)) && /footer "Footer"/.test(describeMenus(state)))
    const added = editMenu(JSON.stringify({ menu: "main-menu", action: "add", link: "", title: "Pricing", url: "/pages/pricing", index: -1 }), state)
    const themeOp = added.ops?.find((o) => o.kind === "update_theme") as { settings: { menus: Record<string, { links: { title: string }[] }> } } | undefined
    check("adding a link writes the Main menu: the header's links, then the new one", themeOp?.settings.menus["main-menu"].links.map((l) => l.title).join() === "Shop,About,Pricing", themeOp?.settings.menus)
    check("every other menu is carried over as it was", JSON.stringify(themeOp?.settings.menus.footer) === JSON.stringify(footerMenu))
    check("the header is pointed at the Main menu, its own blocks untouched", added.ops?.some((o) => o.kind === "update_section" && o.id === "header-1" && (o.settings as { menu?: string }).menu === "main-menu") === true && !added.ops?.some((o) => o.kind === "add_block" || o.kind === "remove_block" || o.kind === "update_block"))
    let after = state
    for (const op of added.ops ?? []) after = { ...after, ...(op.kind === "update_theme" ? { settings: { ...after.settings, ...op.settings } } : { sections: after.sections.map((s) => (op.kind === "update_section" && s.id === op.id ? { ...s, settings: { ...s.settings, ...op.settings } } : s)) }) }
    const renamed = editMenu(JSON.stringify({ menu: "main-menu", action: "update", link: "shop", title: "Store", url: "", index: -1 }), after)
    const renamedMenus = (renamed.ops?.find((o) => o.kind === "update_theme") as { settings: { menus: Record<string, { links: { title: string; url: string }[] }> } }).settings.menus
    check("a rename changes that link only, and the header is not pointed twice", renamedMenus["main-menu"].links.map((l) => `${l.title} ${l.url}`).join() === "Store /shop,About /pages/about,Pricing /pages/pricing" && renamed.ops?.length === 1)
    const removed = editMenu(JSON.stringify({ menu: "main-menu", action: "remove", link: "Nope", title: "", url: "", index: -1 }), after)
    check("a link that is not there is refused, naming the ones that are", removed.failed === true && /Shop, About, Pricing/.test(removed.output) && !removed.ops)
    const unsafe = editMenu(JSON.stringify({ menu: "main-menu", action: "add", link: "", title: "Bad", url: "javascript:alert(1)", index: 0 }), after)
    const unsafeLink = (unsafe.ops?.find((o) => o.kind === "update_theme") as { settings: { menus: Record<string, { links: { title: string; url: string }[] }> } }).settings.menus["main-menu"].links[0]
    check("an unsafe address is made safe by the theme's own cleaner", unsafeLink.title === "Bad" && !/javascript/i.test(unsafeLink.url))
    const { provider } = recording([{ calls: [["edit_menu", { menu: "main-menu", action: "add", link: "", title: "Pricing", url: "/pages/pricing", index: -1 }]] }, { text: "Added Pricing to the menu." }])
    const events: ThemeAgentEvent[] = []
    const loop = themeAgent({ provider, model: "test", prompt: "add a Pricing link to the menu", state, page: "home", addable: ADDABLE_SECTIONS })
    let s = await loop.next()
    for (; !s.done; s = await loop.next()) events.push(s.value)
    check("through the loop: the run's operations are the menu edit, and they reach the editor", s.value.status === "succeeded" && s.value.ops.some((o) => o.kind === "update_theme") && events.some((e) => e.type === "op" && e.label === "Changed the menu"))
    const lockedLoop = themeAgent({ provider: recording([{ calls: [["edit_menu", { menu: "main-menu", action: "remove", link: "Shop", title: "", url: "", index: -1 }]] }, { text: "x" }]).provider, model: "test", prompt: "x", state, page: "home", addable: ADDABLE_SECTIONS, selectedSectionId: "hero-1", lockToSelection: true })
    let l = await lockedLoop.next()
    for (; !l.done; l = await lockedLoop.next()) {
      /* drained */
    }
    check("locked to one section, a menu edit is refused", !l.value.ops.some((o) => o.kind === "update_theme"))
    const system = read("lib/website-builder/agent/loop.ts")
    check("the rule says navigation is the Main menu and never nav_link blocks", /THE HEADER'S NAVIGATION IS THE MAIN MENU/.test(system) && /Never add, change or remove nav_link blocks for this/.test(system) && !/its nav_link blocks, or its menu setting/.test(system))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailing:\n${failures.map((f) => `  ${f}`).join("\n")}`)
    process.exit(1)
  }
}

function mk(id: string, type: string, name?: string): SectionInstance {
  return { id, type, name: name ?? SECTION_SCHEMAS[type]?.name ?? type, settings: {}, blocks: [] }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
