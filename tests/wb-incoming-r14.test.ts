/**
 * ===========================================================================
 *  CHANGES ARRIVING IN THE OPEN EDITOR (round 14)
 * ===========================================================================
 * The owner: "When it receives changes from the AI Storelib agent or from
 * GitHub, it freezes, it glitches, it bugs." Measured on the real editor
 * with the owner's Materia theme as its store serves it by
 * scripts/check-wb-incoming-r14.mjs, and held here:
 *
 *   A FEW AT A TIME    Storelib AI's operations are queued and taken in
 *                      together (createBurstQueue): the first at once, the
 *                      rest every 250ms or more, in order, none dropped;
 *                      the run's end and Undo take in what is left
 *   A TASK PER SWAP    the canvas swaps each section in a task of its own
 *   THE PAGE STAYS     a run's end does not scroll a canvas the person
 *                      scrolled during the run
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CANVAS_BRIDGE } from "@/lib/storelib-theme/compat/canvas-bridge"
import { createBurstQueue } from "@/lib/website-builder/incoming"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA FEW AT A TIME")
{
  /* A clock and timers of the test's own. */
  let t = 0
  const timers: { at: number; fn: () => void; id: number }[] = []
  let ids = 0
  const later = (fn: () => void, ms: number) => { const id = ++ids; timers.push({ at: t + ms, fn, id }); return id }
  const cancel = (id: number) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1) }
  const advance = (ms: number) => {
    const end = t + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > end) break
      timers.shift()
      t = next.at
      next.fn()
    }
    t = end
  }
  const batches: { items: number[]; flushed: boolean; at: number }[] = []
  const q = createBurstQueue<number>({ apply: (items, flushed) => batches.push({ items, flushed, at: t }), gapMs: 250, now: () => t, later, cancel })
  q.push(1)
  advance(0)
  check("the first is taken in at once", batches.length === 1 && batches[0].items.join() === "1" && batches[0].at === 0, batches)
  for (let i = 2; i <= 9; i++) { advance(30); q.push(i) }
  check("  the next ones wait for the gap", batches.length === 1, batches)
  advance(250)
  check("  and are taken in together, in order, none dropped", batches.length === 2 && batches[1].items.join() === "2,3,4,5,6,7,8,9" && batches[1].at === 250, batches)
  q.push(10)
  q.push(11)
  q.flush()
  check("flush takes in what waits, now, said as flushed", batches.length === 3 && batches[2].items.join() === "10,11" && batches[2].flushed && q.size === 0, batches)
  advance(1000)
  check("  and nothing is taken in twice", batches.length === 3 && batches.flatMap((b) => b.items).join() === "1,2,3,4,5,6,7,8,9,10,11", batches)
  q.push(12)
  q.drop()
  advance(1000)
  check("drop forgets what waits", batches.length === 3 && q.size === 0, batches)

  /* A heavy batch: the gap grows with it. */
  const slow: number[] = []
  let t2 = 0
  const due: { at: number; fn: () => void }[] = []
  const heavy = createBurstQueue<number>({ apply: () => { slow.push(t2); t2 += 200 }, gapMs: 250, maxGapMs: 1000, now: () => t2, later: (fn, ms) => { due.push({ at: t2 + ms, fn }); return due.length }, cancel: () => {} })
  heavy.push(1)
  const first = due.shift()!
  t2 = first.at
  first.fn()
  heavy.push(2)
  const second = due.shift()!
  t2 = second.at
  second.fn()
  check("a batch that cost 200ms is followed by a gap of three times that", slow.length === 2 && slow[1] - slow[0] === 600, slow)

  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("Storelib AI's operations go through the queue, in both its places", (editor.match(/onOp=\{queueAiOp\}/g) ?? []).length === 2 && !/onOp=\{applyAiOp\}/.test(editor))
  check("  taken in behind what the person does, only for the page the run is on", /if \(flushed\) run\(\)\s*else startTransition\(run\)/.test(editor) && /for \(const \{ op, page \} of batch\) if \(page === currentPageRef\.current\) applyAiOpRef\.current\(op\)/.test(editor))
  check("  the run's end and Undo take in what is left", /aiOps\.flush\(\)\s*\/\* The run is over/.test(editor) && /const handleUndo = useCallback\(\(\) => \{[\s\S]{0,200}aiOps\.flush\(\)/.test(editor))
}

console.log("\nA TASK PER SWAP")
{
  check("a section swap waits for the next turn of the event loop", /var nextTurn = function \(\) \{ return new Promise\(function \(done\) \{ setTimeout\(done, 0\); \}\); \};/.test(CANVAS_BRIDGE) && /return Promise\.all\(links\.map\(function \(l\) \{ return keep\(l\.href\); \}\)\)\.then\(nextTurn\)\.then\(function \(\) \{/.test(CANVAS_BRIDGE))
}

console.log("\nTHE PAGE STAYS WHERE THE PERSON TOOK IT")
{
  check("the canvas notes when the person last moved it (wheel, finger, key)", /var personScrolls = function \(\) \{ personScrolledAt = Date\.now\(\); \};/.test(CANVAS_BRIDGE) && /addEventListener\("wheel", personScrolls, \{ passive: true, capture: true \}\)/.test(CANVAS_BRIDGE))
  check("  and a reveal since then is not taken", /if \(typeof m\.since === "number" && personScrolledAt >= m\.since\) return;/.test(CANVAS_BRIDGE))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("a run's end asks with the time it started", /revealSection\(onPage\[0\], true, undefined, aiRunStartedAt\.current\)/.test(editor) && /aiRunStartedAt\.current = Date\.now\(\)/.test(editor))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("  passed on to the frame", /type: "reveal", id, \.\.\.\(typeof detail\?\.since === "number" \? \{ since: detail\.since \} : \{\}\)/.test(canvas))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
