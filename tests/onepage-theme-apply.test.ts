/**
 * ===========================================================================
 *  PICKING A THEME CHANGES THE WHOLE LOOK AND EVERY BLOCK
 * ===========================================================================
 * "When I select Air it doesn't change the UI of the product block, and it
 * happens across multiple things." Picking a theme merged its settings into
 * the page's, so whatever the new theme did not name stayed as the old one
 * left it (Blocks' grid and hard shadow on Air), and a product block's own
 * colours stayed too (a black slab with Air's dark ink on it).
 *
 * lib/onepage/theme-apply.ts is what picking a theme does now. This suite
 * checks it against the real theme catalogue in the Design tab, and that the
 * editor, the renderer and the block's colour pickers use it. The real
 * editor, every theme pressed: scripts/check-onepage-themes.mjs.
 */
import { readFileSync } from "node:fs"
import { LOOK_RESET, BLOCK_COLOUR_FIELDS, buttonStyleFor, contrastRatio, lookFromTemplate, readableOn, withoutOwnColours } from "@/lib/onepage/theme-apply"
import type { OnePage, OnePageBlock } from "@/lib/onepage/types"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)

console.log("\nEvery setting a theme can leave behind is reset")
const design = read("components/onepage/tabs/design-tab.tsx")
const configs = [...design.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",[\s\S]*?theme_config: \{([\s\S]*?)\n    \},/g)].map((m) => ({
  id: m[1],
  keys: new Set([...m[2].matchAll(/^\s+(\w+):/gm)].map((k) => k[1])),
}))
check(`the theme catalogue was read (${configs.length} themes)`, configs.length >= 15)
const everyTheme = configs.length ? [...configs[0].keys].filter((k) => configs.every((c) => c.keys.has(k))) : []
const someThemes = [...new Set(configs.flatMap((c) => [...c.keys]))].filter((k) => !everyTheme.includes(k))
/* header_layout is the picker's own choice (a Hero theme, or classic for a picture), passed in, never left over. */
const unreset = someThemes.filter((k) => !(k in LOOK_RESET) && k !== "header_layout")
check("every setting only some themes name is reset before a theme is laid on", unreset.length === 0, unreset.join(", "))

console.log("\nPicking a theme")
const page = {
  id: "p",
  theme: { template_id: "blocks", background_color: "#ffd84d", background_pattern: "grid", button_shadow: "hard", button_shadow_color: "#111111", button_border_width: 2, laser_glow_enabled: true, logo_url: "https://x/logo.png" },
  settings: { share_style: "white", subscribe_style: "white", seo_title: "Mine" },
  draft_blocks: [
    { id: "l", type: "link_button", enabled: true, sort_order: 1, data: { label: "My Link", url: "https://x" } },
    { id: "b", type: "product", enabled: true, sort_order: 2, data: { product_id: "p1", block_background_color: "#111111", text_color: null, style: "callout" } },
  ],
} as unknown as OnePage
const air = { id: "air", category: "light", theme_config: { background_color: "#eef0f3", button_color: "#ffffff", button_text_color: "#111827", button_style: "filled", button_shadow: "subtle" } }
const after = lookFromTemplate(page, air)
const t = after.theme as unknown as Record<string, unknown>
check("the theme is recorded", t.template_id === "air")
check("its own settings are laid on", t.background_color === "#eef0f3" && t.button_shadow === "subtle")
check("the old theme's pattern is gone", t.background_pattern === "none")
check("  and its border, glow and shadow colour", t.button_border_width === 0 && t.laser_glow_enabled === false && t.button_shadow_color == null)
check("what is the person's own stays (the logo)", t.logo_url === "https://x/logo.png")
check("the header layout is set only when the picker chose one", !("header_layout" in t) && (lookFromTemplate(page, air, "hero").theme as unknown as Record<string, unknown>).header_layout === "hero")
const s = after.settings as unknown as Record<string, unknown>
check("other settings stay", s.seo_title === "Mine")
const product = after.draft_blocks!.find((b) => b.id === "b")!.data as unknown as Record<string, unknown>
check("the product block's own colours are cleared, so it wears the theme", BLOCK_COLOUR_FIELDS.product.every((f) => product[f] == null))
check("  and what it is and shows stays", product.product_id === "p1" && product.style === "callout")
check("a block with no colours of its own is the same block", after.draft_blocks![0] === page.draft_blocks![0])
check("the page before is untouched (one step, one undo)", (page.theme as unknown as Record<string, unknown>).background_pattern === "grid" && (page.draft_blocks![1].data as unknown as Record<string, unknown>).block_background_color === "#111111")
const block = page.draft_blocks![1] as OnePageBlock
check("withoutOwnColours clears every colour field", Object.values(BLOCK_COLOUR_FIELDS.product).every((f) => (withoutOwnColours(block).data as unknown as Record<string, unknown>)[f] === null))

console.log("\nShare and Subscribe follow the theme")
check("a theme's own style wins", buttonStyleFor({ id: "x", theme_config: {}, share_style: "black" }, "share_style") === "black")
check("a light theme that names none gets white", s.share_style === "white" && buttonStyleFor({ id: "x", category: "light", theme_config: {} }, "subscribe_style") === "white")
check("any other gets glass, never white on a dark page", buttonStyleFor({ id: "x", category: "dark", theme_config: {} }, "share_style") === "glassmorphism")

console.log("\nText is readable on what it sits on")
check("contrast of black on white is 21", Math.round(contrastRatio("#000000", "#ffffff")!) === 21)
check("inherited dark ink on a black block turns white", readableOn("#111111", "#111827") === "#ffffff")
check("inherited white on a white block turns dark", readableOn("#ffffff", "#ffffff") === "#111827")
check("a readable inherited colour is kept", readableOn("#ffffff", "#1e40af") === "#1e40af")
check("a colour the person chose always wins", readableOn("#111111", "#111827", "#222222") === "#222222")
check("a background it cannot measure keeps the colour", readableOn("linear-gradient(red, blue)", "#ffffff") === "#ffffff")

console.log("\nThe editor, the renderer and the pickers use it")
const ctx = read("lib/onepage/context.tsx")
check("the editor applies a theme in one commit", ctx.includes("commit(lookFromTemplate(prev, template, headerLayout), null)"))
check("the theme picker uses it, not a merge", design.includes("applyThemeLook(template as never,") && design.includes('applyThemeLook(pendingTemplate as never, "classic")'))
const pub = read("components/onepage/public-onepage.tsx")
/* Round 10: the product block is drawn by components/onepage/product-block.tsx, where its theme button is `themeButton`. */
const productBlock = read("components/onepage/product-block.tsx")
check("the product block's text is kept readable on its own surface", productBlock.includes("readableOn(surfaceColor, theme.button_text_color, data.text_color)") && pub.includes("<ProductBlockWithQuickCheckout"))
/* Round 10 BUTTONS: the card's look is the page's button from lib/onepage/button-style (Soft included), its corners capped at 28px on a Pill page. */
check("the product card wears the theme's button look when it has no fill of its own", productBlock.includes("{ ...themeButtonStyle(theme as ButtonThemeLike), borderRadius: `${radius}px`, color: undefined }"))
const links = read("components/onepage/tabs/links-tab.tsx")
check("the block's colour pickers show the theme's colours until one is picked", links.includes("theme.button_text_color") && links.includes("Picking a theme sets these back to the theme&apos;s."))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
