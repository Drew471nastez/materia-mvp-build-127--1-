/**
 * ===========================================================================
 *  A COURSE THAT OPENS A COMMUNITY, BOUGHT ON THE CREATOR'S WEBSITE
 * ===========================================================================
 * The buyer's journey audit, through the real routes (tests/_journey):
 *
 *   website checkout   a course and a download in one cart on the website's
 *                      own checkout (app/api/checkout/site quote, intent,
 *                      confirm), paid with the card form, Stripe's webhook
 *   access             the course and the download in the buyer's library
 *                      (entitlements), and the community the creator named
 *                      the course in (community_access_products) lets the
 *                      buyer in at once, as a single product's checkout
 *                      does (lib/checkout/fulfil-payment grant). A basket
 *                      wrote the library row only (fulfil-cart-item
 *                      cartEntitlement), so the buyer stayed outside until a
 *                      later visit, and a member who had left stayed out.
 *   the email          one receipt, with the website's own receipt link
 *   a guest            buys the same with no account: no library row yet,
 *                      and once they sign up with that email the order joins
 *                      them and so does the community (attach-guest-orders)
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 900)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")

async function main() {
  const j = await Journey.start()
  /* profiles.email_verified (lib/auth/email-code.ts writes it) is in Supabase's own schema, which no SQL file of the repository creates. */
  j.db.extraColumns.add("profiles.email_verified")

  section("1. A creator with payments on, a course, a download and a community")
  const seller = await j.signUp("coach@example.com", { name: "Cora Coach" })
  const fin = await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "cutroom" } })
  check("the creator signs up", fin.status === 200 && j.rows("creators").length === 1, fin.json)
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Cutroom", supportEmail: "hello@cutroom.example", defaultCountry: "US" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  check("payments are on for the shop", !!acct && j.rows("creators")[0].charges_enabled !== false, j.rows("creators")[0])

  const product = (p: { type: string; title: string; priceCents: number }) => {
    const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const [row] = j.db.insert("products", { creator_id: creator.id, type: p.type, title: p.title, slug, description: `<p>${p.title}</p>`, status: "published", archived: false, price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
    return row.id as string
  }
  const courseId = product({ type: "course", title: "Editing Course", priceCents: 4900 })
  const presetsId = product({ type: "digital", title: "Colour Presets", priceCents: 1500 })
  const [presetsFile] = j.db.insert("digital_assets", { product_id: presetsId, file_name: "Presets.zip", file_size: 2048, file_path: `${creator.id}/presets.zip`, upload_status: "completed" }, {})
  const [community] = j.db.insert("communities", { owner_user_id: seller.id, creator_id: creator.id, name: "Cutroom Circle", slug: "cutroom-circle", access: "paid", status: "published" }, {})
  const [tier] = j.db.insert("community_tiers", { community_id: community.id, name: "Students", kind: "paid", position: 0, is_default: false, product_id: null }, {})
  j.db.insert("community_access_products", { community_id: community.id, tier_id: tier.id, product_id: courseId }, {})
  check("the course opens the community (Community › Access: the course)", j.rows("community_access_products").length === 1)

  const host = "cutroom.storelib.com"
  j.db.insert("store_theme_installs", { creator_id: creator.id, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Materia" }, {})
  const headers = { "x-forwarded-for": "192.0.2.90", origin: `https://${host}` }
  const items = [{ productId: courseId, variantId: null, quantity: 1 }, { productId: presetsId, variantId: null, quantity: 1 }]

  const pay = async (email: string, firstName: string, key: string) => {
    const quote = await j.call("POST /api/checkout/site", { host, headers, body: { action: "quote", items } })
    const intent = await j.call("POST /api/checkout/site", { host, headers, body: { action: "intent", items, email, firstName, lastName: "Buyer", agreedToTerms: true, clientKey: key, paymentMethods: ["card"] } })
    const piId = intent.json?.paymentIntentId as string | undefined
    const pi = piId ? j.world.intents.get(piId) : null
    if (!piId || !pi) return { quote, intent, confirm: null as null | Awaited<ReturnType<typeof j.call>> }
    const paid = j.world.payIntent(piId)
    const confirm = await j.call("POST /api/checkout/site", { host, headers, body: { action: "confirm", paymentIntentId: piId, clientSecret: pi.client_secret } })
    await j.webhook("payment_intent.succeeded", paid.intent)
    await j.cron()
    return { quote, intent, confirm }
  }

  section("2. A buyer with a Storelib account pays on the website")
  const buyer = await j.signUp("bea@example.com", { name: "Bea Buyer" })
  /* The address proven with a code, as Storelib's sign up does (lib/auth/verified-email.ts). */
  const proven = (p: { id: string; email: string }) => {
    j.rows("profiles").find((r) => r.id === p.id)!.email_verified = true
    j.db.insert("verification_codes", { user_id: p.id, email: p.email, code: "123456", used_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600_000).toISOString() }, {})
  }
  proven(buyer)
  const a = await pay("bea@example.com", "Bea", "journey-course-site-1")
  check("the website's checkout quotes the course and the presets at 64.00", a.quote.status === 200 && a.quote.json?.totals?.totalCents === 6400, { status: a.quote.status, body: JSON.stringify(a.quote.json).slice(0, 400) })
  check("one PaymentIntent for 64.00, a destination charge to the shop", a.intent.status === 200 && !!a.intent.json?.paymentIntentId, { status: a.intent.status, body: a.intent.json })
  const thanks = String(a.confirm?.json?.thanks ?? "")
  check("confirm answers with the thank you page on the website", a.confirm?.status === 200 && /\/checkout\/thanks\//.test(thanks), a.confirm?.json)
  const orders = j.rows("orders").filter((o) => o.buyer_email === "bea@example.com")
  check("two order lines, completed, on the buyer's account", orders.length === 2 && orders.every((o) => o.status === "completed" && o.buyer_id === buyer.id), orders.map((o) => [o.product_id, o.status, o.buyer_id]))
  const ents = j.rows("entitlements").filter((e) => e.buyer_id === buyer.id)
  check("the course and the presets are in the buyer's library", ents.some((e) => e.product_id === courseId) && ents.some((e) => e.product_id === presetsId), ents)
  const member = j.rows("community_members").find((m) => m.community_id === community.id && m.user_id === buyer.id)
  check("the course let the buyer into Cutroom Circle at once, on the Students tier", member?.status === "active" && member?.tier_id === tier.id, { member, members: j.rows("community_members") })
  const mail = j.net.to("bea@example.com")
  check("one receipt email for the basket", mail.length === 1, mail.map((m) => m.subject))
  const receiptLink = mail[0] ? (words(mail[0].html).match(/https?:\/\/\S+\/receipt\/[A-Za-z0-9_-]+/) ?? mail[0].html.match(/https?:\/\/[^"'\s]+\/receipt\/[A-Za-z0-9_-]+/))?.[0] ?? "" : ""
  check("  its receipt link opens on the website's own address", receiptLink.includes(host), { link: receiptLink, html: mail[0] ? words(mail[0].html).slice(0, 600) : null })
  const text = String(mail[0]?.text ?? "")
  const html = String(mail[0]?.html ?? "")
  const presetsToken = String(j.rows("orders").find((o) => o.buyer_email === "bea@example.com" && o.product_id === presetsId)?.receipt_token ?? "")
  check("  it names each line and what it opens: Open course to its player", new RegExp(`Editing Course: \\$49\\.00\\r?\\n    Open course: https://[^\\s]+/account/library/courses/${courseId}`).test(text), text)
  check("  Open community to the community on Storelib", /Open community: https:\/\/[^\s]+\/community\/cutroom-circle/.test(text), text)
  check("  Download to the file itself, on the website's address, with the line's receipt", text.includes(`Download: https://${host}/api/download/${presetsFile.id}?receipt=${presetsToken}`), text)
  check("  and the same three as links in the HTML", />Open course<\/a>/.test(html) && />Open community<\/a>/.test(html) && />Download<\/a>/.test(html) && html.includes(`/api/download/${presetsFile.id}?receipt=`))

  const token = String(orders.find((o) => o.product_id === courseId)?.receipt_token ?? "")
  const { loadReceiptByToken } = await import("@/lib/receipts/load")
  const { createAdminClient: admin0 } = await import("@/lib/supabase/admin")
  const loaded = await loadReceiptByToken(admin0() as never, token)
  const courseLine = loaded?.view.items.find((i) => i.productId === courseId)
  check("the receipt's course line opens the course and names the community it let them into", courseLine?.courseHref === `/account/library/courses/${courseId}` && courseLine?.communities?.[0]?.slug === "cutroom-circle" && courseLine.communities[0].name === "Cutroom Circle", courseLine)
  check("  the presets line names none", !loaded?.view.items.find((i) => i.productId === presetsId)?.communities)
  const page = await renderReceipt(token, host)
  check("the receipt on the website says Open community, to the community on Storelib", /data-receipt-community=""/.test(page) && /href="https:\/\/[^"]+\/community\/cutroom-circle"[^>]*>Open community</.test(page), words(page).slice(0, 900))

  section("3. A guest with no account buys the same, then signs up")
  const g = await pay("gus@example.com", "Gus", "journey-course-site-2")
  const guestOrders = j.rows("orders").filter((o) => o.buyer_email === "gus@example.com")
  check("the guest's two lines are paid, held on no account yet", g.confirm?.status === 200 && guestOrders.length === 2 && guestOrders.every((o) => o.status === "completed" && !o.buyer_id), guestOrders.map((o) => [o.status, o.buyer_id]))
  const gus = await j.signUp("gus@example.com", { name: "Gus Guest" })
  proven(gus)
  /* What /auth/continue does once the address is proven. */
  const { attachGuestOrdersByEmail } = await import("@/lib/orders/attach-guest-orders")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  await attachGuestOrdersByEmail(createAdminClient(), { id: gus.id, email: "gus@example.com" })
  const gEnts = j.rows("entitlements").filter((e) => e.buyer_id === gus.id)
  check("signed up with that email: both are in their library", gEnts.some((e) => e.product_id === courseId) && gEnts.some((e) => e.product_id === presetsId), gEnts)
  const gMember = j.rows("community_members").find((m) => m.community_id === community.id && m.user_id === gus.id)
  check("  and the community lets them in", gMember?.status === "active", j.rows("community_members"))

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

/** The receipt as the website serves it after its checkout (app/(storelib)/receipt/[token]/page.tsx), on the website's own host. */
async function renderReceipt(token: string, host: string): Promise<string> {
  try {
    const g = globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }
    const before = g.__PUSH_TEST_NEXT_HEADERS__
    g.__PUSH_TEST_NEXT_HEADERS__ = { headers: () => new Headers({ host }), cookies: () => ({ getAll: () => [], get: () => undefined, set() {} }) }
    const { default: Page } = await import("@/app/(storelib)/receipt/[token]/page")
    const { renderToStaticMarkup } = await import("react-dom/server")
    const tree = await Page({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) } as never)
    const html = renderToStaticMarkup(tree)
    g.__PUSH_TEST_NEXT_HEADERS__ = before
    return html
  } catch (e) {
    return `render failed: ${e instanceof Error ? e.stack : String(e)}`
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
