/**
 * The tips harness (scripts/check-onepage-tips-as.mjs): a OnePage tips block
 * in the real BlockSheetProvider, on a page in one of the shipped themes
 * (components/onepage/themes/r40-themes), with the page's sheet colours
 * (lib/onepage/sheet-theme sheetRootCss) as the live page writes them.
 *
 *   ?theme=gallery     the theme (any id of R40, R42, AP, W8, W9, W10)
 *   ?custom=0          visitors may not choose their own amount
 *   ?message=1         the block asks for a note
 *   ?currency=ron      the store's currency
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BlockSheetProvider } from "@/components/onepage/block-sheet"
import { AppBlock } from "@/components/onepage/app-block"
import { AP_THEMES, R40_THEMES, R42_THEMES, W10_THEMES, W8_THEMES, W9_THEMES } from "@/components/onepage/themes/r40-themes"
import { sheetPalette, sheetRootCss } from "@/lib/onepage/sheet-theme"
import { defaultTheme, type OnePageBlock, type OnePageTheme } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
const all = [...R40_THEMES, ...R42_THEMES, ...AP_THEMES, ...W8_THEMES, ...W9_THEMES, ...W10_THEMES] as Array<{ id: string; theme_config: Record<string, unknown> }>
const picked = all.find((t) => t.id === (params.get("theme") || "gallery")) ?? all[0]
const theme = { ...defaultTheme, ...picked.theme_config } as OnePageTheme
document.body.style.background = String(theme.background_color || "#fff")
document.body.style.color = String(theme.text_color || "#111")
document.body.style.fontFamily = String(theme.font_family || "Inter, sans-serif")

const block: OnePageBlock = {
  id: "tips1",
  type: "app",
  enabled: true,
  sort_order: 0,
  data: {
    provider: "tips",
    title: "Buy me a coffee",
    subtitle: "Every tip goes into the next record.",
    tip_mode: "storelib",
    tip_amounts: params.get("currency") === "ron" ? [1000, 2000, 5000] : [500, 1000, 2000],
    tip_custom: params.get("custom") !== "0",
    tip_message: params.get("message") === "1",
    tip_ready: true,
    tip_currency: params.get("currency") || "usd",
  } as never,
}

function Page() {
  const look = { theme, scale: "live" as const, onepageId: "00000000-0000-4000-8000-000000000001", sellerId: null }
  return (
    <main style={{ width: "calc(100% - 32px)", maxWidth: 520, margin: "28px auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 style={{ textAlign: "center", fontSize: 22, fontWeight: 700, fontFamily: String(theme.title_font || theme.font_family || "inherit") }}>{picked.id}</h1>
      <div data-probe="tips">
        <AppBlock block={block} look={look} />
      </div>
    </main>
  )
}

const dark = sheetPalette(theme).dark
const style = document.createElement("style")
style.textContent = sheetRootCss(theme)
document.head.appendChild(style)
createRoot(document.getElementById("app")!).render(
  <BlockSheetProvider dark={dark} theme={theme}>
    <Page />
  </BlockSheetProvider>,
)
