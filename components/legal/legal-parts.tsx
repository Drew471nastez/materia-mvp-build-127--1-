/**
 * ===========================================================================
 *  THE PARTS A LEGAL TEXT IS SET IN
 * ===========================================================================
 * The headings, paragraphs and lists of the Terms and the Privacy policy, set
 * the way a Help Center article is (components/help/help-parts ArticleBody):
 * the same sizes, the same ink, the same rhythm, so reading the terms feels
 * like reading the rest of Storelib's help.
 *
 * Every colour is a --legal-* variable with Storelib's light value as its
 * fallback. The pages set none of them. The sheet a OnePage opens
 * (./legal-sheet) sets them from the page's own theme, so the same text reads
 * on a dark page without a second copy of it.
 */
import type React from "react"

export const LEGAL_INK = "text-[var(--legal-ink,#1a1a2e)]"
export const LEGAL_MUTED = "text-[var(--legal-muted,#6b7280)]"

/** A link inside the text: ink, underlined, never the accent. */
export const LINK =
  "font-medium text-[var(--legal-ink,#1a1a2e)] underline decoration-[var(--legal-rule-strong,#c9ccd2)] underline-offset-2 transition-colors hover:decoration-[var(--legal-ink,#1a1a2e)]"

/** Each section's heading carries the id the contents link to, so the spy (components/help/toc-spy) can mark it. */
export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12 first:mt-0" data-legal-section={id}>
      <h2 id={id} className={`scroll-mt-28 text-[20px] font-semibold leading-snug tracking-[-0.01em] sm:text-[22px] ${LEGAL_INK}`}>
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15.5px] leading-[1.7] text-[var(--legal-body,#374151)] sm:text-[16px]">{children}</div>
    </section>
  )
}

export function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-3">
      <h3 className={`text-[16.5px] font-semibold leading-snug ${LEGAL_INK}`}>{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  )
}

export function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6 marker:text-[var(--legal-muted,#9ca3af)]">
      {items.map((item, i) => (
        <li key={i} className="pl-1">
          {item}
        </li>
      ))}
    </ul>
  )
}

/** The two documents, where they live and when they last changed. One list, read by the pages, the sheet and the tests. */
export const LEGAL_DOCS = {
  terms: { href: "/terms", title: "Terms of service", updated: "2026-02-28", contact: "legal@storelib.com" },
  privacy: { href: "/privacy", title: "Privacy policy", updated: "2026-03-03", contact: "privacy@storelib.com" },
} as const

export type LegalKind = keyof typeof LEGAL_DOCS

export const legalDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
