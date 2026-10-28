import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { deleteSizeChart, listSizeCharts, saveSizeChart } from "@/lib/size-charts/server"
import { sizeChartsChanged } from "../changed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** One of the store's charts: PUT replaces it, DELETE removes it and leaves its products with none. Both answer with the list again. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const { id } = await params
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveSizeChart(c.db, c.creatorId, id, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  /* Every product page that shows it changes with it. */
  await sizeChartsChanged(c.creatorId)
  return physicalJson({ id, ...(await listSizeCharts(c.db, c.creatorId)) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const { id } = await params
  const gone = await deleteSizeChart(c.db, c.creatorId, id)
  if (gone.ok === false) return physicalJson({ error: gone.error }, gone.status)
  await sizeChartsChanged(c.creatorId)
  return physicalJson(await listSizeCharts(c.db, c.creatorId))
}
