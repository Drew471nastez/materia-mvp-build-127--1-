/**
 * A file's version, as ProjectFileWrite.expectedVersion names it: the
 * sha256 (hex) of the draft text a writer read. The same hash the compiler
 * caches by (lib/storelib-theme/storelib/compile.ts sourceHash), so one text
 * has one version everywhere. Server only (node:crypto); the browser's
 * copy is lib/ai-builder/edit-request.ts browserFileVersion.
 */
import { sourceHash } from "@/lib/storelib-theme/storelib/compile"

export function fileVersion(text: string): string {
  return sourceHash(text)
}
