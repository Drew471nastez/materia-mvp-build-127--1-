/**
 * ===========================================================================
 *  WAVE 11 (hover): ONE HOVER PER BUTTON, READABLE, ON EVERY THEME
 * ===========================================================================
 * The owner: "some of the buttons, texts, hovers, controls don't apply
 * correctly, leaving out buttons of certain blocks or links ... not being
 * consistent or visible ... like the double hover changing the text colour
 * in 3 styles. Fix across all themes." His pages:
 *   18  Classic 98: a product's "Get My Guide" turned navy on hover with black words;
 *   20  Classic 98: the "My Link" card, a navy gradient, with dark words;
 *   21  Grunge Zine: a product's button all but gone, faded paper on paper.
 *
 * Why: three things set a button's words on hover and fought. The page's
 * Fill/Pop hover (app/globals.css .op-btn) turned the button to its fill's
 * words; a skin said its own colour (Classic 98's white); and the runtime
 * guard (lib/onepage/legible), woken by the hover's own transition ending,
 * measured the hovered words against the REST colour under them, "fixed" them
 * with an inline !important colour no hover could undo, and kept it there:
 * rest black → hover white → guard black. A creator's own colour over a skin
 * (lib/onepage/skin-own) was raised to inline !important the same way.
 *
 * Now there is one hover: the pair (--op-fill, --op-fill-text) is worked out
 * once and reads (button-style buttonHoverVars, readableOn); every word and
 * icon in a hovered Fill/Pop button takes it; anything that sets a word's
 * colour inline and !important writes var(--op-hover-ink, <colour>) so the
 * hover still reaches it; the guard leaves a button in use alone and checks
 * every hover's pair against the fill's real paint (findHoverPairs); skins
 * say their hover as that pair, never as a colour rule of their own.
 *
 * On pixels, every theme × every control × rest, hover, focus, pressed:
 * scripts/check-onepage-hover-w11.mjs over scripts/render-onepage-hover-w11.tsx.
 *
 * Run with:  npx tsx tests/onepage-hover-w11.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { withR40Themes } from "@/components/onepage/themes/r40-themes"
import { buttonHoverVars, cardButtonTheme, type ButtonThemeLike } from "@/lib/onepage/button-style"
import { contrast, inkVar, LEGIBLE_CSS, parseColor } from "@/lib/onepage/legible"
import { lookFromTemplate, readableOn } from "@/lib/onepage/theme-apply"
import { defaultTheme } from "@/lib/onepage/types"

let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const ratio = (a: string, b: string) => contrast(parseColor(a)!, parseColor(b)!)
const hex = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)

/* Every theme the lists add to the picker, as picking it lays it on a page. */
const THEMES = withR40Themes([] as { id: string; category: string; name: string; theme_config: Record<string, unknown> }[])
const page = { id: "p", theme: { ...defaultTheme }, settings: {}, draft_blocks: [] } as never
const picked = THEMES.map((t) => ({ id: t.id, theme: (lookFromTemplate(page, t as never, undefined, null) as { theme: ButtonThemeLike }).theme }))

const DESIGNS: Record<string, Partial<ButtonThemeLike>> = {
  plain: {},
  outline: { button_style: "outline" },
  soft: { button_style: "soft" },
  glass: { button_style: "glass" },
  "dark on dark": { button_color: "#1b1b1f", button_text_color: "#2a2a2e", button_style: "filled" },
  "light on light": { button_color: "#f2f2f2", button_text_color: "#e6e6e6", button_style: "filled" },
  "own hover that vanishes": { button_hover_animation: "pop", button_hover_fill: "#ffffff", button_hover_text: "#f0f0f0" },
  "own navy hover, black words (the owner's Classic 98)": { button_hover_animation: "fill", button_hover_fill: "#000080", button_hover_text: "#111111" },
}

console.log("\n1. The hover's pair is worked out once, and it reads (lib/onepage/button-style buttonHoverVars)")
{
  const bad: string[] = []
  let pairs = 0
  for (const { id, theme } of picked)
    for (const [name, d] of Object.entries(DESIGNS)) {
      const t = { ...theme, ...d }
      const v = buttonHoverVars(t) as Record<string, string>
      const fill = v["--op-fill"]
      const text = v["--op-fill-text"]
      if (!hex(fill) || !hex(text)) continue
      pairs++
      if (ratio(fill, text) < 4.5) bad.push(`${id} ${name}: ${text} on ${fill} ${ratio(fill, text).toFixed(2)}`)
    }
  check(`every theme × every design: the hover's words read on its fill (${pairs} pairs)`, bad.length === 0 && pairs > picked.length * 6, bad.slice(0, 6))
  const kept = buttonHoverVars({ button_style: "filled", button_color: "#000000", button_text_color: "#ffffff", button_hover_animation: "fill", button_hover_fill: "#000080", button_hover_text: "#ffff00" }) as Record<string, string>
  check("a creator's own hover pair that reads is kept exactly", kept["--op-fill"] === "#000080" && kept["--op-fill-text"] === "#ffff00", kept)
  const nudged = buttonHoverVars({ button_style: "filled", button_color: "#c0c0c0", button_text_color: "#000000", button_hover_animation: "fill", button_hover_fill: "#000080", button_hover_text: "#111111" }) as Record<string, string>
  check("navy with black words (the owner's 18) becomes navy with words that read", ratio(nudged["--op-fill"], nudged["--op-fill-text"]) >= 4.5, nudged)
}

console.log("\n1. A product's button: the same pair, on the card")
{
  const bad: string[] = []
  for (const { id, theme } of picked)
    for (const [name, d] of Object.entries(DESIGNS)) {
      const t = { ...theme, ...d } as ButtonThemeLike & { background_color?: string }
      const surface = (t.button_style ?? "filled") === "filled" ? (t.button_color as string) : (t as { background_color?: string }).background_color || "#ffffff"
      const cta = cardButtonTheme(t, { surface, cardText: readableOn(surface, t.button_text_color as string) })
      const v = buttonHoverVars(cta) as Record<string, string>
      if (hex(v["--op-fill"]) && hex(v["--op-fill-text"]) && ratio(v["--op-fill"], v["--op-fill-text"]) < 4.5) bad.push(`${id} ${name}`)
    }
  check("every theme × design: the product button's hover reads", bad.length === 0, bad.slice(0, 6))
}

console.log("\n2. One hover in the stylesheet (app/globals.css)")
{
  const css = read("app/globals.css")
  const hover = css.slice(css.indexOf("@media (hover: hover) and (pointer: fine) {\n  :is(.op-btn:hover"), css.indexOf(".op-card:hover .op-media { scale: 1.03; }"))
  const colours = hover.match(/[^-]color:[^;]+;/g) || []
  check("on hover a button's words change in one place only: to its pair's words", colours.length === 2 && colours.every((c) => /var\(--op-fill-text|inherit !important/.test(c)), colours)
  check("Fill and Pop are the same pair (Pop adds Lift's rise, nothing to the words)", /:is\(\[data-hover="fill"\], \[data-hover="pop"\]\) \{ --op-hover-ink: var\(--op-fill-text\); color: var\(--op-fill-text, inherit\) !important; text-shadow: none; \}/.test(hover) && /\[data-hover="pop"\] \{ translate: 0 -2px; \}/.test(hover))
  check("every word and icon in a hovered Fill or Pop button takes the pair (no word keeps a rest colour of its own on the fill)", /:is\(\[data-hover="fill"\], \[data-hover="pop"\]\) :not\(svg \*, img\) \{ color: inherit !important; text-shadow: none; \}/.test(hover))
  check("--op-hover-ink is defined only on a hovered Fill or Pop button", (css.match(/--op-hover-ink:/g) || []).length === 1)
}

console.log("\n3. Skins say their hover as the pair, never as a colour of their own")
{
  const skins = read("components/onepage/themes/theme-skins.css")
  const hoverBlocks = [...skins.matchAll(/@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/g)].map((m) => m[1])
  const own = hoverBlocks.flatMap((b) => (b.match(/[^-]color:\s*[^;]+;/g) || []).filter((c) => !/var\(--op-fill-text/.test(c)))
  check("no skin sets a button's words on hover with a colour of its own (Classic 98's white fought the page's)", own.length === 0, own.slice(0, 4))
  const c98 = read("scripts/onepage-skins/classic98.mjs")
  check("Classic 98 highlights every grey button, a product's and a form's too, with its navy pair", /--op-fill: \$\{NAVY\} !important; --op-fill-text: #ffffff !important;/.test(c98) && /\$\{W\} :is\(\$\{LINK\}, \$\{CTA\}\)/.test(c98))
  /* Every pair a skin declares (a rule with both): its words read on its fill. */
  const bad: string[] = []
  let n = 0
  for (const m of skins.matchAll(/--op-fill:\s*(#[0-9a-f]{6})[^;]*;\s*--op-fill-text:\s*(#[0-9a-f]{6})/gi)) {
    n++
    if (ratio(m[1], m[2]) < 4.5) bad.push(`${m[2]} on ${m[1]}`)
  }
  check(`every hover pair a skin declares reads (${n})`, n >= 8 && bad.length === 0, bad)
  const grunge = read("scripts/onepage-skins/grunge.mjs")
  check("Grunge's product button hovers to ink, never to the paper of the card it sits on (the owner's 21)", /CTA_HOVER = \(p\) => \(p\.second === BLACK \? "#3a3a3a" : BLACK\)/.test(grunge) && /--op-fill: \$\{CTA_HOVER\(p\)\} !important; --op-fill-text: \$\{LIGHT\} !important;/.test(grunge))
  for (const paper of ["#f3eee2", "#f4f3ee"]) check(`Grunge's product hover stands out from its ${paper} paper`, ratio(paper === "#f3eee2" ? "#0d0d0d" : "#3a3a3a", paper) >= 3)
}

console.log("\n4. Words over a picture keep their own colour (the owner's 20)")
{
  const card = code("components/onepage/block-presentation.tsx")
  check("a picture card's words carry their colour and say they are on a photo", /data-on-photo=\{overImage && !native && !bare \? "" : undefined\}/.test(card) && /\.\.\.\(overImage && !bare\?\{color:colors\.color\}:\{\}\)/.test(card))
  check("a picture card does not fill on hover (the fill is under the picture and its shade)", /data-hover=\{overImage && !native && !bare \? "none" : buttonHover\(theme,true\)\}/.test(card))
  check("a product's Overlay words say they are on a photo", /<span className="min-w-0 flex-1" data-on-photo="">/.test(code("components/onepage/product-block.tsx")))
  const shared = read("scripts/onepage-skins/shared.mjs")
  check("a skin's surface ink never reaches words on a photo", /INLINE_INK = `[^`]*\$\{ON_PHOTO\}, \$\{ON_PHOTO\} \*\)`/.test(shared))
}

console.log("\n4. Every button plays the one hover")
{
  const page = code("components/onepage/public-onepage.tsx")
  check("the newsletter's button plays the page's hover with its own pair, never a fade that takes its words under", /"op-btn px-4 sm:px-5 py-3 text-sm font-medium whitespace-nowrap"/.test(page) && /\.\.\.buttonHoverVars\(submitTheme as never\)/.test(page) && !/hover:opacity-90",\s*\)/.test(page))
  const css = read("app/globals.css")
  check("a highlighted link's shine runs under its words and rests on a Fill or Pop hover", /\.op-btn\.animate-onepage-swipe::after \{ z-index: -1; \}/.test(css) && /\.animate-onepage-swipe:is\(\[data-hover="fill"\], \[data-hover="pop"\]\)::after \{ opacity: 0; \}/.test(css))
  check("words switch colour in one step (no colour fade on a button), and the fill stays inside the border", /transition-property: translate, scale, opacity;/.test(css) && /\.op-btn:not\(\.animate-onepage-swipe\)::after \{[^}]*inset: 0;/.test(css))
}

console.log("\n5. The guard: one hover, and every hover reads (lib/onepage/legible)")
{
  const lg = code("lib/onepage/legible.ts")
  check("a colour the guard sets is var(--op-hover-ink, colour): the hover still reaches it", inkVar("#030303") === "var(--op-hover-ink, #030303)" && /setProperty\("color", inkVar\(toCss\(fixed\)\), "important"\)/.test(lg) && /setProperty\("-webkit-text-fill-color", inkVar\(toCss\(fixed\)\), "important"\)/.test(lg))
  check("a button in use (pointed at, its card pointed at, pressed) is neither measured nor released", /if \(engagedButton\(el\)\) continue/.test(lg) && /if \(engagedButton\(h\)\) continue/.test(lg) && /b\.matches\(":hover, :active"\) \|\| b\.closest\("\.op-host, \.op-demo"\)\?\.matches\(":hover, :active"\)/.test(lg))
  check("every Fill and Pop hover's pair is measured on the fill's real paint, and fixed when it does not read", /guardHoverPairs\(root\)\n  guardEdges\(root\)\n  return found/.test(lg) && /getComputedStyle\(h, h\.classList\.contains\("animate-onepage-swipe"\) \? "::before" : "::after"\)/.test(lg) && /f\.el\.style\.setProperty\(FILL_TEXT, f\.fixed, "important"\)/.test(lg))
  check("a faded line that would not read on the fill is shown whole on hover", /\[data-op-hover-whole\]\{opacity:1 !important\}/.test(LEGIBLE_CSS))
  check("a button whose paint is the page's (dark on dark, Glass on white) keeps an edge: a hairline in its words' colour", /function guardEdges/.test(lg) && /outline", `1px solid color-mix\(in srgb, \$\{ink\} 45%, transparent\)`/.test(lg))
  check("a layer laid beside the words (a picture card's shade) counts as under them", /coveringSiblings\(child, r\)/.test(lg))
  const own = code("lib/onepage/skin-own.ts")
  check("a creator's own button words over a skin are raised as var(--op-hover-ink, colour), and taken back as the colour", /p === "color" \? `var\(--op-hover-ink, \$\{unwrapInk\(v\)\}\)` : v/.test(own) && /const v = unwrapInk\(h\.style\.getPropertyValue\(p\)\)/.test(own))
}

console.log("\n6. Walked on pixels")
{
  const checker = read("scripts/check-onepage-hover-w11.mjs")
  const harness = read("scripts/render-onepage-hover-w11.tsx")
  check("the checker tells Chromium it has a mouse, so the (hover: hover) rules run", /primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4/.test(checker))
  check("rest, hover, focus and pressed are each measured on what is painted", /at rest:/.test(checker) && /on hover:/.test(checker) && /focused:/.test(checker) && /pressed:/.test(checker))
  check("a hover that turns the words back (the double hover) fails", /function reversals/.test(checker) && /function plateaus/.test(checker))
  check("an edge that vanishes, and product buttons drawn unlike their siblings, fail", /edge does not show/.test(checker) && /not drawn alike/.test(checker))
  check("the page has every product layout, the owner's My Link and a link with its own surface", ["button", "callout", "preview", "row", "side", "minimal", "overlay", "tile"].every((s) => harness.includes(`"${s}"`)) && /label: "My Link"/.test(harness) && /background: "#000080"/.test(harness))
  check("every theme the picker lists is walked", /__themeIds = THEME_TEMPLATES\.map/.test(harness))
  check("registered in the push tests", read("scripts/run-push-tests.mjs").includes('"tests/onepage-hover-w11.test.ts"'))
}

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")
