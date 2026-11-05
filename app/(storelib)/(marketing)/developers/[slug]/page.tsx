import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { HubPage, devMetadata } from "@/components/developers/hub-page"
import { DEV_PAGES, devPage } from "@/lib/developers/pages"

/* Every page is known at build time; anything else under /developers is a 404. */
export const dynamicParams = false

export function generateStaticParams() {
  return DEV_PAGES.filter((p) => p.slug).map((p) => ({ slug: p.slug }))
}

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  return devMetadata(slug)
}

export default async function DeveloperDocPage({ params }: Params) {
  const { slug } = await params
  if (!devPage(slug)) notFound()
  return <HubPage slug={slug} />
}
