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
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { SITE_ROUTES, shopObject, wishlistObject } from "@/lib/storelib-theme/globals"
import { accountPageSections, baseScheme, signInNotice } from "@/lib/website-builder/account-pages"
import { listedPageKeys } from "@/lib/website-builder/site-seo"
import { SITE_DISALLOW } from "@/lib/seo/indexing"
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

function draw(type: string, settings: Record<string, unknown> = {}, opts: { template?: string; globals?: Parameters<typeof renderStorelibSection>[6]; products?: ReturnType<typeof card>[]; page?: Record<string, unknown> } = {}) {
  const out = renderStorelibSection(
    { id: `s-${type}`, type, name: type, settings, blocks: [] } as SectionInstance,
    theme,
    { template: opts.template ?? "index", ...(opts.page ?? {}) },
    undefined,
    opts.products ?? [],
    undefined,
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
    check("sign in is the website's own page, and so is making an account: a new email makes it there",
      SITE_ROUTES.account_signin_url === "/account/login" && SITE_ROUTES.account_register_url === "/account/login" && SITE_ROUTES.account_login_url === "/account/login")
    check("and the forms post to the website's own host", SITE_ROUTES.account_code_url === "/api/site-account/code" && SITE_ROUTES.account_verify_url === "/api/site-account/verify" && SITE_ROUTES.account_profile_url === "/api/site-account/profile")
    check("nothing leaves for storelib.com to sign in", !Object.values(SITE_ROUTES).some((r) => /storelib\.com|site-account\/start/.test(r)))
  }

  section("Sign in: an email, then the code sent to it")
  {
    const html = draw("main_login", {}, { template: "page.login", page: { notice: "That code has expired. Send a new one.", step: "email", return_to: "/wishlist" } })
    check("a heading and one line", /<h1 class="s__h">Sign in<\/h1>/.test(html) && html.includes("Enter your email and we will send you a code."), html)
    check("one email field, posted by the browser to this website's code route", /<form class="login__form" method="post" action="\/api\/site-account\/code" data-storelib-form="native">/.test(html) && /name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required/.test(html))
    check("carrying where to land afterwards", /<input type="hidden" name="return" value="\/wishlist">/.test(html))
    check("no password field, and no separate sign up", !/type="password"/.test(html) && !/Create account/i.test(html))
    check("says a new email makes the account, in words the creator can change", /New here\? Signing in makes your account\./.test(html) && !/login__note/.test(draw("main_login", { note: "" }, { template: "page.login" })))
    check("the reason the last step stopped, as a fixed sentence", /role="alert">That code has expired\. Send a new one\.<\/p>/.test(html))
    check("reasons are fixed words for fixed codes, and nothing else is printed", signInNotice("expired") !== null && signInNotice("code") !== null && signInNotice("<script>") === null)
    const editor = draw("main_login", {}, { template: "page.login", page: { in_editor: true } })
    check("in the builder the page is the email step, as a visitor first sees it", /action="\/api\/site-account\/code"/.test(editor) && !/one-time-code/.test(editor))

    const step = draw("main_login", {}, { template: "page.login", page: { step: "code", email: "ana@mail.test", return_to: "/account" } })
    check("the code step says where the code went", /<h1 class="s__h">Enter your code<\/h1>/.test(step) && /We sent a code to <span class="login__email">ana@mail\.test<\/span>/.test(step), step)
    check("one field for the code, which a phone can fill from the email", /action="\/api\/site-account\/verify" data-storelib-form="native"/.test(step) && /name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus/.test(step))
    check("a new code to the same email, from the page itself", /<form method="post" action="\/api\/site-account\/code" data-storelib-form="native"> <input type="hidden" name="email" value="ana@mail\.test"> <input type="hidden" name="return" value="\/account"> <input type="hidden" name="again" value="1"> <button class="login__link" type="submit">Send a new code<\/button>/.test(step))
    check("and a way back to the email step", /href="\/account\/login\?step=email">Use a different email<\/a>/.test(step))
    check("an address that tries to be markup is only text", !/<script>/.test(draw("main_login", {}, { template: "page.login", page: { step: "code", email: "<script>x</script>@a.test" } })))
  }

  section("Account, with a customer signed in")
  {
    const order = {
      id: P1, number: "3F2A9C1B", date: "Sep 21, 2026", status: "Complete", state: "open", total: "$93.00", item_count: 2,
      items: [{ title: "Linen apron", image: "", url: "/products/linen-apron", variant: "" }, { title: "Card wallet", image: "", url: "", variant: "Blue" }],
      action_label: "Download", action_url: "https://storelib.com/receipt/tok-1",
      title: "Linen apron and 1 more", image: "", url: "/products/linen-apron", price: "$93.00",
    }
    const customer = { name: "Ana Pop", first_name: "Ana", email: "ana@mail.test", orders_count: 1, orders: [order], sample: false }
    const html = draw("main_account", {}, { template: "page.account", globals: { customer, wishlist: wishlistObject([card(P2, "Card wallet")], true) } })
    check("a page title and the way out, and no greeting by name", /<h1 class="s__h">Account<\/h1>/.test(html) && !/Hi,|Hello|Welcome/.test(html), html)
    check("sign out is a POST to this website's own route, left to the browser", /<form class="acct__out" method="post" action="\/account\/logout" data-storelib-form="native">/.test(html))
    check("Orders: each with its date, number, status and total", /<h2 class="acct__h2">Orders<\/h2>/.test(html) && html.includes(">Sep 21, 2026<") && html.includes("Order #3F2A9C1B") && /data-state="open">Complete</.test(html) && /Total<\/span> \$93\.00/.test(html))
    check("its items, a variant under its title, the whole row a link where the product is still for sale",
      /<a class="item__row" href="\/products\/linen-apron"> <span class="item__img"><\/span> <span class="item__main"><span class="item__title">Linen apron<\/span><\/span> <\/a>/.test(html) &&
        /<div class="item__row"> <span class="item__img"><\/span> <span class="item__main"><span class="item__title">Card wallet<\/span><span class="item__meta">Blue<\/span><\/span> <\/div>/.test(html), html)
    check("and the button to its download", html.includes('<a class="order__go" href="https://storelib.com/receipt/tok-1">Download</a>'))
    check("Profile: the name, with Edit, and the email", /<h2 class="acct__h2">Profile<\/h2>/.test(html) && html.includes(">Ana Pop<") && html.includes('href="/account?edit=name#profile">Edit<') && html.includes(">ana@mail.test<"))
    check("the wishlist, as an entry with its count and a way to it", /<a class="entry" href="\/wishlist"> <span class="entry__text">1 saved<\/span> <span class="entry__go">View<\/span> <\/a>/.test(html))
    const editing = draw("main_account", {}, { template: "page.account", page: { edit: "name", notice: "Saved." }, globals: { customer, wishlist: wishlistObject([], true) } })
    check("Edit opens the name in place, posted to the profile route, with Cancel", /<form class="row row--edit" method="post" action="\/api\/site-account\/profile" data-storelib-form="native">/.test(editing) && /name="name" type="text" value="Ana Pop" maxlength="120" autocomplete="name" autofocus/.test(editing) && editing.includes('href="/account#profile">Cancel<'))
    check("and says when it was saved", /role="status">Saved\.<\/p>/.test(editing))
    const empty = draw("main_account", {}, { template: "page.account", globals: { customer: { ...customer, name: "", orders: [], orders_count: 0 }, wishlist: wishlistObject([], true) } })
    check("no orders says so in plain words, and offers the shop", empty.includes("No orders yet.") && empty.includes(`href="${SITE_ROUTES.products_url}"`))
    check("no name says so", /<span class="is-muted">Not added<\/span>/.test(empty))
    check("nothing saved says so", empty.includes('<span class="entry__text">Nothing saved yet.</span>'))
    check("the wishlist entry can be turned off", !/class="entry"/.test(draw("main_account", { show_wishlist: false }, { template: "page.account", globals: { customer, wishlist: wishlistObject([], true) } })))
    const nobody = draw("main_account", {}, { template: "page.account" })
    check("without a customer it draws the signed out line and a way to sign in, and no data", nobody.includes("Sign in to see your orders") && !nobody.includes("ana@mail.test") && nobody.includes(`href="${SITE_ROUTES.account_login_url}"`))
  }

  section("Wishlist")
  {
    const full = draw("main_wishlist", {}, { template: "page.wishlist", globals: { wishlist: wishlistObject([card(P1, "Linen apron"), card(P2, "Card wallet")], false) } })
    check("each saved product is a card the page can hide, with a pressed heart", (full.match(/data-storelib-wishlist-card="/g) ?? []).length === 2 && (full.match(/data-storelib-wishlist="/g) ?? []).length === 2 && /aria-pressed="true"/.test(full))
    check("the empty line is drawn hidden, ready for when the last one goes", /<div class="empty" data-storelib-wishlist-empty hidden>/.test(full))
    check("a guest is told the list is in this browser, with a way to keep it that comes back here", full.includes("Saved items stay in this browser.") && full.includes(`href="${SITE_ROUTES.account_login_url}?return=%2Fwishlist"`))
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
    check("on a light site the page keeps every section default", JSON.stringify(accountPageSections("login", home)![1].settings) === "{}")
    const dark = [{ ...header, settings: { color_scheme: "black" } } as SectionInstance, footer]
    check("on a dark site the page sits on the header's scheme, not a white band", (accountPageSections("login", dark)![1].settings as Record<string, unknown>).color_scheme === "black")
    check("a white header is the default and is not written", baseScheme([{ ...header, settings: { color_scheme: "white" } } as SectionInstance]) === null && baseScheme([]) === null)
    check("account, login and wishlist cannot be made as pages of one's own", ["account", "login", "wishlist"].every((k) => RESERVED_PAGE_KEYS.has(k) && pageKeyFromSegment(k) === null))
    check("contact still can, and is served as made when it is", !RESERVED_PAGE_KEYS.has("contact") && pageKeyFromSegment("contact") === "contact")
    check("the sign in page lives under the account", pagePath("login") === "/account/login" && pagePath("home") === "/" && pagePath("wishlist") === "/wishlist")
    check("and is called Sign in", pageTitleFromKey("login") === "Sign in")

    /* One visitor's pages are not search results, even once a creator has saved them as pages. */
    check("the sitemap leaves out the account, sign in and Wishlist pages, and keeps Contact",
      listedPageKeys(["home", "about", "account", "login", "wishlist", "contact"]).join() === "home,about,contact")
    const blocked = (path: string) => SITE_DISALLOW.some((rule) => (rule.endsWith("$") ? path === rule.slice(0, -1) : path.startsWith(rule)))
    check("robots.txt keeps crawlers off them", ["/account", "/account/login", "/account?x=1", "/wishlist", "/wishlist?y=2"].every(blocked))
    check("but not off a creator's own page that starts the same way", !blocked("/accounting") && !blocked("/wishlists-we-love") && !blocked("/contact"))

    const ctx = { currentPage: "home", inspectorEnabled: false, fromNav: true, shopPath: "/products", customPageKeys: [] as string[] }
    const to = (href: string) => resolveEditorHref(href, ctx)
    check("the canvas opens the account page", (to("/account") as { key?: string }).key === "account")
    check("the sign in page", (to("/account/login") as { key?: string }).key === "login")
    check("and the wishlist", (to("/wishlist") as { key?: string }).key === "wishlist")
    check("signing in, out and the API are not pages to make", to("/api/site-account/code").kind === "ignore" && to("/api/site-account/verify").kind === "ignore" && to("/account/logout").kind === "ignore")
    check("the sign in page's own links open it", (to("/account/login?step=email") as { key?: string }).key === "login" && (to("/account/login?return=%2Fwishlist") as { key?: string }).key === "login" && (to("/account?edit=name#profile") as { key?: string }).key === "account")

    const withContact = withLiveLinks({ ...header, blocks: [{ id: "nav-contact", type: "nav_link", settings: { label: "Contact", url: "/contact" } }] }, new Set(["home"]))
    check("a stock Contact link stays: every website answers /contact now", (withContact.blocks ?? []).length === 1)
  }

  section("In the builder, the account page is drawn signed in, with nobody invented")
  {
    const products = [card(P1, "Linen apron"), card(P2, "Card wallet")]
    const acct = editorGlobals("page.account", products, Date.parse("2026-09-25T12:00:00Z"))
    const sample = acct?.customer as { name: string; email: string; sample: boolean; orders: { items: { title: string }[]; action_url: string }[] }
    check("the account page gets placeholders where the customer would be", sample?.name === "Customer name" && sample.email === "Customer email" && sample.sample === true, sample)
    check("and the creator's own products as the orders", sample?.orders.length === 2 && sample.orders.map((o) => o.items[0].title).join() === "Linen apron,Card wallet" && sample.orders.every((o) => o.action_url === "#"))
    check("NO INVENTED PERSON: no Alex, no example.com, no address at all", !/Alex|Morgan|example\.com|@/.test(JSON.stringify(acct)))
    const html = draw("main_account", {}, { template: "page.account", page: { in_editor: true }, globals: acct })
    check("drawn, the placeholders look like placeholders", /<p class="row__value is-sample">Customer name<\/p>/.test(html) && /<p class="row__value is-sample">Customer email<\/p>/.test(html), html)
    check("and the page has no greeting, no Alex and no example.com anywhere", !/Hi,|Alex|example\.com/.test(html))
    check("the orders are drawn as orders, with the creator's products in them", html.includes(">Linen apron<") && html.includes(">Card wallet<") && /Order #100[12]/.test(html))
    check("the source holds no made up person either", !/Alex|Morgan|example\.com/.test(readFileSync(join(process.cwd(), "components/website-builder/sections/storelib-live.tsx"), "utf8")))
    check("the wishlist page gets saved items", editorGlobals("page.wishlist", products)?.wishlist?.count === 2)
    check("no other page gets anybody", editorGlobals("index", products) === undefined && editorGlobals("page.contact", products) === undefined && editorGlobals("page.login", products) === undefined)
    check("a store with nothing published still draws two cards", editorGlobals("page.wishlist", [])?.wishlist?.count === 2)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main()
