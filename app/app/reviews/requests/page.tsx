import { redirect } from "next/navigation"
import { RequestsPanel } from "@/components/app/reviews/requests-panel"
import { listRequests, storeProducts } from "@/lib/reviews/dashboard-server"
import { reviewsAppFor, reviewsCaller } from "../load-reviews"

export const dynamic = "force-dynamic"
export const revalidate = 0

/** Reviews › Requests (components/app/reviews/requests-panel.tsx): the request emails, and how they go. */
export default async function ReviewsRequestsPage() {
  const c = await reviewsCaller()
  if (c.state === "signed-out") return null
  if (c.state === "no-creator") redirect("/sell")
  const [list, products, app] = await Promise.all([listRequests(c.db, c.creatorId), storeProducts(c.db, c.creatorId), reviewsAppFor(c.creatorId)])
  return <RequestsPanel initial={list} products={products} settings={app.settings} ready={app.ready && list.ready} />
}
