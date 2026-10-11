/**
 * ===========================================================================
 *  THE SAME TOOLS AS THE MCP SERVER, OVER PLAIN HTTP
 * ===========================================================================
 * For an agent, a script or a CI job that does not speak MCP. The rules are
 * the MCP server's: lib/agent-access/operations.ts.
 *
 *   GET  /api/agent/v1/files                    every file of the site's theme
 *   GET  /api/agent/v1/files?path=sections/x.storelib    one file
 *   PUT  /api/agent/v1/files  { path, source, base_updated_at? }
 *                                                save a section as a draft
 *
 * Authorization: Bearer slb_... , made under Website settings in the builder.
 */
import { NextResponse, after } from "next/server"
import { mirrorToGitHub } from "@/lib/github-sync/mirror"
import { authenticateAgent, READ_ONLY_REFUSAL } from "@/lib/agent-access/tokens"
import { createAdminClient } from "@/lib/supabase/admin"
import { listFiles, readFile, writeSection, type OpResult } from "@/lib/agent-access/operations"
import { MAX_AGENT_BODY, readJsonCapped } from "@/lib/agent-access/body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function answer<T>(r: OpResult<T>) {
  if (r.ok === true) return NextResponse.json(r.value)
  return NextResponse.json({ error: r.error, ...(r.errors ? { errors: r.errors } : {}) }, { status: r.status })
}

export async function GET(request: Request) {
  const who = await authenticateAgent(request)
  if (who instanceof NextResponse) return who
  const db = createAdminClient()
  const path = new URL(request.url).searchParams.get("path")
  if (path) return answer(await readFile(db, who.installId, path))
  return answer(await listFiles(db, who.installId))
}

export async function PUT(request: Request) {
  const who = await authenticateAgent(request)
  if (who instanceof NextResponse) return who
  if (who.canWrite === false) return NextResponse.json({ error: READ_ONLY_REFUSAL }, { status: 403 })
  const read = await readJsonCapped<{ path?: unknown; source?: unknown; base_updated_at?: unknown } | null>(request, MAX_AGENT_BODY)
  if (read.ok === false) {
    return NextResponse.json({ error: read.status === 413 ? "Request too large" : "Send JSON: { path, source }" }, { status: read.status })
  }
  const body = read.value ?? {}
  if (typeof body.path !== "string" || typeof body.source !== "string") {
    return NextResponse.json({ error: "Send JSON: { path, source }" }, { status: 400 })
  }
  const base = typeof body.base_updated_at === "string" ? body.base_updated_at : undefined
  const path = body.path
  const source = body.source
  const r = await writeSection(createAdminClient(), who, path, source, base)
  if (r.ok === true) after(() => mirrorToGitHub(who.installId, { kind: "save", path, content: source }))
  return answer(r)
}
