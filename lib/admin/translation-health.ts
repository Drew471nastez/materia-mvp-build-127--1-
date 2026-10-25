import "server-only"

/**
 * ===========================================================================
 *  HOW TRANSLATING IS DOING, FOR /admin/translations
 * ===========================================================================
 * Facts only, never a merchant's words: which translators are set up (by
 * the names of their settings, never a key), which models each one read
 * from its own list today and which of them are resting and why, the
 * calls and texts per day (translation_provider_usage, SQL part 305), how
 * much translation memory saved, and the stores whose automatic
 * translation or Translate with AI job stopped with a reason.
 *
 * A visitor never sees any of this: a text without a translation shows in
 * its original language until one exists.
 */
import { openProviders } from "@/lib/markets/open-translate"
import type { ProviderState, Rest } from "@/lib/markets/translate-budget"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface UsageRow {
  day: string
  provider: string
  model: string
  calls: number
  ok: number
  failed: number
  limited: number
  strings: number
  chars: number
  input_tokens: number
  output_tokens: number
}

export interface ProviderHealth {
  provider: string
  setUp: boolean
  models: string[]
  listedAt: string | null
  resting: { model: string; until: string; why: Rest["why"]; note?: string }[]
  lastOkAt: string | null
  lastError: string | null
  lastErrorKind: string | null
  lastErrorAt: string | null
  /** "ok" worked last; "resting" every model is resting; "failing" failed last; "unused" nothing recorded. */
  status: "ok" | "resting" | "failing" | "unused"
}

export interface TranslationHealth {
  ready: boolean
  providers: ProviderHealth[]
  days: { day: string; calls: number; ok: number; failed: number; limited: number; strings: number; chars: number }[]
  today: UsageRow[]
  memoryRows: number | null
  stuckJobs: { creatorId: string; locale: string; status: string; error: string | null; updatedAt: string }[]
  autoErrors: { creatorId: string; at: string | null; error: string; left: number }[]
  settings: { name: string; set: boolean; what: string }[]
}

const SETTINGS: { name: string; what: string }[] = [
  { name: "GEMINI_API_KEY", what: "Gemini (free tier from Google AI Studio). The first translator." },
  { name: "GEMINI_TRANSLATE_MODEL", what: "Optional. Models to ask first; the rest are read from Google's list." },
  { name: "CLOUDFLARE_ACCOUNT_ID", what: "Cloudflare Workers AI, the free second translator (with the token below)." },
  { name: "CLOUDFLARE_AI_TOKEN", what: "A Cloudflare API token with Workers AI Read and Edit." },
  { name: "DEEPL_API_KEY", what: "Optional. DeepL API Free (500,000 characters a month)." },
  { name: "TRANSLATE_PROVIDERS", what: "Optional. Which translators, in which order, e.g. gemini,cloudflare." },
  { name: "HF_TOKEN", what: "Optional. Hugging Face (needs credits)." },
]

/** Pure: a provider's state row and setup into what the page shows. */
export function providerHealth(provider: string, setUp: boolean, row: ProviderState | null, now = Date.now()): ProviderHealth {
  const resting = Object.entries(row?.rests ?? {})
    .filter(([, r]) => r && typeof r.until === "number" && r.until > now)
    .map(([model, r]) => ({ model, until: new Date(r.until).toISOString(), why: r.why, ...(r.note ? { note: r.note } : {}) }))
  const models = Array.isArray(row?.models) ? (row!.models as string[]) : []
  const okAt = row?.last_ok_at ? Date.parse(row.last_ok_at) : 0
  const errAt = row?.last_error_at ? Date.parse(row.last_error_at) : 0
  const allResting = resting.some((r) => r.model === "*") || (models.length > 0 && models.every((m) => resting.some((r) => r.model === m)))
  const status: ProviderHealth["status"] = allResting ? "resting" : errAt > okAt ? "failing" : okAt ? "ok" : "unused"
  return { provider, setUp, models, listedAt: row?.listed_at ?? null, resting, lastOkAt: row?.last_ok_at ?? null, lastError: row?.last_error ?? null, lastErrorKind: row?.last_error_kind ?? null, lastErrorAt: row?.last_error_at ?? null, status }
}

const missing = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""))

export async function readTranslationHealth(db: Db, now = Date.now()): Promise<TranslationHealth> {
  const since = new Date(now - 14 * 86_400_000).toISOString().slice(0, 10)
  const [state, usage, memory, jobs, auto] = await Promise.all([
    db.from("translation_provider_state").select("*"),
    db.from("translation_provider_usage").select("*").gte("day", since).order("day", { ascending: false }).limit(2000),
    db.from("translation_memory").select("source_hash", { count: "estimated", head: true }),
    db.from("store_translation_jobs").select("creator_id, locale, status, error, updated_at").or("status.eq.failed,error.not.is.null").order("updated_at", { ascending: false }).limit(30),
    db.from("store_localization").select("creator_id, auto_translate_run").eq("auto_translate", true).not("auto_translate_run->>error", "is", null).limit(30),
  ])
  const ready = !missing(state.error) && !missing(usage.error)
  const rows = new Map(((state.data ?? []) as ProviderState[]).map((r) => [r.provider, r]))
  const setUp = new Set<string>(openProviders())
  const names = [...new Set([...setUp, ...rows.keys()])]
  const providers = names.map((p) => providerHealth(p, setUp.has(p), rows.get(p) ?? null, now))
  const all = ((usage.data ?? []) as UsageRow[]).map((r) => ({ ...r, chars: Number(r.chars), input_tokens: Number(r.input_tokens), output_tokens: Number(r.output_tokens) }))
  const byDay = new Map<string, TranslationHealth["days"][number]>()
  for (const r of all) {
    const d = byDay.get(r.day) ?? { day: r.day, calls: 0, ok: 0, failed: 0, limited: 0, strings: 0, chars: 0 }
    d.calls += r.calls
    d.ok += r.ok
    d.failed += r.failed
    d.limited += r.limited
    d.strings += r.strings
    d.chars += r.chars
    byDay.set(r.day, d)
  }
  const days = [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day))
  const latest = days[0]?.day
  return {
    ready,
    providers,
    days,
    today: latest ? all.filter((r) => r.day === latest) : [],
    memoryRows: memory.error ? null : (memory.count ?? null),
    stuckJobs: ((jobs.data ?? []) as { creator_id: string; locale: string; status: string; error: string | null; updated_at: string }[]).map((j) => ({ creatorId: j.creator_id, locale: j.locale, status: j.status, error: j.error, updatedAt: j.updated_at })),
    autoErrors: ((auto.data ?? []) as { creator_id: string; auto_translate_run: { at?: string; error?: string; left?: number } | null }[]).map((s) => ({ creatorId: s.creator_id, at: s.auto_translate_run?.at ?? null, error: String(s.auto_translate_run?.error ?? ""), left: Number(s.auto_translate_run?.left ?? 0) })),
    settings: SETTINGS.map((s) => ({ ...s, set: !!(process.env[s.name] ?? "").trim() || (s.name === "GEMINI_API_KEY" && !!(process.env.GOOGLE_AI_API_KEY ?? "").trim()) || (s.name === "CLOUDFLARE_AI_TOKEN" && !!(process.env.CLOUDFLARE_API_TOKEN ?? "").trim()) })),
  }
}
