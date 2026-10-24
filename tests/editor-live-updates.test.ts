/**
 * ===========================================================================
 *  EVERY EDIT ON THE CANVAS AT ONCE, ROUND 1022
 * ===========================================================================
 * The owner: "sliders lag while dragging (Theme settings › corner radius)
 * ... changes don't show on the canvas, I have to refresh (theme settings,
 * section settings, Prices and currency: the currency code on product
 * cards) ... flashes, jumps". What was found, measured on the real editor by
 * scripts/check-editor-live.mjs, and what is held here:
 *
 *   THE EASE     buttons and colours eased every value under a finger
 *                (`transition: all`), so the canvas trailed the thumb by a
 *                second: a section being edited holds still
 *                (lib/website-builder/edit-still.ts, and the imported
 *                theme's frame ends its eases, canvas-bridge.ts)
 *   THE OVERLAY  the last value a finger drew stayed laid over the theme
 *                once the store had let go of it, so Undo, and on an
 *                imported theme any later theme setting, did not show until
 *                a refresh (live-settings.ts drawnSettled)
 *   THE JUMP     a render that finished with an older value wrote it back
 *                over the newer one (live-settings.ts themeToPatch)
 *   THE CODE     Show currency codes added the deployment's code, and only
 *                after a dollar sign: a store in lei or euros saw nothing
 *                (lib/storelib-theme/render.ts withCurrencyCode)
 *   THE WORK     a value the page only reads as a variable drew the
 *                sections again for nothing (theme-variables-only.ts)
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { drawnSettled, echoThemeSetting, reconcileThemeEcho, resetLive, themeEchoNow, themeToPatch } from "@/lib/website-builder/live-settings"
import { drawLive, forgetLiveFill, templateFrom } from "@/lib/website-builder/storelib-live-fill"
import { changedCompatSettings, markDrawnStyles, planPatch, type DocShape } from "@/components/website-builder/compat/compat-canvas"
import { withCurrencyCode } from "@/lib/storelib-theme/render"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"
import { changedThemeKeys, drawnByVariablesAlone, VARIABLE_ONLY_THEME_SETTINGS } from "@/lib/website-builder/theme-variables-only"
import { STILL_SECTION_ATTR, STILL_THEME_ATTR } from "@/lib/website-builder/edit-still"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nTHE CODE OF THE CURRENCY THE PRICE IS WRITTEN IN")
{
  check("a dollar price, the store's code", withCurrencyCode("$24.00", "USD") === "$24.00 USD", withCurrencyCode("$24.00", "USD"))
  check("a store in lei: the code after the amount as written", withCurrencyCode("48,00 lei", "RON") === "48,00 lei RON", withCurrencyCode("48,00 lei", "RON"))
  check("a store in euros", withCurrencyCode("€24,00", "EUR") === "€24,00 EUR", withCurrencyCode("€24,00", "EUR"))
  check("a price that names its code already is left as it is", withCurrencyCode("RON 48.00", "RON") === "RON 48.00" && withCurrencyCode("$24.00 USD", "USD") === "$24.00 USD")
  check("no price, no code", withCurrencyCode("", "USD") === "" && withCurrencyCode(undefined, "USD") === undefined)
  check("words with no amount are not labelled", withCurrencyCode("Free", "USD") === "Free")
  check("a card that does not say its currency takes the deployment's", withCurrencyCode("$5.00", undefined) === `$5.00 ${SHOP_CURRENCY}`)

  /* The section the owner looked at: product cards drawn from the shop. */
  const schema = SECTION_SCHEMAS.product_grid
  const grid = { id: "pg", type: "product_grid", name: "Products", settings: { ...(schema.presets?.[0]?.settings ?? {}) }, blocks: [] } as unknown as SectionInstance
  const card = (price: string, currency: string) => ({ id: "00000000-0000-4000-8000-000000000001", type: "product", settings: { title: "Linen shirt", price, compare_price: "", currency, image: "", url: "/products/linen", tag: "" } })
  const priceIn = (theme: Record<string, unknown>, c: ReturnType<typeof card>) => {
    const r = renderStorelibSection(grid, theme as ThemeSettingsValues, { template: "index", in_editor: true }, undefined, [c] as never)
    return r.ok ? (r.html.match(/class="card__price">([^<]*)/)?.[1] ?? "").trim() : "(did not render)"
  }
  check("off: the card's price as written", priceIn({}, card("48,00 lei", "RON")) === "48,00 lei", priceIn({}, card("48,00 lei", "RON")))
  check("on: a lei card shows RON (it showed nothing)", priceIn({ currency_code_enabled: true }, card("48,00 lei", "RON")) === "48,00 lei RON", priceIn({ currency_code_enabled: true }, card("48,00 lei", "RON")))
  check("on: a dollar card shows USD", priceIn({ currency_code_enabled: true }, card("$24.00", "USD")) === "$24.00 USD", priceIn({ currency_code_enabled: true }, card("$24.00", "USD")))
  const render = read("lib/storelib-theme/render.ts")
  check("every price a card carries takes its own card's currency", /const code = s\.currency/.test(render) && /withCurrencyCode\(s\.price, code\)/.test(render) && /withCurrencyCode\(v\.price, code\)/.test(render))
}

console.log("\nTHE THEME A FINGER DREW IS LET GO OF")
{
  const base = { button_border_radius: 8, accent: "#111" } as unknown as ThemeSettingsValues
  const drawn = { button_border_radius: 20 }
  const committed = { ...base, button_border_radius: 20 } as unknown as ThemeSettingsValues
  check("while the finger is down it is kept", drawnSettled(drawn, committed, drawn, 1) === false)
  check("before the commit arrives it is kept", drawnSettled(drawn, base, drawn, 0) === false)
  check("once the editor's copy says the same, it is let go of", drawnSettled(drawn, committed, drawn, 0) === true)
  /* The bug: the store let go first, and this reader kept its copy for good. */
  check("and when the store has let go already (another reader, the first to see the commit)", drawnSettled(drawn, committed, null, 0) === true)
  check("a newer value on its way: kept until that one is drawn", drawnSettled(drawn, committed, { button_border_radius: 24 }, 0) === false)
  check("nothing drawn: nothing to let go of", drawnSettled(null, committed, null, 0) === false)

  const out = { ...base, ...drawn } as unknown as ThemeSettingsValues
  const newer = { button_border_radius: 26 }
  const patched = themeToPatch(base, drawn, out, newer) as unknown as Record<string, unknown>
  check("the variables follow the newest value, not an older one a render just finished", patched.button_border_radius === 26 && patched.accent === "#111", patched)
  check("the value drawn is the newest: the theme drawn, as it is", themeToPatch(base, drawn, out, drawn) === out)
  check("nothing under a finger: the theme drawn", themeToPatch(base, null, base, null) === base)

  const live = read("lib/website-builder/live-settings.ts")
  check("useLiveTheme patches with themeToPatch and lets go of its own copy with the store's", /patchRef\.current\?\.\(themeToPatch\(base, o, out, store\)\)/.test(live) && /if \(!drawnSettled\(o, base, store, depth\)\) return[\s\S]{0,900}if \(store === theme\) theme = null\s*if \(store !== null && store === themeEcho\) themeEcho = null\s*drawing\.stop\(\)\s*oRef\.current = null\s*seen\.current = null\s*setO\(null\)/.test(live))
}

console.log("\nA SECTION BEING EDITED HOLDS STILL")
{
  const css = read("app/globals.css")
  check("transitions are off inside a section held still, the selection ring keeps its fade", css.includes("#wb-preview-root :is([data-wb-still], [data-wb-still-theme]) :not(.wb-ring)") && /\[data-wb-still-theme\]\) :not\(\.wb-ring\)::after \{ transition: none !important; \}/.test(css))
  check("the two names are the module's", STILL_SECTION_ATTR === "data-wb-still" && STILL_THEME_ATTR === "data-wb-still-theme")
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("the theme patcher holds still the sections it writes a live value onto, and lets go with the value", /written\.set\(el, own\)[\s\S]{0,200}holdStill\(el, STILL_THEME_ATTR, true\)/.test(page) && /written\.delete\(el\)\s*holdStill\(el, STILL_THEME_ATTR, false\)/.test(page))
  const renderer = read("components/website-builder/sections/SectionRenderer.tsx")
  check("a section whose own values are live or echoed holds still until the editor's copy agrees", /const editing = section !== props\.section/.test(renderer) && /holdStill\(document\.getElementById\(boxId\), STILL_SECTION_ATTR, editing\)/.test(renderer))
  const bridge = read("lib/storelib-theme/compat/canvas-bridge.ts")
  check("an imported theme's frame ends the eases a builder change starts, in the change's own task", /var finishEased = function \(\)/.test(bridge) && /typeof a\.transitionProperty !== "string"/.test(bridge) && /if \(m\.type === "patch" \|\| m\.type === "edits" \|\| m\.type === "section"\) holdStill\(\);/.test(bridge) && /editAnywhere\(e\); \} catch \(err\) \{ return false; \} \}\);\s*holdStill\(true\);/.test(bridge) && (bridge.match(/\.then\(stillNow\)/g) ?? []).length === 2)
  check("only eases that start with the change: a hover under way keeps its own", /if \(a\.startTime !== null && a\.startTime < stillFrom\) return;/.test(bridge))
}

console.log("\nA VALUE THE PAGE ONLY READS AS A VARIABLE")
{
  check("the settings that differ", JSON.stringify(changedThemeKeys({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })) === JSON.stringify(["b", "c"]))
  check("the button radius alone: the variables are enough", drawnByVariablesAlone(["button_border_radius"], {}) === true)
  check("a card radius is printed by fifty sections: drawn again", drawnByVariablesAlone(["border_radius"], {}) === false)
  check("one listed and one not: drawn again", drawnByVariablesAlone(["page_width", "primary_color"], {}) === false)
  check("nothing changed: nothing to decide", drawnByVariablesAlone([], {}) === false)
  check("a section of the creator's own that prints the token: drawn again", drawnByVariablesAlone(["button_border_radius"], { "sections/mine.storelib": "<a style=\"border-radius: {{ theme.buttons.radius }}px\">" }) === false)
  check("or the raw setting", drawnByVariablesAlone(["page_width"], { "sections/mine.storelib": "{{ theme.settings.page_width }}" }) === false)
  check("a section's own setting of the same name is not the theme's", drawnByVariablesAlone(["button_border_radius"], { "sections/hero.storelib": "border-radius: {{ settings.button_border_radius }}px" }) === true)

  /* No bundled section prints any of them: the list is only true while that is. */
  const bundled = Object.entries(DEFAULT_THEME_SOURCES as Record<string, string>)
  const printed: string[] = []
  for (const [k, tokens] of Object.entries(VARIABLE_ONLY_THEME_SETTINGS)) {
    for (const [file, src] of bundled) for (const r of [`theme.settings.${k}`, ...tokens.map((t) => `theme.${t}`)]) if (src.includes(r)) printed.push(`${file}: ${r}`)
  }
  check("no bundled section file prints a setting listed as variables only", bundled.length > 20 && printed.length === 0, { files: bundled.length, printed })
  const renderers = ["components/website-builder/sections/_shared.tsx", "components/website-builder/theme/ThemePage.tsx"]
  const fromTheme: string[] = []
  for (const f of renderers) for (const k of Object.keys(VARIABLE_ONLY_THEME_SETTINGS)) if (new RegExp(`theme(\\?)?\\.${k}\\b|theme\\[["']${k}["']\\]`).test(read(f))) fromTheme.push(`${f}: ${k}`)
  check("nor does the canvas's own React read one off the theme", fromTheme.length === 0, fromTheme)
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("the canvas keeps the committed theme for every section when the variables are enough", /drawnByVariablesAlone\(changedThemeKeys\(theme as Record<string, unknown>, committedTheme as Record<string, unknown>\), sources\)/.test(page) && /\(!themeLive \|\| \(!variablesAlone && onScreen\(id\)/.test(page))
  check("the committed theme's variables are worked out once per theme, not per move", /let was = committedVars\.get\(base\)/.test(page))
}

console.log("\nA THEME SETTING CHOSEN IS ON THE SECTIONS ON SCREEN FIRST")
{
  resetLive()
  echoThemeSetting("button_shape", "pill")
  check("a committed theme setting is echoed", JSON.stringify(themeEchoNow()) === JSON.stringify({ button_shape: "pill" }))
  reconcileThemeEcho({ button_shape: "pill" })
  check("an echo the editor holds stays", themeEchoNow() !== null)
  reconcileThemeEcho({ button_shape: "rounded" })
  check("an echo the editor no longer holds (an Undo) is dropped at once", themeEchoNow() === null)
  echoThemeSetting("currency_code_enabled", true)
  resetLive()
  check("and forgotten with everything live", themeEchoNow() === null)
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("the editor echoes a theme setting after the same-value check, on a Storelib theme", /if \(sameSettingValue\(settingsRef\.current\[key\], value\) && !follows\) return\s*\/\*[^*]*\*\/\s*if \(!compatInstall\) echoThemeSetting\(key, value\)/.test(page))
  check("checks it against its own settings after each render", /reconcileThemeEcho\(settingsRef\.current as Record<string, unknown>\)/.test(page))
  check("and only the Storelib canvas draws echoes, on the sections on screen", /useLiveTheme\(committedTheme, patchCanvasThemeVars, \{ echoes: true \}\)/.test(page) && /useLiveTheme\(props\.theme as unknown as ThemeSettingsValues\) as unknown/.test(read("components/website-builder/compat/compat-canvas.tsx")))
}

async function fromItsTemplate() {
  console.log("\nA SECTION'S SLIDER, FROM ITS TEMPLATE")
  forgetLiveFill()
  const schema = SECTION_SCHEMAS.hero_centered
  const hero = { id: "hero-live", type: "hero_centered", name: "Hero", settings: { ...(schema.presets?.[0]?.settings ?? {}), padding_top: 80 }, blocks: [] } as unknown as SectionInstance
  const theme = {} as ThemeSettingsValues
  let engineDraws = 0
  const render = (s: SectionInstance, t: ThemeSettingsValues) => { engineDraws++; return renderStorelibSection(s, t, { template: "index", in_editor: true }) }
  const at = (v: number) => ({ ...hero, settings: { ...hero.settings, padding_top: v } }) as SectionInstance
  const real = (s: SectionInstance) => renderStorelibSection(s, theme, { template: "index", in_editor: true })
  drawLive(hero, theme, render, true)
  drawLive(at(90), theme, render, true)
  drawLive(at(100), theme, render, true)
  check("the first values of a drag are the engine's: two to learn from, one to check", engineDraws === 3, engineDraws)
  const filled = drawLive(at(130), theme, render, true)
  const exact = real(at(130))
  check("from then on a value is the template filled in, no engine draw", engineDraws === 3, engineDraws)
  check("and it is exactly what the engine draws for that value", filled.ok && exact.ok && filled.html === exact.html && filled.css === exact.css)
  check("back where the drag began, too", (() => { const a = drawLive(at(80), theme, render, true), b = real(at(80)); return a.ok && b.ok && a.html === b.html && engineDraws === 3 })())
  drawLive(at(140), theme, render, false)
  check("not under a finger, the engine draws it (the commit, what is published)", engineDraws === 4, engineDraws)
  const other = { ...at(130), settings: { ...at(130).settings, heading: "Another" } } as SectionInstance
  const two = drawLive(other, theme, render, true)
  const twoReal = real(other)
  check("two settings apart from what it was learned at: the engine draws it", two.ok && twoReal.ok && two.html === twoReal.html && engineDraws === 5)
  forgetLiveFill()

  check("a value printed as written makes a template", JSON.stringify(templateFrom({ value: 80, html: '<p style="--pt: 80px">80% of 180</p>' }, { value: 90, html: '<p style="--pt: 90px">90% of 180</p>' })) === JSON.stringify(['<p style="--pt: ', 'px">', "% of 180</p>"]))
  check("a value worked out (times 0.75) does not", templateFrom({ value: 80, html: "<p>60</p>" }, { value: 92, html: "<p>69</p>" }) === null)
  check("a value behind a condition does not", templateFrom({ value: 80, html: "<p>80</p>" }, { value: 90, html: "<p class=big>90</p>" }) === null)
  check("a number that only looks like the value is not cut", templateFrom({ value: 8, html: "<i>180</i><b>8</b>" }, { value: 9, html: "<i>180</i><b>9</b>" })?.length === 2)
  check("a colour", JSON.stringify(templateFrom({ value: "#112233", html: 'color:#112233"' }, { value: "#445566", html: 'color:#445566"' })) === JSON.stringify(["color:", '"']))
  const section = read("components/website-builder/sections/StorelibSection.tsx")
  check("a .storelib section on the canvas is drawn through it while a finger is down", /if \(render\) return drawLive\(section, theme, render, isLive\(\)\)/.test(section))
  check("it is no engine: a published page's path stays light", !/storelib-runtime|sources\.generated|storelib\/compile/.test(read("lib/website-builder/storelib-live-fill.ts")))
}

function importedTheme() {
  console.log("\nAN IMPORTED THEME'S SETTING CHANGES THE PAGE WHERE IT IS, NEVER BY LOADING IT AGAIN")
  const marked = markDrawnStyles('<html><head><style>a{}</style><meta name="theme-color" content="#111"><link rel="preload" href="/f.woff2"><script>var s = "<style>"</script></head><body><style>b{}</style></body></html>')
  check("the head's own styles, meta and links are marked as drawn", marked.includes("<style data-sl-d>a{}") && marked.includes('<meta data-sl-d name="theme-color"') && marked.includes('<link data-sl-d rel="preload"'))
  check("  never inside a script's text, nor in the body", marked.includes('var s = "<style>"') && marked.includes("<body><style>b{}"))
  const shape = (o: Partial<DocShape> = {}): DocShape => ({ head: "<script /t.js>", headNodes: ['<meta data-sl-d name="theme-color" content="#111">'], styles: [":root{--accent:#111}"], bodyStyles: [".x{color:#111}"], fonts: [], htmlAttrs: {}, bodyAttrs: {}, skeleton: "<main></main>", sections: new Map([["a", "<div>a</div>"]]), order: [{ id: "a", group: "" }], ...o })
  const was = shape()
  const accent = planPatch(was, shape({ headNodes: ['<meta data-sl-d name="theme-color" content="#c22">'], styles: [":root{--accent:#c22}"], bodyStyles: [".x{color:#c22}"] }))
  check("a colour the theme prints in its theme-color, its variables and a body style: changed in place (it loaded the page again, 36 times in one drag)", !!accent && JSON.stringify(accent.message.headNodes) === JSON.stringify(['<meta data-sl-d name="theme-color" content="#c22">']) && Array.isArray(accent.message.styles) && Array.isArray(accent.message.bodyStyles) && accent.swaps.length === 0, accent)
  check("a section whose markup changed is the only one sent", JSON.stringify(planPatch(was, shape({ sections: new Map([["a", "<div>a USD</div>"]]) }))?.swaps) === JSON.stringify([{ id: "a", html: "<div>a USD</div>" }]))
  check("the head's scripts or the markup around the sections changed: loaded again, the last resort", planPatch(was, shape({ head: "<script /u.js>" })) === null && planPatch(was, shape({ skeleton: "<main></main><aside></aside>" })) === null)
  check("a stylesheet that came or went: loaded again", planPatch(was, shape({ styles: [] })) === null && planPatch(was, shape({ bodyStyles: [] })) === null)
  check("nothing changed: nothing sent", planPatch(was, shape())?.empty === true)

  const bridge = read("lib/storelib-theme/compat/canvas-bridge.ts")
  check("the frame counts only the head styles the page was drawn with, not one a theme's script added (it loaded the page again for every theme change)", bridge.includes('document.head.querySelectorAll("style[data-sl-d]")') && !bridge.includes('return !x.hasAttribute("data-sl"); });\n      if (mine.length'))
  check("  changes the head's meta and links in place, a stylesheet's link let go of once the new one has loaded", /if \(m\.headNodes\) \{/.test(bridge) && /y\.addEventListener\("load", gone, \{ once: true \}\);[\s\S]{0,120}x\.after\(y\);/.test(bridge))
  check("  and the layout's own body styles, marked as drawn before the theme's scripts run", /x\.__slDrawn = true/.test(bridge) && /if \(m\.bodyStyles\) \{/.test(bridge))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("every drawing of the page is marked", /return markDrawnStyles\(canvasInsets\(drawn\.html\)/.test(canvas))
  check("a page drawn from changed files is the same page: kept where it was scrolled, brought forward as a cut", /const pageIdFor = /.test(canvas) && /front\(\)!\.key\.split\("\|"\)\[0\] !== pageIdFor\(pageKey, productId, accountPath\)\) scrollY\.current = 0/.test(canvas) && /const same = slot\.key\.split\("\|"\)\[0\] === slotsRef\.current\[0\]\?\.key\.split\("\|"\)\[0\]/.test(canvas))

  console.log("\nHOVER AND FOCUS, LIVE")
  check("a Hover and focus value is Storelib's stylesheet written again in place, the page held while the finger is down", /change\.path\[0\] === "shopify" && typeof change\.path\[1\] === "string" && change\.path\[1\]\.startsWith\("storelib_"\)/.test(canvas) && /edits: \[\{ style: true, sel: "style\[data-storelib-overrides\]", from, to \}\]/.test(canvas))
  check("  the frame writes the named stylesheet whatever it holds", /if \(e\.style && e\.sel\) \{\s*var named = document\.querySelector\(e\.sel\);/.test(bridge))

  console.log("\nSTORELIB'S OWN EVENTS")
  check("the settings that changed, with their new values", JSON.stringify(changedCompatSettings({ shopify: { a: 1, b: { x: 1 }, c: 3 } }, { shopify: { a: 1, b: { x: 2 }, d: 4 } })) === JSON.stringify({ b: { x: 2 }, c: undefined, d: 4 }))
  /* Changed on purpose (round BB): a section's own setting carries the section's id in the detail. */
  /* Changed on purpose (round BC): the event is cancelable, so a theme that applied a section's value itself can say so with preventDefault(). */
  check("storelib:settings-change on the document, after what was asked before it is on the page", /if \(m\.type === "settings"\) \{[\s\S]{0,200}?queue = queue\.then\(function \(\) \{[\s\S]{0,400}?var ev = new CustomEvent\("storelib:settings-change", \{ cancelable: true, detail: m\.section \? \{ settings: m\.settings \|\| \{\}, live: !!m\.live, section: String\(m\.section\) \} : \{ settings: m\.settings \|\| \{\}, live: !!m\.live \} \}\);\s*document\.dispatchEvent\(ev\);/.test(bridge))
  check("  sent for a drawing of the page, a value under a finger and the release", /tell\(win, isLive\(\)\)/.test(canvas) && /tell\(liveWin, true\)/.test(canvas) && (canvas.match(/sayLive\(\)/g) ?? []).length >= 3 && /tellSettings\(w, before, drawnWith\.current\.settings, false\)/.test(canvas))
  check("storelib:section-load on a section drawn again, swapped or changed in place", (bridge.match(/sectionLoaded\(m\.id\)/g) ?? []).length === 4 && /fire\(el, "shopify:section:load", \{ sectionId: id, load: true \}\);\s*fire\(el, "storelib:section-load", \{ sectionId: id \}\);/.test(bridge))
  const docs = read("content/developers/imported-shopify-themes.md")
  check("both are documented for theme developers", docs.includes("`storelib:settings-change`") && docs.includes("`storelib:section-load`") && /DEVELOPER_DOCS/.test(read("lib/developers/content.generated.ts")) && read("lib/developers/content.generated.ts").includes("storelib:settings-change"))
}

function measured() {
  console.log("\nMEASURED")
  const probe = read("scripts/check-editor-live.mjs")
  check("the probe drives the five edits on both kinds of theme, Undo after a drag, and Hover and focus", ["theme radius", "undo theme radius", "theme colour", "currency code", "section text", "section range", "hover field radius", "hover button colour"].every((n) => probe.includes(`"${n}"`)) && /kind === "imported"/.test(probe))
  check("and counts reloads, sections mounted again, scroll and saves", /reloads: m\.loads \+ m\.frameEls/.test(probe) && /remounted: m\.removedSections/.test(probe) && /scroll: kind === "imported"/.test(probe) && /saves: m\.saves\.length/.test(probe))
}

fromItsTemplate().then(() => {
  importedTheme()
  measured()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}, (e) => {
  console.error(e)
  process.exit(1)
})
