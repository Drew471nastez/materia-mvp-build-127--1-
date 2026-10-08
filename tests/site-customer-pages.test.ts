/**
 * ===========================================================================
 *  THE PAGES A VISITOR USES ON A CREATOR'S WEBSITE, BESIDES THE PRODUCTS
 * ===========================================================================
 * Customer accounts, the wishlist, the contact form, the newsletter box and
 * the password page, each driven for real against a database that holds two
 * creators' data side by side:
 *
 *   SCOPED        a customer of website A never sees website B's orders,
 *                 addresses, saved items or session; a customer sees only
 *                 their own orders
 *   WISHLIST      the browser's list merges into the account on sign in,
 *                 only this creator's published products, once
 *   CONTACT       a message is emailed to the right creator with Reply to
 *                 the visitor, kept in their Messages, and put in THEIR
 *                 notifications panel; the trap and the limiter stop it first
 *   NEWSLETTER    the builder's canvas shows the success state and sends
 *                 nothing; a live page sends to the creator's Subscribers
 *   PASSWORD      kept as a salted hash, checked in constant time, limited
 *                 before any compare; a pass is good for one host, one
 *                 creator and one password; the preview, the API and the
 *                 owner's hand off get past; the hand off works once
 *   FIELDS        every field on these pages has a placeholder, set in the
 *                 section's settings
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase, type Row } from "./fake-supabase"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { SITE_ROUTES } from "@/lib/storelib-theme/globals"
import { accountPageSections, passwordSections } from "@/lib/website-builder/account-pages"
import { BUILT_IN_PAGE_KEYS, GENERATED_PAGE_KEYS, RESERVED_PAGE_KEYS, pageKeyFromSegment, pagePath } from "@/lib/website-builder/site-pages"
import { pageGroupOf } from "@/lib/website-builder/page-groups"
import { applyUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { mintSession } from "@/lib/site-accounts/token"
import { visitorFrom } from "@/lib/site-accounts/session"
import { customerById } from "@/lib/site-accounts/customers"
import { addressLines, customerAddresses, customerOrders, siteCustomer } from "@/lib/site-accounts/account-data"
import { listSiteWishlist, mergeIntoSiteWishlist } from "@/lib/site-accounts/wishlist-store"
import { handleContact, type ContactDeps } from "@/lib/site-contact/handle"
import { creatorEmail, type ContactMessage } from "@/lib/site-contact/contact"
import { messageNoticeRow, notifyCreatorOfMessage, type MessageNotice } from "@/lib/site-contact/notify"
import { signupMode, subscribeToCreator } from "@/lib/website-builder/subscribe-client"
import { cleanPassword, hashPassword, verifyPassword } from "@/lib/site-password/hash"
import { mintPass, passCookie, passCookieName, passHolds, readPass } from "@/lib/site-password/pass"
import { decide, gatedPath, passReturnPath } from "@/lib/site-password/gate"
import { createSiteGate } from "@/lib/site-password/proxy-gate"
import { publicAccess, readSiteAccess, saveSiteAccess } from "@/lib/site-password/store"
import { enterPassword, ownerHandOff, passwordNotice, spendOwnerPass } from "@/lib/site-password/enter"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

process.env.SITE_ACCOUNT_SECRET = "test-secret-for-site-customer-pages-0123456789"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; process.stdout.write(`  ok    ${label}\n`) }
  else { failed++; failures.push(label); process.stdout.write(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}`}\n`) }
}
function section(title: string) { process.stdout.write(`\n${title}\n`) }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* Two creators, side by side, and two customers each. */
const A = "aaaaaaaa-0000-4000-8000-00000000000a"
const B = "bbbbbbbb-0000-4000-8000-00000000000b"
const USER_A = "aaaaaaaa-1111-4000-8000-00000000000a"
const USER_B = "bbbbbbbb-1111-4000-8000-00000000000b"
const HOST_A = "maralind.storelib.com"
const HOST_B = "oskar.storelib.com"
const ANA = "ana.pop@mail.test"
const IOAN = "ioan@mail.test"
const CUST_ANA_A = "c0000000-0000-4000-8000-0000000000a1"
const CUST_IOAN_A = "c0000000-0000-4000-8000-0000000000a2"
const CUST_ANA_B = "c0000000-0000-4000-8000-0000000000b1"
const PA1 = "10000000-0000-4000-8000-0000000000a1"
const PA2 = "10000000-0000-4000-8000-0000000000a2"
const PA_DRAFT = "10000000-0000-4000-8000-0000000000a9"
const PB1 = "10000000-0000-4000-8000-0000000000b1"

function twoShops(): FakeSupabase {
  const db = new FakeSupabase()
  db.table("creators", {}, [
    { id: A, user_id: USER_A, support_email: "help@maralind.com", banned_at: null },
    { id: B, user_id: USER_B, support_email: "hello@oskar.com", banned_at: null },
  ])
  db.table("profiles", {}, [{ id: USER_A, email: "owner@maralind.com" }, { id: USER_B, email: "owner@oskar.com" }])
  db.table("products", {}, [
    { id: PA1, creator_id: A, title: "Linen apron", slug: "linen-apron", status: "published", type: "digital", thumbnail_url: null, price_cents: 6400, compare_at_cents: null },
    { id: PA2, creator_id: A, title: "Wash bag", slug: "wash-bag", status: "published", type: "physical", thumbnail_url: null, price_cents: 3800, compare_at_cents: null },
    { id: PA_DRAFT, creator_id: A, title: "Unreleased", slug: "unreleased", status: "draft", type: "digital", thumbnail_url: null, price_cents: 100, compare_at_cents: null },
    { id: PB1, creator_id: B, title: "Oak spoon", slug: "oak-spoon", status: "published", type: "digital", thumbnail_url: null, price_cents: 1200, compare_at_cents: null },
  ])
  const order = (id: string, creator: string, product: string, email: string, created: string, extra: Row = {}) => ({
    id, creator_id: creator, product_id: product, buyer_email: email, status: "completed", amount_cents: 1000, tip_cents: 0, currency: "usd",
    created_at: created, receipt_token: `tok-${id}-aaaaaaaaaaaa`, stripe_session_id: null, paypal_order_id: null, refund_amount_cents: null,
    shipped_at: null, delivered_at: null, variant_name: null, ...extra,
  })
  db.table("orders", {}, [
    order("0a000000-0000-4000-8000-000000000001", A, PA1, ANA, "2026-09-20T10:00:00Z"),
    order("0a000000-0000-4000-8000-000000000002", A, PA2, ANA, "2026-09-22T10:00:00Z"),
    order("0a000000-0000-4000-8000-000000000003", A, PA1, IOAN, "2026-09-21T10:00:00Z"),
    /* Ana bought from B too: that order is B's, and never on A's website. */
    order("0b000000-0000-4000-8000-000000000001", B, PB1, ANA, "2026-09-23T10:00:00Z"),
    /* A failed payment is never shown. */
    order("0a000000-0000-4000-8000-000000000004", A, PA1, ANA, "2026-09-24T10:00:00Z", { status: "failed" }),
  ])
  db.table("commerce_checkouts", {}, [
    { id: "cc-1", creator_id: A, buyer_email: ANA, status: "paid", paid_at: "2026-09-22T10:00:00Z", shipping_address: { name: "Ana Pop", line1: "9 Elm Row", line2: "", city: "Cluj", region: "CJ", postalCode: "400000", country: "RO" } },
    { id: "cc-2", creator_id: A, buyer_email: ANA, status: "paid", paid_at: "2026-09-10T10:00:00Z", shipping_address: { name: "Ana Pop", line1: "9 Elm Row", line2: "", city: "Cluj", region: "CJ", postalCode: "400000", country: "RO" } },
    { id: "cc-3", creator_id: B, buyer_email: ANA, status: "paid", paid_at: "2026-09-23T10:00:00Z", shipping_address: { name: "Ana Pop", line1: "1 Secret Lane", city: "Oslo", postalCode: "0150", country: "NO" } },
    { id: "cc-4", creator_id: A, buyer_email: IOAN, status: "paid", paid_at: "2026-09-21T10:00:00Z", shipping_address: { name: "Ioan", line1: "3 Other St", city: "Iasi", country: "RO" } },
  ])
  db.table("site_customers", { unique: [["creator_id", "email"]] }, [
    { id: CUST_ANA_A, creator_id: A, email: ANA, name: "Ana", created_at: "2026-09-01T00:00:00Z" },
    { id: CUST_IOAN_A, creator_id: A, email: IOAN, name: null, created_at: "2026-09-01T00:00:00Z" },
    { id: CUST_ANA_B, creator_id: B, email: ANA, name: "Ana B", created_at: "2026-09-01T00:00:00Z" },
  ])
  db.table("site_customer_wishlist", { unique: [["customer_id", "product_id"]], defaults: (d) => ({ created_at: d.now() }) }, [
    { customer_id: CUST_ANA_B, product_id: PB1, created_at: "2026-09-02T00:00:00Z" },
  ])
  return db
}

const theme = { brand_name: "Maralind", logo_url: "" } as unknown as ThemeSettingsValues

function draw(type: string, settings: Record<string, unknown> = {}, opts: { template?: string; page?: Record<string, unknown>; globals?: Parameters<typeof renderStorelibSection>[6] } = {}): string {
  const out = renderStorelibSection(
    { id: `s-${type}`, type, name: type, settings, blocks: [] } as SectionInstance,
    theme,
    { template: opts.template ?? "index", ...(opts.page ?? {}) },
    undefined,
    [],
    undefined,
    opts.globals,
  )
  if (out.ok === false) throw new Error(`${type}: ${JSON.stringify(out.errors)}`)
  return out.html.replace(/\s+/g, " ")
}

/** Every visible field in the markup that is missing a placeholder: name and type. */
function fieldsWithoutPlaceholder(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<(input|textarea)\b([^>]*)>/g)) {
    const attrs = m[2]
    const type = (attrs.match(/type="([^"]+)"/) ?? [])[1] ?? (m[1] === "textarea" ? "textarea" : "text")
    if (["hidden", "checkbox", "radio", "submit"].includes(type)) continue
    if (/tabindex="-1"/.test(attrs)) continue /* the trap no person sees */
    const ph = (attrs.match(/placeholder="([^"]*)"/) ?? [])[1]
    if (!ph || !ph.trim()) out.push(`${(attrs.match(/name="([^"]+)"/) ?? [])[1] ?? "?"}:${type}`)
  }
  return out
}

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The sections compile, and every field has a placeholder from its settings")
  // ═══════════════════════════════════════════════════════════════════════
  {
    for (const type of ["main_password", "main_login", "main_account", "main_wishlist", "contact"]) {
      const r = compileSection(DEFAULT_THEME_SOURCES[`sections/${type}.storelib`], { file: `sections/${type}.storelib` })
      check(`${type} compiles with no warnings`, r.ok === true && !r.warnings, r.ok === true ? r.warnings : r.errors)
    }
    const login = draw("main_login", {}, { template: "page.login", page: { step: "email", return_to: "/account" } })
    const code = draw("main_login", {}, { template: "page.login", page: { step: "code", email: ANA, return_to: "/account" } })
    const contact = draw("contact", {}, { template: "page.contact", globals: { shop: { name: "Maralind" } } })
    const password = draw("main_password", {}, { template: "page.password", page: { return_to: "/about", owner_url: "https://storelib.com/api/site-password/owner?host=maralind.storelib.com" }, globals: { shop: { name: "Maralind" } } })
    const accountEdit = draw("main_account", {}, { template: "page.account", page: { edit: "name" }, globals: { customer: { name: "", first_name: "", email: ANA, orders: [], orders_count: 0, addresses: [], sample: false } } })
    for (const [name, html] of [["sign in, email step", login], ["sign in, code step", code], ["contact", contact], ["password page", password], ["account, editing the name", accountEdit]] as const) {
      const missing = fieldsWithoutPlaceholder(html)
      check(`${name}: every field has a placeholder`, missing.length === 0 && /placeholder="/.test(html), missing)
    }
    check("the contact form's placeholders are the defaults a person reads", /placeholder="Your name"/.test(contact) && /placeholder="you@example.com"/.test(contact) && /placeholder="Write your message"/.test(contact))
    const own = draw("contact", { name_placeholder: "Wie heisst du?", message_placeholder: "Deine Nachricht" }, { template: "page.contact" })
    check("and a creator changes them in the section's settings", /placeholder="Wie heisst du\?"/.test(own) && /placeholder="Deine Nachricht"/.test(own))
    check("the sign in field says what to type", /placeholder="you@example.com"/.test(login) && /placeholder="6 digit code"/.test(code))
    check("the contact form keeps its trap, its success line and its 48px fields", /name="company" type="text" tabindex="-1"/.test(contact) && /data-storelib-success/.test(contact) && /min-height: 48px/.test(DEFAULT_THEME_SOURCES["sections/contact.storelib"]))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The password page, as a section a creator arranges")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const html = draw("main_password", {}, { template: "page.password", page: { return_to: "/about", owner_url: "https://storelib.com/api/site-password/owner?host=x", notice: "That password is not right. Try again." }, globals: { shop: { name: "Maralind" } } })
    check("the store's name when there is no logo", /class="pw__name">Maralind</.test(html))
    check("the heading and the line under it", /Opening soon/.test(html) && /Leave your email/.test(html))
    check("the email box joins the creator's Subscribers, with its own success line", /data-storelib-form="subscribe"/.test(html) && /type="email"/.test(html) && /data-storelib-success hidden>Thanks\. We will email you when we open\./.test(html))
    check("the password posts to the website's own route, with where to go after", new RegExp(`action="${SITE_ROUTES.password_enter_url}"`).test(html) && /type="password"/.test(html) && /name="return" value="\/about"/.test(html) && /data-storelib-form="native"/.test(html))
    check("a wrong password says so, once, as an alert", /role="alert">That password is not right/.test(html))
    check("the owner's way in", /href="https:\/\/storelib\.com\/api\/site-password\/owner\?host=x"/.test(html) && /Are you the owner\? Enter here/.test(html))
    const withLogo = renderStorelibSection({ id: "p", type: "main_password", name: "p", settings: { logo_width: 160 }, blocks: [] } as SectionInstance, { brand_name: "Maralind", logo_url: "https://cdn.test/logo.png" } as unknown as ThemeSettingsValues, { template: "page.password" }, undefined, [], undefined, {})
    check("the logo from Theme settings, at the width set", withLogo.ok === true && /<img class="pw__logo" src="https:\/\/cdn\.test\/logo\.png"/.test(withLogo.html) && /--pw-logo: 160px/.test(withLogo.html))
    const bare = draw("main_password", { show_signup: false, show_owner_link: false, heading: "Back in June" }, { template: "page.password", page: { owner_url: "https://storelib.com/x" } })
    check("the sign up and the owner link can be turned off, and the words changed", !/data-storelib-form="subscribe"/.test(bare) && !/Enter here/.test(bare) && /Back in June/.test(bare))
    const generated = passwordSections([{ id: "h", type: "header", name: "Header", settings: { color_scheme: "black" }, blocks: [], hidden: false } as SectionInstance])
    check("the generated page is one section, on the site's own ground, with no header or footer", generated.length === 1 && generated[0].type === "main_password" && (generated[0].settings as Record<string, unknown>).color_scheme === "black")
    check("accountPageSections knows it", accountPageSections("password", [])?.[0]?.type === "main_password")
    const pages = applyUniversalChrome({ home: [{ id: "h", type: "header" } as SectionInstance, { id: "f", type: "footer" } as SectionInstance], password: [{ id: "h2", type: "header" } as SectionInstance, { id: "p", type: "main_password" } as SectionInstance] })
    check("the live site takes any header or footer off the password page, and leaves the others theirs", pages.password.length === 1 && pages.password[0].type === "main_password" && pages.home.length === 2)
    check("the page key is the site's own: reserved, generated, built in, at /password, filed under Other",
      RESERVED_PAGE_KEYS.has("password") && GENERATED_PAGE_KEYS.has("password") && BUILT_IN_PAGE_KEYS.has("password") && pagePath("password") === "/password" && pageKeyFromSegment("password") === null && pageGroupOf("password") === "other")
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("and the builder opens it without the header and footer too", (editor.match(/CHROMELESS_PAGES\.has\(/g) ?? []).length === 2)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Customer accounts: one website's customer, their own orders only")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = twoShops()
    const anaOnA = await customerOrders(db, { creatorId: A, email: ANA }, "https://storelib.com")
    check("Ana on A sees her two orders from A, newest first", anaOnA.length === 2 && anaOnA[0].items[0].title === "Wash bag" && anaOnA[1].items[0].title === "Linen apron", anaOnA.map((o) => o.items[0]?.title))
    check("never her order from B, nor Ioan's from A, nor a failed payment", !anaOnA.some((o) => o.items.some((i) => i.title === "Oak spoon")) && anaOnA.every((o) => !o.id.endsWith("0003") && !o.id.endsWith("0004")))
    const ioanOnA = await customerOrders(db, { creatorId: A, email: IOAN }, "https://storelib.com")
    check("Ioan on A sees his one order only", ioanOnA.length === 1 && ioanOnA[0].id === "0a000000-0000-4000-8000-000000000003")
    const anaOnB = await customerOrders(db, { creatorId: B, email: ANA }, "https://storelib.com")
    check("Ana on B sees B's order only", anaOnB.length === 1 && anaOnB[0].items[0].title === "Oak spoon")
    const sneaky = await customerOrders(db, { creatorId: A, email: "%@mail.test" }, "https://storelib.com")
    check("a wildcard in an email matches nobody's orders", sneaky.length === 0)
    const ships = (o: (typeof anaOnA)[number]) => o.items.every((i) => i.title === "Wash bag")
    check("the download is the order's own receipt on storelib.com", anaOnA.filter((o) => !ships(o)).every((o) => o.action_url.startsWith("https://storelib.com/receipt/tok-0a")))
    check("an order that ships is followed on its own order page, with tracking, as a shop's account does", anaOnA.filter(ships).length > 0 && anaOnA.filter(ships).every((o) => o.action_url.startsWith("https://storelib.com/checkout/physical/order/tok-0a") && o.action_label === "Track order"), anaOnA.map((o) => `${o.items.map((i) => i.title).join("+")} ${o.action_label} ${o.action_url}`).join(" | "))

    const addresses = await customerAddresses(db, { creatorId: A, email: ANA })
    check("her addresses on A: the one her A orders went to, once", addresses.length === 1 && addresses[0].lines.join(" | ") === "Ana Pop | 9 Elm Row | Cluj, CJ 400000 | Romania", addresses)
    check("never the address she gave B", !JSON.stringify(addresses).includes("Secret Lane"))
    check("an address with nothing in it is not drawn", addressLines({}) === null && addressLines({ name: "Only a name" }) === null)
    const account = await siteCustomer(db, { id: CUST_ANA_A, creator_id: A, email: ANA, name: "Ana", created_at: null }, "https://storelib.com")
    check("the account object carries orders and addresses for this website", account.orders_count === 2 && account.addresses?.length === 1 && account.sample === false)
    const html = draw("main_account", {}, { template: "page.account", globals: { customer: account as unknown as Record<string, unknown>, wishlist: { items: [], count: 0, signed_in: true } } })
    check("the account page shows the addresses block", /id="addresses"/.test(html) && /9 Elm Row/.test(html))
    const noAddr = draw("main_account", {}, { template: "page.account", globals: { customer: { ...account, addresses: [] } as unknown as Record<string, unknown> } })
    check("and no Addresses heading for a shop with nothing shipped", !/id="addresses"/.test(noAddr))

    const sessionA = mintSession({ customerId: CUST_ANA_A, creatorId: A, host: HOST_A })!
    check("a session made on A is Ana on A", visitorFrom(sessionA, HOST_A, { creatorId: A })?.customerId === CUST_ANA_A)
    check("carried to B's host it is nobody", visitorFrom(sessionA, HOST_B) === null)
    check("asked for as B's customer it is nobody", visitorFrom(sessionA, HOST_A, { creatorId: B }) === null)
    check("a customer row is read only with its own creator", (await customerById(db, { customerId: CUST_ANA_A, creatorId: A }))?.email === ANA && (await customerById(db, { customerId: CUST_ANA_A, creatorId: B })) === null)
    check("the session cookie is httpOnly and host only", passCookieName(HOST_A).startsWith("__Host-") && read("lib/site-accounts/session.ts").includes("__Host-${SESSION_NAME}"))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The wishlist: the browser's list joins the account on sign in")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = twoShops()
    const scope = { customerId: CUST_ANA_A, creatorId: A }
    const before = await listSiteWishlist(db, scope)
    check("a new account starts empty on A, whatever Ana saved on B", before.available === true && before.ids.length === 0)
    const guest = [PA1, PB1, PA_DRAFT, "not-a-product", PA1]
    const merged = await mergeIntoSiteWishlist(db, scope, guest)
    check("only A's published products join: not B's, not a draft, not junk, once each", merged.ids.length === 1 && merged.ids[0] === PA1, merged)
    const again = await mergeIntoSiteWishlist(db, scope, guest)
    check("merging the same list twice adds nothing", again.ids.length === 1 && db.rows("site_customer_wishlist").filter((r) => r.customer_id === CUST_ANA_A).length === 1)
    await mergeIntoSiteWishlist(db, scope, [PA2])
    const both = await listSiteWishlist(db, scope)
    check("a later list adds what is new", both.ids.length === 2 && both.ids.includes(PA2))
    const ioan = await listSiteWishlist(db, { customerId: CUST_IOAN_A, creatorId: A })
    check("Ioan's list on the same website is his own", ioan.ids.length === 0)
    const onB = await listSiteWishlist(db, { customerId: CUST_ANA_B, creatorId: B })
    check("Ana's list on B is still only B's", onB.ids.length === 1 && onB.ids[0] === PB1)
    const crossed = await listSiteWishlist(db, { customerId: CUST_ANA_B, creatorId: A })
    check("a customer of B asked for as A's sees none of A's", crossed.ids.length === 0)
    const client = read("components/website-builder/site-wishlist.tsx")
    check("the page sends the browser's list to be merged once a sign in shows", /action: "merge", ids: guest/.test(client))
    const wl = DEFAULT_THEME_SOURCES["sections/main_wishlist.storelib"]
    check("the Wishlist page has columns, card style, alignment, width, colours and its empty line in settings",
      ["\"columns\"", "\"card_style\"", "\"text_align\"", "\"max_width\"", "\"color_scheme\"", "\"empty_text\""].every((k) => wl.includes(k)))
    const outlined = draw("main_wishlist", { card_style: "bordered" }, { template: "page.wishlist", globals: { wishlist: { items: [{ id: PA1, title: "Linen apron", price: "$64.00", compare_price: "", image: "", url: "/products/linen-apron", tag: "" }], count: 1, signed_in: false } } })
    check("a card style is drawn", /wl--bordered/.test(outlined) && /data-storelib-wishlist-card=/.test(outlined))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The contact form: emailed, kept and in the bell, for the right creator")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = twoShops()
    db.table("store_theme_installs", {}, [{ id: "inst-a", creator_id: A, status: "published", sort_order: 0 }])
    db.table("store_theme_pages", {}, [])
    db.table("subscribers", { defaults: () => ({ id: `s-${Math.random().toString(36).slice(2, 10)}` }), unique: [(r) => `${r.creator_id}|${r.email}`] })
    db.table("site_contact_messages", { defaults: (d) => ({ id: "5c000000-0000-4000-8000-000000000001", created_at: d.now(), read_at: null }) })
    db.table("seller_notifications", { defaults: () => ({ id: `n-${Math.random().toString(36).slice(2, 10)}` }) })
    const sent: { to: string; replyTo: string; subject: string; html: string }[] = []
    const notices: MessageNotice[] = []
    let limits = 0
    const deps: ContactDeps = {
      db,
      platform: "https://storelib.com",
      limit: async () => { limits++; return null },
      send: async (m) => { sent.push(m); return { success: true } },
      welcome: async () => {},
      source: () => ({ site: HOST_A, detail: { surface: "website", site: HOST_A, form: "contact", page: "contact" } }),
      brand: async () => "Maralind",
      recordSource: async () => {},
      notify: async (n) => { notices.push(n); await notifyCreatorOfMessage(db, n) },
    }
    const body = (extra: Record<string, unknown> = {}) => ({ creator_id: A, name: "Jo Visitor", email: "jo@example.org", subject: "My order", message: "Where is my parcel?", consent: false, company: "", elapsed: 9000, page: "contact", section_id: null, ...extra })

    const reply = await handleContact(body(), deps)
    check("a message is answered 200", reply.status === 200, reply)
    const mail = sent[0]
    check("(a) emailed to A's support address, Reply going to the visitor", mail?.to === "help@maralind.com" && mail?.replyTo === "jo@example.org")
    check("    the subject says who and where", mail?.subject === "New message from Jo Visitor on maralind.storelib.com: My order", mail?.subject)
    check("    and links to the message in Messages", /\/app\/emails\?tab=messages&amp;message=5c000000/.test(mail?.html ?? ""))
    const kept = db.rows("site_contact_messages")
    check("(b) kept for A, the creator whose form it was", kept.length === 1 && kept[0].creator_id === A && kept[0].message === "Where is my parcel?")
    const bell = db.rows("seller_notifications")
    check("(c) one row in the bell, for A's own user and A's creator", bell.length === 1 && bell[0].user_id === USER_A && bell[0].creator_id === A && notices[0]?.creatorId === A)
    check("    titled with who and where, opening the message", bell[0]?.title === "New message from Jo Visitor on maralind.storelib.com" && bell[0]?.action_url === "/app/emails?tab=messages&message=5c000000-0000-4000-8000-000000000001" && (bell[0]?.metadata as Row)?.area === "Messages")
    check("    with a type the table has always allowed and no engine kind", bell[0]?.type === "update" && bell[0]?.kind === undefined)
    check("nothing reached B: no email, no row, no bell", !sent.some((m) => m.to.includes("oskar")) && bell.every((r) => r.creator_id !== B))

    const trapped = await handleContact(body({ company: "Acme" }), deps)
    check("the trap answers 200 and sends, keeps and rings nothing", trapped.status === 200 && sent.length === 1 && db.rows("site_contact_messages").length === 1 && db.rows("seller_notifications").length === 1)
    const fast = await handleContact(body({ elapsed: 300 }), deps)
    check("so does a form sent faster than a person types", fast.status === 200 && sent.length === 1)
    const limitedDeps = { ...deps, limit: async () => ({ status: 429, error: "That is a lot of messages at once. Try again in a few minutes." }) }
    const limited = await handleContact(body(), limitedDeps)
    check("over the limit: 429 in plain words, and nothing sent", limited.status === 429 && /Try again/.test((limited.body as { error: string }).error) && sent.length === 1)
    const bad = await handleContact(body({ email: "nope" }), deps)
    check("a bad address is a plain 400", bad.status === 400 && (bad.body as { error: string }).error === "Enter a valid email address.")
    check("the limiter was asked before anything was written", limits >= 1)

    const row = messageNoticeRow({ creatorId: A, messageId: null, name: "", email: "x@y.z", subject: "", message: "a ".repeat(200), site: null }, USER_A)
    check("a long message is one short line in the bell, and with no site the title still reads", String(row.message).length <= 140 && row.title === "New message from x@y.z" && row.action_url === "/app/emails?tab=messages")
    const route = read("app/api/website-builder/contact/route.ts")
    check("the route rings the bell through notifyCreatorOfMessage, and limits per visitor, address and store", /notify: \(notice\) => notifyCreatorOfMessage\(db, notice\)/.test(route) && /bucket: "site-contact"/.test(route) && /bucket: "site-contact-inbox"/.test(route))
    const email = creatorEmail({ store: "Maralind", site: null, contactUrl: "https://storelib.com/app/emails", msg: { creatorId: A, name: "", email: "x@y.z", subject: "", message: "hi", consent: false, page: "contact", sectionId: null } as ContactMessage })
    check("without a site the subject names the store", email.subject === "New message from x@y.z on Maralind")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Messages in /app: the creator's own, read, marked and deleted through the server")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const api = code("app/api/email/messages/[id]/route.ts")
    check("the creator comes from the session, never the request", /auth\.getUser\(\)/.test(api) && /\.eq\("user_id", auth\.user\.id\)/.test(api) && !/creator_id\s*[:=]\s*body/.test(api))
    check("every change names the message AND the signed in creator", (api.match(/\.eq\("id", id\)\s*\.eq\("creator_id", creatorId\)/g) ?? []).length === 2 && (api.match(/\.eq\("id", id\)/g) ?? []).length === 2)
    check("another creator's id matches no row and answers 404, like one that does not exist", /data\.length !== 1\) return json\(\{ error: "Not found" \}, 404\)/.test(api))
    const data = read("app/app/emails/emails-data.ts")
    check("the list is read through the creator's own session and names their creator id", /from\("site_contact_messages"\)[\s\S]{0,120}\.eq\("creator_id", me\.creatorId\)/.test(data) && /createClient\(\)/.test(data))
    check("Messages is a tab of Emails, with the new ones counted", /\{ id: "messages", label: "Messages" \}/.test(read("app/app/emails/emails-home.tsx")) && /counts=\{\{ messages:/.test(read("app/app/emails/emails-home.tsx")))
    const sql = read("supabase/sql/run-now/92_site_password_and_inbox.sql")
    check("part 92 adds read_at where the messages table is, and is safe to run twice", /ADD COLUMN IF NOT EXISTS read_at timestamptz/.test(sql) && /to_regclass\('public\.site_contact_messages'\) IS NOT NULL/.test(sql))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The newsletter box: the builder shows it, a live page sends it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("in the builder's canvas a sign up is a preview", signupMode({ inEditor: true, creatorId: A }) === "preview")
    check("on a live page with no creator (a cover picture) it is not available, never a false thanks", signupMode({ inEditor: false, creatorId: null }) === "unavailable")
    check("on a live page of a website it is sent", signupMode({ inEditor: false, creatorId: A }) === "send")
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: JSON.parse(init?.body ?? "{}") })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch
    const out = await subscribeToCreator({ creatorId: A, email: " Ana@Mail.test ", placement: "password" })
    globalThis.fetch = realFetch
    check("live: one post to the subscribe route, for this creator, with where it came from", out.ok === true && calls.length === 1 && calls[0].url === "/api/website-builder/subscribe" && calls[0].body.creator_id === A && calls[0].body.placement === "password" && calls[0].body.email === "Ana@Mail.test")
    const host = code("components/website-builder/sections/StorelibSection.tsx")
    check("a section's email box asks signupMode first, and the canvas only settles the form", /if \(signupMode\(\{ inEditor: inCanvas, creatorId \}\) === "preview"\) \{\s*e\.preventDefault\(\)\s*if \(intent === "subscribe"\) settle\(form, "done"/.test(host))
    check("the password page's box is recorded as the coming soon page", /section\.type === "main_password" \? "password"/.test(host))
    const nl = code("components/website-builder/sections/renderers/NewsletterSection.tsx")
    check("the Newsletter section asks the same question and sends through the same client", /signupMode\(\{ inEditor: isEditing \|\| inEditor, creatorId \}\)/.test(nl) && /subscribeToCreator\(\{ creatorId, email, name, placement: "newsletter" \}\)/.test(nl))
    check("and no longer says it worked on a page with nobody to send to", /mode === "unavailable"/.test(nl) && !/!creatorId\) \{ setSubmitted\(true\)/.test(nl))
    const sub = code("app/api/website-builder/subscribe/route.ts")
    check("the route stores the subscriber under the creator, refuses a banned or missing one, and drops a filled trap", /creator_id: creatorId/.test(sub) && /banned_at/.test(sub) && /body\.company\.trim\(\) !== ""\) return NextResponse\.json\(\{ ok: true \}\)/.test(sub))
    check("and says where they signed up, for the coming soon page too", /password: "Asked to be told when this creator's website opens, on its coming soon page"/.test(read("app/api/website-builder/subscribe/route.ts")))
    check("the footer keeps its own canvas guard (its form is T3's)", /if \(inEditor\) \{\s*setState\("done"\)/.test(code("components/website-builder/sections/renderers/FooterSection.tsx")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The password: kept as a salted hash, checked without leaking time")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a password is 4 to 100 characters, ends trimmed", cleanPassword("  opensesame ") === "opensesame" && cleanPassword("abc") === null && cleanPassword("x".repeat(101)) === null && cleanPassword("a\u0000bcd") === null)
    const h1 = await hashPassword("opensesame")
    const h2 = await hashPassword("opensesame")
    check("stored as scrypt with its own salt, never the password", /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(h1) && !h1.includes("opensesame") && h1 !== h2)
    check("the right password matches, with the spaces a phone adds", (await verifyPassword("opensesame", h1)) && (await verifyPassword("opensesame ", h1)))
    check("a wrong one, an empty one and a changed hash do not", !(await verifyPassword("opensesam", h1)) && !(await verifyPassword("", h1)) && !(await verifyPassword("opensesame", h1.slice(0, -2) + "AA")))
    check("a hash asking for a cost no server writes is refused, not run", !(await verifyPassword("opensesame", h1.replace("$16384$", "$4194304$"))))
    check("the comparison is constant time", /timingSafeEqual\(got, expected\)/.test(read("lib/site-password/hash.ts")))

    const db = twoShops()
    db.table("site_access", { unique: [["creator_id"]] })
    check("off until a password is set", (await saveSiteAccess(db, A, { enabled: true })).ok === false)
    const on = await saveSiteAccess(db, A, { enabled: true, hash: h1 })
    check("on with a password, at version 2", on.ok === true && on.access.enabled && on.access.version === 2)
    const shown = publicAccess(await readSiteAccess(db, A))
    check("Website Settings is told on and set, never the hash", shown.enabled && shown.hasPassword && !JSON.stringify(shown).includes("scrypt"))
    check("B's website is untouched", (await readSiteAccess(db, B)).enabled === false)
    const settingsRoute = code("app/api/website-builder/site-password/route.ts")
    check("the settings route changes only the signed in user's own creator", /auth\.getUser\(\)/.test(settingsRoute) && /\.eq\("user_id", auth\.user\.id\)/.test(settingsRoute) && /saveSiteAccess\(createAdminClient\(\), who\.creatorId, change\)/.test(settingsRoute))
    check("and answers with publicAccess, not the row", /return json\(publicAccess\(/.test(settingsRoute) && !/password_hash/.test(settingsRoute))
    const sql = read("supabase/sql/run-now/92_site_password_and_inbox.sql")
    check("site_access is server only: row level security on, nothing for visitors or signed in users", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.site_access FROM PUBLIC, anon, authenticated/.test(sql) && !/CREATE POLICY/.test(sql))
    check("the migration and the run-now part are the same text", sql === read("supabase/migrations/20261103_t7_site_password_and_inbox.sql"))
    check("every line is a comment or one whole statement", sql.trim().split("\n").every((l) => (l.startsWith("/*") ? l.endsWith("*/") : l.trim().endsWith(";"))))
    check("it is listed in the run-now README", read("supabase/sql/run-now/README.md").includes("92_site_password_and_inbox.sql"))

    section("A pass: one host, one creator, one password")
    const now = Date.now()
    const pass = (await mintPass({ t: "pass", c: A, h: HOST_A, v: 2, e: now + 60_000 }))!
    check("good on A's host for A's password", await passHolds(pass, { creatorId: A, host: HOST_A, version: 2 }))
    check("not on B's host, not as B, not once the password changes", !(await passHolds(pass, { creatorId: A, host: HOST_B, version: 2 })) && !(await passHolds(pass, { creatorId: B, host: HOST_A, version: 2 })) && !(await passHolds(pass, { creatorId: A, host: HOST_A, version: 3 })))
    const [v, claims, mac] = pass.split(".")
    const forged = `${v}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(claims, "base64url").toString()), c: B })).toString("base64url")}.${mac}`
    check("a pass with its claims changed is nothing", (await readPass(forged)) === null)
    check("an expired one is nothing", !(await passHolds(await mintPass({ t: "pass", c: A, h: HOST_A, v: 2, e: now - 1 }), { creatorId: A, host: HOST_A, version: 2 })))
    const handoff = await mintPass({ t: "owner", c: A, h: HOST_A, v: 2, e: now + 60_000, j: "d0000000-0000-4000-8000-000000000001", u: USER_A })
    check("the owner's two minute note is not itself a pass", !(await passHolds(handoff, { creatorId: A, host: HOST_A, version: 2 })))
    check("the cookie is httpOnly, Secure, Lax, host only, thirty days", passCookieName(HOST_A) === "__Host-sl_site_pass" && passCookie(HOST_A).httpOnly && passCookie(HOST_A).secure && passCookie(HOST_A).sameSite === "lax" && passCookie(HOST_A).maxAge === 30 * 24 * 3600)

    section("What the password page stands in front of")
    check("every page", gatedPath("/") && gatedPath("/about") && gatedPath("/products/linen-apron") && gatedPath("/account") && gatedPath("/wishlist"))
    check("never the password page, the builder's preview, the API or a file", !gatedPath("/password") && !gatedPath("/preview/abc123/about") && !gatedPath("/api/site-password") && !gatedPath("/robots.txt") && !gatedPath("/_next/static/x.js"))
    check("a visitor without a pass is shown the password page", (await decide({ pathname: "/about", creatorId: A, version: 2, host: HOST_A, cookie: null })).blocked === true)
    check("with one, the website", (await decide({ pathname: "/about", creatorId: A, version: 2, host: HOST_A, cookie: pass })).blocked === false)
    check("a website that does not ask is open", (await decide({ pathname: "/about", creatorId: A, version: null, host: HOST_A, cookie: null })).protected === false)
    check("the preview link is open even on a protected website", (await decide({ pathname: "/preview/tok/about", creatorId: A, version: 2, host: HOST_A, cookie: null })).blocked === false)
    check("where to land afterwards is a path on this website only", passReturnPath("/about?x=1") === "/about?x=1" && passReturnPath("https://evil.test") === "/" && passReturnPath("//evil.test") === "/" && passReturnPath("/api/x") === "/" && passReturnPath("/password") === "/")

    section("The proxy's gate, with its cache")
    let reads = 0
    const counting = { from: (t: string) => { reads++; return db.from(t) } }
    const gate = createSiteGate({ db: () => counting })
    const freshDb = twoShops()
    freshDb.table("site_access", {})
    let freshReads = 0
    const quiet = createSiteGate({ db: () => ({ from: (t: string) => { freshReads++; return freshDb.from(t) } }) })
    const r0 = await quiet({ name: "oskar", host: HOST_B, pathname: "/", cookie: null })
    await quiet({ name: "oskar", host: HOST_B, pathname: "/about", cookie: null })
    check("while no website asks, nothing is looked up per request: one read, then none", r0.blocked === false && freshReads === 1, freshReads)
    db.table("profiles", {}, [{ id: USER_A, username: "maralind" }, { id: USER_B, username: "oskar" }])
    const blocked = await gate({ name: "maralind", host: HOST_A, pathname: "/about", cookie: null })
    const open = await gate({ name: "maralind", host: HOST_A, pathname: "/about", cookie: pass })
    const other = await gate({ name: "oskar", host: HOST_B, pathname: "/about", cookie: null })
    check("A asks: no pass is the password page, a pass is the website", blocked.blocked === true && open.blocked === false && open.protected === true)
    check("B does not ask, and is open", other.blocked === false && other.protected === false)
    const proxy = read("proxy.ts")
    check("the proxy asks it on a subdomain and on a connected domain, before the page is rewritten", (proxy.match(/await passwordPageFor\(request, /g) ?? []).length === 2 && /to\.pathname = `\/w\/\$\{name\}\/password`/.test(proxy))
    check("and a protected page is never handed to a shared cache", (proxy.match(/"private, no-store"/g) ?? []).length >= 3)

    section("Getting in: the password, or the owner")
    const deps = { db, owner: async (h: string) => (h === HOST_A ? { creatorId: A } : h === HOST_B ? { creatorId: B } : null), limited: async () => false, now }
    const right = await enterPassword({ host: HOST_A, password: "opensesame", returnTo: "/about" }, deps)
    check("the right password: a pass for this host, and on to the page asked for", right.ok === true && right.to === "/about" && (await passHolds(right.ok === true ? right.pass : "", { creatorId: A, host: HOST_A, version: 2 })))
    const wrong = await enterPassword({ host: HOST_A, password: "guess", returnTo: "/about" }, deps)
    check("a wrong one: back to the password page with the reason and the page", wrong.ok === false && wrong.to === "/password?error=wrong&return=%2Fabout")
    const limited = await enterPassword({ host: HOST_A, password: "opensesame", returnTo: "/" }, { ...deps, limited: async () => true })
    const enterSrc = code("lib/site-password/enter.ts")
    check("over the limit even the right password is refused, and the limit is asked before any compare",
      limited.ok === false && limited.why === "limit" && enterSrc.indexOf("await deps.limited(site.creatorId)") > 0 && enterSrc.indexOf("await deps.limited(site.creatorId)") < enterSrc.indexOf("await verifyPassword("))
    check("A's password does not open B", (await enterPassword({ host: HOST_B, password: "opensesame", returnTo: "/" }, deps)).ok === "open")
    check("the reasons are fixed sentences", passwordNotice("wrong") === "That password is not right. Try again." && passwordNotice("<script>") === null)
    db.table("site_account_codes", { unique: [["jti"]] })
    const notOwner = await ownerHandOff({ host: HOST_A, userId: USER_B, returnTo: "/", origin: (h) => `https://${h}` }, { db, owner: deps.owner, ownsCreator: async (u, c) => (u === USER_A && c === A) || (u === USER_B && c === B), now })
    check("somebody else's account is not the owner", notOwner.ok === false && notOwner.why === "owner")
    const owner = await ownerHandOff({ host: HOST_A, userId: USER_A, returnTo: "/about", origin: (h) => `https://${h}` }, { db, owner: deps.owner, ownsCreator: async (u, c) => u === USER_A && c === A, now })
    check("the owner is handed on to their own website", owner.ok === true && owner.url.startsWith(`https://${HOST_A}/api/site-password?pass=`) && owner.url.endsWith("&return=%2Fabout"))
    const note = owner.ok ? new URL(owner.url).searchParams.get("pass") : null
    const first = await spendOwnerPass({ host: HOST_A, note, returnTo: "/about" }, { db, owner: deps.owner, now })
    check("the note is spent for a pass", first.ok === true && first.to === "/about")
    const second = await spendOwnerPass({ host: HOST_A, note, returnTo: "/about" }, { db, owner: deps.owner, now })
    check("and only once", second.ok === false)
    const elsewhere = await spendOwnerPass({ host: HOST_B, note, returnTo: "/" }, { db, owner: deps.owner, now })
    check("and never on another website", elsewhere.ok === false)
    const ownerRoute = code("app/api/site-password/owner/route.ts")
    check("the owner route reads the storelib.com session and checks the creator is that user's", /auth\.getUser\(\)/.test(ownerRoute) && /\.eq\("id", creatorId\)\.eq\("user_id", userId\)/.test(ownerRoute) && /login\?next=/.test(ownerRoute))
    const enterRoute = code("app/api/site-password/route.ts")
    check("the password route takes same-origin forms only and limits per visitor and per website", /sameOriginForm\(request, host\)/.test(enterRoute) && /bucket: "site-password-visitor"/.test(enterRoute) && /bucket: "site-password-site"/.test(enterRoute))
    const page = read("app/(site)/w/[username]/password/page.tsx")
    check("the password page is never cached or indexed, and draws the creator's own page", /export const dynamic = "force-dynamic"/.test(page) && /index: false/.test(page) && /renderAccountPage\(username, "password"/.test(page))
    const settings = read("components/website-builder/website-settings/password.tsx")
    check("Website Settings has the switch, the dark switch style, and never shows a stored password", /Password protect/.test(settings) && /<Toggle /.test(settings) && /hasPassword/.test(settings) && !/password_hash|scrypt/.test(settings))
    check("on Publishing", /<PasswordCard ctx=\{ctx\} \/>/.test(read("components/website-builder/website-settings/publishing.tsx")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A website that is not live yet says Coming soon, and takes an email")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const page = read("app/(site)/w/[username]/not-published.tsx")
    check("Coming soon, a Notify me box for this creator, and the creator page as a link", /Coming soon/.test(page) && /<ComingSoonSignup creatorId=\{creatorId\} \/>/.test(page) && /See \{name\} on Storelib/.test(page))
    const box = read("components/website-builder/coming-soon-signup.tsx")
    check("its box goes through the shared subscribe client, with a placeholder and a 48px field", /subscribeToCreator\(\{ creatorId, email, placement: "password" \}\)/.test(box) && /placeholder="Your email"/.test(box) && /height: 48/.test(box))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Copy")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const files = [
      "themes/default/sections/main_password.storelib", "components/website-builder/website-settings/password.tsx", "app/app/emails/message-detail.tsx",
      "components/website-builder/coming-soon-signup.tsx", "app/(site)/w/[username]/not-published.tsx", "lib/site-contact/notify.ts", "lib/site-password/enter.ts",
    ]
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
    for (const f of files) {
      /* CSS's own words (text-transform) are not copy. */
      const text = read(f).replace(/[a-z-]*-transform\b|transform:/g, "")
      check(`${f}: no em dash and none of the banned words`, !text.includes("—") && !banned.test(text))
    }
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
