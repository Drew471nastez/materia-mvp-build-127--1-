/**
 * Round T: the order confirmation in Shopify's layout, and Settings ›
 * Customer emails listing and previewing every email a buyer gets.
 *
 *   npx tsx tests/emails-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { orderConfirmationEmail } from "@/lib/physical/email-templates"
import { CUSTOMER_EMAILS, previewCustomerEmail, visibleCustomerEmails } from "@/lib/emails/customer-catalog"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const base = {
  shopName: "Angus Farm",
  orderNumber: "#1042",
  buyerFirstName: "Maria",
  lines: [{ title: "Honey", variantName: "500 g", quantity: 2, cents: 3200, imageUrl: null }],
  totals: { subtotal: 3200, discount: 500, shipping: 700, shippingDiscount: 700, tax: 0, taxIncluded: false, total: 2700, currency: "EUR" },
  address: { name: "Maria", line1: "Strada 1", city: "Bucharest", postalCode: "030031", country: "RO" },
  deliveryName: "Standard",
  deliveryEstimate: "3 to 5 business days",
  statusUrl: "https://storelib.com/checkout/physical/order/t",
  hasDownloads: false,
}

console.log("\nThe order confirmation, Shopify's way\n")
{
  const m = orderConfirmationEmail({ ...base, storeUrl: "https://storelib.com/angus", paymentLabel: "Visa ending 4242", supportEmail: "hello@angus.ro" })
  check("the order number across from the shop's name, and a thank you", /ORDER #1042|Order #1042/.test(m.html) && /Thank you for your purchase!/.test(m.html))
  check("what happens next, by name", /Hi Maria, we&#39;re getting your order ready to be shipped|Hi Maria, we're getting your order ready to be shipped/.test(m.html))
  check("View your order, or visit the store", /View your order/.test(m.html) && /href="https:\/\/storelib\.com\/angus"[^>]*>Visit our store/.test(m.html))
  check("Order summary with what was saved", /Order summary/.test(m.html) && /You saved<\/td>[\s\S]{0,400}>€12\.00</.test(m.html))
  check("Customer information: address, method and how it was paid", /Customer information/.test(m.html) && /Shipping address/.test(m.html) && /Shipping method/.test(m.html) && /Visa ending 4242/.test(m.html))
  check("where questions go, by address", /write to the store/.test(m.html) && /mailto:hello@angus\.ro/.test(m.html))
  const bare = orderConfirmationEmail(base)
  check("without a payment, a store link or savings, nothing empty is drawn", !/Payment method/.test(bare.html.replace(/You saved[^<]*/, "")) && !/Visit our store/.test(bare.html))
  check("a store link that isn't https is never put in", !/Visit our store/.test(orderConfirmationEmail({ ...base, storeUrl: "javascript:alert(1)" }).html))
  check("the plain text says it all too", /Order summary/.test(m.text) && /Payment method: Visa ending 4242/.test(m.text) && /Visit our store: https:\/\/storelib\.com\/angus/.test(m.text))
  check("no em dashes or filler words", !/—|unlock|elevate|seamless|effortless|supercharge/i.test(m.html + m.text))
  const job = read("lib/physical/jobs-server.ts")
  check("the email job reads the store's page, the card and the support address", /paymentLabel: paymentLabelOf\(paidRow\)/.test(job) && /storeUrl: store\.websiteUrl/.test(job) && /supportEmail:/.test(job))
}

console.log("\nSettings › Customer emails\n")
{
  check("every email a buyer gets, the shipped ones only with physical products on", visibleCustomerEmails(false).map((e) => e.id).join() === "receipt,checkout_reminder" && visibleCustomerEmails(true).length === CUSTOMER_EMAILS.length)
  const drawn = CUSTOMER_EMAILS.map((e) => ({ id: e.id, mail: previewCustomerEmail(e.id, { name: "Angus Farm", supportEmail: "hello@angus.ro", storeUrl: "https://storelib.com/angus", currency: "EUR" }) }))
  check("each one previews through the template that sends it, with the store's name", drawn.every((d) => !!d.mail && d.mail.html.includes("Angus Farm") && d.mail.subject.length > 0), drawn.filter((d) => !d.mail || !d.mail.html.includes("Angus Farm")).map((d) => d.id))
  check("  an id that isn't one draws nothing", previewCustomerEmail("nope", { name: "X" }) === null)
  const route = read("app/api/store/emails/preview/route.ts")
  check("the preview is the owner's", /shopCaller\(\)/.test(route))
  const panel = read("components/app/settings/customer-emails-panel.tsx")
  check("shown in a frame that runs no script", /sandbox="allow-same-origin"/.test(panel) && !/allow-scripts/.test(panel))
  check("Settings has it, for every store", /\{ id: "emails", label: "Customer emails"/.test(read("components/app/settings-form-new.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
