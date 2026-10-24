import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { SITE_RECEIPTS, siteCustomer } from "@/lib/site-accounts/account-data"
import { siteVisitor } from "../../../visitor"

/**
 * /account/orders/<id> ON A WEBSITE OF STORELIB'S OWN: one of the signed-in
 * customer's orders, opened where it is followed. Something that ships goes
 * to its order page on this same host (status, carrier and tracking:
 * app/checkout/physical/order); anything else to its receipt, which is also
 * where its files are. An order that is not this customer's, or not this
 * website's, is the account page, never a word about it.
 */
export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } }

export default async function SiteAccountOrderPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params
  const { visitor, customer, creatorId } = await siteVisitor(username)
  if (!creatorId) notFound()
  if (!visitor || !customer) redirect(`/account/login?return=${encodeURIComponent(`/account/orders/${id}`)}`)
  const account = await siteCustomer(createAdminClient(), customer, SITE_RECEIPTS)
  const order = account.orders.find((o) => o.id === id)
  redirect(order?.order_url || order?.action_url || "/account")
}
