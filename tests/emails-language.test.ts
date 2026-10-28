/**
 * The language a buyer's email is written in (lib/emails/buyer-channel.ts):
 * an order on the published website in the language the buyer used there,
 * else the website's own; a purchase on the creator page, Explore or in a
 * community in English. The rule, every sender that follows it, and the
 * previews that follow it too.
 *
 *   npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buyerChannel, ownWordsApply, signedBy } from "@/lib/emails/buyer-channel"
import { previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { buyerRefundEmail, buyerRefundMail } from "@/lib/emails/notices"
import { emailSentences } from "@/lib/markets/checkout-words"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWhere it was bought decides\n")
check("on the website (its page, its cart, its checkout): the website", buyerChannel({ family: "digital", surface: "website" }) === "website" && buyerChannel({ family: "digital", source: "website" }) === "website" && buyerChannel({ family: "digital", siteBase: "https://bread.studio" }) === "website")
check("a language the checkout sent means a website's checkout", buyerChannel({ family: "digital", lang: "fr" }) === "website")
check("the creator page, a product page, the OnePage, Explore, a link: Storelib", ["profile", "product", "onepage", "explore", "link", "admin"].every((surface) => buyerChannel({ family: "digital", surface, lang: "fr" }) === "storelib"))
check("  the page Buy was pressed on wins over a recorded channel", buyerChannel({ family: "digital", surface: "explore", source: "website" }) === "storelib" && buyerChannel({ family: "physical", surface: "website", source: "storelib" }) === "website")
check("a community is always Storelib", buyerChannel({ family: "communities", surface: "website", lang: "fr" }) === "storelib")
check("nothing known: a download is Storelib's, an order that ships keeps the website's language as it always has", buyerChannel({ family: "digital" }) === "storelib" && buyerChannel({ family: "physical" }) === "website")
check("the website signs as the shop, Storelib as the creator", signedBy("website") === "shop" && signedBy("storelib") === "creator")

console.log("\nThe store's own words, only in its own language\n")
check("French website, French email: its words", ownWordsApply("fr", "fr") && ownWordsApply("pt-BR", "pt"))
check("French website, English email (bought on Storelib): the standard words", !ownWordsApply("en", "fr"))
check("no website, or an English one: English is its own", ownWordsApply("en", null) && ownWordsApply("en", "en"))

console.log("\nEvery sender follows the rule\n")
const email = read("lib/email.tsx")
check("the receipt: by where it was bought, read from the order when not passed", /buyerChannel\(\{ family: "digital", source: where\.source, surface: where\.origin\?\.surface, lang: params\.lang \?\? where\.origin\?\.lang, siteBase \}\)/.test(email) && /buyerEmailLanguage\(creatorId, channel,/.test(email) && /from\("orders"\)\.select\("source, source_detail"\)/.test(email))
check("  a copy of the receipt to another address the same way", (email.match(/buyerChannel\(\{ family: "digital", source: where\.source/g) ?? []).length === 2)
check("  the checkout passes where it was bought", /source,\s*\n\s*origin,\s*\n\s*\}\)/.test(read("lib/checkout/fulfil-payment.ts")) && /origin: orderOriginFrom\(metadata\)/.test(read("app/api/stripe/webhook/route.ts")) && /source: params\.source \?\? null,\s*origin: params\.origin \?\? null/.test(email))
check("the refund of a download: the website's language and shop for a website order", /async function refundSigner/.test(email) && /buyerEmailLanguage\(creatorId, channel, origin\?\.lang\)/.test(email) && /buyerRefundMail\(/.test(email))
check("an order that ships", /buyerEmailLanguage\(co\.creator_id, buyerChannel\(\{ family: "physical", surface: co\.origin\?\.surface, lang: co\.origin\?\.lang \}\), co\.origin\?\.lang\)/.test(read("lib/physical/jobs-server.ts")))
check("the checkout reminder", /inEmailLanguage\(language\.lang, language\.words, \(\) => checkoutReminderEmail/.test(read("lib/automations/abandoned-reminder.ts")) && /language\.own \? resolveCopy/.test(read("lib/automations/abandoned-reminder.ts")))
check("the review ask", /buyerEmailLanguage\(row\.creator_id, channel, origin\?\.lang\)/.test(read("lib/reviews/requests-server.ts")))
const words = read("lib/emails/words-server.ts")
check("Storelib's is English, with the store's own English checkout words, never the website's language", /if \(channel === "website"\) return emailLanguageFor\(creatorId, asked\)/.test(words) && /checkoutOverrides\(creatorId, "en"\)/.test(words) && /lang: "en", words: emailWordsIn\("en", null, overrides\)/.test(words))
check("a language that is not published any more falls back to the store's default (lib/markets/buyer-language.ts)", /buyerLanguage\(\{ defaultLanguage: langs\.defaultLanguage, published: langs\.others, order: asked \}\)/.test(words) && /const lang = other \?\? langs\.defaultLanguage/.test(words))

console.log("\nThe refund email can be translated now, and English reads as it did\n")
const facts = { storeName: "Bread Studio", productTitle: "Guide", amount: "$12.00", orderDate: "Oct 1, 2026", refundDate: "Oct 3, 2026", reason: "Requested by seller", orderRef: "#1A2B3C4D", contactEmail: "a@b.co" }
const en = buyerRefundEmail(facts)
check("English, word for word", en.subject === "Your $12.00 refund for Guide has been processed" && en.text.includes("Bread Studio refunded $12.00 for Guide. You don't need to do anything.") && en.text.includes("Banks usually take 5 to 10 business days to show it on your statement.") && en.text.includes("Questions? Write to Bread Studio at a@b.co"), en.subject)
check("every sentence of it is a line of Translate › Order emails", ["Your refund is on its way", "Your {amount} refund for {product} has been processed", "{store} refunded {amount} for {product}. You don't need to do anything.", "Refund date"].every((s) => emailSentences().includes(s)))
const fr = buyerRefundMail({ storeName: "Bread Studio", productTitle: "Guide", amountCents: 1200, currency: "EUR", orderId: "1a2b3c4d-0000", reason: "requested_by_customer", orderDate: "2026-10-01T12:00:00Z", refundDate: "2026-10-03T12:00:00Z", contactEmail: "a@b.co" }, { lang: "fr", words: { "Your refund is on its way": "Votre remboursement est en route" } })
check("in French: its words, its amount and its days", fr.html.includes("Votre remboursement est en route") && /12,00\s€/.test(fr.text) && fr.text.includes("oct."), fr.text.slice(0, 300))
check("Stripe's reason codes read as words", !/requested_by_customer/.test(fr.text) && buyerRefundMail({ storeName: "S", productTitle: "G", amountCents: 100, currency: "USD", orderId: "x", reason: "duplicate", refundDate: "2026-10-03T12:00:00Z", contactEmail: "a@b.co" }).text.includes("Charged twice"))

console.log("\nThe previews follow the same rule\n")
const shop = { name: "Bread Studio", currency: "EUR", storeUrl: "https://bread.studio" }
const FR = { "Thanks for your order, {name}": "Merci pour votre commande, {name}", "Order {number} confirmed": "Commande {number} confirmée" }
const receiptFr = previewCustomerEmail("receipt", shop, null, { channel: "website", language: { lang: "fr", words: FR, own: false } })!
check("a receipt bought on the website, in French", receiptFr.html.includes("Merci pour votre commande, Maria") && /<html lang="fr"/.test(receiptFr.html) && receiptFr.html.includes("octobre"))
const receiptStorelib = previewCustomerEmail("receipt", shop, null, { channel: "storelib", language: { lang: "en", words: {}, own: false }, creator: { name: "Ana Pop" } })!
check("bought on the creator page, in English", /<html lang="en"/.test(receiptStorelib.html) && receiptStorelib.html.includes("Thanks for your order, Maria"))
const own = { heading: "Bine ai venit, {{customer_name}}" }
check("the store's words show in its own language and not in another", previewCustomerEmail("receipt", shop, own, { language: { lang: "ro", words: {}, own: true } })!.html.includes("Bine ai venit, Maria") && !previewCustomerEmail("receipt", shop, own, { language: { lang: "fr", words: FR, own: false } })!.html.includes("Bine ai venit"))
const confirmFr = previewCustomerEmail("order_confirmation", shop, null, { language: { lang: "fr", words: FR, own: false } })!
check("an order that ships, in French, its date too", confirmFr.subject === "Commande #1042 confirmée" && /<html lang="fr"/.test(confirmFr.html) && confirmFr.html.includes("octobre"), confirmFr.subject)
const panel = read("components/app/settings/customer-emails-panel.tsx")
check("the editor offers the website's languages and where it was bought", /data-preview-language/.test(panel) && /\{ id: "website", label: tt\("Your website"\) \}/.test(panel) && /\?channel=storelib/.test(panel) && /\?lang=\$\{encodeURIComponent\(lang\)\}/.test(panel))
check("  and says when the store's own words do not go in this language", /data-preview-own-note/.test(panel))
check("  a test is sent the way the preview shows it", /body: \{ id, channel: where\.channel, lang: where\.lang/.test(panel) && /storePreview\(db, c\.creatorId, id, words, \{ channel:/.test(read("app/api/store/emails/test/route.ts")))
check("community emails are English: no language to pick", !/language/i.test(read("components/app/emails/community-emails.tsx").split("export function CommunityEmails")[1].split("function useServerPreview")[0]))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
