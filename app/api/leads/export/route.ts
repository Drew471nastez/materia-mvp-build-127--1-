import { NextResponse } from "next/server"
import { formActor, formError, NO_STORE, isMissingSchema } from "@/lib/forms/server"
import { csvCell } from "@/lib/forms/definition"
import { LEAD_CSV_HEADER, leadRow } from "@/lib/forms/lead-csv"
import { applyLeadFilters, beforeLead, leadCursor } from "@/lib/forms/lead-query"
export const dynamic = "force-dynamic"

type Row = Record<string, any>

/*
  GET /api/leads/export: the owner's leads with the same filters as the
  list, streamed 500 rows at a time from one snapshot time. Every cell goes
  through csvCell, so a value starting with = + - @ (or a tab, a return, or
  their full width forms) is written as text and never run by a
  spreadsheet.
*/

const BASE = "id,form_title,contact_name,contact_email,contact_phone,answers,status,score,consent,source_kind,source_url,submitted_at"
export async function GET(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const params = new URL(request.url).searchParams,
    snapshot = new Date().toISOString()
  let upgraded = true
  const read = async (cursor: string | null): Promise<Row[]> => {
    const run = (columns: string) =>
      beforeLead(
        applyLeadFilters(
          actor.db.from("form_submissions").select(columns).eq("owner_id", actor.user.id).lte("submitted_at", snapshot).order("submitted_at", { ascending: false }).order("id", { ascending: false }).limit(500),
          params,
        ),
        cursor,
      )
    let { data, error } = await run(upgraded ? BASE + ",notes,source_block" : BASE)
    if (error && upgraded && isMissingSchema(error)) {
      upgraded = false
      ;({ data, error } = await run(BASE))
    }
    if (error) throw new Error("The export could not be read. Try again.")
    const rows = (data || []) as unknown as Row[]
    if (upgraded && rows.length) {
      const { data: b } = await actor.db.from("form_bookings").select("submission_id,starts_at,status").eq("owner_id", actor.user.id).in("submission_id", rows.map((r) => r.id))
      for (const r of rows) r.__booking = (b || []).find((x: Row) => x.submission_id === r.id) || null
    }
    return rows
  }
  let batch: Row[]
  try {
    batch = await read(null)
  } catch (error) {
    return formError(error, 503)
  }
  const encoder = new TextEncoder()
  let header = true,
    finished = false
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return
      try {
        if (request.signal.aborted) {
          finished = true
          controller.close()
          return
        }
        const rows: unknown[][] = header ? [LEAD_CSV_HEADER] : []
        const prefix = header ? "﻿" : ""
        header = false
        rows.push(...batch.map((r) => leadRow(r, r.__booking)))
        controller.enqueue(encoder.encode(prefix + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"))
        if (batch.length < 500) {
          finished = true
          controller.close()
          return
        }
        batch = await read(leadCursor(batch[batch.length - 1] as { submitted_at: string; id: string }))
      } catch (error) {
        finished = true
        controller.error(error)
      }
    },
    cancel() {
      finished = true
    },
  })
  return new Response(stream, {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
