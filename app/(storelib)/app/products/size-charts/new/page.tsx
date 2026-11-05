import type { Metadata } from "next"
import { SizeChartPage } from "../size-chart-page"
import { loadSizeChartArea } from "../load-size-charts"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("New size chart") }
}

export default async function NewSizeChartPage() {
  const load = await loadSizeChartArea()
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") return noStorePage("/app/products/size-charts/new")
  return <SizeChartPage creatorId={load.creatorId} chart={null} ready={load.ready} rules={load.rules} targets={load.targets} />
}
