"use client"

/**
 * ===========================================================================
 *  ONE LINE OF EDITABLE TEXT: A PARAGRAPH, A HEADING, OR A LIST ITEM
 * ===========================================================================
 * A contentEditable that React does not re-render while you type. React
 * writing innerHTML on every keystroke is what makes a caret jump to the
 * start; so the element is written once, and again only when the text it
 * is given is not the text it last reported (an undo, a merge, a paste
 * split). What was typed goes up as HTML and is cleaned on the way out
 * (components/email/compose/parse.ts), not here, so the caret never moves.
 *
 * The keys that make blocks feel like one document are handled here and
 * decided by the editor above:
 *
 *   Enter              split at the caret; what follows goes to a new block
 *   Shift+Enter        a line break inside this block
 *   Backspace at start merge into the block above, or remove an empty one
 *   Up at the start,   move to the block above or below
 *   Down at the end
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export interface EditableHandle {
  focus: (at: "start" | "end" | number) => void
  el: () => HTMLElement | null
}

type Tag = "p" | "h1" | "h2" | "h3" | "blockquote" | "div"

export interface EditableProps {
  html: string
  as?: Tag
  className?: string
  style?: React.CSSProperties
  placeholder?: string
  label: string
  onChange: (html: string) => void
  onEnter?: (after: string) => void
  onBackspaceAtStart?: () => void
  onArrowOut?: (dir: "up" | "down") => void
  onFocus?: () => void
  onSlash?: (query: string | null, anchor: HTMLElement) => void
  onShortcut?: (marker: string) => boolean
  onPasteBlocks?: (e: React.ClipboardEvent<HTMLElement>) => void
}

function isBlank(el: HTMLElement): boolean {
  return (el.textContent ?? "").replace(/​/g, "").length === 0 && !el.querySelector("img")
}

/** The caret, as a count of characters from the start of the element. */
export function caretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  if (!el.contains(r.startContainer)) return null
  const before = document.createRange()
  before.selectNodeContents(el)
  before.setEnd(r.startContainer, r.startOffset)
  return before.toString().length
}

function caretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false
  const r = sel.getRangeAt(0)
  if (!el.contains(r.startContainer)) return false
  const before = document.createRange()
  before.selectNodeContents(el)
  before.setEnd(r.startContainer, r.startOffset)
  const frag = before.cloneContents()
  return before.toString().length === 0 && !frag.querySelector?.("br,img")
}

function caretAtEnd(el: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false
  const r = sel.getRangeAt(0)
  if (!el.contains(r.endContainer)) return false
  const after = document.createRange()
  after.selectNodeContents(el)
  after.setStart(r.endContainer, r.endOffset)
  return after.toString().replace(/​/g, "").length === 0
}

/** Put the caret at the start, the end, or n characters in. */
export function placeCaret(el: HTMLElement, at: "start" | "end" | number) {
  el.focus({ preventScroll: true })
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  if (at === "start" || at === "end") {
    range.selectNodeContents(el)
    range.collapse(at === "start")
  } else {
    let left = at
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node: Node | null = walker.nextNode()
    let placed = false
    while (node) {
      const len = (node.textContent ?? "").length
      if (left <= len) {
        range.setStart(node, left)
        range.collapse(true)
        placed = true
        break
      }
      left -= len
      node = walker.nextNode()
    }
    if (!placed) {
      range.selectNodeContents(el)
      range.collapse(false)
    }
  }
  sel.removeAllRanges()
  sel.addRange(range)
  const rect = range.getBoundingClientRect()
  /* Scroll only when the caret is out of view, and only as far as needed. */
  if (rect && (rect.top < 120 || rect.bottom > window.innerHeight - 40)) el.scrollIntoView({ block: "nearest" })
}

export const Editable = React.forwardRef<EditableHandle, EditableProps>(function Editable(
  { html, as = "div", className, style, placeholder, label, onChange, onEnter, onBackspaceAtStart, onArrowOut, onFocus, onSlash, onShortcut, onPasteBlocks },
  ref,
) {
  const elRef = React.useRef<HTMLElement | null>(null)
  const reported = React.useRef<string | null>(null)
  const composing = React.useRef(false)

  React.useImperativeHandle(ref, () => ({
    focus: (at) => {
      const el = elRef.current
      if (el) placeCaret(el, at)
    },
    el: () => elRef.current,
  }))

  /* Written on mount, and when the html given is not what this element last said. */
  React.useLayoutEffect(() => {
    const el = elRef.current
    if (!el) return
    if (html !== reported.current && el.innerHTML !== html) {
      el.innerHTML = html
    }
    reported.current = html
    el.dataset.empty = isBlank(el) ? "true" : "false"
  }, [html])

  const report = () => {
    const el = elRef.current
    if (!el) return
    const now = el.innerHTML
    el.dataset.empty = isBlank(el) ? "true" : "false"
    reported.current = now
    onChange(now)
    if (onSlash) {
      const text = el.textContent ?? ""
      onSlash(/^\/[a-z0-9 ]{0,20}$/i.test(text) ? text.slice(1) : null, el)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const el = elRef.current
    if (!el || composing.current || e.nativeEvent.isComposing) return
    if (e.key === "Enter" && !e.shiftKey && onEnter) {
      e.preventDefault()
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (!range.collapsed) range.deleteContents()
      const tail = document.createRange()
      tail.setStart(range.startContainer, range.startOffset)
      tail.setEnd(el, el.childNodes.length)
      const holder = document.createElement("div")
      holder.appendChild(tail.extractContents())
      const after = holder.innerHTML.replace(/^(<br>)+/, "")
      report()
      onEnter(isBlankHtml(after) ? "" : after)
      return
    }
    if (e.key === "Backspace" && onBackspaceAtStart && caretAtStart(el)) {
      e.preventDefault()
      onBackspaceAtStart()
      return
    }
    if (e.key === "ArrowUp" && onArrowOut && caretAtStart(el)) {
      e.preventDefault()
      onArrowOut("up")
      return
    }
    if (e.key === "ArrowDown" && onArrowOut && caretAtEnd(el)) {
      e.preventDefault()
      onArrowOut("down")
      return
    }
    /* "# ", "- ", "1. ", "> " at the start of a paragraph turn it into that kind of block. */
    if (e.key === " " && onShortcut) {
      const text = el.textContent ?? ""
      const at = caretOffset(el)
      if (at !== null && at === text.length && /^(#{1,3}|[-*]|1\.|>)$/.test(text)) {
        if (onShortcut(text)) {
          e.preventDefault()
          el.innerHTML = ""
          reported.current = ""
          el.dataset.empty = "true"
        }
      }
    }
  }

  const Tag = as as React.ElementType
  return (
    <Tag
      ref={elRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={label}
      spellCheck
      data-placeholder={placeholder}
      data-empty="true"
      className={cn(
        "min-w-0 whitespace-pre-wrap break-words outline-none [overflow-wrap:anywhere]",
        "data-[empty=true]:before:pointer-events-none data-[empty=true]:before:text-[#a1a5ad] data-[empty=true]:before:content-[attr(data-placeholder)]",
        className,
      )}
      style={style}
      onInput={report}
      onBlur={report}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPaste={onPasteBlocks}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false
        report()
      }}
    />
  )
})

function isBlankHtml(html: string): boolean {
  return html.replace(/<br\s*\/?>/gi, "").replace(/<[^>]*>/g, "").replace(/&nbsp;|​/g, "").trim() === ""
}
