import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadPackages, readPackage } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const read = readPackage(body)
  if (read.ok === false) return physicalJson({ error: read.error }, 400)
  const existing = await loadPackages(c.db, c.creatorId)
  if (existing.length >= 30) return physicalJson({ error: "A shop can have up to 30 packages." }, 400)
  const { error } = await c.db.from("shipping_packages").insert({ ...read.row, creator_id: c.creatorId, is_default: existing.length === 0 })
  if (error) return physicalJson({ error: "The package could not be saved." }, 500)
  return physicalJson({ packages: await loadPackages(c.db, c.creatorId) })
}
