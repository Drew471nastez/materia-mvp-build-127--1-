import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { AnalyticsClient } from "./analytics-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Analytics",
}

/**
 * Who is asking and what they sell. Every figure on the page is counted by
 * app/api/analytics/reports, so nothing else is read here: this used to load
 * every order the creator ever had, for numbers the page now asks the
 * server for.
 */
export default async function AnalyticsPage() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: creator, error: creatorError } = await adminSupabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    redirect("/onboarding")
  }

  const { data: productsData } = await adminSupabase
    .from("products")
    .select("id, title, thumbnail_url")
    .eq("creator_id", creator.id)

  return <AnalyticsClient creatorId={creator.id} userId={user.id} products={productsData || []} />
}
