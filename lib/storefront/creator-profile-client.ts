/**
 * ===========================================================================
 *  ONE WAY TO SAVE THE CREATOR PAGE FROM THE PAGE (round 50)
 * ===========================================================================
 * Edit profile, Arrange and the bar at the top each sent their own PATCH to
 * /api/creator-profile. They still do, through this, so each save is also
 * kept as an undo step for the editor around the page: the route answers
 * with the body that puts the save back (lib/storefront/creator-profile-undo)
 * and this hands the pair to lib/store-builder/editor-channel, which sends it
 * up with the "saved" message. At the page's own address nothing is kept.
 */
import { recordEditorStep } from "@/lib/store-builder/editor-channel"

export interface CreatorProfileAnswer {
  ok: boolean
  status: number
  data: Record<string, unknown>
}

export async function saveCreatorProfile(body: Record<string, unknown>, label: string): Promise<CreatorProfileAnswer> {
  const res = await fetch("/api/creator-profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  if (res.ok && data.undo && typeof data.undo === "object") {
    recordEditorStep({ label, redo: body, undo: data.undo as Record<string, unknown> })
  }
  return { ok: res.ok, status: res.status, data }
}
