/* The previews the fake server answers in scripts/check-customer-email-preview-time.mjs, drawn by the real templates in node: `npx tsx scripts/customer-email-preview-samples.ts > out.json`. */
import { CUSTOMER_EMAILS, previewCustomerEmail } from "@/lib/emails/customer-catalog"

export const SHOP = { name: "AndrewRullz", supportEmail: "hello@andrewrullz.test", storeUrl: "https://andrewrullz.storelib.com", logoUrl: null, phone: "+40 721 000 000", currency: "USD" }
const out: Record<string, { subject: string; html: string }> = {}
for (const e of CUSTOMER_EMAILS) {
  const channel = e.id.startsWith("membership_") ? "storelib" : "website"
  const mail = previewCustomerEmail(e.id, SHOP, undefined, { channel, language: { lang: "en", words: {}, own: true }, creator: { name: "Andrew", photoUrl: null, logoUrl: null } })
  if (mail) out[e.id] = { subject: mail.subject, html: mail.html }
}
process.stdout.write(JSON.stringify(out))
