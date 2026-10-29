/**
 * THE BLOCKS ON A THEME'S CARD, LAID OUT AS THE THEME LAYS THEM OUT.
 *
 * A theme card was always three buttons in a column. A theme sets its
 * layout now (lib/onepage/theme-layout), so the card draws it: three rows
 * for a list, four thin rows for Compact, two by two tiles for Grid, a card
 * with its picture and a row under it for Cards. The buttons are drawn the
 * way the page draws them, at a card's size: Solid, Soft, Outline or Glass,
 * the corners, the border and the shadow, hard ones included. Every layout
 * is the same height (65px), so cards of different themes line up.
 */
import type * as React from "react"
import { blockLayoutOf, themeProductLayoutOf } from "@/lib/onepage/theme-layout"

type CardConfig = Record<string, any>

export function cardButtonLook(c: CardConfig, scale = 0.5): React.CSSProperties {
  const radius = Math.min((c.button_border_radius ?? 8) * scale, 9)
  const border = c.button_border_width || 0
  const shadowInk = c.button_shadow_color || "#000000"
  const shadow = c.button_shadow === "hard" ? `2px 2px 0 ${shadowInk}` : c.button_shadow === "strong" ? "0 3px 8px rgba(0,0,0,0.22)" : c.button_shadow === "subtle" ? "0 1px 3px rgba(0,0,0,0.12)" : "none"
  if (c.button_style === "outline") return { background: "transparent", border: `${Math.max(1.5, Math.min(border, 2))}px solid ${c.button_border_color || c.button_color}`, borderRadius: radius, boxShadow: shadow }
  if (c.button_style === "glass") return { background: "rgba(255,255,255,0.15)", border: `1px solid ${border ? c.button_border_color : "rgba(255,255,255,0.22)"}`, borderRadius: radius, backdropFilter: "blur(6px)", boxShadow: shadow }
  if (c.button_style === "soft") return { background: `color-mix(in srgb, ${c.button_color} 14%, transparent)`, border: border ? `${Math.min(border, 2)}px solid ${c.button_border_color}` : undefined, borderRadius: radius, boxShadow: shadow }
  return { background: c.button_color, border: border ? `${Math.min(border, 2)}px solid ${c.button_border_color}` : undefined, borderRadius: radius, boxShadow: shadow }
}

/**
 * Round 42: a theme that shows products its own way says so on its card: two
 * small tiles with a picture (Grid), or two rows with a price pill (Rows).
 */
function CardProducts({ c, look, ink }: { c: CardConfig; look: React.CSSProperties; ink: string }) {
  const kind = themeProductLayoutOf(c)
  const text = c.text_color || "#111111"
  if (kind === "grid") {
    return (
      <span className="mt-[7px] grid w-full grid-cols-2 gap-[7px]" data-theme-card-products="grid">
        {[0, 1].map((i) => (
          <span key={i} className="flex flex-col overflow-hidden" style={{ ...look, borderRadius: Math.min(Number(look.borderRadius) || 0, 6) }}>
            <span className="block aspect-[4/3] w-full" style={{ background: `color-mix(in srgb, ${ink} 24%, transparent)` }} />
            <span className="grid h-[9px] place-items-center"><span className="block h-[2px] w-[50%] rounded-full" style={{ background: ink, opacity: 0.8 }} /></span>
          </span>
        ))}
      </span>
    )
  }
  if (kind === "rows") {
    return (
      <span className="mt-[7px] flex w-full flex-col" data-theme-card-products="rows">
        {[0, 1].map((i) => (
          <span key={i} className="flex h-[13px] w-full items-center justify-between" style={{ borderBottom: `1px solid color-mix(in srgb, ${text} 22%, transparent)` }}>
            <span className="block h-[3px] w-[44%] rounded-full" style={{ background: text, opacity: 0.7 }} />
            <span className="block h-[7px] w-[18%]" style={{ background: c.button_color, borderRadius: 4 }} />
          </span>
        ))}
      </span>
    )
  }
  return null
}

export function ThemeCardBlocks({ c }: { c: CardConfig }) {
  return (
    <>
      <ThemeCardLinks c={c} />
      <CardProducts c={c} look={cardButtonLook(c)} ink={c.button_text_color || c.text_color || "#111111"} />
    </>
  )
}

function ThemeCardLinks({ c }: { c: CardConfig }) {
  const text = c.text_color || "#111111"
  const ink = c.button_text_color || text
  const look = cardButtonLook(c)
  const line = (w: string) => <span className="block h-[3px] rounded-full" style={{ width: w, background: ink, opacity: 0.8 }} />
  const layout = blockLayoutOf(c)

  if (layout === "grid") {
    return (
      <span className="mt-[11%] grid w-full grid-cols-2 gap-[7px]" data-theme-card-layout="grid">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="flex h-[28px] w-full flex-col items-center justify-center gap-[4px]" style={look}>
            <span className="block h-[7px] w-[7px] rounded-[2px]" style={{ background: ink, opacity: 0.55 }} />
            {line("54%")}
          </span>
        ))}
      </span>
    )
  }
  if (layout === "cards") {
    return (
      <span className="mt-[11%] flex w-full flex-col gap-[7px]" data-theme-card-layout="cards">
        <span className="flex h-[44px] w-full flex-col overflow-hidden" style={{ ...look, borderRadius: Math.min(Number(look.borderRadius) || 0, 7) }}>
          <span className="block min-h-0 flex-1" style={{ background: `color-mix(in srgb, ${ink} 22%, transparent)` }} />
          <span className="grid h-[13px] shrink-0 place-items-center">{line("40%")}</span>
        </span>
        <span className="grid h-[14px] w-full place-items-center" style={look}>{line("36%")}</span>
      </span>
    )
  }
  if (layout === "compact") {
    return (
      <span className="mt-[11%] flex w-full flex-col gap-[5px]" data-theme-card-layout="compact">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="grid h-[12px] w-full place-items-center" style={look}>{line("32%")}</span>
        ))}
      </span>
    )
  }
  return (
    <span className="mt-[11%] flex w-full flex-col gap-[7px]" data-theme-card-layout="list">
      {[0, 1, 2].map((i) => (
        <span key={i} className="grid h-[17px] w-full place-items-center" style={look}>{line("36%")}</span>
      ))}
    </span>
  )
}
