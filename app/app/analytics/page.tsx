import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AnalyticsClient } from "./analytics-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Analytics | Materia",
}

export default async function AnalyticsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: creator, error: creatorError } = await supabase
    .from("creators")
    .select("id, views")
    .eq("user_id", user.id)
    .single()

  if (creatorError || !creator) {
    redirect("/onboarding")
  }

  const { data: products = [] } = await supabase.from("products").select("id, title").eq("creator_id", creator.id)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-muted-foreground">Track your store performance</p>
      </div>

      <AnalyticsClient creatorId={creator.id} products={products} />
    </div>
  )
}
