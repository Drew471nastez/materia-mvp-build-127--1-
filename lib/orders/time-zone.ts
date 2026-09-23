/**
 * THE SAME CLOCK ON BOTH SIDES
 *
 * "Today at 9:40 am" and a Today metric both depend on the viewer's time
 * zone, which the server does not know. Rendering in the server's zone and
 * correcting in the browser is a visible jump on every visit, so the browser
 * writes its zone into a cookie and the server renders in it from then on.
 * Only the very first visit renders in UTC and corrects itself once.
 *
 * The zone is the one the creator picked in settings (localStorage, see
 * lib/timezone.ts) and otherwise the device's own.
 */

export const TIME_ZONE_COOKIE = "storelib_tz"
const SETTING_KEY = "storelib_timezone"

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function readTimeZone(cookie: string | undefined | null): string {
  if (!cookie) return "UTC"
  let value = cookie
  try {
    value = decodeURIComponent(cookie)
  } catch {
    /* Not encoded. */
  }
  return isTimeZone(value) ? value : "UTC"
}

/** Browser only. */
export function viewerTimeZone(): string {
  try {
    const chosen = localStorage.getItem(SETTING_KEY)
    if (isTimeZone(chosen)) return chosen
  } catch {
    /* Storage can be unavailable in a private window. */
  }
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone
  return isTimeZone(device) ? device : "UTC"
}

/** Browser only. */
export function rememberTimeZone(timeZone: string): void {
  try {
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(timeZone)}; path=/; max-age=31536000; samesite=lax`
  } catch {
    /* A refused cookie only costs the one correction on the next visit. */
  }
}
