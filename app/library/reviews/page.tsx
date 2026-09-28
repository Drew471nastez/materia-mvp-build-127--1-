import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { loadLibrary } from "@/lib/library/load-library"
import { LibraryReviews } from "@/components/library/library-reviews"

export const metadata: Metadata = { title: "Reviews | Library" }
export const dynamic = "force-dynamic"

export default async function LibraryReviewsPage() {
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  const { items } = await loadLibrary(user.id)
  return <LibraryReviews items={items} />
}
