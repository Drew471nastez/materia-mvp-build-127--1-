import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { physicalOrderPageFor } from "@/lib/receipts/physical-order"
import { cookies, headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { loadReceiptByToken } from "@/lib/receipts/load"
import { isPlausibleToken } from "@/lib/receipts/rules"
import { withDiscount, withinTime } from "@/lib/receipts/discount"
import { invoiceForReceipt } from "@/lib/checkout/invoice"
import type { ReceiptViewer } from "@/lib/receipts/view"
import { getCanonicalSiteUrl, getStoreUrl } from "@/lib/url-helpers"
import { verifiedAccountForEmail } from "@/lib/orders/attach-guest-orders"
import { isPlatformDomain } from "@/lib/platform/header-props"
import { ReceiptView } from "./receipt-view"
import { buyerCaseLink, casesReady, openCaseFor } from "@/lib/support/cases-server"
import { appUrl } from "@/lib/notify/urls"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { checkoutLanguage } from "@/lib/markets/checkout-language"
import { CheckoutWords } from "@/app/checkout/parts/words"

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

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { token } = await params
  const { lang } = await searchParams
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
    } = await currentUserForRequest().then((c) => ({ data: { user: c.user } }))
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

  const requestHeaders = await headers()
  const locale = localeFrom(requestHeaders.get("accept-language"))
  const account = viewer.signedIn ? null : await accountDoor(admin, token, loaded.view.buyer.unclaimed)

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
  const [ready, open, bought] = await Promise.all([casesReady(admin), openCaseFor(admin, { orderId: receipt.primary.orderId }), boughtIn(admin, receipt.primary.orderId)])
  const help = ready ? { openCase: open ? { link: buyerCaseLink(appUrl("/").replace(/\/$/, ""), open.id), status: open.status } : null } : null
  /* In the language an email link names, or the one the buyer bought in on the store's website (kept with the order), or the one they chose there; English for an order from storelib.com, or when the website has none of them published. */
  const asked = lang ?? bought?.lang ?? (await cookies()).get("sl_lang")?.value ?? null
  const language = bought?.creatorId && asked ? await checkoutLanguage(bought.creatorId, null, asked).catch(() => null) : null
  const view = <ReceiptView receipt={receipt} viewer={viewer} locale={language && language.lang !== "en" ? language.lang : locale} storeHref={storeHref} help={help} account={account} />
  return language ? <CheckoutWords lang={language.lang} words={language.words}>{view}</CheckoutWords> : view
}

/**
 * The way into an account, for a signed out visitor (ReceiptView `account`).
 *
 *   base    "" on Storelib's own host. On a creator's website (the receipt is
 *           served there after the website's checkout) nobody can be signed
 *           in, because the session is storelib.com's alone, and /login on
 *           the website's host is the website's page or none: so the links
 *           go to Storelib, and come back to this receipt there.
 *   exists  the order's address has a CONFIRMED account, so the door is Sign
 *           in. Said only to whoever holds this receipt's token, about the
 *           address the order was paid with; a guest order of an address
 *           with an account joins it at the sign in (/auth/continue).
 */
async function accountDoor(admin: ReturnType<typeof createAdminClient>, token: string, unclaimed: boolean): Promise<{ base: string; exists: boolean }> {
  const base = (await isPlatformDomain()) ? "" : getCanonicalSiteUrl().replace(/[/]$/, "")
  if (!unclaimed) return { base, exists: true }
  try {
    const { data } = await admin.from("orders").select("buyer_email").eq("receipt_token", token).maybeSingle()
    return { base, exists: !!(await verifiedAccountForEmail(admin, data?.buyer_email)) }
  } catch {
    return { base, exists: false }
  }
}

/** The seller, and the language the order's checkout was drawn in (lib/orders/order-source.ts OrderOrigin.lang) when it was kept. */
async function boughtIn(admin: ReturnType<typeof createAdminClient>, orderId: string): Promise<{ creatorId: string | null; lang: string | null } | null> {
  try {
    let res = await admin.from("orders").select("source_detail, products!inner(creator_id)").eq("id", orderId).maybeSingle()
    /* source_detail is optional (lib/orders/order-source.ts): before its SQL, the seller alone, and the website's own language. */
    if (res.error) res = (await admin.from("orders").select("products!inner(creator_id)").eq("id", orderId).maybeSingle()) as typeof res
    const row = res.data as { source_detail?: { lang?: unknown } | null; products?: { creator_id?: string } | { creator_id?: string }[] | null } | null
    if (!row) return null
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    const lang = row.source_detail?.lang
    return { creatorId: product?.creator_id ?? null, lang: typeof lang === "string" ? lang : null }
  } catch {
    return null
  }
}
