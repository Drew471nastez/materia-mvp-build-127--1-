import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ALTERNATIVES, getAlternative } from "@/lib/alternatives"
import { alternativeMetadata } from "@/lib/alternatives/seo"
import { alternativesFlags } from "@/lib/alternatives/flags"
import { AlternativePage } from "@/components/alternatives/alternative-page"

/*
  Every comparison is known at build time (lib/alternatives), so each is
  built once and served from the CDN; anything else under /alternatives is a
  404. Revalidated hourly, so a Storelib switch that turns on (communities,
  Explore, physical products) reaches these pages without a deploy.
*/
export const dynamicParams = false
export const revalidate = 3600

export function generateStaticParams() {
  return ALTERNATIVES.map((c) => ({ slug: c.slug }))
}

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = getAlternative((await params).slug)
  return c ? alternativeMetadata(c) : {}
}

export default async function AlternativeRoute({ params }: Params) {
  const c = getAlternative((await params).slug)
  if (!c) notFound()
  return <AlternativePage c={c} flags={await alternativesFlags()} />
}
