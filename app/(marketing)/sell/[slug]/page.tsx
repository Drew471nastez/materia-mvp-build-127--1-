import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { USE_CASES, getUseCase, useCaseOn } from "@/lib/marketing/use-cases"
import { useCaseMetadata } from "@/lib/marketing/use-case-seo"
import { alternativesFlags } from "@/lib/alternatives/flags"
import { UseCasePage } from "@/components/marketing/use-case-page"

/*
  /sell/<use case>: what Storelib does for one kind of seller
  (lib/marketing/use-cases). /sell itself is the sign up door
  (app/(auth)/sell); these pages sit under it in their own route group, with
  the marketing header and footer. Every page is known at build time and
  served from the CDN; anything else under /sell/ is a 404. Revalidated
  hourly, so a page whose use waits behind a switch (communities) appears
  or goes without a deploy.
*/
export const dynamicParams = false
export const revalidate = 3600

export function generateStaticParams() {
  return USE_CASES.map((u) => ({ slug: u.slug }))
}

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const u = getUseCase((await params).slug)
  return u ? useCaseMetadata(u) : {}
}

export default async function UseCaseRoute({ params }: Params) {
  const u = getUseCase((await params).slug)
  if (!u) notFound()
  const flags = await alternativesFlags()
  if (!useCaseOn(u, flags)) notFound()
  return <UseCasePage u={u} flags={flags} />
}
