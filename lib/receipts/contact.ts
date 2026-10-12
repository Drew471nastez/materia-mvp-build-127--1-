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
import { emailButton } from "@/lib/mail-document"

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
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escape(subject)}</title></head><body style="margin:0;background:#f5f6f8;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
<div style="display:none;font-size:1px;color:#f5f6f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(preview)}${"&#8199;&#65279;&#847; ".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e7ec;border-radius:16px;">
<tr><td style="padding:28px 28px 8px;">
<p style="margin:0;font-size:13px;color:#6b7280;">Order ${escape(m.orderNumber)}${m.buyerReference ? ` (buyer's reference ${escape(m.buyerReference)})` : ""} · ${escape(what)}</p>
<h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;font-weight:700;color:#1a1a2e;">${escape(who)} wrote to you</h1>
</td></tr>
<tr><td style="padding:16px 28px 0;">
<div style="border-left:3px solid #d5d9e0;padding:4px 0 4px 14px;font-size:15px;line-height:1.6;color:#1a1a2e;white-space:pre-wrap;word-break:break-word;">${escape(m.message)}</div>
</td></tr>
<tr><td style="padding:20px 28px 0;font-size:14px;line-height:1.55;color:#4b5563;">
Reply to this email and it goes to ${escape(m.buyerEmail)}.
</td></tr>
<tr><td style="padding:20px 28px 28px;">
${emailButton({ href: escape(m.orderLink), label: "Open the order", fill: "#1a1a2e", padding: "10px 16px", radius: 10, text: "font-size:14px;font-weight:600;" })}
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">Sent from the receipt page on Storelib.</p>
</td></tr></table></body></html>`

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
