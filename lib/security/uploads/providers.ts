import "server-only"

/**
 * ===========================================================================
 *  MALWARE ENGINES, BEHIND ONE INTERFACE
 * ===========================================================================
 * Every engine Storelib can use looks the same to the upload code:
 *
 *   interface MalwareProvider {
 *     name        "builtin", "clamav"
 *     isEnabled() whether it runs at all
 *     scan(input) a verdict for bytes in memory or a file in storage
 *   }
 *
 *   builtin   Storelib's own checks (inspect.ts): signatures, structure,
 *             ZIP contents, EICAR. Always on, no network, no setting.
 *   clamav    services/file-scanner in front of ClamAV. OFF unless
 *             SECURITY_MALWARE_PROVIDER=clamav and its URL and secret are
 *             set (provider-config.ts, lib/security/file-scanner-core.ts).
 *
 * Adding an engine later is one more object here and one more name in
 * provider-config.ts; the upload routes, the download gate, the log and the
 * admin page already go through activeProviders().
 *
 * HOW AN ENGINE'S ANSWER IS USED. The built-in verdict decides the upload
 * while the creator waits (well under a second). An engine reads the whole
 * file, which for a large one takes minutes, so it runs after the answer has
 * gone back (next/server after(), lib/security/uploads/pipeline.ts): a clean
 * verdict is recorded, an infected one removes the file and marks it
 * blocked, and no answer (the engine down or slow) changes nothing and is
 * logged. Nothing a creator or a buyer does ever waits on an engine.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { isScannerConfigured, scanBytes, scanStoredObject, type FileScanResult } from "@/lib/security/file-scanner"

import { inspectUpload, type UploadVerdict } from "./inspect"
import type { UploadContext } from "./policy"
import { readProviderSetting } from "./provider-config"

export interface ProviderScanInput {
  fileName: string
  context: UploadContext
  size: number | null
  /** The whole file, when a route already holds it. */
  bytes?: Uint8Array
  /** Or where it is in storage, read by the engine as a stream. */
  stored?: { admin: SupabaseClient; bucket: string; path: string }
  /** For logs: an asset id or a path. Never the file's contents. */
  ref?: string
  deadlineMs?: number
}

export interface ProviderVerdict {
  provider: string
  status: "clean" | "infected" | "no_verdict" | "skipped"
  threat?: string
  sha256?: string
  durationMs: number
  /** Why there is no verdict, for the log. */
  reason?: string
  engineVersion?: string | null
  signatures?: number | null
}

export interface MalwareProvider {
  name: string
  isEnabled(): boolean
  scan(input: ProviderScanInput): Promise<ProviderVerdict>
}

/** Storelib's own checks as a provider: the same verdict inspectUpload() gives, for bytes in memory. */
export const builtinProvider: MalwareProvider = {
  name: "builtin",
  isEnabled: () => true,
  async scan(input) {
    const t0 = Date.now()
    if (!input.bytes) return { provider: "builtin", status: "skipped", reason: "needs the bytes", durationMs: 0 }
    const size = input.bytes.byteLength
    const verdict: UploadVerdict = await inspectUpload({
      fileName: input.fileName,
      size,
      head: input.bytes.subarray(0, 8192),
      tail: { bytes: input.bytes.subarray(Math.max(0, size - 70_000)), start: Math.max(0, size - 70_000) },
      readRange: async (a, b) => input.bytes!.subarray(a, b + 1),
      context: input.context,
    })
    return verdict.ok
      ? { provider: "builtin", status: "clean", durationMs: Date.now() - t0 }
      : { provider: "builtin", status: "infected", threat: verdict.code, reason: verdict.detail, durationMs: Date.now() - t0 }
  },
}

function fromClamav(result: FileScanResult): ProviderVerdict {
  const base = {
    provider: "clamav",
    durationMs: result.durationMs,
    sha256: result.sha256,
    engineVersion: result.engine?.version ?? null,
    signatures: result.engine?.signatures ?? null,
  }
  if (result.status === "clean") return { ...base, status: "clean" }
  if (result.status === "infected") return { ...base, status: "infected", threat: result.threat }
  if (result.status === "not_scanned" && result.reason === "too_large") return { ...base, status: "skipped", reason: "too_large" }
  return { ...base, status: "no_verdict", reason: result.reason ?? "unknown" }
}

/** ClamAV through services/file-scanner. Enabled only by the explicit flag and its two settings. */
export const clamavProvider: MalwareProvider = {
  name: "clamav",
  isEnabled: () => readProviderSetting().requested === "clamav" && isScannerConfigured(),
  async scan(input) {
    if (!clamavProvider.isEnabled()) return { provider: "clamav", status: "skipped", reason: "not_enabled", durationMs: 0 }
    const options = { ref: input.ref, deadlineMs: input.deadlineMs ?? 240_000 }
    if (input.bytes) return fromClamav(await scanBytes(input.bytes, options))
    if (input.stored) return fromClamav(await scanStoredObject(input.stored.admin, input.stored.bucket, input.stored.path, { ...options, size: input.size }))
    return { provider: "clamav", status: "skipped", reason: "nothing to scan", durationMs: 0 }
  },
}

const EXTERNAL: readonly MalwareProvider[] = [clamavProvider]

/**
 * The engines that run in the background after the built-in checks. Empty
 * unless one is switched on, and then no network call is ever made.
 */
export function activeProviders(): MalwareProvider[] {
  return EXTERNAL.filter((p) => p.isEnabled())
}

/** For the admin page: what is on, in words that make the normal state look normal. */
export function providerStatus(): { builtin: true; external: string | null; requested: string | null; misconfigured: boolean; unknown: string | null } {
  const setting = readProviderSetting()
  const active = activeProviders()
  return {
    builtin: true,
    external: active[0]?.name ?? null,
    requested: setting.requested,
    misconfigured: setting.requested !== null && active.length === 0,
    unknown: setting.unknown,
  }
}
