"use client"

// Tabs content — interactive tabbed panel section. Supports 4 tab
// styles (underline, pill, box, minimal), 3 positions (top, left,
// right), and animated panel transitions.

import { cn } from "@/lib/utils"
import { useState } from "react"
import { sectionColors, str, SectionWrapper, type SectionProps, DynamicIcon } from "../_shared"
import { stableHtml } from "../stable-html"

export function TabsContentSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const blocks = section.blocks ?? []
  const [active, setActive] = useState(0)
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const tabActive = str(s.tab_active_color) || c.accent
  const tabInactive = str(s.tab_inactive_color) || c.text_muted
  const tabBg = str(s.tab_bg_color) || c.background_secondary
  const contentBg = str(s.content_bg_color) || c.bg
  const border = str(s.border_color) || c.border
  const radius = typeof s.border_radius === "number" ? s.border_radius : 8
  const style = str(s.tab_style, "underline")
  const position = str(s.tab_position, "top")
  /* How a tab's panel switches: `tab_animation`, or `animation` for a section saved before it was renamed (section-anchors entranceSetting). */
  const animation = str(s.tab_animation, str(s.animation, "fade"))
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const maxWidthMap: Record<string, string> = { narrow: "max-w-xl", medium: "max-w-3xl", wide: "max-w-(--theme-page-width)", full: "max-w-none" }
  const mw = maxWidthMap[str(s.max_width, "wide")] ?? "max-w-(--theme-page-width)"

  const tabButtonStyle = (i: number): React.CSSProperties => {
    const isActive = i === active
    const c = isActive ? tabActive : tabInactive
    if (style === "pill") return { background: isActive ? tabActive : "transparent", color: isActive ? "#fff" : c, borderRadius: 9999 }
    if (style === "box") return { background: isActive ? contentBg : tabBg, color: c, border: `1px solid ${border}`, borderBottom: isActive ? `1px solid ${contentBg}` : `1px solid ${border}` }
    if (style === "minimal") return { color: c, fontWeight: isActive ? 700 : 500 }
    return { color: c, borderBottom: isActive ? `2px solid ${tabActive}` : "2px solid transparent" }
  }

  const activeBlock = blocks[active]
  const imagePos = str(activeBlock?.settings.image_position, "right")
  const alignment = str(s.alignment, "left")

  const tabBar = (
    <div
      className={cn(
        position === "top" ? "flex flex-wrap gap-2 mb-6" : "flex flex-col gap-2",
        // Alignment only means anything on a horizontal bar; a vertical rail
        // is already as wide as its widest tab.
        position === "top" && alignment === "center" && "justify-center",
        position === "top" && alignment === "right" && "justify-end",
      )}
      style={{ background: style === "box" ? tabBg : "transparent", padding: style === "box" ? 0 : undefined }}
    >
      {blocks.map((b, i) => (
        <button
          key={b.id}
          type="button"
          onClick={e => { e.stopPropagation(); setActive(i) }}
          className="px-4 py-2 text-sm font-semibold flex items-center gap-2 transition"
          style={tabButtonStyle(i)}
        >
          {!!b.settings.icon && (
            <DynamicIcon name={str(b.settings.icon)} className="h-4 w-4" />
          )}
          {str(b.settings.title, `Tab ${i + 1}`)}
          {!!b.settings.badge && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: tabActive, color: "#fff" }}>
              {str(b.settings.badge)}
            </span>
          )}
        </button>
      ))}
    </div>
  )

  const panel = activeBlock && (
    <div
      className={`${animation === "fade" ? "animate-in fade-in" : ""} p-6`}
      style={{ background: contentBg, borderRadius: radius, border: style === "box" ? `1px solid ${border}` : undefined }}
    >
      {imagePos === "top" && !!activeBlock.settings.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={str(activeBlock.settings.image)} alt="" className="w-full h-64 object-cover rounded mb-4" />
      )}
      <div className={imagePos === "left" || imagePos === "right" ? "grid @[768px]:grid-cols-2 gap-6 items-center" : ""}>
        {imagePos === "left" && !!activeBlock.settings.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={str(activeBlock.settings.image)} alt="" className="w-full rounded" />
        )}
        <div>
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={stableHtml(str(activeBlock.settings.content, ""))}
          />
          {!!activeBlock.settings.cta_text && (
            <a
              href={str(activeBlock.settings.cta_url, "#")}
              className="inline-block mt-4 px-4 py-2 rounded text-sm font-semibold"
              style={{ background: tabActive, color: "#fff" }}
            >
              {str(activeBlock.settings.cta_text)}
            </a>
          )}
        </div>
        {imagePos === "right" && !!activeBlock.settings.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={str(activeBlock.settings.image)} alt="" className="w-full rounded" />
        )}
      </div>
    </div>
  )

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={`${mw} mx-auto px-6`} style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {(!!s.heading || !!s.subheading) && (
          <div className="text-center mb-8">
            {!!s.heading && <h2 className="text-3xl font-bold mb-2">{str(s.heading)}</h2>}
            {!!s.subheading && <p className="opacity-70">{str(s.subheading)}</p>}
          </div>
        )}
        {position === "top" ? (
          <>
            {tabBar}
            {panel}
          </>
        ) : (
          <div className={`grid gap-6 ${position === "left" ? "@[768px]:grid-cols-[200px_1fr]" : "@[768px]:grid-cols-[1fr_200px]"}`}>
            {position === "left" ? <>{tabBar}{panel}</> : <>{panel}{tabBar}</>}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default TabsContentSection
