"use client"

/**
 * ===========================================================================
 *  THE EMAIL EDITOR
 * ===========================================================================
 * An email is a column of blocks, drawn here as it will read in an inbox:
 * text, headings, lists, quotes, a button, an image, a product, a divider,
 * a space. Writing works like a document (Enter starts a new paragraph,
 * Backspace joins two, the arrows move between them, "# " makes a heading,
 * "- " a list, "/" opens the list of blocks), and every block can be moved,
 * copied or removed from the toolbar, or dragged by its handle on a
 * computer.
 *
 * The toolbar sits under the page's bar and stays there while the email
 * scrolls. On a phone it is one row that scrolls sideways, so every control
 * stays reachable without wrapping over the text. A block's settings open
 * under it, in the flow of the page, never on top of the email.
 *
 * The blocks become email HTML in lib/email-campaigns/blocks.ts; what this
 * draws is only for writing, and the preview beside it is the real thing.
 */
import * as React from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  GripVertical,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { pickerSurface } from "@/components/app/date-range-picker"
import { cn } from "@/lib/utils"
import {
  newBlock,
  safeColor,
  safeImageSrc,
  safeUrl,
  textOn,
  type Align,
  type Block,
  type BlockIssue,
  type BlockType,
  type ImageBlock,
  type ListBlock,
  type TextBlock,
  type TextStyle,
} from "@/lib/email-campaigns/blocks"
import { Editable, type EditableHandle } from "./editable"
import { parseHtmlToBlocks, textToBlocks, cleanInline } from "./parse"
import { ButtonPanel, ImagePanel, ProductPanel, SpacerPanel } from "./panels"
import { buttonPrimary, buttonSecondary, inputClass } from "./ui"
import type { Doc } from "./use-doc"

/* ─── What can be inserted ───────────────────────────────────────────── */

interface InsertItem {
  key: string
  label: string
  hint: string
  words: string
  make: () => Block
}

export const INSERT_ITEMS: InsertItem[] = [
  { key: "text", label: "Text", hint: "A paragraph", words: "text paragraph p", make: () => newBlock("text") },
  { key: "h1", label: "Heading 1", hint: "#", words: "heading title h1 large", make: () => newBlock("text", { style: "h1" } as Partial<Block>) },
  { key: "h2", label: "Heading 2", hint: "##", words: "heading subtitle h2 medium", make: () => newBlock("text", { style: "h2" } as Partial<Block>) },
  { key: "h3", label: "Heading 3", hint: "###", words: "heading h3 small", make: () => newBlock("text", { style: "h3" } as Partial<Block>) },
  { key: "bullets", label: "Bulleted list", hint: "-", words: "list bullets unordered ul", make: () => newBlock("list") },
  { key: "numbers", label: "Numbered list", hint: "1.", words: "list numbers ordered ol", make: () => newBlock("list", { ordered: true } as Partial<Block>) },
  { key: "quote", label: "Quote", hint: ">", words: "quote blockquote", make: () => newBlock("text", { style: "quote" } as Partial<Block>) },
  { key: "button", label: "Button", hint: "A link that stands out", words: "button cta link call action", make: () => newBlock("button") },
  { key: "image", label: "Image", hint: "Upload a picture", words: "image picture photo media img", make: () => newBlock("image") },
  { key: "product", label: "Product", hint: "One of your products", words: "product shop item sell store", make: () => newBlock("product") },
  { key: "divider", label: "Divider", hint: "A line across", words: "divider line hr separator rule", make: () => newBlock("divider") },
  { key: "spacer", label: "Space", hint: "Room between blocks", words: "space spacer gap empty", make: () => newBlock("spacer") },
]

function matchItems(q: string): InsertItem[] {
  const query = q.trim().toLowerCase()
  if (!query) return INSERT_ITEMS
  return INSERT_ITEMS.filter((i) => i.label.toLowerCase().includes(query) || i.words.includes(query))
}

const STYLE_LABEL: Record<TextStyle, string> = { p: "Text", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", quote: "Quote" }

/** The writing sizes, the same as the email's (lib/email-campaigns/blocks.ts). */
const TEXT_CLASS: Record<TextStyle, string> = {
  p: "text-[16px] leading-[26px] text-[#1f2937]",
  h1: "text-[28px] leading-[36px] font-bold text-[#111827]",
  h2: "text-[22px] leading-[30px] font-bold text-[#111827]",
  h3: "text-[18px] leading-[26px] font-semibold text-[#111827]",
  quote: "border-l-[3px] border-[#e5e7eb] pl-4 text-[16px] leading-[26px] italic text-[#4b5563]",
}
const TAG: Record<TextStyle, "p" | "h1" | "h2" | "h3" | "blockquote"> = { p: "p", h1: "h1", h2: "h2", h3: "h3", quote: "blockquote" }
const INLINE = "[&_a]:text-[#111827] [&_a]:underline [&_b]:font-bold [&_strong]:font-bold"

function textLength(html: string): number {
  if (typeof document === "undefined") return html.length
  const d = document.createElement("div")
  d.innerHTML = html
  return (d.textContent ?? "").length
}

function blank(html: string): boolean {
  return html.replace(/<br\s*\/?>/gi, "").replace(/<[^>]*>/g, "").replace(/&nbsp;|​/g, "").trim() === ""
}

/* ─── The editor ─────────────────────────────────────────────────────── */

export interface BlockEditorProps {
  doc: Doc
  creatorId: string | null
  username: string | null
  issues: BlockIssue[]
  showIssues: boolean
  /** Filled in with {{first_name}} and friends, from the toolbar. */
  onUploadImage: (file: File) => Promise<string>
}

type Focus = { key: string; at: "start" | "end" | number }

export function BlockEditor({ doc, creatorId, username, issues, showIssues, onUploadImage }: BlockEditorProps) {
  const { blocks, set } = doc
  const [selected, setSelected] = React.useState<string | null>(null)
  const [slash, setSlash] = React.useState<{ id: string; q: string; active: number } | null>(null)
  const [insertOpen, setInsertOpen] = React.useState(false)
  const [endOpen, setEndOpen] = React.useState(false)
  const [pickerFor, setPickerFor] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState<Record<string, string>>({})
  const [uploadError, setUploadError] = React.useState<Record<string, string>>({})
  const [marks, setMarks] = React.useState({ bold: false, italic: false, underline: false, strike: false, link: false })
  const refs = React.useRef(new Map<string, EditableHandle>())
  const focusNext = React.useRef<Focus | null>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const uploadTarget = React.useRef<string | null>(null)

  const byId = React.useCallback((id: string | null) => blocks.find((b) => b.id === id) ?? null, [blocks])
  const current = byId(selected)

  /* Focus that was asked for before the block existed lands after the render that made it. */
  React.useLayoutEffect(() => {
    const f = focusNext.current
    if (!f) return
    const h = refs.current.get(f.key)
    if (h) {
      focusNext.current = null
      h.focus(f.at)
    }
  })

  const focus = (key: string, at: Focus["at"]) => {
    const h = refs.current.get(key)
    if (h) h.focus(at)
    else focusNext.current = { key, at }
  }

  /* Which marks the caret is inside, for the toolbar. */
  React.useEffect(() => {
    const read = () => {
      const sel = window.getSelection()
      const inside = !!sel && sel.rangeCount > 0 && !!rootRef.current?.contains(sel.anchorNode)
      if (!inside) return
      const anchor = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement
      setMarks({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strike: document.queryCommandState("strikeThrough"),
        link: !!anchor?.closest("a"),
      })
    }
    document.addEventListener("selectionchange", read)
    return () => document.removeEventListener("selectionchange", read)
  }, [])

  /* ─── Changing the blocks ─── */

  const patch = React.useCallback(
    (id: string, p: Partial<Block>, typing = false) => set((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)), typing ? { typing: id } : undefined),
    [set],
  )

  const insertAt = (index: number, ...added: Block[]) => set((prev) => [...prev.slice(0, index), ...added, ...prev.slice(index)])
  const indexOf = (id: string) => blocks.findIndex((b) => b.id === id)

  const remove = (id: string) => {
    const i = indexOf(id)
    const next = blocks.filter((b) => b.id !== id)
    if (next.length === 0) {
      const fresh = newBlock("text")
      set([fresh])
      setSelected(fresh.id)
      focus(fresh.id, "start")
      return
    }
    set(next)
    const neighbour = next[Math.max(0, i - 1)]
    setSelected(neighbour.id)
    if (neighbour.type === "text") focus(neighbour.id, "end")
  }

  const move = (id: string, dir: -1 | 1) => {
    const i = indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= blocks.length) return
    set(arrayMove(blocks, i, j))
  }

  const duplicate = (id: string) => {
    const b = byId(id)
    if (!b) return
    const copy = { ...(JSON.parse(JSON.stringify(b)) as Block), id: newBlock(b.type).id }
    insertAt(indexOf(id) + 1, copy)
    setSelected(copy.id)
  }

  /** Put a new block after `afterId` (or at the end) and start working on it. */
  const addBlock = (made: Block, afterId: string | null, replace = false) => {
    const i = afterId ? indexOf(afterId) : blocks.length - 1
    set((prev) => {
      const at = afterId ? prev.findIndex((b) => b.id === afterId) : prev.length - 1
      const before = prev.slice(0, replace ? at : at + 1)
      const after = prev.slice(at + 1)
      /* A block that is not text at the very end gets a paragraph after it, so writing can go on. */
      const tail = made.type !== "text" && made.type !== "list" && after.length === 0 ? [newBlock("text")] : []
      return [...before, made, ...tail, ...after]
    })
    void i
    setSelected(made.id)
    if (made.type === "text") focus(made.id, "start")
    if (made.type === "list") focus(`${made.id}:0`, "start")
    if (made.type === "image") startUpload(made.id)
    if (made.type === "product") setPickerFor(made.id)
  }

  const pickInsert = (item: InsertItem, targetId: string | null) => {
    const target = byId(targetId)
    const fromSlash = !!slash && slash.id === targetId
    setSlash(null)
    setInsertOpen(false)
    const made = item.make()
    /* An empty paragraph (or one holding only "/query") becomes the new block. */
    const replace = !!target && target.type === "text" && (fromSlash || blank(target.html))
    if (replace && target && (made.type === "text" || made.type === "list")) {
      set((prev) => prev.map((b) => (b.id === target.id ? ({ ...made, id: target.id } as Block) : b)))
      setSelected(target.id)
      focus(made.type === "list" ? `${target.id}:0` : target.id, "start")
      return
    }
    addBlock(made, targetId, replace)
  }

  /* ─── Text: split, merge, move between ─── */

  const splitText = (b: TextBlock, after: string) => {
    const next = newBlock("text", { html: after, align: b.align } as Partial<Block>) as TextBlock
    insertAt(indexOf(b.id) + 1, next)
    setSelected(next.id)
    focus(next.id, "start")
  }

  const mergeUp = (id: string) => {
    const i = indexOf(id)
    const b = blocks[i]
    if (!b || b.type !== "text") return
    if (b.style !== "p" && i >= 0) {
      /* A heading or quote first turns back into a paragraph, like every editor. */
      patch(b.id, { style: "p" })
      return
    }
    const prev = blocks[i - 1]
    if (!prev) return
    if (prev.type === "text") {
      const at = textLength(prev.html)
      set((all) => all.filter((x) => x.id !== b.id).map((x) => (x.id === prev.id ? ({ ...x, html: blank(b.html) ? (x as TextBlock).html : (x as TextBlock).html + b.html } as Block) : x)))
      setSelected(prev.id)
      focus(prev.id, at)
      return
    }
    if (prev.type === "list") {
      const last = prev.items.length - 1
      const at = textLength(prev.items[last] ?? "")
      set((all) =>
        all
          .filter((x) => x.id !== b.id)
          .map((x) => (x.id === prev.id ? ({ ...x, items: (x as ListBlock).items.map((it, k) => (k === last && !blank(b.html) ? it + b.html : it)) } as Block) : x)),
      )
      focus(`${prev.id}:${last}`, at)
      return
    }
    if (blank(b.html)) remove(b.id)
    else setSelected(prev.id)
  }

  const neighbour = (id: string, dir: "up" | "down") => {
    const i = indexOf(id)
    const n = blocks[dir === "up" ? i - 1 : i + 1]
    if (!n) return
    setSelected(n.id)
    if (n.type === "text") focus(n.id, dir === "up" ? "end" : "start")
    else if (n.type === "list") focus(`${n.id}:${dir === "up" ? n.items.length - 1 : 0}`, dir === "up" ? "end" : "start")
    else rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${n.id}"]`)?.focus({ preventScroll: false })
  }

  const shortcut = (b: TextBlock, marker: string): boolean => {
    if (b.style !== "p") return false
    const style: TextStyle | null = marker === "#" ? "h1" : marker === "##" ? "h2" : marker === "###" ? "h3" : marker === ">" ? "quote" : null
    if (style) {
      patch(b.id, { style, html: "" })
      return true
    }
    if (marker === "-" || marker === "*" || marker === "1.") {
      const list = newBlock("list", { ordered: marker === "1." } as Partial<Block>)
      set((prev) => prev.map((x) => (x.id === b.id ? ({ ...list, id: b.id } as Block) : x)))
      focus(`${b.id}:0`, "start")
      return true
    }
    return false
  }

  /* ─── Lists ─── */

  const listItem = (l: ListBlock, k: number, html: string) => patch(l.id, { items: l.items.map((it, j) => (j === k ? html : it)) } as Partial<Block>, true)

  const listEnter = (l: ListBlock, k: number, after: string) => {
    const item = l.items[k] ?? ""
    if (blank(item) && blank(after)) {
      /* Enter on an empty item leaves the list. */
      const before = l.items.slice(0, k)
      const rest = l.items.slice(k + 1)
      const para = newBlock("text")
      set((prev) => {
        const at = prev.findIndex((x) => x.id === l.id)
        const out: Block[] = []
        if (before.length) out.push({ ...l, items: before })
        out.push(para)
        if (rest.length) out.push({ ...l, id: newBlock("list").id, items: rest })
        return [...prev.slice(0, at), ...out, ...prev.slice(at + 1)]
      })
      setSelected(para.id)
      focus(para.id, "start")
      return
    }
    patch(l.id, { items: [...l.items.slice(0, k + 1), after, ...l.items.slice(k + 1)] } as Partial<Block>)
    focus(`${l.id}:${k + 1}`, "start")
  }

  const listBackspace = (l: ListBlock, k: number) => {
    if (k === 0) {
      /* The first item steps out of the list as a paragraph. */
      const para = newBlock("text", { html: l.items[0] ?? "" } as Partial<Block>)
      const rest = l.items.slice(1)
      set((prev) => {
        const at = prev.findIndex((x) => x.id === l.id)
        return [...prev.slice(0, at), para, ...(rest.length ? [{ ...l, items: rest }] : []), ...prev.slice(at + 1)]
      })
      setSelected(para.id)
      focus(para.id, "start")
      return
    }
    const at = textLength(l.items[k - 1])
    patch(l.id, { items: l.items.filter((_, j) => j !== k).map((it, j) => (j === k - 1 && !blank(l.items[k]) ? it + l.items[k] : it)) } as Partial<Block>)
    focus(`${l.id}:${k - 1}`, at)
  }

  const listArrow = (l: ListBlock, k: number, dir: "up" | "down") => {
    if (dir === "up" && k > 0) return focus(`${l.id}:${k - 1}`, "end")
    if (dir === "down" && k < l.items.length - 1) return focus(`${l.id}:${k + 1}`, "start")
    neighbour(l.id, dir)
  }

  /* ─── Toolbar actions ─── */

  const exec = (command: string, value?: string) => {
    document.execCommand("styleWithCSS", false, "false")
    document.execCommand(command, false, value)
  }

  const setStyle = (style: TextStyle) => {
    if (!current) return
    if (current.type === "text") patch(current.id, { style })
    else if (current.type === "list") {
      const paras = current.items.map((html) => newBlock("text", { html, style } as Partial<Block>))
      set((prev) => {
        const at = prev.findIndex((x) => x.id === current.id)
        return [...prev.slice(0, at), ...paras, ...prev.slice(at + 1)]
      })
      setSelected(paras[0].id)
      focus(paras[0].id, "end")
    }
  }

  const toggleList = (ordered: boolean) => {
    if (!current) return
    if (current.type === "list") {
      if (current.ordered === ordered) setStyle("p")
      else patch(current.id, { ordered } as Partial<Block>)
      return
    }
    if (current.type === "text") {
      const items = current.html.split(/<br\s*\/?>/i).filter((x) => !blank(x))
      const list = { ...newBlock("list", { ordered } as Partial<Block>), id: current.id, items: items.length ? items : [""] } as Block
      set((prev) => prev.map((x) => (x.id === current.id ? list : x)))
      focus(`${current.id}:${Math.max(0, items.length - 1)}`, "end")
    }
  }

  const setAlign = (align: Align) => {
    if (!current) return
    if (current.type === "text" || current.type === "button" || current.type === "image") patch(current.id, { align } as Partial<Block>)
  }

  /* ─── Links ─── */

  const savedRange = React.useRef<Range | null>(null)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [linkUrl, setLinkUrl] = React.useState("")
  const [linkText, setLinkText] = React.useState("")
  const openLink = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && rootRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
      const anchor = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest("a")
      setLinkUrl(anchor?.getAttribute("href") ?? "")
      setLinkText(sel.toString())
    } else {
      savedRange.current = null
      setLinkUrl("")
      setLinkText("")
    }
    setLinkOpen(true)
  }
  const restore = () => {
    const r = savedRange.current
    if (!r) return false
    const host = (r.startContainer instanceof Element ? r.startContainer : r.startContainer.parentElement)?.closest<HTMLElement>("[contenteditable]")
    host?.focus({ preventScroll: true })
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
    return true
  }
  const applyLink = () => {
    const url = safeUrl(linkUrl)
    if (!url || !restore()) return setLinkOpen(false)
    const sel = window.getSelection()
    if (sel && sel.isCollapsed) {
      const words = linkText.trim() || url.replace(/^https?:\/\//, "").replace(/\/$/, "")
      exec("insertHTML", `<a href="${url.replace(/"/g, "&quot;")}">${words.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string)}</a>&nbsp;`)
    } else {
      exec("createLink", url)
    }
    setLinkOpen(false)
  }
  const removeLink = () => {
    if (restore()) {
      const sel = window.getSelection()
      const a = (sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement)?.closest("a")
      if (a && sel?.isCollapsed) {
        const r = document.createRange()
        r.selectNodeContents(a)
        sel.removeAllRanges()
        sel.addRange(r)
      }
      exec("unlink")
    }
    setLinkOpen(false)
  }

  /** Where the caret was when a menu took the focus, so what the menu does lands there. */
  const rememberCaret = () => {
    const sel = window.getSelection()
    savedRange.current = sel && sel.rangeCount && rootRef.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null
  }

  const insertField = (field: string) => {
    if (current?.type !== "text" && current?.type !== "list") return
    /* After the menu has closed and handed the focus back. */
    window.setTimeout(() => {
      if (restore()) exec("insertText", `{{${field}}}`)
    }, 0)
  }

  /* ─── Images ─── */

  function startUpload(id: string) {
    uploadTarget.current = id
    fileRef.current?.click()
  }

  const upload = async (id: string, file: File) => {
    setUploadError((e) => ({ ...e, [id]: "" }))
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) return setUploadError((e) => ({ ...e, [id]: "Use a JPG, PNG, GIF or WebP image." }))
    if (file.size > 5 * 1024 * 1024) return setUploadError((e) => ({ ...e, [id]: "Use an image under 5 MB." }))
    const local = URL.createObjectURL(file)
    setUploading((u) => ({ ...u, [id]: local }))
    try {
      const url = await onUploadImage(file)
      const img = byIdRef.current(id) as ImageBlock | null
      patch(id, { src: url, alt: img?.alt || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 120) } as Partial<Block>)
    } catch (err) {
      setUploadError((e) => ({ ...e, [id]: err instanceof Error ? err.message : "The image did not upload. Try again." }))
    } finally {
      URL.revokeObjectURL(local)
      setUploading((u) => {
        const { [id]: _gone, ...rest } = u
        void _gone
        return rest
      })
    }
  }
  const byIdRef = React.useRef(byId)
  byIdRef.current = byId

  /* ─── Paste ─── */

  const paste = (e: React.ClipboardEvent<HTMLElement>, b: Block) => {
    const data = e.clipboardData
    const file = Array.from(data.files ?? []).find((f) => f.type.startsWith("image/"))
    if (file) {
      e.preventDefault()
      const img = newBlock("image") as ImageBlock
      insertAt(indexOf(b.id) + 1, img)
      setSelected(img.id)
      void upload(img.id, file)
      return
    }
    const html = data.getData("text/html")
    const text = data.getData("text/plain")
    const parsed = html ? parseHtmlToBlocks(html) : textToBlocks(text)
    e.preventDefault()
    if (parsed.length === 0) return
    const first = parsed[0]
    const rest = parsed.slice(1)
    if (first.type === "text") exec("insertHTML", cleanInline(first.html))
    else if (first.type === "list" && rest.length === 0) exec("insertHTML", first.items.map(cleanInline).join("<br>"))
    else rest.unshift(first)
    if (rest.length) insertAt(indexOf(b.id) + 1, ...rest)
  }

  /* ─── Keys for the whole editor ─── */

  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (slash) {
      const items = matchItems(slash.q)
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        const n = items.length || 1
        setSlash({ ...slash, active: (slash.active + (e.key === "ArrowDown" ? 1 : n - 1)) % n })
        return
      }
      if (e.key === "Enter" && items.length) {
        e.preventDefault()
        e.stopPropagation()
        pickInsert(items[Math.min(slash.active, items.length - 1)], slash.id)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setSlash(null)
        return
      }
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) doc.redo()
      else doc.undo()
      return
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault()
      doc.redo()
      return
    }
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault()
      openLink()
      return
    }
    if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && selected) {
      e.preventDefault()
      move(selected, e.key === "ArrowUp" ? -1 : 1)
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    const from = blocks.findIndex((b) => b.id === e.active.id)
    const to = blocks.findIndex((b) => b.id === e.over?.id)
    if (from >= 0 && to >= 0 && from !== to) set(arrayMove(blocks, from, to))
  }

  const textish = current?.type === "text" || current?.type === "list"
  const alignable = current?.type === "text" || current?.type === "button" || current?.type === "image"
  const currentAlign: Align | null = current && "align" in current ? (current as { align: Align }).align : null
  const styleNow: TextStyle | null = current?.type === "text" ? current.style : null
  const issueFor = (id: string) => (showIssues ? issues.find((i) => i.id === id && i.level === "error") : undefined)

  /* ─── Drawing ─── */

  const tool = (on: boolean) =>
    cn(
      "inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#4b5563] transition-colors duration-100 hover:bg-[#f1f2f4] active:bg-[#e8e9ec] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent sm:h-8 sm:w-8",
      on && "bg-[#eceef1] text-[#1a1a2e]",
    )
  /* Pressing a tool must not take the caret out of the text it acts on. */
  const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault()

  return (
    <div ref={rootRef} onKeyDownCapture={onKeyDownCapture} data-email-editor="">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="orders-strip sticky z-[6] flex h-12 items-center gap-0.5 overflow-x-auto rounded-t-2xl border-b border-[#eef0f2] bg-white/95 px-2 backdrop-blur-[2px] supports-[backdrop-filter]:bg-white/90"
        style={{ top: "var(--compose-bar, 0px)" }}
      >
        <button type="button" className={tool(false)} aria-label="Undo" title="Undo" disabled={!doc.canUndo} onMouseDown={keep} onClick={doc.undo}>
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" className={tool(false)} aria-label="Redo" title="Redo" disabled={!doc.canRedo} onMouseDown={keep} onClick={doc.redo}>
          <Redo2 className="h-4 w-4" />
        </button>
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[#e3e4e8]" />

        <StylePicker value={styleNow} disabled={!textish} onPick={setStyle} />
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[#e3e4e8]" />

        <button type="button" className={tool(marks.bold)} aria-label="Bold" aria-pressed={marks.bold} title="Bold" disabled={!textish} onMouseDown={keep} onClick={() => exec("bold")}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={tool(marks.italic)} aria-label="Italic" aria-pressed={marks.italic} title="Italic" disabled={!textish} onMouseDown={keep} onClick={() => exec("italic")}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={tool(marks.underline)} aria-label="Underline" aria-pressed={marks.underline} title="Underline" disabled={!textish} onMouseDown={keep} onClick={() => exec("underline")}>
          <Underline className="h-4 w-4" />
        </button>
        <button type="button" className={tool(marks.strike)} aria-label="Strikethrough" aria-pressed={marks.strike} title="Strikethrough" disabled={!textish} onMouseDown={keep} onClick={() => exec("strikeThrough")}>
          <Strikethrough className="h-4 w-4" />
        </button>
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={tool(marks.link)}
              aria-label="Link"
              title="Link"
              disabled={!textish}
              onMouseDown={keep}
              onClick={(e) => {
                e.preventDefault()
                openLink()
              }}
            >
              <Link2 className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className={cn(pickerSurface, "w-[min(320px,calc(100vw-24px))] p-3")}>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                applyLink()
              }}
              className="grid gap-2.5"
            >
              <label className="text-[13px] font-medium text-[#1a1a2e]" htmlFor="compose-link-url">
                Link
              </label>
              <input
                id="compose-link-url"
                className={inputClass}
                value={linkUrl}
                autoFocus
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="https://"
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              {savedRange.current?.collapsed !== false ? (
                <input className={inputClass} value={linkText} placeholder="Words to show" aria-label="Words to show" onChange={(e) => setLinkText(e.target.value)} />
              ) : null}
              {linkUrl && !safeUrl(linkUrl) ? <p className="text-[12px] text-[#b42318]">Use a full web address, like https://example.com</p> : null}
              <div className="flex items-center justify-end gap-2 pt-1">
                {marks.link ? (
                  <button type="button" className={buttonSecondary} onClick={removeLink}>
                    Remove link
                  </button>
                ) : null}
                <button type="submit" className={buttonPrimary} disabled={!safeUrl(linkUrl)}>
                  Apply
                </button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[#e3e4e8]" />

        <button type="button" className={tool(currentAlign === "left")} aria-label="Align left" title="Align left" disabled={!alignable} onMouseDown={keep} onClick={() => setAlign("left")}>
          <AlignLeft className="h-4 w-4" />
        </button>
        <button type="button" className={tool(currentAlign === "center")} aria-label="Align center" title="Align center" disabled={!alignable} onMouseDown={keep} onClick={() => setAlign("center")}>
          <AlignCenter className="h-4 w-4" />
        </button>
        <button type="button" className={tool(currentAlign === "right")} aria-label="Align right" title="Align right" disabled={!alignable} onMouseDown={keep} onClick={() => setAlign("right")}>
          <AlignRight className="h-4 w-4" />
        </button>
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[#e3e4e8]" />
        <button
          type="button"
          className={tool(current?.type === "list" && !current.ordered)}
          aria-label="Bulleted list"
          title="Bulleted list"
          disabled={!textish}
          onMouseDown={keep}
          onClick={() => toggleList(false)}
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool(current?.type === "list" && current.ordered)}
          aria-label="Numbered list"
          title="Numbered list"
          disabled={!textish}
          onMouseDown={keep}
          onClick={() => toggleList(true)}
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[#e3e4e8]" />

        <ResponsiveActionMenu
          title="Fill in for each reader"
          align="start"
          trigger={
            <button
              type="button"
              className={cn(tool(false), "w-auto px-2 text-[13px] font-medium")}
              disabled={!textish}
              onMouseDown={(e) => {
                keep(e)
                rememberCaret()
              }}
              aria-label="Insert a field"
            >
              {"{ }"}
            </button>
          }
          items={[
            { label: "First name", onClick: () => insertField("first_name") },
            { label: "Full name", onClick: () => insertField("name") },
            { label: "Email address", onClick: () => insertField("email") },
          ]}
        />

        <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
          <Popover open={insertOpen} onOpenChange={setInsertOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={cn(buttonSecondary, "h-9 sm:h-8")} onMouseDown={keep}>
                <Plus className="h-4 w-4" />
                Add
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className={cn(pickerSurface, "w-[260px] p-1.5")}>
              <InsertList items={INSERT_ITEMS} active={-1} onPick={(item) => pickInsert(item, selected)} />
            </PopoverContent>
          </Popover>
          <ResponsiveActionMenu
            title="Block"
            align="end"
            trigger={
              <button type="button" className={tool(false)} aria-label="Block actions" disabled={!current} onMouseDown={keep}>
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
            items={
              current
                ? [
                    { label: "Move up", onClick: () => move(current.id, -1) },
                    { label: "Move down", onClick: () => move(current.id, 1) },
                    { label: "Duplicate", onClick: () => duplicate(current.id) },
                    { label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => remove(current.id) },
                  ]
                : []
            }
          />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          const id = uploadTarget.current
          e.target.value = ""
          if (file && id) void upload(id, file)
        }}
      />

      <div className="px-4 pb-8 pt-6 sm:px-8 lg:px-14" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null) }}>
        <div className="mx-auto w-full max-w-[600px]">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {blocks.map((b, index) => (
                <Shell
                  key={b.id}
                  block={b}
                  selected={selected === b.id}
                  issue={issueFor(b.id)?.message}
                  onSelect={() => setSelected(b.id)}
                  onAddBelow={() => {
                    setSelected(b.id)
                    setInsertOpen(true)
                  }}
                  onKey={(e) => {
                    if (b.type === "text" || b.type === "list") return
                    if (e.target !== e.currentTarget) return
                    if (e.key === "Backspace" || e.key === "Delete") {
                      e.preventDefault()
                      remove(b.id)
                    } else if (e.key === "Enter") {
                      e.preventDefault()
                      addBlock(newBlock("text"), b.id)
                    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault()
                      neighbour(b.id, e.key === "ArrowUp" ? "up" : "down")
                    }
                  }}
                  panel={
                    selected === b.id ? (
                      b.type === "button" ? (
                        <ButtonPanel block={b} onChange={(p) => patch(b.id, p)} />
                      ) : b.type === "image" ? (
                        <ImagePanel block={b} onChange={(p) => patch(b.id, p)} onUpload={() => startUpload(b.id)} uploading={!!uploading[b.id]} uploadError={uploadError[b.id] || null} />
                      ) : b.type === "product" ? (
                        <ProductPanel block={b} onChange={(p) => patch(b.id, p)} creatorId={creatorId} username={username} pickerOpen={pickerFor === b.id} onPickerOpen={(o) => setPickerFor(o ? b.id : null)} />
                      ) : b.type === "spacer" ? (
                        <SpacerPanel block={b} onChange={(p) => patch(b.id, p)} />
                      ) : null
                    ) : null
                  }
                >
                  {b.type === "text" ? (
                    <div className="relative">
                      <Editable
                        ref={(h) => {
                          if (h) refs.current.set(b.id, h)
                          else refs.current.delete(b.id)
                        }}
                        as={TAG[b.style]}
                        html={b.html}
                        label={STYLE_LABEL[b.style]}
                        placeholder={
                          blocks.length === 1
                            ? "Start writing, or type / to add a button, an image or a product"
                            : selected === b.id
                              ? b.style === "p"
                                ? "Type / for blocks"
                                : STYLE_LABEL[b.style]
                              : ""
                        }
                        className={cn("m-0 py-1", TEXT_CLASS[b.style], INLINE)}
                        style={{ textAlign: b.align }}
                        onChange={(html) => html !== b.html && patch(b.id, { html }, true)}
                        onEnter={(after) => splitText(b, after)}
                        onBackspaceAtStart={() => mergeUp(b.id)}
                        onArrowOut={(dir) => neighbour(b.id, dir)}
                        onFocus={() => setSelected(b.id)}
                        onSlash={(q) => setSlash(q === null ? null : { id: b.id, q, active: slash?.id === b.id ? Math.min(slash.active, Math.max(0, matchItems(q).length - 1)) : 0 })}
                        onShortcut={(m) => shortcut(b, m)}
                        onPasteBlocks={(e) => paste(e, b)}
                      />
                      {slash?.id === b.id ? (
                        <div className={cn(pickerSurface, "absolute left-0 top-full z-20 mt-1 w-[min(280px,100%)] p-1.5")} role="dialog" aria-label="Add a block">
                          {matchItems(slash.q).length ? (
                            <InsertList items={matchItems(slash.q)} active={slash.active} onPick={(item) => pickInsert(item, b.id)} />
                          ) : (
                            <p className="px-2.5 py-2 text-[13px] text-[#6b7280]">No block called that</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : b.type === "list" ? (
                    React.createElement(
                      b.ordered ? "ol" : "ul",
                      { className: cn("m-0 py-1 pl-6 text-[16px] leading-[26px] text-[#1f2937]", b.ordered ? "list-decimal" : "list-disc") },
                      b.items.map((it, k) => (
                        <li key={k} className="mb-1.5 pl-1 marker:text-[#6b7280]">
                          <Editable
                            ref={(h) => {
                              if (h) refs.current.set(`${b.id}:${k}`, h)
                              else refs.current.delete(`${b.id}:${k}`)
                            }}
                            html={it}
                            label={`List item ${k + 1}`}
                            placeholder={selected === b.id ? "List item" : ""}
                            className={INLINE}
                            onChange={(html) => html !== it && listItem(b, k, html)}
                            onEnter={(after) => listEnter(b, k, after)}
                            onBackspaceAtStart={() => listBackspace(b, k)}
                            onArrowOut={(dir) => listArrow(b, k, dir)}
                            onFocus={() => setSelected(b.id)}
                            onPasteBlocks={(e) => paste(e, b)}
                          />
                        </li>
                      )),
                    )
                  ) : b.type === "button" ? (
                    <div className="py-2" style={{ textAlign: b.align }}>
                      <span
                        className="inline-block max-w-full break-words rounded-lg px-6 py-3 text-[16px] font-semibold leading-5"
                        style={{ backgroundColor: safeColor(b.color), color: textOn(b.color) }}
                      >
                        {b.label.trim() || "Button text"}
                      </span>
                    </div>
                  ) : b.type === "image" ? (
                    <ImageView block={b} uploading={uploading[b.id]} onDropFile={(f) => void upload(b.id, f)} onUpload={() => startUpload(b.id)} />
                  ) : b.type === "product" ? (
                    <ProductView block={b} />
                  ) : b.type === "divider" ? (
                    <div className="py-3">
                      <div className="h-px bg-[#e5e7eb]" />
                    </div>
                  ) : b.type === "spacer" ? (
                    <div className="flex items-center justify-center rounded-md border border-dashed border-transparent text-[11px] font-medium uppercase tracking-wide text-transparent group-hover/block:border-[#d5d7dd] group-hover/block:text-[#9ca3af]" style={{ height: b.size }}>
                      Space
                    </div>
                  ) : null}
                </Shell>
              ))}
            </SortableContext>
          </DndContext>

          <div className="mt-4 flex justify-center">
            <Popover open={endOpen} onOpenChange={setEndOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-[#6b7280] transition-colors hover:bg-[#f4f5f7] hover:text-[#1a1a2e]">
                  <Plus className="h-4 w-4" />
                  Add a block
                </button>
              </PopoverTrigger>
              <PopoverContent align="center" className={cn(pickerSurface, "w-[260px] p-1.5")}>
                <InsertList
                  items={INSERT_ITEMS}
                  active={-1}
                  onPick={(item) => {
                    setEndOpen(false)
                    const made = item.make()
                    const last = blocks[blocks.length - 1]
                    if (last && last.type === "text" && blank(last.html) && (made.type === "text" || made.type === "list")) pickInsert(item, last.id)
                    else addBlock(made, last?.id ?? null)
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── A block's frame: selection, its handle, its settings ───────────── */

function Shell({
  block,
  selected,
  issue,
  onSelect,
  onAddBelow,
  onKey,
  panel,
  children,
}: {
  block: Block
  selected: boolean
  issue?: string
  onSelect: () => void
  onAddBelow: () => void
  onKey: (e: React.KeyboardEvent<HTMLDivElement>) => void
  panel: React.ReactNode
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const text = block.type === "text" || block.type === "list"
  return (
    <div
      ref={setNodeRef}
      data-block-id={block.id}
      data-block-type={block.type}
      tabIndex={text ? undefined : 0}
      onKeyDown={onKey}
      onMouseDown={() => {
        if (!selected) onSelect()
      }}
      className={cn("group/block relative mb-2 rounded-lg outline-none", isDragging && "z-10 opacity-80")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {/* The handle, in the margin, on a computer. On a phone the toolbar moves blocks. */}
      <div className="absolute -left-11 top-1 hidden items-center opacity-0 transition-opacity duration-100 group-hover/block:opacity-100 group-focus-within/block:opacity-100 lg:flex">
        <button type="button" onClick={onAddBelow} className="inline-flex h-7 w-5 cursor-pointer items-center justify-center rounded text-[#9ca3af] hover:bg-[#f1f2f4] hover:text-[#4b5563]" aria-label="Add a block below">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="inline-flex h-7 w-5 cursor-grab items-center justify-center rounded text-[#9ca3af] hover:bg-[#f1f2f4] hover:text-[#4b5563] active:cursor-grabbing"
          aria-label="Drag to move"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        className={cn(
          "rounded-lg transition-shadow duration-100",
          !text && "cursor-pointer px-1",
          !text && !selected && "hover:shadow-[0_0_0_1px_#e3e4e8]",
          !text && selected && "shadow-[0_0_0_2px_#8b5cf6]",
          issue && "shadow-[0_0_0_2px_#d72c0d]",
        )}
      >
        {children}
      </div>
      {issue ? <p className="mt-1 text-[12px] text-[#b42318]">{issue}</p> : null}
      {panel}
    </div>
  )
}

function InsertList({ items, active, onPick }: { items: InsertItem[]; active: number; onPick: (i: InsertItem) => void }) {
  return (
    <div role="menu" aria-label="Blocks" className="max-h-[320px] overflow-y-auto overscroll-contain">
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(item)}
          className={cn(
            "flex min-h-[40px] w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[14px] text-[#1a1a2e] outline-none transition-colors duration-100 hover:bg-[#f4f4f6] focus-visible:bg-[#f1f1f4] sm:min-h-[34px] sm:text-[13px]",
            i === active && "bg-[#f1f1f4]",
          )}
        >
          <span className="font-medium">{item.label}</span>
          <span className="truncate text-[12px] text-[#9ca3af]">{item.hint}</span>
        </button>
      ))}
    </div>
  )
}

function StylePicker({ value, disabled, onPick }: { value: TextStyle | null; disabled: boolean; onPick: (s: TextStyle) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          className="inline-flex h-9 w-[112px] shrink-0 cursor-pointer items-center justify-between gap-1 rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f1f2f4] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent sm:h-8"
          aria-label="Text style"
        >
          <span className="truncate">{value ? STYLE_LABEL[value] : disabled ? "Text" : "List"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(pickerSurface, "w-[200px] p-1.5")} onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
        {(["p", "h1", "h2", "h3", "quote"] as TextStyle[]).map((s) => (
          <button
            key={s}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onPick(s)
              setOpen(false)
            }}
            className={cn(
              "flex w-full cursor-pointer items-center rounded-lg px-2.5 text-left text-[#1a1a2e] hover:bg-[#f4f4f6]",
              s === "p" && "min-h-[34px] text-[14px]",
              s === "h1" && "min-h-[40px] text-[20px] font-bold",
              s === "h2" && "min-h-[38px] text-[17px] font-bold",
              s === "h3" && "min-h-[36px] text-[15px] font-semibold",
              s === "quote" && "min-h-[34px] text-[14px] italic text-[#4b5563]",
              value === s && "bg-[#f1f1f4]",
            )}
          >
            {STYLE_LABEL[s]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function ImageView({ block, uploading, onDropFile, onUpload }: { block: ImageBlock; uploading?: string; onDropFile: (f: File) => void; onUpload: () => void }) {
  const [over, setOver] = React.useState(false)
  const src = safeImageSrc(block.src) || uploading
  if (!src) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) onDropFile(f)
        }}
        className={cn("flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center", over ? "border-[#8b5cf6] bg-[#f5f3ff]" : "border-[#d5d7dd] bg-[#fafbfb]")}
      >
        <button type="button" className={buttonSecondary} onClick={onUpload}>
          Upload an image
        </button>
        <p className="text-[12px] text-[#6b7280]">or drop one here</p>
      </div>
    )
  }
  return (
    <div className="py-1" style={{ textAlign: block.align }}>
      <img
        src={src}
        alt={block.alt}
        draggable={false}
        className={cn("inline-block h-auto max-w-full rounded-lg align-top", uploading && "opacity-50")}
        style={{ width: `${block.width}%` }}
      />
      {uploading ? <p className="mt-1 text-[12px] text-[#6b7280]">Uploading…</p> : null}
    </div>
  )
}

function ProductView({ block }: { block: Block & { type: "product" } }) {
  if (!block.productId) {
    return (
      <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-dashed border-[#d5d7dd] bg-[#fafbfb] px-4 text-[13px] text-[#6b7280]">
        Choose a product in the settings below
      </div>
    )
  }
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#e5e7eb] p-4">
      {block.imageUrl ? <img src={block.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover sm:h-24 sm:w-24" /> : null}
      <div className="min-w-0">
        <p className="truncate text-[17px] font-semibold leading-6 text-[#111827]">{block.title}</p>
        {block.price ? <p className="mb-3 text-[15px] text-[#4b5563]">{block.price}</p> : null}
        <span className="inline-block rounded-lg px-4 py-2 text-[14px] font-semibold" style={{ backgroundColor: safeColor(block.color), color: textOn(block.color) }}>
          {block.cta || "View product"}
        </span>
      </div>
    </div>
  )
}

export type { BlockType }
