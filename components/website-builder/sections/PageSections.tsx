/**
 * A page of sections, in the order a page puts them.
 *
 * This was written inline in `app/(marketing)/w/[username]/page.tsx` and had to
 * be written again for the Sites route — which is how two public renderers of
 * the same data start, and then disagree about something small like whether a
 * footer placed mid-page renders mid-page. One component, both routes.
 *
 * WHAT IT DECIDES: ordering and the empty state, nothing else.
 *
 * WHAT IT DOES NOT DECIDE: which sections. The caller resolves that, and the
 * distinction matters — the storefront route falls back to `draft_sections`
 * when a page has never been published, and a Sites page must NOT, because a
 * visitor would be reading unpublished work. Keeping the choice at the call
 * site is what lets the two differ on purpose rather than by accident.
 *
 * HEADER FIRST, FOOTER LAST, whatever order they were saved in. A header is
 * chrome, not content: an editor that lets you drag it into the middle of the
 * page should not produce a page with a navigation bar halfway down it.
 */

import SectionRenderer from "./SectionRenderer"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

export function PageSections({
  sections,
  theme,
  emptyTitle = "This website is being set up",
  emptyDetail = "Check back soon.",
}: {
  sections: SectionInstance[]
  theme: ThemeSettingsValues
  emptyTitle?: string
  emptyDetail?: string
}) {
  const headers = sections.filter((s) => s.type === "header")
  const footers = sections.filter((s) => s.type === "footer")
  const body = sections.filter((s) => s.type !== "header" && s.type !== "footer")

  return (
    <>
      {headers.map((section) => (
        <SectionRenderer key={section.id} section={section} theme={theme} />
      ))}

      {/*
        No `flex-1` filler between the body and the footer. It was tried and it
        produces a visible gap on a short page — the footer is pushed to the
        bottom of the viewport with nothing between it and the last section.
        Natural flow leaves a short page short, which is correct.
      */}
      {body.map((section) => (
        <SectionRenderer key={section.id} section={section} theme={theme} />
      ))}

      {sections.length === 0 && (
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center text-gray-400">
            <p className="text-lg font-medium">{emptyTitle}</p>
            <p className="mt-1 text-sm">{emptyDetail}</p>
          </div>
        </div>
      )}

      {footers.map((section) => (
        <SectionRenderer key={section.id} section={section} theme={theme} />
      ))}
    </>
  )
}
