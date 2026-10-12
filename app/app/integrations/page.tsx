import { redirect } from "next/navigation"
import { currentCreatorId } from "@/lib/creators/current"
import { IntegrationsClient } from "./integrations-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = { title: "Integrations" }

/**
 * /app/integrations: the store's integrations on a page of their own, as
 * Shopify keeps its apps: the ones connected, to manage, then every one
 * there is to add, each opening its own page (?integration=<id>, the link
 * each installed one has in the sidebar). The same directory and pages as
 * Settings › Integrations (components/app/settings/integrations-directory.tsx).
 */
export default async function IntegrationsPage() {
  const creatorId = await currentCreatorId()
  if (!creatorId) redirect("/sell")
  return <IntegrationsClient />
}
