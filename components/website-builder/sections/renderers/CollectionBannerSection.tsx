"use client"

// Collection banner — a banner-top/left/right/none hero for a
// product collection listing. The actual product grid is the
// responsibility of a separate `collection_list` or `product_list`
// section placed below.

import { sectionColors, str, bool, SectionWrapper, hexToRgba, type SectionProps } from "../_shared"
import { siteImageProps } from "@/lib/website-builder/site-image"

export function CollectionBannerSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = str(s.bg_color) || c.bg
  const textColor = str(s.text_color, "#ffffff")
  const overlayColor = str(s.overlay_color, "#000000")
  const overlayOp = typeof s.overlay_opacity === "number" ? s.overlay_opacity : 30
  const heroImage = str(s.hero_image)
  const heroAlt = str(s.hero_image_alt, "Collection")
  const layout = str(s.layout, "banner-top")
  const height = typeof s.banner_height === "number" ? s.banner_height : 400
  const position = str(s.text_position, "center")
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 0
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 0
  const badgeBg = str(s.badge_color) || c.primary_btn_bg
  const badgeText = str(s.badge_text_color) || c.primary_btn_text

  const bannerContent = (
    <div className="relative w-full overflow-hidden" style={{ minHeight: height }}>
      {heroImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={heroImage} {...siteImageProps(heroImage)} alt={heroAlt} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-600 to-neutral-800" />
      )}
      <div className="absolute inset-0" style={{ background: hexToRgba(overlayColor, overlayOp / 100) }} />
      <div
        className={`relative flex flex-col justify-center gap-3 p-10 @[768px]:p-14 min-h-[400px] ${
          position === "left" ? "items-start text-left" : position === "right" ? "items-end text-right" : "items-center text-center"
        }`}
        style={{ color: textColor, minHeight: height }}
      >
        {!!s.badge_text && (
          <span className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded" style={{ background: badgeBg, color: badgeText }}>
            {str(s.badge_text)}
          </span>
        )}
        {!!s.collection_name && (
          <h1 className="text-4xl @[768px]:text-5xl font-bold">{str(s.collection_name)}</h1>
        )}
        {!!s.description && (
          <p className="max-w-xl opacity-95">{str(s.description)}</p>
        )}
        {bool(s.show_product_count, true) && !!s.product_count_text && (
          <p className="text-sm opacity-80">{str(s.product_count_text)}</p>
        )}
      </div>
    </div>
  )

  const filters = (bool(s.show_filters, true) || bool(s.show_sort, true)) && (
    <div
      className={
        str(s.filter_style, "pills") === "sidebar"
          ? "max-w-(--theme-page-width) mx-auto px-(--theme-padding-x) py-6 flex items-start gap-6 text-sm"
          : "max-w-(--theme-page-width) mx-auto px-(--theme-padding-x) py-6 flex flex-wrap items-center gap-3 text-sm"
      }
    >
      {bool(s.show_filters, true) && (
        /**
         * Pills, dropdowns or a sidebar rail — the control offered all three
         * and always drew pills. A shop with fifteen filters and a "Sidebar"
         * setting got the same overflowing row of pills as everybody else.
         */
        str(s.filter_style, "pills") === "dropdowns" ? (
          <div className="flex flex-wrap gap-2">
            {["Size", "Color", "Price"].map(f => (
              <select
                key={f}
                className="rounded border px-3 py-1.5 text-sm"
                style={{ borderColor: "#e5e7eb" }}
                defaultValue=""
              >
                <option value="">{f}</option>
              </select>
            ))}
          </div>
        ) : str(s.filter_style, "pills") === "sidebar" ? (
          <div className="flex flex-col gap-2 pr-6">
            {["All", "New", "Sale", "Size", "Color"].map(f => (
              <span key={f} className="border-l-2 pl-3 text-sm" style={{ borderColor: "#e5e7eb" }}>
                {f}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {["All", "New", "Sale", "Size", "Color"].map(f => (
              <span key={f} className="px-3 py-1 rounded-full border" style={{ borderColor: "#e5e7eb" }}>{f}</span>
            ))}
          </div>
        )
      )}
      {bool(s.show_sort, true) && (
        <select className="ml-auto px-3 py-1.5 rounded border text-sm" style={{ borderColor: "#e5e7eb" }}>
          <option>Featured</option>
          <option>Newest</option>
          <option>Price, low to high</option>
          <option>Price, high to low</option>
        </select>
      )}
    </div>
  )

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
        {layout === "banner-top" ? (
          <>
            {bannerContent}
            {filters}
          </>
        ) : layout === "no-banner" ? (
          <div className="max-w-(--theme-page-width) mx-auto px-(--theme-padding-x) py-12">
            <h1 className="text-3xl font-bold mb-2">{str(s.collection_name)}</h1>
            {!!s.description && <p className="opacity-70">{str(s.description)}</p>}
            {filters}
          </div>
        ) : (
          <div className={`grid @[768px]:grid-cols-2 gap-0`}>
            {layout === "banner-right" ? <>{filters}{bannerContent}</> : <>{bannerContent}{filters}</>}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default CollectionBannerSection
