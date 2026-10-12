import type { Metadata } from "next"

import { NewSiteFlow } from "@/components/sites/new-site-flow"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("New site") }
}

export default function NewSitePage() {
  return <NewSiteFlow />
}
