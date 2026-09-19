/**
 * ===========================================================================
 *  THE THREE WAYS A SITE EDIT COULD STILL DISAPPEAR
 * ===========================================================================
 * The builder autosaves 1.2s after an edit, retries failures, and guards
 * concurrent writes with a compare-and-swap in Postgres. What it did not have:
 *
 *   1. Anything that saves when the tab goes away. `beforeunload` WARNS, and
 *      iOS routinely kills a backgrounded page without firing it at all.
 *   2. Any copy of unsaved work outside React state. Offline plus a closed
 *      tab was silent loss.
 *   3. A way back from a restore. It deleted and overwrote the current
 *      project without keeping it, so restoring the wrong version threw away
 *      everything since the last agent run.
 *
 * This pins all three, and exercises the device-side store for real rather
 * than reading its source.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** A localStorage that behaves, and one that refuses, because both happen. */
function fakeStorage(limitBytes = Infinity) {
  const map = new Map<string, string>()
  return {
    store: map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limitBytes) throw new Error("QuotaExceededError")
      map.set(k, v)
    },
    removeItem: (k: string) => { map.delete(k) },
  }
}

async function main() {
  console.log("\nThe device keeps what the server has not got")

  const storage = fakeStorage()
  ;(globalThis as { window?: unknown }).window = { localStorage: storage }
  const draftModule = await import("../lib/sites/local-draft")
  const { writeLocalDraft, readLocalDraft, clearLocalDraft, unsavedIn } = draftModule

  const kept = writeLocalDraft("site-1", {
    revision: 7,
    savedAt: "2026-09-19T10:00:00.000Z",
    files: { "src/App.tsx": "export default () => null" },
  })
  check("an unsaved file is kept", kept)
  const back = readLocalDraft("site-1")
  check("and comes back byte for byte", back?.files["src/App.tsx"] === "export default () => null")
  check("with the revision it was written against", back?.revision === 7)

  check("another site's draft is a different key", readLocalDraft("site-2") === null)

  /* The case that makes the banner a prompt about nothing. */
  check(
    "a draft the server already has is nothing to offer",
    Object.keys(unsavedIn(back!, { "src/App.tsx": "export default () => null" })).length === 0,
  )
  check(
    "a draft the server has not got is offered",
    Object.keys(unsavedIn(back!, { "src/App.tsx": "something else" })).length === 1,
  )

  clearLocalDraft("site-1")
  check("and it is forgotten on request", readLocalDraft("site-1") === null)

  /* Storage that refuses must be a false, not a throw: the editor says so. */
  ;(globalThis as { window?: unknown }).window = { localStorage: fakeStorage(10) }
  const mod2 = await import(`../lib/sites/local-draft?t=${Date.now()}`)
  check(
    "a browser that refuses storage reports it rather than throwing",
    mod2.writeLocalDraft("site-3", { revision: 1, savedAt: "x", files: { a: "0123456789012345" } }) === false,
  )
  check("and reading from it is null, not a crash", mod2.readLocalDraft("site-3") === null)

  /* A payload larger than the cap is refused before it is written. */
  ;(globalThis as { window?: unknown }).window = { localStorage: fakeStorage() }
  const mod3 = await import(`../lib/sites/local-draft?t=${Date.now() + 1}`)
  check(
    "a draft over the size cap is refused, not silently truncated",
    mod3.writeLocalDraft("site-4", { revision: 1, savedAt: "x", files: { big: "x".repeat(2_100_000) } }) === false,
  )

  /* Corrupt or foreign data in the slot must not be trusted. */
  const bad = fakeStorage()
  bad.setItem("storelib_site_draft_site-5", "{not json")
  ;(globalThis as { window?: unknown }).window = { localStorage: bad }
  const mod4 = await import(`../lib/sites/local-draft?t=${Date.now() + 2}`)
  check("rubbish in the slot reads as nothing", mod4.readLocalDraft("site-5") === null)
  bad.setItem("storelib_site_draft_site-6", JSON.stringify({ revision: "seven", savedAt: "x", files: {} }))
  check("and so does a draft with the wrong shape", mod4.readLocalDraft("site-6") === null)

  console.log("\nGoing away is when to save")

  const shell = read("components/sites/editor/editor-shell.tsx")
  check(
    "the editor flushes when the tab is hidden",
    /document\.addEventListener\("visibilitychange", onVisibility\)/.test(shell) &&
      /visibilityState === "hidden"/.test(shell),
    "beforeunload only warns, and iOS often does not fire it at all",
  )
  check(
    "the flush outlives the document",
    /keepalive: true/.test(shell),
  )
  check(
    "pagehide flushes too",
    /window\.addEventListener\("pagehide", flush\)/.test(shell),
  )
  /* The flush is a guess about delivery; the queue must not act on a guess. */
  const flushBody = shell.slice(shell.indexOf("const flush = () => {"), shell.indexOf("const onVisibility"))
  check("the flush is where the test expects it", flushBody.length > 0)
  check(
    "a flushed path stays in the dirty queue, because nothing here knows it landed",
    !/dirtyPaths\.current\.clear\(\)/.test(flushBody) && !/dirtyPaths\.current\.delete/.test(flushBody),
    "removing it on a guess is a change that quietly ceases to exist",
  )
  check(
    "a body too large for keepalive is not sent at all",
    /body\.length > 64_000/.test(flushBody),
    "the spec caps keepalive at 64KB; over that the request is rejected outright",
  )
  check(
    "coming back into view after a flush re-reads the project",
    /flushedWhileHidden\.current = false\s*\n\s*void adoptAgentChanges\(\)/.test(shell),
    "otherwise the editor's revision is one behind its own flush and the next save 409s",
  )

  console.log("\nThe work is offered back, and only when there is some")

  check(
    "the editor reads the device's copy on open",
    /const draft = readLocalDraft\(site\.id\)/.test(shell),
  )
  check(
    "a draft the server already has is dropped without asking",
    /if \(Object\.keys\(missing\)\.length === 0\) \{\s*\n\s*clearLocalDraft\(site\.id\)/.test(shell),
  )
  check(
    "putting it back queues it to save rather than only showing it",
    /for \(const path of Object\.keys\(draft\.files\)\) dirtyPaths\.current\.add\(path\)/.test(shell),
  )
  check(
    "the copy is cleared only once the server has the work",
    /if \(dirtyPaths\.current\.size === 0\) \{\s*\n\s*clearLocalDraft\(site\.id\)/.test(shell),
    "clearing on a save that did not carry every dirty path loses the rest",
  )
  check(
    "a browser that cannot keep a copy says so",
    /setNoLocalNet\(!kept\)/.test(shell) && /will not keep a local copy/.test(shell),
  )

  console.log("\nA restore keeps what it replaces")

  const run = read("lib/sites/agent/run.ts")
  const restore = run.slice(run.indexOf("export async function restoreVersion"))
  check("restoreVersion is where the test expects it", restore.length > 0)
  check(
    "the current project becomes a version before anything is overwritten",
    /const current = await readProject\(siteId\)/.test(restore) &&
      /snapshot\(siteId, current, "Before restoring an earlier version"\)/.test(restore),
  )
  const snapshotAt = restore.indexOf("Before restoring an earlier version")
  const deleteAt = restore.indexOf("orphans.length > 0")
  const writeAt = restore.indexOf("await saveFiles(siteId, files)")
  check("the delete and the write are both found", deleteAt > 0 && writeAt > 0)
  check(
    "and the copy is taken BEFORE both of them, not after",
    snapshotAt > 0 && snapshotAt < deleteAt && snapshotAt < writeAt,
    `snapshot@${snapshotAt} delete@${deleteAt} write@${writeAt}`,
  )
  check(
    "a snapshot that cannot be taken stops the restore",
    /if \(!kept\) \{[\s\S]{0,200}return \{\s*\n?\s*ok: false/.test(restore),
    "here a missing snapshot costs the project, not just undo",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
