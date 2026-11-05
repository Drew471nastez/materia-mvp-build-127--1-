"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import type { SeoConsoleData } from "@/lib/admin/seo/console-data"
import { KINDS, KIND_LABEL, type Kind } from "@/lib/admin/seo/plan"
import type { Check } from "@/lib/admin/seo/score"
import type { KindTotals, ListQuery, StatusFilter, StatusRow } from "@/lib/admin/seo/store"

import { ago, date, num } from "../_console/format"
import { Banner, Button, DataList, Facts, Figures, Filters, Pager, Panel, SearchField, Status, cx, type Column } from "../_console/ui"
import { BingPanel, ConflictsPanel, CoveragePanel, CrawlPanel, SearchPerformancePanel, fromDatabase, fromGoogle, fromOwnCheck } from "./seo-panels"

/**
 * /admin/seo on the client: the figures, the kinds, and one page of
 * addresses as the server read them. A filter, a search or a page is a new
 * address bar, which the server reads again; nothing here holds more than
 * the page it was sent. A row opens its checks, and Check now asks Google
 * and the live page for that one address.
 */

const PAGE_SIZE = 50

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "In sitemap" },
  { id: "indexed", label: "On Google" },
  { id: "not_indexed", label: "Not on Google" },
  { id: "not_checked", label: "Not checked" },
  { id: "no_property", label: "Outside Search Console" },
  { id: "error", label: "Google did not answer" },
  { id: "low_score", label: "Score under 70" },
  { id: "left", label: "Left the sitemap" },
]

/** Google's answer as a dot and a few words. Nothing is called indexed that Google did not call indexed. */
export function googleWord(row: Pick<StatusRow, "google_status" | "coverage_state">): { tone: string; label: string } {
  switch (row.google_status) {
    case "indexed":
      return { tone: "ok", label: "On Google" }
    case "not_indexed":
      return { tone: "failed", label: row.coverage_state || "Not on Google" }
    case "no_property":
      return { tone: "plain", label: "Not in Storelib's Search Console" }
    case "error":
      return { tone: "late", label: "Google did not answer" }
    case "unknown":
      return { tone: "plain", label: "Google gave no verdict" }
    default:
      return { tone: "plain", label: "Not checked" }
  }
}

const scoreTone = (s: number | null) => (s === null ? "plain" : s >= 90 ? "ok" : s >= 70 ? "late" : "failed")

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[#6b6b76]">Not scored</span>
  return <Status value={scoreTone(score)} label={String(score)} />
}

const pathOf = (url: string) => url.replace(/^https?:\/\//, "")

export function SeoAdmin({ data }: { data: SeoConsoleData }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = React.useTransition()
  const [search, setSearch] = React.useState(data.query.q)
  const [open, setOpen] = React.useState<StatusRow | null>(null)

  const go = React.useCallback(
    (next: Partial<ListQuery>) => {
      const q = { ...data.query, page: 1, ...next }
      const p = new URLSearchParams()
      if (q.kind !== "all") p.set("kind", q.kind)
      if (q.status !== "all") p.set("status", q.status)
      if (q.q) p.set("q", q.q)
      if (q.page > 1) p.set("page", String(q.page))
      const s = p.toString()
      startTransition(() => router.push(`${pathname}${s ? `?${s}` : ""}`, { scroll: false }))
    },
    [data.query, pathname, router],
  )

  /* Search waits for a pause in typing. */
  React.useEffect(() => {
    if (search.trim() === data.query.q) return
    const t = setTimeout(() => go({ q: search.trim() }), 350)
    return () => clearTimeout(t)
  }, [search, data.query.q, go])

  /* Fresh figures every minute while the tab is in view: the cron and Check now change them. */
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh())
    }
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [router])

  const all = sumOf(data.totals)
  const used = Object.entries(data.google.usedToday)
  const columns: Column<StatusRow>[] = [
    { key: "kind", label: "Kind", width: "112px", phone: "secondary", render: (r) => KIND_LABEL[r.kind] ?? r.kind },
    { key: "url", label: "Address", width: "minmax(0,3fr)", phone: "primary", render: (r) => <span title={r.url}>{pathOf(r.url)}</span> },
    {
      key: "published",
      label: "Published",
      width: "120px",
      phone: "secondary",
      render: (r) => (r.in_sitemap ? <Status value="ok" label="In sitemap" /> : <Status value="plain" label={`Left ${date(r.left_sitemap_at)}`} />),
    },
    {
      key: "google",
      label: "Google",
      width: "minmax(0,1.6fr)",
      phone: "secondary",
      render: (r) => {
        const g = googleWord(r)
        return <Status value={g.tone} label={g.label} />
      },
    },
    { key: "crawl", label: "Last crawl", width: "96px", phone: "hide", render: (r) => (r.last_crawl_time ? ago(r.last_crawl_time) : <span className="text-[#6b6b76]">None known</span>) },
    { key: "score", label: "Score", width: "84px", align: "right", phone: "end", render: (r) => <ScoreCell score={r.score} /> },
  ]

  return (
    <main className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [font-family:Inter,system-ui,sans-serif] [color-scheme:dark]" data-seo-admin>
      <div aria-hidden className={cx("fixed inset-x-0 top-0 z-50 h-[2px] bg-[#8b5cf6] transition-opacity duration-300", pending ? "opacity-100" : "opacity-0")} />
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <a href="/admin" className="text-[13px] text-[#9b9ba6] hover:text-white">
          Console
        </a>
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-[-0.015em]">SEO status</h1>
            <p className="mt-1 text-[13px] text-[#9b9ba6]">Every address in Storelib&apos;s sitemaps, what Google last said about it, and a score from the live page.</p>
          </div>
          <Button onClick={() => startTransition(() => router.refresh())} disabled={pending}>
            Refresh
          </Button>
        </header>

        {!data.schemaReady ? (
          <Banner tone="bad">
            The SEO tables are not in the database yet. Run <span className="font-mono text-[12px]">342_seo_index_status.sql</span> from{" "}
            <a href="/admin/sql-updates" className="underline underline-offset-2">
              SQL updates
            </a>
            , then the cron fills the inventory within ten minutes.
          </Banner>
        ) : null}

        {data.problems.map((p) => (
          <Banner key={p} tone="bad">
            {p}
          </Banner>
        ))}

        <GooglePanel google={data.google} used={used} />

        <SearchPerformancePanel connected={data.google.connected} search={data.search} />

        {data.schemaReady ? (
          <>
            <Figures
              columns={3}
              items={[
                { label: "In sitemap", value: num(all.in_sitemap), sub: all.listed > all.in_sitemap ? `${num(all.listed - all.in_sitemap)} left the sitemap` : "Every listed address", source: fromDatabase(data.readAt) },
                { label: "Answers 200", value: num(all.answers_200), sub: `of ${num(all.scored)} fetched`, source: fromOwnCheck(data.newest.scored) },
                { label: "Average score", value: all.average_score === null ? "None yet" : String(all.average_score), sub: `${num(all.scored)} scored`, source: fromOwnCheck(data.newest.scored) },
                { label: "On Google", value: num(all.indexed), sub: "Google's verdict PASS", source: fromGoogle(data.newest.google) },
                { label: "Not on Google", value: num(all.not_indexed), sub: "Excluded or failed", source: fromGoogle(data.newest.google) },
                { label: "Not checked", value: num(all.not_checked), sub: all.no_property ? `${num(all.no_property)} outside Search Console` : "With Google yet", source: fromDatabase(data.readAt) },
              ]}
            />

            <CoveragePanel coverage={data.coverage} connected={data.google.connected} />

            <ConflictsPanel conflicts={data.conflicts} scoredAt={data.newest.scored} />

            <KindTable rows={data.totals} current={data.query.kind} onPick={(kind) => go({ kind })} />

            <SyncLine sync={data.sync} />

            <Panel title="Addresses" meta={pending ? "Loading…" : `${num(data.list.total)} match`}>
              <div className="space-y-2 border-b border-white/[0.08] px-4 py-3">
                <Filters label="Status" options={STATUS_OPTIONS} value={data.query.status} onChange={(status) => go({ status })} />
                <div className="flex flex-wrap items-center gap-2">
                  <SearchField value={search} onChange={setSearch} label="Search addresses" placeholder="Search addresses…" />
                  <label className="text-[13px] text-[#9b9ba6]">
                    <span className="sr-only">Kind</span>
                    <select
                      value={data.query.kind}
                      onChange={(e) => go({ kind: e.target.value as Kind | "all" })}
                      className="h-10 rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[13px] text-[#ededf0] outline-none focus:border-[#8b5cf6]/70 sm:h-9"
                    >
                      <option value="all">Every kind</option>
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <DataList
                label="Addresses"
                columns={columns}
                rows={data.list.rows}
                rowKey={(r) => r.url}
                onOpen={setOpen}
                empty={data.schemaReady && all.listed === 0 ? "The inventory is empty. The first cron run reads the sitemaps into it." : "No address matches."}
              />
              <Pager page={data.list.page} pages={data.list.pages} total={data.list.total} size={PAGE_SIZE} onPage={(page) => go({ page })} />
            </Panel>
          </>
        ) : null}

        <CrawlPanel initial={data.crawl} />

        <BingPanel bing={data.bing} verification={data.verification} />
      </div>
      <RowSheet
        row={open}
        googleConnected={data.google.connected}
        onClose={() => setOpen(null)}
        onChecked={(row) => {
          setOpen(row)
          startTransition(() => router.refresh())
        }}
      />
    </main>
  )
}

function sumOf(rows: KindTotals[]) {
  const sum = (k: "listed" | "in_sitemap" | "answers_200" | "indexed" | "not_indexed" | "not_checked" | "no_property" | "scored") => rows.reduce((n, r) => n + r[k], 0)
  const scored = sum("scored")
  const weighted = rows.reduce((n, r) => n + (r.average_score ?? 0) * r.scored, 0)
  return {
    listed: sum("listed"),
    in_sitemap: sum("in_sitemap"),
    answers_200: sum("answers_200"),
    indexed: sum("indexed"),
    not_indexed: sum("not_indexed"),
    not_checked: sum("not_checked"),
    no_property: sum("no_property"),
    scored,
    average_score: scored ? Math.round((weighted / scored) * 10) / 10 : null,
  }
}

function GooglePanel({ google, used }: { google: SeoConsoleData["google"]; used: [string, number][] }) {
  if (!google.connected) {
    return (
      <Panel title="Google Search Console is not connected" meta="Indexing is not shown until it is">
        <div className="space-y-2 p-4 text-[13px] leading-5 text-[#9b9ba6]" data-gsc-setup>
          <p>The inventory and the scores below still work. To see what Google has indexed:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>In Google Cloud, turn on the Google Search Console API, create a service account and download a JSON key for it.</li>
            <li>
              In Search Console, add the service account&apos;s email as a user on{" "}
              {google.properties.map((p, i) => (
                <React.Fragment key={p}>
                  {i ? (i === google.properties.length - 1 ? " and " : ", ") : null}
                  <span className="font-mono text-[12px] text-[#ededf0]">{p}</span>
                </React.Fragment>
              ))}
              . Restricted access is enough.
            </li>
            <li>
              In Vercel, set <span className="font-mono text-[12px] text-[#ededf0]">GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL</span> to its email and{" "}
              <span className="font-mono text-[12px] text-[#ededf0]">GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY</span> to the key&apos;s private_key, then redeploy.
            </li>
          </ol>
          <p>Google decides what it indexes. This page reports what Google says; it cannot make a page indexed.</p>
        </div>
      </Panel>
    )
  }
  return (
    <Panel title="Google Search Console" meta="Connected: the service account variables are set">
      <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-[13px] text-[#9b9ba6] tabular-nums">
        {google.properties.map((p) => {
          const n = used.find(([k]) => k === p)?.[1] ?? 0
          return (
            <span key={p}>
              <span className="font-mono text-[12px] text-[#ededf0]">{p}</span> {num(n)} of {num(google.perDay)} inspections today
            </span>
          )
        })}
        <span>{num(google.reserve)} a day kept for Check now. Resets at midnight Pacific.</span>
      </div>
    </Panel>
  )
}

function KindTable({ rows, current, onPick }: { rows: KindTotals[]; current: Kind | "all"; onPick: (k: Kind | "all") => void }) {
  if (!rows.length) return null
  const columns: Column<KindTotals>[] = [
    { key: "kind", label: "Kind", width: "minmax(0,1.4fr)", phone: "primary", render: (r) => <span className={cx(r.kind === current && "font-medium text-[#ededf0]")}>{KIND_LABEL[r.kind] ?? r.kind}</span> },
    { key: "live", label: "In sitemap", width: "minmax(0,1fr)", align: "right", phone: "end", render: (r) => num(r.in_sitemap) },
    { key: "ok", label: "Answers 200", width: "minmax(0,1fr)", align: "right", phone: "hide", render: (r) => num(r.answers_200) },
    { key: "indexed", label: "On Google", width: "minmax(0,1fr)", align: "right", phone: "secondary", render: (r) => <span>{num(r.indexed)}<span className="lg:hidden"> on Google</span></span> },
    { key: "not", label: "Not on Google", width: "minmax(0,1fr)", align: "right", phone: "secondary", render: (r) => <span>{num(r.not_indexed)}<span className="lg:hidden"> not</span></span> },
    { key: "unchecked", label: "Not checked", width: "minmax(0,1fr)", align: "right", phone: "secondary", render: (r) => <span>{num(r.not_checked)}<span className="lg:hidden"> not checked</span></span> },
    { key: "score", label: "Average score", width: "minmax(0,1fr)", align: "right", phone: "secondary", render: (r) => (r.average_score === null ? <span className="text-[#6b6b76]">None</span> : <span>{r.average_score}<span className="lg:hidden"> average</span></span>) },
  ]
  return (
    <Panel title="By kind" meta="Pick one to list it" action={current !== "all" ? <Button variant="quiet" onClick={() => onPick("all")}>Every kind</Button> : undefined}>
      <DataList label="Totals by kind" columns={columns} rows={rows} rowKey={(r) => r.kind} onOpen={(r) => onPick(r.kind)} empty="" />
    </Panel>
  )
}

function SyncLine({ sync }: { sync: SeoConsoleData["sync"] }) {
  if (!sync) return <p className="text-[12px] text-[#6b6b76]">The cron has not run yet. It reads the sitemaps every six hours.</p>
  const files = sync.files.length
  return (
    <p className="text-[12px] text-[#6b6b76] tabular-nums" data-sync>
      Sitemap files read in this pass: {Math.min(sync.next_file, files)} of {files}
      {sync.sweep_started_at ? `, started ${ago(sync.sweep_started_at)}` : ""}
      {sync.sweep_finished_at ? `. Last full pass finished ${ago(sync.sweep_finished_at)}` : ""}
      {sync.last_run_at ? `. Files last read ${ago(sync.last_run_at)}.` : "."}
      {sync.last_error ? <span className="block text-[#d4a72c]">Last run said: {sync.last_error}</span> : null}
    </p>
  )
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y divide-white/[0.06]" data-checks>
      {checks.map((c) => (
        <li key={c.id} className="flex min-w-0 items-baseline gap-3 px-4 py-2 text-[13px]" data-check={c.id} data-state={c.state}>
          <span className="w-[52px] shrink-0">
            <Status value={c.state === "pass" ? "ok" : c.state === "fail" ? "failed" : "plain"} label={c.state === "pass" ? "Pass" : c.state === "fail" ? "Fail" : "Skip"} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[#ededf0]">{c.label}</span>
            <span className="block break-words text-[12px] text-[#9b9ba6]">{c.found}</span>
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-[#6b6b76]">{c.points}</span>
        </li>
      ))}
    </ul>
  )
}

function RowSheet({ row, googleConnected, onClose, onChecked }: { row: StatusRow | null; googleConnected: boolean; onClose: () => void; onChecked: (row: StatusRow) => void }) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [notes, setNotes] = React.useState<string[]>([])
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    const d = ref.current
    if (!d) return
    if (row && !d.open) d.showModal?.()
    if (!row && d.open) d.close()
  }, [row])
  React.useEffect(() => {
    setNotes([])
    setError("")
  }, [row?.url])

  const checkNow = async () => {
    if (!row) return
    setBusy(true)
    setError("")
    setNotes([])
    try {
      const res = await fetch("/api/admin/seo/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: row.url }), cache: "no-store" })
      const json = (await res.json().catch(() => ({}))) as { row?: StatusRow; notes?: string[]; error?: string }
      if (!res.ok || !json.row) throw new Error(res.status === 401 ? "Your admin session expired. Sign in again." : json.error || "The check did not finish.")
      onChecked(json.row)
      setNotes(json.notes ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check did not finish.")
    } finally {
      setBusy(false)
    }
  }

  const g = row ? googleWord(row) : null
  const canonicalsDiffer = !!row?.google_canonical && !!row.user_canonical && row.google_canonical !== row.user_canonical
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label="Address checks"
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-[14px] border border-white/[0.1] bg-[#111116] p-0 text-[#ededf0] backdrop:bg-black/60 sm:m-auto sm:w-[620px] sm:rounded-[12px]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      data-row-sheet
    >
      {row && g ? (
        <div>
          <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[12px] text-[#9b9ba6]">{KIND_LABEL[row.kind] ?? row.kind}</p>
              <a href={row.url} target="_blank" rel="noreferrer" className="block break-all text-[14px] font-medium underline decoration-white/20 underline-offset-2 hover:decoration-white/60">
                {pathOf(row.url)}
              </a>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[22px] font-semibold leading-7 tabular-nums">{row.score ?? "None"}</p>
              <p className="text-[12px] text-[#6b6b76]">{row.scored_at ? `scored ${ago(row.scored_at)}` : "not scored"}</p>
            </div>
          </div>
          {error ? (
            <p className="px-4 pt-3 text-[13px] text-[#f47067]" role="alert">
              {error}
            </p>
          ) : null}
          {notes.map((n) => (
            <p key={n} className="px-4 pt-3 text-[13px] text-[#d4a72c]" role="status">
              {n}
            </p>
          ))}
          <Facts
            items={[
              { label: "Google", value: <Status value={g.tone} label={g.label} /> },
              ...(row.inspect_error ? [{ label: "Google said", value: <span className="whitespace-normal">{row.inspect_error}</span> }] : []),
              { label: "Indexing", value: row.indexing_state ?? "Not known" },
              { label: "robots.txt, as Google read it", value: row.robots_txt_state ?? "Not known" },
              { label: "Fetch, as Google did it", value: row.page_fetch_state ?? "Not known" },
              { label: "Last crawl", value: row.last_crawl_time ? `${date(row.last_crawl_time)}, ${ago(row.last_crawl_time)}` : "None known" },
              { label: "Google's canonical", value: <span title={row.google_canonical ?? ""} className={cx(canonicalsDiffer && "text-[#d4a72c]")}>{row.google_canonical ? pathOf(row.google_canonical) : "Not known"}</span> },
              { label: "Page's canonical", value: <span title={row.user_canonical ?? ""}>{row.user_canonical ? pathOf(row.user_canonical) : "Not known"}</span> },
              { label: "Asked Google", value: row.inspected_at ? ago(row.inspected_at) : "Never" },
              { label: "Search Console property", value: row.property ?? "None" },
              { label: "Sitemap file", value: row.source },
              { label: "In the sitemap", value: row.in_sitemap ? `Since ${date(row.first_seen_at)}` : `Left ${date(row.left_sitemap_at)}` },
            ]}
          />
          {row.inspection_link ? (
            <p className="border-t border-white/[0.06] px-4 py-2 text-[13px]">
              <a href={row.inspection_link} target="_blank" rel="noreferrer" className="underline decoration-white/20 underline-offset-2 hover:decoration-white/60">
                Open in Search Console
              </a>
            </p>
          ) : null}
          <div className="border-t border-white/[0.08]">
            <p className="px-4 pb-1 pt-3 text-[13px] font-semibold">Checks on the live page</p>
            {row.score_error ? <p className="px-4 text-[12px] text-[#d4a72c]">{row.score_error}</p> : null}
            {row.checks?.length ? <CheckList checks={row.checks} /> : <p className="px-4 pb-3 text-[13px] text-[#6b6b76]">Not checked yet.</p>}
          </div>
          <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-white/[0.08] bg-[#111116] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-[#6b6b76]">{googleConnected ? (row.property ? "Check now uses one of today's inspections." : "Only the live page is checked.") : "Google is not connected. Only the live page is checked."}</p>
            <div className="flex gap-2">
              <Button variant="quiet" onClick={onClose} disabled={busy} className="h-10 sm:h-8" autoFocus>
                Close
              </Button>
              <Button variant="primary" onClick={() => void checkNow()} disabled={busy} className="h-10 sm:h-8" data-check-now>
                {busy ? "Checking…" : "Check now"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
