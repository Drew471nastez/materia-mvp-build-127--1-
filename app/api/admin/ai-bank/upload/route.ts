import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/admin/gate"
import { createAdminClient } from "@/lib/supabase/admin"
import { bankRowView } from "@/lib/storelib-ai/bank/admin"
import { uploadIntoBank } from "@/lib/storelib-ai/bank/store"
import { UPLOAD_FILE_CHARS, UPLOAD_MAX_CHARS, UPLOAD_MAX_FILES, type UploadedFile } from "@/lib/storelib-ai/bank/upload"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/admin/ai-bank/upload  { name, files: [{ path, text }] }
 *
 * A theme the admin uploaded (the browser has already unpacked a zip and kept the text files), put in the AI
 * source bank as a reference. Admin cookie only.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = (await req.json().catch(() => null)) as { name?: unknown; files?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : ""
  const raw = Array.isArray(body?.files) ? body.files : []
  const files: UploadedFile[] = []
  let total = 0
  for (const f of raw.slice(0, UPLOAD_MAX_FILES)) {
    const path = typeof f?.path === "string" ? f.path.slice(0, 300) : ""
    const text = typeof f?.text === "string" ? f.text.slice(0, UPLOAD_FILE_CHARS) : ""
    if (!path || !text) continue
    total += text.length
    if (total > UPLOAD_MAX_CHARS + 100_000) break
    files.push({ path, text })
  }
  if (!files.length) return NextResponse.json({ error: "Add a zip, a page, a stylesheet or a theme's files." }, { status: 400 })
  const r = await uploadIntoBank(createAdminClient() as unknown as Parameters<typeof uploadIntoBank>[0], name, files)
  if (r.ok === false) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ entry: bankRowView(r.row) })
}
