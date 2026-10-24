/**
 * The order confirmation email in English and in Arabic, as the buyer gets
 * it (lib/physical/email-templates), for scripts/check-email-rtl.mjs.
 *
 *   npx tsx scripts/render-ad4-email.tsx
 */
import { inEmailLanguage } from "@/lib/emails/words"
import { orderConfirmationEmail, type OrderEmailModel } from "@/lib/physical/email-templates"

const model: OrderEmailModel = {
  shopName: "Bread Studio",
  orderNumber: "#1042",
  buyerFirstName: "Ana",
  lines: [{ title: "Mug", variantName: null, quantity: 2, cents: 4000, imageUrl: null }],
  totals: { subtotal: 4000, discount: 0, shipping: 500, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 4500, currency: "EUR" },
  address: { line1: "1 Rue de Rivoli", city: "Paris", postalCode: "75001", country: "FR" },
  deliveryName: "Standard",
  deliveryEstimate: null,
  statusUrl: "https://bread.studio/orders/x",
  hasDownloads: false,
}

const AR: Record<string, string> = { Subtotal: "المجموع الفرعي", Total: "الإجمالي" }
const en = inEmailLanguage("en", {}, () => orderConfirmationEmail(model)).html
const ar = inEmailLanguage("ar", AR, () => orderConfirmationEmail(model)).html
process.stdout.write(JSON.stringify({ en, ar }))
