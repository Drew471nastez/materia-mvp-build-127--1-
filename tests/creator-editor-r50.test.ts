/**
 * ===========================================================================
 *  ROUND 50: THE CREATOR PAGE EDITOR AND EDIT PROFILE
 * ===========================================================================
 * "Make sure everything is working: undo and redo in the creator page editor,
 * and in edit profile make sure everything saves and works. Organizing works
 * 100%. Clicking the navigation works to navigate."
 *
 *   1. EVERY SAVE TAKES THE PAGE'S HELD COPIES DOWN. /api/creator-profile
 *      purged only for a new name or photo, so a bio, cover, link, scheme,
 *      arrangement, the bar or the story stayed on the CDN's copy and in the
 *      shared config read for minutes.
 *   2. UNDO STEPS: the route answers each save with the body that puts back
 *      exactly the fields it was sent (lib/storefront/creator-profile-undo),
 *      the page's sheets save through one helper that keeps the step, the
 *      frame sends it up with "saved", the workspace keeps the history
 *      (lib/store-builder/editor-history) with toolbar buttons and the keys.
 *   3. UNDO INSIDE A SHEET: the form's own steps, typing grouped per field
 *      (lib/store-builder/form-history), in Edit profile, Arrange and the bar.
 *   4. ARRANGE: a selection keeps the rest of the catalogue in place
 *      (mergeArrangement), the drop does not jump, a long list scrolls under
 *      a drag, arrow keys on the grip, the focus stays with the row.
 *   5. NAVIGATION IN THE CANVAS: the product page's way back stays in the
 *      frame (it loaded the workspace inside itself), a refused link says
 *      why, the undo keys are handed up to the workspace.
 *
 * In a browser: the probe in the round's report (Playwright against `next
 * dev` and the Supabase stub with `writes: true`) saves every control,
 * reloads, and reads the rows back.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"
import { undoBodyFor, type CreatorPageBefore } from "../lib/storefront/creator-profile-undo"
import { EMPTY_HISTORY, canRedo, canUndo, historyKey, isEditorStep, isTextField, pushStep, redone, stepToRedo, stepToUndo, undone, MAX_STEPS } from "../lib/store-builder/editor-history"
import { GROUP_MS, formRedo, formUndo, recordForm, startForm } from "../lib/store-builder/form-history"
import { applyManualOrder, mergeArrangement } from "../lib/store-builder/featured-order"
import { canvasRefusesHref } from "../lib/store-builder/editor-channel"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const before = (over: Partial<CreatorPageBefore> = {}): CreatorPageBefore => ({
  displayName: "Satori Studio",
  profileAvatarUrl: "https://x.test/a.png",
  creatorBio: "Prints",
  creatorCoverUrl: null,
  creatorShowsSales: true,
  header: {
    bio: "Prints and posters",
    coverImageUrl: "https://x.test/c.png",
    coverFocalPoint: { x: 20, y: 70 },
    coverZoom: 1.5,
    socialLinks: { instagram: { enabled: true, url: "https://instagram.com/satori" } },
    productsOrder: ["b", "a"],
    showStats: true,
    hideSocialLinks: false,
    subscribeBar: { text: "Join us", buttonText: "Go", buttonTextPreset: "custom", style: "style2", buttonColor: "#ff0000", colors: { backgroundColor: "#000000" }, colorChoices: ["buttonColor"] },
  } as unknown as CreatorPageBefore["header"],
  themePreset: "midnight",
  about: { headline: "About", aboutContent: "<p>Story</p>", mediaItems: [] },
  ...over,
})

function main() {
  console.log("\n1. Every save takes the page's held copies down")
  {
    const route = code("app/api/creator-profile/route.ts")
    check("the route imports the creator page purge", /import \{ creatorPagesChanged \} from "@\/lib\/storefront\/creator-page-purge"/.test(route))
    check("  and purges by the person and the store", /creatorPagesChanged\(\{ userId: page\.profileId, creatorId: creator\.id \}\)/.test(route))
    check("  after the config is written, before it answers", route.indexOf("await purge()", route.indexOf('"[creator-profile] config update failed"')) > 0)
    check("  and on the answer for a store with no config row", /if \(!config\) \{\s*await purge\(\)/.test(route))
    check("  not twice when identityChanged already purged (a name or photo)", /Object\.keys\(profileUpdate\)\.length > 0 \? Promise\.resolve\(\)/.test(route))
    check("identityChanged still purges a name or photo", /expireCreatorPages: \(userId\) => creatorPagesChanged\(\{ userId \}\)/.test(code("lib/account/identity-caches.ts")))
  }

  console.log("\n2. The route says how to put a save back")
  {
    const b = before()
    check("only the keys sent come back", eq(Object.keys(undoBodyFor({ displayName: "New" }, b) ?? {}), ["displayName"]))
    check("name", undoBodyFor({ displayName: "New" }, b)?.displayName === "Satori Studio")
    check("bio from the header first, then the creator row", undoBodyFor({ bio: "x" }, b)?.bio === "Prints and posters" && undoBodyFor({ bio: "x" }, before({ header: {} as never }))?.bio === "Prints")
    check("photo: the header's, else the profile's", undoBodyFor({ avatarUrl: null }, b)?.avatarUrl === "https://x.test/a.png")
    const cover = undoBodyFor({ coverUrl: "https://x.test/new.png" }, b)
    check("a cover goes back with its own crop", cover?.coverUrl === "https://x.test/c.png" && eq(cover?.coverFocalPoint, { x: 20, y: 70 }) && cover?.coverZoom === 1.5)
    check("a page that had no cover gets none (null, not a string)", undoBodyFor({ coverUrl: "https://x.test/n.png" }, before({ header: {} as never }))?.coverUrl === null)
    const links = undoBodyFor({ socialLinks: { tiktok: "me" } }, b)?.socialLinks as Record<string, string>
    check("links: every platform, as stored, empty where there was none", links.instagram === "https://instagram.com/satori" && links.tiktok === "")
    check("switches: what the page showed, read as the page reads it", eq(undoBodyFor({ display: { showReviews: false, showSocialMedia: false, showTotalSalesBadge: false } }, before({ creatorShowsSales: false }))?.display, { showReviews: true, showTotalSalesBadge: false, showSocialMedia: true }))
    check("scheme, and default for a page that never chose", undoBodyFor({ themePreset: "x" }, b)?.themePreset === "midnight" && undoBodyFor({ themePreset: "x" }, before({ themePreset: null }))?.themePreset === "default")
    check("product order, and [] (newest first) for a page never arranged", eq(undoBodyFor({ productsOrder: ["a"] }, b)?.productsOrder, ["b", "a"]) && eq(undoBodyFor({ productsOrder: ["a"] }, before({ header: {} as never }))?.productsOrder, []))
    const bar = undoBodyFor({ subscribeBar: { text: "x", buttonText: "y", style: "style1", buttonColor: "#00ff00", backgroundColor: "#ffffff", textColor: "#111111" } }, b)?.subscribeBar as Record<string, unknown>
    check("the bar: text, label, preset", bar.text === "Join us" && bar.buttonText === "Go" && bar.style === "style2")
    check("  a colour somebody chose comes back", bar.buttonColor === "#ff0000")
    check("  a colour nobody chose goes back to the scheme (null), even when one is stored", bar.backgroundColor === null && bar.textColor === null)
    check("the story's fields, for About's saves", eq(undoBodyFor({ about: { aboutContent: "x" } }, b)?.about, { aboutContent: "<p>Story</p>" }))
    check("nothing to put back is null", undoBodyFor({}, b) === null)
    const route = code("app/api/creator-profile/route.ts")
    check("the route reads what it needs before it writes", route.indexOf("profileBefore") < route.indexOf('.update(profileUpdate)'))
    check("  and answers with the undo", /storefront: true,(?: \.\.\.\(about \? \{ about \} : \{\}\),)? undo: undoFor\(config\.published_config \?\? config\.draft_config\)/.test(route))
    check("a null bar colour is taken out of the stored colours and out of the choices", /if \(v === null\) \{\s*colorClears\.push\(key\)/.test(route) && /for \(const key of clears\) \{\s*delete merged\[key\]/.test(route) && /\.filter\(\(k\) => !clears\.includes\(k\)\)/.test(route))
  }

  console.log("\n3. The workspace's history")
  {
    const s = (n: number) => ({ label: `s${n}`, redo: { n }, undo: { n: -n } })
    let h = EMPTY_HISTORY
    check("empty: nothing to undo or redo", !canUndo(h) && !canRedo(h) && stepToUndo(h) === null)
    h = pushStep(pushStep(h, s(1)), s(2))
    check("two saves: undo the second", canUndo(h) && !canRedo(h) && stepToUndo(h)?.label === "s2")
    h = undone(h)
    check("undone: redo it, undo the first", canRedo(h) && stepToRedo(h)?.label === "s2" && stepToUndo(h)?.label === "s1")
    h = redone(h)
    check("redone", !canRedo(h) && h.at === 2)
    h = pushStep(undone(h), s(3))
    check("a new save after an undo drops what was undone", eq(h.steps.map((x) => x.label), ["s1", "s3"]) && !canRedo(h))
    let big = EMPTY_HISTORY
    for (let i = 0; i < MAX_STEPS + 5; i++) big = pushStep(big, s(i))
    check("capped", big.steps.length === MAX_STEPS && big.at === MAX_STEPS)
    check("a step from a message is checked", isEditorStep(s(1)) && !isEditorStep({ label: "x", redo: [] , undo: {} }) && !isEditorStep(null))
    const k = (key: string, o: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => historyKey({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o })
    check("keys: Cmd+Z, Ctrl+Z undo", k("z", { metaKey: true }) === "undo" && k("z", { ctrlKey: true }) === "undo")
    check("keys: Shift+Cmd+Z, Shift+Ctrl+Z (Z as typed with Shift), Ctrl+Y redo", k("z", { metaKey: true, shiftKey: true }) === "redo" && k("Z", { ctrlKey: true, shiftKey: true }) === "redo" && k("y", { ctrlKey: true }) === "redo")
    check("keys: a plain z, Alt+Cmd+Z and Cmd+Y are not", k("z") === null && k("z", { metaKey: true, altKey: true }) === null && k("y", { metaKey: true }) === null)
    check("a text field keeps its own keys", isTextField({ tagName: "INPUT", type: "text" } as unknown as Element) && isTextField({ tagName: "TEXTAREA" } as unknown as Element) && !isTextField({ tagName: "INPUT", type: "checkbox" } as unknown as Element) && !isTextField({ tagName: "BUTTON" } as unknown as Element))

    const ws = code("components/app/creator-page-workspace.tsx")
    check("the workspace keeps the steps that come with \"saved\"", /kept\.reduce\(pushStep, h\)/.test(ws) && /steps\.filter\(isEditorStep\)/.test(ws))
    check("  undo and redo are a PATCH to the same route, then the canvas reloads", /fetch\("\/api\/creator-profile", \{\s*method: "PATCH"/.test(ws) && /action === "undo" \? step\.undo : step\.redo/.test(ws) && /undone\(cur\) : redone\(cur\)\)\)\s*reframe\(\)/.test(ws))
    check("  toolbar buttons, disabled with nothing to do or while one runs", /disabled=\{!historyCanUndo\(history\) \|\| historyBusy\}/.test(ws) && /disabled=\{!historyCanRedo\(history\) \|\| historyBusy\}/.test(ws))
    check("  the keys on the workspace, and from the canvas", /historyKey\(e\)/.test(ws) && /data\.kind === "history"/.test(ws))
    check("  kept for the visit (sessionStorage), every read and write guarded", /sessionStorage\.getItem\(storeKey\)/.test(ws) && /sessionStorage\.setItem\(storeKey/.test(ws))
    const nav = code("components/storefront/embedded-navigation.tsx")
    check("the canvas hands the keys up, not in a field and not with a sheet open", /forwardHistoryKey\(action\)/.test(nav) && /isTextField\(document\.activeElement\)/.test(nav) && /\[data-sheet-panel\]/.test(nav))
    const channel = code("lib/store-builder/editor-channel.ts")
    check("\"saved\" carries the steps kept since the last one", /kind: "saved", steps \}/.test(channel) && /pendingSteps\.splice\(0\)/.test(channel))
    const client = code("lib/storefront/creator-profile-client.ts")
    check("one save helper keeps the step from the route's answer", /recordEditorStep\(\{ label, redo: body, undo: data\.undo/.test(client))
    for (const f of ["components/storefront/edit-profile-button.tsx", "components/storefront/arrange-products-button.tsx", "components/storefront/edit-cta-button.tsx"]) {
      const c = code(f)
      check(`${f.split("/").pop()} saves through it and has the sheet's undo`, /saveCreatorProfile\(/.test(c) && !/fetch\("\/api\/creator-profile"/.test(c) && /useFormHistory\(/.test(c) && /history=\{formHistory\}/.test(c))
    }
  }

  console.log("\n4. Undo inside a sheet, typing grouped")
  {
    let f = startForm({ name: "A", bio: "", on: true })
    f = recordForm(f, { name: "AB", bio: "", on: true }, 1000)
    f = recordForm(f, { name: "ABC", bio: "", on: true }, 1200)
    f = recordForm(f, { name: "ABCD", bio: "", on: true }, 1500)
    check("a burst of typing in one field is one step", f.states.length === 2 && f.states[1].name === "ABCD")
    f = recordForm(f, { name: "ABCDE", bio: "", on: true }, 1500 + GROUP_MS + 10)
    check("a pause starts a new one", f.states.length === 3)
    f = recordForm(f, { name: "ABCDE", bio: "h", on: true }, 2400)
    check("another field starts a new one", f.states.length === 4)
    f = recordForm(f, { name: "ABCDE", bio: "h", on: false }, 2450)
    check("a switch is its own step", f.states.length === 5)
    f = formUndo(formUndo(f))
    check("undo walks back", f.states[f.at].bio === "" && f.states[f.at].on === true && f.states[f.at].name === "ABCDE")
    f = formRedo(f)
    check("redo walks forward", f.states[f.at].bio === "h")
    f = recordForm(f, { name: "Z", bio: "h", on: true }, 9000)
    check("a change after an undo drops the redo", f.at === f.states.length - 1 && f.states.length === 5 && f.states[4].name === "Z")
    let g = startForm({ links: { instagram: "", tiktok: "" } })
    g = recordForm(g, { links: { instagram: "a", tiktok: "" } }, 100)
    g = recordForm(g, { links: { instagram: "ab", tiktok: "" } }, 200)
    check("typing into one social link groups too", g.states.length === 2)
    const sheet = code("components/storefront/editor-sheet.tsx")
    check("the sheet draws the two arrows when given a history, disabled with nothing to do", /history\?: SheetHistory/.test(sheet) && /disabled=\{!can \|\| busy \|\| saved\}/.test(sheet))
    const hook = code("lib/store-builder/form-history.ts")
    check("the keys work in every field of an open sheet (capture, before the field)", /addEventListener\("keydown", onKey, true\)/.test(hook))
  }

  console.log("\n5. Arrange")
  {
    const full = ["a", "b", "c", "d", "e"]
    check("a selection keeps the rest in place", eq(mergeArrangement(full, ["d", "b"]), ["a", "d", "c", "b", "e"]))
    check("the whole list is just the new order", eq(mergeArrangement(full, ["e", "d", "c", "b", "a"]), ["e", "d", "c", "b", "a"]))
    check("an id the catalogue did not have is kept, after it", eq(mergeArrangement(["a", "b"], ["x", "a"]), ["x", "b", "a"]))
    /* The bug: arranging Home's two featured products stored only them, so the other three jumped to the front of Products. */
    const stored = mergeArrangement(full, ["d", "b"])
    check("after arranging a selection the Products tab is not reshuffled", eq(applyManualOrder(full.map((id) => ({ id })), stored).map((p) => p.id), ["a", "d", "c", "b", "e"]))
    const arrange = code("components/storefront/arrange-products-button.tsx")
    check("Arrange saves the merged order when it was given the whole catalogue", /mergeArrangement\(allProducts\.map\(\(p\) => p\.id\), ids\)/.test(arrange))
    check("Home's Featured row follows the arrangement: SectionRenderer passes productsOrder on (it was dropped)", /productsOrder=\{productsOrder\}/.test(code("components/store-builder/section-renderer.tsx")) && /productsOrder=\{headerSettings\?\.productsOrder\}/.test(code("app/(storelib)/(marketing)/u/[username]/page.tsx")))
    check("Home's Arrange is given the whole catalogue", /allProducts=\{catalogueInOrder\}/.test(code("components/store-builder/unified-section-renderer.tsx")))
    check("the drop does not jump: transitions off for the commit, the lifted row glides from where it was let go", /setSettling\(\{ id: current\.id, residual: current\.dy - \(current\.to - current\.from\) \* current\.rowHeight \}\)/.test(arrange) && /: settling\s*\?/.test(arrange))
    check("a drag near the edge scrolls the list and the drag follows", /box\.scrollTop = before \+/.test(arrange) && /scroller\(\)\?\.scrollTop \?\? 0\) - startScroll\.current/.test(arrange))
    check("arrow keys on the grip, and the focus stays with the row", /onKeyDown=\{\(e\) => onGripKey\(e, product\.id, index\)\}/.test(arrange) && /refocus\(id, which\)/.test(arrange))
    check("reopening starts from the page in the same render as the open, not on every new prop", /const openSheet = \(\) => \{\s*setOrder\(products\)/.test(arrange) && !/\}, \[open, products\]\)/.test(arrange))
    check("Save is grey until the order changed", /saveDisabled=\{!changed\}/.test(arrange))
  }

  console.log("\n6. Navigation in the canvas")
  {
    const back = code("components/storefront/embedded-back-bar.tsx")
    check("the product page's way back stays in the frame, on the creator page", /`\/\$\{encodeURIComponent\(handle\)\}\?embedded=1`/.test(back))
    check("  and the product page tells it whose", /<EmbeddedBackBar handle=\{creatorUsername\} \/>/.test(code("app/(storelib)/(marketing)/p/[slug]/page.tsx")))
    const nav = code("components/storefront/embedded-navigation.tsx")
    check("a link the canvas will not follow says why (no dead click)", /canvasRefusesHref\(href, window\.location\.href\)\) \{\s*event\.preventDefault\(\)\s*showPillToast\(/.test(nav))
    check("  checkout and the app are still refused", canvasRefusesHref("/checkout/x", "https://storelib.com/a") && canvasRefusesHref("/app/products", "https://storelib.com/a") && !canvasRefusesHref("/satori/zine", "https://storelib.com/a"))
    check("the owner menu's rows leave the frame (target _top)", /target: "_top" as const/.test(code("components/storefront/owner-menu.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
