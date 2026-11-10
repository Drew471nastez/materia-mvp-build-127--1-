import type { NextRequest } from "next/server"

import { requireAdmin } from "@/lib/admin/gate"
import { referenceAdmin } from "@/lib/storelib-ai/references/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* One upload is one vision call on claude-opus-5-5 (about a minute at most), plus resizing. */
export const maxDuration = 120

/**
 * GET  /api/admin/design-references   every reference the admin uploaded, newest first
 * POST /api/admin/design-references   multipart: file (PNG, JPEG or WebP, up to 4 MB), notes, source
 *
 * The AI's visual reference library (lib/storelib-ai/references). `source`
 * is a note about where the picture came from: nothing fetches it.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  return referenceAdmin().list()
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  return referenceAdmin().upload(req)
}
