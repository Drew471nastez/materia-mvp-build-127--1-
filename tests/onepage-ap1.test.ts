/**
 * ROUND AP, TRACK 1: the OnePage editor and the public OnePage.
 *
 *   the shared link card at the size a chat draws it; a quiet bin on a row
 *   under a mouse; the block sheet that opens with its content in it, eases
 *   to late content, hides its foot bar over the keyboard and is drawn down
 *   by a mouse; Share as a bottom sheet on a phone; no crossed circle for a
 *   booking link; no cookie card in the editor's preview; a thumbnail row
 *   with Replace and Remove; a row's tile is its Add block entry's; a shelf
 *   of chosen products; every sideways row follows a mouse.
 *
 * The probes measure them in headless Chromium: scripts/check-onepage-sheets-ap.mjs,
 * scripts/check-onepage-drag-rows-ap.mjs, scripts/check-onepage-button-controls-ap.mjs,
 * scripts/check-onepage-perf-ap.mjs and scripts/shot-onepage-editor-ap.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SHELF_LIMIT_MAX, shelfPick, shelfPickedIds } from "@/lib/onepage/storelib-blocks"
import { COAST_MS, restingPoint } from "@/lib/onepage/drag-scroll"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const id = (n: number) => `6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c${String(n).padStart(2, "0")}`

section("A shelf of chosen products")
{
  check("nothing saved is all of them", shelfPick({ source: "digital" }) === "all" && shelfPickedIds({ source: "digital" }) === null)
  check("a community shelf is always all of them", shelfPick({ source: "community", pick: "some" }) === "all")
  check("Choose keeps the creator's order, each once", JSON.stringify(shelfPickedIds({ source: "digital", pick: "some", product_ids: [id(2), id(0), id(2)] })) === JSON.stringify([id(2), id(0)]))
  check("One is the first alone", JSON.stringify(shelfPickedIds({ source: "digital", pick: "one", product_ids: [id(3), id(1)] })) === JSON.stringify([id(3)]))
  check("only well formed ids reach the query", JSON.stringify(shelfPickedIds({ source: "all", pick: "some", product_ids: ["x' or 1=1", id(1), 7 as never] })) === JSON.stringify([id(1)]))
  check(`at most ${SHELF_LIMIT_MAX}`, (shelfPickedIds({ source: "all", pick: "some", product_ids: Array.from({ length: 20 }, (_, i) => id(i)) }) ?? []).length === SHELF_LIMIT_MAX)
  check("Choose with nothing picked shows nothing (not all)", JSON.stringify(shelfPickedIds({ source: "digital", pick: "some", product_ids: [] })) === "[]")
  const server = code("lib/onepage/storelib-blocks-server.ts")
  check("the server reads only the page owner's published products, by id", /\.eq\("creator_id", creatorId\)\.eq\("status", "published"\)/.test(server) && /if \(ids\) q = q\.in\("id", ids\)/.test(server) && /shelfItems\(db, creatorId, shelfSource\(d\.source\), shelfLimit\(d\.limit\), shelfPickedIds\(d\)\)/.test(server))
  const editor = (code("components/onepage/storelib-blocks.tsx") + "\n" + code("components/onepage/storelib-blocks-editor.tsx"))
  check("the editor lists the creator's own products (useCreatorProducts) as All, Choose and One", /<ShelfProductPick data=\{data\} source=\{source\} products=\{products\}/.test(editor) && /\{ id: "all", label: tt\("All"\) \}/.test(editor) && /\{ id: "some", label: tt\("Choose"\) \}/.test(editor) && /\{ id: "one", label: tt\("One"\) \}/.test(editor))
  check("the page shows every product picked, How many only for All", /const limit = picked \? Math\.max\(1, picked\.length\) : shelfLimit\(data\.limit\)/.test(editor) && /shelfPick\(data\) === "all" \? <HowManyControl/.test(editor))
}

section("A row's tile is its Add block entry's")
{
  const picker = code("components/onepage/add-block-picker.tsx")
  check("matched by the data that names it (source, provider, kind, network)", /const ROW_KEYS = \["source", "provider", "kind", "network"\] as const/.test(picker) && /export function blockPickerTile/.test(picker))
  const tab = code("components/onepage/tabs/links-tab.tsx")
  check("the row and a group's row draw the tile's colours", /const tile = rowTile\(block, preview\.icon\)/.test(tab) && /const childTile = rowTile\(child, preview\.icon\)/.test(tab) && /style: \{ background: look\.tile\[0\], color: look\.tile\[1\] \}/.test(tab))
  check("a link row wears its platform's mark from the address", /const effectiveIconId = resolveLinkIcon\(data\.icon, data\.url\)/.test(tab))
}

section("A booking link never wears a crossed circle")
{
  const action = code("components/forms/action-editor.tsx")
  check("no Ban mark in the action list", !/\bBan\b/.test(action) && /calendly: <LinkIcon name="calendly"/.test(action))
  const tab = code("components/onepage/tabs/links-tab.tsx")
  check("a booking block's no-action mark is Calendly's or a calendar", /noneMark=\{bookingMark\(data\.calendly_url\)\}/.test(tab) && /return kind === "calendly" \? "calendly" : "booking"/.test(tab))
  check("a booking row says a booking form when it books through one", /subtitle: byForm \? tt\("Booking form"\)/.test(tab))
}

section("The block sheet")
{
  const sheet = code("components/onepage/block-sheet.tsx")
  check("the rise is in pixels of the height it opens at", /const share = \(pct: string\) =>/.test(sheet) && /translate: `0 \$\{share\(M\.from\.translateY\)\}`/.test(sheet))
  check("late content eases in on a transform of its own", /const FLIP_ID = "block-sheet-grow"/.test(sheet) && /new ResizeObserver/.test(sheet) && /flip\.id = FLIP_ID/.test(sheet))
  check("the foot bar steps aside while a field has the keyboard", /* Round AS: a footless sheet (the tip sheet) has none either. */ /typing( \|\| footless)? \? "hidden" : "flex"/.test(sheet) && /KEYBOARD_CHANGE_EVENT/.test(sheet))
  check("a mouse draws it down by its title, captured", /* Round AS: the sheet\'s marks are tagged only while it is up (a kept sheet carries none). */ /data-block-sheet-handle=""|tag\("data-block-sheet-handle"\)/.test(sheet) && /panel\.setPointerCapture\(e\.pointerId\)/.test(sheet) && /e\.pointerType === "touch"/.test(sheet))
  const frame = code("components/forms/action-frame.tsx")
  check("a form's sheet opens with its questions in it (or at the limit)", /const FORM_READY_MS = 280/.test(frame) && /body: Ready \?/.test(frame))
  const post = code("components/onepage/compact-post.tsx")
  check("a post measures its column before the first paint", /useLayoutEffect\(\(\) => \{\s*const el = wrapRef\.current/.test(post) && /sized \? "motion-safe:transition-\[height\]/.test(post))
}

section("Share on a phone is a bottom sheet")
{
  const share = code("components/onepage/share-sheet.tsx")
  /* Changed on purpose (wave 10, legible): the share band melts into the sheet (shareBandBlend) and the grip wears its first colour (shareBandTop); tests/onepage-legible-w10.test.ts pins them. */
  check("no centred card at every width any more", !/\bcentered\b/.test(share) && /bare phoneTop=\{shareBandTop\(band\)\} header=\{header\}/.test(share))
  check("the sheet's grip strip takes the band's colour", /handleBackground=\{phoneTop\}/.test(code("components/onepage/onepage-dialog.tsx")) && /style=\{handleBackground \? \{ background: handleBackground \} : undefined\}/.test(code("components/ui/bottom-sheet.tsx")))
}

section("No cookie card in the editor's preview")
{
  const banner = code("components/cookie-consent-banner.tsx")
  check("the preview's address and its sandbox are quiet", /const inOnePagePreview = \(pathname\?\.startsWith\("\/onepage-preview"\) \?\? false\) \|\| isOnePagePreview\(\)/.test(banner) && /inOnePagePreview \|\| embedded/.test(banner))
  check("the server's early card is not drawn there either", /quietPath = [^\n]*pathname\?\.startsWith\("\/onepage-preview"\)/.test(banner))
}

section("Thumbnails: the picture whole, Replace and Remove")
{
  const blocks = (code("components/onepage/storelib-blocks.tsx") + "\n" + code("components/onepage/storelib-blocks-editor.tsx"))
  check("a shelf's custom thumbnail and a post's cover are the picture row", (blocks.match(/<OnePageImageField/g) ?? []).length === 2 && !/ImageUpload/.test(blocks))
  check("Remove takes the shelf's own picture off (the product's shows again)", /fallback=\{products\?\.find\(\(p\) => p\.id === editing\)\?\.thumbnail_url \|\| null\}/.test(blocks) && /url \? \{ \.\.\.rest, custom_thumbnail: url \} : rest/.test(blocks))
  check("a product block's custom thumbnail is the same row", /<OnePageImageField\s+prefix=\{`thumb_\$\{block\.id\}`\}\s+value=\{data\.custom_thumbnail \|\| null\}\s+fallback=\{data\.product_thumbnail \|\| null\}/.test(code("components/onepage/tabs/links-tab.tsx")))
}

section("Rows that slide sideways follow a mouse")
{
  check("a row without slides coasts on", restingPoint([], 0, 100, 1, 1000) === 100 + COAST_MS && restingPoint([], 0, 990, 2, 1000) === 1000)
  check("a row with slides still rests on one", restingPoint([0, 400, 800], 0, 120, 1.5, 800) === 400)
  const drag = code("components/onepage/drag-scroll.ts")
  check("one listener for the page, mouse only, a row with its own hook left alone", /export function useMouseDragRows/.test(drag) && /down\.pointerType !== "mouse"/.test(drag) && /"mouseDrag" in row\.dataset/.test(drag))
  check("the page holds it", /useMouseDragRows\(\)/.test(code("components/onepage/public-onepage.tsx")))
}

section("The shared link card and the row bin")
{
  check("the card is a chat's size, not the column's", /w-full max-w-\[380px\] overflow-hidden rounded-xl/.test(code("components/onepage/seo-panel.tsx")))
  const tab = code("components/onepage/tabs/links-tab.tsx")
  /* Changed on purpose (round W8): the owner asked for the bin to go from the row; Remove is the more menu's, with its question. */
  /* Changed on purpose (round W9, opblocks): the owner asked for the bin back on the row, always drawn (no hover-only one); both it and the more menu ask the same question. tests/onepage-blocks-w9.test.ts pins the new bin. */
  check("no hover-only bin on the row: Remove is in the more menu, asking the same question", !/data-block-quick-remove/.test(tab) && /askedFrom\.current = "menu"\s+setAskingRemove\(true\)/.test(tab))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
