"use client"

import * as React from "react"

import type { SeoConsoleData } from "@/lib/admin/seo/console-data"
import type { CrawlReports, RobotsReport, SitemapFileReport } from "@/lib/admin/seo/crawl"
import type { ConflictGroup, CoverageView } from "@/lib/admin/seo/insights"
import type { SearchPerformance, SearchRow } from "@/lib/admin/seo/search-analytics"

import { ago, date, num } from "../_console/format"
import { Button, DataList, Figures, Panel, Status, cx } from "../_console/ui"

/**
 * The panels round 45 adds to /admin/seo: crawlability (robots.txt and the
 * sitemap files, read live), sitemap conflicts, Google's answers by coverage
 * state, Search Console performance and Bing. Every figure says where it
 * came from and when it was read.
 */

/* ── Where a number came from ──────────────────────────────────────────── */

export const fromGoogle = (at: string | null | undefined) => (at ? `Google, read ${ago(at)}` : "Google, not read yet")
export const fromOwnCheck = (at: string | null | undefined) => (at ? `Storelib's own check, ${ago(at)}` : "Storelib's own check, not run yet")
export const fromDatabase = (at: string) => `Storelib's records, read ${ago(at)}`
export const fromBing = (at: string | null | undefined) => (at ? `Bing, read ${ago(at)}` : "Bing, not read yet")

const pathOf = (url: string) => url.replace(/^https?:\/\//, "")
const linkClass = "underline decoration-white/20 underline-offset-2 hover:decoration-white/60"
const pct = (v: number) => `${(v * 100).toFixed(1)}%`

/* ── Search Console performance ────────────────────────────────────────── */

export const GENERATIVE_AI_REPORT_POST = "https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports"
export const AI_FEATURES_DOC = "https://developers.google.com/search/docs/appearance/ai-features"
export const SEARCH_CONSOLE_HOME = "https://search.google.com/search-console"

function AiNote() {
  return (
    <p className="border-t border-white/[0.06] px-4 py-3 text-[12px] leading-5 text-[#9b9ba6]" data-ai-overviews-note>
      AI Overviews and AI Mode are counted inside the Web search type here: Google{" "}
      <a href={AI_FEATURES_DOC} target="_blank" rel="noreferrer" className={linkClass}>
        reports them within Web
      </a>
      , and the Search Analytics API has no generative AI type or dimension (checked October 2026). Search Console&apos;s own{" "}
      <a href={GENERATIVE_AI_REPORT_POST} target="_blank" rel="noreferrer" className={linkClass}>
        Generative AI performance report
      </a>{" "}
      shows impressions in those features, in the{" "}
      <a href={SEARCH_CONSOLE_HOME} target="_blank" rel="noreferrer" className={linkClass}>
        Search Console interface
      </a>{" "}
      only.
    </p>
  )
}

function SearchTable({ label, rows, keyLabel }: { label: string; rows: SearchRow[]; keyLabel: string }) {
  return (
    <DataList
      label={label}
      rows={rows}
      rowKey={(r) => r.key}
      empty="Google has no rows for these 28 days."
      columns={[
        { key: "key", label: keyLabel, width: "minmax(0,3fr)", phone: "primary", render: (r) => <span title={r.key}>{keyLabel === "Page" ? pathOf(r.key) : r.key}</span> },
        { key: "clicks", label: "Clicks", width: "72px", align: "right", phone: "end", render: (r) => num(r.clicks) },
        { key: "impressions", label: "Impressions", width: "100px", align: "right", phone: "secondary", render: (r) => <span>{num(r.impressions)}<span className="lg:hidden"> impressions</span></span> },
        { key: "ctr", label: "CTR", width: "64px", align: "right", phone: "secondary", render: (r) => <span>{pct(r.ctr)}<span className="lg:hidden"> CTR</span></span> },
        { key: "position", label: "Position", width: "72px", align: "right", phone: "secondary", render: (r) => <span><span className="lg:hidden">position </span>{r.position.toFixed(1)}</span> },
      ]}
    />
  )
}

export function SearchPerformancePanel({ connected, search }: { connected: boolean; search: SearchPerformance[] | null }) {
  const [tab, setTab] = React.useState<"page" | "query">("page")
  if (!connected) {
    return (
      <Panel title="Search performance" meta="Needs Search Console">
        <p className="px-4 py-3 text-[13px] text-[#9b9ba6]">Clicks, impressions, CTR and position come from the same Search Console connection as the indexing figures. Connect it above to see them.</p>
        <AiNote />
      </Panel>
    )
  }
  return (
    <>
      {(search ?? []).map((s, i, all) => (
        <Panel key={s.property} title={`Search performance, ${s.property}`} meta={`Web, ${date(`${s.startDate}T12:00:00Z`)} to ${date(`${s.endDate}T12:00:00Z`)}. ${fromGoogle(s.readAt)}`}>
          {s.error ? (
            <p className="px-4 py-3 text-[13px] text-[#d4a72c]" role="status">
              {s.error}
            </p>
          ) : (
            <div data-search-performance={s.property}>
              <div className="p-3">
                <Figures
                  columns={4}
                  items={[
                    { label: "Clicks", value: num(s.totals?.clicks ?? 0), source: fromGoogle(s.readAt) },
                    { label: "Impressions", value: num(s.totals?.impressions ?? 0), source: fromGoogle(s.readAt) },
                    { label: "CTR", value: pct(s.totals?.ctr ?? 0), source: fromGoogle(s.readAt) },
                    { label: "Average position", value: (s.totals?.position ?? 0).toFixed(1), source: fromGoogle(s.readAt) },
                  ]}
                />
              </div>
              <div className="flex gap-1 border-t border-white/[0.06] px-4 py-2" role="group" aria-label="Group by">
                {(["page", "query"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={tab === t}
                    onClick={() => setTab(t)}
                    className={cx("h-8 rounded-[7px] px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70", tab === t ? "bg-white/[0.08] text-[#ededf0]" : "text-[#9b9ba6] hover:text-[#ededf0]")}
                  >
                    {t === "page" ? "Top pages" : "Top queries"}
                  </button>
                ))}
              </div>
              {tab === "page" ? <SearchTable label="Top pages" rows={s.pages} keyLabel="Page" /> : <SearchTable label="Top queries" rows={s.queries} keyLabel="Query" />}
            </div>
          )}
          {i === all.length - 1 ? <AiNote /> : null}
        </Panel>
      ))}
    </>
  )
}

/* ── Bing and site verification ────────────────────────────────────────── */

export const BING_AI_PERFORMANCE = "https://www.bing.com/webmasters/aiperformance"

export function BingPanel({ bing, verification }: { bing: SeoConsoleData["bing"]; verification: SeoConsoleData["verification"] }) {
  const s = bing.stats
  return (
    <Panel title="Bing Webmaster Tools" meta={bing.connected ? (s ? fromBing(s.readAt) : "Connected") : "Not connected"}>
      <div data-bing={bing.connected ? "connected" : "not_connected"}>
        {bing.connected && s && !s.error ? (
          <div className="p-3">
            <Figures
              columns={2}
              items={[
                { label: "Clicks, 28 days", value: num(s.clicks), sub: s.from && s.to ? `${date(`${s.from}T12:00:00Z`)} to ${date(`${s.to}T12:00:00Z`)}` : "No days answered", source: fromBing(s.readAt) },
                { label: "Impressions, 28 days", value: num(s.impressions), sub: "Every Bing vertical, chat included", source: fromBing(s.readAt) },
              ]}
            />
          </div>
        ) : null}
        {bing.connected && s?.error ? (
          <p className="px-4 py-3 text-[13px] text-[#d4a72c]" role="status">
            {s.error}
          </p>
        ) : null}
        {!bing.connected ? (
          <ol className="list-decimal space-y-1 px-4 py-3 pl-9 text-[13px] leading-5 text-[#9b9ba6]">
            <li>
              In Bing Webmaster Tools, add storelib.com. To verify with a meta tag, set <span className="font-mono text-[12px] text-[#ededf0]">BING_SITE_VERIFICATION</span> in Vercel to the content of the msvalidate.01 tag Bing gives, and redeploy. Importing the site from Google Search Console verifies it too.
            </li>
            <li>
              In Bing Webmaster Tools, Settings, API access, make an API key and set <span className="font-mono text-[12px] text-[#ededf0]">BING_WEBMASTER_API_KEY</span> to it.
            </li>
          </ol>
        ) : null}
        <div className="space-y-1 border-t border-white/[0.06] px-4 py-3 text-[12px] leading-5 text-[#9b9ba6]">
          <p data-verification>
            Site verification tags: Google {verification.google ? <Status value="ok" label="set" /> : <Status value="plain" label="not set" />}, Bing {verification.bing ? <Status value="ok" label="set" /> : <Status value="plain" label="not set" />}. Read from GOOGLE_SITE_VERIFICATION and BING_SITE_VERIFICATION; only whether each is set is shown.
          </p>
          <p>
            Copilot citations are in Bing&apos;s{" "}
            <a href={BING_AI_PERFORMANCE} target="_blank" rel="noreferrer" className={linkClass}>
              AI Performance report
            </a>
            , in the Bing Webmaster Tools dashboard only. Bing has documented no API for it (checked October 2026), so no figure is shown here.
          </p>
        </div>
      </div>
    </Panel>
  )
}

/* ── Crawlability ──────────────────────────────────────────────────────── */

function RobotsTable({ report, checkedAt }: { report: RobotsReport; checkedAt: string }) {
  const crawlers = report.paths[0]?.verdicts.map((v) => v.crawler) ?? []
  return (
    <div data-robots>
      <p className="px-4 pt-3 text-[12px] text-[#9b9ba6]">
        <a href={report.url} target="_blank" rel="noreferrer" className={linkClass}>
          {pathOf(report.url)}
        </a>{" "}
        answered {report.status || "nothing"} in {num(report.ms)} ms. {fromOwnCheck(checkedAt)}.
      </p>
      {report.notes.map((n) => (
        <p key={n} className="px-4 pt-1 text-[12px] text-[#d4a72c]">
          {n}
        </p>
      ))}
      <div className="overflow-x-auto px-4 py-3">
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          <caption className="sr-only">Whether each crawler may fetch each page, by robots.txt</caption>
          <thead>
            <tr className="text-[12px] text-[#9b9ba6]">
              <th scope="col" className="w-[34%] py-1.5 pr-2 font-medium">
                Page
              </th>
              {crawlers.map((c) => (
                <th key={c} scope="col" className="truncate py-1.5 pr-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.paths.map((p) => (
              <tr key={p.path} className="border-t border-white/[0.06]">
                <th scope="row" className="py-2 pr-3 font-normal">
                  <span className="block text-[#ededf0]">{p.label}</span>
                  <span className="block truncate font-mono text-[11px] text-[#6b6b76]" title={p.path}>
                    {p.path}
                  </span>
                </th>
                {p.verdicts.map((v) => (
                  <td key={v.crawler} className="py-2 pr-2 align-top" title={v.rule ?? "No rule matches: allowed"}>
                    <Status value={v.allowed ? "ok" : "failed"} label={v.allowed ? "Allowed" : "Blocked"} />
                    <span className="hidden truncate text-[11px] text-[#6b6b76] sm:block">{v.rule ?? (v.group ? `No rule in ${v.group === "*" ? "the * group" : v.group}` : "No group")}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SitemapFiles({ crawl }: { crawl: NonNullable<CrawlReports["sitemaps"]> }) {
  const r = crawl.report
  const nameOf = (url: string) => pathOf(url).replace(/^[^/]+\/sitemap\//, "")
  return (
    <div data-sitemap-files>
      <p className="border-t border-white/[0.08] px-4 pb-1 pt-3 text-[13px] font-semibold">Sitemap files</p>
      <p className="px-4 text-[12px] text-[#9b9ba6]">
        {r.indexes.map((i) => `${pathOf(i.url)}: ${i.error ? i.error : `${num(i.files)} ${i.files === 1 ? "file" : "files"}`}`).join(". ")}. {fromOwnCheck(crawl.checkedAt)}.
        {r.skipped ? ` ${num(r.skipped)} files were not reached in this check's time.` : ""}
      </p>
      <DataList
        label="Sitemap files"
        rows={r.files}
        rowKey={(f) => f.url}
        empty="No sitemap file was read."
        columns={[
          { key: "file", label: "File", width: "minmax(0,2fr)", phone: "primary", render: (f) => <a href={f.url} target="_blank" rel="noreferrer" title={f.url} className={linkClass}>{nameOf(f.url)}</a> },
          { key: "status", label: "HTTP", width: "70px", phone: "secondary", render: (f) => <Status value={f.status === 200 && !f.error ? "ok" : "failed"} label={f.status ? String(f.status) : "None"} /> },
          { key: "urls", label: "Addresses", width: "96px", align: "right", phone: "end", render: (f) => (f.urls === null ? <span className="text-[#6b6b76]">{f.error ?? "None"}</span> : num(f.urls)) },
          { key: "ms", label: "Fetch time", width: "90px", align: "right", phone: "secondary", render: (f) => `${num(f.ms)} ms` },
          { key: "invalid", label: "Invalid", width: "minmax(0,1.6fr)", phone: "secondary", render: (f) => (f.invalidCount ? <InvalidList file={f} /> : <span className="text-[#6b6b76]">No invalid entries</span>) },
        ]}
      />
    </div>
  )
}

function InvalidList({ file }: { file: SitemapFileReport }) {
  return (
    <span className="block min-w-0 whitespace-normal text-[12px] text-[#d4a72c]">
      {num(file.invalidCount)}: {file.invalid.map((i) => `${i.reason}${i.loc ? ` (${pathOf(i.loc).slice(0, 60)})` : ""}`).join("; ")}
    </span>
  )
}

export function CrawlPanel({ initial }: { initial: CrawlReports | null }) {
  const [crawl, setCrawl] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  React.useEffect(() => setCrawl(initial), [initial])
  const run = async () => {
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/admin/seo/crawl", { method: "POST", cache: "no-store" })
      const json = (await res.json().catch(() => ({}))) as CrawlReports & { error?: string }
      if (!res.ok) throw new Error(res.status === 401 ? "Your admin session expired. Sign in again." : json.error || "The check did not finish.")
      setCrawl(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check did not finish.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel
      title="Crawlability"
      meta={crawl?.robots ? fromOwnCheck(crawl.robots.checkedAt) : "Not checked yet"}
      action={
        <Button onClick={() => void run()} disabled={busy} data-crawl-check>
          {busy ? "Checking…" : "Check crawlability"}
        </Button>
      }
    >
      <div data-crawl>
        <p className="px-4 pt-3 text-[12px] leading-5 text-[#9b9ba6]">
          storelib.com&apos;s live robots.txt, read the way Google documents it, for Googlebot, Bingbot and OAI-SearchBot (ChatGPT search), and every sitemap file the index names. The cron checks again every six hours; the button checks now.
        </p>
        {error ? (
          <p className="px-4 pt-2 text-[13px] text-[#f47067]" role="alert">
            {error}
          </p>
        ) : null}
        {crawl?.missingTable ? <p className="px-4 pt-2 text-[12px] text-[#d4a72c]">Reports are not kept until 346_account_attribution.sql has run; this one is shown until the page reloads.</p> : null}
        {crawl?.robots ? <RobotsTable report={crawl.robots.report} checkedAt={crawl.robots.checkedAt} /> : <p className="px-4 py-3 text-[13px] text-[#6b6b76]">Not checked yet.</p>}
        {crawl?.sitemaps ? <SitemapFiles crawl={crawl.sitemaps} /> : null}
      </div>
    </Panel>
  )
}

/* ── Sitemap conflicts ─────────────────────────────────────────────────── */

export function ConflictsPanel({ conflicts, scoredAt }: { conflicts: ConflictGroup[] | null; scoredAt: string | null }) {
  const [open, setOpen] = React.useState<string | null>(null)
  if (!conflicts) return null
  const total = conflicts.reduce((n, c) => n + c.count, 0)
  return (
    <Panel title="Sitemap conflicts" meta={`${num(total)} listed addresses. ${fromOwnCheck(scoredAt)}`}>
      <div data-conflicts>
        <p className="px-4 pt-3 text-[12px] leading-5 text-[#9b9ba6]">
          Addresses the sitemaps list whose live page, when Storelib last fetched it, does not answer 200, says noindex, or names another address as canonical. A sitemap should list only pages that can be indexed as they are. The cron fetches ten pages at a time with a ten second limit, oldest first.
        </p>
        <ul className="divide-y divide-white/[0.06]">
          {conflicts.map((g) => (
            <li key={g.kind} data-conflict={g.kind}>
              <button
                type="button"
                aria-expanded={open === g.kind}
                onClick={() => setOpen(open === g.kind ? null : g.kind)}
                disabled={!g.sample.length}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] outline-none hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]/70 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span>
                  <Status value={g.count ? "failed" : "ok"} label={g.label} />
                </span>
                <span className="tabular-nums text-[#ededf0]">{num(g.count)}</span>
              </button>
              {open === g.kind ? (
                <ul className="pb-2">
                  {g.sample.map((r) => (
                    <li key={r.url} className="min-w-0 px-4 py-1.5 text-[12px]">
                      <a href={r.url} target="_blank" rel="noreferrer" className={cx("block break-all text-[#ededf0]", linkClass)}>
                        {pathOf(r.url)}
                      </a>
                      <span className="block text-[#9b9ba6]">
                        {r.found}. {fromOwnCheck(r.scoredAt)}
                      </span>
                    </li>
                  ))}
                  {g.count > g.sample.length ? <li className="px-4 py-1 text-[12px] text-[#6b6b76]">The newest {num(g.sample.length)} of {num(g.count)}.</li> : null}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

/* ── Indexing issues ───────────────────────────────────────────────────── */

export function CoveragePanel({ coverage, connected }: { coverage: CoverageView | null; connected: boolean }) {
  if (!coverage) return null
  const newest = coverage.groups.reduce<string | null>((m, g) => (g.newestAnswer && (!m || g.newestAnswer > m) ? g.newestAnswer : m), null)
  return (
    <Panel title="Indexing issues" meta={coverage.groups.length ? fromGoogle(newest) : "No answers from Google yet"}>
      <div data-coverage>
        <p className="px-4 pt-3 text-[12px] leading-5 text-[#9b9ba6]">
          Google&apos;s own answers from the URL Inspection API, by coverage state. An address Google has not answered for is in no row.
          {coverage.basis === "sample" ? " Counted from the newest 5,000 answers until 346_account_attribution.sql has run." : ""}
        </p>
        <DataList
          label="Coverage states"
          rows={coverage.groups}
          rowKey={(g) => `${g.googleStatus}|${g.coverageState}`}
          empty={connected ? "Google has not answered for any listed address yet." : "Search Console is not connected, so Google has not been asked."}
          columns={[
            { key: "state", label: "Coverage state, as Google said it", width: "minmax(0,3fr)", phone: "primary", render: (g) => <Status value={g.googleStatus === "indexed" ? "ok" : "failed"} label={g.coverageState} /> },
            { key: "n", label: "Addresses", width: "96px", align: "right", phone: "end", render: (g) => num(g.addresses) },
            { key: "at", label: "Newest answer", width: "120px", align: "right", phone: "secondary", render: (g) => (g.newestAnswer ? ago(g.newestAnswer) : "") },
          ]}
        />
      </div>
    </Panel>
  )
}
