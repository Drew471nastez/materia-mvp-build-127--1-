/**
 * ===========================================================================
 *  REGENERATE: A NEW PICTURE IN PLACE OF ONE THE AI MADE (round P, P1)
 * ===========================================================================
 * POST /api/website-builder/images/regenerate { url } → { url, width, height, alt }
 *
 *   who      the store's owner only (a team member is refused: it spends the
 *            owner's AI money); signed out is 401
 *   what     only a picture in the owner's own AI folder that has a record of
 *            what it was made from (file_details.origin, part 441); anything
 *            else is "not one the AI made"
 *   how much rate limited per store (LIMITS.aiImage: 5 in ten minutes, 30 a
 *            day) and each one capped at AI_IMAGE_REGENERATE_MAX_USD (default
 *            0.10): a provider whose estimate is over it is not asked
 *   result   a NEW file beside the old one (the old one stays in Files, so an
 *            undo in the editor still shows it); the picker sets the new url
 *
 * The handler takes its collaborators so the tests drive auth, ownership,
 * the limit and the cap without Supabase or a provider.
 */
import { aiImagePathOf, isAiImagePath } from "./paths"
import type { ImageOrigin, ImageOutcome } from "./types"

export interface RegenerateCaller {
  error: string | null
  status: number
  creatorId: string | null
  isOwner: boolean
  ownerUserId: string | null
}

export interface RegenerateDeps {
  caller: () => Promise<RegenerateCaller>
  /** A Response when the store is over its limit, else null. */
  limited: (creatorId: string) => Promise<Response | null>
  readOrigin: (creatorId: string, path: string) => Promise<{ origin: ImageOrigin; alt: string | null } | null>
  regenerate: (input: { creatorId: string; ownerUserId: string; origin: ImageOrigin; alt: string | null; maxUsd: number }) => Promise<ImageOutcome>
  maxUsd?: number
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

export function regenerateMaxUsd(e: Record<string, string | undefined> = process.env): number {
  const n = Number(e.AI_IMAGE_REGENERATE_MAX_USD)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1) : 0.1
}

export async function handleRegenerate(request: Request, deps: RegenerateDeps): Promise<Response> {
  const who = await deps.caller()
  if (who.error !== null || !who.creatorId || !who.ownerUserId) {
    const status = who.status === 401 ? 401 : who.status === 503 ? 503 : 403
    return json({ error: status === 401 ? "Sign in to do this." : status === 503 ? "Could not check your account. Try again." : "Only the store owner can make a new picture." }, status)
  }
  if (!who.isOwner) return json({ error: "Only the store owner can make a new picture." }, 403)

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null
  const path = aiImagePathOf(body?.url)
  if (!path || !isAiImagePath(who.ownerUserId, path)) return json({ error: "That picture was not made by the AI." }, 404)

  const limited = await deps.limited(who.creatorId)
  if (limited) return limited

  const found = await deps.readOrigin(who.creatorId, path)
  if (!found) return json({ error: "That picture was not made by the AI." }, 404)

  const out = await deps.regenerate({ creatorId: who.creatorId, ownerUserId: who.ownerUserId, origin: found.origin, alt: found.alt, maxUsd: deps.maxUsd ?? regenerateMaxUsd() })
  if (!out.ok) {
    const status = out.code === "no_provider" ? 503 : out.code === "unsafe" ? 422 : 502
    const error = out.code === "no_provider" ? "Making pictures is not set up yet." : out.code === "unsafe" ? "That picture can't be made again." : "Could not make a new picture. Try again."
    return json({ error }, status)
  }
  return json({ url: out.url, width: out.width, height: out.height, alt: out.alt, source: out.source })
}
