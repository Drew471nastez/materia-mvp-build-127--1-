/**
 * Who signs a digital product's emails (lib/emails/buyer-channel.ts
 * signedBy): the shop, by its name and logo, for a purchase on its website;
 * the creator, by their name and photo, for one on the creator page,
 * Explore or a community. The same in the sent email and in every preview.
 *
 *   npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { previewCustomerEmail } from "@/lib/emails/customer-catalog"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const shop = { name: "Bread Studio", currency: "EUR", logoUrl: "https://cdn.storelib.com/logos/bread.png", logoFrom: "store" as const, supportEmail: "hello@bread.studio" }
const creator = { name: "Ana Pop", photoUrl: "https://cdn.storelib.com/avatars/ana.jpg", logoUrl: null }

console.log("\nThe receipt\n")
const site = previewCustomerEmail("receipt", shop, null, { channel: "website", creator })!
const page = previewCustomerEmail("receipt", shop, null, { channel: "storelib", creator })!
check("bought on the website: the shop's name and its logo", site.html.includes("Bread Studio") && !site.html.includes("Ana Pop") && /bread\.png/.test(site.html))
check("bought on the creator page: the creator's name and photo, not the shop's", page.html.includes("Ana Pop") && /ana\.jpg/.test(page.html) && !/bread\.png/.test(page.html))
check("  the subject follows the signer when it names one", previewCustomerEmail("receipt", shop, { subject: "From {{shop_name}}" }, { channel: "storelib", creator })!.subject === "From Ana Pop")
check("a logo that is the owner's photo is drawn round, as the receipt draws it", previewCustomerEmail("receipt", { ...shop, logoFrom: "profile" }, null, { channel: "website" })!.html !== site.html)
check("no creator known: the shop signs, never an empty name", previewCustomerEmail("receipt", shop, null, { channel: "storelib" })!.html.includes("Bread Studio"))

console.log("\nThe refund\n")
const refundSite = previewCustomerEmail("digital_refund", shop, null, { channel: "website", creator })!
const refundPage = previewCustomerEmail("digital_refund", shop, null, { channel: "storelib", creator })!
check("website: the shop; creator page: the creator", refundSite.text.includes("Bread Studio refunded") && refundPage.text.includes("Ana Pop refunded") && !refundPage.text.includes("Bread Studio"))
check("in the store's currency", /€49\.00/.test(refundSite.text), refundSite.text.slice(0, 200))

console.log("\nThe senders sign the same way\n")
const email = read("lib/email.tsx")
check("the receipt asks the order who signs it", /signer: signedBy\(channel\)/.test(email) && (email.match(/signer: signedBy\(channel\)/g) ?? []).length === 2)
check("  the creator: their own name and photo", /const asCreator = params\.signer === "creator"/.test(email) && /asCreator \? senderPicture\(\{ photoUrl: brand\?\.avatarUrl \?\? photo, logoUrl: brand\?\.logoUrl \}\)/.test(email) && /sellerName: asCreator \? params\.sellerName \|\| v\.seller\.name/.test(email))
check("  the shop: its name and logo, as before", /storePicture \?\? senderPicture/.test(email) && /v\.seller\.name \|\| params\.sellerName/.test(email))
check("  and the inbox shows the one who signs it", /const fromName = model\.sellerName \|\| identity\?\.fromName/.test(email))
check("the refund of a website order is signed by the shop", /storeIdentity\(admin, creatorId, \{ logoOnly: true \}\)/.test(email) && /const signedName = safeText\(signer\?\.name \|\| storeName/.test(email))
const route = read("app/api/store/emails/route.ts")
check("the page is given both: the shop and the creator", /creator: \{ name: identity\.fromName/.test(route) && /logoFrom: store\?\.logoFrom/.test(route))
check("a test is signed as its preview is", /const signed = channel === "storelib" && \(id === "receipt" \|\| id === "digital_refund"\) \? creatorName : shopName/.test(read("lib/emails/customer-preview-server.ts")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
