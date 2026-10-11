"use client"

import * as React from "react"

import { matchesQuery, searchTextOf, type DocSection, type FactKey, type Place, type Topic } from "@/lib/admin/commerce-docs"
import type { Fact } from "@/lib/admin/commerce-docs-facts"
import type { CommerceStatus, Health, JobStatus } from "@/lib/admin/commerce-status"

import { ago, num } from "../_console/format"
import { Banner, Button, C, Panel, SearchField, cx } from "../_console/ui"

/**
 * ===========================================================================
 *  PHYSICAL COMMERCE, THE OWNER'S PAGE
 * ===========================================================================
 * Top to bottom:
 *
 *   1. The live status, read on open and on Refresh from
 *      /api/admin/commerce-status: the switch, the three jobs, email,
 *      Stripe, the SQL parts and tables, and counts for all of Storelib.
 *      Anything unread says so; nothing is a default.
 *   2. A search over every topic, and the contents as anchors.
 *   3. One panel per area: what it does, where buyers and creators meet it,
 *      where it is kept, how to check it, the lists printed from the code,
 *      the Help Center articles and the files it was written from.
 *
 * Every section and topic has an anchor (#store-details, #checkout-abandoned)
 * so a link can open the page at the one thing it is about.
 */

type HelpLink = { slug: string; title: string }

const HEALTH: Record<Health, { word: string; colour: string }> = {
  ok: { word: "Running", colour: C.good },
  late: { word: "Late", colour: C.wait },
  failed: { word: "Failed", colour: C.bad },
  off: { word: "Off", colour: C.faint },
  unknown: { word: "No record", colour: C.faint },
}

function Dot({ colour }: { colour: string }) {
  return <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colour }} />
}

function Mark({ tone, children }: { tone: "good" | "wait" | "bad" | "plain"; children: React.ReactNode }) {
  const colour = tone === "good" ? C.good : tone === "wait" ? C.wait : tone === "bad" ? C.bad : C.faint
  return (
    <span className="inline-flex min-w-0 items-start gap-1.5 text-[13px] text-[#c9c9d1]">
      <Dot colour={colour} />
      <span className="min-w-0">{children}</span>
    </span>
  )
}

function when(iso: string | null | undefined): string {
  if (!iso) return ""
  const t = new Date(iso)
  return Number.isFinite(t.getTime()) ? `${ago(iso)} (${t.toISOString().slice(0, 16).replace("T", " ")} UTC)` : ""
}

/* ── 1. The live status ─────────────────────────────────────────────────── */

function StatusRow({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 border-t border-white/[0.06] px-4 py-2.5 first:border-t-0 sm:grid-cols-[220px_1fr] sm:gap-4">
      <dt className="text-[13px] text-[#9b9ba6]">{label}</dt>
      <dd className="min-w-0">
        {children}
        {sub ? <div className="mt-0.5 text-[12px] leading-[17px] text-[#6b6b76]">{sub}</div> : null}
      </dd>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/[0.08] first:border-t-0">
      <h3 className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">{title}</h3>
      <dl className="pb-1.5">{children}</dl>
    </div>
  )
}

function JobRow({ job }: { job: JobStatus }) {
  const h = HEALTH[job.health]
  return (
    <div className="border-t border-white/[0.06] px-4 py-3 first:border-t-0" data-job={job.path} data-job-health={job.health}>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-[13px] font-medium text-[#ededf0]">{job.name}</p>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#c9c9d1]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: h.colour }} />
          {h.word}
        </span>
      </div>
      <p className="mt-0.5 break-words font-mono text-[11.5px] text-[#6b6b76]">
        {job.path} · {job.schedule || "no schedule"} (UTC)
      </p>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
        <div className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-[#9b9ba6]">Last run</dt>
          <dd className="min-w-0 text-[#c9c9d1]">{job.lastRun ? when(job.lastRun.startedAt) : "None recorded"}</dd>
        </div>
        <div className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-[#9b9ba6]">Last 24 hours</dt>
          <dd className="min-w-0 tabular-nums text-[#c9c9d1]">
            {job.runs24h === null ? "Could not be read" : `${num(job.runs24h)} ${job.runs24h === 1 ? "run" : "runs"}`}
            {job.failed24h ? <span className="text-[#f47067]">, {num(job.failed24h)} failed</span> : null}
          </dd>
        </div>
        {job.evidence.map((e) => (
          <div key={e.label} className="flex min-w-0 gap-2 sm:col-span-2">
            <dt className="shrink-0 text-[#9b9ba6]">{e.label}</dt>
            <dd className="min-w-0 text-[#c9c9d1]">{[e.value, e.at ? when(e.at) : null].filter(Boolean).join(", ") || "None yet"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[12px] text-[#6b6b76]">{job.note}</p>
    </div>
  )
}

const LiveStatus = React.memo(function LiveStatus() {
  const [status, setStatus] = React.useState<CommerceStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(true)

  const load = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/commerce-status", { cache: "no-store" })
      if (res.status === 401) return window.location.reload()
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) setError(body?.error ?? "The status could not be read.")
      else setStatus(body as CommerceStatus)
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const s = status
  const stripeMode = s ? (s.stripe.secretKey === "live" ? "Live keys" : s.stripe.secretKey === "test" ? "Test keys" : s.stripe.secretKey === "restricted" ? "Restricted key" : s.stripe.secretKey === "missing" ? "Not configured" : "Key not recognised") : ""
  const partsApplied = s ? s.parts.filter((p) => p.state === "applied").length : 0
  const partsOff = s ? s.parts.filter((p) => p.state === "missing" || p.state === "changed") : []
  const tablesMissing = s ? s.tables.filter((t) => t.present === false) : []
  const tablesUnknown = s ? s.tables.filter((t) => t.present === null) : []

  return (
    <Panel
      id="status"
      title="Live status"
      meta={s ? `Read ${ago(s.generatedAt)}, all of Storelib` : busy ? "Reading" : undefined}
      action={
        <Button variant="quiet" className="h-10 sm:h-8" onClick={() => void load()} disabled={busy}>
          {busy ? "Reading" : "Refresh"}
        </Button>
      }
    >
      <div className={cx("transition-opacity duration-200", busy && s && "opacity-60")} aria-busy={busy} data-status={s ? "read" : error ? "error" : "reading"}>
        {error ? (
          <div className="p-4">
            <Banner tone="bad">{error}</Banner>
          </div>
        ) : null}
        {!s && !error ? (
          <div className="space-y-2 p-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-4 rounded bg-white/[0.04]" style={{ width: `${80 - i * 12}%` }} />
            ))}
          </div>
        ) : null}
        {s ? (
          <>
            <Group title="Switch">
              <StatusRow label="Physical commerce" sub={s.physical.source === "env" ? "Set by PHYSICAL_COMMERCE_ENABLED on the server, not by the switch in Health." : s.physical.reason ?? undefined}>
                {s.physical.enabled === null ? <Mark tone="wait">Could not be read</Mark> : s.physical.enabled ? <Mark tone="good">Enabled</Mark> : <Mark tone="plain">Disabled</Mark>}
              </StatusRow>
            </Group>

            <div className="border-t border-white/[0.08]">
              <h3 className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">Scheduled jobs</h3>
              {s.jobs.map((j) => (
                <JobRow key={j.path} job={j} />
              ))}
              {!s.email.cronSecretSet ? <p className="px-4 pb-3 text-[12px] text-[#f47067]">CRON_SECRET is not set: every job refuses to run.</p> : null}
            </div>

            <Group title="Email">
              <StatusRow
                label="Email provider (Mailgun)"
                sub={!s.email.configured ? `Missing: ${[!s.email.keySet && "MAILGUN_API_KEY", !s.email.domainSet && "MAILGUN_DOMAIN"].filter(Boolean).join(", ")}. No customer or seller email goes out.` : `Sender ${s.email.fromSet ? "set by EMAIL_FROM" : "is the default noreply@storelib.com"}. Bounce webhook key ${s.email.webhookKeySet ? "set" : "not set"}.`}
              >
                {s.email.configured ? <Mark tone="good">Configured</Mark> : <Mark tone="bad">Not configured</Mark>}
              </StatusRow>
              <StatusRow label="Last order email sent">{s.email.lastSentAt ? <span className="text-[13px] text-[#c9c9d1]">{when(s.email.lastSentAt)}</span> : <span className="text-[13px] text-[#6b6b76]">No data</span>}</StatusRow>
            </Group>

            <Group title="Stripe">
              <StatusRow
                label="Keys"
                sub={s.stripe.modesMatch === false ? "The secret key and the publishable key are from different modes: payments will fail." : s.stripe.publishableKey === "missing" ? "No publishable key: the payment form cannot load." : undefined}
              >
                <Mark tone={s.stripe.secretKey === "live" ? "good" : s.stripe.secretKey === "test" ? "wait" : "bad"}>{stripeMode}</Mark>
              </StatusRow>
              <StatusRow label="Webhook secrets" sub="STRIPE_WEBHOOK_SECRET for the platform endpoint, STRIPE_CONNECT_WEBHOOK_SECRET for connected accounts.">
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <Mark tone={s.stripe.platformWebhookSecret ? "good" : "bad"}>Platform {s.stripe.platformWebhookSecret ? "set" : "not configured"}</Mark>
                  <Mark tone={s.stripe.connectWebhookSecret ? "good" : "bad"}>Connect {s.stripe.connectWebhookSecret ? "set" : "not configured"}</Mark>
                </span>
              </StatusRow>
              <StatusRow
                label="Webhook endpoint in Stripe"
                sub={
                  s.stripe.endpoint.reason ??
                  (s.stripe.endpoint.allEvents
                    ? `${s.stripe.endpoint.url}: sends every event.`
                    : s.stripe.endpoint.missingEvents.length
                      ? `${s.stripe.endpoint.url}: not subscribed to ${s.stripe.endpoint.missingEvents.join(", ")}.`
                      : `${s.stripe.endpoint.url}: subscribed to every event an order needs.`)
                }
              >
                {!s.stripe.endpoint.asked || (s.stripe.endpoint.reason && !s.stripe.endpoint.url && s.stripe.endpoint.missingEvents.length === 0) ? (
                  <Mark tone="plain">Not checked</Mark>
                ) : !s.stripe.endpoint.url ? (
                  <Mark tone="bad">No endpoint</Mark>
                ) : s.stripe.endpoint.status !== "enabled" ? (
                  <Mark tone="bad">{s.stripe.endpoint.status ?? "Unknown"}</Mark>
                ) : s.stripe.endpoint.missingEvents.length ? (
                  <Mark tone="wait">Enabled, events missing</Mark>
                ) : (
                  <Mark tone="good">Enabled</Mark>
                )}
              </StatusRow>
              <StatusRow
                label="Events reaching Storelib"
                sub={s.stripe.events24h === null ? "The webhook ledger could not be read." : `${num(s.stripe.events24h)} in the last 24 hours${s.stripe.failed24h ? `, ${num(s.stripe.failed24h)} failed to process` : ""}. Last processed ${s.stripe.lastProcessedAt ? ago(s.stripe.lastProcessedAt) : "never"}.`}
              >
                {s.stripe.lastEventAt ? (
                  <Mark tone={Date.now() - new Date(s.stripe.lastEventAt).getTime() < 3 * 86_400_000 ? "good" : "wait"}>Last received {when(s.stripe.lastEventAt)}</Mark>
                ) : (
                  <Mark tone="plain">No data</Mark>
                )}
              </StatusRow>
            </Group>

            <Group title="Database">
              <StatusRow
                label="Commerce SQL parts"
                sub={
                  s.parts.some((p) => p.state === "unknown")
                    ? "There is no record of which parts ran (run-now part 67 first)."
                    : partsOff.length
                      ? `Run in Supabase: ${partsOff.map((p) => `${p.file}${p.state === "changed" ? " (changed since it ran)" : ""}`).join(", ")}.`
                      : "Every part commerce needs has run, as the repository has it."
                }
              >
                <Mark tone={s.parts.some((p) => p.state === "unknown") ? "plain" : partsOff.length ? "bad" : "good"}>
                  {s.parts.some((p) => p.state === "unknown") ? "Not known" : `${partsApplied} of ${s.parts.length} applied`}
                </Mark>
              </StatusRow>
              <StatusRow
                label="Commerce tables"
                sub={tablesMissing.length ? `Missing: ${tablesMissing.map((t) => t.table).join(", ")}.` : tablesUnknown.length ? `Could not check: ${tablesUnknown.map((t) => t.table).join(", ")}.` : "All present."}
              >
                <Mark tone={tablesMissing.length ? "bad" : tablesUnknown.length ? "wait" : "good"}>
                  {s.tables.filter((t) => t.present).length} of {s.tables.length} present
                </Mark>
              </StatusRow>
            </Group>

            <div className="border-t border-white/[0.08]">
              <h3 className="px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">All of Storelib</h3>
              <dl className="grid grid-cols-2 border-t border-white/[0.06] lg:grid-cols-4" data-counts="">
                {s.counts.map((c) => (
                  <div key={c.id} className="min-w-0 border-b border-r border-white/[0.06] px-4 py-3 [margin:0_-1px_-1px_0]" data-count={c.id}>
                    <dt className="text-[12px] leading-4 text-[#9b9ba6]">{c.label}</dt>
                    {c.value === null ? (
                      <dd className="mt-1" data-unreadable="">
                        <p className="text-[13px] font-medium text-[#d4a72c]">Could not be read</p>
                        {c.reason ? <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-4 text-[#6b6b76]">{c.reason}</p> : null}
                      </dd>
                    ) : (
                      <dd className="mt-1 text-[20px] font-semibold tabular-nums leading-7 text-[#ededf0]">{num(c.value)}</dd>
                    )}
                  </div>
                ))}
              </dl>
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  )
})

/* ── 2 and 3. The documentation ─────────────────────────────────────────── */

function PlaceList({ places }: { places: Place[] }) {
  return (
    <ul className="space-y-0.5">
      {places.map((p) => (
        <li key={p.label} className="text-[13px] leading-[19px] text-[#c9c9d1]">
          {p.href ? (
            <a href={p.href} className="text-[#ededf0] underline decoration-white/25 underline-offset-2 hover:decoration-white/70">
              {p.label}
            </a>
          ) : (
            p.label
          )}
        </li>
      ))}
    </ul>
  )
}

function TopicBlock({ section, topic }: { section: DocSection; topic: Topic }) {
  const anchor = `${section.id}-${topic.id}`
  return (
    <article id={anchor} className="group scroll-mt-4 border-t border-white/[0.06] px-4 py-4 first:border-t-0" data-topic={anchor}>
      <h3 className="flex items-baseline gap-2 text-[14px] font-semibold text-[#ededf0]">
        {topic.name}
        <a href={`#${anchor}`} aria-label={`Link to ${topic.name}`} className="text-[12px] font-normal text-[#6b6b76] opacity-0 transition-opacity hover:text-[#ededf0] focus-visible:opacity-100 group-hover:opacity-100">
          #
        </a>
      </h3>
      <p className="mt-1 max-w-[760px] text-[13.5px] leading-[21px] text-[#c9c9d1]">{topic.does}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
        {topic.buyers?.length ? (
          <div className="min-w-0">
            <dt className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">Buyers see it</dt>
            <dd>
              <PlaceList places={topic.buyers} />
            </dd>
          </div>
        ) : null}
        {topic.creators?.length ? (
          <div className="min-w-0">
            <dt className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">Creators set it</dt>
            <dd>
              <PlaceList places={topic.creators} />
            </dd>
          </div>
        ) : null}
        {topic.check?.length ? (
          <div className="min-w-0 md:col-span-2">
            <dt className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">Check it works</dt>
            <dd>
              <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-[19px] text-[#c9c9d1] marker:text-[#6b6b76]">
                {topic.check.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </dd>
          </div>
        ) : null}
        {topic.stored ? (
          <div className="min-w-0 md:col-span-2">
            <dt className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76]">Kept in</dt>
            <dd className="break-words font-mono text-[12px] leading-[18px] text-[#9b9ba6]">{topic.stored}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  )
}

function FactTable({ fact }: { fact: Fact }) {
  return (
    <div className="border-t border-white/[0.06] px-4 py-3" data-fact={fact.key}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h4 className="text-[12.5px] font-semibold text-[#ededf0]">{fact.title}</h4>
        <span className="font-mono text-[11px] text-[#6b6b76]">from {fact.source}</span>
      </div>
      <ul className="mt-2 divide-y divide-white/[0.05] rounded-[8px] border border-white/[0.06]">
        {fact.rows.map((r, i) => (
          <li key={`${r.name}-${i}`} className="grid min-w-0 gap-x-4 gap-y-0.5 px-3 py-2 text-[12.5px] leading-[18px] sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <span className="min-w-0 break-words text-[#ededf0]">
              {r.name}
              {r.value ? <span className="text-[#9b9ba6]"> · {r.value}</span> : null}
            </span>
            {r.note ? <span className="min-w-0 text-[#9b9ba6]">{r.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

const SectionPanel = React.memo(function SectionPanel({ section, topics, facts, help, showAll }: { section: DocSection; topics: Topic[]; facts: Partial<Record<FactKey, Fact>>; help: Map<string, string>; showAll: boolean }) {
  const articles = (section.help ?? []).filter((slug) => help.has(slug))
  return (
    <section id={section.id} className="scroll-mt-4 min-w-0 rounded-[10px] border border-white/[0.08] bg-[#111116]" data-section={section.id}>
      <header className="border-b border-white/[0.08] px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-[#ededf0]">
            <a href={`#${section.id}`} className="hover:underline hover:decoration-white/30 hover:underline-offset-4">
              {section.title}
            </a>
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            {section.physicalOnly ? <span className="text-[#9b9ba6]">While physical commerce is on</span> : null}
            {section.where ? (
              section.where.href ? (
                <a href={section.where.href} className="inline-flex min-h-10 items-center text-[#ededf0] underline decoration-white/25 underline-offset-2 hover:decoration-white/70 sm:min-h-0">
                  {section.where.label}
                </a>
              ) : (
                <span className="text-[#9b9ba6]">{section.where.label}</span>
              )
            ) : null}
          </div>
        </div>
        <p className="mt-1.5 max-w-[760px] text-[13.5px] leading-[21px] text-[#9b9ba6]">{section.intro}</p>
      </header>
      {topics.map((t) => (
        <TopicBlock key={t.id} section={section} topic={t} />
      ))}
      {showAll ? (section.facts ?? []).map((k) => (facts[k] ? <FactTable key={k} fact={facts[k]!} /> : null)) : null}
      {showAll ? (
        <footer className="space-y-1 border-t border-white/[0.08] px-4 py-3 text-[12px] leading-[18px]">
          {articles.length ? (
            <p className="text-[#9b9ba6]">
              Help Center:{" "}
              {articles.map((slug, i) => (
                <React.Fragment key={slug}>
                  {i ? ", " : null}
                  <a href={`/help/physical-products/${slug}`} className="text-[#c9c9d1] underline decoration-white/20 underline-offset-2 hover:decoration-white/60">
                    {help.get(slug)}
                  </a>
                </React.Fragment>
              ))}
            </p>
          ) : null}
          <p className="break-words text-[#6b6b76]">
            Written from <span className="font-mono">{section.code.join(", ")}</span>
          </p>
        </footer>
      ) : null}
    </section>
  )
})

export function CommerceDocsAdmin({ docs, facts, help, withStatus = true }: { docs: DocSection[]; facts: Partial<Record<FactKey, Fact>>; help: HelpLink[]; withStatus?: boolean }) {
  const [query, setQuery] = React.useState("")
  const helpMap = React.useMemo(() => new Map(help.map((h) => [h.slug, h.title])), [help])
  /* The box shows each key at once; the sections follow when the browser has a moment, so typing never waits on 46 topics redrawing. */
  const q = React.useDeferredValue(query.trim())

  /* A section whose own title or intro matches shows whole; otherwise only its topics that match. */
  const shown = React.useMemo(
    () =>
      docs
        .map((s) => {
          if (!q) return { section: s, topics: s.topics, whole: true }
          if (matchesQuery(searchTextOf(s), q)) return { section: s, topics: s.topics, whole: true }
          const factText = (s.facts ?? []).map((k) => facts[k]?.rows.map((r) => `${r.name} ${r.value ?? ""} ${r.note ?? ""}`).join(" ") ?? "").join(" ").toLowerCase()
          const topics = s.topics.filter((t) => matchesQuery(searchTextOf(s, t), q))
          if (!topics.length && factText && matchesQuery(factText, q)) return { section: s, topics: [], whole: true }
          return { section: s, topics, whole: false }
        })
        .filter((x) => x.whole || x.topics.length > 0),
    [docs, facts, q],
  )
  const topicCount = shown.reduce((n, x) => n + x.topics.length, 0)

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [color-scheme:dark] [font-family:Inter,system-ui,sans-serif]" data-admin-commerce-docs="">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <a href="/admin" className="-ml-2 mb-1 inline-flex h-10 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0] sm:h-8">
          Console
        </a>
        <div className="mb-4 min-w-0">
          <h1 className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">Physical commerce</h1>
          <p className="mt-0.5 max-w-[760px] text-[13px] leading-[19px] text-[#9b9ba6]">
            How selling things that ship, and downloads beside them, works in Storelib: every setting, where buyers and creators meet it, and how to check it works. Written from the code; the lists marked “from” are read from it.
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
          <nav aria-label="Contents" className="mb-4 lg:mb-0">
            <div className="lg:sticky lg:top-5">
              <p className="mb-1 hidden px-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76] lg:block">Contents</p>
              <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:block lg:space-y-px lg:overflow-visible lg:px-0 lg:pb-0">
                {withStatus ? (
                  <li className="shrink-0">
                    <a href="#status" className="flex h-9 items-center whitespace-nowrap rounded-[7px] border border-white/[0.08] px-3 text-[13px] text-[#c9c9d1] hover:bg-white/[0.04] hover:text-[#ededf0] lg:h-auto lg:min-h-8 lg:whitespace-normal lg:border-0 lg:px-2 lg:py-1.5 lg:leading-[18px]">
                      Live status
                    </a>
                  </li>
                ) : null}
                {docs.map((s) => {
                  const on = shown.some((x) => x.section.id === s.id)
                  return (
                    <li key={s.id} className={cx("shrink-0", !on && "hidden lg:block")}>
                      <a
                        href={`#${s.id}`}
                        className={cx(
                          "flex h-9 items-center whitespace-nowrap rounded-[7px] border border-white/[0.08] px-3 text-[13px] hover:bg-white/[0.04] hover:text-[#ededf0] lg:h-auto lg:min-h-8 lg:whitespace-normal lg:border-0 lg:px-2 lg:py-1.5 lg:leading-[18px]",
                          on ? "text-[#c9c9d1]" : "text-[#4b4b55]",
                        )}
                      >
                        {s.title}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          </nav>

          <div className="min-w-0 space-y-3">
            {withStatus ? <LiveStatus /> : null}

            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 pt-2">
              <SearchField value={query} onChange={setQuery} placeholder="Search: tax, low stock, tracking, abandoned" label="Search the commerce documentation" />
              <p className="text-[12.5px] tabular-nums text-[#6b6b76]" aria-live="polite" data-search-count="">
                {q ? `${topicCount} ${topicCount === 1 ? "topic" : "topics"} in ${shown.length} ${shown.length === 1 ? "section" : "sections"}` : `${docs.length} sections`}
              </p>
            </div>

            {shown.length === 0 ? (
              <p className="rounded-[10px] border border-white/[0.08] bg-[#111116] px-4 py-6 text-[13px] text-[#9b9ba6]" data-search-empty="">
                Nothing here mentions “{q}”. Try a setting&apos;s name as Settings shows it.
              </p>
            ) : null}

            {shown.map((x) => (
              <SectionPanel key={x.section.id} section={x.section} topics={x.topics} facts={facts} help={helpMap} showAll={x.whole} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
