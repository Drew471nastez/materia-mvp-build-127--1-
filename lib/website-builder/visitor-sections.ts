/**
 * ===========================================================================
 *  WHAT A VISITOR'S PAGE MAY CARRY OF A SECTION'S SETTINGS (round 45 leftovers)
 * ===========================================================================
 * A section's settings travel to the browser whole: the sections are drawn
 * by client components, so everything in `settings` is in the page's
 * payload. One setting is an address the creator typed for themselves and
 * no visitor is ever shown: the contact form's "Send messages to"
 * (recipient_email). The form says where messages go only in the builder
 * (ContactFormSection), and the message is routed on the server from the
 * stored row (lib/site-contact/contact.ts), so the live page never needs it.
 *
 * Taken out here, on the published path only (lib/website-builder/
 * published-site.ts and the product page's render). Never in
 * sanitizeSections: that one also runs where sections are saved back (the
 * agent, GitHub sync), and the setting would be lost on the next save.
 */

/** Settings no visitor's page carries, whatever section holds them. */
export const PRIVATE_SECTION_SETTINGS = ["recipient_email"] as const

type Loose = { settings?: Record<string, unknown> | null; blocks?: unknown }

function clean<T>(item: T): T {
  if (!item || typeof item !== "object") return item
  const s = item as unknown as Loose
  let next: Loose | null = null
  if (s.settings && typeof s.settings === "object" && PRIVATE_SECTION_SETTINGS.some((k) => k in s.settings!)) {
    const settings = { ...s.settings }
    for (const k of PRIVATE_SECTION_SETTINGS) delete settings[k]
    next = { ...s, settings }
  }
  if (Array.isArray(s.blocks)) {
    const blocks = s.blocks.map(clean)
    if (blocks.some((b, i) => b !== (s.blocks as unknown[])[i])) next = { ...(next ?? s), blocks }
  }
  return (next ?? item) as T
}

/** The sections as a visitor's page may carry them; untouched sections are returned as they were. */
export function forVisitors<T>(sections: T[]): T[] {
  if (!Array.isArray(sections)) return sections
  const out = sections.map(clean)
  return out.some((s, i) => s !== sections[i]) ? out : sections
}
