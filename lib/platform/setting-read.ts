import "server-only"

/**
 * ===========================================================================
 *  A PLATFORM SWITCH THAT COULD NOT BE READ IS NOT "OFF" (round 51)
 * ===========================================================================
 * Explore, the buyer header's colour and physical goods are switches in
 * `platform_settings`, each read through `unstable_cache` for five minutes.
 * Each read used to answer `false` whenever the database did not: an error
 * came back as `data: null`, which read as "switched off". unstable_cache
 * then kept that `false` for five minutes, in the cache every instance on
 * Vercel shares. One slow answer turned Explore off for everybody, and
 * /explore sent each of them to the landing page: "Explore goes to
 * storelib.com". (Explore also asked through `createClient()` first, which
 * reads cookies and so always threw inside unstable_cache.)
 *
 * Now an unanswered read throws, which unstable_cache never keeps, and the
 * caller keeps the last answer this instance had (`keptSetting`). Only a
 * real row, or no row at all, is an answer.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { sleptThrough } from "@/lib/net/suspended"

/** The setting's table or column is not there yet: as good as no row (the part has not run). */
function missingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "")
}

/** Thrown when the database did not answer: never kept by unstable_cache. */
export class SettingUnread extends Error {
  constructor(key: string, why: string) {
    super(`platform setting ${key} not read: ${why}`)
    this.name = "SettingUnread"
  }
}

type SettingAnswer = { data: { value?: unknown } | null; error: { code?: string; message?: string } | null }
type SettingQuery = { maybeSingle: () => PromiseLike<SettingAnswer>; abortSignal?: (signal: AbortSignal) => SettingQuery }
type SettingClient = { from: (table: string) => { select: (cols: string) => { eq: (k: string, v: string) => SettingQuery } } }

/*
  HOW LONG A SWITCH MAY TAKE (round AL). Production, Nov 7 08:28 to 08:32 UTC: every platform_settings read during a
  database slowdown ran to the 20 second read deadline (lib/net/deadline.ts), 30 of them across /, /explore, /sell,
  /signup, /developers and /blog, each holding its function for those 20 seconds. One row by its key answers in
  milliseconds when the database is there, so three seconds is ample; past that the caller keeps its last answer.
*/
export const SETTING_READ_MS = 3000

/** The read ran out of time. `asleep`: the timer fired so late that the instance slept through it (lib/net/suspended.ts). */
class SettingLate extends Error {
  constructor(ms: number, readonly asleep: boolean) {
    super(`no answer in ${ms}ms`)
  }
}

type SettingReadOptions = { ms?: number; now?: () => number }

async function askOnce(key: string, client: SettingClient, ms: number, now: () => number): Promise<SettingAnswer> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const startedAt = now()
  try {
    const ctl = new AbortController()
    const query = client.from("platform_settings").select("value").eq("key", key)
    const bounded = typeof query.abortSignal === "function" ? query.abortSignal(ctl.signal) : query
    return await Promise.race([
      bounded.maybeSingle(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl.abort()
          reject(new SettingLate(ms, sleptThrough(startedAt, ms, now())))
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * One boolean of platform_settings: true or false when it is set, null when
 * there is no row (or no table). Throws a SettingUnread when the database did
 * not answer. A read the instance slept through is asked once more first:
 * that was the server asleep, not the database late.
 */
export async function readSetting(key: string, client: SettingClient = createAdminClient() as unknown as SettingClient, opts: SettingReadOptions = {}): Promise<boolean | null> {
  const ms = opts.ms ?? SETTING_READ_MS
  const now = opts.now ?? Date.now
  let answer: SettingAnswer
  try {
    answer = await askOnce(key, client, ms, now).catch((e: unknown) => {
      if (e instanceof SettingLate && e.asleep) return askOnce(key, client, ms, now)
      throw e
    })
  } catch (e) {
    throw new SettingUnread(key, e instanceof Error ? e.message : String(e))
  }
  if (answer.error) {
    if (missingTable(answer.error)) return null
    throw new SettingUnread(key, `${answer.error.code ?? ""} ${answer.error.message ?? ""}`.trim())
  }
  const value = answer.data?.value
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  return null
}

/**
 * The cached read, and this instance's last answer when it throws.
 * `answer()` is null when nothing is known yet (the first read on a cold
 * instance failed); `value()` is that, or `whenUnknown`.
 */
export function keptSetting(read: () => Promise<boolean>, whenUnknown: boolean) {
  let last: boolean | null = null
  const answer = async (): Promise<boolean | null> => {
    try {
      last = await read()
    } catch {
      /* Not answered: the last answer this instance had, or nothing. */
    }
    return last
  }
  return {
    answer,
    value: async () => (await answer()) ?? whenUnknown,
    /** Tests: forget the kept answer. */
    forget: () => {
      last = null
    },
  }
}
