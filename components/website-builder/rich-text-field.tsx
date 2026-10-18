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
import { Bold, ChevronDown, Heading2, Heading3, Italic, Link, List, ListOrdered, TextQuote } from "lucide-react"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"
import { cn } from "@/lib/utils"
import { ScrollRow } from "@/components/app/rich-text/scroll-row"
import { tt } from "@/lib/i18n/text"
import { ZWSP, caretAfter, copyWithPills, pillHtml, pillKeyDown, pillsFromText, stripZw } from "@/components/website-builder/value-pills"

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
  { get label() { return tt("Paragraph") }, tag: "p" },
  { get label() { return tt("Heading 2") }, tag: "h2" },
  { get label() { return tt("Heading 3") }, tag: "h3" },
  { get label() { return tt("Heading 4") }, tag: "h4" },
] as const

/*
 * A DYNAMIC VALUE IS A PILL, NOT CODE. `{{ closest.collection.title }}` typed
 * or picked into the text reads as a small labelled pill ("Collection title")
 * while it is edited, one piece the caret moves past and Backspace removes
 * whole; what is saved is the value itself, unchanged. The pill and its keys
 * are value-pills.ts, shared with the sidebar's other text boxes.
 */
export const VALUE_IN_TEXT = /\{\{\s*([a-zA-Z_][\w.]*(?:\s*\|\s*[\w]+(?::[^}]*)?)*)\s*\}\}/g
const CHIP = /<span[^>]*\bdata-value="([^"]*)"[^>]*>[\s\S]*?<\/span>/g

export function withValueChips(html: string): string {
  if (!html.includes("{{")) return html
  /* Only in text, never inside a tag's attributes. The space after each pill gives the caret somewhere to be. */
  return html.replace(/(^|>)([^<]*)/g, (_m, open: string, text: string) =>
    open + text.replace(VALUE_IN_TEXT, (_v, expr: string) => pillHtml(expr.trim()) + ZWSP),
  )
}

export function withoutValueChips(html: string): string {
  const plain = stripZw(html)
  if (!plain.includes("data-value=")) return plain
  return plain.replace(CHIP, (_m, expr: string) => `{{ ${expr.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&amp;/g, "&")} }}`)
}

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
  variant = "sidebar",
  label,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  /**
   * WHERE IT IS WRITTEN IN. `sidebar` is the builder's panel: a style select,
   * a ceiling and a resize handle, small type. `page` is a page of its own
   * (Website Settings › Policies), where the text IS the page: no ceiling,
   * the field grows with what is written and the page scrolls; the toolbar
   * stays at the top of the view while it does (sticky, under the phone's
   * Back bar); 15px type, 16px on a phone so iOS does not zoom into it;
   * H2 and H3 as buttons beside Bold, and a quote; 44px targets on a phone.
   */
  variant?: "sidebar" | "page"
  /** What a screen reader calls the field when there is no placeholder. */
  label?: string
}) {
  const page = variant === "page"
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
  /**
   * AND ITS OWN ECHO IS NOT "SOMEWHERE ELSE". What leaves the field is the
   * cleaned markup, which is not always byte for byte what the DOM holds (a
   * space typed at the end of a line is a non-breaking one in the DOM, the
   * cleaner writes it another way). When that came back as the value it
   * looked like news, was written in, and the caret went to the start of
   * the field mid-word. The value this field last sent is skipped.
   */
  const sent = React.useRef<string | null>(null)
  /**
   * AND NOR IS AN OLDER ECHO. Typing faster than the editor renders sends
   * "Hel", then "Hell", and "Hel" can come back after "Hell" left. Written
   * in, it deleted the last letter and threw the caret to the start. Every
   * value sent since the last one from outside is ours.
   */
  const recent = React.useRef<string[]>([])
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const incoming = value ?? ""
    if (incoming === sent.current) return
    if (recent.current.includes(incoming)) return
    recent.current = []
    sent.current = null
    const shown = withValueChips(incoming)
    if (el.innerHTML !== shown) el.innerHTML = shown
    setEmpty(!stripZw(el.textContent ?? "").trim())
  }, [value])

  const publish = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    /*
      A value just typed or pasted in braces becomes its pill where it
      stands, with the caret right after it. This used to rewrite the whole
      field and put the caret at the very end, so a value pasted into the
      middle of a sentence threw the caret out of the sentence.
    */
    const made = pillsFromText(el, VALUE_IN_TEXT)
    if (made && document.activeElement === el) caretAfter(made)
    setEmpty(!stripZw(el.textContent ?? "").trim())
    const clean = sanitizeRichText(withoutValueChips(el.innerHTML))
    if (clean !== value) {
      sent.current = clean
      recent.current.push(clean)
      if (recent.current.length > 64) recent.current.shift()
      onChange(clean)
    }
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
    let found = false
    while (node && node !== el) {
      if (node instanceof HTMLElement) {
        const tag = node.tagName.toLowerCase()
        if (tag === "a") link = true
        /* The nearest block names the style; a quote around it wins, since that is what the Quote button undoes. */
        if (tag === "blockquote") block = "blockquote"
        else if (!found && /^(p|h2|h3|h4)$/.test(tag)) block = tag
        if (/^(p|h2|h3|h4|blockquote)$/.test(tag)) found = true
      }
      node = node.parentNode
    }
    /* A selection that starts on the field itself (a whole block selected) has no block above it; the browser says which one. */
    if (!found) {
      try {
        const fb = String(document.queryCommandValue("formatBlock") || "").toLowerCase()
        if (/^(p|h2|h3|h4|blockquote)$/.test(fb)) block = fb
      } catch {
        /* a browser without it keeps Paragraph */
      }
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
    /* Beside a pill: Backspace and Delete take it whole, an arrow steps over it. */
    if (ref.current && pillKeyDown(e, ref.current)) return
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

  /** A block style on, or back to a paragraph when it already is that style. */
  const toggleBlock = (tag: "h2" | "h3" | "blockquote") => run("formatBlock", active.block === tag ? "<p>" : `<${tag}>`)

  return (
    <div
      className={cn(
        "border border-border bg-background transition-colors",
        page
          ? /* Clipped without being a scroller, so the toolbar inside can stick to the page's scroll. */
            "rounded-xl overflow-clip focus-within:border-neutral-400 dark:focus-within:border-white/30"
          : "rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-neutral-900/10 focus-within:border-neutral-400",
      )}
      data-builder-rich-text=""
      data-variant={variant}
    >
      {/* The toolbar, and the link row when one is being written, stay in view
          while a long policy scrolls under them: under the phone's 48px Back
          bar, at the top of the page on a computer. */}
      <div className={cn(page && "sticky top-12 z-[2] md:top-0")} data-rich-text-bar="">
      {/* ONE WEIGHT, ONE SIZE, ONE COLOUR. 15px icons on a 28px target on a
          computer and 40px on a phone, one row that scrolls sideways inside
          itself on a narrow sidebar rather than wrapping to two, with a fade
          and an arrow at the end that has more. What the caret is in is lit,
          so the toolbar says what a press will undo. */}
      <ScrollRow
        wrapClassName={cn("border-b border-border", page ? "bg-background" : "bg-muted/30")}
        className={cn(
          "gap-px px-1.5 py-1 [--row-fade:36px]",
          /* In the sidebar the row wraps onto a second line rather than scrolling: seven controls, and none of them should be a swipe away in a 240px panel. */
          page ? "max-sm:px-1 max-sm:py-0.5" : "flex-wrap",
        )}
        arrowClassName={page ? "w-11 md:w-8" : "w-10 sm:w-8"}
      >
        {page ? (
          <>
            <ToolbarButton size="page" label={tt("Heading 2")} on={active.block === "h2"} onClick={() => toggleBlock("h2")}>
              <Heading2 className="h-[17px] w-[17px]" strokeWidth={1.9} />
            </ToolbarButton>
            <ToolbarButton size="page" label={tt("Heading 3")} on={active.block === "h3"} onClick={() => toggleBlock("h3")}>
              <Heading3 className="h-[17px] w-[17px]" strokeWidth={1.9} />
            </ToolbarButton>
          </>
        ) : (
          <BlockSelect current={active.block} onPick={(tag) => run("formatBlock", `<${tag}>`)} />
        )}
        <Divider />

        <ToolbarButton size={variant} label={tt("Bold")} on={active.bold} onClick={() => run("bold")}>
          <Bold className="h-[15px] w-[15px]" strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton size={variant} label={tt("Italic")} on={active.italic} onClick={() => run("italic")}>
          <Italic className="h-[15px] w-[15px]" strokeWidth={2.1} />
        </ToolbarButton>
        <ToolbarButton
          size={variant}
          label={tt("Link")}
          on={active.link || linkDraft !== null}
          onClick={() => (active.link ? run("unlink") : openLink())}
        >
          <Link className="h-[15px] w-[15px]" strokeWidth={1.9} />
        </ToolbarButton>
        <Divider />

        <ToolbarButton size={variant} label={tt("Bulleted list")} on={active.ul} onClick={() => run("insertUnorderedList")}>
          <List className="h-[15px] w-[15px]" strokeWidth={1.9} />
        </ToolbarButton>
        <ToolbarButton size={variant} label={tt("Numbered list")} on={active.ol} onClick={() => run("insertOrderedList")}>
          <ListOrdered className="h-[15px] w-[15px]" strokeWidth={1.9} />
        </ToolbarButton>
        {page && (
          <ToolbarButton size="page" label={tt("Quote")} on={active.block === "blockquote"} onClick={() => toggleBlock("blockquote")}>
            <TextQuote className="h-[15px] w-[15px]" strokeWidth={1.9} />
          </ToolbarButton>
        )}
      </ScrollRow>

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
            placeholder={tt("Link or /page")}
            aria-label={tt("Link address")}
            className={cn(
              "h-8 max-sm:h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[13px] max-sm:text-[16px] outline-none focus:border-neutral-400",
              page && "max-sm:h-11",
            )}
          />
          <button type="submit" className={cn("h-8 max-sm:h-10 shrink-0 rounded-md bg-neutral-900 px-3 text-[12.5px] max-sm:text-[14px] font-medium text-white transition-colors hover:bg-neutral-800", page && "max-sm:h-11 dark:bg-white dark:text-[#0f0f0f] dark:hover:bg-white/90")}>
            {tt("Add")}
          </button>
          <button
            type="button"
            onClick={() => setLinkDraft(null)}
            className={cn("h-8 max-sm:h-10 shrink-0 rounded-md px-2 text-[12.5px] max-sm:text-[14px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground", page && "max-sm:h-11")}
          >
            {tt("Cancel")}
          </button>
        </form>
      )}
      </div>

      <div className="relative">
        {empty && placeholder ? (
          <p className={cn("pointer-events-none absolute text-muted-foreground", page ? "left-4 top-3 text-[15px] max-sm:text-[16px]" : "left-3 top-2.5 text-sm max-sm:text-[16px]")}>{placeholder}</p>
        ) : null}
        {/* 16px on a phone: iOS zooms the whole page into a field whose text is smaller. */}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={label ?? placeholder}
          contentEditable
          suppressContentEditableWarning
          onInput={publish}
          onBlur={() => {
            publish()
            /* Out of the field, an undo from the toolbar is news again. */
            recent.current = sent.current ? [sent.current] : []
          }}
          onPaste={onPaste}
          onCopy={(e) => {
            if (ref.current) copyWithPills(e, ref.current)
          }}
          onCut={(e) => {
            if (ref.current) copyWithPills(e, ref.current, true)
          }}
          onKeyDown={onKeyDown}
          onFocus={readActive}
          className={cn(
            /* A long web address or an unbroken word wraps where it has to, so the field never scrolls sideways. */
            "wb-richtext wb-slim-scroll min-w-0 overflow-y-auto overflow-x-hidden [overflow-wrap:anywhere] px-3 py-2.5 text-sm max-sm:text-[16px] outline-none",
            /* No ceiling on a page: the field grows and the page scrolls, so !max-h-none outranks the sidebar's inline one. */
            page && "!max-h-none px-4 py-3 text-[15px] leading-[1.6] max-sm:text-[16px]",
          )}
          style={{ minHeight, maxHeight }}
        />
      </div>
      {!page && <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={tt("Drag to resize")}
        title={tt("Drag to resize")}
        data-rich-text-resize=""
        onPointerDown={startResize}
        onDoubleClick={resetSize}
        className="flex h-4 max-sm:h-6 cursor-ns-resize touch-none select-none items-center justify-center border-t border-border/70 bg-muted/20 transition-colors hover:bg-muted/50"
      >
        <span aria-hidden className="h-1 w-8 rounded-full bg-neutral-300" />
      </div>}
    </div>
  )
}

function ToolbarButton({
  label,
  on = false,
  onClick,
  children,
  size = "sidebar",
}: {
  label: string
  on?: boolean
  onClick: () => void
  children: React.ReactNode
  /** 28px in the sidebar (40 on a phone); 32px on a page of its own, 44 on a phone. */
  size?: "sidebar" | "page"
}) {
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
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors",
        size === "page" ? "h-8 w-8 max-sm:h-11 max-sm:w-11" : "h-7 w-7 max-sm:h-10 max-sm:w-10",
        on
          ? size === "page"
            ? "bg-muted text-foreground"
            : "bg-background text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
          : size === "page"
            ? "text-foreground/65 hover:bg-muted/70 hover:text-foreground"
            : "text-foreground/70 hover:bg-background hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

const Divider = () => <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />

function BlockSelect({ current, onPick }: { current: string; onPick: (tag: string) => void }) {
  const label = BLOCKS.find((b) => b.tag === current)?.label ?? tt("Paragraph")
  return (
    <div className="relative shrink-0">
      <select
        aria-label={tt("Text style")}
        className="h-7 max-sm:h-10 cursor-pointer appearance-none rounded-md bg-transparent pl-2 pr-6 text-[13px] max-sm:text-[15px] text-foreground/80 outline-none transition-colors hover:bg-background"
        value={BLOCKS.some((b) => b.tag === current) ? current : "p"}
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
