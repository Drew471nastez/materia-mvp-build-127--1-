import "server-only"

/**
 * The native review as the job's runner assembles it (../runner.ts): the site's own route draws the saved draft
 * (./render-remote.ts), the critic's browser photographs it with JavaScript off (visual-critic/shoot.ts), the
 * job's strong model reviews it, and every round of patches is saved through the job's own SiteIO.
 */
import { browserAvailable, shootPages } from "@/lib/ai-builder/visual-critic/shoot"
import type { ModelRef } from "../models"
import type { NativeReviewPort } from "../job"
import { remoteNativeRenderer } from "./render-remote"
import { reviewNativeDraft } from "./review"

export function nativeReviewFor(opts: { origin: string; installId: string; vision: ModelRef | null }): NativeReviewPort {
  const render = remoteNativeRenderer({ origin: opts.origin, installId: opts.installId })
  const port: NativeReviewPort = (req, hooks) =>
    reviewNativeDraft(req, { render, shoot: shootPages, available: browserAvailable, write: hooks.write, vision: opts.vision, schemas: hooks.schemas, progress: hooks.progress })
  port.available = browserAvailable
  return port
}
