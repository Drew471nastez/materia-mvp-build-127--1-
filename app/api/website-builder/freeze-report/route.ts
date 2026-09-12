import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { FREEZE_REPORT_MAX_BYTES, splitForLog, type FreezeReport } from "@/lib/website-builder/freeze-report"

/**
 * A phone whose canvas stopped scrolling sends what it saw; see
 * lib/website-builder/freeze-report.ts for what that is and why. It goes to
 * the runtime log and nowhere else: no table, no third party. Signed-in
 * users only, because the editor is, and a hard cap on size because a log
 * line is not a place to put a megabyte.
 *
 * Nothing in a report is content. If that ever changes, this is the place
 * that must say no.
 */
export const runtime = "nodejs"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const text = await req.text()
  if (text.length > FREEZE_REPORT_MAX_BYTES) {
    return NextResponse.json({ error: "Too large" }, { status: 413 })
  }
  let report: unknown
  try {
    report = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Not JSON" }, { status: 400 })
  }
  if (!report || typeof report !== "object" || typeof (report as { reason?: unknown }).reason !== "string") {
    return NextResponse.json({ error: "Not a report" }, { status: 400 })
  }

  // Two lines under one tag: the log cuts a long line short, and the two
  // element chains are the long part. The small fields go first, whole.
  const [core, chains] = splitForLog(report as FreezeReport)
  console.warn(`[wb-freeze] ${core}`)
  console.warn(`[wb-freeze-chains] ${chains}`)
  return new NextResponse(null, { status: 204 })
}
