/**
 * ===========================================================================
 *  BUYING SOMETHING YOU ALREADY OWN
 * ===========================================================================
 * Andrew: someone buys a download from a website, comes back, and the
 * checkout makes them buy it again. What holds now (lib/checkout/owned):
 *
 *   ONE RULE          a download, course or community access is owned per
 *                     option; a purchase of the whole product owns every
 *                     option; a physical product and a membership never are
 *   WHO               a signed in Storelib account (entitlements) or a
 *                     website customer, whose email a sign in code proved
 *                     (completed orders); NEVER an email typed at checkout
 *   THE WEBSITE       an owned line leaves the payment and is named apart
 *                     ("already yours"), a cart of nothing else is a quote of
 *                     nothing to pay, and Pay refuses to charge for it
 *   A GUEST           "Email me my link" answers the same for every email,
 *                     sends after answering, only to the order's address
 *   PRODUCT PAGES     an imported theme draws "You already own this" with
 *                     the website's own /account; a built site's buttons
 *                     become "Go to your downloads"
 */
import { readFileSync } from "node:fs"
import { FakeSupabase } from "./fake-supabase"
import { ownedKey, ownedLines, ownedProducts, ownsFrom, rowsOwn, isOwnableType } from "@/lib/checkout/owned"
import { priceCart } from "@/lib/checkout/pricing"
import { basketDecision } from "@/lib/checkout/basket-decision"
import { allOwned, priceSiteCart, siteQuote } from "@/lib/checkout/site-quote-server"
import { ACCESS_SENT, MAX_RECEIPTS, receiptsFor } from "@/lib/checkout/access-link"
import { customerOwns } from "@/lib/site-accounts/owned-products"
import { ownedBanner } from "@/lib/storelib-theme/compat/owned-banner"
import { CompatTheme, wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "@/lib/storelib-theme/compat/site"
import { stripComments } from "./_source"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))

const uuid = (n: number) => `${String(n).padStart(8, "0")}-3333-4333-8333-333333333333`
const SHOP = uuid(100)
const OTHER = uuid(200)
const EBOOK = uuid(1)
const COURSE = uuid(2)
const TEE = uuid(3)
const CLUB = uuid(4)
const PACK = uuid(5)
const PACK_BASIC = uuid(51)
const PACK_PRO = uuid(52)
const GONE = uuid(6)
const ANA = "Ana.Pop@Mail.test"

const product = (id: string, title: string, price: number, over: Record<string, unknown> = {}) => ({
  id,
  title,
  slug: title.toLowerCase().replace(/\s+/g, "-"),
  price_cents: price,
  pay_what_you_want: false,
  pwyw_min_price_cents: null,
  thumbnail_url: `https://img.test/${title}.png`,
  type: "digital",
  status: "published",
  creator_id: SHOP,
  ...over,
})

function shopDb(orders: Record<string, unknown>[] = [], entitlements: Record<string, unknown>[] = []) {
  return new FakeSupabase()
    .table("products", {}, [
      product(EBOOK, "Ebook", 1500),
      product(COURSE, "Course", 4000, { type: "course" }),
      product(TEE, "Tee", 2500, { type: "physical" }),
      product(CLUB, "Club", 900, { type: "membership" }),
      product(PACK, "Pack", 0),
      product(GONE, "Gone", 1000, { status: "draft" }),
    ])
    .table("product_variants", {}, [
      { id: PACK_BASIC, product_id: PACK, name: "Basic", price_cents: 1000, pay_what_you_want: false, pwyw_min_price_cents: null, max_purchases: null },
      { id: PACK_PRO, product_id: PACK, name: "Pro", price_cents: 3000, pay_what_you_want: false, pwyw_min_price_cents: null, max_purchases: null },
    ])
    .table("orders", {}, orders)
    .table("entitlements", {}, entitlements)
}

const order = (productId: string, email: string, over: Record<string, unknown> = {}) => ({
  id: uuid(900 + Math.floor(Math.random() * 99)),
  product_id: productId,
  variant_id: null,
  creator_id: SHOP,
  buyer_email: email,
  buyer_first_name: "Ana",
  status: "completed",
  receipt_token: `tok_${productId.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`,
  created_at: "2026-09-01T10:00:00Z",
  amount_cents: 1500,
  ...over,
})

async function main() {
  console.log("\nOne rule for what is already the buyer's")
  {
    check("a purchase of the whole product owns every option", rowsOwn([{ product_id: PACK, variant_id: null }], PACK, PACK_PRO))
    check("a purchase of one option owns that option only", rowsOwn([{ product_id: PACK, variant_id: PACK_BASIC }], PACK, PACK_BASIC) && !rowsOwn([{ product_id: PACK, variant_id: PACK_BASIC }], PACK, PACK_PRO))
    check("an option's purchase does not own the product asked for without one", !rowsOwn([{ product_id: PACK, variant_id: PACK_BASIC }], PACK, null))
    check("physical goods and memberships are never 'owned'; downloads, courses and communities are", !isOwnableType("physical") && !isOwnableType("membership") && isOwnableType("digital") && isOwnableType("course") && isOwnableType("community"))

    const db = shopDb([order(EBOOK, "ana.pop@mail.test"), order(TEE, "ana.pop@mail.test"), order(COURSE, "ana.pop@mail.test", { status: "refunded" }), order(EBOOK, "bob@mail.test")])
    const lines = [EBOOK, COURSE, TEE].map((productId) => ({ productId, variantId: null, type: productId === TEE ? "physical" : productId === COURSE ? "course" : "digital" }))
    const proven = await ownedLines(db, { provenEmail: ANA }, lines)
    check("a proven email owns its completed orders' downloads, whatever the letter case", proven.has(ownedKey(EBOOK, null)), [...proven])
    check("  a refunded order gives nothing", !proven.has(ownedKey(COURSE, null)))
    check("  a physical product bought before can be bought again", !proven.has(ownedKey(TEE, null)))
    check("nobody proven owns nothing, however many orders an email has", (await ownedLines(db, {}, lines)).size === 0)
    check("an email with a wildcard in it matches only itself", (await ownedLines(shopDb([order(EBOOK, "a_b@mail.test")]), { provenEmail: "a%b@mail.test" }, lines)).size === 0)
    const account = await ownedLines(shopDb([], [{ buyer_id: "user-1", product_id: COURSE, variant_id: null }]), { userId: "user-1" }, lines)
    check("a Storelib account owns its entitlements", account.has(ownedKey(COURSE, null)) && account.size === 1)

    const page = await ownedProducts(shopDb([order(PACK, ANA.toLowerCase(), { variant_id: PACK_BASIC })]), { provenEmail: ANA }, [{ id: PACK, type: "digital" }])
    check("a product page knows which options are owned", !page.whole.length && ownsFrom(page, PACK, PACK_BASIC) && !ownsFrom(page, PACK, PACK_PRO), page)
  }

  console.log("\nA basket leaves out what is owned, per option, and names it apart")
  {
    const db = shopDb([order(EBOOK, "ana.pop@mail.test"), order(PACK, "ana.pop@mail.test", { variant_id: PACK_BASIC })])
    const items = [{ productId: EBOOK }, { productId: COURSE }, { productId: PACK, variantId: PACK_PRO }, { productId: PACK, variantId: PACK_BASIC }]
    const priced = await priceCart(db, { items, ownerEmail: ANA, handOff: false })
    check("the owned download and the owned option are left out, the rest is priced", priced.ok === true && priced.lines.map((l) => `${l.item.productId}:${l.item.variantId ?? ""}`).join(",") === `${COURSE}:,${PACK}:${PACK_PRO}`, priced)
    check("  and listed as owned, with their titles and pictures", priced.ok === true && priced.owned.length === 2 && priced.owned[0].title === "Ebook" && priced.owned[0].thumbnailUrl === "https://img.test/Ebook.png" && priced.ownedAny, priced.ok && priced.owned)
    check("  the total is only what is not owned", priced.ok === true && priced.totalCents === 7000)
    const guest = await priceCart(db, { items, buyerId: null, handOff: false })
    check("a guest (no proven email) is priced for everything: the typed email is never asked", guest.ok === true && guest.lines.length === 4 && guest.owned.length === 0)

    const all = await priceCart(db, { items: [{ productId: EBOOK }], ownerEmail: ANA, handOff: false })
    const d = basketDecision(all)
    check("everything owned: said as owned, not 'can't be bought'", d.kind === "refuse" && d.error === "You already own everything in this cart", d)
    const mixed = await priceCart(db, { items: [{ productId: EBOOK }, { productId: GONE }], ownerEmail: ANA, handOff: false })
    const md = basketDecision(mixed)
    check("owned beside something off sale: only what is off sale is named as such", md.kind === "refuse" && /Gone|no longer on sale/.test(md.error) && !/Ebook/.test(md.error), md)
  }

  console.log("\nThe website's checkout: signed in owners are never charged twice")
  {
    const db = shopDb([order(EBOOK, "ana.pop@mail.test")])
    const only = await siteQuote(db, SHOP, { items: [{ productId: EBOOK }] }, null, { email: ANA })
    check("a cart of only owned things is a quote of nothing to pay, with what they own", only.ok === true && only.quote.lines.length === 0 && only.quote.owned?.[0]?.title === "Ebook" && only.quote.totals.totalCents === 0 && only.quote.dropped.length === 0, only)
    const mixed = await siteQuote(db, SHOP, { items: [{ productId: EBOOK }, { productId: COURSE }] }, null, { email: ANA })
    check("a mixed cart pays for the rest; the owned line is named as owned, not as dropped", mixed.ok === true && mixed.quote.lines.length === 1 && mixed.quote.lines[0].productId === COURSE && mixed.quote.owned?.length === 1 && mixed.quote.dropped.length === 0 && mixed.quote.totals.totalCents === 4000, mixed)
    const guest = await siteQuote(db, SHOP, { items: [{ productId: EBOOK }], email: "ana.pop@mail.test" })
    check("a guest who types an owner's email is quoted as anyone: nothing is said about that email", guest.ok === true && guest.quote.lines.length === 1 && (guest.quote.owned ?? []).length === 0, guest)
    const pay = await priceSiteCart(db, SHOP, { items: [{ productId: EBOOK }] }, { email: ANA })
    check("Pay prices the same way and sees a cart of only owned things", allOwned(pay.priced))
    const other = await siteQuote(shopDb([order(EBOOK, "ana.pop@mail.test", { creator_id: OTHER })]).table("products", {}, [product(EBOOK, "Ebook", 1500, { creator_id: OTHER })]), SHOP, { items: [{ productId: EBOOK }] }, null, { email: ANA })
    check("another shop's product is still refused, owned or not", other.ok === false, other)

    const route = code("app/api/checkout/site/route.ts")
    check("intent and free both price for the signed in customer and refuse a cart of only owned things", (route.match(/const owner = await siteBuyerOfRequest\(admin, request, site\.creatorId\)\n\s+const \{ priced, decision, couponError \} = await priceSiteCart\(admin, site\.creatorId, body, owner \? \{ email: owner\.email \} : null\)\n\s+if \(allOwned\(priced\)\) return json\(/g) ?? []).length === 2)
    check("the quote is priced for the session's customer, never a typed email", /siteQuote\(admin, site\.creatorId, body, detectedCountry\(request\.headers\), owner \? \{ email: owner\.email \} : null\)/.test(route))
    check("a cart that ships carries the proven email to the held checkout", (route.match(/ownerEmail: contact\.ownerEmail,/g) ?? []).length === 2 && /ownerEmail: buyer\?\.email \?\? null/.test(route) && /ownerEmail: input\.ownerEmail \?\? null/.test(code("lib/physical/checkout-server.ts")))
    check("the physical pricing leaves owned digital lines out by the same rule", /ownedLines\(\s*db,\s*\{ userId: req\.buyerId \?\? null, provenEmail: req\.ownerEmail \?\? null \}/.test(code("lib/physical/checkout-pricing-server.ts")))
    const page = code("app/checkout/site/page.tsx")
    check("the page prices for the signed in customer and links to the site's own /account", /* Changed on purpose (round AB): priced as soon as the buyer is known. */ /siteQuote\(admin, site\.creatorId, \{ items, couponCode: params\.couponCode \}, null, b \? \{ email: b\.email \} : null\)/.test(page) && /const quoteRead = buyerRead\.then/.test(page) && /accountUrl=\{`\$\{site\.origin\}\/account`\}/.test(page))
    const client = code("app/checkout/site/site-checkout.tsx")
    check("the client draws 'You already own this' for a cart of only owned things, and the note for a mixed one", /if \(onlyOwned\) return <SiteOwned /.test(client) && /<OwnedNote owned=\{owned\} accountUrl=\{accountUrl\} \/>/.test(client))
    check("  the guest's 'Email me my link' is offered only to a guest with a download in the cart", /\{!buyer && !lockedEmail && !needsSignIn && hasDownloads \? <AccessLink /.test(client))
    check("  a cart of only owned things leaves the browser's cart and the theme's cookie", /void call\(\{ action: "forget" \}\)/.test(client) && /async function forget\(request: Request, admin: Admin, site: SiteOfCheckout\)/.test(route))
    const owned = code("app/checkout/site/owned.tsx")
    check("'Go to your downloads' is the website's, never storelib.com", /href=\{accountUrl\}/.test(owned) && !/storelib\.com/.test(owned))
  }

  console.log("\nA guest's 'Email me my link' tells nobody anything")
  {
    const db = shopDb([
      order(EBOOK, "ana.pop@mail.test", { id: uuid(901), receipt_token: "t1", created_at: "2026-09-01T10:00:00Z" }),
      order(COURSE, "ana.pop@mail.test", { id: uuid(902), receipt_token: "t2", created_at: "2026-09-05T10:00:00Z" }),
      order(COURSE, "ana.pop@mail.test", { id: uuid(903), receipt_token: "t2", created_at: "2026-09-05T10:00:00Z" }),
      order(TEE, "ana.pop@mail.test", { id: uuid(904), receipt_token: "t3" }),
      order(EBOOK, "ana.pop@mail.test", { id: uuid(905), receipt_token: "t4", status: "refunded" }),
      order(EBOOK, "anna@mail.test", { id: uuid(906), receipt_token: "t5" }),
    ])
    const sent = await receiptsFor(db, { creatorId: SHOP, email: ANA, productIds: [EBOOK] })
    check("the receipts are this email's own downloads, one per payment, the cart's products first", sent.map((r) => r.receipt_token).join(",") === "t1,t2", sent)
    check("  never a refunded order, a shipped order, or another address", !sent.some((r) => ["t3", "t4", "t5"].includes(String(r.receipt_token))))
    check("  for another shop, nothing", (await receiptsFor(db, { creatorId: OTHER, email: ANA, productIds: [] })).length === 0)
    check("  at most a few per request", MAX_RECEIPTS <= 3)
    const route = code("app/api/checkout/site/route.ts")
    const explore = code("app/api/checkout/access-link/route.ts")
    check("both routes answer the same words whatever the email, and send after answering", /after\(\(\) => sendAccessLinks\(/.test(route) && /return json\(\{ ok: true, message: ACCESS_SENT \}\)/.test(route) && /after\(async \(\) => \{/.test(explore) && /return json\(\{ ok: true, message: ACCESS_SENT \}\)/.test(explore))
    check("  only from the checkout's own page: same origin on a website, JSON only on Explore", /case "access":\n\s+case "forget": \{[\s\S]{0,200}sameOriginWrite\(request,/.test(route) && /startsWith\("application\/json"\)\) return json\(\{ error: "Bad request" \}, 415\)/.test(explore))
    check("  rate limited per caller and per email first", /const limited = await accessLinkLimited\(request, email\)\n\s+if \(limited\) return limited/.test(route) && /const limited = await accessLinkLimited\(request, email\)\n\s+if \(limited\) return limited/.test(explore))
    check("  and the words never confirm a purchase", /^If you bought it with this email/.test(ACCESS_SENT))
    const lib = code("lib/checkout/access-link.ts")
    check("  the email goes to the order's own address, with the website's receipt link", /buyerEmail: \(r\.buyer_email as string\)\.trim\(\)\.toLowerCase\(\)/.test(lib) && /receiptBaseUrl: input\.receiptBase/.test(lib))
  }

  console.log("\nProduct pages say it, for the signed in owner only")
  {
    const db = shopDb([order(EBOOK, "ana.pop@mail.test"), order(PACK, "ana.pop@mail.test", { variant_id: PACK_PRO }), order(TEE, "ana.pop@mail.test")])
    const owns = await customerOwns(db, { creatorId: SHOP, email: ANA }, [EBOOK, PACK, TEE, CLUB])
    check("the website's customer owns the download, one option of the pack, and never the tee or the club", owns[EBOOK]?.whole === true && owns[PACK]?.whole === false && owns[PACK]?.options[0] === PACK_PRO && !owns[TEE] && !owns[CLUB], owns)
    check("  another shop's products are not asked about", Object.keys(await customerOwns(db, { creatorId: OTHER, email: ANA }, [EBOOK])).length === 0)

    check("the theme's notice for a whole product is shown at once, with the website's /account", /<div id="sl-owned"[^>]*data-storelib-owned=""><p>/.test(ownedBanner({ whole: true, options: [] })) && /href="\/account">Go to your downloads</.test(ownedBanner({ whole: true, options: [] })))
    const per = ownedBanner({ whole: false, options: [PACK_PRO] }, PACK_BASIC)
    check("  for one option, hidden while another is chosen, and it follows the theme's ?variant=", / hidden>/.test(per) && per.includes(JSON.stringify([PACK_PRO])) && /history\[k\]=function/.test(per))
    check("  shown when the chosen option is the owned one", !/ hidden>/.test(ownedBanner({ whole: false, options: [PACK_PRO] }, PACK_PRO)))
    check("  and nothing for options that are not ids", ownedBanner({ whole: false, options: ["<script>"] }) === "")

    const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
    const theme = new CompatTheme(
      {
        "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body><main>{{ content_for_layout }}</main></body></html>`),
        "sections/main-product.storelib": section("main-product", `<div class="p">{{ product.title }}<button name="add">Add to cart</button></div>`),
        "templates/product.json": JSON.stringify({ sections: { main: { type: "main-product" } }, order: ["main"] }),
      },
      {},
      { assetUrl: (n) => `/a/${n}` },
    )
    const card = { id: EBOOK, settings: { title: "Ebook", price: "$15.00", image: "", url: "/products/ebook", slug: "ebook", kind: "digital", available: true } }
    const site: SiteData = { creatorId: SHOP, theme, pages: { product: [{ id: "main", type: "main-product" }] as never }, products: [card as never], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, host: "shop.test" }
    const asked: string[] = []
    const ownedFn = async (id: string) => (asked.push(id), { whole: true, options: [] })
    const customer = { name: "Ana", first_name: "Ana", email: "ana.pop@mail.test", orders: [], orders_count: 0 }
    const signedIn = String((await answer(site, { method: "GET", path: "/products/ebook", query: new URLSearchParams(), body: null, cart: [], account: { customer }, owned: ownedFn })).body)
    check("an imported theme's product page tells the signed in owner, without touching the theme's form", /id="sl-owned"/.test(signedIn) && /class="p">Ebook<button name="add">Add to cart<\/button>/.test(signedIn) && asked[0] === EBOOK)
    const guest = String((await answer(site, { method: "GET", path: "/products/ebook", query: new URLSearchParams(), body: null, cart: [], account: { customer: null }, owned: ownedFn })).body)
    check("  a guest's page says nothing and asks nothing", !/sl-owned/.test(guest) && asked.length === 1)
    const notOwned = String((await answer(site, { method: "GET", path: "/products/ebook", query: new URLSearchParams(), body: null, cart: [], account: { customer }, owned: async () => null })).body)
    check("  nor for a product they don't own", !/sl-owned/.test(notOwned))
    const live = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("the live route asks only for a signed in customer, by the session's email and this site's shop", /owned: account\?\.customer\?\.email\s*\?/.test(live) && /customerOwnsProduct\(\{ creatorId: shopId, email: account\.customer!\.email \}, productId\)/.test(live))

    const section2 = code("components/website-builder/sections/renderers/ProductSection.tsx")
    check("a built site's product asks the website's own session, only when its signed in hint is there, never for a physical product", /sl_signed_in=1/.test(section2) && /\/api\/site-account\/owned\?ids=/.test(section2) && /product\.type === "physical" \|\| product\.type === "membership"\) return/.test(section2))
    const blocks = code("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("  and its buttons become the way to the downloads", /if \(buy\.owned\) \{/.test(blocks) && /Go to your downloads/.test(blocks) && /You already own this\./.test(blocks))
    const api = code("app/api/site-account/owned/route.ts")
    check("  the endpoint answers a guest with nothing at all", /if \(!visitor\) return privateResponse\(NextResponse\.json\(\{ signedIn: false, owned: \{\} \}\)\)/.test(api))
  }

  console.log("\nExplore and the creator page keep their library, by the same rule")
  {
    const page = code("app/checkout/page.tsx")
    check("a signed in owner of this option (or the whole product) goes to the library", /if \(rowsOwn\(existingEntitlements\.map\(\(e\) => \(\{ product_id: product\.id, variant_id: e\.variant_id \}\)\), product\.id, variantId \|\| null\)\) redirect\(OWNED\)/.test(page))
    check("an active member goes to Manage membership, not a second subscription", /const current = \(\(mine \?\? \[\]\) as any\[\]\)\.find\(\(m\) => grantsAccess\(m\)\)/.test(page) && /redirect\(`\/account\/library\/memberships\/\$\{encodeURIComponent\(current\.id\)\}`\)/.test(page))
    const session = code("app/api/checkout/stripe-session/route.ts")
    check("the payment route refuses the same, with the library's address", /rowsOwn\(\(data \?\? \[\]\)/.test(session) && /code: "already_owned", url: `\/account\/library\/products\//.test(session))
    const client = code("app/checkout/checkout-client.tsx")
    check("a guest on Explore gets the same 'Email me my link'", /\{!isLoggedIn \? <AccessLink email=\{email\} send=\{sendAccess\} \/> : null\}/.test(client) && /fetch\("\/api\/checkout\/access-link"/.test(client))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
