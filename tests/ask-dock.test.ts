/**
 * ===========================================================================
 *  ASK STORELIB: THE LIVE LINE, SUGGESTIONS, PICTURES, VOICE AND UNDO
 * ===========================================================================
 * The logic under this round's chat, held to its behaviour with made up
 * streams, pages and recordings. What it looks like and how it moves is
 * measured on the real component by scripts/check-ask-dock.mjs.
 *
 *   ACTIVITY     a stream of lines becomes one line, folded steps and a
 *                count; a kind of line the chat has never seen, carrying a
 *                label, is shown like a step
 *   SUGGESTIONS  from the selected section, the empty page, what is
 *                missing, and the mode; three at most, each short
 *   PICTURES     what can be attached and what it becomes
 *   VOICE        words type themselves in, revisions are cut back once
 *   HISTORY      conversations filed under the day they were last used
 *   UNDO         the editor's side of a run's Undo
 *   COPY         no em dash and none of the banned words in anything new
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  activityFromOps,
  activityLine,
  changeCount,
  EMPTY_ACTIVITY,
  finishedSteps,
  firstSentence,
  READING_MS,
  reduceActivity,
  settleActivity,
  type Activity,
} from "../lib/website-builder/ask-activity"
import { MAX_SUGGESTION_CHARS, suggestionsFor, type SuggestionSection } from "../lib/website-builder/ask-suggestions"
import { attachProblem, fitWithin, kindOf, sizeLabel, stillsRoom, stillTimes } from "../lib/website-builder/ask-attach"
import { CATCH_UP_FRAMES, MAX_CHARS_PER_FRAME, typeToward, withSpoken } from "../lib/website-builder/ask-typing"
import { dayGroup } from "../components/website-builder/ask-history"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const section = (name: string) => console.log(`\n${name}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const play = (lines: Record<string, unknown>[], from: Activity = EMPTY_ACTIVITY) => lines.reduce(reduceActivity, from)

// ---------------------------------------------------------------------------
section("One line, what the run is doing now")
// ---------------------------------------------------------------------------
{
  check("before anything is said: Reading the page", activityLine(EMPTY_ACTIVITY, 0) === "Reading the page")
  check("and once reading has had its moment, Planning the change", activityLine(EMPTY_ACTIVITY, READING_MS) === "Planning the change")
  const planned = play([{ type: "plan", text: "I'll read the hero, then add quotes." }])
  check("a plan is planning", activityLine(planned, 0) === "Planning the change" && planned.plan === "I'll read the hero, then add quotes.")
  const reading = play([{ type: "step", id: "a", label: "Reading the Hero", state: "running" }], planned)
  check("a step running is the line", activityLine(reading, 0) === "Reading the Hero")
  const noted = play([{ type: "thinking", text: "The hero is dark, so the quotes go on white. Writing them now." }], reading)
  check("commentary newer than the step is the line, its first sentence", activityLine(noted, 0) === "The hero is dark, so the quotes go on white")
  const landed = play([{ type: "step", id: "a", label: "Reading the Hero", state: "done" }, { type: "op", op: { kind: "add_section", id: "q1", sectionType: "proof_testimonials" }, label: "Added Testimonials" }], noted)
  check("a change landing is the line: what changed", activityLine(landed, 0) === "Added Testimonials")
  const between = play([{ type: "step", id: "b", label: "Changing the Hero", state: "running" }, { type: "step", id: "b", label: "Changing the Hero", state: "done" }], landed)
  check("steps done and none running: choosing the next step", activityLine(between, 0) === "Choosing the next step")
  const writing = play([{ type: "code", path: "sections/quotes.storelib", source: "<template/>" }])
  check("a file being written names it", activityLine(writing, 0) === "Writing quotes.storelib")
  check("a long sentence is cut at a word", firstSentence("Reading every section on the home page before changing the colours of the whole thing", 40) === "Reading every section on the home page…")
}

// ---------------------------------------------------------------------------
section("Lines the chat has never seen")
// ---------------------------------------------------------------------------
{
  const a = play([
    { type: "status", label: "Checking colours" },
    { type: "status", label: "Saving" },
  ])
  check("a status line with a label is a step, and the line", a.steps.length === 2 && activityLine(a, 0) === "Saving")
  check("the next status line settles the one before it", a.steps[0].state === "done" && a.steps[1].state === "running", JSON.stringify(a.steps))
  const b = play([{ type: "tool", id: "t9", label: "Resizing images", state: "running" }, { type: "tool", id: "t9", label: "Resizing images", state: "done" }])
  check("a tool line with its own id and state is kept by its id", b.steps.length === 1 && b.steps[0].state === "done")
  const c = play([{ type: "stage", text: "Checking contrast" }])
  check("a progress line that says itself in `text` is shown too", activityLine(c, 0) === "Checking contrast")
  const same = EMPTY_ACTIVITY
  check("the chat's own lines are not steps", reduceActivity(same, { type: "conversation", id: "x", label: "x" }) === same && reduceActivity(same, { type: "message", text: "Done" }) === same && reduceActivity(same, { type: "recorded", messageId: "m" }) === same)
  check("a line with nothing to say changes nothing", reduceActivity(same, { type: "mystery" }) === same && reduceActivity(same, { type: "status", label: "  " }) === same)
  const open = play([{ type: "tool", id: "x", label: "Saving", state: "running" }])
  check("when the run ends nothing is left running; failed when the run failed", settleActivity(open).steps[0].state === "done" && settleActivity(open, true).steps[0].state === "failed")
  check("the finished steps leave out the running one", finishedSteps(play([{ type: "step", id: "1", label: "A", state: "done" }, { type: "step", id: "2", label: "B", state: "running" }])).map((s) => s.label).join() === "A")
}

// ---------------------------------------------------------------------------
section("How much changed")
// ---------------------------------------------------------------------------
{
  const one = play([{ type: "op", op: { kind: "add_section", id: "q1", sectionType: "proof_testimonials" }, label: "Added Testimonials" }, { type: "op", op: { kind: "add_block", sectionId: "q1", blockId: "b", blockType: "quote" }, label: "Added to Testimonials" }])
  check("two changes to one section: 1 section changed", changeCount(one) === "1 section changed", String(changeCount(one)))
  const two = play([{ type: "op", op: { kind: "update_section", id: "h", settings: {} } }, { type: "op", op: { kind: "update_theme", settings: {} } }], one)
  check("and the site's own settings are named", changeCount(two) === "2 sections and the site's settings changed", String(changeCount(two)))
  const code = play([{ type: "code", path: "sections/x.storelib", source: "a" }])
  check("a rewritten file is counted as one", changeCount(code) === "1 section file rewritten", String(changeCount(code)))
  check("nothing changed: no count at all", changeCount(EMPTY_ACTIVITY) === null)
  const restored = activityFromOps([{ kind: "update_section", id: "s1", settings: {} }, { kind: "update_section", id: "s1", settings: {} }, { kind: "remove_section", id: "s2" }])
  check("a conversation read back counts its changes the same way", changeCount(restored) === "2 sections changed", String(changeCount(restored)))
}

// ---------------------------------------------------------------------------
section("Suggestions, from where the creator is")
// ---------------------------------------------------------------------------
{
  const hero: SuggestionSection = { id: "h", type: "hero_centered", name: "Hero", settings: { heading: "Handmade ceramics for slow mornings and long dinners" } }
  const faq: SuggestionSection = { id: "f", type: "faq_accordion", name: "FAQ" }
  const header: SuggestionSection = { id: "hd", type: "header", name: "Header" }
  const footer: SuggestionSection = { id: "ft", type: "footer", name: "Footer", settings: {} }
  const page = [header, hero, faq, footer]
  const all: string[][] = []
  const s = (ctx: Parameters<typeof suggestionsFor>[0]) => { const out = suggestionsFor(ctx); all.push(out); return out }

  const onHero = s({ mode: "change", page: "home", sections: page, selectedId: "h" })
  check("a hero with a long heading: shorten it, first", onHero[0] === "Make this heading shorter", JSON.stringify(onHero))
  check("and a button under it, since it has none", onHero.includes("Add a button under the heading"))
  const shortHero = s({ mode: "change", page: "home", sections: [{ ...hero, settings: { heading: "Ceramics", button_text: "Shop" } }], selectedId: "h" })
  check("a short heading is not asked to be shorter, and a hero with a button gets a second one", !shortHero.includes("Make this heading shorter") && shortHero.includes("Add a second button"), JSON.stringify(shortHero))
  const onFaq = s({ mode: "change", page: "home", sections: page, selectedId: "f" })
  check("an FAQ: more questions, shorter answers", onFaq.includes("Add three more questions") && onFaq.includes("Make the answers shorter"))
  const onGrid = s({ mode: "change", page: "home", sections: [{ id: "g", type: "product_grid", name: "Products" }], selectedId: "g", productCount: 7 })
  check("a product grid in a store with products: its three newest", onGrid[0] === "Show my 3 newest products", JSON.stringify(onGrid))
  const onFooter = s({ mode: "change", page: "home", sections: page, selectedId: "ft" })
  check("the footer: an email, socials", onFooter.includes("Add my email to the footer"))

  const empty = s({ mode: "change", page: "home", sections: [header, footer], storeName: "Nora Clay", productCount: 2 })
  check("an empty page starts with a hero named for the store, then its products", empty[0] === "Start with a hero for Nora Clay" && empty[1] === "Show my 2 newest products", JSON.stringify(empty))
  const longName = s({ mode: "change", page: "home", sections: [], storeName: "The Very Long Named Pottery Studio of Somewhere" })
  check("a store name too long for a chip is left out rather than cut", longName[0] === "Start with a hero section", longName[0])
  const emptyAbout = s({ mode: "change", page: "about", sections: [] })
  check("an empty About page starts with the story", emptyAbout[0] === "Tell my story in a short section")

  const missing = s({ mode: "change", page: "home", sections: page, productCount: 12 })
  check("a home page with products on no product section offers them", missing[0] === "Show my 3 newest products", JSON.stringify(missing))
  check("and what it lacks: what buyers say, a newsletter", missing.includes("Add what buyers say") && missing.includes("Add a newsletter signup"), JSON.stringify(missing))
  const reachable = s({ mode: "change", page: "home", sections: [hero, { id: "n", type: "promo_newsletter", name: "Newsletter" }, { id: "t", type: "proof_testimonials", name: "Quotes" }, { ...footer, settings: { email: "hi@nora.clay" } }] })
  check("with a newsletter, quotes and an email in the footer, none of those is suggested", !reachable.some((x) => /newsletter|contact me|buyers say/i.test(x)), JSON.stringify(reachable))

  const code = s({ mode: "code", page: "home", sections: [{ id: "c", type: "comparison_table", name: "Compare" }] })
  check("Code section suggests new kinds of section, not one the page has", !code.includes("A comparison table of my plans") && code.length === 3, JSON.stringify(code))

  check("never more than three", all.every((x) => x.length <= 3), JSON.stringify(all.map((x) => x.length)))
  check(`each short enough for one chip on a phone (${MAX_SUGGESTION_CHARS} characters)`, all.flat().every((x) => x.length <= MAX_SUGGESTION_CHARS), all.flat().filter((x) => x.length > MAX_SUGGESTION_CHARS).join(" | "))
  check("and none of them is the old demo sentence", !all.flat().some((x) => /five questions about what/i.test(x)))
}

// ---------------------------------------------------------------------------
section("Pictures, and what they become")
// ---------------------------------------------------------------------------
{
  check("a PNG, a JPEG and a screenshot are pictures", kindOf({ type: "image/png", name: "a.png" }) === "image" && kindOf({ type: "image/jpeg", name: "b.jpg" }) === "image")
  check("an iPhone photo is HEIC, by type or by name", kindOf({ type: "image/heic", name: "x" }) === "heic" && kindOf({ type: "", name: "IMG_1.HEIC" }) === "heic")
  check("a video is a video, by type or by name", kindOf({ type: "video/quicktime", name: "a.mov" }) === "video" && kindOf({ type: "", name: "clip.mp4" }) === "video")
  check("a PDF is refused, in a sentence", attachProblem({ type: "application/pdf", name: "brief.pdf", size: 100 }) === "brief.pdf can't be attached. Pictures and videos only.")
  check("a 60MB photo is refused with its size and the limit", attachProblem({ type: "image/jpeg", name: "huge.jpg", size: 60 * 1024 * 1024 }) === "huge.jpg is 60 MB. Pictures up to 40 MB can be attached.")
  check("a 12MB phone photo is fine: it is shrunk before it goes", attachProblem({ type: "image/jpeg", name: "p.jpg", size: 12 * 1024 * 1024 }) === null)
  check("sizes read as people say them", sizeLabel(340 * 1024) === "340 KB" && sizeLabel(1.25 * 1024 * 1024) === "1.3 MB" && sizeLabel(60 * 1024 * 1024) === "60 MB")
  check("a 4032x3024 photo goes at 1568x1176", JSON.stringify(fitWithin(4032, 3024)) === '{"width":1568,"height":1176}')
  check("a portrait one the same way round", JSON.stringify(fitWithin(3024, 4032)) === '{"width":1176,"height":1568}')
  check("a small one is not enlarged", JSON.stringify(fitWithin(800, 600)) === '{"width":800,"height":600}')
  check("three stills from across a clip, away from its first and last frame", JSON.stringify(stillTimes(8)) === "[2,4,6]")
  check("a one second clip gives one", stillTimes(0.9).length === 1 && stillTimes(0.9)[0] > 0)
  check("a video takes only the room there is", stillsRoom(0) === 3 && stillsRoom(2) === 2 && stillsRoom(4) === 0)
}

// ---------------------------------------------------------------------------
section("Words typing themselves in")
// ---------------------------------------------------------------------------
{
  /* A recording as a recogniser hands it over: bursts, one revised. */
  const heard = ["make", "make the hero", "make the here", "make the hero heading", "make the hero heading shorter and calmer"]
  let shown = ""
  let frames = 0
  let biggest = 0
  let cuts = 0
  for (const words of heard) {
    const target = withSpoken("", words)
    for (let i = 0; i < 400 && shown !== target; i++) {
      const next = typeToward(shown, target)
      if (next.startsWith(shown)) biggest = Math.max(biggest, next.length - shown.length)
      else cuts++
      shown = next
      frames++
    }
  }
  check("it ends on exactly what was heard", shown === "make the hero heading shorter and calmer", shown)
  check(`never more than ${MAX_CHARS_PER_FRAME} characters in one frame`, biggest <= MAX_CHARS_PER_FRAME, String(biggest))
  check("each revision is cut back once, to what the two agree on, never letter by letter", cuts === 2, String(cuts))
  const burst = "x".repeat(200)
  let s = ""
  let n = 0
  while (s !== burst && n < 1000) { s = typeToward(s, burst); n++ }
  check("a burst of 200 characters lands in under half a second at 60 frames a second, not one character at a time", n <= 30, String(n))
  let w = ""
  let m = 0
  while (w !== "make the hero taller" && m < 100) { w = typeToward(w, "make the hero taller"); m++ }
  check(`a few words land in about ${CATCH_UP_FRAMES} frames, an eighth of a second`, m <= CATCH_UP_FRAMES + 2, String(m))
  check("what was typed before the microphone stays in front", withSpoken("Make the header", "and the footer black") === "Make the header and the footer black")
  check("and nothing heard leaves it alone", withSpoken("Make it blue  ", "") === "Make it blue")
  check("typing stops when it arrives", typeToward("done", "done") === "done")
  check(`and ${frames} frames typed the whole recording`, frames > 20)
}

// ---------------------------------------------------------------------------
section("History, filed by day")
// ---------------------------------------------------------------------------
{
  const now = new Date(2026, 8, 25, 15, 0).getTime()
  const at = (days: number, hours = 0) => new Date(now - days * 86_400_000 - hours * 3_600_000).toISOString()
  check("an hour ago is Today", dayGroup(at(0, 1), now) === "Today")
  check("yesterday evening is Yesterday", dayGroup(at(1, 2), now) === "Yesterday")
  check("four days ago is Previous 7 days", dayGroup(at(4), now) === "Previous 7 days")
  check("twenty days ago is Previous 30 days", dayGroup(at(20), now) === "Previous 30 days")
  check("two months ago is filed under its month", /2026/.test(dayGroup(at(62), now)) && !/Previous/.test(dayGroup(at(62), now)), dayGroup(at(62), now))
  check("a date that is not one does not throw", dayGroup("not a date", now) === "Earlier")
}

// ---------------------------------------------------------------------------
section("Undo for one run, the editor's side")
// ---------------------------------------------------------------------------
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const chat = read("components/website-builder/theme-chat.tsx")
  check(
    "a run's snapshot is kept under its id with its page, as its one undo step",
    /if \(runId\) aiRuns\.current\.set\(runId, \{ page: currentPageRef\.current, before \}\)/.test(editor) &&
      /setUndoStack\(prev => \[\.\.\.prev\.slice\(-30\), before\]\)/.test(editor),
  )
  check(
    "Undo is refused on any other page, uses the editor's own Undo when nothing happened since, and keeps what was there for Redo otherwise",
    /if \(!run \|\| run\.page !== currentPageRef\.current\) return false/.test(editor) &&
      /if \(stack\[stack\.length - 1\] === run\.before\) \{\s*\n\s*handleUndo\(\)/.test(editor) &&
      /setRedoStack\(prev => \[\.\.\.prev, snapshotNow\(\)\]\)\s*\n\s*setSections\(run\.before\.sections\)/.test(editor),
  )
  check(
    "both chats are given it, and the run start that feeds it",
    (editor.match(/onRunStart=\{startAiRun\}/g) ?? []).length === 2 && (editor.match(/onUndoRun=\{undoAiRun\}/g) ?? []).length === 2,
  )
  check(
    "the chat offers Undo only on the newest run that changed this page, never one that rewrote a section file",
    /if \(e\.undone \|\| e\.page !== page \|\| e\.activity\.code\.length > 0\) return null/.test(chat) && /onRunStart\(runId\)/.test(chat),
  )
  check(
    "the suggestions know how many products there are, from a memoised value, so the chat is not redrawn by the editor",
    /const aiStore = useMemo\(/.test(editor) && (editor.match(/store=\{aiStore\}/g) ?? []).length === 2,
  )
}

// ---------------------------------------------------------------------------
section("The dock on a tablet's keyboard, and the phone's field")
// ---------------------------------------------------------------------------
{
  const chat = read("components/website-builder/theme-chat.tsx")
  check("the dock's box ends where a keyboard begins", /style=\{\{ bottom: "var\(--kb-inset, 0px\)" \}\}/.test(chat))
  check("the phone's field is 16px, so iOS does not zoom the page to it on focus", /phone \? "min-h-\[44px\] px-1\.5 py-\[11px\] text-\[16px\] leading-\[22px\]"/.test(chat))
  check("its placeholder never wraps to a second line", /placeholder:truncate/.test(chat))
  check("and Enter on a phone's keyboard says Send", /enterKeyHint="send"/.test(chat))
}

// ---------------------------------------------------------------------------
section("Copy")
// ---------------------------------------------------------------------------
{
  const files = [
    "components/website-builder/theme-chat.tsx",
    "components/website-builder/ask-activity.tsx",
    "components/website-builder/ask-parts.tsx",
    "components/website-builder/ask-model-picker.tsx",
    "components/website-builder/ask-attachments.tsx",
    "components/website-builder/ask-attach-prepare.ts",
    "components/website-builder/ask-history.tsx",
    "lib/website-builder/ask-activity.ts",
    "lib/website-builder/ask-suggestions.ts",
    "lib/website-builder/ask-attach.ts",
    "lib/website-builder/ask-typing.ts",
    "lib/website-builder/ask-client.ts",
    "app/api/website-builder/themes/[installId]/chat/report/route.ts",
    "app/api/website-builder/themes/[installId]/chat/conversations/[conversationId]/route.ts",
  ]
  const banned = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform your|leverage)\b/i
  const dash = files.filter((f) => read(f).includes("—"))
  check("no em dash in anything this round wrote", dash.length === 0, dash.join(", "))
  const strings = files.flatMap((f) => (read(f).match(/"[^"\n]{6,}"|`[^`\n]{6,}`/g) ?? []).filter((s) => banned.test(s)).map((s) => `${f}: ${s}`))
  check("and none of the banned words in what people read", strings.length === 0, strings.join(" | "))
  const chat = read("components/website-builder/theme-chat.tsx")
  check("the long explanation in the empty chat is gone", !/It writes the same sections, blocks and controls the panels do/.test(chat) && !/Describe a section the library does not have and it is written/.test(chat))
  check("and so is Working, as a word on screen", !/"Working|>Working|Working on it/.test(chat))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
