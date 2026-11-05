"use client"

import Link from "next/link"

import type { ProviderHealth, TranslationHealth, UsageRow } from "@/lib/admin/translation-health"
import { Banner, DataList, Figures, Panel, Status } from "../_console/ui"

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never")
const n = (v: number) => v.toLocaleString("en-GB")
const NAMES: Record<string, string> = { gemini: "Gemini", cloudflare: "Cloudflare Workers AI", deepl: "DeepL", llm: "Your model", libretranslate: "LibreTranslate", huggingface: "Hugging Face", mymemory: "MyMemory" }
const WHY: Record<string, string> = { minute: "too many a minute", day: "today's free allowance used", gone: "retired or not for this key", credits: "out of credits" }

function statusOf(p: ProviderHealth) {
  if (!p.setUp) return <Status value="pending" label="Not set up" />
  if (p.status === "ok") return <Status value="ok" label="Working" />
  if (p.status === "resting") return <Status value="pending" label="Resting" />
  if (p.status === "failing") return <Status value="failed" label="Failing" />
  return <Status value="pending" label="Not used yet" />
}

export function TranslationsAdmin({ health }: { health: TranslationHealth }) {
  const today = health.days[0]
  const working = health.providers.filter((p) => p.setUp && (p.status === "ok" || p.status === "unused"))
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6 text-[#ededf0] sm:px-6 lg:px-8">
      <div className="mb-5">
        <p className="text-[12px] text-[#6b6b76]">
          <Link href="/admin" className="hover:text-[#c9c9d1]">Admin</Link> / Translations
        </p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.01em]">Translations</h1>
        <p className="mt-1 text-[13px] text-[#9b9ba6]">Visitors never see a failure here: a text with no translation shows in its own language until one exists.</p>
      </div>

      {!health.ready ? <Banner tone="bad">The translator log is not on this database yet. Run supabase/sql/run-now/305_translation_providers.sql. Translating still works without it.</Banner> : null}
      {health.providers.every((p) => !p.setUp || p.provider === "mymemory") ? <Banner tone="bad">No free translator is set up. Add GEMINI_API_KEY (and CLOUDFLARE_ACCOUNT_ID with CLOUDFLARE_AI_TOKEN) in Vercel, then redeploy.</Banner> : null}
      {health.providers.some((p) => p.setUp) && working.length === 0 ? <Banner tone="bad">Every translator set up is resting or failing. Work waits and carries on by itself when one is back.</Banner> : null}

      <div className="mt-4 space-y-4">
        <Figures
          columns={4}
          items={[
            { label: "Calls today", value: today ? n(today.calls) : "0", sub: today ? `${n(today.failed)} failed, ${n(today.limited)} too many` : "none yet" },
            { label: "Texts sent today", value: today ? n(today.strings) : "0", sub: today ? `${n(today.chars)} characters` : undefined },
            { label: "Kept in memory", value: health.memoryRows === null ? "Unknown" : n(health.memoryRows), sub: "never sent again, for any store" },
            { label: "Stores that stopped", value: n(health.stuckJobs.length + health.autoErrors.length) },
          ]}
        />

        <Panel title="Translators" meta="first set up is asked first">
          <DataList
            label="Translators"
            rowKey={(p) => p.provider}
            empty="None set up."
            rows={health.providers}
            columns={[
              { key: "name", label: "Translator", width: "minmax(0,1fr)", render: (p) => NAMES[p.provider] ?? p.provider, phone: "primary" },
              { key: "status", label: "Now", width: "120px", render: statusOf, phone: "end" },
              { key: "models", label: "Models, best first", width: "minmax(0,1.6fr)", render: (p) => (p.models.length ? p.models.slice(0, 4).join(", ") : "not listed"), phone: "secondary" },
              { key: "ok", label: "Last worked", width: "120px", render: (p) => when(p.lastOkAt), phone: "hide" },
              { key: "err", label: "Last problem", width: "minmax(0,1.6fr)", render: (p) => (p.lastError ? `${when(p.lastErrorAt)}: ${p.lastError}` : "none"), phone: "secondary" },
            ]}
          />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Resting now" meta="skipped until then">
            <DataList
              label="Resting models"
              rowKey={(r) => `${r.provider}:${r.model}`}
              empty="Nothing is resting."
              rows={health.providers.flatMap((p) => p.resting.map((r) => ({ ...r, provider: p.provider })))}
              columns={[
                { key: "m", label: "Model", width: "minmax(0,1.2fr)", render: (r) => `${NAMES[r.provider] ?? r.provider} ${r.model === "*" ? "" : r.model}`, phone: "primary" },
                { key: "why", label: "Why", width: "minmax(0,1fr)", render: (r) => WHY[r.why] ?? r.why, phone: "secondary" },
                { key: "until", label: "Until", width: "110px", render: (r) => when(r.until), phone: "end" },
              ]}
            />
          </Panel>
          <Panel title="By model, latest day">
            <DataList
              label="Usage by model"
              rowKey={(r: UsageRow) => `${r.provider}:${r.model}`}
              empty="No calls recorded."
              rows={health.today}
              columns={[
                { key: "m", label: "Model", width: "minmax(0,1.4fr)", render: (r) => `${NAMES[r.provider] ?? r.provider} ${r.model}`, phone: "primary" },
                { key: "c", label: "Calls", width: "70px", align: "right", render: (r) => n(r.calls), phone: "end" },
                { key: "s", label: "Texts", width: "80px", align: "right", render: (r) => n(r.strings), phone: "secondary" },
                { key: "l", label: "Too many", width: "80px", align: "right", render: (r) => n(r.limited), phone: "hide" },
                { key: "t", label: "Tokens", width: "100px", align: "right", render: (r) => n(r.input_tokens + r.output_tokens), phone: "hide" },
              ]}
            />
          </Panel>
        </div>

        <Panel title="Last 14 days">
          <DataList
            label="Calls per day"
            rowKey={(d) => d.day}
            empty="No calls recorded."
            rows={health.days}
            columns={[
              { key: "d", label: "Day", width: "120px", render: (d) => d.day, phone: "primary" },
              { key: "c", label: "Calls", width: "80px", align: "right", render: (d) => n(d.calls), phone: "end" },
              { key: "ok", label: "Worked", width: "80px", align: "right", render: (d) => n(d.ok), phone: "secondary" },
              { key: "f", label: "Failed", width: "80px", align: "right", render: (d) => n(d.failed), phone: "secondary" },
              { key: "s", label: "Texts", width: "90px", align: "right", render: (d) => n(d.strings), phone: "hide" },
            ]}
          />
        </Panel>

        <Panel title="Stores where it stopped" meta="the store's own reason">
          <DataList
            label="Stores where translating stopped"
            rowKey={(r) => r.key}
            empty="None."
            rows={[
              ...health.stuckJobs.map((j) => ({ key: `job:${j.creatorId}:${j.locale}`, store: j.creatorId, what: `Translate with AI, ${j.locale}, ${j.status}`, why: j.error ?? "", at: j.updatedAt })),
              ...health.autoErrors.map((a) => ({ key: `auto:${a.creatorId}`, store: a.creatorId, what: `Automatic, ${a.left} left`, why: a.error, at: a.at })),
            ]}
            columns={[
              { key: "s", label: "Store", width: "minmax(0,1fr)", render: (r) => r.store, phone: "primary" },
              { key: "w", label: "What", width: "minmax(0,1fr)", render: (r) => r.what, phone: "secondary" },
              { key: "y", label: "Reason", width: "minmax(0,1.6fr)", render: (r) => r.why, phone: "secondary" },
              { key: "a", label: "When", width: "110px", render: (r) => when(r.at), phone: "end" },
            ]}
          />
        </Panel>

        <Panel title="Settings" meta="names only, never a key">
          <DataList
            label="Translation settings"
            rowKey={(s) => s.name}
            empty="None."
            rows={health.settings}
            columns={[
              { key: "n", label: "Setting", width: "minmax(0,1fr)", render: (s) => s.name, phone: "primary" },
              { key: "v", label: "Set", width: "70px", render: (s) => (s.set ? "Yes" : "No"), phone: "end" },
              { key: "w", label: "What it is", width: "minmax(0,2fr)", render: (s) => s.what, phone: "secondary" },
            ]}
          />
        </Panel>
      </div>
    </main>
  )
}
