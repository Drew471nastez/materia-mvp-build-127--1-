/**
 * ===========================================================================
 *  ROUND BC: CUSTOMER ACCOUNTS ON A WEBSITE, FINISHED
 * ===========================================================================
 * A customer signed in on a website (a Storelib theme's or an imported
 * Shopify theme's) can now change their name and phone number, keep their
 * own address book (add, change, delete, pick the default), and checkout
 * fills in that default. The account screens and the sign in notices are
 * in the page's language through the shop's own words, and /fr/account/login
 * stays French after the code step. The order lookup page is in the
 * website's language too, and its emails link the seller's own host.
 *
 * Run with:  npx tsx --conditions react-server tests/round-bc-accounts.test.ts
 */
process.env.SITE_ACCOUNT_SECRET = "test-secret-for-round-bc-accounts-0123456789"

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { changeBook, cleanAddress, cleanPhone, readAddressBook, updateBook, MAX_ADDRESSES, type SavedAddress } from "../lib/site-accounts/addresses"
import { customerById } from "../lib/site-accounts/customers"
import { addressBookOf, siteCustomer } from "../lib/site-accounts/account-data"
import { inLang, langOfRoot } from "../lib/site-accounts/lang-path"
import { mintPending, readPending } from "../lib/site-accounts/token"
import { accountNoticeIn, signInNoticeIn, wordedCustomer } from "../lib/site-accounts/words"
import { withAccountWords } from "../lib/site-accounts/account-sections"
import { signInNotice } from "../lib/website-builder/account-pages"
import { accountContent, addressesContent, signInContent, themeCustomer } from "../lib/storelib-theme/compat/account"
import { accountFormPost } from "../lib/storelib-theme/compat/site"
import { UI_WORDS } from "../lib/markets/ui-words"
import { ACCOUNT_FORMS_SCRIPT } from "../lib/site-accounts/forms-script"
import { codeEmail } from "../lib/site-accounts/code-email"
import { inEmailLanguage } from "../lib/emails/words"
import { renderStorelibSection } from "../lib/website-builder/storelib-runtime"
import { compileSection } from "../lib/storelib-theme/storelib/compile"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { SITE_ROUTES } from "../lib/storelib-theme/globals"
import { CHECKOUT_SENTENCES, EMAIL_SENTENCES } from "../lib/markets/checkout-words.generated"
import type { SectionInstance, ThemeSettingsValues } from "../lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const CREATOR = "11111111-1111-4111-8111-111111111111"
const CUSTOMER = "22222222-2222-4222-8222-222222222222"
const OTHER = "33333333-3333-4333-8333-333333333333"
const CODE_ID = "44444444-4444-4444-8444-444444444444"

const US = { name: "Ana Pop", line1: "1 Main St", city: "Austin", region: "Texas", postalCode: "78701", country: "US" }
const FR = { name: "Ana Pop", line1: "3 rue de Rivoli", city: "Paris", postalCode: "75001", country: "FR" }

async function main() {
  console.log("\nAn address is checked as checkout checks it\n")
  {
    const ok = cleanAddress(US)
    check("a full US address is kept, the state as its code (checkout's list is by code)", ok.ok === true && ok.address.region === "TX" && ok.address.country === "US", ok)
    check("no street is refused at the street", (cleanAddress({ ...US, line1: "" }) as { why?: string }).why === "line1")
    check("no city at the city", (cleanAddress({ ...US, city: " " }) as { why?: string }).why === "city")
    check("a made-up country at the country", (cleanAddress({ ...US, country: "ZZ" }) as { why?: string }).why === "country")
    check("a US address with no state at the state", (cleanAddress({ ...US, region: "" }) as { why?: string }).why === "region")
    check("a country that uses postal codes, without one, at the postal code", (cleanAddress({ ...FR, postalCode: "" }) as { why?: string }).why === "postal")
    check("a bad phone at the phone", (cleanAddress({ ...FR, phone: "call me" }) as { why?: string }).why === "phone")
    check("markup typed into a field never survives", cleanAddress({ ...FR, name: "<b>Ana</b>" }).ok === true && !JSON.stringify(cleanAddress({ ...FR, name: "<b>Ana</b>" })).includes("<b>"))
    check("a phone with its country code is kept as E.164", cleanPhone("+44 20 7946 0958") === "+442079460958")
    check("an empty phone clears it; nonsense is refused", cleanPhone("  ") === "" && cleanPhone("call me") === null && cleanPhone(42) === null)
  }

  console.log("\nThe address book: add, change, delete, the default\n")
  {
    let n = 0
    const id = () => `id${++n}`
    const one = changeBook([], { kind: "save", id: null, fields: US, makeDefault: false }, id)
    check("the first address added is the default", one.ok === true && one.book.length === 1 && one.book[0].default === true && one.id === "id1")
    const book1 = (one as { book: SavedAddress[] }).book
    const two = changeBook(book1, { kind: "save", id: null, fields: FR, makeDefault: true }, id)
    const book2 = (two as { book: SavedAddress[] }).book
    check("a second one asked to be the default takes it, and only it", two.ok === true && book2.filter((a) => a.default).length === 1 && book2.find((a) => a.default)?.id === "id2")
    const edited = changeBook(book2, { kind: "save", id: "id1", fields: { ...US, city: "Dallas" }, makeDefault: false }, id)
    const book3 = (edited as { book: SavedAddress[] }).book
    check("changing one keeps its id and whether it is the default", edited.ok === true && book3.find((a) => a.id === "id1")?.city === "Dallas" && book3.find((a) => a.id === "id1")?.default === false)
    const def = changeBook(book3, { kind: "default", id: "id1" }, id)
    check("Set as default moves the default", def.ok === true && (def as { book: SavedAddress[] }).book.find((a) => a.default)?.id === "id1")
    const gone = changeBook((def as { book: SavedAddress[] }).book, { kind: "delete", id: "id1" }, id)
    check("deleting the default makes the next one the default", gone.ok === true && (gone as { book: SavedAddress[] }).book.length === 1 && (gone as { book: SavedAddress[] }).book[0].default === true)
    check("an id not in the book is missing, never a new entry", (changeBook(book1, { kind: "save", id: "nope", fields: US, makeDefault: false }) as { why?: string }).why === "missing" && (changeBook(book1, { kind: "delete", id: "nope" }) as { why?: string }).why === "missing")
    let full: SavedAddress[] = []
    for (let i = 0; i < MAX_ADDRESSES; i++) full = (changeBook(full, { kind: "save", id: null, fields: US, makeDefault: false }, id) as { book: SavedAddress[] }).book
    check(`the book keeps at most ${MAX_ADDRESSES}`, (changeBook(full, { kind: "save", id: null, fields: US, makeDefault: false }, id) as { why?: string }).why === "full")
    check("a book never changed reads as null, an emptied one as empty", readAddressBook(null) === null && Array.isArray(readAddressBook([])) && readAddressBook([])!.length === 0)
    check("a stored entry that is not an address is dropped, never drawn", readAddressBook([{ id: "x", line1: "", country: "US" }, { id: "y", line1: "2 Elm", city: "Austin", country: "US" }, "junk"])!.map((a) => a.id).join() === "y")
  }

  console.log("\nStored on the customer's own row, never another's\n")
  {
    const db = new FakeSupabase()
    db.table("site_customers", {}, [
      { id: CUSTOMER, creator_id: CREATOR, email: "ana@mail.test", name: "Ana", created_at: "2026-09-01T00:00:00Z", phone: null, addresses: null },
      { id: OTHER, creator_id: CREATOR, email: "bea@mail.test", name: "Bea", created_at: "2026-09-01T00:00:00Z", phone: null, addresses: null },
    ])
    db.table("commerce_checkouts", {}, [
      { id: "co1", creator_id: CREATOR, buyer_email: "ana@mail.test", status: "paid", paid_at: "2026-09-10T00:00:00Z", shipping_address: { ...US } },
      { id: "co2", creator_id: CREATOR, buyer_email: "bea@mail.test", status: "paid", paid_at: "2026-09-11T00:00:00Z", shipping_address: { ...FR, name: "Bea" } },
    ])
    const scope = { customerId: CUSTOMER, creatorId: CREATOR }
    const row = await customerById(db, scope)
    check("the customer row carries the phone and the book", !!row && "addresses" in row && "phone" in row)
    const seeded = await addressBookOf(db, row!)
    check("never changed: the book is the addresses this customer's orders went to, theirs only", seeded.length === 1 && seeded[0].line1 === "1 Main St" && seeded[0].default === true && seeded[0].id === "o1")
    const seed = async () => seeded
    const added = await updateBook(db, scope, { kind: "save", id: null, fields: FR, makeDefault: false }, seed)
    const mine = db.rows("site_customers").find((r) => r.id === CUSTOMER)!
    check("the first change starts from those, so nothing the customer saw disappears", added.ok === true && Array.isArray(mine.addresses) && mine.addresses.length === 2 && mine.addresses[0].id === "o1")
    check("and nobody else's row was touched", db.rows("site_customers").find((r) => r.id === OTHER)!.addresses === null)
    const deleted = await updateBook(db, scope, { kind: "delete", id: "o1" }, seed)
    check("deleting the seeded one works by the id the page showed", deleted.ok === true && mine.addresses.length === 1 && mine.addresses[0].default === true)
    const account = await siteCustomer(db, { ...row!, addresses: mine.addresses }, "")
    check("the account's customer has the book, default first, each with its fields and lines", account.addresses?.length === 1 && account.addresses[0].country_code === "FR" && account.addresses[0].lines.includes("France") && account.default_address?.id === account.addresses[0].id)
    /* Before part 283: the new columns are missing. */
    const old = {
      from: (t: string) => {
        const q = db.from(t)
        const select = q.select.bind(q)
        q.select = (cols: string) => (/addresses/.test(cols) ? { eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42703", message: "column site_customers.phone does not exist" } }) }) }) } : select(cols)) as never
        return q
      },
    }
    const fallback = await customerById(old, scope)
    check("a database without the new columns still signs the customer in (never everybody out)", fallback?.id === CUSTOMER)
    const refused = await updateBook(old, scope, { kind: "save", id: null, fields: FR, makeDefault: false }, seed)
    check("and saving an address there says it is not available yet", refused.ok === false && refused.why === "unavailable")
  }

  console.log("\nThe language stays through every step\n")
  {
    check("a path goes under the language's prefix", inLang("/fr", "/account") === "/fr/account" && inLang("/fr", "/") === "/fr" && inLang("/fr", "/account/login?error=code") === "/fr/account/login?error=code")
    check("never twice, and never for the API, checkout or a receipt", inLang("/fr", "/fr/account") === "/fr/account" && inLang("/fr", "/checkout?x=1") === "/checkout?x=1" && inLang("/fr", "/api/site-account/code") === "/api/site-account/code" && inLang("/fr", "/receipt/abc") === "/receipt/abc")
    check("no prefix, no change", inLang("", "/account") === "/account" && langOfRoot("/pt-br") === "pt-br")
    const note = mintPending({ codeId: CODE_ID, email: "ana@mail.test", creatorId: CREATOR, host: "shop.test", returnPath: "/account", lang: "/fr" })
    check("the code step's note keeps the language the sign in began in", readPending(note)?.l === "/fr")
    check("a note never takes a language that is not a prefix", readPending(mintPending({ codeId: CODE_ID, email: "ana@mail.test", creatorId: CREATOR, host: "shop.test", returnPath: "/account", lang: "//evil.test" }))?.l === undefined)
    const codeRoute = code("app/api/site-account/code/route.ts")
    check("the code route answers under the form's language (or the note's, for Send a new code)", /const root = await siteLangRoot\(creatorId, form\?\.get\("lang"\) \?\? \(noted\?\.l \? langOfRoot\(noted\.l\) : null\)\)/.test(codeRoute) && /new URL\(inLang\(root, "\/account\/login"\), originOf\(host\)\)/.test(codeRoute) && /lang: root \|\| null/.test(codeRoute))
    const verify = code("app/api/site-account/verify/route.ts")
    check("verify sends a wrong code and the signed in visitor back under the note's language", /inLang\(root, "\/account\/login"\)\}\?error=/.test(verify) && /new URL\(inLang\(root, result\.returnPath\), origin\)/.test(verify))
    check("Use a different email keeps it too", /const root = note\?\.l \?\?/.test(code("app/api/site-account/restart/route.ts")))
    check("the language is only one the website publishes", /langs\.others\.find/.test(code("lib/site-accounts/lang.ts")))
    const login = code("themes/default/sections/main_login.storelib")
    check("every native sign in form sends the page's language", (login.match(/name="lang" value="\{\{ page\.lang \}\}"/g) ?? []).length === 3)
    check("  and the page says what its language is", /page: Record<string, unknown> = \{ lang: /.test(code("app/(site)/w/[username]/render-account.tsx")))
    const fr = signInContent({ step: "email", returnTo: "/account", root: "/fr", words: { sign_in: "Se connecter", acct_continue: "Continuer" } })
    check("an imported theme's sign in in French: its words, and the language sent back", /<h1>Se connecter<\/h1>/.test(fr) && /Continuer<\/button>/.test(fr) && /<input type="hidden" name="lang" value="fr">/.test(fr))
    const step = signInContent({ step: "code", email: "a<b@mail.test", returnTo: "/account", root: "/fr", words: { acct_code_sent: "Code envoyé à {email}." } })
    check("  the code step too, the email escaped inside the translated sentence", /Code envoyé à <strong>a&lt;b@mail\.test<\/strong>\./.test(step) && (step.match(/name="lang" value="fr"/g) ?? []).length === 2)
    check("  and in English, exactly what it said before", /<h1>Check your email<\/h1>/.test(signInContent({ step: "code", email: "a@b.co", returnTo: "/account" })) && /We sent a 6 digit code to <strong>a@b\.co<\/strong>\. It works for 10 minutes\./.test(signInContent({ step: "code", email: "a@b.co", returnTo: "/account" })))
    const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("a theme's own sign in form is sent on with the page's language", /if \(locale\) form\.set\("lang", locale\)\s*\n\s*return sendSignInCode/.test(route))
  }

  console.log("\nThe account's words, in the page's language\n")
  {
    check("every sign in notice is a shop word, the English unchanged", signInNotice("code") === "That code is not right. Check it and try again." && signInNotice("restart") === UI_WORDS.acct_notice_restart && signInNotice("<script>") === null)
    check("  and translated where the shop's words have it", signInNoticeIn({ acct_notice_code: "Ce code n'est pas bon." }, "code") === "Ce code n'est pas bon.")
    const q = (o: Record<string, string>) => new URLSearchParams(o)
    check("the account's notices: saved, a refused phone, an address saved or refused", accountNoticeIn(undefined, q({ profile: "saved" }))?.text === "Saved." && accountNoticeIn(undefined, q({ profile: "phone" }))?.error === true && accountNoticeIn(undefined, q({ address: "saved" }))?.error === false && accountNoticeIn(undefined, q({ address: "line1" }))?.text === "Enter the street address.")
    check("a code nobody knows prints nothing", accountNoticeIn(undefined, q({ address: "<b>" })) === null)
    const c = { orders: [{ date: "Sep 21, 2026", created_at: "2026-09-21T10:00:00Z", status: "Shipped", action_label: "Track order", items: [{ title: "Mug" }, { title: "No longer available" }], tracking: [{ status: "In transit" }], title: "Mug and 1 more" }] }
    const w = wordedCustomer(c, { acct_status_shipped: "Expédiée", acct_track_order: "Suivre", acct_status_in_transit: "En transit", acct_no_longer_available: "Plus disponible", acct_and_more: "{title} et {count} de plus" }, "fr")
    check("an order's status, button, parcel and date in the page's language", w.orders[0].status === "Expédiée" && w.orders[0].action_label === "Suivre" && w.orders[0].tracking![0].status === "En transit" && /sept\.? 2026/.test(w.orders[0].date), w.orders[0])
    check("  a gone product and the summary too", w.orders[0].items[1].title === "Plus disponible" && w.orders[0].title === "Mug et 1 de plus")
    check("  and with no words and no language, the very same object", wordedCustomer(c, undefined, null) === c)
    const sections = [{ id: "l", type: "main_login", name: "Sign in", settings: { heading: "Bienvenue" }, blocks: [] }] as unknown as SectionInstance[]
    const worded = withAccountWords(sections, { sign_in: "Se connecter", acct_send_new_code: "Renvoyer un code" })
    const st = worded[0].settings as Record<string, unknown>
    check("a generated sign in page's texts left at their defaults take the translated word", st.resend_label === "Renvoyer un code" && st.signin_label === "Se connecter")
    check("  a text the creator typed is never touched", st.heading === "Bienvenue")
    check("  and without words, nothing changes", withAccountWords(sections, {}) === sections)
    const keyOk = Object.keys(UI_WORDS).every((k) => /^[a-z_]+$/.test(k))
    check("every word key is one Translate can store (ui:[a-z_]+)", keyOk)
    check("the code email is translated like the other buyer emails", EMAIL_SENTENCES.includes("Your sign in code") && EMAIL_SENTENCES.includes("{code} is your code for {store}"))
    const french = inEmailLanguage("fr", { "Your sign in code": "Votre code de connexion" }, () => codeEmail({ store: "Maralind", code: "123456", host: "maralind.com", minutes: 10 }))
    check("  built in the page's language", /Votre code de connexion/.test(french.html) && codeEmail({ store: "Maralind", code: "123456", host: "maralind.com", minutes: 10 }).subject === "123456 is your code for Maralind")
  }

  console.log("\nAn imported theme's account: phone, address book, its own forms\n")
  {
    const ana = { name: "Ana Pop", first_name: "Ana", email: "ana@mail.test", phone: "+15125550100", orders: [], orders_count: 0, addresses: [{ id: "a1", default: true, lines: ["Ana Pop", "1 Main St", "Austin, TX 78701", "United States"], name: "Ana Pop", line1: "1 Main St", city: "Austin", region: "TX", postal_code: "78701", country_code: "US", country: "United States" }] }
    const html = accountContent(ana)
    check("the account shows the phone with Edit, and the default address with a way to the book", /\+15125550100/.test(html) && /href="\/account\?edit=phone#profile"/.test(html) && /href="\/account\/addresses"/.test(html) && /sl-acc__badge">Default</.test(html))
    const editing = accountContent(ana, { edit: "phone" })
    check("Edit phone opens a field posted to the profile route, said in place when refused", /action="\/api\/site-account\/profile" data-storelib-form="native" data-sl-async/.test(editing) && /name="phone" type="tel"/.test(editing) && /data-sl-msg-phone="Check the phone number/.test(editing))
    const book = addressesContent(ana)
    check("/account/addresses lists each address with Edit, Set as default (not on the default) and Delete", /href="\/account\/addresses\?edit=a1#address-form"/.test(book) && !/value="default"/.test(book) && /name="action" value="delete"/.test(book) && /data-sl-confirm="Delete this address\?"/.test(book))
    const form = addressesContent(ana, { mode: "edit", address: ana.addresses[0], countries: [{ code: "US", name: "United States" }, { code: "FR", name: "France" }] })
    check("its form has checkout's fields, filled, the country chosen, posted to the address book", /action="\/api\/site-account\/addresses"/.test(form) && /name="id" value="a1"/.test(form) && /name="line1" value="1 Main St"/.test(form) && /<option value="US" selected>United States<\/option>/.test(form) && /data-sl-msg-line1="Enter the street address\."/.test(form) && /data-sl-field="postal"/.test(form))
    const empty = addressesContent({ ...ana, addresses: [] }, { mode: "new", countries: [] })
    check("a first address is ticked to be the default", /name="default" value="1" checked/.test(empty))
    const drop = themeCustomer(ana) as { addresses: { address1: string; province_code: string; zip: string; country_code: string; url: string }[]; default_address: { id: string }; phone: string }
    check("the theme's `customer.addresses` read the book's own fields", drop.addresses[0].address1 === "1 Main St" && drop.addresses[0].province_code === "TX" && drop.addresses[0].zip === "78701" && drop.addresses[0].country_code === "US" && drop.default_address.id === "a1" && drop.phone === "+15125550100")
    const del = accountFormPost("POST", "/account/addresses/a1", { form_type: "customer_address", _method: "delete" })
    check("a theme's delete form deletes that address", del?.kind === "address" && del.action === "delete" && del.id === "a1")
    const put = accountFormPost("POST", "/account/addresses/a1", { form_type: "customer_address", _method: "put", "address[first_name]": "Ana", "address[address1]": "2 Elm", "address[country]": "FR", "address[zip]": "75001", "address[city]": "Paris", "address[default]": "1" })
    check("its edit form changes that one, and can make it the default", put?.kind === "address" && put.action === "save" && put.id === "a1" && put.fields.country === "FR" && put.makeDefault === true)
    const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("the site route sends it through the address book route, with the page's language", /return saveAddress\(onward\(req, "\/api\/site-account\/addresses", form\)\)/.test(route))
    check("the forms are pressed once, with a spinner, and said in place", /data-sl-busy/.test(ACCOUNT_FORMS_SCRIPT) && /Accept:"application\/json"/.test(ACCOUNT_FORMS_SCRIPT) && /pageshow/.test(ACCOUNT_FORMS_SCRIPT) && /data-sl-confirm/.test(ACCOUNT_FORMS_SCRIPT))
    let parses = true
    try {
      new Function(ACCOUNT_FORMS_SCRIPT)
    } catch {
      parses = false
    }
    check("  and the script parses", parses)
  }

  console.log("\nA Storelib theme's account page: phone and address book\n")
  {
    const r = compileSection(DEFAULT_THEME_SOURCES["sections/main_account.storelib"], { file: "sections/main_account.storelib" })
    check("main_account compiles with no warnings", r.ok === true && !r.warnings, r.ok === true ? r.warnings : r.errors)
    check("the address book's route is one of the website's routes", SITE_ROUTES.account_addresses_url === "/api/site-account/addresses")
    const theme = { brand_name: "Maralind" } as unknown as ThemeSettingsValues
    const customer = { name: "Ana", first_name: "Ana", email: "ana@mail.test", phone: "", orders: [], orders_count: 0, sample: false, addresses: [{ id: "a1", default: true, lines: ["Ana Pop", "1 Main St", "Austin, TX 78701", "United States"], name: "Ana Pop", line1: "1 Main St", city: "Austin", region: "TX", postal_code: "78701", country_code: "US", country: "United States", phone: "" }, { id: "a2", default: false, lines: ["Ana Pop", "3 rue de Rivoli", "Paris 75001", "France"], name: "Ana Pop", line1: "3 rue de Rivoli", city: "Paris", region: "", postal_code: "75001", country_code: "FR", country: "France", phone: "" }] }
    const draw = (page: Record<string, unknown>) => {
      const out = renderStorelibSection({ id: "acct", type: "main_account", name: "Account", settings: {}, blocks: [] } as SectionInstance, theme, { template: "page.account", ...page }, undefined, [], undefined, { customer: customer as never, wishlist: null })
      if (out.ok === false) throw new Error(JSON.stringify(out.errors))
      return out.html.replace(/\s+/g, " ")
    }
    const html = draw({ lang: "fr" })
    check("the book lists both, the default marked, with Add address", /addr__badge">Default</.test(html) && /3 rue de Rivoli/.test(html) && /href="\/account\?edit=address#addresses"/.test(html))
    check("Edit, Set as default only on the other, Delete on each", /href="\/account\?edit=address:a2#addresses"/.test(html) && (html.match(/name="action" value="default"/g) ?? []).length === 1 && (html.match(/name="action" value="delete"/g) ?? []).length === 2)
    check("every form sends the page's language", (html.match(/name="lang" value="fr"/g) ?? []).length >= 5)
    check("the phone row is there, Not added, with Edit", /href="\/account\?edit=phone#profile"/.test(html) && /Phone/.test(html))
    const form = draw({ address_mode: "edit", address: customer.addresses[1], countries: [{ code: "US", name: "United States" }, { code: "FR", name: "France" }] })
    check("the open form is filled, its country chosen, its messages the shop's words", /name="id" value="a2"/.test(form) && /<option value="FR" selected>France<\/option>/.test(form) && /data-sl-msg-postal="Check the postal code\."/.test(form) && /name="postal_code" type="text" value="75001"/.test(form))
    const notice = draw({ address_notice: "Enter the city.", address_error: true })
    check("a refused address is said as an alert in the book's block", /<p class="acct__notice sl-acc-in is-error" role="alert">Enter the city\.<\/p>/.test(notice))
    const phone = draw({ edit: "phone" })
    check("Edit phone opens the field, sent in place", /name="phone" type="tel"/.test(phone) && /data-sl-async/.test(phone))
  }

  console.log("\nCheckout fills in the default address\n")
  {
    const server = code("lib/checkout/site-checkout-server.ts")
    check("the signed in buyer comes with their default address, from their own row", /const book = await addressBookOf\(db, customer\)/.test(server) && /book\.find\(\(a\) => a\.default\)/.test(server))
    const client = code("app/checkout/site/site-checkout.tsx")
    check("the checkout's address starts as that address", /buyer\?\.address\?\.line1 \? \{ \.\.\.EMPTY_ADDRESS, \.\.\.buyer\.address/.test(client))
    const page = code("app/checkout/site/page.tsx")
    check("and is priced for its country from the first frame", /const countryOf = \(b: Awaited<typeof buyerRead>\) => countryCode\(b\?\.address\?\.country\) \?\? initialCountry/.test(page) && /initialCountry=\{countryOf\(buyer\)\}/.test(page))
  }

  console.log("\nThe order lookup, in the website's language, on the seller's host\n")
  {
    const page = code("app/checkout/site/track/page.tsx")
    check("its words go through the checkout's translations", /const ct = checkoutT\(language\.lang, language\.words\)/.test(page) && /ct\("Track your order"\)/.test(page) && !/>Track your order</.test(page))
    check("  which list them in Translate", CHECKOUT_SENTENCES.includes("Look up another order") && CHECKOUT_SENTENCES.includes("Email me the link"))
    const route = code("app/api/checkout/site/track/route.ts")
    check("the emailed link is the order on this website's own host, in the page's language", /const url = `\$\{site\.origin\}\$\{found\.path\}/.test(route) && /inEmailLanguage\(language\.lang, language\.words, build\)/.test(route))
  }

  console.log("\nThe database part\n")
  {
    const sql = code("supabase/sql/run-now/283_site_customer_addresses.sql")
    check("one part adds the phone and the book, safe to run twice", /ADD COLUMN IF NOT EXISTS phone text/.test(sql) && /ADD COLUMN IF NOT EXISTS addresses jsonb/.test(sql) && /jsonb_array_length\(addresses\) <= 10/.test(sql))
    check("every line one whole statement", sql.trim().split("\n").every((l) => l.startsWith("/*") || /;\s*$/.test(l)))
    check("and the README its row", /`283_site_customer_addresses\.sql`/.test(code("supabase/sql/run-now/README.md")))
  }

  console.log("\nCopy\n")
  {
    const files = ["lib/site-accounts/words.ts", "lib/site-accounts/addresses.ts", "lib/site-accounts/forms-script.ts", "lib/storelib-theme/compat/account.ts", "themes/default/sections/main_account.storelib", "app/api/site-account/addresses/route.ts"]
    const words = Object.values(UI_WORDS).filter((_, i) => Object.keys(UI_WORDS)[i].startsWith("acct_")).join("\n")
    for (const f of files) check(`${f}: no em dash and none of the banned words`, !/—|\b(unlock|elevate|seamless|powerful|effortless|supercharge)\b/i.test(code(f)))
    check("the account words: no em dash and none of the banned words", !/—|\b(unlock|elevate|seamless|powerful|effortless|supercharge)\b/i.test(words))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
