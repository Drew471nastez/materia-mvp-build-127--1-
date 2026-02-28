import { PricingPageClient } from "./pricing-client"
import { createClient } from "@/lib/supabase/server"

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; returnTo?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <PricingPageClient
      source={params.source}
      returnTo={params.returnTo ? decodeURIComponent(params.returnTo) : undefined}
      isLoggedIn={!!user}
    />
  )
}
