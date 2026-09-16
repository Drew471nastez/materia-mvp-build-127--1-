import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  THE NUMBERS BEHIND /admin, AND WHAT HAPPENS WHEN ONE CANNOT BE READ
 * ===========================================================================
 * Every figure on the dashboard is a real query against a real table. None of
 * them is seeded, sampled or estimated, and there is no demo mode: an empty
 * platform shows zeroes because there is nothing there, not because nothing
 * was asked.
 *
 * ---------------------------------------------------------------------------
 *  A FAILED QUERY IS NOT A ZERO
 * ---------------------------------------------------------------------------
 * This is the whole reason this module exists rather than a dozen inline
 * `supabase.from(...)` calls in the route.
 *
 * PostgREST answers a query it cannot run — an unknown column, a policy that
 * refuses, a malformed filter — with an ERROR AND A NULL BODY. Written the
 * usual way:
 *
 *     const { data } = await supabase.from("profiles").select("username, updated_at")
 *     for (const row of data || []) …
 *
 * the error is dropped on the floor and `|| []` turns it into an empty list
 * that is indistinguishable from "there are none". That exact line shipped in
 * app/sitemap.ts: `profiles` has no `updated_at`, so the sitemap listed zero
 * creator pages, for every request, for as long as it had been there, and
 * nobody found out because nothing said anything.
 *
 * A dashboard is where that goes worst. "Revenue today: $0" is a sentence an
 * operator will act on, and it must never be the way a typo looks.
 *
 * So every read here goes through `count()` or `rows()`, which keep the
 * error, and the section reports it. A number that could not be read comes
 * back as `null` and the UI says so in place of the figure. The Health tab
 * lists every failure with the table and the reason, which is how a schema
 * change announces itself instead of quietly zeroing a card.
 */

export type Diagnostic = { metric: string; table: string; reason: string }

export class Reader {
  readonly db = createAdminClient()
  readonly problems: Diagnostic[] = []

  private note(metric: string, table: string, reason: string) {
    this.problems.push({ metric, table, reason })
  }

  /**
   * A `count: exact, head: true` read. Null when it could not be read.
   *
   * THE TRY IS NOT DECORATION. A query that REJECTS rather than resolving —
   * the host is unreachable, DNS fails, the request times out — would
   * otherwise take the whole section down with it and the dashboard would go
   * blank because one table was slow. One failure is one missing figure.
   */
  async count(
    metric: string,
    table: string,
    shape: (q: any) => any = (q) => q,
  ): Promise<number | null> {
    try {
      const { count, error } = await shape(
        this.db.from(table).select("id", { count: "exact", head: true }),
      )
      if (error) {
        this.note(metric, table, error.message)
        return null
      }
      return count ?? 0
    } catch (e) {
      this.note(metric, table, e instanceof Error ? e.message : String(e))
      return null
    }
  }

  /** Rows, or null. Every caller passes a limit: an admin page must not read a table whole. */
  async rows<T = Record<string, unknown>>(
    metric: string,
    table: string,
    select: string,
    shape: (q: any) => any = (q) => q,
  ): Promise<T[] | null> {
    try {
      const { data, error } = await shape(this.db.from(table).select(select))
      if (error) {
        this.note(metric, table, error.message)
        return null
      }
      return (data ?? []) as T[]
    } catch (e) {
      this.note(metric, table, e instanceof Error ? e.message : String(e))
      return null
    }
  }
}

/* ── Time windows, all in UTC so two cards never disagree by a timezone ──── */

export const DAY_MS = 24 * 60 * 60 * 1000

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

export function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

/** Midnight UTC today, which is what "today" means on every card here. */
export function startOfTodayIso(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`
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
export function dayRange(days: number): string[] {
  const out: string[] = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) out.push(new Date(now - i * DAY_MS).toISOString().slice(0, 10))
  return out
}

/** Percent change, and null when there is no previous figure to compare to. */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

export function sumCents(rows: { amount_cents?: number | null }[] | null): number {
  if (!rows) return 0
  let total = 0
  for (const r of rows) total += typeof r.amount_cents === "number" ? r.amount_cents : 0
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
