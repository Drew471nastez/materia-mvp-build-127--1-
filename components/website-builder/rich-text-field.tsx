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
import { Bold, ChevronDown, Italic, Link, List, ListOrdered } from "lucide-react"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"
import { cn } from "@/lib/utils"

/**
 * NO ASSISTANT BUTTON IN HERE.
 *
 * It was the first thing in the toolbar and it was the wrong place for it.
 * This is the control for a text setting, used by every richtext field in
 * the product; the assistant is a thing you ask about a SECTION, and it
 * already has its own button on the section toolbar. A door to it in every
 * text box is a second entrance to one room, and it pushed the controls that
 * belong here along by one.
 */

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
  minHeight = 120,
  /**
   * WHERE IT STOPS GROWING.
   *
   * A policy body is two thousand words. Left to size itself the field owned
   * the whole panel and the section's other settings were a scroll away, so
   * past this it scrolls inside itself on the panel's own slim bar. Roughly
   * eight lines: enough to write in, short enough that Hide, Duplicate and
   * Delete stay on screen. The handle under the field makes it taller or
   * shorter by hand; a double click puts it back.
   */
  maxHeight = 260,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  maxHeight?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = React.useState(!value || value === "<p></p>")
  /** What the caret is in, so the toolbar shows it: bold lit while in bold, the style's name in the select. */
  const [active, setActive] = React.useState<{ bold: boolean; italic: boolean; ul: boolean; ol: boolean; link: boolean; block: string }>({
    bold: false,
    italic: false,
    ul: false,
    ol: false,
    link: false,
    block: "p",
  })
  /** The link being written, in a row under the toolbar instead of the browser's prompt, which a phone draws as a system alert. */
  const [linkDraft, setLinkDraft] = React.useState<string | null>(null)
  const savedRange = React.useRef<Range | null>(null)

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

  /** Read the caret's formatting, only while the caret is in this field. */
  const readActive = React.useCallback(() => {
    const el = ref.current
    const sel = typeof window !== "undefined" ? window.getSelection() : null
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return
    const q = (c: string) => {
      try {
        return document.queryCommandState(c)
      } catch {
        return false
      }
    }
    let node: Node | null = sel.anchorNode
    let block = "p"
    let link = false
    while (node && node !== el) {
      if (node instanceof HTMLElement) {
        const tag = node.tagName.toLowerCase()
        if (tag === "a") link = true
        if (/^(p|h2|h3|h4)$/.test(tag)) {
          block = tag
          break
        }
      }
      node = node.parentNode
    }
    setActive((prev) => {
      const next = { bold: q("bold"), italic: q("italic"), ul: q("insertUnorderedList"), ol: q("insertOrderedList"), link, block }
      return prev.bold === next.bold && prev.italic === next.italic && prev.ul === next.ul && prev.ol === next.ol && prev.link === next.link && prev.block === next.block ? prev : next
    })
  }, [])

  React.useEffect(() => {
    document.addEventListener("selectionchange", readActive)
    return () => document.removeEventListener("selectionchange", readActive)
  }, [readActive])

  /** Run a command against the selection, keeping focus in the field. */
  const run = (command: string, argument?: string) => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    try {
      /* A new line is a paragraph, not a bare div, so what is saved is what the page styles. */
      document.execCommand("defaultParagraphSeparator", false, "p")
      document.execCommand(command, false, argument)
    } catch {
      /* a browser that refuses is a browser where typing still works */
    }
    publish()
    readActive()
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

  /** The shortcuts every editor has. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === "b") {
      e.preventDefault()
      run("bold")
    } else if (k === "i") {
      e.preventDefault()
      run("italic")
    } else if (k === "k") {
      e.preventDefault()
      openLink()
    }
  }

  const openLink = () => {
    const sel = window.getSelection()
    savedRange.current = sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null
    setLinkDraft("")
  }
  const applyLink = () => {
    const href = (linkDraft ?? "").trim()
    setLinkDraft(null)
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    const sel = window.getSelection()
    if (savedRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    if (!href) return
    /** Anything that is not a URL or a path is not a link. */
    const safe = /^(https?:\/\/|mailto:|tel:|\/)/i.test(href) ? href : `https://${href}`
    if (sel && sel.isCollapsed) run("insertHTML", `<a href="${safe.replace(/"/g, "&quot;")}">${safe.replace(/[<>&]/g, "")}</a>`)
    else run("createLink", safe)
  }

  /**
   * A HANDLE UNDER THE FIELD, dragged up or down to make it shorter or taller.
   * The height is written straight onto the box on each frame of the drag,
   * so a drag is not a re-render per pointer move, and kept afterwards.
   */
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || (e.pointerType === "mouse" && e.button !== 0)) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startH = el.getBoundingClientRect().height
    let frame = 0
    let y = startY
    const draw = () => {
      frame = 0
      const h = Math.max(minHeight, Math.min(900, startH + (y - startY)))
      el.style.height = `${h}px`
      el.style.maxHeight = `${h}px`
    }
    const move = (ev: PointerEvent) => {
      y = ev.clientY
      if (!frame) frame = requestAnimationFrame(draw)
    }
    const end = () => {
      if (frame) cancelAnimationFrame(frame)
      draw()
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }
  const resetSize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = ""
    el.style.maxHeight = `${maxHeight}px`
  }

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-neutral-900/10 focus-within:border-neutral-400 transition-colors" data-builder-rich-text="">
      {/* ONE WEIGHT, ONE SIZE, ONE COLOUR. 15px icons on a 28px target on a
          computer and 40px on a phone, one row that scrolls sideways inside
          itself on a narrow sidebar rather than wrapping to two. What the
          caret is in is lit, so the toolbar says what a press will undo. */}
      <div className="flex items-center gap-px overflow-x-auto border-b border-border bg-muted/30 px-1.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <BlockSelect current={active.block} onPick={(tag) => run("formatBlock", `<${tag}>`)} />
        <Divider />

        <ToolbarButton label="Bold" on={active.bold} onClick={() => run("bold")}>
          <Bold className="h-[15px] w-[15px]" strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton label="Italic" on={active.italic} onClick={() => run("italic")}>
          <Italic className="h-[15px] w-[15px]" strokeWidth={2.1} />
        </ToolbarButton>
        <ToolbarButton
          label="Link"
          on={active.link || linkDraft !== null}
          onClick={() => (active.link ? run("unlink") : openLink())}
        >
          <Link className="h-[15px] w-[15px]" strokeWidth={1.9} />
        </ToolbarButton>
        <Divider />

        <ToolbarButton label="Bulleted list" on={active.ul} onClick={() => run("insertUnorderedList")}>
          <List className="h-[15px] w-[15px]" strokeWidth={1.9} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" on={active.ol} onClick={() => run("insertOrderedList")}>
          <ListOrdered className="h-[15px] w-[15px]" strokeWidth={1.9} />
        </ToolbarButton>
      </div>

      {linkDraft !== null && (
        <form
          className="flex items-center gap-1.5 border-b border-border bg-background px-2 py-1.5"
          data-rich-text-link=""
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <input
            autoFocus
            type="text"
            inputMode="url"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                setLinkDraft(null)
                ref.current?.focus({ preventScroll: true })
              }
            }}
            placeholder="Link or /page"
            aria-label="Link address"
            className="h-8 max-sm:h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[13px] max-sm:text-[16px] outline-none focus:border-neutral-400"
          />
          <button type="submit" className="h-8 max-sm:h-10 shrink-0 rounded-md bg-neutral-900 px-3 text-[12.5px] max-sm:text-[14px] font-medium text-white transition-colors hover:bg-neutral-800">
            Add
          </button>
          <button
            type="button"
            onClick={() => setLinkDraft(null)}
            className="h-8 max-sm:h-10 shrink-0 rounded-md px-2 text-[12.5px] max-sm:text-[14px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            Cancel
          </button>
        </form>
      )}

      <div className="relative">
        {empty && placeholder ? (
          <p className="pointer-events-none absolute left-3 top-2.5 text-sm max-sm:text-[16px] text-muted-foreground">{placeholder}</p>
        ) : null}
        {/* 16px on a phone: iOS zooms the whole page into a field whose text is smaller. */}
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
          onKeyDown={onKeyDown}
          onFocus={readActive}
          className="wb-richtext wb-slim-scroll overflow-y-auto px-3 py-2.5 text-sm max-sm:text-[16px] outline-none"
          style={{ minHeight, maxHeight }}
        />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize"
        title="Drag to resize"
        data-rich-text-resize=""
        onPointerDown={startResize}
        onDoubleClick={resetSize}
        className="flex h-4 max-sm:h-6 cursor-ns-resize touch-none select-none items-center justify-center border-t border-border/70 bg-muted/20 transition-colors hover:bg-muted/50"
      >
        <span aria-hidden className="h-1 w-8 rounded-full bg-neutral-300" />
      </div>
    </div>
  )
}

function ToolbarButton({ label, on = false, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      /**
       * `onMouseDown`, not `onClick`: a click moves focus out of the field
       * first, and a browser that has lost the selection has nothing to make
       * bold. Preventing the default keeps the selection exactly where it was.
       */
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={cn(
        "inline-flex h-7 w-7 max-sm:h-10 max-sm:w-10 shrink-0 items-center justify-center rounded-md transition-colors",
        on ? "bg-background text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" : "text-foreground/70 hover:bg-background hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

const Divider = () => <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />

function BlockSelect({ current, onPick }: { current: string; onPick: (tag: string) => void }) {
  const label = BLOCKS.find((b) => b.tag === current)?.label ?? "Paragraph"
  return (
    <div className="relative shrink-0">
      <select
        aria-label="Text style"
        className="h-7 max-sm:h-10 cursor-pointer appearance-none rounded-md bg-transparent pl-2 pr-6 text-[13px] max-sm:text-[15px] text-foreground/80 outline-none transition-colors hover:bg-background"
        value={current}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => onPick(e.target.value)}
      >
        {BLOCKS.map((b) => (
          <option key={b.tag} value={b.tag}>
            {b.label}
          </option>
        ))}
      </select>
      <span className="sr-only">{label}</span>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/60" />
    </div>
  )
}
