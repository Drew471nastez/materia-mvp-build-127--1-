import "server-only"

/**
 * ===========================================================================
 *  A MALWARE ENGINE'S LOOK AT A STORED FILE THAT HAS NO ASSET ROW
 * ===========================================================================
 * Product files get the engine's verdict through their digital_assets row
 * (pipeline.ts afterProductUpload). A community post's file has no row: the
 * path is the record (lib/communities/server/post-files.ts). This is the
 * same engine step for such a file: after the answer has gone (nothing
 * waits on it), every switched on engine (providers.ts activeProviders,
 * ClamAV when SECURITY_MALWARE_PROVIDER=clamav) reads it from storage; an
 * infected file is deleted, so its download stops working, and every
 * verdict is in the security log. With no engine switched on it does
 * nothing at all and makes no network call.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { logSecurityEvent } from "./audit"
import { runAfterResponse } from "./pipeline"
import { activeProviders, type MalwareProvider } from "./providers"
import type { UploadContext } from "./policy"

export interface StoredFile {
  bucket: string
  path: string
  fileName: string
  size: number | null
  context: UploadContext
  userId?: string | null
  creatorId?: string | null
}

/** Swappable in tests. */
export const engineAfterDeps = {
  providers: (): MalwareProvider[] => activeProviders(),
  deadlineMs: 240_000,
}

/** The engines' verdicts, now. Answers "infected" when any engine found something (the file is then gone). */
export async function scanStoredWithEngines(admin: SupabaseClient, file: StoredFile): Promise<"skipped" | "clean" | "infected" | "no_verdict"> {
  const engines = engineAfterDeps.providers()
  if (!engines.length) return "skipped"
  const deadline = Date.now() + engineAfterDeps.deadlineMs
  let outcome: "clean" | "infected" | "no_verdict" = "clean"
  for (const engine of engines) {
    const left = deadline - Date.now()
    if (left < 5_000) {
      outcome = "no_verdict"
      break
    }
    const result = await engine.scan({ fileName: file.fileName, context: file.context, size: file.size, stored: { admin, bucket: file.bucket, path: file.path }, ref: `${file.bucket}/${file.path}`, deadlineMs: left })
    const infected = result.status === "infected"
    if (infected) {
      await admin.storage
        .from(file.bucket)
        .remove([file.path])
        .then(
          () => undefined,
          () => undefined,
        )
      outcome = "infected"
    } else if (result.status !== "clean") outcome = outcome === "clean" ? "no_verdict" : outcome
    await logSecurityEvent(admin, {
      event: "provider_scan",
      outcome: infected ? "removed" : result.status === "clean" ? "info" : "noted",
      context: file.context,
      code: infected ? "provider_infected" : result.status,
      provider: engine.name,
      bucket: file.bucket,
      path: file.path,
      userId: file.userId ?? null,
      creatorId: file.creatorId ?? null,
      bytes: file.size,
      sha256: result.sha256 ?? null,
      detail: { status: result.status, threat: result.threat, reason: result.reason, durationMs: result.durationMs, engineVersion: result.engineVersion, signatures: result.signatures },
    })
    if (infected) break
  }
  return outcome
}

/** The same, after the response has gone (next/server after()); one line at the end of an upload's completion. */
export function scanStoredAfterResponse(admin: SupabaseClient, file: StoredFile): void {
  if (!engineAfterDeps.providers().length) return
  runAfterResponse(() => scanStoredWithEngines(admin, file))
}
