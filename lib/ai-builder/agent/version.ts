import { createHash } from "node:crypto"

/** A file's version: sha256 (hex) of its draft text (ProjectFileWrite.expectedVersion). */
export function versionOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}
