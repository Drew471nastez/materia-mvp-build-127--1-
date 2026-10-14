/**
 * Round AB: a website in more than one language (Settings › Markets and
 * languages). Language tags and addresses, the store's settings checked on
 * the server, translations keyed, hashed, laid over a page and never an AI
 * draft on the live site, money converted only with fresh rates, the proxy's
 * /fr/… routing, and the wiring that puts it all on the live page.
 *
 *   npx tsx tests/markets.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { storeChargeCurrency } from "@/lib/payments/fees/currency-rules"
import { baseLanguage, dirOf, languageCountry, languageName, localeFromPath, localizedPath, normalizeLocale, preferredLocale } from "@/lib/markets/locales"
import { convertMinor, formatMinor, chargeNote, fxFresh, minorUnits, type FxRates } from "@/lib/markets/money"
import { defaultLocalization, isLocalized, marketForCountry, publishedLanguages, validateLocalization } from "@/lib/markets/model"
import { isTranslationKey, localizeCards, localizeMenus, localizeTheme, menuTranslatables, seoTranslatables, localizeRecord, localizeSections, sectionKey, blockKey, sourceHash, statusOf, translatablesOf, translationMap, type TranslationRow } from "@/lib/markets/translate"
import { siteNameIn, siteRouteInLanguage, splitSiteName } from "@/lib/markets/site-name"
import { parseEcbDaily } from "@/lib/markets/fx-server"
import { sitemapXml } from "@/lib/website-builder/site-seo"
import { localizedHref } from "@/components/website-builder/theme/language-switch"
import type { SectionInstance } from "@/lib/website-builder/types"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

console.log("\nLanguages and their addresses\n")
{
  check("tags in their canonical spelling", normalizeLocale("pt-br") === "pt-BR" && normalizeLocale("EN") === "en" && normalizeLocale("zh_hant") === "zh-Hant")
  check("  and what is not a tag is not one", normalizeLocale("about") === null && normalizeLocale("") === null && normalizeLocale(42) === null && normalizeLocale("<script>") === null)
  check("the base language and the direction", baseLanguage("pt-BR") === "pt" && dirOf("ar") === "rtl" && dirOf("he") === "rtl" && dirOf("fr") === "ltr")
  check("a language named in its own words, and in the creator's", languageName("fr") === "Français" && languageName("de", "en") === "German")
  check("/fr/products/mug is French, and /about is never read as a language", JSON.stringify(localeFromPath("/fr/products/mug", ["fr"])) === JSON.stringify({ locale: "fr", rest: "/products/mug" }) && localeFromPath("/about", ["fr"]) === null)
  check("  a language not published is just a path", localeFromPath("/de/x", ["fr"]) === null)
  check("the default language keeps its address; another gets its prefix", localizedPath("/products/mug", "en", "en") === "/products/mug" && localizedPath("/", "fr", "en") === "/fr" && localizedPath("/about", "pt-BR", "en") === "/pt-br/about")
  check("the browser's language is a suggestion among the published ones", preferredLocale("de-CH,de;q=0.9,fr;q=0.5", ["en", "fr", "de"]) === "de" && preferredLocale("ja", ["en", "fr"]) === null)
}

console.log("\nThe store's settings, checked on the server\n")
{
  const ok = validateLocalization(
    {
      defaultLanguage: "en",
      languages: [{ code: "fr", published: true }, { code: "FR" }, { code: "de" }],
      markets: [
        { id: "home", name: "Home", countries: ["RO"], primary: true, currency: "EUR", adjustBps: 500 },
        { id: "eu", name: "Europe", countries: ["fr", "DE"], currency: "EUR", language: "fr", rounding: "nine_nine" },
      ],
    },
    { baseCurrency: "RON" },
  )
  check("languages cleaned: duplicates and the default dropped, unpublished unless said", ok.ok && ok.value.languages.length === 2 && ok.value.languages[0].published && !ok.value.languages[1].published, ok)
  check("the home market sells in the store's own currency, at its own prices", ok.ok && ok.value.markets[0].currency === null && ok.value.markets[0].adjustBps === 0)
  check("countries upper cased", ok.ok && ok.value.markets[1].countries.join() === "FR,DE")
  const twice = validateLocalization({ defaultLanguage: "en", markets: [{ id: "a", name: "A", countries: ["FR"], primary: true }, { id: "b", name: "B", countries: ["FR"] }] }, { baseCurrency: "USD" })
  check("a country in two markets is refused, in plain words", twice.ok === false && /two markets/.test(twice.error))
  const noLang = validateLocalization({ defaultLanguage: "en", markets: [{ id: "a", name: "A", primary: true }, { id: "b", name: "B", language: "it" }] }, { baseCurrency: "USD" })
  check("a market's language must be one of the website's", noLang.ok === false && /add it to the website's languages/.test(noLang.error))
  check("  and exactly one home market", !validateLocalization({ defaultLanguage: "en", markets: [{ id: "a", name: "A" }] }, { baseCurrency: "USD" }).ok)
  const none = defaultLocalization("ro", "ro")
  check("nothing set is a website exactly as today", !isLocalized(none) && none.markets.length === 1 && none.markets[0].countries[0] === "RO" && publishedLanguages(none).join() === "ro")
  check("a country with no market of its own falls to home", ok.ok && marketForCountry(ok.value, "JP").id === "home" && marketForCountry(ok.value, "de").id === "eu")
}

console.log("\nMoney: converted only with fresh rates, never invented\n")
{
  const fx: FxRates = { asOf: "2026-10-09", rates: { USD: 1.1, RON: 5, JPY: 160 } }
  const now = Date.parse("2026-10-11T12:00:00Z")
  check("minor units from the currency itself", minorUnits("JPY") === 0 && minorUnits("EUR") === 2 && minorUnits("KWD") === 3)
  check("RON 50.00 is EUR 10.00", convertMinor(5000, "RON", "EUR", fx, { now }) === 1000)
  check("  and ¥1600 for EUR 10.00, in whole yen", convertMinor(1000, "EUR", "JPY", fx, { now }) === 1600)
  check("rounding to .99 and to whole units", convertMinor(1020, "EUR", "USD", fx, { now, rounding: "nine_nine" }) === 1199 && convertMinor(1020, "EUR", "USD", fx, { now, rounding: "whole" }) === 1200)
  check("a market's adjustment before rounding", convertMinor(1000, "EUR", "USD", fx, { now, adjustBps: 1000 }) === 1210)
  check("stale rates convert nothing", convertMinor(1000, "EUR", "USD", fx, { now: Date.parse("2026-10-20T00:00:00Z") }) === null && !fxFresh(fx, Date.parse("2026-10-20T00:00:00Z")))
  check("  and a currency with no rate converts nothing", convertMinor(1000, "EUR", "GBP", fx, { now }) === null)
  check("the same currency is the same amount, rates or not", convertMinor(1234, "USD", "USD", null) === 1234)
  check("written the visitor's way", formatMinor(2500, "EUR", "de").replace(/\s/g, " ") === "25,00 €" && formatMinor(2500, "JPY", "en") === "¥2,500")
  check("the buyer is told before paying when the charge differs", chargeNote("EUR", "RON") !== null && chargeNote("RON", "RON") === null)
  const xml = `<gesmes:Envelope><Cube><Cube time='2026-10-09'><Cube currency='USD' rate='1.1'/><Cube currency='JPY' rate='160'/><Cube currency='RON' rate='5'/><Cube currency='GBP' rate='0.85'/><Cube currency='CHF' rate='0.94'/></Cube></Cube></gesmes:Envelope>`
  const parsed = parseEcbDaily(xml)
  check("the ECB's daily file read", parsed?.asOf === "2026-10-09" && parsed.rates.RON === 5 && Object.keys(parsed.rates).length === 5, parsed)
  check("  and a broken one is not", parseEcbDaily("<html>error</html>") === null)
}

console.log("\nTranslations: keyed, hashed, laid over, approved only on the live site\n")
{
  const fields = (t: string) => (t === "hero" ? [{ id: "heading", type: "text", label: "Heading" }, { id: "image", type: "image", label: "Image" }, { id: "body", type: "richtext", label: "Body" }] : undefined)
  const blockFields = (st: string, bt: string) => (st === "hero" && bt === "button" ? [{ id: "label", type: "text", label: "Label" }] : undefined)
  const sections = [
    { id: "s1", type: "hero", settings: { heading: "Hello", image: "/a.png", body: "<p>Hi <b>there</b></p>" }, blocks: [{ id: "b1", type: "button", settings: { label: "Shop now" } }] },
  ] as unknown as SectionInstance[]
  const items = translatablesOf(sections, fields as never, blockFields as never)
  check("every text field and block, never a picture", items.map((i) => i.key).join() === "section:s1:heading,section:s1:body,block:s1:b1:label", items.map((i) => i.key))
  check("keys are what the database accepts", isTranslationKey(sectionKey("s1", "heading")) && isTranslationKey(blockKey("s1", "b1", "label")) && isTranslationKey("product:0a8f2c1e-1b2c-4d5e-8f90-123456789abc:title") && !isTranslationKey("drop table") && !isTranslationKey("section:../x"))
  const row = (key: string, value: string, source: string, status: TranslationRow["status"] = "approved"): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status, source: "manual" })
  const map = translationMap([row("section:s1:heading", "Bonjour", "Hello"), row("block:s1:b1:label", "Acheter", "Shop now", "draft")])
  const live = localizeSections(sections, map, fields as never, blockFields as never, { approvedOnly: true })
  check("the approved one laid over", (live[0].settings as Record<string, unknown>).heading === "Bonjour")
  check("  an AI draft never on the live site", (live[0].blocks![0].settings as Record<string, unknown>).label === "Shop now")
  check("  the original untouched, and untranslated text stays as it is", (sections[0].settings as Record<string, unknown>).heading === "Hello" && (live[0].settings as Record<string, unknown>).body === "<p>Hi <b>there</b></p>")
  check("nothing to lay over returns the very same list", localizeSections(sections, new Map(), fields as never, blockFields as never) === sections)
  check("status: missing, done, changed after it was written, draft", statusOf(undefined, "x") === "missing" && statusOf(row("k", "v", "Hello"), "Hello") === "done" && statusOf(row("k", "v", "Hello"), "Hello!") === "outdated" && statusOf(row("k", "v", "Hello", "draft"), "Hello") === "draft")
  const id = "0a8f2c1e-1b2c-4d5e-8f90-123456789abc"
  const p = localizeRecord({ id, title: "Mug", price: 10 }, `product:${id}`, ["title"], translationMap([row(`product:${id}:title`, "Tasse", "Mug")]))
  check("a product's title in the language", p.title === "Tasse" && p.price === 10)
}

console.log("\nMenus and search engine text\n")
{
  const menus = { "main-menu": { title: "Main menu", links: [{ title: "Shop", url: "/products", links: [{ title: "Mugs", url: "/collections/mugs" }] }, { title: "About", url: "/about" }] } }
  const items = menuTranslatables(menus)
  check("every link of every menu, nested ones too, keyed by position", items.map((i) => i.key).join() === "menu:main-menu:0,menu:main-menu:0.0,menu:main-menu:1" && items.every((i) => isTranslationKey(i.key)), items.map((i) => i.key))
  const row = (key: string, value: string, source: string, status: TranslationRow["status"] = "approved"): TranslationRow => ({ key, value, sourceHash: sourceHash(source), status, source: "manual" })
  const map = translationMap([row("menu:main-menu:0", "Boutique", "Shop"), row("menu:main-menu:0.0", "Tasses", "Mugs"), row("menu:main-menu:1", "À propos", "Contact")])
  const out = localizeMenus(menus, map, { approvedOnly: true })
  check("a link in the language", out["main-menu"].links[0].title === "Boutique" && out["main-menu"].links[0].links![0].title === "Tasses" && out["main-menu"].links[0].url === "/products")
  check("  a translation written for another title (a reordered menu) is not laid over", out["main-menu"].links[1].title === "About")
  const theme = { seo_title: "Mugs from Bucharest", seo_description: "Handmade", page_seo: { about: { title: "About us", description: "Who we are" } }, menus }
  const seo = seoTranslatables(theme)
  check("the website's and each page's search engine text", seo.map((i) => i.key).join() === "page:home:seo_title,page:home:seo_description,page:about:seo_title,page:about:seo_description" && seo.every((i) => isTranslationKey(i.key)))
  const lt = localizeTheme(theme, translationMap([row("page:home:seo_title", "Tasses de Bucarest", "Mugs from Bucharest"), row("page:about:seo_title", "À propos de nous", "About us"), row("menu:main-menu:0", "Boutique", "Shop")]), { approvedOnly: true })
  check("the theme in the language: its title, a page's title, its menus; the rest as it was", lt.seo_title === "Tasses de Bucarest" && (lt.page_seo.about as { title: string }).title === "À propos de nous" && (lt.page_seo.about as { description: string }).description === "Who we are" && lt.menus["main-menu"].links[0].title === "Boutique" && lt.seo_description === "Handmade")
  check("  and the original untouched", theme.seo_title === "Mugs from Bucharest" && theme.menus["main-menu"].links[0].title === "Shop")
  const xml = sitemapXml([{ loc: "https://a.shop/fr/about", alternates: [{ hreflang: "en", href: "https://a.shop/about" }, { hreflang: "fr", href: "https://a.shop/fr/about" }, { hreflang: "x-default", href: "https://a.shop/about" }] }])
  check("the sitemap names every language of a page", /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/.test(xml) && /<xhtml:link rel="alternate" hreflang="fr" href="https:\/\/a\.shop\/fr\/about"\/>/.test(xml) && /hreflang="x-default"/.test(xml))
  check("  and one in one language is as it was", !/xhtml/.test(sitemapXml([{ loc: "https://a.shop/" }])))
}

console.log("\nThe live address: /fr/… to the same page in French\n")
{
  check("the name carries the language and comes back out", siteNameIn("andrew", "pt-BR") === "andrew~pt-br" && JSON.stringify(splitSiteName("andrew~fr")) === JSON.stringify({ name: "andrew", locale: "fr", market: null }) && splitSiteName("andrew").locale === null)
  check("  an encoded mark too, and junk after it is no language", splitSiteName("andrew%7Efr").locale === "fr" && splitSiteName("andrew~<x>").locale === null)
  const P = ["fr", "pt-BR"]
  const page = (path: string) => siteRouteInLanguage("andrew", path, P)
  check("pages, products, collections and search drawn in it", page("/fr")?.kind === "page" && (page("/fr/about") as { path: string }).path === "/w/andrew~fr/about" && (page("/fr/products/mug") as { path: string }).path === "/w/andrew~fr/products/mug" && page("/fr/search")?.kind === "page" && (page("/pt-br/collections/x") as { path: string }).path === "/w/andrew~pt-br/collections/x")
  check("the cart, wishlist and sign in in the language; checkout and orders sent on", /* Changed on purpose (round AE): no more English cart under /fr. */ (page("/fr/cart") as { path: string }).path === "/w/andrew~fr/cart" && (page("/fr/account/login") as { path: string }).path === "/w/andrew~fr/account/login" && (page("/fr/wishlist") as { path: string }).path === "/w/andrew~fr/wishlist" && page("/fr/checkout")?.kind === "redirect" && (page("/fr/account/orders") as { to: string }).to === "/account/orders")
  check("a language not published, or a plain page, is left alone", page("/de/about") === null && page("/about") === null && siteRouteInLanguage("andrew", "/fr", []) === null)
  const o = "https://shop.example"
  check("a page's links keep its language", localizedHref("/about", "fr", "en", ["en", "fr"], o) === "/fr/about" && localizedHref(`${o}/products/mug?x=1#top`, "fr", "en", ["en", "fr"], o) === "/fr/products/mug?x=1#top")
  check("  the cart too, but not checkout, a file, another site or an anchor", /* Changed on purpose (round AE): the cart is drawn in the language. */ localizedHref("/cart", "fr", "en", ["en", "fr"], o) === "/fr/cart" && localizedHref("/checkout?items=1", "fr", "en", ["en", "fr"], o) === null && localizedHref("/a.pdf", "fr", "en", ["en", "fr"], o) === null && localizedHref("https://other.com/x", "fr", "en", ["en", "fr"], o) === null && localizedHref("#top", "fr", "en", ["en", "fr"], o) === null)
  check("  and a link already in the language stays", localizedHref("/fr/about", "fr", "en", ["en", "fr"], o) === null)
  const sw = read("components/website-builder/theme/language-switch.tsx")
  check("a search box (a GET form) keeps the language; a form that posts is left alone", /form\[action\]/.test(sw) && /!== "get"\) return/.test(sw) && /attributeFilter: \["href", "action"\]/.test(sw))
}

console.log("\nWired into the website\n")
{
  const proxy = read("proxy.ts")
  check("the proxy asks only for an address shaped like a language, and holds the answer", /LANGUAGE_FIRST\.test\(pathname\)/.test(proxy) && /localizationHeld/.test(proxy) && (proxy.match(/await inSiteLanguage\(/g) ?? []).length === 2)
  check("  and the imported theme's pages keep their own caching (no no-store over the handler)", !/async function compatRewrite[\s\S]{0,1200}r\.headers\.set\("Cache-Control"/.test(proxy))
  const site = read("lib/website-builder/published-site.ts")
  check("the published page laid over before it is drawn", /publishedSiteByName\(name: string, pageKey = "home", locale: string \| null = null, market: string \| null = null\)/.test(site) && /localizer\.sections\(original, site\.sources\)/.test(site))
  const live = read("lib/markets/live.ts")
  check("the menus and search engine text laid over on the live page and in its title", /localizer\.theme\(site\.themeSettings/.test(site) && /localizer\.theme\(/.test(read("app/(site)/w/[username]/render-site.tsx")) && /localizer\.theme\(ownSettings/.test(read("components/website-builder/theme/render-product.tsx")) && /inLanguage: localizer \?/.test(read("app/(site)/w/[username]/products/[slug]/page.tsx")))
  check("the Translate sheet lists the menus and the search engine text", /menuTranslatables\(/.test(read("lib/markets/server.ts")) && /seoTranslatables\(theme\)/.test(read("lib/markets/server.ts")))
  check("only approved translations, only a published language", /r\.status === "approved"/.test(live) && /langs\.others\.find/.test(live))
  for (const route of ["page.tsx", "[page]/page.tsx", "products/page.tsx", "products/[slug]/page.tsx", "collections/page.tsx", "collections/[handle]/page.tsx", "search/page.tsx"]) {
    const src = read(`app/(site)/w/[username]/${route}`)
    check(`  ${route} reads the language from the name`, /splitSiteName|renderSite\(/.test(src))
  }
  const render = read("app/(site)/w/[username]/render-site.tsx")
  check("hreflang for every language, x-default the website's own", /languages \? \{ languages \}/.test(render) && /x-default/.test(live))
  const theme = read("components/website-builder/theme/ThemePage.tsx")
  check("the page's lang and dir, and the language switch under the footer (never in the editor)", /storefront\?\.language\?\.code \?\?/.test(theme) && /storefront\?\.language && !storefront\.inEditor \? <LanguageSwitch/.test(theme))
  const form = read("components/app/settings-form-new.tsx")
  check("Settings › Languages & Currency, fetched ahead like the others", /* Changed on purpose (the owner: call it Languages & Currency). */ /id: "markets", label: "Languages & Currency"/.test(form) && /markets: \(\) => \["\/api\/store\/markets"\]/.test(form) && /panelTab === "markets" && <MarketsPanel \/>/.test(form))
  const panel = read("components/app/settings/markets-panel.tsx")
  check("Markets are live: the card is there for every store, no flag", /* Changed on purpose (round AE, then the owner: call it Markets & Currency). */ /title="Markets & Currency"\s*help="markets"/.test(panel) && !/MARKETS_ON/.test(panel))
  const draft = read("app/api/store/translations/draft/route.ts")
  check("AI drafts are rate limited and saved as drafts", /rateLimit|limit/i.test(draft) && /approved: false|ai: true/.test(draft))
  const sql = read("supabase/sql/run-now/136_markets_languages.sql")
  check("part 136: three tables, service role only, row level security on", /store_localization/.test(sql) && /site_translations/.test(sql) && /fx_rates/.test(sql) && (sql.match(/ENABLE ROW LEVEL SECURITY/gi) ?? []).length >= 3 && /REVOKE ALL/i.test(sql))
  check("  and its migration is the same file", sql === read("supabase/migrations/20270110_markets_languages.sql"))
  const vercel = read("vercel.json")
  check("the day's rates fetched by a cron, behind its secret", /\/api\/cron\/fx-rates/.test(vercel) && /CRON_SECRET/.test(read("app/api/cron/fx-rates/route.ts")))
}

console.log("\nRound AE: no more English corners, and the builder previews every language\n")
{
  const row2 = (key: string, value: string, status: "approved" | "draft" = "approved"): TranslationRow => ({ key, value, sourceHash: "", status, source: "manual" })
  const map = translationMap([row2("product:11111111-1111-4111-8111-111111111111:title", "Tasse"), row2("product:22222222-2222-4222-8222-222222222222:title", "Bol", "draft"), row2("ui:check_out", "Payer")])
  const cards = [{ id: "11111111-1111-4111-8111-111111111111", settings: { title: "Mug", price: "$10.00" } }, { id: "22222222-2222-4222-8222-222222222222", settings: { title: "Bowl", price: "$12.00" } }]
  const out = localizeCards(cards, map, { approvedOnly: true })
  check("product cards in the language: an approved title laid over, a draft not", out[0].settings.title === "Tasse" && out[1].settings.title === "Bowl" && out[1] === cards[1] && cards[0].settings.title === "Mug")
  check("the shop's words are translation keys", isTranslationKey("ui:check_out") && !isTranslationKey("ui:Check out"))
  const words = read("lib/markets/ui-words.ts")
  check("  the cart, buttons and notice read them", /cart_empty/.test(words) && /useWord\(\)/.test(read("components/website-builder/cart-page-body.tsx")) && /useWord\(\)/.test(read("components/website-builder/sections/renderers/HeaderSection.tsx")) && /useWord\(\)/.test(read("components/website-builder/theme/cart-notice.tsx")))
  for (const route of ["cart/page.tsx", "account/page.tsx", "account/login/page.tsx", "wishlist/page.tsx"]) {
    check(`  ${route} is drawn in the page's language`, /splitSiteName\(segment\)/.test(read(`app/(site)/w/[username]/${route}`)))
  }
  check("  the contact page too", /renderAccountPage\(username, "contact", \{ lang: \{ locale, market \} \}\)/.test(read("app/(site)/w/[username]/render-site.tsx")))
  const ctx = read("components/website-builder/theme/storefront-context.tsx")
  /* Changed on purpose (the owner: no "you'll pay in USD" notice in the cart drawer or the cart): said at checkout only. */
  check("the cart's amounts in the market's currency, as the cards are; what checkout charges in is said at checkout, not in the cart", /export function useMoney\(\)/.test(ctx) && /pricingFor\(display\.market, display\.base, display\.fx\)/.test(ctx) && !/useChargeNote\(\)/.test(read("components/website-builder/sections/renderers/HeaderSection.tsx")) && !/useChargeNote\(\)/.test(read("components/website-builder/cart-page-body.tsx")))
  check("  no hard-coded dollar sign left in the cart drawer or the cart page", !/function money\(cents: number\)/.test(read("components/website-builder/sections/renderers/HeaderSection.tsx")) && !/function money\(cents: number\)/.test(read("components/website-builder/cart-page-body.tsx")))
  check("  every builder page hands the conversion over", ["cart/page.tsx", "products/page.tsx", "search/page.tsx", "collections/page.tsx", "collections/[handle]/page.tsx", "render-account.tsx", "render-site.tsx"].every((f) => /display: localizer\?\.display/.test(read(`app/(site)/w/[username]/${f}`))))
  const api = read("app/api/store/translations/route.ts")
  check("the builder's preview reads the approved values only, with each one's original", /searchParams\.get\("values"\) === "1"/.test(api) && /r\.status === "approved" && r\.value/.test(api) && /h: r\.sourceHash/.test(api))
  const hook = read("components/website-builder/use-preview-language.ts")
  check("  read again when the builder comes back into view, remembered for the tab", /visibilitychange/.test(hook) && /sessionStorage/.test(hook))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("  the canvas lays it over its sections, menus and products, and shows the shop's words", /localizeSections\(\s*drawnSections,\s*previewMap/.test(editor) && /localizeMenus\(canvasMenus/.test(editor) && /sections=\{drawnShown\}/.test(editor) && /words=\{previewLang\.words\}/.test(editor))
  check("  a language button beside the page switcher, and a phone's in the menu", /<PreviewLanguageSwitch lang=\{previewLang\} \/>/.test(editor) && /Preview in \$\{languageName\(next, "en"\)\}/.test(editor))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("  an imported theme's canvas too: its sections, menus, products, its own | t words and request.locale", /compatFields\(compatTheme\)/.test(canvas) && /compat-locale=/.test(canvas) && /i18n,/.test(canvas) && /withoutLanguage\(n\.href/.test(canvas))
  check("  the theme's words for one language, from its own files, behind the owner's sign in", /searchParams\.get\("compat-locale"\)/.test(read("app/api/website-builder/themes/[installId]/files/route.ts")))
  check("the field reader shared by the live site and the canvas", /export function compatFields/.test(read("lib/markets/compat-fields.ts")) && !/import "server-only"/.test(read("lib/markets/compat-fields.ts")) && /export \{ compatFields \}/.test(read("lib/markets/compat.ts")))
}

console.log("\nThis round: Translate waits for the language, flags, and the store's own currency at checkout\n")
{
  const panel = read("components/app/settings/markets-panel.tsx")
  const sheet = read("components/app/settings/translate-sheet.tsx")
  check("a language just added is read only once its save has landed (no more \"no text to translate yet\")",
    /setAdding\(code\)/.test(panel) && /waiting=\{!!translating && adding === translating\}/.test(panel) && /if \(!waiting\) void load\(locale\)/.test(sheet))
  check("  a language the server does not have is said, not drawn as an empty website", /if \(!r\.data\.locale\) return setError/.test(sheet))
  check("languages and markets show flags from the local sprite, never purple initials or emoji",
    /const flag = languageFlag\(code\)/.test(panel) && /<CountryFlag code=\{flag\}/.test(panel) && !/bg-\[#f1ecff\]/.test(panel) && !/fromCodePoint/.test(panel))
  check("  a language's flag: its region when the tag names one, else its usual country",
    languageCountry("pt-BR") === "BR" && languageCountry("fr") === "FR" && languageCountry("zh-Hant") === "TW" && languageCountry("zh-Hans") === "CN" && languageCountry("xx") === null)
  check("a store's own checkout charges in the store's currency when payments are set up for it",
    storeChargeCurrency("EUR") === "eur" && storeChargeCurrency("gbp") === "gbp" && storeChargeCurrency("JPY") === "jpy")
  const platform = process.env.NEXT_PUBLIC_PLATFORM_CURRENCY === "usd" ? "usd" : "ron"
  check("  and the platform's for one it is not (or nothing set)", storeChargeCurrency("XYZ") === platform && storeChargeCurrency("CHF") === platform && storeChargeCurrency(null) === platform)
  check("  the website's basket, its physical checkout and the old cart route all use it",
    /storeChargeCurrencyFor\(admin, site\.creatorId\)/.test(read("app/api/checkout/site/route.ts")) &&
    /storeChargeCurrencyFor\(admin, creatorId\)/.test(read("app/api/checkout/cart/route.ts")) &&
    /storeChargeCurrency\(creator\.payout_currency\)/.test(read("lib/physical/checkout-server.ts")))
  check("  the checkout pages show that currency, and the card form is drawn for it",
    /currency=\{currency\}/.test(read("app/checkout/site/page.tsx")) && /currency=\{currency\}/.test(read("app/checkout/physical/page.tsx")) &&
    /\(props\.currency \|\| CHECKOUT_CURRENCY\)\.toLowerCase\(\)/.test(read("app/checkout/parts/stripe-pay.tsx")))
  check("  a basket's order rows say what Stripe charged, not a fixed usd",
    /currency: \(ctx\.currency \|\| "usd"\)\.toLowerCase\(\)/.test(read("lib/checkout/fulfil-cart-item.ts")) && /currency: session\.currency \?\? pi\?\.currency \?\? null/.test(read("lib/checkout/fulfil-cart-session.ts")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
