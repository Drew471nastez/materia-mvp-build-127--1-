import { redirect } from "next/navigation"
import { ReviewsWidgetsTab } from "@/components/app/reviews/widgets-tab"
import { reviewsAppFor, reviewsCaller } from "../load-reviews"

export const dynamic = "force-dynamic"

/**
 * Reviews › Widgets. The tab entry and its route (components/app/reviews/
 * reviews-nav.tsx); what it draws is the widget gallery's to replace: render
 * it here, inside the area's frame (the layout draws the title and the tabs,
 * the page draws REVIEWS_BODY), in place of ReviewsWidgetsTab.
 */
export default async function ReviewsWidgetsPage() {
  const c = await reviewsCaller()
  if (c.state === "signed-out") return null
  if (c.state === "no-creator") redirect("/sell")
  const app = await reviewsAppFor(c.creatorId)
  return <ReviewsWidgetsTab enabled={app.settings.enabled} productPage={app.settings.display.productPage} />
}
