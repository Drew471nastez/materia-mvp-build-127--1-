/**
 * Round AU, track 2: the OnePage editor's work kept safe on a bad network, in
 * the apps and across two devices, and typing on a slow phone.
 *
 *   DRAFT        unsaved work is kept on the device (lib/onepage/local-draft),
 *                written after each edit and at once when the app goes to the
 *                background, cleared once saved; opening the editor puts it
 *                back when the server still holds the copy it was made on, and
 *                asks when the page was saved somewhere else since
 *   CONFLICT     every save names the copy it started from
 *                (lib/onepage/edit-version); the server writes nothing over a
 *                newer copy and answers 409; a second Save keeps this one
 *   RETRY        a save that failed for the network or the server is tried
 *                again on its own (backoff, back online, back in the app),
 *                only while nothing new has been typed
 *   ERRORS       a throw in one block's settings or one tab stays there
 *   RESUME       coming back to the app reads the catalogue once, not once
 *                per product row, and sends nothing unless a retry waits
 *   SPEED        the rows ask the time zone only for a block with a schedule,
 *                a zone is checked once, and a preview out of sight is drawn
 *                once the typing pauses, not per letter
 *
 * scripts/check-onepage-au2.mjs measures typing, opening and scrolling at 390
 * (touch, CPU 4x) and 1440 (CPU 2x).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { onePageEditVersion, sentBaseVersion } from "@/lib/onepage/edit-version"
import { clearDraft, draftDecision, draftFieldsOf, readDraft, withDraft, writeDraft, DRAFT_MAX_AGE_MS, type DraftStore, type LocalDraft } from "@/lib/onepage/local-draft"
import { describeSaveFailure, retryDelay, retryableSave } from "@/lib/onepage/editor-state"
import { scheduleLabel } from "@/lib/onepage/extra-blocks"
import type { OnePage } from "@/lib/onepage/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
  }
}
function section(name: string) {
  console.log(`\n${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function memoryStore(): DraftStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) }
}
const page = (over: Partial<OnePage> = {}): OnePage =>
  ({
    id: "op1",
    owner_id: "u1",
    slug: "anna",
    title: "Anna",
    bio: "Prints",
    theme: { background_type: "solid", background_color: "#fff" },
    settings: { seo_title: "Anna" },
    social_links: { instagram: "https://instagram.com/anna" },
    draft_blocks: [{ id: "a", type: "link_button", enabled: true, sort_order: 0, data: { label: "Shop", url: "https://example.com" } }],
    archived_blocks: [],
    status: "published",
    created_at: "",
    updated_at: "",
    ...over,
  }) as unknown as OnePage

section("CONFLICT: the edit version")
{
  const row = { draft_blocks: [{ id: "a", data: { label: "Shop", url: "x" } }], archived_blocks: [], theme: { a: 1, b: 2 }, bio: "Hi" }
  const v = onePageEditVersion(row)
  check("16 hex digits", typeof v === "string" && /^[0-9a-f]{16}$/.test(v!), v)
  check("key order does not matter (jsonb reorders keys)", onePageEditVersion({ ...row, theme: { b: 2, a: 1 } }) === v)
  check("a block's text changes it", onePageEditVersion({ ...row, draft_blocks: [{ id: "a", data: { label: "Shop!", url: "x" } }] }) !== v)
  check("the bio and the look change it", onePageEditVersion({ ...row, bio: "Hello" }) !== v && onePageEditVersion({ ...row, theme: { a: 1, b: 3 } }) !== v)
  check("the title, settings and social links do not (other screens write them)", onePageEditVersion({ ...row, title: "x", settings: { y: 1 }, social_links: { z: 1 } } as never) === v)
  check("missing archive is an empty archive", onePageEditVersion({ ...row, archived_blocks: null }) === v)
  check("a sent base is taken only as a fingerprint", sentBaseVersion(v) === v && sentBaseVersion("x") === null && sentBaseVersion(undefined) === null && sentBaseVersion({}) === null)
  check("a 409 is said in words, not as a failure code", /saved somewhere else/i.test(describeSaveFailure(409, "This page was saved somewhere else since you opened it")))

  const route = read("app/api/onepage/route.ts")
  /* Changed on purpose (OnePage production audit, S1/S2): the body also carries social_links_patch and publish after base_version. */
  check("PUT reads base_version from the body", /base_version,\s*(?:social_links_patch,\s*publish,\s*)?\} = body/.test(route))
  check("PUT compares it with the row found by id and owner, and answers 409 writing nothing", /const base = sentBaseVersion\(base_version\)[\s\S]{0,1600}\.eq\("id", id\)\s*\.eq\("owner_id", ownerId\)[\s\S]{0,600}onePageEditVersion\(current\) !== base\) return conflictAnswer\(\)/.test(route) && /status: 409/.test(route)) // Changed on purpose (round AV): the 409 is one answer, also given when the row moved between the check and the write
  check("the conflict check comes after the ownership read and before any write", route.indexOf("if (!existing)") < route.indexOf("sentBaseVersion(base_version)") && route.indexOf("sentBaseVersion(base_version)") < route.indexOf("const write = (row"))
  /* Changed on purpose (OnePage production audit, S7): worked out once, answered in the body and in a header. */
  check("PUT answers with the new edit version", /const editVersion = onePageEditVersion\(updated/.test(route) && /edit_version: editVersion/.test(route) && /"X-OnePage-Edit-Version": editVersion/.test(route))
  const pageTsx = read("app/(storelib)/app/onepage/page.tsx")
  check("the editor opens with the server's edit version (owner and team member)", (pageTsx.match(/edit_version: onePageEditVersion\(onepage\)/g) ?? []).length === 2)
  const ctx = read("lib/onepage/context.tsx")
  /* Changed on purpose (OnePage production audit, S1/S2): the body is built by lib/onepage/editor-state saveRequestBody, which sends the base it is given. */
  check("every save sends the base it holds, unless the creator chose to keep theirs", /saveRequestBody\(snapshot, archived, savedFieldsRef\.current, overrideConflictRef\.current \? null : baseVersionRef\.current\)/.test(ctx))
  check("a 409 arms the second Save to keep this copy", /saveResponse\.status === 409\) overrideConflictRef\.current = true/.test(ctx))
  /* Changed on purpose (OnePage production audit, S7): the header first, so a cut off body does not leave the next save unchecked. */
  check("a save that lands takes the server's new version", /baseVersionRef\.current = sentBaseVersion\(saveResponse\.headers\.get\("X-OnePage-Edit-Version"\)\) \?\? sentBaseVersion\(saved\?\.edit_version\)/.test(ctx))
  check("the version is read once from what the server opened, never from the page, so undo cannot bring an old one back", /const baseVersionRef = useRef<string \| null>\(sentBaseVersion\(givenOnePage\?\.edit_version\)\)/.test(ctx))
}

section("DRAFT: kept on the device")
{
  const store = memoryStore()
  const server = page()
  const version = onePageEditVersion(server as never)
  const edited = page({ bio: "Prints and posters", draft_blocks: [...server.draft_blocks, { id: "b", type: "link_button", enabled: true, sort_order: 1, data: { label: "New" } } as never] })
  const draft: LocalDraft = { v: 1, pageId: "op1", base: version, at: Date.now(), fields: draftFieldsOf(edited, []) }
  check("written", writeDraft(store, draft) && store.map.size === 1)
  const back = readDraft(store, "op1")
  check("read back for the same page", !!back && back.fields.bio === "Prints and posters")
  check("not for another page", readDraft(store, "op2") === null)
  check("the same base: put back without asking", draftDecision(back, server, version) === "restore")
  check("saved somewhere else since: asked", draftDecision(back, server, "0000000000000000") === "ask")
  check("no base known: asked, never laid over silently", draftDecision({ ...back!, base: null }, server, version) === "ask")
  check("a draft equal to the page: nothing to do", draftDecision({ ...back!, fields: draftFieldsOf(server, []) }, server, version) === "none")
  const laid = withDraft({ ...server, avatar_url: "https://cdn/photo.jpg", published_blocks: [] } as OnePage, back!)
  check("laid over: the draft's blocks and bio, the server's id, photo and published copy", laid.bio === "Prints and posters" && laid.draft_blocks.length === 2 && laid.id === "op1" && laid.avatar_url === "https://cdn/photo.jpg" && Array.isArray(laid.published_blocks))
  store.setItem("storelib:onepage-draft:op1", JSON.stringify({ ...draft, at: Date.now() - DRAFT_MAX_AGE_MS - 1 }))
  check("an old draft is dropped", readDraft(store, "op1") === null && store.map.size === 0)
  store.setItem("storelib:onepage-draft:op1", "{not json")
  check("an unreadable one is ignored", readDraft(store, "op1") === null)
  writeDraft(store, draft)
  clearDraft(store, "op1")
  check("cleared", store.map.size === 0)
  const refusing: DraftStore = { getItem: () => { throw new Error("denied") }, setItem: () => { throw new Error("quota") }, removeItem: () => { throw new Error("denied") } }
  check("storage that refuses is never an error", writeDraft(refusing, draft) === false && readDraft(refusing, "op1") === null && (clearDraft(refusing, "op1"), true))
  check("no storage at all", writeDraft(null, draft) === false && readDraft(null, "op1") === null)

  const ctx = read("lib/onepage/context.tsx")
  check("the provider reads the draft once, on opening", /readDraft\(deviceStore\(\), initial\.id\)/.test(ctx))
  check("a restore is an ordinary edit (undo takes it away)", /commit\(withDraft\(current, draft\), null\)/.test(ctx))
  check("written a moment after an edit", /DRAFT_WRITE_MS/.test(ctx) && /writeDraftNow/.test(ctx))
  check("written at once when the app goes to the background or the page is left", /visibilitychange[\s\S]{0,200}pagehide/.test(ctx) || /pagehide[\s\S]{0,200}visibilitychange/.test(ctx))
  check("cleared only when the page is clean, never while the question is open", /if \(!isDirty\) \{\s*if \(!draftQuestionRef\.current && editRevisionRef\.current === savedRevisionRef\.current\) clearDraft/.test(ctx))
  const editor = read("components/onepage/onepage-editor.tsx")
  check("the editor asks with both choices", /data-draft-keep-saved/.test(editor) && /data-draft-use-device/.test(editor))
  check("and says when it put work back", /Unsaved changes restored/.test(editor))
}

section("RETRY: a failed save is tried again")
{
  check("network and server failures are retried", retryableSave(null) && retryableSave(500) && retryableSave(502) && retryableSave(503) && retryableSave(429))
  check("a refusal is not (signed out, a bad field, a conflict, a paid setting)", !retryableSave(400) && !retryableSave(401) && !retryableSave(403) && !retryableSave(404) && !retryableSave(409))
  const delays = [0, 1, 2, 3, 4, 5, 9].map(retryDelay)
  check("backoff grows and stops at a minute", delays[0] === 2000 && delays.every((d, i) => i === 0 || d >= delays[i - 1]) && delays[6] === 60000, delays)
  const ctx = read("lib/onepage/context.tsx")
  check("only while nothing new was typed since the save that failed", /editRevisionRef\.current !== failedRevision/.test(ctx))
  check("again at once when the connection comes back or the app comes to the front", /addEventListener\("online"/.test(ctx) && /visibilityState === "visible"/.test(ctx))
  const editor = read("components/onepage/onepage-editor.tsx")
  check("the button says it is retrying", /tt\("Not saved, retrying"\)/.test(editor))
}

section("ERRORS: one block or tab, not the editor")
{
  const editor = read("components/onepage/onepage-editor.tsx")
  check("each tab sits in its own boundary", /<EditorPartBoundary/.test(editor))
  const links = read("components/onepage/tabs/links-tab.tsx")
  check("each block's settings sit in their own boundary", /<EditorPartBoundary/.test(links))
}

section("SPEED")
{
  check("a row without a schedule never asks the time zone", scheduleLabel({ schedule: null }) === null && /const timeZone = zone \?\? viewerZone\(\)/.test(read("lib/onepage/extra-blocks.ts")))
  const fmt = read("lib/i18n/format.ts")
  check("a zone is checked once", /zoneValid\.get\(zone\)/.test(fmt) && /deviceZone === undefined/.test(fmt))
  const preview = read("components/onepage/live-preview.tsx")
  check("a frame out of sight is sent the page once typing pauses", /checkVisibility\(\{ visibilityProperty: true \}/.test(preview) && /setTimeout\(send, HIDDEN_SEND_MS\)/.test(preview))
}

section("RESUME: coming back to the app")
{
  const products = read("components/onepage/tabs/product-block-editor.tsx")
  check("the catalogue is read once per return, not once per product row", /if \(shared && now - askedAt < 2000\) return/.test(products))
  const ctx = read("lib/onepage/context.tsx")
  check("coming back asks the server nothing unless a retry is waiting", /const retryNow = \(\) => \{\s*if \(!retryRef\.current\.timer\) return/.test(ctx))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
