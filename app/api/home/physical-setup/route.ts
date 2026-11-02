import { NextResponse } from "next/server"
import { physicalCaller, physicalJson } from "@/lib/physical/auth"
import { readPhysicalSetup } from "@/lib/home/physical-setup-server"
import { physicalBlockers, physicalSteps } from "@/lib/home/physical-setup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Home's physical setup card: the steps and which are done, for the caller's own store, while physical commerce is on. */
export async function GET() {
  const c = await physicalCaller("store", { read: true })
  if (c instanceof NextResponse) return c
  const facts = await readPhysicalSetup(c.db, c.creatorId)
  return physicalJson({ steps: physicalSteps(facts), blockers: physicalBlockers(facts) })
}
