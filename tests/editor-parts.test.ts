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
 *   mobile bottom sheet." Then: "exactly like Shopify's product category
 *   field", in the main column above the description.
 *   app/app/products/new/category-picker.tsx: a "Search categories" field
 *   whose list opens under it on a computer (not a window in the middle),
 *   the shared sheet on a phone, groups that slide open into their
 *   categories with Back to All, a search across every group, the
 *   suggestion pinned at the bottom with a grey "Suggested" tag, a check on
 *   the chosen one, and a choice closes it.
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
  /rows\.current\.set\(done\.file_path, \{ key, seq \}\)/.test(uploads) && /\(rows\.current\.get\(f\.file_path\)\?\.seq \?\? -1\) > seq/.test(uploads) && /<FileRow\s+key=\{entry\.key\}/.test(uploads) && /\.sort\(\(a, b\) => a\.seq - b\.seq\)/.test(uploads))
check("done is a check that comes and goes on opacity and transform, for SETTLE_MS", /el\.animate\(\s*\[\s*\{ opacity: 0, transform: "scale\(0\.6\)" \}/.test(uploads) && /later\(\(\) => drop\(key\), SETTLE_MS\)/.test(uploads) && /data-upload-check=""/.test(uploads))
check("a failure stays in its row, with Retry that starts it again in its place", /data-upload-retry=""/.test(uploads) && /run\(u\.key, u\.seq, u\.file, u\.productId\)/.test(uploads) && /status: "error", error: said\.text/.test(uploads))
check("an upload can be cancelled from its row's menu", /label: "Cancel upload", variant: "destructive", separatorBefore: true, onClick: \(\) => onCancel\(upload\.key\)/.test(uploads) && /uploaders\.current\.get\(key\)\?\.abort\(\)/.test(uploads))
check("more can be added while some are uploading, counted against the limit", /digitalFiles\.length \+ inFlight\.length \+ fileArray\.length > MAX_DIGITAL_FILES/.test(editor) && /fileUploads\.start\(fileArray, currentProductId \|\| undefined\)/.test(editor) && !/disabled=\{uploadingFiles\}/.test(editor))
check("a finished file's download, rename and delete are one menu, a sheet on a phone", /<ResponsiveActionMenu[\s\S]{0,300}label: "Download", onClick: \(\) => void download\(\) \},\s*\{ label: "Rename"[\s\S]{0,200}label: "Delete", variant: "destructive"/.test(uploads))
check("Download is the first row of every file's menu, uploading and failed ones too", (uploads.match(/items=\{\[\s*\{ label: "Download", onClick: \(\) => void download\(\) \}/g) ?? []).length === 3)
check("while it is asked for, the row's own line says so, and a refusal replaces it in red", /meta = <span data-file-download="preparing">Preparing download<\/span>/.test(uploads) && /data-file-download="error" role="alert" className="text-\[#b42318\]"/.test(uploads))
check("the editor's toast says where an app sent it", /onNotice=\{showToast\}/.test(editor) && /const message = ownFileNotice\(outcome\)/.test(uploads))
check("every press in a row is 44px on a phone", /inline-flex h-11 w-11 shrink-0/.test(uploads) && /min-h-\[64px\]/.test(uploads))
check("drag and drop onto the list, and a drop zone when there are no files", /onDrop: \(e: React\.DragEvent\)/.test(uploads) && /Drop to upload/.test(uploads) && /Choose files/.test(uploads))
check("the file check is the server's, when the upload completes: the editor asks no scan route afterwards", !/fetch\("\/api\/v2\/upload\/scan"/.test(uploads))
check("reduced motion drops every movement", /motion-reduce:transition-none/.test(uploads) && /if \(reducedMotion\(\)\)/.test(uploads))

console.log("\nPricing (app/app/products/new/editor-controls.tsx)")
/* Changed on purpose: the three tabs took a row of their own, so how it is sold is a menu at the end of the card's title row. */
check("fixed price, pay what you want and free, as one menu in the title row", /<ResponsiveActionMenu\s+title="How it is sold"/.test(editor) && /onClick: \(\) => choosePriceMode\(m\.value\)/.test(editor) && /\{ value: "fixed", label: "Fixed price" \},\s*\{ value: "pwyw", label: "Pay what you want" \},\s*\{ value: "free", label: "Free" \}/.test(editor) && !/<Segmented/.test(editor))
check("every included line can be reworded or removed, the defaults too", !/isDefaultItem/.test(editor) && /aria-label=\{`Included item \$\{index \+ 1\}`\}/.test(editor))
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
const groups = code("lib/products/category-groups.ts")
/* Changed on purpose: the field takes onClear (its x) and the choice goes through chooseCategory, which ends the preselected suggestion. */
check("the editor draws the field, with its own reading of the width", /<CategoryPicker\s+value=\{selectedCategory\}\s+onChange=\{chooseCategory\}\s+onClear=\{clearCategory\}\s+suggested=\{suggestedCategory\}\s+isPhone=\{isMobileViewport\}/.test(editor))
check("the old dialog, its swipe code, the gradient badge and the dots are gone",
  /* Changed on purpose: the search engine listing's fields were the last Dialog (and a sheet on a phone); they fold open in their card now. */
  (editor.match(/<Dialog\b/g) ?? []).length === 0 && !/from "@\/components\/ui\/dialog"/.test(editor)
    && !/handleSheetTouchStart|dismissingSheet|expandedGroups|CATEGORY_GROUPS/.test(editor) && !/AI Suggested|✨|from-violet-500 to-purple-500/.test(editor) && !/w-1\.5 h-1\.5 rounded-full/.test(editor + picker) && !/icon: "•"/.test(editor + picker))
/* Changed on purpose: "move the category field into the main column, above the description, at every width". */
check("a field of the product, in the main column above the description, and no Category card beside it",
  editor.indexOf("data-editor-category") > editor.indexOf("sectionRefs.current.content = el") && editor.indexOf("data-editor-category") < editor.indexOf("<RichTextEditor") && editor.indexOf("data-editor-category") < editor.indexOf('data-editor-side=""')
    && !/<h2 className=\{CARD_TITLE\}>Category<\/h2>/.test(editor))
check("on a phone the shared sheet, with no X of its own, sitting on the keyboard", /<BottomSheet\s+isOpen=\{open\}[\s\S]{0,200}aboveKeyboard/.test(picker) && !/aria-label="Close"/.test(picker) && !/showCloseButton/.test(picker))
check("48px rows on a phone, 36px on a computer", /min-h-\[48px\]/.test(picker) && /min-h-\[36px\]/.test(picker))
check("a search field on top, across every group", /data-category-search=""/.test(picker) && /placeholder="Search categories"/.test(picker) && /searchCategories\(query\)/.test(picker) && /export function searchCategories\(query: string\)/.test(groups))
check("groups open into their categories in the same list: Back to All, the group as a header", /data-category-group=\{r\.name\}/.test(picker) && /data-category-back=""/.test(picker) && />Back to All</.test(picker) && /data-category-header=""/.test(picker))
check("a check on the chosen one, and choosing closes", /aria-current=\{chosen \? "true" : undefined\}/.test(picker) && /onChange\(category\)\s+setOpen\(false\)/.test(picker))
/* Changed on purpose: the owner asked for the list to open from the field, like Shopify's, not the window in the middle it was. */
check("on a computer the list opens from the field, as wide as it, not a window in the middle",
  /<PopoverPrimitive\.Anchor asChild>/.test(picker) && /<PopoverPrimitive\.Content\s+data-category-dropdown=""/.test(picker) && /w-\[var\(--radix-popover-trigger-width\)\]/.test(picker)
    && /onOpenAutoFocus=\{\(e\) => e\.preventDefault\(\)\}/.test(picker) && !/DialogPrimitive|DesktopCategoryBrowser|data-category-dialog/.test(picker))
check("going in and back slides, on transform and opacity only, over a list of a fixed height",
  /pane\.animate\(\[\{ transform: "translate3d\(100%, 0, 0\)" \}/.test(picker) && /ghost\.animate\(\[\{ transform: "translate3d\(0, 0, 0\)" \}, \{ transform: "translate3d\(100%, 0, 0\)" \}\]/.test(picker)
    && !/animate\(\[\{ (height|width|top|left)/.test(picker) && /style=\{\{ height: place\.h \}\}/.test(picker) && /const side = below >= LIST_MIN \|\| below >= above \? "bottom" : "top"/.test(picker) && /if \(!stage \|\| !pane \|\| reducedMotion\(\)/.test(picker))
check("Up, Down, Enter, Right and Left from the field; Escape and a click outside close", /e\.key === "ArrowDown" \|\| e\.key === "ArrowUp"/.test(picker) && /e\.key === "Enter"/.test(picker) && /e\.key === "ArrowRight"/.test(picker) && /e\.key === "ArrowLeft"/.test(picker) && /aria-activedescendant=/.test(picker) && /onOpenChange=\{show\}/.test(picker))
check("the suggestion pinned at the bottom with a grey Suggested tag, never violet", /data-category-suggested=\{suggested\}/.test(picker) && /<SuggestedTag \/>/.test(picker) && /border-\[#e3e5e8\] bg-white[^"]*text-\[#4b5563\]/.test(picker) && !/violet|purple|#8b5cf6|#7c3aed/.test(picker))
check("under the field, the choice, the tag when it is the suggestion, and an x to clear it", /data-category-chosen=""/.test(picker) && /\{value === suggested \? <SuggestedTag \/> : null\}/.test(picker) && /data-category-clear=""/.test(picker) && /onClick=\{onClear\}/.test(picker))
check("the suggestion is preselected until the creator chooses or clears", /if \(suggestedCategory && !categoryTouched\.current\) setSelectedCategory\(suggestedCategory\)/.test(editor) && /const categoryTouched = useRef\(!!initial\.selectedCategory\)/.test(editor))
check("the suggestion is asked for once the fields settle, cached by content, never on a keystroke", /const SETTLE_MS = 1200/.test(code("app/app/products/new/category-suggestion.ts")) && /answers\.has\(key\)/.test(code("app/app/products/new/category-suggestion.ts")) && /ctrl\.abort\(\)/.test(code("app/app/products/new/category-suggestion.ts")))
/* Changed on purpose: the list moved to lib/products/category-groups.ts so the suggestion route can check answers against it. */
check("every category the editor offered is still offered", (read("lib/products/category-groups.ts").match(/^      "/gm) ?? []).length >= 80 && /"Lightroom Presets"/.test(groups) && /"Video LUTs"/.test(groups))

/*
  "It takes so much time to load a product edit page." A tile is 16:9, two to a
  row: about 170px across on a phone and 350px in the editor's main column, and
  each one was loading the original upload, so a product with six camera photos
  fetched twenty megabytes before anything could be read.
*/
const media = code("app/app/products/new/media-grid.tsx")
console.log("\nThe media tiles are thumbnails, not the photos")
check("each tile asks the optimizer for the file it needs, with an honest sizes and its box declared",
  /const TILE_FILES = \[256, 384, 640, 750\]/.test(media) && /const srcSet = optimizedSrcSet\(src, TILE_FILES, PORTRAIT_QUALITY\)/.test(media)
    && /src=\{srcSet \? optimizedImageUrl\(src, TILE_BOX, PORTRAIT_QUALITY\) : src\}/.test(media)
    && /sizes=\{TILE_SIZES\}/.test(media) && /width=\{640\}/.test(media) && /height=\{360\}/.test(media) && /decoding="async"/.test(media))
check("the tiles past the first two wait until they are scrolled near", /loading=\{index < TILES_EAGER \? undefined : "lazy"\}/.test(media) && /const TILES_EAGER = 2/.test(media))

console.log("\nThe probe")
const probe = read("scripts/check-editor-parts.mjs")
check("scripts/check-editor-parts.mjs measures all three at 390 and 1280, with a stand-in uploader", existsSync("scripts/check-editor-parts.mjs") && /"phone-390"/.test(probe) && /"desktop-1280"/.test(probe) && /storage\\\/chunked-upload\$/.test(probe) && /const PREFIX = "editor-parts-"/.test(probe))

/*
  "Where there is the search engine listing and I click the pen icon to edit, make sure it doesn't open as a
  mobile bottom sheet or pop up at all. It should just slide down and reveal the other settings: collapsible,
  collapsing smoothly on close and on appearing." scripts/check-layer-motion.mjs measures it frame by frame.
*/
console.log("\nThe search engine listing folds open in its card")
check("the pencil toggles the fields, and says so", /onClick=\{toggleSeo\}/.test(editor) && /aria-expanded=\{seoOpen\}/.test(editor) && /aria-controls="seo-fields"/.test(editor)
  && /const toggleSeo = \(\) => \{\s*const opening = !seoOpen\s*setSeoOpen\(opening\)/.test(editor))
check("the fields are in the card, not a sheet or a dialog", /id="seo-fields"/.test(editor) && editor.indexOf('id="seo-fields"') > editor.indexOf('data-seo-card=""')
  && !/<MobileSheet isOpen=\{seoOpen\}/.test(editor) && !/<Dialog open=\{seoOpen\}/.test(editor))
check("the height goes 0fr to 1fr in a grid row with the fields fading and settling 4px, and nothing under reduced motion",
  /seoOpen \? "grid-rows-\[1fr\] opacity-100" : "grid-rows-\[0fr\] opacity-0"/.test(editor) && /"!mt-0 grid transition-\[grid-template-rows,opacity\] duration-\[280ms\] ease-\[cubic-bezier\(0\.32,0\.72,0,1\)\] motion-reduce:transition-none"/.test(editor)
    && /seoOpen \? "translate-y-0" : "-translate-y-1"/.test(editor) && /<div className="min-h-0 overflow-hidden">/.test(editor))
check("closed, the fields are inert and hidden from a screen reader; open, reachable", /inert=\{!seoOpen\}/.test(editor) && /aria-hidden=\{!seoOpen \|\| undefined\}/.test(editor))
check("once open, the card's foot is brought into view, only as far as it needs", /scrollIntoView\(\{ block: "nearest", behavior: smooth \? "smooth" : "auto" \}\)/.test(editor)
  && /e\.propertyName !== "grid-template-rows"/.test(editor))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}

