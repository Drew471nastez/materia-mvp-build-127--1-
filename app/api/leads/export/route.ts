import { NextResponse } from "next/server"
import { formActor, formError, NO_STORE } from "@/lib/forms/server"
import { csvCell } from "@/lib/forms/definition"
import {
  applyLeadFilters,
  beforeLead,
  leadCursor,
} from "@/lib/forms/lead-query"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  const params = new URL(request.url).searchParams,
    snapshot = new Date().toISOString()
  const read = async (cursor: string | null) => {
    let query = actor.db
      .from("form_submissions")
      .select(
        "id,form_title,contact_name,contact_email,contact_phone,answers,status,score,consent,source_kind,source_url,submitted_at",
      )
      .eq("owner_id", actor.user.id)
      .lte("submitted_at", snapshot)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500)
    query = beforeLead(applyLeadFilters(query, params), cursor)
    const { data, error } = await query
    if (error) throw new Error("The export could not be read. Try again.")
    return data || []
  }
  let batch: any[]
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
        const rows = header
          ? [
              [
                "Submitted",
                "Form",
                "Name",
                "Email",
                "Phone",
                "Status",
                "Score",
                "Answers",
                "Consent",
                "Source",
                "Source URL",
              ],
            ]
          : []
        const prefix = header ? "\ufeff" : ""
        header = false
        rows.push(
          ...batch.map((r) => [
            r.submitted_at,
            r.form_title,
            r.contact_name,
            r.contact_email,
            r.contact_phone,
            r.status,
            r.score,
            r.answers,
            r.consent,
            r.source_kind,
            r.source_url,
          ]),
        )
        controller.enqueue(
          encoder.encode(
            prefix +
              rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
              "\r\n",
          ),
        )
        if (batch.length < 500) {
          finished = true
          controller.close()
          return
        }
        batch = await read(leadCursor(batch[batch.length - 1]))
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
