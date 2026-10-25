/**
 * ===========================================================================
 *  A TRANSLATOR'S ALLOWANCE: PACED, COUNTED, AND SHARED BETWEEN RUNS
 * ===========================================================================
 * The free translators (Gemini's free tier, Cloudflare Workers AI's daily
 * neurons) say no when they are asked too fast or too often. This keeps
 * Storelib inside what they allow, instead of learning it from a wall of
 * refusals:
 *
 *   pace     at most `rpm` calls a minute to one model from this process;
 *            a call over that waits its turn (a queue), or, when the wait
 *            would run past the run's deadline, is not made at all
 *   rest     a model that said "too many" rests for as long as it said
 *            (RetryInfo), one that said "no more today" until its day ends
 *            (midnight Pacific for Gemini), one that is gone (404) a day.
 *            The rest is written to translation_provider_state (SQL part
 *            305) so every other run and instance skips it too
 *   count    every call, string, character and token, per day, provider and
 *            model, in translation_provider_usage (part 305), for
 *            /admin/translations
 *
 * Everything here is best effort: without part 305, or with the database
 * unreachable, the pace and the rests still hold inside the process and
 * translating carries on.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/* ------------------------------------------------------------------- time */

const PACIFIC = "America/Los_Angeles"

/** The calendar day ("2026-10-25") in a time zone. Gemini's daily quotas reset at midnight Pacific. */
export function dayIn(now: number, timeZone: string = PACIFIC): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00"
  return `${get("year")}-${get("month")}-${get("day")}`
}

/** The next midnight in a time zone, as ms since epoch. */
export function nextMidnight(now: number, timeZone: string = PACIFIC): number {
  const today = dayIn(now, timeZone)
  /* Step forward an hour at a time until the day changes (at most 25 steps, DST aside), then back to its first minute. */
  let t = now
  for (let i = 0; i < 26 && dayIn(t, timeZone) === today; i++) t += 3_600_000
  for (let i = 0; i < 60 && dayIn(t - 60_000, timeZone) !== today; i++) t -= 60_000
  return t - (t % 60_000)
}

/* ------------------------------------------------------------------- pace */

const windows = new Map<string, number[]>()

/** Waits for a slot under `rpm` calls a minute for `key`; false when that wait would end after `deadlineAt`. */
export async function takeSlot(key: string, rpm: number, deadlineAt: number, clock: () => number = Date.now, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
  if (!(rpm > 0)) return true
  for (;;) {
    const now = clock()
    const list = (windows.get(key) ?? []).filter((t) => t > now - 60_000)
    if (list.length < rpm) {
      list.push(now)
      windows.set(key, list)
      return true
    }
    const wait = list[0] + 60_000 - now + 25
    windows.set(key, list)
    if (now + wait > deadlineAt) return false
    await sleep(wait)
  }
}

/* -------------------------------------------------------------------- rest */

export interface Rest {
  until: number
  /** "minute" too many for now; "day" no more today; "gone" the model is retired or not for this key; "credits" out of paid credits. */
  why: "minute" | "day" | "gone" | "credits"
  note?: string
}

/** provider:model -> rest. Read from the database once a minute, written through on every change. */
const rests = new Map<string, Rest>()
let restsReadAt = 0

const restKey = (provider: string, model: string) => `${provider}:${model}`

export function restOf(provider: string, model: string, now = Date.now()): Rest | null {
  const r = rests.get(restKey(provider, model))
  return r && r.until > now ? r : null
}

/** For tests: forget every rest and every pace window. */
export function resetBudgets(): void {
  rests.clear()
  windows.clear()
  lastKind.clear()
  restsReadAt = 0
  logged.clear()
}

/** Says a rest, once per model and reason, and keeps it for the other runs. */
export function rest(db: Db | null, provider: string, model: string, r: Rest): void {
  const k = restKey(provider, model)
  const was = rests.get(k)
  if (was && was.until >= r.until && was.why === r.why) return
  rests.set(k, r)
  logOnce(`${k}:${r.why}:${Math.round(r.until / 60_000)}`, `[translate] ${provider} ${model} rests until ${new Date(r.until).toISOString()} (${r.why}${r.note ? `: ${r.note.slice(0, 120)}` : ""})`)
  if (!db) return
  void writeState(db, provider, (s) => {
    const restsNow = { ...(s.rests ?? {}) } as Record<string, Rest>
    restsNow[model] = r
    for (const [m, x] of Object.entries(restsNow)) if (!(x?.until > Date.now())) delete restsNow[m]
    return { rests: restsNow }
  })
}

/** The rests other runs wrote, read at most once a minute. */
export async function loadRests(db: Db | null, now = Date.now()): Promise<void> {
  if (!db || now - restsReadAt < 60_000) return
  restsReadAt = now
  const { data, error } = await db
    .from("translation_provider_state")
    .select("provider, rests")
    .then(
      (r: { data: unknown; error: unknown }) => r,
      (e: unknown) => ({ data: null, error: e }),
    )
  if (error) return
  for (const row of (data ?? []) as { provider: string; rests: Record<string, Rest> | null }[]) {
    for (const [model, r] of Object.entries(row.rests ?? {})) if (r && typeof r.until === "number" && r.until > now) rests.set(restKey(row.provider, model), r)
  }
}

/* ------------------------------------------------------------------- state */

export interface ProviderState {
  provider: string
  models?: string[] | null
  models_hash?: string | null
  listed_at?: string | null
  rests?: Record<string, Rest> | null
  last_ok_at?: string | null
  last_error?: string | null
  last_error_kind?: string | null
  last_error_at?: string | null
}

/** Reads a provider's row, applies `change`, writes it back. Best effort. */
export async function writeState(db: Db, provider: string, change: (s: ProviderState) => Partial<ProviderState>): Promise<void> {
  try {
    const { data, error } = await db.from("translation_provider_state").select("*").eq("provider", provider).maybeSingle()
    if (error) return
    const was = (data ?? { provider }) as ProviderState
    await db
      .from("translation_provider_state")
      .upsert({ ...was, ...change(was), provider, updated_at: new Date().toISOString() }, { onConflict: "provider" })
      .then(
        () => undefined,
        () => undefined,
      )
  } catch {
    /* without part 305: nothing kept, nothing lost */
  }
}

export async function readState(db: Db | null, provider: string): Promise<ProviderState | null> {
  if (!db) return null
  try {
    const { data, error } = await db.from("translation_provider_state").select("*").eq("provider", provider).maybeSingle()
    return error ? null : ((data as ProviderState | null) ?? null)
  } catch {
    return null
  }
}

/** The last outcome per provider, written when it changes kind (ok after failing, a new kind of failure), and a success at most every ten minutes: a few writes an hour, not one per call. */
const lastKind = new Map<string, { kind: string; at: number }>()
export function noteOutcome(db: Db | null, provider: string, kind: "ok" | string, message?: string): void {
  const tag = kind === "ok" ? "ok" : `${kind}:${message ?? ""}`
  const was = lastKind.get(provider)
  if (was?.kind === tag && (kind !== "ok" || Date.now() - was.at < 10 * 60_000)) return
  lastKind.set(provider, { kind: tag, at: Date.now() })
  if (!db) return
  const now = new Date().toISOString()
  void writeState(db, provider, () => (kind === "ok" ? { last_ok_at: now } : { last_error: (message ?? kind).slice(0, 500), last_error_kind: kind, last_error_at: now }))
}

/* ------------------------------------------------------------------ counts */

export interface Usage {
  calls?: number
  ok?: number
  failed?: number
  limited?: number
  strings?: number
  chars?: number
  inputTokens?: number
  outputTokens?: number
}

/** Counts one call (or several) for today; the day is Pacific for Gemini, UTC for the others. Best effort. */
export function count(db: Db | null, provider: string, model: string, u: Usage, now = Date.now()): void {
  if (!db) return
  const day = dayIn(now, provider === "gemini" ? PACIFIC : "UTC")
  void db
    .rpc("translation_usage_add", {
      p_day: day,
      p_provider: provider,
      p_model: model.slice(0, 120),
      p_calls: u.calls ?? 0,
      p_ok: u.ok ?? 0,
      p_failed: u.failed ?? 0,
      p_limited: u.limited ?? 0,
      p_strings: u.strings ?? 0,
      p_chars: u.chars ?? 0,
      p_input_tokens: u.inputTokens ?? 0,
      p_output_tokens: u.outputTokens ?? 0,
    })
    .then(
      () => undefined,
      () => undefined,
    )
}

/* -------------------------------------------------------------------- logs */

const logged = new Set<string>()
/** A line once per process for the same thing: a model gone is said once, not every batch. */
export function logOnce(key: string, line: string): void {
  if (logged.has(key)) return
  if (logged.size > 500) logged.clear()
  logged.add(key)
  console.error(line)
}
