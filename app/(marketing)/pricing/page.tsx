import { createClient } from "@/lib/supabase/server"
import { PricingPageClient } from "./pricing-client"

export default async function PricingPage() {
  let currentPlanId: string | null = null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: creator } = await supabase
        .from("creators")
        .select("subscription_plan_id")
        .eq("user_id", user.id)
        .maybeSingle()

      currentPlanId = creator?.subscription_plan_id ?? "free"
    }
  } catch {
    // Not logged in or error — show normal buttons
  }

  return <PricingPageClient currentPlanId={currentPlanId} />
}
