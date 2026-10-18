/**
 * Round AH: what the owner asked for after round AG, checked in one place.
 *
 *   AI SECTIONS   a section the builder's AI writes into an imported theme is drawn, never printed as code
 *   LANGUAGES     the builder's language switch is small, and in another language every setting still edits
 *   SECTIONS      the sidebar's insert line is grey, a right click copies and pastes, outlines stop at the header
 *   REVIEWS       a website review is sent without leaving the page, and the confirm email brings the buyer back to it
 *   COMMUNITIES   the checkout's legal line small and folded, a shorter plan card, icons left, the membership one tap away
 *   SELL          the setup at /sell: less round, on a ground with depth, words for any seller, categories in the step
 *   MONEY         every store price is shown in what the store sells in: Settings, lists, pickers, offers, emails
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
    check("its styles are scoped to it, with the theme's font and colour", /* Changed on purpose (round AK: the theme's own font through its CSS variable, inherited when it has none) */ /\[data-section-id="ai1"\]\{[^}]*--theme-font-body:var\(--font-body-family, var\(--font-body--family, inherit\)\)/.test(html))
    check("the theme's own section still draws", html.includes("<h1>Hi</h1>"))
    const schema = theme.schemaOf("sections", "ai_hero")
    check("its schema is read as the compiled one", Array.isArray((schema as { settings?: unknown[] }).settings) && JSON.stringify(schema).includes("button_text"))
  }

  console.log("\nThe writer knows an imported theme, and the canvas glides to what it made")
  {
    const writer = code("lib/website-builder/agent/write-section.ts")
    check("an imported theme's writer is told to write no script and keep motion in CSS", /IMPORTED_THEME_NOTE/.test(writer) && /* Changed on purpose (round AK: the note now carries the theme itself, importedThemeNote) */ /const lines = \[IMPORTED_THEME_NOTE\]/.test(writer) && /opts\.importedTheme \? importedThemeNote\(/.test(writer))
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


  console.log("\nThe setup at /sell")
  {
    const ob = readFileSync("components/app/creator-onboarding-modal.tsx", "utf8")
    check("the card is less round and stands on a ground with depth", /sm:rounded-\[18px\]/.test(ob) && !/rounded-\[44px\]/.test(ob) && /overlayClassName=\{ONBOARDING_GROUND\}/.test(ob) && /radial-gradient/.test(ob))
    check("step one is not about a store only", /Let's set up your page/.test(ob) && !/"Name your store"/.test(ob) && /Your name or brand/.test(ob))
    check("every category opens inside the step, searchable, never in a second dialog", /data-onboarding-all-categories=""/.test(ob) && !/More Categories/.test(ob) && /setShowCategoryModal\(\(v\) => !v\)/.test(ob))
  }

  console.log("\nCommunities")
  {
    const flow = read("components/community/public/join-flow.tsx")
    check("the checkout's legal line is small, one sentence in view, the rest under Details", /<details className="group\/terms text-center text-\[11\.5px\]/.test(flow) && /data-terms-more=""/.test(flow) && /data-terms-full=""/.test(flow))
    check("  the waiver is still said in view where it applies, since pressing is agreeing", /waive the 14 day withdrawal right once access starts/.test(flow) && /\{waiver \? ` \$\{waiver\}` : ""\}/.test(flow))
    check("the plan card: name and trial on one line, price and yearly on the next, two lines of description", /data-plan-trial=""/.test(flow) && /flex flex-wrap items-baseline gap-x-2/.test(flow) && /line-clamp-2/.test(flow))
    const controls = read("components/community/public/join-controls.tsx")
    check("the About card's social icons sit on the left", /\[&_\[data-community-links\]\]:justify-start/.test(controls) && !/\[&_\[data-community-links\]\]:justify-center/.test(controls))
    check("a member reaches their plan, billing, upgrade and cancel from the card and the About row", /data-join-card-membership=""/.test(controls) && /\$\{communityPath\(community\.slug\)\}\/membership/.test(controls) && /<UpgradeButton className=/.test(controls))
    const page = code("app/(marketing)/community/[slug]/page.tsx")
    check("the community page's first reads start together", /await Promise\.all\(\[communitiesEnabled\(\), params, searchParams, currentUserForRequest\(\)\]\)/.test(page) && /communityDomainOrigin\(load\.community\.id\)\]\)/.test(page))
  }

  console.log("\nA review written on a store's website")
  {
    const { cleanReturnPage, returnWithState } = await import("@/lib/reviews/return-page")
    check("the page it was written on is kept, without its #fragment", cleanReturnPage("https://shop.example.com/products/mug?x=1#reviews", "shop.example.com") === "https://shop.example.com/products/mug?x=1")
    check("  never a page on another host, nor a script address", cleanReturnPage("https://evil.example/x", "shop.example.com") === null && cleanReturnPage("javascript:alert(1)", "shop.example.com") === null && cleanReturnPage("http://shop.example.com/x", "shop.example.com") === null)
    check("  and the way back says what happened, with no fragment the browser would jump to", returnWithState("https://shop.example.com/products/mug", "posted") === "https://shop.example.com/products/mug?slr=posted")
    const enhance = read("lib/reviews/widgets/enhance.ts")
    check("the write form is sent in the background, with its page, asking for JSON", /e\.preventDefault\(\)/.test(enhance) && /data\.set\("page", location\.href\.split\("#"\)\[0\]\)/.test(enhance) && /setRequestHeader\("Accept", "application\/json"\)/.test(enhance))
    check("  photos show as thumbnails when picked, and a bar fills as they upload", /URL\.createObjectURL\(f\)/.test(enhance) && /xhr\.upload\.onprogress/.test(enhance))
    check("  the button turns while it goes, and the answer replaces the form in place", /data-slr-spin/.test(enhance) && /data-slr-done/.test(enhance) && /host\.style\.display = "none"/.test(enhance))
    check("  back from the email, the page glides to the section and the address is put back", /params\.get\("slr"\)/.test(enhance) && /scrollIntoView\(\{ behavior: calm \? "auto" : "smooth", block: "start" \}\)/.test(enhance) && /history\.replaceState/.test(enhance))
    const route = code("app/api/reviews/site/route.ts")
    check("the route answers the page's script in JSON, so nothing reloads", /application\\\/json\/i\.test\(request\.headers\.get\("accept"\)/.test(route) && /return take\(request, body, files, answer\)/.test(route))
    check("  and keeps the page only on its own host", /page: cleanReturnPage\(body\.page \?\? request\.headers\.get\("referer"\)/.test(route))
    const digest = code("lib/reviews/digest-server.ts")
    check("the confirm email shows the product and what they wrote, and links back with the page", /media: \{ title: product, subtitle: draft\.store_name, imageUrl \}/.test(digest) && /\?back=\$\{encodeURIComponent\(draft\.page\)\}/.test(digest) && /"★"\.repeat/.test(digest))
    const confirm = code("app/api/reviews/confirm/route.ts")
    check("posting it sends the buyer back to that page, only on a host that serves the store", /returnWithState\(home, done\.status === "published" \? "posted" : "waiting"\)/.test(confirm) && /storeOriginFor\(db, creatorId, origin\)\) === origin/.test(confirm))
    check("every kind of theme carries the script where a form is", /onPage\.includes\("\/api\/reviews\/site"\)/.test(code("components/website-builder/sections/StorelibSection.tsx")) && /\{% raw %\}\$\{reviewWidgetScript\(\)\}\{% endraw %\}/.test(read("lib/storelib-theme/compat/storelib-reviews.ts")))
    const { renderReviewWidget } = await import("@/lib/reviews/widgets/render")
    const { resolveWidgetSettings } = await import("@/lib/reviews/widgets/config")
    const sum = { average: 0, average_label: "0", percent: 0, count: 0, count_label: "0 reviews", bars: [] }
    const html = renderReviewWidget({ type: "product_reviews", settings: resolveWidgetSettings("product_reviews", undefined, {}), reviews: { enabled: true, can_write: true, photos_allowed: true, form_action: "/api/reviews/site", product: { id: "11111111-1111-1111-1111-111111111111", summary: sum as never, items: [] }, all: { summary: sum as never, items: [] } } })
    check("the form's name and email sit side by side, the inputs are larger and softer", /<div class="slw-two"><label>/.test(html) && /min-height:46px/.test(html) && /::file-selector-button/.test(html))
  }

  console.log("\nCopy, paste and add from the sidebar")
  {
    const { sectionRowMenu } = await import("@/components/website-builder/editor/sections-list")
    const page = [
      { id: "h", type: "header", name: "Header", settings: {} },
      { id: "a", type: "hero", name: "Hero", settings: {} },
      { id: "b", type: "faq", name: "FAQ", settings: {} },
      { id: "f", type: "footer", name: "Footer", settings: {} },
    ] as never[]
    const calls: string[] = []
    const ctx = { onDuplicate() {}, onMove() {}, onToggleHide() {}, onRemove() {}, onCopy: (id: string) => calls.push(`copy:${id}`), paste: { name: "Hero", ok: true }, onPasteAfter: () => calls.push("paste") }
    const menu = sectionRowMenu(page[1], page, ctx as never)
    check("a right click on a section offers Copy and Paste below", menu.some((i) => i.id === "copy") && menu.some((i) => i.id === "paste" && i.hint === "Hero"))
    menu.find((i) => i.id === "copy")?.onClick?.()
    menu.find((i) => i.id === "paste")?.onClick?.()
    check("  and each does its one thing", calls.join(" ") === "copy:a paste", calls)
    const cant = sectionRowMenu(page[1], page, { ...ctx, paste: { name: "Hero", ok: false, reason: "Hero isn't in this theme" } } as never).find((i) => i.id === "paste")
    check("  a copy that can't go here is shown, disabled, with why", cant?.disabled === true && cant?.hint === "Hero isn't in this theme")
    check("  the header offers no Copy", !sectionRowMenu(page[0], page, ctx as never).some((i) => i.id === "copy"))
    const list = code("components/website-builder/editor/sections-list.tsx")
    check("a right click on the insert line: Add section or Paste here, two rows", /id: "add-here"/.test(list) && /id: "paste-here"/.test(list) && /* Changed on purpose (round AJ: the line is shared, tree-parts.tsx) */ /onContextMenu=\{\(e\) => \{\s*if \(!onMenu\) return/.test(code("components/website-builder/editor/tree-parts.tsx")))
    check("the line is dark grey with a raised disc, not violet", /* Changed on purpose (round AJ: the plus sits in the same raised white key as Add section, in the shared line, tree-parts.tsx) */ /shadow-\[0_0_0_1px_rgba\(16,24,40,0\.12\),0_2px_5px/.test(code("components/website-builder/editor/tree-parts.tsx")) && /linear-gradient\(90deg,transparent_0%[^"]*#6b7280/.test(code("components/website-builder/editor/tree-parts.tsx")) && !/8b5cf6/.test(list))
    check("Add section rows are grey", /text-\[#4b5563\]/.test(code("components/website-builder/editor/tree-parts.tsx")) && !/7c3aed/.test(code("components/website-builder/editor/tree-parts.tsx")))
    const editor = code("app/website-builder/editor/[installId]/page.tsx")
    check("the editor wires Copy and Paste, to the top of the page too", /onCopy=\{\(id\) => \{ copySectionNow\(id\) \}\}/.test(editor) && /onPaste=\{pasteSectionAt\}/.test(editor) && /pasteSectionNow\(null, clip, true\)/.test(editor) && /top \? 0 : null/.test(editor))
    const bridge = read("lib/storelib-theme/compat/canvas-bridge.ts")
    check("an imported theme's outlines stop at the foot of a sticky header", /var headerCover = function \(el\)/.test(bridge) && /Math\.max\(r\.top, 0, headerCover\(el\)\)/.test(bridge))
  }

  console.log("\nThe builder in another language")
  {
    const React = await import("react")
    const { renderToStaticMarkup } = await import("react-dom/server")
    const { TranslatedFieldEditor } = await import("@/components/website-builder/editor/translation-editing")
    const tr = { locale: "ro", defaultLanguage: "en", name: "Romanian", defaultName: "English", raw: {}, excluded: () => false, write() {}, keepMine() {}, auto() {}, exclude() {}, busy: {}, errors: {} }
    const field = { type: "range", id: "padding", label: "Padding", min: 0, max: 100, default: 20 }
    const draw = (onSharedChange?: (v: unknown) => void) =>
      renderToStaticMarkup(React.createElement(TranslatedFieldEditor, { tr: tr as never, keyFor: () => null, field: field as never, label: "Padding", value: 20, render: (v: unknown) => React.createElement("input", { defaultValue: String(v) }), onSharedChange }))
    const html = draw(() => undefined)
    check("a setting that is not words stays editable in another language, for all of them", /data-shared-setting="editable"/.test(html) && !/inert/.test(html) && /All languages/.test(html))
    check("without a way to change it, it is drawn as before", /inert/.test(draw()))
    const editor = code("app/website-builder/editor/[installId]/page.tsx")
    check("every setting the sidebar draws passes its change through", /onSharedChange=\{props\.onChange\}/.test(editor))
    check("only the menus' link titles stay locked", (editor.match(/<SharedInAllLanguages locked/g) ?? []).length === 1)
    const sw = readFileSync("components/website-builder/preview-locale-switch.tsx", "utf8")
    check("the top bar's switch is a small globe and code, no purple, no chevron in the bar", /* Changed on purpose (round X3, the owner: "more subtle and clean"): the bar's own 32px round text button, 11px words. */ /h-8 shrink-0 items-center gap-1\.5 rounded-full px-2\.5 text-\[11px\]/.test(sw) && !/8b5cf6/.test(sw))
    check("the sidebar says it in one quiet line", /Text saves to \{name\}\. Everything else changes in all languages\./.test(sw) && !/f5f3ff|5b21b6/.test(sw))
  }

  console.log("\nEvery store price in the store's own currency")
  {
    const layout = code("app/app/layout.tsx")
    check("Settings opened as a sheet sits inside the store's currency, as the page does", /<LiveStoreCurrency currency=\{storeCurrency\}>\{sheet\}<\/LiveStoreCurrency>/.test(layout))
    check("the app restoring its session asks for the currency itself", /<LiveStoreCurrency currency=\{null\}>[\s\S]*\{sheet\}[\s\S]*<\/LiveStoreCurrency>/.test(layout) && /fetch\("\/api\/store\/currency"/.test(code("lib/store/currency-context.tsx")))
    check("the creator page editor has the store's currency too", /<LiveStoreCurrency currency=\{storeCurrency\}>/.test(code("app/creator-page/layout.tsx")))
    const ui = code("components/physical/ui.tsx")
    check("shipping rates and local delivery read the store's currency", /export function useShopMoney\(\)/.test(ui) && /useStoreCurrency\(\)/.test(ui))
    const ship = code("components/physical/shipping-settings.tsx")
    check("Settings › Shipping never formats a rate in the platform's currency", !/import \{[^}]*\bmoney\b[^}]*\} from "\.\/ui"/.test(ship) && (ship.match(/const money = useShopMoney\(\)/g) ?? []).length >= 2)
    check("the products list and its exports are in the store's currency", /function PriceOf[\s\S]{0,200}useStoreCurrency\(\)/.test(code("app/app/products/products-client.tsx")) && /formatMoney\(c, storeCurrency\)/.test(code("app/app/products/products-client.tsx")))
    check("a customer's total spent is in the store's currency", /formatPrice\(customer\.total_spent_cents, storeCurrency\)/.test(code("app/app/customers/page.tsx")))
    for (const f of ["components/onepage/tabs/links-tab.tsx", "components/onepage/tabs/products-tab.tsx", "components/onepage/link-stats-chart.tsx", "components/offers/bundle-offers.tsx", "components/offers/checkout-suggestions.tsx", "components/physical/buy-box.tsx", "components/email/compose/product-picker.tsx", "components/store-builder/product-page-mode-selector.tsx", "components/store-builder/sections-sidebar.tsx"]) {
      check(`${f.split("/").pop()} prints no price in the platform's currency`, !/import \{[^}]*\bshopMoney\b[^}]*\} from "@\/lib\/store\/shop-money"/.test(code(f)))
    }
    check("checkout suggestions are in the checkout's own money", /money=\{money\}/.test(code("app/checkout/site/site-checkout.tsx")) && /money=\{money\}/.test(code("app/checkout/physical/physical-checkout.tsx")))
    check("the buy box is told its store's currency", /currency,\n/.test(code("app/api/physical/storefront/product/route.ts")) && /useBoxMoney\(data\?\.currency\)/.test(code("components/physical/buy-box.tsx")))
    check("an email's product block carries the store's currency", /priceLabel\(p\.price_cents, currency\)/.test(code("components/email/compose/panels.tsx")))
    check("a receipt that could not be read is in the store's currency", /readStoreCurrency\(admin, params\.creatorId\)/.test(code("lib/email.tsx")))

    const { shopMoneyIn } = await import("@/lib/store/shop-money")
    check("500 in a lei store reads as lei, never dollars", /lei|RON/.test(shopMoneyIn(500, "RON")) && !/\$/.test(shopMoneyIn(500, "RON")))
    const { listPrice } = await import("@/lib/pricing/list-price")
    check("an Explore card in a lei store says lei", !/\$/.test(listPrice({ price_cents: 4900, currency: "RON" }).main))
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
