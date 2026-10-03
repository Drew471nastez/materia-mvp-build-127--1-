"use client"

// Map embed: the address as a map, a Google Maps link, or a raw iframe.
// The raw iframe is rendered via dangerouslySetInnerHTML because it
// comes from the creator's own settings.

import { MapPin, Phone, Mail, Clock } from "lucide-react"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"
import { useMemo } from "react"
import { mapEmbedSrc } from "@/lib/website-builder/map-embed"

export function MapEmbedSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const panelBg = str(s.panel_bg_color) || c.background_secondary
  const accent = str(s.accent_color) || c.accent
  const height = typeof s.map_height === "number" ? s.map_height : 450
  const radius = typeof s.border_radius === "number" ? s.border_radius : 12
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const layout = str(s.layout, "map_right")
  const showInfo = bool(s.show_info_panel, true)

  const embedCode = str(s.embed_code)
  /* Its own object, kept while the code is unchanged: a new one each render
     rewrote the embed and reloaded its iframe on every edit. See ../stable-html. */
  const embedHtml = useMemo(() => ({ __html: embedCode }), [embedCode])
  /* The address is the map; a link is only for pointing somewhere else. See lib/website-builder/map-embed.ts. */
  const embedUrl = mapEmbedSrc(s.embed_url, [s.address_line1, s.address_line2, s.city_state_zip, s.country])
  const mapBlock = embedCode ? (
    <div
      className="w-full overflow-hidden"
      style={{ height, borderRadius: radius }}
      dangerouslySetInnerHTML={embedHtml}
    />
  ) : embedUrl ? (
    <iframe
      src={embedUrl}
      className="w-full border-0"
      style={{ height, borderRadius: radius }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      title="Map"
    />
  ) : (
    <div
      className="w-full flex items-center justify-center text-sm opacity-60 border-2 border-dashed border-current"
      style={{ height, borderRadius: radius }}
    >
      Add an address to show it on a map.
    </div>
  )

  const infoBlock = (
    <div className="p-6" style={{ background: panelBg, borderRadius: radius }}>
      {!!s.heading && <h2 className="text-2xl font-bold mb-2">{str(s.heading)}</h2>}
      {!!s.subheading && <p className="text-sm opacity-70 mb-5">{str(s.subheading)}</p>}
      <div className="space-y-3 text-sm">
        {!!s.address_line1 && (
          <div className="flex gap-3">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accent }} />
            <div>
              <div>{str(s.address_line1)}</div>
              {!!s.address_line2 && <div>{str(s.address_line2)}</div>}
              {!!s.city_state_zip && <div>{str(s.city_state_zip)}</div>}
              {!!s.country && <div>{str(s.country)}</div>}
            </div>
          </div>
        )}
        {!!s.phone && (
          <div className="flex gap-3 items-center">
            <Phone className="w-4 h-4 shrink-0" style={{ color: accent }} />
            <a href={`tel:${str(s.phone)}`}>{str(s.phone)}</a>
          </div>
        )}
        {!!s.email && (
          <div className="flex gap-3 items-center">
            <Mail className="w-4 h-4 shrink-0" style={{ color: accent }} />
            <a href={`mailto:${str(s.email)}`}>{str(s.email)}</a>
          </div>
        )}
        {!!s.hours && (
          <div className="flex gap-3">
            <Clock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accent }} />
            <pre className="whitespace-pre-wrap font-sans text-sm">{str(s.hours)}</pre>
          </div>
        )}
      </div>
      {!!s.directions_url && (
        <a
          href={str(s.directions_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-5 px-4 py-2 text-sm font-semibold rounded"
          style={{ background: accent, color: "#fff" }}
        >
          {str(s.directions_text, "Get directions")}
        </a>
      )}
    </div>
  )

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-(--theme-page-width) mx-auto px-(--theme-padding-x)" style={{ color, paddingTop: padTop, paddingBottom: padBottom }}>
        {layout === "full" ? (
          mapBlock
        ) : layout === "info_above" ? (
          <div className="space-y-6">
            {showInfo && infoBlock}
            {mapBlock}
          </div>
        ) : (
          <div className={`grid gap-6 @[768px]:grid-cols-2 ${layout === "map_left" ? "" : ""}`}>
            {layout === "map_left" ? <>{mapBlock}{showInfo && infoBlock}</> : <>{showInfo && infoBlock}{mapBlock}</>}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default MapEmbedSection
