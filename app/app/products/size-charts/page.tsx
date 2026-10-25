import type { Metadata } from "next"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { listSizeCharts } from "@/lib/size-charts/server"
import { SizeChartsClient } from "./size-charts-client"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

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
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser. */
  if (!user) return null
  const creator = await creatorForRequest(user.id)
  if (!creator) return noStorePage("/app/products/size-charts")
  const { ready, rules, charts, targets } = await listSizeCharts(createAdminClient(), creator.id)
  return <SizeChartsClient creatorId={creator.id} ready={ready} rules={rules} targets={targets} initialCharts={charts} />
}
