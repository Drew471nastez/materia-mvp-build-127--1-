import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { receiptTokenForLegacyLink } from "@/lib/receipts/legacy-link"
import { LinkNotValid } from "@/components/receipt/link-not-valid"
import { currentUserForRequest } from "@/lib/auth/request-scope"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Your purchase",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * An older access link, /access/<orderId>?token=... It is checked on the
 * server (lib/receipts/legacy-link.ts) and forwarded to the receipt, which is
 * where the files are. It never shows an order by its id alone.
 */
export default async function GuestAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { orderId } = await params
  const { token } = await searchParams

  let userId: string | null = null
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await currentUserForRequest().then((c) => ({ data: { user: c.user } }))
    userId = user?.id ?? null
  } catch {
    /* A guest following an email link. */
  }

  const receiptToken = await receiptTokenForLegacyLink(createAdminClient(), { orderId, accessToken: token, userId })
  if (receiptToken) redirect(`/receipt/${receiptToken}`)
  return <LinkNotValid />
}
