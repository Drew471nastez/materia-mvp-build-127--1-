import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { importStock } from "@/lib/physical/inventory-server"
import { parseInventoryCsv } from "@/lib/physical/inventory-rules"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** At most this much text: two thousand lines of the export's columns with room to spare. */
const MAX_CHARS = 1_000_000

/**
 * A stock count from a spreadsheet (the export's columns, or SKU, Location
 * and On hand): each line sets on hand at a location, written in the
 * history as an import. The same file sent twice changes nothing the second
 * time (each line's key is the file's hash and its line number).
 */
export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const csv = typeof body?.csv === "string" ? body.csv : ""
  if (!csv.trim()) return physicalJson({ error: "Choose a CSV file." }, 400)
  if (csv.length > MAX_CHARS) return physicalJson({ error: "That file is too big. Import up to 2,000 lines at a time." }, 413)
  const parsed = parseInventoryCsv(csv)
  if (parsed.lines.length === 0) return physicalJson({ error: parsed.errors[0] ?? "Nothing to import." }, 400)
  const fileKey = createHash("sha256").update(csv).digest("hex").slice(0, 24)
  const out = await importStock(c.db, { creatorId: c.creatorId, userId: c.userId, fileKey, lines: parsed.lines })
  if (out.changed) {
    readinessChanged(c, { recheck: false })
    await recordActivity(c.db, c, { action: "inventory.imported", subjectType: "inventory", subjectLabel: `${out.changed} stock counts` })
  }
  return physicalJson({ changed: out.changed, unchanged: out.unchanged, skipped: [...parsed.errors, ...out.skipped].slice(0, 50), skippedCount: parsed.errors.length + out.skipped.length })
}
