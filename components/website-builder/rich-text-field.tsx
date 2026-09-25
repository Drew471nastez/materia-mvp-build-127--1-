"use client"

/**
 * ===========================================================================
 *  WRITING, RATHER THAN TYPING HTML INTO A BOX
 * ===========================================================================
 * A richtext setting (a policy page's body, an FAQ answer, a paragraph
 * beside a picture) is written in the product's one rich text field,
 * components/app/rich-text-editor.tsx: the same editor as a product's
 * description and an email's body, with the same toolbar, the same link
 * form, the same pressed states and the same keyboard, instead of a second,
 * smaller editor of its own.
 *
 * The one it replaced asked for a link with `window.prompt`, which is the
 * browser's grey box from 1998 over the editor, had no pressed states, and
 * drew its own toolbar from different icons. "Rich text editors ... not old
 * school, very modern."
 *
 * WHAT THESE FIELDS HOLD is a heading, a subheading, bold, italic, the two
 * lists and links. That is the toolbar. Pictures are not offered here:
 * a section has its own picture settings, and an image inside a paragraph
 * of a section is a layout the section did not ask for.
 *
 * ---------------------------------------------------------------------------
 *  WHAT LEAVES THIS COMPONENT IS SANITISED
 * ---------------------------------------------------------------------------
 * The editor cleans every change through its own allow list, and then it
 * goes through `sanitizeRichText`, the allow list the section renderer
 * trusts, so this field cannot be the way something unwanted reaches a
 * published page. A paste is cleaned on the way in as well (the editor's
 * cleanPastedHtml): its structure stays, its fonts, colours and scripts go.
 */

import { RichTextEditor, type RichTextTool } from "@/components/app/rich-text-editor"
import { cleanStoredHtml } from "@/lib/rich-text/html"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"

/** The toolbar: what these fields hold, and nothing else. */
export const RICH_TEXT_SETTING_TOOLS: RichTextTool[] = ["h2", "h3", "bold", "italic", "bulletList", "numberedList", "link"]

/** The editor's own allow list, then the one the section renderer trusts. */
export function cleanRichTextSetting(html: string): string {
  return sanitizeRichText(cleanStoredHtml(html, { blocks: true }))
}

export function RichTextField({
  value,
  onChange,
  placeholder,
  minHeight = 120,
  /**
   * WHERE IT STOPS GROWING. A policy body is two thousand words; past this
   * it scrolls inside itself, so Hide, Duplicate and Delete stay on screen.
   */
  maxHeight = 260,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  maxHeight?: number
}) {
  return (
    /* The height it may grow to, read by the stylesheet (`.wb-rich-text` in app/globals.css). */
    <div className="wb-rich-text" style={{ ["--wb-rich-max" as string]: `${maxHeight}px` }}>
      <RichTextEditor
        value={value}
        onChange={onChange}
        label={placeholder ?? "Text"}
        placeholder={placeholder}
        tools={RICH_TEXT_SETTING_TOOLS}
        cleanOutput={cleanRichTextSetting}
        minHeight={minHeight}
      />
    </div>
  )
}
