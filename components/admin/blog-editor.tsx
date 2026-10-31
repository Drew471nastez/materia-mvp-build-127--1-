"use client"

import * as React from "react"

import type { Block, BlockType } from "@/lib/blog/blocks"
import { EMBED_PROVIDERS, embedTarget, parseChapter, youtubeIdFrom } from "@/lib/blog/embed"
import { blocksFromHtmlDocument, blocksFromPlainText, looksLikeImageUrl, pastedUrl } from "@/lib/blog/paste"
import { sanitizeInlineHtml, safeHref } from "@/lib/blog/sanitize"

export type { Block, BlockType }

/**
 * ===========================================================================
 *  THE BLOG'S BLOCK EDITOR
 * ===========================================================================
 * Writes exactly lib/blog/blocks.ts, which the article draws. A list of
 * blocks; text blocks are contentEditable, everything else is a small form.
 *
 *   "/" at the start of an empty line   the block menu, filtered as you type
 *   "## ", "- ", "1. ", "> ", "```"      a heading, a list, a quote, code
 *   Enter / Shift+Enter                  a new paragraph / a line break
 *   Backspace at the start               joins the line above; deletes an empty block
 *   Cmd B I U, Cmd Shift S, Cmd E, Cmd K bold, italic, underline, strike, code, link
 *   Alt Up / Alt Down                    move the block
 *   Cmd D                                duplicate the block
 *
 * Paste keeps structure and drops looks (lib/blog/paste.ts): Google Docs'
 * headings, lists, bold and links come through, its fonts and colours do
 * not. A pasted address becomes a link, or a YouTube, embed or image block
 * on an empty line.
 *
 * The dark console's own vocabulary (app/admin/_console/ui.tsx): #0b0b0f and
 * #111116, one hairline, violet only for focus and selection.
 */

/* ── Ids, defaults, the menu ──────────────────────────────────────────── */

export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const TEXT_TYPES = new Set<BlockType>(["p", "h2", "h3", "quote", "callout"])
const LIST_TYPES = new Set<BlockType>(["ul", "ol"])

export function blankBlock(type: BlockType): Block {
  const id = newBlockId()
  switch (type) {
    case "ul":
    case "ol":
      return { id, type, items: [""] }
    case "code":
      return { id, type, lang: "", text: "" }
    case "table":
      return { id, type, headers: ["", ""], rows: [["", ""], ["", ""]] }
    case "img":
    case "video":
      return { id, type, url: "", alt: "", caption: "" }
    case "youtube":
      return { id, type, videoId: "" }
    case "embed":
      return { id, type, url: "" }
    case "callout":
      return { id, type, tone: "note", html: "" }
    case "cta":
      return { id, type, title: "", body: "", label: "", url: "" }
    case "snippet":
      return { id, type, snippetId: "" }
    case "hr":
      return { id, type }
    default:
      return { id, type, html: "" }
  }
}

const MENU: { type: BlockType; label: string; hint: string; keys: string }[] = [
  { type: "p", label: "Text", hint: "A paragraph", keys: "paragraph text p" },
  { type: "h2", label: "Heading", hint: "A section, in the table of contents", keys: "heading h2 title section" },
  { type: "h3", label: "Subheading", hint: "A smaller heading", keys: "subheading h3" },
  { type: "ul", label: "Bulleted list", hint: "", keys: "bullet list ul unordered" },
  { type: "ol", label: "Numbered list", hint: "", keys: "numbered list ol ordered steps" },
  { type: "quote", label: "Quote", hint: "", keys: "quote blockquote" },
  { type: "callout", label: "Callout", hint: "A note, a tip or a warning", keys: "callout note tip warning box" },
  { type: "code", label: "Code", hint: "", keys: "code snippet pre" },
  { type: "table", label: "Table", hint: "", keys: "table grid rows columns" },
  { type: "hr", label: "Divider", hint: "", keys: "divider hr line separator" },
  { type: "img", label: "Image", hint: "Upload or paste an address", keys: "image picture photo img upload" },
  { type: "youtube", label: "YouTube", hint: "With chapters and a transcript", keys: "youtube video" },
  { type: "video", label: "Video file", hint: "An mp4 or webm address", keys: "video mp4 webm file" },
  { type: "embed", label: "Embed", hint: "Vimeo, Loom, X, Spotify, Figma, CodePen", keys: "embed vimeo loom x twitter spotify figma codepen iframe" },
  { type: "cta", label: "Call to action", hint: "A heading, a line and a button", keys: "cta button call action" },
  { type: "snippet", label: "Snippet", hint: "A reusable block from the library", keys: "snippet reusable library" },
]

function menuMatches(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return MENU
  return MENU.filter((m) => m.label.toLowerCase().includes(q) || m.keys.includes(q))
}

/* ── Caret helpers ────────────────────────────────────────────────────── */

function placeCaret(el: HTMLElement, where: "start" | "end") {
  el.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(where === "start")
  sel.removeAllRanges()
  sel.addRange(range)
}

function caretAtEdge(el: HTMLElement, edge: "start" | "end"): boolean {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false
  const r = sel.getRangeAt(0)
  if (!el.contains(r.startContainer)) return false
  const probe = document.createRange()
  probe.selectNodeContents(el)
  if (edge === "start") probe.setEnd(r.startContainer, r.startOffset)
  else probe.setStart(r.endContainer, r.endOffset)
  return probe.toString().length === 0
}

/** Everything after the caret, taken out of `el`, as HTML. */
function extractAfterCaret(el: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return ""
  const r = sel.getRangeAt(0)
  r.deleteContents()
  const tail = document.createRange()
  tail.setStart(r.endContainer, r.endOffset)
  tail.setEnd(el, el.childNodes.length)
  const box = document.createElement("div")
  box.appendChild(tail.extractContents())
  return box.innerHTML
}

function cleanEmpty(el: HTMLElement) {
  if (el.innerHTML === "<br>" || el.innerHTML === "<div><br></div>") el.innerHTML = ""
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

export function cx(...p: (string | false | null | undefined)[]) {
  return p.filter(Boolean).join(" ")
}

/* ── The API every block is handed ────────────────────────────────────── */

interface EditorApi {
  update: (id: string, patch: Partial<Block>) => void
  insertAfter: (id: string | null, blocks: Block[], focus?: "start" | "end") => void
  replaceWith: (id: string, blocks: Block[], focus?: "start" | "end") => void
  remove: (id: string, focusPrev?: boolean) => void
  move: (id: string, dir: -1 | 1) => void
  duplicate: (id: string) => void
  convert: (id: string, type: BlockType) => void
  mergeIntoPrevious: (id: string, html: string) => boolean
  focusNeighbour: (id: string, dir: -1 | 1) => boolean
  openSlash: (id: string, query: string, rect: DOMRect) => void
  closeSlash: () => void
  slashKey: (e: React.KeyboardEvent) => boolean
  uploadInto: (id: string, file: File) => void
  registerSync: (id: string, fn: () => void) => () => void
}

const ApiContext = React.createContext<EditorApi | null>(null)
const useApi = () => React.useContext(ApiContext)!

/* ── Rich text (p, h2, h3, quote, callout) ────────────────────────────── */

const TEXT_STYLE: Record<string, string> = {
  p: "text-[16px] leading-[1.7] text-[#dcdce2]",
  h2: "text-[24px] max-md:!text-[22px] leading-[1.3] font-semibold tracking-[-0.01em] text-[#ededf0]",
  h3: "text-[19px] max-md:!text-[18px] leading-[1.35] font-semibold text-[#ededf0]",
  quote: "border-l-2 border-white/25 pl-4 text-[17px] max-md:!text-[17px] leading-[1.65] italic text-[#c9c9d1]",
  callout: "text-[15px] leading-[1.6] text-[#dcdce2]",
}
const PLACEHOLDER: Record<string, string> = { p: "Type / for blocks", h2: "Heading", h3: "Subheading", quote: "Quote", callout: "Write the note" }
const INLINE_CSS =
  "[&_a]:text-[#c4b5fd] [&_a]:underline [&_a]:decoration-[#c4b5fd]/40 [&_a]:underline-offset-2 [&_code]:rounded-[4px] [&_code]:bg-white/[0.08] [&_code]:px-1 [&_code]:py-[1px] [&_code]:font-mono [&_code]:text-[0.88em] [&_b]:font-semibold [&_b]:text-[#ededf0]"

const MARKDOWN: { re: RegExp; type: BlockType }[] = [
  { re: /^###\s$/, type: "h3" },
  { re: /^##\s$/, type: "h2" },
  { re: /^[-*]\s$/, type: "ul" },
  { re: /^1[.)]\s$/, type: "ol" },
  { re: /^>\s$/, type: "quote" },
  { re: /^```$/, type: "code" },
  { re: /^---$/, type: "hr" },
]

function RichText({ block, alwaysPlaceholder }: { block: Block; alwaysPlaceholder?: boolean }) {
  const api = useApi()
  const ref = React.useRef<HTMLDivElement>(null)
  const html = block.html ?? ""

  React.useLayoutEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== html && document.activeElement !== el) el.innerHTML = html
  }, [html])

  const sync = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    cleanEmpty(el)
    api.update(block.id, { html: el.innerHTML })
  }, [api, block.id])

  React.useEffect(() => api.registerSync(block.id, sync), [api, block.id, sync])

  function onInput() {
    const el = ref.current!
    cleanEmpty(el)
    const t = (el.textContent ?? "").replace(/\u00a0/g, " ")
    if (block.type === "p" && el.children.length === 0) {
      for (const m of MARKDOWN) {
        if (m.re.test(t)) {
          const fresh = blankBlock(m.type)
          if (m.type === "hr") api.replaceWith(block.id, [fresh, blankBlock("p")], "end")
          else api.replaceWith(block.id, [fresh], "start")
          return
        }
      }
    }
    if (block.type === "p" && /^\/[a-z0-9 ]{0,24}$/i.test(t) && el.children.length === 0) api.openSlash(block.id, t.slice(1), el.getBoundingClientRect())
    else api.closeSlash()
    api.update(block.id, { html: el.innerHTML })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = ref.current!
    if (api.slashKey(e)) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase()
      if ((k === "b" || k === "i" || k === "u") && !e.shiftKey) {
        e.preventDefault()
        document.execCommand(k === "b" ? "bold" : k === "i" ? "italic" : "underline")
        sync()
        return
      }
      if (k === "s" && e.shiftKey) {
        e.preventDefault()
        document.execCommand("strikeThrough")
        sync()
        return
      }
      if (k === "e") {
        e.preventDefault()
        toggleInlineCode()
        sync()
        return
      }
      if (k === "k") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("blog-editor:link"))
        return
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      const after = sanitizeInlineHtml(extractAfterCaret(el))
      cleanEmpty(el)
      api.update(block.id, { html: el.innerHTML })
      /* An empty quote or callout line ends it, the way an empty list item ends a list. */
      if ((block.type === "quote" || block.type === "callout") && !el.textContent && !after) {
        api.replaceWith(block.id, [blankBlock("p")], "start")
        return
      }
      api.insertAfter(block.id, [{ ...blankBlock("p"), html: after }], "start")
      return
    }
    if (e.key === "Backspace" && caretAtEdge(el, "start")) {
      if (!el.textContent) {
        e.preventDefault()
        if (block.type !== "p") api.convert(block.id, "p")
        else api.remove(block.id, true)
        return
      }
      if (api.mergeIntoPrevious(block.id, el.innerHTML)) e.preventDefault()
      return
    }
    if (e.key === "ArrowUp" && !e.shiftKey && caretAtEdge(el, "start") && api.focusNeighbour(block.id, -1)) e.preventDefault()
    if (e.key === "ArrowDown" && !e.shiftKey && caretAtEdge(el, "end") && api.focusNeighbour(block.id, 1)) e.preventDefault()
  }

  const placeholder = PLACEHOLDER[block.type] ?? ""
  return (
    <div
      ref={ref}
      data-rt={block.id}
      role="textbox"
      aria-multiline="true"
      aria-label={block.type === "p" ? "Paragraph" : placeholder}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={(e) => handlePaste(e, block, ref.current!, api, sync)}
      onBlur={() => {
        const el = ref.current
        if (!el) return
        const clean = sanitizeInlineHtml(el.innerHTML)
        if (clean !== el.innerHTML) el.innerHTML = clean
        api.update(block.id, { html: clean })
      }}
      data-placeholder={placeholder}
      className={cx(
        "min-h-[1.6em] whitespace-pre-wrap break-words outline-none",
        TEXT_STYLE[block.type],
        INLINE_CSS,
        alwaysPlaceholder || block.type !== "p"
          ? "empty:before:text-[#5c5c66] empty:before:content-[attr(data-placeholder)]"
          : "focus:empty:before:text-[#5c5c66] focus:empty:before:content-[attr(data-placeholder)]",
      )}
    />
  )
}

function toggleInlineCode() {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  let n: Node | null = range.commonAncestorContainer
  while (n && !(n instanceof HTMLElement && n.dataset.rt)) {
    if (n instanceof HTMLElement && n.tagName === "CODE") {
      const parent = n.parentNode!
      while (n.firstChild) parent.insertBefore(n.firstChild, n)
      parent.removeChild(n)
      return
    }
    n = n.parentNode
  }
  if (range.collapsed) return
  const code = document.createElement("code")
  code.textContent = range.toString()
  range.deleteContents()
  range.insertNode(code)
  sel.removeAllRanges()
  const after = document.createRange()
  after.selectNodeContents(code)
  sel.addRange(after)
}

/* ── Paste ────────────────────────────────────────────────────────────── */

function handlePaste(e: React.ClipboardEvent, block: Block, el: HTMLElement, api: EditorApi, sync: () => void) {
  const cd = e.clipboardData
  const files = Array.from(cd.files ?? []).filter((f) => f.type.startsWith("image/"))
  if (files.length) {
    e.preventDefault()
    for (const f of files) {
      const img = blankBlock("img")
      api.insertAfter(block.id, [img])
      api.uploadInto(img.id, f)
    }
    return
  }
  const html = cd.getData("text/html")
  const plain = cd.getData("text/plain")
  const url = pastedUrl(plain)
  const empty = !(el.textContent ?? "").trim()
  if (url) {
    e.preventDefault()
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) {
      document.execCommand("createLink", false, url)
      sync()
      return
    }
    if (empty && block.type === "p") {
      const yt = youtubeIdFrom(url)
      if (yt) return api.replaceWith(block.id, [{ ...blankBlock("youtube"), videoId: yt }])
      const target = embedTarget(url)
      if (target) return api.replaceWith(block.id, [{ ...blankBlock("embed"), url, provider: target.provider }])
      if (looksLikeImageUrl(url)) return api.replaceWith(block.id, [{ ...blankBlock("img"), url }])
    }
    const safe = safeHref(url)
    if (safe) document.execCommand("insertHTML", false, `<a href="${safe.replace(/"/g, "&quot;")}">${url.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</a>&nbsp;`)
    sync()
    return
  }
  e.preventDefault()
  const blocks = html ? blocksFromHtmlDocument(new DOMParser().parseFromString(html, "text/html"), newBlockId) : blocksFromPlainText(plain, newBlockId)
  if (!blocks.length) return
  /* One line of text goes in at the caret, as it would in any text field. */
  if (blocks.length === 1 && blocks[0].type === "p") {
    document.execCommand("insertHTML", false, blocks[0].html ?? "")
    sync()
    return
  }
  if (empty) api.replaceWith(block.id, blocks, "end")
  else api.insertAfter(block.id, blocks, "end")
}

/* ── Lists ────────────────────────────────────────────────────────────── */

function ListBlock({ block }: { block: Block }) {
  const api = useApi()
  const ref = React.useRef<HTMLElement>(null)
  const items = block.items?.length ? block.items : [""]
  const html = items.map((i) => `<li>${i || "<br>"}</li>`).join("")

  const read = React.useCallback((): string[] => {
    const el = ref.current
    if (!el) return [""]
    const out = Array.from(el.children)
      .filter((c) => c.tagName === "LI")
      .map((li) => (li.innerHTML === "<br>" ? "" : li.innerHTML))
    return out.length ? out : [""]
  }, [])

  React.useLayoutEffect(() => {
    const el = ref.current
    /* Written here and never by React, so typing is never interrupted by a re-render putting the same list back. */
    if (el && (!el.firstElementChild || (document.activeElement !== el && JSON.stringify(read()) !== JSON.stringify(items)))) el.innerHTML = html
  }, [html, items, read])

  const sync = React.useCallback(() => api.update(block.id, { items: read() }), [api, block.id, read])
  React.useEffect(() => api.registerSync(block.id, sync), [api, block.id, sync])

  function currentLi(): HTMLLIElement | null {
    let n = window.getSelection()?.anchorNode ?? null
    while (n && n !== ref.current) {
      if (n instanceof HTMLLIElement) return n
      n = n.parentNode
    }
    return null
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const el = ref.current!
    const mod = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    if (mod && !e.shiftKey && (k === "b" || k === "i" || k === "u")) {
      e.preventDefault()
      document.execCommand(k === "b" ? "bold" : k === "i" ? "italic" : "underline")
      sync()
      return
    }
    if (mod && k === "k") {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent("blog-editor:link"))
      return
    }
    const li = currentLi()
    if (e.key === "Enter" && !e.shiftKey && li && !(li.textContent ?? "").trim()) {
      /* Enter on an empty item ends the list with a paragraph. */
      e.preventDefault()
      li.remove()
      api.update(block.id, { items: read() })
      api.insertAfter(block.id, [blankBlock("p")], "start")
      return
    }
    if (e.key === "Backspace" && li && li === el.firstElementChild && caretAtEdge(li, "start")) {
      e.preventDefault()
      const rest = read()
      if (rest.length === 1) api.convert(block.id, "p")
      else api.replaceWith(block.id, [{ ...blankBlock("p"), html: rest[0] }, { ...block, items: rest.slice(1) }], "start")
      return
    }
    if (e.key === "ArrowUp" && li && li === el.firstElementChild && caretAtEdge(li, "start") && api.focusNeighbour(block.id, -1)) e.preventDefault()
    if (e.key === "ArrowDown" && li && li === el.lastElementChild && caretAtEdge(li, "end") && api.focusNeighbour(block.id, 1)) e.preventDefault()
  }

  const Tag = block.type === "ol" ? "ol" : "ul"
  return (
    <Tag
      ref={ref as React.Ref<HTMLUListElement & HTMLOListElement>}
      data-rt={block.id}
      contentEditable
      suppressContentEditableWarning
      onInput={sync}
      onKeyDown={onKeyDown}
      onPaste={(e) => {
        const plain = e.clipboardData.getData("text/plain")
        const rich = e.clipboardData.getData("text/html")
        const url = pastedUrl(plain)
        e.preventDefault()
        if (url) document.execCommand("createLink", false, url)
        else {
          const blocks = rich ? blocksFromHtmlDocument(new DOMParser().parseFromString(rich, "text/html"), newBlockId) : blocksFromPlainText(plain, newBlockId)
          const lines = blocks.flatMap((b) => b.items ?? (b.html ? [b.html] : []))
          document.execCommand("insertHTML", false, lines.join("</li><li>"))
        }
        sync()
      }}
      onBlur={sync}
      className={cx("space-y-1 pl-6 text-[16px] leading-[1.7] text-[#dcdce2] outline-none marker:text-[#6b6b76]", Tag === "ol" ? "list-decimal" : "list-disc", INLINE_CSS)}
    />
  )
}

/* ── Small form controls, in the console's look ───────────────────────── */

export const fieldCls =
  "w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[13px] text-[#ededf0] outline-none placeholder:text-[#5c5c66] focus:border-[#8b5cf6]/70"

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, "h-9", props.className)} />
}

function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldCls, "resize-y py-2 leading-5", props.className)} />
}

function Label({ children, warn }: { children: React.ReactNode; warn?: React.ReactNode }) {
  return (
    <span className="mb-1 flex items-baseline justify-between gap-2 text-[12px] text-[#9b9ba6]">
      <span>{children}</span>
      {warn ? <span className="text-[#d4a72c]">{warn}</span> : null}
    </span>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-[10px] border border-white/[0.08] bg-[#0b0b0f] p-3", className)}>{children}</div>
}

function SmallButton({ children, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cx("inline-flex h-8 items-center gap-1 rounded-[7px] border border-white/[0.1] bg-[#17171d] px-2.5 text-[12px] text-[#ededf0] outline-none hover:bg-[#1d1d24] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70 disabled:opacity-50", className)}
    >
      {children}
    </button>
  )
}

/* ── Media and the other blocks ───────────────────────────────────────── */

function ImageBlock({ block, uploading }: { block: Block; uploading: boolean }) {
  const api = useApi()
  const [broken, setBroken] = React.useState(false)
  const [drag, setDrag] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Block>) => api.update(block.id, patch)
  const altMissing = Boolean(block.url) && !(block.alt ?? "").trim()
  return (
    <Card>
      {block.url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.url} alt={block.alt || ""} onError={() => setBroken(true)} className="mx-auto max-h-[420px] w-auto max-w-full rounded-[6px]" />
      ) : (
        <div
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return
            e.preventDefault()
            e.stopPropagation()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            const f = e.dataTransfer.files?.[0]
            if (!f) return
            e.preventDefault()
            e.stopPropagation()
            setDrag(false)
            api.uploadInto(block.id, f)
          }}
          className={cx("flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed px-4 py-6 text-center", drag ? "border-[#8b5cf6]/70 bg-[#8b5cf6]/[0.06]" : "border-white/[0.12]")}
        >
          {broken ? <p className="text-[13px] text-[#f47067]">This picture did not load. Check the address or upload it.</p> : null}
          <p className="text-[13px] text-[#9b9ba6]">{uploading ? "Uploading…" : "Drop a picture here, paste one, or"}</p>
          <SmallButton disabled={uploading} onClick={() => fileRef.current?.click()}>
            Upload
          </SmallButton>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) api.uploadInto(block.id, f)
              e.target.value = ""
            }}
          />
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <Label>Address</Label>
          <Input
            value={block.url ?? ""}
            placeholder="https://…"
            onChange={(e) => {
              setBroken(false)
              set({ url: e.target.value.trim() })
            }}
          />
        </label>
        <label className="block">
          <Label warn={altMissing ? "Required" : null}>Alt text</Label>
          <Input value={block.alt ?? ""} placeholder="What the picture shows" onChange={(e) => set({ alt: e.target.value })} aria-invalid={altMissing} className={altMissing ? "border-[#d4a72c]/60" : ""} />
        </label>
        <label className="block">
          <Label>Caption</Label>
          <Input value={block.caption ?? ""} placeholder="Optional" onChange={(e) => set({ caption: e.target.value })} />
        </label>
      </div>
      {altMissing ? <p className="mt-2 text-[12px] text-[#d4a72c]">Add alt text: screen readers read it aloud, and search engines read it for Images.</p> : null}
    </Card>
  )
}

function YouTubeBlock({ block }: { block: Block }) {
  const api = useApi()
  const [raw, setRaw] = React.useState(block.videoId ? `https://www.youtube.com/watch?v=${block.videoId}` : "")
  const [open, setOpen] = React.useState(Boolean(block.chapters?.length || block.transcript || block.uploadDate))
  const set = (patch: Partial<Block>) => api.update(block.id, patch)
  const id = block.videoId
  const bad = (block.chapters ?? []).filter((c) => c.trim() && !parseChapter(c))
  return (
    <Card>
      <label className="block">
        <Label warn={raw && !youtubeIdFrom(raw) ? "Not a YouTube address" : null}>YouTube address</Label>
        <Input
          value={raw}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={(e) => {
            setRaw(e.target.value)
            set({ videoId: youtubeIdFrom(e.target.value) ?? "" })
          }}
        />
      </label>
      {id ? (
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="h-[68px] w-[120px] shrink-0 rounded-[6px] object-cover" />
          <p className="min-w-0 text-[12px] text-[#9b9ba6]">
            Video <span className="font-mono text-[#ededf0]">{id}</span>
          </p>
        </div>
      ) : null}
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 text-[12px] text-[#9b9ba6] underline decoration-white/20 underline-offset-2 hover:text-[#ededf0]">
        {open ? "Hide chapters and transcript" : "Chapters and transcript"}
      </button>
      {open ? (
        <div className="mt-2 grid gap-2">
          <label className="block">
            <Label warn={bad.length ? `${bad.length} line${bad.length > 1 ? "s" : ""} not "m:ss Title"` : null}>Chapters, one per line</Label>
            <Area rows={4} value={(block.chapters ?? []).join("\n")} placeholder={"0:00 Intro\n1:30 Setting up the store"} onChange={(e) => set({ chapters: e.target.value.split("\n") })} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <Label>Video title on YouTube</Label>
              <Input value={block.title ?? ""} placeholder="Optional, the caption is used when empty" onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="block">
              <Label warn={block.uploadDate && Number.isNaN(Date.parse(block.uploadDate)) ? "Use YYYY-MM-DD" : null}>Upload date</Label>
              <Input type="date" value={(block.uploadDate ?? "").slice(0, 10)} onChange={(e) => set({ uploadDate: e.target.value })} />
            </label>
          </div>
          <p className="text-[12px] text-[#9b9ba6]">With an upload date, search engines are told this is a video (from YouTube Studio, Details).</p>
          <label className="block">
            <Label>Transcript</Label>
            <Area rows={5} value={block.transcript ?? ""} placeholder="Shown collapsed under the video" onChange={(e) => set({ transcript: e.target.value })} />
          </label>
        </div>
      ) : null}
    </Card>
  )
}

function VideoBlock({ block }: { block: Block }) {
  const api = useApi()
  const set = (patch: Partial<Block>) => api.update(block.id, patch)
  const ok = /^(https?:\/\/\S+|\/\S+)\.(mp4|webm|mov)(\?|#|$)/i.test(block.url ?? "")
  return (
    <Card>
      {block.url && ok ? <video src={block.url} controls preload="metadata" className="mb-3 max-h-[360px] w-full rounded-[6px] bg-black" /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <Label warn={block.url && !ok ? "An .mp4 or .webm address" : null}>Video file address</Label>
          <Input value={block.url ?? ""} placeholder="https://…/clip.mp4" onChange={(e) => set({ url: e.target.value.trim() })} />
        </label>
        <label className="block">
          <Label warn={block.url && !(block.alt ?? "").trim() ? "Recommended" : null}>Description</Label>
          <Input value={block.alt ?? ""} placeholder="What happens in it" onChange={(e) => set({ alt: e.target.value })} />
        </label>
        <label className="block">
          <Label>Caption</Label>
          <Input value={block.caption ?? ""} placeholder="Optional" onChange={(e) => set({ caption: e.target.value })} />
        </label>
      </div>
    </Card>
  )
}

function EmbedBlock({ block }: { block: Block }) {
  const api = useApi()
  const target = block.url ? embedTarget(block.url) : null
  return (
    <Card>
      <label className="block">
        <Label warn={block.url && !target ? "Not on the list: shown as a link" : null}>Address to embed</Label>
        <Input
          value={block.url ?? ""}
          placeholder="https://vimeo.com/…"
          onChange={(e) => {
            const url = e.target.value.trim()
            api.update(block.id, { url, provider: embedTarget(url)?.provider })
          }}
        />
      </label>
      <p className="mt-2 text-[12px] text-[#6b6b76]">
        {target ? <>Drawn as a {EMBED_PROVIDERS[target.provider].label} embed.</> : <>Embeds from {Object.values(EMBED_PROVIDERS).map((p) => p.label).join(", ")}.</>}
      </p>
      <label className="mt-2 block">
        <Label>Caption</Label>
        <Input value={block.caption ?? ""} placeholder="Optional" onChange={(e) => api.update(block.id, { caption: e.target.value })} />
      </label>
    </Card>
  )
}

const TONES: { id: NonNullable<Block["tone"]>; label: string; colour: string }[] = [
  { id: "note", label: "Note", colour: "#9b9ba6" },
  { id: "tip", label: "Tip", colour: "#3fb950" },
  { id: "warning", label: "Warning", colour: "#d4a72c" },
]

function CalloutBlock({ block }: { block: Block }) {
  const api = useApi()
  const tone = TONES.find((t) => t.id === block.tone) ?? TONES[0]
  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.025] px-4 py-3" style={{ borderLeftColor: tone.colour, borderLeftWidth: 2 }}>
      <div className="mb-1.5 flex gap-1" role="radiogroup" aria-label="Callout kind">
        {TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === tone.id}
            onClick={() => api.update(block.id, { tone: t.id })}
            className={cx("h-6 rounded-[6px] px-2 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70", t.id === tone.id ? "bg-white/[0.08] text-[#ededf0]" : "text-[#6b6b76] hover:text-[#ededf0]")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <RichText block={block} />
    </div>
  )
}

function CtaBlock({ block }: { block: Block }) {
  const api = useApi()
  const set = (patch: Partial<Block>) => api.update(block.id, patch)
  const urlBad = Boolean(block.url) && !safeHref(block.url)
  return (
    <Card className="grid gap-2 sm:grid-cols-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#6b6b76] sm:col-span-2">Call to action</p>
      <label className="block sm:col-span-2">
        <Label>Heading</Label>
        <Input value={block.title ?? ""} placeholder="Start selling on Storelib" onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="block sm:col-span-2">
        <Label>Line under it</Label>
        <Input value={block.body ?? ""} placeholder="Optional" onChange={(e) => set({ body: e.target.value })} />
      </label>
      <label className="block">
        <Label>Button</Label>
        <Input value={block.label ?? ""} placeholder="Create your store" onChange={(e) => set({ label: e.target.value })} />
      </label>
      <label className="block">
        <Label warn={urlBad ? "Not an address" : null}>Goes to</Label>
        <Input value={block.url ?? ""} placeholder="/signup" onChange={(e) => set({ url: e.target.value.trim() })} />
      </label>
    </Card>
  )
}

export interface SnippetOption {
  id: string
  name: string
  blocks: Block[]
}

function SnippetBlock({ block, snippets, note }: { block: Block; snippets: SnippetOption[]; note?: string | null }) {
  const api = useApi()
  const chosen = snippets.find((s) => s.id === block.snippetId)
  return (
    <Card>
      <label className="block">
        <Label warn={block.snippetId && !chosen ? "Deleted from the library" : null}>Snippet</Label>
        <select value={block.snippetId ?? ""} onChange={(e) => api.update(block.id, { snippetId: e.target.value })} className={cx(fieldCls, "h-9")} disabled={!snippets.length}>
          <option value="">{snippets.length ? "Choose from the library" : "The library is empty"}</option>
          {snippets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {chosen ? (
        <p className="mt-2 text-[12px] text-[#9b9ba6]">
          {chosen.blocks.length} block{chosen.blocks.length === 1 ? "" : "s"}. A change in the library shows in every post that places it.
        </p>
      ) : null}
      <p className="mt-2 text-[12px] text-[#6b6b76]">
        {note ?? (
          <a href="/admin/blog/library?tab=snippets" target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-[#ededf0]">
            Open the snippet library
          </a>
        )}
      </p>
    </Card>
  )
}

function CodeBlock({ block }: { block: Block }) {
  const api = useApi()
  return (
    <div className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0b0b0f]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-1">
        <input
          value={block.lang ?? ""}
          onChange={(e) => api.update(block.id, { lang: e.target.value })}
          placeholder="language"
          aria-label="Language"
          className="h-7 w-32 bg-transparent font-mono text-[12px] text-[#9b9ba6] outline-none placeholder:text-[#5c5c66]"
        />
      </div>
      <textarea
        value={block.text ?? ""}
        onChange={(e) => api.update(block.id, { text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault()
            const t = e.currentTarget
            const { selectionStart: a, selectionEnd: b, value } = t
            api.update(block.id, { text: `${value.slice(0, a)}  ${value.slice(b)}` })
            requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2))
          }
          if (e.key === "Backspace" && !e.currentTarget.value) {
            e.preventDefault()
            api.remove(block.id, true)
          }
        }}
        spellCheck={false}
        rows={Math.min(24, Math.max(3, (block.text ?? "").split("\n").length + 1))}
        placeholder="Code"
        aria-label="Code"
        className="block w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[13px] leading-[1.6] text-[#c9f5d4] outline-none placeholder:text-[#5c5c66]"
      />
    </div>
  )
}

function TableBlock({ block }: { block: Block }) {
  const api = useApi()
  const headers = block.headers?.length ? block.headers : [""]
  const rows = block.rows ?? []
  const cols = headers.length
  const set = (h: string[], r: string[][]) => api.update(block.id, { headers: h, rows: r })
  const cell = "h-9 w-full min-w-[110px] bg-transparent px-2.5 text-[13px] text-[#dcdce2] outline-none placeholder:text-[#5c5c66] focus:bg-white/[0.04]"
  return (
    <div className="rounded-[10px] border border-white/[0.08] bg-[#0b0b0f]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map((h, ci) => (
                <th key={ci} className="border-b border-r border-white/[0.08] p-0 last:border-r-0">
                  <input value={h} placeholder={`Column ${ci + 1}`} aria-label={`Column ${ci + 1} heading`} onChange={(e) => set(headers.map((x, i) => (i === ci ? e.target.value : x)), rows)} className={cx(cell, "font-semibold text-[#ededf0]")} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {Array.from({ length: cols }, (_, ci) => (
                  <td key={ci} className="border-b border-r border-white/[0.06] p-0 last:border-r-0">
                    <input
                      value={r[ci] ?? ""}
                      aria-label={`Row ${ri + 1}, column ${ci + 1}`}
                      onChange={(e) => set(headers, rows.map((row, i) => (i === ri ? Array.from({ length: cols }, (_, c) => (c === ci ? e.target.value : row[c] ?? "")) : row)))}
                      className={cell}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2">
        <SmallButton onClick={() => set(headers, [...rows, Array(cols).fill("")])}>Add row</SmallButton>
        <SmallButton disabled={!rows.length} onClick={() => set(headers, rows.slice(0, -1))}>Remove row</SmallButton>
        <SmallButton disabled={cols >= 8} onClick={() => set([...headers, ""], rows.map((r) => [...r, ""]))}>Add column</SmallButton>
        <SmallButton disabled={cols <= 1} onClick={() => set(headers.slice(0, -1), rows.map((r) => r.slice(0, cols - 1)))}>Remove column</SmallButton>
        <input value={block.caption ?? ""} onChange={(e) => api.update(block.id, { caption: e.target.value })} placeholder="Caption" aria-label="Table caption" className={cx(fieldCls, "h-8 min-w-[140px] flex-1")} />
      </div>
    </div>
  )
}

/* ── One block, with its handle ───────────────────────────────────────── */

const BlockRow = React.memo(function BlockRow({
  block,
  index,
  count,
  uploading,
  snippets,
  snippetsNote,
  drop,
  dragging,
  onDragStartId,
  onDragOverId,
  onDropId,
}: {
  block: Block
  index: number
  count: number
  uploading: boolean
  snippets: SnippetOption[]
  snippetsNote?: string | null
  drop: "before" | "after" | null
  dragging: boolean
  onDragStartId: (id: string | null) => void
  onDragOverId: (id: string, pos: "before" | "after") => void
  onDropId: (id: string) => void
}) {
  const api = useApi()
  const [menu, setMenu] = React.useState(false)
  const rowRef = React.useRef<HTMLDivElement>(null)
  const first = index === 0

  let content: React.ReactNode = null
  switch (block.type) {
    case "p":
    case "h2":
    case "h3":
    case "quote":
      content = <RichText block={block} alwaysPlaceholder={first && count === 1} />
      break
    case "callout":
      content = <CalloutBlock block={block} />
      break
    case "ul":
    case "ol":
      content = <ListBlock block={block} />
      break
    case "code":
      content = <CodeBlock block={block} />
      break
    case "table":
      content = <TableBlock block={block} />
      break
    case "img":
      content = <ImageBlock block={block} uploading={uploading} />
      break
    case "youtube":
      content = <YouTubeBlock block={block} />
      break
    case "video":
      content = <VideoBlock block={block} />
      break
    case "embed":
      content = <EmbedBlock block={block} />
      break
    case "cta":
      content = <CtaBlock block={block} />
      break
    case "snippet":
      content = <SnippetBlock block={block} snippets={snippets} note={snippetsNote} />
      break
    case "hr":
      content = (
        <div
          tabIndex={0}
          data-hr={block.id}
          aria-label="Divider"
          onKeyDown={(e) => {
            if (e.key === "Backspace" || e.key === "Delete") {
              e.preventDefault()
              api.remove(block.id, true)
            }
          }}
          className="rounded-[4px] py-3 outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/50"
        >
          <hr className="border-white/[0.14]" />
        </div>
      )
      break
  }

  const spacing = first ? "" : block.type === "h2" ? "pt-7" : block.type === "h3" ? "pt-5" : TEXT_TYPES.has(block.type) && block.type !== "callout" ? "pt-2" : LIST_TYPES.has(block.type) ? "pt-2" : "pt-4"
  const handleTop = block.type === "h2" ? (first ? 2 : 30) : block.type === "h3" ? (first ? 0 : 20) : first ? 0 : TEXT_TYPES.has(block.type) || LIST_TYPES.has(block.type) ? 8 : 16

  return (
    <div
      ref={rowRef}
      data-block={block.id}
      data-type={block.type}
      onDragOver={(e) => {
        if (!dragging) return
        e.preventDefault()
        const r = rowRef.current!.getBoundingClientRect()
        onDragOverId(block.id, e.clientY < r.top + r.height / 2 ? "before" : "after")
      }}
      onDrop={(e) => {
        if (!dragging) return
        e.preventDefault()
        onDropId(block.id)
      }}
      className={cx("group/block relative", spacing)}
    >
      {drop ? <div aria-hidden className={cx("pointer-events-none absolute -left-2 -right-2 z-10 h-[2px] rounded-full bg-[#8b5cf6]", drop === "before" ? "top-0" : "-bottom-[1px]")} /> : null}
      <div className="absolute -left-7 z-20 sm:-left-9" style={{ top: handleTop }}>
        <button
          type="button"
          draggable
          aria-label={`Block ${index + 1} of ${count}: move, duplicate or delete`}
          aria-haspopup="menu"
          aria-expanded={menu}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move"
            e.dataTransfer.setData("text/plain", "")
            if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 16, 16)
            onDragStartId(block.id)
          }}
          onDragEnd={() => onDragStartId(null)}
          onClick={() => setMenu((m) => !m)}
          className={cx(
            "flex h-7 w-6 cursor-grab items-center justify-center rounded-[6px] text-[#6b6b76] outline-none transition-opacity hover:bg-white/[0.06] hover:text-[#ededf0] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70 active:cursor-grabbing",
            menu ? "bg-white/[0.06] opacity-100" : "opacity-50 sm:opacity-0 sm:group-hover/block:opacity-100 sm:group-focus-within/block:opacity-100",
          )}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
            <circle cx="2.5" cy="2.5" r="1.3" />
            <circle cx="7.5" cy="2.5" r="1.3" />
            <circle cx="2.5" cy="7" r="1.3" />
            <circle cx="7.5" cy="7" r="1.3" />
            <circle cx="2.5" cy="11.5" r="1.3" />
            <circle cx="7.5" cy="11.5" r="1.3" />
          </svg>
        </button>
        {menu ? <BlockMenu block={block} index={index} count={count} onClose={() => setMenu(false)} /> : null}
      </div>
      {content}
    </div>
  )
})

function BlockMenu({ block, index, count, onClose }: { block: Block; index: number; count: number; onClose: () => void }) {
  const api = useApi()
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", esc)
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
    return () => {
      document.removeEventListener("mousedown", away)
      document.removeEventListener("keydown", esc)
    }
  }, [onClose])
  const turnable = TEXT_TYPES.has(block.type) || LIST_TYPES.has(block.type)
  const item = "flex h-8 w-full items-center justify-between gap-6 rounded-[6px] px-2.5 text-left text-[13px] text-[#ededf0] outline-none hover:bg-white/[0.06] focus-visible:bg-white/[0.08] disabled:opacity-40"
  const kbd = "text-[11px] text-[#6b6b76]"
  const alt = isMac() ? "⌥" : "Alt "
  const cmd = isMac() ? "⌘" : "Ctrl "
  const act = (fn: () => void) => () => {
    onClose()
    fn()
  }
  return (
    <div ref={ref} role="menu" className="absolute left-0 top-8 z-30 w-[230px] rounded-[10px] border border-white/[0.1] bg-[#17171d] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
      <button role="menuitem" type="button" className={item} disabled={index === 0} onClick={act(() => api.move(block.id, -1))}>
        Move up <span className={kbd}>{alt}↑</span>
      </button>
      <button role="menuitem" type="button" className={item} disabled={index === count - 1} onClick={act(() => api.move(block.id, 1))}>
        Move down <span className={kbd}>{alt}↓</span>
      </button>
      <button role="menuitem" type="button" className={item} onClick={act(() => api.duplicate(block.id))}>
        Duplicate <span className={kbd}>{cmd}D</span>
      </button>
      {turnable ? (
        <>
          <p className="px-2.5 pb-1 pt-2 text-[11px] text-[#6b6b76]">Turn into</p>
          <div className="flex flex-wrap gap-1 px-1.5 pb-1.5">
            {(["p", "h2", "h3", "ul", "ol", "quote", "callout"] as BlockType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="menuitem"
                disabled={t === block.type}
                onClick={act(() => api.convert(block.id, t))}
                className="h-7 rounded-[6px] border border-white/[0.08] px-2 text-[12px] text-[#c9c9d1] outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70 disabled:border-[#8b5cf6]/50 disabled:text-[#ededf0]"
              >
                {MENU.find((m) => m.type === t)?.label.replace(" list", "")}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="my-1 h-px bg-white/[0.08]" />
      <button role="menuitem" type="button" className={cx(item, "text-[#f47067]")} onClick={act(() => api.remove(block.id, true))}>
        Delete
      </button>
    </div>
  )
}

/* ── The "/" menu ─────────────────────────────────────────────────────── */

function SlashMenu({ state, onPick, onHover }: { state: { query: string; index: number; rect: DOMRect }; onPick: (t: BlockType) => void; onHover: (i: number) => void }) {
  const items = menuMatches(state.query)
  const listRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    listRef.current?.querySelector(`[data-i="${state.index}"]`)?.scrollIntoView({ block: "nearest" })
  }, [state.index])
  const below = state.rect.bottom + 330 < window.innerHeight
  const top = below ? state.rect.bottom + 6 : Math.max(8, state.rect.top - 326)
  const left = Math.max(8, Math.min(state.rect.left, window.innerWidth - 288))
  return (
    <div
      role="listbox"
      aria-label="Insert a block"
      ref={listRef}
      style={{ position: "fixed", top, left }}
      className="z-40 max-h-[320px] w-[280px] overflow-y-auto rounded-[10px] border border-white/[0.1] bg-[#17171d] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
    >
      {items.length ? (
        items.map((m, i) => (
          <button
            key={m.type}
            data-i={i}
            type="button"
            role="option"
            aria-selected={i === state.index}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(m.type)
            }}
            onMouseEnter={() => onHover(i)}
            className={cx("flex w-full flex-col items-start rounded-[6px] px-2.5 py-1.5 text-left outline-none", i === state.index ? "bg-white/[0.08]" : "")}
          >
            <span className="text-[13px] text-[#ededf0]">{m.label}</span>
            {m.hint ? <span className="text-[11px] leading-4 text-[#6b6b76]">{m.hint}</span> : null}
          </button>
        ))
      ) : (
        <p className="px-2.5 py-2 text-[12px] text-[#6b6b76]">No block called “{state.query}”</p>
      )}
    </div>
  )
}

/* ── The bar over selected text, and the link editor ──────────────────── */

function SelectionBar({ root }: { root: React.RefObject<HTMLDivElement | null> }) {
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)
  const [mode, setMode] = React.useState<"format" | "link" | "bubble">("format")
  const [href, setHref] = React.useState("")
  const [blank, setBlank] = React.useState(false)
  const [active, setActive] = React.useState<Record<string, boolean>>({})
  const saved = React.useRef<Range | null>(null)
  const anchor = React.useRef<HTMLAnchorElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const modeRef = React.useRef(mode)
  React.useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const editableOf = React.useCallback(
    (n: Node | null): HTMLElement | null => {
      while (n && n !== root.current) {
        if (n instanceof HTMLElement && n.dataset.rt) return n
        n = n.parentNode
      }
      return null
    },
    [root],
  )
  const linkOf = React.useCallback(
    (n: Node | null): HTMLAnchorElement | null => {
      while (n && n !== root.current) {
        if (n instanceof HTMLAnchorElement) return n
        if (n instanceof HTMLElement && n.dataset.rt) return null
        n = n.parentNode
      }
      return null
    },
    [root],
  )

  const openLink = React.useCallback(() => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !editableOf(sel.anchorNode)) return
    saved.current = sel.getRangeAt(0).cloneRange()
    const link = linkOf(sel.anchorNode)
    anchor.current = link
    setHref(link?.getAttribute("href") ?? "")
    setBlank(link?.target === "_blank")
    const rect = (link ?? saved.current).getBoundingClientRect()
    setPos({ top: rect.top - 44, left: rect.left + rect.width / 2 })
    setMode("link")
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [editableOf, linkOf])

  React.useEffect(() => {
    const onSel = () => {
      if (modeRef.current === "link") return
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount || !editableOf(sel.anchorNode)) return setPos(null)
      const range = sel.getRangeAt(0)
      const link = linkOf(sel.anchorNode)
      if (sel.isCollapsed && !link) return setPos(null)
      const rect = sel.isCollapsed && link ? link.getBoundingClientRect() : range.getBoundingClientRect()
      if (!rect.width && !rect.height) return setPos(null)
      anchor.current = link
      setMode(sel.isCollapsed ? "bubble" : "format")
      setActive({ bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline"), strikeThrough: document.queryCommandState("strikeThrough") })
      setPos({ top: rect.top - 44, left: rect.left + rect.width / 2 })
    }
    document.addEventListener("selectionchange", onSel)
    window.addEventListener("blog-editor:link", openLink)
    return () => {
      document.removeEventListener("selectionchange", onSel)
      window.removeEventListener("blog-editor:link", openLink)
    }
  }, [editableOf, linkOf, openLink])

  function syncFrom(n: Node | null) {
    const el = editableOf(n)
    if (el) el.dispatchEvent(new Event("input", { bubbles: true }))
  }

  function restore() {
    const sel = window.getSelection()
    if (saved.current && sel) {
      sel.removeAllRanges()
      sel.addRange(saved.current)
    }
  }

  function close() {
    setPos(null)
    setMode("format")
  }

  function applyLink() {
    const url = safeHref(href.trim())
    restore()
    let link = anchor.current
    if (!url) return close()
    if (link) link.setAttribute("href", url)
    else {
      document.execCommand("createLink", false, url)
      const n = window.getSelection()?.anchorNode ?? null
      link = linkOf(n) ?? ((n instanceof Element ? n : n?.parentElement)?.querySelector?.(`a[href="${CSS.escape(url)}"]`) as HTMLAnchorElement | null)
    }
    if (link) {
      if (blank) link.setAttribute("target", "_blank")
      else link.removeAttribute("target")
    }
    syncFrom(saved.current?.startContainer ?? null)
    close()
  }

  function removeLink() {
    const link = anchor.current
    if (!link?.parentNode) return close()
    const host = link.parentNode
    while (link.firstChild) host.insertBefore(link.firstChild, link)
    host.removeChild(link)
    syncFrom(host)
    close()
  }

  if (!pos) return null
  const btn = (on?: boolean) => cx("flex h-8 min-w-8 items-center justify-center rounded-[6px] px-2 text-[13px] outline-none hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70", on ? "text-[#c4b5fd]" : "text-[#ededf0]")
  const cmd = isMac() ? "⌘" : "Ctrl "
  const run = (c: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    if (c === "code") toggleInlineCode()
    else document.execCommand(c)
    syncFrom(window.getSelection()?.anchorNode ?? null)
    setActive((a) => ({ ...a, [c]: !a[c] }))
  }
  const width = mode === "link" ? 360 : mode === "bubble" ? 300 : 250
  return (
    <div
      role="toolbar"
      aria-label="Text"
      onMouseDown={(e) => {
        if (mode !== "link") e.preventDefault()
      }}
      style={{ position: "fixed", top: Math.max(8, pos.top), left: Math.max(8, Math.min(pos.left - width / 2, window.innerWidth - width - 8)) }}
      className="z-40 flex items-center gap-0.5 rounded-[9px] border border-white/[0.12] bg-[#17171d] p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
    >
      {mode === "format" ? (
        <>
          <button type="button" title={`Bold (${cmd}B)`} aria-pressed={active.bold} onMouseDown={run("bold")} className={cx(btn(active.bold), "font-bold")}>B</button>
          <button type="button" title={`Italic (${cmd}I)`} aria-pressed={active.italic} onMouseDown={run("italic")} className={cx(btn(active.italic), "italic")}>I</button>
          <button type="button" title={`Underline (${cmd}U)`} aria-pressed={active.underline} onMouseDown={run("underline")} className={cx(btn(active.underline), "underline underline-offset-2")}>U</button>
          <button type="button" title={`Strike (${cmd}Shift S)`} aria-pressed={active.strikeThrough} onMouseDown={run("strikeThrough")} className={cx(btn(active.strikeThrough), "line-through")}>S</button>
          <button type="button" title={`Code (${cmd}E)`} onMouseDown={run("code")} className={cx(btn(), "font-mono text-[12px]")}>{"</>"}</button>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-white/[0.12]" />
          <button type="button" title={`Link (${cmd}K)`} onMouseDown={(e) => { e.preventDefault(); openLink() }} className={btn(Boolean(anchor.current))}>Link</button>
        </>
      ) : mode === "bubble" ? (
        <>
          <a href={anchor.current?.getAttribute("href") ?? "#"} target="_blank" rel="noopener noreferrer" className="max-w-[170px] truncate px-2 text-[12px] text-[#c4b5fd] underline underline-offset-2">
            {anchor.current?.getAttribute("href")}
          </a>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); openLink() }} className={btn()}>Edit</button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); removeLink() }} className={btn()}>Remove</button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
          className="flex items-center gap-1 p-0.5"
        >
          <input
            ref={inputRef}
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                restore()
                close()
              }
            }}
            placeholder="https://… or /pricing"
            aria-label="Link address"
            className="h-8 w-[160px] rounded-[6px] bg-[#0b0b0f] px-2 text-[13px] text-[#ededf0] outline-none placeholder:text-[#5c5c66]"
          />
          <label className="flex items-center gap-1 px-1 text-[11px] text-[#9b9ba6]">
            <input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} className="accent-[#8b5cf6]" />
            New tab
          </label>
          <button type="submit" className={btn()}>Apply</button>
          {anchor.current ? <button type="button" onClick={removeLink} className={btn()}>Remove</button> : null}
        </form>
      )}
    </div>
  )
}

/* ── The editor ───────────────────────────────────────────────────────── */

export default function BlogEditor({
  blocks,
  onChange,
  onUpload,
  snippets = [],
  snippetsNote,
}: {
  blocks: Block[]
  onChange: (blocks: Block[]) => void
  /** Uploads one picture and answers its address; throws with a reason the editor shows. */
  onUpload: (file: File) => Promise<string>
  snippets?: SnippetOption[]
  /** Set when the snippet library is off (before SQL part 345): said where a snippet would be picked. */
  snippetsNote?: string | null
}) {
  const root = React.useRef<HTMLDivElement>(null)
  const blocksRef = React.useRef(blocks)
  const onChangeRef = React.useRef(onChange)
  const uploadRef = React.useRef(onUpload)
  React.useLayoutEffect(() => {
    blocksRef.current = blocks
    onChangeRef.current = onChange
    uploadRef.current = onUpload
  })
  const focusReq = React.useRef<{ id: string; where: "start" | "end" | number } | null>(null)
  const syncs = React.useRef(new Map<string, () => void>())
  const [slash, setSlash] = React.useState<{ id: string; query: string; index: number; rect: DOMRect } | null>(null)
  const slashRef = React.useRef(slash)
  React.useLayoutEffect(() => {
    slashRef.current = slash
  }, [slash])
  const [uploading, setUploading] = React.useState<ReadonlySet<string>>(new Set())
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [dropAt, setDropAt] = React.useState<{ id: string; pos: "before" | "after" } | null>(null)

  const commit = React.useCallback((next: Block[]) => {
    blocksRef.current = next
    onChangeRef.current(next)
  }, [])

  const applyFocus = React.useCallback(() => {
    const req = focusReq.current
    if (!req) return
    const row = root.current?.querySelector<HTMLElement>(`[data-block="${req.id}"]`)
    if (!row) return
    focusReq.current = null
    const rt = row.querySelector<HTMLElement>("[data-rt]")
    if (!rt) {
      row.querySelector<HTMLElement>("input, textarea, select, [data-hr]")?.focus()
      return
    }
    if (typeof req.where === "number") {
      rt.focus()
      const walker = document.createTreeWalker(rt, NodeFilter.SHOW_TEXT)
      let left = req.where
      let node = walker.nextNode()
      while (node && left > (node.nodeValue ?? "").length) {
        left -= (node.nodeValue ?? "").length
        node = walker.nextNode()
      }
      const sel = window.getSelection()
      if (node && sel) {
        const r = document.createRange()
        r.setStart(node, Math.min(left, (node.nodeValue ?? "").length))
        r.collapse(true)
        sel.removeAllRanges()
        sel.addRange(r)
      } else placeCaret(rt, "end")
      return
    }
    const target = rt.tagName === "UL" || rt.tagName === "OL" ? ((req.where === "start" ? rt.firstElementChild : rt.lastElementChild) as HTMLElement | null) ?? rt : rt
    if (target !== rt) rt.focus()
    placeCaret(target, req.where)
  }, [])

  const pickSlash = React.useCallback(
    (type: BlockType) => {
      const s = slashRef.current
      if (!s) return
      setSlash(null)
      const fresh = blankBlock(type)
      const next = blocksRef.current.map((b) => (b.id === s.id ? fresh : b))
      focusReq.current = { id: fresh.id, where: "start" }
      if (type === "hr") {
        const p = blankBlock("p")
        next.splice(next.findIndex((b) => b.id === fresh.id) + 1, 0, p)
        focusReq.current = { id: p.id, where: "start" }
      }
      commit(next)
    },
    [commit],
  )

  const api = React.useMemo<EditorApi>(() => {
    const at = (id: string) => blocksRef.current.findIndex((b) => b.id === id)
    return {
      update: (id, patch) => {
        const list = blocksRef.current
        const i = at(id)
        if (i < 0) return
        const cur = list[i] as unknown as Record<string, unknown>
        if (Object.entries(patch).every(([k, v]) => JSON.stringify(cur[k]) === JSON.stringify(v))) return
        const next = list.slice()
        next[i] = { ...list[i], ...patch }
        commit(next)
      },
      insertAfter: (id, add, focus = "start") => {
        if (!add.length) return
        const list = blocksRef.current.slice()
        const i = id ? list.findIndex((b) => b.id === id) : list.length - 1
        list.splice(i + 1, 0, ...add)
        focusReq.current = { id: (focus === "end" ? add[add.length - 1] : add[0]).id, where: focus }
        commit(list)
      },
      replaceWith: (id, add, focus = "start") => {
        const list = blocksRef.current.slice()
        const i = list.findIndex((b) => b.id === id)
        if (i < 0) return
        list.splice(i, 1, ...add)
        if (!list.length) list.push(blankBlock("p"))
        focusReq.current = { id: (focus === "end" ? add[add.length - 1] : add[0])?.id ?? list[0].id, where: focus }
        commit(list)
      },
      remove: (id, focusPrev) => {
        const list = blocksRef.current.slice()
        const i = list.findIndex((b) => b.id === id)
        if (i < 0) return
        list.splice(i, 1)
        if (!list.length) list.push(blankBlock("p"))
        const target = list[Math.max(0, i - 1)]
        if (focusPrev && target) focusReq.current = { id: target.id, where: i === 0 ? "start" : "end" }
        commit(list)
      },
      move: (id, dir) => {
        const list = blocksRef.current.slice()
        const i = list.findIndex((b) => b.id === id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= list.length) return
        ;[list[i], list[j]] = [list[j], list[i]]
        commit(list)
        requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-block="${id}"]`)?.scrollIntoView({ block: "nearest" }))
      },
      duplicate: (id) => {
        syncs.current.get(id)?.()
        const list = blocksRef.current.slice()
        const i = list.findIndex((b) => b.id === id)
        if (i < 0) return
        const copy = { ...(JSON.parse(JSON.stringify(list[i])) as Block), id: newBlockId() }
        delete copy.anchor
        list.splice(i + 1, 0, copy)
        focusReq.current = { id: copy.id, where: "end" }
        commit(list)
      },
      convert: (id, type) => {
        syncs.current.get(id)?.()
        const list = blocksRef.current.slice()
        const i = list.findIndex((b) => b.id === id)
        if (i < 0) return
        const cur = list[i]
        const fresh: Block = { ...blankBlock(type), id: cur.id }
        if (TEXT_TYPES.has(type)) fresh.html = cur.html ?? (cur.items ?? []).filter(Boolean).join("<br>")
        if (LIST_TYPES.has(type)) fresh.items = cur.items ?? (cur.html ? cur.html.split(/<br\s*\/?>/) : [""])
        list[i] = fresh
        focusReq.current = { id: cur.id, where: "end" }
        commit(list)
      },
      mergeIntoPrevious: (id, html) => {
        const list = blocksRef.current
        const i = at(id)
        const prev = list[i - 1]
        if (!prev || !TEXT_TYPES.has(prev.type)) return false
        const before = prev.html ?? ""
        const next = list.slice()
        next[i - 1] = { ...prev, html: before + html }
        next.splice(i, 1)
        /* The caret goes where the two lines meet: the length of the line above, in characters. */
        const box = document.createElement("div")
        box.innerHTML = before
        focusReq.current = { id: prev.id, where: (box.textContent ?? "").length }
        commit(next)
        return true
      },
      focusNeighbour: (id, dir) => {
        const n = blocksRef.current[at(id) + dir]
        if (!n) return false
        focusReq.current = { id: n.id, where: dir < 0 ? "end" : "start" }
        applyFocus()
        return true
      },
      openSlash: (id, query, rect) => setSlash((s) => ({ id, query, index: s && s.id === id && s.query === query ? s.index : 0, rect })),
      closeSlash: () => setSlash((s) => (s ? null : s)),
      slashKey: (e) => {
        const s = slashRef.current
        if (!s) return false
        const items = menuMatches(s.query)
        const n = Math.max(1, items.length)
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault()
          setSlash({ ...s, index: (s.index + (e.key === "ArrowDown" ? 1 : -1) + n) % n })
          return true
        }
        if ((e.key === "Enter" || e.key === "Tab") && items.length) {
          e.preventDefault()
          pickSlash(items[Math.min(s.index, items.length - 1)].type)
          return true
        }
        if (e.key === "Escape") {
          e.preventDefault()
          setSlash(null)
          return true
        }
        return false
      },
      uploadInto: (id, file) => {
        setUploading((u) => new Set(u).add(id))
        setUploadError(null)
        uploadRef
          .current(file)
          .then((url) => {
            const list = blocksRef.current
            const i = list.findIndex((b) => b.id === id)
            if (i < 0) return
            const next = list.slice()
            next[i] = { ...list[i], url }
            commit(next)
          })
          .catch((e: Error) => setUploadError(e.message || "The picture could not be uploaded."))
          .finally(() =>
            setUploading((u) => {
              const n = new Set(u)
              n.delete(id)
              return n
            }),
          )
      },
      registerSync: (id, fn) => {
        syncs.current.set(id, fn)
        return () => {
          if (syncs.current.get(id) === fn) syncs.current.delete(id)
        }
      },
    }
  }, [commit, pickSlash, applyFocus])

  React.useLayoutEffect(() => {
    applyFocus()
  })

  /* Keys that act on the block the caret is in, wherever in it. */
  function onKeyDownCapture(e: React.KeyboardEvent) {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-block]")
    if (!row || !root.current?.contains(row)) return
    const id = row.dataset.block!
    if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault()
      syncs.current.get(id)?.()
      api.move(id, e.key === "ArrowUp" ? -1 : 1)
      return
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "d") {
      e.preventDefault()
      api.duplicate(id)
    }
  }

  const onDragStartId = React.useCallback((id: string | null) => {
    setDragId(id)
    if (!id) setDropAt(null)
  }, [])
  const onDragOverId = React.useCallback((id: string, pos: "before" | "after") => setDropAt((d) => (d?.id === id && d.pos === pos ? d : { id, pos })), [])
  const dropRef = React.useRef(dropAt)
  React.useLayoutEffect(() => {
    dropRef.current = dropAt
  }, [dropAt])
  const dragRef = React.useRef(dragId)
  React.useLayoutEffect(() => {
    dragRef.current = dragId
  }, [dragId])
  const onDropId = React.useCallback(
    (id: string) => {
      const from = dragRef.current
      const pos = dropRef.current?.pos ?? "before"
      setDragId(null)
      setDropAt(null)
      if (!from || from === id) return
      const list = blocksRef.current.slice()
      const moving = list.splice(list.findIndex((x) => x.id === from), 1)[0]
      list.splice(list.findIndex((x) => x.id === id) + (pos === "after" ? 1 : 0), 0, moving)
      commit(list)
    },
    [commit],
  )

  return (
    <ApiContext.Provider value={api}>
      <div ref={root} onKeyDownCapture={onKeyDownCapture} className="relative" data-blog-editor>
        {uploadError ? (
          <p role="alert" className="mb-3 rounded-[8px] border border-[#f47067]/40 px-3 py-2 text-[13px] text-[#f47067]">
            {uploadError}
          </p>
        ) : null}
        {blocks.map((b, i) => (
          <BlockRow
            key={b.id}
            block={b}
            index={i}
            count={blocks.length}
            uploading={uploading.has(b.id)}
            snippets={snippets}
            snippetsNote={snippetsNote}
            dragging={Boolean(dragId)}
            drop={dragId && dropAt?.id === b.id && dragId !== b.id ? dropAt.pos : null}
            onDragStartId={onDragStartId}
            onDragOverId={onDragOverId}
            onDropId={onDropId}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            const last = blocksRef.current[blocksRef.current.length - 1]
            if (last && last.type === "p" && !(last.html ?? "").trim()) {
              focusReq.current = { id: last.id, where: "start" }
              applyFocus()
              return
            }
            api.insertAfter(null, [blankBlock("p")])
          }}
          aria-label="Add a line at the end"
          className="mt-2 block min-h-[96px] w-full cursor-text outline-none"
        />
        {slash ? <SlashMenu state={slash} onPick={pickSlash} onHover={(i) => setSlash((s) => (s ? { ...s, index: i } : s))} /> : null}
        <SelectionBar root={root} />
      </div>
    </ApiContext.Provider>
  )
}
