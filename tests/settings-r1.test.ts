/**
 * Settings, round R1 (the owner's fifteen notes on the Settings sheet and the
 * phone's Settings page). The unsaved changes guard is driven for real; the
 * rest is pinned in the source. Measured in a browser, at 1440 and at 390
 * with a simulated keyboard, by scripts/check-settings-r1.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { discardAllUnsaved, hasUnsaved, markDirty, requestLeave, saveAllUnsaved, setLeaveAsker, subscribeUnsaved } from "../lib/settings/unsaved-guard"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

async function guard() {
  console.log("\nLeaving with changes that aren't saved\n")
  let went = 0
  const go = () => { went++ }
  check("nothing unsaved: a way out goes at once", requestLeave(go) === true && went === 1)
  let asked: null | (() => void) = null
  setLeaveAsker((g) => { asked = g })
  let flips = 0
  const off = subscribeUnsaved(() => { flips++ })
  let discarded = 0
  let saveOk = false
  markDirty("form", { discard: () => { discarded++ }, save: async () => saveOk })
  check("a piece with changes makes Settings unsaved, and says so once", hasUnsaved() && flips === 1)
  markDirty("form", { discard: () => { discarded++ }, save: async () => saveOk })
  check("  saying it again is not a change", flips === 1)
  check("with changes, a way out asks instead of going", requestLeave(go) === false && went === 1 && asked !== null)
  check("a save that fails keeps the changes", (await saveAllUnsaved()) === false && hasUnsaved())
  saveOk = true
  check("a save that works clears them", (await saveAllUnsaved()) === true && !hasUnsaved())
  markDirty("form", { discard: () => { discarded++ } })
  discardAllUnsaved()
  check("Discard puts every piece back and clears it", discarded === 1 && !hasUnsaved())
  markDirty("a", { discard: () => {} })
  markDirty("a", null)
  check("a piece with nothing left to save takes itself off", !hasUnsaved())
  off()
  setLeaveAsker(null)
}

function wiring() {
  console.log("\nWired in\n")
  const form = read("components/app/settings-form-new.tsx")
  const sheet = read("components/app/settings-sheet.tsx")
  const guardUi = read("components/app/settings/leave-guard.tsx")
  check("the form's own changes are Settings' unsaved changes, with its save and its discard", /markDirty\("settings-form", hasUnsavedChanges \? \{ save: \(\) => submitRef\.current\(\), discard: \(\) => discardRef\.current\(\) \} : null\)/.test(form))
  check("  and the save says whether it worked", /const handleSubmit = async \(e\?: React\.FormEvent \| Event\): Promise<boolean> =>/.test(form))
  check("another section asks first", /requestLeave\(\(\) => \{\n      scrollPending\.current = true/.test(form))
  check("every way the sheet closes asks first, and a drag springs back while it asks", /if \(!hasUnsaved\(\)\) return closeNow\(from, speed\)/.test(sheet) && /requestLeave\(\(\) => closeNow\(\)\)/.test(sheet))
  check("a link out is caught before the router, and Back meets an extra history entry", /document\.addEventListener\("click", onClick, true\)/.test(guardUi) && /window\.history\.pushState\(\{ \.\.\.\(window\.history\.state \?\? \{\}\), \[GUARD_KEY\]: true \}/.test(guardUi) && /window\.addEventListener\("popstate", onPop\)/.test(guardUi))
  check("Save, Discard and Keep editing; a bottom sheet on a phone", /data-leave-save=""/.test(guardUi) && /data-leave-discard=""/.test(guardUi) && /data-leave-keep=""/.test(guardUi) && /<BottomSheet isOpen=\{open\} onClose=\{keep\}/.test(guardUi))
  check("Settings mounts it", /<SettingsLeaveGuard \/>/.test(form))

  console.log("\nAI Memory keeps what is typed\n")
  const memory = read("components/app/settings/ai-memory-panel.tsx")
  check("no form around the sections, so a panel's own form submits only itself", !/<form ref=\{formRef\}/.test(form) && /<div ref=\{formRef\} data-settings-content="">/.test(form))
  check("  and AI Memory's own submit stops where it is", /e\.preventDefault\(\)\n              e\.stopPropagation\(\)\n              void add\(\)/.test(memory))
  check("the box is the card's width, grows to six lines, 16px on a phone", /className="block min-h-\[64px\] w-full resize-none/.test(memory) && /text-\[16px\] leading-\[22px\]/.test(memory) && /Math\.min\(t\.scrollHeight, 6 \* 22 \+ 20\)/.test(memory))
  check("drawn at once from what Settings fetched ahead", /peekGet<Answer>\(PATH\)/.test(memory) && /ai_memory: \(\) => \["\/api\/ai-memory"\]/.test(form))

  console.log("\nSections switch at once\n")
  check("no glide in Settings' sections", !/glideScrollTop|startGlide/.test(form))
  check("data already here swaps on the press; on its way, at most 160ms", /const DATA_WAIT_MS = 160/.test(form) && /if \(urls\.every\(\(u\) => peekGet\(u\) !== null\)\) show\(\)/.test(form))
  check("a pill eases its own background: no span over it, nothing animated inside it", !/data-settings-tab-fill/.test(form) && /transition-\[color,background-color,box-shadow\]/.test(form))
  const ui = read("components/physical/ui.tsx")
  check("a kept answer is drawn however old, and read again behind it", /return e && e\.data !== undefined \? \(e\.data as T\) : null/.test(ui) && /if \(e\) return keep\(path\) as Promise<ApiResult<T>>/.test(ui))

  console.log("\nThe phone's page\n")
  check("its scroll does not rubber band", /\[scrollbar-gutter:stable\] max-lg:overscroll-none/.test(sheet))
  check("its foot is room for the nav pill, and the save bar above it", /pb-\[calc\(var\(--app-nav-top\)\+10px\+48px\+24px\)\]/.test(form) && /"pb-\[var\(--app-nav-room\)\] md:pb-16 lg:pb-32"/.test(form))
  check("every Modal is the app's bottom sheet on a phone, on the keyboard, its field kept in sight", /if \(phone\) return <ModalSheet/.test(ui) && /<BottomSheet\n      isOpen=\{open\}\n      onClose=\{onClose\}\n      label=\{title\}\n      hideFrom=\{null\}\n      fill\n      aboveKeyboard/.test(ui) && /useFieldInView\(body, open\)/.test(ui))
  check("  and on a computer a dialog on the body", /createPortal\(\n    <div className="fixed inset-0 z-\[80\]/.test(ui))
  check("Settings' own sheets (Change email, Delete account) sit on the keyboard", /hideFrom=\{null\}\n        \/\* Change email and Delete account have fields: the sheet sits on the keyboard, never under it\. \*\/\n        aboveKeyboard/.test(form))

  console.log("\nIntegrations\n")
  const dir = read("components/app/settings/integrations-directory.tsx")
  /* Changed on purpose (round 23, the owner: "no slide delay, no flash, back returns to where you were"): no sideways push or pop, a 120ms fade from 0.55, and Back lands on the list exactly where it was (tests/integrations23.test.ts, scripts/check-integrations23.mjs). */
  /* Changed on purpose (round 30, the owner: "no white flash"): the fade from 0.55 was the pale frame; the page and the list are now whole on their first frame (scripts/check-integrations-round30.mjs). */
  check("a card opens its page and Back the list in place, whole on the first frame, never from blank", !/SWAP_FROM/.test(dir) && !/el\.animate\(\[\{ opacity: SWAP_FROM/.test(dir) && /A CUT, NOT A FADE/.test(dir) && !/PAGE_SHIFT/.test(dir))
  check("Back returns to where the list was, set before the frame is painted", /box\.scrollTop = at\.scroll/.test(dir) && /React\.useLayoutEffect/.test(dir))
  /* Changed on purpose (the owner: the pills were "buggy and glitchy"): the cards no longer fade up from 0.4 on every press, they are simply there. */
  check("a category keeps the pills where they are, and the cards are there at once", /box\.scrollTop \+= now - want/.test(dir) && !/translate3d\(0, 6px, 0\)/.test(dir))
  check("the page has a header with the mark, where it stands, and the action", /data-integration-header=""/.test(dir) && /data-integration-standing=\{status\}/.test(dir) && /data-integration-action=""/.test(dir))

  console.log("\nActivity, Store details, Plan\n")
  const activity = read("components/app/settings/activity-panel.tsx")
  check("a pill draws its own kept list, or works it out from All, never a blank card", /function firstPage\(f: Filter\): Page \| null/.test(activity) && /data-activity-loading=""/.test(activity) && !/min-h-\[200px\]" aria-busy/.test(activity))
  check("the log groups offers as the page does", /q\.or\("action\.like\.product\.%,action\.like\.offer\.%"\)/.test(read("lib/activity/log-server.ts")))
  check("Store details asks only for the logo, not the email and the website address one after the other", /storeIdentity\(db, c\.creatorId, \{ skipStoreLogo: true, logoOnly: true \}\)/.test(read("app/api/store/settings/route.ts")) && /if \(opts\.logoOnly\) return/.test(read("lib/store/identity-server.ts")))
  check("Plan has a centred Plans and pricing", />Plans and pricing<\/h2>/.test(read("components/app/billing/billing-page-client.tsx")))
  check("the Name field keeps a space typed after the first name", /value=\{nameDraft \?\? fullNameForUsernameInput\}/.test(form))
  check("the probe that measures all of it is on disk", /check-settings-r1/.test(read("scripts/check-settings-r1.mjs")))
}

void guard().then(() => {
  wiring()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})
