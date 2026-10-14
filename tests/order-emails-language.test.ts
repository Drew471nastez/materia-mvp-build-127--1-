/**
 * A buyer's emails in the language they bought in (lib/emails/words.ts):
 * the checkout's language goes on the order (its origin), every email is
 * built in it with the store's approved translations, a sentence with none
 * reads in English, and English is exactly what it was.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { et, emailLanguage, inEmailLanguage } from "@/lib/emails/words"
import { orderConfirmationEmail, refundEmail, shipmentEmail, orderDateText, type OrderEmailModel } from "@/lib/physical/email-templates"
import { buyerReceiptEmailHtml, type ReceiptEmailModel } from "@/lib/receipts/email"
import { emailKey, emailSentences, emailTranslatables, emailWordsFrom } from "@/lib/markets/checkout-words"
import { BUILT_IN_GROUPS, isBuiltInWordKey, isTranslationKey, sourceHash, translationMap } from "@/lib/markets/translate"
import { cleanOrigin, decodeOrigin, encodeOrigin } from "@/lib/orders/order-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const model: OrderEmailModel = {
  shopName: "Bread Studio", orderNumber: "#1042", buyerFirstName: "Ana",
  lines: [{ title: "Mug", variantName: null, quantity: 2, cents: 4000, imageUrl: null }],
  totals: { subtotal: 4000, discount: 0, shipping: 500, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 4500, currency: "EUR" },
  address: { line1: "1 Rue de Rivoli", city: "Paris", postalCode: "75001", country: "FR" }, deliveryName: "Standard", deliveryEstimate: null,
  statusUrl: "https://bread.studio/orders/x", hasDownloads: false,
}
const FR: Record<string, string> = {
  "Order {number} confirmed": "Commande {number} confirmée",
  "Thank you for your purchase!": "Merci pour votre achat !",
  "Hi {name}, we're getting your order ready to be shipped. We'll let you know when it's on its way.": "Bonjour {name}, nous préparons l'expédition de votre commande. Nous vous préviendrons dès son départ.",
  "View your order": "Voir votre commande",
  "Subtotal": "Sous-total",
  "Order {number} is on the way": "La commande {number} est en route",
  "Refund for order {number}": "Remboursement de la commande {number}",
  "Your receipt from {shop}": "Votre reçu de {shop}",
}

console.log("\nEnglish is what it was")
const plain = orderConfirmationEmail(model)
const inEnglish = inEmailLanguage("en", {}, () => orderConfirmationEmail(model))
check("built with no language and in English: the same email, letter for letter", plain.subject === inEnglish.subject && plain.html === inEnglish.html && plain.text === inEnglish.text)
check("  the sentences read as before", plain.subject === "Order #1042 confirmed" && plain.text.includes("Hi Ana, we're getting your order ready to be shipped.") && plain.html.includes("Thank you for your purchase!") && /<html lang="en"/.test(plain.html))

console.log("\nIn French")
const fr = inEmailLanguage("fr", FR, () => orderConfirmationEmail({ ...model, orderDate: orderDateText("2026-10-10T12:00:00Z") }))
check("the subject, the heading and the opening, in French", fr.subject === "Commande #1042 confirmée" && fr.html.includes("Merci pour votre achat !") && fr.text.includes("Bonjour Ana, nous préparons"), fr.subject)
check("  the button and the totals", fr.html.includes("Voir votre commande") && fr.html.includes("Sous-total"))
check("  the email says it is French, and its date is French", /<html lang="fr"/.test(fr.html) && fr.html.includes("octobre"))
check("a sentence nobody translated reads in English, never a key", fr.html.includes("Shipping method") && !/\{[a-z]+\}/.test(fr.text))
check("the language is put back after the build", emailLanguage() === "en" && et("Subtotal") === "Subtotal")
const ship = inEmailLanguage("fr", FR, () => shipmentEmail({ shopName: "Bread Studio", orderNumber: "#1042", buyerFirstName: null, lines: model.lines, carrier: null, trackingNumber: null, trackingUrl: null, address: null, statusUrl: model.statusUrl, kind: "shipped" }))
check("shipped, in French", ship.subject === "La commande #1042 est en route", ship.subject)
const refund = inEmailLanguage("fr", FR, () => refundEmail({ shopName: "Bread Studio", orderNumber: "#1042", buyerFirstName: null, amountCents: 4500, refundedCents: 4500, totalCents: 4500, currency: "EUR", paymentLabel: null, statusUrl: model.statusUrl }))
check("a refund, in French", refund.subject === "Remboursement de la commande #1042")
const receipt = { firstName: "Ana", sellerName: "Bread Studio", sellerPicture: null, orderNumber: "#7", dateText: "10 Oct 2026", items: [{ title: "Guide", variantName: null, amountText: "€9.00", note: null }], subtotalText: null, tipText: null, totalText: "€9.00", refundedText: null, link: "https://bread.studio/receipt/x", buttonLabel: "View your receipt", supportEmail: "a@b.co" } as unknown as ReceiptEmailModel
check("the download receipt, in French", /Votre reçu de Bread Studio/.test(inEmailLanguage("fr", FR, () => buyerReceiptEmailHtml(receipt))))

console.log("\nThe sentences, and their translations")
const all = emailSentences()
check("every email sentence is listed", ["Order {number} confirmed", "Your order is on the way", "We got your return request", "Your receipt from {shop}", "Button not working? Paste this link into your browser:"].every((s) => all.includes(s)))
check("  with when a pickup is usually ready", all.some((s) => /ready/i.test(s) && !/\{/.test(s) && /hour|day/i.test(s)))
const items = emailTranslatables()
check("each a text of the website with its own key, in Order emails", items.length === all.length && items.every((i) => isTranslationKey(i.key) && i.where === "Order emails"))
check("listed in Translate and translated into a website's own language too", /groups\.push\(\{ id: "emails", title: "Order emails", items: emailTranslatables\(\) \}\)/.test(read("lib/markets/server.ts")) && BUILT_IN_GROUPS.has("emails") && isBuiltInWordKey(emailKey("Subtotal")))
const map = translationMap([{ key: emailKey("Subtotal"), value: "Sous-total", sourceHash: sourceHash("Subtotal"), status: "approved", source: "ai" }, { key: emailKey("Total"), value: "Total (brouillon)", sourceHash: sourceHash("Total"), status: "draft", source: "ai" }])
const words = emailWordsFrom(map)
check("approved translations only", words.Subtotal === "Sous-total" && !("Total" in words))

console.log("\nThe order keeps the language it was placed in")
const origin = cleanOrigin({ surface: "website", site: "bread.studio", lang: "fr" })
check("the origin keeps the language", origin?.lang === "fr")
check("  through the payment's metadata and back", decodeOrigin(encodeOrigin(origin))?.lang === "fr")
check("  never anything that is not a language", cleanOrigin({ surface: "website", lang: "<script>" })?.lang === undefined)
check("the checkout sends it with the order", /origin: pageLang \? \{ \.\.\.\(checkoutOrigin\(shopId\) \?\? \{\}\), lang: pageLang \}/.test(read("app/checkout/site/site-checkout.tsx")))
const jobs = read("lib/physical/jobs-server.ts")
check("every order email is built in it", /emailLanguageFor\(co\.creator_id, co\.origin\?\.lang\)/.test(jobs) && (jobs.match(/mail = say\(\(\) =>/g) ?? []).length === 8)
check("  and the store's own wording only in its own language", /id && language\.own \? resolveCopy/.test(jobs))
check("the download receipt too", /lang: s\.buyerLang \?\? null/.test(read("lib/checkout/fulfil-cart-session.ts")) && /emailLanguageFor\(creatorId, params\.lang\)/.test(read("lib/email.tsx")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
