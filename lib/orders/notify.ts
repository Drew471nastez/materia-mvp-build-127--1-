import "server-only"

import { resolveSellerEmail, sendBuyerDownloadEmail } from "@/lib/email"
import { canEmailAccess, type OwnedLine } from "./owned"

/**
 * THE BUYER'S ACCESS EMAIL, SENT AGAIN FROM THE ORDER'S PAGE
 *
 * The same email checkout sends (lib/email.tsx, sendBuyerDownloadEmail): the
 * product, and the link to the receipt page where the download is. One per
 * product, as checkout sends it, because each carries its own product's link.
 *
 * sendBuyerDownloadEmail sends nothing for an order whose email log already
 * says "sent", which is what keeps a retried webhook from mailing twice. A
 * resend is a deliberate second send, so that log is cleared first, and the
 * order's own record (buyer_notified_at, buyer_email_last_error) is cleared
 * with it and then written by the send: the time it arrived, or why not.
 *
 * Nothing here logs an address.
 */

export interface LineDelivery {
  id: string
  buyer_email: string | null
  buyer_notified_at: string | null
  buyer_email_last_error: string | null
}

export interface DeliveryReport {
  sent: number
  failed: number
  /** The first failure's reason, as the email provider gave it. */
  error: string | null
  lines: LineDelivery[]
}

function siteUrl(): string {
  return process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://storelib.com"
}

export async function sendAccessEmails(admin: any, creatorId: string, lines: OwnedLine[], to: string): Promise<DeliveryReport> {
  const eligible = lines.filter(canEmailAccess)
  const report: DeliveryReport = { sent: 0, failed: 0, error: null, lines: [] }
  if (eligible.length === 0) return report

  const sellerReplyTo = await resolveSellerEmail(admin, creatorId)
  const ids = eligible.map((l) => l.id)

  await admin.from("orders").update({ buyer_notified_at: null, buyer_email_last_error: null }).in("id", ids)
  await admin.from("email_logs").delete().in("order_id", ids).eq("email_type", "buyer_download")

  for (const line of eligible) {
    const result = await sendBuyerDownloadEmail(admin, {
      orderId: line.id,
      creatorId,
      buyerEmail: to,
      buyerFirstName: line.buyer_first_name || "",
      productTitle: line.product?.title || "Your purchase",
      receiptToken: line.receipt_token!,
      sellerReplyTo,
      baseUrl: siteUrl(),
      variantName: line.variant_name ?? null,
    })
    if (result.success) report.sent++
    else {
      report.failed++
      report.error ??= result.error || "The email provider did not accept it"
    }
  }

  /* What the send wrote, read back rather than assumed. */
  const { data } = await admin.from("orders").select("id, buyer_email, buyer_notified_at, buyer_email_last_error").in("id", ids)
  report.lines = (data ?? []).map((r: any) => ({
    id: r.id,
    buyer_email: r.buyer_email ?? null,
    buyer_notified_at: r.buyer_notified_at ?? null,
    buyer_email_last_error: r.buyer_email_last_error ?? null,
  }))
  return report
}

/**
 * A line in the order's history. The address is never written here: the
 * order row holds it, and a log of changes does not need a second copy.
 */
export async function recordOrderEvent(
  admin: any,
  orderId: string,
  type: "receipt_resent" | "email_changed_by_creator",
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("security_events").insert({ order_id: orderId, event_type: type, metadata: { by: "creator", ...metadata } })
  } catch {
    /* The history is a record, not a gate. */
  }
}
