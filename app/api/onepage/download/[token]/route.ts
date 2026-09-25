import { createAdminClient } from "@/lib/supabase/admin"
import { serveTokenDownload } from "@/lib/storage/token-download"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET - Download digital product files via secure token
// (lib/storage/token-download.ts: rate limited, scanned files only, short lived signed URLs)
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return serveTokenDownload(request, createAdminClient(), token)
}
