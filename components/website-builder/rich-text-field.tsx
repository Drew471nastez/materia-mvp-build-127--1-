"use client"

/**
 * ===========================================================================
 *  WRITING, RATHER THAN TYPING HTML INTO A BOX
 * ===========================================================================
 * A richtext setting was the same textarea a plain one got, so the body of a
 * policy page read `<p><em>Last updated: 2026-09-13</em></p>` in a box four
 * lines tall. Everything about that is wrong: somebody editing their refund
 * window has to not break the tags, the formatting they can see on the page
 * is invisible here, and the field announces that the product is a thin layer
 * over a database column.
 *
 * So richtext gets an editor: a heading level, bold, italic, a link, and the
 * two kinds of list. That is the whole of what these fields hold, and a
 * toolbar with a control nobody uses is its own kind of cheap.
 *
 * ---------------------------------------------------------------------------
 *  WHY contentEditable AND execCommand
 * ---------------------------------------------------------------------------
 * `execCommand` is deprecated and it is still what every browser implements,
 * still what handles selection, undo, and typing inside a list correctly, and
 * it costs nothing to ship. The alternative is a 100KB editor framework for
 * six buttons, which is not a trade this panel should make. When a browser
 * eventually drops it the buttons stop working and typing still does; the
 * field never becomes unreadable.
 *
 * ---------------------------------------------------------------------------
 *  WHAT LEAVES THIS COMPONENT IS SANITISED
 * ---------------------------------------------------------------------------
 * A contentEditable accepts a paste from anywhere, which means it accepts
 * whatever markup was on the page it was copied from. Every value that leaves
 * here goes through the same `sanitizeRichText` the renderer trusts, so the
 * field cannot be the way something unwanted reaches a published page.
 */

import * as React from "react"
import { Bold, ChevronDown, Italic, Link2, List, ListOrdered, Type } from "lucide-react"
import { StorelibMark } from "@/components/storelib-mark"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"
import { cn } from "@/lib/utils"

/**
 * The assistant, when the editor has one to offer.
 *
 * A context rather than a prop, because these fields are rendered several
 * layers below anything that knows about the chat panel, and threading a
 * callback through every settings component to reach a button is how props
 * become plumbing. No provider means no button: a toolbar icon that does
 * nothing is worse than one that is not there.
 */
export const RichTextAssistant = React.createContext<(() => void) | null>(null)

const BLOCKS = [
  { label: "Paragraph", tag: "p" },
  { label: "Heading 2", tag: "h2" },
  { label: "Heading 3", tag: "h3" },
  { label: "Heading 4", tag: "h4" },
] as const

export function RichTextField({
  value,
  onChange,
  placeholder,
  minHeight = 140,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const askAi = React.useContext(RichTextAssistant)
  const [empty, setEmpty] = React.useState(!value || value === "<p></p>")

  /**
   * THE VALUE IS WRITTEN IN ONLY WHEN IT CAME FROM SOMEWHERE ELSE.
   *
   * Setting innerHTML on every render would put the caret back at the start
   * of the field after every keystroke, which is the classic way a
   * contentEditable bound to state becomes unusable. The DOM is the source
   * of truth while somebody is typing into it; the prop wins when it says
   * something the DOM does not already say, which happens when the section
   * changes, on undo, and when the assistant writes the field.
   */
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const incoming = value ?? ""
    if (el.innerHTML !== incoming) el.innerHTML = incoming
    setEmpty(!el.textContent?.trim())
  }, [value])

  const publish = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    setEmpty(!el.textContent?.trim())
    const clean = sanitizeRichText(el.innerHTML)
    if (clean !== value) onChange(clean)
  }, [onChange, value])

  /** Run a command against the selection, keeping focus in the field. */
  const run = (command: string, argument?: string) => {
    const el = ref.current
    if (!el) return
    el.focus()
    try {
      document.execCommand(command, false, argument)
    } catch {
      /* a browser that refuses is a browser where typing still works */
    }
    publish()
  }

  /**
   * A PASTE ARRIVES AS WHATEVER IT WAS. Intercepted and inserted as text,
   * so copying a paragraph out of a website does not bring its classes, its
   * fonts and its colours into a section that has its own.
   */
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData("text/plain")
    run("insertText", text)
  }

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-neutral-900/10 focus-within:border-neutral-400 transition-colors">
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
        {askAi ? (
          <>
            {/* The brand mark, not a sparkle. Every other way into the
                assistant in this product is the mark, and a second icon for
                one door is a second thing to learn. */}
            <ToolbarButton label="Ask AI to write this" onClick={askAi}>
              <StorelibMark className="h-4 w-4 rounded-[4px]" />
            </ToolbarButton>
            <Divider />
          </>
        ) : null}

        <BlockSelect onPick={(tag) => run("formatBlock", `<${tag}>`)} />
        <Divider />

        <ToolbarButton label="Bold" onClick={() => run("bold")}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => run("italic")}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          onClick={() => {
            const href = window.prompt("Link to")
            if (!href) return
            /** Anything that is not a URL or a path is not a link. */
            const safe = /^(https?:\/\/|mailto:|tel:|\/)/i.test(href.trim()) ? href.trim() : `https://${href.trim()}`
            run("createLink", safe)
          }}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <Divider />

        <ToolbarButton label="Bulleted list" onClick={() => run("insertUnorderedList")}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onClick={() => run("insertOrderedList")}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <div className="relative">
        {empty && placeholder ? (
          <p className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">{placeholder}</p>
        ) : null}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          contentEditable
          suppressContentEditableWarning
          onInput={publish}
          onBlur={publish}
          onPaste={onPaste}
          className="wb-richtext px-3 py-2.5 text-sm outline-none"
          style={{ minHeight }}
        />
      </div>
    </div>
  )
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      /**
       * `onMouseDown`, not `onClick`: a click moves focus out of the field
       * first, and a browser that has lost the selection has nothing to make
       * bold. Preventing the default keeps the selection exactly where it was.
       */
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}

const Divider = () => <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />

function BlockSelect({ onPick }: { onPick: (tag: string) => void }) {
  return (
    <div className="relative">
      <select
        aria-label="Text style"
        className="h-8 cursor-pointer appearance-none rounded-md bg-transparent pl-8 pr-5 text-sm text-foreground/80 outline-none transition-colors hover:bg-muted"
        defaultValue=""
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (!e.target.value) return
          onPick(e.target.value)
          e.target.value = ""
        }}
      >
        <option value="" disabled>
          Aa
        </option>
        {BLOCKS.map((b) => (
          <option key={b.tag} value={b.tag}>
            {b.label}
          </option>
        ))}
      </select>
      <Type aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/80" />
      <ChevronDown aria-hidden className="pointer-events-none absolute right-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/60" />
    </div>
  )
}
