import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { loadLibrary } from "@/lib/library/load-library"
import { LibraryReviews } from "@/components/library/library-reviews"

export const metadata: Metadata = { title: "Reviews | Library" }
export const dynamic = "force-dynamic"

export default async function LibraryReviewsPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const [{ product }, user] = await Promise.all([searchParams, pageUser()])
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  const { items } = await loadLibrary(user.id)
  /* ?product=<id>, from a product's More menu: that purchase opens with its composer (components/library/library-reviews.tsx). */
  return <LibraryReviews items={items} focus={typeof product === "string" && product ? product : null} />
}
