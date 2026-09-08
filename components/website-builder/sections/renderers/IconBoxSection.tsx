"use client"

import {
  Truck, CheckCircle, MessageCircle, CreditCard, Ship,
  MapPin, Leaf, Flower, Phone, Mail, ShoppingBag, Headphones, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

// ── Icon box (feature grid with icons) ───────────────────────
const ICON_BOX_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  free_shipping: Truck,
  check_badge: CheckCircle,
  message_communications: MessageCircle,
  payment: CreditCard,
  boat: Ship,
  truck: Truck,
  location: MapPin,
  leaf: Leaf,
  blossom: Flower,
  phone: Phone,
  email: Mail,
  chat: MessageCircle,
  bag: ShoppingBag,
  support: Headphones,
  tree: Leaf,
}

export function IconBoxSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const blocks = section.blocks ?? []
  const cols = Math.max(1, Math.min(5, Number(s.items_per_row ?? 4)))
  const gap = Number(s.column_gap ?? 24)
  const iconSize = Number(s.icon_size ?? 40)
  const iconPosition = str(s.icon_position, "top")
  const showBorder = bool(s.show_border)
  const enableBg = bool(s.enable_background)
  const align = str(s.content_alignment, "center")
  const headerAlign = str(s.header_alignment, "center")

  const alignClass: Record<string, string> = { left: "text-left items-start", center: "text-center items-center", right: "text-right items-end" }
  const headerAlignClass: Record<string, string> = { left: "text-left", center: "text-center", right: "text-right" }
  const colsClass: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-1 @[640px]:grid-cols-2", 3: "grid-cols-1 @[640px]:grid-cols-3", 4: "grid-cols-2 @[768px]:grid-cols-4", 5: "grid-cols-2 @[768px]:grid-cols-5" }

  return (
    <SectionWrapper bgColor={c.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className="px-8 max-w-[1230px] mx-auto"
        style={{ paddingTop: Number(s.padding_top ?? 60), paddingBottom: Number(s.padding_bottom ?? 60) }}
      >
        {(!!s.heading || !!s.description) && (
          <div className={cn("mb-10", headerAlignClass[headerAlign])}>
            {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: c.heading, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
            {!!s.description && <p className="text-base" style={{ color: c.paragraph }}>{str(s.description)}</p>}
          </div>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: c.paragraph }}>Add icon box blocks in the sidebar</p>
        ) : (
          <div className={cn("grid", colsClass[cols])} style={{ gap: `${gap}px` }}>
            {blocks.map(block => {
              const iconKey = str(block.settings.icon_svg, "truck")
              const IconCmp = ICON_BOX_MAP[iconKey] ?? Zap
              const imgUrl = str(block.settings.icon_image)
              return (
                <div
                  key={block.id}
                  className={cn(
                    "p-5 flex gap-4",
                    iconPosition === "top" ? "flex-col" : "flex-row",
                    alignClass[align],
                    showBorder && "border rounded-lg",
                  )}
                  style={{
                    borderColor: showBorder ? c.border : undefined,
                    background: enableBg ? c.plan_bg : undefined,
                    borderRadius: showBorder || enableBg ? 12 : undefined,
                  }}
                >
                  <div
                    className={cn("flex items-center justify-center shrink-0", iconPosition === "top" ? "" : "")}
                    style={{ color: c.heading }}
                  >
                    {imgUrl ? (
                      <img src={imgUrl} alt="" style={{ width: iconSize, height: iconSize }} className="object-contain" />
                    ) : (
                      <IconCmp className="" strokeWidth={1.5} />
                    )}
                    {/* ensure icon sizing for lucide */}
                    <style>{`.icon-box-${block.id} svg { width: ${iconSize}px; height: ${iconSize}px; }`}</style>
                  </div>
                  <div className={cn("flex flex-col gap-2", alignClass[align])}>
                    <div className="font-semibold text-[16px]" style={{ color: c.heading }}>{str(block.settings.heading, "Heading")}</div>
                    {!!block.settings.description && (
                      <div className="text-sm" style={{ color: c.paragraph }}>{str(block.settings.description)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default IconBoxSection
