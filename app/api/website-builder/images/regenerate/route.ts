/**
 * POST { url } → { url, width, height, alt }: a new picture in place of one
 * the AI made, from what it was made from. Owner only, rate limited, each one
 * cost capped. The rules are in lib/storelib-ai/images/regenerate.ts.
 */
import type { NextRequest } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { handleRegenerate } from "@/lib/storelib-ai/images/regenerate"
import { readImageOrigin } from "@/lib/storelib-ai/images/store"
import { regenerateImage } from "@/lib/storelib-ai/images/generate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* One image call (up to two minutes with its retry) and the upload. */
export const maxDuration = 300

export async function POST(request: NextRequest) {
  return handleRegenerate(request, {
    caller: async () => {
      const c = await websiteCaller()
      return { error: c.error, status: c.status, creatorId: c.creatorId, isOwner: c.isOwner, ownerUserId: c.ownerUserId }
    },
    limited: (creatorId) => rateLimit({ bucket: "ai-image", subjects: [creatorId], windows: LIMITS.aiImage, message: "That is a lot of new pictures in a short time. Try again later." }),
    readOrigin: (creatorId, path) => readImageOrigin(createAdminClient(), creatorId, path),
    regenerate: (input) => regenerateImage(input),
  })
}
