"use client"

/**
 * ===========================================================================
 *  WORDS WITH SHOP DATA IN THEM, AS CHIPS
 * ===========================================================================
 * A text setting can hold a source among its words: "Welcome to
 * {{ shop.name }}". The field used to show exactly that, braces and dots,
 * with a line under it spelling the sentence back ("On the page: Welcome to
 * Shop name"). The owner asked for what Shopify and Notion do instead: the
 * source sits in the sentence as a small grey chip with its name, the words
 * around it stay ordinary editable text, and the chip comes out with
 * Backspace or its own x.
 *
 * ONE STRING IN, ONE STRING OUT. The value is still the plain string with
 * `{{ id }}` placeholders that the renderers read (lib/storelib-theme/
 * dynamic.ts); this control only draws it. The DOM is rebuilt from the value
 * when the value changes from outside (an insert, an undo), and read back
 * into the string on every input, so the two never drift.
 *
 * WHERE THE CARET IS is counted in the string, a chip being as long as its
 * placeholder, so "insert at the caret" (insertPlaceholder) keeps working.
 */
import * as React from "react"

import { dynamicSource, placeholderFor } from "@/lib/storelib-theme/dynamic"
import { cn } from "@/lib/utils"

const TOKEN = /\{\{\s*([a-z_]+(?:\.[a-z_]+){1,2})\s*\}\}/g

type Piece = { text: string } | { id: string; label: string }

/** The value as words and chips. A placeholder for a source nobody knows stays words, so nothing is lost. */
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

const CHIP =
  "mx-[1px] inline-flex select-none items-center gap-0.5 whitespace-nowrap rounded-[6px] bg-[#eceef1] py-px pl-1.5 pr-0.5 align-baseline text-[12px] font-medium leading-[18px] text-[#374151] max-sm:text-[14px] max-sm:leading-[22px]"

function chipNode(id: string, label: string): HTMLElement {
  const chip = document.createElement("span")
  chip.contentEditable = "false"
  chip.dataset.chip = id
  chip.className = CHIP
  const name = document.createElement("span")
  name.textContent = label
  const x = document.createElement("button")
  x.type = "button"
  x.tabIndex = -1
  x.dataset.chipRemove = ""
  x.setAttribute("aria-label", `Remove ${label}`)
  x.className = "inline-flex h-4 w-4 items-center justify-center rounded-[4px] text-[#9ca3af] hover:bg-[#dfe1e5] hover:text-[#374151] max-sm:h-5 max-sm:w-5"
  x.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  chip.append(name, x)
  return chip
}

/** The string the DOM says. A chip is its placeholder; a line break inside a multi-line field is "\n". */
function serialize(root: HTMLElement): string {
  let out = ""
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? ""
      else if (child instanceof HTMLElement && child.dataset.chip) out += placeholderFor(child.dataset.chip)
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
    if ("id" in p) root.append(chipNode(p.id, p.label))
    else root.append(document.createTextNode(p.text))
  }
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

/** Put the caret at an offset in the string, after a chip if it lands on one. */
function placeCaret(root: HTMLElement, offset: number) {
  let left = offset
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  for (const child of root.childNodes) {
    const len = child.nodeType === Node.TEXT_NODE ? (child.textContent ?? "").length : child instanceof HTMLElement && child.dataset.chip ? placeholderFor(child.dataset.chip).length : 0
    if (left <= len && child.nodeType === Node.TEXT_NODE) {
      range.setStart(child, left)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    if (left <= len) {
      range.setStartAfter(child)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    left -= len
  }
  range.selectNodeContents(root)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
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
          if (e.key === "Enter" && !multiline) e.preventDefault()
        }}
        onPaste={(e) => {
          /* Words only: a pasted page's markup is not a setting. */
          e.preventDefault()
          const text = e.clipboardData.getData("text/plain")
          document.execCommand("insertText", false, multiline ? text : text.replace(/\s*\n\s*/g, " "))
        }}
        onClick={(e) => {
          const x = (e.target as HTMLElement).closest("[data-chip-remove]")
          if (!x) return
          e.preventDefault()
          x.closest("[data-chip]")?.remove()
          read()
        }}
        className={cn(
          "w-full rounded-md border border-border bg-background px-2.5 py-[6px] text-[13px] leading-[18px] text-foreground transition-colors",
          "focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/10",
          "max-sm:min-h-11 max-sm:py-[10px] max-sm:text-[16px] max-sm:leading-[22px]",
          /* One line or many, the words wrap: a chip is never cut off at the edge of a narrow sidebar. */
          "whitespace-pre-wrap break-words",
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
