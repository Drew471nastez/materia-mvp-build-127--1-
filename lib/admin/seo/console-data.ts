import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { serviceAccountFromEnv } from "./google"
import { quotaDayStart, quotaFromEnv } from "./plan"
import { propertiesFromEnv } from "./properties"
import { listRows, missingSchema, readSyncState, totals, usedToday, type KindTotals, type ListQuery, type ListResult, type SyncState } from "./store"

/**
 * Everything /admin/seo draws on its first paint, read on the server. Each
 * read that fails says so in `problems` instead of turning into a zero.
 */
export interface SeoConsoleData {
  schemaReady: boolean
  google: { connected: boolean; clientEmail: string | null; properties: string[]; perDay: number; reserve: number; usedToday: Record<string, number> }
  totals: KindTotals[]
  list: ListResult
  sync: SyncState | null
  query: ListQuery
  problems: string[]
}

export async function readSeoConsole(query: ListQuery): Promise<SeoConsoleData> {
  const account = serviceAccountFromEnv()
  const quota = quotaFromEnv()
  const data: SeoConsoleData = {
    schemaReady: true,
    google: { connected: !!account, clientEmail: account?.clientEmail ?? null, properties: propertiesFromEnv(), perDay: quota.perDay, reserve: quota.reserve, usedToday: {} },
    totals: [],
    list: { rows: [], total: 0, page: query.page, pages: 1 },
    sync: null,
    query,
    problems: [],
  }
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    data.problems.push("The database is not configured on this deployment.")
    data.schemaReady = false
    return data
  }
  const settle = async <T>(what: string, read: () => Promise<T>, apply: (v: T) => void) => {
    try {
      apply(await read())
    } catch (e) {
      if (missingSchema(e as { code?: string; message?: string })) data.schemaReady = false
      else data.problems.push(`${what} could not be read.`)
    }
  }
  await Promise.all([
    settle("Totals", () => totals(admin), (v) => (data.totals = v)),
    settle("Addresses", () => listRows(admin, query), (v) => (data.list = v)),
    settle("The inventory walk", () => readSyncState(admin), (v) => (data.sync = v)),
    settle("Today's inspections", () => usedToday(admin, quotaDayStart()), (v) => (data.google.usedToday = v)),
  ])
  return data
}
