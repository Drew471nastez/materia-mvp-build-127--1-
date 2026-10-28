/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR SAVES WHAT IS ON SCREEN, AND SAYS SO ONLY WHEN IT DID
 * ===========================================================================
 * Reported from /app/onepage: "Changes saved" appeared when the save had
 * failed (a taken address came back as a 400 nobody read), letters typed
 * while a save was out were marked saved and never sent, Settings' Save sent
 * the title from before the click, undo swallowed the next edit, and opening
 * the editor left it saying "Unsaved" before anybody touched it.
 *
 * The decisions behind the fixes live in lib/onepage/editor-state.ts, free of
 * React, and are run here. What can only be seen in the components is pinned
 * by reading their source.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  HISTORY_LIMIT,
  HISTORY_MERGE_MS,
  canStepBack,
  canStepForward,
  changedFields,
  cleanAfterSave,
  describeSaveFailure,
  editKey,
  hasRealUrl,
  recordEdit,
  replaceCurrent,
  serializeSaves,
  startHistory,
  stepBack,
  stepForward,
  syncedSocialPlatforms,
} from "@/lib/onepage/editor-state"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => stripComments(read(p))

async function main() {
  console.log("\nA burst of typing in one field is one undo step")
  {
    let h = startHistory("")
    h = recordEdit(h, "a", "block:1:data.label", 1000)
    h = recordEdit(h, "ab", "block:1:data.label", 1300)
    h = recordEdit(h, "abc", "block:1:data.label", 1700)
    check("three keystrokes close together make one step", h.entries.length === 2 && h.entries[1] === "abc")
    h = recordEdit(h, "abcd", "block:1:data.label", 1700 + HISTORY_MERGE_MS + 1)
    check("a pause starts a new step", h.entries.length === 3)
    h = recordEdit(h, "url", "block:1:data.url", 1700 + HISTORY_MERGE_MS + 50)
    check("another field is another step, however quick", h.entries.length === 4)
    h = recordEdit(h, "moved", null, 1700 + HISTORY_MERGE_MS + 60)
    h = recordEdit(h, "moved again", null, 1700 + HISTORY_MERGE_MS + 70)
    check("an edit with no key (add, move, remove) never merges", h.entries.length === 6)

    let base = startHistory("loaded")
    base = recordEdit(base, "x", "k", 10)
    base = recordEdit(base, "xy", "k", 20)
    check("the page as loaded is never merged into", base.entries[0] === "loaded" && base.entries.length === 2)

    let full = startHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) full = recordEdit(full, i, null, i)
    check(`history keeps at most ${HISTORY_LIMIT} steps`, full.entries.length === HISTORY_LIMIT && full.index === HISTORY_LIMIT - 1)
  }

  console.log("\nUndo does not swallow the next edit")
  {
    let h = startHistory("a")
    h = recordEdit(h, "ab", "k", 0)
    h = recordEdit(h, "ab!", null, 10)
    const back = stepBack(h)!
    check("undo moves back one step", back.entries[back.index] === "ab" && canStepForward(back))
    const typed = recordEdit(back, "abc", "k", 20)
    check(
      "the first edit after an undo is a step of its own, and it is recorded",
      typed.entries.length === 3 && typed.entries[2] === "abc" && typed.entries[1] === "ab",
      "it used to be dropped by a flag undo set and never cleared",
    )
    check("and it throws the redo away", !canStepForward(typed))
    const again = recordEdit(typed, "abcd", "k", 25)
    check("typing on after that merges as usual", again.entries.length === 3 && again.entries[2] === "abcd")
    check("redo returns what undo left", stepForward(back)!.entries[stepForward(back)!.index] === "ab!")
    check("nothing to undo at the page as loaded", stepBack(startHistory("x")) === null && !canStepBack(startHistory("x")))
  }

  console.log("\nA fill nobody typed makes no undo step")
  {
    let h = startHistory("a")
    h = recordEdit(h, "b", "k", 0)
    const filled = replaceCurrent(h, "b+thumbnail")
    check("it replaces the step the person is on", filled.entries.length === 2 && filled.entries[1] === "b+thumbnail")
    check("so undo goes straight past it", stepBack(filled)!.entries[0] === "a")
  }

  console.log("\nHistory keys name the field that moved")
  {
    check("changed fields are the ones whose value moved, sorted", changedFields({ a: 1, b: 2, c: 3 }, { c: 4, a: 1, b: 5 }).join() === "b,c")
    check("no change, no key", editKey("theme", null, []) === null)
    check("the same edit gives the same key", editKey("block", "x", ["data.label"]) === editKey("block", "x", ["data.label"]))
  }

  console.log("\nA save calls the page clean only if nothing changed while it ran")
  {
    check("same revision: clean", cleanAfterSave(4, 4))
    check("an edit arrived during the request: still unsaved", !cleanAfterSave(4, 5))
  }

  console.log("\nA save asked for during another one waits and runs, with the latest page")
  {
    let page = "v1"
    const sent: string[] = []
    let release: () => void = () => {}
    let saved = ""
    const run = () => {
      sent.push(page)
      return new Promise<{ ok: boolean }>((resolve) => {
        release = () => { saved = sent[sent.length - 1]; resolve({ ok: true }) }
      })
    }
    const request = serializeSaves(run, () => saved !== page, () => ({ ok: true }))
    const first = request()
    page = "v2"
    const second = request()
    const third = request()
    check("the second request does not start a parallel save", sent.length === 1)
    check("requests during one save share one follow-up", second === third)
    release()
    await first
    await new Promise((r) => setTimeout(r, 0))
    check("the follow-up runs after the first, with what was typed meanwhile", sent.length === 2 && sent[1] === "v2")
    release()
    const result = await second
    check("and its caller hears how that one went", result.ok === true && saved === "v2")

    const idle: string[] = []
    let letGo: () => void = () => {}
    const quiet = serializeSaves(
      () => { idle.push("run"); return new Promise<{ ok: boolean }>((r) => { letGo = () => r({ ok: true }) }) },
      () => false,
      () => ({ ok: true }),
    )
    const a = quiet()
    const b = quiet()
    letGo()
    await a
    await b
    check("nothing left to send: the follow-up does not run", idle.length === 1)

    let attempts = 0
    const failing = serializeSaves(
      () => { attempts++; return Promise.reject(new Error("offline")) as Promise<{ ok: boolean }> },
      () => true,
      () => ({ ok: true }),
    )
    const x = failing().catch(() => "failed")
    const y = failing().catch(() => "failed")
    await x
    await y
    check("a save that threw does not wedge the queue", attempts === 2)
  }

  console.log("\nA failed save says what happened")
  {
    check("a taken address", describeSaveFailure(400, "Slug already taken") === "That page address is taken")
    check("no answer at all", describeSaveFailure(null, "Failed to fetch").startsWith("No connection"))
    check("signed out", describeSaveFailure(401, "Unauthorized").includes("Sign in"))
    check("anything else", describeSaveFailure(500, "Failed to update") === "Couldn't save. Try again")
    for (const msg of [describeSaveFailure(400, "Slug already taken"), describeSaveFailure(null, null), describeSaveFailure(500, null)]) {
      check(`"${msg}" has no em dash`, !msg.includes("—"))
    }
  }

  console.log("\nA link with only a scheme has nowhere to go")
  {
    for (const empty of ["", "   ", "https://", "http://", " https:// ", "mailto:", "https:", null, undefined, 42]) {
      check(`${JSON.stringify(empty)} is not an address`, !hasRealUrl(empty))
    }
    for (const real of ["https://storelib.com", "http://a.b", "instagram.com/me", "mailto:hi@example.com", "https://x"]) {
      check(`${real} is an address`, hasRealUrl(real))
    }
  }

  console.log("\nThe social row changes only when the social links do")
  {
    const links = { instagram: "https://instagram.com/a", tiktok: "https://tiktok.com/@a", youtube: null } as any
    const row = [
      { platform: "tiktok", url: "https://tiktok.com/@a" },
      { platform: "instagram", url: "https://instagram.com/a" },
    ] as any
    check("in step already: null, so nothing is written on load", syncedSocialPlatforms(row, links) === null)
    const empty = syncedSocialPlatforms([], links)!
    check("an empty row is filled", empty.length === 2)
    const added = syncedSocialPlatforms(row, { ...links, twitter: "https://x.com/a" })!
    check("a new link joins at the end, keeping the dragged order", added.map((p) => p.platform).join() === "tiktok,instagram,twitter")
    const removed = syncedSocialPlatforms(row, { ...links, tiktok: null })!
    check("a removed link leaves", removed.map((p) => p.platform).join() === "instagram")
    const edited = syncedSocialPlatforms(row, { ...links, instagram: "https://instagram.com/b" })!
    check("an edited address is carried", edited[1].url === "https://instagram.com/b" && edited[0] === row[0])
    check("no links and no row: nothing to do", syncedSocialPlatforms([], {}) === null)
  }

  console.log("\nThe context: one write path, side effects outside updaters")
  {
    const ctx = code("lib/onepage/context.tsx")
    check(
      "the latest page is not copied into the ref by an effect after render",
      !/useEffect\(\(\) => \{\s*latestOnepageRef\.current = onepage/.test(ctx),
      "save() read the page from before Settings' own edits",
    )
    check("every edit goes through commit, which writes the ref first", /latestOnepageRef\.current = next\s*\n\s*setOnePageState\(next\)/.test(ctx))
    check("no state updater records history or archives", !/setOnePageState\(\(prev\)/.test(ctx) && !/addToHistory/.test(ctx))
    check("addBlock builds the block before any state is set", /const created = createDefaultBlock\(type\)/.test(ctx) && !/let newBlock: OnePageBlock \| null = null/.test(ctx))
    check("undo leaves no flag behind", !/isUndoRedoAction/.test(ctx))
    check("history steps are recorded with a key and a time", /recordEdit\(stack, snapshot, key, Date\.now\(\)\)/.test(ctx))
    check("a silent edit does not mark the page unsaved", /if \(!options\.silent\) markDirty\(\)/.test(ctx))
    check("a merge into the latest block exists", /const updateBlockData = useCallback/.test(ctx))
    check("save answers with a result", /save: \(force\?: boolean\) => Promise<SaveResult>/.test(ctx))
    check("save runs through the queue, not an early return", /serializeSaves<SaveResult>/.test(ctx) && !/if \(isSaving\.current\)/.test(ctx))
    check("clean only if unchanged since the snapshot", /if \(cleanAfterSave\(sentRevision, editRevisionRef\.current\)\) setIsDirty\(false\)/.test(ctx))
    check("what went live is the copy that was sent", /published_blocks: snapshot\.draft_blocks/.test(ctx) && !/published_blocks: prev\.draft_blocks/.test(ctx))
    check("the server's message is read", /await serverError\(saveResponse\)/.test(ctx))
  }

  console.log("\nThe editor says \"Changes saved\" only after a save that worked")
  {
    const editor = code("components/onepage/onepage-editor.tsx")
    check("the success toast waits for the result", /const result = await save\(\)\s*\n\s*if \(result\.ok\) setSaveToastSequence/.test(editor))
    check("a failed save has its own toast", /key=\{`save-failed-\$\{saveFailure\.sequence\}`\}/.test(editor) && /if \(saveError\) showSaveFailure\(saveError\.message\)/.test(editor))
    check("the Save button shows a failure and stays pressable", /saveState === "error" && isDirty/.test(editor) && /Try again/.test(editor))
    check("a throw from Settings is caught", /await settingsTabRef\.current\?\.saveAllSettings\(\)\s*\n\s*\} catch/.test(editor))
    check(
      "both save handlers list userPlan among their dependencies",
      (editor.match(/\[hasProFeaturesEnabled, save, activeTab, userPlan, showSaveFailure\]/g) ?? []).length === 1
        /* leave is the phone's way out, leaveTo a link out or a held Back (tests/onepage-leave.test.ts). */
        && /\[save, pendingNavigation, hasProFeaturesEnabled, activeTab, userPlan, showSaveFailure(, leave)?(, leaveTo)?\]/.test(editor),
    )
    check("leaving waits for the save to work", /const result = await save\(\)\s*\n\s*if \(!result\.ok\) return/.test(editor))
    check("Products switches the editor's real tab", /<ProductsTab onGoToLinks=\{\(\) => handleTabChange\("links"\)\} \/>/.test(editor))
  }

  console.log("\nSettings")
  {
    /* The SEO section and its picture writes are components/onepage/seo-panel.tsx now. */
    const settings = code("components/onepage/tabs/settings-tab.tsx") + code("components/onepage/seo-panel.tsx")
    check(
      "no request sends the whole page as this tab last saw it",
      !/JSON\.stringify\(\{ \.\.\.onepage/.test(settings),
      "it carried the archived blocks the editor opened with, and put archived blocks back",
    )
    /* Round 40: three writers now, the upload, Remove, and a picture picked from Files (seo-panel's FilesLibraryChooser), all through the one writeImage. */
    check("the image writes send only the id and their settings", (settings.match(/JSON\.stringify\(\{ id: onepage\.id, settings: /g) ?? []).length === 1 && /const writeImage = async \(imageSettings/.test(settings) && (settings.match(/await writeImage\(|void writeImage\(/g) ?? []).length === 3)
    check("the fields are not refilled on every change to the page", !/\}, \[onepage\]\)/.test(settings) && /\}, \[fromPageKey\]\)/.test(settings))
    check("a field somebody typed in is left alone", /if \(!typedIn\) setField\[key\]\(incoming\)/.test(settings))
    /* No "Saved!" of its own any more: the words beside Save are the page's own save state, "All changes saved" only when nothing is left unsaved. */
    check("\"saved\" only after a save that worked", /: unsaved \? "Unsaved changes" : "All changes saved"/.test(settings) && /const failed = saveState === "error" && unsaved/.test(settings) && !/Saved!/.test(settings))
    check("saveAllSettings makes no request of its own", !/const handleSaveAllSettings = async \(\) => \{[\s\S]*?fetch\(/.test(settings.slice(settings.indexOf("const handleSaveAllSettings"), settings.indexOf("useImperativeHandle"))))
  }

  console.log("\nProducts")
  {
    const products = code("components/onepage/tabs/products-tab.tsx")
    check("no call to the context's unused section setter", !/setActiveSection\(/.test(products))
    check("it goes to Links through the editor", /const goToLinks = useCallback\(\(\) => onGoToLinks\?\.\(\), \[onGoToLinks\]\)/.test(products))
  }

  console.log("\nA new page")
  {
    const page = code("app/app/onepage/page.tsx")
    const helper = code("lib/onepage/ensure-onepage.ts")
    check("the editor page creates it with the shared function", /await ensureOnePage\(supabase, user\.id, creator\)/.test(page))
    check("and no longer carries its own copy of the defaults", !/const newOnepage = \{/.test(page) && !/const linkBlock1 = \{/.test(page))
    check("no debug logging left", !/console\.log\(/.test(page))
    check("goes live without its placeholder links", /published_blocks: publishedDefaultBlocks/.test(helper) && /hasRealUrl\(/.test(helper))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
