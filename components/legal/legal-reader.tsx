"use client"

/**
 * THE TERMS OR THE PRIVACY POLICY, READ INSIDE A SHEET. The same text as the
 * pages (./terms-body, ./privacy-body), loaded only when a visitor opens one
 * (components/onepage/onepage-legal-links imports this lazily), so a OnePage
 * carries none of it until then.
 *
 * Links inside it stay inside it: one document's link to the other switches
 * the sheet, a link to a section scrolls the sheet rather than the page
 * behind, and anything else opens in a new tab, so the visitor never loses
 * the page they came from.
 */
import type React from "react"
import { useEffect, useRef } from "react"
import { LEGAL_DOCS, legalDate, type LegalKind } from "./legal-parts"
import { PRIVACY_TOC, PrivacyBody } from "./privacy-body"
import { TERMS_TOC, TermsBody } from "./terms-body"

const OTHER_DOC = /^(?:https?:\/\/(?:www\.)?storelib\.com)?\/(?:legal\/)?(terms|privacy)(?:#(.*))?$/

export default function LegalReader({ kind, onKind, anchor }: { kind: LegalKind; onKind: (k: LegalKind, anchor?: string) => void; anchor?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const toc = kind === "terms" ? TERMS_TOC : PRIVACY_TOC
  const doc = LEGAL_DOCS[kind]

  const go = (id: string) => {
    const el = root.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
    el?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  /* Opened at a section (the footer's Cookies is the policy at #cookies): there once the text is in. */
  useEffect(() => {
    if (!anchor) return
    const f = requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`)?.scrollIntoView({ block: "start" }))
    return () => cancelAnimationFrame(f)
  }, [kind, anchor])

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a")
    if (!a) return
    const href = a.getAttribute("href") ?? ""
    if (href.startsWith("mailto:")) return
    e.preventDefault()
    if (href.startsWith("#")) return go(href.slice(1))
    const m = href.match(OTHER_DOC)
    if (m) return onKind(m[1] as LegalKind, m[2])
    window.open(a.href, "_blank", "noopener")
  }

  return (
    <div
      ref={root}
      onClick={onClick}
      className="px-5 pb-10 pt-2 sm:px-8 [&_[id]]:scroll-mt-4"
      data-legal-reader={kind}
    >
      <p className="text-[13.5px] text-[var(--legal-muted)]">
        Storelib Inc. · Last updated <time dateTime={doc.updated}>{legalDate(doc.updated)}</time>
      </p>
      <details className="group mt-4 rounded-2xl bg-[var(--legal-panel)]" data-legal-contents="">
        <summary className="flex min-h-[46px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-medium text-[var(--legal-ink)] [&::-webkit-details-marker]:hidden">
          Contents
          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 text-[var(--legal-muted)] transition-[rotate] group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </summary>
        <ol className="px-4 pb-3">
          {toc.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="block py-1.5 text-[14px] leading-snug text-[var(--legal-muted)] transition-colors hover:text-[var(--legal-ink)]">
                {t.label}
              </a>
            </li>
          ))}
        </ol>
      </details>
      <div className="mt-8">{kind === "terms" ? <TermsBody /> : <PrivacyBody />}</div>
      <p className="mt-12 text-[14px] leading-relaxed text-[var(--legal-muted)]">
        Questions? Write to{" "}
        <a href={`mailto:${doc.contact}`} className="font-medium text-[var(--legal-ink)] underline underline-offset-2">
          {doc.contact}
        </a>
        .
      </p>
    </div>
  )
}
