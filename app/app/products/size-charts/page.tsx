import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { listSizeCharts } from "@/lib/size-charts/server"
import { SizeChartsClient } from "./size-charts-client"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage, teamPageStore } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Size charts") }
}

/**
 * Products › Size charts, read on the server like Collections (../collections/
 * page.tsx), so the list lands with its rows. Physical products only: while
 * physical commerce is off in /admin this is a 404, like Inventory. Every
 * chart is read by the owner's creator id, the same reader the API uses
 * (lib/size-charts/server.ts).
 */
export default async function SizeChartsPage() {
  await requirePhysicalPage()
  /* Whose store (round 41): the owner's own, or the store a team member with Products works in. */
  const access = await teamPageStore("products")
  if (access.kind === "signed_out" || access.kind === "denied") return null
  if (access.kind === "none") return noStorePage("/app/products/size-charts")
  const { ready, rules, charts, targets } = await listSizeCharts(createAdminClient(), access.creatorId)
  return <SizeChartsClient creatorId={access.creatorId} ready={ready} rules={rules} targets={targets} initialCharts={charts} />
}
