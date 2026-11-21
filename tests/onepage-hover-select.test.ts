/**
 * ===========================================================================
 *  ROUND 24: "ON HOVER" ON EVERY BUTTON, AND A FORM'S DROPDOWN IN THE PAGE'S LOOK
 * ===========================================================================
 *   HOVER     Design › Buttons › On hover (None, Lift, Bigger, Glow, Fill,
 *             Fill and lift, Underline) "did nothing". A button in a group, a
 *             carousel, a picture link or a product card there was handed
 *             "none"; the sheet's main button and a form's Send were not the
 *             page's button at all; on a dark page Lift was a 2px rise under a
 *             black shadow on black and Glow a 14% ring. Every button plays the
 *             choice now, the sheet's in the sheet's colours, a keyboard's
 *             :focus-visible gets the same answer, pointer devices only for
 *             :hover, no movement under reduced motion.
 *   SELECT    a form's dropdown opened the system's menu. It is the form's own
 *             combobox and listbox (components/forms/form-select), in the
 *             form's variables, 44px rows, 16px words on a phone, the option's
 *             id as the answer.
 *
 * The browser half: scripts/check-onepage-hover-select.mjs (every choice on a
 * dark and a light page, the preview, the dropdown at 390 and 1280).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { buttonHover, buttonHoverVars } from "@/lib/onepage/button-style"
import { pressableProps } from "@/lib/onepage/block-look"
import { popupOpenAt } from "@/components/onepage/block-sheet-context"
import { FormSelect } from "@/components/forms/form-select"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` (${detail})` : "")); console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* ── Every button plays the choice ───────────────────────────────────── */
console.log("\nEvery button plays the page's choice, wherever it is")
const KINDS = ["none", "lift", "zoom", "glow", "fill", "pop", "underline"]
check("each choice is read as itself", KINDS.every((k) => buttonHover({ button_hover_animation: k }) === k))
check("nothing saved is Lift, as before", buttonHover({}) === "lift" && buttonHover({ button_hover_animation: "default" }) === "lift")
check("buttonHover has no form that silences a button in a group or a carousel", buttonHover.length === 1 && !/stationary/.test(read("lib/onepage/button-style.ts")))
check("pressableProps hands every block's button the page's choice", KINDS.every((k) => pressableProps({ button_hover_animation: k })["data-hover"] === k) && pressableProps.length === 1)
const page = noComments(read("components/onepage/public-onepage.tsx"))
check("no link, PDF, menu or booking button is told to keep still in a group or a carousel", !/buttonHover\(theme, isInside/.test(page) && !/pressableProps\([^)]*,\s*(isInsideCarousel|look\.still|true)\)/.test(page))
const blockFiles = ["app-block", "storelib-blocks", "data-blocks", "tip-block", "creator-blocks", "extra-blocks", "media-blocks", "block-sheet-trigger", "image-fade"].map((f) => noComments(read(`components/onepage/${f}.tsx`)))
check("no block passes a still flag to pressableProps", blockFiles.every((s) => !/pressableProps\([^()]*(\([^()]*\))?[^()]*,\s*(look\.still|still|true)\)/.test(s)))
check("a picture link plays it (no stationary second argument)", /data-hover=\{buttonHover\(theme\)\}/.test(read("components/onepage/block-presentation.tsx")))
check("a product card's button plays it in a carousel too", /const hoverKind = buttonHover\(theme as ButtonThemeLike\)/.test(read("components/onepage/product-block.tsx")))

/* ── The sheet's buttons ─────────────────────────────────────────────── */
console.log("\nThe sheet's main button and a form's Send")
const sheet = read("components/onepage/block-sheet.tsx")
check("the page's choice reaches the sheet (PageHoverContext from the provider)", /const hover = theme \? buttonHover\(theme\) : null/.test(sheet) && /<PageHoverContext\.Provider value=\{hover\}>/.test(sheet))
check("the foot bar's main button is the page's button in the sheet's colours", (sheet.match(/className="op-btn op-sheet-btn flex h-11/g) || []).length === 2 && (sheet.match(/data-hover=\{hover\}/g) || []).length === 2)
const form = read("components/forms/public-form.tsx")
check("a form's Send plays it on a OnePage, and keeps its own look elsewhere", /const pageHover = usePageHover\(\)/.test(form) && /className=\{pageHover \? `\$\{button\} op-btn op-sheet-btn` : button\}/.test(form) && /data-hover=\{pageHover \?\? undefined\}/.test(form))

/* ── The CSS ─────────────────────────────────────────────────────────── */
console.log("\nThe hover rules")
const css = read("app/globals.css")
const block = css.slice(css.indexOf("OnePage hover: buttons, cards and media"), css.indexOf("/* Button shine animation"))
const plain = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[\s\S]*?\*\//, "")
const media = /@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/.exec(plain)
check("every :hover rule sits inside (hover: hover) and (pointer: fine), so a tap never sticks", !!media && !plain.replace(media![0], "").replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/, "").includes(":hover"))
check("Lift and Fill and lift rise 3px", /\[data-hover="lift"\] \{ translate: 0 -3px; \}/.test(media![1]) && /\[data-hover="pop"\] \{ translate: 0 -3px;/.test(media![1]))
check("Glow is a ring you can see", /\[data-hover="glow"\]::before \{\s*box-shadow:\s*0 0 0 3px [^;]*24%/.test(plain))
check("Fill keeps a hairline, so a fill the page's colour still reads as a button", /:not\(\.animate-onepage-swipe\)::after \{\s*background: var\(--op-fill, currentColor\);\s*box-shadow: inset 0 0 0 1\.5px/.test(plain))
check("Underline draws on a button with no label span by fading its line's colour in", /\[data-hover="underline"\]:not\(:has\(\.op-label\)\)[^{]*\{[^}]*text-decoration-color: transparent;[^}]*transition-property: translate, scale, opacity, text-decoration-color;/.test(plain) && /\[data-hover="underline"\]:not\(:has\(\.op-label\)\)[^{]*\{ text-decoration-color: currentColor; \}/.test(media![1]))
check("a label cut to one line still shows the underline", /\.op-label\.truncate \{\s*padding-bottom: 4px;\s*margin-bottom: -4px;/.test(plain))
check("the sheet's buttons take the sheet's pair", /\.op-sheet-btn \{\s*--op-fill: var\(--sheet-on-ink[^;]*;\s*--op-fill-text: var\(--sheet-ink[^;]*;\s*--op-accent: var\(--sheet-ink/.test(plain))
const focus = plain.replace(media![0], "")
check("a keyboard's focus gets each answer, outside the pointer query", ["lift", "zoom", "pop"].every((k) => new RegExp(`:focus-visible[^{]*\\[data-hover="${k}"\\] \\{`).test(focus)) && /:focus-visible[^{]*\[data-hover="lift"\], \[data-hover="glow"\], \[data-hover="pop"\]\)::before \{ opacity: 1; \}/.test(focus) && /:focus-visible[^{]*\[data-hover="underline"\] \.op-label::after \{ scale: 1 1; \}/.test(focus))
check("transitions are 200ms (220 for the line), on translate, scale, opacity and colour", /\.op-btn \{[^}]*transition-property: translate, scale, opacity;\s*transition-duration: 200ms;/.test(plain) && !/transition-property:[^;]*\ball\b/.test(plain))
check("reduced motion: no rise or growth on hover or focus", /@media \(prefers-reduced-motion: reduce\) \{[^}]*\}\s*\.op-btn:hover, \.op-demo:hover \.op-btn, \.op-host:hover \.op-btn, \.op-btn:focus-visible, \.op-host:focus-visible \.op-btn \{ translate: none !important; scale: none !important; \}/.test(plain))
check("None has no rule that moves, fills or lights it", !/\[data-hover="none"\]\s*(::?\w+)?\s*\{/.test(plain))
const skins = read("components/onepage/themes/theme-skins.css")
check("a skin keeps the hover's words under the keyboard's focus too", /\[data-op-skin\] :is\(\.op-btn:focus-visible, \.op-host:focus-visible \.op-btn\):is\(\[data-hover="fill"\], \[data-hover="pop"\]\) \{ color: var\(--op-fill-text/.test(skins) && /focus-visible/.test(read("scripts/build-onepage-skins.mjs")))

/* ── Lift a dark page can show ───────────────────────────────────────── */
console.log("\nLift's shadow on a dark page")
const dark = buttonHoverVars({ background_color: "#111113", text_color: "#f4f4f5", button_style: "filled", button_color: "#f4f4f5", button_text_color: "#111113" } as never) as Record<string, string>
const light = buttonHoverVars({ background_color: "#f6f4ef", text_color: "#1a1a2e", button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff" } as never) as Record<string, string>
check("deeper, with a hairline of the button's colour, on a dark page", /rgba\(0,0,0,0\.75\)/.test(dark["--op-hover-shadow"]) && /color-mix\(in srgb, #f4f4f5 22%, transparent\)/.test(dark["--op-hover-shadow"]), dark["--op-hover-shadow"])
check("as it was on a light page", light["--op-hover-shadow"] === "0 10px 24px -8px rgba(0,0,0,0.28), 0 3px 8px -3px rgba(0,0,0,0.16)", light["--op-hover-shadow"])

/* ── The dropdown ────────────────────────────────────────────────────── */
console.log("\nA form's dropdown")
const html = renderToStaticMarkup(
  React.createElement(FormSelect, { id: "f-how", labelId: "f-how-label", className: "field", required: true, value: "", onChange: () => {}, options: [{ id: "online", label: "Online" }, { id: "sala", label: "La sală" }] }),
)
check("a combobox with a listbox popup, closed, named by its question", /role="combobox"/.test(html) && /aria-haspopup="listbox"/.test(html) && /aria-expanded="false"/.test(html) && /aria-labelledby="f-how-label f-how"/.test(html) && /aria-controls="f-how-listbox"/.test(html) && /aria-required="true"/.test(html))
check("Choose… when nothing is chosen", /Choose…/.test(html))
const chosen = renderToStaticMarkup(React.createElement(FormSelect, { id: "f-how", labelId: "l", value: "sala", onChange: () => {}, options: [{ id: "online", label: "Online" }, { id: "sala", label: "La sală" }] }))
check("the chosen option's words when one is chosen, its id kept", />La sală</.test(chosen) && /data-value="sala"/.test(chosen) && !/Choose…/.test(chosen))
const fs = read("components/forms/form-select.tsx")
check("rows are 44px, words 16px on a phone", /min-h-11 cursor-pointer/.test(fs) && /text-\[16px\][^"`]*sm:text-\[15px\]/.test(fs) && /input\.replace\("text-\[15px\]", "text-\[16px\] sm:text-\[15px\]"\)/.test(form))
check("the list is drawn from the form's variables, opaque", /linear-gradient\(var\(--form-field, transparent\), var\(--form-field, transparent\)\), var\(--sheet-bg, var\(--sheet-on-ink, #ffffff\)\)/.test(fs) && /border-\[var\(--form-line/.test(fs) && /text-\[var\(--sheet-ink/.test(fs))
check("the keyboard: arrows, Home, End, Enter, Space, Escape, Tab and type-ahead", ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "Enter", '" "', "Escape", "Tab"].every((k) => fs.includes(`case ${k.startsWith('"') ? k : `"${k}"`}`)) && /aria-activedescendant=\{open && active >= 0/.test(fs) && /const typeAhead/.test(fs))
check("a tap elsewhere closes it", /document\.addEventListener\("pointerdown", away, true\)/.test(fs))
check("it flips above when there is no room under it, never taller than the room", /const above = below < want && aboveRoom > below/.test(fs) && /max: Math\.max\(MIN_LIST, Math\.min\(MAX_LIST, above \? aboveRoom : below\)\)/.test(fs))
check("160ms in, 120ms out, opacity and transform, still under reduced motion", /motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-98 motion-safe:duration-\[160ms\]/.test(fs) && /motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-98 motion-safe:duration-\[120ms\]/.test(fs) && /prefers-reduced-motion: reduce/.test(fs))
check("a check on the chosen row", /<Check aria-hidden className=\{`h-4 w-4 shrink-0 \$\{selected \? "opacity-100" : "opacity-0"\}`\}/.test(fs) && /aria-selected=\{selected\}/.test(fs))
check("the form draws it for a dropdown, no <select> left, the answer the option's id", /<FormSelect/.test(form) && !/<select[\s>]/.test(noComments(form)) && /onChange=\{\(v\) => onChange\(v\)\}/.test(form))
check("the open list is drawn over the consent and Send", /className=\{`relative z-\[2\] space-y-5/.test(form))
check("Escape in the open list closes it, not the sheet or the card", popupOpenAt({ closest: (s: string) => (s === '[aria-haspopup="listbox"][aria-expanded="true"]' ? {} : null) } as never) && !popupOpenAt(null) && /if \(popupOpenAt\(e\.target\)\) return/.test(sheet) && /!popupOpenAt\(e\.target\)/.test(read("components/onepage/onepage-dialog.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
