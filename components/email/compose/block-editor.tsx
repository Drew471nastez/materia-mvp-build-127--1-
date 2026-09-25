"use client"

/**
 * ===========================================================================
 *  THE EMAIL EDITOR
 * ===========================================================================
 * An email is a column of blocks, drawn as it will read in an inbox: text,
 * a button, an image, a product, a divider, a space.
 *
 * TEXT IS THE SHARED RICH TEXT FIELD (components/app/rich-text-editor.tsx),
 * the one the product description and the automated emails are written in:
 * paragraphs, two heading levels, bold, italic, underline, strike, lists, a
 * quote, links, a divider, undo and redo, a cleaned paste, and the reader's
 * name from the Name menu. Writing is a document, not a list of one-line
 * boxes: Enter, Backspace, lists and the caret are the browser's own, so
 * they behave on an iPhone the way they do everywhere else.
 *
 * Each text block's toolbar holds still under the page's bar while its text
 * scrolls, on a phone too, every control a 44px target in a row that scrolls
 * sideways inside itself. Anything that is not text is a block of its own
 * between them, with its settings under it in the flow of the page, never
 * on top of the email.
 *
 * The blocks become email HTML in lib/email-campaigns/blocks.ts; what this
 * draws is only for writing, and the preview beside it is the real thing.
 */
import * as React from "react"
import { ArrowDown, ArrowUp, Copy, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { RichTextEditor, type RichTextApi, type RichTextTool } from "@/components/app/rich-text-editor"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { buttonColors, themeOf, type EmailTheme } from "@/lib/email-campaigns/brand"
import { blockHasContent, newBlock, safeImageSrc, type Block, type BlockIssue, type BlockType, type ImageBlock } from "@/lib/email-campaigns/blocks"
import { ButtonPanel, ImagePanel, ProductPanel, SpacerPanel } from "./panels"
import { buttonSecondary } from "./ui"
import type { Doc } from "./use-doc"

/** What the text toolbar offers in an email. Pictures are their own block, with a size, a link and a description. */
export const EMAIL_TEXT_TOOLS: RichTextTool[] = ["h2", "h3", "bold", "italic", "underline", "strike", "bulletList", "numberedList", "quote", "link", "rule", "clear", "undo", "redo"]

interface InsertItem {
  type: BlockType
  label: string
}

export const INSERT_ITEMS: InsertItem[] = [
  { type: "rich", label: "Text" },
  { type: "button", label: "Button" },
  { type: "image", label: "Image" },
  { type: "product", label: "Product" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Space" },
]

const FIELDS = [
  { label: "First name", field: "first_name" },
  { label: "Full name", field: "name" },
  { label: "Email address", field: "email" },
]

export interface BlockEditorProps {
  doc: Doc
  creatorId: string | null
  username: string | null
  issues: BlockIssue[]
  showIssues: boolean
  /** The brand the email is sent in, so a button here wears the same colour as in the preview. */
  theme?: EmailTheme
  onUploadImage: (file: File) => Promise<string>
}

const toolClass =
  "inline-flex h-11 min-w-11 shrink-0 cursor-pointer select-none items-center justify-center gap-1 rounded-lg px-2 text-[13px] font-medium text-[#4b5563] transition-colors duration-100 hover:bg-[#eef0f2] hover:text-[#1a1a2e] active:bg-[#e6e8eb] sm:h-8 sm:min-w-8 [-webkit-tap-highlight-color:transparent]"

export function BlockEditor({ doc, creatorId, username, issues, showIssues, theme = themeOf({ accent: "" }), onUploadImage }: BlockEditorProps) {
  const { blocks, set } = doc
  const [selected, setSelected] = React.useState<string | null>(null)
  const [pickerFor, setPickerFor] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState<Record<string, string>>({})
  const [uploadError, setUploadError] = React.useState<Record<string, string>>({})
  const rootRef = React.useRef<HTMLDivElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const uploadTarget = React.useRef<string | null>(null)
  const blocksRef = React.useRef(blocks)
  blocksRef.current = blocks

  const byId = (id: string | null) => blocksRef.current.find((b) => b.id === id) ?? null
  const indexOf = (id: string) => blocksRef.current.findIndex((b) => b.id === id)

  /* ─── Changing the blocks ─── */

  const patch = React.useCallback(
    (id: string, p: Partial<Block>, typing = false) => set((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)), typing ? { typing: id } : undefined),
    [set],
  )

  /** Put the caret in a text block, after the render that made it. */
  const focusText = (id: string, at: "start" | "end" = "end") => {
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${id}"] .rich-text-content`)
      if (!el) return
      el.focus({ preventScroll: true })
      const sel = window.getSelection()
      if (!sel) return
      const r = document.createRange()
      r.selectNodeContents(el.lastElementChild ?? el)
      r.collapse(at === "start")
      sel.removeAllRanges()
      sel.addRange(r)
      el.closest("[data-block-id]")?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
  }

  const remove = (id: string) => {
    const all = blocksRef.current
    const i = indexOf(id)
    if (i < 0) return
    let next = all.filter((b) => b.id !== id)
    /* Two text blocks that met because what was between them went are one text again. */
    const before = next[i - 1]
    const after = next[i]
    if (before?.type === "rich" && after?.type === "rich") {
      next = next.filter((b) => b.id !== after.id).map((b) => (b.id === before.id ? ({ ...before, html: `${before.html}${after.html}` } as Block) : b))
    }
    if (next.length === 0) next = [newBlock("rich")]
    set(next)
    setSelected(null)
  }

  const move = (id: string, dir: -1 | 1) => {
    const i = indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= blocksRef.current.length) return
    set(arrayMove(blocksRef.current, i, j))
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
  }

  const duplicate = (id: string) => {
    const b = byId(id)
    if (!b) return
    const copy = { ...(JSON.parse(JSON.stringify(b)) as Block), id: newBlock(b.type).id }
    const i = indexOf(id)
    set((prev) => [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)])
    setSelected(copy.id)
  }

  /**
   * A new block after the one being worked on, or at the end. An empty text
   * block is replaced rather than left as a gap, and a block that is not
   * text at the very end gets a text block after it, so writing can go on.
   */
  const add = (type: BlockType) => {
    const made = newBlock(type)
    const all = blocksRef.current
    const target = byId(selected) ?? all[all.length - 1] ?? null
    const at = target ? indexOf(target.id) : all.length - 1
    const replace = !!target && target.type === "rich" && !blockHasContent(target) && type !== "rich"
    const before = all.slice(0, replace ? at : at + 1)
    const after = all.slice(at + 1)
    const tail = type !== "rich" && after.length === 0 ? [newBlock("rich")] : []
    set([...before, made, ...tail, ...after])
    setSelected(made.id)
    if (type === "rich") focusText(made.id, "start")
    else
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${made.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
    if (type === "image") startUpload(made.id)
    if (type === "product") setPickerFor(made.id)
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
      const img = byId(id) as ImageBlock | null
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

  /* ─── Undo for the blocks themselves ─── */

  /**
   * Inside a text block, Cmd+Z is that text's own undo, the browser's. Out of
   * one, it undoes the last thing done to the blocks: a delete, a move, a
   * setting.
   */
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod || e.altKey) return
    const inText = (e.target as HTMLElement | null)?.closest?.(".rich-text-content, input, textarea")
    if (inText) return
    const key = e.key.toLowerCase()
    if (key === "z") {
      e.preventDefault()
      if (e.shiftKey) doc.redo()
      else doc.undo()
    } else if (key === "y") {
      e.preventDefault()
      doc.redo()
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    const from = blocksRef.current.findIndex((b) => b.id === e.active.id)
    const to = blocksRef.current.findIndex((b) => b.id === e.over?.id)
    if (from >= 0 && to >= 0 && from !== to) set(arrayMove(blocksRef.current, from, to))
  }

  const issueFor = (id: string) => (showIssues ? issues.find((i) => i.id === id && i.level === "error") : undefined)

  const actionsFor = (b: Block, i: number): ActionMenuItem[] => [
    ...(i > 0 ? [{ label: "Move up", icon: <ArrowUp className="h-4 w-4" />, onClick: () => move(b.id, -1) }] : []),
    ...(i < blocks.length - 1 ? [{ label: "Move down", icon: <ArrowDown className="h-4 w-4" />, onClick: () => move(b.id, 1) }] : []),
    { label: "Duplicate", icon: <Copy className="h-4 w-4" />, onClick: () => duplicate(b.id) },
    { label: "Delete", icon: <Trash2 className="h-4 w-4" />, variant: "destructive", separatorBefore: true, onClick: () => remove(b.id) },
  ]

  const blockMenu = (b: Block, i: number, className?: string) => (
    <ResponsiveActionMenu
      title={b.type === "rich" ? "Text" : INSERT_ITEMS.find((x) => x.type === b.type)?.label ?? "Block"}
      align="end"
      items={actionsFor(b, i)}
      trigger={
        <button type="button" aria-label="Block actions" onMouseDown={(e) => e.preventDefault()} className={cn(toolClass, "px-0", className)}>
          <MoreHorizontal className="h-[18px] w-[18px] sm:h-4 sm:w-4" />
        </button>
      }
    />
  )

  return (
    <div
      ref={rootRef}
      data-email-editor=""
      onKeyDownCapture={onKeyDownCapture}
      onFocusCapture={(e) => {
        const id = (e.target as HTMLElement).closest?.("[data-block-id]")?.getAttribute("data-block-id")
        if (id && id !== selected) setSelected(id)
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          const id = uploadTarget.current
          e.target.value = ""
          if (file && id) void upload(id, file)
        }}
      />

      <div className="space-y-3 p-3 sm:p-4 xl:pl-10">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map((b, index) => (
              <Shell
                key={b.id}
                block={b}
                selected={selected === b.id}
                issue={issueFor(b.id)?.message}
                onSelect={() => setSelected(b.id)}
                menu={b.type === "rich" ? null : blockMenu(b, index, "h-9 min-w-9 sm:h-8 sm:min-w-8")}
                panel={
                  selected === b.id ? (
                    b.type === "button" ? (
                      <ButtonPanel block={b} brand={theme.button} onChange={(p) => patch(b.id, p)} />
                    ) : b.type === "image" ? (
                      <ImagePanel block={b} onChange={(p) => patch(b.id, p)} onUpload={() => startUpload(b.id)} uploading={!!uploading[b.id]} uploadError={uploadError[b.id] || null} />
                    ) : b.type === "product" ? (
                      <ProductPanel block={b} brand={theme.button} onChange={(p) => patch(b.id, p)} creatorId={creatorId} username={username} pickerOpen={pickerFor === b.id} onPickerOpen={(o) => setPickerFor(o ? b.id : null)} />
                    ) : b.type === "spacer" ? (
                      <SpacerPanel block={b} onChange={(p) => patch(b.id, p)} />
                    ) : null
                  ) : null
                }
              >
                {b.type === "rich" ? (
                  <RichTextEditor
                    value={b.html}
                    onChange={(html) => patch(b.id, { html } as Partial<Block>, true)}
                    label={index === 0 ? "Email text" : `Email text, block ${index + 1}`}
                    placeholder={index === 0 ? "Write your email" : "Write here"}
                    tools={EMAIL_TEXT_TOOLS}
                    grow
                    stickyToolbar="var(--compose-bar, 0px)"
                    minHeight={index === 0 && blocks.length === 1 ? 200 : 96}
                    className="rounded-xl"
                    extraTools={(api) => <FieldMenu api={api} />}
                    toolbarEnd={blocks.length > 1 ? blockMenu(b, index) : undefined}
                  />
                ) : b.type === "button" ? (
                  <ButtonView block={b} theme={theme} />
                ) : b.type === "image" ? (
                  <ImageView block={b} uploading={uploading[b.id]} onDropFile={(f) => void upload(b.id, f)} onUpload={() => startUpload(b.id)} />
                ) : b.type === "product" ? (
                  <ProductView block={b} theme={theme} />
                ) : b.type === "divider" ? (
                  <div className="py-3">
                    <div className="h-px bg-[#e5e7eb]" />
                  </div>
                ) : b.type === "spacer" ? (
                  <div
                    className="flex items-center justify-center rounded-md border border-dashed border-[#e3e4e8] text-[12px] font-medium text-[#9ca3af]"
                    style={{ height: b.size }}
                  >
                    Space
                  </div>
                ) : null}
              </Shell>
            ))}
          </SortableContext>
        </DndContext>

        <div className="flex items-center justify-center pt-1">
          <ResponsiveActionMenu
            title="Add a block"
            align="center"
            menuWidth="w-52"
            items={INSERT_ITEMS.map((item) => ({ label: item.label, onClick: () => add(item.type) }))}
            trigger={
              <button type="button" className={cn(buttonSecondary, "h-11 px-4 text-[14px] sm:h-9 sm:text-[13px]")} data-add-block="">
                <Plus className="h-4 w-4" />
                Add a block
              </button>
            }
          />
        </div>
      </div>
    </div>
  )
}

/** The reader's name or address, filled in for each person when it is sent. */
function FieldMenu({ api }: { api: RichTextApi }) {
  return (
    <ResponsiveActionMenu
      title="Fill in for each reader"
      align="start"
      menuWidth="w-48"
      items={FIELDS.map((f) => ({ label: f.label, onClick: () => api.insertHtml(`{{${f.field}}}`) }))}
      trigger={
        <button
          type="button"
          className={toolClass}
          title="Their name or email, filled in for each reader"
          aria-label="Insert the reader's name or email"
          onMouseDown={(e) => {
            e.preventDefault()
            api.keepSelection()
          }}
          onTouchStart={() => api.keepSelection()}
        >
          Name
        </button>
      }
    />
  )
}

/* ─── A block's frame: selection, its handle, its settings ───────────── */

function Shell({
  block,
  selected,
  issue,
  onSelect,
  menu,
  panel,
  children,
}: {
  block: Block
  selected: boolean
  issue?: string
  onSelect: () => void
  menu: React.ReactNode
  panel: React.ReactNode
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const text = block.type === "rich"
  return (
    <div
      ref={setNodeRef}
      data-block-id={block.id}
      data-block-type={block.type}
      tabIndex={text ? undefined : 0}
      onMouseDown={() => {
        if (!selected) onSelect()
      }}
      className={cn("group/block relative rounded-xl outline-none", isDragging && "z-10 opacity-80")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {/* The handle, in the card's margin, on a wide screen. Anywhere else the block's menu moves it. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute -left-8 top-2 hidden h-7 w-6 cursor-grab items-center justify-center rounded text-[#9ca3af] opacity-0 transition-opacity duration-100 hover:bg-[#f1f2f4] hover:text-[#4b5563] active:cursor-grabbing group-hover/block:opacity-100 group-focus-within/block:opacity-100 xl:flex"
        aria-label="Drag to move"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {text ? (
        children
      ) : (
        <div
          className={cn(
            "relative cursor-pointer rounded-xl border px-3 py-2 transition-[border-color,box-shadow] duration-100",
            selected ? "border-[#1a1a2e]/25 shadow-[0_0_0_3px_rgba(26,26,46,0.06)]" : "border-transparent hover:border-[#e3e4e8]",
            issue && "border-[#d72c0d] shadow-none",
          )}
        >
          {children}
          <div className={cn("absolute right-1.5 top-1.5 transition-opacity duration-100", selected ? "opacity-100" : "opacity-0 group-hover/block:opacity-100 max-sm:opacity-100")}>{menu}</div>
        </div>
      )}
      {issue ? <p className="mt-1 px-1 text-[12px] text-[#b42318]">{issue}</p> : null}
      {panel}
    </div>
  )
}

function ButtonView({ block, theme }: { block: Block & { type: "button" }; theme: EmailTheme }) {
  const c = buttonColors(block.color, theme)
  return (
    <div className="py-2 pr-10" style={{ textAlign: block.align }}>
      <span className="inline-block max-w-full break-words rounded-lg px-6 py-3 text-[16px] font-semibold leading-5" style={{ backgroundColor: c.fill, color: c.text }}>
        {block.label.trim() || "Button text"}
      </span>
    </div>
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
        className={cn("flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center", over ? "border-[#1a1a2e]/40 bg-[#f4f5f7]" : "border-[#d5d7dd] bg-[#fafbfb]")}
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={block.alt}
        draggable={false}
        className={cn("inline-block h-auto max-w-full rounded-lg align-top", uploading && "opacity-50")}
        style={{ width: `${block.width}%` }}
      />
      {uploading ? <p className="mt-1 text-[12px] text-[#6b7280]">Uploading</p> : null}
    </div>
  )
}

function ProductView({ block, theme }: { block: Block & { type: "product" }; theme: EmailTheme }) {
  if (!block.productId) {
    return (
      <div className="flex min-h-[96px] items-center justify-center rounded-xl border border-dashed border-[#d5d7dd] bg-[#fafbfb] px-4 text-[13px] text-[#6b7280]">
        Choose a product in the settings below
      </div>
    )
  }
  const c = buttonColors(block.color, theme)
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#e5e7eb] p-4 pr-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {block.imageUrl ? <img src={block.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover sm:h-24 sm:w-24" /> : null}
      <div className="min-w-0">
        <p className="truncate text-[17px] font-semibold leading-6 text-[#111827]">{block.title}</p>
        {block.price ? <p className="mb-3 text-[15px] text-[#4b5563]">{block.price}</p> : null}
        <span className="inline-block rounded-lg px-4 py-2 text-[14px] font-semibold" style={{ backgroundColor: c.fill, color: c.text }}>
          {block.cta || "View product"}
        </span>
      </div>
    </div>
  )
}

export type { BlockType }
