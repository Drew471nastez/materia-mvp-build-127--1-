import { redirect } from "next/navigation"
import { ReviewsClient } from "./reviews-client"
import { loadSellerReviews } from "./load-reviews"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Reviews",
}

export default async function ReviewsPage() {
  const load = await loadSellerReviews()
  /* No session yet: the app shell's gate draws its own frame over this while it restores the session. */
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") redirect("/signup/success")
  return <ReviewsClient initialReviews={load.reviews} products={load.products} ready={load.ready} />
}
