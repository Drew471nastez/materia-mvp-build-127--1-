import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/gate"
import { catalog, readSqlUpdates, revision } from "@/lib/admin/sql-updates-server"
import { sqlBatch } from "@/lib/admin/sql-updates"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" }

export async function GET(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const url = new URL(request.url)
  if (url.searchParams.has("files")) {
    if (url.searchParams.get("revision") !== revision) return NextResponse.json({ error: "SQL source changed. Refresh history and review your selection again." }, { status: 409, headers })
    const ids = (url.searchParams.get("files") ?? "").split(",")
    try {
      return new NextResponse(sqlBatch(catalog, ids), { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="storelib-updates.sql"' } })
    } catch {
      return NextResponse.json({ error: "Choose known updates. Copy manual SQL one file at a time." }, { status: 400, headers })
    }
  }
  return NextResponse.json(await readSqlUpdates(), { headers })
}
