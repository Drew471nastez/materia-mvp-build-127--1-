import { redirect } from "next/navigation"
import { readFilters } from "@/lib/reviews/dashboard"
import { ReviewsClient } from "../reviews-client"
import { loadSellerReviews } from "../load-reviews"

export const dynamic = "force-dynamic"
export const revalidate = 0

/** Reviews › Reviews: the first page as the address asks for it (app/app/reviews/reviews-client.tsx reads the rest). */
export default async function ReviewsListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const focus = typeof sp.review === "string" ? sp.review : null
  const load = await loadSellerReviews(readFilters(sp), focus)
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") redirect("/sell")
  return <ReviewsClient initialList={load.list} initialFilters={load.filters} products={load.products} app={load.app} focus={load.focus} />
}
