"use client"

/**
 * ===========================================================================
 *  A SECTION RENDERED FROM ITS .storelib FILE
 * ===========================================================================
 * One React component for every section type that has moved to the theme
 * engine. It does what the fifty hand-written renderers each did on their
 * own — the editor's selection ring, the click to select, the intercepted
 * links — and nothing about how any particular section looks, because that
 * is in the section's own file now.
 *
 * The markup and the scoped CSS come from `renderStorelibSection`, which is
 * pure, so the server and the browser produce the same string and React
 * hydrates it without a mismatch.
 *
 * WHEN THE FILE DOES NOT COMPILE (rule 34): the editor shows a card naming
 * the file and the line, so the person who is editing it can fix it; the
 * published page renders nothing, so a broken section is a gap and not a
 * broken storefront.
 */
import { useMemo, type MouseEvent } from "react"
import { SectionWrapper, type SectionProps } from "./_shared"
import { useStorelibContext } from "./storelib-sources"

export function StorelibSection({
  section,
  theme,
  isEditing,
  isSelected,
  onClick,
  onEditorNavigate,
  insideEditor,
  canvasRoundedTopPx,
  canvasRoundedBottomPx,
}: SectionProps) {
  /**
   * Rendered on the server for a published page, or by the editor's live
   * provider a moment ago. This component holds no engine: see
   * storelib-sources.tsx for why that matters to a visitor's browser.
   */
  const { prerendered, render } = useStorelibContext()
  const out = useMemo(() => {
    const ready = prerendered[section.id]
    if (ready) return { ok: true as const, html: ready.html, css: ready.css }
    if (render) return render(section, theme)
    return { ok: false as const, errors: [{ message: `${section.type} was not rendered: no theme sources in this tree` }] }
  }, [prerendered, render, section, theme])

  if (out.ok === false) {
    if (!isEditing && !insideEditor) return null
    return (
      <SectionWrapper isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
        <div className="px-6 py-5 text-[13px] leading-5 text-[#991b1b] bg-[#fef2f2] border-y border-[#fecaca]">
          <p className="font-semibold">{section.name || section.type} did not compile</p>
          <ul className="mt-1 font-mono text-[12px]">
            {out.errors.map((e, i) => (
              <li key={i}>
                {e.file ?? ""}
                {e.line ? `:${e.line}` : ""} {e.message}
              </li>
            ))}
          </ul>
        </div>
      </SectionWrapper>
    )
  }

  /**
   * In the editor a link inside a section navigates the CANVAS, not the
   * browser. The React renderers each wired this by hand; here it is one
   * capture-phase handler over the rendered markup.
   */
  const intercept = onEditorNavigate
    ? (e: MouseEvent<HTMLDivElement>) => {
        const a = (e.target as HTMLElement).closest("a")
        if (!a) return
        e.preventDefault()
        onEditorNavigate(a.getAttribute("href") ?? "#")
      }
    : undefined

  return (
    <SectionWrapper
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      className="relative overflow-hidden"
      canvasRoundedTopPx={canvasRoundedTopPx}
      canvasRoundedBottomPx={canvasRoundedBottomPx}
    >
      {out.css ? <style dangerouslySetInnerHTML={{ __html: out.css }} /> : null}
      <div onClickCapture={intercept} dangerouslySetInnerHTML={{ __html: out.html }} />
    </SectionWrapper>
  )
}

export default StorelibSection
