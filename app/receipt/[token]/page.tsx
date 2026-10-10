import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { physicalOrderPageFor } from "@/lib/receipts/physical-order"
import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { loadReceiptByToken } from "@/lib/receipts/load"
import { isPlausibleToken } from "@/lib/receipts/rules"
import { withDiscount, withinTime } from "@/lib/receipts/discount"
import { invoiceForReceipt } from "@/lib/checkout/invoice"
import type { ReceiptViewer } from "@/lib/receipts/view"
import { getStoreUrl } from "@/lib/url-helpers"
import { ReceiptView } from "./receipt-view"
import { buyerCaseLink, casesReady, openCaseFor } from "@/lib/support/cases-server"
import { appUrl } from "@/lib/notify/urls"

export const dynamic = "force-dynamic"

/**
 * The receipt and the download page, one address: /receipt/<token>.
 * How a buyer gets here, and what happens when they press Download, is
 * written out at the top of lib/receipts/rules.ts.
 *
 * The token is the credential. It is looked up by the database, the page
 * is never indexed, and the Referer header is switched off so the address
 * does not travel to a thumbnail host or to the seller's store.
 */
export const metadata: Metadata = {
  title: "Your receipt",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/** The buyer's language, for dates and money before the browser takes over. */
function localeFrom(acceptLanguage: string | null): string {
  const first = (acceptLanguage ?? "").split(",")[0]?.split(";")[0]?.trim()
  if (!first) return "en-US"
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([first])[0] ?? "en-US"
  } catch {
    return "en-US"
  }
}

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isPlausibleToken(token)) notFound()

  const admin = createAdminClient()
  /* A thing that ships is followed on its order page (status, delivery, tracking, returns), never a download receipt (lib/receipts/physical-order.ts). */
  const orderPage = await physicalOrderPageFor(admin, token)
  if (orderPage) redirect(orderPage)
  const loaded = await loadReceiptByToken(admin, token)
  if (!loaded) notFound()

  let viewer: ReceiptViewer = { signedIn: false, isBuyer: false }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      viewer = { signedIn: true, isBuyer: loaded.buyerIds.includes(user.id) }
      if (viewer.isBuyer) viewer.email = user.email ?? null
      /* Their own name and photo, for the review card. Never anybody else's. */
      const { data: me } = await admin.from("profiles").select("display_name, username, avatar_url").eq("id", user.id).maybeSingle()
      viewer.name = (me?.display_name || me?.username || "").toString().trim() || null
      viewer.avatarUrl = me?.avatar_url || null
    }
  } catch {
    /* A guest, which is who most receipts are for. */
  }

  const locale = localeFrom((await headers()).get("accept-language"))

  /* A code's saving lives on the payment, not the order row: the invoice
     reads it from Stripe, and the receipt asks the invoice. Bounded, so a
     slow Stripe never holds the page; without it the receipt shows what
     was charged, as before. */
  let receipt = loaded.view
  if (receipt.invoice) {
    receipt = withDiscount(receipt, await withinTime(() => invoiceForReceipt(admin, token), 1500))
  }

  const storeHref = receipt.seller.username ? getStoreUrl(receipt.seller.username) : null
  /* Get help with this order: offered once the tables exist, with the open case when there is one. */
  const [ready, open] = await Promise.all([casesReady(admin), openCaseFor(admin, { orderId: receipt.primary.orderId })])
  const help = ready ? { openCase: open ? { link: buyerCaseLink(appUrl("/").replace(/\/$/, ""), open.id), status: open.status } : null } : null
  return <ReceiptView receipt={receipt} viewer={viewer} locale={locale} storeHref={storeHref} help={help} />
}
