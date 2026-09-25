/**
 * ===========================================================================
 *  THE ACCOUNT'S TIME ZONE
 * ===========================================================================
 * "Make sure changing the time zone actually changes something in the
 * backend, is useful and works."
 *
 * It used to be saved in the browser's localStorage and nowhere else: a new
 * computer or phone started over from its own clock, and nothing on the
 * server could know it. Now it is the account's, an IANA name checked
 * against the list this server's Intl knows:
 *
 *   saved by       app/api/account/time-zone (Settings, and the first run of
 *                  /app, which gives it the browser's zone)
 *   kept in        profiles.timezone (supabase/sql/run-now/22), read by the
 *                  sale emails, and the account's metadata, read by pages
 *                  that already hold the user, at no extra query
 *   followed by    the Home greeting, the Orders page's first render, the
 *                  sale and first sale emails, and on every device the
 *                  browser side of Analytics, Orders, Emails, Payouts and
 *                  Home (app/app/layout writes it where lib/orders/time-zone
 *                  reads it)
 */

/** The account metadata key it is kept under. */
export const TIME_ZONE_KEY = "timezone"
/** Where the browser side reads it (lib/orders/time-zone, lib/timezone). */
export const TIME_ZONE_STORAGE_KEY = "storelib_timezone"

/**
 * Written into /app's first HTML by the layout, so the zone is in
 * localStorage before any page hydrates and reads it. Only ever given a
 * validated zone: letters, digits and _ + - / are safe inside a script.
 */
export function timeZoneScript(zone: string): string {
  const safe = validTimeZone(zone)
  if (!safe) return ""
  return `try{localStorage.setItem(${JSON.stringify(TIME_ZONE_STORAGE_KEY)},${JSON.stringify(safe)})}catch(e){}`
}

let known: Set<string> | null = null
function knownZones(): Set<string> {
  if (known) return known
  let list: string[] = []
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []
  } catch {
    list = []
  }
  known = new Set([...list, "UTC"])
  return known
}

/**
 * The zone's canonical IANA name, or null when it is not one this runtime
 * knows. "Europe/Kiev" and "Europe/Kyiv" both come back as whichever this
 * Intl calls it; anything that is not a zone ("Mars/Olympus", a script) is
 * null.
 */
export function validTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return null
  let resolved: string
  try {
    resolved = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone
  } catch {
    return null
  }
  const zones = knownZones()
  if (zones.size <= 1) return resolved
  if (zones.has(resolved)) return resolved
  if (zones.has(value)) return value
  /* "Etc/UTC", "Etc/GMT": the same clock as UTC. */
  return /^(Etc\/)?(UTC|GMT|UCT|Zulu|Universal)$/i.test(resolved) ? "UTC" : null
}

/** The zone the account chose: the profile's column, else the one kept on the account. */
export function accountTimeZone(
  profileZone: unknown,
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  return validTimeZone(profileZone) ?? validTimeZone(metadata?.[TIME_ZONE_KEY])
}

type Admin = {
  from: (table: string) => any
  auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { user_metadata?: Record<string, unknown> } | null } }> } }
}

/**
 * A creator's zone, for a server job that knows only the creator (a sale
 * email). The profile row is read whole, so a database without the column
 * yet answers too; then the account's metadata. Null when neither has one,
 * and the caller writes UTC and says so.
 */
export async function creatorTimeZone(admin: Admin, creatorId: string): Promise<string | null> {
  try {
    const { data: creator } = await admin.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
    const userId = (creator as { user_id?: string } | null)?.user_id
    if (!userId) return null
    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle()
    const fromColumn = validTimeZone((profile as { timezone?: unknown } | null)?.timezone)
    if (fromColumn) return fromColumn
    const { data } = await admin.auth.admin.getUserById(userId)
    return validTimeZone(data?.user?.user_metadata?.[TIME_ZONE_KEY])
  } catch {
    return null
  }
}

/** "Tuesday, October 1, 2026 at 9:40 AM GMT+3" in the creator's zone, or in UTC saying so. */
export function formatForCreator(at: Date | string | number, timeZone: string | null): { date: string; time: string } {
  const when = new Date(at)
  const zone = timeZone ?? "UTC"
  try {
    return {
      date: new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(when),
      time: new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(when),
    }
  } catch {
    return { date: when.toUTCString(), time: "" }
  }
}
