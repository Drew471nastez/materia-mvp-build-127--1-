/**
 * Where the AI's pictures live, read from an address or a path (round P, P1).
 * Pure, so the editor's image picker can tell an AI picture from an upload.
 */
import { AI_IMAGE_FOLDER } from "./types"

/** A path in the AI folder of this owner, and nothing else: what Regenerate accepts. */
export function isAiImagePath(ownerUserId: string, path: unknown): path is string {
  if (typeof path !== "string" || path.includes("..") || path.includes("//")) return false
  return new RegExp(`^${ownerUserId.replace(/[^A-Za-z0-9-]/g, "")}/${AI_IMAGE_FOLDER}/[A-Za-z0-9_.-]{3,120}$`).test(path) && path.length <= 300
}

/** The bucket path of a picture from its /media/ (or storage) address, or null for anything that is not one of ours. */
export function aiImagePathOf(url: unknown): string | null {
  if (typeof url !== "string") return null
  const m = /\/(?:media|storage\/v1\/object\/public)\/store-builder-images\/([A-Za-z0-9-]+\/ai-images\/[A-Za-z0-9_.-]{3,120})(?:[?#].*)?$/.exec(url.trim())
  return m ? m[1] : null
}
