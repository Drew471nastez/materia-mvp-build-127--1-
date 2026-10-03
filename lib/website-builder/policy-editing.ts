/**
 * ===========================================================================
 *  A POLICY'S WORDS, READ AND WRITTEN WHERE THEY ALREADY LIVE
 * ===========================================================================
 * Website Settings › Policies edits the refund, privacy, terms and shipping
 * policies in place. Nothing new is stored for that: a policy is a page of
 * the site (store_theme_pages, page_key "refund-policy" and so on), made by
 * policyPageSections as the site's header, one `rich_text` section and the
 * footer, and its words are that section's `body` setting.
 *
 * So a policy is read with the editor's own GET of a page's sections and
 * saved with the editor's own PUT, as a draft: the route runs every section
 * through sanitizeSections, which cleans `body` with the rich text allow
 * list (lib/website-builder/sanitize.ts), and the change is live when the
 * site is published, like any other. The field cleans what leaves it too
 * (rich-text-field.tsx); the route is the authority.
 *
 * The page that is open in the builder is the one exception: the builder
 * holds that page's sections and saves them itself, so a write from here
 * would be overwritten by its next autosave. That page is edited through
 * the builder's own section writer instead (components/website-builder/
 * website-settings/policies.tsx).
 */
import { policyPageSections, type PolicyPage } from "./policy-pages"
import { sanitizeRichText } from "./sanitize"
import type { SectionInstance } from "./types"

/** The section that holds a policy's words: the page's first rich text section. */
export function policyBodySection(sections: readonly SectionInstance[]): SectionInstance | null {
  return sections.find((s) => s.type === "rich_text") ?? null
}

export function policyBodyOf(sections: readonly SectionInstance[]): string {
  const body = policyBodySection(sections)?.settings?.body
  return typeof body === "string" ? body : ""
}

/** Whether a body says nothing: no words once the tags and spaces are gone. */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true
  return (
    html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/\s+/g, "")
      .trim() === ""
  )
}

/**
 * The page's sections with this body in its rich text section, cleaned. A
 * page whose rich text section was deleted in the builder gets the policy's
 * own back, above the footer, so the words have somewhere to go.
 */
export function withPolicyBody(
  sections: readonly SectionInstance[],
  policy: PolicyPage,
  html: string,
  brand: string,
): SectionInstance[] {
  const clean = sanitizeRichText(html)
  const body = policyBodySection(sections)
  if (body) return sections.map((s) => (s === body ? { ...s, settings: { ...s.settings, body: clean } } : s))
  const made = policyPageSections(policy, { brand })[0]
  const section: SectionInstance = { ...made, settings: { ...made.settings, body: clean } }
  const footer = sections.findIndex((s) => s.type === "footer")
  const next = [...sections]
  next.splice(footer < 0 ? next.length : footer, 0, section)
  return next
}

export interface LoadedPolicy {
  /** The page's sections as the editor would open them: the draft, else what is live. */
  sections: SectionInstance[]
  /** Whether the site has this page at all. A shipping policy is only there once written. */
  exists: boolean
  updatedAt: string | null
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const sectionsUrl = (installId: string) => `/api/website-builder/themes/${encodeURIComponent(installId)}/sections`

async function errorOf(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown }
    return typeof data.error === "string" && data.error ? data.error : fallback
  } catch {
    return fallback
  }
}

/** One policy page, by the route the editor opens pages with. */
export async function loadPolicy(fetcher: Fetch, installId: string, key: string): Promise<LoadedPolicy> {
  const res = await fetcher(`${sectionsUrl(installId)}?page=${encodeURIComponent(key)}`)
  if (!res.ok) throw new Error(await errorOf(res, "Could not open this policy. Try again."))
  const data = (await res.json()) as { page?: { updated_at?: string | null } | null; sections?: SectionInstance[] }
  const sections = Array.isArray(data.sections) ? data.sections : []
  return { sections, exists: !!data.page, updatedAt: data.page?.updated_at ?? null }
}

/**
 * A policy page saved as a draft, by the route the editor saves pages with.
 * Answers with when it was saved, from the row the route wrote.
 */
export async function savePolicy(
  fetcher: Fetch,
  installId: string,
  key: string,
  sections: SectionInstance[],
): Promise<{ updatedAt: string | null }> {
  const res = await fetcher(sectionsUrl(installId), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page_key: key, sections, mode: "draft" }),
  })
  if (!res.ok) throw new Error(await errorOf(res, "Could not save this policy. Try again."))
  const data = (await res.json().catch(() => ({}))) as { page?: { updated_at?: string | null } | null }
  return { updatedAt: data.page?.updated_at ?? null }
}

/** "Edited today", "Edited yesterday", "Edited 12 Sep": short enough for a card's second line. */
export function editedLabel(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  if (days <= 0) return "Edited today"
  if (days === 1) return "Edited yesterday"
  const sameYear = at.getFullYear() === now.getFullYear()
  return `Edited ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })}`
}
