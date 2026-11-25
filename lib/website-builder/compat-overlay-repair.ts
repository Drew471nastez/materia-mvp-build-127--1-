/**
 * ===========================================================================
 *  AN IMPORTED THEME'S OVERLAY GROUP, FILLED IN FOR AN EARLIER IMPORT
 * ===========================================================================
 * A theme whose layout draws its overlay group from a {% liquid %} block
 * (Materia's Posturex: `sections 'overlay-group'`) was imported with an empty
 * Overlay group: its phone tab bar, popups and back to top drew on the site,
 * from the group file, but the sidebar had nothing to select. The import reads
 * it now (lib/storelib-theme/shopify/convert.ts); this does the same for a
 * theme imported before, from the install's own files, when the editor opens
 * a page whose sections hold no Overlay group. Nothing is written here: the
 * editor's next save stores the sections, and the site draws the page's copy
 * of the group from then on (compat/theme.ts, renderGroup).
 */
import { compatOf } from "@/lib/storelib-theme/compat/install"
import { overlayFromFiles } from "@/lib/storelib-theme/shopify/convert"
import type { SectionInstance } from "./types"
import { fileCols, resolveRefs } from "@/lib/website-builder/theme-file-refs"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function withOverlayFilledIn(db: Db, installId: string, sections: SectionInstance[] | null): Promise<SectionInstance[] | null> {
  if (!sections || sections.length === 0 || sections.some((s) => s.group === "overlay")) return sections
  try {
    const { data: settingsRow } = await db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
    const row = settingsRow as { settings?: unknown; draft_settings?: unknown } | null
    const compat = compatOf(row?.draft_settings ?? row?.settings)
    if (!compat) return sections
    const cols = await fileCols("path, content, draft_content")
    const [{ data: layout }, { data: groups }, { data: names }] = await Promise.all([
      db.from("store_theme_custom_files").select(cols).eq("install_id", installId).eq("path", "layout/theme.storelib"),
      db.from("store_theme_custom_files").select(cols).eq("install_id", installId).like("path", "shopify/sections/%.json"),
      db.from("store_theme_custom_files").select("path").eq("install_id", installId).like("path", "sections/%.storelib"),
    ])
    const rows: Record<string, string> = {}
    for (const f of await resolveRefs([...(layout ?? []), ...(groups ?? [])] as { path: string; content: string | null; draft_content?: string | null }[])) {
      const text = f.draft_content ?? f.content
      if (typeof text === "string") rows[f.path] = text
    }
    for (const n of (names ?? []) as { path: string }[]) rows[n.path] ??= ""
    const { sections: overlay } = overlayFromFiles(rows, compat.renamed ?? {})
    if (overlay.length === 0) return sections
    const taken = new Set(sections.map((s) => s.id))
    return [...sections, ...(overlay.filter((s) => !taken.has(s.id)) as unknown as SectionInstance[])]
  } catch {
    /* The page as it is stored: an Overlay group missing is better than a page that does not open. */
    return sections
  }
}
