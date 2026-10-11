"use client"

/**
 * ===========================================================================
 *  THE SLIDESHOW
 * ===========================================================================
 * It did not advance. `autoplay` and `autoplay_speed` were declared and never
 * read, so a slideshow sat on slide one until somebody clicked a dot — and the
 * arrows the panel offered were never rendered at all.
 *
 * Every slide showed a grey gradient: the block schema calls the image
 * `image`, the renderer read `image_url`. The button was the same story —
 * schema `cta_text`, renderer `button_text` — so it was a `<button>` that went
 * nowhere even when it appeared, because `cta_url` was never read either.
 *
 * The height came from `s.height`, which the schema does not have; the real
 * control is `slide_height`, so the slider did nothing and every slideshow was
 * 500px. Fifteen of seventeen controls did nothing.
 */

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  bool,
  buttonRadiusStyle,
  hexToRgba,
  num,
  sectionColors,
  sectionPadding,
  str,
  SectionWrapper,
  type SectionProps, schemeButton, firstPicture } from "../_shared"

export function SlideshowSection({ section, theme, isEditing, isSelected, onClick, pageIndex }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg === "#ffffff" ? "#000000" : c.bg
  const blocks = section.blocks ?? []

  const slides =
    blocks.length > 0
      ? blocks
      : [
          { id: "1", type: "slide", settings: { heading: "Slide 1", subheading: "Your first slide", cta_text: "Shop now" } },
          { id: "2", type: "slide", settings: { heading: "Slide 2", subheading: "Your second slide", cta_text: "Learn more" } },
        ]

  const [active, setActive] = useState(0)
  const count = slides.length
  const index = Math.min(active, count - 1)

  const autoplay = bool(s.autoplay, true)
  // A second is the floor: anything below it is a strobe, not a slideshow.
  const speed = Math.max(1000, num(s.autoplay_speed, 5000))
  const transition = str(s.transition_style, "slide")

  useEffect(() => {
    if (!autoplay || count < 2) return
    /**
     * Not while the editor has this section selected — a slideshow that
     * advances under somebody editing slide three moves the thing they are
     * working on out from under them.
     */
    if (isSelected) return
    const id = setInterval(() => setActive((i) => (i + 1) % count), speed)
    return () => clearInterval(id)
  }, [autoplay, speed, count, isSelected])

  const height = Math.max(160, num(s.slide_height, 600))

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div style={sectionPadding(s, 0)}>
        <div className="relative w-full overflow-hidden" style={{ height: `${height}px` }}>
          {slides.map((slide, i) => {
            const b = slide.settings
            const image = str(b.image)
            const position = str(b.position, "center")
            const isActive = i === index
            const slideText = str(b.text_color, "#ffffff")

            return (
              <div
                key={slide.id}
                aria-hidden={!isActive}
                className={cn(
                  "absolute inset-0",
                  // "slide" moves them across, the two fade styles cross over
                  // in place. All three rendered identically before.
                  transition === "slide"
                    ? "transition-transform duration-700 ease-out"
                    : "transition-opacity duration-700 ease-out",
                )}
                style={
                  transition === "slide"
                    ? { transform: `translateX(${(i - index) * 100}%)` }
                    : {
                        opacity: isActive ? 1 : 0,
                        // Crossfade leaves the outgoing slide underneath; a
                        // plain fade takes it out of the stack first.
                        zIndex: isActive ? 2 : transition === "crossfade" ? 1 : 0,
                        pointerEvents: isActive ? "auto" : "none",
                      }
                }
              >
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? firstPicture(pageIndex).fetchPriority : undefined}
                    decoding="async"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: "#000", opacity: num(b.overlay_opacity, 30) / 100 }}
                />
                <div
                  className={cn(
                    "absolute inset-0 mx-auto flex max-w-(--theme-page-width) flex-col justify-center gap-4 px-(--theme-padding-x)",
                    position === "left"
                      ? "items-start text-left"
                      : position === "right"
                        ? "items-end text-right"
                        : "items-center text-center",
                  )}
                  style={{ color: slideText }}
                >
                  {!!b.heading && (
                    <h2
                      className="font-bold text-4xl @[768px]:text-[length:var(--slide-heading)]"
                      style={
                        {
                          fontFamily: theme.font_heading,
                          "--slide-heading": `${num(s.font_size_heading, 48)}px`,
                        } as React.CSSProperties
                      }
                    >
                      {str(b.heading)}
                    </h2>
                  )}
                  {!!b.subheading && <p className="max-w-xl text-lg opacity-90">{str(b.subheading)}</p>}
                  {!!b.cta_text && (
                    <a
                      href={str(b.cta_url, "#")}
                      className="mt-2 inline-block px-8 py-3 text-sm font-semibold"
                      data-sl-button="primary"
                      style={{
                        ...schemeButton(c, "primary").style,
                        ...buttonRadiusStyle(theme),
                      }}
                    >
                      {str(b.cta_text)}
                    </a>
                  )}
                </div>
              </div>
            )
          })}

          {bool(s.show_arrows, true) && count > 1 && (
            <>
              <button
                aria-label="Previous slide"
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 backdrop-blur transition-colors"
                style={{ background: hexToRgba("#000000", 0.35), color: "#ffffff" }}
                onClick={(e) => {
                  e.stopPropagation()
                  setActive((i) => (i - 1 + count) % count)
                }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                aria-label="Next slide"
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 backdrop-blur transition-colors"
                style={{ background: hexToRgba("#000000", 0.35), color: "#ffffff" }}
                onClick={(e) => {
                  e.stopPropagation()
                  setActive((i) => (i + 1) % count)
                }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {bool(s.show_dots, true) && count > 1 && (
            <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-all",
                    i === index ? "bg-white" : "bg-white/40",
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActive(i)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default SlideshowSection
