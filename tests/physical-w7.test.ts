/**
 * PHYSICAL COMMERCE, END TO END, THE PARTS ROUND W7 CHANGED
 *
 *   carriers        every carrier the seller can pick links to its own tracking page
 *   order links     the order page on the store's own host; numbers as buyers type them
 *   order lookup    Track your order: only this store's order, only for its own email
 *   emails          the order link email, the supplier's Add tracking, the reset email
 *   partners        the signed link and the signed webhook a partner reports tracking with
 *   routing         /checkout/track on a website's host; wallets on its subdomain
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/physical-w7.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHmac } from "node:crypto"
import { FakeSupabase } from "./fake-supabase"
import { CARRIER_LIST, CARRIER_NAMES, carrierOf, carrierTrackingUrl, normaliseTrackingNumber } from "@/lib/physical/carriers"
import { CARRIERS, trackingUrl } from "@/lib/physical/status"
import { isOrderNumberOf, orderPagePath, originSiteHost, readOrderNumber } from "@/lib/physical/order-link"
import { findOrderFor } from "@/lib/physical/order-lookup-server"
import { orderLinkEmail, supplierOrderEmail } from "@/lib/physical/email-templates"
import { resetPasswordEmail } from "@/lib/account/reset-email"
import { siteCheckoutRouteFor } from "@/lib/checkout/site-checkout"
import { siteSubdomainForWallets } from "@/lib/custom-domains/payment-hosts"
import { signPartnerLink, verifyPartnerLink, webhookSignatureOk, PARTNER_LINK_TTL_MS } from "@/lib/physical/partner-link"
import { openItemsAt, readPartnerStatus } from "@/lib/physical/partner-server"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-partner-links-0123456789"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    process.stdout.write(`  ok    ${label}\n`)
  } else {
    failed++
    process.stdout.write(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}`}\n`)
  }
}
const section = (t: string) => process.stdout.write(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  section("Carriers: each one links to its own tracking page")
  {
    const want: [string, string, RegExp][] = [
      ["UPS", "1Z999AA10123456784", /^https:\/\/www\.ups\.com\/track\?tracknum=1Z999AA10123456784$/],
      ["USPS", "9400111899223856928499", /^https:\/\/tools\.usps\.com\//],
      ["FedEx", "123456789012", /^https:\/\/www\.fedex\.com\//],
      ["DHL Express", "1234567890", /^https:\/\/www\.dhl\.com\//],
      ["Royal Mail", "AB123456789GB", /^https:\/\/www\.royalmail\.com\/.*AB123456789GB$/],
      ["DPD", "05212345678901", /^https:\/\/tracking\.dpd\.de\//],
      ["GLS", "12345678901", /^https:\/\/gls-group\.com\//],
      ["FAN Courier", "2345678901234", /^https:\/\/www\.fancourier\.ro\//],
      ["Sameday", "1ONB12345678901", /^https:\/\/sameday\.ro\//],
      ["Cargus", "1234567890", /^https:\/\/www\.cargus\.ro\//],
      ["Posta Romana", "RR123456789RO", /^https:\/\/www\.posta-romana\.ro\//],
      ["Canada Post", "1234567890123456", /^https:\/\/www\.canadapost-postescanada\.ca\//],
      ["Australia Post", "33ABC1234567", /^https:\/\/auspost\.com\.au\//],
      ["PostNL", "3SABCD1234567", /^https:\/\/jouw\.postnl\.nl\//],
      ["La Poste / Colissimo", "6A12345678901", /^https:\/\/www\.laposte\.fr\//],
      ["Evri", "H01ABC0012345678", /^https:\/\/www\.evri\.com\//],
      ["Hermes", "12345678901234", /^https:\/\/www\.myhermes\.de\//],
      ["Aramex", "12345678901", /^https:\/\/www\.aramex\.com\//],
    ]
    for (const [carrier, number, re] of want) check(`${carrier}`, re.test(trackingUrl(carrier, number) ?? ""), trackingUrl(carrier, number))
    check("every carrier in the list makes an https link", CARRIER_LIST.every((c) => /^https:\/\/[^\s"'<>]+$/.test(c.url("AB123456"))))
    check("names are matched however they are typed: 'fan courier', 'Hermes UK' is Evri, 'Poșta' without the accent, 'colissimo'", carrierOf("fan courier")?.name === "FAN Courier" && carrierOf("Hermes UK")?.name === "Evri" && carrierOf("posta romana")?.name === "Posta Romana" && carrierOf("Colissimo")?.name === "La Poste / Colissimo" && carrierOf("dhl")?.name === "DHL Express")
    check("an unknown carrier gets no link: the number shows alone, the seller can paste one", trackingUrl("Local courier", "ABC12345") === null && carrierTrackingUrl(null, "ABC12345") === null)
    check("a number with spaces is a number (Royal Mail prints them)", normaliseTrackingNumber(" AB 1234 5678 9GB ") === "AB123456789GB" && /AB123456789GB$/.test(trackingUrl("Royal Mail", "AB 1234 5678 9GB") ?? ""))
    check("anything that is not a number makes no link", trackingUrl("UPS", "bad number!") === null && trackingUrl("UPS", "<script>") === null && trackingUrl("UPS", "") === null)
    check("the seller's list: every carrier, Other last, and the order panel reads it", CARRIERS === CARRIER_NAMES && CARRIERS[CARRIERS.length - 1] === "Other" && CARRIERS.length === CARRIER_LIST.length + 1 && /CARRIERS\.map/.test(read("components/physical/order-panel.tsx")))
    const orders = read("lib/physical/orders-server.ts")
    check("the server takes the spaces out before checking the number", /normaliseTrackingNumber\(cleanText\(input\.trackingNumber, 80\)\)/.test(orders))
    check("a shipment saved without a link gets its carrier's when the buyer is emailed and on the order page", /trackingUrl: f\.tracking_url \?\? trackingUrl\(f\.carrier, f\.tracking_number\)/.test(read("lib/physical/jobs-server.ts")) && /trackingUrl: f\.tracking_url \?\? trackingUrl\(f\.carrier, f\.tracking_number\)/.test(orders))
  }

  section("Order links: the store's own address, and numbers as buyers type them")
  {
    check("the order page's path, and nothing for a token that is not one", orderPagePath("abcdefghijklmnopqrstuv") === "/checkout/physical/order/abcdefghijklmnopqrstuv" && orderPagePath("short") === null && orderPagePath("../../etc/passwd-aaaaaaaaaaaa") === null)
    check("the website an order was placed on, from its origin", originSiteHost({ surface: "website", site: "Andrews.Storelib.com" }) === "andrews.storelib.com" && originSiteHost({ surface: "profile", site: "x.com" }) === null && originSiteHost(null) === null && originSiteHost({ surface: "website", site: "bad host!" }) === null)
    check("an order number however it is typed", readOrderNumber("#3f2a9c1b") === "3F2A9C1B" && readOrderNumber(" 3F2A 9C1B ") === "3F2A9C1B" && readOrderNumber("3F2A9C1") === null && readOrderNumber("ZZZZZZZZ") === null && readOrderNumber(42) === null)
    check("matched against an id the way every email numbers it", isOrderNumberOf("3f2a9c1b-0000-4000-8000-000000000000", "3F2A9C1B") && !isOrderNumberOf("3f2a9c1c-0000-4000-8000-000000000000", "3F2A9C1B"))
    const jobs = read("lib/physical/jobs-server.ts")
    check("buyer emails link the order page on the store's website, not storelib.com", /const orderUrl = await orderPageUrl\(db, co\)/.test(jobs) && !/checkout\/physical\/order\/\$\{encodeURIComponent\(token\)\}/.test(jobs))
    const server = read("lib/physical/order-link-server.ts")
    check("  the website it was placed on first, while it still serves this creator, then the store's own, then storelib.com", /originSiteHost\(origin\)[\s\S]*servingSiteOrigin\(db, creatorId[\s\S]*firstServingSite\(db, creatorId, await siteHostsFor\(creatorId, db\)\)[\s\S]*return platform/.test(server))
  }

  section("Track your order: this store's order, for its own email, and the page never says which")
  {
    const C = "c0000000-0000-4000-8000-000000000001"
    const OTHER = "c0000000-0000-4000-8000-000000000002"
    const db = new FakeSupabase()
    db.table("commerce_checkouts", {}, [
      { id: "3f2a9c1b-0000-4000-8000-000000000001", creator_id: C, buyer_email: "ana_b@mail.test", status: "paid", receipt_token: "tok-physical-aaaaaaaaaaaa", paid_at: "2026-09-20T10:00:00Z", created_at: "2026-09-20T09:59:00Z", fulfillment_status: "fulfilled", delivery_method: "ship", cancelled_at: null },
      { id: "4a4a4a4a-0000-4000-8000-000000000001", creator_id: OTHER, buyer_email: "ana_b@mail.test", status: "paid", receipt_token: "tok-elsewhere-aaaaaaaaaaa", paid_at: "2026-09-20T10:00:00Z", created_at: "2026-09-20T09:59:00Z", fulfillment_status: "unfulfilled", delivery_method: "ship", cancelled_at: null },
      { id: "5b5b5b5b-0000-4000-8000-000000000001", creator_id: C, buyer_email: "ana_b@mail.test", status: "pending", receipt_token: "tok-unpaid-aaaaaaaaaaaaa", paid_at: null, created_at: "2026-09-21T09:59:00Z", fulfillment_status: "unfulfilled", delivery_method: "ship", cancelled_at: null },
    ])
    db.table("orders", {}, [{ id: "7c7c7c7c-0000-4000-8000-000000000001", creator_id: C, buyer_email: "ana_b@mail.test", status: "completed", receipt_token: "tok-download-aaaaaaaaaaa", created_at: "2026-09-22T10:00:00Z" }])
    const found = await findOrderFor(db, { creatorId: C, email: "Ana_B@mail.test", number: "3F2A9C1B" })
    check("the store's own paid order, with the email it was placed with (any case)", found?.path === "/checkout/physical/order/tok-physical-aaaaaaaaaaaa" && found.number === "#3F2A9C1B" && found.status === "Shipped" && found.date === "Sep 20, 2026", found)
    check("not with another email, not one an underscore wildcard would match", (await findOrderFor(db, { creatorId: C, email: "nobody@mail.test", number: "3F2A9C1B" })) === null && (await findOrderFor(db, { creatorId: C, email: "anaxb@mail.test", number: "3F2A9C1B" })) === null)
    check("never another store's order, never an unpaid one", (await findOrderFor(db, { creatorId: C, email: "ana_b@mail.test", number: "4A4A4A4A" })) === null && (await findOrderFor(db, { creatorId: C, email: "ana_b@mail.test", number: "5B5B5B5B" })) === null)
    const download = await findOrderFor(db, { creatorId: C, email: "ana_b@mail.test", number: "7C7C7C7C" })
    check("a download opens its receipt (which sends a parcel on to its order page)", download?.path === "/receipt/tok-download-aaaaaaaaaaa", download)

    const route = read("app/api/checkout/site/track/route.ts")
    check("the store is the host's, the form is this site's own", /siteOfRequest\(admin, request\)/.test(route) && /sameOriginForm\(request, site\.host\)/.test(route))
    check("limited per visitor and per address emailed", /bucket: "order-lookup-visitor", subjects: \[addressSubject\(request\)\]/.test(route) && /bucket: "order-lookup-email", subjects: \[emailSubject\(email\)\]/.test(route))
    check("looked up and emailed after the answer, which is the same either way", /after\(async \(\) => \{[\s\S]*findOrderFor[\s\S]*\}\)\s*return back\(site\.origin, \{ sent: "1" \}\)/.test(route) && (route.match(/sent: "1"/g) ?? []).length === 1)
    check("  sent transactional, to the order's own address only", /sendMailgunEmail\(\{ to: email,[\s\S]*transactional: true/.test(route))
    const page = read("app/checkout/site/track/page.tsx")
    check("the page says the same words whether anything matched, and prints nothing from the address", /If that order number and email match an order, we sent a link to it/.test(page) && /Object\.prototype\.hasOwnProperty\.call\(ERRORS, sp\.error\)/.test(page))
    const mail = orderLinkEmail({ shopName: "Ana's <Shop>", orders: [{ number: "#3F2A9C1B", date: "Sep 20, 2026", url: "https://ana.storelib.com/checkout/physical/order/tok", status: "Shipped" }], brand: { logoUrl: null, email: "hi@ana.test", phone: null, websiteUrl: "https://ana.storelib.com" } })
    check("the email: the order, its link on the store's site, the store escaped", mail.subject === "Your order #3F2A9C1B from Ana's <Shop>" && mail.html.includes('href="https://ana.storelib.com/checkout/physical/order/tok"') && mail.html.includes("Ana's &lt;Shop&gt;") && !mail.html.includes("<Shop>"), mail.subject)
    check("  and as text", mail.text.includes("https://ana.storelib.com/checkout/physical/order/tok") && !/Get help with this order/.test(mail.text))
    check("both sign in pages link to it", /href="\/checkout\/track"/.test(read("themes/default/sections/main_login.storelib")) && /href="\/checkout\/track"/.test(read("lib/storelib-theme/compat/account.ts")))
  }

  section("Routing on a website's host")
  {
    const r = (path: string, method = "GET", search = "") => siteCheckoutRouteFor(path, search, method, "andrews.storelib.com")
    check("/checkout/track is the lookup page, on this host", JSON.stringify(r("/checkout/track")) === JSON.stringify({ kind: "rewrite", path: "/checkout/site/track" }) && JSON.stringify(r("/checkout/track/", "GET", "?sent=1")) === JSON.stringify({ kind: "rewrite", path: "/checkout/site/track?sent=1" }))
    check("  a POST to it is sent back to it as a GET", JSON.stringify(r("/checkout/track", "POST")) === JSON.stringify({ kind: "redirect", to: "/checkout/track", status: 303 }))
    check("  and its inside address goes to the public one", JSON.stringify(r("/checkout/site/track", "GET", "?x=1")) === JSON.stringify({ kind: "redirect", to: "/checkout/track?x=1", status: 302 }))
    check("the order page and the checkout keep their routes", r("/checkout/physical/order/tok")?.kind === "pass" && r("/checkout")?.kind === "rewrite")
    check("a website's subdomain is registered for wallets, exactly", siteSubdomainForWallets("Andrews.storelib.com:443", "storelib.com") === "andrews.storelib.com")
    check("  never storelib.com, www, a deeper name or another domain", siteSubdomainForWallets("storelib.com", "storelib.com") === null && siteSubdomainForWallets("www.storelib.com", "storelib.com") === null && siteSubdomainForWallets("a.b.storelib.com", "storelib.com") === null && siteSubdomainForWallets("shop.example.com", "storelib.com") === null)
    const page = read("app/checkout/site/page.tsx")
    check("  when its checkout opens, after the page is sent", /if \(site\.kind === "subdomain"\) after\(\(\) => ensureSiteWalletDomain\(admin, site\.host\)\)/.test(page))
    const pmd = read("lib/custom-domains/stripe-pmd.ts")
    check("  once active never again, else once a day per host", /apple_pay_status === "active" && row\.google_pay_status === "active"\) return/.test(pmd) && /now - at < 24 \* 3600_000/.test(pmd))
  }

  section("Partners: the signed link and the signed webhook")
  {
    const CO = "3f2a9c1b-0000-4000-8000-000000000001"
    const LOC = "11111111-0000-4000-8000-000000000001"
    const now = Date.now()
    const token = signPartnerLink(CO, LOC, now)!
    check("a link names one order and one location", verifyPartnerLink(token, now)?.c === CO && verifyPartnerLink(token, now)?.l === LOC)
    check("  for 60 days", verifyPartnerLink(token, now + PARTNER_LINK_TTL_MS - 1000) !== null && verifyPartnerLink(token, now + PARTNER_LINK_TTL_MS + 1000) === null)
    const [body, sig] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ c: CO, l: "22222222-0000-4000-8000-000000000002", e: now + 1e9 })).toString("base64url")
    check("  changed by a letter, or pointed at another location, it is nothing", verifyPartnerLink(`${body}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`, now) === null && verifyPartnerLink(`${forged}.${sig}`, now) === null && verifyPartnerLink("x", now) === null)
    const secret = "whsec_test_partner"
    const raw = JSON.stringify({ order_id: CO, carrier: "UPS", tracking_number: "1Z999AA10123456784" })
    const ts = String(Math.floor(now / 1000))
    const good = `v1=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`
    check("a webhook signed with the shop's secret, the way Storelib signs its own", webhookSignatureOk(secret, ts, good, raw, now))
    check("  not with another secret, another body, or five minutes late", !webhookSignatureOk("other", ts, good, raw, now) && !webhookSignatureOk(secret, ts, good, `${raw} `, now) && !webhookSignatureOk(secret, ts, good, raw, now + 301_000) && !webhookSignatureOk(secret, null, good, raw, now))
    check("statuses a partner may send", readPartnerStatus("delivered") === "delivered" && readPartnerStatus("in_transit") === "in_transit" && readPartnerStatus("cancelled") === null && readPartnerStatus("pending") === null)
    const lines = [
      { orderId: "a", requiresShipping: true, locationId: LOC, quantity: 3, fulfilled: 1 },
      { orderId: "b", requiresShipping: true, locationId: "elsewhere", quantity: 1, fulfilled: 0 },
      { orderId: "c", requiresShipping: false, locationId: LOC, quantity: 1, fulfilled: 0 },
      { orderId: "d", requiresShipping: true, locationId: LOC, quantity: 2, fulfilled: 2 },
    ]
    check("a partner ships only its own items still to ship", JSON.stringify(openItemsAt({ lines } as never, LOC)) === JSON.stringify([{ orderId: "a", quantity: 2 }]))
    const mail = supplierOrderEmail({ shopName: "Shop", orderNumber: "#3F2A9C1B", locationName: "Print Co", lines: [{ title: "Tee", variantName: "M", quantity: 1, cents: 0, imageUrl: null, sku: "TEE-M" }], address: { name: "Ana", line1: "1 Main St", city: "Cluj", country: "RO" }, buyerEmail: null, deliveryName: null, note: null, trackingLink: "https://storelib.com/checkout/physical/partner/tok" })
    check("the supplier's email carries Add tracking, and still no prices", /href="https:\/\/storelib\.com\/checkout\/physical\/partner\/tok"/.test(mail.html) && /Add tracking/.test(mail.html) && /checkout\/physical\/partner\/tok/.test(mail.text) && !/\$\d/.test(mail.html))
    const jobs = read("lib/physical/jobs-server.ts")
    check("  signed for that order and location; the webhook names where to report back", /trackingLink: partnerPageUrl\(co\.id, loc\.id\)/.test(jobs) && /tracking_endpoint: `https:\/\/\$\{getMainDomain\(\)\}\/api\/physical\/partner-tracking`/.test(jobs) && /location_id: p\.locationId \?\? null/.test(jobs))
    const route = read("app/api/physical/partner-tracking/route.ts")
    check("the endpoint: an unknown order and a bad signature get the same answer", (route.match(/return denied\(\)/g) ?? []).length >= 3 && /webhookSignatureOk\(secret, request\.headers\.get\("x-storelib-timestamp"\), request\.headers\.get\("x-storelib-signature"\), raw\)/.test(route))
    check("  a location must be the shop's own; the form must be the page's own and carry its signed token", /eq\("creator_id", co\.creator_id\)/.test(route) && /sameOriginForm\(request, host\)/.test(route) && /verifyPartnerLink\(token\)/.test(route))
    const partner = read("lib/physical/partner-server.ts")
    check("  shipping goes through fulfilItems (stock, status, timeline, the buyer's email); a known number moves its shipment on", /fulfilItems\(db, input\.creatorId, input\.checkoutId, \{[\s\S]*notifyBuyer: true[\s\S]*partner: input\.partner/.test(partner) && /updateShipment\(db, input\.creatorId, existing\.id, \{ status/.test(partner))
  }

  section("Password reset: branded, and sent as the transactional email it is")
  {
    const url = "https://storelib.com/reset-password?code=abc_DEF-123"
    const m = resetPasswordEmail({ resetUrl: url, minutes: 60 })
    check("the link, in the button and as text, and when it stops working", m.html.includes(`href="${url}"`) && m.text.includes(url) && /works once, for 1 hour/.test(m.text))
    check("Storelib's own layout: the logo, ink button, no blue, no title case", /alt="Storelib"/.test(m.html) && /#1a1a2e/.test(m.html) && !/#2563eb/.test(m.html) && !/Reset Password/.test(m.html) && m.subject === "Reset your Storelib password")
    for (const p of ["app/api/auth/request-password-reset/route.ts", "app/api/auth/reset-password/route.ts"]) {
      const src = read(p)
      check(`${p}: the shared email, transactional`, /resetPasswordEmail\(\{ resetUrl, minutes: 60 \}\)/.test(src) && /transactional: true/.test(src) && /https:\/\/storelib\.com\/reset-password\?code=/.test(src))
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
