/**
 * ===========================================================================
 *  THREE PARTS OF THE PRODUCT EDITOR: FILES, PRICING, CATEGORY
 * ===========================================================================
 * The owner, on each:
 *
 *   FILES. "I don't like that loading purple thing. The success should not
 *   be that green bar. The animation should not disrupt everything."
 *   app/app/products/new/file-uploads.tsx: one row per file, uploading or
 *   not; progress is a grey wash behind the row on scaleX; done is a check
 *   that fades; a failure stays in its row with Retry; several at once, each
 *   keeping its place.
 *
 *   PRICING. "I should feel the UI switch when I click it." A segmented
 *   control whose white slides on transform, a haptic tick, and the fields
 *   under it swapped in place in a box that eases to its new height
 *   (app/app/products/new/editor-controls.tsx). Nothing new is saved.
 *
 *   CATEGORY. "I don't like those dots. I don't like the X button in the
 *   mobile bottom sheet." app/app/products/new/category-picker.tsx: the
 *   shared sheet on a phone, a popover on a computer, a search, groups that
 *   open, a check on the chosen one, and a choice closes it.
 *
 * What they look like and how they move is measured in a browser by
 * scripts/check-editor-parts.mjs. This pins the source.
 */
import { readFileSync, existsSync } from "node:fs"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const editor = code("app/app/products/new/product-editor.tsx")
const uploads = code("app/app/products/new/file-uploads.tsx")
const controls = code("app/app/products/new/editor-controls.tsx")
const picker = code("app/app/products/new/category-picker.tsx")

console.log("\nThe files (app/app/products/new/file-uploads.tsx)")
check("the editor draws its files and their uploads as one list", /<DigitalFiles\s+files=\{digitalFiles\}\s+uploads=\{fileUploads\}/.test(editor) && /const fileUploads = useFileUploads\(setDigitalFiles\)/.test(editor))
check("the old upload box is gone: no active map, no violet spinner, no green or violet bar",
  !/activeFileUploads|uploadingFiles|fileUploadProgress|getUploadStatusLabel/.test(editor) && !/bg-green-500|bg-violet-500|text-violet-500 animate-spin/.test(editor.slice(editor.indexOf("sectionRefs.current.files = el"), editor.indexOf("sectionRefs.current.variants = el"))))
check("nothing in the files is violet or green", !/violet|green|#8b5cf6|purple/.test(uploads))
check("progress is a wash behind the row, on scaleX alone, never a width", /data-upload-fill=""/.test(uploads) && /transform: `scaleX\(\$\{fill\.toFixed\(4\)\}\)`/.test(uploads) && /transition-\[transform,opacity\]/.test(uploads) && !/width: `\$\{/.test(uploads))
check("the numbers are the uploader's, reaching React once a frame", /new DirectUploader\(\{/.test(uploads) && /requestAnimationFrame\(flush\)/.test(uploads) && /queue\(key, \{ progress, sent, total: total \|\| file\.size, secondsLeft \}\)/.test(uploads))
check("how much of how much, and the time left from a smoothed rate", /formatSent\(upload!\.sent, upload!\.total\)/.test(uploads) && /r\.rate \* 0\.7 \+ instant \* 0\.3/.test(uploads) && /formatLeft\(/.test(uploads))
check("a finished upload is the same row: its key follows the file into the saved list, placed by the order it was dropped in",
  /rows\.current\.set\(done\.file_path, \{ key, seq \}\)/.test(uploads) && /\(rows\.current\.get\(f\.file_path\)\?\.seq \?\? -1\) > seq/.test(uploads) && /<FileRow key=\{entry\.key\}/.test(uploads) && /\.sort\(\(a, b\) => a\.seq - b\.seq\)/.test(uploads))
check("done is a check that comes and goes on opacity and transform, for SETTLE_MS", /el\.animate\(\s*\[\s*\{ opacity: 0, transform: "scale\(0\.6\)" \}/.test(uploads) && /later\(\(\) => drop\(key\), SETTLE_MS\)/.test(uploads) && /data-upload-check=""/.test(uploads))
check("a failure stays in its row, with Retry that starts it again in its place", /data-upload-retry=""/.test(uploads) && /run\(u\.key, u\.seq, u\.file, u\.productId\)/.test(uploads) && /status: "error", error: plainError\(err\)/.test(uploads))
check("an upload can be cancelled from its row", /aria-label=\{`Cancel upload of \$\{name\}`\}/.test(uploads) && /uploaders\.current\.get\(key\)\?\.abort\(\)/.test(uploads))
check("more can be added while some are uploading, counted against the limit", /digitalFiles\.length \+ inFlight\.length \+ fileArray\.length > MAX_DIGITAL_FILES/.test(editor) && /fileUploads\.start\(fileArray, currentProductId \|\| undefined\)/.test(editor) && !/disabled=\{uploadingFiles\}/.test(editor))
check("a finished file's rename and delete are one menu, a sheet on a phone", /<ResponsiveActionMenu[\s\S]{0,300}label: "Rename"[\s\S]{0,200}label: "Delete", variant: "destructive"/.test(uploads))
check("every press in a row is 44px on a phone", /inline-flex h-11 w-11 shrink-0/.test(uploads) && /min-h-\[64px\]/.test(uploads))
check("drag and drop onto the list, and a drop zone when there are no files", /onDrop: \(e: React\.DragEvent\)/.test(uploads) && /Drop to upload/.test(uploads) && /Choose files/.test(uploads))
check("the virus scan still runs after each upload", /fetch\("\/api\/v2\/upload\/scan"/.test(uploads))
check("reduced motion drops every movement", /motion-reduce:transition-none/.test(uploads) && /if \(reducedMotion\(\)\)/.test(uploads))

console.log("\nPricing (app/app/products/new/editor-controls.tsx)")
check("fixed price, pay what you want and free, as one segmented control", /<Segmented\s+label="Pricing"\s+fit="content"\s+value=\{priceMode\}\s+onChange=\{choosePriceMode\}/.test(editor) && /\{ value: "fixed", label: "Fixed price" \}[\s\S]{0,80}\{ value: "pwyw", label: "Pay what you want" \}[\s\S]{0,80}\{ value: "free", label: "Free" \}/.test(editor))
check("no switch row for pay what you want any more", !/title="Pay what you want"/.test(editor))
check("a tick on a phone when it changes", /hapticTap\("soft"\)\s+if \(mode === "free"\)/.test(editor))
check("the white slides on transform, 200ms on iOS's curve, and is never scaled at rest",
  /thumb\.animate\(\s*\[\s*\{ transform: `translate3d\(\$\{prev\.x\}px, 0, 0\) scaleX\(\$\{prev\.w \/ next\.w\}\)` \},\s*\{ transform: `translate3d\(\$\{next\.x\}px, 0, 0\) scaleX\(1\)` \}/.test(controls) &&
  /const SLIDE_MS = 200/.test(controls) && /const EASE = "cubic-bezier\(0\.32, 0\.72, 0, 1\)"/.test(controls))
check("the fields under it swap in place and the box eases between measured heights", /<SwapPanels\s+active=\{priceMode\}/.test(editor) && /box\.animate\(\[\{ height: `\$\{from\}px` \}, \{ height: `\$\{to\}px` \}\]/.test(controls) && /inert=\{!on\}/.test(controls))
check("nothing new is saved: pay what you want is the flag it was, free is a price of nothing",
  /pay_what_you_want: payWhatYouWant,/.test(editor) && /setPayWhatYouWant\(mode === "pwyw"\)/.test(editor) && /setPrice\(""\)/.test(editor) && /pwyw_min_price_cents: payWhatYouWant && pwywMinPrice/.test(editor))
check("choosing fixed again gives back the price free cleared", /priceBeforeFree\.current = \{ price, compareAt: compareAtPrice \}/.test(editor) && /setPrice\(priceBeforeFree\.current\.price\)/.test(editor))
check("a saved product with no price and no variants opens on Free", /initial\.productId && initial\.variants\.length === 0 && !Number\.parseFloat\(initial\.price \|\| "0"\) \? "free" : "fixed"/.test(editor))

console.log("\nThe category (app/app/products/new/category-picker.tsx)")
check("the editor draws the picker, with its own reading of the width", /<CategoryPicker\s+value=\{selectedCategory\}\s+onChange=\{setSelectedCategory\}\s+suggested=\{suggestedCategory\}\s+isPhone=\{isMobileViewport\}/.test(editor))
check("the old dialog, its swipe code, the gradient badge and the dots are gone",
  !/<Dialog|DialogContent|handleSheetTouchStart|dismissingSheet|expandedGroups|CATEGORY_GROUPS/.test(editor) && !/AI Suggested|✨|from-violet-500 to-purple-500/.test(editor) && !/w-1\.5 h-1\.5 rounded-full/.test(editor + picker) && !/icon: "•"/.test(editor + picker))
check("on a phone the shared sheet, with no X of its own, sitting on the keyboard", /<BottomSheet\s+isOpen=\{open\}[\s\S]{0,200}aboveKeyboard/.test(picker) && !/aria-label="Close"/.test(picker) && !/showCloseButton/.test(picker))
check("48px rows on a phone, 36px on a computer", /min-h-\[48px\]/.test(picker) && /min-h-\[36px\]/.test(picker))
check("a search on top, across every group", /data-category-search=""/.test(picker) && /function search\(query: string\)/.test(picker))
check("groups open into their categories, with a way back", /data-category-group=\{g\.name\}/.test(picker) && /data-category-back=""/.test(picker))
check("a check on the chosen one, and choosing closes", /aria-current=\{on \? "true" : undefined\}/.test(picker) && /onChange\(category\)\s+setOpen\(false\)/.test(picker))
check("on a computer a window in the middle, not a popover over the fields, the search focused", /<DialogPrimitive\.Content[\s\S]{0,40}data-category-dialog=""/.test(picker) && !/PopoverContent/.test(picker) && /querySelector<HTMLInputElement>\("\[data-category-search\]"\)\?\.focus\(\)/.test(picker))
check("every category the editor offered is still offered", (read("app/app/products/new/category-picker.tsx").match(/^      "/gm) ?? []).length >= 80 && /"Lightroom Presets"/.test(picker) && /"Video LUTs"/.test(picker))

console.log("\nThe probe")
const probe = read("scripts/check-editor-parts.mjs")
check("scripts/check-editor-parts.mjs measures all three at 390 and 1280, with a stand-in uploader", existsSync("scripts/check-editor-parts.mjs") && /"phone-390"/.test(probe) && /"desktop-1280"/.test(probe) && /storage\\\/chunked-upload\$/.test(probe) && /const PREFIX = "editor-parts-"/.test(probe))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
