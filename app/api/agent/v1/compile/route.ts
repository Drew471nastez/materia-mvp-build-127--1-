/**
 * POST /api/agent/v1/compile  { path, source }
 *
 * Compiles a section file without saving it and answers with every error as
 * file, line and message: the loop an agent runs until a file is clean.
 */
import { NextResponse } from "next/server"
import { authenticateAgent } from "@/lib/agent-access/tokens"
import { compileOnly } from "@/lib/agent-access/operations"
import { MAX_AGENT_BODY as MAX_BODY, readJsonCapped } from "@/lib/agent-access/body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const who = await authenticateAgent(request)
  if (who instanceof NextResponse) return who
  const read = await readJsonCapped<{ path?: unknown; source?: unknown } | null>(request, MAX_BODY)
  if (read.ok === false) {
    return NextResponse.json({ error: read.status === 413 ? "Request too large" : "Send JSON: { path, source }" }, { status: read.status })
  }
  const body = read.value ?? {}
  if (typeof body.path !== "string" || typeof body.source !== "string") {
    return NextResponse.json({ error: "Send JSON: { path, source }" }, { status: 400 })
  }
  const r = compileOnly(body.path, body.source)
  if (r.ok === true) return NextResponse.json({ ok: true, ...r.value })
  return NextResponse.json({ ok: false, error: r.error, errors: r.errors ?? [] }, { status: r.status })
}
