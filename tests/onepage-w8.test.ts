/**
 * ROUND W8: the OnePage editor's block rows, upload buttons and the product sheet's gallery.
 *
 *   a block's row: no bin beside the switch (Remove is the more menu's, with its question), the sparkle, the
 *   numbers, the switch and the more button in fixed slots, so every row lines up whatever it has
 *   the upload buttons: Storelib's secondary (components/ui/depth-button), never a solid black
 *   the product sheet: a square gallery the full width of the sheet's content, every picture filled
 *
 * The probes: scripts/check-onepage-settings-w8.mjs (every Layout, Buttons and Text value, computed on the
 * published page and in the editor's preview).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { rowCountLabel } from "@/lib/onepage/row-count"
import { SHEET_GALLERY_RATIO } from "@/lib/onepage/product-sheet"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

section("The count beside a row, in four characters")
{
  const cases: [number, string][] = [[0, "0"], [3, "3"], [999, "999"], [1000, "1k"], [1284, "1.3k"], [9960, "10k"], [25300, "25k"], [999_499, "999k"], [999_500, "1M"], [2_400_000, "2.4M"], [-1, "0"], [Number.NaN, "0"]]
  for (const [n, want] of cases) check(`${n} reads ${want}`, rowCountLabel(n) === want, rowCountLabel(n))
  check("never more than four characters", [0, 7, 99, 999, 1049, 9949, 9999, 12345, 99_999, 123_456, 999_999, 1_234_567, 98_765_432].every((n) => rowCountLabel(n).length <= 4))
}

section("A block's row")
{
  const tab = code("components/onepage/tabs/links-tab.tsx")
  /* Changed on purpose (round W9, opblocks): the owner asked for the bin back on the row. It is always drawn now (no hover-only hole), beside the numbers, with a slot on the header row; tests/onepage-blocks-w9.test.ts pins it. */
  check("no hover-only bin on the row", !/data-block-quick-remove/.test(tab) && !/sm:pointer-fine:grid/.test(tab))
  /* Changed on purpose (round W9): the more menu's Remove and the row's bin open the same question. */
  check("Remove is the more menu's, asking first", /askedFrom\.current = "menu"\s+setAskingRemove\(true\)/.test(tab) && /<BlockRemoveQuestion\s+open=\{askingRemove\}/.test(tab))
  /* Changed on purpose (round W9): 48px on a phone (56 from 640px), the room the row's bin takes. Still one width on every row. */
  /* Changed on purpose (wave 10, legible): every row key is 28px on a phone, the count left of its icon on a computer (flex-row-reverse), so the gaps between the tools are equal; tests/onepage-legible-w10.test.ts pins them. */
  check("the numbers are one width on every row, with the full figure in its name", /className="flex h-8 w-7 shrink-0 flex-row-reverse items-center[^"]*sm:w-14/.test(tab) && /rowCountLabel\(clickCount\)/.test(tab) && /tabular-nums/.test(tab))
  /* Changed on purpose (wave 9): on a phone the numbers slot is an icon (32px) and the count shows from sm up, so titles keep their room. */
  check("a row without numbers keeps their room", /\{!hasStats && <span aria-hidden className="block h-8 w-7 shrink-0 sm:w-14" data-row-slot="stats" \/>\}/.test(tab))
  check("the header keeps the more button's room, so its switch lines up", /<span aria-hidden className="block h-8 w-7 shrink-0" data-row-slot="menu" \/>/.test(tab))
  check("the remove menu still holds Remove", /id: "block-remove", label: tt\("Remove"\)/.test(code("components/onepage/block-remove.tsx")))
}

section("Upload buttons are Storelib's secondary")
{
  const field = code("components/onepage/image-field.tsx")
  check("the picture row's Upload / Replace", /data-image-upload=""\s+className=\{cn\(secondaryDepth, "h-9 rounded-lg px-3 text-\[13px\]"\)\}/.test(field) && !/bg-\[#1a1a2e\] px-3 text-\[13px\] font-medium text-white/.test(field))
  check("Your files beside it", /className=\{cn\(secondaryDepth, "h-9 rounded-lg px-3 text-\[13px\]", className\)\}/.test(code("components/onepage/library-pick.tsx")))
  const tab = code("components/onepage/tabs/links-tab.tsx")
  check("the product picture and thumbnail Upload / Change buttons", (tab.match(/onOpenImageLibrary\(block\.id, '(?:product_image|thumbnail_url)'\)\}\s+className=\{cn\(secondaryDepth, "h-8 rounded-lg px-3 text-xs"\)\}/g) ?? []).length === 4)
  const onepageFiles = ["components/onepage/image-field.tsx", "components/onepage/library-pick.tsx", "components/onepage/header-cover-editor.tsx", "components/onepage/seo-panel.tsx"]
  check("no solid black upload button in the editor's picture fields", onepageFiles.every((f) => !/bg-\[#1a1a2e\][^"]*text-white[^"]*"\s*>\s*\{[^}]*(Upload|Replace)/.test(code(f))))
}

section("The product sheet's gallery")
{
  const sheet = code("components/onepage/product-sheet.tsx")
  check("a square", SHEET_GALLERY_RATIO === 1 && /const ratio = SHEET_GALLERY_RATIO/.test(sheet))
  check("every picture fills it (object-cover), as the thumbnails do", /function SlidePicture[\s\S]{0,400}fit="cover"/.test(sheet) && /<FramedPicture src=\{still\} frame=\{1\}[^>]*imgClassName="object-cover"/.test(sheet))
  /* Changed on purpose (wave 10, legible): the words end with pb-8, room to clear the soft fade over the Buy bar (the owner's phone: the bar cut the Size row). */
  check("the full width of the sheet's content, with the title's padding", /"px-5 pt-2 sm:px-6 sm:pt-5"/.test(sheet) && /space-y-3 px-5 pb-8 pt-4 sm:px-6/.test(sheet) && /width:`min\(100%, calc\(60dvh \* \$\{ratio\}\)\)`/.test(sheet))
}

section("The settings matrix probe")
{
  const probe = read("scripts/check-onepage-settings-w8.mjs")
  for (const g of ["spacing", "products", "header", "share", "subscribe", "style", "shape", "size", "textIcon", "shadow", "border", "colours", "hover", "hoverColours", "sparkle", "pageFont", "titleFont", "titleColour", "textColour", "secondaryColour"]) check(`it covers ${g}`, new RegExp(`row\\("${g}"`).test(probe))
  check("on the page and in the editor's preview", /onepage-preview/.test(probe) && /\/app\/onepage\?live/.test(probe))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
