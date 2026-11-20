/**
 * ===========================================================================
 *  TERMS OF SERVICE, PRIVACY POLICY AND REFUND POLICY, LAID OUT AS THE HELP CENTER IS
 * ===========================================================================
 * Under Storelib's own header (app/terms, app/privacy, app/refund-policy layouts), the
 * page opens on the Help Center's band (components/help/help-hero): Storelib's
 * ink with its two soft shapes, and in it the document's name and the date it
 * took effect and last changed. A row under the band moves between the three documents.
 *
 * Then one reading column, set like a Help article, with the contents beside
 * it on a wide screen, kept in view with the section being read marked
 * (components/help/toc-spy). On a phone the contents fold under the title.
 * At the end, who to write to.
 */
import Link from "next/link"
import type React from "react"
import { OnThisPage } from "@/components/help/help-parts"
import { TocSpy } from "@/components/help/toc-spy"
import { LEGAL_DOCS, legalDate, type LegalKind } from "./legal-parts"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { legalJsonLd } from "@/lib/seo/page-metadata"

const WIDTH = "mx-auto w-full max-w-[1080px] px-4 sm:px-6 lg:px-8"

export function LegalPage({ kind, toc, children }: { kind: LegalKind; toc: { id: string; label: string }[]; children: React.ReactNode }) {
  const doc = LEGAL_DOCS[kind]
  const items = toc.map((t) => ({ id: t.id, text: t.label }))
  return (
    <div className="bg-white" data-legal-page={kind}>
      {/* What a search engine reads: the document, the day it last changed, and where it sits (lib/seo/page-metadata legalJsonLd). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(legalJsonLd(kind)) }} />
      <header className="relative isolate overflow-hidden bg-[#1a1a2e] text-white" data-legal-hero="">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <svg className="h-full w-full" preserveAspectRatio="xMaxYMid slice" viewBox="0 0 1200 360">
            <path d="M760 360 C 820 230 900 150 1040 120 C 1130 100 1200 40 1200 0 L 1200 360 Z" fill="#24243c" />
            <path d="M980 360 C 1010 290 1070 250 1130 240 C 1170 232 1200 210 1200 190 L 1200 360 Z" fill="#2f2f4a" />
          </svg>
        </div>
        <div className={`${WIDTH} pb-10 pt-10 sm:pb-14 sm:pt-14`}>
          <p className="text-[13.5px] font-medium text-white/60">Storelib legal</p>
          <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[44px]">{doc.title}</h1>
          <p className="mt-4 text-[14px] text-white/70">
            Effective <time dateTime={doc.effective}>{legalDate(doc.effective)}</time>
            <span aria-hidden className="mx-2 text-white/35">·</span>
            Last updated <time dateTime={doc.updated}>{legalDate(doc.updated)}</time>
          </p>
        </div>
      </header>

      <nav aria-label="Legal documents" className="border-b border-[#eef0f2]">
        <div className={`${WIDTH} flex gap-5 overflow-x-auto [scrollbar-width:none] sm:gap-6`}>
          {(Object.keys(LEGAL_DOCS) as LegalKind[]).map((k) => (
            <Link
              key={k}
              href={LEGAL_DOCS[k].href}
              aria-current={k === kind ? "page" : undefined}
              className="relative shrink-0 whitespace-nowrap py-3.5 text-[14px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e] aria-[current=page]:text-[#1a1a2e] aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-0 aria-[current=page]:after:-bottom-px aria-[current=page]:after:h-[2px] aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-[#1a1a2e]"
            >
              {LEGAL_DOCS[k].title}
            </Link>
          ))}
        </div>
      </nav>

      <div className={`${WIDTH} grid gap-10 pb-20 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-16`}>
        <article className="min-w-0 max-w-[44rem]">
          <div className="mb-8">
            <OnThisPage items={items} variant="inline" />
          </div>
          <div data-help-body="">{children}</div>
          <div className="mt-14 rounded-2xl bg-[#f8f9fa] px-5 py-4 text-[14px] leading-relaxed text-[#6b7280]">
            Questions about this {kind === "terms" ? "agreement" : "policy"}? Write to{" "}
            <a href={`mailto:${doc.contact}`} className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-2 hover:decoration-[#1a1a2e]">
              {doc.contact}
            </a>{" "}
            and a person on the team replies.
          </div>
        </article>
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100svh-7rem)] overflow-y-auto overscroll-contain pb-6 [scrollbar-width:thin]">
            <OnThisPage items={items} variant="side" />
          </div>
        </aside>
      </div>
      <TocSpy />
    </div>
  )
}
