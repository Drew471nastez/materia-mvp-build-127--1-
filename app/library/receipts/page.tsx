import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { getLibraryExtras } from "@/lib/library/library-extras"
import { receiptsOf } from "@/lib/library/library-view"
import { LibraryReceipts } from "@/components/library/library-receipts"

export const metadata: Metadata = { title: "Receipts | Library" }
export const dynamic = "force-dynamic"

export default async function LibraryReceiptsPage() {
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  /* Receipts are orders, so only the orders are read: every payment, courses and memberships included. */
  const receipts = receiptsOf(await getLibraryExtras(user.id))
  return <LibraryReceipts receipts={receipts} />
}
