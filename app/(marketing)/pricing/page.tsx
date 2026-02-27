import { PricingPageClient } from "./pricing-client"

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; returnTo?: string }>
}) {
  const params = await searchParams
  return (
    <PricingPageClient
      source={params.source}
      returnTo={params.returnTo ? decodeURIComponent(params.returnTo) : undefined}
    />
  )
}
