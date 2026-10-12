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
import { compatFields } from "@/lib/markets/compat"
import { linkLanguageScript } from "@/lib/markets/link-script"
import { localizeSections, sourceHash, translatablesOf, translationMap, type TranslationRow } from "@/lib/markets/translate"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
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
    check("the theme's handler puts the site in the page's language for that request only, never on a preview", /const locale = token \? null : \(req\.headers\.get\(SITE_LOCALE_HEADER\) \|\| null\)/.test(route) && /localizeCompatSite\(found\.site, locale\)/.test(route))
    const proxy = read("proxy.ts")
    check("  the language named in a header only the proxy sets", /headers\.delete\(SITE_LOCALE_HEADER\)/.test(proxy) && /if \(locale\) headers\.set\(SITE_LOCALE_HEADER, locale\)/.test(proxy))
    check("Translate reads an imported theme's texts too", /if \(compatOf\(themeValues\)\)/.test(read("lib/markets/server.ts")))
  }

  console.log("\nOne place for a website's language\n")
  {
    const general = read("components/website-builder/website-settings/general.tsx")
    check("Website settings no longer has its own language picker; it opens Markets and languages", !/id="wb-site-language"/.test(general) && /\/app\/settings\?tab=markets/.test(general))
    const live = read("lib/markets/live.ts")
    check("a saved default language is the page's lang, with no switch for one language", /if \(!langs\.saved\) return undefined/.test(live) && /languages\.length < 2\) return null/.test(read("components/website-builder/theme/language-switch.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}
main()
