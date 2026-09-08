"use client"

/**
 * ===========================================================================
 *  THE GALLERY
 * ===========================================================================
 * Every photo was a grey placeholder. The block schema calls the image
 * `image`; the renderer read `block.settings.image_url`, which the schema has
 * never had, so `image_url ? <img> : <placeholder>` took the placeholder
 * branch for every gallery ever built.
 *
 * Layout, gap, hover effect, lightbox, captions, alt text and per-image links
 * were declared and ignored as well — the section had one hard-coded square
 * grid with a fixed 16px gap.
 */

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import {
  bool,
  num,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps,
} from "../_shared"

const COLUMNS: Record<string, string> = {
  // Spelled out. `grid-cols-${n}` is a class Tailwind never sees and so never
  // compiles — the same defect this library had in its trust badges.
  "2": "grid-cols-1 @[520px]:grid-cols-2",
  "3": "grid-cols-2 @[720px]:grid-cols-3",
  "4": "grid-cols-2 @[720px]:grid-cols-4",
}

export function GallerySection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = str(s.bg_color) || c.bg
  const cols = str(s.columns, "3")
  const layout = str(s.layout, "grid")
  const gap = num(s.gap, 8)
  const effect = str(s.hover_effect, "zoom")
  const lightbox = bool(s.lightbox, true)
  const blocks = section.blocks ?? []

  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null)
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % blocks.length))
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + blocks.length) % blocks.length))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, blocks.length])

  /**
   * A masonry column count is a CSS column count, not a grid: the whole point
   * is that the tiles keep their own heights.
   */
  const container =
    layout === "masonry"
      ? cn("columns-2", cols === "4" ? "@[720px]:columns-4" : cols === "2" ? "@[520px]:columns-2" : "@[720px]:columns-3")
      : layout === "carousel"
        ? "flex overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:thin]"
        : cn("grid", COLUMNS[cols] ?? COLUMNS["3"])

  const tiles = blocks.map((block, i) => {
    const image = str(block.settings.image)
    const caption = str(block.settings.caption)
    const href = str(block.settings.link)

    const media = image ? (
      <img
        src={image}
        alt={str(block.settings.alt)}
        className={cn(
          "h-full w-full object-cover transition-transform duration-500",
          effect === "zoom" && "group-hover:scale-105",
        )}
        loading="lazy"
        decoding="async"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 text-xs text-white/50">
        Image
      </div>
    )

    const inner = (
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl",
          layout === "masonry" ? "mb-[var(--gallery-gap)] break-inside-avoid" : "aspect-square",
          layout === "carousel" && "aspect-square w-[70%] shrink-0 snap-start @[720px]:w-[38%]",
          // A tile that opens something has to look like it does.
          (lightbox || href) && "cursor-pointer",
        )}
      >
        {media}
        {effect === "overlay" && (
          <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/35" />
        )}
        {!!caption && effect === "caption" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/75 to-transparent p-3 text-xs text-white transition-transform duration-300 group-hover:translate-y-0">
            {caption}
          </div>
        )}
        {!!caption && effect !== "caption" && (
          <span className="sr-only">{caption}</span>
        )}
      </div>
    )

    // A per-image link wins over the lightbox: somebody who set one meant it.
    if (href) {
      return (
        <a key={block.id} href={href} className="block">
          {inner}
        </a>
      )
    }
    return (
      <div
        key={block.id}
        onClick={lightbox && image ? () => setOpen(i) : undefined}
        role={lightbox && image ? "button" : undefined}
        tabIndex={lightbox && image ? 0 : undefined}
        onKeyDown={
          lightbox && image
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setOpen(i)
                }
              }
            : undefined
        }
      >
        {inner}
      </div>
    )
  })

  const opened = open !== null ? blocks[open] : null

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 max-w-[1230px] mx-auto" style={sectionPadding(s, 60)}>
        {!!s.heading && (
          <h2
            className="text-3xl font-bold mb-8 text-center"
            style={{ color: str(s.text_color) || c.heading, fontFamily: theme.font_heading }}
          >
            {str(s.heading)}
          </h2>
        )}
        {blocks.length === 0 ? (
          <div className={cn("grid gap-4", COLUMNS[cols] ?? COLUMNS["3"])}>
            {Array.from({ length: Number(cols) || 3 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center text-xs text-white/50"
              >
                Photo
              </div>
            ))}
          </div>
        ) : (
          <div
            className={container}
            style={{ gap: `${gap}px`, ["--gallery-gap" as string]: `${gap}px` }}
          >
            {tiles}
          </div>
        )}
      </div>

      {opened && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          <figure className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img
              src={str(opened.settings.image)}
              alt={str(opened.settings.alt)}
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
            {!!opened.settings.caption && (
              <figcaption className="mt-3 text-center text-sm text-white/80">
                {str(opened.settings.caption)}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </SectionWrapper>
  )
}

export default GallerySection
