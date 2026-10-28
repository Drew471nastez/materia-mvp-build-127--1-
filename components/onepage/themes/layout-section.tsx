"use client"

/**
 * ===========================================================================
 *  DESIGN › LAYOUT: HOW THE BLOCKS SIT, HOW FAR APART, AND THE TOP BUTTONS
 * ===========================================================================
 * Round 40. The owner: "We can create multiple layouts of how the blocks
 * display", "in Design, add a little more of what's necessary and missing",
 * and "In settings, why are subscribe and share design (glass, white,
 * black) there? That should be controlled from Design."
 *
 *   Blocks        List, Grid, Cards or Compact (lib/onepage/theme-layout).
 *                 Each card is drawn in this page's own wallpaper and
 *                 buttons, as the theme cards draw a theme. A theme sets one;
 *                 this changes it for this page. Compact also makes the
 *                 buttons Small, and leaving it puts them back to Medium, so
 *                 the Buttons panel always says what the page shows.
 *   Space         the gap between blocks (theme.spacing, as it always was).
 *                 The Compact layout has its own tight gap, so it is not
 *                 offered there.
 *   Products      round 42: each product block as it is set, or every one
 *                 left as the Callout drawn as tiles two to a row (Grid) or
 *                 as list rows (Rows). A layout picked on a block stays.
 *   Header        the classic header centred or flush left, and, when the
 *                 theme brings a cover picture, a way to take it off.
 *   Share and     glass, white or black, the same two settings fields
 *   Subscribe     (settings.share_style, settings.subscribe_style) the
 *                 Settings tab used to set. Settings keeps the switches.
 */
import type * as React from "react"
import { useOnePage } from "@/lib/onepage/context"
import { tt } from "@/lib/i18n/text"
import { buttonStyleOf, type ButtonStyle } from "@/lib/onepage/settings-rules"
import { BLOCK_LAYOUTS, blockLayoutOf, blockSpacingOf, coverImageOf, headerAlignOf, layoutUpdates, themeProductLayoutOf, type BlockLayout, type BlockSpacing, type HeaderAlign, type ThemeProductLayout } from "@/lib/onepage/theme-layout"
import { ChoiceCard, PanelSection, SectionTitle, Segmented, SettingRow } from "@/components/onepage/editor-kit"
import { ThemeCardBlocks } from "@/components/onepage/themes/theme-card-blocks"

const LAYOUT_LABEL: Record<BlockLayout, () => string> = {
  list: () => tt("List"),
  grid: () => tt("Grid"),
  cards: () => tt("Cards"),
  compact: () => tt("Compact"),
}

export function LayoutSection() {
  const { onepage, updateTheme, updateSettings } = useOnePage()
  if (!onepage) return null
  const { theme, settings } = onepage
  const t = theme as unknown as Record<string, unknown>
  const layout = blockLayoutOf(t)
  const spacing = blockSpacingOf(t)
  const align = headerAlignOf(t)
  const hero = t.header_layout === "hero"
  const cover = coverImageOf(t)
  const pageBg = theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color || "#f7f7f8"
  const s = settings as unknown as Record<string, unknown>
  const shareOn = s.share_enabled !== false
  const subscribeOn = s.subscribe_enabled !== false
  const styleOptions = [
    { id: "glass" as const, label: tt("Glass") },
    { id: "white" as const, label: tt("White") },
    { id: "black" as const, label: tt("Black") },
  ]

  return (
    <div data-design-layout="">
      <PanelSection>
        <SectionTitle title={tt("Blocks")} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BLOCK_LAYOUTS.map((id) => (
            <ChoiceCard
              key={id}
              selected={layout === id}
              onClick={() => {
                const u = layoutUpdates(t, id)
                if (u) updateTheme(u as never)
              }}
              label={LAYOUT_LABEL[id]()}
            >
              <span
                aria-hidden
                data-layout-sample={id}
                className="flex h-[92px] items-center justify-center overflow-hidden rounded-xl px-[14%] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)] [&>span]:mt-0"
                style={{ background: pageBg } as React.CSSProperties}
              >
                <ThemeCardBlocks c={{ ...t, block_layout: id }} />
              </span>
            </ChoiceCard>
          ))}
        </div>
      </PanelSection>

      {layout !== "compact" ? (
        <PanelSection>
          <SettingRow label={tt("Space between blocks")} stackOnPhone>
            <Segmented
              className="w-full sm:w-[300px]"
              label={tt("Space between blocks")}
              value={spacing}
              options={[{ id: "compact", label: tt("Tight") }, { id: "normal", label: tt("Normal") }, { id: "comfortable", label: tt("Roomy") }] as { id: BlockSpacing; label: string }[]}
              onChange={(id) => updateTheme({ spacing: id })}
            />
          </SettingRow>
        </PanelSection>
      ) : null}

      <PanelSection>
        <SettingRow label={tt("Products")} description={tt("How product blocks show on the page")} stackOnPhone>
          <Segmented
            className="w-full sm:w-[300px]"
            label={tt("How products show")}
            value={themeProductLayoutOf(t)}
            options={[{ id: "own", label: tt("As set") }, { id: "grid", label: tt("Grid") }, { id: "rows", label: tt("Rows") }] as { id: ThemeProductLayout; label: string }[]}
            onChange={(id) => updateTheme({ product_layout: id === "own" ? null : id } as never)}
          />
        </SettingRow>
      </PanelSection>

      {hero ? null : (
        <PanelSection>
          {cover ? (
            <SettingRow label={tt("Cover picture")} description={tt("The wide picture at the top of your page")} stackOnPhone>
              <button
                type="button"
                data-layout-cover-remove=""
                onClick={() => updateTheme({ cover_image_url: null } as never)}
                className="h-10 w-full cursor-pointer rounded-xl border border-[#e3e4e8] bg-white px-4 text-[13.5px] font-medium text-[#1a1a2e] sm:w-auto"
              >
                {tt("Remove cover")}
              </button>
            </SettingRow>
          ) : null}
          <div className={cover ? "mt-4" : undefined}>
          <SettingRow label={tt("Header")} description={tt("Your picture, name, bio and social icons")} stackOnPhone>
            <Segmented
              className="w-full sm:w-[220px]"
              label={tt("Header alignment")}
              value={align}
              options={[{ id: "center", label: tt("Centred") }, { id: "left", label: tt("Left") }] as { id: HeaderAlign; label: string }[]}
              onChange={(id) => updateTheme({ header_align: id })}
            />
          </SettingRow>
          </div>
        </PanelSection>
      )}

      <PanelSection>
        <SectionTitle title={tt("Share and Subscribe")} description={tt("The two round buttons at the top of your page")} />
        {shareOn || subscribeOn ? (
          <div className="space-y-4">
            {shareOn ? (
              <SettingRow label={tt("Share")} stackOnPhone>
                <Segmented
                  className="w-full sm:w-[300px]"
                  label={tt("Share button style")}
                  value={buttonStyleOf(s.share_style, "white")}
                  options={styleOptions as { id: ButtonStyle; label: string }[]}
                  onChange={(id) => updateSettings({ share_style: id })}
                />
              </SettingRow>
            ) : null}
            {subscribeOn ? (
              <SettingRow label={tt("Subscribe")} stackOnPhone>
                <Segmented
                  className="w-full sm:w-[300px]"
                  label={tt("Subscribe button style")}
                  value={buttonStyleOf(s.subscribe_style, "glass")}
                  options={styleOptions as { id: ButtonStyle; label: string }[]}
                  onChange={(id) => updateSettings({ subscribe_style: id })}
                />
              </SettingRow>
            ) : null}
          </div>
        ) : (
          <p className="text-[13.5px] text-[#6b7280]" data-layout-buttons-off="">{tt("Both are turned off in Settings.")}</p>
        )}
      </PanelSection>
    </div>
  )
}
