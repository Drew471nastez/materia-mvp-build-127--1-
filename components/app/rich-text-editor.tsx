"use client"

/**
 * ===========================================================================
 *  THE RICH TEXT FIELD
 * ===========================================================================
 * One editor for the product description, the creator page's inline
 * description and the body of an automated email. It writes paragraphs, two
 * heading levels, bold, italic, underline, strike, two kinds of list, a
 * quote, links and a divider, and nothing else, because that is what a
 * description is made of and every extra control is one more thing to
 * explain.
 *
 * WHY contentEditable AND execCommand. They are what every browser still
 * implements for exactly this, including the parts that are hard to get
 * right by hand: the caret, selection handles on iOS, the native undo stack,
 * typing inside a list, IME composition. The alternative is an editor
 * framework several times the size of this file for a dozen buttons.
 *
 * WHO OWNS THE DOM. While somebody types, the DOM does: React never writes
 * the editable element's content after the first render, because doing so
 * on every keystroke puts the caret back at the start. The value prop is
 * written in only when it says something the DOM has not just said itself
 * (a reset, a different product). The first render sends the same markup
 * from the server and the client (lib/rich-text/html.ts is the same code on
 * both), so the field arrives filled, without a hydration mismatch and
 * without growing after load.
 *
 * WHAT COMES OUT. Every change is read back through the allow list
 * (cleanStoredHtml) before it is handed up, so Chrome's styled spans and
 * stray divs never reach the row. A paste goes through cleanPastedHtml
 * first, so a paragraph copied out of Word, Docs or a web page brings its
 * structure and leaves its fonts, colours and scripts behind. The server
 * applies the same list again when the row is saved.
 *
 * ON A PHONE. The toolbar is one row that scrolls sideways, every control a
 * 44px target, and the text is 16px so iOS does not zoom the page when the
 * field is focused. The field grows with its text up to a height that
 * leaves the toolbar and the caret both above the keyboard, then scrolls
 * inside itself.
 */

import * as React from "react"
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { cleanPastedHtml, cleanStoredHtml, escapeAttr, escapeText, isBlankHtml, plainTextToHtml, toEditorHtml } from "@/lib/rich-text/html"
import { normaliseTypedHref } from "@/lib/rich-text/policy"

export type RichTextTool =
  | "h2" | "h3"
  | "bold" | "italic" | "underline" | "strike"
  | "bulletList" | "numberedList" | "quote"
  | "link" | "rule"
  | "clear"
  | "undo" | "redo"

/** In toolbar order, grouped; a divider goes between groups. */
const GROUPS: RichTextTool[][] = [
  ["h2", "h3"],
  ["bold", "italic", "underline", "strike"],
  ["bulletList", "numberedList", "quote"],
  ["link", "rule"],
  ["clear"],
  ["undo", "redo"],
]

export const ALL_TOOLS: RichTextTool[] = GROUPS.flat()

const TOOL: Record<RichTextTool, { label: string; icon: LucideIcon }> = {
  h2: { label: "Heading", icon: Heading2 },
  h3: { label: "Subheading", icon: Heading3 },
  bold: { label: "Bold", icon: Bold },
  italic: { label: "Italic", icon: Italic },
  underline: { label: "Underline", icon: Underline },
  strike: { label: "Strikethrough", icon: Strikethrough },
  bulletList: { label: "Bulleted list", icon: List },
  numberedList: { label: "Numbered list", icon: ListOrdered },
  quote: { label: "Quote", icon: Quote },
  link: { label: "Link", icon: Link2 },
  rule: { label: "Divider", icon: Minus },
  clear: { label: "Clear formatting", icon: RemoveFormatting },
  undo: { label: "Undo", icon: Undo2 },
  redo: { label: "Redo", icon: Redo2 },
}

/** What the selection is in, for the toolbar's pressed states. */
interface Active {
  block: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  list: "" | "ul" | "ol"
  quote: boolean
  link: boolean
}
const NONE: Active = { block: "p", bold: false, italic: false, underline: false, strike: false, list: "", quote: false, link: false }

interface LinkDraft {
  url: string
  text: string
  /** Nothing selected and not on a link: the words to link are asked for too. */
  needsText: boolean
  /** On an existing link: Save changes it, Remove unlinks it. */
  editing: boolean
  error: string
}

/** Handed to `extraTools`, for a control a particular field adds (the Emails button). */
export interface RichTextApi {
  /** Remember where the caret is, before focus moves to a control outside the text. */
  keepSelection: () => void
  /** The text currently selected in the field. */
  selectedText: () => string
  /** Insert markup where the caret was, and save. */
  insertHtml: (html: string) => void
  /** The same, as a block of its own: a line with words on it is split first. */
  insertBlock: (html: string) => void
}

export interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  /** Read by screen readers as the field's name. */
  label: string
  placeholder?: string
  tools?: RichTextTool[]
  /** Extra toolbar controls, after the built-in ones. */
  extraTools?: (api: RichTextApi) => React.ReactNode
  /** The same handle, for a control outside the toolbar (a form in `panel`). */
  apiRef?: React.RefObject<RichTextApi | null>
  /** Something shown between the toolbar and the text, such as a form an extra tool opened. */
  panel?: React.ReactNode
  /** Addresses offered under the link field; trusted as they are. */
  linkShortcuts?: Array<{ label: string; href: string }>
  /**
   * How the field's HTML is cleaned before it is handed up. The default is
   * the description allow list; a field whose server applies its own (the
   * Emails body keeps inline button styles) passes its own.
   */
  cleanOutput?: (html: string) => string
  /** Height of the text area before it starts to grow, in px. */
  minHeight?: number
  className?: string
  id?: string
}

const cleanDescriptionHtml = (html: string) => cleanStoredHtml(html, { blocks: true })

/** The nearest ancestor of `node` matching `selector`, not looking past `root`. */
function closestIn(node: Node | null, selector: string, root: HTMLElement): HTMLElement | null {
  let el: Element | null = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null
  while (el && el !== root) {
    if (el.matches(selector)) return el as HTMLElement
    el = el.parentElement
  }
  return null
}

/** Embeds an older editor saved (a YouTube player, an image block) are whole things, not text to type into. */
function lockEmbeds(root: HTMLElement) {
  for (const el of root.querySelectorAll("[data-embed-type]")) el.setAttribute("contenteditable", "false")
}

function queryState(command: string): boolean {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

export function RichTextEditor({
  value,
  onChange,
  label,
  placeholder,
  tools = ALL_TOOLS,
  extraTools,
  apiRef,
  panel,
  linkShortcuts,
  cleanOutput = cleanDescriptionHtml,
  minHeight = 168,
  className,
  id,
}: RichTextEditorProps) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const toolbarRef = React.useRef<HTMLDivElement>(null)
  const savedRange = React.useRef<Range | null>(null)
  const linkTarget = React.useRef<HTMLAnchorElement | null>(null)
  /** The value the DOM is showing: the last one written in, or the last one handed up. */
  const shown = React.useRef(value)
  /*
    ONE OBJECT FOR THE LIFE OF THE FIELD. React 19 compares this prop by
    identity, not by the string inside it: a fresh `{ __html }` on each
    render is a change, and a change rewrites innerHTML, which put the field
    back to its first value after every keystroke. Held in state, it is the
    same object every render and React never touches the text again.
  */
  const [initialMarkup] = React.useState(() => ({ __html: toEditorHtml(value) }))
  const [empty, setEmpty] = React.useState(() => isBlankHtml(initialMarkup.__html))
  const [active, setActive] = React.useState<Active>(NONE)
  const [link, setLink] = React.useState<LinkDraft | null>(null)
  const linkId = React.useId()

  const onChangeRef = React.useRef(onChange)
  const cleanRef = React.useRef(cleanOutput)
  React.useEffect(() => {
    onChangeRef.current = onChange
    cleanRef.current = cleanOutput
  })

  React.useLayoutEffect(() => {
    if (rootRef.current) lockEmbeds(rootRef.current)
    try {
      /* Enter makes a <p>, not Chrome's default <div>. */
      document.execCommand("defaultParagraphSeparator", false, "p")
    } catch {
      /* a browser without it: the output cleaner turns a bare div into a p */
    }
  }, [])

  /* A value from somewhere else: a reset, a different product. */
  React.useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || value === shown.current) return
    shown.current = value
    root.innerHTML = toEditorHtml(value)
    lockEmbeds(root)
    setEmpty(isBlankHtml(root.innerHTML))
  }, [value])

  /** Reads the field, cleans it, and hands it up if it changed. */
  const commit = React.useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const raw = root.innerHTML
    const blank = isBlankHtml(raw)
    setEmpty(blank)
    const out = blank ? "" : cleanRef.current(raw)
    if (out !== shown.current) {
      shown.current = out
      onChangeRef.current(out)
    }
  }, [])

  const readActive = React.useCallback(() => {
    const root = rootRef.current
    const sel = document.getSelection()
    if (!root || !sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return
    const at = sel.anchorNode
    const heading = closestIn(at, "h1,h2,h3,h4", root)
    const block = closestIn(at, "p,h1,h2,h3,h4,li,blockquote,pre,div", root)
    const list = closestIn(at, "ul,ol", root)
    const next: Active = {
      block: heading ? heading.tagName.toLowerCase() : block ? block.tagName.toLowerCase() : "p",
      /* A heading is bold by its own style, which the browser reports as
         bold; only a <strong> inside one counts. */
      bold: heading ? !!closestIn(at, "b,strong", root) : queryState("bold"),
      italic: queryState("italic"),
      underline: queryState("underline"),
      strike: queryState("strikeThrough"),
      list: list ? (list.tagName.toLowerCase() as "ul" | "ol") : "",
      quote: !!closestIn(at, "blockquote", root),
      link: !!closestIn(at, "a", root),
    }
    setActive((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [])

  /* Where the caret is, kept for when focus has to leave the field (the link
     form), and the pressed states that follow it. */
  React.useEffect(() => {
    let frame = 0
    const onSelection = () => {
      const root = rootRef.current
      const sel = document.getSelection()
      if (!root || !sel || !sel.rangeCount) return
      const range = sel.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer)) return
      savedRange.current = range.cloneRange()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(readActive)
    }
    document.addEventListener("selectionchange", onSelection)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("selectionchange", onSelection)
    }
  }, [readActive])

  /** Focus back in the field with the caret where it was, or at the end. */
  const focusField = React.useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const sel = document.getSelection()
    const inField = sel && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).commonAncestorContainer)
    if (document.activeElement === root && inField) return
    root.focus({ preventScroll: true })
    if (!sel) return
    const saved = savedRange.current
    sel.removeAllRanges()
    if (saved && root.contains(saved.commonAncestorContainer)) {
      sel.addRange(saved)
    } else {
      const end = document.createRange()
      end.selectNodeContents(root.lastElementChild ?? root)
      end.collapse(false)
      sel.addRange(end)
    }
  }, [])

  const exec = React.useCallback(
    (command: string, arg?: string) => {
      focusField()
      try {
        document.execCommand(command, false, arg)
      } catch {
        /* a browser that refuses one command still types */
      }
    },
    [focusField],
  )

  const insertHtml = React.useCallback(
    (html: string) => {
      exec("insertHTML", html)
      commit()
      readActive()
    },
    [exec, commit, readActive],
  )

  /**
   * An editor emptied by select-all and delete can be left with no block at
   * all, and text typed straight into it gets no paragraph. Put one back.
   */
  const ensureBlock = () => {
    const root = rootRef.current
    if (!root || root.firstElementChild || root.textContent) return
    root.innerHTML = "<p><br></p>"
    const sel = document.getSelection()
    if (sel && document.activeElement === root) {
      const r = document.createRange()
      r.setStart(root.firstChild as Node, 0)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }

  const toggleBlock = (tag: "h2" | "h3" | "blockquote") => {
    const on = tag === "blockquote" ? active.quote : active.block === tag
    exec("formatBlock", on ? "<p>" : `<${tag}>`)
  }

  const openLink = () => {
    const root = rootRef.current
    if (!root) return
    const sel = document.getSelection()
    let anchor: HTMLAnchorElement | null = null
    let selected = ""
    if (sel && sel.rangeCount && root.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
      anchor = closestIn(sel.anchorNode, "a", root) as HTMLAnchorElement | null
      selected = sel.isCollapsed ? "" : sel.toString()
    } else if (savedRange.current && root.contains(savedRange.current.commonAncestorContainer)) {
      anchor = closestIn(savedRange.current.startContainer, "a", root) as HTMLAnchorElement | null
      selected = savedRange.current.collapsed ? "" : savedRange.current.toString()
    }
    linkTarget.current = anchor
    setLink({ url: anchor?.getAttribute("href") ?? "", text: "", needsText: !anchor && !selected.trim(), editing: !!anchor, error: "" })
  }

  const selectAnchor = (anchor: HTMLAnchorElement) => {
    const sel = document.getSelection()
    if (!sel) return
    const r = document.createRange()
    r.selectNodeContents(anchor)
    sel.removeAllRanges()
    sel.addRange(r)
  }

  const closeLink = (refocus: boolean) => {
    setLink(null)
    linkTarget.current = null
    if (refocus) focusField()
  }

  const applyLink = (draft: LinkDraft, shortcut?: string) => {
    const href = shortcut ?? normaliseTypedHref(draft.url)
    if (!href) {
      setLink({ ...draft, error: "Enter a web address, an email address or a phone number." })
      return
    }
    const root = rootRef.current
    if (!root) return
    focusField()
    const sel = document.getSelection()
    const anchor = linkTarget.current
    if (anchor && root.contains(anchor)) {
      selectAnchor(anchor)
      document.execCommand("createLink", false, href)
      sel?.collapseToEnd()
    } else if (sel && !sel.isCollapsed) {
      document.execCommand("createLink", false, href)
      sel.collapseToEnd()
    } else {
      const words = draft.text.trim() || href.replace(/^(https?:\/\/|mailto:|tel:)/i, "").replace(/\/$/, "")
      document.execCommand("insertHTML", false, `<a href="${escapeAttr(href)}">${escapeText(words)}</a>`)
    }
    setLink(null)
    linkTarget.current = null
    commit()
    readActive()
  }

  const removeLink = () => {
    const root = rootRef.current
    const anchor = linkTarget.current
    focusField()
    if (root && anchor && root.contains(anchor)) {
      selectAnchor(anchor)
      document.execCommand("unlink")
      document.getSelection()?.collapseToEnd()
    }
    setLink(null)
    linkTarget.current = null
    commit()
    readActive()
  }

  const run = (tool: RichTextTool) => {
    switch (tool) {
      case "h2":
      case "h3":
        toggleBlock(tool)
        break
      case "quote":
        toggleBlock("blockquote")
        break
      case "bold":
        exec("bold")
        break
      case "italic":
        exec("italic")
        break
      case "underline":
        exec("underline")
        break
      case "strike":
        exec("strikeThrough")
        break
      case "bulletList":
        exec("insertUnorderedList")
        break
      case "numberedList":
        exec("insertOrderedList")
        break
      case "rule":
        exec("insertHorizontalRule")
        break
      case "clear":
        exec("removeFormat")
        if (/^h[1-4]$/.test(active.block) || active.quote) exec("formatBlock", "<p>")
        break
      case "undo":
        exec("undo")
        break
      case "redo":
        exec("redo")
        break
      case "link":
        if (link) closeLink(true)
        else openLink()
        return
    }
    ensureBlock()
    commit()
    readActive()
  }

  const pressed = (tool: RichTextTool): boolean => {
    switch (tool) {
      case "h2":
        return active.block === "h2" || active.block === "h1"
      case "h3":
        return active.block === "h3" || active.block === "h4"
      case "bold":
        return active.bold
      case "italic":
        return active.italic
      case "underline":
        return active.underline
      case "strike":
        return active.strike
      case "bulletList":
        return active.list === "ul"
      case "numberedList":
        return active.list === "ol"
      case "quote":
        return active.quote
      case "link":
        return active.link || !!link
      default:
        return false
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k" && tools.includes("link")) {
      e.preventDefault()
      openLink()
    }
  }

  /** A paste arrives as whatever it was. Cleaned first, then inserted as one undoable step. */
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const data = e.clipboardData
    if (!data) return
    const html = data.getData("text/html")
    const text = data.getData("text/plain")
    e.preventDefault()
    if (!html && !text) return // an image or a file: not something a description holds
    if (!html) {
      if (!/\n/.test(text)) exec("insertText", text)
      else exec("insertHTML", plainTextToHtml(text))
    } else {
      const clean = cleanPastedHtml(html)
      if (!clean) {
        if (text) exec("insertText", text)
      } else {
        /* One paragraph goes in as its words, so it joins the line the caret
           is on instead of splitting it. */
        const single = /^<p>((?:(?!<\/?(p|h2|h3|ul|ol|blockquote|hr)\b).)*)<\/p>$/s.exec(clean)
        exec("insertHTML", single ? single[1] : clean)
      }
    }
    commit()
    readActive()
  }

  /** A drag of text from elsewhere is a paste at the drop point. */
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const data = e.dataTransfer
    const html = data.getData("text/html")
    const text = data.getData("text/plain")
    e.preventDefault()
    if (!html && !text) return
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
    let range: Range | null = null
    if (doc.caretRangeFromPoint) range = doc.caretRangeFromPoint(e.clientX, e.clientY)
    else if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(e.clientX, e.clientY)
      if (pos) {
        range = document.createRange()
        range.setStart(pos.offsetNode, pos.offset)
      }
    }
    const root = rootRef.current
    if (range && root?.contains(range.startContainer)) savedRange.current = range
    const clean = html ? cleanPastedHtml(html) : plainTextToHtml(text)
    if (clean) insertHtml(clean)
  }

  /* Arrow keys move along the toolbar and Tab leaves it, the pattern a
     screen reader expects of role="toolbar". */
  const onToolbarKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...(toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    let next = -1
    if (e.key === "ArrowRight") next = (at + 1) % buttons.length
    else if (e.key === "ArrowLeft") next = (at - 1 + buttons.length) % buttons.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = buttons.length - 1
    if (next < 0) return
    e.preventDefault()
    buttons.forEach((b, i) => (b.tabIndex = i === next ? 0 : -1))
    buttons[next].focus()
  }

  const api: RichTextApi = {
    keepSelection: () => {
      const root = rootRef.current
      const sel = document.getSelection()
      if (root && sel && sel.rangeCount && root.contains(sel.getRangeAt(0).commonAncestorContainer)) savedRange.current = sel.getRangeAt(0).cloneRange()
    },
    selectedText: () => {
      const r = savedRange.current
      return r && !r.collapsed ? r.toString() : ""
    },
    insertHtml,
    insertBlock: (html: string) => {
      focusField()
      const root = rootRef.current
      const sel = document.getSelection()
      const block = root && sel?.anchorNode ? closestIn(sel.anchorNode, "p,h1,h2,h3,h4,li,blockquote,div", root) : null
      if (block?.textContent?.trim()) exec("insertParagraph")
      insertHtml(html)
    },
  }

  React.useEffect(() => {
    if (apiRef) apiRef.current = api
  })

  const visible = GROUPS.map((group) => group.filter((t) => tools.includes(t))).filter((group) => group.length)
  /* One stop for Tab: the first control. Arrow keys do the rest. */
  const firstTool = visible[0]?.[0]

  return (
    <div
      className={cn(
        "rich-text-field overflow-hidden rounded-xl border border-[#e5e7eb] bg-white transition-[border-color,box-shadow] duration-150",
        /* The ring the other inputs draw, while the text has the focus. The
           link form's own fields draw theirs, so the two never stack. */
        "has-[.rich-text-content:focus]:border-ring has-[.rich-text-content:focus]:ring-[3px] has-[.rich-text-content:focus]:ring-ring/50",
        className,
      )}
    >
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={`${label} formatting`}
        aria-controls={id}
        onKeyDown={onToolbarKey}
        className="rich-text-toolbar flex items-center gap-0.5 overflow-x-auto overscroll-x-contain border-b border-[#eef0f2] px-1 py-1 sm:flex-wrap sm:px-1.5"
      >
        {visible.map((group, g) => (
          <React.Fragment key={group.join("-")}>
            {g > 0 ? <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[#e5e7eb]" /> : null}
            {group.map((tool) => {
              const { label: name, icon: Icon } = TOOL[tool]
              const on = pressed(tool)
              const toggle = tool !== "rule" && tool !== "clear" && tool !== "undo" && tool !== "redo"
              return (
                <button
                  key={tool}
                  type="button"
                  tabIndex={tool === firstTool ? 0 : -1}
                  aria-label={name}
                  aria-pressed={toggle ? on : undefined}
                  aria-expanded={tool === "link" ? !!link : undefined}
                  title={name}
                  /* mousedown, not click: a click moves focus out of the
                     text first, and a field that has lost its selection has
                     nothing to make bold. */
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(tool)}
                  className={cn(
                    "inline-flex h-11 w-11 shrink-0 cursor-pointer select-none items-center justify-center rounded-lg transition-colors duration-100 [-webkit-tap-highlight-color:transparent] sm:h-8 sm:w-8",
                    on ? "bg-[#e6e8eb] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#eef0f2] hover:text-[#1a1a2e] active:bg-[#e6e8eb]",
                  )}
                >
                  <Icon aria-hidden className="h-[18px] w-[18px] sm:h-4 sm:w-4" strokeWidth={tool === "bold" ? 2.4 : 2} />
                </button>
              )
            })}
          </React.Fragment>
        ))}
        {extraTools ? (
          <>
            <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[#e5e7eb]" />
            {extraTools(api)}
          </>
        ) : null}
      </div>

      {link ? (
        <div id={linkId} role="group" aria-label="Link" className="border-b border-[#eef0f2] px-3 py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              autoFocus
              value={link.url}
              onChange={(e) => setLink({ ...link, url: e.target.value, error: "" })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  applyLink(link)
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  closeLink(true)
                }
              }}
              placeholder="example.com/page"
              aria-label="Link address"
              aria-invalid={link.error ? true : undefined}
              aria-describedby={link.error ? `${linkId}-error` : undefined}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-11 w-full min-w-0 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-ring focus:ring-[3px] focus:ring-ring/50 aria-invalid:border-[#dc2626] sm:h-9 sm:w-auto sm:flex-1 sm:text-[14px]"
            />
            {link.needsText ? (
              <input
                value={link.text}
                onChange={(e) => setLink({ ...link, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    applyLink(link)
                  }
                  if (e.key === "Escape") {
                    e.preventDefault()
                    closeLink(true)
                  }
                }}
                placeholder="Text to show"
                aria-label="Text to show"
                className="h-11 min-w-0 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-ring focus:ring-[3px] focus:ring-ring/50 sm:h-9 sm:w-40 sm:text-[14px]"
              />
            ) : null}
            <div className="flex items-center gap-1.5">
              {link.editing ? (
                <button
                  type="button"
                  onClick={removeLink}
                  className="h-11 rounded-lg px-3 text-[14px] font-medium text-[#b42318] hover:bg-[#fef3f2] sm:h-9 sm:text-[13px]"
                >
                  Remove
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => closeLink(true)}
                className="ml-auto h-11 rounded-lg px-3 text-[14px] font-medium text-[#4b5563] hover:bg-[#eef0f2] sm:ml-0 sm:h-9 sm:text-[13px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => applyLink(link)}
                className="h-11 rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-medium text-white hover:bg-[#2a2a40] sm:h-9 sm:text-[13px]"
              >
                {link.editing ? "Save" : "Add link"}
              </button>
            </div>
          </div>
          {linkShortcuts?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-x-3">
              {linkShortcuts.map((s) => (
                <button
                  key={s.href}
                  type="button"
                  onClick={() => applyLink(link, s.href)}
                  className="min-h-11 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e] sm:min-h-0 sm:py-1"
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
          {link.error ? (
            <p id={`${linkId}-error`} role="alert" className="mt-1.5 text-[13px] text-[#b42318]">
              {link.error}
            </p>
          ) : null}
        </div>
      ) : null}

      {panel}

      <div className="relative">
        {empty && placeholder ? (
          <p
            aria-hidden
            className="pointer-events-none absolute left-3.5 right-3.5 top-3 select-none truncate text-[16px] leading-[1.6] text-[#9ca3af] sm:text-[15px]"
          >
            {placeholder}
          </p>
        ) : null}
        <div
          ref={rootRef}
          id={id}
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          aria-placeholder={placeholder}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          dangerouslySetInnerHTML={initialMarkup}
          onInput={(e) => {
            if (!(e.nativeEvent as InputEvent).isComposing) ensureBlock()
            commit()
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDrop={onDrop}
          className={cn(
            "rich-text-content storelib-prose overflow-y-auto overscroll-contain px-3.5 py-3 text-[16px] leading-[1.6] text-[#1a1a2e] outline-none sm:text-[15px]",
            /* Tall enough to write in; short enough that on a phone the
               toolbar and the caret both stay above the keyboard. */
            "max-h-[320px] sm:max-h-[480px]",
            "[overflow-wrap:anywhere] [-webkit-user-select:text] [user-select:text]",
          )}
          style={{ minHeight }}
        />
      </div>
    </div>
  )
}
