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

/**
 * One boolean of platform_settings: true or false when it is set, null when
 * there is no row (or no table). Throws a SettingUnread when the database did
 * not answer.
 */
export async function readSetting(key: string, client: SettingClient = createAdminClient() as unknown as SettingClient): Promise<boolean | null> {
  let answer: Awaited<ReturnType<ReturnType<ReturnType<ReturnType<SettingClient["from"]>["select"]>["eq"]>["maybeSingle"]>>
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const ctl = new AbortController()
    const query = client.from("platform_settings").select("value").eq("key", key)
    const bounded = typeof query.abortSignal === "function" ? query.abortSignal(ctl.signal) : query
    answer = await Promise.race([
      bounded.maybeSingle(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctl.abort()
          reject(new Error(`no answer in ${SETTING_READ_MS}ms`))
        }, SETTING_READ_MS)
      }),
    ])
  } catch (e) {
    throw new SettingUnread(key, e instanceof Error ? e.message : String(e))
  } finally {
    if (timer) clearTimeout(timer)
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
