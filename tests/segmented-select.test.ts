/**
 * ===========================================================================
 *  ONE TO THREE CHOICES ARE BUTTONS, FOUR OR MORE ARE A DROPDOWN, ROUND 1023
 * ===========================================================================
 * The owner: a setting with one to three options renders as a segmented
 * control ("Vertical | Horizontal", "Top | Center | Bottom": a light grey
 * track, a white pill with a soft shadow that slides), and only four or
 * more use the dropdown, everywhere the sidebar draws a select setting,
 * with long labels falling back to the dropdown. Held here: the rule
 * (lib/website-builder/choice-shape.ts), the one control that draws it
 * (controls/choice-control.tsx), every place that uses it, and the docs
 * that say so. scripts/check-segmented.mjs measures the pill in Chromium.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  SEGMENTED_MAX_OPTIONS,
  SIDEBAR_TRACK_WIDTH,
  choiceShape,
  estimateLabelWidth,
  labelsFit,
  segmentRoom,
  stepChoice,
} from "@/lib/website-builder/choice-shape"
import { CONTROLS } from "@/lib/storelib-theme/controls/registry"
import { DEVELOPER_DOCS } from "@/lib/developers/content.generated"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const opts = (...labels: string[]) => labels.map((label) => ({ label, value: label.toLowerCase() }))

console.log("\nTHE RULE")
{
  check("three is the most a row of buttons holds", SEGMENTED_MAX_OPTIONS === 3)
  check("one option: a button", choiceShape(opts("Auto")) === "segments")
  check("Vertical | Horizontal: buttons", choiceShape(opts("Vertical", "Horizontal")) === "segments")
  check("Top | Center | Bottom: buttons", choiceShape(opts("Top", "Center", "Bottom")) === "segments")
  check("Left | Center | Right: buttons", choiceShape(opts("Left", "Center", "Right")) === "segments")
  check("four options: the dropdown, however short", choiceShape(opts("A", "B", "C", "D")) === "dropdown")
  check("no options: the dropdown, never an empty track", choiceShape([]) === "dropdown")
  check("three long labels: the dropdown", choiceShape(opts("Open it in the header", "Open a search window", "Go to the search page")) === "dropdown")
  check("two words that fit half the track: buttons", choiceShape(opts("Solid", "Gradient")) === "segments", [estimateLabelWidth("Gradient"), segmentRoom(SIDEBAR_TRACK_WIDTH, 2)])
  check("  and two longer ones in a narrow track: the dropdown", choiceShape(opts("Goes to its link", "Opens its sub-links"), 150) === "dropdown")
  check("measured widths win over the estimate", choiceShape(opts("x", "y"), 268, [400, 10]) === "dropdown" && choiceShape(opts("Wwwwwwwwwwwwwwww", "y"), 268, [40, 10]) === "segments")
  check("a label fits when it is no wider than its segment's room", labelsFit([10, 10, 10], 268) && labelsFit([segmentRoom(268, 2), 1], 268) && !labelsFit([segmentRoom(268, 2) + 1, 1], 268))
  check("a wide letter counts wider than a narrow one", estimateLabelWidth("WWW") > estimateLabelWidth("iii"))
}

console.log("\nTHE KEYS: A RADIO GROUP")
{
  check("Right and Down go to the next choice, round the end", stepChoice(3, 0, "ArrowRight") === 1 && stepChoice(3, 2, "ArrowDown") === 0)
  check("Left and Up go back, round the start", stepChoice(3, 1, "ArrowLeft") === 0 && stepChoice(3, 0, "ArrowUp") === 2)
  check("Home and End", stepChoice(3, 1, "Home") === 0 && stepChoice(3, 0, "End") === 2)
  check("a value none of the options holds: the first or last", stepChoice(3, -1, "ArrowRight") === 0 && stepChoice(3, -1, "ArrowLeft") === 2)
  check("any other key is left alone", stepChoice(3, 0, "a") === null && stepChoice(3, 0, "Tab") === null)
}

console.log("\nTHE CONTROL")
{
  const c = read("components/website-builder/editor/controls/choice-control.tsx")
  check("a radiogroup of radios, the checked one in the tab order", /role="radiogroup"/.test(c) && /role="radio"/.test(c) && /aria-checked=\{on\}/.test(c) && /tabIndex=\{on \|\| \(at < 0 && i === 0\) \? 0 : -1\}/.test(c))
  check("  the arrow keys move the choice and the focus", /const next = stepChoice\(n, at, e\.key\)/.test(c) && /buttons\.current\[next\]\?\.focus\(\)/.test(c))
  check("one pill, moved by a transform and nothing else", /data-segment-pill=""/.test(c) && /transform: `translate3d\(\$\{Math\.max\(0, at\) \* 100\}%, 0, 0\)`/.test(c) && /transition: `transform \$\{PILL_MS\}ms \$\{PILL_EASE\}`/.test(c))
  check("  as wide as one segment, so 100% is one step", /width: `calc\(\(100% - 6px\) \/ \$\{n\}\)`/.test(c) && /gridTemplateColumns: `repeat\(\$\{n\}, minmax\(0, 1fr\)\)`/.test(c))
  check("  jumps under reduced motion", /motion-reduce:!transition-none/.test(c))
  check("  white on a light grey track, a soft shadow", /bg-\[#f1f2f4\]/.test(c) && /bg-white shadow-\[0_1px_2px_rgba\(16,24,40,0\.08\)/.test(c))
  check("the fit is measured from the text, not the drawn segments, so it never flickers", /g\.measureText\(l\)\.width/.test(c) && /new ResizeObserver\(decide\)/.test(c) && /labelsFit\(widths, width\)/.test(c))
  check("  and estimated before the first paint", /const estimate = choiceShape\(options\)/.test(c) && /useState<ChoiceShape>\(estimate\)/.test(c))
  check("past three, or when the words do not fit, the browser's own select", /shape === "segments" \? \(/.test(c) && /<select aria-label=\{label\}/.test(c))
  check("  keeping a saved value the schema no longer lists", /shown && !options\.some\(\(o\) => o\.value === shown\) && <option value=\{shown\}>/.test(c))
  check("the choice moves in its own frame (echo-field.ts)", /const \[echoed, setEchoed\] = useEchoedValue\(value, onChange\)/.test(c))
}

console.log("\nEVERY SELECT SETTING THE SIDEBAR DRAWS")
{
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("a schema's select (Storelib themes, imported themes' settings_schema and sections)", /if \(kind === "select"\) \{\s*return <EchoSelect [^\n]*label=\{field\.label\} \/>/.test(editor))
  check("a schema's radio, by the same rule", /if \(kind === "radio"\) \{\s*return <EchoSelect [^\n]*label=\{field\.label\} \/>/.test(editor) && !/if \(opts\.length > 3\)/.test(editor))
  check("alignment (and text_alignment): three buttons", /if \(kind === "alignment"\) \{[\s\S]{0,400}return <EchoSelect value=\{current\}/.test(editor))
  check("EchoSelect is ChoiceControl", /function EchoSelect\([\s\S]{0,300}return <ChoiceControl /.test(editor))
  check("the header's own panels: WbSelect and WbRadioSegment", /function WbRadioSegment\([\s\S]{0,700}<EchoSelect /.test(editor) && !/if \(options\.length > 3\)/.test(editor))
  check("  When search is clicked goes through the rule too", /label="When search is clicked"/.test(editor))
  const panels = read("components/website-builder/editor/design-panels.tsx")
  check("Theme settings' type styles and the design panels", /<ChoiceControl value=\{value\} onChange=\{onChange\} options=\{options\} label=\{label\} \/>/.test(panels))
  const bg = read("components/website-builder/editor/controls/background-control.tsx")
  check("a background: Solid | Gradient", /<ChoiceControl/.test(bg) && !/SEGMENTS/.test(bg))
  const links = read("components/website-builder/editor/controls/link-list-editor.tsx")
  check("a menu link's When pressed", /<ChoiceControl[\s\S]{0,200}label=\{tt\("When pressed"\)\}/.test(links))
  check("the old segmented classes are gone, so nothing draws a second kind", !/export const SEGMENTS/.test(read("components/website-builder/editor/controls/styles.ts")))
}

console.log("\nTHE DOCS SAY SO")
{
  check("the registry's own words, which the docs and agents read", /One to three options are a row of buttons, four or more a dropdown/.test(CONTROLS.select.description) && /same rule as `select`/.test(CONTROLS.radio.description))
  check("Schema: how a choice is drawn", /\*\*How a choice is drawn\.\*\* A `select` and a `radio` follow one rule/.test(DEVELOPER_DOCS.schema) && /settings_schema\.json/.test(DEVELOPER_DOCS.schema))
  check("Using the website builder", /A `select` or `radio` with one to three options is a row of buttons/.test(DEVELOPER_DOCS["website-builder"]))
  check("Theme editor parity and Coming from another platform", /\| `select` \| `select` \| Have \| Buttons in a row for one to three options/.test(DEVELOPER_DOCS["shopify-parity"]) && /one to three options is a row of buttons, four or more a dropdown/.test(DEVELOPER_DOCS.shopify))
  check("the changelog", /## 23 October 2026[\s\S]{0,300}one to three options is drawn as a row of buttons/.test(DEVELOPER_DOCS.changelog))
  check("the public pages draw the specimens by the same rule", /choiceShape\(/.test(read("components/developers/specimens.tsx")))
  check("the AGENTS.md a synced repository gets, for both kinds of theme", (read("lib/github-sync/core.ts").match(/setting with one to three options is drawn as a\nrow of buttons/g) ?? []).length === 2)
  check("the help centre article on building a website", /A setting with two or three choices shows them as buttons side by side/.test(read("lib/help/articles.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
