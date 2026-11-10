/**
 * ===========================================================================
 *  WAVE 10: THE EDIT SIZE CHART DIALOG, SIMPLER AND SMOOTH
 * ===========================================================================
 * The owner: "make the Edit size chart modal simpler, cleaner, good Storelib
 * UI, easier to use and set up, clean, smooth, containing all it needs;
 * opening and closing should feel smooth and clean."
 *
 *   SHELL     the shared SheetDialog (components/ui/sheet-dialog): on a
 *             computer one fixed height that rises in over 260ms and leaves
 *             on its own 150ms curve (its global timing untouched); on a
 *             phone the app's bottom sheet. The product editor keeps it
 *             mounted while it closes, so the exit plays
 *   HEAD      the title, which products use it, Edit and Preview, a 44px X
 *   BODY      Start from (a new chart), the name and the unit side by side,
 *             the table (Tab, Enter, paste, rows and columns as before), and
 *             More options folded: where else, a note, a picture
 *   PREVIEW   the chart as buyers open it (the storefront's own table), in
 *             cm or in
 *   FOOT      Save and Cancel always at the foot; "Unsaved changes" beside
 *             them; every way out asks first when something would be lost,
 *             in the foot; Cmd or Ctrl S saves; Save waits for a change
 *
 * Filmed in a browser (scripts/render-size-chart-editor.tsx, 1280 and 390):
 * the dialog rises from 0 to 1 in about 240ms and is gone 200ms after the
 * close, no horizontal scroll on a phone, the foot's buttons 44px there.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const editor = read("components/physical/size-chart-editor.tsx")
const form = read("components/physical/size-chart-form.tsx")
const card = read("components/physical/size-chart-card.tsx")
const sheet = read("components/ui/sheet-dialog.tsx")

console.log("\nThe shell\n")
check("the shared SheetDialog, phone or computer by the Modal's own breakpoint", /<SheetDialog\s+open=\{open\}\s+onClose=\{requestClose\}\s+phone=\{phone\}/.test(editor) && /const phone = useModalPhone\(\)/.test(editor))
check("  its timing is the shared one, untouched: 260ms in, 150ms out", /data-\[state=open\]:duration-\[260ms\] data-\[state=closed\]:duration-150/.test(sheet))
check("one height on a computer, whatever Edit or Preview shows", /className="flex h-\[min\(86dvh,760px\)\] w-full flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-\[720px\]"/.test(editor))
check("  and a fixed column on a phone, so switching never moves the sheet", /h-\[calc\(var\(--vv-h,100dvh\)\*0\.92-28px\)\]/.test(editor))
check("the product editor keeps it mounted while it closes, then lets go", /setEditing\(\(e\) => \(e \? \{ \.\.\.e, open: false \} : e\)\)/.test(card) && /open=\{editing\.open\}/.test(card) && /onClose=\{closeEditor\}/.test(card))
check("the name is focused on a computer, nothing on a phone", /onOpenAutoFocus=\{\(e\) => \{\s*e\.preventDefault\(\)\s*document\.querySelector<HTMLInputElement>\("\[data-size-chart-dialog\] \[data-size-chart-name\]"\)/.test(editor))

console.log("\nWhat is in it\n")
check("the head: title, which products use it, Edit and Preview, the X", /<SheetDialogTitle/.test(editor) && /data-size-chart-used=""/.test(editor) && /\{ value: "edit", label: tt\("Edit"\) \}, \{ value: "preview", label: tt\("Preview"\) \}/.test(editor) && /data-size-chart-close=""/.test(editor))
check("  the X and the tabs are 44px to the touch on a phone", /grid h-11 w-11 cursor-pointer place-items-center rounded-full/.test(editor) && /after:-inset-y-1 after:content-\[''\] sm:after:hidden/.test(editor))
check("the dialog's fields fold what most charts never need under More options", /<SizeChartFields state=\{state\} uploadImage=\{uploadImage\} targets=\{targets\} rules=\{rules\} folded \/>/.test(editor) && /data-size-chart-more=""/.test(form) && /<Reveal open=\{open\} className="!mt-0">/.test(form))
check("  which says what is set there", /const extrasSet = \[draft\.notes\.trim\(\) \? tt\("Note"\)/.test(form))
check("  the chart's own page keeps every part as a card", /folded = false/.test(form) && /if \(!folded\) return <>\{children\}<\/>/.test(form))
check("the name and the unit side by side, on a phone too", /<div className="grid grid-cols-\[minmax\(0,1fr\)_auto\] gap-3">/.test(form))
check("the table keeps its keyboard, paste, rows, columns and templates", ["onCellKey", "onCellPaste", "addColumn", "removeColumn", "addRow", "removeRow", "SIZE_CHART_TEMPLATES"].every((x) => form.includes(x)))
check("Preview draws the storefront's own table, in cm or in", /import \{ SizeChartTable as BuyerTable \} from "@\/components\/website-builder\/sections\/renderers\/product\/size-chart"/.test(editor) && /<BuyerTable chart=\{chart\} unit=\{unit\} palette=\{PREVIEW_PALETTE\} \/>/.test(editor))
check("  Edit and Preview both stay mounted: a swap, never a remount", /<div hidden=\{tab !== "edit"\} data-size-chart-tab="edit">/.test(editor) && /<div hidden=\{tab !== "preview"\} data-size-chart-tab="preview">/.test(editor))

console.log("\nThe foot\n")
check("Save and Cancel at the foot, outside what scrolls", /data-size-chart-body=""/.test(editor) && /<footer className="flex shrink-0[^"]*" data-size-chart-foot="">/.test(editor) && /max-sm:\[&_button\]:min-h-11/.test(editor))
check("Unsaved changes beside them", /status = busy \? tt\("Saving"\) : dirty \? tt\("Unsaved changes"\) : null/.test(editor))
check("Save waits for a change on a saved chart", /disabled=\{busy \|\| \(!!chart && !dirty\)\}/.test(editor))
check("every way out asks first when something would be lost, in the foot", /if \(dirty\) return setAsking\("discard"\)/.test(editor) && /data-size-chart-discard-ask=""/.test(editor) && /data-size-chart-keep-editing=""/.test(editor))
check("  a problem in the chart takes it back to Edit to show it", /setTab\("edit"\)\s*return setError\(problem\)/.test(editor))
check("Cmd or Ctrl S saves while it is open", /e\.key\.toLowerCase\(\) !== "s"/.test(editor) && /if \(!open\) return/.test(editor))
check("every word is translated", !/>\s*[A-Z][a-z]+ [a-z]+\s*</.test(editor.replace(/\{tt\([^)]*\)\}/g, "")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
