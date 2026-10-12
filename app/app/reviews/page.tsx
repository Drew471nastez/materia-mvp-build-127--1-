import { redirect } from "next/navigation"
import { ReviewsClient } from "./reviews-client"
import { loadSellerReviews } from "./load-reviews"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Reviews"),
  }
}

export default async function ReviewsPage() {
  const load = await loadSellerReviews()
  /* No session yet: the app shell's gate draws its own frame over this while it restores the session. */
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") redirect("/sell")
  return <ReviewsClient initialReviews={load.reviews} products={load.products} ready={load.ready} app={load.app} />
}
