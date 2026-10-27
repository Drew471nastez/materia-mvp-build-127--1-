/**
 * ===========================================================================
 *  A VISITOR'S ACCOUNT AND THE SITE'S FORMS, ON AN IMPORTED SHOPIFY THEME
 * ===========================================================================
 * lib/storelib-theme/compat/site.ts and ./account.ts, driven through the same
 * `answer` the live route calls. What is held, and why:
 *
 *   NO FRAME          /account/login, /account and the rest are drawn on the
 *                     website's own host in the theme's header and footer.
 *                     They used to be Storelib's page in an iframe, and every
 *                     response carries X-Frame-Options: DENY (vercel.json),
 *                     so the live sign in page was a blank rectangle.
 *   THE THEME'S OWN   a theme with customers/login, register or account
 *                     templates draws them, with Storelib's `customer`, its
 *                     password fields taken out (an emailed code is the
 *                     credential), and the reason a try stopped in its own
 *                     form.errors. Without them, Storelib's sign in.
 *   SHOPIFY'S RULES   a signed-in visitor at sign in goes on; a guest at the
 *                     account goes to sign in; the forms post where Shopify's
 *                     do and each one is "email me a code".
 *   NO BLANK PAGE     a newsletter or contact post answers JSON to a script
 *                     and a redirect back to the page otherwise, with the
 *                     theme's own thank you or error; never "Sending…".
 *   THE ACCOUNT LINK  the routes are this site's own, and <shopify-account>
 *                     (Dawn, Horizon) is defined as a link to them.
 *   THE PROXY         every /account address but sign out is the theme's,
 *                     and the wishlist's frame may be framed by its own site.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CompatTheme, wrapCompatTemplate, withoutPasswordFields } from "../lib/storelib-theme/compat/theme"
import { shopifyBootstrap } from "../lib/storelib-theme/compat/shims"
import { compatFilter } from "../lib/storelib-theme/compat/filters"
import { SHOPIFY_ROUTES } from "../lib/storelib-theme/compat/objects"
import { themeCustomer, themeSignInFields, type StorelibCustomer } from "../lib/storelib-theme/compat/account"
import { accountFormPost, answer, type SiteData, type SiteRequest } from "../lib/storelib-theme/compat/site"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 500)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
const baseFiles: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main>{% sections 'footer-group' %}</body></html>`),
  "sections/hdr.storelib": section("hdr", `<header class="hdr">{% if customer %}<a class="acct" href="{{ routes.account_url }}">Hi {{ customer.first_name }}</a>{% else %}<a class="acct" href="{{ routes.account_login_url }}">Log in</a>{% endif %}</header>`),
  "sections/nl.storelib": section("nl", `<footer class="nl">{% form 'customer' %}{% if form.posted_successfully? %}<p class="ok">Thanks for subscribing</p>{% endif %}{% if form.errors %}<p class="bad">{{ form.errors.messages.email }}</p>{% endif %}<input type="email" name="contact[email]">{% endform %}</footer>`),
  "sections/hero.storelib": section("hero", `<h1>Home</h1>`),
}
const loginFiles: Record<string, string> = {
  ...baseFiles,
  "templates/customers/login.json": JSON.stringify({ sections: { main: { type: "main-login", settings: {} } }, order: ["main"] }),
  "templates/customers/register.json": JSON.stringify({ sections: { main: { type: "main-register", settings: {} } }, order: ["main"] }),
  "templates/customers/account.json": JSON.stringify({ sections: { main: { type: "main-account", settings: {} } }, order: ["main"] }),
  "sections/main-login.storelib": section("main-login", `<div class="theme-login" data-t="{{ template.name }}|{{ template.directory }}">{% form 'customer_login' %}{% if form.errors %}<p class="err">{{ form.errors.messages.form }}</p>{{ form.errors | default_errors }}{% endif %}<input type="email" name="customer[email]"><div class="field"><input type="password" name="customer[password]" id="CustomerPassword"><label for="CustomerPassword">Password</label></div><a href="#recover">Forgot your password?</a><button>Sign in</button>{% endform %}<a href="{{ routes.account_register_url }}">Create account</a></div>`),
  "sections/main-register.storelib": section("main-register", `<div class="theme-register">{% form 'create_customer' %}<input name="customer[first_name]"><input name="customer[last_name]"><input type="email" name="customer[email]"><input type="password" name="customer[password]" id="RegisterForm-password"><label for="RegisterForm-password">Password</label><button>Create</button>{% endform %}</div>`),
  "sections/main-account.storelib": section("main-account", `<div class="theme-account">Welcome {{ customer.name }}{% for order in customer.orders %}<p class="o">{{ order.name }} {{ order.created_at | date: '%b %d, %Y' }} {{ order.financial_status_label }} {{ order.fulfillment_status_label }} {{ order.total_price | money }} <a href="{{ order.customer_url }}">view</a></p>{% endfor %}<a href="{{ routes.account_addresses_url }}">Addresses ({{ customer.addresses_count }})</a> <a href="{{ routes.account_logout_url }}">Log out</a></div>`),
}

const pages = {
  home: [
    { id: "header", type: "hdr", group: "header" },
    { id: "hero", type: "hero" },
    { id: "footer", type: "nl", group: "footer" },
  ],
}
const shop = { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}" }
const siteOf = (files: Record<string, string>): SiteData => ({ creatorId: "c", theme: new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` }), pages, products: [], collections: [], menus: {}, shop, host: "shop.test" })

const ANA: StorelibCustomer = {
  name: "Ana Pop", first_name: "Ana", email: "ana@mail.test",
  orders: [{ id: "o1", number: "3F2A9C1B", date: "Sep 21, 2026", created_at: "2026-09-21T10:00:00Z", status: "Shipped", state: "open", total: "$93.00", total_cents: 9300, currency: "USD", items: [{ title: "Linen shirt", image: "", url: "/products/linen-shirt", variant: "Large" }], item_count: 1, action_label: "Track order", action_url: "https://storelib.com/checkout/physical/order/tok" }],
  orders_count: 1,
  addresses: [{ lines: ["Ana Pop", "1 Main St", "Austin, TX 78701", "United States"] }],
}

function call(site: SiteData, method: string, url: string, extra: Partial<SiteRequest> = {}) {
  const [p, q] = url.split("?")
  return answer(site, { method, path: p, query: new URLSearchParams(q ?? ""), body: null, cart: [], ...extra })
}
const body = (r: { body: string | Uint8Array }) => String(r.body)
const where = (r: { headers?: Record<string, string> }) => r.headers?.Location ?? ""

async function main() {
  const plain = siteOf(baseFiles)
  const themed = siteOf(loginFiles)

  console.log("\nSigning in, on the site's own host, in the theme, with no frame\n")
  {
    const r = await call(plain, "GET", "/account/login", { account: { customer: null } })
    const html = body(r)
    check("a theme without customers templates gets Storelib's sign in, in its header", r.status === 200 && /class="hdr"/.test(html) && /<h1>Sign in<\/h1>/.test(html))
    check("no frame anywhere: the old iframe was refused by X-Frame-Options: DENY", !/<iframe/i.test(html) && !/sl_embed/.test(html))
    check("one email field, posted to Storelib's code route on this host, with where to land", /<form method="post" action="\/api\/site-account\/code"/.test(html) && /name="email" type="email"/.test(html) && /name="return" value="\/account"/.test(html))
    check("never a password field", !/type="password"/.test(html))
    const notice = body(await call(plain, "GET", "/account/login?error=email&step=email", { account: { customer: null } }))
    check("why the last try stopped, as a fixed sentence", /Enter a valid email address\./.test(notice))
    const odd = body(await call(plain, "GET", "/account/login?error=%3Cscript%3E", { account: { customer: null } }))
    check("an unknown reason prints nothing from the address", !/class="sl-acc__notice"/.test(odd) && !/&lt;script/.test(odd))
    const code = body(await call(plain, "GET", "/account/login", { account: { customer: null, pending: { email: "a<b>@mail.test" } } }))
    check("waiting on a code: the code step, posted to the verify route, the email as text", /Check your email/.test(code) && /action="\/api\/site-account\/verify"/.test(code) && /autocomplete="one-time-code"/.test(code) && /a&lt;b&gt;@mail\.test/.test(code))
    /* Changed on purpose (round BB): Use a different email goes through the restart route, which ends the code this browser waits on. */
    check("with Send a new code and Use a different email", /name="again" value="1"/.test(code) && /href="\/api\/site-account\/restart"/.test(code))
    const restart = body(await call(plain, "GET", "/account/login?error=expired", { account: { customer: null } }))
    check("a code refused after the note ran out says to start again", /That sign in has expired/.test(restart))
    const reg = body(await call(plain, "GET", "/account/register", { account: { customer: null } }))
    check("/account/register is the same email and code, worded for a new account", /<h1>Create account<\/h1>/.test(reg) && /action="\/api\/site-account\/code"/.test(reg))
  }

  console.log("\nShopify's rules for who goes where\n")
  {
    const signedIn = { account: { customer: ANA } }
    const r = await call(plain, "GET", "/account/login", signedIn)
    check("signed in, the sign in page goes on to the account", r.status === 303 && where(r) === "/account")
    const back = await call(plain, "GET", "/account/login?return=%2Fcart", signedIn)
    check("or to where they were going, a path on this site", where(back) === "/cart")
    const evil = await call(plain, "GET", "/account/login?return=%2F%2Fevil.test", signedIn)
    check("never another site", where(evil) === "/account")
    const guest = await call(plain, "GET", "/account", { account: { customer: null } })
    check("a guest at the account goes to sign in", guest.status === 303 && where(guest) === "/account/login")
    const guestAddr = await call(plain, "GET", "/account/addresses", { account: { customer: null } })
    check("and from the addresses, comes back there after", where(guestAddr) === "/account/login?return=%2Faccount%2Faddresses")
    const order = await call(plain, "GET", "/account/orders/abc", signedIn)
    check("an order's own address goes to the account, whose orders link their receipts", where(order) === "/account")
  }

  console.log("\nThe account, Storelib's, in the theme\n")
  {
    const html = body(await call(plain, "GET", "/account", { account: { customer: ANA } }))
    check("the orders, with their totals, statuses and receipts", /Order #3F2A9C1B/.test(html) && /\$93\.00/.test(html) && /Shipped/.test(html) && /href="https:\/\/storelib\.com\/checkout\/physical\/order\/tok"/.test(html))
    check("the profile, with the name editable", /ana@mail\.test/.test(html) && /href="\/account\?edit=name#profile"/.test(html))
    check("signing out is a POST to the site's own logout", /<form method="post" action="\/account\/logout"/.test(html))
    check("deleting the account is a POST with confirm=delete to the delete route", /action="\/api\/site-account\/delete"/.test(html) && /name="confirm" value="delete"/.test(html))
    check("the header knows who it is", /Hi Ana/.test(html) && /href="\/account">Hi/.test(html))
    const edit = body(await call(plain, "GET", "/account?edit=name", { account: { customer: ANA } }))
    check("Edit opens the name, posted to the profile route", /action="\/api\/site-account\/profile"/.test(edit) && /name="name" type="text" value="Ana Pop"/.test(edit))
    const del = body(await call(plain, "GET", "/account?edit=delete", { account: { customer: ANA } }))
    check("Delete account from the theme's own page opens the delete box", /<details class="sl-acc__block" id="delete" open>/.test(del))
    const notice = body(await call(plain, "GET", "/account?deleted=no", { account: { customer: ANA } }))
    check("a delete that did not go through says so", /Your account could not be deleted/.test(notice))
    const addr = body(await call(plain, "GET", "/account/addresses", { account: { customer: ANA } }))
    check("/account/addresses lists where orders went", /1 Main St/.test(addr) && /Austin, TX 78701/.test(addr))
  }

  console.log("\nThe theme's own customers templates\n")
  {
    const login = body(await call(themed, "GET", "/account/login", { account: { customer: null } }))
    check("customers/login is drawn by the theme, in its header", /class="theme-login"/.test(login) && /class="hdr"/.test(login))
    check("template.name is login, in the customers directory, as Shopify writes it", /data-t="login\|customers"/.test(login))
    check("its form posts to /account/login, as Shopify's does", /<form method="post" action="\/account\/login"[^>]*><input type="hidden" name="form_type" value="customer_login">/.test(login))
    check("the password field, its label, its empty wrapper and Forgot password are gone", !/type="password"/.test(login) && !/>Password</.test(login) && !/<div class="field">\s*<\/div>/.test(login) && !/Forgot your password/.test(login))
    check("Create account goes to /account/register", /href="\/account\/register"/.test(login))
    const err = body(await call(themed, "GET", "/account/login?error=limit", { account: { customer: null } }))
    check("why it stopped is the theme's own form.errors, by messages and by default_errors", /<p class="err">Too many codes asked for at once\. Try again in a few minutes\.<\/p>/.test(err) && /<div class="errors"><ul><li>Too many codes/.test(err))
    const code = body(await call(themed, "GET", "/account/login", { account: { customer: null, pending: { email: "ana@mail.test" } } }))
    check("the code step, which no Shopify theme has, is Storelib's in the theme's header", /Check your email/.test(code) && /class="hdr"/.test(code) && !/class="theme-login"/.test(code))
    const reg = body(await call(themed, "GET", "/account/register", { account: { customer: null } }))
    check("customers/register is the theme's, posting to /account, with no password field", /class="theme-register"/.test(reg) && /action="\/account"/.test(reg) && !/type="password"/.test(reg) && /name="customer\[first_name\]"/.test(reg))
    const acct = body(await call(themed, "GET", "/account", { account: { customer: ANA } }))
    check("customers/account is the theme's, with Shopify's order fields", /class="theme-account"/.test(acct) && /#3F2A9C1B Sep 21, 2026 Paid Shipped \$93\.00/.test(acct) && /Addresses \(1\)/.test(acct))
    check("its links stay on this site: addresses, sign out; the order opens its receipt", /href="\/account\/addresses"/.test(acct) && /href="\/account\/logout"/.test(acct) && /href="https:\/\/storelib\.com\/checkout\/physical\/order\/tok"/.test(acct))
    check("with Edit name and Delete account below it", /href="\/account\?edit=name#profile"/.test(acct) && /href="\/account\?edit=delete#delete"/.test(acct))
  }

  console.log("\nA theme's account form, carried out by Storelib's code route\n")
  {
    const login = accountFormPost("POST", "/account/login", { form_type: "customer_login", "customer[email]": "Ana@Mail.test", "customer[password]": "x" })
    check("sign in is \"email me a code\", the password never read", login?.kind === "code" && login.email === "Ana@Mail.test" && !JSON.stringify(login).includes('"x"'))
    const reg = accountFormPost("POST", "/account", { form_type: "create_customer", "customer[email]": "b@mail.test", "customer[first_name]": " Bea ", "customer[last_name]": "Lin", return_to: "/cart" })
    check("Create account too, with the name and where to land", reg?.kind === "code" && reg.name === "Bea Lin" && reg.returnPath === "/cart")
    const rec = accountFormPost("POST", "/account/recover", { form_type: "recover_customer_password", email: "c@mail.test" })
    check("and Forgot password", rec?.kind === "code" && rec.email === "c@mail.test")
    /* Changed on purpose (round BC): addresses are the customer's own address book now, so a theme's address form saves to it instead of only going back. */
    const posted = accountFormPost("POST", "/account/addresses", { form_type: "customer_address", "address[first_name]": "Ana", "address[last_name]": "Pop", "address[address1]": "1 Main St", "address[city]": "Austin", "address[country]": "United States", "address[province]": "Texas", "address[zip]": "78701" })
    check("an address form saves to the address book, the country as its code", posted?.kind === "address" && posted.action === "save" && posted.id === null && posted.fields.name === "Ana Pop" && posted.fields.country === "US" && posted.fields.region === "Texas")
    check("signing out, a newsletter form posted to /account, and a GET are not account posts", accountFormPost("POST", "/account/logout", {}) === null && accountFormPost("POST", "/account", { form_type: "customer" }) === null && accountFormPost("GET", "/account/login", null) === null)
    check("a return_to off this site lands on the account", themeSignInFields({ return_to: "//evil.test" }).returnPath === "/account" && themeSignInFields({ return_to: "/\\evil" }).returnPath === "/account")
    const stray = await call(plain, "POST", "/account/login", { body: { form_type: "customer_login" } })
    check("one that reaches the pure handler is sent to sign in, never drawn", stray.status === 303 && where(stray) === "/account/login")
  }

  console.log("\nNewsletter and contact forms: no blank page\n")
  {
    const sent: { kind: string; payload: Record<string, unknown> }[] = []
    const submit = async (kind: "subscribe" | "contact", payload: Record<string, unknown>) => {
      sent.push({ kind, payload })
      return /bad/.test(String(payload.email)) ? { ok: false, status: 400 } : /busy/.test(String(payload.email)) ? { ok: false, status: 429 } : { ok: true, status: 200 }
    }
    const ajax = await call(plain, "POST", "/contact", { body: { form_type: "customer", "contact[email]": "ana@mail.test" }, ajax: true, submit })
    check("a script's post: JSON, sent through Storelib's subscribe endpoint for this creator", ajax.status === 200 && JSON.parse(body(ajax)).ok === true && sent[0]?.kind === "subscribe" && sent[0].payload.creator_id === "c" && sent[0].payload.email === "ana@mail.test")
    const bad = await call(plain, "POST", "/contact", { body: { form_type: "customer", "contact[email]": "bad@mail.test" }, ajax: true, submit })
    check("a refused address: JSON with a code and a fixed sentence", bad.status === 400 && JSON.parse(body(bad)).code === "email" && JSON.parse(body(bad)).message === "Enter a valid email address.")
    const back = await call(plain, "POST", "/contact", { body: { form_type: "customer", "contact[email]": "ana@mail.test", return_to: "/pages/about?x=1" }, submit })
    check("a plain post comes straight back with customer_posted=true", back.status === 303 && where(back) === "/pages/about?x=1&customer_posted=true")
    const busy = await call(plain, "POST", "/contact", { body: { form_type: "customer", "contact[email]": "busy@mail.test" }, referer: "/", submit })
    check("or with the reason, for the theme's own error", where(busy) === "/?form_error=limit&form_type=customer")
    const contact = await call(plain, "POST", "/contact", { body: { form_type: "contact", "contact[name]": "Cy", "contact[email]": "cy@mail.test", "contact[body]": "Hello" }, referer: "/pages/contact", submit })
    check("a contact form goes to the contact endpoint and back with contact_posted=true", sent.some((s) => s.kind === "contact" && s.payload.message === "Hello" && s.payload.name === "Cy") && where(contact) === "/pages/contact?contact_posted=true")
    /* Round 25: a question asked on a product page (Materia's product addons) keeps which product it was about. */
    sent.length = 0
    const asked = await call(plain, "POST", "/contact", { body: { form_type: "contact", "contact[name]": "Cy", "contact[email]": "cy@mail.test", "contact[body]": "Does it shrink?", "contact[product]": "Linen   tee", "contact[product_url]": "/fr/products/linen-tee" }, referer: "/products/linen-tee", submit })
    const q = sent.find((s) => s.kind === "contact")?.payload ?? {}
    check("a product question keeps its product: the subject and the page it was asked on", q.subject === "Question about Linen tee" && q.page === "products/linen-tee" && q.message === "Does it shrink?" && where(asked) === "/products/linen-tee?contact_posted=true", q)
    sent.length = 0
    await call(plain, "POST", "/contact", { body: { form_type: "contact", "contact[email]": "cy@mail.test", "contact[body]": "Hi", "contact[subject]": "Wholesale", "contact[product]": "Linen tee", "contact[product_url]": "https://evil.test/../../x" }, submit })
    const own = sent.find((s) => s.kind === "contact")?.payload ?? {}
    check("  a subject of its own wins, and a link that is not one of the site's pages is the contact page", own.subject === "Wholesale" && own.page === "contact", own)
    const { validateContact } = await import("../lib/site-contact/contact")
    const v = validateContact({ creator_id: "11111111-1111-4111-8111-111111111111", email: "cy@mail.test", message: "Hi", page: "products/linen-tee", subject: "Question about Linen tee" })
    check("  and the message's own check takes the product page", v.ok === true && v.value.page === "products/linen-tee" && v.value.subject === "Question about Linen tee", v)
    check("  while a path deeper than that, or with anything else in it, is the contact page", (validateContact({ creator_id: "11111111-1111-4111-8111-111111111111", email: "cy@mail.test", message: "Hi", page: "products/a/b" }) as { value?: { page: string } }).value?.page === "contact" && (validateContact({ creator_id: "11111111-1111-4111-8111-111111111111", email: "cy@mail.test", message: "Hi", page: "../admin" }) as { value?: { page: string } }).value?.page === "contact")
    const none = await call(plain, "POST", "/contact", { body: { form_type: "customer", "contact[email]": "ana@mail.test" } })
    check("nothing to send it with: back with an error, never a page of its own", none.status === 303 && /form_error=failed/.test(where(none)))
    for (const r of [ajax, bad, back, busy, contact, none]) if (/Sending/.test(body(r))) check("never the Sending page", false)
    check("the Sending page is gone from the source", !/Sending…/.test(read("lib/storelib-theme/compat/site.ts")))
    const thanks = body(await call(plain, "GET", "/?customer_posted=true"))
    check("the theme draws its own thank you", /<p class="ok">Thanks for subscribing<\/p>/.test(thanks))
    const error = body(await call(plain, "GET", "/?form_error=email&form_type=customer"))
    check("and its own error, by form.errors.messages.email (Horizon reads that)", /<p class="bad">Enter a valid email address\.<\/p>/.test(error) && !/class="ok"/.test(error))
    const forged = body(await call(plain, "GET", "/?form_error=%3Cb%3Ehi&form_type=customer"))
    check("an error code it does not know prints nothing", !/class="bad"/.test(forged) && !/<b>hi/.test(forged))
    const section = body(await call(plain, "GET", "/?section_id=footer&customer_posted=true"))
    check("the section rendering API draws the form's section with the answer, for the page's script to swap in", /^<[a-z]+ id="shopify-section-footer"/.test(section) && /Thanks for subscribing/.test(section))
  }

  console.log("\nThe account link, and the page's scripts\n")
  {
    check("Shopify's account routes are this site's own, relative", SHOPIFY_ROUTES.account_login_url === "/account/login" && SHOPIFY_ROUTES.account_register_url === "/account/register" && SHOPIFY_ROUTES.account_addresses_url === "/account/addresses" && Object.values(SHOPIFY_ROUTES).every((v) => typeof v === "string" && v.startsWith("/") && !v.startsWith("//")))
    const guest = shopifyBootstrap({ shopName: "x", currency: "USD", designMode: false })
    const signed = shopifyBootstrap({ shopName: "x", currency: "USD", designMode: false, signedIn: true })
    check("<shopify-account> (Dawn, Horizon) is defined, as a link to sign in or the account", /customElements\.define\("shopify-account"/.test(guest) && /S\.storelibSignedIn\?"\/account":"\/account\/login"/.test(guest))
    check("and the page says whether somebody is signed in", /"storelibSignedIn":false/.test(guest) && /"storelibSignedIn":true/.test(signed))
    /* Changed on purpose (the owner: canvas animations as on the live site): the canvas tells the theme designMode false, so the form script goes by EDITING, the page drawn for the builder. */
    check("the form script posts newsletter and contact forms by fetch, not on the builder's canvas", /if\(!EDITING\)document\.addEventListener\("submit"/.test(guest) && /var EDITING=false;/.test(guest) && /fetch\("\/contact"/.test(guest) && /"X-Requested-With":"XMLHttpRequest"/.test(guest))
    check("leaving a theme that sends the form itself alone", /e\.defaultPrevented\)return/.test(guest))
    check("and swapping only the form, so a popup around it stays open", /f\.replaceWith\(nf\)/.test(guest) && !/sec\.replaceWith/.test(guest))
    const js = guest.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")
    let parses = true
    try { new Function(js) } catch { parses = false }
    check("the whole head script parses", parses)
    const page = body(await call(plain, "GET", "/", { account: { customer: ANA } }))
    check("a signed-in visitor's page carries it", /"storelibSignedIn":true/.test(page))
  }

  console.log("\nPieces\n")
  {
    const c = themeCustomer(ANA)
    const o = (c.orders as Record<string, unknown>[])[0]
    check("customer as a theme reads it: names, orders in cents, labels, addresses", c.first_name === "Ana" && c.last_name === "Pop" && c.orders_count === 1 && o.name === "#3F2A9C1B" && o.total_price === 9300 && o.financial_status === "paid" && o.fulfillment_status === "fulfilled" && c.addresses_count === 1 && (c.default_address as Record<string, unknown>).address1 === "1 Main St")
    check("a customer with no name is called by their email", themeCustomer({ ...ANA, name: "", first_name: "" }).name === "ana@mail.test")
    /* Something that ships: its order page on this site, Shopify's fulfilment words, and the parcel on each line item. */
    const shipping: StorelibCustomer = { ...ANA, orders: [{ ...ANA.orders[0], status: "Partly shipped", fulfillment_status: "partially_fulfilled", order_url: "/checkout/physical/order/co-tok", action_url: "/checkout/physical/order/co-tok", tracking: [{ company: "Royal Mail", number: "AB123456789GB", url: "https://www.royalmail.com/track-your-item#/tracking-results/AB123456789GB", status: "In transit" }] }] }
    const so = (themeCustomer(shipping).orders as Record<string, any>[])[0]
    check("a part-shipped order is Shopify's partial, opening its order page on this site", so.fulfillment_status === "partial" && so.customer_url === "/checkout/physical/order/co-tok" && so.fulfillment_status_label === "Partly shipped" && so.cancelled === false)
    check("  each line item carries the parcel: company, number and link", so.line_items[0].fulfillment?.tracking_company === "Royal Mail" && so.line_items[0].fulfillment?.tracking_number === "AB123456789GB" && /royalmail\.com/.test(so.line_items[0].fulfillment?.tracking_url))
    const cancelledOrder = (themeCustomer({ ...ANA, orders: [{ ...ANA.orders[0], status: "Cancelled", fulfillment_status: "cancelled" }] }).orders as Record<string, any>[])[0]
    check("  a cancelled order says cancelled and is not fulfilled", cancelledOrder.cancelled === true && cancelledOrder.fulfillment_status === "unfulfilled")
    const page = body(await call(plain, "GET", "/account", { account: { customer: shipping } }))
    check("  Storelib's account in the theme lists the parcel, linked to the carrier", /<ul class="sl-acc__track"><li><strong>In transit<\/strong> <a class="sl-acc__link" href="https:\/\/www\.royalmail\.com[^"]*" target="_blank" rel="noopener">Royal Mail AB123456789GB<\/a>/.test(page))
    check("withoutPasswordFields leaves every other field", withoutPasswordFields(`<input type="email" name="e"><p class="field"><input type='password' id=pw><label for="pw">Pw</label></p><button>Go</button>`) === `<input type="email" name="e"><button>Go</button>`)
    const errs = { __list__: ["form"], messages: { form: "Nope." } }
    check("default_errors reads messages by field", String(compatFilter("default_errors")!(errs, [], {}, undefined as never)).includes("<li>Nope.</li>"))
  }

  console.log("\nThe live route and the proxy\n")
  {
    const route = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("a theme's account form goes through the very code route a Storelib site's form posts to", /accountFormPost\(req\.method, sitePath, fields\)/.test(route) && /sendSignInCode\(onward\(req, "\/api\/site-account\/code", form\)\)/.test(route))
    check("with this request's own headers (its Origin, its address for the limits)", /const headers = new Headers\(req\.headers\)/.test(route))
    check("newsletter and contact posts only from this site's own page", /formPost && !sameOriginForm\(req, hostOf\(req\)\)/.test(route))
    check("and sent through the subscribe and contact endpoints, with their checks", /subscribeRoute : contactRoute/.test(route))
    check("who is visiting is the website's own session, for this site's creator", /siteAccountOf\(req, found\.site\.creatorId/.test(route) && /visitorFrom\(cookieFrom\(request, sessionCookieName\(host\)\), host, \{ creatorId \}\)/.test(read("lib/site-accounts/theme-visitor.ts")))
    check("never on a preview", /const accountPost = token \? null :/.test(route) && /const account = token \|\|/.test(route))
    const proxy = read("proxy.ts")
    check("every /account address but sign out is the theme's, whatever the method", /if \(pathname === "\/account" \|\| pathname\.startsWith\("\/account\/"\)\) return pathname !== "\/account\/logout"/.test(proxy))
    check("the wishlist's frame may be framed by its own site, and only that request", /pathname === "\/wishlist" && request\.nextUrl\.searchParams\.has\("sl_embed"\)\) response\.headers\.set\("Content-Security-Policy", "frame-ancestors 'self'"\)/.test(proxy) && (proxy.match(/selfFramedWishlist\(/g) ?? []).length === 3)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
