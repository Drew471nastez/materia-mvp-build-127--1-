"use client"

/**
 * ===========================================================================
 *  ONE FORMATTING BAR FOR THE WHOLE EMAIL
 * ===========================================================================
 * Every text block used to carry a full toolbar of its own, so an email with
 * a button in it had two editors on the screen, each with its row of
 * controls. Now there is one bar, and it acts on the block the caret is in.
 * Where it sits is where a thumb or a pointer already is:
 *
 *   ON A PHONE it is docked on the keyboard, and only there while a text
 *   block has the caret: the way Mail, Gmail and Notion put their controls
 *   on a phone. Its place is the page's one keyboard number, --kb-inset,
 *   published on <html> by components/viewport-vars.tsx from visualViewport,
 *   so it sits exactly on the keys in Safari, in the app, and on Android.
 *   It rises and goes on transform and opacity only. While it is up it keeps
 *   the caret clear of itself, scrolling the page when the line being typed
 *   would be under it.
 *
 *   FROM 768px it is the top edge of the email, stuck under the page's bar
 *   while the email scrolls under it, like a document editor's.
 *
 * One row, every control a 44px target on a phone and 32px on a computer.
 * The row swaps what it holds rather than opening anything over the text,
 * so the keyboard stays up: the link's address, the reader's name fields,
 * the blocks that can be added where the caret is, and the moves for the
 * block itself. Each has a way back to the formatting.
 *
 * The commands are the browser's own (execCommand), run on the block the
 * caret was last in, with its selection put back first: bold, italic,
 * underline, strike, two heading levels, two lists, a quote, alignment, a
 * link, clear, undo and redo. Each fires the block's input event, which is
 * what saves it (./text-block.tsx).
 */
import * as React from "react"
import { createPortal } from "react-dom"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronLeft,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { normaliseTypedHref } from "@/lib/rich-text/policy"
import { cleanStoredHtml, escapeAttr, escapeText, isBlankHtml } from "@/lib/rich-text/html"
import type { BlockType } from "@/lib/email-campaigns/blocks"

type Mode = "format" | "link" | "insert" | "fields" | "block"
type Align = "left" | "center" | "right"

interface Active {
  block: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  list: "" | "ul" | "ol"
  quote: boolean
  link: boolean
  align: Align
}
const NONE: Active = { block: "p", bold: false, italic: false, underline: false, strike: false, list: "", quote: false, link: false, align: "left" }

/** Where the caret was when a block was asked for: the block, and its words before and after the caret. */
export interface InsertPoint {
  blockId: string
  head: string
  tail: string
}

export interface BlockAction {
  label: string
  run: () => void
  danger?: boolean
}

export interface FormatBarProps {
  /** The editor the bar serves: text blocks inside it are the ones it acts on. */
  editorRef: React.RefObject<HTMLElement | null>
  /** Docked on the keyboard (below 768px) or stuck to the top of the email. */
  phone: boolean
  inserts: { type: BlockType; label: string }[]
  onInsert: (type: BlockType, at: InsertPoint | null) => void
  /** Move, copy and delete for the block the caret is in; empty when it is the only block. */
  blockActions: (blockId: string) => BlockAction[]
  /** The reader's fields a text can carry, filled in per reader when it is sent. */
  fields: { label: string; field: string }[]
}

const TEXT = "[data-email-text]"

/** The nearest ancestor of `node` matching `selector`, not looking past `root`. */
function closestIn(node: Node | null, selector: string, root: HTMLElement): HTMLElement | null {
  let el: Element | null = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null
  while (el && el !== root) {
    if (el.matches(selector)) return el as HTMLElement
    el = el.parentElement
  }
  return null
}

function queryState(command: string): boolean {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

/** Whether a media query matches, kept current; false on the server. */
export function useMedia(query: string): boolean {
  return React.useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia(query)
      mq.addEventListener("change", on)
      return () => mq.removeEventListener("change", on)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Below 768px, the width the page layer and the pill switch at. */
export const usePhoneLayout = () => useMedia("(max-width: 767px)")

const TOOL =
  "inline-flex h-11 min-w-11 shrink-0 cursor-pointer select-none items-center justify-center rounded-[10px] px-0 text-[#4b5563] transition-colors duration-100 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] disabled:cursor-default disabled:opacity-40 md:h-8 md:min-w-8 md:rounded-lg [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#eef0f2] [@media(hover:hover)_and_(pointer:fine)]:hover:text-[#1a1a2e] active:bg-[#e6e8eb]"
const TOOL_ON = "bg-[#e6e8eb] text-[#1a1a2e]"
const WORD =
  "inline-flex h-11 shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-[10px] px-3 text-[15px] font-medium text-[#1a1a2e] transition-colors duration-100 [-webkit-tap-highlight-color:transparent] md:h-8 md:rounded-lg md:px-2.5 md:text-[13px] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#eef0f2] active:bg-[#e6e8eb]"
const SEP = <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[#e5e7eb]" />

/** Keep the caret where it is: a press on the bar never takes the focus from the text. */
const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault()

export function FormatBar({ editorRef, phone, inserts, onInsert, blockActions, fields }: FormatBarProps) {
  const barRef = React.useRef<HTMLDivElement>(null)
  const stripRef = React.useRef<HTMLDivElement>(null)
  const saved = React.useRef<Range | null>(null)
  const targetRef = React.useRef<HTMLElement | null>(null)
  const [blockId, setBlockId] = React.useState<string | null>(null)
  const [focused, setFocused] = React.useState(false)
  const [mode, setMode] = React.useState<Mode>("format")
  const [active, setActive] = React.useState<Active>(NONE)
  const [link, setLink] = React.useState<{ url: string; editing: boolean; error: string } | null>(null)
  const linkAnchor = React.useRef<HTMLAnchorElement | null>(null)
  const modeRef = React.useRef(mode)
  modeRef.current = mode

  const inEditor = React.useCallback((el: Element | null) => !!el && !!editorRef.current?.contains(el), [editorRef])

  /** The text block to act on: the one with the caret, else the last one that had it, else the first. */
  const target = React.useCallback((): HTMLElement | null => {
    const t = targetRef.current
    if (t && t.isConnected && inEditor(t)) return t
    return editorRef.current?.querySelector<HTMLElement>(TEXT) ?? null
  }, [editorRef, inEditor])

  const readActive = React.useCallback((root: HTMLElement) => {
    const sel = document.getSelection()
    if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return
    const at = sel.anchorNode
    const heading = closestIn(at, "h1,h2,h3,h4", root)
    const block = closestIn(at, "p,h1,h2,h3,h4,li,blockquote,div", root)
    const list = closestIn(at, "ul,ol", root)
    const align = (block?.style.textAlign || "").toLowerCase()
    const next: Active = {
      block: heading ? heading.tagName.toLowerCase() : block ? block.tagName.toLowerCase() : "p",
      bold: heading ? !!closestIn(at, "b,strong", root) : queryState("bold"),
      italic: queryState("italic"),
      underline: queryState("underline"),
      strike: queryState("strikeThrough"),
      list: list ? (list.tagName.toLowerCase() as "ul" | "ol") : "",
      quote: !!closestIn(at, "blockquote", root),
      link: !!closestIn(at, "a", root),
      align: align === "center" || align === "right" ? align : "left",
    }
    setActive((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [])

  /* Which block has the caret, and where in it. */
  React.useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(TEXT) ?? null
      if (!el || !inEditor(el)) return
      targetRef.current = el
      setBlockId(el.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null)
      setFocused(true)
      if (modeRef.current === "block" || modeRef.current === "fields") setMode("format")
    }
    let frame = 0
    const onFocusOut = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const a = document.activeElement
        setFocused(!!a && !!a.closest?.(TEXT) && inEditor(a))
      })
    }
    let sel = 0
    const onSelection = () => {
      const s = document.getSelection()
      if (!s || !s.rangeCount) return
      const range = s.getRangeAt(0)
      const node = range.commonAncestorContainer
      const el = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest?.<HTMLElement>(TEXT) ?? null
      if (!el || !inEditor(el)) return
      saved.current = range.cloneRange()
      targetRef.current = el
      cancelAnimationFrame(sel)
      sel = requestAnimationFrame(() => readActive(el))
    }
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)
    document.addEventListener("selectionchange", onSelection)
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(sel)
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      document.removeEventListener("selectionchange", onSelection)
    }
  }, [inEditor, readActive])

  /* A press anywhere that is not the bar or the text puts the row back to its controls. */
  React.useEffect(() => {
    if (mode === "format") return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (barRef.current?.contains(t) || t?.closest?.(TEXT) || t?.closest?.("[role=dialog],[data-radix-popper-content-wrapper]")) return
      setMode("format")
      setLink(null)
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
  }, [mode])

  const open = phone ? focused || mode !== "format" : true

  /*
    THE CARET STAYS IN SIGHT. The browser keeps the caret above the keyboard,
    and knows nothing about a bar on the keyboard: the line being typed would
    go under it. So while the bar is up, a caret below its top edge scrolls
    the page by the difference, once per change of selection, read in a frame.
  */
  React.useEffect(() => {
    if (!phone || !open) return
    let frame = 0
    const clear = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bar = barRef.current
        const root = targetRef.current
        const s = document.getSelection()
        if (!bar || !root || !s || !s.rangeCount || !root.contains(s.anchorNode)) return
        const range = s.getRangeAt(0)
        let r = range.getBoundingClientRect()
        if (!r.height) r = (closestIn(s.anchorNode, "p,h1,h2,h3,li,blockquote", root) ?? root).getBoundingClientRect()
        const edge = bar.getBoundingClientRect().top - 12
        if (r.bottom <= edge) return
        const scroller = root.closest<HTMLElement>("[data-compose]")
        scroller?.scrollBy({ top: Math.ceil(r.bottom - edge), behavior: "auto" })
      })
    }
    clear()
    document.addEventListener("selectionchange", clear)
    window.visualViewport?.addEventListener("resize", clear)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("selectionchange", clear)
      window.visualViewport?.removeEventListener("resize", clear)
    }
  }, [phone, open])

  /** The caret back in its block, where it was. */
  const restore = (): HTMLElement | null => {
    const root = target()
    if (!root) return null
    const sel = document.getSelection()
    const inRoot = !!sel && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).commonAncestorContainer)
    if (document.activeElement === root && inRoot) return root
    root.focus({ preventScroll: true })
    if (!sel) return root
    sel.removeAllRanges()
    const r = saved.current
    if (r && root.contains(r.commonAncestorContainer)) sel.addRange(r)
    else {
      const end = document.createRange()
      end.selectNodeContents(root.lastElementChild ?? root)
      end.collapse(false)
      sel.addRange(end)
    }
    return root
  }

  const exec = (command: string, arg?: string) => {
    const root = restore()
    if (!root) return
    try {
      document.execCommand(command, false, arg)
    } catch {
      /* a browser that refuses one command still types */
    }
    /* What saves the block: its own input event, sent even where the command did not send one. */
    root.dispatchEvent(new Event("input", { bubbles: true }))
    readActive(root)
  }

  const toggleBlock = (tag: "h2" | "h3" | "blockquote") => {
    const on = tag === "blockquote" ? active.quote : active.block === tag || (tag === "h2" && active.block === "h1")
    exec("formatBlock", on ? "<p>" : `<${tag}>`)
  }

  const cycleAlign = () => {
    const next: Align = active.align === "left" ? "center" : active.align === "center" ? "right" : "left"
    exec(next === "center" ? "justifyCenter" : next === "right" ? "justifyRight" : "justifyLeft")
  }

  const openLink = () => {
    const root = target()
    if (!root) return
    const sel = document.getSelection()
    const r = sel && sel.rangeCount && root.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0) : saved.current
    if (r) saved.current = r.cloneRange()
    const anchor = r ? (closestIn(r.startContainer, "a", root) as HTMLAnchorElement | null) : null
    linkAnchor.current = anchor
    setLink({ url: anchor?.getAttribute("href") ?? "", editing: !!anchor, error: "" })
    setMode("link")
  }

  const closeLink = (refocus: boolean) => {
    setLink(null)
    linkAnchor.current = null
    setMode("format")
    if (refocus) restore()
  }

  const applyLink = () => {
    if (!link) return
    const href = normaliseTypedHref(link.url)
    if (!href) return setLink({ ...link, error: "Enter a web address, an email address or a phone number." })
    const root = restore()
    if (!root) return
    const sel = document.getSelection()
    const anchor = linkAnchor.current
    try {
      if (anchor && root.contains(anchor)) {
        const r = document.createRange()
        r.selectNodeContents(anchor)
        sel?.removeAllRanges()
        sel?.addRange(r)
        document.execCommand("createLink", false, href)
        sel?.collapseToEnd()
      } else if (sel && !sel.isCollapsed) {
        document.execCommand("createLink", false, href)
        sel.collapseToEnd()
      } else {
        const words = href.replace(/^(https?:\/\/|mailto:|tel:)/i, "").replace(/\/$/, "")
        document.execCommand("insertHTML", false, `<a href="${escapeAttr(href)}">${escapeText(words)}</a>`)
      }
    } catch {
      /* nothing linked */
    }
    root.dispatchEvent(new Event("input", { bubbles: true }))
    setLink(null)
    linkAnchor.current = null
    setMode("format")
    readActive(root)
  }

  const removeLink = () => {
    const root = restore()
    const anchor = linkAnchor.current
    if (root && anchor && root.contains(anchor)) {
      const r = document.createRange()
      r.selectNodeContents(anchor)
      const sel = document.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(r)
      document.execCommand("unlink")
      sel?.collapseToEnd()
      root.dispatchEvent(new Event("input", { bubbles: true }))
    }
    closeLink(false)
  }

  /**
   * A block asked for while the caret is in a text: it goes in at the caret.
   * The words after the caret move to a text block of their own after it, so
   * a button asked for between two paragraphs lands between them.
   */
  const insertAt = (type: BlockType) => {
    const root = target()
    const id = root?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null
    let at: InsertPoint | null = null
    if (root && id) {
      const r = saved.current && root.contains(saved.current.commonAncestorContainer) ? saved.current : null
      if (r && root.lastChild) {
        const tail = document.createRange()
        tail.setStart(r.endContainer, r.endOffset)
        tail.setEndAfter(root.lastChild)
        const box = document.createElement("div")
        box.appendChild(tail.cloneContents())
        const head = document.createRange()
        head.setStartBefore(root.firstChild as Node)
        head.setEnd(r.endContainer, r.endOffset)
        const front = document.createElement("div")
        front.appendChild(head.cloneContents())
        const clean = (h: string) => (isBlankHtml(h) ? "" : cleanStoredHtml(h, { blocks: true }))
        at = { blockId: id, head: clean(front.innerHTML), tail: clean(box.innerHTML) }
      } else {
        at = { blockId: id, head: isBlankHtml(root.innerHTML) ? "" : cleanStoredHtml(root.innerHTML, { blocks: true }), tail: "" }
      }
    }
    setMode("format")
    onInsert(type, at)
  }

  const run: Record<string, () => void> = {
    h2: () => toggleBlock("h2"),
    h3: () => toggleBlock("h3"),
    bold: () => exec("bold"),
    italic: () => exec("italic"),
    underline: () => exec("underline"),
    strike: () => exec("strikeThrough"),
    ul: () => exec("insertUnorderedList"),
    ol: () => exec("insertOrderedList"),
    quote: () => toggleBlock("blockquote"),
    link: () => (mode === "link" ? closeLink(true) : openLink()),
    clear: () => {
      exec("removeFormat")
      if (/^h[1-4]$/.test(active.block) || active.quote) exec("formatBlock", "<p>")
    },
    undo: () => exec("undo"),
    redo: () => exec("redo"),
  }

  const AlignIcon = active.align === "center" ? AlignCenter : active.align === "right" ? AlignRight : AlignLeft
  const tools: Array<{ key: string; label: string; icon: LucideIcon; on?: boolean } | "sep"> = [
    { key: "h2", label: "Heading", icon: Heading2, on: active.block === "h2" || active.block === "h1" },
    { key: "h3", label: "Subheading", icon: Heading3, on: active.block === "h3" },
    "sep",
    { key: "bold", label: "Bold", icon: Bold, on: active.bold },
    { key: "italic", label: "Italic", icon: Italic, on: active.italic },
    { key: "underline", label: "Underline", icon: Underline, on: active.underline },
    { key: "strike", label: "Strikethrough", icon: Strikethrough, on: active.strike },
    "sep",
    { key: "ul", label: "Bulleted list", icon: List, on: active.list === "ul" },
    { key: "ol", label: "Numbered list", icon: ListOrdered, on: active.list === "ol" },
    { key: "quote", label: "Quote", icon: Quote, on: active.quote },
    "sep",
    { key: "link", label: "Link", icon: Link2, on: active.link },
  ]
  const tail: Array<{ key: string; label: string; icon: LucideIcon }> = [
    { key: "clear", label: "Clear formatting", icon: RemoveFormatting },
    { key: "undo", label: "Undo", icon: Undo2 },
    { key: "redo", label: "Redo", icon: Redo2 },
  ]
  const actions = blockId ? blockActions(blockId) : []

  /* The row scrolls sideways on a phone; the end that has more fades. */
  React.useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    let frame = 0
    const read = () => {
      frame = 0
      const max = strip.scrollWidth - strip.clientWidth
      const x = strip.scrollLeft
      const fade = max > 2 ? (x > 2 && x < max - 2 ? "both" : x > 2 ? "start" : "end") : "none"
      if (strip.dataset.fade !== fade) strip.dataset.fade = fade
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    read()
    strip.addEventListener("scroll", schedule, { passive: true })
    const ro = new ResizeObserver(schedule)
    ro.observe(strip)
    return () => {
      cancelAnimationFrame(frame)
      strip.removeEventListener("scroll", schedule)
      ro.disconnect()
    }
  }, [mode, phone])

  const back = (label = "Back to formatting") => (
    <button
      type="button"
      aria-label={label}
      className={cn(TOOL, "-ml-0.5")}
      onMouseDown={keep}
      onClick={() => {
        if (mode === "link") closeLink(true)
        else setMode("format")
      }}
    >
      <ChevronLeft aria-hidden className="h-5 w-5 md:h-4 md:w-4" />
    </button>
  )

  let row: React.ReactNode
  if (mode === "link" && link) {
    row = (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
        {back("Cancel the link")}
        <input
          autoFocus
          value={link.url}
          onChange={(e) => setLink({ ...link, url: e.target.value, error: "" })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              applyLink()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              closeLink(true)
            }
          }}
          placeholder="example.com/page"
          aria-label="Link address"
          aria-invalid={link.error ? true : undefined}
          title={link.error || undefined}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] aria-invalid:border-[#dc2626] md:h-8 md:rounded-lg md:text-[13px]"
        />
        {link.editing ? (
          <button type="button" className={cn(WORD, "text-[#b42318]")} onMouseDown={keep} onClick={removeLink}>
            Remove
          </button>
        ) : null}
        <button type="button" className={cn(WORD, "bg-[#1a1a2e] text-white active:bg-[#2a2a40] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#2a2a40]")} onMouseDown={keep} onClick={applyLink}>
          {link.editing ? "Save" : "Add"}
        </button>
      </div>
    )
  } else if (mode === "insert" || mode === "fields" || mode === "block") {
    const items: BlockAction[] =
      mode === "insert"
        ? inserts.map((i) => ({ label: i.label, run: () => insertAt(i.type) }))
        : mode === "fields"
          ? fields.map((f) => ({
              label: f.label,
              run: () => {
                setMode("format")
                exec("insertText", `{{${f.field}}}`)
              },
            }))
          : actions.map((a) => ({
              ...a,
              run: () => {
                setMode("format")
                a.run()
              },
            }))
    row = (
      <div className="flex min-w-0 flex-1 items-center px-1">
        {back()}
        <span className="mr-1 hidden shrink-0 text-[12px] font-medium text-[#6b7280] md:inline">{mode === "insert" ? "Add" : mode === "fields" ? "Fill in" : "This text"}</span>
        <div ref={stripRef} data-bar-strip="" data-fade="none" className={STRIP}>
          {items.map((i) => (
            <button key={i.label} type="button" className={cn(WORD, i.danger && "text-[#b42318]")} onMouseDown={keep} onClick={i.run}>
              {i.label}
            </button>
          ))}
        </div>
      </div>
    )
  } else {
    row = (
      <>
        <div className="flex shrink-0 items-center border-r border-[#eef0f2] px-1">
          <button type="button" aria-label="Add a block here" title="Add a block here" className={TOOL} onMouseDown={keep} onClick={() => setMode("insert")} data-bar-add="">
            <Plus aria-hidden className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </div>
        <div ref={stripRef} data-bar-strip="" data-fade="none" className={cn(STRIP, "px-1")}>
          {tools.map((t, i) =>
            t === "sep" ? (
              <React.Fragment key={`sep-${i}`}>{SEP}</React.Fragment>
            ) : (
              <button
                key={t.key}
                type="button"
                aria-label={t.label}
                title={t.label}
                aria-pressed={t.on}
                className={cn(TOOL, t.on && TOOL_ON)}
                onMouseDown={keep}
                onClick={run[t.key]}
              >
                <t.icon aria-hidden className="h-[18px] w-[18px] md:h-4 md:w-4" strokeWidth={t.key === "bold" ? 2.4 : 2} />
              </button>
            ),
          )}
          <button type="button" aria-label={`Alignment: ${active.align}`} title="Alignment" className={TOOL} onMouseDown={keep} onClick={cycleAlign} data-bar-align={active.align}>
            <AlignIcon aria-hidden className="h-[18px] w-[18px] md:h-4 md:w-4" />
          </button>
          {SEP}
          <button type="button" className={cn(WORD, "px-2.5 text-[#4b5563]")} title="The reader's name or email, filled in for each reader" onMouseDown={keep} onClick={() => setMode("fields")}>
            Name
          </button>
          {SEP}
          {tail.map((t) => (
            <button key={t.key} type="button" aria-label={t.label} title={t.label} className={TOOL} onMouseDown={keep} onClick={run[t.key]}>
              <t.icon aria-hidden className="h-[18px] w-[18px] md:h-4 md:w-4" />
            </button>
          ))}
          {actions.length ? (
            <>
              {SEP}
              <button type="button" aria-label="Move, copy or delete this text" title="This text" className={TOOL} onMouseDown={keep} onClick={() => setMode("block")}>
                <MoreHorizontal aria-hidden className="h-5 w-5 md:h-4 md:w-4" />
              </button>
            </>
          ) : null}
        </div>
        {phone ? (
          <div className="flex shrink-0 items-center border-l border-[#eef0f2] px-1">
            <button
              type="button"
              aria-label="Done"
              title="Done"
              className={TOOL}
              onMouseDown={keep}
              onClick={() => (document.activeElement as HTMLElement | null)?.blur?.()}
              data-bar-done=""
            >
              <ChevronDown aria-hidden className="h-5 w-5" />
            </button>
          </div>
        ) : null}
      </>
    )
  }

  const bar = (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Formatting"
      data-format-bar={phone ? "docked" : "top"}
      data-open={open ? "true" : "false"}
      inert={!open}
      className={cn(
        "flex items-center bg-white",
        phone
          ? cn(
              "fixed inset-x-0 bottom-0 z-[58] border-t border-[#e5e7eb] py-1 pb-[calc(4px+env(safe-area-inset-bottom))] shadow-[0_-6px_20px_-12px_rgba(17,24,39,0.18)] [html[data-keyboard=open]_&]:pb-1",
              "transition-[translate,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
              open ? "translate-y-[calc(-1*var(--kb-inset,0px))] opacity-100" : "pointer-events-none translate-y-full opacity-0",
            )
          : "sticky z-[6] rounded-t-2xl border-b border-[#eef0f2] py-1",
      )}
      style={phone ? undefined : { top: "var(--compose-bar, 0px)" }}
    >
      {row}
    </div>
  )

  if (phone) return typeof document === "undefined" ? null : createPortal(bar, document.body)
  return bar
}

/** The row that scrolls sideways inside itself: native momentum, no bar, a fade at whichever end has more. */
const STRIP = cn(
  "flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [touch-action:pan-x]",
  "[-webkit-mask-image:var(--strip-fade)] [mask-image:var(--strip-fade)]",
  "data-[fade=end]:[--strip-fade:linear-gradient(to_right,#000_calc(100%-24px),transparent)]",
  "data-[fade=start]:[--strip-fade:linear-gradient(to_right,transparent,#000_24px)]",
  "data-[fade=both]:[--strip-fade:linear-gradient(to_right,transparent,#000_24px,#000_calc(100%-24px),transparent)]",
)
