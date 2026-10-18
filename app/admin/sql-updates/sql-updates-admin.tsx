"use client"

import * as React from "react"
import type { SqlUpdate, SqlUpdatesReport } from "@/lib/admin/sql-updates"
import { Banner, Button, Filters, Panel, SearchField } from "../_console/ui"

const labels: Record<SqlUpdate["state"], string> = { applied: "Recorded as applied", unrecorded: "No execution record", changed: "Changed since execution", unknown: "History unavailable", manual: "Separate review" }
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "Not available"
const field = "h-9 rounded-[8px] border border-white/10 bg-[#111116] px-3 text-[13px]"

export function SqlUpdatesAdmin() {
  const [report, setReport] = React.useState<SqlUpdatesReport | null>(null)
  const [error, setError] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [view, setView] = React.useState("attention")
  const [search, setSearch] = React.useState("")
  const [days, setDays] = React.useState("all")
  const [selected, setSelected] = React.useState<string[]>([])
  const [sql, setSql] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const active = React.useRef<AbortController | null>(null)
  const seenRevision = React.useRef<string | null>(null)
  const refresh = React.useCallback(async () => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch("/api/admin/sql-updates", { cache: "no-store", signal: controller.signal })
      if (!response.ok) throw new Error(response.status === 401 ? "Your admin session expired. Sign in again." : "Could not refresh SQL history.")
      const next: SqlUpdatesReport = await response.json()
      if (seenRevision.current !== null && seenRevision.current !== next.revision) {
        setSelected([]); setSql(""); setMessage("SQL source changed in a new deployment. Review and select the updated files again.")
      }
      seenRevision.current = next.revision
      setReport(next)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh SQL history.")
    } finally { clearTimeout(timeout); active.current = null }
  }, [])
  React.useEffect(() => {
    void refresh()
    const poll = () => { if (document.visibilityState === "visible") void refresh() }
    const timer = setInterval(poll, 15000)
    window.addEventListener("focus", poll)
    document.addEventListener("visibilitychange", poll)
    return () => { clearInterval(timer); active.current?.abort(); window.removeEventListener("focus", poll); document.removeEventListener("visibilitychange", poll) }
  }, [refresh])

  const rows = (report?.updates ?? []).filter(row => {
    const stateMatches = view === "all" || (view === "attention" ? row.state !== "applied" && !row.manual : view === "manual" ? row.manual : row.state === "applied")
    const inWindow = days === "all" || (row.updatedAt !== null && Date.parse(row.updatedAt) >= Date.now() - Number(days) * 86400000)
    return stateMatches && inWindow && row.file.toLowerCase().includes(search.toLowerCase())
  })
  const toggle = (id: string) => { setSelected(old => old.includes(id) ? old.filter(value => value !== id) : [...old, id]); setSql(""); setMessage("") }
  const query = `/api/admin/sql-updates?revision=${report?.revision ?? ""}&files=${encodeURIComponent(selected.join(","))}`
  const prepare = async () => {
    setBusy(true); setMessage(""); setSql("")
    try {
      const response = await fetch(query, { cache: "no-store" })
      if (!response.ok) throw new Error(response.status === 409 ? "SQL source changed. Refresh history and select the updated files again." : "Could not prepare SQL. Copy separate-review files individually and check your admin session.")
      const text = await response.text()
      setSql(text)
      try { await navigator.clipboard.writeText(text); setMessage("SQL copied. Review it in the Supabase SQL editor before running. Copying does not mark it as applied.") }
      catch { setMessage("Clipboard unavailable. Select and copy the full SQL below, or download it.") }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not prepare SQL.") }
    finally { setBusy(false) }
  }

  return <main className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [font-family:Inter,system-ui,sans-serif]">
    <div className="mx-auto max-w-[1120px] space-y-4 px-4 pb-16 pt-6 sm:px-6">
      <a href="/admin" className="text-[13px] text-[#9b9ba6] hover:text-white">Console</a>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-[22px] font-semibold">SQL updates</h1><p className="mt-1 text-[13px] text-[#9b9ba6]">Canonical database updates in this deployment, compared with this database’s execution record.</p></div>
        <Button onClick={() => void refresh()}>Refresh history</Button>
      </header>
      <Panel title="What this page can confirm">
        <div className="space-y-2 p-4 text-[13px] leading-5 text-[#9b9ba6]">
          <p>An exact file and SHA-256 match confirms a recorded execution. No record does not prove SQL was never run manually. A changed file needs review before it is run again.</p>
          <p>Copy selected updates, review dependencies, then run them in the Supabase SQL editor. Completion is recorded only when the whole transaction succeeds.</p>
          <details><summary className="cursor-pointer text-[#ededf0]">Execution safety and refresh details</summary><div className="mt-2 space-y-2">
            <p>Batches run in part-number order. On an error, do not run COMMIT; roll back and fix the cause. Remote SQL execution is deliberately disabled.</p>
            <p>Owner-only storage SQL, checks, and payment setup need separate review. Historical copies, generated bundles, and schema snapshots are not additional pending migrations.</p>
            <p>Checks every 15 seconds while visible and when you return. New files appear after a deployment. Dates describe the latest source commit, not when SQL ran.</p>
          </div></details>
        </div>
      </Panel>
      {error && <Banner tone="bad">{error} Previously loaded history may be stale.</Banner>}
      {report && !report.ledgerReady && <Banner tone="plain">Execution history could not be read. Nothing is assumed pending or applied. A tracked export includes the part 67 history bootstrap; database credentials and permissions must also be configured.</Banner>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filters label="SQL status" value={view} onChange={setView} options={[{ id: "attention", label: "Needs review" }, { id: "applied", label: "Applied" }, { id: "manual", label: "Separate review" }, { id: "all", label: "All SQL" }]} />
        <label className="text-[13px] text-[#9b9ba6]">Source timeframe <select className={`${field} ml-2`} value={days} onChange={event => setDays(event.target.value)}><option value="all">All dates</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-auto sm:min-w-48 sm:flex-1"><SearchField value={search} onChange={setSearch} label="Search SQL files" placeholder="Search files…" /></div>
        <Button disabled={!rows.some(row => !row.manual)} onClick={() => { setSelected(rows.filter(row => !row.manual).map(row => row.id)); setSql("") }}>Select visible updates</Button>
        <Button disabled={!selected.length} onClick={() => { setSelected([]); setSql("") }}>Clear ({selected.length})</Button>
        <Button variant="primary" disabled={!selected.length || busy} onClick={() => void prepare()}>{busy ? "Preparing…" : "Copy full SQL"}</Button>
        {selected.length > 0 && <a href={query} className="text-[13px] underline underline-offset-4">Download SQL</a>}
      </div>
      {message && <div role="status"><Banner>{message}</Banner></div>}
      {sql && <Panel title="Full SQL for review"><textarea aria-label="Full selected SQL" readOnly value={sql} className="h-72 w-full resize-y bg-transparent p-4 font-mono text-[12px] outline-none focus:ring-2 focus:ring-[#8b5cf6]" /></Panel>}
      <Panel title={`${rows.length} files`} meta={report ? `History checked ${date(report.checkedAt)}` : "Loading history…"}>
        {rows.map(row => <div key={row.id} className="border-b border-white/[0.08] p-4 last:border-b-0">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#8b5cf6]" />
            <span className="min-w-0 flex-1 space-y-1 text-[13px]">
              <span className="block break-words font-medium">{row.file}</span>
              <span className={`block ${row.state === "applied" ? "text-[#3fb950]" : "text-[#d4a72c]"}`}>{labels[row.state]}</span>
              <span className="block text-[12px] text-[#9b9ba6]">Source changed: {date(row.updatedAt)} · Recorded execution: {date(row.appliedAt)}</span>
              <span className="block break-all font-mono text-[11px] text-[#6b6b76]">SHA-256 {row.sha256}</span>
            </span>
          </label>
        </div>)}
        {report && !rows.length && <p className="p-4 text-[13px] text-[#9b9ba6]">No files match these filters. This does not confirm that unrecorded manual SQL ran.</p>}
      </Panel>
    </div>
  </main>
}
