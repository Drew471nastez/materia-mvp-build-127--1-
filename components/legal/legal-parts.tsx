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
import { LEGAL_EFFECTIVE } from "@/lib/legal/figures"

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

/**
 * The three documents, where they live and when they took effect and last
 * changed. One list, read by the pages, the sheet, the sitemap and the tests.
 * The date is LEGAL_EFFECTIVE (lib/legal/figures), the day all three were
 * rewritten together.
 */
export const LEGAL_DOCS = {
  terms: { href: "/terms", title: "Terms of service", effective: LEGAL_EFFECTIVE, updated: LEGAL_EFFECTIVE, contact: "legal@storelib.com" },
  privacy: { href: "/privacy", title: "Privacy policy", effective: LEGAL_EFFECTIVE, updated: LEGAL_EFFECTIVE, contact: "privacy@storelib.com" },
  refunds: { href: "/refund-policy", title: "Refund policy", effective: LEGAL_EFFECTIVE, updated: LEGAL_EFFECTIVE, contact: "support@storelib.com" },
} as const

export type LegalKind = keyof typeof LEGAL_DOCS

/** The document a path names (a link inside the text, "/refund-policy#s4"), or null. */
export function legalKindOfPath(path: string): LegalKind | null {
  const hit = (Object.keys(LEGAL_DOCS) as LegalKind[]).find((k) => LEGAL_DOCS[k].href === path)
  return hit ?? null
}

/** A small table inside the text: the fees, the purposes and their legal bases, the retention periods. */
export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--legal-rule,#e5e7eb)]">
      <table className="w-full text-left text-[13.5px] leading-snug">
        <thead className="bg-[var(--legal-panel,#f8f9fa)] text-[var(--legal-muted,#6b7280)]">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--legal-rule,#eef0f2)] align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2 ${j === 0 ? "font-medium text-[var(--legal-ink,#1a1a2e)]" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const legalDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
