import { redirect } from "next/navigation"
import { ReviewsSettingsForm } from "@/components/app/reviews/settings-form"
import { reviewsAppFor, reviewsCaller } from "../load-reviews"

export const dynamic = "force-dynamic"
export const revalidate = 0

/** Reviews › Settings (components/app/reviews/settings-form.tsx): the one place Storelib Reviews is set up. */
export default async function ReviewsSettingsPage() {
  const c = await reviewsCaller()
  if (c.state === "signed-out") return null
  if (c.state === "no-creator") redirect("/sell")
  const app = await reviewsAppFor(c.creatorId)
  return <ReviewsSettingsForm initial={app.settings} ready={app.ready} />
}
