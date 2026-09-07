/**
 * Undo an agent run.
 *
 * Snapshots are taken before every run and were, until now, a promise nobody
 * could collect on: "the AI broke my site" needs a button, not a row in a
 * table.
 *
 * Ownership is proved by RLS, not by a check here — `restoreVersion` reads the
 * version through the signed-in user's client, so a version on somebody else's
 * site simply is not there.
 */

import { type NextRequest, NextResponse } from "next/server"

import { restoreVersion } from "@/lib/sites/agent/run"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  let body: { versionId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const versionId = typeof body.versionId === "string" ? body.versionId : ""
  if (!versionId) return NextResponse.json({ error: "Which version?" }, { status: 400 })

  const result = await restoreVersion(siteId, versionId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, paths: result.paths })
}
