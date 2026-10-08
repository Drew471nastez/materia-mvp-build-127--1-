"use client"

import Link from "next/link"

import type { AiRunRow, AiRunSummary } from "@/lib/admin/ai-runs"
import { KIND_LABELS } from "@/lib/admin/ai-runs"
import { Banner, DataList, Figures, Panel, Status, type Column } from "../_console/ui"

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const secs = (ms: number) => `${Math.round(ms / 100) / 10}s`

export function AiRunsAdmin({
  days,
  choices,
  summary,
  recent,
  problem,
}: {
  days: number
  choices: number[]
  summary: AiRunSummary
  recent: AiRunRow[]
  problem: "missing" | "unreadable" | null
}) {
  const columns: Column<AiRunRow>[] = [
    { key: "when", label: "When", width: "120px", render: (r) => when(r.created_at), phone: "secondary" },
    { key: "kind", label: "Request", width: "minmax(0,1.2fr)", render: (r) => KIND_LABELS[r.intent_kind ?? "unknown"] ?? r.intent_kind, phone: "primary" },
    { key: "status", label: "Result", width: "110px", render: (r) => <Status value={r.status === "succeeded" ? "ok" : r.status === "refused" ? "pending" : "failed"} label={r.status === "succeeded" ? "Finished" : r.status === "refused" ? "Refused" : "Failed"} />, phone: "end" },
    { key: "page", label: "Open page", width: "110px", render: (r) => r.page_key, phone: "hide" },
    { key: "pages", label: "Pages built", width: "minmax(0,1.3fr)", render: (r) => (r.pages_built?.length ? r.pages_built.join(", ") : "none"), phone: "secondary" },
    { key: "ops", label: "Changes", width: "80px", align: "right", render: (r) => `${r.ops_count}${r.wrote_code ? " + code" : ""}`, phone: "hide" },
    { key: "open", label: "Checks left", width: "90px", align: "right", render: (r) => String(r.unresolved?.length ?? 0), phone: "hide" },
    { key: "time", label: "Time", width: "70px", align: "right", render: (r) => secs(r.duration_ms), phone: "hide" },
    { key: "model", label: "Model", width: "minmax(0,1fr)", render: (r) => r.model ?? "", phone: "hide" },
  ]
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 text-[#ededf0] sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-[#6b6b76]">
            <Link href="/admin" className="hover:text-[#c9c9d1]">Admin</Link> / Storelib AI runs
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.01em]">Storelib AI runs</h1>
        </div>
        <nav aria-label="Window" className="flex gap-1">
          {choices.map((d) => (
            <Link
              key={d}
              href={`/admin/ai-runs?days=${d}`}
              aria-current={d === days ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 text-[12px] ${d === days ? "bg-white/[0.1] text-[#ededf0]" : "text-[#9b9ba6] hover:bg-white/[0.05]"}`}
            >
              {d === 1 ? "Day" : `${d} days`}
            </Link>
          ))}
        </nav>
      </div>

      {problem === "missing" ? (
        <Banner tone="bad">The run log is not on this database yet. Run supabase/sql/RUN_STORELIB_AI_BUILDER.sql, then CHECK_STORELIB_AI_BUILDER.sql to confirm.</Banner>
      ) : problem === "unreadable" ? (
        <Banner tone="bad">The run log could not be read just now. Reload in a minute.</Banner>
      ) : null}

      <div className="mt-4 space-y-4">
        <Figures
          columns={4}
          items={[
            { label: "Runs", value: summary.runs, sub: `${summary.succeeded} finished, ${summary.failed} failed` },
            { label: "Finished", value: summary.successRate === null ? "None yet" : `${summary.successRate}%` },
            { label: "Time per run", value: summary.medianSeconds === null ? "None yet" : `${summary.medianSeconds}s`, sub: summary.p90Seconds === null ? undefined : `slowest tenth ${summary.p90Seconds}s` },
            { label: "Whole sites", value: summary.sitesBuilt, sub: summary.pagesPerSiteBuild === null ? "no site builds" : `${summary.pagesPerSiteBuild} other pages each` },
          ]}
        />
        <Figures
          columns={3}
          items={[
            { label: "Ended with a check still failing", value: summary.withOpenChecks },
            { label: "Tokens in", value: summary.tokens.input.toLocaleString("en-GB") },
            { label: "Tokens out", value: summary.tokens.output.toLocaleString("en-GB") },
          ]}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="By kind of request">
            <DataList
              label="Runs by kind of request"
              rowKey={(k) => k.kind}
              empty="No runs in this window."
              rows={summary.byKind}
              columns={[
                { key: "kind", label: "Request", width: "minmax(0,1fr)", render: (k) => KIND_LABELS[k.kind] ?? k.kind, phone: "primary" },
                { key: "runs", label: "Runs", width: "60px", align: "right", render: (k) => String(k.runs), phone: "end" },
                { key: "ok", label: "Finished", width: "80px", align: "right", render: (k) => `${k.successRate}%`, phone: "secondary" },
                { key: "time", label: "Time", width: "70px", align: "right", render: (k) => `${k.medianSeconds}s`, phone: "secondary" },
              ]}
            />
          </Panel>
          <Panel title="Checks still failing when runs ended" meta="the same failure counted once">
            <DataList
              label="Checks still failing"
              rowKey={(c) => c.text}
              empty="None. Every run that changed something ended with its checks passing."
              rows={summary.openChecks}
              columns={[
                { key: "text", label: "Check", width: "minmax(0,1fr)", render: (c) => c.text, phone: "primary" },
                { key: "n", label: "Runs", width: "60px", align: "right", render: (c) => String(c.count), phone: "end" },
              ]}
            />
          </Panel>
        </div>

        <Panel title="Latest runs" meta={`${recent.length} of ${summary.runs}`}>
          <DataList label="Latest runs" rowKey={(r) => String(r.id)} empty="No runs in this window." rows={recent} columns={columns} />
        </Panel>
      </div>
    </main>
  )
}
