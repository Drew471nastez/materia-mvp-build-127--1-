/**
 * ===========================================================================
 *  EVERY EMAIL A BUYER OR A MEMBER GETS, IN THREE FAMILIES THAT NEVER MIX
 * ===========================================================================
 * Emails › Customer emails (and Settings › Customer emails, the same panel)
 * lists them, the way Shopify's Customer notifications does: what each is
 * for, when it goes, what it has sent, and a preview drawn by the very
 * template that sends it. Nothing here sends anything.
 *
 *   Digital products    a download's, course's or membership's receipt, its
 *                       refund, the seven emails of a membership sold on its
 *                       own (drawn by lib/notify/templates, sent by
 *                       lib/memberships/sync.ts), and the checkout reminder
 *                       (lib/receipts/receipt-mail.ts, lib/emails/notices.ts)
 *   Physical products   everything about an order that ships or is picked
 *                       up, in Shopify's groups (lib/physical/email-templates.ts),
 *                       listed while physical commerce is on
 *   Communities         what a community sends its members: the welcome, an
 *                       approved request, an invite, the owner's own email
 *                       (Email your members), the four ticket emails and the
 *                       seven of its paid plan (lib/notify/templates, drawn
 *                       on the server in the community's own name and picture:
 *                       /api/app/community/<id>/emails/preview)
 *
 *   group       the heading a row sits under inside its family (GROUP_ORDER)
 *   editable    its subject, heading, opening and button can be the store's
 *               own words (lib/emails/customer-custom.ts DEFAULT_COPY), or
 *               for a community email the community's
 *               (lib/emails/community-words.ts). Every email is, but Email
 *               your members, which is written each time.
 *   sentWhen    the moment it goes, in the store's words
 *
 * LEFT OUT, ON PURPOSE (LEFT_OUT below, each with why): emails that are
 * never sent as an email, or are another name for one listed here. Leaving
 * them out of the list changes nothing that is sent (tests/emails-
 * families.test.ts holds both halves of that).
 */
import type { ReceiptEmailModel } from "@/lib/receipts/email"
import { buildReceiptEmail, type ReceiptLanguage } from "@/lib/receipts/receipt-mail"
import { formatMoney } from "@/lib/receipts/rules"
import { buyerRefundMail } from "@/lib/emails/notices"
import { emailImageSrc, senderPicture } from "@/lib/email-campaigns/sender"
import { checkoutReminderEmail, orderCancelledEmail, orderConfirmationEmail, orderDateText, orderUpdatedEmail, paymentFailedEmail, pickupEmail, refundEmail, returnEmail, shipmentEmail, type EmailBrand, type EmailLine } from "@/lib/physical/email-templates"
import { et, inEmailLanguage } from "./words"
import { itemsText, pickCopy, resolveCopy, type EmailCopy, type EmailWords } from "./customer-custom"
import { withOwnFrame } from "./layout"
import { signedBy, type BuyerChannel } from "./buyer-channel"
import { tt } from "@/lib/i18n/text"
import { renderEmail } from "@/lib/notify/templates"
import type { NotificationType } from "@/lib/notify/types"

export * from "./customer-list"

const SAMPLE_LINES: EmailLine[] = [
  { get title() { return tt("Wildflower honey") }, variantName: "500 g", quantity: 2, cents: 3200, imageUrl: null },
  { get title() { return tt("Linen apron") }, get variantName() { return tt("Sage") }, quantity: 1, cents: 6400, imageUrl: null },
]
const SAMPLE_ADDRESS = { name: "Maria Popescu", get line1() { return tt("Strada Lipscani 12") }, get line2() { return tt("Ap. 4") }, get city() { return tt("Bucharest") }, postalCode: "030031", country: "RO" }
const STATUS = "https://storelib.com/checkout/physical/order/preview"
/* Inside the customer email, which writes in the store's language, not the dashboard's. i18n-ignore-next-line */
export const SAMPLE_DATE = "10 October 2026"

/** When the sample order was placed and refunded. */
const SAMPLE_AT = "2026-10-10T12:00:00Z"
const SAMPLE_REFUND_AT = "2026-10-12T12:00:00Z"
const SAMPLE_ORDER_ID = "1a2b3c4d-0000-4000-8000-000000000000"

/** The store as Settings › Customer emails reads it: what every email signs with. */
export interface PreviewShop {
  name: string
  supportEmail?: string | null
  storeUrl?: string | null
  currency?: string
  logoUrl?: string | null
  /** Where the logo came from (lib/store/identity-server.ts): a profile photo is drawn round, as the receipt draws it. */
  logoFrom?: "store" | "website" | "profile" | null
  phone?: string | null
  accent?: string | null
}

/**
 * HOW THE SAMPLE WAS BOUGHT, so the preview is the email that place sends
 * (lib/emails/buyer-channel.ts): on the website, signed by the shop, in the
 * language chosen; on Storelib, signed by the creator, in English.
 */
export interface PreviewContext {
  channel?: BuyerChannel
  /** The email's language and its words (Translate › Order emails); English as written without one. */
  language?: ReceiptLanguage | null
  /** The creator, who signs a digital email bought on Storelib: their name and photo. */
  creator?: { name: string; photoUrl?: string | null; logoUrl?: string | null } | null
}

/** The shop's one picture, as the receipt reads it: its logo, or its owner's photo drawn round. */
function shopPicture(shop: PreviewShop) {
  if (!shop.logoUrl) return null
  return shop.logoFrom === "profile" ? senderPicture({ photoUrl: shop.logoUrl }) : senderPicture({ logoUrl: shop.logoUrl })
}

/**
 * One email as its template draws it, with the store's name and logo,
 * sample items and buyer, in the language and under the name the place it
 * was bought decides. The same builders the senders call, so the preview is
 * what goes out. Null for an id that isn't one of the store's.
 */
export function previewCustomerEmail(
  id: string,
  shop: PreviewShop,
  /** The store's own words (saved, or still being typed in the editor): drawn exactly as the sender draws them. */
  words?: EmailCopy | null,
  ctx: PreviewContext = {},
): { subject: string; html: string; text: string } | null {
  const shopName = shop.name || tt("Your store")
  const currency = (shop.currency || "USD").toUpperCase()
  const language = ctx.language ?? null
  const signer = signedBy(ctx.channel ?? "website")
  const signerName = signer === "creator" ? ctx.creator?.name || shopName : shopName
  /* The store's own words in the email's language (pickCopy): the main ones in the website's, a language's own where written, else the standard words in that one. */
  if (id === "receipt") {
    const model: ReceiptEmailModel = {
      firstName: tt("Maria"),
      sellerName: signerName,
      sellerPicture: signer === "creator" ? senderPicture({ photoUrl: ctx.creator?.photoUrl, logoUrl: ctx.creator?.logoUrl }) : shopPicture(shop),
      orderNumber: "#1042",
      dateText: SAMPLE_DATE,
      dateIso: SAMPLE_AT,
      items: [{ title: tt("The bread baking course"), variantName: null, amountText: formatMoney(4900, currency, "en-US"), note: null, thumbnailUrl: null }],
      subtotalText: null,
      tipText: null,
      totalText: formatMoney(4900, currency, "en-US"),
      refundedText: null,
      link: `${ctx.channel === "storelib" || !shop.storeUrl ? "https://storelib.com" : shop.storeUrl.replace(/\/+$/, "")}/receipt/preview`,
      /* In the email's language, as the sender writes it (lib/receipts/receipt-mail.ts). */
      buttonLabel: "View your receipt", // i18n-ignore
      supportEmail: shop.supportEmail || "hello@example.com",
      accent: shop.accent ?? null,
    }
    const m = buildReceiptEmail(model, language, words)
    return { subject: m.subject, html: m.html, text: m.text }
  }
  if (id === "digital_refund") {
    const picture = signer === "creator" ? senderPicture({ photoUrl: ctx.creator?.photoUrl, logoUrl: ctx.creator?.logoUrl })?.url : shop.logoUrl
    return buyerRefundMail(
      { storeName: signerName, productTitle: tt("The bread baking course"), amountCents: 4900, currency, orderId: SAMPLE_ORDER_ID, reason: "requested_by_customer", orderDate: SAMPLE_AT, refundDate: SAMPLE_REFUND_AT, contactEmail: shop.supportEmail || "hello@example.com", sellerPictureUrl: emailImageSrc(picture, 36) },
      language,
      words,
    )
  }
  if (id.startsWith("membership_")) return membershipPreview(id, shop, ctx, pickCopy(words, language))
  return inEmailLanguage(language?.lang, language?.words, () => physicalPreview(id, shop, shopName, currency, pickCopy(words, language)))
}

const MEMBERSHIP_TYPES: Record<string, NotificationType> = {
  membership_started: "MEMBERSHIP_STARTED",
  membership_renewed: "MEMBERSHIP_RENEWED",
  membership_renewal_reminder: "MEMBERSHIP_RENEWAL_REMINDER",
  membership_payment_failed: "MEMBERSHIP_PAYMENT_FAILED",
  membership_canceled: "MEMBERSHIP_CANCELED",
  membership_plan_changed: "MEMBERSHIP_PLAN_CHANGED",
  membership_ended: "MEMBERSHIP_ENDED",
}

/**
 * A membership sold on its own, as lib/memberships/sync.ts sends it through
 * the notification engine: from the creator by the store's name and the
 * creator's one picture, in the store's words when it wrote any (tplMode
 * "body"), with a sample plan's price and dates in the store's currency.
 */
function membershipPreview(id: string, shop: PreviewShop, ctx: PreviewContext, words: EmailWords | null | undefined): { subject: string; html: string; text: string } | null {
  const type = MEMBERSHIP_TYPES[id]
  if (!type) return null
  const currency = (shop.currency || "USD").toUpperCase()
  const name = ctx.creator?.name || shop.name || tt("Your store")
  const picture = senderPicture({ photoUrl: ctx.creator?.photoUrl, logoUrl: ctx.creator?.logoUrl ?? shop.logoUrl })
  const month = "2026-11-10T12:00:00Z"
  const data: Record<string, unknown> = {
    membershipId: "00000000-0000-4000-8000-000000000001",
    membershipTitle: tt("Bread club"),
    creatorName: name,
    storeName: name,
    buyerName: tt("Maria"),
    amountCents: 1500,
    currency,
    interval: "month",
    periodEnd: month,
    endsAt: month,
    cardLast4: "4242",
    graceEndsAt: "2026-10-17T12:00:00Z",
    fromTitle: tt("Bread club lite"),
    changeKind: "tier",
    brandName: name,
    brandKind: "creator",
    brandPicture: picture?.kind === "photo" ? "avatar" : "mark",
    ...(picture?.url ? { brandLogoUrl: picture.url } : {}),
    ...(shop.supportEmail ? { brandReplyTo: shop.supportEmail } : {}),
    ...(words ? { tplMode: "body", ...(words.subject ? { tplSubject: words.subject } : {}), ...(words.heading ? { tplHeading: words.heading } : {}), ...(typeof words.body === "string" ? (words.body.trim() ? { tplIntro: words.body } : { tplDropIntro: true }) : {}), ...(words.button ? { tplButton: words.button } : {}), ...(words.preheader ? { tplPreheader: words.preheader } : {}), ...(words.footer ? { tplFooter: words.footer } : {}) } : {}),
  }
  const m = renderEmail(type, data, { baseUrl: "https://storelib.com", recipientName: null, unsubscribeUrl: null, preferencesUrl: null, when: null })
  return { subject: m.subject, html: m.html, text: m.text }
}

/** An order that ships, or the checkout reminder, as lib/physical/jobs-server.ts and lib/automations/abandoned-reminder.ts draw it. */
function physicalPreview(id: string, shop: PreviewShop, shopName: string, currency: string, words: EmailWords | null | undefined): { subject: string; html: string; text: string } | null {
  const m = physicalDraw(id, shop, shopName, currency, words)
  if (!m) return null
  const sampleLines = id.startsWith("return_") ? [SAMPLE_LINES[0]] : SAMPLE_LINES
  /* The store's own preheader and footer line, as the sender puts them on (lib/physical/jobs-server.ts withOwnFrame). */
  return withOwnFrame(m, resolveCopy(words, { customer_name: tt("Maria"), order_number: "#1042", shop_name: shopName, items: itemsText(sampleLines.map((l) => l.title)) }))
}

function physicalDraw(id: string, shop: PreviewShop, shopName: string, currency: string, words: EmailWords | null | undefined): { subject: string; html: string; text: string } | null {
  const brand: EmailBrand = { logoUrl: shop.logoUrl ?? null, email: shop.supportEmail ?? null, phone: shop.phone ?? null, websiteUrl: shop.storeUrl ?? null, helpUrl: `${STATUS}#get-help`, accent: shop.accent ?? null }
  const pickup = { name: "Studio", address: [tt("Strada Lipscani 12"), tt("Bucharest")], ready: tt("Usually ready in 24 hours"), instructions: tt("Ring the bell at the side door."), hours: tt("Mon to Fri, 10:00 to 18:00") }
  /* The day as the sender writes it, in the email's language (orderDateText). */
  const orderDate = orderDateText(SAMPLE_AT, "UTC") || SAMPLE_DATE
  const sampleLines = id.startsWith("return_") ? [SAMPLE_LINES[0]] : SAMPLE_LINES
  const copy = resolveCopy(words, { customer_name: tt("Maria"), order_number: "#1042", shop_name: shopName, items: itemsText(sampleLines.map((l) => l.title)) })
  switch (id) {
    case "checkout_reminder": {
      const m = checkoutReminderEmail({ shopName, buyerFirstName: tt("Maria"), lines: SAMPLE_LINES, checkoutUrl: STATUS, unsubscribeUrl: "https://storelib.com/unsubscribe/preview", brand, copy })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "order_confirmation": {
      const m = orderConfirmationEmail({
        shopName,
        orderNumber: "#1042",
        buyerFirstName: tt("Maria"),
        lines: SAMPLE_LINES,
        totals: { subtotal: 9600, discount: 1000, shipping: 700, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 9300, currency },
        address: SAMPLE_ADDRESS,
        deliveryName: tt("Standard"),
        deliveryEstimate: tt("3 to 5 business days"),
        statusUrl: STATUS,
        hasDownloads: false,
        storeUrl: shop.storeUrl ?? null,
        paymentLabel: et("{brand} ending {last4}", { brand: "Visa", last4: "4242" }) /* i18n-ignore */,
        supportEmail: shop.supportEmail ?? null,
        brand: { ...brand, websiteUrl: null },
        copy,
        orderDate,
      })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "order_updated": {
      const m = orderUpdatedEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), change: "address", address: SAMPLE_ADDRESS, lines: SAMPLE_LINES, statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "payment_failed": {
      const m = paymentFailedEmail({ shopName, buyerFirstName: tt("Maria"), lines: SAMPLE_LINES, checkoutUrl: STATUS, brand, copy })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "shipping_confirmation":
    case "tracking_changed":
    case "out_for_delivery":
    case "delivered":
    case "delivery_issue": {
      const kind = id === "shipping_confirmation" ? "shipped" : id === "tracking_changed" ? "tracking" : id === "delivery_issue" ? "issue" : id
      const m = shipmentEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), lines: SAMPLE_LINES, carrier: "DHL", trackingNumber: "JD014600006281234567", trackingUrl: "https://www.dhl.com/track?id=JD014600006281234567", address: SAMPLE_ADDRESS, deliveryName: tt("Standard, 3 to 5 business days"), statusUrl: STATUS, kind, brand, copy, orderDate, problem: kind === "issue" ? tt("Address not found") : null })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "ready_for_pickup":
    case "picked_up": {
      const m = pickupEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), lines: SAMPLE_LINES, kind: id === "ready_for_pickup" ? "ready" : "picked_up", pickup, statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "return_requested":
    case "return_approved":
    case "return_declined":
    case "return_received":
    case "return_completed": {
      const status = id === "return_requested" ? "requested" : id === "return_approved" ? "approved" : id === "return_declined" ? "rejected" : id === "return_received" ? "received" : "completed"
      const m = returnEmail({
        shopName,
        orderNumber: "#1042",
        status,
        note: status === "approved" ? tt("Put a note with your order number in the box.") : status === "rejected" ? tt("The apron was worn, so we can't take it back.") : null,
        refundedCents: status === "completed" ? 3200 : 0,
        currency,
        statusUrl: STATUS,
        lines: [{ ...SAMPLE_LINES[0], quantity: 1 }],
        returnAddress: status === "approved" ? [shopName, tt("Strada Lipscani 12"), tt("030031 Bucharest"), "RO"] : null,
        brand,
        copy,
        orderDate,
      })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "order_cancelled": {
      const m = orderCancelledEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), reason: tt("The apron in Sage sold out."), refundedCents: 9300, totalCents: 9300, currency, lines: SAMPLE_LINES, statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "refund": {
      const m = refundEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), amountCents: 3200, refundedCents: 3200, totalCents: 9300, currency, paymentLabel: et("{brand} ending {last4}", { brand: "Visa", last4: "4242" }) /* i18n-ignore */, statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    default:
      return null
  }
}
