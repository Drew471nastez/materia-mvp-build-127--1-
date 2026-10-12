"use client"

/**
 * ===========================================================================
 *  THE EMAIL, WRITTEN AS IT WILL READ
 * ===========================================================================
 * An email is a column of blocks: text, a button, an image, a product, a
 * divider, a space. They are drawn here the way the inbox draws them, in the
 * email's own type and spacing (./email-canvas.ts) and in a column as wide as
 * the email's, so the page being written is the email and not a form about
 * it. A button is the email's button, in the brand's colour, with its words
 * typed on it.
 *
 * ONE WRITING SURFACE. Text blocks have no box and no toolbar of their own
 * (./text-block.tsx). One formatting bar serves them all (./format-bar.tsx):
 * docked on the keyboard on a phone while there is a caret, stuck to the top
 * of the email from 768px. It is also where a block is added at the caret,
 * and where a text block is moved, copied or deleted.
 *
 * Anything that is not text is a block of its own between the texts. A tap
 * picks it: a thin outline, its menu at its corner (move, copy, delete; a
 * sheet on a phone) and its settings under it in the flow of the page, never
 * on top of the email. On a wide screen it can also be dragged by the handle
 * in the margin.
 *
 * A BUTTON ON A PHONE (round R8) is edited in a bottom sheet: a tap on it
 * opens the sheet with its words, its link, its colour and its place, on the
 * keyboard when one is up (components/ui/bottom-sheet.tsx aboveKeyboard), and
 * Done, a pull down or a tap outside closes it. Its words are not typed on
 * the button itself there: a field on the canvas under a rising sheet and a
 * rising keyboard was the fight this replaces.
 *
 * The blocks become email HTML in lib/email-campaigns/blocks.ts; the preview
 * (./email-preview.tsx) is that HTML, the real thing.
 */
import * as React from "react"
import { ArrowDown, ArrowUp, Copy, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { buttonColors, themeOf, type EmailTheme } from "@/lib/email-campaigns/brand"
import { blockHasContent, newBlock, safeImageSrc, type Block, type BlockIssue, type BlockType, type ButtonBlock, type ImageBlock } from "@/lib/email-campaigns/blocks"
import { ButtonPanel, ImagePanel, ProductPanel, SpacerPanel } from "./panels"
import { buttonSecondary } from "./ui"
import { EMAIL_FONT, EMAIL_TYPE } from "./email-canvas"
import { EmailText } from "./text-block"
import { FormatBar, usePhoneLayout, type BlockAction, type InsertPoint } from "./format-bar"
import type { Doc } from "./use-doc"
import { tt } from "@/lib/i18n/text"

interface InsertItem {
  type: BlockType
  label: string
}

export const INSERT_ITEMS: InsertItem[] = [
  { type: "rich", get label() { return tt("Text") } },
  { type: "button", get label() { return tt("Button") } },
  { type: "image", get label() { return tt("Image") } },
  { type: "product", get label() { return tt("Product") } },
  { type: "divider", get label() { return tt("Divider") } },
  { type: "spacer", get label() { return tt("Space") } },
]

const FIELDS = [
  { get label() { return tt("First name") }, field: "first_name" },
  { get label() { return tt("Full name") }, field: "name" },
  { get label() { return tt("Email address") }, field: "email" },
  /* Filled when the email is sent, from your profile and store as they are then (lib/email-variables). */
  { get label() { return tt("Your name") }, field: "creator_name" },
  { get label() { return tt("Store name") }, field: "store_name" },
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

const cornerButton =
  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border border-[#e3e4e8] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(17,24,39,0.06)] transition-colors duration-100 hover:text-[#1a1a2e] active:bg-[#f4f5f7] md:h-8 md:w-8 md:rounded-lg [-webkit-tap-highlight-color:transparent]"

export function BlockEditor({ doc, creatorId, username, issues, showIssues, theme = themeOf({ accent: "" }), onUploadImage }: BlockEditorProps) {
  const { blocks, set } = doc
  const phone = usePhoneLayout()
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
  const blockEl = (id: string) => rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`) ?? null

  /* ─── Changing the blocks ─── */

  const patch = React.useCallback(
    (id: string, p: Partial<Block>, typing = false) => set((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...p } as Block) : b)), typing ? { typing: id } : undefined),
    [set],
  )

  /** Put the caret in a text block, after the render that made it. */
  const focusText = (id: string, at: "start" | "end" = "end") => {
    requestAnimationFrame(() => {
      const el = blockEl(id)?.querySelector<HTMLElement>("[data-email-text]")
      if (!el) return
      el.focus({ preventScroll: true })
      const sel = window.getSelection()
      if (sel) {
        const r = document.createRange()
        r.selectNodeContents(at === "start" ? (el.firstElementChild ?? el) : (el.lastElementChild ?? el))
        r.collapse(at === "start")
        sel.removeAllRanges()
        sel.addRange(r)
      }
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
    requestAnimationFrame(() => blockEl(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }))
  }

  const duplicate = (id: string) => {
    const b = byId(id)
    if (!b) return
    const copy = { ...(JSON.parse(JSON.stringify(b)) as Block), id: newBlock(b.type).id }
    const i = indexOf(id)
    set((prev) => [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)])
    setSelected(copy.id)
  }

  /** What a new block does once it is on the page: the caret, a scroll, the picker it needs. */
  const arrive = (made: Block) => {
    setSelected(made.id)
    if (made.type === "rich") return focusText(made.id, "start")
    requestAnimationFrame(() => {
      const el = blockEl(made.id)
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      /* On a phone a button's words are typed in its sheet, which opens now that it is picked. */
      if (made.type === "button" && !phone) el?.querySelector<HTMLInputElement>("[data-button-label]")?.focus({ preventScroll: true })
      else (document.activeElement as HTMLElement | null)?.blur?.()
    })
    if (made.type === "image") startUpload(made.id)
    if (made.type === "product") setPickerFor(made.id)
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
    arrive(made)
  }

  /** A block asked for from the formatting bar: at the caret, the text split around it. */
  const insertAt = (type: BlockType, at: InsertPoint | null) => {
    const all = blocksRef.current
    const i = at ? indexOf(at.blockId) : -1
    const host = i >= 0 ? all[i] : null
    if (!at || !host || host.type !== "rich") return add(type)
    const made = newBlock(type)
    const head: Block[] = at.head ? [{ ...host, html: at.head } as Block] : []
    const after = all.slice(i + 1)
    const tail: Block[] = at.tail ? [newBlock("rich", { html: at.tail })] : type !== "rich" && after.length === 0 ? [newBlock("rich")] : []
    set([...all.slice(0, i), ...head, made, ...tail, ...after])
    arrive(made)
  }

  /* ─── Images ─── */

  function startUpload(id: string) {
    uploadTarget.current = id
    fileRef.current?.click()
  }

  const upload = async (id: string, file: File) => {
    setUploadError((e) => ({ ...e, [id]: "" }))
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) return setUploadError((e) => ({ ...e, [id]: tt("Use a JPG, PNG, GIF or WebP image.") }))
    if (file.size > 5 * 1024 * 1024) return setUploadError((e) => ({ ...e, [id]: tt("Use an image under 5 MB.") }))
    const local = URL.createObjectURL(file)
    setUploading((u) => ({ ...u, [id]: local }))
    try {
      const url = await onUploadImage(file)
      const img = byId(id) as ImageBlock | null
      patch(id, { src: url, alt: img?.alt || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 120) } as Partial<Block>)
    } catch (err) {
      setUploadError((e) => ({ ...e, [id]: err instanceof Error ? err.message : tt("The image did not upload. Try again.") }))
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
   * Inside a text block or a field, Cmd+Z is that text's own undo, the
   * browser's. Out of one, it undoes the last thing done to the blocks: a
   * delete, a move, a setting.
   */
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod || e.altKey) return
    const inText = (e.target as HTMLElement | null)?.closest?.("[data-email-text], input, textarea")
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

  const actionsFor = (id: string): ActionMenuItem[] => {
    const i = indexOf(id)
    const n = blocksRef.current.length
    return [
      ...(i > 0 ? [{ label: tt("Move up"), icon: <ArrowUp className="h-4 w-4" />, onClick: () => move(id, -1) }] : []),
      ...(i < n - 1 ? [{ label: tt("Move down"), icon: <ArrowDown className="h-4 w-4" />, onClick: () => move(id, 1) }] : []),
      { label: tt("Duplicate"), icon: <Copy className="h-4 w-4" />, onClick: () => duplicate(id) },
      { label: tt("Delete"), icon: <Trash2 className="h-4 w-4" />, variant: "destructive", separatorBefore: true, onClick: () => remove(id) },
    ]
  }
  /* The same, for a text block, in the formatting bar's own row. Nothing to do to the only block. */
  const textActions = (id: string): BlockAction[] =>
    blocksRef.current.length > 1 ? actionsFor(id).map((a) => ({ label: a.label, run: () => a.onClick?.(), danger: a.variant === "destructive" })) : []

  /** Backspace in an empty text: it goes, and the caret goes to the end of the text before it. */
  const removeEmpty = (id: string) => {
    const all = blocksRef.current
    const i = indexOf(id)
    if (all.length <= 1 || i < 0) return
    const prev = all[i - 1]
    remove(id)
    if (prev?.type === "rich") focusText(prev.id, "end")
    else if (prev) setSelected(prev.id)
  }

  /* A tap on the email's empty space under the blocks carries on the writing. */
  const onCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const last = blocksRef.current[blocksRef.current.length - 1]
    if (last?.type === "rich" && e.clientY > (blockEl(last.id)?.getBoundingClientRect().bottom ?? Infinity)) {
      e.preventDefault()
      focusText(last.id, "end")
    }
  }

  const only = blocks.length === 1
  /* The button whose sheet is open on a phone. */
  const sheetButton = phone ? ((blocks.find((b) => b.id === selected && b.type === "button") as ButtonBlock | undefined) ?? null) : null

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

      <FormatBar editorRef={rootRef} phone={phone} inserts={INSERT_ITEMS} onInsert={insertAt} blockActions={textActions} fields={FIELDS} />

      <div
        data-email-canvas=""
        onPointerDown={onCanvasPointerDown}
        className="mx-auto min-h-[220px] w-full max-w-[600px] px-5 pb-4 pt-6 text-[#1f2937] sm:px-10 sm:pt-9"
        style={{ fontFamily: EMAIL_FONT, ["--email-link" as string]: theme.link }}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map((b, index) => (
              <Shell
                key={b.id}
                block={b}
                selected={selected === b.id}
                issue={issueFor(b.id)?.message}
                onSelect={() => setSelected(b.id)}
                menu={
                  b.type === "rich" ? null : (
                    <ResponsiveActionMenu
                      title={INSERT_ITEMS.find((x) => x.type === b.type)?.label ?? tt("Block")}
                      align="end"
                      items={actionsFor(b.id)}
                      trigger={
                        <button type="button" aria-label={tt("Block actions")} className={cornerButton} onMouseDown={(e) => e.preventDefault()}>
                          <MoreHorizontal className="h-[18px] w-[18px] md:h-4 md:w-4" />
                        </button>
                      }
                    />
                  )
                }
                panel={
                  selected === b.id ? (
                    b.type === "button" ? (
                      phone ? null : <ButtonPanel block={b} brand={theme.button} onChange={(p) => patch(b.id, p)} />
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
                  <EmailText
                    id={b.id}
                    html={b.html}
                    label={index === 0 ? tt("Email text") : tt("Email text, block {value}", { value: index + 1 })}
                    placeholder={index === 0 && only ? tt("Write your email") : tt("Write here")}
                    quietPlaceholder={!(index === 0 && only)}
                    onChange={(html) => patch(b.id, { html } as Partial<Block>, true)}
                    onRemoveEmpty={only ? undefined : () => removeEmpty(b.id)}
                    className={EMAIL_TYPE}
                  />
                ) : b.type === "button" ? (
                  <ButtonView block={b} theme={theme} onLabel={(label) => patch(b.id, { label } as Partial<Block>, true)} readOnly={phone} />
                ) : b.type === "image" ? (
                  <ImageView block={b} uploading={uploading[b.id]} onDropFile={(f) => void upload(b.id, f)} onUpload={() => startUpload(b.id)} />
                ) : b.type === "product" ? (
                  <ProductView block={b} theme={theme} />
                ) : b.type === "divider" ? (
                  <div className="pb-6 pt-2">
                    <div className="h-px bg-[#e5e7eb]" />
                  </div>
                ) : b.type === "spacer" ? (
                  <div className="flex items-center justify-center rounded-md border border-dashed border-[#e3e4e8] text-[12px] font-medium text-[#9ca3af]" style={{ height: b.size, fontFamily: "Inter, system-ui, sans-serif" }}>
                    {tt("Space")}
                  </div>
                ) : null}
              </Shell>
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {phone ? (
        <BottomSheet
          isOpen={!!sheetButton}
          onClose={() => setSelected(null)}
          label={tt("Button")}
          hideFrom="md"
          aboveKeyboard
          maxHeight="min(80dvh, 640px)"
          header={
            <div className="flex h-11 items-center justify-between gap-3 px-4">
              <h2 className="text-[17px] font-semibold text-[#1a1a2e]">{tt("Button")}</h2>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  ;(document.activeElement as HTMLElement | null)?.blur?.()
                  setSelected(null)
                }}
                className="inline-flex h-9 items-center rounded-full bg-[#f1f2f4] px-4 text-[15px] font-semibold text-[#1a1a2e] active:bg-[#e6e8eb] [-webkit-tap-highlight-color:transparent]"
                data-button-sheet-done=""
              >
                {tt("Done")}
              </button>
            </div>
          }
        >
          <div className="px-4 pb-4 pt-2" data-button-sheet="">
            {sheetButton ? <ButtonPanel block={sheetButton} brand={theme.button} onChange={(p) => patch(sheetButton.id, p, "label" in p)} sheet /> : null}
            {/* The block's own moves, here too: under the sheet the corner menu cannot be reached. */}
            {sheetButton ? (
              <div className="mt-6 grid grid-cols-2 gap-2 border-t border-[#f1f2f4] pt-4" data-button-sheet-actions="">
                {actionsFor(sheetButton.id).map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => a.onClick?.()}
                    className={cn(buttonSecondary, "h-11 justify-center gap-2 text-[15px]", a.variant === "destructive" && "text-[#b42318]")}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}

      <div className="flex items-center justify-center border-t border-[#eef0f2] px-4 py-3">
        <ResponsiveActionMenu
          title={tt("Add a block")}
          align="center"
          menuWidth="w-52"
          items={INSERT_ITEMS.map((item) => ({ label: item.label, onClick: () => add(item.type) }))}
          trigger={
            <button type="button" className={cn(buttonSecondary, "h-11 px-4 text-[15px] md:h-9 md:text-[13px]")} data-add-block="">
              <Plus className="h-4 w-4" />
              {tt("Add a block")}
            </button>
          }
        />
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
      data-selected={selected ? "" : undefined}
      tabIndex={text ? undefined : 0}
      onMouseDown={() => {
        if (!selected) onSelect()
      }}
      className={cn("group/block relative outline-none", isDragging && "z-10 opacity-80")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {/* The handle, in the email's margin, on a wide screen. Anywhere else the block's menu moves it. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute -left-8 top-0 hidden h-7 w-6 cursor-grab items-center justify-center rounded text-[#9ca3af] opacity-0 transition-opacity duration-100 hover:bg-[#f1f2f4] hover:text-[#4b5563] active:cursor-grabbing group-hover/block:opacity-100 group-focus-within/block:opacity-100 lg:flex"
        aria-label={tt("Drag to move")}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {text ? (
        children
      ) : (
        <div className="relative cursor-pointer">
          {/* The outline is drawn around the block, outside it, so picking a block moves nothing. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute -inset-x-2 -bottom-1 -top-1 rounded-xl transition-[box-shadow] duration-100",
              issue
                ? "shadow-[0_0_0_2px_#d72c0d]"
                : selected
                  ? "shadow-[0_0_0_2px_rgba(26,26,46,0.22)]"
                  : "[@media(hover:hover)_and_(pointer:fine)]:group-hover/block:shadow-[0_0_0_1px_#e3e4e8]",
            )}
          />
          {children}
          <div className={cn("absolute -right-3 -top-3 z-[2] transition-opacity duration-100 md:-right-4", selected ? "opacity-100" : "pointer-events-none opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover/block:pointer-events-auto [@media(hover:hover)_and_(pointer:fine)]:group-hover/block:opacity-100")}>
            {menu}
          </div>
        </div>
      )}
      {issue ? <p className="-mt-2 mb-3 text-[12px] text-[#b42318]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>{issue}</p> : null}
      {panel ? <div className="mb-5 [font-family:Inter,system-ui,sans-serif] [&_*]:[font-family:inherit]">{panel}</div> : null}
    </div>
  )
}

/**
 * The email's button (lib/email-campaigns/rich.ts buttonHtml): 12px by 24px,
 * 16px semibold words, 8px corners, the brand's fill and the words that read
 * on it. Its words are typed on it, the field as wide as what is written.
 */
function ButtonView({ block, theme, onLabel, readOnly = false }: { block: ButtonBlock; theme: EmailTheme; onLabel: (label: string) => void; readOnly?: boolean }) {
  const c = buttonColors(block.color, theme)
  return (
    <div className="mb-5" style={{ textAlign: block.align }}>
      <span className="inline-grid max-w-full rounded-lg px-6 py-3 align-top text-[16px] font-semibold leading-5" style={{ backgroundColor: c.fill, color: c.text }}>
        <span aria-hidden className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre">
          {block.label || tt("Button text")}
        </span>
        <input
          data-button-label=""
          value={block.label}
          maxLength={60}
          placeholder={tt("Button text")}
          aria-label={tt("Button text")}
          size={1}
          onChange={(e) => onLabel(e.target.value)}
          /* On a phone the words are typed in the button's sheet: a tap here picks the block, which opens it. */
          readOnly={readOnly}
          tabIndex={readOnly ? -1 : undefined}
          className={cn("col-start-1 row-start-1 w-full min-w-[3ch] cursor-text bg-transparent p-0 text-center text-[16px] font-semibold leading-5 outline-none placeholder:text-current placeholder:opacity-60", readOnly && "pointer-events-none cursor-pointer")}
          style={{ color: c.text }}
        />
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
        className={cn("mb-4 flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center", over ? "border-[#1a1a2e]/40 bg-[#f4f5f7]" : "border-[#d5d7dd] bg-[#fafbfb]")}
        style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      >
        <button type="button" className={buttonSecondary} onClick={onUpload}>
          {tt("Upload an image")}
        </button>
        <p className="mb-0 text-[12px] leading-4 text-[#6b7280]">{tt("or drop one here")}</p>
      </div>
    )
  }
  return (
    <div className="mb-4" style={{ textAlign: block.align }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={block.alt} draggable={false} className={cn("inline-block h-auto max-w-full rounded-lg align-top", uploading && "opacity-50")} style={{ width: `${block.width}%` }} />
    </div>
  )
}

/** The email's product card: a 96px picture, the name, the price and a small button. */
function ProductView({ block, theme }: { block: Block & { type: "product" }; theme: EmailTheme }) {
  if (!block.productId) {
    return (
      <div className="mb-5 flex min-h-[96px] items-center justify-center rounded-xl border border-dashed border-[#d5d7dd] bg-[#fafbfb] px-4 text-[13px] leading-5 text-[#6b7280]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {tt("Choose a product in the settings below")}
      </div>
    )
  }
  const c = buttonColors(block.color, theme)
  return (
    <div className="mb-5 flex items-center gap-4 rounded-xl border border-[#e5e7eb] p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {block.imageUrl ? <img src={block.imageUrl} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" /> : null}
      <div className="min-w-0">
        <p className="mb-1 truncate text-[17px] font-semibold leading-6 text-[#111827]">{block.title}</p>
        {block.price ? <p className="mb-3 text-[15px] leading-[22px] text-[#4b5563]">{block.price}</p> : null}
        <span className="inline-block rounded-lg px-4 py-[9px] text-[14px] font-semibold leading-[18px]" style={{ backgroundColor: c.fill, color: c.text }}>
          {block.cta || tt("View product")}
        </span>
      </div>
    </div>
  )
}

export type { BlockType }
