"use client"

/**
 * ===========================================================================
 *  A PRODUCT'S DESCRIPTION: WRITTEN, EDITED IN PLACE, AND DRAWN
 * ===========================================================================
 * Three exports, kept under their old names because the product page, the
 * creator page's editor and the legacy product form all import them:
 *
 *   DescriptionRichEditor    the shared rich text field
 *                            (components/app/rich-text-editor.tsx) with the
 *                            description's label and placeholder.
 *   DescriptionEditWrapper   the creator page editor's "Edit" in place.
 *   RichDescriptionContent   the description on a product page.
 *
 * This file used to be a 2,700 line editor of its own, with image uploads
 * stored inline as data: URLs, YouTube and X embeds, coloured buttons,
 * alignment, a text colour palette and bottom sheets for each. What it saved
 * carried inline `onmouseenter` handlers, and this renderer put that
 * straight into the page. The editor is gone; what it saved still renders,
 * through the allow list (lib/rich-text/policy.ts), without the handlers.
 */

import * as React from "react"
import { Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { decodeHtmlEntities } from "@/lib/html-entities"
import { cleanStoredHtml, looksLikeHtml } from "@/lib/rich-text/html"

/*
  THE EDITOR IS LOADED WHEN IT IS NEEDED. This file is on every product and
  creator page (RichDescriptionContent), and it imported the whole rich text
  editor, emoji picker and all, so every buyer downloaded the seller's
  editor with the page. It is fetched now only when the creator page's
  editor is open, from the moment the pointer reaches Edit, so the field is
  there by the time Edit is pressed.
*/
const loadField = () => import("./description-field")
const LazyField = React.lazy(() => loadField().then((m) => ({ default: m.DescriptionField })))

interface ThemeColors {
  backgroundColor?: string
  foregroundColor?: string
  mutedColor?: string
  borderColor?: string
  accentColor?: string
  buttonColor?: string
  buttonTextColor?: string
  isDarkTheme?: boolean
}

interface DescriptionRichEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  /* Accepted for the callers that still pass them; the field looks the
     same everywhere, and sizes itself for a phone with CSS. */
  onClose?: () => void
  isMobile?: boolean
  textColor?: string
  themeColors?: ThemeColors
  disableAutoFocus?: boolean
}

export function DescriptionRichEditor({ value, onChange, className }: DescriptionRichEditorProps) {
  /* Held at the field's own height while it arrives, so nothing under it moves. */
  return (
    <React.Suspense fallback={<div aria-busy="true" className={cn("min-h-[220px] rounded-xl border border-[#e5e7eb] bg-white", className)} />}>
      <LazyField value={value} onChange={onChange} className={className} />
    </React.Suspense>
  )
}

interface DescriptionEditWrapperProps {
  children: React.ReactNode
  isEditorMode: boolean
  description: string
  onDescriptionChange: (value: string) => void
  isMobile?: boolean
  textColor?: string
  mutedTextColor?: string
  themeColors?: ThemeColors
}

/** The creator page editor: the description as it will look, with an Edit that turns it into the field. */
export function DescriptionEditWrapper({
  children,
  isEditorMode,
  description,
  onDescriptionChange,
  isMobile = false,
  textColor,
  themeColors,
}: DescriptionEditWrapperProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  /* A press anywhere else is done. A menu or dialog opened from inside
     lives in a portal, so those count as inside. */
  React.useEffect(() => {
    if (!isEditing) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapperRef.current?.contains(target)) return
      if ((target as Element).closest?.('[role="dialog"], [data-radix-popper-content-wrapper]')) return
      setIsEditing(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [isEditing])

  /* In the editor, the field starts loading with the page's first idle moment, so Edit never waits on it. */
  React.useEffect(() => {
    if (isEditorMode) void loadField()
  }, [isEditorMode])

  if (!isEditorMode) return <>{children}</>

  if (isEditing) {
    return (
      <div ref={wrapperRef} className="wb-settings-swap mt-6" data-description-section>
        <h2 className={cn("mb-3 font-semibold", isMobile ? "text-base" : "text-lg")} style={{ color: textColor }}>
          Description
        </h2>
        <DescriptionRichEditor value={description} onChange={onDescriptionChange} />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="h-11 rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-medium text-white hover:bg-[#2a2a40] sm:h-9 sm:text-[13px]"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  const isDark = themeColors?.isDarkTheme
  return (
    <div className="group/description relative" data-description-section>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          onPointerEnter={() => void loadField()}
          onClick={() => setIsEditing(true)}
          className={cn(
            "mt-1 flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-xs font-medium opacity-70 transition-opacity hover:opacity-100",
            isDark ? "text-[#a1a1aa] hover:bg-white/10" : "text-[#6b7280] hover:bg-black/5",
          )}
        >
          <Pencil className="h-3 w-3" />
          <span>Edit</span>
        </button>
      </div>
    </div>
  )
}

type TwitterWindow = Window & { twttr?: { widgets?: { load: (el?: Element) => void }; ready?: (fn: () => void) => void } }

/**
 * A description on a product page.
 *
 * DRAWN THROUGH THE ALLOW LIST, here as well as on the server. The server
 * cleans it on save and on read (lib/rich-text/sanitize.ts); this cleans it
 * again with the same list (lib/rich-text/html.ts), because this component
 * is also handed descriptions that never went through a server: the creator
 * page editor's live preview. The cleaner is the same code on the server and
 * in the browser, so the markup it renders on the server is the markup it
 * hydrates with.
 *
 * `storelib-prose` is the typography, the same the editor writes in, so a
 * description looks on the page the way it looked while it was written.
 */
export const RichDescriptionContent = React.memo(function RichDescriptionContent({
  html,
  className,
  textColor,
}: {
  html: string
  className?: string
  textColor?: string
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const isRich = looksLikeHtml(html)
  const clean = React.useMemo(() => (isRich ? cleanStoredHtml(html) : ""), [html, isRich])
  const hasXPost = clean.includes('data-embed-type="x-post"')

  /* An X post saved by the old editor is a blockquote until X's own script
     turns it into the post. Loaded only when there is one. */
  React.useEffect(() => {
    if (!hasXPost || !containerRef.current) return
    const w = window as TwitterWindow
    const render = () => {
      if (containerRef.current) w.twttr?.widgets?.load(containerRef.current)
    }
    if (w.twttr?.widgets) {
      render()
      return
    }
    let script = document.querySelector<HTMLScriptElement>('script[src="https://platform.twitter.com/widgets.js"]')
    if (!script) {
      script = document.createElement("script")
      script.src = "https://platform.twitter.com/widgets.js"
      script.async = true
      document.head.appendChild(script)
    }
    const onLoad = () => (w.twttr?.ready ? w.twttr.ready(render) : render())
    script.addEventListener("load", onLoad)
    return () => script?.removeEventListener("load", onLoad)
  }, [clean, hasXPost])

  if (!html) return null

  if (!isRich) {
    /*
      TEXT OUT OF A HTML FIELD IS STILL ENCODED. A description whose tags
      have been stripped (pasted as plain text, or saved through something
      that removed the markup) keeps its entities, so a live page read
      "purchase calligraphy &nbsp; affordable" with the entity spelled out
      mid sentence. It goes into a React text node, so anything decoded here
      is escaped again on the way to the page and cannot become markup.
    */
    return (
      <p className={cn("whitespace-pre-wrap leading-relaxed break-words", className)} style={{ color: textColor }}>
        {decodeHtmlEntities(html)}
      </p>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn("storelib-prose storelib-description leading-relaxed break-words", className)}
      style={{ color: textColor }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
})
