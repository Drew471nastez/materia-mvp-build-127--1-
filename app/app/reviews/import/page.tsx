import { redirect } from "next/navigation"
import { ImportFlow } from "@/components/app/reviews/import-flow"
import { reviewsCaller } from "../load-reviews"

export const dynamic = "force-dynamic"

/** Reviews › Import (components/app/reviews/import-flow.tsx). */
export default async function ReviewsImportPage() {
  const c = await reviewsCaller()
  if (c.state === "signed-out") return null
  if (c.state === "no-creator") redirect("/sell")
  return <ImportFlow />
}
