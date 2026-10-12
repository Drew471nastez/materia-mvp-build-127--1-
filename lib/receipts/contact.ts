/**
 * ===========================================================================
 *  A BUYER WRITING TO THE SELLER FROM THE RECEIPT
 * ===========================================================================
 * The receipt's Contact seller. When the seller set a support address the
 * page shows it (a mailto link and a Copy button, because a mailto link with
 * no mail app does nothing and says nothing). When they did not, the page
 * has a small form, and app/api/receipt/contact sends what the buyer wrote
 * to the seller's own inbox with the buyer's address as Reply-To. The
 * seller's address never reaches the page; the buyer's is on the order.
 *
 * Why not the conversations table (supabase/migrations/20260802_messages_offers.sql):
 * nothing in the app reads it. There is no inbox for a seller to open, so a
 * message written there would never be seen. Email is where the seller
 * already gets every sale.
 *
 * This file is only the words and the markup (and the shared button, a pure
 * helper), so the test suite can check it as it is.
 */
import { identity, platformEmail } from "@/lib/emails/layout"

/** How long a message may be. A question, not a document. */
export const CONTACT_MAX_CHARS = 2000

export interface SellerMessage {
  /** The buyer's first name, or null when the order has none. */
  buyerName: string | null
  /** Where the seller's reply goes. Shown to the seller, never to anyone else. */
  buyerEmail: string
  orderNumber: string
  /** The buyer's reference for the same order, when `orderNumber` is the Orders page's (lib/orders/order-number-server.ts). */
  buyerReference?: string | null
  /** What was bought, one title per line of the order. */
  items: string[]
  message: string
  /** The seller's page for this order. */
  orderLink: string
}

function escape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** One line, no control characters: it goes into a header. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n\t\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()
}

/** The message as the buyer typed it, tidied: no control characters, at most two blank lines in a row. */
export function cleanMessage(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function sellerMessageEmail(m: SellerMessage): { subject: string; fromName: string; html: string; text: string } {
  const who = headerSafe(m.buyerName || "") || "A buyer"
  const what = m.items.length === 1 ? m.items[0] : `${m.items.length} items`
  const subject = headerSafe(`Order ${m.orderNumber}: a message from ${who}`)
  const fromName = headerSafe(`${who} via Storelib`).replace(/[<>"]/g, "")

  /* The line an inbox shows after the subject: the first words of the message, not "Order 1042 ·". */
  const preview = headerSafe(m.message).slice(0, 110)
  const mail = platformEmail({
    subject,
    preview,
    label: `Order ${m.orderNumber}${m.buyerReference ? ` (buyer's reference ${m.buyerReference})` : ""} · ${what}`,
    heading: `${who} wrote to you`,
    paragraphs: [],
    quote: { text: m.message },
    /* Who a reply reaches, as text: the address stays plain, never a blue link. */
    closing: [{ html: `Reply to this email and it goes to ${identity(m.buyerEmail)}.`, text: `Reply to this email and it goes to ${m.buyerEmail}.` }],
    action: { label: "Open the order", url: m.orderLink },
    fallback: false,
    note: null,
    reason: "Sent from the receipt page on Storelib.",
  })
  const html = mail.html

  const text = [
    `${who} wrote to you about order ${m.orderNumber} (${what}):`,
    "",
    m.message,
    "",
    `Reply to this email and it goes to ${m.buyerEmail}.`,
    `Open the order: ${m.orderLink}`,
  ].join("\n")

  return { subject, fromName, html, text }
}
