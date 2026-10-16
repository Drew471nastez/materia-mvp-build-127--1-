import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { WidgetsClient } from "@/components/app/reviews/widgets/widgets-client"
import { loadWidgetsPage } from "./load-widgets"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Review widgets") }
}

/**
 * Reviews › Widgets: every Storelib Reviews section drawn with the store's
 * own reviews, set up and saved here, and placed on the website from here
 * (components/app/reviews/widgets).
 */
export default async function ReviewWidgetsPage() {
  const data = await loadWidgetsPage()
  /* No session yet: the app shell's gate draws its own frame over this while it restores the session. */
  if (data.state === "signed-out") return null
  if (data.state === "no-creator") redirect("/sell")
  return <WidgetsClient data={data} />
}
