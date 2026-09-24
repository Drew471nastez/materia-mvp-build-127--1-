import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { loggable, plainReason } from "./plain-reason"

/**
 * ===========================================================================
 *  THE NUMBERS BEHIND /admin, AND WHAT HAPPENS WHEN ONE CANNOT BE READ
 * ===========================================================================
 * Every figure on the admin is a real query against a real table. None of
 * them is seeded, sampled or estimated, and there is no demo mode: an empty
 * platform shows zeroes because there is nothing there, not because nothing
 * was asked.
 *
 * ---------------------------------------------------------------------------
 *  A FAILED QUERY IS NOT A ZERO
 * ---------------------------------------------------------------------------
 * PostgREST answers a query it cannot run (an unknown column, a policy that
 * refuses, a malformed filter) with an ERROR AND A NULL BODY. Written the
 * usual way:
 *
 *     const { data } = await supabase.from("profiles").select("username, updated_at")
 *     for (const row of data || []) …
 *
 * the error is dropped and `|| []` turns it into an empty list that reads
 * exactly like "there are none". "Revenue today: $0" is a sentence an owner
 * acts on, and it must never be the way a typo looks.
 *
 * So every read goes through this class, which keeps the error. A figure
 * that could not be read comes back as `null`, the section carries the
 * reason in plain words (lib/admin/plain-reason.ts), and the card says
 * "Could not be read" with that reason instead of a number. The raw database
 * message stays in the server log.
 *
 * ---------------------------------------------------------------------------
 *  A COLUMN THAT ARRIVES WITH A MIGRATION IS OPTIONAL UNTIL IT HAS
 * ---------------------------------------------------------------------------
 * `creators.banned_at` exists once the admin SQL has been run, and not
 * before. A list that names it would fail outright on a database that has
 * not had it yet, so a read can name columns as optional: when the database
 * says one of THOSE is missing, the read is made again without it and a
 * notice says what is missing. Any other missing column is still an error.
 */

export type Diagnostic = { metric: string; table: string; reason: string }

type Shape = (q: any) => any // eslint-disable-line @typescript-eslint/no-explicit-any

export type ReadOptions = {
  /** Columns that may not exist yet. Dropped and retried when the database says so. */
  optional?: string[]
}

export const PAGE_SIZE = 25

/** The optional column a "does not exist" error names, if it is one of them. */
export function missingOptional(error: { code?: string | null; message?: string | null } | null, optional: string[]): string | null {
  if (!error) return null
  const message = error.message ?? ""
  if (error.code !== "42703" && !/does not exist/i.test(message)) return null
  for (const col of optional) {
    const bare = col.split(".").pop()!
    if (new RegExp(`\\b${bare}\\b`).test(message)) return col
  }
  return null
}

/** A select list with some columns taken out. */
export function withoutColumns(select: string, drop: string[]): string {
  return select
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c && !drop.includes(c))
    .join(", ")
}

export class Reader {
  private client: ReturnType<typeof createAdminClient> | null = null
  readonly problems: Diagnostic[] = []
  readonly notices: string[] = []

  get db() {
    if (!this.client) this.client = createAdminClient()
    return this.client
  }

  note(metric: string, table: string, error: unknown) {
    const reason = plainReason(error, table)
    console.error(`[admin] ${metric} (${table}): ${loggable(error)}`)
    if (!this.problems.some((p) => p.metric === metric && p.table === table)) {
      this.problems.push({ metric, table, reason })
    }
  }

  notice(text: string) {
    if (!this.notices.includes(text)) this.notices.push(text)
  }

  /**
   * A `count: exact, head: true` read. Null when it could not be read.
   *
   * THE TRY IS NOT DECORATION. A query that REJECTS rather than resolving
   * (the host is unreachable, DNS fails, the request times out) would
   * otherwise take the whole section down with it. One failure is one
   * missing figure.
   */
  async count(metric: string, table: string, shape: Shape = (q) => q, column = "id"): Promise<number | null> {
    try {
      const { count, error } = await shape(this.db.from(table).select(column, { count: "exact", head: true }))
      if (error) {
        this.note(metric, table, error)
        return null
      }
      return count ?? 0
    } catch (e) {
      this.note(metric, table, e)
      return null
    }
  }

  /** Rows, or null. Every caller passes a limit: an admin page must not read a table whole. */
  async rows<T = Record<string, unknown>>(
    metric: string,
    table: string,
    select: string,
    shape: Shape = (q) => q,
    options: ReadOptions = {},
  ): Promise<T[] | null> {
    const result = await this.read<T>(metric, table, select, shape, options, false)
    return result ? result.rows : null
  }

  /**
   * One page of rows and the number of rows that match, for a list that can
   * grow. The range is applied here so no caller can forget it.
   */
  async page<T = Record<string, unknown>>(
    metric: string,
    table: string,
    select: string,
    shape: Shape,
    page: number,
    options: ReadOptions & { size?: number } = {},
  ): Promise<{ rows: T[]; total: number; page: number; pages: number } | null> {
    const size = options.size ?? PAGE_SIZE
    const current = Math.max(1, Math.floor(page) || 1)
    const from = (current - 1) * size
    const result = await this.read<T>(metric, table, select, (q) => shape(q).range(from, from + size - 1), options, true)
    if (!result) return null
    const total = result.total ?? result.rows.length
    return { rows: result.rows, total, page: current, pages: Math.max(1, Math.ceil(total / size)) }
  }

  private async read<T>(
    metric: string,
    table: string,
    select: string,
    shape: Shape,
    options: ReadOptions,
    counted: boolean,
  ): Promise<{ rows: T[]; total: number | null } | null> {
    let columns = select
    const optional = [...(options.optional ?? [])]
    try {
      /* Fixed before the loop: `optional` shrinks as columns are dropped. */
      const attempts = optional.length + 1
      for (let attempt = 0; attempt < attempts; attempt++) {
        const base = counted ? this.db.from(table).select(columns, { count: "exact" }) : this.db.from(table).select(columns)
        const { data, error, count } = await shape(base)
        if (!error) return { rows: (data ?? []) as T[], total: typeof count === "number" ? count : null }
        const missing = missingOptional(error, optional)
        if (!missing) {
          this.note(metric, table, error)
          return null
        }
        optional.splice(optional.indexOf(missing), 1)
        columns = withoutColumns(columns, [missing])
        this.notice(`${table}.${missing} is not in the database yet, so it is left out. Run supabase/sql/RUN_ADMIN_CONSOLE.sql.`)
      }
      return null
    } catch (e) {
      this.note(metric, table, e)
      return null
    }
  }

  /**
   * A database function. `missing` is true when the function is not
   * installed, so the caller can fall back to reading rows; any other
   * failure is recorded like a failed read.
   */
  async rpc<T = unknown>(metric: string, fn: string, args: Record<string, unknown>): Promise<{ data: T | null; missing: boolean }> {
    try {
      const { data, error } = await this.db.rpc(fn, args)
      if (!error) return { data: data as T, missing: false }
      if (error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "")) {
        return { data: null, missing: true }
      }
      this.note(metric, fn, error)
      return { data: null, missing: false }
    } catch (e) {
      this.note(metric, fn, e)
      return { data: null, missing: false }
    }
  }

  /** The reason a named read failed, for the card that shows it. */
  reasonFor(metric: string): string | null {
    return this.problems.find((p) => p.metric === metric)?.reason ?? null
  }
}

/* ── Time windows, all in UTC so two cards never disagree by a timezone ──── */

export const DAY_MS = 24 * 60 * 60 * 1000

export function isoDaysAgo(days: number, now = Date.now()): string {
  return new Date(now - days * DAY_MS).toISOString()
}

export function isoMinutesAgo(minutes: number, now = Date.now()): string {
  return new Date(now - minutes * 60_000).toISOString()
}

/** Midnight UTC today, which is what "today" means on every card here. */
export function startOfTodayIso(now = Date.now()): string {
  return `${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`
}

/** The day key a timestamp belongs to, for bucketing a series. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * A run of day keys ending today, oldest first. Series are built against this
 * rather than against the days that happen to have rows, so a quiet Tuesday
 * is a zero in the chart instead of a gap the line skips over.
 */
export function dayRange(days: number, now = Date.now()): string[] {
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) out.push(new Date(now - i * DAY_MS).toISOString().slice(0, 10))
  return out
}

/** Percent change, and null when there is no previous figure to compare to. */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

export function sumCents(rows: { amount_cents?: number | null }[] | null, field: "amount_cents" | "fee_cents" | "refund_amount_cents" = "amount_cents"): number {
  if (!rows) return 0
  let total = 0
  for (const r of rows as Record<string, unknown>[]) {
    const v = r[field]
    total += typeof v === "number" ? v : 0
  }
  return total
}

/** Distinct non-empty values of one field. */
export function distinct<T extends Record<string, unknown>>(rows: T[] | null, field: keyof T): number {
  if (!rows) return 0
  const seen = new Set<string>()
  for (const r of rows) {
    const v = r[field]
    if (typeof v === "string" && v) seen.add(v)
  }
  return seen.size
}

/**
 * What a person typed into a search box, made safe to put inside a PostgREST
 * `or=(…)` filter. Commas, brackets and the wildcard change the shape of the
 * filter rather than being searched for, so they become spaces. Bounded,
 * because nobody searches with a paragraph.
 */
export function searchText(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[%,()*\\:"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function pageParam(raw: string | null): number {
  const n = Number.parseInt(raw ?? "1", 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1
}
