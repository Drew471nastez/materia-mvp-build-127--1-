/**
 * ===========================================================================
 *  WHICH MALWARE ENGINE IS SWITCHED ON: NONE, UNLESS ONE IS NAMED
 * ===========================================================================
 * Storelib's own checks (inspect.ts) are always on and need nothing. A malware
 * engine is an extra, switched on by ONE explicit setting:
 *
 *   SECURITY_MALWARE_PROVIDER=clamav
 *
 * plus that engine's own settings (for ClamAV: CLAMAV_SERVICE_URL and
 * CLAMAV_SERVICE_SECRET, services/file-scanner/README.md). Without the flag
 * no engine is called, nothing waits for one, and the CLAMAV_* variables
 * change nothing, whether they are set or not. That is how production runs.
 *
 * Pure (reads only the object it is given), so the admin page and the tests
 * can ask it about any environment.
 */

export type ProviderName = "clamav"

export const KNOWN_PROVIDERS: readonly ProviderName[] = ["clamav"]

export interface ProviderSetting {
  /** The engine asked for, or null for built-in checks only (the normal state). */
  requested: ProviderName | null
  /** Asked for, but its own settings are missing or invalid: treated as off. */
  misconfigured: boolean
  /** An unknown name in the flag. Treated as off. */
  unknown: string | null
}

export function readProviderSetting(env: Record<string, string | undefined> = process.env): ProviderSetting {
  const raw = String(env.SECURITY_MALWARE_PROVIDER ?? "").trim().toLowerCase()
  if (!raw || raw === "none" || raw === "off" || raw === "builtin") return { requested: null, misconfigured: false, unknown: null }
  if (!(KNOWN_PROVIDERS as readonly string[]).includes(raw)) return { requested: null, misconfigured: false, unknown: raw.slice(0, 40) }
  return { requested: raw as ProviderName, misconfigured: false, unknown: null }
}

/** Whether the flag names ClamAV. Its URL and secret are checked by the client (file-scanner-core.ts). */
export function clamavRequested(env: Record<string, string | undefined> = process.env): boolean {
  return readProviderSetting(env).requested === "clamav"
}
