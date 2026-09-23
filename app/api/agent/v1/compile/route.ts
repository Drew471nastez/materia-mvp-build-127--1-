/**
 * POST /api/agent/v1/compile  { path, source }
 *
 * Compiles a section file without saving it and answers with every error as
 * file, line and message: the loop an agent runs until a file is clean.
 */
import { NextResponse } from "next/server"
import { authenticateAgent } from "@/lib/agent-access/tokens"
import { compileOnly } from "@/lib/agent-access/operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const who = await authenticateAgent(request)
  if (who instanceof NextResponse) return who
  let body: { path?: unknown; source?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send JSON: { path, source }" }, { status: 400 })
  }
  if (typeof body.path !== "string" || typeof body.source !== "string") {
    return NextResponse.json({ error: "Send JSON: { path, source }" }, { status: 400 })
  }
  const r = compileOnly(body.path, body.source)
  if (r.ok === true) return NextResponse.json({ ok: true, ...r.value })
  return NextResponse.json({ ok: false, error: r.error, errors: r.errors ?? [] }, { status: r.status })
}
