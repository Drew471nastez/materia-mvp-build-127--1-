import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SizeChartPage } from "../size-chart-page"
import { loadSizeChartArea } from "../load-size-charts"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Edit size chart") }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A chart's own page. Only this store's charts are read, so another store's id goes back to the list. */
export default async function SizeChartEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) redirect("/app/products/size-charts")
  const load = await loadSizeChartArea()
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") return noStorePage("/app/products/size-charts")
  const chart = load.charts.find((c) => c.id === id)
  if (!chart) redirect("/app/products/size-charts")
  return <SizeChartPage key={id} creatorId={load.creatorId} chart={chart} ready={load.ready} rules={load.rules} targets={load.targets} />
}
