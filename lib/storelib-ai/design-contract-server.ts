/**
 * The install's DESIGN.md (round O, O2's per-site design contract), read for
 * the editor's AI surfaces whose routes otherwise read only the .storelib
 * files: the Ask for a change agent and Code a section. Read with the
 * caller's own client, so row level security decides as it does for every
 * other file. Never throws: no contract is a normal answer.
 */
import { editorContent } from "@/lib/website-builder/theme-file-drafts"
import { findDesignContract } from "./surfaces"
import { fileCols, resolveRefs } from "@/lib/website-builder/theme-file-refs"

type Row = { path: string; content: string | null; draft_content?: string | null }

/** The smallest client shape this needs (a Supabase client fits). */
type FilesDb = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        ilike(column: string, pattern: string): { limit(n: number): PromiseLike<{ data: unknown; error: unknown }> }
      }
    }
  }
}

export async function readDesignContract(db: unknown, installId: string): Promise<{ path: string; text: string } | null> {
  try {
    const { data, error } = await (db as FilesDb).from("store_theme_custom_files").select(await fileCols("path, content, draft_content")).eq("install_id", installId).ilike("path", "%design.md").limit(4)
    if (error || !Array.isArray(data)) return null
    return findDesignContract((await resolveRefs(data as Row[])).map((r) => ({ path: r.path, text: editorContent({ content: r.content ?? "", draft_content: r.draft_content ?? null }) })))
  } catch {
    return null
  }
}
