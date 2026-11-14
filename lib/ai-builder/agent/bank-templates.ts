/**
 * ===========================================================================
 *  THE AGENT'S TEMPLATES WITH THE AI SOURCE BANK IN FRONT (round AZ)
 * ===========================================================================
 * The owner's own library websites, put in the bank at /admin/ai-bank
 * (lib/storelib-ai/bank), come before the built-in templates:
 *
 *   choose    the bank site that suits the brief (chooseBankEntry: a store
 *             for a business that sells, its industry, its words), fitted to
 *             the business (fitTemplate: no shop for a coach without one);
 *             none close enough: the built-in templates as before
 *   apply     the built-in applyTemplate, then the fit recorded on the site
 *             (ai_template.bank.removed), so a later slice of the job, in
 *             another process, reads the same template (preloadBankTemplate)
 *   patterns  worked examples for the first brief: an imported theme's best
 *             sections (a product page, bundles) as patterns only, and the
 *             composition of the closest bank store when none was poured in
 *
 * A bank that cannot be read (part 467 not run, the database slow) is no
 * bank: every call falls back to the built-in library, quietly.
 */
import { chooseBankEntry, fitTemplate, refitTemplate, referenceEntries, scoreBankEntry, type BankListing, type BankProfile, type BriefLike, type Removed } from "@/lib/storelib-ai/bank"
import { TEMPLATE_SETTING, type SiteTemplate } from "@/lib/storelib-ai/templates"
import type { TemplateLibrary } from "./ports"
import { defaultTemplates } from "./templates"

export interface BankReader {
  list(): Promise<BankListing[]>
  load(templateId: string): Promise<{ template: SiteTemplate; profile: BankProfile } | null>
}

export type BankLibrary = TemplateLibrary & {
  /** Worked examples from the bank for this brief, as one block of text ("" when there are none). */
  patterns(brief: BriefLike, chosen: SiteTemplate | null): Promise<string>
}

/** At most this many characters of one example file (its template and schema whole, its style cut). */
const EXAMPLE_CHARS = 4_500
const PATTERNS_CHARS = 9_000

function compact(text: string): string {
  const style = /(<style[^>]*>)([\s\S]*?)(<\/style>)/i.exec(text)
  let out = text
  if (style && style[2].length > 1_200) out = text.replace(style[0], `${style[1]}${style[2].slice(0, 1_200)}\n/* ... the rest of the style ... */\n${style[3]}`)
  return out.length > EXAMPLE_CHARS ? `${out.slice(0, EXAMPLE_CHARS)}\n<!-- ... cut for length ... -->` : out
}

/** A bank site's composition in a few lines: each page's sections by role, in order. */
export function compositionOf(template: SiteTemplate, profile: BankProfile): string {
  const lines: string[] = []
  for (const p of template.pages.slice(0, 6)) {
    const own = profile.sections.filter((s) => s.page === p.key && p.sections.some((x) => x.id === s.id))
    if (!own.length) continue
    lines.push(`- ${p.key}: ${own.map((s) => `${s.role}${s.code ? " (its own code)" : ` (${s.type})`}`).join(" → ")}`)
  }
  return lines.join("\n")
}

/** The notes a poured-in bank site adds to the agent's adaptation brief. */
export function bankNotes(template: SiteTemplate, notes: string[]): string {
  const native = [...new Set(template.pages.flatMap((p) => p.sections.filter((s) => !template.files[`sections/${s.type}.storelib`]).map((s) => s.type)))]
  return [
    `This starting site is ${template.source?.name ?? template.name}, a real website from the Storelib library: its composition, its product page and its sections are a proven arrangement. Keep what works; nothing of the source business may stay (its words are drafts to rewrite, its pictures and products are already gone).`,
    native.length ? `Its sections built from Storelib's own section types (${native.slice(0, 14).join(", ")}${native.length > 14 ? ", ..." : ""}) are edited through their settings and blocks (set_section_settings, set_page_sections); restyle them through Theme settings colour schemes and fonts. Write your own ai_ component where the brand needs a moment the site lacks, at least the opening, so the site is its own.` : "",
    ...notes,
  ].filter(Boolean).join("\n")
}

export function bankTemplateLibrary(reader: BankReader, opts: { base?: TemplateLibrary; preloaded?: SiteTemplate[] } = {}): BankLibrary {
  const base = opts.base ?? defaultTemplates
  const fitted = new Map<string, { template: SiteTemplate; profile: BankProfile; removed: Removed; notes: string[] }>()
  for (const t of opts.preloaded ?? []) fitted.set(t.id, { template: t, profile: { kind: "starting", features: [], industries: [], keywords: [], sections: [], counts: { pages: 0, sections: 0, files: 0, imageSlots: 0, bindings: 0, removed: 0 }, examples: [] }, removed: { sections: [], pages: [] }, notes: [] })
  let listings: BankListing[] | null = null
  const list = async () => {
    if (listings) return listings
    listings = await reader.list().catch(() => [])
    return listings
  }

  return {
    async choose(brief, choice) {
      const pick = chooseBankEntry(await list(), brief)
      if (pick) {
        const loaded = await reader.load(pick.entry.id).catch(() => null)
        if (loaded && loaded.template.pages.length) {
          const fit = fitTemplate(loaded.template, loaded.profile, brief)
          if (fit.template.pages.some((p) => p.sections.length)) {
            fitted.set(fit.template.id, { template: fit.template, profile: loaded.profile, removed: fit.removed, notes: [`Chosen from the bank: ${pick.why.join("; ")}.`, ...fit.notes] })
            return fit.template
          }
        }
      }
      return base.choose(brief, choice)
    },
    byId(id) {
      return fitted.get(id)?.template ?? base.byId(id)
    },
    async apply(store, template, brief, meta) {
      /* A bank site keeps its own palette and type (the owner's curated look); the agent restyles from there when the brief asks. */
      const r = await base.apply(store, template, brief, template.source?.kind === "bank" ? { ...meta, choice: null } : meta)
      const own = fitted.get(template.id)
      if (!own || template.source?.kind !== "bank") return r
      /* The fit, on the site: a later slice reads the same template back (preloadBankTemplate). */
      await store.writeSettings({ [TEMPLATE_SETTING]: { id: template.id, v: 1, bank: { removed: own.removed } } }).catch(() => undefined)
      return { ...r, next: [bankNotes(template, own.notes), r.next ?? ""].filter(Boolean).join("\n\n") }
    },
    untouched: base.untouched,
    async patterns(brief, chosen) {
      const all = await list()
      const blocks: string[] = []
      for (const ref of referenceEntries(all, brief)) {
        const loaded = await reader.load(ref.id).catch(() => null)
        if (!loaded) continue
        const paths = (loaded.profile.examples ?? []).filter((p) => loaded.template.files[p]).slice(0, 2)
        if (!paths.length) continue
        blocks.push(`From ${ref.name} (an imported theme: read it for how the parts work together, write Storelib's own syntax, never copy its words):\n${paths.map((p) => `--- ${p} ---\n${compact(loaded.template.files[p])}`).join("\n\n")}`)
      }
      if (!chosen || chosen.source?.kind !== "bank") {
        /* No bank site poured in: the closest bank store's composition, as a structure that works. */
        const near = all
          .filter((e) => e.kind === "starting")
          .map((e) => ({ e, s: scoreBankEntry(e, brief).score }))
          .filter((x) => x.s >= 3)
          .sort((a, b) => b.s - a.s)[0]
        if (near) {
          const loaded = await reader.load(near.e.id).catch(() => null)
          if (loaded) {
            const fit = fitTemplate(loaded.template, loaded.profile, brief)
            const comp = compositionOf(fit.template, loaded.profile)
            if (comp) blocks.push(`A composition that works for this kind of business (${near.e.name}, from the owner's library), page by page:\n${comp}`)
          }
        }
      }
      if (!blocks.length) return ""
      const text = `WORKED EXAMPLES FROM THE OWNER'S LIBRARY (the standard to meet; adapt, never copy words, pictures or brand):\n\n${blocks.join("\n\n")}`
      return text.length > PATTERNS_CHARS ? `${text.slice(0, PATTERNS_CHARS)}\n... cut for length ...` : text
    },
  }
}

/**
 * The bank template a site was started from, fitted as it was then, for a later slice's finish gate. `settings`
 * are the install's draft Theme settings; null when the site did not start from the bank.
 */
export async function preloadBankTemplate(reader: Pick<BankReader, "load">, settings: Record<string, unknown>): Promise<SiteTemplate | null> {
  const mark = settings[TEMPLATE_SETTING] as { id?: unknown; bank?: { removed?: Removed } } | undefined
  if (!mark || typeof mark.id !== "string" || !mark.id.startsWith("bank-")) return null
  const loaded = await reader.load(mark.id).catch(() => null)
  if (!loaded) return null
  const removed = mark.bank?.removed
  return removed && Array.isArray(removed.sections) && Array.isArray(removed.pages) ? refitTemplate(loaded.template, removed) : loaded.template
}
