"use client"

/**
 * ===========================================================================
 *  WORDS WITH SHOP DATA IN THEM, AS PILLS
 * ===========================================================================
 * A text setting can hold a source among its words: "Welcome to
 * {{ shop.name }}". The field used to show exactly that, braces and dots.
 * The owner asked for what Shopify and Notion do instead: the source sits in
 * the sentence as a small grey pill with its name, the words around it stay
 * ordinary editable text, Backspace takes the pill out whole, and a click on
 * it offers another value or Remove (dynamic-source-field.tsx draws that
 * list). The pill itself, and its keys, are value-pills.ts.
 *
 * ONE STRING IN, ONE STRING OUT. The value is still the plain string with
 * `{{ id }}` placeholders that the renderers read (lib/storelib-theme/
 * dynamic.ts); this control only draws it. The DOM is rebuilt from the value
 * when the value changes from outside (an insert, an undo), and read back
 * into the string on every input, so the two never drift.
 *
 * WHERE THE CARET IS is counted in the string, a pill being as long as its
 * placeholder, so "insert at the caret" (insertPlaceholder) keeps working.
 *
 * GROWS, NEVER SIDEWAYS. One line or many, the words wrap, and the box grows
 * a line at a time up to about ten lines, then scrolls up and down only.
 */
import * as React from "react"

import { dynamicSource, placeholderFor } from "@/lib/storelib-theme/dynamic"
import { cn } from "@/lib/utils"
import {
  ZWSP,
  caretAfter,
  copyWithPills,
  ensureCaretRoom,
  isPill,
  pillKeyDown,
  pillNode,
  pillsFromText,
  stripZw,
} from "@/components/website-builder/value-pills"

const TOKEN = /\{\{\s*([a-z_]+(?:\.[a-z_]+){1,2})\s*\}\}/g

type Piece = { text: string } | { id: string; label: string }

/** The value as words and pills. A placeholder for a source nobody knows stays words, so nothing is lost. */
export function chipPieces(value: string): Piece[] {
  const out: Piece[] = []
  let last = 0
  for (const m of value.matchAll(TOKEN)) {
    const source = dynamicSource(m[1])
    if (!source) continue
    const at = m.index ?? 0
    if (at > last) out.push({ text: value.slice(last, at) })
    out.push({ id: m[1], label: source.label })
    last = at + m[0].length
  }
  if (last < value.length) out.push({ text: value.slice(last) })
  return out
}

/** The string the DOM says. A pill is its placeholder; a line break inside a multi-line field is "\n". */
function serialize(root: HTMLElement): string {
  let out = ""
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) out += stripZw(child.textContent ?? "")
      else if (isPill(child)) out += placeholderFor(child.dataset.value ?? "")
      else if (child instanceof HTMLBRElement) out += "\n"
      else if (child instanceof HTMLElement) {
        /* A browser wraps a new line in a <div>: it starts a line. */
        if ((child.tagName === "DIV" || child.tagName === "P") && out !== "" && !out.endsWith("\n")) out += "\n"
        walk(child)
      }
    }
  }
  walk(root)
  /* A lone <br> a browser leaves in an emptied field is not a line. */
  return out === "\n" ? "" : out
}

function build(root: HTMLElement, value: string) {
  root.replaceChildren()
  for (const p of chipPieces(value)) {
    if ("id" in p) root.append(pillNode(p.id))
    else root.append(document.createTextNode(p.text))
  }
  ensureCaretRoom(root)
}

/** The caret as an offset in the string. */
function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return null
  const range = sel.getRangeAt(0).cloneRange()
  range.selectNodeContents(root)
  range.setEnd(sel.anchorNode!, sel.anchorOffset)
  const probe = document.createElement("div")
  probe.append(range.cloneContents())
  return serialize(probe).length
}

/** Put the caret at an offset in the string, after a pill if it lands on one. The place holder spaces count as nothing. */
function placeCaret(root: HTMLElement, offset: number) {
  let left = offset
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const put = () => {
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const raw = child.textContent ?? ""
      const len = stripZw(raw).length
      if (left <= len) {
        /* The offset in the node's own characters, stepping over the place holders. */
        let i = 0
        let seen = 0
        while (i < raw.length && (seen < left || raw[i] === ZWSP)) {
          if (raw[i] !== ZWSP) seen++
          i++
        }
        range.setStart(child, i)
        return put()
      }
      left -= len
    } else if (isPill(child)) {
      const len = placeholderFor(child.dataset.value ?? "").length
      if (left <= len) {
        caretAfter(child)
        return
      }
      left -= len
    }
  }
  range.selectNodeContents(root)
  range.collapse(false)
  put()
}

export interface ChipTextInputHandle {
  focusAt: (offset: number) => void
  caret: () => number | null
}

export const ChipTextInput = React.forwardRef<
  ChipTextInputHandle,
  {
    value: string
    onChange: (next: string) => void
    multiline?: boolean
    label?: string
    placeholder?: string
    /** Called with the caret's offset whenever it moves, so an insert lands where the person was. */
    onCaret?: (offset: number | null) => void
  }
>(function ChipTextInput({ value, onChange, multiline = false, label, placeholder, onCaret }, ref) {
  const el = React.useRef<HTMLDivElement>(null)
  const emitted = React.useRef<string | null>(null)
  const [empty, setEmpty] = React.useState(value === "")

  /* From outside (an insert, an undo, another field): draw it again. What this field just sent is already drawn. */
  React.useLayoutEffect(() => {
    const root = el.current
    if (!root) return
    if (emitted.current === value && serialize(root) === value) return
    build(root, value)
    emitted.current = value
    setEmpty(value === "")
  }, [value])

  React.useImperativeHandle(ref, () => ({
    focusAt: (offset) => {
      const root = el.current
      if (!root) return
      root.focus({ preventScroll: true })
      placeCaret(root, offset)
    },
    caret: () => (el.current ? caretOffset(el.current) : null),
  }))

  const read = () => {
    const root = el.current
    if (!root) return
    /* A placeholder typed or pasted in braces becomes its pill where it stands, the caret after it. */
    const made = pillsFromText(root, TOKEN, (id) => !!dynamicSource(id))
    if (made && document.activeElement === root) caretAfter(made)
    const next = serialize(root)
    emitted.current = next
    setEmpty(next === "")
    onChange(next)
  }
  const tellCaret = () => {
    if (el.current) onCaret?.(caretOffset(el.current))
  }

  return (
    <div className="relative">
      <div
        ref={el}
        role="textbox"
        aria-multiline={multiline || undefined}
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-chip-input=""
        onInput={read}
        onKeyUp={tellCaret}
        onMouseUp={tellCaret}
        onBlur={tellCaret}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !multiline) {
            e.preventDefault()
            return
          }
          if (el.current) pillKeyDown(e, el.current)
        }}
        onCopy={(e) => {
          if (el.current) copyWithPills(e, el.current)
        }}
        onCut={(e) => {
          if (el.current) copyWithPills(e, el.current, true)
        }}
        onPaste={(e) => {
          /* Words only: a pasted page's markup is not a setting. Braces in them come back as pills (read, above). */
          e.preventDefault()
          const text = e.clipboardData.getData("text/plain")
          document.execCommand("insertText", false, multiline ? text : text.replace(/\s*\n\s*/g, " "))
        }}
        className={cn(
          "w-full rounded-md border border-border bg-background px-2.5 py-[6px] text-[13px] leading-[18px] text-foreground transition-colors",
          "focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10",
          "max-sm:min-h-11 max-sm:py-[10px] max-sm:text-[16px] max-sm:leading-[22px]",
          /* One line or many, the words wrap and the box grows: never a sideways scroll. About ten lines, then up and down only. */
          "whitespace-pre-wrap break-words [overflow-wrap:anywhere] overflow-x-hidden overflow-y-auto wb-slim-scroll max-h-[196px] max-sm:max-h-[236px]",
          multiline ? "min-h-[72px]" : "min-h-8",
        )}
      />
      {empty && placeholder && (
        <span aria-hidden className="pointer-events-none absolute left-2.5 top-[7px] text-[13px] text-muted-foreground max-sm:top-[11px] max-sm:text-[16px]">
          {placeholder}
        </span>
      )}
    </div>
  )
})
