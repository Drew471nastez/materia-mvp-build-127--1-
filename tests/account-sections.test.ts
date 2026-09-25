/**
 * ===========================================================================
 *  THE ACCOUNT, SIGN IN, WISHLIST AND CONTACT SECTIONS, DRAWN
 * ===========================================================================
 * Each section compiled from its bundled file and rendered by the engine
 * with the globals a page hands it (lib/storelib-theme/globals), the way the
 * live site and the builder both draw it. Asserted on the markup: the store's
 * own values arrive (nothing typed twice), the visitor's own data only where
 * it is given, the hearts only where a product can be saved, and the pages
 * those sections sit on exist on every website.
 */
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { SITE_ROUTES, shopObject, wishlistObject } from "@/lib/storelib-theme/globals"
import { accountPageSections, signInNotice } from "@/lib/website-builder/account-pages"
import { BUILT_IN_PAGE_KEYS, GENERATED_PAGE_KEYS, RESERVED_PAGE_KEYS, pageKeyFromSegment, pagePath, pageTitleFromKey } from "@/lib/website-builder/site-pages"
import { resolveEditorHref } from "@/lib/website-builder/editor-navigation"
import { withLiveLinks } from "@/lib/website-builder/live-links"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import { editorGlobals } from "@/components/website-builder/sections/storelib-live"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}`}`) }
}
function section(title: string) { console.log(`\n${title}`) }

const theme = {
  brand_name: "Maralind",
  tagline: "Linen goods",
  social_instagram: "https://instagram.com/maralind",
  social_github: "javascript:alert(1)",
} as unknown as ThemeSettingsValues

const card = (id: string, title: string) => ({ id, type: "product", settings: { title, price: "$29.00", compare_price: "", image: "", url: `/products/${title.toLowerCase().replace(/\s+/g, "-")}`, tag: "" } })
const P1 = "10000000-0000-4000-8000-000000000001"
const P2 = "10000000-0000-4000-8000-000000000002"

function draw(type: string, settings: Record<string, unknown> = {}, opts: { template?: string; globals?: Parameters<typeof renderStorelibSection>[5]; products?: ReturnType<typeof card>[]; page?: Record<string, unknown> } = {}) {
  const out = renderStorelibSection(
    { id: `s-${type}`, type, name: type, settings, blocks: [] } as SectionInstance,
    theme,
    { template: opts.template ?? "index", ...(opts.page ?? {}) },
    undefined,
    opts.products ?? [],
    opts.globals,
  )
  if (out.ok === false) throw new Error(`${type}: ${JSON.stringify(out.errors)}`)
  return out.html.replace(/\s+/g, " ")
}

function main() {
  section("Every new section compiles clean, with no setting that nothing reads")
  for (const type of ["main_account", "main_login", "main_wishlist", "contact", "product_grid", "search"]) {
    const r = compileSection(DEFAULT_THEME_SOURCES[`sections/${type}.storelib`], { file: `sections/${type}.storelib` })
    check(`${type} compiles`, r.ok === true, r.ok === false ? r.errors : undefined)
    check(`${type} has no warnings`, r.ok === true && !r.warnings, r.ok === true ? r.warnings : undefined)
  }
  check("the Contact form is in Add Section; the page sections are not", ADDABLE_SECTIONS.includes("contact") && !ADDABLE_SECTIONS.some((t) => t.startsWith("main_")))

  section("shop and routes, on every page")
  {
    const shop = shopObject(theme as unknown as Record<string, unknown>, { name: "Creator Name", email: "Help@Maralind.com" })
    check("the store's name comes from the theme first", shop.name === "Maralind")
    check("the creator's own name when the store has none", shopObject({}, { name: "Creator Name" }).name === "Creator Name")
    check("social links are the theme's, and only ones a visitor can open", shop.socials.length === 1 && shop.socials[0].label === "Instagram")
    check("the email is there only when the page was given it", shop.email === "Help@Maralind.com" && shopObject({}, {}).email === "")
    check("sign in leaves from the website's own host and comes back to the account", SITE_ROUTES.account_signin_url === "/api/site-account/start?return=%2Faccount")
  }

  section("Sign in")
  {
    const html = draw("main_login", {}, { template: "page.login", page: { notice: "That sign in took too long. Sign in again." } })
    check("a heading and the two ways in", /<h1 class="s__h">Sign in<\/h1>/.test(html) && html.includes(`href="${SITE_ROUTES.account_signin_url}"`) && html.includes(`href="${SITE_ROUTES.account_register_url.replace(/&/g, "&amp;")}"`), html)
    check("no password field: the website never sees one", !/type="password"/.test(html))
    check("the reason the last sign in stopped, as a fixed sentence", /role="alert">That sign in took too long\. Sign in again\.<\/p>/.test(html))
    check("says the account is a Storelib account, in words the creator can change", /Accounts here are Storelib accounts\./.test(html) && !/login__note/.test(draw("main_login", { note: "" }, { template: "page.login" })))
    check("reasons are fixed words for fixed codes, and nothing else is printed", signInNotice("expired") !== null && signInNotice("<script>") === null)
    check("Create account can be turned off", !/Create account/.test(draw("main_login", { show_register: false }, { template: "page.login" })))
  }

  section("Account, with somebody signed in")
  {
    const customer = { name: "Alex Morgan", first_name: "Alex", email: "alex@example.com", orders_count: 1, orders: [{ id: P1, title: "Linen apron", image: "", url: "/products/linen-apron", date: "Sep 21, 2026", price: "$64.00", action_label: "Download", action_url: `https://storelib.com/library/products/${P1}` }] }
    const html = draw("main_account", {}, { template: "page.account", globals: { customer, wishlist: wishlistObject([card(P2, "Card wallet")], true) } })
    check("it greets them by first name", /<h1 class="s__h">Hi, Alex<\/h1>/.test(html), html)
    check("their email", html.includes("alex@example.com"))
    check("their order, with the way to the download", html.includes("Linen apron") && html.includes(`href="https://storelib.com/library/products/${P1}"`) && html.includes(">Download<"))
    check("their saved items, and the way to all of them", html.includes("Card wallet") && html.includes(`href="${SITE_ROUTES.wishlist_url}"`))
    check("sign out is a POST to this website's own route, left to the browser", /<form class="acct__out" method="post" action="\/account\/logout" data-storelib-form="native">/.test(html))
    const empty = draw("main_account", {}, { template: "page.account", globals: { customer: { ...customer, orders: [], orders_count: 0 }, wishlist: wishlistObject([], true) } })
    check("no orders says so and offers the shop", empty.includes("Nothing here yet.") && empty.includes(`href="${SITE_ROUTES.products_url}"`))
    const nobody = draw("main_account", {}, { template: "page.account" })
    check("without a customer it draws the signed out line and a way to sign in, and no data", nobody.includes("Sign in to see your orders") && !nobody.includes("alex@example.com") && nobody.includes(`href="${SITE_ROUTES.account_signin_url}"`))
  }

  section("Wishlist")
  {
    const full = draw("main_wishlist", {}, { template: "page.wishlist", globals: { wishlist: wishlistObject([card(P1, "Linen apron"), card(P2, "Card wallet")], false) } })
    check("each saved product is a card the page can hide, with a pressed heart", (full.match(/data-storelib-wishlist-card="/g) ?? []).length === 2 && (full.match(/data-storelib-wishlist="/g) ?? []).length === 2 && /aria-pressed="true"/.test(full))
    check("the empty line is drawn hidden, ready for when the last one goes", /<div class="empty" data-storelib-wishlist-empty hidden>/.test(full))
    check("a guest is told the list is in this browser, with a way to keep it", full.includes("Saved items stay in this browser.") && full.includes(`href="${SITE_ROUTES.account_login_url}"`))
    const mine = draw("main_wishlist", {}, { template: "page.wishlist", globals: { wishlist: wishlistObject([card(P1, "Linen apron")], true) } })
    check("a signed in visitor is not told to sign in", !mine.includes("Saved items stay in this browser."))
    const none = draw("main_wishlist", {}, { template: "page.wishlist", globals: { wishlist: wishlistObject([], false) } })
    check("nothing saved: the empty line, shown", /<div class="empty" data-storelib-wishlist-empty>/.test(none) && !/data-storelib-wishlist-card/.test(none))
  }

  section("Contact form")
  {
    const html = draw("contact", {}, { template: "page.contact", globals: { shop: { name: "Creator Name", email: "help@maralind.com" } } })
    check("with no heading typed it says whose store", /<h2 class="s__h">Contact Maralind<\/h2>/.test(html), html)
    check("a form the page sends to the creator", /<form class="cf__form" data-storelib-form="contact">/.test(html))
    check("name, email and message required; subject optional", /name="name"[^>]*required/.test(html) && /name="email" type="email"[^>]*required/.test(html) && /<textarea[^>]*name="message"[^>]*required/.test(html) && /name="subject" type="text" maxlength="150">/.test(html))
    check("the consent box is unticked and names the store", /<input class="cf__box" type="checkbox" name="consent" value="yes"><span>Email me news from Maralind<\/span>/.test(html))
    check("the trap is there, out of reach", /<div class="cf__trap" aria-hidden="true"><label>Company <input name="company" type="text" tabindex="-1" autocomplete="off">/.test(html))
    check("the success line is the creator's, hidden until sent", /<p class="cf__done" data-storelib-success hidden>/.test(html))
    check("the social links come from the theme", html.includes('href="https://instagram.com/maralind"') && !html.includes("javascript:"))
    check("the support email is not shown unless the creator turns it on", !html.includes("help@maralind.com"))
    const shown = draw("contact", { show_email: true }, { template: "page.contact", globals: { shop: { email: "help@maralind.com" } } })
    check("turned on, it shows the support email as a mailto link", shown.includes('href="mailto:help@maralind.com"'))
    const editor = draw("contact", { show_email: true }, { template: "page.contact", page: { in_editor: true } })
    check("in the builder with none to show, it says where it comes from", editor.includes("Your support email from Settings shows here on your live site."))
    const typed = draw("contact", { heading: "Write to us", consent_label: "Keep me posted", show_consent: true, show_subject: false }, { template: "index" })
    check("the creator's own words win", typed.includes(">Write to us<") && typed.includes("Keep me posted") && !/name="subject"/.test(typed))
  }

  section("Hearts on the shop's products")
  {
    const products = [card(P1, "Linen apron"), card(P2, "Card wallet")]
    const grid = draw("product_grid", { source: "shop" }, { products })
    check("each shop product has a heart with its id, unpressed until the page says", (grid.match(/data-storelib-wishlist="10000000/g) ?? []).length === 2 && /aria-pressed="false" aria-label="Save Linen apron"/.test(grid))
    check("the heart is a button, not a link", /<button type="button" class="heart"/.test(grid))
    check("off means none", !/data-storelib-wishlist/.test(draw("product_grid", { source: "shop", show_wishlist: false }, { products })))
    check("hand-picked cards have no product to save and no heart", !/data-storelib-wishlist/.test(draw("product_grid", { source: "picked" }, { products })))
    check("search results carry them too", (draw("search", {}, { products }).match(/data-storelib-wishlist="/g) ?? []).length === 2)
  }

  section("The pages exist on every website")
  {
    const header = { id: "header", type: "header", name: "Header", settings: {}, blocks: [] } as SectionInstance
    const footer = { id: "footer", type: "footer", name: "Footer", settings: {}, blocks: [] } as SectionInstance
    const home = [header, { id: "hero", type: "hero_centered", name: "Hero", settings: {}, blocks: [] } as SectionInstance, footer]
    for (const [key, type] of [["account", "main_account"], ["login", "main_login"], ["wishlist", "main_wishlist"], ["contact", "contact"]] as const) {
      const page = accountPageSections(key, home)!
      check(`${key}: the site's header, ${type}, the site's footer`, page.length === 3 && page[0].id === "header" && page[1].type === type && page[2].id === "footer")
      check(`${key}: generated and built in`, GENERATED_PAGE_KEYS.has(key) && BUILT_IN_PAGE_KEYS.has(key))
    }
    check("the same page twice is the same page", JSON.stringify(accountPageSections("account", home)) === JSON.stringify(accountPageSections("account", home)))
    check("account, login and wishlist cannot be made as pages of one's own", ["account", "login", "wishlist"].every((k) => RESERVED_PAGE_KEYS.has(k) && pageKeyFromSegment(k) === null))
    check("contact still can, and is served as made when it is", !RESERVED_PAGE_KEYS.has("contact") && pageKeyFromSegment("contact") === "contact")
    check("the sign in page lives under the account", pagePath("login") === "/account/login" && pagePath("home") === "/" && pagePath("wishlist") === "/wishlist")
    check("and is called Sign in", pageTitleFromKey("login") === "Sign in")

    const ctx = { currentPage: "home", inspectorEnabled: false, fromNav: true, shopPath: "/products", customPageKeys: [] as string[] }
    const to = (href: string) => resolveEditorHref(href, ctx)
    check("the canvas opens the account page", (to("/account") as { key?: string }).key === "account")
    check("the sign in page", (to("/account/login") as { key?: string }).key === "login")
    check("and the wishlist", (to("/wishlist") as { key?: string }).key === "wishlist")
    check("signing in, out and the API are not pages to make", to("/api/site-account/start?return=%2Faccount").kind === "ignore" && to("/account/logout").kind === "ignore")

    const withContact = withLiveLinks({ ...header, blocks: [{ id: "nav-contact", type: "nav_link", settings: { label: "Contact", url: "/contact" } }] }, new Set(["home"]))
    check("a stock Contact link stays: every website answers /contact now", (withContact.blocks ?? []).length === 1)
  }

  section("In the builder, the account pages have somebody on them")
  {
    const products = [card(P1, "Linen apron"), card(P2, "Card wallet")]
    const acct = editorGlobals("page.account", products)
    check("the account page gets a made up customer with the creator's own products", !!acct?.customer && (acct.customer as { orders: unknown[] }).orders.length === 2)
    check("the wishlist page gets saved items", editorGlobals("page.wishlist", products)?.wishlist?.count === 2)
    check("no other page gets anybody", editorGlobals("index", products) === undefined && editorGlobals("page.contact", products) === undefined)
    check("a store with nothing published still draws two cards", editorGlobals("page.wishlist", [])?.wishlist?.count === 2)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
