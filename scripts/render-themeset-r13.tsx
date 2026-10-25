/**
 * The pages scripts/check-themeset-r13-fonts.mjs looks at, each drawn with
 * one font from the address (?font=Fraunces):
 *
 *   view=site      a website's front page as the published page draws it:
 *                  ThemePage (which renders the fonts' stylesheet link,
 *                  lib/website-builder/font-link.ts) around the theme
 *                  engine's sections, the font as the heading and the body
 *   view=onepage   a OnePage as the live route draws it (PublicOnePage,
 *                  with its OnePageFonts links), the font as the page font
 *                  and the title font
 *   view=preview   the same OnePage as the editor's preview draws it, in
 *                  its own frame (/onepage-preview, OnePagePreviewDocument)
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePageProvider } from "@/lib/onepage/context"
import * as Preview from "@/components/onepage/phone-preview"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { fontStack } from "@/lib/onepage/fonts"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "site"
const font = params.get("font") || "Inter"
const root = createRoot(document.getElementById("app")!)

if (location.pathname.startsWith("/onepage-preview")) {
  /* The editor preview's own frame, as app/onepage-preview renders it: the page comes from the editor by message. */
  root.render(<OnePagePreviewDocument />)
} else if (view === "site") {
  const theme = { font_heading: font, font_body: font, font_accent: "" } as unknown as ThemeSettingsValues
  const preset = (type: string) => STORELIB_SCHEMAS[type]?.presets?.[0]
  const section = (id: string, type: string, settings: Record<string, unknown>): SectionInstance =>
    ({ id, type, name: type, settings: { ...(preset(type)?.settings ?? {}), ...settings }, blocks: (preset(type)?.blocks ?? []) as SectionInstance["blocks"] }) as SectionInstance
  const chrome = [section("hdr", "header", { logo_text: "Pale Hours", logo_mode: "text", header_sticky: false })]
  const body = [
    section("hero", "hero_centered", { heading: `${font}: quiet shapes, made well`, subheading: "Heavy cotton, garment dyed, cut in Lisbon. Ąę łó, ãõ ç, ăîș ț, ß ü." }),
    section("story", "text_rich", { heading: "The story", body: "<p>Every piece is made in small runs. Zażółć gęślą jaźń. Ação, coração. Știință.</p>" }),
  ]
  const drawn = body.map((s) => ({ s, r: renderStorelibSection(s, theme, { template: "index" }, undefined, []) }))
  root.render(
    <StorelibLiveProvider sources={{}} inEditor={false} products={[]}>
      <SiteCartProvider shopId={undefined}>
        <ThemePage theme={theme} sections={chrome} storefront={{}}>
          {drawn.map(({ s, r }) => (r.ok ? (
            <div key={s.id} id={`section-${s.id}`}>
              <style dangerouslySetInnerHTML={{ __html: r.css }} />
              <div dangerouslySetInnerHTML={{ __html: r.html }} />
            </div>
          ) : <pre key={s.id}>{JSON.stringify(r)}</pre>))}
        </ThemePage>
      </SiteCartProvider>
    </StorelibLiveProvider>,
  )
} else {
  /* The value the Design tab writes for the font (components/onepage/tabs/design-tab.tsx FONTS). */
  const value = fontStack(font)
  let order = 0
  const b = (type: string, data: Record<string, unknown>) => ({ id: `${type}_${order}`, type, enabled: true, sort_order: order++, data }) as any
  const page = {
    id: "op_fonts", owner_id: "probe-user", slug: "fonts", title: `${font} Studio`, bio: "Prints, posters and a newsletter. Zażółć gęślą jaźń.",
    avatar_url: null, theme: { ...defaultTheme, font_family: value, title_font: value }, settings: { ...defaultSettings },
    seller_id: "seller_fonts", social_links: {}, status: "published", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", onboarding_completed: true,
    draft_blocks: [
      b("header", { show_avatar: false, show_name: true, show_bio: true }),
      b("heading", { text: "Work with me", size: "medium", alignment: "center" }),
      b("link_button", { label: "Shop the prints", url: "https://example.com/shop" }),
      b("text", { content: "Ação, coração, Știință, ß ü.", alignment: "center" }),
    ],
  } as unknown as OnePage
  try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}
  if (view === "preview") {
    const Mobile = (Preview as any).MobilePreviewContent as React.ComponentType
    root.render(
      <OnePageProvider initialOnePage={page}>
        <div className="flex flex-col" style={{ position: "fixed", inset: 0 }} data-fonts-preview="">
          <Mobile />
        </div>
      </OnePageProvider>,
    )
  } else {
    const shape = publicOnePage(page as any, { source: "published" })
    root.render(<PublicOnePage onepage={shape as any} />)
  }
}
