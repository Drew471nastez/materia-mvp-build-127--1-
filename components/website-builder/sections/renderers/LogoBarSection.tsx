"use client"

/**
 * ===========================================================================
 *  THE LOGO BAR
 * ===========================================================================
 * Every logo was a grey box. The block schema calls the image `image`; the
 * renderer read `image_url`, which the schema has never had.
 *
 * The `style` control offered row, scroll and grid and all three rendered the
 * same centred flex row — so the section named "scroll" in its own preset did
 * not scroll. Speed, logo height, opacity, the label, the per-logo link and
 * the padding were declared and ignored.
 */

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

export function LogoBarSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)

  const bg = str(s.bg_color) || c.bg
  const paraColor = str(s.text_color) || c.paragraph
  const blocks = section.blocks ?? []
  const grayscale = bool(s.grayscale, true)
  const showLabel = bool(s.show_label, false)
  const style = str(s.style, "scroll")
  const height = num(s.logo_height, 40)
  const opacity = Math.max(0, Math.min(100, num(s.opacity, 70))) / 100
  const speed = Math.max(5, num(s.speed, 30))

  const logo = (block: (typeof blocks)[number]) => {
    const image = str(block.settings.image)
    const url = str(block.settings.url)
    const label = str(block.settings.label)

    const inner = (
      <div className="flex flex-col items-center gap-1.5">
        {image ? (
          <img
            src={image}
            alt={str(block.settings.alt) || label}
            className={cn("w-auto object-contain", grayscale && "grayscale")}
            style={{ height: `${height}px`, opacity }}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="flex w-24 items-center justify-center rounded bg-gradient-to-br from-neutral-800 to-neutral-900 text-[10px] text-white/60"
            style={{ height: `${height}px` }}
          >
            Logo
          </div>
        )}
        {showLabel && !!label && (
          <span className="text-[11px]" style={{ color: paraColor }}>
            {label}
          </span>
        )}
      </div>
    )

    return url ? (
      <a key={block.id} href={url} className="shrink-0">
        {inner}
      </a>
    ) : (
      <div key={block.id} className="shrink-0">
        {inner}
      </div>
    )
  }

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-(--theme-padding-x) max-w-(--theme-page-width) mx-auto" style={sectionPadding(s, 40)}>
        {!!s.heading && (
          <p
            className="text-center text-sm font-medium mb-6 uppercase tracking-widest"
            style={{ color: paraColor }}
          >
            {str(s.heading)}
          </p>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>
            Add logo blocks in the sidebar
          </p>
        ) : style === "scroll" ? (
          <div className="relative overflow-hidden">
            <style>{`@keyframes logoBarScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
            {/**
             * The row is rendered TWICE and translated by exactly half its
             * width, so the loop point lands on an identical frame. Scrolling
             * one copy the whole way and snapping back is the version people
             * see jump.
             */}
            <div
              className="flex w-max items-center gap-12 motion-reduce:animate-none"
              style={{ animation: `logoBarScroll ${speed}s linear infinite` }}
            >
              {blocks.map(logo)}
              {blocks.map((b) => logo({ ...b, id: `${b.id}-repeat` }))}
            </div>
          </div>
        ) : style === "grid" ? (
          <div className="grid grid-cols-2 items-center justify-items-center gap-8 @[520px]:grid-cols-3 @[760px]:grid-cols-5">
            {blocks.map(logo)}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-12">{blocks.map(logo)}</div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default LogoBarSection
