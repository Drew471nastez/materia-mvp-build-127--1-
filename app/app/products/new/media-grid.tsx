"use client"

/**
 * ===========================================================================
 *  THE PHOTOS AND VIDEOS, IN THE ORDER A BUYER SEES THEM
 * ===========================================================================
 * 16:9 tiles, two to a row on a phone and three wider; a physical
 * product's square tiles four to a row on a phone and six wider, the first
 * (the cover) two by two, about 190px across in the editor as Shopify's
 * are. The first is the product's thumbnail. The order
 * changes by holding a tile and moving it; the rules for mouse, finger and
 * keyboard are ./hold-to-drag.ts, the same as the questions'.
 *
 * WHAT WAS WRONG. A PointerSensor (12px) sat beside the TouchSensor, and it
 * took every touch as a pointer, so a tile moved after 12px with no hold.
 * And each tile was covered by a `touch-action: none` handle, so a swipe
 * over the pictures could never scroll the page: with two tiles a row, most
 * of the section's width. Now the tile is `touch-action: manipulation`: a
 * swipe scrolls, a 300ms hold lifts.
 *
 * THE TILE UNDER THE FINGER stays in the grid and moves by transform only,
 * one to one with the finger, with no transition of its own while it is held.
 * It used to vanish and leave a dashed hole while a portalled copy (tilted,
 * ringed in violet) followed the finger. It lifts on an inner layer, a 3%
 * scale and a shadow, and the others slide out of its way.
 *
 * A TAP DOES WHAT IT DID: the remove button sits above the handle and is its
 * own button, so a tap on it removes and never starts a drag; a tap on the
 * picture does nothing. The pane scrolls by itself near its edges. A
 * touchcancel or Escape puts the order back; only a drop commits, into the
 * form's media, whose order is what the save writes (the first is the cover).
 *
 * `group/tile`, not `group`: app/globals.css strips every transform and
 * transition inside a `.group` on a touch screen, and the lift is both.
 */

import * as React from "react"
import { DndContext, closestCenter, type Announcements, type DragEndEvent, type DragStartEvent, type UniqueIdentifier } from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { GripVertical, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { parseYouTubeUrl, type MediaItem } from "./editor-form"
import { AUTO_SCROLL, HANDLE_TOUCH, liftTick, useHoldToDragSensors } from "./hold-to-drag"
import { PORTRAIT_QUALITY, optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { durationText, videoDuration, videoPosterUrl } from "@/lib/media/video"
import { tt } from "@/lib/i18n/text"
import { FillBar } from "@/components/ui/fill-bar"

const kindOf = (item: MediaItem | undefined) => (item?.type === "youtube" || item?.type === "video" ? "video" : "photo")

/*
  THE TILES ARE THUMBNAILS, NOT THE PHOTOS. Two to a row, 16:9, so about
  170px across on a phone and about 350px in the editor's main column. Each
  tile used to load the ORIGINAL upload: a camera JPEG of three or four
  megabytes painted into a box the size of a stamp, for every picture a
  product has. Opening an editor for a product with six photos fetched
  twenty megabytes before anything could be looked at. These are the files
  the optimizer makes (lib/images/optimized-url.ts, the same endpoint the
  Products list's thumbnails use), and the browser picks by an honest
  `sizes`. The first two tiles are what is in view when the media card is;
  the rest wait until they are scrolled to.
*/
const TILE_FILES = [256, 384, 640, 750]
const TILE_BOX = 256
const TILE_SIZES = "(max-width: 767px) 45vw, 240px"
/** Tiles loaded straight away; the rest when they are scrolled near. */
const TILES_EAGER = 2

/** A photo on its way up: its own preview, shown the moment it is picked. */
export interface PendingMedia {
  id: string
  preview: string
  /** 0 to 100, from the upload's own progress events. */
  progress: number
}

/**
 * `wide`: 16:9 tiles, two to a row, for downloads and courses, whose covers
 * are widescreen. `square`: a physical product's photos as they were taken,
 * the way Shopify lays them out: the first (the one buyers see first) large,
 * the rest square beside and under it, each photo whole on a light ground.
 */
export type MediaShape = "wide" | "square"

export function MediaGrid({
  items,
  pending = [],
  onChange,
  onRemove,
  shape = "wide",
}: {
  items: MediaItem[]
  pending?: PendingMedia[]
  onChange: (update: (prev: MediaItem[]) => MediaItem[]) => void
  onRemove: (id: string) => void
  shape?: MediaShape
}) {
  const sensors = useHoldToDragSensors()
  const [activeId, setActiveId] = React.useState<UniqueIdentifier | null>(null)

  const itemsRef = React.useRef(items)
  itemsRef.current = items
  const place = (id: UniqueIdentifier | undefined) => (id == null ? 0 : itemsRef.current.findIndex((m) => m.id === id) + 1)
  const name = (id: UniqueIdentifier) => {
    const kind = kindOf(itemsRef.current.find((m) => m.id === id))
    return `${kind[0].toUpperCase()}${kind.slice(1)} ${place(id)}`
  }
  const count = items.length
  const at = (n: number) => tt("position {n} of {count}{n, plural, one {, the thumbnail} other {}}", { n, count })
  const announcements: Announcements = {
    onDragStart: ({ active }) => tt("Picked up {value} of {count}.", { value: name(active.id).toLowerCase(), count }),
    onDragOver: ({ active, over }) => (over ? tt("{name} is now at {value}.", { name: name(active.id), value: at(place(over.id)) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? tt("{name} dropped at {value}.", { name: name(active.id), value: at(place(over.id)) }) : tt("Dropped where it was.")),
    onDragCancel: ({ active }) => tt("Cancelled. {name} is back where it was.", { name: name(active.id) }),
  }

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id)
    liftTick(e.activatorEvent)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    onChange((prev) => {
      const from = prev.findIndex((m) => m.id === active.id)
      const to = prev.findIndex((m) => m.id === over.id)
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to)
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={AUTO_SCROLL}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            tt("To move a photo or video, press Space or Enter on it, then the arrow keys. Press Space or Enter again to drop it, or Escape to put it back. The first is the thumbnail."),
        },
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={items.map((m) => m.id)} strategy={rectSortingStrategy}>
        <div
          data-media-grid=""
          data-media-shape={shape}
          data-dragging={activeId != null ? "" : undefined}
          className={shape === "square" ? "grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-2.5" : "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3"}
        >
          {items.map((item, index) => (
            <MediaTile key={item.id} item={item} index={index} onRemove={onRemove} shape={shape} />
          ))}
          {pending.map((p, i) => (
            <PendingTile key={p.id} pending={p} shape={shape} cover={items.length === 0 && i === 0} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function MediaTile({ item, index, onRemove, shape }: { item: MediaItem; index: number; onRemove: (id: string) => void; shape: MediaShape }) {
  const square = shape === "square"
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const kind = kindOf(item)
  /* A video file: its stored first frame when it has one, else the video's own first frame (a <video> below). */
  const poster = item.type === "video" ? videoPosterUrl(item.url) : null
  const src = item.type === "youtube" ? `https://img.youtube.com/vi/${parseYouTubeUrl(item.url)}/hqdefault.jpg` : item.type === "video" ? (poster ?? "") : item.url
  const srcSet = src ? optimizedSrcSet(src, TILE_FILES, PORTRAIT_QUALITY) : ""
  const length = item.type === "video" ? durationText(videoDuration(item.url)) : ""

  return (
    <div
      ref={setNodeRef}
      data-media-id={item.id}
      data-lifted={isDragging ? "" : undefined}
      className={cn("relative", square && index === 0 && "col-span-2 row-span-2")}
      style={{
        /* Whole pixels, both ways: the grid moves a tile sideways as well as up and down. */
        transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      <div
        data-media-tile=""
        className={cn(
          "group/tile relative overflow-hidden rounded-lg border select-none [-webkit-touch-callout:none]",
          square ? "aspect-square bg-[#f8f9fa]" : "aspect-video bg-[#f3f4f6]",
          "transition-[scale,box-shadow,border-color] duration-150 ease-out motion-reduce:transition-none",
          isDragging
            ? "scale-[1.03] border-[#d9dbe0] shadow-[0_14px_30px_-10px_rgba(17,24,39,0.35),0_2px_6px_rgba(17,24,39,0.1)]"
            : "border-gray-200 hover:border-gray-300",
        )}
      >
        {item.type === "video" && !poster ? (
          <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden className="h-full w-full object-cover" />
        ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- the srcset is chosen here (TILE_FILES), see there */
        <img
          src={srcSet ? optimizedImageUrl(src, TILE_BOX, PORTRAIT_QUALITY) : src}
          srcSet={srcSet || undefined}
          sizes={TILE_SIZES}
          alt=""
          width={640}
          height={360}
          loading={index < TILES_EAGER ? undefined : "lazy"}
          decoding="async"
          className={cn("h-full w-full", square && item.type === "image" ? "object-contain" : "object-cover")}
          draggable={false}
        />
        )}
        {item.type === "video" && (
          <span aria-hidden data-media-video="" className="pointer-events-none absolute bottom-1 right-1 inline-flex h-5 items-center gap-1 rounded-md bg-black/60 px-1.5 text-[10px] font-medium tabular-nums text-white sm:bottom-1.5 sm:right-1.5 sm:text-[11px]">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            {length || tt("Video")}
          </span>
        )}
        {item.type === "youtube" && (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 sm:h-10 sm:w-10">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 text-white sm:h-5 sm:w-5" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* The whole tile is the handle: held on a phone, dragged with a mouse, Space from a keyboard. */}
        <div
          ref={setActivatorNodeRef}
          data-media-handle=""
          {...attributes}
          {...listeners}
          aria-label={tt("Move {kind} {value}{value2}", { kind, value: index + 1, value2: index === 0 ? tt(", the thumbnail") : "" })}
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-black/0 outline-none transition-colors group-hover/tile:bg-black/20",
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]",
            HANDLE_TOUCH,
          )}
        >
          <GripVertical className="h-5 w-5 text-white opacity-40 drop-shadow-md transition-opacity group-hover/tile:opacity-100 sm:h-6 sm:w-6 sm:opacity-0" />
        </div>

        <button
          type="button"
          data-media-remove=""
          aria-label={tt("Remove {kind} {value}", { kind, value: index + 1 })}
          onClick={(e) => {
            e.stopPropagation()
            onRemove(item.id)
          }}
          className="absolute right-1 top-1 z-10 rounded-full bg-white/90 p-1.5 opacity-100 shadow-sm transition-opacity sm:right-1.5 sm:top-1.5 sm:p-1 sm:opacity-0 sm:group-hover/tile:opacity-100 sm:focus-visible:opacity-100"
        >
          <X className="h-3 w-3 text-gray-600" />
        </button>

        <div aria-hidden className="pointer-events-none absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/50 text-[10px] font-medium text-white sm:left-1.5 sm:top-1.5">
          {index + 1}
        </div>
        {index === 0 && item.type === "image" && (
          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white sm:bottom-1.5 sm:left-1.5 sm:text-[10px]">
            {tt("Thumbnail")}
          </span>
        )}
        {item.type === "youtube" && (
          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] text-white sm:bottom-1.5 sm:left-1.5 sm:text-[10px]">
            YouTube
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * A PHOTO ON ITS WAY UP. The picture itself, the moment it is chosen, soft
 * and a little dim, coming into focus as its bytes go up, with a hairline
 * along its foot that fills with them. No spinner and no box: the tile is
 * already where the photo will sit, so when it lands nothing moves.
 */
function PendingTile({ pending, shape = "wide", cover = false }: { pending: PendingMedia; shape?: MediaShape; cover?: boolean }) {
  const p = Math.max(0, Math.min(100, pending.progress)) / 100
  return (
    /* The first photo of a product lands as the cover, two by two: it is drawn that size while it uploads, so nothing jumps when it lands. */
    <div data-media-pending="" className={cn("relative animate-in fade-in zoom-in-[0.97] duration-300 ease-out motion-reduce:animate-none", shape === "square" && cover && "col-span-2 row-span-2")}>
      <div className={cn("relative overflow-hidden rounded-lg border border-gray-200 select-none", shape === "square" ? "aspect-square bg-[#f8f9fa]" : "aspect-video bg-[#f3f4f6]")}>
        {/* A video on its way up has no picture yet: the grey tile and its progress. */}
        {pending.preview ? <img
          src={pending.preview}
          alt=""
          draggable={false}
          className="h-full w-full object-cover transition-[filter,transform] duration-500 ease-out motion-reduce:transition-none"
          style={{ filter: `blur(${(1 - p) * 10}px) saturate(${0.6 + p * 0.4}) brightness(${0.92 + p * 0.08})`, transform: `scale(${1.04 - p * 0.04})` }}
        /> : null}
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute inset-y-0 -left-1/2 w-1/2 animate-[media-sheen_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:hidden" />
        </span>
        <FillBar
          value={Math.round(pending.progress)}
          label={pending.preview ? tt("Uploading photo") : tt("Uploading video")}
          size="thin"
          tone="light"
          on="light-media"
          className="absolute inset-x-2.5 bottom-2.5 w-auto shadow-[0_1px_2px_rgba(0,0,0,0.15)]"
        />
      </div>
    </div>
  )
}
