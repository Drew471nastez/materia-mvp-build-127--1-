import { redirect } from "next/navigation"
import { ReviewsAnalytics } from "@/components/app/reviews/analytics-view"
import { periodFor, previousPeriod } from "@/lib/reviews/analytics"
import { loadAnalytics } from "@/lib/reviews/dashboard-server"
import { reviewsCaller } from "../load-reviews"

export const dynamic = "force-dynamic"
export const revalidate = 0

/** Reviews › Analytics (components/app/reviews/analytics-view.tsx), opening on the last 30 days. */
export default async function ReviewsAnalyticsPage() {
  const c = await reviewsCaller()
  if (c.state === "signed-out") return null
  if (c.state === "no-creator") redirect("/sell")
  const period = periodFor("30d")
  const previous = previousPeriod(period)
  const rows = await loadAnalytics(c.db, c.creatorId, new Date(previous.from).toISOString(), new Date(period.to).toISOString())
  return <ReviewsAnalytics initial={{ range: "30d", period, previous, ...rows }} />
}
