"use client"

/**
 * The gallery's tiles (./gallery-editor.tsx draws the grid, the drag and the
 * uploads): one picture or video, and one file on its way up.
 */
import { useSortable } from "@dnd-kit/sortable"
import { Loader2, MoreHorizontal, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { HANDLE_TOUCH } from "@/app/app/products/new/hold-to-drag"
import { sortableMove } from "@/lib/ui/sortable-move"
import type { GalleryItem } from "./logic"
import type { GalleryVideoView } from "./view-types"
import { tt } from "@/lib/i18n/text"

export interface Uploading {
  key: string
  kind: "image" | "video"
  name: string
  percent: number
  preview: string | null
}

const PROVIDER = { youtube: "YouTube", vimeo: "Vimeo" } as const

function duration(s: number | null): string {
  if (!s) return ""
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`
}

const kindWord = (item: GalleryItem) => (item.type === "image" ? tt("picture") : tt("video"))

/**
 * ONE TILE. The whole tile is the handle (held on a phone, dragged with a
 * mouse, Space from the keyboard), as in the product editor; its menu sits
 * above the handle and is its own button, so a tap on it never starts a
 * drag. It moves on the compositor only (lib/ui/sortable-move), one to one
 * with the finger, and lifts on an inner layer (a 3% scale and a shadow)
 * while it is held.
 *
 * `group/tile`, not `group`: app/globals.css strips every motion inside a
 * `.group` on a touch screen, and the lift is motion.
 */
export function GalleryTile({ id, item, index, count, video, onMove, onRemove }: { id: string; item: GalleryItem; index: number; count: number; video?: GalleryVideoView; onMove: (from: number, to: number) => void; onRemove: (i: number) => void }) {
  const sortable = useSortable({ id })
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = sortable
  const still = item.type === "image" ? optimizedImageUrl(item.url, 480) : item.type === "embed" ? item.thumb : video?.thumbnailUrl
  const kind = kindWord(item)
  const menu: ActionMenuItem[] = [
    ...(index > 0 ? [{ label: tt("Show first"), onClick: () => onMove(index, 0) }, { label: tt("Move earlier"), onClick: () => onMove(index, index - 1) }] : []),
    ...(index < count - 1 ? [{ label: tt("Move later"), onClick: () => onMove(index, index + 1) }] : []),
    { label: tt("Remove"), variant: "destructive" as const, separatorBefore: count > 1, onClick: () => onRemove(index) },
  ]
  return (
    <li
      ref={setNodeRef}
      data-gallery-item={item.type}
      data-gallery-key={id}
      data-lifted={isDragging ? "" : undefined}
      className="relative list-none"
      style={sortableMove(sortable)}
    >
      <div
        className={cn(
          "group/tile relative aspect-[16/10] overflow-hidden rounded-xl bg-[#eceef1] select-none [-webkit-touch-callout:none]",
          "transition-[scale,box-shadow] duration-150 ease-out motion-reduce:transition-none",
          isDragging ? "scale-[1.03] shadow-[0_14px_30px_-10px_rgba(17,24,39,0.35),0_2px_6px_rgba(17,24,39,0.1)]" : "shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.05)]",
        )}
      >
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={still} alt="" draggable={false} loading={index < 4 ? undefined : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="absolute inset-0 bg-[#1a1a2e]" />
        )}
        {item.type !== "image" ? (
          <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
          </span>
        ) : null}

        {/* The handle: the whole tile. */}
        <div
          ref={setActivatorNodeRef}
          data-gallery-handle=""
          {...attributes}
          {...listeners}
          aria-label={tt("Move {kind} {value}", { kind, value: index + 1 })}
          className={cn("absolute inset-0 bg-black/0 outline-none transition-colors duration-100 group-hover/tile:bg-black/10 focus-visible:shadow-[inset_0_0_0_2px_#1a1a2e]", HANDLE_TOUCH)}
        />

        <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1">
          <span aria-hidden className="grid h-5 min-w-5 place-items-center rounded-md bg-black/55 px-1 text-[11px] font-medium tabular-nums text-white">{index + 1}</span>
          {index === 0 ? <span className="rounded-md bg-white/92 px-1.5 py-0.5 text-[11px] font-medium text-[#1a1a2e]">{tt("First")}</span> : null}
        </span>
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1">
          {item.type === "video" && video && video.status !== "ready" ? <span className="rounded-md bg-white/92 px-1.5 py-0.5 text-[11px] font-medium text-[#92400e]">{video.status === "failed" ? tt("Failed") : tt("Processing")}</span> : null}
          {item.type === "embed" ? <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">{PROVIDER[item.provider]}</span> : null}
          {item.type === "video" && video?.durationSeconds ? <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">{duration(video.durationSeconds)}</span> : null}
        </span>

        {/* The menu: over the handle, its own button. Always there on a touch screen; under the pointer or the keyboard on a computer. */}
        <span className="absolute right-0.5 top-0.5 z-10 opacity-100 transition-opacity duration-100 md:opacity-0 md:group-hover/tile:opacity-100 md:group-focus-within/tile:opacity-100 md:[&:has([data-state=open])]:opacity-100">
          <ResponsiveActionMenu
            title={item.type === "image" ? tt("Picture {value}", { value: index + 1 }) : tt("Video {value}", { value: index + 1 })}
            align="end"
            items={menu}
            trigger={
              <button type="button" aria-label={tt("Options for {kind} {value}", { kind, value: index + 1 })} data-tile-menu="" className="grid h-10 w-10 cursor-pointer place-items-center outline-none [-webkit-tap-highlight-color:transparent] focus-visible:[&>span]:shadow-[0_0_0_2px_#1a1a2e]">
                {/* Drawn 28px, pressed 40px: the picture stays the thing you see. */}
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
                  <MoreHorizontal className="h-4 w-4" />
                </span>
              </button>
            }
          />
        </span>
      </div>
    </li>
  )
}

/**
 * A FILE ON ITS WAY UP (the product editor's PendingTile): a picture shows
 * itself the moment it is picked, soft and a little dim, coming into focus
 * as its bytes go up, with a line along its foot that fills with them. A
 * video has no picture yet: the grey tile, its percent and the line.
 */
export function PendingTile({ pending }: { pending: Uploading }) {
  const p = Math.max(0, Math.min(100, pending.percent)) / 100
  return (
    <li data-gallery-uploading={pending.kind} className="relative list-none animate-in fade-in zoom-in-[0.97] duration-300 ease-out motion-reduce:animate-none">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-[#eceef1] select-none">
        {pending.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pending.preview}
            alt=""
            draggable={false}
            className="h-full w-full object-cover transition-[filter,scale] duration-500 ease-out motion-reduce:transition-none"
            style={{ filter: `blur(${(1 - p) * 10}px) saturate(${0.6 + p * 0.4}) brightness(${0.92 + p * 0.08})`, scale: String(1.04 - p * 0.04) }}
          />
        ) : (
          <span className="absolute inset-0 grid place-content-center justify-items-center gap-1.5 text-[#4b5563]">
            <Loader2 aria-hidden className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            <span className="text-[12px] font-medium tabular-nums">{tt("Video {percent}%", { percent: pending.percent })}</span>
          </span>
        )}
        <span
          role="progressbar"
          aria-label={pending.kind === "video" ? tt("Uploading video") : tt("Uploading picture")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pending.percent}
          className="absolute inset-x-2.5 bottom-2.5 h-[3px] overflow-hidden rounded-full bg-black/15"
        >
          <span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.2)] transition-[scale] duration-300 ease-out motion-reduce:transition-none" style={{ scale: `${p.toFixed(3)} 1` }} />
        </span>
      </div>
    </li>
  )
}
