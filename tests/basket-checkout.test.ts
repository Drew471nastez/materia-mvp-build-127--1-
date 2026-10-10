/**
 * ===========================================================================
 *  A WEBSITE'S BASKET, ON STORELIB'S BRANDED CHECKOUT
 * ===========================================================================
 * Check out on a creator's website (a built site's cart page or drawer, an
 * imported Shopify theme's /checkout) used to open Stripe's hosted page,
 * with none of the shop on it and no way back. It now lands on
 * storelib.com/checkout/cart: the shop's logo and Back across the top,
 * Stripe's form inside the page. What has to hold:
 *
 *   the link carries ids, quantities and where Back goes, and nothing in it
 *   is trusted (lib/checkout/basket-link);
 *   the route and the page decide the same way from the SERVER's prices:
 *   one shop, only published and unowned lines, something that ships to the
 *   physical checkout, under $0.50 refused (lib/checkout/basket-decision);
 *   the shop at the top comes from the database, never from the link
 *   (lib/checkout/brand-server);
 *   the session keeps every guard it had, made inside the page.
 */
import { readFileSync } from "node:fs"
import { priceCart } from "@/lib/checkout/pricing"
import { ONE_SHOP_ONLY, basketDecision } from "@/lib/checkout/basket-decision"
import { BASKET_CHECKOUT_PATH, afterPaidTarget, basketCheckoutHref, readBasketParams } from "@/lib/checkout/basket-link"
import { checkoutBrand } from "@/lib/checkout/brand-server"
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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const uuid = (n: number) => `${String(n).padStart(8, "0")}-2222-4222-8222-222222222222`
const SHOP = uuid(100)
const OTHER = uuid(200)
const A = uuid(1)
const B = uuid(2)
const C = uuid(3)
const H = uuid(4)

type Row = Record<string, unknown>

/** Tables answering select/eq/in/limit/maybeSingle and a plain await. */
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
        ilike: () => chain,
        limit: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      }
      return chain
    },
  }
}

const product = (id: string, creator: string, price: number, over: Row = {}): Row => ({
  id,
  title: `Item ${id.slice(7, 8)}`,
  slug: `item-${id.slice(7, 8)}`,
  price_cents: price,
  pay_what_you_want: false,
  pwyw_min_price_cents: null,
  thumbnail_url: null,
  type: "digital",
  status: "published",
  creator_id: creator,
  ...over,
})

async function main() {
  console.log("\nThe link to the branded checkout")
  {
    const href = basketCheckoutHref({
      base: "https://storelib.com",
      shopId: SHOP,
      items: [
        { productId: A, variantId: null, quantity: 1 },
        { productId: B, variantId: C, quantity: 3 },
      ],
      back: "https://shop.example/cart",
      couponCode: " SAVE10 ",
      wholeCart: true,
      origin: { site: "shop.example", from: "instagram", utm_source: "ig", utm_campaign: "fall", touches: "t1" },
    })
    const url = new URL(href)
    const params = readBasketParams(url.searchParams)
    check("it is storelib.com/checkout/cart", url.origin === "https://storelib.com" && url.pathname === BASKET_CHECKOUT_PATH)
    check("the lines come back as they went, ids and quantities only", params.items.length === 2 && params.items[1].productId === B && params.items[1].variantId === C && params.items[1].quantity === 3 && !/price/i.test(href.replace(/customPrice/g, "")), params.items)
    check("the shop, where Back goes, the code and that it is the whole cart", params.shopId === SHOP && params.back === "https://shop.example/cart" && params.couponCode === "SAVE10" && params.wholeCart === true)
    check("the visit's source rides along in the keys a Buy button's link uses", url.searchParams.get("src") === "website" && url.searchParams.get("site") === "shop.example" && url.searchParams.get("ref") === "instagram" && url.searchParams.get("utm_source") === "ig" && url.searchParams.get("sl_at") === "t1")
    const bad = readBasketParams(new URLSearchParams({ shop: "not-a-shop", items: "%%%" }))
    check("a shop that is not an id, and items that do not decode, are nothing", bad.shopId === null && bad.items.length === 0)
    const lone = new URL(basketCheckoutHref({ shopId: SHOP, items: [{ productId: A, variantId: null, quantity: 1 }] }), "https://x.test")
    check("a Buy it now of one item is not the whole cart, and with no site there is no Back", readBasketParams(lone.searchParams).wholeCart === false && lone.searchParams.get("return") === null)
    check("after paying the whole cart the site is told to empty it; a Buy it now is not", afterPaidTarget("https://shop.example", true) === "https://shop.example/?sl_cart=clear" && afterPaidTarget("https://shop.example", false) === "https://shop.example/")
  }

  console.log("\nWhat a priced basket may do, from the server's prices")
  {
    const db = fakeDb({ products: [product(A, SHOP, 1500), product(B, SHOP, 2500)] })
    const priced = await priceCart(db, { items: [{ productId: A, quantity: 1, customPriceCents: 1 }, { productId: B, quantity: 1 }] })
    const d = basketDecision(priced, { shopId: SHOP })
    check("two of one shop's products: pay, at the database's prices (a sent amount means nothing for a priced product)", d.kind === "pay" && d.creatorId === SHOP && priced.ok === true && priced.totalCents === 4000, priced)
  }
  {
    const db = fakeDb({ products: [product(A, SHOP, 1500), product(B, OTHER, 2500)] })
    const d = basketDecision(await priceCart(db, { items: [{ productId: A }, { productId: B }] }))
    check("two shops in one basket are refused: one payment pays one seller", d.kind === "refuse" && d.error === ONE_SHOP_ONLY, d)
  }
  {
    const db = fakeDb({ products: [product(A, OTHER, 1500)] })
    const d = basketDecision(await priceCart(db, { items: [{ productId: A }] }), { shopId: SHOP })
    check("a link naming one shop with another shop's products is refused", d.kind === "refuse" && d.error === ONE_SHOP_ONLY, d)
  }
  {
    const db = fakeDb({ products: [product(A, SHOP, 1500), product(H, SHOP, 3000, { type: "physical", title: "Hoodie" })] })
    const d = basketDecision(await priceCart(db, { items: [{ productId: A }, { productId: H, quantity: 2 }], handOff: true }), { shopId: SHOP })
    check("something that ships: the whole cart goes to the physical checkout, digital lines beside it", d.kind === "ships" && d.items.length === 2 && d.items.some((i) => i.productId === H && i.quantity === 2), d)
  }
  {
    const db = fakeDb({ products: [product(A, SHOP, 1500, { status: "draft" }), product(B, SHOP, 2500, { title: "Old Ebook" })], product_variants: [] })
    const priced = await priceCart(db, { items: [{ productId: A }, { productId: B, variantId: uuid(77) }] })
    const d = basketDecision(priced)
    check("nothing that can be bought is refused, naming what is left out (never charged)", d.kind === "refuse" && /Old Ebook can't be bought right now/.test(d.error), d)
  }
  {
    const db = fakeDb({ products: [product(A, SHOP, 1500)], entitlements: [{ buyer_id: "buyer", product_id: A }] })
    const d = basketDecision(await priceCart(db, { items: [{ productId: A }], buyerId: "buyer" }))
    check("everything already owned: said so, not charged twice", d.kind === "refuse" && d.error === "You already own everything in this cart", d)
  }
  {
    const db = fakeDb({ products: [product(A, SHOP, 30)] })
    const d = basketDecision(await priceCart(db, { items: [{ productId: A }] }))
    check("under the smallest card payment is refused", d.kind === "refuse" && /\$0\.50/.test(d.error), d)
  }
  {
    const db = fakeDb({
      products: [product(A, SHOP, 1500)],
      coupons: [{ id: "cp", code: "FREE", creator_id: SHOP, discount_type: "percentage", discount_value: 100, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, min_purchase_cents: null }],
    })
    const priced = await priceCart(db, { items: [{ productId: A }], couponCode: "FREE" })
    const d = basketDecision(priced)
    check("a code that takes it all is free: no card at all", d.kind === "free", { d, priced })
  }
  {
    const d = basketDecision({ ok: false, status: 400, error: "Your cart is empty" })
    check("a refusal from pricing stays that refusal", d.kind === "refuse" && d.status === 400 && d.error === "Your cart is empty")
  }

  console.log("\nThe shop at the top is the database's")
  {
    const base = {
      creators: [{ id: SHOP, display_name: "Andrew R", username: "andrew", avatar_url: "https://img.example/face.jpg", user_id: "u1" }],
      profiles: [{ id: "u1", display_name: "Andrew", username: "andrew", avatar_url: "https://img.example/face.jpg" }],
    }
    const built = await checkoutBrand(fakeDb({ ...base, store_settings: [{ creator_id: SHOP, store_name: "Rull Studio", logo_url: "https://img.example/store.png" }], store_theme_installs: [{ id: "i1", creator_id: SHOP, status: "published", store_theme_settings: { settings: { logo_url: "https://img.example/site-logo.png" } } }] }), SHOP)
    check("a built website's logo first, under the store's name", built.kind === "logo" && built.imageUrl === "https://img.example/site-logo.png" && built.name === "Rull Studio", built)
    const imported = await checkoutBrand(
      fakeDb({
        ...base,
        store_theme_installs: [{ id: "i2", creator_id: SHOP, status: "published", store_theme_settings: { settings: { compat: { kind: "shopify", theme: "Dawn" }, shopify: { logo: "shopify://shop_images/logo.png" } } } }],
        store_theme_custom_files: [{ install_id: "i2", path: "shopify/config/assets.json", content: JSON.stringify({ "logo.png": "https://cdn.example/logo.png" }) }],
      }),
      SHOP,
    )
    check("an imported theme's own logo setting, through the theme's pictures", imported.kind === "logo" && imported.imageUrl === "https://cdn.example/logo.png" && imported.name === "Andrew", imported)
    const plain = await checkoutBrand(fakeDb({ ...base }), SHOP)
    check("no logo anywhere: the person's photo, round, beside their name", plain.kind === "photo" && plain.imageUrl === "https://img.example/face.jpg" && plain.name === "Andrew", plain)
    const hostile = await checkoutBrand(fakeDb({ ...base, profiles: [], creators: [{ id: SHOP, display_name: "X", avatar_url: "javascript:alert(1)" }], store_settings: [{ creator_id: SHOP, logo_url: "//evil.example/x.png" }] }), SHOP)
    check("only https or a path on storelib.com is ever drawn", hostile.imageUrl === null && hostile.kind === null, hostile)
    check("the brand reads no address: nothing from the link can dress the page", !/searchParams|query/.test(code("lib/checkout/brand-server.ts")))
  }

  console.log("\nThe route and the page, read")
  const route = code("app/api/checkout/cart/route.ts")
  const page = code("app/checkout/cart/page.tsx")
  const client = code("app/checkout/cart/basket-checkout.tsx")
  check("the website's own request gets the branded checkout's address, after every check and before any Stripe session", route.indexOf("basketCheckoutHref({") > route.indexOf("checkoutReadyForCreator(creator.id as string)") && route.indexOf("basketCheckoutHref({") < route.indexOf("stripe.checkout.sessions.create"))
  check("  carrying only the lines that priced", /kept\.has\(`\$\{i\.productId\}::\$\{i\.variantId \?\? ""\}`\)/.test(route))
  check("the branded page's session is Stripe's form inside the page, paid back to the basket's completion", /ui_mode: "embedded" as const,\s*return_url: successUrl/.test(route) && /clientSecret: session\.client_secret/.test(route))
  check("  and only Stripe's hosted page keeps a cancel address", /: \{ success_url: successUrl, cancel_url: `\$\{siteOrigin\}\$\{returnPath\}` \}/.test(route))
  check("  the site it names is taken only when it is this shop's own", /const namedOrigin = named \? await safeReturnOrigin\(named\.origin, creatorId\) : null/.test(route))
  check("  the session keeps its guards: server prices, the readiness rule, one shop, coupon places, the fee", /unit_amount: part\.unitCents/.test(route) && /checkoutReadyForCreator\(creator\.id as string\)/.test(route) && /basketDecision\(priced\)/.test(route) && /holdCouponUse\(admin, coupon\.id, holder\)/.test(route) && /application_fee_amount: fee\.platformFeeCents/.test(route))
  check("  a call that makes a session is rate limited", /const limited = ui \|\| body\.buyer/.test(route) && /bucket: "payment"/.test(route))
  check("the page prices again and decides as the route does, for the shop the link names", /priceCart\(admin, \{ items: params\.items/.test(page) && /basketDecision\(priced, \{ shopId: params\.shopId \}\)/.test(page))
  check("  something that ships goes on to the physical checkout", /if \(decision\.kind === "ships"\) redirect\(physicalCheckoutHref\(params\.shopId, decision\.items, back\)\)/.test(page))
  check("  Back is the shop's own site, checked on the server", /checkoutReturns\(\{ creatorId: params\.shopId, cancel: params\.back \}\)/.test(page))
  check("  a shop that cannot take payments is said on the page, never sent to Stripe", /checkoutReadyForCreator\(decision\.creatorId\)/.test(page) && /BUYER_UNAVAILABLE/.test(page))
  check("the client asks for the embedded session with the lines, the site page and the visit", /ui, returnUrl: backTo, wholeCart, origin: checkoutOrigin\(shopId\)/.test(client) && /<EmbeddedCheckoutProvider/.test(client))
  check("  and in the app's shell, Stripe's own page", /setNative\(isCapacitorShell\(\)\)/.test(client) && /ask\("hosted"\)/.test(client))
  check("  a failure is a styled message with the way back to the cart and Try again", /Back to cart/.test(client) && /Try again/.test(client))

  console.log("\nThe physical checkout, branded and paid in the page")
  const phys = code("lib/physical/checkout-server.ts")
  const physPage = code("app/checkout/physical/physical-checkout.tsx")
  const physRoute = code("app/api/physical/checkout/route.ts")
  check("its session can be Stripe's form inside the page", /ui_mode: "embedded" as const,\s*return_url: `\$\{input\.platformOrigin\}\/api\/physical\/checkout\/complete/.test(phys) && /embedded: body\.ui === "embedded"/.test(physRoute))
  check("the page draws the shop's bar and mounts the form after Pay", /<ShopBar brand=\{bar\}/.test(physPage) && /setPayment\(\{ clientSecret: data\.clientSecret \}\)/.test(physPage) && /<EmbeddedCheckoutProvider key=\{payment\.clientSecret\}/.test(physPage))
  check("Change lets go of the stock only for this tab's own checkout, and only once Stripe has expired it", /\.eq\("client_key", clientKey\)/.test(phys) && phys.indexOf("stripe.checkout.sessions.expire(") < phys.indexOf("await expireCheckoutSession(db, session)") && /if \(session\.status !== "expired"\) return false/.test(phys))

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
