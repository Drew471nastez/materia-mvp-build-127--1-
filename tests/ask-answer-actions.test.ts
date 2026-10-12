/**
 * ===========================================================================
 *  ASK STORELIB: REPORT, COPY, SUGGESTIONS, THE LIVE LINE, AND ITS SOUNDS
 * ===========================================================================
 * "Make sure the report, and copy, and the suggestions, and the AI thinking
 * really work." Each path, held here to what it does; the same paths are
 * clicked through in a browser by scripts/check-ask-ai.mjs (ACTIONS).
 *
 *   REPORT       what the panel sends, and each answer it can get back in
 *                words; a confirmation once it is kept on the server
 *   COPY         the clipboard, the old way where it is refused, and
 *                "Copied" or why not, said beside the button
 *   SUGGESTIONS  a tap sends the suggestion, in the mode the box is in
 *   THE LINE     a run's stream, line by line: the one line changes as it
 *                goes and folds into a summary and a count of steps
 *   SOUNDS       where each of the four plays, and where none does
 *
 * Run with:  npm run test:push
 */
import { untt } from "./i18n-source"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { writeClipboard } from "../components/website-builder/ask-activity"
import { reportAnswer } from "../lib/website-builder/ask-client"
import {
  EMPTY_ACTIVITY,
  activityLine,
  changeSummary,
  finishedSteps,
  reduceActivity,
  settleActivity,
  type Activity,
} from "../lib/website-builder/ask-activity"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const section = (name: string) => console.log(`\n${name}`)
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const g = globalThis as unknown as Record<string, unknown>
const setGlobal = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })

async function main() {
  const panel = read("components/website-builder/theme-chat.tsx")
  const activityUi = read("components/website-builder/ask-activity.tsx")

  // ---------------------------------------------------------------------------
  section("Report")
  // ---------------------------------------------------------------------------
  {
    const calls: { url: string; init: RequestInit }[] = []
    let answer: () => Response = () => new Response(JSON.stringify({ reported: true }), { status: 200 })
    setGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return answer()
    })
    const ok = await reportAnswer("inst-1", { messageId: "m-1", reason: "  It changed the wrong section  ", engine: "claude-opus" })
    const sent = JSON.parse(String(calls[0].init.body))
    check("it posts JSON to this website's report route", calls[0].url === "/api/website-builder/themes/inst-1/chat/report" && calls[0].init.method === "POST" && (calls[0].init.headers as Record<string, string>)["content-type"] === "application/json")
    check("with the question's id, the reason trimmed, and the model", sent.messageId === "m-1" && sent.reason === "It changed the wrong section" && sent.engine === "claude-opus")
    check("and a report the server kept is ok", ok.ok === true)
    const empty = await reportAnswer("inst-1", { messageId: "m-1", reason: "   " })
    check("a blank reason is sent as none, since it is optional", empty.ok === true && JSON.parse(String(calls[1].init.body)).reason === null)
    const problem = async (status: number, body: Record<string, unknown>) => {
      answer = () => new Response(JSON.stringify(body), { status })
      const r = await reportAnswer("inst-1", { messageId: "m-1" })
      return "problem" in r ? r.problem : "ok"
    }
    check("before the database update it says so", (await problem(503, { reason: "not_set_up" })) === "not_set_up")
    check("an answer no longer in the history", (await problem(404, { reason: "not_found" })) === "not_found")
    check("too many at once", (await problem(429, {})) === "busy")
    check("anything else is a failure to try again", (await problem(500, {})) === "failed")
    setGlobal("fetch", async () => { throw new TypeError("offline") })
    const offline = await reportAnswer("inst-1", { messageId: "m-1" })
    check("and so is no connection, without throwing", "problem" in offline && offline.problem === "failed")
    check(
      "the panel says each in words",
      /if \(problem === "not_set_up"\) return "Reports turn on once the database update is run\."/.test(panel) && /That is a lot of reports at once/.test(panel) && /This answer is no longer in your history\./.test(panel) && /The report did not send\. Try again\./.test(panel),
    )
    check("the flag is offered once the question has an id on the server, live or read back", /canReport=\{!!exchange\.messageId\}/.test(panel) && /if \(messageId\) patch\(\(e\) => \(\{ \.\.\.e, messageId \}\)\)/.test(panel))
    check("sent, it says so where the flag was", /data-ask-reported="" role="status"/.test(activityUi) && /Reported\. Thank you\./.test(activityUi))
    check("each report form has its own field id, so two open at once keep their labels", /const fieldId = `ask-report-\$\{React\.useId\(\)\}`/.test(activityUi) && !/"ask-report-reason"/.test(activityUi))
    /* "When I click it should be a really small modal appearing there, not a big one." */
    check(
      "on a computer the report is a small popover by the flag, drawn in the body and fixed next to it",
      /anchor=\{reportAnchor\}/.test(panel) && /reportRef=\{reportAnchor\}/.test(panel) && /ref=\{reportRef\}/.test(activityUi) &&
        /const REPORT_WIDTH = 2[0-9]\d\b/.test(activityUi) && /createPortal\(form, document\.body\)/.test(activityUi) &&
        /position: "fixed", left, width, bottom: vh - r\.top \+ REPORT_GAP/.test(activityUi),
    )
    check(
      "a tap on a reason chip or a few words, then Send; Escape and a press elsewhere close it without folding the chat",
      /REPORT_REASONS\.map/.test(activityUi) && /data-ask-report-form=""\s*\n\s*data-ask-keep=""/.test(activityUi) &&
        /if \(event\.key !== "Escape"\) return[\s\S]{0,120}event\.preventDefault\(\)/.test(activityUi) &&
        /document\.addEventListener\("pointerdown", away, true\)/.test(activityUi) && />\s*\{sending \? "Sending" : "Send"\}/.test(activityUi),
    )
  }

  // ---------------------------------------------------------------------------
  section("Copy")
  // ---------------------------------------------------------------------------
  {
    const written: string[] = []
    setGlobal("navigator", { clipboard: { writeText: async (t: string) => { written.push(t) } } })
    check("the clipboard takes the answer's words", (await writeClipboard("Added three quotes under the hero.")) === true && written[0] === "Added three quotes under the hero.")

    /* A clipboard that refuses: the old way, a selected field and the copy command. */
    const copied: string[] = []
    let appended = 0
    let removed = 0
    const area = { value: "", style: { cssText: "" }, setAttribute: () => {}, select: () => {}, setSelectionRange: () => {}, remove: () => { removed++ } }
    setGlobal("navigator", { clipboard: { writeText: async () => { throw new Error("NotAllowedError") } } })
    setGlobal("document", {
      createElement: () => area,
      body: { appendChild: () => { appended++ } },
      execCommand: (command: string) => { if (command === "copy") copied.push(area.value); return true },
    })
    check("where the clipboard is refused, the old way copies it", (await writeClipboard("Shortened the heading.")) === true && copied[0] === "Shortened the heading.")
    check("and takes its field away again", appended === 1 && removed === 1)
    setGlobal("document", { createElement: () => { throw new Error("no DOM") }, body: {} })
    check("where neither works it says so, never throws", (await writeClipboard("x")) === false)
    delete g.document
    check(
      "the button copies the answer, or what the run said it did, or its question",
      /copyText=\{exchange\.reply \?\? detail \?\? question\?\.question \?\? ""\}/.test(panel) && /setCopied\(\(await writeClipboard\(copyText\)\) \? "copied" : "failed"\)/.test(activityUi),
    )
    check(
      "and says Copied beside itself, or why not, for a moment",
      /data-ask-copied=\{copied\} role="status"/.test(activityUi) && /copied === "copied" \? "Copied" : "Could not copy\. Select the text instead\."/.test(activityUi),
    )
  }

  // ---------------------------------------------------------------------------
  section("Suggestions")
  // ---------------------------------------------------------------------------
  {
    const body = panel.slice(panel.indexOf("const pickSuggestion = React.useCallback"), panel.indexOf("viewingRef.current = !!viewing"))
    /* A tap goes the way the box's mode sends a message (dispatch): the page assistant, or in Code section the writer or the open section's code. */
    const dispatch = panel.slice(panel.indexOf("const dispatch = React.useCallback("), panel.indexOf("const submit = React.useCallback("))
    check("a tap sends the suggestion, rather than copying it into the box to be sent again", /dispatch\(text, \[\], mode\)/.test(body) && !/setDraft\(/.test(body))
    check("in Code section it writes the section", /if \(into === "code"\) \{[\s\S]{0,300}else void writeOne\(prompt, images, quiet\)/.test(dispatch))
    check("during a run it waits its turn, like a typed message", /if \(busy \|\| writing\) \{\s*\n\s*setQueued\(\{ text, mode \}\)/.test(body))
    check(
      "and whatever is typed in the box, and its pictures, stay there",
      !/setAttached\(/.test(body) && /setAttached\(\[\]\)\s*\n\s*setAttachError\(null\)\s*\n\s*dispatch\(prompt, images, mode\)/.test(panel),
    )
    check("both chip rows are wired to it", (panel.match(/onPick=\{pickSuggestion\}/g) ?? []).length === 2)
  }

  // ---------------------------------------------------------------------------
  section("The live line, and the summary it folds into")
  // ---------------------------------------------------------------------------
  {
    const stream: Record<string, unknown>[] = [
      { type: "conversation", id: "c1", title: "Add quotes" },
      { type: "recorded", messageId: "m1" },
      { type: "progress", phase: "reading", label: "Reading the page" },
      { type: "progress", phase: "planning", label: "Planning" },
      { type: "plan", text: "I'll add three quotes under the hero." },
      { type: "step", id: "t1", label: "Reading the Hero", state: "running" },
      { type: "step", id: "t1", label: "Reading the Hero", state: "done" },
      { type: "progress", phase: "writing", label: "Writing Testimonials" },
      { type: "op", op: { kind: "add_section", id: "q1", sectionType: "proof_testimonials" }, label: "Added Testimonials" },
      { type: "progress", phase: "checking", label: "Checking contrast" },
      { type: "progress", phase: "done", label: "Done", detail: "Added three quotes under the hero.", sections: ["Testimonials"] },
    ]
    let a: Activity = EMPTY_ACTIVITY
    const lines: string[] = []
    for (const line of stream) {
      a = reduceActivity(a, line)
      lines.push(activityLine(a, 2000))
    }
    const changes = lines.filter((l, i) => i === 0 || l !== lines[i - 1])
    check("the line changes as the run moves, in the run's own words", changes.includes("Reading the page") && changes.includes("Writing Testimonials") && changes.includes("Added Testimonials") && changes.includes("Checking contrast"), changes.join(" | "))
    const settled = settleActivity(a)
    check("when it is over nothing is still running", settled.steps.every((s) => s.state !== "running"))
    check("and it folds into a count of steps and a summary by name", finishedSteps(settled).length === 5 && changeSummary(settled) === "Changed Testimonials", `${finishedSteps(settled).length} ${changeSummary(settled)}`)
    check(
      "the steps are open while it works and folded once it is done, until asked for",
      /const \[stepsOpen, setStepsOpen\] = React\.useState\(false\)/.test(panel) &&
        /<StepsTimeline rows=\{rows\} open=\{exchange\.running \|\| \(stepsOpen && hasWork\)\}/.test(panel),
    )
    check("while it runs the line is drawn, then under the answer the count, Undo, Copy and Report", /\{exchange\.running && \(\s*\n\s*<div className="min-w-0">\s*\n\s*<ActivityLine/.test(panel) && /\{!exchange\.running && \(exchange\.reply \|\| exchange\.error \|\| count \|\| hasWork \|\| question\) && \(/.test(panel))
    check("a line saying the chat could not be kept is not a step", reduceActivity(EMPTY_ACTIVITY, { type: "unsaved", what: "chat", reason: "not_set_up" }) === EMPTY_ACTIVITY)
  }

  // ---------------------------------------------------------------------------
  section("Where the sounds play")
  // ---------------------------------------------------------------------------
  {
    check(
      "the whoosh as a message goes, unless it already had one when it was queued",
      (panel.match(/if \(!quiet\) playAskSound\("sent"\)/g) ?? []).length === 2 && /dispatchRef\.current\(next\.text, \[\], next\.mode, true\)/.test(panel),
    )
    check(
      "and as one is queued, and as a section is asked for",
      (panel.match(/setQueued\(\{ text(: prompt)?, mode(: "change")? \}\)\s*\n\s*playAskSound\("sent"\)/g) ?? []).length === 3 &&
        /if \(!quiet\) playAskSound\("sent"\)\s*\n\s*setWriting\(true\)/.test(panel),
    )
    check(
      "one sound per run: the chord for an answer, the rising sixth for the question it stopped on, the low pair for an error",
      (panel.match(/if \(!finished\) playAskSound\("done"\)/g) ?? []).length === 1 &&
        /if \(!finished\) playAskSound\("question"\)/.test(panel) &&
        /error: message, activity: settleActivity\(e\.activity, true\) \}\)\)\s*\n\s*if \(!finished\) playAskSound\("error"\)\s*\n\s*finished = true/.test(panel),
    )
    check(
      "a route that refused or a lost connection is an error too; a stop the person chose is silent",
      /error: result\.error \?\? "That did not go through\.", activity: settleActivity\(e\.activity, true\) \}\)\)\s*\n\s*if \(!finished\) playAskSound\("error"\)/.test(panel) &&
        /if \(!stopped && !finished\) playAskSound\("error"\)/.test(panel),
    )
    check("and when a section is written, or the writer answers; a section that failed is the low pair", /if \(kept \|\| answered\) playAskSound\("done"\)\s*\n\s*else playAskSound\("error"\)/.test(panel))
    check(
      "a tick as the microphone opens and as it closes, on the recorder's own state",
      /if \(voice\.state === "listening" && was !== "listening"\) playAskSound\("record-start"\)/.test(panel) && /else if \(was === "listening" && voice\.state !== "listening"\) playAskSound\("record-stop"\)/.test(panel),
    )
    check("nothing plays when the chat loads: arming only listens for the first press", /setSounds\(soundsOn\(\)\)\s*\n\s*armAskSounds\(\)/.test(panel) && !/useEffect\(\(\) => \{\s*\n\s*playAskSound/.test(panel))
    const picker = read("components/website-builder/ask-model-picker.tsx")
    check(
      "Sounds is a switch in the Ask Storelib menu, on a computer and on a phone, remembered per browser",
      /role="switch"\s*\n\s*aria-checked=\{!!sounds\}/.test(picker) && (picker.match(/\{soundsRow\}/g) ?? []).length === 2 && /sounds=\{sounds\}\s*\n\s*onSoundsChange=\{chooseSounds\}/.test(panel) && /setSoundsOn\(on\)/.test(panel),
    )
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
