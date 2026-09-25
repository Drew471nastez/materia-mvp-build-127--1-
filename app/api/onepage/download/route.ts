import { type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { serveTokenDownload } from "@/lib/storage/token-download"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/onepage/download?token=<download_token>
// Fallback route for token-based downloads via query parameter.
// The primary route is /api/onepage/download/[token] (dynamic segment).
// Both answer through lib/storage/token-download.ts.
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token")
  return serveTokenDownload(request, createAdminClient(), token)
}
