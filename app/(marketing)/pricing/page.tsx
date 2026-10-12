import { PricingPageClient } from "./pricing-client"
import { createClient } from "@/lib/supabase/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; returnTo?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await currentUserForRequest().then((c) => ({ data: { user: c.user } }))

  return (
    <PricingPageClient
      source={params.source}
      returnTo={params.returnTo ? decodeURIComponent(params.returnTo) : undefined}
      isLoggedIn={!!user}
    />
  )
}
