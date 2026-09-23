import { notFound, redirect } from "next/navigation"
import { isPlausibleToken } from "@/lib/receipts/rules"

export const dynamic = "force-dynamic"

/**
 * The address the in-page checkout used to finish on. There is one receipt
 * page now, /receipt/<token>, with the files, the totals and the email
 * controls; this forwards to it so nothing that still links here breaks.
 * Anything in the query besides the token (emailSent=1 and the like) is
 * dropped on purpose: the receipt reads email and payment state from the
 * order row, not from the URL.
 */
export default async function CheckoutReceiptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  if (!isPlausibleToken(token)) notFound()
  redirect(`/receipt/${token}`)
}
