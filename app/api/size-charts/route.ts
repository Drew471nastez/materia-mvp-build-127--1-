import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { listSizeCharts, saveSizeChart } from "@/lib/size-charts/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The store's size charts (Products › Size charts, and the product editor's
 * Size chart card). Physical products only: behind the same switch and the
 * same owner check as every physical commerce route (lib/physical/auth).
 *
 *   GET    the charts, each with how many products use it, and `ready`
 *          (false before SQL part 283 has run)
 *   POST   a new chart; answers with its id and the list again
 */
export async function GET() {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  return physicalJson(await listSizeCharts(c.db, c.creatorId))
}

export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveSizeChart(c.db, c.creatorId, null, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  return physicalJson({ id: saved.id, ...(await listSizeCharts(c.db, c.creatorId)) })
}
