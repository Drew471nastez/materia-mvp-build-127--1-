"use client"

// Trust badges — block-driven row/grid of reassurance badges.

import { Shield, Lock, CheckCircle, Star, Truck, RefreshCw } from "lucide-react"
import { str, SectionWrapper, type SectionProps } from "../_shared"

const BADGE_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  shield: Shield,
  lock: Lock,
  check: CheckCircle,
  star: Star,
  truck: Truck,
  refresh: RefreshCw,
}

export function TrustBadgesSection({ section, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const blocks = section.blocks ?? []
  const bg = str(s.bg_color, "#ffffff")
  const color = str(s.text_color, "#374151")
  const style = str(s.style, "icon-text")
  const layout = str(s.layout, "row")
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 40
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 40
  const cols = Math.min(Math.max(blocks.length || 4, 1), 4)

  /**
   * Written out, not interpolated. It used to be a template literal —
   * `@[640px]:grid-cols-${cols}` — and Tailwind builds its stylesheet by
   * SCANNING THE SOURCE for whole class names, so a name assembled at runtime
   * is a name that was never compiled. The class was in the DOM and no rule
   * matched it: the grid stayed at two columns however many badges there were.
   */
  const gridCols: Record<number, string> = {
    1: "@[640px]:grid-cols-1",
    2: "@[640px]:grid-cols-2",
    3: "@[640px]:grid-cols-3",
    4: "@[640px]:grid-cols-4",
  }

  const containerClass = layout === "grid"
    ? `grid gap-6 grid-cols-2 ${gridCols[cols] ?? "@[640px]:grid-cols-4"}`
    : "flex flex-wrap items-center justify-center gap-8"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-(--theme-page-width) mx-auto px-(--theme-padding-x)" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {!!s.heading && (
          <h3 className="text-center text-xl font-semibold mb-8">{str(s.heading)}</h3>
        )}
        <div className={containerClass}>
          {blocks.map(b => {
            const Icon = BADGE_ICONS[str(b.settings.icon, "shield")] ?? Shield
            const iconColor = str(b.settings.color, "#4f46e5")
            return (
              <div key={b.id} className="flex items-center gap-3">
                <Icon className="w-8 h-8 shrink-0" style={{ color: iconColor }} />
                {style !== "icon-only" && (
                  <div className="min-w-0">
                    <div className="font-semibold">{str(b.settings.title, "Secure checkout")}</div>
                    {style === "full" && !!b.settings.description && (
                      <div className="text-sm opacity-70">{str(b.settings.description)}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </SectionWrapper>
  )
}

export default TrustBadgesSection
