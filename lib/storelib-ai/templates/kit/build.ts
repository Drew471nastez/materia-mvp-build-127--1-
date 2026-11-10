/**
 * A template put together: its components written out as files, every page
 * framed by the same header and footer instances (as add_page frames a new
 * page with home's), and the image slots checked against what is placed.
 *
 * Pure. Browser safe.
 */
import type { SectionInstance } from "@/lib/website-builder/types"
import type { SiteTemplate, TemplatePage } from "../types"
import { filesOf, type ComponentDef } from "./schema"

export interface TemplateDraft extends Omit<SiteTemplate, "files" | "pages"> {
  components: ComponentDef[]
  header: SectionInstance
  footer: SectionInstance
  pages: { key: string; title: string; seo?: TemplatePage["seo"]; sections: SectionInstance[] }[]
}

export function assemble(d: TemplateDraft): SiteTemplate {
  const { components, header, footer, pages, ...rest } = d
  const framed: TemplatePage[] = pages.map((p) => ({ key: p.key, title: p.title, ...(p.seo ? { seo: p.seo } : {}), sections: [structuredCloneish(header), ...p.sections, structuredCloneish(footer)] }))
  const t: SiteTemplate = { ...rest, files: filesOf(components), pages: framed }
  /* A slot that points at nothing is a template bug: fail where it is defined, not when a picture is lost. */
  for (const slot of t.imageSlots) {
    for (const target of slot.targets) {
      const page = t.pages.find((p) => p.key === target.page)
      const section = page?.sections.find((x) => x.id === target.section)
      const ok = !!section && (target.block ? !!section.blocks?.some((b) => b.id === target.block) : true)
      if (!ok) throw new Error(`template ${t.id}: image slot ${slot.key} points at ${target.page} › ${target.section}${target.block ? ` › ${target.block}` : ""}, which is not placed`)
    }
  }
  return t
}

function structuredCloneish<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}
