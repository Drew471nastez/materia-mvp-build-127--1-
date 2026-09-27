/**
 * The buyer's receipt email and the report's automated email, written to
 * files for scripts/check-receipt-email.mjs to open in Chromium, drawn by the
 * same functions the send uses (lib/receipts/email.ts, lib/email-automation).
 *
 *   receipt-one      one paid product with a thumbnail, the creator's photo
 *   receipt-basket   three lines: a wide cover, no thumbnail, a long name
 *                    with a variant; a tip and the attached PDF
 *   receipt-bare     a free download from a creator with no picture at all
 *   automation-luca  the report: a creator with a website logo AND a photo,
 *                    who used to get both, one on top and one underneath
 *
 *   OUT_DIR=<dir> node <bundle of this file>
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { buyerReceiptEmailHtml, buyerReceiptEmailText, type ReceiptEmailModel } from "@/lib/receipts/email"
import { senderPicture } from "@/lib/email-campaigns/sender"
import { automationEmail, brandOfIdentity } from "@/lib/email-automation"

const out = process.env.OUT_DIR || join(process.cwd(), ".receipt-email-probe")
mkdirSync(out, { recursive: true })

/* Stored the way uploads are: public objects in Supabase storage, which the email asks the site's resizer for. */
const STORE = "https://abc.supabase.co/storage/v1/object/public"
const PHOTO = `${STORE}/avatars/u1/luca-photo.png`
const LOGO = "https://cdn.example.com/ld-logo.png"

const base: ReceiptEmailModel = {
  firstName: "Alex",
  sellerName: "Luca Dragoste",
  sellerPicture: senderPicture({ photoUrl: PHOTO, logoUrl: LOGO }),
  orderNumber: "1042",
  dateText: "September 27, 2026",
  items: [{ title: "Autumn preset pack", variantName: null, amountText: "$29.00", note: null, thumbnailUrl: `${STORE}/products/p1/square.png` }],
  subtotalText: null,
  tipText: null,
  totalText: "$29.00",
  refundedText: null,
  link: "https://storelib.com/receipt/0f3c9a7e2b1d4c8a9e6f",
  buttonLabel: "Download your files",
  supportEmail: "hello@lucadragoste.com",
}

const samples: Record<string, ReceiptEmailModel> = {
  "receipt-one": base,
  "receipt-basket": {
    ...base,
    items: [
      { title: "Night sky photo guide", variantName: null, amountText: "$19.00", note: null, thumbnailUrl: `${STORE}/products/p2/wide.png` },
      { title: "Studio notes", variantName: null, amountText: "Free", note: null, thumbnailUrl: null },
      { title: "The complete coastal Lightroom collection with every preset from 2024 and 2025", variantName: "Mobile and desktop", amountText: "$48.00", note: null, thumbnailUrl: `${STORE}/products/p3/square.png` },
    ],
    subtotalText: "$67.00",
    tipText: "$5.00",
    totalText: "$72.00",
    document: { kind: "receipt", link: "https://storelib.com/api/checkout/invoice?token=0f3c9a7e2b1d4c8a9e6f" },
  },
  "receipt-bare": {
    ...base,
    sellerName: "Mira Okafor",
    sellerPicture: senderPicture({}),
    items: [{ title: "Free wallpaper set", variantName: null, amountText: "Free", note: null, thumbnailUrl: null }],
    totalText: "Free",
    buttonLabel: "View your receipt",
  },
}

for (const [name, model] of Object.entries(samples)) {
  writeFileSync(join(out, `${name}.html`), buyerReceiptEmailHtml(model))
  writeFileSync(join(out, `${name}.txt`), buyerReceiptEmailText(model))
}

/* The report's email, as the engine draws it: the website's logo AND the profile photo are both known. */
const identity = {
  fromName: "Luca Dragoste",
  storeUrl: "https://storelib.com/luca",
  brand: { name: "Luca Dragoste", logoUrl: LOGO, accentColor: "#1a1a2e" },
  avatarUrl: PHOTO,
}
const welcome = automationEmail({
  subject: "Thanks for joining",
  body: "<p>Hi Alex,</p><p>Thanks for joining. I will send you new work, updates and the occasional offer.</p><p>Luca</p>",
  fromName: identity.fromName,
  brand: brandOfIdentity(identity),
  avatarUrl: identity.avatarUrl,
  unsubscribeToken: "sample",
  because: "subscribed",
})
writeFileSync(join(out, "automation-luca.html"), welcome.html)
writeFileSync(join(out, "automation-luca.txt"), welcome.text)
