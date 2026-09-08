import "server-only"

/**
 * Reading and writing the canonical document.
 *
 * ===========================================================================
 *  TWO WRITERS, ONE STATE, AND A TOKEN THAT SAYS WHAT YOU SAW
 * ===========================================================================
 * A creator dragging a section and an agent run rewriting the page can be in
 * flight at the same moment, and "last write wins" would mean the drag
 * silently undoes the run or the other way round. So a write carries the
 * revision it was made against and the database decides: the UPDATE only
 * matches while the stored revision is still the expected one, and zero rows
 * changed IS the conflict.
 *
 * The caller is told to re-read rather than being merged automatically.
 * Automatic merge sounds better and is worse — two edits to the same prop have
 * no correct resolution, and picking one silently is how somebody's change
 * disappears without a trace.
 *
 * ===========================================================================
 *  WHICH WRITE GOES FIRST, AND WHY IT IS THE DOCUMENT
 * ===========================================================================
 * A save is two writes: the document, and the files rendered from it. They
 * cannot be one transaction through PostgREST, so one of them can land without
 * the other, and the order decides which way a half-failure breaks.
 *
 * The document goes first because it is the SOURCE. If the file write then
 * fails, the source is correct and the output is stale — recoverable by
 * rendering again, which the next read does anyway. The other order loses the
 * creator's actual change and keeps code nobody asked for.
 */

import { createClient } from "@/lib/supabase/server"
import { readProject, saveFiles } from "../projects"
import { isSiteDocument, type SiteDocument } from "./schema"
import { renderDocument } from "./render"

export type WriteResult =
  | { ok: true; revision: number }
  | { ok: false; error: string; conflict?: true }

/**
 * The site's document, or null when it has none.
 *
 * Null is a real answer, not a failure: sites built before this existed are
 * code projects with no document, and they go on being edited as files. A
 * malformed document reads as null for the same reason — a renderer handed a
 * document with holes in it produces a page with holes in it, and falling back
 * to the files the site already has is strictly better than that.
 */
export async function readDocument(siteId: string): Promise<SiteDocument | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("sites")
    .select("document")
    .eq("id", siteId)
    .maybeSingle()

  if (error) {
    /**
     * The column is added by a migration this project applies by hand. A
     * database without it must mean "this site has no document" rather than
     * taking the editor down — the same lesson as preview_revision, which took
     * the whole dashboard out by being in a shared column list too early.
     */
    return null
  }

  const value = (data as { document?: unknown } | null)?.document
  return isSiteDocument(value) ? value : null
}

/**
 * Store a document and regenerate the files it produces.
 *
 * `expectedRevision` is what the caller last saw. Omit it only for the first
 * write of a site's document, where there is nothing to race with.
 */
export async function writeDocument(
  siteId: string,
  doc: SiteDocument,
  expectedRevision?: number,
): Promise<WriteResult> {
  const supabase = await createClient()

  let query = supabase.from("sites").update({ document: doc }).eq("id", siteId)

  if (expectedRevision !== undefined) {
    /**
     * The comparison happens in Postgres, against the row as it is at this
     * instant. Reading the revision here and comparing it in JavaScript would
     * leave a window between the read and the write that is exactly where the
     * lost update lives.
     */
    query = query.filter("document->>revision", "eq", String(expectedRevision))
  }

  const { data, error } = await query.select("id")

  if (error) {
    return { ok: false, error: "This site's layout could not be saved. Try again." }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      conflict: true,
      error:
        expectedRevision === undefined
          ? "This site could not be updated."
          : "Somebody else changed this page while you were working. Reload to see their version before saving yours.",
    }
  }

  /**
   * The files are the output, written after the source. Existing files are
   * passed through so nothing outside the generated set — custom sections,
   * anything the agent wrote by hand — is taken by a render.
   */
  const existing = await readProject(siteId)
  const files = renderDocument(doc, existing)

  const changed: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    if (existing[path] !== content) changed[path] = content
  }

  if (Object.keys(changed).length > 0) {
    const saved = await saveFiles(siteId, changed)
    if (!saved.ok) {
      /**
       * The source landed and its output did not. Said plainly rather than
       * reported as a failed edit: the change IS saved, and the next render
       * reconciles the files. Claiming it failed would invite the creator to
       * make it again.
       */
      return {
        ok: false,
        error: "Your change was saved, but the site's code could not be rebuilt from it. Reload and try again.",
      }
    }
  }

  return { ok: true, revision: doc.revision }
}
