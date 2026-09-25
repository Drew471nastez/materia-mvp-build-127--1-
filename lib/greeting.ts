/**
 * "Good morning" by the creator's own clock.
 *
 * The zone is decided in this order, most trustworthy first: the one saved
 * on the account in Settings (lib/account/time-zone), then the one the
 * creator picked in settings or their device's own (remembered in a cookie
 * once the app has run in their browser, lib/orders/time-zone.ts), then the
 * zone of their connection (Vercel's x-vercel-ip-timezone), then UTC. The
 * browser checks again once it is running, because a VPN or a trip abroad
 * can make the connection's zone the wrong one.
 */
import { isTimeZone, readTimeZone } from "./orders/time-zone"

export type DayPart = "morning" | "afternoon" | "evening" | "night"

export function hourIn(now: number, timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date(now))
    return Number(h) % 24
  } catch {
    return new Date(now).getUTCHours()
  }
}

/** 5 to 12 morning, 12 to 18 afternoon, 18 to 22 evening, the rest night. */
export function dayPart(now: number, timeZone: string): DayPart {
  const h = hourIn(now, timeZone)
  if (h >= 5 && h < 12) return "morning"
  if (h >= 12 && h < 18) return "afternoon"
  if (h >= 18 && h < 22) return "evening"
  return "night"
}

export function greetingZone(
  cookieZone: string | undefined | null,
  ipZone: string | undefined | null,
  /** The zone saved on the account in Settings (lib/account/time-zone): first, on every device. */
  accountZone?: string | null,
): string {
  if (accountZone && isTimeZone(accountZone)) return accountZone
  const chosen = readTimeZone(cookieZone)
  if (cookieZone && chosen !== "UTC") return chosen
  return isTimeZone(ipZone) ? ipZone : chosen
}

/** "Andrew" from "Andrew Nastase". A handle-like name is used as it is. */
export function firstName(displayName: string): string {
  const name = (displayName || "").trim()
  if (!name) return ""
  return name.split(/\s+/)[0]
}
