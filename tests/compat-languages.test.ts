/**
 * Round AC: an imported Shopify theme in the website's languages, and its
 * password page. The theme's own words in French (locales/fr.json), its
 * language selector offering the website's languages and taking the visitor
 * to /fr/…, routes and request.locale in the page's language, translations
 * laid over its sections with its own schemas, and the password page drawn by
 * the theme (never blank), posting to Storelib, without Shopify's mark.
 *
 *   node scripts/run-push-tests.mjs (registered there)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CompatTheme, wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"
import { answer, withoutShopifyMark, type SiteData } from "@/lib/storelib-theme/compat/site"
import { localeRoot, localizationObject, routesFor } from "@/lib/storelib-theme/compat/objects"
import { imageSrc } from "@/lib/storelib-theme/compat/filters"
import { OUTPUT } from "@/lib/storelib-theme/compat/runtime"
import { pageAskedAsSubresource } from "@/lib/security/subresource-guard"
import { compatFields } from "@/lib/markets/compat"
import { linkLanguageScript } from "@/lib/markets/link-script"
import { localizeSections, sourceHash, translatablesOf, translationMap, type TranslationRow } from "@/lib/markets/translate"
import type { SectionInstance } from "@/lib/website-builder/types"
import { convertPriceText, convertedCents, moneyFormatFor, pricingFor } from "@/lib/markets/pricing"
import { siteNameIn, siteRouteInLanguage, splitSiteName } from "@/lib/markets/site-name"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const section = (type: string, markup: string, settings: unknown[] = [], blocks: unknown[] = []) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings, blocks })}\n</schema>\n`

const files: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html lang="{{ request.locale.iso_code }}"><head></head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main><a class="home" href="{{ routes.root_url }}">home</a><a class="cart" href="{{ routes.cart_url }}">cart</a>{% form 'localization' %}{% for l in localization.available_languages %}<button name="language_code" value="{{ l.iso_code }}">{{ l.endonym_name }}</button>{% endfor %}<input type="hidden" name="return_to" value="{{ request.path }}">{% endform %}</body></html>`),
  "layout/password.storelib": wrapCompatTemplate(`<html><body><main>{{ content_for_layout }}</main><footer><span>{{ 'general.password_page.powered_by_shopify_html' | t }}</span><a href="https://www.shopify.com" class="logo"><svg class="icon-shopify"><path d="M1"/></svg></a><p class="admin">{{ 'general.password_page.admin_link_html' | t }}</p></footer></body></html>`),
  "templates/password.json": JSON.stringify({ layout: "password", sections: {}, order: [] }),
  "sections/hdr.storelib": section("hdr", `<header class="hdr">{{ 'header.welcome' | t }} · {{ section.settings.heading }}</header>`, [{ id: "heading", type: "text", label: "t:sections.hdr.heading" }, { id: "image", type: "image_picker", label: "Image" }]),
  "sections/pw.storelib": section("pw", `<div class="pw">{% form 'storefront_password' %}{% if form.errors %}<p class="err">{{ form.errors.messages['form'] }}{{ form.errors | default_errors }}</p>{% endif %}<input type="password" name="password">{% endform %}</div>`),
  "locales/en.default.json": JSON.stringify({ header: { welcome: "Welcome" }, general: { password_page: { powered_by_shopify_html: "This shop will be powered by Shopify", admin_link_html: 'Are you the store owner? <a href="/admin">Log in here</a>' } } }),
  "locales/fr.json": JSON.stringify({ header: { welcome: "Bienvenue" } }),
  "locales/en.default.schema.json": JSON.stringify({ sections: { hdr: { heading: "Heading" } } }),
}

async function main() {
  const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
  const base: SiteData = {
    creatorId: "c",
    theme,
    pages: { home: [{ id: "h", type: "hdr", group: "header", settings: { heading: "Handmade mugs" } }], password: [{ id: "p", type: "pw" }] },
    products: [],
    collections: [],
    menus: {},
    shop: { name: "Mugs", currency: "RON", moneyFormat: "{{amount}} lei" },
    host: "mugs.storelib.com",
  }
  const get = async (site: SiteData, path: string, q = "") => answer(site, { method: "GET", path, query: new URLSearchParams(q), body: null, cart: [] })

  console.log("\nThe password page of an imported theme\n")
  {
    const page = await get(base, "/password", "return=%2Fproducts%2Fmug")
    const html = String(page.body)
    check("drawn by the theme, never a blank page", page.status === 200 && /class="pw"/.test(html) && /type="password"/.test(html), html.slice(0, 300))
    check("its form posts to Storelib's own password check, with the page to go back to", /action="\/api\/site-password"/.test(html) && /name="return" value="\/products\/mug"/.test(html))
    check("no Shopify on it: not its words, not its logo, not its admin link", !/powered by|www\.shopify\.com|icon-shopify|href="\/admin"/i.test(html), html.match(/<footer>[\s\S]*?<\/footer>/)?.[0])
    check("  \"Log in here\" is Storelib's owner sign in for this website", /href="https:\/\/[^"]*\/api\/site-password\/owner\?host=mugs\.storelib\.com&amp;return=%2Fproducts%2Fmug"/.test(html), html.match(/.{0,60}Log in here.{0,20}/)?.[0])
    check("never kept by any cache", /no-store/.test(String(page.headers?.["Cache-Control"])))
    const wrong = String((await get(base, "/password", "error=wrong&return=%2F")).body)
    check("a wrong password says so, in the theme's form errors", /That password is not right/.test(wrong))
    check("  and an error the address makes up prints nothing", !/<b>/.test(String((await get(base, "/password", "error=<b>x</b>")).body)))
    check("the mark is taken off a theme that draws it in its own markup", withoutShopifyMark(`<p>This shop will be powered by <a href="https://www.shopify.com/x"><svg class="shopify"></svg></a></p>`) === "<p></p>")
    const proxy = read("proxy.ts")
    check("the proxy draws the theme's password page in front of a protected imported website", /page = "\/password"/.test(proxy) && /query = `\?\$\{new URLSearchParams\(\{ return: `\$\{pathname\}\$\{search\}` \}\)/.test(proxy))
  }

  console.log("\nAn imported theme in the website's languages\n")
  {
    const i18n = { locale: "fr", defaultLanguage: "en", languages: ["en", "fr", "ro"] }
    const fr: SiteData = { ...base, i18n }
    const html = String((await get(fr, "/")).body)
    check("the theme's own words in French (locales/fr.json)", /class="hdr">Bienvenue/.test(html), html.match(/class="hdr">[^<]*/)?.[0])
    check("  and its default for a word fr.json lacks", /Bienvenue/.test(html))
    check("the page says it is French", /<html lang="fr"/.test(html))
    check("its routes keep the language", /class="home" href="\/fr\/"/.test(html) && /class="cart" href="\/fr\/cart"/.test(html))
    check("the theme's language selector offers the website's languages, in their own words", /value="en">English</.test(html) && /value="fr">Français</.test(html) && /value="ro">Română</.test(html))
    check("hreflang for each language and x-default", /hreflang="fr" href="https:\/\/mugs\.storelib\.com\/fr"/.test(html) && /hreflang="x-default" href="https:\/\/mugs\.storelib\.com\/"/.test(html))
    const en = String((await get({ ...base, i18n: { ...i18n, locale: "en" } }, "/")).body)
    check("the website's own language has no prefix and its own words", /class="hdr">Welcome/.test(en) && /class="home" href="\/"/.test(en) && /<html lang="en"/.test(en))
    const chose = await answer(fr, { method: "POST", path: "/localization", query: new URLSearchParams(), body: { language_code: "ro", return_to: "/fr/products/mug" }, cart: [] })
    check("choosing a language in the selector opens the same page in it", chose.status === 303 && String(chose.headers?.Location).endsWith("/ro/products/mug"), chose.headers)
    const back = await answer(fr, { method: "POST", path: "/localization", query: new URLSearchParams(), body: { language_code: "en", return_to: "/fr/products/mug" }, cart: [] })
    check("  and the website's own language, without a prefix", String(back.headers?.Location).endsWith("/products/mug") && !/\/fr\//.test(String(back.headers?.Location)))
    const other = await answer(fr, { method: "POST", path: "/localization", query: new URLSearchParams(), body: { language_code: "de", return_to: "/about" }, cart: [] })
    check("  a language the website does not publish changes nothing", String(other.headers?.Location).endsWith("/about"))
    check("localization, routes and roots read the same", localeRoot(i18n) === "/fr" && localeRoot(i18n, "en") === "" && String(routesFor(i18n).search_url) === "/fr/search" && (localizationObject("RON", i18n).available_languages as unknown[]).length === 3)
  }

  console.log("\nA language change is not a country chosen (the owner: Åland Islands (BRL) kept for a year)\n")
  {
    /* Dawn's selector: the country it shows as a hidden country_code, the languages as buttons, in one form. */
    const dawn = new CompatTheme(
      { ...files, "layout/theme.storelib": wrapCompatTemplate(`<html><body><main>{{ content_for_layout }}</main>{% form 'localization', id: 'FooterLanguageForm' %}<input type="hidden" name="country_code" value="{{ localization.country.iso_code }}"><span class="shown">{{ localization.country.name }} ({{ localization.country.currency.iso_code }})</span>{% for l in localization.available_languages %}<button name="language_code" value="{{ l.iso_code }}">{{ l.endonym_name }}</button>{% endfor %}{% endform %}</body></html>`) },
      {},
      { assetUrl: (n) => `/a/${n}` },
    )
    const countries = [
      { code: "AX", name: "Åland Islands", currency: "BRL" },
      { code: "BR", name: "Brazil", currency: "BRL" },
      { code: "RO", name: "Romania", currency: "RON" },
    ]
    const at = (country: (typeof countries)[number]): SiteData => ({ ...base, theme: dawn, i18n: { locale: "en", defaultLanguage: "en", languages: ["en", "ro"], countries, country } })
    const home = at(countries[2])
    const html = String((await get(home, "/")).body)
    check("the form says which country the page showed (storelib_country), beside the theme's own country_code", /name="storelib_country" value="RO"/.test(html) && /name="country_code" value="RO"/.test(html) && /class="shown">Romania \(RON\)/.test(html), html.match(/<form[\s\S]*?<\/form>/)?.[0]?.slice(0, 400))
    const post = (site: SiteData, body: Record<string, unknown>) => answer(site, { method: "POST", path: "/localization", query: new URLSearchParams(), body: { return_to: "/", ...body }, cart: [] })
    const cookieOf = (r: Awaited<ReturnType<typeof answer>>) => (r.cookies ?? []).find((c) => c.startsWith("sl_country=")) ?? null
    check("changing the language posts the country shown back: nothing is remembered about the country", cookieOf(await post(home, { language_code: "ro", country_code: "RO", storelib_country: "RO" })) === null)
    const picked = cookieOf(await post(home, { country_code: "BR", storelib_country: "RO" }))
    check("  choosing Brazil remembers it, marked as chosen (2.BR)", !!picked && /^sl_country=2\.BR;/.test(picked), picked)
    check("  a country the website does not list changes nothing", cookieOf(await post(home, { country_code: "ZZ", storelib_country: "RO" })) === null)
    /* A page drawn before this, still open: the selector showed Åland Islands, and its form has no storelib_country. */
    check("a page from before, its language changed: its Åland Islands is not taken as chosen", cookieOf(await post(home, { language_code: "ro", country_code: "AX" })) === null)
    check("  the same page's country list, used: the country is taken", /^sl_country=2\.BR;/.test(cookieOf(await post(home, { country_code: "BR" })) ?? ""))
  }

  console.log("\nThe theme's own words in a language it does not ship\n")
  {
    const words = theme.defaultWords()
    check("its default words are listed by key, for Translate › Theme words", words.some((w) => w.key === "header.welcome" && w.value === "Welcome"))
    const ro = String((await get({ ...base, i18n: { locale: "ro", defaultLanguage: "en", languages: ["en", "fr", "ro"], words: { "header.welcome": "Bun venit" } } }, "/")).body)
    check("a language the theme has no file for reads the store's translation", /class="hdr">Bun venit/.test(ro), ro.match(/class="hdr">[^<]*/)?.[0])
    const roNone = String((await get({ ...base, i18n: { locale: "ro", defaultLanguage: "en", languages: ["en", "fr", "ro"] } }, "/")).body)
    check("  and the theme's default without one, never a key", /class="hdr">Welcome/.test(roNone))
    const frOwn = String((await get({ ...base, i18n: { locale: "fr", defaultLanguage: "en", languages: ["en", "fr"], words: { "header.welcome": "Salut" } } }, "/")).body)
    check("the store's translation over the theme's own file, so it can correct it", /class="hdr">Salut/.test(frOwn))
    const compat = read("lib/markets/compat.ts")
    check("the live site lays them over, each only while written for the theme's word as it is", /valueFor\(map, themeWordKey\(w\.key\), \{ approvedOnly: true, fresh: true \}, w\.value\)/.test(compat) && /i18n\.words = themeWords/.test(compat))
    check("listed in Translate from the theme's default locale file", /compatTheme\.defaultWords\(\)\.map/.test(read("lib/markets/server.ts")) && /id: "theme-words", title: "Theme words"/.test(read("lib/markets/server.ts")))
  }

  console.log("\nIts texts translated with its own schemas\n")
  {
    const { fieldsOf, blockFieldsOf } = compatFields(theme)
    const items = translatablesOf(base.pages.home as unknown as SectionInstance[], fieldsOf, blockFieldsOf)
    check("the Translate sheet lists the theme's text settings, labelled in its own words, never a picture", items.length === 1 && items[0].key === "section:h:heading" && items[0].label === "Heading", items)
    const row: TranslationRow = { key: "section:h:heading", value: "Tasses faites main", sourceHash: sourceHash("Handmade mugs"), status: "approved", source: "manual" }
    const out = localizeSections(base.pages.home as unknown as SectionInstance[], translationMap([row]), fieldsOf, blockFieldsOf, { approvedOnly: true })
    const html = String((await get({ ...base, pages: { ...base.pages, home: out as never }, i18n: { locale: "fr", defaultLanguage: "en", languages: ["en", "fr"] } }, "/")).body)
    check("and drawn on the page in French", /Bienvenue · Tasses faites main/.test(html), html.match(/class="hdr">[^<]*/)?.[0])
    const script = linkLanguageScript("fr", "en", ["en", "fr"])
    check("a page in French keeps its links in French (the theme's menus and cart drawer too)", /data-storelib-language/.test(script) && script.includes('"p":"fr"') && linkLanguageScript("en", "en", ["en", "fr"]) === "")
    const route = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("the theme's handler puts the site in the page's language for that request only, never on a preview", /const locale = token \? null : \(req\.headers\.get\(SITE_LOCALE_HEADER\) \|\| null\)/.test(route) && /localizeCompatSite\(found\.site, locale, market, visitorCountry\)/.test(route))
    const proxy = read("proxy.ts")
    check("  the language named in a header only the proxy sets", /headers\.delete\(SITE_LOCALE_HEADER\)/.test(proxy) && /if \(locale\) headers\.set\(SITE_LOCALE_HEADER, locale\)/.test(proxy))
    check("Translate reads an imported theme's texts too", /if \(compatOf\(themeValues\)\)/.test(read("lib/markets/server.ts")))
  }

  console.log("\nPrices in a market's own currency\n")
  {
    const now = Date.parse("2026-10-11T12:00:00Z")
    const fx = { asOf: "2026-10-09", rates: { USD: 1.1, RON: 5, JPY: 160 } }
    const eu = { id: "eu", name: "Europe", currency: "EUR", rounding: "none" as const, adjustBps: 0 }
    const p = pricingFor(eu, "USD", fx, now)!
    check("a market with its own currency converts from the store's at the day's rate", !!p && p.convert(1100) === 1000 && p.currency === "EUR" && p.base === "USD")
    check("  and carries only the two rates it used, for the product block to convert the same way", JSON.stringify(Object.keys(p.fx.rates).sort()) === JSON.stringify(["USD"]) && pricingFor(eu, "USD", p.fx, now)!.convert(1100) === 1000)
    check("no market, the same currency or stale rates: the store's own prices", pricingFor(null, "USD", fx, now) === null && pricingFor({ ...eu, currency: "USD" }, "USD", fx, now) === null && pricingFor(eu, "USD", fx, Date.parse("2026-10-20T00:00:00Z")) === null)
    check("a card's price written in the market's currency, its own way, the /month kept", convertPriceText("$11.00", p, "de").replace(/\s/g, " ") === "10,00 €" && convertPriceText("$11.00/month", p, "en") === "€10.00/month" && convertPriceText("", p) === "")
    check("  rounding to .99 as the market says", convertPriceText("$11.55", pricingFor({ ...eu, rounding: "nine_nine" }, "USD", fx, now)!, "en") === "€10.99" && convertPriceText("$11.00", pricingFor({ ...eu, rounding: "nine_nine" }, "USD", fx, now)!, "en") === "€9.99")
    check("an imported theme's money filter counts hundredths, for every currency", convertedCents(1100, p) === 1000 && convertedCents(1100, pricingFor({ ...eu, currency: "JPY" }, "USD", fx, now)!) === 160000)
    check("  and writes them the currency's way", moneyFormatFor("EUR") === "€{{amount}}" && moneyFormatFor("JPY") === "¥{{amount_no_decimals}}" && /* Changed on purpose (the owner: "5.02 R$" in Romanian; a comma language writes its decimal comma) */ moneyFormatFor("RON", "ro") === "{{amount_with_comma_separator}} lei" && moneyFormatFor("BRL", "ro") === "{{amount_with_comma_separator}} R$")
    check("the market rides in the page's address, beside the language", siteNameIn("andrew", "fr", "eu") === "andrew~fr~m-eu" && JSON.stringify(splitSiteName("andrew~fr~m-eu")) === JSON.stringify({ name: "andrew", locale: "fr", market: "eu" }) && splitSiteName("andrew~m-eu").locale === null)
    check("  a visitor in a market sees the same page in its currency, in any language", (siteRouteInLanguage("andrew", "/about", ["fr"], "eu") as { path: string }).path === "/w/andrew~m-eu/about" && (siteRouteInLanguage("andrew", "/fr/about", ["fr"], "eu") as { path: string }).path === "/w/andrew~fr~m-eu/about" && /* Changed on purpose (round AE): the cart in the market's currency too. */ (siteRouteInLanguage("andrew", "/cart", ["fr"], "eu") as { path: string }).path === "/w/andrew~m-eu/cart" && siteRouteInLanguage("andrew", "/checkout", ["fr"], "eu") === null)
    const proxy = read("proxy.ts")
    /* Changed on purpose (the owner: "Åland Islands (BRL)" kept by a cookie from before): the choice and the country are read in lib/markets/visitor-country.ts, a cookie without its mark is no choice. */
    check("the proxy picks the market from the visitor's choice, then their country", /visitorCountryFrom\(request\.cookies\.get\(COUNTRY_COOKIE\)\?\.value, seenCountry\(request\.headers\)\)/.test(proxy) && /x-vercel-ip-country/.test(read("lib/markets/visitor-country.ts")) && /if \(choice === "home"\) return null/.test(read("lib/markets/visitor-country.ts")))
    /* Changed on purpose (round 31 merge): a request without cookies (a stand in, a probe) reads as none instead of throwing. */
    check("  and every answer clears a country cookie from before choices were marked", /return forgetStaleCountry\(request, await routeRequest\(request\)\)/.test(proxy) && /readCountryCookie\(request\.cookies\??\.get\(COUNTRY_COOKIE\)\?\.value\)\.stale/.test(proxy))
    check("  the builder theme's selector writes its choice marked", /countryCookieValue\(option\.country\)/.test(read("components/website-builder/theme/language-switch.tsx")) && !/sl_country=\$\{encodeURIComponent\(option\.country\)\}/.test(read("components/website-builder/theme/language-switch.tsx")))
    check("  and a page in a market's currency is never kept by a shared cache", /private, no-cache/.test(proxy) && /!\(inLanguage\?\.kind === "page" && \/~m-\/\.test\(inLanguage\.path\)\)/.test(proxy))
    const compat = read("lib/markets/compat.ts")
    /* Changed on purpose (the owner: currency in the builder like the live site): the conversion moved to lib/markets/compat-prices.ts, which the builder's canvas uses too. */
    const prices = read("lib/markets/compat-prices.ts")
    check("an imported theme's prices, shop currency and money format follow the market; the store's otherwise", /moneyFormat: moneyFormatFor\(pricing\.currency/.test(prices) && /price: shownPrice\(settings\.price, pricing\)/.test(prices) && /: shop$/m.test(prices) && /shop: compatShop\(site\.shop, pricing/.test(compat) && /if \(pricing\) settings = compatPrices\(settings, pricing\)/.test(compat))
    check("  its country selector lists every country with the currency it sees, and choosing one is remembered", /const countries = countryList\(input\.markets, input\.base\)/.test(prices) && /* Changed on purpose (merge): the markets that convert today, a store's own rate included. */ /themeCountries\(\{ markets: converting, base,/.test(compat) && /* Changed on purpose: written marked as chosen, and only for a country changed to */ /countryCookieHeader\(country\)/.test(read("lib/storelib-theme/compat/site.ts")))
    /* Changed on purpose (the owner): the charge currency is said at checkout and in the currency picker, never in a cart. */
    check("what the card is charged in is said at checkout and in the currency picker, not put into a theme's cart", !/chargeNoteScript/.test(compat) && /currencyNote=\{currencyNote\}/.test(read("app/checkout/site/page.tsx")) && /data-currency-note/.test(read("app/checkout/site/site-checkout.tsx")) && /data-currency-note/.test(read("components/website-builder/theme/language-switch.tsx")))
    check("a builder theme's product block converts the same way, never a pay what you want amount", /pricingFor\(product\.display\.market/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")) && /!product\.pay_what_you_want/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")))
    check("the chosen country is in the cookie policy", /name: "sl_country"/.test(read("lib/consent/consent.ts")))
    /* Round AD: the theme's own selector shows, picks the visitor's country, and a market's language greets its visitors once. */
    /* Changed on purpose (the owner: currency in the builder like the live site): the country picked moved to lib/markets/compat-prices.ts themeCountries. */
    check("  the selector has every country even before Markets is saved, and starts on the visitor's own", /if \(!langs\.saved\) \{[\s\S]{0,300}countries: shownCountries,/.test(compat) && /* Changed on purpose (the owner: "Åland Islands (BRL)" for a visitor in Romania): the visitor's country when it sees the prices shown, else the store's, and the proxy names the country in its own header. */ /pick\(wanted\) \?\? pick\(home\)/.test(read("lib/markets/compat-prices.ts")) && /SITE_COUNTRY_HEADER/.test(read("app/api/site-theme/site/[username]/[[...path]]/route.ts")) && /headers\.set\(SITE_COUNTRY_HEADER, country\)/.test(read("proxy.ts")))
    {
      const proxy = read("proxy.ts")
      check("a market's own language greets its visitors once, never a crawler, a script or checkout", /async function marketLanguageStart/.test(proxy) && /request\.cookies\.get\("sl_lang"\)/.test(proxy) && /CRAWLER\.test/.test(proxy) && /NEVER_STARTED = \/\^\\\/\(\?:checkout\|cart\|account/.test(proxy) && (proxy.match(/await marketLanguageStart\(request, /g) ?? []).length === 3)
      check("  and picking a language is remembered, on both kinds of theme", /sl_lang=\$\{chosen\.toLowerCase\(\)\}/.test(read("lib/storelib-theme/compat/site.ts")) && /document\.cookie = `sl_lang=/.test(read("components/website-builder/theme/language-switch.tsx")) && /name: "sl_lang"/.test(read("lib/consent/consent.ts")))
      check("  choosing the default language from /fr is not sent back to /fr", /sitePath !== "\/localization"/.test(read("app/api/site-theme/site/[username]/[[...path]]/route.ts")))
      check("Languages and Markets each say how they work", /* Changed on purpose (round AE, then the owner: call it Markets & Currency). */ /title="Languages"\s*help="languages"/.test(read("components/app/settings/markets-panel.tsx")) && /* And then: currency moved to Store details, so visitors' own currencies are an optional card. */ /* Changed on purpose (the owner: one store currency in Languages & Currency, the others "More currencies"). */ /title="More currencies"\s*help="markets"/.test(read("components/app/settings/markets-panel.tsx")) && /languages: \{\s*title: "How languages work"/.test(read("lib/settings/explainers.ts")))
    }
  }

  console.log("\nOne place for a website's language\n")
  {
    const general = read("components/website-builder/website-settings/general.tsx")
    check("Website settings no longer has its own language picker; it opens Markets and languages", !/id="wb-site-language"/.test(general) && /\/app\/settings\?tab=markets/.test(general))
    const live = read("lib/markets/live.ts")
    check("a saved default language is the page's lang, with no switch for one language", /if \(!langs\.saved\) return undefined/.test(live) && /if \(!hasLanguages && !currency\) return null/.test(read("components/website-builder/theme/language-switch.tsx")))
  }

  console.log("\nRound AE: Markets and languages made easy\n")
{
  const panel = read("components/app/settings/markets-panel.tsx")
  check("every change saves as it is made, and a refusal puts the page back", /const commit = \(next: Localization\)/.test(panel) && /setDraft\(savedRef\.current\)/.test(panel) && !/data-markets-save/.test(panel))
  check("a language is added from a searchable list and opens straight into Translate", /function LanguagePicker/.test(panel) && /setTranslating\(code\)/.test(panel))
  /* Changed on purpose: the row says where a language is (Default, Published, Translating) and offers its next step; Publish and Unpublish are in its menu too. */
  check("  published from its row and its menu, and a switch in Translate", /data-publish-language=\{l\.code\}/.test(panel) && /label: l\.published \? "Unpublish" : "Publish", onClick: \(\) => setPublished\(l\.code, !l\.published\)/.test(panel) && /data-translate-publish/.test(read("components/app/settings/translate-sheet.tsx")))
  check("a market's countries go in a region at a time, or searched", /REGIONS\.map/.test(panel) && /data-market-chosen/.test(panel) && read("lib/markets/regions.ts").includes('id: "eu"'))
  check("AI translates everything in one press, batch after batch", /for \(let round = 0; round < 12; round\+\+\)/.test(read("components/app/settings/translate-sheet.tsx")))
  check("rates are fetched when the owner opens Markets and there are none fresh", /refreshRates\(c\.db\)/.test(read("app/api/store/markets/route.ts")))
}

console.log("\nOne page view is one page (the country flags that brought Storelib down)\n")
  {
    const loc = localizationObject("USD", { locale: "en", defaultLanguage: "en", languages: ["en"], countries: [{ code: "DJ", name: "Djibouti", currency: "USD" }, { code: "GQ", name: "Equatorial Guinea", currency: "USD" }] }) as { available_countries: Record<string, unknown>[] }
    const flags = loc.available_countries.map((c) => imageSrc(c))
    check("a country's flag is drawn in the page, never an address on the website", flags.length === 2 && flags.every((f) => f.startsWith("data:image/svg+xml,")) && !flags.some((f) => /^[A-Z]{2}$/.test(f)))
    check("  a word is never a picture's address (src=\"DJ\" asked the site for /DJ)", imageSrc({ [OUTPUT]: "DJ" }) === "" && imageSrc({ [OUTPUT]: "fr" }) === "" && imageSrc({ [OUTPUT]: "/files/a.png" }) === "/files/a.png" && imageSrc({ [OUTPUT]: "https://x.com/a" }) === "https://x.com/a")
    check("a page asked for as an image, script or font answers 404 without rendering", pageAskedAsSubresource("image", "/DJ") && pageAskedAsSubresource("script", "/collections/all") && pageAskedAsSubresource("style", "/"))
    check("  a real file, an API, Next, media and a page opened as a page go through", !pageAskedAsSubresource("image", "/community/x/share.png") && !pageAskedAsSubresource("image", "/api/site-theme/assets/a/b/c") && !pageAskedAsSubresource("image", "/_next/image") && !pageAskedAsSubresource("image", "/media/x") && !pageAskedAsSubresource("document", "/DJ") && !pageAskedAsSubresource(null, "/DJ") && !pageAskedAsSubresource("empty", "/cart"))
    check("  checked first in the proxy, before any site is looked up", read("proxy.ts").indexOf("pageAskedAsSubresource(request.headers.get") < read("proxy.ts").indexOf("const bareHost = host.split"))
    const site = read("lib/website-builder/compat-site.ts")
    check("pages arriving together wait on one read of the theme's files", /const rowsReading = new Map/.test(site) && /liveFiles\(admin, row\.id, rowsKey\)/.test(site) && /finally\(\(\) => rowsReading\.delete\(key\)\)/.test(site))
  }

console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}
main()
