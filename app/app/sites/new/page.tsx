import type { Metadata } from "next"

import { NewSiteFlow } from "@/components/sites/new-site-flow"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "New site" }

export default function NewSitePage() {
  return <NewSiteFlow />
}
