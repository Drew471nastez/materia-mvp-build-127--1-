/**
 * ===========================================================================
 *  THE SITE'S OTHER PAGES, FOR THE BUILDER'S ASSISTANT
 * ===========================================================================
 * The server half of ./page-builder.ts: list the site's pages, and write one
 * page that is not open in the editor as a draft. Read and written through
 * the creator's own client, so row-level security decides which site can be
 * touched, the same as the editor's own save.
 *
 * NOTHING IS LOST. The first page a run writes takes a backup of the whole
 * site first (lib/website-builder/backups.ts, restorable from Website
 * Settings › Backups), once per run however many pages it builds. Every page
 * is sanitised by the function the editor's save uses and lands in the
 * DRAFT column: nothing reaches visitors until the creator publishes.
 *
 * NEVER THE OPEN PAGE. The editor holds that one, unsaved, and saves it over
 * whatever is stored; the assistant changes it with the page tools instead.
 */
import "server-only"

import { checkPageState, type CheckResult } from "@/lib/agent-access/checks"
import { takeBackup } from "@/lib/website-builder/backups"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { BUILT_IN_PAGE_KEYS, pagePath, pageTitleFromKey } from "@/lib/website-builder/site-pages"
import type { SectionInstance } from "@/lib/website-builder/types"
import { pageKeyFor, planPage, readPageSections, type SitePageTools } from "./page-builder"
import type { SchemaMap } from "./schemas"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** A site holds this many pages; the builder's Add page stops at the same number. */
const MAX_PAGES = 60

/** Pages the store draws itself (sign in, the account, a password wall): their sections are the page, and a build adds to them at most. */
const SYSTEM_PAGES = new Set(["account", "login", "password", "wishlist"])

export interface PageWrite {
  ok: boolean
  /** What the model is told. */
  text: string
  /** The page written, when one was. */
  key?: string
  title?: string
  created?: boolean
}

export type SitePages = SitePageTools

function failedChecks(results: CheckResult[]): string[] {
  return results.filter((r) => !r.ok).map((r) => `${r.check}: ${r.problems.slice(0, 4).join("; ")}`)
}

export function sitePages(db: Db, installId: string, openPage: string): SitePages {
  const open = openPage.trim().toLowerCase().replace(/^\//, "")
  let backedUp: Promise<boolean> | null = null
  /* One restore point a run, before its first page write. A failed backup stops the write: the promise is that nothing is lost. */
  const backupOnce = () => {
    backedUp ??= takeBackup(db as never, installId, { label: "Before Storelib AI built pages", source: "ai" }).then((b) => !b.error)
    return backedUp
  }

  async function rows(): Promise<{ page_key: string; sections: unknown; draft_sections: unknown }[]> {
    const { data } = await db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId)
    return (data ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]
  }

  const sectionsOf = (row: { sections: unknown; draft_sections: unknown } | undefined): SectionInstance[] => {
    const raw = (row?.draft_sections ?? row?.sections ?? []) as unknown
    return sanitizeSections(Array.isArray(raw) ? (raw as SectionInstance[]) : [])
  }

  return {
    async list() {
      const all = await rows()
      const byKey = new Map(all.map((r) => [r.page_key, r]))
      const keys = [...new Set(["home", "products", "product", "about", "contact", ...all.map((r) => r.page_key)])]
      const lines = keys.map((key) => {
        const row = byKey.get(key)
        const body = sectionsOf(row).filter((s) => s.type !== "header" && s.type !== "footer")
        const kind = BUILT_IN_PAGE_KEYS.has(key) || key === "home" ? "built in" : "the creator's own"
        const state = key === open ? "OPEN in the editor: change it with the page tools, never build_page" : row ? `${body.length} section${body.length === 1 ? "" : "s"}: ${body.map((s) => s.type).join(", ") || "empty"}` : "not made yet"
        return `- ${key} (${pageTitleFromKey(key)}, ${pagePath(key)}, ${kind}): ${state}`
      })
      return [
        `THE SITE'S PAGES (${all.length} stored). "product" is the template every product page uses; "products" is the shop (all products); "collections" lists collections.`,
        ...lines,
        "Build a page that is not open with build_page. Link it from the menu with edit_menu so visitors can reach it.",
      ].join("\n")
    },

    async build(args, schemas) {
      const key = pageKeyFor(args.page, args.title)
      if (!key) return { ok: false, text: 'Name the page: page is a key such as "about", "contact", "products" or "faq", or give a title such as "Size guide".' }
      if (key === open) return { ok: false, text: `"${key}" is the page open in the editor. Change it with add_section, update_section and the other page tools; build_page is for the other pages.` }
      const read = readPageSections(args.sections)
      if ("error" in read) return { ok: false, text: read.error }

      const all = await rows()
      const existing = all.find((r) => r.page_key === key)
      if (!existing && all.length >= MAX_PAGES) return { ok: false, text: `This site has ${MAX_PAGES} pages, which is the most it holds.` }
      const replace = args.replace === true && !SYSTEM_PAGES.has(key)

      /* A page made now takes the site's own header and footer, as the builder's Add page does. */
      const start = existing ? sectionsOf(existing) : sectionsOf(all.find((r) => r.page_key === "home")).filter((s) => s.type === "header" || s.type === "footer")
      const plan = planPage({ sections: start, settings: {} }, read.sections, schemas, { replace })
      if (plan.ok === false) return { ok: false, text: `Nothing was written to "${key}". ${plan.error}` }

      if (!(await backupOnce())) return { ok: false, text: "Could not take a backup of the site first, so no page was written. Say so in your reply." }
      const sections = sanitizeSections(plan.state.sections)
      const write = existing
        ? await db.from("store_theme_pages").update({ draft_sections: sections }).eq("install_id", installId).eq("page_key", key)
        : await db.from("store_theme_pages").insert({ install_id: installId, page_key: key, sections: [], draft_sections: sections })
      if (write?.error) return { ok: false, text: `"${key}" could not be saved just now. Nothing reached visitors. Say so in your reply.` }

      const title = typeof args.title === "string" && args.title.trim() ? args.title.replace(/\s+/g, " ").trim().slice(0, 80) : pageTitleFromKey(key)
      const failed = failedChecks(checkPageState(key, plan.state, schemas, ["page-types", "page-settings", "contrast", "limits"]))
      return {
        ok: true,
        key,
        title,
        created: !existing,
        text: [
          `${existing ? "Rebuilt" : "Made"} "${key}" (${pagePath(key)}) as a draft: ${plan.created.length} section${plan.created.length === 1 ? "" : "s"}${replace ? ", the old ones removed" : ""}${plan.kept.length ? `, its own ${plan.kept.length === 1 ? "section" : "sections"} kept (${plan.kept.join(", ")})` : ""}.`,
          plan.notes.length ? `Adjusted: ${plan.notes.slice(0, 8).join("; ")}` : "",
          failed.length ? `CHECKS FAILED, fix with another build_page on this page (replace true): ${failed.join("; ")}` : "Checks passed: section types, settings, contrast and limits.",
          !existing && !BUILT_IN_PAGE_KEYS.has(key) ? `Visitors reach it at ${pagePath(key)} once it is in a menu: add it with edit_menu.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }
    },
  }
}
