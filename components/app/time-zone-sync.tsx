"use client"

import { useEffect } from "react"
import { rememberTimeZone } from "@/lib/orders/time-zone"
import { TIME_ZONE_STORAGE_KEY, validTimeZone } from "@/lib/account/time-zone"

/**
 * THE ACCOUNT'S TIME ZONE ON THIS DEVICE (lib/account/time-zone).
 *
 * The browser side of Analytics, Orders, Emails, Payouts and Home reads the
 * zone from localStorage and the server renders in the `storelib_tz` cookie
 * (lib/orders/time-zone). This makes both the account's, on every device:
 * the layout's inline script writes it before anything hydrates, and this
 * repeats it after a navigation in the app, where that script does not run.
 *
 * An account with no zone yet is given one, once: the zone this browser
 * chose before it was saved anywhere, else the device's own.
 */
const KEY = TIME_ZONE_STORAGE_KEY

export function TimeZoneSync({ accountZone }: { accountZone: string | null }) {
  useEffect(() => {
    if (accountZone) {
      try {
        if (localStorage.getItem(KEY) !== accountZone) localStorage.setItem(KEY, accountZone)
      } catch {
        /* Storage refused (a private window): the cookie below still carries it. */
      }
      if (!document.cookie.includes(`storelib_tz=${encodeURIComponent(accountZone)}`)) rememberTimeZone(accountZone)
      return
    }
    try {
      if (sessionStorage.getItem("storelib_tz_asked")) return
      sessionStorage.setItem("storelib_tz_asked", "1")
    } catch {
      /* Asked again next page at worst. */
    }
    let chosen: string | null = null
    try {
      chosen = validTimeZone(localStorage.getItem(KEY))
    } catch {
      chosen = null
    }
    const zone = chosen ?? validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    if (!zone) return
    void fetch("/api/account/time-zone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone: zone }),
    }).catch(() => undefined)
  }, [accountZone])
  return null
}
