import "server-only"

/**
 * The native engine's readers on the real services (./engine.ts
 * NativeEngineDeps), every one scoped to the job's creator and every one
 * allowed to fail: a read that fails is "nothing", never an error.
 *
 *   images    the creator's own AI pictures (P1, store-builder-images/
 *             <owner>/ai-images/) with their alt text;
 *   forms     the creator's published forms (native_form takes the id);
 *   designMd  the install's DESIGN.md, O2's design contract.
 */
import { readDesignContract } from "@/lib/storelib-ai/design-contract-server"
import { AI_IMAGE_BUCKET, AI_IMAGE_FOLDER } from "@/lib/storelib-ai/images/types"
import { mediaUrl } from "@/lib/storage/media-url"
import type { NativeEngineDeps } from "./engine"
import type { NativeForm, NativeImage } from "./types"

type Db = any // eslint-disable-line @typescript-eslint/no-explicit-any

export function nativeServerDeps(admin: Db, job: { creatorId: string; ownerUserId: string | null; installId: string }): NativeEngineDeps {
  return {
    async images(): Promise<NativeImage[]> {
      if (!job.ownerUserId) return []
      const { data, error } = await admin
        .from("file_details")
        .select("bucket, path, alt_text")
        .eq("creator_id", job.creatorId)
        .eq("bucket", AI_IMAGE_BUCKET)
        .like("path", `${job.ownerUserId}/${AI_IMAGE_FOLDER}/%`)
        .limit(24)
      if (error || !Array.isArray(data)) return []
      return (data as { path: string; alt_text: string | null }[])
        .filter((r) => typeof r.path === "string" && r.path.startsWith(`${job.ownerUserId}/`))
        .map((r) => ({ url: mediaUrl(String(admin.storage.from(AI_IMAGE_BUCKET).getPublicUrl(r.path).data.publicUrl)), alt: (r.alt_text ?? "").slice(0, 200) }))
    },
    async forms(): Promise<NativeForm[]> {
      if (!job.ownerUserId) return []
      const { data, error } = await admin.from("native_forms").select("id, title").eq("owner_id", job.ownerUserId).eq("status", "published").limit(20)
      if (error || !Array.isArray(data)) return []
      return (data as { id: string; title: string | null }[]).map((f) => ({ url: String(f.id), id: String(f.id), name: (f.title ?? "Form").slice(0, 80) }))
    },
    async designMd() {
      return (await readDesignContract(admin, job.installId))?.text ?? null
    },
  }
}
