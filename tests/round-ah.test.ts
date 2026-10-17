/**
 * Round AH: what the owner asked for after round AG, checked in one place.
 *
 *   AI SECTIONS   a section the builder's AI writes into an imported theme is drawn, never printed as code
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { CompatTheme, isNativeSectionSource, wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"
import { drawPage } from "@/lib/storelib-theme/compat/page"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

async function main() {
  console.log("\nA Storelib section inside an imported theme")
  {
    const native = readFileSync("themes/default/sections/cta_simple.storelib", "utf8")
    check("a native file is told from the theme's own", isNativeSectionSource(native) && !isNativeSectionSource(wrapCompatTemplate("<p>x</p>") + "\n<schema>{}</schema>"))
    const files: Record<string, string> = {
      "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body><main>{{ content_for_layout }}</main></body></html>`),
      "sections/ai_hero.storelib": native,
      "sections/hero.storelib": `${wrapCompatTemplate(`<h1>{{ section.settings.heading }}</h1>`)}\n\n<schema>\n${JSON.stringify({ type: "hero", name: "Hero", settings: [], shopify: { name: "Hero", settings: [{ type: "text", id: "heading", default: "Hi" }] } })}\n</schema>\n`,
    }
    const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
    const page = drawPage(
      theme,
      { designMode: true, products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "RON", moneyFormat: "{{amount}} lei" }, template: "index", path: "/" } as never,
      [
        { id: "h", type: "hero" },
        { id: "ai1", type: "ai_hero", settings: { heading: "Everyday essentials", button_text: "Shop the bestsellers" } },
      ],
      {} as never,
    )
    const html = page.html
    check("the native section is drawn: its heading and button are on the page", html.includes("Everyday essentials") && html.includes("Shop the bestsellers"))
    check("its schema is never printed", !/schema_version|&quot;type&quot;:\s*&quot;|"settings":\s*\[/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")))
    check("no inert <template> or <schema> element reaches the page", !/<template[\s>]/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")) && !/<schema>/.test(html))
    check("it is wrapped like the theme's sections, so the editor selects it", /id="shopify-section-ai1" class="shopify-section storelib-native-section" data-section-id="ai1" data-section-type="ai_hero"/.test(html))
    check("its styles are scoped to it, with the theme's font and colour", /\[data-section-id="ai1"\]\{[^}]*--theme-font-body:inherit/.test(html))
    check("the theme's own section still draws", html.includes("<h1>Hi</h1>"))
    const schema = theme.schemaOf("sections", "ai_hero")
    check("its schema is read as the compiled one", Array.isArray((schema as { settings?: unknown[] }).settings) && JSON.stringify(schema).includes("button_text"))
  }

  console.log("\nThe writer knows an imported theme, and the canvas glides to what it made")
  {
    const writer = code("lib/website-builder/agent/write-section.ts")
    check("an imported theme's writer is told to write no script and keep motion in CSS", /IMPORTED_THEME_NOTE/.test(writer) && /opts\.importedTheme \? IMPORTED_THEME_NOTE/.test(writer))
    check("a file with a script is sent back for an imported theme", /opts\.importedTheme && \/\^\\s\*<script/.test(writer))
    check("the route asks whether the install is imported", /importedTheme = await isCompatInstall\(installId\)/.test(code("app/api/website-builder/themes/[installId]/sections/code/route.ts")))
    const scroll = await import("@/lib/website-builder/canvas-scroll")
    const scroller = { scrollTop: 100, getBoundingClientRect: () => ({ top: 50 }), scrollTo(o: { top: number }) { this.scrollTop = o.top } }
    const to = scroll.glideWithin(scroller, { getBoundingClientRect: () => ({ top: 300 }) })
    check("a new section is glided to even when part of it shows (top less a margin)", to === 334 && scroller.scrollTop === 334)
    check("already there, nothing moves", scroll.glideWithin(scroller, { getBoundingClientRect: () => ({ top: 66 }) }) === null)
    const editor = code("app/website-builder/editor/[installId]/page.tsx")
    check("added, pasted, duplicated and AI sections glide", /revealSection\(copy\.id, true\)/.test(editor) && /revealSection\(pasted\.id, true\)/.test(editor) && /revealSection\(onPage\[0\], true\)/.test(editor) && /revealSection\(id, true\)/.test(editor))
    check("an imported theme's frame is told too", /type: "reveal", id/.test(code("components/website-builder/compat/compat-canvas.tsx")) && /m\.type === "reveal"/.test(read("lib/storelib-theme/compat/canvas-bridge.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
