import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { physicalOrderPageFor } from "@/lib/receipts/physical-order"
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
import { buyerPageLanguage } from "@/lib/markets/checkout-language"
import { buyerChannel } from "@/lib/emails/buyer-channel"
import { CheckoutWords } from "@/app/checkout/parts/words"
import { creatorTimeZone } from "@/lib/account/time-zone"

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

/** The receipt's language as a tag dates and money are written in: English is en-US, as the receipt always was. */
function formatLocale(lang: string): string {
  if (!lang || lang.toLowerCase() === "en") return "en-US"
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([lang])[0] ?? "en-US"
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
  /*
    THE ORDER'S LANGUAGE, AS ITS EMAILS (lib/markets/buyer-language.ts): the
    one an email link names, else the one the order was placed in, else the
    store's default; English for an order from storelib.com. Its dates and
    money are written in it too. They followed the browser's own language,
    so an English store's receipt read "28 octombrie 2026" in a Romanian
    browser, and a cookie from another visit could pick the words.
  */
  const channel = buyerChannel({ family: "digital", source: bought?.source, surface: bought?.surface, lang: bought?.lang })
  /* The order's date on the store's clock, as its PDF and its emails write it. */
  const [language, timeZone] = bought?.creatorId
    ? await Promise.all([buyerPageLanguage(bought.creatorId, { channel, named: lang, order: bought.lang }).catch(() => null), creatorTimeZone(admin, bought.creatorId).catch(() => null)])
    : [null, null]
  const view = <ReceiptView receipt={receipt} viewer={viewer} locale={formatLocale(language?.lang ?? "en")} storeHref={storeHref} help={help} account={account} timeZone={timeZone} />
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
async function boughtIn(admin: ReturnType<typeof createAdminClient>, orderId: string): Promise<{ creatorId: string | null; lang: string | null; source?: unknown; surface?: unknown } | null> {
  try {
    let res = await admin.from("orders").select("source, source_detail, products!inner(creator_id)").eq("id", orderId).maybeSingle()
    /* source_detail is optional (lib/orders/order-source.ts): before its SQL, the seller alone, and the website's own language. */
    if (res.error) res = (await admin.from("orders").select("products!inner(creator_id)").eq("id", orderId).maybeSingle()) as typeof res
    const row = res.data as { source?: unknown; source_detail?: { lang?: unknown; surface?: unknown } | null; products?: { creator_id?: string } | { creator_id?: string }[] | null } | null
    if (!row) return null
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    const lang = row.source_detail?.lang
    return { creatorId: product?.creator_id ?? null, lang: typeof lang === "string" ? lang : null, source: row.source ?? null, surface: row.source_detail?.surface ?? null }
  } catch {
    return null
  }
}
