"use client"

/**
 * The photos-and-video list, for wherever a creator edits one.
 *
 * There were two: the store builder's sidebar had thumbnails, captions and
 * drag-to-reorder, and the storefront's story dialog had a column of raw
 * Supabase URLs with a delete button — which is what a creator saw when they
 * edited their own page. Same data, same job, one of them plainly worse.
 *
 * It also carried the FOURTH copy of the YouTube regex. All parsing now
 * happens in lib/social/video, which is also why Vimeo works here.
 *
 * WHAT A ROW SHOWS: the picture, not the address. `https://skgtqglupjcnfhf
 * scink.supabase.co/storage/v1/object/public/...` tells a creator nothing they
 * can act on, takes the whole width to do it, and looks like an error message.
 * A thumbnail says which item it is in one glance.
 *
 * A VIDEO'S URL STAYS EDITABLE, because a video row has nothing else to
 * identify it by and re-pasting a link should not mean deleting and re-adding.
 * An image's does not: replacing an image means uploading another one.
 */

import * as React from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Play, Trash2 } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { parseVideoUrl } from "@/lib/social/video"
import type { AboutMediaItem } from "@/lib/store-builder/types"

/**
 * `"youtube"` is the legacy label for a video and still arrives from stored
 * rows; `"video"` is what new ones are written as. Both mean the same thing,
 * and nothing downstream should branch on which.
 */
export function isVideoItem(item: AboutMediaItem): boolean {
  return item.type !== "image"
}

function SortableMediaItem({
  item,
  onRemove,
  onUpdateCaption,
  onUpdateUrl,
}: {
  item: AboutMediaItem
  onRemove: (id: string) => void
  onUpdateCaption: (id: string, caption: string) => void
  onUpdateUrl: (id: string, url: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const video = isVideoItem(item) ? parseVideoUrl(item.url) : null
  const thumbnail = item.type === "image" ? item.url : video?.thumbnailUrl
  const [draft, setDraft] = React.useState(item.url)
  React.useEffect(() => setDraft(item.url), [item.url])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.url) onUpdateUrl(item.id, trimmed)
    else setDraft(item.url)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group space-y-2 rounded-lg border border-border bg-background p-2",
        // Lifted, not faded: a half-transparent card you are holding reads as
        // broken. A shadow and a ring read as picked up.
        isDragging && "z-50 shadow-lg ring-2 ring-ring/40",
      )}
    >
      <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
        {/*
          No thumbnail, no <img>. Vimeo's still needs an oEmbed call, which a
          render pass should not make — and the first version loaded
          /placeholder.jpg instead and then dimmed it, which is a wasted
          request that arrives looking like a broken photo. The muted surface
          the card already has is a better empty than a picture of nothing.
        */}
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            draggable={false}
            className="h-full w-full select-none object-cover"
          />
        ) : null}

        {video && (
          <>
            <div className={cn("absolute inset-0 grid place-items-center", thumbnail && "bg-black/25")}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow">
                <Play className="ml-0.5 h-4 w-4 fill-current text-gray-900" />
              </span>
            </div>
            {/*
              The provider by name, in the page's own neutral chrome. The
              previous version drew a red YouTube badge, which is a brand
              colour on a control that is not YouTube's — and it said
              "YouTube" over a Vimeo link.
            */}
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {video.label}
            </span>
          </>
        )}

        {/*
          Both controls sit in the same corner treatment and appear together on
          hover — and stay visible on touch, where there is no hover to reveal
          them.
        */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="absolute left-1.5 top-1.5 grid h-7 w-7 cursor-grab touch-none place-items-center rounded-md bg-white/90 text-gray-700 opacity-100 shadow-sm backdrop-blur transition-opacity hover:bg-white active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label="Remove"
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-white/90 text-gray-700 opacity-100 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {video !== null || isVideoItem(item) ? (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.key === "Escape") setDraft(item.url)
          }}
          aria-label="Video link"
          placeholder="YouTube or Vimeo link"
          className={cn("h-8 text-xs", !video && "border-destructive text-destructive")}
        />
      ) : null}

      <CaptionField value={item.caption || ""} onChange={(caption) => onUpdateCaption(item.id, caption)} />
    </div>
  )
}

/** The page's own cap (app/api/creator-profile): a caption is a line, not a paragraph. */
export const CAPTION_MAX = 160

/**
 * ===========================================================================
 *  A CAPTION IS WRITTEN WHERE IT WILL BE READ (round 50)
 * ===========================================================================
 * It was a boxed 32px input in 12px type reading "Add caption (optional)"
 * under every picture: a form field per photo, so a drawer with four
 * pictures was four more empty boxes asking to be filled, and a caption
 * longer than the box scrolled sideways out of sight.
 *
 * Now it reads as text. Empty, it is one quiet line, "Add a caption"; with
 * a caption it is that caption, wrapping onto as many lines as it has (up
 * to the cap). Pointing at it or tabbing to it shows it can be edited; Enter
 * keeps it and leaves, Escape puts back what was there, and the count only
 * appears near the end of what fits.
 */
export function CaptionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const before = React.useRef(value)
  const [focused, setFocused] = React.useState(false)

  /* 16px on a phone: iOS zooms the page into any smaller field it focuses. Grow with the words. `field-sizing: content` does this where it exists; the height is set for the rest. */
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  const left = CAPTION_MAX - value.length
  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={CAPTION_MAX}
        aria-label="Caption"
        placeholder="Add a caption"
        enterKeyHint="done"
        spellCheck
        onFocus={() => {
          before.current = value
          setFocused(true)
        }}
        onBlur={() => {
          setFocused(false)
          /* Spaces at either end are not a caption. */
          if (value !== value.trim()) onChange(value.trim())
        }}
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === "Escape") {
            /* Escape here undoes the caption; it does not close the sheet around it. */
            e.preventDefault()
            e.stopPropagation()
            onChange(before.current)
            e.currentTarget.blur()
          }
        }}
        className={cn(
          "block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[16px] leading-[22px] text-foreground [field-sizing:content] sm:text-[13px] sm:leading-[18px]",
          "placeholder:text-muted-foreground/80 transition-colors hover:bg-muted/60",
          "focus:border-border focus:bg-background focus:outline-none focus:ring-2 focus:ring-neutral-900/10",
        )}
      />
      {focused && left <= 40 ? (
        <span aria-live="polite" className={cn("pointer-events-none absolute bottom-1 right-2 text-[11px] tabular-nums", left <= 10 ? "text-[#b42318]" : "text-muted-foreground")}>
          {left}
        </span>
      ) : null}
    </div>
  )
}

export function MediaItemsEditor({
  items,
  onChange,
  className,
}: {
  items: AboutMediaItem[]
  onChange: (next: AboutMediaItem[]) => void
  className?: string
}) {
  const sensors = useSensors(
    // 8px before a drag starts, so a tap on the handle is still a tap and a
    // scroll on a phone is still a scroll.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (items.length === 0) return null

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(items, from, to))
  }

  const update = (id: string, patch: Partial<AboutMediaItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className={cn("grid grid-cols-2 gap-2", className)}>
          {items.map((item) => (
            <SortableMediaItem
              key={item.id}
              item={item}
              onRemove={(id) => onChange(items.filter((i) => i.id !== id))}
              onUpdateCaption={(id, caption) => update(id, { caption })}
              onUpdateUrl={(id, url) => update(id, { url })}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
