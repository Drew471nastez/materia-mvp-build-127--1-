import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { receiptTokenForLegacyLink } from "@/lib/receipts/legacy-link"
import { LinkNotValid } from "@/components/receipt/link-not-valid"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Your downloads",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * An older download link, /downloads?orderId=...&token=... Checked on the
 * server and forwarded to the receipt, the one page with a buyer's files.
 * With no order named it is the library's job.
 */
export default async function DownloadsPage({ searchParams }: { searchParams: Promise<{ orderId?: string; token?: string }> }) {
  const { orderId, token } = await searchParams
  if (!orderId) redirect("/account/library")

  let userId: string | null = null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch {
    /* A guest following an email link. */
  }

  const receiptToken = await receiptTokenForLegacyLink(createAdminClient(), { orderId, accessToken: token, userId })
  if (receiptToken) redirect(`/receipt/${receiptToken}`)
  return <LinkNotValid />
}
