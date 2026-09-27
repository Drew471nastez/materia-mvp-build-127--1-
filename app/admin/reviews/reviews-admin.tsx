"use client"

import * as React from "react"

import { Banner, Button, Filters, Panel, Placeholder } from "../_console/ui"

/**
 * ===========================================================================
 *  REPORTED REVIEWS
 * ===========================================================================
 * Each report as Storelib needs to decide it: the review in full, its stars,
 * who wrote it, the product, the seller who reported it, why, and their
 * note. Restore puts it back on the product page and in the rating; Keep
 * hidden leaves it off. Nothing is deleted. The review request emails that
 * lead buyers to write reviews are traced under Notifications (types
 * REVIEW_REQUEST and REVIEW_REMINDER).
 */

type Report = {
  id: string
  reason: string
  note: string | null
  reportedAt: string
  resolvedAt: string | null
  resolution: string | null
  review: { id: string; rating: number; content: string; createdAt: string; status: string; author: string } | null
  product: { title: string | null; slug: string | null } | null
  seller: string | null
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "")

export function ReviewsAdmin() {
  const [state, setState] = React.useState<"open" | "resolved">("open")
  const [reports, setReports] = React.useState<Report[] | null>(null)
  const [note, setNote] = React.useState<{ tone: "good" | "bad" | "plain"; text: string } | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const load = React.useCallback(async (s: "open" | "resolved") => {
    setReports(null)
    try {
      const res = await fetch(`/api/admin/reviews?state=${s}`, { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "The reports could not be read." })
      if (body?.unavailable) {
        setNote({ tone: "plain", text: body.unavailable })
        return setReports([])
      }
      setReports(body?.reports ?? [])
    } catch {
      setNote({ tone: "bad", text: "Could not reach Storelib." })
    }
  }, [])

  React.useEffect(() => {
    void load(state)
  }, [state, load])

  const decide = async (report: Report, decision: "restore" | "keep_hidden") => {
    setBusy(report.id)
    try {
      const res = await fetch("/api/admin/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId: report.id, decision }) })
      const body = await res.json().catch(() => null)
      if (!res.ok) return setNote({ tone: "bad", text: body?.error || "That did not save." })
      setNote({ tone: "good", text: decision === "restore" ? "Restored. It is back on the product page." : "Kept hidden." })
      setReports((rows) => (rows ?? []).filter((r) => r.id !== report.id))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [font-family:Inter,system-ui,sans-serif]" data-admin-reviews="">
      <div className="mx-auto w-full max-w-[960px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <a href="/admin" className="-ml-2 mb-1 inline-flex h-8 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
          Console
        </a>
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">Reported reviews</h1>
            <p className="mt-0.5 text-[13px] text-[#9b9ba6]">Hidden when a seller reports them. Restore or keep hidden; nothing is deleted.</p>
          </div>
          <Filters
            label="Reports"
            value={state}
            onChange={setState}
            options={[
              { id: "open", label: "Waiting" },
              { id: "resolved", label: "Decided" },
            ]}
          />
        </div>

        {note ? (
          <div className="mb-4">
            <Banner tone={note.tone} onClose={() => setNote(null)}>
              {note.text}
            </Banner>
          </div>
        ) : null}

        {reports === null ? (
          <Placeholder rows={4} />
        ) : reports.length === 0 ? (
          <p className="rounded-[10px] border border-white/[0.06] px-4 py-8 text-center text-[13px] text-[#6b6b76]">{state === "open" ? "No reports waiting." : "No decided reports yet."}</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <Panel
                key={r.id}
                title={r.product?.title || "A deleted product"}
                meta={`${r.review ? `${r.review.rating} of 5 by ${r.review.author}` : "Review deleted by its author"} · reported ${when(r.reportedAt)}${r.seller ? ` by ${r.seller}` : ""}`}
              >
                <div className="px-4 py-3">
                  {r.review ? <p className="whitespace-pre-line text-[14px] leading-relaxed text-[#ededf0] [overflow-wrap:anywhere]">{r.review.content}</p> : null}
                  <p className="mt-3 text-[13px] text-[#9b9ba6]">
                    <span className="text-[#c9c9d1]">Reason:</span> {r.reason}
                    {r.note ? <span className="block">Seller&apos;s note: {r.note}</span> : null}
                  </p>
                  {state === "open" && r.review ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="primary" disabled={busy === r.id} onClick={() => decide(r, "restore")}>
                        Restore
                      </Button>
                      <Button disabled={busy === r.id} onClick={() => decide(r, "keep_hidden")}>
                        Keep hidden
                      </Button>
                    </div>
                  ) : r.resolvedAt ? (
                    <p className="mt-2 text-[12px] text-[#6b6b76]">
                      {r.resolution === "restored" ? "Restored" : "Kept hidden"} {when(r.resolvedAt)}
                    </p>
                  ) : null}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
