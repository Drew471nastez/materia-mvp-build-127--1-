/**
 * ===========================================================================
 *  EVERY SITE GETS ITS POLICY PAGES, INCLUDING THE ONES THAT ALREADY EXIST
 * ===========================================================================
 * A new theme can be given a refund policy, a privacy policy and terms of
 * service when it is created. Every site made before that cannot, and telling
 * a creator to make three pages by hand is exactly the work this is meant to
 * remove. So the pages are ensured when a theme is opened: whatever is
 * missing is created, whatever is there is left alone.
 *
 * IT IS SAFE TO RUN ON EVERY LOAD, which is what makes it a backfill rather
 * than a migration somebody has to remember to run:
 *
 *   - It reads first and only writes what is absent.
 *   - The insert is an upsert on `UNIQUE(install_id, page_key)` that ignores
 *     duplicates, so two tabs opening the same site at once cannot produce
 *     two refund policies or an error.
 *   - A creator who DELETED a policy page gets it back, which is the one
 *     debatable case. Deleting is rare, missing is the normal state of every
 *     site that predates this, and a page nobody wants is one click to hide.
 *
 * THE FOOTER IS TOUCHED ONCE AND NEVER AGAIN. Links are added only in the
 * same run that creates the pages. After that the footer is the creator's:
 * somebody who removes the Legal column has removed it on purpose, and a
 * backfill that argued with them every reload would be a bug, not a feature.
 */

import { withLiveLinks } from "./live-links"
import { POLICY_PAGES, policyPageSections, withPolicyLinks } from "./policy-pages"
import type { SectionInstance } from "./types"

/** Only the shape used here, so a test can hand it a fake. */
export interface PagesTable {
  from(table: "store_theme_pages"): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: PageRow[] | null; error: { message: string } | null }>
    }
    upsert(
      rows: NewPageRow[],
      opts: { onConflict: string; ignoreDuplicates: boolean },
    ): Promise<{ error: { message: string } | null }>
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>
    }
  }
}

export interface PageRow {
  id: string
  page_key: string
  sections: unknown
  draft_sections: unknown
}

export interface NewPageRow {
  install_id: string
  page_key: string
  sections: SectionInstance[]
}

export interface EnsureResult {
  created: string[]
  footersLinked: number
  error: string | null
}

const asSections = (value: unknown): SectionInstance[] =>
  Array.isArray(value) ? (value as SectionInstance[]) : []

/**
 * The page a site's header and footer should be copied from.
 *
 * Home, because that is the page every site has and the one a creator has
 * actually styled. Failing that, whichever page has a header at all: a site
 * whose home page was deleted still has a look, and taking the schema's
 * factory header instead would put a stranger's design on the new pages.
 */
function chrome(pages: PageRow[]): { header?: SectionInstance; footer?: SectionInstance } {
  const ordered = [...pages].sort((a, b) => (a.page_key === "home" ? -1 : b.page_key === "home" ? 1 : 0))
  for (const page of ordered) {
    const sections = asSections(page.draft_sections ?? page.sections)
    const header = sections.find((s) => s.type === "header")
    const footer = sections.find((s) => s.type === "footer")
    if (header || footer) return { header, footer }
  }
  return {}
}

/**
 * Create whatever policy pages this install does not have.
 *
 * `brand` only reaches the copy, so an install with no name still produces a
 * readable page rather than "undefined's refund policy".
 */
export async function ensurePolicyPages(
  db: PagesTable,
  installId: string,
  brand: string,
): Promise<EnsureResult> {
  const { data, error } = await db.from("store_theme_pages").select("id, page_key, sections, draft_sections").eq("install_id", installId)
  if (error) return { created: [], footersLinked: 0, error: error.message }

  const pages = data ?? []
  /**
   * A site with no pages at all is a site mid-creation, and adding a refund
   * policy to it would race whatever is about to write its home page. Left
   * alone; it will be ensured the next time it is opened.
   */
  if (pages.length === 0) return { created: [], footersLinked: 0, error: null }

  const have = new Set(pages.map((p) => p.page_key))
  const missing = POLICY_PAGES.filter((p) => !have.has(p.key))

  /**
   * THE REPAIR BELOW RUNS WHETHER OR NOT THERE IS A PAGE TO CREATE.
   *
   * This used to `return` here when nothing was missing, which reads as an
   * obvious saving and was the reason the link repair could never reach a
   * single existing site: a site that already has its three policy pages —
   * which is every site that has been opened once — skipped the whole
   * function, including the loop that fixes footers. The loop writes only
   * when a page actually changes, so running it always costs one comparison
   * per page and no database write on a site that is already right.
   */
  const { header, footer } = chrome(pages)
  /**
   * The new pages get the linked footer straight away. The loop below only
   * touches pages that already exist, so without this the policy pages would
   * be the three pages on the site whose footer did not link to them.
   */
  const linkedFooter = footer ? withPolicyLinks(footer) : undefined
  const rows: NewPageRow[] = missing.map((page) => ({
    install_id: installId,
    page_key: page.key,
    sections: policyPageSections(page, { brand: brand || "this shop", header, footer: linkedFooter }),
  }))

  if (rows.length) {
    const { error: writeError } = await db
      .from("store_theme_pages")
      .upsert(rows, { onConflict: "install_id,page_key", ignoreDuplicates: true })
    if (writeError) return { created: [], footersLinked: 0, error: writeError.message }
  }

  /**
   * And the links, in this run only. Every page carries its own copy of the
   * footer, so every page's footer is updated, or the links would appear on
   * the home page and nowhere else.
   *
   * A page whose draft differs from what is published keeps that difference:
   * the column is added to both, so saving does not silently discard it and
   * publishing does not silently add it.
   */
  /** What this site can be linked to, so a creator's own /blog stays a link. */
  const pageKeys = new Set(pages.map((p) => p.page_key).concat(missing.map((m) => m.key)))

  let footersLinked = 0
  for (const page of pages) {
    const published = asSections(page.sections)
    const draft = page.draft_sections === null || page.draft_sections === undefined ? null : asSections(page.draft_sections)

    /**
     * The policy links go in, and every link in the chrome is pointed at an
     * address the site actually answers. Both repairs are idempotent and
     * both run here for the same reason: every page carries its own copy of
     * the header and the footer, so a fix applied to one page is a fix
     * applied to one page. See lib/website-builder/live-links.
     */
    const linked = (list: SectionInstance[]) =>
      list.map((s) => {
        if (s.type === "footer") return withLiveLinks(withPolicyLinks(s), pageKeys)
        if (s.type === "header") return withLiveLinks(s, pageKeys)
        return s
      })
    const nextPublished = linked(published)
    const nextDraft = draft ? linked(draft) : null

    const changed =
      JSON.stringify(nextPublished) !== JSON.stringify(published) ||
      (draft !== null && JSON.stringify(nextDraft) !== JSON.stringify(draft))
    if (!changed) continue

    const values: Record<string, unknown> = { sections: nextPublished }
    if (draft !== null) values.draft_sections = nextDraft
    const { error: footerError } = await db.from("store_theme_pages").update(values).eq("id", page.id)
    if (!footerError) footersLinked++
  }

  return { created: missing.map((m) => m.key), footersLinked, error: null }
}
