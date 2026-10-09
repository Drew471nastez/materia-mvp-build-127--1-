/**
 * ===========================================================================
 *  THE BUILDER KEEPS WHAT AN EDIT DID NOT CHANGE, AND UNDO UNDOES IT
 * ===========================================================================
 * Driven with the real code:
 *
 *   UNDO      a run of edits (typing into a field, dragging a slider) is one
 *             step, and the step is the page BEFORE the run: Undo after a
 *             setting change puts the setting back, at once, not half a
 *             second later and not one step late. An Undo, a Redo or a page
 *             change ends the run.
 *   WIRED     the editor records its steps through that, before it changes
 *             anything.
 *
 * What an edit does to the canvas itself (photos kept, a section's own cart
 * kept, rapid changes, a duplicate, a reorder, undo, a phone and a laptop) is
 * held in a real browser by scripts/check-canvas-stability.mjs.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createUndoRun } from "@/lib/website-builder/undo-run"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

console.log("\nUNDO: one step for a run, and it is the page before the run")
{
  /* A page with one setting, a history of snapshots, and an editor that asks for a step before every change. */
  let heading = "Spring"
  const history: string[] = []
  const run = createUndoRun(() => history.push(heading), 40)
  const type = (v: string) => { run.step(); heading = v }
  const undo = () => { run.end(); const prev = history.pop(); if (prev !== undefined) heading = prev }

  for (const v of ["S", "Su", "Sum", "Summer"]) type(v)
  check("four keystrokes are one step", history.length === 1, history)
  check("and the step is the page before the typing", history[0] === "Spring", history)
  undo()
  check("Undo straight away puts the heading back", heading === "Spring", heading)

  type("Autumn")
  await sleep(80)
  type("Winter")
  check("an edit after a quiet moment is a step of its own", history.length === 2 && history[0] === "Spring" && history[1] === "Autumn", history)
  undo()
  check("so Undo takes back only the last edit", heading === "Autumn", heading)
  type("Fall")
  check("and an edit straight after an Undo is a new step, not part of the run before it", history.length === 2 && history[1] === "Autumn", history)
  undo()
  undo()
  check("two Undos walk back two steps", heading === "Spring", heading)
}

console.log("\nWIRED: the editor records its steps that way")
{
  const editor = readFileSync(join(process.cwd(), "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  check("the editor's run is the shared one", /createUndoRun\(\(\) => pushUndoLatest\.current\(\)\)/.test(editor) && /const debouncedPushUndo = undoRun\.step/.test(editor))
  check("and Undo, Redo and a page change end it", (editor.match(/endUndoRun\(\)/g) ?? []).length >= 3)
  check("the old half-second-late snapshot is gone", !/setTimeout\(\(\) => pushUndo\(\), 500\)/.test(editor))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
