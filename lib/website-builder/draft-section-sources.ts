/**
 * Kept apart from ./storefront-render.ts on purpose: that file is what a
 * VISITOR's page reads, and it reads `content`, never a draft
 * (tests/builder-round-3.test.ts holds it to that). This one is only for the
 * person looking at their own unsaved work.
 */
import { isCompatSource } from "@/lib/storelib-theme/compat/theme"
import { sectionSources } from "./storefront-render"

/**
 * The section files as last SAVED, for one person looking at their own
 * unpublished work (a preview link with its token, a cover, the AI builder's
 * render check): the draft half wins where there is one, as in the builder
 * (theme-file-drafts.ts sourceMap). A file the AI builder wrote has only a
 * draft until somebody publishes, so a preview read from `content` alone drew
 * nothing for it. Never used for a visitor.
 */
export async function draftSectionSources(
  db: { from: (table: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  installId: string,
): Promise<Record<string, string>> {
  try {
    const { data, error } = await db
      .from("store_theme_custom_files")
      .select("path, content, draft_content")
      .eq("install_id", installId)
      .like("path", "%.storelib")
    if (error) return sectionSources(db as never, installId)
    const sources: Record<string, string> = {}
    for (const row of (data ?? []) as { path: string; content: string | null; draft_content?: string | null }[]) {
      const text = typeof row.draft_content === "string" && row.draft_content.trim() !== "" ? row.draft_content : row.content
      if (typeof text !== "string" || text.trim() === "") continue
      if (isCompatSource(text)) continue
      sources[row.path] = text
    }
    return sources
  } catch {
    return sectionSources(db as never, installId)
  }
}

