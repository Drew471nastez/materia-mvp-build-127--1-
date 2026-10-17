/**
 * Translations that keep their word (lib/markets): what the merchant writes
 * is never replaced by Storelib AI, an approved AI draft stays labelled as
 * AI's, Storelib AI's translation stops showing once its original changes
 * while the merchant's own stays live and is flagged for review, collections
 * show in the page's language, and a card's description is the translated
 * one, made plain as the card's own is, in the editor and on the live site.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isTranslationKey, needsReview, localizeCards, localizeOptions, localizeRecord, localizeSections, localizeTheme, optionKey, optionTranslatables, sourceHash, themeTextTranslatables, translationMap, valueFor, type TranslationRow } from "@/lib/markets/translate"
import { saveTranslations } from "@/lib/markets/server"
import { plainDescription } from "@/lib/products/plain-description"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const P1 = "a0000000-0000-4000-8000-0000000000a1"
const row = (key: string, value: string, source: string, extra: Partial<TranslationRow> = {}): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status: "approved", source: "manual", ...extra })

async function main() {
  console.log("\nStorelib AI's translation shows only while it was written for the original as it is; the merchant's own stays")
  const map = translationMap([row("section:s1:heading", "Bonjour", "Hello"), row(`product:${P1}:title`, "Tasse", "Mug")])
  const aiMap = translationMap([row("section:s1:heading", "Bonjour", "Hello", { source: "ai" })])
  check("the same original: shown", valueFor(map, "section:s1:heading", { approvedOnly: true, fresh: true }, "Hello") === "Bonjour")
  check(
    "Storelib AI's, the original changed since: the new original shows until the automatic run writes it again",
    /* Changed on purpose (translate changes automatically, owner edits protected): this was every translation; it is Storelib AI's only now. */
    valueFor(aiMap, "section:s1:heading", { approvedOnly: true, fresh: true }, "Hello there") === null,
  )
  check(
    "the merchant's own, the original changed since: still shown as they wrote it, and listed as Needs review",
    /* Changed on purpose (translate changes automatically, owner edits protected): it used to be hidden, which put the original language back into their translated page. */
    valueFor(map, "section:s1:heading", { approvedOnly: true, fresh: true }, "Hello there") === "Bonjour" && needsReview(map.get("section:s1:heading"), "Hello there") && !needsReview(map.get("section:s1:heading"), "Hello") && !needsReview(aiMap.get("section:s1:heading"), "Hello there"),
  )
  check("without fresh (the Translate sheet), it is still there to see and update", valueFor(map, "section:s1:heading", { approvedOnly: true }, "Hello there") === "Bonjour")
  const sections = [{ id: "s1", type: "rich_text", settings: { heading: "Hello there" }, blocks: [] }] as unknown as SectionInstance[]
  const headingField = () => [{ id: "heading", type: "text", label: "Heading" }] as never
  const laid = localizeSections(sections, aiMap, headingField, () => undefined, { approvedOnly: true, fresh: true })
  /* Changed on purpose (translate changes automatically, owner edits protected): Storelib AI's translation here; the merchant's own case is the next check. */
  check("a section whose heading was edited shows the edit, not Storelib AI's old translation", (laid[0].settings as { heading: string }).heading === "Hello there")
  const kept = localizeSections(sections, map, headingField, () => undefined, { approvedOnly: true, fresh: true })
  check("  the merchant's own translation of it stays on the page until they look at it", (kept[0].settings as { heading: string }).heading === "Bonjour")
  check("a record whose title is unchanged is translated", localizeRecord({ title: "Mug" }, `product:${P1}`, ["title"], map, { approvedOnly: true, fresh: true }).title === "Tasse")
  check("the live site and imported themes lay them over this way", /const opts = \{ approvedOnly: true, fresh: true \}/.test(read("lib/markets/live.ts")) && /const opts = \{ approvedOnly: true, fresh: true \}/.test(read("lib/markets/compat.ts")))
  /* Changed on purpose (translation coverage): an imported theme's canvas lays its products over with compat-fields.ts compatCardIn, the live site's own function, whose default options are these. */
  check("and so does the editor's preview, so both agree", (read("app/website-builder/editor/[installId]/page.tsx").match(/approvedOnly: true, fresh: true/g) ?? []).length >= 3 && /const LIVE = \{ approvedOnly: true, fresh: true \}/.test(read("lib/markets/compat-fields.ts")) && /compatCardIn\(/.test(read("components/website-builder/compat/compat-canvas.tsx")))

  console.log("\nA card's description")
  const html = "<p>Hand <strong>thrown</strong> stoneware.</p><p>Dishwasher safe.</p>"
  const cardMap = translationMap([row(`product:${P1}:title`, "Tasse", "Mug"), row(`product:${P1}:description`, "<p>Grès <strong>tourné</strong> à la main.</p><p>Va au lave-vaisselle.</p>", html)])
  const [card] = localizeCards([{ id: P1, settings: { title: "Mug", description: plainDescription(html), price: "$40.00" } }], cardMap, { approvedOnly: true, fresh: true })
  const s = card.settings as { title: string; description: string; price: string }
  check("the title, translated", s.title === "Tasse")
  check("the description, translated and plain like the card's own (never HTML in a card)", s.description === "Grès tourné à la main.\nVa au lave-vaisselle.", s.description)
  check("the price untouched", s.price === "$40.00")
  /* Changed on purpose (translation coverage): an imported theme's card is laid over in compat-fields.ts compatCardIn, which the live site and the canvas both call. */
  check("the live site's cards use the same function as the editor's", /* Changed on purpose (round V8): and the products shown as written in every language. */ /const worded = localizeCards\(\[c\], map, opts(, original)?\)\[0\]/.test(read("lib/markets/live.ts")) && /localizeCards\(\[\{ id: c\.id, settings: c\.settings \}\], map, opts\)/.test(read("lib/markets/compat-fields.ts")) && /const worded = (original\.has\(c\.id\) \? c : )?compatCardIn\(c, map, opts\)/.test(read("lib/markets/compat.ts")))

  console.log("\nCollections in the page's language")
  const live = read("lib/markets/live.ts")
  check("the live site translates a collection's name and description", /collection\(c\) \{/.test(live) && /`collection:\$\{c\.id\}`/.test(live))
  check("its own page uses them", /const collection = localizer \? localizer\.collection\(inIt\.collection\) : inIt\.collection/.test(read("app/(site)/w/[username]/collections/[handle]/page.tsx")))
  check("every live page hands its language to the collections it lists", ["search/page.tsx", "products/page.tsx", "collections/page.tsx", "render-account.tsx", "collections/[handle]/page.tsx"].every((f) => /\{ cached: true, localizer \}/.test(read(`app/(site)/w/[username]/${f}`))))
  check("  where the page's data lays them over", /collections: collections && opts\.localizer \?/.test(read("lib/website-builder/published-site.ts")))
  /* Changed on purpose (translation coverage): the overlay moved to compat-fields.ts compatCollectionIn, which the builder's canvas calls too. */
  check("imported themes too", /`collection:\$\{c\.id\}`/.test(read("lib/markets/compat-fields.ts")) && /compatCollectionIn\(c, map, opts\)/.test(read("lib/markets/compat.ts")))

  console.log("\nThe theme's own words")
  const fields = [{ id: "brand_name", type: "text", label: "Store name" }, { id: "tagline", type: "text", label: "Tagline" }, { id: "cookie_banner_text", type: "textarea", label: "Banner text" }, { id: "badge_sale_bg", type: "color", label: "Sale badge colour" }] as never
  const theme = { brand_name: "Clay Studio", tagline: "Made by hand", cookie_banner_text: "We use cookies.", badge_sale_bg: "#ff0000" }
  const items = themeTextTranslatables(theme, fields)
  check("the tagline and the cookie banner are listed to translate", items.map((i) => i.key).join() === "theme:tagline,theme:cookie_banner_text", items.map((i) => i.key))
  check("  never the shop's name, never a colour", !items.some((i) => i.key === "theme:brand_name" || i.key === "theme:badge_sale_bg"))
  const themeMap = translationMap([row("theme:tagline", "Fait main", "Made by hand"), row("theme:cookie_banner_text", "Nous utilisons des cookies.", "We use cookies (old).", { source: "ai" })])
  const shown = localizeTheme(theme, themeMap, { approvedOnly: true, fresh: true })
  check("laid over on the page", shown.tagline === "Fait main")
  /* Changed on purpose (translate changes automatically, owner edits protected): Storelib AI's; the merchant's own stays, as above. */
  check("  Storelib AI's written for an older text is not", shown.cookie_banner_text === "We use cookies.")
  check("the translations list reads them from the theme settings schema", /themeTextTranslatables\(theme, THEME_SETTINGS_GROUPS\.flatMap/.test(read("lib/markets/server.ts")))
  check("every live page lays the theme over in its language, not only the home page", ["products/page.tsx", "collections/page.tsx", "collections/[handle]/page.tsx", "search/page.tsx", "cart/page.tsx", "render-account.tsx"].every((f) => /themeSettings: localizer\.theme\(/.test(read(`app/(site)/w/[username]/${f}`))))
  check("and the editor's language preview does too", /* Changed on purpose (merge with main): the theme in the language and the market previewed. */ /const canvasThemeShown = useMemo\(\(\) => \{\s*const localized = previewMap \? \(localizeTheme\(/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /theme=\{canvasThemeShown\}/.test(read("app/website-builder/editor/[installId]/page.tsx")))

  console.log("\nOptions and variants")
  const listed = optionTranslatables([[{ name: "Size", values: ["Small", "Large"] }, { name: "Colour", values: ["Red"] }], [{ name: "Size", values: ["Small"] }]])
  check("each option word is listed once for the whole shop", listed.map((i) => i.source).join() === "Size,Small,Large,Colour,Red" && listed.every((i) => isTranslationKey(i.key)), listed.map((i) => i.source))
  const optMap = translationMap([row(optionKey("Size"), "Taille", "Size"), row(optionKey("Small"), "Petit", "Small"), row(optionKey("Red"), "Rouge", "Red"), row(optionKey("Large"), "Grand", "Large (old)", { source: "ai" })])
  const [shirt] = localizeCards([{ id: P1, settings: { title: "Tee", options: [{ name: "Size", values: ["Small", "Large"] }, { name: "Colour", values: ["Red"] }], variants: [{ id: "v1", name: "Small / Red", options: ["Small", "Red", null], price: "$20.00" }, { id: "v2", name: "Large / Red", options: ["Large", "Red", null] }, { id: "v3", name: "Gift box", options: ["Small", "Red", null] }] } }], optMap, { approvedOnly: true, fresh: true })
  const ss = shirt.settings as { options: { name: string; values: string[] }[]; variants: { id: string; name: string; options: (string | null)[]; price?: string }[] }
  check("a card's option names and values in the language", ss.options[0].name === "Taille" && ss.options[0].values.join() === "Petit,Large" && ss.options[1].values[0] === "Rouge", ss.options)
  /* Changed on purpose (translate changes automatically, owner edits protected): Storelib AI's; the merchant's own stays, as above. */
  check("  Storelib AI's written for an older word is not shown", ss.options[0].values[1] === "Large")
  check("a variant named from its values is named again from theirs, its id and price kept", ss.variants[0].name === "Petit / Rouge" && ss.variants[0].id === "v1" && ss.variants[0].price === "$20.00" && ss.variants[0].options.join() === "Petit,Rouge,", ss.variants[0])
  check("  one the merchant named themselves keeps its name, its values translated", ss.variants[2].name === "Gift box" && ss.variants[2].options[0] === "Petit")
  check("the product page's data the same way", (localizeOptions({ options: [{ name: "Size", values: ["Small"] }], variants: [{ id: "v", name: "Small", options: ["Small", null, null] }] }, optMap, { approvedOnly: true, fresh: true }) as { variants: { name: string }[] }).variants[0].name === "Petit")
  check("  on the live product page, and in the editor's preview", /productData = localizer \? localizer\.options\(productRead\)/.test(read("components/website-builder/theme/render-product.tsx")) && /* Changed on purpose (merge with main): the market's conversion is handed over after (drawnShown). */ /_product_data: localizeOptions\(data, previewMap/.test(read("app/website-builder/editor/[installId]/page.tsx")))
  check("the translations list has them, read from the products' options", /optionTranslatables\(lists\)/.test(read("lib/markets/server.ts")) && /title: "Product options"/.test(read("lib/markets/server.ts")))

  console.log("\nStorelib AI never replaces what the merchant wrote")
  const draft = read("app/api/store/translations/draft/route.ts")
  check("the merchant's own are never sent to AI, outdated or not", /if \(row\?\.source === "manual"\) return false/.test(read("lib/markets/translate.ts")) && /* Changed on purpose (checkout, currency and translation overhaul): the rule now lives in the shared round. */ /aiMayWrite\(map\.get\(t\.key\), t\.source\)/.test(read("lib/markets/translation-press.ts")))
  check("its write keeps the merchant's, read again just before writing", /* Changed on purpose (checkout, currency and translation overhaul): in the shared round. */ /saveTranslations\(db, creatorId, locale, items, userId, \{ keepManual: true \}\)/.test(read("lib/markets/translation-press.ts")))
  /* The write, against a table where the merchant saved "Bonjour" a moment ago. */
  const written: Record<string, unknown>[] = []
  const db = {
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ["select", "eq", "in", "delete"]) q[m] = () => q
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ key: "section:s1:heading" }], error: null }).then(ok)
      q.upsert = (rows: Record<string, unknown>[]) => { written.push(...rows); return Promise.resolve({ error: null }) }
      return q
    },
  }
  const out = await saveTranslations(db as never, "c1", "fr", [{ key: "section:s1:heading", value: "Salut", source: "Hello", approved: false, ai: true }, { key: "section:s2:heading", value: "Merci", source: "Thanks", approved: false, ai: true }], null, { keepManual: true }).catch((e) => ({ ok: false, error: String(e) }))
  check("the one the merchant wrote is left, the other is drafted", written.length === 1 && written[0].key === "section:s2:heading" && written[0].source === "ai", { written, out })
  const sheet = read("components/app/settings/translate-sheet.tsx")
  check("an AI draft approved as it stands stays Storelib AI's; edited, it is the merchant's", /ai: i\.ai && !changed\.includes\(i\.key\)/.test(sheet))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
