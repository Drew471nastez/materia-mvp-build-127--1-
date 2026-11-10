import "server-only"

/**
 * The reference library on the real services: Supabase (service role, server
 * only), sharp, and the vision model through the existing provider
 * resolution on Storelib's own key (resolveProvider, Anthropic,
 * claude-opus-5-5). What the AI surfaces and the admin routes import.
 */
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveProvider } from "@/lib/sites/agent/provider"
import { createReferenceAdmin } from "./admin"
import { analyzeReference, REFERENCE_ANALYSIS_MODEL } from "./analyze"
import { sharpTransformer } from "./ingest"
import { findReferencesIn, referenceImagesFrom } from "./store"
import type { BriefLike, SearchOptions } from "./search"
import type { DesignReference } from "./types"

type Db = Parameters<typeof findReferencesIn>[0]
const db = () => createAdminClient() as unknown as Db

/** THE SHARED NAME, server side: searchReferences over the built in library and the admin's screenshots. */
export function findReferences(brief: BriefLike, opts: Omit<SearchOptions, "extra"> = {}): Promise<DesignReference[]> {
  return findReferencesIn(db(), brief, opts)
}

/** THE SHARED NAME: base64 pictures for the references that have one (uploads), for multimodal turns. */
export function referenceImagesFor(ids: readonly string[]) {
  return referenceImagesFrom(db(), ids)
}

/** The admin routes' handlers on the real services. */
export function referenceAdmin() {
  return createReferenceAdmin({
    isAdmin: isAdminAuthenticated,
    db,
    transform: sharpTransformer,
    analyze: async (images, notes) => {
      /* Storelib's key, never a creator's: the curator's library is Storelib's. Claude only (vision on the documented model). */
      const resolved = resolveProvider({ requested: "anthropic", tier: "strong" })
      if (resolved.id !== "anthropic") return { ok: false, error: "Claude is not set up on this deployment (ANTHROPIC_API_KEY).", usage: { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, model: REFERENCE_ANALYSIS_MODEL }
      return analyzeReference({ images, notes, provider: resolved.provider, model: REFERENCE_ANALYSIS_MODEL, signal: AbortSignal.timeout(110_000) })
    },
  })
}
