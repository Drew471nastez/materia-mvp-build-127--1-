import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { productSizeChartId, setProductSizeChart } from "@/lib/size-charts/server"
import { sizeChartsChanged } from "../changed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Which chart a product uses: the product editor's Size chart card.
 *
 *   GET ?productId=                     { ready, chartId }
 *   PUT { productId, chartId | null }   set after the product is saved
 */
export async function GET(request: Request) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const productId = new URL(request.url).searchParams.get("productId") ?? ""
  return physicalJson(await productSizeChartId(c.db, c.creatorId, productId))
}

export async function PUT(request: Request) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out = await setProductSizeChart(c.db, c.creatorId, body.productId, body.chartId ?? null)
  if (out.ok === false) return physicalJson({ error: out.error }, out.status)
  await sizeChartsChanged(c.creatorId)
  return physicalJson({ chartId: out.chartId })
}
