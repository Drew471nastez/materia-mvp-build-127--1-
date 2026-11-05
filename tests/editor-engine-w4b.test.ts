/**
 * ===========================================================================
 *  THE ENGINE AUDIT, OCTOBER 2026 (W4b)
 * ===========================================================================
 * docs/audits/website-builder-engine-2026-10.md lists what was measured in
 * the builder and on the live site, and what was changed. This holds the
 * changes in place. The numbers themselves come from the browser probes the
 * audit names (scripts/check-slider-latency.mjs and the others); a unit test
 * cannot measure a frame, so what is checked here is the shape that made the
 * numbers what they are.
 *
 * Run with:  npm run test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { CompatTheme, splitCompatFile, wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"
import { CANVAS_BRIDGE } from "@/lib/storelib-theme/compat/canvas-bridge"
import { echoBlockSetting, echoOf, echoSectionSetting, reconcileEchoes, resetLive, withLive } from "@/lib/website-builder/live-settings"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(join(root, dir))) {
    if (f === "node_modules" || f.startsWith(".")) continue
    const p = join(dir, f)
    if (statSync(join(root, p)).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

console.log("\nE1  NO PRESS, HOVER OR FOCUS RESTYLES THE WHOLE DOCUMENT")
{
  /*
    A pointer or focus state inside a :has() anywhere in the stylesheet, or a
    bare `:active` after a descendant combinator, made Chromium restyle every
    element of the page on every press, release, hover change and focus
    change: 1,346 elements, 35 to 150ms each, in the builder. Measured, and
    gone once the rules below were rewritten (the audit, E1).
  */
  const STATE = /(?:hover|active|focus|focus-visible|focus-within)/
  const sources = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => /\.(tsx?|css)$/.test(f))
  const offenders: string[] = []
  for (const f of sources) {
    const text = read(f)
    /* Tailwind's has-[…] and [&:has(…)] variants, in class names. */
    for (const m of text.matchAll(/has-\[([^\]\s"'`]*)\]|\[&:has\(([^)\s"'`]*)\)\]/g)) {
      const inner = m[1] ?? m[2] ?? ""
      if (new RegExp(`:${STATE.source}\\b`).test(inner)) offenders.push(`${f}: ${m[0]}`)
    }
    if (!f.endsWith(".css")) continue
    /* A :has( whose argument names a pointer or focus state, in a stylesheet (comments left out). */
    const css = text.replace(/\/\*[\s\S]*?\*\//g, "")
    for (const m of css.matchAll(/:has\(([^{}]*?)\)/g)) {
      if (new RegExp(`:${STATE.source}\\b`).test(m[1])) offenders.push(`${f}: :has(${m[1]})`)
    }
  }
  check("no :has() in a class name or a stylesheet watches a hover, a press or a focus", offenders.length === 0, offenders)

  const globals = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "")
  const bare = [...globals.matchAll(/[^\n{}]*[\s>~+]:(?:active|hover)\b[^\n{}]*/g)].map((m) => m[0].trim())
  check("globals.css has no bare :active or :hover after a combinator (the element pressed is named)", bare.length === 0, bare)
  check("the card rule still keeps a pressed card at full strength on a touch screen",
    /@media \(hover: none\), \(pointer: coarse\) \{\s*:is\(a, button, \[role="button"\], \[tabindex="0"\]\):has\(img, picture, video, canvas\):active,/.test(read("app/globals.css")))

  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  check("the header's fade siblings reads the nav's own hover", /hover:\[--nav-fade:0\.4\] \[&_a:hover\]:opacity-100/.test(header) && !/\[&:has\(a:hover\)\]/.test(header))
  check("the rich text field's halo follows focus-within", /focus-within:border-\[#c9ccd3\] focus-within:shadow-/.test(read("components/app/rich-text-editor.tsx")))
  const rows = ["app/(storelib)/app/products/products-client.tsx", "app/(storelib)/app/products/collections/collections-client.tsx", "app/(storelib)/app/coupons/coupons-client.tsx"]
  check("list rows grey from the press mark their link sets", rows.every((f) => /data-\[pressed\]:bg-\[#/.test(read(f)) && /\{\.\.\.pressMark\}/.test(read(f))))
  const mark = read("lib/press-mark.ts")
  check("the press mark is set on the press and taken off on release, cancel and leave",
    /* Round 40: a touch marks only after TOUCH_MARK_MS still on the row, and a move past the slop takes it off (a scroll lights nothing). */
    /onPointerDownCapture/.test(mark) && /onPointerUp: .*clear\(rowOf\(e\)\)/.test(mark) && /onPointerCancel: .*clear\(rowOf\(e\)\)/.test(mark) && /onPointerLeave: .*clear\(rowOf\(e\)\)/.test(mark)
      && /export const TOUCH_MARK_MS = 120/.test(mark) && /onPointerMove:[\s\S]*?> TOUCH_SLOP_PX\) clear\(row\)/.test(mark))
}

console.log("\nC1  AN IMPORTED THEME'S FILES ARE READ ONCE, WHATEVER ITS SETTINGS")
{
  const files: Record<string, string> = {
    "layout/theme.liquid": "<html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>",
    "sections/hero.storelib": `${wrapCompatTemplate("<div class=\"hero\" style=\"color: {{ settings.c }}\">{{ section.settings.title }}</div>\n{% stylesheet %}.hero{padding:4px}{% endstylesheet %}")}\n<schema>{"name":"Hero","settings":[{"type":"text","id":"title","default":"Hi"}]}</schema>`,
    "snippets/broken.liquid": "{% if %}",
  }
  const opts = { assetUrl: (n: string) => `/a/${n}` }
  const a = new CompatTheme(files, { c: "#111111" }, opts)
  const b = new CompatTheme({ ...files }, { c: "#222222" }, opts)
  const treeOf = (t: CompatTheme, path: string) => (t as unknown as { tree(p: string): unknown }).tree(path)
  check("a second theme object (a setting moved) reads the same parsed file, not a new parse", treeOf(a, "sections/hero.storelib") !== null && treeOf(a, "sections/hero.storelib") === treeOf(b, "sections/hero.storelib"))
  check("the stylesheet bundle is built once per theme object and is the same text for the next", a.stylesheetBundle() === a.stylesheetBundle() && a.stylesheetBundle() === b.stylesheetBundle() && /\.hero\{padding:4px\}|\.hero \{/.test(a.stylesheetBundle()))
  treeOf(a, "snippets/broken.liquid"); treeOf(b, "snippets/broken.liquid")
  check("a file that does not parse is still named in each theme's warnings, read from the cache or not", a.warnings.some((w) => w.startsWith("snippets/broken.liquid")) && b.warnings.some((w) => w.startsWith("snippets/broken.liquid")))
  const s1 = splitCompatFile(files["sections/hero.storelib"])
  const s2 = splitCompatFile(files["sections/hero.storelib"])
  check("a file's schema is a new object on every read (nothing shared can be changed under another theme)", !!s1.schema && s1.schema !== s2.schema && JSON.stringify(s1.schema) === JSON.stringify(s2.schema) && s1.markup === s2.markup)
  const site = read("lib/website-builder/compat-site.ts")
  check("the live site holds a theme by a hash of its settings, not their length", /const key = `\$\{installId\}:\$\{version\}:\$\{settingsKey\(settings\)\}`/.test(site) && !/JSON\.stringify\(settings\)\.length\}`/.test(site))
}

console.log("\nC2  AN IMPORTED THEME'S CANVAS FOLLOWS A THEME SETTING UNDER A FINGER")
{
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("the canvas draws with the live theme", /const settings = useLiveTheme\(props\.theme/.test(canvas))
  check("during a gesture the page is drawn newest first, at most once a frame and no sooner than the last draw took", /if \(isLive\(\)\) \{ scheduleRedraw\(run\); return \}/.test(canvas) && /r\.nextAt = performance\.now\(\) \+ cost/.test(canvas) && /const next = r\.run\s*r\.run = null/.test(canvas))
  /* Changed on purpose (push lag): a change of the theme's files is drawn and compared ahead in tasks of their own (prepareDraw) between the scroll rest and the redraw. */
  check("outside a slider gesture, queued drawing is dropped and canvas scrolling finishes first", /cancelRedraw\(\)[\s\S]{0,1200}whenCanvasRests\(\)\.then/.test(canvas) && /if \(fromFiles\) await prepareDraw\(\(\) => cancelled\)\s*if \(!cancelled\) runRedraw\(run\)/.test(canvas))
}

console.log("\nC3  THE PAGE'S OWN CHANGES DO NOT KEEP THE OUTLINES BUSY")
{
  check("a morph takes its own changes off the watcher's list", /ops\.forEach\(function \(op\) \{ op\(\); \}\);[\s\S]{0,900}if \(watcher\) watcher\.takeRecords\(\);/.test(CANVAS_BRIDGE))
  /* Changed on purpose (round 14): the toolbar's box is read with the outlines, before any of them is written, also with a block selected. */
  check("the outlines and the toolbar's box are read once a frame, together", /var drawBoxes = function \(withReport\)/.test(CANVAS_BRIDGE) && /var repV = repEl \? \(repEl === sec && !b \? seen : visibleRect\(repEl, 0\)\) : null;[\s\S]{0,400}report\(\{ el: repEl, v: repV \}\)/.test(CANVAS_BRIDGE) && /read && read\.el === el \? read\.v : visibleRect\(el, 0\)/.test(CANVAS_BRIDGE))
  let parses = true
  try { new Function(CANVAS_BRIDGE) } catch { parses = false }
  check("the bridge still reads as a script", parses)
}

console.log("\nS1  A PUBLISHED WEBSITE'S JAVASCRIPT CARRIES NO ENGINE")
{
  /*
    What a visitor's browser loads for a native site is the section
    renderer and what it imports. It imported the theme's whole source map,
    the schema parser, the validator, postcss and zod: 1.3MB (288KB gzipped)
    in the production build's site chunk. Measured on the page's own client
    tree with esbuild: 1,581KB to 785KB, 366KB to 229KB gzipped.
  */
  const importsOf = (f: string) => [...read(f).matchAll(/^import[^"\n]*"([^"]+)"/gm)].map((m) => m[1])
  const SITE = [
    "components/website-builder/sections/registry.ts",
    "components/website-builder/sections/SectionRenderer.tsx",
    "components/website-builder/sections/StorelibSection.tsx",
    "components/website-builder/theme/ThemePage.tsx",
    "lib/storelib-theme/section-groups.ts",
    "lib/storelib-theme/schema/normalise.ts",
    "lib/website-builder/live-settings.ts",
  ]
  const ENGINE = /storelib-schemas|sources\.generated|storelib\/compile|schema\/validate|controls\/registry|storelib-runtime|^zod$|^postcss/
  const heavy = SITE.flatMap((f) => importsOf(f).filter((i) => ENGINE.test(i)).map((i) => `${f}: ${i}`))
  check("no module on a published page's path imports the engine, the sources, zod or postcss", heavy.length === 0, heavy)
  check("the control names live apart from their zod checks", !/from "zod"/.test(read("lib/storelib-theme/controls/types.ts")) && /export \{ CONTROL_TYPES, LEGACY_TYPE_ALIASES, SHOPIFY_TYPE_ALIASES, resolveControlType, type ControlType \}/.test(read("lib/storelib-theme/controls/registry.ts")))
  /* Changed on purpose (round 12): marked pure was not enough, the import kept zod in every website's bundle, so the schema moved to a file of its own. */
  check("the block tree's save schema lives apart from the tree helpers, so a bundle that never saves leaves zod out", /export const BlockInstanceSchema: z\.ZodType<BlockShape> = \/\* @__PURE__ \*\/ z\.lazy\(/.test(read("lib/website-builder/block-tree-schema.ts")) && !/from "zod"/.test(read("lib/website-builder/block-tree.ts")))
}

console.log("\nN2  A COMMITTED CHANGE IS DRAWN BY ITS SECTION BEFORE THE DEFERRED CANVAS HAS IT")
{
  resetLive()
  const hero = { id: "h1", type: "hero", name: "Hero", settings: { heading: "Hello" }, blocks: [{ id: "b1", type: "item", settings: { text: "One" } }] } as SectionInstance
  echoSectionSetting("h1", "heading", "Hello there")
  echoBlockSetting("h1", "b1", "text", "Two")
  const e = echoOf("h1")
  const drawn = withLive(hero, e)
  check("the echo draws the committed value and the block's", drawn.settings.heading === "Hello there" && (drawn.blocks?.[0].settings as Record<string, unknown>).text === "Two" && hero.settings.heading === "Hello")
  const editorNow = { ...hero, settings: { heading: "Hello there" }, blocks: [{ id: "b1", type: "item", settings: { text: "Two" } }] } as SectionInstance
  reconcileEchoes((id) => (id === "h1" ? editorNow : undefined))
  check("an echo the editor holds stays", echoOf("h1") === e)
  reconcileEchoes((id) => (id === "h1" ? hero : undefined))
  check("an echo the editor no longer holds (an Undo) is dropped at once", echoOf("h1") === undefined)
  echoSectionSetting("h1", "heading", "Again")
  reconcileEchoes(() => undefined)
  check("an echo of a section that is gone is dropped", echoOf("h1") === undefined)
  resetLive()
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the editor echoes a section's and a block's committed setting, after the same-value check", /if \(current && sameSettingValue\(current\.settings\?\.\[key\], value\)\) return\s*\/\*[^*]*\*\/\s*if \(current\) echoSectionSetting\(sectionId, key, value\)/.test(editor) && /if \(block\) echoBlockSetting\(sectionId, blockKey, key, value\)/.test(editor))
  check("and checks every echo against its own state after each render", /* Changed on purpose (round ed-1022): the theme's echo too (live-settings.ts reconcileThemeEcho). */ /useLayoutEffect\(\(\) => \{\s*reconcileEchoes\(\(id\) => sectionsRef\.current\.find\(\(s\) => s\.id === id\)\)\s*reconcileThemeEcho\(settingsRef\.current as Record<string, unknown>\)\s*\}\)/.test(editor))
  const live = read("lib/website-builder/live-settings.ts")
  check("a section draws the echo under a finger's value, and lets go of it once its copy has caught up", /withLive\(withLive\(section, e\), o\)/.test(live) && /if \(e && echoes\.get\(section\.id\) === e && settled\(section, e\)\) echoes\.delete\(section\.id\)/.test(live))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
