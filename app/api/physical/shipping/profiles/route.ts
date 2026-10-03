import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { ensureDefaultProfile, loadProfiles, text } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  await ensureDefaultProfile(c.db, c.creatorId)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}

/** A custom profile, for products that ship differently (heavy, fragile, local only). */
export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const name = text(body?.name, 80)
  if (!name) return physicalJson({ error: "Name the profile." }, 400)
  await ensureDefaultProfile(c.db, c.creatorId)
  const { error } = await c.db.from("shipping_profiles").insert({ creator_id: c.creatorId, name, is_default: false })
  if (error) return physicalJson({ error: "The profile could not be saved." }, 500)
  return physicalJson({ profiles: await loadProfiles(c.db, c.creatorId) })
}
