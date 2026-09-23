/**
 * GET /api/agent/v1/site
 *
 * What the connected website is: its name, address, brand, fonts, colour
 * schemes, pages and published products. The same answer as the MCP tool
 * `storelib_site`; see lib/agent-access/site-brief.ts for what is in it and,
 * as much to the point, what is not.
 */
import { NextResponse } from "next/server"
import { authenticateAgent } from "@/lib/agent-access/tokens"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteBrief } from "@/lib/agent-access/site-brief"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const who = await authenticateAgent(request)
  if (who instanceof NextResponse) return who
  const r = await siteBrief(createAdminClient(), who)
  if (r.ok === false) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r.value)
}
