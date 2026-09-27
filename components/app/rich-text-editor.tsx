"use client"

/**
 * ===========================================================================
 *  THE RICH TEXT FIELD
 * ===========================================================================
 * One editor for the product description, the creator page's inline
 * description and the body of an automated email. It writes paragraphs, two
 * heading levels, bold, italic, underline, strike, two kinds of list, a
 * quote, links, a divider, emoji and, where the field can upload them (the
 * product description, not an email), pictures; nothing else, because that
 * is what a description is made of and every extra control is one more
 * thing to explain. A picture is uploaded to storage and the text holds its
 * address, never its bytes. A picked picture can be sized with its corner
 * handles, placed left, centre or right, cut to a shape and moved up or
 * down (./rich-text/picture-controls.tsx); emoji come from a picker
 * (./rich-text/emoji-picker.tsx). Every control says what it is in a
 * tooltip on a computer.
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
 * 44px target, with a fade and an arrow at whichever end has more (a press
 * on the arrow slides the row along, ./rich-text/scroll-row.tsx); a control
 * acts on a tap, never on the swipe that scrolls the row. The
 * text is 16px so iOS does not zoom the page when the field is focused. The
 * field grows with its text up to a height that leaves the toolbar and the
 * caret both above the keyboard, then scrolls inside itself, handing a
 * swipe on to the page at its top and bottom. The bar along its foot drags
 * it taller or shorter, up to 70% of the screen.
 */

import * as React from "react"
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Smile,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { cleanPastedHtml, cleanStoredHtml, escapeAttr, escapeText, isBlankHtml, plainTextToHtml, toEditorHtml } from "@/lib/rich-text/html"
import { normaliseTypedHref } from "@/lib/rich-text/policy"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { PictureControls, Tip } from "./rich-text/picture-controls"
import { EmojiControl } from "./rich-text/emoji-picker"
import { ScrollRow } from "./rich-text/scroll-row"

export type RichTextTool =
  | "h2" | "h3"
  | "bold" | "italic" | "underline" | "strike"
  | "bulletList" | "numberedList" | "quote"
  | "link" | "image" | "emoji" | "rule"
  | "clear"
  | "undo" | "redo"

/** In toolbar order, grouped; a divider goes between groups. */
const GROUPS: RichTextTool[][] = [
  ["h2", "h3"],
  ["bold", "italic", "underline", "strike"],
  ["bulletList", "numberedList", "quote"],
  ["link", "image", "emoji", "rule"],
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
  image: { label: "Picture", icon: ImagePlus },
  emoji: { label: "Emoji", icon: Smile },
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
  /**
   * Puts a picture somewhere and says where. With it, the toolbar has a
   * Picture control; without it (the Emails body) there is none. The field
   * never holds a picture's bytes, only the address this returns.
   */
  uploadImage?: (file: File) => Promise<{ url: string; width?: number; height?: number }>
  /** Says why the HTML cannot be saved as it is (too long); shown under the text. */
  checkSize?: (html: string) => string | null
  /**
   * A bar along the foot of the field that drags its height up and down, by
   * mouse or finger, anywhere along its width; the arrow keys move it in
   * steps and a double press puts it back.
   */
  resizable?: boolean
  /** Height of the text area before it starts to grow, in px. */
  minHeight?: number
  /**
   * The text grows with what is written and never scrolls inside itself:
   * for a field that is one part of a longer page (a block of an email),
   * where the page is what scrolls. Pair it with `stickyToolbar`.
   */
  grow?: boolean
  /**
   * The toolbar holds still at this distance from the top of whatever
   * scrolls the page (a CSS length), so it stays in reach while a long text
   * scrolls under it, on a phone too.
   */
  stickyToolbar?: string
  /** Controls at the toolbar's far end that never scroll out of view (the block's own menu). */
  toolbarEnd?: React.ReactNode
  className?: string
  id?: string
}

const cleanDescriptionHtml = (html: string) => cleanStoredHtml(html, { blocks: true })

/** A toolbar control: a 44px target on a phone, 32px on a computer. */
const TOOL_BUTTON =
  "inline-flex h-11 w-11 shrink-0 cursor-pointer select-none items-center justify-center rounded-lg transition-colors duration-100 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] sm:h-8 sm:w-8"

/**
 * A control that is not pressed. Hover and :active only with a mouse: on a
 * touch screen hover sticks after the tap and :active lights up every
 * control a swipe passes over. A finger gets `data-pressing` instead, once
 * it has held still (see A TAP, NOT A SWIPE).
 */
const TOOL_IDLE =
  "text-[#4b5563] data-[pressing]:bg-[#eef0f2] data-[pressing]:text-[#1a1a2e] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#eef0f2] [@media(hover:hover)_and_(pointer:fine)]:hover:text-[#1a1a2e] [@media(hover:hover)_and_(pointer:fine)]:active:bg-[#e6e8eb]"

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
  uploadImage,
  checkSize,
  minHeight = 168,
  grow = false,
  resizable = false,
  stickyToolbar,
  toolbarEnd,
  className,
  id,
}: RichTextEditorProps) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  /* The height the person dragged the field to, or null for its own. */
  const [dragHeight, setDragHeight] = React.useState<number | null>(null)
  const RESIZE_MAX = 1200
  /* The tallest a drag can make it: 70% of the screen on a phone, so the
     toolbar and some of the page stay in view, 90% on a computer. */
  const resizeMax = React.useCallback(() => {
    const vh = window.visualViewport?.height ?? window.innerHeight
    const share = window.matchMedia("(max-width: 639px)").matches ? 0.7 : 0.9
    return Math.max(minHeight, Math.min(RESIZE_MAX, Math.round(vh * share)))
  }, [minHeight])
  const clampHeight = React.useCallback((h: number, max = resizeMax()) => Math.round(Math.min(max, Math.max(minHeight, h))), [minHeight, resizeMax])
  /*
    THE DRAG MOVES THE BOX, NOT REACT. While a finger or the mouse is down
    the height is written straight onto the text box once per frame, and
    React hears the last one when it lets go: no render per pixel, so it
    follows the pointer one to one. The box is pinned at the height it
    already has before the first move, so nothing jumps when the drag
    starts, and a box that is already taller than the limit is never pulled
    in by it. The handle holds the pointer, and it is `touch-action: none`,
    so a finger on it never scrolls the page.
  */
  const startResize = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const box = rootRef.current
    if (!box || (e.pointerType === "mouse" && e.button !== 0)) return
    e.preventDefault()
    const handle = e.currentTarget
    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      /* a pointer that is already gone: the drag ends on its own */
    }
    const startY = e.clientY
    const startH = box.getBoundingClientRect().height
    const max = Math.max(resizeMax(), Math.round(startH))
    let last = Math.round(startH)
    let frame = 0
    box.style.height = `${startH}px`
    box.style.maxHeight = "none"
    handle.setAttribute("data-dragging", "")
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      last = clampHeight(startH + ev.clientY - startY, max)
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        box.style.height = `${last}px`
      })
    }
    const end = () => {
      if (frame) cancelAnimationFrame(frame)
      box.style.height = `${last}px`
      handle.removeAttribute("data-dragging")
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
      handle.removeEventListener("lostpointercapture", end)
      setDragHeight(last)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
    handle.addEventListener("lostpointercapture", end)
  }, [clampHeight, resizeMax])
  const keyResize = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    e.preventDefault()
    const now = rootRef.current?.getBoundingClientRect().height ?? minHeight
    setDragHeight(clampHeight(now + (e.key === "ArrowDown" ? 32 : -32)))
  }, [clampHeight, minHeight])
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
  const fileRef = React.useRef<HTMLInputElement>(null)
  /** The picture whose alt text and Remove are showing. */
  const [picture, setPicture] = React.useState<{ el: HTMLImageElement; alt: string; altOpen?: boolean } | null>(null)
  /** The box the picture's frame, handles and bar are drawn in: the text's own. */
  const frameRef = React.useRef<HTMLDivElement>(null)
  /*
    The picture whose bar is drawn. It outlives `picture` by the bar's exit,
    so letting a picture go fades the bar out rather than cutting it; a
    different picture picked meanwhile takes over at once.
  */
  const [barPicture, setBarPicture] = React.useState<HTMLImageElement | null>(null)
  if (picture && picture.el !== barPicture) setBarPicture(picture.el)
  const [uploads, setUploads] = React.useState(0)
  const [notice, setNotice] = React.useState("")
  const [sizeProblem, setSizeProblem] = React.useState<string | null>(null)
  const checkSizeRef = React.useRef(checkSize)

  const onChangeRef = React.useRef(onChange)
  const cleanRef = React.useRef(cleanOutput)
  React.useEffect(() => {
    onChangeRef.current = onChange
    cleanRef.current = cleanOutput
    checkSizeRef.current = checkSize
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
      setSizeProblem(checkSizeRef.current ? checkSizeRef.current(out) : null)
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
      case "image":
        /* Straight from the tap, so the picker opens: iOS, and WKWebView in
           the app, only open a file picker from inside the gesture. It offers
           the photo library, the camera and files. */
        if (fileRef.current) {
          fileRef.current.value = ""
          fileRef.current.click()
        }
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
    /* A picked picture: Delete or Backspace removes it; any other key lets it go. */
    if (picture && !picture.altOpen) {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault()
        removePicture()
        return
      }
      if (e.key.length === 1 || e.key === "Enter") setPicture(null)
    }
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
    const buttons = [...(toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled]):not([data-scroll-arrow])") ?? [])]
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

  /**
   * A picture goes in at the caret straight away, as the file itself (a
   * blob: address, dimmed), while it uploads. A blob: address is not on the
   * allow list, so if the field is saved meanwhile the picture is simply not
   * in it yet; it can never be saved as the bytes. When the upload is done
   * the same element gets its real address and its size.
   */
  const addPicture = async (file: File) => {
    if (!uploadImage) return
    setNotice("")
    if (!file.type.startsWith("image/") || /svg/i.test(file.type)) {
      setNotice("Choose a photo: a JPEG, PNG, WebP or GIF.")
      return
    }
    const id = Math.random().toString(36).slice(2)
    const preview = URL.createObjectURL(file)
    focusField()
    const root = rootRef.current
    const sel = document.getSelection()
    const block = root && sel?.anchorNode ? closestIn(sel.anchorNode, "p,h1,h2,h3,h4,li,blockquote,div", root) : null
    if (block?.textContent?.trim()) exec("insertParagraph")
    exec("insertHTML", `<img src="${escapeAttr(preview)}" alt="" data-uploading="${id}">`)
    setUploads((n) => n + 1)
    try {
      const done = await uploadImage(file)
      const el = rootRef.current?.querySelector<HTMLImageElement>(`img[data-uploading="${id}"]`)
      if (el) {
        el.src = done.url
        if (done.width && done.height) {
          el.setAttribute("width", String(done.width))
          el.setAttribute("height", String(done.height))
        }
        el.removeAttribute("data-uploading")
        commit()
        setPicture({ el, alt: "", altOpen: false })
      }
    } catch (err) {
      rootRef.current?.querySelector(`img[data-uploading="${id}"]`)?.remove()
      commit()
      setNotice(err instanceof Error && err.message ? err.message : "The picture did not upload. Try again.")
    } finally {
      URL.revokeObjectURL(preview)
      setUploads((n) => n - 1)
    }
  }

  /** The whole of an old editor's picture block, or the picture itself. */
  const pictureNode = (el: HTMLImageElement) => {
    const root = rootRef.current
    return (root && closestIn(el, "[data-embed-type]", root)) || el
  }

  const removePicture = () => {
    const root = rootRef.current
    const el = picture?.el
    setPicture(null)
    if (!root || !el || !root.contains(el)) return
    const node = pictureNode(el)
    focusField()
    const sel = document.getSelection()
    if (sel) {
      const r = document.createRange()
      r.selectNode(node)
      sel.removeAllRanges()
      sel.addRange(r)
      try {
        document.execCommand("delete")
      } catch {
        /* removed below */
      }
    }
    if (root.contains(node)) node.remove()
    /* The paragraph it had to itself goes too, rather than staying as an empty line. */
    let block: HTMLElement | null = sel?.anchorNode ? closestIn(sel.anchorNode, "p", root) : null
    if (block && !(block.textContent ?? "").trim() && !block.querySelector("img,iframe,[data-embed-type]") && root.childElementCount > 1) {
      const next = (block.nextElementSibling ?? block.previousElementSibling) as HTMLElement | null
      block.remove()
      block = null
      if (next && sel) {
        const r = document.createRange()
        r.selectNodeContents(next)
        r.collapse(true)
        sel.removeAllRanges()
        sel.addRange(r)
      }
    }
    ensureBlock()
    commit()
  }

  /**
   * One block earlier or later in the text. A picture sharing a paragraph
   * with words is first given a paragraph of its own, on the side it is
   * moving to, which is already one step.
   */
  const movePicture = (dir: -1 | 1) => {
    const root = rootRef.current
    const img = picture?.el
    if (!root || !img || !root.contains(img)) return
    const node = pictureNode(img)
    let block: HTMLElement = node
    while (block.parentElement && block.parentElement !== root) block = block.parentElement
    const alone = block === node || (!(block.textContent ?? "").trim() && block.querySelectorAll("img").length === 1)
    if (!alone) {
      const own = document.createElement("p")
      own.appendChild(node)
      if (dir < 0) block.before(own)
      else block.after(own)
    } else {
      const next = dir < 0 ? block.previousElementSibling : block.nextElementSibling
      if (!next) return
      if (dir < 0) next.before(block)
      else next.after(block)
    }
    ensureBlock()
    commit()
    img.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }

  const insertEmoji = (emoji: string) => {
    exec("insertText", emoji)
    commit()
    readActive()
  }

  /* The picture being described is outlined, so it is clear which one. */
  React.useEffect(() => {
    const el = picture?.el
    if (!el) return
    el.setAttribute("data-picked", "")
    return () => el.removeAttribute("data-picked")
  }, [picture?.el])

  const onFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.tagName === "IMG" && !target.hasAttribute("data-uploading") && uploadImage) {
      const img = target as HTMLImageElement
      if (picture?.el !== img) setPicture({ el: img, alt: img.getAttribute("alt") ?? "", altOpen: false })
    } else if (picture) {
      setPicture(null)
    }
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

  /*
    A TAP, NOT A SWIPE. A finger that goes down on a control and then moves
    is scrolling the row, and must not also press what it started on. Each
    press is followed from pointerdown: once it has moved more than 8px, or
    the row has scrolled under it, or the browser has taken it for a scroll
    (pointercancel), the click that may still follow is swallowed before it
    reaches the control. A keyboard press (Enter or Space: a click with no
    pointer, detail 0) always goes through.

    The pressed shade under a finger comes on only after it has held still
    for a moment, as iOS's own controls do, so a swipe across the row never
    flashes the controls it passes over. A mouse gets hover and :active
    instead, which a touch screen never sees.
  */
  const tapRef = React.useRef<{ id: number; x: number; y: number; moved: boolean; el: HTMLElement | null; timer: number } | null>(null)
  const unpress = (t: { el: HTMLElement | null; timer: number } | null) => {
    if (!t) return
    window.clearTimeout(t.timer)
    t.el?.removeAttribute("data-pressing")
  }
  const onStripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    unpress(tapRef.current)
    const el = (e.target as HTMLElement).closest<HTMLElement>("button")
    const t = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, el: e.pointerType === "mouse" ? null : el, timer: 0 }
    if (t.el) t.timer = window.setTimeout(() => { if (!t.moved) t.el?.setAttribute("data-pressing", "") }, 90)
    tapRef.current = t
  }
  const onStripPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = tapRef.current
    if (!t || t.moved || t.id !== e.pointerId) return
    if (Math.abs(e.clientX - t.x) > 8 || Math.abs(e.clientY - t.y) > 8) {
      t.moved = true
      unpress(t)
    }
  }
  const onStripPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = tapRef.current
    if (!t || t.id !== e.pointerId) return
    if (e.type === "pointercancel") t.moved = true
    window.clearTimeout(t.timer)
    if (t.moved) return unpress(t)
    /* A quick tap still shows it was taken: the shade for the click that follows, then gone. */
    t.el?.setAttribute("data-pressing", "")
    t.timer = window.setTimeout(() => unpress(t), 140)
  }
  const onStripScroll = () => {
    const t = tapRef.current
    if (t && !t.moved) {
      t.moved = true
      unpress(t)
    }
  }
  const onStripClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = tapRef.current
    tapRef.current = null
    if (e.detail !== 0 && t?.moved) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const visible = GROUPS.map((group) => group.filter((t) => tools.includes(t) && (t !== "image" || !!uploadImage))).filter((group) => group.length)
  /* One stop for Tab: the first control. Arrow keys do the rest. */
  const firstTool = visible[0]?.[0]

  return (
    <div
      className={cn(
        "rich-text-field rounded-xl border border-[#e5e7eb] bg-white transition-[border-color,box-shadow] duration-150",
        /* A sticky toolbar needs a box that clips without scrolling: `hidden`
           would make the field the toolbar's scroller, and it would never
           stick to the page. */
        stickyToolbar ? "overflow-clip" : "overflow-hidden",
        /* While the text has the focus the border darkens a little and a soft
           grey halo comes up: no blue ring. The link form's own fields draw
           theirs, so the two never stack. */
        "has-[.rich-text-content:focus]:border-[#c9ccd3] has-[.rich-text-content:focus]:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]",
        className,
      )}
    >
      <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={150}>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={`${label} formatting`}
        aria-controls={id}
        onKeyDown={onToolbarKey}
        className={cn("rich-text-toolbar flex items-center border-b border-[#eef0f2] bg-white", stickyToolbar && "sticky z-[5]")}
        style={stickyToolbar ? { top: stickyToolbar } : undefined}
      >
        {/* The row of controls, which scrolls sideways on a phone with a fade
            and an arrow at whichever end has more (./rich-text/scroll-row.tsx). */}
        <ScrollRow
          data-toolbar-strip=""
          arrowClassName="w-11 sm:w-8"
          onPointerDownCapture={onStripPointerDown}
          onPointerMoveCapture={onStripPointerMove}
          onPointerUpCapture={onStripPointerEnd}
          onPointerCancelCapture={onStripPointerEnd}
          onClickCapture={onStripClickCapture}
          onScroll={onStripScroll}
          className={cn(
            "gap-0.5 px-1 py-1 [--row-fade:48px] sm:flex-wrap sm:px-1.5",
            /* Native momentum, no snapping, and a flick that reaches the end
               stops there instead of pulling the page sideways. A vertical
               swipe that starts on the row still scrolls the page. */
            "[scroll-snap-type:none] [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]",
          )}
        >
        {visible.map((group, g) => (
          <React.Fragment key={group.join("-")}>
            {g > 0 ? <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[#e5e7eb]" /> : null}
            {group.map((tool) => {
              const { label: name, icon: Icon } = TOOL[tool]
              const on = pressed(tool)
              if (tool === "emoji") {
                return (
                  <Tip key={tool} label={name}>
                    <span className="inline-flex shrink-0">
                      <EmojiControl
                        className={cn(TOOL_BUTTON, TOOL_IDLE)}
                        onBeforeOpen={() => api.keepSelection()}
                        onInsert={insertEmoji}
                      />
                    </span>
                  </Tip>
                )
              }
              const toggle = tool !== "rule" && tool !== "image" && tool !== "clear" && tool !== "undo" && tool !== "redo"
              return (
                <Tip key={tool} label={name}>
                <button
                  type="button"
                  tabIndex={tool === firstTool ? 0 : -1}
                  aria-label={name}
                  aria-pressed={toggle ? on : undefined}
                  aria-expanded={tool === "link" ? !!link : undefined}
                  /* mousedown, not click: a click moves focus out of the
                     text first, and a field that has lost its selection has
                     nothing to make bold. A finger's mousedown is only sent
                     after a tap has ended, never while the row is being
                     swiped, so it keeps the keyboard up on Android as well. */
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(tool)}
                  className={cn(TOOL_BUTTON, on ? "bg-[#e6e8eb] text-[#1a1a2e]" : TOOL_IDLE)}
                >
                  <Icon aria-hidden className="h-[18px] w-[18px] sm:h-4 sm:w-4" strokeWidth={tool === "bold" ? 2.4 : 2} />
                </button>
                </Tip>
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
        </ScrollRow>
        {toolbarEnd ? <div className="flex shrink-0 items-center self-stretch border-l border-[#eef0f2] px-1">{toolbarEnd}</div> : null}
      </div>
      </TooltipPrimitive.Provider>

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
              className="h-11 w-full min-w-0 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] aria-invalid:border-[#dc2626] sm:h-9 sm:w-auto sm:flex-1 sm:text-[14px]"
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
                className="h-11 min-w-0 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-9 sm:w-40 sm:text-[14px]"
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

      {picture?.altOpen ? (
        <div role="group" aria-label="Picture description" className="border-b border-[#eef0f2] px-3 py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={picture.alt}
              onChange={(e) => {
                const alt = e.target.value.slice(0, 300)
                picture.el.setAttribute("alt", alt)
                setPicture({ ...picture, alt })
                commit()
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault()
                  setPicture({ ...picture, altOpen: false })
                }
              }}
              placeholder="Describe the picture for people who cannot see it"
              aria-label="Picture description"
              className="h-11 w-full min-w-0 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-9 sm:w-auto sm:flex-1 sm:text-[14px]"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={removePicture}
                className="h-11 rounded-lg px-3 text-[14px] font-medium text-[#b42318] hover:bg-[#fef3f2] sm:h-9 sm:text-[13px]"
              >
                Remove picture
              </button>
              <button
                type="button"
                onClick={() => setPicture({ ...picture, altOpen: false })}
                className="ml-auto h-11 rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-medium text-white hover:bg-[#2a2a40] sm:ml-0 sm:h-9 sm:text-[13px]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {panel}

      <div ref={frameRef} className="relative">
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
            /* A shortcut (Cmd or Ctrl and B, I, U) changes the marks without
               moving the caret, so no selectionchange says so: read them here. */
            const type = (e.nativeEvent as InputEvent).inputType
            if (type?.startsWith("format")) readActive()
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDrop={onDrop}
          onClick={onFieldClick}
          className={cn(
            "rich-text-content storelib-prose px-3.5 py-3 text-[16px] leading-[1.6] text-[#1a1a2e] outline-none sm:text-[15px]",
            /* Tall enough to write in; short enough that on a phone the
               toolbar and the caret both stay above the keyboard. A field
               that grows leaves the scrolling to the page.
               ONE SWIPE, ONE SCROLLER, as Notion and Shopify do it on a
               phone. Text that fits its box has nothing to scroll, so a
               vertical swipe on it moves the page. Text taller than its box
               scrolls first, and a swipe that starts at its top or bottom
               edge goes on to move the page (overscroll-behavior auto, not
               contain): the field never holds on to a swipe it cannot use. */
            dragHeight != null ? "overflow-y-auto" : grow ? null : "max-h-[320px] overflow-y-auto sm:max-h-[480px]",
            "[overscroll-behavior-y:auto] [touch-action:pan-x_pan-y]",
            "[overflow-wrap:anywhere] [-webkit-user-select:text] [user-select:text]",
          )}
          style={dragHeight != null ? { minHeight, height: dragHeight, maxHeight: "none" } : { minHeight }}
        />
        {barPicture && uploadImage && rootRef.current ? (
          <div className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
            <PictureControls
              key={barPicture.getAttribute("src") ?? "picture"}
              img={barPicture}
              open={picture?.el === barPicture}
              onExited={() => setBarPicture((b) => (b === barPicture ? null : b))}
              root={rootRef.current}
              frameRef={frameRef}
              onChange={commit}
              onMove={movePicture}
              onAlt={() => picture && setPicture({ ...picture, altOpen: true })}
              onRemove={removePicture}
              onDone={() => setPicture(null)}
            />
          </div>
        ) : null}
      </div>

      {resizable ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Resize ${label}`}
          aria-valuenow={dragHeight ?? undefined}
          aria-valuemin={minHeight}
          aria-valuemax={RESIZE_MAX}
          aria-valuetext={dragHeight != null ? `${dragHeight} pixels tall` : "Its own height"}
          tabIndex={0}
          data-rich-text-resize=""
          onPointerDown={startResize}
          onKeyDown={keyResize}
          onDoubleClick={() => setDragHeight(null)}
          className={cn(
            "group/resize relative flex h-5 cursor-ns-resize touch-none select-none items-center justify-center border-t border-[#eef0f2] bg-[#fafafa] transition-colors duration-100 focus-visible:bg-[#f3f4f6] focus-visible:outline-none sm:h-4",
            "[-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[#f3f4f6]",
            /* THE PILL STAYS SMALL, THE TARGET DOES NOT. An invisible strip
               reaches up over the text's bottom padding, so a thumb has 34px
               to land on on a phone (8px more on a computer), while the bar
               drawn is still 20px with a 4px pill. */
            "before:absolute before:inset-x-0 before:-top-2 before:bottom-0 before:content-[''] max-sm:before:-top-3.5",
          )}
        >
          {/* It darkens while it is held, so the drag is seen to have been taken. */}
          <span
            aria-hidden
            className="h-1 w-9 rounded-full bg-[#d1d5db] transition-[background-color,scale] duration-150 max-sm:w-10 [@media(hover:hover)_and_(pointer:fine)]:group-hover/resize:bg-[#b8bcc4] group-data-[dragging]/resize:scale-x-110 group-data-[dragging]/resize:bg-[#6b7280]"
          />
        </div>
      ) : null}

      {uploads > 0 || notice || sizeProblem ? (
        <div role="status" aria-live="polite" className="space-y-0.5 border-t border-[#eef0f2] px-3.5 py-2 text-[13px] leading-5">
          {uploads > 0 ? <p className="text-[#6b7280]">{uploads === 1 ? "Uploading the picture" : `Uploading ${uploads} pictures`}</p> : null}
          {notice ? <p className="text-[#b42318]">{notice}</p> : null}
          {sizeProblem ? <p className="text-[#b42318]">{sizeProblem}</p> : null}
        </div>
      ) : null}

      {uploadImage ? (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void addPicture(file)
          }}
        />
      ) : null}
    </div>
  )
}
