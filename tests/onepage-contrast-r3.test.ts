/**
 * ===========================================================================
 *  ROUND 3: NO BUTTON'S WORDS DISAPPEAR, IN ANY STATE, ON ANY THEME
 * ===========================================================================
 * The owner: "in some places the theme still doesn't apply well to buttons
 * and hover states, leading to invisible text: dark text on dark button
 * colours (and light on light). Make this impossible."
 *
 * Each place a colour was chosen without looking at what it sits on, held
 * here to the rule, for every theme the picker lists and every button style
 * a creator can pick over it:
 *
 *   HOVER FILL    Fill and Pop: the fill laid over the page as the browser
 *                 lays it, the words measured on it (a glass colour saved as
 *                 Solid filled the button with white at 15%).
 *   FADE          the Fade hover and a signup button waiting for an address
 *                 fade only as far as keeps 4.5:1 and a step.
 *   LIFT          its tint is the words' opposite, never their own colour.
 *   SEE-THROUGH   words on Soft and Glass held to 5.5:1; a card's button
 *                 counts the tint three times, as it is drawn.
 *   DISABLED      the product sheet's Choose an option and Sold out at full
 *                 strength.
 *   THE GUARD     reads a picture and a shade laid under words beside them in
 *                 the tree (a product's Overlay), instead of turning white
 *                 words dark on a photo.
 *
 * Measured on pixels, every state of every button of every theme:
 * scripts/check-onepage-style-stability.mjs ONLY=contrast
 * (scripts/onepage-button-contrast.mjs).
 *
 * Run with:  node scripts/run-push-tests.mjs (registered there)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { SEE_THROUGH_MIN, TEXT_MIN, buttonGrounds, contrastOn, fadeThatReads, over, pageGrounds, parseColor, ratioOf, readableTheme, smallPrintAlpha, type Rgba } from "@/lib/onepage/contrast"
import { buttonHoverVars, cardButtonTheme, onCardButtonTheme, buttonThemeOn, type ButtonThemeLike } from "@/lib/onepage/button-style"
import { signupWait, waitFade } from "@/lib/onepage/email-signup"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` (${detail})` : ""))
    console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
type T = ButtonThemeLike & Record<string, unknown>
const STYLES = ["filled", "soft", "outline", "glass"] as const
/* Every theme the picker lists, as the page draws it (readableTheme), in each button style a creator can pick over it. */
const looks: { name: string; theme: T }[] = THEME_TEMPLATES.flatMap((tpl) =>
  STYLES.map((style) => ({ name: `${tpl.id}/${style}`, theme: readableTheme({ ...(tpl.theme_config as object), button_style: style } as T) as T })),
)
const worst = (ink: Rgba, grounds: Rgba[]) => Math.min(...grounds.map((g) => contrastOn(ink, g)))

console.log(`\n${looks.length} looks (${THEME_TEMPLATES.length} themes × ${STYLES.length} button styles)`)

console.log("\n1. Fill and Pop: the words read on the fill, the fill as it is drawn")
{
  const bad: string[] = []
  for (const { name, theme } of looks) {
    for (const hover of ["fill", "pop"]) {
      const v = buttonHoverVars({ ...theme, button_hover_animation: hover }) as Record<string, string>
      const fill = parseColor(v["--op-fill"])
      const words = parseColor(v["--op-fill-text"])
      if (!fill || !words) continue
      const ground = pageGrounds(theme as never)[0]
      const r = contrastOn(words, fill.a < 1 ? over(fill, ground) : fill)
      if (fill.a < 0.999 || r < TEXT_MIN) bad.push(`${name} ${hover}: ${v["--op-fill-text"]} on ${v["--op-fill"]} ${r.toFixed(2)}`)
    }
  }
  check("every look's hover fill is solid and its words read on it at 4.5:1", bad.length === 0, bad.slice(0, 6).join("; "))
  const glassSolid = buttonHoverVars({ button_style: "filled", button_color: "rgba(255, 255, 255, 0.15)", button_text_color: "#ffffff", background_color: "#1b1d21", background_type: "solid", button_hover_animation: "fill" } as T) as Record<string, string>
  check("a glass colour saved as Solid fills with what it shows over the page, not white at 15%", /^#[0-9a-f]{6}$/i.test(glassSolid["--op-fill-text"]) && contrastOn(parseColor(glassSolid["--op-fill-text"])!, parseColor(glassSolid["--op-fill"])!) >= TEXT_MIN, JSON.stringify(glassSolid))
  const own = buttonHoverVars({ button_style: "filled", button_color: "#111111", button_text_color: "#ffffff", button_hover_animation: "fill", button_hover_fill: "#f4f4f4", button_hover_text: "#eeeeee" } as T) as Record<string, string>
  check("a page's own hover words that do not read on its own hover fill are moved until they do", contrastOn(parseColor(own["--op-fill-text"])!, parseColor("#f4f4f4")!) >= TEXT_MIN, own["--op-fill-text"])
  const kept = buttonHoverVars({ button_style: "filled", button_color: "#111111", button_text_color: "#ffffff", button_hover_animation: "fill", button_hover_fill: "#ffd400", button_hover_text: "#1a1a1a" } as T) as Record<string, string>
  check("and ones that read are kept as chosen", kept["--op-fill-text"] === "#1a1a1a" && kept["--op-fill"] === "#ffd400")
}

console.log("\n2. Fade, and a signup button waiting for an address: never under 4.5:1")
{
  const bad: string[] = []
  for (const { name, theme } of looks) {
    const v = buttonHoverVars({ ...theme, button_hover_animation: "fade" }) as Record<string, string>
    const a = Number(v["--op-fade"] ?? 0.8)
    const words = parseColor(theme.button_text_color)
    if (!words) continue
    for (const g of pageGrounds(theme as never)) {
      const fill = buttonGrounds(theme as never, [g])[0]
      const r = ratioOf(over({ ...over(words, fill), a }, g), over({ ...fill, a }, g))
      if (r < TEXT_MIN && contrastOn(words, fill) >= TEXT_MIN) bad.push(`${name} at ${a}: ${r.toFixed(2)}`)
    }
  }
  check("every look's Fade keeps its words at 4.5:1 (where they read at rest)", bad.length === 0, bad.slice(0, 6).join("; "))
  check("a button with room to spare still fades to 80%", buttonHoverVars({ button_style: "filled", button_color: "#111113", button_text_color: "#ffffff", background_color: "#ffffff", background_type: "solid", button_hover_animation: "fade" } as T)["--op-fade" as never] === undefined)
  check("one with none does not fade", fadeThatReads("#ffffff", "#767676", [parseColor("#ffffff")!], 5.5, 0.8) === 1)
  const deep = fadeThatReads("#000000", null, [parseColor("#ffffff")!], 5.5, 0.45)
check(`fadeThatReads: the deepest that reads (${deep} for black words on white at 5.5:1), else 1`, fadeThatReads("#000000", "#ffffff", [parseColor("#ffffff")!], 3, 0.45) === 0.45 && deep > 0.45 && deep < 1 && ratioOf(over({ ...parseColor("#000000")!, a: deep }, parseColor("#ffffff")!), parseColor("#ffffff")!) >= 5.5)
  const grey = { words: "#ffffff", fill: "#2d6a4f", grounds: [parseColor("#f6f6f6")!] }
  const a = waitFade(grey)
  check(`a waiting Subscribe fades only to ${a} on a mid-tone fill, and still reads`, a > 0.45 && ratioOf(over({ ...parseColor("#ffffff")!, a }, grey.grounds[0]), over({ ...parseColor("#2d6a4f")!, a }, grey.grounds[0])) >= TEXT_MIN)
  check("the signup's three shapes hand their colours to the wait", (code("components/onepage/public-onepage.tsx").match(/signupWait\((?:Boolean\([^)]*\)|[^)]*), \{ words: /g) || []).length >= 2)
  check("a button a skin paints in its own colours does not fade (those colours are not the ones measured)", waitFade({ ...grey, painted: "vaporwave" }) === 1 && (code("components/onepage/public-onepage.tsx").match(/painted: \(theme as \{ theme_skin\?: unknown \}\)\.theme_skin/g) || []).length === 2)
  check("with nothing known it waits at 45% as before", signupWait(false).filter === "opacity(0.45)" && signupWait(true).filter === undefined)
  check("the Fade hover reads its depth from the button", /\[data-hover="fade"\] \{ opacity: var\(--op-fade, 0\.8\); \}/.test(read("app/globals.css")))
}

console.log("\n3. Lift: its tint parts the words and the fill, never joins them")
{
  const css = read("app/globals.css")
  const rule = /\.op-btn:not\(\.animate-onepage-swipe\)::after \{[^}]*\}/.exec(css)?.[0] ?? ""
  check("the tint is the words' opposite (relative colour), the words' own colour only as a fallback before it", /background: currentColor;\s*background: rgb\(from currentColor calc\(255 - r\) calc\(255 - g\) calc\(255 - b\)\);/.test(rule), rule)
  check("Fill and Pop still fill with their own colour", /\.op-btn:is\(\[data-hover="fill"\], \[data-hover="pop"\]\):not\(\.animate-onepage-swipe\)::after \{\s*background: var\(--op-fill, currentColor\);/.test(css))
}

console.log("\n4. See-through: Soft and Glass on a card, the tint counted three times")
{
  const bad: string[] = []
  for (const { name, theme } of looks) {
    if (theme.button_style !== "soft" && theme.button_style !== "glass") continue
    const card = onCardButtonTheme(theme)
    const ink = parseColor(card.button_text_color)
    if (!ink) continue
    const three = buttonGrounds(card as never, buttonGrounds(theme as never, buttonGrounds(theme as never)))
    if (worst(ink, three) < TEXT_MIN) bad.push(`${name}: ${card.button_text_color} ${worst(ink, three).toFixed(2)}`)
    const product = cardButtonTheme(theme, { surface: String(theme.background_color ?? "#ffffff"), cardText: String(theme.button_text_color ?? "#111113") })
    const pInk = parseColor(product.button_text_color)
    const pThree = buttonGrounds(product as never, buttonGrounds(theme as never, buttonGrounds(theme as never)))
    if (pInk && worst(pInk, pThree) < TEXT_MIN) bad.push(`${name} product: ${product.button_text_color} ${worst(pInk, pThree).toFixed(2)}`)
  }
  check("every Soft and Glass look's card buttons read on the tint laid three times", bad.length === 0, bad.slice(0, 6).join("; "))
  const graphite = THEME_TEMPLATES.find((t) => t.id === "graphite")
  if (graphite) {
    const t = readableTheme(graphite.theme_config as T) as T
    const p = cardButtonTheme(t, { surface: String(t.background_color), cardText: String(t.button_text_color) })
    const words = parseColor(p.button_text_color)!
    check("Graphite's glass product button (4.1:1 on pixels before) reads at 5.5:1 on three layers, or is made solid", p.button_style === "filled" ? contrastOn(words, parseColor(p.button_color)!) >= TEXT_MIN : worst(words, buttonGrounds(p as never, buttonGrounds(t as never, buttonGrounds(t as never)))) >= SEE_THROUGH_MIN, JSON.stringify({ style: p.button_style, color: p.button_color, text: p.button_text_color }))
  }
  const on = buttonThemeOn({ button_style: "glass", button_color: "rgba(255,255,255,0.15)", button_text_color: "#d9d9d9", background_color: "#5a5f66", background_type: "solid" } as T, [parseColor("#5a5f66")!])
  check("a signup's see-through button is held to 5.5:1 too", worst(parseColor(on.button_text_color)!, buttonGrounds(on as never, [parseColor("#5a5f66")!])) >= SEE_THROUGH_MIN || on.button_style === "filled", JSON.stringify(on))
  check("the page's own words on see-through buttons are held to 5.5:1", /seeThrough \? SEE_THROUGH_MIN : TEXT_MIN/.test(code("lib/onepage/contrast.ts")))
}

console.log("\n5. Disabled and waiting buttons keep their words")
{
  const sheet = code("components/onepage/product-sheet.tsx")
  const css = read("app/globals.css")
  check("a press sinks and never fades the words (Neon's title read 3.1:1 under a finger); standing still it is a ring", /html\[data-op-press\] \[data-op-pressing\]:not\(#op\) \{\s*scale: 0\.965;\s*opacity: 1;/.test(css) && /\[data-op-pressing\]:not\(#op\) \{ scale: none; opacity: 1; outline: 2px solid/.test(css))
  check("the product sheet's Choose an option and Sold out are not faded", !/blocker === "sold out"\) && "opacity-50"/.test(sheet) && !/"pointer-events-none opacity-60"/.test(sheet) && /blocker && "cursor-default/.test(sheet))
}

console.log("\n5b. Small print on a page with a pattern keeps a step and a half")
{
  const plain = { background_type: "solid", background_color: "#1d4f86", text_color: "#ffffff", button_color: "#ffffff", button_text_color: "#111111" }
  const grid = { ...plain, background_pattern: "grid" }
  const a = smallPrintAlpha(grid as never)
  check(`a page with a grid lifts its small print (${smallPrintAlpha(plain as never)} plain, ${a} with the grid) until it reads at 6:1`, a >= smallPrintAlpha(plain as never) && contrastOn({ ...parseColor("#ffffff")!, a }, parseColor("#1d4f86")!) >= TEXT_MIN + 1.5)
}

console.log("\n6. The guard reads what is laid under words beside them in the tree")
{
  const lib = code("lib/onepage/legible.ts")
  check("each ancestor's positioned children painted before the words' branch are read", /function layersUnder\(parent: Element, child: Element, r: DOMRect, cache: GroundCache\)/.test(lib) && /for \(const layer of layersUnder\(node, child, r, cache\)\)/.test(lib))
  check("a picture there makes the ground a photo; a shade there is laid on", /if \(layer === "photo"\) \{\s*photo = true/.test(lib) && /stack\.push\(layer\)/.test(lib) && /img, video, canvas, picture/.test(lib))
  check("the page's own wallpaper is left to the theme's darkening, as before", /\[data-wallpaper-photo\], \[data-wallpaper-video\]/.test(lib) && /!sib\.matches\(WALLPAPER\)/.test(lib))
  check("positions are read once per pass, never kept across passes", /new WeakMap<GroundCache, Map<Element/.test(lib))
  const pb = read("components/onepage/product-block.tsx")
  check("Overlay's shade reaches 60% where its words start", /rgba\(0,0,0,0\)_26%,rgba\(0,0,0,0\.6\)_60%,rgba\(0,0,0,0\.8\)_100%/.test(pb))
}

console.log("\n7. Measured in a browser")
{
  const probe = read("scripts/check-onepage-style-stability.mjs")
  const pass = read("scripts/onepage-button-contrast.mjs")
  check("the stability probe has a contrast pass over every theme, in a browser that has a mouse (hover rules apply)", /import \{ contrastPass \} from "\.\/onepage-button-contrast\.mjs"/.test(probe) && /ONLY\.has\("contrast"\) \? themeIds\.flatMap/.test(probe) && /primaryHoverType=2/.test(probe) && /the browser reports no mouse/.test(probe))
  check("every pressable: links, buttons, chips, radios, product buttons, social icons", /\[role=radio\]/.test(pass) && /\[data-product-cta\]/.test(pass) && /\[data-op-social-icon\]/.test(pass))
  check("in each state: rest (selected, disabled), hover, focus, held down", /\["rest", "hover", "focus", "active"\]/.test(pass) && /"disabled" : .*"selected"/.test(pass) && /focusVisible: true/.test(pass) && /page\.mouse\.down\(\)/.test(pass))
  check("and in the sheets: a product's, Share, Subscribe, the tip amounts", /\["product", /.test(pass) && /\["share", /.test(pass) && /\["subscribe", /.test(pass) && /\["tip", /.test(pass))
  check("from pixels: the words made clear by their fill only (currentColor kept), the ground photographed", /-webkit-text-fill-color:transparent !important/.test(pass) && /page\.screenshot\(/.test(pass))
  check("4.5:1, 3:1 for large words and marks", /size >= 24 \|\| \(size >= 18\.66 && weight >= 700\) \? 3 : 4\.5/.test(pass) && /min = 3\s*kind = "icon"/.test(pass))
  check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes("tests/onepage-contrast-r3.test.ts"))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
