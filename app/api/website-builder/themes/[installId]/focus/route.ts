/**
 * PUT { page_key, section_id?, block_id? }
 *
 * What the creator has open in the builder, so a connected agent's
 * storelib_read_selected_section can answer "this one" (lib/agent-access/
 * project.ts). The builder sends it only while an agent is connected, and
 * only when the selection changes.
 *
 * The creator is found from their session and the install must be theirs.
 * The row is written with the service role because creators only READ this
 * table (RUN_AGENT_MCP.sql); nothing in the body names a creator or a table.
 * Before that SQL has been run this answers 204 and stores nothing.
 */
import { websiteInstallCaller } from "@/lib/team/website"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { BODY_LIMITS, readEditorBody } from "@/lib/website-builder/request-body"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

const PAGE_KEY = /^[a-z0-9][a-z0-9-]{0,62}$/
const ID = /^[A-Za-z0-9_-]{1,128}$/

export async function PUT(req: Request, { params }: Params) {
  const { installId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(installId)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  /* The owner, or a team member with Website working in the store (lib/team/website). */
  const site = await websiteInstallCaller(installId)
  if (site.error !== null) return NextResponse.json({ error: site.status === 404 ? "Not found" : site.error }, { status: site.status })

  /* Three short strings, so a small cap: lib/website-builder/request-body.ts. */
  const read = await readEditorBody(req, BODY_LIMITS.small)
  if (read.ok === false) return read.response
  const body = ((read.invalid ? null : read.json) ?? {}) as { page_key?: unknown; section_id?: unknown; block_id?: unknown }
  const page = typeof body.page_key === "string" ? body.page_key.toLowerCase() : ""
  if (!PAGE_KEY.test(page)) return NextResponse.json({ error: "page_key" }, { status: 400 })
  const section = typeof body.section_id === "string" && ID.test(body.section_id) ? body.section_id : null
  const block = section && typeof body.block_id === "string" && ID.test(body.block_id) ? body.block_id : null

  const { error } = await createAdminClient()
    .from("theme_editor_focus")
    .upsert({ install_id: installId, page_key: page, section_id: section, block_id: block, updated_at: new Date().toISOString() }, { onConflict: "install_id" })
  if (error && !/theme_editor_focus|does not exist|schema cache/i.test(error.message)) {
    return NextResponse.json({ error: "Could not record it" }, { status: 500 })
  }
  return new Response(null, { status: 204 })
}
